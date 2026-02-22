import React, { useEffect, useState } from "react";
import { useCurrency } from "../../../context/CurrencyContext";

const DEFAULT_ICONS = {
  Cash: "💵",
  "Credit Card": "💳",
  Sodexo: "🍽️",
  Multinet: "🪙",
  Unknown: "❓",
};

function ReceiptGroup({
  receiptId,
  items,
  groupIdx,
  txApiRequest,
  identifier,
  t,
  iconsMap,
}) {
  const icons = iconsMap || DEFAULT_ICONS;
  const initialGuess = items[0]?.payment_method || "Unknown";
  const [methodLabel, setMethodLabel] = useState(`${icons[initialGuess]} ${initialGuess}`);
  const { formatCurrency } = useCurrency();

  useEffect(() => {
    const fetchMethods = async () => {
      try {
        const methods = await txApiRequest(`/orders/receipt-methods/${receiptId}${identifier}`);

        if (!methods.length) {
          const fallback = items[0]?.payment_method || "Unknown";
          setMethodLabel(`${icons[fallback] || "❓"} ${fallback}`);
          return;
        }

        const label = methods
          .filter((m) => m.payment_method && m.payment_method !== "Split")
          .map((m) => {
            const icon = icons[m.payment_method] || "❓";
            const amount = formatCurrency(parseFloat(m.amount));
            return `${icon} ${m.payment_method} ${amount}`;
          })
          .join(" + ");

        setMethodLabel(label);
      } catch (err) {
        console.error("❌ Failed to fetch receipt methods:", err);
        setMethodLabel("❓ Unknown");
      }
    };

    fetchMethods();
  }, [formatCurrency, icons, identifier, items, receiptId, txApiRequest]);

  return (
    <div className="relative flex min-h-full flex-col gap-4 transition-all duration-300 ease-in-out">
      {/* --- RECEIPT PREVIEW HEADER --- */}
      <div className="bg-white dark:bg-zinc-800 shadow-md rounded-b-3xl p-4 sticky top-0 z-30">
        <h1 className="text-xl font-bold text-blue-700 dark:text-blue-300 flex items-center gap-2">
          🧾 {t("Receipt")} #{groupIdx + 1}
        </h1>
      </div>

      {/* --- Receipt Items List --- */}
      <ul className="space-y-2">
        {items.map((item, index) => {
          const quantity = Number(item.quantity || 1);
          const basePrice = Number(item.price || 0);
          const baseTotal = basePrice * quantity;
          const perItemExtrasTotal = (item.extras || []).reduce((sum, ex) => {
            const unit = parseFloat(ex.price || ex.extraPrice || 0) || 0;
            const perItemQty = Number(ex.quantity || 1);
            return sum + unit * perItemQty;
          }, 0);
          const extrasTotal = perItemExtrasTotal * quantity;

          return (
            <li
              key={`${item.unique_id}-${index}`}
              className="p-3 bg-green-50 rounded-lg shadow-sm flex flex-col gap-1"
            >
              {/* --- Top Row: Name + Paid --- */}
              <div className="flex justify-between items-center flex-wrap">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-base sm:text-lg break-words max-w-[65vw]">
                    {item.name}
                  </span>
                  <span className="text-xs sm:text-sm text-gray-600">
                    {formatCurrency(basePrice)} ×{quantity}
                  </span>
                </div>
                <span className="font-bold text-gray-800 flex flex-col items-end text-base sm:text-lg">
                  {formatCurrency(baseTotal)}
                  <span className="text-xs text-red-600 font-extrabold mt-1">{t("paid")}</span>
                </span>
              </div>

              {/* --- Extras (if any) --- */}
              {item.extras?.length > 0 && (
                <div className="ml-2 mt-1 text-xs sm:text-sm text-gray-600 space-y-1">
                  <ul className="list-disc list-inside">
                    {item.extras.map((ex, idx) => {
                      const exQtyPerItem = Number(ex.quantity || 1);
                      const totalQty = exQtyPerItem * quantity;
                      const unit = parseFloat(ex.price || ex.extraPrice || 0) || 0;
                      const lineTotal = unit * totalQty;
                      return (
                        <li key={idx}>
                          {ex.name} ×{totalQty} – {formatCurrency(lineTotal)}
                        </li>
                      );
                    })}
                  </ul>
                  {extrasTotal > 0 && (
                    <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                      <span>{t("Extras total")}</span>
                      <span>{formatCurrency(extrasTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* --- Notes --- */}
              {item.note && item.note.trim() !== "" && (
                <div className="mt-2 bg-yellow-50 border-l-4 border-yellow-400 px-3 py-2 text-xs sm:text-sm text-yellow-900 rounded">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📝</span>
                    <span className="font-medium">{t("Notes")}:</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap leading-snug">{item.note}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* --- Payment Method(s) --- */}
      {methodLabel && (
        <div className="mt-3 bg-blue-50 rounded px-3 py-2 space-y-1">
          {methodLabel.split(" + ").map((line, idx) => {
            const [icon, ...rest] = line.trim().split(" ");
            const label = rest.slice(0, -1).join(" ");
            const amount = rest[rest.length - 1];
            return (
              <div
                key={idx}
                className="flex justify-between items-center text-xs sm:text-sm text-gray-700 font-semibold"
              >
                <div className="flex items-center space-x-1">
                  <span className="w-5 text-lg">{icon}</span>
                  <span>{t(label)}</span>
                </div>
                <span>{amount}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(ReceiptGroup);
