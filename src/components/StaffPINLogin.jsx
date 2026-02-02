// src/components/StaffPINLogin.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PINKeypad from "./PINKeypad";
import "./StaffPINLogin.css";
import secureFetch from "../utils/secureFetch";
import { toast } from "react-toastify";
import { normalizeUser } from "../utils/normalizeUser";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 300000; // 5 minutes in ms

/**
 * Professional Staff PIN Login Screen
 * Enterprise-grade POS authentication for restaurant staff
 */
export default function StaffPINLogin({ switchMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCurrentUser, currentUser } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockoutEnd, setLockoutEnd] = useState(null);
  const [shake, setShake] = useState(false);
  const [staffPreview, setStaffPreview] = useState(null);
  const staffListRef = useRef([]);
  const lockoutTimerRef = useRef(null);

  // Load staff list for preview (only once)
  useEffect(() => {
    const loadStaffList = async () => {
      try {
        const staff = await secureFetch("/staff");
        if (Array.isArray(staff)) {
          staffListRef.current = staff;
        }
      } catch (err) {
        console.warn("⚠️ Could not load staff list:", err);
      }
    };
    loadStaffList();
  }, []);

  // Check for existing lockout on mount
  useEffect(() => {
    const lockoutData = sessionStorage.getItem("pin_lockout");
    if (lockoutData) {
      try {
        const { end, count } = JSON.parse(lockoutData);
        const now = Date.now();
        if (end > now) {
          setIsLocked(true);
          setLockoutEnd(end);
          setAttempts(count);
        } else {
          sessionStorage.removeItem("pin_lockout");
        }
      } catch {}
    }
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!isLocked || !lockoutEnd) return;

    const updateTimer = () => {
      const remaining = lockoutEnd - Date.now();
      if (remaining <= 0) {
        setIsLocked(false);
        setLockoutEnd(null);
        setAttempts(0);
        sessionStorage.removeItem("pin_lockout");
        if (lockoutTimerRef.current) {
          clearInterval(lockoutTimerRef.current);
        }
      }
    };

    updateTimer();
    lockoutTimerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
      }
    };
  }, [isLocked, lockoutEnd]);

  // Staff preview after first digit
  useEffect(() => {
    if (pin.length > 0 && staffListRef.current.length > 0) {
      const match = staffListRef.current.find((s) => s.pin?.startsWith(pin));
      setStaffPreview(match || null);
    } else {
      setStaffPreview(null);
    }
  }, [pin]);

  const handleNumberClick = useCallback((num) => {
    setError("");
    setPin((prev) => {
      if (prev.length >= 6) return prev; // Max 6 digits
      return prev + num;
    });
  }, []);

  const handleClear = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      triggerShake();
      return;
    }

    if (isLocked) {
      setError("Too many attempts. Please wait.");
      triggerShake();
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // ✅ Get restaurant_id from multiple sources for tenant safety
      // Priority: currentUser > localStorage > sessionStorage
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
        setError("Restaurant not configured. Please contact administrator.");
        setIsLoading(false);
        triggerShake();
        console.error("❌ No restaurant_id available for PIN login");
        return;
      }
      
      console.log("🏢 Using restaurant_id for PIN login:", restaurantId);
      
      // ✅ Use staff login endpoint with restaurant_id for tenant safety
      const response = await secureFetch("/staff/login", {
        method: "POST",
        body: JSON.stringify({ pin, restaurant_id: restaurantId }),
      });

      if (!response?.success) {
        throw new Error(response?.error || "Invalid PIN");
      }

      // ✅ Handle successful login
      const userData = response.type === "staff" ? response.staff : response.user;
      const token = response.token;

      if (!userData || !token) {
        throw new Error("Invalid server response");
      }

      console.log("✅ Login successful, storing data:", {
        userData: { ...userData, restaurant_id: userData.restaurant_id },
        tokenLength: token.length
      });

      // ✅ Store in sessionStorage (not localStorage for security)
      sessionStorage.setItem("token", token);
      sessionStorage.setItem("beyproUser", JSON.stringify(userData));
      sessionStorage.removeItem("pin_lockout");

      // ✅ Ensure restaurant_id is in localStorage
      if (userData.restaurant_id) {
        localStorage.setItem("restaurant_id", userData.restaurant_id);
      }

      console.log("✅ Token stored in sessionStorage");
      console.log("✅ beyproUser stored:", JSON.parse(sessionStorage.getItem("beyproUser")));

      // ✅ Update auth context
      const normalizedUser = normalizeUser(userData, { roles: {} });
      console.log("✅ Normalized user:", normalizedUser);
      setCurrentUser(normalizedUser);

      // ✅ Reset attempts
      setAttempts(0);

      // Small delay to ensure storage is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // ✅ Navigate based on context
      if (switchMode) {
        // If switching user, stay on current page
        window.location.reload();
      } else {
        // Navigate to last page or dashboard
        const lastPath = sessionStorage.getItem("lastPath");
        console.log("🔄 Navigating to:", lastPath || "/");
        if (lastPath && lastPath !== "/login" && lastPath !== "/staff-login") {
          navigate(lastPath, { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    } catch (err) {
      console.error("❌ PIN login failed:", err);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockEnd = Date.now() + LOCKOUT_DURATION;
        setIsLocked(true);
        setLockoutEnd(lockEnd);
        sessionStorage.setItem("pin_lockout", JSON.stringify({ end: lockEnd, count: newAttempts }));
        setError(`Too many attempts. Locked for 5 minutes.`);
      } else {
        setError(`Invalid PIN (${newAttempts}/${MAX_ATTEMPTS})`);
      }

      triggerShake();
      setPin("");
    } finally {
      setIsLoading(false);
    }
  }, [pin, attempts, isLocked, navigate, setCurrentUser, switchMode]);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const getRemainingTime = () => {
    if (!lockoutEnd) return "";
    const remaining = Math.ceil((lockoutEnd - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleCancel = () => {
    if (switchMode) {
      navigate(-1);
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="staff-pin-login">
      <div className={`pin-login-container ${shake ? "shake" : ""}`}>
        {/* Header */}
        <div className="pin-login-header">
          <div className="lock-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a5 5 0 0 1 5 5v4H7V7a5 5 0 0 1 5-5z" />
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <circle cx="12" cy="16" r="1" />
            </svg>
          </div>
          <h2>{switchMode ? "Switch User" : "Staff Login"}</h2>
          <p className="lock-message">{switchMode ? "Enter your PIN" : "Enter PIN to continue"}</p>
        </div>

        {/* Two Column Layout */}
        <div className="pin-login-content">
          {/* Left Column: Staff Preview + PIN Display */}
          <div className="pin-login-left">
            {/* Staff Preview */}
            {staffPreview && !error ? (
              <div className="staff-preview">
                <div className="staff-avatar-wrapper">
                  {staffPreview.avatar ? (
                    <img
                      src={staffPreview.avatar}
                      alt={staffPreview.name}
                      className="staff-avatar"
                    />
                  ) : (
                    <span>{staffPreview.name?.[0] || "?"}</span>
                  )}
                </div>
                <div className="staff-info">
                  <div className="staff-name">{staffPreview.name}</div>
                  <div className="staff-role">{staffPreview.role}</div>
                </div>
              </div>
            ) : (
              <div className="staff-preview-empty">
                <div className="empty-avatar">?</div>
                <div className="empty-text">Enter PIN</div>
              </div>
            )}

            {/* PIN Display */}
            <div className="pin-display">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className={`pin-dot ${i < pin.length ? "filled" : ""}`}
                />
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
                {isLocked && <span className="lockout-timer">{getRemainingTime()}</span>}
                <span>{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            {switchMode && (
              <button className="pin-action-btn cancel" onClick={handleCancel}>
                Cancel
              </button>
            )}
            {!switchMode && (
              <button className="pin-action-btn secondary" onClick={() => navigate("/login")}>
                Admin Login
              </button>
            )}
          </div>

          {/* Right Column: Keypad */}
          <div className="pin-login-right">
            <PINKeypad
              onNumberClick={handleNumberClick}
              onClear={handleClear}
              onSubmit={handleSubmit}
              disabled={isLoading || isLocked}
            />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="pin-loading">
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
