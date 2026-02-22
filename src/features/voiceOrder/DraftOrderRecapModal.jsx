import React, { memo } from "react";

function formatPrice(value) {
  const amount = Number(value) || 0;
  return `₺${amount.toFixed(2)}`;
}

function getExtraUnitPrice(extra) {
  return Number(extra?.price ?? extra?.extraPrice ?? 0) || 0;
}

function DraftOrderRecapModalComponent({
  open,
  items,
  totalPrice,
  paymentMethod,
  paymentMethods,
  onPaymentMethodChange,
  paymentLabel = "Payment",
  onClose,
  onConfirm,
  onContinue,
  onRemove,
  onChangeQty,
  onChangeExtraQty,
  onClear,
  isSubmitting,
  title = "Your Order",
}) {
  if (!open) return null;

  const safeItems = Array.isArray(items) ? items : [];
  const safePaymentMethods = (Array.isArray(paymentMethods) ? paymentMethods : []).filter(
    (method) => method?.enabled !== false
  );
  const activePaymentMethod = String(
    paymentMethod || safePaymentMethods[0]?.id || ""
  );
  const groupedItems = safeItems.reduce((acc, item) => {
    const label = String(item?.groupLabel || "Table").trim() || "Table";
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});
  const groupLabels = Object.keys(groupedItems);

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order recap"
            className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            X
          </button>
        </div>

        <div className="max-h-[55vh] overflow-auto px-4 py-3">
          {safeItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-neutral-600 dark:text-neutral-400">
              Draft order is empty.
            </div>
          ) : (
            <div className="space-y-3">
              {groupLabels.map((groupLabel) => (
                <section key={groupLabel} className="space-y-2">
                  <div className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:bg-neutral-800 dark:text-neutral-200">
                    {groupLabel}
                  </div>
                  <ul className="space-y-2">
                    {groupedItems[groupLabel].map((item) => {
                      const qty = Number(item?.qty) || 0;
                      const unitPrice = Number(item?.unitPrice) || 0;
                      const extras = Array.isArray(item?.extras) ? item.extras : [];
                      const extrasPerUnit = extras.reduce(
                        (sum, extra) => sum + getExtraUnitPrice(extra) * (Number(extra?.quantity) || 1),
                        0
                      );
                      const lineTotal = qty * (unitPrice + extrasPerUnit);
                      return (
                        <li
                          key={item.key}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-neutral-700 dark:bg-neutral-800/60"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                {item.name}
                              </div>
                              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
                                <button
                                  type="button"
                                  aria-label={`Decrease quantity for ${item.name}`}
                                  onClick={() => {
                                    if (qty <= 1) {
                                      onRemove(item.key);
                                      return;
                                    }
                                    onChangeQty?.(item.key, qty - 1);
                                  }}
                                  className="h-6 w-6 rounded-md bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                >
                                  -
                                </button>
                                <span className="min-w-6 text-center text-sm font-semibold text-slate-900 dark:text-neutral-100">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Increase quantity for ${item.name}`}
                                  onClick={() => onChangeQty?.(item.key, qty + 1)}
                                  className="h-6 w-6 rounded-md bg-slate-100 text-sm font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                                >
                                  +
                                </button>
                                <span className="ml-1 text-[11px] text-slate-500 dark:text-neutral-400">
                                  {formatPrice(unitPrice)} each
                                </span>
                              </div>
                              {extras.length > 0 ? (
                                <div className="mt-2 space-y-1.5">
                                  {extras.map((extra, index) => {
                                    const extraQty = Math.max(1, Number(extra?.quantity) || 1);
                                    const extraKey =
                                      extra?.key || extra?.id || extra?.extraId || `${extra?.name || "extra"}-${index}`;
                                    const extraUnit = getExtraUnitPrice(extra);
                                    const extraLineTotal = extraUnit * extraQty * qty;
                                    return (
                                      <div
                                        key={extraKey}
                                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="truncate text-xs font-semibold text-slate-800 dark:text-neutral-100">
                                              + {extra?.name || "-"}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-neutral-400">
                                              {formatPrice(extraUnit)} each
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                                              <button
                                                type="button"
                                                aria-label={`Decrease quantity for extra ${extra?.name || ""}`}
                                                onClick={() => onChangeExtraQty?.(item.key, extraKey, extraQty - 1)}
                                                className="h-5 w-5 rounded bg-white text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
                                              >
                                                -
                                              </button>
                                              <span className="min-w-5 text-center text-xs font-semibold text-slate-800 dark:text-neutral-100">
                                                {extraQty}
                                              </span>
                                              <button
                                                type="button"
                                                aria-label={`Increase quantity for extra ${extra?.name || ""}`}
                                                onClick={() => onChangeExtraQty?.(item.key, extraKey, extraQty + 1)}
                                                className="h-5 w-5 rounded bg-white text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
                                              >
                                                +
                                              </button>
                                            </div>
                                            <div className="mt-1 text-[11px] font-semibold text-slate-700 dark:text-neutral-200">
                                              {formatPrice(extraLineTotal)}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                              {item.notes ? (
                                <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{item.notes}</div>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-slate-800 dark:text-neutral-100">
                                {formatPrice(lineTotal)}
                              </div>
                              <button
                                type="button"
                                onClick={() => onRemove(item.key)}
                                className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/45"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-4 py-3 dark:border-neutral-700">
          {safePaymentMethods.length > 0 ? (
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-300">
                {paymentLabel}
              </label>
              <select
                value={activePaymentMethod}
                onChange={(e) => onPaymentMethodChange?.(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {safePaymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label || method.id}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600 dark:text-neutral-300">Total</span>
            <span className="text-base font-semibold text-slate-900 dark:text-neutral-100">
              {formatPrice(totalPrice)}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={safeItems.length === 0 || isSubmitting}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Confirm Order"}
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              Continue Adding
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/45 sm:col-span-2"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DraftOrderRecapModal = memo(DraftOrderRecapModalComponent);

export default DraftOrderRecapModal;
