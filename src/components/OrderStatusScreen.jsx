// src/components/OrderStatusScreen.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
const API_URL = import.meta.env.VITE_API_URL || "";

/* ---------- SOCKET.IO HOOK ---------- */
let socket;
export function useSocketIO(onOrderUpdate, orderId) {
  useEffect(() => {
    if (!orderId) return;
    if (!socket) socket = io(API_URL, { transports: ["websocket"] });

    const updateHandler = (data) => {
      if (Array.isArray(data?.orderIds) && data.orderIds.includes(orderId)) onOrderUpdate?.();
      if (data?.orderId === orderId) onOrderUpdate?.();
    };

    socket.on("orders_updated", onOrderUpdate);
    socket.on("order_ready", updateHandler);
    return () => {
      socket.off("orders_updated", onOrderUpdate);
      socket.off("order_ready", updateHandler);
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
  name: it.name || it.product_name || it.item_name || "Item",
  price: Number(it.price || 0),
  quantity: Number(it.quantity || 1),
  kitchen_status: it.kitchen_status || "new",
  note: it.note || "",
  extras: parseMaybeJSON(it.extras),
});

/* ---------- MAIN COMPONENT ---------- */
const OrderStatusScreen = ({
  orderId,
  table,
  onOrderAnother,
  onFinished,
  t = (s) => s,
  buildUrl = (p) => p,
  appendIdentifier,
}) => {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const [order404, setOrder404] = useState(false);
  const intervalRef = useRef(null);

  const FINISHED_STATES = ["closed", "completed", "canceled"];

  const pm = (order?.payment_method || localStorage.getItem("qr_payment_method") || "").toLowerCase();
  const paymentUrl = order?.payment_url || localStorage.getItem("qr_payment_url") || null;
  const pmLabel = (m) => {
    switch (m) {
      case "online":
        return t("Online");
      case "card":
        return t("Card at Table");
      case "cash":
        return t("Cash");
      case "sodexo":
        return "Sodexo";
      case "multinet":
        return "Multinet";
      default:
        return m || "—";
    }
  };

  const fetchJSON = useCallback(
    async (path, options = {}) => {
      const url = appendIdentifier ? appendIdentifier(buildUrl(path)) : buildUrl(path);
      const headers = {
        Accept: "application/json",
        ...(options.headers || {}),
      };
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const res = await fetch(url, { ...options, headers });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { res, data };
    },
    [buildUrl]
  );

  useEffect(() => {
    if (!order) return;
    if (FINISHED_STATES.includes((order.status || "").toLowerCase())) {
      onFinished?.();
    }
  }, [order?.status]);

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
        if (!abort) setOrder(data);
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
    "Restaurant";

  const total = items.reduce((sum, it) => {
    const extras = (it.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return sum + ((it.price || 0) + extras) * (it.quantity || 1);
  }, 0);

  const badgeColor = (status) => {
    const s = status?.toLowerCase?.();
    if (s === "ready") return "bg-blue-100 text-blue-700";
    if (s === "delivered" || s === "served") return "bg-green-100 text-green-700";
    if (s === "preparing" || s === "new") return "bg-amber-100 text-amber-700";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 flex flex-col px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md mx-auto bg-white/90 backdrop-blur-md border border-gray-200 rounded-3xl shadow-2xl p-6 flex flex-col">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-3xl font-serif font-bold text-gray-900">{restaurantName}</div>
          <div className="text-lg text-gray-600 mt-1">
            {tableNo ? `🍽️ ${t("Table")} ${tableNo}` : t("Your Order")}
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-gradient-to-r from-pink-100 via-purple-100 to-blue-100 rounded-2xl py-4 mb-6 text-center shadow-inner">
          <div className="text-2xl font-extrabold text-fuchsia-700">{t("Order in Progress")}</div>
          <div className="text-sm text-gray-700 font-medium mt-1">
            ⏱️ {t("Time")}: <span className="font-mono">{timer}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="text-sm text-gray-700 mb-6">
          <span className="font-semibold">{t("Payment Method")}:</span>{" "}
          <span className="text-indigo-700 font-medium">{pmLabel(pm)}</span>
          {(order?.payment_status || "").toLowerCase() === "paid" && (
            <p className="text-green-600 text-sm font-semibold mt-1">✅ {t("Paid")}</p>
          )}
        </div>

        {/* Items */}
        <div className="w-full mb-4">
          <div className="font-semibold text-gray-800 mb-3 text-lg">🛍️ {t("Items Ordered")}</div>
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="p-4 rounded-2xl border border-neutral-200 bg-white/80 shadow-sm hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium text-gray-900">{item.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeColor(
                          item.kitchen_status
                        )}`}
                      >
                        {t(item.kitchen_status.charAt(0).toUpperCase() + item.kitchen_status.slice(1))}
                      </span>
                    </div>

                    {item.extras?.length > 0 && (
                      <div className="mt-2 text-sm text-gray-700 space-y-1">
                        {item.extras.map((ex, i) => (
                          <div key={i} className="flex justify-between">
                            <span>
                              ➕ {ex.name} ×{ex.quantity || 1}
                            </span>
                            <span>
                              ₺
                              {(
                                (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) *
                                (ex.quantity || 1)
                              ).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {item.note && (
                      <div className="mt-2 text-xs italic text-amber-700 bg-amber-50 border-l-4 border-amber-400 px-3 py-1 rounded">
                        📝 {t("Note")}: {item.note}
                      </div>
                    )}
                  </div>

                  <div className="text-right pl-3">
                    <div className="font-semibold text-gray-800">×{item.quantity}</div>
                    <div className="text-sm text-indigo-600 font-medium mt-1">
                      ₺{(item.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Total */}
        <div className="mt-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-4 shadow-inner">
          <div className="flex justify-between text-base font-semibold text-gray-800">
            <span>{t("Grand Total")}:</span>
            <span className="text-fuchsia-700 font-bold">₺{total.toFixed(2)}</span>
          </div>
        </div>

        {/* CTA */}
        <button
          className="w-full mt-8 py-3 rounded-full bg-neutral-900 text-white text-lg font-semibold hover:bg-neutral-800 transition"
          onClick={onOrderAnother}
        >
          {t("Order Another")}
        </button>
      </div>
    </div>
  );
};

export default OrderStatusScreen;
