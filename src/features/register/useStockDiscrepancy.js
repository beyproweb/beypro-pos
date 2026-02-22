import { useState, useCallback } from "react";
import {
  getStockDiscrepancyCache,
  setStockDiscrepancyCache,
} from "../../utils/registerDataCache";

export function useStockDiscrepancy({ secureFetch }) {
  const [stockDiscrepancy, setStockDiscrepancy] = useState(null);
  const [stockDiscrepancyLoading, setStockDiscrepancyLoading] = useState(false);

  const secureFetchWithTimeout = useCallback(
    async (url, options = {}, timeoutMs = 12000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await secureFetch(url, { ...options, signal: controller.signal });
      } catch (err) {
        if (err?.name === "AbortError") {
          throw new Error("Request timeout");
        }
        throw err;
      } finally {
        clearTimeout(id);
      }
    },
    [secureFetch]
  );

  const fetchStockDiscrepancy = useCallback(
    async (openTime) => {
      if (!openTime) return null;

      const cached = getStockDiscrepancyCache(openTime);
      if (cached) {
        setStockDiscrepancy(cached);
        setStockDiscrepancyLoading(false);
        return cached;
      }

      setStockDiscrepancyLoading(true);
      try {
        const data = await secureFetchWithTimeout(
          `/reports/stock-discrepancy?openTime=${encodeURIComponent(openTime)}`
        );
        setStockDiscrepancy(data);

        setStockDiscrepancyCache(openTime, data);

        return data;
      } catch (err) {
        console.error("❌ Failed to load stock discrepancy:", err);
        return null;
      } finally {
        setStockDiscrepancyLoading(false);
      }
    },
    [secureFetchWithTimeout]
  );

  const stockVarianceItems = stockDiscrepancy?.items || [];
  const stockVarianceSummary = stockDiscrepancy?.summary || {
    variance_value_total: 0,
    negative_variance_value_total: 0,
    positive_variance_value_total: 0,
  };

  const resetStockDiscrepancy = useCallback(() => {
    setStockDiscrepancy(null);
    setStockDiscrepancyLoading(false);
  }, []);

  return {
    fetchStockDiscrepancy,
    stockDiscrepancy,
    stockDiscrepancyLoading,
    stockVarianceItems,
    stockVarianceSummary,
    resetStockDiscrepancy,
  };
}
