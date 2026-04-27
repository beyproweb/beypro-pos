import React from "react";
import { Lock, Phone } from "lucide-react";
import { useTableTimers } from "./hooks/useTableTimers";
import TableCard from "./TableCard";
import VirtualTablesGrid from "./VirtualTablesGrid";
import SongRequestsAdminTab from "../songRequests/SongRequestsAdminTab";
import {
  RenderCounter,
  createProfilerOnRender,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
  withPerfTimer,
} from "./dev/perfDebug";
import {
  hasConcertBookingContext,
  isReservationConfirmedForCheckin,
} from "../../utils/reservationStatus";
import { normalizeOrderStatus } from "./tableVisuals";
import {
  getBookingScheduledDateYmd,
  isConcertBookingRelevantForTodayTableState,
  isReservationRelevantForTodayTableState,
} from "../../utils/tableBookingState";
import {
  getTableDensityLayout,
  normalizeTableDensity,
} from "./tableDensity";

const AREA_FILTER_ALL = "ALL";
const AREA_FILTER_RESERVED = "__RESERVED__";
const AREA_FILTER_UNPAID = "__UNPAID__";
const AREA_FILTER_PAID = "__PAID__";
const AREA_FILTER_FREE = "__FREE__";
const AREA_FILTER_VIEW_BOOKING = "__VIEW_BOOKING__";
const AREA_FILTER_SONG_REQUEST = "__SONG_REQUEST__";
const findNearestScrollContainer = (startNode) => {
  if (typeof window === "undefined") return null;
  let node = startNode?.parentElement || null;

  while (node) {
    const styles = window.getComputedStyle(node);
    const overflowY = styles?.overflowY || "";
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight;

    if (isScrollable) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
};
const formatDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getBookingStatusToneClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["confirmed", "checked_in", "checked-in"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["cancelled", "canceled"].includes(normalized)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
};

const getWaiterCallType = (waiterCall) => {
  const normalized = String(
    waiterCall?.callType ??
      waiterCall?.requestType ??
      waiterCall?.call_type ??
      waiterCall?.request_type ??
      waiterCall?.type ??
      ""
  )
    .trim()
    .toLowerCase();
  if (normalized === "bill" || normalized === "reorder") return normalized;
  return null;
};

const VIEW_BOOKING_TERMINAL_STATUSES = new Set([
  "checked_out",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
  "archived",
]);

const isTerminalViewBookingRow = (booking = {}) => {
  const source = String(booking?.booking_source || "").toLowerCase();
  const isConcertLike = source === "concert" || hasConcertBookingContext(booking);
  const reservationOrderStatus = normalizeOrderStatus(
    booking?.reservation_order_status ??
      booking?.reservationOrderStatus ??
      booking?.reservation_status ??
      booking?.reservationStatus ??
      booking?.status
  );
  const reservationStatus = normalizeOrderStatus(
    booking?.status ?? booking?.reservation_status ?? booking?.reservationStatus
  );
  const paymentStatus = String(booking?.payment_status ?? booking?.paymentStatus ?? "")
    .trim()
    .toLowerCase();
  const bookingStatus = String(
    booking?.booking_status ?? booking?.bookingStatus ?? booking?.status ?? ""
  )
    .trim()
    .toLowerCase();

  if (isConcertLike) {
    if (paymentStatus === "cancelled" || paymentStatus === "canceled") return true;
    if (VIEW_BOOKING_TERMINAL_STATUSES.has(reservationOrderStatus)) return true;
    if (VIEW_BOOKING_TERMINAL_STATUSES.has(bookingStatus)) return true;
    return false;
  }

  return (
    VIEW_BOOKING_TERMINAL_STATUSES.has(reservationOrderStatus) ||
    VIEW_BOOKING_TERMINAL_STATUSES.has(reservationStatus)
  );
};

const hasBookingGuestCompositionValue = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const bookingHasGuestComposition = (booking = {}) =>
  hasBookingGuestCompositionValue(
    booking?.male_guests_count ??
      booking?.maleGuestsCount ??
      booking?.reservation_men ??
      booking?.reservationMen
  ) ||
  hasBookingGuestCompositionValue(
    booking?.female_guests_count ??
      booking?.femaleGuestsCount ??
      booking?.reservation_women ??
      booking?.reservationWomen
  );

const normalizeBookingMatchText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getConcertDuplicateFallbackKey = (booking = {}) => {
  const tableNumber = Number(
    booking?.reserved_table_number ??
      booking?.reservedTableNumber ??
      booking?.table_number ??
      booking?.tableNumber
  );
  const bookingDate = normalizeBookingMatchText(
    booking?.event_date ??
      booking?.eventDate ??
      booking?.reservation_date ??
      booking?.reservationDate
  );
  const bookingTime = normalizeBookingMatchText(
    booking?.event_time ??
      booking?.eventTime ??
      booking?.reservation_time ??
      booking?.reservationTime
  ).slice(0, 5);
  const customerPhone = normalizeBookingMatchText(
    booking?.customer_phone ?? booking?.customerPhone
  ).replace(/[^\d+]/g, "");
  const customerName = normalizeBookingMatchText(
    booking?.customer_name ?? booking?.customerName
  );

  const identity = customerPhone || customerName;
  if (!identity || !bookingDate || !bookingTime) return "";

  return `concert-fallback:${
    Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : "na"
  }:${bookingDate}:${bookingTime}:${identity}`;
};

const getConcertDuplicateGroupKey = (booking = {}) => {
  const source = String(booking?.booking_source || "").toLowerCase();
  const concertLike = source === "concert" || hasConcertBookingContext(booking);
  const reservationOrderId = Number(
    booking?.reservation_order_id ??
      booking?.reservationOrderId ??
      booking?.order_id ??
      booking?.orderId ??
      booking?.reservation_id ??
      booking?.reservationId
  );

  if (concertLike) {
    if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
      return `concert-order:${reservationOrderId}`;
    }
    const fallbackKey = getConcertDuplicateFallbackKey(booking);
    if (fallbackKey) return fallbackKey;
  }

  if (source === "reservation" && !concertLike) {
    const reservationId = Number(
      booking?.id ??
        booking?.reservation_id ??
        booking?.reservationId ??
        booking?.order_id ??
        booking?.orderId
    );
    if (Number.isFinite(reservationId) && reservationId > 0) {
      return `reservation-row:${reservationId}`;
    }
    const tableNumber = Number(booking?.table_number ?? booking?.tableNumber);
    const reservationDate = normalizeBookingMatchText(
      booking?.reservation_date ?? booking?.reservationDate
    );
    const reservationTime = normalizeBookingMatchText(
      booking?.reservation_time ?? booking?.reservationTime
    ).slice(0, 5);
    if (
      Number.isFinite(tableNumber) &&
      tableNumber > 0 &&
      reservationDate &&
      reservationTime
    ) {
      return `reservation-fallback:${tableNumber}:${reservationDate}:${reservationTime}`;
    }
    return "";
  }

  const concertBookingId = Number(
    booking?.id ??
      booking?.booking_id ??
      booking?.bookingId ??
      booking?.concert_booking_id ??
      booking?.concertBookingId
  );
  if (Number.isFinite(concertBookingId) && concertBookingId > 0) {
    return `concert-booking:${concertBookingId}`;
  }
  if (!concertLike) return "";
  return getConcertDuplicateFallbackKey(booking);
};

const mergeBookingRecords = (preferred = {}, secondary = {}) => {
  const pickFirstFilledValue = (...values) =>
    values.find((value) => {
      if (value === undefined || value === null) return false;
      if (typeof value === "string") return value.trim() !== "";
      return true;
    });

  const pickLifecycleValue = (...values) => {
    const normalized = values
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (normalized.includes("checked_out")) return "checked_out";
    if (normalized.includes("checked_in")) return "checked_in";
    if (normalized.includes("confirmed")) return "confirmed";
    return values.find((value) => String(value ?? "").trim() !== "") ?? null;
  };

  const mergedStatus = pickLifecycleValue(
    preferred?.status,
    preferred?.reservation_status,
    preferred?.reservationStatus,
    preferred?.reservation_order_status,
    preferred?.reservationOrderStatus,
    secondary?.status,
    secondary?.reservation_status,
    secondary?.reservationStatus,
    secondary?.reservation_order_status,
    secondary?.reservationOrderStatus
  );
  const mergedReservationOrderStatus = pickLifecycleValue(
    preferred?.reservation_order_status,
    preferred?.reservationOrderStatus,
    secondary?.reservation_order_status,
    secondary?.reservationOrderStatus,
    preferred?.status,
    secondary?.status
  );

  return {
    ...secondary,
    ...preferred,
    booking_source: preferred?.booking_source ?? secondary?.booking_source,
    id: preferred?.id ?? secondary?.id,
    order_id: preferred?.order_id ?? secondary?.order_id,
    orderId: preferred?.orderId ?? secondary?.orderId,
    reservation_order_id:
      preferred?.reservation_order_id ?? secondary?.reservation_order_id,
    reservationOrderId:
      preferred?.reservationOrderId ?? secondary?.reservationOrderId,
    concert_booking_id:
      preferred?.concert_booking_id ?? secondary?.concert_booking_id ?? secondary?.id,
    concertBookingId:
      preferred?.concertBookingId ?? secondary?.concertBookingId ?? secondary?.id,
    status: mergedStatus,
    reservation_status:
      preferred?.reservation_status ?? secondary?.reservation_status ?? mergedStatus,
    reservationStatus:
      preferred?.reservationStatus ?? secondary?.reservationStatus ?? mergedStatus,
    reservation_order_status: mergedReservationOrderStatus,
    reservationOrderStatus: mergedReservationOrderStatus,
    event_title: pickFirstFilledValue(
      preferred?.event_title,
      preferred?.eventTitle,
      secondary?.event_title,
      secondary?.eventTitle
    ),
    eventTitle: pickFirstFilledValue(
      preferred?.eventTitle,
      preferred?.event_title,
      secondary?.eventTitle,
      secondary?.event_title
    ),
    artist_name: pickFirstFilledValue(
      preferred?.artist_name,
      preferred?.artistName,
      secondary?.artist_name,
      secondary?.artistName
    ),
    artistName: pickFirstFilledValue(
      preferred?.artistName,
      preferred?.artist_name,
      secondary?.artistName,
      secondary?.artist_name
    ),
    reservation_notes: pickFirstFilledValue(
      preferred?.reservation_notes,
      preferred?.reservationNotes,
      secondary?.reservation_notes,
      secondary?.reservationNotes
    ),
    reservationNotes: pickFirstFilledValue(
      preferred?.reservationNotes,
      preferred?.reservation_notes,
      secondary?.reservationNotes,
      secondary?.reservation_notes
    ),
  };
};

const pickPreferredBooking = (current = {}, candidate = {}) => {
  const currentSource = String(current?.booking_source || "").toLowerCase();
  const candidateSource = String(candidate?.booking_source || "").toLowerCase();
  if (candidateSource !== currentSource) {
    if (candidateSource === "concert") return candidate;
    if (currentSource === "concert") return current;
  }

  const currentHasComposition = bookingHasGuestComposition(current);
  const candidateHasComposition = bookingHasGuestComposition(candidate);
  if (candidateHasComposition !== currentHasComposition) {
    return candidateHasComposition ? candidate : current;
  }

  const currentUpdated = Number(current?.updated_at ? new Date(current.updated_at).getTime() : 0) || 0;
  const candidateUpdated =
    Number(candidate?.updated_at ? new Date(candidate.updated_at).getTime() : 0) || 0;
  return candidateUpdated > currentUpdated ? candidate : current;
};

const getViewBookingActionKey = (booking = {}) => {
  const source = String(booking?.booking_source || "").toLowerCase();
  if (source === "concert") {
    return `concert-${String(booking?.id ?? booking?.reservation_order_id ?? booking?.reservationOrderId ?? "")}`;
  }
  return `reservation-${String(
    booking?.id ??
      booking?.order_id ??
      booking?.orderId ??
      booking?.table_number ??
      booking?.tableNumber ??
      ""
  )}`;
};

function TablesView({
  showAreaTabs,
  showStandardAreaTabs = true,
  activeArea,
  setActiveArea,
  groupedTables,
  tables,
  ordersByTable,
  productPrepById,
  formatAreaLabel,
  cardProps,
  t,
  showViewBookingTab = false,
  concertBookings = [],
  reservationBookings = [],
  concertBookingsLoading = false,
  concertBookingUpdatingId = null,
  reservationBookingUpdatingKey = null,
  onConcertBookingUpdateStatus,
  onReservationBookingUpdateStatus,
  onClearBookings,
  clearingBookings = false,
  showSongRequestTab = false,
  showPacketTab = false,
  onPacketTabClick = null,
  packetOrdersCount = 0,
  songRequests = [],
  songRequestsLoading = false,
  songRequestUpdatingId = null,
  onApproveSongRequest,
  onCompleteSongRequest,
  onCancelSongRequest,
  tableDensity = "comfortable",
  onLockClick,
}) {
  const renderCount = useRenderCount("TableList", { logEvery: 1 });
  const onTableListProfileRender = React.useMemo(() => createProfilerOnRender("TableList"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const viewRootRef = React.useRef(null);
  const viewScrollContainerRef = React.useRef(null);
  const areaTabsRailRef = React.useRef(null);
  const areaTabRefs = React.useRef(new Map());
  const tableGridRef = React.useRef(null);
  const tableTimers = useTableTimers({ ordersByTable, productPrepById });
  const [bookingSearch, setBookingSearch] = React.useState("");
  const [bookingDateFrom, setBookingDateFrom] = React.useState(() => formatDateInputValue(new Date()));
  const [bookingDateTo, setBookingDateTo] = React.useState(() => "");
  const [bookingActionSubmittingKey, setBookingActionSubmittingKey] = React.useState("");
  const normalizedTableDensity = React.useMemo(
    () => normalizeTableDensity(tableDensity),
    [tableDensity]
  );
  const tableDensityLayout = React.useMemo(
    () => getTableDensityLayout(normalizedTableDensity),
    [normalizedTableDensity]
  );
  const isActiveReservationFallback = React.useCallback((table) => {
    const fallback = table?.reservationFallback;
    if (!fallback || typeof fallback !== "object") return false;
    return isReservationRelevantForTodayTableState(fallback);
  }, []);
  const concertBookedTableNumbers = React.useMemo(() => {
    const booked = new Set();
    if (!Array.isArray(concertBookings)) return booked;
    concertBookings.forEach((booking) => {
      if (!isConcertBookingRelevantForTodayTableState(booking)) return;
      const paymentStatus = String(
        booking?.payment_status ?? booking?.paymentStatus ?? ""
      ).toLowerCase();
      if (paymentStatus === "cancelled" || paymentStatus === "canceled") return;
      const tableNumber = Number(
        booking?.reserved_table_number ?? booking?.reservedTableNumber
      );
      if (Number.isFinite(tableNumber) && tableNumber > 0) {
        booked.add(tableNumber);
      }
    });
    return booked;
  }, [concertBookings]);
  const combinedBookings = React.useMemo(() => {
    const concertRows = Array.isArray(concertBookings)
      ? concertBookings.map((booking) => ({ ...booking, booking_source: "concert" }))
      : [];
    const reservationRows = Array.isArray(reservationBookings)
      ? reservationBookings.map((booking) => ({ ...booking, booking_source: "reservation" }))
      : [];
    const mergedRows = [...concertRows, ...reservationRows];
    const deduped = [];
    const concertLikeByGroup = new Map();

    mergedRows.forEach((booking) => {
      const groupKey = getConcertDuplicateGroupKey(booking);
      if (!groupKey) {
        deduped.push(booking);
        return;
      }

      const existing = concertLikeByGroup.get(groupKey);
      if (!existing) {
        concertLikeByGroup.set(groupKey, booking);
        return;
      }

      const preferred = pickPreferredBooking(existing, booking);
      const secondary = preferred === existing ? booking : existing;
      concertLikeByGroup.set(groupKey, mergeBookingRecords(preferred, secondary));
    });

    const primaryMergedRows = [...deduped, ...Array.from(concertLikeByGroup.values())];
    const finalRows = [];
    const fallbackIndexByKey = new Map();

    primaryMergedRows.forEach((booking) => {
      const fallbackKey = getConcertDuplicateFallbackKey(booking);
      if (!fallbackKey) {
        finalRows.push(booking);
        return;
      }

      const source = String(booking?.booking_source || "").toLowerCase();
      const isConcertLike = source === "concert" || hasConcertBookingContext(booking);
      const existingIndex = fallbackIndexByKey.get(fallbackKey);
      if (existingIndex == null) {
        fallbackIndexByKey.set(fallbackKey, finalRows.length);
        finalRows.push(booking);
        return;
      }

      const existing = finalRows[existingIndex];
      const existingSource = String(existing?.booking_source || "").toLowerCase();
      const existingConcertLike =
        existingSource === "concert" || hasConcertBookingContext(existing);
      const shouldMergeCrossSource =
        source !== existingSource && (isConcertLike || existingConcertLike);

      if (!shouldMergeCrossSource) {
        finalRows.push(booking);
        return;
      }

      const preferred = pickPreferredBooking(existing, booking);
      const secondary = preferred === existing ? booking : existing;
      finalRows[existingIndex] = mergeBookingRecords(preferred, secondary);
    });

    return finalRows;
  }, [concertBookings, reservationBookings]);
  const rangeBookingCount = React.useMemo(() => {
    return combinedBookings.filter((booking) => {
      if (isTerminalViewBookingRow(booking)) return false;
      const bookingDate = getBookingScheduledDateYmd(booking);
      if (!bookingDate) return false;
      if (bookingDateFrom && bookingDate < bookingDateFrom) return false;
      if (bookingDateTo && bookingDate > bookingDateTo) return false;
      return true;
    }).length;
  }, [bookingDateFrom, bookingDateTo, combinedBookings]);
  const normalizedBookingSearch = bookingSearch.trim().toLowerCase();
  const filteredBookings = React.useMemo(() => {
    return combinedBookings.filter((booking) => {
      if (isTerminalViewBookingRow(booking)) return false;
      const bookingDate = getBookingScheduledDateYmd(booking);
      if (bookingDateFrom && bookingDate && bookingDate < bookingDateFrom) return false;
      if (bookingDateTo && bookingDate && bookingDate > bookingDateTo) return false;
      if (!normalizedBookingSearch) return true;
      const customerName = String(booking?.customer_name ?? booking?.customerName ?? "").toLowerCase();
      const customerPhone = String(
        booking?.customer_phone ?? booking?.customerPhone ?? ""
      ).toLowerCase();
      return (
        customerName.includes(normalizedBookingSearch) ||
        customerPhone.includes(normalizedBookingSearch)
      );
    });
  }, [bookingDateFrom, bookingDateTo, combinedBookings, normalizedBookingSearch]);
  const hasAnyViewBookingRows = combinedBookings.length > 0;
  const tablesByNumber = React.useMemo(() => {
    const map = new Map();
    (Array.isArray(tables) ? tables : []).forEach((table) => {
      const tableNumber = Number(table?.tableNumber ?? table?.table_number);
      if (Number.isFinite(tableNumber) && tableNumber > 0) {
        map.set(tableNumber, table);
      }
    });
    return map;
  }, [tables]);
  const isConcertBookedTable = React.useCallback(
    (table) => {
      const tableNumber = Number(table?.tableNumber);
      return Number.isFinite(tableNumber) && concertBookedTableNumbers.has(tableNumber);
    },
    [concertBookedTableNumbers]
  );
  const resolveBookingActionContext = React.useCallback(
    (booking) => {
      const tableNumber = Number(
        booking?.reserved_table_number ??
          booking?.reservedTableNumber ??
          booking?.table_number ??
          booking?.tableNumber
      );
      const preferredOrderId = Number(
        booking?.reservation_order_id ??
          booking?.reservationOrderId ??
          booking?.order_id ??
          booking?.orderId
      );
      const tableFromGrid =
        Number.isFinite(tableNumber) && tableNumber > 0 ? tablesByNumber.get(tableNumber) || null : null;
      const rawTableOrders =
        Number.isFinite(tableNumber) && tableNumber > 0 && ordersByTable instanceof Map
          ? ordersByTable.get(tableNumber)
          : null;
      const tableOrderCandidates = Array.isArray(rawTableOrders)
        ? rawTableOrders
        : rawTableOrders
          ? [rawTableOrders]
          : [];
      let tableOrder = tableFromGrid?.order || null;
      if (
        Number.isFinite(preferredOrderId) &&
        preferredOrderId > 0 &&
        Number(tableOrder?.id) !== preferredOrderId
      ) {
        tableOrder =
          tableOrderCandidates.find((order) => Number(order?.id) === preferredOrderId) || tableOrder;
      }
      if (!tableOrder && Number.isFinite(tableNumber) && tableNumber > 0 && ordersByTable instanceof Map) {
        tableOrder =
          (Number.isFinite(preferredOrderId) && preferredOrderId > 0
            ? tableOrderCandidates.find((order) => Number(order?.id) === preferredOrderId)
            : null) ||
          tableOrderCandidates[0] ||
          null;
      }

      const normalizedStatus = String(
        booking?.reservation_order_status ??
          booking?.reservationOrderStatus ??
          booking?.status ??
          booking?.reservation_status ??
          booking?.reservationStatus ??
          booking?.payment_status ??
          booking?.paymentStatus ??
          tableFromGrid?.reservationFallback?.status ??
          tableOrder?.reservation?.status ??
          tableOrder?.status ??
          ""
      )
        .trim()
        .toLowerCase();
      const resolvedOrderId =
        (Number.isFinite(preferredOrderId) && preferredOrderId > 0 ? preferredOrderId : null) ??
        tableFromGrid?.reservationFallback?.order_id ??
        tableFromGrid?.reservationFallback?.orderId ??
        tableOrder?.reservation?.order_id ??
        tableOrder?.reservation?.orderId ??
        tableOrder?.id ??
        null;
      const reservationInfo = {
        ...(tableFromGrid?.reservationFallback && typeof tableFromGrid.reservationFallback === "object"
          ? tableFromGrid.reservationFallback
          : {}),
        ...booking,
        status: normalizedStatus || booking?.status || null,
        reservation_status:
          booking?.reservation_status ??
          booking?.reservationStatus ??
          normalizedStatus ??
          null,
        reservationStatus:
          booking?.reservationStatus ??
          booking?.reservation_status ??
          normalizedStatus ??
          null,
        order_id: resolvedOrderId,
        orderId: resolvedOrderId,
        table_number: Number.isFinite(tableNumber) ? tableNumber : booking?.table_number ?? null,
        tableNumber: Number.isFinite(tableNumber) ? tableNumber : booking?.tableNumber ?? null,
      };

      const tableContext = tableFromGrid
        ? {
            ...tableFromGrid,
            order: tableOrder || null,
            reservationFallback: {
              ...(tableFromGrid?.reservationFallback && typeof tableFromGrid.reservationFallback === "object"
                ? tableFromGrid.reservationFallback
                : {}),
              ...reservationInfo,
            },
          }
        : {
            tableNumber: Number.isFinite(tableNumber) ? tableNumber : null,
            table_number: Number.isFinite(tableNumber) ? tableNumber : null,
            order: tableOrder || null,
            reservationFallback: reservationInfo,
            hasUnpaidItems: false,
            isReservedTable: true,
            isFreeTable: false,
          };

      return {
        table: tableContext,
        reservationInfo,
        tableNumber,
      };
    },
    [ordersByTable, tablesByNumber]
  );
  const handleBookingCheckin = React.useCallback(
    async (booking) => {
      if (typeof cardProps?.handleCheckinReservation !== "function") return;
      const actionKey = getViewBookingActionKey(booking);
      const context = resolveBookingActionContext(booking);
      if (!context?.table) return;
      setBookingActionSubmittingKey(actionKey);
      try {
        await cardProps.handleCheckinReservation(context.table, context.reservationInfo);
      } finally {
        setBookingActionSubmittingKey((current) => (current === actionKey ? "" : current));
      }
    },
    [cardProps, resolveBookingActionContext]
  );
  const handleBookingCheckout = React.useCallback(
    async (booking) => {
      if (typeof cardProps?.handleCloseTable !== "function") return;
      const actionKey = getViewBookingActionKey(booking);
      const context = resolveBookingActionContext(booking);
      const reservationInfo = context?.reservationInfo || null;
      const table = context?.table || null;
      const reservationOrderId = Number(reservationInfo?.order_id ?? reservationInfo?.orderId);
      const activeOrderId = Number(table?.order?.id);
      const checkoutTarget =
        Number.isFinite(reservationOrderId) && reservationOrderId > 0
          ? reservationOrderId
          : Number.isFinite(activeOrderId) && activeOrderId > 0
            ? activeOrderId
            : table?.order ||
              reservationInfo?.order_id ||
              reservationInfo?.orderId ||
              reservationInfo?.id;
      if (!checkoutTarget) return;

      setBookingActionSubmittingKey(actionKey);
      try {
        await cardProps.handleCloseTable(checkoutTarget, {
          preserveReservationShadow: false,
          requirePaid: true,
          isReservationCheckout: true,
          tableNumber: table?.tableNumber ?? table?.table_number ?? null,
          reservationId: reservationInfo?.id ?? null,
        });
      } finally {
        setBookingActionSubmittingKey((current) => (current === actionKey ? "" : current));
      }
    },
    [cardProps, resolveBookingActionContext]
  );

  const visibleTables = React.useMemo(
    () =>
      withPerfTimer("[perf] TableList visible tables", () => {
        const allTables = Array.isArray(tables) ? tables : [];
        if (!showAreaTabs) return allTables;
        if (activeArea === AREA_FILTER_ALL) return allTables;
        if (activeArea === AREA_FILTER_RESERVED) {
          return allTables.filter(
            (table) =>
              Boolean(table?.isReservedTable) ||
              isActiveReservationFallback(table)
          );
        }
        if (activeArea === AREA_FILTER_UNPAID) {
          return allTables.filter((table) => table?.hasUnpaidItems && !table?.isFreeTable);
        }
        if (activeArea === AREA_FILTER_PAID) {
          return allTables.filter((table) => table?.isFullyPaid && !table?.isFreeTable);
        }
        if (activeArea === AREA_FILTER_FREE) {
          return allTables.filter(
            (table) => Boolean(table?.isFreeTable) && !isConcertBookedTable(table)
          );
        }
        if (activeArea === AREA_FILTER_VIEW_BOOKING) {
          return [];
        }
        if (activeArea === AREA_FILTER_SONG_REQUEST) {
          return [];
        }
        return groupedTables[activeArea] || [];
      }),
    [
      showAreaTabs,
      activeArea,
      tables,
      groupedTables,
      isConcertBookedTable,
      isActiveReservationFallback,
    ]
  );
  const reservedTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter(
            (table) =>
              Boolean(table?.isReservedTable) ||
              isActiveReservationFallback(table)
          ).length
        : 0,
    [tables, isActiveReservationFallback]
  );
  const unpaidTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter((table) => table?.hasUnpaidItems && !table?.isFreeTable).length
        : 0,
    [tables]
  );
  const paidTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter((table) => table?.isFullyPaid && !table?.isFreeTable).length
        : 0,
    [tables]
  );
  const freeTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter(
            (table) => Boolean(table?.isFreeTable) && !isConcertBookedTable(table)
          ).length
        : 0,
    [tables, isConcertBookedTable]
  );

  const mergedCardProps = React.useMemo(
    () => ({
      ...cardProps,
      tableDensity: normalizedTableDensity,
      getTablePrepMeta: tableTimers.getTablePrepMeta,
    }),
    [cardProps, normalizedTableDensity, tableTimers.getTablePrepMeta]
  );

  const handleAreaSelect = React.useCallback(
    (area) => {
      setActiveArea(area);
    },
    [setActiveArea]
  );
  const resolveViewScrollContainer = React.useCallback(() => {
    const nextContainer = findNearestScrollContainer(viewRootRef.current);
    viewScrollContainerRef.current = nextContainer;
    return nextContainer;
  }, []);
  const scrollViewToTop = React.useCallback(() => {
    if (tableGridRef.current?.scrollToTop?.({ behavior: "smooth" })) {
      return;
    }

    const scrollContainer = viewScrollContainerRef.current || resolveViewScrollContainer();
    if (!scrollContainer?.scrollTo) return;
    scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
  }, [resolveViewScrollContainer]);
  const scrollAreaTabIntoView = React.useCallback((area) => {
    const rail = areaTabsRailRef.current;
    const tab = areaTabRefs.current.get(area);
    if (!rail || !tab) return;

    if (window.innerWidth >= 640) return;

    const tabRect = tab.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    const offset =
      tabRect.left -
      railRect.left -
      railRect.width / 2 +
      tabRect.width / 2;

    rail.scrollBy({ left: offset, behavior: "smooth" });
  }, []);
  const handleAreaTabClick = React.useCallback(
    (area) => {
      handleAreaSelect(area);
      scrollViewToTop();
      window.requestAnimationFrame(() => {
        scrollAreaTabIntoView(area);
      });
    },
    [handleAreaSelect, scrollAreaTabIntoView, scrollViewToTop]
  );
  const getAreaTabClassName = React.useCallback(
    (isActive, activeClassName, inactiveClassName) =>
      [
        "group shrink-0 whitespace-nowrap inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[16px] px-3 py-2 text-[12px] font-semibold tracking-[-0.01em] shadow-[0_8px_18px_rgba(15,23,42,0.06)] ring-1 transition duration-200 active:scale-[0.985] sm:min-h-[42px] sm:px-3.5 sm:py-2 sm:text-[13px]",
        isActive ? activeClassName : inactiveClassName,
      ].join(" "),
    []
  );

  const renderAreaTabLabel = React.useCallback((label, count = null, isActive = false) => {
    const hasCount = Number.isFinite(Number(count)) && Number(count) >= 0;
    return (
      <>
        <span className="max-w-[11rem] truncate">{label}</span>
        {hasCount ? (
          <span
            className={[
              "inline-flex min-w-[1.55rem] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold leading-none ring-1 transition",
              isActive
                ? "bg-white/18 text-white ring-white/20"
                : "bg-slate-900/6 text-slate-600 ring-slate-900/6 dark:bg-white/10 dark:text-slate-100 dark:ring-white/10",
            ].join(" ")}
          >
            {Number(count)}
          </span>
        ) : null}
      </>
    );
  }, []);

  const renderAreaFooterTabs = React.useCallback(
    () => (
      <>
        {showStandardAreaTabs ? (
          <>
            <button
              ref={(node) => {
                if (node) areaTabRefs.current.set(AREA_FILTER_ALL, node);
                else areaTabRefs.current.delete(AREA_FILTER_ALL);
              }}
              onClick={() => handleAreaTabClick(AREA_FILTER_ALL)}
              className={getAreaTabClassName(
                activeArea === AREA_FILTER_ALL,
                "border-transparent bg-gradient-to-br from-slate-900 via-indigo-800 to-violet-700 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(79,70,229,0.28)] dark:from-slate-100 dark:via-white dark:to-slate-200 dark:text-slate-900 dark:ring-slate-200/70",
                "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
              )}
            >
              {renderAreaTabLabel(t("All Areas"), null, activeArea === AREA_FILTER_ALL)}
            </button>

            {Object.keys(groupedTables).map((area) => (
              <button
                key={area}
                ref={(node) => {
                  if (node) areaTabRefs.current.set(area, node);
                  else areaTabRefs.current.delete(area);
                }}
                onClick={() => handleAreaTabClick(area)}
                className={getAreaTabClassName(
                  activeArea === area,
                  "border-transparent bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(59,130,246,0.28)]",
                  "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
                )}
              >
                {renderAreaTabLabel(formatAreaLabel(area), null, activeArea === area)}
              </button>
            ))}
            <button
              ref={(node) => {
                if (node) areaTabRefs.current.set(AREA_FILTER_RESERVED, node);
                else areaTabRefs.current.delete(AREA_FILTER_RESERVED);
              }}
              onClick={() => handleAreaTabClick(AREA_FILTER_RESERVED)}
              className={getAreaTabClassName(
                activeArea === AREA_FILTER_RESERVED,
                "border-transparent bg-gradient-to-br from-amber-400 via-amber-500 to-orange-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(245,158,11,0.25)]",
                "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
              )}
            >
              {renderAreaTabLabel(t("Reserved"), reservedTablesCount, activeArea === AREA_FILTER_RESERVED)}
            </button>
            <button
              ref={(node) => {
                if (node) areaTabRefs.current.set(AREA_FILTER_UNPAID, node);
                else areaTabRefs.current.delete(AREA_FILTER_UNPAID);
              }}
              onClick={() => handleAreaTabClick(AREA_FILTER_UNPAID)}
              className={getAreaTabClassName(
                activeArea === AREA_FILTER_UNPAID,
                "border-transparent bg-gradient-to-br from-rose-500 via-red-600 to-red-700 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(225,29,72,0.28)]",
                "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
              )}
            >
              {renderAreaTabLabel(t("Unpaid"), unpaidTablesCount, activeArea === AREA_FILTER_UNPAID)}
            </button>
            <button
              ref={(node) => {
                if (node) areaTabRefs.current.set(AREA_FILTER_PAID, node);
                else areaTabRefs.current.delete(AREA_FILTER_PAID);
              }}
              onClick={() => handleAreaTabClick(AREA_FILTER_PAID)}
              className={getAreaTabClassName(
                activeArea === AREA_FILTER_PAID,
                "border-transparent bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(16,185,129,0.25)]",
                "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
              )}
            >
              {renderAreaTabLabel(t("Paid"), paidTablesCount, activeArea === AREA_FILTER_PAID)}
            </button>
            <button
              ref={(node) => {
                if (node) areaTabRefs.current.set(AREA_FILTER_FREE, node);
                else areaTabRefs.current.delete(AREA_FILTER_FREE);
              }}
              onClick={() => handleAreaTabClick(AREA_FILTER_FREE)}
              className={getAreaTabClassName(
                activeArea === AREA_FILTER_FREE,
                "border-transparent bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(14,165,233,0.25)]",
                "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
              )}
            >
              {renderAreaTabLabel(t("Free"), freeTablesCount, activeArea === AREA_FILTER_FREE)}
            </button>
            {showPacketTab ? (
              <button
                type="button"
                onClick={() => {
                  if (typeof onPacketTabClick === "function") onPacketTabClick();
                }}
                className={getAreaTabClassName(
                  false,
                  "border-transparent bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(59,130,246,0.25)]",
                  "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
                )}
              >
                {renderAreaTabLabel(
                  t("Packet"),
                  Number.isFinite(Number(packetOrdersCount)) && Number(packetOrdersCount) > 0
                    ? Number(packetOrdersCount)
                    : null,
                  false
                )}
              </button>
            ) : null}
          </>
        ) : null}
        {showViewBookingTab ? (
          <button
            ref={(node) => {
              if (node) areaTabRefs.current.set(AREA_FILTER_VIEW_BOOKING, node);
              else areaTabRefs.current.delete(AREA_FILTER_VIEW_BOOKING);
            }}
            onClick={() => handleAreaTabClick(AREA_FILTER_VIEW_BOOKING)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_VIEW_BOOKING,
              "border-transparent bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(139,92,246,0.28)]",
              "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
            )}
          >
            {renderAreaTabLabel(t("View Booking"), rangeBookingCount, activeArea === AREA_FILTER_VIEW_BOOKING)}
          </button>
        ) : null}
        {showSongRequestTab ? (
          <button
            ref={(node) => {
              if (node) areaTabRefs.current.set(AREA_FILTER_SONG_REQUEST, node);
              else areaTabRefs.current.delete(AREA_FILTER_SONG_REQUEST);
            }}
            onClick={() => handleAreaTabClick(AREA_FILTER_SONG_REQUEST)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_SONG_REQUEST,
              "border-transparent bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-600 text-white ring-white/10 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(168,85,247,0.28)]",
              "border-slate-200/80 bg-white/72 text-slate-700 ring-white/70 backdrop-blur-xl hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100 dark:ring-white/5 dark:hover:bg-slate-900/78"
            )}
          >
            {renderAreaTabLabel(
              t("Song Request"),
              Array.isArray(songRequests) ? songRequests.length : 0,
              activeArea === AREA_FILTER_SONG_REQUEST
            )}
          </button>
        ) : null}
        {onLockClick ? (
          <button
            type="button"
            onClick={onLockClick}
            className="shrink-0 whitespace-nowrap inline-flex min-h-[48px] items-center justify-center gap-2 rounded-[20px] border border-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-4 py-3 text-[13px] font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-white/10 transition duration-200 active:scale-[0.985] hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.24)] sm:min-h-[52px] sm:px-5 sm:text-sm dark:border-white/10"
            aria-label={t("Lock", { defaultValue: "Lock" })}
            title={t("Lock", { defaultValue: "Lock" })}
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {t("Lock", { defaultValue: "Lock" })}
          </button>
        ) : null}
      </>
    ),
    [
      activeArea,
      getAreaTabClassName,
      groupedTables,
      handleAreaTabClick,
      onLockClick,
      paidTablesCount,
      packetOrdersCount,
      rangeBookingCount,
      reservedTablesCount,
      showPacketTab,
      showSongRequestTab,
      showStandardAreaTabs,
      showViewBookingTab,
      songRequests,
      t,
      unpaidTablesCount,
      freeTablesCount,
      formatAreaLabel,
      onPacketTabClick,
      renderAreaTabLabel,
    ]
  );

  const renderTable = React.useCallback(
    (table) => <TableCard table={table} {...mergedCardProps} />,
    [mergedCardProps]
  );

  const getTableKey = React.useCallback((table) => table.tableNumber, []);

  React.useEffect(() => {
    resolveViewScrollContainer();
  }, [resolveViewScrollContainer]);

  React.useEffect(() => {
    scrollAreaTabIntoView(activeArea);
  }, [activeArea, scrollAreaTabIntoView]);

  return (
    <React.Profiler id="TableList" onRender={onTableListProfileRender}>
      <div ref={viewRootRef} className="flex w-full flex-col items-center pb-28 sm:pb-32">
        {showRenderCounter && (
          <div className="mb-2 flex w-full justify-end px-4 sm:px-8">
            <RenderCounter label="TableList" value={renderCount} />
          </div>
        )}
      {activeArea === AREA_FILTER_VIEW_BOOKING ? (
        <div className="w-full px-4 pb-4 pt-1 sm:px-6 xl:px-8 2xl:px-10">
          <div className="w-full py-0.5 sm:py-1">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
              <div className="shrink-0 whitespace-nowrap text-base font-semibold text-violet-700">
                {t("View Booking")}
              </div>
              <div className="grid w-full gap-3 lg:grid-cols-2 xl:flex-1 xl:grid-cols-[auto_minmax(320px,0.65fr)_auto] xl:items-center">
                <div
                  className="grid w-full gap-1 sm:max-w-sm"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <input
                    type="date"
                    value={bookingDateFrom}
                    onChange={(event) => setBookingDateFrom(event.target.value)}
                    className="w-full min-w-0 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white sm:w-40"
                  />
                  <input
                    type="date"
                    value={bookingDateTo}
                    onChange={(event) => setBookingDateTo(event.target.value)}
                    className="w-full min-w-0 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white sm:w-40"
                  />
                </div>
                <input
                  type="text"
                  value={bookingSearch}
                  onChange={(event) => setBookingSearch(event.target.value)}
                  placeholder={t("Search by name or phone")}
                  className="w-full min-w-0 rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => onClearBookings?.(filteredBookings, { from: bookingDateFrom, to: bookingDateTo })}
                  disabled={clearingBookings || filteredBookings.length === 0}
                  className="w-full rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 xl:w-auto"
                >
                  {clearingBookings ? t("Clearing...") : t("Clear Bookings")}
                </button>
              </div>
            </div>
            {concertBookingsLoading && !hasAnyViewBookingRows ? (
              <div className="mt-3 text-sm text-gray-500">{t("Loading...")}</div>
            ) : filteredBookings.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5 2xl:grid-cols-4 2xl:gap-6">
                {filteredBookings.map((booking) => {
                  const source = String(booking?.booking_source || "").toLowerCase();
                  const isConcertBooking = source === "concert";
                  const isConcertLikeBooking = isConcertBooking || hasConcertBookingContext(booking);
                  const bookingActionKey = getViewBookingActionKey(booking);
                  const bookingActionPending = bookingActionSubmittingKey === bookingActionKey;
                  const reservationAlreadyConfirmed = isReservationConfirmedForCheckin(booking);
                  const reservationNotes = String(
                    booking?.reservation_notes ?? booking?.reservationNotes ?? ""
                  ).trim();
                  const freeConcertTitle = reservationNotes.toLowerCase().startsWith("concert:")
                    ? reservationNotes.slice(8).trim()
                    : reservationNotes;
                  const customerPhone = String(
                    booking.customer_phone ?? booking.customerPhone ?? ""
                  ).trim();
                  const customerPhoneHref = customerPhone.replace(/[^\d+]/g, "");
                  const bookingGuests = Number(
                    booking.guests_count ??
                      booking.guestsCount ??
                      booking.reservation_clients ??
                      0
                  );
                  const hasGuestComposition =
                    hasBookingGuestCompositionValue(
                      booking.male_guests_count ??
                        booking.maleGuestsCount ??
                        booking.reservation_men ??
                        booking.reservationMen
                    ) ||
                    hasBookingGuestCompositionValue(
                      booking.female_guests_count ??
                        booking.femaleGuestsCount ??
                        booking.reservation_women ??
                        booking.reservationWomen
                    );
                  const bookingMenCount = hasGuestComposition
                    ? Number(
                        booking.male_guests_count ??
                          booking.maleGuestsCount ??
                          booking.reservation_men ??
                          booking.reservationMen ??
                          0
                      )
                    : null;
                  const bookingWomenCount = hasGuestComposition
                    ? Number(
                        booking.female_guests_count ??
                          booking.femaleGuestsCount ??
                          booking.reservation_women ??
                          booking.reservationWomen ??
                          0
                      )
                    : null;
                  const guestsLabel = Number.isFinite(bookingGuests) && bookingGuests > 0
                    ? bookingGuests
                    : Number(booking.quantity || 0) || 0;
                  const bookingUnitPrice = Number(
                    booking.unit_price ?? booking.unitPrice ?? 0
                  );
                  const bookingTotal = Number(
                    booking.total_amount ?? booking.totalAmount ?? 0
                  );
                  const normalizedBookingType = String(
                    booking.booking_type ?? booking.bookingType ?? ""
                  ).toLowerCase();
                  const derivedTotal =
                    normalizedBookingType === "table" &&
                    Number.isFinite(bookingUnitPrice) &&
                    bookingUnitPrice > 0 &&
                    Number.isFinite(guestsLabel) &&
                    guestsLabel > 0
                      ? bookingUnitPrice * guestsLabel
                      : bookingTotal;
                  const totalForDisplay = Number.isFinite(derivedTotal)
                    ? derivedTotal
                    : bookingTotal;
                  const totalLabel = Number.isFinite(totalForDisplay)
                    ? totalForDisplay.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "0.00";
                  const reservationStatus = String(
                    booking.status ?? booking.reservation_status ?? booking.reservationStatus ?? ""
                  )
                    .trim()
                    .toLowerCase();
                  const reservationLifecycleStatus = String(
                    booking?.reservation_order_status ??
                      booking?.reservationOrderStatus ??
                      booking?.reservation_status ??
                      booking?.reservationStatus ??
                      ""
                  )
                    .trim()
                    .toLowerCase();
                  const concertPaymentStatusLabel = String(
                    booking?.payment_status ??
                      booking?.paymentStatus ??
                      ""
                  )
                    .trim()
                    .toLowerCase();
                  const isFreeConcertBooking =
                    isConcertLikeBooking &&
                    Number(totalForDisplay || 0) <= 0 &&
                    Number(bookingUnitPrice || 0) <= 0;
                  const bookingStatusLabel = isConcertLikeBooking
                    ? (
                        isFreeConcertBooking
                          ? reservationLifecycleStatus || reservationStatus
                          : concertPaymentStatusLabel || reservationLifecycleStatus || reservationStatus
                      )
                    : reservationStatus;
                    const concertPaymentStatus = String(
                      booking?.payment_status ?? booking?.paymentStatus ?? ""
                    )
                      .trim()
                      .toLowerCase();
                    const concertBookingStatus = String(
                      booking?.booking_status ?? booking?.bookingStatus ?? booking?.status ?? ""
                    )
                      .trim()
                      .toLowerCase();
                    const reservationOrderStatus = String(
                      booking?.reservation_order_status ??
                        booking?.reservationOrderStatus ??
                        booking?.reservation_status ??
                        booking?.reservationStatus ??
                        booking?.status ??
                        ""
                    )
                      .trim()
                      .toLowerCase();
                    const bookingLifecycleStatus = isConcertBooking
                      ? ["checked_in", "checked_out"].includes(reservationOrderStatus)
                        ? reservationOrderStatus
                        : concertPaymentStatus || concertBookingStatus || reservationOrderStatus
                      : reservationOrderStatus;
                  const isCheckedInBooking = bookingLifecycleStatus === "checked_in";
                  const isCheckedOutBooking = bookingLifecycleStatus === "checked_out";
                  const isCancelledBooking =
                    ["cancelled", "canceled", "deleted", "void"].includes(bookingLifecycleStatus) ||
                    ["cancelled", "canceled"].includes(
                      String(booking?.payment_status ?? booking?.paymentStatus ?? "")
                        .trim()
                        .toLowerCase()
                    );
                  const needsBookingConfirmation =
                    bookingLifecycleStatus !== "confirmed" &&
                    bookingLifecycleStatus !== "checked_in" &&
                    bookingLifecycleStatus !== "checked_out";
                  const bookingActionContext = resolveBookingActionContext(booking);
                  const bookingTable = bookingActionContext?.table || null;
                  const bookingOrder = bookingTable?.order || null;
                  const bookingItems = Array.isArray(bookingOrder?.items) ? bookingOrder.items : [];
                  const bookingSuborders = Array.isArray(bookingOrder?.suborders)
                    ? bookingOrder.suborders
                    : [];
                  const bookingTableNumber = Number(
                    bookingActionContext?.tableNumber ??
                      bookingTable?.tableNumber ??
                      bookingTable?.table_number ??
                      booking?.reserved_table_number ??
                      booking?.reservedTableNumber ??
                      booking?.table_number ??
                      booking?.tableNumber
                  );
                  const waiterCall =
                    Number.isFinite(bookingTableNumber) && bookingTableNumber > 0
                      ? cardProps?.waiterCallsByTable?.[String(bookingTableNumber)] || null
                      : null;
                  const isCallingWaiter = Boolean(waiterCall);
                  const waiterCallType = getWaiterCallType(waiterCall);
                  const waiterCallLabel = waiterCallType === "bill"
                    ? t("Bill")
                    : waiterCallType === "reorder"
                      ? t("Reorder")
                      : t("Calling");
                  const waiterResolveLabel = waiterCallType === "bill"
                    ? t("Bill")
                    : t("waiter.handled");
                  const bookingHasOrderItems = bookingItems.length > 0;
                  const bookingHasSuborderItems = bookingSuborders.some(
                    (suborder) => Array.isArray(suborder?.items) && suborder.items.length > 0
                  );
                  const bookingHasReceiptHistory =
                    bookingOrder?.receipt_id != null ||
                    bookingOrder?.receiptId != null ||
                    (Array.isArray(bookingOrder?.receiptMethods) &&
                      bookingOrder.receiptMethods.length > 0);
                  const bookingPaymentStatus = normalizeOrderStatus(
                    bookingOrder?.payment_status ?? bookingOrder?.paymentStatus
                  );
                  const bookingHasOrderActivity =
                    bookingHasOrderItems ||
                    bookingHasSuborderItems ||
                    bookingHasReceiptHistory ||
                    Number(bookingOrder?.total || 0) > 0 ||
                    bookingPaymentStatus === "paid" ||
                    Boolean(bookingTable?.isFullyPaid);
                  const hasBookingTableTarget =
                    Number.isFinite(Number(bookingActionContext?.tableNumber)) &&
                    Number(bookingActionContext?.tableNumber) > 0;
                  const canShowBookingAction =
                    !isCancelledBooking && !isCheckedOutBooking && hasBookingTableTarget;
                  const shouldDisableBookingCheckin =
                    bookingActionPending ||
                    needsBookingConfirmation ||
                    (!isCheckedInBooking && bookingHasOrderActivity && !isConcertLikeBooking);
                  const sourceLabel = isConcertLikeBooking
                    ? booking.event_title || booking.artist_name || freeConcertTitle || t("Concert")
                    : t("Reservation");
                  const bookingDateLabel = String(
                    booking.event_date || booking.reservation_date || ""
                  )
                    .trim()
                    .slice(0, 10);
                  const bookingTimeLabel = String(
                    booking.event_time || booking.reservation_time || ""
                  )
                    .trim()
                    .slice(0, 5);
                  const tableLabel =
                    booking.reserved_table_number || booking.table_number || null;
                  const detailLabel = isConcertLikeBooking
                    ? `${booking.booking_type || t("Reservation")} • ${
                        Number(booking.quantity || 0) > 0
                          ? booking.quantity
                          : `${t("Guests")} ${guestsLabel}`
                      }`
                    : `${t("Reserved")} • ${t("Guests")} ${guestsLabel}`;
                  const bookingKey =
                    booking.booking_source === "reservation"
                      ? `reservation-${
                          booking.id ??
                          booking.order_id ??
                          booking.orderId ??
                          `${booking.table_number ?? booking.tableNumber ?? "x"}-${
                            booking.reservation_date ?? booking.reservationDate ?? "na"
                          }-${booking.reservation_time ?? booking.reservationTime ?? "na"}`
                        }`
                      : `concert-${booking.id}`;

                  return (
                    <div
                      key={bookingKey}
                      className={`flex h-full min-h-[280px] flex-col rounded-3xl border bg-white/90 p-4 shadow-lg sm:p-5 ${
                        isCallingWaiter
                          ? "border-rose-300 ring-2 ring-rose-500/70"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {sourceLabel}
                          </div>
                          <div className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                            {booking.customer_name || t("Guest")}
                          </div>
                          {customerPhone ? (
                            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-600">
                              <span>{customerPhone}</span>
                              <a
                                href={`tel:${customerPhoneHref || customerPhone}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                                title={t("Call")}
                                aria-label={`${t("Call")} ${customerPhone}`}
                              >
                                <Phone className="h-4 w-4" />
                              </a>
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {t("Table")}
                          </div>
                          <div className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">
                            {tableLabel || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getBookingStatusToneClass(
                            bookingStatusLabel
                          )}`}
                        >
                          {t(bookingStatusLabel || "pending")}
                        </span>
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          {detailLabel}
                        </span>
                        {isConcertBooking ? (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {t("Total")} {totalLabel}
                          </span>
                        ) : null}
                        {isCallingWaiter ? (
                          <span className="inline-flex animate-pulse rounded-full border border-rose-200 bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
                            {waiterCallLabel}
                          </span>
                        ) : null}
                        {booking.ticket_type_name ? (
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {booking.ticket_type_name}
                          </span>
                        ) : null}
                      </div>

                      {(bookingDateLabel || bookingTimeLabel) ? (
                        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                          <div>
                            {bookingDateLabel}
                            {bookingTimeLabel ? ` • ${bookingTimeLabel}` : ""}
                          </div>
                        </div>
                      ) : null}

                      {hasGuestComposition ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {`${t("Men")} ${Number.isFinite(bookingMenCount) ? bookingMenCount : 0}`}
                          </span>
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                            {`${t("Women")} ${Number.isFinite(bookingWomenCount) ? bookingWomenCount : 0}`}
                          </span>
                        </div>
                      ) : null}

                      {isCallingWaiter &&
                      typeof cardProps?.handleResolveWaiterCall === "function" &&
                      Number.isFinite(bookingTableNumber) &&
                      bookingTableNumber > 0 ? (
                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => cardProps.handleResolveWaiterCall(bookingTableNumber)}
                            className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700"
                          >
                            {waiterResolveLabel}
                          </button>
                        </div>
                      ) : null}

                      <div className="mt-auto flex gap-2 pt-5">
                        <button
                          type="button"
                          onClick={() =>
                            booking.booking_source === "concert"
                              ? onConcertBookingUpdateStatus?.(booking.id, "confirmed")
                              : onReservationBookingUpdateStatus?.(booking, "confirmed")
                          }
                          disabled={
                            booking.booking_source === "concert"
                              ? concertBookingUpdatingId === booking.id ||
                                String(booking.payment_status || "").toLowerCase() === "confirmed"
                              : reservationAlreadyConfirmed ||
                                reservationBookingUpdatingKey ===
                                  String(
                                    booking.id ??
                                      booking.order_id ??
                                      booking.orderId ??
                                      booking.table_number ??
                                      booking.tableNumber
                                  )
                          }
                          className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t("Confirm")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            booking.booking_source === "concert"
                              ? onConcertBookingUpdateStatus?.(booking.id, "cancelled")
                              : onReservationBookingUpdateStatus?.(booking, "cancelled")
                          }
                          disabled={
                            booking.booking_source === "concert"
                              ? concertBookingUpdatingId === booking.id ||
                                String(booking.payment_status || "").toLowerCase() === "cancelled"
                              : reservationBookingUpdatingKey ===
                                String(
                                  booking.id ??
                                    booking.order_id ??
                                    booking.orderId ??
                                    booking.table_number ??
                                    booking.tableNumber
                                )
                          }
                          className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl bg-rose-600 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t("Cancel")}
                        </button>
                      </div>
                      {canShowBookingAction ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              isCheckedInBooking
                                ? void handleBookingCheckout(booking)
                                : void handleBookingCheckin(booking)
                            }
                            disabled={isCheckedInBooking ? bookingActionPending : shouldDisableBookingCheckin}
                            className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {bookingActionPending
                              ? t("Loading...")
                              : isCheckedInBooking
                                ? t("Check Out")
                                : t("Checkin")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">
                {normalizedBookingSearch ? t("No matching bookings found") : t("No bookings yet.")}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeArea === AREA_FILTER_SONG_REQUEST ? (
        <div className="w-full max-w-7xl px-4 pb-4 sm:px-8">
          <SongRequestsAdminTab
            t={t}
            requests={songRequests}
            tables={tables}
            loading={songRequestsLoading}
            updatingId={songRequestUpdatingId}
            onApprove={onApproveSongRequest}
            onComplete={onCompleteSongRequest}
            onCancel={onCancelSongRequest}
          />
        </div>
      ) : null}

      {activeArea !== AREA_FILTER_VIEW_BOOKING && activeArea !== AREA_FILTER_SONG_REQUEST ? (
        <VirtualTablesGrid
          ref={tableGridRef}
          items={visibleTables}
          renderItem={renderTable}
          itemKey={getTableKey}
          estimatedItemHeight={tableDensityLayout.estimatedItemHeight}
          overscan={6}
          className={tableDensityLayout.gridWrapperClassName}
          minColumnWidth={tableDensityLayout.minColumnWidth}
          maxColumns={tableDensityLayout.maxColumns}
          columnGap={tableDensityLayout.columnGap}
          rowGap={tableDensityLayout.rowGap}
          containerMaxWidth={tableDensityLayout.containerMaxWidth}
        />
      ) : null}
      {showAreaTabs ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 p-0">
          <div className="pointer-events-auto w-full px-2 pb-[calc(6px+env(safe-area-inset-bottom))] pt-2 sm:px-3">
            <div className="mx-auto w-full max-w-[1480px] overflow-hidden rounded-[22px] border border-slate-200/70 bg-white/94 shadow-[0_-12px_28px_rgba(15,23,42,0.1)] ring-1 ring-slate-200/50 sm:border-white/60 sm:bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(248,250,252,0.8))] sm:backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/94 dark:ring-slate-800/70 dark:sm:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.8))]">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-6 bg-gradient-to-r from-white via-white/75 to-transparent sm:block dark:from-slate-950 dark:via-slate-950/75" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-6 bg-gradient-to-l from-white via-white/75 to-transparent sm:block dark:from-slate-950 dark:via-slate-950/75" />
                <div
                  ref={areaTabsRailRef}
                  className="flex flex-nowrap items-center justify-start gap-1.5 overflow-x-auto scroll-smooth scrollbar-hide px-2 py-2 sm:justify-center sm:px-3"
                >
                  {renderAreaFooterTabs()}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </React.Profiler>
  );
}

const areTablesViewPropsEqual = (prevProps, nextProps) => {
  const isEqual =
    prevProps.showAreaTabs === nextProps.showAreaTabs &&
    prevProps.showStandardAreaTabs === nextProps.showStandardAreaTabs &&
    prevProps.activeArea === nextProps.activeArea &&
    prevProps.setActiveArea === nextProps.setActiveArea &&
    prevProps.groupedTables === nextProps.groupedTables &&
    prevProps.tables === nextProps.tables &&
    prevProps.ordersByTable === nextProps.ordersByTable &&
    prevProps.productPrepById === nextProps.productPrepById &&
    prevProps.formatAreaLabel === nextProps.formatAreaLabel &&
    prevProps.cardProps === nextProps.cardProps &&
    prevProps.t === nextProps.t &&
    prevProps.showViewBookingTab === nextProps.showViewBookingTab &&
    prevProps.concertBookings === nextProps.concertBookings &&
    prevProps.reservationBookings === nextProps.reservationBookings &&
    prevProps.concertBookingsLoading === nextProps.concertBookingsLoading &&
    prevProps.concertBookingUpdatingId === nextProps.concertBookingUpdatingId &&
    prevProps.reservationBookingUpdatingKey === nextProps.reservationBookingUpdatingKey &&
    prevProps.onConcertBookingUpdateStatus === nextProps.onConcertBookingUpdateStatus &&
    prevProps.onReservationBookingUpdateStatus === nextProps.onReservationBookingUpdateStatus &&
    prevProps.onClearBookings === nextProps.onClearBookings &&
    prevProps.clearingBookings === nextProps.clearingBookings &&
    prevProps.showSongRequestTab === nextProps.showSongRequestTab &&
    prevProps.showPacketTab === nextProps.showPacketTab &&
    prevProps.onPacketTabClick === nextProps.onPacketTabClick &&
    prevProps.packetOrdersCount === nextProps.packetOrdersCount &&
    prevProps.songRequests === nextProps.songRequests &&
    prevProps.songRequestsLoading === nextProps.songRequestsLoading &&
    prevProps.songRequestUpdatingId === nextProps.songRequestUpdatingId &&
    prevProps.onApproveSongRequest === nextProps.onApproveSongRequest &&
    prevProps.onCompleteSongRequest === nextProps.onCompleteSongRequest &&
    prevProps.onCancelSongRequest === nextProps.onCancelSongRequest &&
    prevProps.tableDensity === nextProps.tableDensity;

  if (!isEqual) {
    logMemoDiff({
      component: "TableList",
      prevProps,
      nextProps,
      watchedProps: [
        "showAreaTabs",
        "showStandardAreaTabs",
        "activeArea",
        "setActiveArea",
        "groupedTables",
        "tables",
        "ordersByTable",
        "productPrepById",
        "formatAreaLabel",
        "cardProps",
        "t",
        "showViewBookingTab",
        "concertBookings",
        "reservationBookings",
        "concertBookingsLoading",
        "concertBookingUpdatingId",
        "reservationBookingUpdatingKey",
        "onConcertBookingUpdateStatus",
        "onReservationBookingUpdateStatus",
        "onClearBookings",
        "clearingBookings",
        "showSongRequestTab",
        "showPacketTab",
        "onPacketTabClick",
        "packetOrdersCount",
        "songRequests",
        "songRequestsLoading",
        "songRequestUpdatingId",
        "onApproveSongRequest",
        "onCompleteSongRequest",
        "onCancelSongRequest",
        "tableDensity",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TablesView, areTablesViewPropsEqual);
