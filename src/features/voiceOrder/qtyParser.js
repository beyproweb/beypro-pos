const TR_CHAR_MAP = {
  "ı": "i",
  "İ": "i",
  "ş": "s",
  "Ş": "s",
  "ğ": "g",
  "Ğ": "g",
  "ü": "u",
  "Ü": "u",
  "ö": "o",
  "Ö": "o",
  "ç": "c",
  "Ç": "c",
};

export const MAX_QTY = 20;

const LANG_WORD_MAP = {
  en: {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  },
  tr: {
    bir: 1,
    iki: 2,
    "uc": 3,
    "üç": 3,
    "dort": 4,
    "dört": 4,
    "bes": 5,
    "beş": 5,
    "alti": 6,
    "altı": 6,
    yedi: 7,
    sekiz: 8,
    dokuz: 9,
    on: 10,
  },
  de: {
    eins: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    "funf": 5,
    "fünf": 5,
    sechs: 6,
    sieben: 7,
    acht: 8,
    neun: 9,
    zehn: 10,
  },
  fr: {
    un: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
  },
};

const EN_HOMOPHONES = {
  to: 2,
  too: 2,
  for: 4,
};

const CURRENCY_MARKERS = new Set(["₺", "tl", "try", "lira", "eur", "€", "usd", "$", "dollar"]);
const CONNECTORS = new Set(["and", "ve", "und", "et", "plus", "ile", "&", "+"]);
const STOP_WORDS = new Set([
  "i",
  "have",
  "want",
  "would",
  "like",
  "please",
  "ok",
  "okay",
  "for",
  "the",
  "a",
  "an",
  "ben",
  "benim",
  "icin",
  "için",
  "fur",
  "für",
  "pour",
  "moi",
  "elle",
  "lui",
  "her",
  "him",
  "me",
  "kids",
  "kinder",
  "enfants",
]);

const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

function normalizeTR(value) {
  return String(value || "").replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TR_CHAR_MAP[ch] || ch);
}

export function normalizeTranscript(str) {
  return normalizeTR(String(str || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`´’‘]/g, "")
    .replace(/[^\p{L}\p{N}\s₺€$.,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWithMeta(text) {
  const normalized = normalizeTranscript(text);
  const tokens = normalized.split(" ").filter(Boolean);
  return { normalized, tokens };
}

function isCurrencyToken(token) {
  return CURRENCY_MARKERS.has(String(token || "").toLowerCase());
}

function isDecimalNumberToken(token) {
  return /^\d+[.,]\d+$/.test(token || "");
}

function parseIntegerToken(token) {
  if (!/^\d+$/.test(token || "")) return null;
  const value = Number(token);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseWordNumberToken(token, lang, context = {}) {
  const code = normalizeLang(lang);
  const normalizedToken = String(token || "").toLowerCase();
  const map = LANG_WORD_MAP[code] || LANG_WORD_MAP.en;
  if (map[normalizedToken] !== undefined) return map[normalizedToken];

  if (code === "en" && EN_HOMOPHONES[normalizedToken] !== undefined) {
    const next = String(context.nextToken || "").toLowerCase();
    const prev = String(context.prevToken || "").toLowerCase();
    const looksLikeQtyPosition = Boolean(next) && !isCurrencyToken(next) && !CONNECTORS.has(next) && !STOP_WORDS.has(next);
    const isLikelySentenceFiller = prev === "thanks" || prev === "thank";
    if (looksLikeQtyPosition && !isLikelySentenceFiller) {
      return EN_HOMOPHONES[normalizedToken];
    }
  }

  return null;
}

function isPriceLikeToken(token, nextToken) {
  if (!token) return false;
  if (isDecimalNumberToken(token)) return true;
  if ((token.includes("₺") || token.includes("$") || token.includes("€")) && /\d/.test(token)) return true;
  if (/^\d+(?:tl|try|usd|eur)$/.test(token)) return true;
  if (isCurrencyToken(nextToken)) return true;
  return false;
}

function clampQty(value) {
  const qty = Math.max(1, Math.floor(Number(value) || 1));
  if (qty > MAX_QTY) {
    return { qty: MAX_QTY, clamped: true, originalQty: qty };
  }
  return { qty, clamped: false, originalQty: qty };
}

function pickBestCandidate(candidates, firstProductIndex) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const beforeProduct = Number.isInteger(firstProductIndex)
    ? candidates.filter((c) => c.index < firstProductIndex)
    : [];

  if (beforeProduct.length > 0) {
    return beforeProduct.sort((a, b) => b.confidence - a.confidence || a.index - b.index)[0];
  }

  if (candidates.length === 1) return candidates[0];

  return candidates.sort((a, b) => b.confidence - a.confidence || a.index - b.index)[0];
}

function detectFirstProductIndex(tokens) {
  const idx = tokens.findIndex((token) => {
    if (!token) return false;
    if (CONNECTORS.has(token)) return false;
    if (STOP_WORDS.has(token)) return false;
    if (isCurrencyToken(token)) return false;
    if (isDecimalNumberToken(token)) return false;
    if (parseIntegerToken(token) !== null) return false;
    if (LANG_WORD_MAP.en[token] !== undefined) return false;
    if (LANG_WORD_MAP.tr[token] !== undefined) return false;
    if (LANG_WORD_MAP.de[token] !== undefined) return false;
    if (LANG_WORD_MAP.fr[token] !== undefined) return false;
    return true;
  });
  return idx === -1 ? null : idx;
}

function isQtyDebugEnabled() {
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return false;
  try {
    if (typeof globalThis !== "undefined" && globalThis.__VOICE_QTY_DEBUG__ === true) return true;
    if (typeof window !== "undefined" && window.localStorage?.getItem("voice_qty_debug") === "1") return true;
  } catch {
    // ignore
  }
  return false;
}

function debugQty(payload) {
  if (!isQtyDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug("[voice][qty]", payload);
}

export function extractQty(segment, lang) {
  const { normalized, tokens } = tokenizeWithMeta(segment);
  const ignoredTokens = [];
  if (!tokens.length) {
    const result = { qty: null, confidence: 0, source: "none", ignoredTokens, tokenIndex: null, clamped: false };
    debugQty({ segment, ...result });
    return result;
  }

  const code = normalizeLang(lang);
  const firstProductIndex = detectFirstProductIndex(tokens);
  const candidates = [];

  tokens.forEach((token, index) => {
    const nextToken = tokens[index + 1] || "";
    const prevToken = tokens[index - 1] || "";

    if (isPriceLikeToken(token, nextToken)) {
      ignoredTokens.push({ token, index, reason: "price_like" });
      return;
    }

    const digitValue = parseIntegerToken(token);
    if (digitValue !== null) {
      candidates.push({ index, token, value: digitValue, source: "digit", confidence: 0.98 });
      return;
    }

    const wordValue = parseWordNumberToken(token, code, { nextToken, prevToken });
    if (wordValue !== null) {
      candidates.push({ index, token, value: wordValue, source: "word", confidence: 0.9 });
      return;
    }
  });

  const picked = pickBestCandidate(candidates, firstProductIndex);
  if (!picked) {
    const result = { qty: null, confidence: 0, source: "none", ignoredTokens, tokenIndex: null, clamped: false };
    debugQty({ segment: normalized, ...result });
    return result;
  }

  const { qty, clamped, originalQty } = clampQty(picked.value);
  const hasProduct = firstProductIndex !== null;
  const result = {
    qty,
    confidence: picked.confidence,
    source: picked.source,
    ignoredTokens,
    tokenIndex: picked.index,
    token: picked.token,
    clamped,
    originalQty,
    standalone: !hasProduct,
  };

  debugQty({ segment: normalized, ...result });
  return result;
}

export default {
  MAX_QTY,
  normalizeTranscript,
  extractQty,
};
