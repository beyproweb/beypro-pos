// api.js
const DEFAULT_BACKEND = "https://hurrypos-backend.onrender.com";

const normalizeOrigin = (raw) =>
  String(raw || "")
    .replace(/\/api\/?$/, "")
    .replace(/\/+$/, "");

export const RAW_API_URL = import.meta.env.VITE_API_URL || DEFAULT_BACKEND;

// Base origin without trailing /api (used for uploads + sockets)
export const API_ORIGIN = normalizeOrigin(RAW_API_URL);

// Normalized API base ending with /api (used for REST calls)
export const API_BASE = `${API_ORIGIN ? API_ORIGIN : ""}/api`;

// Socket base mirrors REST origin unless explicitly overridden
export const SOCKET_BASE =
  import.meta.env.VITE_SOCKET_URL ||
  API_ORIGIN ||
  (typeof window !== "undefined" ? window.location.origin : "");

// Uploads live at the API origin
export const UPLOADS_BASE = API_ORIGIN || "";

export const SUPPLIERS_API = `${API_BASE}/suppliers`;
export const SUPPLIER_CARTS_API = `${API_BASE}/supplier-carts`;
export const SUPPLIER_CART_ITEMS_API = `${API_BASE}/supplier-cart-items`;
export const TRANSACTIONS_API = `${API_BASE}/suppliers/transactions`;
export const PRODUCTS_API = `${API_BASE}/products`;
export const EXTRAS_GROUPS_API = `${API_BASE}/extras-groups`;
export const INGREDIENT_PRICES_API = `${API_BASE}/ingredient-prices`;
