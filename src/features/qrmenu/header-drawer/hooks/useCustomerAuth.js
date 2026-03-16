import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  updateCustomerProfile,
} from "../services/customerService";

export default function useCustomerAuth(storage) {
  const [customer, setCustomer] = useState(() => getCustomerSession(storage));

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
      if (event?.key && event.key !== "qr_customer_session") return;
      syncCustomer();
    };

    window.addEventListener("qr:customer-session-changed", handleSessionChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("qr:customer-session-changed", handleSessionChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [storage]);

  const isLoggedIn = useMemo(() => Boolean(customer?.id), [customer]);

  const login = useCallback(
    (payload) => {
      const next = loginCustomer(payload, storage);
      setCustomer(next);
      return next;
    },
    [storage]
  );

  const register = useCallback(
    (payload) => {
      const next = registerCustomer(payload, storage);
      setCustomer(next);
      return next;
    },
    [storage]
  );

  const logout = useCallback(() => {
    logoutCustomer(storage);
    setCustomer(null);
  }, [storage]);

  const updateProfile = useCallback(
    (payload) => {
      const next = updateCustomerProfile(payload, storage);
      setCustomer(next);
      return next;
    },
    [storage]
  );

  return {
    customer,
    isLoggedIn,
    login,
    register,
    logout,
    updateProfile,
  };
}
