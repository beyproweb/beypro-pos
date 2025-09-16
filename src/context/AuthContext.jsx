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
  const [loading, setLoading] = useState(true); // ADD THIS

  useSetting("users", setUserSettings, { roles: {} });
  // Persist latest roles so LoginScreen's resolvePermissions can read them
useEffect(() => {
  try {
    localStorage.setItem("beyproUserSettings", JSON.stringify(userSettings || { roles: {} }));
  } catch {}
}, [userSettings]);

  useEffect(() => {
    setLoading(true); // START loading
    const userFromStorage = JSON.parse(localStorage.getItem("beyproUser"));
    const email = userFromStorage?.email;

    // Always recalculate permissions based on latest roles
    const resolvePermissions = (user) => {
      const perms = user.permissions?.length
        ? user.permissions
        : (userSettings.roles?.[user.role] || []);
      return { ...user, permissions: perms };
    };

    if (!email) {
      if (userFromStorage?.role) {
        setCurrentUser(resolvePermissions(userFromStorage));
      } else {
        setCurrentUser(null);
      }
      setLoading(false); // DONE loading
      return;
    }

    fetch(`${API_URL}/api/me?email=${encodeURIComponent(email)}`)
      .then(res => res.json())
      .then(res => {
        const user = res.user || res.staff;
        if (user) {
          const fullUser = resolvePermissions(user);
          setCurrentUser(fullUser);
          localStorage.setItem("beyproUser", JSON.stringify(fullUser));
        } else {
          setCurrentUser(null);
          localStorage.removeItem("beyproUser");
        }
        setLoading(false); // DONE loading
      })
      .catch(() => {
        setCurrentUser(null);
        localStorage.removeItem("beyproUser");
        setLoading(false); // DONE loading
      });
  }, [userSettings]);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};