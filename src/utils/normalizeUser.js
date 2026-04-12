// utils/normalizeUser.js
import { expandPermissionAliases, normalizePermissionList } from "./permissions";

export function normalizeUser(user, userSettings = {}) {
  if (!user) return null;

  let role = user.role?.toLowerCase() || "staff";
  let permissions = normalizePermissionList(user.permissions);
  const isAdminLike = role === "admin" || role === "superadmin" || role === "super-admin";

  // Admin → always superuser
  if (isAdminLike) {
    permissions = ["all"];
  } else if (!permissions.length && userSettings.roles?.[role]) {
    permissions = normalizePermissionList(userSettings.roles[role]);
  }

  permissions = expandPermissionAliases(permissions);

  return { ...user, role, permissions };
}
