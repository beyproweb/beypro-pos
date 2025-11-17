// src/utils/currency.js
// Centralized currency definitions and helpers for Beypro frontend

export const CURRENCY_KEYS = ["₺ TRY", "€ EUR", "$ USD", "£ GBP", "₨ MUR"];

const CURRENCY_MAP = {
  "₺ TRY": {
    key: "TRY",
    label: "₺ TRY",
    symbol: "₺",
    locale: "tr-TR",
    position: "prefix",
    decimals: 2,
  },
  "€ EUR": {
    key: "EUR",
    label: "€ EUR",
    symbol: "€",
    locale: "de-DE",
    position: "suffix",
    decimals: 2,
  },
  "$ USD": {
    key: "USD",
    label: "$ USD",
    symbol: "$",
    locale: "en-US",
    position: "prefix",
    decimals: 2,
  },
  "£ GBP": {
    key: "GBP",
    label: "£ GBP",
    symbol: "£",
    locale: "en-GB",
    position: "prefix",
    decimals: 2,
  },
  "₨ MUR": {
    key: "MUR",
    label: "₨ MUR",
    symbol: "₨",
    locale: "en-MU",
    position: "prefix",
    decimals: 2,
  },
};

const CODE_TO_KEY = Object.values(CURRENCY_MAP).reduce((acc, cfg) => {
  acc[cfg.key] = cfg.label;
  return acc;
}, {});

export const DEFAULT_CURRENCY_KEY = "₺ TRY";

export function normalizeCurrencyKey(raw) {
  if (!raw) return DEFAULT_CURRENCY_KEY;
  const str = String(raw).trim();
  if (CURRENCY_MAP[str]) return str;

  const upper = str.toUpperCase();
  if (CODE_TO_KEY[upper]) return CODE_TO_KEY[upper];

  const bySymbol = Object.entries(CURRENCY_MAP).find(
    ([, cfg]) => cfg.symbol === str,
  );
  if (bySymbol) return bySymbol[0];

  return DEFAULT_CURRENCY_KEY;
}

export function getCurrencyConfig(raw) {
  const key = normalizeCurrencyKey(raw);
  return CURRENCY_MAP[key] || CURRENCY_MAP[DEFAULT_CURRENCY_KEY];
}

export function formatCurrency(amount, rawKey, options = {}) {
  const cfg = getCurrencyConfig(rawKey);
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const decimals =
    typeof options.decimals === "number" ? options.decimals : cfg.decimals || 2;

  const formatted = value.toLocaleString(cfg.locale || undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const symbol = cfg.symbol || "";
  if (!symbol) return formatted;

  return cfg.position === "suffix" ? `${formatted} ${symbol}` : `${symbol}${formatted}`;
}

// Fallback formatter for non-React utilities (uses window state if available)
export function formatWithActiveCurrency(amount, options = {}) {
  let rawKey = options.currencyKey;
  if (!rawKey && typeof window !== "undefined") {
    rawKey = window.beyproCurrencyKey || window.beyproCurrencyLabel;
  }
  return formatCurrency(amount, rawKey || DEFAULT_CURRENCY_KEY, options);
}

