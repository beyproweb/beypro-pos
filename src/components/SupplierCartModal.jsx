import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";

export default function SupplierCartModal({
  supplierId,          // 👈 pass supplierId when opening modal
  scheduledAt,
  setScheduledAt,
  onClose,
  onConfirm,
  onSend,
  sending,
  repeatType,
  setRepeatType,
  repeatDays,
  setRepeatDays,
  autoOrder,
  setAutoOrder,
  cartId,
}) {
  const { t } = useTranslation();
  const [cartItems, setCartItems] = useState([]);
 const [pendingOrders, setPendingOrders] = useState([]);
const [showPending, setShowPending] = useState(false);
// Fetch pending orders
useEffect(() => {
  if (!supplierId) return;
  (async () => {
    try {
      const res = await secureFetch(`/supplier-carts/pending?supplier_id=${supplierId}`);
      setPendingOrders(res.pending || []);
    } catch (err) {
      console.error("❌ Failed to fetch pending orders:", err);
    }
  })();
}, [supplierId, cartId]);

// Cancel handler
const handleCancelOrder = async (id) => {
  try {
    await secureFetch(`/supplier-carts/${id}/cancel`, { method: "PUT" });
    setPendingOrders((prev) => prev.filter((p) => p.id !== id));
  } catch (err) {
    console.error("❌ Cancel order failed:", err);
  }
};
// 🔄 fetch items + scheduling whenever modal opens
useEffect(() => {
  if (!supplierId) return;
  (async () => {
    try {
      // Get cart items
      let data = await secureFetch(`/supplier-carts/items?supplier_id=${supplierId}`);

      // Fetch scheduled metadata
      const scheduled = await secureFetch(`/supplier-carts/scheduled?supplier_id=${supplierId}`);

      // ✅ Merge safely: prefer scheduled values for scheduling
      if (scheduled) {
        data = {
          ...data,
          ...scheduled,
        };

        // Ensure repeat_days always comes from scheduled if valid
        if (Array.isArray(scheduled.repeat_days) && scheduled.repeat_days.length > 0) {
          data.repeat_days = scheduled.repeat_days;
        }
      }

      // ✅ Update items
      setCartItems(data.items || []);

      // ✅ Sync scheduling + repeat state from backend
      if (data.scheduled_at) setScheduledAt(data.scheduled_at);
      if (data.repeat_type) setRepeatType(data.repeat_type);

      if (Array.isArray(data.repeat_days) && data.repeat_days.length > 0) {
        setRepeatDays(data.repeat_days);
      } else {
        console.log("⚠️ Keeping existing repeatDays, backend sent empty:", data.repeat_days);
      }

      if (typeof data.auto_confirm === "boolean") {
        setAutoOrder(data.auto_confirm);
      }
    } catch (err) {
      console.error("❌ Failed to fetch cart items:", err);
      setCartItems([]);
    }
  })();
}, [supplierId, cartId]);





  const handleRepeatToggle = (day) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const formatLocalDatetime = (dateStr) => {
    const d = new Date(dateStr);
    const pad = (n) => n.toString().padStart(2, "0");

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-2xl p-6 w-[500px] max-h-[90vh] overflow-y-auto shadow-xl">
        <h2 className="text-2xl font-bold mb-4">🛒 {t("Supplier Cart")}</h2>

        {/* Date/Time Selector */}
        <div className="mb-6">
          <label className="font-bold mb-2 block">🗓️ {t("Schedule Date & Time")}:</label>
          <input
            type="datetime-local"
            value={scheduledAt ? formatLocalDatetime(scheduledAt) : ""}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border p-3 rounded text-lg w-full"
          />
        </div>

        {/* Repeat Options */}
        <div className="mb-6">
          <label className="font-bold mb-2 block">🔁 {t("Repeat")}:</label>
          <select
            value={repeatType}
            onChange={(e) => setRepeatType(e.target.value)}
            className="border p-2 rounded w-full mb-3"
          >
            <option value="none">{t("Don't repeat")}</option>
            <option value="weekly">{t("Every week")}</option>
            <option value="biweekly">{t("Every 2 weeks")}</option>
            <option value="monthly">{t("Once a month")}</option>
          </select>
          <div className="flex items-center space-x-3 mb-4">
            <input
              type="checkbox"
              checked={autoOrder}
              onChange={(e) => setAutoOrder(e.target.checked)}
              id="autoOrderCheckbox"
              className="w-5 h-5 text-blue-600"
            />
            <label htmlFor="autoOrderCheckbox" className="text-sm font-medium text-gray-700">
              📅 {t("Auto-send this order by schedule")}
            </label>
          </div>

          {(repeatType === "weekly" || repeatType === "biweekly") && (
            <div className="flex justify-between text-sm">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <button
                  key={day}
                  onClick={() => handleRepeatToggle(day)}
                  className={`px-2 py-1 rounded ${
                    repeatDays.includes(day)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200"
                  }`}
                >
                  {t(day)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Items */}
        {cartItems.length > 0 ? (
          <ul className="mb-6 space-y-3">
            {Object.values(
              cartItems.reduce((acc, item) => {
                const key = `${item.product_name}_${item.unit}`;
                if (!acc[key]) {
                  acc[key] = { ...item, quantity: 0 };
                }
                acc[key].quantity += parseFloat(item.quantity);
                return acc;
              }, {})
            ).map((item) => (
              <li
                key={`${item.product_name}_${item.unit}`}
                className="border-b pb-2 flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-blue-700">{item.product_name}</span>{" "}
                  <span className="text-gray-500">({item.unit})</span>
                </div>
                <span className="text-sm font-bold">{item.quantity}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 mb-6">{t("No items in cart yet.")}</p>
        )}
{/* Pending Scheduled Orders */}
<div className="mb-6">
  <button
    onClick={() => setShowPending(!showPending)}
    className="text-indigo-600 font-medium hover:underline"
  >
    {showPending ? "▲ Hide Pending Scheduled Orders" : "▼ Show Pending Scheduled Orders"}
  </button>

  {showPending && (
    <div className="mt-3 space-y-2">
      {pendingOrders.length === 0 ? (
        <p className="text-gray-500">No pending scheduled orders.</p>
      ) : (
        pendingOrders.map((order) => (
          <div
            key={order.id}
            className="flex justify-between items-center border p-2 rounded bg-gray-50"
          >
            <div>
              <p className="font-semibold">
                {new Date(order.scheduled_at).toLocaleString("tr-TR", {
                  hour12: false,
                })}
              </p>
              <p className="text-sm text-gray-600">
                Repeat: {order.repeat_type} – Days:{" "}
                {Array.isArray(order.repeat_days) && order.repeat_days.length > 0
                  ? order.repeat_days.join(", ")
                  : "—"}
              </p>
            </div>
            <button
              onClick={() => handleCancelOrder(order.id)}
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        ))
      )}
    </div>
  )}
</div>

      
{/* Actions */}
<div className="flex justify-end gap-3">
  <button
    disabled={sending}
    onClick={async () => {
      await onConfirm(cartId);  // ✅ pass cartId
      onClose();
    }}
    className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white px-4 py-2 rounded font-bold"
  >
    ✅ {t("Confirm Cart")}
  </button>
  <button
    disabled={sending}
    onClick={async () => {
      await onConfirm(cartId);  // ✅ pass cartId
      await onSend();
      onClose();
    }}
    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded font-bold"
  >
    📩 {t("Send Order")}
  </button>
  <button
    onClick={onClose}
    className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded font-bold"
  >
    ❌ {t("Close")}
  </button>
</div>

      </div>
    </div>
  );
}
