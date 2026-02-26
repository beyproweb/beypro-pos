// src/components/OrderStatusScreen.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import secureFetch, { getAuthToken, BASE_URL } from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
// Use the same base as secureFetch to avoid env drift
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  String(BASE_URL).replace(/\/api\/?$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

/* ---------- SOCKET.IO HOOK ---------- */
let socket;
export function useSocketIO(onOrderUpdate, orderId) {
  useEffect(() => {
    if (!orderId) return;
    if (!socket) {
      try {
        socket = io(SOCKET_URL, {
          path: "/socket.io",
          transports: ["polling", "websocket"],
          upgrade: true,
          withCredentials: true,
          timeout: 20000,
        });
      } catch (e) {
        console.warn("Socket init failed:", e);
        return;
      }
    }

    const updateHandler = (data) => {
      if (Array.isArray(data?.orderIds) && data.orderIds.includes(orderId)) onOrderUpdate?.();
      if (data?.orderId === orderId) onOrderUpdate?.();
    };

    // Generic refresh on common kitchen events (covers /api/order-items/kitchen-status in kitchen.js)
    socket.on("orders_updated", onOrderUpdate);
    socket.on("order_preparing", onOrderUpdate);
    socket.on("order_ready", onOrderUpdate);
    socket.on("order_delivered", onOrderUpdate);
    socket.on("order_cancelled", onOrderUpdate);
    socket.on("order_closed", onOrderUpdate);

    // Also listen with a payload-aware handler (covers orders router emitting orderIds/orderId)
    socket.on("order_ready", updateHandler);
    socket.on("order_cancelled", updateHandler);
    socket.on("order_closed", updateHandler);

    // Dev visibility
    const logEvent = (name, payload) => {
      if (import.meta.env.DEV && payload?.orderId === orderId) {
        console.info(`[OrderStatusScreen] ${name}`, payload);
      }
    };
    socket.on("order_cancelled", (p) => logEvent("order_cancelled", p));
    socket.on("order_closed", (p) => logEvent("order_closed", p));
    socket.on("orders_updated", (p) => logEvent("orders_updated", p));

    return () => {
      socket.off("orders_updated", onOrderUpdate);
      socket.off("order_preparing", onOrderUpdate);
      socket.off("order_ready", onOrderUpdate);
      socket.off("order_delivered", onOrderUpdate);
      socket.off("order_ready", updateHandler);
      socket.off("order_cancelled", onOrderUpdate);
      socket.off("order_cancelled", updateHandler);
      socket.off("order_closed", onOrderUpdate);
      socket.off("order_closed", updateHandler);
      socket.off("order_cancelled", logEvent);
      socket.off("order_closed", logEvent);
      socket.off("orders_updated", logEvent);
    };
  }, [onOrderUpdate, orderId]);
}

/* ---------- HELPERS ---------- */
const toArray = (val) => (Array.isArray(val) ? val : []);
const parseMaybeJSON = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
};
const normItem = (it) => ({
  id: it.id || it.item_id || it.unique_id || `${it.product_id || Math.random()}`,
  name: it.name || it.product_name || it.item_name || "",
  price: Number(it.price || 0),
  quantity: Number(it.quantity || 1),
  kitchen_status: it.kitchen_status || "new",
  note: it.note || "",
  extras: parseMaybeJSON(it.extras),
  payment_method: it.payment_method || it.paymentMethod || null,
  paid_at: it.paid_at || it.paidAt || null,
});

/* ---------- UI COMPONENTS (UI-only; no business logic) ---------- */
function OrderStatusHeader({ t, title, subtitle, meta, onBack }) {
  return (
    <header className="sticky top-0 z-[120] bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto w-full max-w-[640px] px-4 py-3">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="h-10 w-10 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 active:bg-neutral-200 dark:active:bg-neutral-800 transition text-neutral-900 dark:text-neutral-100"
              aria-label={t("Back")}
            >
              <span className="text-xl leading-none">←</span>
            </button>
          ) : (
            <div className="h-10 w-10 -ml-1" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {title}
              </h1>
              {meta ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{meta}</div>
              ) : null}
            </div>
            {subtitle ? (
              <div className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{subtitle}</div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function OrderProgressStepper({ t, currentStepIndex = 0, isCancelled = false }) {
  const steps = [
    { key: "received", label: t("Order received") },
    { key: "preparing", label: t("Preparing") },
    { key: "ready", label: t("Order ready") },
    { key: "delivered", label: t("Delivered") },
  ];

  if (isCancelled) {
    return (
      <section className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-4">
        <div className="text-sm font-semibold text-rose-700">
          {t("Order Cancelled")}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:items-center sm:justify-between sm:gap-2">
        {steps.map((s, idx) => {
          const isDone = idx < currentStepIndex;
          const isActive = idx === currentStepIndex;
          return (
            <div key={s.key} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "h-7 w-7 rounded-full border flex items-center justify-center text-xs font-semibold shrink-0",
                    isDone
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : isActive
                      ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                      : "bg-white dark:bg-neutral-950 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800",
                  ].join(" ")}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <div className="min-w-0">
                  <div
                    className={[
                      "text-xs leading-tight truncate",
                      isDone
                        ? "text-neutral-700 dark:text-neutral-300"
                        : isActive
                        ? "text-neutral-900 dark:text-neutral-100 font-semibold"
                        : "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}
                  >
                    {s.label}
                  </div>
                </div>
              </div>
              {idx !== steps.length - 1 ? (
                <div className="mt-2 h-[2px] w-full bg-neutral-200 dark:bg-neutral-800 rounded-full hidden sm:block">
                  <div
                    className={[
                      "h-[2px] rounded-full",
                      isDone
                        ? "w-full bg-emerald-600"
                        : isActive
                        ? "w-1/2 bg-neutral-900 dark:bg-white"
                        : "w-0 bg-neutral-200 dark:bg-neutral-800",
                    ].join(" ")}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OrderSummaryCard({
  t,
  title,
  statusLabel,
  timerLabel,
  paymentLabel,
  createdAtLabel,
  reservedAtLabel,
  reservationGuestsLabel,
  totalLabel,
  cancelReason,
  isCancelled,
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {title}
          </div>
          <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            {createdAtLabel}
          </div>
          {reservedAtLabel ? (
            <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {t("Reservation Time")}: {reservedAtLabel}
            </div>
          ) : null}
          {reservationGuestsLabel ? (
            <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {t("Guests")}: {reservationGuestsLabel}
            </div>
          ) : null}
        </div>

        <div
          className={[
            "shrink-0 text-xs px-2.5 py-1 rounded-full border font-medium",
            isCancelled
              ? "bg-rose-50 dark:bg-rose-950/30 text-rose-700 border-rose-200 dark:border-rose-900"
              : "bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800",
          ].join(" ")}
        >
          {statusLabel}
        </div>
      </div>

      {isCancelled && cancelReason ? (
        <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700">
          {cancelReason}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Time")}</div>
          <div className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {timerLabel}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Payment")}</div>
          <div className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {paymentLabel}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Status")}</div>
          <div className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {statusLabel}
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderItemsList({ t, items, totalLabel, formatCurrency, badgeColor, displayStatus, pmLabel }) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {t("Items")}
        </div>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items.map((item) => {
          const quantity = Number(item.quantity || 1);
          const basePrice = Number(item.price || 0);
          const baseTotal = basePrice * quantity;
          const isItemPaid = !!item.paid_at;
          const itemPm = pmLabel(item.payment_method);

          return (
            <li key={item.id} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 text-center">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-semibold">
                    {quantity}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {item.name || t("Item")}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span
                          className={[
                            "text-[11px] px-2 py-0.5 rounded-full border",
                            badgeColor(item.kitchen_status),
                          ].join(" ")}
                        >
                          {displayStatus(item.kitchen_status)}
                        </span>
                        {isItemPaid ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
                            {itemPm}
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800">
                            {t("Unpaid")}
                          </span>
                        )}
                      </div>

                      {item.extras?.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {item.extras.map((ex, i) => {
                            const totalQty = (Number(ex.quantity || 1) || 1) * quantity;
                            return (
                              <div key={i} className="text-xs text-neutral-600 dark:text-neutral-300">
                                + {ex.name} ×{totalQty}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {item.note ? (
                        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                          <span className="font-medium text-neutral-700 dark:text-neutral-200">
                            {t("Note")}:
                          </span>{" "}
                          {item.note}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatCurrency(baseTotal)}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatCurrency(basePrice)} ×{quantity}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3 flex justify-end">
        <div className="text-right">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Total")}</div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{totalLabel}</div>
        </div>
      </div>
    </section>
  );
}

function InlineBottomActions({
  t,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="flex items-center gap-2">
        {onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="h-11 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-800 transition font-semibold"
          >
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrimary}
          disabled={!onPrimary}
          className="h-11 px-5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-950 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {primaryLabel}
        </button>
      </div>
    </section>
  );
}

/* ---------- MAIN COMPONENT ---------- */
const OrderStatusScreen = ({
  orderId,
  table,
  onOrderAnother,
  onClose,
  onFinished,
  forceLock = false,
  forceDark,
  t = (s) => s,
  buildUrl = (p) => p,
  appendIdentifier,
}) => {
  const [isDarkUi, setIsDarkUi] = useState(() => (typeof forceDark === "boolean" ? forceDark : false));
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const [order404, setOrder404] = useState(false);
  const intervalRef = useRef(null);
  const joinedRestaurantRef = useRef(null);
  const { formatCurrency } = useCurrency();

  const FINISHED_STATES = ["closed", "completed"]; // keep cancelled visible
  const hasReservationPayload = useCallback((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const nested =
      entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
    return Boolean(
      entry?.reservation_id ||
        entry?.reservationId ||
        entry?.reservation_date ||
        entry?.reservationDate ||
        entry?.reservation_time ||
        entry?.reservationTime ||
        nested?.id ||
        nested?.reservation_id ||
        nested?.reservationId ||
        nested?.reservation_date ||
        nested?.reservationDate ||
        nested?.reservation_time ||
        nested?.reservationTime
    );
  }, []);

  useEffect(() => {
    if (typeof forceDark === "boolean") {
      setIsDarkUi(forceDark);
      return;
    }
    const resolve = () => {
      const mode = String(localStorage.getItem("qr_theme") || "auto")
        .trim()
        .toLowerCase();
      if (mode === "dark") return true;
      if (mode === "light") return false;
      try {
        return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      } catch {
        return false;
      }
    };
    setIsDarkUi(resolve());
    const onStorage = (e) => {
      if (e?.key === "qr_theme") setIsDarkUi(resolve());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [forceDark]);

  const pmLabel = (m) => {
    const raw = String(m || "").trim();
    if (!raw) return "—";
    const tokens = raw
      .split("+")
      .map((tok) => tok.trim())
      .filter(Boolean);
    const mapped = tokens.map((tok) => {
      switch (tok.toLowerCase()) {
        case "online":
          return t("Online");
        case "card":
          return t("Card");
        case "card at table":
          return t("Card");
        case "cash":
          return t("Cash");
        case "split":
          return t("Split");
        case "sodexo":
          return "Sodexo";
        case "multinet":
          return "Multinet";
        default:
          return tok;
      }
    });
    return mapped.join("+");
  };

  const fetchJSON = useCallback(
    async (path, options = {}) => {
      const endpoint = appendIdentifier ? appendIdentifier(path) : path;
      const absoluteUrl = appendIdentifier ? appendIdentifier(buildUrl(path)) : buildUrl(path);

      // First try as fully public (no auth header)
      try {
        const headers = {
          Accept: "application/json",
          ...(options.headers || {}),
        };
        if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
        const res = await fetch(absoluteUrl, { ...options, headers });
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        // If backend still requires auth for some reason, retry with token when available
        if (res.status === 401) {
          const token = getAuthToken();
          if (token) {
            try {
              const authed = await secureFetch(endpoint, {
                ...options,
                headers: {
                  ...(options.headers || {}),
                },
              });
              return { res: { ok: true, status: 200 }, data: authed };
            } catch (e) {
              return { res, data };
            }
          }
        }
        return { res, data };
      } catch {
        // As a final fallback, try secureFetch (will attach token if present)
        try {
          const data = await secureFetch(endpoint, options);
          return { res: { ok: true, status: 200 }, data };
        } catch {
          return { res: { ok: false, status: 0 }, data: null };
        }
      }
    },
    [buildUrl, appendIdentifier]
  );

  useEffect(() => {
    if (!order) return;
    const status = (order.status || "").toLowerCase();
    const preserveWhileReserved = forceLock && hasReservationPayload(order);
    if (FINISHED_STATES.includes(status) && !preserveWhileReserved) {
      onFinished?.();
    }
  }, [order, forceLock, hasReservationPayload, onFinished]);

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}`);
      if (res.ok) {
        setOrder(data);
        setOrder404(false);
      } else if (res.status === 404) {
        setOrder(null);
        setOrder404(true);
      }
    } catch {}

    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}/items`);
      if (!res.ok) throw new Error();
      const normalized = toArray(data).map(normItem);
      setItems(normalized);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    let abort = false;
    async function load() {
      try {
        const { res, data } = await fetchJSON(`/orders/${orderId}`);
        if (!res.ok) return;
        if (!abort) {
          setOrder(data);
          if (import.meta.env.DEV) {
            console.info("[OrderStatusScreen] fetched order", {
              orderId,
              status: (data?.status || "").toLowerCase(),
              cancel_reason:
                data?.cancellation_reason || data?.cancel_reason || data?.cancelReason || null,
            });
          }
        }
      } catch {}
    }
    load();
    const iv = setInterval(load, 4000);
    return () => {
      abort = true;
      clearInterval(iv);
    };
  }, [orderId]);

  useSocketIO(fetchOrder, orderId);
  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  // Join restaurant-specific Socket.IO room once we know the restaurant_id
  useEffect(() => {
    const rid = order?.restaurant_id;
    if (!rid) return;
    if (!socket) return;
    if (joinedRestaurantRef.current === rid) return;
    try {
      socket.emit("join_restaurant", rid);
      joinedRestaurantRef.current = rid;
    } catch (e) {
      console.warn("Failed to join restaurant room", rid, e);
    }
    return () => {
      try {
        if (joinedRestaurantRef.current) {
          socket.emit("leave_restaurant", joinedRestaurantRef.current);
          joinedRestaurantRef.current = null;
        }
      } catch {}
    };
  }, [order?.restaurant_id]);

  // Timer
  useEffect(() => {
    if (!order?.created_at) return;
    function updateTimer() {
      const start = new Date(order.created_at);
      const now = new Date();
      const diff = Math.floor((now - start) / 1000);
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setTimer(`${mins}:${secs}`);
    }
    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalRef.current);
  }, [order?.created_at]);

  const tableNo = table ?? order?.table_number ?? null;
  const restaurantName =
    order?.restaurant_name ||
    order?.restaurant?.name ||
    localStorage.getItem("restaurant_name") ||
    t("Restaurant");

  const total = items.reduce((sum, it) => {
    const extras = (it.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return sum + ((it.price || 0) + extras) * (it.quantity || 1);
  }, 0);

  const orderStatus = (order?.status || "").toLowerCase();
  const isCancelled = orderStatus === "cancelled" || orderStatus === "canceled";
  const cancelReason = order?.cancellation_reason || order?.cancel_reason || order?.cancelReason || "";

  const normalizeStatus = (s) => {
    const v = (s || "").toLowerCase();
    if (v === "delivered" || v === "served") return "ready";
    return v;
  };

  const displayStatus = (s) => {
    const v = normalizeStatus(s);
    if (v === "ready") return t("Order ready");
    if (!v) return t("Unknown");
    return t(v.charAt(0).toUpperCase() + v.slice(1));
  };

  const badgeColor = (status) => {
    const s = normalizeStatus(status);
    if (s === "ready") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "preparing") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "new") return "bg-neutral-50 text-neutral-700 border-neutral-200";
    return "bg-neutral-50 text-neutral-600 border-neutral-200";
  };

  const getCurrentStepIndex = () => {
    if (isCancelled) return 0;
    const rank = (s) => {
      const v = normalizeStatus(s);
      if (v === "ready") return 2;
      if (v === "preparing") return 1;
      if (v === "new" || v === "confirmed" || v === "pending" || v === "open") return 0;
      if (v === "delivered" || v === "served" || v === "completed" || v === "closed")
        return 3;
      return 0;
    };
    const orderRank = rank(order?.status);
    const itemsRank = items.reduce((max, it) => Math.max(max, rank(it.kitchen_status)), 0);
    const r = Math.max(orderRank, itemsRank);
    return Math.min(3, Math.max(0, r));
  };

  const createdAtLabel = (() => {
    try {
      if (!order?.created_at) return t("—");
      const d = new Date(order.created_at);
      return d.toLocaleString();
    } catch {
      return t("—");
    }
  })();

  const reservedAtLabel = (() => {
    const reservationTime =
      order?.reservation?.reservation_time ||
      order?.reservation_time ||
      order?.reservationTime ||
      "";
    const reservationDate =
      order?.reservation?.reservation_date ||
      order?.reservation_date ||
      order?.reservationDate ||
      "";
    if (!reservationTime && !reservationDate) return "";
    if (reservationTime && reservationDate) return `${reservationTime} • ${reservationDate}`;
    return reservationTime || reservationDate;
  })();

  const reservationGuestsLabel = (() => {
    const guests = Number(
      order?.reservation?.reservation_clients ||
        order?.reservation_clients ||
        order?.reservationClients ||
        0
    );
    if (!Number.isFinite(guests) || guests <= 0) return "";
    return String(Math.floor(guests));
  })();

  const orderTypeLabel = (() => {
    const ot = String(order?.order_type || "").toLowerCase();
    if (ot === "packet") return t("Delivery");
    if (ot === "takeaway") return t("Pickup");
    if (ot === "table") return t("Table");
    return ot ? t(ot) : t("Order");
  })();

  const paymentLabel = pmLabel(order?.payment_method || "");

	  const titleLine = (() => {
	    const tableLine = tableNo ? `${t("Table")} ${tableNo}` : null;
	    const ot = String(order?.order_type || "")
	      .trim()
	      .toLowerCase();
	    if (ot === "table") {
	      return tableLine || t("Table");
    }
    return [orderTypeLabel, tableLine].filter(Boolean).join(" • ");
  })();

  return (
    <div className={`${isDarkUi ? "dark" : ""} fixed inset-0 z-[100] bg-neutral-50 dark:bg-neutral-950 overflow-y-auto`}>
      <OrderStatusHeader
        t={t}
        title={t("Order Status")}
        subtitle={restaurantName}
        meta={orderId ? `#${orderId}` : null}
        onBack={null}
      />

      <main className="mx-auto w-full max-w-[640px] px-4 pt-4 pb-6">
        <div className="space-y-4">
          <OrderProgressStepper
            t={t}
            currentStepIndex={getCurrentStepIndex()}
            isCancelled={isCancelled}
          />

          <OrderSummaryCard
            t={t}
            title={titleLine || t("Your Order")}
            statusLabel={isCancelled ? t("Cancelled") : displayStatus(order?.status)}
            timerLabel={isCancelled ? t("—") : `${timer}`}
            paymentLabel={paymentLabel}
            createdAtLabel={createdAtLabel}
            reservedAtLabel={reservedAtLabel}
            reservationGuestsLabel={reservationGuestsLabel}
            totalLabel={formatCurrency(total)}
            cancelReason={cancelReason}
            isCancelled={isCancelled}
          />

          <OrderItemsList
            t={t}
            items={items}
            totalLabel={formatCurrency(total)}
            formatCurrency={formatCurrency}
            badgeColor={badgeColor}
            displayStatus={displayStatus}
            pmLabel={pmLabel}
          />

          <InlineBottomActions
            t={t}
            primaryLabel={t("Order")}
            onPrimary={onOrderAnother}
            onSecondary={null}
          />
        </div>
      </main>
    </div>
  );
};

export default OrderStatusScreen;
