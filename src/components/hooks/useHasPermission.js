// src/components/hooks/useHasPermission.js
import { useAuth } from "../../context/AuthContext";

export function useHasPermission(perm) {
  const { currentUser } = useAuth();

  if (!currentUser) return false;

  // ✅ Normalize permissions
  const perms = Array.isArray(currentUser.permissions)
    ? currentUser.permissions.map((p) => p.toLowerCase())
    : [];

  if (perms.includes("all")) return true;

  // ✅ Special rule: allow packet-orders even if tables denied
  if (perm === "packet-orders" && perms.includes("packet-orders")) {
    return true;
  }

  // ✅ Default permission check
  return perms.includes(perm);
}
