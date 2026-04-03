import secureFetch from "./secureFetch";
import { PUBLIC_RESTAURANT_BASE_URL } from "./publicRestaurantUrl";

const TOKEN_QUERY_KEYS = ["token", "qr_token", "jwt", "table_token"];
const JWT_TOKEN_REGEX = /([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/;

function buildScanError(message, code, scanState = "invalid_qr", details = null) {
  const error = new Error(message || "Scan failed");
  error.code = code || "scan_failed";
  error.scanState = scanState;
  error.details = details;
  return error;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function extractTokenFromUrlLike(value) {
  const url = new URL(value);

  for (const key of TOKEN_QUERY_KEYS) {
    const token = normalizeText(url.searchParams.get(key));
    if (token) return token;
  }

  const pathMatch = normalizeText(url.pathname).match(
    /\/(?:api\/)?(?:orders\/reservations|concerts\/bookings)\/qr\/([^/?#]+)/i
  );
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]);
  }

  const hash = normalizeText(url.hash);
  if (hash.includes("?")) {
    const hashParams = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
    for (const key of TOKEN_QUERY_KEYS) {
      const token = normalizeText(hashParams.get(key));
      if (token) return token;
    }
  }

  return "";
}

export function extractGuestQrToken(rawValue) {
  const raw = normalizeText(rawValue).replace(/^['"]|['"]$/g, "");
  if (!raw) return "";

  const directTokenMatch = raw.match(JWT_TOKEN_REGEX);
  if (directTokenMatch?.[1] && directTokenMatch[1] === raw) {
    return directTokenMatch[1];
  }

  try {
    const fromUrl = extractTokenFromUrlLike(raw);
    if (fromUrl) return fromUrl;
  } catch {
    try {
      const base = typeof window !== "undefined" ? window.location.origin : PUBLIC_RESTAURANT_BASE_URL;
      const fromRelativeUrl = extractTokenFromUrlLike(new URL(raw, base).toString());
      if (fromRelativeUrl) return fromRelativeUrl;
    } catch {
      // ignore non-URL payloads
    }
  }

  if (directTokenMatch?.[1]) {
    return directTokenMatch[1];
  }

  return "";
}

function normalizeReservationResult(reservation) {
  const status = normalizeStatus(reservation?.status);
  const checkInTargetId = Number(reservation?.checkin_order_id || reservation?.id || 0);

  return {
    entityType: "reservation",
    bookingType: normalizeText(reservation?.scan_booking_type || "reservation"),
    bookingTypeLabelKey: "Reservation",
    guestName: normalizeText(reservation?.guest_name || reservation?.customer_name),
    tableNumber: Number(reservation?.table_number || 0) || null,
    date: normalizeText(reservation?.reservation_date),
    time: normalizeText(reservation?.reservation_time),
    status,
    statusLabel: normalizeText(reservation?.status),
    orderNumber: normalizeText(reservation?.order_number),
    canCheckIn: reservation?.can_check_in === true,
    alreadyCheckedIn: reservation?.is_checked_in === true || status === "checked_in",
    checkInTarget:
      Number.isFinite(checkInTargetId) && checkInTargetId > 0
        ? { kind: "order", id: checkInTargetId }
        : null,
    raw: reservation,
  };
}

function normalizeConcertResult(booking) {
  const status = normalizeStatus(
    booking?.current_status || booking?.reservation_order_status || booking?.booking_status || booking?.payment_status
  );
  const checkInTargetId = Number(booking?.checkin_order_id || booking?.reservation_order_id || 0);
  const bookingType = normalizeText(booking?.scan_booking_type || booking?.booking_type);
  const eventLabel = [normalizeText(booking?.event_title), normalizeText(booking?.artist_name)]
    .filter(Boolean)
    .join(" - ");

  return {
    entityType: "concert",
    bookingType,
    bookingTypeLabelKey: bookingType === "concert_ticket" ? "Concert Ticket" : "Reservation",
    guestName: normalizeText(booking?.guest_name || booking?.customer_name),
    tableNumber: Number(booking?.reserved_table_number || 0) || null,
    date: normalizeText(booking?.event_date || booking?.reservation_date || booking?.confirmed_at),
    time: normalizeText(booking?.event_time || booking?.reservation_time),
    status,
    statusLabel: normalizeText(
      booking?.reservation_order_status || booking?.booking_status || booking?.payment_status
    ),
    orderNumber: normalizeText(booking?.order_number),
    concertLabel: eventLabel,
    ticketTypeName: normalizeText(booking?.ticket_type_name),
    quantity: Number(booking?.quantity || 0) || null,
    canCheckIn: booking?.can_check_in === true,
    alreadyCheckedIn: booking?.is_checked_in === true || status === "checked_in",
    checkInTarget:
      Number.isFinite(checkInTargetId) && checkInTargetId > 0
        ? { kind: "order", id: checkInTargetId }
        : null,
    raw: booking,
  };
}

export async function lookupGuestTicketQr(token) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) {
    throw buildScanError("Invalid QR", "invalid_qr", "invalid_qr");
  }

  const lookups = [
    {
      path: `/orders/reservations/qr/${encodeURIComponent(normalizedToken)}`,
      normalize: (response) => normalizeReservationResult(response?.reservation || {}),
    },
    {
      path: `/concerts/bookings/qr/${encodeURIComponent(normalizedToken)}`,
      normalize: (response) => normalizeConcertResult(response?.booking || {}),
    },
  ];

  for (const lookup of lookups) {
    try {
      const response = await secureFetch(lookup.path);
      return lookup.normalize(response);
    } catch (error) {
      const status = Number(error?.details?.status || 0);
      const body = error?.details?.body || null;
      const code = normalizeText(body?.code || error?.code).toLowerCase();

      if (status === 404) {
        continue;
      }
      if (status === 409 && code === "qr_not_ready") {
        throw buildScanError(body?.error || error?.message, "qr_not_ready", "invalid_qr", error?.details);
      }
      throw buildScanError(
        body?.error || error?.message || "Failed to validate QR",
        code || "lookup_failed",
        "invalid_qr",
        error?.details
      );
    }
  }

  throw buildScanError("Booking not found", "booking_not_found", "booking_not_found");
}

export async function checkInGuestTicket(result) {
  const targetId = Number(result?.checkInTarget?.id || 0);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    throw buildScanError("Booking not found", "booking_not_found", "booking_not_found");
  }

  try {
    return await secureFetch(`/orders/${targetId}/reservations/checkin`, {
      method: "POST",
    });
  } catch (error) {
    const status = Number(error?.details?.status || 0);
    const body = error?.details?.body || null;
    const code = normalizeText(body?.code || error?.code).toLowerCase();
    const message = body?.error || error?.message || "Failed to check in guest";

    if (status === 404) {
      throw buildScanError(message, "booking_not_found", "booking_not_found", error?.details);
    }
    if (status === 409 && code === "concert_booking_unconfirmed") {
      throw buildScanError(message, code, "guest_found", error?.details);
    }
    throw buildScanError(message, code || "checkin_failed", "invalid_qr", error?.details);
  }
}
