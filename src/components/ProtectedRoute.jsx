import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePlanModules } from "../context/PlanModulesContext";
import { expandPermissionAliases, normalizePermissionKey, normalizePermissionList } from "../utils/permissions";

export default function ProtectedRoute({ children, permission, moduleKey }) {
  const { currentUser, loading } = useAuth();
  const { isModuleAllowed } = usePlanModules();

  if (loading) return <div className="p-10 text-gray-500">Loading...</div>;

  if (!currentUser) {
    console.warn("🔒 No current user → redirecting to /login");
    return <Navigate to="/login" replace />;
  }

  if (moduleKey && !isModuleAllowed(moduleKey)) {
    console.warn("🧩 Blocked by plan modules:", { moduleKey, userRole: currentUser.role });
    const isAdmin = currentUser.role?.toLowerCase() === "admin";
    return <Navigate to={isAdmin ? "/subscription" : "/unauthorized"} replace />;
  }

  console.log("🔐 ProtectedRoute check:");
  console.log("   Required permission:", permission);
  console.log("   Current role:", currentUser.role);
  console.log("   Current permissions:", currentUser.permissions);

  // ✅ Admin always allowed
  if (currentUser.role?.toLowerCase() === "admin") {
    console.log("   Result: ✅ Admin superuser → access granted");
    return children;
  }

  // ✅ Direct permission check
  const perms = expandPermissionAliases(normalizePermissionList(currentUser.permissions));
  const required = (Array.isArray(permission) ? permission : [permission])
    .map((entry) => normalizePermissionKey(entry))
    .filter(Boolean);
  const allowed = perms.includes("all") || required.some((target) => perms.includes(target));

  console.log("   Result:", allowed ? "✅ Access granted" : "❌ Access denied");

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
