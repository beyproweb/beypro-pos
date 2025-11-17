import React, { createContext, useContext, useEffect, useState } from "react";
import secureFetch from "../utils/secureFetch";
import {
  DEFAULT_CURRENCY_KEY,
  getCurrencyConfig,
  formatCurrency as formatCurrencyWithKey,
} from "../utils/currency";

const CurrencyContext = createContext({
  currencyKey: DEFAULT_CURRENCY_KEY,
  config: getCurrencyConfig(DEFAULT_CURRENCY_KEY),
  formatCurrency: (amount) => String(amount ?? ""),
  setCurrencyKey: () => {},
});

export function CurrencyProvider({ children }) {
  const [currencyKey, setCurrencyKey] = useState(() => {
    try {
      return (
        localStorage.getItem("beyproCurrency") || DEFAULT_CURRENCY_KEY
      );
    } catch {
      return DEFAULT_CURRENCY_KEY;
    }
  });

  const [config, setConfig] = useState(() => getCurrencyConfig(currencyKey));

  // Keep global window helpers in sync for non-React utilities
  const syncGlobals = (key) => {
    const cfg = getCurrencyConfig(key);
    if (typeof window !== "undefined") {
      window.beyproCurrencyKey = key;
      window.beyproCurrencyLabel = cfg.label;
      window.beyproCurrency = cfg;
    }
  };

  useEffect(() => {
    setConfig(getCurrencyConfig(currencyKey));
    try {
      localStorage.setItem("beyproCurrency", currencyKey);
    } catch {}
    syncGlobals(currencyKey);
  }, [currencyKey]);

  // Initial load from backend localization settings
  useEffect(() => {
    let mounted = true;
    secureFetch("/settings/localization")
      .then((data) => {
        if (!mounted || !data?.currency) return;
        setCurrencyKey(data.currency);
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load localization currency:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const value = {
    currencyKey,
    config,
    formatCurrency: (amount, options) =>
      formatCurrencyWithKey(amount, currencyKey, options),
    setCurrencyKey,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}

