import { useCallback, useMemo, useState } from "react";
import {
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  updateCustomerProfile,
} from "../services/customerService";

export default function useCustomerAuth(storage) {
  const [customer, setCustomer] = useState(() => getCustomerSession(storage));

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
