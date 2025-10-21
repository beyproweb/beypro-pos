// src/utils/permissions.js
export function hasPermission(perm, currentUser) {
  if (!currentUser || !currentUser.role) return false;

  const role = currentUser.role.toLowerCase();
  const permissions = (currentUser.permissions || []).map((p) => p.toLowerCase());
  const target = perm?.toLowerCase();

  // ✅ Admin bypass (case-insensitive)
  if (role === "admin" || permissions.includes("all")) return true;

  return permissions.includes(target);
}
