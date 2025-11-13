// src/components/hooks/useHasPermission.js
import { useAuth } from "../../context/AuthContext";

export function useHasPermission(perm) {
  const { currentUser } = useAuth();

  if (!currentUser) return false;

  // 🔥 ADMIN ALWAYS HAS FULL ACCESS
  if (String(currentUser.role || "").toLowerCase() === "admin") {
    return true;
  }

  // Normalize permissions array
  const perms = Array.isArray(currentUser.permissions)
    ? currentUser.permissions.map((p) => String(p).toLowerCase())
    : [];

  // 🔥 "all" = full access for superusers & admins
  if (perms.includes("all")) return true;

  // Special rule: packet always allowed if explicitly given
  if (perm === "packet-orders" && perms.includes("packet-orders")) {
    return true;
  }

  // Default check
  return perms.includes(perm.toLowerCase());
}
