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

const AREA_FILTER_ALL = "ALL";
const AREA_FILTER_RESERVED = "__RESERVED__";
const AREA_FILTER_UNPAID = "__UNPAID__";
const AREA_FILTER_PAID = "__PAID__";
const AREA_FILTER_FREE = "__FREE__";
const AREA_FILTER_VIEW_BOOKING = "__VIEW_BOOKING__";

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
  concertBookingsLoading = false,
  concertBookingUpdatingId = null,
  onConcertBookingUpdateStatus,
}) {
  const renderCount = useRenderCount("TableList", { logEvery: 1 });
  const onTableListProfileRender = React.useMemo(() => createProfilerOnRender("TableList"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const tableTimers = useTableTimers({ ordersByTable, productPrepById });
  const isActiveConcertReservationFallback = React.useCallback((table) => {
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
    if (isTerminal) return false;

    const notes = String(
      fallback?.reservation_notes ??
        fallback?.reservationNotes ??
        ""
    ).toLowerCase();
    return notes.includes("concert");
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
              isActiveConcertReservationFallback(table)
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
      isActiveConcertReservationFallback,
    ]
  );
  const reservedTablesCount = React.useMemo(
    () =>
      Array.isArray(tables)
        ? tables.filter(
            (table) =>
              Boolean(table?.isReservedTable) ||
              isActiveConcertReservationFallback(table)
          ).length
        : 0,
    [tables, isActiveConcertReservationFallback]
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
              {t("View Booking")} ({Array.isArray(concertBookings) ? concertBookings.length : 0})
            </button>
          ) : null}
        </div>
      )}

      {activeArea === AREA_FILTER_VIEW_BOOKING ? (
        <div className="w-full max-w-6xl px-4 sm:px-8 pb-4">
          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
            <div className="text-base font-semibold text-violet-700">{t("View Booking")}</div>
            {concertBookingsLoading ? (
              <div className="mt-3 text-sm text-gray-500">{t("Loading...")}</div>
            ) : Array.isArray(concertBookings) && concertBookings.length > 0 ? (
              <div className="mt-3 space-y-2">
                {concertBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="rounded-xl border border-gray-200 px-3 py-2.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-[240px]">
                      <div className="text-sm font-semibold text-slate-900">
                        {booking.customer_name || "Guest"}
                        {booking.customer_phone ? ` • ${booking.customer_phone}` : ""}
                      </div>
                      <div className="text-xs text-gray-600">
                        {(booking.event_title || booking.artist_name || t("Concert"))}
                        {booking.event_date ? ` • ${String(booking.event_date).slice(0, 10)}` : ""}
                        {booking.event_time ? ` ${String(booking.event_time).slice(0, 5)}` : ""}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {booking.booking_type} • {booking.quantity}
                        {booking.ticket_type_name ? ` • ${booking.ticket_type_name}` : ""}
                        {booking.reserved_table_number ? ` • ${t("Table")} ${booking.reserved_table_number}` : ""}
                        {booking.payment_status ? ` • ${booking.payment_status}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onConcertBookingUpdateStatus?.(booking.id, "confirmed")}
                        disabled={
                          concertBookingUpdatingId === booking.id ||
                          String(booking.payment_status || "").toLowerCase() === "confirmed"
                        }
                        className="px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 disabled:opacity-60"
                      >
                        {t("Confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onConcertBookingUpdateStatus?.(booking.id, "cancelled")}
                        disabled={
                          concertBookingUpdatingId === booking.id ||
                          String(booking.payment_status || "").toLowerCase() === "cancelled"
                        }
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-60"
                      >
                        {t("Cancel")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">{t("No bookings yet.")}</div>
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
    prevProps.concertBookingsLoading === nextProps.concertBookingsLoading &&
    prevProps.concertBookingUpdatingId === nextProps.concertBookingUpdatingId &&
    prevProps.onConcertBookingUpdateStatus === nextProps.onConcertBookingUpdateStatus;

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
        "concertBookingsLoading",
        "concertBookingUpdatingId",
        "onConcertBookingUpdateStatus",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TablesView, areTablesViewPropsEqual);
