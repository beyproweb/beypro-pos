import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = { loading: false, error: null, data: [] };

export default function useSalesTrendsData(viewType) {
  const [state, setState] = useState(initialState);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await secureFetch(`/reports/sales-trends?type=${viewType}`);
        if (cancelled) return;
        setState({ loading: false, error: null, data: Array.isArray(data) ? data : [] });
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
