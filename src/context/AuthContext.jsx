import React, { createContext, useContext, useState, useEffect } from "react";
import { useSetting } from "../components/hooks/useSetting";
import { normalizeUser } from "../utils/normalizeUser";

const API_URL = import.meta.env.VITE_API_URL || "https://hurrypos-backend.onrender.com";
export const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userSettings, setUserSettings] = useState({ roles: {} });
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);

  useSetting("users", setUserSettings, { roles: {} });

  // ✅ Load cached user instantly on mount and normalize it
  useEffect(() => {
    try {
      const cachedUser = JSON.parse(localStorage.getItem("beyproUser"));
      if (cachedUser) {
        const normalized = normalizeUser(cachedUser, userSettings);
        setCurrentUser(normalized);
        localStorage.setItem("beyproUser", JSON.stringify(normalized));
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse cached user:", err);
    }
    setLoading(false);
    setInitializing(false);
  }, []);

  // ✅ Persist role settings for permission hooks
  useEffect(() => {
    try {
      localStorage.setItem("beyproUserSettings", JSON.stringify(userSettings || { roles: {} }));
    } catch {}
  }, [userSettings]);

  // ✅ Background refresh (runs once, token-based)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const resolvePermissions = (user) => {
      const normalized = normalizeUser(user, userSettings);
      return normalized;
    };

    fetch(`${API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) {
          console.warn("🔒 Token expired or invalid — logging out");
          localStorage.removeItem("token");
          localStorage.removeItem("beyproUser");
          setCurrentUser(null);
          if (!window.location.pathname.includes("/login")) {
            window.location.href = "/login";
          }
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (!res) return;
        const user = res.user || res.staff;
        if (user) {
          const fullUser = resolvePermissions(user);
          setCurrentUser(fullUser);
          localStorage.setItem("beyproUser", JSON.stringify(fullUser));
        } else {
          console.warn("⚠️ No valid user returned from /me");
          setCurrentUser(null);
          localStorage.removeItem("beyproUser");
        }
      })
      .catch((err) => {
        console.warn("⚠️ Backend not reachable, using cached user:", err.message);
      });
  }, [userSettings]);

  if (initializing && !currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
        <div className="text-4xl font-extrabold tracking-tight mb-4">Beypro</div>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-white border-opacity-70"></div>
        <p className="mt-4 text-sm opacity-80">Starting up...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
