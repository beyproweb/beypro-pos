import React, { useState, useEffect, useRef } from "react";
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
async function safeJSON(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(text.slice(0, 200)); }
}
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
  t = (str) => str,
}) => {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const intervalRef = useRef(null);
  const FINISHED_STATES = ["closed", "completed", "paid", "delivered", "canceled"];

useEffect(() => {
  if (!order) return;
  if (FINISHED_STATES.includes((order.status || "").toLowerCase())) {
    onFinished?.(); // tell parent (QrMenu) to reset to type picker
  }
}, [order?.status]);

useEffect(() => {
  let abort = false;
  async function load() {
    const res = await fetch(`${API_URL}/api/orders/${orderId}`);
    const data = await res.json();
    if (!abort) setOrder(data); // data.items should include first + sub-orders
  }
  load();

  // optional: poll every X sec
  const iv = setInterval(load, 4000);
  return () => { abort = true; clearInterval(iv); };
}, [orderId]);

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const orderRes = await fetch(`${API_URL}/api/orders/${orderId}`);
      if (!orderRes.ok) throw new Error(`Order ${orderId} not found`);
      const orderData = await safeJSON(orderRes);
      setOrder(orderData);
    } catch {
      setOrder(null);
    }

    try {
      const itemsRes = await fetch(`${API_URL}/api/orders/${orderId}/items`);
      if (!itemsRes.ok) throw new Error(`Items for order ${orderId} not found`);
      const raw = await safeJSON(itemsRes);
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

  // Socket.io for live updates
  useSocketIO(fetchOrder, orderId);

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Group items by status
  const preparing = items.filter(i => i.kitchen_status === "preparing" || i.kitchen_status === "new");
  const ready = items.filter(i => i.kitchen_status === "ready");
  const delivered = items.filter(i => i.kitchen_status === "delivered");

  // ❌ Removed: auto-close when all delivered

  const tableNo = table ?? order?.table_number ?? null;

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center px-3 py-8">
      <div className="w-full max-w-md bg-gradient-to-br from-blue-50 via-indigo-50 to-pink-50 rounded-3xl shadow-2xl p-5 flex flex-col items-center">
        <div className="mb-2 text-lg font-bold text-blue-700">
          {tableNo ? (<>🍽️ {t("Table")} {tableNo}</>) : (<>{t("Your Order")}</>)}
        </div>
        <div className="text-2xl font-extrabold text-fuchsia-700 mb-1">
          {t("Order in Progress")}
        </div>
        <div className="mb-4 text-base text-indigo-800 font-semibold">
          <span>⏱️ {t("Time")}: <span className="font-mono">{timer}</span></span>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="w-full mb-4">
            <div className="font-bold text-indigo-700 mb-2">🛍️ {t("Items Ordered")}</div>
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const lineTotal = (item.price || 0) * (item.quantity || 1);
                return (
                  <li key={item.id} className="flex flex-col bg-white border border-blue-100 rounded-xl p-3 shadow-sm">
                    <div className="flex justify-between items-center font-bold text-blue-900">
                      <span>{item.name}</span>
                      <span className="text-xs">x{item.quantity}</span>
                    </div>
                    <div className="mt-1 text-sm flex justify-between text-indigo-700 font-semibold">
                      <span>{t("Price")}: ₺{(item.price || 0).toFixed(2)}</span>
                      <span>{t("Total")}: ₺{lineTotal.toFixed(2)}</span>
                    </div>
                    {item.extras?.length > 0 && (
                      <div className="mt-1 text-xs text-gray-500">
                        {t("Extras")}: {item.extras.map(ex => `${ex.name} ×${ex.quantity || 1}`).join(", ")}
                      </div>
                    )}
                    {item.note && (
                      <div className="mt-1 text-xs text-yellow-700 italic">
                        {t("Note")}: {item.note}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Preparing */}
        {preparing.length > 0 && (
          <div className="w-full mb-3">
            <div className="font-bold text-yellow-700 mb-2">{t("Preparing")}</div>
            <ul className="flex flex-col gap-2">
              {preparing.map((item) => (
                <li key={item.id} className="flex justify-between items-center bg-yellow-50 rounded-xl px-3 py-2 text-yellow-900 font-bold text-base shadow-sm">
                  <span>{item.name}</span>
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
                  <span>{item.name}</span>
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
                  <span>{item.name}</span>
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
