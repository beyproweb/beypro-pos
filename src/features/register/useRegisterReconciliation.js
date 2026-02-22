import { useState, useCallback, useEffect, useRef } from "react";
import {
  getReconciliationCache,
  setReconciliationCache,
} from "../../utils/registerDataCache";

export function useRegisterReconciliation({
  secureFetch,
  expectedCash,
  setExpectedCash,
  openingCash,
  actualCash,
  terminalCardTotal,
  cashRefundTotal,
  showRegisterModal,
  registerState,
  lastOpenAt,
}) {
  const [reconciliation, setReconciliation] = useState(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconError, setReconError] = useState(null);
  const lastReconciliationOpenRef = useRef(null);
  const delayedRefreshTimeoutsRef = useRef(new Set());

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

  const fetchRegisterReconciliation = useCallback(
    async (openTime, options = {}) => {
      if (!openTime) return null;
      const forceFresh = options?.forceFresh === true;
      console.log("💵 [ui] fetchRegisterReconciliation:start", {
        openTime,
        forceFresh,
        at: new Date().toISOString(),
      });

      const cached = forceFresh ? null : getReconciliationCache(openTime);
      if (cached) {
        setReconciliation(cached);
        if (cached?.cashReconciliation?.expected_cash_total != null) {
          setExpectedCash(Number(cached.cashReconciliation.expected_cash_total || 0));
        }
        console.log("💵 [ui] fetchRegisterReconciliation:cache-hit", {
          openTime,
          snapshotMode: cached?.snapshot_mode,
          expected: cached?.cashReconciliation?.expected_cash_total,
          posCash: cached?.posTotals?.cash_total,
          cardGrand: cached?.cardByOrderType?.grand_total,
          at: new Date().toISOString(),
        });
        setReconLoading(false);
        return cached;
      }

      setReconLoading(true);
      setReconError(null);
      try {
        const query = forceFresh ? `&_t=${Date.now()}` : "";
        const data = await secureFetchWithTimeout(
          `/reports/register-reconciliation?openTime=${encodeURIComponent(openTime)}${query}`,
          {},
          25000
        );
        setReconciliation(data);
        if (data?.cashReconciliation?.expected_cash_total != null) {
          setExpectedCash(Number(data.cashReconciliation.expected_cash_total || 0));
        }
        console.log("💵 [ui] fetchRegisterReconciliation:fresh", {
          openTime,
          forceFresh,
          snapshotMode: data?.snapshot_mode,
          expected: data?.cashReconciliation?.expected_cash_total,
          posCash: data?.posTotals?.cash_total,
          cardGrand: data?.cardByOrderType?.grand_total,
          errors: data?.errors,
          at: new Date().toISOString(),
        });

        setReconciliationCache(openTime, data);

        if (data?.snapshot_mode === "essential") {
          const openTimeKey = openTime;
          const refresh = async () => {
            try {
              const fresh = await secureFetchWithTimeout(
                `/reports/register-reconciliation?openTime=${encodeURIComponent(openTimeKey)}&mode=full&_t=${Date.now()}`,
                {},
                25000
              );
              if (!fresh) return;
              setReconciliation(fresh);
              setReconciliationCache(openTimeKey, fresh);
              if (fresh?.cashReconciliation?.expected_cash_total != null) {
                setExpectedCash(Number(fresh.cashReconciliation.expected_cash_total || 0));
              }
              console.log("💵 [ui] fetchRegisterReconciliation:delayed-refresh", {
                openTime: openTimeKey,
                snapshotMode: fresh?.snapshot_mode,
                expected: fresh?.cashReconciliation?.expected_cash_total,
                posCash: fresh?.posTotals?.cash_total,
                cardGrand: fresh?.cardByOrderType?.grand_total,
                errors: fresh?.errors,
                at: new Date().toISOString(),
              });
            } catch {
              // ignore background refresh failures
            }
          };
          const timeoutId = setTimeout(() => {
            delayedRefreshTimeoutsRef.current.delete(timeoutId);
            refresh();
          }, 800);
          delayedRefreshTimeoutsRef.current.add(timeoutId);
        }
        return data;
      } catch (err) {
        console.error("❌ Failed to load register reconciliation:", err);
        console.error("💵 [ui] fetchRegisterReconciliation:error", {
          openTime,
          forceFresh,
          message: err?.message,
          at: new Date().toISOString(),
        });
        setReconError(err?.message || "Failed to load reconciliation");
        return null;
      } finally {
        setReconLoading(false);
      }
    },
    [secureFetchWithTimeout, setExpectedCash]
  );

  useEffect(() => {
    if (!showRegisterModal) return;
    if (registerState !== "open") return;
    if (!lastOpenAt) return;
    if (lastReconciliationOpenRef.current === lastOpenAt && reconciliation) return;
    lastReconciliationOpenRef.current = lastOpenAt;
    fetchRegisterReconciliation(lastOpenAt);
  }, [showRegisterModal, registerState, lastOpenAt, reconciliation, fetchRegisterReconciliation]);

  useEffect(() => {
    if (!showRegisterModal) return;
    if (registerState !== "open") return;
    if (!lastOpenAt) return;

    const interval = setInterval(() => {
      fetchRegisterReconciliation(lastOpenAt, { forceFresh: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [showRegisterModal, registerState, lastOpenAt, fetchRegisterReconciliation]);

  useEffect(() => {
    return () => {
      delayedRefreshTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      delayedRefreshTimeoutsRef.current.clear();
    };
  }, []);

  const expectedCashComputedBase = Number(
    reconciliation?.cashReconciliation?.expected_cash_total ?? expectedCash ?? 0
  );
  const expectedCashComputed = expectedCashComputedBase - cashRefundTotal;
  const expectedCashSource =
    reconciliation?.cashReconciliation?.expected_cash_total != null
      ? "reconciliation"
      : "fallback_state";
  const openingFloat = Number(openingCash || reconciliation?.cashReconciliation?.opening_float || 0);
  const countedCashNumber = Number(actualCash || 0);
  const cashDifference = countedCashNumber - expectedCashComputed;
  const posCardTotal = reconciliation?.posTotals?.card_total ?? 0;
  const posCashTotal = reconciliation?.posTotals?.cash_total ?? 0;
  const posOtherTotal = reconciliation?.posTotals?.other_total ?? 0;
  const terminalCardNumber =
    terminalCardTotal === "" || terminalCardTotal === null ? 0 : Number(terminalCardTotal);
  const cardDifference = terminalCardNumber - posCardTotal;
  const riskScore = reconciliation?.risk?.risk_score ?? 0;
  const riskFlags = Array.isArray(reconciliation?.risk?.flags) ? reconciliation.risk.flags : [];
  const cardBreakdown = reconciliation?.cardByOrderType || {};

  useEffect(() => {
    if (!showRegisterModal) return;
    if (registerState !== "open") return;
    console.log("💵 [ui] expected-cash state", {
      openTime: lastOpenAt,
      source: expectedCashSource,
      expectedCashState: Number(expectedCash || 0),
      expectedFromReconciliation: reconciliation?.cashReconciliation?.expected_cash_total,
      cashRefundTotal,
      expectedComputedBase: expectedCashComputedBase,
      expectedComputed: expectedCashComputed,
      posCash: reconciliation?.posTotals?.cash_total,
      cardGrand: reconciliation?.cardByOrderType?.grand_total,
      snapshotMode: reconciliation?.snapshot_mode,
      errors: reconciliation?.errors,
      at: new Date().toISOString(),
    });
  }, [
    showRegisterModal,
    registerState,
    lastOpenAt,
    expectedCash,
    expectedCashSource,
    cashRefundTotal,
    expectedCashComputedBase,
    expectedCashComputed,
    reconciliation,
  ]);

  const resetReconciliation = useCallback(() => {
    setReconciliation(null);
    setReconError(null);
    setReconLoading(false);
  }, []);

  return {
    reconciliation,
    reconLoading,
    reconError,
    setReconciliation,
    fetchRegisterReconciliation,
    resetReconciliation,
    cashDifference,
    cardDifference,
    riskScore,
    expectedCashComputed,
    expectedCashComputedBase,
    expectedCashSource,
    openingFloat,
    posCardTotal,
    posCashTotal,
    posOtherTotal,
    riskFlags,
    cardBreakdown,
    cashRefundTotal,
  };
}
