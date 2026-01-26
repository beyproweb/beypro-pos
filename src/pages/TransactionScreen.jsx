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
import {
  ArrowLeftRight,
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  CircleX,
  GitMerge,
  HandCoins,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import ExtrasModal from "../modals/ExtrasModal";
import DiscountModal from "../modals/DiscountModal";
import PaymentModal from "../modals/PaymentModal";
import { useHeader } from "../context/HeaderContext";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import MoveTableModal from "../modals/MoveTableModal";
import MergeTableModal from "../modals/MergeTableModal";
import { toCategorySlug } from "../utils/slugCategory"; 
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import socket from "../utils/socket";
import { useAuth } from "../context/AuthContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { getPaymentMethodLabel } from "../utils/paymentMethods";
import { getPaymentItemKey } from "../utils/getPaymentItemKey";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { useCurrency } from "../context/CurrencyContext";
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import { getReservationSchedule, isEarlyReservationClose } from "../utils/reservationSchedule";
import { loadRegisterSummary } from "../utils/registerSummaryCache";
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

const resolveItemPaymentMethod = (order, item) => {
  const direct =
    item?.payment_method ||
    item?.paymentMethod ||
    item?.method ||
    "";
  const normalizedDirect = typeof direct === "string" ? direct.trim() : "";
  if (normalizedDirect) return normalizedDirect;

  const singleReceiptMethod =
    Array.isArray(order?.receiptMethods) && order.receiptMethods.length === 1
      ? (order.receiptMethods[0]?.payment_method || "").trim()
      : "";
  if (singleReceiptMethod) return singleReceiptMethod;

  return (order?.payment_method || "").trim();
};

const normalizeOrderStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  // Backend may send "occupied" for active table orders; treat it as "confirmed"
  // so Reservation/Cancel/Debt controls render immediately.
  return normalized === "occupied" ? "confirmed" : normalized;
};

const isActiveTableStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return !["closed", "cancelled", "canceled"].includes(normalized);
};

const isPaidItem = (item) => Boolean(item && (item.paid || item.paid_at));

const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeYmd = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const datePart = raw.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalYmd(parsed);
};

const isPromoActiveToday = (promoStartYmd, promoEndYmd) => {
  const start = normalizeYmd(promoStartYmd);
  const end = normalizeYmd(promoEndYmd);
  if (!start && !end) return true;

  const today = toLocalYmd(new Date());
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
};

const computeDiscountedUnitPrice = (product) => {
  const originalPrice = Number(
    product?.original_price ?? product?.originalPrice ?? product?.price ?? 0
  );
  const discountType = String(product?.discount_type ?? product?.discountType ?? "none");
  const discountValue = Number(product?.discount_value ?? product?.discountValue ?? 0);
  const promoStart = normalizeYmd(product?.promo_start ?? product?.promoStart);
  const promoEnd = normalizeYmd(product?.promo_end ?? product?.promoEnd);

  const isActiveWindow = isPromoActiveToday(promoStart, promoEnd);
  const shouldApply =
    discountType !== "none" && discountValue > 0 && (!promoStart && !promoEnd ? true : isActiveWindow);

  let finalPrice = originalPrice;
  let applied = false;

  if (shouldApply && originalPrice > 0) {
    if (discountType === "percentage") {
      finalPrice = Math.max(0, originalPrice * (1 - discountValue / 100));
      applied = finalPrice < originalPrice;
    } else if (discountType === "fixed") {
      // "fixed" in ProductForm means a fixed amount off (not a fixed final price)
      finalPrice = Math.max(0, originalPrice - discountValue);
      applied = finalPrice < originalPrice;
    }
  }

  return {
    unitPrice: Number.isFinite(finalPrice) ? finalPrice : originalPrice,
    originalPrice,
    discountType,
    discountValue,
    promoStart,
    promoEnd,
    discountApplied: applied,
  };
};

const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" &&
      window?.localStorage?.getItem("restaurant_id")) ||
    (typeof window !== "undefined" &&
      window?.localStorage?.getItem("restaurant_slug")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readCachedProducts = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("products.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return Array.isArray(parsed) ? parsed : [];
};

const writeCachedProducts = (products) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("products.v1"),
      JSON.stringify(Array.isArray(products) ? products : [])
    );
    localStorage.setItem(
      getRestaurantScopedCacheKey("productsUpdatedAtMs.v1"),
      String(Date.now())
    );
  } catch {}
};

const readCachedCategoryImages = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("categoryImages.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const writeCachedCategoryImages = (imagesByCategory) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("categoryImages.v1"),
      JSON.stringify(
        imagesByCategory && typeof imagesByCategory === "object" ? imagesByCategory : {}
      )
    );
  } catch {}
};

const readCachedCategoryOrderKeys = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("categoryOrderKeys.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return Array.isArray(parsed)
    ? parsed.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
};

const writeCachedCategoryOrderKeys = (orderKeys) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("categoryOrderKeys.v1"),
      JSON.stringify(Array.isArray(orderKeys) ? orderKeys : [])
    );
  } catch {}
};

const prefetchImageUrls = (urls, limit = 48) => {
  if (typeof window === "undefined") return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  const uniq = [];
  const seen = new Set();
  for (const url of urls) {
    if (!url || typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    uniq.push(trimmed);
    if (uniq.length >= limit) break;
  }

  const run = () => {
    uniq.forEach((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 0);
  }
};

export default function TransactionScreen() {
  useRegisterGuard();
  const paymentMethods = usePaymentMethods();
  const { formatCurrency } = useCurrency();
  const { tableId, orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navTimeoutsRef = useRef([]);
  const debugNavigate = useCallback(
    (to, options) => {
      if (typeof to === "string" && (to.startsWith("/tableoverview") || to.startsWith("/orders"))) {
        console.log("[TX_NAV]", {
          from: `${location.pathname}${location.search}`,
          to,
          options: options || null,
          mounted: true,
          now: new Date().toISOString(),
        });
      }
      navigate(to, options);
    },
    [navigate, location.pathname, location.search]
  );

  const scheduleNavigate = useCallback(
    (to, delayMs, options) => {
      const id = window.setTimeout(() => debugNavigate(to, options), delayMs);
      navTimeoutsRef.current.push(id);
      return id;
    },
    [debugNavigate]
  );

  useEffect(() => {
    return () => {
      navTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      navTimeoutsRef.current = [];
    };
  }, []);
  const initialOrderFromState = location.state?.order || null;
  const phoneOrderDraft = location.state?.phoneOrderDraft || null;
  const isNewPhoneOrderDraft =
    String(orderId) === "new" &&
    phoneOrderDraft &&
    typeof phoneOrderDraft === "object";
  const initialOrder =
    initialOrderFromState ||
    (isNewPhoneOrderDraft
      ? {
          ...phoneOrderDraft,
          id: null,
          status: "draft",
          items: [],
          order_type: "phone",
        }
      : null);
    const { t } = useTranslation(); // ✅ Enable translations
  const restaurantSlug = typeof window !== "undefined"
    ? localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id")
    : null;
  const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";
  const [products, setProducts] = useState(() => readCachedProducts());
 const [selectedForPayment, setSelectedForPayment] = useState([]);
const [showDiscountModal, setShowDiscountModal] = useState(false);
const [discountType, setDiscountType] = useState("percent"); // "percent" or "fixed"
const [discountValue, setDiscountValue] = useState(10);
const [showMergeTableModal, setShowMergeTableModal] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(() => !initialOrder);
  const [deferHeavyUi, setDeferHeavyUi] = useState(() => String(orderId) === "new");
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
  const [transactionSettings, setTransactionSettings] = useState(
    DEFAULT_TRANSACTION_SETTINGS
  );
  const dispatchKitchenOrdersReload = useCallback(() => {
    if (!window || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new Event("beypro:kitchen-orders-reload"));
  }, []);

  const dispatchOrdersLocalRefresh = useCallback(() => {
    if (!window || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new Event("beypro:orders-local-refresh"));
  }, []);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelQuantities, setCancelQuantities] = useState({});
  const [payQuantities, setPayQuantities] = useState({});
  const [disablePayForReopenedOnlineOrder, setDisablePayForReopenedOnlineOrder] = useState(false);

  const updateSelectionQuantity = useCallback(
    (key, qty, maxQty) => {
      if (!key) return;
      const limit = Math.max(1, Number(maxQty) || 1);
      const normalizedQty = Math.min(
        Math.max(1, Number(qty) || 1),
        limit
      );
      setCancelQuantities((prev) => {
        const next = { ...(prev || {}) };
        next[key] = normalizedQty;
        return next;
      });
      setPayQuantities((prev) => {
        const next = { ...(prev || {}) };
        next[key] = normalizedQty;
        return next;
      });
    },
    []
  );

  const removeSelectionQuantity = useCallback((key) => {
    if (!key) return;
    setCancelQuantities((prev) => {
      const next = { ...(prev || {}) };
      if (next[key] !== undefined) {
        delete next[key];
      }
      return next;
    });
    setPayQuantities((prev) => {
      const next = { ...(prev || {}) };
      if (next[key] !== undefined) {
        delete next[key];
      }
      return next;
    });
  }, []);
  const [refundMethodId, setRefundMethodId] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const didAutoOpenRegisterRef = useRef(false);
  const confirmReservationCloseResolverRef = useRef(null);
  const [confirmReservationCloseToast, setConfirmReservationCloseToast] = useState({
    show: false,
    schedule: null,
  });
  const requestReservationCloseConfirmation = useCallback((schedule) => {
    const normalizedSchedule = schedule && typeof schedule === "object" ? schedule : null;
    return new Promise((resolve) => {
      confirmReservationCloseResolverRef.current = resolve;
      setConfirmReservationCloseToast({ show: true, schedule: normalizedSchedule });
    });
  }, []);

  const resolveReservationCloseConfirmation = useCallback((value) => {
    const resolver = confirmReservationCloseResolverRef.current;
    confirmReservationCloseResolverRef.current = null;
    setConfirmReservationCloseToast({ show: false, schedule: null });
    if (typeof resolver === "function") resolver(!!value);
  }, []);
  const [isDebtSaving, setIsDebtSaving] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtForm, setDebtForm] = useState({ name: "", phone: "" });
  const [debtError, setDebtError] = useState("");
  const [debtLookupLoading, setDebtLookupLoading] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [reservationDate, setReservationDate] = useState("");
  const [reservationTime, setReservationTime] = useState("");
  const [reservationClients, setReservationClients] = useState("2");
  const [reservationNotes, setReservationNotes] = useState("");
  const [existingReservation, setExistingReservation] = useState(null);
  const [reservationLoading, setReservationLoading] = useState(false);
  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);
  const presetNotes = useMemo(
    () =>
      Array.isArray(transactionSettings.presetNotes) &&
      transactionSettings.presetNotes.length > 0
        ? transactionSettings.presetNotes
        : DEFAULT_TRANSACTION_SETTINGS.presetNotes,
    [transactionSettings.presetNotes]
  );
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
  const allPaidIncludingSuborders = allCartItemsPaid && allSuborderPaid;
const [debtSearch, setDebtSearch] = useState("");
const [debtSearchResults, setDebtSearchResults] = useState([]);
const [debtSearchLoading, setDebtSearchLoading] = useState(false);
const orderType = String(
  order?.order_type || (orderId ? "phone" : "table") || "table"
).toLowerCase();
const normalizedStatus = normalizeOrderStatus(order?.status);
const isPhoneOrder = orderType === "phone";
const [tableSettings, setTableSettings] = useState({
  tableLabelText: "",
  showAreas: true,
});
useSetting("tables", setTableSettings, {
  tableLabelText: "",
  showAreas: true,
});
const tableLabelText = String(tableSettings.tableLabelText || "").trim() || t("Table");
// Debt can be added only when order is confirmed/paid AND there are confirmed items and no unconfirmed items
const hasUnconfirmedItems = cartItems.some((i) => !i.confirmed);
const hasConfirmedUnpaidItems = cartItems.some((i) => i.confirmed && !i.paid);
const canShowDebtButton = normalizedStatus === "confirmed";
const isDebtEligible = canShowDebtButton && !hasUnconfirmedItems && hasConfirmedUnpaidItems;
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCartItems = Array.isArray(cartItems) ? cartItems : [];
  const rawCategories = useMemo(
    () => [...new Set(safeProducts.map((p) => p.category))].filter(Boolean),
    [safeProducts]
  );
  const [categoryOrderKeys, setCategoryOrderKeys] = useState(() =>
    readCachedCategoryOrderKeys()
  );
  useEffect(() => {
    writeCachedCategoryOrderKeys(categoryOrderKeys);
  }, [categoryOrderKeys]);
  const categories = useMemo(() => {
    const base = Array.isArray(rawCategories) ? rawCategories : [];
    if (base.length === 0) return [];
    if (!Array.isArray(categoryOrderKeys) || categoryOrderKeys.length === 0) return base;

    const baseByKey = new Map(base.map((cat) => [normalizeGroupKey(cat), cat]));
    const usedKeys = new Set();
    const ordered = [];

    categoryOrderKeys.forEach((key) => {
      const normalized = normalizeGroupKey(key);
      if (!normalized) return;
      const match = baseByKey.get(normalized);
      if (!match) return;
      if (usedKeys.has(normalized)) return;
      usedKeys.add(normalized);
      ordered.push(match);
    });

    base.forEach((cat) => {
      const key = normalizeGroupKey(cat);
      if (!key || usedKeys.has(key)) return;
      usedKeys.add(key);
      ordered.push(cat);
    });

    return ordered;
  }, [rawCategories, categoryOrderKeys]);
const [categoryColumnSlots, setCategoryColumnSlots] = useState(0);
const rightCategoryColumnRef = useRef(null);
const categoryMeasureRef = useRef(null);
const [bottomBarScrollable, setBottomBarScrollable] = useState(false);
const [bottomScrollEnd, setBottomScrollEnd] = useState(false);
const [bottomScrollStart, setBottomScrollStart] = useState(true);
const [excludedItems, setExcludedItems] = useState([]);
const [excludedCategories, setExcludedCategories] = useState([]);
const excludedItemsSet = useMemo(
  () => new Set((excludedItems || []).map((v) => String(v))),
  [excludedItems]
);
const excludedCategoriesSet = useMemo(
  () =>
    new Set(
      (excludedCategories || [])
        .map((v) => String(v ?? "").trim().toLowerCase())
        .filter(Boolean)
    ),
  [excludedCategories]
);
const [topRowScroll, setTopRowScroll] = useState({ canScrollLeft: false, canScrollRight: false });
const [rightColScroll, setRightColScroll] = useState({ canScrollUp: false, canScrollDown: false });
const [rightColThumb, setRightColThumb] = useState({ heightPct: 0, translatePct: 0 });
const topRowRef = useRef(null);

const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);
const activeCategory = categories[currentCategoryIndex] || "";
const activeCategoryKeyRef = useRef("");
useEffect(() => {
  activeCategoryKeyRef.current = normalizeGroupKey(activeCategory);
}, [activeCategory]);
const categoriesRef = useRef(categories);
useEffect(() => {
  categoriesRef.current = categories;
}, [categories]);
useEffect(() => {
  // Keep selection stable when categories change/reorder.
  if (!Array.isArray(categories) || categories.length === 0) {
    setCurrentCategoryIndex(0);
    return;
  }
  const key = activeCategoryKeyRef.current;
  const idx = key
    ? categories.findIndex((cat) => normalizeGroupKey(cat) === key)
    : -1;
  if (idx >= 0) {
    setCurrentCategoryIndex(idx);
    return;
  }
  setCurrentCategoryIndex((prev) => Math.min(Math.max(0, prev), categories.length - 1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [categories]);

const [isReorderingCategories, setIsReorderingCategories] = useState(false);
const [draggingCategoryKey, setDraggingCategoryKey] = useState("");
const draggedCategoryKeyRef = useRef("");
const reorderCategoryByKeyToIndex = useCallback((fromKey, toIdx) => {
  const current = categoriesRef.current || [];
  const key = normalizeGroupKey(fromKey);
  if (!key) return;
  const fromIdx = current.findIndex((cat) => normalizeGroupKey(cat) === key);
  if (fromIdx < 0) return;
  if (!Number.isFinite(toIdx) || toIdx < 0 || toIdx >= current.length) return;
  if (fromIdx === toIdx) return;

  const next = [...current];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);

  const nextKeys = next.map((cat) => normalizeGroupKey(cat)).filter(Boolean);
  setCategoryOrderKeys(nextKeys);

  const activeKey = activeCategoryKeyRef.current;
  const nextActiveIdx = Math.max(0, nextKeys.indexOf(activeKey));
  setCurrentCategoryIndex(nextActiveIdx);
}, []);
const [catalogSearch, setCatalogSearch] = useState("");
const normalizedCatalogSearch = useMemo(() => normalizeGroupKey(catalogSearch), [catalogSearch]);
const catalogSearchTokens = useMemo(() => {
  if (!normalizedCatalogSearch) return [];
  return normalizedCatalogSearch.split(" ").map((t) => t.trim()).filter(Boolean);
}, [normalizedCatalogSearch]);
const isCatalogSearching = catalogSearchTokens.length > 0;
const matchesCatalogQuery = useCallback(
  (value) => {
    if (!catalogSearchTokens.length) return true;
    const haystack = normalizeGroupKey(value);
    if (!haystack) return false;
    return catalogSearchTokens.every((token) => haystack.includes(token));
  },
  [catalogSearchTokens]
);
const productsInActiveCategory = safeProducts.filter(
  (p) =>
    (p.category || "").trim().toLowerCase() ===
    (activeCategory || "").trim().toLowerCase()
);
const visibleProducts = useMemo(() => {
  if (!isCatalogSearching) return productsInActiveCategory;
  return safeProducts.filter((p) => {
    const name = p?.name ?? "";
    const category = p?.category ?? "";
    return matchesCatalogQuery(name) || matchesCatalogQuery(category);
  });
}, [isCatalogSearching, productsInActiveCategory, safeProducts, matchesCatalogQuery]);
const matchingCategories = useMemo(() => {
  if (!isCatalogSearching) return [];
  return categories
    .map((cat, idx) => ({ cat, idx }))
    .filter((entry) => matchesCatalogQuery(entry.cat))
    .slice(0, 10);
}, [categories, isCatalogSearching, matchesCatalogQuery]);
const categoryColumns = useMemo(() => {
  const entries = categories.map((cat, index) => ({ cat, index }));
  if (entries.length === 0) {
    return { top: [], right: [], bottom: [], left: [] };
  }
  return {
    top: entries, // Show ALL categories in the top row
    right: [],
    left: [],
    bottom: [],
  };
}, [categories]);

const updateRightThumb = useCallback(() => {
  const node = rightCategoryColumnRef.current;
  if (!node) return;
  const { scrollTop, scrollHeight, clientHeight } = node;
  const trackHeight = Math.max(1, scrollHeight);
  const visible = Math.max(1, clientHeight);
  const heightPct = Math.min(100, (visible / trackHeight) * 100);
  const maxScroll = Math.max(1, scrollHeight - clientHeight);
  const translatePct = Math.min(100 - heightPct, (scrollTop / maxScroll) * (100 - heightPct));
  setRightColThumb({ heightPct, translatePct });
}, []);

const measureCategorySlots = useCallback(() => {
  if (typeof window === "undefined") return;
  const column = rightCategoryColumnRef.current;
  const sample = categoryMeasureRef.current;
  if (!column || !sample) return;
  const columnHeight = column.clientHeight;
  const itemHeight = sample.clientHeight;
  if (!columnHeight || !itemHeight) return;
  const gapRaw = window.getComputedStyle(column).rowGap;
  const gap = Number.isFinite(parseFloat(gapRaw)) ? parseFloat(gapRaw) : 0;
  const slots = Math.max(1, Math.floor((columnHeight + gap) / (itemHeight + gap)));
  setCategoryColumnSlots((prev) => (prev === slots ? prev : slots));
}, []);

useLayoutEffect(() => {
  if (typeof window === "undefined" || categories.length === 0) return;
  const id = window.requestAnimationFrame(measureCategorySlots);
  window.addEventListener("resize", measureCategorySlots);
  return () => {
    window.cancelAnimationFrame(id);
    window.removeEventListener("resize", measureCategorySlots);
  };
}, [categories.length, measureCategorySlots]);

useEffect(() => {
const checkScroll = (ref, setter, isVertical) => {
  if (!ref?.current) return;
  if (isVertical) {
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    setter({
      canScrollUp: scrollTop > 0,
      canScrollDown: scrollTop + clientHeight < scrollHeight - 1,
    });
    if (ref?.current === rightCategoryColumnRef.current) {
      updateRightThumb();
    }
  } else {
    const { scrollLeft, scrollWidth, clientWidth } = ref.current;
    setter({
      canScrollLeft: scrollLeft > 0,
      canScrollRight: scrollLeft + clientWidth < scrollWidth - 1,
      });
    }
  };

  const handleTopRowScroll = () => checkScroll(topRowRef, setTopRowScroll, false);
  const handleRightColScroll = () => checkScroll(rightCategoryColumnRef, setRightColScroll, true);

  const handleResize = () => {
    handleTopRowScroll();
    handleRightColScroll();
  };

  topRowRef.current?.addEventListener("scroll", handleTopRowScroll);
  rightCategoryColumnRef.current?.addEventListener("scroll", handleRightColScroll);
  window.addEventListener("resize", handleResize);

  handleTopRowScroll();
  handleRightColScroll();
  updateRightThumb();

  return () => {
    topRowRef.current?.removeEventListener("scroll", handleTopRowScroll);
    rightCategoryColumnRef.current?.removeEventListener("scroll", handleRightColScroll);
    window.removeEventListener("resize", handleResize);
  };
}, [updateRightThumb]);

useLayoutEffect(() => {
  updateRightThumb();
}, [categories.length, updateRightThumb]);

useEffect(() => {
  if (!deferHeavyUi) return;
  const id = window.requestAnimationFrame(() => setDeferHeavyUi(false));
  return () => window.cancelAnimationFrame(id);
}, [deferHeavyUi]);

const isCashMethod = useCallback(
  (methodId) => {
    if (!methodId) return false;
    const method = paymentMethods.find((m) => m.id === methodId);
    const label = method?.label || methodId;
    return isCashLabel(label);
  },
  [paymentMethods]
);

const isOrderOnline = useCallback((candidate) => {
  if (!candidate) return false;
  const type = String(candidate.order_type || candidate.orderType || "").toLowerCase();
  const payment = String(
    candidate.payment_method ||
      candidate.paymentMethod ||
      candidate.method ||
      ""
  ).toLowerCase();
  return type === "online" || payment === "online";
}, []);

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
    const ok = await printViaBridge("", printable);
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
      debugNavigate("/tableoverview?tab=tables");
    } else if (orderId) {
      debugNavigate("/orders");
    }
  } catch (err) {
    console.error("❌ Failed to add debt:", err);
    setDebtError(err.message || t("Failed to add order debt"));
  } finally {
    setIsDebtSaving(false);
  }
};

const handleSaveReservation = async () => {
  if (!order?.id) {
    showToast(t("Select an order first"));
    return;
  }

  if (!reservationDate.trim() || !reservationTime.trim() || !reservationClients.trim()) {
    showToast(t("Please fill in Date, Time, and Number of Clients"));
    return;
  }

  setReservationLoading(true);
  try {
    // 1️⃣ Prepare request payload
    const payload = {
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      reservation_clients: parseInt(reservationClients),
      reservation_notes: reservationNotes,
    };
    
    // Add order_id only for new reservations
    if (!existingReservation) {
      payload.order_id = order.id;
    }

    // Save reservation to backend
    const endpoint = existingReservation 
      ? `/orders/reservations/${existingReservation.id}${identifier}`
      : `/orders/reservations${identifier}`;
    
    const response = await secureFetch(endpoint, {
      method: existingReservation ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });

    if (!response?.success) {
      showToast(t("Failed to save reservation"));
      return;
    }

    const savedReservation = response?.reservation || null;
    if (savedReservation) {
      setExistingReservation(savedReservation);
      setOrder((prev) => ({
        ...(prev || {}),
        reservation_date: savedReservation.reservation_date ?? reservationDate,
        reservation_time: savedReservation.reservation_time ?? reservationTime,
        reservation_clients: savedReservation.reservation_clients ?? parseInt(reservationClients),
        reservation_notes: savedReservation.reservation_notes ?? reservationNotes,
        status: savedReservation.status ?? prev?.status,
      }));
    } else {
      // Fallback: show badge immediately even if backend didn't return the row
      const fallback = {
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        reservation_clients: parseInt(reservationClients) || 0,
        reservation_notes: reservationNotes,
      };
      setExistingReservation(fallback);
      setOrder((prev) => ({ ...(prev || {}), ...fallback }));
    }

    // 2️⃣ If it's a new reservation (not existing), confirm unconfirmed items like confirm order button
    if (!existingReservation) {
      // Confirm any unconfirmed items and send to kitchen
      if (hasUnconfirmedCartItems) {
        // Calculate total from cart items
        const cartTotal = safeCartItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const updated = await updateOrderStatus("confirmed", cartTotal);
        if (!updated) {
          showToast(t("Failed to confirm order items"));
          setReservationLoading(false);
          return;
        }

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

        setOrder((prev) => ({ ...prev, status: "reserved" }));
        await fetchOrderItems(updated.id);
      }
    }

    // 3️⃣ Show success and close modal
    showToast(
      existingReservation
        ? t("✅ Reservation updated")
        : t("✅ Reservation confirmed and order sent to kitchen")
    );
    setShowReservationModal(false);
    resetReservationForm();
  } catch (err) {
    console.error("❌ Failed to save reservation:", err);
    showToast(err.message || t("Failed to save reservation"));
  } finally {
    setReservationLoading(false);
  }
};

const handleDeleteReservation = async () => {
  if (!order?.id) return;
  if (!existingReservation?.reservation_date) return;

  const ok = window.confirm(t("Delete this reservation?"));
  if (!ok) return;

  setReservationLoading(true);
  try {
    const response = await secureFetch(`/orders/${order.id}/reservations${identifier}`, {
      method: "DELETE",
    });

    if (response?.error) throw new Error(response.error);
    if (response?.success === false) throw new Error(response.message || t("Failed to delete reservation"));

    const nextOrder = response?.order || response;
    setOrder((prev) => ({ ...(prev || {}), ...(nextOrder || {}) }));
    setExistingReservation(null);
    resetReservationForm();
    showToast(t("✅ Reservation deleted"));
    setShowReservationModal(false);
  } catch (err) {
    console.error("❌ Failed to delete reservation:", err);
    showToast(err?.message || t("Failed to delete reservation"));
  } finally {
    setReservationLoading(false);
  }
};

const resetReservationForm = () => {
  setReservationDate("");
  setReservationTime("");
  setReservationClients("2");
  setReservationNotes("");
};

const openReservationModal = async () => {
  // Try to fetch existing reservation for this order
  if (order?.id) {
    try {
      // The endpoint returns the order with reservation fields if they exist
      const existing = await secureFetch(`/orders/${order.id}${identifier}`);
      if (existing?.reservation_date) {
        // Reservation data already loaded in order object
        setExistingReservation(existing);
        setReservationDate(existing.reservation_date || "");
        setReservationTime(existing.reservation_time || "");
        setReservationClients(existing.reservation_clients?.toString() || "2");
        setReservationNotes(existing.reservation_notes || "");
      } else {
        resetReservationForm();
        setExistingReservation(null);
      }
    } catch (err) {
      console.error("Failed to fetch existing reservation:", err);
      resetReservationForm();
      setExistingReservation(null);
    }
  }
  setShowReservationModal(true);
};

const renderCategoryButton = (cat, idx, variant = "desktop") => {
  const normalizedVariant = variant === "bar" ? "vertical" : variant;
  const slug = (cat || "").trim().toLowerCase();
  const catSrc = categoryImages[slug] || "";
  const isActive = currentCategoryIndex === idx;
  const hasImg = !!catSrc;
  const isDragEnabled = isReorderingCategories && normalizedVariant === "horizontal";
  const key = normalizeGroupKey(cat);
  const isDragging = !!key && key === draggingCategoryKey;

  const baseClasses =
    "flex flex-col items-center justify-center gap-1 rounded-2xl border bg-white/80 px-2 py-2 text-center shadow-[0_8px_20px_rgba(30,64,175,0.08)] transition-all duration-150 select-none touch-manipulation hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 active:scale-[0.98] dark:bg-slate-900/60 dark:border-slate-700/70 dark:shadow-[0_8px_20px_rgba(0,0,0,0.35)]";

  const paddingClass =
    normalizedVariant === "mobile"
      ? "px-1 py-1.5"
      : normalizedVariant === "grid"
      ? "px-1 py-1"
      : normalizedVariant === "vertical"
      ? "px-1 py-1"
      : normalizedVariant === "horizontal"
      ? "px-1 py-1"
      : "px-1.5 py-1.5";

  const widthClass =
    normalizedVariant === "mobile"
      ? "min-w-[86px] max-w-[96px] snap-start"
      : normalizedVariant === "grid"
      ? "w-[86px]"
      : normalizedVariant === "vertical"
      ? "w-[86px]"
      : normalizedVariant === "horizontal"
      ? "w-[86px]"
      : "w-full";
  const activeClasses =
    "border-indigo-300 bg-gradient-to-br from-white via-white to-indigo-50 shadow-[0_14px_26px_rgba(99,102,241,0.18)] ring-1 ring-indigo-200 dark:border-indigo-500/50 dark:from-indigo-950/35 dark:via-slate-900/50 dark:to-slate-950/30 dark:shadow-[0_14px_26px_rgba(0,0,0,0.4)] dark:ring-indigo-500/25";
  const inactiveClasses =
    "border-white/70 hover:border-indigo-200 hover:bg-white dark:border-slate-700/70 dark:hover:border-indigo-500/40 dark:hover:bg-slate-900/70";

  const imageClasses =
    normalizedVariant === "vertical"
      ? "h-[58px] w-[58px] object-cover rounded-2xl"
      : normalizedVariant === "horizontal"
      ? "h-[58px] w-[58px] object-cover rounded-2xl"
      : "h-[58px] w-[58px] object-cover rounded-2xl";
  const iconClasses = "text-[16px] leading-tight";

  const labelClasses =
    normalizedVariant === "grid"
      ? "text-[12px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[84px] dark:text-slate-200"
      : normalizedVariant === "vertical"
      ? "text-[12px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[84px] dark:text-slate-200"
      : normalizedVariant === "horizontal"
      ? "text-[12px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[84px] dark:text-slate-200"
      : "text-[12px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[80px] dark:text-slate-200";

  return (
    <button
      key={`${variant}-${cat}-${idx}`}
      type="button"
      data-cat-idx={idx}
      onClick={() => {
        if (isReorderingCategories) return;
        setCurrentCategoryIndex(idx);
      }}
      draggable={isDragEnabled}
      onDragStart={(e) => {
        if (!isDragEnabled) return;
        const dragKey = normalizeGroupKey(cat);
        draggedCategoryKeyRef.current = dragKey;
        setDraggingCategoryKey(dragKey);
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragKey);
        } catch {}
      }}
      onDragOver={(e) => {
        if (!isDragEnabled) return;
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = "move";
        } catch {}
      }}
      onDrop={(e) => {
        if (!isDragEnabled) return;
        e.preventDefault();
        const fromKey =
          draggedCategoryKeyRef.current ||
          (() => {
            try {
              return e.dataTransfer.getData("text/plain");
            } catch {
              return "";
            }
          })();
        reorderCategoryByKeyToIndex(fromKey, idx);
        draggedCategoryKeyRef.current = "";
        setDraggingCategoryKey("");
      }}
      onDragEnd={() => {
        draggedCategoryKeyRef.current = "";
        setDraggingCategoryKey("");
      }}
      onPointerDown={(e) => {
        if (!isDragEnabled) return;
        const dragKey = normalizeGroupKey(cat);
        draggedCategoryKeyRef.current = dragKey;
        setDraggingCategoryKey(dragKey);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!isDragEnabled) return;
        if (!draggedCategoryKeyRef.current) return;
        const el =
          typeof document !== "undefined"
            ? document.elementFromPoint(e.clientX, e.clientY)
            : null;
        const target = el?.closest?.("[data-cat-idx]");
        if (!target) return;
        const toIdx = Number(target.getAttribute("data-cat-idx"));
        if (!Number.isFinite(toIdx)) return;
        reorderCategoryByKeyToIndex(draggedCategoryKeyRef.current, toIdx);
      }}
      onPointerUp={() => {
        draggedCategoryKeyRef.current = "";
        setDraggingCategoryKey("");
      }}
      onPointerCancel={() => {
        draggedCategoryKeyRef.current = "";
        setDraggingCategoryKey("");
      }}
      className={`${widthClass} ${baseClasses} ${paddingClass} ${
        isActive ? activeClasses : inactiveClasses
      } ${isDragEnabled ? "cursor-grab" : "cursor-pointer"} ${
        isDragging ? "ring-2 ring-indigo-400/70" : ""
      }`}
    >
      {hasImg ? (
        <img src={catSrc} alt={cat} className={imageClasses} />
      ) : (
        <div className="flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700">
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-200">
            {(cat || "")
              .split(" ")
              .map((part) => part[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
        </div>
      )}
      <span className={labelClasses}>{t(cat)}</span>
    </button>
  );
};




const hasExtras = (item) => Array.isArray(item.extras) && item.extras.length > 0;
const [categoryImages, setCategoryImages] = useState(() => readCachedCategoryImages());
// Calculate extras total and final price in the Add to Cart modal
const validExtras = selectedExtras.filter(ex => ex.quantity > 0);
const extrasPricePerProduct = validExtras.reduce(
  (sum, ex) => sum + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
  0
);
const basePrice = selectedProduct ? computeDiscountedUnitPrice(selectedProduct).unitPrice : 0;
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
const [showPaidCartItems, setShowPaidCartItems] = useState(false);
const latestOrderRef = useRef(null);
const latestCartItemsRef = useRef([]);
const phoneOrderCreatePromiseRef = useRef(null);
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
  setPayQuantities({});
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
  if (cartItems.length === 0) return;
  if (selectedCartItemIds.size === 0) return;

  const selectedKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));
  const hasUnconfirmedSelected = cartItems.some((item) => {
    const key = String(item.unique_id || item.id);
    return selectedKeys.has(key) && !item.confirmed && !isPaidItem(item);
  });

  if (!hasUnconfirmedSelected) {
    return;
  }

  setCartItems((prev) =>
    prev.filter((item) => {
      const key = String(item.unique_id || item.id);
      const shouldRemove = selectedKeys.has(key) && !item.confirmed && !isPaidItem(item);
      return !shouldRemove;
    })
  );

  setSelectedCartItemIds(new Set());
  setSelectedForPayment((prev) => prev.filter((id) => !selectedKeys.has(id)));
}, [cartItems, selectedCartItemIds]);

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

// 🎫 Load existing reservation when order loads or changes
useEffect(() => {
  if (!order?.id) {
    setExistingReservation(null);
    resetReservationForm();
    return;
  }

  const loadReservation = async () => {
    try {
      const resData = await secureFetch(`/orders/reservations/${order.id}${identifier}`);
      if (resData?.success && resData?.reservation) {
        setExistingReservation(resData.reservation);
        setReservationDate(resData.reservation.reservation_date || "");
        setReservationTime(resData.reservation.reservation_time || "");
        setReservationClients(resData.reservation.reservation_clients?.toString() || "2");
        setReservationNotes(resData.reservation.reservation_notes || "");
      } else {
        setExistingReservation(null);
        resetReservationForm();
      }
    } catch (err) {
      console.warn("Failed to load existing reservation:", err);
      setExistingReservation(null);
      resetReservationForm();
    }
  };

  loadReservation();
}, [order?.id, identifier]);

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
    !!orderId &&
    ["confirmed", "paid", "closed"].includes(status) &&
    String(order.order_type || "").toLowerCase() !== "phone";

  // ✅ Combine cleanly and safely
  const subtitleText = showCustomerInfo
    ? [name, phone ? `📞 ${phone}` : null, address ? `📍 ${address}` : null]
        .filter(Boolean)
        .join("   ")
    : "";

  const headerTitle = orderId
    ? order.order_type === "packet"
      ? t("Packet")
      : String(order.order_type || "").toLowerCase() === "phone"
      ? order.customer_name?.trim() || t("Phone Order")
      : order.customer_name || order.customer_phone || t("Phone Order")
    : `${tableLabelText} ${tableId}`;

  setHeader({
    title: headerTitle,
    subtitle: subtitleText || undefined,
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
      writeCachedCategoryImages(dict);
      prefetchImageUrls(Object.values(dict).filter(Boolean), 16);
    })
    .catch((err) => {
      console.error("❌ Failed to load category images:", err);
      // keep cached images if available
    });
}, []);

useEffect(() => {
  prefetchImageUrls(Object.values(categoryImages || {}).filter(Boolean), 16);
}, [Object.keys(categoryImages || {}).length]); // eslint-disable-line react-hooks/exhaustive-deps

// At the top inside TransactionScreen()
const handleQuickDiscount = () => {
  // TODO: open your discount modal, or show a toast for now
  setToast({ show: true, message: t("Quick Discount is coming soon!") });
};

useEffect(() => {
  loadRegisterSummary().catch((err) => {
    console.warn("⚠️ Failed to prefetch register summary:", err);
  });
}, []);

const handleOpenCashRegister = () => {
  loadRegisterSummary().catch(() => {});
  navigate("/tableoverview?tab=register", {
    state: { openRegisterModal: true },
  });
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

  // 💡 Compute total of selected cart items (supports partial quantity selection)
  const selectedItemsTotal = cartItems.reduce((sum, item) => {
    const key = String(item.unique_id || item.id);
    if (!selectedCartItemIds.has(key)) return sum;
    const maxQty = Math.max(1, Number(item.quantity) || 1);
    const selectedQty = Math.min(
      maxQty,
      Number(payQuantities?.[key] || maxQty)
    );
    const perUnit = computeItemLineTotal(item) / maxQty;
    return sum + perUnit * selectedQty;
  }, 0);

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
      const maxQty = Math.max(1, Number(item.quantity) || 1);
      const requested = Number(cancelQuantities[key]) || 1;
      const cancelQty = Math.min(Math.max(1, requested), maxQty);
      const perUnit = computeItemLineTotal(item) / maxQty;
      return sum + perUnit * cancelQty;
    }, 0);
  }, [cancelQuantities, cartItems, selectedCartItemIds, computeItemLineTotal]);

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

  const unpaidCartItems = useMemo(() => {
    return (Array.isArray(cartItems) ? cartItems : []).filter((item) => !item?.paid);
  }, [cartItems]);

  const paidCartItems = useMemo(() => {
    return (Array.isArray(cartItems) ? cartItems : []).filter((item) => !!item?.paid);
  }, [cartItems]);

  useEffect(() => {
    if (unpaidCartItems.length === 0 && paidCartItems.length > 0) {
      setShowPaidCartItems(true);
    }
  }, [paidCartItems.length, unpaidCartItems.length]);
 
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

      const desired =
        String(
          order?.payment_method ??
            phoneOrderDraft?.payment_method ??
            phoneOrderDraft?.paymentMethod ??
            ""
        ).trim();
      if (desired) {
        const desiredLower = desired.toLowerCase();
        const match = paymentMethods.find((method) => {
          const id = String(method?.id || "").trim().toLowerCase();
          const label = String(method?.label || "").trim().toLowerCase();
          return id === desiredLower || label === desiredLower;
        });
        if (match?.id) return match.id;
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
  }, [paymentMethods, order?.payment_method, phoneOrderDraft]);

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
    if (normalizedStatus !== "confirmed") {
      showToast(t("Order must be confirmed before cancelling."));
      return;
    }
    if (selectedCartItems.length === 0) {
      showToast(t("Select item to cancel"));
      return;
    }
    setCancelReason("");
    setCancelQuantities({});
    setRefundMethodId(getDefaultRefundMethod());
    setShowCancelModal(true);
  }, [getDefaultRefundMethod, order?.id, normalizedStatus, selectedCartItems.length, t]);

  const closeCancelModal = useCallback(() => {
    setShowCancelModal(false);
    setCancelReason("");
    setCancelQuantities({});
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
      .map((item) => {
        const uniqueId = item.unique_id || item.id;
        if (!uniqueId) return null;
        const maxQty = Math.max(1, Number(item.quantity) || 1);
        const requested = Number(cancelQuantities[String(uniqueId)]) || 1;
        const qty = Math.min(Math.max(1, requested), maxQty);
        return { unique_id: String(uniqueId), quantity: qty };
      })
      .filter(Boolean);
    const isPartialCancel = selectedItemsForCancel.length > 0;
    if (!isPartialCancel) {
      showToast(t("Select item to cancel"));
      return;
    }

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
  // Close the modal immediately for a snappier feel
  setShowPaymentModal(false);

  try {
    const splitMethodIds = Object.entries(splits || {})
      .filter(([, value]) => {
        const parsed = parseFloat(value);
        return !Number.isNaN(parsed) && parsed > 0;
      })
      .map(([methodId]) => methodId)
      .filter(Boolean);

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

    // ⚡ INSTANT: Update UI + dispatch refresh (don't block on background)
    setSelectedForPayment([]);
    setShowPaymentModal(false);
    setSelectedCartItemIds(new Set());
    dispatchOrdersLocalRefresh();
    if (window && typeof window.playPaidSound === "function") window.playPaidSound();

    // ⚡ All heavy lifting happens in background without blocking
    Promise.allSettled([
      refreshReceiptAfterPayment(),
      fetchOrderItems(order.id),
      fetchSubOrders(),
      dispatchKitchenOrdersReload(),
      (async () => {
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
          await runAutoCloseIfConfigured(true, splitMethodIds);
        }
      })(),
      (async () => {
        if (cashPortion > 0) {
          const note = order?.id ? `Order #${order.id} (split)` : "Split payment";
          await logCashRegisterEvent({ type: "sale", amount: cashPortion, note });
          await openCashDrawer();
        }
      })(),
    ]).catch((err) => console.warn("⚠️ Background tasks failed:", err));

  } catch (err) {
    console.error("❌ confirmPaymentWithSplits failed:", err);
    // optionally toast
  }
};

const resetTableGuests = async (tableNumber) => {
  const normalizedNumber =
    tableNumber === null || tableNumber === undefined
      ? NaN
      : Number(tableNumber);
  if (!Number.isFinite(normalizedNumber)) return;

  try {
    await secureFetch(`/tables/${normalizedNumber}${identifier}`, {
      method: "PATCH",
      body: JSON.stringify({ guests: null }),
    });
  } catch (err) {
    console.warn("⚠️ Failed to reset table guests:", err);
  }
};

const runAutoCloseIfConfigured = useCallback(
  async (shouldClose, paymentMethodIds = null) => {
    if (!shouldClose || !order?.id) return;

    const shouldAutoCloseTable =
      orderType === "table" && transactionSettings.autoCloseTableAfterPay;
    const isPacketType = ["packet", "phone", "online"].includes(orderType);

    const packetMethodsSetting = transactionSettings.autoClosePacketAfterPayMethods;
    const packetAllowsAll =
      packetMethodsSetting === null || typeof packetMethodsSetting === "undefined";
    const allowedPacketMethodIds = Array.isArray(packetMethodsSetting)
      ? packetMethodsSetting.filter(Boolean)
      : null;

    const normalizePaymentKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

    const deriveUsedPacketMethodIds = () => {
      if (Array.isArray(paymentMethodIds) && paymentMethodIds.length > 0) {
        return paymentMethodIds.filter(Boolean);
      }

      const raw = String(order?.payment_method || "").trim();
      const tokens = raw
        ? raw
            .split(/[+,]/)
            .map((part) => part.trim())
            .filter(Boolean)
        : [];

      const derived = tokens
        .map((token) => {
          const norm = normalizePaymentKey(token);
          const match = (Array.isArray(paymentMethods) ? paymentMethods : []).find((m) => {
            const idNorm = normalizePaymentKey(m.id);
            const labelNorm = normalizePaymentKey(m.label);
            return idNorm === norm || labelNorm === norm;
          });
          return match?.id || null;
        })
        .filter(Boolean);

      if (derived.length === 0 && selectedPaymentMethod) {
        derived.push(selectedPaymentMethod);
      }

      return derived;
    };

    const packetMethodAllowed = (() => {
      if (packetAllowsAll) return true;
      if (!Array.isArray(allowedPacketMethodIds)) return true;
      if (allowedPacketMethodIds.length === 0) return false; // explicit "none selected"

      const usedIds = deriveUsedPacketMethodIds();
      if (usedIds.length === 0) return true; // unknown method => keep legacy behavior
      return usedIds.some((id) => allowedPacketMethodIds.includes(id));
    })();

    const shouldAutoClosePacket =
      isPacketType && transactionSettings.autoClosePacketAfterPay && packetMethodAllowed;

    if (!shouldAutoCloseTable && !shouldAutoClosePacket) return;

    if (shouldAutoCloseTable) {
      const reservationSource = existingReservation ?? order;
      const schedule = getReservationSchedule(reservationSource);
      if (schedule && isEarlyReservationClose(reservationSource)) {
        const ok = await requestReservationCloseConfirmation(schedule);
        if (!ok) return;
      }
    }

    try {
      await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
      await resetTableGuests(order?.table_number ?? order?.tableNumber);
    } catch (err) {
      console.warn("⚠️ Auto-close failed:", err?.message || err);
    }

    navigate(shouldAutoCloseTable ? "/tableoverview?tab=tables" : "/orders");
  },
  [
    identifier,
    navigate,
    existingReservation,
    order,
    orderType,
    paymentMethods,
    requestReservationCloseConfirmation,
    transactionSettings.autoClosePacketAfterPay,
    transactionSettings.autoClosePacketAfterPayMethods,
    transactionSettings.autoCloseTableAfterPay,
    selectedPaymentMethod,
  ]
);

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
  return Array.isArray(items) && items.every((item) => {
      // If the product is excluded from kitchen, skip from delivery check
      const itemId = String(item?.id ?? item?.product_id ?? "");
      const category = String(item?.category ?? "").trim().toLowerCase();
      const isExcluded =
        (itemId && excludedItemsSet.has(itemId)) ||
        (category && excludedCategoriesSet.has(category));

      const status = String(item?.kitchen_status ?? "").toLowerCase();
      return (
        isExcluded ||
        !status ||
        status === "delivered" ||
        status === "packet_delivered"
      );
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
      writeCachedProducts(normalized);
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
  prefetchImageUrls(
    (Array.isArray(products) ? products : [])
      .filter(
        (p) =>
          (p?.category || "").trim().toLowerCase() ===
          (activeCategory || "").trim().toLowerCase()
      )
      .map((p) => p?.image)
      .filter(Boolean),
    36
  );
}, [activeCategory, products.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
  latestOrderRef.current = order || null;
}, [order]);

useEffect(() => {
  latestCartItemsRef.current = Array.isArray(cartItems) ? cartItems : [];
}, [cartItems]);

useEffect(() => {
  return () => {
    const currentOrder = latestOrderRef.current;
    const currentItems = latestCartItemsRef.current;
    if (!currentOrder?.id) return;
    if (currentItems.length > 0) return;

    const orderType = String(currentOrder.order_type || "").toLowerCase();
    if (orderType === "phone") {
      secureFetch(`/orders/${currentOrder.id}/close${identifier}`, { method: "POST" });
      return;
    }
    secureFetch(`/orders/${currentOrder.id}/reset-if-empty${identifier}`, { method: "PATCH" });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [identifier]);

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
    
    // 🔧 CRITICAL FIX: Preserve unconfirmed items that are still in the cart
    setCartItems((prevCart) => {
      const formattedItems = Array.isArray(items)
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
        : [];

      const confirmedKeys = new Set(
        formattedItems.map((i) => String(i.unique_id || `${i.id}-${JSON.stringify(i.extras || [])}`))
      );

      const unconfirmedItems = prevCart.filter((item) => {
        if (item.confirmed || item.paid) return false;
        const key = String(item.unique_id || `${item.id}-${JSON.stringify(item.extras || [])}`);
        return !confirmedKeys.has(key);
      });

      return [...formattedItems, ...unconfirmedItems];
    });
    setLoading(false);
  } catch (err) {
    console.error("❌ Error fetching takeaway order:", err);
    setLoading(false);
  }
};

const fetchOrderItems = async (orderId, options = {}) => {
  const { orderTypeOverride, sourceOverride } = options;
  try {
    const normalizedOrderId =
      orderId === null || orderId === undefined ? "" : String(orderId).trim();
    if (!normalizedOrderId || normalizedOrderId.toLowerCase() === "null") {
      console.warn("⚠️ fetchOrderItems skipped (missing orderId):", orderId);
      return [];
    }
    const items = await secureFetch(`/orders/${orderId}/items${identifier}`);

    if (!Array.isArray(items)) {
      console.error("❌ Expected items to be an array but got:", items);
      return [];
    }

    const productsById = new Map(
      (Array.isArray(products) ? products : []).map((p) => [String(p?.id), p])
    );

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

      const productId = item.product_id ?? item.id;
      const matchedProduct = productsById.get(String(productId));
      const promoStart = normalizeYmd(matchedProduct?.promo_start ?? matchedProduct?.promoStart);
      const promoEnd = normalizeYmd(matchedProduct?.promo_end ?? matchedProduct?.promoEnd);
      const discountType = String(
        matchedProduct?.discount_type ?? matchedProduct?.discountType ?? "none"
      );
      const discountValue = Number(
        matchedProduct?.discount_value ?? matchedProduct?.discountValue ?? 0
      );
      const originalPrice = Number(matchedProduct?.price ?? item.price ?? 0) || 0;
      const unitPrice = parseFloat(item.price) || 0;

      return {
        id: item.product_id,
        name: item.name || item.order_item_name || item.product_name || "Unnamed",
        category: item.category || null,
        quantity: qty,
        price: unitPrice,
        original_price: originalPrice,
        discount_type: discountType,
        discount_value: discountValue,
        promo_start: promoStart,
        promo_end: promoEnd,
        discount_applied:
          discountType !== "none" &&
          Number.isFinite(originalPrice) &&
          Math.abs(originalPrice - unitPrice) > 0.0001,
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

    // 🔧 CRITICAL FIX: Preserve unconfirmed items that are still in the cart
    // This prevents items from disappearing when socket events trigger a refresh
    setCartItems((prevCart) => {
      const confirmedKeys = new Set(
        formatted.map((i) => String(i.unique_id || `${i.id}-${JSON.stringify(i.extras || [])}`))
      );
      // Keep only unconfirmed items that are not already returned by the server
      const unconfirmedItems = prevCart.filter((item) => {
        if (item.confirmed || item.paid) return false;
        const key = String(item.unique_id || `${item.id}-${JSON.stringify(item.extras || [])}`);
        return !confirmedKeys.has(key);
      });
      return [...formatted, ...unconfirmedItems];
    });
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
    // Render the screen immediately; hydrate items in the background.
    setLoading(false);
    fetchOrderItems(newOrder.id, {
      orderTypeOverride: newOrder.order_type,
      sourceOverride: newOrder.source,
    }).catch((err) => {
      console.error("❌ Error fetching order items:", err);
    });
  } catch (err) {
    console.error("❌ Error creating/fetching table order:", err);
    setLoading(false);
  }
};

useEffect(() => {
  const hasWarmOrder = Boolean(initialOrder && typeof initialOrder === "object");

  if (hasWarmOrder) {
    setOrder(initialOrder);

    if (!location.state?.preserveCart) {
      const warmItems = Array.isArray(initialOrder.items) ? initialOrder.items : [];
      const formatted = warmItems.map((item) => {
        const extras = safeParseExtras(item.extras);
        const qty = parseInt(item.quantity, 10) || 1;
        const paid = Boolean(item.paid || item.paid_at);
        return {
          id: item.product_id ?? item.id ?? item.productId,
          name:
            item.name ||
            item.order_item_name ||
            item.product_name ||
            item.productName ||
            "Unnamed",
          category: item.category || null,
          quantity: qty,
          price: parseFloat(item.price) || 0,
          ingredients: item.ingredients || [],
          extras,
          unique_id:
            item.unique_id || `${item.product_id}-${JSON.stringify(extras || [])}-${uuidv4()}`,
          confirmed: item.confirmed ?? true,
          paid,
          payment_method: item.payment_method ?? "Unknown",
          note: item.note || "",
          kitchen_status: item.kitchen_status || "",
        };
      });

      setCartItems(formatted);
      setReceiptItems(formatted.filter((i) => i.paid));
    }
    setLoading(false);
  } else {
    setOrder(null);
    setCartItems([]);
    setReceiptItems([]);
    setLoading(true);
  }

  if (orderId && String(orderId) !== "new") {
    // Avoid a pointless refetch if we already navigated here with the same order in state.
    if (!hasWarmOrder || String(initialOrder?.id) !== String(orderId)) {
      fetchPhoneOrder(orderId);
    }
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
  let targetId = order?.id || (orderId && String(orderId) !== "new" ? orderId : null) || tableId;
  if (!targetId) {
    if (orderType === "phone") {
      try {
        const payload = {
          order_type: "phone",
          status: "draft",
          customer_name:
            order?.customer_name ??
            phoneOrderDraft?.customer_name ??
            phoneOrderDraft?.customerName ??
            "",
          customer_phone:
            order?.customer_phone ??
            phoneOrderDraft?.customer_phone ??
            phoneOrderDraft?.customerPhone ??
            "",
          customer_address:
            order?.customer_address ??
            phoneOrderDraft?.customer_address ??
            phoneOrderDraft?.customerAddress ??
            "",
          payment_method:
            order?.payment_method ??
            phoneOrderDraft?.payment_method ??
            phoneOrderDraft?.paymentMethod ??
            selectedPaymentMethod ??
            "",
          total: 0,
        };

        // Avoid creating duplicate phone orders:
        // - `finalizeCartItem` may already be creating one via `ensurePhoneOrder()`
        // - If that promise is in-flight, reuse it here.
        let created = null;
        if (phoneOrderCreatePromiseRef.current) {
          created = await phoneOrderCreatePromiseRef.current;
        } else {
          const promise = (async () => {
            const result = await secureFetch(`/orders${identifier}`, {
              method: "POST",
              body: JSON.stringify(payload),
            });
            if (!result?.id) {
              throw new Error(result?.error || "Failed to create order");
            }
            setOrder((prev) => (prev ? { ...prev, ...result } : result));
            return result;
          })();
          phoneOrderCreatePromiseRef.current = promise;
          promise.finally(() => {
            if (phoneOrderCreatePromiseRef.current === promise) {
              phoneOrderCreatePromiseRef.current = null;
            }
          });
          created = await promise;
        }

        if (!created?.id) throw new Error(created?.error || "Failed to create order");
        targetId = created.id;
      } catch (err) {
        console.error("❌ Failed to create phone order:", err);
        showToast(err?.message || t("Failed to create phone order"));
        return null;
      }
    } else {
      console.error("❌ No order ID found.");
      showToast("Invalid order ID");
      return null;
    }
  }

  const prevOrderTotal = Number(order?.total || 0);

  try {
    const body = {
      status: newStatus || undefined,
      payment_status: newStatus === "paid" ? "paid" : undefined,
      total: total ?? order?.total ?? undefined,
      payment_method:
        method ||
        order?.payment_method ||
        resolvePaymentLabel(selectedPaymentMethod) ||
        "Unknown",
    };

    const updated = await secureFetch(`/orders/${targetId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!updated || updated.error) throw new Error(updated?.error || "Failed to update order status");

    // ✅ TableOverview timer start: when a table order transitions from "effectively free" (0 total)
    // to having a real total, start the timer at 00:00 even if TableOverview isn't mounted.
    try {
      const nextStatus = String(newStatus || updated.status || "").toLowerCase();
      const nextTotal = Number(total ?? updated.total ?? 0);
      const tableNumber = updated?.table_number;

      if (
        nextStatus === "confirmed" &&
        tableNumber != null &&
        Number.isFinite(nextTotal) &&
        nextTotal > 0 &&
        (!Number.isFinite(prevOrderTotal) || prevOrderTotal <= 0)
      ) {
        const restaurantId =
          (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
          "global";
        const key = `hurrypos:${restaurantId}:tableOverview.confirmedTimers.v1`;
        const raw = window?.localStorage?.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        const timers = parsed && typeof parsed === "object" ? parsed : {};
        timers[String(Number(tableNumber))] = Date.now();
        window?.localStorage?.setItem(key, JSON.stringify(timers));
      }
    } catch {
      // ignore localStorage errors
    }

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
              !item.paid && selectionKeys.has(getPaymentItemKey(item))
          )
          .map((item) => getPaymentItemKey(item))
          .filter(Boolean)
      : selectedForPayment.length > 0
      ? [...selectedForPayment]
      : cartItems
          .filter((item) => !item.paid && item.confirmed)
          .map((item) => getPaymentItemKey(item))
          .filter(Boolean);

  if (selectionKeys.size > 0 && paymentIds.length === 0) {
    showToast(t("Selected items are already paid"));
    return;
  }

  if (
    paymentIds.length === 0 &&
    cartItems.some((item) => !item.paid && item.confirmed)
  ) {
    paymentIds = cartItems
      .filter((item) => !item.paid && item.confirmed)
      .map((item) => getPaymentItemKey(item))
      .filter(Boolean);
  }

  if (paymentIds.length > 0) {
    setSelectedForPayment(paymentIds);
  }

  const total = cartItems
    .filter((i) => paymentIds.includes(getPaymentItemKey(i)))
    .reduce((sum, i) => sum + i.price * i.quantity, 0);

  // ✅ Allow phone orders to close even if empty
  if (cartItems.length === 0) {
    if (orderType === "phone") {
      if (!order?.id) {
        debugNavigate("/orders");
        return;
      }
      if (String(order?.status || "").toLowerCase() === "closed") {
        debugNavigate("/orders");
        return;
      }
      try {
        await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
        debugNavigate("/orders");
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.toLowerCase().includes("already closed")) {
          debugNavigate("/orders");
          return;
        }
        console.error("❌ Failed to close empty phone order:", err);
        showToast("Failed to close phone order");
        return;
      }
    } else {
      await resetTableGuests(order?.table_number ?? order?.tableNumber);
      navigate("/tableoverview?tab=tables");
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
  await fetchOrderItems(updated.id);
  setOrder((prev) => ({ ...prev, status: "confirmed" }));
  setHeader(prev => ({ ...prev, subtitle: "" }));
  scheduleNavigate("/orders", 400);
  return;
}

// 🥡 TAKEAWAY — confirm but STAY here (no navigate, no payment modal)
if (orderType === "takeaway" && getButtonLabel() === "Confirm") {
  await fetchOrderItems(order.id);
  setOrder((prev) => ({ ...prev, status: "confirmed" }));
  setHeader(prev => ({ ...prev, subtitle: "" }));
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

if (orderType === "phone" && order.status !== "closed") {
  // ✅ Allow phone orders to close after payment
  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    debugNavigate("/orders");
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
  const reservationSource = existingReservation ?? order;
  const schedule = getReservationSchedule(reservationSource);
  if (schedule && isEarlyReservationClose(reservationSource)) {
    const ok = await requestReservationCloseConfirmation(schedule);
    if (!ok) return;
  }

  // Re-check against the latest backend state so we don't block close due to stale kitchen_status/category
  // (and so excluded-from-kitchen items don't show a brief "Not delivered yet" toast).
  let itemsToCheck = cartItems;
  try {
    const latest = await secureFetch(`/orders/${order.id}/items${identifier}`);
    if (Array.isArray(latest)) {
      itemsToCheck = latest.map((row) => ({
        id: row.product_id,
        category: row.category || null,
        kitchen_status: row.kitchen_status || "",
      }));
    }
  } catch (err) {
    console.warn("⚠️ Failed to refresh order items before close:", err);
  }

  const allDelivered = allItemsDelivered(itemsToCheck);

  // ❌ Not all delivered → don’t close; show message and bounce to TableOverview after 3s
  if (!allDelivered) {
    showToast(t("Not delivered yet"));
    scheduleNavigate("/tableoverview?tab=tables", 2000);
    return;
  }

  // ✅ All delivered → close and go immediately
  try {
    await secureFetch(`/orders/${order.id}/close${identifier}`, { method: "POST" });
    await resetTableGuests(order?.table_number ?? order?.tableNumber);
    setDiscountValue(0);
    setDiscountType("percent");
    debugNavigate("/tableoverview?tab=tables"); // <— correct route
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
        category: item.category || null,
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
  // Close the modal immediately for a snappier feel
  setShowPaymentModal(false);

  const methodLabel = resolvePaymentLabel(method);
  const methodIsCash = isCashMethod(method);
  const receiptId = uuidv4();

  // Map of selected IDs to desired quantity (defaults to full qty)
  const selectionQty = new Map(
    Array.from(selectedCartItemIds).map((id) => {
      const key = String(id);
      const item = cartItems.find((i) => getPaymentItemKey(i) === key);
      const maxQty = Math.max(1, Number(item?.quantity) || 1);
      const desired = Number(payQuantities?.[key]) || maxQty;
      return [key, Math.min(Math.max(1, desired), maxQty)];
    })
  );

  const ids =
    payIds && payIds.length > 0
      ? payIds
      : cartItems
          .filter((i) => !i.paid && i.confirmed)
          .map((i) => getPaymentItemKey(i));
  const idsSet = new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => (id === null || id === undefined ? "" : String(id)))
      .map((value) => value.trim())
      .filter(Boolean)
  );
  let paidTotal = 0;
  let isFullyPaidAfter = false;

  if (order.status !== "paid") {
    const unpaidItems = cartItems.filter(
      (i) => idsSet.has(getPaymentItemKey(i)) && !i.paid
    );
    let total = unpaidItems
      .reduce((sum, i) => {
        const maxQty = Math.max(1, Number(i.quantity) || 1);
        const qty = selectionQty.get(getPaymentItemKey(i)) || maxQty;
        const perUnit = computeItemLineTotal(i) / maxQty;
        return sum + perUnit * qty;
      }, 0);

    if (discountValue > 0) {
      if (discountType === "percent") total -= total * (discountValue / 100);
      if (discountType === "fixed") total = Math.max(0, total - discountValue);
    }

    paidTotal = total;

    const enhancedItems = unpaidItems
      .map((i) => {
        const qty =
          selectionQty.get(getPaymentItemKey(i)) || Number(i.quantity) || 1;
        return {
          product_id: i.product_id || i.id,
          quantity: qty,
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
        };
      });

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

    // ⚡ INSTANT: Update UI immediately + dispatch refresh (don't wait for everything)
    setCartItems((prev) => {
      const next = [];
      (Array.isArray(prev) ? prev : []).forEach((item) => {
        const key = getPaymentItemKey(item);
        if (!idsSet.has(key) || item.paid) {
          next.push(item);
          return;
        }
        const originalQty = Math.max(1, Number(item.quantity) || 1);
        const payQty = selectionQty.get(key) || originalQty;
        const remainingQty = Math.max(0, originalQty - payQty);
        if (remainingQty > 0) {
          next.push({ ...item, quantity: remainingQty, paid: false, paid_at: null });
        }
        next.push({
          ...item,
          quantity: payQty,
          paid: true,
          paid_at: new Date().toISOString(),
        });
      });
      return next;
    });

    // ⚡ Fire table update IMMEDIATELY (don't block on receipt methods)
    dispatchOrdersLocalRefresh();
    if (window && typeof window.playPaidSound === "function") window.playPaidSound();

    // ⚡ Run all background tasks in parallel (fire and forget)
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
    
    // These run in background without blocking
    Promise.allSettled([
      secureFetch(`/orders/receipt-methods${identifier}`, {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          receipt_id: receiptId,
          methods: receiptMethodsPayload,
        }),
      }),
      refreshReceiptAfterPayment(),
      fetchOrderItems(order.id),
      fetchSubOrders(),
    ]).catch((err) => console.warn("⚠️ Background tasks failed:", err));
    dispatchOrdersLocalRefresh();

    const allItems2 = await secureFetch(`/orders/${order.id}/items${identifier}`);

    if (!Array.isArray(allItems2)) {
      console.error("❌ Unexpected items response:", allItems2);
      return;
    }

    const isFullyPaid2 = allItems2.every((item) => item.paid_at);
    isFullyPaidAfter = isFullyPaid2;

    if (isFullyPaid2) {
      await updateOrderStatus("paid", total, method);
      setOrder((prev) => ({ ...prev, status: "paid" }));
      await runAutoCloseIfConfigured(true, [method]);
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
  if (isFullyPaidAfter) {
    await runAutoCloseIfConfigured(true, [method]);
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
    debugNavigate("/orders");
    return;
  }

  if (orderType === "table") {
    if (!tableId) {
      debugNavigate("/tableoverview?tab=tables");
      return;
    }
    clearCartState();
    setLoading(true);
    createOrFetchTableOrder(tableId);
    return;
  }

  debugNavigate("/tableoverview?tab=tables");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [normalizedStatus, orderType, tableId, navigate, clearCartState]);


const selectedForPaymentTotal = cartItems
  .filter(i => selectedForPayment.includes(getPaymentItemKey(i)))
  .reduce((sum, i) => sum + i.price * i.quantity, 0);

const ensurePhoneOrder = useCallback(async () => {
  if (orderType !== "phone") return order;
  if (order?.id) return order;
  if (phoneOrderCreatePromiseRef.current) return phoneOrderCreatePromiseRef.current;

  const payload = {
    order_type: "phone",
    status: "draft",
    customer_name:
      order?.customer_name ??
      phoneOrderDraft?.customer_name ??
      phoneOrderDraft?.customerName ??
      "",
    customer_phone:
      order?.customer_phone ??
      phoneOrderDraft?.customer_phone ??
      phoneOrderDraft?.customerPhone ??
      "",
    customer_address:
      order?.customer_address ??
      phoneOrderDraft?.customer_address ??
      phoneOrderDraft?.customerAddress ??
      "",
    payment_method:
      order?.payment_method ??
      phoneOrderDraft?.payment_method ??
      phoneOrderDraft?.paymentMethod ??
      selectedPaymentMethod ??
      "",
    total: 0,
  };

  const promise = (async () => {
    const created = await secureFetch(`/orders${identifier}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!created?.id) throw new Error(created?.error || "Failed to create order");
    setOrder((prev) => (prev ? { ...prev, ...created } : created));
    return created;
  })();

  phoneOrderCreatePromiseRef.current = promise;
  promise.finally(() => {
    phoneOrderCreatePromiseRef.current = null;
  });
  return promise;
}, [
  orderType,
  order,
  phoneOrderDraft,
  selectedPaymentMethod,
  identifier,
  orderId,
  debugNavigate,
]);

const finalizeCartItem = useCallback(
  ({ product, quantity = 1, extras = [], note = "", editingIndex = null }) => {
    if (!order || !product) return;
    if (orderType === "phone" && !order?.id) {
      ensurePhoneOrder().catch((err) => {
        console.error("❌ Failed to create phone order:", err);
        showToast(err?.message || t("Failed to create phone order"));
      });
    }

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

    const pricing = computeDiscountedUnitPrice(product);
    const itemPrice = pricing.unitPrice;
    const extrasGroupRefs = deriveExtrasGroupRefs(product);
    const extrasKey = JSON.stringify(validExtras);
    const baseUniqueId = `${product.id}-NO_EXTRAS-${pricing.discountType}-${pricing.discountValue}-${pricing.promoStart || "_"}-${pricing.promoEnd || "_"}-${Math.round(pricing.unitPrice * 100)}-${Math.round(pricing.originalPrice * 100)}`;
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
          original_price: pricing.originalPrice,
          discount_type: pricing.discountType,
          discount_value: pricing.discountValue,
          promo_start: pricing.promoStart,
          promo_end: pricing.promoEnd,
          discount_applied: pricing.discountApplied,
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
            !item.paid &&
            Number(item.price) === Number(itemPrice) &&
            Number(item.original_price ?? item.originalPrice ?? item.price) ===
              Number(pricing.originalPrice)
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
            original_price: pricing.originalPrice,
            discount_type: pricing.discountType,
            discount_value: pricing.discountValue,
            promo_start: pricing.promoStart,
            promo_end: pricing.promoEnd,
            discount_applied: pricing.discountApplied,
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
        original_price: pricing.originalPrice,
        discount_type: pricing.discountType,
        discount_value: pricing.discountValue,
        promo_start: pricing.promoStart,
        promo_end: pricing.promoEnd,
        discount_applied: pricing.discountApplied,
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
  [order, orderType, ensurePhoneOrder, setCartItems, setEditingCartItemIndex, t]
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
const clearUnconfirmedCartItems = useCallback(() => {
  if (cartItems.length === 0) return;
  const hasUnconfirmed = cartItems.some((item) => !item.confirmed && !isPaidItem(item));
  if (!hasUnconfirmed) {
    return;
  }

  setCartItems((prev) =>
    prev.filter((item) => {
      return item.confirmed || isPaidItem(item);
    })
  );


  setSelectedCartItemIds(new Set());
  setSelectedForPayment([]);
}, [cartItems]);

const clearCartFromClearButton = useCallback(() => {
  if (cartItems.length === 0) return;

  const selectedKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));
  const hasClearableSelected = cartItems.some((item) => {
    const key = String(item.unique_id || item.id);
    return selectedKeys.has(key) && !item.confirmed && !isPaidItem(item);
  });

  if (hasClearableSelected) {
    clearSelectedCartItems();
    return;
  }

  clearUnconfirmedCartItems();
}, [cartItems, selectedCartItemIds, clearSelectedCartItems, clearUnconfirmedCartItems]);

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
  const { formatCurrency } = useCurrency();

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
          const amount = formatCurrency(parseFloat(m.amount));
          return `${icon} ${m.payment_method} ${amount}`;
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
      {items.map((item, index) => {
        const quantity = Number(item.quantity || 1);
        const basePrice = Number(item.price || 0);
        const baseTotal = basePrice * quantity;
        const perItemExtrasTotal = (item.extras || []).reduce((sum, ex) => {
          const unit = parseFloat(ex.price || ex.extraPrice || 0) || 0;
          const perItemQty = Number(ex.quantity || 1);
          return sum + unit * perItemQty;
        }, 0);
        const extrasTotal = perItemExtrasTotal * quantity;

        return (
          <li
            key={`${item.unique_id}-${index}`}
            className="p-3 bg-green-50 rounded-lg shadow-sm flex flex-col gap-1"
          >
            {/* --- Top Row: Name + Paid --- */}
            <div className="flex justify-between items-center flex-wrap">
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-base sm:text-lg break-words max-w-[65vw]">
                  {item.name}
                </span>
                <span className="text-xs sm:text-sm text-gray-600">
                  {formatCurrency(basePrice)} ×{quantity}
                </span>
              </div>
              <span className="font-bold text-gray-800 flex flex-col items-end text-base sm:text-lg">
                {formatCurrency(baseTotal)}
                <span className="text-xs text-red-600 font-extrabold mt-1">{t("paid")}</span>
              </span>
            </div>

            {/* --- Extras (if any) --- */}
            {item.extras?.length > 0 && (
              <div className="ml-2 mt-1 text-xs sm:text-sm text-gray-600 space-y-1">
                <ul className="list-disc list-inside">
                  {item.extras.map((ex, idx) => {
                    const exQtyPerItem = Number(ex.quantity || 1);
                    const totalQty = exQtyPerItem * quantity;
                    const unit =
                      parseFloat(ex.price || ex.extraPrice || 0) || 0;
                    const lineTotal = unit * totalQty;
                    return (
                      <li key={idx}>
                        {ex.name} ×{totalQty} – {formatCurrency(lineTotal)}
                      </li>
                    );
                  })}
                </ul>
                {extrasTotal > 0 && (
                  <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                    <span>{t("Extras total")}</span>
                    <span>{formatCurrency(extrasTotal)}</span>
                  </div>
                )}
              </div>
            )}

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
        );
      })}
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
    ? "flex h-full min-h-0 flex-col rounded-[28px] bg-transparent shadow-none ring-0 lg:sticky lg:top-4 lg:self-start lg:mb-[64px] lg:max-h-[calc(100vh-180px)] overflow-hidden"
    : "flex w-full max-h-[calc(100vh-96px)] flex-col rounded-t-[28px] bg-slate-50/95 shadow-[0_20px_35px_rgba(15,23,42,0.25)] ring-1 ring-white/60 backdrop-blur-xl overflow-hidden dark:bg-slate-950/80 dark:shadow-[0_20px_35px_rgba(0,0,0,0.55)] dark:ring-slate-800/70";
  const headerPadding = isDesktop ? "px-5 pt-5 pb-3" : "px-5 pt-4 pb-3";
  const footerPadding = isDesktop
    ? "px-5 py-5"
    : "px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]";

  const hasSelection = selectedCartItemIds.size > 0;
  const primaryActionLabel = getButtonLabel();
  const showPayLaterInClearSlot =
    !orderId &&
    cartItems.length > 0 &&
    !hasUnconfirmedCartItems &&
    ["confirmed", "unpaid", "paid"].includes(normalizedStatus);
  const payLaterLabel =
    showPayLaterInClearSlot && (normalizedStatus === "paid" || allPaidIncludingSuborders)
      ? t("Close Later")
      : t("Pay Later");
  const debtDisabled = !isDebtEligible || isDebtSaving;

  // Action buttons rendered in the full-page footer.

  return (
   <aside className={containerClasses}>
  {/* === Header === */}
  <header className={`flex-none items-start justify-between bg-transparent ${headerPadding}`}>
    <div className="flex min-w-0 flex-1 flex-col space-y-0.5">
      <div className="flex w-full flex-wrap items-center gap-2">
        <h2 className="hidden text-lg font-semibold text-slate-800 lg:block dark:text-slate-100">{t("Cart")}</h2>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-white/80 px-1.5 py-1 shadow-sm ring-1 ring-white/80 dark:bg-slate-900/60 dark:ring-slate-700/70">
            {!orderId && (
              <button
                type="button"
                onClick={() => setShowMoveTableModal(true)}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900/60 dark:text-emerald-200 dark:hover:bg-emerald-950/25"
                title={t("Move Table")}
                aria-label={t("Move Table")}
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("Move")}</span>
              </button>
            )}
            {!orderId && (
              <button
                type="button"
                onClick={() => setShowMergeTableModal(true)}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-50 dark:border-amber-500/30 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-950/25"
                title={t("Merge Table")}
                aria-label={t("Merge Table")}
              >
                <GitMerge className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t("Merge")}</span>
              </button>
            )}
              <button
                type="button"
                onClick={() => {
                  if (debtDisabled) return;
                  handleOpenDebtModal();
                }}
                disabled={debtDisabled}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/30"
              title={t("Add to Debt")}
              aria-label={t("Add to Debt")}
            >
              <HandCoins className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                {isDebtSaving ? t("Saving...") : t("Debt")}
              </span>
            </button>
          </div>
        </div>
      </div>
      <p className="text-[0.94rem] text-slate-500 dark:text-slate-300">
        {orderId ? t("Phone Order") : `${tableLabelText} ${tableId}`}
      </p>
      {invoiceNumber && (
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
            {t("Invoice")} #{invoiceNumber}
          </p>
          <button
            type="button"
            onClick={handleCartPrint}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-700 shadow hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            title={t("Print Receipt")}
            aria-label={t("Print Receipt")}
          >
            🖨️
          </button>
        </div>
      )}
    </div>

    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {hasSelection && (
        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/35 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-500/20">
          {selectedCartItemIds.size} {t("Selected")}
        </span>
      )}
      {!isDesktop && (
        <button
          type="button"
          onClick={() => setIsFloatingCartOpen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
          aria-label={t("Close")}
        >
          ✕
        </button>
      )}
    </div>
  </header>

  {/* === Reservation === */}
  {existingReservation && existingReservation.reservation_date && (
    <div className="mx-3 mb-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
              {t("Reserved")}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
              {existingReservation.reservation_date || "—"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-700 dark:text-slate-200">
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                {t("Time")}
              </div>
              <div className="truncate font-bold">
                {existingReservation.reservation_time || "—"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                {t("Guests")}
              </div>
              <div className="truncate font-bold">
                {existingReservation.reservation_clients || 0}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                {t("Date")}
              </div>
              <div className="truncate font-bold">
                {existingReservation.reservation_date || "—"}
              </div>
            </div>
          </div>
          {existingReservation.reservation_notes && (
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-slate-200">
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                {t("Notes")}
              </div>
              <div className="line-clamp-2 break-words">
                {existingReservation.reservation_notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )}

  {/* === Body === */}
  <div ref={cartScrollRef} className="min-h-0 flex-1 overflow-y-auto">
    <div
      className="min-h-full px-3 pb-2 grid grid-rows-[auto_1fr] gap-1.5 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div>
        {cartItems.length === 0 ? (
          <div className="h-full rounded-2xl border border-dashed border-slate-200 bg-transparent py-8 text-center text-xs font-medium text-slate-500 grid place-items-center dark:border-slate-700 dark:text-slate-400">
            <div>
              <div className="mx-auto mb-2 h-12 w-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-2xl leading-[48px] dark:from-slate-800 dark:to-slate-700">
                🛒
              </div>
              {t("Cart is empty.")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {unpaidCartItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs font-medium text-slate-400">
                {t("No unpaid items")}
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
              {/* === Group unpaid items by product name + extras + note === */}
              {Object.values(
                unpaidCartItems.reduce((acc, item) => {
    const extrasKey = JSON.stringify(safeParseExtras(item.extras) || []);
    const noteKey =
      typeof item.note === "string" ? item.note.trim() : JSON.stringify(item.note || "");
    const pricingKey = [
      Number(item.price) || 0,
      Number(item.original_price ?? item.originalPrice ?? 0) || 0,
      String(item.discount_type ?? item.discountType ?? ""),
      Number(item.discount_value ?? item.discountValue ?? 0) || 0,
      normalizeYmd(item.promo_start ?? item.promoStart ?? ""),
      normalizeYmd(item.promo_end ?? item.promoEnd ?? ""),
    ].join("|");

    // ➕ Add a status slice to the key so paid/confirmed/unconfirmed never merge together
    const statusSlice = item.paid
      ? `paid:${item.receipt_id || "yes"}`
      : (item.confirmed ? "confirmed" : "unconfirmed");

    // 🔑 Grouping key.
    // NOTE: confirmed items must not merge, otherwise you can't select/cancel just one of two identical items.
    const key = item.confirmed
      ? `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}__uid:${item.unique_id}`
      : `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}`;

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
            const originalUnitPrice = Number(
              item.original_price ?? item.originalPrice ?? 0
            );
            const discountType = String(item.discount_type ?? item.discountType ?? "none");
            const discountValue = Number(item.discount_value ?? item.discountValue ?? 0);
            const promoStart = normalizeYmd(item.promo_start ?? item.promoStart);
            const promoEnd = normalizeYmd(item.promo_end ?? item.promoEnd);
            const hasProductDiscountMeta =
              discountType !== "none" && Number.isFinite(discountValue) && discountValue > 0;
            const isDiscountApplied =
              Boolean(item.discount_applied) ||
              (Number.isFinite(originalUnitPrice) &&
                Math.abs(originalUnitPrice - basePrice) > 0.0001);
            const quantity = Number(item.quantity) || 1;
            const baseTotal = basePrice * quantity;
            const extrasTotal = perItemExtrasTotal * quantity;
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
            const openEditExtrasModal = async () => {
              if (!isEditable) return;
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
            };

            return (
            <li
  data-cart-item="true"
  key={itemKey}
  className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border border-slate-200 p-2 text-[13px] shadow-sm transition ${cardGradient}`}
  onClick={() => openEditExtrasModal()}
>
  <div className="flex items-center justify-between gap-1">
    <div className="flex items-center gap-1 flex-1">
            <div className="flex items-center gap-1">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={isSelected}
                disabled={!!item.paid}
                onChange={() => {
                  if (item.paid) return;
                  toggleCartItemSelection(selectionKey);
                  const maxQty = Math.max(1, Number(item.quantity) || 1);
                  if (!isSelected) {
                    updateSelectionQuantity(selectionKey, maxQty, maxQty);
                  } else {
                    removeSelectionQuantity(selectionKey);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              {isSelected && !item.paid && (Number(item.quantity) || 1) > 1 && (
                <select
                  className="h-7 rounded-md border border-slate-300 bg-white px-1 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  value={String(
                    Math.min(
                      Math.max(
                        1,
                        Number(
                          payQuantities?.[selectionKey] ??
                            cancelQuantities?.[selectionKey] ??
                            Number(item.quantity)
                        ) || 1
                      ),
                      Math.max(1, Number(item.quantity) || 1)
                    )
                  )}
                  onChange={(e) => {
                    const nextVal = Math.min(
                      Math.max(1, Number(e.target.value) || 1),
                      Math.max(1, Number(item.quantity) || 1)
                    );
                    updateSelectionQuantity(selectionKey, nextVal, Math.max(1, Number(item.quantity) || 1));
                  }}
                  onClick={(e) => e.stopPropagation()}
                  title={t("Select quantity to pay")}
                >
                  {Array.from({ length: Number(item.quantity) || 1 }, (_, idx) => idx + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    )
                  )}
                </select>
              )}
            </div>
      <div className="min-w-0 flex-1">
        <span
          className="truncate font-semibold text-slate-800 block"
          onClick={(e) => {
            e.stopPropagation();
            if (isEditable) {
              openEditExtrasModal();
              return;
            }
            toggleCartItemExpansion(itemKey);
          }}
        >
          {item.name}
          <span className="ml-2 text-[11px] font-medium text-slate-600">
            {formatCurrency(basePrice)} ×{quantity}
          </span>
        </span>
        {hasProductDiscountMeta && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${
                isDiscountApplied
                  ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {discountType === "percentage"
                ? `-${discountValue}%`
                : `-${formatCurrency(discountValue)}`}
            </span>
            {isDiscountApplied &&
              Number.isFinite(originalUnitPrice) &&
              Math.abs(originalUnitPrice - basePrice) > 0.0001 && (
                <span className="whitespace-nowrap">
                  <span className="line-through text-slate-400">
                    {formatCurrency(originalUnitPrice)}
                  </span>{" "}
                  <span className="font-semibold text-fuchsia-700">
                    {formatCurrency(basePrice)}
                  </span>
                </span>
              )}
          </div>
        )}
      </div>
    </div>
    <div className="flex items-center gap-1">
      {item.paid && (
        <span
          className="mr-1 inline-flex items-center rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-white shadow-sm"
          title={item.payment_method ? `${t("Paid")}: ${item.payment_method}` : t("Paid")}
        >
          ✓ {t("Paid")}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleCartItemExpansion(itemKey);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-500 hover:border-slate-300"
        title={isExpanded ? t("Hide details") : t("Show details")}
      >
        {isExpanded ? "▲" : "▼"}
      </button>
      <span className="font-semibold text-indigo-600 whitespace-nowrap">
        {formatCurrency(baseTotal)}
      </span>
    </div>
  </div>


  {!isExpanded && extrasTotal > 0 && (
    <div className="flex flex-col gap-1 pl-6 pr-1 text-xs text-slate-600">
      <div className="flex items-center justify-between">
        <span>{t("Extras total")}</span>
        <span className="font-semibold text-slate-700">{formatCurrency(extrasTotal)}</span>
      </div>
      <div className="h-px bg-slate-200" />
      <div className="flex items-center justify-between text-sm font-semibold text-indigo-900">
        <span>{t("Total with extras")}</span>
        <span>{formatCurrency(baseTotal + extrasTotal)}</span>
      </div>
    </div>
  )}

  {/* Expanded Details */}
  {isExpanded && (
    <div className="mt-1 rounded-lg bg-white/60 p-2 text-[12px] text-slate-600 space-y-2">
      {/* === Extras List === */}
          {normalizedExtras.length > 0 && (
            <div className="space-y-0.5">
              <ul className="space-y-0.5 text-xs text-slate-600">
                {normalizedExtras.map((ex, i2) => {
                  const extraQtyPerItem = Number(ex.quantity) || 1;
                  const unit =
                    parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                  const totalQty = extraQtyPerItem * quantity;
                  const lineTotal = unit * totalQty;
                  return (
                <li key={`${item.unique_id}-extra-${i2}`} className="flex justify-between">
                  <span>
                    + {totalQty}x {formatCurrency(unit)} {ex.name}
                  </span>
                  <span className="font-semibold text-slate-700">
                    {formatCurrency(lineTotal)}
                  </span>
                </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between pt-1 text-xs font-semibold text-slate-700">
                <span>{t("Extras total")}</span>
                <span>{formatCurrency(extrasTotal)}</span>
              </div>
            </div>
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
            onClick={(e) => {
              e.stopPropagation();
              decrementCartItem(item.unique_id);
            }}
            className="h-5 w-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!isEditable}
          >
            –
          </button>
          <span className="min-w-[18px] text-center">{quantity}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              incrementCartItem(item.unique_id);
            }}
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
              onClick={(e) => {
                e.stopPropagation();
                openEditExtrasModal();
              }}
              className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-100"
              title={t("Edit item")}
            >
              {t("Edit")}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.unique_id);
              }}
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

            {paidCartItems.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white/70">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700"
                onClick={() => setShowPaidCartItems((prev) => !prev)}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    {t("Paid")}
                  </span>
                  <span className="text-slate-500">
                    {paidCartItems.length} {t("items")}
                  </span>
                </span>
                <span className="text-slate-400">{showPaidCartItems ? "▲" : "▼"}</span>
              </button>
              {showPaidCartItems && (
                <ul className="flex flex-col gap-1.5 px-2 pb-2">
                  {/* === Group paid items by product name + extras + note === */}
                  {Object.values(
                    paidCartItems.reduce((acc, item) => {
                      const extrasKey = JSON.stringify(safeParseExtras(item.extras) || []);
                      const noteKey =
                        typeof item.note === "string"
                          ? item.note.trim()
                          : JSON.stringify(item.note || "");
                      const pricingKey = [
                        Number(item.price) || 0,
                        Number(item.original_price ?? item.originalPrice ?? 0) || 0,
                        String(item.discount_type ?? item.discountType ?? ""),
                        Number(item.discount_value ?? item.discountValue ?? 0) || 0,
                        normalizeYmd(item.promo_start ?? item.promoStart ?? ""),
                        normalizeYmd(item.promo_end ?? item.promoEnd ?? ""),
                      ].join("|");

                      const statusSlice = item.paid
                        ? `paid:${item.receipt_id || "yes"}`
                        : item.confirmed
                          ? "confirmed"
                          : "unconfirmed";

                      const key = item.confirmed
                        ? `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}__uid:${item.unique_id}`
                        : `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}`;

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
                    const originalUnitPrice = Number(item.original_price ?? item.originalPrice ?? 0);
                    const discountType = String(item.discount_type ?? item.discountType ?? "none");
                    const discountValue = Number(item.discount_value ?? item.discountValue ?? 0);
                    const hasProductDiscountMeta =
                      discountType !== "none" &&
                      Number.isFinite(discountValue) &&
                      discountValue > 0;
                    const isDiscountApplied =
                      Boolean(item.discount_applied) ||
                      (Number.isFinite(originalUnitPrice) &&
                        Math.abs(originalUnitPrice - basePrice) > 0.0001);
                    const quantity = Number(item.quantity) || 1;
                    const baseTotal = basePrice * quantity;
                    const extrasTotal = perItemExtrasTotal * quantity;
                    const showNote =
                      typeof item.note === "string" ? item.note.trim() !== "" : !!item.note;
                    const paidMethod = resolveItemPaymentMethod(order, item);

                    const cardGradient =
                      "bg-gradient-to-br from-green-200 via-green-100 to-green-50 border-green-300";

                    const itemKey = item.unique_id || `${item.id}-${idx}`;
                    const isExpanded = expandedCartItems.has(itemKey);

                    return (
                      <li
                        data-cart-item="true"
                        key={`paid-${itemKey}`}
                        className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border border-slate-200 p-2 text-[13px] shadow-sm transition ${cardGradient}`}
                        onClick={() => toggleCartItemExpansion(itemKey)}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <span className="truncate font-semibold text-slate-800 block">
                              {item.name}
                              <span className="ml-2 text-[11px] font-medium text-slate-600">
                                {formatCurrency(basePrice)} ×{quantity}
                              </span>
                            </span>
                            {hasProductDiscountMeta && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                                <span
                                  className={`rounded-full border px-2 py-0.5 font-semibold ${
                                    isDiscountApplied
                                      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
                                      : "border-slate-200 bg-slate-50 text-slate-500"
                                  }`}
                                >
                                  {discountType === "percentage"
                                    ? `-${discountValue}%`
                                    : `-${formatCurrency(discountValue)}`}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            {t("paid")}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-col gap-1 text-xs text-slate-600">
                          {!!paidMethod && (
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{t("Paid via")}:</span>
                              <span className="font-semibold text-indigo-700">
                                {paidMethod}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-[12px] text-slate-500">
                            <span>{t("Amount paid")}</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(baseTotal + extrasTotal)}
                            </span>
                          </div>
                          {extrasTotal > 0 && (
                            <div className="flex items-center justify-between text-[12px] text-slate-500">
                              <span>{t("Extras paid")}</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(extrasTotal)}
                              </span>
                            </div>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-slate-700">
                            {showNote && (
                              <div className="break-words">
                                <span className="font-semibold">{t("Note")}:</span>{" "}
                                {typeof item.note === "string" ? item.note : ""}
                              </div>
                            )}
                            {normalizedExtras.length > 0 && (
                              <div className="mt-1">
                                <span className="font-semibold">{t("Extras")}:</span>{" "}
                                {normalizedExtras.map((ex) => ex.name || ex.label).filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            )}
          </div>
        )}
      </div>
      <div aria-hidden className="min-h-0" />
    </div>
  </div>

  {/* === Footer === */}
  {variant === "desktop" ? (
    <footer className={`flex-none sticky bottom-0 z-10 space-y-2 border-t border-slate-200 bg-slate-50 ${footerPadding} dark:border-slate-800 dark:bg-slate-950/70`}>
      <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
        <span>{t("Subtotal")}:</span>
        <span className="text-slate-900 dark:text-slate-100">
          {formatCurrency(calculateDiscountedTotal())}
        </span>
      </div>

      {discountValue > 0 && (
        <div className="flex justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-300">
          <span>
            {t("Discount")}{" "}
            {discountType === "percent"
              ? `(${discountValue}%)`
              : `(-${formatCurrency(discountValue)})`}
          </span>
          <span>-{formatCurrency(discountValue)}</span>
        </div>
      )}

   <div
  className={`flex justify-between items-center rounded-2xl bg-white/90 px-3 py-3 text-lg font-bold shadow-[0_10px_20px_rgba(99,102,241,0.18)] mb-[3px] dark:bg-slate-900/60 dark:shadow-[0_10px_20px_rgba(0,0,0,0.45)]
  ${selectedCartItemIds.size > 0 ? "text-emerald-700 border border-emerald-200 bg-emerald-50/80 dark:text-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-950/25" : "text-indigo-700 border border-indigo-100 dark:text-indigo-200 dark:border-indigo-500/25"}`}
>
  <span>
    {selectedCartItemIds.size > 0
      ? t("Selected Total")
      : t("Total")}
    :
  </span>
  <span>
    {selectedCartItemIds.size > 0
      ? formatCurrency(selectedItemsTotal)
      : formatCurrency(calculateDiscountedTotal())}
  </span>
</div>

    </footer>
  ) : (
    <div className="lg:hidden px-4 pb-3 pt-2">
      <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-inner dark:border-slate-700/70 dark:bg-slate-950/60">
        <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
          <span>{t("Subtotal")}:</span>
          <span className="text-slate-900 dark:text-slate-100">
            {formatCurrency(calculateDiscountedTotal())}
          </span>
        </div>
        {discountValue > 0 && (
          <div className="flex justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-300">
            <span>
              {t("Discount")}{" "}
              {discountType === "percent"
                ? `(${discountValue}%)`
                : `(-${formatCurrency(discountValue)})`}
            </span>
            <span>-{formatCurrency(discountValue)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-bold text-indigo-700 mt-2 dark:text-indigo-200">
          <span>{selectedCartItemIds.size > 0 ? t("Selected Total") : t("Total")}:</span>
          <span>
            {selectedCartItemIds.size > 0
              ? formatCurrency(selectedItemsTotal)
              : formatCurrency(calculateDiscountedTotal())}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (!showPayLaterInClearSlot) {
              clearCartFromClearButton();
              return;
            }
            setIsFloatingCartOpen(false);
            navigate("/tableoverview?tab=tables");
          }}
          className="flex-1 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80"
        >
          {showPayLaterInClearSlot ? payLaterLabel : t("Clear")}
        </button>
        <button
          type="button"
          onClick={handleMultifunction}
          disabled={isPhoneOrder && primaryActionLabel === "Pay"}
          title={
            isPhoneOrder && primaryActionLabel === "Pay"
              ? t("Payments are handled through the Orders screen")
              : undefined
          }
          className="flex-1 rounded-full bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(99,102,241,0.35)]"
        >
          {t(primaryActionLabel)}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            openReservationModal();
          }}
          disabled={cartItems.length > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)}
          className={`flex-1 min-w-[120px] rounded-full px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_20px_rgba(99,102,241,0.3)] transition ${
            cartItems.length > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)
              ? "bg-indigo-300 cursor-not-allowed"
              : "bg-gradient-to-br from-indigo-400 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-600"
          }`}
        >
          {t("Reservation")}
        </button>
        <button
          type="button"
          onClick={openCancelModal}
          disabled={cartItems.length === 0 || normalizedStatus !== "confirmed" || cartItems.some((item) => item.confirmed && !isPaidItem(item))}
          className="flex-1 min-w-[120px] rounded-full border border-rose-200 bg-rose-50/80 px-4 py-2 text-center text-xs font-semibold text-rose-600 shadow-[0_8px_18px_rgba(244,63,94,0.12)] transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/25 dark:text-rose-200 dark:hover:bg-rose-950/35"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          onClick={() => setShowDiscountModal(true)}
          className="flex-1 min-w-[120px] rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_22px_rgba(245,158,11,0.35)] hover:from-amber-500 hover:to-orange-600"
        >
          {t("Discount")}
        </button>
        <button
          type="button"
          onClick={handleOpenCashRegister}
          className="flex-1 min-w-[120px] rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_22px_rgba(16,185,129,0.35)] hover:from-emerald-600 hover:to-teal-700"
        >
          {t("Register")}
        </button>
      </div>
    </div>
  )}
</aside>

  );
};
  const footerPrimaryActionLabel = getButtonLabel();
  const showPayLaterInFooter =
    !orderId &&
    cartItems.length > 0 &&
    !hasUnconfirmedCartItems &&
    ["confirmed", "unpaid", "paid"].includes(normalizedStatus);
  const footerPayLaterLabel =
    showPayLaterInFooter && (normalizedStatus === "paid" || allPaidIncludingSuborders)
      ? t("Close Later")
      : t("Pay Later");
  const footerCancelDisabled =
    normalizedStatus !== "confirmed" || hasUnconfirmedCartItems || cartItems.length === 0;
  const footerCanShowCancel = orderType === "table";
  const shouldBlockUi = deferHeavyUi || (loading && !tableId);
  if (shouldBlockUi) {
    return (
      <div className="relative h-full min-h-0 w-full bg-slate-50 dark:bg-slate-900 overflow-x-hidden">
        <div className="flex h-full min-h-0 w-full flex-col gap-2 px-2 sm:px-3 lg:px-4 overflow-x-hidden">
          <div className="mt-3 rounded-2xl bg-white dark:bg-zinc-900 p-6 text-center font-semibold text-slate-700 dark:text-slate-100 shadow-lg ring-1 ring-slate-200 dark:ring-zinc-800">
            {t("Loading...")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[calc(100vh-80px)] w-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/30" />
      <div className="flex h-full min-h-0 w-full flex-col gap-0 px-2 sm:px-3 lg:px-4 overflow-hidden">
  <section className="flex flex-1 min-h-0 flex-row gap-3 pb-2 overflow-hidden bg-slate-50 dark:bg-slate-950">

    {/* === LEFT: CART PANEL (desktop only) === */}
    <div className="hidden lg:block w-[30%] min-w-[320px] max-w-[380px] h-full overflow-hidden">
      <div className="sticky top-0 h-full">{renderCartContent("desktop")}</div>
    </div>

    {/* Separator between cart and products (desktop only) */}
    <div
      className="hidden lg:block h-full w-px self-stretch rounded-full bg-gradient-to-b from-transparent via-slate-200 to-transparent shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
      aria-hidden="true"
    />

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50/60 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/30 dark:shadow-[0_18px_40px_rgba(0,0,0,0.5)] dark:ring-slate-800/70">
      {/* Header */}
      <div className="border-b border-slate-200/70 bg-white/50 px-4 py-3 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1 w-[calc(100%-1cm)] max-w-none sm:flex-none sm:w-full sm:max-w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={t("Search products or categories")}
                className="w-full rounded-full border border-white/70 bg-white/90 px-9 py-2 text-sm text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] outline-none transition placeholder:text-slate-400 focus:border-indigo-200 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_10px_24px_rgba(0,0,0,0.35)] dark:focus:border-indigo-500/60 dark:focus:ring-indigo-500/20"
              />
              {catalogSearch.trim() && (
                <button
                  type="button"
                  onClick={() => setCatalogSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  aria-label={t("Clear search")}
                >
                  ✕
                </button>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-indigo-50/90 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm dark:bg-indigo-950/35 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-500/20">
              {visibleProducts.length} {t("Products")}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 min-w-[140px]">
            <button
              type="button"
              onClick={() => {
                setIsReorderingCategories((prev) => !prev);
                setDraggingCategoryKey("");
                draggedCategoryKeyRef.current = "";
              }}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                isReorderingCategories
                  ? "bg-indigo-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]"
                  : "bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-700/70 dark:hover:bg-slate-900/80"
              }`}
              aria-pressed={isReorderingCategories}
            >
              {isReorderingCategories ? t("Done") : t("Reorder")}
            </button>
            <h2 className="text-lg font-semibold text-slate-800 text-right dark:text-slate-100">
              {activeCategory ? t(activeCategory) : t("Products")}
            </h2>
          </div>
        </div>
        {isCatalogSearching && matchingCategories.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {matchingCategories.map((entry) => (
              <button
                key={`catmatch-${entry.idx}`}
                type="button"
                onClick={() => {
                  setCurrentCategoryIndex(entry.idx);
                  setCatalogSearch("");
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {t(entry.cat)}
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        [data-category-scroll]::-webkit-scrollbar {
          display: none;
        }
      `}</style>

        <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* === TOP ROW (LEFT TO RIGHT) === */}
        {categoryColumns.top.length > 0 && (
          <div className="relative mx-3 mt-2 mb-2 flex flex-none rounded-2xl border border-indigo-300 bg-gradient-to-br from-indigo-100 via-sky-100 to-white p-2 shadow-[0_6px_14px_rgba(15,23,42,0.06)] ring-1 ring-indigo-200 dark:border-indigo-500/40 dark:from-indigo-950/55 dark:via-slate-900/55 dark:to-slate-950/55 dark:shadow-none dark:ring-indigo-500/20">
            <div 
              ref={topRowRef}
              data-category-scroll
              className="flex flex-row items-center gap-2 justify-start overflow-x-auto px-2 py-1.5 scroll-smooth"
              style={{ scrollBehavior: 'smooth', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {categoryColumns.top.map((entry) => (
                <div key={`top-${entry.cat}-${entry.index}`}>
                  {renderCategoryButton(entry.cat, entry.index, "horizontal")}
                </div>
              ))}
            </div>
            {topRowScroll.canScrollLeft && (
              <button
                onClick={() => {
                  if (topRowRef.current) {
                    topRowRef.current.scrollBy({ left: -60, behavior: 'smooth' });
                  }
                }}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full bg-indigo-500 text-white shadow-lg flex items-center justify-center hover:bg-indigo-600 transition"
                aria-label="Scroll left"
              >
                ‹
              </button>
            )}
            {topRowScroll.canScrollRight && (
              <button
                onClick={() => {
                  if (topRowRef.current) {
                    topRowRef.current.scrollBy({ left: 60, behavior: 'smooth' });
                  }
                }}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-6 w-6 rounded-full bg-indigo-500 text-white shadow-lg flex items-center justify-center hover:bg-indigo-600 transition"
                aria-label="Scroll right"
              >
                ›
              </button>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* === CENTER: PRODUCTS GRID === */}
          <article className="flex min-w-0 flex-1 min-h-0 flex-col bg-transparent px-0 py-3 overflow-hidden">
          <div className="h-[calc(100vh-260px)] overflow-y-scroll px-3 sm:px-4 pb-[calc(170px+env(safe-area-inset-bottom))] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
              <div className="flex items-start justify-center">
                <div className="grid w-[97%] grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="
                      flex w-full min-h-[150px] flex-col overflow-hidden rounded-[22px] border border-white/70 bg-white/80 text-center shadow-[0_14px_28px_rgba(15,23,42,0.1)]
                      hover:border-indigo-200 hover:shadow-[0_18px_34px_rgba(99,102,241,0.18)] active:bg-indigo-50
                      dark:border-slate-700/70 dark:bg-slate-900/55 dark:shadow-[0_14px_28px_rgba(0,0,0,0.45)]
                      dark:hover:border-indigo-500/40 dark:hover:shadow-[0_18px_34px_rgba(0,0,0,0.55)] dark:active:bg-indigo-950/35
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60
                    "
                  >
                    <div className="relative w-full overflow-hidden border-b border-white/70 bg-white/80 p-1.5 dark:border-slate-800/70 dark:bg-slate-900/50">
                      <div className="aspect-[4/3]">
                        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full flex-col items-center justify-center gap-0.5 bg-white/80 px-2 py-2 dark:bg-slate-900/40">
                      <p className="w-full text-[14px] font-semibold text-slate-700 leading-[1.1] line-clamp-1 dark:text-slate-100">
                        {product.name}
                      </p>
                      <span className="text-[13px] font-semibold text-indigo-600 leading-none dark:text-indigo-300">
                        {formatCurrency(parseFloat(product.price))}
                      </span>
                    </div>
                  </button>
                ))}
                </div>
              </div>
            </div>
          </article>

          {/* Right category column removed */}
        </div>
      </div>
    </div>
  </section>

      <div className="hidden lg:block fixed bottom-0 left-0 right-0 z-30 w-full border-t border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap gap-2">
          <button
            type="button"
            onClick={handleMultifunction}
            disabled={isPhoneOrder && footerPrimaryActionLabel === "Pay"}
            title={
              isPhoneOrder && footerPrimaryActionLabel === "Pay"
                ? t("Payments are handled through the Orders screen")
                : undefined
            }
            className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-5 py-3 text-lg font-semibold text-white shadow-[0_10px_24px_rgba(99,102,241,0.35)] transition hover:from-indigo-500 hover:via-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            {t(footerPrimaryActionLabel)}
          </button>

          {footerCanShowCancel && (
            <button
              type="button"
              onClick={() => openReservationModal()}
              disabled={cartItems.length > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)}
              className={`flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(99,102,241,0.3)] transition ${
                cartItems.length > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)
                  ? "bg-indigo-300 cursor-not-allowed"
                  : "bg-gradient-to-br from-indigo-400 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-600"
              }`}
            >
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              {t("Reservation")}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!showPayLaterInFooter) {
                clearCartFromClearButton();
                return;
              }
              setIsFloatingCartOpen(false);
              navigate("/tableoverview?tab=tables");
            }}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-5 py-3 text-lg font-semibold text-slate-800 shadow-[0_8px_18px_rgba(15,23,42,0.10)] backdrop-blur hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/55 dark:text-slate-100 dark:shadow-[0_8px_18px_rgba(0,0,0,0.45)] dark:hover:bg-slate-900/75"
          >
            <Trash2 className="h-5 w-5" aria-hidden="true" />
            {showPayLaterInFooter ? footerPayLaterLabel : t("Clear")}
          </button>

          {footerCanShowCancel && (
            <button
              type="button"
              onClick={openCancelModal}
              disabled={footerCancelDisabled}
              className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-5 py-3 text-lg font-semibold text-rose-600 shadow-[0_8px_18px_rgba(244,63,94,0.12)] transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/25 dark:text-rose-200 dark:hover:bg-rose-950/35"
            >
              <CircleX className="h-5 w-5" aria-hidden="true" />
              {t("Cancel")}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDiscountModal(true)}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-5 py-3 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(245,158,11,0.35)] hover:from-amber-500 hover:to-orange-600"
          >
            <BadgePercent className="h-5 w-5" aria-hidden="true" />
            {t("Discount")}
          </button>

          <button
            type="button"
            onClick={handleOpenCashRegister}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-5 py-3 text-lg font-semibold text-white shadow-[0_10px_22px_rgba(16,185,129,0.35)] hover:from-emerald-600 hover:to-teal-700"
          >
            <Wallet className="h-5 w-5" aria-hidden="true" />
            {t("Register")}
          </button>
        </div>
      </div>

    </div>

      <div
        className={`lg:hidden fixed left-4 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 transition-transform duration-300 ${isFloatingCartOpen ? "translate-y-[140%]" : "translate-y-0"}`}
      >
        <button
          type="button"
          onClick={() => setIsFloatingCartOpen(true)}
          className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-700/25 ring-2 ring-white/50 backdrop-blur-sm active:scale-[0.97] transition dark:ring-slate-900/30"
          aria-label={t("View Cart")}
        >
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-100">
              {t("Cart")}
            </span>
            <span className="text-[13px] font-bold">
              {formatCurrency(calculateDiscountedTotal())}
            </span>
            <span className="text-[12px] font-semibold text-indigo-100/90">
              {cartItems.filter((i) => !i.paid).length} {t("Items")}
            </span>
          </div>
        </button>
      </div>

      {/* category chain rendered on right then left */}

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

    {confirmReservationCloseToast.show && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-2">
            {t("Close")}
          </p>
          <p className="text-lg font-extrabold text-rose-600">
            {t("Reservation time has not yet arrived.")}
          </p>
          <p className="text-sm text-slate-700 mt-2">
            {t(
              "This table is reserved for {{date}} {{time}}. The reservation time has not yet arrived. Close the table anyway?",
              {
                date: confirmReservationCloseToast.schedule?.date || "—",
                time: confirmReservationCloseToast.schedule?.time || "—",
              }
            )}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => resolveReservationCloseConfirmation(false)}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={() => resolveReservationCloseConfirmation(true)}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
            >
              {t("Close anyway")}
            </button>
          </div>
        </div>
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
  cancelQuantities={cancelQuantities}
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
              return `${tableLabelText} ${tableNumber || order?.id || ""}`.trim();
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
              const itemQty = Math.max(1, Number(item.quantity) || 1);
              const key = String(item.unique_id || item.id);
              const requested = Number(cancelQuantities[key]) || 1;
              const cancelQty = Math.min(Math.max(1, requested), itemQty);
              const perUnit = computeItemLineTotal(item) / itemQty;
              const totalPrice = perUnit * cancelQty;
              return (
                <li
                  key={item.unique_id || `${item.id}-${item.name}`}
                  className="flex items-center justify-between font-semibold text-amber-700"
                >
                  <span className="truncate flex-1">{item.name}</span>
                  {itemQty > 1 && (
                    <select
                      className="ml-2 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-bold text-amber-700"
                      value={cancelQuantities[key] || 1}
                      onChange={(e) => {
                        const next = Number(e.target.value) || 1;
                        setCancelQuantities((prev) => ({ ...prev, [key]: next }));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t("Qty")}
                    >
                      {Array.from({ length: itemQty }, (_, idx) => idx + 1).map(
                        (qty) => (
                          <option key={qty} value={qty}>
                            {t("Qty")} {qty}
                          </option>
                        )
                      )}
                    </select>
                  )}
                  <span className="text-amber-600">
                    ×{cancelQty} — {formatCurrency(totalPrice)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-amber-500">
            {t("Only the highlighted items will be removed from the order.")}
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
            {t("Refund amount")}: {formatCurrency(refundAmount)}
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

{showReservationModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
    <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-zinc-900 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
            {t("Make Reservation")}
          </p>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("Reservation Details")}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowReservationModal(false)}
          className="text-slate-400 hover:text-slate-600 dark:text-slate-300"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Date Field */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("Date")}
          </label>
          <input
            type="date"
            value={reservationDate}
            onChange={(e) => setReservationDate(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
          />
        </div>

        {/* Time Field */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("Time")}
          </label>
          <input
            type="time"
            value={reservationTime}
            onChange={(e) => setReservationTime(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
          />
        </div>

        {/* Number of Clients Field */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("Number of Clients")}
          </label>
          <input
            type="number"
            placeholder="e.g., 2"
            value={reservationClients}
            onChange={(e) => setReservationClients(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
          />
        </div>

        {/* Notes Field */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            {t("Notes")}
          </label>
          <textarea
            rows={4}
            placeholder={t("Special requests or notes...")}
            value={reservationNotes}
            onChange={(e) => setReservationNotes(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {existingReservation?.reservation_date && (
          <button
            type="button"
            onClick={handleDeleteReservation}
            disabled={reservationLoading}
            className={`mr-auto rounded-2xl border px-5 py-2 text-sm font-semibold transition ${
              reservationLoading
                ? "cursor-not-allowed border-rose-200 bg-rose-100 text-rose-400 dark:border-rose-900 dark:bg-rose-900/30 dark:text-rose-300/60"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-200"
            }`}
          >
            {t("Delete Reservation")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowReservationModal(false)}
          className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-zinc-700 dark:text-slate-200"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          onClick={handleSaveReservation}
          disabled={!reservationDate.trim() || !reservationTime.trim() || !reservationClients.trim() || reservationLoading}
          className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
            !reservationDate.trim() || !reservationTime.trim() || !reservationClients.trim() || reservationLoading
              ? "cursor-not-allowed bg-blue-300 dark:bg-blue-400/70"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {reservationLoading ? t("Saving...") : (existingReservation ? t("Update Reservation") : t("Confirm Reservation"))}
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
  presetNotes={presetNotes}

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
