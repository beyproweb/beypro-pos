// utils/normalizeUser.js
export function normalizeUser(user, userSettings = {}) {
  if (!user) return null;

  let role = user.role?.toLowerCase() || "staff";
  let permissions = user.permissions?.map((p) => p.toLowerCase()) || [];

  // Admin → always superuser
  if (role === "admin") {
    permissions = ["all"];
  } else if (!permissions.length && userSettings.roles?.[role]) {
    permissions = userSettings.roles[role];
  }

  return { ...user, role, permissions };
}
