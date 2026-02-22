import React from "react";

export default function RegisterReconciliationPanel({
  t,
  reconLoading,
  openingFloat,
  expectedCashComputed,
  actualCash,
  setActualCash,
  config,
  cashDiffColor,
  cashDifference,
  formatCurrency,
}) {
  return (
    <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Block 1</p>
          <h3 className="text-lg font-semibold text-slate-900">{t("Cash reconciliation")}</h3>
        </div>
        {reconLoading && <span className="text-xs text-slate-500">{t("Loading snapshot...")}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-sm font-semibold text-slate-700">{t("Opening Float")}</label>
          <div className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold tabular-nums">
            {formatCurrency(openingFloat)}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">{t("Expected Cash")}</label>
          <div className="mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold tabular-nums">
            {formatCurrency(expectedCashComputed)}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            {t("Counted Cash")} <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
            className="w-full mt-1 px-3 py-3 rounded-xl border-2 border-slate-300 focus:border-indigo-500 shadow-sm text-lg"
            placeholder={`${config?.symbol || ""}0.00`}
            min="0"
          />
        </div>
        <div className="flex flex-col justify-end">
          <span className="text-sm font-semibold text-slate-700">{t("Difference")}</span>
          <span className={`mt-2 text-xl font-bold tabular-nums ${cashDiffColor}`}>
            {formatCurrency(cashDifference)}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mt-3">{t("Count the drawer and enter actual cash.")}</p>
    </section>
  );
}
