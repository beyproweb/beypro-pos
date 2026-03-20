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

const CARD_RADIUS_CLASS = "rounded-xl";
const BADGE_BASE_CLASS =
  "inline-flex h-6 items-center justify-center rounded-md border px-2.5 text-xs font-semibold leading-none whitespace-nowrap";
const PANEL_BASE_CLASS =
  "rounded-lg border bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]";
const ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium leading-none shadow-sm transition duration-150 hover:brightness-95 active:scale-[0.99]";

const cx = (...classes) => classes.filter(Boolean).join(" ");

const getKitchenStatusToneClass = (status) => {
  if (status === "new") return "bg-blue-600 text-white border-blue-700";
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
  handleGuestsChange,
  handleCloseTable,
  handleCheckinReservation,
  handleOpenViewBooking,
  getTablePrepMeta,
  waiterCallsByTable,
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
    hasOrderItems ||
    hasSuborderItems ||
    hasReceiptHistory ||
    Number(tableOrder?.total || 0) > 0 ||
    normalizeOrderStatus(tableOrder?.payment_status ?? tableOrder?.paymentStatus) === "paid" ||
    Boolean(table.isFullyPaid);
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
  const normalizedPaymentStatus = normalizeOrderStatus(
    tableOrder?.payment_status ?? tableOrder?.paymentStatus
  );
  const isPaidTable =
    !isFreeTable &&
    (Boolean(table.isFullyPaid) ||
      normalizedOrderStatus === "paid" ||
      normalizedPaymentStatus === "paid" ||
      Boolean(tableOrder?.is_paid) ||
      Boolean(tableOrder?.isPaid));
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
        status:
          tableOrder.reservation.status ??
          tableOrder.reservation.reservation_status ??
          tableOrder.reservation.reservationStatus ??
          table?.reservationFallback?.status ??
          null,
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
        status:
          tableOrder.reservation_status ??
          tableOrder.reservationStatus ??
          table?.reservationFallback?.status ??
          null,
        order_type: tableOrder.order_type ?? null,
        reservation_date: tableOrder.reservation_date ?? tableOrder.reservationDate ?? null,
        reservation_time: tableOrder.reservation_time ?? tableOrder.reservationTime ?? null,
        reservation_clients: tableOrder.reservation_clients ?? tableOrder.reservationClients ?? 0,
        reservation_notes: tableOrder.reservation_notes ?? tableOrder.reservationNotes ?? "",
        customer_name: tableOrder.customer_name ?? tableOrder.customerName ?? "",
        customer_phone: tableOrder.customer_phone ?? tableOrder.customerPhone ?? "",
      };
    }
    const fallback = table?.reservationFallback ?? null;
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
  }, [hasReservationCoreData, table?.reservationFallback, tableOrder]);
  const reservationStatus = React.useMemo(() => {
    const normalizedOrderLevelStatus = normalizeOrderStatus(tableOrder?.status);
    const normalizedReservationStatus = normalizeOrderStatus(
      reservationInfo?.status ??
        table?.reservationFallback?.status ??
        (normalizedOrderLevelStatus === "checked_in" ? tableOrder?.status : null)
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
  const reservationStatusForCheckinFlow = normalizeOrderStatus(
    tableOrder?.reservation?.status ??
      tableOrder?.reservation?.reservation_status ??
      tableOrder?.reservation?.reservationStatus ??
      tableOrder?.reservation_status ??
      tableOrder?.reservationStatus ??
      table?.reservationFallback?.status ??
      reservationInfo?.status
  );
  const shouldShowReservedBadge = React.useMemo(() => {
    if (reservationInfo) {
      return true;
    }
    if (reservationStatusForCheckinFlow === "reserved" || reservationStatusForCheckinFlow === "checked_in") {
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
    reservationStatusForCheckinFlow,
  ]);
  const handleOpenViewBookingClick = React.useCallback((e) => {
    e.stopPropagation();
    handleOpenViewBooking?.();
  }, [handleOpenViewBooking]);
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
  const reservationActionLifecycleStatus = normalizeOrderStatus(
    tableOrder?.reservation?.reservation_status ??
      tableOrder?.reservation?.reservationStatus ??
      tableOrder?.reservation?.status ??
      tableOrder?.reservation_status ??
      tableOrder?.reservationStatus ??
      reservationInfo?.status ??
      table?.reservationFallback?.reservation_status ??
      table?.reservationFallback?.reservationStatus ??
      table?.reservationFallback?.status
  );
  const needsReservationConfirmation =
    reservationActionLifecycleStatus !== "confirmed" &&
    reservationActionLifecycleStatus !== "checked_in" &&
    reservationActionLifecycleStatus !== "checked_out";
  const shouldDisableReservationCheckin =
    !needsReservationConfirmation &&
    !isCheckedInReservation &&
    !isCheckedOutReservation &&
    hasOrderActivity;
  const reservationPrimaryActionLabel = needsReservationConfirmation
    ? t("Confirm")
    : t("Checkin");
  const handleReservationPrimaryActionClick = React.useCallback(
    (e) => {
      if (needsReservationConfirmation) {
        handleOpenViewBookingClick(e);
        return;
      }
      e.stopPropagation();
      handleCheckinReservation?.(table, reservationInfo);
    },
    [
      handleCheckinReservation,
      handleOpenViewBookingClick,
      needsReservationConfirmation,
      reservationInfo,
      table,
    ]
  );

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
            {count} {t(status === "new" ? "New" : status)}
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
  const shouldShowKitchenStatusSlot = !isFreeDisplay && shouldRenderKitchenStatuses;
  const isOrderDelayed = tablePrepMeta.isDelayed;
  const displayTotal = formatCurrency(Number(table.unpaidTotal || 0));
  const tableDisplayLabel = `${tableLabelText} ${String(table.tableNumber).padStart(2, "0")}`;
  const shouldLeftAlignHeaderLabel = true;
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
    ? cx(PANEL_BASE_CLASS, "border-slate-200 bg-slate-50/80")
    : isCheckedInReservation
      ? cx(PANEL_BASE_CLASS, "border-emerald-200 bg-emerald-50/70")
      : cx(PANEL_BASE_CLASS, "border-sky-200 bg-sky-50/70");
  const reservationCompactStateLabel = isCheckedOutReservation
    ? t("Checked out")
    : `${t("Reserved")}!`;
  const reservationCustomerName = String(
    reservationInfo?.customer_name ?? reservationInfo?.customerName ?? ""
  ).trim();
  const reservationCustomerPhone = String(
    reservationInfo?.customer_phone ?? reservationInfo?.customerPhone ?? ""
  ).trim();
  const reservationCustomerPhoneHref = React.useMemo(
    () => getPhoneHref(reservationCustomerPhone),
    [reservationCustomerPhone]
  );
  const reservationControlClass =
    "flex h-7 min-h-7 w-full min-w-0 max-w-full items-center justify-center overflow-hidden rounded-lg border px-2 text-center text-xs font-medium leading-none text-ellipsis whitespace-nowrap sm:h-8 sm:min-h-8 sm:w-[120px] sm:min-w-[120px] sm:px-3 sm:text-sm";
  const reservationDetailsFrameClass =
    "order-1 flex min-h-[58px] w-full min-w-0 max-w-full flex-col justify-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 text-left shadow-none sm:order-none sm:row-span-2 sm:h-[68px] sm:min-h-[68px] sm:w-[120px] sm:min-w-[120px]";
  const reservationCompactBadgeToneClass = isCheckedOutReservation
    ? cx(reservationControlClass, "border-slate-700 bg-slate-700 text-white")
    : cx(reservationControlClass, "border-amber-300 bg-amber-500 tracking-wide text-white");
  const reservationPrimaryActionClass = cx(
    reservationControlClass,
    "bg-blue-600 text-white hover:bg-blue-700"
  );

  return (
    <div
      key={table.tableNumber}
      onClick={handleCardClick}
      className={cx(
        "group relative flex h-[264px] w-full max-w-[380px] self-start cursor-pointer flex-col justify-between overflow-hidden border-2 shadow-sm transition-all duration-150 hover:shadow-md",
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

        <div
          className={
            shouldLeftAlignHeaderLabel
              ? "flex items-center justify-between gap-2"
              : "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2"
          }
        >
          <div className="flex min-w-0 flex-1 items-center">
            {shouldLeftAlignHeaderLabel ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 text-sm font-semibold tracking-tight text-slate-700 sm:text-[17px]">
                  {tableDisplayLabel}
                </span>
              </div>
            ) : isFreeDisplay ? (
              <Pill className="border-slate-400 bg-slate-100 text-slate-700 shadow-none">
                {t("Free")}
              </Pill>
            ) : null}
          </div>

          <div className="min-w-0 self-center text-center">
            {!shouldLeftAlignHeaderLabel && (
              <span className="block truncate text-sm font-bold tracking-tight text-slate-800 sm:text-[15px]">
                {tableDisplayLabel}
              </span>
            )}
          </div>

          <div className="flex min-w-0 shrink-0 justify-end">
            <div className="flex shrink-0 items-center gap-2">
              <div className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-300/80 bg-white/75 px-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] backdrop-blur-sm">
                <div className="text-[13px] font-semibold leading-none tracking-tight text-slate-700">
                  {displayTotal}
                </div>
              </div>
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

        <div className="mt-2 flex min-h-6 items-center gap-2">
          <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
            {shouldShowKitchenStatusSlot ? (
              <div className="flex min-w-[64px] items-center gap-1 overflow-hidden">
                {compactKitchenStatusBadges.length > 0 ? (
                  compactKitchenStatusBadges
                ) : (
                  <span className="invisible inline-flex h-4 items-center px-2 text-[9px] font-semibold">
                    1 New
                  </span>
                )}
              </div>
            ) : null}
            {!isFreeDisplay && !shouldShowReservedBadge && showOrderStatusBadge ? (
              <span className={tableStatusClassName}>{orderStatusLabel}</span>
            ) : null}
          </div>
        </div>

        <div
          className={cx(
            "relative flex min-h-0 flex-1 flex-col",
            shouldShowReservedBadge ? "mt-2 gap-1" : isFreeDisplay ? "mt-0 gap-1" : "mt-2 gap-2"
          )}
        >
          {isFreeDisplay && !shouldShowReservedBadge ? <div className="min-h-0 flex-1" /> : null}

          {shouldShowReservedBadge && (
            <div
              className={cx(
                reservationPanelClassName,
                "grid w-full max-w-full grid-cols-1 justify-items-start gap-2 overflow-hidden sm:grid-cols-[120px_120px] sm:grid-rows-[32px_32px] sm:items-start sm:justify-start sm:gap-x-3 sm:gap-y-1"
              )}
            >
              <div className={reservationDetailsFrameClass}>
                {reservationCustomerName ? (
                  <div className="truncate text-[13px] font-semibold leading-none text-slate-800">
                    {reservationCustomerName}
                  </div>
                ) : null}
                {reservationCustomerPhone ? (
                  reservationCustomerPhoneHref ? (
                    <a
                      href={reservationCustomerPhoneHref}
                      onClick={stopPropagation}
                      className="truncate -mt-1 text-[12px] font-medium leading-none text-slate-700 underline underline-offset-2 hover:text-slate-900"
                    >
                      {reservationCustomerPhone}
                    </a>
                  ) : (
                    <div className="truncate -mt-1 text-[12px] font-medium leading-none text-slate-700">
                      {reservationCustomerPhone}
                    </div>
                  )
                ) : null}
              </div>
              <div className="order-2 grid w-full min-w-0 grid-cols-2 gap-2 sm:contents">
                <span className={reservationCompactBadgeToneClass}>
                  {reservationCompactStateLabel}
                </span>
                {!isCheckedOutReservation && (
                  <button
                    type="button"
                    disabled={shouldDisableReservationCheckin}
                    onClick={
                      isCheckedInReservation
                        ? handleCheckoutReservationClick
                        : handleReservationPrimaryActionClick
                    }
                    className={cx(
                      reservationPrimaryActionClass,
                      "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-blue-600"
                    )}
                  >
                    {isCheckedInReservation ? t("Check Out") : reservationPrimaryActionLabel}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {!isFreeDisplay &&
        !shouldShowReservedBadge &&
        (shouldShowConfirmedTimer || showReadyAt) ? (
          <div className="mt-2 flex min-h-6 items-center justify-end gap-2">
            {shouldShowConfirmedTimer ? (
              <Pill className="border-indigo-900 bg-indigo-900 px-2 font-mono text-white">
                <ElapsedTimer startTime={confirmedStartTime} />
              </Pill>
            ) : null}
            {showReadyAt ? (
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
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
          {showAreas ? (
            <Pill className="h-6 max-w-[55%] justify-start truncate border-slate-300 bg-slate-100 px-2 text-xs font-semibold text-slate-700 shadow-none">
              {formatAreaLabel(table.area)}
            </Pill>
          ) : (
            <span />
          )}

          <div className="ml-auto flex items-center justify-end gap-2 flex-nowrap">
            {isFreeDisplay && !shouldShowReservedBadge && (
              <Pill className="border-slate-400 bg-slate-100 text-slate-700 shadow-none">
                {t("Free")}
              </Pill>
            )}

            {isCallingWaiter && (
              <div className="flex items-center justify-end gap-2 flex-nowrap">
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
              <div className="flex items-center justify-end gap-2 flex-nowrap">
                {hasUnpaidItems ? (
                  <Pill className="border-red-700 bg-red-600 text-white shadow-none">
                    {paidStatusLabel}
                  </Pill>
                ) : isPaidTable ? (
                  <div className="flex items-center gap-2 flex-nowrap">
                    <Pill className="h-6 border-emerald-700 bg-emerald-700 text-white shadow-none">
                      {fullyPaidStatusLabel}
                    </Pill>
                    <button
                      type="button"
                      onClick={handleCloseClick}
                      className={cx(
                        BADGE_BASE_CLASS,
                        "border-indigo-900 bg-indigo-900 text-white shadow-none transition duration-150 hover:bg-indigo-950 active:scale-[0.99]"
                      )}
                    >
                      {t("Close")}
                    </button>
                  </div>
                ) : (
                  <ActionButton
                    onClick={handleCloseClick}
                    className="h-6 border-indigo-900 bg-indigo-900 px-2 text-xs font-semibold text-white hover:bg-indigo-950"
                  >
                    {t("Close")}
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
    prevProps.handleGuestsChange === nextProps.handleGuestsChange &&
    prevProps.handleCloseTable === nextProps.handleCloseTable &&
    prevProps.handleCheckinReservation === nextProps.handleCheckinReservation &&
    prevProps.handleOpenViewBooking === nextProps.handleOpenViewBooking &&
    prevProps.getTablePrepMeta === nextProps.getTablePrepMeta &&
    prevProps.waiterCallsByTable === nextProps.waiterCallsByTable &&
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
        "handleGuestsChange",
        "handleCloseTable",
        "handleCheckinReservation",
        "handleOpenViewBooking",
        "getTablePrepMeta",
        "waiterCallsByTable",
        "handleResolveWaiterCall",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TableCard, areTableCardPropsEqual);
