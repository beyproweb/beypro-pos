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
    console.log("📘 Starting Register Modal Data Load...");
    const modalStartTime = performance.now();

    setCashDataLoaded(false);
    const resetHandlers = resetHandlersRef.current;
    if (typeof resetHandlers?.setExpectedCash === "function") {
      resetHandlers.setExpectedCash(0);
    }
    if (typeof resetHandlers?.setDailyCashExpense === "function") {
      resetHandlers.setDailyCashExpense(0);
    }
    if (typeof resetHandlers?.setActualCash === "function") {
      resetHandlers.setActualCash("");
    }
    if (typeof resetHandlers?.setRegisterState === "function") {
      resetHandlers.setRegisterState("loading");
    }
    if (typeof resetHandlers?.resetReconciliation === "function") {
      resetHandlers.resetReconciliation();
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

    const criticalLoadTime = performance.now() - modalStartTime;
    console.log(`⚡ Critical data loaded in ${criticalLoadTime.toFixed(0)}ms - Modal should display now`);
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
          const result = await loadExpectedCashInBackground(openTime);
          if (typeof resetHandlers?.setDailyCashExpense === "function") {
            resetHandlers.setDailyCashExpense(result.dailyCashExpense);
          }
          console.log("💵 [ui] background cash calc", {
            openTime,
            expectedCashCandidate: Number(result?.expectedCash || 0),
            dailyCashExpense: Number(result?.dailyCashExpense || 0),
            appliedToExpectedCash: false,
            at: new Date().toISOString(),
          });
        }
      })(),
    ])
      .then(() => {
        const totalTime = performance.now() - modalStartTime;
        console.log(`✅ All background data loaded in ${totalTime.toFixed(0)}ms total`);
      })
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
