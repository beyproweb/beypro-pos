import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import secureFetch from "../../utils/secureFetch";
import {
  formatLocalYmd,
  isEffectivelyFreeOrder,
  isReservationDueNow,
  isOrderCancelledOrCanceled,
  normalizeOrderStatus,
  parseLooseDateToMs,
} from "../tables/tableVisuals";
import { readInitialTableOrders, writeTableOrdersCache } from "./tableOrdersCache";
import useConfirmedTimers from "../tables/useConfirmedTimers";

const pickLatestTimestampValue = (existingValue, nextValue) => {
  if (!existingValue) return nextValue;
  if (!nextValue) return existingValue;
  const existingMs = parseLooseDateToMs(existingValue);
  const nextMs = parseLooseDateToMs(nextValue);
  if (!Number.isFinite(existingMs)) return nextValue;
  if (!Number.isFinite(nextMs)) return existingValue;
  return nextMs >= existingMs ? nextValue : existingValue;
};

const runWithConcurrency = async (arr, limit, task) => {
  const list = Array.isArray(arr) ? arr : [];
  const count = Math.max(1, Math.min(limit, list.length || 1));
  const results = new Array(list.length);
  let idx = 0;

  await Promise.all(
    Array.from({ length: count }, async () => {
      while (idx < list.length) {
        const current = idx++;
        try {
          results[current] = await task(list[current]);
        } catch (err) {
          console.warn("⚠️ Order hydrate failed:", err);
          results[current] = null;
        }
      }
    })
  );

  return results.filter(Boolean);
};

const isAbortError = (err) =>
  err?.name === "AbortError" ||
  String(err?.message || "")
    .toLowerCase()
    .includes("abort");

const areItemsEquivalent = (prevItems, nextItems) => {
  if (prevItems === nextItems) return true;
  const previous = Array.isArray(prevItems) ? prevItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];
  if (previous.length !== next.length) return false;

  for (let i = 0; i < next.length; i += 1) {
    const prevItem = previous[i] || {};
    const nextItem = next[i] || {};
    if (
      prevItem.id !== nextItem.id ||
      prevItem.kitchen_status !== nextItem.kitchen_status ||
      prevItem.paid !== nextItem.paid ||
      prevItem.paid_at !== nextItem.paid_at ||
      Number(prevItem.quantity || 0) !== Number(nextItem.quantity || 0) ||
      Number(prevItem.total_price || 0) !== Number(nextItem.total_price || 0)
    ) {
      return false;
    }
  }

  return true;
};

const getReservationFingerprint = (order) => {
  if (!order || typeof order !== "object") return "";
  const r = order.reservation && typeof order.reservation === "object" ? order.reservation : null;
  return [
    order.reservation_date ?? order.reservationDate ?? "",
    order.reservation_time ?? order.reservationTime ?? "",
    order.reservation_clients ?? order.reservationClients ?? "",
    order.reservation_notes ?? order.reservationNotes ?? "",
    r?.reservation_date ?? r?.reservationDate ?? "",
    r?.reservation_time ?? r?.reservationTime ?? "",
    r?.reservation_clients ?? r?.reservationClients ?? "",
    r?.reservation_notes ?? r?.reservationNotes ?? "",
    order.order_type ?? "",
  ].join("|");
};

const hasOrderReservationSignal = (order) => {
  if (!order || typeof order !== "object") return false;
  const r = order.reservation && typeof order.reservation === "object" ? order.reservation : null;
  const reservationDate =
    order.reservation_date ??
    order.reservationDate ??
    r?.reservation_date ??
    r?.reservationDate ??
    null;
  const reservationTime =
    order.reservation_time ??
    order.reservationTime ??
    r?.reservation_time ??
    r?.reservationTime ??
    null;
  const reservationId =
    order.reservation_id ??
    order.reservationId ??
    r?.id ??
    r?.reservation_id ??
    r?.reservationId ??
    null;
  return Boolean(
    reservationDate ||
      reservationTime ||
      (reservationId !== null && reservationId !== undefined && reservationId !== "")
  );
};

const getOrderTableNumber = (order) => {
  const raw =
    order?.table_number ??
    order?.tableNumber ??
    order?.table_id ??
    order?.tableId ??
    order?.table;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const isReservationLikeOrder = (order, nowMs = Date.now()) => {
  if (!order || typeof order !== "object") return false;
  const hasSignal = hasOrderReservationSignal(order);
  if (!hasSignal) return false;

  const status = normalizeOrderStatus(order?.status);
  const hasExplicitReservationState = status === "reserved" || order?.order_type === "reservation";
  if (hasExplicitReservationState) return true;

  // Treat signal-only rows as reservations only when the row is effectively free
  // (empty reservation tables), so normal active orders keep their real status.
  if (!isEffectivelyFreeOrder(order)) return false;
  return isReservationDueNow(order, nowMs);
};

const getNormalizedNonReservationStatus = (order) => {
  const status = normalizeOrderStatus(order?.status);
  if (status === "reserved" && !hasOrderReservationSignal(order)) return "confirmed";
  return status;
};

export default function useTableOrdersData() {
  const [orders, setOrders] = useState(() => readInitialTableOrders());
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [reservationsToday, setReservationsToday] = useState([]);

  const didInitialOrdersLoadRef = useRef(false);
  const ordersFetchSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const activeFetchControllerRef = useRef(null);
  const { getTimersSnapshot, persistTimers, getConfirmedSinceMs } = useConfirmedTimers();

  const hydrateOrderItemsInBackground = useCallback(async (visibleTableOrders, isDev, signal) => {
    const t1 = isDev ? performance.now() : 0;
    if (isDev) console.log("🔄 [TableOverview] Starting Phase 2 hydration...");

    const scheduleHydration = (task) => {
      return new Promise((resolve) => {
        if (signal?.aborted) {
          resolve([]);
          return;
        }
        if (typeof requestIdleCallback === "function") {
          requestIdleCallback(() => resolve(task()));
        } else {
          setTimeout(() => resolve(task()), 0);
        }
      });
    };

    const hydrated = await scheduleHydration(async () => {
      return await runWithConcurrency(visibleTableOrders, 6, async (order) => {
        if (signal?.aborted) return null;
        if (!order.id) {
          const itemsArr = [];
          const reservationObj =
            order.reservation ||
            (order.reservation_date
              ? {
                  reservation_date: order.reservation_date,
                  reservation_time: order.reservation_time ?? null,
                  reservation_clients: order.reservation_clients ?? 0,
                  reservation_notes: order.reservation_notes ?? "",
                }
              : null);
          return { ...order, items: itemsArr, reservation: reservationObj };
        }

        const itemsRaw = await secureFetch(`/orders/${order.id}/items`, { signal });
        const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];

        let items = itemsArr.map((item) => ({
          ...item,
          discount_type: item.discount_type || item.discountType || null,
          discount_value:
            item.discount_value != null
              ? parseFloat(item.discount_value)
              : item.discountValue != null
              ? parseFloat(item.discountValue)
              : 0,
        }));

        const isPaid =
          order.status === "paid" ||
          String(order.payment_status || "").toLowerCase() === "paid" ||
          order.is_paid === true;
        if (isPaid) {
          const hasAnyPaidMarker = items.some(
            (i) => i?.paid_at != null || typeof i?.paid === "boolean"
          );
          if (!hasAnyPaidMarker) {
            items = items.map((i) => ({ ...i, paid: true }));
          }
        }

        let reservation = null;
        const hasReservationHint =
          normalizeOrderStatus(order?.status) === "reserved" ||
          order?.order_type === "reservation" ||
          order?.reservation_date ||
          order?.reservationDate ||
          order?.reservation_time ||
          order?.reservationTime ||
          order?.reservation_clients != null ||
          order?.reservationClients != null ||
          order?.reservation_notes ||
          order?.reservationNotes;
        try {
          if (order?.id != null) {
            const resData = await secureFetch(`/orders/reservations/${order.id}`, { signal });
            if (signal?.aborted) return null;
            if (resData?.success && resData?.reservation) {
              reservation = resData.reservation;
            }
          }
        } catch (err) {
          if (isAbortError(err)) return null;
          if (hasReservationHint) {
            console.warn(`Failed to fetch reservation for order ${order.id}:`, err);
          }
        }

        return { ...order, items, reservation };
      });
    });

    if (isDev) {
      console.log(
        `✅ [TableOverview] Phase 2 hydration completed in ${(
          performance.now() - t1
        ).toFixed(1)}ms`
      );
    }

    return hydrated;
  }, []);

  const refreshOrders = useCallback(async (options = {}) => {
    const skipHydration = options?.skipHydration === true;
    const isDev = import.meta.env.DEV;
    const t0 = isDev ? performance.now() : 0;
    const controller = new AbortController();
    const signal = controller.signal;
    const nowMs = Date.now();

    try {
      activeFetchControllerRef.current?.abort?.();
      activeFetchControllerRef.current = controller;
      const seq = ++ordersFetchSeqRef.current;
      const isInitialLoad = !didInitialOrdersLoadRef.current;
      setOrdersLoading(true);

      const cachedOrders = readInitialTableOrders();
      if (cachedOrders.length > 0 && isInitialLoad && isMountedRef.current) {
        setOrders(cachedOrders);
        if (isDev) {
          console.log(
            `⚡ [TableOverview] Rendered from cache in ${(performance.now() - t0).toFixed(1)}ms`
          );
        }
      }

      const [ordersRes, reservationsRes] = await Promise.allSettled([
        secureFetch("/orders", { signal }),
        (async () => {
          const today = formatLocalYmd(new Date());
          // Include upcoming reservations too; TableOverview cards should still show reserved
          // even when reservation date is not today (e.g., empty cart reserved tables).
          return secureFetch(`/orders/reservations?start_date=${today}`, { signal });
        })(),
      ]);
      if (signal.aborted || ordersFetchSeqRef.current !== seq) return;

      if (isDev) {
        console.log(
          `⏱️ [TableOverview] Phase 1 fetch completed in ${(performance.now() - t0).toFixed(1)}ms`
        );
      }

      const data = ordersRes.status === "fulfilled" ? ordersRes.value : null;

      if (!Array.isArray(data)) {
        console.error("❌ Unexpected orders response:", data);
        toast.error("Failed to load orders");
        return;
      }

      const normalizeReservationList = (value) => {
        const list = Array.isArray(value?.reservations)
          ? value.reservations
          : Array.isArray(value)
          ? value
          : [];
        if (isDev) {
          console.log(
            `📋 [TableOverview] Fetched ${list.length} total reservations:`,
            list.map((r) => ({
              id: r.id,
              table: r.table_number,
              date: r.reservation_date,
              status: r.status,
            }))
          );
        }
        return list;
      };

      if (isMountedRef.current) {
        if (reservationsRes.status === "fulfilled") {
          setReservationsToday(normalizeReservationList(reservationsRes.value));
        } else {
          setReservationsToday([]);
        }
      }

      const existingOrderIds = new Set(data.map((o) => o.id).filter(Boolean));
      const reservationsList =
        reservationsRes.status === "fulfilled" ? normalizeReservationList(reservationsRes.value) : [];

      const existingTableNumbers = new Set(data.map(getOrderTableNumber).filter(Number.isFinite));

      const reservationsByOrderId = new Map();
      reservationsList.forEach((res) => {
        if (res.order_id) reservationsByOrderId.set(Number(res.order_id), res);
      });

      const enrichedOrders = data.map((order) => {
        const tableNumber = getOrderTableNumber(order);
        const reservation = reservationsByOrderId.get(Number(order.id));
        if (reservation && !order.reservation_date) {
          if (isDev) {
            console.log(
              `🔗 [TableOverview] Enriching order ${order.id} (table ${Number.isFinite(tableNumber) ? tableNumber : "?"}) with reservation from map`
            );
          }
          return {
            ...order,
            table_number: Number.isFinite(tableNumber) ? tableNumber : order?.table_number ?? null,
            status: order.status === "reserved" ? "reserved" : order.status,
            order_type: order.order_type === "reservation" ? "reservation" : order.order_type,
            reservation_date: reservation.reservation_date,
            reservation_time: reservation.reservation_time,
            reservation_clients: reservation.reservation_clients,
            reservation_notes: reservation.reservation_notes,
            customer_name:
              order?.customer_name ??
              order?.customerName ??
              reservation?.customer_name ??
              reservation?.customerName ??
              null,
            customer_phone:
              order?.customer_phone ??
              order?.customerPhone ??
              reservation?.customer_phone ??
              reservation?.customerPhone ??
              null,
          };
        }
        if (order.reservation_date && isDev) {
          console.log(
            `✅ [TableOverview] Order ${order.id} (table ${Number.isFinite(tableNumber) ? tableNumber : "?"}) already has reservation_date: ${order.reservation_date}`
          );
        }
        return {
          ...order,
          table_number: Number.isFinite(tableNumber) ? tableNumber : order?.table_number ?? null,
        };
      });

      const reservationOrders = reservationsList
        .filter((res) => {
          const reservationTableNumber = Number(
            res?.table_number ?? res?.tableNumber ?? res?.table
          );
          if (!Number.isFinite(reservationTableNumber)) return false;
          if (res.order_id && !existingOrderIds.has(res.order_id)) return true;
          if (!res.order_id && !existingTableNumbers.has(reservationTableNumber)) return true;
          return false;
        })
        .map((res) => ({
          id: res.order_id || null,
          table_number: Number(res?.table_number ?? res?.tableNumber ?? res?.table),
          status: "reserved",
          order_type: "reservation",
          total: 0,
          items: [],
          reservation_date: res.reservation_date,
          reservation_time: res.reservation_time,
          reservation_clients: res.reservation_clients,
          reservation_notes: res.reservation_notes,
          customer_name: res.customer_name ?? res.customerName ?? null,
          customer_phone: res.customer_phone ?? res.customerPhone ?? null,
        }));

      const openTableOrders = [...enrichedOrders, ...reservationOrders]
        .filter((o) => {
          const tableNumber = getOrderTableNumber(o);
          if (!Number.isFinite(tableNumber)) return false;

          const status = normalizeOrderStatus(o.status);
          if (isReservationLikeOrder(o, nowMs)) return true;
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          if (isEffectivelyFreeOrder(o)) return false;
          return true;
        })
        .map((order) => {
          const reservationLike = isReservationLikeOrder(order, nowMs);
          const status = reservationLike ? "reserved" : getNormalizedNonReservationStatus(order);
          const tableNumber = getOrderTableNumber(order);
          return {
            ...order,
            table_number: Number.isFinite(tableNumber) ? tableNumber : null,
            status,
            is_paid: order?.is_paid,
            total: status === "paid" ? 0 : parseFloat(order.total || 0),
          };
        });

      const visibleTableOrders = openTableOrders;

      if (isMountedRef.current && ordersFetchSeqRef.current === seq) {
        setOrders((prev) => {
          if (import.meta.env.DEV) console.time("[Phase1] setOrders");
          const prevByTable = new Map();
          (Array.isArray(prev) ? prev : []).forEach((o) => {
            const tableNumber = getOrderTableNumber(o);
            if (Number.isFinite(tableNumber)) prevByTable.set(tableNumber, o);
          });

          const storedTimers = getTimersSnapshot();
          const nextTimers = { ...storedTimers };
          const nextTableKeys = new Set(
            visibleTableOrders
              .map((o) => getOrderTableNumber(o))
              .filter(Number.isFinite)
              .map((n) => String(n))
          );
          for (const prevKey of prevByTable.keys()) {
            if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
          }

          const merged = Object.values(
            visibleTableOrders.reduce((acc, order) => {
              const key = getOrderTableNumber(order);
              if (!Number.isFinite(key)) return acc;
              const tableKey = String(key);
              const prevMerged = prevByTable.get(key);
              const knownItems = Array.isArray(prevMerged?.items) ? prevMerged.items : null;
              const orderWithKnownItems = knownItems ? { ...order, items: knownItems } : order;
              if (!acc[key]) {
                acc[key] = {
                  ...order,
                  merged_ids: [order.id],
                  items: Array.isArray(prevMerged?.items) ? prevMerged.items : null,
                  suborders: Array.isArray(prevMerged?.suborders)
                    ? prevMerged.suborders
                    : order.suborders,
                  reservation: prevMerged?.reservation ?? null,
                  confirmedSinceMs: getConfirmedSinceMs(prevMerged, orderWithKnownItems, {
                    isInitialLoad,
                    tableKey,
                    timers: nextTimers,
                  }),
                };
              } else {
                acc[key].merged_ids.push(order.id);
                if (
                  (acc[key].id === null || acc[key].id === undefined || acc[key].id === "") &&
                  order.id !== null &&
                  order.id !== undefined &&
                  String(order.id).trim() !== ""
                ) {
                  acc[key].id = order.id;
                }
                if (!acc[key].invoice_number && order.invoice_number) {
                  acc[key].invoice_number = order.invoice_number;
                }
                if (!acc[key].receipt_number && order.receipt_number) {
                  acc[key].receipt_number = order.receipt_number;
                }
                if (!acc[key].order_number && order.order_number) {
                  acc[key].order_number = order.order_number;
                }
                if (!acc[key].customer_name && (order.customer_name || order.customerName)) {
                  acc[key].customer_name = order.customer_name ?? order.customerName;
                }
                if (!acc[key].customer_phone && (order.customer_phone || order.customerPhone)) {
                  acc[key].customer_phone = order.customer_phone ?? order.customerPhone;
                }
                if (!acc[key].receipt_id && order.receipt_id) {
                  acc[key].receipt_id = order.receipt_id;
                }
                acc[key].created_at = pickLatestTimestampValue(acc[key].created_at, order.created_at);
                acc[key].updated_at = pickLatestTimestampValue(acc[key].updated_at, order.updated_at);
                acc[key].prep_started_at = pickLatestTimestampValue(
                  acc[key].prep_started_at,
                  order.prep_started_at
                );
                acc[key].estimated_ready_at = pickLatestTimestampValue(
                  acc[key].estimated_ready_at,
                  order.estimated_ready_at
                );
                acc[key].kitchen_delivered_at = pickLatestTimestampValue(
                  acc[key].kitchen_delivered_at,
                  order.kitchen_delivered_at
                );
                if (
                  !acc[key].reservation_date &&
                  !acc[key].reservationDate &&
                  (order.reservation_date || order.reservationDate)
                ) {
                  acc[key].reservation_date = order.reservation_date ?? order.reservationDate;
                }
                if (
                  !acc[key].reservation_time &&
                  !acc[key].reservationTime &&
                  (order.reservation_time || order.reservationTime)
                ) {
                  acc[key].reservation_time = order.reservation_time ?? order.reservationTime;
                }
                if (
                  (acc[key].reservation_clients == null || acc[key].reservation_clients === "") &&
                  (order.reservation_clients != null || order.reservationClients != null)
                ) {
                  acc[key].reservation_clients =
                    order.reservation_clients ?? order.reservationClients;
                }
                if (
                  !acc[key].reservation_notes &&
                  !acc[key].reservationNotes &&
                  (order.reservation_notes || order.reservationNotes)
                ) {
                  acc[key].reservation_notes = order.reservation_notes ?? order.reservationNotes;
                }
                if (!acc[key].reservation && order.reservation) {
                  acc[key].reservation = order.reservation;
                }
                acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
                const nextStatus =
                  acc[key].status === "paid" && order.status === "paid"
                    ? "paid"
                    : isReservationLikeOrder(acc[key], nowMs) ||
                      isReservationLikeOrder(order, nowMs)
                    ? "reserved"
                    : "confirmed";
                acc[key].status = nextStatus;
                if (nextStatus !== "confirmed") {
                  acc[key].confirmedSinceMs = null;
                  delete nextTimers[tableKey];
                } else if (!Number.isFinite(acc[key].confirmedSinceMs)) {
                  acc[key].confirmedSinceMs = getConfirmedSinceMs(prevMerged, orderWithKnownItems, {
                    isInitialLoad,
                    tableKey,
                    timers: nextTimers,
                  });
                }
              }
              return acc;
            }, {})
          );

          const sorted = merged.sort(
            (a, b) => getOrderTableNumber(a) - getOrderTableNumber(b)
          );
          persistTimers(nextTimers);
          writeTableOrdersCache(sorted);
          if (import.meta.env.DEV) console.timeEnd("[Phase1] setOrders");
          return sorted;
        });
      }

      if (skipHydration) {
        if (isInitialLoad) didInitialOrdersLoadRef.current = true;
        return;
      }

      const hydrated = await hydrateOrderItemsInBackground(visibleTableOrders, isDev, signal);
      if (!isMountedRef.current || ordersFetchSeqRef.current !== seq) return;

      const mergedByTable = Object.values(
        hydrated.reduce((acc, order) => {
          const key = getOrderTableNumber(order);
          if (!Number.isFinite(key)) return acc;
          if (!acc[key]) {
            acc[key] = {
              ...order,
              table_number: key,
              merged_ids: [order.id],
              merged_items: [...(order.items || [])],
            };
          } else {
            acc[key].merged_ids.push(order.id);
            if (
              (acc[key].id === null || acc[key].id === undefined || acc[key].id === "") &&
              order.id !== null &&
              order.id !== undefined &&
              String(order.id).trim() !== ""
            ) {
              acc[key].id = order.id;
            }
            if (!acc[key].invoice_number && order.invoice_number) {
              acc[key].invoice_number = order.invoice_number;
            }
            if (!acc[key].receipt_number && order.receipt_number) {
              acc[key].receipt_number = order.receipt_number;
            }
            if (!acc[key].order_number && order.order_number) {
              acc[key].order_number = order.order_number;
            }
            if (!acc[key].customer_name && (order.customer_name || order.customerName)) {
              acc[key].customer_name = order.customer_name ?? order.customerName;
            }
            if (!acc[key].customer_phone && (order.customer_phone || order.customerPhone)) {
              acc[key].customer_phone = order.customer_phone ?? order.customerPhone;
            }
            if (!acc[key].receipt_id && order.receipt_id) {
              acc[key].receipt_id = order.receipt_id;
            }
            acc[key].created_at = pickLatestTimestampValue(acc[key].created_at, order.created_at);
            acc[key].updated_at = pickLatestTimestampValue(acc[key].updated_at, order.updated_at);
            acc[key].prep_started_at = pickLatestTimestampValue(
              acc[key].prep_started_at,
              order.prep_started_at
            );
            acc[key].estimated_ready_at = pickLatestTimestampValue(
              acc[key].estimated_ready_at,
              order.estimated_ready_at
            );
            acc[key].kitchen_delivered_at = pickLatestTimestampValue(
              acc[key].kitchen_delivered_at,
              order.kitchen_delivered_at
            );
            if (
              !acc[key].reservation_date &&
              !acc[key].reservationDate &&
              (order.reservation_date || order.reservationDate)
            ) {
              acc[key].reservation_date = order.reservation_date ?? order.reservationDate;
            }
            if (
              !acc[key].reservation_time &&
              !acc[key].reservationTime &&
              (order.reservation_time || order.reservationTime)
            ) {
              acc[key].reservation_time = order.reservation_time ?? order.reservationTime;
            }
            if (
              (acc[key].reservation_clients == null || acc[key].reservation_clients === "") &&
              (order.reservation_clients != null || order.reservationClients != null)
            ) {
              acc[key].reservation_clients = order.reservation_clients ?? order.reservationClients;
            }
            if (
              !acc[key].reservation_notes &&
              !acc[key].reservationNotes &&
              (order.reservation_notes || order.reservationNotes)
            ) {
              acc[key].reservation_notes = order.reservation_notes ?? order.reservationNotes;
            }
            if (!acc[key].reservation && order.reservation) {
              acc[key].reservation = order.reservation;
            }
            acc[key].items = [...(acc[key].items || []), ...(order.items || [])];
            acc[key].merged_items = acc[key].items;
            acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
            acc[key].status =
              acc[key].status === "paid" && order.status === "paid"
                ? "paid"
                : isReservationLikeOrder(acc[key], nowMs) ||
                  isReservationLikeOrder(order, nowMs)
                ? "reserved"
                : "confirmed";
          }
          const anyUnpaid = (acc[key].items || []).some((i) => !i.paid_at && !i.paid);
          const reservationLike = isReservationLikeOrder(acc[key], nowMs);
          if (reservationLike) {
            const explicitPaid =
              String(acc[key]?.payment_status || "").toLowerCase() === "paid" ||
              acc[key]?.is_paid === true;
            acc[key].is_paid = anyUnpaid ? false : explicitPaid;
          } else {
            acc[key].is_paid = !anyUnpaid;
          }
          return acc;
        }, {})
      ).sort((a, b) => getOrderTableNumber(a) - getOrderTableNumber(b));

      setOrders((prev) => {
        if (isDev) console.time("⚡ Phase 2 setState");
        const prevByTable = new Map();
        (Array.isArray(prev) ? prev : []).forEach((o) => {
          const tableNumber = getOrderTableNumber(o);
          if (Number.isFinite(tableNumber)) prevByTable.set(tableNumber, o);
        });

        const storedTimers = getTimersSnapshot();
        const nextTimers = { ...storedTimers };
        const nextTableKeys = new Set(
          mergedByTable
            .map((o) => getOrderTableNumber(o))
            .filter(Number.isFinite)
            .map((n) => String(n))
        );
        for (const prevKey of prevByTable.keys()) {
          if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
        }

        const nextOrders = mergedByTable.map((o) => {
          const currentTableNumber = getOrderTableNumber(o);
          const tableKey = String(currentTableNumber);
          const prevMerged = prevByTable.get(currentTableNumber);

          const itemsChanged = !areItemsEquivalent(prevMerged?.items, o.items);

          const reservationUnchanged =
            getReservationFingerprint(prevMerged) === getReservationFingerprint(o);

          if (
            !itemsChanged &&
            prevMerged?.status === o.status &&
            prevMerged?.total === o.total &&
            reservationUnchanged
          ) {
            return prevMerged;
          }

          return {
            ...o,
            confirmedSinceMs: getConfirmedSinceMs(prevMerged, o, {
              isInitialLoad,
              tableKey,
              timers: nextTimers,
            }),
          };
        });
        persistTimers(nextTimers);
        writeTableOrdersCache(nextOrders);

        if (isDev) {
          const changedCount = nextOrders.filter((o, i) => o !== prev[i]).length;
          console.log(`🔄 Phase 2 updated ${changedCount}/${nextOrders.length} tables`);
          console.timeEnd("⚡ Phase 2 setState");
        }

        return nextOrders;
      });

      if (isInitialLoad) didInitialOrdersLoadRef.current = true;
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("❌ Fetch open orders failed:", err);
      toast.error("Could not load open orders");
    } finally {
      if (activeFetchControllerRef.current === controller) {
        activeFetchControllerRef.current = null;
      }
      if (isMountedRef.current) setOrdersLoading(false);
    }
  }, [getConfirmedSinceMs, getTimersSnapshot, hydrateOrderItemsInBackground, persistTimers]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeFetchControllerRef.current?.abort?.();
      activeFetchControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    writeTableOrdersCache(orders);
  }, [orders]);

  const ordersByTable = useMemo(() => {
    const map = new Map();

    for (const order of orders || []) {
      const tableNumber = getOrderTableNumber(order);
      if (!Number.isFinite(tableNumber)) continue;

      if (!map.has(tableNumber)) {
        map.set(tableNumber, []);
      }

      map.get(tableNumber).push(order);
    }

    return map;
  }, [orders]);

  return {
    orders,
    ordersByTable,
    setOrders,
    reservationsToday,
    setReservationsToday,
    ordersLoading,
    refreshOrders,
    hydrateOrderItemsInBackground,
    didInitialOrdersLoadRef,
    ordersFetchSeqRef,
  };
}
