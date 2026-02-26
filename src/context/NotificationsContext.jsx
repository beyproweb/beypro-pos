import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import socket from "../utils/socket";
import { useCurrency } from "./CurrencyContext";

const NotificationsContext = createContext(null);
const isStandalone =
  typeof window !== "undefined" &&
  typeof window.location?.pathname === "string" &&
  window.location.pathname.startsWith("/standalone");

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getCurrentUser() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage?.getItem("beyproUser");
  if (!raw) return null;
  const user = safeJsonParse(raw, null);
  return user && typeof user === "object" ? user : null;
}

function getRestaurantId() {
  const user = getCurrentUser();
  return user?.restaurant_id || window.localStorage?.getItem("restaurant_id") || null;
}

function getUserId() {
  const user = getCurrentUser();
  return user?.id || user?.user_id || null;
}

function toTimeMs(value) {
  if (value === undefined || value === null) return Date.now();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeExtra(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") return safeJsonParse(value, {});
  return {};
}

function inferLink(type, extra) {
  const normalizedType = String(type || "other").toLowerCase();
  const normalizedEvent = String(extra?.event || "").toLowerCase();
  if (extra?.route) return extra.route;
  if (normalizedType === "stock" || normalizedType === "stock_expiry") return "/stock";
  if (normalizedType === "ingredient") return "/ingredient-prices";
  if (normalizedType === "task") return "/task";
  if (normalizedType === "maintenance") return "/maintenance";
  if (normalizedType === "register") return "/tableoverview?tab=register";
  if (normalizedType === "payment") return "/tableoverview?tab=tables";
  if (normalizedType === "order") {
    if (normalizedEvent === "order_preparing" || normalizedEvent === "order_delivered") return "/kitchen";
    return "/tableoverview?tab=tables";
  }
  if (normalizedType === "driver") return "/orders";
  if (normalizedType === "customer_call") return "/tableoverview?tab=tables";
  return null;
}

function normalizeTableValue(value) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  return text || null;
}

function extractTableLabelFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const tableKeys = ["table_label", "tableLabel", "table_number", "tableNumber", "table"];
  for (const key of tableKeys) {
    const candidate = normalizeTableValue(payload[key]);
    if (candidate) return candidate;
  }
  const nested = payload.order;
  if (nested && typeof nested === "object") {
    for (const key of tableKeys) {
      const candidate = normalizeTableValue(nested[key]);
      if (candidate) return candidate;
    }
  }
  return null;
}

function extractTableNumberFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const tableKeys = ["table_number", "tableNumber", "table", "table_label", "tableLabel"];
  for (const key of tableKeys) {
    const raw = payload[key];
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return num;
  }
  const nested = payload.order;
  if (nested && typeof nested === "object") {
    for (const key of tableKeys) {
      const raw = nested[key];
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  return null;
}

function buildCustomerCallMessage(payload, fallback = "Table is calling waiter") {
  const tableNo = extractTableNumberFromPayload(payload);
  if (Number.isFinite(tableNo)) return `Table ${tableNo} is calling waiter`;
  const tableRef = extractTableLabelFromPayload(payload);
  if (tableRef) return `Table ${tableRef} is calling waiter`;
  return fallback;
}

function buildNewOrderNotificationMessage(payload, fallback = "New order") {
  const tableRef = extractTableLabelFromPayload(payload);
  if (tableRef) return `New order on Table ${tableRef}`;
  return fallback;
}

function buildKitchenDeliveredNotificationMessage(payload, fallback = "Kitchen delivered order") {
  const tableRef = extractTableLabelFromPayload(payload);
  
  // Extract order details
  const orderData = payload?.order || payload;
  const orderType = String(orderData?.order_type || "").toLowerCase().trim();
  const customerName = String(orderData?.customer_name || "").trim();
  const externalId = orderData?.external_id || orderData?.externalId || "";
  const externalSource = String(orderData?.external_source || "").toLowerCase();
  const orderId = orderData?.id || orderData?.order_id || "";
  
  // Table order
  if (tableRef) {
    return `Kitchen Delivered Table ${tableRef}`;
  }
  
  // Online order (Yemeksepeti, Migros, etc.)
  if (externalId && externalSource) {
    const sourceName = externalSource === "yemeksepeti" ? "Yemeksepeti" : 
                       externalSource === "migros" ? "Migros" : 
                       externalSource.charAt(0).toUpperCase() + externalSource.slice(1);
    const customerInfo = customerName ? ` - ${customerName}` : "";
    return `Kitchen Delivered ${sourceName} order #${externalId}${customerInfo}`;
  }
  
  // Phone/packet order
  if (orderType === "packet" || orderType === "phone") {
    const customerInfo = customerName ? ` - ${customerName}` : "";
    const orderInfo = orderId ? ` #${orderId}` : "";
    return `Kitchen Delivered Phone order${orderInfo}${customerInfo}`;
  }
  
  return fallback;
}

function buildKitchenPreparingNotificationMessage(payload, fallback = "Kitchen preparing order") {
  const tableRef = extractTableLabelFromPayload(payload);
  
  // Extract order details
  const orderData = payload?.order || payload;
  const orderType = String(orderData?.order_type || "").toLowerCase().trim();
  const customerName = String(orderData?.customer_name || "").trim();
  const externalId = orderData?.external_id || orderData?.externalId || "";
  const externalSource = String(orderData?.external_source || "").toLowerCase();
  const orderId = orderData?.id || orderData?.order_id || "";
  
  // Table order
  if (tableRef) {
    return `Kitchen preparing Table ${tableRef}`;
  }
  
  // Online order (Yemeksepeti, Migros, etc.)
  if (externalId && externalSource) {
    const sourceName = externalSource === "yemeksepeti" ? "Yemeksepeti" : 
                       externalSource === "migros" ? "Migros" : 
                       externalSource.charAt(0).toUpperCase() + externalSource.slice(1);
    const customerInfo = customerName ? ` - ${customerName}` : "";
    return `Kitchen preparing ${sourceName} order #${externalId}${customerInfo}`;
  }
  
  // Phone/packet order
  if (orderType === "packet" || orderType === "phone") {
    const customerInfo = customerName ? ` - ${customerName}` : "";
    const orderInfo = orderId ? ` #${orderId}` : "";
    return `Kitchen preparing Phone order${orderInfo}${customerInfo}`;
  }
  
  return fallback;
}

function buildOrderCancelledNotificationMessage(payload, fallback = "Order cancelled") {
  const tableRef = extractTableLabelFromPayload(payload);
  const reason = payload?.reason ? ` (${payload.reason})` : "";
  if (tableRef) return `Order cancelled Table ${tableRef}${reason}`;
  return `${fallback}${reason}`;
}

function buildPaymentNotificationMessage(extra, formatCurrency) {
  if (!extra) return null;
  const tableRef = extractTableLabelFromPayload(extra);
  const amountValue =
    extra.order_total_with_extras ??
    extra.orderTotalWithExtras ??
    extra.amount ??
    extra.total ??
    extra.payment_total ??
    extra.order_total ??
    null;
  let amountText = null;
  if (amountValue !== undefined && amountValue !== null) {
    if (typeof formatCurrency === "function") {
      try {
        amountText = formatCurrency(amountValue);
      } catch {
        amountText = String(amountValue);
      }
    } else {
      amountText = String(amountValue);
    }
  }

  const segments = [];
  if (tableRef) segments.push(`Table ${tableRef}`);
  if (amountText) segments.push(`Paid ${amountText}`);
  else if (amountValue !== undefined && amountValue !== null) segments.push(`Paid ${amountValue}`);
  else segments.push("Paid");

  return segments.join(" ");
}

function getYsStatusLabel(event) {
  const normalized = String(event || "").toLowerCase();
  if (!normalized.startsWith("ys_order_")) return null;
  return normalized.replace("ys_order_", "").replace(/_/g, " ");
}

function normalizeNotification(raw, formatCurrency) {
  const extra = normalizeExtra(raw?.extra);
  const type = String(raw?.type || "other").toLowerCase();
  const timeMs = toTimeMs(raw?.time ?? raw?.timestamp ?? raw?.created_at);
  let message = String(raw?.message || "").trim() || "Notification";

  if (type === "payment") {
    const paymentMessage = buildPaymentNotificationMessage(extra, formatCurrency);
    if (paymentMessage) {
      message = paymentMessage;
    }
  }

  if (type === "driver") {
    const driverName = String(extra?.driverName || extra?.driver_name || "").trim();
    const orderId = extra?.orderId ?? extra?.order_id ?? extra?.id ?? null;
    if (driverName && !message.toLowerCase().includes(driverName.toLowerCase())) {
      const suffix = orderId ? `order #${orderId}` : "order";
      message = `${driverName} assigned to ${suffix}`;
    }
  }

  if (type === "stock") {
    const event = String(extra?.event || "").toLowerCase();
    if (event === "stock_deducted") {
      const name = extra?.stockName || extra?.stock_name || extra?.name || "Stock";
      const qty = extra?.quantity ?? extra?.qty ?? null;
      const unit = extra?.unit || "";
      const qtyText = qty !== null && qty !== undefined ? ` (-${qty} ${unit})`.trim() : "";
      message = `Stock deducted: ${name}${qtyText ? ` ${qtyText}` : ""}`;
    }
  }

  if (type === "order") {
    const fallback = message;
    const event = String(extra?.event || "").toLowerCase();
    const orderNumber = extra?.order_number ?? extra?.orderNumber ?? null;
    const orderId = extra?.orderId ?? extra?.order_id ?? null;
    const orderSuffix = orderNumber ? `#${orderNumber}` : orderId ? `#${orderId}` : "";
    const ysLabel = getYsStatusLabel(event);
    if (ysLabel) {
      message = `Yemeksepeti order ${orderSuffix} ${ysLabel}`.replace(/\s{2,}/g, " ").trim();
    } else if (event === "order_confirmed") {
      message = buildNewOrderNotificationMessage(extra, fallback);
    } else if (event === "order_preparing") {
      // extra.order contains the full order data from backend
      const payload = extra?.order ? { order: extra.order } : extra;
      message = buildKitchenPreparingNotificationMessage(payload, fallback);
    } else if (event === "order_delivered") {
      // extra.order contains the full order data from backend
      const payload = extra?.order ? { order: extra.order } : extra;
      message = buildKitchenDeliveredNotificationMessage(payload, fallback);
    } else if (event === "order_cancelled") {
      message = buildOrderCancelledNotificationMessage(extra, fallback);
    }
  }

  return {
    id: raw?.id ?? `${type}_${timeMs}_${Math.random().toString(16).slice(2)}`,
    message,
    type,
    time: raw?.time ?? raw?.timestamp ?? raw?.created_at ?? timeMs,
    timeMs,
    stock_id: raw?.stock_id ?? null,
    extra,
    link: inferLink(type, extra),
    source: raw?.source || (raw?.id ? "db" : "socket"),
  };
}

function mergeKeyForNotification(notification) {
  const type = String(notification?.type || "other").toLowerCase();
  const extra = notification?.extra && typeof notification.extra === "object" ? notification.extra : {};

  const orderId = extra.orderId ?? extra.order_id ?? extra.id;
  if (type === "order" && orderId) {
    const event = String(extra?.event || "").toLowerCase();
    return event ? `order:${orderId}:${event}` : `order:${orderId}`;
  }
  if ((type === "payment" || type === "driver") && orderId) {
    return `order:${orderId}`;
  }

  const taskId = extra.taskId ?? extra.task_id ?? extra.id;
  if (type === "task" && taskId) return `task:${taskId}`;

  const issueId = extra.issueId ?? extra.issue_id ?? extra.id;
  if (type === "maintenance" && issueId) return `maintenance:${issueId}`;

  const stockId = notification?.stock_id ?? extra.stockId ?? extra.stock_id;
  if ((type === "stock" || type === "stock_expiry") && stockId) return `stock:${stockId}`;

  if (orderId) return `order:${orderId}`;
  return `${type}:${notification?.message || ""}`;
}

function dedupe(items, next) {
  const mergeKey = mergeKeyForNotification(next);
  if (mergeKey) {
    const existingIndex = items.findIndex((n) => mergeKeyForNotification(n) === mergeKey);
    if (existingIndex !== -1) {
      const copy = items.slice();
      copy.splice(existingIndex, 1);
      return [next, ...copy].slice(0, 200);
    }
  }

  const fingerprint = `${String(next.type)}|${String(next.message)}`;
  const windowMs = 6000;
  const last = items.slice(0, 8);
  for (const existing of last) {
    const existingFingerprint = `${String(existing.type)}|${String(existing.message)}`;
    if (existingFingerprint !== fingerprint) continue;
    if (Math.abs((existing.timeMs || 0) - (next.timeMs || 0)) <= windowMs) return items;
  }
  return [next, ...items].slice(0, 200);
}

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [customerCalls, setCustomerCalls] = useState({});
  const [bellOpen, setBellOpen] = useState(false);
  const [summaries, setSummaries] = useState({
    criticalStock: null,
    openMaintenance: null,
    inProgressTasks: null,
  });
  const driversCacheRef = useRef({ fetchedAtMs: 0, byId: new Map() });
  const tableCacheRef = useRef(new Map());
  const { formatCurrency } = useCurrency();
  const formatCurrencyRef = useRef(formatCurrency);

  useEffect(() => {
    formatCurrencyRef.current = formatCurrency;
  }, [formatCurrency]);

  const restaurantIdRef = useRef(getRestaurantId());
  const registerStatusRef = useRef(null);
  const lastSeenKeyRef = useRef(null);

  const clearCustomerCall = useCallback((tableNumber) => {
    const tableNum = Number(tableNumber);
    if (!Number.isFinite(tableNum) || tableNum <= 0) return;
    setCustomerCalls((prev) => {
      const key = String(tableNum);
      if (!prev?.[key]) return prev;
      const next = { ...(prev || {}) };
      delete next[key];
      return next;
    });
  }, []);

  const upsertCustomerCall = useCallback((payload = {}) => {
    const tableNumber = extractTableNumberFromPayload(payload);
    if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;
    const key = String(tableNumber);
    const requestedAt = payload?.requested_at || payload?.time || new Date().toISOString();
    setCustomerCalls((prev) => ({
      ...(prev || {}),
      [key]: {
        tableNumber,
        tableLabel: extractTableLabelFromPayload(payload),
        requestId: payload?.request_id || payload?.requestId || null,
        requestedAt,
        source: payload?.source || "socket",
      },
    }));
    return tableNumber;
  }, []);

  const acknowledgeCustomerCall = useCallback((tableNumber) => {
    const tableNum = Number(tableNumber);
    if (!Number.isFinite(tableNum) || tableNum <= 0) return;
    try {
      socket.emit("customer_call_acknowledge", { table_number: tableNum });
    } catch {
      // best-effort emit
    }
    clearCustomerCall(tableNum);
  }, [clearCustomerCall]);

  const resolveCustomerCall = useCallback((tableNumber) => {
    const tableNum = Number(tableNumber);
    if (!Number.isFinite(tableNum) || tableNum <= 0) return;
    try {
      socket.emit("customer_call_resolve", { table_number: tableNum });
    } catch {
      // best-effort emit
    }
    clearCustomerCall(tableNum);
  }, [clearCustomerCall]);

  const resolveStorageKey = useCallback(() => {
    const rid = getRestaurantId();
    const uid = getUserId();
    if (!rid) return null;
    return `beyproNotificationsLastSeen_${rid}_${uid || "anon"}`;
  }, []);

  const [lastSeenAtMs, setLastSeenAtMs] = useState(() => {
    const key = resolveStorageKey();
    if (!key) return 0;
    const raw = window.localStorage?.getItem(key);
    if (raw === null || raw === undefined || raw === "") return Date.now();
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Date.now();
  });

  const persistLastSeen = useCallback((nextMs) => {
    const key = resolveStorageKey();
    if (!key) return;
    lastSeenKeyRef.current = key;
    try {
      window.localStorage?.setItem(key, String(nextMs));
    } catch {
      /* ignore */
    }
  }, [resolveStorageKey]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setLastSeenAtMs(now);
    persistLastSeen(now);
  }, [persistLastSeen]);

  const upsertTableCache = useCallback((orderId, extra = {}) => {
    if (!orderId) return;
    const tableNumber =
      extra.table_number ?? extra.tableNumber ?? extra.table ?? extra.table_label ?? extra.tableLabel ?? null;
    const tableLabel = extra.table_label ?? extra.tableLabel ?? null;
    if (tableNumber !== null || tableLabel !== null) {
      tableCacheRef.current.set(orderId, { table_number: tableNumber, table_label: tableLabel });
    }
  }, []);

  const ensureTableOnExtra = useCallback(
    (raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const extra = raw.extra && typeof raw.extra === "object" ? { ...raw.extra } : {};
      const orderId =
        extra.orderId ??
        extra.order_id ??
        raw.orderId ??
        raw.order_id ??
        raw.id ??
        null;

      // Merge from cache if missing
      if (orderId) {
        const cached = tableCacheRef.current.get(orderId);
        if (cached) {
          if (
            extra.table_number === undefined &&
            extra.tableNumber === undefined &&
            extra.table === undefined &&
            extra.table_label === undefined &&
            extra.tableLabel === undefined
          ) {
            extra.table_number = cached.table_number ?? extra.table_number;
            extra.table_label = cached.table_label ?? extra.table_label;
          }
        }
        // Record any table info present on this payload
        upsertTableCache(orderId, extra);
      }

      return { ...raw, extra };
    },
    [upsertTableCache]
  );

  const pushNotification = useCallback(
    (raw) => {
      const enriched = ensureTableOnExtra(raw);
      const next = normalizeNotification(enriched, formatCurrencyRef.current);
      setItems((prev) => dedupe(prev, next));
      if (bellOpen) {
        // If drawer is open, treat incoming notifications as "seen".
        setLastSeenAtMs((prev) => {
          const now = Date.now();
          if (now <= prev) return prev;
          persistLastSeen(now);
          return now;
        });
      }
    },
    [bellOpen, persistLastSeen]
  );

  const fetchTableMeta = useCallback(async (orderId) => {
    if (!orderId) return { table_number: null, table_label: null };
    const cache = tableCacheRef.current;
    if (cache.has(orderId)) return cache.get(orderId);
    try {
      const res = await secureFetch(`/orders/${orderId}`);
      const table_number =
        res?.table_number ?? res?.tableNumber ?? res?.table ?? res?.order?.table_number ?? null;
      const table_label = res?.table_label ?? res?.tableLabel ?? res?.order?.table_label ?? null;
      const meta = { table_number, table_label };
      cache.set(orderId, meta);
      return meta;
    } catch {
      return { table_number: null, table_label: null };
    }
  }, []);

  // Register open/close notifications
  useEffect(() => {
    const isStandalone =
      typeof window !== "undefined" &&
      typeof window.location?.pathname === "string" &&
      window.location.pathname.startsWith("/standalone");
    if (isStandalone) {
      return () => {};
    }

    let isActive = true;
    let timeoutId = null;
    let pollMs = 20000;

    const schedule = (nextMs) => {
      if (!isActive) return;
      timeoutId = window.setTimeout(tick, nextMs);
    };

    const normalizeRegisterStatus = (value) => {
      const raw = String(value || "").toLowerCase().trim();
      if (raw === "open") return "open";
      if (raw === "closed") return "closed";
      if (raw === "unopened") return "unopened";
      return raw || "unknown";
    };

    const tick = async () => {
      try {
        const rid = getRestaurantId();
        const hasToken = !!getAuthToken();
        if (!rid || !hasToken) {
          schedule(pollMs);
          return;
        }

        const data = await secureFetch("/reports/cash-register-status");
        if (!isActive) return;
        const nextStatus = normalizeRegisterStatus(data?.status);

        if (registerStatusRef.current === null) {
          registerStatusRef.current = nextStatus;
          schedule(pollMs);
          return;
        }

        const prevStatus = registerStatusRef.current;
        if (nextStatus !== prevStatus) {
          registerStatusRef.current = nextStatus;
          pollMs = 20000;

          if (nextStatus === "open") {
            pushNotification({
              message: "🔓 Register opened",
              type: "register",
              time: Date.now(),
              extra: { status: nextStatus },
              source: "poll",
            });
          } else if (nextStatus === "closed" || nextStatus === "unopened") {
            pushNotification({
              message: "🔐 Register closed",
              type: "register",
              time: Date.now(),
              extra: { status: nextStatus },
              source: "poll",
            });
          }
        }

        schedule(pollMs);
      } catch (err) {
        console.warn("⚠️ Failed to poll register status", err?.message || err);
        pollMs = Math.min(Math.max(pollMs, 20000) * 2, 2 * 60 * 1000);
        schedule(pollMs);
      }
    };

    tick();

    return () => {
      isActive = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [pushNotification]);

  const refresh = useCallback(async () => {
    if (isStandalone) return;
    const rid = getRestaurantId();
    if (!rid) return;
    try {
      const rows = await secureFetch("/notifications?limit=120");
      if (!Array.isArray(rows)) return;
      const normalized = rows.map((r) =>
        normalizeNotification({ ...r, source: "db" }, formatCurrencyRef.current)
      );
      setItems((prev) => {
        let merged = prev.slice();
        for (const n of normalized) {
          merged = dedupe(merged, n);
        }
        return merged;
      });
    } catch (err) {
      console.warn("⚠️ Failed to refresh notifications", err?.message || err);
    }
  }, []);

  const clearAll = useCallback(async () => {
    if (isStandalone) {
      setItems([]);
      markAllRead();
      return;
    }
    try {
      await secureFetch("/notifications/clear", { method: "DELETE" });
    } catch (err) {
      console.warn("⚠️ Failed to clear notifications in backend", err?.message || err);
    } finally {
      setItems([]);
      markAllRead();
    }
  }, [markAllRead]);

  const syncCustomerCallSound = useCallback(() => {
    const hasActiveCalls = Object.keys(customerCalls || {}).length > 0;
    const settings = window?.notificationSettings || {};
    const notificationsEnabled = settings.enabled !== false;
    const soundsEnabled = settings.enableSounds !== false;
    const callWaiterEnabled = settings.enableCallWaiterAlerts !== false;

    if (hasActiveCalls && notificationsEnabled && soundsEnabled && callWaiterEnabled) {
      if (typeof window?.startCallWaiterSound === "function") {
        window.startCallWaiterSound();
      }
      return;
    }

    if (typeof window?.stopCallWaiterSound === "function") {
      window.stopCallWaiterSound();
    }
  }, [customerCalls]);

  useEffect(() => {
    syncCustomerCallSound();
  }, [syncCustomerCallSound]);

  useEffect(() => {
    const onSettingsUpdated = () => syncCustomerCallSound();
    window.addEventListener("notification_settings_updated", onSettingsUpdated);
    return () => {
      window.removeEventListener("notification_settings_updated", onSettingsUpdated);
    };
  }, [syncCustomerCallSound]);

  useEffect(() => {
    return () => {
      if (typeof window?.stopCallWaiterSound === "function") {
        window.stopCallWaiterSound();
      }
    };
  }, []);

  const loadSummaries = useCallback(async () => {
    if (isStandalone) return;
    try {
      const [criticalStock, openMaintenance, inProgressTasks] = await Promise.all([
        secureFetch("/stock/critical").catch(() => null),
        secureFetch("/maintenance?status=open").catch(() => null),
        secureFetch("/tasks?status=in_progress").catch(() => null),
      ]);
      setSummaries({
        criticalStock: Array.isArray(criticalStock) ? criticalStock.length : null,
        openMaintenance: Array.isArray(openMaintenance) ? openMaintenance.length : null,
        inProgressTasks: Array.isArray(inProgressTasks) ? inProgressTasks.length : null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Handle restaurant switches or late login
  useEffect(() => {
    const int = window.setInterval(() => {
      const current = getRestaurantId();
      if (current && current !== restaurantIdRef.current) {
        restaurantIdRef.current = current;
        const key = resolveStorageKey();
        lastSeenKeyRef.current = key;
        const raw = key ? window.localStorage?.getItem(key) : null;
        const parsed = raw ? Number(raw) : Date.now();
        setLastSeenAtMs(Number.isFinite(parsed) ? parsed : Date.now());
        setItems([]);
        refresh();
      }
    }, 1500);
    return () => window.clearInterval(int);
  }, [refresh, resolveStorageKey]);

  // Initial load
  useEffect(() => {
    if (!isStandalone) {
      refresh();
    }
  }, [refresh]);

  // When the bell opens, mark read and load quick summaries.
  useEffect(() => {
    if (!bellOpen || isStandalone) return;
    markAllRead();
    refresh();
    loadSummaries();
  }, [bellOpen, loadSummaries, markAllRead, refresh]);

  // Socket listeners → bell
  useEffect(() => {
    const onAlert = (payload = {}) => {
      if (!payload?.message) return;
      pushNotification({
        message: payload.message,
        type: payload.type || "other",
        time: payload.time || Date.now(),
        extra: payload,
        source: "socket",
      });
    };

    const onOrderConfirmed = (payload = {}) => {
      const order = payload?.order || {};
      const id = order?.id || payload?.orderId || payload?.id;
      const orderNumber = order?.order_number || payload?.order_number || payload?.number;
      const suffix = orderNumber ? `#${orderNumber}` : id ? `#${id}` : "";
      const message = buildNewOrderNotificationMessage(payload, `New order ${suffix}`.trim());
      pushNotification({
        message,
        type: "order",
        time: Date.now(),
        extra: {
          event: "order_confirmed",
          orderId: id,
          order_number: orderNumber,
          order_type: order?.order_type,
          table_number: order?.table_number ?? null,
          table_label: order?.table_label ?? null,
        },
        source: "socket",
      });
    };

    const onOrderPreparing = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      const enrichAndPush = async () => {
        let enriched = payload;
        if (!payload?.table_number && !payload?.table_label) {
          const meta = await fetchTableMeta(orderId);
          enriched = { ...payload, ...meta };
        }
        // Build order object for message builder
        const orderData = {
          id: orderId,
          order_id: payload?.order_id,
          table_number: enriched?.table_number,
          table_label: enriched?.table_label,
          customer_name: payload?.customer_name,
          order_type: payload?.order_type,
          external_source: payload?.external_source,
          external_id: payload?.external_id,
        };
        const message = buildKitchenPreparingNotificationMessage(
          { order: orderData },
          `Kitchen preparing order ${suffix}`.trim()
        );
        pushNotification({
          message,
          type: "order",
          time: Date.now(),
          extra: { event: "order_preparing", order: orderData },
          source: "socket",
        });
      };
      enrichAndPush();
    };

    const onOrderDelivered = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      const enrichAndPush = async () => {
        let enriched = payload;
        if (!payload?.table_number && !payload?.table_label) {
          const meta = await fetchTableMeta(orderId);
          enriched = { ...payload, ...meta };
        }
        // Build order object for message builder
        const orderData = {
          id: orderId,
          order_id: payload?.order_id,
          table_number: enriched?.table_number,
          table_label: enriched?.table_label,
          customer_name: payload?.customer_name,
          order_type: payload?.order_type,
          external_source: payload?.external_source,
          external_id: payload?.external_id,
        };
        const message = buildKitchenDeliveredNotificationMessage(
          { order: orderData },
          `Kitchen delivered order ${suffix}`.trim()
        );
        pushNotification({
          message,
          type: "order",
          time: Date.now(),
          extra: { event: "order_delivered", order: orderData },
          source: "socket",
        });
      };
      enrichAndPush();
    };

      const onOrderCancelled = (payload = {}) => {
        const orderId = payload?.orderId || payload?.id;
        const suffix = orderId ? `#${orderId}` : "";
        const message = buildOrderCancelledNotificationMessage(
          payload,
          `Order cancelled ${suffix}`.trim()
        );
        pushNotification({
          message,
          type: "order",
          time: Date.now(),
          extra: { event: "order_cancelled", orderId, ...payload },
          source: "socket",
        });
      };

    const onCustomerCall = (payload = {}) => {
      const tableNumber = upsertCustomerCall(payload);
      if (!Number.isFinite(tableNumber)) return;
      pushNotification({
        message: buildCustomerCallMessage(payload),
        type: "customer_call",
        time: Date.now(),
        extra: {
          event: "customer_call_requested",
          table_number: tableNumber,
          table_label: payload?.table_label ?? payload?.tableLabel ?? null,
          request_id: payload?.request_id ?? payload?.requestId ?? null,
          ...payload,
        },
        source: "socket",
      });
    };

    const onCustomerCallAcknowledged = (payload = {}) => {
      const tableNumber = extractTableNumberFromPayload(payload);
      if (!Number.isFinite(tableNumber)) return;
      clearCustomerCall(tableNumber);
      pushNotification({
        message: `Table ${tableNumber} waiter call acknowledged`,
        type: "customer_call",
        time: Date.now(),
        extra: { event: "customer_call_acknowledged", table_number: tableNumber, ...payload },
        source: "socket",
      });
    };

    const onCustomerCallResolved = (payload = {}) => {
      const tableNumber = extractTableNumberFromPayload(payload);
      if (!Number.isFinite(tableNumber)) return;
      clearCustomerCall(tableNumber);
      pushNotification({
        message: `Table ${tableNumber} waiter call resolved`,
        type: "customer_call",
        time: Date.now(),
        extra: { event: "customer_call_resolved", table_number: tableNumber, ...payload },
        source: "socket",
      });
    };

    const onPayment = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      pushNotification({
        message: `Payment made ${suffix}`.trim(),
        type: "payment",
        time: payload?.timestamp || Date.now(),
        extra: { event: "payment_made", ...payload, orderId },
        source: "socket",
      });
    };

    const fetchDriverName = async (driverId) => {
      const now = Date.now();
      const cached = driversCacheRef.current || { fetchedAtMs: 0, byId: new Map() };
      const byId = cached.byId || new Map();

      if (byId.has(driverId)) return byId.get(driverId) || null;
      if (now - (cached.fetchedAtMs || 0) < 60_000) return null;

      try {
        const list = await secureFetch("/staff/drivers");
        const rows = Array.isArray(list) ? list : list?.drivers || [];
        const nextMap = new Map();
        for (const row of rows) {
          const id = row?.id;
          if (id === null || id === undefined || id === "") continue;
          nextMap.set(Number(id), row?.name ? String(row.name).trim() : null);
        }
        driversCacheRef.current = { fetchedAtMs: now, byId: nextMap };
        return nextMap.get(Number(driverId)) || null;
      } catch {
        driversCacheRef.current = { fetchedAtMs: now, byId };
        return null;
      }
    };

    const onDriverAssigned = async (payload = {}) => {
      const driverId = payload?.driverId ?? payload?.driver_id ?? null;
      let driverName = payload?.driverName || payload?.driver_name || null;
      if (!driverName && driverId) {
        driverName = await fetchDriverName(Number(driverId));
      }

      const orderId = payload?.orderId ?? payload?.order_id ?? payload?.id ?? null;
      const suffix = orderId ? `order #${orderId}` : "order";
      pushNotification({
        message: `${driverName || "Driver"} assigned to ${suffix}`.trim(),
        type: "driver",
        time: Date.now(),
        extra: { event: "driver_assigned", ...payload, driverId, driverName, orderId },
        source: "socket",
      });
    };

    const onDriverDelivered = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id || payload?.order_id;
      const customerName = String(
        payload?.customer_name || payload?.customerName || payload?.customer || ""
      ).trim();

      const message = customerName
        ? `Order (${customerName}) delivered`
        : orderId
          ? `Order #${orderId} delivered`
          : "Order delivered";

      pushNotification({
        message,
        type: "driver",
        time: Date.now(),
        extra: { event: "driver_delivered", orderId, customerName, ...payload },
        source: "socket",
      });
    };

    const onDriverOnRoad = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id || payload?.order_id;
      const customerName = String(
        payload?.customer_name || payload?.customerName || payload?.customer || ""
      ).trim();

      const message = customerName
        ? `${customerName} - on the way`
        : orderId
          ? `Order #${orderId} - on the way`
          : "On the way";

      pushNotification({
        message,
        type: "driver",
        time: Date.now(),
        extra: { event: "driver_on_road", orderId, customerName, ...payload },
        source: "socket",
      });
    };

    const onTaskCreated = (task = {}) => {
      if (!task?.title) return;
      pushNotification({
        message: `New task: ${task.title}`,
        type: "task",
        time: task?.created_at || Date.now(),
        extra: { event: "task_created", taskId: task?.id, status: task?.status, title: task?.title },
        source: "socket",
      });
    };

    const onTaskUpdated = (task = {}) => {
      if (!task?.title) return;
      if (String(task.status).toLowerCase() === "completed") {
        pushNotification({
          message: `Task completed: ${task.title}`,
          type: "task",
          time: task?.completed_at || Date.now(),
          extra: { event: "task_completed", taskId: task?.id, status: task?.status, title: task?.title },
          source: "socket",
        });
      }
    };

    const onMaintenanceCreated = (row = {}) => {
      if (!row?.title) return;
      pushNotification({
        message: `Maintenance created: ${row.title}`,
        type: "maintenance",
        time: row?.created_at || Date.now(),
        extra: {
          event: "maintenance_created",
          issueId: row?.id,
          status: row?.status,
          priority: row?.priority,
          title: row?.title,
        },
        source: "socket",
      });
    };

    const onMaintenanceUpdated = (row = {}) => {
      if (!row?.title) return;
      const status = String(row?.status || "").toLowerCase();
      if (status === "resolved") {
        pushNotification({
          message: `Maintenance resolved: ${row.title}`,
          type: "maintenance",
          time: row?.resolved_at || row?.updated_at || Date.now(),
          extra: {
            event: "maintenance_resolved",
            issueId: row?.id,
            status: row?.status,
            priority: row?.priority,
            title: row?.title,
          },
          source: "socket",
        });
      }
    };

    socket.on("alert_event", onAlert);
    socket.on("order_confirmed", onOrderConfirmed);
    socket.on("order_preparing", onOrderPreparing);
    socket.on("order_delivered", onOrderDelivered);
    socket.on("order_cancelled", onOrderCancelled);
    socket.on("customer_call", onCustomerCall);
    socket.on("customer_call_acknowledged", onCustomerCallAcknowledged);
    socket.on("customer_call_resolved", onCustomerCallResolved);
    socket.on("payment_made", onPayment);
    socket.on("driver_assigned", onDriverAssigned);
    socket.on("driver_on_road", onDriverOnRoad);
    socket.on("driver_delivered", onDriverDelivered);
    socket.on("task_created", onTaskCreated);
    socket.on("task_updated", onTaskUpdated);
    socket.on("maintenance_created", onMaintenanceCreated);
    socket.on("maintenance_updated", onMaintenanceUpdated);

    return () => {
      socket.off("alert_event", onAlert);
      socket.off("order_confirmed", onOrderConfirmed);
      socket.off("order_preparing", onOrderPreparing);
      socket.off("order_delivered", onOrderDelivered);
      socket.off("order_cancelled", onOrderCancelled);
      socket.off("customer_call", onCustomerCall);
      socket.off("customer_call_acknowledged", onCustomerCallAcknowledged);
      socket.off("customer_call_resolved", onCustomerCallResolved);
      socket.off("payment_made", onPayment);
      socket.off("driver_assigned", onDriverAssigned);
      socket.off("driver_on_road", onDriverOnRoad);
      socket.off("driver_delivered", onDriverDelivered);
      socket.off("task_created", onTaskCreated);
      socket.off("task_updated", onTaskUpdated);
      socket.off("maintenance_created", onMaintenanceCreated);
      socket.off("maintenance_updated", onMaintenanceUpdated);
    };
  }, [pushNotification, upsertCustomerCall, clearCustomerCall]);

  const unread = useMemo(() => {
    if (!items.length) return 0;
    const cutoff = Number(lastSeenAtMs) || 0;
    return items.reduce((count, n) => (n.timeMs > cutoff ? count + 1 : count), 0);
  }, [items, lastSeenAtMs]);

  const value = useMemo(
    () => ({
      notifications: items,
      customerCalls,
      unread,
      bellOpen,
      setBellOpen,
      lastSeenAtMs,
      markAllRead,
      pushNotification,
      acknowledgeCustomerCall,
      resolveCustomerCall,
      refresh,
      clearAll,
      summaries,
    }),
    [
      acknowledgeCustomerCall,
      bellOpen,
      clearAll,
      customerCalls,
      items,
      lastSeenAtMs,
      markAllRead,
      pushNotification,
      refresh,
      resolveCustomerCall,
      summaries,
      unread,
    ]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
