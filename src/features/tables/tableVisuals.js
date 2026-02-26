export const normalizeOrderStatus = (status) => {
  if (!status) return "";
  const normalized = String(status).trim().toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

export const hasReservationSignal = (order) => {
  if (!order || typeof order !== "object") return false;
  const reservation = order?.reservation;
  const reservationDate =
    order?.reservation_date ??
    order?.reservationDate ??
    reservation?.reservation_date ??
    reservation?.reservationDate ??
    null;
  const reservationTime =
    order?.reservation_time ??
    order?.reservationTime ??
    reservation?.reservation_time ??
    reservation?.reservationTime ??
    null;
  const nestedReservationId = reservation?.id;
  return Boolean(
    reservationDate ||
      reservationTime ||
      (nestedReservationId !== null && nestedReservationId !== undefined && nestedReservationId !== "")
  );
};

const normalizeReservationDateValue = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  return formatLocalYmd(parsed);
};

const extractReservationDateTime = (source) => {
  if (!source || typeof source !== "object") {
    return { reservationDate: null, reservationTime: null };
  }
  const reservation = source?.reservation;
  const reservationDate =
    source?.reservation_date ??
    source?.reservationDate ??
    reservation?.reservation_date ??
    reservation?.reservationDate ??
    null;
  const reservationTime =
    source?.reservation_time ??
    source?.reservationTime ??
    reservation?.reservation_time ??
    reservation?.reservationTime ??
    null;
  return { reservationDate, reservationTime };
};

const parseReservationDateTimeMs = (reservationDate, reservationTime) => {
  const normalizedDate = normalizeReservationDateValue(reservationDate);
  if (!normalizedDate) return NaN;

  if (!reservationTime) {
    return new Date(`${normalizedDate}T00:00:00`).getTime();
  }

  const rawTime = String(reservationTime).trim();
  const hhmmss = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Math.max(0, Math.min(23, Number(hhmmss[1])));
    const minutes = Math.max(0, Math.min(59, Number(hhmmss[2])));
    const seconds = Math.max(0, Math.min(59, Number(hhmmss[3] || 0)));
    const [year, month, day] = normalizedDate.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
  }

  const fallback = new Date(`${normalizedDate}T${rawTime}`).getTime();
  if (Number.isFinite(fallback)) return fallback;

  return new Date(`${normalizedDate}T00:00:00`).getTime();
};

export const isReservationDueNow = (source, nowMs = Date.now()) => {
  if (!source || typeof source !== "object") return false;

  const { reservationDate, reservationTime } = extractReservationDateTime(source);
  if (!reservationDate && !reservationTime) return false;
  if (!reservationDate) return true;

  const scheduledMs = parseReservationDateTimeMs(reservationDate, reservationTime);
  if (!Number.isFinite(scheduledMs)) return true;
  return nowMs >= scheduledMs;
};

export const hasUnpaidAnywhere = (order) => {
  if (!order) return false;
  const status = normalizeOrderStatus(order?.status);
  const paymentStatus = String(order?.payment_status || "").toLowerCase();

  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const hasLineData = items.length > 0 || suborders.length > 0;
  const hasPaidFlag = status === "paid" || paymentStatus === "paid" || order?.is_paid === true;
  // Keep instant-paid UX only for transient states where line data is not available yet.
  if (hasPaidFlag && !hasLineData) {
    return false;
  }

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

  const hasSignal = hasReservationSignal(order);
  if ((status === "reserved" || order.order_type === "reservation") && hasSignal) {
    return !isReservationDueNow(order);
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
  const items = Array.isArray(order.items) ? order.items : [];
  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const hasLineData = items.length > 0 || suborders.length > 0;
  if (isOrderPaid(order) && !hasLineData) return 0;

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
  const hasSignal = hasReservationSignal(order);
  const hasUnpaidItems = hasUnpaidAnywhere(order);
  const isFullyPaid = isOrderFullyPaid(order);
  const hasExplicitReservationState =
    (tableStatus === "reserved" || order.order_type === "reservation") && hasSignal;
  const hasSignalReservationState =
    !hasExplicitReservationState &&
    hasSignal &&
    isEffectivelyFreeOrder(order);
  const hasReservationState = hasExplicitReservationState || hasSignalReservationState;
  const isReservedTable = hasReservationState
    ? hasSignal
      ? isReservationDueNow(order)
      : true
    : false;
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
