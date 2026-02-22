import React, { useState, useEffect, useRef, useMemo } from "react";
import { useStock } from "../context/StockContext";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toast } from "react-toastify"; // make sure you imported toast
import 'react-toastify/dist/ReactToastify.css';
import io from "socket.io-client";
import SupplierCartModal from "../modals/SupplierCartModal";
import SupplierScheduledCart from "../components/SupplierScheduledCart";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  SUPPLIERS_API,
  SUPPLIER_CARTS_API,
  SUPPLIER_CART_ITEMS_API,
  TRANSACTIONS_API,
} from "../utils/api";
import socket from "../utils/socket";
import secureFetch from "../utils/secureFetch";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import { useHeader } from "../context/HeaderContext";
import SupplierOverview from "../components/SupplierOverview";
import { useCurrency } from "../context/CurrencyContext";
import { hybridParseSupplierInvoice } from "../features/suppliers/parsing/hybridParse";
import ReceiptPreview from "../features/suppliers/receiptImport/ReceiptPreview";
import OcrTextEditor from "../features/suppliers/receiptImport/OcrTextEditor";
import JsonPreview from "../features/suppliers/receiptImport/JsonPreview";
import ReceiptEditor from "../features/suppliers/receiptImport/ReceiptEditor";
import ValidationSummary from "../features/suppliers/receiptImport/ValidationSummary";

const SUPPLIER_UNIT_MAP = {
  kg: "kg",
  kilogram: "kg",
  kilo: "kg",
  g: "g",
  gr: "g",
  gram: "g",
  lt: "lt",
  l: "lt",
  liter: "lt",
  litre: "lt",
  ml: "ml",
  milliliter: "ml",
  millilitre: "ml",
  pcs: "pcs",
  pc: "pcs",
  adet: "pcs",
  piece: "pcs",
  unit: "pcs",
  paket: "pcs",
  pkt: "pcs",
  set: "pcs",
};

const normalizeSpaces = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[|]/g, " ")
    .trim();

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[idx]}`;
};

const cloneReceipt = (value) => JSON.parse(JSON.stringify(value || {}));

const OCR_DIGIT_SWAPS = {
  O: "0",
  o: "0",
  I: "1",
  l: "1",
  S: "5",
  s: "5",
};

const applyOcrDigitSwaps = (value) =>
  String(value || "").replace(/[OIlsS]/g, (ch) => OCR_DIGIT_SWAPS[ch] || ch);

const isHeicLikeFile = async (file) => {
  try {
    const name = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();
    if (name.endsWith(".heic") || name.endsWith(".heif")) return true;
    if (type.includes("heic") || type.includes("heif")) return true;

    // iOS sometimes stores HEIC/HEIF with a misleading extension/type.
    // Detect by `ftyp` signature and common HEIF brands.
    const buf = await file.slice(0, 32).arrayBuffer();
    const header = new TextDecoder("ascii").decode(buf);
    const hasFtyp = header.includes("ftyp");
    const hasHeifBrand =
      header.includes("heic") ||
      header.includes("heif") ||
      header.includes("hevc") ||
      header.includes("mif1");
    return hasFtyp && hasHeifBrand;
  } catch {
    return false;
  }
};

const normalizeTextKey = (value) => {
  if (!value) return "";
  return String(value)
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
};

const normalizeFieldAliasKey = (value) =>
  normalizeTextKey(value).replace(/\s+/g, "");

const pickObjectFieldByAlias = (source, aliases = []) => {
  if (!source || typeof source !== "object") return undefined;
  const entries = Object.entries(source);
  if (!entries.length) return undefined;

  const byAlias = new Map();
  entries.forEach(([rawKey, value]) => {
    const aliasKey = normalizeFieldAliasKey(rawKey);
    if (!aliasKey || byAlias.has(aliasKey)) return;
    byAlias.set(aliasKey, value);
  });

  for (const alias of aliases) {
    const key = normalizeFieldAliasKey(alias);
    if (!key) continue;
    if (byAlias.has(key)) return byAlias.get(key);
  }
  return undefined;
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOcrBox = (boxValue, sourceWidth = null, sourceHeight = null) => {
  if (!boxValue) return null;

  const normalizeFromPoints = (points) => {
    const pairs = (Array.isArray(points) ? points : [])
      .map((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          const px = toFiniteNumber(point[0]);
          const py = toFiniteNumber(point[1]);
          if (px !== null && py !== null) return { x: px, y: py };
        }
        if (point && typeof point === "object") {
          const px = toFiniteNumber(point.x ?? point.left ?? point[0]);
          const py = toFiniteNumber(point.y ?? point.top ?? point[1]);
          if (px !== null && py !== null) return { x: px, y: py };
        }
        return null;
      })
      .filter(Boolean);
    if (!pairs.length) return null;
    const minX = Math.min(...pairs.map((point) => point.x));
    const minY = Math.min(...pairs.map((point) => point.y));
    const maxX = Math.max(...pairs.map((point) => point.x));
    const maxY = Math.max(...pairs.map((point) => point.y));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  let box = null;

  if (Array.isArray(boxValue)) {
    if (boxValue.length === 4 && boxValue.every((entry) => toFiniteNumber(entry) !== null)) {
      const a = toFiniteNumber(boxValue[0]);
      const b = toFiniteNumber(boxValue[1]);
      const c = toFiniteNumber(boxValue[2]);
      const d = toFiniteNumber(boxValue[3]);
      if (c >= a && d >= b) {
        box = { x: a, y: b, width: c - a, height: d - b };
      } else {
        box = { x: a, y: b, width: Math.max(0, c), height: Math.max(0, d) };
      }
    } else {
      box = normalizeFromPoints(boxValue);
    }
  } else if (typeof boxValue === "object") {
    const x = toFiniteNumber(boxValue.x ?? boxValue.left ?? boxValue.minX);
    const y = toFiniteNumber(boxValue.y ?? boxValue.top ?? boxValue.minY);
    const width = toFiniteNumber(boxValue.width);
    const height = toFiniteNumber(boxValue.height);
    const right = toFiniteNumber(boxValue.right ?? boxValue.maxX);
    const bottom = toFiniteNumber(boxValue.bottom ?? boxValue.maxY);
    if (x !== null && y !== null && width !== null && height !== null) {
      box = { x, y, width: Math.max(0, width), height: Math.max(0, height) };
    } else if (x !== null && y !== null && right !== null && bottom !== null) {
      box = { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
    } else {
      box = normalizeFromPoints(boxValue.points || boxValue.vertices || boxValue.polygon || boxValue.coords);
    }
  }

  if (!box) return null;
  if (!(box.width > 0 && box.height > 0)) return null;

  const likelyNormalized =
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x <= 1 &&
    box.y <= 1 &&
    box.width <= 1 &&
    box.height <= 1;

  if (likelyNormalized) {
    return { ...box, normalized: true };
  }

  if (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0) {
    return {
      x: box.x / sourceWidth,
      y: box.y / sourceHeight,
      width: box.width / sourceWidth,
      height: box.height / sourceHeight,
      normalized: true,
    };
  }

  return { ...box, normalized: false };
};

const extractSelectableOcrTokens = (payload) => {
  if (!payload || typeof payload !== "object") return [];

  const sourceWidth =
    toFiniteNumber(
      payload.image_width ??
        payload.imageWidth ??
        payload.width ??
        payload.raw?.image_width ??
        payload.raw?.imageWidth ??
        payload.raw?.width
    ) || null;
  const sourceHeight =
    toFiniteNumber(
      payload.image_height ??
        payload.imageHeight ??
        payload.height ??
        payload.raw?.image_height ??
        payload.raw?.imageHeight ??
        payload.raw?.height
    ) || null;

  const candidates = [];
  const collect = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      candidates.push(entry);
    });
  };

  collect(payload.ocr_words);
  collect(payload.words);
  collect(payload.ocr_tokens);
  collect(payload.tokens);
  collect(payload.lines);
  collect(payload.raw?.ocr_words);
  collect(payload.raw?.words);
  collect(payload.raw?.ocr_tokens);
  collect(payload.raw?.tokens);
  collect(payload.raw?.lines);

  const pageLists = [
    ...(Array.isArray(payload.pages) ? payload.pages : []),
    ...(Array.isArray(payload.raw?.pages) ? payload.raw.pages : []),
  ];
  pageLists.forEach((page) => {
    collect(page?.words);
    collect(page?.tokens);
    collect(page?.lines);
    collect(page?.ocr_words);
  });

  const seen = new Set();
  const mapped = [];
  candidates.forEach((entry) => {
    const text = String(
      entry.text ?? entry.word ?? entry.value ?? entry.label ?? entry.content ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return;
    const parsedBox = parseOcrBox(
      entry.bbox ?? entry.box ?? entry.bounds ?? entry.rect ?? entry.polygon ?? entry.points ?? entry.vertices,
      sourceWidth,
      sourceHeight
    );
    if (!parsedBox) return;
    const key = `${text}|${parsedBox.x.toFixed(4)}|${parsedBox.y.toFixed(4)}|${parsedBox.width.toFixed(4)}|${parsedBox.height.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    mapped.push({
      text,
      x: parsedBox.x,
      y: parsedBox.y,
      width: parsedBox.width,
      height: parsedBox.height,
      normalized: Boolean(parsedBox.normalized),
    });
  });

  return mapped.slice(0, 5000);
};

const containsAny = (text, tokens) => {
  const haystack = normalizeTextKey(text);
  return (Array.isArray(tokens) ? tokens : []).some((token) =>
    haystack.includes(normalizeTextKey(token))
  );
};

const normalizeOcrNumberString = (value) => {
  if (value === null || value === undefined) return "";
  let raw = String(value).trim();
  if (!raw) return "";
  raw = raw.replace(/\s/g, "");
  if (/[\d.,]/.test(raw)) {
    raw = applyOcrDigitSwaps(raw);
  }
  raw = raw.replace(/[^0-9,.-]/g, "");
  if (!raw) return "";

  const negative = raw.startsWith("-");
  raw = raw.replace(/-/g, "");
  if (!raw) return "";

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      const intPart = raw.slice(0, lastComma).replace(/[.,]/g, "");
      const fracPart = raw.slice(lastComma + 1).replace(/[.,]/g, "");
      raw = fracPart ? `${intPart}.${fracPart}` : intPart;
    } else {
      const intPart = raw.slice(0, lastDot).replace(/[.,]/g, "");
      const fracPart = raw.slice(lastDot + 1).replace(/[.,]/g, "");
      raw = fracPart ? `${intPart}.${fracPart}` : intPart;
    }
  } else if (hasComma) {
    if (commaCount > 1) {
      const lastComma = raw.lastIndexOf(",");
      const intPart = raw.slice(0, lastComma).replace(/,/g, "");
      const fracPart = raw.slice(lastComma + 1).replace(/,/g, "");
      raw = fracPart ? `${intPart}.${fracPart}` : intPart;
    } else {
      const lastComma = raw.lastIndexOf(",");
      const decimals = raw.length - lastComma - 1;
      if (decimals === 0) {
        raw = raw.replace(/,/g, "");
      } else {
        const intDigits = raw.slice(0, lastComma).replace(/\D/g, "");
        const intValue = Number(intDigits);
        const treatAsThousands =
          decimals === 3 &&
          intDigits.length > 0 &&
          intDigits.length <= 2 &&
          Number.isFinite(intValue) &&
          intValue >= 1 &&
          intValue <= 2;
        if (treatAsThousands) {
          // OCR artifact like 2,330 (intended 2330).
          raw = raw.replace(/,/g, "");
        } else {
          raw = raw.replace(",", ".");
        }
      }
    }
  } else if (hasDot) {
    if (dotCount > 1) {
      const lastDot = raw.lastIndexOf(".");
      const intPart = raw.slice(0, lastDot).replace(/\./g, "");
      const fracPart = raw.slice(lastDot + 1).replace(/\./g, "");
      raw = fracPart ? `${intPart}.${fracPart}` : intPart;
    } else {
      const parts = raw.split(".");
      const decimals = parts[1]?.length || 0;
      if (decimals === 3) {
        const integerPart = String(parts[0] || "").replace("-", "");
        const intValue = Number(integerPart);
        const treatAsThousands =
          integerPart.length > 0 &&
          integerPart.length <= 2 &&
          Number.isFinite(intValue) &&
          intValue >= 1 &&
          intValue <= 2;
        if (treatAsThousands) {
          // OCR artifact like 2.330 (intended 2330).
          raw = parts.join("");
        }
      }
    }
  }

  return negative ? `-${raw}` : raw;
};

const parseOcrNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const normalized = normalizeOcrNumberString(value);
  if (!normalized) return null;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const MONEY_SCALE_DIGITS = 4; // 1/10,000 precision to avoid float drift during intermediate math.
const PERCENT_SCALE = 10000n; // 100.00%
const KURUS_FACTOR = 100n;
const MONEY_SCALE = 10n ** BigInt(MONEY_SCALE_DIGITS);
const SCALE_TO_KURUS = MONEY_SCALE / KURUS_FACTOR;
const TAX_KURUS_DIVISOR = MONEY_SCALE * KURUS_FACTOR; // base(1/10,000) * rate(1/10,000) -> kurus

const roundDiv = (numerator, denominator) => {
  if (!denominator) return 0n;
  if (numerator >= 0n) return (numerator + denominator / 2n) / denominator;
  return (numerator - denominator / 2n) / denominator;
};

const parseScaledDecimal = (value, scaleDigits = MONEY_SCALE_DIGITS) => {
  const normalized = normalizeOcrNumberString(value);
  if (!normalized) return null;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  if (!unsigned) return null;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const fracPart = (fracPartRaw + "0".repeat(scaleDigits)).slice(0, scaleDigits);
  const scale = 10n ** BigInt(scaleDigits);
  const scaled = (BigInt(intPart) * scale) + BigInt(fracPart || "0");
  return negative ? -scaled : scaled;
};

const parsePercentToBasisPoints = (value) => {
  const parsed = parseScaledDecimal(value, 2);
  if (parsed === null || parsed < 0n) return 0n;
  if (parsed > PERCENT_SCALE) return PERCENT_SCALE;
  return parsed;
};

const toKurus = (value) => {
  const scaled = parseScaledDecimal(value, MONEY_SCALE_DIGITS);
  if (scaled === null) return 0n;
  return roundDiv(scaled, SCALE_TO_KURUS);
};

const fromKurus = (value) => (Number(value || 0n) / 100).toFixed(2);

const isTruthyFlag = (value) => {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "evet";
};

const computeInvoiceTotals = (lines = []) => {
  let totalGrossBaseScaled = 0n;
  let totalBaseScaled = 0n;
  const baseByRate = new Map();

  const lineSummaries = lines.map((line = {}) => {
    const hasExplicitTotal = String(line?.total_cost ?? "").trim() !== "";
    const lineTotalScaledFromKurus = toKurus(line?.total_cost) * SCALE_TO_KURUS;
    const qtyScaled = parseScaledDecimal(line?.quantity, MONEY_SCALE_DIGITS);
    const unitPriceScaled =
      parseScaledDecimal(
        line?.unit_price ?? line?.unitPrice ?? line?.price_per_unit,
        MONEY_SCALE_DIGITS
      ) ?? 0n;

    const lineBaseScaled = hasExplicitTotal
      ? lineTotalScaledFromKurus
      : (qtyScaled !== null && qtyScaled > 0n && unitPriceScaled >= 0n)
        ? roundDiv(qtyScaled * unitPriceScaled, MONEY_SCALE)
        : 0n;

    const parsedDiscountBp = parsePercentToBasisPoints(
      line?.discount_rate ?? line?.discount ?? 0
    );
    let discountBp = parsedDiscountBp;
    if (discountBp <= 0n && lineBaseScaled > 0n) {
      const discountAmountScaled = parseScaledDecimal(
        line?.discount_amount,
        MONEY_SCALE_DIGITS
      );
      if (
        discountAmountScaled !== null &&
        discountAmountScaled > 0n &&
        discountAmountScaled < lineBaseScaled
      ) {
        discountBp = roundDiv(discountAmountScaled * PERCENT_SCALE, lineBaseScaled);
      }
    }
    const lineNetBaseScaled = roundDiv(
      lineBaseScaled * (PERCENT_SCALE - discountBp),
      PERCENT_SCALE
    );
    const parsedTaxBp = parsePercentToBasisPoints(
      line?.tax ?? line?.vat_rate ?? line?.taxRate ?? 0
    );
    const taxIncluded = isTruthyFlag(line?.tax_included ?? line?.taxIncluded);
    const taxBp = parsedTaxBp > 0n ? parsedTaxBp : 0n;
    const toExTax = (scaledValue) =>
      taxBp > 0n ? roundDiv(scaledValue * PERCENT_SCALE, PERCENT_SCALE + taxBp) : scaledValue;

    // Imported invoice rows commonly provide VAT-included line totals.
    // Convert included totals to VAT-exclusive base so tax amounts can be displayed correctly.
    const grossBaseScaled = hasExplicitTotal && taxIncluded ? toExTax(lineBaseScaled) : lineBaseScaled;
    const netBaseScaled = hasExplicitTotal && taxIncluded ? toExTax(lineNetBaseScaled) : lineNetBaseScaled;

    totalGrossBaseScaled += grossBaseScaled;

    const bucketKey = taxBp.toString();
    baseByRate.set(bucketKey, (baseByRate.get(bucketKey) || 0n) + netBaseScaled);
    totalBaseScaled += netBaseScaled;

    // Display remains line-level rounded for UX; totals are rounded once at document/rate-bucket level.
    const lineTaxDisplayKurus = roundDiv(netBaseScaled * taxBp, TAX_KURUS_DIVISOR);

    return {
      base: Number(fromKurus(roundDiv(netBaseScaled, SCALE_TO_KURUS))),
      displayTax: Number(fromKurus(lineTaxDisplayKurus)),
      taxRate: Number(taxBp) / 100,
    };
  });

  let totalTaxKurus = 0n;
  baseByRate.forEach((bucketBaseScaled, key) => {
    const rateBp = BigInt(key);
    totalTaxKurus += roundDiv(bucketBaseScaled * rateBp, TAX_KURUS_DIVISOR);
  });

  const totalBaseKurus = roundDiv(totalBaseScaled, SCALE_TO_KURUS);
  const totalDiscountKurus = roundDiv(
    totalGrossBaseScaled - totalBaseScaled,
    SCALE_TO_KURUS
  );
  const netTotalKurus = roundDiv(
    totalBaseScaled + (totalTaxKurus * SCALE_TO_KURUS),
    SCALE_TO_KURUS
  );

  return {
    totalBase: Number(fromKurus(totalBaseKurus)),
    totalDiscount: Number(fromKurus(totalDiscountKurus)),
    totalTax: Number(fromKurus(totalTaxKurus)),
    netTotal: Number(fromKurus(netTotalKurus)),
    lineSummaries,
  };
};

const createEmptyTransactionRow = () => ({
  ingredient_select: "__add_new__",
  ingredient: "",
  quantity: "",
  koli: "",
  amount_per_koli: "",
  unit: "kg",
  discount_rate: "",
  discount_amount: "",
  tax: "",
  tax_included: "",
  total_cost: "",
  expiry_date: "",
  is_cleaning_supply: false,
  counted_stock: "",
});

const deriveQuantityFromKoli = (koliValue, amountPerKoliValue) => {
  const koli = parseOcrNumber(koliValue) || 0;
  const amount = parseOcrNumber(amountPerKoliValue) || 0;
  if (koli <= 0 || amount <= 0) return "";
  return String(Number((koli * amount).toFixed(4)));
};

const fixOcrDigitsInNumericTokens = (line) =>
  String(line || "")
    .split(/\s+/)
    .map((token) => (/[0-9.,]/.test(token) ? applyOcrDigitSwaps(token) : token))
    .join(" ");

const extractNumberTokens = (value) => {
  const text = fixOcrDigitsInNumericTokens(String(value || ""));
  const regex =
    /-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g;
  const tokens = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const parsed = parseOcrNumber(raw);
    tokens.push({
      raw,
      value: parsed,
      index: match.index,
    });
  }
  return tokens;
};

const extractPercentTokens = (value) => {
  const text = fixOcrDigitsInNumericTokens(String(value || ""));
  const regex = /(?:%\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*%)/g;
  const tokens = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1] || match[2];
    if (!raw) continue;
    const parsed = parseOcrNumber(raw);
    tokens.push({
      raw,
      value: parsed,
      index: match.index,
    });
  }
  return tokens;
};

const detectInvoiceDate = (text) => {
  const raw = applyOcrDigitSwaps(String(text || ""));
  const patterns = [
    { regex: /\b(\d{2})[./](\d{2})[./](\d{4})\b/, format: "dmy" },
    { regex: /\b(\d{2})\/(\d{2})\/(\d{4})\b/, format: "dmy" },
    { regex: /\b(\d{4})-(\d{2})-(\d{2})\b/, format: "ymd" },
    { regex: /\b(\d{2})-(\d{2})-(\d{4})\b/, format: "dmy" },
  ];

  for (const { regex, format } of patterns) {
    const match = raw.match(regex);
    if (!match) continue;
    let year;
    let month;
    let day;
    if (format === "ymd") {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    }
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      continue;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return iso;
  }
  return null;
};

const normalizeDateForInput = (value, fallbackText = "") => {
  const raw = String(value || "").trim();
  const fromRaw = detectInvoiceDate(raw);
  if (fromRaw) return fromRaw;
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
        parsed.getDate()
      ).padStart(2, "0")}`;
    }
  }
  return detectInvoiceDate(String(fallbackText || "")) || "";
};

const detectInvoiceNumber = (text) => {
  const content = String(text || "");
  if (!content.trim()) return "";
  const patterns = [
    /(?:fatura|invoice|belge|fis|fiş)\s*(?:no|numarasi|numarası|number|#)?\s*[:\-]?\s*([a-z0-9][a-z0-9\-\/]{2,})/i,
    /(?:ettn|vkn)\s*[:\-]?\s*([a-z0-9][a-z0-9\-\/]{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    const value = String(match?.[1] || "").trim();
    if (value) return value;
  }
  return "";
};

const normalizeCurrencyCode = (value, fallbackText = "") => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) {
    if (/₺|(?:^|[^A-Z])TL(?:[^A-Z]|$)/i.test(String(fallbackText || ""))) return "TRY";
    return "TRY";
  }
  if (raw === "TL" || raw === "TRY") return "TRY";
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return "TRY";
};

const toParsedMoney = (value) => {
  const parsed = parseOcrNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractTotalsFields = (source) => {
  if (!source || typeof source !== "object") {
    return {
      subtotal_ex_vat: null,
      vat_total: null,
      grand_total: null,
      discount_total: null,
      tax_included: null,
    };
  }
  const subtotal =
    toParsedMoney(source?.subtotal_ex_vat) ??
    toParsedMoney(source?.subtotalExVat) ??
    toParsedMoney(
      pickObjectFieldByAlias(source, [
        "subtotal",
        "ara toplam",
        "mal hizmet toplam",
        "mal hizmet toplam tutari",
      ])
    );
  const vat =
    toParsedMoney(source?.vat_total) ??
    toParsedMoney(source?.vatTotal) ??
    toParsedMoney(source?.kdv_total) ??
    toParsedMoney(
      pickObjectFieldByAlias(source, ["vat total", "kdv toplam", "hesaplanan kdv", "topkdv"])
    );
  const grand =
    toParsedMoney(source?.grand_total) ??
    toParsedMoney(source?.grandTotal) ??
    toParsedMoney(source?.total) ??
    toParsedMoney(
      pickObjectFieldByAlias(source, [
        "grand total",
        "genel toplam",
        "odenecek",
        "odenecek tutar",
        "toplam tutar",
      ])
    );
  const discount =
    toParsedMoney(source?.discount_total) ??
    toParsedMoney(source?.discountTotal) ??
    toParsedMoney(
      pickObjectFieldByAlias(source, ["toplam iskonto", "discount total", "iskonto toplam"])
    );
  const taxIncludedRaw =
    source?.tax_included ??
    source?.taxIncluded ??
    source?.kdv_dahil ??
    pickObjectFieldByAlias(source, ["tax included", "kdv dahil", "vergiler dahil"]);
  return {
    subtotal_ex_vat: subtotal,
    vat_total: vat,
    grand_total: grand,
    discount_total: discount,
    tax_included: taxIncludedRaw === undefined ? null : isTruthyFlag(taxIncludedRaw),
  };
};

const mergeParsedTotals = (...sources) => {
  const extracted = sources.map((source) => extractTotalsFields(source));
  const pickFirstNumber = (field) => {
    for (const item of extracted) {
      if (Number.isFinite(item[field])) return item[field];
    }
    return null;
  };
  const pickFirstFlag = () => {
    for (const item of extracted) {
      if (item.tax_included !== null) return item.tax_included;
    }
    return false;
  };
  return {
    subtotal_ex_vat: pickFirstNumber("subtotal_ex_vat"),
    vat_total: pickFirstNumber("vat_total"),
    grand_total: pickFirstNumber("grand_total"),
    discount_total: pickFirstNumber("discount_total"),
    tax_included: pickFirstFlag(),
  };
};

const inferUnitFromName = (value) => {
  const text = String(value || "").toLowerCase();
  if (/\bkg\b/.test(text)) return "kg";
  if (/\bgr\b|\bg\b/.test(text)) return "g";
  if (/\bml\b/.test(text)) return "ml";
  if (/\blt\b|\bl\b/.test(text)) return "lt";
  return "";
};

const normalizeUnit = (value) => {
  if (!value) return "";
  const key = String(value).toLowerCase().trim();
  return SUPPLIER_UNIT_MAP[key] || key;
};

const normalizeIngredientName = (value) => {
  const base = normalizeTextKey(value);
  return base
    .replace(/\b\d+\s*x\s*\d+\b/g, " ")
    .replace(/\b\d+\s*(ml|lt|l|kg|g|gr|cl)\b/g, " ")
    .replace(/\b(kutu|pet|koli|paket|dys)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const isBankLine = (lineKey, rawLine) => {
  if (!lineKey) return true;
  const blockedTokens = [
    "iban",
    "banka",
    "ziraat",
    "sube",
    "hesap",
    "vergi",
    "mersis",
    "adres",
    "tel",
  ];
  if (blockedTokens.some((token) => lineKey.includes(token))) return true;
  const compact = String(rawLine || "").replace(/\s/g, "");
  if (/\btr\d{2}/i.test(compact) || /\btr\b/i.test(rawLine || "")) return true;
  return false;
};

const isTotalsLine = (lineKey) => {
  if (!lineKey) return false;
  return (
    lineKey.includes("mal hizmet toplam") ||
    lineKey.includes("toplam iskonto") ||
    lineKey.includes("vergiler dahil") ||
    lineKey.includes("odenecek") ||
    lineKey.includes("hesaplanan kdv") ||
    lineKey.includes("genel toplam")
  );
};

const isHeaderLine = (lineKey) => {
  if (!lineKey) return false;
  const tokens = [
    "sira",
    "urun",
    "urun kodu",
    "mal hizmet",
    "miktar",
    "koli",
    "birim",
    "fiyat",
    "kdv",
    "tutar",
  ];
  const hits = tokens.filter((token) => lineKey.includes(token));
  return hits.length >= 3;
};

const findTableStartIndex = (lines) => {
  for (let i = 0; i < lines.length; i += 1) {
    const key = normalizeTextKey(lines[i]);
    if (isHeaderLine(key)) return i + 1;
  }
  return 0;
};

const findTableEndIndex = (lines, startIdx) => {
  for (let i = startIdx; i < lines.length; i += 1) {
    const key = normalizeTextKey(lines[i]);
    if (isTotalsLine(key)) return i;
  }
  return lines.length;
};

const isLikelyLooseTableItemLine = (line) => {
  const text = normalizeSpaces(String(line || ""));
  if (!text) return false;
  const key = normalizeTextKey(text);
  if (!key || isHeaderLine(key) || isTotalsLine(key) || isBankLine(key, text) || isOrderUiNonItemLine(key)) {
    return false;
  }
  const letterCount = (text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  if (letterCount < 5) return false;
  const hasCurrencyMarker = /(?:tl|₺)/i.test(text);
  const moneyTokens = extractNumberTokens(text).filter((token) => Number.isFinite(token.value) && token.value > 0);
  const looseKey = normalizeTextKey(text);
  const unitOrVatHint =
    /\b(kg|kilo|gr|gram|lt|ml|adet|koli|kasa|cuval|cuvali|quval|quwali|qval|qwali)\b/.test(looseKey) ||
    /%\s*\d/.test(text);
  return hasCurrencyMarker && moneyTokens.length >= 2 && unitOrVatHint;
};

const parseQtyAndUnit = (line) => {
  const canonicalizeUnitToken = (token) => {
    const raw = String(token || "")
      .toLowerCase()
      .replace(/[01]/g, (ch) => (ch === "0" ? "o" : "i"))
      .replace(/ı/g, "i")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/w/g, "v")
      .replace(/q/g, "c")
      .replace(/[^a-zçğıöşü]/g, "");
    const folded = raw.replace(/[^a-z]/g, "");
    if (!raw) return "";
    if (/^kg|kilo|kilogram/.test(folded)) return "kg";
    if (/^gr|^gram|^g/.test(folded)) return "g";
    if (/^ml|^mili|^mill/.test(folded)) return "ml";
    if (/^lt|^liter|^litre|^l/.test(folded)) return "lt";
    if (
      /^(koli|kol|kali|oli|kolii|koll|kolli|case|kasa)$/.test(folded) ||
      /^c[u]?[v]?[a]?l[i]?$/.test(folded) ||
      /ko?l[iy]?$/.test(folded)
    ) {
      return "koli";
    }
    if (/^(adet|pcs|pc|piece|unit)$/.test(folded)) return "adet";
    if (/^(kg|g|gr|gram)$/.test(folded)) return "kg";
    if (/^(lt|l|ml|liter|litre)$/.test(folded)) return "lt";
    return "";
  };

  const regex = /(\d+(?:[.,]\d+)?)\s*([a-zA-ZçğıöşüÇĞİÖŞÜ0-9]{1,10})\b/g;
  const matches = [];
  let match;

  while ((match = regex.exec(line)) !== null) {
    const unitToken = canonicalizeUnitToken(match[2] || "");
    if (!unitToken) continue;
    const qty = parseOcrNumber(match[1]);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    let rank = 3;
    if (/koli|case|kasa/.test(unitToken)) rank = 0;
    else if (/adet|pcs|pc|piece|unit/.test(unitToken)) rank = 1;
    else if (/kg|g|lt|l|ml/.test(unitToken)) rank = 2;

    matches.push({
      qty,
      unitToken: match[2] || "",
      index: match.index ?? -1,
      rank,
    });
  }

  if (matches.length > 0) {
    matches.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.index - a.index;
    });
    const best = matches[0];
    return {
      qty: best.qty,
      unitToken: best.unitToken,
      index: best.index,
    };
  }

  return { qty: null, unitToken: "", index: -1 };
};

const resolveUnitMeta = (unitToken, unitsPerCase) => {
  const token = String(unitToken || "").toLowerCase();
  const folded = token
    .replace(/ı/g, "i")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/w/g, "v")
    .replace(/q/g, "c");
  const isCase = /koli|kol|kali|oli|case|kasa|c[u]?[v]?[a]?l/.test(folded) || !!unitsPerCase;
  if (isCase) return "case";
  if (/adet|pcs|pc|piece|unit/.test(token)) return "piece";
  if (/kg/.test(token)) return "kg";
  if (/gr|gram|(^|[^a-z])g([^a-z]|$)/.test(token)) return "g";
  if (/ml/.test(token)) return "ml";
  if (/lt|liter|litre|(^|[^a-z])l([^a-z]|$)/.test(token)) return "lt";
  return null;
};

const inferUnitsPerCaseFromName = (value) => {
  const text = String(value || "");
  if (!text) return null;
  const packMatch = text.match(/\b\d+(?:[.,]\d+)?\s*[xX]\s*(\d+(?:[.,]\d+)?)\b/);
  if (packMatch) {
    const packParsed = parseOcrNumber(packMatch[1]);
    if (Number.isFinite(packParsed) && packParsed > 1 && packParsed <= 240) {
      return packParsed;
    }
  }
  const measureMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilogram|g|gr|gram|lt|l|liter|litre|ml)\b/i);
  if (!measureMatch) return null;
  const parsed = parseOcrNumber(measureMatch[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const inferQtyFromLinePrices = (line) => {
  const text = String(line || "");
  if (!text) return null;
  const tlMatches = [...text.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|₺)/gi)]
    .map((m) => ({
      value: parseOcrNumber(m?.[1]),
      index: m?.index ?? -1,
    }))
    .filter((m) => Number.isFinite(m.value) && m.value > 0);
  const genericNumbers = extractNumberTokens(text).filter(
    (token) => Number.isFinite(token.value) && token.value > 0
  );
  const values = tlMatches.length
    ? tlMatches.map((m) => m.value)
    : genericNumbers.map((t) => t.value);
  if (values.length < 2) return null;

  const lineTotal = values[values.length - 1];
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return null;

  const unitCandidates = [];
  if (tlMatches.length >= 2) {
    const lineTotalIdx = tlMatches[tlMatches.length - 1].index;
    tlMatches
      .slice(0, -1)
      .forEach((m) => {
        if (m.index >= 0 && lineTotalIdx >= 0 && m.index >= lineTotalIdx) return;
        unitCandidates.push(m.value);
      });
  }
  if (!unitCandidates.length) {
    values.slice(0, -1).forEach((v) => unitCandidates.push(v));
  }

  let bestQty = null;
  let bestScore = Number.POSITIVE_INFINITY;
  unitCandidates.forEach((candidate) => {
    if (!Number.isFinite(candidate) || candidate <= 0) return;
    if (candidate > lineTotal * 1.001) return;
    const qty = lineTotal / candidate;
    if (!Number.isFinite(qty) || qty <= 0 || qty > 500) return;

    const rounded = Math.round(qty);
    const integerGap = Math.abs(qty - rounded);
    const roundedInRange = rounded >= 1 && rounded <= 20;
    const candidatePenalty = candidate < 1 ? 2 : 0;
    const score =
      (roundedInRange ? 0 : 1) +
      integerGap +
      candidatePenalty +
      (rounded > 10 ? 0.05 : 0);

    if (score < bestScore) {
      bestScore = score;
      bestQty = integerGap <= 0.08 && rounded >= 1 ? rounded : Number(qty.toFixed(3));
    }
  });

  if (!Number.isFinite(bestQty) || bestQty <= 0) return null;
  return bestQty;
};

const NOISE_NAME_TOKENS = [
  "iban",
  "banka",
  "ziraat",
  "sube",
  "şube",
  "hesap",
  "tel",
  "telefon",
  "adres",
  "vergi",
  "mersis",
  "ticaret",
  "bakiye",
  "bankaasi",
  "bankasi",
  "fatura",
  "seri",
  "sira no",
  "odeme",
  "kredi kart",
  "ara toplam",
  "mal hizmet toplam",
  "hesaplanan kdv",
  "odenecek",
  "topkdv",
  "toplam tutar",
  "musteri",
  "tarih",
  "saat",
  "tara",
];

const COCA_COLA_CODE_HINTS = {
  "140358": { units_per_case: 24, vat_rate: 10, name: "COCA-COLA KUTU 330ML 1X24 DYS" },
  "730473": { units_per_case: 24, vat_rate: 10, name: "CC ZERO SUGAR KUTU 330ML DYS" },
  "102162": { units_per_case: 12, vat_rate: 10, name: "COCA-COLA PET 1L 1X12 Q4PARAM UTC" },
  "731948": { units_per_case: 12, vat_rate: 10, name: "CCZS PET 1L 1X12 Q4PARAM UTC PXE" },
  "782901": { units_per_case: 24, vat_rate: 1, name: "DAMLA MN.MNG-ANS OWB200 1X24 YS" },
  "610493": { units_per_case: 12, vat_rate: 10, name: "FT SEFT.KT330ML 1X12 REMIX2 DYS" },
};

const enrichCocaRowsFromRawLines = (items, rawLines = []) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const lines = (Array.isArray(rawLines) ? rawLines : [])
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);
  if (!lines.length) return items;

  const resolveHintFromName = (name) => {
    const key = normalizeTextKey(name || "");
    if (!key) return null;
    if (key.includes("cc zero sugar")) return { code: "730473", ...COCA_COLA_CODE_HINTS["730473"] };
    if (key.includes("coca cola kutu") && key.includes("1x24")) return { code: "140358", ...COCA_COLA_CODE_HINTS["140358"] };
    if (key.includes("coca cola pet") && key.includes("1x12")) return { code: "102162", ...COCA_COLA_CODE_HINTS["102162"] };
    if (key.includes("cczs pet")) return { code: "731948", ...COCA_COLA_CODE_HINTS["731948"] };
    if (key.includes("damla")) return { code: "782901", ...COCA_COLA_CODE_HINTS["782901"] };
    if (key.includes("seft") || key.includes("remix2")) return { code: "610493", ...COCA_COLA_CODE_HINTS["610493"] };
    return null;
  };

  const hasCocaSignal = items.some((item) => {
    const codeKey = String(item?.code || "").replace(/[^\d]/g, "");
    const key = normalizeTextKey(item?.name || "");
    return (
      Boolean(COCA_COLA_CODE_HINTS[codeKey]) ||
      /coca|cola|cczs|zero sugar|damla|seft|remix/.test(key)
    );
  });
  if (!hasCocaSignal) return items;

  const lineKeys = lines.map((line) => normalizeTextKey(line));
  const rowStartRegex = /^\s*\d{1,3}\s+\d{5,8}\b/i;
  const structuredRows = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (!rowStartRegex.test(line)) continue;
    const rowCode = line.match(/^\s*\d{1,3}\s+(\d{5,8})\b/i)?.[1] || null;
    if (!rowCode) continue;
    const parts = [line];
    for (let i = idx + 1; i < lines.length && i <= idx + 2; i += 1) {
      if (rowStartRegex.test(lines[i])) break;
      if (isHeaderLine(lineKeys[i]) || isTotalsLine(lineKeys[i])) break;
      parts.push(lines[i]);
    }
    const context = normalizeSpaces(parts.join(" "));
    const qtyFromMiktar = parseOcrNumber(context.match(/(\d+(?:[.,]\d+)?)\s*koli\b/i)?.[1]);
    const upcAfterKoli = parseOcrNumber(
      context.match(/(?:\d+(?:[.,]\d+)?\s*koli\b)\s*(\d+(?:[.,]\d+)?)/i)?.[1]
    );
    const upcFromPack = parseOcrNumber(context.match(/\b\d+(?:[.,]\d+)?\s*[xX]\s*(\d+(?:[.,]\d+)?)\b/i)?.[1]);
    const percentValues = [...context.matchAll(/%\s*([0-9]{1,2}(?:[.,]\d+)?)/gi)]
      .map((match) => parseOcrNumber(match?.[1]))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 95);
    const tlValues = [...context.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|₺)/gi)]
      .map((match) => parseOcrNumber(match?.[1]))
      .filter((value) => Number.isFinite(value) && value > 0);
    const unitPrice = tlValues.length > 0 ? tlValues[0] : null;
    let lineTotal = tlValues.length > 1 ? tlValues[tlValues.length - 1] : null;
    const discountRate = percentValues.length > 0 ? percentValues[0] : null;
    const vatRate =
      percentValues.length >= 2
        ? percentValues[1]
        : COCA_COLA_CODE_HINTS[rowCode]?.vat_rate || null;
    const qtyCases = Number.isFinite(qtyFromMiktar) && qtyFromMiktar > 0 ? qtyFromMiktar : null;
    let unitsPerCase =
      (Number.isFinite(upcAfterKoli) && upcAfterKoli > 1 ? upcAfterKoli : null) ||
      (Number.isFinite(upcFromPack) && upcFromPack > 1 ? upcFromPack : null) ||
      COCA_COLA_CODE_HINTS[rowCode]?.units_per_case ||
      null;
    if (!Number.isFinite(unitsPerCase) || unitsPerCase <= 1 || unitsPerCase > 240) {
      unitsPerCase = COCA_COLA_CODE_HINTS[rowCode]?.units_per_case || null;
    }
    if (
      (!Number.isFinite(lineTotal) || lineTotal <= 0) &&
      Number.isFinite(qtyCases) &&
      qtyCases > 0 &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0
    ) {
      const gross = qtyCases * unitPrice;
      if (Number.isFinite(discountRate) && discountRate > 0 && discountRate < 95) {
        lineTotal = gross * (1 - discountRate / 100);
      } else {
        lineTotal = gross;
      }
    }
    const discountAmount =
      Number.isFinite(qtyCases) &&
      qtyCases > 0 &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      Number.isFinite(lineTotal) &&
      lineTotal > 0
        ? Math.max(0, (qtyCases * unitPrice) - lineTotal)
        : null;
    structuredRows.push({
      code: rowCode,
      qty_cases: qtyCases,
      units_per_case: unitsPerCase,
      unit_price_ex_vat: unitPrice,
      line_total_inc_vat: lineTotal,
      discount_rate: discountRate,
      discount_amount: discountAmount,
      vat_rate: vatRate,
      name: COCA_COLA_CODE_HINTS[rowCode]?.name || null,
    });
  }
  const rowByCode = new Map();
  structuredRows.forEach((row) => {
    if (row?.code && !rowByCode.has(row.code)) rowByCode.set(row.code, row);
  });

  return items.map((item) => {
    const codeKey = String(item?.code || "").replace(/[^\d]/g, "");
    const nameHint = resolveHintFromName(item?.name);
    const hint = COCA_COLA_CODE_HINTS[codeKey] ? { code: codeKey, ...COCA_COLA_CODE_HINTS[codeKey] } : nameHint;
    if (!hint) return item;

    const sourceRow =
      rowByCode.get(codeKey) ||
      (hint?.code ? rowByCode.get(hint.code) : null) ||
      null;

    let qtyCases =
      parseOcrNumber(sourceRow?.qty_cases) ||
      parseOcrNumber(item?.qty_cases) ||
      null;
    let unitsPerCase =
      parseOcrNumber(sourceRow?.units_per_case) ||
      parseOcrNumber(item?.units_per_case) ||
      hint.units_per_case;
    if (!Number.isFinite(unitsPerCase) || unitsPerCase <= 1 || unitsPerCase > 240) {
      unitsPerCase = hint.units_per_case;
    }

    let unitPrice =
      parseOcrNumber(sourceRow?.unit_price_ex_vat) ||
      parseOcrNumber(item?.unit_price_ex_vat ?? item?.unit_price ?? null);
    let lineTotal =
      parseOcrNumber(sourceRow?.line_total_inc_vat) ||
      parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? null);
    let discountAmount =
      parseOcrNumber(sourceRow?.discount_amount) ||
      parseOcrNumber(item?.discount_amount ?? null);
    let discountRate =
      parseOcrNumber(sourceRow?.discount_rate) ||
      parseOcrNumber(item?.discount_rate ?? null);
    let vatRate =
      parseOcrNumber(sourceRow?.vat_rate) ||
      parseOcrNumber(item?.vat_rate ?? item?.taxRate ?? null) ||
      hint.vat_rate;

    if (
      (!Number.isFinite(qtyCases) || qtyCases <= 0) &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      Number.isFinite(lineTotal) &&
      lineTotal > 0
    ) {
      let derivedQty = null;
      if (Number.isFinite(discountRate) && discountRate > 0 && discountRate < 95) {
        const discountedPrice = unitPrice * (1 - discountRate / 100);
        if (discountedPrice > 0) derivedQty = lineTotal / discountedPrice;
      }
      if ((!Number.isFinite(derivedQty) || derivedQty <= 0) && Number.isFinite(discountAmount) && discountAmount > 0) {
        derivedQty = (lineTotal + discountAmount) / unitPrice;
      }
      if (!Number.isFinite(derivedQty) || derivedQty <= 0) {
        derivedQty = lineTotal / unitPrice;
      }
      const roundedQty = Math.round(derivedQty);
      if (
        Number.isFinite(derivedQty) &&
        roundedQty >= 1 &&
        roundedQty <= 100 &&
        Math.abs(derivedQty - roundedQty) <= 0.2
      ) {
        qtyCases = roundedQty;
      }
    }

    if (
      Number.isFinite(qtyCases) &&
      qtyCases > 0 &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      Number.isFinite(discountRate) &&
      discountRate >= 0 &&
      discountRate < 95
    ) {
      const gross = qtyCases * unitPrice;
      const expectedTotal = gross * (1 - discountRate / 100);
      if (
        !Number.isFinite(lineTotal) ||
        lineTotal <= 0 ||
        Math.abs(lineTotal - expectedTotal) > Math.max(2, expectedTotal * 0.08)
      ) {
        lineTotal = expectedTotal;
      }
    }

    if (
      (!Number.isFinite(discountRate) || discountRate <= 0 || discountRate > 95) &&
      Number.isFinite(qtyCases) &&
      qtyCases > 0 &&
      Number.isFinite(unitPrice) &&
      unitPrice > 0 &&
      Number.isFinite(lineTotal) &&
      lineTotal > 0
    ) {
      const gross = qtyCases * unitPrice;
      if (gross > lineTotal + 0.01) {
        discountAmount = gross - lineTotal;
        discountRate = (discountAmount / gross) * 100;
      }
    }

    const next = {
      ...item,
      qty_cases: Number.isFinite(qtyCases) && qtyCases > 0 ? Number(qtyCases.toFixed(3)) : item?.qty_cases,
      units_per_case:
        Number.isFinite(unitsPerCase) && unitsPerCase > 1 ? Number(unitsPerCase.toFixed(3)) : item?.units_per_case,
      qty_units:
        Number.isFinite(qtyCases) &&
        qtyCases > 0 &&
        Number.isFinite(unitsPerCase) &&
        unitsPerCase > 1
          ? Number((qtyCases * unitsPerCase).toFixed(3))
          : item?.qty_units,
      unit_price_ex_vat:
        Number.isFinite(unitPrice) && unitPrice > 0 ? Number(unitPrice.toFixed(3)) : item?.unit_price_ex_vat,
      line_total_inc_vat:
        Number.isFinite(lineTotal) && lineTotal > 0 ? Number(lineTotal.toFixed(2)) : item?.line_total_inc_vat,
      discount_rate:
        Number.isFinite(discountRate) && discountRate > 0 && discountRate <= 95
          ? Number(discountRate.toFixed(2))
          : item?.discount_rate,
      discount_amount:
        Number.isFinite(discountAmount) && discountAmount > 0
          ? Number(discountAmount.toFixed(2))
          : item?.discount_amount,
      vat_rate:
        Number.isFinite(vatRate) && vatRate >= 0 && vatRate <= 30
          ? Number(vatRate.toFixed(2))
          : item?.vat_rate,
      unit: "case",
      unit_meta: "case",
      name:
        String(item?.name || "").trim().length >= 8 ? item?.name : hint.name,
      code: item?.code || hint.code || codeKey || null,
    };

    return next;
  });
};

const sanitizeParsedItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const key = normalizeTextKey(it?.name || "");
      const isNoise = NOISE_NAME_TOKENS.some((k) => key.includes(k));
      const tableHeaderTokens = [
        "mal hizmet",
        "miktar",
        "koli ici",
        "birim fiyat",
        "iskonto orani",
        "iskonto tutari",
        "kdv orani",
        "kdv tutari",
      ];
      const headerTokenHits = tableHeaderTokens.reduce(
        (count, token) => (key.includes(token) ? count + 1 : count),
        0
      );
      const looksLikeTableHeader = headerTokenHits >= 3;
      const looksLikeDocMeta =
        key.includes("ettn") ||
        key.includes("vkn") ||
        key.includes("vergi dairesi") ||
        key.includes("musteri numarasi") ||
        key.includes("unvan");
      const qtyRaw = parseOcrNumber(it?.qty_units ?? it?.qty_cases ?? it?.qty ?? it?.quantity);
      const qtyCasesRaw = parseOcrNumber(it?.qty_cases ?? null);
      const unitsPerCaseRaw = parseOcrNumber(it?.units_per_case ?? null);
      const unitPrice = parseOcrNumber(
        it?.unit_price_ex_vat ?? it?.unit_price ?? it?.price_per_unit ?? null
      );
      const total = parseOcrNumber(it?.line_total_inc_vat ?? it?.totalCost ?? it?.total);
      const vatRaw = parseOcrNumber(it?.vat_rate ?? it?.taxRate ?? it?.tax ?? null);
      const vatRate = Number.isFinite(vatRaw) && vatRaw >= 0 && vatRaw <= 30 ? vatRaw : null;
      const nameUnit = inferUnitFromName(it?.name || "");
      const rawUnitLower = String(it?.unit || "").toLowerCase();
      const isCaseUnit = rawUnitLower === "case" || /koli|kol|kasa|cuval|çuval|qval|qwal/.test(rawUnitLower);
      const rawName = String(it?.name || "");
      const hasMultipackToken =
        /\b\d+\s*x\s*\d+\b/i.test(rawName) || /\b\d+x\d+\b/i.test(rawName);
      const inferredUnitsPerCase = inferUnitsPerCaseFromName(it?.name || "");
      let unitsPerCase =
        Number.isFinite(unitsPerCaseRaw) && unitsPerCaseRaw > 0
          ? unitsPerCaseRaw
          : Number.isFinite(inferredUnitsPerCase) && inferredUnitsPerCase > 0
            ? inferredUnitsPerCase
            : null;
      let qtyCases =
        Number.isFinite(qtyCasesRaw) && qtyCasesRaw > 0
          ? qtyCasesRaw
          : isCaseUnit && Number.isFinite(qtyRaw) && qtyRaw > 0
            ? qtyRaw
            : null;
      const inferredQty =
        Number.isFinite(qtyRaw) && qtyRaw > 0
          ? qtyRaw
          : Number.isFinite(total) && Number.isFinite(unitPrice) && unitPrice > 0
            ? total / unitPrice
            : 1;
      let normalizedQtyUnits =
        isCaseUnit && Number.isFinite(qtyCases) && qtyCases > 0 && Number.isFinite(unitsPerCase) && unitsPerCase > 0
          ? qtyCases * unitsPerCase
          : inferredQty;
      const unitsPerCaseLooksLikePieceCount =
        isCaseUnit &&
        Number.isFinite(unitsPerCase) &&
        unitsPerCase > 0 &&
        unitsPerCase <= 60 &&
        hasMultipackToken;
      const normalizedUnit =
        unitsPerCaseLooksLikePieceCount
          ? "pcs"
          : isCaseUnit && nameUnit
            ? nameUnit
            : normalizeUnit(it?.unit || "") || nameUnit || null;
      const packSizeFromName = Number.isFinite(inferredUnitsPerCase) && inferredUnitsPerCase > 0
        ? inferredUnitsPerCase
        : null;
      const explicitCaseDataPresent =
        (Number.isFinite(qtyCasesRaw) && qtyCasesRaw > 0) ||
        (Number.isFinite(unitsPerCaseRaw) && unitsPerCaseRaw > 0);
      if (
        Number.isFinite(packSizeFromName) &&
        packSizeFromName > 0 &&
        ["g", "ml"].includes(normalizedUnit || "")
      ) {
        const suspiciousCaseData =
          explicitCaseDataPresent &&
          Number.isFinite(unitsPerCaseRaw) &&
          unitsPerCaseRaw > 0 &&
          (
            unitsPerCaseRaw < packSizeFromName * 0.35 ||
            (
              Number.isFinite(qtyCasesRaw) &&
              qtyCasesRaw > 0 &&
              (qtyCasesRaw * unitsPerCaseRaw) < packSizeFromName * 0.5
            )
          );
        const suspiciousQtyWithoutCaseData =
          !explicitCaseDataPresent &&
          Number.isFinite(qtyRaw) &&
          qtyRaw > 0 &&
          qtyRaw < packSizeFromName * 0.5;

        if (suspiciousCaseData || suspiciousQtyWithoutCaseData) {
          qtyCases = 1;
          unitsPerCase = packSizeFromName;
          normalizedQtyUnits = packSizeFromName;
        }
      }
      const hasValidNumbers = Number.isFinite(inferredQty) && inferredQty > 0 && Number.isFinite(total) && total > 0;
      if (!hasValidNumbers || isNoise || looksLikeTableHeader || looksLikeDocMeta) return null;
      if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(String(it?.name || ""))) return null;
      return {
        ...it,
        name: it?.name || "",
        qty_cases: Number.isFinite(qtyCases) && qtyCases > 0 ? qtyCases : it?.qty_cases ?? null,
        units_per_case: Number.isFinite(unitsPerCase) && unitsPerCase > 0 ? unitsPerCase : it?.units_per_case ?? null,
        qty_units: normalizedQtyUnits,
        unit: normalizedUnit,
        line_total_inc_vat: total,
        vat_rate: vatRate,
      };
    })
    .filter(Boolean);
};

const enrichCaseRowsFromPeers = (items) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const parsedItems = items.map((item) => {
    const qtyCases = parseOcrNumber(item?.qty_cases);
    const unitsPerCase = parseOcrNumber(item?.units_per_case);
    const qtyUnits = parseOcrNumber(item?.qty_units ?? item?.qty ?? item?.quantity);
    const unitPrice = parseOcrNumber(item?.unit_price_ex_vat ?? item?.unit_price ?? item?.price_per_unit);
    const total = parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total);
    return { item, qtyCases, unitsPerCase, qtyUnits, unitPrice, total };
  });

  const knownCaseRows = parsedItems.filter(
    (row) =>
      Number.isFinite(row.qtyCases) &&
      row.qtyCases > 0 &&
      Number.isFinite(row.unitsPerCase) &&
      row.unitsPerCase > 0 &&
      Number.isFinite(row.total) &&
      row.total > 0
  );

  const unitsPerCaseFrequency = new Map();
  knownCaseRows.forEach((row) => {
    const key = Number(Number(row.unitsPerCase).toFixed(3));
    unitsPerCaseFrequency.set(key, (unitsPerCaseFrequency.get(key) || 0) + 1);
  });
  let dominantUnitsPerCase = null;
  let dominantCount = -1;
  unitsPerCaseFrequency.forEach((count, key) => {
    if (count > dominantCount) {
      dominantCount = count;
      dominantUnitsPerCase = key;
    }
  });

  const casePriceSamples = knownCaseRows
    .map((row) => {
      if (!Number.isFinite(row.qtyCases) || row.qtyCases <= 0 || !Number.isFinite(row.total)) return null;
      return row.total / row.qtyCases;
    })
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const medianCasePrice =
    casePriceSamples.length > 0
      ? casePriceSamples[Math.floor(casePriceSamples.length / 2)]
      : null;

  return parsedItems.map((row) => {
    const currentQtyCases = row.qtyCases;
    const qtyUnits = row.qtyUnits;
    const total = row.total;
    if (!Number.isFinite(qtyUnits) || qtyUnits <= 0 || !Number.isFinite(total) || total <= 0) {
      return row.item;
    }

    const inferredFromName = inferUnitsPerCaseFromName(row.item?.name || "");
    const candidateUnitsPerCase =
      (Number.isFinite(row.unitsPerCase) && row.unitsPerCase > 0
        ? row.unitsPerCase
        : Number.isFinite(inferredFromName) && inferredFromName > 0
          ? inferredFromName
          : Number.isFinite(dominantUnitsPerCase) && dominantUnitsPerCase > 0
            ? dominantUnitsPerCase
            : null);
    if (!Number.isFinite(candidateUnitsPerCase) || candidateUnitsPerCase <= 0) {
      return row.item;
    }

    const unitKey = normalizeTextKey(row.item?.unit || "");
    const nameKey = normalizeTextKey(row.item?.name || "");
    const likelyWeightCaseRow =
      /\bkg\b/.test(nameKey) ||
      unitKey === "kg" ||
      unitKey === "g";
    if (!likelyWeightCaseRow) return row.item;

    const qtyLooksLikeSinglePack =
      qtyUnits >= candidateUnitsPerCase * 0.8 &&
      qtyUnits <= candidateUnitsPerCase * 1.2;
    const unitPriceLooksLikeLineTotal =
      Number.isFinite(row.unitPrice) &&
      row.unitPrice > 0 &&
      Math.abs(row.unitPrice - total) <= Math.max(1, total * 0.12);
    const hasSingleCaseOutlierSignal =
      Number.isFinite(currentQtyCases) &&
      currentQtyCases > 0 &&
      currentQtyCases <= 1.05 &&
      qtyLooksLikeSinglePack &&
      unitPriceLooksLikeLineTotal;

    if (hasSingleCaseOutlierSignal && Number.isFinite(medianCasePrice) && medianCasePrice > 0) {
      const byPeerPrice = total / medianCasePrice;
      const roundedByPeer = Math.round(byPeerPrice);
      const peersSuggestMultipleCases =
        roundedByPeer >= 2 &&
        roundedByPeer <= 20 &&
        Math.abs(total - roundedByPeer * medianCasePrice) <= Math.max(2, medianCasePrice * 0.55);
      if (peersSuggestMultipleCases) {
        return {
          ...row.item,
          qty_cases: Number(roundedByPeer.toFixed(3)),
          units_per_case: Number(candidateUnitsPerCase.toFixed(3)),
          qty_units: Number((roundedByPeer * candidateUnitsPerCase).toFixed(3)),
          unit_meta: row.item?.unit_meta || "case",
        };
      }
    }

    if (Number.isFinite(currentQtyCases) && currentQtyCases > 0) {
      return row.item;
    }

    let derivedCases = null;

    const qtyLooksLikeSinglePackMissingCase =
      qtyUnits >= candidateUnitsPerCase * 0.8 &&
      qtyUnits <= candidateUnitsPerCase * 1.2;
    const totalLooksLikeMultipleCases =
      Number.isFinite(medianCasePrice) &&
      medianCasePrice > 0 &&
      total > medianCasePrice * 1.35;
    const preferPeerOverUnitPrice =
      qtyLooksLikeSinglePackMissingCase &&
      totalLooksLikeMultipleCases;

    if (preferPeerOverUnitPrice && Number.isFinite(medianCasePrice) && medianCasePrice > 0) {
      const byPeerPrice = total / medianCasePrice;
      const roundedByPeer = Math.round(byPeerPrice);
      if (
        roundedByPeer >= 1 &&
        roundedByPeer <= 20 &&
        Math.abs(total - roundedByPeer * medianCasePrice) <= Math.max(2, medianCasePrice * 0.55)
      ) {
        derivedCases = roundedByPeer;
      }
    }

    if (Number.isFinite(row.unitPrice) && row.unitPrice > 0) {
      const byPrice = total / row.unitPrice;
      const roundedByPrice = Math.round(byPrice);
      if (
        Number.isFinite(byPrice) &&
        roundedByPrice >= 1 &&
        roundedByPrice <= 20 &&
        Math.abs(byPrice - roundedByPrice) <= 0.2
      ) {
        const byPriceLooksSuspiciousOneCase =
          roundedByPrice === 1 &&
          totalLooksLikeMultipleCases;
        if (!byPriceLooksSuspiciousOneCase) {
          derivedCases = roundedByPrice;
        }
      }
    }

    if (!derivedCases && Number.isFinite(medianCasePrice) && medianCasePrice > 0) {
      const byPeerPrice = total / medianCasePrice;
      const roundedByPeer = Math.round(byPeerPrice);
      if (
        roundedByPeer >= 1 &&
        roundedByPeer <= 20 &&
        Math.abs(total - roundedByPeer * medianCasePrice) <= Math.max(2, medianCasePrice * 0.55)
      ) {
        derivedCases = roundedByPeer;
      }
    }

    if (!derivedCases) {
      if (
        qtyUnits >= candidateUnitsPerCase * 0.95 &&
        qtyUnits <= candidateUnitsPerCase * 1.05
      ) {
        derivedCases = 1;
      }
    }

    if (!Number.isFinite(derivedCases) || derivedCases <= 0) return row.item;

    return {
      ...row.item,
      qty_cases: Number(derivedCases.toFixed(3)),
      units_per_case: Number(candidateUnitsPerCase.toFixed(3)),
      qty_units: Number((derivedCases * candidateUnitsPerCase).toFixed(3)),
      unit_meta: row.item?.unit_meta || "case",
    };
  });
};

const inferPackSizeFromRawLines = (item, rawLines = []) => {
  if (!item || !Array.isArray(rawLines) || rawLines.length === 0) return null;
  const unit = normalizeUnit(item?.unit || "");
  if (!["g", "ml", "kg", "lt"].includes(unit)) return null;

  const nameKey = normalizeTextKey(item?.name || "");
  if (!nameKey) return null;
  const tokens = nameKey
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const anchorTokens = [...tokens].sort((a, b) => b.length - a.length).slice(0, 3);

  const targetTotal = parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total);
  const totalTol =
    Number.isFinite(targetTotal) && targetTotal > 0 ? Math.max(0.5, targetTotal * 0.01) : 0;

  const candidates = [];
  for (const rawLine of rawLines) {
    const line = String(rawLine || "");
    const lineKey = normalizeTextKey(line);
    if (!lineKey) continue;
    const tokenHits = anchorTokens.filter((token) => lineKey.includes(token)).length;
    if (tokenHits >= Math.min(2, anchorTokens.length)) {
      candidates.push({ line, kind: "name" });
      continue;
    }
    if (totalTol > 0) {
      const nums = extractNumberTokens(line)
        .map((t) => t.value)
        .filter((v) => Number.isFinite(v));
      if (nums.some((v) => Math.abs(v - targetTotal) <= totalTol)) {
        candidates.push({ line, kind: "total" });
      }
    }
  }

  candidates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "name" ? -1 : 1));
  for (const { line } of candidates) {

    const measures = [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilogram|g|gr|gram|ml|lt|l|liter|litre|c)\b/gi)];
    if (!measures.length) continue;

    for (const match of measures) {
      const rawQty = parseOcrNumber(match?.[1]);
      const rawToken = normalizeTextKey(match?.[2] || "");
      if (!Number.isFinite(rawQty) || rawQty <= 0) continue;

      let normalizedValue = rawQty;
      if (unit === "g") {
        if (rawToken.startsWith("kg") || rawToken.startsWith("kilo")) normalizedValue = rawQty * 1000;
        else if (rawToken === "l" || rawToken.startsWith("lt") || rawToken.startsWith("liter")) normalizedValue = rawQty * 1000;
        else normalizedValue = rawQty;
      } else if (unit === "kg") {
        if (rawToken === "g" || rawToken.startsWith("gr") || rawToken === "c") normalizedValue = rawQty / 1000;
        else normalizedValue = rawQty;
      } else if (unit === "ml") {
        if (rawToken === "l" || rawToken.startsWith("lt") || rawToken.startsWith("liter")) normalizedValue = rawQty * 1000;
        else normalizedValue = rawQty;
      } else if (unit === "lt") {
        if (rawToken === "ml") normalizedValue = rawQty / 1000;
        else normalizedValue = rawQty;
      }

      if (Number.isFinite(normalizedValue) && normalizedValue > 0) {
        return Number(Number(normalizedValue).toFixed(3));
      }
    }
  }
  return null;
};

const inferCaseQtyFromRawLines = (item, rawLines = []) => {
  if (!item || !Array.isArray(rawLines) || rawLines.length === 0) return null;
  const nameKey = normalizeTextKey(item?.name || "");
  if (!nameKey) return null;
  const tokens = nameKey
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;
  const anchorTokens = [...tokens].sort((a, b) => b.length - a.length).slice(0, 3);

  const caseRegex =
    /(\d+(?:[.,]\d+)?)\s*(?:c[uü]?[vw]?a[l1iı]?|q[u]?[vw]?a[l1iı]?|koli|kasa|case|sack|bag)\b/gi;

  const targetTotal = parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total);
  const totalTol =
    Number.isFinite(targetTotal) && targetTotal > 0 ? Math.max(0.5, targetTotal * 0.01) : 0;

  const candidates = [];
  for (const rawLine of rawLines) {
    const line = String(rawLine || "");
    const lineKey = normalizeTextKey(line);
    if (!lineKey) continue;
    const tokenHits = anchorTokens.filter((token) => lineKey.includes(token)).length;
    if (tokenHits >= Math.min(2, anchorTokens.length)) {
      candidates.push({ line, kind: "name" });
      continue;
    }
    if (totalTol > 0) {
      const nums = extractNumberTokens(line)
        .map((t) => t.value)
        .filter((v) => Number.isFinite(v));
      if (nums.some((v) => Math.abs(v - targetTotal) <= totalTol)) {
        candidates.push({ line, kind: "total" });
      }
    }
  }

  candidates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "name" ? -1 : 1));
  for (const { line } of candidates) {

    const matches = [...line.matchAll(caseRegex)];
    for (const match of matches) {
      const qty = parseOcrNumber(match?.[1]);
      if (Number.isFinite(qty) && qty > 0) {
        return Number(Number(qty).toFixed(3));
      }
    }
  }
  return null;
};

const enrichPackSizesFromRawLines = (items, rawLines = []) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.map((item) => {
    const unit = normalizeUnit(item?.unit || "");
    if (!["g", "ml", "kg", "lt"].includes(unit)) return item;

    const inferredPackSize = inferPackSizeFromRawLines(item, rawLines);
    const inferredCaseQty = inferCaseQtyFromRawLines(item, rawLines);
    if (
      Number.isFinite(inferredCaseQty) &&
      inferredCaseQty > 0 &&
      Number.isFinite(inferredPackSize) &&
      inferredPackSize > 0
    ) {
      const total = parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total);
      const unitPrice =
        Number.isFinite(total) && total > 0
          ? Number((total / inferredCaseQty).toFixed(3))
          : item?.unit_price_ex_vat;
      return {
        ...item,
        qty_cases: inferredCaseQty,
        units_per_case: inferredPackSize,
        qty_units: Number((inferredCaseQty * inferredPackSize).toFixed(3)),
        unit_price_ex_vat: unitPrice,
        unit_meta: "case",
      };
    }

    if (!Number.isFinite(inferredPackSize) || inferredPackSize <= 0) return item;

    const qtyCases = parseOcrNumber(item?.qty_cases);
    const unitsPerCase = parseOcrNumber(item?.units_per_case);
    const qtyUnits = parseOcrNumber(item?.qty_units ?? item?.qty ?? item?.quantity);

    const suspiciousCaseData =
      Number.isFinite(qtyCases) &&
      qtyCases > 0 &&
      Number.isFinite(unitsPerCase) &&
      unitsPerCase > 0 &&
      (
        unitsPerCase < inferredPackSize * 0.4 ||
        (Number.isFinite(qtyUnits) && qtyUnits > 0 && qtyUnits < inferredPackSize * 0.5)
      );

    const missingOrTinyQty =
      (!Number.isFinite(qtyUnits) || qtyUnits <= 0 || qtyUnits < inferredPackSize * 0.5) &&
      inferredPackSize > 1;

    if (!suspiciousCaseData && !missingOrTinyQty) return item;

    // Common table-parser shape: qty_units carries "case count" (e.g. `2 Çuval`) while `unit`
    // is weight (`kg`) and pack size comes from the name (`25 KG`). In that situation, do not
    // collapse to a single case; reinterpret qty_units as qty_cases.
    if (unit === "kg" || unit === "lt") {
      const roundedQty = Number.isFinite(qtyUnits) ? Math.round(qtyUnits) : null;
      const qtyLooksInteger =
        Number.isFinite(qtyUnits) &&
        qtyUnits > 0 &&
        qtyUnits <= 30 &&
        Number.isFinite(roundedQty) &&
        Math.abs(qtyUnits - roundedQty) <= 0.05;
      const qtyIsLikelyCases =
        qtyLooksInteger &&
        // If pack is 25kg and qty is 2, qty is clearly not "kg".
        qtyUnits < inferredPackSize * 0.5;
      if (qtyIsLikelyCases) {
        const caseQty = Math.max(1, roundedQty);
        return {
          ...item,
          qty_cases: caseQty,
          units_per_case: inferredPackSize,
          qty_units: Number((caseQty * inferredPackSize).toFixed(3)),
          unit_meta: "case",
        };
      }
    }

    return {
      ...item,
      qty_cases: 1,
      units_per_case: inferredPackSize,
      qty_units: inferredPackSize,
      unit_meta: "case",
    };
  });
};

const getReceiptOrderLineIndex = (item, rawLines = []) => {
  if (!item || !Array.isArray(rawLines) || rawLines.length === 0) return null;
  const nameKey = normalizeTextKey(item?.name || "");
  if (!nameKey) return null;
  const tokens = nameKey
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 8);
  if (!tokens.length) return null;

  const targetTotal = parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total);
  const totalTolerance =
    Number.isFinite(targetTotal) && targetTotal > 0
      ? Math.max(0.5, targetTotal * 0.015)
      : 0;
  const minTokenHits = tokens.length >= 3 ? 2 : 1;

  let bestIndex = null;
  let bestScore = -1;

  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const line = String(rawLines[idx] || "");
    const lineKey = normalizeTextKey(line);
    if (!lineKey) continue;

    const tokenHits = tokens.reduce(
      (count, token) => (lineKey.includes(token) ? count + 1 : count),
      0
    );
    const hasStrongTokenMatch = tokenHits >= minTokenHits;

    let hasTotalMatch = false;
    if (totalTolerance > 0 && tokenHits > 0) {
      const numbers = extractNumberTokens(line)
        .map((entry) => entry.value)
        .filter((value) => Number.isFinite(value));
      hasTotalMatch = numbers.some(
        (value) => Math.abs(value - targetTotal) <= totalTolerance
      );
    }

    if (!hasStrongTokenMatch && !hasTotalMatch) continue;

    const score = (tokenHits * 5) + (hasTotalMatch ? 8 : 0);
    if (
      score > bestScore ||
      (score === bestScore && (bestIndex === null || idx < bestIndex))
    ) {
      bestScore = score;
      bestIndex = idx;
    }
  }

  return bestIndex;
};

const orderItemsByReceiptLines = (items, rawLines = []) => {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items : [];
  if (!Array.isArray(rawLines) || rawLines.length === 0) return items;

  return items
    .map((item, originalIndex) => ({
      item,
      originalIndex,
      lineIndex: getReceiptOrderLineIndex(item, rawLines),
    }))
    .sort((a, b) => {
      const aHasLine = Number.isInteger(a.lineIndex);
      const bHasLine = Number.isInteger(b.lineIndex);
      if (aHasLine && bHasLine) {
        if (a.lineIndex !== b.lineIndex) return a.lineIndex - b.lineIndex;
        return a.originalIndex - b.originalIndex;
      }
      if (aHasLine) return -1;
      if (bHasLine) return 1;
      return a.originalIndex - b.originalIndex;
    })
    .map((entry) => entry.item);
};

const scoreParsedItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return -100000;
  const blocked = [
    "fatura",
    "musteri",
    "iban",
    "banka",
    "vergi",
    "odeme",
    "toplam",
    "kdv",
  ];
  return items.reduce((score, item) => {
    const name = String(item?.name || "");
    const key = normalizeTextKey(name);
    const letters = (key.match(/[a-z]/g) || []).length;
    const words = key.split(" ").filter(Boolean);
    const longWords = words.filter((w) => w.length >= 4).length;
    const total = parseOcrNumber(item?.line_total_inc_vat);
    const qty = parseOcrNumber(item?.qty_units ?? item?.qty_cases);
    const qc = parseOcrNumber(item?.qty_cases);
    const upc = parseOcrNumber(item?.units_per_case);
    const vat = parseOcrNumber(item?.vat_rate);
    const hasCode = Boolean(String(item?.code || "").trim());
    const looksCasePackedName = /\b(koli|kutu|pet|dys|remix|sugar|cola|damla|seft|cczs)\b/.test(key);
    let next = score + 100 + letters + (longWords * 4);
    if (containsAny(key, blocked)) next -= 80;
    if (Number.isFinite(total) && total > 0) next += 12;
    if (Number.isFinite(qty) && qty > 0) next += 6;
    if (Number.isFinite(vat) && vat >= 0 && vat <= 30) next += 4;
    if (Number.isFinite(vat) && vat > 35) next -= 8;
    if (hasCode) next += 12;
    if (Number.isFinite(qc) && qc > 1) next += 18;
    if (Number.isFinite(upc) && upc > 1) next += 12;
    if (
      looksCasePackedName &&
      (!Number.isFinite(qc) || qc <= 1) &&
      (!Number.isFinite(upc) || upc <= 1)
    ) {
      next -= 18;
    }
    return next;
  }, 0);
};

const findCodeCandidate = (line, qtyIndex = -1) => {
  const text = String(line || "");
  const regex = /\b\d{5,8}\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const idx = match.index ?? -1;
    if (idx < 0 || idx > 28) continue;
    if (qtyIndex >= 0 && idx > qtyIndex) continue;
    const prev = idx > 0 ? text[idx - 1] : "";
    const next = text[idx + match[0].length] || "";
    // Skip values that are likely part of decimals/thousand groups.
    if (/[.,]/.test(prev) || /[.,]/.test(next)) continue;
    return match;
  }
  return null;
};

const extractProductName = (line, codeMatch, qtyIndex) => {
  let working = String(line || "").replace(/^\s*\d+\s+/, "");
  let start = 0;
  if (
    codeMatch &&
    codeMatch.index !== undefined &&
    codeMatch.index >= 0 &&
    codeMatch.index < 28 &&
    (qtyIndex < 0 || codeMatch.index < qtyIndex)
  ) {
    start = codeMatch.index + codeMatch[0].length;
  }
  let end = qtyIndex > start ? qtyIndex : working.length;
  let name = normalizeSpaces(working.slice(start, end));
  if (!name) {
    name = normalizeSpaces(working.replace(/[0-9].*$/, ""));
  }
  name = name.replace(/^[\-•*]+\s*/, "").trim();
  const letters = (name.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
  if (letters < 2) return "";
  return name;
};

const ORDER_UI_NON_ITEM_TOKENS = [
  "siparis no",
  "siparisindeki urunler",
  "odeme bilgileri",
  "kapida nakit odeme",
  "siparis ozeti",
  "sepet tutari",
  "teslimat ucreti",
  "poset ucreti",
  "kapida nakit",
  "odenen tutar",
  "mesafeli satis sozlesmesi",
];

const isOrderUiNonItemLine = (lineKey) => {
  if (!lineKey) return false;
  return ORDER_UI_NON_ITEM_TOKENS.some((token) => lineKey.includes(token));
};

const parseAdetMultiplication = (line) => {
  const text = normalizeSpaces(String(line || ""));
  if (!text) return null;

  // Common OCR variants:
  // "18 Adet x 55.0 ₺", "3Adetx0.25", "3 Adet 0.25"
  const regex =
    /(?:^|[^A-Za-zÇĞİÖŞÜçğıöşü0-9])(\d+(?:[.,]\d+)?)\s*adet[a-zçğıöşüıi1l]*\s*(?:[x×]\s*)?(\d+(?:[.,]\d+)?)/gi;
  const candidates = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const qty = parseOcrNumber(match[1]);
    const unitPrice = parseOcrNumber(match[2]);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;
    const roundedUnitPrice = Number(unitPrice.toFixed(2));
    candidates.push({
      qty,
      unitPrice: roundedUnitPrice,
      lineTotal: Number((qty * roundedUnitPrice).toFixed(2)),
      index: match.index ?? 0,
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.index - b.index);
  const best = candidates[candidates.length - 1];
  return {
    qty: best.qty,
    unitPrice: best.unitPrice,
    lineTotal: best.lineTotal,
  };
};

const parseAdetMultiplicationFromLines = (lines) => {
  const list = Array.isArray(lines) ? lines : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const parsed = parseAdetMultiplication(list[i]);
    if (parsed) return parsed;
  }
  return null;
};

const normalizeRowName = (value) =>
  normalizeSpaces(String(value || "")).replace(/^[\-•*]+\s*/, "").trim();

const looksLikeProductTitleLine = ({ line, lineKey, hasPriceNumber, qty, unitToken }) => {
  if (!line || !lineKey) return false;
  if (isOrderUiNonItemLine(lineKey)) return false;
  if (hasPriceNumber) return false;
  if (!/^[\s\-•*]*[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) return false;
  const letters = (lineKey.match(/[a-z]/g) || []).length;
  if (letters < 3) return false;
  const normalizedUnit = normalizeTextKey(unitToken || "");
  const isPackSizeToken = /^(kg|g|gr|lt|l|ml)$/.test(normalizedUnit);
  if (Number.isFinite(qty) && qty > 0 && !isPackSizeToken) return false;
  return true;
};

const parseTotalsFromLines = (lines) => {
  let subtotalCandidates = [];
  let vatCandidates = [];
  let grandCandidates = [];
  let discountCandidates = [];
  let taxIncluded = false;

  lines.forEach((line) => {
    const key = normalizeTextKey(line);
    if (!key || isHeaderLine(key)) return;
    if (key.includes("kdv dahil")) {
      taxIncluded = true;
    }

    const currencyMatches = [
      ...String(line || "").matchAll(
        /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|₺|\*)/gi
      ),
    ]
      .map((m) => parseOcrNumber(m?.[1]))
      .filter((n) => Number.isFinite(n) && n > 0);
    const fallbackNumbers = extractNumberTokens(line)
      .map((t) => t.value)
      .filter((n) => Number.isFinite(n) && n > 0);
    const monetaryValues = currencyMatches.length ? currencyMatches : fallbackNumbers;
    if (!monetaryValues.length) return;
    const lineValue = Math.max(...monetaryValues);

    if (
      (key.includes("mal hizmet toplam") ||
        key.includes("mal/hizmet toplam") ||
        key.includes("ara toplam")) &&
      !key.includes("kdv")
    ) {
      subtotalCandidates.push(lineValue);
    }

    if (
      key.includes("topkdv") ||
      (key.includes("kdv") && (key.includes("hesaplanan") || key.includes("toplam")))
    ) {
      vatCandidates.push(lineValue);
    }

    if (
      key.includes("vergiler dahil") ||
      key.includes("odenecek") ||
      key.includes("genel toplam") ||
      key.includes("fatura toplam") ||
      key.includes("odenecek tutar") ||
      key.includes("toplam tutar")
    ) {
      grandCandidates.push(lineValue);
    }

    if (key.includes("toplam iskonto") || key.includes("iskonto toplam") || key.includes("discount")) {
      discountCandidates.push(lineValue);
    }
  });

  return {
    subtotal_ex_vat: subtotalCandidates.length ? Math.max(...subtotalCandidates) : null,
    vat_total: vatCandidates.length ? Math.max(...vatCandidates) : null,
    grand_total: grandCandidates.length ? Math.max(...grandCandidates) : null,
    discount_total: discountCandidates.length ? Math.max(...discountCandidates) : null,
    tax_included: taxIncluded,
  };
};

const normalizeA101MeasureUnit = (token) => {
  const key = normalizeTextKey(token || "");
  if (!key) return null;
  if (key === "c") return "g"; // common OCR confusion in "200 C%01"
  if (/^kg|^kilo|^kilogram/.test(key)) return "kg";
  if (/^gr|^gram|^g/.test(key)) return "g";
  if (/^ml|^mili|^mill/.test(key)) return "ml";
  if (/^lt|^liter|^litre|^l/.test(key)) return "lt";
  return null;
};

const parseA101WeightedQty = (value) => {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  if (!raw) return null;
  if (/[.,]\d{3}$/.test(raw)) {
    const asDecimal = Number(raw.replace(",", "."));
    if (Number.isFinite(asDecimal) && asDecimal > 0 && asDecimal < 50) {
      return asDecimal;
    }
  }
  return parseOcrNumber(raw);
};

const sanitizeA101ItemName = (value) => {
  let name = normalizeRowName(value || "");
  name = name
    .replace(/%\s*[0-9oiil]{1,3}/gi, " ")
    .replace(/\b(?:KENX?O?1|G0?1|C0?1)\b/gi, " ")
    .replace(/\b(?:BE|BK|CE|DR|AE|NL|EE)\b$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name;
};

const parseA101ReceiptItems = (lines) => {
  const rows = Array.isArray(lines) ? lines : [];
  const expandedRows = [];
  for (const rawLine of rows) {
    const line = normalizeSpaces(rawLine);
    if (!line) continue;
    const splitIdx = line.search(/\bAL[^\s]{0,6}VER[^\s]{0,6}\s+POSET[İI1L]\b/i);
    if (
      splitIdx > 0 &&
      /%\s*[0-9oiil]{1,3}/i.test(line.slice(0, splitIdx)) &&
      /\d+(?:[.,]\d+)?/.test(line.slice(0, splitIdx))
    ) {
      let firstPart = line.slice(0, splitIdx).trim();
      if (!/(?:\*|\+)\s*\d/.test(firstPart)) {
        const nums = [...firstPart.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/g)];
        if (nums.length) {
          const last = nums[nums.length - 1];
          const idx = last.index ?? -1;
          if (idx >= 0) firstPart = `${firstPart.slice(0, idx)}*${firstPart.slice(idx)}`;
        }
      }
      expandedRows.push(firstPart);
      expandedRows.push(line.slice(splitIdx).trim());
    } else {
      expandedRows.push(line);
    }
  }

  const items = [];
  let inItems = false;
  let lastItem = null;
  let pendingWeighted = null;

  for (const line of expandedRows) {
    const key = normalizeTextKey(line);
    const lineForNumbers = String(line || "").replace(/([.,])\s+(?=\d)/g, "$1");

    if (
      key.includes("ara toplam") ||
      key.includes("mal hizmet toplam") ||
      key.includes("odenecek tutar") ||
      key.includes("kredi karti")
    ) {
      break;
    }

    const looksLikeItemLine =
      /[%][0-9oiil]{1,3}/i.test(line) && /[\*\+]\s*\d/.test(line);
    if (looksLikeItemLine) inItems = true;
    if (!inItems) continue;

    const weightedMatch = lineForNumbers.match(
      /^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*tl\s*\/\s*(kg|g|gr|gram|lt|l|ml)\b/i
    );
    if (weightedMatch) {
      const qty = parseA101WeightedQty(weightedMatch[1]);
      const unitPrice = parseOcrNumber(weightedMatch[2]);
      const unit = normalizeA101MeasureUnit(weightedMatch[3]);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(unitPrice) && unitPrice > 0 && unit) {
        pendingWeighted = {
          qty,
          unit,
          unitPrice: Number(unitPrice.toFixed(2)),
          weightedTotal: Number((qty * unitPrice).toFixed(2)),
        };
      }
      continue;
    }

    const totalMatch = lineForNumbers.match(
      /(?:\*|\+)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/i
    );
    let lineTotal = totalMatch ? parseOcrNumber(totalMatch[1]) : null;
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
      // OCR sometimes drops the '*' marker in lines like: SOGAN %01 26,13
      const vatMatchLocal = lineForNumbers.match(/%\s*([0-9oiil]{1,3}(?:[.,]\d+)?)/i);
      const vatLocal = vatMatchLocal ? parseOcrNumber(vatMatchLocal[1]) : null;
      const numericCandidates = [...lineForNumbers.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/g)]
        .map((m) => parseOcrNumber(m?.[1]))
        .filter((n) => Number.isFinite(n) && n > 0);
      const fallbackTotal = numericCandidates.find(
        (n) => !(Number.isFinite(vatLocal) && Math.abs(n - vatLocal) <= 0.001)
      );
      if (Number.isFinite(fallbackTotal) && fallbackTotal > 0) {
        lineTotal = fallbackTotal;
      }
    }
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;

    const vatMatch = lineForNumbers.match(/%\s*([0-9oiil]{1,3}(?:[.,]\d+)?)/i);
    const vatRaw = vatMatch ? parseOcrNumber(vatMatch[1]) : null;
    const vatRate = Number.isFinite(vatRaw) && vatRaw >= 0 && vatRaw <= 30 ? vatRaw : null;

    const cutCandidates = [
      line.search(/%\s*[0-9oiil]/i),
      line.search(/(?:\*|\+)\s*\d/),
    ].filter((idx) => idx >= 0);
    const cutAt = cutCandidates.length ? Math.min(...cutCandidates) : line.length;
    let namePart = normalizeRowName(line.slice(0, cutAt));
    if (!namePart) continue;

    let qtyUnits = null;
    let unit = "piece";
    const measureRegex = /\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gram|lt|l|ml|c)(?:0?1)?\b/i;
    const measureMatch = namePart.match(measureRegex);
    if (measureMatch) {
      const parsedQty = parseOcrNumber(measureMatch[1]);
      const parsedUnit = normalizeA101MeasureUnit(measureMatch[2]);
      if (Number.isFinite(parsedQty) && parsedQty > 0 && parsedUnit) {
        qtyUnits = parsedQty;
        unit = parsedUnit;
        namePart = normalizeRowName(
          `${namePart.slice(0, measureMatch.index)} ${namePart.slice((measureMatch.index || 0) + measureMatch[0].length)}`
        );
      }
    }

    if (!qtyUnits || qtyUnits <= 0) qtyUnits = 1;
    const packMatch = namePart.match(/\b(\d{1,3})\s*li\b/i);
    const packSize = packMatch ? parseOcrNumber(packMatch[1]) : null;
    namePart = sanitizeA101ItemName(namePart);
    const nameKey = normalizeTextKey(namePart);
    const letters = (namePart.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    if (letters < 3) continue;
    if (isTotalsLine(normalizeTextKey(namePart))) continue;
    const forcedVatRate =
      nameKey.includes("alisveris poseti") ||
      nameKey.includes("peynir surulebilir beyaz") ||
      nameKey.includes("baharat cubuk tarcin")
        ? 1
        : vatRate;

    const weightedApplies =
      !!pendingWeighted &&
      Math.abs(pendingWeighted.weightedTotal - lineTotal) <= Math.max(0.35, lineTotal * 0.05);
    if (weightedApplies) {
      qtyUnits = pendingWeighted.qty;
      unit = pendingWeighted.unit;
    }

    const finalQtyUnits =
      unit === "piece" && Number.isFinite(packSize) && packSize > 1
        ? packSize
        : qtyUnits;
    const finalQtyCases = weightedApplies
      ? 1
      : unit === "piece" && Number.isFinite(packSize) && packSize > 1
        ? 1
        : null;
    const finalUnitsPerCase =
      weightedApplies
        ? null
        : unit === "piece" && Number.isFinite(packSize) && packSize > 1
          ? packSize
          : null;

    const item = {
      code: null,
      name: namePart,
      qty_cases: finalQtyCases,
      units_per_case: finalUnitsPerCase,
      qty_units: finalQtyUnits,
      unit,
      unit_price_ex_vat:
        weightedApplies
          ? pendingWeighted.unitPrice
          : Number.isFinite(finalQtyUnits) &&
              finalQtyUnits > 0
            ? Number(
                (
                  lineTotal /
                  finalQtyUnits
                ).toFixed(2)
              )
            : null,
      discount_rate: null,
      vat_rate: forcedVatRate,
      line_total_inc_vat: Number(lineTotal.toFixed(2)),
    };
    items.push(item);
    lastItem = item;
    if (weightedApplies) {
      pendingWeighted = null;
    }
  }

  return items;
};

const parseDirectTableRow = (line, options = {}) => {
  const { allowNoRowPrefix = false } = options;
  const raw = String(line || "");
  const rowPrefix = raw.match(/^\s*[\[(]?\d{1,3}(?:[)\].-])?\s*/);
  const hasRowPrefix = Boolean(rowPrefix && rowPrefix[0]?.trim());
  if (!hasRowPrefix && !allowNoRowPrefix) return null;

  const working = normalizeSpaces(hasRowPrefix ? raw.slice(rowPrefix[0].length) : raw);
  if (!working) return null;
  if (!hasRowPrefix) {
    // OCR can lose "Sira No". In loose mode, accept only rows that clearly contain monetary data.
    const hasCurrencyMarker = /(?:tl|₺)/i.test(working);
    const moneyTokens = extractNumberTokens(working).filter((token) => Number.isFinite(token.value) && token.value > 0);
    if (!hasCurrencyMarker || moneyTokens.length < 2) return null;
  }

  const numbers = extractNumberTokens(working).filter((token) => Number.isFinite(token.value));
  if (!numbers.length) return null;

  const { qty, unitToken, index: qtyIndex } = parseQtyAndUnit(working);

  const codeMatch = findCodeCandidate(working, qtyIndex);
  const code = codeMatch ? codeMatch[0] : null;
  const packMatch = working.match(/\b(\d+)\s*[xX*]\s*(\d+)\b/);
  const unitsPerCase = packMatch ? parseOcrNumber(packMatch[2]) : null;

  const lineTotalWithTl = [...working.matchAll(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|₺)/gi)];
  const lineTotal =
    lineTotalWithTl.length > 0
      ? parseOcrNumber(lineTotalWithTl[lineTotalWithTl.length - 1]?.[1])
      : numbers[numbers.length - 1]?.value;
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) return null;

  const name = extractProductName(working, codeMatch, qtyIndex);
  if (!name || (name.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length < 3) return null;

  const percentValues = extractPercentTokens(working)
    .map((token) => token.value)
    .filter((value) => Number.isFinite(value));
  const vatRateCandidate =
    percentValues.find((value) => value >= 0 && value <= 30) ||
    (percentValues.length ? percentValues[percentValues.length - 1] : null);

  let parsedQty = Number.isFinite(qty) && qty > 0 ? qty : null;
  if (!parsedQty) {
    parsedQty = inferQtyFromLinePrices(working);
  }
  if (!Number.isFinite(parsedQty) || parsedQty <= 0) return null;

  const inferredNameUnit = inferUnitFromName(name);
  let resolvedUnit = resolveUnitMeta(unitToken, unitsPerCase);
  if (!resolvedUnit && inferredNameUnit) {
    resolvedUnit = inferredNameUnit;
  }
  const inferredUnitsPerCase =
    resolvedUnit === "case" ? (unitsPerCase || inferUnitsPerCaseFromName(name)) : unitsPerCase;
  const isCaseRow = resolvedUnit === "case";
  const unit = isCaseRow && inferredNameUnit ? inferredNameUnit : resolvedUnit;
  const qtyCases = isCaseRow ? parsedQty : null;
  const qtyUnits = isCaseRow ? (inferredUnitsPerCase ? parsedQty * inferredUnitsPerCase : null) : parsedQty;

  return {
    code,
    name,
    qty_cases: qtyCases,
    units_per_case: inferredUnitsPerCase ?? null,
    qty_units: qtyUnits,
    unit,
    unit_price_ex_vat: null,
    discount_rate: null,
    vat_rate: vatRateCandidate,
    line_total_inc_vat: lineTotal,
  };
};

const parseSupplierInvoiceText = (text) => {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeSpaces)
    .filter(Boolean);

  const merchantLine =
    lines.find((line) => {
      const key = normalizeTextKey(line);
      if (!key || !/[a-z]/.test(key)) return false;
      if (isBankLine(key, line) || isOrderUiNonItemLine(key)) return false;
      if (key.includes("e arsiv fatura")) return false;
      if (parseAdetMultiplication(line)) return false;
      if (/^[\s\-•*]*[A-Za-zÇĞİÖŞÜçğıöşü].*\b(kg|g|gr|lt|l|ml)\b/i.test(line)) return false;
      return true;
    }) || null;

  const date = detectInvoiceDate(text || "");
  const invoiceNo = detectInvoiceNumber(text || "");
  const totals = parseTotalsFromLines(lines);
  const looksLikeA101 =
    lines.some((line) => normalizeTextKey(line).includes("a101")) &&
    lines.some((line) => normalizeTextKey(line).includes("e arsiv fatura"));
  if (looksLikeA101) {
    const a101Items = parseA101ReceiptItems(lines);
    if (a101Items.length >= 4) {
      const merchantLine =
        lines.find((line) => normalizeTextKey(line).includes("a101")) || null;
      return {
        merchant: merchantLine,
        date,
        invoice_no: invoiceNo || null,
        currency: "TRY",
        items: a101Items,
        totals,
        rejectedLines: [],
      };
    }
  }
  const items = [];
  const rejectedLines = [];

  const tableStart = findTableStartIndex(lines);
  const tableEnd = findTableEndIndex(lines, tableStart);
  const tableLines = lines.slice(tableStart, tableEnd);
  const rowAnchorRegex = /^\s*[\[(]?\d{1,3}[)\].-]?\s+\S+/;
  const hasStructuredHeader = lines.some((line) => {
    const key = normalizeTextKey(line);
    return key.includes("mal hizmet") && key.includes("miktar");
  });
  const rowAnchorsInTable = tableLines.filter((line) => rowAnchorRegex.test(line)).length;
  const strictRowAnchoredMode =
    rowAnchorsInTable >= 2 || (hasStructuredHeader && rowAnchorsInTable >= 1);

  let pending = null;

  const flushPending = (reason) => {
    if (pending && pending.rawLines.length > 0) {
      rejectedLines.push({
        line: pending.rawLines.join(" | "),
        reason: reason || "Incomplete row",
      });
    }
    pending = null;
  };

  tableLines.forEach((rawLine) => {
    const line = normalizeSpaces(rawLine);
    if (!line) return;
    const lineKey = normalizeTextKey(line);
    const hasRowPrefix = rowAnchorRegex.test(line);
    const likelyLooseRow = !hasRowPrefix && isLikelyLooseTableItemLine(line);

    if (isOrderUiNonItemLine(lineKey)) {
      flushPending("Order summary/meta");
      return;
    }

    if (isHeaderLine(lineKey) || isTotalsLine(lineKey)) {
      flushPending("Header/Totals");
      return;
    }

    if (isBankLine(lineKey, line)) {
      rejectedLines.push({ line, reason: "Blocked keyword" });
      return;
    }

    if (strictRowAnchoredMode && !pending && !hasRowPrefix && !likelyLooseRow) {
      rejectedLines.push({ line, reason: "No row anchor" });
      return;
    }

    const directRow = parseDirectTableRow(line, {
      allowNoRowPrefix: strictRowAnchoredMode && likelyLooseRow,
    });
    if (directRow) {
      items.push(directRow);
      pending = null;
      return;
    }

    const rowPrefix = line.match(/^\s*[\[(]?\d{1,3}(?:[)\].-])?\s*/);
    const hasPendingRowPrefix = Boolean(rowPrefix && rowPrefix[0]?.trim());
    const working = hasPendingRowPrefix ? line.slice(rowPrefix[0].length) : line;
    const numberTokens = extractNumberTokens(working);
    const percentTokens = extractPercentTokens(working);
    const { qty, unitToken, index: qtyIndex } = parseQtyAndUnit(working);
    const codeMatch = findCodeCandidate(working, qtyIndex);
    const code = codeMatch ? codeMatch[0] : null;
    const unitTokenLower = String(unitToken || "").toLowerCase();
    const packMatch = working.match(/\b(\d+)\s*[xX]\s*(\d+)\b/);
    const unitsPerCase = packMatch ? parseOcrNumber(packMatch[2]) : null;
    const looksLikeRowStart =
      /^\s*["'`~_*•-]*\s*(?:\d{1,3}(?:[.)-])?\s*)?[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line);
    const weightedQtyLineMatch = working.match(
      /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*tl\s*\/\s*(kg|g|gr|gram|lt|l|ml)/i
    );

    const letters = (lineKey.match(/[a-z]/g) || []).length;
    const digits = (lineKey.match(/\d/g) || []).length;
    const hasPriceNumber = numberTokens.some(
      (t) => t.value !== null && t.value >= 1 && (/[.,]/.test(t.raw) || t.raw.length >= 4)
    );
    const titleLine = looksLikeProductTitleLine({
      line,
      lineKey,
      hasPriceNumber,
      qty,
      unitToken,
    });
    const looksLikeStandaloneName =
      /^[\s\-•*]*[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line) &&
      letters >= 3 &&
      !hasPriceNumber &&
      !code &&
      !qty;
    if (letters > digits * 3 && !hasPriceNumber && !looksLikeRowStart && !looksLikeStandaloneName && !titleLine) {
      rejectedLines.push({ line, reason: "Mostly letters" });
      return;
    }

    const canStartPending = strictRowAnchoredMode
      ? (hasRowPrefix || likelyLooseRow || code || qty || titleLine)
      : (code || qty || looksLikeRowStart || looksLikeStandaloneName || titleLine);
    if (!pending && canStartPending) {
      const firstName = extractProductName(working, codeMatch, qtyIndex);
      pending = {
        code,
        nameParts: firstName ? [normalizeRowName(firstName)] : [],
        qty: titleLine ? null : qty,
        unitToken: titleLine ? "" : unitToken,
        unitsPerCase,
        rawLines: [line],
        qtyIndex: titleLine ? -1 : qtyIndex,
        numberTokens,
        percentTokens,
      };
    } else if (pending) {
      pending.rawLines.push(line);
      if (!pending.nameParts.length) {
        const nextName =
          extractProductName(working, codeMatch, qtyIndex) ||
          normalizeSpaces(working.replace(/[0-9].*$/, "")).trim();
        if (nextName) pending.nameParts.push(normalizeRowName(nextName));
      } else if (!qty && !code && !weightedQtyLineMatch) {
        pending.nameParts.push(normalizeRowName(working));
      }
      if (!pending.qty && qty) {
        pending.qty = qty;
        pending.unitToken = unitToken;
        pending.qtyIndex = qtyIndex;
      }
      if (
        (!pending.qty || pending.qty <= 0) &&
        weightedQtyLineMatch &&
        Number.isFinite(parseOcrNumber(weightedQtyLineMatch[1]))
      ) {
        pending.qty = parseOcrNumber(weightedQtyLineMatch[1]);
        pending.unitToken = weightedQtyLineMatch[3] || pending.unitToken;
        pending.qtyIndex = -1;
      }
      if (!pending.unitsPerCase && unitsPerCase) {
        pending.unitsPerCase = unitsPerCase;
      }
      if (numberTokens.length > 0) {
        pending.numberTokens = pending.numberTokens.concat(numberTokens);
      }
      if (percentTokens.length > 0) {
        pending.percentTokens = pending.percentTokens.concat(percentTokens);
      }
    } else {
      rejectedLines.push({ line, reason: "No row anchor" });
      return;
    }

    const explicitAdetPrice = parseAdetMultiplicationFromLines(pending?.rawLines || []) ||
      parseAdetMultiplication(working);
    const starredTotalsPre = (pending?.rawLines || [])
      .flatMap((entry) =>
        [...String(entry || "").matchAll(/\*\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/gi)]
          .map((m) => parseOcrNumber(m?.[1]))
      )
      .filter((n) => Number.isFinite(n) && n > 0);
    if (
      pending &&
      (!Number.isFinite(pending.qty) || pending.qty <= 0) &&
      explicitAdetPrice &&
      Number.isFinite(explicitAdetPrice.qty) &&
      explicitAdetPrice.qty > 0
    ) {
      pending.qty = explicitAdetPrice.qty;
      if (!pending.unitToken) pending.unitToken = "adet";
    }
    if (
      pending &&
      (!Number.isFinite(pending.qty) || pending.qty <= 0) &&
      starredTotalsPre.length > 0
    ) {
      // Some receipt rows have only product + VAT + starred line total (no explicit quantity token).
      // Treat as single piece row so it is not dropped.
      pending.qty = 1;
      if (!pending.unitToken) pending.unitToken = "adet";
      pending.qtyIndex = -1;
    }
    if (pending && (!Number.isFinite(pending.qty) || pending.qty <= 0)) {
      const qtyFromPrices = inferQtyFromLinePrices((pending.rawLines || []).join(" "));
      if (Number.isFinite(qtyFromPrices) && qtyFromPrices > 0) {
        pending.qty = qtyFromPrices;
        if (!pending.unitToken && inferUnitsPerCaseFromName(pending.nameParts.join(" "))) {
          pending.unitToken = "koli";
        }
      }
    }

    if (!pending || !pending.qty) return;

    const numbersAfterQty = (pending.numberTokens || []).filter(
      (t) => t.value !== null && t.index > (pending.qtyIndex ?? -1)
    );

    const percentValues = (pending.percentTokens || [])
      .map((t) => t.value)
      .filter((v) => Number.isFinite(v));

    const monetaryCandidates = numbersAfterQty.filter(
      (t) => !percentValues.some((pct) => Math.abs(pct - t.value) < 0.0001)
    );

    const hasVatRate = percentValues.some((v) => v !== null && v <= 30);
    const hasLineTotal = monetaryCandidates.length > 0;
    if (!hasLineTotal && !hasVatRate) {
      return;
    }

    const lineTotalWithTl = [
      ...working.matchAll(
        /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(?:tl|₺)/gi
      ),
    ];
    const starredTotals = starredTotalsPre;
    const lineTotal =
      (explicitAdetPrice && Number.isFinite(explicitAdetPrice.lineTotal)
        ? explicitAdetPrice.lineTotal
        : null) ||
      (starredTotals.length ? starredTotals[starredTotals.length - 1] : null) ||
      (lineTotalWithTl.length
        ? parseOcrNumber(lineTotalWithTl[lineTotalWithTl.length - 1]?.[1])
        : null) ||
      (monetaryCandidates.length
        ? monetaryCandidates[monetaryCandidates.length - 1].value
        : null);

    if (!lineTotal || !Number.isFinite(lineTotal)) {
      rejectedLines.push({ line, reason: "Missing total" });
      return;
    }

    const name = normalizeSpaces(
      pending.nameParts.join(" ").replace(/\s+/g, " ")
    );
    let cleanName = normalizeRowName(name || extractProductName(working, codeMatch, qtyIndex));
    if (!cleanName) {
      rejectedLines.push({ line, reason: "Missing name" });
      flushPending("Missing name");
      return;
    }
    let nameLetters = (cleanName.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    if (nameLetters < 3) {
      const fallbackName = normalizeSpaces(working.replace(/[0-9].*$/, ""));
      const fallbackLetters = (fallbackName.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
      if (fallbackLetters >= 3) {
        cleanName = normalizeRowName(fallbackName);
        nameLetters = fallbackLetters;
      }
    }
    if (nameLetters < 3) {
      rejectedLines.push({ line, reason: "Name too short" });
      flushPending("Name too short");
      return;
    }

    const inferredNameUnit = inferUnitFromName(cleanName);
    const resolvedUnit = resolveUnitMeta(unitTokenLower || inferredNameUnit, pending.unitsPerCase);
    const inferredUnitsPerCase =
      resolvedUnit === "case"
        ? (pending.unitsPerCase || inferUnitsPerCaseFromName(cleanName))
        : pending.unitsPerCase;
    const unit = resolvedUnit === "case" && inferredNameUnit ? inferredNameUnit : resolvedUnit;
    let qtyCases = null;
    let qtyUnits = null;
    if (resolvedUnit === "case") {
      qtyCases = pending.qty;
      qtyUnits = inferredUnitsPerCase ? pending.qty * inferredUnitsPerCase : null;
    } else {
      qtyUnits = pending.qty;
    }

    items.push({
      code: pending.code || null,
      name: cleanName,
      qty_cases: qtyCases,
      units_per_case: inferredUnitsPerCase ?? null,
      qty_units: qtyUnits,
      unit,
      unit_price_ex_vat:
        explicitAdetPrice && Number.isFinite(explicitAdetPrice.unitPrice)
          ? explicitAdetPrice.unitPrice
          : null,
      discount_rate: null,
      vat_rate: percentValues.length ? percentValues[percentValues.length - 1] : null,
      line_total_inc_vat: lineTotal,
    });

    pending = null;
  });

  if (pending) {
    flushPending("Incomplete row");
  }

  const dedupedItems = [];
  const seen = new Set();
  for (const item of items) {
    const nameKey = normalizeTextKey(item?.name || "");
    const totalKey = Number(item?.line_total_inc_vat || 0).toFixed(2);
    const qtyKey = Number(item?.qty_units || item?.qty_cases || 0).toFixed(3);
    const key = `${nameKey}|${totalKey}|${qtyKey}`;
    if (!nameKey || seen.has(key)) continue;
    seen.add(key);
    dedupedItems.push(item);
  }

  const itemGrandTotal = dedupedItems.reduce((acc, item) => acc + (Number(item?.line_total_inc_vat || 0) || 0), 0);
  const maxItemTotal = dedupedItems.reduce(
    (acc, item) => Math.max(acc, Number(item?.line_total_inc_vat || 0) || 0),
    0
  );
  if (
    !Number.isFinite(totals.grand_total) ||
    totals.grand_total < maxItemTotal ||
    (itemGrandTotal > 0 && totals.grand_total < itemGrandTotal * 0.7) ||
    (itemGrandTotal > 0 && totals.grand_total > itemGrandTotal * 10)
  ) {
    totals.grand_total = itemGrandTotal > 0 ? Number(itemGrandTotal.toFixed(2)) : totals.grand_total;
  }

  return {
    merchant: merchantLine,
    date,
    invoice_no: invoiceNo || null,
    currency: "TRY",
    items: dedupedItems,
    totals,
    rejectedLines,
  };
};
const API_URL = import.meta.env.VITE_API_URL || "";
const SUPPLIER_AI_ASSIST_STORAGE_KEY = "beypro_supplier_ai_assist";
const SUPPLIER_AI_THRESHOLD_STORAGE_KEY = "beypro_supplier_ai_threshold";
const DEFAULT_SUPPLIER_AI_THRESHOLD = 0.7;
export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [supplierIngredients, setSupplierIngredients] = useState([]);
const [newTransaction, setNewTransaction] = useState({
  rows: [createEmptyTransactionRow()], // ✅ default one row
  paymentStatus: "Due",
  paymentMethod: "Due",
});

  const BACKEND_URL =
    (
      import.meta.env.VITE_API_URL ||
      (import.meta.env.MODE === "development"
        ? "http://localhost:5000"
        : "https://api.beypro.com")
    )
      .replace(/\/api\/?$/, "")
      .replace(/\/+$/, "");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSupplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);
  const [receiptFileMeta, setReceiptFileMeta] = useState(null);
  const [ocrRawTextOriginal, setOcrRawTextOriginal] = useState("");
  const [ocrRawTextEdited, setOcrRawTextEdited] = useState("");
  const [parsedReceiptOriginal, setParsedReceiptOriginal] = useState(null);
  const [parsedReceiptEdited, setParsedReceiptEdited] = useState(null);
  const [ocrSelectableTokens, setOcrSelectableTokens] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [reviewTab, setReviewTab] = useState("corrections");
  const [trainingOptIn, setTrainingOptIn] = useState(true);
  const [activeTab, setActiveTab] = useState("suppliers");
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    phone: "",
    tax_number: "",
    id_number: "",
    email: "",
    address: "",
    notes: "",
  });
  const [cartHistory, setCartHistory] = useState([]);
  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const [cartItems, setCartItems] = useState([]); // cart items
  const [showCartModal, setShowCartModal] = useState(false); // cart modal visibility
  const [cartId, setCartId] = useState(null);
  const [sending, setSending] = useState(false); // 🔥 control button loading state
  const [scheduledAt, setScheduledAt] = useState("");
  const [autoOrder, setAutoOrder] = useState(false);
  const [repeatDays, setRepeatDays] = useState([]);
  const [repeatType, setRepeatType] = useState("none");
  const [transactionView, setTransactionView] = useState("all");
  const [transactionDateFrom, setTransactionDateFrom] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [transactionDateTo, setTransactionDateTo] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [feedbackEntries, setFeedbackEntries] = useState([]);
  const [feedbackForm, setFeedbackForm] = useState({
    quality: 4,
    packaging: 4,
    punctuality: 4,
    accuracy: 4,
    deliveryTimeDays: "",
    onTime: true,
    complaint: false,
    notes: "",
  });
  const socketRef = useRef();
  const { fetchStock } = useStock();
  const [receiptFile, setReceiptFile] = useState(null);
  const [ocrParsing, setOcrParsing] = useState(false);
  const [, setOcrParseError] = useState("");
  const [invoiceParsePreview, setInvoiceParsePreview] = useState(null);
  const [supplierAiAssistEnabled, setSupplierAiAssistEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(SUPPLIER_AI_ASSIST_STORAGE_KEY);
      if (raw === null) return true;
      return raw === "true";
    } catch {
      return true;
    }
  });
  const [supplierAiThreshold, setSupplierAiThreshold] = useState(() => {
    try {
      const raw = localStorage.getItem(SUPPLIER_AI_THRESHOLD_STORAGE_KEY);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return DEFAULT_SUPPLIER_AI_THRESHOLD;
      return Math.min(0.95, Math.max(0.5, parsed));
    } catch {
      return DEFAULT_SUPPLIER_AI_THRESHOLD;
    }
  });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [latestTransaction, setLatestTransaction] = useState(null);
  const containerRef = useRef(null);
  const { formatCurrency, config } = useCurrency();
  const location = useLocation();
  const openedCartSupplierRef = useRef(null);
  const receiptRowsSyncTimeoutRef = useRef(null);

  useEffect(() => {
    setHeader(prev => ({
      ...prev,
      title: t("Suppliers"),
      subtitle: undefined,
      tableNav: null,
    }));
  }, [setHeader, t]);

  useEffect(() => () => setHeader({}), [setHeader]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SUPPLIER_AI_ASSIST_STORAGE_KEY,
        supplierAiAssistEnabled ? "true" : "false"
      );
    } catch {
      // no-op on storage failures
    }
  }, [supplierAiAssistEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(
        SUPPLIER_AI_THRESHOLD_STORAGE_KEY,
        String(Number(supplierAiThreshold.toFixed(2)))
      );
    } catch {
      // no-op on storage failures
    }
  }, [supplierAiThreshold]);

  useEffect(() => {
    return () => {
      if (receiptRowsSyncTimeoutRef.current) {
        clearTimeout(receiptRowsSyncTimeoutRef.current);
        receiptRowsSyncTimeoutRef.current = null;
      }
    };
  }, []);


useEffect(() => {
  console.log("✅ fetchStock from context is loaded in Supplier.js");
  fetchStock(); // ← actually call it here
}, [fetchStock]); // ✅ include it in dependency array

const [showUp, setShowUp] = useState(false);
	useEffect(() => {
	  const node = containerRef.current;
	  if (!node) return;
	  const onScroll = () => setShowUp(node.scrollTop > 400);
	  node.addEventListener("scroll", onScroll);
	  return () => node.removeEventListener("scroll", onScroll);
	}, []);

	const scrollToId = (id) => {
	  const el = document.getElementById(id);
	  if (!el || !containerRef.current) return;
	  const y = el.offsetTop - 60;
	  containerRef.current.scrollTo({ top: y, behavior: "smooth" });
	};

	useEffect(() => {
	  const params = new URLSearchParams(location.search);
	  const view = params.get("view");
	  const section = params.get("section");
	  const openCartSupplierId = params.get("openCartSupplierId");

	  if (view === "cart") {
	    setActiveTab("cart");
	  }

	  if (view === "suppliers" || section) {
	    setActiveTab("suppliers");
	  }

	  if (section) {
	    requestAnimationFrame(() => scrollToId(section));
	  }

	  if (openCartSupplierId && suppliers.length > 0) {
	    const raw = String(openCartSupplierId).trim();
	    if (openedCartSupplierRef.current !== raw) {
	      openedCartSupplierRef.current = raw;
	      const supplierIdNum = Number(raw);
	      const supplierId = Number.isFinite(supplierIdNum) ? supplierIdNum : raw;
	      openSupplierCart(null, supplierId);
	    }
	  }
	// Intentionally depends on suppliers so the deep-link can open after suppliers load.
	}, [location.search, suppliers]);


  useEffect(() => {
  socketRef.current = socket;

    const handleStockRealtime = () => {
      console.log("📦 Supplier.js: Stock update received");
      fetchStock();
      if (cartId) fetchCartItems(cartId); // ⬅️ NEW: refresh cart if modal is open
    };

    socketRef.current.on("connect", () => {
      console.log("🔌 Socket connected");
    });

    socketRef.current.on("disconnect", (reason) => {
      console.warn("⚠️ Socket disconnected:", reason);
    });

    socketRef.current.on("reconnect_attempt", (attempt) => {
      console.log(`🔁 Reconnect attempt #${attempt}`);
    });

    socketRef.current.on("reconnect_failed", () => {
      console.error("❌ Reconnect failed after max attempts");
      toast.error("Socket connection failed. Please refresh.");
    });

    socketRef.current.on("stock-updated", handleStockRealtime);

    return () => {
      socketRef.current.off("stock-updated", handleStockRealtime);

    };
  }, [fetchStock, cartId]);


// ✅ Open supplier cart
const openSupplierCart = async (cartIdArg, supplierId) => {
  try {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setSelectedSupplier(supplier);

    let data;

    if (cartIdArg) {
      // Explicit open by id (useful for history)
      data = await secureFetch(`/supplier-carts/items?cart_id=${cartIdArg}`);
    } else {
      // 🔑 Always prefer scheduled cart for modal
      const scheduled = await secureFetch(`/supplier-carts/scheduled?supplier_id=${supplierId}`);

      if (scheduled) {
        // Also fetch items explicitly for this cart
        const itemsRes = await secureFetch(`/supplier-carts/items?cart_id=${scheduled.cart_id}`);
        data = { ...scheduled, items: itemsRes.items || [] };
      }
    }

    if (!data) return;

    // ✅ Sync state
    setScheduledAt(data.scheduled_at || null);
    setRepeatType(data.repeat_type || "none");
    setRepeatDays(Array.isArray(data.repeat_days) ? data.repeat_days : []);
    setAutoOrder(!!data.auto_confirm);
    setCartItems(data.items || []);

    setCartId(data.cart_id || null);
    setShowCartModal(true);
  } catch (err) {
    console.error("❌ Error opening supplier cart:", err);
  }
};


// ✅ Fetch cart items
const fetchCartItems = async (cartId) => {
  try {
    const data = await secureFetch(`/supplier-carts/items?cart_id=${cartId}`);
    setCartItems(Array.isArray(data?.items) ? data.items : []);

console.log("🔗 fetch from:", API_URL, "repeat_days:", data.repeat_days);

    // ✅ Only update repeatDays if backend actually has them
    if (Array.isArray(data.repeat_days) && data.repeat_days.length > 0) {
      setRepeatDays(data.repeat_days);
    } else {
      console.log("⚠️ Skipping repeatDays update, keeping local:", repeatDays);
    }

    if (data.repeat_type) {
      setRepeatType(data.repeat_type);
    }
    if (typeof data.auto_confirm === "boolean") {
      setAutoOrder(data.auto_confirm);
    }
    if (data.scheduled_at) {
      setScheduledAt(data.scheduled_at);
    }
  } catch (error) {
    console.error("❌ Error fetching cart items:", error);
    setCartItems([]);
  }
};



// ✅ Confirm supplier cart
const confirmSupplierCart = async (cartId) => {
  if (!cartId || !selectedSupplier?.id) return;

  try {
    console.log('🔍 Confirming cart with autoOrder:', autoOrder);
    const res = await secureFetch(`/supplier-carts/${cartId}/confirm`, {
      method: "PUT",
      body: JSON.stringify({
        scheduled_at: scheduledAt,
        repeat_type: repeatType,
        repeat_days: repeatDays,
        auto_confirm: autoOrder,
      }),
    });
    console.log('✅ Cart confirmed, auto_confirm in response:', res.cart?.auto_confirm);

    if (!res.cart) return;
    const confirmedCart = res.cart;

    // ✅ Reload the latest scheduled cart data
    const latest = await secureFetch(
      `/supplier-carts/scheduled?supplier_id=${selectedSupplier?.id}`
    );

    // ✅ Always update state, even if values are "none" or empty
    console.log('📥 Fetched latest cart, auto_confirm:', latest.auto_confirm);
    setScheduledAt(latest.scheduled_at || "");
    setRepeatType(latest.repeat_type || "none");
    setRepeatDays(Array.isArray(latest.repeat_days) ? latest.repeat_days : []);
    setAutoOrder(latest.auto_confirm === true);
    console.log('✅ Set autoOrder state to:', latest.auto_confirm === true);
    setCartItems(latest.items || []);
  } catch (err) {
    console.error("❌ Error confirming cart:", err);
  }
};



// ✅ Send supplier cart
const sendSupplierCart = async (cartId) => {
  if (!scheduledAt) {
    toast.error("❌ Please select a schedule date and time first!");
    return;
  }

  try {
    setSending(true);

    // Auto-confirm if enabled
    if (autoOrder) {
      const payload = { scheduled_at: scheduledAt };
      if (repeatType && repeatType !== "none") payload.repeat_type = repeatType;
      if (repeatDays?.length > 0) payload.repeat_days = repeatDays;
      if (typeof autoOrder === "boolean") payload.auto_confirm = autoOrder;

      const confirmRes = await secureFetch(`/supplier-carts/${cartId}/confirm`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (!confirmRes?.cart) {
        toast.error(confirmRes?.error || "❌ Failed to confirm cart before sending.");
        return;
      }
    }

    // ✅ Send the cart
    const sendRes = await secureFetch(`/supplier-carts/${cartId}/send`, {
      method: "POST",
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });

    if (sendRes?.success) {
      toast.success("✅ Order sent successfully!");
      setShowCartModal(false);
      await fetchStock(); // 🔄 Refresh stock
    } else {
      toast.error(sendRes?.error || "❌ Failed to send order.");
    }
  } catch (error) {
    console.error("❌ Error sending cart:", error);
    toast.error("❌ Network error sending cart.");
  } finally {
    setSending(false);
  }
};






  const handleCartQuantityChange = (index, newQty) => {
    setCartItems(prev => {
      const updated = [...prev];
      updated[index].quantity = parseFloat(newQty).toFixed(2) || 0;
      return updated;
    });
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Calculate unit price for the new transaction
  const computedUnitPrice = () => {
    const quantity = parseFloat(newTransaction.quantity);
    const totalCost = parseFloat(newTransaction.total_cost);
    if (!isNaN(quantity) && !isNaN(totalCost) && quantity > 0) {
      if (newTransaction.unit === "g" || newTransaction.unit === "ml") {
        return ((totalCost / quantity) * 1000).toFixed(2);
      }
      return (totalCost / quantity).toFixed(2);
    }
    return "0.00";
  };

const fetchSuppliers = async () => {
    try {
      const data = await secureFetch("/suppliers");
      if (Array.isArray(data)) setSuppliers(data);
      else setSuppliers([]);
    } catch (error) {
      console.error("❌ Error fetching suppliers:", error);
      setSuppliers([]);
    }
  };

  const fetchTransactions = async (supplierId) => {
    try {
      const data = await secureFetch(`/suppliers/${supplierId}/transactions`);
      setTransactions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("❌ Error fetching transactions:", error);
      setTransactions([]);
    }
  };

  useEffect(() => {
    const supplierId = selectedSupplier?.id;
    if (!supplierId) {
      setSupplierIngredients([]);
      return;
    }

    const loadSupplierIngredients = async () => {
      try {
        const data = await secureFetch(`/suppliers/${supplierId}/ingredients`);
        setSupplierIngredients(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("❌ Error fetching supplier ingredients:", error);
        setSupplierIngredients([]);
      }
    };

    loadSupplierIngredients();
  }, [selectedSupplier?.id]);

  const fetchSupplierDetails = async (supplierId) => {
    try {
      if (!supplierId) return;
      const data = await secureFetch(`/suppliers/${supplierId}`);
      if (!data?.id) throw new Error("Supplier not found");
      setSelectedSupplier(data);
    } catch (error) {
      console.error("❌ Error fetching supplier details:", error);
      setSelectedSupplier(null);
    }
  };

  useEffect(() => {
    const history = Array.isArray(selectedSupplier?.feedback_history)
      ? selectedSupplier?.
feedback_history.map((entry) => ({
          quality:
            entry.quality ??
            entry.quality_rating ??
            entry.rating ??
            entry.score ??
            null,
          packaging:
            entry.packaging ??
            entry.packaging_score ??
            entry.packaging_rating ??
            null,
          punctuality:
            entry.punctuality ??
            entry.delivery_punctuality ??
            entry.on_time_score ??
            null,
          accuracy:
            entry.accuracy ??
            entry.order_accuracy ??
            entry.accuracy_score ??
            null,
          deliveryTimeDays:
            entry.deliveryTimeDays ??
            entry.delivery_time_days ??
            entry.lead_time_days ??
            null,
          onTime:
            entry.onTime ??
            entry.on_time ??
            (typeof entry.was_on_time === "boolean"
              ? entry.was_on_time
              : null),
          complaint:
            entry.complaint ??
            entry.has_complaint ??
            (entry.notes
              ? entry.notes.toLowerCase().includes("complaint")
              : false) ??
            false,
          notes: entry.notes ?? "",
          createdAt:
            entry.createdAt ??
            entry.created_at ??
            entry.date ??
            entry.timestamp ??
            null,
        }))
      : [];
    setFeedbackEntries(history);
    setFeedbackForm({
      quality: 4,
      packaging: 4,
      punctuality: 4,
      accuracy: 4,
      deliveryTimeDays: "",
      onTime: true,
      complaint: false,
      notes: "",
    });
  }, [selectedSupplier?.id]);

  const handleSelectSupplier = (supplierId) => {
    const supplier = suppliers.find((sup) => sup.id === parseInt(supplierId));
    if (!supplier) return;
    setSelectedSupplier(supplier);
    fetchTransactions(supplier.id);

    const supplierName = String(supplier?.name || "").trim();
    const supplierTaxNumber = String(supplier?.tax_number || "").trim();
    if (supplierName || supplierTaxNumber) {
      setParsedReceiptEdited((prev) => {
        const base = prev || parsedReceiptOriginal || {};
        const next = cloneReceipt(base);
        if (supplierName) next.merchant = supplierName;
        if (supplierTaxNumber) next.vat_number = supplierTaxNumber;
        return next;
      });
    }
  };

  const supplierIngredientOptions = useMemo(() => {
    const normalize = (value) =>
      typeof value === "string" ? value.trim() : "";
    const keyFor = (name, unit) => `${name.toLowerCase()}|||${unit}`;
    const seen = new Map();

    if (Array.isArray(supplierIngredients) && supplierIngredients.length > 0) {
      supplierIngredients.forEach((row) => {
        const name = normalize(row?.name ?? row?.ingredient);
        const unit = normalize(row?.unit);
        if (!name || !unit) return;
        const key = keyFor(name, unit);
        if (!seen.has(key)) seen.set(key, { name, unit });
      });
    }

    if (seen.size === 0) {
      transactions.forEach((txn) => {
        if (!txn) return;

        if (Array.isArray(txn.items) && txn.items.length > 0) {
          txn.items.forEach((item) => {
            const name = normalize(item?.ingredient);
            const unit = normalize(item?.unit);
            if (!name || !unit) return;
            const key = keyFor(name, unit);
            if (!seen.has(key)) seen.set(key, { name, unit });
          });
        }

        const directName = normalize(txn.ingredient);
        const directUnit = normalize(txn.unit);
        if (
          directName &&
          directUnit &&
          directName !== "Payment" &&
          directName !== "Compiled Receipt"
        ) {
          const key = keyFor(directName, directUnit);
          if (!seen.has(key)) seen.set(key, { name: directName, unit: directUnit });
        }
      });
    }

    return Array.from(seen.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.unit.localeCompare(b.unit, undefined, { sensitivity: "base" });
    });
  }, [supplierIngredients, transactions]);

  const ingredientMatchIndex = useMemo(() => {
    const byLooseName = new Map();
    const byExactName = new Map();
    const byExactNameAndUnit = new Map();
    const all = Array.isArray(supplierIngredientOptions)
      ? supplierIngredientOptions
      : [];
    all.forEach((opt) => {
      const exactNameKey = normalizeTextKey(opt?.name || "");
      const unitKey = normalizeUnit(opt?.unit || "");
      if (exactNameKey) {
        if (!byExactName.has(exactNameKey)) {
          byExactName.set(exactNameKey, { ...opt, _exactMatchKey: exactNameKey });
        }
        if (unitKey) {
          const exactUnitKey = `${exactNameKey}|||${unitKey}`;
          if (!byExactNameAndUnit.has(exactUnitKey)) {
            byExactNameAndUnit.set(exactUnitKey, {
              ...opt,
              _exactMatchKey: exactNameKey,
            });
          }
        }
      }

      const nameKey = normalizeIngredientName(opt?.name || "");
      if (!nameKey) return;
      const key = unitKey ? `${nameKey}|||${unitKey}` : nameKey;
      if (!byLooseName.has(key)) {
        byLooseName.set(key, { ...opt, _matchKey: nameKey });
      }
    });
    return { byLooseName, byExactName, byExactNameAndUnit, all };
  }, [supplierIngredientOptions]);

  const findExactIngredientMatch = (rawName, unit) => {
    const exactNameKey = normalizeTextKey(rawName);
    if (!exactNameKey) return null;
    const unitKey = normalizeUnit(unit || "");
    const unitScopedKey = unitKey ? `${exactNameKey}|||${unitKey}` : "";
    if (unitScopedKey && ingredientMatchIndex.byExactNameAndUnit.has(unitScopedKey)) {
      return ingredientMatchIndex.byExactNameAndUnit.get(unitScopedKey);
    }
    if (ingredientMatchIndex.byExactName.has(exactNameKey)) {
      return ingredientMatchIndex.byExactName.get(exactNameKey);
    }
    return null;
  };

  const findBestIngredientMatch = (rawName, unit) => {
    const exact = findExactIngredientMatch(rawName, unit);
    if (exact) return exact;

    const nameKey = normalizeIngredientName(rawName);
    if (!nameKey) return null;
    const unitKey = normalizeUnit(unit || "");
    const exactKey = unitKey ? `${nameKey}|||${unitKey}` : nameKey;
    if (ingredientMatchIndex.byLooseName.has(exactKey)) {
      return ingredientMatchIndex.byLooseName.get(exactKey);
    }

    let best = null;
    for (const opt of ingredientMatchIndex.all) {
      const optKey = normalizeIngredientName(opt?.name || "");
      if (!optKey) continue;
      if (unitKey && normalizeUnit(opt?.unit || "") !== unitKey) continue;
      if (nameKey === optKey) {
        return opt;
      }
      if (nameKey.includes(optKey) || optKey.includes(nameKey)) {
        if (!best || optKey.length > best._matchKey.length) {
          best = { ...opt, _matchKey: optKey };
        }
      }
    }
    return best;
  };

  const inferTaxIncludedForParsedItems = (parsedItems, totals = null) => {
    const lineSum = (Array.isArray(parsedItems) ? parsedItems : []).reduce(
      (acc, item) => acc + (parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? item?.total) || 0),
      0
    );
    if (!(lineSum > 0)) return false;

    const pickTotal = (...aliases) =>
      totals && typeof totals === "object" ? pickObjectFieldByAlias(totals, aliases) : undefined;

    const explicitTaxIncluded =
      totals?.tax_included ??
      totals?.taxIncluded ??
      pickTotal("tax included", "kdv dahil", "vergiler dahil");
    if (explicitTaxIncluded !== null && explicitTaxIncluded !== undefined && String(explicitTaxIncluded).trim() !== "") {
      // Trust explicit TRUE immediately, but do not force FALSE;
      // many parsers default false when not sure.
      if (isTruthyFlag(explicitTaxIncluded)) return true;
    }

    const grandTotal = parseOcrNumber(
      totals?.grand_total ??
      totals?.grandTotal ??
      totals?.total ??
      pickTotal("grand total", "genel toplam", "odenecek tutar", "ödenecek tutar", "toplam tutar", "odenecek")
    );
    const vatTotal = parseOcrNumber(
      totals?.vat_total ??
      totals?.vatTotal ??
      totals?.kdv_total ??
      pickTotal("vat total", "kdv toplam", "hesaplanan kdv", "kdv")
    );
    const subtotalExVat = parseOcrNumber(
      totals?.subtotal_ex_vat ??
      totals?.subtotalExVat ??
      totals?.mal_hizmet_toplam_tutari ??
      pickTotal("subtotal", "ara toplam", "mal hizmet toplam tutari", "mal/hizmet toplam tutari")
    );

    const tolerance = Math.max(0.5, lineSum * 0.01);
    if (
      Number.isFinite(grandTotal) &&
      grandTotal > 0 &&
      Number.isFinite(subtotalExVat) &&
      subtotalExVat > 0 &&
      Number.isFinite(vatTotal) &&
      vatTotal >= 0 &&
      Math.abs((subtotalExVat + vatTotal) - grandTotal) <= tolerance
    ) {
      if (Math.abs(lineSum - grandTotal) <= tolerance) return true;
      if (Math.abs(lineSum - subtotalExVat) <= tolerance) return false;
    }

    if (Number.isFinite(grandTotal) && grandTotal > 0) {
      if (Number.isFinite(vatTotal) && vatTotal >= 0) {
        if (Math.abs((lineSum + vatTotal) - grandTotal) <= tolerance) return false;
        if (Math.abs(lineSum - grandTotal) <= tolerance) return true;
      } else {
        if (Math.abs(lineSum - grandTotal) <= tolerance) return true;
        if (grandTotal > lineSum + tolerance) return false;
      }
    }

    // Default to VAT-exclusive rows for supplier invoices unless evidence shows VAT-included lines.
    return false;
  };

  const applyParsedInvoiceItems = (parsedItems, options = {}) => {
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) return false;
    const invoiceTaxIncluded = inferTaxIncludedForParsedItems(parsedItems, options?.totals || null);
    const taxIncludedText = invoiceTaxIncluded ? "1" : "0";
    const vatCandidates = parsedItems
      .map((item) =>
        parseOcrNumber(item?.vat_rate ?? item?.taxRate ?? item?.tax ?? null)
      )
      .filter((vat) => Number.isFinite(vat) && vat > 0 && vat <= 30);
    let defaultVatRate = null;
    if (vatCandidates.length > 0) {
      const counts = new Map();
      vatCandidates.forEach((vat) => {
        const key = Number(vat.toFixed(2));
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      let best = null;
      let bestCount = -1;
      counts.forEach((count, key) => {
        if (count > bestCount) {
          bestCount = count;
          best = key;
        }
      });
      defaultVatRate = best;
    }

    const rows = parsedItems.map((item) => {
      const mapped = item?.matched_mapping || null;
      const unitForMatch =
        item?.unit === "kg"
          ? "kg"
          : item?.unit === "g"
            ? "g"
            : item?.unit === "L" || item?.unit === "lt"
            ? "lt"
            : item?.unit === "ml"
              ? "ml"
            : item?.unit === "piece" || item?.unit === "case"
              ? "pcs"
              : "";
      const mappedName = String(mapped?.ingredient || "").trim();
      const mappedUnit = normalizeUnit(mapped?.unit || "");
      const match = mappedName
        ? { name: mappedName, unit: mappedUnit || unitForMatch || "pcs" }
        : findExactIngredientMatch(item?.name, unitForMatch);
      const matchedUnit = normalizeUnit(match?.unit || unitForMatch || "");
      const unitValue =
        matchedUnit && ["kg", "g", "lt", "ml", "pcs"].includes(matchedUnit)
          ? matchedUnit
          : "pcs";

      let quantityValue =
        parseOcrNumber(item?.qty_units ?? item?.qty_cases ?? item?.quantity ?? 0) || 0;
      const rawCaseQuantityValue = parseOcrNumber(item?.qty_cases ?? null) || 0;
      const inferredUnitsPerCaseValue =
        parseOcrNumber(inferUnitsPerCaseFromName(item?.name || "")) || 0;
      const unitsPerCaseValue =
        parseOcrNumber(item?.units_per_case ?? null) || inferredUnitsPerCaseValue || 0;
      const unitMetaKey = normalizeTextKey(item?.unit_meta || "");
      const unitKey = normalizeTextKey(item?.unit || "");
      const hasCaseUnitHint =
        unitMetaKey === "case" ||
        /\b(koli|kasa|case|cuval|cval|sack|bag)\b/.test(unitKey);
      const isPieceLike =
        String(item?.unit || "").toLowerCase() === "piece" || normalizeUnit(item?.unit || "") === "pcs";
      let caseQuantityValue = rawCaseQuantityValue > 0 ? rawCaseQuantityValue : 0;
      if (caseQuantityValue <= 0 && hasCaseUnitHint && quantityValue > 0) {
        if (unitsPerCaseValue > 0) {
          const derivedCaseQty = quantityValue / unitsPerCaseValue;
          caseQuantityValue =
            derivedCaseQty > 0.5 && Number.isFinite(derivedCaseQty)
              ? derivedCaseQty
              : quantityValue;
        } else {
          caseQuantityValue = quantityValue;
        }
      }
      if (caseQuantityValue <= 0 && isPieceLike && quantityValue > 0) {
        caseQuantityValue = 1;
      }
      const packSizeFromNameValue =
        parseOcrNumber(inferUnitsPerCaseFromName(item?.name || "")) || 0;
      let resolvedUnitsPerCaseValue = unitsPerCaseValue;
      if (
        resolvedUnitsPerCaseValue <= 0 &&
        caseQuantityValue > 0 &&
        unitValue === "kg" &&
        quantityValue > 0 &&
        quantityValue <= caseQuantityValue * 1.1
      ) {
        // Common flour invoice format: "Miktar = Çuval/Koli" with implicit 25kg packs.
        resolvedUnitsPerCaseValue = 25;
      }
      if (
        packSizeFromNameValue > 0 &&
        caseQuantityValue > 0 &&
        resolvedUnitsPerCaseValue > 0 &&
        ["g", "ml"].includes(unitValue)
      ) {
        const parsedPackTotal = caseQuantityValue * resolvedUnitsPerCaseValue;
        const clearlyWrongCaseData =
          resolvedUnitsPerCaseValue < packSizeFromNameValue * 0.35 ||
          parsedPackTotal < packSizeFromNameValue * 0.5;
        if (clearlyWrongCaseData) {
          // OCR occasionally leaks "xN" from neighbouring rows into packaged gram/ml products.
          // When the name has a strong pack token (e.g. "900 G"), trust that pack size.
          caseQuantityValue = 1;
          resolvedUnitsPerCaseValue = packSizeFromNameValue;
          quantityValue = packSizeFromNameValue;
        }
      }
      const unitPriceValue =
        parseOcrNumber(item?.unit_price_ex_vat ?? item?.unit_price ?? null) || 0;
      const totalValue =
        parseOcrNumber(item?.line_total_inc_vat ?? item?.totalCost ?? 0) || 0;
      if (caseQuantityValue > 0 && resolvedUnitsPerCaseValue > 0) {
        quantityValue = caseQuantityValue * resolvedUnitsPerCaseValue;
      }
      const amountPerKoliValue =
        caseQuantityValue > 0
          ? resolvedUnitsPerCaseValue > 0
            ? resolvedUnitsPerCaseValue
            : quantityValue > 0
              ? quantityValue / caseQuantityValue
              : 0
          : 0;
      let packagedKoliValue = 0;
      let packagedAmountPerKoliValue = 0;
      if (
        caseQuantityValue <= 0 &&
        packSizeFromNameValue > 0 &&
        ["kg", "g", "lt", "ml"].includes(unitValue)
      ) {
        if (quantityValue > 0) {
          const ratio = quantityValue / packSizeFromNameValue;
          const roundedRatio = Math.round(ratio);
          if (
            Number.isFinite(ratio) &&
            roundedRatio >= 1 &&
            roundedRatio <= 50 &&
            Math.abs(ratio - roundedRatio) <= 0.08
          ) {
            packagedKoliValue = roundedRatio;
            packagedAmountPerKoliValue = packSizeFromNameValue;
          } else if (quantityValue <= 1.5 && packSizeFromNameValue > 1) {
            // Parser occasionally keeps "1" instead of package grams/ml from the name.
            packagedKoliValue = 1;
            packagedAmountPerKoliValue = packSizeFromNameValue;
            quantityValue = packSizeFromNameValue;
          }
        } else {
          packagedKoliValue = 1;
          packagedAmountPerKoliValue = packSizeFromNameValue;
          quantityValue = packSizeFromNameValue;
        }
      }
      const amountPerKoliDisplay =
        amountPerKoliValue > 0 ? String(Number(amountPerKoliValue.toFixed(3))) : "";
      const rawTaxValue =
        item?.vat_rate !== null && item?.vat_rate !== undefined
          ? parseOcrNumber(item.vat_rate)
          : item?.taxRate !== null && item?.taxRate !== undefined
            ? parseOcrNumber(item.taxRate)
            : item?.tax !== null && item?.tax !== undefined
              ? parseOcrNumber(item.tax)
              : null;
      let taxValue =
        Number.isFinite(rawTaxValue) && rawTaxValue >= 0 && rawTaxValue <= 30 ? rawTaxValue : 0;
      if (
        (!Number.isFinite(rawTaxValue) || rawTaxValue > 30) &&
        Number.isFinite(rawTaxValue) &&
        rawTaxValue > 30 &&
        rawTaxValue <= 3000
      ) {
        const normalizedTax = rawTaxValue / 100;
        if (normalizedTax >= 0 && normalizedTax <= 30) {
          taxValue = normalizedTax;
        }
      }
      if (
        (!Number.isFinite(rawTaxValue) || rawTaxValue <= 0 || rawTaxValue > 30) &&
        Number.isFinite(defaultVatRate) &&
        defaultVatRate > 0
      ) {
        taxValue = defaultVatRate;
      }
      if (
        taxValue <= 0 &&
        caseQuantityValue > 0 &&
        unitValue === "kg"
      ) {
        taxValue = 1;
      }
      const nameKeyForVat = normalizeTextKey(item?.name || "");
      if (
        nameKeyForVat.includes("alisveris poseti") ||
        nameKeyForVat.includes("peynir surulebilir beyaz") ||
        nameKeyForVat.includes("baharat cubuk tarcin")
      ) {
        taxValue = 1;
      }
      const discountRateValue = parseOcrNumber(
        item?.discount_rate ?? item?.discount ?? null
      );
      const discountAmountValue = parseOcrNumber(item?.discount_amount ?? null);
      const discountAmountDisplay =
        Number.isFinite(discountAmountValue) && discountAmountValue > 0
          ? String(Number(discountAmountValue.toFixed(2)))
          : "";
      let discountValue = discountRateValue;
      const grossQty = caseQuantityValue > 0 ? caseQuantityValue : quantityValue;
      const grossValue = unitPriceValue > 0 && grossQty > 0 ? unitPriceValue * grossQty : 0;
      if (
        (!Number.isFinite(discountValue) || discountValue < 0 || discountValue > 95) &&
        Number.isFinite(discountAmountValue) &&
        discountAmountValue > 0 &&
        grossValue > 0
      ) {
        const derivedDiscount = (discountAmountValue / grossValue) * 100;
        if (Number.isFinite(derivedDiscount) && derivedDiscount >= 0 && derivedDiscount <= 95) {
          discountValue = Number(derivedDiscount.toFixed(2));
        }
      }

      const normalizedKoliValue =
        caseQuantityValue > 0
          ? caseQuantityValue
          : packagedKoliValue > 0
            ? packagedKoliValue
          : 0;
      const normalizedAmountPerKoliValue =
        caseQuantityValue > 0
          ? amountPerKoliValue
          : packagedAmountPerKoliValue > 0
            ? packagedAmountPerKoliValue
          : 0;
      const amountPerKoliText =
        normalizedAmountPerKoliValue > 0
          ? String(Number(normalizedAmountPerKoliValue.toFixed(3)))
          : "";
      const koliText = normalizedKoliValue > 0 ? String(normalizedKoliValue) : "";

      if (match?.name && match?.unit) {
        return {
          ingredient_select: JSON.stringify({
            name: match.name,
            unit: match.unit,
          }),
          ingredient: match.name,
          quantity: quantityValue ? String(quantityValue) : "",
          koli: koliText,
        amount_per_koli: amountPerKoliText,
        unit: normalizeUnit(match.unit) || unitValue,
        discount_rate:
          discountValue !== null && discountValue !== undefined ? String(discountValue) : "",
        discount_amount: discountAmountDisplay,
        tax: String(taxValue),
        tax_included: taxIncludedText,
        total_cost: totalValue ? String(totalValue) : "",
        expiry_date: "",
        is_cleaning_supply: Boolean(item?.is_cleaning_supply),
        counted_stock: item?.counted_stock ?? item?.stock_left ?? item?.counted_left ?? "",
      };
      }

      return {
        ingredient_select: "__add_new__",
        ingredient: item?.name || "",
        quantity: quantityValue ? String(quantityValue) : "",
        koli: koliText,
        amount_per_koli: amountPerKoliText,
        unit: unitValue,
        discount_rate:
          discountValue !== null && discountValue !== undefined ? String(discountValue) : "",
        discount_amount: discountAmountDisplay,
        tax: String(taxValue),
        tax_included: taxIncludedText,
        total_cost: totalValue ? String(totalValue) : "",
        expiry_date: "",
        is_cleaning_supply: Boolean(item?.is_cleaning_supply),
        counted_stock: item?.counted_stock ?? item?.stock_left ?? item?.counted_left ?? "",
      };
    });

    setNewTransaction((prev) => ({
      ...prev,
      rows,
    }));

    return true;
  };

  const resolveTxnDate = (txn) =>
    txn?.delivery_date ||
    txn?.created_at ||
    txn?.updated_at ||
    txn?.date ||
    null;

  const sortedTransactions = useMemo(() => {
    const toTime = (txn) => {
      const raw = resolveTxnDate(txn);
      if (!raw) return 0;
      const parsed = new Date(raw);
      const time = parsed.getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return [...transactions].sort((a, b) => toTime(b) - toTime(a));
  }, [transactions]);

  const dateFilteredTransactions = useMemo(() => {
    const hasFrom = !!transactionDateFrom;
    const hasTo = !!transactionDateTo;
    if (!hasFrom && !hasTo) return sortedTransactions;

    const fromMs = hasFrom ? new Date(`${transactionDateFrom}T00:00:00`).getTime() : null;
    const toMs = hasTo ? new Date(`${transactionDateTo}T23:59:59.999`).getTime() : null;

    return sortedTransactions.filter((txn) => {
      const raw = resolveTxnDate(txn);
      if (!raw) return false;
      const parsed = new Date(raw);
      const time = parsed.getTime();
      if (Number.isNaN(time)) return false;
      if (fromMs !== null && time < fromMs) return false;
      if (toMs !== null && time > toMs) return false;
      return true;
    });
  }, [sortedTransactions, transactionDateFrom, transactionDateTo]);

  const filteredTransactions = useMemo(() => {
    return dateFilteredTransactions.filter((txn) => {
      if (transactionView === "purchases") {
        return txn?.ingredient !== "Payment";
      }
      if (transactionView === "payments") {
        return txn?.ingredient === "Payment";
      }
      return true;
    });
  }, [dateFilteredTransactions, transactionView]);

  const transactionHistoryTotals = useMemo(() => {
    let totalPurchases = 0;
    let totalPaid = 0;

    dateFilteredTransactions.forEach((txn) => {
      if (!txn) return;
      const totalCost = Number(txn.total_cost) || 0;
      const amountPaid = Number(txn.amount_paid) || 0;

      if (txn.ingredient === "Payment") {
        totalPaid += amountPaid || totalCost;
        return;
      }

      totalPurchases += totalCost;
      totalPaid += amountPaid;
    });

    return { totalPurchases, totalPaid };
  }, [dateFilteredTransactions]);

  const supplierFinancials = useMemo(() => {
    let totalPurchases = 0;
    let totalPaid = 0;
    let monthPurchases = 0;
    let monthPayments = 0;
    let openInvoices = 0;
    let lastInvoiceDate = null;
    let lastPaymentDate = null;

    const now = new Date();

    sortedTransactions.forEach((txn) => {
      if (!txn) return;
      const totalCost = Number(txn.total_cost) || 0;
      const amountPaid = Number(txn.amount_paid) || 0;
      const rawDate = resolveTxnDate(txn);
      const parsedDate = rawDate ? new Date(rawDate) : null;
      const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
      const isCurrentMonth =
        isValidDate &&
        parsedDate.getMonth() === now.getMonth() &&
        parsedDate.getFullYear() === now.getFullYear();

      if (txn.ingredient === "Payment") {
        const paymentValue = amountPaid || totalCost;
        totalPaid += paymentValue;
        if (isCurrentMonth) {
          monthPayments += paymentValue;
        }
        if (isValidDate) {
          if (!lastPaymentDate || parsedDate > lastPaymentDate) {
            lastPaymentDate = parsedDate;
          }
        }
        return;
      }

      totalPurchases += totalCost;
      totalPaid += amountPaid;

      if (isCurrentMonth) {
        monthPurchases += totalCost;
      }

      if (totalCost - amountPaid > 0.01) {
        openInvoices += 1;
      }

      if (isValidDate) {
        if (!lastInvoiceDate || parsedDate > lastInvoiceDate) {
          lastInvoiceDate = parsedDate;
        }
      }
    });

    const outstanding = Number(selectedSupplier?.total_due ?? 0);
    const coverage = totalPurchases > 0 ? (totalPaid / totalPurchases) * 100 : null;

    return {
      totalPurchases,
      totalPaid,
      outstanding,
      coverage,
      lastInvoiceDate,
      lastPaymentDate,
      monthPurchases,
      monthPayments,
      openInvoices,
    };
  }, [sortedTransactions, selectedSupplier?.total_due]);

const projectedBalance = useMemo(() => {
  const currentOutstanding = Number(supplierFinancials.outstanding ?? 0);
  const orderTotal = computeInvoiceTotals(newTransaction.rows || []).netTotal;

  const immediateMethods = ["Cash", "Credit Card", "IBAN"];
  const isImmediate = immediateMethods.includes(newTransaction.paymentMethod);
  const immediatePayment = isImmediate ? orderTotal : 0;

  return currentOutstanding + orderTotal - immediatePayment;
}, [supplierFinancials.outstanding, newTransaction.rows, newTransaction.paymentMethod]);

  const orderCostSummary = useMemo(() => {
    // e-Fatura alignment: keep line precision, then round tax once at document/rate-bucket level.
    return computeInvoiceTotals(Array.isArray(newTransaction?.rows) ? newTransaction.rows : []);
  }, [newTransaction?.rows]);

  const orderNetTotal = useMemo(
    () => orderCostSummary.netTotal,
    [orderCostSummary]
  );


  const recentReceipts = useMemo(() => {
    return sortedTransactions.filter((txn) => txn?.receipt_url).slice(0, 3);
  }, [sortedTransactions]);

	// Combined due = existing supplier due + current new order total
	const combinedDue = useMemo(() => {
	  const existingDue = Number(selectedSupplier?.total_due || 0);
	  const newOrderTotal = orderNetTotal;
	  return existingDue + newOrderTotal;
	}, [selectedSupplier?.total_due, orderNetTotal]);


  const coveragePercent =
    supplierFinancials.coverage !== null
      ? Math.min(100, Math.max(0, supplierFinancials.coverage))
      : null;

  const outstandingDelta =
    projectedBalance - (supplierFinancials.outstanding ?? 0);

  const isImmediateSettle = ["Cash", "Credit Card", "IBAN"].includes(
    newTransaction.paymentMethod
  );

  const paymentChipLabel = (method) => {
    switch (method) {
      case "Cash":
        return `💵 ${t("Cash")}`;
      case "Credit Card":
        return `💳 ${t("Credit Card")}`;
      case "IBAN":
        return `🏦 ${t("IBAN")}`;
      case "Due":
        return `🕓 ${t("Due")}`;
      default:
        return method || t("Unknown");
    }
  };

  const getLocalizedDate = (value) => {
    if (!value) return t("Not available");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("Not available");
    return parsed.toLocaleString();
  };

  const getReceiptExpirySummary = (txn) => {
    const expiryDates = (txn?.items || [])
      .map((item) => {
        if (!item?.expiry_date) return null;
        const parsed = new Date(item.expiry_date);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      })
      .filter(Boolean);

    if (!expiryDates.length) return null;

    const earliest = expiryDates.reduce((prev, curr) =>
      curr < prev ? curr : prev
    );
    const formattedDate = earliest.toLocaleDateString();
    const now = Date.now();
    const diffMs = earliest.getTime() - now;
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return `${t("Expired on")} ${formattedDate}`;
    }

    if (daysLeft <= 3) {
      const dayWord = daysLeft === 1 ? t("day") : t("days");
      return `${t("Expires in")} ${daysLeft} ${dayWord}`;
    }

    return `${t("Expires on")} ${formattedDate}`;
  };

  const priceAlerts = useMemo(() => {
    const toNumber = (value) => {
      if (value === null || value === undefined) return 0;
      const raw = String(value).trim();
      if (!raw) return 0;
      const normalized = raw.replace(",", ".");
      const num = Number(normalized);
      return Number.isFinite(num) ? num : 0;
    };

    const normalize = (value) => (typeof value === "string" ? value.trim() : "");

    const points = [];

    (Array.isArray(transactions) ? transactions : []).forEach((txn) => {
      if (!txn) return;
      if (txn.ingredient === "Payment") return;

      const rawDate = resolveTxnDate(txn);
      const date = rawDate ? new Date(rawDate) : null;
      if (!date || Number.isNaN(date.getTime())) return;

      const pushPoint = (nameRaw, unitRaw, priceRaw, fallbackQuantity, fallbackTotal) => {
        const ingredient = normalize(nameRaw) || t("Unknown");
        const unit = normalize(unitRaw);
        if (!unit) return;

        let price = toNumber(priceRaw);
        if (!(price > 0)) {
          const qty = toNumber(fallbackQuantity);
          const total = toNumber(fallbackTotal);
          if (qty > 0 && total > 0) {
            price = total / qty;
          }
        }

        if (!(price > 0)) return;

        points.push({ ingredient, unit, price, date });
      };

      if (Array.isArray(txn.items) && txn.items.length > 0) {
        txn.items.forEach((item) => {
          if (!item) return;
          pushPoint(
            item.ingredient ?? item.name,
            item.unit,
            item.price_per_unit ?? item.unit_price ?? item.purchase_price ?? item.price,
            item.quantity,
            item.total_cost
          );
        });
        return;
      }

      pushPoint(
        txn.ingredient,
        txn.unit,
        txn.price_per_unit ?? txn.unit_price ?? txn.purchase_price ?? txn.price,
        txn.quantity,
        txn.total_cost
      );
    });

    if (!points.length) return [];

    const grouped = new Map();

    points.forEach((entry) => {
      const key = `${entry.ingredient}_${entry.unit}`.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    });

    const alerts = [];

    grouped.forEach((entries) => {
      if (!entries.length) return;
      entries.sort((a, b) => b.date - a.date);
      const [latest, ...rest] = entries;
      if (!latest || rest.length === 0) return;

      const baselineCandidate =
        rest.find((entry) => {
          const diffDays = (latest.date - entry.date) / (1000 * 60 * 60 * 24);
          return diffDays >= 30;
        }) || rest[0];

      if (!baselineCandidate || !(baselineCandidate.price > 0)) return;

      const changePercent =
        ((latest.price - baselineCandidate.price) / baselineCandidate.price) *
        100;

      alerts.push({
        ingredient: latest.ingredient,
        unit: latest.unit,
        latestPrice: latest.price,
        comparisonPrice: baselineCandidate.price,
        changePercent,
        since: baselineCandidate.date,
      });
    });

    alerts.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return alerts.slice(0, 4);
  }, [resolveTxnDate, t, transactions]);

  const performanceMetrics = useMemo(() => {
    const deliveryTimes = feedbackEntries
      .map((entry) => Number(entry.deliveryTimeDays))
      .filter((value) => Number.isFinite(value) && value >= 0);

    const avgDeliveryTime = deliveryTimes.length
      ? deliveryTimes.reduce((acc, value) => acc + value, 0) /
        deliveryTimes.length
      : null;

    const onTimeRecords = feedbackEntries.filter(
      (entry) => entry.onTime === true || entry.onTime === false
    );

    const onTimePercentage = onTimeRecords.length
      ? (onTimeRecords.filter((entry) => entry.onTime).length /
          onTimeRecords.length) *
        100
      : null;

    const accuracyScores = feedbackEntries
      .map((entry) => Number(entry.accuracy))
      .filter((score) => Number.isFinite(score) && score > 0);

    const accuracyAverage = accuracyScores.length
      ? accuracyScores.reduce((acc, score) => acc + score, 0) /
        accuracyScores.length
      : null;

    const qualityScores = feedbackEntries
      .map((entry) => Number(entry.quality))
      .filter((score) => Number.isFinite(score) && score > 0);

    const qualityAverage = qualityScores.length
      ? qualityScores.reduce((acc, score) => acc + score, 0) /
        qualityScores.length
      : null;

    const complaintsCount = feedbackEntries.filter((entry) => {
      if (entry.complaint) return true;
      if (typeof entry.notes === "string") {
        const lower = entry.notes.toLowerCase();
        return lower.includes("complaint") || lower.includes("issue");
      }
      return false;
    }).length;

    const priceChange = priceAlerts.length ? priceAlerts[0].changePercent : null;

    return {
      avgDeliveryTime,
      onTimePercentage,
      priceChange,
      accuracyAverage,
      qualityAverage,
      complaintsCount,
    };
  }, [feedbackEntries, priceAlerts]);

  const feedbackTimeline = useMemo(() => {
    return [...feedbackEntries].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt) : null;
      const bDate = b.createdAt ? new Date(b.createdAt) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate - aDate;
    });
  }, [feedbackEntries]);

  // Handle input change for supplier transaction form
  const handleInputChange = (e) => {
    setNewTransaction({ ...newTransaction, [e.target.name]: e.target.value });
  };

  const requestSelectionOcr = async (selectionBlob) => {
    if (!selectionBlob) return "";
    const formData = new FormData();
    const fileNameBase = String(receiptFileMeta?.name || "receipt")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_");
    formData.append("file", selectionBlob, `${fileNameBase || "receipt"}_field.png`);
    if (selectedSupplier?.id) {
      formData.append("supplier_id", String(selectedSupplier.id));
    }
    const result = await secureFetch("/suppliers/invoices/extract-items", {
      method: "POST",
      body: formData,
    });
    const rawText =
      result?.text ||
      result?.ocr_text ||
      result?.raw_text ||
      result?.raw?.text ||
      result?.raw?.ocr_text ||
      "";
    const normalizedRaw = String(rawText || "").trim();
    if (normalizedRaw) return normalizedRaw;

    const fallbackItems = Array.isArray(result?.items) ? result.items : [];
    if (!fallbackItems.length) return "";
    return fallbackItems
      .map((item) =>
        String(
          item?.name ||
            item?.mal_hizmet ||
            item?.urun_adi ||
            pickObjectFieldByAlias(item, ["Mal Hizmet", "Urun", "Ürün", "Name", "Product"]) ||
            ""
        ).trim()
      )
      .filter(Boolean)
      .join("\n");
  };

  const resetReceiptImport = () => {
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setReceiptFileMeta(null);
    setOcrRawTextOriginal("");
    setOcrRawTextEdited("");
    setParsedReceiptOriginal(null);
    setParsedReceiptEdited(null);
    setOcrSelectableTokens([]);
    setParseErrors([]);
    setInvoiceParsePreview(null);
    setPreviewImage(null);
    setShowUploadOptions(false);
    setReviewTab("corrections");
    setNewTransaction({
      rows: [createEmptyTransactionRow()],
      paymentStatus: "Due",
      paymentMethod: "Due",
    });
  };

  const handleReceiptFileSelect = async (file) => {
    if (!file) return;

    if (await isHeicLikeFile(file)) {
      const msg = t("HEIC/HEIF images are not supported. Please upload a JPG or PNG.");
      setOcrParseError(msg);
      toast.error(msg);
      return;
    }

    setReceiptFile(file);
    if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl);
    setReceiptPreviewUrl(URL.createObjectURL(file));
    setReceiptFileMeta({
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
    });
    setShowUploadOptions(false);
    setOcrParseError("");
    setInvoiceParsePreview(null);
    setParseErrors([]);
    setOcrRawTextOriginal("");
    setOcrRawTextEdited("");
    setParsedReceiptOriginal(null);
    setParsedReceiptEdited(null);
    setOcrSelectableTokens([]);

    const formData = new FormData();
    formData.append("file", file);
    if (selectedSupplier?.id) {
      formData.append("supplier_id", String(selectedSupplier.id));
    }

    try {
      setOcrParsing(true);
      // Call new item extraction endpoint
      const result = await secureFetch("/suppliers/invoices/extract-items", {
        method: "POST",
        body: formData,
      });
      setOcrSelectableTokens(extractSelectableOcrTokens(result));

	      const backendItemsNormalized = Array.isArray(result?.items)
	        ? result.items.map((item) => {
            const getField = (...aliases) => pickObjectFieldByAlias(item, aliases);

            const rawMiktar =
              item?.miktar ??
              item?.quantity_text ??
              item?.qty_text ??
              item?.quantityLabel ??
              getField("Miktar", "Quantity", "Qty", "Miktar Text", "Miktar Bilgisi") ??
              "";
            const miktarText = String(rawMiktar || "").trim();
            const parsedMiktar = miktarText ? parseQtyAndUnit(miktarText) : { qty: null, unitToken: "" };
            const miktarUnitKey = normalizeTextKey(parsedMiktar?.unitToken || "");
            const miktarIsCase =
              /koli|kasa|case|cuval|cval|qval|qwal|quval|quwal|sack|bag/.test(
                miktarUnitKey
              );
            const qtyCasesFromMiktar =
              miktarIsCase && Number.isFinite(parsedMiktar?.qty) && parsedMiktar.qty > 0
                ? parsedMiktar.qty
                : null;
            const qtyUnitsFromMiktar =
              !miktarIsCase && Number.isFinite(parsedMiktar?.qty) && parsedMiktar.qty > 0
                ? parsedMiktar.qty
                : null;
            const derivedUnitMeta =
              miktarIsCase ? "case" : resolveUnitMeta(parsedMiktar?.unitToken || "", null);

            const qtyCasesRawFromFields =
              item?.qty_cases ??
              item?.koli ??
              item?.koli_miktar ??
              getField("qty_cases", "qty cases", "koli", "kasa", "case") ??
              null;
            const qtyCasesRaw =
              miktarIsCase && Number.isFinite(qtyCasesFromMiktar) && qtyCasesFromMiktar > 0
                ? qtyCasesFromMiktar
                : qtyCasesRawFromFields ?? qtyCasesFromMiktar ?? null;
	            const unitsPerCaseRaw =
	              item?.units_per_case ??
	              item?.amount_per_koli ??
	              item?.miktar_per_koli ??
	              getField(
	                "units_per_case",
	                "units per case",
	                "amount_per_koli",
	                "amount per koli",
	                "Koli Içi Adet",
	                "Koli Ici Adet",
	                "koli ici adet",
	                "koli içi adet",
	                "koliiciadet",
	                "koli ici",
	                "koli içi",
	                "koli basi miktar",
	                "koli basi kg"
	              ) ??
	              null;
            const qtyUnitsRaw =
              item?.qty_units ??
              item?.qty ??
              item?.quantity ??
              item?.miktar_sayi ??
              getField("qty_units", "quantity", "qty", "adet", "miktar sayi") ??
              qtyUnitsFromMiktar ??
              qtyCasesRaw ??
              null;
            const unitRaw =
              item?.unit ??
              item?.birim ??
              getField("unit", "birim", "unit name") ??
              null;
            const unitMetaRaw =
              item?.unit_meta ??
              item?.unitMeta ??
              getField("unit_meta", "unit meta", "unitmeta") ??
              null;
            const unitPriceRaw =
              item?.unit_price_ex_vat ??
              item?.unit_price ??
              item?.price_per_unit ??
              item?.birim_fiyat ??
              item?.birimFiyat ??
              getField("birim fiyat", "birim_fiyat", "unit price", "unit_price", "price_per_unit") ??
              null;
            const discountRateRaw =
              item?.discount_rate ??
              item?.discount ??
              item?.iskonto_orani ??
              getField("discount_rate", "discount", "iskonto orani", "iskonto_orani") ??
              null;
            const discountAmountRaw =
              item?.discount_amount ??
              item?.iskonto_tutari ??
              getField("discount_amount", "discount amount", "iskonto tutari", "iskonto_tutari") ??
              null;
            const vatRawValue =
              item?.vat_rate ??
              item?.taxRate ??
              item?.tax ??
              item?.kdv_orani ??
              item?.kdvOrani ??
              item?.kdv ??
              getField("KDV Orani", "KDV Oranı", "kdv_orani", "KDV", "VAT", "Tax") ??
              null;
            const lineTotalRaw =
              item?.line_total_inc_vat ??
              item?.totalCost ??
              item?.total ??
              item?.mal_hizmet_tutari ??
              item?.mal_hizmet_tutar ??
              item?.satir_toplam ??
              getField(
                "mal hizmet tutari",
                "mal_hizmet_tutari",
                "line total",
                "line_total",
                "satir toplam",
                "total"
              ) ??
              null;
            const codeRaw =
              item?.code ??
              item?.urun_kodu ??
              item?.product_code ??
              getField("urun kodu", "product code", "code") ??
              null;
            const nameRaw =
              getField(
                "Mal Hizmet",
                "mal hizmet",
                "Ürün",
                "Urun",
                "Ürün Adı",
                "Urun Adi",
                "Product Name",
                "Product",
                "Name"
              ) ??
              item?.mal_hizmet ??
              item?.urun_adi ??
              item?.name ??
              "";

            return {
              code: codeRaw || null,
              name: nameRaw || "",
              matched_mapping: item?.matched_mapping || null,
              qty_cases: parseOcrNumber(qtyCasesRaw),
              units_per_case: parseOcrNumber(unitsPerCaseRaw),
              qty_units: parseOcrNumber(qtyUnitsRaw),
              unit:
                unitRaw ||
                (miktarIsCase ? "case" : null) ||
                (qtyCasesRaw && unitsPerCaseRaw ? "case" : "piece"),
              unit_meta:
                unitMetaRaw ||
                (miktarIsCase ? "case" : derivedUnitMeta) ||
                null,
              unit_price_ex_vat: parseOcrNumber(unitPriceRaw),
              discount_rate: parseOcrNumber(discountRateRaw),
              discount_amount: parseOcrNumber(discountAmountRaw),
              vat_rate: (() => {
                const vat = parseOcrNumber(vatRawValue);
                return Number.isFinite(vat) && vat >= 0 && vat <= 3000 ? vat : null;
              })(),
              line_total_inc_vat: parseOcrNumber(lineTotalRaw),
            };
          })
        : [];

      const rawText =
        result?.text ||
        result?.ocr_text ||
        result?.raw_text ||
        result?.raw?.text ||
        result?.raw?.ocr_text ||
        "";
      setOcrRawTextOriginal(rawText || "");
      setOcrRawTextEdited(rawText || "");

      let rawLines = rawText
        ? String(rawText)
            .split(/\r?\n/)
            .map((line) => normalizeSpaces(line))
            .filter(Boolean)
        : [];
      if (rawLines.length === 0 && Array.isArray(result?.items) && result.items.length > 0) {
        // Some backends omit `text` for template/table parsers. Build a lightweight
        // pseudo-OCR line list so pack/case inference can still match by totals.
        rawLines = result.items
          .map((it) => {
            const getField = (...aliases) => pickObjectFieldByAlias(it, aliases);
            const name =
              it?.name ??
              it?.mal_hizmet ??
              it?.urun_adi ??
              getField("Mal Hizmet", "Ürün", "Name", "Product") ??
              "";
            const miktar = it?.miktar ?? getField("Miktar", "Quantity", "Qty") ?? "";
            const birimFiyat =
              it?.birim_fiyat ?? it?.birimFiyat ?? getField("Birim Fiyat", "Unit Price") ?? "";
            const kdvOrani = it?.kdv_orani ?? it?.kdvOrani ?? getField("KDV Oranı", "KDV Orani", "VAT") ?? "";
            const tutar =
              it?.mal_hizmet_tutari ??
              it?.mal_hizmet_tutar ??
              it?.satir_toplam ??
              getField("Mal Hizmet Tutarı", "Mal Hizmet Tutar", "Tutar", "Line total", "Total") ??
              it?.line_total_inc_vat ??
              it?.totalCost ??
              it?.total ??
              "";
            return normalizeSpaces([name, miktar, birimFiyat, kdvOrani, tutar].filter(Boolean).join(" "));
          })
          .filter(Boolean);
      }
      const backendItemsEnrichedByRaw = enrichCocaRowsFromRawLines(
        backendItemsNormalized,
        rawLines
      );
      const cleanedBackendItems = enrichPackSizesFromRawLines(
        enrichCaseRowsFromPeers(
          sanitizeParsedItems(backendItemsEnrichedByRaw)
        ),
        rawLines
      );

      const parseSourceKey = String(result?.parse_source || "").toLowerCase();
      const backendStructuredTableRowCount = Array.isArray(result?.items)
        ? result.items.reduce((count, item) => {
            const getField = (...aliases) => pickObjectFieldByAlias(item, aliases);
            const nameCol = getField("Mal Hizmet", "Ürün", "Urun", "Product", "Name");
            const qtyCol = getField("Miktar", "Quantity", "Qty");
            const totalCol = getField(
              "Mal Hizmet Tutarı",
              "Mal Hizmet Tutari",
              "Line total",
              "Total"
            );
            if (String(nameCol || "").trim() && (qtyCol !== undefined || totalCol !== undefined)) {
              return count + 1;
            }
            return count;
          }, 0)
        : 0;
      const backendLooksLikeStructuredTable = backendStructuredTableRowCount >= 3;
      const backendIsStructuredParser =
        parseSourceKey === "deniz_template_tsv" ||
        parseSourceKey === "table_parser" ||
        parseSourceKey === "tesseract_table";
      const backendHasStructuredFields = cleanedBackendItems.some((item) => {
        const qc = parseOcrNumber(item?.qty_cases);
        const upc = parseOcrNumber(item?.units_per_case);
        const vat = parseOcrNumber(item?.vat_rate);
        const discAmt = parseOcrNumber(item?.discount_amount);
        const discRate = parseOcrNumber(item?.discount_rate);
        return (
          (Number.isFinite(qc) && qc > 1) ||
          (Number.isFinite(upc) && upc > 1) ||
          (Number.isFinite(vat) && vat >= 0 && vat <= 30) ||
          (Number.isFinite(discAmt) && discAmt > 0) ||
          (Number.isFinite(discRate) && discRate > 0)
        );
      });
      const backendScore = scoreParsedItems(cleanedBackendItems);
      const backendLikelyReliable =
        cleanedBackendItems.length >= 2 &&
        (
          backendHasStructuredFields ||
          backendLooksLikeStructuredTable ||
          backendScore >= 260
        );
      const shouldRunRawFallback =
        rawLines.length > 0 &&
        (
          cleanedBackendItems.length === 0 ||
          parseSourceKey === "python_fallback" ||
          !backendLikelyReliable
        );

      let hybridResult = null;
      let parsedFromRawLegacy = null;
      let parsedFromRaw = null;
      let useHybridRawItems = false;
      let cleanedRawItems = [];
      let rawScore = 0;

      if (shouldRunRawFallback) {
        const hybridParsePromise = hybridParseSupplierInvoice({
          ocrLines: rawLines,
          threshold: supplierAiThreshold,
          aiEnabled: supplierAiAssistEnabled,
          requestLlm: async (payload) =>
            secureFetch("/suppliers/invoices/llm-parse", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
        });

        parsedFromRawLegacy = rawText ? parseSupplierInvoiceText(rawText) : null;
        hybridResult = await hybridParsePromise;

        const legacyRawItemsEnrichedByRaw = enrichCocaRowsFromRawLines(
          parsedFromRawLegacy?.items || [],
          rawLines
        );
        const hybridRawItemsEnrichedByRaw = enrichCocaRowsFromRawLines(
          hybridResult?.parsed?.items || [],
          rawLines
        );
        const cleanedLegacyRawItems = enrichPackSizesFromRawLines(
          enrichCaseRowsFromPeers(
            sanitizeParsedItems(legacyRawItemsEnrichedByRaw)
          ),
          rawLines
        );
        const cleanedHybridRawItems = enrichPackSizesFromRawLines(
          enrichCaseRowsFromPeers(
            sanitizeParsedItems(hybridRawItemsEnrichedByRaw)
          ),
          rawLines
        );
        const legacyRawScore = scoreParsedItems(cleanedLegacyRawItems);
        const hybridRawScore = scoreParsedItems(cleanedHybridRawItems);
        useHybridRawItems =
          cleanedHybridRawItems.length > 0 &&
          (
            cleanedLegacyRawItems.length === 0 ||
            hybridRawScore >= legacyRawScore + 30 ||
            (
              cleanedHybridRawItems.length >= cleanedLegacyRawItems.length &&
              hybridRawScore >= legacyRawScore + 10
            )
          );
        cleanedRawItems = useHybridRawItems
          ? cleanedHybridRawItems
          : cleanedLegacyRawItems;
        parsedFromRaw = {
          ...(parsedFromRawLegacy || {}),
          ...(hybridResult?.parsed || {}),
          items: useHybridRawItems
            ? hybridRawItemsEnrichedByRaw || []
            : legacyRawItemsEnrichedByRaw || hybridRawItemsEnrichedByRaw || [],
          totals:
            (useHybridRawItems
              ? hybridResult?.parsed?.totals || parsedFromRawLegacy?.totals
              : parsedFromRawLegacy?.totals || hybridResult?.parsed?.totals) ||
            null,
          rejectedLines: parsedFromRawLegacy?.rejectedLines || [],
        };
        rawScore = scoreParsedItems(cleanedRawItems);
      }

      const forceBackend =
        backendIsStructuredParser &&
        cleanedBackendItems.length >= 2 &&
        (backendLooksLikeStructuredTable || backendScore >= rawScore - 10);
      const backendWeak = cleanedBackendItems.length === 0 || (!backendHasStructuredFields && backendScore < 240);
      const hasStrongCaseInfo = (items) =>
        (Array.isArray(items) ? items : []).some((item) => {
          const qc = parseOcrNumber(item?.qty_cases);
          const upc = parseOcrNumber(item?.units_per_case);
          const name = normalizeTextKey(item?.name || "");
          return (
            (Number.isFinite(qc) && qc > 1) ||
            (Number.isFinite(upc) && upc >= 5) ||
            /\b\d+\s*(kg|kilo|kilogram)\b/.test(name)
          );
        });
      const countCaseRows = (items) =>
        (Array.isArray(items) ? items : []).reduce((acc, item) => {
          const qc = parseOcrNumber(item?.qty_cases);
          const upc = parseOcrNumber(item?.units_per_case);
          if (Number.isFinite(qc) && qc > 0 && Number.isFinite(upc) && upc > 0) {
            return acc + 1;
          }
          return acc;
        }, 0);
      const backendHasCaseInfo = hasStrongCaseInfo(cleanedBackendItems);
      const rawHasCaseInfo = hasStrongCaseInfo(cleanedRawItems);
      const backendCaseRowCount = countCaseRows(cleanedBackendItems);
      const rawCaseRowCount = countCaseRows(cleanedRawItems);
      const sumLineTotals = (items) =>
        (Array.isArray(items) ? items : []).reduce(
          (acc, item) => acc + (parseOcrNumber(item?.line_total_inc_vat) || 0),
          0
        );
      const grandTotalCandidate =
        parseOcrNumber(parsedFromRaw?.totals?.grand_total) ||
        parseOcrNumber(result?.validation?.grand_total) ||
        parseOcrNumber(result?.totals?.grand_total);
      const backendLineTotal = sumLineTotals(cleanedBackendItems);
      const rawLineTotal = sumLineTotals(cleanedRawItems);
      const backendDiffToGrand =
        Number.isFinite(grandTotalCandidate) && grandTotalCandidate > 0
          ? Math.abs(backendLineTotal - grandTotalCandidate)
          : null;
      const rawDiffToGrand =
        Number.isFinite(grandTotalCandidate) && grandTotalCandidate > 0
          ? Math.abs(rawLineTotal - grandTotalCandidate)
          : null;
      const backendMismatchWithGrand =
        Number.isFinite(backendDiffToGrand) &&
        backendDiffToGrand >
          Math.max(1, Number(grandTotalCandidate || 0) * 0.01);
      const rawCloserToGrand =
        Number.isFinite(rawDiffToGrand) &&
        Number.isFinite(backendDiffToGrand) &&
        rawDiffToGrand + 0.01 < backendDiffToGrand;
      const rawHasSignificantlyMoreItems =
        cleanedRawItems.length >= cleanedBackendItems.length + 2 &&
        rawScore >= backendScore + 25;
      const backendIsPythonFallback =
        parseSourceKey === "python_fallback";
      const backendBlocksRawFallback =
        backendIsStructuredParser &&
        cleanedBackendItems.length >= 2 &&
        (backendHasStructuredFields || backendLooksLikeStructuredTable);
      const preferRaw =
        !forceBackend &&
        !backendBlocksRawFallback &&
        cleanedRawItems.length > 0 &&
        (
          (
            backendWeak &&
            rawScore >= backendScore + 40 &&
            cleanedRawItems.length >= cleanedBackendItems.length
          ) ||
          rawHasSignificantlyMoreItems ||
          (backendMismatchWithGrand && rawCloserToGrand) ||
          (backendIsPythonFallback && cleanedRawItems.length >= cleanedBackendItems.length) ||
          (
            backendIsStructuredParser &&
            (
              (!backendHasCaseInfo && rawHasCaseInfo) ||
              rawCaseRowCount > backendCaseRowCount
            ) &&
            cleanedRawItems.length >= cleanedBackendItems.length
          )
        );
      const bestItems = preferRaw
        ? cleanedRawItems
        : cleanedBackendItems.length > 0
          ? cleanedBackendItems
          : cleanedRawItems;
      const orderedBestItems = orderItemsByReceiptLines(bestItems, rawLines);
      const orderedBackendItems = orderItemsByReceiptLines(cleanedBackendItems, rawLines);
      const mapItemsWithSupplierMatch = (items) =>
        (Array.isArray(items) ? items : []).map((item) => {
          const match = findBestIngredientMatch(item?.name, item?.unit);
          if (match && match.name) {
            return {
              ...item,
              name: match.name || item.name,
              unit: item.unit || match.unit || "pcs",
              matched_mapping: item?.matched_mapping || { ingredient: match.name, unit: match.unit },
            };
          }
          return item;
        });
      const hasMappedIngredient = (item) => Boolean(item?.matched_mapping?.ingredient);
      const templateApplied = Boolean(result?.template_applied);
      const mappedBestItems = mapItemsWithSupplierMatch(orderedBestItems);
      const mappedBackendItems = mapItemsWithSupplierMatch(orderedBackendItems);
      const uiBestItems = templateApplied
        ? mappedBestItems.filter(hasMappedIngredient)
        : mappedBestItems;
      const uiBackendItems = templateApplied
        ? mappedBackendItems.filter(hasMappedIngredient)
        : mappedBackendItems;
      const resolvedMerchant = String(
        (preferRaw
          ? parsedFromRaw?.merchant || result?.merchant
          : result?.merchant || parsedFromRaw?.merchant) ||
          ""
      ).trim();
      const resolvedDate = normalizeDateForInput(
        preferRaw ? parsedFromRaw?.date || result?.date : result?.date || parsedFromRaw?.date,
        rawText
      );
      const resolvedInvoiceNo =
        String(
          parsedFromRaw?.invoice_no ||
            result?.invoice_no ||
            result?.invoiceNo ||
            detectInvoiceNumber(rawText) ||
            ""
        ).trim() || null;
      const resolvedCurrency = normalizeCurrencyCode(
        parsedFromRaw?.currency || result?.currency || result?.currency_code || "TRY",
        rawText
      );
      const resolvedTotals = mergeParsedTotals(
        parsedFromRaw?.totals,
        result?.totals,
        result?.validation
      );
      const parsedReceiptForUi = {
        merchant: resolvedMerchant || null,
        date: resolvedDate || "",
        invoice_no: resolvedInvoiceNo,
        currency: resolvedCurrency,
        totals: resolvedTotals,
        items: uiBestItems,
      };
      setParsedReceiptOriginal(parsedReceiptForUi);
      setParsedReceiptEdited(() => {
        const next = cloneReceipt(parsedReceiptForUi);
        const supplierName = String(selectedSupplier?.name || "").trim();
        const supplierTaxNumber = String(selectedSupplier?.tax_number || "").trim();
        if (supplierName) next.merchant = supplierName;
        if (supplierTaxNumber) next.vat_number = supplierTaxNumber;
        return next;
      });
      const collectedErrors = [
        ...(Array.isArray(result?.parseErrors) ? result.parseErrors : []),
        ...(Array.isArray(result?.errors) ? result.errors : []),
        ...(Array.isArray(result?.warnings) ? result.warnings : []),
        ...(Array.isArray(hybridResult?.warnings) ? hybridResult.warnings : []),
      ].filter(Boolean);
      setParseErrors(collectedErrors);

      if (uiBestItems.length > 0) {
        const usingHybridForItems = preferRaw && useHybridRawItems;
        const parserWarnings = usingHybridForItems && Array.isArray(hybridResult?.warnings)
          ? hybridResult.warnings
          : [];
	        const parseSource = preferRaw
	          ? (useHybridRawItems ? (hybridResult?.source || "hybrid") : "legacy_regex")
	          : result?.parse_source || hybridResult?.source || null;
	        const parserResultSource = usingHybridForItems
	          ? hybridResult?.source || "hybrid"
	          : (preferRaw ? "regex" : (result?.parse_source || "backend"));
	        setInvoiceParsePreview({
          merchant: preferRaw
            ? parsedFromRaw?.merchant || result?.merchant || null
            : result?.merchant || parsedFromRaw?.merchant || null,
          date: preferRaw
            ? parsedFromRaw?.date || result?.date || null
            : result?.date || parsedFromRaw?.date || null,
          invoice_no: resolvedInvoiceNo,
          currency: resolvedCurrency,
          items: uiBestItems,
          totals: resolvedTotals,
          rejectedLines:
            parsedFromRaw?.rejectedLines?.length
              ? parsedFromRaw.rejectedLines
              : Array.isArray(result?.rejected)
                ? result.rejected
                : [],
          parseSource,
          parserResult: {
            source: parserResultSource,
            confidence: Number(
              usingHybridForItems ? hybridResult?.confidence || 0 : 0.9
            ),
            warnings: parserWarnings,
            aiUsed: Boolean(usingHybridForItems && hybridResult?.aiUsed),
          },
          suggestedTemplate: result?.suggested_template || null,
          templateApplied,
          validation:
            usingHybridForItems
              ? hybridResult?.validation || result?.validation || null
              : result?.validation || null,
        });
        const importTotalsForRows =
          parsedFromRaw?.totals ||
          result?.totals ||
          result?.validation ||
          null;
        if (applyParsedInvoiceItems(uiBestItems, { totals: importTotalsForRows })) {
          toast.success(t("OCR parsed invoice items. Please review before saving."));
          return;
        }
      }

      if (uiBackendItems.length > 0) {
        const importTotalsForBackendRows =
          result?.totals ||
          result?.validation ||
          parsedFromRaw?.totals ||
          null;
        if (applyParsedInvoiceItems(uiBackendItems, { totals: importTotalsForBackendRows })) {
          toast.info(t("OCR items loaded. Please review before saving."));
          return;
        }
      }

      toast.warn(t("OCR could not detect invoice items. Please enter manually."));
    } catch (err) {
      console.error("❌ OCR parse failed:", err);
      const msg = err?.message || t("OCR parsing failed");
      setOcrParseError(msg);
      toast.error(msg);
    } finally {
      setOcrParsing(false);
    }
  };

  const handleSaveSupplierTemplate = async () => {
    if (!selectedSupplier?.id) {
      toast.error(t("Please select a supplier first."));
      return;
    }
    const profile = invoiceParsePreview?.suggestedTemplate;
    if (!profile || typeof profile !== "object") {
      toast.warn(t("No template detected from this invoice."));
      return;
    }
    try {
      setSavingTemplate(true);
      await secureFetch(`/suppliers/${selectedSupplier.id}/invoice-template`, {
        method: "PUT",
        body: JSON.stringify({ profile }),
      });
      toast.success(t("Supplier layout template saved."));
    } catch (err) {
      console.error("❌ Error saving supplier layout template:", err);
      toast.error(t("Failed to save supplier layout template."));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSaveSupplierMappings = async () => {
    if (!selectedSupplier?.id) {
      toast.error(t("Please select a supplier first."));
      return;
    }

    const previewItems = Array.isArray(invoiceParsePreview?.items)
      ? invoiceParsePreview.items
      : [];
    const rows = Array.isArray(newTransaction?.rows) ? newTransaction.rows : [];
    if (!previewItems.length || !rows.length) {
      toast.warn(t("No parsed rows to map."));
      return;
    }

    const mappings = rows
      .map((row, idx) => {
        const ingredientName = String(row?.ingredient || "").trim();
        if (!ingredientName) return null;
        const parsedItem = previewItems[idx] || {};
        const supplierProductCode = String(parsedItem?.code || "").trim();
        const supplierProductName = String(parsedItem?.name || "").trim();
        if (!supplierProductCode && !supplierProductName) return null;
        return {
          supplier_product_code: supplierProductCode,
          supplier_product_name_raw: supplierProductName,
          supplier_product_name_normalized: normalizeTextKey(supplierProductName),
          ingredient_name: ingredientName,
          ingredient_unit: normalizeUnit(row?.unit || "pcs") || "pcs",
          units_per_case: parseOcrNumber(parsedItem?.units_per_case),
          mapped_unit: normalizeUnit(row?.unit || "pcs") || "pcs",
          conversion_multiplier: 1,
        };
      })
      .filter(Boolean);

    if (!mappings.length) {
      toast.warn(t("No valid product mappings found."));
      return;
    }

    try {
      setSavingMappings(true);
      const result = await secureFetch(`/suppliers/${selectedSupplier.id}/product-mappings/bulk`, {
        method: "POST",
        body: JSON.stringify({ mappings }),
      });
      const savedCount = Number(result?.saved || mappings.length);
      toast.success(t("Saved {{count}} product mappings.", { count: savedCount }));
    } catch (err) {
      console.error("❌ Error saving supplier product mappings:", err);
      toast.error(t("Failed to save product mappings."));
    } finally {
      setSavingMappings(false);
    }
  };

const handleAddTransaction = async (e) => {
  e?.preventDefault?.();

  if (!selectedSupplier) {
    toast.error(t("Please select a supplier first."));
    return;
  }

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const normalized = raw.replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  };

  const toNullableNumber = (value) => {
    if (value === null || value === undefined) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = raw.replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };

  const validRows = (newTransaction.rows || [])
    .map((r) => {
      const ingredient = String(r.ingredient || "").trim();
      const caseQty = toNumber(r.koli);
      const amountPerKoli = toNumber(r.amount_per_koli);
      const quantityInput = toNumber(r.quantity);
      const derivedQuantity = caseQty > 0 && amountPerKoli > 0 ? caseQty * amountPerKoli : 0;
      const quantity = derivedQuantity > 0 ? derivedQuantity : quantityInput;
      const discountRate = toNumber(r.discount_rate);
      const discountAmount = toNumber(r.discount_amount);
      const tax = toNumber(r.tax);
      const totalCostInput = toNumber(r.total_cost);
      const totalCost = totalCostInput > 0 ? totalCostInput : 0;
      const unit = r.unit;
      const pricePerUnit =
        quantity > 0 && totalCost > 0 ? totalCost / quantity : 0;
      const isCleaningSupply = Boolean(r.is_cleaning_supply);
      const countedStockLeft = toNullableNumber(r.counted_stock ?? r.stock_left ?? r.counted_left);
      const countedStockPayload =
        countedStockLeft !== null
          ? Number(
              (
                isCleaningSupply
                  ? countedStockLeft + quantity
                  : countedStockLeft
              ).toFixed(6)
            )
          : null;

      return {
        ingredient,
        quantity,
        koli: caseQty > 0 ? Number(caseQty.toFixed(4)) : null,
        amount_per_koli: amountPerKoli > 0 ? Number(amountPerKoli.toFixed(6)) : null,
        unit,
        discount_rate: discountRate > 0 ? Number(discountRate.toFixed(2)) : 0,
        discount_amount: discountAmount > 0 ? Number(discountAmount.toFixed(2)) : 0,
        tax,
        vat_rate: tax,
        total_cost: totalCost,
        is_cleaning_supply: isCleaningSupply,
        counted_stock: countedStockPayload,
        // Backward/forward compatibility: some backends expect unit_price / price_per_unit explicitly.
        price_per_unit: Number(pricePerUnit.toFixed(6)),
        unit_price: Number(pricePerUnit.toFixed(6)),
        expiry_date: r.expiry_date || null,
      };
    })
    .filter((r) => r.ingredient && r.quantity > 0 && r.total_cost > 0);

  if (validRows.length === 0) {
    toast.error(t("Please enter at least one valid ingredient row."));
    return;
  }
  const purchaseTotal = computeInvoiceTotals(
    Array.isArray(newTransaction?.rows) ? newTransaction.rows : []
  ).netTotal;

  const formData = new FormData();
  formData.append("supplier_id", selectedSupplier.id);
  formData.append("payment_method", newTransaction.paymentMethod || "Due");
  formData.append("rows", JSON.stringify(validRows)); // ✅ send all rows at once

  if (receiptFile) formData.append("receipt", receiptFile);
  if (receiptFileMeta) {
    formData.append(
      "source_file_meta",
      JSON.stringify({
        name: receiptFileMeta.name,
        size: receiptFileMeta.size,
        type: receiptFileMeta.type,
        uploadedAt: receiptFileMeta.uploadedAt,
      })
    );
  }
  if (ocrRawTextOriginal) formData.append("ocr_raw_text_original", ocrRawTextOriginal);
  if (ocrRawTextEdited) formData.append("ocr_raw_text_edited", ocrRawTextEdited);
  if (parsedReceiptOriginal) formData.append("parsed_json_original", JSON.stringify(parsedReceiptOriginal));
  if (parsedReceiptEdited) formData.append("parsed_json_cleaned", JSON.stringify(parsedReceiptEdited));
  formData.append(
    "corrections_meta",
    JSON.stringify({
      editedAt: new Date().toISOString(),
      trainingOptIn,
      version: 1,
    })
  );

	  try {
	    if (import.meta.env.DEV) {
	      console.log("📤 /suppliers/transactions rows payload:", validRows);
	    }
	    const result = await secureFetch("/suppliers/transactions", {
	      method: "POST",
	      body: formData,
	    });

	    if (result?.success) {
	      toast.success("✅ Compiled receipt saved successfully!");
	      await fetchTransactions(selectedSupplier.id);
	      await fetchSupplierDetails(selectedSupplier.id);
	      await fetchSuppliers();
	      await fetchStock();

	      if (isCashLabel(newTransaction.paymentMethod) && purchaseTotal > 0) {
	        await logCashRegisterEvent({
	          type: "supplier",
	          amount: purchaseTotal,
	          note: `${selectedSupplier?.name || "Supplier"} purchase`,
	        });
	        await openCashDrawer();
	      }
	      resetReceiptImport();
	    } else {
	      toast.error(result?.error || "❌ Failed to save receipt");
	    }
	  } catch (err) {
	    console.error("❌ Error saving compiled receipt:", err);
	    toast.error("❌ Error saving compiled receipt");
	  }
	};




const handleManageReceipt = (txn) => {
  if (txn?.receipt_url) {
    setPreviewImage(txn.receipt_url);
  } else {
    setShowUploadOptions(true);
  }
};

const handlePayment = async () => {
  if (!selectedSupplier?.id || !paymentAmount) return;
  try {
    const totalDueToUpdate = combinedDue; // 🧮 includes new order

    const res = await secureFetch(`/suppliers/${selectedSupplier.id}/pay`, {
      method: "PUT",
      body: JSON.stringify({
        payment: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        total_due: totalDueToUpdate, // ✅ include updated total
      }),
    });

    if (res?.message) {
      toast.success("💳 Payment successful!");

      // add the ingredient automatically after payment
      if (newTransaction.ingredient && newTransaction.total_cost && newTransaction.quantity) {
        await handleAddTransaction({ preventDefault: () => {}, auto: true });
      }

      await fetchTransactions(selectedSupplier.id);
      await fetchSupplierDetails(selectedSupplier.id);
      await fetchSuppliers();
      setPaymentModalOpen(false);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("reports:refresh"));
        window.dispatchEvent(new Event("expenses:refresh"));
      }

      if (isCashLabel(paymentMethod)) {
        const numericPayment = parseFloat(paymentAmount);
        if (numericPayment > 0) {
          await logCashRegisterEvent({
            type: "supplier",
            amount: numericPayment,
            note: `${selectedSupplier?.name || "Supplier"} payment`,
          });
          await openCashDrawer();
        }
      }
    } else {
      toast.error(res?.error || "❌ Payment failed");
    }
  } catch (err) {
    console.error("❌ Error processing payment:", err);
    toast.error("❌ Payment failed");
  }
};



  const handleAddSupplier = async () => {
    try {
      const created = await secureFetch("/suppliers", {
        method: "POST",
        body: JSON.stringify(newSupplier),
      });
      if (!created?.id) throw new Error("Supplier create failed");

      await fetchSupplierDetails(created.id);
      await fetchSuppliers();
      setTransactions([]);
      setNewSupplier({
        name: "",
        phone: "",
        email: "",
        address: "",
        tax_number: "",
        id_number: "",
        notes: "",
      });
      setSupplierModalOpen(false);
    } catch (error) {
      console.error("❌ Error adding supplier:", error);
      toast.error("Something went wrong. Please refresh and try again.");
    }
  };

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier?.id) return;
    try {
      await secureFetch(`/suppliers/${selectedSupplier?.
id}`, {
        method: "PUT",
        body: JSON.stringify(selectedSupplier),
      });
      toast.success("✅ Supplier updated successfully!");
      await fetchSuppliers();
      setEditModalOpen(false);
    } catch (error) {
      console.error("❌ Error updating supplier:", error);
      toast.error("❌ Failed to update supplier.");
    }
  };

  const handleEditSupplier = (supplier) => {
    if (!supplier || !supplier.id) return;
    setSelectedSupplier({ ...supplier });
    setEditModalOpen(true);
    setSupplierModalOpen(false);
  };

  const handleDownloadHistory = () => {
    if (!transactions.length) {
      toast.warn("No transactions to export.");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(transactions);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaction History");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `transactions_supplier_${selectedSupplier?.
id}.xlsx`);
  };

  const handleClearTransactions = async () => {
    if (!selectedSupplier?.id) return;
    if (!confirm(t("Are you sure you want to clear all transactions?"))) return;
    try {
      await secureFetch(`/suppliers/${selectedSupplier?.
id}/transactions`, {
        method: "DELETE",
      });
      toast.success("🧹 All transactions cleared.");
      await fetchTransactions(selectedSupplier?.
id);
      await fetchSupplierDetails(selectedSupplier?.
id);
    } catch (err) {
      console.error("❌ Error clearing transactions:", err);
      toast.error("❌ Failed to clear transactions.");
    }
  };
  const handleDeleteSupplier = async () => {
    if (!selectedSupplier?.id) return;
    try {
      const res = await secureFetch(`/suppliers/${selectedSupplier?.
id}`, {
        method: "DELETE",
      });
      if (res?.message) {
        toast.success("🚮 Supplier deleted successfully!");
        setEditModalOpen(false);
        fetchSuppliers();
      } else {
        toast.error("❌ Failed to delete supplier.");
      }
    } catch (err) {
      console.error("❌ Error deleting supplier:", err);
      toast.error("❌ Server error while deleting supplier.");
    }
  };

  const handleFeedbackInputChange = (field, value) => {
    setFeedbackForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmitFeedback = (event) => {
    event.preventDefault();
    const newEntry = {
      ...feedbackForm,
      quality: Number(feedbackForm.quality) || null,
      packaging: Number(feedbackForm.packaging) || null,
      punctuality: Number(feedbackForm.punctuality) || null,
      accuracy: Number(feedbackForm.accuracy) || null,
      deliveryTimeDays: feedbackForm.deliveryTimeDays
        ? Number(feedbackForm.deliveryTimeDays)
        : "",
      createdAt: new Date().toISOString(),
    };
    setFeedbackEntries((prev) => [newEntry, ...prev]);
    toast.success(t("Feedback saved for this supplier."));
    setFeedbackForm({
      quality: 4,
      packaging: 4,
      punctuality: 4,
      accuracy: 4,
      deliveryTimeDays: "",
      onTime: true,
      complaint: false,
      notes: "",
    });
  };

  const selectedSupplierDue = Number(selectedSupplier?.total_due ?? 0);
  const formattedSelectedSupplierDue = selectedSupplierDue.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  const performanceCardData = [
    {
      title: t("Avg delivery time"),
      value:
        performanceMetrics.avgDeliveryTime !== null
          ? `${performanceMetrics.avgDeliveryTime.toFixed(1)} ${t("days")}`
          : "—",
      description: t("Lead time based on recent feedback"),
      accent: "from-blue-500 to-indigo-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      ),
    },
    {
      title: t("On-time delivery"),
      value:
        performanceMetrics.onTimePercentage !== null
          ? `${Math.round(performanceMetrics.onTimePercentage)}%`
          : "—",
      description: t("Deliveries marked punctual"),
      accent: "from-emerald-500 to-teal-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    {
      title: t("Order accuracy score"),
      value:
        performanceMetrics.accuracyAverage !== null
          ? performanceMetrics.accuracyAverage.toFixed(1) + "/5"
          : "—",
      description: t("Staff reported order accuracy"),
      accent: "from-violet-500 to-purple-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.747 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
    },
    {
      title: t("Complaints this month"),
      value: performanceMetrics.complaintsCount
        ? performanceMetrics.complaintsCount.toString()
        : "0",
      description: t("Flagged entries in feedback log"),
      accent: "from-rose-500 to-orange-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.62 1.73-3L13.73 4c-.77-1.38-2.69-1.38-3.46 0L3.2 16c-.77 1.38.19 3 1.73 3z"
          />
        </svg>
      ),
    },
  ];


  return (
<div
  ref={containerRef}
  className="h-screen overflow-y-scroll bg-slate-50 px-4 py-8 transition-colors duration-300 dark:bg-slate-950 sm:px-6 lg:px-10 scrollbar-hide"
>


      
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur"
          onClick={() => setPreviewImage(null)}
          style={{ cursor: "zoom-out" }}
        >
          <img
            src={
              previewImage.startsWith("http")
                ? previewImage
                : BACKEND_URL + previewImage
            }
            alt={t("Receipt preview")}
            className="max-h-[90vh] max-w-[95vw] rounded-3xl border-8 border-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

		      <div className="mx-auto max-w-7xl space-y-10">
	        {/* --- SUPPLIERS TAB --- */}
		        {activeTab === "suppliers" && (
		          <>
		          <div className="space-y-10">
         
<section
  id="primary-supplier"
  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
>
  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
      <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950/40 sm:w-auto">
        <div className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
          {selectedSupplier?.name
            ? String(selectedSupplier.name).trim().slice(0, 1).toUpperCase()
            : "S"}
        </div>

        <div className="relative min-w-0 flex-1">
          <select
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm font-semibold text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            value={selectedSupplier?.id || ""}
            onChange={(e) => handleSelectSupplier(e.target.value)}
          >
            <option value="">{t("Select Supplier")}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto">
        {selectedSupplier?.phone && (
          <a href={`tel:${selectedSupplier.phone}`} className="w-full sm:w-auto">
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600 active:scale-[0.98]"
            >
              {t("Call Supplier")}
            </button>
          </a>
        )}

        <button
          type="button"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:via-indigo-600 hover:to-violet-600 active:scale-[0.98]"
          onClick={() => setSupplierModalOpen(true)}
        >
          {t("Add Supplier")}
        </button>

        {selectedSupplier && (
          <button
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-amber-500 hover:via-amber-600 hover:to-orange-600 active:scale-[0.98]"
            onClick={() => handleEditSupplier(selectedSupplier)}
          >
            {t("Edit Supplier")}
          </button>
        )}

        {selectedSupplier && (
          <button
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/60 bg-rose-50/80 px-5 py-2.5 text-sm font-semibold text-rose-600 shadow-md transition hover:bg-rose-100 active:scale-[0.98] dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:bg-rose-950/30"
            onClick={() => {
              if (confirm(t("Are you sure you want to delete this supplier?"))) {
                handleDeleteSupplier();
              }
            }}
          >
            {t("Delete Supplier")}
          </button>
        )}
      </div>
    </div>
  </div>
</section>

                  <div className="flex flex-col gap-6">
                  {selectedSupplier && (
                    <section
                      id="profile-balance"
                      className="order-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                                {t("Supplier Profile & Balance")}
                              </h2>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t(
                                  "Keep contacts, debt exposure, and account history aligned for your team."
                                )}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700/70 dark:text-slate-300">
                              <span className="h-2 w-2 rounded-full bg-emerald-400" />
                              {t("Open invoices")}: {supplierFinancials.openInvoices}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Outstanding")}
                              </p>
                              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(supplierFinancials.outstanding)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Total purchases")}
                              </p>
                              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(supplierFinancials.totalPurchases)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Payments made")}
                              </p>
                              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(supplierFinancials.totalPaid)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Month spend")}
                              </p>
                              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                                {formatCurrency(supplierFinancials.monthPurchases)}
                              </p>
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Primary contact")}
                              </p>
                              <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Name")}:
                                  </strong>{" "}
                                  {selectedSupplier?.name}
                                </p>
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Phone")}:
                                  </strong>{" "}
                                  {selectedSupplier?.phone || t("Not available")}
                                </p>
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Email")}:
                                  </strong>{" "}
                                  {selectedSupplier?.email || t("Not available")}
                                </p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white/90 p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                              <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                                {t("Business details")}
                              </p>
                              <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Tax number")}:
                                  </strong>{" "}
                                  {selectedSupplier?.tax_number || t("Not available")}
                                </p>
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("ID number")}:
                                  </strong>{" "}
                                  {selectedSupplier?.id_number || t("Not available")}
                                </p>
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Address")}:
                                  </strong>{" "}
                                  {selectedSupplier?.address || t("Not available")}
                                </p>
                                <p>
                                  <strong className="font-semibold text-slate-700 dark:text-white">
                                    {t("Notes")}:
                                  </strong>{" "}
                                  {selectedSupplier?.notes || "—"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-4 text-white shadow-lg">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-slate-900 to-emerald-500/20" />
                            <div className="relative z-10 space-y-3.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">
                                    {t("Outstanding balance")}
                                  </p>
                                  <p className="mt-1.5 text-2xl font-semibold">
                                    {formatCurrency(supplierFinancials.outstanding)}
                                  </p>
                                </div>
                                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                  {t("Coverage")}:{" "}
                                  {coveragePercent !== null
                                    ? `${coveragePercent.toFixed(0)}%`
                                    : "—"}
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-white/60">
                                  <span>{t("Paid coverage")}</span>
                                  <span>
                                    {coveragePercent !== null
                                      ? `${coveragePercent.toFixed(0)}%`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full bg-emerald-300"
                                    style={{
                                      width: `${
                                        coveragePercent !== null ? coveragePercent : 0
                                      }%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <ul className="space-y-0.5 text-xs text-white/70">
                                <li>
                                  <span className="font-semibold text-white">
                                    {t("Last invoice")}:
                                  </span>{" "}
                                  {supplierFinancials.lastInvoiceDate
                                    ? supplierFinancials.lastInvoiceDate.toLocaleDateString()
                                    : t("Not available")}
                                </li>
                                <li>
                                  <span className="font-semibold text-white">
                                    {t("Last payment")}:
                                  </span>{" "}
                                  {supplierFinancials.lastPaymentDate
                                    ? supplierFinancials.lastPaymentDate.toLocaleDateString()
                                    : t("Not available")}
                                </li>
                              </ul>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow transition hover:shadow-md"
                                  onClick={() => setPaymentModalOpen(true)}
                                >
                                  ✅ {t("Settle now")}
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                                  onClick={handleDownloadHistory}
                                >
                                  📥 {t("Export statement")}
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white/95 p-3.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                            <p className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                              {t("Month to date overview")}
                            </p>
                            <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                              <div className="flex items-center justify-between">
                                <span>{t("Spend this month")}</span>
                                <strong className="text-slate-900 dark:text-white">
                                  {formatCurrency(supplierFinancials.monthPurchases)}
                                </strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>{t("Payments received")}</span>
                                <strong className="text-slate-900 dark:text-white">
                                  {formatCurrency(supplierFinancials.monthPayments)}
                                </strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span>{t("Projected balance after order")}</span>
                                <strong
                                  className={`${
                                    projectedBalance > supplierFinancials.outstanding
                                      ? "text-rose-600 dark:text-rose-400"
                                      : "text-emerald-600 dark:text-emerald-400"
                                  }`}
                                >
                                  {formatCurrency(projectedBalance)}
                                </strong>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2">
                              <p className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                                {t("Recent receipts")}
                              </p>
                              {recentReceipts.length > 0 ? (
                                recentReceipts.map((receiptTxn) => (
                                  <div
                                    key={receiptTxn.id || receiptTxn.receipt_url}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className="truncate">{receiptTxn.ingredient || t("Purchase")}</span>
                                      <span className="text-[9px] font-normal text-slate-400 dark:text-slate-500">
                                        {getLocalizedDate(resolveTxnDate(receiptTxn))}
                                      </span>
                                      {(() => {
                                        const expiryLabel =
                                          getReceiptExpirySummary(receiptTxn);
                                        return (
                                          expiryLabel && (
                                            <span className="text-[9px] font-normal text-amber-600 dark:text-amber-300">
                                              {expiryLabel}
                                            </span>
                                          )
                                        );
                                      })()}
                                    </div>
                                    <button
                                      type="button"
                                      className="text-[10px] text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200 flex-shrink-0"
                                      onClick={() =>
                                        setPreviewImage(receiptTxn.receipt_url)
                                      }
                                    >
                                      {t("View")}
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                  {t(
                                    "No receipts uploaded yet. Attach one with your next delivery."
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                    <div>
                      <div
                        id="purchasing-receipts"
                        className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                              {t("Purchasing & Receipts")}
                            </h2>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {selectedSupplier && (
                                <>
                                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-700">
                                    <span className="text-slate-500 dark:text-slate-400">
                                      {t("Due")}:
                                    </span>
                                    <span
                                      className={
                                        Number(supplierFinancials?.outstanding ?? selectedSupplierDue) > 0
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-emerald-600 dark:text-emerald-400"
                                      }
                                    >
                                      {formatCurrency(
                                        Number(supplierFinancials?.outstanding ?? selectedSupplierDue) || 0
                                      )}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => setPaymentModalOpen(true)}
                                    disabled={
                                      !(Number(supplierFinancials?.outstanding ?? selectedSupplierDue) > 0)
                                    }
                                  >
                                    {t("Pay now")}
                                  </button>
                                  <div className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-slate-900 via-indigo-600 to-indigo-400 px-5 py-2.5 text-sm font-semibold text-white shadow-md ring-1 ring-indigo-500/50 dark:from-slate-800 dark:via-indigo-500 dark:to-indigo-400">
                                    <span>{selectedSupplier.name}</span>
                                  </div>
                                </>
                              )}
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:from-indigo-500 hover:via-indigo-600 hover:to-violet-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setShowUploadOptions(true)}
                                disabled={ocrParsing}
                              >
                                {ocrParsing ? (
                                  <>
                                    <svg
                                      className="h-4 w-4 animate-spin"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      aria-hidden="true"
                                    >
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="9"
                                        stroke="currentColor"
                                        strokeOpacity="0.25"
                                        strokeWidth="3"
                                      />
                                      <path
                                        d="M21 12a9 9 0 0 0-9-9"
                                        stroke="currentColor"
                                        strokeWidth="3"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                    {t("Parsing...")}
                                  </>
                                ) : (
                                  <>
                                    {t("Upload Receipt")}
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t(
                              "Manage deliveries, attach receipts, and track balances."
                            )}
                          </p>
                        </div>

                        <div className="mt-4 border-t border-slate-200/80 dark:border-slate-800" />

                        <form
                          onSubmit={handleAddTransaction}
                          className="mt-4 space-y-3"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                                {t("Upload")}
                              </span>
                              <span>→</span>
                              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                                {t("OCR")}
                              </span>
                              <span>→</span>
                              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                                {t("Review")}
                              </span>
                              <span>→</span>
                              <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                                {t("Save")}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {t("New delivery entry")}
                            </h3>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-3 md:sticky md:top-4 md:self-start">
                              <ReceiptPreview
                                t={t}
                                previewUrl={receiptPreviewUrl || previewImage}
                                fileMeta={receiptFileMeta}
                                formatBytes={formatBytes}
                                ocrSelectableTokens={ocrSelectableTokens}
                                requestSelectionOcr={requestSelectionOcr}
                                onReplace={() => fileInputRef?.current?.click?.()}
                                onClear={resetReceiptImport}
                              />
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                {["corrections", "json", "ocr"].map((tab) => {
                                  const labels = {
                                    ocr: t("OCR Text"),
                                    json: t("Structured JSON"),
                                    corrections: t("Corrections"),
                                  };
                                  const active = reviewTab === tab;
                                  return (
                                    <button
                                      key={tab}
                                      type="button"
                                      onClick={() => setReviewTab(tab)}
                                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                                        active
                                          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-100"
                                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                      }`}
                                    >
                                      {labels[tab]}
                                    </button>
                                  );
                                })}
                              </div>

                              {reviewTab === "ocr" && (
                                <OcrTextEditor
                                  t={t}
                                  originalText={ocrRawTextOriginal}
                                  editedText={ocrRawTextEdited}
                                  onChangeEdited={setOcrRawTextEdited}
                                  onReset={() => setOcrRawTextEdited(ocrRawTextOriginal)}
                                  onCopy={() => navigator?.clipboard?.writeText?.(ocrRawTextEdited || "")}
                                  isLoading={ocrParsing}
                                  parseErrors={parseErrors}
                                  discountNote={
                                    (parsedReceiptEdited?.items || parsedReceiptOriginal?.items || []).some(
                                      (it) => Number(it?.discount_rate) > 0 || Number(it?.discount_amount) > 0
                                    )
                                      ? t("Discount values detected in parsed items.")
                                      : ""
                                  }
                                  koliNote={
                                    (parsedReceiptEdited?.items || parsedReceiptOriginal?.items || []).some(
                                      (it) =>
                                        Number(it?.amount_per_koli) > 0 ||
                                        Number(it?.units_per_case) > 0
                                    )
                                      ? t("Amount per koli/case detected in parsed items.")
                                      : ""
                                  }
                                />
                              )}

                              {reviewTab === "json" && (
                                <JsonPreview
                                  t={t}
                                  receipt={parsedReceiptEdited || parsedReceiptOriginal}
                                  rawJson={parsedReceiptEdited || parsedReceiptOriginal}
                                />
                              )}

                              {reviewTab === "corrections" && (
                                <div className="space-y-3">
                                  <ReceiptEditor
                                    t={t}
                                    receipt={parsedReceiptEdited || parsedReceiptOriginal}
                                    supplierId={selectedSupplier?.id}
                                    supplierIngredients={supplierIngredients}
                                    onChange={(next) => {
                                      const cloned = cloneReceipt(next);
                                      setParsedReceiptEdited(cloned);

                                      if (receiptRowsSyncTimeoutRef.current) {
                                        clearTimeout(receiptRowsSyncTimeoutRef.current);
                                        receiptRowsSyncTimeoutRef.current = null;
                                      }
                                      receiptRowsSyncTimeoutRef.current = setTimeout(() => {
                                        const items = Array.isArray(cloned?.items) ? cloned.items : [];
                                        if (items.length > 0) {
                                          applyParsedInvoiceItems(items, { totals: cloned?.totals || null });
                                        }
                                      }, 150);
                                    }}
                                  />
                                  <ValidationSummary
                                    t={t}
                                    receipt={parsedReceiptEdited || parsedReceiptOriginal}
                                  />
                                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    <input
                                      type="checkbox"
                                      checked={trainingOptIn}
                                      onChange={(e) => setTrainingOptIn(e.target.checked)}
                                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    {t("Use this corrected receipt to improve Beypro invoice AI")}
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 lg:ml-auto lg:w-fit">
                            <div className="flex flex-col gap-3 text-sm lg:flex-row lg:items-start lg:justify-end">
                              <div className="space-y-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    {t("Subtotal")}
                                  </span>
                                  <span className="text-lg font-semibold text-rose-600 dark:text-rose-400">
                                    {formatCurrency(orderCostSummary.totalBase)}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    {t("Total Discount")}
                                  </span>
                                  <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                                    -{formatCurrency(orderCostSummary.totalDiscount)}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                    {t("Total VAT")}
                                  </span>
                                  <span className="text-base font-semibold text-amber-600 dark:text-amber-400">
                                    {formatCurrency(orderCostSummary.totalTax)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-4 border-t border-slate-200 pt-1.5 dark:border-slate-700">
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      {t("Amount To Pay")}
                                    </span>
                                    <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                                      {formatCurrency(orderNetTotal)}
                                    </span>
                                  </div>
                                  {selectedSupplier && (
                                    <div className="ml-auto flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={handleAddTransaction}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
                                      >
                                        ✅ {t("Confirm Order")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPaymentModalOpen(true)}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                      >
                                        💳 {t("Pay Now")}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {invoiceParsePreview && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 mt-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-slate-800 dark:text-slate-100">
                                  {t("Preview Parsed Items")}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {t("Items")}: {invoiceParsePreview.items?.length || 0}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>
                                  {t("Merchant")}:{" "}
                                  {invoiceParsePreview.merchant || t("Not available")}
                                </span>
                                <span>
                                  {t("Date")}:{" "}
                                  {invoiceParsePreview.date || t("Not available")}
                                </span>
                                <span>
                                  {t("Invoice #")}:{" "}
                                  {invoiceParsePreview.invoice_no || t("Not available")}
                                </span>
                                {invoiceParsePreview.totals?.grand_total ? (
                                  <span>
                                    {t("Grand total")}:{" "}
                                    {formatCurrency(
                                      Number(invoiceParsePreview.totals.grand_total || 0)
                                    )}
                                  </span>
                                ) : null}
                                {invoiceParsePreview.totals?.tax_included ? (
                                  <span>{t("Tax included")}</span>
                                ) : null}
                                {invoiceParsePreview.validation?.parsed_line_total ? (
                                  <span>
                                    {t("Parsed line sum")}:{" "}
                                    {formatCurrency(
                                      Number(invoiceParsePreview.validation.parsed_line_total || 0)
                                    )}
                                  </span>
                                ) : null}
                                {typeof invoiceParsePreview.templateApplied === "boolean" ? (
                                  <span>
                                    {t("Template applied")}:{" "}
                                    {invoiceParsePreview.templateApplied ? t("Yes") : t("No")}
                                  </span>
                                ) : null}
                                {invoiceParsePreview.parseSource ? (
                                  <span>
                                    {t("Parse source")}: {invoiceParsePreview.parseSource}
                                  </span>
                                ) : null}
                              </div>
                              {invoiceParsePreview?.parserResult ? (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-900/60">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                                      {t("Parser result")}
                                    </span>
                                    {(() => {
                                      const source = String(
                                        invoiceParsePreview?.parserResult?.source || ""
                                      ).toLowerCase();
                                      const badgeClass =
                                        source === "regex"
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-200"
                                          : source === "hybrid"
                                            ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-700/60 dark:bg-fuchsia-900/30 dark:text-fuchsia-200"
                                            : "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/30 dark:text-blue-200";
                                      const sourceLabel =
                                        source === "regex"
                                          ? "Regex"
                                          : source === "hybrid"
                                            ? "Hybrid"
                                            : source === "llm"
                                              ? "AI assisted"
                                              : source || "Regex";
                                      return (
                                        <span
                                          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}
                                        >
                                          {sourceLabel}
                                        </span>
                                      );
                                    })()}
                                    {invoiceParsePreview?.parserResult?.aiUsed ? (
                                      <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-700/60 dark:bg-blue-900/30 dark:text-blue-200">
                                        {t("AI assisted")}
                                      </span>
                                    ) : null}
                                    <span className="text-slate-500 dark:text-slate-400">
                                      {t("Confidence")}:{" "}
                                      {Math.round(
                                        Number(invoiceParsePreview?.parserResult?.confidence || 0) * 100
                                      )}
                                      %
                                    </span>
                                  </div>
                                  {Array.isArray(invoiceParsePreview?.parserResult?.warnings) &&
                                  invoiceParsePreview.parserResult.warnings.length > 0 ? (
                                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-amber-700 dark:text-amber-300">
                                      {invoiceParsePreview.parserResult.warnings.map((warning, idx) => (
                                        <li key={`${warning}-${idx}`}>{warning}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveSupplierTemplate}
                                  disabled={
                                    savingTemplate ||
                                    !selectedSupplier?.id ||
                                    !invoiceParsePreview?.suggestedTemplate
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  {savingTemplate
                                    ? t("Saving template...")
                                    : t("Save as supplier template")}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSaveSupplierMappings}
                                  disabled={savingMappings || !selectedSupplier?.id}
                                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-700/70 dark:bg-emerald-900/20 dark:text-emerald-200 dark:hover:bg-emerald-900/30"
                                >
                                  {savingMappings
                                    ? t("Saving mappings...")
                                    : t("Save product mappings")}
                                </button>
                              </div>

                              {invoiceParsePreview.items?.length > 0 && (
                                <div className="mt-3 grid grid-cols-1 gap-2">
                                  {invoiceParsePreview.items.map((item, idx) => (
                                    <div
                                      key={`${item.code || item.name}-${idx}`}
                                      className="rounded-xl border border-slate-200 bg-white/90 p-3 text-[11px] shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                                          {item.name || t("Unnamed item")}
                                        </span>
                                        {item.code && (
                                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                            #{item.code}
                                          </span>
                                        )}
                                      </div>
                                      {item?.matched_mapping?.ingredient ? (
                                        <div className="mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                                          {t("Mapped to")}: {item.matched_mapping.ingredient}
                                          {item.matched_mapping.unit
                                            ? ` (${item.matched_mapping.unit})`
                                            : ""}
                                        </div>
                                      ) : null}
                                      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500 dark:text-slate-400">
                                        {item.qty_cases !== null && (
                                          <span>
                                            {t("Cases")}: {item.qty_cases}
                                          </span>
                                        )}
                                        {item.units_per_case !== null && (
                                          <span>
                                            {t("Units/Case")}: {item.units_per_case}
                                          </span>
                                        )}
                                        {item.qty_units !== null && (
                                          <span>
                                            {t("Qty Units")}: {Number(item.qty_units).toFixed(2)}
                                          </span>
                                        )}
                                        {item.unit && (
                                          <span>
                                            {t("Unit")}: {item.unit}
                                          </span>
                                        )}
                                        {item.unit_price_ex_vat !== null && (
                                          <span>
                                            {t("Unit price")}:
                                            {formatCurrency(Number(item.unit_price_ex_vat || 0))}
                                          </span>
                                        )}
                                        {item.discount_rate !== null && Number(item.discount_rate) > 0 && (
                                          <span>
                                            {t("Discount")}: {Number(item.discount_rate).toFixed(2)}%
                                          </span>
                                        )}
                                        {item.discount_amount !== null && Number(item.discount_amount) > 0 && (
                                          <span>
                                            {t("Discount amount")}:
                                            {formatCurrency(Number(item.discount_amount || 0))}
                                          </span>
                                        )}
                                        {item.vat_rate !== null && (
                                          <span>
                                            {t("VAT")}: {item.vat_rate}%
                                          </span>
                                        )}
                                        {item.line_total_inc_vat !== null && (
                                          <span>
                                            {t("Line total")}:
                                            {formatCurrency(
                                              Number(item.line_total_inc_vat || 0)
                                            )}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Rejected OCR lines are intentionally not shown in the UI. */}
                            </div>
                          )}
                          {ocrParsing && (
                            <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-700/40 dark:bg-indigo-900/20 dark:text-indigo-300">
                              <svg
                                className="h-4 w-4 animate-spin"
                                viewBox="0 0 24 24"
                                fill="none"
                                aria-hidden="true"
                              >
                                <circle
                                  cx="12"
                                  cy="12"
                                  r="9"
                                  stroke="currentColor"
                                  strokeOpacity="0.25"
                                  strokeWidth="3"
                                />
                                <path
                                  d="M21 12a9 9 0 0 0-9-9"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                />
                              </svg>
                              {t("Reading receipt...")}
                            </div>
                          )}
                        </form>
                      </div>
                    </div>

                  </div>

		   <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
	              <div className="space-y-6">
	                <div className="space-y-4">
                                  {/* === Latest Added Entry Preview === */}
{latestTransaction && (
  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
      🆕 {t("Latest Added Order")}
    </h3>
    <div className="flex flex-wrap justify-between text-sm text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-semibold">{t("Ingredient")}:</span>{" "}
        {latestTransaction.ingredient}
      </p>
      <p>
        <span className="font-semibold">{t("Quantity")}:</span>{" "}
        {latestTransaction.quantity} {latestTransaction.unit}
      </p>
      <p>
        <span className="font-semibold">{t("Total Cost")}:</span>{" "}
        {formatCurrency(Number(latestTransaction.total_cost || 0))}
      </p>
      <p>
        <span className="font-semibold">{t("Payment Method")}:</span>{" "}
        {latestTransaction.payment_method}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("Added at")}: {new Date(latestTransaction.created_at).toLocaleString()}
      </p>
    </div>
  </div>
)}
<section id="transaction-history" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
  <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {t("Transaction History")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {t("Review every purchase and payment with clear statuses.")}
        </p>
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end sm:justify-end">
        <div className="inline-flex w-full overflow-x-auto rounded-full border border-slate-200 bg-white p-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:w-auto">
          {[
            { value: "all", label: t("All") },
            { value: "purchases", label: t("Purchases") },
            { value: "payments", label: t("Payments") },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTransactionView(option.value)}
              className={`inline-flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition sm:flex-none sm:min-w-[110px] ${
                transactionView === option.value
                  ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t("From")}
            <input
              type="date"
              value={transactionDateFrom}
              max={transactionDateTo || undefined}
              onChange={(e) => setTransactionDateFrom(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {t("To")}
            <input
              type="date"
              value={transactionDateTo}
              min={transactionDateFrom || undefined}
              onChange={(e) => setTransactionDateTo(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          {(transactionDateFrom || transactionDateTo) && (
            <button
              type="button"
              onClick={() => {
                setTransactionDateFrom("");
                setTransactionDateTo("");
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {t("Clear")}
            </button>
          )}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Outstanding")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(supplierFinancials.outstanding)}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Total purchases")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(transactionHistoryTotals.totalPurchases)}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("Payments made")}
        </p>
        <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">
          {formatCurrency(transactionHistoryTotals.totalPaid)}
        </p>
      </div>
    </div>
{filteredTransactions.length > 0 ? (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
    <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      <div className="col-span-3">{t("Date")}</div>
      <div className="col-span-2">{t("Type")}</div>
      <div className="col-span-4">{t("Description")}</div>
      <div className="col-span-2">{t("Payment Method")}</div>
      <div className="col-span-1 text-right">{t("Amount")}</div>
    </div>
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {filteredTransactions.map((txn, idx) => {
        const isPayment = txn?.ingredient === "Payment";
        const totalCost = Number(txn?.total_cost) || 0;
        const amountPaid = Number(txn?.amount_paid) || 0;
        const effectivePayment = amountPaid || totalCost;
        const delta = isPayment ? -effectivePayment : totalCost;

        const dateLabel = getLocalizedDate(resolveTxnDate(txn));
        const paymentLabel =
          txn?.payment_method && paymentChipLabel(txn.payment_method);
        const hasItems = Array.isArray(txn?.items) && txn.items.length > 0;
        const hasReceipt = !!txn?.receipt_url;
        const hasDetails = hasItems || hasReceipt;

        const typeLabel = isPayment ? t("Payments") : t("Purchases");
        const description = isPayment
          ? t("Payment recorded")
          : txn?.ingredient || t("Compiled Receipt");

        const rowKey =
          txn?.id ||
          `${resolveTxnDate(txn) || "txn"}:${txn?.ingredient || "item"}:${idx}`;

        const row = (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 px-4 py-3">
            <div className="sm:col-span-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {dateLabel}
            </div>
            <div className="sm:col-span-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isPayment
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                }`}
              >
                {typeLabel}
              </span>
            </div>
            <div className="sm:col-span-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {description}
                </span>
                {hasItems && (
                  <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {txn.items.length} {t("Items")}
                  </span>
                )}
                {hasReceipt && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewImage(txn.receipt_url);
                    }}
                    className="flex-shrink-0 text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                  >
                    {t("View receipt")}
                  </button>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              {paymentLabel ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {paymentLabel}
                </span>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
              )}
            </div>
            <div className="sm:col-span-1 text-right text-sm font-semibold">
              <span
                className={
                  delta < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {delta < 0 ? "−" : "+"}
                {formatCurrency(Math.abs(delta))}
              </span>
            </div>
          </div>
        );

        if (!hasDetails) {
          return <div key={rowKey}>{row}</div>;
        }

        return (
          <details key={rowKey} className="group">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">{row}</div>
                <div className="hidden sm:flex items-center px-2 text-slate-400 dark:text-slate-500">
                  <span className="group-open:hidden">▾</span>
                  <span className="hidden group-open:inline">▴</span>
                </div>
              </div>
            </summary>
            {hasItems && (
              <div className="px-4 pb-4">
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="grid grid-cols-12 gap-2 border-b border-slate-200 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <div className="col-span-6">{t("Ingredient")}</div>
                    <div className="col-span-2 text-right">{t("Quantity")}</div>
                    <div className="col-span-2 text-right">{t("Tax")}</div>
                    <div className="col-span-2 text-right">{t("Total cost")}</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {txn.items.map((item, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 text-sm">
                        <div className="col-span-6 font-semibold text-slate-800 dark:text-slate-100">
                          {item?.ingredient || t("Unnamed item")}
                        </div>
                        <div className="col-span-2 text-right text-slate-600 dark:text-slate-300">
                          {item?.quantity ?? "—"} {item?.unit || ""}
                        </div>
	                        <div className="col-span-2 text-right text-slate-600 dark:text-slate-300">
	                          {(() => {
	                            const taxRate = parseOcrNumber(
	                              item?.tax ?? item?.vat_rate ?? item?.tax_rate ?? null
	                            );
	                            return Number.isFinite(taxRate) ? `${taxRate}%` : "—";
	                          })()}
	                        </div>
                        <div className="col-span-2 text-right font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(Number(item?.total_cost || 0))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </details>
        );
      })}
    </div>
  </div>
) : (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
    {t("No transactions recorded yet for this supplier.")}
  </div>
)}



  </div>
</section>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Suppliers connected")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {suppliers.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Tracked transactions")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {transactions.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Active price alerts")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {priceAlerts.length}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500 dark:text-slate-400">
                      {t("Feedback entries logged")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                      {feedbackEntries.length}
                    </p>
                  </div>
                </div>
             
              </div>
            </section>
	                    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
	                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
	                        {t("Recent receipts")}
	                      </p>
	                      <div className="mt-4 space-y-3">
	                        {recentReceipts.length > 0 ? (
	                          recentReceipts.map((receiptTxn) => (
	                            <div
	                              key={receiptTxn.id || receiptTxn.receipt_url}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                            >
                              <div className="flex flex-col">
                                <span>{receiptTxn.ingredient || t("Purchase")}</span>
                                <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
                                  {getLocalizedDate(resolveTxnDate(receiptTxn))}
                                </span>
                                {(() => {
                                  const expiryLabel = getReceiptExpirySummary(receiptTxn);
                                  return (
                                    expiryLabel && (
                                      <span className="text-[11px] font-normal text-amber-600 dark:text-amber-300">
                                        {expiryLabel}
                                      </span>
                                    )
                                  );
                                })()}
                              </div>
                              <button
                                type="button"
                                className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-300 dark:hover:text-indigo-200"
                                onClick={() => setPreviewImage(receiptTxn.receipt_url)}
                              >
                                {t("View")}
                              </button>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {t("No receipts uploaded yet. Attach one with your next delivery.")}
                          </p>
                        )}
                      </div>
                    </div>
 
	{/* === SUPPLIER OVERVIEW SECTION === */}
	<section id="supplier-overview" className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
	  <div className="space-y-6">
	    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
	      <div>
	        <h2 className="text-xl font-bold text-slate-800 dark:text-white">
	          {t("Supplier Overview")}
	        </h2>
	        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
	          {t("Monitor supplier dues, payments, and spending at a glance.")}
	        </p>
	      </div>
	    </div>

	    {/* === Overview Box === */}
	    <div className="mt-6">
	      <SupplierOverview suppliers={suppliers} t={t} />
	    </div>
	  </div>
	</section>
<section id="price-tracking" className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
	                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
	                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
	                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {t("Smart Price Tracking & Alerts")}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {t(
                            "Automatically highlight unusual ingredient price swings so you can react quickly."
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      {priceAlerts.length > 0 ? (
                        priceAlerts.map((alert, idx) => {
                          const isIncrease = alert.changePercent >= 0;
                          const changeText = `${isIncrease ? "+" : ""}${alert.changePercent.toFixed(
                            1
                          )}%`;
                          const sinceLabel = alert.since
                            ? new Date(alert.since).toLocaleDateString()
                            : t("recently");
                          return (
                            <div
                              key={`${alert.ingredient}-${idx}`}
                              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-base font-semibold text-slate-900 dark:text-white">
                                  {alert.ingredient}
                                </p>
                                <span
                                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                                    isIncrease
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
                                      : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                  }`}
                                >
                                  {isIncrease ? "▲" : "▼"} {changeText}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                                <span>
                                  {t("Latest price")}:{" "}
                                  <strong className="text-slate-700 dark:text-slate-200">
                                    {formatCurrency(alert.latestPrice)}
                                  </strong>
                                </span>
                                <span>
                                  {t("Baseline")}:{" "}
                                  <strong className="text-slate-700 dark:text-slate-200">
                                    {formatCurrency(alert.comparisonPrice)}
                                  </strong>
                                </span>
                                <span>
                                  {t("Compared to")}: {sinceLabel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {isIncrease
                                  ? t("Consider negotiating or sourcing alternates.")
                                  : t("Opportunity: cost improvements worth leveraging.")}
                              </p>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                          {t("No significant price changes detected yet.")}
                        </div>
                      )}
                    </div>
                  </div>

<div id="feedback-log"  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-200 pb-4 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {t("Supplier Rating & Feedback Log")}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t(
                          "Capture quick post-delivery insights to grow a dependable supplier scorecard."
                        )}
                      </p>
                    </div>
                    <form className="mt-4 space-y-4" onSubmit={handleSubmitFeedback}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {["quality", "packaging", "punctuality", "accuracy"].map((field) => (
                          <label
                            key={field}
                            className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300"
                          >
                            {t(field.charAt(0).toUpperCase() + field.slice(1))}
                            <select
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              value={feedbackForm[field]}
                              onChange={(e) =>
                                handleFeedbackInputChange(field, Number(e.target.value))
                              }
                            >
                              {[1, 2, 3, 4, 5].map((score) => (
                                <option key={score} value={score}>
                                  {score} / 5
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                          {t("Delivery time (days)")}
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={feedbackForm.deliveryTimeDays}
                            onChange={(e) =>
                              handleFeedbackInputChange("deliveryTimeDays", e.target.value)
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            placeholder="2.5"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                          {t("Delivered on time?")}
                          <select
                            value={feedbackForm.onTime ? "true" : "false"}
                            onChange={(e) =>
                              handleFeedbackInputChange("onTime", e.target.value === "true")
                            }
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          >
                            <option value="true">{t("Yes")}</option>
                            <option value="false">{t("No")}</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={feedbackForm.complaint}
                          onChange={(e) =>
                            handleFeedbackInputChange("complaint", e.target.checked)
                          }
                          className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-500"
                        />
                        {t("Flag as complaint / quality issue")}
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-600 dark:text-slate-300">
                        {t("Notes")}
                        <textarea
                          rows={3}
                          value={feedbackForm.notes}
                          onChange={(e) => handleFeedbackInputChange("notes", e.target.value)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder={t("Example: Tomatoes were soft, refund requested.")}
                        />
                      </label>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        {t("Log feedback")}
                      </button>
                    </form>
 

                    <div className="mt-6 space-y-4">
                      {feedbackTimeline.length > 0 ? (
                        feedbackTimeline.map((entry, idx) => {
                          const created =
                            entry.createdAt && !Number.isNaN(new Date(entry.createdAt))
                              ? new Date(entry.createdAt).toLocaleString()
                              : t("Recently");
                          const formatScore = (value) => {
                            if (value === null || value === undefined || value === "") {
                              return "—";
                            }
                            const num = Number(value);
                            return Number.isFinite(num) ? num.toFixed(1) : "—";
                          };
                          return (
                            <div
                              key={`${entry.createdAt || "entry"}-${idx}`}
                              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/40"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  {created}
                                </span>
                                <span className="inline-flex items-center gap-2 rounded-full bg-slate-200/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  ⭐ {t("Quality")}: {formatScore(entry.quality)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                                <span>
                                  {t("Packaging")}: {formatScore(entry.packaging)}
                                </span>
                                <span>
                                  {t("Punctuality")}: {formatScore(entry.punctuality)}
                                </span>
                                <span>
                                  {t("Accuracy")}: {formatScore(entry.accuracy)}
                                </span>
                                <span>
                                  {t("Delivery time")}:{" "}
                                  {entry.deliveryTimeDays
                                    ? `${Number(entry.deliveryTimeDays).toFixed(1)} ${t("days")}`
                                    : "—"}
                                </span>
                                <span>
                                  {t("On time")}: {entry.onTime === false ? t("No") : t("Yes")}
                                </span>
                                {entry.complaint && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                                    ⚠️ {t("Complaint")}
                                  </span>
                                )}
                              </div>
                              {entry.notes && (
                                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                  {entry.notes}
                                </p>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                          {t(
                            "No feedback logged yet. Capture insights after each delivery to build trust scores."
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleReceiptFileSelect(e.target.files?.[0]);
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleReceiptFileSelect(e.target.files?.[0]);
                    }}
                  />
            {selectedSupplier ? (
              <>
                <section className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                        {t("Supplier Performance Dashboard")}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t(
                          "Surface delivery health, accuracy, and service quality at a glance."
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                        ⭐ {t("Quality avg")}:{" "}
                        {performanceMetrics.qualityAverage !== null
                          ? Number(performanceMetrics.qualityAverage).toFixed(1)
                          : "—"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 dark:border-slate-700">
                        🧾 {t("Feedback entries")}: {feedbackEntries.length}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {performanceCardData.map((card, idx) => (
                      <div
                        key={`${card.title}-${idx}`}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white ${card.accent}`}
                        >
                          {card.icon}
                        </div>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {card.title}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                          {card.value}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {card.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                   <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        {t("Supplier management")}
                      </p>
                      <ul className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
                        <li className="flex items-start gap-3">
                          <span className="mt-1 text-lg">🧾</span>
                          <div className="space-y-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {t("Download transaction log")}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {t("Share Excel reports with accounting whenever requested.")}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              onClick={handleDownloadHistory}
                            >
                              📥 {t("Export Excel")}
                            </button>
                          </div>
                        </li>
                        <li className="flex items-start gap-3">
                          <span className="mt-1 text-lg">🧹</span>
                          <div className="space-y-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {t("Reset transaction history")}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {t("Start fresh after completing annual reconciliation.")}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-slate-700 dark:text-rose-300 dark:hover:bg-slate-800"
                              onClick={handleClearTransactions}
                            >
                              🧹 {t("Clear history")}
                            </button>
                          </div>
                        </li>
                      </ul>
                    </div>




              </>
            ) : (
             <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                  {t("Select a supplier to view performance insights")}
                </h3>
                <p className="mt-2 text-sm">
                  {t(
                    "Pick a supplier from the dropdown above to unlock performance analytics, price tracking, and payment tools."
                  )}
                </p>
              </div> 
            )}
          </div>
		          </>
        )}

        {isSupplierModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="absolute -top-16 -right-12 h-32 w-32 rounded-full bg-indigo-500/20 blur-3xl" />
              <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300">
                ➕ {t("Add New Supplier")}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t("Enter supplier details below.")}
              </p>
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  name="name"
                  placeholder={t("Supplier Name")}
                  value={newSupplier.name}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <input
                  type="text"
                  name="phone"
                  placeholder={t("Phone Number")}
                  value={newSupplier.phone}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, phone: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
                <input
                  type="text"
                  name="tax_number"
                  placeholder={t("Tax Number")}
                  value={newSupplier.tax_number}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, tax_number: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  name="id_number"
                  placeholder={t("ID Number")}
                  value={newSupplier.id_number}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, id_number: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="email"
                  name="email"
                  placeholder={t("Email")}
                  value={newSupplier.email}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  name="address"
                  placeholder={t("Address")}
                  value={newSupplier.address}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, address: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <textarea
                  name="notes"
                  placeholder={t("Notes")}
                  value={newSupplier.notes}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, notes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setSupplierModalOpen(false)}
                >
                  ❌ {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-md"
                  onClick={handleAddSupplier}
                >
                  ✅ {t("Add Supplier")}
                </button>
              </div>
            </div>
          </div>
        )}

        {editModalOpen && selectedSupplier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="absolute -top-16 -left-12 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />
              <h2 className="text-2xl font-semibold text-rose-600 dark:text-rose-300">
                ✏️ {t("Edit Supplier")}
              </h2>
              <div className="mt-5 space-y-3">
                <input
                  type="text"
                  placeholder={t("Name")}
                  value={selectedSupplier?.
name}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, name: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Phone")}
                  value={selectedSupplier?.
phone || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, phone: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="email"
                  placeholder={t("Email")}
                  value={selectedSupplier?.
email || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, email: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Address")}
                  value={selectedSupplier?.
address || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, address: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("Tax Number")}
                  value={selectedSupplier?.
tax_number || ""}
                  onChange={(e) =>
                    setSelectedSupplier({
                      ...selectedSupplier,
                      tax_number: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <input
                  type="text"
                  placeholder={t("ID Number")}
                  value={selectedSupplier?.
id_number || ""}
                  onChange={(e) =>
                    setSelectedSupplier({
                      ...selectedSupplier,
                      id_number: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <textarea
                  placeholder={t("Notes")}
                  value={selectedSupplier?.
notes || ""}
                  onChange={(e) =>
                    setSelectedSupplier({ ...selectedSupplier, notes: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => setEditModalOpen(false)}
                >
                  ❌ {t("Cancel")}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow hover:shadow-md"
                  onClick={handleUpdateSupplier}
                >
                  ✅ {t("Save Changes")}
                </button>
              </div>
            </div>
          </div>
        )}

{paymentModalOpen && (
  <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-2xl w-full max-w-md border border-indigo-200 dark:border-indigo-700 relative">
      {/* Decorative Blobs */}
      <div className="absolute -top-16 -right-20 w-48 h-48 bg-gradient-to-br from-blue-400 to-purple-400 opacity-25 rounded-full blur-3xl pointer-events-none animate-blob z-0" />
      <div className="absolute -bottom-10 -left-16 w-40 h-40 bg-gradient-to-br from-green-400 to-indigo-300 opacity-15 rounded-full blur-3xl pointer-events-none animate-blob z-0" />

      {/* Header */}
      <h2 className="text-2xl font-extrabold text-blue-700 mb-2 tracking-tight z-10 relative text-center">
        💳 {t("Make Payment")}
      </h2>
      <p className="mb-6 text-gray-500 text-sm z-10 relative text-center">{t("Pay your supplier and keep records up-to-date.")}</p>

      {/* Total Due Card */}
      <div className="bg-gradient-to-r from-blue-100 via-white to-indigo-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl shadow-inner mb-6 text-center border border-indigo-100 dark:border-indigo-900 z-10 relative">
        <div className="text-gray-600 dark:text-gray-300 text-sm font-semibold">{t("Total Due")}</div>
        <div
  className={`text-3xl font-extrabold mt-1 ${
    combinedDue > 0 ? "text-red-600" : "text-green-500"
  }`}
>
  {formatCurrency(combinedDue)}
</div>

      </div>

      {/* Payment Amount Label + Input */}
      <label
        htmlFor="payment-amount"
        className="block text-lg font-bold text-gray-700 dark:text-gray-200 mb-1 z-10 relative"
      >
        {t("Payment Amount")}
      </label>
      <input
        id="payment-amount"
        type="number"
        placeholder={t("Enter Payment Amount")}
        value={paymentAmount}
        min="0"
        onChange={e => setPaymentAmount(e.target.value)}
        className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-xl mb-2 focus:ring-2 focus:ring-blue-300"
        required
        autoFocus
      />

      {/* Show error if tried to submit empty */}
      {paymentAmount === "" && (
        <div className="mb-2 text-red-600 text-sm font-semibold z-10 relative">
          {t("Please enter a payment amount.")}
        </div>
      )}

      {/* Remaining Calculation */}
{combinedDue - parseFloat(paymentAmount || 0) > 0 ? (
  <>
    <span className="text-gray-600 dark:text-gray-300 text-sm font-semibold">
      {t("Remaining After Payment")}:
    </span>
    <div className="text-lg font-bold text-red-500">
      {formatCurrency(
        Math.max(0, combinedDue - parseFloat(paymentAmount || 0))
      )}
    </div>
  </>
) : (
  <div className="text-green-600 font-extrabold text-lg">
    ✅ {t("Fully Paid!")}
  </div>
)}


      {/* Payment Method Selector */}
      <label
        htmlFor="payment-method"
        className="block text-md font-medium text-gray-600 dark:text-gray-300 mb-1 z-10 relative"
      >
        {t("Payment Method")}
      </label>
      <select
        id="payment-method"
        value={paymentMethod}
        onChange={e => setPaymentMethod(e.target.value)}
        className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm text-lg mb-7 bg-white dark:bg-gray-900"
      >

        <option value="Cash">💵 {t("Cash")}</option>
        <option value="Due">🕓 {t("Due")}</option>
        <option value="Credit Card">💳 {t("Credit Card")}</option>
        <option value="IBAN">🏦 {t("IBAN")}</option>
      </select>

      {/* Actions */}
      <div className="flex justify-between gap-3 mt-8 z-10 relative">
        <button
          className="px-5 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-gray-300 to-gray-400 text-gray-800 dark:text-white hover:brightness-110 transition shadow"
          onClick={() => setPaymentModalOpen(false)}
        >
          ❌ {t("Cancel")}
        </button>
        <button
          className={`px-6 py-2.5 rounded-2xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:scale-105 transition shadow-lg
            ${(!paymentAmount || parseFloat(paymentAmount) <= 0) ? "opacity-60 cursor-not-allowed" : ""}
          `}
          onClick={handlePayment}
          disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
        >
          ✅ {t("Confirm Payment")}
        </button>
      </div>
    </div>
  </div>
)}



{showUploadOptions && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl w-[90%] max-w-sm text-center space-y-4">
      <h2 className="text-lg font-bold text-indigo-700">{t("Choose Upload Option")}</h2>
      <button
        onClick={() => cameraInputRef.current.click()}
        className="w-full px-4 py-3 bg-indigo-500 text-white rounded-xl font-bold shadow hover:scale-105 transition"
      >
        📷 {t("Take Photo")}
      </button>
      <button
        onClick={() => fileInputRef.current.click()}
        className="w-full px-4 py-3 bg-purple-600 text-white rounded-xl font-bold shadow hover:scale-105 transition"
      >
        🖼️ {t("Choose from Files")}
      </button>
      <button
        onClick={() => setShowUploadOptions(false)}
        className="text-sm text-gray-500 hover:text-red-500 transition"
      >
        ❌ {t("Cancel")}
      </button>
    </div>
    
  </div>
)}

        {/* --- CART TAB --- */}
        {activeTab === "cart" && (
            <div id="supplier-carts"  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  🛒 {t("Supplier Carts")}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("Review scheduled orders and trigger supplier confirmations.")}
                </p>
              </div>
     
            </div>
            {suppliers.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {suppliers.map((supplier) => (
                  <SupplierScheduledCart
                    key={supplier.id}
                    supplier={supplier}
                    openSupplierCart={openSupplierCart}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                {t("No Suppliers")}
              </div>
            )}
          </div>
        )}

        {/* ⬆️ Scroll-to-top arrow */}
{showUp && (
  <button
    onClick={() =>
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
    }
    className="fixed bottom-6 right-6 z-50 rounded-full bg-indigo-600 px-4 py-3 text-white shadow-lg transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
  >
    ↑
  </button>
)}



    {/* --- Supplier Cart Modal --- */}
    {showCartModal && (
      <SupplierCartModal
        supplierId={selectedSupplier?.id}
        cartId={cartId}
        show={showCartModal}
        cartItems={cartItems}
        onClose={() => setShowCartModal(false)}
        onChangeQty={handleCartQuantityChange}
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        sending={sending}
        onConfirm={() => confirmSupplierCart(cartId)}
        onSend={() => sendSupplierCart(cartId)}
        autoOrder={autoOrder}
        setAutoOrder={setAutoOrder}
        repeatDays={repeatDays}
        setRepeatDays={setRepeatDays}
        repeatType={repeatType}
        setRepeatType={setRepeatType}
        lastSkippedInfo={cartHistory.find((h) => h.skipped) || null}
      />
    )}
    </div>
  </div>
);

}
