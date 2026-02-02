// src/components/StaffPINGuard.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import StaffPINLogin from "./StaffPINLogin";
import secureFetch from "../utils/secureFetch";

/**
 * Wrapper that enforces PIN login if pinRequired = true
 * Auto-skips to regular login if pinRequired = false
 */
export default function StaffPINGuard({ children }) {
  const { currentUser } = useAuth();
  const [pinRequired, setPinRequired] = useState(null); // null = loading
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPINSetting = async () => {
      try {
        const settings = await secureFetch("/settings/users");
        const required = settings?.pinRequired === true;
        setPinRequired(required);
      } catch (err) {
        console.warn("⚠️ Could not fetch PIN settings, assuming not required:", err);
        setPinRequired(false);
      } finally {
        setLoading(false);
      }
    };

    checkPINSetting();
  }, []);

  // Loading state
  if (loading || pinRequired === null) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div
          style={{
            width: "48px",
            height: "48px",
            border: "4px solid #e2e8f0",
            borderTopColor: "#6366f1",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  // If PIN not required, proceed to normal flow
  if (!pinRequired) {
    return <>{children}</>;
  }

  // If PIN required and user not logged in, show PIN screen
  if (!currentUser) {
    return <StaffPINLogin />;
  }

  // User is logged in with valid session
  return <>{children}</>;
}
