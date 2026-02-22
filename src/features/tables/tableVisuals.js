export const normalizeOrderStatus = (status) => {
  if (!status) return "";
  const normalized = String(status).toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

export const hasUnpaidAnywhere = (order) => {
  if (!order) return false;

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];

  const unpaidSub = suborders.some((sub) =>
    Array.isArray(sub.items) ? sub.items.some((i) => !i.paid_at && !i.paid) : false
  );

  const unpaidMain = items.some((i) => !i.paid_at && !i.paid);

  return unpaidSub || unpaidMain;
};

export const isOrderPaid = (order) => {
  const status = normalizeOrderStatus(order?.status);
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  return status === "paid" || paymentStatus === "paid" || order?.is_paid === true;
};

export const isOrderCancelledOrCanceled = (status) => {
  const normalized = normalizeOrderStatus(status);
  return normalized === "cancelled" || normalized === "canceled";
};

export const isOrderFullyPaid = (order) => isOrderPaid(order) && !hasUnpaidAnywhere(order);

export const isEffectivelyFreeOrder = (order) => {
  if (!order) return true;

  const status = normalizeOrderStatus(order.status);
  if (status === "closed") return true;

  if (status === "reserved" || order.order_type === "reservation" || order.reservation_date) {
    return false;
  }

  if (status === "draft") return true;

  const total = Number(order.total || 0);
  const items = Array.isArray(order.items) ? order.items : null;

  if (items) return items.length === 0 && total <= 0;

  return total <= 0;
};

export const parseLooseDateToMs = (val) => {
  if (!val) return NaN;
  const a = new Date(val).getTime();
  const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
  const b = new Date(bStr).getTime();
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
  }
  return Number.isFinite(a) ? a : b;
};

export const formatLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const isDelayed = (order) => {
  if (!order || normalizeOrderStatus(order.status) !== "confirmed" || !order.created_at) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;
  const created = new Date(order.created_at);
  const now = new Date();
  const diffMins = (now - created) / 1000 / 60;
  return diffMins > 1;
};

export const getTableColor = (order) => {
  if (!order) return "bg-gray-400 text-black";

  const status = normalizeOrderStatus(order.status);

  if (status === "reserved" || order.order_type === "reservation" || order.reservation_date) {
    if (isOrderFullyPaid(order)) {
      return "bg-green-500 text-white";
    }
    return "bg-orange-500 text-white";
  }

  if (isOrderFullyPaid(order)) {
    return "bg-green-500 text-white";
  }

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : null;
  const total = Number(order.total || 0);

  if (!items) {
    if (total <= 0) return "bg-gray-400 text-black";
    if (status === "confirmed") return "bg-red-500 text-white";
    return "bg-gray-400 text-black";
  }

  if (items.length === 0) {
    return "bg-gray-400 text-black";
  }

  const hasUnpaidSubOrder = suborders.some((sub) =>
    Array.isArray(sub.items) ? sub.items.some((i) => !i.paid_at && !i.paid) : false
  );

  const hasUnpaidMainItem = items.some((i) => !i.paid_at && !i.paid);

  if (hasUnpaidSubOrder || hasUnpaidMainItem) {
    return "bg-red-500 text-white";
  }

  if (status === "confirmed") {
    return "bg-yellow-400 text-black";
  }

  return "bg-gray-400 text-black";
};

export const getDisplayTotal = (order) => {
  if (!order) return 0;

  const computeLineTotal = (item) => {
    if (!item || typeof item !== "object") return 0;
    const qty = Math.max(1, Math.trunc(Number(item?.quantity ?? item?.qty ?? 1) || 1));

    const rawTotal =
      item?.total_price ?? item?.totalPrice ?? item?.line_total ?? item?.lineTotal ?? null;
    const parsedTotal = Number(rawTotal);
    if (Number.isFinite(parsedTotal) && parsedTotal > 0) return parsedTotal;

    const unitPrice = Number(item?.price ?? item?.unit_price ?? item?.unitPrice ?? 0) || 0;
    const base = unitPrice * qty;

    const extrasTotal = Array.isArray(item?.extras)
      ? item.extras.reduce((sum, ex) => {
          const exQty = Math.max(1, Math.trunc(Number(ex?.quantity ?? 1) || 1));
          const exPrice = Number(ex?.price ?? 0) || 0;
          return sum + exQty * exPrice;
        }, 0) * qty
      : 0;

    return base + extrasTotal;
  };

  if (hasUnpaidAnywhere(order)) {
    const items = Array.isArray(order.items) ? order.items : [];
    const suborders = Array.isArray(order.suborders) ? order.suborders : [];
    const unpaidMainTotal = items
      .filter((i) => !i?.paid_at && !i?.paid)
      .reduce((sum, i) => sum + computeLineTotal(i), 0);
    const unpaidSubTotal = suborders
      .flatMap((sub) => (Array.isArray(sub?.items) ? sub.items : []))
      .filter((i) => !i?.paid_at && !i?.paid)
      .reduce((sum, i) => sum + computeLineTotal(i), 0);
    return unpaidMainTotal + unpaidSubTotal;
  }

  if (order.receiptMethods?.length > 0) {
    return order.receiptMethods.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  }

  return parseFloat(order.total || 0);
};

const EMPTY_TABLE_DERIVED_FIELDS = Object.freeze({
  tableStatus: "",
  tableColor: "bg-gray-400 text-black",
  unpaidTotal: 0,
  activeOrderCount: 0,
  hasUnpaidItems: false,
  isFullyPaid: false,
  isFreeTable: true,
  isReservedTable: false,
});

const tableDerivedFieldsCache = new WeakMap();

export const getMemoizedTableDerivedFields = (order) => {
  if (!order || typeof order !== "object") return EMPTY_TABLE_DERIVED_FIELDS;
  const cached = tableDerivedFieldsCache.get(order);
  if (cached) return cached;

  const tableStatus = normalizeOrderStatus(order.status);
  const hasUnpaidItems = hasUnpaidAnywhere(order);
  const isFullyPaid = isOrderFullyPaid(order);
  const isReservedTable =
    tableStatus === "reserved" || order.order_type === "reservation" || Boolean(order.reservation_date);
  const derived = {
    tableStatus,
    tableColor: getTableColor(order),
    unpaidTotal: getDisplayTotal(order),
    activeOrderCount: Array.isArray(order.merged_ids)
      ? order.merged_ids.length
      : Array.isArray(order.suborders)
      ? Math.max(1, order.suborders.length)
      : 1,
    hasUnpaidItems,
    isFullyPaid,
    isFreeTable: isEffectivelyFreeOrder(order),
    isReservedTable,
  };

  tableDerivedFieldsCache.set(order, derived);
  return derived;
};
