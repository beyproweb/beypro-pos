import React, { useMemo } from "react";

const ValidationSummary = ({ t, receipt }) => {
  const { delta, grandTotal, itemSum, derivedCount, totalKoliCases, derivedCaseQtyUnits } = useMemo(() => {
    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    let totalKoliCases = 0;
    let derivedCaseQtyUnits = 0;
    let derived = 0;
    const sum = items.reduce((acc, item) => {
      const qtyUnitsRaw = Number(item?.qty_units ?? item?.quantity ?? 0) || 0;
      const qtyCases = Number(item?.qty_cases ?? 0) || 0;
      const unitsPerCase = Number(item?.amount_per_koli ?? item?.units_per_case ?? 0) || 0;
      const unitPrice = Number(item?.unit_price_ex_vat ?? item?.unit_price ?? 0) || 0;
      const explicitLine = Number(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total ?? 0) || 0;

      let qtyUnits = qtyUnitsRaw;
      if (!qtyUnits && qtyCases > 0 && unitsPerCase > 0) {
        qtyUnits = qtyCases * unitsPerCase;
        derived += 1;
        derivedCaseQtyUnits += qtyUnits;
      }
      if (qtyCases > 0) totalKoliCases += qtyCases;

      let lineTotal = explicitLine;
      if (!lineTotal && qtyUnits > 0 && unitPrice >= 0) {
        lineTotal = qtyUnits * unitPrice;
        derived += 1;
      }

      return acc + lineTotal;
    }, 0);

    const gt = Number(receipt?.totals?.grand_total ?? 0) || 0;
    return {
      itemSum: sum,
      grandTotal: gt,
      delta: gt ? sum - gt : sum,
      derivedCount: derived,
      totalKoliCases,
      derivedCaseQtyUnits,
    };
  }, [receipt]);

  const ok = Math.abs(delta) <= 0.01;

  return (
    <div
      className={`rounded-2xl border p-3 text-sm ${
        ok
          ? "border-emerald-300 bg-emerald-50/60 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200"
          : "border-rose-300 bg-rose-50/70 text-rose-700 dark:border-rose-700/50 dark:bg-rose-900/30 dark:text-rose-200"
      }`}
    >
      <div className="font-semibold">
        {ok ? t("Totals look consistent") : t("Totals mismatch")}
      </div>
      <div className="mt-1 text-[12px]">
        {t("Sum of item totals")}: {itemSum.toFixed(2)} | {t("Grand total")}: {grandTotal.toFixed(2)} | Δ {delta.toFixed(2)}
      </div>
      {derivedCount > 0 ? (
        <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
          {t("Used koli/case amounts to derive")} {derivedCount} {t("values")}
        </div>
      ) : null}
      <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
        {t("Koli/case")}: {t("amount per koli × koli = quantity")} | {t("Total koli")} {totalKoliCases.toFixed(3)} | {t("Derived qty from cases")} {derivedCaseQtyUnits.toFixed(3)}
      </div>
    </div>
  );
};

export default ValidationSummary;
