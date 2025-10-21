import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

export default function useCashRegisterHistory(initialFrom, initialTo) {
  const today = new Date().toISOString().slice(0, 10);
  const from = initialFrom ?? "2024-01-01";
  const to = initialTo ?? today;

  const [state, setState] = useState(initialState);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await secureFetch(`/reports/cash-register-history?from=${from}&to=${to}`);
        if (cancelled) return;
        setState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load cash register history"),
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadToken]);

  return { ...state, refetch, from, to };
}
