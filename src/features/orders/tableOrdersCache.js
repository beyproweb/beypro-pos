const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getTableOrdersCacheKey = () => getRestaurantScopedCacheKey("tableOverview.orders.v1");
const getTableOrdersCacheTsKey = () => getRestaurantScopedCacheKey("tableOverview.orders.ts");
const getReservationShadowsCacheKey = () =>
  getRestaurantScopedCacheKey("tableOverview.reservationShadows.v1");

const TERMINAL_RESERVATION_STATUSES = new Set([
  "checked_out",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
]);

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

const getKitchenItemIdentitySet = (itemIds) =>
  new Set(
    (Array.isArray(itemIds) ? itemIds : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  );

const patchKitchenItemCollection = (items, itemIdSet, status, timestamp) => {
  if (!Array.isArray(items) || itemIdSet.size === 0) {
    return { items: Array.isArray(items) ? items : [], changed: false };
  }

  let changed = false;
  const nextItems = items.map((item) => {
    const itemId = Number(item?.item_id ?? item?.id ?? item?.order_item_id);
    if (!Number.isFinite(itemId) || !itemIdSet.has(itemId)) return item;
    changed = true;
    return {
      ...item,
      kitchen_status: status,
      kitchen_status_updated_at: timestamp,
      ...(status === "preparing"
        ? {
            prep_started_at: item?.prep_started_at ?? item?.prepStartedAt ?? timestamp,
            prepStartedAt: item?.prepStartedAt ?? item?.prep_started_at ?? timestamp,
          }
        : null),
    };
  });

  return { items: nextItems, changed };
};

export const patchTableOrdersKitchenStatusInCache = ({ itemIds, status, timestamp } = {}) => {
  const itemIdSet = getKitchenItemIdentitySet(itemIds);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const patchTimestamp = timestamp || new Date().toISOString();

  if (itemIdSet.size === 0 || !normalizedStatus) {
    return { orders: [], tables: [] };
  }

  const cachedOrders = readInitialTableOrders();
  if (!Array.isArray(cachedOrders) || cachedOrders.length === 0) {
    return { orders: [], tables: [] };
  }

  const touchedOrderIds = new Set();
  const touchedTables = new Set();

  const nextOrders = cachedOrders.map((order) => {
    const mainItemsResult = patchKitchenItemCollection(
      Array.isArray(order?.items) ? order.items : [],
      itemIdSet,
      normalizedStatus,
      patchTimestamp
    );

    let subordersChanged = false;
    const nextSuborders = Array.isArray(order?.suborders)
      ? order.suborders.map((suborder) => {
          const subResult = patchKitchenItemCollection(
            Array.isArray(suborder?.items) ? suborder.items : [],
            itemIdSet,
            normalizedStatus,
            patchTimestamp
          );
          if (!subResult.changed) return suborder;
          subordersChanged = true;
          return {
            ...suborder,
            items: subResult.items,
          };
        })
      : order?.suborders;

    if (!mainItemsResult.changed && !subordersChanged) return order;

    const allItems = [
      ...mainItemsResult.items,
      ...(Array.isArray(nextSuborders)
        ? nextSuborders.flatMap((suborder) => (Array.isArray(suborder?.items) ? suborder.items : []))
        : []),
    ];
    const allDelivered = allItems.length > 0 && allItems.every((item) => item?.kitchen_status === "delivered");

    const orderId = Number(order?.id);
    const tableNumber = Number(order?.table_number ?? order?.tableNumber ?? order?.table);
    if (Number.isFinite(orderId)) touchedOrderIds.add(orderId);
    if (Number.isFinite(tableNumber)) touchedTables.add(tableNumber);

    return {
      ...order,
      items: mainItemsResult.items,
      ...(Array.isArray(nextSuborders) ? { suborders: nextSuborders } : null),
      kitchen_status_updated_at: patchTimestamp,
      ...(normalizedStatus === "preparing"
        ? {
            prep_started_at: order?.prep_started_at ?? order?.prepStartedAt ?? patchTimestamp,
            prepStartedAt: order?.prepStartedAt ?? order?.prep_started_at ?? patchTimestamp,
            kitchen_delivered_at: null,
          }
        : null),
      ...(normalizedStatus === "delivered"
        ? {
            kitchen_delivered_at: allDelivered ? patchTimestamp : order?.kitchen_delivered_at ?? null,
          }
        : null),
    };
  });

  writeTableOrdersCache(nextOrders);

  return {
    orders: Array.from(touchedOrderIds),
    tables: Array.from(touchedTables),
  };
};

export const readReservationShadows = () => {
  const cached = safeParseJson(
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getReservationShadowsCacheKey())
      : null
  );
  if (!Array.isArray(cached) || cached.length === 0) return [];
  return cached.filter((row) => {
    if (!row || typeof row !== "object" || row.table_number == null) return false;
    const status = String(row?.status || "").trim().toLowerCase();
    return !TERMINAL_RESERVATION_STATUSES.has(status);
  });
};

export const writeReservationShadows = (reservations) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(reservations)) return;
    window?.localStorage?.setItem(getReservationShadowsCacheKey(), JSON.stringify(reservations));
  } catch {
    // ignore cache errors
  }
};

export const buildReservationShadowRecord = ({ reservation, order, tableNumber, orderId } = {}) => {
  const orderSource = order && typeof order === "object" ? order : null;
  const reservationSource = reservation && typeof reservation === "object" ? reservation : null;
  const nestedReservation =
    orderSource?.reservation && typeof orderSource.reservation === "object"
      ? orderSource.reservation
      : null;

  const resolvedTableNumber = Number(
    tableNumber ??
      orderSource?.table_number ??
      orderSource?.tableNumber ??
      reservationSource?.table_number ??
      reservationSource?.tableNumber ??
      reservationSource?.table
  );
  if (!Number.isFinite(resolvedTableNumber)) return null;

  const resolvedReservationId =
    reservationSource?.id ??
    reservationSource?.reservation_id ??
    reservationSource?.reservationId ??
    orderSource?.reservation_id ??
    orderSource?.reservationId ??
    nestedReservation?.id ??
    nestedReservation?.reservation_id ??
    nestedReservation?.reservationId ??
    null;
  const resolvedOrderId =
    orderId ??
    orderSource?.id ??
    reservationSource?.order_id ??
    reservationSource?.orderId ??
    null;
  const reservationDate =
    reservationSource?.reservation_date ??
    reservationSource?.reservationDate ??
    orderSource?.reservation_date ??
    orderSource?.reservationDate ??
    nestedReservation?.reservation_date ??
    nestedReservation?.reservationDate ??
    null;
  const reservationTime =
    reservationSource?.reservation_time ??
    reservationSource?.reservationTime ??
    orderSource?.reservation_time ??
    orderSource?.reservationTime ??
    nestedReservation?.reservation_time ??
    nestedReservation?.reservationTime ??
    null;
  const reservationClients =
    reservationSource?.reservation_clients ??
    reservationSource?.reservationClients ??
    orderSource?.reservation_clients ??
    orderSource?.reservationClients ??
    nestedReservation?.reservation_clients ??
    nestedReservation?.reservationClients ??
    0;
  const reservationNotes =
    reservationSource?.reservation_notes ??
    reservationSource?.reservationNotes ??
    orderSource?.reservation_notes ??
    orderSource?.reservationNotes ??
    nestedReservation?.reservation_notes ??
    nestedReservation?.reservationNotes ??
    "";

  if (!reservationDate && !reservationTime && !reservationNotes && Number(reservationClients || 0) <= 0) {
    return null;
  }

  const resolvedStatus =
    reservationSource?.status ??
    reservationSource?.order_status ??
    orderSource?.status ??
    nestedReservation?.status ??
    "reserved";
  const normalizedResolvedStatus = String(resolvedStatus || "").trim().toLowerCase();
  if (TERMINAL_RESERVATION_STATUSES.has(normalizedResolvedStatus)) {
    return null;
  }
  const resolvedOrderType =
    reservationSource?.order_type ??
    orderSource?.order_type ??
    nestedReservation?.order_type ??
    "reservation";

  return {
    id: resolvedReservationId ?? null,
    order_id: resolvedOrderId ?? null,
    table_number: resolvedTableNumber,
    status: resolvedStatus,
    order_type: resolvedOrderType,
    customer_name:
      reservationSource?.customer_name ??
      reservationSource?.customerName ??
      orderSource?.customer_name ??
      orderSource?.customerName ??
      nestedReservation?.customer_name ??
      nestedReservation?.customerName ??
      "",
    customer_phone:
      reservationSource?.customer_phone ??
      reservationSource?.customerPhone ??
      orderSource?.customer_phone ??
      orderSource?.customerPhone ??
      nestedReservation?.customer_phone ??
      nestedReservation?.customerPhone ??
      "",
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    reservation_clients: reservationClients,
    reservation_notes: reservationNotes,
  };
};

export const upsertReservationShadow = (reservation) => {
  const nextReservation = buildReservationShadowRecord({ reservation });
  if (!nextReservation) return;

  const current = readReservationShadows();
  const next = current.filter((row) => {
    const sameReservationId =
      nextReservation.id != null && row?.id != null && Number(row.id) === Number(nextReservation.id);
    const sameOrderId =
      nextReservation.order_id != null &&
      row?.order_id != null &&
      Number(row.order_id) === Number(nextReservation.order_id);
    const sameTable =
      Number(row?.table_number ?? row?.tableNumber ?? row?.table) ===
      Number(nextReservation.table_number);
    return !(sameReservationId || sameOrderId || sameTable);
  });
  next.push(nextReservation);
  writeReservationShadows(next);
};

export const removeReservationShadow = ({ reservationId, orderId, tableNumber } = {}) => {
  const next = readReservationShadows().filter((row) => {
    const sameReservationId =
      reservationId != null && row?.id != null && Number(row.id) === Number(reservationId);
    const sameOrderId =
      orderId != null && row?.order_id != null && Number(row.order_id) === Number(orderId);
    const sameTable =
      tableNumber != null &&
      Number(row?.table_number ?? row?.tableNumber ?? row?.table) === Number(tableNumber);
    return !(sameReservationId || sameOrderId || sameTable);
  });
  writeReservationShadows(next);
};
