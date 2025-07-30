import React from "react";

export default function DiscountModal({
  show,
  onClose,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  t
}) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl w-[90vw] max-w-xs shadow-2xl">
        <h2 className="text-xl font-bold mb-2 text-blue-700 dark:text-white">🎁 {t("Apply Discount")}</h2>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setDiscountType("percent")}
            className={`flex-1 px-2 py-1 rounded-lg font-semibold ${
              discountType === "percent"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200"
            }`}
          >%</button>
          <button
            onClick={() => setDiscountType("fixed")}
            className={`flex-1 px-2 py-1 rounded-lg font-semibold ${
              discountType === "fixed"
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200"
            }`}
          >₺</button>
        </div>
        <div className="flex gap-2 mb-4 justify-center">
          {[5, 10, 15, 20].map(val => (
            <button
              key={val}
              onClick={() => setDiscountValue(val)}
              className={`
                px-3 py-1 rounded-xl font-bold text-base transition
                ${discountValue === val
                  ? "bg-indigo-600 text-white shadow-lg scale-105"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"}
              `}
              type="button"
            >
              {discountType === "percent" ? `%${val}` : `₺${val}`}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={discountValue}
          onChange={e => setDiscountValue(Number(e.target.value))}
          min={1}
          className="w-full mb-4 px-3 py-2 rounded-xl border border-blue-100 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-lg text-center"
          placeholder={discountType === "percent" ? "%" : "₺"}
        />
        <button
          className="w-full py-2 rounded-xl bg-gradient-to-r from-green-500 via-blue-400 to-indigo-400 text-white font-bold text-lg shadow-lg hover:brightness-105 transition"
          onClick={onClose}
        >
          {t("Apply")}
        </button>
        <button
          className="w-full mt-2 py-2 rounded-xl bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 font-bold text-base hover:bg-gray-300 dark:hover:bg-zinc-700 transition"
          onClick={() => {
            onClose();
            setDiscountValue(0);
            setDiscountType("percent");
          }}
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}
