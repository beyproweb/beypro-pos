// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";

export default function ProtectedRoute({ permission, children }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // ⏳ Wait for AuthContext to finish resolving (prevents false "unauthorized")
  if (loading) {
    return null; // or a spinner/skeleton
  }

  // Not logged in → to login
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Load roles config that AuthContext persisted
  let rolesConfig = {};
  try {
    const stored = JSON.parse(localStorage.getItem("beyproUserSettings") || "{}");
    rolesConfig = stored.roles || {};
  } catch {}

  // ✅ Check permission now that everything is ready
  const allowed = hasPermission(permission, currentUser, rolesConfig);
  return allowed ? children : <Navigate to="/unauthorized" replace />;
}
