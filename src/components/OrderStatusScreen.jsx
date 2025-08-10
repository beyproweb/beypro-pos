import React, { useEffect, useMemo, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const FINISHED_STATES = ["closed", "completed", "paid", "delivered", "canceled"];

export default function OrderStatusScreen({
  orderId,
  orderProp = null,
  onFinished,
  t = (s) => s,
  lang = "en",
}) {
  const [order, setOrder] = useState(orderProp);
  const [loading, setLoading] = useState(!orderProp);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Load once + poll
  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setError(null);
        if (!orderId) return;
        const res = await fetch(`${API_URL}/api/orders/${orderId}`);
        if (!res.ok) {
          const msg = (await res.text()) || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const data = await res.json();
        if (isMounted) {
          setOrder(data);
          setLoading(false);
        }
      } catch (e) {
        if (isMounted) {
          setError(e.message || "Failed to load order");
          setLoading(false);
        }
      }
    }

    load();
    pollRef.current = setInterval(load, 4000);

    return () => {
      isMounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [orderId]);

  // When finished, notify parent to reset QR flow
  useEffect(() => {
    if (!order) return;
    const s = String(order.status || "").toLowerCase();
    if (FINISHED_STATES.includes(s)) {
      onFinished && onFinished();
    }
  }, [order?.status, onFinished]);

  const items = useMemo(() => {
    // Supports both flat items or items grouped by sub orders depending on your backend
    // Prefer a flat array `order.items`; otherwise try to flatten `order.sub_orders`
    if (Array.isArray(order?.items)) return order.items;
    if (Array.isArray(order?.sub_orders)) {
      return order.sub_orders.flatMap((so) => so.items || []);
    }
    return [];
  }, [order]);

  const total = useMemo(() => {
    if (typeof order?.total === "number") return order.total;
    // fallback: sum items if server didn’t send total
    try {
      return items.reduce((acc, it) => acc + Number(it.total || it.price || 0), 0);
    } catch {
      return 0;
    }
  }, [order?.total, items]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-2">{t("Order Status")}</h2>

      {loading && <div>{t("Loading order...")}</div>}
      {error && <div className="text-red-600">{error}</div>}

      {!loading && !error && order && (
        <>
          <div className="mb-2 flex gap-4 text-sm">
            <span>{t("Order ID")}: <strong>#{orderId}</strong></span>
            {order.table_number != null && (
              <span>{t("Table")}: <strong>{order.table_number}</strong></span>
            )}
            <span>
              {t("Status")}:{" "}
              <strong className="capitalize">{String(order.status || "pending")}</strong>
            </span>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 font-medium bg-gray-50">{t("Items")}</div>
            <ul className="divide-y">
              {items.map((it, idx) => (
                <li className="px-3 py-2 flex justify-between" key={idx}>
                  <div className="flex-1">
                    <div className="font-medium">{it.name || it.product_name || t("Item")}</div>
                    {Array.isArray(it.extras) && it.extras.length > 0 && (
                      <div className="text-xs text-gray-600">
                        {it.extras.map((ex) => ex.name || ex.label).join(", ")}
                      </div>
                    )}
                    {it.quantity != null && (
                      <div className="text-xs text-gray-600">
                        {t("Qty")}: {it.quantity}
                      </div>
                    )}
                  </div>
                  <div className="ml-3">
                    {Number(it.total ?? it.price ?? 0).toFixed(2)}
                  </div>
                </li>
              ))}
              {items.length === 0 && (
                <li className="px-3 py-4 text-sm text-gray-500">{t("No items yet.")}</li>
              )}
            </ul>
          </div>

          <div className="mt-3 flex justify-between text-base">
            <span className="font-medium">{t("Total")}</span>
            <span className="font-semibold">{Number(total || 0).toFixed(2)}</span>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            {t("This screen updates automatically.")}
          </div>
        </>
      )}
    </div>
  );
}
