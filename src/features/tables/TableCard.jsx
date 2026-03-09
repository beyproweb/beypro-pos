import React from "react";
import {
  isCheckedInReservationStatus,
  isCheckedOutReservationStatus,
  normalizeOrderStatus,
} from "./tableVisuals";
import ElapsedTimer from "./components/ElapsedTimer";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
} from "./dev/perfDebug";

const KITCHEN_STATUSES = ["new", "preparing", "ready", "delivered"];
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

const getKitchenStatusToneClass = (status) => {
  if (status === "preparing") return "bg-yellow-100 text-yellow-900 border-yellow-200";
  if (status === "ready") return "bg-blue-600 text-white border-blue-700";
  if (status === "delivered") return "bg-green-600 text-white border-green-700";
  return "bg-slate-400 text-white border-slate-500";
};

const getPhoneHref = (phone) => {
  const value = String(phone ?? "").trim();
  if (!value) return null;
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : null;
};

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

  const handlePrintClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      if (tableOrder?.id != null) {
        handlePrintOrder(tableOrder.id);
      }
    },
    [handlePrintOrder, tableOrder]
  );

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
  const shouldUseReservedTone = isReservedTable && normalizedOrderStatus === "reserved";
  const cardToneClass = isFreeTable
    ? "bg-blue-100 border-sky-300 shadow-sky-500/15"
    : hasUnpaidItems
    ? "bg-red-200 border-red-500 shadow-red-500/25"
    : shouldUseReservedTone
    ? "bg-indigo-100 border-indigo-500 shadow-indigo-500/20"
    : isPaidTable
    ? "bg-green-100 border-green-300 shadow-green-500/15"
    : "bg-indigo-100 border-indigo-500 shadow-indigo-500/20";
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

    if (
      tableOrder?.reservation &&
      hasReservationCoreData(tableOrder.reservation)
    ) {
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
    if (
      hasReservationCoreData(tableOrder)
    ) {
      return {
        id: tableOrder.reservation_id ?? tableOrder.reservationId ?? null,
        order_id: tableOrder.id ?? null,
        orderId: tableOrder.id ?? null,
        status: tableOrder.status ?? null,
        order_type: tableOrder.order_type ?? null,
        reservation_date: tableOrder.reservation_date ?? tableOrder.reservationDate ?? null,
        reservation_time: tableOrder.reservation_time ?? tableOrder.reservationTime ?? null,
        reservation_clients:
          tableOrder.reservation_clients ?? tableOrder.reservationClients ?? 0,
        reservation_notes: tableOrder.reservation_notes ?? tableOrder.reservationNotes ?? "",
        customer_name: tableOrder.customer_name ?? tableOrder.customerName ?? "",
        customer_phone: tableOrder.customer_phone ?? tableOrder.customerPhone ?? "",
      };
    }
    const fallback = canUseFallbackReservation ? table.reservationFallback : null;
    if (
      fallback &&
      hasReservationCoreData(fallback)
    ) {
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
      const reservationOrderId = Number(
        reservationInfo?.order_id ??
          reservationInfo?.orderId
      );
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

  const kitchenStatusBadges = React.useMemo(
    () =>
      KITCHEN_STATUSES.reduce((badges, status) => {
        const count = kitchenStatusCounts[status];
        if (!count) return badges;
        badges.push(
          <span
            key={status}
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold border shadow-sm whitespace-nowrap ${getKitchenStatusToneClass(
              status
            )}`}
          >
            {count} {t(status)}
          </span>
        );
        return badges;
      }, []),
    [kitchenStatusCounts, t]
  );

  const tableStatusClassName = React.useMemo(
    () =>
      `inline-flex items-center px-3 py-1 rounded-full text-sm font-extrabold shadow-sm whitespace-nowrap ${table.tableColor}`,
    [table.tableColor]
  );

  const hasPendingReservationActiveStatus =
    Boolean(reservationInfo) &&
    !isCheckedInReservation &&
    normalizedOrderStatus !== "reserved" &&
    normalizedOrderStatus !== "";
  const isFreeDisplay =
    !hasPendingReservationActiveStatus &&
    (!tableOrder ||
      (normalizedOrderStatus === "draft" && tableItems.length === 0) ||
      (normalizedOrderStatus === "confirmed" &&
        tableItems.length === 0 &&
        Number(tableOrder.total || 0) <= 0));

  const shouldShowConfirmedTimer = normalizedOrderStatus === "confirmed" && hasOrderItems;
  const shouldRenderKitchenStatuses = Boolean(tableOrder?.items);
  const isOrderDelayed = tablePrepMeta.isDelayed;
  const displayTotal = formatCurrency(Number(table.unpaidTotal || 0));
  const paidStatusLabel = t("Unpaid");
  const orderStatusLabel = isCheckedInReservationStatus(normalizedOrderStatus)
    ? t("Guest checked in")
    : t(tableOrder?.status === "draft" ? "Free" : tableOrder?.status);
  const showOrderStatusBadge = !shouldShowReservedBadge || hasPendingReservationActiveStatus;
  const reservationPanelClassName = isCheckedOutReservation
    ? "mt-1.5 rounded-xl border border-slate-300 bg-slate-50 shadow-sm px-2.5 py-2"
    : isCheckedInReservation
    ? "mt-1.5 rounded-xl border border-emerald-200 bg-white/90 shadow-sm px-2.5 py-2"
    : "mt-1.5 rounded-xl border border-sky-200 bg-white/90 shadow-sm px-2.5 py-2";
  const reservationTitleClassName = isCheckedOutReservation
    ? "text-[13px] sm:text-[14px] font-extrabold text-slate-700 tracking-tight"
    : isCheckedInReservation
    ? "text-[13px] sm:text-[14px] font-extrabold text-emerald-700 tracking-tight"
    : "text-[13px] sm:text-[14px] font-extrabold text-sky-700 tracking-tight";
  const reservationStateLabel = isCheckedOutReservation
    ? t("Guest checked out")
    : isCheckedInReservation
    ? t("Guest checked in")
    : t("Reserved");
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
      className={`
              group relative cursor-pointer
              rounded-3xl
              border-2
              ${cardToneClass}
              shadow-xl
              hover:shadow-2xl
              transition-all duration-200
              flex flex-col justify-between
              w-full
              max-w-[380px]
              min-h-[220px]
              overflow-hidden
              ${isCallingWaiter ? "ring-2 ring-red-500/70 animate-[pulse_2.4s_ease-in-out_infinite]" : ""}
            `}
    >
      {isCallingWaiter && (
        <div className="pointer-events-none absolute inset-0 bg-red-500/10 animate-pulse" />
      )}
      <div className="p-3 sm:p-5 flex flex-col h-full">
        {showRenderCounter && (
          <div className="mb-1 flex justify-end">
            <RenderCounter label={`Card ${table.tableNumber}`} value={renderCount} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-800 text-base sm:text-lg font-extrabold">{tableLabelText}</span>
            <span className="text-base sm:text-lg font-extrabold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-2 py-0.5">
              {String(table.tableNumber).padStart(2, "0")}
            </span>
            {hasOrderItems && (
              <button
                type="button"
                onClick={handlePrintClick}
                className="text-base sm:text-lg font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-2 py-0.5 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                🖨️
              </button>
            )}
          </div>

          {shouldShowConfirmedTimer && (
            <span className="shrink-0 bg-blue-600 text-white rounded-full px-3 py-1 font-mono text-[11px] sm:text-sm shadow-md">
              ⏱ <ElapsedTimer startTime={confirmedStartTime} />
            </span>
          )}
        </div>

        {table.label && (
          <div className="text-[11px] sm:text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded-full px-2 py-0.5 mb-1 w-fit max-w-full truncate">
            {table.label}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {showAreas && (
            <div className="text-[11px] bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 text-slate-600 max-w-full truncate">
              📍 {formatAreaLabel(table.area)}
            </div>
          )}

          {table.seats && (
            <div className="inline-flex items-center text-sm bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 text-indigo-700 whitespace-nowrap font-semibold">
              {table.seats} {t("Seats")}
            </div>
          )}

          {table.seats && (
            <div
              className="inline-flex items-center text-sm bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 text-emerald-800 whitespace-nowrap gap-2 font-semibold"
              onClick={stopPropagation}
            >
              <span>👥</span>
              <select
                className="bg-transparent outline-none font-bold pr-1"
                value={Number.isFinite(clampedGuests) ? String(clampedGuests) : ""}
                onChange={handleGuestsSelectChange}
                onClick={stopPropagation}
              >
                <option value="">—</option>
                {guestOptionElements}
              </select>
              <span className="text-emerald-700/70">/{seats}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-grow">
          {isFreeDisplay ? (
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-900 border border-green-200 font-extrabold text-sm shadow-sm whitespace-nowrap">
                {t("Free")}
              </span>
              <span className="text-[15px] sm:text-lg font-extrabold text-indigo-700 whitespace-nowrap">
                {displayTotal}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 min-w-0">
                {showOrderStatusBadge ? (
                  <span className={tableStatusClassName}>{orderStatusLabel}</span>
                ) : (
                  <span />
                )}
                <div className="flex flex-col items-end min-w-0">
                  <span className="text-[15px] sm:text-lg font-extrabold text-indigo-700 whitespace-nowrap">
                    {displayTotal}
                  </span>
                  {showReadyAt && (
                    <span className="mt-1 inline-flex max-w-full items-center text-[11px] sm:text-xs font-extrabold bg-yellow-100 text-yellow-900 border border-yellow-200 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                      {t("Ready at")} {readyAtLabel}
                    </span>
                  )}
                </div>
              </div>

              {shouldRenderKitchenStatuses && <div className="flex flex-wrap gap-1.5 mt-1">{kitchenStatusBadges}</div>}
            </>
          )}

          {shouldShowReservedBadge && (
            <div className={reservationPanelClassName}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className={reservationTitleClassName}>{reservationStateLabel}</div>
                  <div className="text-[10px] text-slate-500 font-medium truncate">
                    {isCheckedOutReservation
                      ? t("Checkout completed")
                      : isCheckedInReservation
                      ? t("Ready for ordering")
                      : t("Awaiting check-in")}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isCheckedInReservation && !isCheckedOutReservation && (
                    <button
                      type="button"
                      onClick={handleCheckinReservationClick}
                      className="h-7 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      {t("Checkin")}
                    </button>
                  )}
                  {showCheckoutReservationButton && (
                    <button
                      type="button"
                      onClick={handleCheckoutReservationClick}
                      className="h-7 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                    >
                      {t("Check Out")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDeleteReservationClick}
                    className="h-7 rounded-full border border-rose-300 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                  >
                    {t("Delete")}
                  </button>
                </div>
              </div>
              {reservationInfo ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {reservationInfo.reservation_time || "—"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {reservationInfo.reservation_date || "—"}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {reservationInfo.reservation_clients || 0} {t("guests")}
                    </span>
                  </div>

                  {(reservationInfo.customer_name || reservationInfo.customer_phone) && (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-700">
                      {reservationInfo.customer_name && (
                        <span className="truncate font-semibold">{reservationInfo.customer_name}</span>
                      )}
                      {reservationInfo.customer_phone && (
                        reservationPhoneHref ? (
                          <a
                            href={reservationPhoneHref}
                            onClick={handlePhoneLinkClick}
                            className="truncate font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                          >
                            {reservationInfo.customer_phone}
                          </a>
                        ) : (
                          <span className="truncate font-semibold">{reservationInfo.customer_phone}</span>
                        )
                      )}
                    </div>
                  )}

                  {reservationInfo.reservation_notes && (
                    <p className="text-[11px] text-slate-600 line-clamp-1">
                      {reservationInfo.reservation_notes}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[11px] font-medium text-slate-600">
                  {t("This table has an active reservation")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end justify-between mt-3 sm:mt-4">
          {isOrderDelayed && <span className="text-amber-600 font-extrabold animate-pulse">⚠️</span>}

          <div className="flex flex-col items-end gap-2 ml-auto">
            {isCallingWaiter && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="px-3 py-1.5 bg-red-600 text-white font-extrabold rounded-full shadow text-xs whitespace-nowrap animate-pulse">
                  🔴 {t("Calling")}
                </span>
                <button
                  type="button"
                  onClick={handleResolvedClick}
                  className="px-3 py-1.5 bg-emerald-600 text-white font-extrabold rounded-full shadow text-xs whitespace-nowrap hover:bg-emerald-700 active:scale-[0.99] transition"
                >
                  {t("Resolved")}
                </button>
              </div>
            )}
            {hasOrderActivity && (
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-3">
                {hasUnpaidItems ? (
                  <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 font-extrabold rounded-full shadow-sm text-sm whitespace-nowrap">
                    {paidStatusLabel}
                  </span>
                ) : (
                  <button
                    onClick={handleCloseClick}
                    className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-extrabold rounded-full shadow text-sm whitespace-nowrap hover:brightness-110 active:scale-[0.99] transition"
                  >
                    🔒 {t("Close")}
                  </button>
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
