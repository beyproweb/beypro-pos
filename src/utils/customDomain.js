const COMPOUND_PUBLIC_SUFFIXES = new Set([
  "ac.uk",
  "co.id",
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "co.za",
  "com.ar",
  "com.au",
  "com.br",
  "com.cn",
  "com.eg",
  "com.hk",
  "com.mx",
  "com.my",
  "com.ng",
  "com.sg",
  "com.tr",
  "com.ua",
  "firm.in",
  "gen.tr",
  "gov.uk",
  "net.au",
  "net.in",
  "net.tr",
  "org.au",
  "org.in",
  "org.tr",
  "org.uk",
]);

const RESERVED_SLUGS = new Set([
  "api",
  "uploads",
  "sounds",
  "bridge",
  "favicon.ico",
  "qr",
  "menu",
  "qr-menu",
  "login",
  "dashboard",
]);

const slugifySegment = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const sanitizeDomainInput = (value = "") =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^\/\//, "")
    .split(/[/?#]/, 1)[0]
    .replace(/:\d+$/, "")
    .replace(/\.+$/g, "")
    .replace(/^www\./, "");

const isValidDomainLabel = (value = "") =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(String(value || ""));

const isValidTld = (value = "") =>
  /^[a-z]{2,63}$/.test(String(value || "")) || /^xn--[a-z0-9-]{2,59}$/.test(String(value || ""));

export const normalizeCustomDomain = (value = "") => {
  const host = sanitizeDomainInput(value);
  if (!host) return "";

  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return "";
  if (!isValidTld(labels[labels.length - 1])) return "";
  if (labels.some((label) => !isValidDomainLabel(label))) return "";

  return labels.join(".");
};

export const deriveSlugFromCustomDomain = (value = "") => {
  const normalizedDomain = normalizeCustomDomain(value);
  if (!normalizedDomain) return "";

  const labels = normalizedDomain.split(".");
  const compoundSuffix =
    labels.length >= 3
      ? `${labels[labels.length - 2]}.${labels[labels.length - 1]}`
      : "";
  const registrableIndex =
    compoundSuffix && COMPOUND_PUBLIC_SUFFIXES.has(compoundSuffix)
      ? labels.length - 3
      : labels.length - 2;

  const source = labels[Math.max(0, registrableIndex)] || "";
  const fallback = labels.slice(0, Math.max(1, registrableIndex + 1)).join("-");
  const slug = slugifySegment(source) || slugifySegment(fallback);

  if (!slug || RESERVED_SLUGS.has(slug)) return "";
  return slug;
};

export const getCustomDomainPreview = (value = "") => {
  const raw = String(value || "").trim();
  const normalizedDomain = normalizeCustomDomain(raw);
  const generatedSlug = normalizedDomain ? deriveSlugFromCustomDomain(normalizedDomain) : "";

  return {
    input: raw,
    normalizedDomain,
    generatedSlug,
    isBlank: raw.length === 0,
    isValid: Boolean(normalizedDomain && generatedSlug),
  };
};
