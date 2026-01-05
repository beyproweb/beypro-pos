import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";

const NotificationsContext = createContext(null);

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
  if (normalizedType === "stock" || normalizedType === "stock_expiry") return "/stock";
  if (normalizedType === "ingredient") return "/ingredient-prices";
  if (normalizedType === "task") return "/task";
  if (normalizedType === "maintenance") return "/maintenance";
  if (normalizedType === "register") return "/tableoverview?tab=register";
  if (["order", "payment", "driver"].includes(normalizedType)) return "/orders";
  if (extra?.route) return extra.route;
  return null;
}

function normalizeNotification(raw) {
  const extra = normalizeExtra(raw?.extra);
  const type = String(raw?.type || "other").toLowerCase();
  const timeMs = toTimeMs(raw?.time ?? raw?.timestamp ?? raw?.created_at);

  return {
    id: raw?.id ?? `${type}_${timeMs}_${Math.random().toString(16).slice(2)}`,
    message: String(raw?.message || "").trim() || "Notification",
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
  if ((type === "order" || type === "payment" || type === "driver") && orderId) {
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
  const [bellOpen, setBellOpen] = useState(false);
  const [summaries, setSummaries] = useState({
    criticalStock: null,
    openMaintenance: null,
    inProgressTasks: null,
  });

  const restaurantIdRef = useRef(getRestaurantId());
  const registerStatusRef = useRef(null);
  const lastSeenKeyRef = useRef(null);

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

  const pushNotification = useCallback(
    (raw) => {
      const next = normalizeNotification(raw);
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

  // Register open/close notifications
  useEffect(() => {
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
        if (!rid) {
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
    const rid = getRestaurantId();
    if (!rid) return;
    try {
      const rows = await secureFetch("/notifications?limit=120");
      if (!Array.isArray(rows)) return;
      const normalized = rows.map((r) => normalizeNotification({ ...r, source: "db" }));
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
    try {
      await secureFetch("/notifications/clear", { method: "DELETE" });
    } catch (err) {
      console.warn("⚠️ Failed to clear notifications in backend", err?.message || err);
    } finally {
      setItems([]);
      markAllRead();
    }
  }, [markAllRead]);

  const loadSummaries = useCallback(async () => {
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
    refresh();
  }, [refresh]);

  // When the bell opens, mark read and load quick summaries.
  useEffect(() => {
    if (!bellOpen) return;
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
      pushNotification({
        message: `🔔 New order ${suffix}`.trim(),
        type: "order",
        time: Date.now(),
        extra: { orderId: id, order_number: orderNumber, order_type: order?.order_type },
        source: "socket",
      });
    };

    const onOrderPreparing = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      pushNotification({
        message: `🍳 Kitchen preparing order ${suffix}`.trim(),
        type: "order",
        time: Date.now(),
        extra: { orderId, ...payload },
        source: "socket",
      });
    };

    const onOrderDelivered = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      pushNotification({
        message: `✅ Kitchen delivered order ${suffix}`.trim(),
        type: "order",
        time: Date.now(),
        extra: { orderId, ...payload },
        source: "socket",
      });
    };

    const onPayment = (payload = {}) => {
      const orderId = payload?.orderId || payload?.id;
      const suffix = orderId ? `#${orderId}` : "";
      pushNotification({
        message: `💸 Payment made ${suffix}`.trim(),
        type: "payment",
        time: payload?.timestamp || Date.now(),
        extra: payload,
        source: "socket",
      });
    };

    const onDriverAssigned = (payload = {}) => {
      const driverName = payload?.driverName || payload?.driver_name || "Driver";
      const suffix = payload?.orderId ? `#${payload.orderId}` : "";
      pushNotification({
        message: `🚗 ${driverName} assigned ${suffix}`.trim(),
        type: "driver",
        time: Date.now(),
        extra: payload,
        source: "socket",
      });
    };

    const onTaskCreated = (task = {}) => {
      if (!task?.title) return;
      pushNotification({
        message: `📝 New task: ${task.title}`,
        type: "task",
        time: task?.created_at || Date.now(),
        extra: { taskId: task?.id, status: task?.status },
        source: "socket",
      });
    };

    const onTaskUpdated = (task = {}) => {
      if (!task?.title) return;
      if (String(task.status).toLowerCase() === "completed") {
        pushNotification({
          message: `✅ Task completed: ${task.title}`,
          type: "task",
          time: task?.completed_at || Date.now(),
          extra: { taskId: task?.id, status: task?.status },
          source: "socket",
        });
      }
    };

    const onMaintenanceCreated = (row = {}) => {
      if (!row?.title) return;
      pushNotification({
        message: `🛠️ Maintenance created: ${row.title}`,
        type: "maintenance",
        time: row?.created_at || Date.now(),
        extra: { issueId: row?.id, status: row?.status, priority: row?.priority },
        source: "socket",
      });
    };

    const onMaintenanceUpdated = (row = {}) => {
      if (!row?.title) return;
      const status = String(row?.status || "").toLowerCase();
      if (status === "resolved") {
        pushNotification({
          message: `✅ Maintenance resolved: ${row.title}`,
          type: "maintenance",
          time: row?.resolved_at || row?.updated_at || Date.now(),
          extra: { issueId: row?.id, status: row?.status, priority: row?.priority },
          source: "socket",
        });
      }
    };

    socket.on("alert_event", onAlert);
    socket.on("order_confirmed", onOrderConfirmed);
    socket.on("order_preparing", onOrderPreparing);
    socket.on("order_delivered", onOrderDelivered);
    socket.on("payment_made", onPayment);
    socket.on("driver_assigned", onDriverAssigned);
    socket.on("task_created", onTaskCreated);
    socket.on("task_updated", onTaskUpdated);
    socket.on("maintenance_created", onMaintenanceCreated);
    socket.on("maintenance_updated", onMaintenanceUpdated);

    return () => {
      socket.off("alert_event", onAlert);
      socket.off("order_confirmed", onOrderConfirmed);
      socket.off("order_preparing", onOrderPreparing);
      socket.off("order_delivered", onOrderDelivered);
      socket.off("payment_made", onPayment);
      socket.off("driver_assigned", onDriverAssigned);
      socket.off("task_created", onTaskCreated);
      socket.off("task_updated", onTaskUpdated);
      socket.off("maintenance_created", onMaintenanceCreated);
      socket.off("maintenance_updated", onMaintenanceUpdated);
    };
  }, [pushNotification]);

  const unread = useMemo(() => {
    if (!items.length) return 0;
    const cutoff = Number(lastSeenAtMs) || 0;
    return items.reduce((count, n) => (n.timeMs > cutoff ? count + 1 : count), 0);
  }, [items, lastSeenAtMs]);

  const value = useMemo(
    () => ({
      notifications: items,
      unread,
      bellOpen,
      setBellOpen,
      lastSeenAtMs,
      markAllRead,
      pushNotification,
      refresh,
      clearAll,
      summaries,
    }),
    [
      bellOpen,
      clearAll,
      items,
      lastSeenAtMs,
      markAllRead,
      pushNotification,
      refresh,
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
