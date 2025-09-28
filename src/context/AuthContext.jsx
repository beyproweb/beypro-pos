// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { useSetting } from "../components/hooks/useSetting";

const API_URL = import.meta.env.VITE_API_URL || "";
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

  // ✅ Load cached user instantly
  useEffect(() => {
    try {
      const cachedUser = JSON.parse(localStorage.getItem("beyproUser"));
      if (cachedUser) {
        setCurrentUser({
          ...cachedUser,
          role: cachedUser.role?.toLowerCase(),
          permissions: cachedUser.permissions?.map((p) => p.toLowerCase()) || [],
        });
      }
    } catch {}
    setLoading(false);
    setInitializing(false);
  }, []);

  // ✅ Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(
        "beyproUserSettings",
        JSON.stringify(userSettings || { roles: {} })
      );
    } catch {}
  }, [userSettings]);

  // ✅ Background refresh
  useEffect(() => {
    const userFromStorage = JSON.parse(localStorage.getItem("beyproUser"));
    const email = userFromStorage?.email;
    if (!email) return;

    const resolvePermissions = (user) => {
      const perms = user.permissions?.length
        ? user.permissions.map((p) => p.toLowerCase())
        : userSettings.roles?.[user.role?.toLowerCase()] || [];
      return {
        ...user,
        role: user.role?.toLowerCase(),
        permissions: perms,
      };
    };

    fetch(`${API_URL}/api/me?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then((res) => {
        const user = res.user || res.staff;
        if (user) {
          const fullUser = resolvePermissions(user);
          setCurrentUser(fullUser);
          localStorage.setItem("beyproUser", JSON.stringify(fullUser));
        } else {
          setCurrentUser(null);
          localStorage.removeItem("beyproUser");
        }
      })
      .catch(() => {
        console.warn("Backend not reachable, using cached user.");
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
