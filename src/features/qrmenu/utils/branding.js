import {
  APP_RESTAURANT_BASE_URL,
  PUBLIC_RESTAURANT_BASE_URL,
} from "../../../utils/publicRestaurantUrl";
import { API_ORIGIN } from "../../../utils/api";
import {
  QR_MENU_BRANDING_CACHE_PREFIX,
  QR_MENU_BRANDING_UPDATED_EVENT,
  QR_MENU_FONT_FAMILIES,
} from "../constants/qrMenuConfig";

function resolvePublicUploadsUrl(raw) {
  const value = String(raw || "").trim().replace(/\\/g, "/");
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (/^\/api\/uploads\//i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/^\/api/i, "");
        return url.toString();
      }
      if (/^\/public\/uploads\//i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/^\/public/i, "");
        return url.toString();
      }
    } catch {
      return value;
    }
    return value;
  }

  if (/^\/api\/uploads\//i.test(value)) {
    return `${API_ORIGIN || ""}${value.replace(/^\/api/i, "")}`;
  }
  if (/^\/public\/uploads\//i.test(value)) {
    return `${API_ORIGIN || ""}${value.replace(/^\/public/i, "")}`;
  }
  if (/^\/uploads\//i.test(value)) {
    return `${API_ORIGIN || ""}${value}`;
  }
  if (/^uploads\//i.test(value)) {
    return `${API_ORIGIN || ""}/${value}`;
  }

  return `${API_ORIGIN || ""}/uploads/${value.replace(/^\/?uploads\//i, "")}`;
}

function navigateToMarketplaceFromQrMenu() {
  if (typeof window === "undefined") return;

  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          action: "OPEN_MARKETPLACE",
          source: "qr-menu",
        })
      );
      return;
    } catch {
      // fallback below
    }
  }

  if (window.ReactNativeWebView) {
    window.location.href = "beypro://marketplace";
    return;
  }

  window.location.href = `${APP_RESTAURANT_BASE_URL}/marketplace`;
}

function normalizeQrTableNumberList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
}

function normalizeRestaurantDisplayName(value, fallback = "Restaurant") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const withoutBrandPrefix = raw.replace(/^(beypro\s+(qr\s+menu|pos)\s*[-:|]\s*)/i, "").trim();
  const candidate = withoutBrandPrefix || raw;

  if (candidate.includes("+")) {
    const [head] = candidate.split("+");
    const trimmed = String(head || "").trim();
    return trimmed || candidate;
  }

  return candidate;
}

function getQrMenuBrandingCacheKey(identifier) {
  const value = String(identifier || "").trim();
  return value ? `${QR_MENU_BRANDING_CACHE_PREFIX}${value}` : "";
}

function readCachedQrMenuBranding(identifier) {
  if (typeof window === "undefined") return null;
  const key = getQrMenuBrandingCacheKey(identifier);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedQrMenuBranding(identifier, customization) {
  if (typeof window === "undefined") return;
  const normalizedIdentifier = String(identifier || "").trim();
  const key = getQrMenuBrandingCacheKey(normalizedIdentifier);
  if (!key || !customization || typeof customization !== "object") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(customization));
  } catch {
    // Ignore storage quota/privacy errors and continue with in-memory state.
  }

  try {
    window.dispatchEvent(
      new CustomEvent(QR_MENU_BRANDING_UPDATED_EVENT, {
        detail: {
          identifier: normalizedIdentifier,
          customization,
        },
      })
    );
  } catch {
    // Ignore custom event failures and continue with in-memory state.
  }
}

function resolveUploadedAsset(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return resolvePublicUploadsUrl(value);
}

function resolveYouTubeEmbedUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = String(url.hostname || "").toLowerCase();
    let videoId = "";
    if (host.includes("youtu.be")) {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host.includes("youtube.com")) {
      videoId =
        url.searchParams.get("v") ||
        url.pathname.split("/").filter(Boolean).slice(-1)[0] ||
        "";
    }
    if (!videoId) return "";
    return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return "";
  }
}

function resolveBrandingAsset(raw, fallback = "") {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value) && !/\/((api|public)\/)?uploads\//i.test(value)) {
    return value;
  }
  if (value.startsWith("/Beylogo")) return value;
  if (value.startsWith("/")) return value;
  return resolvePublicUploadsUrl(value);
}

function toAbsolutePublicUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (typeof window === "undefined") return value;
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function appendCacheVersion(rawUrl, version) {
  const url = String(rawUrl || "").trim();
  const normalizedVersion = String(version || "").trim();
  if (!url || !normalizedVersion) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(normalizedVersion)}`;
}

function formatConcertDisplayDateWithoutYear(value, locale) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = raw.includes("T") ? raw : `${raw}T00:00:00`;
  const parsed = new Date(source);

  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(locale || undefined, {
      month: "short",
      day: "numeric",
    }).format(parsed);
  }

  const normalized = raw.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (year && month && day) return `${day}/${month}`;
  return normalized;
}

function formatConcertDisplayWeekday(value, locale) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = raw.includes("T") ? raw : `${raw}T00:00:00`;
  const parsed = new Date(source);

  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(locale || undefined, {
      weekday: "long",
    }).format(parsed);
  }

  const normalized = raw.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    const fallbackDate = new Date(year, month - 1, day);
    if (!Number.isNaN(fallbackDate.getTime())) {
      return new Intl.DateTimeFormat(locale || undefined, {
        weekday: "long",
      }).format(fallbackDate);
    }
  }
  return "";
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "");
  if (!normalized) return null;
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return "#FFFFFF";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? "#0F172A" : "#FFFFFF";
}

function toRgba(value, alpha) {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function resolveQrMenuFontFamily(value) {
  const key = String(value || "").trim().toLowerCase();
  return QR_MENU_FONT_FAMILIES[key] || QR_MENU_FONT_FAMILIES.gotham;
}

export {
  appendCacheVersion,
  formatConcertDisplayDateWithoutYear,
  formatConcertDisplayWeekday,
  getQrMenuBrandingCacheKey,
  getReadableTextColor,
  hexToRgb,
  navigateToMarketplaceFromQrMenu,
  normalizeHexColor,
  normalizeQrTableNumberList,
  normalizeRestaurantDisplayName,
  readCachedQrMenuBranding,
  resolveBrandingAsset,
  resolveQrMenuFontFamily,
  resolveUploadedAsset,
  resolveYouTubeEmbedUrl,
  toAbsolutePublicUrl,
  toRgba,
  writeCachedQrMenuBranding,
};
