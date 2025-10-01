// secureFetch.js

// Decide base URL smartly
let BASE_URL;

// 1. If frontend env explicitly defines API, use it
if (import.meta.env.VITE_API_URL) {
  BASE_URL = import.meta.env.VITE_API_URL;
} else {
  // 2. Auto-switch by mode
  BASE_URL =
    import.meta.env.MODE === "development"
      ? "http://localhost:5000/api" // local backend
      : "https://hurrypos-backend.onrender.com/api"; // Render backend
}

/**
 * Tenant-safe fetch wrapper
 * Automatically attaches Authorization header with stored token
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
  }

  return json;
}
