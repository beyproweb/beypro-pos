// src/utils/permissions.js
export function normalizePermissionKey(value) {
  if (value == null) return "";
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, "-");
}

export function normalizePermissionList(list) {
  if (!Array.isArray(list)) return [];
  const normalized = list
    .map((perm) => normalizePermissionKey(perm))
    .filter(Boolean);
  return [...new Set(normalized)];
}

export function expandPermissionAliases(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return [];

  const expanded = new Set(permissions);

  // Back-compat: legacy UI uses "tables", backend/roles often use "table-overview".
  if (expanded.has("table-overview")) expanded.add("tables");
  if (expanded.has("tables")) expanded.add("table-overview");

  const registerAliases = ["register", "register-access", "cash-register"];
  if (registerAliases.some((alias) => expanded.has(alias))) {
    registerAliases.forEach((alias) => expanded.add(alias));
  }

  const qrMenuAliases = ["qr-menu", "qr-menu-settings", "qr-menusettings"];
  if (qrMenuAliases.some((alias) => expanded.has(alias))) {
    qrMenuAliases.forEach((alias) => expanded.add(alias));
  }

  return [...expanded];
}

export function hasPermission(perm, currentUser) {
  if (!currentUser || !currentUser.role) return false;

  const role = currentUser.role.toLowerCase();
  const permissions = expandPermissionAliases(normalizePermissionList(currentUser.permissions));
  const target = normalizePermissionKey(perm);

  // ✅ Admin bypass (case-insensitive)
  if (role === "admin" || permissions.includes("all")) return true;

  return permissions.includes(target);
}
