import React from "react";
import { useTableTimers } from "./hooks/useTableTimers";
import TableCard from "./TableCard";
import VirtualTablesGrid from "./VirtualTablesGrid";
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

const AREA_FILTER_ALL = "ALL";
const AREA_FILTER_RESERVED = "__RESERVED__";
const AREA_FILTER_UNPAID = "__UNPAID__";
const AREA_FILTER_PAID = "__PAID__";
const AREA_FILTER_FREE = "__FREE__";
const AREA_FILTER_VIEW_BOOKING = "__VIEW_BOOKING__";
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

function TablesView({
  showAreaTabs,
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
}) {
  const renderCount = useRenderCount("TableList", { logEvery: 1 });
  const onTableListProfileRender = React.useMemo(() => createProfilerOnRender("TableList"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const tableTimers = useTableTimers({ ordersByTable, productPrepById });
  const [bookingSearch, setBookingSearch] = React.useState("");
  const [bookingDateFrom, setBookingDateFrom] = React.useState(() => formatDateInputValue(new Date()));
  const [bookingDateTo, setBookingDateTo] = React.useState(() => formatDateInputValue(new Date()));
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
    return [...concertRows, ...reservationRows];
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
  const isConcertBookedTable = React.useCallback(
    (table) => {
      const tableNumber = Number(table?.tableNumber);
      return Number.isFinite(tableNumber) && concertBookedTableNumbers.has(tableNumber);
    },
    [concertBookedTableNumbers]
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
          return allTables.filter(
            (table) => Boolean(table?.hasUnpaidItems) && !Boolean(table?.isFreeTable)
          );
        }
        if (activeArea === AREA_FILTER_PAID) {
          return allTables.filter(
            (table) => Boolean(table?.isFullyPaid) && !Boolean(table?.isFreeTable)
          );
        }
        if (activeArea === AREA_FILTER_FREE) {
          return allTables.filter(
            (table) => Boolean(table?.isFreeTable) && !isConcertBookedTable(table)
          );
        }
        if (activeArea === AREA_FILTER_VIEW_BOOKING) {
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
        ? tables.filter((table) => Boolean(table?.hasUnpaidItems) && !Boolean(table?.isFreeTable))
            .length
        : 0,
    [tables]
  );
  const paidTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter((table) => Boolean(table?.isFullyPaid) && !Boolean(table?.isFreeTable))
            .length
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
      getTablePrepMeta: tableTimers.getTablePrepMeta,
    }),
    [cardProps, tableTimers.getTablePrepMeta]
  );

  const handleAreaSelect = React.useCallback(
    (area) => {
      setActiveArea(area);
    },
    [setActiveArea]
  );
  const getAreaTabClassName = React.useCallback(
    (isActive, activeClassName, inactiveClassName) =>
      [
        "px-5 py-2 rounded-full font-semibold shadow transition-all duration-150 text-xs",
        isActive ? activeClassName : inactiveClassName,
      ].join(" "),
    []
  );

  const renderTable = React.useCallback(
    (table) => <TableCard table={table} {...mergedCardProps} />,
    [mergedCardProps]
  );

  const getTableKey = React.useCallback((table) => table.tableNumber, []);

  return (
    <React.Profiler id="TableList" onRender={onTableListProfileRender}>
      <div className="w-full flex flex-col items-center">
        {showRenderCounter && (
          <div className="mb-2 flex w-full justify-end px-4 sm:px-8">
            <RenderCounter label="TableList" value={renderCount} />
          </div>
        )}
      {showAreaTabs && (
        <div className="flex justify-center gap-3 flex-wrap mt-4 mb-10">
          <button
            onClick={() => handleAreaSelect(AREA_FILTER_ALL)}
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
              onClick={() => handleAreaSelect(area)}
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
            onClick={() => handleAreaSelect(AREA_FILTER_RESERVED)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_RESERVED,
              "bg-amber-600 text-white scale-[1.03] shadow-lg",
              "bg-white text-gray-700 border border-gray-300 hover:bg-amber-50"
            )}
          >
            {t("Reserved")} ({reservedTablesCount})
          </button>
          <button
            onClick={() => handleAreaSelect(AREA_FILTER_UNPAID)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_UNPAID,
              "bg-red-600 text-white scale-[1.03] shadow-lg",
              "bg-white text-gray-700 border border-gray-300 hover:bg-red-50"
            )}
          >
            {t("Unpaid")} ({unpaidTablesCount})
          </button>
          <button
            onClick={() => handleAreaSelect(AREA_FILTER_PAID)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_PAID,
              "bg-emerald-600 text-white scale-[1.03] shadow-lg",
              "bg-white text-gray-700 border border-gray-300 hover:bg-emerald-50"
            )}
          >
            {t("Paid")} ({paidTablesCount})
          </button>
          <button
            onClick={() => handleAreaSelect(AREA_FILTER_FREE)}
            className={getAreaTabClassName(
              activeArea === AREA_FILTER_FREE,
              "bg-sky-600 text-white scale-[1.03] shadow-lg",
              "bg-white text-gray-700 border border-gray-300 hover:bg-sky-50"
            )}
          >
            {t("Free")} ({freeTablesCount})
          </button>
          {showViewBookingTab ? (
            <button
              onClick={() => handleAreaSelect(AREA_FILTER_VIEW_BOOKING)}
            className={getAreaTabClassName(
                activeArea === AREA_FILTER_VIEW_BOOKING,
                "bg-violet-600 text-white scale-[1.03] shadow-lg",
                "bg-white text-gray-700 border border-gray-300 hover:bg-violet-50"
              )}
            >
              {t("View Booking")} ({rangeBookingCount})
            </button>
          ) : null}
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
            {concertBookingsLoading ? (
              <div className="mt-3 text-sm text-gray-500">{t("Loading...")}</div>
            ) : filteredBookings.length > 0 ? (
              <div className="mt-3 space-y-2">
                {filteredBookings.map((booking) => {
                  const source = String(booking?.booking_source || "").toLowerCase();
                  const isConcertBooking = source === "concert";
                  const isConcertLikeBooking = isConcertBooking || hasConcertBookingContext(booking);
                  const reservationAlreadyConfirmed = isReservationConfirmedForCheckin(booking);
                  const reservationNotes = String(
                    booking?.reservation_notes ?? booking?.reservationNotes ?? ""
                  ).trim();
                  const freeConcertTitle = reservationNotes.toLowerCase().startsWith("concert:")
                    ? reservationNotes.slice(8).trim()
                    : reservationNotes;

                  return (
                  <div
                    key={
                      booking.booking_source === "reservation"
                        ? `reservation-${
                            booking.id ??
                            booking.order_id ??
                            booking.orderId ??
                            `${booking.table_number ?? booking.tableNumber ?? "x"}-${
                              booking.reservation_date ?? booking.reservationDate ?? "na"
                            }-${booking.reservation_time ?? booking.reservationTime ?? "na"}`
                          }`
                        : `concert-${booking.id}`
                    }
                    className="rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-[240px]">
                      {(() => {
                        const bookingGuests = Number(
                          booking.guests_count ??
                            booking.guestsCount ??
                            booking.reservation_clients ??
                            0
                        );
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
                        return (
                          <>
                      <div className="text-sm font-semibold text-slate-900">
                        {booking.customer_name || "Guest"}
                        {booking.customer_phone ? ` • ${booking.customer_phone}` : ""}
                      </div>
                      <div className="text-xs text-gray-600">
                        {isConcertLikeBooking
                          ? (booking.event_title || booking.artist_name || freeConcertTitle || t("Concert"))
                          : t("Reservation")}
                        {(booking.event_date || booking.reservation_date)
                          ? ` • ${String(booking.event_date || booking.reservation_date).slice(0, 10)}`
                          : ""}
                        {(booking.event_time || booking.reservation_time)
                          ? ` ${String(booking.event_time || booking.reservation_time).slice(0, 5)}`
                          : ""}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {isConcertLikeBooking
                          ? `${booking.booking_type || t("Reservation")} • ${
                              Number(booking.quantity || 0) > 0
                                ? booking.quantity
                                : `${t("Guests")} ${guestsLabel}`
                            }`
                          : `${t("Reserved")} • ${t("Guests")} ${guestsLabel}`}
                        {isConcertBooking ? ` • ${t("Total")} ${totalLabel}` : ""}
                        {booking.ticket_type_name ? ` • ${booking.ticket_type_name}` : ""}
                        {(booking.reserved_table_number || booking.table_number)
                          ? ` • ${t("Table")} ${booking.reserved_table_number || booking.table_number}`
                          : ""}
                        {isConcertBooking
                          ? (booking.payment_status ? ` • ${booking.payment_status}` : "")
                          : (reservationStatus ? ` • ${reservationStatus}` : "")}
                      </div>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
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
                        className="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 disabled:opacity-60"
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
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
                      >
                        {t("Cancel")}
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">
                {normalizedBookingSearch ? t("No matching bookings found") : t("No bookings yet.")}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <VirtualTablesGrid
        items={visibleTables}
        renderItem={renderTable}
        itemKey={getTableKey}
        estimatedItemHeight={300}
        overscan={6}
        className="w-full flex justify-center px-4 sm:px-8"
      />
      </div>
    </React.Profiler>
  );
}

const areTablesViewPropsEqual = (prevProps, nextProps) => {
  const isEqual =
    prevProps.showAreaTabs === nextProps.showAreaTabs &&
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
    prevProps.clearingBookings === nextProps.clearingBookings;

  if (!isEqual) {
    logMemoDiff({
      component: "TableList",
      prevProps,
      nextProps,
      watchedProps: [
        "showAreaTabs",
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
      ],
    });
  }

  return isEqual;
};

export default React.memo(TablesView, areTablesViewPropsEqual);
