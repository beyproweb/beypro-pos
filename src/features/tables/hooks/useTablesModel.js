import { useMemo, useRef } from "react";
import {
  getMemoizedTableDerivedFields,
  isEffectivelyFreeOrder,
  normalizeOrderStatus,
} from "../tableVisuals";
import { isTablePerfDebugEnabled, withPerfTimer } from "../dev/perfDebug";

const isReservationOrder = (order) =>
  Boolean(order) &&
  (normalizeOrderStatus(order.status) === "reserved" ||
    order.order_type === "reservation" ||
    Boolean(order.reservation_date));

const normalizeGuests = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getReservationShadowKey = (reservation) => {
  if (!reservation || typeof reservation !== "object") return "";
  return [
    reservation.id ?? "",
    reservation.table_number ?? reservation.tableNumber ?? reservation.table ?? "",
    reservation.reservation_date ?? "",
    reservation.reservation_time ?? "",
    reservation.reservation_clients ?? "",
    reservation.reservation_notes ?? "",
  ].join("|");
};

const buildReservationShadowOrder = (reservation, parsedTableNumber) => ({
  ...reservation,
  status: "reserved",
  order_type: "reservation",
  table_number: parsedTableNumber,
  total: 0,
  items: [],
});

const canReuseTableModel = (prev, next) => {
  if (!prev || !next) return false;
  return (
    prev.tableNumber === next.tableNumber &&
    prev.seats === next.seats &&
    prev.guests === next.guests &&
    prev.area === next.area &&
    prev.label === next.label &&
    prev.color === next.color &&
    prev.order === next.order &&
    prev.reservationFallback === next.reservationFallback &&
    prev.tableStatus === next.tableStatus &&
    prev.tableColor === next.tableColor &&
    prev.unpaidTotal === next.unpaidTotal &&
    prev.activeOrderCount === next.activeOrderCount &&
    prev.hasUnpaidItems === next.hasUnpaidItems &&
    prev.isFullyPaid === next.isFullyPaid &&
    prev.isFreeTable === next.isFreeTable &&
    prev.isReservedTable === next.isReservedTable
  );
};

export default function useTablesModel({ tableConfigs, ordersByTable, reservationsToday }) {
  const prevTablesByNumberRef = useRef(new Map());
  const reservationShadowCacheRef = useRef(new Map());
  const prevGroupedTablesRef = useRef({});

  const reservationsByTable = useMemo(() => {
    return withPerfTimer("[perf] TableList reservations map", () => {
      const map = new Map();
      for (const reservation of reservationsToday || []) {
        const tableNumber = Number(
          reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
        );
        if (!Number.isFinite(tableNumber)) continue;
        map.set(tableNumber, reservation);
      }
      return map;
    });
  }, [reservationsToday]);

  const tables = useMemo(() => {
    return withPerfTimer("[perf] TableList model build", () => {
      const previousByNumber = prevTablesByNumberRef.current;
      const nextByNumber = new Map();
      const nextReservationShadowCache = new Map();
      const configList = Array.isArray(tableConfigs)
        ? [...tableConfigs].sort((a, b) => Number(a?.number) - Number(b?.number))
        : [];

      const list = configList.map((cfg) => {
        const parsedCfgNumber = Number(cfg?.number);
        const prevTable = previousByNumber.get(parsedCfgNumber);
        const orderRaw = ordersByTable instanceof Map ? ordersByTable.get(parsedCfgNumber) || null : null;
        const reservationFallback = reservationsByTable.get(parsedCfgNumber) || null;

        let order = orderRaw;
        if (orderRaw && isReservationOrder(orderRaw)) {
          order = orderRaw;
        } else if ((!orderRaw || isEffectivelyFreeOrder(orderRaw)) && reservationFallback) {
          const reservationKey = getReservationShadowKey(reservationFallback);
          const cacheEntry = reservationShadowCacheRef.current.get(parsedCfgNumber);
          if (cacheEntry && cacheEntry.key === reservationKey) {
            order = cacheEntry.order;
            nextReservationShadowCache.set(parsedCfgNumber, cacheEntry);
          } else {
            const shadowOrder = buildReservationShadowOrder(reservationFallback, parsedCfgNumber);
            const nextEntry = { key: reservationKey, order: shadowOrder };
            nextReservationShadowCache.set(parsedCfgNumber, nextEntry);
            order = shadowOrder;
          }
        }

        const derived = getMemoizedTableDerivedFields(order);

        const nextTable = {
          tableNumber: cfg?.number,
          seats: cfg?.seats || cfg?.chairs || null,
          guests: normalizeGuests(cfg?.guests),
          area: cfg?.area || "Main Hall",
          label: cfg?.label || "",
          color: cfg?.color || null,
          order,
          reservationFallback,
          tableStatus: derived.tableStatus,
          tableColor: derived.tableColor,
          unpaidTotal: derived.unpaidTotal,
          activeOrderCount: derived.activeOrderCount,
          hasUnpaidItems: derived.hasUnpaidItems,
          isFullyPaid: derived.isFullyPaid,
          isFreeTable: derived.isFreeTable,
          isReservedTable: derived.isReservedTable,
        };

        if (canReuseTableModel(prevTable, nextTable)) {
          nextByNumber.set(parsedCfgNumber, prevTable);
          return prevTable;
        }

        nextByNumber.set(parsedCfgNumber, nextTable);
        return nextTable;
      });

      prevTablesByNumberRef.current = nextByNumber;
      reservationShadowCacheRef.current = nextReservationShadowCache;

      if (isTablePerfDebugEnabled()) {
        const reused = list.filter((table, idx) => table === previousByNumber.get(Number(configList[idx]?.number))).length;
        console.log(`[perf][TableList] tables=${list.length} reused=${reused}`);
      }

      return list;
    });
  }, [tableConfigs, ordersByTable, reservationsByTable]);

  const groupedTables = useMemo(() => {
    return withPerfTimer("[perf] TableList grouped model", () => {
      const previousGrouped = prevGroupedTablesRef.current || {};
      const nextGrouped = {};

      for (const table of tables) {
        const area = table?.area || "Main Hall";
        if (!nextGrouped[area]) {
          nextGrouped[area] = [];
        }
        nextGrouped[area].push(table);
      }

      Object.keys(nextGrouped).forEach((area) => {
        const prevAreaList = previousGrouped[area];
        const nextAreaList = nextGrouped[area];
        if (!Array.isArray(prevAreaList) || prevAreaList.length !== nextAreaList.length) return;

        const unchanged = nextAreaList.every((table, index) => table === prevAreaList[index]);
        if (unchanged) {
          nextGrouped[area] = prevAreaList;
        }
      });

      const prevKeys = Object.keys(previousGrouped);
      const nextKeys = Object.keys(nextGrouped);
      const canReuseGroupedObject =
        prevKeys.length === nextKeys.length &&
        nextKeys.every((area) => previousGrouped[area] === nextGrouped[area]);

      if (canReuseGroupedObject) {
        return previousGrouped;
      }

      prevGroupedTablesRef.current = nextGrouped;
      return nextGrouped;
    });
  }, [tables]);

  return { tables, groupedTables };
}
