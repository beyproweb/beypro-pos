import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

const CACHE_VERSION = "reports.cache.v1";

function getCacheKey(viewType) {
  return `${CACHE_VERSION}:salesTrends:${viewType}`;
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

export default function useSalesTrendsData(viewType) {
  const [state, setState] = useState(() => {
    const cached = readCache(getCacheKey(viewType));
    return cached ? { ...cached, loading: false, error: null } : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = getCacheKey(viewType);
    const cached = readCache(cacheKey);

    if (reloadToken === 0 && cached) {
      setState({ ...cached, loading: false, error: null });
      return undefined;
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await secureFetch(`/reports/sales-trends?type=${viewType}`);
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
          error: error instanceof Error ? error : new Error("Failed to load sales trends"),
        }));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewType, reloadToken]);

  return { ...state, refetch };
}
