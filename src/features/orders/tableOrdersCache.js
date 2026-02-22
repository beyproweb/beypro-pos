const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getTableOrdersCacheKey = () => getRestaurantScopedCacheKey("tableOverview.orders.v1");
const getTableOrdersCacheTsKey = () => getRestaurantScopedCacheKey("tableOverview.orders.ts");

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const readInitialTableOrders = () => {
  const cachedOrders = safeParseJson(
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableOrdersCacheKey()) : null
  );
  if (!Array.isArray(cachedOrders) || cachedOrders.length === 0) return [];
  return cachedOrders.filter((o) => o && typeof o === "object" && o.table_number != null);
};

export const writeTableOrdersCache = (orders) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(orders)) return;
    window?.localStorage?.setItem(getTableOrdersCacheKey(), JSON.stringify(orders));
    window?.localStorage?.setItem(getTableOrdersCacheTsKey(), String(Date.now()));
  } catch {
    // ignore cache errors
  }
};
