import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, permission }) {
  const { currentUser, loading } = useAuth();

  if (loading) return <div className="p-10 text-gray-500">Loading...</div>;

  if (!currentUser) {
    console.warn("🔒 No current user → redirecting to /login");
    return <Navigate to="/login" replace />;
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
  const allowed =
    currentUser.permissions?.includes("all") ||
    currentUser.permissions?.includes(permission?.toLowerCase());

  console.log("   Result:", allowed ? "✅ Access granted" : "❌ Access denied");

  if (!allowed) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
