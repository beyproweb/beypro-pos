export type SupplierInvoiceCurrency = "TRY" | "EUR" | "USD" | string | null;

export type SupplierInvoiceParsedItem = {
  name: string;
  qty_units?: number | null;
  qty_cases?: number | null;
  units_per_case?: number | null;
  unit_meta?: "piece" | "kg" | "case" | string | null;
  unit_price_ex_vat?: number | null;
  vat_rate?: number | null;
  line_total_inc_vat?: number | null;
};

export type SupplierInvoiceParsedTotals = {
  subtotal_ex_vat?: number | null;
  vat_total?: number | null;
  grand_total?: number | null;
};

export type SupplierInvoiceParsed = {
  merchant: string | null;
  date: string | null;
  invoice_no: string | null;
  currency: SupplierInvoiceCurrency;
  totals: SupplierInvoiceParsedTotals;
  items: SupplierInvoiceParsedItem[];
};

export type SupplierInvoiceFieldConfidence = {
  merchant: number;
  date: number;
  invoice_no: number;
  currency: number;
  items: number;
  totals: {
    subtotal_ex_vat: number;
    vat_total: number;
    grand_total: number;
  };
};

export const createEmptyParsedInvoice = (): SupplierInvoiceParsed => ({
  merchant: null,
  date: null,
  invoice_no: null,
  currency: null,
  totals: {
    subtotal_ex_vat: null,
    vat_total: null,
    grand_total: null,
  },
  items: [],
});

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(num) ? Number(num) : null;
};

const normalizeItem = (value: unknown): SupplierInvoiceParsedItem | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const name = String(source.name || "").trim();
  if (!name) return null;

  const qtyUnits = toNullableNumber(source.qty_units);
  const qtyCases = toNullableNumber(source.qty_cases);
  const unitsPerCase = toNullableNumber(source.units_per_case);
  const unitPriceExVat = toNullableNumber(source.unit_price_ex_vat);
  const vatRate = toNullableNumber(source.vat_rate);
  const lineTotalIncVat = toNullableNumber(source.line_total_inc_vat);
  const unitMetaRaw = source.unit_meta === null || source.unit_meta === undefined
    ? null
    : String(source.unit_meta).trim();

  return {
    name,
    qty_units: qtyUnits,
    qty_cases: qtyCases,
    units_per_case: unitsPerCase,
    unit_meta: unitMetaRaw || null,
    unit_price_ex_vat: unitPriceExVat,
    vat_rate: vatRate,
    line_total_inc_vat: lineTotalIncVat,
  };
};

export const normalizeSupplierInvoiceParsed = (value: unknown): SupplierInvoiceParsed => {
  const fallback = createEmptyParsedInvoice();
  if (!value || typeof value !== "object") return fallback;
  const source = value as Record<string, unknown>;

  const totalsRaw = source.totals && typeof source.totals === "object"
    ? (source.totals as Record<string, unknown>)
    : {};
  const itemsRaw = Array.isArray(source.items) ? source.items : [];

  const normalizedItems = itemsRaw
    .map((item) => normalizeItem(item))
    .filter(Boolean) as SupplierInvoiceParsedItem[];

  const currencyRaw = source.currency === null || source.currency === undefined
    ? null
    : String(source.currency).trim().toUpperCase();

  return {
    merchant: source.merchant ? String(source.merchant).trim() : null,
    date: source.date ? String(source.date).trim() : null,
    invoice_no: source.invoice_no ? String(source.invoice_no).trim() : null,
    currency: currencyRaw || null,
    totals: {
      subtotal_ex_vat: toNullableNumber(totalsRaw.subtotal_ex_vat),
      vat_total: toNullableNumber(totalsRaw.vat_total),
      grand_total: toNullableNumber(totalsRaw.grand_total),
    },
    items: normalizedItems,
  };
};

export const SUPPLIER_INVOICE_SCHEMA_TEXT = `{
  "merchant": "string|null",
  "date": "YYYY-MM-DD|string|null",
  "invoice_no": "string|null",
  "currency": "TRY|EUR|USD|string|null",
  "totals": {
    "subtotal_ex_vat": "number|null",
    "vat_total": "number|null",
    "grand_total": "number|null"
  },
  "items": [
    {
      "name": "string",
      "qty_units": "number|null",
      "qty_cases": "number|null",
      "units_per_case": "number|null",
      "unit_meta": "piece|kg|case|string|null",
      "unit_price_ex_vat": "number|null",
      "vat_rate": "number|null",
      "line_total_inc_vat": "number|null"
    }
  ]
}`;
