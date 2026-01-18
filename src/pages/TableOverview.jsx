import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PhoneOrderModal from "../modals/PhoneOrderModal";
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
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import { getReservationSchedule, isEarlyReservationClose } from "../utils/reservationSchedule";

import secureFetch from "../utils/secureFetch";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { openCashDrawer, logCashRegisterEvent } from "../utils/cashDrawer";
import { useCurrency } from "../context/CurrencyContext";
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://api.beypro.com/api");
const isDelayed = (order) => {
  if (!order || order.status !== "confirmed" || !order.created_at) return false;
  // Only treat as delayed if there is at least one item
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  const created = new Date(order.created_at);
  const now = new Date();
  const diffMins = (now - created) / 1000 / 60;
  return diffMins > 1;
};

const isEffectivelyFreeOrder = (order) => {
  if (!order) return true;

  const status = normalizeOrderStatus(order.status);
  if (status === "closed") return true;
  if (status === "draft") return true;

  // Reservations should be visible even if they have no items yet.
  if (status === "reserved" || order.order_type === "reservation" || order.reservation_date) {
    return false;
  }

  const total = Number(order.total || 0);
  const items = Array.isArray(order.items) ? order.items : null;

  // If items are hydrated, empty items + zero total should look like a free table.
  if (items) return items.length === 0 && total <= 0;

  // If items are not hydrated yet, use total as a fast proxy.
  // This prevents a brief "confirmed/occupied" flash for empty orders.
  return total <= 0;
};

// ✅ Improved color logic for moved/paid tables
// ✅ FIXED: show red if any suborder has unpaid items
// ✅ NEW: show orange if table is reserved
const getTableColor = (order) => {
  if (!order) return "bg-gray-400 text-black";

  // 🟠 CHECK FOR RESERVATION - if reserved
  if (order.status === "reserved" || order.order_type === "reservation" || order.reservation_date) {
    // 🟢 If reserved AND paid, show green
    if (order.status === "Paid" || order.payment_status === "Paid" || order.is_paid === true) {
      return "bg-green-500 text-white";
    }
    // 🟠 If reserved but not paid, show orange
    return "bg-orange-500 text-white";
  }

  // Paid is always green, even if items haven't been hydrated yet.
  if (
    order.status === "Paid" ||
    order.payment_status === "Paid" ||
    order.is_paid === true
  ) {
    return "bg-green-500 text-white";
  }

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : null;
  const total = Number(order.total || 0);

  // If items aren't loaded yet, still show an "occupied" color based on status
  // instead of waiting (avoids the 2-3s gray flash).
  if (!items) {
    // Empty orders (0 total) should look free immediately.
    if (total <= 0) return "bg-gray-400 text-black";
    if (order.status === "confirmed") return "bg-red-500 text-white";
    return "bg-gray-400 text-black";
  }

  // 🧹 No items at all → treat as Free (neutral), not yellow (unless status says otherwise)
  if (items.length === 0) {
    if (order.status === "confirmed") return "bg-red-500 text-white";
    return "bg-gray-400 text-black";
  }

  // 🔍 Check unpaid in suborders
  const hasUnpaidSubOrder = suborders.some((sub) =>
    Array.isArray(sub.items)
      ? sub.items.some((i) => !i.paid_at && !i.paid)
      : false
  );

  // 🔍 Check unpaid items in main order
  const hasUnpaidMainItem = items.some((i) => !i.paid_at && !i.paid);

  // 🟥 if any unpaid anywhere (main or sub)
  if (hasUnpaidSubOrder || hasUnpaidMainItem) {
    return "bg-red-500 text-white";
  }

  // 🟡 confirmed but unpaid (fallback)
  if (order.status === "confirmed") {
    return "bg-yellow-400 text-black";
  }

  return "bg-gray-400 text-black";
};

// ✅ Helper: true if any suborder or item unpaid
const hasUnpaidAnywhere = (order) => {
  if (!order) return false;

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];

  const unpaidSub = suborders.some((sub) =>
    Array.isArray(sub.items)
      ? sub.items.some((i) => !i.paid_at && !i.paid)
      : false
  );

  const unpaidMain = items.some((i) => !i.paid_at && !i.paid);

  return unpaidSub || unpaidMain;
};


const normalizeOrderStatus = (status) => {
  if (!status) return "";
  const normalized = String(status).toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

const isOrderCancelledOrCanceled = (status) => {
  const normalized = normalizeOrderStatus(status);
  return normalized === "cancelled" || normalized === "canceled";
};

const isOrderPaid = (order) =>
  order?.status === "Paid" || order?.payment_status === "Paid" || order?.is_paid === true;

const parseLooseDateToMs = (val) => {
  if (!val) return NaN;
  const a = new Date(val).getTime();
  const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
  const b = new Date(bStr).getTime();
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
  }
  return Number.isFinite(a) ? a : b;
};

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

const pickLatestTimestampValue = (existingValue, nextValue) => {
  if (!existingValue) return nextValue;
  if (!nextValue) return existingValue;
  const existingMs = parseLooseDateToMs(existingValue);
  const nextMs = parseLooseDateToMs(nextValue);
  if (!Number.isFinite(existingMs)) return nextValue;
  if (!Number.isFinite(nextMs)) return existingValue;
  return nextMs >= existingMs ? nextValue : existingValue;
};

const getTableOverviewConfirmedTimersCacheKey = () => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:tableOverview.confirmedTimers.v1`;
};

const readTableOverviewConfirmedTimers = () => {
  try {
    if (typeof window === "undefined") return {};
    const raw = window?.localStorage?.getItem(getTableOverviewConfirmedTimersCacheKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeTableOverviewConfirmedTimers = (timers) => {
  try {
    if (typeof window === "undefined") return;
    window?.localStorage?.setItem(
      getTableOverviewConfirmedTimersCacheKey(),
      JSON.stringify(timers || {})
    );
  } catch {
    // ignore
  }
};

const resolveConfirmedSinceMs = (prevOrder, nextOrder, ctx) => {
  const tableKey = ctx?.tableKey != null ? String(ctx.tableKey) : null;
  const timers = ctx?.timers;
  const isInitialLoad = Boolean(ctx?.isInitialLoad);

  if (!nextOrder || nextOrder.status !== "confirmed") {
    if (timers && tableKey) delete timers[tableKey];
    return null;
  }

  const storedMs =
    timers && tableKey != null ? Number.parseInt(timers[tableKey], 10) : NaN;
  if (Number.isFinite(storedMs)) return storedMs;

  // Only treat an order as "free" for timer purposes when items are actually hydrated.
  // The /orders list can have total=0 and no items, which is ambiguous until hydration completes.
  if (Array.isArray(nextOrder.items) && isEffectivelyFreeOrder(nextOrder)) {
    if (timers && tableKey) delete timers[tableKey];
    return null;
  }

  // When the page first loads after a refresh, there is no previous in-memory state,
  // so we must NOT treat "missing prev" as a free→confirmed transition (or we'd reset to 00:00).
  // After the initial load, a missing prev indicates a new order appeared → start from 00:00.
  if (!isInitialLoad && prevOrder === undefined) {
    const now = Date.now();
    if (timers && tableKey) timers[tableKey] = now;
    return now;
  }

  const prevIsEffectivelyFree =
    prevOrder === undefined
      ? false
      : Array.isArray(prevOrder.items) && isEffectivelyFreeOrder(prevOrder);
  if (prevIsEffectivelyFree) {
    const now = Date.now();
    if (timers && tableKey) timers[tableKey] = now;
    return now;
  }

  const prevMs = prevOrder?.status === "confirmed" ? prevOrder?.confirmedSinceMs : null;
  if (Number.isFinite(prevMs)) {
    if (timers && tableKey) timers[tableKey] = prevMs;
    return prevMs;
  }

  const nextMs = parseLooseDateToMs(nextOrder.updated_at || nextOrder.created_at);
  const resolved = Number.isFinite(nextMs) ? nextMs : Date.now();
  if (timers && tableKey) timers[tableKey] = resolved;
  return resolved;
};

const getOrderTabHint = (order) => {
  if (!order) return "tables";
  const type = String(order.order_type || "").toLowerCase();
  if (type === "takeaway") return "takeaway";
  if (type === "packet") return "packet";
  if (type === "phone") return "phone";
  if (order.table_number != null) return "tables";
  return isOrderPaid(order) ? "history" : "kitchen";
};

const formatOpenOrderLabel = (order) => {
  if (!order) return "";
  const status = normalizeOrderStatus(order.status);
  const type = String(order.order_type || "").toLowerCase();
  const where =
    order.table_number != null
      ? `table ${order.table_number}`
      : type
      ? type
      : "order";
  return `#${order.id} (${where}, ${status || "unknown"})`;
};


const getDisplayTotal = (order) => {
  if (!order) return 0;

  if (order.receiptMethods?.length > 0) {
    return order.receiptMethods.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  }

  if (order.items?.some(i => !i.paid_at && !i.paid)) {
    return order.items
      .filter(i => !i.paid_at && !i.paid)
      .reduce((sum, i) => {
        const base = i.price * i.quantity;
        const extrasTotal = Array.isArray(i.extras)
          ? i.extras.reduce((extraSum, ex) => {
              const exQty = parseInt(ex.quantity || 1);
              const exPrice = parseFloat(ex.price || 0);
              return extraSum + exQty * exPrice;
            }, 0) * i.quantity // extras apply per product quantity
          : 0;
        return sum + base + extrasTotal;
      }, 0);
  }

  return parseFloat(order.total || 0);
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
const getTableOrdersCacheKey = () => getRestaurantScopedCacheKey("tableOverview.orders.v1");
const getTableOrdersCacheTsKey = () => getRestaurantScopedCacheKey("tableOverview.orders.ts");

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
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

const readInitialTableOrders = () => {
  const cachedOrders = safeParseJson(
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableOrdersCacheKey()) : null
  );
  if (!Array.isArray(cachedOrders) || cachedOrders.length === 0) return [];
  return cachedOrders.filter((o) => o && typeof o === "object" && o.table_number != null);
};

const writeTableOrdersCache = (orders) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(orders)) return;
    window?.localStorage?.setItem(getTableOrdersCacheKey(), JSON.stringify(orders));
    window?.localStorage?.setItem(getTableOrdersCacheTsKey(), String(Date.now()));
  } catch {
    // ignore cache errors
  }
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





export default function TableOverview() {
  useRegisterGuard();
  const { formatCurrency, config } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const didAutoOpenRegisterRef = useRef(false);
  const tabFromUrl = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("tab") || "tables").toLowerCase();
  }, [location.search]);

  const activeTab = tabFromUrl;
  const [orders, setOrders] = useState(() => readInitialTableOrders());
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
  const alertIntervalRef = useRef(null);
  const ordersFetchSeqRef = useRef(0);
  const didInitialOrdersLoadRef = useRef(false);
  const isMountedRef = useRef(true);
  const [now, setNow] = useState(new Date());
  const [kitchenOrders, setKitchenOrders] = useState([]); // used for kitchen
  const [kitchenOpenOrders, setKitchenOpenOrders] = useState([]);
  const [kitchenOpenOrdersLoading, setKitchenOpenOrdersLoading] = useState(false);
  const [productPrepById, setProductPrepById] = useState({});
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [phoneOrders, setPhoneOrders] = useState([]); // For active phone orders if you want to display/manage them
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [expectedCash, setExpectedCash] = useState(0);
  const [registerState, setRegisterState] = useState("loading");
  const [openingCash, setOpeningCash] = useState("");
  const [dailyCashExpense, setDailyCashExpense] = useState(undefined);
  const [yesterdayCloseCash, setYesterdayCloseCash] = useState(null);
  const [cashDataLoaded, setCashDataLoaded] = useState(false);
  const [lastOpenAt, setLastOpenAt] = useState(null);

  const parsedOpeningCash = Number(openingCash || 0);
  const parsedYesterdayCloseCash = Number(yesterdayCloseCash || 0);
  const openingDifference = parsedOpeningCash - parsedYesterdayCloseCash;
  const canViewRegisterSummary = useHasPermission("settings-register-summary");
  const [packetOrders, setPacketOrders] = useState([]);
  const [showEntryForm, setShowEntryForm] = useState(false);
const [entryAmount, setEntryAmount] = useState("");
const [entryReason, setEntryReason] = useState("");
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const hasPermission = useHasPermission;
  // compute permissions once at top level (avoid calling hooks inside loops)
  const canSeeTablesTab = useHasPermission("tables");
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
  const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone-orders");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");
const [activeArea, setActiveArea] = useState("ALL");

const [registerEntries, setRegisterEntries] = useState(0);
  const [showRegisterLog, setShowRegisterLog] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeAmount, setChangeAmount] = useState("");
 
  const [todayRegisterEvents, setTodayRegisterEvents] = useState([]);
const [todayExpenses, setTodayExpenses] = useState([]);
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

const confirmEarlyReservationClose = (schedule, t) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const dateLabel = schedule?.date || "—";
    const timeLabel = schedule?.time || "—";

    let toastId = null;
    toastId = toast(
      () => (
        <div className="flex flex-col gap-3">
          <div className="font-extrabold text-red-700">
            {t("Reservation time has not yet arrived.")}
          </div>
          <div className="text-sm text-slate-800">
            {t(
              "This table is reserved for {{date}} {{time}}. The reservation time has not yet arrived. Close the table anyway?",
              { date: dateLabel, time: timeLabel }
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-200"
              onClick={() => {
                finish(false);
                if (toastId) toast.dismiss(toastId);
              }}
            >
              {t("Cancel")}
            </button>
            <button
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700"
              onClick={() => {
                finish(true);
                if (toastId) toast.dismiss(toastId);
              }}
            >
              {t("Close anyway")}
            </button>
          </div>
        </div>
      ),
      {
        autoClose: false,
        closeOnClick: false,
        closeButton: false,
        draggable: false,
        onClose: () => finish(false),
      }
    );
  });

const handleCloseTable = async (orderOrId) => {
  const order = orderOrId && typeof orderOrId === "object" ? orderOrId : null;
  const orderId = order?.id ?? orderOrId;
  const schedule = getReservationSchedule(order);

  if (order && isEarlyReservationClose(order) && schedule) {
    const confirmed = await confirmEarlyReservationClose(schedule, t);
    if (!confirmed) return;
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
    toast.success("✅ Table closed successfully!");

    // optional: return to overview
    setTimeout(() => {
      fetchOrders();
    }, 800);
  } catch (err) {
    console.error("❌ Failed to close table:", err);
    toast.error("Failed to close table");
  }
};






  const [supplierCashPayments, setSupplierCashPayments] = useState([]);
  const [staffCashPayments, setStaffCashPayments] = useState([]);

  const fetchRegisterStatus = useCallback(
    () => secureFetch("/reports/cash-register-status"),
    []
  );

  const fetchRegisterEntriesForToday = useCallback(async (today) => {
    try {
      const data = await secureFetch(`/reports/cash-register-history?from=${today}&to=${today}`);
      const todayRow = Array.isArray(data)
        ? data.find((row) => row.date === today)
        : null;
      setRegisterEntries(todayRow?.register_entries ? Number(todayRow.register_entries) : 0);
    } catch (err) {
      console.error("❌ Failed to fetch register entries:", err);
      setRegisterEntries(0);
    }
  }, []);

  const fetchRegisterLogsForToday = useCallback(async (today) => {
    const [eventsRes, expensesRes] = await Promise.allSettled([
      secureFetch(`/reports/cash-register-events?from=${today}&to=${today}`),
      secureFetch(`/reports/expenses?from=${today}&to=${today}`),
    ]);

    if (eventsRes.status === "fulfilled") {
      setTodayRegisterEvents(eventsRes.value);
    } else {
      setTodayRegisterEvents([]);
    }

    if (expensesRes.status === "fulfilled") {
      setTodayExpenses(expensesRes.value);
    } else {
      setTodayExpenses([]);
    }
  }, []);

  const fetchRegisterPaymentsForToday = useCallback(async (today) => {
    const [supplierRes, staffRes] = await Promise.allSettled([
      secureFetch(`/reports/supplier-cash-payments?from=${today}&to=${today}`),
      secureFetch(`/reports/staff-cash-payments?from=${today}&to=${today}`),
    ]);

    if (supplierRes.status === "fulfilled") {
      setSupplierCashPayments(Array.isArray(supplierRes.value) ? supplierRes.value : []);
    } else {
      setSupplierCashPayments([]);
    }

    if (staffRes.status === "fulfilled") {
      setStaffCashPayments(Array.isArray(staffRes.value) ? staffRes.value : []);
    } else {
      setStaffCashPayments([]);
    }
  }, []);

  const initializeRegisterSummary = useCallback(async () => {
    try {
      let openTime = null;
      const data = await fetchRegisterStatus();

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      setActualCash("");

      if (data.status === "open") {
        openTime = data.last_open_at;
        const opening =
          data.opening_cash !== undefined && data.opening_cash !== null
            ? data.opening_cash.toString()
            : "";
        setOpeningCash(opening);
      }

      if (!openTime) {
        setCashDataLoaded(true);
        return;
      }

      const cashTotalRes = await secureFetch(
        `/reports/daily-cash-total?openTime=${encodeURIComponent(openTime)}`
      );

      let cashSales = parseFloat(cashTotalRes?.cash_total || 0);

      if (!Number.isFinite(cashSales) || cashSales <= 0) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const hist = await secureFetch(
            `/reports/cash-register-history?from=${today}&to=${today}`
          );
          const row = Array.isArray(hist)
            ? hist.find((r) => r.date === today)
            : null;
          if (row && row.cash_sales != null) {
            cashSales = parseFloat(row.cash_sales || 0);
          }
        } catch {
          // ignore fallback errors
        }
      }

      setExpectedCash(Number.isFinite(cashSales) ? cashSales : 0);

      const cashExpArr = await secureFetch(
        `/reports/daily-cash-expenses?openTime=${encodeURIComponent(openTime)}`
      ).catch(() => []);
      const logExpense = parseFloat(cashExpArr?.[0]?.total_expense || 0);

      const today = new Date().toISOString().slice(0, 10);
      const extraExpenses = await secureFetch(
        `/expenses?from=${today}&to=${today}`
      )
        .then((rows) =>
          Array.isArray(rows)
            ? rows.reduce(
                (sum, e) => sum + (parseFloat(e.amount || 0) || 0),
                0
              )
            : 0
        )
        .catch(() => 0);

      const totalExpense = (isNaN(logExpense) ? 0 : logExpense) + extraExpenses;

      console.log(
        "📉 New Daily Cash Expense (log + expenses):",
        totalExpense
      );
      setDailyCashExpense(totalExpense);
      setCashDataLoaded(true);
      console.log("✅ All cash data loaded");
    } catch (err) {
      console.error("❌ Error in modal init:", err);
      toast.error("Failed to load register data");
    }
  }, [fetchRegisterStatus]);

  const loadRegisterData = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);

    setCashDataLoaded(false);
    setExpectedCash(0);
    setDailyCashExpense(0);
    setActualCash("");
    setRegisterState("loading");

    await Promise.all([
      fetchRegisterLogsForToday(today),
      fetchRegisterPaymentsForToday(today),
      fetchRegisterEntriesForToday(today),
      initializeRegisterSummary(),
    ]);
  }, [
    fetchRegisterEntriesForToday,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    initializeRegisterSummary,
  ]);

  useEffect(() => {
    if (!showRegisterModal) return;
    loadRegisterData();
  }, [showRegisterModal, loadRegisterData]);


const groupByDate = (orders) => {
  return orders.reduce((acc, order) => {
    const dateKey = order.created_at?.slice(0, 10) || "Unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(order);
    return acc;
  }, {});
};

  const visibleTabs = React.useMemo(() => {
    return TAB_LIST.filter((tab) => {
      if (tab.id === "takeaway") return canSeeTakeawayTab;
      if (tab.id === "tables") return canSeeTablesTab;
      if (tab.id === "kitchen") return canSeeKitchenTab;
      if (tab.id === "history") return canSeeHistoryTab;
      if (tab.id === "packet") return canSeePacketTab;
      if (tab.id === "phone") return canSeePhoneTab;
      if (tab.id === "register") return canSeeRegisterTab;
      return true;
    });
  }, [
    canSeeTakeawayTab,
    canSeeTablesTab,
    canSeeKitchenTab,
    canSeeHistoryTab,
    canSeePacketTab,
    canSeePhoneTab,
    canSeeRegisterTab,
  ]);

  const handleTabSelect = useCallback(
    (tabId, options = {}) => {
      if (!tabId) return;
      const basePath = "/tableoverview";
      const replace = options?.replace === true;
      const params = new URLSearchParams(location.search);
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

  useEffect(() => {
    if (didAutoOpenRegisterRef.current) return;
    if (
      location.state?.openRegisterModal === true ||
      registerState === "closed" ||
      registerState === "unopened"
    ) {
      didAutoOpenRegisterRef.current = true;
      setShowRegisterModal(true);
    }
  }, [location.state, registerState]);

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
    }));
  }, [
    activeTab,
    t,
    setHeader,
  ]);

useEffect(() => () => setHeader({}), [setHeader]);

useEffect(() => () => {
  isMountedRef.current = false;
}, []);


// Combine logs for the Register modal without duplicating cash expenses
// Cash expenses are already inserted into cash_register_logs when saved from Expenses page
const combinedEvents = [
  ...(todayRegisterEvents || []),
  ...((todayExpenses || [])
    .filter((e) => String(e.payment_method || "").toLowerCase() !== "cash")
    .map((e) => ({
      type: "expense",
      amount: e.amount,
      note: e.note || e.type || null,
      created_at: e.created_at,
    }))),
  ...(supplierCashPayments || []),
  ...(staffCashPayments || []),
].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

const handleChangeCashSubmit = async (e) => {
  e.preventDefault();
  if (!changeAmount || isNaN(changeAmount) || Number(changeAmount) <= 0) {
    toast.error("Enter a valid change amount");
    return;
  }

  try {
    const res = await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({
        type: "change", // this will be mapped to 'expense' in backend
        amount: Number(changeAmount),
        note: "Change given to customer",
      }),
    });

    toast.success("Change recorded successfully!");
    setChangeAmount("");
    setShowChangeForm(false);

    // refresh the modal
    setShowRegisterModal(false);
    setTimeout(() => setShowRegisterModal(true), 350);
  } catch (err) {
    console.error("❌ Failed to record change:", err);
    toast.error(err.message || "Failed to record change");
  }
};


const refreshRegisterState = useCallback(() => {
  fetchRegisterStatus()
    .then((data) => {
      console.log("📥 /cash-register-status response:", data);

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      if (data.status === "open") {
        const opening = data.opening_cash?.toString() ?? "";
        setOpeningCash(opening);
        console.log("🔓 Register is OPEN, Opening Cash:", opening);
      } else {
        setOpeningCash("");
        console.log("🔐 Register is NOT open");
      }

      setActualCash("");
    })
    .catch((err) => {
      console.error("❌ Failed to refresh register state:", err);
      toast.error("Could not load register status");
    });
}, [fetchRegisterStatus]);


const fetchPacketOrders = useCallback(async () => {
  try {
    const [packet, phone] = await Promise.all([
      secureFetch(`/orders?type=packet`),
      secureFetch(`/orders?type=phone`),
    ]);

    const packetArray = Array.isArray(packet) ? packet : [];
    const phoneArray = Array.isArray(phone) ? phone : [];

    const data = [...packetArray, ...phoneArray];

    const ordersWithItems = await Promise.all(
      data
        .filter((o) => {
          const status = normalizeOrderStatus(o?.status);
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          return true;
        })
        .map(async (order) => {
          const items = (await secureFetch(`/orders/${order.id}/items`)).map((item) => ({
            ...item,
            discount_type: item.discount_type || item.discountType || null,
            discount_value:
              item.discount_value != null
                ? parseFloat(item.discount_value)
                : item.discountValue != null
                ? parseFloat(item.discountValue)
                : 0,
          }));

          let receiptMethods = [];
          if (order.receipt_id) {
            try {
              receiptMethods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`);
            } catch (e) {
              console.warn("⚠️ Failed to fetch receipt methods for order", order.id, e);
            }
          }

          return { ...order, items, receiptMethods };
        })
    );

    setPacketOrders(ordersWithItems);
  } catch (err) {
    console.error("❌ Fetch packet orders failed:", err);
    toast.error(t("Could not load packet orders"));
  }
}, [t]);

const fetchPacketOrdersCount = useCallback(async () => {
  if (!canSeePacketTab) return;
  try {
    const [packet, phone] = await Promise.all([
      secureFetch(`/orders?type=packet`),
      secureFetch(`/orders?type=phone`),
    ]);

    const packetArray = Array.isArray(packet) ? packet : [];
    const phoneArray = Array.isArray(phone) ? phone : [];
    const filtered = [...packetArray, ...phoneArray].filter(
      (o) => {
        if (!o) return false;
        const status = normalizeOrderStatus(o?.status);
        if (status === "closed") return false;
        if (isOrderCancelledOrCanceled(status)) return false;
        return true;
      }
    );
    setPacketOrdersCount(filtered.length);
  } catch (err) {
    console.warn("⚠️ Failed to fetch packet orders count:", err);
    setPacketOrdersCount(0);
  }
}, [canSeePacketTab]);

useEffect(() => {
  fetchPacketOrdersCount();
}, [fetchPacketOrdersCount]);

useEffect(() => {
  setPacketOrdersCount(Array.isArray(packetOrders) ? packetOrders.length : 0);
}, [packetOrders]);

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
          const isOrderPaid =
            order.status === "Paid" || order.payment_status === "Paid" || order.is_paid === true;
          if (isOrderPaid) {
            items = items.map((i) => ({ ...i, paid: i.paid || true }));
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




useEffect(() => {
  refreshRegisterState();
}, [refreshRegisterState]);












// (location + handleTabSelect declared above)





useEffect(() => {
  const today = new Date().toISOString().split("T")[0];
  setFromDate(today);
  setToDate(today);
}, []);

const fetchOrders = useCallback(async () => {
  try {
    const seq = ++ordersFetchSeqRef.current;
    const isInitialLoad = !didInitialOrdersLoadRef.current;
    // Always use secureFetch → tenant_id + auth included
    const data = await secureFetch("/orders");

    if (!Array.isArray(data)) {
      console.error("❌ Unexpected orders response:", data);
      toast.error("Failed to load orders");
      return;
    }

    const openTableOrders = data
      .filter((o) => {
        const status = normalizeOrderStatus(o.status);
        if (status === "closed") return false;
        if (isOrderCancelledOrCanceled(status)) return false;
        return o.table_number != null;
      })
      .map((order) => {
        const status = normalizeOrderStatus(order.status);
        return {
          ...order,
          status,
          total: status === "paid" ? 0 : parseFloat(order.total || 0),
        };
      });

	    // Phase 1: render table statuses/colors immediately from order rows.
	    // Preserve any previously-hydrated items to avoid UI flicker while refreshing.
		    setOrders((prev) => {
		      const prevByTable = new Map();
		      (Array.isArray(prev) ? prev : []).forEach((o) => {
		        if (o?.table_number != null) prevByTable.set(Number(o.table_number), o);
		      });

		      const storedTimers = readTableOverviewConfirmedTimers();
		      const nextTimers = { ...storedTimers };
		      const nextTableKeys = new Set(
		        openTableOrders.map((o) => String(Number(o.table_number)))
		      );
		      for (const prevKey of prevByTable.keys()) {
		        if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
		      }

		      const merged = Object.values(
		        openTableOrders.reduce((acc, order) => {
		          const key = Number(order.table_number);
		          const tableKey = String(key);
		          const prevMerged = prevByTable.get(key);
		          const knownItems = Array.isArray(prevMerged?.items) ? prevMerged.items : null;
		          const orderWithKnownItems = knownItems ? { ...order, items: knownItems } : order;
		          if (!acc[key]) {
		            acc[key] = {
		              ...order,
		              merged_ids: [order.id],
		              items: Array.isArray(prevMerged?.items) ? prevMerged.items : null,
		              suborders: Array.isArray(prevMerged?.suborders) ? prevMerged.suborders : order.suborders,
		              reservation: prevMerged?.reservation ?? null,
		              confirmedSinceMs: resolveConfirmedSinceMs(prevMerged, orderWithKnownItems, {
		                isInitialLoad,
		                tableKey,
		                timers: nextTimers,
		              }),
		            };
		          } else {
		            acc[key].merged_ids.push(order.id);
		            acc[key].created_at = pickLatestTimestampValue(acc[key].created_at, order.created_at);
		            acc[key].updated_at = pickLatestTimestampValue(acc[key].updated_at, order.updated_at);
		            acc[key].prep_started_at = pickLatestTimestampValue(
		              acc[key].prep_started_at,
		              order.prep_started_at
		            );
		            acc[key].estimated_ready_at = pickLatestTimestampValue(
		              acc[key].estimated_ready_at,
		              order.estimated_ready_at
		            );
		            acc[key].kitchen_delivered_at = pickLatestTimestampValue(
		              acc[key].kitchen_delivered_at,
		              order.kitchen_delivered_at
		            );
		            acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
		            const nextStatus =
		              acc[key].status === "Paid" && order.status === "Paid" ? "Paid" : "Confirmed";
		            acc[key].status = nextStatus;
		            if (nextStatus !== "confirmed") {
		              acc[key].confirmedSinceMs = null;
		              delete nextTimers[tableKey];
		            } else if (!Number.isFinite(acc[key].confirmedSinceMs)) {
		              acc[key].confirmedSinceMs = resolveConfirmedSinceMs(prevMerged, orderWithKnownItems, {
		                isInitialLoad,
		                tableKey,
		                timers: nextTimers,
		              });
		            }
		          }
		          return acc;
		        }, {})
		      );

		      const sorted = merged.sort(
		        (a, b) => Number(a.table_number) - Number(b.table_number)
		      );
		      writeTableOverviewConfirmedTimers(nextTimers);
          writeTableOrdersCache(sorted);
		      return sorted;
		    });

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
              console.warn("⚠️ Order hydrate failed:", err);
              results[current] = null;
            }
          }
        })
      );

      return results.filter(Boolean);
    };

    // Phase 2: hydrate items/reservations (slower) and update.
    const hydrated = await runWithConcurrency(openTableOrders, 6, async (order) => {
      const itemsRaw = await secureFetch(`/orders/${order.id}/items`);
      const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];

      let items = itemsArr.map((item) => ({
        ...item,
        discount_type: item.discount_type || item.discountType || null,
        discount_value:
          item.discount_value != null
            ? parseFloat(item.discount_value)
            : item.discountValue != null
            ? parseFloat(item.discountValue)
            : 0,
      }));

      const isOrderPaid =
        order.status === "Paid" || order.payment_status === "Paid" || order.is_paid === true;
      if (isOrderPaid) {
        items = items.map((i) => ({ ...i, paid: i.paid || true }));
      }

      let reservation = null;
      try {
        if (order.status === "reserved" || order.reservation_date) {
          const resData = await secureFetch(`/orders/reservations/${order.id}`);
          if (resData?.success && resData?.reservation) {
            reservation = resData.reservation;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch reservation for order ${order.id}:`, err);
      }

      return { ...order, items, reservation };
    });

    if (ordersFetchSeqRef.current !== seq) return;

	    const mergedByTable = Object.values(
	      hydrated.reduce((acc, order) => {
	        const key = Number(order.table_number);
	        if (!acc[key]) {
	          acc[key] = {
	            ...order,
	            merged_ids: [order.id],
	            merged_items: [...(order.items || [])],
	          };
	        } else {
	          acc[key].merged_ids.push(order.id);
	          acc[key].created_at = pickLatestTimestampValue(acc[key].created_at, order.created_at);
	          acc[key].updated_at = pickLatestTimestampValue(acc[key].updated_at, order.updated_at);
	          acc[key].prep_started_at = pickLatestTimestampValue(
	            acc[key].prep_started_at,
	            order.prep_started_at
	          );
	          acc[key].estimated_ready_at = pickLatestTimestampValue(
	            acc[key].estimated_ready_at,
	            order.estimated_ready_at
	          );
	          acc[key].kitchen_delivered_at = pickLatestTimestampValue(
	            acc[key].kitchen_delivered_at,
	            order.kitchen_delivered_at
	          );
	          acc[key].items = [...(acc[key].items || []), ...(order.items || [])];
	          acc[key].merged_items = acc[key].items;
	          acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
	          acc[key].status =
	            acc[key].status === "Paid" && order.status === "Paid" ? "Paid" : "Confirmed";
	        }
	        const anyUnpaid = (acc[key].items || []).some((i) => !i.paid_at && !i.paid);
	        acc[key].is_paid = !anyUnpaid;
	        return acc;
	      }, {})
	    ).sort((a, b) => Number(a.table_number) - Number(b.table_number));

		    setOrders((prev) => {
		      const prevByTable = new Map();
		      (Array.isArray(prev) ? prev : []).forEach((o) => {
		        if (o?.table_number != null) prevByTable.set(Number(o.table_number), o);
		      });

		      const storedTimers = readTableOverviewConfirmedTimers();
		      const nextTimers = { ...storedTimers };
		      const nextTableKeys = new Set(
		        mergedByTable.map((o) => String(Number(o.table_number)))
		      );
		      for (const prevKey of prevByTable.keys()) {
		        if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
		      }

		      const nextOrders = mergedByTable.map((o) => {
		        const tableKey = String(Number(o.table_number));
		        const prevMerged = prevByTable.get(Number(o.table_number));
		        return {
		          ...o,
		          confirmedSinceMs: resolveConfirmedSinceMs(prevMerged, o, {
		            isInitialLoad,
		            tableKey,
		            timers: nextTimers,
		          }),
		        };
		      });
		      writeTableOverviewConfirmedTimers(nextTimers);
          writeTableOrdersCache(nextOrders);
		      return nextOrders;
		    });

	    if (isInitialLoad) didInitialOrdersLoadRef.current = true;
	  } catch (err) {
	    console.error("❌ Fetch open orders failed:", err);
	    toast.error("Could not load open orders");
	  }
	}, [currentUser]);





function hasReadyOrder(order) {
  // If any item in the order is ready and not delivered
  return (
    Array.isArray(order?.items)
      ? order.items.some(item => item.kitchen_status === "ready")
      : false
  );
}


  // === FIXED fetchKitchenOrders (merges same-customer orders) ===
const fetchKitchenOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/kitchen-orders");

    const active = data.filter(
      (item) =>
        item.kitchen_status !== "delivered" &&
        item.kitchen_status !== null &&
        item.kitchen_status !== ""
    );

    const buildGroupKey = (item) => {
      const type = String(item.order_type || "").trim().toLowerCase();
      const tableNo = item.table_number ? String(item.table_number) : "";
      const phone = (item.customer_phone || "").replace(/\s+/g, "");
      if (type === "table" && tableNo) {
        return `table-${tableNo}`;
      }
      if ((type === "phone" || type === "packet" || type === "takeaway") && phone) {
        return `phone-${phone}`;
      }
      if (item.order_id) {
        return `order-${item.order_id}`;
      }
      const nameKey = (item.customer_name || "").trim().toLowerCase();
      if (nameKey) return `name-${nameKey}`;
      return `item-${item.item_id}`;
    };

    const merged = Object.values(
      active.reduce((acc, item) => {
        const key = buildGroupKey(item);
        if (!acc[key]) {
          acc[key] = {
            ...item,
            merged_item_ids: [item.item_id],
            merged_products: [item.product_name],
            total_quantity: Number(item.quantity || 0),
            tables: item.table_number ? [item.table_number] : [],
            order_refs: item.order_id ? [item.order_id] : [],
            phones: item.customer_phone ? [item.customer_phone] : [],
          };
          return acc;
        }

        const entry = acc[key];
        entry.merged_item_ids.push(item.item_id);
        entry.merged_products.push(item.product_name);
        entry.total_quantity += Number(item.quantity || 0);
        if (item.table_number && !entry.tables.includes(item.table_number)) {
          entry.tables.push(item.table_number);
        }
        if (item.order_id && !entry.order_refs.includes(item.order_id)) {
          entry.order_refs.push(item.order_id);
        }
        if (item.customer_phone && !entry.phones.includes(item.customer_phone)) {
          entry.phones.push(item.customer_phone);
        }

        if (
          (item.kitchen_status === "ready" || item.kitchen_status === "preparing") &&
          entry.kitchen_status !== "ready"
        ) {
          entry.kitchen_status = item.kitchen_status;
        }
        return acc;
      }, {})
    );

    setKitchenOrders(merged);
  } catch (err) {
    console.error("❌ Fetch kitchen orders failed:", err);
  }
}, []);

  useEffect(() => {
    const interval = setInterval(() => {
      React.startTransition(() => setNow(new Date()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

const fetchPhoneOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/orders?type=phone");

    // Filter for open phone orders (not closed/cancelled)
    setPhoneOrders(
      data.filter((o) => {
        if (o?.order_type !== "phone") return false;
        const status = normalizeOrderStatus(o?.status);
        if (status === "closed") return false;
        if (isOrderCancelledOrCanceled(status)) return false;
        return true;
      })
    );
  } catch (err) {
    console.error("Fetch phone orders failed:", err);
  }
}, []);

const fetchKitchenOpenOrders = useCallback(async () => {
  try {
    setKitchenOpenOrdersLoading(true);
    const data = await secureFetch("/orders");
    const list = Array.isArray(data) ? data : [];

    const openOrders = list
      .filter((o) => {
        const status = normalizeOrderStatus(o?.status);
        if (status === "closed") return false;
        if (isOrderCancelledOrCanceled(status)) return false;
        // include table + phone + packet + takeaway
        const type = String(o?.order_type || "").toLowerCase();
        return ["table", "phone", "packet", "takeaway"].includes(type);
      })
      .map((o) => ({
        ...o,
        status: normalizeOrderStatus(o?.status),
      }))
      .sort((a, b) => {
        const am = parseLooseDateToMs(a?.created_at);
        const bm = parseLooseDateToMs(b?.created_at);
        if (Number.isFinite(am) && Number.isFinite(bm)) return bm - am;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });

    // Phase 1: render order shells quickly.
    setKitchenOpenOrders((prev) => {
      const prevById = new Map();
      (Array.isArray(prev) ? prev : []).forEach((o) => {
        if (o?.id != null) prevById.set(Number(o.id), o);
      });
      return openOrders.map((o) => {
        const prevRow = prevById.get(Number(o.id));
        const knownItems = Array.isArray(prevRow?.items) ? prevRow.items : null;
        return knownItems ? { ...o, items: knownItems } : o;
      });
    });

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
              console.warn("⚠️ Kitchen open order hydrate failed:", err);
              results[current] = null;
            }
          }
        })
      );
      return results.filter(Boolean);
    };

    // Phase 2: hydrate items/payment status for badges.
    const hydrated = await runWithConcurrency(openOrders, 6, async (order) => {
      const itemsRaw = await secureFetch(`/orders/${order.id}/items`);
      const items = Array.isArray(itemsRaw) ? itemsRaw : [];
      const anyUnpaid = items.some((i) => !i.paid_at && !i.paid);
      const inferredPaid = !anyUnpaid;
      return {
        ...order,
        items,
        is_paid: order?.is_paid === true ? true : inferredPaid,
      };
    });

    const hydratedById = new Map(hydrated.map((o) => [Number(o.id), o]));
    setKitchenOpenOrders((prev) =>
      (Array.isArray(prev) ? prev : []).map((o) => hydratedById.get(Number(o.id)) || o)
    );
  } catch (err) {
    console.error("❌ Fetch kitchen open orders failed:", err);
  } finally {
    setKitchenOpenOrdersLoading(false);
  }
}, []);

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
      } catch {}
      return merged;
    });
  } catch {
    // Keep any cached/previous configs so the grid doesn't blink on transient errors.
  }
}, []);


  const loadDataForTab = useCallback(
    (tab) => {
      if (tab === "tables") {
        fetchOrders();
        fetchTableConfigs();
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
      if (tab === "phone") {
        fetchPhoneOrders();
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
      fetchPhoneOrders,
      fetchTableConfigs,
      fetchTakeawayOrders,
    ]
  );

// now safe to reference loadDataForTab
useEffect(() => {
  if (!window.socket) return;
  let rafId = null;
  const refetch = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      if (activeTab !== "packet") fetchPacketOrdersCount();
      // Order updates don't change seats/areas; avoid refetching /tables which can cause UI blinking.
      if (activeTab === "tables") {
        fetchOrders();
        return;
      }
      loadDataForTab(activeTab);
    });
  };
  window.socket.on("orders_updated", refetch);
  // Some backend flows (e.g. closing empty orders) emit `order_closed` without `orders_updated`.
  window.socket.on("order_closed", refetch);
  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (window.socket) {
      window.socket.off("orders_updated", refetch);
      window.socket.off("order_closed", refetch);
    }
  };
}, [activeTab, loadDataForTab, fetchOrders, fetchPacketOrdersCount]);

  useEffect(() => {
    loadDataForTab(activeTab);
  }, [activeTab, loadDataForTab]);

  // Ensure table configs load when Tables tab is active
  useEffect(() => {
    if (activeTab === "tables" && (Array.isArray(tableConfigs) ? tableConfigs.length === 0 : true)) {
      fetchTableConfigs();
    }
  }, [activeTab, tableConfigs.length, fetchTableConfigs]);


const tables = tableConfigs
  .map((cfg) => {
    const orderRaw = orders.find(
      (o) =>
        o.table_number === cfg.number &&
        !isOrderCancelledOrCanceled(o.status)
    );
    const order = isEffectivelyFreeOrder(orderRaw) ? null : orderRaw;

    return {
      tableNumber: cfg.number,
      seats: cfg.seats || cfg.chairs || null,
      area: cfg.area || "Main Hall",
      label: cfg.label || "",
      color: cfg.color || null,
      order,
    };
  })
  .sort((a, b) => a.tableNumber - b.tableNumber);



const handlePrintOrder = async (orderId) => {
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
};


const handleTableClick = (table) => {
  // Use the already-loaded register state to avoid a blocking network request on click.
  // useRegisterGuard on TransactionScreen will still enforce access if the register is closed.
  if (registerState === "closed" || registerState === "unopened") {
    toast.error("Register must be open to access tables!", {
      position: "top-center",
      autoClose: 2500,
    });
    setShowRegisterModal(true);
    return;
  }

  // 🔥 FIXED: treat cancelled or empty orders as FREE
  const isCancelledOrder = isOrderCancelledOrCanceled(table.order?.status);

  if (
    !table.order ||
    isCancelledOrder ||
    !Array.isArray(table.order.items) ||
    table.order.items.length === 0
  ) {
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
  } else {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
  }
};



const getTimeElapsed = (order) => {
  if (!order || order.status !== "confirmed") return null;
  const startMs =
    (Number.isFinite(order.confirmedSinceMs) ? order.confirmedSinceMs : null) ??
    parseLooseDateToMs(order.updated_at || order.created_at);
  if (!Number.isFinite(startMs)) return "00:00";
  const diffMs = now - startMs;
  const mins = Math.floor(Math.max(0, diffMs) / 60000);
  const secs = Math.floor((Math.max(0, diffMs) % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};
 const markMultipleAsDelivered = async (itemIds) => {
  try {
    new Audio("/sound-ready.mp3").play(); // 🔊 Play instantly
await secureFetch("/orders/order-items/kitchen-status", {
  method: "PUT",
  body: JSON.stringify({
    ids: itemIds,
    status: "delivered",
  }),
});

    fetchKitchenOrders();
  } catch (err) {
    console.error("❌ Failed to mark as delivered:", err);
  }
};

  const groupedByTable = orders.reduce((acc, item) => {
  const table = item.table_number;
  if (!acc[table]) acc[table] = [];
  acc[table].push(item);
  return acc;
}, {});

  function safeParse(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data || [];
  } catch {
    return [];
  }
}

// Group tables by area
const groupedTables = tables.reduce((acc, tbl) => {
  const area = tbl.area || "Main Hall";
  if (!acc[area]) acc[area] = [];
  acc[area].push(tbl);
  return acc;
}, {});

const formatAreaLabel = (area) => {
  const raw = area || "Main Hall";
  return t(raw, { defaultValue: raw });
};


  return (
    <div className="min-h-screen bg-transparent px-0 pt-4 relative">
      {canSeePacketTab &&
        activeTab !== "packet" &&
        packetOrdersCount > 0 &&
        !transactionSettings.disableTableOverviewOrdersFloatingButton && (
        <button
          type="button"
          onClick={() => handleTabSelect("packet")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-3 text-white shadow-2xl ring-1 ring-white/20 hover:brightness-110 active:scale-[0.98] transition"
          aria-label={t("Packet")}
        >
          <span className="text-lg leading-none">🛵</span>
          <span className="font-semibold">{t("Packet")}</span>
          <span className="min-w-7 px-2 py-0.5 rounded-full bg-white/20 font-extrabold text-sm text-white text-center">
            {packetOrdersCount}
          </span>
        </button>
      )}
{activeTab === "tables" && (
  <div className="w-full flex flex-col items-center">

    {/* ================= AREA TABS ================= */}
    <div className="flex justify-center gap-3 flex-wrap mt-4 mb-10">

      {/* ALL AREAS */}
	      <button
	        onClick={() => setActiveArea("ALL")}
	        className={`
	          px-5 py-2 rounded-full font-semibold shadow 
	          transition-all duration-150 text-xs
	          ${activeArea === "ALL"
	            ? "bg-indigo-600 text-white scale-[1.03] shadow-lg"
	            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"}
	        `}
	      >
	        {t("All Areas")}
	      </button>

      {Object.keys(groupedTables).map((area) => (
	        <button
	          key={area}
	          onClick={() => setActiveArea(area)}
	          className={`
	            px-5 py-2 rounded-full font-semibold shadow 
	            transition-all duration-150 text-xs
	            ${activeArea === area
	              ? "bg-blue-600 text-white scale-[1.03] shadow-lg"
	              : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50"}
	          `}
	        >
	          {area === "Hall" ? "" :
           area === "Main Hall" ? "" :
           area === "Terrace" ? "" :
           area === "Garden" ? "" :
           area === "VIP" ? "" : ""}{" "}
          {formatAreaLabel(area)}
        </button>
      ))}
    </div>

    {/* ================= TABLE GRID (BIGGER, CENTERED) ================= */}
    <div className="w-full flex justify-center px-4 sm:px-8">
      <div className="
        grid
        grid-cols-2
        md:grid-cols-3
        xl:grid-cols-4
        2xl:grid-cols-4
        gap-3
        sm:gap-8
        place-items-stretch
        w-full
        max-w-[1600px]
      ">

        {(activeArea === "ALL" ? tables : groupedTables[activeArea]).map((table) => {
          const isReservedTable = Boolean(
            table.order &&
              (table.order.status === "reserved" ||
                table.order.order_type === "reservation" ||
                table.order.reservation_date)
          );
          const isFreeTable = !table.order || isEffectivelyFreeOrder(table.order);
          const isPaidTable = !isFreeTable && isOrderPaid(table.order);
          const isUnpaidTable = !isFreeTable && !isPaidTable && hasUnpaidAnywhere(table.order);
          const cardToneClass = isFreeTable
            ? "bg-blue-100 border-sky-300 shadow-sky-500/15"
            : isReservedTable
              ? "bg-orange-100 border-orange-400 shadow-orange-500/20"
              : isUnpaidTable
                ? "bg-red-200 border-red-500 shadow-red-500/25"
                : isPaidTable
                  ? "bg-green-100 border-green-300 shadow-green-500/15"
                  : "bg-indigo-100 border-indigo-500 shadow-indigo-500/20";
          const hasPreparingItems = Array.isArray(table.order?.items)
            ? table.order.items.some((i) => i.kitchen_status === "preparing")
            : false;
          const isKitchenDelivered =
            Boolean(table.order?.kitchen_delivered_at) ||
            (Array.isArray(table.order?.items) &&
              table.order.items.length > 0 &&
              table.order.items.every((i) => i.kitchen_status === "delivered"));
          const readyAtLabel = getReadyAtLabel(table.order, productPrepById);
          const showReadyAt =
            !!readyAtLabel &&
            !isKitchenDelivered &&
            (hasPreparingItems ||
              !!table.order?.estimated_ready_at ||
              !!table.order?.prep_started_at);

          return (
          <div
            key={table.tableNumber}
            onClick={() => handleTableClick(table)}
            className={`
              group relative cursor-pointer
              rounded-3xl
              border-2
              ${cardToneClass}
              shadow-xl
              hover:shadow-2xl
              transition-all duration-200
              flex flex-col justify-between
              w-full
              max-w-[380px]
              min-h-[220px]
              overflow-hidden
            `}
          >

            <div className="p-3 sm:p-5 flex flex-col h-full">
            {/* ------- TOP ROW ------- */}
	            <div className="flex items-center justify-between gap-2 mb-2">
	              <div className="flex items-center gap-2 min-w-0">
	                <span className="text-slate-800 text-base sm:text-lg font-extrabold">
                    {t("Table")}
                  </span>
	                <span className="text-base sm:text-lg font-extrabold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-2 py-0.5">
	                  {String(table.tableNumber).padStart(2, "0")}
	                </span>
	                {table.order?.items?.length > 0 && (
	                  <button
	                    type="button"
	                    onClick={(e) => {
	                      e.stopPropagation();
	                      handlePrintOrder(table.order.id);
	                    }}
	                    className="text-base sm:text-lg font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-2 py-0.5 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
	                  >
	                    🖨️
	                  </button>
	                )}
	              </div>

	              {table.order?.status === "Confirmed" &&
	                table.order?.items?.length > 0 && (
	                <span className="shrink-0 bg-blue-600 text-white rounded-full px-3 py-1 font-mono text-[11px] sm:text-sm shadow-md">
	                  ⏱ {getTimeElapsed(table.order)}
	                </span>
	              )}
	            </div>

            {/* LABEL */}
            {table.label && (
              <div className="text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5 mb-1 w-fit max-w-full truncate">
                {table.label}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {/* AREA */}
              <div className="text-[11px] bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 max-w-full truncate">
                📍 {formatAreaLabel(table.area)}
              </div>

              {/* SEATS */}
              {table.seats && (
                <div className="text-[11px] bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 text-indigo-700 whitespace-nowrap">
                  🪑 {table.seats} {t("Seats")}
                </div>
              )}
            </div>

	            {/* STATUS */}
	            <div className="flex flex-col gap-2 flex-grow">
	              {(!table.order ||
	                (normalizeOrderStatus(table.order.status) === "draft" &&
	                  (!Array.isArray(table.order.items) || table.order.items.length === 0))) ? (
	                <div className="flex items-center justify-between gap-2">
	                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-900 border border-green-200 font-extrabold text-sm shadow-sm whitespace-nowrap">
	                    {t("Free")}
	                  </span>
	                  <span className="text-[15px] sm:text-lg font-extrabold text-indigo-700 whitespace-nowrap">
	                    {formatCurrency(getDisplayTotal(table.order))}
	                  </span>
	                </div>
	              ) : (
	                <>
	                  <div className="flex items-start justify-between gap-2 min-w-0">
	                    <span
                        className={[
                          "inline-flex items-center px-3 py-1 rounded-full text-sm font-extrabold shadow-sm whitespace-nowrap",
                          getTableColor(table.order),
                        ].join(" ")}
                      >
	                      {t(table.order.status === "draft" ? "Free" : table.order.status)}
	                    </span>
                      <div className="flex flex-col items-end min-w-0">
                        <span className="text-[15px] sm:text-lg font-extrabold text-indigo-700 whitespace-nowrap">
                          {formatCurrency(getDisplayTotal(table.order))}
                        </span>
                        {showReadyAt && (
                          <span className="mt-1 inline-flex max-w-full items-center text-[11px] sm:text-xs font-extrabold bg-yellow-100 text-yellow-900 border border-yellow-200 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                            {t("Ready at")} {readyAtLabel}
                          </span>
                        )}
                      </div>
	                  </div>

	                  {/* RESERVATION BADGE */}
	                  {table.order.reservation && table.order.reservation.reservation_date && (
	                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-2xl text-xs">
	                      <div className="font-extrabold text-blue-700 mb-1">🎫 {t("Reserved")}</div>
                      <div className="flex gap-2 text-[10px] text-slate-700 min-w-0">
                        <div className="flex flex-col">
                          <span className="font-semibold whitespace-nowrap">🕐 {table.order.reservation.reservation_time || "—"}</span>
                          <span className="font-semibold whitespace-nowrap">👥 {table.order.reservation.reservation_clients || 0} {t("guests")}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold whitespace-nowrap">📅 {table.order.reservation.reservation_date || "—"}</span>
                          {table.order.reservation.reservation_notes && (
                            <p className="text-[9px] line-clamp-1 text-slate-600">📝 {table.order.reservation.reservation_notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

	                  {/* KITCHEN BADGES */}
	                  {table.order.items && (
	                    <div className="flex flex-wrap gap-1.5 mt-1">
	                      {["new", "preparing", "ready", "delivered"].map((status) => {
	                        const count = table.order.items.filter(
	                          (i) => i.kitchen_status === status
	                        ).length;
	                        if (!count) return null;

	                        return (
	                          <span
	                            key={status}
	                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shadow-sm whitespace-nowrap
	                              ${status === "preparing"
	                                ? "bg-yellow-100 text-yellow-900 border-yellow-200"
	                                : status === "ready"
	                                ? "bg-blue-600 text-white border-blue-700"
	                                : status === "delivered"
	                                ? "bg-green-600 text-white border-green-700"
	                                : "bg-slate-400 text-white border-slate-500"}
	                            `}
	                          >
	                            {count} {t(status)}
	                          </span>
	                        );
	                      })}
	                    </div>
	                  )}
                </>
              )}
            </div>

	            {/* TOTAL + ACTIONS */}
	            <div className="flex items-end justify-between mt-3 sm:mt-4">
	              {isDelayed(table.order) && (
	                <span className="text-amber-600 font-extrabold animate-pulse">⚠️</span>
	              )}

	              <div className="flex flex-col items-end gap-2 ml-auto">
	                {table.order?.items?.length > 0 && (
	                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3">
	                    {/* UNPAID / PAID */}
	                    {hasUnpaidAnywhere(table.order) ? (
	                      <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 font-extrabold rounded-full shadow-sm text-sm whitespace-nowrap">
	                        {t("Unpaid")}
	                      </span>
	                    ) : (
	                      <>
	                        <span className="px-3 py-1 bg-green-50 text-green-900 border border-green-200 font-extrabold rounded-full shadow-sm text-sm whitespace-nowrap">
	                          ✅ {t("Paid")}
	                        </span>

	                        {/* CLOSE TABLE */}
	                        <button
	                          onClick={(e) => {
	                            e.stopPropagation();
	                            handleCloseTable(table.order);
	                          }}
	                          className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold rounded-full shadow text-sm whitespace-nowrap hover:brightness-110 active:scale-[0.99] transition"
	                        >
	                          🔒 {t("Close")}
	                        </button>
	                      </>
	                    )}
	                  </div>
	                )}
	              </div>
	            </div>
            </div>

          </div>
        );
        })}

      </div>
    </div>

  </div>
)}



{activeTab === "takeaway" && (
  <div className="px-6 py-4">
    <h2 className="text-2xl font-bold text-orange-600 mb-5">🥡 {t("Pre Orders")}</h2>

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
      const readyAtLabel = getReadyAtLabel(order, productPrepById);
      const paid = isOrderPaid(order);
      const paymentStatusLabel = paid ? t("Paid") : t("Unpaid");
      const paymentStatusClass = paid
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-amber-100 text-amber-800 border-amber-200";

      const title = (() => {
        if (orderType === "table") return `🍽️ ${t("Table")} ${order.table_number}`;
        if (orderType === "phone") return `📞 ${t("Phone Order")}`;
        if (orderType === "packet") return `🛵 ${t("Packet Order")}`;
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
          className="rounded-3xl bg-white border border-slate-200 shadow-xl p-5 flex flex-col gap-3 hover:shadow-2xl transition"
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


{showRegisterModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-all">
    <div
      className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-[0_20px_70px_rgba(15,23,42,0.35)] border border-slate-200 dark:border-slate-800 mx-3 w-full max-w-[520px] max-h-[90vh] overflow-y-auto p-8 animate-fade-in"
      style={{
        boxShadow: "0 20px 70px 0 rgba(15,23,42,0.28)",
      }}
    >
      {/* Close Button */}
      <button
        onClick={() => {
          setShowRegisterModal(false);
          handleTabSelect("tables");
        }}
        className="absolute top-5 right-5 text-2xl text-gray-400 hover:text-indigo-700 transition-all hover:-translate-y-1"
        title={t("Close")}
        aria-label="Close"
        tabIndex={0}
      >
        <span className="block bg-white/80 dark:bg-gray-800/70 rounded-full p-2 shadow hover:shadow-xl">✕</span>
      </button>

      <div className="space-y-1 mb-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">{t("Register")}</p>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {registerState === "unopened" || registerState === "closed"
            ? t("Open Register")
            : t("Register Summary")}
        </h2>
        <div className="h-px bg-slate-200 dark:bg-slate-700 mt-4" />
      </div>


      {/* Modal Content */}
      {!cashDataLoaded ? (
        <p className="text-center text-gray-500 font-semibold">{t('Loading register data...')}</p>
      ) : registerState === "closed" || registerState === "unopened" ? (
        <>
          {/* Opening Cash Entry */}
          <div className="mb-8 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              {t("Opening Cash")}
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-lg shadow-sm focus:border-blue-500 outline-none transition"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            {yesterdayCloseCash !== null && (
              <p className="text-sm text-slate-500">
                {t("Last Closing")}: {formatCurrency(parsedYesterdayCloseCash)}
              </p>
            )}
          </div>
          {/* Comparison Card */}
          {openingCash !== "" && yesterdayCloseCash !== null && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-2 shadow-sm space-y-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">{t("Opening")}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(parsedOpeningCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("Last Closing")}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(parsedYesterdayCloseCash)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t("Difference")}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    openingDifference !== 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {formatCurrency(openingDifference)}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (() => {
        // Summary content (register is open)
        const expected = Number(expectedCash || 0);
const expense = Number(dailyCashExpense || 0);
const opening = Number(openingCash || 0);

// ✅ calculate entries directly from combinedEvents
const entryTotal = combinedEvents
  .filter(ev => ev.type === "entry")
  .reduce((sum, ev) => sum + parseFloat(ev.amount || 0), 0);

const netCash = opening + expected + entryTotal - expense;


        return (
          <>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm mb-7 space-y-4 text-sm text-slate-700">
              <div className="flex justify-between">
                <span className="text-base sm:text-lg font-semibold text-sky-600">
                  {t("Opening")}
                </span>
                <span className="font-bold text-slate-900 text-lg tabular-nums">
                  {formatCurrency(opening)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base sm:text-lg font-semibold text-emerald-600">
                  {t("Cash Sales")}
                </span>
                <span className="font-bold text-slate-900 text-lg tabular-nums">
                  {formatCurrency(expected)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base sm:text-lg font-semibold text-amber-600">
                  {t("Cash Expenses")}
                </span>
                <span className="font-bold text-slate-900 text-lg tabular-nums">
                  {formatCurrency(expense)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-base sm:text-lg font-semibold text-lime-600">
                  {t("Cash Entries")}
                </span>
                <span className="font-bold text-slate-900 text-lg tabular-nums">
                  {formatCurrency(entryTotal)}
                </span>
              </div>
              <div className="h-px bg-slate-200 my-3" />
              <div className="flex justify-between items-center text-base font-semibold text-slate-900">
                <span>{t("Net Expected Cash")}</span>
                <span className="font-bold text-slate-900 text-lg tabular-nums">
                  {formatCurrency(netCash)}
                </span>
              </div>
            </div>
            {/* Actual Cash Input */}
            <div className="mb-7">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t("Actual Counted Cash")}
              </label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                className={`
                  w-full px-4 py-3 rounded-2xl border-2 text-lg shadow-sm outline-none transition
                  ${actualCash === ""
                    ? "border-gray-300"
                    : parseFloat(actualCash) === netCash
                    ? "border-green-500"
                    : "border-red-500"}
                `}
                placeholder={`${config?.symbol || ""}0.00`}
              />
              {actualCash && (
                parseFloat(actualCash) === netCash
                    ? <p className="text-green-600 font-semibold mt-2">{t('Cash matches perfectly.')}</p>
                    : (
                        <p className="text-red-600 font-semibold mt-2">
                          {t("Difference")}:{" "}
                          {formatCurrency(
                            Math.abs(parseFloat(actualCash || 0) - netCash)
                          )}
                        </p>
                      )
              )}
            </div>
           {registerState === "open" && (
  <div className="mb-7">
    {/* Toggle Entry Form */}
    <button
      type="button"
      onClick={() => setShowEntryForm(v => !v)}
      className={`
        px-4 py-2 rounded-xl font-semibold mb-3 transition-all shadow
        ${showEntryForm ? "bg-slate-200 text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}
      `}
    >
      {showEntryForm ? t("Hide Cash Entry") : t("Add Cash Entry")}
    </button>
    {/* Entry Form */}
    {showEntryForm && (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!entryAmount || isNaN(entryAmount) || Number(entryAmount) <= 0) {
            toast.error("Enter a valid amount");
            return;
          }
try {
  const data = await secureFetch("/reports/cash-register-log", {
    method: "POST",
    body: JSON.stringify({
      type: "entry",
      amount: Number(entryAmount),
      note: entryReason || undefined,
    }),
  });

  toast.success("Cash entry added!");
  setEntryAmount("");
  setEntryReason("");
  setShowEntryForm(false);
  setShowRegisterModal(false);
  setTimeout(() => setShowRegisterModal(true), 350);
} catch (err) {
  console.error("❌ Failed to add cash entry:", err);
  toast.error(err.message || "Failed to add cash entry");
}


          if (res.ok) {
            toast.success("Cash entry added!");
            setEntryAmount("");
            setEntryReason("");
            setShowEntryForm(false);
            // Refresh all cash data and event log
            setShowRegisterModal(false);
            setTimeout(() => setShowRegisterModal(true), 350);
          } else {
            const err = await res.json();
            toast.error(err.error || "Failed to add cash entry");
          }
        }}
        className="flex flex-col gap-2 bg-white/70 rounded-2xl p-4 shadow border border-lime-200"
      >
        <label className="font-semibold text-gray-800">
          Amount ({config?.symbol || ""}):
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={entryAmount}
          onChange={e => setEntryAmount(e.target.value)}
          className="p-3 rounded-xl border-2 border-lime-300 focus:border-lime-500 text-lg mb-1"
          placeholder={`${config?.symbol || ""}0.00`}
          required
        />
        <label className="font-semibold text-gray-800">Reason / Note:</label>
        <input
          type="text"
          value={entryReason}
          onChange={e => setEntryReason(e.target.value)}
          className="p-3 rounded-xl border-2 border-gray-300 focus:border-lime-500 text-base"
          placeholder="Optional note"
          maxLength={40}
        />
        <button
          type="submit"
          className="mt-3 bg-lime-500 hover:bg-lime-600 text-white font-bold py-2 rounded-xl transition"
        >
          Add Cash Entry
        </button>
      </form>
    )}
  </div>
)}


            
          </>
        );
      })()}
{/* --- Register Event Log Toggle --- */}
{todayRegisterEvents && todayRegisterEvents.length > 0 && (
  <div className="mt-5">
    <button
      type="button"
      onClick={() => setShowRegisterLog(v => !v)}
      className={`
        px-4 py-2 rounded-xl font-semibold transition-all shadow
        ${showRegisterLog ? 'bg-blue-200 text-blue-900' : 'bg-gray-100 text-gray-700 hover:bg-blue-100'}
      `}
    >
      {showRegisterLog ? t("Hide Register Log") : t("Show Register Log")}
    </button>
    {showRegisterLog && (
      <div className="bg-white/90 border border-blue-100 rounded-2xl p-4 mt-3 max-h-64 overflow-y-auto shadow">
        {/* Header Row */}
        <div className="flex text-xs font-bold text-gray-400 pb-2 px-1">
          <span className="min-w-[90px]">Type</span>
          <span className="min-w-[90px]">Amount</span>
          <span className="flex-1">Reason / Note</span>
          <span className="w-14 text-right">Time</span>
        </div>
 <ul className="divide-y">
  {combinedEvents.map((event, idx) => (
    <li key={idx} className="flex items-center py-2 gap-2 text-sm">
      <span className="font-semibold min-w-[90px] text-[10px] uppercase tracking-wide text-slate-500">
        {event.type}
      </span>
      <span className="tabular-nums min-w-[90px] font-semibold text-slate-900">
        {event.amount ? formatCurrency(parseFloat(event.amount)) : ""}
      </span>
      <span
        className={`flex-1 text-sm max-w-[180px] ${
          event.type === "entry"
            ? "font-semibold text-lime-800"
            : event.type === "expense"
            ? "font-semibold text-orange-800"
            : "text-gray-600 italic"
        }`}
      >
        {event.note || (["entry", "expense"].includes(event.type) ? "(No reason provided)" : "")}
      </span>
      <span className="ml-auto text-xs text-gray-400">
        {event.created_at &&
          new Date(event.created_at).toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
      </span>
    </li>
  ))}
</ul>

      </div>
    )}
  </div>
)}


      {/* Action Buttons */}
      <div className="flex flex-col gap-4 pt-4 border-t mt-7">
        {showChangeForm && (
          <form
            onSubmit={handleChangeCashSubmit}
            className="flex flex-wrap items-center gap-3 bg-slate-50 rounded-xl p-3 shadow-inner"
          >
            <label className="text-sm font-semibold text-slate-700">
              {t("Change Amount")}
            </label>
            <input
              type="number"
              value={changeAmount}
              onChange={(e) => setChangeAmount(e.target.value)}
              className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-3 py-2"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold shadow hover:bg-emerald-600 transition"
            >
              {t("Log Change")}
            </button>
          </form>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowChangeForm((prev) => !prev)}
            className="rounded-xl border border-emerald-200 px-4 py-2 font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 transition"
          >
            {showChangeForm ? t("Hide Change Cash") : t("Change Cash")}
          </button>
          <button
            onClick={async () => {
  const type =
    registerState === "unopened" || registerState === "closed"
      ? "open"
      : "close";

  const amount = parseFloat(
    registerState === "unopened" || registerState === "closed"
      ? openingCash
      : actualCash
  );

  if (!amount) return toast.error(t("Missing amount"));

  try {
    if (type === "close") {
      let openOrders = [];
      try {
        const all = await secureFetch("/orders");
        openOrders = Array.isArray(all)
          ? all.filter((o) => {
              const status = normalizeOrderStatus(o?.status);
              if (status === "closed") return false;
              if (isOrderCancelledOrCanceled(status)) return false;
              return true;
            })
          : [];
      } catch (e) {
        console.warn("⚠️ Failed to preflight open orders before closing register", e);
      }

      if (openOrders.length > 0) {
        const first = openOrders[0];
        toast.error(
          `Cannot close register: ${openOrders.length} open order(s) still exist. First: ${formatOpenOrderLabel(first)}`
        );
        setShowRegisterModal(false);
        handleTabSelect(getOrderTabHint(first));
        return;
      }
    }

    const result = await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({ type, amount }),
    });

    toast.success(
      type === "open"
        ? t("Register opened successfully.")
        : t("Register closed successfully.")
    );

    refreshRegisterState();
    setShowRegisterModal(false);
  } catch (err) {
    console.error(`❌ Failed to ${type} register:`, err);
    if (
      type === "close" &&
      typeof err?.message === "string" &&
      err.message.toLowerCase().includes("order") &&
      err.message.toLowerCase().includes("open")
    ) {
      try {
        const all = await secureFetch("/orders");
        const openOrders = Array.isArray(all)
          ? all.filter((o) => {
              const status = normalizeOrderStatus(o?.status);
              if (status === "closed") return false;
              if (isOrderCancelledOrCanceled(status)) return false;
              return true;
            })
          : [];
        if (openOrders.length > 0) {
          const first = openOrders[0];
          toast.error(
            `Backend reports open orders. First: ${formatOpenOrderLabel(first)}`
          );
          setShowRegisterModal(false);
          handleTabSelect(getOrderTabHint(first));
          return;
        }
      } catch (e) {
        console.warn("⚠️ Failed to load open orders after register close error", e);
      }
    }
    toast.error(err.message || `${t("Register")} ${type} failed`);
  }
}}

        >
          {(registerState === "unopened" || registerState === "closed")
            ? t('Open Register')
            : t('Close Register')}
        </button>
        </div>
      </div>

      {/* Optional: subtle fade-in animation */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: none; } }
        .animate-fade-in { animation: fade-in 0.36s cubic-bezier(.6,-0.28,.735,.045) both; }
      `}</style>
    </div>
  </div>
)}











  </div>
);



}
