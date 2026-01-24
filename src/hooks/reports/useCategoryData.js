import { useCallback, useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, details: {}, trends: [], from: "", to: "" };

const CACHE_VERSION = "reports.cache.v1";

function getCacheKey(range, from, to) {
  return `${CACHE_VERSION}:category:${range}:${from}:${to}`;
}

function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // Ignore cache write failures
  }
}

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
  const [state, setState] = useState(() => {
    const dateRange = computeRange(range, customFrom, customTo);
    if (!dateRange) return initialState;
    const cached = readCache(getCacheKey(range, dateRange.from, dateRange.to));
    return cached ? { ...cached, loading: false, error: null } : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const dateRange = useMemo(() => computeRange(range, customFrom, customTo), [range, customFrom, customTo]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!dateRange) {
      setState((prev) => ({ ...prev, from: "", to: "" }));
      return;
    }

    let cancelled = false;
    const cacheKey = getCacheKey(range, dateRange.from, dateRange.to);
    const cached = readCache(cacheKey);

    if (reloadToken === 0 && cached) {
      setState({ ...cached, loading: false, error: null });
      return undefined;
    }

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

        const nextState = {
          loading: false,
          error: null,
          details: detailed && typeof detailed === "object" ? detailed : {},
          trends: Array.isArray(trends) ? trends : [],
          from: dateRange.from,
          to: dateRange.to,
        };
        setState(nextState);
        writeCache(cacheKey, nextState);
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
