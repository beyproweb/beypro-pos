import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

const CACHE_VERSION = "reports.cache.v1";

function getCacheKey(from, to) {
  return `${CACHE_VERSION}:cashHistory:${from}:${to}`;
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

export default function useCashRegisterHistory(initialFrom, initialTo) {
  const today = new Date().toISOString().slice(0, 10);
  const from = initialFrom ?? "2024-01-01";
  const to = initialTo ?? today;

  const [state, setState] = useState(() => {
    const cached = readCache(getCacheKey(from, to));
    return cached ? { ...cached, loading: false, error: null } : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = getCacheKey(from, to);
    const cached = readCache(cacheKey);

    if (reloadToken === 0 && cached) {
      setState({ ...cached, loading: false, error: null });
      return undefined;
    }

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await secureFetch(`/reports/cash-register-history?from=${from}&to=${to}`);
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
