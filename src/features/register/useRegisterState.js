import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { loadRegisterSummary } from "../../utils/registerSummaryCache";

export function useRegisterState({ fetchRegisterStatus }) {
  const [registerState, setRegisterState] = useState("loading");
  const [openingCash, setOpeningCash] = useState("");
  const [expectedCash, setExpectedCash] = useState(0);
  const [yesterdayCloseCash, setYesterdayCloseCash] = useState(null);
  const [lastOpenAt, setLastOpenAt] = useState(null);

  const initializeRegisterSummary = useCallback(async (options = {}) => {
    const { setDailyCashExpense, setActualCash } = options;
    try {
      const summary = await loadRegisterSummary();
      setRegisterState(summary.registerState);
      setOpeningCash(summary.openingCash);
      setExpectedCash(summary.expectedCash);
      if (typeof setDailyCashExpense === "function") {
        setDailyCashExpense(summary.dailyCashExpense);
      }
      setYesterdayCloseCash(summary.yesterdayCloseCash);
      setLastOpenAt(summary.lastOpenAt);
      if (typeof setActualCash === "function") {
        setActualCash("");
      }
      return summary;
    } catch (err) {
      console.error("❌ Error in modal init:", err);
      toast.error("Failed to load register data");
      return null;
    }
  }, []);

  const refreshRegisterState = useCallback(
    async (forceFresh = false, options = {}) => {
      const { setActualCash } = options;
      try {
        const data = await fetchRegisterStatus(forceFresh);
        console.log("📥 /cash-register-status response:", data);

        setRegisterState(data.status);
        setYesterdayCloseCash(data.yesterday_close ?? null);
        setLastOpenAt(data.last_open_at || null);
        setOpeningCash("");
        if (data.status === "open") {
          const opening = data.opening_cash?.toString() ?? "";
          setOpeningCash(opening);
          console.log("🔓 Register is OPEN, Opening Cash:", opening);
        } else {
          setOpeningCash("");
          console.log("🔐 Register is NOT open");
        }

        if (typeof setActualCash === "function") {
          setActualCash("");
        }
        return data;
      } catch (err) {
        console.error("❌ Failed to refresh register state:", err);
        toast.error("Could not load register status");
        return null;
      }
    },
    [fetchRegisterStatus]
  );

  return {
    registerState,
    setRegisterState,
    openingCash,
    setOpeningCash,
    expectedCash,
    setExpectedCash,
    yesterdayCloseCash,
    setYesterdayCloseCash,
    lastOpenAt,
    setLastOpenAt,
    refreshRegisterState,
    initializeRegisterSummary,
  };
}
