import secureFetch from "./secureFetch";

const SUMMARY_TTL_MS = 30 * 1000; // 30 sec

let cache = null;
let inFlight = null;

const safeNumber = (value) => {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const fetchDailyCashTotal = async (openTime) => {
  if (!openTime) return 0;
  const res = await secureFetch(
    `/reports/daily-cash-total?openTime=${encodeURIComponent(openTime)}`
  );
  return safeNumber(res?.cash_total);
};

const fetchDailyCashExpenses = async (openTime) => {
  if (!openTime) return 0;
  const res = await secureFetch(
    `/reports/daily-cash-expenses?openTime=${encodeURIComponent(openTime)}`
  ).catch(() => []);
  return safeNumber(res?.[0]?.total_expense);
};

const fetchTodayExtraExpenses = async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await secureFetch(`/expenses?from=${today}&to=${today}`);
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, expense) => sum + safeNumber(expense?.amount), 0);
  } catch {
    return 0;
  }
};

const buildSummary = async () => {
  const summary = {
    registerState: "closed",
    openingCash: "",
    expectedCash: 0,
    dailyCashExpense: 0,
    yesterdayCloseCash: null,
    lastOpenAt: null,
  };

  const statusData = await secureFetch("/reports/cash-register-status");
  if (!statusData) return summary;

  const {
    status,
    opening_cash,
    yesterday_close,
    last_open_at,
  } = statusData || {};
  summary.registerState = (status || "closed").toLowerCase();
  summary.openingCash =
    opening_cash !== undefined && opening_cash !== null ? String(opening_cash) : "";
  summary.yesterdayCloseCash =
    yesterday_close !== undefined && yesterday_close !== null ? Number(yesterday_close) : null;
  summary.lastOpenAt = last_open_at || null;

  if (summary.registerState === "open" && summary.lastOpenAt) {
    const [cashSales, dailyExpenses, extraExpenses] = await Promise.all([
      fetchDailyCashTotal(summary.lastOpenAt),
      fetchDailyCashExpenses(summary.lastOpenAt),
      fetchTodayExtraExpenses(),
    ]);
    summary.expectedCash = cashSales;
    summary.dailyCashExpense = safeNumber(dailyExpenses + extraExpenses);
  }

  return summary;
};

export async function loadRegisterSummary() {
  if (cache && Date.now() - cache.timestamp < SUMMARY_TTL_MS) {
    return cache.data;
  }
  if (!inFlight) {
    inFlight = buildSummary().then((data) => {
      cache = { data, timestamp: Date.now() };
      inFlight = null;
      return data;
    });
  }
  return inFlight;
}

export function readRegisterSummaryCache() {
  if (!cache) return null;
  if (Date.now() - cache.timestamp > SUMMARY_TTL_MS) {
    cache = null;
    return null;
  }
  return cache.data;
}

export function clearRegisterSummaryCache() {
  cache = null;
  inFlight = null;
}
