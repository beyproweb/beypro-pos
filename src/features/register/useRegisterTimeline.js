import { useState, useCallback, useMemo } from "react";
import {
  getRegisterLogsCache,
  setRegisterLogsCache,
  getRegisterPaymentsCache,
  setRegisterPaymentsCache,
  getRegisterEntriesCache,
  setRegisterEntriesCache,
} from "../../utils/registerDataCache";

export function useRegisterTimeline({ secureFetch }) {
  const [todayRegisterEvents, setTodayRegisterEvents] = useState([]);
  const [todayExpenses, setTodayExpenses] = useState([]);
  const [supplierCashPayments, setSupplierCashPayments] = useState([]);
  const [staffCashPayments, setStaffCashPayments] = useState([]);
  const [registerEntries, setRegisterEntries] = useState(0);

  const fetchRegisterEntriesForToday = useCallback(
    async (today) => {
      const cached = getRegisterEntriesCache(today);
      if (cached != null) {
        setRegisterEntries(Number(cached) || 0);
        return;
      }

      try {
        const data = await secureFetch(`/reports/cash-register-history?from=${today}&to=${today}`);
        const todayRow = Array.isArray(data) ? data.find((row) => row.date === today) : null;
        const entries = todayRow?.register_entries ? Number(todayRow.register_entries) : 0;
        setRegisterEntries(entries);
        setRegisterEntriesCache(today, entries);
      } catch (err) {
        console.error("❌ Failed to fetch register entries:", err);
        setRegisterEntries(0);
      }
    },
    [secureFetch]
  );

  const fetchRegisterLogsForToday = useCallback(
    async (today) => {
      const cached = getRegisterLogsCache(today);
      if (cached) {
        console.log("📦 Loaded register logs from cache");
        setTodayRegisterEvents(cached.events || []);
        setTodayExpenses(cached.expenses || []);
        return;
      }

      console.log("🔄 Fetching register logs...");
      const startTime = performance.now();
      const [eventsRes, expensesRes] = await Promise.allSettled([
        secureFetch(`/reports/cash-register-events?from=${today}&to=${today}`),
        secureFetch(`/reports/expenses?from=${today}&to=${today}`),
      ]);
      console.log(`✅ Register logs fetched in ${(performance.now() - startTime).toFixed(0)}ms`);

      const events = eventsRes.status === "fulfilled" ? eventsRes.value : [];
      const expenses = expensesRes.status === "fulfilled" ? expensesRes.value : [];

      setTodayRegisterEvents(events);
      setTodayExpenses(expenses);
      setRegisterLogsCache(today, { events, expenses });
    },
    [secureFetch]
  );

  const fetchRegisterPaymentsForToday = useCallback(
    async (today) => {
      const cached = getRegisterPaymentsCache(today);
      if (cached) {
        setSupplierCashPayments(Array.isArray(cached.supplier) ? cached.supplier : []);
        setStaffCashPayments(Array.isArray(cached.staff) ? cached.staff : []);
        return;
      }

      const [supplierRes, staffRes] = await Promise.allSettled([
        secureFetch(`/reports/supplier-cash-payments?from=${today}&to=${today}`),
        secureFetch(`/reports/staff-cash-payments?from=${today}&to=${today}`),
      ]);

      const supplier = supplierRes.status === "fulfilled" ? supplierRes.value : [];
      const staff = staffRes.status === "fulfilled" ? staffRes.value : [];

      setSupplierCashPayments(Array.isArray(supplier) ? supplier : []);
      setStaffCashPayments(Array.isArray(staff) ? staff : []);
      setRegisterPaymentsCache(today, { supplier, staff });
    },
    [secureFetch]
  );

  const combinedEvents = useMemo(
    () =>
      [
        ...(todayRegisterEvents || []),
        ...((todayExpenses || [])
          .filter((e) => String(e.payment_method || "").toLowerCase() !== "cash")
          .map((e) => ({
            type: "expense",
            amount: e.amount,
            note: e.note || e.type || null,
            created_at: e.created_at,
          }))),
        ...(supplierCashPayments || []),
        ...(staffCashPayments || []),
      ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [todayRegisterEvents, todayExpenses, supplierCashPayments, staffCashPayments]
  );

  const isRegisterRefundEvent = useCallback((event) => {
    if (!event || typeof event !== "object") return false;
    const type = String(event.type || "").trim().toLowerCase();
    if (type !== "expense") return false;
    const note = String(event.note || "").trim().toLowerCase();
    return note.includes("refund") || note.includes("iade");
  }, []);

  const cashRefundTotal = useMemo(
    () =>
      (Array.isArray(todayRegisterEvents) ? todayRegisterEvents : [])
        .filter(isRegisterRefundEvent)
        .reduce((sum, ev) => sum + (Number.isFinite(Number(ev?.amount)) ? Number(ev.amount) : 0), 0),
    [todayRegisterEvents, isRegisterRefundEvent]
  );

  return {
    todayRegisterEvents,
    todayExpenses,
    supplierCashPayments,
    staffCashPayments,
    registerEntries,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    fetchRegisterEntriesForToday,
    combinedEvents,
    isRegisterRefundEvent,
    cashRefundTotal,
  };
}
