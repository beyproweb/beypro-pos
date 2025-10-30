import React, { createContext, useContext, useState, useEffect } from "react";
import { useSetting } from "../components/hooks/useSetting";
import { normalizeUser } from "../utils/normalizeUser";
import { getAuthToken } from "../utils/secureFetch";

// Always point to the API base (ending in /api)
const RAW_API =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://hurrypos-backend.onrender.com/api");
const API_BASE = String(RAW_API).replace(/\/+$/, "");
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

        // ✅ Ensure restaurant_id is always in localStorage
        if (normalized.restaurant_id) {
          localStorage.setItem("restaurant_id", normalized.restaurant_id);
        }
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
    const rawToken = getAuthToken();
    if (!rawToken) return;

    const authHeader = rawToken.startsWith("Bearer ")
      ? rawToken
      : `Bearer ${rawToken}`;

    fetch(`${API_BASE}/me`, {
      headers: { Authorization: authHeader },
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
          setCurrentUser((prev) => {
            const normalized = normalizeUser(user, userSettings);
            if (!normalized) return prev || null;

            const nextUser = { ...normalized };

            if (!Array.isArray(nextUser.permissions) || nextUser.permissions.length === 0) {
              if (prev?.permissions?.length) {
                nextUser.permissions = prev.permissions;
              } else {
                try {
                  const cached = JSON.parse(localStorage.getItem("beyproUser") || "{}");
                  if (Array.isArray(cached?.permissions) && cached.permissions.length) {
                    nextUser.permissions = cached.permissions;
                  }
                } catch {
                  /* ignore */
                }
              }
            }

            if (!nextUser.token) {
              if (prev?.token) {
                nextUser.token = prev.token;
              } else {
                const raw = getAuthToken();
                if (raw) {
                  nextUser.token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
                }
              }
            }

            try {
              localStorage.setItem("beyproUser", JSON.stringify(nextUser));
              if (nextUser.restaurant_id) {
                localStorage.setItem("restaurant_id", nextUser.restaurant_id);
              }
            } catch {
              /* ignore */
            }

            return nextUser;
          });
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
