import { formatLocalYmd, normalizeOrderStatus, parseLooseDateToMs } from "../features/tables/tableVisuals";

const TERMINAL_BOOKING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "checked_out",
  "closed",
  "completed",
  "deleted",
  "void",
]);

export const getBookingScheduledDateYmd = (booking) => {
  const raw = String(
    booking?.reservation_date ??
      booking?.reservationDate ??
      booking?.event_date ??
      booking?.eventDate ??
      booking?.booking_date ??
      booking?.bookingDate ??
      ""
  ).trim();
  if (!raw) return "";
  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch?.[1]) return ymdMatch[1];
  const parsedMs = parseLooseDateToMs(raw);
  return Number.isFinite(parsedMs) ? formatLocalYmd(new Date(parsedMs)) : "";
};

export const getBookingScheduledTimeValue = (booking) =>
  String(
    booking?.reservation_time ??
      booking?.reservationTime ??
      booking?.event_time ??
      booking?.eventTime ??
      booking?.booking_time ??
      booking?.bookingTime ??
      ""
  ).trim();

export const isBookingScheduledForToday = (booking, todayYmd = formatLocalYmd(new Date())) => {
  const bookingDateYmd = getBookingScheduledDateYmd(booking);
  if (!bookingDateYmd || !todayYmd) return false;
  return bookingDateYmd === todayYmd;
};

export const isReservationRelevantForTodayTableState = (
  reservation,
  todayYmd = formatLocalYmd(new Date())
) => {
  const reservationStatus = normalizeOrderStatus(
    reservation?.status ??
      reservation?.reservation_status ??
      reservation?.reservationStatus ??
      reservation?.order_status ??
      reservation?.orderStatus ??
      ""
  );
  if (TERMINAL_BOOKING_STATUSES.has(reservationStatus)) {
    return false;
  }
  if (reservationStatus === "checked_in") return true;
  return isBookingScheduledForToday(reservation, todayYmd);
};

export const isConcertBookingRelevantForTodayTableState = (
  booking,
  todayYmd = formatLocalYmd(new Date())
) => {
  const reservationOrderStatus = normalizeOrderStatus(
    booking?.reservation_order_status ?? booking?.reservationOrderStatus ?? ""
  );
  if (TERMINAL_BOOKING_STATUSES.has(reservationOrderStatus)) {
    return false;
  }
  if (reservationOrderStatus === "checked_in") return true;
  return isBookingScheduledForToday(booking, todayYmd);
};
