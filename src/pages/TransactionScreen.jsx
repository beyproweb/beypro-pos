import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
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
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import socket from "../utils/socket";
import { useAuth } from "../context/AuthContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { getPaymentMethodLabel } from "../utils/paymentMethods";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import TableActionButtons from "../components/TableActionButtons";

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
const deriveExtrasGroupRefs = (product) => {
  if (!product || typeof product !== "object") return null;

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

  const extrasRefs = product.extrasGroupRefs || {};
  const extrasIds = Array.isArray(extrasRefs.ids) ? extrasRefs.ids : [];
  const extrasNames = Array.isArray(extrasRefs.names) ? extrasRefs.names : [];

  extrasIds.forEach(addId);
  extrasNames.forEach(addName);

  const selectionIds = Array.isArray(product.selectedExtrasGroup)
    ? product.selectedExtrasGroup
    : Array.isArray(product.selected_extras_group)
    ? product.selected_extras_group
    : [];
  selectionIds.forEach(addId);

  const selectionNames = Array.isArray(product.selectedExtrasGroupNames)
    ? product.selectedExtrasGroupNames
    : [];
  selectionNames.forEach(addName);

  if (ids.size === 0 && names.size === 0) return null;

  return {
    ids: Array.from(ids),
    names: Array.from(names),
  };
};
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

const normalizeSuborderItems = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("⚠️ Failed to parse suborder items", err);
      return [];
    }
  }
  return [];
};

const isCancelledStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
};

const isActiveTableStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return !["closed", "cancelled", "canceled"].includes(normalized);
};

const isPaidItem = (item) => Boolean(item && (item.paid || item.paid_at));

export default function TransactionScreen() {
  useRegisterGuard();
  const paymentMethods = usePaymentMethods();
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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [editingCartItemIndex, setEditingCartItemIndex] = useState(null);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const extrasGroupsPromiseRef = useRef(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [subOrders, setSubOrders] = useState([]);
  const suborderItems = useMemo(() => {
    if (!Array.isArray(subOrders)) return [];
    return subOrders.flatMap((sub) => normalizeSuborderItems(sub?.items));
  }, [subOrders]);
  const [activeSplitMethod, setActiveSplitMethod] = useState(null);
  const [note, setNote] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [refundMethodId, setRefundMethodId] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const [isDebtSaving, setIsDebtSaving] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtForm, setDebtForm] = useState({ name: "", phone: "" });
  const [debtError, setDebtError] = useState("");
  const [debtLookupLoading, setDebtLookupLoading] = useState(false);
  const hasUnconfirmedCartItems = useMemo(
    () => cartItems.some((item) => !item.confirmed),
    [cartItems]
  );
  const hasConfirmedCartUnpaid = useMemo(
    () => cartItems.some((item) => item.confirmed && !isPaidItem(item)),
    [cartItems]
  );
  const allCartItemsPaid = useMemo(
    () => cartItems.every((item) => isPaidItem(item)),
    [cartItems]
  );
  const hasSuborderUnpaid = useMemo(
    () => suborderItems.some((item) => !isPaidItem(item)),
    [suborderItems]
  );
  const allSuborderPaid = useMemo(
    () => suborderItems.every((item) => isPaidItem(item)),
    [suborderItems]
  );
const [debtSearch, setDebtSearch] = useState("");
const [debtSearchResults, setDebtSearchResults] = useState([]);
const [debtSearchLoading, setDebtSearchLoading] = useState(false);
const orderType = String(
  order?.order_type || (orderId ? "phone" : "table") || "table"
).toLowerCase();
const normalizedStatus = (order?.status || "").toLowerCase();
// Debt can be added only when order is confirmed/paid AND there are confirmed items and no unconfirmed items
const hasUnconfirmedItems = cartItems.some((i) => !i.confirmed);
const hasConfirmedUnpaidItems = cartItems.some((i) => i.confirmed && !i.paid);
const canShowDebtButton = normalizedStatus === "confirmed";
const isDebtEligible = canShowDebtButton && !hasUnconfirmedItems && hasConfirmedUnpaidItems;
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

const isCashMethod = useCallback(
  (methodId) => {
    if (!methodId) return false;
    const method = paymentMethods.find((m) => m.id === methodId);
    const label = method?.label || methodId;
    return isCashLabel(label);
  },
  [paymentMethods]
);

const reopenOrderIfNeeded = useCallback(
  async (orderCandidate) => {
    if (!orderCandidate) return null;
    const status = (orderCandidate.status || "").toLowerCase();
    if (status !== "closed" || orderCandidate.is_paid) return null;
    try {
      const reopened = await secureFetch(`/orders/${orderCandidate.id}/reopen${identifier}`, {
        method: "PATCH",
      });
      return reopened;
    } catch (err) {
      console.error("❌ Failed to reopen unpaid order:", err);
      showToast(t("Failed to reopen unpaid order"));
      return null;
    }
  },
  [identifier, t]
);

const handleCartPrint = async () => {
  if (!order?.id) {
    showToast(t("No order selected to print"));
    return;
  }
  try {
    const printable = await fetchOrderWithItems(order.id, identifier);
    if (!Array.isArray(printable.items) || printable.items.length === 0) {
      printable.items = cartItems;
    }
    const text = renderReceiptText(printable, getReceiptLayout());
    const ok = await printViaBridge(text);
    showToast(
      ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
    );
  } catch (err) {
    console.error("❌ Print failed:", err);
    showToast(t("Failed to print receipt"));
  }
};

const handleOpenDebtModal = async () => {
  if (!order?.id) {
    showToast(t("Select an order first"));
    return;
  }
  if (!isDebtEligible) {
    showToast(t("Order must be confirmed before adding debt"));
    return;
  }
  setDebtError("");
  setDebtSearch("");
  setDebtSearchResults([]);
  setDebtLookupLoading(true);

  let phone = (order.customer_phone || "").trim();
  let name = (order.customer_name || "").trim();

  if (phone) {
    try {
      const existingCustomer = await secureFetch(`/customers/by-phone/${encodeURIComponent(phone)}`);
      if (existingCustomer) {
        if (!name && existingCustomer.name) name = existingCustomer.name;
        if (!phone && existingCustomer.phone) phone = existingCustomer.phone;
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch existing customer for debt:", err);
    }
  }

  setDebtForm({ name, phone });
  setDebtLookupLoading(false);
  setShowDebtModal(true);
};

const handleDebtSearch = async (value) => {
  const term = value.trim();
  setDebtSearch(value);
  if (!term) {
    setDebtSearchResults([]);
    return;
  }
  setDebtSearchLoading(true);
  try {
    const query = `/customers?search=${encodeURIComponent(term)}`;
    const results = await secureFetch(query);
    setDebtSearchResults(Array.isArray(results) ? results.slice(0, 5) : []);
  } catch (err) {
    console.error("❌ Failed to search customers for debt:", err);
    setDebtSearchResults([]);
  } finally {
    setDebtSearchLoading(false);
  }
};

const handleSelectDebtCustomer = (customer) => {
  setDebtForm({
    name: customer?.name || "",
    phone: customer?.phone || "",
  });
  setDebtSearch(customer?.name || customer?.phone || "");
  setDebtSearchResults([]);
};

const handleAddToDebt = async () => {
  if (!order?.id) {
    showToast(t("Select an order first"));
    return;
  }
  if (isDebtSaving) return;

  const outstanding = Number(calculateDiscountedTotal().toFixed(2));
  const fallbackOutstanding = Number(order?.total) || 0;
  const amountToStore = outstanding > 0 ? outstanding : fallbackOutstanding;
  if (amountToStore <= 0) {
    setDebtError(t("No unpaid items to add to debt"));
    return;
  }

  const name = debtForm.name?.trim();
  const phone = debtForm.phone?.trim();

  if (!phone) {
    setDebtError(t("Customer phone is required for debt"));
    return;
  }
  if (!name) {
    setDebtError(t("Customer name is required for debt"));
    return;
  }

  try {
    setIsDebtSaving(true);
    const response = await secureFetch(`/orders/${order.id}/add-debt${identifier}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: name,
        customer_phone: phone,
        amount: amountToStore,
      }),
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    const updatedOrder = response.order || response;
    setOrder(updatedOrder);
    setCartItems([]);
    setReceiptItems([]);
    setSelectedForPayment([]);
    setSelectedCartItemIds(new Set());
    showToast(t("Order added to customer debt"));
    setShowDebtModal(false);

    if (tableId) {
      navigate("/tableoverview");
    } else if (orderId) {
      navigate("/orders");
    }
  } catch (err) {
    console.error("❌ Failed to add debt:", err);
    setDebtError(err.message || t("Failed to add order debt"));
  } finally {
    setIsDebtSaving(false);
  }
};


const renderCategoryButton = (cat, idx, variant = "desktop") => {
  const slug = (cat || "").trim().toLowerCase();
  const catSrc = categoryImages[slug] || "";
  const isActive = currentCategoryIndex === idx;
  const hasImg = !!catSrc;

  const baseClasses =
    "flex flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-center transition select-none";
const widthClass =
  variant === "mobile"
    ? "min-w-[100px] max-w-[110px] snap-start"
    : "w-full";
  const activeClasses = "border-indigo-500 bg-white shadow";
  const inactiveClasses = "border-slate-200 hover:border-indigo-300 hover:bg-slate-50";

  const imageClasses = "h-10 w-10 object-cover rounded-md"; // bigger ✔
  const iconClasses = "text-[20px] leading-tight";           // bigger ✔

  const labelClasses =
    "text-[12px] font-semibold text-slate-800 text-center leading-tight truncate max-w-[75px]"; // bigger ✔

  return (
    <button
      key={`${variant}-${cat}-${idx}`}
      type="button"
      onClick={() => setCurrentCategoryIndex(idx)}
      className={`${widthClass} ${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
    >
      {hasImg ? (
        <img src={catSrc} alt={cat} className={imageClasses} />
      ) : (
        <span className={iconClasses}>
          {categoryIcons[cat] || categoryIcons.default}
        </span>
      )}
      <span className={labelClasses}>{t(cat)}</span>
    </button>
  );
};




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
  const [isFloatingCartOpen, setIsFloatingCartOpen] = useState(false);
const cartScrollRef = useRef(null);
const lastVisibleCartItemRef = useRef(null);
const [expandedCartItems, setExpandedCartItems] = useState(() => new Set());
const [selectedCartItemIds, setSelectedCartItemIds] = useState(() => new Set());
const clearCartState = useCallback(() => {
  setCartItems([]);
  setReceiptItems([]);
  setSelectedForPayment([]);
  setSelectedCartItemIds(new Set());
  setShowPaymentModal(false);
  setExpandedCartItems(new Set());
  setSubOrders([]);
  setActiveSplitMethod(null);
  setEditingCartItemIndex(null);
  setSelectedProduct(null);
  setSelectedExtras([]);
  setNote("");
  setIsSplitMode(false);
  setShowExtrasModal(false);
  setSelectedPaymentMethod("");
  setIsFloatingCartOpen(false);
}, []);


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

useLayoutEffect(() => {
  // When cart changes, scroll to bottom
  const node = cartScrollRef.current;
  if (!node) return;

  requestAnimationFrame(() => {
    node.scrollTo({
      top: node.scrollHeight,
      behavior: "smooth",
    });
  });
}, [cartItems.length]);


const scrollCartToBottom = useCallback(() => {
  const node = cartScrollRef.current;
  if (!node) return;

  const bottom = Math.max(node.scrollHeight - node.clientHeight, 0);

  if (typeof node.scrollTo === "function") {
    try {
      node.scrollTo({ top: bottom, behavior: "smooth" });
      return;
    } catch {
      // fall through to direct assignment
    }
  }

  node.scrollTop = bottom;
}, []);

useEffect(() => {
  if (!window.socket) return;
  const refresh = () => {
    if (order?.order_type === "takeaway") {
      fetchTakeawayOrder(order.id);
    }
  };
  window.socket.on("orders_updated", refresh);
  return () => window.socket.off("orders_updated", refresh);
}, [order?.id, order?.order_type]);

useLayoutEffect(() => {
  const unpaidItems = cartItems.filter((item) => !item.paid);

  if (unpaidItems.length === 0) {
    lastVisibleCartItemRef.current = null;
    return;
  }

  const lastItem = unpaidItems[unpaidItems.length - 1];
  const identifier =
    lastItem?.unique_id ??
    `${lastItem?.id ?? "unknown"}-${unpaidItems.length - 1}`;

  if (lastVisibleCartItemRef.current === identifier) return;
  lastVisibleCartItemRef.current = identifier;

  requestAnimationFrame(() => {
    const node = cartScrollRef.current;
    const lastElement = node?.querySelector('li[data-cart-item="true"]:last-child');

    if (lastElement && typeof lastElement.scrollIntoView === "function") {
      lastElement.scrollIntoView({ block: "end", behavior: "smooth" });
      return;
    }

    requestAnimationFrame(() => {
      scrollCartToBottom();
    });
  });
}, [cartItems, scrollCartToBottom, selectedCartItemIds]);

const toggleCartItemExpansion = useCallback((itemId) => {
  if (!itemId) return;
  setExpandedCartItems((prev) => {
    const next = new Set(prev);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return next;
  });
}, []);

useEffect(() => {
  setExpandedCartItems((prev) => {
    const validKeys = new Set(
      cartItems.map((item, idx) => item.unique_id || `${item.id}-index-${idx}`)
    );

    let changed = false;
    const next = new Set();
    prev.forEach((key) => {
      if (validKeys.has(key)) {
        next.add(key);
      } else {
        changed = true;
      }
    });

    if (!changed && next.size === prev.size) return prev;
    return next;
  });
}, [cartItems]);

const toggleCartItemSelection = useCallback((itemId) => {
  if (!itemId) return;
  const key = String(itemId);
  setSelectedCartItemIds((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
}, []);

const clearSelectedCartItems = useCallback(() => {
  if (selectedCartItemIds.size === 0) return;

  let removedAny = false;
  const selectedKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));

  setCartItems((prev) =>
    prev.filter((item) => {
      const key = String(item.unique_id || item.id);
      const shouldRemove = selectedKeys.has(key) && !item.confirmed;

      if (shouldRemove) removedAny = true;
      return !shouldRemove;
    })
  );

  if (!removedAny) {
    showToast(t("Selected items cleared"));
    return;
  }

  setSelectedCartItemIds(new Set());
  setSelectedForPayment((prev) => prev.filter((id) => !selectedKeys.has(id)));
}, [selectedCartItemIds, t]);

useEffect(() => {
  ensureExtrasGroups().catch((err) => {
    console.error("❌ Failed to load extras groups:", err);
  });
}, [ensureExtrasGroups]);

useEffect(() => {
  setSelectedCartItemIds((prev) => {
    const validKeys = new Set(
      cartItems.map((item) => String(item.unique_id || item.id))
    );

    let changed = false;
    const next = new Set();

    prev.forEach((key) => {
      if (validKeys.has(key)) {
        next.add(key);
      } else {
        changed = true;
      }
    });

    if (!changed && next.size === prev.size) return prev;
    return next;
  });
}, [cartItems]);

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
      <TableActionButtons
        onMove={() => setShowMoveTableModal(true)}
        onMerge={() => setShowMergeTableModal(true)}
        cartMode={false}
        showLabels={false}
        moveLabel={t("Move Table")}
        mergeLabel={t("Merge Table")}
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

  const safeParseExtras = useCallback((extras) => {
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
  }, []);

  const computeItemLineTotal = useCallback(
    (item) => {
      const extrasList = safeParseExtras(item.extras);
      const extrasTotal = (Array.isArray(extrasList) ? extrasList : []).reduce(
        (acc, ex) => {
          const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
          const qty = Number(ex.quantity) || 1;
          return acc + price * qty;
        },
        0
      );
      const basePrice = parseFloat(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      return (basePrice + extrasTotal) * quantity;
    },
    [safeParseExtras]
  );

  // 💡 Compute total of selected cart items
  const selectedItemsTotal = cartItems
    .filter((item) => selectedCartItemIds.has(String(item.unique_id || item.id)))
    .reduce((sum, item) => sum + computeItemLineTotal(item), 0);

  const totalPaidAmount = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if (!item.paid) return sum;
      return sum + computeItemLineTotal(item);
    }, 0);
  }, [cartItems, computeItemLineTotal]);

  const selectedPaidRefundAmount = useMemo(() => {
    if (!selectedCartItemIds.size) return 0;
    const keys = new Set(Array.from(selectedCartItemIds, (id) => String(id)));
    return cartItems.reduce((sum, item) => {
      const key = String(item.unique_id || item.id);
      if (!keys.has(key) || !item.paid) return sum;
      return sum + computeItemLineTotal(item);
    }, 0);
  }, [cartItems, selectedCartItemIds, computeItemLineTotal]);

  const refundAmount = selectedPaidRefundAmount > 0 ? selectedPaidRefundAmount : totalPaidAmount;
  const hasPaidItems = refundAmount > 0;
  const isUnpaidPaymentMethod =
    (order?.payment_method || "").toLowerCase().trim() === "unpaid";
  const shouldShowRefundMethod = hasPaidItems && !isUnpaidPaymentMethod;
  const selectedCartItems = useMemo(() => {
    if (!selectedCartItemIds.size) return [];
    const keys = new Set(Array.from(selectedCartItemIds, (id) => String(id)));
    return cartItems.filter((item) => keys.has(String(item.unique_id || item.id)));
  }, [cartItems, selectedCartItemIds]);
 
// --- New split payment state ---
const [splits, setSplits] = useState({});

  const resolvePaymentLabel = useCallback(
    (id) => getPaymentMethodLabel(paymentMethods, id),
    [paymentMethods]
  );

  useEffect(() => {
    if (!paymentMethods.length) return;
    setSelectedPaymentMethod((prev) => {
      if (prev && paymentMethods.some((method) => method.id === prev)) {
        return prev;
      }
      return paymentMethods[0].id;
    });
    setSplits((prev) => {
      const next = {};
      let changed = false;
      paymentMethods.forEach((method) => {
        const key = method.id;
        const prevValue = prev?.[key];
        next[key] = typeof prevValue !== "undefined" ? prevValue : 0;
        if (next[key] !== prevValue) changed = true;
      });
      if (prev) {
        Object.keys(prev).forEach((key) => {
          if (!paymentMethods.some((method) => method.id === key)) {
            changed = true;
          }
        });
      }
      if (!changed) return prev;
      return next;
    });
  }, [paymentMethods]);

  const getDefaultRefundMethod = useCallback(() => {
    if (!paymentMethods.length) return "";
    const normalizedOrderPayment = (order?.payment_method || "").trim().toLowerCase();
    if (!normalizedOrderPayment) {
      return paymentMethods[0].id;
    }
    const match = paymentMethods.find((method) => {
      const label = (method.label || "").trim().toLowerCase();
      const id = (method.id || "").trim().toLowerCase();
      return label === normalizedOrderPayment || id === normalizedOrderPayment;
    });
    return match?.id || paymentMethods[0].id;
  }, [order?.payment_method, paymentMethods]);

  useEffect(() => {
    if (!paymentMethods.length) return;
    setRefundMethodId((prev) => {
      if (prev && paymentMethods.some((method) => method.id === prev)) {
        return prev;
      }
      return getDefaultRefundMethod();
    });
  }, [getDefaultRefundMethod, paymentMethods]);

  const openCancelModal = useCallback(() => {
    if (!order?.id) return;
    setCancelReason("");
    setRefundMethodId(getDefaultRefundMethod());
    setShowCancelModal(true);
  }, [getDefaultRefundMethod, order?.id]);

  const closeCancelModal = useCallback(() => {
    setShowCancelModal(false);
    setCancelReason("");
  }, []);

  const handleCancelConfirm = async () => {
    if (!order?.id) {
      showToast(t("Select an order first"));
      return;
    }
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      showToast(t("Enter a cancellation reason."));
      return;
    }
    const selectedItemsForCancel = selectedCartItems
      .map((item) => item.unique_id || item.id)
      .filter(Boolean)
      .map(String);
    const isPartialCancel = selectedItemsForCancel.length > 0;

    setCancelLoading(true);
    try {
      const payload = { reason: trimmedReason };
      if (shouldShowRefundMethod && refundMethodId) {
        payload.refund_method = refundMethodId;
      }
      if (isPartialCancel) {
        payload.items = selectedItemsForCancel;
      }

      const cancelResult = await secureFetch(`/orders/${order.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const orderIsCancelled = cancelResult?.orderCancelled ?? !isPartialCancel;
      const refundTargetAmount = isPartialCancel
        ? selectedPaidRefundAmount
        : refundAmount;
      if (refundTargetAmount > 0 && shouldShowRefundMethod) {
        const refundLabel =
          getPaymentMethodLabel(paymentMethods, refundMethodId) ||
          refundMethodId ||
          t("Unknown");
        const note = order?.id
          ? `Refund for Order #${order.id} (${refundLabel})`
          : t("Refund recorded");
        try {
          await logCashRegisterEvent({
            type: "expense",
            amount: Number(refundTargetAmount.toFixed(2)),
            note,
          });
        } catch (logErr) {
          console.warn("⚠️ Refund log failed:", logErr);
        }
      }
      if (orderIsCancelled) {
        showToast(t("Order cancelled"));
        clearCartState();
        setOrder((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        closeCancelModal();
        return;
      }

      showToast(t("Selected items cancelled"));
      await fetchOrderItems(order.id);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              total:
                typeof cancelResult?.newTotal === "number"
                  ? cancelResult.newTotal
                  : prev.total,
            }
          : prev
      );
      setSelectedCartItemIds(new Set());
      closeCancelModal();
    } catch (err) {
      console.error("❌ Cancel order failed:", err);
      showToast(err?.message || t("Failed to cancel order"));
    } finally {
      setCancelLoading(false);
    }
  };


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
    const cleanedSplits = {};
    Object.entries(splits || {}).forEach(([methodId, value]) => {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed > 0) {
        const label = resolvePaymentLabel(methodId);
        cleanedSplits[label] = parsed;
      }
    });

    // Optional guard: ensure sum equals total
    const sumSplits = Object.values(cleanedSplits).reduce((s, v) => s + v, 0);
    if (Math.abs(sumSplits - totalDue) > 0.005) {
      throw new Error("Split amounts must equal the total.");
    }
    const cashPortion = Object.entries(cleanedSplits).reduce((sum, [label, value]) => {
      if (isCashLabel(label)) {
        const numeric = Number(value);
        return sum + (Number.isFinite(numeric) ? numeric : 0);
      }
      return sum;
    }, 0);

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
    setSelectedCartItemIds(new Set());

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

    if (cashPortion > 0) {
      const note = order?.id ? `Order #${order.id} (split)` : "Split payment";
      await logCashRegisterEvent({ type: "sale", amount: cashPortion, note });
      await openCashDrawer();
    }

  } catch (err) {
    console.error("❌ confirmPaymentWithSplits failed:", err);
    // optionally toast
  }
};

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
      const token = getAuthToken();
      let path = "/products";

      if (!token) {
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

        if (rawIdentifier) {
          path = `/products?identifier=${encodeURIComponent(rawIdentifier)}`;
        }
      }

      const data = await secureFetch(path);

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
  if (!window.socket) return;
  const refresh = () => {
    if (order?.order_type === "takeaway") {
      fetchTakeawayOrder(order.id);
    }
  };
  window.socket.on("orders_updated", refresh);
  return () => window.socket.off("orders_updated", refresh);
}, [order?.id, order?.order_type]);


useEffect(() => {
  return () => {
    if (order?.id && cartItems.length === 0) {
     secureFetch(`/orders/${order.id}/reset-if-empty${identifier}`, { method: "PATCH" });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [order?.id]);

useEffect(() => {
  if (!order) return;
  if (!isCancelledStatus(order.status)) return;

  clearCartState();
}, [order?.status, clearCartState]);

useEffect(() => {
  // Whenever a new table/order is opened, reset discount
  setDiscountValue(0);
  setDiscountType("percent");
}, [tableId, orderId, reopenOrderIfNeeded]);

// ✅ Global reusable function to fetch takeaway orders
const fetchTakeawayOrder = async (id) => {
  try {
    const restaurantSlug =
      localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
    const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";

    let newOrder = await secureFetch(`/orders/${id}${identifier}`);
    const reopened = await reopenOrderIfNeeded(newOrder);
    if (reopened) newOrder = reopened;

    const items = await secureFetch(`/orders/${newOrder.id}/items${identifier}`);

    setOrder(newOrder);
    setCartItems(
      Array.isArray(items)
        ? items.map((i) => ({
            id: i.product_id,
            name: i.name || i.product_name,
            quantity: i.quantity,
            price: parseFloat(i.price),
            extras: i.extras ? JSON.parse(i.extras) : [],
            confirmed: i.confirmed ?? true,
            paid: !!i.paid_at,
            unique_id: i.unique_id,
            kitchen_status: i.kitchen_status,
          }))
        : []
    );
    setLoading(false);
  } catch (err) {
    console.error("❌ Error fetching takeaway order:", err);
    setLoading(false);
  }
};

const fetchOrderItems = async (orderId, options = {}) => {
  const { orderTypeOverride, sourceOverride } = options;
  try {
    const items = await secureFetch(`/orders/${orderId}/items${identifier}`);

    if (!Array.isArray(items)) {
      console.error("❌ Expected items to be an array but got:", items);
      return [];
    }

    const formatted = items.map((item) => {
      let extras = safeParseExtras(item.extras);
      const qty = parseInt(item.quantity, 10) || 1;

      const effectiveOrderType = orderTypeOverride ?? order?.order_type;
      const effectiveSource = sourceOverride ?? order?.source;

      if (
        effectiveOrderType === "table" &&
        effectiveSource === "qr" &&
        qty > 1
      ) {
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
        unique_id:
          item.unique_id ||
          `${item.product_id}-${JSON.stringify(extras || [])}-${uuidv4()}`,
        confirmed: item.confirmed ?? true,
        paid: !!item.paid_at,
        payment_method: item.payment_method ?? "Unknown",
        note: item.note || "",
        kitchen_status: item.kitchen_status || "",
      };
    });

    setCartItems(formatted);
    setReceiptItems(formatted.filter((i) => i.paid));

    return formatted;
  } catch (err) {
    console.error("❌ Failed to fetch items:", err);
    return [];
  }
};

const fetchPhoneOrder = async (id) => {
  try {
    const restaurantSlug =
      localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
    const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";

    let newOrder = await secureFetch(`/orders/${id}${identifier}`);
    const reopened = await reopenOrderIfNeeded(newOrder);
    if (reopened) newOrder = reopened;

    let correctedStatus = newOrder.status;

    if (newOrder.payment_method === "Online") correctedStatus = "paid";

    setOrder({ ...newOrder, status: correctedStatus });
    await fetchOrderItems(newOrder.id);
    setLoading(false);
  } catch (err) {
    console.error("❌ Error fetching phone/packet order:", err);
    setLoading(false);
  }
};

const createOrFetchTableOrder = async (tableNumber) => {
  try {
    const ordersResponse = await secureFetch(
      identifier
        ? `/orders?table_number=${tableNumber}&identifier=${restaurantSlug}`
        : `/orders?table_number=${tableNumber}`
    );

    const orders = Array.isArray(ordersResponse) ? ordersResponse : [];

    const sortedOrders = [...orders].sort((a, b) => {
      const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
      const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
      return bTime - aTime;
    });

    const activeOrder = sortedOrders.find((o) => isActiveTableStatus(o.status));

    let newOrder = activeOrder || null;

    if (!newOrder) {
      const unpaidClosed = sortedOrders.find(
        (o) => (o.status || "").toLowerCase() === "closed" && !o.is_paid
      );
      if (unpaidClosed) {
        const reopened = await reopenOrderIfNeeded(unpaidClosed);
        if (reopened) newOrder = reopened;
      }
    }

    if (!newOrder) {
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

    let correctedStatus = newOrder.status;
    if (newOrder.payment_method === "Online") correctedStatus = "paid";

    setOrder({ ...newOrder, status: correctedStatus });

    await fetchOrderItems(newOrder.id, {
      orderTypeOverride: newOrder.order_type,
      sourceOverride: newOrder.source,
    });

    setLoading(false);
  } catch (err) {
    console.error("❌ Error creating/fetching table order:", err);
    setLoading(false);
  }
};

useEffect(() => {
  setOrder(null);
  setCartItems([]);
  setReceiptItems([]);
  setLoading(true);

  if (orderId) {
    fetchPhoneOrder(orderId);
  } else if (tableId) {
    createOrFetchTableOrder(tableId);
  } else if (
    location.pathname.includes("/transaction/") &&
    initialOrder?.order_type === "takeaway"
  ) {
    fetchTakeawayOrder(initialOrder.id);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tableId, orderId]);

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
      payment_method:
        method ||
        resolvePaymentLabel(selectedPaymentMethod) ||
        order?.payment_method ||
        "Unknown",
    };

    const updated = await secureFetch(`/orders/${targetId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!updated || updated.error) throw new Error(updated?.error || "Failed to update order status");

    setOrder(updated);
    console.log("Order status updated:", updated.status, updated.payment_status);
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

  console.log("Valid methods in group:", validMethods);

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
   console.log("ENTERED handleMultifunction()");
  console.log("order before any checks →", order);

  if (!order || !order.status) return;
  

  const selectionKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));
  const hasUnconfirmedSelected = cartItems.some(
    (item) => selectionKeys.has(String(item.unique_id || item.id)) && !item.confirmed
  );

  if (hasUnconfirmedSelected) {
    showToast(t("Selected items must be confirmed before payment"));
    return;
  }

  let paymentIds =
    selectionKeys.size > 0
      ? cartItems
          .filter(
            (item) =>
              !item.paid && selectionKeys.has(String(item.unique_id || item.id))
          )
          .map((item) => item.unique_id)
      : selectedForPayment.length > 0
      ? [...selectedForPayment]
      : cartItems
          .filter((item) => !item.paid && item.confirmed)
          .map((item) => item.unique_id);

  if (selectionKeys.size > 0 && paymentIds.length === 0) {
    showToast(t("Selected items are already paid"));
    return;
  }

  if (paymentIds.length === 0 && cartItems.some((item) => !item.paid && item.confirmed)) {
    paymentIds = cartItems
      .filter((item) => !item.paid && item.confirmed)
      .map((item) => item.unique_id);
  }

  if (paymentIds.length > 0) {
    setSelectedForPayment(paymentIds);
  }

  const total = cartItems
    .filter((i) => paymentIds.includes(i.unique_id))
    .reduce((sum, i) => sum + i.price * i.quantity, 0);
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
    showToast(t("Table cannot be closed: preparing"));
    return;
  }

  // 2️⃣ Confirm unconfirmed items first
  if (hasUnconfirmedCartItems) {
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

if ((orderId && orderType === "phone") && getButtonLabel() === "Confirm") {
  await fetchOrderItems(order.id);
  setOrder((prev) => ({ ...prev, status: "confirmed" }));
  setHeader(prev => ({ ...prev, subtitle: "" }));
  showToast(t("Phone order confirmed and sent to kitchen"));
  setTimeout(() => navigate("/orders"), 400);
  return;
}

// 🥡 TAKEAWAY — confirm but STAY here (no navigate, no payment modal)
if (orderType === "takeaway" && getButtonLabel() === "Confirm") {
  await fetchOrderItems(order.id);
  setOrder((prev) => ({ ...prev, status: "confirmed" }));
  setHeader(prev => ({ ...prev, subtitle: "" }));
  showToast(t("Takeaway order confirmed and sent to kitchen"));
  // 🚫 Do NOT open pay modal or navigate
  return;
}

  return;
}


 // 3️⃣ Open payment modal for table OR takeaway orders
if (
  order.status === "confirmed" &&
  (orderType === "table" || orderType === "takeaway") &&
  (hasConfirmedCartUnpaid || hasSuborderUnpaid)
) {
  if (paymentIds.length === 0) {
    showToast(t("No items available to pay"));
    return;
  }
  setShowPaymentModal(true);
  return;
}

// 4️⃣ Try to close if all items are paid — OR any phone order ready to close
const allPaidIncludingSuborders = allCartItemsPaid && allSuborderPaid;

if (orderType === "phone" && order.status !== "closed") {
  // ✅ Allow phone orders to close after payment
  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    navigate("/orders");
    showToast(t("Phone order closed successfully"));
  } catch (err) {
    console.error("❌ Failed to close phone order:", err);
    showToast(t("Failed to close phone order"));
  }
  return;
}

// 🧠 For table orders → close ONLY when user manually presses “Close”
// 🧠 For table orders → close ONLY when all items are delivered
if (getButtonLabel() === "Close" && (order.status === "paid" || allPaidIncludingSuborders)) {
  const allDelivered = cartItems.every(
    (i) =>
      i.kitchen_status === "delivered" ||
      !i.kitchen_status ||
      excludedItems.includes(i.id) ||
      excludedCategories.includes(i.category)
  );

  // ❌ Not all delivered → don’t close; show message and bounce to TableOverview after 3s
  if (!allDelivered) {
    showToast(t("Not delivered yet"));
    setTimeout(() => navigate("/tableoverview"), 2000);
    return;
  }

  // ✅ All delivered → close and go immediately
  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    setDiscountValue(0);
    setDiscountType("percent");
    showToast(t("Table closed successfully"));
    navigate("/tableoverview"); // <— correct route
  } catch (err) {
    console.error("❌ Close failed:", err);
    showToast(t("Failed to close table"));
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
    console.log("Grouped receipt IDs:", Object.keys(grouped));

    // ✅ Update states
    setReceiptItems(paidItems); // only those with receipt_id
    setCartItems(fetchedItems); // includes confirmed & unconfirmed, not yet paid
  } catch (err) {
    console.error("❌ Failed to refresh receipt:", err);
  }
};


const confirmPayment = async (method, payIds = null) => {
  const methodLabel = resolvePaymentLabel(method);
  const methodIsCash = isCashMethod(method);
  const receiptId = uuidv4();
  const ids =
    payIds && payIds.length > 0
      ? payIds
      : cartItems.filter((i) => !i.paid && i.confirmed).map((i) => i.unique_id);
  let paidTotal = 0;

  if (order.status !== "paid") {
    let total = cartItems
      .filter((i) => ids.includes(i.unique_id))
      .reduce((sum, i) => sum + i.price * i.quantity, 0);

    if (discountValue > 0) {
      if (discountType === "percent") total -= total * (discountValue / 100);
      if (discountType === "fixed") total = Math.max(0, total - discountValue);
    }

    paidTotal = total;

    const enhancedItems = cartItems
      .filter((i) => ids.includes(i.unique_id))
      .map((i) => ({
        product_id: i.product_id || i.id,
        quantity: i.quantity,
        price: i.price,
        ingredients: i.ingredients,
        extras: i.extras,
        unique_id: i.unique_id,
        payment_method: methodLabel,
        receipt_id: receiptId,
        note: i.note || null,
        discountType: discountValue > 0 ? discountType : null,
        discountValue: discountValue > 0 ? discountValue : 0,
        confirmed: true,
      }));

    await secureFetch(`/orders/sub-orders${identifier}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        total,
        payment_method: methodLabel,
        receipt_id: receiptId,
        items: enhancedItems,
      }),
    });

    const cleanedSplits = {};
    Object.entries(splits || {}).forEach(([methodId, amt]) => {
      const val = parseFloat(amt);
      if (val > 0) {
        const label = resolvePaymentLabel(methodId);
        cleanedSplits[label] = val;
      }
    });
    const receiptMethodsPayload =
      Object.keys(cleanedSplits).length > 0
        ? cleanedSplits
        : { [methodLabel]: paidTotal };
    await secureFetch(`/orders/receipt-methods${identifier}`, {
      method: "POST",
      body: JSON.stringify({
        order_id: order.id,
        receipt_id: receiptId,
        methods: receiptMethodsPayload,
      }),
    });

    setCartItems((prev) =>
      prev.map((item) =>
        selectedForPayment.includes(item.unique_id)
          ? { ...item, paid: true, paid_at: new Date().toISOString() }
          : item
      )
    );

    if (
      selectedForPayment.length > 0 &&
      window &&
      typeof window.playPaidSound === "function"
    )
      window.playPaidSound();

    await refreshReceiptAfterPayment();

    const allItems2 = await secureFetch(`/orders/${order.id}/items${identifier}`);

    if (!Array.isArray(allItems2)) {
      console.error("❌ Unexpected items response:", allItems2);
      return;
    }

    const isFullyPaid2 = allItems2.every((item) => item.paid_at);

    if (isFullyPaid2) {
      await updateOrderStatus("paid", total, method);
      setOrder((prev) => ({ ...prev, status: "paid" }));
    }
  }

  await refreshReceiptAfterPayment();
  await fetchOrderItems(order.id);
  await fetchSubOrders();
  setSelectedForPayment([]);
  setShowPaymentModal(false);
  setSelectedCartItemIds(new Set());

  if (methodIsCash && paidTotal > 0) {
    const note = order?.id ? `Order #${order.id} (${methodLabel})` : `Sale (${methodLabel})`;
    await logCashRegisterEvent({ type: "sale", amount: paidTotal, note });
    await openCashDrawer();
  }
};


const getButtonLabel = () => {
  if (!order) return "Preparing..";

  // 🔑 Force Close if already paid online
  if (order.payment_method === "Online") {
    return "Close";
  }

  if (hasUnconfirmedCartItems) return "Confirm";
  if (hasConfirmedCartUnpaid || hasSuborderUnpaid) return "Pay";
  return "Close";
};

function showToast(message) {
  setToast({ show: true, message });
  setTimeout(() => setToast({ show: false, message: "" }), 3500);
}

useEffect(() => {
  if (!socket) return;
  const handleOrderCancelled = (payload) => {
    const cancelledId = typeof payload?.orderId === "number" ? payload.orderId : Number(payload?.orderId);
    if (!order?.id || !Number.isFinite(cancelledId) || cancelledId !== order.id) return;
    showToast(t("Order cancelled"));
    clearCartState();
    setOrder((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
  };
  socket.on("order_cancelled", handleOrderCancelled);
  return () => socket.off("order_cancelled", handleOrderCancelled);
}, [order?.id, t, clearCartState]);

useEffect(() => {
  if (!isCancelledStatus(normalizedStatus)) return;

  if (orderType === "phone") {
    navigate("/orders");
    return;
  }

  if (orderType === "table") {
    if (!tableId) {
      navigate("/tableoverview");
      return;
    }
    clearCartState();
    setLoading(true);
    createOrFetchTableOrder(tableId);
    return;
  }

  navigate("/tableoverview");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [normalizedStatus, orderType, tableId, navigate, clearCartState]);


const selectedForPaymentTotal = cartItems
  .filter(i => selectedForPayment.includes(i.unique_id))
  .reduce((sum, i) => sum + i.price * i.quantity, 0);

const finalizeCartItem = useCallback(
  ({ product, quantity = 1, extras = [], note = "", editingIndex = null }) => {
    if (!order || !product) return;

    const productQty = Math.max(1, Number(quantity) || 1);
    const trimmedNote = (note || "").trim();

    const validExtras = (Array.isArray(extras) ? extras : [])
      .filter((ex) => Number(ex?.quantity) > 0)
      .map((ex) => ({
        ...ex,
        quantity: Number(ex.quantity),
        price: Number(ex.price ?? ex.extraPrice ?? 0) || 0,
        amount:
          ex.amount !== undefined && ex.amount !== null && ex.amount !== ""
            ? Number(ex.amount)
            : 1,
        unit:
          typeof ex.unit === "string" && ex.unit.trim() !== ""
            ? ex.unit.trim().toLowerCase()
            : "",
      }));

    const itemPrice = Number(product.price) || 0;
    const extrasGroupRefs = deriveExtrasGroupRefs(product);
    const extrasKey = JSON.stringify(validExtras);
    const baseUniqueId = `${product.id}-NO_EXTRAS`;
    const isPlain = validExtras.length === 0 && trimmedNote.length === 0;
    const uniqueId = isPlain
      ? baseUniqueId
      : `${product.id}-${extrasKey}-${uuidv4()}`;

    if (editingIndex !== null) {
      setCartItems((prev) => {
        const updated = [...prev];
        const existing = updated[editingIndex] || {};
        const fallbackRefs = deriveExtrasGroupRefs(existing);
        const persistedRefs =
          extrasGroupRefs || existing.extrasGroupRefs || fallbackRefs;

        updated[editingIndex] = {
          ...existing,
          quantity: productQty,
          price: itemPrice,
          extras: validExtras,
          unique_id: uniqueId,
          note: trimmedNote || null,
          ...(persistedRefs
            ? {
                extrasGroupRefs: persistedRefs,
                selectedExtrasGroup: persistedRefs.ids,
                selected_extras_group: persistedRefs.ids,
                selectedExtrasGroupNames: persistedRefs.names,
              }
            : {}),
        };
        return updated;
      });
      setEditingCartItemIndex(null);
      return;
    }

    if (isPlain) {
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
              ? {
                  ...item,
                  quantity: item.quantity + productQty,
                  ...(extrasGroupRefs && !item.extrasGroupRefs
                    ? {
                        extrasGroupRefs,
                        selectedExtrasGroup: extrasGroupRefs.ids,
                        selected_extras_group: extrasGroupRefs.ids,
                        selectedExtrasGroupNames: extrasGroupRefs.names,
                      }
                    : {}),
                }
              : item
          );
        }

        const hasLocked = prev.some(
          (item) =>
            item.unique_id === baseUniqueId &&
            (item.confirmed || item.paid)
        );

        const finalUniqueId = hasLocked
          ? `${baseUniqueId}-${uuidv4()}`
          : baseUniqueId;

        return [
          ...prev,
          {
            id: product.id,
            name: product.name,
            price: itemPrice,
            quantity: productQty,
            ingredients: product.ingredients || [],
            extras: [],
            unique_id: finalUniqueId,
            note: null,
            ...(extrasGroupRefs
              ? {
                  extrasGroupRefs,
                  selectedExtrasGroup: extrasGroupRefs.ids,
                  selected_extras_group: extrasGroupRefs.ids,
                  selectedExtrasGroupNames: extrasGroupRefs.names,
                }
              : {}),
          },
        ];
      });
      return;
    }

    setCartItems((prev) => [
      ...prev,
      {
        id: product.id,
        name: product.name,
        price: itemPrice,
        quantity: productQty,
        ingredients: product.ingredients || [],
        extras: validExtras,
        unique_id: uniqueId,
        note: trimmedNote || null,
        ...(extrasGroupRefs
          ? {
              extrasGroupRefs,
              selectedExtrasGroup: extrasGroupRefs.ids,
              selected_extras_group: extrasGroupRefs.ids,
              selectedExtrasGroupNames: extrasGroupRefs.names,
            }
          : {}),
      },
    ]);
  },
  [order, setCartItems, setEditingCartItemIndex]
);

const addToCart = async (product) => {
  if (!order) return;

  const selection = normalizeExtrasGroupSelection([
    product.extrasGroupRefs,
    product.selectedExtrasGroup,
    product.selected_extras_group,
    product.selectedExtrasGroupNames,
  ]);

  const baseIds = Array.isArray(selection.ids) ? [...selection.ids] : [];
  const baseNames = Array.isArray(selection.names) ? [...selection.names] : [];

  setNote("");
  setSelectedExtras([]);

  const baseProduct = {
    ...product,
    quantity: 1,
    extrasGroupRefs: { ids: baseIds, names: baseNames },
    selectedExtrasGroup: baseIds,
    selected_extras_group: baseIds,
    selectedExtrasGroupNames: baseNames,
    modalExtrasGroups: [],
  };

  if (product.show_add_to_cart_modal === false) {
    finalizeCartItem({
      product: baseProduct,
      quantity: 1,
      extras: [],
      note: "",
    });
    return;
  }

  let match = null;
  try {
    match = await getMatchedExtrasGroups(selection);
  } catch (err) {
    console.error("❌ Extras group fetch failed:", err);
  }

  const idsForModal = match?.matchedIds?.length ? match.matchedIds : baseIds;
  const namesForModal = Array.from(
    new Set([...baseNames, ...(match?.matchedNames || [])])
  );

  const modalExtrasGroups = match?.matchedGroups || [];

  const productForModal = {
    ...baseProduct,
    extrasGroupRefs: { ids: idsForModal, names: namesForModal },
    selectedExtrasGroup: idsForModal,
    selected_extras_group: idsForModal,
    selectedExtrasGroupNames: namesForModal,
    modalExtrasGroups,
  };

  setSelectedProduct(productForModal);
  setShowExtrasModal(true);
};

const handleExtrasModalConfirm = useCallback(
  ({ product, quantity, extras, note }) => {
    finalizeCartItem({
      product,
      quantity,
      extras,
      note,
      editingIndex: editingCartItemIndex,
    });
  },
  [finalizeCartItem, editingCartItemIndex]
);




const displayTotal = cartItems
  .filter(i => !i.paid)
  .reduce((sum, i) => sum + (i.price * i.quantity), 0);

const invoiceNumber = useMemo(() => {
  if (!order) return null;
  if (order.invoice_number) return order.invoice_number;
  if (order.receipt_number) return order.receipt_number;
  if (order.order_number) return order.order_number;
  if (order.id) return `INV-${String(order.id).padStart(5, "0")}`;
  return null;
}, [order?.invoice_number, order?.receipt_number, order?.order_number, order?.id]);

const removeItem = (uniqueId) => {
  setCartItems((prev) =>
    prev.filter((item) => item.unique_id !== uniqueId || item.confirmed)
  );
  setSelectedForPayment((prev) => prev.filter((id) => id !== uniqueId));
  setSelectedCartItemIds((prev) => {
    if (!prev.has(String(uniqueId))) return prev;
    const next = new Set(prev);
    next.delete(String(uniqueId));
    return next;
  });
};

// Clears only UNCONFIRMED items from the cart
const clearUnconfirmedCartItems = () => {
  let removedAny = false;
  setCartItems((prev) =>
    prev.filter((item) => {
      if (!item.confirmed) {
        removedAny = true;
        return false;
      }
      return true;
    })
  );


  setSelectedCartItemIds(new Set());
  setSelectedForPayment([]);
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

 const sumOfSplits = Object.values(splits || {})
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
const hasAnySplit = Object.values(splits || {}).some(
  (v) => parseFloat(v || 0) > 0
);
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

const renderCartContent = (variant = "desktop") => {
  const isDesktop = variant === "desktop";
  const containerClasses = isDesktop
    ? "flex min-h-0 flex-col rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-120px)] overflow-hidden"
    : "flex w-full max-h-[calc(100vh-96px)] flex-col rounded-t-3xl bg-white shadow-2xl overflow-hidden";
  const headerPadding = isDesktop ? "px-5 pt-5 pb-3" : "px-5 pt-4 pb-3";
  const footerPadding = isDesktop
    ? "px-5 py-5"
    : "px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]";

  const hasSelection = selectedCartItemIds.size > 0;
  const baseButtonClass =
    "flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-100";
  const primaryButtonClass =
    "flex-1 min-w-0 rounded-lg bg-indigo-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-600";
  const debtButtonClass =
    "flex-1 min-w-0 rounded-lg bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed";

  const cancelButtonClass =
    "rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-center text-sm font-semibold text-rose-600 transition hover:bg-rose-100";
  const canShowCancelButton = ["confirmed", "paid", "unpaid"].includes(normalizedStatus);

  const actionControls = isDesktop ? (
    <div className="flex w-full flex-col gap-3">
      <div className="flex gap-3">
        <button
          onClick={hasSelection ? clearSelectedCartItems : clearUnconfirmedCartItems}
          className={baseButtonClass}
        >
          {t("Clear")}
        </button>
        <button onClick={handleMultifunction} className={primaryButtonClass}>
          {t(getButtonLabel())}
        </button>
        {isDebtEligible && (
          <button
            onClick={handleOpenDebtModal}
            className={debtButtonClass}
            disabled={isDebtSaving}
          >
            {isDebtSaving ? t("Saving...") : t("Add to Debt")}
          </button>
        )}
      </div>
      {canShowCancelButton && (
        <button
          type="button"
          onClick={openCancelModal}
          className={`w-full ${cancelButtonClass}`}
        >
          {t("Cancel")}
        </button>
      )}
    </div>
  ) : (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={hasSelection ? clearSelectedCartItems : clearUnconfirmedCartItems}
          className={`${baseButtonClass} flex-1 min-w-[120px]`}
        >
          {t("Clear")}
        </button>
        <button
          onClick={handleCartPrint}
          className={`${baseButtonClass} flex-1 min-w-[120px]`}
          title={t("Print Receipt")}
        >
          {t("Print")}
        </button>
        {isDebtEligible && (
          <button
            onClick={handleOpenDebtModal}
            className={`${debtButtonClass} flex-1 min-w-[120px]`}
            disabled={isDebtSaving}
          >
            {isDebtSaving ? t("Saving...") : t("Add to Debt")}
          </button>
        )}
        <button
          onClick={handleMultifunction}
          className={`${primaryButtonClass} flex-1 min-w-[120px]`}
        >
          {t(getButtonLabel())}
        </button>
      </div>
      {canShowCancelButton && (
        <button
          type="button"
          onClick={openCancelModal}
          className={`${cancelButtonClass} flex-1 min-w-[120px]`}
        >
          {t("Cancel")}
        </button>
      )}
    </div>
  );

  return (
   <aside className={containerClasses}>
  {/* === Header === */}
  <header className="flex items-center justify-between border-b border-slate-200 px-3 pt-2 pb-2">
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <h2 className="hidden text-lg font-semibold text-slate-800 lg:block">{t("Cart")}</h2>
        <button
          onClick={handleCartPrint}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 shadow hover:bg-slate-200 transition"
          title={t("Print Receipt")}
        >
          🖨️ <span className="hidden sm:inline">{t("Print")}</span>
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {orderId ? t("Phone Order") : `${t("Table")} ${tableId}`}
      </p>
      {invoiceNumber && (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
          {t("Invoice")} #{invoiceNumber}
        </p>
      )}
    </div>

    <div className="flex items-center gap-1.5">
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        {cartItems.filter((i) => !i.paid).length} {t("Items")}
      </span>
      {hasSelection && (
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600">
          {selectedCartItemIds.size} {t("Selected")}
        </span>
      )}
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setIsFloatingCartOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm"
          aria-label={t("Close")}
        >
          ✕
        </button>
      )}
    </div>
  </header>

  {/* === Body === */}
  <div ref={cartScrollRef} className="min-h-0 flex-1 overflow-y-auto">
    <div
      className="min-h-0 flex-1 px-3 pb-2 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {cartItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs font-medium text-slate-400">
          {t("Cart is empty.")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {/* === Group items by product name + extras + note === */}
    {Object.values(
  cartItems.reduce((acc, item) => {
    const extrasKey = JSON.stringify(safeParseExtras(item.extras) || []);
    const noteKey =
      typeof item.note === "string" ? item.note.trim() : JSON.stringify(item.note || "");

    // ➕ Add a status slice to the key so paid/confirmed/unconfirmed never merge together
    const statusSlice = item.paid
      ? `paid:${item.receipt_id || "yes"}`
      : (item.confirmed ? "confirmed" : "unconfirmed");

    // 🔑 New grouping key (prevents merging with paid items)
    const key = `${item.name}__${extrasKey}__${noteKey}__${statusSlice}`;

    if (!acc[key]) acc[key] = { ...item, quantity: 0, items: [] };

    acc[key].quantity += Number(item.quantity) || 1;
    acc[key].items.push(item);
    return acc;
  }, {})
).map((item, idx) => {
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
              typeof item.note === "string" ? item.note.trim() !== "" : !!item.note;
            const isEditable = !item.confirmed && !item.paid;
            // 💡 More vibrant, clearly distinct colors
const cardGradient = item.paid
  ? "bg-gradient-to-br from-green-200 via-green-100 to-green-50 border-green-300" // Paid = green
  : item.confirmed
  ? "bg-gradient-to-br from-blue-200 via-blue-100 to-blue-50 border-blue-300"     // Confirmed = blue
  : "bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-50 border-amber-300"; // Unpaid (not confirmed) = yellow


            const itemKey = item.unique_id || `${item.id}-${idx}`;
            const isExpanded = expandedCartItems.has(itemKey);
            const selectionKey = String(item.unique_id || item.id);
            const isSelected = selectedCartItemIds.has(selectionKey);

            return (
            <li
  data-cart-item="true"
  key={itemKey}
  className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border border-slate-200 p-2 text-[13px] shadow-sm transition ${cardGradient}`}
>
  <div className="flex items-center justify-between gap-1">
    <div className="flex items-center gap-1 flex-1">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={isSelected}
              onChange={() => toggleCartItemSelection(selectionKey)}
              onClick={(e) => e.stopPropagation()}
            />
      <span
        className="truncate font-semibold text-slate-800 flex-1"
        onClick={() => toggleCartItemExpansion(itemKey)}
      >
        {item.name} ×{quantity}
      </span>
    </div>
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => toggleCartItemExpansion(itemKey)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-500 hover:border-slate-300"
        title={isExpanded ? t("Hide details") : t("Show details")}
      >
        {isExpanded ? "▲" : "▼"}
      </button>
      <span className="font-semibold text-indigo-600 whitespace-nowrap">
        ₺{lineTotal.toFixed(2)}
      </span>
    </div>
  </div>

  {/* Expanded Details */}
  {isExpanded && (
    <div className="mt-1 rounded-lg bg-white/60 p-2 text-[12px] text-slate-600 space-y-2">
      {/* === Extras List === */}
      {normalizedExtras.length > 0 && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {normalizedExtras.map((ex, i2) => {
            const extraQty = Number(ex.quantity) || 1;
            const extraTotal =
              (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * extraQty;
            return (
              <li key={`${item.unique_id}-extra-${i2}`}>
                {ex.name} ×{extraQty} – ₺{extraTotal.toFixed(2)}
              </li>
            );
          })}
        </ul>
      )}

      {/* === Notes === */}
      {showNote && (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-2 py-1 text-[11px] text-yellow-800">
          {item.note}
        </div>
      )}

      {/* === Qty / Edit / Remove === */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200">
        {/* Qty Control */}
        <div className="flex items-center gap-1">
          <span>{t("Qty")}:</span>
          <button
            onClick={() => decrementCartItem(item.unique_id)}
            className="h-5 w-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!isEditable}
          >
            –
          </button>
          <span className="min-w-[18px] text-center">{quantity}</span>
          <button
            onClick={() => incrementCartItem(item.unique_id)}
            className="h-5 w-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!isEditable}
          >
            +
          </button>
        </div>

        {/* Edit / Remove */}
        {isEditable && (
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                const parsedExtras = safeParseExtras(item.extras);
                const selection = normalizeExtrasGroupSelection([
                  item.extrasGroupRefs,
                  item.selectedExtrasGroup,
                  item.selected_extras_group,
                  item.selectedExtrasGroupNames,
                ]);
                if (selection.ids.length === 0 && selection.names.length === 0) {
                  setSelectedProduct({
                    ...item,
                    modalExtrasGroups: [],
                    extrasGroupRefs: { ids: [], names: [] },
                    selectedExtrasGroup: [],
                    selected_extras_group: [],
                    selectedExtrasGroupNames: [],
                  });
                  setSelectedExtras(parsedExtras || []);
                  setEditingCartItemIndex(idx);
                  setShowExtrasModal(true);
                  return;
                }
                let modalGroups = [];
                let selectionForModal = selection;
                try {
                  const match = await getMatchedExtrasGroups(selection);
                  if (match) {
                    modalGroups = match.matchedGroups || [];
                    const ids = match.matchedIds?.length
                      ? match.matchedIds
                      : selection.ids;
                    const names = match.matchedNames?.length
                      ? match.matchedNames
                      : selection.names;
                    selectionForModal = {
                      ids,
                      names,
                    };
                  } else {
                    const groupsData = await ensureExtrasGroups();
                    modalGroups = Array.isArray(groupsData) ? groupsData : [];
                  }
                } catch (err) {
                  console.error("❌ Failed to resolve extras groups for edit:", err);
                  const fallbackGroups = await ensureExtrasGroups();
                  modalGroups = Array.isArray(fallbackGroups) ? fallbackGroups : [];
                }
                setSelectedProduct({
                  ...item,
                  modalExtrasGroups: modalGroups,
                  extrasGroupRefs: selectionForModal,
                  selectedExtrasGroup: selectionForModal.ids,
                  selected_extras_group: selectionForModal.ids,
                  selectedExtrasGroupNames: selectionForModal.names,
                });
                setSelectedExtras(parsedExtras || []);
                setEditingCartItemIndex(idx);
                setShowExtrasModal(true);
              }}
              className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-100"
              title={t("Edit item")}
            >
              {t("Edit")}
            </button>
            <button
              onClick={() => removeItem(item.unique_id)}
              className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 hover:bg-red-100"
              title={t("Remove item")}
            >
              {t("Remove")}
            </button>
          </div>
        )}
      </div>
    </div>
  )}
</li>

            );
          })}
        </ul>
      )}
    </div>
  </div>

  {/* === Footer === */}
  <footer className="space-y-2 border-t border-slate-200 bg-slate-50 px-3 py-2 shadow-inner">
    <div className="flex justify-between text-xs font-medium text-slate-600">
      <span>{t("Subtotal")}:</span>
      <span className="text-slate-900">₺{calculateDiscountedTotal().toFixed(2)}</span>
    </div>

    {discountValue > 0 && (
      <div className="flex justify-between text-xs font-semibold text-fuchsia-600">
        <span>
          {t("Discount")}{" "}
          {discountType === "percent"
            ? `(${discountValue}%)`
            : `(-₺${discountValue})`}
        </span>
        <span>-₺{discountValue}</span>
      </div>
    )}

   <div
  className={`flex justify-between items-center rounded-2xl bg-white px-3 py-3 text-lg font-bold shadow-sm
  ${selectedCartItemIds.size > 0 ? "text-emerald-700 border border-emerald-300 bg-emerald-50" : "text-indigo-700"}`}
>
  <span>
    {selectedCartItemIds.size > 0
      ? t("Selected Total")
      : t("Total")}
    :
  </span>
  <span>
    ₺
    {selectedCartItemIds.size > 0
      ? selectedItemsTotal.toFixed(2)
      : calculateDiscountedTotal().toFixed(2)}
  </span>
</div>


    {actionControls}

    {!isDesktop && !orderId && (
      <TableActionButtons
        onMove={() => setShowMoveTableModal(true)}
        onMerge={() => setShowMergeTableModal(true)}
        cartMode
        moveLabel={t("Move Table")}
        mergeLabel={t("Merge Table")}
      />
    )}

    <div className={`flex ${isDesktop ? "gap-1.5" : "flex-col gap-1.5"}`}>
      <button
        onClick={() => setShowDiscountModal(true)}
        className={`${isDesktop ? "flex-1" : "w-full"} rounded-md bg-fuchsia-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-600`}
      >
        {t("Discount")}
      </button>
      <button
        onClick={handleOpenCashRegister}
        className={`${isDesktop ? "flex-1" : "w-full"} rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600`}
      >
        {t("Register")}
      </button>
    </div>
  </footer>
</aside>

  );
};
  if (loading) return <p className="p-4 text-center">{t("Loading...")}</p>;

  return (
    <div className="relative min-h-screen w-full bg-slate-50 overflow-x-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl flex-col gap-4 px-4 sm:px-6 lg:px-8 xl:px-10 overflow-x-hidden">
  <section className="flex flex-1 min-h-0 flex-row gap-2 pb-4 overflow-hidden">

    {/* === LEFT: CART PANEL (desktop only) === */}
    <div className="hidden lg:block w-[30%] min-w-[320px] max-w-[380px] h-full overflow-hidden">
      <div className="sticky top-0 h-full">{renderCartContent("desktop")}</div>
    </div>

    {/* === CENTER: VERTICAL CATEGORY BAR === */}
  <aside className="w-[10%] min-w-[85px] max-w-[110px] bg-white rounded-xl shadow-md ring-1 ring-slate-200 p-2 overflow-hidden">
    <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-140px)] pr-1 
                    scrollbar-thin scrollbar-thumb-indigo-300 scrollbar-track-transparent">
      {categories.map((cat, idx) => (
        <div key={idx}>
          {renderCategoryButton(cat, idx, "vertical")}
        </div>
      ))}
    </div>
  </aside>


    {/* === RIGHT: PRODUCTS GRID === */}
    <article className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 p-3 overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold text-slate-800">
          {activeCategory ? t(activeCategory) : t("Products")}
        </h2>
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-700">
          {productsInActiveCategory.length} {t("Products")}
        </span>
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
    {productsInActiveCategory.map((product) => (
      <button
        key={product.id}
        onClick={() => addToCart(product)}
        className="
          flex flex-col items-center gap-1
          rounded-xl border border-slate-200 bg-white p-1.5 text-center shadow-sm
          hover:bg-indigo-50
          w-full                           /* <— fix overlapping */
        "
      >
        <img
          src={product.image || 'https://via.placeholder.com/100?text=🍔'}
          alt={product.name}
          className="
            w-full aspect-square object-cover rounded-md   /* <— MOBILE FIX */
            lg:h-16 lg:w-16 lg:rounded-xl lg:border lg:object-cover lg:shadow /* unchanged desktop */
          "
        />
        <p className="text-sm font-semibold text-slate-700 text-center line-clamp-2 leading-tight">
          {product.name}
        </p>
        <span className="text-base font-bold text-indigo-600">
          ₺{parseFloat(product.price).toFixed(2)}
        </span>
      </button>
    ))}
  </div>

      </div>
    </article>
  </section>

    </div>

      <div
        className={`lg:hidden fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] transition-transform duration-300 ${isFloatingCartOpen ? "translate-y-[120%]" : "translate-y-0"}`}
      >
        <button
          type="button"
          onClick={() => setIsFloatingCartOpen(true)}
          className="flex w-full items-center justify-between rounded-3xl bg-indigo-600 px-5 py-4 text-white shadow-2xl"
        >
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-100">
              {t("Total")}
            </span>
            <span className="text-2xl font-bold">
              ₺{calculateDiscountedTotal().toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold">
              {cartItems.filter((i) => !i.paid).length} {t("Items")}
            </span>
            <span className="text-sm font-semibold">{t("View Cart")}</span>
          </div>
        </button>
      </div>

      <div
        className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ${isFloatingCartOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-slate-900/60 transition-opacity duration-300 ${isFloatingCartOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setIsFloatingCartOpen(false)}
        />
        <div
          className={`absolute inset-x-0 bottom-0 transition-transform duration-300 ${isFloatingCartOpen ? "translate-y-0" : "translate-y-full"}`}
        >
          {renderCartContent("mobile")}
        </div>
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
  staffId={currentUser?.staff_id ?? currentUser?.id ?? null}
  navigate={navigate}
/>

{showCancelModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
    <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-zinc-900 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
            {t("Cancel Order")}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {(() => {
              const orderType = (order?.order_type || order?.__cardType || "table").toLowerCase();
              if (orderType === "packet") return t("Packet Order");
              if (orderType === "phone") return t("Phone Order");
              if (orderType === "takeaway") return t("Takeaway Order");
              const tableNumber = order?.table_number || order?.tableNumber || "";
              return `${t("Table")} ${tableNumber || order?.id || ""}`.trim();
            })()}
          </p>
          <p className="text-sm text-rose-500 mt-1">
            #{order?.id || "-"} • {order?.customer_name || t("Guest")}
          </p>
        </div>
        <button
          type="button"
          onClick={closeCancelModal}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-300"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-3 dark:text-slate-300">
        {t("The cancellation reason will be recorded for auditing.")}
      </p>

      {selectedCartItems.length > 0 && (
        <div className="mb-3 space-y-2 rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-xs text-amber-700">
          <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500">
            {t("Selected items")}
          </p>
          <ul className="space-y-1 text-[12px]">
            {selectedCartItems.map((item) => {
              const totalPrice = (Number(item.price) || 0) * (Number(item.quantity) || 1);
              return (
                <li
                  key={item.unique_id || `${item.id}-${item.name}`}
                  className="flex items-center justify-between font-semibold text-amber-700"
                >
                  <span className="truncate">{item.name}</span>
                  <span className="text-amber-600">
                    ×{item.quantity || 1} — ₺{totalPrice.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-amber-500">
            {t("Only the highlighted items will be removed from the order. Leave everything unchecked to cancel the full order.")}
          </p>
        </div>
      )}

      {hasPaidItems ? (
        <div className="space-y-3 rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 mb-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-rose-500">
            {t("Refund Method")}
            <select
              className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
              value={refundMethodId}
              onChange={(event) => setRefundMethodId(event.target.value)}
            >
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-rose-500">
            {t("Refund amount")}: ₺{refundAmount.toFixed(2)}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-300">
          {t("No paid items detected. This will simply cancel the order.")}
        </p>
      )}

      <textarea
        rows={4}
        value={cancelReason}
        onChange={(event) => setCancelReason(event.target.value)}
        placeholder={t("Why is the order being cancelled?")}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
      />

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={closeCancelModal}
          className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-zinc-700 dark:text-slate-200"
        >
          {t("Back")}
        </button>
        <button
          type="button"
          onClick={handleCancelConfirm}
          disabled={cancelLoading || !cancelReason.trim()}
          className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${cancelLoading || !cancelReason.trim()
            ? "cursor-not-allowed bg-rose-200 dark:bg-rose-400/70"
            : "bg-rose-600 hover:bg-rose-700"}`}
        >
          {cancelLoading ? t("Cancelling...") : t("Confirm Cancellation")}
        </button>
      </div>
    </div>
  </div>
)}

{showDebtModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          {t("Add Order To Debt")}
        </h2>
        <button
          className="text-slate-500 hover:text-slate-800"
          onClick={() => setShowDebtModal(false)}
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        {t("Confirm the customer details before adding this balance to their debt account.")}
      </p>

      <div className="mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("Search Existing Customer")}
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
            value={debtSearch}
            onChange={(e) => handleDebtSearch(e.target.value)}
            placeholder={t("Search by name or phone")}
            disabled={isDebtSaving}
          />
        </label>
        {debtSearchLoading && (
          <p className="mt-2 text-xs text-slate-400">{t("Searching customers...")}</p>
        )}
        {debtSearchResults.length > 0 && (
          <div className="mt-2 space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-2 dark:bg-zinc-800/40 dark:border-zinc-700">
            {debtSearchResults.map((cust) => (
              <button
                key={cust.id}
                className="w-full rounded-xl bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:bg-indigo-50 dark:bg-zinc-900 dark:text-slate-100"
                onClick={() => handleSelectDebtCustomer(cust)}
              >
                <p className="font-semibold text-slate-800 dark:text-white">{cust.name || t("Guest")}</p>
                <p className="text-xs text-slate-500">{cust.phone || t("No phone")}</p>
                {cust.address && (
                  <p className="text-xs text-slate-400 truncate">{cust.address}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("Customer Name")}
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
            value={debtForm.name}
            onChange={(e) => setDebtForm((prev) => ({ ...prev, name: e.target.value }))}
            disabled={isDebtSaving || debtLookupLoading}
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("Customer Phone")}
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
            value={debtForm.phone}
            onChange={(e) => setDebtForm((prev) => ({ ...prev, phone: e.target.value }))}
            disabled={isDebtSaving || debtLookupLoading}
          />
        </label>

        {debtError && (
          <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-200">
            {debtError}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-60"
          onClick={handleAddToDebt}
          disabled={isDebtSaving || debtLookupLoading}
        >
          {isDebtSaving ? t("Saving...") : t("Confirm Debt")}
        </button>
        <button
          className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-slate-200"
          onClick={() => {
            setShowDebtModal(false);
            setDebtError("");
          }}
          disabled={isDebtSaving}
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  </div>
)}


<ExtrasModal
  showExtrasModal={showExtrasModal}
  setShowExtrasModal={setShowExtrasModal}
  selectedProduct={selectedProduct}
  setSelectedProduct={setSelectedProduct}
  selectedExtras={selectedExtras}
  setSelectedExtras={setSelectedExtras}
  extrasGroups={extrasGroups}
  onConfirmAddToCart={handleExtrasModalConfirm}

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
	    console.log("Merging table...");
	    await secureFetch(`/orders/${order.id}/merge-table${identifier}`, {
	      method: "PATCH",
	      body: JSON.stringify({
	        target_table_number: Number(destTable.tableNum),
	        target_order_id: destTable.orderId ?? null,
	        source_table_number: Number(tableId) || null,
	      }),
	    });

	    // ✅ Wait for socket confirmation or fallback reload
	    const handleMerged = (payload) => {
	      if (payload?.order?.table_number === Number(destTable.tableNum)) {
        console.log("Merge confirmed by socket:", payload);
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
	    showToast(err.message || t("Failed to merge table"));
	    setShowMergeTableModal(false);
	  }
	}}

/>

  </div>
);

  }
