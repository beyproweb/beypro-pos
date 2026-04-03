const DEFAULT_PUBLIC_RESTAURANT_BASE_URL = "https://beypro.com";
const LEGACY_PUBLIC_RESTAURANT_HOSTS = new Set(["pos.beypro.com", "www.pos.beypro.com"]);

const sanitizeBaseUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_PUBLIC_RESTAURANT_BASE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_PUBLIC_RESTAURANT_BASE_URL;
  }
};

export const PUBLIC_RESTAURANT_BASE_URL = sanitizeBaseUrl(
  import.meta.env.VITE_PUBLIC_RESTAURANT_BASE_URL || DEFAULT_PUBLIC_RESTAURANT_BASE_URL
);
export const PUBLIC_RESTAURANT_BASE_HOST = (() => {
  try {
    return new URL(PUBLIC_RESTAURANT_BASE_URL).host;
  } catch {
    return "beypro.com";
  }
})();

export const buildPublicRestaurantUrl = (identifier) => {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return PUBLIC_RESTAURANT_BASE_URL;
  return `${PUBLIC_RESTAURANT_BASE_URL}/${encodeURIComponent(normalizedIdentifier)}`;
};

export const normalizePublicRestaurantUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const absolute = new URL(raw);
    if (!LEGACY_PUBLIC_RESTAURANT_HOSTS.has(String(absolute.hostname || "").toLowerCase())) {
      return absolute.toString();
    }
    const normalized = new URL(absolute.pathname || "/", PUBLIC_RESTAURANT_BASE_URL);
    normalized.search = absolute.search;
    normalized.hash = absolute.hash;
    return normalized.toString();
  } catch {
    try {
      return new URL(raw, PUBLIC_RESTAURANT_BASE_URL).toString();
    } catch {
      return raw;
    }
  }
};
