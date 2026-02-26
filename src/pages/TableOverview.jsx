import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PhoneOrderModal from "../modals/PhoneOrderModal";
import RegisterModal from "../features/register/RegisterModal";
import useTableOrdersData from "../features/orders/useTableOrdersData";
import TablesView from "../features/tables/TablesView";
import useTablesModel from "../features/tables/hooks/useTablesModel";
import {
  getDisplayTotal,
  hasReservationSignal,
  hasUnpaidAnywhere,
  formatLocalYmd,
  isOrderPaid,
  isOrderFullyPaid,
  isEffectivelyFreeOrder,
  isOrderCancelledOrCanceled,
  normalizeOrderStatus,
  parseLooseDateToMs,
} from "../features/tables/tableVisuals";
import Orders from "../pages/Orders"; // adjust path as needed!
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import OrderHistory from "../components/OrderHistory";
import { useHeader } from "../context/HeaderContext";
import { useNotifications } from "../context/NotificationsContext";
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import secureFetch from "../utils/secureFetch";
import { printViaBridge } from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { useCurrency } from "../context/CurrencyContext";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  markPerfTrace,
  useRenderCount,
  withPerfTimer,
} from "../features/tables/dev/perfDebug";
import {
  generateTableOverviewStressData,
  mutateStressDataByAction,
} from "../features/tables/dev/stressData";
import socket from "../utils/socket";

const PERF_DEBUG_ENABLED = isTablePerfDebugEnabled();
const DEFAULT_STRESS_CONFIG = Object.freeze({
  tableCount: 96,
  orderCount: 420,
  itemCount: 2200,
});

const getOrderPrepMinutes = (order, productPrepById = {}) => {
  const direct = Number(order?.preparation_time ?? order?.prep_time ?? order?.prepTime);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const items = Array.isArray(order?.items) ? order.items : [];
  let maxMinutes = 0;
  items.forEach((item) => {
    const raw =
      item?.preparation_time ??
      item?.prep_time ??
      item?.prepTime ??
      item?.product_preparation_time ??
      item?.product?.preparation_time ??
      productPrepById?.[Number(item?.product_id ?? item?.productId)];
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const qty = Number(item?.quantity ?? item?.qty ?? 1);
    const total = minutes * Math.max(1, qty);
    if (total > maxMinutes) maxMinutes = total;
  });
  return maxMinutes;
};

const getPrepStartMs = (order) => {
  const direct = parseLooseDateToMs(order?.prep_started_at ?? order?.prepStartedAt);
  if (Number.isFinite(direct)) return direct;

  const updated = parseLooseDateToMs(order?.kitchen_status_updated_at);
  if (Number.isFinite(updated)) return updated;

  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const ms = parseLooseDateToMs(item?.prep_started_at ?? item?.prepStartedAt);
    if (Number.isFinite(ms)) return ms;
  }
  for (const item of items) {
    const itemUpdated = parseLooseDateToMs(item?.kitchen_status_updated_at);
    if (Number.isFinite(itemUpdated)) return itemUpdated;
  }
  return NaN;
};

const getReadyAtLabel = (order, productPrepById = {}) => {
  const directReadyMs = parseLooseDateToMs(
    order?.estimated_ready_at ??
      order?.ready_at ??
      order?.readyAt ??
      order?.estimatedReadyAt
  );
  if (Number.isFinite(directReadyMs)) {
    return new Date(directReadyMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const startMs = getPrepStartMs(order);
  const prepMinutes = getOrderPrepMinutes(order, productPrepById);
  if (!Number.isFinite(startMs) || !prepMinutes) return "";
  const readyMs = startMs + prepMinutes * 60 * 1000;
  return new Date(readyMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const TAB_LIST = [
  { id: "takeaway", label: "Pre Order", icon: "⚡" },
  { id: "tables", label: "Tables", icon: "🍽️" },
  { id: "kitchen", label: "All Orders", icon: "👨‍🍳" },
  { id: "history", label: "History", icon: "📘" },
  { id: "packet", label: "Packet", icon: "🛵" },
  { id: "phone", label: "Phone", icon: "📞" },
  { id: "register", label: "Register", icon: "💵" },
];

const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getTableConfigsCacheKey = () => getRestaurantScopedCacheKey("tableConfigs.v1");
const getTableCountCacheKey = () => getRestaurantScopedCacheKey("tableCount.v1");
const getOpenOrdersCacheKey = (mode = "packet") =>
  getRestaurantScopedCacheKey(`openOrders.${mode}.v1`);

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readOpenOrdersCache = (mode = "packet") => {
  try {
    if (typeof window === "undefined") return [];
    const raw = window?.localStorage?.getItem(getOpenOrdersCacheKey(mode));
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((order) => order && typeof order === "object" && order.id != null);
  } catch {
    return [];
  }
};

const writeOpenOrdersCache = (mode = "packet", orders = []) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(orders)) return;
    window?.localStorage?.setItem(getOpenOrdersCacheKey(mode), JSON.stringify(orders));
  } catch {
    // ignore cache errors
  }
};

const readInitialOpenOrdersById = () => {
  const next = {};
  readOpenOrdersCache("packet").forEach((order) => {
    const idNum = Number(order?.id);
    if (!Number.isFinite(idNum)) return;
    next[String(idNum)] = order;
  });
  return next;
};

const getSettingsTenantKey = () => {
  if (typeof window === "undefined") return "default";
  return (
    window?.localStorage?.getItem("restaurant_id") ||
    window?.localStorage?.getItem("restaurant_slug") ||
    "default"
  );
};

const getSettingCacheKey = (section) => `beypro:settings:${getSettingsTenantKey()}:${section}`;

const readInitialTableSettings = () => {
  const defaults = {
    tableLabelText: "",
    showAreas: true,
  };

  try {
    if (typeof window === "undefined") return defaults;
    const cached = safeParseJson(window?.localStorage?.getItem(getSettingCacheKey("tables")));
    if (!cached || typeof cached !== "object") return defaults;
    return { ...defaults, ...cached };
  } catch {
    return defaults;
  }
};

const readInitialTableConfigs = () => {
  // Prefer last known full configs (fastest + keeps areas/seats stable).
  const cachedConfigs = safeParseJson(
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableConfigsCacheKey()) : null
  );
  if (Array.isArray(cachedConfigs) && cachedConfigs.length > 0) {
    return cachedConfigs
      .filter((t) => t && typeof t === "object" && t.number != null && t.active !== false)
      .sort((a, b) => Number(a.number) - Number(b.number));
  }

  // Fallback to last known count → render placeholder cards immediately.
  const cachedCountRaw =
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableCountCacheKey()) : null;
  const cachedCount = Number.parseInt(cachedCountRaw || "", 10);
  if (Number.isFinite(cachedCount) && cachedCount > 0 && cachedCount <= 500) {
    return Array.from({ length: cachedCount }, (_, idx) => ({
      number: idx + 1,
      active: true,
    }));
  }

  return [];
};

const mergeTableConfigsByNumber = (prev, next) => {
  const map = new Map();
  (Array.isArray(prev) ? prev : []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    if (t.number == null) return;
    map.set(Number(t.number), t);
  });
  (Array.isArray(next) ? next : []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    if (t.number == null) return;
    const num = Number(t.number);
    map.set(num, { ...(map.get(num) || {}), ...t });
  });
  return Array.from(map.values()).sort((a, b) => Number(a.number) - Number(b.number));
};

const OPEN_ORDER_TYPES = {
  packet: ["packet", "phone"],
  kitchen: ["table", "phone", "packet", "takeaway"],
};

const isAbortError = (err) =>
  err?.name === "AbortError" ||
  String(err?.message || "")
    .toLowerCase()
    .includes("abort");





export default function TableOverview() {
  useRegisterGuard();
  const tableOverviewRenderCount = useRenderCount("TableOverview", { logEvery: 1 });
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const lastDayKeyRef = useRef(formatLocalYmd(new Date()));
  const tabFromUrl = React.useMemo(() => {
    const params = new window.URLSearchParams(location.search);
    return String(params.get("tab") || "tables").toLowerCase();
  }, [location.search]);

  const activeTab = tabFromUrl;
  const [useStressData, setUseStressData] = useState(false);
  const [stressDataset, setStressDataset] = useState(null);
  const [tableConfigs, setTableConfigs] = useState(() => readInitialTableConfigs());
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [orderTypeFilter, setOrderTypeFilter] = useState("All");
  const [fromDate, setFromDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionSettings, setTransactionSettings] = useState(
    DEFAULT_TRANSACTION_SETTINGS
  );
  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);
  const [tableSettings, setTableSettings] = useState(() => readInitialTableSettings());
  useSetting("tables", setTableSettings, {
    tableLabelText: "",
    showAreas: true,
  });
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    enableToasts: true,
  });
  useSetting("notifications", setNotificationSettings, {
    enabled: true,
    enableToasts: true,
  });
  const [openOrdersById, setOpenOrdersById] = useState(() => readInitialOpenOrdersById());
  const [kitchenOpenOrdersLoading, setKitchenOpenOrdersLoading] = useState(false);
  const [productPrepById, setProductPrepById] = useState({});
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const packetFetchRef = useRef({ requestId: 0, controller: null });
  const packetCountFetchRef = useRef({ requestId: 0, controller: null });
  const kitchenFetchRef = useRef({ requestId: 0, controller: null });
  const { loading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const { customerCalls, acknowledgeCustomerCall, resolveCustomerCall } = useNotifications();
  // compute permissions once at top level (avoid calling hooks inside loops)
  const canSeeTablesTab = useHasPermission("tables");
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
  const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone-orders");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");
const [activeArea, setActiveArea] = useState("ALL");
  const {
    ordersByTable: ordersByTableRaw,
    setOrders,
    reservationsToday,
    setReservationsToday,
    refreshOrders: fetchOrders,
    didInitialOrdersLoadRef,
  } = useTableOrdersData({ activeTab, productPrepById });

  const isStressModeActive = PERF_DEBUG_ENABLED && useStressData && activeTab === "tables" && !!stressDataset;
  const effectiveTableConfigs = isStressModeActive ? stressDataset.tableConfigs : tableConfigs;
  const effectiveOrdersByTableRaw = isStressModeActive
    ? stressDataset.ordersByTableRaw
    : ordersByTableRaw;
  const effectiveReservationsToday = isStressModeActive
    ? stressDataset.reservationsToday
    : reservationsToday;
  const effectiveProductPrepById = isStressModeActive
    ? stressDataset.productPrepById
    : productPrepById;

  const handleLoadStressData = useCallback(() => {
    const generated = generateTableOverviewStressData(DEFAULT_STRESS_CONFIG);
    setStressDataset(generated);
    setUseStressData(true);
    markPerfTrace("stress-data-loaded", generated?.stats || {});
  }, []);

  const handleUnloadStressData = useCallback(() => {
    setUseStressData(false);
    markPerfTrace("stress-data-unloaded");
  }, []);

  const handleStressMutation = useCallback((action) => {
    setStressDataset((prev) => {
      if (!prev) return prev;
      const next = mutateStressDataByAction(prev, action);
      markPerfTrace("stress-data-mutated", {
        action,
        orders: next?.stats?.openOrders ?? 0,
      });
      return next;
    });
  }, []);

  // Avoid tab flicker while auth/permissions are still loading by caching the last allowed tabs
  const lastPermissionsRef = useRef({
    tables: true,
    kitchen: true,
    history: true,
    packet: true,
    phone: true,
    register: true,
    takeaway: true,
  });

  const effectivePermissions = React.useMemo(() => {
    if (authLoading) return lastPermissionsRef.current;
    const next = {
      tables: canSeeTablesTab,
      kitchen: canSeeKitchenTab,
      history: canSeeHistoryTab,
      packet: canSeePacketTab,
      phone: canSeePhoneTab,
      register: canSeeRegisterTab,
      takeaway: canSeeTakeawayTab,
    };
    lastPermissionsRef.current = next;
    return next;
  }, [
    authLoading,
    canSeeTablesTab,
    canSeeKitchenTab,
    canSeeHistoryTab,
    canSeePacketTab,
    canSeePhoneTab,
    canSeeRegisterTab,
    canSeeTakeawayTab,
  ]);

  const [packetOrdersCount, setPacketOrdersCount] = useState(0);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const data = await secureFetch("/products");
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : data?.product
        ? [data.product]
        : [];
      const next = {};
      for (const p of list) {
        const id = Number(p?.id);
        const prep = parseFloat(p?.preparation_time ?? p?.prep_time ?? p?.prepTime);
        if (!Number.isFinite(id) || !Number.isFinite(prep) || prep <= 0) continue;
        next[id] = prep;
      }
      if (mounted) setProductPrepById(next);
    } catch {
      if (mounted) setProductPrepById({});
    }
  })();
  return () => {
    mounted = false;
  };
}, []);

const handleCloseTable = async (orderOrId) => {
  const order = orderOrId && typeof orderOrId === "object" ? orderOrId : null;
  const orderId = order?.id ?? orderOrId;
  const normalizedStatus = normalizeOrderStatus(order?.status);
  const hasExplicitReservationState =
    normalizedStatus === "reserved" ||
    String(order?.order_type || "").trim().toLowerCase() === "reservation";
  const normalizedOrderId = Number(orderId);
  const normalizedTableNumber = Number(order?.table_number ?? order?.tableNumber);
  const hasReservationFromList = (Array.isArray(effectiveReservationsToday) ? effectiveReservationsToday : []).some(
    (reservation) => {
      const reservationStatus = normalizeOrderStatus(reservation?.status);
      if (["closed", "cancelled", "canceled"].includes(reservationStatus)) return false;

      const reservationOrderId = Number(reservation?.order_id ?? reservation?.id);
      if (
        Number.isFinite(normalizedOrderId) &&
        Number.isFinite(reservationOrderId) &&
        reservationOrderId === normalizedOrderId
      ) {
        return true;
      }

      const reservationTableNumber = Number(
        reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
      );
      if (
        Number.isFinite(normalizedTableNumber) &&
        Number.isFinite(reservationTableNumber) &&
        reservationTableNumber === normalizedTableNumber
      ) {
        return true;
      }
      return false;
    }
  );
  const hasActiveReservation = hasExplicitReservationState || hasReservationFromList;

  if (hasActiveReservation) {
    toast.warning(t("Delete reservation first before closing table"));
    return;
  }

  try {
    const items = await secureFetch(`/orders/${orderId}/items`);
    if (!Array.isArray(items)) {
      toast.error("Failed to verify kitchen items");
      return;
    }

    // ✅ Fetch current kitchen exclusion settings (same as TransactionScreen)
    const { excludedItems = [], excludedCategories = [] } =
      (await secureFetch("kitchen/compile-settings")) || {};

    // ✅ Allow closing if all items are delivered OR excluded
    const allDeliveredOrExcluded = items.every(
      (i) =>
        i.kitchen_status === "delivered" ||
        !i.kitchen_status ||
        excludedItems.includes(i.product_id) ||
        excludedCategories.includes(i.category)
    );

    if (!allDeliveredOrExcluded) {
      toast.warning(`⚠️ ${t("Cannot close: some kitchen items not yet delivered!")}`, {
        style: { background: "#dc2626", color: "#fff" }, // red-600
      });
      return;
    }

    // ✅ Proceed to close
    await secureFetch(`/orders/${orderId}/close`, { method: "POST" });
    const notificationsEnabled = notificationSettings?.enabled !== false;
    const toastPopupsEnabled = notificationSettings?.enableToasts ?? true;
    if (notificationsEnabled && toastPopupsEnabled) {
      toast.success("✅ Table closed successfully!");
    }

    // Reset guest count ("seats") for the table once it's closed.
    const tableNumber = Number(order?.table_number);
    if (Number.isFinite(tableNumber)) {
      upsertTableConfigLocal(tableNumber, { guests: null });
      try {
        await secureFetch(`/tables/${tableNumber}`, {
          method: "PATCH",
          body: JSON.stringify({ guests: null }),
        });
      } catch (err) {
        console.error("❌ Failed to reset table guests after close:", err);
      }
    }

    // optional: return to overview
    setTimeout(() => {
      fetchOrders();
    }, 800);
  } catch (err) {
    console.error("❌ Failed to close table:", err);
    toast.error("Failed to close table");
  }
};

const handleDeleteReservation = useCallback(
  async (table, reservationInfo) => {
    const tableNumber = Number(table?.tableNumber ?? table?.order?.table_number ?? table?.table_number);
    const orderId = Number(table?.order?.id);
    const reservationId = Number(
      reservationInfo?.id ?? table?.order?.reservation?.id ?? table?.reservationFallback?.id
    );

    if (!Number.isFinite(orderId) && !Number.isFinite(reservationId)) {
      toast.warning(t("Reservation record not found"));
      return;
    }

    const ok = window.confirm(t("Delete this reservation?"));
    if (!ok) return;

    try {
      const response = Number.isFinite(orderId)
        ? await secureFetch(`/orders/${orderId}/reservations`, { method: "DELETE" })
        : await secureFetch(`/orders/reservations/${reservationId}`, { method: "DELETE" });

      const updatedOrder = response?.order && typeof response.order === "object" ? response.order : null;
      const normalizedUpdatedStatus = String(updatedOrder?.status || "").toLowerCase();

      setOrders((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        const next = [];
        for (const row of prevArr) {
          const rowTableNumber = Number(
            row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
          );
          if (!Number.isFinite(tableNumber) || rowTableNumber !== tableNumber) {
            next.push(row);
            continue;
          }

          if (normalizedUpdatedStatus === "closed") {
            continue;
          }

          next.push({
            ...row,
            ...(updatedOrder || {}),
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
            status:
              updatedOrder?.status ??
              (String(row?.status || "").toLowerCase() === "reserved" ? "confirmed" : row?.status),
            order_type:
              ((updatedOrder?.order_type ?? row?.order_type) === "reservation" &&
              String(
                updatedOrder?.status ??
                  (String(row?.status || "").toLowerCase() === "reserved"
                    ? "confirmed"
                    : row?.status)
              ).toLowerCase() !== "reserved")
                ? "table"
                : updatedOrder?.order_type ?? row?.order_type,
          });
        }
        return next.sort((a, b) => Number(a?.table_number) - Number(b?.table_number));
      });
      setReservationsToday((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.filter((row) => {
          const rowTableNumber = Number(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          if (Number.isFinite(tableNumber) && rowTableNumber === tableNumber) return false;
          if (Number.isFinite(reservationId) && rowReservationId === reservationId) return false;
          if (Number.isFinite(orderId) && rowOrderId === orderId) return false;
          return true;
        });
      });

      if (Number.isFinite(tableNumber)) {
        setTableConfigs((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const next = prevArr.map((cfg) =>
            Number(cfg?.number) === tableNumber ? { ...cfg, guests: null } : cfg
          );
          try {
            localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(next));
            localStorage.setItem(getTableCountCacheKey(), String(next.length));
          } catch (cacheErr) {
            void cacheErr;
          }
          return next;
        });
        try {
          await secureFetch(`/tables/${tableNumber}`, {
            method: "PATCH",
            body: JSON.stringify({ guests: null }),
          });
        } catch (guestResetErr) {
          console.error("❌ Failed to reset table guests after deleting reservation:", guestResetErr);
        }
      }

      toast.success(t("Reservation deleted"));
      fetchOrders({ skipHydration: true });
      setTimeout(() => fetchOrders(), 350);
    } catch (err) {
      console.error("❌ Failed to delete reservation:", err);
      toast.error(t("Failed to delete reservation"));
    }
  },
  [fetchOrders, setOrders, setReservationsToday, t]
);

  const visibleTabs = React.useMemo(() => {
    return TAB_LIST.filter((tab) => {
      if (tab.id === "takeaway") return effectivePermissions.takeaway;
      if (tab.id === "tables") return effectivePermissions.tables;
      if (tab.id === "kitchen") return effectivePermissions.kitchen;
      if (tab.id === "history") return effectivePermissions.history;
      if (tab.id === "packet") return effectivePermissions.packet;
      if (tab.id === "phone") return effectivePermissions.phone;
      if (tab.id === "register") return effectivePermissions.register;
      return true;
    });
  }, [effectivePermissions]);

  const handleTabSelect = useCallback(
    (tabId, options = {}) => {
      if (!tabId) return;
      const basePath = "/tableoverview";
      const replace = options?.replace === true;
      const params = new window.URLSearchParams(location.search);
      params.set("tab", tabId);
      navigate(`${basePath}?${params.toString()}`, { replace });
    },
    [location.search, navigate]
  );

  useEffect(() => {
    if (!location.pathname.includes("tableoverview")) return;
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      handleTabSelect(visibleTabs[0].id, { replace: true });
    }
  }, [visibleTabs, activeTab, handleTabSelect, location.pathname]);




  useEffect(() => {
    setShowPhoneOrderModal(activeTab === "phone");
    if (activeTab === "register") setShowRegisterModal(true);
  }, [activeTab]);

useEffect(() => () => setHeader({}), [setHeader]);

const getRestaurantIdForBatch = useCallback(() => {
  try {
    if (typeof window === "undefined") return "";
    return String(window?.localStorage?.getItem("restaurant_id") || "").trim();
  } catch {
    return "";
  }
}, []);

const normalizeOpenOrderItem = useCallback((item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    discount_type: item.discount_type || item.discountType || null,
    discount_value:
      item.discount_value != null
        ? parseFloat(item.discount_value)
        : item.discountValue != null
        ? parseFloat(item.discountValue)
        : 0,
  };
}, []);

const normalizeOpenOrder = useCallback(
  (order) => {
    if (!order || typeof order !== "object") return null;
    const { receipt_methods, receiptMethods: receiptMethodsRaw, ...rest } = order;
    const items = Array.isArray(order.items) ? order.items.map(normalizeOpenOrderItem) : [];
    const receiptMethods = Array.isArray(receiptMethodsRaw)
      ? receiptMethodsRaw
      : Array.isArray(receipt_methods)
      ? receipt_methods
      : [];
    const anyUnpaid = items.some((i) => !i?.paid_at && !i?.paid);
    const inferredPaid = !anyUnpaid;

    return {
      ...rest,
      status: normalizeOrderStatus(order?.status),
      items,
      receiptMethods,
      is_paid: order?.is_paid === true ? true : inferredPaid,
    };
  },
  [normalizeOpenOrderItem]
);

const startLatestRequest = useCallback((ref) => {
  if (ref.current?.controller) {
    ref.current.controller.abort();
  }
  const nextId = Number(ref.current?.requestId || 0) + 1;
  const controller = new AbortController();
  ref.current = { requestId: nextId, controller };
  return { requestId: nextId, controller };
}, []);

const isLatestRequest = useCallback(
  (ref, requestId) => Number(ref.current?.requestId || 0) === Number(requestId),
  []
);

const upsertOpenOrdersForMode = useCallback(
  (mode, nextOrders) => {
    const modeTypes = OPEN_ORDER_TYPES[mode] || OPEN_ORDER_TYPES.kitchen;
    setOpenOrdersById((prev) => {
      const next = { ...(prev || {}) };

      Object.keys(next).forEach((idKey) => {
        const prevType = String(next[idKey]?.order_type || "")
          .trim()
          .toLowerCase();
        if (modeTypes.includes(prevType)) delete next[idKey];
      });

      (Array.isArray(nextOrders) ? nextOrders : []).forEach((order) => {
        const idNum = Number(order?.id);
        if (!Number.isFinite(idNum)) return;
        const nextType = String(order?.order_type || "")
          .trim()
          .toLowerCase();
        if (!modeTypes.includes(nextType)) return;
        next[String(idNum)] = order;
      });

      return next;
    });
    writeOpenOrdersCache(mode, Array.isArray(nextOrders) ? nextOrders : []);
  },
  []
);

const fetchOpenOrdersBatch = useCallback(
  async (mode, signal) => {
    const params = new window.URLSearchParams();
    params.set("mode", mode || "both");
    const restaurantId = getRestaurantIdForBatch();
    if (restaurantId) params.set("restaurant_id", restaurantId);

    const payload = await secureFetch(`/orders/open/with-items?${params.toString()}`, { signal });
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.orders) ? payload.orders : [];
    const normalized = rows
      .map(normalizeOpenOrder)
      .filter(Boolean);

    if (import.meta.env.DEV) {
      const totalItems = normalized.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=${mode} orders=${normalized.length} items=${totalItems} calls=1`
      );
    }

    return normalized;
  },
  [getRestaurantIdForBatch, normalizeOpenOrder]
);

const fetchPacketOrdersLegacy = useCallback(
  async (signal, options = {}) => {
    const { onPartial } = options;
    let calls = 0;
    const [packet, phone] = await Promise.all([
      secureFetch(`/orders?type=packet`, { signal }).then((res) => {
        calls += 1;
        return res;
      }),
      secureFetch(`/orders?type=phone`, { signal }).then((res) => {
        calls += 1;
        return res;
      }),
    ]);

    const packetArray = Array.isArray(packet) ? packet : [];
    const phoneArray = Array.isArray(phone) ? phone : [];
    const rows = [...packetArray, ...phoneArray].filter((o) => {
      const status = normalizeOrderStatus(o?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      return true;
    });

    const fastRows = rows
      .map((order) => normalizeOpenOrder({ ...order, items: Array.isArray(order?.items) ? order.items : [] }))
      .filter(Boolean);
    if (typeof onPartial === "function") {
      onPartial(fastRows);
    }

    const runWithConcurrency = async (arr, limit, task) => {
      const list = Array.isArray(arr) ? arr : [];
      const count = Math.max(1, Math.min(limit, list.length || 1));
      const results = new Array(list.length);
      let idx = 0;
      await Promise.all(
        Array.from({ length: count }, async () => {
          while (idx < list.length) {
            const current = idx++;
            try {
              results[current] = await task(list[current]);
            } catch (err) {
              if (isAbortError(err)) throw err;
              console.warn("⚠️ Packet fallback fetch failed for order:", list[current]?.id, err);
              results[current] = null;
            }
          }
        })
      );
      return results.filter(Boolean);
    };

    const ordersWithItems = await runWithConcurrency(rows, 6, async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`, { signal });
        calls += 1;
        const items = Array.isArray(itemsRaw) ? itemsRaw : [];
        let receiptMethods = [];
        if (order.receipt_id) {
          try {
            const methods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`, { signal });
            calls += 1;
            receiptMethods = Array.isArray(methods) ? methods : [];
          } catch (err) {
            if (!isAbortError(err)) {
              console.warn("⚠️ Failed to fetch receipt methods for order", order.id, err);
            }
          }
        }
        return normalizeOpenOrder({ ...order, items, receiptMethods });
      });

    if (import.meta.env.DEV) {
      const totalItems = ordersWithItems.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=packet-legacy orders=${ordersWithItems.length} items=${totalItems} calls=${calls}`
      );
    }

    return ordersWithItems.filter(Boolean);
  },
  [normalizeOpenOrder]
);

const fetchKitchenOpenOrdersLegacy = useCallback(
  async (signal) => {
    let calls = 0;
    const data = await secureFetch("/orders", { signal });
    calls += 1;
    const list = Array.isArray(data) ? data : [];

    const openOrders = list.filter((o) => {
      const status = normalizeOrderStatus(o?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(o?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.kitchen.includes(type);
    });

    const ordersWithItems = await Promise.all(
      openOrders.map(async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`, { signal });
        calls += 1;
        const items = Array.isArray(itemsRaw) ? itemsRaw : [];
        return normalizeOpenOrder({ ...order, items });
      })
    );

    if (import.meta.env.DEV) {
      const totalItems = ordersWithItems.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=kitchen-legacy orders=${ordersWithItems.length} items=${totalItems} calls=${calls}`
      );
    }

    return ordersWithItems.filter(Boolean);
  },
  [normalizeOpenOrder]
);

const fetchPacketOrders = useCallback(async () => {
  const { requestId, controller } = startLatestRequest(packetFetchRef);
  try {
    const batched = await fetchOpenOrdersBatch("packet", controller.signal);
    if (!isLatestRequest(packetFetchRef, requestId)) return;
    upsertOpenOrdersForMode("packet", batched);
    setPacketOrdersCount(batched.length);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackRows = await fetchPacketOrdersLegacy(controller.signal, {
        onPartial: (partialRows) => {
          if (!isLatestRequest(packetFetchRef, requestId)) return;
          upsertOpenOrdersForMode("packet", partialRows);
          setPacketOrdersCount(partialRows.length);
        },
      });
      if (!isLatestRequest(packetFetchRef, requestId)) return;
      upsertOpenOrdersForMode("packet", fallbackRows);
      setPacketOrdersCount(fallbackRows.length);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.error("❌ Fetch packet orders failed:", fallbackErr);
      toast.error(t("Could not load packet orders"));
    }
  }
}, [
  fetchOpenOrdersBatch,
  fetchPacketOrdersLegacy,
  isLatestRequest,
  startLatestRequest,
  t,
  upsertOpenOrdersForMode,
]);

const openOrdersList = React.useMemo(
  () => Object.values(openOrdersById || {}),
  [openOrdersById]
);

const packetOrders = React.useMemo(() => {
  return openOrdersList
    .filter((order) => {
      const status = normalizeOrderStatus(order?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(order?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.packet.includes(type);
    })
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));
}, [openOrdersList]);

const kitchenOpenOrders = React.useMemo(() => {
  return openOrdersList
    .filter((order) => {
      const status = normalizeOrderStatus(order?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(order?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.kitchen.includes(type);
    })
    .sort((a, b) => {
      const am = parseLooseDateToMs(a?.created_at);
      const bm = parseLooseDateToMs(b?.created_at);
      if (Number.isFinite(am) && Number.isFinite(bm)) return bm - am;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
}, [openOrdersList]);

const fetchPacketOrdersCountLegacy = useCallback(async (signal) => {
  const [packet, phone] = await Promise.all([
    secureFetch(`/orders?type=packet`, { signal }),
    secureFetch(`/orders?type=phone`, { signal }),
  ]);
  const packetArray = Array.isArray(packet) ? packet : [];
  const phoneArray = Array.isArray(phone) ? phone : [];
  return [...packetArray, ...phoneArray].filter((o) => {
    const status = normalizeOrderStatus(o?.status);
    if (status === "closed") return false;
    if (isOrderCancelledOrCanceled(status)) return false;
    return true;
  }).length;
}, []);

const fetchPacketOrdersCount = useCallback(async () => {
  if (!canSeePacketTab) return;
  const { requestId, controller } = startLatestRequest(packetCountFetchRef);
  try {
    const batched = await fetchOpenOrdersBatch("packet", controller.signal);
    if (!isLatestRequest(packetCountFetchRef, requestId)) return;
    setPacketOrdersCount(batched.length);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackCount = await fetchPacketOrdersCountLegacy(controller.signal);
      if (!isLatestRequest(packetCountFetchRef, requestId)) return;
      setPacketOrdersCount(fallbackCount);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.warn("⚠️ Failed to fetch packet orders count:", fallbackErr);
      setPacketOrdersCount(0);
    }
  }
}, [
  canSeePacketTab,
  fetchOpenOrdersBatch,
  fetchPacketOrdersCountLegacy,
  isLatestRequest,
  startLatestRequest,
]);

useEffect(() => {
  fetchPacketOrdersCount();
}, [fetchPacketOrdersCount]);

useEffect(() => {
  setPacketOrdersCount(Array.isArray(packetOrders) ? packetOrders.length : 0);
}, [packetOrders]);

useEffect(() => {
  return () => {
    packetFetchRef.current?.controller?.abort?.();
    packetCountFetchRef.current?.controller?.abort?.();
    kitchenFetchRef.current?.controller?.abort?.();
  };
}, []);

const [takeawayOrders, setTakeawayOrders] = useState([]);

const fetchTakeawayOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/orders?type=takeaway");
    const filtered = Array.isArray(data)
      ? data.filter((o) => {
          const status = normalizeOrderStatus(o?.status);
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          return true;
        })
      : [];

    // Fetch items and receipt methods for accurate total display (like tables/packet)
    const ordersWithItems = await Promise.all(
      filtered.map(async (order) => {
        try {
          let items = (await secureFetch(`/orders/${order.id}/items`)).map((item) => ({
            ...item,
            discount_type: item.discount_type || item.discountType || null,
            discount_value:
              item.discount_value != null
                ? parseFloat(item.discount_value)
                : item.discountValue != null
                ? parseFloat(item.discountValue)
                : 0,
          }));

          // ✅ Fallback for online-paid orders missing item paid flags
          // Only do this if the backend doesn't provide per-item paid markers at all.
          if (isOrderPaid(order)) {
            const hasAnyPaidMarker = items.some(
              (i) => i?.paid_at != null || typeof i?.paid === "boolean"
            );
            if (!hasAnyPaidMarker) {
              items = items.map((i) => ({ ...i, paid: true }));
            }
          }

          let receiptMethods = [];
          if (order.receipt_id) {
            try {
              receiptMethods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`);
            } catch (e) {
              console.warn("⚠️ Failed to fetch receipt methods for takeaway order", order.id, e);
            }
          }

          return { ...order, items, receiptMethods };
        } catch (e) {
          console.warn("⚠️ Failed to enrich takeaway order", order.id, e);
          return { ...order, items: [], receiptMethods: [] };
        }
      })
    );

    setTakeawayOrders(ordersWithItems);
  } catch (err) {
    console.error("❌ Fetch takeaway orders failed:", err);
    toast.error("Could not load takeaway orders");
  }
}, []);

/* moved below loadDataForTab to avoid TDZ */












// (location + handleTabSelect declared above)





useEffect(() => {
  const today = formatLocalYmd(new Date());
  setFromDate(today);
  setToDate(today);
}, []);

  useEffect(() => {
    if (tableSettings.showAreas !== false) return;
    if (activeArea !== "ALL") setActiveArea("ALL");
  }, [tableSettings.showAreas, activeArea]);

  // If the app stays open across midnight, refresh tables so reservations appear on their day.
  useEffect(() => {
    if (isStressModeActive) return;
    if (activeTab !== "tables") return;
    let timeoutId = null;

    const scheduleNext = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0);
      const delayMs = Math.max(1000, nextMidnight.getTime() - Date.now() + 1000);

      timeoutId = window.setTimeout(() => {
        const dayKey = formatLocalYmd(new Date());
        if (lastDayKeyRef.current !== dayKey) {
          lastDayKeyRef.current = dayKey;
          fetchOrders();
        }
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeTab, fetchOrders, isStressModeActive]);

const fetchKitchenOpenOrders = useCallback(async () => {
  const { requestId, controller } = startLatestRequest(kitchenFetchRef);
  try {
    setKitchenOpenOrdersLoading(true);
    const batched = await fetchOpenOrdersBatch("kitchen", controller.signal);
    if (!isLatestRequest(kitchenFetchRef, requestId)) return;
    upsertOpenOrdersForMode("kitchen", batched);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackRows = await fetchKitchenOpenOrdersLegacy(controller.signal);
      if (!isLatestRequest(kitchenFetchRef, requestId)) return;
      upsertOpenOrdersForMode("kitchen", fallbackRows);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.error("❌ Fetch kitchen open orders failed:", fallbackErr);
    }
  } finally {
    if (isLatestRequest(kitchenFetchRef, requestId)) {
      setKitchenOpenOrdersLoading(false);
    }
  }
}, [
  fetchKitchenOpenOrdersLegacy,
  fetchOpenOrdersBatch,
  isLatestRequest,
  startLatestRequest,
  upsertOpenOrdersForMode,
]);

// Fetch table configurations when viewing tables (inside component)
const fetchTableConfigs = useCallback(async () => {
  try {
    const rows = await secureFetch("/tables");
    const arr = Array.isArray(rows) ? rows : [];
    const active = arr.filter((t) => t.active !== false);
    setTableConfigs((prev) => {
      const merged = mergeTableConfigsByNumber(prev, active);
      try {
        localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(merged));
        localStorage.setItem(getTableCountCacheKey(), String(merged.length));
      } catch (cacheErr) {
        void cacheErr;
      }
      return merged;
    });
  } catch {
    // Keep any cached/previous configs so the grid doesn't blink on transient errors.
  }
}, []);

const upsertTableConfigLocal = useCallback((tableNumber, patch) => {
  const normalizedNumber = Number(tableNumber);
  if (!Number.isFinite(normalizedNumber)) return;

  setTableConfigs((prev) => {
    const prevArr = Array.isArray(prev) ? prev : [];
    let found = false;
    const next = prevArr.map((cfg) => {
      if (Number(cfg?.number) !== normalizedNumber) return cfg;
      found = true;
      return { ...cfg, ...patch };
    });

    const resolved = found
      ? next
      : mergeTableConfigsByNumber(prevArr, [{ number: normalizedNumber, active: true, ...patch }]);

    try {
      localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(resolved));
      localStorage.setItem(getTableCountCacheKey(), String(resolved.length));
    } catch (cacheErr) {
      void cacheErr;
    }

    return resolved;
  });
}, []);

const handleGuestsChange = useCallback(
  async (tableNumber, nextGuests) => {
    upsertTableConfigLocal(tableNumber, { guests: nextGuests });
    try {
      await secureFetch(`/tables/${tableNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ guests: nextGuests }),
      });
    } catch (err) {
      console.error("❌ Failed to update table guests:", err);
      toast.error(t("Failed to update table"));
      fetchTableConfigs();
    }
  },
  [fetchTableConfigs, upsertTableConfigLocal, t]
);


  const loadDataForTab = useCallback(
    (tab, options = {}) => {
      const fastTablesOnly = options?.fastTablesOnly === true;
      if (tab === "tables") {
        fetchOrders(fastTablesOnly ? { skipHydration: true } : undefined);
        if (!fastTablesOnly) {
          fetchTableConfigs();
        }
        return;
      }
      if (tab === "kitchen" || tab === "open") {
        fetchKitchenOpenOrders();
        return;
      }
      if (tab === "history") {
        return;
      }
      if (tab === "packet") {
        fetchPacketOrders();
        return;
      }
      if (tab === "takeaway") {
        fetchTakeawayOrders();
      }
    },
    [
      fetchKitchenOpenOrders,
      fetchOrders,
      fetchPacketOrders,
      fetchTableConfigs,
      fetchTakeawayOrders,
    ]
  );

// now safe to reference loadDataForTab
useEffect(() => {
  if (isStressModeActive) return undefined;
  if (!window) return;
  let rafId = null;
  let bgRefetchTimeoutId = null;
  let bgRefetchIdleId = null;
  // ⚡ Instant refresh without animation frame delay for local events
  const instantRefetch = ({ fastTablesOnly = false } = {}) => {
    if (activeTab !== "packet") fetchPacketOrdersCount();
    if (activeTab === "tables") {
      fetchOrders(fastTablesOnly ? { skipHydration: true } : undefined);
      return;
    }
    loadDataForTab(activeTab, { fastTablesOnly });
  };

  const scheduleBackgroundRefetch = () => {
    markPerfTrace("tableoverview-bg-refetch-scheduled", { activeTab });
    if (bgRefetchTimeoutId) window.clearTimeout(bgRefetchTimeoutId);
    if (bgRefetchIdleId && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(bgRefetchIdleId);
      bgRefetchIdleId = null;
    }

    const run = () => {
      bgRefetchTimeoutId = null;
      bgRefetchIdleId = null;
      markPerfTrace("tableoverview-bg-refetch-run", { activeTab });
      instantRefetch();
    };

    if (typeof window.requestIdleCallback === "function") {
      bgRefetchIdleId = window.requestIdleCallback(run, { timeout: 1200 });
      return;
    }
    bgRefetchTimeoutId = window.setTimeout(run, 250);
  };

  const refetch = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      instantRefetch({ fastTablesOnly: true });
      if (activeTab === "tables") {
        // Follow fast socket refresh with one coalesced full refresh for item-level reconciliation.
        scheduleBackgroundRefetch();
      }
    });
  };

  const applyLocalOrderStatusPatch = (detail) => {
    if (!detail || typeof detail !== "object") return false;
    if (detail.kind !== "tableoverview_order_status") return false;

    const tableNumber = Number(detail.table_number);
    if (!Number.isFinite(tableNumber)) return false;

    const nextStatus = String(detail.status || "").toLowerCase();
    const markItemsPaid = (items) => {
      if (!Array.isArray(items)) return [];
      const paidAt = new Date().toISOString();
      return items.map((item) => ({
        ...item,
        paid: true,
        paid_at: item?.paid_at ?? item?.paidAt ?? paidAt,
      }));
    };
    const markSubordersPaid = (suborders) => {
      if (!Array.isArray(suborders)) return [];
      return suborders.map((suborder) => ({
        ...suborder,
        items: markItemsPaid(suborder?.items),
      }));
    };
    const patchStartedAt = performance.now();
    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];

      if (nextStatus === "closed") {
        const next = prevArr.filter((o) => Number(o?.table_number) !== tableNumber);
        return next;
      }

      let found = false;
      const orderId =
        detail.order_id === null || detail.order_id === undefined
          ? null
          : Number(detail.order_id);

    const incomingPatch = detail.patch && typeof detail.patch === "object" ? detail.patch : null;
    const patch =
      nextStatus === "paid"
        ? {
            status: "paid",
            payment_status: "paid",
            is_paid: true,
            total: 0,
            ...(incomingPatch || null),
          }
          : {
              status: detail.status,
              ...(incomingPatch || null),
            };

      const next = prevArr.map((o) => {
        if (Number(o?.table_number) !== tableNumber) return o;
        found = true;
        const paidItemsSource =
          nextStatus === "paid"
            ? Array.isArray(incomingPatch?.items)
              ? incomingPatch.items
              : o?.items
            : null;
        const paidSubordersSource =
          nextStatus === "paid"
            ? Array.isArray(incomingPatch?.suborders)
              ? incomingPatch.suborders
              : o?.suborders
            : null;
        return {
          ...o,
          ...(orderId != null && Number.isFinite(orderId) ? { id: orderId } : null),
          ...patch,
          ...(nextStatus === "paid"
            ? {
                items: markItemsPaid(paidItemsSource),
                suborders: markSubordersPaid(paidSubordersSource),
              }
            : null),
          table_number: tableNumber,
        };
      });

      if (!found) {
        next.push({
          ...(orderId != null && Number.isFinite(orderId) ? { id: orderId } : null),
          table_number: tableNumber,
          ...patch,
          ...(nextStatus === "paid"
            ? {
                items: markItemsPaid(incomingPatch?.items),
                suborders: markSubordersPaid(incomingPatch?.suborders),
              }
            : null),
        });
      }

      next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
      return next;
    });

    markPerfTrace("tableoverview-local-status-patch", {
      tableNumber,
      status: nextStatus,
      durationMs: Number((performance.now() - patchStartedAt).toFixed(2)),
    });

    return true;
  };

  const patchTableOrderLocally = ({ status, tableNumber, orderId, patch }) => {
    const nextStatus = String(status || "").toLowerCase();
    const markItemsPaid = (items) => {
      if (!Array.isArray(items)) return [];
      const paidAt = new Date().toISOString();
      return items.map((item) => ({
        ...item,
        paid: true,
        paid_at: item?.paid_at ?? item?.paidAt ?? paidAt,
      }));
    };
    const markSubordersPaid = (suborders) => {
      if (!Array.isArray(suborders)) return [];
      return suborders.map((suborder) => ({
        ...suborder,
        items: markItemsPaid(suborder?.items),
      }));
    };
    const normalizedTableNumber = Number(tableNumber);
    const hasTableNumber = Number.isFinite(normalizedTableNumber);
    const normalizedOrderId = Number(orderId);
    const hasOrderId = Number.isFinite(normalizedOrderId);
    if (!hasTableNumber && !hasOrderId) return false;

    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];

      if (nextStatus === "closed") {
        if (hasTableNumber) {
          return prevArr.filter((o) => Number(o?.table_number) !== normalizedTableNumber);
        }
        return prevArr.filter((o) => Number(o?.id) !== normalizedOrderId);
      }

      const basePatch =
        nextStatus === "paid"
          ? {
              status: "paid",
              payment_status: "paid",
              is_paid: true,
              total: 0,
            }
          : { status: status };

      let found = false;
      const next = prevArr.map((o) => {
        const sameTable = hasTableNumber && Number(o?.table_number) === normalizedTableNumber;
        const sameOrder = hasOrderId && Number(o?.id) === normalizedOrderId;
        if (!sameTable && !sameOrder) return o;
        found = true;
        const patchObj = patch && typeof patch === "object" ? patch : null;
        const paidItemsSource =
          nextStatus === "paid"
            ? Array.isArray(patchObj?.items)
              ? patchObj.items
              : o?.items
            : null;
        const paidSubordersSource =
          nextStatus === "paid"
            ? Array.isArray(patchObj?.suborders)
              ? patchObj.suborders
              : o?.suborders
            : null;
        return {
          ...o,
          ...(hasTableNumber ? { table_number: normalizedTableNumber } : null),
          ...(hasOrderId ? { id: normalizedOrderId } : null),
          ...basePatch,
          ...(patchObj || null),
          ...(nextStatus === "paid"
            ? {
                status: "paid",
                payment_status: "paid",
                is_paid: true,
                total: 0,
                items: markItemsPaid(paidItemsSource),
                suborders: markSubordersPaid(paidSubordersSource),
              }
            : null),
        };
      });

      if (!found && hasTableNumber) {
        const patchObj = patch && typeof patch === "object" ? patch : null;
        next.push({
          ...(hasOrderId ? { id: normalizedOrderId } : null),
          table_number: normalizedTableNumber,
          ...basePatch,
          ...(patchObj || null),
          ...(nextStatus === "paid"
            ? {
                status: "paid",
                payment_status: "paid",
                is_paid: true,
                total: 0,
                items: markItemsPaid(patchObj?.items),
                suborders: markSubordersPaid(patchObj?.suborders),
              }
            : null),
        });
      }

      next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
      return next;
    });

    return true;
  };

  const onOrderConfirmedSocket = (payload) => {
    if (activeTab !== "tables") return;
    const order = payload?.order && typeof payload.order === "object" ? payload.order : payload;
    const tableNumber = Number(order?.table_number ?? payload?.table_number);
    const orderId = Number(order?.id ?? payload?.orderId ?? payload?.order_id);
    const total = Number(order?.total);
    const didPatch = patchTableOrderLocally({
      status: "confirmed",
      tableNumber,
      orderId,
      patch: {
        ...(Number.isFinite(total) ? { total } : null),
        ...(order?.order_type ? { order_type: order.order_type } : null),
      },
    });
    if (didPatch) scheduleBackgroundRefetch();
  };

  const onPaymentMadeSocket = (payload) => {
    if (activeTab !== "tables") return;
    const order = payload?.order && typeof payload.order === "object" ? payload.order : payload;
    const tableNumber = Number(order?.table_number ?? payload?.table_number);
    const orderId = Number(order?.id ?? payload?.orderId ?? payload?.order_id);
    const didPatch = patchTableOrderLocally({
      status: "paid",
      tableNumber,
      orderId,
      patch: { is_paid: true, payment_status: "paid" },
    });
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    // Fallback when payload shape is unexpected: still force a fast local refresh.
    refetch();
  };

  const onOrderCancelledSocket = (payload) => {
    if (activeTab !== "tables") return;
    const tableNumber = Number(payload?.table_number ?? payload?.order?.table_number);
    const orderId = Number(payload?.orderId ?? payload?.order_id ?? payload?.order?.id);
    const didPatch = patchTableOrderLocally({
      status: "cancelled",
      tableNumber,
      orderId,
      patch: { total: 0 },
    });
    if (didPatch) scheduleBackgroundRefetch();
  };

  const onOrderClosedSocket = (payload) => {
    const tableNumber = Number(payload?.table_number);
    const orderId = Number(payload?.orderId ?? payload?.order_id);
    const didPatch = patchTableOrderLocally({
      status: "closed",
      tableNumber,
      orderId,
    });
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    refetch();
  };

  socket.on("orders_updated", refetch);
  // Some backend flows (e.g. closing empty orders) emit `order_closed` without `orders_updated`.
  socket.on("order_closed", onOrderClosedSocket);
  socket.on("order_confirmed", onOrderConfirmedSocket);
  socket.on("payment_made", onPaymentMadeSocket);
  socket.on("order_cancelled", onOrderCancelledSocket);
  // ⚡ Immediate local refreshes (dispatched from TransactionScreen)
  const handleLocalRefresh = (event) => {
    const didPatch = applyLocalOrderStatusPatch(event?.detail);
    if (didPatch) {
      // Patch makes the status/color instant; refetch in background to reconcile.
      scheduleBackgroundRefetch();
      return;
    }
    instantRefetch({ fastTablesOnly: true });
    if (activeTab === "tables") {
      scheduleBackgroundRefetch();
    }
  };
  window.addEventListener("beypro:orders-local-refresh", handleLocalRefresh);
  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (bgRefetchTimeoutId) window.clearTimeout(bgRefetchTimeoutId);
    if (bgRefetchIdleId && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(bgRefetchIdleId);
    }
    socket.off("orders_updated", refetch);
    socket.off("order_closed", onOrderClosedSocket);
    socket.off("order_confirmed", onOrderConfirmedSocket);
    socket.off("payment_made", onPaymentMadeSocket);
    socket.off("order_cancelled", onOrderCancelledSocket);
    window.removeEventListener("beypro:orders-local-refresh", handleLocalRefresh);
  };
}, [activeTab, loadDataForTab, fetchOrders, fetchPacketOrdersCount, isStressModeActive]);

useEffect(() => {
  if (isStressModeActive) return;
  loadDataForTab(activeTab);
}, [activeTab, loadDataForTab, isStressModeActive]);

useEffect(() => {
  const handler = () => fetchKitchenOpenOrders();
  if (window && typeof window.addEventListener === "function") {
    window.addEventListener("beypro:kitchen-orders-reload", handler);
  }
  return () => {
    if (window && typeof window.removeEventListener === "function") {
      window.removeEventListener("beypro:kitchen-orders-reload", handler);
    }
  };
}, [fetchKitchenOpenOrders]);

  // Ensure table configs load when Tables tab is active
  useEffect(() => {
    if (isStressModeActive) return;
    if (activeTab === "tables" && (Array.isArray(tableConfigs) ? tableConfigs.length === 0 : true)) {
      fetchTableConfigs();
    }
  }, [activeTab, tableConfigs.length, fetchTableConfigs, isStressModeActive]);


const ordersByTable = React.useMemo(
  () =>
    withPerfTimer("[perf] TableList ordersByTable selector", () => {
      const map = new Map();
      (effectiveOrdersByTableRaw instanceof Map ? effectiveOrdersByTableRaw : new Map()).forEach(
        (tableOrders, tableKey) => {
          const tableNumber = Number(tableKey);
          if (!Number.isFinite(tableNumber) || map.has(tableNumber)) return;
          const ordersForTable = Array.isArray(tableOrders) ? tableOrders : [];
          const visibleOrders = ordersForTable.filter(
            (order) => !isOrderCancelledOrCanceled(order?.status)
          );
          if (visibleOrders.length === 0) return;

          // Prefer reservation-like orders when multiple orders exist for one table.
          const reservedMatch = visibleOrders.find((order) => {
            const status = normalizeOrderStatus(order?.status);
            if (!hasReservationSignal(order)) return false;
            return status === "reserved" || order?.order_type === "reservation";
          });

          map.set(tableNumber, reservedMatch || visibleOrders[0]);
        }
      );
      return map;
    }),
  [effectiveOrdersByTableRaw]
);

const reservationsForModel = React.useMemo(() => {
  const byTable = new Map();

  (Array.isArray(effectiveReservationsToday) ? effectiveReservationsToday : []).forEach((reservation) => {
    const tableNumber = Number(
      reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
    );
    if (!Number.isFinite(tableNumber)) return;
    byTable.set(tableNumber, reservation);
  });

  (effectiveOrdersByTableRaw instanceof Map ? effectiveOrdersByTableRaw : new Map()).forEach(
    (tableOrders, tableKey) => {
      const tableNumber = Number(tableKey);
      if (!Number.isFinite(tableNumber)) return;

      const ordersForTable = Array.isArray(tableOrders) ? tableOrders : [];
      const reservationOrder = ordersForTable.find((order) => {
        const status = normalizeOrderStatus(order?.status);
        if (!hasReservationSignal(order)) return false;
        return status === "reserved" || order?.order_type === "reservation";
      });
      if (!reservationOrder) return;

      const synthesized = {
        id: reservationOrder?.reservation?.id ?? null,
        order_id: reservationOrder?.id ?? null,
        table_number: tableNumber,
        status: normalizeOrderStatus(reservationOrder?.status) || "reserved",
        order_type: reservationOrder?.order_type || "reservation",
        customer_name:
          reservationOrder?.customer_name ??
          reservationOrder?.customerName ??
          reservationOrder?.reservation?.customer_name ??
          reservationOrder?.reservation?.customerName ??
          "",
        customer_phone:
          reservationOrder?.customer_phone ??
          reservationOrder?.customerPhone ??
          reservationOrder?.reservation?.customer_phone ??
          reservationOrder?.reservation?.customerPhone ??
          "",
        reservation_date:
          reservationOrder?.reservation_date ??
          reservationOrder?.reservationDate ??
          reservationOrder?.reservation?.reservation_date ??
          reservationOrder?.reservation?.reservationDate ??
          null,
        reservation_time:
          reservationOrder?.reservation_time ??
          reservationOrder?.reservationTime ??
          reservationOrder?.reservation?.reservation_time ??
          reservationOrder?.reservation?.reservationTime ??
          null,
        reservation_clients:
          reservationOrder?.reservation_clients ??
          reservationOrder?.reservationClients ??
          reservationOrder?.reservation?.reservation_clients ??
          reservationOrder?.reservation?.reservationClients ??
          0,
        reservation_notes:
          reservationOrder?.reservation_notes ??
          reservationOrder?.reservationNotes ??
          reservationOrder?.reservation?.reservation_notes ??
          reservationOrder?.reservation?.reservationNotes ??
          "",
      };

      const existing = byTable.get(tableNumber);
      if (!existing) {
        byTable.set(tableNumber, synthesized);
        return;
      }

      byTable.set(tableNumber, {
        ...existing,
        table_number: existing?.table_number ?? existing?.tableNumber ?? tableNumber,
        status: normalizeOrderStatus(existing?.status) || synthesized.status,
        order_type: existing?.order_type || synthesized.order_type,
        reservation_date:
          existing?.reservation_date ?? existing?.reservationDate ?? synthesized.reservation_date,
        reservation_time:
          existing?.reservation_time ?? existing?.reservationTime ?? synthesized.reservation_time,
        reservation_clients:
          existing?.reservation_clients ??
          existing?.reservationClients ??
          synthesized.reservation_clients,
        reservation_notes:
          existing?.reservation_notes ?? existing?.reservationNotes ?? synthesized.reservation_notes,
        customer_name: existing?.customer_name ?? existing?.customerName ?? synthesized.customer_name,
        customer_phone:
          existing?.customer_phone ?? existing?.customerPhone ?? synthesized.customer_phone,
      });
    }
  );

  return Array.from(byTable.values());
}, [effectiveOrdersByTableRaw, effectiveReservationsToday]);

const { tables, groupedTables } = useTablesModel({
  tableConfigs: effectiveTableConfigs,
  ordersByTable,
  reservationsToday: reservationsForModel,
});

const freeTablesCount = React.useMemo(() => {
  if (!Array.isArray(tables)) return 0;
  return tables.filter((table) => isEffectivelyFreeOrder(table.order)).length;
}, [tables]);

useEffect(() => {
  const titlesByTab = {
    takeaway: t("Pre Order"),
    tables: t("Tables"),
    kitchen: t("All Orders"),
    history: t("History"),
    packet: t("Packet"),
    phone: t("Phone"),
    register: t("Register"),
  };
  const headerTitle = titlesByTab[activeTab] || t("Orders");
  setHeader((prev) => ({
    ...prev,
    title: headerTitle,
    subtitle: undefined,
    tableNav: null,
    tableStats: activeTab === "tables" ? { freeTables: freeTablesCount } : undefined,
  }));
}, [activeTab, t, setHeader, freeTablesCount]);



const handlePrintOrder = useCallback(async (orderId) => {
  if (!orderId) {
    toast.warn(t("No order selected to print"));
    return;
  }
  try {
    const printable = await fetchOrderWithItems(orderId);
    const ok = await printViaBridge("", printable);
    toast[ok ? "success" : "warn"](
      ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
    );
  } catch (err) {
    console.error("❌ Print failed:", err);
    toast.error(t("Failed to print receipt"));
  }
}, [t]);


const navigateToOrder = useCallback((order) => {
  if (!order) return;
  const tableNumber =
    order.table_number ?? order.tableNumber ?? order?.table_number;
  if (tableNumber !== null && tableNumber !== undefined && tableNumber !== "") {
    navigate(`/transaction/${tableNumber}`, { state: { order } });
    return;
  }
  navigate(`/transaction/phone/${order.id}`, { state: { order } });
}, [navigate]);

const handleTableClick = useCallback(async (table) => {
  // Keep register guard behavior in TableOverview while register internals live in feature module.
  try {
    const open = await checkRegisterOpen();
    if (!open) {
      toast.error("Register must be open to access tables!", {
        position: "top-center",
        autoClose: 2500,
      });
      setShowRegisterModal(true);
      return;
    }
  } catch {
    // Fail-open here and let TransactionScreen/useRegisterGuard enforce access.
  }

  const requireGuests = transactionSettings.requireGuestsBeforeOpen ?? true;
  const seatLimit = Number.isFinite(Number(table.seats)) ? Number(table.seats) : 0;
  const tableGuestsRaw =
    table?.guests === null || table?.guests === undefined ? null : Number(table.guests);
  const orderGuestsRaw =
    table?.order?.reservation_clients ??
    table?.order?.reservationClients ??
    table?.order?.reservation?.reservation_clients ??
    table?.order?.reservation?.reservationClients ??
    null;
  const reservationFallbackGuestsRaw =
    table?.reservationFallback?.reservation_clients ??
    table?.reservationFallback?.reservationClients ??
    null;
  const guestCandidates = [tableGuestsRaw, Number(orderGuestsRaw), Number(reservationFallbackGuestsRaw)];
  const resolvedGuests = guestCandidates.find((value) => Number.isFinite(value) && value > 0) ?? null;
  const guestSelection =
    Number.isFinite(resolvedGuests) && seatLimit > 0
      ? Math.min(Math.max(0, Math.trunc(resolvedGuests)), Math.trunc(seatLimit))
      : resolvedGuests;
  if (requireGuests && seatLimit > 0 && (!guestSelection || guestSelection <= 0)) {
    toast.warning(t("Please select number of seats before opening this table"), {
      style: { background: "#312E81", color: "#F8FAFC" },
    });
    return;
  }

  // 🔥 FIXED: treat cancelled or empty orders as FREE
  const isCancelledOrder = isOrderCancelledOrCanceled(table.order?.status);
  const hasExistingOrderId =
    table?.order?.id !== null &&
    table?.order?.id !== undefined &&
    String(table.order.id).trim() !== "";

  if (!table.order || isCancelledOrder) {
    // Navigate immediately with a stub order, then TransactionScreen will create/fetch in background.
    navigate(`/transaction/${table.tableNumber}`, {
      state: {
        order: {
          table_number: table.tableNumber,
          order_type: "table",
          status: "draft",
          total: 0,
          items: [],
        },
      },
    });
    return;
  }

  // If we already have a persisted order id, pass it immediately even while items hydrate.
  // This lets TransactionScreen show invoice/order number without waiting for table re-fetch.
  if (hasExistingOrderId) {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
    return;
  }

  if (Array.isArray(table.order.items) && table.order.items.length > 0) {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
    return;
  }

  navigate(`/transaction/${table.tableNumber}`, {
    state: {
      order: {
        table_number: table.tableNumber,
        order_type: "table",
        status: "draft",
        total: 0,
        items: [],
      },
    },
  });
}, [transactionSettings.requireGuestsBeforeOpen, t, navigate]);

  // Remove duplicate groupedByTable (already have ordersByTable memoized above)
  // const groupedByTable = orders.reduce(...) // ❌ REMOVED DUPLICATE

const areaKeys = React.useMemo(() => Object.keys(groupedTables), [groupedTables]);
const showAreaTabs = tableSettings.showAreas !== false && areaKeys.length > 1;

const formatAreaLabel = useCallback((area) => {
  const raw = area || "Main Hall";
  return t(raw, { defaultValue: raw });
}, [t]);
const tableLabelText = String(tableSettings.tableLabelText || "").trim() || t("Table");

const handlePrintOrderRef = useRef(handlePrintOrder);
const handleCloseTableRef = useRef(handleCloseTable);
const handleDeleteReservationRef = useRef(handleDeleteReservation);

useEffect(() => {
  handlePrintOrderRef.current = handlePrintOrder;
}, [handlePrintOrder]);

useEffect(() => {
  handleCloseTableRef.current = handleCloseTable;
}, [handleCloseTable]);

useEffect(() => {
  handleDeleteReservationRef.current = handleDeleteReservation;
}, [handleDeleteReservation]);

const stableHandlePrintOrder = useCallback((...args) => {
  return handlePrintOrderRef.current?.(...args);
}, []);

const stableHandleCloseTable = useCallback((...args) => {
  return handleCloseTableRef.current?.(...args);
}, []);

const stableHandleDeleteReservation = useCallback((...args) => {
  return handleDeleteReservationRef.current?.(...args);
}, []);

const handleAcknowledgeWaiterCall = useCallback(
  (tableNumber) => {
    acknowledgeCustomerCall?.(tableNumber);
  },
  [acknowledgeCustomerCall]
);

const handleResolveWaiterCall = useCallback(
  (tableNumber) => {
    resolveCustomerCall?.(tableNumber);
  },
  [resolveCustomerCall]
);

const tableCardProps = React.useMemo(
  () => ({
    tableLabelText,
    showAreas: tableSettings.showAreas !== false,
    formatAreaLabel,
    t,
    formatCurrency,
    handleTableClick,
    handlePrintOrder: stableHandlePrintOrder,
    handleGuestsChange,
    handleCloseTable: stableHandleCloseTable,
    handleDeleteReservation: stableHandleDeleteReservation,
    waiterCallsByTable: customerCalls || {},
    handleAcknowledgeWaiterCall,
    handleResolveWaiterCall,
  }),
  [
    tableLabelText,
    tableSettings.showAreas,
    formatAreaLabel,
    t,
    formatCurrency,
    handleTableClick,
    handleGuestsChange,
    stableHandlePrintOrder,
    stableHandleCloseTable,
    stableHandleDeleteReservation,
    customerCalls,
    handleAcknowledgeWaiterCall,
    handleResolveWaiterCall,
  ]
);

const totalSeats = React.useMemo(() => {
  return (Array.isArray(tables) ? tables : []).reduce((sum, table) => {
    const seats = Number(table?.seats);
    if (!Number.isFinite(seats) || seats <= 0) return sum;
    return sum + Math.trunc(seats);
  }, 0);
}, [tables]);

const totalGuests = React.useMemo(() => {
  return (Array.isArray(tables) ? tables : []).reduce((sum, table) => {
    const seats = Number(table?.seats);
    if (!Number.isFinite(seats) || seats <= 0) return sum;
    const guests = Number.isFinite(table?.guests) ? Math.trunc(Number(table.guests)) : 0;
    const clamped = Math.min(Math.max(0, guests), Math.trunc(seats));
    return sum + clamped;
  }, 0);
}, [tables]);

const kitchenReadyAtByOrderId = React.useMemo(() => {
  const map = new Map();
  (Array.isArray(kitchenOpenOrders) ? kitchenOpenOrders : []).forEach((order) => {
    map.set(order.id, getReadyAtLabel(order, productPrepById));
  });
  return map;
}, [kitchenOpenOrders, productPrepById]);

	
  return (
    <div className="min-h-screen bg-transparent px-0 pt-4 relative">
      {PERF_DEBUG_ENABLED && (
        <div className="fixed top-24 right-4 z-50 flex flex-col items-end gap-2">
          <RenderCounter label="TableOverview" value={tableOverviewRenderCount} />
          {activeTab === "tables" && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={isStressModeActive ? handleUnloadStressData : handleLoadStressData}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
              >
                {isStressModeActive ? "Use Live Data" : "Load Stress Data"}
              </button>
              {isStressModeActive && (
                <>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("status-change")}
                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Mutate Status
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("color-change")}
                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Mutate Color
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("move-status")}
                    className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Move Status
                  </button>
                </>
              )}
            </div>
          )}
          {isStressModeActive && (
            <div className="rounded-md bg-slate-800/90 px-2 py-1 text-[10px] font-semibold text-white">
              {stressDataset?.stats?.tables || 0} tables / {stressDataset?.stats?.openOrders || 0} orders /{" "}
              {stressDataset?.stats?.items || 0} items
            </div>
          )}
        </div>
      )}
      {canSeePacketTab &&
        activeTab !== "packet" &&
        packetOrdersCount > 0 &&
        !transactionSettings.disableTableOverviewOrdersFloatingButton && (
        <button
          type="button"
          onClick={() => handleTabSelect("packet")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-white shadow-2xl ring-1 ring-white/20 hover:brightness-110 active:scale-[0.98] transition"
          aria-label={t("Packet")}
        >
          <span className="font-semibold">{t("Packet")}</span>
          <span className="min-w-7 px-2 py-0.5 rounded-full bg-white/20 font-extrabold text-sm text-white text-center">
            {packetOrdersCount}
          </span>
	        </button>
	      )}

      {activeTab === "tables" &&
        !transactionSettings.disableTableOverviewGuestsFloatingButton && (
        <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-white shadow-2xl ring-1 ring-white/20">
          <span className="font-semibold">{t("Guests")}</span>
          <span className="min-w-7 px-2 py-0.5 rounded-full bg-white/20 font-extrabold text-sm text-white text-center">
            {totalSeats > 0 ? `${totalGuests}/${totalSeats}` : totalGuests}
          </span>
        </div>
      )}
  {activeTab === "tables" && (
    <TablesView
      showAreaTabs={showAreaTabs}
      activeArea={activeArea}
      setActiveArea={setActiveArea}
      groupedTables={groupedTables}
      tables={tables}
      ordersByTable={effectiveOrdersByTableRaw}
      productPrepById={effectiveProductPrepById}
      formatAreaLabel={formatAreaLabel}
      t={t}
      cardProps={tableCardProps}
    />
  )}



{activeTab === "takeaway" && (
  <div className="px-6 py-4">

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* ➕ New Takeaway Card */}
      <button
        onClick={async () => {
          try {
            const newOrder = await secureFetch("/orders", {
              method: "POST",
              body: JSON.stringify({
                order_type: "takeaway",
                total: 0,
                items: [],
              }),
            });
            navigate(`/transaction/phone/${newOrder.id}`, { state: { order: newOrder } });
          } catch (err) {
            console.error("❌ Failed to create takeaway order:", err);
            toast.error("Could not create new takeaway order");
          }
        }}
        className="border-2 border-dashed border-orange-400 rounded-3xl p-8 flex flex-col items-center justify-center text-orange-500 hover:bg-orange-50 transition"
      >
        <span className="text-5xl mb-2">➕</span>
        <span className="font-semibold text-lg">{t("New Pre-Orders")}</span>
      </button>

      {/* Existing Takeaway Orders */}
      {takeawayOrders.map(order => (
        <div
          key={order.id}
          onClick={() => navigate(`/transaction/phone/${order.id}`, { state: { order } })}
          className="cursor-pointer rounded-3xl bg-white/80 p-5 shadow-lg hover:shadow-xl transition hover:scale-[1.03]"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold text-orange-700">#{order.id}</span>
            <span className="text-sm text-gray-500">
              {new Date(order.created_at).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="font-bold text-gray-800">
            {formatCurrency(getDisplayTotal(order))}
          </div>
          <div className="text-sm text-gray-500">
            {order.customer_name || t("Guest")}
          </div>

          {/* Pre-order scheduling info */}
          {order.pickup_time && (
            <div className="mt-1 text-xs text-orange-700">
              🕒 {t("Pickup")}: {order.pickup_time}
            </div>
          )}
          {order.customer_address && (
            <div className="mt-0.5 text-xs text-emerald-700">
              🚚 {t("Delivery")}: {order.customer_address}
            </div>
          )}

          {/* Status + Kitchen badges (like tables) */}
          <div className="mt-2">
            {/* Order status label */}
            {order?.status && (
              <div className="flex items-center gap-2">
                <span className="uppercase font-extrabold tracking-wide text-orange-700">
                  {t(order.status)}
                </span>
                {/* Paid / Unpaid chip */}
                {Array.isArray(order.items) && order.items.length > 0 && (
                  hasUnpaidAnywhere(order) ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-xs shadow-sm">
                      {t("Unpaid")}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 font-bold rounded-full text-xs shadow-sm">
                      ✅ {t("Paid")}
                    </span>
                  )
                )}
              </div>
            )}

            {/* Kitchen status badges */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {["new", "preparing", "ready", "delivered"].map((status) => {
                  const count = order.items.filter((item) => item.kitchen_status === status).length;
                  if (!count) return null;
                  return (
                    <span
                      key={status}
	                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
	                        status === "preparing"
	                          ? "bg-yellow-400 text-indigo-700"
	                          : status === "ready"
	                          ? "bg-blue-500 text-white"
	                          : status === "delivered"
	                          ? "bg-green-500 text-white"
                          : status === "new"
                          ? "bg-gray-400 text-white"
                          : "bg-gray-300 text-black"
                      }`}
                    >
                      {count} {t(status)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}




    {/* --- Modal --- */}
    {showPhoneOrderModal && (
      <PhoneOrderModal
        open={showPhoneOrderModal}
        onClose={() => {
          setShowPhoneOrderModal(false);
          handleTabSelect("packet");
        }}
	onCreateOrder={() => {
	  setShowPhoneOrderModal(false);
	  handleTabSelect("takeaway");
	  setTimeout(() => {
	    fetchTakeawayOrders();
	  }, 300);
	}}





      />
    )}

    {activeTab === "phone" && <Orders />}
{activeTab === "packet" && (
  canSeePacketTab ? (
    <Orders hideModal={true} orders={packetOrders} />
  ) : (
    <div className="text-center mt-10 text-rose-500 font-bold">
      🚫 {t("Access Denied: Packet Orders")}
    </div>
  )
)}

{activeTab === "history" && (
      <OrderHistory
        fromDate={fromDate}
        toDate={toDate}
        paymentFilter={paymentFilter}
        orderTypeFilter={orderTypeFilter}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setPaymentFilter={setPaymentFilter}
        setOrderTypeFilter={setOrderTypeFilter}
      />
    )}

{activeTab === "kitchen" && (
  <div className="px-3 md:px-8 py-6">
 
    {kitchenOpenOrdersLoading ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-5xl mb-3">⏳</span>
        <span className="text-xl text-gray-400 font-semibold">{t("Loading orders...")}</span>
      </div>
    ) : kitchenOpenOrders.length === 0 ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-xl text-gray-400 font-semibold">{t("No open orders.")}</span>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
    {kitchenOpenOrders.map((order) => {
      const orderType = String(order?.order_type || "").trim().toLowerCase();
      const readyAtLabel = kitchenReadyAtByOrderId.get(order.id) || "";
      const paid = isOrderFullyPaid(order);
      const paymentStatusLabel = paid ? t("Paid") : t("Unpaid");
      const paymentStatusClass = paid
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-amber-100 text-amber-800 border-amber-200";

      const title = (() => {
        if (orderType === "table") return `🍽️ ${tableLabelText} ${order.table_number}`;
      if (orderType === "phone") return `📞 ${t("Phone Order")}`;
      if (orderType === "packet") return "🛵 Yemeksepti";
        if (orderType === "takeaway") return `🥡 ${t("Pre Order")}`;
        return t("Order");
      })();

      const subtitle = (() => {
        if (orderType === "table") return null;
        if (orderType === "phone" || orderType === "packet") {
          return order.customer_name || order.customer_phone || null;
        }
        if (orderType === "takeaway") {
          return order.customer_name || order.customer_phone || null;
        }
        return null;
      })();

      return (
        <div
          key={order.id}
          className="rounded-3xl bg-white border border-slate-200 shadow-xl p-5 flex flex-col gap-3 hover:shadow-2xl transition cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToOrder(order);
            }
          }}
          onClick={() => navigateToOrder(order)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-lg text-slate-900 truncate">{title}</div>
              <div className="text-xs text-slate-500 font-semibold">
                #{order.id}
                {subtitle ? ` • ${subtitle}` : ""}
              </div>
              {order.customer_address && (orderType === "phone" || orderType === "packet") && (
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                  📍 {order.customer_address}
                </div>
              )}
              {order.pickup_time && orderType === "takeaway" && (
                <div className="text-xs text-slate-600 mt-1">
                  🕒 {t("Pickup")}: {order.pickup_time}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${paymentStatusClass}`}>
                {paymentStatusLabel}
              </span>
              {readyAtLabel && (
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold border bg-slate-100 text-slate-700 border-slate-200">
                  ⏳ {t("Ready at")} {readyAtLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-800">
              {formatCurrency(Number(order.total || 0))}
            </div>
            {order.payment_method && (
              <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
                {t("Paid")}: {order.payment_method}
              </span>
            )}
          </div>

          {Array.isArray(order.items) && order.items.length > 0 && (
            <div className="text-xs text-slate-600">
              {order.items.slice(0, 3).map((it, idx) => (
                <div key={`${order.id}-${it.id || idx}`} className="truncate">
                  • {it.product_name || it.name || t("Item")} ×{it.quantity || 1}
                </div>
              ))}
              {order.items.length > 3 && (
                <div className="text-xs text-slate-400 italic">
                  +{order.items.length - 3} {t("more")}
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}
      </div>
    )}
  </div>
)}



<RegisterModal
  showRegisterModal={showRegisterModal}
  setShowRegisterModal={setShowRegisterModal}
  handleTabSelect={handleTabSelect}
/>











  </div>
);



}
