import React from "react";

export default function SupplierTransactionHistoryPage({
  t,
  latestTransaction,
  transactionView,
  setTransactionView,
  transactionDateFrom,
  setTransactionDateFrom,
  transactionDateTo,
  setTransactionDateTo,
  selectedSupplier,
  outstandingAmount,
  transactionHistoryTotals,
  filteredTransactions,
  formatCurrency,
  getLocalizedDate,
  resolveTxnDate,
  paymentChipLabel,
  parseOcrNumber,
  setPreviewImage,
  handleDownloadHistory,
  handleClearTransactions,
}) {
  return (
    <div className="space-y-6">
      {latestTransaction && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            🆕 {t("Latest Added Order")}
          </h3>
          <div className="flex flex-wrap justify-between text-sm text-slate-600 dark:text-slate-300">
            <p>
              <span className="font-semibold">{t("Ingredient")}:</span>{" "}
              {latestTransaction.ingredient}
            </p>
            <p>
              <span className="font-semibold">{t("Quantity")}:</span>{" "}
              {latestTransaction.quantity} {latestTransaction.unit}
            </p>
            <p>
              <span className="font-semibold">{t("Total Cost")}:</span>{" "}
              {formatCurrency(Number(latestTransaction.total_cost || 0))}
            </p>
            <p>
              <span className="font-semibold">{t("Payment Method")}:</span>{" "}
              {latestTransaction.payment_method}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("Added at")}: {new Date(latestTransaction.created_at).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <section
        id="transaction-history"
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("Transaction History")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedSupplier?.name
                  ? t("Review every purchase and payment for {{supplier}} with clear statuses.", {
                      supplier: selectedSupplier.name,
                    })
                  : t("Review every purchase and payment with clear statuses.")}
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end sm:justify-end">
              <div className="inline-flex w-full overflow-x-auto rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:w-auto">
                {[
                  { value: "all", label: t("All") },
                  { value: "purchases", label: t("Purchases") },
                  { value: "payments", label: t("Payments") },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTransactionView(option.value)}
                    className={`inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition sm:flex-none sm:min-w-[110px] ${
                      transactionView === option.value
                        ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t("From")}
                  <input
                    type="date"
                    value={transactionDateFrom}
                    max={transactionDateTo || undefined}
                    onChange={(event) => setTransactionDateFrom(event.target.value)}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t("To")}
                  <input
                    type="date"
                    value={transactionDateTo}
                    min={transactionDateFrom || undefined}
                    onChange={(event) => setTransactionDateTo(event.target.value)}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                {(transactionDateFrom || transactionDateTo) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTransactionDateFrom("");
                      setTransactionDateTo("");
                    }}
                    className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    {t("Clear")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {t("Outstanding")}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                {formatCurrency(outstandingAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {t("Total purchases")}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                {formatCurrency(transactionHistoryTotals.totalPurchases)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                {t("Payments made")}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
                {formatCurrency(transactionHistoryTotals.totalPaid)}
              </p>
            </div>
          </div>

          {filteredTransactions.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
              <div className="hidden grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:grid">
                <div className="col-span-3">{t("Date")}</div>
                <div className="col-span-2">{t("Type")}</div>
                <div className="col-span-4">{t("Description")}</div>
                <div className="col-span-2">{t("Payment Method")}</div>
                <div className="col-span-1 text-right">{t("Amount")}</div>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredTransactions.map((txn, idx) => {
                  const isPayment = txn?.ingredient === "Payment";
                  const totalCost = Number(txn?.total_cost) || 0;
                  const amountPaid = Number(txn?.amount_paid) || 0;
                  const effectivePayment = amountPaid || totalCost;
                  const delta = isPayment ? -effectivePayment : totalCost;
                  const dateLabel = getLocalizedDate(resolveTxnDate(txn));
                  const paymentLabel =
                    txn?.payment_method && paymentChipLabel(txn.payment_method);
                  const hasItems = Array.isArray(txn?.items) && txn.items.length > 0;
                  const hasReceipt = !!txn?.receipt_url;
                  const hasDetails = hasItems || hasReceipt;
                  const typeLabel = isPayment ? t("Payments") : t("Purchases");
                  const description = isPayment
                    ? t("Payment recorded")
                    : txn?.ingredient || t("Compiled Receipt");
                  const rowKey =
                    txn?.id ||
                    `${resolveTxnDate(txn) || "txn"}:${txn?.ingredient || "item"}:${idx}`;

                  const row = (
                    <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-12 sm:gap-3">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 sm:col-span-3">
                        {dateLabel}
                      </div>
                      <div className="sm:col-span-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                            isPayment
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      <div className="min-w-0 sm:col-span-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {description}
                          </span>
                          {hasItems && (
                            <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {txn.items.length} {t("Items")}
                            </span>
                          )}
                          {hasReceipt && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setPreviewImage(txn.receipt_url);
                              }}
                              className="flex-shrink-0 text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                            >
                              {t("View receipt")}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        {paymentLabel ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {paymentLabel}
                          </span>
                        ) : (
                          <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </div>
                      <div className="text-right text-sm font-semibold sm:col-span-1">
                        <span
                          className={
                            delta < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }
                        >
                          {delta < 0 ? "−" : "+"}
                          {formatCurrency(Math.abs(delta))}
                        </span>
                      </div>
                    </div>
                  );

                  if (!hasDetails) {
                    return <div key={rowKey}>{row}</div>;
                  }

                  return (
                    <details key={rowKey} className="group">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">{row}</div>
                          <div className="hidden items-center px-2 text-slate-400 dark:text-slate-500 sm:flex">
                            <span className="group-open:hidden">▾</span>
                            <span className="hidden group-open:inline">▴</span>
                          </div>
                        </div>
                      </summary>
                      {hasItems && (
                        <div className="px-4 pb-4">
                          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                            <div className="grid grid-cols-12 gap-2 border-b border-slate-200 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                              <div className="col-span-6">{t("Ingredient")}</div>
                              <div className="col-span-2 text-right">{t("Quantity")}</div>
                              <div className="col-span-2 text-right">{t("Tax")}</div>
                              <div className="col-span-2 text-right">{t("Total cost")}</div>
                            </div>
                            <div className="mt-2 space-y-2">
                              {txn.items.map((item, itemIndex) => (
                                <div key={itemIndex} className="grid grid-cols-12 gap-2 text-sm">
                                  <div className="col-span-6 font-semibold text-slate-800 dark:text-slate-100">
                                    {item?.ingredient || t("Unnamed item")}
                                  </div>
                                  <div className="col-span-2 text-right text-slate-600 dark:text-slate-300">
                                    {item?.quantity ?? "—"} {item?.unit || ""}
                                  </div>
                                  <div className="col-span-2 text-right text-slate-600 dark:text-slate-300">
                                    {(() => {
                                      const taxRate = parseOcrNumber(
                                        item?.tax ?? item?.vat_rate ?? item?.tax_rate ?? null
                                      );
                                      return Number.isFinite(taxRate) ? `${taxRate}%` : "—";
                                    })()}
                                  </div>
                                  <div className="col-span-2 text-right font-semibold text-slate-900 dark:text-white">
                                    {formatCurrency(Number(item?.total_cost || 0))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
              {t("No transactions recorded yet for this supplier.")}
            </div>
          )}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Supplier management")}
        </p>
        <ul className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex items-start gap-3">
            <span className="mt-1 text-lg">🧾</span>
            <div className="space-y-2">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {t("Download transaction log")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("Share Excel reports with accounting whenever requested.")}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={handleDownloadHistory}
              >
                📥 {t("Export Excel")}
              </button>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 text-lg">🧹</span>
            <div className="space-y-2">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {t("Reset transaction history")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("Start fresh after completing annual reconciliation.")}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-slate-800"
                onClick={handleClearTransactions}
              >
                🧹 {t("Clear history")}
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
