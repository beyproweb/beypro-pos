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
  <div className="p-4 max-h-[80vh] overflow-hidden flex flex-col">
    <h2 className="text-xl font-semibold mb-2">{t("Order Status")}</h2>

    {loading && <div>{t("Loading order...")}</div>}
    {error && <div className="text-red-600">{error}</div>}

    {!loading && !error && order && (
      <>
        {/* Header row */}
        <div className="mb-2 flex gap-4 text-sm shrink-0">
          <span>
            {t("Order ID")}: <strong>#{orderId}</strong>
          </span>
          {order.table_number != null && (
            <span>
              {t("Table")}: <strong>{order.table_number}</strong>
            </span>
          )}
          <span>
            {t("Status")}:{" "}
            <strong className="capitalize">
              {String(order.status || "pending")}
            </strong>
          </span>
        </div>

        {/* Items box: header fixed, list scrolls */}
        <div className="border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="px-3 py-2 font-medium bg-gray-50 shrink-0">
            {t("Items")}
          </div>

          <div className="flex-1 overflow-y-auto max-h-[50vh]">
            <ul className="divide-y">
              {items.map((it, idx) => (
                <li className="px-3 py-2 flex justify-between" key={idx}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {it.name ?? it.order_item_name ?? it.product_name ?? t("Item")}
                    </div>

                    {Array.isArray(it.extras) && it.extras.length > 0 && (
                      <div className="text-xs text-gray-600">
                        {(it.extras || [])
                          .map((ex) => ex.name ?? ex.label)
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}

                    {it.quantity != null && (
                      <div className="text-xs text-gray-600">
                        {t("Qty")}: {it.quantity}
                      </div>
                    )}
                  </div>

                  <div className="ml-3 shrink-0">
                    {Number(it.total ?? it.price ?? 0).toFixed(2)}
                  </div>
                </li>
              ))}

              {items.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">
                  {t("No items yet.")}
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Footer: total + hint (fixed) */}
        <div className="mt-3 flex justify-between text-base shrink-0">
          <span className="font-medium">{t("Total")}</span>
          <span className="font-semibold">
            {Number(total || 0).toFixed(2)}
          </span>
        </div>

        <div className="mt-4 text-xs text-gray-500 shrink-0">
          {t("This screen updates automatically.")}
        </div>
      </>
    )}
  </div>
);



export default OrderStatusScreen;
