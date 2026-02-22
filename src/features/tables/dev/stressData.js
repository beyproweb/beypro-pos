const clampInt = (value, min, max, fallback) => {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const createRng = (seedInput) => {
  let state = (Number(seedInput) || Date.now()) >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = (rng, list) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(rng() * list.length)] || null;
};

const pickWeighted = (rng, entries, fallback) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const total = safeEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry?.weight) || 0), 0);
  if (total <= 0) return fallback;

  let target = rng() * total;
  for (const entry of safeEntries) {
    target -= Math.max(0, Number(entry?.weight) || 0);
    if (target <= 0) return entry.value;
  }
  return safeEntries[safeEntries.length - 1]?.value ?? fallback;
};

const makeIsoOffset = (ms) => new Date(ms).toISOString();

const AREAS = ["Main Hall", "Terrace", "Garden", "VIP", "Bar", "Lounge"];
const ORDER_STATUSES = [
  { value: "confirmed", weight: 58 },
  { value: "draft", weight: 20 },
  { value: "paid", weight: 15 },
  { value: "reserved", weight: 7 },
];
const KITCHEN_STATUSES = [
  { value: "new", weight: 28 },
  { value: "preparing", weight: 38 },
  { value: "ready", weight: 22 },
  { value: "delivered", weight: 12 },
];

const buildProductPrepById = (rng, count = 80) => {
  const byId = {};
  for (let i = 1; i <= count; i += 1) {
    byId[i] = 2 + Math.floor(rng() * 28);
  }
  return byId;
};

const calcItemsPerOrder = (orderCount, targetItems, rng) => {
  const perOrder = Array.from({ length: orderCount }, () => 2 + Math.floor(rng() * 6));
  let currentTotal = perOrder.reduce((sum, value) => sum + value, 0);

  while (currentTotal < targetItems) {
    const idx = Math.floor(rng() * perOrder.length);
    perOrder[idx] += 1;
    currentTotal += 1;
  }

  while (currentTotal > targetItems) {
    const idx = Math.floor(rng() * perOrder.length);
    if (perOrder[idx] <= 1) continue;
    perOrder[idx] -= 1;
    currentTotal -= 1;
  }

  return perOrder;
};

const buildTableConfigs = (tableCount, rng) => {
  return Array.from({ length: tableCount }, (_, idx) => {
    const number = idx + 1;
    const seats = 2 + Math.floor(rng() * 8);
    const guests = rng() < 0.3 ? null : Math.floor(rng() * (seats + 1));
    return {
      number,
      active: true,
      seats,
      guests,
      area: pick(rng, AREAS) || "Main Hall",
      label: rng() < 0.14 ? `Zone ${1 + Math.floor(rng() * 12)}` : "",
      color: null,
    };
  });
};

const buildOrderItem = ({
  rng,
  itemId,
  orderId,
  productPrepById,
  productCount,
  paid,
  prepStartedAt,
}) => {
  const productId = 1 + Math.floor(rng() * productCount);
  const qty = 1 + Math.floor(rng() * 3);
  const price = Number((3 + rng() * 35).toFixed(2));
  const kitchenStatus = pickWeighted(rng, KITCHEN_STATUSES, "new");

  return {
    id: itemId,
    order_id: orderId,
    product_id: productId,
    product_name: `Item ${productId}`,
    quantity: qty,
    price,
    total_price: Number((price * qty).toFixed(2)),
    kitchen_status: kitchenStatus,
    paid: paid ? true : rng() < 0.18,
    paid_at: paid ? makeIsoOffset(prepStartedAt + 5000) : null,
    prep_started_at: makeIsoOffset(prepStartedAt),
    preparation_time: productPrepById[productId],
  };
};

export const generateTableOverviewStressData = (options = {}) => {
  const tableCount = clampInt(options.tableCount, 60, 120, 96);
  const orderCount = clampInt(options.orderCount, 300, 500, 420);
  const itemCount = clampInt(options.itemCount, 1000, 3000, 2200);
  const seed = Number(options.seed) || Date.now();

  const rng = createRng(seed);
  const tableConfigs = buildTableConfigs(tableCount, rng);
  const productPrepById = buildProductPrepById(rng, 100);
  const productCount = Object.keys(productPrepById).length;

  const itemsPerOrder = calcItemsPerOrder(orderCount, itemCount, rng);
  const ordersByTableRaw = new Map();
  const orders = [];
  const reservationsToday = [];

  let nextOrderId = 900000;
  let nextItemId = 1900000;
  let totalItems = 0;

  for (let orderIndex = 0; orderIndex < orderCount; orderIndex += 1) {
    const id = nextOrderId++;
    const tableNumber = 1 + Math.floor(rng() * tableCount);
    const status = pickWeighted(rng, ORDER_STATUSES, "confirmed");
    const createdOffsetMin = Math.floor(rng() * 8 * 60);
    const createdAtMs = Date.now() - createdOffsetMin * 60 * 1000;
    const prepStartedAtMs = createdAtMs + Math.floor(rng() * 12) * 1000;

    const isPaid = status === "paid";
    const isReserved = status === "reserved";
    const itemTarget = Math.max(1, itemsPerOrder[orderIndex] || 1);
    const items = [];
    for (let i = 0; i < itemTarget; i += 1) {
      items.push(
        buildOrderItem({
          rng,
          itemId: nextItemId++,
          orderId: id,
          productPrepById,
          productCount,
          paid: isPaid,
          prepStartedAt: prepStartedAtMs,
        })
      );
    }

    const total = items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
    totalItems += items.length;

    const order = {
      id,
      table_number: tableNumber,
      status,
      order_type: isReserved ? "reservation" : "table",
      total: isPaid ? 0 : Number(total.toFixed(2)),
      payment_status: isPaid ? "paid" : "pending",
      is_paid: isPaid,
      items,
      merged_ids: [id],
      created_at: makeIsoOffset(createdAtMs),
      updated_at: makeIsoOffset(createdAtMs + Math.floor(rng() * 30) * 1000),
      prep_started_at: makeIsoOffset(prepStartedAtMs),
      estimated_ready_at: makeIsoOffset(prepStartedAtMs + (8 + Math.floor(rng() * 25)) * 60 * 1000),
      confirmedSinceMs: status === "confirmed" ? createdAtMs : null,
      kitchen_delivered_at:
        items.length > 0 && items.every((item) => item.kitchen_status === "delivered")
          ? makeIsoOffset(createdAtMs + 30 * 60 * 1000)
          : null,
    };

    if (isReserved && rng() < 0.85) {
      const reservation = {
        id: `res-${id}`,
        order_id: id,
        table_number: tableNumber,
        reservation_date: makeIsoOffset(Date.now()).slice(0, 10),
        reservation_time: `${String(10 + Math.floor(rng() * 12)).padStart(2, "0")}:${
          rng() < 0.5 ? "00" : "30"
        }`,
        reservation_clients: 2 + Math.floor(rng() * 6),
        reservation_notes: rng() < 0.4 ? "Stress profile reservation" : "",
      };
      reservationsToday.push(reservation);
      order.reservation = reservation;
      order.reservation_date = reservation.reservation_date;
      order.reservation_time = reservation.reservation_time;
      order.reservation_clients = reservation.reservation_clients;
      order.reservation_notes = reservation.reservation_notes;
    }

    if (!ordersByTableRaw.has(tableNumber)) {
      ordersByTableRaw.set(tableNumber, []);
    }
    ordersByTableRaw.get(tableNumber).push(order);
    orders.push(order);
  }

  for (const list of ordersByTableRaw.values()) {
    list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }

  return {
    seed,
    tableConfigs,
    orders,
    ordersByTableRaw,
    reservationsToday,
    productPrepById,
    stats: {
      tables: tableCount,
      openOrders: orderCount,
      items: totalItems,
    },
  };
};

const cloneOrderWithMutations = (order, mutate) => {
  const next = {
    ...order,
    items: Array.isArray(order?.items) ? order.items.map((item) => ({ ...item })) : [],
  };
  mutate(next);
  return next;
};

export const mutateStressDataByAction = (dataset, action) => {
  if (!dataset || typeof dataset !== "object") return dataset;
  const orders = Array.isArray(dataset.orders) ? dataset.orders : [];
  if (orders.length === 0) return dataset;

  const rng = createRng(dataset.seed + Date.now());
  const targetIndex = Math.floor(rng() * orders.length);

  const nextOrders = orders.map((order, index) => {
    if (index !== targetIndex) return order;

    if (action === "status-change") {
      return cloneOrderWithMutations(order, (draft) => {
        const normalized = String(draft.status || "").toLowerCase();
        if (normalized === "confirmed") {
          draft.status = "paid";
          draft.payment_status = "paid";
          draft.is_paid = true;
          draft.total = 0;
          draft.items = draft.items.map((item) => ({ ...item, paid: true, paid_at: makeIsoOffset(Date.now()) }));
        } else {
          draft.status = "confirmed";
          draft.payment_status = "pending";
          draft.is_paid = false;
          draft.items = draft.items.map((item) => ({ ...item, paid: false, paid_at: null }));
          draft.total = Number(
            draft.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0).toFixed(2)
          );
        }
        draft.updated_at = makeIsoOffset(Date.now());
      });
    }

    if (action === "color-change") {
      return cloneOrderWithMutations(order, (draft) => {
        if (draft.items.length === 0) return;
        const flipToPaid = draft.items.some((item) => !item.paid && !item.paid_at);
        draft.items = draft.items.map((item) => ({
          ...item,
          paid: flipToPaid,
          paid_at: flipToPaid ? makeIsoOffset(Date.now()) : null,
        }));
        draft.is_paid = flipToPaid;
        draft.payment_status = flipToPaid ? "paid" : "pending";
        draft.status = flipToPaid ? "paid" : "confirmed";
        draft.total = flipToPaid ? 0 : Number(
          draft.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0).toFixed(2)
        );
      });
    }

    if (action === "move-status") {
      return cloneOrderWithMutations(order, (draft) => {
        const status = String(draft.status || "").toLowerCase();
        const flow = ["draft", "confirmed", "ready", "paid"];
        const currentIndex = flow.indexOf(status);
        const nextStatus = flow[(currentIndex + 1 + flow.length) % flow.length];
        draft.status = nextStatus === "ready" ? "confirmed" : nextStatus;
        draft.updated_at = makeIsoOffset(Date.now());
        draft.items = draft.items.map((item) => {
          if (nextStatus === "ready") return { ...item, kitchen_status: "ready" };
          if (nextStatus === "paid") return { ...item, paid: true, paid_at: makeIsoOffset(Date.now()) };
          if (nextStatus === "confirmed") return { ...item, kitchen_status: "preparing", paid: false, paid_at: null };
          return { ...item, kitchen_status: "new", paid: false, paid_at: null };
        });
        draft.payment_status = nextStatus === "paid" ? "paid" : "pending";
        draft.is_paid = nextStatus === "paid";
        draft.total = nextStatus === "paid" ? 0 : Number(
          draft.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0).toFixed(2)
        );
      });
    }

    return order;
  });

  const nextOrdersByTableRaw = new Map();
  nextOrders.forEach((order) => {
    const tableNumber = Number(order?.table_number);
    if (!Number.isFinite(tableNumber)) return;
    if (!nextOrdersByTableRaw.has(tableNumber)) nextOrdersByTableRaw.set(tableNumber, []);
    nextOrdersByTableRaw.get(tableNumber).push(order);
  });

  for (const list of nextOrdersByTableRaw.values()) {
    list.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  }

  return {
    ...dataset,
    seed: dataset.seed + 1,
    orders: nextOrders,
    ordersByTableRaw: nextOrdersByTableRaw,
  };
};
