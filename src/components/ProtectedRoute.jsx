// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";

export default function ProtectedRoute({ children, permission }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-gray-500">Loading...</div>;
  }

  if (!currentUser) {
    console.warn("🔒 No current user → redirecting to /login");
    return <Navigate to="/login" replace />;
  }

  // Debug logs
  console.log("🔐 ProtectedRoute check:");
  console.log("   Required permission:", permission);
  console.log("   Current role:", currentUser.role);
  console.log("   Current permissions:", currentUser.permissions);

  const rolesConfig = window.beyproUserSettings?.roles || {};
  const allowed = hasPermission(permission, currentUser, rolesConfig);

  console.log("   Result:", allowed ? "✅ Access granted" : "❌ Access denied");

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
