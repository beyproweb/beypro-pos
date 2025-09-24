// src/components/hooks/useHasPermission.js
import { useAuth } from "../../context/AuthContext";

export function useHasPermission(perm) {
  const { currentUser } = useAuth();

  if (!currentUser) return false;

  // ✅ Primary: check permissions on currentUser
  const perms = currentUser.permissions || [];

  if (perms.includes("all")) return true;
  return perms.includes(perm);
}
