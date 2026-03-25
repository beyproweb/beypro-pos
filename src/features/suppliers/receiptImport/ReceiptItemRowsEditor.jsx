import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStock } from "../../../context/StockContext";

const toNum = (val) => {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
};

const normalizeLower = (value) => String(value || "").trim().toLowerCase();
const fieldLabelClass =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const fieldInputClass =
  "w-full min-w-0 min-h-[42px] h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30";
const compactFieldInputClass = `${fieldInputClass} !h-9 !min-h-9`;

const createTempId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

export const createEmptyReceiptItem = () => ({
  name: "",
  qty_units: "",
  unit: "pcs",
  unit_price_ex_vat: "",
  line_total_inc_vat: "",
  total_locked: false,
  is_cleaning_supply: false,
  counted_stock: "",
  tempId: createTempId(),
});

const ReceiptItemRowsEditor = ({
  t,
  items = [],
  onChangeItems,
  supplierId,
  supplierIngredients = [],
  currencyCode = "TRY",
  title,
  description,
  emptyMessage,
  addRowLabel,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  wrapInCard = true,
  compactLayout = false,
  showFooterTotal = false,
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const [bulkNames, setBulkNames] = useState("");
  const [openNameMenuIndex, setOpenNameMenuIndex] = useState(null);
  const nameRefs = useRef([]);
  const prevLength = useRef(safeItems.length);
  const safeOnChangeItems = onChangeItems || (() => {});
  const { stock } = useStock();
  const normalizedCurrencyCode = String(currencyCode || "TRY").trim().toUpperCase();
  const discountCurrencyLabel = `${t("Discount")}(${normalizedCurrencyCode === "TRY" ? "TL" : normalizedCurrencyCode || "TL"})`;
  const currencyLabel = normalizedCurrencyCode === "TRY" ? "TL" : normalizedCurrencyCode || "TL";
  const rowsGrandTotal = useMemo(
    () =>
      safeItems.reduce((sum, item) => {
        const explicitTotal = item?.line_total_inc_vat;
        const hasExplicitTotal = explicitTotal !== "" && explicitTotal !== null && explicitTotal !== undefined;
        const lineTotal = hasExplicitTotal
          ? toNum(explicitTotal)
          : toNum(item?.qty_units) * toNum(item?.unit_price_ex_vat);

        return sum + lineTotal;
      }, 0),
    [safeItems]
  );
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
  const existingSupplierStockItems = useMemo(() => {
    if (!supplierId || !Array.isArray(stock) || stock.length === 0) return [];

    const byNameAndUnit = new Map();
    stock.forEach((row) => {
      const rowSupplierId = Number(row?.supplier_id ?? row?.supplierId ?? 0);
      if (rowSupplierId !== Number(supplierId)) return;

      const name = String(row?.name ?? row?.ingredient ?? row?.product_name ?? "").trim();
      const unit = String(row?.unit || "").trim() || "pcs";
      if (!name) return;

      const key = `${normalizeLower(name)}|||${normalizeLower(unit)}`;
      const quantity = toNum(row?.quantity ?? row?.stock ?? row?.on_hand ?? 0);
      const pricePerUnit = toNum(
        row?.price_per_unit ??
          row?.unit_price ??
          row?.purchase_price ??
          row?.cost_per_unit ??
          row?.costPrice ??
          row?.price ??
          0
      );

      const prev = byNameAndUnit.get(key);
      if (!prev || quantity > prev.quantity || pricePerUnit > prev.price_per_unit) {
        byNameAndUnit.set(key, {
          name,
          unit,
          quantity,
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
  }, [stock, supplierId]);

  useEffect(() => {
    const needs = safeItems.some((it) => !it?.tempId && !it?.id && !it?.unique_id);
    if (needs) {
      safeOnChangeItems(
        safeItems.map((it) =>
          it?.tempId || it?.id || it?.unique_id
            ? it
            : {
                ...it,
                tempId: createTempId(),
              }
        )
      );
    }
  }, [safeItems, safeOnChangeItems]);

  useEffect(() => {
    if (safeItems.length > prevLength.current) {
      const el = nameRefs.current[safeItems.length - 1];
      if (el && typeof el.focus === "function") {
        requestAnimationFrame(() => {
          el.focus();
          el.select?.();
        });
      }
    }
    prevLength.current = safeItems.length;
  }, [safeItems.length]);

  useEffect(() => {
    if (!supplierId || existingSupplierItems.length === 0) {
      setOpenNameMenuIndex(null);
    }
  }, [supplierId, existingSupplierItems.length]);

  const applyStockItemToRow = (idx, match) => {
    if (!match) return;
    const current = safeItems[idx] || {};
    const locked = Boolean(current.total_locked);
    const qtyUnits = toNum(current.qty_units);
    const matchPrice = toNum(match.price_per_unit);
    const next = {
      ...current,
      name: match.name,
      unit: match.unit || current.unit || "pcs",
    };

    if (matchPrice > 0) {
      next.unit_price_ex_vat = Number(matchPrice.toFixed(4));
      if (!locked && qtyUnits > 0) {
        next.line_total_inc_vat = Number((qtyUnits * matchPrice).toFixed(2));
      }
    }

    updateItem(idx, next);
  };

  const updateItem = (idx, next) => {
    safeOnChangeItems(safeItems.map((item, i) => (i === idx ? next : item)));
  };

  const addRow = () => {
    safeOnChangeItems([...safeItems, createEmptyReceiptItem()]);
  };

  const removeRow = (idx) => {
    safeOnChangeItems(safeItems.filter((_, i) => i !== idx));
  };

  const applyBulkNames = () => {
    if (!bulkNames.trim()) return;
    const names = bulkNames
      .split(/\r?\n/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!names.length) return;
    safeOnChangeItems(
      safeItems.map((item, idx) => ({
        ...item,
        name: names[idx] ? names[idx] : item.name,
      }))
    );
  };

  const applySupplierItemToRow = (idx, match, rawValue) => {
    if (!match) return;
    const current = safeItems[idx] || {};
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
    const current = safeItems[idx] || {};
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
    const current = safeItems[idx] || {};
    updateItem(idx, { ...current, total_locked: !current.total_locked });
  };

  const compactToggleClass =
    "inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";
  const rowPanelClass =
    "rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-950/20";
  const rowPanelTitleClass =
    "mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400";
  const isManualEntryLayout = !compactLayout;

  const content = (
    <>
      {(title || description) && (
        <div className="space-y-0.5">
          {title ? <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h4> : null}
          {description ? <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
      )}

      <div className={title || description ? "mt-4" : ""}>
        <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
          <span>{t("Items")}</span>
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
            {safeItems.length} {t("rows")}
          </span>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/35 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="min-w-0">
            <span className={fieldLabelClass}>{t("Bulk set item names (one per line)")}</span>
            <textarea
              className="min-h-[88px] rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-xs text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-500/30"
              value={bulkNames}
              onChange={(e) => setBulkNames(e.target.value)}
              placeholder={t("Example:\nItem A\nItem B\nItem C")}
            />
          </label>
          <div className="flex flex-wrap gap-2 text-xs lg:justify-end">
            <button
              type="button"
              onClick={applyBulkNames}
              className="inline-flex min-h-[40px] items-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 font-semibold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-500/60 dark:bg-indigo-900/30 dark:text-indigo-100"
            >
              {t("Apply names to rows")}
            </button>
            <button
              type="button"
              onClick={() => setBulkNames("")}
              className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("Clear")}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {safeItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              {emptyMessage || t("No items yet. Add one to start corrections.")}
            </div>
          )}
          {safeItems.map((item, idx) => {
            const qtyInvalid = toNum(item.qty_units ?? 0) < 0;
            const priceInvalid = toNum(item.unit_price_ex_vat ?? 0) < 0;
            const discountRateInvalid = toNum(item.discount_rate ?? 0) < 0;
            const discountAmtInvalid = toNum(item.discount_amount ?? 0) < 0;
            const amountPerKoliInvalid = toNum(item.amount_per_koli ?? item.units_per_case ?? 0) < 0;
            const qtyCasesInvalid = toNum(item.qty_cases ?? 0) < 0;
            const rowQty = toNum(item.qty_units ?? 0);
            const rowUnitPrice = toNum(item.unit_price_ex_vat ?? 0);
            const rowTotal = toNum(item.line_total_inc_vat ?? 0);
            const rowUnitLabel = String(item.unit || item.unit_meta || "pcs").trim() || "pcs";
            const itemNameQuery = normalizeLower(item.name);
            const itemNameSuggestions =
              supplierId && itemNameQuery.length >= 2
                ? existingSupplierItems
                    .filter((entry) => entry.nameKey.includes(itemNameQuery))
                    .slice(0, 6)
                : [];
            const hasSupplierItems = Boolean(supplierId && existingSupplierItems.length > 0);
            const hasSupplierStockItems = Boolean(supplierId && existingSupplierStockItems.length > 0);
            const selectedStockItem = hasSupplierStockItems
              ? existingSupplierStockItems.find(
                  (entry) =>
                    entry.nameKey === normalizeLower(item.name) &&
                    entry.unitKey === normalizeLower(item.unit || item.unit_meta || "pcs")
                )
              : null;
            const selectedStockValue = selectedStockItem
              ? `${selectedStockItem.name}|||${selectedStockItem.unit}`
              : "";
            const isNameMenuOpen = openNameMenuIndex === idx;
            const nameMenuEntries = hasSupplierItems
              ? isNameMenuOpen
                ? itemNameQuery
                  ? existingSupplierItems
                      .filter((entry) => entry.nameKey.includes(itemNameQuery))
                      .slice(0, 40)
                  : existingSupplierItems.slice(0, 40)
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
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white/95 text-sm shadow-sm shadow-slate-200/60 transition dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none"
              >
                <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50/60 px-4 py-3 dark:border-slate-800 dark:from-slate-950/70 dark:via-slate-900/60 dark:to-slate-950/40">
                  <div
                    className={`flex flex-col gap-3 ${
                      compactLayout ? "" : "xl:flex-row xl:items-center xl:justify-between"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {t("Row")}
                      </span>
                      <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        #{idx + 1}
                      </span>
                      {Boolean(item.total_locked) && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                          {t("Total locked")}
                        </span>
                      )}
                      {Boolean(item.is_cleaning_supply) && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                          {t("Cleaning supply")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
                      <label className={compactToggleClass}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.is_cleaning_supply)}
                          onChange={(e) => handleItemField(idx, "is_cleaning_supply", e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{t("Cleaning")}</span>
                      </label>
                      <label className={compactToggleClass}>
                        <input
                          type="checkbox"
                          checked={Boolean(item.total_locked)}
                          onChange={() => toggleLock(idx)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{t("Lock total")}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="inline-flex min-h-[40px] items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        {t("Remove")}
                      </button>

                      <div
                        className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${
                          compactLayout ? "" : "xl:min-w-[360px]"
                        }`}
                      >
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                          {t("Qty")}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {rowQty > 0 ? Number(rowQty.toFixed(2)) : "—"}
                          <span className="ml-1 text-xs font-medium text-slate-400 dark:text-slate-500">{rowUnitLabel}</span>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                          {t("Unit price")}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {rowUnitPrice > 0 ? Number(rowUnitPrice.toFixed(2)) : "—"}
                        </div>
                      </div>
                      <div className="col-span-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 sm:col-span-1 dark:border-slate-700 dark:bg-slate-900/80">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                          {t("Total")}
                        </div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {rowTotal > 0 ? Number(rowTotal.toFixed(2)) : "—"}
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>

                </div>

                <div className="space-y-4 p-4 md:p-5">
                  <div className={compactLayout ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 xl:grid-cols-12"}>
                    <div className={`${rowPanelClass} ${compactLayout ? "" : "xl:col-span-4"}`}>
                      <div className={rowPanelTitleClass}>{t("Item details")}</div>
                      <div
                        className={
                          compactLayout
                            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                            : "grid grid-cols-1 gap-3 md:grid-cols-6 xl:grid-cols-5"
                        }
                      >
                        {hasSupplierStockItems && (
                          <label className={`block ${compactLayout ? "sm:col-span-2" : "md:col-span-3 xl:col-span-5"}`}>
                            <span className={fieldLabelClass}>{t("Existing supplier stock item")}</span>
                            <select
                              className={compactFieldInputClass}
                              value={selectedStockValue}
                              onChange={(e) => {
                                const picked = existingSupplierStockItems.find(
                                  (entry) => `${entry.name}|||${entry.unit}` === e.target.value
                                );
                                applyStockItemToRow(idx, picked || null);
                              }}
                            >
                              <option value="">{t("Select from stock")}</option>
                              {existingSupplierStockItems.map((entry) => (
                                <option key={`${entry.name}|||${entry.unit}`} value={`${entry.name}|||${entry.unit}`}>
                                  {entry.name} · {entry.unit}
                                  {entry.quantity > 0 ? ` · ${t("Stock")}: ${Number(entry.quantity.toFixed(2))}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}

                        <label
                          className={`block ${
                            compactLayout
                              ? "sm:col-span-2"
                              : hasSupplierStockItems
                                ? "md:col-span-4 xl:col-span-4"
                                : "md:col-span-5 xl:col-span-4"
                          }`}
                        >
                          <span className={fieldLabelClass}>{t("Name")}</span>
                          <div className="relative">
                            <input
                              ref={(el) => {
                                nameRefs.current[idx] = el;
                              }}
                              className={`${compactFieldInputClass} pr-12`}
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

                        <label className={`block ${compactLayout ? "sm:max-w-[180px]" : "md:col-span-2 xl:col-span-1"}`}>
                          <span className={fieldLabelClass}>{t("Unit")}</span>
                          <select
                            className={compactFieldInputClass}
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
                    </div>

                    <div className={`${rowPanelClass} ${compactLayout ? "" : "xl:col-span-3"}`}>
                      <div className={rowPanelTitleClass}>{t("Quantity & packaging")}</div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className={fieldLabelClass}>{t("Qty")}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={`${compactFieldInputClass} ${qtyInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                            value={item.qty_units ?? ""}
                            onChange={(e) => handleItemField(idx, "qty_units", e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className={fieldLabelClass}>{t("Koli / Cases")}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={`${compactFieldInputClass} ${qtyCasesInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                            value={item.qty_cases ?? ""}
                            onChange={(e) => handleItemField(idx, "qty_cases", e.target.value)}
                          />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className={fieldLabelClass}>{t("Amt per koli/case")}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={`${compactFieldInputClass} ${amountPerKoliInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                            value={item.amount_per_koli ?? item.units_per_case ?? ""}
                            onChange={(e) => handleItemField(idx, "amount_per_koli", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>

                    {isManualEntryLayout ? (
                      <div className={`${rowPanelClass} xl:col-span-3`}>
                        <div className={rowPanelTitleClass}>{t("Discount & tax")}</div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className={fieldLabelClass}>{t("Discount %")}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={`${compactFieldInputClass} ${discountRateInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                              value={item.discount_rate ?? ""}
                              onChange={(e) => handleItemField(idx, "discount_rate", e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className={fieldLabelClass}>{discountCurrencyLabel}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={`${compactFieldInputClass} ${discountAmtInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                              value={item.discount_amount ?? ""}
                              onChange={(e) => handleItemField(idx, "discount_amount", e.target.value)}
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className={fieldLabelClass}>{t("VAT %")}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={compactFieldInputClass}
                              value={item.vat_rate ?? ""}
                              onChange={(e) => handleItemField(idx, "vat_rate", e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}

                    <div className={`${rowPanelClass} ${compactLayout ? "" : "xl:col-span-2"}`}>
                      <div className={rowPanelTitleClass}>{t("Totals")}</div>
                      <div className="grid grid-cols-1 gap-3">
                        <label className="block">
                          <span className={fieldLabelClass}>{t("Unit price")}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={`${compactFieldInputClass} ${priceInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                            value={item.unit_price_ex_vat ?? ""}
                            onChange={(e) => handleItemField(idx, "unit_price_ex_vat", e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className={fieldLabelClass}>{t("Total")}</span>
                          <input
                            type="number"
                            step="0.01"
                            className={compactFieldInputClass}
                            value={item.line_total_inc_vat ?? ""}
                            onChange={(e) => handleItemField(idx, "line_total_inc_vat", e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {compactLayout && (
                    <div className="grid grid-cols-1 gap-4">
                      <div className={rowPanelClass}>
                        <div className={rowPanelTitleClass}>{t("Discount & tax")}</div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className={fieldLabelClass}>{t("Discount %")}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={`${compactFieldInputClass} ${discountRateInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                              value={item.discount_rate ?? ""}
                              onChange={(e) => handleItemField(idx, "discount_rate", e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className={fieldLabelClass}>{discountCurrencyLabel}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={`${compactFieldInputClass} ${discountAmtInvalid ? "border-rose-300 dark:border-rose-500" : ""}`}
                              value={item.discount_amount ?? ""}
                              onChange={(e) => handleItemField(idx, "discount_amount", e.target.value)}
                            />
                          </label>
                          <label className="block">
                            <span className={fieldLabelClass}>{t("VAT %")}</span>
                            <input
                              type="number"
                              step="0.01"
                              className={compactFieldInputClass}
                              value={item.vat_rate ?? ""}
                              onChange={(e) => handleItemField(idx, "vat_rate", e.target.value)}
                            />
                          </label>
                          <div className="flex min-h-[72px] flex-col justify-end rounded-xl border border-dashed border-slate-300 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                              {t("Quick calc")}
                            </span>
                            <span className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {rowQty > 0 && rowUnitPrice >= 0 ? Number((rowQty * rowUnitPrice).toFixed(2)) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {Boolean(item.is_cleaning_supply) && (
                        <div className={rowPanelClass}>
                          <div className={rowPanelTitleClass}>{t("Cleaning stock")}</div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0">
                              <span className={fieldLabelClass}>{t("Current Stock")}</span>
                              <div className={`${fieldInputClass} flex items-center font-semibold`}>
                                {Number.isFinite(currentStockQty) ? currentStockQty : "—"}
                              </div>
                            </div>
                            <label className="block">
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
                        </div>
                      )}
                    </div>
                  )}

                  {isManualEntryLayout && Boolean(item.is_cleaning_supply) && (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                      <div className={`${rowPanelClass} xl:col-span-4 xl:col-start-9`}>
                        <div className={rowPanelTitleClass}>{t("Cleaning stock")}</div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                          <div className="min-w-0">
                            <span className={fieldLabelClass}>{t("Current Stock")}</span>
                            <div className={`${fieldInputClass} flex items-center font-semibold`}>
                              {Number.isFinite(currentStockQty) ? currentStockQty : "—"}
                            </div>
                          </div>
                          <label className="block">
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
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {showFooterTotal && (
              <div className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("Total")}
                </span>
                <span>{Number(rowsGrandTotal.toFixed(2))}</span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{currencyLabel}</span>
              </div>
            )}
            {typeof onConfirm === "function" && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✅ {confirmLabel || t("Confirm")}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            + {addRowLabel || t("Add row")}
          </button>
        </div>
      </div>
    </>
  );

  if (!wrapInCard) return content;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 md:p-5">
      {content}
    </div>
  );
};

export default ReceiptItemRowsEditor;
