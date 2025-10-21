import { useCallback, useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

export default function useProfitLossData(timeframe) {
  const [state, setState] = useState(initialState);
  const [reloadToken, setReloadToken] = useState(0);

  const { from, to } = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (timeframe === "daily") {
      return { from: todayStr, to: todayStr };
    }

    if (timeframe === "weekly") {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      return { from: start.toISOString().slice(0, 10), to: todayStr };
    }

    if (timeframe === "monthly") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: firstDay.toISOString().slice(0, 10), to: todayStr };
    }

    return { from: todayStr, to: todayStr };
  }, [timeframe]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await secureFetch(`/reports/profit-loss?timeframe=${timeframe}&from=${from}&to=${to}`);
        if (cancelled) return;
        setState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load profit & loss"),
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [timeframe, from, to, reloadToken]);

  return { ...state, from, to, refetch };
}
