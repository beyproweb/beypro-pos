export const DEFAULT_LANGUAGE = "tr";

export const LANGUAGE_STORAGE_KEYS = [
  "qr_lang",
  "beyproGuestLanguage",
  "beyproLanguage",
];

export const SUPPORTED_LANGUAGE_CODES = ["tr", "en", "de", "fr"];

const LANGUAGE_LABEL_TO_CODE = {
  english: "en",
  turkish: "tr",
  german: "de",
  french: "fr",
};

export function normalizeLanguageCode(raw, fallback = null) {
  if (!raw) return fallback;
  const normalized = String(raw).trim();
  if (!normalized) return fallback;

  const lower = normalized.toLowerCase();
  const mapped = LANGUAGE_LABEL_TO_CODE[lower] || lower.split("-")[0];
  return SUPPORTED_LANGUAGE_CODES.includes(mapped) ? mapped : fallback;
}

export function readStoredLanguage(storage = getBrowserStorage()) {
  if (!storage) return null;
  try {
    for (const key of LANGUAGE_STORAGE_KEYS) {
      const normalized = normalizeLanguageCode(storage.getItem(key));
      if (normalized) return normalized;
    }
  } catch {
    return null;
  }
  return null;
}

export function persistLanguage(language, storage = null) {
  if (!storage) return;
  const resolved = normalizeLanguageCode(language, DEFAULT_LANGUAGE);
  try {
    LANGUAGE_STORAGE_KEYS.forEach((key) => {
      storage.setItem(key, resolved);
    });
  } catch {
    // Ignore storage failures.
  }
}

export function resolvePreferredLanguage({
  storage = null,
  preferred = null,
  fallback = DEFAULT_LANGUAGE,
} = {}) {
  return (
    normalizeLanguageCode(preferred) ||
    readStoredLanguage(storage) ||
    normalizeLanguageCode(fallback, DEFAULT_LANGUAGE) ||
    DEFAULT_LANGUAGE
  );
}

export function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function syncDocumentLanguage(language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = normalizeLanguageCode(language, DEFAULT_LANGUAGE);
}

export function ensureDefaultLanguage(storage = getBrowserStorage()) {
  const resolved = resolvePreferredLanguage({ storage });
  persistLanguage(resolved, storage);
  syncDocumentLanguage(resolved);
  return resolved;
}
