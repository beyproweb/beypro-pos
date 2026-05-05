import { useState, useCallback, useEffect, useRef } from "react";

export function useRegisterModalBoot({
  showRegisterModal,
  initializeRegisterSummary,
  fetchLastCloseReceipt,
  fetchRegisterLogsForToday,
  fetchRegisterPaymentsForToday,
  fetchRegisterEntriesForToday,
  loadExpectedCashInBackground,
  formatLocalYmd,
  setStateHandlersForReset,
}) {
  const [cashDataLoaded, setCashDataLoaded] = useState(false);
  const resetHandlersRef = useRef(setStateHandlersForReset);

  useEffect(() => {
    resetHandlersRef.current = setStateHandlersForReset;
  }, [setStateHandlersForReset]);

  const loadRegisterData = useCallback(async () => {
    const today = formatLocalYmd(new Date());
    const modalStartTime = performance.now();

    setCashDataLoaded(false);
    const resetHandlers = resetHandlersRef.current;
    if (typeof resetHandlers?.setDailyCashExpense === "function") {
      resetHandlers.setDailyCashExpense(0);
    }
    if (typeof resetHandlers?.setActualCash === "function") {
      resetHandlers.setActualCash("");
    }
    if (typeof resetHandlers?.resetTerminalZReport === "function") {
      resetHandlers.resetTerminalZReport();
    }
    if (typeof resetHandlers?.resetStockDiscrepancy === "function") {
      resetHandlers.resetStockDiscrepancy();
    }

    const criticalResults = await Promise.allSettled([
      typeof fetchLastCloseReceipt === "function" ? fetchLastCloseReceipt() : Promise.resolve(),
      typeof initializeRegisterSummary === "function"
        ? initializeRegisterSummary({
            setDailyCashExpense: resetHandlers?.setDailyCashExpense,
            setActualCash: resetHandlers?.setActualCash,
          })
        : Promise.resolve(null),
    ]);

    let summaryData = null;
    if (criticalResults[1].status === "fulfilled") {
      summaryData = criticalResults[1].value;
    }

    setCashDataLoaded(true);

    Promise.allSettled([
      typeof fetchRegisterLogsForToday === "function"
        ? fetchRegisterLogsForToday(today)
        : Promise.resolve(),
      typeof fetchRegisterPaymentsForToday === "function"
        ? fetchRegisterPaymentsForToday(today)
        : Promise.resolve(),
      typeof fetchRegisterEntriesForToday === "function"
        ? fetchRegisterEntriesForToday(today)
        : Promise.resolve(),
      (async () => {
        const openTime = summaryData?.lastOpenAt;
        if (openTime && typeof loadExpectedCashInBackground === "function") {
          const result = await loadExpectedCashInBackground(
            openTime,
            summaryData?.openingCash ?? 0
          );
          if (typeof resetHandlers?.setExpectedCash === "function") {
            resetHandlers.setExpectedCash(Number(result?.expectedCash || 0));
          }
          if (typeof resetHandlers?.setDailyCashExpense === "function") {
            resetHandlers.setDailyCashExpense(result.dailyCashExpense);
          }
        }
      })(),
    ])
      .then(() => {})
      .catch((err) => console.warn("⚠️ Background register data fetch failed:", err));
  }, [
    fetchLastCloseReceipt,
    fetchRegisterEntriesForToday,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    formatLocalYmd,
    initializeRegisterSummary,
    loadExpectedCashInBackground,
  ]);

  useEffect(() => {
    if (!showRegisterModal) return;
    loadRegisterData();
  }, [showRegisterModal, loadRegisterData]);

  useEffect(() => {
    const handleRefresh = () => {
      if (!showRegisterModal) return;
      loadRegisterData();
    };

    window.addEventListener("register:refresh", handleRefresh);
    window.addEventListener("reports:refresh", handleRefresh);
    return () => {
      window.removeEventListener("register:refresh", handleRefresh);
      window.removeEventListener("reports:refresh", handleRefresh);
    };
  }, [showRegisterModal, loadRegisterData]);

  return {
    cashDataLoaded,
    loadRegisterData,
  };
}
