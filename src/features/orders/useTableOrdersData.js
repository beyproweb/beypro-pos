import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import secureFetch from "../../utils/secureFetch";
import {
  formatLocalYmd,
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
        try {
          if (order.status === "reserved" || order.reservation_date) {
            const resData = await secureFetch(`/orders/reservations/${order.id}`, { signal });
            if (signal?.aborted) return null;
            if (resData?.success && resData?.reservation) {
              reservation = resData.reservation;
            }
          }
        } catch (err) {
          if (isAbortError(err)) return null;
          console.warn(`Failed to fetch reservation for order ${order.id}:`, err);
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
          return secureFetch(`/orders/reservations?start_date=${today}&end_date=${today}`, { signal });
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

      const existingTableNumbers = new Set(
        data.map((o) => Number(o.table_number)).filter(Number.isFinite)
      );

      const reservationsByOrderId = new Map();
      reservationsList.forEach((res) => {
        if (res.order_id) reservationsByOrderId.set(Number(res.order_id), res);
      });

      const enrichedOrders = data.map((order) => {
        const reservation = reservationsByOrderId.get(Number(order.id));
        if (reservation && !order.reservation_date) {
          if (isDev) {
            console.log(
              `🔗 [TableOverview] Enriching order ${order.id} (table ${order.table_number}) with reservation from map`
            );
          }
          return {
            ...order,
            status: order.status === "reserved" ? "reserved" : order.status,
            order_type: order.order_type === "reservation" ? "reservation" : order.order_type,
            reservation_date: reservation.reservation_date,
            reservation_time: reservation.reservation_time,
            reservation_clients: reservation.reservation_clients,
            reservation_notes: reservation.reservation_notes,
          };
        }
        if (order.reservation_date && isDev) {
          console.log(
            `✅ [TableOverview] Order ${order.id} (table ${order.table_number}) already has reservation_date: ${order.reservation_date}`
          );
        }
        return order;
      });

      const reservationOrders = reservationsList
        .filter((res) => {
          if (res.table_number == null) return false;
          if (res.order_id && !existingOrderIds.has(res.order_id)) return true;
          if (!res.order_id && !existingTableNumbers.has(Number(res.table_number))) return true;
          return false;
        })
        .map((res) => ({
          id: res.order_id || null,
          table_number: Number(res.table_number),
          status: "reserved",
          order_type: "reservation",
          total: 0,
          items: [],
          reservation_date: res.reservation_date,
          reservation_time: res.reservation_time,
          reservation_clients: res.reservation_clients,
          reservation_notes: res.reservation_notes,
        }));

      const openTableOrders = [...enrichedOrders, ...reservationOrders]
        .filter((o) => {
          const status = normalizeOrderStatus(o.status);
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          return o.table_number != null;
        })
        .map((order) => {
          const status = normalizeOrderStatus(order.status);
          return {
            ...order,
            status,
            total: status === "paid" ? 0 : parseFloat(order.total || 0),
          };
        });

      const visibleTableOrders = openTableOrders;

      if (isMountedRef.current && ordersFetchSeqRef.current === seq) {
        setOrders((prev) => {
          if (import.meta.env.DEV) console.time("[Phase1] setOrders");
          const prevByTable = new Map();
          (Array.isArray(prev) ? prev : []).forEach((o) => {
            if (o?.table_number != null) prevByTable.set(Number(o.table_number), o);
          });

          const storedTimers = getTimersSnapshot();
          const nextTimers = { ...storedTimers };
          const nextTableKeys = new Set(visibleTableOrders.map((o) => String(Number(o.table_number))));
          for (const prevKey of prevByTable.keys()) {
            if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
          }

          const merged = Object.values(
            visibleTableOrders.reduce((acc, order) => {
              const key = Number(order.table_number);
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
                acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
                const nextStatus =
                  acc[key].status === "paid" && order.status === "paid"
                    ? "paid"
                    : acc[key].status === "reserved" ||
                      order.status === "reserved" ||
                      acc[key].order_type === "reservation" ||
                      order.order_type === "reservation" ||
                      acc[key].reservation_date ||
                      order.reservation_date
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

          const sorted = merged.sort((a, b) => Number(a.table_number) - Number(b.table_number));
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
          const key = Number(order.table_number);
          if (!acc[key]) {
            acc[key] = {
              ...order,
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
            acc[key].items = [...(acc[key].items || []), ...(order.items || [])];
            acc[key].merged_items = acc[key].items;
            acc[key].total = Number(acc[key].total || 0) + Number(order.total || 0);
            acc[key].status =
              acc[key].status === "paid" && order.status === "paid"
                ? "paid"
                : acc[key].status === "reserved" ||
                  order.status === "reserved" ||
                  acc[key].order_type === "reservation" ||
                  order.order_type === "reservation" ||
                  acc[key].reservation_date ||
                  order.reservation_date
                ? "reserved"
                : "confirmed";
          }
          const anyUnpaid = (acc[key].items || []).some((i) => !i.paid_at && !i.paid);
          acc[key].is_paid = !anyUnpaid;
          return acc;
        }, {})
      ).sort((a, b) => Number(a.table_number) - Number(b.table_number));

      setOrders((prev) => {
        if (isDev) console.time("⚡ Phase 2 setState");
        const prevByTable = new Map();
        (Array.isArray(prev) ? prev : []).forEach((o) => {
          if (o?.table_number != null) prevByTable.set(Number(o.table_number), o);
        });

        const storedTimers = getTimersSnapshot();
        const nextTimers = { ...storedTimers };
        const nextTableKeys = new Set(mergedByTable.map((o) => String(Number(o.table_number))));
        for (const prevKey of prevByTable.keys()) {
          if (!nextTableKeys.has(String(prevKey))) delete nextTimers[String(prevKey)];
        }

        const nextOrders = mergedByTable.map((o) => {
          const tableKey = String(Number(o.table_number));
          const prevMerged = prevByTable.get(Number(o.table_number));

          const itemsChanged = !areItemsEquivalent(prevMerged?.items, o.items);

          if (!itemsChanged && prevMerged?.status === o.status && prevMerged?.total === o.total) {
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
      const tableId = order?.table_id ?? order?.table_number;
      if (!tableId) continue;

      if (!map.has(tableId)) {
        map.set(tableId, []);
      }

      map.get(tableId).push(order);
    }

    return map;
  }, [orders]);

  return {
    orders,
    ordersByTable,
    setOrders,
    reservationsToday,
    ordersLoading,
    refreshOrders,
    hydrateOrderItemsInBackground,
    didInitialOrdersLoadRef,
    ordersFetchSeqRef,
  };
}
