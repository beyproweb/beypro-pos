import React from "react";

const JsonPreview = ({ t, receipt, rawJson }) => {
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  const totals = receipt?.totals || {};
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("Structured JSON")}</h4>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-200">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="font-semibold text-slate-800 dark:text-slate-100">{t("Header")}</div>
          <div className="mt-1 space-y-1">
            <div>{t("Merchant")}: {receipt?.merchant || t("—")}</div>
            <div>{t("Date")}: {receipt?.date || t("—")}</div>
            <div>{t("Invoice #")}: {receipt?.invoice_no || t("—")}</div>
            <div>{t("Currency")}: {receipt?.currency || "TRY"}</div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="font-semibold text-slate-800 dark:text-slate-100">{t("Totals")}</div>
          <div className="mt-1 space-y-1">
            <div>{t("Subtotal")}: {totals?.subtotal_ex_vat ?? "—"}</div>
            <div>{t("VAT")}: {totals?.vat_total ?? "—"}</div>
            <div className="font-semibold">{t("Grand total")}: {totals?.grand_total ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
        <table className="min-w-full text-[11px] text-slate-700 dark:text-slate-200">
          <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">{t("Name")}</th>
              <th className="px-3 py-2 text-left">{t("Qty")}</th>
              <th className="px-3 py-2 text-left">{t("Unit")}</th>
              <th className="px-3 py-2 text-left">{t("Unit price")}</th>
              <th className="px-3 py-2 text-left">{t("Amt/Case")}</th>
              <th className="px-3 py-2 text-left">{t("Total")}</th>
              <th className="px-3 py-2 text-left">{t("Discount %")}</th>
              <th className="px-3 py-2 text-left">{t("Discount amt")}</th>
              <th className="px-3 py-2 text-left">{t("VAT")}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-slate-400 dark:text-slate-500">
                  {t("No items parsed yet.")}
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={`${item.name || "item"}-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">{item.name || t("Unnamed")}</td>
                  <td className="px-3 py-2">{item.qty_units ?? item.qty_cases ?? item.quantity ?? ""}</td>
                  <td className="px-3 py-2">{item.unit || item.unit_meta || ""}</td>
                  <td className="px-3 py-2">{item.unit_price_ex_vat ?? item.unit_price ?? ""}</td>
                  <td className="px-3 py-2">{item.amount_per_koli ?? item.units_per_case ?? ""}</td>
                  <td className="px-3 py-2">{item.line_total_inc_vat ?? item.totalCost ?? item.total ?? ""}</td>
                  <td className="px-3 py-2">{item.discount_rate ?? ""}</td>
                  <td className="px-3 py-2">{item.discount_amount ?? ""}</td>
                  <td className="px-3 py-2">{item.vat_rate ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100">
        <pre className="whitespace-pre-wrap break-words">
{JSON.stringify(rawJson || {}, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default JsonPreview;
