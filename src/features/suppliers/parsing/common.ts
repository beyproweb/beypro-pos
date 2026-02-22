import {
  createEmptyParsedInvoice,
  normalizeSupplierInvoiceParsed,
  type SupplierInvoiceParsed,
} from "./types";

export const normalizeSpaces = (value: unknown): string =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeTextKey = (value: unknown): string =>
  String(value || "")
    .toLowerCase()
    .replace(/[ğĞ]/g, "g")
    .replace(/[şŞ]/g, "s")
    .replace(/[ıİ]/g, "i")
    .replace(/[çÇ]/g, "c")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const toIsoDate = (day: number, month: number, year: number): string | null => {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const normalizeNumberToken = (value: string): string => {
  let raw = String(value || "").trim();
  if (!raw) return "";
  raw = raw.replace(/[^0-9,.-]/g, "");
  if (!raw) return "";

  const negative = raw.startsWith("-");
  raw = raw.replace(/-/g, "");
  if (!raw) return "";

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      raw = `${raw.slice(0, lastComma).replace(/[.,]/g, "")}.${raw.slice(lastComma + 1).replace(/[.,]/g, "")}`;
    } else {
      raw = `${raw.slice(0, lastDot).replace(/[.,]/g, "")}.${raw.slice(lastDot + 1).replace(/[.,]/g, "")}`;
    }
  } else if (hasComma) {
    const parts = raw.split(",");
    if (parts.length > 2) {
      const decimal = parts.pop() || "";
      raw = `${parts.join("")}.${decimal}`;
    } else {
      const decimals = parts[1]?.length ?? 0;
      raw = decimals === 3 ? parts.join("") : `${parts[0]}.${parts[1] || ""}`;
    }
  } else if (hasDot) {
    const parts = raw.split(".");
    if (parts.length > 2) {
      const decimal = parts.pop() || "";
      raw = `${parts.join("")}.${decimal}`;
    } else if ((parts[1]?.length ?? 0) === 3) {
      raw = parts.join("");
    }
  }

  return negative ? `-${raw}` : raw;
};

export const parseLocaleNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = normalizeNumberToken(String(value || ""));
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const NUMBER_TOKEN_REGEX = /-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g;

export const extractNumberTokens = (value: unknown): Array<{ raw: string; value: number; index: number }> => {
  const line = String(value || "");
  const matches: Array<{ raw: string; value: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = NUMBER_TOKEN_REGEX.exec(line)) !== null) {
    const parsed = parseLocaleNumber(m[0]);
    if (!Number.isFinite(parsed)) continue;
    matches.push({
      raw: m[0],
      value: parsed as number,
      index: m.index ?? -1,
    });
  }
  return matches;
};

export const splitOcrLines = (raw: string | string[] | null | undefined): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((line) => normalizeSpaces(line)).filter(Boolean);
  }
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
};

export const toParsedInvoice = (value: unknown): SupplierInvoiceParsed => {
  const normalized = normalizeSupplierInvoiceParsed(value);
  return normalized || createEmptyParsedInvoice();
};

export const roundMoney = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) return null;
  return Number((value as number).toFixed(2));
};

export const currencyFromLines = (lines: string[]): string | null => {
  const text = lines.join("\n");
  if (/[₺]|(?:^|\s)tl(?:\s|$)|\btry\b/i.test(text)) return "TRY";
  if (/[€]|\beur\b/i.test(text)) return "EUR";
  if (/[$]|\busd\b/i.test(text)) return "USD";
  const key = normalizeTextKey(text);
  if (
    key.includes("fatura") ||
    key.includes("e arsiv") ||
    key.includes("vergi") ||
    key.includes("kdv") ||
    key.includes("vkn")
  ) {
    return "TRY";
  }
  return null;
};
