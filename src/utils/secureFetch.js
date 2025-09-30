// secureFetch.js
const BASE_URL = "https://hurrypos-backend.onrender.com/api";

/**
 * Tenant-safe fetch wrapper
 * Automatically attaches Authorization header with stored token
 * Usage: secureFetch('/products'), secureFetch('/staff', { method: 'POST', body: JSON.stringify(data) })
 */
export default async function secureFetch(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    console.warn("⚠️ Unauthorized — token missing or expired");
    // optional auto-logout or redirect:
    // localStorage.removeItem("token");
    // window.location.href = "/login";
  }

  try {
    return await res.json();
  } catch (err) {
    console.error("❌ Failed to parse JSON:", err);
    return null;
  }
}
