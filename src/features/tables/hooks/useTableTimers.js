import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isOrderCancelledOrCanceled,
  normalizeOrderStatus,
  parseLooseDateToMs,
} from "../tableVisuals";

const DEFAULT_PREP_META = Object.freeze({
  isDelayed: false,
  remainingMs: 0,
  elapsedMs: 0,
  startedAt: null,
  statusLabel: "",
});

const READY_TIME_FORMAT_OPTIONS = Object.freeze({
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const normalizeTableKey = (tableId) => {
  const parsed = Number(tableId);
  return Number.isFinite(parsed) ? parsed : tableId;
};

const getOrderPrepMinutes = (order, productPrepById = {}) => {
  const direct = Number(order?.preparation_time ?? order?.prep_time ?? order?.prepTime);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const items = Array.isArray(order?.items) ? order.items : [];
  let maxMinutes = 0;

  items.forEach((item) => {
    const raw =
      item?.preparation_time ??
      item?.prep_time ??
      item?.prepTime ??
      item?.product_preparation_time ??
      item?.product?.preparation_time ??
      productPrepById?.[Number(item?.product_id ?? item?.productId)];

    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return;

    const qty = Number(item?.quantity ?? item?.qty ?? 1);
    const total = minutes * Math.max(1, qty);
    if (total > maxMinutes) maxMinutes = total;
  });

  return maxMinutes;
};

const getPrepStartMs = (order) => {
  const direct = parseLooseDateToMs(order?.prep_started_at ?? order?.prepStartedAt);
  if (Number.isFinite(direct)) return direct;

  const updated = parseLooseDateToMs(order?.kitchen_status_updated_at);
  if (Number.isFinite(updated)) return updated;

  const items = Array.isArray(order?.items) ? order.items : [];

  for (const item of items) {
    const ms = parseLooseDateToMs(item?.prep_started_at ?? item?.prepStartedAt);
    if (Number.isFinite(ms)) return ms;
  }

  for (const item of items) {
    const itemUpdated = parseLooseDateToMs(item?.kitchen_status_updated_at);
    if (Number.isFinite(itemUpdated)) return itemUpdated;
  }

  return NaN;
};

const getOrderReadyAtMs = (order, productPrepById = {}) => {
  const directReadyMs = parseLooseDateToMs(
    order?.estimated_ready_at ?? order?.ready_at ?? order?.readyAt ?? order?.estimatedReadyAt
  );
  if (Number.isFinite(directReadyMs)) return directReadyMs;

  const startMs = getPrepStartMs(order);
  const prepMinutes = getOrderPrepMinutes(order, productPrepById);
  if (!Number.isFinite(startMs) || !prepMinutes) return NaN;

  return startMs + prepMinutes * 60 * 1000;
};

const formatReadyLabel = (readyMs) => {
  if (!Number.isFinite(readyMs)) return "";
  return new Date(readyMs).toLocaleTimeString([], READY_TIME_FORMAT_OPTIONS);
};

const getOrderStartedAtMs = (order) => {
  return parseLooseDateToMs(
    order?.confirmed_at ?? order?.confirmedSinceMs ?? order?.updated_at ?? order?.created_at
  );
};

const computeOrderDelayed = (order, nowMs) => {
  if (!order || normalizeOrderStatus(order.status) !== "confirmed" || !order.created_at) return false;
  if (!Array.isArray(order.items) || order.items.length === 0) return false;

  const createdMs = parseLooseDateToMs(order.created_at);
  if (!Number.isFinite(createdMs)) return false;

  const diffMins = (nowMs - createdMs) / 1000 / 60;
  return diffMins > 1;
};

const toTableOrdersArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

export function useTableTimers({ ordersByTable, productPrepById = {}, nowTickMs = 1000 }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalMs = Number.isFinite(nowTickMs) && nowTickMs > 0 ? nowTickMs : 1000;
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [nowTickMs]);

  const tableOrdersMap = useMemo(() => {
    const map = new Map();
    if (!(ordersByTable instanceof Map)) return map;

    ordersByTable.forEach((value, rawTableId) => {
      const tableId = normalizeTableKey(rawTableId);
      const tableOrders = toTableOrdersArray(value);

      if (!map.has(tableId)) {
        map.set(tableId, []);
      }

      if (tableOrders.length > 0) {
        map.get(tableId).push(...tableOrders);
      }
    });

    return map;
  }, [ordersByTable]);

  const activeOrderByTable = useMemo(() => {
    const map = new Map();
    tableOrdersMap.forEach((tableOrders, tableId) => {
      const activeOrder =
        (Array.isArray(tableOrders) ? tableOrders : []).find(
          (order) => !isOrderCancelledOrCanceled(order?.status)
        ) || null;
      map.set(tableId, activeOrder);
    });
    return map;
  }, [tableOrdersMap]);

  const prepMetaByTable = useMemo(() => {
    const map = new Map();

    activeOrderByTable.forEach((order, tableId) => {
      if (!order) {
        map.set(tableId, DEFAULT_PREP_META);
        return;
      }

      const startedAtRaw = getOrderStartedAtMs(order);
      const startedAt = Number.isFinite(startedAtRaw) ? startedAtRaw : null;
      const elapsedMs = Number.isFinite(startedAtRaw) ? Math.max(0, now - startedAtRaw) : 0;

      const readyAtMsRaw = getOrderReadyAtMs(order, productPrepById);
      const hasReadyAt = Number.isFinite(readyAtMsRaw);
      const remainingMs = hasReadyAt ? Math.max(0, readyAtMsRaw - now) : 0;
      const statusLabel = hasReadyAt ? formatReadyLabel(readyAtMsRaw) : "";

      map.set(tableId, {
        isDelayed: computeOrderDelayed(order, now),
        remainingMs,
        elapsedMs,
        startedAt,
        statusLabel,
      });
    });

    return map;
  }, [activeOrderByTable, now, productPrepById]);

  const tableOrdersRef = useRef(tableOrdersMap);
  const activeOrderRef = useRef(activeOrderByTable);
  const prepMetaRef = useRef(prepMetaByTable);

  tableOrdersRef.current = tableOrdersMap;
  activeOrderRef.current = activeOrderByTable;
  prepMetaRef.current = prepMetaByTable;

  const getTableOrders = useCallback((tableId) => {
    const normalizedId = normalizeTableKey(tableId);
    return tableOrdersRef.current.get(normalizedId) || [];
  }, []);

  const getTableActiveOrder = useCallback((tableId) => {
    const normalizedId = normalizeTableKey(tableId);
    return activeOrderRef.current.get(normalizedId) || null;
  }, []);

  const getTablePrepMeta = useCallback((tableId) => {
    const normalizedId = normalizeTableKey(tableId);
    return prepMetaRef.current.get(normalizedId) || DEFAULT_PREP_META;
  }, []);

  const isTableDelayed = useCallback(
    (tableId) => {
      return getTablePrepMeta(tableId).isDelayed;
    },
    [getTablePrepMeta]
  );

  const getTableRemainingMs = useCallback(
    (tableId) => {
      return getTablePrepMeta(tableId).remainingMs;
    },
    [getTablePrepMeta]
  );

  return {
    now,
    getTableOrders,
    getTableActiveOrder,
    getTablePrepMeta,
    isTableDelayed,
    getTableRemainingMs,
  };
}
