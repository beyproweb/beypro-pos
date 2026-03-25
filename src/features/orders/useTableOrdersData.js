import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import secureFetch from "../../utils/secureFetch";
import {
  formatLocalYmd,
  isEffectivelyFreeOrder,
  isOrderCancelledOrCanceled,
  normalizeOrderStatus,
  parseLooseDateToMs,
} from "../tables/tableVisuals";
import {
  readInitialTableOrders,
  readReservationShadows,
  writeTableOrdersCache,
} from "./tableOrdersCache";
import useConfirmedTimers from "../tables/useConfirmedTimers";
import {
  getVisibleServiceOrderStatus,
  isPendingReservationOnlyOrder,
} from "../../utils/reservationStatus";

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

const TERMINAL_RESERVATION_STATUSES = new Set([
  "checked_out",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
]);

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

const areMergedIdsEquivalent = (prevIds, nextIds) => {
  if (prevIds === nextIds) return true;
  const previous = Array.isArray(prevIds) ? prevIds : [];
  const next = Array.isArray(nextIds) ? nextIds : [];
  if (previous.length !== next.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (Number(previous[i]) !== Number(next[i])) return false;
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

const canReuseMergedTableOrder = (prevOrder, nextOrder) => {
  if (!prevOrder || !nextOrder) return false;
  return (
    Number(prevOrder?.id ?? 0) === Number(nextOrder?.id ?? 0) &&
    Number(getOrderTableNumber(prevOrder)) === Number(getOrderTableNumber(nextOrder)) &&
    prevOrder?.status === nextOrder?.status &&
    prevOrder?.order_type === nextOrder?.order_type &&
    prevOrder?.payment_status === nextOrder?.payment_status &&
    prevOrder?.is_paid === nextOrder?.is_paid &&
    prevOrder?.receipt_id === nextOrder?.receipt_id &&
    prevOrder?.invoice_number === nextOrder?.invoice_number &&
    prevOrder?.receipt_number === nextOrder?.receipt_number &&
    prevOrder?.order_number === nextOrder?.order_number &&
    prevOrder?.customer_name === nextOrder?.customer_name &&
    prevOrder?.customer_phone === nextOrder?.customer_phone &&
    prevOrder?.created_at === nextOrder?.created_at &&
    prevOrder?.updated_at === nextOrder?.updated_at &&
    prevOrder?.prep_started_at === nextOrder?.prep_started_at &&
    prevOrder?.estimated_ready_at === nextOrder?.estimated_ready_at &&
    prevOrder?.kitchen_delivered_at === nextOrder?.kitchen_delivered_at &&
    Number(prevOrder?.total || 0) === Number(nextOrder?.total || 0) &&
    Number(prevOrder?.confirmedSinceMs || 0) === Number(nextOrder?.confirmedSinceMs || 0) &&
    areMergedIdsEquivalent(prevOrder?.merged_ids, nextOrder?.merged_ids) &&
    areItemsEquivalent(prevOrder?.items, nextOrder?.items) &&
    getReservationFingerprint(prevOrder) === getReservationFingerprint(nextOrder)
  );
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
  const reservationClients =
    order.reservation_clients ??
    order.reservationClients ??
    r?.reservation_clients ??
    r?.reservationClients ??
    null;
  const reservationNotes =
    order.reservation_notes ??
    order.reservationNotes ??
    r?.reservation_notes ??
    r?.reservationNotes ??
    null;
  return Boolean(
    reservationDate ||
      reservationTime ||
      reservationNotes ||
      Number(reservationClients || 0) > 0
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

const getNormalizedNonReservationStatus = (order) => {
  const status = getVisibleServiceOrderStatus(order);
  if (status === "reserved" && !hasOrderReservationSignal(order)) return "confirmed";
  return status;
};

const CHECKIN_REGRESSION_STATUSES = new Set([
  "reserved",
  "confirmed",
  "draft",
  "new",
  "pending",
  "paid",
  "open",
  "in_progress",
]);

const preserveCheckedInStatus = (incomingStatus, previousStatus, order) => {
  const normalizedIncoming = normalizeOrderStatus(incomingStatus);
  const normalizedPrevious = normalizeOrderStatus(previousStatus);
  if (normalizedPrevious !== "checked_in") return normalizedIncoming;
  if (!CHECKIN_REGRESSION_STATUSES.has(normalizedIncoming)) return normalizedIncoming;
  if (!hasOrderReservationSignal(order)) return normalizedIncoming;
  return "checked_in";
};

const mergeVisibleTableStatus = (...orders) => {
  const statuses = orders
    .map((order) =>
      typeof order === "string" ? normalizeOrderStatus(order) : getNormalizedNonReservationStatus(order)
    )
    .filter(Boolean);

  if (statuses.length === 0) return "confirmed";
  if (statuses.every((status) => status === "paid")) return "paid";
  return statuses.find((status) => status !== "paid") || statuses[0];
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

        const explicitReservationState =
          normalizeOrderStatus(order?.status) === "reserved" ||
          order?.order_type === "reservation";
        const normalizedTotal = Number(order?.total || 0);
        return {
          ...order,
          items: explicitReservationState && normalizedTotal <= 0 ? [] : items,
          reservation,
        };
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
        const rawList = Array.isArray(value?.reservations)
          ? value.reservations
          : Array.isArray(value)
          ? value
          : [];
        const list = rawList.filter((row) => {
          const status = normalizeOrderStatus(
            row?.status ?? row?.reservation_status ?? row?.reservationStatus
          );
          return !TERMINAL_RESERVATION_STATUSES.has(status);
        });
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
        const shadows = readReservationShadows();
        if (shadows.length === 0) return list;

        const hasActiveReservationContextForShadow = (shadow) => {
          const shadowOrderId = Number(shadow?.order_id ?? shadow?.orderId ?? shadow?.id);
          const shadowTableNumber = Number(
            shadow?.table_number ?? shadow?.tableNumber ?? shadow?.table
          );
          return (Array.isArray(data) ? data : []).some((order) => {
            const orderStatus = normalizeOrderStatus(order?.status);
            if (orderStatus === "closed") return false;
            if (isOrderCancelledOrCanceled(orderStatus)) return false;
            if (isEffectivelyFreeOrder(order)) return false;
            const orderId = Number(order?.id);
            const orderTableNumber = getOrderTableNumber(order);
            if (
              Number.isFinite(shadowOrderId) &&
              Number.isFinite(orderId) &&
              shadowOrderId === orderId
            ) {
              return true;
            }
            if (
              Number.isFinite(shadowTableNumber) &&
              Number.isFinite(orderTableNumber) &&
              shadowTableNumber === orderTableNumber &&
              hasOrderReservationSignal(order)
            ) {
              return true;
            }
            return false;
          });
        };

        const merged = [...list];
        shadows.forEach((shadow) => {
          const shadowReservationId = Number(shadow?.id);
          const shadowOrderId = Number(shadow?.order_id ?? shadow?.orderId);
          const shadowTableNumber = Number(
            shadow?.table_number ?? shadow?.tableNumber ?? shadow?.table
          );
          const normalizedShadowStatus = normalizeOrderStatus(shadow?.status);
          const shouldDowngradeCheckedInShadow =
            normalizedShadowStatus === "checked_in" &&
            !hasActiveReservationContextForShadow(shadow);
          const normalizedShadow = shouldDowngradeCheckedInShadow
            ? { ...shadow, status: "checked_out" }
            : shadow;
          const shadowHasIdentity =
            Number.isFinite(shadowReservationId) || Number.isFinite(shadowOrderId);
          const existingIndex = merged.findIndex((row) => {
            const rowReservationId = Number(row?.id);
            const rowOrderId = Number(row?.order_id ?? row?.orderId);
            const rowTableNumber = Number(row?.table_number ?? row?.tableNumber ?? row?.table);
            if (
              Number.isFinite(shadowReservationId) &&
              Number.isFinite(rowReservationId) &&
              rowReservationId === shadowReservationId
            ) {
              return true;
            }
            if (
              Number.isFinite(shadowOrderId) &&
              Number.isFinite(rowOrderId) &&
              rowOrderId === shadowOrderId
            ) {
              return true;
            }
            const sameTable =
              Number.isFinite(shadowTableNumber) &&
              Number.isFinite(rowTableNumber) &&
              rowTableNumber === shadowTableNumber;
            if (!sameTable) return false;
            const rowHasIdentity =
              Number.isFinite(rowReservationId) || Number.isFinite(rowOrderId);
            if (shadowHasIdentity && rowHasIdentity) return false;
            return true;
          });
          if (existingIndex < 0) {
            const hasBackendRowForSameTable = merged.some((row) => {
              const rowTableNumber = Number(row?.table_number ?? row?.tableNumber ?? row?.table);
              return (
                Number.isFinite(shadowTableNumber) &&
                Number.isFinite(rowTableNumber) &&
                rowTableNumber === shadowTableNumber
              );
            });
            if (hasBackendRowForSameTable) {
              return;
            }
            merged.push(normalizedShadow);
            return;
          }
          const existing = merged[existingIndex] || {};
          const mergedCandidate = { ...existing, ...normalizedShadow };
          const mergedStatus = preserveCheckedInStatus(
            existing?.status,
            normalizedShadow?.status,
            mergedCandidate
          );
          merged[existingIndex] = {
            ...mergedCandidate,
            status: mergedStatus,
            order_type:
              mergedStatus === "checked_in" &&
              String(mergedCandidate?.order_type || "").toLowerCase() === "reservation"
                ? "table"
                : mergedCandidate?.order_type,
          };
        });
        return merged;
      };

      if (isMountedRef.current) {
        if (reservationsRes.status === "fulfilled") {
          setReservationsToday(normalizeReservationList(reservationsRes.value));
        } else {
          setReservationsToday([]);
        }
      }

      const reservationsList =
        reservationsRes.status === "fulfilled" ? normalizeReservationList(reservationsRes.value) : [];

      const reservationsByOrderId = new Map();
      reservationsList.forEach((res) => {
        const reservationOrderId = Number(res?.order_id ?? res?.orderId ?? res?.id);
        if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
          reservationsByOrderId.set(reservationOrderId, res);
        }
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

      const openTableOrders = enrichedOrders
        .filter((o) => {
          const tableNumber = getOrderTableNumber(o);
          if (!Number.isFinite(tableNumber)) return false;

          const status = normalizeOrderStatus(o.status);
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          if (isPendingReservationOnlyOrder(o)) return false;
          if (isEffectivelyFreeOrder(o)) return false;
          return true;
        })
        .map((order) => {
          const status = getNormalizedNonReservationStatus(order);
          const tableNumber = getOrderTableNumber(order);
          return {
            ...order,
            table_number: Number.isFinite(tableNumber) ? tableNumber : null,
            status,
            is_paid: order?.is_paid,
            total: parseFloat(order.total || 0),
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
              const knownItems =
                !isEffectivelyFreeOrder(order) && Array.isArray(prevMerged?.items)
                  ? prevMerged.items
                  : null;
              const orderWithKnownItems = knownItems ? { ...order, items: knownItems } : order;
              const initialStatus = preserveCheckedInStatus(
                orderWithKnownItems?.status,
                prevMerged?.status,
                orderWithKnownItems
              );
              if (!acc[key]) {
                acc[key] = {
                  ...order,
                  status: initialStatus,
                  merged_ids: [order.id],
                  items: knownItems,
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
                const nextStatus = mergeVisibleTableStatus(acc[key], order);
                const preservedStatus = preserveCheckedInStatus(
                  nextStatus,
                  acc[key].status,
                  { ...acc[key], ...order }
                );
                acc[key].status = preservedStatus;
                if (preservedStatus !== "confirmed") {
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

          const sorted = merged
            .sort((a, b) => getOrderTableNumber(a) - getOrderTableNumber(b))
            .map((order) => {
              const tableNumber = getOrderTableNumber(order);
              const prevMerged = prevByTable.get(tableNumber);
              return canReuseMergedTableOrder(prevMerged, order) ? prevMerged : order;
            });
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
            const nextStatus = mergeVisibleTableStatus(acc[key], order);
            acc[key].status = preserveCheckedInStatus(nextStatus, acc[key].status, {
              ...acc[key],
              ...order,
            });
          }
          const anyUnpaid = (acc[key].items || []).some((i) => !i.paid_at && !i.paid);
          const explicitPaid =
            String(acc[key]?.payment_status || "").toLowerCase() === "paid" ||
            acc[key]?.is_paid === true;
          acc[key].is_paid = anyUnpaid ? false : explicitPaid;
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
          const preservedStatus = preserveCheckedInStatus(o?.status, prevMerged?.status, o);
          const normalizedIncomingStatus = normalizeOrderStatus(o?.status);
          const orderWithPreservedStatus =
            preservedStatus !== normalizedIncomingStatus ? { ...o, status: preservedStatus } : o;

          const itemsChanged = !areItemsEquivalent(prevMerged?.items, orderWithPreservedStatus.items);

          const reservationUnchanged =
            getReservationFingerprint(prevMerged) === getReservationFingerprint(orderWithPreservedStatus);

          if (
            !itemsChanged &&
            prevMerged?.status === orderWithPreservedStatus.status &&
            prevMerged?.total === orderWithPreservedStatus.total &&
            reservationUnchanged
          ) {
            return prevMerged;
          }

          return {
            ...orderWithPreservedStatus,
            confirmedSinceMs: getConfirmedSinceMs(prevMerged, orderWithPreservedStatus, {
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
