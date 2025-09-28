// src/utils/permissions.js
export function hasPermission(perm, currentUser, rolesConfig) {
  if (!currentUser || !currentUser.role) return false;

  const role = currentUser.role.toLowerCase();

  // ✅ Admin bypass (case-insensitive)
  if (role === "admin") return true;

  // ✅ Normalize permissions to lowercase
  const allowed = currentUser.permissions?.map((p) => p.toLowerCase())?.length
    ? currentUser.permissions.map((p) => p.toLowerCase())
    : rolesConfig?.[role] || [];

  if (allowed.includes("all")) return true;
  return allowed.includes(perm.toLowerCase());
}
