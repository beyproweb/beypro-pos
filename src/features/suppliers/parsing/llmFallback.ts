import { currencyFromLines, normalizeTextKey, roundMoney, splitOcrLines } from "./common";
import {
  SUPPLIER_INVOICE_SCHEMA_TEXT,
  normalizeSupplierInvoiceParsed,
  type SupplierInvoiceParsed,
} from "./types";

export type LlmFallbackRequest = {
  prompt: string;
  schema: string;
  masked_text: string;
};

export type LlmFallbackOptions = {
  ocrLines: string[];
  schemaText?: string;
  maskedText?: string;
  requestLlm: (payload: LlmFallbackRequest) => Promise<unknown>;
};

const IBAN_REGEX = /TR\d{2}(?:\s?\d{4}){5}\s?\d{2}/gi;
const PHONE_REGEX =
  /(?:\+?90|0)?\s*(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g;

const NON_PRODUCT_ITEM_TOKENS = [
  "iban",
  "banka",
  "vergi",
  "adres",
  "telefon",
  "tel",
  "kart no",
  "slip",
  "terminal",
  "ref no",
];

export const maskSensitiveInvoiceText = (text: string): string =>
  String(text || "")
    .replace(IBAN_REGEX, "TR**IBAN**")
    .replace(PHONE_REGEX, "***PHONE***");

const parseStrictJsonObject = (value: unknown): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    throw new Error("LLM response is not a JSON object.");
  }
  if (value.includes("```")) {
    throw new Error("LLM response is not strict JSON.");
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    throw new Error("LLM response is not strict JSON.");
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("LLM JSON root must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`LLM JSON parse failed: ${(error as Error)?.message || "invalid JSON"}`);
  }
};

const sanitizeLlmParsed = (raw: SupplierInvoiceParsed, lines: string[]): SupplierInvoiceParsed => {
  const keyText = normalizeTextKey(lines.join("\n"));
  const inferredCurrency = raw.currency || currencyFromLines(lines) || (keyText.includes("kdv") ? "TRY" : null);
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((item) => {
    const nameKey = normalizeTextKey(item?.name || "");
    if (!nameKey) return false;
    if (NON_PRODUCT_ITEM_TOKENS.some((token) => nameKey.includes(token))) return false;
    return true;
  }).map((item) => ({
    ...item,
    unit_price_ex_vat: roundMoney(Number(item?.unit_price_ex_vat)),
    line_total_inc_vat: roundMoney(Number(item?.line_total_inc_vat)),
    qty_units: roundMoney(Number(item?.qty_units)),
    qty_cases: roundMoney(Number(item?.qty_cases)),
    units_per_case: roundMoney(Number(item?.units_per_case)),
    vat_rate: roundMoney(Number(item?.vat_rate)),
  }));

  return {
    merchant: raw.merchant || null,
    date: raw.date || null,
    invoice_no: raw.invoice_no || null,
    currency: inferredCurrency,
    totals: {
      subtotal_ex_vat: roundMoney(Number(raw?.totals?.subtotal_ex_vat)),
      vat_total: roundMoney(Number(raw?.totals?.vat_total)),
      grand_total: roundMoney(Number(raw?.totals?.grand_total)),
    },
    items,
  };
};

const buildStrictJsonPrompt = (maskedText: string, schemaText: string): string => `You are parsing OCR text from a supplier invoice.
Return STRICT JSON ONLY. No markdown, no explanation, no code fences.
Schema:
${schemaText}

Rules:
1) Output must be valid JSON object exactly matching the schema shape.
2) Use JS numbers for all numeric fields.
3) If a field is unknown, set it to null.
4) Include only real product rows in items. Exclude bank lines, address lines, IBAN, terminal slips.
5) Prefer TRY when currency is unclear but Turkish invoice cues exist.
6) items[].name must be a real product name.

Masked OCR text:
${maskedText}`;

export const parseSupplierInvoiceWithLlm = async ({
  ocrLines,
  schemaText = SUPPLIER_INVOICE_SCHEMA_TEXT,
  maskedText,
  requestLlm,
}: LlmFallbackOptions): Promise<SupplierInvoiceParsed> => {
  const lines = splitOcrLines(ocrLines);
  const rawText = lines.join("\n");
  const masked = maskedText || maskSensitiveInvoiceText(rawText);
  const prompt = buildStrictJsonPrompt(masked, schemaText);
  const response = await requestLlm({
    prompt,
    schema: schemaText,
    masked_text: masked,
  });

  const payloadCandidate =
    (response as Record<string, unknown>)?.parsed ||
    (response as Record<string, unknown>)?.json ||
    (response as Record<string, unknown>)?.output ||
    (response as Record<string, unknown>)?.result ||
    response;

  const strictObject = parseStrictJsonObject(payloadCandidate);
  const normalized = normalizeSupplierInvoiceParsed(strictObject);
  return sanitizeLlmParsed(normalized, lines);
};
