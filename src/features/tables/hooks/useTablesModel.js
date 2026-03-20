import { useMemo, useRef } from "react";
import {
  getMemoizedTableDerivedFields,
} from "../tableVisuals";
import { isTablePerfDebugEnabled, withPerfTimer } from "../dev/perfDebug";
import { isPendingReservationOnlyOrder } from "../../../utils/reservationStatus";

const normalizeGuests = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getReservationSortKey = (reservation) => {
  if (!reservation || typeof reservation !== "object") return "9999-99-99 99:99:99";
  const dateRaw = reservation?.reservation_date ?? reservation?.reservationDate ?? "";
  const date = String(dateRaw || "").trim();
  if (!date) return "9999-99-99 99:99:99";
  const timeRaw = reservation?.reservation_time ?? reservation?.reservationTime ?? "00:00:00";
  const time = String(timeRaw || "00:00:00").trim() || "00:00:00";
  return `${date} ${time}`;
};

const getReservationStatusPriority = (reservation) => {
  const status = String(reservation?.status || "").trim().toLowerCase();
  if (status === "checked_in") return 0;
  if (status === "confirmed") return 1;
  if (status === "reserved") return 2;
  return 3;
};

const shouldPreferReservation = (nextReservation, currentReservation) => {
  if (!currentReservation) return true;
  const currentKey = getReservationSortKey(currentReservation);
  const nextKey = getReservationSortKey(nextReservation);
  if (nextKey !== currentKey) return nextKey < currentKey;

  const currentStatusPriority = getReservationStatusPriority(currentReservation);
  const nextStatusPriority = getReservationStatusPriority(nextReservation);
  if (nextStatusPriority !== currentStatusPriority) {
    return nextStatusPriority < currentStatusPriority;
  }

  const currentUpdatedAt = Date.parse(
    currentReservation?.updated_at ?? currentReservation?.created_at ?? 0
  ) || 0;
  const nextUpdatedAt = Date.parse(
    nextReservation?.updated_at ?? nextReservation?.created_at ?? 0
  ) || 0;
  if (nextUpdatedAt !== currentUpdatedAt) {
    return nextUpdatedAt > currentUpdatedAt;
  }

  const currentId = Number(currentReservation?.id) || 0;
  const nextId = Number(nextReservation?.id) || 0;
  return nextId > currentId;
};

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
  const prevGroupedTablesRef = useRef({});

  const reservationsByTable = useMemo(() => {
    return withPerfTimer("[perf] TableList reservations map", () => {
      const map = new Map();
      for (const reservation of reservationsToday || []) {
        const tableNumber = Number(
          reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
        );
        if (!Number.isFinite(tableNumber)) continue;
        const existing = map.get(tableNumber);
        if (shouldPreferReservation(reservation, existing)) {
          map.set(tableNumber, reservation);
        }
      }
      return map;
    });
  }, [reservationsToday]);

  const tables = useMemo(() => {
    return withPerfTimer("[perf] TableList model build", () => {
      const previousByNumber = prevTablesByNumberRef.current;
      const nextByNumber = new Map();
      const configList = Array.isArray(tableConfigs)
        ? [...tableConfigs].sort((a, b) => Number(a?.number) - Number(b?.number))
        : [];

      const list = configList.map((cfg) => {
        const parsedCfgNumber = Number(cfg?.number);
        const prevTable = previousByNumber.get(parsedCfgNumber);
        const orderRaw = ordersByTable instanceof Map ? ordersByTable.get(parsedCfgNumber) || null : null;
        const reservationFallback = reservationsByTable.get(parsedCfgNumber) || null;

        const order = orderRaw && isPendingReservationOnlyOrder(orderRaw) ? null : orderRaw;

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
