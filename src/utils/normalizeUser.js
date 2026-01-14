// utils/normalizeUser.js
import { expandPermissionAliases, normalizePermissionList } from "./permissions";

export function normalizeUser(user, userSettings = {}) {
  if (!user) return null;

  let role = user.role?.toLowerCase() || "staff";
  let permissions = normalizePermissionList(user.permissions);

  // Admin → always superuser
  if (role === "admin") {
    permissions = ["all"];
  } else if (!permissions.length && userSettings.roles?.[role]) {
    permissions = normalizePermissionList(userSettings.roles[role]);
  }

  permissions = expandPermissionAliases(permissions);

  return { ...user, role, permissions };
}
