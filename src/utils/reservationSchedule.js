function normalizeTime(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  if (/^\d{2}:\d{2}$/.test(raw)) return `${raw}:00`;
  return raw;
}

function parseReservationDateTime(dateValue, timeValue) {
  const dateRaw = dateValue === null || dateValue === undefined ? "" : String(dateValue).trim();
  if (!dateRaw) return null;

  if (dateRaw.includes("T")) {
    const parsed = new Date(dateRaw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const timeRaw = normalizeTime(timeValue) || "00:00:00";
  const parsed = new Date(`${dateRaw}T${timeRaw}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getReservationSchedule(orderLike) {
  if (!orderLike || typeof orderLike !== "object") return null;

  const nested = orderLike?.reservation && typeof orderLike.reservation === "object"
    ? orderLike.reservation
    : null;

  const reservationDate =
    nested?.reservation_date ??
    orderLike?.reservation_date ??
    orderLike?.reservationDate ??
    null;

  const reservationTime =
    nested?.reservation_time ??
    orderLike?.reservation_time ??
    orderLike?.reservationTime ??
    null;

  if (!reservationDate) return null;
  const when = parseReservationDateTime(reservationDate, reservationTime);
  if (!when) return null;

  return {
    date: String(reservationDate).trim(),
    time: reservationTime === null || reservationTime === undefined ? "" : String(reservationTime).trim(),
    whenMs: when.getTime(),
  };
}

export function isEarlyReservationClose(orderLike, nowMs = Date.now()) {
  const schedule = getReservationSchedule(orderLike);
  if (!schedule) return false;
  return nowMs < schedule.whenMs;
}

