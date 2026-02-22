import { useCallback } from "react";
import { isEffectivelyFreeOrder, parseLooseDateToMs } from "./tableVisuals";

const getTableOverviewConfirmedTimersCacheKey = () => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:tableOverview.confirmedTimers.v1`;
};

const readTableOverviewConfirmedTimers = () => {
  try {
    if (typeof window === "undefined") return {};
    const raw = window?.localStorage?.getItem(getTableOverviewConfirmedTimersCacheKey());
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeTableOverviewConfirmedTimers = (timers) => {
  try {
    if (typeof window === "undefined") return;
    window?.localStorage?.setItem(
      getTableOverviewConfirmedTimersCacheKey(),
      JSON.stringify(timers || {})
    );
  } catch {
    // ignore
  }
};

export default function useConfirmedTimers() {
  const getTimersSnapshot = useCallback(() => readTableOverviewConfirmedTimers(), []);

  const persistTimers = useCallback((timers) => {
    writeTableOverviewConfirmedTimers(timers);
  }, []);

  const clearConfirmedTimer = useCallback((tableKey, timers) => {
    if (timers && tableKey) {
      delete timers[String(tableKey)];
      return;
    }
    const current = readTableOverviewConfirmedTimers();
    if (tableKey != null) delete current[String(tableKey)];
    writeTableOverviewConfirmedTimers(current);
  }, []);

  const getConfirmedSinceMs = useCallback((prevOrder, nextOrder, ctx = {}) => {
    const tableKey = ctx?.tableKey != null ? String(ctx.tableKey) : null;
    const isInitialLoad = Boolean(ctx?.isInitialLoad);
    const timers = ctx?.timers || readTableOverviewConfirmedTimers();
    const autoPersist = !ctx?.timers;

    if (!nextOrder || nextOrder.status !== "confirmed") {
      if (tableKey) delete timers[tableKey];
      if (autoPersist) writeTableOverviewConfirmedTimers(timers);
      return null;
    }

    const storedMs = tableKey != null ? Number.parseInt(timers[tableKey], 10) : NaN;
    if (Number.isFinite(storedMs)) return storedMs;

    if (Array.isArray(nextOrder.items) && isEffectivelyFreeOrder(nextOrder)) {
      if (tableKey) delete timers[tableKey];
      if (autoPersist) writeTableOverviewConfirmedTimers(timers);
      return null;
    }

    if (!isInitialLoad && prevOrder === undefined) {
      const now = Date.now();
      if (tableKey) timers[tableKey] = now;
      if (autoPersist) writeTableOverviewConfirmedTimers(timers);
      return now;
    }

    const prevIsEffectivelyFree =
      prevOrder === undefined
        ? false
        : Array.isArray(prevOrder.items) && isEffectivelyFreeOrder(prevOrder);
    if (prevIsEffectivelyFree) {
      const now = Date.now();
      if (tableKey) timers[tableKey] = now;
      if (autoPersist) writeTableOverviewConfirmedTimers(timers);
      return now;
    }

    const prevMs = prevOrder?.status === "confirmed" ? prevOrder?.confirmedSinceMs : null;
    if (Number.isFinite(prevMs)) {
      if (tableKey) timers[tableKey] = prevMs;
      if (autoPersist) writeTableOverviewConfirmedTimers(timers);
      return prevMs;
    }

    const nextMs = parseLooseDateToMs(nextOrder.updated_at || nextOrder.created_at);
    const resolved = Number.isFinite(nextMs) ? nextMs : Date.now();
    if (tableKey) timers[tableKey] = resolved;
    if (autoPersist) writeTableOverviewConfirmedTimers(timers);
    return resolved;
  }, []);

  return {
    getTimersSnapshot,
    persistTimers,
    getConfirmedSinceMs,
    clearConfirmedTimer,
  };
}
