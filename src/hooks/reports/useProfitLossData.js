import { useCallback, useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

const CACHE_VERSION = "reports.cache.v2";

const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function getCacheKey(timeframe, from, to) {
  return `${CACHE_VERSION}:profitLoss:${timeframe}:${from}:${to}`;
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

export default function useProfitLossData(timeframe, range = {}) {
  const rangeFromOverride = range?.from || "";
  const rangeToOverride = range?.to || "";

  const computeDefaultRange = useCallback(() => {
    const today = new Date();
    const todayStr = toLocalYmd(today);

    if (timeframe === "daily") {
      return { from: todayStr, to: todayStr };
    }

    if (timeframe === "weekly") {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      return { from: toLocalYmd(start), to: todayStr };
    }

    if (timeframe === "monthly") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toLocalYmd(firstDay), to: todayStr };
    }

    return { from: todayStr, to: todayStr };
  }, [timeframe]);

  const [state, setState] = useState(() => {
    const fallback = computeDefaultRange();
    const effectiveFrom = rangeFromOverride || fallback.from;
    const effectiveTo = rangeToOverride || fallback.to;
    const cached = readCache(getCacheKey(timeframe, effectiveFrom, effectiveTo));
    return cached ? { ...cached, loading: false, error: null } : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const { from, to } = useMemo(() => {
    const fallback = computeDefaultRange();
    return {
      from: rangeFromOverride || fallback.from,
      to: rangeToOverride || fallback.to,
    };
  }, [computeDefaultRange, rangeFromOverride, rangeToOverride]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = getCacheKey(timeframe, from, to);
    const cached = readCache(cacheKey);

    const canUseCache = reloadToken === 0 && !!cached;
    if (canUseCache) setState({ ...cached, loading: false, error: null });

    async function load({ silent = false } = {}) {
      if (!silent) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, error: null }));
      }
      try {
        const data = await secureFetch(
          `/reports/profit-loss?timeframe=${timeframe}&from=${from}&to=${to}`
        );
        if (cancelled) return;
        const nextState = {
          loading: false,
          error: null,
          data: Array.isArray(data) ? data : [],
        };
        setState(nextState);
        writeCache(cacheKey, nextState);
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load profit & loss"),
        }));
      }
    }

    load({ silent: canUseCache });
    return () => {
      cancelled = true;
    };
  }, [timeframe, from, to, reloadToken]);

  return { ...state, from, to, refetch };
}
