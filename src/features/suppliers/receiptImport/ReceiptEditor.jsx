import React from "react";
import ReceiptItemRowsEditor from "./ReceiptItemRowsEditor";

const fieldLabelClass =
  "text-[0.95rem] font-medium text-slate-700 dark:text-slate-200";
const fieldInputClass =
  "h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30";

const ReceiptEditor = ({ t, receipt, onChange, supplierId, supplierIngredients = [] }) => {
  const safeReceipt = receipt || {};
  const items = Array.isArray(safeReceipt.items) ? safeReceipt.items : [];
  const currencyCode = String(safeReceipt.currency || "TRY").trim().toUpperCase();
  const safeOnChange = onChange || (() => {});

  const updateHeader = (key, value) => {
    onChange({
      ...safeReceipt,
      [key]: value,
    });
  };

  const updateTotals = (key, value) => {
    onChange({
      ...safeReceipt,
      totals: { ...(safeReceipt.totals || {}), [key]: value },
    });
  };

  return (
    <div className="rounded-[30px] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 md:p-6">
      <h4 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{t("Corrections")}</h4>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{t("Merchant")}</span>
          <input
            className={fieldInputClass}
            value={safeReceipt.merchant || ""}
            onChange={(e) => updateHeader("merchant", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{t("Tax Number")}</span>
          <input
            className={fieldInputClass}
            value={safeReceipt.vat_number || ""}
            onChange={(e) => updateHeader("vat_number", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{t("Date")}</span>
          <input
            type="date"
            className={fieldInputClass}
            value={safeReceipt.date || ""}
            onChange={(e) => updateHeader("date", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{t("Invoice #")}</span>
          <input
            className={fieldInputClass}
            value={safeReceipt.invoice_no || ""}
            onChange={(e) => updateHeader("invoice_no", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={fieldLabelClass}>{t("Currency")}</span>
          <input
            className={`${fieldInputClass} uppercase`}
            value={safeReceipt.currency || "TRY"}
            onChange={(e) => updateHeader("currency", e.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { key: "subtotal_ex_vat", label: t("Subtotal") },
          { key: "vat_total", label: t("VAT") },
          { key: "grand_total", label: t("Grand total") },
          { key: "discount_total", label: t("Discount total") },
        ].map((tot) => (
          <label key={tot.key} className="flex flex-col gap-2">
            <span className={fieldLabelClass}>{tot.label}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className={fieldInputClass}
              value={safeReceipt?.totals?.[tot.key] ?? ""}
              onChange={(e) => updateTotals(tot.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <ReceiptItemRowsEditor
        t={t}
        items={items}
        onChangeItems={(nextItems) => safeOnChange({ ...safeReceipt, items: nextItems })}
        supplierId={supplierId}
        supplierIngredients={supplierIngredients}
        currencyCode={currencyCode}
        wrapInCard={false}
        compactLayout
      />
    </div>
  );
};

export default ReceiptEditor;
