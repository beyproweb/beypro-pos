// src/pages/OrderStatusScreen.jsx
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getActiveQrOrderId, clearActiveQrOrderId } from "@/utils/qrActiveOrder";

const POLL_MS = 3000;

export default function OrderStatusScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const paramId = params?.orderId;
  const [order, setOrder] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const orderId = paramId || getActiveQrOrderId();

  // If we somehow have no id, go to order type picker
  React.useEffect(() => {
    if (!orderId) {
      navigate("/qr/order-type", { replace: true });
    }
  }, [orderId, navigate]);

  const fetchOnce = React.useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/orders/${orderId}`);
      if (res.status === 404) {
        // Order not found (closed or never existed) → reset and go to type picker
        clearActiveQrOrderId();
        navigate("/qr/order-type", { replace: true });
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Fetch failed: ${res.status} ${text}`);
      }
      const data = await res.json();
      setOrder(data);
      setLoading(false);

      const status = (data?.status || "").toLowerCase();

      // If your backend uses different names, adjust here:
      const isClosed = ["closed", "completed", "cancelled"].includes(status);

      if (isClosed) {
        clearActiveQrOrderId();
        navigate("/qr/order-type", { replace: true });
      }
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load order");
      setLoading(false);
    }
  }, [orderId, navigate]);

  // Poll while the order is active
  React.useEffect(() => {
    fetchOnce(); // initial
    const t = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(t);
  }, [fetchOnce]);

  if (!orderId) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-700">Loading your order status…</div>
    </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2">
        <div className="text-red-600 font-semibold">Couldn’t load order</div>
        <div className="text-gray-600 text-sm">{error}</div>
        <button
          onClick={() => navigate("/qr/order-type", { replace: true })}
          className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white"
        >
          Start a new order
        </button>
      </div>
    );
  }

  const items = order?.items || [];
  const status = (order?.status || "pending").toUpperCase();

  return (
    <div className="min-h-screen w-full max-w-full bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-indigo-900">Order Status</h1>
          <p className="text-sm text-indigo-700 mt-1">Order #{orderId} • {status}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="bg-white rounded-xl p-4 shadow border border-indigo-100">
            <h2 className="font-semibold text-indigo-900 mb-2">Items</h2>
            <ul className="max-h-[60vh] overflow-auto pr-2 space-y-2">
              {items.map((it) => {
                const qty = it.quantity || 1;
                const name = it.name || it.product_name || "Item";
                const price = Number(it.price || 0);
                const line = price * qty;
                return (
                  <li key={it.id} className="flex flex-col border border-indigo-50 rounded-lg p-2">
                    <div className="flex justify-between">
                      <span className="font-medium text-indigo-900">{name}</span>
                      <span className="text-indigo-700">x{qty}</span>
                    </div>
                    <div className="flex justify-between text-sm text-indigo-700">
                      <span>₺{price.toFixed(2)}</span>
                      <span>₺{line.toFixed(2)}</span>
                    </div>
                    {Array.isArray(it.extras) && it.extras.length > 0 && (
                      <div className="mt-1 text-xs text-indigo-600">
                        + {it.extras.map((e) => e?.name || e?.groupName || "extra").join(", ")}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="bg-white rounded-xl p-4 shadow border border-indigo-100">
            <h2 className="font-semibold text-indigo-900 mb-2">Progress</h2>
            <div className="text-indigo-800">
              {status === "PENDING" && "Your order is pending confirmation."}
              {status === "CONFIRMED" && "Your order was confirmed. Preparing…"}
              {status === "PREPARING" && "We’re preparing your order…"}
              {status === "READY" && "Ready for pickup / serving."}
              {status === "DELIVERING" && "Out for delivery."}
              {["CLOSED", "COMPLETED", "CANCELLED"].includes(status) && "Order finished."}
            </div>

            <button
              onClick={() => {
                clearActiveQrOrderId();
                navigate("/qr/order-type", { replace: true });
              }}
              className="mt-4 w-full px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium"
            >
              New Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
