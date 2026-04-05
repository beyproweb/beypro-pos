import { useCallback, useEffect, useMemo, useState } from "react";
import {
  completeCustomerOAuthFromUrl,
  getCustomerSession,
  loginCustomer,
  logoutCustomer,
  registerCustomer,
  restoreCustomerSession,
  startAppleOAuthLogin,
  startGoogleOAuthLogin,
  updateCustomerProfile,
} from "../services/customerService";

export default function useCustomerAuth(storage, options = {}) {
  const [customer, setCustomer] = useState(() => getCustomerSession(storage));
  const [isRestoring, setIsRestoring] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const authContext = useMemo(
    () => ({
      storage,
      fetcher: options?.fetcher,
      identifier: options?.identifier,
      getIdentifier: options?.getIdentifier,
    }),
    [options?.fetcher, options?.getIdentifier, options?.identifier, storage]
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
      setIsRestoring(true);
      try {
        const oauthResult = await completeCustomerOAuthFromUrl(authContext);
        if (!cancelled && oauthResult?.handled) {
          setOauthError(String(oauthResult?.error || "").trim());
          if (oauthResult?.customer) {
            setCustomer(oauthResult.customer);
          }
          if (oauthResult?.customer && typeof authContext.fetcher === "function") {
            return;
          }
        }

        if (typeof authContext.fetcher !== "function") return;
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
      setOauthError("");
      const next = await loginCustomer(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  const register = useCallback(
    async (payload) => {
      setOauthError("");
      const next = await registerCustomer(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  const logout = useCallback(() => {
    setOauthError("");
    logoutCustomer(authContext);
    setCustomer(null);
  }, [authContext]);

  const updateProfile = useCallback(
    async (payload) => {
      setOauthError("");
      const next = await updateCustomerProfile(payload, authContext);
      setCustomer(next);
      return next;
    },
    [authContext]
  );

  const loginWithGoogle = useCallback(
    (optionsArg = {}) => {
      setOauthError("");
      return startGoogleOAuthLogin(authContext, optionsArg);
    },
    [authContext]
  );

  const loginWithApple = useCallback(
    (optionsArg = {}) => {
      setOauthError("");
      return startAppleOAuthLogin(authContext, optionsArg);
    },
    [authContext]
  );

  const clearOauthError = useCallback(() => {
    setOauthError("");
  }, []);

  return {
    customer,
    isLoggedIn,
    isRestoring,
    oauthError,
    clearOauthError,
    login,
    loginWithApple,
    loginWithGoogle,
    register,
    logout,
    updateProfile,
  };
}
