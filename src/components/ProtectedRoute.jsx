// components/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useHasPermission } from '../components/hooks/useHasPermission';
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ permission, children }) {
  const has = useHasPermission(permission);
  const { loading } = useAuth();

  if (loading) {
    // You can customize your loader here
    return <div className="flex justify-center items-center h-screen">Loading...</div>;
  }

  if (!has) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
