import React, { createContext, useContext, useState, useEffect } from "react";
import { useSetting } from "../components/hooks/useSetting";
import { normalizeUser } from "../utils/normalizeUser";
import { getAuthToken, BASE_URL as API_BASE } from "../utils/secureFetch";
import { safeNavigate } from "../utils/navigation";
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

  const getAuthStorage = () => {
    if (typeof window === "undefined") return null;
    try {
      if (window.sessionStorage?.getItem("token") || window.sessionStorage?.getItem("beyproUser")) {
        return window.sessionStorage;
      }
    } catch {}
    try {
      if (window.localStorage) return window.localStorage;
    } catch {}
    return null;
  };

  // ✅ Load cached user instantly on mount and normalize it
  useEffect(() => {
    try {
      const storage = getAuthStorage();
      const cachedUser = storage ? JSON.parse(storage.getItem("beyproUser")) : null;
      if (cachedUser) {
        const normalized = normalizeUser(cachedUser, userSettings);
        setCurrentUser(normalized);
        try {
          storage?.setItem("beyproUser", JSON.stringify(normalized));
        } catch {}

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

  // 🕒 Small delay ensures token & localStorage are ready before request
  const timer = setTimeout(() => {
    fetch(`${API_BASE}/me`, {
      headers: { Authorization: authHeader },
    })
      .then((res) => {
        if (res.status === 401) {
          console.warn("🔒 Token expired or invalid — logging out");
          // ✅ Preserve restaurant_id for staff PIN login
          const restaurantId = localStorage.getItem("restaurant_id");
          try {
            localStorage.removeItem("token");
            localStorage.removeItem("beyproUser");
          } catch {}
          try {
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("beyproUser");
          } catch {}
          // ✅ Restore restaurant_id after clearing storage
          if (restaurantId) {
            try {
              localStorage.setItem("restaurant_id", restaurantId);
            } catch {}
          }
          setCurrentUser(null);
          const isStandalone = window.location.pathname.startsWith("/standalone");
          const loginPath = isStandalone ? "/standalone/login" : "/login";
          if (!window.location.pathname.includes(loginPath)) {
            safeNavigate(loginPath);
          }
          return null;
        }
        return res.json();
      })
      .then((res) => {
        if (!res) return;
        if (res.error) {
          console.warn("⚠️ /me responded with error:", res.error);
          return;
        }

        const payload =
          res && typeof res === "object" && !Array.isArray(res) ? res : null;
        const fallbackUser =
          payload &&
          (payload.id ||
            payload.email ||
            payload.restaurant_id ||
            payload.role ||
            payload.permissions)
            ? payload
            : null;
        const user = payload?.user || payload?.staff || fallbackUser;

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
                } catch {}
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
              const storage = getAuthStorage() || localStorage;
              storage.setItem("beyproUser", JSON.stringify(nextUser));
              if (nextUser.restaurant_id) {
                localStorage.setItem("restaurant_id", nextUser.restaurant_id);
              }
            } catch {}

            return nextUser;
          });
        } else {
  console.warn("⚠️ No valid user returned from /me");
  setCurrentUser(null);
  localStorage.removeItem("beyproUser");
  const isStandalone = window.location.pathname.startsWith("/standalone");
  safeNavigate(isStandalone ? "/standalone/login" : "/login");
}

      })
      .catch((err) => {
        console.warn("⚠️ Backend not reachable, using cached user:", err.message);
      });
  }, 250); // 👈 delay (adjust if needed)

  return () => clearTimeout(timer);
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
