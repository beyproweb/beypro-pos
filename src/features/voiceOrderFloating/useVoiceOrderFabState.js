import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "qr_voice_fab";

const normalizeScopeSegment = (value, fallbackValue) => {
  const raw = String(value ?? "").trim();
  return encodeURIComponent(raw || fallbackValue);
};

const getLocationFallback = () => {
  if (typeof window === "undefined") return "fallback";
  const pathname = window.location?.pathname || "/";
  const search = window.location?.search || "";
  return `${pathname}${search}`;
};

const readIsOpenFromStorage = (storageKey) => {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
};

const writeIsOpenToStorage = (storageKey, nextValue) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, nextValue ? "1" : "0");
  } catch {
    // Ignore storage write failures (private mode, quota, etc.)
  }
};

export function useVoiceOrderFabState({ restaurantId, tableId, fallbackScope } = {}) {
  const storageKey = useMemo(() => {
    const hasRestaurant = String(restaurantId ?? "").trim().length > 0;
    const hasTable = String(tableId ?? "").trim().length > 0;
    const fallback = String(fallbackScope ?? "").trim() || getLocationFallback();

    const restaurantSegment = normalizeScopeSegment(
      hasRestaurant ? restaurantId : "fallback",
      "fallback"
    );
    const tableSegment = normalizeScopeSegment(
      hasTable ? tableId : hasRestaurant ? "default" : fallback,
      "default"
    );

    return `${STORAGE_PREFIX}:${restaurantSegment}:${tableSegment}`;
  }, [restaurantId, tableId, fallbackScope]);

  const [isOpen, setIsOpen] = useState(() => readIsOpenFromStorage(storageKey));

  useEffect(() => {
    setIsOpen(readIsOpenFromStorage(storageKey));
  }, [storageKey]);

  const open = useCallback(() => {
    setIsOpen(true);
    writeIsOpenToStorage(storageKey, true);
  }, [storageKey]);

  const close = useCallback(() => {
    setIsOpen(false);
    writeIsOpenToStorage(storageKey, false);
  }, [storageKey]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const nextValue = !prev;
      writeIsOpenToStorage(storageKey, nextValue);
      return nextValue;
    });
  }, [storageKey]);

  return { isOpen, open, close, toggle, storageKey };
}

export default useVoiceOrderFabState;
