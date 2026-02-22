import { useTranslation } from "react-i18next";

export default function CancelOrderModal({
  open,
  order,
  cancelReason,
  onCancelReasonChange,
  cancelLoading,
  refundMethodId,
  onRefundMethodIdChange,
  refundMode,
  onRefundModeChange,
  shouldShowRefundMethod,
  refundAmount,
  methodOptionSource,
  formatCurrency,
  onClose,
  onSubmit,
}) {
  const { t } = useTranslation();

  if (!open || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1 dark:text-slate-500">
              {t("Cancel Order")}
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("Order")} #{order?.id || "-"}
            </p>
            <p className="text-sm text-rose-500 mt-1">
              {order?.customer_name || t("Customer")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3 dark:text-slate-300">
          {t("The cancellation reason will be recorded for auditing.")}
        </p>

        {shouldShowRefundMethod ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 mb-3 dark:border-rose-500/25 dark:bg-rose-950/20">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-200">
                <input
                  type="radio"
                  name="refund-mode"
                  checked={refundMode === "refund"}
                  onChange={() => onRefundModeChange("refund")}
                />
                {t("Refund")}
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-200">
                <input
                  type="radio"
                  name="refund-mode"
                  checked={refundMode === "no_refund"}
                  onChange={() => onRefundModeChange("no_refund")}
                />
                {t("No refund")}
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-rose-500">
              {t("Refund Method")}
              {refundMode === "refund" ? (
                <select
                  className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200 dark:focus:ring-rose-500/20"
                  value={refundMethodId}
                  onChange={(event) => onRefundMethodIdChange(event.target.value)}
                >
                  {methodOptionSource.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-rose-500/30 dark:bg-slate-900 dark:text-slate-200">
                  {t("No refund will be recorded for this cancellation.")}
                </div>
              )}
            </label>
            <p className="text-xs text-rose-500 dark:text-rose-300">
              {t("Refund amount")}: {formatCurrency(refundAmount)}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {t("No paid items detected. This will simply cancel the order.")}
          </p>
        )}

        <textarea
          rows={4}
          value={cancelReason}
          onChange={(event) => onCancelReasonChange(event.target.value)}
          placeholder={t("Why is the order being cancelled?")}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-rose-500/20"
        />

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            {t("Back")}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={cancelLoading || !cancelReason.trim()}
            className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
              cancelLoading || !cancelReason.trim()
                ? "cursor-not-allowed bg-rose-200"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {cancelLoading ? t("Cancelling...") : t("Confirm Cancellation")}
          </button>
        </div>
      </div>
    </div>
  );
}
