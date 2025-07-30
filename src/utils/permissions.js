export function hasPermission(perm, currentUser, rolesConfig) {
  if (!currentUser || !currentUser.role) return false;
  const allowed = rolesConfig?.[currentUser.role] || [];
  if (allowed.includes("all")) return true;
  return allowed.includes(perm);
}
