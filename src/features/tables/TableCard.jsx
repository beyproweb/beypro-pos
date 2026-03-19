import React from "react";
import {
  isCheckedInReservationStatus,
  isCheckedOutReservationStatus,
  normalizeOrderStatus,
} from "./tableVisuals";
import {
  hasConcertBookingContext,
  isConcertBookingConfirmed,
  isReservationPendingConfirmation,
} from "../../utils/reservationStatus";
import ElapsedTimer from "./components/ElapsedTimer";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
} from "./dev/perfDebug";

const KITCHEN_STATUSES = ["preparing", "ready", "delivered"];
const CHECKIN_REGRESSION_STATUSES = new Set([
  "reserved",
  "confirmed",
  "draft",
  "new",
  "pending",
  "paid",
  "open",
  "in_progress",
]);

const CARD_RADIUS_CLASS = "rounded-xl";
const BADGE_BASE_CLASS =
  "inline-flex h-6 items-center justify-center rounded-md border px-2.5 text-xs font-semibold leading-none whitespace-nowrap";
const PANEL_BASE_CLASS =
  "rounded-lg border bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.08)]";
const ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium leading-none shadow-sm transition duration-150 hover:brightness-95 active:scale-[0.99]";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const getKitchenStatusToneClass = (status) => {
  if (status === "preparing") return "bg-amber-600 text-white border-amber-700";
  if (status === "ready") return "bg-indigo-700 text-white border-indigo-800";
  if (status === "delivered") return "bg-indigo-600 text-white border-indigo-700";
  return "bg-slate-700 text-white border-slate-800";
};

const getPhoneHref = (phone) => {
  const value = String(phone ?? "").trim();
  if (!value) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
};

function Pill({ as: Component = "span", className = "", children, ...props }) {
  return (
    <Component className={cx(BADGE_BASE_CLASS, className)} {...props}>
      {children}
    </Component>
  );
}

function ActionButton({ className = "", children, type = "button", ...props }) {
  return (
    <button type={type} className={cx(ACTION_BUTTON_BASE_CLASS, className)} {...props}>
      {children}
    </button>
  );
}

function TableCard({
  table,
  tableLabelText,
  showAreas,
  formatAreaLabel,
  t,
  formatCurrency,
  handleTableClick,
  handlePrintOrder,
  handleGuestsChange,
  handleCloseTable,
  handleDeleteReservation,
  handleCheckinReservation,
  getTablePrepMeta,
  waiterCallsByTable,
  handleAcknowledgeWaiterCall,
  handleResolveWaiterCall,
}) {
  const renderCount = useRenderCount("TableCard", {
    id: table?.tableNumber,
    logEvery: 20,
  });
  const showRenderCounter = isTablePerfDebugEnabled();
  const tableOrder = table.order;
  const tableItems = Array.isArray(tableOrder?.items) ? tableOrder.items : [];
  const tableSuborders = Array.isArray(tableOrder?.suborders) ? tableOrder.suborders : [];
  const hasOrderItems = tableItems.length > 0;
  const hasSuborderItems = tableSuborders.some(
    (suborder) => Array.isArray(suborder?.items) && suborder.items.length > 0
  );
  const hasReceiptHistory =
    tableOrder?.receipt_id != null ||
    tableOrder?.receiptId != null ||
    (Array.isArray(tableOrder?.receiptMethods) && tableOrder.receiptMethods.length > 0);
  const hasOrderActivity =
    hasOrderItems || hasSuborderItems || hasReceiptHistory || Number(tableOrder?.total || 0) > 0;
  const normalizedOrderStatus = normalizeOrderStatus(tableOrder?.status);
  const tablePrepMeta = getTablePrepMeta(table.tableNumber);
  const waiterCall = waiterCallsByTable?.[String(table.tableNumber)] || null;
  const isCallingWaiter = Boolean(waiterCall);

  const handleCardClick = React.useCallback(() => {
    handleTableClick(table);
  }, [handleTableClick, table]);

  const stopPropagation = React.useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleGuestsSelectChange = React.useCallback(
    (e) => {
      const raw = e.target.value;
      const next = raw === "" ? null : Math.trunc(Number(raw));
      handleGuestsChange(table.tableNumber, next);
    },
    [handleGuestsChange, table.tableNumber]
  );

  const handleCloseClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      if (tableOrder) {
        const hasCheckedInReservationOnTable = [
          tableOrder?.status,
          tableOrder?.reservation?.status,
          table?.reservationFallback?.status,
        ].some((status) => isCheckedInReservationStatus(status));
        if (hasCheckedInReservationOnTable) {
          window.alert(t("Please check-out before closing table"));
          return;
        }
        handleCloseTable({
          ...tableOrder,
          reservationFallback: table?.reservationFallback || null,
        });
      }
    },
    [handleCloseTable, t, table, tableOrder]
  );

  const handleResolvedClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleResolveWaiterCall?.(table.tableNumber);
    },
    [handleResolveWaiterCall, table.tableNumber]
  );

  const isReservedTable = Boolean(table.isReservedTable);
  const isFreeTable = Boolean(table.isFreeTable);
  const isPaidTable = !isFreeTable && Boolean(table.isFullyPaid);
  const hasUnpaidItems = !isFreeTable && Boolean(table.hasUnpaidItems);
  const hasReservationSignalOnOrder = Boolean(
    tableOrder?.reservation_id ||
      tableOrder?.reservationId ||
      tableOrder?.reservation_date ||
      tableOrder?.reservationDate ||
      tableOrder?.reservation_time ||
      tableOrder?.reservationTime ||
      tableOrder?.reservation?.id ||
      tableOrder?.reservation?.reservation_id ||
      tableOrder?.reservation?.reservationId ||
      tableOrder?.reservation?.reservation_date ||
      tableOrder?.reservation?.reservationDate ||
      tableOrder?.reservation?.reservation_time ||
      tableOrder?.reservation?.reservationTime
  );
  const hasExplicitReservationState =
    normalizedOrderStatus === "reserved" && hasReservationSignalOnOrder;
  const hasReservationCoreData = React.useCallback((value) => {
    if (!value || typeof value !== "object") return false;
    return Boolean(
      value.reservation_date ??
        value.reservationDate ??
        value.reservation_time ??
        value.reservationTime ??
        value.reservation_notes ??
        value.reservationNotes ??
        (Number(value.reservation_clients ?? value.reservationClients ?? 0) > 0)
    );
  }, []);
  const fallbackReservationToneStatus = normalizeOrderStatus(table?.reservationFallback?.status);
  const shouldUseReservedTone = isReservedTable && normalizedOrderStatus === "reserved";
  const hasReservedVisualTone =
    shouldUseReservedTone ||
    normalizedOrderStatus === "reserved" ||
    fallbackReservationToneStatus === "reserved";
  const hasCheckedInVisualTone =
    normalizedOrderStatus === "checked_in" || fallbackReservationToneStatus === "checked_in";
  const cardToneClass = hasUnpaidItems
      ? "bg-red-100 border-red-500"
      : normalizedOrderStatus === "confirmed"
        ? "bg-red-100 border-red-500"
        : hasReservedVisualTone
          ? "bg-blue-100 border-blue-500"
          : hasCheckedInVisualTone
            ? "bg-emerald-100 border-emerald-500"
            : isPaidTable
              ? "bg-emerald-100 border-emerald-500"
              : "bg-slate-100 border-slate-400";
  const hasPreparingItems = tableItems.some((i) => i.kitchen_status === "preparing");
  const isKitchenDelivered =
    Boolean(tableOrder?.kitchen_delivered_at) ||
    (tableItems.length > 0 && tableItems.every((i) => i.kitchen_status === "delivered"));
  const readyAtLabel = tablePrepMeta.statusLabel;
  const showReadyAt =
    !!readyAtLabel &&
    !isKitchenDelivered &&
    (hasPreparingItems || !!tableOrder?.estimated_ready_at || !!tableOrder?.prep_started_at);

  const reservationInfo = React.useMemo(() => {
    // Use fallback reservation only when no order is attached to the table
    // or when the attached order is explicitly reservation-like.
    // Also allow matching fallback reservation state for the same active order so
    // reservation badge does not disappear after item confirmation.
    const fallbackOrderId = Number(
      table?.reservationFallback?.order_id ?? table?.reservationFallback?.orderId
    );
    const fallbackReservationId = Number(table?.reservationFallback?.id);
    const currentOrderId = Number(tableOrder?.id);
    const fallbackMatchesCurrentOrder =
      Number.isFinite(fallbackOrderId) &&
      Number.isFinite(currentOrderId) &&
      fallbackOrderId === currentOrderId;
    const fallbackMatchesCurrentReservationOrder =
      Number.isFinite(fallbackReservationId) &&
      Number.isFinite(currentOrderId) &&
      fallbackReservationId === currentOrderId;
    const fallbackCanBindToCurrentOrder =
      !Number.isFinite(currentOrderId) ||
      fallbackMatchesCurrentOrder ||
      fallbackMatchesCurrentReservationOrder;
    const canUseFallbackReservation =
      !tableOrder ||
      hasExplicitReservationState ||
      fallbackCanBindToCurrentOrder;

    if (tableOrder?.reservation && hasReservationCoreData(tableOrder.reservation)) {
      return {
        id: tableOrder.reservation.id ?? null,
        order_id:
          tableOrder.reservation.order_id ??
          tableOrder.reservation.orderId ??
          tableOrder.id ??
          null,
        orderId:
          tableOrder.reservation.orderId ??
          tableOrder.reservation.order_id ??
          tableOrder.id ??
          null,
        status: tableOrder.reservation.status ?? tableOrder.status ?? null,
        order_type: tableOrder.reservation.order_type ?? tableOrder.order_type ?? null,
        reservation_date: tableOrder.reservation.reservation_date ?? null,
        reservation_time:
          tableOrder.reservation.reservation_time ?? tableOrder.reservation.reservationTime ?? null,
        reservation_clients:
          tableOrder.reservation.reservation_clients ??
          tableOrder.reservation.reservationClients ??
          0,
        reservation_notes:
          tableOrder.reservation.reservation_notes ?? tableOrder.reservation.reservationNotes ?? "",
        customer_name:
          tableOrder.reservation.customer_name ??
          tableOrder.reservation.customerName ??
          tableOrder.customer_name ??
          tableOrder.customerName ??
          "",
        customer_phone:
          tableOrder.reservation.customer_phone ??
          tableOrder.reservation.customerPhone ??
          tableOrder.customer_phone ??
          tableOrder.customerPhone ??
          "",
      };
    }
    if (hasReservationCoreData(tableOrder)) {
      return {
        id: tableOrder.reservation_id ?? tableOrder.reservationId ?? null,
        order_id: tableOrder.id ?? null,
        orderId: tableOrder.id ?? null,
        status: tableOrder.status ?? null,
        order_type: tableOrder.order_type ?? null,
        reservation_date: tableOrder.reservation_date ?? tableOrder.reservationDate ?? null,
        reservation_time: tableOrder.reservation_time ?? tableOrder.reservationTime ?? null,
        reservation_clients: tableOrder.reservation_clients ?? tableOrder.reservationClients ?? 0,
        reservation_notes: tableOrder.reservation_notes ?? tableOrder.reservationNotes ?? "",
        customer_name: tableOrder.customer_name ?? tableOrder.customerName ?? "",
        customer_phone: tableOrder.customer_phone ?? tableOrder.customerPhone ?? "",
      };
    }
    const fallback = canUseFallbackReservation ? table.reservationFallback : null;
    if (fallback && hasReservationCoreData(fallback)) {
      return {
        id: fallback.id ?? null,
        order_id: fallback.order_id ?? fallback.orderId ?? null,
        orderId: fallback.orderId ?? fallback.order_id ?? null,
        status: fallback.status ?? null,
        order_type: fallback.order_type ?? null,
        reservation_date: fallback.reservation_date ?? fallback.reservationDate ?? null,
        reservation_time: fallback.reservation_time ?? fallback.reservationTime ?? null,
        reservation_clients: fallback.reservation_clients ?? fallback.reservationClients ?? 0,
        reservation_notes: fallback.reservation_notes ?? fallback.reservationNotes ?? "",
        customer_name: fallback.customer_name ?? fallback.customerName ?? "",
        customer_phone: fallback.customer_phone ?? fallback.customerPhone ?? "",
      };
    }
    return null;
  }, [hasExplicitReservationState, hasReservationCoreData, table?.reservationFallback, tableOrder]);
  const reservationStatus = React.useMemo(() => {
    const normalizedOrderLevelStatus = normalizeOrderStatus(tableOrder?.status);
    const normalizedReservationStatus = normalizeOrderStatus(
      normalizedOrderLevelStatus === "checked_in"
        ? tableOrder?.status
        : reservationInfo?.status ?? tableOrder?.status
    );
    if (normalizedReservationStatus === "checked_in") return "checked_in";

    const fallbackStatus = normalizeOrderStatus(table?.reservationFallback?.status);
    if (fallbackStatus !== "checked_in") return normalizedReservationStatus;
    if (!CHECKIN_REGRESSION_STATUSES.has(normalizedReservationStatus)) {
      return normalizedReservationStatus;
    }

    const fallbackOrderId = Number(
      table?.reservationFallback?.order_id ?? table?.reservationFallback?.orderId
    );
    const fallbackReservationId = Number(table?.reservationFallback?.id);
    const currentOrderId = Number(tableOrder?.id);
    const currentReservationId = Number(
      reservationInfo?.id ??
        tableOrder?.reservation_id ??
        tableOrder?.reservationId ??
        tableOrder?.reservation?.id
    );
    const fallbackMatchesCurrentOrder =
      Number.isFinite(fallbackOrderId) &&
      Number.isFinite(currentOrderId) &&
      fallbackOrderId === currentOrderId;
    const fallbackMatchesCurrentReservation =
      Number.isFinite(fallbackReservationId) &&
      Number.isFinite(currentReservationId) &&
      fallbackReservationId === currentReservationId;

    return fallbackMatchesCurrentOrder || fallbackMatchesCurrentReservation
      ? "checked_in"
      : normalizedReservationStatus;
  }, [reservationInfo?.id, reservationInfo?.status, table?.reservationFallback, tableOrder]);
  const isCheckedInReservation = isCheckedInReservationStatus(reservationStatus);
  const isCheckedOutReservation = isCheckedOutReservationStatus(reservationStatus);
  const shouldShowReservedBadge = React.useMemo(() => {
    if (reservationInfo) {
      return true;
    }
    return (
      (normalizedOrderStatus === "reserved" || normalizedOrderStatus === "checked_in") &&
      hasReservationSignalOnOrder
    );
  }, [
    hasExplicitReservationState,
    hasReservationSignalOnOrder,
    isCheckedInReservation,
    isFreeTable,
    isPaidTable,
    normalizedOrderStatus,
    reservationInfo,
  ]);
  const handleDeleteReservationClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleDeleteReservation?.(table, reservationInfo);
    },
    [handleDeleteReservation, reservationInfo, table]
  );
  const handleCheckinReservationClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleCheckinReservation?.(table, reservationInfo);
    },
    [handleCheckinReservation, reservationInfo, table]
  );
  const handleCheckoutReservationClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      const reservationOrderId = Number(reservationInfo?.order_id ?? reservationInfo?.orderId);
      const activeOrderId = Number(tableOrder?.id);
      const checkoutTarget =
        Number.isFinite(reservationOrderId) && reservationOrderId > 0
          ? reservationOrderId
          : Number.isFinite(activeOrderId) && activeOrderId > 0
            ? activeOrderId
            : tableOrder ||
              reservationInfo?.order_id ||
              reservationInfo?.orderId ||
              reservationInfo?.id;
      if (!checkoutTarget) return;
      handleCloseTable?.(checkoutTarget, {
        preserveReservationShadow: false,
        requirePaid: true,
        isReservationCheckout: true,
        tableNumber: table?.tableNumber,
        reservationId: reservationInfo?.id ?? null,
      });
    },
    [handleCloseTable, reservationInfo, table, tableOrder]
  );
  const reservationPhoneHref = React.useMemo(
    () => getPhoneHref(reservationInfo?.customer_phone),
    [reservationInfo?.customer_phone]
  );
  const handlePhoneLinkClick = React.useCallback((e) => {
    e.stopPropagation();
  }, []);

  const confirmedStartTime = tablePrepMeta.startedAt;

  const { seats, guestOptions, clampedGuests } = React.useMemo(() => {
    const seatsValue = Math.max(0, Math.trunc(Number(table.seats)));
    const options = Array.from({ length: seatsValue + 1 }, (_, n) => n);

    const tableGuestsNum =
      table?.guests === null || table?.guests === undefined || table?.guests === ""
        ? null
        : Number(table.guests);

    // Keep dropdown selection tied to explicit TableOverview guest choice only.
    // Do not auto-fill from reservation payload (e.g. QR reservation clients).
    const effectiveGuests = Number.isFinite(tableGuestsNum) ? tableGuestsNum : null;

    const clamped = Number.isFinite(effectiveGuests)
      ? Math.min(Math.max(0, Math.trunc(effectiveGuests)), seatsValue)
      : null;

    return { seats: seatsValue, guestOptions: options, clampedGuests: clamped };
  }, [table.guests, table.seats]);

  const guestOptionElements = React.useMemo(
    () =>
      guestOptions.map((n) => (
        <option key={n} value={String(n)}>
          {n}
        </option>
      )),
    [guestOptions]
  );

  const kitchenStatusCounts = React.useMemo(() => {
    const counts = { new: 0, preparing: 0, ready: 0, delivered: 0 };
    for (const item of tableItems) {
      const status = item?.kitchen_status;
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    }
    return counts;
  }, [tableItems]);

  const compactKitchenStatusBadges = React.useMemo(
    () =>
      KITCHEN_STATUSES.reduce((badges, status) => {
        const count = kitchenStatusCounts[status];
        if (!count) return badges;
        badges.push(
          <Pill
            key={`header-${status}`}
            className={cx("h-4 shrink-0 px-1 text-[9px] shadow-none", getKitchenStatusToneClass(status))}
          >
            {count} {t(status)}
          </Pill>
        );
        return badges;
      }, []),
    [kitchenStatusCounts, t]
  );

  const tableStatusToneClass = React.useMemo(() => {
    if (normalizedOrderStatus === "confirmed") return "bg-red-700 text-white border-red-800";
    if (normalizedOrderStatus === "reserved") return "bg-blue-700 text-white border-blue-800";
    if (normalizedOrderStatus === "checked_in") return "bg-emerald-700 text-white border-emerald-800";
    if (normalizedOrderStatus === "paid") return "bg-emerald-700 text-white border-emerald-800";
    if (normalizedOrderStatus === "draft") return "bg-slate-600 text-white border-slate-700";
    if (hasUnpaidItems) return "bg-red-700 text-white border-red-800";
    return "bg-slate-700 text-white border-slate-800";
  }, [hasUnpaidItems, normalizedOrderStatus]);

  const tableStatusClassName = React.useMemo(
    () => cx(BADGE_BASE_CLASS, "shadow-none", tableStatusToneClass),
    [tableStatusToneClass]
  );

  const hasPendingReservationActiveStatus =
    Boolean(reservationInfo) &&
    !isCheckedInReservation &&
    normalizedOrderStatus !== "reserved" &&
    normalizedOrderStatus !== "";
  const hasZeroValueTableState =
    !isPaidTable &&
    !hasUnpaidItems &&
    !hasReceiptHistory &&
    !hasSuborderItems &&
    tableItems.length === 0 &&
    Number(tableOrder?.total || 0) <= 0;
  const isFreeDisplay =
    isFreeTable ||
    (!isCheckedInReservation &&
      !isCheckedOutReservation &&
      hasZeroValueTableState &&
      (Boolean(reservationInfo) ||
        normalizedOrderStatus === "" ||
        normalizedOrderStatus === "draft" ||
        normalizedOrderStatus === "reserved" ||
        normalizedOrderStatus === "confirmed"));

  const shouldShowConfirmedTimer = normalizedOrderStatus === "confirmed" && hasOrderItems;
  const shouldRenderKitchenStatuses = Boolean(tableOrder?.items);
  const isOrderDelayed = tablePrepMeta.isDelayed;
  const displayTotal = formatCurrency(Number(table.unpaidTotal || 0));
  const paidStatusLabel = t("Unpaid");
  const fullyPaidStatusLabel = t("Paid");
  const orderStatusLabel = isCheckedInReservationStatus(normalizedOrderStatus)
    ? t("Checked-in")
    : t(tableOrder?.status === "draft" ? "Free" : tableOrder?.status);
  const showOrderStatusBadge =
    normalizedOrderStatus !== "confirmed" &&
    !isPaidTable &&
    (!shouldShowReservedBadge || hasPendingReservationActiveStatus);
  const reservationPanelClassName = isCheckedOutReservation
    ? cx(PANEL_BASE_CLASS, "border-slate-400 bg-slate-100")
    : isCheckedInReservation
      ? cx(PANEL_BASE_CLASS, "border-emerald-500 bg-emerald-100")
      : cx(PANEL_BASE_CLASS, "border-blue-400 bg-blue-100");
  const reservationCompactStateLabel = isCheckedOutReservation
    ? t("Checked out")
    : isCheckedInReservation
      ? t("Checked-in")
      : `${t("Reserved")}!`;
  const reservationCompactBadgeToneClass = isCheckedOutReservation
    ? "border-slate-700 bg-slate-700 text-white"
    : isCheckedInReservation
      ? "border-emerald-800 bg-emerald-700 text-white"
      : "border-blue-700/20 bg-blue-600 px-2 tracking-wide text-white";
  const reservationMetaPillClass = isCheckedOutReservation
    ? "border-slate-300 bg-white text-slate-700 shadow-none"
    : isCheckedInReservation
      ? "border-emerald-300 bg-white text-emerald-900 shadow-none"
      : "border-blue-300 bg-white text-blue-900 shadow-none";
  const reservationActionButtonClass = "h-[22px] min-w-0 px-2 text-xs font-semibold";
  const reservationContactFrameClass = isCheckedOutReservation
    ? "rounded-lg border border-slate-300 bg-slate-50 p-2 text-[10px] text-slate-800"
    : isCheckedInReservation
      ? "rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-[10px] text-emerald-950"
      : "rounded-lg border border-blue-300 bg-blue-50 p-2 text-[10px] text-blue-950";
  const isConcertReservation = hasConcertBookingContext(
    tableOrder,
    reservationInfo,
    table?.reservationFallback
  );
  const needsReservationConfirmation =
    isReservationPendingConfirmation(tableOrder, reservationInfo, table?.reservationFallback) ||
    (isConcertReservation &&
      !isConcertBookingConfirmed(tableOrder, reservationInfo, table?.reservationFallback));
  const checkinButtonLabel = needsReservationConfirmation ? t("Confirm") : t("Checkin");
  const fallbackReservationStatus = normalizeOrderStatus(table?.reservationFallback?.status);
  const showCheckoutReservationButton =
    (!isCheckedOutReservation && isCheckedInReservation) ||
    (Boolean(reservationInfo) &&
      !isCheckedOutReservation &&
      normalizedOrderStatus === "paid" &&
      fallbackReservationStatus === "checked_in");

  return (
    <div
      key={table.tableNumber}
      onClick={handleCardClick}
      className={cx(
        "group relative flex h-[276px] w-full max-w-[380px] self-start cursor-pointer flex-col justify-between overflow-hidden border-2 shadow-sm transition-all duration-150 hover:shadow-md",
        CARD_RADIUS_CLASS,
        cardToneClass,
        isCallingWaiter && "ring-2 ring-red-500/80 animate-[pulse_2.4s_ease-in-out_infinite]"
      )}
    >
      {isCallingWaiter && (
        <div className="pointer-events-none absolute inset-0 bg-red-500/10 animate-pulse" />
      )}
      <div className="relative flex h-full flex-col p-3">
        {showRenderCounter && (
          <div className="mb-2 flex justify-end">
            <RenderCounter label={`Card ${table.tableNumber}`} value={renderCount} />
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex flex-1 items-start">
            {isFreeDisplay ? (
              <div className="flex min-w-0 items-center gap-2">
                {shouldShowReservedBadge ? (
                  <span className="truncate text-sm font-bold tracking-tight text-black sm:text-[15px]">
                    {tableLabelText} {String(table.tableNumber).padStart(2, "0")}
                  </span>
                ) : null}
                <Pill className="border-slate-400 bg-slate-100 text-slate-700 shadow-none">
                  {t("Free")}
                </Pill>
              </div>
            ) : (
              <div className="min-w-0 text-center">
                <span className="truncate text-sm font-bold tracking-tight text-slate-800 sm:text-[15px]">
                  {tableLabelText} {String(table.tableNumber).padStart(2, "0")}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <div className="inline-flex items-center justify-center rounded-md bg-slate-900 px-2 py-1">
                <div className="text-xs font-semibold tracking-tight text-white">
                  {displayTotal}
                </div>
              </div>
              {isPaidTable ? (
                <div className="mt-2 flex justify-end">
                  <Pill className="border-emerald-700 bg-emerald-700 text-white shadow-none">
                    {fullyPaidStatusLabel}
                  </Pill>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {table.label && (
          <Pill className="mt-2 max-w-full justify-start truncate border-slate-300 bg-slate-100 text-slate-600 shadow-none">
            {table.label}
          </Pill>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {table.seats && (
            <Pill className="border-slate-300 bg-slate-100 text-slate-700 shadow-none">
              {table.seats} {t("Seats")}
            </Pill>
          )}

          {table.seats && (
            <div
              className={cx(
                BADGE_BASE_CLASS,
                "gap-2 border-slate-400 bg-slate-100 pr-1.5 text-slate-700 shadow-none"
              )}
              onClick={stopPropagation}
            >
              <span className="text-[11px] leading-none">👥</span>
              <select
                className="min-w-[2rem] bg-transparent pr-0.5 text-[10px] sm:text-[11px] font-bold text-slate-700 outline-none"
                value={Number.isFinite(clampedGuests) ? String(clampedGuests) : ""}
                onChange={handleGuestsSelectChange}
                onClick={stopPropagation}
              >
                <option value="">—</option>
                {guestOptionElements}
              </select>
              <span className="text-slate-500">/{seats}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex h-6 items-center justify-between gap-2">
          <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
            {!isFreeDisplay && !shouldShowReservedBadge && showOrderStatusBadge ? (
              <span className={tableStatusClassName}>{orderStatusLabel}</span>
            ) : null}
            {!isFreeDisplay &&
            !shouldShowReservedBadge &&
            shouldRenderKitchenStatuses &&
            compactKitchenStatusBadges.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1 overflow-hidden">
                {compactKitchenStatusBadges}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!isFreeDisplay && !shouldShowReservedBadge && shouldShowConfirmedTimer ? (
              <Pill className="mt-1 border-indigo-900 bg-indigo-900 px-2 font-mono text-white">
                <ElapsedTimer startTime={confirmedStartTime} />
              </Pill>
            ) : null}
            {!isFreeDisplay && !shouldShowReservedBadge && showReadyAt ? (
              <Pill
                className={cx(
                  "max-w-full font-bold",
                  isOrderDelayed
                    ? "border-amber-700 bg-amber-600 text-white"
                    : "border-amber-600 bg-amber-500 text-white"
                )}
              >
                {t("Ready at")} {readyAtLabel}
              </Pill>
            ) : null}
          </div>
        </div>

        <div
          className={cx(
            "relative flex min-h-0 flex-1 flex-col",
            isFreeDisplay && shouldShowReservedBadge ? "mt-0 gap-1" : "mt-2 gap-2"
          )}
        >
          {isFreeDisplay && !shouldShowReservedBadge ? (
            <div className="flex items-center justify-center">
              <div className="min-w-0 text-center">
                <span className="truncate text-base font-medium tracking-tight text-slate-500 sm:text-[24px]">
                  {tableLabelText} {String(table.tableNumber).padStart(2, "0")}
                </span>
              </div>
            </div>
          ) : null}

          {isFreeDisplay && !shouldShowReservedBadge ? (
            <div className="min-h-0 flex-1" />
          ) : null}

          {shouldShowReservedBadge && (
            <div
              className={cx(
                reservationPanelClassName,
                isFreeDisplay && shouldShowReservedBadge && "-mt-3"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <Pill className={reservationCompactBadgeToneClass}>
                    {reservationCompactStateLabel}
                  </Pill>
                </div>
                {reservationInfo ? (
                  <Pill className={reservationMetaPillClass}>
                    {reservationInfo.reservation_clients || 0} {t("guests")}
                  </Pill>
                ) : null}
              </div>

              {reservationInfo ? (
                <div className="space-y-2">
                  {(reservationInfo.customer_name || reservationInfo.customer_phone) && (
                    <div
                      className={cx(
                        "flex min-w-0 flex-wrap items-center gap-2",
                        reservationContactFrameClass
                      )}
                    >
                      {reservationInfo.customer_name && (
                        <span className="truncate font-bold text-slate-800">
                          {reservationInfo.customer_name}
                        </span>
                      )}
                      {reservationInfo.customer_phone &&
                        (reservationPhoneHref ? (
                          <a
                            href={reservationPhoneHref}
                            onClick={handlePhoneLinkClick}
                            className={cx(
                              "truncate font-bold underline underline-offset-2",
                              isCheckedInReservation
                                ? "text-emerald-800 decoration-emerald-300 hover:text-emerald-900"
                                : "text-blue-800 decoration-blue-300 hover:text-blue-900"
                            )}
                          >
                            {reservationInfo.customer_phone}
                          </a>
                        ) : (
                          <span className="truncate font-bold">
                            {reservationInfo.customer_phone}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] font-semibold text-slate-700 truncate">
                  {t("This table has an active reservation")}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {!isCheckedInReservation && !isCheckedOutReservation && (
                  <ActionButton
                    onClick={handleCheckinReservationClick}
                    className={cx(
                      reservationActionButtonClass,
                      "border-emerald-800 bg-emerald-700 text-white hover:bg-emerald-800"
                    )}
                  >
                    {checkinButtonLabel}
                  </ActionButton>
                )}
                {showCheckoutReservationButton && (
                  <ActionButton
                    onClick={handleCheckoutReservationClick}
                    className={cx(
                      reservationActionButtonClass,
                      "border-blue-800 bg-blue-700 text-white hover:bg-blue-800"
                    )}
                  >
                    {t("Check Out")}
                  </ActionButton>
                )}
                <ActionButton
                  onClick={handleDeleteReservationClick}
                  className={cx(
                    reservationActionButtonClass,
                    "border-rose-800 bg-rose-700 text-white hover:bg-rose-800"
                  )}
                >
                  {t("Cancel")}
                </ActionButton>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
          {showAreas ? (
            <Pill className="h-6 max-w-[55%] justify-start truncate border-slate-300 bg-slate-100 px-2 text-xs font-semibold text-slate-700 shadow-none">
              📍 {formatAreaLabel(table.area)}
            </Pill>
          ) : (
            <span />
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {isCallingWaiter && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Pill className="border-red-700 bg-red-600 text-white animate-pulse">
                  🔴 {t("Calling")}
                </Pill>
                <ActionButton
                  onClick={handleResolvedClick}
                  className="border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                >
                  {t("Resolved")}
                </ActionButton>
              </div>
            )}

            {hasOrderActivity && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {hasUnpaidItems ? (
                  <Pill className="border-red-700 bg-red-600 text-white shadow-none">
                    {paidStatusLabel}
                  </Pill>
                ) : isPaidTable ? (
                  <ActionButton
                    onClick={handleCloseClick}
                    className="h-6 border-indigo-900 bg-indigo-900 px-2 text-xs font-semibold text-white hover:bg-indigo-950"
                  >
                    🔒 {t("Close")}
                  </ActionButton>
                ) : (
                  <ActionButton
                    onClick={handleCloseClick}
                    className="h-6 border-indigo-900 bg-indigo-900 px-2 text-xs font-semibold text-white hover:bg-indigo-950"
                  >
                    🔒 {t("Close")}
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const areTableCardPropsEqual = (prevProps, nextProps) => {
  const isEqual =
    prevProps.table === nextProps.table &&
    prevProps.tableLabelText === nextProps.tableLabelText &&
    prevProps.showAreas === nextProps.showAreas &&
    prevProps.formatAreaLabel === nextProps.formatAreaLabel &&
    prevProps.t === nextProps.t &&
    prevProps.formatCurrency === nextProps.formatCurrency &&
    prevProps.handleTableClick === nextProps.handleTableClick &&
    prevProps.handlePrintOrder === nextProps.handlePrintOrder &&
    prevProps.handleGuestsChange === nextProps.handleGuestsChange &&
    prevProps.handleCloseTable === nextProps.handleCloseTable &&
    prevProps.handleDeleteReservation === nextProps.handleDeleteReservation &&
    prevProps.handleCheckinReservation === nextProps.handleCheckinReservation &&
    prevProps.getTablePrepMeta === nextProps.getTablePrepMeta &&
    prevProps.waiterCallsByTable === nextProps.waiterCallsByTable &&
    prevProps.handleAcknowledgeWaiterCall === nextProps.handleAcknowledgeWaiterCall &&
    prevProps.handleResolveWaiterCall === nextProps.handleResolveWaiterCall;

  if (!isEqual) {
    logMemoDiff({
      component: "TableCard",
      key: nextProps?.table?.tableNumber,
      prevProps,
      nextProps,
      watchedProps: [
        "table",
        "tableLabelText",
        "showAreas",
        "formatAreaLabel",
        "t",
        "formatCurrency",
        "handleTableClick",
        "handlePrintOrder",
        "handleGuestsChange",
        "handleCloseTable",
        "handleDeleteReservation",
        "handleCheckinReservation",
        "getTablePrepMeta",
        "waiterCallsByTable",
        "handleAcknowledgeWaiterCall",
        "handleResolveWaiterCall",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TableCard, areTableCardPropsEqual);
