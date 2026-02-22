import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDrinksFromApi } from "../api/drinksApi";
import {
  cancelOrderApi,
  closeOrderApi,
  confirmOnlineOrderApi,
  createReceiptMethodsApi,
  fetchCurrentRestaurantApi,
  fetchDriverReportApi,
  fetchDriversApi,
  fetchIntegrationsSettingsApi,
  fetchKitchenCompileSettingsApi,
  fetchOpenPhoneOrdersApi,
  fetchOrderItemsApi,
  fetchReceiptMethodsApi,
  fetchProductsApi,
  patchOrderDriverStatusApi,
  updateOrderApi,
} from "../api/ordersApi";
import {
  mergeOrdersById,
  normalizeCategoryValue,
  normalizeCompileSettings,
  normalizeItemName,
  normalizeOrderWithKitchenStatus,
} from "../utils/ordersNormalize";
import {
  selectAssignedOrderCount,
  selectDrinkSummaryByDriver,
  selectFilteredDrinkSummaryByDriver,
  selectFilteredOrders,
  selectRouteOrders,
  selectSafeOrders,
  selectTotalByMethod,
} from "../selectors/ordersSelectors";

const DEFAULT_RESTAURANT_COORDS = {
  label: "Restaurant",
  lat: 38.099579,
  lng: 27.718065,
  address: "",
};

const buildDateRange = (from, to) => {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;
  const dates = [];
  const cursor = new Date(rangeStart);
  while (cursor <= rangeEnd) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const POLLING_RETRY_DELAYS_MS = [800, 2000];
const ORDER_ITEMS_RETRY_DELAY_MS = 60;
const ORDER_ITEMS_RETRY_WINDOW_MS = 20000;

function isAbortError(err) {
  if (!err) return false;
  const name = String(err?.name || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();
  return (
    name === "aborterror" ||
    message.includes("aborted") ||
    message.includes("abort")
  );
}

function shouldRetryPollingError(err) {
  if (isAbortError(err)) return false;
  const status = Number(err?.details?.status ?? err?.status);
  if (Number.isFinite(status)) {
    if (status >= 500) return true;
    if (status >= 400) return false;
  }
  return true;
}

function waitWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      reject(abortErr);
      return;
    }
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      reject(abortErr);
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function runWithPollingRetry(task, signal) {
  let lastErr;
  for (let attempt = 0; attempt <= POLLING_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      lastErr = err;
      if (!shouldRetryPollingError(err) || attempt === POLLING_RETRY_DELAYS_MS.length) {
        throw err;
      }
      await waitWithAbort(POLLING_RETRY_DELAYS_MS[attempt], signal);
    }
  }
  throw lastErr;
}

export function useOrdersController({
  restaurantId,
  secureFetch,
  socket,
  pollingEnabled = true,
  pollingIntervalMs = 15000,
  geocodeAddress,
  t,
  toast,
  propOrders,
  paymentMethodLabels = [],
}) {
  void restaurantId;
  const hasPropOrders = Array.isArray(propOrders);
  const log = globalThis.console;
  const setTimeoutFn = globalThis.setTimeout.bind(globalThis);
  const clearTimeoutFn = globalThis.clearTimeout.bind(globalThis);
  const setIntervalFn = globalThis.setInterval.bind(globalThis);
  const clearIntervalFn = globalThis.clearInterval.bind(globalThis);

  const [orders, setOrders] = useState(() => (hasPropOrders ? propOrders : []));
  const [loading, setLoading] = useState(() => !hasPropOrders);
  const [error, setError] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [restaurantCoords, setRestaurantCoords] = useState(DEFAULT_RESTAURANT_COORDS);
  const [mapStops, setMapStops] = useState([]);
  const [drinksList, setDrinksList] = useState([]);
  const [excludedKitchenIds, setExcludedKitchenIds] = useState([]);
  const [excludedKitchenCategories, setExcludedKitchenCategories] = useState([]);
  const [productPrepById, setProductPrepById] = useState({});
  const [integrationsSettings, setIntegrationsSettings] = useState({});
  const [confirmingOnlineOrders, setConfirmingOnlineOrders] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [driverReport, setDriverReport] = useState(null);
  const [reportFromDate, setReportFromDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [reportToDate, setReportToDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [reportLoading, setReportLoading] = useState(false);
  const ordersAbortRef = useRef(null);
  const ordersRefreshingRef = useRef(false);
  const driverReportAbortRef = useRef(null);
  const driverReportRefreshingRef = useRef(false);
  const routeRefreshingRef = useRef(false);
  const socketRefreshTimerRef = useRef(null);

  const normalizedDrinkNames = useMemo(
    () => drinksList.map((drink) => normalizeItemName(drink)),
    [drinksList]
  );

  const isKitchenExcludedItem = useCallback(
    (item) => {
      if (!item) return false;
      if (item.kitchen_excluded === true || item.excluded === true) return true;
      const normalizedCategory = normalizeCategoryValue(item.category);
      const productRaw = item.product_id ?? item.id;
      const idNumber = Number(productRaw);
      const idString =
        productRaw === null || productRaw === undefined
          ? ""
          : String(productRaw).trim();

      const idMatches =
        excludedKitchenIds.includes(idNumber) || excludedKitchenIds.includes(idString);
      const categoryMatches = excludedKitchenCategories.includes(normalizedCategory);
      return idMatches || categoryMatches;
    },
    [excludedKitchenCategories, excludedKitchenIds]
  );

  const getRelevantOrderItems = useCallback(
    (order) => {
      if (!order || !Array.isArray(order.items)) return [];
      return order.items.filter((item) => {
        const normalizedName = normalizeItemName(
          item.name || item.order_item_name || item.product_name
        );
        return (
          !isKitchenExcludedItem(item) && !normalizedDrinkNames.includes(normalizedName)
        );
      });
    },
    [isKitchenExcludedItem, normalizedDrinkNames]
  );

  const areDriverItemsDelivered = useCallback(
    (order) => {
      const relevant = getRelevantOrderItems(order);
      if (relevant.length === 0) return true;
      return relevant.every((item) => {
        const status = String(item.kitchen_status || "").toLowerCase();
        return status === "delivered" || status === "packet_delivered" || status === "ready";
      });
    },
    [getRelevantOrderItems]
  );

  const fetchDrivers = useCallback(async () => {
    try {
      const data = await fetchDriversApi(secureFetch);
      const list = Array.isArray(data) ? data : data?.drivers || [];
      setDrivers(list);
      return list;
    } catch {
      setDrivers([]);
      return [];
    }
  }, [secureFetch]);

  const fetchOrders = useCallback(
    async (options = {}) => {
      if (hasPropOrders) {
        const seeded = (propOrders || []).map((order) =>
          normalizeOrderWithKitchenStatus(
            order,
            Array.isArray(order?.items) ? order.items : [],
            drinksList,
            isKitchenExcludedItem
          )
        );
        setOrders(seeded);
        setError("");
        setLoading(false);
        return;
      }

      const { pollRetry = false } = options;
      if (ordersRefreshingRef.current) return;

      if (ordersAbortRef.current) {
        ordersAbortRef.current.abort();
      }
      const controller = new AbortController();
      const { signal } = controller;
      ordersAbortRef.current = controller;
      ordersRefreshingRef.current = true;

      if (!orders.length) setLoading(true);

      const fetchTask = async () => {
        const data = await fetchOpenPhoneOrdersApi(secureFetch, { signal });

        const phoneOrders = data.filter((order) => {
          const status = String(order.status || "").toLowerCase();
          return (
            (order.order_type === "phone" || order.order_type === "packet") &&
            !["closed", "cancelled"].includes(status)
          );
        });

        // Fast-path: render order cards immediately, then hydrate items in background.
        const fastOrders = phoneOrders.map((order) =>
          normalizeOrderWithKitchenStatus(order, [], drinksList, isKitchenExcludedItem)
        );
        if (!signal.aborted) {
          setOrders((prev) => mergeOrdersById(prev, fastOrders));
        }

        const shouldRetryItemsFetch = (order, fetchedItems) => {
          if (Array.isArray(fetchedItems) && fetchedItems.length > 0) return false;
          const status = String(order?.status || "").toLowerCase();
          if (status === "draft") return false;
          const updatedAtMs = Date.parse(order?.updated_at || order?.created_at || "");
          if (!Number.isFinite(updatedAtMs)) return true;
          return Date.now() - updatedAtMs <= ORDER_ITEMS_RETRY_WINDOW_MS;
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
                  if (isAbortError(err)) throw err;
                  log.warn("⚠️ Orders fetch failed:", err);
                  results[current] = null;
                }
              }
            })
          );
          return results.filter(Boolean);
        };

        const withKitchenStatus = await runWithConcurrency(phoneOrders, 6, async (order) => {
          let items = await fetchOrderItemsApi(secureFetch, order.id, { signal });
          if (shouldRetryItemsFetch(order, items)) {
            await waitWithAbort(ORDER_ITEMS_RETRY_DELAY_MS, signal);
            items = await fetchOrderItemsApi(secureFetch, order.id, { signal });
          }
          const status = String(order?.status || "").toLowerCase();
          if (status === "draft" && (!items || items.length === 0)) {
            return null;
          }
          return normalizeOrderWithKitchenStatus(
            order,
            items,
            drinksList,
            isKitchenExcludedItem
          );
        });

        if (signal.aborted) return;
        setOrders((prev) => mergeOrdersById(prev, withKitchenStatus));
        setError("");
      };

      try {
        if (pollRetry) {
          await runWithPollingRetry(fetchTask, signal);
        } else {
          await fetchTask();
        }
      } catch (err) {
        if (isAbortError(err)) return;
        log.error("❌ fetchOrders failed:", err);
        setError(err?.message || "");
      } finally {
        if (ordersAbortRef.current === controller) {
          ordersAbortRef.current = null;
        }
        ordersRefreshingRef.current = false;
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [drinksList, hasPropOrders, isKitchenExcludedItem, log, orders.length, propOrders, secureFetch]
  );

  useEffect(() => {
    if (!hasPropOrders) return;
    const seeded = (propOrders || []).map((order) =>
      normalizeOrderWithKitchenStatus(
        order,
        Array.isArray(order?.items) ? order.items : [],
        drinksList,
        isKitchenExcludedItem
      )
    );
    setOrders(seeded);
    setError("");
    setLoading(false);
  }, [drinksList, hasPropOrders, isKitchenExcludedItem, propOrders]);

  const fetchDrinks = useCallback(async () => {
    try {
      const data = await fetchDrinksFromApi();
      setDrinksList(data.map((drink) => drink.name));
    } catch (err) {
      log.error("❌ Failed to fetch drinks:", err);
      setDrinksList([]);
    }
  }, []);

  const confirmOnlineOrder = useCallback(
    async (order) => {
      const orderId = order?.id;
      if (!orderId) return;
      setConfirmingOnlineOrders((prev) => ({ ...prev, [orderId]: true }));
      try {
        const result = await confirmOnlineOrderApi(secureFetch, orderId);
        toast.success(t("Order confirmed"));
        setOrders((prev) =>
          prev.map((entry) =>
            Number(entry.id) === Number(orderId) ? { ...entry, status: "confirmed" } : entry
          )
        );
        if (!propOrders) await fetchOrders();
        return result;
      } catch (err) {
        log.error("❌ Failed to confirm online order:", err);
        toast.error(err?.message || t("Failed to confirm order"));
      } finally {
        setConfirmingOnlineOrders((prev) => ({ ...prev, [orderId]: false }));
      }
    },
    [fetchOrders, propOrders, secureFetch, t, toast]
  );

  const fetchRestaurantCoords = useCallback(async () => {
    try {
      const data = await fetchCurrentRestaurantApi(secureFetch);
      if (data) {
        const lat =
          data.pos_location_lat ||
          data.restaurant_lat ||
          data.lat ||
          data.latitude ||
          data.latitude_existing;
        const lng =
          data.pos_location_lng ||
          data.restaurant_lng ||
          data.lng ||
          data.longitude ||
          data.longitude_existing;
        const address =
          data.pos_location ||
          data.restaurant_address ||
          data.address ||
          data.full_address ||
          data.location_address ||
          data.plus_code ||
          data.pluscode ||
          data.plus_code_short ||
          data.open_location_code ||
          "";
        const label = data.restaurant_name || data.name || data.restaurant || "Restaurant";
        if (lat && lng) {
          setRestaurantCoords({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            label,
            address,
          });
        }
      }
    } catch (err) {
      log.error("Failed to fetch restaurant coordinates:", err);
    }
  }, [secureFetch]);

  const fetchOrderStops = useCallback(
    async (ordersForStops) => {
      if (
        !restaurantCoords ||
        !restaurantCoords.address ||
        restaurantCoords.address === "Restaurant" ||
        restaurantCoords.address === restaurantCoords.label
      ) {
        try {
          const me = await fetchCurrentRestaurantApi(secureFetch);
          const lat =
            me.pos_location_lat ||
            me.restaurant_lat ||
            me.lat ||
            me.latitude ||
            me.latitude_existing;
          const lng =
            me.pos_location_lng ||
            me.restaurant_lng ||
            me.lng ||
            me.longitude ||
            me.longitude_existing;
          const address =
            me.pos_location ||
            me.restaurant_address ||
            me.address ||
            me.full_address ||
            me.location_address ||
            "";
          const label = me.restaurant_name || me.name || me.restaurant || "Restaurant";
          if (lat && lng) {
            setRestaurantCoords({
              lat: parseFloat(lat),
              lng: parseFloat(lng),
              label,
              address,
            });
          }
        } catch {
          // keep existing fallback
        }
      }

      const geoStops = await Promise.all(
        (ordersForStops || []).map(async (order) => {
          const addr = order.customer_address || order.address || order.delivery_address || "";

          let coords = null;
          if (addr) {
            try {
              coords = await geocodeAddress(addr);
            } catch (geoErr) {
              log.warn("🗺️ geocodeAddress failed:", geoErr);
            }
          }

          const fallbackLat =
            order.delivery_lat ||
            order.delivery_latitude ||
            order.lat ||
            order.latitude ||
            order.pickup_lat ||
            order.pickup_latitude;
          const fallbackLng =
            order.delivery_lng ||
            order.delivery_longitude ||
            order.lng ||
            order.longitude ||
            order.pickup_lng ||
            order.pickup_longitude;

          if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
            return {
              lat: coords.lat,
              lng: coords.lng,
              label: order.customer_name || t("Customer"),
              address: addr,
              orderId: order.id,
            };
          }

          if (fallbackLat && fallbackLng) {
            return {
              lat: Number(fallbackLat),
              lng: Number(fallbackLng),
              label: order.customer_name || t("Customer"),
              address: addr,
              orderId: order.id,
            };
          }

          log.warn("🗺️ No coords for order, skipping stop:", order.id, addr);
          return null;
        })
      );

      const restaurantStop = {
        label: restaurantCoords.label || "Restaurant",
        lat: restaurantCoords.lat,
        lng: restaurantCoords.lng,
        address: restaurantCoords.address || "",
      };

      return [restaurantStop, ...geoStops.filter(Boolean)];
    },
    [geocodeAddress, restaurantCoords, secureFetch, t]
  );

  const openRouteForSelectedDriver = useCallback(async (driverIdOverride) => {
    if (routeRefreshingRef.current) return mapStops;
    routeRefreshingRef.current = true;
    try {
      const effectiveDriverId =
        driverIdOverride !== undefined && driverIdOverride !== null
          ? String(driverIdOverride)
          : String(selectedDriverId || "");
      const selectedRaw = effectiveDriverId.trim();
      const selectedId = Number(selectedRaw);
      const hasSelectedDriver = selectedRaw !== "";

      const scopedOrders = hasSelectedDriver
        ? (orders || []).filter((order) => {
            const driverRaw = String(order?.driver_id ?? "").trim();
            if (!driverRaw) return false;
            if (driverRaw === selectedRaw) return true;
            return Number(driverRaw) === selectedId;
          })
        : orders || [];

      const stops = await fetchOrderStops(scopedOrders);
      setMapStops(stops);
      return stops;
    } finally {
      routeRefreshingRef.current = false;
    }
  }, [fetchOrderStops, mapStops, orders, selectedDriverId]);

  const assignDriverToOrder = useCallback(
    async (order, driverId) => {
      await updateOrderApi(secureFetch, order.id, {
        driver_id: driverId,
        total: order.total,
        payment_method: order.payment_method,
      });
      setOrders((prev) =>
        prev.map((entry) => (entry.id === order.id ? { ...entry, driver_id: driverId } : entry))
      );
    },
    [secureFetch]
  );

  const patchDriverStatus = useCallback(
    async (orderId, driverStatus, options) => {
      return patchOrderDriverStatusApi(
        secureFetch,
        orderId,
        { driver_status: driverStatus },
        options
      );
    },
    [secureFetch]
  );

  const closeOrder = useCallback(
    async (orderId) => {
      await closeOrderApi(secureFetch, orderId);
      setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(orderId)));
    },
    [secureFetch]
  );

  const closeOrderIdempotent = useCallback(
    async (orderId) => {
      try {
        await closeOrderApi(secureFetch, orderId);
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
        const status = err?.details?.status;
        if (!(status === 400 && message.includes("already closed"))) {
          throw err;
        }
      }
      setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(orderId)));
    },
    [secureFetch]
  );

  const removeOrderFromState = useCallback((orderId) => {
    setOrders((prev) => prev.filter((order) => Number(order.id) !== Number(orderId)));
  }, []);

  const updateOrder = useCallback(
    async (orderId, payload) => {
      return updateOrderApi(secureFetch, orderId, payload);
    },
    [secureFetch]
  );

  const createReceiptMethods = useCallback(
    async (payload) => {
      return createReceiptMethodsApi(secureFetch, payload);
    },
    [secureFetch]
  );

  const fetchReceiptMethods = useCallback(
    async (receiptId) => {
      return fetchReceiptMethodsApi(secureFetch, receiptId);
    },
    [secureFetch]
  );

  const cancelOrder = useCallback(
    async (orderId, payload) => {
      return cancelOrderApi(secureFetch, orderId, payload);
    },
    [secureFetch]
  );

  const selectOrder = useCallback((orderId) => {
    setSelectedOrderId(orderId ? String(orderId) : "");
  }, []);

  const fetchDriverReport = useCallback(async () => {
    if (!reportFromDate || !reportToDate) return;
    if (driverReportRefreshingRef.current) return;

    if (driverReportAbortRef.current) {
      driverReportAbortRef.current.abort();
    }
    const controller = new AbortController();
    const { signal } = controller;
    driverReportAbortRef.current = controller;
    driverReportRefreshingRef.current = true;

    setReportLoading(true);
    setDriverReport(null);
    try {
      let driverList = Array.isArray(drivers) ? drivers : [];
      let driverIds = driverList.map((driver) => Number(driver.id)).filter(Number.isFinite);

      if (driverIds.length === 0) {
        const list = await fetchDriversApi(secureFetch, { signal });
        driverList = Array.isArray(list) ? list : list?.drivers || [];
        driverIds = driverList.map((driver) => Number(driver.id)).filter(Number.isFinite);
      }
      if (driverIds.length === 0) {
        setDriverReport({ error: "No drivers available" });
        return;
      }

      const selectedId = Number(selectedDriverId);
      const hasSelectedDriver =
        String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);
      if (hasSelectedDriver) {
        driverIds = [selectedId];
      }

      const dates =
        reportFromDate === reportToDate
          ? [reportFromDate]
          : buildDateRange(reportFromDate, reportToDate);
      if (dates.length === 0) {
        setDriverReport({ error: "Invalid date range" });
        return;
      }

      const tasks = [];
      driverIds.forEach((driverId) => {
        dates.forEach((date) => {
          tasks.push({ driverId, date });
        });
      });

      const limit = 6;
      const results = new Array(tasks.length);
      let idx = 0;

      await Promise.all(
        Array.from({ length: Math.min(limit, tasks.length) }, async () => {
          while (idx < tasks.length) {
            const current = idx++;
            const task = tasks[current];
            try {
              const data = await fetchDriverReportApi(
                secureFetch,
                {
                  driverId: task.driverId,
                  date: task.date,
                },
                { signal }
              );
              results[current] = { data, driverId: task.driverId };
            } catch (err) {
              if (isAbortError(err)) throw err;
              results[current] = null;
            }
          }
        })
      );

      const aggregated = {
        packets_delivered: 0,
        total_sales: 0,
        sales_by_method: {},
        orders: [],
      };

      const driverNameById = new Map(
        (driverList || []).map((driver) => [
          Number(driver.id),
          driver.name || driver.full_name || driver.username || String(driver.id),
        ])
      );

      results.forEach((result) => {
        if (!result || !result.data) return;
        const { data, driverId } = result;
        aggregated.packets_delivered += Number(data.packets_delivered || 0);
        aggregated.total_sales += Number(data.total_sales || 0);
        if (data.sales_by_method && typeof data.sales_by_method === "object") {
          Object.entries(data.sales_by_method).forEach(([method, amount]) => {
            aggregated.sales_by_method[method] =
              Number(aggregated.sales_by_method[method] || 0) + Number(amount || 0);
          });
        }
        if (Array.isArray(data.orders)) {
          aggregated.orders.push(
            ...data.orders.map((ord) => {
              const rawDriverId = ord.driver_id ?? ord.driverId ?? ord.driver?.id ?? null;
              const resolvedDriverId =
                rawDriverId != null ? Number(rawDriverId) : Number(driverId);
              const driverName =
                ord.driver_name ||
                ord.driverName ||
                ord.driver?.name ||
                (Number.isFinite(resolvedDriverId)
                  ? driverNameById.get(resolvedDriverId)
                  : null) ||
                null;
              return {
                ...ord,
                driver_id: resolvedDriverId ?? ord.driver_id,
                driver_name: driverName,
              };
            })
          );
        }
      });

      if (signal.aborted) return;
      setDriverReport(aggregated);
    } catch (err) {
      if (isAbortError(err)) return;
      setDriverReport({ error: "Failed to load driver report" });
    } finally {
      if (driverReportAbortRef.current === controller) {
        driverReportAbortRef.current = null;
      }
      driverReportRefreshingRef.current = false;
      if (!signal.aborted) {
        setReportLoading(false);
      }
    }
  }, [drivers, reportFromDate, reportToDate, secureFetch, selectedDriverId]);

  useEffect(() => {
    fetchRestaurantCoords();
  }, [fetchRestaurantCoords]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  useEffect(() => {
    fetchDrinks();
  }, [fetchDrinks]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchProductsApi(secureFetch);
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
            ? data.products
            : data?.product
              ? [data.product]
              : [];
        const next = {};
        for (const product of list) {
          const id = Number(product?.id);
          const prep = parseFloat(
            product?.preparation_time ?? product?.prep_time ?? product?.prepTime
          );
          if (!Number.isFinite(id) || !Number.isFinite(prep) || prep <= 0) continue;
          next[id] = prep;
        }
        if (mounted) setProductPrepById(next);
      } catch {
        if (mounted) setProductPrepById({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [secureFetch]);

  useEffect(() => {
    fetchIntegrationsSettingsApi(secureFetch)
      .then((data) => setIntegrationsSettings(data || {}))
      .catch(() => setIntegrationsSettings({}));
  }, [secureFetch]);

  useEffect(() => {
    fetchKitchenCompileSettingsApi(secureFetch)
      .then((data) => {
        const { normalizedIds, normalizedCategories } = normalizeCompileSettings(data);
        setExcludedKitchenIds(normalizedIds);
        setExcludedKitchenCategories(normalizedCategories);
      })
      .catch(() => {
        setExcludedKitchenIds([]);
        setExcludedKitchenCategories([]);
      });
  }, [secureFetch]);

  useEffect(() => {
    const handleDrinkAdded = (drink) => {
      setDrinksList((prev) => {
        if (!prev.includes(drink.name)) return [...prev, drink.name];
        return prev;
      });
    };

    const handleDrinkDeleted = ({ id }) => {
      setDrinksList((prev) => prev.filter((name) => name.id !== id));
    };

    socket.on("drink_added", handleDrinkAdded);
    socket.on("drink_deleted", handleDrinkDeleted);

    return () => {
      socket.off("drink_added", handleDrinkAdded);
      socket.off("drink_deleted", handleDrinkDeleted);
    };
  }, [socket]);

  useEffect(() => {
    let mounted = true;
    let intervalId;
    const scheduleSocketRefresh = () => {
      if (hasPropOrders) return;
      if (!mounted) return;
      if (socketRefreshTimerRef.current) return;
      socketRefreshTimerRef.current = setTimeoutFn(async () => {
        socketRefreshTimerRef.current = null;
        if (!mounted || ordersRefreshingRef.current) return;
        await fetchOrders({ pollRetry: true });
      }, 400);
    };

    const runPollingRefresh = async () => {
      if (hasPropOrders) return;
      if (!mounted || ordersRefreshingRef.current) return;
      await fetchOrders({ pollRetry: true });
    };

    if (!hasPropOrders) {
      fetchOrders();
    } else {
      setLoading(false);
    }

    const handleOrderClosed = (payload = {}) => {
      const closedId = Number(payload.orderId);
      if (Number.isFinite(closedId)) {
        setOrders((prev) => prev.filter((order) => Number(order.id) !== closedId));
      }
      scheduleSocketRefresh();
    };

    const handleConnect = () => {
      setTimeoutFn(runPollingRefresh, 800);
    };

    if (!hasPropOrders) {
      socket.on("orders_updated", scheduleSocketRefresh);
      socket.on("order_closed", handleOrderClosed);
      socket.on("connect", handleConnect);

      if (pollingEnabled) {
        intervalId = setIntervalFn(runPollingRefresh, pollingIntervalMs);
      }
    }

    return () => {
      mounted = false;
      if (intervalId) clearIntervalFn(intervalId);
      socket.off("orders_updated", scheduleSocketRefresh);
      socket.off("order_closed", handleOrderClosed);
      socket.off("connect", handleConnect);
      if (socketRefreshTimerRef.current) {
        clearTimeoutFn(socketRefreshTimerRef.current);
        socketRefreshTimerRef.current = null;
      }
      if (ordersAbortRef.current) {
        ordersAbortRef.current.abort();
      }
      if (driverReportAbortRef.current) {
        driverReportAbortRef.current.abort();
      }
    };
  }, []);

  const filteredOrders = useMemo(
    () => selectFilteredOrders(orders, statusFilter),
    [orders, statusFilter]
  );

  const safeOrders = useMemo(() => selectSafeOrders(filteredOrders), [filteredOrders]);
  const routeOrders = useMemo(
    () => selectRouteOrders(orders, selectedDriverId),
    [orders, selectedDriverId]
  );
  const totalByMethod = useMemo(
    () => selectTotalByMethod(filteredOrders, paymentMethodLabels),
    [filteredOrders, paymentMethodLabels]
  );

  const drinkSummaryByDriver = useMemo(
    () =>
      selectDrinkSummaryByDriver({
        drivers,
        orders,
        drinksList,
        customerLabel: t("Customer"),
      }),
    [drivers, drinksList, orders, t]
  );

  const filteredDrinkSummaryByDriver = useMemo(
    () => selectFilteredDrinkSummaryByDriver(drinkSummaryByDriver, selectedDriverId),
    [drinkSummaryByDriver, selectedDriverId]
  );

  const assignedOrderCountForSelectedDriver = useMemo(
    () => selectAssignedOrderCount(orders, selectedDriverId),
    [orders, selectedDriverId]
  );

  const ordersByTable = useMemo(() => {
    const groups = {};
    (orders || []).forEach((order) => {
      const tableKey =
        order.table_id ?? order.tableId ?? order.table_number ?? order.tableNumber ?? "";
      if (!tableKey) return;
      if (!groups[tableKey]) groups[tableKey] = [];
      groups[tableKey].push(order);
    });
    return groups;
  }, [orders]);

  const deliveryOrders = useMemo(
    () => (filteredOrders || []).filter((order) => String(order?.order_type) === "packet"),
    [filteredOrders]
  );
  const phoneOrders = useMemo(
    () => (filteredOrders || []).filter((order) => String(order?.order_type) === "phone"),
    [filteredOrders]
  );
  const takeawayOrders = useMemo(
    () => (filteredOrders || []).filter((order) => String(order?.order_type) === "takeaway"),
    [filteredOrders]
  );

  const actions = useMemo(
    () => ({
      confirmOnlineOrder,
      assignDriverToOrder,
      patchDriverStatus,
      closeOrder,
      closeOrderIdempotent,
      cancelOrder,
      createReceiptMethods,
      fetchReceiptMethods,
      updateOrder,
      fetchOrders,
      fetchDrivers,
      fetchDrinks,
      fetchDriverReport,
      openRouteForSelectedDriver,
      setOrders,
      removeOrderFromState,
      selectOrder,
      setMapStops,
    }),
    [
      assignDriverToOrder,
      cancelOrder,
      closeOrder,
      closeOrderIdempotent,
      confirmOnlineOrder,
      createReceiptMethods,
      fetchDriverReport,
      fetchDrivers,
      fetchDrinks,
      fetchOrders,
      fetchReceiptMethods,
      openRouteForSelectedDriver,
      removeOrderFromState,
      selectOrder,
      patchDriverStatus,
      updateOrder,
      setMapStops,
      setOrders,
    ]
  );

  return {
    orders,
    setOrders,
    loading,
    error,
    drivers,
    restaurantCoords,
    mapStops,
    drinksList,
    normalizedDrinkNames,
    excludedKitchenIds,
    excludedKitchenCategories,
    productPrepById,
    integrationsSettings,
    confirmingOnlineOrders,
    statusFilter,
    setStatusFilter,
    selectedDriverId,
    setSelectedDriverId,
    selectedOrderId,
    selectOrder,
    driverReport,
    reportFromDate,
    setReportFromDate,
    reportToDate,
    setReportToDate,
    reportLoading,
    refresh: fetchOrders,
    fetchDrivers,
    fetchDrinks,
    fetchDriverReport,
    openRouteForSelectedDriver,
    filteredOrders,
    safeOrders,
    routeOrders,
    totalByMethod,
    drinkSummaryByDriver,
    filteredDrinkSummaryByDriver,
    assignedOrderCountForSelectedDriver,
    ordersByTable,
    deliveryOrders,
    phoneOrders,
    takeawayOrders,
    getRelevantOrderItems,
    areDriverItemsDelivered,
    isKitchenExcludedItem,
    actions,
  };
}
