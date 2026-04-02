import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  restoreCustomerSession,
  updateCustomerProfile,
} from "../services/customerService";

export default function useCustomerAuth(storage, options = {}) {
  const [customer, setCustomer] = useState(() => getCustomerSession(storage));
  const [isRestoring, setIsRestoring] = useState(false);
  const authContext = useMemo(
    () => ({
      storage,
      fetcher: options?.fetcher,
    }),
    [options?.fetcher, storage]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncCustomer = () => {
      setCustomer(getCustomerSession(storage));
    };

    const handleSessionChange = (event) => {
      const nextCustomer = event?.detail?.customer;
      if (nextCustomer === undefined) {
        syncCustomer();
        return;
      }
      setCustomer(nextCustomer || null);
    };

    const handleStorage = (event) => {
      const key = String(event?.key || "");
      if (
        key &&
        key !== "qr_customer_session" &&
        !key.endsWith("_customer_session") &&
        key !== "qr_customer_token" &&
        !key.endsWith("_customer_token")
      ) {
        return;
      }
      syncCustomer();
    };

    window.addEventListener("qr:customer-session-changed", handleSessionChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("qr:customer-session-changed", handleSessionChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [storage]);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (typeof authContext.fetcher !== "function") return;
      setIsRestoring(true);
      try {
        const next = await restoreCustomerSession(authContext);
        if (!cancelled) {
          setCustomer(next || null);
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [authContext]);

  const isLoggedIn = useMemo(() => Boolean(customer?.id), [customer]);

  const login = useCallback(
    async (payload) => {
      const next = await loginCustomer(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  const register = useCallback(
    async (payload) => {
      const next = await registerCustomer(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  const logout = useCallback(() => {
    logoutCustomer(authContext);
    setCustomer(null);
  }, [authContext]);

  const updateProfile = useCallback(
    async (payload) => {
      const next = await updateCustomerProfile(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  return {
    customer,
    isLoggedIn,
    isRestoring,
    login,
    register,
    logout,
    updateProfile,
  };
}
