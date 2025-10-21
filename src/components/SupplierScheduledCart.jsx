import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";

export default function SupplierScheduledCart({ supplier, openSupplierCart }) {
  const [cartInfo, setCartInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const { t } = useTranslation();

  // ✅ Fetch scheduled + history carts
  const fetchCartInfo = async () => {
    setLoading(true);
    try {
      const scheduledData = await secureFetch(
        `/supplier-carts/scheduled?supplier_id=${supplier.id}`
      );
      const historyDataRaw = await secureFetch(
        `/supplier-carts/history?supplier_id=${supplier.id}`
      );
      const historyData = Array.isArray(historyDataRaw?.history)
        ? historyDataRaw.history
        : [];

      let displayData = null;
      if (scheduledData?.items?.length) {
        displayData = { ...scheduledData, fromHistory: false };
      } else if (historyData.length) {
        const fallback = historyData[0];
        console.log("🧠 Using fallback from history:", fallback);
        displayData = {
          cart_id: null,
          scheduled_at: fallback.scheduled_at,
          repeat_type: fallback.repeat_type,
          repeat_days: fallback.repeat_days,
          auto_confirm: fallback.auto_confirm,
          items: fallback.items,
          fromHistory: true,
        };
      }

      setCartInfo(displayData);
      setHistory(historyData);
    } catch (err) {
      console.error("❌ Failed to fetch cart info:", err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Toggle auto order
  const toggleAutoOrder = async () => {
    if (!cartInfo?.cart_id) return;
    try {
      await secureFetch(`/supplier-carts/${cartInfo.cart_id}/confirm`, {
        method: "PUT",
        body: JSON.stringify({
          scheduled_at: cartInfo.scheduled_at,
          repeat_type: cartInfo.repeat_type,
          repeat_days: cartInfo.repeat_days,
          auto_confirm: !cartInfo.auto_confirm,
        }),
      });
      setCartInfo((prev) => ({ ...prev, auto_confirm: !prev.auto_confirm }));
    } catch (err) {
      console.error("❌ Toggle failed:", err);
    }
  };

  useEffect(() => {
    fetchCartInfo();
  }, []);

  return (
    <div className="bg-gradient-to-r from-indigo-100 to-purple-100 p-5 rounded-xl shadow hover:shadow-lg transition flex flex-col h-full">
      {/* Supplier info */}
      <div>
        <h3 className="text-lg font-bold text-indigo-700">{supplier.name}</h3>
        <p className="text-sm text-gray-600">{supplier.phone || t("No Phone")}</p>
        <p className="text-sm text-gray-600">{supplier.email || t("No Email")}</p>
      </div>

      {/* Cart/History/Details */}
      <div className="flex-1 flex flex-col justify-between mt-2">
        {cartInfo && (
          <div className="mt-4 text-sm bg-white p-3 rounded-lg shadow-inner flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">📅 {t("Order Scheduled")}</span>
              {cartInfo.cart_id && (
                <input
                  type="checkbox"
                  checked={cartInfo.auto_confirm}
                  onChange={toggleAutoOrder}
                  className="w-5 h-5"
                />
              )}
            </div>
            <p>
              <strong>{t("Next")}:</strong>{" "}
              {cartInfo.scheduled_at
                ? new Date(cartInfo.scheduled_at).toLocaleString("tr-TR", {
                    hour12: false,
                  })
                : "—"}
            </p>
            <p>
              <strong>{t("Repeat")}:</strong>{" "}
              {cartInfo.repeat_type || t("none")}
            </p>
            <p>
              <strong>{t("Items")}:</strong>{" "}
              {cartInfo.items?.length || 0}
            </p>
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-3 bg-gray-50 p-3 rounded shadow-inner text-sm flex-1">
            <p className="font-semibold mb-2">🕘 {t("Last Orders")}</p>
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {(showAllHistory ? history : history.slice(0, 5)).map((cart) => (
                <li key={cart.id} className="border-b py-1">
                  <span className="font-medium">
                    {new Date(cart.scheduled_at).toLocaleDateString("tr-TR")}
                  </span>
                  :{" "}
                  {cart.skipped ? (
                    <span className="text-red-500 italic">
                      {t("No order sent (stock OK)")}
                    </span>
                  ) : cart.items?.length > 0 ? (
                    cart.items
                      .map(
                        (item) =>
                          `${item.product_name} (${item.quantity} ${item.unit})`
                      )
                      .join(", ")
                  ) : (
                    <span className="text-gray-500 italic">{t("No items")}</span>
                  )}
                </li>
              ))}
            </ul>
            {history.length > 5 && (
              <button
                onClick={() => setShowAllHistory((prev) => !prev)}
                className="mt-2 text-indigo-600 hover:underline text-xs font-medium"
              >
                {showAllHistory ? "▲ " + t("Show Less") : "▼ " + t("Show More")}
              </button>
            )}
          </div>
        )}

        {loading && (
          <p className="text-xs text-gray-400 mt-2">{t("Updating...")}</p>
        )}
      </div>

      {/* Spacer ensures button is always at the bottom */}
      <div className="flex-grow" />

      {/* Open Cart Button */}
      <button
        onClick={() => openSupplierCart(cartInfo?.cart_id ?? undefined, supplier.id)}// 👈 pass supplierId into modal
        className="mt-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-bold px-4 py-2 rounded-lg transition"
        style={{ marginTop: "auto" }}
      >
        🛒 {t("Open Cart")}
      </button>
    </div>
  );
}
