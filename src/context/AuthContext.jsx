// context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("beyproUser");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCurrentUser(parsed);
      } catch (err) {
        console.error("Failed to parse stored user", err);
      }
    }

    // simulate async fetch to backend (Render may cold start)
    fetch(import.meta.env.VITE_API_URL + "/api/auth/me", {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) setCurrentUser(user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, setCurrentUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
