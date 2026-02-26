import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  useDeferredValue,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  CircleX,
  Edit2,
  GitMerge,
  HandCoins,
  Mic,
  Loader2,
  Trash2,
  Wallet,
} from "lucide-react";
import { useHeader } from "../context/HeaderContext";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import { toCategorySlug } from "../utils/slugCategory"; 
import { useAuth } from "../context/AuthContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { getPaymentMethodLabel } from "../utils/paymentMethods";
import { getPaymentItemKey } from "../utils/getPaymentItemKey";
import { useCurrency } from "../context/CurrencyContext";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import { getReservationSchedule, isEarlyReservationClose } from "../utils/reservationSchedule";
import { loadRegisterSummary, clearRegisterSummaryCache } from "../utils/registerSummaryCache";
import { clearRegisterDataCache } from "../utils/registerDataCache";
import {
  upsertTableOverviewOrderInCache,
  removeTableOverviewOrderFromCache,
} from "../utils/tableOverviewOrdersCache";
import CartPanelContainer from "../features/transaction/components/CartPanelContainer";
import TransactionHeader from "../features/transaction/components/TransactionHeader";
import ProductGridSection from "../features/transaction/components/ProductGridSection";
import FooterActionsBar from "../features/transaction/components/FooterActionsBar";
import Modals from "../features/transaction/components/Modals";
import CategoryButton from "../features/transaction/components/CategoryButton";
import { writeCachedProducts } from "../features/transactions/utils/cache";
import {
  normalizeExtrasGroupSelection,
  normalizeGroupKey,
} from "../features/transactions/utils/normalization";
import { useTransactionScreenController } from "../features/transactions/hooks/useTransactionScreenController";
import { useToastController } from "../features/transactions/hooks/useToastController";
import { txApiGetAuthToken, txApiRequest } from "../features/transactions/services/transactionApi";
import {
  txFetchOrderWithItems,
  txGetReceiptLayout,
  txPrintViaBridge,
  txRenderReceiptText,
} from "../features/transactions/services/transactionPrinting";
import {
  txIsCashLabel,
  txLogCashRegisterEvent,
  txOpenCashDrawer,
} from "../features/transactions/services/transactionCash";
import {
  hasGlobalSocket,
  txGlobalSocketOff,
  txGlobalSocketOn,
  txSocketOff,
  txSocketOn,
} from "../features/transactions/services/transactionSocket";
import { useSplitPayment } from "../features/transaction/hooks/useSplitPayment";
import { useReservation } from "../features/transaction/hooks/useReservation";
import { useCancelRefund } from "../features/transaction/hooks/useCancelRefund";
import {
  CATEGORY_FALLBACK_IMAGE,
  deriveExtrasGroupRefs,
  normalizeSuborderItems,
  isCancelledStatus,
  resolveItemPaymentMethod,
  isPaidItem,
  toLocalYmd,
  isPromoActiveToday,
  computeDiscountedUnitPrice,
} from "../features/transaction/utils/transactionUtils";
import { splitDrinkExtras } from "../features/transaction/utils/drinkExtras";
import { useTransactionHeader } from "../features/transaction/hooks/useTransactionHeader";
import { useOrderLoader } from "../features/transaction/hooks/useOrderLoader";
import {
  formatOrderItems,
  mergeWithUnconfirmedItems,
} from "../features/transaction/utils/orderFormatting";
import {
  createOrderStatusFlow,
  createConfirmFlow,
  createPaymentFlow,
  createCloseFlow,
  createDebtFlow,
  createPrintFlow,
  createReceiptFlow,
} from "../features/transactions/actions";

// REGION: MAP
// REGION: State -> hook state and refs
// REGION: Derived -> memoized/computed values
// REGION: Effects -> lifecycle and subscriptions
// REGION: Handlers -> user/network/socket actions
// REGION: Render -> JSX output

const __DEV_TXN__ = import.meta.env.DEV && false;
const txnDebugLog = (...args) => {
  if (!__DEV_TXN__) return;
  console.log("[TXN_DEBUG]", ...args);
};
const txnDevInvariant = (condition, message, details) => {
  if (!import.meta.env.DEV || condition) return true;
  if (details !== undefined) {
    console.error("[TXN_INVARIANT]", message, details);
  } else {
    console.error("[TXN_INVARIANT]", message);
  }
  return false;
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

export default function TransactionScreen() {
  useRegisterGuard();
  const paymentMethods = usePaymentMethods();
  const { formatCurrency } = useCurrency();
  const { tableId, orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation(); // ✅ Enable translations
  const { currentUser } = useAuth();
  const [subOrders, setSubOrders] = useState([]);
  const suborderItems = useMemo(() => {
    if (!Array.isArray(subOrders)) return [];
    return subOrders.flatMap((sub) => normalizeSuborderItems(sub?.items));
  }, [subOrders]);
  const takeawayOrderFetcherRef = useRef(() => {});
  const fetchTakeawayOrderViaRef = useCallback((...args) => {
    const fn = takeawayOrderFetcherRef.current;
    if (typeof fn === "function") {
      return fn(...args);
    }
    return undefined;
  }, []);
  const tx = useTransactionScreenController({
    navigate,
    location,
    tableId,
    orderId,
    currentUser,
    t,
    i18n,
    formatCurrency,
    txnDebugLog,
    txnDevInvariant,
    suborderItems,
    fetchTakeawayOrder: fetchTakeawayOrderViaRef,
    hasGlobalSocket,
    txGlobalSocketOn,
    txGlobalSocketOff,
    paymentMethods,
  });

  const { debugNavigate, scheduleNavigate } = tx.nav;
  const {
    order,
    setOrder,
    loading,
    setLoading,
    error: dataError,
    setError: setDataError,
    products,
    setProducts,
    categories,
    rawCategories,
    categoryOrderKeys,
    setCategoryOrderKeys,
    initialOrder,
    phoneOrderDraft,
    restaurantSlug,
    identifier,
    getInitialProducts,
  } = tx.data;
  const {
    cartItems,
    setCartItems,
    receiptItems,
    setReceiptItems,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountedTotal,
    addCartItem,
    removeCartItem,
    setCartItemQty,
    selectedCartItemIds,
    setSelectedCartItemIds,
    expandedCartItems,
    setExpandedCartItems,
    selectionQuantities,
    setSelectionQuantities,
    cartSelection,
    showPaidCartItems,
    setShowPaidCartItems,
    toggleCartItemSelection,
    toggleCartItemExpansion,
    updateSelectionQuantity,
    removeSelectionQuantity,
    clearSelectedCartItems,
    cartScrollRef,
    lastVisibleCartItemRef,
    scrollCartToBottom,
    hasUnconfirmedCartItems,
    hasConfirmedCartUnpaid,
    allCartItemsPaid,
  } = tx.cart;
  const {
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    editingCartItemIndex,
    setEditingCartItemIndex,
    isSplitMode,
    setIsSplitMode,
    activeSplitMethod,
    setActiveSplitMethod,
    selectedProduct,
    setSelectedProduct,
    selectedExtras,
    setSelectedExtras,
    extrasGroups,
    setExtrasGroups,
    extrasGroupsPromiseRef,
    note,
    setNote,
    isDebtSaving,
    setIsDebtSaving,
    debtForm,
    setDebtForm,
    debtError,
    setDebtError,
    debtSearch,
    setDebtSearch,
    debtSearchResults,
    setDebtSearchResults,
    debtSearchLoading,
    setDebtSearchLoading,
    debtLookupLoading,
    setDebtLookupLoading,
  } = tx.editors;
  const {
    showDiscountModal,
    setShowDiscountModal,
    showMergeTableModal,
    setShowMergeTableModal,
    showExtrasModal,
    setShowExtrasModal,
    showPaymentModal,
    setShowPaymentModal,
    showCancelModal,
    setShowCancelModal,
    showDebtModal,
    setShowDebtModal,
    showMoveTableModal,
    setShowMoveTableModal,
    confirmReservationCloseToast,
    requestReservationCloseConfirmation,
    resolveReservationCloseConfirmation,
  } = tx.modals;
  const {
    orderType,
    normalizedStatus,
    isDebtEligible,
    hasSuborderUnpaid,
    allPaidIncludingSuborders,
    hasUnpaidConfirmed,
  } = tx.domain;
  const {
    isPhoneOrder,
    getPrimaryActionLabel,
    showCloseLaterInFooter,
    showPayLaterInFooter,
    footerSecondaryLabel,
    footerClearDisabledAfterConfirmOrPaid,
    payDisabled,
    footerCancelDisabled,
    footerCanShowCancel,
  } = tx.footer;
  const {
    currentCategoryIndex,
    setCurrentCategoryIndex,
    swipeHandlers,
    activeCategory,
    deferHeavyUi,
    setDeferHeavyUi,
  } = tx.ui;
  const {
    topRowRef,
    topRowScroll,
    isReorderingCategories,
    setIsReorderingCategories,
    draggingCategoryKey,
    setDraggingCategoryKey,
    draggedCategoryKeyRef,
    reorderCategoryByKeyToIndex,
    handleCategoryScrollUp,
    handleCategoryScrollDown,
  } = tx.layout;
  const { categoryImages } = tx.images;
  const { excludedItems, excludedCategories } = tx.kitchen;
  const { transactionSettings, setTransactionSettings, tableSettings, setTableSettings } =
    tx.settings;
  const {
    dispatchKitchenOrdersReload,
    dispatchOrdersLocalRefresh,
    broadcastTableOverviewOrderStatus,
  } = tx.orchestrator;

  const [disablePayForReopenedOnlineOrder, setDisablePayForReopenedOnlineOrder] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "" });
  const showToast = useToastController(setToast, 3500);
  const didAutoOpenRegisterRef = useRef(false);
  const existingReservationRef = useRef(null);
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCartItems = Array.isArray(cartItems) ? cartItems : [];
  const restaurantId = restaurantSlug || "global";
const tableLabelText = String(tableSettings.tableLabelText || "").trim() || t("Table");
  // REGION: Derived
  const presetNotes = useMemo(
    () =>
      Array.isArray(transactionSettings.presetNotes) &&
      transactionSettings.presetNotes.length > 0
        ? transactionSettings.presetNotes
        : DEFAULT_TRANSACTION_SETTINGS.presetNotes,
    [transactionSettings.presetNotes]
  );
const enableProductGridVirtualization = useMemo(
  () =>
    Boolean(transactionSettings.enableProductGridVirtualization) ||
    import.meta.env.VITE_TX_VIRTUALIZE_PRODUCTS === "true",
  [transactionSettings.enableProductGridVirtualization]
);
const enableCartVirtualization = useMemo(
  () =>
    Boolean(transactionSettings.enableCartVirtualization) ||
    import.meta.env.VITE_TX_VIRTUALIZE_CART === "true",
  [transactionSettings.enableCartVirtualization]
);
const virtualizationProductOverscan = useMemo(() => {
  const value = Number(transactionSettings.virtualizationProductOverscan);
  return Number.isFinite(value) ? Math.max(0, value) : 6;
}, [transactionSettings.virtualizationProductOverscan]);
const virtualizationCartOverscan = useMemo(() => {
  const value = Number(transactionSettings.virtualizationCartOverscan);
  return Number.isFinite(value) ? Math.max(0, value) : 8;
}, [transactionSettings.virtualizationCartOverscan]);
useEffect(() => {
  if (!import.meta.env.DEV) return;
  if (!enableProductGridVirtualization && !enableCartVirtualization) return;
  console.info(
    `[TX_VIRTUAL] products=${enableProductGridVirtualization} cart=${enableCartVirtualization} overscan=${virtualizationProductOverscan}/${virtualizationCartOverscan}`
  );
}, [
  enableCartVirtualization,
  enableProductGridVirtualization,
  virtualizationCartOverscan,
  virtualizationProductOverscan,
]);
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
const [catalogSearch, setCatalogSearch] = useState("");
const deferredCatalogSearch = useDeferredValue(catalogSearch);
const normalizedCatalogSearch = useMemo(
  () => normalizeGroupKey(deferredCatalogSearch),
  [deferredCatalogSearch]
);
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
const normalizedActiveCategory = useMemo(
  () => (activeCategory || "").trim().toLowerCase(),
  [activeCategory]
);
const productsInActiveCategory = useMemo(
  () =>
    safeProducts.filter(
      (p) => (p.category || "").trim().toLowerCase() === normalizedActiveCategory
    ),
  [normalizedActiveCategory, safeProducts]
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

const isCashMethod = useCallback(
  (methodId) => {
    if (!methodId) return false;
    const method = paymentMethods.find((m) => m.id === methodId);
    const label = method?.label || methodId;
    return txIsCashLabel(label);
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
      const reopened = await txApiRequest(`/orders/${orderCandidate.id}/reopen${identifier}`, {
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

const { handleCartPrint } = useMemo(
  () =>
    createPrintFlow({
      order,
      cartItems,
      identifier,
      txFetchOrderWithItems,
      txPrintViaBridge,
      showToast,
      t,
    }),
  [
    cartItems,
    identifier,
    order,
    showToast,
    t,
    txFetchOrderWithItems,
    txPrintViaBridge,
  ]
);

const {
  handleOpenDebtModal,
  handleDebtSearch,
  handleSelectDebtCustomer,
  handleAddToDebt,
} = useMemo(
  () =>
    createDebtFlow({
      order,
      orderId,
      tableId,
      isDebtEligible,
      txApiRequest,
      setDebtError,
      setDebtSearch,
      setDebtSearchResults,
      setDebtLookupLoading,
      setDebtForm,
      setShowDebtModal,
      isDebtSaving,
      discountedTotal,
      debtForm,
      identifier,
      setIsDebtSaving,
      setOrder,
      setCartItems,
      setReceiptItems,
      setSelectedCartItemIds,
      showToast,
      t,
      debugNavigate,
      setDebtSearchLoading,
    }),
  [
    debtForm,
    debugNavigate,
    discountedTotal,
    identifier,
    isDebtEligible,
    isDebtSaving,
    order,
    orderId,
    setCartItems,
    setDebtError,
    setDebtForm,
    setDebtLookupLoading,
    setDebtSearch,
    setDebtSearchLoading,
    setDebtSearchResults,
    setIsDebtSaving,
    setOrder,
    setReceiptItems,
    setSelectedCartItemIds,
    setShowDebtModal,
    showToast,
    t,
    tableId,
    txApiRequest,
  ]
);

// reservation handlers now come from useReservation hook

const renderCategoryButton = useCallback(
  (cat, idx, variant = "desktop") => (
    <CategoryButton
      key={`${variant}-${cat}-${idx}`}
      cat={cat}
      idx={idx}
      variant={variant}
      isActive={currentCategoryIndex === idx}
      isReorderingCategories={isReorderingCategories}
      draggingCategoryKey={draggingCategoryKey}
      catalogSearch={catalogSearch}
      setCatalogSearch={setCatalogSearch}
      setCurrentCategoryIndex={setCurrentCategoryIndex}
      setDraggingCategoryKey={setDraggingCategoryKey}
      reorderCategoryByKeyToIndex={reorderCategoryByKeyToIndex}
      categoryImages={categoryImages}
      t={t}
      CATEGORY_FALLBACK_IMAGE={CATEGORY_FALLBACK_IMAGE}
      setIsReorderingCategories={setIsReorderingCategories}
    />
  ),
  [
    CATEGORY_FALLBACK_IMAGE,
    catalogSearch,
    categoryImages,
    currentCategoryIndex,
    draggingCategoryKey,
    isReorderingCategories,
    reorderCategoryByKeyToIndex,
    setCatalogSearch,
    setCurrentCategoryIndex,
    setDraggingCategoryKey,
    setIsReorderingCategories,
    t,
  ]
);


const hasExtras = (item) => Array.isArray(item.extras) && item.extras.length > 0;
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

// 1. Add drinksList state at the top
const [drinksList, setDrinksList] = useState([]);
  const [isFloatingCartOpen, setIsFloatingCartOpen] = useState(false);
const latestOrderRef = useRef(null);
const latestCartItemsRef = useRef([]);
const phoneOrderCreatePromiseRef = useRef(null);
useEffect(() => {
  return () => {
    // Cleanup phone order promise ref to prevent memory leak
    phoneOrderCreatePromiseRef.current = null;
  };
}, []);
const clearCartState = useCallback(() => {
  setCartItems([]);
  setReceiptItems([]);
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
  setSelectionQuantities({});
  setIsFloatingCartOpen(false);
}, []);


  const fetchExtrasGroupsOnce = useCallback(async () => {
    const data = await txApiRequest(`/extras-groups${identifier}`);
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

const fetchSubOrders = useCallback(async (targetOrderId = order?.id) => {
  if (!targetOrderId) return;
  try {
    const data = await txApiRequest(`/orders/${targetOrderId}/suborders${identifier}`);
    setSubOrders(data);
  } catch (e) {
    console.error(e);
  }
}, [order?.id, identifier, txApiRequest]);

useEffect(() => {
 txApiRequest("/drinks")
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
      const resData = await txApiRequest(`/orders/reservations/${order.id}${identifier}`);
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

const imgForCategory = (category) => {
  const slug = toCategorySlug(category);
  return categoryImages[slug] || CATEGORY_FALLBACK_IMAGE;
};
const handleAddProductWithExtras = (product, selectedExtras) => {
  const [drinkExtras, otherExtras] = splitDrinkExtras(selectedExtras, drinksList);

  if (otherExtras.length > 0) {
    addToCart({
      ...product,
      extras: otherExtras,
    });
  }
  if (drinkExtras.length > 0) {
    drinkExtras.forEach((drink) => {
      const matchedDrink = safeProducts.find(
        (p) => p.name.trim().toLowerCase() === drink.name.trim().toLowerCase()
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

useTransactionHeader({
  order,
  orderId,
  tableId,
  tableLabelText,
  t,
  setHeader,
});

const handleQuickDiscount = () => {
  // TODO: open your discount modal, or show a toast for now
  setToast({ show: true, message: t("Quick Discount is coming soon!") });
};

const handleOpenCashRegister = () => {
  loadRegisterSummary().catch(() => {});
  navigate("/tableoverview?tab=register", {
    state: { openRegisterModal: true },
  });
};

const handleCreatePhoneOrder = (order) => {
  navigate(`/transaction/phone/${order.id}`, { state: { order } });
};

const {
  safeParseExtras,
  computeItemLineTotal,
  getPaymentMethodSummaryWithIcon,
} = useMemo(() => createReceiptFlow({}), []);

// ===== Voice ordering (POS table + phone) =====
const speechRecognitionFactory = useRef(null);
const getSpeechRecognition = useCallback(() => {
  if (speechRecognitionFactory.current !== null) return speechRecognitionFactory.current;
  if (typeof window === "undefined") return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  speechRecognitionFactory.current = SR ? SR : null;
  return speechRecognitionFactory.current;
}, []);

const preferredLanguage = useMemo(() => {
  if (typeof window === "undefined") return i18n.language || "en";
  const stored =
    window.localStorage.getItem("beyproLanguage") ||
    window.localStorage.getItem("beyproGuestLanguage");
  return (stored || i18n.language || "en").split("-")[0];
}, [i18n.language]);

const handleVoiceStart = useCallback(() => {
  if (!["phone", "table"].includes(orderType)) {
    setVoiceError(t("Voice ordering is available for table and phone orders."));
    setShowVoiceModal(true);
    return;
  }
  const SR = getSpeechRecognition();
  if (!SR) {
    setVoiceError(t("Voice recognition not supported in this browser"));
    setShowVoiceModal(true);
    return;
  }
  setVoiceError("");
  setVoiceTranscript("");
  setVoiceResult(null);
  setShowVoiceModal(true);
  const rec = new SR();
  rec.lang = preferredLanguage || "en-US";
  rec.interimResults = false;
  rec.continuous = false;
  rec.onstart = () => setVoiceListening(true);
  rec.onerror = (e) => {
    setVoiceListening(false);
    setVoiceError(e.error || "Mic error");
  };
  rec.onend = () => setVoiceListening(false);
  rec.onresult = (evt) => {
    const text = Array.from(evt.results)
      .map((r) => r[0]?.transcript || "")
      .join(" ")
      .trim();
    setVoiceTranscript(text);
    if (text) parseVoiceTranscript(text);
  };
  try {
    rec.start();
  } catch (err) {
    setVoiceListening(false);
    setVoiceError(err?.message || "Mic start failed");
  }
}, [getSpeechRecognition, orderType, preferredLanguage, t]);

const parseVoiceTranscript = useCallback(
  async (transcriptText) => {
    if (!transcriptText) return;
    setVoiceParsing(true);
    setVoiceError("");
    try {
      const body = {
        restaurant_id: currentUser?.restaurant_id,
        transcript: transcriptText,
        language: preferredLanguage,
        order_type: orderType,
        table_id: tableId,
      };
      const res = await txApiRequest(`/voice/parse-order`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setVoiceResult(res);
      setVoiceLogId(res?.log_id || null);
    } catch (err) {
      console.error("❌ Voice parse failed", err);
      setVoiceError(err?.message || t("Voice parsing failed"));
    } finally {
      setVoiceParsing(false);
    }
  },
  [currentUser?.restaurant_id, orderType, preferredLanguage, tableId, t, txApiRequest]
);

  const matchExtraPrice = useCallback((product, modifierValue) => {
  if (!product) return 0;
  const extras = (() => {
    if (Array.isArray(product.extras)) return product.extras;
    try {
      const parsed = JSON.parse(product.extras || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  const found = extras.find(
    (ex) => String(ex.name || "").toLowerCase() === String(modifierValue || "").toLowerCase()
  );
  return Number(found?.price ?? found?.extraPrice ?? 0) || 0;
}, []);

  // 💡 Compute total of selected cart items (supports partial quantity selection)
  // Only count unpaid items toward payment totals so paid-item selections (for refunds)
  // don’t inflate the pay modal.
  const selectedItemsTotal = useMemo(
    () =>
      cartItems.reduce((sum, item) => {
        if (isPaidItem(item)) return sum;
        const key = String(item.unique_id || item.id);
        if (!selectedCartItemIds.has(key)) return sum;
        const maxQty = Math.max(1, Number(item.quantity) || 1);
        const selectedQty = Math.min(
          maxQty,
          Number(selectionQuantities?.[key] || maxQty)
        );
        const perUnit = computeItemLineTotal(item, safeParseExtras) / maxQty;
        return sum + perUnit * selectedQty;
      }, 0),
    [
      cartItems,
      computeItemLineTotal,
      safeParseExtras,
      selectedCartItemIds,
      selectionQuantities,
    ]
  );

  const hasSelection = selectedCartItemIds.size > 0;

  const totalPaidAmount = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      if (!item.paid) return sum;
      return sum + computeItemLineTotal(item, safeParseExtras);
    }, 0);
  }, [cartItems, computeItemLineTotal, safeParseExtras]);

  const selectedPaidRefundAmount = useMemo(() => {
    if (!selectedCartItemIds.size) return 0;
    const keys = new Set(Array.from(selectedCartItemIds, (id) => String(id)));
    return cartItems.reduce((sum, item) => {
      const key = String(item.unique_id || item.id);
      if (!keys.has(key) || !item.paid) return sum;
      const maxQty = Math.max(1, Number(item.quantity) || 1);
      const requested = Number(selectionQuantities[key]) || 1;
      const cancelQty = Math.min(Math.max(1, requested), maxQty);
      const perUnit = computeItemLineTotal(item, safeParseExtras) / maxQty;
      return sum + perUnit * cancelQty;
    }, 0);
  }, [selectionQuantities, cartItems, selectedCartItemIds, computeItemLineTotal]);

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

const { resetTableGuests, allItemsDelivered, runAutoCloseIfConfigured } = useMemo(
  () =>
    createCloseFlow({
      txApiRequest,
      identifier,
      order,
      orderType,
      transactionSettings,
      paymentMethods,
      selectedPaymentMethod,
      existingReservationRef,
      getReservationSchedule,
      isEarlyReservationClose,
      requestReservationCloseConfirmation,
      broadcastTableOverviewOrderStatus,
      navigate,
      excludedItemsSet,
      excludedCategoriesSet,
    }),
  [
    broadcastTableOverviewOrderStatus,
    existingReservationRef,
    excludedCategoriesSet,
    excludedItemsSet,
    getReservationSchedule,
    identifier,
    isEarlyReservationClose,
    navigate,
    order,
    orderType,
    paymentMethods,
    requestReservationCloseConfirmation,
    selectedPaymentMethod,
    transactionSettings,
    txApiRequest,
  ]
);

// Increase quantity of a cart item by unique_id
const incrementCartItem = useCallback((uniqueId) => {
  setCartItemQty(uniqueId, (current) => Number(current || 0) + 1, {
    min: 1,
    canMutate: (item) => !item.paid && !item.confirmed,
  });
}, [setCartItemQty]);

const decrementCartItem = useCallback((uniqueId) => {
  setCartItemQty(uniqueId, (current) => Number(current || 1) - 1, {
    min: 1,
    canMutate: (item) => !item.paid && !item.confirmed,
  });
}, [setCartItemQty]);



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
        txApiRequest(`/orders/${currentOrder.id}/close${identifier}`, { method: "POST" });
        return;
      }
      if (orderType === "table") {
        const tableNum = Number(currentOrder?.table_number ?? currentOrder?.tableNumber);
        if (Number.isFinite(tableNum)) removeTableOverviewOrderFromCache(tableNum);
      }
      txApiRequest(`/orders/${currentOrder.id}/reset-if-empty${identifier}`, { method: "PATCH" });
    };
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

const fetchOrderItems = useCallback(
  async (orderId, options = {}) => {
    const { orderTypeOverride, sourceOverride } = options;
    try {
      const normalizedOrderId =
        orderId === null || orderId === undefined ? "" : String(orderId).trim();
      if (!normalizedOrderId || normalizedOrderId.toLowerCase() === "null") {
        console.warn("⚠️ fetchOrderItems skipped (missing orderId):", orderId);
        return [];
      }

      const items = await txApiRequest(`/orders/${orderId}/items${identifier}`);
      if (!Array.isArray(items)) {
        console.error("❌ Expected items to be an array but got:", items);
        return [];
      }

      const formatted = formatOrderItems({
        items,
        products,
        safeParseExtras,
        orderType: orderTypeOverride ?? latestOrderRef.current?.order_type,
        orderSource: sourceOverride ?? latestOrderRef.current?.source,
      });

      setCartItems((prevCart) => mergeWithUnconfirmedItems(formatted, prevCart));
      setReceiptItems(formatted.filter((item) => item.paid));

      return formatted;
    } catch (err) {
      console.error("❌ Failed to fetch items:", err);
      return [];
    }
  },
  [identifier, products, safeParseExtras, setCartItems, setReceiptItems]
);

const refreshCurrentOrder = useCallback(async () => {
  if (!order?.id) return;

  const refreshed = await txApiRequest(`/orders/${order.id}${identifier}`);
  setOrder(refreshed);

  await fetchOrderItems(order.id);
}, [order?.id, identifier, txApiRequest, fetchOrderItems, setOrder]);

useEffect(() => {
  if (!order?.id) return;

  const onMerged = (payload) => {
    if (payload?.order?.id === order.id) {
      void (async () => {
        await refreshCurrentOrder();
        await fetchSubOrders(order.id);
      })();
    }
  };

  txSocketOn("order_merged", onMerged);
  return () => txSocketOff("order_merged", onMerged);
}, [order?.id, refreshCurrentOrder, fetchSubOrders]);

const { loadTakeawayOrder, loadOrCreateTableOrder } = useOrderLoader({
  orderId,
  tableId,
  location,
  initialOrder,
  identifier,
  restaurantSlug,
  products,
  safeParseExtras,
  setOrder,
  setCartItems,
  setReceiptItems,
  setLoading,
  fetchOrderItems,
  reopenOrderIfNeeded,
});
takeawayOrderFetcherRef.current = loadTakeawayOrder;

const {
  cancelReason,
  setCancelReason,
  cancelLoading,
  refundMethodId,
  setRefundMethodId,
  openCancelModal,
  closeCancelModal,
  handleCancelConfirm,
} = useCancelRefund({
  t,
  order,
  normalizedStatus,
  selectedCartItems,
  selectionQuantities,
  setSelectionQuantities,
  paymentMethods,
  shouldShowRefundMethod,
  selectedPaidRefundAmount,
  refundAmount,
  isCashMethod,
  showToast,
  txApiRequest,
  identifier,
  fetchOrderItems,
  setOrder,
  clearCartState,
  setSelectedCartItemIds,
  clearRegisterSummaryCache,
  clearRegisterDataCache,
  txLogCashRegisterEvent,
  setShowCancelModal,
});


const orderStatusFlow = useMemo(
  () =>
    createOrderStatusFlow({
      order,
      orderId,
      tableId,
      orderType,
      phoneOrderDraft,
      selectedPaymentMethod,
      phoneOrderCreatePromiseRef,
      txApiRequest,
      identifier,
      setOrder,
      showToast,
      t,
      resolvePaymentLabel,
    }),
  [
    identifier,
    order,
    orderId,
    orderType,
    phoneOrderDraft,
    phoneOrderCreatePromiseRef,
    selectedPaymentMethod,
    setOrder,
    showToast,
    tableId,
    t,
    txApiRequest,
    resolvePaymentLabel,
  ]
);
const { updateOrderStatus } = orderStatusFlow;
const handleReservationDeletedSync = useCallback(
  (nextOrder) => {
    const source = nextOrder && typeof nextOrder === "object" ? nextOrder : order;
    const tableNumber = Number(source?.table_number ?? source?.tableNumber ?? tableId);
    if (!Number.isFinite(tableNumber)) return;

    const orderIdNum =
      source?.id === null || source?.id === undefined ? null : Number(source.id);
    const statusLower = String(source?.status || "").toLowerCase();

    if (statusLower === "closed") {
      removeTableOverviewOrderFromCache(tableNumber);
      dispatchOrdersLocalRefresh({
        kind: "tableoverview_order_status",
        table_number: tableNumber,
        order_id: orderIdNum,
        status: "closed",
        patch: null,
      });
      return;
    }

    const normalizedStatus =
      statusLower === "reserved" ? "confirmed" : source?.status || "confirmed";
    const normalizedStatusLower = String(normalizedStatus || "").toLowerCase();

    const patch = {
      status: normalizedStatus,
      order_type:
        source?.order_type === "reservation" && normalizedStatusLower !== "reserved"
          ? "table"
          : source?.order_type,
      payment_status: source?.payment_status,
      is_paid: source?.is_paid,
      total: source?.total,
      reservation: null,
      reservation_id: null,
      reservationId: null,
      reservation_date: null,
      reservationDate: null,
      reservation_time: null,
      reservationTime: null,
      reservation_clients: null,
      reservationClients: null,
      reservation_notes: null,
      reservationNotes: null,
      items: Array.isArray(source?.items) ? source.items : undefined,
      suborders: Array.isArray(source?.suborders) ? source.suborders : undefined,
    };

    upsertTableOverviewOrderInCache({
      tableNumber,
      orderId: orderIdNum,
      patch,
    });

    dispatchOrdersLocalRefresh({
      kind: "tableoverview_order_status",
      table_number: tableNumber,
      order_id: orderIdNum,
      status: patch.status,
      patch,
    });
  },
  [dispatchOrdersLocalRefresh, order, tableId]
);
const {
  reservationDate,
  setReservationDate,
  reservationTime,
  setReservationTime,
  reservationClients,
  setReservationClients,
  reservationNotes,
  setReservationNotes,
  existingReservation,
  setExistingReservation,
  reservationLoading,
  setReservationLoading,
  showReservationModal,
  setShowReservationModal,
  resetReservationForm,
  handleSaveReservation,
  handleDeleteReservation,
  openReservationModal,
} = useReservation({
  order,
  identifier,
  txApiRequest,
  t,
  showToast,
  hasUnconfirmedCartItems,
  safeCartItems,
  updateOrderStatus,
  fetchOrderItems,
  restaurantId,
  debugNavigate,
  discountValue,
  discountType,
  setOrder,
  onReservationDeleted: handleReservationDeletedSync,
});

useEffect(() => {
  existingReservationRef.current = existingReservation ?? null;
}, [existingReservation]);

const { refreshReceiptAfterPayment } = useMemo(
  () =>
    createReceiptFlow({
      order,
      identifier,
      txApiRequest,
      setReceiptItems,
      setCartItems,
    }),
  [
    identifier,
    order,
    setCartItems,
    setReceiptItems,
    txApiRequest,
  ]
);

const confirmFlow = useMemo(
  () =>
    createConfirmFlow({
      order,
      t,
      selectedCartItemIds,
      cartItems,
      discountedTotal,
      orderType,
      orderId,
      debugNavigate,
      txApiRequest,
      identifier,
      showToast,
      resetTableGuests,
      broadcastTableOverviewOrderStatus,
      navigate,
      getPrimaryActionLabel,
      receiptItems,
      hasUnconfirmedCartItems,
      updateOrderStatus,
      safeCartItems,
      discountValue,
      discountType,
      fetchOrderItems,
      transactionSettings,
      setIsFloatingCartOpen,
      scheduleNavigate,
      setHeader,
      hasConfirmedCartUnpaid,
      hasSuborderUnpaid,
      allPaidIncludingSuborders,
      existingReservation,
      getReservationSchedule,
      isEarlyReservationClose,
      requestReservationCloseConfirmation,
      allItemsDelivered,
      setDiscountValue,
      setDiscountType,
      setOrder,
      setCartItems,
    }),
  [
    allItemsDelivered,
    allPaidIncludingSuborders,
    broadcastTableOverviewOrderStatus,
    cartItems,
    debugNavigate,
    discountedTotal,
    discountType,
    discountValue,
    existingReservation,
    fetchOrderItems,
    getReservationSchedule,
    getPrimaryActionLabel,
    hasConfirmedCartUnpaid,
    hasSuborderUnpaid,
    hasUnconfirmedCartItems,
    identifier,
    isEarlyReservationClose,
    navigate,
    order,
    orderId,
    orderType,
    receiptItems,
    requestReservationCloseConfirmation,
    resetTableGuests,
    safeCartItems,
    scheduleNavigate,
    selectedCartItemIds,
    setCartItems,
    setDiscountType,
    setDiscountValue,
    setHeader,
    setIsFloatingCartOpen,
    setOrder,
    showToast,
    t,
    transactionSettings,
    txApiRequest,
    updateOrderStatus,
  ]
);
const { handleMultifunction } = confirmFlow;

const { confirmPaymentWithSplits } = useSplitPayment({
  cartItems,
  selectedCartItemIds,
  selectionQuantities,
  discountValue,
  discountType,
  computeItemLineTotal,
  getPaymentItemKey,
  resolvePaymentLabel,
  txApiRequest,
  identifier,
  order,
  setOrder,
  setSelectedCartItemIds,
  dispatchOrdersLocalRefresh,
  broadcastTableOverviewOrderStatus,
  refreshReceiptAfterPayment,
  fetchOrderItems,
  fetchSubOrders,
  dispatchKitchenOrdersReload,
  runAutoCloseIfConfigured,
  setShowPaymentModal,
});


const paymentFlow = useMemo(
  () =>
    createPaymentFlow({
      order,
      orderType,
      hasUnconfirmedCartItems,
      selectedCartItemIds,
      cartItems,
      getPaymentItemKey,
      setShowPaymentModal,
      showToast,
      t,
      hasSuborderUnpaid,
      selectionQuantities,
      resolvePaymentLabel,
      isCashMethod,
      uuidv4,
      discountValue,
      discountType,
      txApiRequest,
      identifier,
      broadcastTableOverviewOrderStatus,
      setCartItems,
      dispatchOrdersLocalRefresh,
      splits,
      refreshReceiptAfterPayment,
      fetchOrderItems,
      fetchSubOrders,
      updateOrderStatus,
      setOrder,
      runAutoCloseIfConfigured,
      setSelectedCartItemIds,
      txLogCashRegisterEvent,
      txOpenCashDrawer,
      computeItemLineTotal,
    }),
  [
    broadcastTableOverviewOrderStatus,
    cartItems,
    computeItemLineTotal,
    discountType,
    discountValue,
    dispatchOrdersLocalRefresh,
    fetchOrderItems,
    fetchSubOrders,
    getPaymentItemKey,
    hasSuborderUnpaid,
    hasUnconfirmedCartItems,
    identifier,
    isCashMethod,
    order,
    orderType,
    refreshReceiptAfterPayment,
    resolvePaymentLabel,
    runAutoCloseIfConfigured,
    selectedCartItemIds,
    selectionQuantities,
    setCartItems,
    setOrder,
    setSelectedCartItemIds,
    setShowPaymentModal,
    showToast,
    splits,
    t,
    txLogCashRegisterEvent,
    txOpenCashDrawer,
    txApiRequest,
    updateOrderStatus,
    uuidv4,
  ]
);
const { confirmPayment, handlePayClick } = paymentFlow;

useEffect(() => {
  const handleOrderCancelled = (payload) => {
    const cancelledId = typeof payload?.orderId === "number" ? payload.orderId : Number(payload?.orderId);
    if (!order?.id || !Number.isFinite(cancelledId) || cancelledId !== order.id) return;
    showToast(t("Order cancelled"));
    clearCartState();
    setOrder((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
  };
  txSocketOn("order_cancelled", handleOrderCancelled);
  return () => txSocketOff("order_cancelled", handleOrderCancelled);
}, [order?.id, t, clearCartState, showToast]);

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
    loadOrCreateTableOrder(tableId);
    return;
  }

  debugNavigate("/tableoverview?tab=tables");
}, [
  normalizedStatus,
  orderType,
  tableId,
  clearCartState,
  debugNavigate,
  setLoading,
  loadOrCreateTableOrder,
]);


// === Voice ordering state ===
const [voiceListening, setVoiceListening] = useState(false);
const [voiceTranscript, setVoiceTranscript] = useState("");
const [voiceResult, setVoiceResult] = useState(null);
const [voiceParsing, setVoiceParsing] = useState(false);
const [showVoiceModal, setShowVoiceModal] = useState(false);
const [voiceError, setVoiceError] = useState("");
const [voiceLogId, setVoiceLogId] = useState(null);

const injectVoiceItemsToCart = useCallback(
  async (items) => {
    if (!Array.isArray(items) || items.length === 0) return;
    const byId = new Map(safeProducts.map((p) => [Number(p.id), p]));
    const byName = new Map(
      safeProducts.map((p) => [String(p.name || "").toLowerCase(), p])
    );
    items.forEach((raw) => {
      const product =
        byId.get(Number(raw.product_id)) ||
        byName.get(String(raw.product_name || "").toLowerCase());
      if (!product) return;
      const quantity = Math.max(1, Number(raw.quantity) || 1);
      const modifiers = Array.isArray(raw.modifiers) ? raw.modifiers : [];
      const extras = [];
      let noteParts = [];
      modifiers.forEach((m) => {
        const val = m?.value || m?.name;
        if (!val) return;
        if (m.type === "remove") {
          noteParts.push(`${t("No")} ${val}`);
        } else {
          extras.push({
            group: "Voice",
            name: val,
            price: matchExtraPrice(product, val),
            quantity: 1,
          });
        }
      });
      if (raw.size) noteParts.push(`${t("Size")}: ${raw.size}`);
      addCartItem({
        id: product.id,
        name: product.name,
        image: product.image,
        price: parseFloat(product.price) || 0,
        quantity,
        extras,
        note: noteParts.join(" • "),
        unique_id: `${product.id}-voice-${uuidv4()}`,
      });
    });
    setVoiceResult(null);
    setShowVoiceModal(false);
    setVoiceTranscript("");
    if (voiceLogId) {
      try {
        await txApiRequest(`/voice/logs/${voiceLogId}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            confirmed_json: { items },
            confidence_score: voiceResult?.confidence_score,
          }),
        });
      } catch (err) {
        console.warn("⚠️ voice confirm log failed", err?.message);
      }
    }
  },
  [
    addCartItem,
    matchExtraPrice,
    safeProducts,
    t,
    txApiRequest,
    voiceLogId,
    voiceResult?.confidence_score,
  ]
);

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

    addCartItem({
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
    });
  },
  [addCartItem, order, setCartItems, setEditingCartItemIndex]
);

const addToCart = useCallback(async (product) => {
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
}, [finalizeCartItem, getMatchedExtrasGroups, order, setNote, setSelectedExtras, setSelectedProduct, setShowExtrasModal]);

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

const removeItem = useCallback((uniqueId) => {
  removeCartItem(uniqueId, (item) => !item.confirmed);
  setSelectedCartItemIds((prev) => {
    if (!prev.has(String(uniqueId))) return prev;
    const next = new Set(prev);
    next.delete(String(uniqueId));
    return next;
  });
}, [removeCartItem]);

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
  }, [order?.id, fetchSubOrders]);

const sumOfSplits = useMemo(
  () =>
    Object.values(splits || {})
      .map((v) => parseFloat(v || 0))
      .reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0),
  [splits]
);

// Split calculation
const totalDue = useMemo(
  () =>
    cartItems
      .filter((item) => !item.paid)
      .reduce((sum, item) => sum + computeItemLineTotal(item), 0),
  [cartItems, computeItemLineTotal]
);

// after you compute sumOfSplits…
const hasAnySplit = useMemo(
  () => Object.values(splits || {}).some((v) => parseFloat(v || 0) > 0),
  [splits]
);
const shouldDisablePay = useMemo(
  () => hasAnySplit && sumOfSplits !== totalDue,
  [hasAnySplit, sumOfSplits, totalDue]
);

const handleToggleReorder = useCallback(() => {
  setIsReorderingCategories((prev) => !prev);
  setDraggingCategoryKey("");
  draggedCategoryKeyRef.current = "";
}, [setDraggingCategoryKey, setIsReorderingCategories]);

const handleHeaderCategorySelect = useCallback(
  (idx) => {
    setCurrentCategoryIndex(idx);
    setCatalogSearch("");
  },
  [setCurrentCategoryIndex, setCatalogSearch]
);

const cartPanelProps = useMemo(
  () => ({
    ...tx.vm.cartPanelProps,
    orderId,
    tableLabelText,
    tableId,
    invoiceNumber,
    existingReservation,
    unpaidCartItems,
    paidCartItems,
    cartItems,
    showPaidCartItems,
    setShowPaidCartItems,
    cartScrollRef,
    selectedCartItemIds,
    selectionQuantities,
    expandedCartItems,
    toggleCartItemExpansion,
    toggleCartItemSelection,
    updateSelectionQuantity,
    removeSelectionQuantity,
    decrementCartItem,
    incrementCartItem,
    removeItem,
    safeParseExtras,
    setSelectedProduct,
    setSelectedExtras,
    setEditingCartItemIndex,
    setShowExtrasModal,
    getMatchedExtrasGroups,
    ensureExtrasGroups,
    setShowMoveTableModal,
    setShowMergeTableModal,
    handleOpenDebtModal,
    debtDisabled: !isDebtEligible || isDebtSaving,
    isDebtSaving,
    handleCartPrint,
    openReservationModal,
    handleDeleteReservation,
    openCancelModal,
    setShowDiscountModal,
    handleOpenCashRegister,
    clearCartFromClearButton,
    navigate,
    setIsFloatingCartOpen,
    handleMultifunction,
    handlePayClick,
    hasUnpaidConfirmed,
    getPrimaryActionLabel,
    isPhoneOrder,
    hasConfirmedCartUnpaid,
    hasSuborderUnpaid,
    allCartItemsPaid,
    normalizedStatus,
    isFloatingCartOpen,
    hasUnconfirmedCartItems,
    allPaidIncludingSuborders,
    orderType,
    order,
    discountedTotal,
    discountType,
    discountValue,
    selectedItemsTotal,
    enableCartVirtualization,
    virtualizationCartOverscan,
  }),
  [
    allCartItemsPaid,
    allPaidIncludingSuborders,
    cartItems,
    cartScrollRef,
    clearCartFromClearButton,
    decrementCartItem,
    discountType,
    discountValue,
    discountedTotal,
    ensureExtrasGroups,
    existingReservation,
    expandedCartItems,
    getMatchedExtrasGroups,
    getPrimaryActionLabel,
    handleCartPrint,
    handleDeleteReservation,
    handleMultifunction,
    handleOpenCashRegister,
    handleOpenDebtModal,
    handlePayClick,
    hasConfirmedCartUnpaid,
    hasSuborderUnpaid,
    hasUnconfirmedCartItems,
    hasUnpaidConfirmed,
    incrementCartItem,
    invoiceNumber,
    isDebtEligible,
    isDebtSaving,
    isFloatingCartOpen,
    isPhoneOrder,
    navigate,
    normalizedStatus,
    openCancelModal,
    openReservationModal,
    order,
    orderId,
    orderType,
    paidCartItems,
    removeItem,
    removeSelectionQuantity,
    safeParseExtras,
    selectedCartItemIds,
    selectedItemsTotal,
    selectionQuantities,
    enableCartVirtualization,
    setEditingCartItemIndex,
    setIsFloatingCartOpen,
    setSelectedExtras,
    setSelectedProduct,
    setShowDiscountModal,
    setShowExtrasModal,
    setShowMergeTableModal,
    setShowMoveTableModal,
    setShowPaidCartItems,
    showPaidCartItems,
    tableId,
    tableLabelText,
    toggleCartItemExpansion,
    toggleCartItemSelection,
    tx.vm.cartPanelProps,
    unpaidCartItems,
    updateSelectionQuantity,
    virtualizationCartOverscan,
  ]
);

const footerPrimaryActionLabel = useMemo(
  () => getPrimaryActionLabel(),
  [getPrimaryActionLabel]
);
const headerProps = useMemo(
  () => ({
    ...tx.vm.headerProps,
    catalogSearch,
    setCatalogSearch,
    visibleCount: visibleProducts.length,
    onToggleReorder: handleToggleReorder,
    isCatalogSearching,
    matchingCategories,
    onSelectCategory: handleHeaderCategorySelect,
    onVoiceStart: ["phone", "table"].includes(orderType) ? handleVoiceStart : null,
    voiceListening,
  }),
  [
    catalogSearch,
    handleHeaderCategorySelect,
    handleToggleReorder,
    handleVoiceStart,
    isCatalogSearching,
    matchingCategories,
    orderType,
    setCatalogSearch,
    tx.vm.headerProps,
    visibleProducts.length,
    voiceListening,
  ]
);

const productGridProps = useMemo(
  () => ({
    ...tx.vm.productGridProps,
    products: visibleProducts,
    onAddProduct: addToCart,
    onOpenExtras: null,
    categoryColumns,
    renderCategoryButton,
    enableProductGridVirtualization,
    virtualizationProductOverscan,
  }),
  [
    addToCart,
    categoryColumns,
    enableProductGridVirtualization,
    renderCategoryButton,
    tx.vm.productGridProps,
    visibleProducts,
    virtualizationProductOverscan,
  ]
);

const footerProps = useMemo(
  () => ({
    ...tx.vm.footerProps,
    footerPrimaryActionLabel,
    handleMultifunction,
    handlePayClick,
    hasUnconfirmedCartItems,
    cartItemsLength: cartItems.length,
    hasConfirmedCartUnpaid,
    allCartItemsPaid,
    openReservationModal,
    setIsFloatingCartOpen,
    navigate,
    clearCartFromClearButton,
    openCancelModal,
    setShowDiscountModal,
  }),
  [
    allCartItemsPaid,
    cartItems.length,
    clearCartFromClearButton,
    footerPrimaryActionLabel,
    handleMultifunction,
    handlePayClick,
    hasConfirmedCartUnpaid,
    hasUnconfirmedCartItems,
    navigate,
    openCancelModal,
    openReservationModal,
    setIsFloatingCartOpen,
    setShowDiscountModal,
    tx.vm.footerProps,
  ]
);

const modalsProps = useMemo(
  () => ({
    ...tx.vm.modalsProps,
    isSplitMode,
    setIsSplitMode,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    cartItems,
    paymentMethods,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    confirmPayment,
    splits,
    setSplits,
    totalDue,
    hasSelection,
    selectedItemsTotal,
    selectionQuantities,
    selectedCartItemIds,
    activeSplitMethod,
    setActiveSplitMethod,
    confirmPaymentWithSplits,
    currentUser,
    navigate,
    closeCancelModal,
    order,
    tableLabelText,
    selectedCartItems,
    computeItemLineTotal,
    formatCurrency,
    hasPaidItems,
    refundMethodId,
    setRefundMethodId,
    refundAmount,
    cancelReason,
    setCancelReason,
    cancelLoading,
    handleCancelConfirm,
    showReservationModal,
    setShowReservationModal,
    reservationDate,
    setReservationDate,
    reservationTime,
    setReservationTime,
    reservationClients,
    setReservationClients,
    reservationNotes,
    setReservationNotes,
    existingReservation,
    handleDeleteReservation,
    handleSaveReservation,
    reservationLoading,
    debtSearch,
    handleDebtSearch,
    debtSearchLoading,
    debtSearchResults,
    handleSelectDebtCustomer,
    debtForm,
    setDebtForm,
    isDebtSaving,
    debtLookupLoading,
    debtError,
    setDebtError,
    handleAddToDebt,
    selectedProduct,
    setSelectedProduct,
    selectedExtras,
    setSelectedExtras,
    extrasGroups,
    handleExtrasModalConfirm,
    presetNotes,
    note,
    setNote,
    fullTotal,
    tableId,
    identifier,
    txApiRequest,
    showToast,
  }),
  [
    activeSplitMethod,
    cancelLoading,
    cancelReason,
    cartItems,
    closeCancelModal,
    computeItemLineTotal,
    confirmPayment,
    confirmPaymentWithSplits,
    currentUser,
    debtError,
    debtForm,
    debtLookupLoading,
    debtSearch,
    debtSearchLoading,
    debtSearchResults,
    discountType,
    discountValue,
    existingReservation,
    extrasGroups,
    formatCurrency,
    fullTotal,
    handleAddToDebt,
    handleCancelConfirm,
    handleDebtSearch,
    handleDeleteReservation,
    handleExtrasModalConfirm,
    handleSaveReservation,
    handleSelectDebtCustomer,
    hasPaidItems,
    hasSelection,
    isSplitMode,
    identifier,
    isDebtSaving,
    navigate,
    note,
    order,
    paymentMethods,
    presetNotes,
    refundAmount,
    refundMethodId,
    reservationClients,
    reservationDate,
    reservationLoading,
    reservationNotes,
    reservationTime,
    selectedCartItemIds,
    selectedCartItems,
    selectedExtras,
    selectedItemsTotal,
    selectedPaymentMethod,
    selectedProduct,
    selectionQuantities,
    setActiveSplitMethod,
    setCancelReason,
    setDebtError,
    setDebtForm,
    setDiscountType,
    setDiscountValue,
    setIsSplitMode,
    setNote,
    setRefundMethodId,
    setReservationClients,
    setReservationDate,
    setReservationNotes,
    setReservationTime,
    setSelectedExtras,
    setSelectedPaymentMethod,
    setSelectedProduct,
    setShowReservationModal,
    setSplits,
    showReservationModal,
    showToast,
    splits,
    tableId,
    tableLabelText,
    totalDue,
    tx.vm.modalsProps,
    txApiRequest,
  ]
);

const vm = useMemo(
  () => ({
    ...tx.vm,
    cartPanelProps,
    headerProps,
    productGridProps,
    footerProps,
    modalsProps,
  }),
  [
    cartPanelProps,
    footerProps,
    headerProps,
    modalsProps,
    productGridProps,
    tx.vm,
  ]
);

  // REGION: Render
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

  const totalCartItemCount = cartItems.length;
  const paidCartItemCount = cartItems.filter((item) => item.paid).length;
  const floatingCartPaidState =
    totalCartItemCount > 0 && paidCartItemCount === totalCartItemCount;
  const floatingCartButtonClassName = floatingCartPaidState
    ? "flex h-[64px] min-w-[228px] items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-4 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-white/40 backdrop-blur-sm active:scale-[0.97] transition dark:ring-slate-900/30"
    : "flex h-[64px] min-w-[228px] items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-rose-500 via-red-600 to-red-700 px-4 text-white shadow-lg shadow-red-600/30 ring-2 ring-white/40 backdrop-blur-sm active:scale-[0.97] transition dark:ring-slate-900/30";

  return (
    <div className="relative flex h-full min-h-[calc(100vh-80px)] w-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50/40 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/30" />
      <div className="flex h-full min-h-0 w-full flex-col gap-0 px-2 sm:px-3 lg:px-4 overflow-hidden">
  <section className="flex flex-1 min-h-0 flex-row gap-3 pb-2 overflow-hidden bg-slate-50 dark:bg-slate-950">

    {/* === LEFT: CART PANEL (desktop only) === */}
    <div className="hidden lg:block w-[30%] min-w-[320px] max-w-[380px] h-full overflow-hidden">
      <div className="sticky top-0 h-full">
        <CartPanelContainer variant="desktop" {...vm.cartPanelProps} />
      </div>
    </div>

    {/* Separator between cart and products (desktop only) */}
    <div
      className="hidden lg:block h-full w-px self-stretch rounded-full bg-gradient-to-b from-transparent via-slate-200 to-transparent shadow-[0_0_0_1px_rgba(148,163,184,0.08)]"
      aria-hidden="true"
    />

    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-50 via-slate-50 to-indigo-50/60 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/80 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/30 dark:shadow-[0_18px_40px_rgba(0,0,0,0.5)] dark:ring-slate-800/70">
      {/* Header */}
      <TransactionHeader {...vm.headerProps} />

        <ProductGridSection {...vm.productGridProps} />
    </div>
  </section>

      <FooterActionsBar {...vm.footerProps} />

    </div>

      <div
        className={`lg:hidden fixed left-1/2 -translate-x-1/2 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 transition-transform duration-300 ${isFloatingCartOpen ? "translate-y-[140%]" : "translate-y-0"}`}
      >
        <button
          type="button"
          onClick={() => setIsFloatingCartOpen(true)}
          className={floatingCartButtonClassName}
          aria-label={t("View Cart")}
        >
          <div className="flex flex-col items-start leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90">
                {t("Cart")}
              </span>
              {paidCartItemCount > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  {t("Paid")} {paidCartItemCount}
                </span>
              )}
            </div>
            <span className="text-[15px] font-bold">
              {formatCurrency(discountedTotal)}
            </span>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-1 text-center">
            <span className="text-[12px] font-semibold text-white/90">
              {totalCartItemCount} {t("Items")}
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
          <CartPanelContainer variant="mobile" {...vm.cartPanelProps} />
        </div>
      </div>

    {/* --- TOAST NOTIFICATION --- */}
    {showVoiceModal && (
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4 dark:bg-slate-900 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center dark:bg-indigo-950/40">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t("Voice order")}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {voiceListening ? t("Listening…") : voiceParsing ? t("Parsing…") : t("Review and confirm")}
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowVoiceModal(false)}
              className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
            >
              {t("Close")}
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t("Transcript")}
            </label>
            <textarea
              value={voiceTranscript}
              onChange={(e) => setVoiceTranscript(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100"
              placeholder={t("Press the mic and speak, or type here…")}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleVoiceStart}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-60"
                disabled={voiceListening || voiceParsing}
              >
                {voiceListening && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("Speak again")}
              </button>
              <button
                type="button"
                onClick={() => parseVoiceTranscript(voiceTranscript)}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-slate-800 disabled:opacity-60"
                disabled={!voiceTranscript || voiceParsing}
              >
                {voiceParsing ? t("Parsing…") : t("Parse")}
              </button>
              <button
                type="button"
                onClick={() => setShowVoiceModal(false)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              >
                {t("Edit manually")}
              </button>
            </div>
            {voiceError && (
              <div className="rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm border border-rose-100 dark:bg-rose-900/30 dark:text-rose-100 dark:border-rose-900/40">
                {voiceError}
              </div>
            )}
          </div>

          {voiceParsing && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("Understanding the order…")}
            </div>
          )}

          {!voiceParsing && voiceResult && (
            <div className="space-y-3">
              {voiceResult.clarification_required && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-100">
                  {voiceResult.clarification_question || t("We need clarification.")}
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="text-xs font-semibold text-slate-500 mb-2 dark:text-slate-300">
                  {t("We understood")}:
                </div>
                <ul className="space-y-2">
                  {(voiceResult.items || []).map((it, idx) => (
                    <li
                      key={idx}
                      className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm flex flex-col gap-1 shadow-sm dark:bg-slate-800 dark:border-slate-700"
                    >
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {it.quantity}× {it.product_name}
                      </div>
                      {it.size && (
                        <div className="text-xs text-slate-500">{t("Size")}: {it.size}</div>
                      )}
                      {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          {it.modifiers.map((m, i) => (
                            <span key={i} className="inline-block mr-2">
                              {m.type === "remove" ? "−" : "+"}{m.value}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {Array.isArray(voiceResult.suggestions) && voiceResult.suggestions.length > 0 && (
                  <div className="mt-3 text-xs text-slate-500 dark:text-slate-300">
                    {t("Suggestions")}:
                    {voiceResult.suggestions.map((s, i) => (
                      <span key={i} className="ml-2">{s.requested}: {s.suggestions?.map(x => x.name).join(", ")}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => injectVoiceItemsToCart(voiceResult.items)}
                  className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-emerald-700"
                  disabled={!voiceResult.items || voiceResult.items.length === 0}
                >
                  {t("Confirm order")}
                </button>
                <button
                  type="button"
                  onClick={handleVoiceStart}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
                >
                  {t("Speak again")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    {toast.show && (
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-6 py-4 bg-red-600 text-white text-lg rounded-2xl shadow-xl animate-fade-in-up transition-all">
        {t(toast.message)}
      </div>
    )}

    <Modals {...vm.modalsProps} />

  </div>
);
}
