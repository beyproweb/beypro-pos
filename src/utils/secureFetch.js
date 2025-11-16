// secureFetch.js — FINAL FIX FOR ELECTRON + DEV + PROD

const isElectron =
  typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "");

// Always use Render backend in Electron (DEV + PROD)
const ELECTRON_API = "https://hurrypos-backend.onrender.com/api";

// For browser:
const BROWSER_API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://hurrypos-backend.onrender.com/api");

// FINAL API CHOICE:
const RAW = isElectron ? ELECTRON_API : BROWSER_API;

// Normalize to exactly one /api
export const BASE_URL =
  String(RAW)
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "") + "/api";

const hasLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

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
  if (!hasLocalStorage()) return "";

  const direct = cleanToken(localStorage.getItem("token"));
  if (direct) return direct;

  try {
    const stored = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    return (
      cleanToken(stored?.token) ||
      cleanToken(stored?.accessToken) ||
      cleanToken(stored?.user?.token) ||
      cleanToken(stored?.user?.accessToken) ||
      cleanToken(stored?.user?.user?.token)
    );
  } catch {
    return "";
  }
}

export default async function secureFetch(endpoint, options = {}) {
  const rawToken = getAuthToken();
  const tokenHeader =
    rawToken && !rawToken.startsWith("Bearer ") ? `Bearer ${rawToken}` : rawToken;

  const lower = endpoint.toLowerCase();
  const lowerPath = lower.replace(/[?#].*$/, "");
  const hasQrMenuSegment = /(?:^|\/)qr-menu(?:\/|$|[?#])/.test(lower);

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

  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullUrl = `${BASE_URL}${path}`;
  const method = String(options.method || "GET").toUpperCase();
  const requestMeta = {
    endpoint,
    method,
    url: fullUrl,
  };

  const res = await fetch(fullUrl, { ...options, headers });
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
    const err = new Error(json?.error || `❌ Request failed [${res.status}]`);
    err.details = { ...requestMeta, status: res.status, body: json };
    throw err;
  }
  return json;
}
