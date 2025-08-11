import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "react-i18next";
import { useSwipeable } from "react-swipeable";
import ExtrasModal from "../modals/ExtrasModal";
import DiscountModal from "../modals/DiscountModal";
import PaymentModal from "../modals/PaymentModal";
import { useHeader } from "../context/HeaderContext";
import { useOutletContext } from "react-router-dom";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import MoveTableModal from "../components/MoveTableModal";
import MergeTableModal from "../components/MergeTableModal";
 const API_URL = import.meta.env.VITE_API_URL || "";
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
export default function TransactionScreen({ isSidebarOpen }) {
  useRegisterGuard();
  const { tableId, orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialOrder = location.state?.order || null;
    const { t } = useTranslation(); // ✅ Enable translations
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [subOrders, setSubOrders] = useState([]);
  const [activeSplitMethod, setActiveSplitMethod] = useState(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const orderType = orderId ? "phone" : "table";
  const categories = [...new Set(products.map((p) => p.category))].filter(Boolean);
  const [excludedItems, setExcludedItems] = useState([]);
const [excludedCategories, setExcludedCategories] = useState([]);
const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
const activeCategory = categories[currentCategoryIndex] || "";
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
// 1. Add drinksList state at the top
const [drinksList, setDrinksList] = useState([]);
useEffect(() => {
  fetch(`${API_URL}/api/drinks`)
    .then(res => res.json())
    .then(data => setDrinksList(data.map(d => d.name)))
    .catch(() => setDrinksList([]));
}, []);

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
      const matchedDrink = products.find(p =>
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
  setHeader({
    title: orderId
      ? order?.customer_name || order?.customer_phone || t("Phone Order")
      : `${t("Table")} ${tableId}`,
    subtitle: orderId
      ? [
          order?.customer_phone ? `📞 ${order.customer_phone}` : null,
          order?.customer_address ? `📍 ${order.customer_address}` : null,
        ].filter(Boolean).join("   ")
      : undefined,
    // tableNav: Show only for table orders, not phone
    tableNav: !orderId ? (
      <TableNavigationRow
        tableId={tableId}
        navigate={navigate}
        t={t}
        cartMode={false}
      />
    ) : null,
  });
  // Optionally clean up when unmounting
  return () => setHeader({});
}, [orderId, order, tableId, t, navigate, setHeader]);

useEffect(() => {
  fetch(`${API_URL}/api/category-images`)
    .then(res => res.json())
    .then(data => {
      const dict = {};
    data.forEach(({ category, image }) => {
  dict[category.trim().toLowerCase()] = `/uploads/${image}`;
});

      setCategoryImages(dict);
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
}, [products]);

useEffect(() => {
  fetch(`${API_URL}/api/kitchen/compile-settings`)
    .then(res => res.json())
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

useEffect(() => {
  const fetchExtrasGroups = async () => {
    try {
      const res = await fetch(`${API_URL}/api/extras-groups`);
      const data = await res.json();
      setExtrasGroups(
  data.map(g => ({
    groupName: g.groupName || g.group_name,
    items: typeof g.items === "string" ? JSON.parse(g.items) : g.items || []
  }))
);

      console.log("Fetched extras groups:", data); // <--- Add this
    } catch (err) {
      console.error("❌ Failed to load extras:", err);
    }
  };
  fetchExtrasGroups();
}, []);


    // --- New split payment state ---
  const [splits, setSplits] = useState({
    Cash: 0,
    "Credit Card": 0,
    Sodexo: 0,
    Multinet: 0,
  });


    // New: payment confirm with splits
const confirmPaymentWithSplits = async (splits) => {
  const totalDue = calculateTotal(); // assume cartItems has all unpaid
  const receiptId = uuidv4();

const enhancedItems = cartItems.map((i) => ({
  ...i,
  product_id: i.product_id || i.id,
  quantity: i.quantity,
  price: i.price,
  ingredients: i.ingredients,
  extras: i.extras,
  unique_id: i.unique_id,
  payment_method: null,
  receipt_id: receiptId,
  confirmed: true,
  discountType: discountValue > 0 ? discountType : null,
  discountValue: discountValue > 0 ? discountValue : 0,
}));

  // 👉 Insert order with all items (once)
await fetch(`${API_URL}/api/orders/sub-orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    order_id: order.id,
    total: totalDue,
    payment_method: "Split",
    receipt_id: receiptId,
    items: enhancedItems
  }),
});


// Before calling fetch(`${API_URL}/api/orders/receipt-methods", ...)
const cleanedSplits = {};
Object.entries(splits).forEach(([method, amt]) => {
  const val = parseFloat(amt);
  if (val > 0) cleanedSplits[method] = val;
});
await fetch(`${API_URL}/api/orders/receipt-methods`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    order_id: order.id,        // <-- make sure this is included!
    receipt_id: receiptId,     // (if you already have it; else backend creates)
    methods: cleanedSplits
  }),
});









  await new Promise((r) => setTimeout(r, 100));
  // Play paid sound for split/suborder payments (NEW LINE)
if (window && typeof window.playPaidSound === "function") window.playPaidSound();
await refreshReceiptAfterPayment();
await fetchOrderItems(order.id);
await fetchSubOrders();
setSelectedForPayment([]);
setShowPaymentModal(false);




  const res = await fetch(`${API_URL}/api/orders/${order.id}/items`);
  const allItems = await res.json();
  const isFullyPaid = allItems.every((item) => item.paid_at);

  if (isFullyPaid) {
   await fetch(`${API_URL}/api/orders/${order.id}/status`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    status: "paid",
    total: totalDue,
    // Do NOT send payment_method here. Or, if you must, join the keys:
    payment_method: Object.keys(splits).filter(k => splits[k] > 0).join("+")
  }),
});


    setOrder((prev) => ({ ...prev, status: "paid" }));
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
  className="ml-2 px-3 py-1 rounded bg-yellow-400 hover:bg-yellow-500 text-white font-bold"
>
  🔀 {t("Move Table")}
</button>
<button
  onClick={() => setShowMergeTableModal(true)}
  className="ml-2 px-3 py-1 rounded bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-bold"
>
  🧩 {t("Merge Table")}
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
      const res = await fetch(`${API_URL}/api/products`); // ✅ use relative path
      const data = await res.json();

      console.log("Fetched products in TransactionScreen:", data);  // Debug
      setProducts(data);

      const categories = [...new Set(data.map((p) => p.category))].filter(Boolean);
      console.log("Categories found in TransactionScreen:", categories);  // Debug

      if (categories.length > 0) setCurrentCategoryIndex(0);
    } catch (error) {
      console.error("❌ Error fetching products:", error);
    }
  };
  fetchProducts();
}, []);


useEffect(() => {
  return () => {
    if (order?.id && cartItems.length === 0) {
     fetch(`${API_URL}/api/orders/${order.id}/reset-if-empty`, { method: "PATCH" });
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
  const fetchPhoneOrder = async (orderId) => {
    try {
      const res = await fetch(`${API_URL}/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch phone order");
      const newOrder = await res.json();

      // Fetch items for this phone order
      const itemsRes = await fetch(`${API_URL}/api/orders/${newOrder.id}/items`);
      const items = await itemsRes.json();

      const parsedItems = items.map(item => {
        const extras = safeParseExtras(item.extras);
        return {
          id: item.product_id,
          name: item.name || item.order_item_name || item.product_name,
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
ingredients: Array.isArray(item.ingredients)
  ? item.ingredients
  : (typeof item.ingredients === "string"
      ? JSON.parse(item.ingredients || "[]")
      : []),

          extras,
          unique_id: item.unique_id || `${item.product_id}-${JSON.stringify(extras)}`,
          confirmed: item.confirmed ?? true,
          paid: !!item.paid_at,
          payment_method: item.payment_method ?? "Unknown",
          receipt_id: item.receipt_id || "❌ NO RECEIPT",
          note: item.note || "",
          kitchen_status: item.kitchen_status || ""
        };
      });

      setCartItems(parsedItems); // Show all items, paid and unpaid
      setReceiptItems(parsedItems.filter(i => i.paid && i.receipt_id));

      // Smart status override
      let correctedStatus = newOrder.status;
      if (parsedItems.some(i => !i.confirmed)) {
        correctedStatus = "confirmed";
      } else if (parsedItems.some(i => i.confirmed && !i.paid)) {
        correctedStatus = "confirmed";
      } else if (parsedItems.every(i => i.confirmed && i.paid)) {
        correctedStatus = "paid";
      }
      setOrder({ ...newOrder, status: correctedStatus });
    } catch (error) {
      console.error("❌ Error fetching phone order:", error);
    } finally {
      setLoading(false);
    }
  };

  const createOrFetchTableOrder = async (tableId) => {
    try {
      let newOrder;
      const res = await fetch(`${API_URL}/api/orders?table_number=${tableId}`);
      if (!res.ok) throw new Error("Failed to fetch order");
      const data = await res.json();

      if (data.length > 0) {
        newOrder = data[0];
      } else {
        const createRes = await fetch(`${API_URL}/api/orders`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ table_number: tableId, total: 0, order_type: "table" }),
});

        if (!createRes.ok) throw new Error("Failed to create order");
        newOrder = await createRes.json();
      }

      // 🔄 Fetch items to verify real status
      const itemsRes = await fetch(`${API_URL}/api/orders/${newOrder.id}/items`);
      const items = await itemsRes.json();

      const parsedItems = items.map(item => {
        const extras = safeParseExtras(item.extras);
        return {
          id: item.product_id,
          name: item.name || item.order_item_name || item.product_name,
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
ingredients: Array.isArray(item.ingredients)
  ? item.ingredients
  : (typeof item.ingredients === "string"
      ? JSON.parse(item.ingredients || "[]")
      : []),

          extras,
          unique_id: item.unique_id || `${item.product_id}-${JSON.stringify(extras)}`,
          confirmed: item.confirmed ?? false,
          paid: !!item.paid_at,
          payment_method: item.payment_method ?? "Unknown",
          receipt_id: item.receipt_id || "❌ NO RECEIPT",
          note: item.note || "",
          kitchen_status: item.kitchen_status || ""
        };
      });

      setCartItems(parsedItems);
      setReceiptItems(parsedItems.filter(i => i.paid && i.receipt_id));

      let correctedStatus = newOrder.status;
      if (parsedItems.some(i => !i.confirmed)) {
        correctedStatus = "confirmed";
      } else if (parsedItems.some(i => i.confirmed && !i.paid)) {
        correctedStatus = "confirmed";
      } else if (parsedItems.every(i => i.confirmed && i.paid)) {
        correctedStatus = "paid";
      }
      setOrder({ ...newOrder, status: correctedStatus });
    } catch (error) {
      console.error("❌ Error creating or fetching order:", error);
    } finally {
      setLoading(false);
    }
  };

  // 💡 If you pass orderId for phone, use that; if only tableId, use that logic
  if (orderId) {
    fetchPhoneOrder(orderId);
  } else if (tableId) {
    createOrFetchTableOrder(tableId);
  }
}, [tableId, orderId]);


  const fetchOrderItems = async (orderId) => {
  try {
    const response = await fetch(`${API_URL}/api/orders/${orderId}/items`);
const items = await response.json();
if (!Array.isArray(items)) {
  console.error("❌ Expected items to be an array but got:", items);
  return;
}


    const formatted = items.map((item) => {
      const extras = safeParseExtras(item.extras);
      return {
        id:        item.product_id,
        name: item.name || item.order_item_name || item.product_name,
        quantity:  parseInt(item.quantity, 10),
        price:     parseFloat(item.price),
        ingredients: Array.isArray(item.ingredients)
  ? item.ingredients
  : (typeof item.ingredients === "string"
      ? JSON.parse(item.ingredients || "[]")
      : []),

        extras,
        unique_id: item.unique_id,
        // ⚠️ keep confirmed if you need it elsewhere, but…
        confirmed: item.confirmed ?? true,
        // ✅ paid_at drives the split now:
        paid:      !!item.paid_at,
        payment_method: item.payment_method ?? "Unknown",
        note: item.note || "",
         kitchen_status: item.kitchen_status || ""// ✅ ensures note persists after refresh or sub-order

      };
    });

    // ONLY unpaid (paid === false) go into cart
    setCartItems(formatted);
    // ONLY paid (paid === true) go into receipt
    setReceiptItems( formatted.filter(i =>  i.paid) );
  } catch (err) {
    console.error("Failed to fetch items", err);
  }
};

  const calculateTotal = () =>
    cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

const updateOrderStatus = async (newStatus, total = null, payment_method = null) => {
  try {
    const res = await fetch(`${API_URL}/api/orders/${order.id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, total, payment_method }), // <-- ensure total
    });
    const updated = await res.json();
    setOrder(updated);
    return updated;
  } catch (error) {
    console.error("❌ Error updating order status:", error);
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
  if (!order || !order.status) return;

  const total = cartItems
    .filter(i => selectedForPayment.includes(i.unique_id))
    .reduce((sum, i) => sum + i.price * i.quantity, 0);
  const receiptId = uuidv4();
  const safeCartItems = Array.isArray(cartItems) ? cartItems : [];

  // If cart is empty, go back to TableOverview
  if (cartItems.length === 0) {
    navigate("/tables");
    return;
  }

  // 1️⃣ If closing, block if any item is preparing
  if (
    getButtonLabel() === "Close" &&
    hasPreparingItems(receiptItems.concat(cartItems))
  ) {
    showToast("⚠️ Table cannot be closed: preparing");
    return;
  }

  // 🟢 Step 2: Confirm order (and save items)
  if (cartItems.some(i => !i.confirmed)) {
    const updated = await updateOrderStatus("confirmed", total);
    if (!updated) return;

    if (window && window.playNewOrderSound) {
      window.playNewOrderSound();
    }

    const unconfirmedItems = safeCartItems.filter(i => !i.confirmed);

    if (unconfirmedItems.length > 0) {
      await fetch(`${API_URL}/api/orders/order-items`, {  
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: updated.id,
          receipt_id: null, // not paid yet
items: unconfirmedItems.map((i) => ({
  product_id: i.id,
  quantity: i.quantity,
  price: i.price,
  ingredients: i.ingredients,
  extras: i.extras,
  unique_id: i.unique_id,
  note: i.note || null,
  confirmed: true,
  kitchen_status: "new", // <-- THIS FIXES IT FOR ALL!
  payment_method: null,
  receipt_id: null,
  discountType: discountValue > 0 ? discountType : null,
  discountValue: discountValue > 0 ? discountValue : 0,
}))


        }),
      });
    }

    setOrder((prev) => ({ ...prev, status: "confirmed" }));
    await fetchOrderItems(updated.id); // refresh from DB

    // For phone orders, go back to main after confirm!
    if (orderId) {
      navigate("/orders");
      return;
    }
    return; // Don't continue to pay/close logic in this run!
  }

  // 🟡 Step 3: Open payment modal ONLY for table orders if there are unpaid, confirmed items
  if (
    order.status === "confirmed" &&
    !orderId &&
    cartItems.some(i => !i.paid && i.confirmed)
  ) {
    setShowPaymentModal(true);
    return;
  }

  // 🔵 Step 4: Try to close if all paid
  const allPaid = safeCartItems.every((i) => i.paid);

if ((order.status === "paid" || allPaid) && safeCartItems.length > 0) {
  // PATCH: Only allow close if ALL items are delivered!
  if (!allItemsDelivered(safeCartItems)) {
    showToast("⚠️ Table cannot be closed: Not all items delivered!");
    setTimeout(() => navigate("/tables"), 1000);
    return;
  }

  await fetch(`${API_URL}/api/orders/${order.id}/close`, { method: "POST" });


  if (order.order_type === "phone" || orderId) {
    navigate("/orders");
  } else {
    navigate("/tables");
  }
  // 🔵 ADD THIS AFTER CLOSE + NAVIGATE
  setDiscountValue(0);
  setDiscountType("percent");
}


};






const refreshReceiptAfterPayment = async () => {
  try {
    const res = await fetch(`${API_URL}/api/orders/${order.id}/items`);
    if (!res.ok) throw new Error("Failed to refresh receipt");
    const data = await res.json();

    const fetchedItems = data.map((item) => {
      const extras = safeParseExtras(item.extras);
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

    await fetch(`${API_URL}/api/orders/sub-orders`, {
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
// Before calling fetch(`${API_URL}/api/orders/receipt-methods`, ...)
const cleanedSplits = {};
Object.entries(splits).forEach(([method, amt]) => {
  const val = parseFloat(amt);
  if (val > 0) cleanedSplits[method] = val;
});
await fetch(`${API_URL}/api/orders/receipt-methods`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    order_id: order.id,        // <-- make sure this is included!
    receipt_id: receiptId,     // (if you already have it; else backend creates)
    methods: cleanedSplits
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
    const itemsRes2 = await fetch(`${API_URL}/api/orders/${order.id}/items`);
    const allItems2 = await itemsRes2.json();
    const isFullyPaid2 = allItems2.every(item => item.paid_at);
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

  const hasUnconfirmed = cartItems.some((i) => !i.confirmed);
  // Only show "Pay" if there are unpaid and confirmed items
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

  // If product has extras, open modal (keep existing logic)
  if (product?.selectedExtrasGroup?.length) {
    setNote("");
    setSelectedProduct(product);
    setSelectedExtras([]);
    setShowExtrasModal(true);
    return;
  }

  // NO EXTRAS: handle unique_id correctly
  const uniqueId = `${product.id}-NO_EXTRAS`;
  const hasOld = cartItems.some(
    (item) =>
      item.unique_id === uniqueId &&
      (item.confirmed === true || item.paid)
  );
  const finalUniqueId = hasOld ? `${product.id}-NO_EXTRAS-${uuidv4()}` : uniqueId;

  // ---- 1. Optimistically update UI (keep this) ----
  setCartItems((prev) => [
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
      confirmed: false,         // changed from false to true
      paid: false,
    },
  ]);



  setOrder((prev) => ({ ...prev, status: "confirmed" }));
};









const displayTotal = cartItems
  .filter(i => !i.paid)
  .reduce((sum, i) => sum + (i.price * i.quantity), 0);


  const removeItem = (uniqueId) => {
    setCartItems((prev) =>
      prev.filter((item) => item.unique_id !== uniqueId || item.confirmed)
    );
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
      const res = await fetch(`${API_URL}/api/orders/${order.id}/suborders`);
      const data = await res.json();
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
        const res = await fetch(`${API_URL}/api/reports/receipt-methods/${receiptId}`);
        const methods = await res.json();

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
<div className={`relative flex flex-col h-screen transition-all duration-300 ${isSidebarOpen ? "pl-[180px]" : "pl-[120px]"}`}>
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

  // Responsive helper
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Mobile cart drawer
  const [cartOpen, setCartOpen] = useState(false);


  if (loading) return <p className="p-4 text-center">{t("Loading...")}</p>;

return (
<div
  className="flex-1 flex flex-col h-screen transition-all duration-300 ease-in-out"
  style={{
    minWidth: 0,
    width: "110%",
  }}
>

    {/* --- Main Content: Category Rail, Products, Cart --- */}
    <div className="flex flex-1 h-full overflow-hidden pr-1  md:pr-[450px]">
  {/* --- Categories Sidebar: 2 Columns --- */}
<aside
  className={`w-full md:min-w-[40px] md:max-w-[300px] md:pl-[10px] px-4 py-8 transition-all duration-300 ${
    isMobile ? "block" : "flex justify-center items-start"
  }`}

>
<div
  className="
    grid grid-cols-2 gap-x-[14px] gap-y-[14px]
    bg-gradient-to-br from-blue-50 via-indigo-100 to-blue-200 dark:from-blue-950 dark:via-blue-900 dark:to-indigo-950
    backdrop-blur-xl rounded-3xl
    p-3 shadow-2xl border-2 border-blue-200/40 dark:border-indigo-900/60
    overflow-y-auto custom-scrollbar
    w-[260px] md:w-[320px] lg:w-[360px]
    min-h-[420px] md:min-h-[480px] lg:min-h-[520px]
    ml-4
  "
>




    {categories.map((cat, idx) => (
      <button
        key={cat}
        onClick={() => setCurrentCategoryIndex(idx)}
        className={`
          aspect-square w-full max-w-[110px]
          flex flex-col items-center justify-center
          rounded-2xl border-2
          bg-white/20 dark:bg-blue-900/30 backdrop-blur-xl
          shadow-2xl hover:shadow-3xl
          border-blue-200/30
          transition
          ${currentCategoryIndex === idx
            ? "ring-2 ring-fuchsia-400 scale-105"
            : "opacity-90 hover:opacity-100"
          }
        `}
      >
       <img
  src={
    categoryImages[cat.trim().toLowerCase()]
      ? /^https?:\/\//.test(categoryImages[cat.trim().toLowerCase()])
        ? categoryImages[cat.trim().toLowerCase()]
        : `${API_URL}/uploads/${categoryImages[cat.trim().toLowerCase()].replace(/^\/?uploads\//, "")}`
      : ""
  }
  alt=""
  className={`w-14 h-14 rounded-2xl object-cover border shadow ${categoryImages[cat.trim().toLowerCase()] ? "" : "hidden"}`}
/>


        <span className={categoryImages[cat.trim().toLowerCase()] ? "hidden" : "text-4xl"}>
          {categoryIcons[cat] || categoryIcons.default}
        </span>
<span className="mt-1 text-[13px] font-bold text-center leading-tight break-all whitespace-pre-line">
  {t(cat).split(" ").join("\n")}
</span>

      </button>
    ))}
  </div>
</aside>



  {/* --- Center: Product Grid --- */}
  <main className="flex-1 overflow-y-auto py-8  transition md:pr-[60px] md:pl-[2px]">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-x-12 gap-y-4">

      {products
        .filter((p) =>
          (p.category || "").trim().toLowerCase() === (activeCategory || "").trim().toLowerCase()
        )
        .map((product) => (
          <div
            key={product.id}
            onClick={() => addToCart(product)}
            className="cursor-pointer group bg-white/80 dark:bg-zinc-900 border-2 border-blue-100/60 dark:border-zinc-800/60 rounded-2xl shadow-md hover:shadow-2xl transition hover:scale-105 flex flex-col items-center p-2 aspect-[3/4] min-h-[150px] max-w-[120px] mx-auto relative"
          >
          <img
  src={
    product.image
      ? product.image
      : "https://via.placeholder.com/100?text=🍽️"
  }
  alt={product.name}
  className="w-20 h-20 object-cover rounded-xl mb-1 border shadow"
/>


            {product.discountType !== "none" && product.discountValue > 0 && (
              <span className="absolute top-2 right-2 bg-gradient-to-r from-yellow-300 to-pink-200 text-xs text-amber-800 font-bold px-2 py-0.5 rounded-full shadow">
                % {product.discountValue} {t(product.discountType)}
              </span>
            )}
            <div className="font-bold text-blue-900 dark:text-blue-200 text-xs truncate w-full text-center">
              {product.name}
            </div>



            <div className="mt-auto text-indigo-700 dark:text-indigo-300 font-extrabold text-lg text-center w-full">
              ₺{parseFloat(product.price).toFixed(2)}
            </div>

          </div>
        ))}
      {products.filter((p) =>
        (p.category || "").trim().toLowerCase() === (activeCategory || "").trim().toLowerCase()
      ).length === 0 && (
        <div className="col-span-full text-center text-gray-400 text-lg font-semibold py-10">
          {t("No products in this category.")}
        </div>
      )}
    </div>
  </main>



      {/* --- Right: Cart Sidebar (always visible on desktop) --- */}
<aside
  className="
    fixed top-16 right-0 z-50
    w-full md:w-[350px] md:max-w-[410px]
    h-[calc(100vh-64px)] md:h-[calc(100vh-64px)]
    bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl shadow-2xl flex flex-col
    transition-all duration-300 ease-in-out
  "
>

        {/* --- Cart Items List --- */}
        <div className="flex-1 overflow-y-auto pt-2 pr-4 pb-4 pl-4">



          {cartItems.length === 0 ? (
            <div className="text-gray-400 font-semibold text-center py-8">{t("Cart is empty.")}</div>
          ) : (
            <ul className="flex flex-col gap-3">

              {cartItems.map((item, idx) => (
              <li key={`${item.id}-${idx}`} className="flex flex-col gap-2 rounded-xl bg-white dark:bg-zinc-900 border border-indigo-100/60 dark:border-zinc-800/60 shadow p-3">

  {/* --- Top: Product Name, Total, Status --- */}
  <div className="flex items-start justify-between">
    <div className="flex items-center gap-2 flex-1 min-w-0">
      {/* Select for Payment */}
      <input
        type="checkbox"
        checked={selectedForPayment.includes(item.unique_id)}
        onChange={(e) => {
          setSelectedForPayment((prev) =>
            e.target.checked
              ? [...prev, item.unique_id]
              : prev.filter((id) => id !== item.unique_id)
          );
        }}
        disabled={item.paid || item.confirmed === false}
        className="accent-indigo-500 w-5 h-5 rounded-md border"
      />
<span
  className="
    font-bold text-base leading-tight
    break-words
    max-w-[160px] md:max-w-[220px]
    text-gray-900 dark:text-white
    text-left
    block
    "
  style={{
    wordBreak: "break-word",
    whiteSpace: "normal",
  }}
>
  {item.name}
</span>
    </div>
    {/* Price */}
    <span className="font-extrabold text-indigo-700 dark:text-indigo-200 text-base ml-2">
      ₺{(parseFloat(item.price) * item.quantity).toFixed(2)}
    </span>
  </div>

  {/* --- Extras as Chips --- */}
  {item.extras?.length > 0 && (
    <div className="flex flex-wrap gap-2 ml-7 mt-1">
      {item.extras.map((ex, exIdx) => (
        <span key={exIdx} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 rounded-full text-xs font-semibold shadow-sm">
          <span>{ex.name}</span>
          <span className="opacity-80">×{ex.quantity || 1}</span>
          <span className="font-normal text-[11px] text-indigo-600">
            ₺{(parseFloat(ex.price || ex.extraPrice) * (ex.quantity || 1)).toFixed(2)}
          </span>
        </span>
      ))}
    </div>
  )}

  {/* --- Notes as colored pill --- */}
  {item.note?.trim() && (
    <div className="flex items-center gap-2 ml-7 mt-1">
      <span className="bg-yellow-50 dark:bg-yellow-900/70 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full text-xs font-medium shadow-sm">
        📝 {item.note}
      </span>
    </div>
  )}

  {/* --- Bottom: Quantity, Status, Edit/Remove --- */}
  <div className="flex items-center justify-between mt-2 ml-7">

    {/* Quantity Controls */}
 <div className="flex items-center gap-2">
  <button
    onClick={() => decrementCartItem(item.unique_id)}
    disabled={
      item.quantity <= 1 ||
      item.paid ||
      item.confirmed
    }
    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-indigo-200 dark:bg-zinc-700 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-200 font-bold flex items-center justify-center shadow transition"
    type="button"
  >–</button>
  <span className="font-extrabold text-base text-gray-800 dark:text-gray-200 min-w-[20px] text-center">{item.quantity}</span>
  <button
    onClick={() => incrementCartItem(item.unique_id)}
    disabled={item.paid || item.confirmed}
    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-green-200 dark:bg-zinc-700 dark:hover:bg-green-800 text-green-700 dark:text-green-200 font-bold flex items-center justify-center shadow transition"
    type="button"
  >+</button>
</div>


    {/* Badges */}
    <div className="flex items-center gap-1 ml-2">
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold
        ${item.paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {item.paid ? t("paid") : t("DUE")}
      </span>
      {/* Payment method */}
      {item.paid && item.payment_method && item.payment_method !== "Unknown" && (
        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1">
          {item.payment_method === "Cash" && <>💵{" "}</>}
          {item.payment_method === "Credit Card" && <>💳{" "}</>}
          {item.payment_method === "Sodexo" && <>🍽️{" "}</>}
          {item.payment_method === "Multinet" && <>🪙{" "}</>}
          {t(item.payment_method)}
        </span>
      )}
      {/* Kitchen status */}
      {item.kitchen_status && !item.paid && (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shadow-sm
          ${item.kitchen_status === "preparing" ? "bg-orange-100 text-orange-600" : ""}
          ${item.kitchen_status === "delivered" ? "bg-green-100 text-green-700" : ""}
          ${item.kitchen_status === "cancelled" ? "bg-red-200 text-red-700" : ""}
        `}>
          {item.kitchen_status === "preparing" && t("Preparing")}
          {item.kitchen_status === "delivered" && t("Delivered")}
          {item.kitchen_status === "cancelled" && t("Cancelled")}
        </span>
      )}
    </div>

    {/* Edit & Remove (only for unconfirmed, unpaid items) */}
    <div className="flex items-center gap-1 ml-2">
      {!item.confirmed && (
        <>
          <button
            onClick={() => removeItem(item.unique_id)}
            className="rounded-full w-7 h-7 flex items-center justify-center bg-red-500/90 hover:bg-red-600/95 text-white text-base shadow transition"
            title={t("Remove")}
          >✖</button>
          <button
            onClick={() => {
              setEditingCartItemIndex(idx);
              const fullProduct = products.find((p) => p.id === item.id);
              setSelectedProduct({
                ...item,
                quantity: item.quantity,
                price: fullProduct
                  ? parseFloat(fullProduct.price)
                  : item.price,
                selectedExtrasGroup: fullProduct?.selectedExtrasGroup || [],
                ingredients: fullProduct?.ingredients || [],
              });
              setSelectedExtras(item.extras && Array.isArray(item.extras)
                ? item.extras.map(ex => ({ ...ex }))
                : []
              );
              setShowExtrasModal(true);
            }}
            className="rounded-full w-7 h-7 flex items-center justify-center bg-yellow-400 hover:bg-yellow-500 text-white text-base shadow transition"
            title={t("Edit")}
          >✎</button>
        </>
      )}
    </div>
  </div>
</li>

              ))}
            </ul>
          )}
        </div>
        {/* --- Cart Footer --- */}
        <div className="border-t border-blue-100 dark:border-zinc-800 p-4 bg-white/95 dark:bg-zinc-900/95 flex flex-col gap-2 shadow-t">
          <div className="flex justify-between text-base">
            <span className="text-gray-700">{t("Subtotal")}:</span>
            <span className="text-gray-900 font-bold">
  ₺{cartItems.filter(i => !i.paid).reduce((sum, i) => {
    // base price
    const base = i.price * i.quantity;
    // extras price (each extra: price * quantity * product quantity)
    const extras = (i.extras || []).reduce((s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)), 0) * i.quantity;
    return sum + base + extras;
  }, 0).toFixed(2)}
</span>

          </div>
          {discountValue > 0 && (
            <div className="flex justify-between text-base font-bold text-pink-700">
              <span>🎁 {t("Discount")}{discountType === "percent" ? ` (${discountValue}%)` : ` (-₺${discountValue})`}</span>
              <span>
                -{discountType === "percent"
                  ? `₺${(cartItems.filter(i => !i.paid).reduce((sum, i) => {
  const base = i.price * i.quantity;
  const extras = (i.extras || []).reduce((s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)), 0) * i.quantity;
  return sum + base + extras;
}, 0)
 * (discountValue / 100)).toFixed(2)}`
                  : `₺${discountValue}`}
              </span>
            </div>
          )}
     <div className="flex justify-between items-center text-lg font-bold">
  <span>{t("Total")}:</span>
  <span className="text-indigo-800 dark:text-indigo-200 font-extrabold text-2xl">
    ₺{calculateDiscountedTotal().toFixed(2)}
  </span>
  <button onClick={clearUnconfirmedCartItems} className="ml-2 px-3 py-1 bg-gray-900 text-white text-xs rounded-full shadow hover:bg-gray-700">{t("Clear")}</button>
</div>

{/* --- NEW BUTTON ROW BELOW TOTAL --- */}
<div className="flex gap-2 mt-2 w-full">
  <button
    onClick={() => setShowDiscountModal(true)}
    className="flex-1 flex items-center justify-center px-2 py-1 rounded-lg bg-gradient-to-br from-fuchsia-500 via-indigo-500 to-blue-500 text-white font-bold shadow-sm text-xs md:text-sm hover:scale-105 transition min-w-[80px]"
    style={{ minHeight: 32, maxHeight: 36 }}
  >
    🎁 <span className="ml-1">{t("Discount")}</span>
  </button>
  <button
    onClick={handleOpenCashRegister}
    className="flex-1 flex items-center justify-center px-2 py-1 rounded-lg bg-gradient-to-br from-blue-400 via-indigo-400 to-fuchsia-400 text-white font-bold shadow-sm text-xs md:text-sm hover:scale-105 transition min-w-[80px]"
    style={{ minHeight: 32, maxHeight: 36 }}
  >
    🗄️ <span className="ml-1">{t("Register")}</span>
  </button>
</div>

      <button
  onClick={handleMultifunction}
  disabled={order?.status === "closed" || !getButtonLabel()}
  className={`
    w-full py-3 mt-2 rounded-xl text-lg font-extrabold shadow-xl flex items-center justify-center gap-2 transition
    ${(order?.status === "closed" || !getButtonLabel())
      ? "bg-gray-300 text-white cursor-not-allowed"
      : "bg-gradient-to-r from-green-400 via-blue-400 to-indigo-400 text-white hover:brightness-105"
    }`}
>
  <span className="text-2xl">💸</span>
  <span className="text-xl font-bold leading-tight">
    {getButtonLabel() ? t(getButtonLabel()) : "—"}
  </span>
</button>

        </div>
      </aside>
    </div>

    {/* --- TOAST NOTIFICATION --- */}
    {toast.show && (
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-6 py-4 bg-red-600 text-white text-lg rounded-2xl shadow-xl animate-fade-in-up transition-all">
        {t(toast.message)}
      </div>
    )}

    {/* Hide scrollbars for aesthetic */}
    <style>{`
      .hide-scrollbar::-webkit-scrollbar { display: none; }
      .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    `}</style>


<style>{`
  .custom-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(100, 116, 139, 0.4); /* slate-500 */
    border-radius: 10px;
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
  }
`}</style>



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
    const res = await fetch(`${API_URL}/api/orders/${order.id}/move-table`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_table_number: newTable }),
    });
    if (res.ok) {
      setShowMoveTableModal(false);
      navigate(`/transaction/${newTable}`);
    } else {
      const data = await res.json();
      setShowMoveTableModal(false);
      alert(data.error || "Failed to move table");
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
    const res = await fetch(`${API_URL}/api/orders/${order.id}/merge-table`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_table_number: destTable }),
    });
    if (res.ok) {
      setShowMergeTableModal(false);
      navigate(`/transaction/${destTable}`);
    } else {
      const data = await res.json();
      setShowMergeTableModal(false);
      alert(data.error || "Failed to merge table");
    }
  }}
/>

  </div>
);

  }
