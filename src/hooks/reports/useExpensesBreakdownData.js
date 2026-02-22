import { useCallback, useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = {
  loading: false,
  error: null,
  expensesData: [],
  staffPayments: [],
  supplierPayments: [],
};

const CACHE_VERSION = "reports.cache.v2";

function getCacheKey(from, to) {
  return `${CACHE_VERSION}:expensesBreakdown:${from}:${to}`;
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

export default function useExpensesBreakdownData({ from, to }) {
  const [state, setState] = useState(() => {
    if (!from || !to) return initialState;
    const cachedEntry = readCache(getCacheKey(from, to));
    return cachedEntry?.data
      ? { ...cachedEntry.data, loading: false, error: null }
      : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!from || !to) return;

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

      const [expensesRes, staffRes, supplierRes] = await Promise.allSettled([
        secureFetch(`/reports/expenses?from=${from}&to=${to}`),
        secureFetch(`/reports/staff-payments?from=${from}&to=${to}`),
        secureFetch(`/reports/supplier-payments?from=${from}&to=${to}`),
      ]);

      if (cancelled) return;

      const nextState = {
        loading: false,
        error: null,
        expensesData:
          expensesRes.status === "fulfilled" && Array.isArray(expensesRes.value)
            ? expensesRes.value
            : [],
        staffPayments:
          staffRes.status === "fulfilled" && Array.isArray(staffRes.value)
            ? staffRes.value
            : [],
        supplierPayments:
          supplierRes.status === "fulfilled" && Array.isArray(supplierRes.value)
            ? supplierRes.value
            : [],
      };

      const anyRejected =
        expensesRes.status === "rejected" ||
        staffRes.status === "rejected" ||
        supplierRes.status === "rejected";
      if (anyRejected) {
        nextState.error = new Error("Failed to load expenses breakdown");
      }

      setState(nextState);
      writeCache(cacheKey, nextState);
    }

    load({ silent: canUseCache });

    return () => {
      cancelled = true;
    };
  }, [from, to, reloadToken]);

  const trackedExpensesTotal = useMemo(
    () =>
      Array.isArray(state.expensesData)
        ? state.expensesData.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
        : 0,
    [state.expensesData]
  );

  const staffPaymentsTotal = useMemo(
    () =>
      Array.isArray(state.staffPayments)
        ? state.staffPayments.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
        : 0,
    [state.staffPayments]
  );

  const supplierPaymentsTotal = useMemo(
    () =>
      Array.isArray(state.supplierPayments)
        ? state.supplierPayments.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
        : 0,
    [state.supplierPayments]
  );

  const expensesToday = trackedExpensesTotal + staffPaymentsTotal + supplierPaymentsTotal;

  return {
    ...state,
    trackedExpensesTotal,
    staffPaymentsTotal,
    supplierPaymentsTotal,
    expensesToday,
    refetch,
  };
}

