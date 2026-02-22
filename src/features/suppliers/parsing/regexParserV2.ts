import {
  currencyFromLines,
  extractNumberTokens,
  normalizeSpaces,
  normalizeTextKey,
  parseLocaleNumber,
  roundMoney,
  splitOcrLines,
  toIsoDate,
} from "./common";
import { createEmptyParsedInvoice, type SupplierInvoiceFieldConfidence, type SupplierInvoiceParsed } from "./types";
import { computeValidationReport, totalTolerance } from "./validation";

export type RegexParserV2Result = {
  parsed: SupplierInvoiceParsed;
  confidence: number;
  fieldConfidence: SupplierInvoiceFieldConfidence;
  warnings: string[];
};

const STRONG_IGNORE_PATTERNS: RegExp[] = [
  /TR\d{2}(?:\s?\d{4}){5}\s?\d{2}/i,
  /\b(?:vkn|tckn)\b/i,
  /vergi\s+dairesi/i,
  /\bpos\b/i,
  /onay/i,
  /banka/i,
  /\beft\b/i,
  /havale/i,
  /terminal/i,
  /slip/i,
  /kart\s*no/i,
  /ref\s*no/i,
];

const COMPANY_SUFFIX_REGEX = /\b(?:A\.?\s*Ş\.?|LTD\.?\s*ŞT[İI]\.?|SAN\.?\s*T[İI]C\.?|PAZ\.?|GIDA|DAĞ\.?)\b/i;
const DATE_LABEL_REGEX = /\b(?:tarih|date)\b/i;
// Examples: "Fatura No: ABC-123", "E-Arşiv No EA-9912", "ETTN 123..."
const INVOICE_NO_REGEX =
  /\b(?:fatura\s*no|fis\s*no|fi[sş]\s*no|belge\s*no|e[-\s]?ar[sş]iv\s*no|ettn|s[ıi]ra\s*no)\b[^A-Za-z0-9]{0,6}([A-Za-z0-9-]{3,})/i;
const VAT_RATE_REGEX = /(?:%+\s*([0-9]{1,2}(?:[.,][0-9]+)?)|kdv[^0-9]{0,8}([0-9]{1,2}(?:[.,][0-9]+)?))/i;
// Examples: "10 ADET", "3 KG", "2 KOLI", "1 CUVA[L]"
const QTY_UNIT_REGEX =
  /(\d+(?:[.,]\d+)?)\s*(ADET|AD|PKT|KOL[İI]?|KOL|KASA|CASE|CUVAL|CVAL|KG|GR|G|LT|L)\b/i;
// Examples: 2x24, 2*24, 2×24
const CASE_MULTIPLY_REGEX = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i;

const TOT_SUBTOTAL_TOKENS = ["ara toplam", "mal hizmet toplam", "mal/hizmet toplam", "net"];
const TOT_VAT_TOKENS = ["hesaplanan kdv", "topkdv", "kdv toplam", "kdv"];
const TOT_GRAND_TOKENS = ["genel toplam", "toplam tutar", "odenecek", "vergiler dahil", "fatura toplam", "toplam"];

const PRODUCT_BLOCKLIST = [
  "iban",
  "vergi",
  "banka",
  "tarih",
  "date",
  "sube",
  "şube",
  "adres",
  "telefon",
  "tel",
  "fatura",
  "belge no",
  "fis no",
  "e arsiv no",
  "toplam",
  "kdv",
  "odeme",
  "ödeme",
  "ettn",
];

const isIgnoredLine = (line: string): boolean => {
  if (!line) return true;
  return STRONG_IGNORE_PATTERNS.some((pattern) => pattern.test(line));
};

const isTotalsLikeLine = (lineKey: string): boolean =>
  TOT_SUBTOTAL_TOKENS.some((token) => lineKey.includes(token)) ||
  TOT_VAT_TOKENS.some((token) => lineKey.includes(token)) ||
  TOT_GRAND_TOKENS.some((token) => lineKey.includes(token));

const getUppercaseRatio = (line: string): number => {
  const letters = [...line].filter((ch) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(ch));
  if (!letters.length) return 0;
  const upper = letters.filter((ch) => ch === ch.toUpperCase());
  return upper.length / letters.length;
};

const detectMerchant = (lines: string[]): { value: string | null; confidence: number } => {
  const candidates = lines.slice(0, 10)
    .map((line) => normalizeSpaces(line))
    .filter((line) => line && !isIgnoredLine(line))
    .map((line) => {
      const lineKey = normalizeTextKey(line);
      const upperRatio = getUppercaseRatio(line);
      const hasCompanySuffix = COMPANY_SUFFIX_REGEX.test(line);
      const numberCount = extractNumberTokens(line).length;
      let score = 0;
      if (upperRatio >= 0.6) score += 4;
      if (hasCompanySuffix) score += 5;
      if (numberCount > 2) score -= 2;
      if (isTotalsLikeLine(lineKey)) score -= 3;
      if (line.length < 5) score -= 2;
      return { line, hasCompanySuffix, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best || best.score < 3) return { value: null, confidence: 0 };
  return {
    value: best.line,
    confidence: best.hasCompanySuffix ? 0.95 : 0.8,
  };
};

const detectDate = (lines: string[]): { value: string | null; confidence: number } => {
  const regexes = [
    { regex: /\b(\d{2})[./](\d{2})[./](\d{4})\b/g, type: "dmy" as const },
    { regex: /\b(\d{4})-(\d{2})-(\d{2})\b/g, type: "ymd" as const },
    { regex: /\b(\d{2})-(\d{2})-(\d{4})\b/g, type: "dmy" as const },
    { regex: /\b(\d{2})\/(\d{2})\/(\d{4})\b/g, type: "dmy" as const },
  ];

  const ordered = [...lines].sort((a, b) => {
    const aHasLabel = DATE_LABEL_REGEX.test(a) ? 1 : 0;
    const bHasLabel = DATE_LABEL_REGEX.test(b) ? 1 : 0;
    return bHasLabel - aHasLabel;
  });

  for (const line of ordered) {
    for (const { regex, type } of regexes) {
      const found = [...line.matchAll(regex)];
      if (!found.length) continue;
      const match = found[0];
      let iso: string | null = null;
      if (type === "dmy") {
        iso = toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
      } else {
        iso = toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
      }
      if (!iso) continue;
      return {
        value: iso,
        confidence: DATE_LABEL_REGEX.test(line) ? 0.95 : 0.85,
      };
    }
  }
  return { value: null, confidence: 0 };
};

const detectInvoiceNo = (lines: string[]): { value: string | null; confidence: number } => {
  for (const line of lines) {
    const match = line.match(INVOICE_NO_REGEX);
    if (match?.[1]) {
      return {
        value: String(match[1]).trim(),
        confidence: 0.9,
      };
    }
  }
  for (const line of lines) {
    const fallback = line.match(/\b([A-Z0-9]{10,40})\b/);
    if (fallback?.[1] && /\bettn\b/i.test(line)) {
      return {
        value: fallback[1],
        confidence: 0.8,
      };
    }
  }
  return { value: null, confidence: 0 };
};

const detectTotals = (lines: string[]) => {
  const subtotalCandidates: number[] = [];
  const vatCandidates: number[] = [];
  const grandCandidates: number[] = [];

  for (const line of lines) {
    if (isIgnoredLine(line)) continue;
    const key = normalizeTextKey(line);
    if (!key) continue;
    const numbers = extractNumberTokens(line)
      .map((token) => token.value)
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!numbers.length) continue;
    const value = Math.max(...numbers);

    if (TOT_SUBTOTAL_TOKENS.some((token) => key.includes(token)) && !key.includes("kdv")) {
      subtotalCandidates.push(value);
    }
    if (TOT_VAT_TOKENS.some((token) => key.includes(token))) {
      vatCandidates.push(value);
    }
    if (
      TOT_GRAND_TOKENS.some((token) => key.includes(token)) &&
      !key.includes("ara toplam") &&
      !key.includes("mal hizmet toplam")
    ) {
      grandCandidates.push(value);
    }
  }

  return {
    subtotal_ex_vat: subtotalCandidates.length ? roundMoney(Math.max(...subtotalCandidates)) : null,
    vat_total: vatCandidates.length ? roundMoney(Math.max(...vatCandidates)) : null,
    grand_total: grandCandidates.length ? roundMoney(Math.max(...grandCandidates)) : null,
  };
};

const unitMetaFromToken = (token: string, isCase: boolean): "piece" | "kg" | "case" | string => {
  if (isCase) return "case";
  const key = normalizeTextKey(token);
  if (key.startsWith("kg") || key === "g" || key === "gr") return "kg";
  if (key === "lt" || key === "l") return "piece";
  if (["adet", "ad", "pkt"].includes(key)) return "piece";
  return key || "piece";
};

const parseItemLine = (line: string) => {
  const normalized = normalizeSpaces(line);
  const key = normalizeTextKey(normalized);
  if (!normalized || isIgnoredLine(normalized) || isTotalsLikeLine(key)) return null;
  if (DATE_LABEL_REGEX.test(normalized) || INVOICE_NO_REGEX.test(normalized)) return null;
  if (PRODUCT_BLOCKLIST.some((token) => key.includes(token))) return null;

  const numberTokens = extractNumberTokens(normalized);
  if (numberTokens.length < 2 && !CASE_MULTIPLY_REGEX.test(normalized)) return null;

  const vatMatch = normalized.match(VAT_RATE_REGEX);
  const vatRate = parseLocaleNumber(vatMatch?.[1] || vatMatch?.[2] || null);

  const caseMatch = normalized.match(CASE_MULTIPLY_REGEX);
  const qtyMatch = normalized.match(QTY_UNIT_REGEX);

  const qtyCases = caseMatch ? parseLocaleNumber(caseMatch[1]) : null;
  const unitsPerCase = caseMatch ? parseLocaleNumber(caseMatch[2]) : null;
  const qtyFromToken = qtyMatch ? parseLocaleNumber(qtyMatch[1]) : null;
  const unitToken = qtyMatch?.[2] || "";

  const monetary = numberTokens
    .map((token) => token.value)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!monetary.length) return null;

  const lineTotal = monetary[monetary.length - 1];
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return null;

  const isCase = Boolean(
    (Number.isFinite(qtyCases) && (qtyCases as number) > 0 && Number.isFinite(unitsPerCase) && (unitsPerCase as number) > 0) ||
    /kol|case|kasa|cuval|cval/.test(normalizeTextKey(unitToken))
  );

  let qtyUnits: number | null = null;
  if (isCase) {
    if (Number.isFinite(qtyCases) && Number.isFinite(unitsPerCase)) {
      qtyUnits = (qtyCases as number) * (unitsPerCase as number);
    } else if (Number.isFinite(qtyFromToken)) {
      qtyUnits = qtyFromToken as number;
    }
  } else if (Number.isFinite(qtyFromToken)) {
    qtyUnits = qtyFromToken as number;
  } else {
    qtyUnits = 1;
  }

  const cutAtCandidates: number[] = [];
  if (qtyMatch?.index !== undefined && qtyMatch.index >= 0) cutAtCandidates.push(qtyMatch.index);
  if (caseMatch?.index !== undefined && caseMatch.index >= 0) cutAtCandidates.push(caseMatch.index);
  if (numberTokens[0]?.index >= 0) cutAtCandidates.push(numberTokens[0].index);
  const cutAt = cutAtCandidates.length ? Math.min(...cutAtCandidates) : normalized.length;
  let name = normalizeSpaces(normalized.slice(0, cutAt));
  if (!name) {
    name = normalizeSpaces(normalized.replace(NUMBER_ONLY_TAIL_REGEX, ""));
  }
  name = name
    .replace(/^\s*\d{1,3}[.)-]?\s*/, "")
    .replace(/^[\-•*]+/, "")
    .trim();
  const letters = (name.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  if (letters < 3) return null;
  const nameKey = normalizeTextKey(name);
  if (PRODUCT_BLOCKLIST.some((token) => nameKey.includes(token))) return null;

  const unitPrice =
    Number.isFinite(qtyUnits) && (qtyUnits as number) > 0
      ? roundMoney(lineTotal / (qtyUnits as number))
      : null;

  return {
    name,
    qty_units: Number.isFinite(qtyUnits) ? roundMoney(qtyUnits) : null,
    qty_cases: isCase && Number.isFinite(qtyCases) ? roundMoney(qtyCases) : null,
    units_per_case: isCase && Number.isFinite(unitsPerCase) ? roundMoney(unitsPerCase) : null,
    unit_meta: unitMetaFromToken(unitToken, isCase),
    unit_price_ex_vat: unitPrice,
    vat_rate: Number.isFinite(vatRate) ? roundMoney(vatRate) : null,
    line_total_inc_vat: roundMoney(lineTotal),
  };
};

const dedupeItems = (items: SupplierInvoiceParsed["items"]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalizeTextKey(item.name)}|${Number(item.line_total_inc_vat || 0).toFixed(2)}|${Number(item.qty_units || item.qty_cases || 0).toFixed(3)}`;
    if (!normalizeTextKey(item.name) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const NUMBER_ONLY_TAIL_REGEX = /[\d\s.,%x×*₺TLtl-]+$/;

export const parseSupplierInvoiceRegexV2 = (ocrLines: string[] | string): RegexParserV2Result => {
  const lines = splitOcrLines(ocrLines);
  const parsed = createEmptyParsedInvoice();

  const merchant = detectMerchant(lines);
  const date = detectDate(lines);
  const invoiceNo = detectInvoiceNo(lines);
  const totals = detectTotals(lines);
  const currency = currencyFromLines(lines);

  const items = dedupeItems(
    lines
      .map((line) => parseItemLine(line))
      .filter(Boolean) as SupplierInvoiceParsed["items"]
  );

  parsed.merchant = merchant.value;
  parsed.date = date.value;
  parsed.invoice_no = invoiceNo.value;
  parsed.currency = currency;
  parsed.totals = totals;
  parsed.items = items;

  const validation = computeValidationReport(parsed);
  const hasVatFromItems = parsed.items.some((item) => Number.isFinite(Number(item?.vat_rate)));
  const itemsLineTotal = roundMoney(parsed.items.reduce((sum, item) => sum + (Number(item?.line_total_inc_vat) || 0), 0)) || 0;
  const grandTotal = Number(parsed?.totals?.grand_total);
  const itemGrandMatch =
    Number.isFinite(grandTotal) &&
    Math.abs(itemsLineTotal - grandTotal) <= totalTolerance(grandTotal);

  let confidence = 0;
  if (parsed.merchant) confidence += 0.15;
  if (parsed.date) confidence += 0.15;
  if (parsed.items.length >= 2) confidence += 0.15;
  if (Number.isFinite(parsed?.totals?.grand_total)) confidence += 0.2;
  if (itemGrandMatch) confidence += 0.2;
  if (Number.isFinite(parsed?.totals?.vat_total) || hasVatFromItems) confidence += 0.15;
  confidence = Math.min(1, Number(confidence.toFixed(4)));

  const fieldConfidence: SupplierInvoiceFieldConfidence = {
    merchant: merchant.confidence,
    date: date.confidence,
    invoice_no: invoiceNo.confidence,
    currency: parsed.currency ? (parsed.currency === "TRY" ? 0.85 : 0.9) : 0,
    items: parsed.items.length >= 2 ? 0.9 : parsed.items.length === 1 ? 0.55 : 0,
    totals: {
      subtotal_ex_vat: Number.isFinite(parsed?.totals?.subtotal_ex_vat) ? 0.85 : 0,
      vat_total: Number.isFinite(parsed?.totals?.vat_total) ? 0.9 : 0,
      grand_total: Number.isFinite(parsed?.totals?.grand_total) ? 0.95 : 0,
    },
  };

  const warnings = Array.from(
    new Set([
      ...validation.warnings,
      !parsed.merchant ? "Missing merchant." : "",
      !parsed.date ? "Missing invoice date." : "",
      !parsed.invoice_no ? "Missing invoice number." : "",
      parsed.items.length < 2 ? "Detected fewer than 2 items." : "",
      !Number.isFinite(parsed?.totals?.grand_total) ? "Missing grand total." : "",
      !itemGrandMatch && Number.isFinite(parsed?.totals?.grand_total)
        ? "Item sum does not match grand total within tolerance."
        : "",
    ].filter(Boolean))
  );

  return {
    parsed,
    confidence,
    fieldConfidence,
    warnings,
  };
};
