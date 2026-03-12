const normalizeStatus = (value) => {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

const collectStatusCandidates = (source) => {
  if (!source || typeof source !== "object") return [];
  const reservation = source?.reservation;
  return [
    source?.status,
    source?.reservation_status,
    source?.reservationStatus,
    reservation?.status,
    reservation?.reservation_status,
    reservation?.reservationStatus,
  ]
    .map(normalizeStatus)
    .filter(Boolean);
};

export const getReservationLifecycleStatus = (...sources) => {
  const candidates = sources.flatMap(collectStatusCandidates);
  if (candidates.includes("checked_in")) return "checked_in";
  if (candidates.includes("confirmed")) return "confirmed";
  if (candidates.includes("reserved")) return "reserved";
  return candidates[0] || "";
};

export const isReservationConfirmedForCheckin = (...sources) => {
  const status = getReservationLifecycleStatus(...sources);
  return status === "confirmed" || status === "checked_in";
};

export const isReservationPendingConfirmation = (...sources) =>
  getReservationLifecycleStatus(...sources) === "reserved";

const hasConcertTicketItem = (items) =>
  Array.isArray(items) &&
  items.some((item) => {
    const itemName = String(
      item?.order_item_name ?? item?.product_name ?? item?.name ?? ""
    )
      .trim()
      .toLowerCase();
    return itemName === "ticket concert";
  });

export const hasConcertBookingContext = (...sources) =>
  sources.some((source) => {
    if (!source || typeof source !== "object") return false;
    const reservation = source?.reservation;
    const concertBookingId = Number(
      source?.concert_booking_id ??
        source?.concertBookingId ??
        reservation?.concert_booking_id ??
        reservation?.concertBookingId ??
        0
    );
    const concertBookingType = String(
      source?.concert_booking_type ??
        source?.concertBookingType ??
        reservation?.concert_booking_type ??
        reservation?.concertBookingType ??
        ""
    )
      .trim()
      .toLowerCase();
    const concertBookingPaymentStatus = String(
      source?.concert_booking_payment_status ??
        source?.concertBookingPaymentStatus ??
        reservation?.concert_booking_payment_status ??
        reservation?.concertBookingPaymentStatus ??
        ""
    )
      .trim()
      .toLowerCase();
    const concertBookingStatus = String(
      source?.concert_booking_status ??
        source?.concertBookingStatus ??
        reservation?.concert_booking_status ??
        reservation?.concertBookingStatus ??
        ""
    )
      .trim()
      .toLowerCase();
    const bookingType = String(
      source?.booking_type ??
        source?.bookingType ??
        reservation?.booking_type ??
        reservation?.bookingType ??
        ""
    )
      .trim()
      .toLowerCase();
    const ticketTypeName = String(
      source?.ticket_type_name ??
        source?.ticketTypeName ??
        reservation?.ticket_type_name ??
        reservation?.ticketTypeName ??
        ""
    )
      .trim()
      .toLowerCase();
    const eventId = Number(
      source?.event_id ??
        source?.eventId ??
        reservation?.event_id ??
        reservation?.eventId ??
        0
    );
    const notes = String(
      source?.reservation_notes ??
        source?.reservationNotes ??
        reservation?.reservation_notes ??
        reservation?.reservationNotes ??
        source?.customer_note ??
        source?.customerNote ??
        reservation?.customer_note ??
        reservation?.customerNote ??
        ""
    )
      .trim()
      .toLowerCase();

    return Boolean(
      (Number.isFinite(concertBookingId) && concertBookingId > 0) ||
        concertBookingType ||
        concertBookingPaymentStatus ||
        concertBookingStatus ||
        bookingType === "ticket" ||
        ticketTypeName ||
        (Number.isFinite(eventId) && eventId > 0) ||
        notes.includes("concert") ||
        hasConcertTicketItem(source?.items) ||
        hasConcertTicketItem(reservation?.items)
    );
  });

export const isConcertBookingConfirmed = (...sources) =>
  sources.some((source) => {
    if (!source || typeof source !== "object") return false;
    const reservation = source?.reservation;
    const paymentStatus = String(
      source?.payment_status ??
        source?.paymentStatus ??
        source?.concert_booking_payment_status ??
        source?.concertBookingPaymentStatus ??
        reservation?.payment_status ??
        reservation?.paymentStatus ??
        reservation?.concert_booking_payment_status ??
        reservation?.concertBookingPaymentStatus ??
        ""
    )
      .trim()
      .toLowerCase();
    const bookingStatus = String(
      source?.status ??
        source?.booking_status ??
        source?.bookingStatus ??
        source?.concert_booking_status ??
        source?.concertBookingStatus ??
        reservation?.status ??
        reservation?.booking_status ??
        reservation?.bookingStatus ??
        reservation?.concert_booking_status ??
        reservation?.concertBookingStatus ??
        ""
    )
      .trim()
      .toLowerCase();
    return (
      paymentStatus === "confirmed" ||
      bookingStatus === "confirmed" ||
      bookingStatus === "checked_in"
    );
  });
