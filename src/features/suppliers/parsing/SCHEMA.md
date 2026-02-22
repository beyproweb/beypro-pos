# Supplier Invoice Parsing Expectations

Source audited: `src/pages/Suppliers.jsx` (existing in-file parser and OCR import flow).

## Canonical Parsed Schema

```ts
type SupplierInvoiceParsed = {
  merchant: string | null;
  date: string | null;
  invoice_no: string | null;
  currency: "TRY" | "EUR" | "USD" | string | null;
  totals: {
    subtotal_ex_vat?: number | null;
    vat_total?: number | null;
    grand_total?: number | null;
  };
  items: Array<{
    name: string;
    qty_units?: number | null;
    qty_cases?: number | null;
    units_per_case?: number | null;
    unit_meta?: "piece" | "kg" | "case" | string | null;
    unit_price_ex_vat?: number | null;
    vat_rate?: number | null;
    line_total_inc_vat?: number | null;
  }>;
};
```

## Existing Behavior Observed

- Item recognition:
  - Quantity + unit tokens (kg, g, ml, lt, adet, koli/case).
  - Multiplication packs (`2x24`, `2*24`, `2×24`).
  - OCR receipt variants where total is marked by `*`.
  - A101 receipt-specific weighted patterns (`kg`/`lt` lines).
- Totals handling:
  - Reads `ara toplam`, `hesaplanan kdv`, `genel toplam` families.
  - Falls back to summed line totals when grand total is implausible.
  - Validation currently compares parsed line sums vs total in preview.
- Ignore/noise filters:
  - Bank and identity lines: IBAN, banka, şube, hesap, vergi, mersis, tel, adres.
  - Non-item order UI fragments and section headers.
  - Totals/header lines are excluded from item extraction.

## Stability Note

The hybrid parser modules under this folder are integrated incrementally and keep existing OCR import, manual editing, and normalization paths intact.
