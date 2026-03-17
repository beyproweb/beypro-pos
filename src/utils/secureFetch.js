// secureFetch.js — FINAL FIX FOR ELECTRON + DEV + PROD
import { API_BASE } from "./api";

// Normalized base always ends with /api
export const BASE_URL = API_BASE;

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__BEYPRO_API_URL__ = BASE_URL;
  // eslint-disable-next-line no-console
  console.info("🔗 Web API URL:", BASE_URL);
}

const hasLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const hasSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const isStandalonePath = () =>
  typeof window !== "undefined" &&
  typeof window.location?.pathname === "string" &&
  window.location.pathname.startsWith("/standalone");

const rewriteStandaloneEndpoint = (endpoint) => {
  if (!isStandalonePath()) return endpoint;
  const path = String(endpoint || "");
  if (path.startsWith("/settings/qr-")) {
    return path.replace(/^\/settings\//, "/standalone/qr/");
  }
  if (path.startsWith("/staff")) {
    return `/standalone${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (
    path.startsWith("/kitchen") ||
    path.startsWith("/kitchen-") ||
    path.startsWith("/order-items/kitchen-status") ||
    path.startsWith("/kitchen-timers")
  ) {
    const cleaned = path.replace(/^\/+/, "");
    return `/standalone/kitchen/${cleaned}`;
  }
  if (path.startsWith("/tables")) {
    const tail = path.replace(/^\/tables\/?/, "");
    return `/standalone/tables/${tail}`.replace(/\/+$/, "").replace(/\/{2,}/g, "/");
  }
  if (path.startsWith("/orders/reservations/")) {
    return `/standalone/kitchen${path}`;
  }
  return endpoint;
};

const cleanToken = (value) => {
  if (!value) return "";
  let normalized = String(value).trim();
  if (!normalized || normalized === "null" || normalized === "undefined") return "";
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
};

// Read token properly
export function getAuthToken() {
  if (!hasLocalStorage() && !hasSessionStorage()) return "";

  // Standalone pages: only accept standalone-scoped token.
  if (isStandalonePath()) {
    const standaloneSession = cleanToken(
      hasSessionStorage() ? sessionStorage.getItem("standaloneToken") : ""
    );
    if (standaloneSession) return standaloneSession;
    const standaloneLocal = cleanToken(
      hasLocalStorage() ? localStorage.getItem("standaloneToken") : ""
    );
    if (standaloneLocal) return standaloneLocal;
    return "";
  }

  if (hasSessionStorage()) {
    const directSession = cleanToken(sessionStorage.getItem("token"));
    if (directSession) return directSession;

    try {
      const storedSession = JSON.parse(sessionStorage.getItem("beyproUser") || "{}");
      const sessionToken =
        cleanToken(storedSession?.token) ||
        cleanToken(storedSession?.accessToken) ||
        cleanToken(storedSession?.user?.token) ||
        cleanToken(storedSession?.user?.accessToken) ||
        cleanToken(storedSession?.user?.user?.token);
      if (sessionToken) return sessionToken;
    } catch {
      // ignore
    }
  }

  try {
    const stored = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    const userToken =
      cleanToken(stored?.token) ||
      cleanToken(stored?.accessToken) ||
      cleanToken(stored?.user?.token) ||
      cleanToken(stored?.user?.accessToken) ||
      cleanToken(stored?.user?.user?.token);
    if (userToken) return userToken;
  } catch {
    // ignore
  }

  const direct = cleanToken(localStorage.getItem("token"));
  if (direct) return direct;

  return "";
}

export default async function secureFetch(endpoint, options = {}) {
  const rawToken = getAuthToken();
  const tokenHeader =
    rawToken && !rawToken.startsWith("Bearer ") ? `Bearer ${rawToken}` : rawToken;

  // Allow callers to pass endpoints with or without a leading `/api` prefix.
  // `BASE_URL` already ends with `/api`, so we strip a single leading `/api`
  // to avoid requests like `/api/api/...`.
  const normalizedEndpoint = rewriteStandaloneEndpoint(
    String(endpoint || "").replace(/^\/api(\/|$)/i, "/")
  );

  const lower = normalizedEndpoint.toLowerCase();
  const lowerPath = lower.replace(/[?#].*$/, "");
  const hasQrMenuSegment = /(?:^|\/)qr-menu(?:\/|$|[?#])/.test(lower);
  const isShopHoursEndpoint = lowerPath === "/settings/shop-hours/all";
  const isPublicShopHoursEndpoint = lowerPath.startsWith("/public/shop-hours/");

const isPublic =
  lower.includes("/products?identifier=") ||
  lower.includes("/public/") ||
  lower.includes("/tables?identifier=") ||
  hasQrMenuSegment ||
  lower.includes("/restaurant-info") ||
  lower.includes("/uploads/");


  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isPublic && tokenHeader ? { Authorization: tokenHeader } : {}),
    ...options.headers,
  };

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const path = normalizedEndpoint.startsWith("/")
    ? normalizedEndpoint
    : `/${normalizedEndpoint}`;
  const fullUrl = `${BASE_URL}${path}`;
  const method = String(options.method || "GET").toUpperCase();
  const requestMeta = {
    endpoint: normalizedEndpoint,
    method,
    url: fullUrl,
  };

  const fetchOptions = { ...options, headers };
  if (isShopHoursEndpoint || isPublicShopHoursEndpoint) {
    fetchOptions.cache = "no-store";
  }

  const res = await fetch(fullUrl, fetchOptions);
  const ctype = res.headers.get("content-type") || "";

  if (!ctype.includes("application/json")) {
    const text = await res.text();
    const err = new Error(
      `❌ Response from ${fullUrl} was not JSON (${res.status}). First bytes: ${text.slice(
        0,
        80
      )}`
    );
    err.details = { ...requestMeta, status: res.status, responseText: text.slice(0, 200) };
    throw err;
  }

  const json = await res.json();
  if (!res.ok) {
    const errorMessage =
      json?.error ||
      json?.message ||
      json?.msg ||
      json?.detail ||
      (Array.isArray(json?.errors) ? json.errors.map((e) => e?.message || e).join(", ") : "") ||
      `❌ Request failed [${res.status}]`;

    const err = new Error(errorMessage);
    err.details = {
      ...requestMeta,
      status: res.status,
      body: json,
    };
    throw err;
  }
  return json;
}
