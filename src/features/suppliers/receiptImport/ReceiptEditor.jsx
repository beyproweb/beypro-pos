import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStock } from "../../../context/StockContext";

const toNum = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

const normalizeLower = (value) => String(value || "").trim().toLowerCase();
const fieldLabelClass =
  "text-[0.95rem] font-medium text-slate-700 dark:text-slate-200";
const fieldInputClass =
  "h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30";

const ReceiptEditor = ({ t, receipt, onChange, supplierId, supplierIngredients = [] }) => {
  const safeReceipt = receipt || {};
  const items = Array.isArray(safeReceipt.items) ? safeReceipt.items : [];
  const currencyCode = String(safeReceipt.currency || "TRY").trim().toUpperCase();
  const discountCurrencyLabel = `${t("Discount")}(${
    currencyCode === "TRY" ? "TL" : currencyCode || "TL"
  })`;
  const [bulkNames, setBulkNames] = useState("");
  const [openNameMenuIndex, setOpenNameMenuIndex] = useState(null);
  const nameRefs = useRef([]);
  const prevLength = useRef(items.length);
  const safeOnChange = onChange || (() => {});
  const { stock } = useStock();
  const existingSupplierItems = useMemo(() => {
    const rows = Array.isArray(supplierIngredients) ? supplierIngredients : [];
    const byNameAndUnit = new Map();

    rows.forEach((row) => {
      const name = String(row?.name ?? row?.ingredient ?? "").trim();
      const unit = String(row?.unit || "").trim();
      if (!name || !unit) return;

      const key = `${normalizeLower(name)}|||${normalizeLower(unit)}`;
      const numericPrice = Number(row?.price_per_unit);
      const pricePerUnit = Number.isFinite(numericPrice) && numericPrice > 0 ? numericPrice : 0;

      const prev = byNameAndUnit.get(key);
      if (!prev || pricePerUnit > prev.price_per_unit) {
        byNameAndUnit.set(key, {
          name,
          unit,
          price_per_unit: pricePerUnit,
          nameKey: normalizeLower(name),
          unitKey: normalizeLower(unit),
        });
      }
    });

    return Array.from(byNameAndUnit.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.unit.localeCompare(b.unit, undefined, { sensitivity: "base" });
    });
  }, [supplierIngredients]);

  // Assign stable tempIds to rows lacking an id/unique_id to avoid key remounts.
  useEffect(() => {
    const needs = items.some((it) => !it?.tempId && !it?.id && !it?.unique_id);
    if (needs) {
      const patched = items.map((it) =>
        it?.tempId || it?.id || it?.unique_id
          ? it
          : {
              ...it,
              tempId:
                (typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `tmp-${Math.random().toString(36).slice(2)}`),
            }
      );
      safeOnChange({ ...safeReceipt, items: patched });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (items.length > prevLength.current) {
      const el = nameRefs.current[items.length - 1];
      if (el && typeof el.focus === "function") {
        requestAnimationFrame(() => {
          el.focus();
          el.select?.();
        });
      }
    }
    prevLength.current = items.length;
  }, [items.length]);

  useEffect(() => {
    if (!supplierId || existingSupplierItems.length === 0) {
      setOpenNameMenuIndex(null);
    }
  }, [supplierId, existingSupplierItems.length]);

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

  const updateItem = (idx, next) => {
    const nextItems = items.map((item, i) => (i === idx ? next : item));
    onChange({ ...safeReceipt, items: nextItems });
  };

  const addRow = () => {
    onChange({
      ...safeReceipt,
      items: [
        ...items,
        {
          name: "",
          qty_units: "",
          unit: "pcs",
          unit_price_ex_vat: "",
          line_total_inc_vat: "",
          total_locked: false,
          is_cleaning_supply: false,
          counted_stock: "",
          tempId:
            (typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `tmp-${Math.random().toString(36).slice(2)}`),
        },
      ],
    });
  };

  const removeRow = (idx) => {
    const nextItems = items.filter((_, i) => i !== idx);
    onChange({ ...safeReceipt, items: nextItems });
  };

  const applyBulkNames = () => {
    if (!bulkNames.trim()) return;
    const names = bulkNames
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    const nextItems = items.map((item, idx) => ({
      ...item,
      name: names[idx] ? names[idx] : item.name,
    }));
    onChange({ ...safeReceipt, items: nextItems });
  };

  const applySupplierItemToRow = (idx, match, rawValue) => {
    if (!match) return;
    const current = items[idx] || {};
    const nameValue = rawValue ?? match.name;
    const locked = Boolean(current.total_locked);
    const qtyUnits = toNum(current.qty_units);
    const currentPrice = toNum(current.unit_price_ex_vat);
    const matchPrice = toNum(match.price_per_unit);

    const next = {
      ...current,
      name: nameValue,
      unit: match.unit || current.unit || "pcs",
    };

    if (matchPrice > 0 && !(currentPrice > 0)) {
      next.unit_price_ex_vat = Number(matchPrice.toFixed(4));
      if (!locked && qtyUnits > 0) {
        next.line_total_inc_vat = Number((qtyUnits * matchPrice).toFixed(2));
      }
    }

    updateItem(idx, next);
  };

  const handleItemField = (idx, field, value) => {
    const current = items[idx] || {};
    let next = { ...current, [field]: value };
    const qtyUnitsRaw = toNum(field === "qty_units" ? value : current.qty_units);
    const qtyCases = toNum(field === "qty_cases" ? value : current.qty_cases);
    const amountPerKoli = toNum(
      field === "amount_per_koli"
        ? value
        : current.amount_per_koli ?? current.units_per_case ?? 0
    );
    let price = toNum(field === "unit_price_ex_vat" ? value : current.unit_price_ex_vat);
    const locked = Boolean(current.total_locked);
    let qtyUnits = qtyUnitsRaw;

    // derive qty_units from cases if needed
    if ((!qtyUnits || qtyUnits <= 0) && qtyCases > 0 && amountPerKoli > 0) {
      qtyUnits = qtyCases * amountPerKoli;
      next.qty_units = Number(qtyUnits.toFixed(3));
    }

    if (!locked && (field === "qty_units" || field === "unit_price_ex_vat")) {
      next = {
        ...next,
        line_total_inc_vat: qtyUnits > 0 && price >= 0 ? Number((qtyUnits * price).toFixed(2)) : "",
      };
    }
    if (field === "line_total_inc_vat" && value !== "") {
      next.total_locked = true;
    }
    if (field === "discount_amount" && value === "") {
      next.discount_amount = "";
    }
    if (field === "discount_rate" && value === "") {
      next.discount_rate = "";
    }
    if (field === "amount_per_koli" && value === "") {
      next.amount_per_koli = "";
    }
    if (field === "amount_per_koli") {
      next.units_per_case = value;
      const qtyCasesNum = toNum(current.qty_cases);
      const unitsPerCaseNum = toNum(value);
      if (qtyCasesNum > 0 && unitsPerCaseNum > 0) {
        const derivedQtyUnits = qtyCasesNum * unitsPerCaseNum;
        next.qty_units = Number(derivedQtyUnits.toFixed(3));
      }
    }
    if (field === "qty_cases") {
      const qtyCasesNum = toNum(value);
      const unitsPerCaseNum = toNum(current.amount_per_koli ?? current.units_per_case ?? 0);
      if (qtyCasesNum > 0 && unitsPerCaseNum > 0) {
        next.qty_units = Number((qtyCasesNum * unitsPerCaseNum).toFixed(3));
        if (!locked && price >= 0) {
          next.line_total_inc_vat = Number((next.qty_units * price).toFixed(2));
        }
      }
    }

    // auto-calc unit price from total / qty_units
    const lineTotal = toNum(next.line_total_inc_vat ?? current.line_total_inc_vat ?? 0);
    const finalQtyUnits = toNum(next.qty_units ?? qtyUnits ?? 0);
    if (
      lineTotal > 0 &&
      finalQtyUnits > 0 &&
      (field === "line_total_inc_vat" || field === "qty_units" || field === "qty_cases" || field === "amount_per_koli")
    ) {
      next.unit_price_ex_vat = Number((lineTotal / finalQtyUnits).toFixed(4));
      price = next.unit_price_ex_vat;
    }

    if (field === "name" && supplierId && existingSupplierItems.length > 0) {
      const typedNameKey = normalizeLower(value);
      if (typedNameKey) {
        const unitKey = normalizeLower(current.unit || current.unit_meta || "");
        const exactMatches = existingSupplierItems.filter((entry) => entry.nameKey === typedNameKey);
        if (exactMatches.length > 0) {
          const matched =
            exactMatches.find((entry) => entry.unitKey === unitKey) || exactMatches[0];
          const matchedPrice = toNum(matched?.price_per_unit);
          const currentPrice = toNum(current.unit_price_ex_vat);

          if (matched?.unit) {
            next.unit = matched.unit;
          }
          if (matchedPrice > 0 && !(currentPrice > 0)) {
            next.unit_price_ex_vat = Number(matchedPrice.toFixed(4));
            if (!locked && finalQtyUnits > 0) {
              next.line_total_inc_vat = Number((finalQtyUnits * matchedPrice).toFixed(2));
            }
          }
        }
      }
    }

    updateItem(idx, next);
  };

  const toggleLock = (idx) => {
    const current = items[idx] || {};
    updateItem(idx, { ...current, total_locked: !current.total_locked });
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

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between text-base font-semibold text-slate-700 dark:text-slate-200">
          <span>{t("Items")}</span>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/45">
          <label className="flex flex-col gap-2">
            <span className={fieldLabelClass}>
              {t("Bulk set item names (one per line)")}
            </span>
            <textarea
              className="h-28 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-mono text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
              placeholder={t("Example:\nItem A\nItem B\nItem C")}
            />
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              onClick={applyBulkNames}
              className="rounded-full border border-indigo-300 bg-indigo-50 px-4 py-2 font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/60 dark:bg-indigo-900/30 dark:text-indigo-100"
            >
              {t("Apply names to rows")}
            </button>
            <button
              type="button"
              onClick={() => setBulkNames("")}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("Clear")}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              {t("No items yet. Add one to start corrections.")}
            </div>
          )}
          {items.map((item, idx) => {
            const qtyInvalid = toNum(item.qty_units ?? 0) < 0;
            const priceInvalid = toNum(item.unit_price_ex_vat ?? 0) < 0;
            const discountRateInvalid = toNum(item.discount_rate ?? 0) < 0;
            const discountAmtInvalid = toNum(item.discount_amount ?? 0) < 0;
            const amountPerKoliInvalid = toNum(item.amount_per_koli ?? item.units_per_case ?? 0) < 0;
            const qtyCasesInvalid = toNum(item.qty_cases ?? 0) < 0;
            const itemNameQuery = normalizeLower(item.name);
            const itemNameSuggestions =
              supplierId && itemNameQuery.length >= 2
                ? existingSupplierItems
                    .filter((entry) => entry.nameKey.includes(itemNameQuery))
                    .slice(0, 6)
                : [];
            const hasSupplierItems = Boolean(supplierId && existingSupplierItems.length > 0);
            const isNameMenuOpen = openNameMenuIndex === idx;
            const nameMenuEntries = hasSupplierItems
              ? isNameMenuOpen
                ? (itemNameQuery
                    ? existingSupplierItems
                        .filter((entry) => entry.nameKey.includes(itemNameQuery))
                        .slice(0, 40)
                    : existingSupplierItems.slice(0, 40))
                : itemNameSuggestions
              : [];
            const showNameMenu = nameMenuEntries.length > 0;
            const currentStockQty = (() => {
              const key = `${String(item.name || "").trim().toLowerCase()}|${String(item.unit || item.unit_meta || "pcs").trim().toLowerCase()}`;
              const found = Array.isArray(stock)
                ? stock.find(
                    (s) =>
                      `${String(s.name || "").trim().toLowerCase()}|${String(s.unit || "").trim().toLowerCase()}` ===
                      key
                  )
                : null;
              return Number(found?.quantity ?? 0);
            })();
            return (
              <div
                key={item.tempId || item.unique_id || item.id || item.name || `item-fallback-${idx}`}
                className="rounded-[30px] border border-slate-200 bg-slate-50/95 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800/45 md:p-6"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <span className="text-[1.65rem] font-semibold text-slate-800 dark:text-slate-100">
                    {t("Row")} #{idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="text-lg font-semibold text-rose-600 transition hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                  >
                    {t("Remove")}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Name")}</span>
                      <div className="relative">
                        <input
                          ref={(el) => {
                            nameRefs.current[idx] = el;
                          }}
                          className={`${fieldInputClass} pr-12`}
                          value={item.name || ""}
                          onChange={(e) => handleItemField(idx, "name", e.target.value)}
                        />
                        {hasSupplierItems && (
                          <button
                            type="button"
                            onClick={() =>
                              setOpenNameMenuIndex((prev) => (prev === idx ? null : idx))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
                            aria-label={t("Open existing items")}
                            title={t("Open existing items")}
                          >
                            <svg
                              className={`h-5 w-5 transition-transform ${isNameMenuOpen ? "rotate-180" : ""}`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.939a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                      {showNameMenu && (
                        <div className="mt-1 max-h-28 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                          {nameMenuEntries.map((match) => {
                            const matchKey = `${match.name}|${match.unit}`;
                            return (
                              <button
                                key={matchKey}
                                type="button"
                                onClick={() => {
                                  applySupplierItemToRow(idx, match);
                                  setOpenNameMenuIndex(null);
                                }}
                                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                <span className="truncate pr-2">{match.name}</span>
                                <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                                  {match.unit}
                                  {match.price_per_unit > 0
                                    ? ` · ${Number(match.price_per_unit).toFixed(2)}`
                                    : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Unit")}</span>
                      <select
                        className={fieldInputClass}
                        value={item.unit || item.unit_meta || "piece"}
                        onChange={(e) => handleItemField(idx, "unit", e.target.value)}
                      >
                        {["kg", "g", "lt", "ml", "pcs", "piece", "case"].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Qty")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          qtyInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.qty_units ?? ""}
                        onChange={(e) => handleItemField(idx, "qty_units", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Unit price")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          priceInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.unit_price_ex_vat ?? ""}
                        onChange={(e) => handleItemField(idx, "unit_price_ex_vat", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-5">
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Koli / Cases")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          qtyCasesInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.qty_cases ?? ""}
                        onChange={(e) => handleItemField(idx, "qty_cases", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Amt per koli/case")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          amountPerKoliInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.amount_per_koli ?? item.units_per_case ?? ""}
                        onChange={(e) => handleItemField(idx, "amount_per_koli", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Discount %")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          discountRateInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.discount_rate ?? ""}
                        onChange={(e) => handleItemField(idx, "discount_rate", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{discountCurrencyLabel}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={`${fieldInputClass} ${
                          discountAmtInvalid ? "border-rose-300 dark:border-rose-500" : ""
                        }`}
                        value={item.discount_amount ?? ""}
                        onChange={(e) => handleItemField(idx, "discount_amount", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("VAT %")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={fieldInputClass}
                        value={item.vat_rate ?? ""}
                        onChange={(e) => handleItemField(idx, "vat_rate", e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className={fieldLabelClass}>{t("Total")}</span>
                      <input
                        type="number"
                        step="0.01"
                        className={fieldInputClass}
                        value={item.line_total_inc_vat ?? ""}
                        onChange={(e) => handleItemField(idx, "line_total_inc_vat", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="inline-flex items-center gap-2.5 text-base font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(item.is_cleaning_supply)}
                        onChange={(e) => handleItemField(idx, "is_cleaning_supply", e.target.checked)}
                        className="h-6 w-6 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{t("Cleaning Product")}</span>
                    </label>
                    <label className="inline-flex items-center gap-2.5 text-base font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(item.total_locked)}
                        onChange={() => toggleLock(idx)}
                        className="h-6 w-6 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>🔒 {t("Lock total")}</span>
                    </label>
                  </div>

                  {Boolean(item.is_cleaning_supply) && (
                    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white/70 p-2.5 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="flex flex-col gap-2">
                        <span className={fieldLabelClass}>{t("Current Stock")}</span>
                        <div className={`${fieldInputClass} flex items-center font-semibold`}>
                          {Number.isFinite(currentStockQty) ? currentStockQty : "—"}
                        </div>
                      </div>
                      <label className="flex flex-col gap-2">
                        <span className={fieldLabelClass}>{t("Stock Left (Counted)")}</span>
                        <input
                          type="number"
                          step="0.01"
                          className={fieldInputClass}
                          value={item.counted_stock ?? ""}
                          onChange={(e) => handleItemField(idx, "counted_stock", e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addRow}
            className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            + {t("Add row")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptEditor;
