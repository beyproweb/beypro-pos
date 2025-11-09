// secureFetch.js
// ✅ Unified token-aware fetch helper for Beypro frontend (with public route safety)

const RAW =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://hurrypos-backend.onrender.com/api");

// ✅ Normalize to exactly one /api
const BASE_URL =
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

// ✅ Reads JWT token safely from every possible place
export function getAuthToken() {
  if (!hasLocalStorage()) return "";

  // 1️⃣ Direct token key
  const direct = cleanToken(localStorage.getItem("token"));
  if (direct) return direct;

  // 2️⃣ Nested under beyproUser (various structures)
  try {
    const stored = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    return (
      cleanToken(stored?.token) ||
      cleanToken(stored?.accessToken) ||
      cleanToken(stored?.user?.token) ||
      cleanToken(stored?.user?.accessToken) ||
      cleanToken(stored?.user?.user?.token) // ✅ Added support for /subscription login structure
    );
  } catch {
    return "";
  }
}

/**
 * ✅ Unified secureFetch
 * Automatically omits Authorization for public endpoints like:
 *   - /api/products?identifier=...
 *   - /api/public/*
 *   - /qr-menu/*
 *   - /restaurant-info
 */
export default async function secureFetch(endpoint, options = {}) {
  const rawToken = getAuthToken();
  const tokenHeader =
    rawToken && !rawToken.startsWith("Bearer ") ? `Bearer ${rawToken}` : rawToken;

  // Detect public (non-auth) routes
  const lower = endpoint.toLowerCase();
  const hasQrMenuSegment = /(?:^|\/)qr-menu(?:\/|$|[?#])/.test(lower);
  const isPublic =
    lower.includes("/products?identifier=") ||
    lower.includes("/public/") ||
    hasQrMenuSegment ||
    lower.includes("/restaurant-info") ||
    lower.includes("/me") || // allow /me to be protected but not break public
    lower.includes("/uploads/");

  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(!isPublic && tokenHeader ? { Authorization: tokenHeader } : {}), // 🚫 skip token on public
    ...options.headers,
  };

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullUrl = `${BASE_URL}${path}`;

  const res = await fetch(fullUrl, { ...options, headers });
  const ctype = res.headers.get("content-type") || "";

  if (!ctype.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `❌ Response from ${fullUrl} was not JSON (${res.status}). First bytes: ${text.slice(0, 80)}`
    );
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `❌ Request failed [${res.status}]`);
  return json;
}
