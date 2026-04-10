import React from "react";
import {
  getCanonicalTableOrderStatus,
  hasKitchenLifecycleSignal,
  isCheckedInReservationStatus,
  isCheckedOutReservationStatus,
  normalizeOrderStatus,
} from "./tableVisuals";
import {
  isConcertBookingConfirmed,
  isReservationConfirmedForCheckin,
} from "../../utils/reservationStatus";
import ElapsedTimer from "./components/ElapsedTimer";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
} from "./dev/perfDebug";
import {
  TABLE_DENSITY,
  normalizeTableDensity,
} from "./tableDensity";

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

const CARD_RADIUS_CLASS = "rounded-[28px]";
const BADGE_BASE_CLASS =
  "inline-flex min-h-8 items-center justify-center rounded-2xl border border-transparent px-3.5 py-1.5 text-[11px] font-semibold leading-none whitespace-nowrap shadow-[0_8px_22px_rgba(15,23,42,0.09)] backdrop-blur-sm sm:min-h-7 sm:px-3 sm:py-1 sm:text-xs";
const PANEL_BASE_CLASS =
  "rounded-[24px] border bg-white/92 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-sm";
const ACTION_BUTTON_BASE_CLASS =
  "inline-flex h-10 items-center justify-center rounded-2xl border-0 px-4 text-sm font-semibold leading-none text-white shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition duration-150 hover:brightness-95 active:scale-[0.99] sm:h-9 sm:px-3.5 sm:text-[13px]";

const DENSITY_STATUS_META = {
  empty: { cardClass: "border-slate-500 bg-slate-300/95", label: "Empty" },
  active: { cardClass: "border-amber-500 bg-amber-300/95", label: "Active" },
  paid: { cardClass: "border-emerald-600 bg-emerald-300/95", label: "Paid" },
  unpaid: { cardClass: "border-rose-600 bg-rose-300/95", label: "Unpaid" },
  reserved: { cardClass: "border-sky-600 bg-sky-300/95", label: "Reserved" },
};

const cx = (...classes) => classes.filter(Boolean).join(" ");

const getKitchenStatusToneClass = (status) => {
  if (status === "new") return "border-sky-200 bg-sky-500 text-white";
  if (status === "preparing") return "border-amber-200 bg-amber-500 text-white";
  if (status === "ready") return "border-violet-200 bg-violet-600 text-white";
  if (status === "delivered") return "border-indigo-200 bg-indigo-600 text-white";
  return "border-slate-200 bg-slate-700 text-white";
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
  handleToggleTableLock,
  handleGuestsChange,
  handleCloseTable,
  handleCheckinReservation,
  handleOpenViewBooking,
  getTablePrepMeta,
  waiterCallsByTable,
  handleResolveWaiterCall,
  showManualTableLock,
  showGuestCount = true,
  tableDensity = TABLE_DENSITY.COMFORTABLE,
}) {
  const renderCount = useRenderCount("TableCard", {
    id: table?.tableNumber,
    logEvery: 20,
  });
  const normalizedDensity = normalizeTableDensity(tableDensity);
  const isCompactDensity = normalizedDensity !== TABLE_DENSITY.COMFORTABLE;
  const isLargeCompact = normalizedDensity === TABLE_DENSITY.COMPACT;
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
  const hasKitchenActivity = hasKitchenLifecycleSignal(tableOrder);
  const hasOrderActivity =
    hasOrderItems ||
    hasSuborderItems ||
    hasReceiptHistory ||
    hasKitchenActivity ||
    Number(tableOrder?.total || 0) > 0 ||
    normalizeOrderStatus(tableOrder?.payment_status ?? tableOrder?.paymentStatus) === "paid" ||
    Boolean(table.isFullyPaid);
  const normalizedOrderStatus = getCanonicalTableOrderStatus(
    tableOrder,
    table?.tableStatus ?? ""
  );
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
  const isLockedTable = Boolean(table.isLocked);
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
      ? "border-rose-600 bg-rose-300"
      : isLockedTable && !hasOrderActivity
        ? "border-slate-600 bg-slate-400"
      : normalizedOrderStatus === "confirmed"
        ? "border-rose-600 bg-rose-300"
        : hasReservedVisualTone
          ? "border-sky-600 bg-sky-300"
          : hasCheckedInVisualTone
            ? "border-emerald-600 bg-emerald-300"
            : isPaidTable
              ? "border-emerald-600 bg-emerald-300"
              : "border-slate-500 bg-slate-300";
  const cardAccentGlowClass = hasUnpaidItems
    ? "bg-rose-500/85"
    : isLockedTable && !hasOrderActivity
      ? "bg-white/45"
      : normalizedOrderStatus === "confirmed"
        ? "bg-rose-500/85"
        : hasReservedVisualTone
        ? "bg-sky-500/85"
        : hasCheckedInVisualTone || isPaidTable
          ? "bg-emerald-500/85"
          : "bg-slate-500/85";
  const hasPreparingItems = tableItems.some((i) => i.kitchen_status === "preparing");
  const shouldRenderAccentGlow = !(isLockedTable && !hasOrderActivity);
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
    if (fallbackStatus !== "checked_in" && fallbackStatus !== "confirmed") {
      return normalizedReservationStatus;
    }
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

    if (!(fallbackMatchesCurrentOrder || fallbackMatchesCurrentReservation)) {
      return normalizedReservationStatus;
    }

    if (fallbackStatus === "checked_in") return "checked_in";
    if (fallbackStatus === "confirmed") return "confirmed";
    return normalizedReservationStatus;
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
  const reservationActionLifecycleStatus = reservationStatus;
  const canProceedToReservationCheckin =
    reservationActionLifecycleStatus === "confirmed" ||
    isReservationConfirmedForCheckin(tableOrder, reservationInfo, table?.reservationFallback) ||
    isConcertBookingConfirmed(tableOrder, reservationInfo, table?.reservationFallback);
  const needsReservationConfirmation =
    !canProceedToReservationCheckin &&
    reservationActionLifecycleStatus !== "checked_in" &&
    reservationActionLifecycleStatus !== "checked_out";
  const shouldDisableReservationCheckin =
    !needsReservationConfirmation &&
    !isCheckedInReservation &&
    !isCheckedOutReservation &&
    hasOrderActivity;
  const isConfirmedReservation =
    !needsReservationConfirmation &&
    !isCheckedInReservation &&
    !isCheckedOutReservation;
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
        if (status === "new" && kitchenStatusCounts.preparing > 0) {
          return badges;
        }
        const count = kitchenStatusCounts[status];
        if (!count) return badges;
        badges.push(
          <Pill
            key={`header-${status}`}
            className={cx(
              "min-h-8 shrink-0 rounded-2xl px-2.5 py-1 text-[10px] shadow-[0_8px_20px_rgba(15,23,42,0.08)] sm:min-h-9 sm:px-3 sm:py-1.5 sm:text-[13px]",
              getKitchenStatusToneClass(status)
            )}
          >
            {count} {t(status === "new" ? "New" : status)}
          </Pill>
        );
        return badges;
      }, []),
    [kitchenStatusCounts, t]
  );

  const tableStatusToneClass = React.useMemo(() => {
    if (normalizedOrderStatus === "confirmed") return "border-rose-200 bg-rose-600 text-white";
    if (normalizedOrderStatus === "reserved") return "border-amber-200 bg-amber-500 text-white";
    if (normalizedOrderStatus === "checked_in") return "border-emerald-200 bg-emerald-600 text-white";
    if (normalizedOrderStatus === "paid") return "border-emerald-200 bg-emerald-600 text-white";
    if (normalizedOrderStatus === "draft") return "border-slate-200 bg-slate-600 text-white";
    if (hasUnpaidItems) return "border-rose-200 bg-rose-600 text-white";
    return "border-slate-200 bg-slate-700 text-white";
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
    !hasKitchenActivity &&
    !hasSuborderItems &&
    tableItems.length === 0 &&
    Number(tableOrder?.total || 0) <= 0;
  const isFreeDisplay =
    (!isLockedTable && isFreeTable) ||
    (!isCheckedInReservation &&
      !isCheckedOutReservation &&
      !isLockedTable &&
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
  const paidStatusLabel = t("Unpaid");
  const fullyPaidStatusLabel = t("Paid");
  const normalizedStatusLabelKey =
    normalizedOrderStatus === "draft" ? "Free" : normalizedOrderStatus || "confirmed";
  const orderStatusLabel = isCheckedInReservationStatus(normalizedOrderStatus)
    ? t("Checked-in")
    : t(normalizedStatusLabelKey);
  const showOrderStatusBadge =
    normalizedOrderStatus !== "confirmed" &&
    !isPaidTable &&
    !(isLockedTable && !hasOrderActivity) &&
    (!shouldShowReservedBadge || hasPendingReservationActiveStatus);
  const reservationPanelClassName = isCheckedOutReservation
    ? cx(PANEL_BASE_CLASS, "border-slate-200 bg-slate-50/90")
    : isCheckedInReservation
      ? cx(PANEL_BASE_CLASS, "border-emerald-200 bg-emerald-50/90")
      : isConfirmedReservation
        ? cx(PANEL_BASE_CLASS, "border-rose-200 bg-rose-50/90")
      : cx(PANEL_BASE_CLASS, "border-sky-200 bg-sky-50/90");
  const reservationCompactStateLabel = isCheckedOutReservation
    ? t("Checked out")
    : isConfirmedReservation
      ? t("Confirmed")
      : t("Reserved");
  const reservationControlClass =
    "flex h-7 min-h-7 w-full min-w-0 max-w-full items-center justify-center overflow-hidden rounded-2xl border px-2.5 text-center text-[10px] font-semibold leading-none tracking-tight text-ellipsis whitespace-nowrap shadow-[0_8px_20px_rgba(15,23,42,0.1)] sm:h-7 sm:min-h-7 sm:w-full sm:px-3 sm:text-xs";
  const reservationCompactBadgeToneClass = isCheckedOutReservation
    ? cx(
        reservationControlClass,
        "border-slate-200 bg-slate-700 text-white sm:h-7 sm:min-h-7 sm:px-2.5 sm:text-xs"
      )
    : isConfirmedReservation
      ? cx(
          reservationControlClass,
          "border-rose-200 bg-rose-600 tracking-wide text-white sm:h-7 sm:min-h-7 sm:px-2.5 sm:text-xs"
        )
    : cx(
        reservationControlClass,
        "border-amber-200 bg-amber-500 tracking-wide text-white sm:h-7 sm:min-h-7 sm:px-2.5 sm:text-xs"
      );
  const reservationPrimaryActionClass = cx(
    reservationControlClass,
    "border-slate-200 bg-slate-900 text-white hover:bg-slate-800 sm:h-7 sm:min-h-7 sm:px-2.5 sm:text-xs"
  );
  const handleToggleLockClick = React.useCallback(
    (e) => {
      e.stopPropagation();
      handleToggleTableLock?.(table.tableNumber, !isLockedTable);
    },
    [handleToggleTableLock, isLockedTable, table.tableNumber]
  );

  const densityStatusKey = hasUnpaidItems
    ? "unpaid"
    : shouldShowReservedBadge
      ? "reserved"
      : isPaidTable
        ? "paid"
      : isFreeDisplay && !isLockedTable
        ? "empty"
        : "active";
  const densityStatusMeta = DENSITY_STATUS_META[densityStatusKey] || DENSITY_STATUS_META.active;
  const densityStatusLabel = t(densityStatusMeta.label);
  const compactAmountValue = Number(table?.unpaidTotal || 0);
  const compactAmountNumberLabel = Number.isFinite(compactAmountValue)
    ? Math.round(compactAmountValue).toLocaleString()
    : "0";
  const compactCurrencySymbol = (
    String(displayTotal || "").match(/[^\d\s.,-]+/g) || [""]
  )[0];
  const compactTotalLabel = `${compactCurrencySymbol}${compactAmountNumberLabel}`;
  const compactGuestsValue = Number.isFinite(clampedGuests) ? clampedGuests : 0;
  const compactSeatsValue = Number.isFinite(seats) && seats > 0 ? seats : 0;
  const compactGuestLabel = compactSeatsValue > 0
    ? `${compactGuestsValue}/${compactSeatsValue}`
    : `${compactGuestsValue}`;
  const compactAreaLabel = showAreas
    ? formatAreaLabel(table.area)
    : table.label || "";
  const compactAuxDots = [
    showReadyAt
      ? {
          key: "ready",
          className: isOrderDelayed ? "bg-rose-500" : "bg-amber-500",
          title: `${t("Ready at")} ${readyAtLabel}`,
        }
      : null,
    isCallingWaiter
      ? {
          key: "waiter",
          className: "bg-rose-500 animate-pulse",
          title: t("Calling"),
        }
      : null,
  ].filter(Boolean);
  const compactTooltip = [
    tableDisplayLabel,
    `${t("Status")}: ${densityStatusLabel}`,
    `${t("Amount")}: ${displayTotal}`,
    showGuestCount ? `${t("Guests")}: ${compactGuestLabel}` : null,
    compactAreaLabel,
  ]
    .filter(Boolean)
    .join(" • ");
  const canToggleLockCompact =
    showManualTableLock && (isFreeDisplay || (isLockedTable && !hasOrderActivity));

  if (isCompactDensity) {
    return (
      <div
        key={table.tableNumber}
        onClick={handleCardClick}
        title={compactTooltip}
        className={cx(
          "group relative w-full cursor-pointer border transition-all duration-200",
          densityStatusMeta.cardClass,
          isLargeCompact ? "rounded-xl p-3" : "rounded-lg p-2",
          isCallingWaiter && "ring-1 ring-rose-500/80"
        )}
      >
        <div className={cx("flex min-w-0 items-center", isLargeCompact ? "gap-2.5" : "gap-2")}>
          <span
            className={cx(
              "inline-flex shrink-0 items-center justify-center rounded-md border border-white/70 bg-white/65 px-2 py-0.5 font-extrabold tabular-nums leading-none text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.08)]",
              isLargeCompact ? "text-[20px]" : "text-[16px]"
            )}
          >
            {String(table.tableNumber).padStart(2, "0")}
          </span>
          <div className={cx("flex shrink-0 items-center", isLargeCompact ? "gap-2" : "gap-1.5")}>
            <span
              className={cx(
                "shrink-0 whitespace-nowrap font-medium leading-none text-slate-700/95",
                isLargeCompact ? "text-xs" : "text-[10px]"
              )}
              title={displayTotal}
            >
              {compactTotalLabel}
            </span>
            {showGuestCount ? (
              <span
                className={cx(
                  "shrink-0 whitespace-nowrap font-medium leading-none text-slate-600",
                  isLargeCompact ? "text-[11px]" : "text-[10px]"
                )}
                title={`${t("Guests")} ${compactGuestLabel}`}
              >
                👥{compactGuestLabel}
              </span>
            ) : null}
          </div>
          <div className={cx("ml-auto flex shrink-0 items-center", isLargeCompact ? "gap-1.5" : "gap-1")}>
            {canToggleLockCompact ? (
              <button
                type="button"
                onClick={handleToggleLockClick}
                title={isLockedTable ? t("Unlock table") : t("Mark table occupied")}
                className={cx(
                  "inline-flex items-center justify-center rounded border border-slate-200 leading-none transition hover:bg-slate-100",
                  isLargeCompact ? "h-6 w-6 text-[15px]" : "h-5 w-5 text-[14px]",
                  isLockedTable ? "bg-yellow-100 text-slate-900" : "bg-white text-slate-600"
                )}
              >
                {isLockedTable ? "🔓" : "🔒"}
              </button>
            ) : isLockedTable ? (
              <span className="text-[14px]" title={t("Locked")}>
                🔒
              </span>
            ) : null}

            {compactAuxDots.map((dot) => (
              <span
                key={dot.key}
                className={cx("inline-flex h-2 w-2 rounded-full", dot.className)}
                title={dot.title}
              />
            ))}
          </div>
        </div>

        <div
          className={cx(
            "mt-1 truncate leading-tight text-slate-500",
            isLargeCompact ? "text-xs" : "text-[11px]"
          )}
        >
          {compactAreaLabel || table.label || "—"}
        </div>
      </div>
    );
  }

  return (
    <div
      key={table.tableNumber}
      onClick={handleCardClick}
      className={cx(
        "group relative flex h-[318px] w-full max-w-[437px] self-start cursor-pointer flex-col justify-between overflow-hidden border shadow-[0_24px_60px_rgba(15,23,42,0.09)] backdrop-blur-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_30px_72px_rgba(15,23,42,0.14)] sm:h-[304px]",
        CARD_RADIUS_CLASS,
        cardToneClass,
        isCallingWaiter && "ring-2 ring-red-500/80 animate-[pulse_2.4s_ease-in-out_infinite]"
      )}
    >
      {shouldRenderAccentGlow ? (
        <div
          className={cx(
            "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl",
            cardAccentGlowClass
          )}
        />
      ) : null}
      {shouldRenderAccentGlow ? (
        <div
          className={cx(
            "pointer-events-none absolute -bottom-20 left-0 h-44 w-44 rounded-full blur-3xl",
            cardAccentGlowClass
          )}
        />
      ) : null}
      {isCallingWaiter && (
        <div className="pointer-events-none absolute inset-0 bg-red-500/10 animate-pulse" />
      )}
      <div className="relative flex h-full flex-col p-4 sm:p-5">
        {showRenderCounter && (
          <div className="mb-2 flex justify-end">
            <RenderCounter label={`Card ${table.tableNumber}`} value={renderCount} />
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2.5">
          <div className="flex min-w-0 flex-1 items-start">
            {shouldShowKitchenStatusSlot ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 overflow-hidden">
                {compactKitchenStatusBadges.length > 0 ? (
                  compactKitchenStatusBadges
                ) : (
                  <span className="invisible inline-flex min-h-8 items-center rounded-2xl px-3 py-1 text-[10px] font-semibold sm:min-h-9 sm:px-3.5 sm:py-1.5 sm:text-[13px]">
                    1 New
                  </span>
                )}
              </div>
            ) : isLockedTable && !hasOrderActivity ? (
              <Pill className="rounded-2xl border-amber-200 bg-amber-500 px-3.5 py-1.5 text-[11px] text-white shadow-[0_8px_20px_rgba(15,23,42,0.08)] sm:px-3.5 sm:py-1.5 sm:text-[13px]">
                {t("Occupied")}
              </Pill>
            ) : isFreeDisplay ? (
              <Pill className="rounded-2xl border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] text-slate-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] sm:px-3.5 sm:py-1.5 sm:text-[13px]">
                {t("Free")}
              </Pill>
            ) : null}
          </div>

          <div className="min-w-0 self-center text-center" />

          <div className="flex min-w-0 shrink-0 justify-end self-start">
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2">
              <div className="inline-flex min-h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white/92 px-3.5 py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:px-4">
                <div className="text-[13px] font-semibold leading-none tracking-tight text-slate-700 sm:text-[14px]">
                  {displayTotal}
                </div>
              </div>
              {hasOrderActivity && (hasUnpaidItems || isPaidTable) ? (
                hasUnpaidItems ? (
                  <Pill className="border-rose-200 bg-rose-600 px-3 py-1.5 text-[10px] text-white sm:px-3 sm:py-1 sm:text-xs">
                    {paidStatusLabel}
                  </Pill>
                ) : isPaidTable ? (
                  <Pill className="border-emerald-200 bg-emerald-600 px-3 py-1.5 text-[10px] text-white sm:px-3 sm:py-1 sm:text-xs">
                    {fullyPaidStatusLabel}
                  </Pill>
                ) : null
              ) : null}
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-0 flex -translate-y-1/2 justify-center px-5">
          <span className="inline-flex max-w-full items-center justify-center rounded-2xl bg-white/60 px-4 py-2.5 text-[16px] font-bold tracking-tight text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:px-5.5 sm:py-2.5 sm:text-[20px]">
            <span className="truncate">{tableDisplayLabel}</span>
          </span>
        </div>

        {table.label && (
          <Pill className="relative z-10 mt-2 max-w-full justify-start truncate border-slate-200 bg-white/85 px-3.5 text-slate-600">
            {table.label}
          </Pill>
        )}

        <div className="relative z-10 mt-2 flex min-h-6 items-center gap-2">
          <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
            {!isFreeDisplay && !shouldShowReservedBadge && showOrderStatusBadge ? (
              <span className={tableStatusClassName}>{orderStatusLabel}</span>
            ) : null}
          </div>
        </div>

        <div
          className={cx(
            "relative z-10 flex min-h-0 flex-1 flex-col",
            shouldShowReservedBadge ? "mt-0 gap-1" : isFreeDisplay ? "mt-0 gap-1" : "mt-2 gap-2"
          )}
        >
          {isFreeDisplay && !shouldShowReservedBadge ? <div className="min-h-0 flex-1" /> : null}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2 sm:pt-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {showAreas ? (
              <Pill className="max-w-[82%] justify-start whitespace-nowrap border-slate-200 bg-white/85 px-3 py-1.5 text-[10px] text-slate-700 sm:max-w-none sm:py-1 sm:text-xs">
                {formatAreaLabel(table.area)}
              </Pill>
            ) : (
              <span />
            )}
          </div>

          <div className="ml-auto flex items-center justify-end gap-2 flex-nowrap">
            {!isFreeDisplay &&
            !shouldShowReservedBadge &&
            (shouldShowConfirmedTimer || showReadyAt) ? (
              <div className="hidden min-h-6 items-center justify-end gap-2 sm:flex">
                {shouldShowConfirmedTimer ? (
                  <Pill className="border-slate-200 bg-slate-900 px-2.5 py-1 text-[9px] font-mono text-white sm:py-1 sm:text-xs">
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

            {!isFreeDisplay &&
            !shouldShowReservedBadge &&
            (shouldShowConfirmedTimer || showReadyAt) ? (
              <div className="flex min-h-6 items-center justify-end gap-2 sm:hidden">
                {shouldShowConfirmedTimer ? (
                  <Pill className="border-slate-200 bg-slate-900 px-2.5 py-1 text-[9px] font-mono text-white sm:py-1 sm:text-xs">
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

            {showManualTableLock && (isFreeDisplay || (isLockedTable && !hasOrderActivity)) ? (
              <button
                type="button"
                onClick={handleToggleLockClick}
                title={isLockedTable ? t("Unlock table") : t("Mark table occupied")}
                className={cx(
                  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white/92 px-3.5 text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-white active:scale-[0.98] sm:h-8",
                  isLockedTable
                    ? "border-yellow-200 bg-yellow-400 text-slate-900 hover:bg-yellow-400"
                    : "w-9 sm:w-8"
                )}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                  {isLockedTable ? (
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  ) : (
                    <path d="M8 11V8a4 4 0 0 1 7.2-2.4" />
                  )}
                </svg>
                {isLockedTable ? (
                  <span className="text-[11px] font-semibold leading-none sm:text-xs">
                    {t("Unlock")}
                  </span>
                ) : null}
              </button>
            ) : null}

            {isCallingWaiter && (
              <div className="flex items-center justify-end gap-2 flex-nowrap">
                <Pill className="border-rose-200 bg-rose-600 px-3 py-1.5 text-[10px] text-white animate-pulse sm:px-3 sm:py-1 sm:text-xs">
                  🔴 {t("Calling")}
                </Pill>
                <ActionButton
                  onClick={handleResolvedClick}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {t("Resolved")}
                </ActionButton>
              </div>
            )}

            {hasOrderActivity && !hasUnpaidItems && (
              <div className="flex items-center justify-end gap-2 flex-nowrap">
                {isPaidTable ? (
                  <button
                    type="button"
                    onClick={handleCloseClick}
                    className={cx(
                      BADGE_BASE_CLASS,
                      "border-slate-200 bg-slate-900 text-white transition duration-150 hover:bg-slate-800 active:scale-[0.99]"
                    )}
                  >
                    {t("Close")}
                  </button>
                ) : (
                  <ActionButton
                    onClick={handleCloseClick}
                    className="h-8 rounded-2xl bg-slate-900 px-3.5 text-xs font-semibold hover:bg-slate-800"
                  >
                    {t("Close")}
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        </div>

        {showGuestCount && table.seats && !(isLockedTable && !hasOrderActivity) ? (
          <div className="mt-2 flex justify-center border-t border-slate-200/60 pt-2">
            <div
              className={cx(
                BADGE_BASE_CLASS,
                "gap-1.5 border-slate-200 bg-white/92 px-3.5 text-[10px] text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:text-xs"
              )}
              onClick={stopPropagation}
            >
              <span className="text-[11px] leading-none">👥</span>
              <span className="font-medium text-slate-500">{t("Guests")}</span>
              <select
                className="min-w-[2rem] bg-transparent pr-0.5 text-[10px] font-bold text-slate-900 outline-none sm:text-[11px]"
                value={Number.isFinite(clampedGuests) ? String(clampedGuests) : ""}
                onChange={handleGuestsSelectChange}
                onClick={stopPropagation}
              >
                <option value="">—</option>
                {guestOptionElements}
              </select>
              <span className="font-medium text-slate-500">/ {seats}</span>
            </div>
          </div>
        ) : null}

        {shouldShowReservedBadge && (
          <div
            className={cx(
              reservationPanelClassName,
              "relative z-10 mt-2 flex w-full max-w-full items-center gap-1.5 overflow-hidden px-2.5 py-2 sm:gap-1.5 sm:px-3 sm:py-2"
            )}
          >
            <div className="flex w-full min-w-0 items-center gap-1 sm:gap-1.5">
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
    prevProps.handleToggleTableLock === nextProps.handleToggleTableLock &&
    prevProps.handleGuestsChange === nextProps.handleGuestsChange &&
    prevProps.handleCloseTable === nextProps.handleCloseTable &&
    prevProps.handleCheckinReservation === nextProps.handleCheckinReservation &&
    prevProps.handleOpenViewBooking === nextProps.handleOpenViewBooking &&
    prevProps.getTablePrepMeta === nextProps.getTablePrepMeta &&
    prevProps.waiterCallsByTable === nextProps.waiterCallsByTable &&
    prevProps.handleResolveWaiterCall === nextProps.handleResolveWaiterCall &&
    prevProps.showManualTableLock === nextProps.showManualTableLock &&
    prevProps.showGuestCount === nextProps.showGuestCount &&
    prevProps.tableDensity === nextProps.tableDensity;

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
        "handleToggleTableLock",
        "handleGuestsChange",
        "handleCloseTable",
        "handleCheckinReservation",
        "handleOpenViewBooking",
        "getTablePrepMeta",
        "waiterCallsByTable",
        "handleResolveWaiterCall",
        "showManualTableLock",
        "showGuestCount",
        "tableDensity",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TableCard, areTableCardPropsEqual);
