import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "react-i18next";
import { useSwipeable } from "react-swipeable";
import ExtrasModal from "../modals/ExtrasModal";
import DiscountModal from "../modals/DiscountModal";
import PaymentModal from "../modals/PaymentModal";
import { useHeader } from "../context/HeaderContext";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import MoveTableModal from "../components/MoveTableModal";
import MergeTableModal from "../components/MergeTableModal";
import { toCategorySlug } from "../utils/slugCategory"; 
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";
import { useAuth } from "../context/AuthContext";

const normalizeGroupKey = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
};

const normalizeExtrasGroupSelection = (raw) => {
  const ids = new Set();
  const names = new Set();

  const addId = (value) => {
    const num = Number(value);
    if (Number.isFinite(num)) ids.add(num);
  };

  const addName = (value) => {
    const norm = normalizeGroupKey(value);
    if (norm) names.add(norm);
  };

  const process = (entry) => {
    if (entry === null || entry === undefined) return;

    if (Array.isArray(entry)) {
      entry.forEach(process);
      return;
    }

    if (typeof entry === "object") {
      if (Array.isArray(entry.ids) || Array.isArray(entry.names)) {
        if (Array.isArray(entry.ids)) entry.ids.forEach(addId);
        if (Array.isArray(entry.names)) entry.names.forEach(addName);
      } else {
        if (entry.id !== undefined) addId(entry.id);
        addName(entry.group_name ?? entry.groupName ?? entry.name ?? entry.slug ?? entry.label ?? entry.title);
      }
      return;
    }

    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed) return;

      if (
        (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
        (trimmed.startsWith("{") && trimmed.endsWith("}"))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          process(parsed);
          return;
        } catch {
          // fallthrough
        }
      }

      if (trimmed.includes(",") || trimmed.includes(";")) {
        trimmed
          .split(/[;,]/)
          .map((part) => part.trim())
          .filter(Boolean)
          .forEach(process);
        return;
      }

      addId(trimmed);
      addName(trimmed);
      return;
    }

    if (typeof entry === "number") {
      addId(entry);
      return;
    }

    const asString = String(entry).trim();
    if (!asString) return;
    addId(asString);
    addName(asString);
  };

  process(raw);

  return {
    ids: Array.from(ids),
    names: Array.from(names),
  };
};
const paymentMethods = ["Cash", "Credit Card", "Sodexo", "Multinet"];
const categoryIcons = {
  Meat: "🍔",
  Pizza: "🍕",
  Drinks: "🥤",
  Salad: "🥗",
  Dessert: "🍰",
  Breakfast: "🍳",
  Chicken: "🍗",
  // Add more as needed
  // Default:
  default: "🍔"
};

export default function TransactionScreen() {
  useRegisterGuard();
  const { tableId, orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialOrder = location.state?.order || null;
    const { t } = useTranslation(); // ✅ Enable translations
  const restaurantSlug = typeof window !== "undefined"
    ? localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id")
    : null;
  const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";
  const [products, setProducts] = useState([]);
 const [selectedForPayment, setSelectedForPayment] = useState([]);
const [showDiscountModal, setShowDiscountModal] = useState(false);
const [discountType, setDiscountType] = useState("percent"); // "percent" or "fixed"
const [discountValue, setDiscountValue] = useState(10);
const [showMergeTableModal, setShowMergeTableModal] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(paymentMethods[0]);
  const [editingCartItemIndex, setEditingCartItemIndex] = useState(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const extrasGroupsPromiseRef = useRef(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [subOrders, setSubOrders] = useState([]);
  const [activeSplitMethod, setActiveSplitMethod] = useState(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
const orderType = order?.order_type || (orderId ? "phone" : "table");
  const safeProducts = Array.isArray(products) ? products : [];
  const categories = [...new Set(safeProducts.map((p) => p.category))].filter(Boolean);
const [excludedItems, setExcludedItems] = useState([]);
const [excludedCategories, setExcludedCategories] = useState([]);
const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
const activeCategory = categories[currentCategoryIndex] || "";
const productsInActiveCategory = safeProducts.filter(
  (p) =>
    (p.category || "").trim().toLowerCase() ===
    (activeCategory || "").trim().toLowerCase()
);
const hasExtras = (item) => Array.isArray(item.extras) && item.extras.length > 0;
const [categoryImages, setCategoryImages] = useState({});
// Calculate extras total and final price in the Add to Cart modal
const validExtras = selectedExtras.filter(ex => ex.quantity > 0);
const extrasPricePerProduct = validExtras.reduce(
  (sum, ex) => sum + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
  0
);
const basePrice = selectedProduct ? parseFloat(selectedProduct.price) || 0 : 0;
const quantity = selectedProduct ? selectedProduct.quantity || 1 : 1;
const perItemTotal = basePrice + extrasPricePerProduct;
const fullTotal = perItemTotal * quantity;
  const { setHeader } = useHeader();
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

  const [showMoveTableModal, setShowMoveTableModal] = useState(false);
  const { currentUser } = useAuth();
// 1. Add drinksList state at the top
const [drinksList, setDrinksList] = useState([]);

  const fetchExtrasGroupsOnce = useCallback(async () => {
    const data = await secureFetch(`/extras-groups${identifier}`);
    const normalized = (Array.isArray(data) ? data : []).map((g) => ({
      id: g.id,
      group_name: g.group_name || g.groupName,
      groupName: g.group_name || g.groupName,
      items:
        typeof g.items === "string"
          ? (() => {
              try {
                return JSON.parse(g.items);
              } catch {
                return [];
              }
            })()
          : g.items || [],
    }));
    setExtrasGroups(normalized);
    return normalized;
  }, [identifier]);

  const ensureExtrasGroups = useCallback(async () => {
    if (extrasGroups.length > 0) return extrasGroups;
    if (extrasGroupsPromiseRef.current) return extrasGroupsPromiseRef.current;

    const loadPromise = fetchExtrasGroupsOnce()
      .then((result) => {
        extrasGroupsPromiseRef.current = null;
        return result;
      })
      .catch((err) => {
        extrasGroupsPromiseRef.current = null;
        throw err;
      });

    extrasGroupsPromiseRef.current = loadPromise;
    return loadPromise;
  }, [extrasGroups, fetchExtrasGroupsOnce]);

  const getMatchedExtrasGroups = useCallback(
    async (selection) => {
      if (!selection || (selection.ids.length === 0 && selection.names.length === 0)) {
        return null;
      }

      let groupsSource = extrasGroups;
      if (!Array.isArray(groupsSource) || groupsSource.length === 0) {
        try {
          groupsSource = await ensureExtrasGroups();
        } catch (err) {
          console.error("❌ Failed to ensure extras groups:", err);
          groupsSource = extrasGroups;
        }
      }

      const safeGroups = Array.isArray(groupsSource) ? groupsSource : [];
      const matchedGroups = safeGroups
        .filter((group) => {
          const groupId = Number(group.id);
          const groupNameKey = normalizeGroupKey(group.group_name ?? group.groupName ?? group.name);
          const idMatch = selection.ids.some((id) => Number(id) === groupId);
          const nameMatch = groupNameKey && selection.names.includes(groupNameKey);
          return idMatch || nameMatch;
        })
        .map((group) => ({
          ...group,
          items: Array.isArray(group.items)
            ? group.items.map((item) => ({
                ...item,
              }))
            : [],
        }));

      if (matchedGroups.length === 0) {
        return null;
      }

      const matchedIds = matchedGroups
        .map((group) => Number(group.id))
        .filter((id) => Number.isFinite(id));
      const matchedNames = matchedGroups
        .map((group) => normalizeGroupKey(group.group_name ?? group.groupName ?? group.name))
        .filter(Boolean);

      return {
        matchedGroups,
        matchedIds,
        matchedNames,
      };
    },
    [extrasGroups, ensureExtrasGroups]
  );

useEffect(() => {
  if (!order?.id) return;

  const onMerged = (payload) => {
    if (payload?.order?.id === order.id) {
      // re-fetch suborders/history for this order
      fetchSubOrders(order.id);   // <-- your existing loader
      // (Optional) also refresh header/total if you don’t already
      fetchOrder(order.id);
    }
  };

  socket.on("order_merged", onMerged);
  return () => socket.off("order_merged", onMerged);
}, [order?.id]);

useEffect(() => {
 secureFetch("/drinks")
  .then(data => setDrinksList(data.map(d => d.name)))
  .catch(() => setDrinksList([]));

}, []);

  useEffect(() => {
    ensureExtrasGroups().catch((err) => {
      console.error("❌ Failed to load extras groups:", err);
    });
  }, [ensureExtrasGroups]);

// 2. Utility to split drink extras
function splitDrinkExtras(extras, drinksList) {
  const drinksLower = drinksList.map(d => d.replace(/[\s\-]/g, "").toLowerCase());
  const drinkExtras = [];
  const otherExtras = [];
  for (const ex of extras) {
    const norm = (ex.name || "").replace(/[\s\-]/g, "").toLowerCase();
    if (drinksLower.includes(norm)) {
      drinkExtras.push(ex);
    } else {
      otherExtras.push(ex);
    }
  }
  return [drinkExtras, otherExtras];
}
const imgForCategory = (category) => {
  // category can be an object or a string depending on your code
  const slug = toCategorySlug(category);
  return categoryImages[slug] || CATEGORY_FALLBACK_IMAGE;
};
// 3. In the handler for confirming product+extras (after ExtrasModal, or wherever you call addToCart with extras)
const handleAddProductWithExtras = (product, selectedExtras) => {
  const [drinkExtras, otherExtras] = splitDrinkExtras(selectedExtras, drinksList);

  if (otherExtras.length > 0) {
    addToCart({
      ...product,
      extras: otherExtras,
    });
  }
  if (drinkExtras.length > 0) {
    drinkExtras.forEach(drink => {
      const matchedDrink = safeProducts.find(p =>
        p.name.trim().toLowerCase() === drink.name.trim().toLowerCase()
      );
      if (!matchedDrink) return;
      addToCart({
        ...matchedDrink,
        name: drink.name,
        quantity: drink.quantity || 1,
        price: parseFloat(drink.price || matchedDrink.price),
        extras: [],
        note: "",
      });
    });
  }
  setShowExtrasModal(false);
};

useEffect(() => {
  if (!order) return;

  const name = order.customer_name?.trim() || "";
  const phone = order.customer_phone?.trim() || "";
  const address = order.customer_address?.trim() || "";

  const status = (order.status || "").toLowerCase();
  const showCustomerInfo =
    !!orderId && ["confirmed", "paid", "closed"].includes(status);

  // ✅ Combine cleanly and safely
  const subtitleText = showCustomerInfo
    ? [name, phone ? `📞 ${phone}` : null, address ? `📍 ${address}` : null]
        .filter(Boolean)
        .join("   ")
    : "";

  const headerTitle = orderId
    ? order.order_type === "packet"
      ? t("Packet")
      : order.customer_name || order.customer_phone || t("Phone Order")
    : `${t("Table")} ${tableId}`;

  setHeader({
    title: headerTitle,
    subtitle: subtitleText || undefined,
    tableNav: !orderId ? (
      <TableNavigationRow
        tableId={tableId}
        navigate={navigate}
        t={t}
        cartMode={false}
      />
    ) : null,
  });

  return () => setHeader({});
}, [orderId, order, tableId, t, navigate, setHeader]);


useEffect(() => {
  const restaurantSlug =
    localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
  const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";

  secureFetch(`/category-images${identifier}`)
    .then((data) => {
      const dict = {};
      (Array.isArray(data) ? data : []).forEach(({ category, image }) => {
        const key = (category || "").trim().toLowerCase();
        if (!key || !image) return;
        dict[key] = image;
      });
      setCategoryImages(dict);
    })
    .catch((err) => {
      console.error("❌ Failed to load category images:", err);
      setCategoryImages({});
    });
}, []);



// At the top inside TransactionScreen()
const handleQuickDiscount = () => {
  // TODO: open your discount modal, or show a toast for now
  setToast({ show: true, message: t("Quick Discount is coming soon!") });
};

const handleOpenCashRegister = () => {
  // TODO: open your register modal, or show a toast for now
  setToast({ show: true, message: t("Open Cash Register is coming soon!") });
};

// Returns the total after discount is applied
function calculateDiscountedTotal() {
  const subtotal = cartItems.filter(i => !i.paid).reduce((sum, i) => {
  const base = i.price * i.quantity;
  const extras = (i.extras || []).reduce((s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)), 0) * i.quantity;
  return sum + base + extras;
}, 0)
;
  if (discountType === "percent") {
    return subtotal - (subtotal * (discountValue / 100));
  }
  if (discountType === "fixed") {
    return Math.max(0, subtotal - discountValue);
  }
  return subtotal;
}

const swipeHandlers = useSwipeable({
  onSwipedLeft: () => {
    if (currentCategoryIndex < categories.length - 1) {
      setCurrentCategoryIndex((prev) => prev + 1);
    }
  },
  onSwipedRight: () => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex((prev) => prev - 1);
    }
  },
  trackMouse: true, // also allow swiping with mouse
});
  const handleCreatePhoneOrder = (order) => {
  navigate(`/transaction/phone/${order.id}`, { state: { order } });
};

useEffect(() => {
  if (categories.length > 0) {
    setCurrentCategoryIndex(0);
  }
}, [categories.length]);

useEffect(() => {
 secureFetch(`/kitchen/compile-settings${identifier}`)
  .then(data => {

      setExcludedItems(data.excludedItems || []);
      setExcludedCategories(data.excludedCategories || []);
    });
}, []);

useEffect(() => {
  if (!window.socket) return;
  window.socket.on("item_paid", (data) => {
    if (window && typeof window.playPaidSound === "function") window.playPaidSound();
  });
  return () => {
    if (!window.socket) return;
    window.socket.off("item_paid");
  };
}, []);

  const safeParseExtras = (extras) => {
    try {
      if (Array.isArray(extras)) return extras;
      if (typeof extras === "string" && extras.trim() !== "") {
        const parsed = JSON.parse(extras);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (err) {
      console.error("❌ Error parsing extras:", err);
      return [];
    }
  };
    // --- New split payment state ---
  const [splits, setSplits] = useState({
    Cash: 0,
    "Credit Card": 0,
    Sodexo: 0,
    Multinet: 0,
  });


// New: payment confirm with splits (cleaned)
const confirmPaymentWithSplits = async (splits) => {
  try {
    // 1) Use the discounted total shown to the user
    const totalDue = calculateDiscountedTotal();

    // 2) Generate a receipt id once (backend can also create one if omitted)
    const receiptId = uuidv4();

    // 3) Prepare items (include unique_id so backend can mark them paid)
    const enhancedItems = cartItems.map((i) => ({
      ...i,
      product_id: i.product_id || i.id,
      quantity: i.quantity,
      price: i.price,
      ingredients: i.ingredients,
      extras: (i.extras || []).map(ex => ({
   ...ex,
   amount: Number(ex.amount) || 1,
   unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase()
 })),
      unique_id: i.unique_id,
      payment_method: null,
      receipt_id: receiptId,
      confirmed: true,
      discountType: discountValue > 0 ? discountType : null,
      discountValue: discountValue > 0 ? discountValue : 0,
    }));

    // 4) Create the sub-order and mark items paid (server’s default mark_paid = true)
const rSub = await secureFetch(`/orders/sub-orders${identifier}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    order_id: order.id,
    total: totalDue,
    payment_method: "Split",
    receipt_id: receiptId,
    items: enhancedItems,
  }),
});

// ✅ secureFetch already throws if not OK — no need to recheck
if (!rSub?.sub_order_id) {
  throw new Error("Sub-order creation failed: Missing sub_order_id");
}


    // 5) Clean the splits payload (REMOVE undefined/empty/zero)
    const cleanedSplits = Object.fromEntries(
      Object.entries(splits)
        .map(([k, v]) => [k, String(v ?? "").trim()])
        .filter(([_, v]) => v !== "" && !isNaN(parseFloat(v)) && parseFloat(v) > 0)
    );

    // Optional guard: ensure sum equals total
    const sumSplits = Object.values(cleanedSplits)
      .reduce((s, v) => s + parseFloat(v), 0);
    if (Math.abs(sumSplits - totalDue) > 0.005) {
      throw new Error("Split amounts must equal the total.");
    }

    // 6) Save receipt methods ONCE (remove the earlier { [method]: total } post)
const rMethods = await secureFetch(`/orders/receipt-methods${identifier}`, {
  method: "POST",
  body: JSON.stringify({
    order_id: order.id,
    receipt_id: receiptId,
    methods: cleanedSplits,
  }),
});
if (!rMethods) throw new Error("Failed to save receipt methods");


    // 7) UI updates
    await new Promise((r) => setTimeout(r, 100));
    if (window && typeof window.playPaidSound === "function") window.playPaidSound();

    await refreshReceiptAfterPayment();
    await fetchOrderItems(order.id);
    await fetchSubOrders();
    setSelectedForPayment([]);
    setShowPaymentModal(false);

    // 8) If all items are paid, mark order as paid
const allItems = await secureFetch(`/orders/${order.id}/items${identifier}`);

if (Array.isArray(allItems) && allItems.every((item) => item.paid_at)) {
 await secureFetch(`/orders/${order.id}/status${identifier}`, {
    method: "PUT",
    body: JSON.stringify({
      status: "paid",
      total: totalDue,
      payment_method: Object.keys(cleanedSplits).join("+"),
    }),
  });
  setOrder((prev) => ({ ...prev, status: "paid" }));
}

  } catch (err) {
    console.error("❌ confirmPaymentWithSplits failed:", err);
    // optionally toast
  }
};

function TableNavigationRow({ tableId, navigate, t, cartMode }) {
  return (
    <div className={`flex items-center justify-center w-full ${cartMode ? "gap-4 py-2" : "gap-2 md:gap-6 py-2"}`}>
      {/* Prev Table Arrow */}
      <button
        onClick={() => {
          const prev = Math.max(1, Number(tableId) - 1);
          if (Number(tableId) !== prev) navigate(`/transaction/${prev}`);
        }}
        className={`rounded-full shadow border flex items-center justify-center transition
          ${cartMode
            ? "w-8 h-8 text-base bg-white/70 dark:bg-zinc-900/70 border-blue-100 dark:border-zinc-700"
            : "w-9 h-9 text-lg bg-white/60 dark:bg-zinc-900/60 border-blue-100 dark:border-zinc-700"
          }`}
        title={t('Previous Table')}
        disabled={Number(tableId) <= 1}
      >
        <svg viewBox="0 0 20 20" fill="none" className={cartMode ? "w-4 h-4" : "w-5 h-5"} stroke="currentColor" strokeWidth="2">
          <path d="M13 16l-5-5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {/* Table Button */}
<button
  onClick={() => navigate("/tables")}
  className={`font-bold rounded-xl shadow border transition flex items-center gap-2
    px-1 md:px-3 py-2 text-base bg-gradient-to-br from-white/80 via-blue-50/80 to-blue-200/60 text-blue-800 border-blue-200 dark:border-zinc-700`}
  style={{ minWidth: 8, margin: "2 14px" }}
  title={t("Go to Table Overview")}
>
  <span className="text-inherit">{t("Back")}</span>

</button>



      {/* Next Table Arrow */}
      <button
        onClick={() => {
          const next = Math.min(20, Number(tableId) + 1);
          if (Number(tableId) !== next) navigate(`/transaction/${next}`);
        }}
        className={`rounded-full shadow border flex items-center justify-center transition
          ${cartMode
            ? "w-8 h-8 text-base bg-white/70 dark:bg-zinc-900/70 border-blue-100 dark:border-zinc-700"
            : "w-9 h-9 text-lg bg-white/60 dark:bg-zinc-900/60 border-blue-100 dark:border-zinc-700"
          }`}
        title={t('Next Table')}
        disabled={Number(tableId) >= 20}
      >
        <svg viewBox="0 0 20 20" fill="none" className={cartMode ? "w-4 h-4" : "w-5 h-5"} stroke="currentColor" strokeWidth="2">
          <path d="M7 4l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button
        onClick={() => setShowMoveTableModal(true)}
        className="ml-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-400 to-teal-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-500 hover:to-teal-500"
      >
        <span className="text-base">🔀</span>
        <span className="tracking-wide">{t("Move Table")}</span>
      </button>
      <button
        onClick={() => setShowMergeTableModal(true)}
        className="ml-2 flex items-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-amber-500 hover:to-orange-500"
      >
        <span className="text-base">🧩</span>
        <span className="tracking-wide">{t("Merge Table")}</span>
      </button>

    </div>
  );
}



// Increase quantity of a cart item by unique_id
const incrementCartItem = (uniqueId) => {
  setCartItems(prev =>
    prev.map(item =>
      item.unique_id === uniqueId &&
      !item.paid &&
      !item.confirmed // Only unconfirmed
        ? { ...item, quantity: item.quantity + 1 }
        : item
    )
  );
};

const decrementCartItem = (uniqueId) => {
  setCartItems(prev =>
    prev.map(item =>
      item.unique_id === uniqueId &&
      !item.paid &&
      !item.confirmed // Only unconfirmed
        ? { ...item, quantity: Math.max(item.quantity - 1, 1) }
        : item
    )
  );
};





function allItemsDelivered(items) {
  return Array.isArray(items) && items.length > 0 &&
    items.every(item => {
      // If the product is excluded from kitchen, skip from delivery check
      const isExcluded =
        excludedItems.includes(item.id) ||
        excludedCategories.includes(item.category);
      return isExcluded ||
        !item.kitchen_status ||
        item.kitchen_status === "delivered";
    });
}






  const calculateSubTotal = () =>
    cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

useEffect(() => {
  const fetchProducts = async () => {
    try {
      const identifierCandidates = [
        currentUser?.tenant_id,
        currentUser?.restaurant_slug,
        currentUser?.restaurant_id,
        restaurantSlug,
      ];

      const rawIdentifier =
        identifierCandidates
          .map((value) => {
            if (value === null || value === undefined) return "";
            const str = String(value).trim();
            if (!str || str === "null" || str === "undefined") return "";
            return str;
          })
          .find(Boolean) || "";

      const query = rawIdentifier
        ? `?identifier=${encodeURIComponent(rawIdentifier)}`
        : "";

      const data = await secureFetch(`/products${query}`);

      const normalized = Array.isArray(data)
        ? data.map((product) => {
            const selection = normalizeExtrasGroupSelection(
              product.selectedExtrasGroup ?? product.selected_extras_group ?? product.extrasGroupRefs
            );
            return {
              ...product,
              extrasGroupRefs: selection,
              selectedExtrasGroup: selection.ids,
              selected_extras_group: selection.ids,
              selectedExtrasGroupNames: selection.names,
            };
          })
        : [];

      setProducts(normalized);
    } catch (err) {
      console.error("❌ Error fetching products:", err);
    }
  };

  fetchProducts();
}, [
  currentUser?.tenant_id,
  currentUser?.restaurant_slug,
  currentUser?.restaurant_id,
  restaurantSlug,
]);


useEffect(() => {
  return () => {
    if (order?.id && cartItems.length === 0) {
     secureFetch(`/orders/${order.id}/reset-if-empty${identifier}`, { method: "PATCH" });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [order?.id]);



useEffect(() => {
  // Whenever a new table/order is opened, reset discount
  setDiscountValue(0);
  setDiscountType("percent");
}, [tableId, orderId]);

useEffect(() => {
  // 🧹 1️⃣ Clear previous table state instantly when switching tables
  setOrder(null);
  setCartItems([]);
  setReceiptItems([]);
  setLoading(true);

  // ✅ Fetch order for phone/packet (QRMenu online orders also land here)
const fetchPhoneOrder = async (id) => {
  try {
    const restaurantSlug =
      localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
    const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";

    const newOrder = await secureFetch(`/orders/${id}${identifier}`);
    let correctedStatus = newOrder.status;

// 🧩 FIX: if phone order has no items, treat as "occupied" (not "confirmed")
const items = await secureFetch(`/orders/${id}/items${identifier}`);
if ((!items || items.length === 0) && newOrder.order_type === "phone") {
  correctedStatus = "occupied";
}

if (newOrder.payment_method === "Online") correctedStatus = "paid";

setOrder({ ...newOrder, status: correctedStatus });
await fetchOrderItems(newOrder.id);

      await fetchOrderItems(newOrder.id);
      setLoading(false);
    } catch (err) {
      console.error("❌ Error fetching phone/packet order:", err);
      setLoading(false);
    }
  };

  // ✅ Create or fetch table order
const createOrFetchTableOrder = async (tableNumber) => {
  try {
    const orders = await secureFetch(
      identifier
        ? `/orders?table_number=${tableNumber}&identifier=${restaurantSlug}`
        : `/orders?table_number=${tableNumber}`
    );

    // 🧩 Prefer any non-closed order; if none, fall back to the latest paid one
    let newOrder = orders.find((o) => o.status !== "closed") || orders[0];

    if (!newOrder) {
      // No prior order for this table — create a fresh one
      newOrder = await secureFetch(`/orders${identifier}`, {
        method: "POST",
        body: JSON.stringify({
          table_number: tableNumber,
          order_type: "table",
          total: 0,
          items: [],
        }),
      });
    }

    // 🧠 If it’s paid, we still show it — don’t reset immediately
    let correctedStatus = newOrder.status;
    if (newOrder.payment_method === "Online") correctedStatus = "paid";

    setOrder({ ...newOrder, status: correctedStatus });

    // ✅ Always fetch items (even for paid)
    await fetchOrderItems(newOrder.id);

    setLoading(false);
  } catch (err) {
    console.error("❌ Error creating/fetching table order:", err);
    setLoading(false);
  }
};


  // 💡 3️⃣ Choose proper loader based on params
  if (orderId) fetchPhoneOrder(orderId);
  else if (tableId) createOrFetchTableOrder(tableId);
}, [tableId, orderId]);



const fetchOrderItems = async (orderId) => {
  try {
    const items = await secureFetch(`/orders/${orderId}/items${identifier}`);

    if (!Array.isArray(items)) {
      console.error("❌ Expected items to be an array but got:", items);
      return;
    }

    const formatted = items.map((item) => {
      let extras = safeParseExtras(item.extras);
      const qty = parseInt(item.quantity, 10) || 1;

      // 🧩 FIX for QRMenu overcounted addons
      // When extras were pre-multiplied for each quantity (e.g., total 100 instead of 50)
      // divide each extra’s price by product quantity once to normalize
      if (order?.order_type === "table" && order?.source === "qr" && qty > 1) {
        extras = extras.map((ex) => ({
          ...ex,
          price: (parseFloat(ex.price || ex.extraPrice || 0) / qty).toFixed(2),
        }));
      }

      return {
        id: item.product_id,
        name: item.name || item.order_item_name || item.product_name || "Unnamed",
        quantity: qty,
        price: parseFloat(item.price) || 0,
        ingredients: Array.isArray(item.ingredients)
          ? item.ingredients
          : typeof item.ingredients === "string"
          ? JSON.parse(item.ingredients || "[]")
          : [],
        extras,
        unique_id: item.unique_id || `${item.product_id}-${JSON.stringify(extras || [])}-${uuidv4()}`,
        confirmed: item.confirmed ?? true,
        paid: !!item.paid_at,
        payment_method: item.payment_method ?? "Unknown",
        note: item.note || "",
        kitchen_status: item.kitchen_status || "",
      };
    });

    setCartItems(formatted);

    // ✅ Keep paid items separately for receipts/history
    setReceiptItems(formatted.filter((i) => i.paid));

    console.log(
      `📦 Loaded ${formatted.length} items (${formatted.filter(i => i.paid).length} paid)`
    );
  } catch (err) {
    console.error("❌ Failed to fetch items:", err);
  }
};

  const calculateTotal = () =>
    cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

const updateOrderStatus = async (newStatus = null, total = null, method = null) => {
  const targetId = order?.id || orderId || tableId;
  if (!targetId) {
    console.error("❌ No order ID found.");
    showToast("Invalid order ID");
    return null;
  }

  try {
    const body = {
      status: newStatus || undefined,
      payment_status: newStatus === "paid" ? "paid" : undefined,
      total: total ?? order?.total ?? undefined,
      payment_method: method || selectedPaymentMethod || order?.payment_method || "Unknown",
    };

    const updated = await secureFetch(`/orders/${targetId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!updated || updated.error) throw new Error(updated?.error || "Failed to update order status");

    setOrder(updated);
    console.log("✅ Order status updated:", updated.status, updated.payment_status);
    return updated;
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    showToast(error.message || "Failed to update order status");
    return null;
  }
};





function getPaymentMethodSummaryWithIcon(items) {
  // Step 1: Log everything for debug
  console.log("🧾 Receipt Group Debug:");
  items.forEach((item, idx) => {
    console.log(
      `  #${idx + 1}: ${item.name} — method: ${item.payment_method} — receipt_id: ${item.receipt_id}`
    );
  });

  // Step 2: Filter valid methods only
  const validMethods = items
    .map(i => i.payment_method)
    .filter(m => m && m !== "Unknown");

  console.log("✅ Valid methods in group:", validMethods);

  if (validMethods.length === 0) {
    console.warn("❓ All methods invalid or missing");
    return "❓ Unknown";
  }

  // 🚫 No more "Mixed" — just return first valid method
  const method = validMethods[0];

  // Step 3: Icon mapping
  const icons = {
    "Cash": "💵",
    "Credit Card": "💳",
    "Sodexo": "🍽️",
    "Multinet": "🪙",
    "Unknown": "❓"
  };

  console.log(`🎯 Final method for group: ${method}`);
  return `${icons[method] || "❓"} ${method}`;
}


function hasPreparingItems(orderItems) {
  return Array.isArray(orderItems)
    ? orderItems.some(item => item.kitchen_status === "preparing")
    : false;
}


const handleMultifunction = async () => {
   console.log("🧩 ENTERED handleMultifunction()");
  console.log("🧩 order before any checks →", order);

  if (!order || !order.status) return;
  

  const total = cartItems
    .filter(i => selectedForPayment.includes(i.unique_id))
    .reduce((sum, i) => sum + i.price * i.quantity, 0);
  const receiptId = uuidv4();
  const safeCartItems = Array.isArray(cartItems) ? cartItems : [];

  // ✅ Allow phone orders to close even if empty
  if (cartItems.length === 0) {
    if (orderType === "phone") {
      try {
        await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
        navigate("/tableoverview");
        return;
      } catch (err) {
        console.error("❌ Failed to close empty phone order:", err);
        showToast("Failed to close phone order");
        return;
      }
    } else {
      navigate("/tables");
      return;
    }
  }

  // 1️⃣ If closing, block if any item is preparing
  if (
    getButtonLabel() === "Close" &&
    hasPreparingItems(receiptItems.concat(cartItems))
  ) {
    showToast("⚠️ Table cannot be closed: preparing");
    return;
  }

  // 2️⃣ Confirm unconfirmed items first
 if (cartItems.some(i => !i.confirmed)) {
  const updated = await updateOrderStatus("confirmed", total);
  if (!updated) return;

  if (window && window.playNewOrderSound) window.playNewOrderSound();

  const unconfirmedItems = safeCartItems.filter(i => !i.confirmed);
  if (unconfirmedItems.length > 0) {
    await secureFetch(`/orders/order-items${identifier}`, {
      method: "POST",
      body: JSON.stringify({
        order_id: updated.id,
        receipt_id: null,
        items: unconfirmedItems.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
          price: i.price,
          ingredients: i.ingredients,
          extras: (i.extras || []).map(ex => ({
            ...ex,
            amount: Number(ex.amount) || 1,
            unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase()
          })),
          unique_id: i.unique_id,
          note: i.note || null,
          confirmed: true,
          kitchen_status: "new",
          payment_method: null,
          receipt_id: null,
          discountType: discountValue > 0 ? discountType : null,
          discountValue: discountValue > 0 ? discountValue : 0,
        }))
      }),
    });
  }

  setOrder((prev) => ({ ...prev, status: "confirmed" }));
  await fetchOrderItems(updated.id);

  if (orderId && getButtonLabel() === "Confirm") {
    await fetchOrderItems(order.id);
    setOrder((prev) => ({ ...prev, status: "confirmed" }));

    // ✅ CLEAR HEADER SUBTITLE IMMEDIATELY AFTER CONFIRM
    setHeader(prev => ({ ...prev, subtitle: "" }));

    // ✅ show toast + navigate back to orders after short delay
    showToast("✅ Phone order confirmed and sent to kitchen");
    setTimeout(() => navigate("/orders"), 400);
    return;
  }
  return;
}


  // 3️⃣ Open payment modal only for table orders
  if (
    order.status === "confirmed" &&
    !orderId &&
    cartItems.some(i => !i.paid && i.confirmed)
  ) {
    setShowPaymentModal(true);
    return;
  }

// 4️⃣ Try to close if all items are paid — OR any phone order ready to close
const allPaid = safeCartItems.every((i) => i.paid);

if (orderType === "phone" && order.status !== "closed") {
  // ✅ Allow phone orders to close after payment
  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    navigate("/orders");
    showToast("✅ Phone order closed successfully");
  } catch (err) {
    console.error("❌ Failed to close phone order:", err);
    showToast("❌ Failed to close phone order");
  }
  return;
}

// 🧠 For table orders → close ONLY when user manually presses “Close”
// 🧠 For table orders → close ONLY when all items are delivered
if (getButtonLabel() === "Close" && (order.status === "paid" || allPaid)) {
  // 🚫 Prevent closing if any item not delivered
  const allDelivered = cartItems.every(
    (i) =>
      i.kitchen_status === "delivered" ||
      !i.kitchen_status || // no kitchen process (e.g., drinks)
      excludedItems.includes(i.id) ||
      excludedCategories.includes(i.category)
  );

  if (!allDelivered) {
    showToast("⚠️ Cannot close table: not all items delivered!");
    return;
  }

  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    navigate("/tables");
    setDiscountValue(0);
    setDiscountType("percent");
    showToast("✅ Table closed successfully");
  } catch (err) {
    console.error("❌ Close failed:", err);
    showToast("❌ Failed to close table");
  }
}




};







const refreshReceiptAfterPayment = async () => {
  try {
  const data = await secureFetch(`/orders/${order.id}/items${identifier}`);


    const fetchedItems = data.map((item) => {
      let extras = safeParseExtras(item.extras);

// 🧩 FIX for QRMenu duplicates — divide quantities if they look pre-multiplied
if (order?.order_type === "table" && order?.source === "qr") {
  const qty = parseInt(item.quantity, 10) || 1;
  extras = extras.map(ex => ({
    ...ex,
    // prevent QR double count: if quantity matches product qty, normalize
    quantity: Math.max(1, Math.round((ex.quantity || 1) / qty))
  }));
}

      return {
        id:          item.product_id,
        name: item.name || item.order_item_name || item.product_name,
        quantity:    parseInt(item.quantity, 10),
        price:       parseFloat(item.price),
        ingredients: Array.isArray(item.ingredients)
  ? item.ingredients
  : (typeof item.ingredients === "string"
      ? JSON.parse(item.ingredients || "[]")
      : []),

        extras,
        unique_id:   item.unique_id,
        note:        item.note || "",
        confirmed:   item.confirmed ?? true,
        paid:        !!item.paid_at,
        payment_method: item.payment_method ?? "Unknown",
        receipt_id: item.receipt_id || null,

          kitchen_status: item.kitchen_status || ""// ✅ Add this line!
      };
    });

    // ✅ Filter receipts with real payment only
    const paidItems = fetchedItems.filter(i => i.paid && i.receipt_id);
    const unpaidItems = fetchedItems.filter(i => !i.paid);

    // ✅ Group by receipt ID for display
    const grouped = paidItems.reduce((acc, i) => {
      const key = i.receipt_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(i);
      return acc;
    }, {});
    console.log("📚 Grouped Receipt IDs:", Object.keys(grouped));

    // ✅ Update states
    setReceiptItems(paidItems); // only those with receipt_id
    setCartItems(fetchedItems); // includes confirmed & unconfirmed, not yet paid
  } catch (err) {
    console.error("❌ Failed to refresh receipt:", err);
  }
};




const confirmPayment = async (method, payIds = null) => {
  const receiptId = uuidv4();
const ids = (payIds && payIds.length > 0)
  ? payIds
  : cartItems.filter(i => !i.paid && i.confirmed).map(i => i.unique_id);
if (order.status !== 'paid') {
let total = cartItems
  .filter(i => ids.includes(i.unique_id))
  .reduce((sum, i) => sum + i.price * i.quantity, 0);

if (discountValue > 0) {
  if (discountType === "percent") total -= (total * (discountValue / 100));
  if (discountType === "fixed") total = Math.max(0, total - discountValue);
}


  const enhancedItems = cartItems.filter(i => ids.includes(i.unique_id)).map(i => ({
      product_id: i.product_id || i.id,
      quantity: i.quantity,
      price: i.price,
      ingredients: i.ingredients,
      extras: i.extras,
      unique_id: i.unique_id,
      payment_method: method,
      receipt_id: receiptId,
      note: i.note || null,
        discountType: discountValue > 0 ? discountType : null,
  discountValue: discountValue > 0 ? discountValue : 0,
      confirmed: true
    }));

    await secureFetch(`/orders/sub-orders${identifier}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: order.id,
        total,
        payment_method: method,
        receipt_id: receiptId,
        items: enhancedItems
      })
    });
// Before calling secureFetch('orders/receipt-methods`, ...)
const cleanedSplits = {};
Object.entries(splits).forEach(([method, amt]) => {
  const val = parseFloat(amt);
  if (val > 0) cleanedSplits[method] = val;
});
await secureFetch(`/orders/receipt-methods${identifier}`, {
  method: "POST",
  body: JSON.stringify({
    order_id: order.id,
    receipt_id: receiptId,
    methods: cleanedSplits,
  }),
});







    // Instantly update cart state to reflect paid items for better UX and sound logic
    setCartItems((prev) =>
      prev.map((item) =>
        selectedForPayment.includes(item.unique_id)
          ? { ...item, paid: true, paid_at: new Date().toISOString() }
          : item
      )
    );

    // 🔊 Play paid sound after local update (ALWAYS, for every payment)
    if (selectedForPayment.length > 0 && window && typeof window.playPaidSound === "function") window.playPaidSound();

    await refreshReceiptAfterPayment();

    // Now check if fully paid etc
    // ✅ Use secureFetch so the Bearer token is automatically included
const allItems2 = await secureFetch(`/orders/${order.id}/items${identifier}`);

if (!Array.isArray(allItems2)) {
  console.error("❌ Unexpected items response:", allItems2);
  return;
}

const isFullyPaid2 = allItems2.every((item) => item.paid_at);

    if (isFullyPaid2) {
      await updateOrderStatus('paid', total, method);
      setOrder(prev => ({ ...prev, status: 'paid' }));
    }
  }

  await refreshReceiptAfterPayment();
  await fetchOrderItems(order.id);
  await fetchSubOrders();
  setSelectedForPayment([]);
  setShowPaymentModal(false);
};




const getButtonLabel = () => {
  if (!order) return "Preparing..";

  // 🔑 Force Close if already paid online
  if (order.payment_method === "Online") {
    return "Close";
  }

  const hasUnconfirmed = cartItems.some((i) => !i.confirmed);
  const hasUnpaid = cartItems.some((i) => !i.paid && i.confirmed);

  if (hasUnconfirmed) return "Confirm";
  if (hasUnpaid) return "Pay";
  return "Close";
};



function showToast(message) {
  setToast({ show: true, message });
  setTimeout(() => setToast({ show: false, message: "" }), 3500);
}


const selectedForPaymentTotal = cartItems
  .filter(i => selectedForPayment.includes(i.unique_id))
  .reduce((sum, i) => sum + i.price * i.quantity, 0);

const addToCart = async (product) => {
  if (!order) return;

  const selection = normalizeExtrasGroupSelection([
    product.extrasGroupRefs,
    product.selectedExtrasGroup,
    product.selected_extras_group,
    product.selectedExtrasGroupNames,
  ]);

  if (selection.ids.length > 0 || selection.names.length > 0) {
    const match = await getMatchedExtrasGroups(selection);

    if (match) {
      const idsForModal = match.matchedIds.length > 0 ? match.matchedIds : selection.ids;
      const namesForModal = Array.from(new Set([...selection.names, ...match.matchedNames]));

      const productForModal = {
        ...product,
        quantity: 1,
        extrasGroupRefs: { ids: idsForModal, names: namesForModal },
        selectedExtrasGroup: idsForModal,
        selected_extras_group: idsForModal,
        selectedExtrasGroupNames: namesForModal,
        modalExtrasGroups: match.matchedGroups,
      };

      console.log("🧩 Resolved extras groups:", idsForModal);

      setNote("");
      setSelectedProduct(productForModal);
      setSelectedExtras([]);
      setShowExtrasModal(true);
      return;
    }
  }

  // 🔹 No extras → merge identical items by quantity
  const baseUniqueId = `${product.id}-NO_EXTRAS`;

  setCartItems((prev) => {
    const existingIndex = prev.findIndex(
      (item) =>
        item.unique_id === baseUniqueId &&
        !item.confirmed &&
        !item.paid
    );

    if (existingIndex !== -1) {
      return prev.map((item, idx) =>
        idx === existingIndex
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    }

    const hasLockedInstance = prev.some(
      (item) =>
        item.unique_id === baseUniqueId &&
        (item.confirmed === true || item.paid)
    );

    const finalUniqueId = hasLockedInstance
      ? `${baseUniqueId}-${uuidv4()}`
      : baseUniqueId;

    return [
      ...prev,
      {
        id: product.id,
        name: product.name,
        note: "",
        price: parseFloat(product.price),
        quantity: 1,
        ingredients: product.ingredients || [],
        extras: [],
        unique_id: finalUniqueId,
        confirmed: false,
        paid: false,
      },
    ];
  });

  setOrder((prev) => ({ ...prev, status: "confirmed" }));
};











const displayTotal = cartItems
  .filter(i => !i.paid)
  .reduce((sum, i) => sum + (i.price * i.quantity), 0);


  const removeItem = (uniqueId) => {
    setCartItems((prev) =>
      prev.filter((item) => item.unique_id !== uniqueId || item.confirmed)
    );
    setSelectedForPayment((prev) => prev.filter((id) => id !== uniqueId));
  };

// Clears only UNCONFIRMED items from the cart
const clearUnconfirmedCartItems = () => {
  setCartItems((prev) => prev.filter((item) => item.confirmed));
};



  useEffect(() => {
    if (order?.id) fetchSubOrders();
  }, [order?.id]);

  const fetchSubOrders = async () => {
    if (!order?.id) return;
    try {
    const data = await secureFetch(`/orders/${order.id}/suborders${identifier}`);

      setSubOrders(data);
    } catch (e) {
      console.error(e);
    }
  };

 const sumOfSplits = Object.values(splits)
  .map((v) => parseFloat(v || 0))
  .reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0);
 

    // Split calculation
const totalDue = cartItems.filter(i => !i.paid).reduce((sum, item) => {
  const base = item.price * item.quantity;
  const extras = (item.extras || []).reduce(
    (s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
    0
  ) * item.quantity;
  return sum + base + extras;
}, 0);


// after you compute sumOfSplits…
const hasAnySplit = Object.values(splits).some(v => v > 0);
const shouldDisablePay = hasAnySplit && sumOfSplits !== totalDue;

function ReceiptGroup({ receiptId, items, groupIdx }) {
  const icons = {
    Cash: "💵",
    "Credit Card": "💳",
    Sodexo: "🍽️",
    Multinet: "🪙",
    Unknown: "❓"
  };

  const initialGuess = items[0]?.payment_method || "Unknown";
const [methodLabel, setMethodLabel] = useState(`${icons[initialGuess]} ${initialGuess}`);

useEffect(() => {
  const fetchMethods = async () => {
    try {
      const methods = await secureFetch(`/orders/receipt-methods/${receiptId}${identifier}`);

      if (!methods.length) {
        const fallback = items[0]?.payment_method || "Unknown";
        setMethodLabel(`${icons[fallback] || "❓"} ${fallback}`);
        return;
      }

      const label = methods
        .filter((m) => m.payment_method && m.payment_method !== "Split")
        .map((m) => {
          const icon = icons[m.payment_method] || "❓";
          const amount = parseFloat(m.amount).toFixed(2);
          return `${icon} ${m.payment_method} ₺${amount}`;
        })
        .join(" + ");

      setMethodLabel(label);
    } catch (err) {
      console.error("❌ Failed to fetch receipt methods:", err);
      setMethodLabel("❓ Unknown");
    }
  };

  fetchMethods();
}, [receiptId]);



return (
<div className="relative flex min-h-full flex-col gap-4 transition-all duration-300 ease-in-out">
    {/* --- RECEIPT PREVIEW HEADER --- */}
    <div className="bg-white dark:bg-zinc-800 shadow-md rounded-b-3xl p-4 sticky top-0 z-30">
      <h1 className="text-xl font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2">
        🧾 {t("Receipt")} #{groupIdx + 1}
      </h1>
    </div>

    {/* --- Receipt Items List --- */}
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={`${item.unique_id}-${index}`}
          className="p-3 bg-green-50 rounded-lg shadow-sm flex flex-col gap-1"
        >
          {/* --- Top Row: Name + Paid --- */}
          <div className="flex justify-between items-center flex-wrap">
            <span className="font-semibold text-base sm:text-lg break-words max-w-[65vw]">
              {item.name}
            </span>
            <span className="font-bold text-gray-800 flex flex-col items-end text-base sm:text-lg">
              ₺{(item.price * item.quantity).toFixed(2)}
              <span className="text-xs text-red-600 font-extrabold mt-1">{t("paid")}</span>
            </span>
          </div>

          {/* --- Extras (if any) --- */}
          {item.extras?.length > 0 && (
            <ul className="ml-2 mt-1 text-xs sm:text-sm text-gray-600 list-disc list-inside">
              {item.extras.map((ex, idx) => (
                <li key={idx}>
                  {ex.name} ×{ex.quantity || 1} – ₺
                  {(parseFloat(ex.price || ex.extraPrice) * (ex.quantity || 1)).toFixed(2)}
                </li>
              ))}
            </ul>
          )}

          {/* --- Quantity --- */}
          <div className="text-xs sm:text-sm text-gray-600 mt-1">
            {t("Quantity")}: {item.quantity}
          </div>

          {/* --- Notes --- */}
          {item.note && item.note.trim() !== "" && (
            <div className="mt-2 bg-yellow-50 border-l-4 border-yellow-400 px-3 py-2 text-xs sm:text-sm text-yellow-900 rounded">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📝</span>
                <span className="font-medium">{t("Notes")}:</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap leading-snug">
                {item.note}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>

    {/* --- Payment Method(s) --- */}
    {methodLabel && (
      <div className="mt-3 bg-blue-50 rounded px-3 py-2 space-y-1">
        {methodLabel.split(" + ").map((line, idx) => {
          const [icon, ...rest] = line.trim().split(" ");
          const label = rest.slice(0, -1).join(" ");
          const amount = rest[rest.length - 1];
          return (
            <div
              key={idx}
              className="flex justify-between items-center text-xs sm:text-sm text-gray-700 font-semibold"
            >
              <div className="flex items-center space-x-1">
                <span className="w-5 text-lg">{icon}</span>
                <span>{t(label)}</span>
              </div>
              <span>{amount}</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
}

  if (loading) return <p className="p-4 text-center">{t("Loading...")}</p>;

return (
  <div className="h-screen w-full bg-slate-50 overflow-hidden">
    <div className="mx-auto flex h-full w-full max-w-screen-2xl flex-col gap-4 px-4 sm:px-6 lg:px-8 xl:px-10 overflow-hidden">
      <section
        className="grid flex-1 min-h-0 gap-6 items-stretch overflow-hidden pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]"
        style={{ paddingBottom: "2cm" }}
      >
        {/* === Left: Categories + Products === */}
        <div className="flex min-h-0 gap-4 overflow-hidden">
{/* Categories */}
<aside className="flex w-full max-w-[230px] flex-col rounded-3xl p-5 shadow-md border border-blue-200 bg-transparent backdrop-blur-sm">
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-xl font-semibold text-indigo-700">
      {t("Categories")}
    </h2>
    <span className="rounded-full bg-white px-1 py-1 text-sm font-semibold text-indigo-700 shadow">
      {categories.length} {t("Total")}
    </span>
  </div>

  {/* Category buttons */}
<div className="mt-3 flex-1 overflow-y-auto pr-1 scrollbar-hide hover:scrollbar-thin hover:scrollbar-thumb-blue-400">
    <div className="grid grid-cols-2 gap-2">
      {categories.map((cat, idx) => {
        const slug = (cat || "").trim().toLowerCase();
        const catSrc = categoryImages[slug] || "";
        const hasImg = !!catSrc;
        return (
          <button
            key={cat}
            onClick={() => setCurrentCategoryIndex(idx)}
            className={`flex flex-col items-center justify-center rounded-xl border text-center py-3 transition ${
              currentCategoryIndex === idx
                ? "border-indigo-500 bg-white shadow-md"
                : "border-blue-100 hover:border-indigo-200 hover:bg-blue-50"
            }`}
          >
            {hasImg ? (
              <img
                src={catSrc}
                alt={cat}
                className="mb-1 h-10 w-10 rounded-lg border object-cover shadow-sm"
              />
            ) : (
              <span className="mb-1 text-xl">
                {categoryIcons[cat] || categoryIcons.default}
              </span>
            )}
            <span className="text-[12px] font-semibold text-slate-800">
              {t(cat)}
            </span>
          </button>
        );
      })}
    </div>
  </div>
</aside>



          {/* Products */}
          <article className="flex min-h-0 flex-1 flex-col rounded-3xl bg-white p-5 shadow-lg ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-800">
                {activeCategory ? t(activeCategory) : t("Products")}
              </h2>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
                {productsInActiveCategory.length} {t("Products")}
              </span>
            </div>

            <div className="mt-4 flex-1 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-200 via-slate-100 to-white p-3">
              <div className="h-full overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
                  {productsInActiveCategory.length > 0 ? (
                    productsInActiveCategory.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 p-3 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
                      >
                        <img
                          src={
                            product.image ||
                            "https://via.placeholder.com/100?text=🍔"
                          }
                          alt={product.name}
                          className="mb-2 h-20 w-20 rounded-xl border object-cover shadow"
                        />
                        <p className="text-sm font-semibold text-slate-700 line-clamp-2 text-center">
                          {product.name}
                        </p>
                        <span className="mt-1 text-base font-bold text-indigo-600">
                          ₺{parseFloat(product.price).toFixed(2)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm font-semibold text-slate-400">
                      {t("No products in this category.")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* === Right Section: Cart === */}
        <aside className="flex min-h-0 flex-col rounded-3xl bg-white shadow-xl ring-1 ring-slate-200">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 pt-5 pb-3 flex-shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">{t("Cart")}</h2>
              <p className="text-sm text-slate-500">
                {orderId ? t("Phone Order") : `${t("Table")} ${tableId}`}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              {cartItems.filter((i) => !i.paid).length} {t("Items")}
            </span>
          </header>
          {/* Cart items */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 space-y-3">
            {cartItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm font-medium text-slate-400">
                {t("Cart is empty.")}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {cartItems.map((item, idx) => {
                  const extrasList = safeParseExtras(item.extras);
                  const normalizedExtras = Array.isArray(extrasList) ? extrasList : [];
                  const perItemExtrasTotal = normalizedExtras.reduce((sum, ex) => {
                    const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                    const qty = Number(ex.quantity) || 1;
                    return sum + price * qty;
                  }, 0);
                  const basePrice = parseFloat(item.price) || 0;
                  const quantity = Number(item.quantity) || 1;
                  const lineTotal = (basePrice + perItemExtrasTotal) * quantity;
                  const showNote =
                    typeof item.note === "string"
                      ? item.note.trim() !== ""
                      : !!item.note;
                  const isEditable = !item.confirmed && !item.paid;

                  const cardGradient = item.paid
                    ? "bg-gradient-to-br from-emerald-200 via-emerald-100 to-emerald-300"
                    : item.confirmed
                    ? "bg-gradient-to-br from-indigo-200 via-indigo-100 to-indigo-300"
                    : "bg-gradient-to-br from-amber-200 via-amber-100 to-amber-300";

                  return (
                    <li
                      key={item.unique_id || `${item.id}-${idx}`}
                      className={`relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition ${cardGradient}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-800 break-words">
                            {item.name}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span>
                              ₺{basePrice.toFixed(2)} × {quantity}
                            </span>
                            {perItemExtrasTotal > 0 && (
                              <span>
                                + ₺{(perItemExtrasTotal * quantity).toFixed(2)} {t("Extras")}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {item.paid && (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                              {t("paid")}
                            </span>
                          )}
                          <span className="font-bold text-indigo-600 whitespace-nowrap">
                            ₺{lineTotal.toFixed(2)}
                          </span>
                        {isEditable && (
  <div className="flex items-center gap-2">
    {/* ✏️ Edit button */}
    <button
      onClick={() => {
        setSelectedProduct(item);
        setSelectedExtras(safeParseExtras(item.extras));
        setEditingCartItemIndex(idx);
        setShowExtrasModal(true);
      }}
      className="text-xs font-semibold text-blue-500 hover:text-blue-600 flex items-center gap-1"
      title={t("Edit item")}
    >
      🖊️
      <span>{t("Edit")}</span>
    </button>

    {/* 🗑 Remove button */}
    <button
      onClick={() => removeItem(item.unique_id)}
      className="text-xs font-semibold text-red-500 hover:text-red-600 flex items-center gap-1"
      title={t("Remove item")}
    >
      🗑
      <span>{t("Remove")}</span>
    </button>
  </div>
)}

                        </div>
                      </div>

                      {normalizedExtras.length > 0 && (
                        <ul className="mt-1 space-y-1 text-xs text-slate-600">
                          {normalizedExtras.map((ex, extraIdx) => {
                            const extraQty = Number(ex.quantity) || 1;
                            const extraTotal =
                              (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) *
                              extraQty;
                            return (
                              <li key={`${item.unique_id}-extra-${extraIdx}`}>
                                {ex.name} ×{extraQty} – ₺{extraTotal.toFixed(2)}
                              </li>
                            );
                          })}
                        </ul>
                      )}

                      {showNote && (
                        <div className="mt-2 bg-yellow-50 border-l-4 border-yellow-400 px-3 py-2 text-xs text-yellow-900 rounded">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="text-base leading-none">📝</span>
                            <span>{t("Notes")}:</span>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap leading-snug">
                            {item.note}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-sm text-slate-500 pt-1">
                        <span>
                          {t("Qty")}: {quantity}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => decrementCartItem(item.unique_id)}
                            className="h-7 w-7 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!isEditable}
                          >
                            –
                          </button>
                          <button
                            onClick={() => incrementCartItem(item.unique_id)}
                            className="h-7 w-7 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                            disabled={!isEditable}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <footer className="space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-5 shadow-inner">
            <div className="flex justify-between text-sm font-medium text-slate-600">
              <span>{t("Subtotal")}:</span>
              <span className="text-slate-900">
                ₺{calculateDiscountedTotal().toFixed(2)}
              </span>
            </div>

            {discountValue > 0 && (
              <div className="flex justify-between text-sm font-semibold text-fuchsia-600">
                <span>
                  🎁 {t("Discount")}{" "}
                  {discountType === "percent"
                    ? `(${discountValue}%)`
                    : `(-₺${discountValue})`}
                </span>
                <span>-₺{discountValue}</span>
              </div>
            )}

            <div className="flex justify-between items-center rounded-2xl bg-white px-3 py-3 text-lg font-bold text-indigo-700 shadow-sm">
              <span>{t("Total")}:</span>
              <span>₺{calculateDiscountedTotal().toFixed(2)}</span>
            </div>

           <div className="flex gap-3 items-center">
  {/* 🧹 Clear button */}
  <button
    onClick={clearUnconfirmedCartItems}
    className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
  >
    {t("Clear")}
  </button>

  {/* 💸 Main multifunction button */}
  <button
    onClick={handleMultifunction}
    className="flex-1 rounded-lg bg-gradient-to-r from-emerald-400 via-blue-400 to-indigo-400 py-3 text-lg font-extrabold text-white shadow-lg hover:brightness-105"
  >
    💸 {t(getButtonLabel())}
  </button>

  {/* 🖨️ Print button (to be wired later) */}
  <button
    onClick={() => console.log('🖨️ Print clicked - wire later')}
    className="rounded-lg bg-gradient-to-r from-slate-100 to-slate-200 p-3 shadow hover:brightness-105 border border-slate-300"
    title={t("Print Receipt")}
  >
    🖨️
  </button>
</div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowDiscountModal(true)}
                className="flex-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:scale-105 transition"
              >
                🎁 {t("Discount")}
              </button>
              <button
                onClick={handleOpenCashRegister}
                className="flex-1 rounded-lg bg-gradient-to-r from-blue-400 to-emerald-400 px-3 py-2 text-xs font-semibold text-white hover:scale-105 transition"
              >
                🗄️ {t("Register")}
              </button>
            </div>
          </footer>
        </aside>
      </section>
    </div>
  


 

    {/* --- TOAST NOTIFICATION --- */}
    {toast.show && (
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-6 py-4 bg-red-600 text-white text-lg rounded-2xl shadow-xl animate-fade-in-up transition-all">
        {t(toast.message)}
      </div>
    )}

<PaymentModal
  show={showPaymentModal}
  onClose={() => setShowPaymentModal(false)}
  isSplitMode={isSplitMode}
  setIsSplitMode={setIsSplitMode}
  discountType={discountType}
  discountValue={discountValue}
  selectedForPayment={selectedForPayment}
  cartItems={cartItems}
  t={t}
  paymentMethods={paymentMethods}
  selectedPaymentMethod={selectedPaymentMethod}
  setSelectedPaymentMethod={setSelectedPaymentMethod}
  confirmPayment={confirmPayment}
  splits={splits}
  setSplits={setSplits}
  totalDue={totalDue}
  activeSplitMethod={activeSplitMethod}
  setActiveSplitMethod={setActiveSplitMethod}
  confirmPaymentWithSplits={confirmPaymentWithSplits}
  navigate={navigate}
/>


<ExtrasModal
  showExtrasModal={showExtrasModal}
  setShowExtrasModal={setShowExtrasModal}
  selectedProduct={selectedProduct}
  setSelectedProduct={setSelectedProduct}  // ← ADD THIS LINE
  selectedExtras={selectedExtras}
  setSelectedExtras={setSelectedExtras}
  extrasGroups={extrasGroups}
  setCartItems={setCartItems}
  cartItems={cartItems}
  editingCartItemIndex={editingCartItemIndex}
  setEditingCartItemIndex={setEditingCartItemIndex}

  note={note}
  setNote={setNote}
  fullTotal={fullTotal}
  t={t}
/>



<DiscountModal
  show={showDiscountModal}
  onClose={() => setShowDiscountModal(false)}
  discountType={discountType}
  setDiscountType={setDiscountType}
  discountValue={discountValue}
  setDiscountValue={setDiscountValue}
  t={t}
/>
<MoveTableModal
  open={showMoveTableModal}
  onClose={() => setShowMoveTableModal(false)}
  currentTable={tableId}
  t={t}
  onConfirm={async (newTable) => {
    if (!order?.id) return;
    try {
      await secureFetch(`/orders/${order.id}/move-table${identifier}`, {
        method: "PATCH",
        body: JSON.stringify({ new_table_number: newTable }),
      });
      setShowMoveTableModal(false);
      navigate(`/transaction/${newTable}`);
    } catch (err) {
      console.error("❌ Move table failed:", err);
      setShowMoveTableModal(false);
      alert(err.message || "Failed to move table");
    }
  }}
/>

<MergeTableModal
  open={showMergeTableModal}
  onClose={() => setShowMergeTableModal(false)}
  currentTable={tableId}
  t={t}
onConfirm={async (destTable) => {
  if (!order?.id) return;
  try {
    console.log("🧩 Merging table...");
    await secureFetch(`/orders/${order.id}/merge-table${identifier}`, {
      method: "PATCH",
      body: JSON.stringify({ target_table_number: destTable.tableNum }),
    });

    // ✅ Wait for socket confirmation or fallback reload
    const handleMerged = (payload) => {
      if (payload?.order?.table_number === Number(destTable.tableNum)) {
        console.log("✅ Merge confirmed by socket:", payload);
        socket.off("order_merged", handleMerged);
        setShowMergeTableModal(false);
        navigate(`/transaction/${destTable.tableNum}`, {
          replace: true,
          state: { order: payload.order },
        });
      }
    };

    socket.on("order_merged", handleMerged);

    // Fallback in 1.5s if socket doesn't arrive
    setTimeout(() => {
      socket.off("order_merged", handleMerged);
      console.warn("⏳ Merge socket timeout — forcing reload");
      setShowMergeTableModal(false);
      navigate(`/transaction/${destTable.tableNum}`, { replace: true });
    }, 1500);
  } catch (err) {
    console.error("❌ Merge table failed:", err);
    alert(err.message || "Failed to merge table");
    setShowMergeTableModal(false);
  }
}}

/>



  </div>
);

  }
