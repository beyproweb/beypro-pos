// api.js
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api"; // fallback for dev

export const SUPPLIERS_API = `${API_BASE}/suppliers`;
export const SUPPLIER_CARTS_API = `${API_BASE}/supplier-carts`;
export const SUPPLIER_CART_ITEMS_API = `${API_BASE}/supplier-cart-items`;
export const TRANSACTIONS_API = `${API_BASE}/suppliers/transactions`;
export const PRODUCTS_API = `${API_BASE}/products`;
export const EXTRAS_GROUPS_API = `${API_BASE}/extras-groups`;
export const INGREDIENT_PRICES_API = `${API_BASE}/ingredient-prices`;
