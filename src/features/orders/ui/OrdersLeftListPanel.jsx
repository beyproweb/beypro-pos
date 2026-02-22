import { Fragment, memo, useEffect, useMemo, useState } from "react";
import OrdersList from "../../../components/orders/OrdersList";
import {
  isOnlinePaymentMethod,
  normalizeDriverStatus,
} from "../shared/guards";

const ENABLE_ORDER_LIST_WINDOWING = false;

const OrdersLeftListPanel = memo(function OrdersLeftListPanel({
  safeOrders,
  calcOrderTotalWithExtras,
  calcOrderDiscount,
  formatOnlineSourceLabel,
  isAutoConfirmEnabledForOrder,
  t,
  drivers,
  confirmingOnlineOrders,
  confirmOnlineOrder,
  actions,
  setOrders,
  shouldAutoClosePacketOnDelivered,
  closeOrderInstantly,
  emitToast,
  fetchOrders,
  propOrders,
  openCancelModalForOrder,
  openPaymentModalForOrder,
  formatCurrency,
  handlePacketPrint,
  getRelevantOrderItems,
  areDriverItemsDelivered,
  updating,
  setUpdating,
  toast,
  productPrepById,
  isKitchenExcludedItem,
}) {
const isYemeksepetiOrder = (order) =>
  String(order?.external_source || "").toLowerCase() === "yemeksepeti" ||
  Boolean(order?.external_id);

const isYemeksepetiPickupOrder = (order) => {
  if (!isYemeksepetiOrder(order)) return false;
  const expedition = String(order?.external_expedition_type || "").toLowerCase().trim();
  if (expedition === "pickup") return true;
  const address = String(order?.customer_address || "").toLowerCase().trim();
  return address === "pickup order";
};

function driverButtonDisabled(order) {
  if (normalizeDriverStatus(order.driver_status) === "delivered") return true;
  if (updating[order.id]) return true;

  const isPickupNoDriverOk = isYemeksepetiPickupOrder(order);
  if (!order.driver_id && !isPickupNoDriverOk) return true;

  const kitchenStatus = String(
    order.kitchen_status || order.overallKitchenStatus || ""
  )
    .trim()
    .toLowerCase();
  const relevantItemsCount = getRelevantOrderItems(order).length;
  if (relevantItemsCount > 0 && !["ready", "delivered"].includes(kitchenStatus)) {
    return true;
  }

  return !areDriverItemsDelivered(order);
}




  function getOrderPrepMinutes(order) {
    const direct = parseFloat(
      order?.preparation_time ??
        order?.prep_time ??
        order?.prepTime ??
        order?.prep_minutes ??
        order?.preparation_minutes ??
        order?.preparationTime
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    const items = Array.isArray(order?.items) ? order.items : [];
    let maxMinutes = 0;
    items.forEach((item) => {
      const raw =
        item?.preparation_time ??
        item?.prep_time ??
        item?.prepTime ??
        item?.prep_minutes ??
        item?.preparation_minutes ??
        item?.preparationTime ??
        item?.prep_time_minutes ??
        item?.prepMinutes ??
        item?.product_preparation_time ??
        item?.product?.preparation_time ??
        productPrepById?.[Number(item?.product_id ?? item?.productId)];
      const minutes = parseFloat(raw ?? 0);
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      const qty = Number(item?.quantity ?? item?.qty ?? 1);
      const total = minutes * Math.max(1, qty);
      if (total > maxMinutes) maxMinutes = total;
    });
    return maxMinutes;
  }

  function getPrepStartMs(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };

    const direct = toMs(order?.prep_started_at ?? order?.prepStartedAt);
    if (Number.isFinite(direct)) return direct;

    const updated = toMs(order?.kitchen_status_updated_at);
    if (Number.isFinite(updated)) return updated;

    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      const ms = toMs(item?.prep_started_at ?? item?.prepStartedAt);
      if (Number.isFinite(ms)) return ms;
    }
    for (const item of items) {
      const itemUpdated = toMs(item?.kitchen_status_updated_at);
      if (Number.isFinite(itemUpdated)) return itemUpdated;
    }
    return NaN;
  }

  function getReadyAtLabel(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };

    const directReadyMs = toMs(
      order?.estimated_ready_at ??
        order?.ready_at ??
        order?.readyAt ??
        order?.estimatedReadyAt
    );
    if (Number.isFinite(directReadyMs)) {
      return new Date(directReadyMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    const startMs = getPrepStartMs(order);
    const prepMinutes = getOrderPrepMinutes(order);
    if (!Number.isFinite(startMs) || !prepMinutes) return "";
    const readyMs = startMs + prepMinutes * 60 * 1000;
    return new Date(readyMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function getWaitingTimer(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };
    const startMs = toMs(order.created_at);
    if (!Number.isFinite(startMs)) return "00:00";
    const endMs = order.delivered_at ? toMs(order.delivered_at) : Date.now();
    const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
const [openDetails, setOpenDetails] = useState(() => {
  try {
    return JSON.parse(globalThis.localStorage.getItem("orderDetailsState")) || {};
  } catch {
    return {};
  }
});
const [visibleCount, setVisibleCount] = useState(120);
const shouldWindow = ENABLE_ORDER_LIST_WINDOWING && safeOrders.length > 200;
const visibleOrders = useMemo(
  () => (shouldWindow ? safeOrders.slice(0, visibleCount) : safeOrders),
  [safeOrders, shouldWindow, visibleCount]
);

useEffect(() => {
  setVisibleCount(120);
}, [safeOrders.length, shouldWindow]);

return (
<>
<OrdersList
  orders={visibleOrders}
  renderOrder={(order) => {
 const totalWithExtras = calcOrderTotalWithExtras(order);
 const totalDiscount = calcOrderDiscount(order);
  const discountedTotal = totalWithExtras - totalDiscount; // ✅ includes extras now
  // shown on the card
      const driverStatus = normalizeDriverStatus(order.driver_status);
      const isDelivered = driverStatus === "delivered";
      const isPicked = driverStatus === "on_road";
      const isCancelled = order.status === "cancelled";
      const kitchenStatus = order.kitchen_status || order.overallKitchenStatus;
      const isReady = (kitchenStatus === "ready" || kitchenStatus === "delivered") && !isDelivered && !isPicked;
      const isPrep = kitchenStatus === "preparing";
      const isOnlinePayment = isOnlinePaymentMethod(order.payment_method);
      const isYemeksepeti = String(order?.external_source || "").toLowerCase() === "yemeksepeti";
      const onlineSourceLabel = formatOnlineSourceLabel(order?.external_source);
      const autoConfirmEnabledForOrder = isAutoConfirmEnabledForOrder(order);
      const hasUnmatchedYsItems =
        isYemeksepeti &&
        Array.isArray(order.items) &&
        order.items.some((item) => !item.product_id);
      const externalOrderRef =
        order.external_id ||
        order.externalId ||
        order.external_order_id ||
        order.externalOrderId ||
        order.order_code ||
        order.orderCode ||
        "";
      const isExternalOnlineOrder =
        ["packet", "phone"].includes(String(order?.order_type || "").toLowerCase()) &&
        Boolean(onlineSourceLabel || externalOrderRef || isOnlinePayment);
      const normalizedOrderStatus = String(order?.status || "").toLowerCase().trim();
      const shouldShowManualConfirm =
        !autoConfirmEnabledForOrder &&
        isExternalOnlineOrder &&
        !["confirmed", "closed", "cancelled"].includes(normalizedOrderStatus);
      const orderNote =
        order.takeaway_notes ||
        order.takeawayNotes ||
        order.notes ||
        order.note ||
        "";
      const fullOrderNote = String(orderNote || "").trim();
      const sanitizedOrderNote = (() => {
        const noteRaw = String(orderNote || "").trim();
        if (!noteRaw) return "";
        const pay = String(order.payment_method || "").trim();
        if (!pay) return noteRaw;
        const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return noteRaw
          .replace(new RegExp(escapeRegExp(pay), "gi"), "")
          .replace(/\s{2,}/g, " ")
          .replace(/[;,\-|–—]+\s*[;,\-|–—]+/g, "; ")
          .replace(/^[;,\-|–—\s]+/g, "")
          .replace(/[;,\-|–—\s]+$/g, "")
          .trim();
      })();
      const displayOrderNote = isExternalOnlineOrder ? fullOrderNote : sanitizedOrderNote;

 const statusVisual = (() => {
  const isPacketOrder = order.order_type === "packet";

  // ✅ Delivered Orders (Completed)
  if (isDelivered) {
    return {
      card: "bg-emerald-50 border-4 border-emerald-400 text-emerald-900 shadow-md dark:bg-emerald-950/25 dark:border-emerald-500/40 dark:text-emerald-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-emerald-100 border border-emerald-300 shadow-sm dark:bg-emerald-950/25 dark:border-emerald-500/30",
      timer: "bg-emerald-200 text-emerald-900 border border-emerald-300 shadow-sm dark:bg-emerald-950/35 dark:text-emerald-100 dark:border-emerald-500/30",
      nameChip: "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/25 dark:text-emerald-100 dark:border-emerald-500/30",
      phoneBtn: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm dark:bg-emerald-600 dark:hover:bg-emerald-500",
      statusChip: "bg-emerald-500 text-white border border-emerald-600 shadow-sm dark:bg-emerald-600 dark:border-emerald-500/40",
      priceTag: "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/25 dark:text-emerald-100 dark:border-emerald-500/30",
      extrasRow: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-500/30",
      noteBox: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-500/30",
    };
  }

  // 🚗 On Road (Driver picked up)
  if (isPicked) {
    return {
      card: "bg-sky-50 border-4 border-sky-400 text-sky-900 shadow-md dark:bg-sky-950/25 dark:border-sky-500/40 dark:text-sky-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-sky-100 border border-sky-300 shadow-sm dark:bg-sky-950/25 dark:border-sky-500/30",
      timer: "bg-sky-200 text-sky-900 border border-sky-300 shadow-sm dark:bg-sky-950/35 dark:text-sky-100 dark:border-sky-500/30",
      nameChip: "bg-sky-50 text-sky-800 border border-sky-300 dark:bg-sky-950/25 dark:text-sky-100 dark:border-sky-500/30",
      phoneBtn: "bg-sky-600 text-white hover:bg-sky-700 shadow-sm dark:bg-sky-600 dark:hover:bg-sky-500",
      statusChip: "bg-sky-500 text-white border border-sky-600 shadow-sm dark:bg-sky-600 dark:border-sky-500/40",
      priceTag: "bg-sky-100 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/25 dark:text-sky-100 dark:border-sky-500/30",
      extrasRow: "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/20 dark:text-sky-100 dark:border-sky-500/30",
      noteBox: "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/20 dark:text-sky-100 dark:border-sky-500/30",
    };
  }

  // ✅ Ready for Pickup/Delivery
  if (isReady) {
    return {
      card: "bg-red-50 border-4 border-red-700 text-red-950 shadow-md dark:bg-rose-950/25 dark:border-rose-500/40 dark:text-rose-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-red-100 border border-red-300 shadow-sm dark:bg-rose-950/25 dark:border-rose-500/30",
      timer: "bg-red-200 text-red-950 border border-red-300 shadow-sm dark:bg-rose-950/35 dark:text-rose-100 dark:border-rose-500/30",
      nameChip: "bg-red-100 text-red-950 border border-red-300 dark:bg-rose-950/25 dark:text-rose-100 dark:border-rose-500/30",
      phoneBtn: "bg-red-800 text-white hover:bg-red-900 shadow-sm dark:bg-rose-600 dark:hover:bg-rose-500",
      statusChip: "bg-red-700 text-white border border-red-800 shadow-sm dark:bg-rose-600 dark:border-rose-500/40",
      priceTag: "bg-red-100 text-red-900 border border-red-300 shadow-sm dark:bg-rose-950/25 dark:text-rose-100 dark:border-rose-500/30",
      extrasRow: "bg-red-50 text-red-900 border border-red-300 shadow-sm dark:bg-rose-950/20 dark:text-rose-100 dark:border-rose-500/30",
      noteBox: "bg-red-50 text-red-950 border border-red-300 shadow-sm dark:bg-rose-950/20 dark:text-rose-100 dark:border-rose-500/30",
    };
  }

  // 🍳 Preparing
  if (isPrep) {
    return {
      card: "bg-amber-50 border-4 border-amber-400 text-amber-900 shadow-md dark:bg-amber-950/20 dark:border-amber-500/40 dark:text-amber-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-amber-100 border border-amber-300 shadow-sm dark:bg-amber-950/25 dark:border-amber-500/30",
      timer: "bg-amber-200 text-amber-900 border border-amber-300 shadow-sm dark:bg-amber-950/35 dark:text-amber-100 dark:border-amber-500/30",
      nameChip: "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/25 dark:text-amber-100 dark:border-amber-500/30",
      phoneBtn: "bg-amber-600 text-white hover:bg-amber-700 shadow-sm dark:bg-amber-600 dark:hover:bg-amber-500",
      statusChip: "bg-amber-500 text-white border border-amber-600 shadow-sm dark:bg-amber-600 dark:border-amber-500/40",
      priceTag: "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm dark:bg-amber-950/25 dark:text-amber-100 dark:border-amber-500/30",
      extrasRow: "bg-amber-50 text-amber-800 border border-amber-300 shadow-sm dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-500/30",
      noteBox: "bg-amber-50 text-amber-900 border border-amber-300 shadow-sm dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-500/30",
    };
  }

  // 🕓 Pending / Unconfirmed (default)
  return {
    card: `bg-slate-50 border-4 ${
      isPacketOrder ? "border-fuchsia-400 dark:border-fuchsia-500" : "border-slate-400 dark:border-slate-700"
    } text-slate-900 shadow-md dark:bg-slate-900/55 dark:text-slate-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]`,
    header: "bg-slate-100 border border-slate-300 shadow-sm dark:bg-slate-900/60 dark:border-slate-700",
    timer: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700",
    nameChip: "bg-slate-50 text-slate-900 border border-slate-300 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700",
    phoneBtn: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm dark:bg-indigo-600 dark:hover:bg-indigo-500",
    statusChip: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700",
    priceTag: "bg-slate-100 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700",
    extrasRow: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/55 dark:text-slate-100 dark:border-slate-700",
    noteBox: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/55 dark:text-slate-100 dark:border-slate-700",
  };
})();

      const normalizedDriverStatus = normalizeDriverStatus(order.driver_status);
      const isDriverOnRoad = normalizedDriverStatus === "on_road";
      const isKitchenDelivered =
        kitchenStatus === "delivered" || Boolean(order?.kitchen_delivered_at);
      const readyAtLabel =
        isPrep && !isKitchenDelivered ? getReadyAtLabel(order) : "";
      const kitchenBadgeLabel =
        isDriverOnRoad
          ? t("On Road")
          :
        isDelivered
          ? t("Delivered")
          : kitchenStatus === "new"
          ? t("New Order")
          : kitchenStatus === "preparing"
          ? t("Preparing")
          : kitchenStatus === "ready" || kitchenStatus === "delivered"
          ? t("Order ready!")
          : "";
      const kitchenBadgeClass = isDelivered
        ? "bg-emerald-600 text-white shadow-sm"
        : isDriverOnRoad
        ? "bg-sky-500 text-white shadow-sm"
        : kitchenStatus === "new"
        ? "bg-blue-500 text-white shadow-sm"
        : kitchenStatus === "preparing"
        ? "bg-amber-500 text-white shadow-sm"
        : kitchenStatus === "ready" || kitchenStatus === "delivered"
        ? "bg-red-700 text-white shadow-sm"
        : "bg-slate-400 text-white shadow-sm";



      const assignedDriver = drivers.find((d) => Number(d.id) === Number(order.driver_id));
      const assignedDriverName = assignedDriver?.name ? String(assignedDriver.name) : "";
      const driverAvatarUrl =
        assignedDriver?.avatar || assignedDriver?.photoUrl || assignedDriver?.photo_url || "";
      const driverInitials = assignedDriverName
        ? assignedDriverName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()
        : "DR";
      const rawDriverStatus = String(order.driver_status || "").trim().toLowerCase();
      const isPickedUp = rawDriverStatus === "picked_up";

      const cardTone = isCancelled
        ? "bg-rose-200"
        : isDelivered
        ? "bg-emerald-200"
        : isPicked || isPickedUp
        ? "bg-sky-200"
        : isReady
        ? "bg-red-200"
        : isPrep
        ? "bg-amber-200"
        : "bg-slate-300";

      return (
        <div
          key={order.id}
          className="relative group flex flex-col items-stretch w-full"
          style={{
            minWidth: 0,
            width: "100%",
            margin: 0
          }}
        >

          {/* CARD */}
<div
  className={`w-full rounded-lg ${cardTone} border border-slate-900/10 shadow-sm flex flex-col overflow-hidden`}
  style={{ minHeight: 150 }}
>
  {/* TOP BAR: Address + Timer + Print */}
  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/30 border-b border-slate-300/50">
    <div className="min-w-0 flex-1">
      {order.customer_address ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={order.customer_address}
          className="block font-semibold text-[17px] leading-snug text-slate-900 hover:text-blue-700 truncate"
        >
          {order.customer_address}
        </a>
      ) : (
        <div className="font-semibold text-[17px] leading-snug text-slate-500 truncate">
          {t("No address available")}
        </div>
      )}
      {hasUnmatchedYsItems && (
        <a
          href="/settings/integrations#yemeksepeti-mapping"
          className="mt-1 inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-bold"
        >
          {t("Needs Yemeksepeti mapping")}
        </a>
      )}
    </div>
    {order?.items?.length > 0 && (
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-mono font-semibold text-sm ${statusVisual.timer}`}
        >
          {getWaitingTimer(order)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePacketPrint(order.id);
          }}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition text-base"
          title={t("Print Receipt")}
          type="button"
        >
          🖨️
        </button>
      </div>
    )}
  </div>

  {/* MIDDLE ROW: Order Source + Customer + Phone + Status Badge */}
  <div className="flex items-center gap-2 px-4 py-2 bg-white/20 border-b border-slate-300/50">
    {order.order_type && (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700">
        {order.order_type === "phone" ? t("Phone Order") : null}
        {order.order_type === "packet" ? (onlineSourceLabel || t("Packet")) : null}
        {order.order_type === "table" ? t("Table") : null}
        {order.order_type === "takeaway" ? t("Takeaway") : null}
      </span>
    )}
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700">
      {order.customer_name || t("Customer")}
    </span>
    {order.customer_phone && (
      <a
        href={`tel:${order.customer_phone}`}
        className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700 hover:bg-white transition"
        title={t("Click to call")}
        style={{ textDecoration: "none" }}
      >
        📞 {order.customer_phone}
      </a>
    )}
    {readyAtLabel && (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-amber-100 text-amber-800 border border-amber-300">
        {t("Ready at")} {readyAtLabel}
      </span>
    )}
    {kitchenBadgeLabel && (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none ${kitchenBadgeClass}`}
      >
        {kitchenBadgeLabel}
      </span>
    )}
    {!normalizeDriverStatus(order.driver_status) && (
      (() => {
        const hasKitchenExcludedItem = Array.isArray(order?.items)
          ? order.items.some((item) => isKitchenExcludedItem(item))
          : false;
        const onRoadAllowed = isKitchenDelivered || hasKitchenExcludedItem;
        const disabled = driverButtonDisabled(order) || !onRoadAllowed;

        return (
      <button
        type="button"
        disabled={disabled}
        title={
          !onRoadAllowed
            ? "Available after kitchen delivered or excluded items"
            : undefined
        }
        className={`ml-auto inline-flex items-center justify-center rounded-md px-5 py-1.5 text-base font-bold text-white transition disabled:opacity-50 h-8 shadow-md ${
          kitchenStatus === "new"
            ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/50"
            : kitchenStatus === "preparing"
            ? "bg-amber-600 hover:bg-amber-700 shadow-amber-500/50"
            : kitchenStatus === "ready" || kitchenStatus === "delivered"
            ? "bg-red-600 hover:bg-red-700 shadow-red-500/50"
            : "bg-teal-600 hover:bg-teal-700 shadow-teal-500/50"
        }`}
        onClick={async () => {
          if (disabled) return;
          const nextStatus = isYemeksepetiPickupOrder(order) ? "delivered" : "on_road";
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, driver_status: nextStatus } : o))
          );
          await actions.patchDriverStatus(order.id, nextStatus);
          if (
            nextStatus === "delivered" &&
            shouldAutoClosePacketOnDelivered(order)
          ) {
            try {
              await closeOrderInstantly(order);
            } catch (err) {
              globalThis.console.error("❌ Failed to auto-close delivered order:", err);
              emitToast("error", t("Failed to close order"));
              if (!propOrders) await fetchOrders();
            }
          }
        }}
      >
        {isYemeksepetiPickupOrder(order) ? t("Picked up") : t("On Road")}
      </button>
        );
      })()
    )}
    {normalizeDriverStatus(order.driver_status) === "on_road" && (
      <button
        type="button"
        disabled={driverButtonDisabled(order)}
        className="ml-auto inline-flex items-center justify-center rounded-md bg-sky-800 hover:bg-sky-900 px-5 py-1.5 text-base font-bold text-white transition disabled:opacity-50 h-8 shadow-md shadow-sky-500/50"
        onClick={async () => {
          if (driverButtonDisabled(order)) return;
          setUpdating((prev) => ({ ...prev, [order.id]: true }));
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, driver_status: "delivered" } : o))
          );
          try {
            await actions.patchDriverStatus(order.id, "delivered", {
              withJsonHeader: true,
            });
              if (shouldAutoClosePacketOnDelivered(order)) {
                try {
                  await closeOrderInstantly(order);
                } catch (err) {
                  globalThis.console.error("❌ Failed to auto-close delivered order:", err);
                  emitToast("error", t("Failed to close order"));
                  if (!propOrders) await fetchOrders();
                }
              }
          } catch (err) {
            globalThis.console.error("❌ Failed to mark delivered:", err);
            if (!propOrders) await fetchOrders();
          } finally {
            setUpdating((prev) => ({ ...prev, [order.id]: false }));
          }
        }}
      >
        {isYemeksepetiPickupOrder(order) ? t("Completed") : t("Delivered")}
      </button>
    )}
    {normalizeDriverStatus(order.driver_status) === "delivered" && (
      <button
        type="button"
        className="ml-auto inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 px-5 py-1.5 text-base font-bold text-white transition h-8 shadow-md shadow-emerald-500/50"
        onClick={async () => {
          if (isOnlinePayment) {
            try {
              await actions.closeOrder(order.id);
            } catch (err) {
              globalThis.console.error("❌ Failed to close online-paid order:", err);
              toast.error(t("Failed to close order"));
              if (!propOrders) await fetchOrders();
            }
            return;
          }
          openPaymentModalForOrder(order, { closeAfterSave: true });
        }}
      >
        {t("Close")}
      </button>
    )}
  </div>

  {/* DRIVER ROW: Avatar + Name + Auto Confirmed + Cancel */}
  <div className="flex items-center gap-3 px-4 py-2.5 bg-white/15 border-b border-slate-300/50">
    <div className="h-9 w-9 rounded-full bg-white border border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
      {driverAvatarUrl ? (
        <img
          src={driverAvatarUrl}
          alt={assignedDriverName || t("Driver")}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-xs font-bold text-slate-700">{driverInitials}</span>
      )}
    </div>
    <select
      value={order.driver_id || ""}
      onChange={async (e) => {
        const driverId = e.target.value;
        await actions.assignDriverToOrder(order, driverId);
      }}
      className="appearance-none bg-white border border-slate-300 rounded-md text-slate-900 text-sm font-semibold px-2.5 py-1 pr-6 focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
	    >
	      <option value="">{t("Unassigned")}</option>
	      {drivers.map((d) => (
	        <option key={d.id} value={d.id}>
	          {d.name}
	        </option>
	      ))}
	    </select>
      {isExternalOnlineOrder && (
        <button
          type="button"
          onClick={() => openCancelModalForOrder(order)}
          className="inline-flex items-center h-8 rounded-md bg-rose-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-rose-700 transition"
        >
          {t("Cancel")}
        </button>
      )}
	    {shouldShowManualConfirm && (
	      <button
	        type="button"
	        onClick={(e) => {
          e.stopPropagation();
          confirmOnlineOrder(order);
        }}
        disabled={Boolean(confirmingOnlineOrders?.[order.id])}
        className="inline-flex items-center h-8 rounded-md bg-indigo-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-indigo-700 transition disabled:opacity-50 disabled:hover:bg-indigo-600"
      >
        {confirmingOnlineOrders?.[order.id] ? t("Confirming...") : t("Confirm")}
      </button>
    )}
	    {autoConfirmEnabledForOrder && order.status === "confirmed" ? (
	      <>
	        <span className="inline-flex items-center h-8 rounded-md bg-emerald-100 text-emerald-800 px-3 text-[13px] font-semibold leading-none border border-emerald-300">
	          ✓ {t("Auto Confirmed")}
	        </span>
          {!isExternalOnlineOrder && (
            <button
              type="button"
              onClick={() => openCancelModalForOrder(order)}
              className="inline-flex items-center h-8 rounded-md bg-rose-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-rose-700 transition"
            >
              {t("Cancel")}
            </button>
          )}
	        <div className="ml-auto flex flex-wrap items-center gap-2 justify-end md:flex-nowrap">
	          <button
	            onClick={() => openPaymentModalForOrder(order)}
		            className="inline-flex items-center h-8 px-3 rounded-md bg-white/80 border border-slate-300 text-base font-semibold text-slate-700 hover:text-emerald-700 hover:border-emerald-400 transition"
            title={t("Edit payment")}
            type="button"
          >
            {order.payment_method ? order.payment_method : "—"}
            {!isOnlinePayment && (
              <span className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center text-slate-400" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </span>
            )}
          </button>
          <span className="inline-flex items-center h-8 px-3 rounded-md bg-white/60 border border-slate-300 text-base font-extrabold text-emerald-700 whitespace-nowrap">
            {formatCurrency(discountedTotal)}
          </span>
        </div>
      </>
	    ) : (
	      <div className="ml-auto flex flex-wrap items-center gap-2 justify-end md:flex-nowrap">
          {!isExternalOnlineOrder && (
            <button
              type="button"
              onClick={() => openCancelModalForOrder(order)}
              className="inline-flex items-center h-8 rounded-md bg-rose-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-rose-700 transition"
            >
              {t("Cancel")}
            </button>
          )}
	        <button
	          onClick={() => openPaymentModalForOrder(order)}
		          className="inline-flex items-center h-8 px-3 rounded-md bg-white/80 border border-slate-300 text-base font-semibold text-slate-700 hover:text-emerald-700 hover:border-emerald-400 transition"
	          title={t("Edit payment")}
          type="button"
        >
          {order.payment_method ? order.payment_method : "—"}
          {!isOnlinePayment && (
            <span className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center text-slate-400" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
              </svg>
            </span>
          )}
        </button>
        <span className="inline-flex items-center h-8 px-3 rounded-md bg-white/60 border border-slate-300 text-base font-extrabold text-emerald-700 whitespace-nowrap">
          {formatCurrency(discountedTotal)}
        </span>
      </div>
    )}
  </div>

	  {/* BOTTOM ROW: Order Items (left) + On Road (right) */}
	  <div className="flex flex-col gap-3 px-4 py-2.5 bg-white/10">
    <div className="flex items-center justify-between gap-3">
    <details
      open={openDetails[order.id] || false}
      onToggle={(e) => {
        setOpenDetails((prev) => ({
          ...prev,
          [order.id]: e.target.open,
        }));
        globalThis.localStorage.setItem(
          "orderDetailsState",
          JSON.stringify({
            ...openDetails,
            [order.id]: e.target.open,
          })
        );
      }}
      className="min-w-0 flex-1"
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none hover:text-slate-900">
        {t("Order Items")} <span className="text-slate-500">#{externalOrderRef || order.id}</span>
      </summary>
      <div className="mt-2 rounded-md border border-white/70 bg-white/50 px-2.5 py-2">
	        <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-sm text-slate-800">
	          {(order.items ?? []).map((item, idx) => {
	            const name =
	              item.product_name ||
	              item.external_product_name ||
	              item.order_item_name ||
	              t("Unnamed");
	            const qty = Number(item.quantity || 1);
	            const rawPrice = Number(item.price || 0);
              const unitPrice =
                Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
	              const itemNote = String(
	                item.note || item.notes || item.item_note || item.special_instructions || ""
	              ).trim();
	              const extrasList = (() => {
	                const raw = item.extras;
	                if (!raw) return [];
	                if (Array.isArray(raw)) return raw;
	                if (typeof raw === "string") {
	                  try {
	                    const parsed = JSON.parse(raw);
	                    return Array.isArray(parsed) ? parsed : [];
	                  } catch {
	                    return [];
	                  }
	                }
	                return [];
	              })();
              const extrasTotalPerUnit = extrasList.reduce((sum, ex) => {
                const price = Number(ex?.price ?? ex?.extraPrice ?? 0) || 0;
                const exQty = Number(ex?.quantity ?? ex?.qty ?? 1) || 1;
                return sum + price * exQty;
              }, 0);
              const baseTotal = unitPrice * qty;
              const extrasTotal = extrasTotalPerUnit * qty;
              const discountValue = Number(item?.discount_value) || 0;
              const discountType = String(item?.discount_type || "").toLowerCase().trim();
              const lineDiscount =
                discountValue > 0
                  ? discountType === "percent"
                    ? baseTotal * (discountValue / 100)
                    : discountType === "fixed"
                      ? discountValue
                      : 0
                  : 0;
              const lineTotal = baseTotal + extrasTotal - lineDiscount;
              const extrasLabel = extrasList
                .map((ex) => {
                  const exName = ex?.name || ex?.extra_name || ex?.title || "";
                  if (!exName) return "";
                  const q = Number(ex?.quantity || ex?.qty || 1);
                  return q > 1 ? `${exName} ×${q}` : exName;
                })
                .filter(Boolean)
                .join(", ");
	            return (
	              <Fragment key={item.unique_id || item.id || idx}>
	              <div className="min-w-0">
	                <span className="font-mono font-bold text-slate-700">{qty}×</span>{" "}
	                <span className="font-semibold truncate inline-block align-bottom max-w-[30ch]">
	                  {name}
	                </span>
	              </div>
	              <div className="font-mono font-semibold text-slate-700 whitespace-nowrap text-right">
	                {formatCurrency(lineTotal)}
	              </div>
                <div className="col-span-2 pl-5 text-[11px] text-slate-600">
                  <span className="font-mono">
                    {qty}× {formatCurrency(unitPrice)} = {formatCurrency(baseTotal)}
                  </span>
                  {extrasTotal > 0 && (
                    <span className="ml-2 font-mono text-emerald-700 font-semibold">
                      + {formatCurrency(extrasTotal)}
                    </span>
                  )}
                  {lineDiscount > 0 && (
                    <span className="ml-2 font-mono text-rose-700 font-semibold">
                      − {formatCurrency(lineDiscount)}
                    </span>
                  )}
                </div>
                {(extrasLabel || itemNote) && (
                  <div className="col-span-2 pl-5 text-xs text-slate-700">
                    {extrasLabel && (
                      <div className="text-emerald-700 font-semibold">
                        + {extrasLabel}
                      </div>
                    )}
                    {itemNote && (
                      <div className="italic text-slate-700">
                        📝 {itemNote}
                      </div>
                    )}
                  </div>
                )}
	              </Fragment>
	            );
	          })}
	        </div>
          <div className="mt-2 border-t border-white/80 pt-2 text-[12px] text-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("Items total")}</span>
              <span className="font-mono font-semibold">
                {formatCurrency(calcOrderTotalWithExtras(order))}
              </span>
            </div>
            {calcOrderDiscount(order) > 0 && (
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t("Discount")}</span>
                <span className="font-mono font-semibold text-rose-700">
                  − {formatCurrency(calcOrderDiscount(order))}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="font-semibold">{t("Total")}</span>
              <span className="font-mono font-extrabold text-emerald-700">
                {formatCurrency(discountedTotal)}
              </span>
            </div>
            {Number.isFinite(Number(order?.total)) && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{t("Order total (saved)")}</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(Number(order.total))}
                </span>
              </div>
            )}
            {Number.isFinite(Number(order?.total)) && (
              (() => {
                const diff = Number(order.total) - Number(discountedTotal || 0);
                if (Math.abs(diff) < 0.01) return null;
                return (
                  <div className="mt-1 rounded-md bg-amber-100/70 border border-amber-200 px-2 py-1 text-amber-900">
                    ⚠️ {t("Price discrepancy")}:{" "}
                    <span className="font-mono font-bold">
                      {formatCurrency(diff)}
                    </span>
                  </div>
                );
              })()
            )}
          </div>
	        {displayOrderNote && (
	          <div className="mt-1 text-xs text-slate-700 italic">
	            📝 {displayOrderNote}
	          </div>
	        )}
	      </div>
	    </details>
    </div>

	    <div className="flex items-center gap-2 flex-shrink-0">
	    </div>
	  </div>
</div>

{/* Ultra-compact order card layout (no collapses) - HIDDEN */}
  <div className="hidden flex-col gap-2">
    {/* Address row */}
    <div className="min-w-0 flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        {order.customer_address ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={order.customer_address}
            className="block w-full rounded-2xl bg-white/70 border border-slate-200 px-3 py-2 text-sm sm:text-base font-extrabold text-slate-900 leading-tight break-words line-clamp-2 dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
          >
            {order.customer_address}
          </a>
        ) : (
          <div className="w-full rounded-2xl bg-white/70 border border-slate-200 px-3 py-2 text-sm sm:text-base font-extrabold text-slate-900 leading-tight dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
            {t("No address available")}
          </div>
        )}
        {hasUnmatchedYsItems && (
          <a
            href="/settings/integrations#yemeksepeti-mapping"
            className="mt-1 inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow border border-amber-200"
          >
            {t("Needs Yemeksepeti mapping")}
          </a>
        )}
      </div>
      {order?.items?.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0 scale-[0.95] origin-top-right">
          <span
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full font-mono font-semibold text-sm sm:text-base shadow-sm ${statusVisual.timer}`}
          >
            {getWaitingTimer(order)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePacketPrint(order.id);
            }}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 transition text-sm sm:text-base dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/40"
            title={t("Print Receipt")}
            type="button"
          >
            🖨️
          </button>
        </div>
      )}
    </div>

    {/* Customer/Phone row + timer right */}
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {order.order_type && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
	            {order.order_type === "phone" ? t("Phone Order") : null}
	            {order.order_type === "packet" ? (onlineSourceLabel || t("Packet")) : null}
	            {order.order_type === "table" ? t("Table") : null}
	            {order.order_type === "takeaway" ? t("Takeaway") : null}
	          </span>
	        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
          👤 {order.customer_name || t("Customer")}
        </span>
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50 transition dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/40"
            title={t("Click to call")}
            style={{ textDecoration: "none" }}
          >
            📞 {order.customer_phone}
          </a>
        )}
        {readyAtLabel && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold shadow-sm bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-500/30">
            ⏳ {t("Ready at")} {readyAtLabel}
          </span>
        )}
        {kitchenBadgeLabel && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold shadow-sm ${kitchenBadgeClass}`}
          >
            {kitchenBadgeLabel}
          </span>
        )}
      </div>
    </div>

    {/* Driver / Order Items / Amount row */}
    <div className="grid items-start gap-2 sm:grid-cols-[minmax(200px,0.9fr)_minmax(320px,1.6fr)_minmax(170px,0.7fr)]">
      {/* Driver */}
      <div className="min-w-0 flex items-center gap-2">
        <div className="h-10 w-10 rounded-full bg-white border border-slate-300 shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 dark:bg-slate-950/50 dark:border-slate-800">
          {driverAvatarUrl ? (
            <img
              src={driverAvatarUrl}
              alt={assignedDriverName || t("Driver")}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-100">{driverInitials}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold tracking-[0.24em] text-slate-400 uppercase leading-none">
            {t("Driver")}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-nowrap">
            <select
              value={order.driver_id || ""}
              onChange={async (e) => {
                const driverId = e.target.value;
                await actions.assignDriverToOrder(order, driverId);
              }}
              className="appearance-none bg-white border border-slate-200 rounded-xl text-slate-900 text-[12px] font-semibold px-2 py-1 pr-6 shadow-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all whitespace-nowrap max-w-[200px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
            >
              <option value="">{t("Unassigned")}</option>
	              {drivers.map((d) => (
	                <option key={d.id} value={d.id}>
	                  {d.name}
	                </option>
	              ))}
	            </select>
              {shouldShowManualConfirm && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmOnlineOrder(order);
                  }}
                  disabled={Boolean(confirmingOnlineOrders?.[order.id])}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 text-white px-3 py-1 text-[12px] font-semibold shadow-sm hover:bg-indigo-700 transition whitespace-nowrap disabled:opacity-50 disabled:hover:bg-indigo-600"
                >
                  {confirmingOnlineOrders?.[order.id] ? t("Confirming...") : t("Confirm")}
                </button>
              )}
	            {autoConfirmEnabledForOrder && order.status === "confirmed" && (
	              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-[12px] font-semibold border border-emerald-200 shadow-sm whitespace-nowrap dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-500/30">
	                ✓ {t("Auto Confirmed")}
	              </span>
	            )}
            <button
              type="button"
              onClick={() => openCancelModalForOrder(order)}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-3 py-1 text-[12px] font-semibold shadow-sm hover:bg-rose-700 transition whitespace-nowrap"
            >
              ✕ {t("Cancel")}
            </button>
          </div>
        </div>
      </div>

{/* Order items + status */}
      <div className="min-w-0 flex flex-col gap-2">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,max-content))] items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
          {order.status === "draft" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700">
              {t("draft")}
            </span>
          )}
          {order.status === "cancelled" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-rose-100 text-rose-700 border border-rose-200 shadow-sm dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-500/30">
              {t("cancelled")}
            </span>
          )}
          {order.status === "closed" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700">
              {t("closed")}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="flex flex-col items-end gap-1">
        <div className="mt-0.5 flex items-center gap-2">
          <button
            onClick={() => openPaymentModalForOrder(order)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-base sm:text-xl font-extrabold text-slate-700 hover:text-emerald-700 hover:border-emerald-300 shadow-sm transition dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:text-emerald-200 dark:hover:border-emerald-500/40"
            title={t("Edit payment")}
            type="button"
          >
            {order.payment_method ? order.payment_method : "—"}
            {!isOnlinePayment && (
              <span className="text-sm sm:text-base opacity-80" aria-hidden="true">
                ✎
              </span>
            )}
          </button>
          <div className="text-base sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-200">
            {formatCurrency(discountedTotal)}
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>

    );
  }}>
</OrdersList>
{shouldWindow && visibleCount < safeOrders.length && (
  <div className="mt-3 flex justify-center">
    <button
      type="button"
      onClick={() => setVisibleCount((prev) => prev + 120)}
      className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      Load more
    </button>
  </div>
)}
</>
);
});

export default OrdersLeftListPanel;
