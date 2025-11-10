import { useEffect, useState } from "react";
import secureFetch from "../utils/secureFetch";
import {
  DEFAULT_PAYMENT_METHODS,
  normalizePaymentSettings,
} from "../utils/paymentMethods";

export function usePaymentMethods() {
  const [methods, setMethods] = useState(DEFAULT_PAYMENT_METHODS);

  useEffect(() => {
    let mounted = true;
    secureFetch("/settings/payments")
      .then((data) => {
        if (!mounted) return;
        const normalized = normalizePaymentSettings(data);
        setMethods(normalized.methods.filter((method) => method.enabled !== false));
      })
      .catch(() => {
        if (mounted) setMethods(DEFAULT_PAYMENT_METHODS);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return methods;
}

export function usePaymentSettings() {
  const [settings, setSettings] = useState(() => normalizePaymentSettings({}));

  useEffect(() => {
    let mounted = true;
    secureFetch("/settings/payments")
      .then((data) => {
        if (!mounted) return;
        setSettings(normalizePaymentSettings(data));
      })
      .catch(() => {
        if (mounted) setSettings(normalizePaymentSettings({}));
      });

    return () => {
      mounted = false;
    };
  }, []);

  return settings;
}
