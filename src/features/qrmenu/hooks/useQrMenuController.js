import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import secureFetch from "../../../utils/secureFetch";
import { Html5Qrcode } from "html5-qrcode";
import { io } from "socket.io-client";
import { useSocketIO as useOrderSocket } from "../../../components/OrderStatusScreen";
import useQrMenuProducts from "./useQrMenuProducts";
import useQrMenuCart from "./useQrMenuCart";
import useQrMenuCheckout from "./useQrMenuCheckout";
import useQrMenuStorage from "./useQrMenuStorage";
import { hasConcertBookingContext } from "../../../utils/reservationStatus";
import { DEFAULT_LANGUAGE, resolvePreferredLanguage } from "../../../utils/language";
import {
  getOrderTableNumberKey,
  isActiveTableOrderStatus,
  normalizeTableNumberKey,
  isSameTableNumberKey,
} from "../../../utils/activeTableState";

const QR_MENU_BRANDING_CACHE_PREFIX = "qr-menu-branding-cache:";
const QR_MENU_BRANDING_UPDATED_EVENT = "qr:branding-cache-updated";
const DEFAULT_QR_MENU_BRANDING = {
  delivery_enabled: true,
  call_waiter_button_enabled: true,
  reservation_pickup_enabled: true,
  reservation_guest_composition_enabled: false,
  reservation_guest_composition_field_mode: "optional",
  reservation_guest_composition_restriction_rule: "no_restriction",
  reservation_guest_composition_min_guests_per_table: 1,
  reservation_guest_composition_validation_message: "",
  table_order_enabled: true,
  disable_all_products: false,
  table_geo_enabled: false,
  table_geo_radius_meters: 150,
  pwa_primary_color: "#4F46E5",
  pwa_background_color: "#FFFFFF",
  app_icon: "",
  app_icon_192: "",
  app_icon_512: "",
  apple_touch_icon: "",
  splash_logo: "",
  main_title_logo: "",
  app_display_name: "",
  qrmenu_font_family: "gotham",
  concert_reservation_button_color: "#111827",
};

function normalizeConfiguredAreaName(value) {
  return String(value || "").trim();
}

function readCachedTableAreaNames(restaurantIdentifier) {
  if (typeof window === "undefined") return [];

  try {
    const native = window.localStorage;
    if (!native) return [];

    const candidates = [
      String(native.getItem("restaurant_id") || "").trim(),
      String(native.getItem("restaurant_slug") || "").trim(),
      String(restaurantIdentifier || "").trim(),
    ].filter((value) => value && value !== "undefined" && value !== "null");

    const visited = new Set();
    for (const tenant of candidates) {
      if (visited.has(tenant)) continue;
      visited.add(tenant);

      const raw = native.getItem(`beypro:settings:${tenant}:tables`);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const areaNames = Array.isArray(parsed?.areaNames)
        ? parsed.areaNames.map(normalizeConfiguredAreaName).filter(Boolean)
        : [];
      if (areaNames.length > 0) {
        return areaNames;
      }
    }
  } catch {
    // ignore local cache read errors
  }

  return [];
}

function getQrMenuBrandingCacheKey(identifier) {
  const value = String(identifier || "").trim();
  return value ? `${QR_MENU_BRANDING_CACHE_PREFIX}${value}` : "";
}

function readCachedQrMenuBranding(identifier) {
  if (typeof window === "undefined") return null;
  const key = getQrMenuBrandingCacheKey(identifier);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedQrMenuBranding(identifier, customization) {
  if (typeof window === "undefined") return;
  const normalizedIdentifier = String(identifier || "").trim();
  const key = getQrMenuBrandingCacheKey(normalizedIdentifier);
  if (!key || !customization || typeof customization !== "object") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(customization));
  } catch {
    // Ignore storage quota/privacy errors and keep runtime state only.
  }

  try {
    window.dispatchEvent(
      new CustomEvent(QR_MENU_BRANDING_UPDATED_EVENT, {
        detail: {
          identifier: normalizedIdentifier,
          customization,
        },
      })
    );
  } catch {
    // Ignore custom event failures and keep runtime state only.
  }
}

export function useQrMenuController({
  slug,
  id,
  QR_TOKEN_KEY,
  API_URL,
  API_BASE,
  storage,
  toArray,
  boolish,
  parseRestaurantIdFromIdentifier,
  getStoredToken,
  getQrModeFromLocation,
  getTableFromLocation,
  makeT,
  getPlatform,
  saveSelectedTable,
  extractTableNumberFromQrText,
}) {
const FORCE_STATUS_UNTIL_CLOSE_KEY = "qr_force_status_until_closed";
const DELIVERY_REORDER_CONTEXT_KEY = "qr_delivery_reorder_context";
const clampGuestCount = (value, fallback = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(20, Math.max(1, Math.floor(n)));
};
const normalizeOptionalGuestCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(20, Math.max(1, Math.floor(n)));
};
const normalizeReservationStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const isCancelledLikeStatus = (status) =>
  ["cancelled", "canceled", "deleted", "void"].includes(
    String(status || "").toLowerCase()
  );
const isTerminalOrderStatus = (status) =>
  ["closed", "completed", "cancelled", "canceled", "deleted", "void", "archived"].includes(
    String(status || "").toLowerCase()
  );
const isCheckedInReservationStatus = (status) => {
  const normalized = normalizeReservationStatus(status);
  return normalized === "checked_in" || normalized === "checkedin" || normalized === "checkin";
};
const isSameTableNumber = (left, right) => {
  return isSameTableNumberKey(left, right);
};
const isTable10 = (value) => String(value ?? "").trim() === "10";
const formatCurrentLocalYmd = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const normalizeEntryDateYmd = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch?.[1]) return ymdMatch[1];
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const normalizeCancellationReason = (value) => String(value ?? "").trim();
const normalizeComparableText = (value) => String(value ?? "").trim().toLowerCase();
const normalizeComparablePhone = (value) => String(value ?? "").replace(/\D+/g, "");
const resolveCancellationReason = (primary, fallback = "") =>
  normalizeCancellationReason(primary) || normalizeCancellationReason(fallback);
const readScopedCustomerSession = (storageApi) => {
  try {
    const raw = storageApi?.getItem?.("qr_customer_session");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};
const extractCustomerSessionHints = (session) => {
  if (!session || typeof session !== "object") {
    return { customerId: null, email: "", phone: "", name: "" };
  }
  const customerId = Number(session?.id || session?.customer_id || session?.customerId || 0);
  return {
    customerId: Number.isFinite(customerId) && customerId > 0 ? customerId : null,
    email: normalizeComparableText(session?.email),
    phone: normalizeComparablePhone(session?.phone),
    name: normalizeComparableText(session?.username || session?.name),
  };
};
const orderMatchesCustomerHints = (order, hints) => {
  if (!order || typeof order !== "object" || !hints) return false;
  const orderCustomerId = Number(
    order?.customer_id ?? order?.customerId ?? order?.customer?.id ?? order?.reservation?.customer_id ?? 0
  );
  const orderEmail = normalizeComparableText(
    order?.customer_email ?? order?.email ?? order?.customer?.email ?? order?.reservation?.customer_email
  );
  const orderPhone = normalizeComparablePhone(
    order?.customer_phone ?? order?.phone ?? order?.customer?.phone ?? order?.reservation?.customer_phone
  );
  const orderName = normalizeComparableText(
    order?.customer_name ?? order?.username ?? order?.name ?? order?.customer?.username ?? order?.customer?.name
  );

  return Boolean(
    (hints.customerId && orderCustomerId === hints.customerId) ||
      (hints.email && orderEmail && orderEmail === hints.email) ||
      (hints.phone && orderPhone && orderPhone === hints.phone) ||
      (hints.name && orderName && orderName === hints.name)
  );
};
const toOrderTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const extractCancellationReason = (source) => {
  if (!source || typeof source !== "object") return "";
  return resolveCancellationReason(
    source?.cancellation_reason ||
      source?.cancel_reason ||
      source?.cancelReason ||
      source?.cancellationReason ||
      source?.delete_reason ||
      source?.deletion_reason ||
      source?.deleteReason ||
      source?.deletionReason ||
      source?.payment_cancellation_reason ||
      source?.payment_cancel_reason ||
      source?.paymentCancellationReason ||
      source?.paymentCancelReason ||
      source?.cancel_note ||
      source?.cancellation_note ||
      source?.reason ||
      source?.concert_booking_cancellation_reason ||
      source?.concertBookingCancellationReason ||
      source?.concert_booking_cancel_reason ||
      source?.concertBookingCancelReason ||
      source?.concert_booking_delete_reason ||
      source?.concertBookingDeleteReason ||
      source?.concert_booking_reason ||
      source?.concertBookingReason ||
      ""
  );
};
const getOrderCancellationReason = (order) =>
  resolveCancellationReason(
    extractCancellationReason(order) ||
      extractCancellationReason(
        order?.reservation && typeof order.reservation === "object" ? order.reservation : null
      ) ||
      extractCancellationReason(
        order?.concert_booking && typeof order.concert_booking === "object"
          ? order.concert_booking
          : null
      ) ||
      ""
  );
const getPayloadCancellationReason = (payload) => {
  if (!payload || typeof payload !== "object") return "";
  const nestedOrder =
    payload?.order && typeof payload.order === "object" ? payload.order : null;
  const nestedReservation =
    payload?.reservation && typeof payload.reservation === "object"
      ? payload.reservation
      : null;
  const nestedConcertBooking =
    payload?.concert_booking && typeof payload.concert_booking === "object"
      ? payload.concert_booking
      : null;
  const nestedOrderConcertBooking =
    nestedOrder?.concert_booking && typeof nestedOrder.concert_booking === "object"
      ? nestedOrder.concert_booking
      : null;
  return resolveCancellationReason(
    getOrderCancellationReason(payload) ||
      getOrderCancellationReason(nestedOrder) ||
      getOrderCancellationReason(nestedReservation) ||
      extractCancellationReason(nestedConcertBooking) ||
      extractCancellationReason(nestedOrderConcertBooking) ||
      payload?.reason ||
      nestedOrder?.reason ||
      nestedReservation?.reason ||
      ""
  );
};
const resolveCancelledStatusFromPayload = (payload, fallback = "cancelled") => {
  const candidates = [
    payload?.status,
    payload?.order?.status,
    payload?.reservation?.status,
    payload?.order_status,
    payload?.orderStatus,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeReservationStatus(candidate);
    if (isCancelledLikeStatus(normalized)) return normalized;
  }
  return fallback;
};
// Fix null/undefined slug
const safeSlug =
  slug && slug !== "null" && slug !== "undefined"
    ? slug
    : id && id !== "null" && id !== "undefined"
    ? id
    : null;

// Identifier used for public QR menu endpoints (slug, qr_code_id, or explicit identifier query)
let restaurantIdentifier = safeSlug;
if (!restaurantIdentifier && typeof window !== "undefined") {
  try {
    const params = new URLSearchParams(window.location.search);
    restaurantIdentifier =
      params.get("identifier") ||
      params.get("tenant_id") ||
      params.get("tenant") ||
      params.get("restaurant_id") ||
      params.get("restaurant") ||
      null;
  } catch {
    restaurantIdentifier = null;
  }
}
if (!restaurantIdentifier && typeof window !== "undefined") {
  try {
    const storedRestaurantId = window?.localStorage?.getItem("restaurant_id");
    const parsed = storedRestaurantId ? Number(storedRestaurantId) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      restaurantIdentifier = String(parsed);
    }
  } catch {
    // ignore local storage read failures
  }
}

  const restaurantIdentifierResolved = restaurantIdentifier;
  const cachedBranding = readCachedQrMenuBranding(restaurantIdentifierResolved);

  // QR entry mode: "table" (scanned at a table) or "delivery" (generic menu link)
  const [qrMode] = useState(() => getQrModeFromLocation());
  // If table QR link encodes the table number, keep it around for defaults
  const [initialTableFromUrl] = useState(() => getTableFromLocation());

  const appendIdentifier = useCallback(
    (url) => {
      const [base, hash] = String(url).split("#");
      const hasQuery = base.includes("?");
      const hasIdentifier = /[?&]identifier=/.test(base);
      const hasMode = /[?&]mode=/.test(base);

      const parts = [];
      if (restaurantIdentifier && !hasIdentifier) {
        parts.push(
          `identifier=${encodeURIComponent(restaurantIdentifier)}`
        );
      }
      if (qrMode && !hasMode) {
        parts.push(`mode=${encodeURIComponent(qrMode)}`);
      }

      if (!parts.length) return url;

      const separator = hasQuery ? "&" : "?";
      const appended = `${base}${separator}${parts.join("&")}`;
      return hash ? `${appended}#${hash}` : appended;
    },
    [restaurantIdentifier, qrMode]
  );

  // 🔒 One liner to always pass identifier via secureFetch
  const sFetch = useCallback((path, options) => {
    return secureFetch(appendIdentifier(path), options);
  }, [appendIdentifier]);

  const [resolvedRestaurantId, setResolvedRestaurantId] = useState(() => {
    try {
      const stored = window?.localStorage?.getItem("restaurant_id");
      const n = stored ? Number(stored) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
    return parseRestaurantIdFromIdentifier(restaurantIdentifier);
  });

  const socketRestaurantId = useMemo(() => {
    const n = Number(resolvedRestaurantId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [resolvedRestaurantId]);

  useEffect(() => {
    const parsed = parseRestaurantIdFromIdentifier(restaurantIdentifier);
    if (Number.isFinite(parsed) && parsed > 0) {
      setResolvedRestaurantId(parsed);
      return;
    }
    setResolvedRestaurantId(null);
    if (!restaurantIdentifier) return;
    let alive = true;
    (async () => {
      try {
        const info = await secureFetch(
          `/public/restaurant-info?identifier=${encodeURIComponent(restaurantIdentifier)}`
        );
        if (!alive) return;
        const idValue = Number(info?.id);
        if (!Number.isFinite(idValue) || idValue <= 0) return;
        setResolvedRestaurantId(idValue);
        try {
          window?.localStorage?.setItem("restaurant_id", String(idValue));
        } catch {}
      } catch {
        // no-op: fallback paths continue to work without realtime
      }
    })();
    return () => {
      alive = false;
    };
  }, [restaurantIdentifier, parseRestaurantIdFromIdentifier]);

const shareUrl = useMemo(() => {
  const origin = window.location.origin;
  const s = slug && slug !== "null" && slug !== "undefined" ? slug : null;

  if (!s) return `${origin}/qr-menu`;

  return `${origin}/qr-menu/${s}/scan`;
}, [slug]);

const parseArray = useCallback((raw) => {
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}, []);
const resolveActiveOrderFromCustomerSession = useCallback(async () => {
  const session = readScopedCustomerSession(storage);
  const hints = extractCustomerSessionHints(session);
  const queryPaths = [];
  if (hints.customerId) {
    queryPaths.push(`/orders?customer_id=${encodeURIComponent(hints.customerId)}`);
  }
  if (hints.phone) {
    queryPaths.push(`/orders?customer_phone=${encodeURIComponent(hints.phone)}`);
  }
  if (hints.email) {
    queryPaths.push(`/orders?customer_email=${encodeURIComponent(hints.email)}`);
  }
  if (hints.name) {
    queryPaths.push(`/orders?customer_name=${encodeURIComponent(hints.name)}`);
  }
  if (queryPaths.length === 0) return null;

  const token = getStoredToken();
  const opts = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  const matches = [];
  const seenIds = new Set();

  for (const path of queryPaths) {
    try {
      const payload = await secureFetch(appendIdentifier(path), opts);
      const rows = parseArray(payload);
      rows.forEach((row) => {
        const rowId = Number(row?.id);
        if (!Number.isFinite(rowId) || rowId <= 0 || seenIds.has(rowId)) return;
        if (!orderMatchesCustomerHints(row, hints)) return;
        const status = String(row?.status || "").toLowerCase();
        if (isTerminalOrderStatus(status)) return;
        seenIds.add(rowId);
        matches.push(row);
      });
    } catch {
      // Try the remaining query variants.
    }
  }

  if (matches.length === 0) return null;

  matches.sort((left, right) => {
    const leftTs = Math.max(
      toOrderTimestamp(left?.updated_at || left?.updatedAt),
      toOrderTimestamp(left?.created_at || left?.createdAt)
    );
    const rightTs = Math.max(
      toOrderTimestamp(right?.updated_at || right?.updatedAt),
      toOrderTimestamp(right?.created_at || right?.createdAt)
    );
    return rightTs - leftTs;
  });

  return matches[0] || null;
}, [appendIdentifier, getStoredToken, parseArray, storage]);
const parseOrderItemsPayload = useCallback((raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.order_items)) return raw.order_items;
  return [];
}, []);
const isPaidLikeOrderItem = (item) => {
  if (!item || typeof item !== "object") return false;
  const paymentStatus = String(
    item?.payment_status ?? item?.paymentStatus ?? item?.payment_state ?? item?.paymentState ?? ""
  ).toLowerCase();
  return Boolean(
    item?.paid === true ||
      item?.is_paid === true ||
      item?.paid_at ||
      item?.paidAt ||
      paymentStatus === "paid"
  );
};

const parseReservationDateTimeMs = (reservationDate, reservationTime) => {
  if (!reservationDate) return NaN;
  const dateRaw = String(reservationDate).trim();
  if (!dateRaw) return NaN;
  const timeRaw = reservationTime ? String(reservationTime).trim() : "00:00:00";
  const hhmmss = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Math.max(0, Math.min(23, Number(hhmmss[1])));
    const minutes = Math.max(0, Math.min(59, Number(hhmmss[2])));
    const seconds = Math.max(0, Math.min(59, Number(hhmmss[3] || 0)));
    const dateParts = dateRaw.split("-").map(Number);
    if (dateParts.length === 3 && dateParts.every((v) => Number.isFinite(v))) {
      const [year, month, day] = dateParts;
      return new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
    }
  }
  const fallback = new Date(`${dateRaw}T${timeRaw || "00:00:00"}`).getTime();
  return Number.isFinite(fallback) ? fallback : NaN;
};

const isReservationLikeEntry = (entry) => {
  if (!entry || typeof entry !== "object") return false;
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  const typeCandidates = [
    entry?.order_type,
    entry?.orderType,
    entry?.booking_type,
    entry?.bookingType,
    nested?.order_type,
    nested?.orderType,
    nested?.booking_type,
    nested?.bookingType,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const statusCandidates = [
    entry?.status,
    nested?.status,
    entry?.reservation_status,
    entry?.reservationStatus,
    nested?.reservation_status,
    nested?.reservationStatus,
  ]
    .map((value) => normalizeReservationStatus(value))
    .filter(Boolean);

  return Boolean(
    typeCandidates.includes("reservation") ||
      typeCandidates.includes("concert") ||
      typeCandidates.includes("concert_table") ||
      statusCandidates.includes("reserved") ||
      statusCandidates.includes("reservation") ||
      statusCandidates.includes("pending_bank_transfer") ||
      statusCandidates.includes("checked_in") ||
      statusCandidates.includes("checkedin") ||
      statusCandidates.includes("checkin") ||
    entry?.reservation_id ||
      entry?.reservationId ||
      entry?.reservation_date ||
      entry?.reservationDate ||
      entry?.reservation_time ||
      entry?.reservationTime ||
      entry?.reservation_status ||
      entry?.reservationStatus ||
      nested?.id ||
      nested?.reservation_id ||
      nested?.reservationId ||
      nested?.reservation_date ||
      nested?.reservationDate ||
      nested?.reservation_time ||
      nested?.reservationTime ||
      nested?.status ||
      nested?.reservation_status ||
      nested?.reservationStatus
  );
};

const getReservationSlotDateYmd = (entry) => {
  if (!entry || typeof entry !== "object") return "";
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  return normalizeEntryDateYmd(
    entry?.reservation_date ??
      entry?.reservationDate ??
      entry?.event_date ??
      entry?.eventDate ??
      nested?.reservation_date ??
      nested?.reservationDate ??
      nested?.event_date ??
      nested?.eventDate ??
      ""
  );
};

const isReservationDueNow = (entry, nowMs = Date.now()) => {
  if (!isReservationLikeEntry(entry)) return false;
  if (isCheckedInReservationEntry(entry)) return true;
  const reservationDate = entry?.reservation_date ?? entry?.reservationDate ?? null;
  const reservationTime = entry?.reservation_time ?? entry?.reservationTime ?? null;
  if (!reservationDate) return true;
  const scheduledMs = parseReservationDateTimeMs(reservationDate, reservationTime);
  if (!Number.isFinite(scheduledMs)) return true;
  return nowMs >= scheduledMs;
};

const hasActiveReservationPayload = (entry) => {
  if (!isReservationLikeEntry(entry)) return false;
  if (isCheckedInReservationEntry(entry)) return true;
  const bookingDateYmd = getReservationSlotDateYmd(entry);
  if (!bookingDateYmd) return true;
  return bookingDateYmd === formatCurrentLocalYmd();
};

const resolveReservationAwareStatus = (entry, fallbackStatus = null) => {
  if (!entry || typeof entry !== "object") {
    return normalizeReservationStatus(fallbackStatus);
  }
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  const directStatus = normalizeReservationStatus(entry?.status);
  const nestedStatus = normalizeReservationStatus(nested?.status);
  const flatReservationStatus = normalizeReservationStatus(
    entry?.reservation_status ??
      entry?.reservationStatus ??
      nested?.reservation_status ??
      nested?.reservationStatus
  );
  const fallback = normalizeReservationStatus(fallbackStatus);
  return directStatus || nestedStatus || flatReservationStatus || fallback;
};

const canCallWaiterForStatus = (value) => {
  const status = normalizeReservationStatus(value);
  return [
    "checked_in",
    "preparing",
    "ready",
    "on_road",
    "delivered",
    "served",
    "closed",
    "completed",
    "checked_out",
  ].includes(status);
};

const isCheckedInReservationEntry = (entry, fallbackStatus = null) => {
  if (!entry || typeof entry !== "object") return false;
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  const directStatus = normalizeReservationStatus(entry?.status);
  const nestedStatus = normalizeReservationStatus(nested?.status);
  const flatReservationStatus = normalizeReservationStatus(
    entry?.reservation_status ??
      entry?.reservationStatus ??
      nested?.reservation_status ??
      nested?.reservationStatus
  );
  const resolvedStatus = resolveReservationAwareStatus(entry, fallbackStatus);
  return (
    entry?.checked_in === true ||
    nested?.checked_in === true ||
    [directStatus, nestedStatus, flatReservationStatus, resolvedStatus].some((status) =>
    isCheckedInReservationStatus(status)
    )
  );
};

const isReservationPendingCheckIn = (entry, fallbackStatus = null, checkedInOrderIds = null) => {
  if (!entry || typeof entry !== "object") return false;
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  const status = resolveReservationAwareStatus(entry, fallbackStatus);
  const nestedStatus = normalizeReservationStatus(nested?.status);
  const flatReservationStatus = normalizeReservationStatus(
    entry?.reservation_status ??
      entry?.reservationStatus ??
      nested?.reservation_status ??
      nested?.reservationStatus
  );
  const hasReservationContext = hasActiveReservationPayload(entry);
  if (!hasReservationContext) return false;
  const orderIdValue =
    entry?.id ??
    entry?.order_id ??
    entry?.orderId ??
    nested?.id ??
    nested?.order_id ??
    nested?.orderId ??
    null;
  if (
    checkedInOrderIds &&
    typeof checkedInOrderIds.has === "function" &&
    checkedInOrderIds.has(Number(orderIdValue))
  ) {
    return false;
  }
  if (
    isCancelledLikeStatus(status) ||
    isCancelledLikeStatus(nestedStatus) ||
    isCancelledLikeStatus(flatReservationStatus)
  ) {
    return false;
  }
  if (isCheckedInReservationEntry(entry, fallbackStatus)) return false;
  const orderType = String(
    entry?.order_type ?? entry?.orderType ?? nested?.order_type ?? nested?.orderType ?? ""
  ).toLowerCase();
  if (
    status === "reserved" ||
    nestedStatus === "reserved" ||
    flatReservationStatus === "reserved" ||
    orderType === "reservation"
  ) {
    return true;
  }
  // Keep reservation lock for any pre-checkin state (including transient "paid/closed" before restore).
  return true;
};

  const {
    lang,
    setLang,
    t,
    showIosHelp,
    setShowIosHelp,
    showHelp,
    setShowHelp,
    platform,
    setPlatform,
    isIosSafariBrowser,
    isIosInAppBrowser,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    getSavedDeliveryInfo,
    handleInstallClick,
    handleDownloadQr,
  } = useQrMenuStorage({
    slug,
    id,
    QR_TOKEN_KEY,
    API_URL,
    restaurantIdentifierResolved,
    restaurantIdentifier,
    makeT,
    storage,
    getStoredToken,
    getPlatform,
    appendIdentifier,
  });

  const [brandName, setBrandName] = useState(
    () =>
      cachedBranding?.app_display_name ||
      cachedBranding?.title ||
      cachedBranding?.main_title ||
      ""
  );

  const [table, setTable] = useState(() => {
    // Prefer explicit table number from QR link, else start empty
    const fromUrl = getTableFromLocation();
    return fromUrl ?? null;
  });
  const [customerInfo, setCustomerInfo] = useState(null);
  const {
    categories,
    setCategories,
    products,
    setProducts,
    extrasGroups,
    setExtrasGroups,
    activeCategory,
    setActiveCategory,
    categoryImages,
    setCategoryImages,
    menuSearch,
    setMenuSearch,
    safeProducts,
    safeCategories,
    safeExtrasGroups,
    productsForGrid,
  } = useQrMenuProducts({
    API_URL,
    restaurantIdentifier,
    appendIdentifier,
    toArray,
  });
  const { cart, setCart, safeCart } = useQrMenuCart({ storage, toArray });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [reservedTables, setReservedTables] = useState([]);
  const [showStatus, setShowStatus] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);
  const [tables, setTables] = useState([]);
  const [isDarkMain, setIsDarkMain] = React.useState(false);
  const [orderCancelReason, setOrderCancelReason] = useState("");
  const orderIdToTableRef = useRef(new Map());
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [callWaiterCooldownUntil, setCallWaiterCooldownUntil] = useState(0);
  const [callWaiterTickMs, setCallWaiterTickMs] = useState(() => Date.now());

  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderScreenStatus, setOrderScreenStatus] = useState(null);
  const activeOrderRef = useRef(null);
  const orderIdRef = useRef(null);
  const tableRef = useRef(null);
  const checkedInOrdersRef = useRef(new Set());
  const refreshOccupiedTablesRef = useRef(null);
  const refreshOrderScreenStatusRef = useRef(null);
  const dismissReservationStatusLockRef = useRef(null);
  const isForcedStatusActive = useCallback(() => {
    const forced = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
    if (!forced) return false;
    const activeIdRaw = orderId || storage.getItem("qr_active_order_id");
    const activeId = Number(activeIdRaw);
    if (!Number.isFinite(activeId) || activeId <= 0) return false;
    return true;
  }, [orderId, storage]);
  const setLoyaltyEligibilityFromOrder = useCallback((order) => {
    if (!order) return;
    const status = String(order?.status || "").toLowerCase();
    const isClosed = status === "closed" || status === "completed";
    // In this system, a closed/completed order is treated as paid for loyalty purposes
    // (many cash orders go straight to "closed" without an intermediate "paid" state).
    const isPaid =
      isClosed ||
      status === "paid" ||
      String(order?.payment_status || "").toLowerCase() === "paid" ||
      String(order?.payment_state || "").toLowerCase() === "paid";

    try {
      const existingEligible = storage.getItem("qr_loyalty_eligible_order_id") || "";
      const stamped = storage.getItem("qr_loyalty_stamped_order_id") || "";

      if (isClosed && isPaid && order?.id) {
        storage.setItem("qr_loyalty_eligible_order_id", String(order.id));
      } else if (!existingEligible || existingEligible === stamped) {
        // Only clear when there's no outstanding eligible (un-stamped) order.
        storage.removeItem("qr_loyalty_eligible_order_id");
      }
      window.dispatchEvent(new Event("qr:loyalty-change"));
    } catch {}
  }, []);
  const markOrderCheckedIn = useCallback((orderLike) => {
    if (!orderLike || typeof orderLike !== "object") return;
    const candidates = [
      orderLike?.order_id,
      orderLike?.orderId,
      orderLike?.id,
      orderLike?.order?.id,
      orderLike?.order?.order_id,
      orderLike?.order?.orderId,
      orderLike?.reservation?.order_id,
      orderLike?.reservation?.orderId,
      orderLike?.reservation_id,
      orderLike?.reservationId,
      orderLike?.reservation?.id,
    ];
    candidates.forEach((value) => {
      const numericId = Number(value);
      if (Number.isFinite(numericId) && numericId > 0) {
        checkedInOrdersRef.current.add(numericId);
      }
    });
  }, []);
  const [orderType, setOrderType] = useState(() => {
    // For QR links we can pre-lock the flow
    const mode = getQrModeFromLocation();
    if (mode === "table") return "table";
    if (mode === "delivery") return "online";
    return null;
  });
  const [showTakeawayForm, setShowTakeawayForm] = useState(false);
  const [orderSelectCustomization, setOrderSelectCustomization] = useState(() => ({
    ...DEFAULT_QR_MENU_BRANDING,
    ...(cachedBranding || {}),
  }));

  // Load public customization to extract the brand title for header.
  useEffect(() => {
    if (!restaurantIdentifier) {
      setBrandName("");
      setOrderSelectCustomization({ ...DEFAULT_QR_MENU_BRANDING });
      return;
    }

    const applyCustomization = (nextCustomization) => {
      const customization =
        nextCustomization && typeof nextCustomization === "object" ? nextCustomization : {};

      setBrandName(
        customization?.app_display_name ||
          customization?.title ||
          customization?.main_title ||
          ""
      );
      setOrderSelectCustomization((prev) => ({
        ...DEFAULT_QR_MENU_BRANDING,
        ...prev,
        ...customization,
      }));

      try {
        const mode = String(customization?.qr_theme || "auto").toLowerCase();
        storage.setItem("qr_theme", mode);
      } catch {}
    };

    const cachedCustomization = readCachedQrMenuBranding(restaurantIdentifier);
    applyCustomization(cachedCustomization);

    (async () => {
      try {
        const res = await secureFetch(`/public/qr-menu-customization/${encodeURIComponent(restaurantIdentifier)}`);
        const c = res?.customization || {};
        writeCachedQrMenuBranding(restaurantIdentifier, c);
        applyCustomization(c);
      } catch (err) {
        // Ignore network failures and keep the cached brand if we have one.
      }
    })();

    if (typeof window === "undefined") return undefined;
    const cacheKey = getQrMenuBrandingCacheKey(restaurantIdentifier);

    const handleStorage = (event) => {
      if (event.key !== cacheKey) return;
      applyCustomization(readCachedQrMenuBranding(restaurantIdentifier));
    };

    const handleBrandingUpdate = (event) => {
      const eventIdentifier = String(event?.detail?.identifier || "").trim();
      if (eventIdentifier !== String(restaurantIdentifier || "").trim()) return;
      applyCustomization(
        event?.detail?.customization || readCachedQrMenuBranding(restaurantIdentifier)
      );
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(QR_MENU_BRANDING_UPDATED_EVENT, handleBrandingUpdate);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(QR_MENU_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, [restaurantIdentifier, storage]);

  // Apply QR theme to the transaction/menu (mobile-first) area.
  useEffect(() => {
    const mode = String(orderSelectCustomization?.qr_theme || storage.getItem("qr_theme") || "auto")
      .trim()
      .toLowerCase();
    if (mode === "dark") {
      setIsDarkMain(true);
      return;
    }
    if (mode === "light") {
      setIsDarkMain(false);
      return;
    }
    // auto
    try {
      const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
      setIsDarkMain(!!mq?.matches);
    } catch {
      setIsDarkMain(false);
    }
  }, [orderSelectCustomization?.qr_theme]);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
	const [pendingPopularProduct, setPendingPopularProduct] = useState(null);
	const [returnHomeAfterAdd, setReturnHomeAfterAdd] = useState(false);
	const [forceHome, setForceHome] = useState(false);
	const [showOrderTypePrompt, setShowOrderTypePrompt] = useState(false);
  const [shopIsOpen, setShopIsOpen] = useState(true);
	const [suppressMenuFlash, setSuppressMenuFlash] = useState(true);
	const tableScannerRef = useRef(null);
	const tableScanInFlight = useRef(false);
	const [showTableScanner, setShowTableScanner] = useState(false);
  const [tableScanTarget, setTableScanTarget] = useState(null);
  const [tableScanGuests, setTableScanGuests] = useState(() =>
    normalizeOptionalGuestCount(storage.getItem("qr_table_guests"))
  );
  const [tableScanReady, setTableScanReady] = useState(false);
  const [tableScanError, setTableScanError] = useState("");
  const deliveredResetRef = useRef({ orderId: null, timeoutId: null });

  const safeOccupiedTables = useMemo(() => toArray(occupiedTables), [occupiedTables]);
  const safeReservedTables = useMemo(() => toArray(reservedTables), [reservedTables]);
  const hasActiveOrder = useMemo(() => {
    if (activeOrder) {
      const s = (activeOrder.status || "").toLowerCase();
      if (!isTerminalOrderStatus(s)) return true;
    }
    const activeOrderId = Number(
      orderId || activeOrder?.id || storage.getItem("qr_active_order_id") || 0
    );
    return Number.isFinite(activeOrderId) && activeOrderId > 0;
  }, [activeOrder, orderId, storage]);
  const [qrVoiceListening, setQrVoiceListening] = useState(false);
  const [qrVoiceParsing, setQrVoiceParsing] = useState(false);
  const [qrVoiceTranscript, setQrVoiceTranscript] = useState("");
  const [qrVoiceResult, setQrVoiceResult] = useState(null);
  const [qrVoiceError, setQrVoiceError] = useState("");
  const [qrVoiceModalOpen, setQrVoiceModalOpen] = useState(false);
  const [qrVoiceLogId, setQrVoiceLogId] = useState(null);
  const qrVoiceRecognitionRef = useRef(null);
  const qrVoiceLanguage = useMemo(() => {
    return resolvePreferredLanguage({
      storage,
      preferred: lang,
      fallback: DEFAULT_LANGUAGE,
    });
  }, [lang]);
  const getQrSpeechRecognition = useCallback(() => {
    if (qrVoiceRecognitionRef.current !== null) return qrVoiceRecognitionRef.current;
    if (typeof window === "undefined") return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    qrVoiceRecognitionRef.current = SR || null;
    return qrVoiceRecognitionRef.current;
  }, []);
  const parseQrVoiceTranscript = useCallback(
    async (transcriptText) => {
      const text = String(transcriptText || "").trim();
      if (!text) return;
      setQrVoiceParsing(true);
      setQrVoiceError("");
      setQrVoiceResult(null);
      try {
        const token = getStoredToken();
        const response = await fetch(`${API_URL}/voice/parse-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            restaurant_identifier: restaurantIdentifier,
            transcript: text,
            language: qrVoiceLanguage,
            order_type: "table",
            table_id: table || null,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Voice parse failed");
        }
        const payload = await response.json();
        setQrVoiceResult(payload);
        setQrVoiceLogId(payload?.log_id || null);
      } catch (err) {
        console.error("❌ QR voice parse failed:", err);
        setQrVoiceError(err?.message || t("Voice parsing failed"));
      } finally {
        setQrVoiceParsing(false);
      }
    },
    [qrVoiceLanguage, restaurantIdentifier, table, t]
  );
  const startQrVoiceCapture = useCallback(() => {
    if (orderType !== "table") {
      setQrVoiceModalOpen(true);
      setQrVoiceError(t("Voice ordering is available for table orders."));
      return;
    }
    const SR = getQrSpeechRecognition();
    if (!SR) {
      setQrVoiceModalOpen(true);
      setQrVoiceError(t("Voice recognition not supported in this browser"));
      return;
    }
    setQrVoiceModalOpen(true);
    setQrVoiceError("");
    setQrVoiceResult(null);
    setQrVoiceTranscript("");
    const rec = new SR();
    rec.lang = qrVoiceLanguage || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    let safetyStop = null;
    rec.onstart = () => {
      setQrVoiceListening(true);
      safetyStop = window.setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 10000);
    };
    rec.onerror = (evt) => {
      setQrVoiceListening(false);
      setQrVoiceError(evt?.error || "Mic error");
    };
    rec.onend = () => {
      setQrVoiceListening(false);
      if (safetyStop) window.clearTimeout(safetyStop);
    };
    rec.onresult = (evt) => {
      const text = Array.from(evt.results || [])
        .map((r) => r?.[0]?.transcript || "")
        .join(" ")
        .trim();
      setQrVoiceTranscript(text);
      if (text) parseQrVoiceTranscript(text);
    };
    try {
      rec.start();
    } catch (err) {
      setQrVoiceListening(false);
      setQrVoiceError(err?.message || "Mic start failed");
    }
  }, [getQrSpeechRecognition, orderType, parseQrVoiceTranscript, qrVoiceLanguage, t]);
  const injectQrVoiceItemsToCart = useCallback(
    async (items) => {
      if (orderType === "table" && isReservationPendingCheckIn(activeOrder, orderScreenStatus, checkedInOrdersRef.current)) {
        setQrVoiceError(t("Items can be added after check-in."));
        return;
      }
      if (!Array.isArray(items) || items.length === 0) return;
      const byId = new Map(safeProducts.map((p) => [Number(p.id), p]));
      const byName = new Map(
        safeProducts.map((p) => [String(p?.name || "").toLowerCase(), p])
      );
      const nextItems = [];
      items.forEach((item) => {
        const product =
          byId.get(Number(item?.product_id)) ||
          byName.get(String(item?.product_name || "").toLowerCase());
        if (!product) return;
        const quantity = Math.max(1, Number(item?.quantity) || 1);
        const modifiers = Array.isArray(item?.modifiers) ? item.modifiers : [];
        const extras = [];
        const notes = [];
        modifiers.forEach((mod) => {
          const value = String(mod?.value || "").trim();
          if (!value) return;
          if (mod?.type === "remove") {
            notes.push(`${t("No")} ${value}`);
          } else {
            extras.push({ group: "Voice", name: value, quantity: 1, price: 0 });
          }
        });
        if (item?.size) notes.push(`${t("Size")}: ${item.size}`);
        nextItems.push({
          id: product.id,
          name: product.name,
          image: product.image,
          price: parseFloat(product.price) || 0,
          quantity,
          extras,
          note: notes.join(" • "),
          unique_id: `${product.id}-voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        });
      });
      if (nextItems.length === 0) {
        setQrVoiceError(t("Could not match items to the menu."));
        return;
      }
      setCart((prev) => [...toArray(prev), ...nextItems]);
      setQrVoiceModalOpen(false);
      setQrVoiceResult(null);
      setQrVoiceTranscript("");
      if (qrVoiceLogId) {
        try {
          const token = getStoredToken();
          await fetch(`${API_URL}/voice/logs/${qrVoiceLogId}/confirm`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              confirmed_json: { items },
              confidence_score: qrVoiceResult?.confidence_score ?? null,
            }),
          });
        } catch (err) {
          console.warn("voice log confirm failed:", err?.message);
        }
      }
    },
    [
      activeOrder,
      orderScreenStatus,
      orderType,
      qrVoiceLogId,
      qrVoiceResult?.confidence_score,
      safeProducts,
      setCart,
      t,
    ]
  );

  // 🥡 Pre-order (takeaway) fields
const [takeaway, setTakeaway] = useState({
  name: "",
  phone: "",
  email: "",
  pickup_date: "",
  pickup_time: "",
  mode: "reservation", // "pickup" | "reservation"
  table_number: "",
  notes: "",
  payment_method: "",
});
const {
  paymentMethod,
  setPaymentMethod,
  submitting,
  setSubmitting,
  handleSubmitOrder,
} = useQrMenuCheckout({
  storage,
  toArray,
  appendIdentifier,
  getStoredToken,
  getSavedDeliveryInfo,
  t,
  orderType,
  setOrderType,
  orderId,
  setOrderId,
  cart,
  setCart,
  customerInfo,
  setCustomerInfo,
  table,
  safeOccupiedTables,
  orderSelectCustomization,
  activeOrder,
  takeaway,
  setShowDeliveryForm,
  setShowStatus,
  setOrderStatus,
  setLastError,
});

const stopTableScanner = useCallback(async () => {
  const scanner = tableScannerRef.current;
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {}
  try {
    await scanner.clear();
  } catch {}
  tableScannerRef.current = null;
}, []);

const closeTableScanner = useCallback(() => {
  setShowTableScanner(false);
  setTableScanTarget(null);
  setTableScanReady(false);
  setTableScanError("");
  tableScanInFlight.current = false;
  stopTableScanner();
}, [stopTableScanner]);

const openTableScanner = useCallback((tableNumber, guests = 1) => {
  if (!tableNumber) return;
  setTableScanGuests(normalizeOptionalGuestCount(guests));
  setTableScanReady(false);
  setTableScanTarget(tableNumber);
  setTableScanError("");
  setShowTableScanner(true);
}, []);

const startTableScannerWithGuests = useCallback((guests) => {
  const normalized = normalizeOptionalGuestCount(guests);
  if (!normalized) return false;
  setTableScanGuests(normalized);
  storage.setItem("qr_table_guests", String(normalized));
  setTableScanError("");
  setTableScanReady(true);
  return true;
}, [storage]);

const syncTableGuestsFromQr = useCallback(
  async (tableNumber, guests) => {
    const normalizedTable = Number(tableNumber);
    const normalizedGuests = normalizeOptionalGuestCount(guests);
    if (!Number.isFinite(normalizedTable) || normalizedTable <= 0 || !normalizedGuests) return;
    try {
      await secureFetch(appendIdentifier(`/tables/${normalizedTable}`), {
        method: "PATCH",
        body: JSON.stringify({ guests: normalizedGuests }),
      });
    } catch (err) {
      // Public QR flows may not have staff auth; ignore and rely on order reservation fallback.
      console.warn("⚠️ QR guest sync to table config failed:", err?.message || err);
    }
  },
  [appendIdentifier]
);

const selectTableDirectly = useCallback((tableNumber, guests = 1) => {
  const normalizedTable = Number(tableNumber);
  if (!Number.isFinite(normalizedTable) || normalizedTable <= 0) return false;
  const normalizedGuests = clampGuestCount(guests, 1);
  setShowTableScanner(false);
  setTableScanTarget(null);
  setTableScanReady(false);
  setTableScanError("");
  setTable(normalizedTable);
  saveSelectedTable(normalizedTable);
  storage.setItem("qr_table_guests", String(normalizedGuests));
  syncTableGuestsFromQr(normalizedTable, normalizedGuests);
  return true;
}, [saveSelectedTable, setTable, storage, syncTableGuestsFromQr]);

const handleTableScanSuccess = useCallback(
  (decodedText) => {
    if (tableScanInFlight.current) return;
    const scannedTable = extractTableNumberFromQrText(decodedText);
    if (!scannedTable) {
      setTableScanError(t("Invalid table QR code."));
      return;
    }
    if (tableScanTarget && Number(scannedTable) !== Number(tableScanTarget)) {
      setTableScanError(
        `${t("This QR is for table")} ${scannedTable}. ${t("Please scan table")} ${tableScanTarget}.`
      );
      return;
    }
    tableScanInFlight.current = true;
    const finalTable = tableScanTarget || scannedTable;
    stopTableScanner().finally(() => {
      const normalizedGuests = clampGuestCount(tableScanGuests, 1);
      setShowTableScanner(false);
      setTableScanError("");
      setTableScanReady(false);
      setTable(finalTable);
      saveSelectedTable(finalTable);
      storage.setItem("qr_table_guests", String(normalizedGuests));
      syncTableGuestsFromQr(finalTable, normalizedGuests);
      tableScanInFlight.current = false;
    });
  },
  [
    saveSelectedTable,
    setTable,
    stopTableScanner,
    storage,
    syncTableGuestsFromQr,
    t,
    tableScanGuests,
    tableScanTarget,
  ]
);
  const resetToTypePicker = (options = null) => {
    const forceManualClose = options?.allowForceClose === true;
    if (isForcedStatusActive() && !forceManualClose) {
      setShowStatus(true);
      storage.setItem("qr_show_status", "1");
      return;
    }
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
    storage.removeItem(DELIVERY_REORDER_CONTEXT_KEY);
    storage.removeItem("qr_active_order_id");
    storage.removeItem("qr_active_order");
    setOrderStatus("pending");
    setOrderId(null);
    setCart([]);
    setCustomerInfo(null);
    if (qrMode === "table") {
      // In table mode always stay in table flow
      const urlTable = initialTableFromUrl;
      if (urlTable) {
        setTable(urlTable);
        saveSelectedTable(urlTable);
      } else {
        setTable(null); // will re-open table selector
      }
      setOrderType("table");
    } else if (qrMode === "delivery") {
      // Delivery QR only supports online orders
      setTable(null);
      setOrderType("online");
    } else {
      // Generic QR menu → back to type chooser
      setTable(null);
      setOrderType(null);
    }
    setActiveOrder(null);
    setOrderScreenStatus(null);
  };
const [showOrderStatus, setShowOrderStatus] = useState(false);
const loadTables = async () => {
  if (!restaurantIdentifier) {
    setTables([]);
    return;
  }

  try {
    let rows = [];
    let configuredAreaNames = [];
    try {
      // Public QR menu must use public tables endpoint (no auth token required).
      const publicTables = await secureFetch(
        appendIdentifier(`/public/tables/${encodeURIComponent(restaurantIdentifier)}`)
      );
      rows = Array.isArray(publicTables) ? publicTables : publicTables?.data || [];

      const token = getStoredToken();
      if (token) {
        try {
          // Keep QR table settings aligned with TableOverview/Settings source of truth
          // only when an authenticated dashboard token exists.
          const tableSettings = await secureFetch(appendIdentifier("/settings/tables"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          configuredAreaNames = Array.isArray(tableSettings?.areaNames)
            ? tableSettings.areaNames.map(normalizeConfiguredAreaName).filter(Boolean)
            : [];
        } catch {
          configuredAreaNames = readCachedTableAreaNames(restaurantIdentifier);
        }
      } else {
        configuredAreaNames = readCachedTableAreaNames(restaurantIdentifier);
      }
    } catch {
      const res = await fetch(
        `${API_URL}/public/tables/${encodeURIComponent(restaurantIdentifier)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      rows = Array.isArray(payload) ? payload : payload.data || [];
      configuredAreaNames = readCachedTableAreaNames(restaurantIdentifier);
    }

    const validAreaNames = configuredAreaNames.map(normalizeConfiguredAreaName).filter(Boolean);
    const validAreaKeys = new Set(validAreaNames.map((value) => value.toLowerCase()));
    const fallbackAreaName =
      validAreaNames.find((value) => value.toLowerCase() === "main hall") || validAreaNames[0] || "Main Hall";

    const normalized = rows.map((r) => {
      const rawArea = normalizeConfiguredAreaName(r.area || "");
      const resolvedArea =
        validAreaKeys.size > 0 && rawArea && !validAreaKeys.has(rawArea.toLowerCase())
          ? fallbackAreaName
          : rawArea || fallbackAreaName;

      return {
        tableNumber: r.number ?? r.tableNumber ?? r.table_number,
        area: resolvedArea,
        seats: r.seats || r.chairs || 0,
        guests:
          r.guests === null || r.guests === undefined || r.guests === ""
            ? null
            : Number(r.guests),
        label: r.label || "",
        color: r.color || "",
        // Occupied/reserved must come from active orders only.
        // Keep explicit table lock flags for blocked/maintenance state.
        isLocked: Boolean(r.locked ?? r.is_locked ?? r.isLocked),
        active: r.active ?? true,
      };
    });

    setTables(normalized.filter((t) => t.active !== false));
  } catch (err) {
    console.warn("⚠️ Failed to fetch tables:", err);
    setTables([]);
  }
};
useEffect(() => {
  if (!showTableScanner || !tableScanReady) return;
  let active = true;
  const start = async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!active) return;
      const scanner = new Html5Qrcode("qr-table-reader");
      tableScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (!active) return;
          handleTableScanSuccess(decodedText);
        },
        () => {}
      );
    } catch (err) {
      if (!active) return;
      setTableScanError(t("Camera permission is required."));
    }
  };
  start();
  return () => {
    active = false;
    stopTableScanner();
  };
}, [handleTableScanSuccess, showTableScanner, stopTableScanner, t, tableScanReady]);

useEffect(() => {
  const timer = setTimeout(() => setSuppressMenuFlash(false), 250);
  return () => clearTimeout(timer);
}, []);

const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 1280;
});

useEffect(() => {
  const handleResize = () => {
    if (typeof window === "undefined") return;
    setIsDesktopLayout(window.innerWidth >= 1280);
  };
  handleResize();
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);
  // show Delivery Info form first, every time Delivery is chosen
useEffect(() => {
  const hasActive = !!(orderId || storage.getItem("qr_active_order_id"));
  if (orderType === "online" && !hasActive) {
    setShowDeliveryForm(true);
  }
}, [orderType, orderId]);






// -- clear saved table ONLY when no items in cart and no active order
function resetTableIfEmptyCart() {
  const count = safeCart.length;
  const hasActive = !!(orderId || storage.getItem("qr_active_order_id"));
  if (count === 0 && !hasActive) {
    try {
      storage.removeItem("qr_table");
      storage.removeItem("qr_selected_table");
      storage.removeItem("qr_orderType");
    } catch {}
    // let any listeners react instantly (if you add one later)
    window.dispatchEvent(new Event("qr:table-reset"));
  }
}


// when user taps the header “×”
// ✅ Updated handleCloseOrderPage
async function handleCloseOrderPage() {
  if (isForcedStatusActive()) {
    setShowStatus(true);
    storage.setItem("qr_show_status", "1");
    return;
  }
  const statusLower = String(orderScreenStatus || activeOrder?.status || "").toLowerCase();
  const cancelledLikeStatus = isCancelledLikeStatus(statusLower);
  const activeOrderId =
    Number(
      orderId ||
        storage.getItem("qr_active_order_id") ||
        (cancelledLikeStatus ? activeOrder?.id : null)
    ) || null;
  const hasCartItems = Array.isArray(cart) && cart.length > 0;

  // Requested behavior:
  // - If there is an active order, show order status.
  // - If cart has items (but no active order), reopen cart.
  // - If cart is empty, go home.
  if (activeOrderId) {
    setOrderId(activeOrderId);
    storage.setItem("qr_active_order_id", String(activeOrderId));
    setOrderStatus("success");
    setShowStatus(true);
    storage.setItem("qr_show_status", "1");
    window.dispatchEvent(new Event("qr:cart-close"));
    return;
  }

  if (hasCartItems) {
    setShowStatus(false);
    window.dispatchEvent(new Event("qr:cart-open"));
    return;
  }

  if (!hasCartItems) {
    resetTableIfEmptyCart();
    resetToTypePicker();
    return;
  }
}



// Bootstrap on refresh: restore by saved order id, else by saved table
// Bootstrap on refresh: restore by saved order id, else by saved table
useEffect(() => {
  (async () => {
    try {
      const activeId = storage.getItem("qr_active_order_id");
      const hasSavedActiveOrder = Boolean(activeId);
      const savedOrderType = String(storage.getItem("qr_orderType") || "").toLowerCase();
      const forceStatusOpen = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
      const shouldAutoOpenSavedStatus =
        hasSavedActiveOrder &&
        (qrMode === "table" ||
          savedOrderType === "table" ||
          (Number.isFinite(Number(initialTableFromUrl)) && Number(initialTableFromUrl) > 0));
      const wantsStatusOpen =
        forceStatusOpen || storage.getItem("qr_show_status") === "1" || shouldAutoOpenSavedStatus;
      const skipRestoreOnRefresh = !qrMode && !initialTableFromUrl;

      // On a normal refresh (no explicit table/delivery mode), always land on the home page
      // and do not re-open status/menu from prior sessions. This avoids "blink" loops.
      if (skipRestoreOnRefresh && !forceStatusOpen && !hasSavedActiveOrder) {
        setShowStatus(false);
        storage.setItem("qr_show_status", "0");
        storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
        setOrderStatus("pending");
        setOrderId(null);
        setActiveOrder(null);
        setOrderScreenStatus(null);
        setOrderCancelReason("");
        setTable(null);
        setOrderType(null);
        setShowDeliveryForm(false);
        setShowTakeawayForm(false);
        setShowAddModal(false);
        setSelectedProduct(null);
        setPendingPopularProduct(null);
        setShowOrderTypePrompt(false);
        try {
          storage.removeItem("qr_active_order_id");
          storage.removeItem("qr_orderType");
          storage.removeItem("qr_table");
          storage.removeItem("qr_selected_table");
        } catch {}
        return;
      }

      // helper: true if ALL items are delivered
     // helper: true if ALL items are delivered
	async function allItemsDelivered(id) {
  try {
    const token = getStoredToken();
    if (!token) return false;
    const ir = await secureFetch(appendIdentifier(`/orders/${id}/items`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ir.ok) return false;

    const raw = await ir.json();
    const arr = Array.isArray(raw) ? raw : [];

    // ✅ Empty or missing items → treat as not delivered
    if (!arr || arr.length === 0) return false;

    // ✅ Only mark delivered when all have final kitchen statuses
    return arr.every((it) => {
      const ks = (it.kitchen_status || "").toLowerCase();
      return ["delivered", "served", "ready"].includes(ks);
    });
  } catch {
    return false;
  }
}


// --- Resolve token from either URL or local storage ---
const urlToken =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;

const storedToken = getStoredToken();
const token = urlToken || storedToken;

// 1️⃣ If we have a saved active order id, prefer that
let order = null;
if (activeId) {
  try {
    order = await secureFetch(appendIdentifier(`/orders/${activeId}`), {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  } catch (err) {
    console.warn("⚠️ Failed to restore active order:", err);
  }
}


  if (order) {
    const status = (order?.status || "").toLowerCase();
    const shouldKeepFetchedActiveOrder =
      isReservationPendingCheckIn(order, status, checkedInOrdersRef.current) ||
      !isTerminalOrderStatus(status);
    if (!shouldKeepFetchedActiveOrder) {
      order = null;
      storage.removeItem("qr_active_order_id");
      storage.removeItem("qr_active_order");
    }
  }

  if (order) {
    const status = (order?.status || "").toLowerCase();
    const reservationAwareStatus = resolveReservationAwareStatus(order, status);
    if (isCheckedInReservationEntry(order, reservationAwareStatus)) {
      markOrderCheckedIn(order);
    }
    const stickyStatus =
      Number.isFinite(Number(order?.id)) && checkedInOrdersRef.current.has(Number(order?.id))
        ? "checked_in"
        : reservationAwareStatus;

    // Restore the active order, but don't pop "Order Sent" on refresh unless user had it open.
    setOrderStatus("success");
    setShowStatus(wantsStatusOpen);
    storage.setItem("qr_show_status", wantsStatusOpen ? "1" : "0");

    setActiveOrder(order);
    setOrderScreenStatus(stickyStatus || null);
    setLoyaltyEligibilityFromOrder(order);
    setOrderCancelReason((prev) =>
      isCancelledLikeStatus(reservationAwareStatus)
        ? resolveCancellationReason(getOrderCancellationReason(order), prev)
        : ""
    );

    const normalizedOrderType = String(order?.order_type || "").toLowerCase();
    const type =
      normalizedOrderType === "table" || normalizedOrderType === "reservation"
        ? "table"
        : "online";
    setOrderType(type);
    setTable(type === "table" ? Number(order.table_number) || null : null);
    setOrderId(order.id);

    return;
  }


      // 2️⃣ Fallback: see if a saved table has an open (non-closed) order
      const savedTable =
        Number(
          storage.getItem("qr_table") ||
            storage.getItem("qr_selected_table") ||
            "0"
        ) || null;
if (savedTable) {
  const token = getStoredToken();
  try {
    const q = await secureFetch(appendIdentifier(`/orders?table_number=${savedTable}`), {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });

    const list = parseArray(q);
    const hasReservationEntries = list.some((entry) => hasActiveReservationPayload(entry));

    const openOrder =
      list.find((o) => {
        const statusLower = String(o?.status || "").toLowerCase();
        if (isTerminalOrderStatus(statusLower)) return false;
        return isCheckedInReservationEntry(o, statusLower);
      }) ||
      list.find((o) => {
        const statusLower = String(o?.status || "").toLowerCase();
        if (isTerminalOrderStatus(statusLower)) return false;
        return isReservationPendingCheckIn(o, statusLower, checkedInOrdersRef.current);
      }) ||
      ((forceStatusOpen || hasReservationEntries)
        ? null
        : list.find((o) => !isTerminalOrderStatus((o?.status || "").toLowerCase()))) ||
      null;

	        if (openOrder) {
          const status = (openOrder?.status || "").toLowerCase();
          const reservationAwareStatus = resolveReservationAwareStatus(openOrder, status);
          if (isCheckedInReservationEntry(openOrder, reservationAwareStatus)) {
            markOrderCheckedIn(openOrder);
          }
          const stickyStatus =
            Number.isFinite(Number(openOrder?.id)) &&
            checkedInOrdersRef.current.has(Number(openOrder?.id))
              ? "checked_in"
              : reservationAwareStatus;

		          // Restore the active order, but don't pop "Order Sent" on refresh unless user had it open.
		          setOrderType("table");
		          setTable(savedTable);
          setOrderId(openOrder.id);
		          setOrderStatus("success");
		          setShowStatus(wantsStatusOpen);
              storage.setItem("qr_show_status", wantsStatusOpen ? "1" : "0");

        setActiveOrder(openOrder);
		          setOrderScreenStatus(stickyStatus || null);
          setOrderCancelReason((prev) =>
            isCancelledLikeStatus(stickyStatus)
              ? resolveCancellationReason(getOrderCancellationReason(openOrder), prev)
              : ""
          );

	        storage.setItem("qr_active_order_id", String(openOrder.id));
	        storage.setItem("qr_orderType", "table");
	        return;
	    }
	  } catch (err) {
      console.warn("⚠️ Failed to restore table order:", err);
  }
}

      // 3️⃣ Fallback: if the user re-logged in and the active order id is gone,
      // rebuild status context from the current customer session.
      const sessionOrder = await resolveActiveOrderFromCustomerSession();
      if (sessionOrder) {
        const status = String(sessionOrder?.status || "").toLowerCase();
        const reservationAwareStatus = resolveReservationAwareStatus(sessionOrder, status);
        if (isCheckedInReservationEntry(sessionOrder, reservationAwareStatus)) {
          markOrderCheckedIn(sessionOrder);
        }
        const stickyStatus =
          Number.isFinite(Number(sessionOrder?.id)) &&
          checkedInOrdersRef.current.has(Number(sessionOrder?.id))
            ? "checked_in"
            : reservationAwareStatus;
        const normalizedOrderType = String(sessionOrder?.order_type || "").toLowerCase();
        const nextOrderType =
          normalizedOrderType === "table" || normalizedOrderType === "reservation"
            ? "table"
            : "online";
        const nextTable =
          nextOrderType === "table" ? Number(sessionOrder?.table_number || sessionOrder?.tableNumber) || null : null;

        setOrderStatus("success");
        setShowStatus(wantsStatusOpen);
        storage.setItem("qr_show_status", wantsStatusOpen ? "1" : "0");
        setActiveOrder(sessionOrder);
        setOrderScreenStatus(stickyStatus || null);
        setLoyaltyEligibilityFromOrder(sessionOrder);
        setOrderCancelReason((prev) =>
          isCancelledLikeStatus(reservationAwareStatus)
            ? resolveCancellationReason(getOrderCancellationReason(sessionOrder), prev)
            : ""
        );
        setOrderType(nextOrderType);
        setTable(nextTable);
        setOrderId(sessionOrder.id);
        storage.setItem("qr_active_order_id", String(sessionOrder.id));
        storage.setItem("qr_orderType", nextOrderType);
        if (nextOrderType === "table" && Number.isFinite(Number(nextTable)) && Number(nextTable) > 0) {
          storage.setItem("qr_table", String(nextTable));
          storage.setItem("qr_selected_table", String(nextTable));
        }
        return;
      }


      // 4️⃣ Nothing to restore
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
      resetToTypePicker();
    } catch (err) {
      console.error("❌ QRMenu restore failed:", err);
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
      resetToTypePicker();
    }
  })();
}, [appendIdentifier, getStoredToken, initialTableFromUrl, qrMode, resolveActiveOrderFromCustomerSession]);

  const dismissReservationStatusLock = useCallback(
    ({ clearActiveOrder = false, keepStatusOpen = false } = {}) => {
      storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
      storage.setItem("qr_show_status", keepStatusOpen ? "1" : "0");
      setShowStatus(Boolean(keepStatusOpen));
      setOrderCancelReason("");
      if (!clearActiveOrder) return;
      storage.removeItem("qr_active_order_id");
      storage.removeItem("qr_active_order");
      setOrderId(null);
      setActiveOrder(null);
      setOrderScreenStatus(null);
      setOrderStatus("pending");
    },
    [
      setActiveOrder,
      setOrderCancelReason,
      setOrderId,
      setOrderStatus,
      setShowStatus,
      storage,
    ]
  );

  // 🔄 Keep a lightweight, real-time summary of the active order status
  const refreshOrderScreenStatus = useCallback(async () => {
    if (!orderId) return;
    try {
      const token = getStoredToken();
      const opts = token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {};
      const data = await secureFetch(appendIdentifier(`/orders/${orderId}`), opts);
      setActiveOrder(data || null);
      setLoyaltyEligibilityFromOrder(data || null);

      const s = (data?.status || "").toLowerCase();
      const reservationAwareStatus = resolveReservationAwareStatus(data, s);
      if (isCheckedInReservationEntry(data, reservationAwareStatus)) {
        markOrderCheckedIn(data);
      }
      const reservationPendingLockContext = isReservationPendingCheckIn(
        data,
        reservationAwareStatus,
        checkedInOrdersRef.current
      );
      const forceActive = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
      const wantsStatusOpen = storage.getItem("qr_show_status") === "1";
      const reservationStillActive = hasActiveReservationPayload(data);
      if (!s) {
        setOrderScreenStatus(null);
        return;
      }
      const isTerminalStatus = isTerminalOrderStatus(s);
      if (isTerminalStatus) {
        const resolvedTableNo = Number(
          data?.table_number ??
            data?.tableNumber ??
            tableRef.current ??
            storage.getItem("qr_table") ??
            storage.getItem("qr_selected_table") ??
            0
        );
        if (Number.isFinite(resolvedTableNo) && resolvedTableNo > 0) {
          try {
            const tableOrdersRaw = await secureFetch(
              appendIdentifier(`/orders?table_number=${resolvedTableNo}`),
              opts
            );
            const tableOrders = parseArray(tableOrdersRaw);
            const currentOrderId = Number(orderId || data?.id || 0);
            const checkedInReplacement =
              tableOrders.find((entry) => {
                const entryId = Number(entry?.id);
                if (!Number.isFinite(entryId) || entryId <= 0) return false;
                if (Number.isFinite(currentOrderId) && entryId === currentOrderId) return false;
                const statusLower = String(entry?.status || "").toLowerCase();
                if (isTerminalOrderStatus(statusLower)) return false;
                return isCheckedInReservationEntry(entry, statusLower);
              }) || null;
            const reservationPendingReplacement =
              tableOrders.find((entry) => {
                const entryId = Number(entry?.id);
                if (!Number.isFinite(entryId) || entryId <= 0) return false;
                if (Number.isFinite(currentOrderId) && entryId === currentOrderId) return false;
                const statusLower = String(entry?.status || "").toLowerCase();
                if (isTerminalOrderStatus(statusLower)) return false;
                return isReservationPendingCheckIn(
                  entry,
                  statusLower,
                  checkedInOrdersRef.current
                );
              }) || null;
            const keepReservationLockContext =
              forceActive ||
              reservationPendingLockContext ||
              (reservationStillActive &&
                !isCheckedInReservationEntry(data, reservationAwareStatus));
            const replacementOrder =
              checkedInReplacement ||
              reservationPendingReplacement ||
              (keepReservationLockContext
                ? null
                : tableOrders.find((entry) => {
                    const entryId = Number(entry?.id);
                    if (!Number.isFinite(entryId) || entryId <= 0) return false;
                    if (Number.isFinite(currentOrderId) && entryId === currentOrderId) return false;
                    return !isTerminalOrderStatus(String(entry?.status || "").toLowerCase());
                  })) ||
              null;

            if (replacementOrder) {
              const replacementId = Number(replacementOrder.id);
              if (Number.isFinite(replacementId) && replacementId > 0) {
                const replacementStatus = resolveReservationAwareStatus(
                  replacementOrder,
                  String(replacementOrder?.status || "").toLowerCase()
                );
                if (isCheckedInReservationEntry(replacementOrder, replacementStatus)) {
                  markOrderCheckedIn(replacementOrder);
                }
                setOrderId(replacementId);
                setActiveOrder(replacementOrder);
                setOrderScreenStatus(
                  checkedInOrdersRef.current.has(replacementId)
                    ? "checked_in"
                    : replacementStatus || null
                );
                setOrderCancelReason((prev) =>
                  isCancelledLikeStatus(replacementStatus)
                    ? resolveCancellationReason(getOrderCancellationReason(replacementOrder), prev)
                    : ""
                );
                setLoyaltyEligibilityFromOrder(replacementOrder);
                storage.setItem("qr_active_order_id", String(replacementId));
                storage.setItem(
                  "qr_orderType",
                  String(
                    replacementOrder?.order_type ||
                      replacementOrder?.orderType ||
                      "table"
                  ).toLowerCase() === "reservation"
                    ? "table"
                    : String(replacementOrder?.order_type || replacementOrder?.orderType || "table")
                );
                if (wantsStatusOpen) {
                  setShowStatus(true);
                  storage.setItem("qr_show_status", "1");
                }
                setOrderStatus("success");
                return;
              }
            }
          } catch (fallbackErr) {
            console.warn("⚠️ Failed to resolve replacement order for terminal QR order:", fallbackErr);
          }
        }
      }
      if (!isTerminalStatus && reservationPendingLockContext) {
        const resolvedTableNo = Number(
          data?.table_number ??
            data?.tableNumber ??
            tableRef.current ??
            storage.getItem("qr_table") ??
            storage.getItem("qr_selected_table") ??
            0
        );
        if (Number.isFinite(resolvedTableNo) && resolvedTableNo > 0) {
          try {
            const tableOrdersRaw = await secureFetch(
              appendIdentifier(`/orders?table_number=${resolvedTableNo}`),
              opts
            );
            const tableOrders = parseArray(tableOrdersRaw);
            const currentOrderId = Number(orderId || data?.id || 0);
            const checkedInOrder =
              tableOrders.find((entry) => {
                const entryId = Number(entry?.id);
                if (!Number.isFinite(entryId) || entryId <= 0) return false;
                if (Number.isFinite(currentOrderId) && entryId === currentOrderId) return false;
                return isCheckedInReservationEntry(
                  entry,
                  String(entry?.status || "").toLowerCase()
                );
              }) || null;
            if (checkedInOrder) {
              const checkedInId = Number(checkedInOrder.id);
                if (Number.isFinite(checkedInId) && checkedInId > 0) {
                  const checkedInStatus = resolveReservationAwareStatus(
                    checkedInOrder,
                    String(checkedInOrder?.status || "").toLowerCase()
                  );
                  markOrderCheckedIn(checkedInOrder);
                  setOrderId(checkedInId);
                  setActiveOrder(checkedInOrder);
                  setOrderScreenStatus(checkedInStatus || "checked_in");
                setOrderCancelReason((prev) =>
                  isCancelledLikeStatus(checkedInStatus)
                    ? resolveCancellationReason(getOrderCancellationReason(checkedInOrder), prev)
                    : ""
                );
                setLoyaltyEligibilityFromOrder(checkedInOrder);
                storage.setItem("qr_active_order_id", String(checkedInId));
                storage.setItem("qr_orderType", "table");
                if (wantsStatusOpen) {
                  setShowStatus(true);
                  storage.setItem("qr_show_status", "1");
                }
                setOrderStatus("success");
                return;
              }
            }
          } catch (promoteErr) {
            console.warn("⚠️ Failed to resolve checked-in table order:", promoteErr);
          }
        }
      }
      const finalReservationStatus = reservationAwareStatus;
      if (isCheckedInReservationEntry(data, finalReservationStatus)) {
        markOrderCheckedIn(data);
      }
      const stickyCheckedIn =
        Number.isFinite(Number(orderId)) &&
        checkedInOrdersRef.current.has(Number(orderId));
      const finalStatus = stickyCheckedIn ? "checked_in" : finalReservationStatus;
      setOrderScreenStatus(finalStatus || null);
      const keepCheckoutCompletionVisible =
        isTerminalStatus && (s === "closed" || s === "completed");
      if (forceActive && !reservationStillActive) {
        if (keepCheckoutCompletionVisible) {
          storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
          if (wantsStatusOpen) {
            setShowStatus(true);
            storage.setItem("qr_show_status", "1");
          }
        } else {
          dismissReservationStatusLock({
            clearActiveOrder: isTerminalStatus,
            keepStatusOpen: !isTerminalStatus,
          });
          if (isTerminalStatus) {
            return;
          }
        }
      }
      if (forceActive && reservationStillActive) {
        // Respect explicit user hide (e.g. opening cart from status screen)
        // for all reservation-lock states, not only "reserved".
        if (wantsStatusOpen) {
          setShowStatus(true);
          storage.setItem("qr_show_status", "1");
        } else {
          setShowStatus(false);
        }
      }
      setOrderCancelReason((prev) =>
        isCancelledLikeStatus(reservationAwareStatus)
          ? resolveCancellationReason(getOrderCancellationReason(data), prev)
          : ""
      );

      // Keep status visible for cancelled/closed only when user didn't intentionally hide it.
      // This prevents status-vs-cart flicker when opening cart from the bottom nav.
      if (isTerminalStatus) {
        const shouldKeepOpen = storage.getItem("qr_show_status") === "1";
        if (shouldKeepOpen) {
          setShowStatus(true);
          storage.setItem("qr_show_status", "1");
        }
        setOrderStatus("success");
      }

      if (import.meta.env.DEV) {
        console.info("[QR] refreshOrderScreenStatus", {
          orderId,
          status: s,
          cancel_reason:
            data?.cancellation_reason || data?.cancel_reason || data?.cancelReason || null,
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to refresh QR order status:", err);
    }
  }, [
    orderId,
    appendIdentifier,
    dismissReservationStatusLock,
    parseArray,
    storage,
    getStoredToken,
    setLoyaltyEligibilityFromOrder,
  ]);

  // Listen to kitchen/order events over Socket.IO and refresh summary
  useOrderSocket(refreshOrderScreenStatus, orderId);

  // Also refresh once whenever orderId changes (e.g. after first submit)
	useEffect(() => {
    refreshOrderScreenStatus();
  }, [refreshOrderScreenStatus]);

  useEffect(() => {
    return () => {
      if (deliveredResetRef.current.timeoutId) {
        window.clearTimeout(deliveredResetRef.current.timeoutId);
      }
    };
  }, []);


  const refreshOccupiedTables = useCallback(async () => {
    const nextOccupiedKeys = new Set();
    const nextReservedKeys = new Set();

    try {
      const token = getStoredToken();
      if (!token) {
        setOccupiedTables([]);
        setReservedTables([]);
        return;
      }

      const ordersPayload = await sFetch("/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const orders = parseArray(ordersPayload);

      const table10Input = [];
      toArray(orders).forEach((order) => {
        const tableKey = getOrderTableNumberKey(order);
        if (!tableKey) return;
        const normalizedStatus = resolveReservationAwareStatus(
          order,
          String(order?.status ?? order?.order_status ?? "")
            .trim()
            .toLowerCase()
        );
        const reservationLike = isReservationLikeEntry(order);
        const reservationActive = reservationLike && hasActiveReservationPayload(order);
        const reservationOccupiesNow =
          reservationActive &&
          !isTerminalOrderStatus(normalizedStatus) &&
          !isCancelledLikeStatus(normalizedStatus);
        if (isTable10(tableKey)) {
          table10Input.push({
            id: order?.id ?? null,
            status: normalizedStatus,
            table_number:
              order?.table_number ??
              order?.tableNumber ??
              order?.table_id ??
              order?.tableId ??
              order?.table ??
              null,
            reservationLike,
            reservationActive,
            reservationOccupiesNow,
          });
        }
        if (!isActiveTableOrderStatus(normalizedStatus) && !reservationOccupiesNow) return;
        nextOccupiedKeys.add(tableKey);
      });

      try {
        const nextMap = new Map();
        toArray(orders).forEach((order) => {
          const orderId = Number(order?.id);
          const tableKey = getOrderTableNumberKey(order);
          const tableNo = Number(tableKey);
          if (Number.isFinite(orderId) && Number.isFinite(tableNo) && tableNo > 0) {
            nextMap.set(orderId, tableNo);
          }
        });
        orderIdToTableRef.current = nextMap;
      } catch {}

      const occupiedNumbers = Array.from(nextOccupiedKeys)
        .map((value) => Number(value))
        .filter((n) => Number.isFinite(n) && n > 0);
      const reservedNumbers = Array.from(nextReservedKeys)
        .map((value) => Number(value))
        .filter((n) => Number.isFinite(n) && n > 0);

      if (import.meta.env.DEV) {
        const table10Output =
          occupiedNumbers.includes(10) || reservedNumbers.includes(10)
            ? {
                occupied: occupiedNumbers,
                reserved: reservedNumbers,
              }
            : null;
        if (table10Input.length > 0 || table10Output) {
          console.warn("[table10-debug][floor-map][input-output]", {
            inputOrders: table10Input,
            output: table10Output,
          });
        }
      }

      setOccupiedTables(occupiedNumbers);
      setReservedTables(reservedNumbers);
    } catch (err) {
      console.warn("⚠️ Failed to refresh occupied tables:", err);
      setOccupiedTables([]);
      setReservedTables([]);
    }
  }, [getStoredToken, parseArray, sFetch, toArray]);

  useEffect(() => {
    const handleTableLockUpdated = (event) => {
      const tableNumber = Number(event?.detail?.table_number);
      const locked = Boolean(event?.detail?.locked);
      if (!Number.isFinite(tableNumber) || tableNumber <= 0) return;

      setTables((prev) =>
        toArray(prev).map((table) =>
          isSameTableNumber(table?.tableNumber ?? table?.table_number ?? table?.number, tableNumber)
            ? { ...table, isLocked: locked }
            : table
        )
      );
      if (import.meta.env.DEV && isTable10(tableNumber)) {
        console.warn("[table10-debug][qr-socket][table-lock-updated]", {
          tableNumber,
          locked,
        });
      }
      window.setTimeout(() => refreshOccupiedTablesRef.current?.(), 30);
    };

    const handleTableConfigsStorage = (event) => {
      if (!event?.key || !String(event.key).endsWith(":tableConfigs.v1")) return;
      refreshOccupiedTablesRef.current?.();
      loadTables();
    };

    window.addEventListener("beypro:table-lock-updated", handleTableLockUpdated);
    window.addEventListener("storage", handleTableConfigsStorage);
    return () => {
      window.removeEventListener("beypro:table-lock-updated", handleTableLockUpdated);
      window.removeEventListener("storage", handleTableConfigsStorage);
    };
  }, [loadTables, toArray]);

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    tableRef.current = table;
  }, [table]);

  useEffect(() => {
    refreshOccupiedTablesRef.current = refreshOccupiedTables;
  }, [refreshOccupiedTables]);

  useEffect(() => {
    refreshOrderScreenStatusRef.current = refreshOrderScreenStatus;
  }, [refreshOrderScreenStatus]);

  useEffect(() => {
    dismissReservationStatusLockRef.current = dismissReservationStatusLock;
  }, [dismissReservationStatusLock]);

  // Realtime table occupancy: join restaurant room and refresh on order events.
  useEffect(() => {
    if (!socketRestaurantId) return;
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL ||
      (API_BASE ? String(API_BASE) : "") ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      upgrade: true,
      withCredentials: true,
      timeout: 20000,
      auth: { restaurantId: socketRestaurantId },
    });

    let refreshTimer = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshOccupiedTablesRef.current?.();
      }, 50);
    };

    try {
      s.emit("join_restaurant", socketRestaurantId);
    } catch {}

    const normalizeSocketTableNo = (value) => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const normalizeSocketTableList = (values) =>
      Array.from(
        new Set(
          toArray(values)
            .map((value) => Number(value))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

    const upsertOccupied = (tableNo) => {
      const n = normalizeSocketTableNo(tableNo);
      if (!n) return;
      setOccupiedTables((prev) => {
        const next = normalizeSocketTableList(prev);
        if (!next.includes(n)) next.push(n);
        return next;
      });
      if (import.meta.env.DEV && isTable10(n)) {
        console.warn("[table10-debug][qr-socket] upsertOccupied requested", { tableNo: n });
      }
    };

    const removeOccupied = (tableNo) => {
      const n = normalizeSocketTableNo(tableNo);
      if (!n) return;
      setOccupiedTables((prev) => normalizeSocketTableList(prev).filter((value) => value !== n));
      if (import.meta.env.DEV && isTable10(n)) {
        console.warn("[table10-debug][qr-socket] removeOccupied requested", { tableNo: n });
      }
    };

    const upsertReserved = (tableNo) => {
      const n = normalizeSocketTableNo(tableNo);
      if (!n) return;
      setReservedTables((prev) => {
        const next = normalizeSocketTableList(prev);
        if (!next.includes(n)) next.push(n);
        return next;
      });
      if (import.meta.env.DEV && isTable10(n)) {
        console.warn("[table10-debug][qr-socket] upsertReserved requested", { tableNo: n });
      }
    };

    const removeReserved = (tableNo) => {
      const n = normalizeSocketTableNo(tableNo);
      if (!n) return;
      setReservedTables((prev) => normalizeSocketTableList(prev).filter((value) => value !== n));
      if (import.meta.env.DEV && isTable10(n)) {
        console.warn("[table10-debug][qr-socket] removeReserved requested", { tableNo: n });
      }
    };

    const matchesActiveReservationPayload = (payload, tableNo) => {
      const currentActiveOrder = activeOrderRef.current;
      const activeOrderId = Number(orderIdRef.current || storage.getItem("qr_active_order_id") || 0);
      const payloadOrderId = Number(
        payload?.order_id ??
          payload?.orderId ??
          payload?.reservation_id ??
          payload?.reservationId ??
          payload?.reservation?.id ??
          payload?.order?.id ??
          0
      );
      const activeTableNo = Number(
        tableRef.current ??
          storage.getItem("qr_table") ??
          storage.getItem("qr_selected_table") ??
          currentActiveOrder?.table_number ??
          currentActiveOrder?.tableNumber ??
          0
      );
      const normalizedPayloadTableNo = Number(tableNo || 0);
      const forceActive = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
      const orderIdMatches =
        Number.isFinite(activeOrderId) &&
        activeOrderId > 0 &&
        Number.isFinite(payloadOrderId) &&
        payloadOrderId > 0 &&
        activeOrderId === payloadOrderId;
      const tableMatches =
        Number.isFinite(activeTableNo) &&
        activeTableNo > 0 &&
        Number.isFinite(normalizedPayloadTableNo) &&
        normalizedPayloadTableNo > 0 &&
        isSameTableNumber(activeTableNo, normalizedPayloadTableNo);
      return (
        orderIdMatches ||
        ((forceActive || hasActiveReservationPayload(currentActiveOrder)) && tableMatches)
      );
    };

    const onConfirmed = (payload) => {
      const reservationPayload = payload?.order || payload?.reservation || payload;
      const orderId = Number(payload?.orderId ?? payload?.id ?? payload?.order?.id);
      const tableNoFromPayload =
        payload?.table_number ??
        payload?.order?.table_number ??
        payload?.reservation?.table_number ??
        payload?.tableNumber ??
        null;
      const cachedTableNo =
        Number.isFinite(orderId) && orderId > 0 ? orderIdToTableRef.current.get(orderId) : null;
      const tableNo = tableNoFromPayload ?? cachedTableNo ?? null;
      if (Number.isFinite(orderId)) {
        const tno = Number(tableNo);
        if (Number.isFinite(tno) && tno > 0) orderIdToTableRef.current.set(orderId, tno);
      }
      if (tableNo) {
        if (import.meta.env.DEV && isTable10(tableNo)) {
          console.warn("[table10-debug][qr-socket][order_confirmed]", payload);
        }
        const isReservationLikePayload = isReservationLikeEntry(reservationPayload);
        if (!isReservationLikePayload || hasActiveReservationPayload(reservationPayload)) {
          upsertOccupied(tableNo);
        } else {
          removeOccupied(tableNo);
        }
        if (hasActiveReservationPayload(reservationPayload)) {
          upsertReserved(tableNo);
        } else if (isReservationLikePayload) {
          removeReserved(tableNo);
        }
      }
      scheduleRefresh();
    };

    const onCancelled = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id ?? payload?.order?.id);
      const tableNo = payload?.table_number ?? payload?.order?.table_number ?? null;
      if (import.meta.env.DEV && isTable10(tableNo)) {
        console.warn("[table10-debug][qr-socket][order_cancelled_or_deleted]", payload);
      }
      if (tableNo) {
        removeOccupied(tableNo);
        removeReserved(tableNo);
      }
      else if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) {
          removeOccupied(cached);
          removeReserved(cached);
        }
      }
      if (Number.isFinite(orderId)) orderIdToTableRef.current.delete(orderId);
      const activeTrackedOrderId = Number(
        orderIdRef.current || storage.getItem("qr_active_order_id") || 0
      );
      if (
        Number.isFinite(orderId) &&
        orderId > 0 &&
        Number.isFinite(activeTrackedOrderId) &&
        activeTrackedOrderId === orderId
      ) {
        const cancelledStatus = resolveCancelledStatusFromPayload(payload, "cancelled");
        const cancellationReason = String(getPayloadCancellationReason(payload) || "").trim();
        storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
        setOrderId(orderId);
        storage.setItem("qr_active_order_id", String(orderId));
        setOrderStatus("success");
        setShowStatus(true);
        storage.setItem("qr_show_status", "1");
        setOrderScreenStatus(cancelledStatus);
        setOrderCancelReason((prev) => resolveCancellationReason(cancellationReason, prev));
        setActiveOrder((prev) => {
          const prevObj = prev && typeof prev === "object" ? prev : {};
          const payloadOrder =
            payload?.order && typeof payload.order === "object" ? payload.order : {};
          const nextReason =
            cancellationReason ||
            getOrderCancellationReason(payloadOrder) ||
            getOrderCancellationReason(prevObj) ||
            "";
          return {
            ...prevObj,
            ...payloadOrder,
            id: orderId,
            status: cancelledStatus,
            cancellation_reason: nextReason,
          };
        });
      }
      scheduleRefresh();
    };

    const onClosed = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id);
      const payloadTableNo = payload?.table_number ?? payload?.order?.table_number ?? null;
      if (import.meta.env.DEV && isTable10(payloadTableNo)) {
        console.warn("[table10-debug][qr-socket][order_closed]", payload);
      }
      if (payloadTableNo) {
        removeOccupied(payloadTableNo);
        removeReserved(payloadTableNo);
      }
      if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) {
          removeOccupied(cached);
          removeReserved(cached);
        }
        orderIdToTableRef.current.delete(orderId);
      }
      scheduleRefresh();
    };

    const onReservationCreated = (payload) => {
      const reservationPayload = payload?.order || payload?.reservation || payload;
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      if (tableNo) {
        if (hasActiveReservationPayload(reservationPayload)) {
          upsertOccupied(tableNo);
          upsertReserved(tableNo);
        } else {
          removeOccupied(tableNo);
          removeReserved(tableNo);
        }
      }
      scheduleRefresh();
    };

    const onReservationUpdated = (payload) => {
      const reservationPayload = payload?.order || payload?.reservation || payload;
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      const statusCandidates = [
        String(payload?.order?.status || "").toLowerCase(),
        String(payload?.reservation?.status || "").toLowerCase(),
        String(payload?.status || "").toLowerCase(),
      ].filter(Boolean);
      const nextStatus = statusCandidates[0] || "";
      const isCheckedInUpdate = statusCandidates.some((status) =>
        isCheckedInReservationStatus(status)
      );
      if (tableNo) {
        if (import.meta.env.DEV && isTable10(tableNo)) {
          console.warn("[table10-debug][qr-socket][reservation_updated]", payload);
        }
        if (isCheckedInUpdate) {
          upsertOccupied(tableNo);
          removeReserved(tableNo);
        } else if (hasActiveReservationPayload(reservationPayload)) {
          upsertOccupied(tableNo);
          upsertReserved(tableNo);
        } else {
          removeOccupied(tableNo);
          removeReserved(tableNo);
        }
      }
      if (isCheckedInUpdate && matchesActiveReservationPayload(payload, tableNo)) {
        markOrderCheckedIn(payload?.order || payload?.reservation || payload);
        const nextOrderId = Number(
          payload?.order?.id ??
            payload?.order_id ??
            payload?.orderId
        );
        if (Number.isFinite(nextOrderId) && nextOrderId > 0) {
          setOrderId(nextOrderId);
          storage.setItem("qr_active_order_id", String(nextOrderId));
        }
        dismissReservationStatusLockRef.current?.({
          clearActiveOrder: false,
          keepStatusOpen: true,
        });
        window.setTimeout(() => {
          refreshOrderScreenStatusRef.current?.();
        }, 30);
      }
      scheduleRefresh();
    };

    const onReservationCancelled = (payload) => {
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      if (tableNo) {
        if (import.meta.env.DEV && isTable10(tableNo)) {
          console.warn("[table10-debug][qr-socket][reservation_cancelled_or_deleted]", payload);
        }
        removeOccupied(tableNo);
        removeReserved(tableNo);
      }
      const matchesActiveReservation = matchesActiveReservationPayload(payload, tableNo);
      if (matchesActiveReservation) {
        const nextStatus = resolveCancelledStatusFromPayload(payload, "cancelled");
        const cancellationReason = String(getPayloadCancellationReason(payload) || "").trim();
        dismissReservationStatusLockRef.current?.({
          clearActiveOrder: false,
          keepStatusOpen: true,
        });
        const activeTrackedOrderId = Number(
          orderIdRef.current || storage.getItem("qr_active_order_id") || 0
        );
        const payloadOrderId = Number(
          payload?.order?.id ??
            payload?.order_id ??
            payload?.orderId ??
            payload?.reservation?.order_id ??
            payload?.reservation?.orderId ??
            0
        );
        const resolvedOrderId =
          Number.isFinite(payloadOrderId) && payloadOrderId > 0
            ? payloadOrderId
            : activeTrackedOrderId;
        if (Number.isFinite(resolvedOrderId) && resolvedOrderId > 0) {
          setOrderId(resolvedOrderId);
          storage.setItem("qr_active_order_id", String(resolvedOrderId));
        }
        setOrderStatus("success");
        setShowStatus(true);
        storage.setItem("qr_show_status", "1");
        setOrderScreenStatus(nextStatus);
        setOrderCancelReason((prev) => resolveCancellationReason(cancellationReason, prev));
        setActiveOrder((prev) => {
          const prevObj = prev && typeof prev === "object" ? prev : {};
          const payloadOrder =
            payload?.order && typeof payload.order === "object" ? payload.order : {};
          const payloadReservation =
            payload?.reservation && typeof payload.reservation === "object"
              ? payload.reservation
              : {};
          const nextReason =
            cancellationReason ||
            getOrderCancellationReason(payloadOrder) ||
            getOrderCancellationReason(payloadReservation) ||
            getOrderCancellationReason(prevObj) ||
            "";
          return {
            ...prevObj,
            ...payloadReservation,
            ...payloadOrder,
            id:
              Number.isFinite(resolvedOrderId) && resolvedOrderId > 0
                ? resolvedOrderId
                : prevObj?.id,
            status: nextStatus,
            cancellation_reason: nextReason,
          };
        });
        window.setTimeout(() => {
          refreshOrderScreenStatusRef.current?.();
        }, 30);
      }
      scheduleRefresh();
    };

    const onAny = () => scheduleRefresh();
    s.on("order_confirmed", onConfirmed);
    s.on("orders_updated", onAny);
    s.on("order_cancelled", onCancelled);
    s.on("order_deleted", onCancelled);
    s.on("order_closed", onClosed);
    s.on("reservation_created", onReservationCreated);
    s.on("reservation_updated", onReservationUpdated);
    s.on("reservation_checked_in", onReservationUpdated);
    s.on("reservation_cancelled", onReservationCancelled);
    s.on("reservation_deleted", onReservationCancelled);

    // Initial refresh on connect
    s.on("connect", () => scheduleRefresh());

    return () => {
      try {
        if (refreshTimer) window.clearTimeout(refreshTimer);
      } catch {}
      try {
        s.off("order_confirmed", onConfirmed);
        s.off("orders_updated", onAny);
        s.off("order_cancelled", onCancelled);
        s.off("order_deleted", onCancelled);
        s.off("order_closed", onClosed);
        s.off("reservation_created", onReservationCreated);
        s.off("reservation_updated", onReservationUpdated);
        s.off("reservation_checked_in", onReservationUpdated);
        s.off("reservation_cancelled", onReservationCancelled);
        s.off("reservation_deleted", onReservationCancelled);
        s.disconnect();
      } catch {}
    };
  }, [socketRestaurantId, storage, toArray]);

useEffect(() => {
  let cancelled = false;

  loadTables();
  (async () => {
    await refreshOccupiedTables();
    if (cancelled) return;
  })().catch((err) => {
    console.warn("⚠️ Failed to load occupied tables:", err);
    if (!cancelled) setOccupiedTables([]);
  });

  return () => {
    cancelled = true;
  };
}, [appendIdentifier, refreshOccupiedTables]);

useEffect(() => {
  const intervalId = window.setInterval(() => {
    refreshOccupiedTables();
  }, 30000);
  return () => {
    window.clearInterval(intervalId);
  };
}, [refreshOccupiedTables]);



const triggerOrderType = useCallback(
  (type) => {
    if (!shopIsOpen) {
      alert(t("Closed"));
      return;
    }
    const activeOrderTypeForLock = String(
      activeOrder?.order_type || orderType || storage.getItem("qr_orderType") || ""
    )
      .trim()
      .toLowerCase();
    const activeOrderStatusForLock = String(orderScreenStatus || activeOrder?.status || "")
      .trim()
      .toLowerCase();
    const activeOrderIdForLock = Number(
      orderId || activeOrder?.id || storage.getItem("qr_active_order_id") || 0
    );
    const hasActiveDeliveryLock =
      Number.isFinite(activeOrderIdForLock) &&
      activeOrderIdForLock > 0 &&
      ["online", "packet", "delivery", "phone"].includes(activeOrderTypeForLock) &&
      !isTerminalOrderStatus(activeOrderStatusForLock) &&
      !isCancelledLikeStatus(activeOrderStatusForLock);
    if (hasActiveDeliveryLock && type !== "online") {
      alert("Reservation and table orders are disabled while an active delivery order is open.");
      return;
    }
    if (type === "table" && !boolish(orderSelectCustomization?.table_order_enabled, true)) {
      alert("Table order is closed.");
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("qr:voice-order-close"));
    }
    setForceHome(false);
    setOrderType(type);
    if (type === "online") {
      setShowDeliveryForm(true);
    }
    if (type === "takeaway") {
      setShowTakeawayForm(true);
    }
  },
  [
    activeOrder,
    orderId,
    orderScreenStatus,
    orderType,
    setForceHome,
    setOrderType,
    setShowDeliveryForm,
    setShowTakeawayForm,
    shopIsOpen,
    orderSelectCustomization?.table_order_enabled,
    storage,
    t,
  ]
);

const handlePopularProductClick = useCallback(
  (product, meta) => {
    if (!product) return;
    // If order type is already chosen, open add-to-cart modal immediately.
    // This avoids getting stuck behind the order-type prompt/pending flow.
    const orderTypeReady =
      !!orderType &&
      !(orderType === "online" && showDeliveryForm) &&
      !(orderType === "takeaway" && showTakeawayForm);
    if (orderTypeReady) {
      const targetCategory = (product.category || "").trim();
      if (targetCategory) {
        setActiveCategory(targetCategory);
      }
      setReturnHomeAfterAdd(!!meta?.returnToHomeAfterAdd);
      setShowOrderTypePrompt(false);
      setPendingPopularProduct(null);
      setSelectedProduct(product);
      setShowAddModal(true);
      return;
    }

    setPendingPopularProduct(product);
    setReturnHomeAfterAdd(!!meta?.returnToHomeAfterAdd);
    setShowOrderTypePrompt(true);
  },
  [
    orderType,
    setActiveCategory,
    setPendingPopularProduct,
    setReturnHomeAfterAdd,
    setSelectedProduct,
    setShowAddModal,
    setShowOrderTypePrompt,
    showDeliveryForm,
    showTakeawayForm,
  ]
);

const handleMenuCategorySelect = useCallback(
  (cat) => {
    setActiveCategory(cat);
  },
  [setActiveCategory]
);

const handleMenuCategoryClick = useCallback(() => {
  setMenuSearch("");
}, [setMenuSearch]);

const handleMenuProductOpen = useCallback(
  (product) => {
    if (orderType === "table" && isReservationPendingCheckIn(activeOrder, orderScreenStatus, checkedInOrdersRef.current)) {
      alert(t("Items can be added after check-in."));
      return;
    }
    setSelectedProduct(product);
    setShowAddModal(true);
  },
  [activeOrder, orderScreenStatus, orderType, setSelectedProduct, setShowAddModal, t]
);

		useEffect(() => {
		  if (!orderType || !pendingPopularProduct) return;
      // If the chosen order type requires an info modal (delivery / pre-order),
      // wait until the modal is completed/closed before opening the add-to-cart flow.
      if (orderType === "online" && showDeliveryForm) return;
      if (orderType === "takeaway" && showTakeawayForm) return;
		  const targetCategory = (pendingPopularProduct.category || "").trim();
		  if (targetCategory) {
		    setActiveCategory(targetCategory);
		  }
		  setSelectedProduct(pendingPopularProduct);
		  setShowAddModal(true);
		  setPendingPopularProduct(null);
		}, [
      orderType,
      pendingPopularProduct,
      showDeliveryForm,
      showTakeawayForm,
      setActiveCategory,
      setSelectedProduct,
      setShowAddModal,
    ]);

			const showHome = !orderType || forceHome;

function safeNumber(v) {
  if (!v) return null;
  if (v === "null" || v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const myTable =
  safeNumber(storage.getItem("qr_table")) ??
  safeNumber(storage.getItem("qr_selected_table")) ??
  null;


const filteredOccupied = useMemo(() => {
  const knownTableKeys = new Set(
    toArray(tables)
      .map((table) => normalizeTableNumberKey(table?.tableNumber ?? table?.table_number ?? table?.number))
      .filter(Boolean)
  );
  const derived = Array.from(
    new Set(
      toArray(safeOccupiedTables)
        .map((value) => normalizeTableNumberKey(value))
        .filter(Boolean)
        .filter((tableKey) =>
          knownTableKeys.size > 0
            ? knownTableKeys.has(tableKey)
            : true
        )
        .map((tableKey) => Number(tableKey))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  if (import.meta.env.DEV && derived.some((value) => isTable10(value))) {
    console.warn("[table10-debug][qr-selector][filteredOccupied]", derived);
  }
  return derived;
}, [safeOccupiedTables, tables, toArray]);
const filteredReserved = useMemo(() => {
  const knownTableKeys = new Set(
    toArray(tables)
      .map((table) => normalizeTableNumberKey(table?.tableNumber ?? table?.table_number ?? table?.number))
      .filter(Boolean)
  );
  const next = Array.from(
    new Set(
      toArray(safeReservedTables)
        .map((value) => normalizeTableNumberKey(value))
        .filter(Boolean)
        .filter((tableKey) =>
          knownTableKeys.size > 0
            ? knownTableKeys.has(tableKey)
            : true
        )
        .map((tableKey) => Number(tableKey))
        .filter((n) => Number.isFinite(n) && n > 0)
    )
  );
  if (import.meta.env.DEV && next.some((value) => isTable10(value))) {
    console.warn("[table10-debug][qr-selector][filteredReserved]", next);
  }
  return next;
}, [safeReservedTables, tables, toArray]);
const showTableSelector = !forceHome && orderType === "table" && !table;


// ---- Rehydrate cart from current order (generate NEW unique_id for each line) ----
// ---- Rehydrate cart from current order, but mark them as locked (read-only) ----
async function rehydrateCartFromOrder(orderId, orderSnapshot = null) {
  const normalizedOrderId = Number(orderId);
  const trackedOrderId = Number(
    orderId || activeOrder?.id || storage.getItem("qr_active_order_id") || 0
  );
  const currentTrackedStatus = String(orderScreenStatus || activeOrder?.status || "").toLowerCase();
  if (isReservationPendingCheckIn(orderSnapshot, null, checkedInOrdersRef.current)) {
    setCart([]);
    storage.setItem("qr_cart", "[]");
    return false;
  }
  if (
    Number.isFinite(normalizedOrderId) &&
    normalizedOrderId > 0 &&
    Number.isFinite(trackedOrderId) &&
    trackedOrderId > 0 &&
    normalizedOrderId === trackedOrderId &&
    isReservationPendingCheckIn(activeOrder, currentTrackedStatus, checkedInOrdersRef.current)
  ) {
    setCart([]);
    storage.setItem("qr_cart", "[]");
    return false;
  }

  try {
    const token = getStoredToken();
    let raw = null;
    try {
      raw = await secureFetch(appendIdentifier(`/orders/${orderId}/items`), {
        ...(token
          ? {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          : {}),
      });
    } catch (primaryErr) {
      // Some QR flows can read order items publicly with identifier-scoped endpoints.
      // Retry once without auth header before giving up.
      if (!token) throw primaryErr;
      raw = await secureFetch(appendIdentifier(`/orders/${orderId}/items`));
    }

    const now36 = Date.now().toString(36);
    const lockedItems = parseOrderItemsPayload(raw)
      .filter((it) => !isPaidLikeOrderItem(it))
      .map((it) => ({
        id: it.product_id ?? it.external_product_id,
        name: it.order_item_name || it.product_name || it.name || "Item",
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        extras: (() => {
          if (Array.isArray(it.extras)) return it.extras;
          if (typeof it.extras !== "string") return [];
          try {
            const parsed = JSON.parse(it.extras);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
        note: it.note || "",
        image: null,
        unique_id: `${(it.product_id ?? it.external_product_id ?? "x")}-${now36}-${Math.random().toString(36).slice(2,8)}`,
        locked: true, // ← ← ← IMPORTANT
      }));

    // Show only locked items for context; new items will be added later
    setCart(lockedItems);
    return true;
  } catch (e) {
    console.error("rehydrateCartFromOrder failed:", e);
    return false;
  }
}

async function hydrateCartFromActiveOrder() {
  const activeOrderId = Number(
    orderId ||
      activeOrder?.id ||
      storage.getItem("qr_active_order_id") ||
      null
  );
  if (!Number.isFinite(activeOrderId) || activeOrderId <= 0) return false;
  if (isReservationPendingCheckIn(activeOrder, orderScreenStatus, checkedInOrdersRef.current)) {
    setCart([]);
    storage.setItem("qr_cart", "[]");
    setOrderId(activeOrderId);
    storage.setItem("qr_active_order_id", String(activeOrderId));
    storage.setItem("qr_show_status", "0");
    return false;
  }
  const hydrated = await rehydrateCartFromOrder(activeOrderId);
  setOrderId(activeOrderId);
  storage.setItem("qr_active_order_id", String(activeOrderId));
  storage.setItem("qr_show_status", "0");
  return hydrated;
}

// ---- Order Another: show previous lines (locked), start fresh for new ones ----
async function handleOrderAnother() {
  const currentStatus = String(orderScreenStatus || activeOrder?.status || "").toLowerCase();
  const tableForLockCheck = Number(
    table ||
      storage.getItem("qr_table") ||
      storage.getItem("qr_selected_table") ||
      activeOrder?.table_number ||
      activeOrder?.tableNumber ||
      null
  );
  const reservedTableContextWhileLocked =
    Number.isFinite(tableForLockCheck) &&
    safeReservedTables.some((n) => isSameTableNumber(n, tableForLockCheck));
  const allowOrderAnotherWhileReserved =
    currentStatus === "reserved" ||
    currentStatus === "confirmed" ||
    reservedTableContextWhileLocked ||
    (isCancelledLikeStatus(currentStatus) &&
      Number.isFinite(tableForLockCheck) &&
      tableForLockCheck > 0);
  if (isForcedStatusActive() && !allowOrderAnotherWhileReserved) {
    setShowStatus(true);
    storage.setItem("qr_show_status", "1");
    return;
  }
  try {
    setForceHome(false);
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    setOrderStatus("pending");

    // keep drawer closed; user opens if needed
    storage.setItem("qr_cart_auto_open", "0");
    window.dispatchEvent(new Event("qr:cart-close"));

    const normalizeOrderTypeForReorder = (rawType, tableNo) => {
      const type = String(rawType || "").trim().toLowerCase();
      const hasTable = Number.isFinite(Number(tableNo)) && Number(tableNo) > 0;
      if (type === "table" || type === "reservation" || hasTable) return "table";
      if (["online", "packet", "takeaway", "delivery"].includes(type)) return "online";
      return null;
    };

    // resolve existing order
    let id = orderId || Number(storage.getItem("qr_active_order_id")) || null;
    let type = normalizeOrderTypeForReorder(
      orderType || storage.getItem("qr_orderType") || activeOrder?.order_type || null,
      table ?? activeOrder?.table_number ?? activeOrder?.tableNumber
    );
    let resolvedOrderSnapshot = activeOrder || null;
    let resolvedTableNo =
      Number(table) ||
      Number(storage.getItem("qr_table")) ||
      Number(storage.getItem("qr_selected_table")) ||
      Number(activeOrder?.table_number) ||
      Number(activeOrder?.tableNumber) ||
      null;

    // Check if current order is cancelled - if so, clear everything for fresh start
    if (id) {
      try {
        const token = getStoredToken();
        const res = await secureFetch(appendIdentifier(`/orders/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res) {
          resolvedOrderSnapshot = res;
          const orderStatus = (res.status || "").toLowerCase();
          const fetchedTable = Number(res.table_number ?? res.tableNumber);
          const fetchedType = normalizeOrderTypeForReorder(
            res.order_type,
            fetchedTable
          );
          if (fetchedType) {
            type = fetchedType;
          }
          if (Number.isFinite(fetchedTable) && fetchedTable > 0) {
            resolvedTableNo = fetchedTable;
          }
          if (isCancelledLikeStatus(orderStatus)) {
            // For cancelled table/reservation orders, keep table flow so Re-Order can continue.
            const cancelledTableNo =
              Number.isFinite(fetchedTable) && fetchedTable > 0 ? fetchedTable : resolvedTableNo;
            const cancelledTableFlow =
              fetchedType === "table" ||
              type === "table" ||
              (Number.isFinite(cancelledTableNo) && cancelledTableNo > 0);

            storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
            storage.removeItem("qr_active_order_id");
            storage.removeItem("qr_active_order");
            storage.setItem("qr_show_status", "0");
            setOrderId(null);
            id = null;

            if (cancelledTableFlow) {
              type = "table";
              if (Number.isFinite(cancelledTableNo) && cancelledTableNo > 0) {
                resolvedTableNo = cancelledTableNo;
              }
              storage.setItem("qr_orderType", "table");
            } else {
              // Non-table cancelled orders still reset fully.
              setCart([]);
              storage.removeItem("qr_cart");
              storage.removeItem("qr_orderType");
              setOrderType(null);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("⚠️ Failed to check order status:", err);
      }
    }

    if (!type) {
      type = normalizeOrderTypeForReorder(activeOrder?.order_type, resolvedTableNo);
    }

    // If table known but no id, fetch open order for that table
    if (!id && type === "table") {
      const tNo =
        Number(resolvedTableNo) ||
        Number(table) ||
        Number(storage.getItem("qr_table")) ||
        null;
      if (tNo) {
        const token = getStoredToken();
        if (token) {
          try {
            const q = await secureFetch(appendIdentifier(`/orders?table_number=${tNo}`) , {
              headers: { Authorization: `Bearer ${token}` },
            });
            const arr = Array.isArray(q) ? q : (Array.isArray(q?.data) ? q.data : []);
            const open =
              arr.find((o) => !isTerminalOrderStatus((o?.status || "").toLowerCase())) || null;
            if (open) {
              resolvedOrderSnapshot = open;
              id = open.id;
              type = "table";
              const openTable = Number(open.table_number);
              if (Number.isFinite(openTable) && openTable > 0) {
                resolvedTableNo = openTable;
              }
              setOrderId(id);
              setOrderType("table");
            }
          } catch (err) {
            console.warn("⚠️ Failed to fetch open table order:", err);
          }
        }
      }
    }

    // ONLINE branch: rehydrate previous (locked) items too
    if (type === "online" && id) {
      try {
        const rawContext = storage.getItem(DELIVERY_REORDER_CONTEXT_KEY);
        const parsedContext = rawContext ? JSON.parse(rawContext) : null;
        const existingSourceIds = Array.isArray(parsedContext?.sourceOrderIds)
          ? parsedContext.sourceOrderIds
              .map((value) => Number(value))
              .filter((value) => Number.isFinite(value) && value > 0)
          : [];
        const nextSourceIds = Array.from(
          new Set(
            [...existingSourceIds, Number(id)].filter(
              (value) => Number.isFinite(value) && value > 0
            )
          )
        );
        storage.setItem(
          DELIVERY_REORDER_CONTEXT_KEY,
          JSON.stringify({
            mode: "online",
            sourceOrderIds: nextSourceIds,
            targetOrderIds: [],
            updatedAt: new Date().toISOString(),
          })
        );
      } catch {
        storage.setItem(
          DELIVERY_REORDER_CONTEXT_KEY,
          JSON.stringify({
            mode: "online",
            sourceOrderIds: [Number(id)],
            targetOrderIds: [],
            updatedAt: new Date().toISOString(),
          })
        );
      }
      await rehydrateCartFromOrder(id, resolvedOrderSnapshot); // sets locked: true items
      setOrderId(null);
      setActiveOrder(resolvedOrderSnapshot || null);
      setOrderType("online");
      storage.removeItem("qr_active_order_id");
      storage.removeItem("qr_active_order");
      storage.setItem("qr_orderType", "online");
      storage.setItem("qr_show_status", "0");
      setShowDeliveryForm(false); // don’t ask details again
      return;
    }

    // TABLE branch (unchanged)
    if (type === "table" && id) {
      await rehydrateCartFromOrder(id, resolvedOrderSnapshot); // sets locked: true items
      setOrderId(id);
      setOrderType("table");
      if (Number.isFinite(Number(resolvedTableNo)) && Number(resolvedTableNo) > 0) {
        const tableToUse = Number(resolvedTableNo);
        setTable(tableToUse);
        saveSelectedTable(tableToUse);
        storage.setItem("qr_table", String(tableToUse));
        storage.setItem("qr_selected_table", String(tableToUse));
      }
      storage.setItem("qr_active_order_id", String(id));
      storage.setItem("qr_orderType", "table");
      storage.setItem("qr_show_status", "0");
      return;
    }

    // Keep table flow visible even if order id cannot be restored right now.
    if (type === "table" && Number.isFinite(Number(resolvedTableNo)) && Number(resolvedTableNo) > 0) {
      const tableToUse = Number(resolvedTableNo);
      setOrderType("table");
      setTable(tableToUse);
      saveSelectedTable(tableToUse);
      storage.setItem("qr_table", String(tableToUse));
      storage.setItem("qr_selected_table", String(tableToUse));
      storage.setItem("qr_orderType", "table");
      return;
    }

    // nothing to restore → clean cart
    setCart([]);
    storage.setItem("qr_cart", "[]");
    storage.setItem("qr_show_status", "0");
  } catch (e) {
    console.error("handleOrderAnother failed:", e);
  }
}

function handleReset(options = null) {
			  const forceManualClose = options?.allowForceClose === true;
			  if (isForcedStatusActive() && !forceManualClose) {
			    setShowStatus(true);
			    storage.setItem("qr_show_status", "1");
			    return;
			  }
			  if (forceManualClose) {
			    resetToTypePicker({ allowForceClose: true });
			    return;
			  }
				  // Check if order is delivered or cancelled - if so, navigate to home
				  const status = (orderScreenStatus || "").toLowerCase();
				  const isFinished = ["delivered", "served", "closed", "completed", "cancelled", "canceled", "deleted", "void"].includes(status);
          const hasCartItems = Array.isArray(cart) && cart.length > 0;
          const activeFlowType = String(
            activeOrder?.order_type || orderType || storage.getItem("qr_orderType") || ""
          )
            .trim()
            .toLowerCase();

		  if (isFinished) {
		    // Order is complete - navigate to home and clear everything
		    resetToTypePicker();
		  } else if (!hasCartItems && activeFlowType !== "table" && activeFlowType !== "reservation") {
		    setShowStatus(false);
		    storage.setItem("qr_show_status", "0");
        setForceHome(true);
        window.dispatchEvent(new Event("qr:cart-close"));
        window.dispatchEvent(new Event("qr:voice-order-close"));
		  } else {
		    // Order still active - just hide status to return to menu
		    setShowStatus(false);
		    storage.setItem("qr_show_status", "0");
		  }
		}

  const handleCallWaiter = useCallback(async (callType = null) => {
    let tableNumber =
      Number(table) ||
      Number(storage.getItem("qr_table")) ||
      Number(storage.getItem("qr_selected_table")) ||
      Number(initialTableFromUrl) ||
      Number(activeOrder?.table_number) ||
      Number(activeOrder?.tableNumber) ||
      Number(activeOrder?.table) ||
      Number(activeOrder?.reservation?.table_number) ||
      Number(activeOrder?.reservation?.tableNumber) ||
      Number(activeOrder?.reservation?.table) ||
      null;
    if (!Number.isFinite(tableNumber) || tableNumber <= 0) {
      const persistedActiveOrderId =
        Number(orderId) || Number(storage.getItem("qr_active_order_id")) || null;
      if (Number.isFinite(persistedActiveOrderId) && persistedActiveOrderId > 0) {
        try {
          const token = getStoredToken();
          const orderPayload = await secureFetch(
            appendIdentifier(`/orders/${persistedActiveOrderId}`),
            token ? { headers: { Authorization: `Bearer ${token}` } } : {}
          );
          const recoveredTableNumber =
            Number(orderPayload?.table_number) ||
            Number(orderPayload?.tableNumber) ||
            Number(orderPayload?.table) ||
            Number(orderPayload?.reservation?.table_number) ||
            Number(orderPayload?.reservation?.tableNumber) ||
            Number(orderPayload?.reservation?.table) ||
            null;
          if (Number.isFinite(recoveredTableNumber) && recoveredTableNumber > 0) {
            tableNumber = recoveredTableNumber;
            setTable(recoveredTableNumber);
          }
        } catch (recoverErr) {
          console.warn("handleCallWaiter failed to recover table from active order", {
            activeOrderId: persistedActiveOrderId,
            errorMessage: String(recoverErr?.message || ""),
            errorDetails: recoverErr?.details || null,
          });
        }
      }
    }
    if (Number.isFinite(tableNumber) && tableNumber > 0) {
      try {
        storage.setItem("qr_table", String(tableNumber));
        storage.setItem("qr_selected_table", String(tableNumber));
      } catch {
        // ignore storage write failures
      }
    }
    if (!restaurantIdentifier || !Number.isFinite(tableNumber) || tableNumber <= 0) {
      console.warn("handleCallWaiter missing table context", {
        restaurantIdentifier,
        stateTable: table ?? null,
        storageQrTable: storage.getItem("qr_table"),
        storageSelectedTable: storage.getItem("qr_selected_table"),
        initialTableFromUrl: initialTableFromUrl ?? null,
        orderId: Number(orderId || 0) || null,
        storageActiveOrderId: Number(storage.getItem("qr_active_order_id") || 0) || null,
        activeOrderId: Number(activeOrder?.id || 0) || null,
        activeOrderTable: activeOrder?.table_number ?? activeOrder?.tableNumber ?? activeOrder?.table ?? null,
        activeReservationTable:
          activeOrder?.reservation?.table_number ??
          activeOrder?.reservation?.tableNumber ??
          activeOrder?.reservation?.table ??
          null,
      });
      return { ok: false, reason: "missing_table" };
    }

    const waiterEligibleStatus = resolveReservationAwareStatus(
      activeOrder,
      orderScreenStatus || activeOrder?.status || ""
    );
    if (!canCallWaiterForStatus(waiterEligibleStatus)) {
      return { ok: false, reason: "not_confirmed" };
    }

    const now = Date.now();
    if (callWaiterCooldownUntil > now) {
      return { ok: false, reason: "cooldown", retryAfterMs: callWaiterCooldownUntil - now };
    }

    setCallingWaiter(true);
    try {
      const token = getStoredToken();
      const authOpts = token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : {};
      const normalizedCallType = String(callType || "")
        .trim()
        .toLowerCase();
      const waiterRequestType =
        normalizedCallType === "bill" || normalizedCallType === "reorder"
          ? normalizedCallType
          : null;
      const callWaiterBody = {
        identifier: restaurantIdentifier,
        restaurant_identifier: restaurantIdentifier,
        restaurantIdentifier,
        table_number: tableNumber,
        table: tableNumber,
        table_no: tableNumber,
        // Manual "Call waiter" should always be audible on POS.
        source: "qr_menu",
      };
      if (waiterRequestType) {
        callWaiterBody.call_type = waiterRequestType;
        callWaiterBody.request_type = waiterRequestType;
        callWaiterBody.type = waiterRequestType;
        callWaiterBody.reason = waiterRequestType;
      }
      const waiterEndpoints = [
        `/public/call-waiter/${encodeURIComponent(restaurantIdentifier)}`,
        `/public/call-waiter?identifier=${encodeURIComponent(restaurantIdentifier)}`,
      ];
      let lastError = null;
      let delivered = false;

      for (const endpoint of waiterEndpoints) {
        try {
          await secureFetch(endpoint, {
            method: "POST",
            ...authOpts,
            body: JSON.stringify(callWaiterBody),
          });
          delivered = true;
          break;
        } catch (requestErr) {
          lastError = requestErr;
          const requestStatus = Number(requestErr?.details?.status || 0);
          if (requestStatus === 429) {
            throw requestErr;
          }
          console.warn("call waiter endpoint failed", {
            endpoint,
            status: requestStatus || null,
            message: String(requestErr?.message || ""),
            details: requestErr?.details || null,
            restaurantIdentifier,
            tableNumber,
            waiterRequestType,
          });
        }
      }

      if (!delivered) {
        throw lastError || new Error("Call waiter request failed");
      }
      setCallWaiterCooldownUntil(Date.now() + 15000);
      return { ok: true };
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("429") || msg.includes("too many")) {
        setCallWaiterCooldownUntil(Date.now() + 15000);
        return { ok: false, reason: "cooldown", retryAfterMs: 15000 };
      }
      console.warn("handleCallWaiter failed", {
        restaurantIdentifier,
        tableNumber,
        callType,
        activeOrderId: Number(activeOrder?.id || 0) || null,
        orderScreenStatus: orderScreenStatus || activeOrder?.status || "",
        errorMessage: String(err?.message || ""),
        errorDetails: err?.details || null,
      });
      return {
        ok: false,
        reason: "failed",
        debug: {
          restaurantIdentifier,
          tableNumber,
          callType,
          activeOrderId: Number(activeOrder?.id || 0) || null,
          orderScreenStatus: orderScreenStatus || activeOrder?.status || "",
          errorMessage: String(err?.message || ""),
          errorDetails: err?.details || null,
        },
      };
    } finally {
      setCallingWaiter(false);
    }
  }, [
    activeOrder,
    appendIdentifier,
    callWaiterCooldownUntil,
    getStoredToken,
    initialTableFromUrl,
    orderId,
    orderScreenStatus,
    restaurantIdentifier,
    storage,
    table,
  ]);

  const canCallWaiter =
    canCallWaiterForStatus(
      resolveReservationAwareStatus(activeOrder, orderScreenStatus || activeOrder?.status || "")
    );

  const callWaiterCooldownSeconds = Math.max(
    0,
    Math.ceil((callWaiterCooldownUntil - callWaiterTickMs) / 1000)
  );

  useEffect(() => {
    if (!callWaiterCooldownUntil || callWaiterCooldownUntil <= Date.now()) {
      setCallWaiterTickMs(Date.now());
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setCallWaiterTickMs(Date.now());
    }, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [callWaiterCooldownUntil]);

  return {
    restaurantIdentifier,
    shareUrl,
    lang,
    setLang,
    t,
    showIosHelp,
    setShowIosHelp,
    showHelp,
    setShowHelp,
    platform,
    setPlatform,
    isIosSafariBrowser,
    isIosInAppBrowser,
    brandName,
    setBrandName,
    table,
    setTable,
    customerInfo,
    setCustomerInfo,
    categories,
    setCategories,
    products,
    setProducts,
    extrasGroups,
    setExtrasGroups,
    activeCategory,
    setActiveCategory,
    cart,
    setCart,
    selectedProduct,
    setSelectedProduct,
    showAddModal,
    setShowAddModal,
    occupiedTables,
    reservedTables,
    setOccupiedTables,
    showStatus,
    setShowStatus,
    orderStatus,
    setOrderStatus,
    orderId,
    setOrderId,
    tables,
    setTables,
    isDarkMain,
    setIsDarkMain,
    orderCancelReason,
    setOrderCancelReason,
    submitting,
    setSubmitting,
    categoryImages,
    setCategoryImages,
    lastError,
    setLastError,
    activeOrder,
    setActiveOrder,
    orderScreenStatus,
    setOrderScreenStatus,
    paymentMethod,
    setPaymentMethod,
    orderType,
    setOrderType,
    showTakeawayForm,
    setShowTakeawayForm,
    orderSelectCustomization,
    setOrderSelectCustomization,
    showDeliveryForm,
    setShowDeliveryForm,
    pendingPopularProduct,
    setPendingPopularProduct,
    returnHomeAfterAdd,
    setReturnHomeAfterAdd,
    forceHome,
    setForceHome,
    showOrderTypePrompt,
    setShowOrderTypePrompt,
    shopIsOpen,
    setShopIsOpen,
    suppressMenuFlash,
    setSuppressMenuFlash,
    showTableScanner,
    setShowTableScanner,
    tableScanTarget,
    setTableScanTarget,
    tableScanGuests,
    setTableScanGuests,
    tableScanReady,
    startTableScannerWithGuests,
    tableScanError,
    setTableScanError,
    menuSearch,
    setMenuSearch,
    qrVoiceListening,
    setQrVoiceListening,
    qrVoiceParsing,
    setQrVoiceParsing,
    qrVoiceTranscript,
    setQrVoiceTranscript,
    qrVoiceResult,
    setQrVoiceResult,
    qrVoiceError,
    setQrVoiceError,
    qrVoiceModalOpen,
    setQrVoiceModalOpen,
    takeaway,
    setTakeaway,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    isDesktopLayout,
    setIsDesktopLayout,
    appendIdentifier,
    safeProducts,
    safeCategories,
    safeExtrasGroups,
    safeCart,
    safeOccupiedTables,
    safeReservedTables,
    hasActiveOrder,
    productsForGrid,
    canCallWaiter,
    triggerOrderType,
    handlePopularProductClick,
    handleMenuCategorySelect,
    handleMenuCategoryClick,
    handleMenuProductOpen,
    parseQrVoiceTranscript,
    startQrVoiceCapture,
    injectQrVoiceItemsToCart,
    openTableScanner,
    selectTableDirectly,
    closeTableScanner,
    resetToTypePicker,
    handleCloseOrderPage,
    hydrateCartFromActiveOrder,
    handleOrderAnother,
    handleSubmitOrder,
    handleReset,
    handleInstallClick,
    handleDownloadQr,
    showHome,
    showTableSelector,
    filteredOccupied,
    filteredReserved,
    callingWaiter,
    callWaiterCooldownSeconds,
    handleCallWaiter,
  };
}

export default useQrMenuController;
