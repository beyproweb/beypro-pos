import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = {
  loading: false,
  error: null,
  registerState: "closed",
  lastOpenAt: null,
  opening: 0,
  expenses: 0,
  available: 0,
};

const CACHE_VERSION = "reports.cache.v2";
const CACHE_KEY = `${CACHE_VERSION}:cashSnapshot`;

function readCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return { data: parsed.data, cachedAt: parsed.cachedAt || 0 };
  } catch {
    return null;
  }
}

function writeCache(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // Ignore cache write failures
  }
}

export default function useCashRegisterSnapshot() {
  const [state, setState] = useState(() => {
    const cachedEntry = readCache();
    return cachedEntry?.data
      ? { ...cachedEntry.data, loading: false, error: null }
      : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const cachedEntry = readCache();
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
        const statusData = await secureFetch(`/reports/cash-register-status`);
        if (cancelled) return;

        const registerState = String(statusData?.status || "closed").toLowerCase();
        const lastOpenAt = statusData?.last_open_at || null;
        const openingCash = parseFloat(statusData?.opening_cash || 0);
        let cashExpenses = 0;
        let cashAvailable = openingCash;

        const openTime = lastOpenAt;
        if (openTime) {
          const encoded = encodeURIComponent(openTime);
          const [salesData, expenseData] = await Promise.all([
            secureFetch(`/reports/daily-cash-total?openTime=${encoded}`).catch(() => ({ cash_total: 0 })),
            secureFetch(`/reports/daily-cash-expenses?openTime=${encoded}`).catch(() => []),
          ]);

          const sales = parseFloat(salesData?.cash_total || 0);
          cashExpenses = parseFloat(expenseData?.[0]?.total_expense || 0);
          cashAvailable = openingCash + sales - cashExpenses;
        }

        if (cancelled) return;
        const nextState = {
          loading: false,
          error: null,
          registerState,
          lastOpenAt,
          opening: openingCash,
          expenses: cashExpenses,
          available: cashAvailable,
        };
        setState(nextState);
        writeCache(nextState);
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load cash register snapshot"),
        }));
      }
    }

    load({ silent: canUseCache });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { ...state, refetch };
}
