import React from "react";
import { isReservationDueNow, normalizeOrderStatus } from "./tableVisuals";
import ElapsedTimer from "./components/ElapsedTimer";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
} from "./dev/perfDebug";

const KITCHEN_STATUSES = ["new", "preparing", "ready", "delivered"];

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
  const hasOrderItems = tableItems.length > 0;
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
        handleCloseTable(tableOrder);
      }
    },
    [handleCloseTable, tableOrder]
  );

  const handleAcknowledgeClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleAcknowledgeWaiterCall?.(table.tableNumber);
    },
    [handleAcknowledgeWaiterCall, table.tableNumber]
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
  const cardToneClass = isFreeTable
    ? "bg-blue-100 border-sky-300 shadow-sky-500/15"
    : hasUnpaidItems
    ? "bg-red-200 border-red-500 shadow-red-500/25"
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
    const canUseFallbackReservation = !tableOrder || hasExplicitReservationState;

    if (
      tableOrder?.reservation &&
      (tableOrder.reservation.reservation_date ||
        tableOrder.reservation.reservationDate ||
        tableOrder.reservation.reservation_time ||
        tableOrder.reservation.reservationTime ||
        Number(tableOrder.reservation.reservation_clients ?? tableOrder.reservation.reservationClients ?? 0) > 0 ||
        tableOrder.reservation.reservation_notes ||
        tableOrder.reservation.customer_name ||
        tableOrder.reservation.customerName ||
        tableOrder.reservation.customer_phone ||
        tableOrder.reservation.customerPhone)
    ) {
      return {
        id: tableOrder.reservation.id ?? null,
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
      tableOrder?.reservation_date ||
      tableOrder?.reservationDate ||
      tableOrder?.reservation_time ||
      tableOrder?.reservationTime ||
      Number(tableOrder?.reservation_clients ?? tableOrder?.reservationClients ?? 0) > 0 ||
      tableOrder?.reservation_notes ||
      tableOrder?.reservationNotes ||
      tableOrder?.customer_name ||
      tableOrder?.customerName ||
      tableOrder?.customer_phone ||
      tableOrder?.customerPhone
    ) {
      return {
        id: tableOrder.reservation_id ?? tableOrder.reservationId ?? null,
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
      (fallback.reservation_date ||
        fallback.reservationDate ||
        fallback.reservation_time ||
        fallback.reservationTime ||
        Number(fallback.reservation_clients ?? fallback.reservationClients ?? 0) > 0 ||
        fallback.reservation_notes ||
        fallback.reservationNotes ||
        fallback.customer_name ||
        fallback.customerName ||
        fallback.customer_phone ||
        fallback.customerPhone)
    ) {
      return {
        id: fallback.id ?? null,
        reservation_date: fallback.reservation_date ?? fallback.reservationDate ?? null,
        reservation_time: fallback.reservation_time ?? fallback.reservationTime ?? null,
        reservation_clients: fallback.reservation_clients ?? fallback.reservationClients ?? 0,
        reservation_notes: fallback.reservation_notes ?? fallback.reservationNotes ?? "",
        customer_name: fallback.customer_name ?? fallback.customerName ?? "",
        customer_phone: fallback.customer_phone ?? fallback.customerPhone ?? "",
      };
    }
    return null;
  }, [hasExplicitReservationState, table.reservationFallback, tableOrder]);
  const [reservationClockMs, setReservationClockMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!reservationInfo) return undefined;
    const intervalId = window.setInterval(() => {
      setReservationClockMs(Date.now());
    }, 15000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    reservationInfo?.id,
    reservationInfo?.reservation_date,
    reservationInfo?.reservation_time,
  ]);
  const shouldShowReservedBadge = React.useMemo(() => {
    const dueNowFromInfo = reservationInfo
      ? isReservationDueNow(reservationInfo, reservationClockMs)
      : false;
    const dueNowFromOrder =
      normalizedOrderStatus === "reserved" && hasReservationSignalOnOrder;

    if (reservationInfo) {
      // Keep reservation badge off for active unpaid normal orders.
      return dueNowFromInfo && (hasExplicitReservationState || isPaidTable || isFreeTable);
    }
    return dueNowFromOrder;
  }, [
    hasExplicitReservationState,
    hasReservationSignalOnOrder,
    isFreeTable,
    isPaidTable,
    normalizedOrderStatus,
    reservationClockMs,
    reservationInfo,
  ]);
  const handleDeleteReservationClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleDeleteReservation?.(table, reservationInfo);
    },
    [handleDeleteReservation, reservationInfo, table]
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
    const fallbackGuestsRaw = reservationInfo?.reservation_clients;
    const fallbackGuestsNum =
      fallbackGuestsRaw === null || fallbackGuestsRaw === undefined || fallbackGuestsRaw === ""
        ? null
        : Number(fallbackGuestsRaw);

    // Prefer TableOverview-configured guests only when it is a positive value.
    // If it's 0/empty, show guests chosen from QR reservation/order payload.
    const effectiveGuests = Number.isFinite(tableGuestsNum) && tableGuestsNum > 0
      ? tableGuestsNum
      : Number.isFinite(fallbackGuestsNum) && fallbackGuestsNum > 0
      ? fallbackGuestsNum
      : null;

    const clamped = Number.isFinite(effectiveGuests)
      ? Math.min(Math.max(0, Math.trunc(effectiveGuests)), seatsValue)
      : null;

    return { seats: seatsValue, guestOptions: options, clampedGuests: clamped };
  }, [reservationInfo, table.guests, table.seats]);

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

  const isFreeDisplay =
    !tableOrder ||
    (normalizedOrderStatus === "draft" && tableItems.length === 0) ||
    (normalizedOrderStatus === "confirmed" && tableItems.length === 0 && Number(tableOrder.total || 0) <= 0);

  const shouldShowConfirmedTimer = normalizedOrderStatus === "confirmed" && hasOrderItems;
  const shouldRenderKitchenStatuses = Boolean(tableOrder?.items);
  const isOrderDelayed = tablePrepMeta.isDelayed;
  const displayTotal = formatCurrency(Number(table.unpaidTotal || 0));
  const paidStatusLabel = t("Unpaid");
  const orderStatusLabel = t(tableOrder?.status === "draft" ? "Free" : tableOrder?.status);
  const showOrderStatusBadge = !shouldShowReservedBadge;

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
          {isCallingWaiter && (
            <span className="shrink-0 rounded-full bg-red-600 text-white px-3 py-1 text-[11px] sm:text-xs font-extrabold tracking-wide shadow-md animate-pulse">
              🔴 CALLING
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
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-2xl text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-extrabold text-blue-700">🎫 {t("Reserved")}</div>
                <button
                  type="button"
                  onClick={handleDeleteReservationClick}
                  className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-100"
                >
                  {t("Delete")}
                </button>
              </div>
              {reservationInfo ? (
                <div className="flex gap-2 text-[10px] text-slate-700 min-w-0">
                  <div className="flex flex-col">
                    <span className="font-semibold whitespace-nowrap">
                      🕐 {reservationInfo.reservation_time || "—"}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      👥 {reservationInfo.reservation_clients || 0} {t("guests")}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold whitespace-nowrap">📅 {reservationInfo.reservation_date || "—"}</span>
                    {(reservationInfo.customer_name || reservationInfo.customer_phone) && (
                      <div className="mt-0.5 space-y-0.5 text-[9px] text-slate-700">
                        {reservationInfo.customer_name && (
                          <p className="line-clamp-1">👤 {reservationInfo.customer_name}</p>
                        )}
                        {reservationInfo.customer_phone && (
                          reservationPhoneHref ? (
                            <a
                              href={reservationPhoneHref}
                              onClick={handlePhoneLinkClick}
                              className="line-clamp-1 font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-800"
                            >
                              📞 {reservationInfo.customer_phone}
                            </a>
                          ) : (
                            <p className="line-clamp-1">📞 {reservationInfo.customer_phone}</p>
                          )
                        )}
                      </div>
                    )}
                    {reservationInfo.reservation_notes && (
                      <p className="text-[9px] line-clamp-1 text-slate-600">📝 {reservationInfo.reservation_notes}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-700">{t("This table has an active reservation")}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-end justify-between mt-3 sm:mt-4">
          {isOrderDelayed && <span className="text-amber-600 font-extrabold animate-pulse">⚠️</span>}

          <div className="flex flex-col items-end gap-2 ml-auto">
            {isCallingWaiter && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleAcknowledgeClick}
                  className="px-3 py-1.5 bg-red-600 text-white font-extrabold rounded-full shadow text-xs whitespace-nowrap hover:bg-red-700 active:scale-[0.99] transition"
                >
                  {t("Acknowledge")}
                </button>
                <button
                  type="button"
                  onClick={handleResolvedClick}
                  className="px-3 py-1.5 bg-emerald-600 text-white font-extrabold rounded-full shadow text-xs whitespace-nowrap hover:bg-emerald-700 active:scale-[0.99] transition"
                >
                  {t("Resolved")}
                </button>
              </div>
            )}
            {hasOrderItems && (
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
