import { useCallback, useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, details: {}, trends: [], from: "", to: "" };

function computeRange(range, customFrom, customTo) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (range === "today") {
    return { from: todayStr, to: todayStr };
  }

  if (range === "week") {
    const start = new Date();
    start.setDate(today.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: todayStr };
  }

  if (range === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  return null;
}

export default function useCategoryData({ range, customFrom, customTo }) {
  const [state, setState] = useState(initialState);
  const [reloadToken, setReloadToken] = useState(0);

  const dateRange = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!dateRange) {
      setState((prev) => ({ ...prev, from: "", to: "" }));
      return;
    }

    let cancelled = false;

    async function load() {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        from: dateRange.from,
        to: dateRange.to,
      }));

      try {
        const [detailed, trends] = await Promise.all([
          secureFetch(`/reports/sales-by-category-detailed?from=${dateRange.from}&to=${dateRange.to}`),
          secureFetch(`/reports/category-trends?from=${dateRange.from}&to=${dateRange.to}`),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          error: null,
          details: detailed && typeof detailed === "object" ? detailed : {},
          trends: Array.isArray(trends) ? trends : [],
          from: dateRange.from,
          to: dateRange.to,
        });
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load category data"),
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dateRange, reloadToken]);

  return { ...state, refetch };
}
