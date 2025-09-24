// components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import useHasPermission from './hooks/useHasPermission';

export default function ProtectedRoute({ permission, children }) {
  const { currentUser, loading } = useAuth();
  const hasPermission = useHasPermission(permission);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-lg text-gray-600">
        🔄 Connecting to server…
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (!hasPermission) {
    return <Navigate to="/unauthorized" />;
  }

  return children;
}
