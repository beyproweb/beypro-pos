import { useTranslation } from "react-i18next";

export default function PaymentModal({
  open,
  order,
  splitPayments,
  methodOptionSource,
  config,
  formatCurrency,
  grandTotal,
  paidTotal,
  onClose,
  onMethodChange,
  onAmountChange,
  onRemoveRow,
  onAddRow,
  onSubmit,
}) {
  const { t } = useTranslation();

  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
      <div className="relative bg-white rounded-3xl w-[94vw] max-w-md mx-auto p-7 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 animate-fade-in dark:bg-slate-950 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-2xl text-slate-400 hover:text-emerald-500 transition dark:hover:text-emerald-300"
          title={t("Close")}
        >
          ✕
        </button>
        {/* Title */}
        <div className="flex flex-col items-center mb-5">
          <div className="text-3xl font-semibold text-slate-900 mb-1 dark:text-slate-100">💸 {t("Payment")}</div>
          <div className="text-sm font-medium text-slate-500 mb-2 dark:text-slate-300">
            {t("Order")} #{order.id}
          </div>
          <div className="text-xs bg-slate-100 text-slate-500 rounded-xl px-4 py-1 font-medium tracking-[0.35em] uppercase border border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700">
            {t("Split between multiple payment methods if needed.")}
          </div>
        </div>
        {/* Split Payment Rows */}
        <div className="flex flex-col gap-3 mb-5">
          {splitPayments.map((pay, idx) => (
            <div
              key={idx}
              className="flex gap-3 items-center group animate-fade-in border-b border-slate-200 pb-2 dark:border-slate-800"
            >
              <select
                value={pay.method}
                onChange={(e) => onMethodChange(idx, e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 font-medium text-base bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500/30"
              >
                {!methodOptionSource.some((method) => method.label === pay.method) &&
                  pay.method && (
                    <option value={pay.method}>{pay.method}</option>
                  )}
                {methodOptionSource.map((method) => (
                  <option key={method.id} value={method.label}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="w-28 rounded-xl border border-slate-200 px-4 py-2 text-base text-right font-mono bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/30"
                placeholder={`${config?.symbol || ""}0.00`}
                value={pay.amount}
                onChange={(e) => onAmountChange(idx, e.target.value)}
              />
              {splitPayments.length > 1 && (
                <button
                  className="ml-2 p-2 bg-slate-100 text-rose-500 rounded-full hover:bg-rose-100 border border-slate-200 transition dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-rose-950/25"
                  onClick={() => onRemoveRow(idx)}
                  title={t("Remove")}
                >
                  –
                </button>
              )}
            </div>
          ))}
          <button
            className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium shadow transition-all dark:bg-indigo-600 dark:hover:bg-indigo-500"
            onClick={onAddRow}
          >
            <span className="text-lg sm:text-xl">+</span> {t("Add Payment Method")}
          </button>
        </div>
        {/* Total Summary */}
        <div className="bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-2xl shadow-inner text-center dark:bg-emerald-950/25 dark:border-emerald-500/30">
          <span className="text-2xl sm:text-4xl text-emerald-700 font-extrabold font-mono tracking-tight dark:text-emerald-200">
            {formatCurrency(grandTotal)}
          </span>
          <span className="text-sm sm:text-base text-slate-600 flex gap-2 items-center dark:text-slate-300">
            {t("Split Amount Paid")}:&nbsp;
            <span className="text-lg sm:text-xl font-semibold text-slate-900 font-mono dark:text-slate-100">
              {formatCurrency(paidTotal)}
            </span>
          </span>
          {/* Remaining Balance */}
          {(() => {
            const remaining = grandTotal - paidTotal;
            return (
              <div
                className={`mt-2 text-base sm:text-lg font-semibold ${
                  remaining > 0
                    ? "text-amber-500"
                    : remaining < 0
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {remaining > 0
                  ? t("Remaining: {{amount}}", { amount: formatCurrency(remaining) })
                  : remaining < 0
                  ? t("Overpaid: {{amount}}", { amount: formatCurrency(Math.abs(remaining)) })
                  : ``}
              </div>
            );
          })()}
          {paidTotal !== grandTotal && (
            <span className="text-rose-500 text-sm mt-1 animate-pulse">
              {t("Amounts must sum to order total.")}
            </span>
          )}
        </div>
        {/* Save/Cancel */}
        <div className="flex gap-3 justify-end mt-5">
          <button
            className="px-5 py-2 rounded-xl bg-white text-slate-600 font-medium border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            {t("Cancel")}
          </button>
          <button
            className={`px-6 py-2 rounded-xl font-semibold shadow text-white transition-all duration-150 ${
              paidTotal === grandTotal
                ? "bg-emerald-500 hover:bg-emerald-400 scale-[1.02] dark:bg-emerald-600 dark:hover:bg-emerald-500"
                : "bg-slate-300 cursor-not-allowed text-slate-500 dark:bg-slate-700 dark:text-slate-300"
            }`}
            disabled={paidTotal !== grandTotal}
            onClick={onSubmit}
          >
            {t("Save Payment")}
          </button>
        </div>
        <style>{`
          .animate-fade-in {
            animation: fadeIn .3s cubic-bezier(.4,0,.2,1);
          }
          @keyframes fadeIn {
            from { opacity:0; transform:scale(0.95);}
            to { opacity:1; transform:scale(1);}
          }
        `}</style>
      </div>
    </div>
  );
}
