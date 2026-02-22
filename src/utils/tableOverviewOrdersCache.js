const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getTableOrdersCacheKey = () =>
  getRestaurantScopedCacheKey("tableOverview.orders.v1");
const getTableOrdersCacheTsKey = () =>
  getRestaurantScopedCacheKey("tableOverview.orders.ts");

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const readTableOverviewOrdersCache = () => {
  try {
    if (typeof window === "undefined") return [];
    const raw = window?.localStorage?.getItem(getTableOrdersCacheKey());
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o) => o && typeof o === "object" && o.table_number != null);
  } catch {
    return [];
  }
};

export const writeTableOverviewOrdersCache = (orders) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(orders)) return;
    window?.localStorage?.setItem(getTableOrdersCacheKey(), JSON.stringify(orders));
    window?.localStorage?.setItem(getTableOrdersCacheTsKey(), String(Date.now()));
  } catch {
    // ignore cache errors
  }
};

export const upsertTableOverviewOrderInCache = ({
  tableNumber,
  orderId,
  patch,
}) => {
  const normalizedTable = Number(tableNumber);
  if (!Number.isFinite(normalizedTable)) return;

  const nextPatch = patch && typeof patch === "object" ? patch : {};
  const normalizedOrderId =
    orderId === null || orderId === undefined ? null : Number(orderId);

  const prev = readTableOverviewOrdersCache();
  let found = false;

  const next = (Array.isArray(prev) ? prev : [])
    .map((row) => {
      if (!row || typeof row !== "object") return row;
      if (Number(row.table_number) !== normalizedTable) return row;
      found = true;
      return {
        ...row,
        ...(normalizedOrderId != null ? { id: normalizedOrderId } : null),
        ...nextPatch,
        table_number: normalizedTable,
      };
    })
    .filter(Boolean);

  if (!found) {
    next.push({
      ...(normalizedOrderId != null ? { id: normalizedOrderId } : null),
      table_number: normalizedTable,
      ...nextPatch,
    });
  }

  next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
  writeTableOverviewOrdersCache(next);
};

export const removeTableOverviewOrderFromCache = (tableNumber) => {
  const normalizedTable = Number(tableNumber);
  if (!Number.isFinite(normalizedTable)) return;
  const prev = readTableOverviewOrdersCache();
  const next = (Array.isArray(prev) ? prev : []).filter(
    (row) => Number(row?.table_number) !== normalizedTable
  );
  writeTableOverviewOrdersCache(next);
};

