import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import { useAuth } from "./AuthContext";

const PlanModulesContext = createContext(null);

const ALWAYS_ALLOWED_MODULE_KEYS = new Set([
  "page.login",
  "page.dashboard",
  "page.settings.subscription",
  "page.unauthorized",
]);

function normalizeAllowedKeys(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const k of value) {
    if (typeof k !== "string") continue;
    const key = k.trim();
    if (key) out.push(key);
  }
  return Array.from(new Set(out));
}

export function PlanModulesProvider({ children }) {
  const { currentUser } = useAuth();
  const [plan, setPlan] = useState(null);
  const [allowedKeys, setAllowedKeys] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const restaurantId = currentUser?.restaurant_id || null;
  const storageKey = restaurantId ? `beyproPlanModules::${restaurantId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (cached && typeof cached === "object") {
        if (typeof cached.plan === "string") setPlan(cached.plan);
        setAllowedKeys(normalizeAllowedKeys(cached.allowedModuleKeys));
      }
    } catch {
      // ignore cache parse errors
    }
  }, [storageKey]);

  const refresh = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setPlan(null);
      setAllowedKeys(null);
      setLoading(false);
      setError(null);
      return;
    }

    const isStandalone =
      typeof window !== "undefined" &&
      typeof window.location?.pathname === "string" &&
      window.location.pathname.startsWith("/standalone");
    if (isStandalone) {
      setPlan(null);
      setAllowedKeys(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await secureFetch("/plan-modules");
      const nextPlan = typeof res?.plan === "string" ? res.plan : null;
      const nextAllowed = normalizeAllowedKeys(res?.allowedModuleKeys);

      setPlan(nextPlan);
      setAllowedKeys(nextAllowed);

      if (storageKey) {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ plan: nextPlan, allowedModuleKeys: nextAllowed })
          );
        } catch {
          // ignore storage errors
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Safety: if plan gating cannot be fetched, do not block the UI.
      setPlan(null);
      setAllowedKeys(null);
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!currentUser) {
      setPlan(null);
      setAllowedKeys(null);
      setLoading(false);
      setError(null);
      return;
    }
    void refresh();
  }, [currentUser, refresh]);

  const isModuleAllowed = useCallback(
    (moduleKey) => {
      if (!moduleKey) return true;
      if (ALWAYS_ALLOWED_MODULE_KEYS.has(moduleKey)) return true;
      // null => feature gating not configured; allow everything
      if (allowedKeys === null) return true;
      return allowedKeys.includes(moduleKey);
    },
    [allowedKeys]
  );

  const value = useMemo(
    () => ({
      plan,
      allowedModuleKeys: allowedKeys,
      loading,
      error,
      refresh,
      isModuleAllowed,
    }),
    [allowedKeys, error, isModuleAllowed, loading, plan, refresh]
  );

  return <PlanModulesContext.Provider value={value}>{children}</PlanModulesContext.Provider>;
}

export function usePlanModules() {
  const ctx = useContext(PlanModulesContext);
  if (!ctx) {
    return {
      plan: null,
      allowedModuleKeys: null,
      loading: false,
      error: null,
      refresh: async () => {},
      isModuleAllowed: () => true,
    };
  }
  return ctx;
}
