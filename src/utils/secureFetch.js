// secureFetch.js

// ✅ Use the same environment-aware API base everywhere
const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://beypro-backend.onrender.com/api");

/**
 * Tenant-safe fetch wrapper
 * Automatically attaches Authorization header with stored token
 * Usage:
 *   secureFetch("/products")
 *   secureFetch("/staff", { method: "POST", body: JSON.stringify(data) })
 */
export default async function secureFetch(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // 🪲 Debug outgoing request
  console.groupCollapsed(`🔎 secureFetch → ${BASE_URL}${endpoint}`);
  console.log("➡️ Options:", options);
  console.log("➡️ Headers:", headers);
  if (options.body) {
    try {
      console.log("➡️ Body:", JSON.parse(options.body));
    } catch {
      console.log("➡️ Body (raw):", options.body);
    }
  }
  console.groupEnd();

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // 🪲 Debug response
  console.groupCollapsed(`⬅️ Response from ${endpoint} [${res.status}]`);
  let json;
  try {
    json = await res.json();
    console.log("⬅️ JSON:", json);
  } catch (err) {
    console.warn("❌ Failed to parse JSON:", err);
  }
  console.groupEnd();

  if (res.status === 401) {
    console.warn("⚠️ Unauthorized — token missing or expired");
    // Optional auto-logout:
    // localStorage.removeItem("token");
    // window.location.href = "/login";
  }

  return json;
}
