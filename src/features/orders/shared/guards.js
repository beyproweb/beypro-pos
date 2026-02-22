import {
  DRIVER_STATUSES,
  ONLINE_PAYMENT_MATCHERS,
  ORDER_TYPES,
} from "./constants";

export function normalizeDriverStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  // Driver mobile API uses `picked_up`; dashboard uses `on_road`.
  if (normalized === DRIVER_STATUSES.PICKED_UP) return DRIVER_STATUSES.ON_ROAD;
  return normalized;
}

export function isOnlinePaymentMethod(value) {
  const normalizedPayment = String(value || "").trim().toLowerCase();
  if (!normalizedPayment) return false;
  return ONLINE_PAYMENT_MATCHERS.some((type) => normalizedPayment.includes(type));
}

export function isPacketLikeOrder(orderType) {
  const normalized = String(orderType || "").trim().toLowerCase();
  return [ORDER_TYPES.PACKET, ORDER_TYPES.PHONE, ORDER_TYPES.ONLINE].includes(normalized);
}

export function isAutoConfirmEnabledForOrder(order, integrationsSettings) {
  const source = String(order?.external_source || "").toLowerCase().trim();
  const bySource =
    source && integrationsSettings && typeof integrationsSettings === "object"
      ? integrationsSettings?.[source]?.autoConfirmOrders
      : undefined;
  const legacy = integrationsSettings?.auto_confirm_orders;
  if (typeof bySource === "boolean") return bySource;
  return legacy === true;
}
