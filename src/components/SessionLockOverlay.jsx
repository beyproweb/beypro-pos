// src/components/SessionLockOverlay.jsx
import React, { useState, useEffect } from "react";
import { useSessionLock } from "../context/SessionLockContext";
import { useAuth } from "../context/AuthContext";
import PINKeypad from "./PINKeypad";
import "./SessionLockOverlay.css";
import secureFetch from "../utils/secureFetch";
import { normalizeUser } from "../utils/normalizeUser";

export default function SessionLockOverlay() {
  const { isLocked, lockReason, unlock } = useSessionLock();
  const { currentUser, setCurrentUser } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showShake, setShowShake] = useState(false);

  // Reset state when lock opens
  useEffect(() => {
    if (isLocked) {
      setPin("");
      setError("");
      setLoading(false);
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleNumberClick = (num) => {
    if (pin.length >= 6) return;
    setPin(prev => prev + num);
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError("PIN/Password must be at least 4 characters");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ Get restaurant_id from multiple sources for tenant safety
      let restaurantId = currentUser?.restaurant_id || 
                        localStorage.getItem("restaurant_id") || 
                        sessionStorage.getItem("restaurant_id");
      
      if (!restaurantId) {
        // Try to get from beyproUser in storage as fallback
        try {
          const cachedUser = JSON.parse(localStorage.getItem("beyproUser") || sessionStorage.getItem("beyproUser") || "{}");
          restaurantId = cachedUser?.restaurant_id;
        } catch (e) {
          console.warn("Failed to parse cached user:", e);
        }
      }
      
      if (!restaurantId) {
        setError("Restaurant not configured. Please refresh the page.");
        setLoading(false);
        triggerShake();
        console.error("❌ No restaurant_id available for session unlock");
        return;
      }
      
      console.log("🏢 Using restaurant_id for session unlock:", restaurantId);
      console.log("👤 Current user:", currentUser);
      
      let response = null;
      let staffLoginFailed = false;
      
      // Try staff login first
      try {
        response = await secureFetch("/staff/login", {
          method: "POST",
          body: JSON.stringify({ pin, restaurant_id: restaurantId }),
        });
        
        if (!response?.success) {
          console.log("Staff login returned unsuccessful");
          staffLoginFailed = true;
        }
      } catch (err) {
        console.log("Staff login error (will try admin):", err.message);
        staffLoginFailed = true;
      }

      // If staff login fails, try admin login with password (only for admin users)
      if (staffLoginFailed) {
        // Only attempt admin login if current user is actually an admin
        const isAdmin = currentUser?.role?.toLowerCase() === "admin" || 
                       currentUser?.role?.toLowerCase() === "superadmin";
        
        if (!isAdmin) {
          console.log("❌ Staff PIN failed and user is not admin - no fallback");
          throw new Error("Invalid PIN");
        }
        
        // Try to get username/email from multiple sources
        let username = currentUser?.username || currentUser?.email;
        
        console.log("🔍 Checking username sources:");
        console.log("  - currentUser.username:", currentUser?.username);
        console.log("  - currentUser.email:", currentUser?.email);
        console.log("  - currentUser keys:", currentUser ? Object.keys(currentUser) : "no currentUser");
        
        // If not in currentUser, try to get from storage
        if (!username) {
          try {
            const cachedUser = JSON.parse(
              localStorage.getItem("beyproUser") || 
              sessionStorage.getItem("beyproUser") || 
              "{}"
            );
            console.log("  - cachedUser:", cachedUser);
            username = cachedUser?.username || cachedUser?.email;
            console.log("  - username from cache:", username);
          } catch (e) {
            console.warn("Failed to get username from cache:", e);
          }
        }
        
        console.log("✅ Final username for admin login:", username);
        
        if (username) {
          try {
            response = await secureFetch("/auth/login", {
              method: "POST",
              body: JSON.stringify({ 
                email: username,
                password: pin,
                restaurant_id: restaurantId 
              }),
            });
            
            console.log("Admin login response:", response);
          } catch (err) {
            console.log("Admin login error:", err.message);
          }
        } else {
          console.log("❌ No username/email found for admin login");
        }
      }

      if (!response?.success) {
        throw new Error(response?.error || "Invalid PIN/Password");
      }

      // Backend returns 'staff' for staff login or 'user' for admin login
      const userData = response.type === "staff" ? response.staff : response.user;
      const token = response.token;
      
      if (!userData || !token) {
        throw new Error("Invalid server response");
      }

      // Store token and update auth context
      sessionStorage.setItem("token", token);
      const normalized = normalizeUser(userData);
      if (normalized) {
        sessionStorage.setItem("beyproUser", JSON.stringify(normalized));
        if (normalized.restaurant_id) {
          localStorage.setItem("restaurant_id", normalized.restaurant_id);
        }
        setCurrentUser(normalized);
      }
      
      // Unlock the session
      unlock();
      
    } catch (err) {
      console.error("Unlock error:", err);
      setError(err.message || "Invalid PIN/Password. Please try again.");
      setPin("");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShowShake(true);
    setTimeout(() => setShowShake(false), 500);
  };

  const handleLogout = () => {
    // Clear all session and auth data
    sessionStorage.clear();
    localStorage.removeItem('sessionLocked');
    localStorage.removeItem('lockReason');
    localStorage.removeItem('token');
    localStorage.removeItem('beyproUser');
    localStorage.removeItem('restaurant_id');
    // Reset current user
    setCurrentUser(null);
    // Redirect to login
    window.location.href = "/login";
  };

  const getLockMessage = () => {
    switch (lockReason) {
      case "timeout":
        return "Session locked due to inactivity";
      case "manual":
        return "Session locked";
      case "unauthorized":
        return "Session expired - please sign in again";
      default:
        return "Session locked";
    }
  };

  return (
    <div className="session-lock-overlay">
      <div className={`session-lock-card ${showShake ? "shake" : ""}`}>
        {/* Header */}
        <div className="session-lock-header">
          <div className="lock-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="lock-message">{getLockMessage()}</p>
        </div>

        {/* Two Column Layout: User Info + Keypad */}
        <div className="session-lock-content">
          {/* Left Column: User Badge + PIN Display */}
          <div className="session-lock-left">
            {/* Current User Badge */}
            {currentUser && (
              <div className="current-user-badge">
                <div className="user-avatar">
                  {currentUser.avatar ? (
                    <img src={currentUser.avatar} alt={currentUser.name} />
                  ) : (
                    <span>{currentUser.name?.[0] || "?"}</span>
                  )}
                </div>
                <div className="user-info">
                  <div className="user-name">{currentUser.name || "Unknown"}</div>
                  <div className="user-role">{currentUser.role || "Staff"}</div>
                </div>
              </div>
            )}

            {/* PIN Input Display */}
            <div className="pin-display">
              {[...Array(6)].map((_, i) => (
                <div key={i} className={`pin-dot ${i < pin.length ? "filled" : ""}`} />
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            {/* Logout Button */}
            <button 
              className="logout-btn"
              onClick={handleLogout}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>

          {/* Right Column: Keypad */}
          <div className="session-lock-right">
            <PINKeypad
              onNumberClick={handleNumberClick}
              onClear={handleClear}
              onSubmit={handleSubmit}
              disabled={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
