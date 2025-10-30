// secureFetch.js
// ✅ Unified token-aware fetch helper for Beypro frontend

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

// ✅ Secure fetch with Authorization header always set
export default async function secureFetch(endpoint, options = {}) {
  const rawToken = getAuthToken();
  const tokenHeader = rawToken.startsWith("Bearer ")
    ? rawToken
    : rawToken
    ? `Bearer ${rawToken}`
    : "";

  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(tokenHeader ? { Authorization: tokenHeader } : {}),
    ...options.headers,
  };

  if (!isFormData) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `❌ Response from ${BASE_URL}${path} was not JSON (${res.status}). First bytes: ${text.slice(0, 80)}`
    );
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `❌ Request failed [${res.status}]`);
  return json;
}
