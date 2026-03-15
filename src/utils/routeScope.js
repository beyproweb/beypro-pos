const RESERVED_ROOT_SEGMENTS = new Set([
  "login",
  "staff-login",
  "dashboard",
  "customer-insights",
  "marketing-campaigns",
  "orders",
  "payments",
  "cash-register",
  "products",
  "kitchen",
  "suppliers",
  "stock",
  "production",
  "tables",
  "tableoverview",
  "transaction",
  "reports",
  "staff",
  "task",
  "live-route",
  "takeaway",
  "user-management",
  "printers",
  "cameras",
  "settings",
  "subscription",
  "expenses",
  "ingredient-prices",
  "cash-register-history",
  "integrations",
  "qr-menu-settings",
  "maintenance",
  "unauthorized",
  "qr",
  "menu",
  "qr-menu",
  "standalone",
  "standalone-register",
]);

export function getCurrentPathname() {
  if (typeof window === "undefined") return "";
  return String(window.location?.pathname || "");
}

export function isStandalonePath(pathname = getCurrentPathname()) {
  return String(pathname).startsWith("/standalone");
}

export function isPublicQrPath(pathname = getCurrentPathname()) {
  const path = String(pathname || "");
  if (!path || path === "/") return false;
  if (path === "/qr" || path === "/menu") return true;
  if (path.startsWith("/qr-menu/")) return true;

  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 1) return false;

  return !RESERVED_ROOT_SEGMENTS.has(segments[0]);
}

export function isPublicShellPath(pathname = getCurrentPathname()) {
  const path = String(pathname || "");
  return path === "/login" || path === "/staff-login" || isPublicQrPath(path);
}
