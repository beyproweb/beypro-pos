import secureFetch from "./secureFetch";

const SUMMARY_TTL_MS = 30 * 1000; // 30 sec
const STATUS_CACHE_TTL_MS = 5 * 1000; // 5 sec - cache status aggressively

let cache = null;
let inFlight = null;
let statusCache = null;
let statusCacheTime = 0;

const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

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
    const today = toLocalYmd(new Date());
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

  // FAST: Check status cache first (5 sec TTL)
  if (statusCache && Date.now() - statusCacheTime < STATUS_CACHE_TTL_MS) {
    console.log("📦 Status loaded from cache (5s TTL)");
    const { status, opening_cash, yesterday_close, last_open_at } = statusCache;
    summary.registerState = (status || "closed").toLowerCase();
    summary.openingCash = opening_cash !== undefined && opening_cash !== null ? String(opening_cash) : "";
    summary.yesterdayCloseCash = yesterday_close !== undefined && yesterday_close !== null ? Number(yesterday_close) : null;
    summary.lastOpenAt = last_open_at || null;
    return summary;
  }

  // Fetch status
  console.log("⏳ Fetching register status...");
  const statusStartTime = performance.now();
  const statusData = await secureFetch("/reports/cash-register-status");
  console.log(`✅ Status fetched in ${(performance.now() - statusStartTime).toFixed(0)}ms`);
  
  if (!statusData) return summary;

  // Cache status
  statusCache = statusData;
  statusCacheTime = Date.now();

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

  // MOVED TO BACKGROUND: Don't fetch cash totals/expenses in critical path
  // These will be loaded in the background via loadExpectedCashInBackground
  
  return summary;
};

// NEW: Load cash calculations in background (non-blocking)
export async function loadExpectedCashInBackground(lastOpenAt) {
  if (!lastOpenAt) return { expectedCash: 0, dailyCashExpense: 0 };
  
  try {
    console.log("🔄 Loading cash calculations in background...");
    const startTime = performance.now();
    const [cashSales, dailyExpenses, extraExpenses] = await Promise.all([
      fetchDailyCashTotal(lastOpenAt),
      fetchDailyCashExpenses(lastOpenAt),
      fetchTodayExtraExpenses(),
    ]);
    console.log(`✅ Cash calculations loaded in ${(performance.now() - startTime).toFixed(0)}ms`);
    return {
      expectedCash: cashSales,
      dailyCashExpense: dailyExpenses + extraExpenses,
    };
  } catch (err) {
    console.warn("⚠️ Failed to load cash calculations:", err);
    return { expectedCash: 0, dailyCashExpense: 0 };
  }
}

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
  statusCache = null;  // Also clear status cache
  statusCacheTime = 0;
}
