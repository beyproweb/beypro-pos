// src/components/OrderStatusScreen.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Music2,
  Navigation,
  ShoppingBag,
  Ticket,
  Truck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import secureFetch, { getAuthToken, BASE_URL } from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import CustomerOrderTrackingView from "./CustomerOrderTrackingView";
import RequestSongTab from "../features/qrmenu/components/RequestSongTab";
// Use the same base as secureFetch to avoid env drift
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  String(BASE_URL).replace(/\/api\/?$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");
const QR_PREFIX = "qr_";
const DELIVERY_REORDER_CONTEXT_KEY = "qr_delivery_reorder_context";
const PUBLIC_API_BASE =
  String(BASE_URL || "").replace(/\/api\/?$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

/* ---------- SOCKET.IO HOOK ---------- */
let socket;
export function useSocketIO(onOrderUpdate, orderId) {
  useEffect(() => {
    if (!orderId) return;
    if (!socket) {
      try {
        socket = io(SOCKET_URL, {
          path: "/socket.io",
          transports: ["polling", "websocket"],
          upgrade: true,
          withCredentials: true,
          timeout: 20000,
        });
      } catch (e) {
        console.warn("Socket init failed:", e);
        return;
      }
    }

    const updateHandler = (data) => {
      const targetOrderId = Number(orderId || 0);
      if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) return;
      if (
        Array.isArray(data?.orderIds) &&
        data.orderIds.map((value) => Number(value)).includes(targetOrderId)
      ) {
        onOrderUpdate?.();
        return;
      }
      const candidateIds = [
        data?.orderId,
        data?.order_id,
        data?.id,
        data?.order?.id,
        data?.order?.order_id,
        data?.reservation?.order_id,
        data?.reservation?.orderId,
        data?.reservation_id,
        data?.reservationId,
        data?.reservation?.id,
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (candidateIds.includes(targetOrderId)) {
        onOrderUpdate?.();
      }
    };

    // Generic refresh on common kitchen events (covers /api/order-items/kitchen-status in kitchen.js)
    socket.on("orders_updated", onOrderUpdate);
    socket.on("order_preparing", onOrderUpdate);
    socket.on("order_ready", onOrderUpdate);
    socket.on("order_delivered", onOrderUpdate);
    socket.on("order_cancelled", onOrderUpdate);
    socket.on("order_deleted", onOrderUpdate);
    socket.on("order_closed", onOrderUpdate);
    socket.on("reservation_checked_out", onOrderUpdate);
    socket.on("reservation_cancelled", onOrderUpdate);
    socket.on("reservation_deleted", onOrderUpdate);

    // Also listen with a payload-aware handler (covers orders router emitting orderIds/orderId)
    socket.on("order_ready", updateHandler);
    socket.on("order_cancelled", updateHandler);
    socket.on("order_deleted", updateHandler);
    socket.on("order_closed", updateHandler);
    socket.on("reservation_checked_out", updateHandler);
    socket.on("reservation_cancelled", updateHandler);
    socket.on("reservation_deleted", updateHandler);

    // Dev visibility
    const logEvent = (name, payload) => {
      if (import.meta.env.DEV && payload?.orderId === orderId) {
        console.info(`[OrderStatusScreen] ${name}`, payload);
      }
    };
    socket.on("order_cancelled", (p) => logEvent("order_cancelled", p));
    socket.on("order_deleted", (p) => logEvent("order_deleted", p));
    socket.on("order_closed", (p) => logEvent("order_closed", p));
    socket.on("reservation_checked_out", (p) => logEvent("reservation_checked_out", p));
    socket.on("reservation_cancelled", (p) => logEvent("reservation_cancelled", p));
    socket.on("reservation_deleted", (p) => logEvent("reservation_deleted", p));
    socket.on("orders_updated", (p) => logEvent("orders_updated", p));

    return () => {
      socket.off("orders_updated", onOrderUpdate);
      socket.off("order_preparing", onOrderUpdate);
      socket.off("order_ready", onOrderUpdate);
      socket.off("order_delivered", onOrderUpdate);
      socket.off("order_ready", updateHandler);
      socket.off("order_cancelled", onOrderUpdate);
      socket.off("order_cancelled", updateHandler);
      socket.off("order_deleted", onOrderUpdate);
      socket.off("order_deleted", updateHandler);
      socket.off("order_closed", onOrderUpdate);
      socket.off("order_closed", updateHandler);
      socket.off("reservation_checked_out", onOrderUpdate);
      socket.off("reservation_checked_out", updateHandler);
      socket.off("reservation_cancelled", onOrderUpdate);
      socket.off("reservation_cancelled", updateHandler);
      socket.off("reservation_deleted", onOrderUpdate);
      socket.off("reservation_deleted", updateHandler);
      socket.off("order_cancelled", logEvent);
      socket.off("order_deleted", logEvent);
      socket.off("order_closed", logEvent);
      socket.off("reservation_checked_out", logEvent);
      socket.off("reservation_cancelled", logEvent);
      socket.off("reservation_deleted", logEvent);
      socket.off("orders_updated", logEvent);
    };
  }, [onOrderUpdate, orderId]);
}

/* ---------- HELPERS ---------- */
const toArray = (val) => (Array.isArray(val) ? val : []);
const parseMaybeJSON = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try {
    return JSON.parse(v);
  } catch {
    return [];
  }
};
const normalizeComparableText = (value) => String(value || "").trim().toLowerCase();
const normalizePublicQrUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw, PUBLIC_API_BASE || (typeof window !== "undefined" ? window.location.origin : undefined));
    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(url.hostname) && PUBLIC_API_BASE) {
      return new URL(`${url.pathname}${url.search}${url.hash}`, PUBLIC_API_BASE).toString();
    }
    return url.toString();
  } catch {
    return "";
  }
};
const buildCheckInQrImageUrl = (qrUrl) => {
  const normalized = normalizePublicQrUrl(qrUrl);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    url.pathname = url.pathname.replace(/\/qr\/([^/?#]+)$/i, "/qr-image/$1");
    url.searchParams.delete("format");
    return url.toString();
  } catch {
    return "";
  }
};
const isDeliveryLikeOrderType = (value) =>
  ["packet", "delivery", "online", "phone"].includes(normalizeComparableText(value));
const ACTIVE_MULTI_ORDER_STATUSES = new Set([
  "new",
  "pending",
  "confirmed",
  "awaiting_confirm",
  "pending_bank_transfer",
  "preparing",
  "ready",
  "open",
  "reserved",
  "checked_in",
  "on_road",
  "in_progress",
  "processing",
  "accepted",
]);
const PAST_MULTI_ORDER_STATUSES = new Set([
  "delivered",
  "served",
  "closed",
  "completed",
  "visit_completed",
  "checked_out",
  "cancelled",
  "canceled",
  "void",
  "deleted",
  "failed",
  "rejected",
]);
const normalizeComparablePhone = (value) => String(value || "").replace(/\D/g, "");
const toOrderTimestamp = (value) => {
  const ts = Date.parse(value || 0);
  return Number.isFinite(ts) ? ts : 0;
};
const normItem = (it) => ({
  id:
    it.id ||
    it.item_id ||
    it.unique_id ||
    `${it.suborder_id || it.order_id || "main"}-${it.product_id || Math.random()}`,
  name: it.name || it.product_name || it.item_name || "",
  price: Number(it.price || 0),
  quantity: Number(it.quantity || 1),
  kitchen_status: it.kitchen_status || it.status || "new",
  note: it.note || "",
  cancellation_reason:
    it.cancellation_reason ||
    it.cancel_reason ||
    it.cancelReason ||
    it.kitchen_cancel_reason ||
    it.reason ||
    "",
  extras: parseMaybeJSON(it.extras),
  payment_method: it.payment_method || it.paymentMethod || null,
  payment_status: it.payment_status || it.paymentStatus || it.payment_state || it.paymentState || null,
  paid: it.paid === true || it.is_paid === true,
  paid_at: it.paid_at || it.paidAt || null,
});

const collectOrderItemsWithSuborders = (orderLike) => {
  if (!orderLike || typeof orderLike !== "object") return [];

  const mainItems = toArray(orderLike.items).map((item, index) => ({
    ...item,
    order_id: item?.order_id ?? orderLike?.id ?? null,
    unique_id:
      item?.unique_id ||
      item?.item_id ||
      item?.id ||
      `order-${orderLike?.id || "main"}-${item?.product_id || index}`,
  }));

  const suborderItems = toArray(orderLike.suborders).flatMap((suborder, suborderIndex) =>
    toArray(suborder?.items).map((item, itemIndex) => ({
      ...item,
      order_id: item?.order_id ?? suborder?.id ?? orderLike?.id ?? null,
      suborder_id: item?.suborder_id ?? suborder?.id ?? null,
      unique_id:
        item?.unique_id ||
        item?.item_id ||
        item?.id ||
        `suborder-${suborder?.id || suborderIndex}-${item?.product_id || itemIndex}`,
    }))
  );

  const seen = new Set();
  return [...mainItems, ...suborderItems].filter((item, index) => {
    const key = String(
      item?.unique_id ||
        item?.item_id ||
        item?.id ||
        `${item?.suborder_id || item?.order_id || "main"}-${item?.product_id || index}`
    );
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const computeTenantSuffix = () => {
  if (typeof window === "undefined") return "";
  try {
    const native = window.localStorage;
    if (!native) return "";
    const storedId = native.getItem("restaurant_id");
    if (storedId && storedId !== "undefined" && storedId !== "null") {
      return `${storedId}_`;
    }

    const params = new URLSearchParams(window.location.search);
    const queryTenant =
      params.get("tenant_id") ||
      params.get("tenant") ||
      params.get("restaurant_id") ||
      params.get("restaurant");

    if (queryTenant && queryTenant !== "undefined" && queryTenant !== "null") {
      return `${queryTenant}_`;
    }

    const pathSegments = (window.location.pathname || "")
      .split("/")
      .filter(Boolean);
    const qrIndex = pathSegments.indexOf("qr-menu");
    if (qrIndex !== -1 && pathSegments[qrIndex + 1]) {
      return `${pathSegments[qrIndex + 1]}_`;
    }
  } catch {
    // Ignore local storage/path parsing failures and fall back to the legacy key.
  }
  return "";
};

const resolveQrKey = (key) => {
  if (!key?.startsWith?.(QR_PREFIX)) return key;
  const suffix = computeTenantSuffix();
  if (!suffix) return key;
  const base = key.slice(QR_PREFIX.length);
  return `${QR_PREFIX}${suffix}${base}`;
};

const getQrKeyVariants = (key) => {
  if (!key?.startsWith?.(QR_PREFIX)) return [key];
  const scoped = resolveQrKey(key);
  if (scoped === key) return [key];
  return [scoped, key];
};

const readDeliveryReorderContext = () => {
  if (typeof window === "undefined") return null;
  try {
    const native = window.localStorage;
    if (!native) return null;
    let raw = null;
    for (const candidate of getQrKeyVariants(DELIVERY_REORDER_CONTEXT_KEY)) {
      raw = native.getItem(candidate);
      if (raw) break;
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sourceOrderIds = Array.isArray(parsed?.sourceOrderIds)
      ? parsed.sourceOrderIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];
    const targetOrderIds = Array.isArray(parsed?.targetOrderIds)
      ? parsed.targetOrderIds
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];
    if (sourceOrderIds.length === 0 || targetOrderIds.length === 0) return null;
    return {
      mode: String(parsed?.mode || "").trim().toLowerCase(),
      sourceOrderIds,
      targetOrderIds,
    };
  } catch {
    return null;
  }
};

const normalizeReservationStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const isCheckedInReservationStatus = (value) => {
  const normalized = normalizeReservationStatus(value);
  return normalized === "checked_in" || normalized === "checkedin" || normalized === "checkin";
};

const isCheckedOutReservationStatus = (value) => {
  const normalized = normalizeReservationStatus(value);
  return normalized === "checked_out" || normalized === "checkedout" || normalized === "checkout";
};

const isCancelledItemStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return ["canceled", "cancelled", "void", "deleted"].includes(status);
};

const isPaidLikeItem = (item) => {
  if (!item || typeof item !== "object") return false;
  const paymentStatus = String(
    item?.payment_status ?? item?.paymentStatus ?? item?.payment_state ?? item?.paymentState ?? ""
  ).toLowerCase();
  return Boolean(item?.paid === true || item?.is_paid === true || item?.paid_at || item?.paidAt || paymentStatus === "paid");
};

const isCancelledLikeOrderStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return ["canceled", "cancelled", "void", "deleted"].includes(status);
};

const isFinishedLikeOrderStatus = (value) => {
  const status = String(value || "").toLowerCase();
  return ["delivered", "served", "closed", "completed", "visit_completed", "checked_out"].includes(status);
};

const extractCancellationReason = (source) => {
  if (!source || typeof source !== "object") return "";
  return String(
    source?.cancellation_reason ||
    source?.cancel_reason ||
    source?.cancelReason ||
    source?.delete_reason ||
    source?.deletion_reason ||
    source?.deleteReason ||
    source?.cancellationReason ||
    source?.payment_cancellation_reason ||
    source?.payment_cancel_reason ||
    source?.paymentCancellationReason ||
    source?.paymentCancelReason ||
    source?.cancel_note ||
    source?.cancellation_note ||
    source?.concert_booking_reason ||
    source?.concertBookingReason ||
    source?.reason ||
    ""
  ).trim();
};

const resolveOrderCancellationReason = (orderLike, fallback = "") => {
  if (!orderLike || typeof orderLike !== "object") return String(fallback || "").trim();
  const reservation =
    orderLike?.reservation && typeof orderLike.reservation === "object"
      ? orderLike.reservation
      : null;
  const concertBooking =
    orderLike?.concert_booking && typeof orderLike.concert_booking === "object"
      ? orderLike.concert_booking
      : null;
  return String(
    extractCancellationReason(orderLike) ||
      extractCancellationReason(reservation) ||
      extractCancellationReason(concertBooking) ||
      orderLike?.concert_booking_cancellation_reason ||
      orderLike?.concert_booking_cancellationReason ||
      orderLike?.concertBookingCancellationReason ||
      orderLike?.concert_booking_cancel_reason ||
      orderLike?.concert_booking_cancelReason ||
      orderLike?.concertBookingCancelReason ||
      orderLike?.concert_booking_delete_reason ||
      orderLike?.concert_booking_deleteReason ||
      orderLike?.concertBookingDeleteReason ||
      orderLike?.concert_booking_reason ||
      orderLike?.concertBookingReason ||
      orderLike?.concert_booking_payment_cancellation_reason ||
      orderLike?.concertBookingPaymentCancellationReason ||
      orderLike?.concert_booking_payment_cancel_reason ||
      orderLike?.concertBookingPaymentCancelReason ||
      fallback ||
      ""
  ).trim();
};

const hasReservationData = (entry) => {
  if (!entry || typeof entry !== "object") return false;
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  return Boolean(
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

const isReservationPendingCheckIn = (entry, fallbackStatus = null) => {
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
  const fallback = normalizeReservationStatus(fallbackStatus);
  const status = directStatus || nestedStatus || flatReservationStatus || fallback;
  const hasReservationContext = hasReservationData(entry);
  if (!hasReservationContext) return false;
  if (entry?.checked_in === true || nested?.checked_in === true) return false;
  if (
    isCancelledLikeOrderStatus(status) ||
    isCancelledLikeOrderStatus(nestedStatus) ||
    isCancelledLikeOrderStatus(flatReservationStatus)
  ) {
    return false;
  }
  if (
    [
      status,
      directStatus,
      nestedStatus,
      flatReservationStatus,
      fallback,
    ].some((value) => isCheckedInReservationStatus(value))
  ) {
    return false;
  }
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

const readScopedStorageItem = (key) => {
  if (typeof window === "undefined") return "";
  try {
    const native = window.localStorage;
    if (!native) return "";
    for (const candidate of getQrKeyVariants(key)) {
      const value = native.getItem(candidate);
      if (value) return value;
    }
    return "";
  } catch {
    return "";
  }
};

const readScopedCustomerSession = () => {
  const raw = readScopedStorageItem("qr_customer_session");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeOrdersPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.orders)) return payload.orders;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
};

const extractAccountHintsFromOrder = (orderLike) => {
  if (!orderLike || typeof orderLike !== "object") return {};
  const reservation =
    orderLike?.reservation && typeof orderLike.reservation === "object" ? orderLike.reservation : null;
  const customer =
    orderLike?.customer && typeof orderLike.customer === "object" ? orderLike.customer : null;
  const customerId = Number(
    orderLike?.customer_id ??
      orderLike?.customerId ??
      reservation?.customer_id ??
      reservation?.customerId ??
      customer?.id ??
      0
  );
  return {
    customerId: Number.isFinite(customerId) && customerId > 0 ? customerId : null,
    email: normalizeComparableText(
      orderLike?.customer_email ||
        orderLike?.email ||
        reservation?.customer_email ||
        reservation?.email ||
        customer?.email
    ),
    phone: normalizeComparablePhone(
      orderLike?.customer_phone ||
        orderLike?.phone ||
        reservation?.customer_phone ||
        reservation?.phone ||
        customer?.phone
    ),
    name: normalizeComparableText(
      orderLike?.customer_name ||
        orderLike?.username ||
        orderLike?.name ||
        reservation?.customer_name ||
        customer?.username ||
        customer?.name
    ),
  };
};

const mergeAccountHints = (...hintsList) => {
  const seed = { customerId: null, email: "", phone: "", name: "" };
  for (const hints of hintsList) {
    if (!hints || typeof hints !== "object") continue;
    if (!seed.customerId && Number.isFinite(Number(hints.customerId)) && Number(hints.customerId) > 0) {
      seed.customerId = Number(hints.customerId);
    }
    if (!seed.email && hints.email) seed.email = normalizeComparableText(hints.email);
    if (!seed.phone && hints.phone) seed.phone = normalizeComparablePhone(hints.phone);
    if (!seed.name && hints.name) seed.name = normalizeComparableText(hints.name);
  }
  return seed;
};

const orderMatchesHints = (orderLike, hints = {}) => {
  if (!orderLike || typeof orderLike !== "object") return false;
  const orderHints = extractAccountHintsFromOrder(orderLike);
  if (hints.customerId && orderHints.customerId && Number(orderHints.customerId) === Number(hints.customerId)) {
    return true;
  }
  if (hints.email && orderHints.email && orderHints.email === hints.email) return true;
  if (hints.phone && orderHints.phone && orderHints.phone === hints.phone) return true;
  if (hints.name && orderHints.name && orderHints.name === hints.name) return true;
  return false;
};

const normalizeOrderTypeForPortfolio = (orderLike) => {
  const orderType = normalizeComparableText(orderLike?.order_type || orderLike?.orderType);
  const concertBookingType = normalizeComparableText(
    orderLike?.concert_booking_type || orderLike?.concertBookingType
  );
  const hasTicketContext =
    Number(orderLike?.concert_booking_id || orderLike?.concertBookingId) > 0 ||
    concertBookingType === "ticket" ||
    orderType === "ticket";

  if (hasTicketContext) return "ticket";
  if (hasReservationData(orderLike) || orderType === "reservation") return "reservation";
  if (isDeliveryLikeOrderType(orderType)) return "delivery";
  return "order";
};

const normalizeOrderStatusForPortfolio = (orderLike) =>
  normalizeReservationStatus(
    orderLike?.status ||
      orderLike?.order_status ||
      orderLike?.orderStatus ||
      orderLike?.reservation_status ||
      orderLike?.reservationStatus
  );

const isActivePortfolioStatus = (status) => {
  const normalized = normalizeReservationStatus(status);
  if (!normalized) return false;
  if (PAST_MULTI_ORDER_STATUSES.has(normalized)) return false;
  if (ACTIVE_MULTI_ORDER_STATUSES.has(normalized)) return true;
  return true;
};

const resolveOrderGroupKey = (orderLike) => {
  const directGroupKey =
    orderLike?.relation_group_id ||
    orderLike?.relationGroupId ||
    orderLike?.group_id ||
    orderLike?.groupId ||
    orderLike?.order_group_id ||
    orderLike?.orderGroupId ||
    orderLike?.bundle_id ||
    orderLike?.bundleId ||
    orderLike?.booking_bundle_id ||
    orderLike?.bookingBundleId ||
    orderLike?.relation_id ||
    orderLike?.relationId;
  if (directGroupKey) return `group:${directGroupKey}`;

  const reservationId =
    orderLike?.reservation_id ||
    orderLike?.reservationId ||
    orderLike?.reservation?.id ||
    orderLike?.reservation?.reservation_id ||
    orderLike?.reservation?.reservationId;
  if (reservationId) return `reservation:${reservationId}`;

  const concertBookingId =
    orderLike?.concert_booking_id ||
    orderLike?.concertBookingId ||
    orderLike?.concert_booking?.id ||
    orderLike?.concertBooking?.id;
  if (concertBookingId) return `ticket:${concertBookingId}`;

  const linkedOrderId =
    orderLike?.parent_order_id ||
    orderLike?.parentOrderId ||
    orderLike?.source_order_id ||
    orderLike?.sourceOrderId ||
    orderLike?.related_order_id ||
    orderLike?.relatedOrderId;
  if (linkedOrderId) return `linked:${linkedOrderId}`;

  return `order:${
    orderLike?.id ||
    orderLike?.order_id ||
    orderLike?.orderId ||
    orderLike?.created_at ||
    orderLike?.createdAt ||
    "unknown"
  }`;
};

const isOrderPaidLikeForPortfolio = (orderLike) => {
  const paymentStatus = normalizeReservationStatus(
    orderLike?.payment_status ||
      orderLike?.paymentStatus ||
      orderLike?.concert_booking_payment_status ||
      orderLike?.concertBookingPaymentStatus
  );
  return Boolean(
    orderLike?.is_paid === true ||
      orderLike?.paid === true ||
      paymentStatus === "paid" ||
      paymentStatus === "confirmed"
  );
};

const isOrderActionNeeded = (orderLike, normalizedStatus, type) => {
  if (normalizedStatus === "pending_bank_transfer") return true;
  if (normalizedStatus === "awaiting_confirm") return true;
  if (type === "ticket" && !isOrderPaidLikeForPortfolio(orderLike)) return true;
  return false;
};

const hasUpcomingReservationWindow = (orderLike) => {
  const reservationDate =
    orderLike?.reservation?.reservation_date || orderLike?.reservation_date || orderLike?.reservationDate;
  const reservationTime =
    orderLike?.reservation?.reservation_time || orderLike?.reservation_time || orderLike?.reservationTime;
  const normalizedDate = String(reservationDate || "").trim();
  const normalizedTime = String(reservationTime || "").trim();
  if (!normalizedDate && !normalizedTime) return false;
  const candidate = normalizedDate && normalizedTime ? `${normalizedDate} ${normalizedTime}` : normalizedDate;
  const ts = Date.parse(candidate);
  if (!Number.isFinite(ts)) return true;
  const now = Date.now();
  const diff = ts - now;
  return diff >= -2 * 60 * 60 * 1000;
};

const getGroupPriorityScore = (group) => {
  const primary = group?.primary || {};
  const type = primary.type || "order";
  const status = primary.status || "";
  const active = isActivePortfolioStatus(status);
  let score = 0;
  if (active) score += 200;
  if (type === "delivery" && active) score += 120;
  if (type === "reservation" && active && hasUpcomingReservationWindow(primary.raw)) score += 100;
  if (type === "ticket" && isOrderActionNeeded(primary.raw, status, type)) score += 90;
  if (group?.relationLabel) score += 10;
  if (group?.updatedAtMs) score += Math.min(50, Math.floor(group.updatedAtMs / 1_000_000_000));
  return score;
};

const dedupeOrdersById = (orders) => {
  const map = new Map();
  for (const raw of Array.isArray(orders) ? orders : []) {
    const normalizedId = Number(raw?.id || raw?.order_id || raw?.orderId || 0);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) continue;
    const existing = map.get(normalizedId);
    if (!existing) {
      map.set(normalizedId, raw);
      continue;
    }
    const existingTs = Math.max(
      toOrderTimestamp(existing?.updated_at || existing?.updatedAt),
      toOrderTimestamp(existing?.created_at || existing?.createdAt)
    );
    const nextTs = Math.max(
      toOrderTimestamp(raw?.updated_at || raw?.updatedAt),
      toOrderTimestamp(raw?.created_at || raw?.createdAt)
    );
    if (nextTs >= existingTs) map.set(normalizedId, raw);
  }
  return Array.from(map.values());
};

const buildMultiOrderModel = (orders = [], fallbackOrderId = null) => {
  const rows = dedupeOrdersById(orders)
    .map((raw) => {
      const id = Number(raw?.id || raw?.order_id || raw?.orderId || 0);
      if (!Number.isFinite(id) || id <= 0) return null;
      const status = normalizeOrderStatusForPortfolio(raw);
      const type = normalizeOrderTypeForPortfolio(raw);
      const createdAt = raw?.created_at || raw?.createdAt || null;
      const updatedAt = raw?.updated_at || raw?.updatedAt || createdAt || null;
      const createdAtMs = toOrderTimestamp(createdAt);
      const updatedAtMs = toOrderTimestamp(updatedAt || createdAt);
      const total = Number(raw?.total || raw?.grand_total || raw?.amount_total || 0) || 0;
      const itemCount = Number(raw?.items_count || raw?.item_count || raw?.itemsCount || raw?.itemCount || 0) || 0;
      return {
        id,
        raw,
        status,
        type,
        createdAt,
        updatedAt,
        createdAtMs,
        updatedAtMs,
        total,
        itemCount,
        groupKey: resolveOrderGroupKey(raw),
        actionNeeded: isOrderActionNeeded(raw, status, type),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const groupsMap = new Map();
  for (const entry of rows) {
    const key = entry.groupKey;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(entry);
  }

  const groups = Array.from(groupsMap.entries()).map(([key, entries]) => {
    const sortedEntries = entries.slice().sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    const primary = sortedEntries[0];
    const hasReservation = sortedEntries.some((entry) => entry.type === "reservation");
    const hasTicket = sortedEntries.some((entry) => entry.type === "ticket");
    const relationLabel =
      sortedEntries.length > 1
        ? hasReservation && hasTicket
          ? "Booking Bundle"
          : hasReservation
          ? "Related to your reservation"
          : "Related orders"
        : "";
    const hasActive = sortedEntries.some((entry) => isActivePortfolioStatus(entry.status));
    const updatedAtMs = sortedEntries.reduce((max, entry) => Math.max(max, entry.updatedAtMs), 0);
    return {
      key,
      entries: sortedEntries,
      primary,
      type: primary?.type || "order",
      status: primary?.status || "",
      relationLabel,
      hasActive,
      updatedAtMs,
      hasActionNeeded: sortedEntries.some((entry) => entry.actionNeeded),
    };
  });

  const activeGroups = groups
    .filter((group) => group.hasActive)
    .sort((a, b) => {
      const scoreDiff = getGroupPriorityScore(b) - getGroupPriorityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.updatedAtMs - a.updatedAtMs;
    });
  const pastGroups = groups
    .filter((group) => !group.hasActive)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

  const fallbackId = Number(fallbackOrderId || 0);
  const fallbackGroup =
    Number.isFinite(fallbackId) && fallbackId > 0
      ? activeGroups.find((group) => group.entries.some((entry) => entry.id === fallbackId)) ||
        pastGroups.find((group) => group.entries.some((entry) => entry.id === fallbackId))
      : null;

  const currentOrderGroup = activeGroups[0] || fallbackGroup || pastGroups[0] || null;
  const otherActive = activeGroups.filter((group) => group.key !== currentOrderGroup?.key);

  return {
    currentOrderGroup,
    otherActive,
    pastGroups,
    activeCount: activeGroups.length,
  };
};

/* ---------- UI COMPONENTS (UI-only; no business logic) ---------- */
function OrderStatusHeader({ t, title, subtitle, meta, onBack }) {
  return (
    <header className="sticky top-0 z-[120] bg-white/95 dark:bg-neutral-950/95 backdrop-blur border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto w-full max-w-[640px] px-4 py-3">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="h-10 w-10 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 active:bg-neutral-200 dark:active:bg-neutral-800 transition text-neutral-900 dark:text-neutral-100"
              aria-label={t("Back")}
            >
              <span className="text-xl leading-none">←</span>
            </button>
          ) : (
            <div className="h-10 w-10 -ml-1" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {title}
              </h1>
              {meta ? (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">{meta}</div>
              ) : null}
            </div>
            {subtitle ? (
              <div className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{subtitle}</div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusScreenTabs({ t, activeView, onSelect, showRequestSong }) {
  if (!showRequestSong) return null;

  const baseClass =
    "inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-medium transition";
  const activeClass =
    "bg-slate-900 text-white shadow-sm border border-slate-900";
  const inactiveClass =
    "border border-transparent bg-transparent text-slate-600 hover:bg-white hover:text-slate-900 dark:text-white dark:hover:bg-white/10 dark:hover:text-white";

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white/90 p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onSelect("status")}
          className={[baseClass, activeView === "status" ? activeClass : inactiveClass].join(" ")}
        >
          {t("Order Status")}
        </button>
        <button
          type="button"
          onClick={() => onSelect("request_song")}
          className={[baseClass, activeView === "request_song" ? activeClass : inactiveClass].join(" ")}
        >
          <span className="inline-flex items-center gap-2">
            <Music2 className="h-4 w-4" />
            <span>{t("Request Song")}</span>
          </span>
        </button>
      </div>
    </section>
  );
}

function OrderProgressStepper({ t, currentStepIndex = 0, isCancelled = false }) {
  const steps = [
    { key: "received", label: t("Order received") },
    { key: "preparing", label: t("Preparing") },
    { key: "ready", label: t("Order ready") },
    { key: "delivered", label: t("Delivered") },
  ];

  if (isCancelled) {
    return (
      <section className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-4">
        <div className="text-sm font-semibold text-rose-700">
          {t("Order Cancelled")}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:flex sm:items-center sm:justify-between sm:gap-2">
        {steps.map((s, idx) => {
          const isDone = idx < currentStepIndex;
          const isActive = idx === currentStepIndex;
          return (
            <div key={s.key} className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div
                  className={[
                    "h-7 w-7 rounded-full border flex items-center justify-center text-xs font-semibold shrink-0",
                    isDone
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : isActive
                      ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                      : "bg-white dark:bg-neutral-950 text-neutral-400 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800",
                  ].join(" ")}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <div className="min-w-0">
                  <div
                    className={[
                      "text-xs leading-tight truncate",
                      isDone
                        ? "text-neutral-700 dark:text-neutral-300"
                        : isActive
                        ? "text-neutral-900 dark:text-neutral-100 font-semibold"
                        : "text-neutral-500 dark:text-neutral-400",
                    ].join(" ")}
                  >
                    {s.label}
                  </div>
                </div>
              </div>
              {idx !== steps.length - 1 ? (
                <div className="mt-2 h-[2px] w-full bg-neutral-200 dark:bg-neutral-800 rounded-full hidden sm:block">
                  <div
                    className={[
                      "h-[2px] rounded-full",
                      isDone
                        ? "w-full bg-emerald-600"
                        : isActive
                        ? "w-1/2 bg-neutral-900 dark:bg-white"
                        : "w-0 bg-neutral-200 dark:bg-neutral-800",
                    ].join(" ")}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OrderSummaryCard({
  t,
  title,
  statusLabel,
  statusToneClass,
  secondaryStatusLabel,
  secondaryStatusToneClass,
  headerActionLabel,
  onHeaderAction,
  driverMessage,
  timerLabel,
  paymentLabel,
  createdAtLabel,
  reservedAtLabel,
  reservationGuestsLabel,
  totalLabel,
  cancelReason,
  isCancelled,
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {title}
          </div>
          <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            {createdAtLabel}
          </div>
          {driverMessage ? (
            <div className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
              {driverMessage}
            </div>
          ) : null}
          {reservedAtLabel ? (
            <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {t("Reservation Time")}: {reservedAtLabel}
            </div>
          ) : null}
          {reservationGuestsLabel ? (
            <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {t("Guests")}: {reservationGuestsLabel}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {typeof onHeaderAction === "function" && headerActionLabel ? (
            <button
              type="button"
              onClick={onHeaderAction}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sky-400/18 bg-slate-950/96 px-3 text-[11px] font-semibold text-sky-100 shadow-[0_14px_30px_rgba(2,8,23,0.52)] transition hover:bg-slate-900"
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>{headerActionLabel}</span>
            </button>
          ) : null}

          <div
            className={[
              "shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold shadow-sm",
              isCancelled
                ? "bg-rose-50 dark:bg-rose-950/30 text-rose-700 border-rose-200 dark:border-rose-900"
                : statusToneClass || "bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800",
            ].join(" ")}
          >
            {statusLabel}
          </div>
          {secondaryStatusLabel ? (
            <div
              className={[
                "shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold shadow-sm",
                secondaryStatusToneClass ||
                  "bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-800",
              ].join(" ")}
            >
              {secondaryStatusLabel}
            </div>
          ) : null}
        </div>
      </div>

      {isCancelled && cancelReason ? (
        <div className="mt-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
            {t("Cancellation reason")}
          </div>
          <div className="mt-0.5 text-sm text-rose-700 dark:text-rose-200">{cancelReason}</div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Time")}</div>
          <div className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {timerLabel}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 px-3 py-2">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{t("Payment")}</div>
          <div className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {paymentLabel}
          </div>
        </div>
        <div className={`rounded-xl border px-3 py-2 ${isCancelled ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900" : statusToneClass || "bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"}`}>
          <div className={`text-[11px] ${isCancelled ? "text-rose-600 dark:text-rose-300" : statusToneClass ? "text-current/80" : "text-neutral-500 dark:text-neutral-400"}`}>{t("Status")}</div>
          <div className={`mt-0.5 text-sm font-semibold truncate ${isCancelled ? "text-rose-700 dark:text-rose-200" : statusToneClass ? "text-current" : "text-neutral-900 dark:text-neutral-100"}`}>
            {statusLabel}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReservationPendingBadge({ t }) {
  return (
    <section className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-950/40 dark:via-neutral-900 dark:to-orange-950/20 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <span className="text-base font-semibold">i</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Reservation pending check-in")}
          </div>
          <div className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
            {t("Please check in at the restaurant to unlock ordering for this table.")}
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckInQrCard({ t, qrImageUrl, qrUrl }) {
  if (!qrImageUrl) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {t("Check-in Code")}
      </div>
      <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        {t("Show this QR code at the venue for fast check-in.")}
      </div>
      <div className="mt-4 flex justify-center">
        <div className="rounded-[28px] border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4 shadow-sm">
          <img
            src={qrImageUrl}
            alt={t("Check-in QR Code")}
            width="220"
            height="220"
            className="block h-[220px] w-[220px] rounded-2xl bg-white object-contain"
            loading="lazy"
          />
        </div>
      </div>
      {qrUrl ? (
        <div className="mt-4 text-center">
          <a
            href={qrImageUrl || qrUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full border border-neutral-300 dark:border-neutral-700 px-4 text-sm font-semibold text-neutral-800 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            {t("Open Check-in Code")}
          </a>
        </div>
      ) : null}
    </section>
  );
}

function OrderItemsList({ t, items, totalLabel, formatCurrency, badgeColor, displayStatus, pmLabel }) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {t("Items")}
        </div>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {items.map((item) => {
          const quantity = Number(item.quantity || 1);
          const basePrice = Number(item.price || 0);
          const baseTotal = basePrice * quantity;
          const isItemPaid = !!item.paid_at;
          const isLocked = item.locked === true;
          const itemPm = pmLabel(item.payment_method);
          const isItemCancelled = isCancelledItemStatus(item.kitchen_status);
          const itemCancelReason = String(item.cancellation_reason || "").trim();

          return (
            <li key={item.id} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 text-center">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 text-sm font-semibold">
                    {quantity}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {item.name || t("Item")}
                      </div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span
                          className={[
                            "text-[11px] px-2 py-0.5 rounded-full border",
                            badgeColor(item.kitchen_status),
                          ].join(" ")}
                        >
                          {displayStatus(item.kitchen_status)}
                        </span>
                        {isItemPaid ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900">
                            {itemPm}
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800">
                            {t("Unpaid")}
                          </span>
                        )}
                        {isLocked ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full border bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700">
                            {t("Locked")}
                          </span>
                        ) : null}
                      </div>

                      {item.extras?.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {item.extras.map((ex, i) => {
                            const totalQty = (Number(ex.quantity || 1) || 1) * quantity;
                            return (
                              <div key={i} className="text-xs text-neutral-600 dark:text-neutral-300">
                                + {ex.name} ×{totalQty}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {item.note ? (
                        <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                          <span className="font-medium text-neutral-700 dark:text-neutral-200">
                            {t("Note")}:
                          </span>{" "}
                          {item.note}
                        </div>
                      ) : null}

                      {isItemCancelled && itemCancelReason ? (
                        <div className="mt-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-2 py-1.5 text-xs text-rose-700 dark:text-rose-300">
                          <span className="font-semibold">{t("Reason")}:</span> {itemCancelReason}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatCurrency(baseTotal)}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {formatCurrency(basePrice)} ×{quantity}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-300">{t("Total")}</div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{totalLabel}</div>
        </div>
      </div>
    </section>
  );
}

function InlineBottomActions({
  t,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="flex items-center gap-2">
        {onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="h-11 px-4 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 active:bg-neutral-100 dark:active:bg-neutral-800 transition font-semibold"
          >
            {secondaryLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrimary}
          disabled={!onPrimary}
          className="h-11 px-5 rounded-xl bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-950 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {primaryLabel}
        </button>
      </div>
    </section>
  );
}

function getPortfolioTypeMeta(type, t) {
  const normalized = String(type || "order").toLowerCase();
  if (normalized === "reservation") {
    return {
      label: t("Reservation"),
      Icon: CalendarDays,
      badgeClass:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    };
  }
  if (normalized === "ticket") {
    return {
      label: t("Ticket"),
      Icon: Ticket,
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }
  if (normalized === "delivery") {
    return {
      label: t("Delivery"),
      Icon: Truck,
      badgeClass:
        "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
    };
  }
  return {
    label: t("Order"),
    Icon: ShoppingBag,
    badgeClass:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  };
}

function getPortfolioStatusDotClass(status) {
  const normalized = normalizeReservationStatus(status);
  if (["cancelled", "canceled", "void", "deleted", "failed"].includes(normalized)) return "bg-rose-500";
  if (["awaiting_confirm", "pending_bank_transfer", "pending"].includes(normalized)) return "bg-amber-500";
  if (["ready"].includes(normalized)) return "bg-blue-500";
  if (["on_road"].includes(normalized)) return "bg-sky-500";
  if (["delivered", "served", "closed", "completed", "checked_out", "visit_completed"].includes(normalized)) {
    return "bg-neutral-400";
  }
  return "bg-emerald-500";
}

function formatPortfolioDate(value, t) {
  const ts = toOrderTimestamp(value);
  if (!ts) return t("—");
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return t("—");
  }
}

function buildPortfolioOrderMeta(order, t) {
  if (!order || typeof order !== "object") return "";
  const parts = [];
  const tableNo = Number(
    order?.table_number ||
      order?.tableNumber ||
      order?.reservation?.table_number ||
      order?.reservation?.tableNumber ||
      0
  );
  const eventName =
    order?.concert_booking?.event_name ||
    order?.concert_booking?.name ||
    order?.concert_booking_name ||
    order?.event_name ||
    order?.eventName ||
    "";
  if (eventName) parts.push(String(eventName));
  if (Number.isFinite(tableNo) && tableNo > 0) parts.push(`${t("Table")} ${tableNo}`);

  const reservationTime =
    order?.reservation?.reservation_time || order?.reservation_time || order?.reservationTime || "";
  const reservationDate =
    order?.reservation?.reservation_date || order?.reservation_date || order?.reservationDate || "";
  if (reservationTime || reservationDate) parts.push([reservationDate, reservationTime].filter(Boolean).join(" "));

  if (parts.length > 0) return parts.join(" • ");

  const deliveryAddress = String(order?.customer_address || order?.address || "").trim();
  if (deliveryAddress) return deliveryAddress;
  return "";
}

function MultiOrderCard({
  t,
  group,
  isHero = false,
  formatCurrency,
  displayStatus,
}) {
  const [expanded, setExpanded] = useState(Boolean(isHero));
  const entry = group?.primary;
  if (!entry) return null;

  const typeMeta = getPortfolioTypeMeta(group.type, t);
  const statusLabel = displayStatus(entry.status);
  const statusDotClass = getPortfolioStatusDotClass(entry.status);
  const relationLabel = group?.relationLabel ? t(group.relationLabel) : "";
  const childCount = Math.max(0, (group?.entries?.length || 0) - 1);
  const shouldShowExpander = childCount > 0;
  const raw = entry.raw || {};
  const orderMeta = buildPortfolioOrderMeta(raw, t);
  const headline = `${typeMeta.label} #${entry.id}`;
  const totalLabel = formatCurrency(Number(entry.total || 0));
  const actionLabel = group?.hasActionNeeded ? t("Action needed") : "";
  const freshOrder = Date.now() - Number(entry.createdAtMs || 0) < 10 * 60 * 1000;
  const newLabel = freshOrder ? t("New") : "";

  return (
    <section
      className={`rounded-2xl border px-4 py-3 ${
        isHero
          ? "border-slate-300 dark:border-slate-700 bg-white dark:bg-neutral-900 shadow-sm"
          : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${typeMeta.badgeClass}`}
            >
              <typeMeta.Icon className="h-3.5 w-3.5" />
              <span>{typeMeta.label}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
              <span>{statusLabel}</span>
            </span>
            {actionLabel ? (
              <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                {actionLabel}
              </span>
            ) : null}
            {!actionLabel && newLabel ? (
              <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                {newLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
            {headline}
          </div>

          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {formatPortfolioDate(entry.updatedAt || entry.createdAt, t)}
          </div>

          {orderMeta ? (
            <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300 truncate">{orderMeta}</div>
          ) : null}

          {relationLabel ? (
            <div className="mt-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">{relationLabel}</div>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{totalLabel}</div>
          {shouldShowExpander ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:text-neutral-200"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>{`+${childCount} ${t("more")}`}</span>
            </button>
          ) : null}
        </div>
      </div>

      {shouldShowExpander && expanded ? (
        <div className="mt-3 space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          {group.entries.slice(1).map((child) => {
            const childMeta = getPortfolioTypeMeta(child.type, t);
            return (
              <div
                key={`${group.key}-${child.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                    <childMeta.Icon className="h-3.5 w-3.5" />
                    <span>{`${childMeta.label} #${child.id}`}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {displayStatus(child.status)}
                  </div>
                </div>
                <div className="shrink-0 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  {formatCurrency(Number(child.total || 0))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function MultiOrderSection({
  t,
  title,
  count = null,
  groups = [],
  emptyLabel,
  hero = false,
  formatCurrency,
  displayStatus,
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
          {title}
        </h3>
        {Number.isFinite(count) ? (
          <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{count}</span>
        ) : null}
      </div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-3 text-xs text-neutral-500 dark:text-neutral-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <MultiOrderCard
              key={group.key}
              t={t}
              group={group}
              isHero={hero}
              formatCurrency={formatCurrency}
              displayStatus={displayStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- MAIN COMPONENT ---------- */
const OrderStatusScreen = ({
  orderId,
  table,
  onOrderAnother,
  onCheckout,
  onClose,
  onFinished,
  checkoutPending = false,
  forceLock = false,
  forceDark,
  orderScreenStatus = null,
  t: providedT = null,
  buildUrl = (p) => p,
  appendIdentifier,
  checkoutCompletedView = false,
  externalCancelReason = "",
  hideNativeHeader = false,
  offsetForAppHeader = false,
}) => {
  const { t: hookT } = useTranslation();
  const t = typeof providedT === "function" ? providedT : hookT;
  const normalizedOrderScreenStatus = normalizeReservationStatus(orderScreenStatus);
  const hasReservedStatusHint = ["reserved", "awaiting_confirm", "booking_confirm"].includes(
    normalizedOrderScreenStatus
  );
  const [isDarkUi, setIsDarkUi] = useState(() => (typeof forceDark === "boolean" ? forceDark : false));
  const [order, setOrder] = useState(null);
  const [accountOrders, setAccountOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [timer, setTimer] = useState("00:00");
  const [order404, setOrder404] = useState(false);
  const [checkedInSticky, setCheckedInSticky] = useState(false);
  const [checkedOutSticky, setCheckedOutSticky] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [activeScreenView, setActiveScreenView] = useState("status");
  const [songRequests, setSongRequests] = useState([]);
  const [songRequestName, setSongRequestName] = useState("");
  const [songRequestSubmitting, setSongRequestSubmitting] = useState(false);
  const intervalRef = useRef(null);
  const joinedRestaurantRef = useRef(null);
  const driversCacheRef = useRef({ fetchedAtMs: 0, byId: new Map() });
  const accountOrdersFetchRef = useRef({ key: "", fetchedAtMs: 0 });
  const { formatCurrency } = useCurrency();

  const FINISHED_STATES = ["closed", "completed"]; // keep cancelled visible
  const hasReservationPayload = useCallback((entry) => {
    return hasReservationData(entry);
  }, []);

  useEffect(() => {
    setCheckedInSticky(false);
    setCheckedOutSticky(false);
    setOrder(null);
    setItems([]);
    setAccountOrders([]);
    setOrder404(false);
    setIsTrackingOpen(false);
    setActiveScreenView("status");
    setSongRequests([]);
    setSongRequestName("");
    setSongRequestSubmitting(false);
  }, [orderId]);

  useEffect(() => {
    if (isCheckedInReservationStatus(normalizedOrderScreenStatus)) {
      setCheckedInSticky(true);
    }
  }, [normalizedOrderScreenStatus]);

  useEffect(() => {
    if (checkoutCompletedView || isCheckedOutReservationStatus(normalizedOrderScreenStatus)) {
      setCheckedOutSticky(true);
    }
  }, [checkoutCompletedView, normalizedOrderScreenStatus]);

  useEffect(() => {
    if (typeof forceDark === "boolean") {
      setIsDarkUi(forceDark);
      return;
    }
    const resolve = () => {
      const mode = String(localStorage.getItem("qr_theme") || "auto")
        .trim()
        .toLowerCase();
      if (mode === "dark") return true;
      if (mode === "light") return false;
      try {
        return !!window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      } catch {
        return false;
      }
    };
    setIsDarkUi(resolve());
    const onStorage = (e) => {
      if (e?.key === "qr_theme") setIsDarkUi(resolve());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [forceDark]);

  const pmLabel = (m) => {
    const raw = String(m || "").trim();
    if (!raw) return "—";
    const tokens = raw
      .split("+")
      .map((tok) => tok.trim())
      .filter(Boolean);
    const mapped = tokens.map((tok) => {
      switch (tok.toLowerCase()) {
        case "online":
          return t("Online");
        case "card":
          return t("Card");
        case "card at table":
          return t("Card");
        case "cash":
          return t("Cash");
        case "split":
          return t("Split");
        case "sodexo":
          return "Sodexo";
        case "multinet":
          return "Multinet";
        default:
          return tok;
      }
    });
    return mapped.join("+");
  };

  const fetchJSON = useCallback(
    async (path, options = {}) => {
      const endpoint = appendIdentifier ? appendIdentifier(path) : path;
      const absoluteUrl = appendIdentifier ? appendIdentifier(buildUrl(path)) : buildUrl(path);

      // First try as fully public (no auth header)
      try {
        const headers = {
          Accept: "application/json",
          ...(options.headers || {}),
        };
        if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
        const res = await fetch(absoluteUrl, { ...options, headers });
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        // If backend still requires auth for some reason, retry with token when available
        if (res.status === 401) {
          const token = getAuthToken();
          if (token) {
            try {
              const authed = await secureFetch(endpoint, {
                ...options,
                headers: {
                  ...(options.headers || {}),
                },
              });
              return { res: { ok: true, status: 200 }, data: authed };
            } catch (e) {
              return { res, data };
            }
          }
        }
        return { res, data };
      } catch {
        // As a final fallback, try secureFetch (will attach token if present)
        try {
          const data = await secureFetch(endpoint, options);
          return { res: { ok: true, status: 200 }, data };
        } catch {
          return { res: { ok: false, status: 0 }, data: null };
        }
      }
    },
    [buildUrl, appendIdentifier]
  );

  const fetchSongRequests = useCallback(async () => {
    const restaurantId = Number(
      order?.restaurant_id ?? order?.reservation?.restaurant_id ?? order?.reservation?.restaurantId ?? 0
    );
    const resolvedTableNo = Number(table ?? order?.table_number ?? order?.tableNumber ?? 0);

    if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
      setSongRequests([]);
      return;
    }
    if (!Number.isFinite(resolvedTableNo) || resolvedTableNo <= 0) {
      setSongRequests([]);
      return;
    }

    const { res, data } = await fetchJSON(
      `/song-requests?restaurant_id=${restaurantId}&table_number=${resolvedTableNo}`
    );
    if (!res?.ok) return;
    const rows = Array.isArray(data) ? data : Array.isArray(data?.requests) ? data.requests : [];
    setSongRequests(rows);
  }, [fetchJSON, order, table]);

  const hasActiveSongRequest = React.useMemo(
    () =>
      (Array.isArray(songRequests) ? songRequests : []).some((request) => {
        const status = String(request?.status || "").trim().toLowerCase();
        return status === "pending" || status === "approved";
      }),
    [songRequests]
  );

  const handleSongRequestSubmit = useCallback(async () => {
    const restaurantId = Number(
      order?.restaurant_id ?? order?.reservation?.restaurant_id ?? order?.reservation?.restaurantId ?? 0
    );
    const resolvedTableNo = Number(table ?? order?.table_number ?? order?.tableNumber ?? 0);
    const trimmedSongName = String(songRequestName || "").trim();

    if (!trimmedSongName) return;
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) return;
    if (!Number.isFinite(resolvedTableNo) || resolvedTableNo <= 0) return;
    if (hasActiveSongRequest) return;

    setSongRequestSubmitting(true);
    try {
      const { res } = await fetchJSON("/song-requests", {
        method: "POST",
        body: JSON.stringify({
          restaurant_id: restaurantId,
          table_number: resolvedTableNo,
          song_name: trimmedSongName,
        }),
      });
      if (!res?.ok) return;
      setSongRequestName("");
      await fetchSongRequests();
    } finally {
      setSongRequestSubmitting(false);
    }
  }, [fetchJSON, fetchSongRequests, hasActiveSongRequest, order, songRequestName, table]);

  const hydrateOrderDriverName = useCallback(
    async (orderData) => {
      if (!orderData || typeof orderData !== "object") return orderData;

      const directName = String(
        orderData?.driver_name ||
          orderData?.driverName ||
          orderData?.driver?.name ||
          orderData?.assigned_driver?.name ||
          orderData?.assignedDriver?.name ||
          ""
      ).trim();
      if (directName) return orderData;

      const rawDriverId =
        orderData?.driver_id ??
        orderData?.driverId ??
        orderData?.driver?.id ??
        orderData?.assigned_driver_id ??
        orderData?.assignedDriverId;
      const driverId = Number(rawDriverId);
      if (!Number.isFinite(driverId) || driverId <= 0) return orderData;

      const cached = driversCacheRef.current || { fetchedAtMs: 0, byId: new Map() };
      const byId = cached.byId || new Map();
      if (byId.has(driverId)) {
        const cachedName = String(byId.get(driverId) || "").trim();
        return cachedName ? { ...orderData, driver_name: cachedName } : orderData;
      }

      if (Date.now() - Number(cached.fetchedAtMs || 0) < 60_000) return orderData;

      try {
        const { res, data } = await fetchJSON("/staff/drivers");
        if (!res?.ok) return orderData;

        const rows = Array.isArray(data) ? data : data?.drivers || [];
        const nextMap = new Map();
        for (const row of rows) {
          const id = Number(row?.id);
          if (!Number.isFinite(id)) continue;
          nextMap.set(
            id,
            String(row?.name || row?.full_name || row?.username || "").trim() || null
          );
        }
        driversCacheRef.current = { fetchedAtMs: Date.now(), byId: nextMap };

        const resolvedName = String(nextMap.get(driverId) || "").trim();
        return resolvedName ? { ...orderData, driver_name: resolvedName } : orderData;
      } catch {
        return orderData;
      }
    },
    [fetchJSON]
  );

  const hydrateOrderItems = useCallback(
    async (orderData) => {
      if (!orderData || typeof orderData !== "object") return orderData;
      const orderDataId = Number(orderData?.id || 0);
      if (!Number.isFinite(orderDataId) || orderDataId <= 0) return orderData;
      if (Array.isArray(orderData.items) && orderData.items.length > 0) return orderData;

      try {
        const { res, data } = await fetchJSON(`/orders/${orderDataId}/items?include_cancelled=1`);
        if (!res?.ok) return orderData;
        return { ...orderData, items: toArray(data) };
      } catch {
        return orderData;
      }
    },
    [fetchJSON]
  );

  const hydrateOrderSuborders = useCallback(
    async (orderData) => {
      if (!orderData || typeof orderData !== "object") return orderData;
      if (Array.isArray(orderData.suborders) && orderData.suborders.length > 0) return orderData;
      if (!getAuthToken()) return orderData;

      const orderDataId = Number(orderData?.id || 0);
      if (!Number.isFinite(orderDataId) || orderDataId <= 0) return orderData;

      try {
        const { res, data } = await fetchJSON(`/orders/${orderDataId}/suborders`);
        if (!res?.ok) return orderData;
        const suborders = Array.isArray(data)
          ? data
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.suborders)
          ? data.suborders
          : [];
        return suborders.length > 0 ? { ...orderData, suborders } : orderData;
      } catch {
        return orderData;
      }
    },
    [fetchJSON]
  );

  const fetchRelatedOrdersForStatus = useCallback(
    async (orderData) => {
      if (!orderData || typeof orderData !== "object") return orderData;
      if (Array.isArray(orderData.suborders) && orderData.suborders.length > 0) return orderData;
      if (!isDeliveryLikeOrderType(orderData?.order_type)) return orderData;

      const currentId = Number(orderData?.id || 0);
      if (!Number.isFinite(currentId) || currentId <= 0) return orderData;

      const reorderContext = readDeliveryReorderContext();
      if (!reorderContext || reorderContext.mode !== "online") return orderData;
      if (!reorderContext.targetOrderIds.includes(currentId)) return orderData;

      const relatedIds = reorderContext.sourceOrderIds.filter((value) => value !== currentId);
      if (relatedIds.length === 0) return orderData;

      const hydratedSuborders = await Promise.all(
        relatedIds.map(async (relatedId) => {
          try {
            const { res, data } = await fetchJSON(`/orders/${relatedId}`);
            if (!res?.ok || !data || !isDeliveryLikeOrderType(data?.order_type)) return null;
            const hydrated = await hydrateOrderItems(await hydrateOrderDriverName(data));
            return {
              ...hydrated,
              items: toArray(hydrated?.items).map((item) => ({
                ...item,
                locked: true,
                source_order_id: relatedId,
              })),
            };
          } catch {
            return null;
          }
        })
      );

      const nextSuborders = hydratedSuborders
        .filter(Boolean)
        .sort((a, b) => {
          const aTime = Date.parse(a?.created_at || a?.createdAt || 0) || 0;
          const bTime = Date.parse(b?.created_at || b?.createdAt || 0) || 0;
          return aTime - bTime;
        });

      if (nextSuborders.length === 0) return orderData;

      return {
        ...orderData,
        suborders: nextSuborders,
      };
    },
    [fetchJSON, hydrateOrderDriverName, hydrateOrderItems]
  );

  const fetchAccountOrdersForPortfolio = useCallback(
    async (baseOrder) => {
      if (!baseOrder || typeof baseOrder !== "object") {
        setAccountOrders([]);
        return;
      }

      const session = readScopedCustomerSession();
      const sessionHints = {
        customerId: Number(session?.id || 0) || null,
        email: normalizeComparableText(session?.email),
        phone: normalizeComparablePhone(session?.phone),
        name: normalizeComparableText(session?.username || session?.name),
      };
      const hints = mergeAccountHints(extractAccountHintsFromOrder(baseOrder), sessionHints);
      const fetchKey = [
        hints.customerId || "",
        hints.email || "",
        hints.phone || "",
        hints.name || "",
      ].join("|");

      const now = Date.now();
      if (
        fetchKey &&
        accountOrdersFetchRef.current.key === fetchKey &&
        now - Number(accountOrdersFetchRef.current.fetchedAtMs || 0) < 8_000
      ) {
        return;
      }

      const queryPaths = [];
      if (hints.customerId) queryPaths.push(`/orders?customer_id=${encodeURIComponent(hints.customerId)}`);
      if (hints.phone) queryPaths.push(`/orders?customer_phone=${encodeURIComponent(hints.phone)}`);
      if (hints.email) queryPaths.push(`/orders?customer_email=${encodeURIComponent(hints.email)}`);
      if (hints.name) queryPaths.push(`/orders?customer_name=${encodeURIComponent(hints.name)}`);

      const fallbackTableNo = Number(baseOrder?.table_number || baseOrder?.tableNumber || 0);
      if (queryPaths.length === 0 && Number.isFinite(fallbackTableNo) && fallbackTableNo > 0) {
        queryPaths.push(`/orders?table_number=${fallbackTableNo}`);
      }

      if (queryPaths.length === 0) {
        setAccountOrders([baseOrder]);
        return;
      }

      const merged = [baseOrder];
      const hasCustomerHints = Boolean(hints.customerId || hints.phone || hints.email || hints.name);
      for (const path of queryPaths) {
        try {
          const { res, data } = await fetchJSON(path);
          if (!res?.ok) continue;
          const rows = normalizeOrdersPayload(data);
          rows.forEach((row) => {
            if (!hasCustomerHints || orderMatchesHints(row, hints)) merged.push(row);
          });
        } catch {
          // Continue building from other endpoints.
        }
      }

      const nextOrders = dedupeOrdersById(merged).sort((a, b) => {
        const aTs = Math.max(
          toOrderTimestamp(a?.updated_at || a?.updatedAt),
          toOrderTimestamp(a?.created_at || a?.createdAt)
        );
        const bTs = Math.max(
          toOrderTimestamp(b?.updated_at || b?.updatedAt),
          toOrderTimestamp(b?.created_at || b?.createdAt)
        );
        return bTs - aTs;
      });

      setAccountOrders(nextOrders);
      accountOrdersFetchRef.current = { key: fetchKey, fetchedAtMs: now };
    },
    [fetchJSON]
  );

  useEffect(() => {
    if (!order) return;
    const status = (order.status || "").toLowerCase();
    const normalizedOrderType = String(order?.order_type || "").toLowerCase();
    const resolvedTableNo = Number(table ?? order?.table_number ?? order?.tableNumber ?? 0);
    const isTableContextOrder =
      normalizedOrderType === "table" ||
      normalizedOrderType === "reservation" ||
      hasReservationPayload(order) ||
      (Number.isFinite(resolvedTableNo) && resolvedTableNo > 0);
    const keepVisibleForCheckoutCompletion =
      checkedOutSticky ||
      checkoutCompletedView ||
      (["closed", "completed"].includes(status) && isTableContextOrder);
    const reservationPendingCheckIn =
      !checkedInSticky && isReservationPendingCheckIn(order, normalizedOrderScreenStatus);
    const preserveWhileReserved =
      reservationPendingCheckIn ||
      (!checkedInSticky && hasReservedStatusHint) ||
      (forceLock && (reservationPendingCheckIn || hasReservedStatusHint));
    const orderCancelReason = resolveOrderCancellationReason(order, externalCancelReason);
    const hasCancelledItems = items.some((item) => isCancelledItemStatus(item?.kitchen_status));
    const keepVisibleForCancellation =
      isCancelledLikeOrderStatus(status) ||
      Boolean(orderCancelReason) ||
      hasCancelledItems;
    if (
      FINISHED_STATES.includes(status) &&
      !preserveWhileReserved &&
      !keepVisibleForCancellation &&
      !keepVisibleForCheckoutCompletion
    ) {
      onFinished?.();
    }
  }, [
    order,
    items,
    forceLock,
    onFinished,
    checkedInSticky,
    checkedOutSticky,
    normalizedOrderScreenStatus,
    hasReservedStatusHint,
    hasReservationPayload,
    checkoutCompletedView,
    table,
    externalCancelReason,
  ]);

  const fetchOrder = async () => {
    if (!orderId) return;
    let nextOrder = null;
    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}`);
      if (res.ok) {
        nextOrder = await hydrateOrderDriverName(data);
        nextOrder = await hydrateOrderItems(nextOrder);
        nextOrder = await hydrateOrderSuborders(nextOrder);
        nextOrder = await fetchRelatedOrdersForStatus(nextOrder);
        const normStatus = normalizeReservationStatus(nextOrder?.status);
        const nestedStatus = normalizeReservationStatus(nextOrder?.reservation?.status);
        const flatReservationStatus = normalizeReservationStatus(
          nextOrder?.reservation_status ?? nextOrder?.reservationStatus
        );
        if (
          isCheckedInReservationStatus(normStatus) ||
          isCheckedInReservationStatus(nestedStatus) ||
          isCheckedInReservationStatus(flatReservationStatus)
        ) {
          setCheckedInSticky(true);
        }
        if (
          isCheckedOutReservationStatus(normStatus) ||
          isCheckedOutReservationStatus(nestedStatus) ||
          isCheckedOutReservationStatus(flatReservationStatus)
        ) {
          setCheckedOutSticky(true);
        }
        setOrder(nextOrder);
        await fetchAccountOrdersForPortfolio(nextOrder);
        setOrder404(false);
      } else if (res.status === 404) {
        setOrder(null);
        setAccountOrders([]);
        setOrder404(true);
      }
    } catch {}

    const hasCheckedInOverride =
      checkedInSticky || isCheckedInReservationStatus(normalizedOrderScreenStatus);
    if (!hasCheckedInOverride && isReservationPendingCheckIn(nextOrder, normalizedOrderScreenStatus)) {
      setItems([]);
      return;
    }

    const orderPayloadItems = collectOrderItemsWithSuborders(nextOrder);
    if (orderPayloadItems.length > 0) {
      setItems(orderPayloadItems.map(normItem));
      return;
    }

    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}/items?include_cancelled=1`);
      if (!res.ok) throw new Error();
      const normalized = toArray(data).map(normItem);
      setItems(normalized);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    let abort = false;
    async function load() {
    try {
      const { res, data } = await fetchJSON(`/orders/${orderId}`);
      if (!res.ok) return;
      if (!abort) {
        const hydrated = await hydrateOrderDriverName(data);
        const normStatus = normalizeReservationStatus(hydrated?.status);
        const nestedStatus = normalizeReservationStatus(hydrated?.reservation?.status);
        const flatReservationStatus = normalizeReservationStatus(
          hydrated?.reservation_status ?? hydrated?.reservationStatus
        );
        if (
          isCheckedInReservationStatus(normStatus) ||
          isCheckedInReservationStatus(nestedStatus) ||
          isCheckedInReservationStatus(flatReservationStatus)
        ) {
          setCheckedInSticky(true);
        }
        if (
          isCheckedOutReservationStatus(normStatus) ||
          isCheckedOutReservationStatus(nestedStatus) ||
          isCheckedOutReservationStatus(flatReservationStatus)
        ) {
          setCheckedOutSticky(true);
        }
        setOrder(hydrated);
        fetchAccountOrdersForPortfolio(hydrated);
        if (import.meta.env.DEV) {
          console.info("[OrderStatusScreen] fetched order", {
            orderId,
            status: normStatus,
            cancel_reason:
              hydrated?.cancellation_reason || hydrated?.cancel_reason || hydrated?.cancelReason || null,
          });
        }
      }
    } catch {}
    }
    load();
    const iv = setInterval(load, 4000);
    return () => {
      abort = true;
      clearInterval(iv);
    };
  }, [fetchAccountOrdersForPortfolio, fetchJSON, hydrateOrderDriverName, orderId]);

  useSocketIO(fetchOrder, orderId);
  useEffect(() => {
    fetchOrder();
  }, [orderId, normalizedOrderScreenStatus]);

  // Join restaurant-specific Socket.IO room once we know the restaurant_id
  useEffect(() => {
    const rid = order?.restaurant_id;
    if (!rid) return;
    if (!socket) return;
    if (joinedRestaurantRef.current === rid) return;
    try {
      socket.emit("join_restaurant", rid);
      joinedRestaurantRef.current = rid;
    } catch (e) {
      console.warn("Failed to join restaurant room", rid, e);
    }
    return () => {
      try {
        if (joinedRestaurantRef.current) {
          socket.emit("leave_restaurant", joinedRestaurantRef.current);
          joinedRestaurantRef.current = null;
        }
      } catch {}
    };
  }, [order?.restaurant_id]);

  // Timer
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!order?.created_at) {
      setTimer("00:00");
      return;
    }
    const startMs = new Date(order.created_at).getTime();
    if (!Number.isFinite(startMs)) {
      setTimer("00:00");
      return;
    }
    function updateTimer() {
      const diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      const mins = String(Math.floor(diff / 60)).padStart(2, "0");
      const secs = String(diff % 60).padStart(2, "0");
      setTimer(`${mins}:${secs}`);
    }
    updateTimer();
    intervalRef.current = setInterval(updateTimer, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [order?.created_at]);

  const tableNo = table ?? order?.table_number ?? null;
  const restaurantName =
    order?.restaurant_name ||
    order?.restaurant?.name ||
    localStorage.getItem("restaurant_name") ||
    t("Restaurant");

  const total = items.reduce((sum, it) => {
    if (isCancelledItemStatus(it?.kitchen_status)) return sum;
    const extras = (it.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return sum + ((it.price || 0) + extras) * (it.quantity || 1);
  }, 0);

  const orderStatus = normalizeReservationStatus(order?.status);
  const reservationStatus = normalizeReservationStatus(order?.reservation?.status);
  const flatReservationStatus = normalizeReservationStatus(
    order?.reservation_status ?? order?.reservationStatus
  );
  const concertBookingPaymentStatus = normalizeReservationStatus(
    order?.concert_booking_payment_status || order?.concertBookingPaymentStatus
  );
  const concertBookingStatus = normalizeReservationStatus(
    order?.concert_booking_status || order?.concertBookingStatus
  );
  const hasConcertBookingContext =
    Number(order?.concert_booking_id || order?.concertBookingId) > 0 ||
    Boolean(concertBookingPaymentStatus || concertBookingStatus);
  const reservationQrUrl = normalizePublicQrUrl(
    order?.concert_booking_qr_url ||
      order?.concertBookingQrUrl ||
      order?.qr_url ||
      order?.qrUrl ||
      order?.reservation?.qr_url ||
      order?.reservation?.qrUrl
  );
  const reservationQrImageUrl = buildCheckInQrImageUrl(reservationQrUrl);
  const concertBookingType = String(
    order?.concert_booking_type || order?.concertBookingType || ""
  )
    .trim()
    .toLowerCase();
  const hasTicketConcertItem = items.some((item) =>
    String(item?.name || item?.product_name || item?.item_name || "")
      .trim()
      .toLowerCase() === "ticket concert"
  );
  const isConcertTicketContext =
    hasConcertBookingContext &&
    (concertBookingType === "ticket" ||
      (concertBookingType !== "table" && !hasReservationData(order) && hasTicketConcertItem));
  const hasBackendCheckedInSignal =
    isCheckedInReservationStatus(orderStatus) ||
    isCheckedInReservationStatus(reservationStatus) ||
    isCheckedInReservationStatus(flatReservationStatus) ||
    order?.checked_in === true ||
    order?.reservation?.checked_in === true;
  const hasCheckedInSignal = isConcertTicketContext
    ? hasBackendCheckedInSignal
    : checkedInSticky ||
      isCheckedInReservationStatus(normalizedOrderScreenStatus) ||
      hasBackendCheckedInSignal;
  const hasBackendCheckedOutSignal =
    isCheckedOutReservationStatus(orderStatus) ||
    isCheckedOutReservationStatus(reservationStatus) ||
    isCheckedOutReservationStatus(flatReservationStatus) ||
    order?.checked_out === true ||
    order?.reservation?.checked_out === true;
  const hasCheckedOutSignal =
    checkedOutSticky ||
    isCheckedOutReservationStatus(normalizedOrderScreenStatus) ||
    hasBackendCheckedOutSignal;
  const driverStatus = String(order?.driver_status || "").toLowerCase();
  const normalizedExternalCancelReason = String(externalCancelReason || "").trim();
  const orderCancelReason = resolveOrderCancellationReason(
    order,
    normalizedExternalCancelReason
  );
  const statusHintCandidates = [
    normalizedOrderScreenStatus,
    orderStatus,
    reservationStatus,
    flatReservationStatus,
    concertBookingPaymentStatus,
    concertBookingStatus,
  ];
  const cancelledStatusHint =
    statusHintCandidates.find((value) => isCancelledLikeOrderStatus(value)) || "";
  const statusHint = cancelledStatusHint || orderStatus || normalizedOrderScreenStatus;
  const isOrderCancelled =
    !hasCheckedOutSignal && (Boolean(cancelledStatusHint) || Boolean(orderCancelReason));
  const cancelledItems = items.filter((item) => isCancelledItemStatus(item?.kitchen_status));
  const allItemsCancelled = items.length > 0 && items.every((item) => isCancelledItemStatus(item?.kitchen_status));
  const firstItemCancelReason = String(cancelledItems[0]?.cancellation_reason || "").trim();
  const isCancelledFlow = isOrderCancelled || allItemsCancelled;
  const cancelReason = isCancelledFlow
    ? String(orderCancelReason || firstItemCancelReason || normalizedExternalCancelReason || "").trim()
    : "";
  const reservationContextStatusHint = hasCheckedInSignal
    ? "checked_in"
    : normalizedOrderScreenStatus || orderStatus;
  const isReservedOrderContext =
    !hasCheckedInSignal &&
    (isReservationPendingCheckIn(order, reservationContextStatusHint) || hasReservedStatusHint);
  const hasReservationContext = hasReservationPayload(order);
  const normalizedOrderType = String(order?.order_type || "").toLowerCase();
  const isTableContextOrder =
    normalizedOrderType === "table" ||
    normalizedOrderType === "reservation" ||
    hasReservationContext ||
    (Number.isFinite(Number(tableNo)) && Number(tableNo) > 0);
  const shouldPreservePreCheckinReservationStatus = !hasCheckedInSignal && isReservedOrderContext;
  const shouldShowCheckoutCompletedView =
    hasCheckedOutSignal ||
    checkoutCompletedView ||
    (isTableContextOrder &&
      !shouldPreservePreCheckinReservationStatus &&
      !isOrderCancelled &&
      (orderStatus === "closed" || orderStatus === "completed"));
  const effectiveOrderStatus = (() => {
    if (!order && normalizedOrderScreenStatus) {
      return normalizedOrderScreenStatus;
    }
    if (hasCheckedOutSignal) return "checked_out";
    if (isOrderCancelled) return cancelledStatusHint || "cancelled";
    if (shouldShowCheckoutCompletedView) return "checked_out";
    if (isConcertTicketContext) {
      if (hasBackendCheckedInSignal) return "checked_in";
      if (concertBookingPaymentStatus === "confirmed" || concertBookingStatus === "confirmed") {
        return "confirmed";
      }
      if (concertBookingPaymentStatus === "pending_bank_transfer") {
        return "awaiting_confirm";
      }
    }
    if (isReservedOrderContext && hasConcertBookingContext) {
      if (concertBookingPaymentStatus === "confirmed" || concertBookingStatus === "confirmed") {
        return "confirmed";
      }
      if (concertBookingPaymentStatus === "pending_bank_transfer") {
        return "awaiting_confirm";
      }
    }
    if (hasCheckedInSignal) return "checked_in";
    if (isReservedOrderContext) {
      const hasConfirmedSignal = [
        normalizedOrderScreenStatus,
        orderStatus,
        reservationStatus,
        flatReservationStatus,
      ].includes("confirmed");
      if (hasConfirmedSignal) return "confirmed";
      return "awaiting_confirm";
    }
    if (driverStatus === "on_road" || driverStatus === "on-road") return "on_road";
    if (driverStatus === "delivered") return "delivered";
    return orderStatus || reservationStatus;
  })();
  const isFinishedFlow = isFinishedLikeOrderStatus(effectiveOrderStatus);
  const hasVisibleOrderItems = items.some((item) => !isCancelledItemStatus(item?.kitchen_status));
  const hasPaidItems = items.some((item) => !isCancelledItemStatus(item?.kitchen_status) && isPaidLikeItem(item));
  const orderPaymentStatus = normalizeReservationStatus(order?.payment_status || order?.paymentStatus);
  const isOrderPaidLike =
    order?.is_paid === true ||
    orderPaymentStatus === "paid" ||
    orderStatus === "paid" ||
    orderStatus === "closed" ||
    orderStatus === "completed";
  const canFinalizeReservation = hasPaidItems || isOrderPaidLike;
  const visibleItems = isReservedOrderContext ? [] : items;
  const visibleTotal = visibleItems.reduce((sum, it) => {
    if (isCancelledItemStatus(it?.kitchen_status)) return sum;
    const extras = (it.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return sum + ((it.price || 0) + extras) * (it.quantity || 1);
  }, 0);
  const showCloseButton =
    typeof onClose === "function" &&
    ((!isReservedOrderContext && (visibleItems.length === 0 || isCancelledFlow || isFinishedFlow)) ||
      (isReservedOrderContext && allItemsCancelled)) &&
    (!hasReservationContext || canFinalizeReservation);
  const showCheckoutButton =
    typeof onCheckout === "function" &&
    hasReservationContext &&
    hasCheckedInSignal &&
    canFinalizeReservation;
  const showPaymentRequiredNotice =
    hasReservationContext &&
    !canFinalizeReservation &&
    !isCancelledFlow;
  const hasOrderedItems = items.some((item) => !isCancelledItemStatus(item?.kitchen_status));
  const canShowRequestSongTab =
    isTableContextOrder &&
    (hasCheckedInSignal || hasOrderedItems) &&
    !hasCheckedOutSignal &&
    !isCancelledFlow;
  const shouldShowCheckInQrCard =
    Boolean(reservationQrImageUrl) &&
    !hasCheckedOutSignal &&
    !isCancelledFlow &&
    (effectiveOrderStatus === "confirmed" ||
      effectiveOrderStatus === "checked_in" ||
      hasCheckedInSignal);

  useEffect(() => {
    if (canShowRequestSongTab) return;
    setActiveScreenView("status");
  }, [canShowRequestSongTab]);

  useEffect(() => {
    if (!canShowRequestSongTab) {
      setSongRequests([]);
      return;
    }
    fetchSongRequests();
  }, [canShowRequestSongTab, fetchSongRequests]);

  useEffect(() => {
    if (!canShowRequestSongTab || !socket) return undefined;
    const restaurantId = Number(
      order?.restaurant_id ?? order?.reservation?.restaurant_id ?? order?.reservation?.restaurantId ?? 0
    );
    const handler = (payload = {}) => {
      const payloadRestaurantId = Number(payload?.restaurant_id ?? payload?.restaurantId ?? 0);
      if (
        Number.isFinite(payloadRestaurantId) &&
        payloadRestaurantId > 0 &&
        Number.isFinite(restaurantId) &&
        restaurantId > 0 &&
        payloadRestaurantId !== restaurantId
      ) {
        return;
      }
      fetchSongRequests();
    };
    socket.on("song_request_updated", handler);
    return () => {
      socket.off("song_request_updated", handler);
    };
  }, [canShowRequestSongTab, fetchSongRequests, order]);

  const normalizeStatus = (s) => {
    const v = normalizeReservationStatus(s);
    if (v === "on_road" || v === "on-road") return "on_road";
    if (v === "checkedin" || v === "checkin") return "checked_in";
    if (v === "checkedout" || v === "checkout") return "checked_out";
    if (v === "served") return "delivered";
    return v;
  };

  const displayStatus = (s) => {
    const v = normalizeStatus(s);
    if (v === "visit_completed") return t("Order Completed");
    if (v === "checked_out") return t("Guest checked out");
    if (v === "booking_confirm") return t("Confirmed");
    if (v === "awaiting_confirm") return t("Awaiting confirm");
    if (v === "confirmed") return t("Confirmed");
    if (v === "pending_bank_transfer") return t("Pending bank transfer");
    if (v === "checked_in") return t("Guest checked in");
    if (v === "on_road") return t("On Road");
    if (v === "ready") return t("Order ready");
    if (v === "delivered") return t("Delivered");
    if (v === "cancelled" || v === "canceled" || v === "void" || v === "deleted") return t("Cancelled");
    if (!v) return t("Unknown");
    return t(v.charAt(0).toUpperCase() + v.slice(1));
  };

  const badgeColor = (status) => {
    const s = normalizeStatus(status);
    if (s === "visit_completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "checked_out") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "booking_confirm") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "confirmed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "awaiting_confirm") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "pending_bank_transfer") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "checked_in") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "delivered") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "on_road") return "bg-sky-600 text-white border-sky-700 shadow-[0_10px_24px_rgba(2,132,199,0.24)] dark:bg-sky-500 dark:text-white dark:border-sky-400";
    if (s === "ready") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "preparing") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "cancelled" || s === "canceled" || s === "void" || s === "deleted") {
      return "bg-rose-50 text-rose-700 border-rose-200";
    }
    if (s === "new") return "bg-neutral-50 text-neutral-700 border-neutral-200";
    return "bg-neutral-50 text-neutral-600 border-neutral-200";
  };

  const multiOrderModel = React.useMemo(() => {
    const baseList = [];
    if (order && typeof order === "object") baseList.push(order);
    if (Array.isArray(accountOrders) && accountOrders.length > 0) baseList.push(...accountOrders);
    return buildMultiOrderModel(baseList, Number(order?.id || orderId || 0));
  }, [accountOrders, order, orderId]);

  const currentOrderGroups = multiOrderModel.currentOrderGroup
    ? [multiOrderModel.currentOrderGroup]
    : [];
  const otherActiveGroups = multiOrderModel.otherActive || [];
  const showMultiOrderSections =
    currentOrderGroups.length > 0 || otherActiveGroups.length > 0;

  const suborders = Array.isArray(order?.suborders) ? order.suborders : [];
  const effectiveSuborderStatus = (() => {
    const statuses = suborders
      .map((suborder) => normalizeStatus(suborder?.status || suborder?.order_status))
      .filter(Boolean);
    if (!statuses.length) return "";

    const nonCancelled = statuses.filter(
      (status) => !["cancelled", "canceled", "void", "deleted"].includes(status)
    );
    const statusPool = nonCancelled.length > 0 ? nonCancelled : statuses;
    const rank = (status) => {
      const value = normalizeStatus(status);
      if (value === "on_road") return 6;
      if (value === "delivered") return 5;
      if (value === "ready") return 4;
      if (value === "preparing") return 3;
      if (value === "confirmed" || value === "pending" || value === "open") return 2;
      if (value === "new") return 1;
      return 0;
    };

    return statusPool.reduce(
      (bestStatus, currentStatus) =>
        rank(currentStatus) >= rank(bestStatus) ? currentStatus : bestStatus,
      statusPool[0]
    );
  })();
  const secondaryStatusLabel = effectiveSuborderStatus
    ? `${t("Sub Orders")}: ${displayStatus(effectiveSuborderStatus)}`
    : "";

  const getCurrentStepIndex = () => {
    if (isReservedOrderContext) return 0;
    if (isCancelledFlow) return 0;
    const rank = (s) => {
      const v = normalizeStatus(s);
      if (v === "ready") return 2;
      if (v === "preparing") return 1;
      if (v === "new" || v === "confirmed" || v === "pending" || v === "open") return 0;
      if (
        v === "delivered" ||
        v === "served" ||
        v === "completed" ||
        v === "closed" ||
        v === "checked_out"
      )
        return 3;
      return 0;
    };
    const orderRank = rank(order?.status);
    const itemsRank = items.reduce((max, it) => Math.max(max, rank(it.kitchen_status)), 0);
    const r = Math.max(orderRank, itemsRank);
    return Math.min(3, Math.max(0, r));
  };

  const createdAtLabel = (() => {
    try {
      if (!order?.created_at) return t("—");
      const d = new Date(order.created_at);
      return d.toLocaleString();
    } catch {
      return t("—");
    }
  })();

  const reservedAtLabel = (() => {
    const reservationTime =
      order?.reservation?.reservation_time ||
      order?.reservation_time ||
      order?.reservationTime ||
      "";
    const reservationDate =
      order?.reservation?.reservation_date ||
      order?.reservation_date ||
      order?.reservationDate ||
      "";
    if (!reservationTime && !reservationDate) return "";
    if (reservationTime && reservationDate) return `${reservationTime} • ${reservationDate}`;
    return reservationTime || reservationDate;
  })();

  const reservationGuestsLabel = (() => {
    const guests = Number(
      order?.reservation?.reservation_clients ||
        order?.reservation_clients ||
        order?.reservationClients ||
        0
    );
    if (!Number.isFinite(guests) || guests <= 0) return "";
    return String(Math.floor(guests));
  })();

  const orderTypeLabel = (() => {
    const ot = String(order?.order_type || "").toLowerCase();
    if (ot === "packet") return t("Delivery");
    if (ot === "takeaway") return t("Pickup");
    if (ot === "table") return t("Table");
    return ot ? t(ot) : t("Order");
  })();

  const paymentLabel = pmLabel(order?.payment_method || "");
  const effectivePaymentLabel = isReservedOrderContext ? t("Pending check-in") : paymentLabel;
  const driverName = String(
    order?.driver_name ||
      order?.driverName ||
      order?.driver?.name ||
      order?.assigned_driver?.name ||
      order?.assignedDriver?.name ||
      ""
  ).trim();
  const hasAssignedDriver = !isReservedOrderContext && Boolean(driverName);
  const driverMessage =
    hasAssignedDriver && effectiveOrderStatus === "on_road"
      ? `${driverName} ${t("picked up your order", { defaultValue: "picked up your order" })}`
      : hasAssignedDriver
        ? `${t("Driver")}: ${driverName}`
      : "";
  const deliveryAddress = String(order?.customer_address || "").trim();
  const isDeliveryOrderContext =
    !isTableContextOrder &&
    (["packet", "delivery", "online", "phone"].includes(normalizedOrderType) || Boolean(deliveryAddress));
  const shouldShowFollowOrder = isDeliveryOrderContext && !isReservedOrderContext && !isCancelledFlow;

  const titleLine = (() => {
    const tableLine = tableNo ? `${t("Table")} ${tableNo}` : null;
    const ot = String(order?.order_type || "")
      .trim()
      .toLowerCase();
    if (ot === "table") {
      return tableLine || t("Table");
    }
    return [orderTypeLabel, tableLine].filter(Boolean).join(" • ");
  })();

  const rootPositionClass = offsetForAppHeader
    ? "fixed inset-x-0 bottom-0 top-[74px] sm:top-[80px]"
    : "fixed inset-0";

  return (
    <div
      className={`${isDarkUi ? "dark" : ""} ${rootPositionClass} z-[100] bg-neutral-50 dark:bg-neutral-950 overflow-y-auto`}
    >
      {!hideNativeHeader ? (
        <OrderStatusHeader
          t={t}
          title={restaurantName || t("Order Status")}
          subtitle=""
          meta={orderId ? t("Invoice #{{id}}", { id: orderId }) : null}
          onBack={typeof onClose === "function" ? () => onClose?.() : null}
        />
      ) : null}

      <main className="mx-auto w-full max-w-[640px] px-4 pt-4 pb-[calc(104px+env(safe-area-inset-bottom))] sm:pb-8">
        <div className="space-y-4">
          <StatusScreenTabs
            t={t}
            activeView={activeScreenView}
            onSelect={setActiveScreenView}
            showRequestSong={canShowRequestSongTab}
          />

          {activeScreenView === "request_song" && canShowRequestSongTab ? (
            <RequestSongTab
              t={t}
              requests={songRequests}
              songName={songRequestName}
              onSongNameChange={setSongRequestName}
              onSubmit={handleSongRequestSubmit}
              submitting={songRequestSubmitting}
            />
          ) : (
            <>
              {showMultiOrderSections ? (
                <div className="space-y-3">
                  <MultiOrderSection
                    t={t}
                    title={t("Current Order")}
                    groups={currentOrderGroups}
                    emptyLabel={t("No active order")}
                    hero={true}
                    formatCurrency={formatCurrency}
                    displayStatus={displayStatus}
                  />
                  <MultiOrderSection
                    t={t}
                    title={`${t("Other Active Orders")} (${otherActiveGroups.length})`}
                    count={otherActiveGroups.length}
                    groups={otherActiveGroups}
                    emptyLabel={t("No other active orders")}
                    formatCurrency={formatCurrency}
                    displayStatus={displayStatus}
                  />
                </div>
              ) : null}

              <OrderProgressStepper
                t={t}
                currentStepIndex={getCurrentStepIndex()}
                isCancelled={isCancelledFlow}
              />

              <OrderSummaryCard
                t={t}
                title={titleLine || t("Your Order")}
                statusLabel={isCancelledFlow ? t("Cancelled") : displayStatus(effectiveOrderStatus)}
                statusToneClass={badgeColor(effectiveOrderStatus)}
                secondaryStatusLabel={secondaryStatusLabel}
                secondaryStatusToneClass={effectiveSuborderStatus ? badgeColor(effectiveSuborderStatus) : ""}
                headerActionLabel={shouldShowFollowOrder ? t("Follow my order") : ""}
                onHeaderAction={shouldShowFollowOrder ? () => setIsTrackingOpen(true) : null}
                driverMessage={driverMessage}
                timerLabel={isCancelledFlow ? t("—") : `${timer}`}
                paymentLabel={effectivePaymentLabel}
                createdAtLabel={createdAtLabel}
                reservedAtLabel={reservedAtLabel}
                reservationGuestsLabel={reservationGuestsLabel}
                totalLabel={formatCurrency(isReservedOrderContext ? visibleTotal : total)}
                cancelReason={cancelReason}
                isCancelled={isCancelledFlow}
              />

              {isReservedOrderContext ? <ReservationPendingBadge t={t} /> : null}

              {shouldShowCheckInQrCard ? (
                <CheckInQrCard
                  t={t}
                  qrImageUrl={reservationQrImageUrl}
                  qrUrl={reservationQrUrl}
                />
              ) : null}

              {!isReservedOrderContext ? (
                <OrderItemsList
                  t={t}
                  items={visibleItems}
                  totalLabel={formatCurrency(visibleTotal)}
                  formatCurrency={formatCurrency}
                  badgeColor={badgeColor}
                  displayStatus={displayStatus}
                  pmLabel={pmLabel}
                />
              ) : null}

              {showPaymentRequiredNotice ? (
                <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/70 px-4 py-3">
                  <div className="text-sm font-semibold text-amber-800 dark:text-white">
                    {t("Payment required before Close or Check Out.")}
                  </div>
                </section>
              ) : null}

              {showCheckoutButton ? (
                <InlineBottomActions
                  t={t}
                  primaryLabel={checkoutPending ? t("Checking Out...") : t("Check Out")}
                  secondaryLabel={typeof onClose === "function" ? t("Close") : undefined}
                  onPrimary={checkoutPending ? null : onCheckout}
                  onSecondary={
                    checkoutPending
                      ? null
                      : typeof onCheckout === "function"
                        ? onCheckout
                        : typeof onClose === "function"
                          ? () => onClose?.({ allowForceClose: true })
                          : undefined
                  }
                />
              ) : null}

              {!showCheckoutButton && showCloseButton ? (
                <InlineBottomActions
                  t={t}
                  primaryLabel={t("Close")}
                  onPrimary={() => onClose?.({ allowForceClose: true })}
                />
              ) : null}
            </>
          )}
        </div>
      </main>

      <CustomerOrderTrackingView
        open={isTrackingOpen}
        orderId={orderId}
        buildUrl={buildUrl}
        appendIdentifier={appendIdentifier}
        socketInstance={socket}
        onClose={() => setIsTrackingOpen(false)}
        t={t}
      />
    </div>
  );
};

export default OrderStatusScreen;
