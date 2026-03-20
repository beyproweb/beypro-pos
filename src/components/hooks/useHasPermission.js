// src/components/hooks/useHasPermission.js
import { useAuth } from "../../context/AuthContext";
import { expandPermissionAliases, normalizePermissionKey, normalizePermissionList } from "../../utils/permissions";

export function useHasPermission(perm) {
  const { currentUser } = useAuth();

  if (!currentUser) return false;

  // 🔥 ADMIN ALWAYS HAS FULL ACCESS
  if (String(currentUser.role || "").toLowerCase() === "admin") {
    return true;
  }

  const perms = expandPermissionAliases(normalizePermissionList(currentUser.permissions));
  const targets = (Array.isArray(perm) ? perm : [perm])
    .map((entry) => normalizePermissionKey(entry))
    .filter(Boolean);

  // 🔥 "all" = full access for superusers & admins
  if (perms.includes("all")) return true;

  // Special rule: packet always allowed if explicitly given
  if (targets.includes("packet-orders") && perms.includes("packet-orders")) {
    return true;
  }

  // Default check
  return targets.some((target) => perms.includes(target));
}
