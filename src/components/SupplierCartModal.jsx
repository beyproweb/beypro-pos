import React, { useState } from "react";
import { useTranslation } from "react-i18next";
export default function SupplierCartModal({
  scheduledAt,
  setScheduledAt,
  cartItems,
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
}) {
  const handleRepeatToggle = (day) => {
    setRepeatDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day]
    );
  };
 const { t, i18n } = useTranslation();
const formatLocalDatetime = (dateStr) => {
  const d = new Date(dateStr);
  const pad = (n) => n.toString().padStart(2, "0");

  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
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
            <li key={`${item.product_name}_${item.unit}`} className="border-b pb-2 flex justify-between items-center">
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

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          disabled={sending}
          onClick={async () => {
            await onConfirm();
            onClose();
          }}
          className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-400 text-white px-4 py-2 rounded font-bold"
        >
          ✅ {t("Confirm Cart")}
        </button>
        <button
          disabled={sending}
          onClick={async () => {
            await onConfirm();
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
