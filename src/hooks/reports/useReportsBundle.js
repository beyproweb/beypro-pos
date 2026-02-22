import { useCallback, useEffect, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const initialState = {
  loading: false,
  error: null,
  paymentData: [],
  productSalesData: [],
  cashRegisterData: [],
  expensesData: [],
  staffPayments: [],
  supplierPayments: [],
  closedOrders: [],
  orderItems: [],
  summary: null,
  totalPayments: 0,
  registerEvents: [],
  onlinePlatforms: {},
};

const CACHE_VERSION = "reports.cache.v2";

function getCacheKey(from, to) {
  return `${CACHE_VERSION}:bundle:${from}:${to}`;
}

function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return null;
    return { data: parsed.data, cachedAt: parsed.cachedAt || 0 };
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ data, cachedAt: Date.now() })
    );
  } catch {
    // Ignore cache write failures
  }
}

export default function useReportsBundle({ from, to }) {
  const [state, setState] = useState(() => {
    if (!from || !to) return initialState;
    const cachedEntry = readCache(getCacheKey(from, to));
    return cachedEntry?.data
      ? { ...cachedEntry.data, loading: false, error: null }
      : initialState;
  });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!from || !to) return;

    let cancelled = false;
    const cacheKey = getCacheKey(from, to);
    const cachedEntry = readCache(cacheKey);
    const cached = cachedEntry?.data || null;

    const canUseCache = reloadToken === 0 && !!cached;
    if (canUseCache) setState({ ...cached, loading: false, error: null });

    async function load({ silent = false } = {}) {
      if (!silent) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      } else {
        setState((prev) => ({ ...prev, error: null }));
      }

      try {
        const [
          payment,
          categories,
          cashTrends,
          expenses,
          staffPayments,
          supplierPayments,
          history,
          items,
          summary,
          events,
          online,
        ] = await Promise.all([
          secureFetch(`/reports/sales-by-payment-method?from=${from}&to=${to}`),
          secureFetch(`/reports/sales-by-category?from=${from}&to=${to}`),
          secureFetch(`/reports/cash-register-trends`),
          secureFetch(`/reports/expenses?from=${from}&to=${to}`),
          secureFetch(`/reports/staff-payments?from=${from}&to=${to}`),
          secureFetch(`/reports/supplier-payments?from=${from}&to=${to}`),
          secureFetch(`/reports/history?from=${from}&to=${to}`),
          secureFetch(`/reports/order-items?from=${from}&to=${to}`),
          secureFetch(`/reports/summary?from=${from}&to=${to}`),
          secureFetch(`/reports/cash-register-events?from=${from}&to=${to}`),
          secureFetch(`/reports/online-sales?from=${from}&to=${to}`),
        ]);

        const orders = Array.isArray(history) ? history : [];

        const enriched = await Promise.all(
          orders.map(async (order) => {
            const [itemsForOrder, suborders] = await Promise.all([
              secureFetch(`/orders/${order.id}/items`).catch(() => []),
              secureFetch(`/orders/${order.id}/suborders`).catch(() => []),
            ]);

            const receiptIds = [
              ...new Set([
                ...itemsForOrder.map((i) => i.receipt_id).filter(Boolean),
                ...suborders.map((s) => s.receipt_id).filter(Boolean),
              ]),
            ];

            const receiptMethods = (
              await Promise.all(
                receiptIds.map((receiptId) =>
                  secureFetch(`/reports/receipt-methods/${receiptId}`).catch(() => [])
                )
              )
            ).flat();

            return { ...order, items: itemsForOrder, suborders, receiptMethods };
          })
        );

        const filteredOrders = enriched.filter(
          (order) =>
            order.order_type === "phone" ||
            order.order_type === "packet" ||
            (Array.isArray(order.items) && order.items.length > 0)
        );

        const paymentData = Array.isArray(payment) ? payment : [];
        const totalPayments = paymentData.reduce(
          (sum, entry) => sum + (parseFloat(entry.value) || 0),
          0
        );

        if (cancelled) return;

        const nextState = {
          loading: false,
          error: null,
          paymentData,
          productSalesData: Array.isArray(categories) ? categories : [],
          cashRegisterData: Array.isArray(cashTrends) ? cashTrends : [],
          expensesData: Array.isArray(expenses) ? expenses : [],
          staffPayments: Array.isArray(staffPayments) ? staffPayments : [],
          supplierPayments: Array.isArray(supplierPayments) ? supplierPayments : [],
          closedOrders: filteredOrders,
          orderItems: Array.isArray(items) ? items : [],
          summary: summary ?? null,
          totalPayments,
          registerEvents: Array.isArray(events) ? events : [],
          onlinePlatforms: online && typeof online === "object" ? online : {},
        };

        setState(nextState);
        writeCache(cacheKey, nextState);
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error : new Error("Failed to load report data"),
        }));
      }
    }

    load({ silent: canUseCache });

    return () => {
      cancelled = true;
    };
  }, [from, to, reloadToken]);

  return { ...state, refetch };
}
