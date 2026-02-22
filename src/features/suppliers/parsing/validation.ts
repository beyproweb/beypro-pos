import { roundMoney, toParsedInvoice } from "./common";
import type { SupplierInvoiceParsed } from "./types";

export type SupplierInvoiceValidation = {
  parsed_line_total: number;
  grand_total: number | null;
  grand_total_diff: number | null;
  grand_total_match: boolean | null;
  vat_from_items: number | null;
  vat_total: number | null;
  vat_total_diff: number | null;
  vat_total_match: boolean | null;
  currency: string | null;
  merchant_detected: boolean;
  date_detected: boolean;
  invoice_no_detected: boolean;
  warnings: string[];
};

export const totalTolerance = (grandTotal: number): number =>
  Math.max(1, Math.abs(grandTotal) * 0.005);

export const vatTolerance = (vatTotal: number): number =>
  Math.max(1, Math.abs(vatTotal) * 0.01);

const sumItemTotals = (parsed: SupplierInvoiceParsed): number =>
  parsed.items.reduce((sum, item) => {
    const lineTotal = Number(item?.line_total_inc_vat);
    return Number.isFinite(lineTotal) ? sum + lineTotal : sum;
  }, 0);

const sumItemVat = (parsed: SupplierInvoiceParsed): number | null => {
  let hasVat = false;
  const vatSum = parsed.items.reduce((sum, item) => {
    const rate = Number(item?.vat_rate);
    const lineTotal = Number(item?.line_total_inc_vat);
    if (!Number.isFinite(rate) || !Number.isFinite(lineTotal) || rate < 0 || lineTotal <= 0) {
      return sum;
    }
    hasVat = true;
    // invoice lines are VAT-included; VAT component = gross * rate / (100 + rate)
    return sum + (lineTotal * rate) / (100 + rate);
  }, 0);
  return hasVat ? vatSum : null;
};

export const computeValidationReport = (value: unknown): SupplierInvoiceValidation => {
  const parsed = toParsedInvoice(value);
  const warnings: string[] = [];

  const parsedLineTotalRaw = sumItemTotals(parsed);
  const parsedLineTotal = roundMoney(parsedLineTotalRaw) || 0;
  const grandTotal = roundMoney(parsed?.totals?.grand_total);
  const vatTotal = roundMoney(parsed?.totals?.vat_total);
  const vatFromItems = roundMoney(sumItemVat(parsed));

  let grandDiff: number | null = null;
  let grandMatch: boolean | null = null;
  if (Number.isFinite(grandTotal)) {
    grandDiff = roundMoney(Math.abs(parsedLineTotal - (grandTotal as number)));
    grandMatch = (grandDiff || 0) <= totalTolerance(grandTotal as number);
    if (!grandMatch) warnings.push("Item totals do not match grand total.");
  } else {
    warnings.push("Grand total is missing.");
  }

  let vatDiff: number | null = null;
  let vatMatch: boolean | null = null;
  if (Number.isFinite(vatTotal) && Number.isFinite(vatFromItems)) {
    vatDiff = roundMoney(Math.abs((vatTotal as number) - (vatFromItems as number)));
    vatMatch = (vatDiff || 0) <= vatTolerance(vatTotal as number);
    if (!vatMatch) warnings.push("VAT total does not match item VAT sum.");
  } else if (!Number.isFinite(vatTotal) && !Number.isFinite(vatFromItems)) {
    warnings.push("VAT totals are missing.");
  }

  if (!parsed.merchant) warnings.push("Merchant could not be detected.");
  if (!parsed.date) warnings.push("Invoice date could not be detected.");
  if (!parsed.invoice_no) warnings.push("Invoice number could not be detected.");
  if (!parsed.currency) warnings.push("Currency could not be detected.");
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) warnings.push("No invoice items detected.");

  return {
    parsed_line_total: parsedLineTotal,
    grand_total: grandTotal,
    grand_total_diff: grandDiff,
    grand_total_match: grandMatch,
    vat_from_items: vatFromItems,
    vat_total: vatTotal,
    vat_total_diff: vatDiff,
    vat_total_match: vatMatch,
    currency: parsed.currency || null,
    merchant_detected: Boolean(parsed.merchant),
    date_detected: Boolean(parsed.date),
    invoice_no_detected: Boolean(parsed.invoice_no),
    warnings,
  };
};
