export const ACTIVE_TABLE_ORDER_STATUSES = Object.freeze([
  "open",
  "confirmed",
  "preparing",
]);

const ACTIVE_TABLE_ORDER_STATUS_SET = new Set(ACTIVE_TABLE_ORDER_STATUSES);

export const normalizeActiveTableStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const isActiveTableOrderStatus = (value) =>
  ACTIVE_TABLE_ORDER_STATUS_SET.has(normalizeActiveTableStatus(value));

export const normalizeTableNumberKey = (value) => String(value ?? "").trim();

export const isSameTableNumberKey = (left, right) => {
  const normalizedLeft = normalizeTableNumberKey(left);
  const normalizedRight = normalizeTableNumberKey(right);
  return normalizedLeft !== "" && normalizedRight !== "" && normalizedLeft === normalizedRight;
};

export const getOrderTableNumberKey = (order) =>
  normalizeTableNumberKey(
    order?.table_number ??
      order?.tableNumber ??
      order?.table_id ??
      order?.tableId ??
      order?.table
  );
