/**
 * Register Modal Data Cache
 * Caches expensive API calls to avoid redundant requests when modal is reopened
 */

const CACHE_TTL = {
  REGISTER_LOGS: 30 * 1000,        // 30 sec (reduced for faster updates)
  REGISTER_PAYMENTS: 30 * 1000,    // 30 sec (reduced for faster updates)
  REGISTER_ENTRIES: 30 * 1000,     // 30 sec (reduced for faster updates)
  STOCK_DISCREPANCY: 60 * 1000,    // 1 min (reduced for faster updates)
  RECONCILIATION: 5 * 1000,        // 5 sec for near-real-time expected cash/card updates
};

let cache = {
  registerLogs: null,
  registerPayments: null,
  registerEntries: null,
  stockDiscrepancy: null,
  reconciliation: null,
};

const isCacheValid = (data, ttl) => {
  if (!data || !data.timestamp) return false;
  return Date.now() - data.timestamp < ttl;
};

export const getRegisterLogsCache = (today) => {
  const key = `registerLogs_${today}`;
  if (cache[key] && isCacheValid(cache[key], CACHE_TTL.REGISTER_LOGS)) {
    return cache[key].value;
  }
  return null;
};

export const setRegisterLogsCache = (today, value) => {
  const key = `registerLogs_${today}`;
  cache[key] = { value, timestamp: Date.now() };
};

export const getRegisterPaymentsCache = (today) => {
  const key = `registerPayments_${today}`;
  if (cache[key] && isCacheValid(cache[key], CACHE_TTL.REGISTER_PAYMENTS)) {
    return cache[key].value;
  }
  return null;
};

export const setRegisterPaymentsCache = (today, value) => {
  const key = `registerPayments_${today}`;
  cache[key] = { value, timestamp: Date.now() };
};

export const getRegisterEntriesCache = (today) => {
  const key = `registerEntries_${today}`;
  if (cache[key] && isCacheValid(cache[key], CACHE_TTL.REGISTER_ENTRIES)) {
    return cache[key].value;
  }
  return null;
};

export const setRegisterEntriesCache = (today, value) => {
  const key = `registerEntries_${today}`;
  cache[key] = { value, timestamp: Date.now() };
};

export const getStockDiscrepancyCache = (openTime) => {
  const key = `stockDiscrepancy_${openTime}`;
  if (cache[key] && isCacheValid(cache[key], CACHE_TTL.STOCK_DISCREPANCY)) {
    return cache[key].value;
  }
  return null;
};

export const setStockDiscrepancyCache = (openTime, value) => {
  const key = `stockDiscrepancy_${openTime}`;
  cache[key] = { value, timestamp: Date.now() };
};

export const getReconciliationCache = (openTime) => {
  const key = `reconciliation_${openTime}`;
  if (cache[key] && isCacheValid(cache[key], CACHE_TTL.RECONCILIATION)) {
    return cache[key].value;
  }
  return null;
};

export const setReconciliationCache = (openTime, value) => {
  const key = `reconciliation_${openTime}`;
  cache[key] = { value, timestamp: Date.now() };
};

export const clearRegisterDataCache = () => {
  cache = {
    registerLogs: null,
    registerPayments: null,
    registerEntries: null,
    stockDiscrepancy: null,
    reconciliation: null,
  };
};

export const clearRegisterDataCacheForDate = (today) => {
  delete cache[`registerLogs_${today}`];
  delete cache[`registerPayments_${today}`];
  delete cache[`registerEntries_${today}`];
};
