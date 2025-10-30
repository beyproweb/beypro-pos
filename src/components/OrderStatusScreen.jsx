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
  try { return JSON.parse(v); } catch { return []; }
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
  table,                // optional; fallback to order.table_number
  onOrderAnother,
  onFinished,           // call this ONLY when truly finished (closed/completed/paid/delivered/canceled)
  t = (str) => str,
  buildUrl = (path) => path,
  appendIdentifier,
}) => {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const [order404, setOrder404] = useState(false); // persist through transient 404s
  const intervalRef = useRef(null);

  // States considered finished by backend
// Only close when POS closes the table
const FINISHED_STATES = ["closed", "completed", "canceled"];
  
  // Helpers near top of component:
const pm = (order?.payment_method || localStorage.getItem("qr_payment_method") || "").toLowerCase();
const paymentUrl = order?.payment_url || localStorage.getItem("qr_payment_url") || null;
const pmLabel = (m) => {
  switch (m) {
    case "online": return t("Online");
    case "card": return t("Card at Table");
    case "sodexo": return "Sodexo";
    case "multinet": return "Multinet";
    case "cash": return t("Cash");
    default: return m || "—";
  }
};
async function requestPaymentLink() {
  try {
    const { res, data } = await fetchJSON("/payments/start", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, method: "online" }),
    });
    if (res.ok && data?.pay_url) {
      localStorage.setItem("qr_payment_url", data.pay_url);
      fetchOrder(); // refresh to pick up order.payment_url if backend stores it
    }
  } catch (e) {
    console.error("requestPaymentLink failed:", e);
  }
}

  const fetchJSON = useCallback(
    async (path, options = {}) => {
      const url = appendIdentifier ? appendIdentifier(buildUrl(path)) : buildUrl(path);
      const headers = {
        Accept: "application/json",
        ...(options.headers || {}),
      };
      if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
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

  // If backend says it's finished, then (and only then) close
  useEffect(() => {
    if (!order) return;
    if (FINISHED_STATES.includes((order.status || "").toLowerCase())) {
      onFinished?.();
    }
  }, [order?.status]);

  // Poll order WITHOUT auto-finishing on 404
  useEffect(() => {
    let abort = false;

    async function load() {
      try {
        const { res, data } = await fetchJSON(`/orders/${orderId}`);

        if (!res.ok) {
          if (res.status === 404 && !abort) {
            // Keep screen open and keep polling — backend may be lagging or order just created/moved.
            setOrder(null);
            setOrder404(true);
          }
          return;
        }

        if (!abort) {
          setOrder(data);
          setOrder404(false);
        }
      } catch (err) {
        console.error("Order fetch failed:", err.message);
      }
    }

    load();                          // initial fetch
    const iv = setInterval(load, 4000); // poll every 4s
    return () => { abort = true; clearInterval(iv); };
  }, [orderId]);

  // Also poll items
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
    } catch {
      /* ignore network hiccups */
    }

    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}/items`);
      if (!res.ok) throw new Error(`Items for order ${orderId} not found`);
      const raw = data ?? [];
      const normalized = toArray(raw).map(normItem);
      setItems(normalized);
    } catch {
      setItems([]);
    }
  };

  // Live timer since order created
  useEffect(() => {
    if (!order?.created_at) return;
    function updateTimer() {
      const start = new Date(order.created_at);
      const now = new Date();
      const diff = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setTimer(`${mins}:${secs}`);
    }
    updateTimer();
    intervalRef.current = window.setInterval(updateTimer, 1000);
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, [order?.created_at]);

  // Socket.io for live updates → refetch
  useSocketIO(fetchOrder, orderId);

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const preparing = items.filter(i => i.kitchen_status === "preparing" || i.kitchen_status === "new");
  const ready = items.filter(i => i.kitchen_status === "ready");
  const delivered = items.filter(i => i.kitchen_status === "delivered");

  const tableNo = table ?? order?.table_number ?? null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col px-3 py-8 overflow-y-auto">
      <div className="w-full max-w-md mx-auto bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 rounded-3xl shadow-2xl p-5 flex flex-col items-center">
        <div className="mb-2 text-lg font-bold text-blue-700">
          {tableNo ? (<>🍽️ {t("Table")} {tableNo}</>) : (<>{t("Your Order")}</>)}
        </div>
        <div className="text-2xl font-extrabold text-fuchsia-700 mb-1">
          {t("Order in Progress")}
        </div>
        <div className="mb-2 text-base text-indigo-800 font-semibold">
          <span>⏱️ {t("Time")}: <span className="font-mono">{timer}</span></span>
        </div>
        {/* Payment method / Pay Now */}
<div className="w-full mb-3">
  <div className="text-sm font-semibold text-indigo-800">
    {t("Payment Method")}: <span className="font-bold">{pmLabel(pm)}</span>
  </div>

  {pm === "online" && (order?.payment_status || "").toLowerCase() !== "paid" && (
    paymentUrl ? (
      <a
        href={paymentUrl}
        target="_blank"
        rel="noopener"
        className="mt-2 inline-flex justify-center w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow hover:scale-105 transition"
      >
        {t("Pay Now")}
      </a>
    ) : (
      <button
        onClick={requestPaymentLink}
        className="mt-2 inline-flex justify-center w-full py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold shadow hover:scale-105 transition"
      >
        {t("Get Payment Link")}
      </button>
    )
  )}

  {pm !== "online" && (order?.payment_status || "").toLowerCase() !== "paid" && (
    <div className="mt-1 text-xs text-gray-600">
      {t("A staff member will collect your payment at the table.")}
    </div>
  )}

  {(order?.payment_status || "").toLowerCase() === "paid" && (
    <div className="mt-1 text-sm font-semibold text-green-700">✅ {t("Paid")}</div>
  )}
</div>


        {/* Show a small hint while we see 404s */}
        {order404 && (
          <div className="mb-3 text-sm text-gray-600">
            Syncing order… (#{orderId})
          </div>
        )}

        {/* Items */}
        {items.length > 0 && (
          <div className="w-full mb-4">
            <div className="font-bold text-indigo-700 mb-2">🛍️ {t("Items Ordered")}</div>
<ul className="flex flex-col divide-y divide-blue-100 bg-white rounded-2xl shadow-sm overflow-hidden">
  {items.map((item) => (
    <li key={item.id} className="p-4">
      {/* Header: Item name and qty */}
      <div className="flex justify-between items-center font-bold text-gray-800">
        <span className="text-base sm:text-lg">{item.name}</span>
        <span className="text-sm text-indigo-700 font-semibold">×{item.quantity}</span>
      </div>

      {/* Item base price */}
      <div className="mt-1 flex justify-between text-sm text-gray-600">
        <span>{t("Unit Price")}</span>
        <span className="font-semibold text-gray-800">
          ₺{(item.price || 0).toFixed(2)}
        </span>
      </div>

      {/* Extras */}
      {item.extras?.length > 0 && (
        <div className="mt-2 text-sm text-gray-700">
          <div className="font-semibold text-indigo-700 mb-1">
            ➕ {t("Extras")}
          </div>
          <div className="flex flex-col gap-0.5 ml-2">
            {item.extras.map((ex, idx) => (
              <div key={idx} className="flex justify-between text-xs sm:text-sm">
                <span>
                  {ex.name} ×{ex.quantity || 1}
                </span>
                <span className="text-gray-800">
                  ₺{(parseFloat(ex.price ?? ex.extraPrice ?? 0) * (ex.quantity || 1)).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      {item.note && (
        <div className="mt-2 text-xs italic text-yellow-700 bg-yellow-50 border-l-4 border-yellow-400 px-3 py-1 rounded">
          📝 {t("Note")}: {item.note}
        </div>
      )}
    </li>
  ))}
</ul>

{/* --- Totals Section --- */}
<div className="mt-6 bg-gradient-to-r from-indigo-50 via-pink-50 to-fuchsia-50 rounded-2xl p-4 shadow-inner border border-indigo-100">
  <div className="flex justify-between text-sm font-semibold text-gray-700">
    <span>{t("Items Subtotal")}:</span>
    <span>
      ₺
      {items
        .reduce((sum, it) => sum + (it.price || 0) * (it.quantity || 1), 0)
        .toFixed(2)}
    </span>
  </div>

  <div className="flex justify-between text-sm font-semibold text-fuchsia-700 mt-1">
    <span>{t("Extras Subtotal")}:</span>
    <span>
      ₺
      {items
        .reduce(
          (sum, it) =>
            sum +
            (it.extras || []).reduce(
              (s, ex) =>
                s +
                (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) *
                  (ex.quantity || 1) *
                  (it.quantity || 1),
              0
            ),
          0
        )
        .toFixed(2)}
    </span>
  </div>

  <div className="border-t border-indigo-200 mt-2 pt-2 flex justify-between text-lg font-extrabold text-pink-700">
    <span>{t("Grand Total")}:</span>
    <span>
      ₺
      {items
        .reduce((sum, it) => {
          const extras = (it.extras || []).reduce(
            (s, ex) =>
              s +
              (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) *
                (ex.quantity || 1),
            0
          );
          return sum + ((it.price || 0) + extras) * (it.quantity || 1);
        }, 0)
        .toFixed(2)}
    </span>
  </div>
</div>


          </div>
        )}


        {/* Preparing */}
        {preparing.length > 0 && (
          <div className="w-full mb-3">
            <div className="font-bold text-yellow-700 mb-2">{t("Preparing")}</div>
            <ul className="flex flex-col gap-2">
              {preparing.map((item) => (
                <li key={item.id} className="flex justify-between items-center bg-yellow-50 rounded-xl px-3 py-2 text-yellow-900 font-bold text-base shadow-sm">
                  <span>{item.name ?? item.order_item_name ?? item.product_name ?? t("Item")}</span>
                  <span className="text-xs">x{item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ready */}
        {ready.length > 0 && (
          <div className="w-full mb-3">
            <div className="font-bold text-blue-700 mb-2">{t("Ready for Pickup")}</div>
            <ul className="flex flex-col gap-2">
              {ready.map((item) => (
                <li key={item.id} className="flex justify-between items-center bg-blue-50 rounded-xl px-3 py-2 text-blue-900 font-bold text-base shadow-sm animate-pulse">
                  <span>{item.name ?? item.order_item_name ?? item.product_name ?? t("Item")}</span>
                  <span className="text-xs">x{item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Delivered */}
        {delivered.length > 0 && (
          <div className="w-full mb-3">
            <div className="font-bold text-green-700 mb-2">{t("Delivered")}</div>
            <ul className="flex flex-col gap-2">
              {delivered.map((item) => (
                <li key={item.id} className="flex justify-between items-center bg-green-50 rounded-xl px-3 py-2 text-green-900 font-bold text-base shadow-sm line-through">
                  <span>{item.name ?? item.order_item_name ?? item.product_name ?? t("Item")}</span>
                  <span className="text-xs">x{item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          className="w-full mt-6 py-3 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 text-white text-lg font-bold shadow-lg hover:scale-105 transition"
          onClick={onOrderAnother}
        >
          {t("Order Another")}
        </button>
      </div>
    </div>
  );
};

export default OrderStatusScreen;
