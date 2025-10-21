// secureFetch.js
// Auto-normalizes API base to avoid double "/api" and always include token
const RAW =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://hurrypos-backend.onrender.com/api");

// 🧩 Always normalize to exactly ONE /api (even if .env already includes it)
const BASE_URL =
  String(RAW)
    .replace(/\/api\/?$/, "") // remove trailing /api if exists
    .replace(/\/+$/, "") + "/api";

export default async function secureFetch(endpoint, options = {}) {
  const token =
  localStorage.getItem("token") ||
  JSON.parse(localStorage.getItem("beyproUser") || "{}")?.token ||
  JSON.parse(localStorage.getItem("beyproUser") || "{}")?.accessToken;
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
