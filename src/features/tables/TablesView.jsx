import React from "react";
import { Phone } from "lucide-react";
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
const formatDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeBookingDate = (booking) => {
  const source = String(booking?.booking_source || "").toLowerCase();
  const isConcertLikeBooking = source === "concert" || hasConcertBookingContext(booking);
  const raw = String(
    (isConcertLikeBooking
      ? booking?.booking_date ??
        booking?.bookingDate ??
        booking?.created_at ??
        booking?.createdAt
      : booking?.reservation_date ??
        booking?.reservationDate ??
        booking?.booking_date ??
        booking?.bookingDate ??
        booking?.created_at ??
        booking?.createdAt ??
        booking?.event_date ??
        booking?.eventDate) ??
      ""
  ).trim();
  if (!raw) return "";
  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch?.[1]) return ymdMatch[1];
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? formatDateInputValue(parsed) : "";
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
      booking?.reservationId ??
      booking?.id
  );

  if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
    return `booking-order:${reservationOrderId}`;
  }

  if (!concertLike) return "";

  const concertBookingId = Number(
    booking?.concert_booking_id ??
      booking?.concertBookingId ??
      booking?.id ??
      booking?.booking_id ??
      booking?.bookingId
  );
  if (Number.isFinite(concertBookingId) && concertBookingId > 0) {
    return `concert-booking:${concertBookingId}`;
  }
  return getConcertDuplicateFallbackKey(booking);
};

const mergeBookingRecords = (preferred = {}, secondary = {}) => {
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
  };
};

const pickPreferredBooking = (current = {}, candidate = {}) => {
  const currentHasComposition = bookingHasGuestComposition(current);
  const candidateHasComposition = bookingHasGuestComposition(candidate);
  if (candidateHasComposition !== currentHasComposition) {
    return candidateHasComposition ? candidate : current;
  }

  const currentSource = String(current?.booking_source || "").toLowerCase();
  const candidateSource = String(candidate?.booking_source || "").toLowerCase();
  if (candidateSource !== currentSource) {
    if (candidateSource === "concert") return candidate;
    if (currentSource === "concert") return current;
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
  songRequests = [],
  songRequestsLoading = false,
  songRequestUpdatingId = null,
  onApproveSongRequest,
  onCompleteSongRequest,
  onCancelSongRequest,
  tableDensity = "comfortable",
}) {
  const renderCount = useRenderCount("TableList", { logEvery: 1 });
  const onTableListProfileRender = React.useMemo(() => createProfilerOnRender("TableList"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const areaTabsRailRef = React.useRef(null);
  const areaTabRefs = React.useRef(new Map());
  const tableTimers = useTableTimers({ ordersByTable, productPrepById });
  const [bookingSearch, setBookingSearch] = React.useState("");
  const [bookingDateFrom, setBookingDateFrom] = React.useState(() => formatDateInputValue(new Date()));
  const [bookingDateTo, setBookingDateTo] = React.useState(() => formatDateInputValue(new Date()));
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
    const status = String(fallback?.status || "").toLowerCase();
    const isTerminal =
      status === "closed" ||
      status === "completed" ||
      status === "checked_out" ||
      status === "cancelled" ||
      status === "canceled" ||
      status === "deleted" ||
      status === "void";
    return !isTerminal;
  }, []);
  const concertBookedTableNumbers = React.useMemo(() => {
    const booked = new Set();
    if (!Array.isArray(concertBookings)) return booked;
    concertBookings.forEach((booking) => {
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

    return [...deduped, ...Array.from(concertLikeByGroup.values())];
  }, [concertBookings, reservationBookings]);
  const rangeBookingCount = React.useMemo(() => {
    return combinedBookings.filter((booking) => {
      const bookingDate = normalizeBookingDate(booking);
      if (!bookingDate) return false;
      if (bookingDateFrom && bookingDate < bookingDateFrom) return false;
      if (bookingDateTo && bookingDate > bookingDateTo) return false;
      return true;
    }).length;
  }, [bookingDateFrom, bookingDateTo, combinedBookings]);
  const normalizedBookingSearch = bookingSearch.trim().toLowerCase();
  const filteredBookings = React.useMemo(() => {
    return combinedBookings.filter((booking) => {
      const bookingDate = normalizeBookingDate(booking);
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
        booking?.order_id ??
          booking?.orderId ??
          booking?.reservation_order_id ??
          booking?.reservationOrderId
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
      window.requestAnimationFrame(() => {
        scrollAreaTabIntoView(area);
      });
    },
    [handleAreaSelect, scrollAreaTabIntoView]
  );
  const getAreaTabClassName = React.useCallback(
    (isActive, activeClassName, inactiveClassName) =>
      [
        "shrink-0 whitespace-nowrap px-5 py-2 rounded-full font-semibold shadow transition-all duration-150 text-xs",
        isActive ? activeClassName : inactiveClassName,
      ].join(" "),
    []
  );

  const renderTable = React.useCallback(
    (table) => <TableCard table={table} {...mergedCardProps} />,
    [mergedCardProps]
  );

  const getTableKey = React.useCallback((table) => table.tableNumber, []);

  React.useEffect(() => {
    scrollAreaTabIntoView(activeArea);
  }, [activeArea, scrollAreaTabIntoView]);

  return (
    <React.Profiler id="TableList" onRender={onTableListProfileRender}>
      <div className="w-full flex flex-col items-center">
        {showRenderCounter && (
          <div className="mb-2 flex w-full justify-end px-4 sm:px-8">
            <RenderCounter label="TableList" value={renderCount} />
          </div>
        )}
      {showAreaTabs && (
        <div className="mt-4 mb-8 w-full px-4 sm:mb-10 sm:px-8">
          <div
            ref={areaTabsRailRef}
            className="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide px-0.5 sm:flex-wrap sm:justify-center sm:overflow-visible"
          >
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
                  "bg-indigo-600 text-white scale-[1.03] shadow-lg",
                  "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
                )}
              >
                {t("All Areas")}
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
                    "bg-blue-600 text-white scale-[1.03] shadow-lg",
                    "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50"
                  )}
                >
                  {area === "Hall"
                    ? ""
                    : area === "Main Hall"
                    ? ""
                    : area === "Terrace"
                    ? ""
                    : area === "Garden"
                    ? ""
                    : area === "VIP"
                    ? ""
                  : ""}{" "}
                  {formatAreaLabel(area)}
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
                  "bg-amber-600 text-white scale-[1.03] shadow-lg",
                  "bg-white text-gray-700 border border-gray-300 hover:bg-amber-50"
                )}
              >
                {t("Reserved")} ({reservedTablesCount})
              </button>
              <button
                ref={(node) => {
                  if (node) areaTabRefs.current.set(AREA_FILTER_UNPAID, node);
                  else areaTabRefs.current.delete(AREA_FILTER_UNPAID);
                }}
                onClick={() => handleAreaTabClick(AREA_FILTER_UNPAID)}
                className={getAreaTabClassName(
                  activeArea === AREA_FILTER_UNPAID,
                  "bg-red-600 text-white scale-[1.03] shadow-lg",
                  "bg-white text-gray-700 border border-gray-300 hover:bg-red-50"
                )}
              >
                {t("Unpaid")} ({unpaidTablesCount})
              </button>
              <button
                ref={(node) => {
                  if (node) areaTabRefs.current.set(AREA_FILTER_PAID, node);
                  else areaTabRefs.current.delete(AREA_FILTER_PAID);
                }}
                onClick={() => handleAreaTabClick(AREA_FILTER_PAID)}
                className={getAreaTabClassName(
                  activeArea === AREA_FILTER_PAID,
                  "bg-emerald-600 text-white scale-[1.03] shadow-lg",
                  "bg-white text-gray-700 border border-gray-300 hover:bg-emerald-50"
                )}
              >
                {t("Paid")} ({paidTablesCount})
              </button>
              <button
                ref={(node) => {
                  if (node) areaTabRefs.current.set(AREA_FILTER_FREE, node);
                  else areaTabRefs.current.delete(AREA_FILTER_FREE);
                }}
                onClick={() => handleAreaTabClick(AREA_FILTER_FREE)}
                className={getAreaTabClassName(
                  activeArea === AREA_FILTER_FREE,
                  "bg-sky-600 text-white scale-[1.03] shadow-lg",
                  "bg-white text-gray-700 border border-gray-300 hover:bg-sky-50"
                )}
              >
                {t("Free")} ({freeTablesCount})
              </button>
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
                "bg-violet-600 text-white scale-[1.03] shadow-lg",
                "bg-white text-gray-700 border border-gray-300 hover:bg-violet-50"
              )}
            >
              {t("View Booking")} ({rangeBookingCount})
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
                "bg-fuchsia-600 text-white scale-[1.03] shadow-lg",
                "bg-white text-gray-700 border border-gray-300 hover:bg-fuchsia-50"
              )}
            >
              {t("Song Request")} ({Array.isArray(songRequests) ? songRequests.length : 0})
            </button>
          ) : null}
          </div>
        </div>
      )}

      {activeArea === AREA_FILTER_VIEW_BOOKING ? (
        <div className="w-full max-w-6xl px-4 sm:px-8 pb-4">
          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-base font-semibold text-violet-700">{t("View Booking")}</div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <input
                  type="date"
                  value={bookingDateFrom}
                  onChange={(event) => setBookingDateFrom(event.target.value)}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white sm:w-40"
                />
                <input
                  type="date"
                  value={bookingDateTo}
                  onChange={(event) => setBookingDateTo(event.target.value)}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white sm:w-40"
                />
                <input
                  type="text"
                  value={bookingSearch}
                  onChange={(event) => setBookingSearch(event.target.value)}
                  placeholder={t("Search by name or phone")}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white sm:w-80"
                />
                <button
                  type="button"
                  onClick={() => onClearBookings?.(filteredBookings, { from: bookingDateFrom, to: bookingDateTo })}
                  disabled={clearingBookings || filteredBookings.length === 0}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {clearingBookings ? t("Clearing...") : t("Clear Bookings")}
                </button>
              </div>
            </div>
            {concertBookingsLoading && !hasAnyViewBookingRows ? (
              <div className="mt-3 text-sm text-gray-500">{t("Loading...")}</div>
            ) : filteredBookings.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
                  const bookingStatusLabel = isConcertBooking
                    ? String(booking.payment_status || "").trim().toLowerCase()
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
                      className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {sourceLabel}
                          </div>
                          <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
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
                          <div className="mt-1 text-2xl font-bold text-slate-900">
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

                      <div className="mt-5 flex gap-2">
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
        <div className="w-full max-w-7xl px-4 sm:px-8 pb-4">
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
