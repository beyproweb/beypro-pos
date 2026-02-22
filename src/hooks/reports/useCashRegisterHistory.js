import { useCallback, useEffect, useState } from "react";
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

function getCacheKey(from, to) {
  return `${CACHE_VERSION}:cashHistory:${from}:${to}`;
}

function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return { data: parsed.data, cachedAt: parsed.cachedAt || 0 };
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
  const today = toLocalYmd(new Date());
  const from = initialFrom ?? "2024-01-01";
  const to = initialTo ?? today;

  const [state, setState] = useState(() => {
    const cachedEntry = readCache(getCacheKey(from, to));
    return cachedEntry?.data
      ? { ...cachedEntry.data, loading: false, error: null }
      : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = getCacheKey(from, to);
    const cachedEntry = readCache(cacheKey);
    const cached = cachedEntry?.data || null;
    const canUseCache = reloadToken === 0 && !!cached;
    if (canUseCache) setState({ ...cached, loading: false, error: null });

    async function load({ silent = false } = {}) {
      if (!silent) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, error: null }));
      }
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

    load({ silent: canUseCache });
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadToken]);

  return { ...state, refetch, from, to };
}
