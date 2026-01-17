import React, { useEffect, useState, useRef, useMemo, useCallback  } from "react";
import { geocodeAddress } from '../utils/geocode';
import LiveRouteMap from "../components/LiveRouteMap";
import socket from "../utils/socket";
import PhoneOrderModal from "../modals/PhoneOrderModal";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import secureFetch from "../utils/secureFetch";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { DEFAULT_PAYMENT_METHODS, getPaymentMethodLabel } from "../utils/paymentMethods";
import { useCurrency } from "../context/CurrencyContext";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { logCashRegisterEvent } from "../utils/cashDrawer";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
const API_URL = import.meta.env.VITE_API_URL || "";

function DrinkSettingsModal({ open, onClose, fetchDrinks, summaryByDriver = [] }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("manage");

  useEffect(() => {
    if (open) setActiveTab("summary");
  }, [open]);



function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty;
    const extras = (item.extras || []).reduce(
      (s, ex) => s + (Number(ex.price || ex.extraPrice || 0) * (Number(ex.quantity) || 1)),
      0
    ) * qty;
    return sum + base + extras;
  }, 0);
}

  // Fetch drinks on modal open
useEffect(() => {
  if (!open) return;

  const fetchDrinks = async () => {
    setLoading(true);
    try {
      const data = await secureFetch("/drinks");
      setDrinks(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("❌ Failed to fetch drinks in modal:", err);
      setError(t("Failed to load drinks"));
      setDrinks([]);
    } finally {
      setLoading(false);
    }
  };

  fetchDrinks();
}, [open]);


const addDrink = async () => {
  const name = input.trim();
  if (!name || drinks.some(d => d.name.toLowerCase() === name.toLowerCase())) {
    setInput("");
    return;
  }
  setSaving(true);
  try {
    await secureFetch("/drinks", {
      method: "POST",
      body: JSON.stringify({ name }),
    });

    setInput("");
    setError("");
    // ✅ Fix here
    const updated = await secureFetch("/drinks");
    setDrinks(updated);
    if (fetchDrinks) fetchDrinks();
  } catch {
    setError(t("Failed to add drink."));
  } finally {
    setSaving(false);
  }
};

const removeDrink = async (id) => {
  setSaving(true);
  try {
    await secureFetch(`/drinks/${id}`, { method: "DELETE" });
    setError("");
    // ✅ Fix here
    const updated = await secureFetch("/drinks");
    setDrinks(updated);
    if (fetchDrinks) fetchDrinks();
  } catch {
    setError(t("Failed to delete drink."));
  } finally {
    setSaving(false);
  }
};

  if (!open) return null;
  const tabs = [
    { key: "summary", label: t("Drinks") },
    { key: "manage", label: t("Manage Drinks") },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 p-7 max-w-4xl w-full text-slate-900">
        <h2 className="font-semibold text-xl sm:text-2xl mb-4 tracking-tight text-slate-900">
          ⚙️ {t("Settings")}
        </h2>

        <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-2xl p-1 mb-4">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={isActive}
                className={`px-4 py-2 rounded-2xl text-sm sm:text-base font-semibold transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === "manage" ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <input
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-300"
                value={input}
                placeholder={t("Drink name (e.g. Cola)")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDrink()}
                disabled={saving}
              />
              <button
                className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition"
                onClick={addDrink}
                disabled={saving || !input.trim()}
              >
                {t("Add")}
              </button>
            </div>

            {loading ? (
              <div className="text-slate-500 mb-2">{t("Loading drinks...")}</div>
            ) : (
              <div className="mb-4 flex flex-wrap gap-2 max-h-[38vh] overflow-y-auto pr-1">
                {drinks.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded-xl border border-slate-200"
                  >
                    {d.name}
                    <button
                      className="text-rose-500 ml-1 hover:text-rose-600 transition"
                      onClick={() => removeDrink(d.id)}
                      disabled={saving}
                      title={t("Delete")}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {drinks.length === 0 && !loading && (
                  <span className="text-slate-400 italic">
                    {t("No drinks defined yet.")}
                  </span>
                )}
              </div>
            )}
            {error && <div className="text-rose-500 mb-2">{error}</div>}
          </>
        ) : (
          <div className="flex flex-col gap-4 max-h-[48vh] overflow-y-auto pr-1">
            {summaryByDriver.length === 0 ? (
              <div className="text-slate-500 text-sm">
                {t("No drink activity yet. Drinks linked to orders will appear here grouped by driver.")}
              </div>
            ) : (
              summaryByDriver.map((driver) => (
                <div
                  key={driver.driverId}
                  className="border border-slate-200 rounded-3xl p-4 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-lg font-semibold text-slate-900">
                      🛵 {driver.driverName}
                    </span>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      {driver.totals.map((total) => (
                        <span
                          key={total.key}
                          className="inline-flex items-center px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 text-sm font-semibold"
                        >
                          {total.qty}× {total.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {driver.customers.map((customer) => (
                      <div
                        key={customer.key}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm"
                      >
                        <div className="font-semibold text-slate-800">
                          {customer.name}
                        </div>
                        {customer.address && (
                          <div className="text-xs text-slate-500 mt-1 leading-snug">
                            {customer.address}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {customer.drinks.map((drink) => (
                            <span
                              key={`${customer.key}-${drink.key}`}
                              className="inline-flex items-center px-3 py-1 rounded-xl bg-white text-emerald-700 border border-emerald-200 text-sm font-semibold shadow-sm"
                            >
                              {drink.qty}× {drink.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            className="px-4 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            onClick={onClose}
            disabled={saving}
          >
            {t("Cancel")}
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => {
              if (fetchDrinks) fetchDrinks();
              onClose();
            }}
            disabled={saving}
          >
            {t("Done")}
          </button>
        </div>
      </div>
    </div>
  );
}


// Restaurant as the first stop
const RESTAURANT = {
  label: "Restaurant",
  lat: 38.099579,
  lng: 27.718065
};

export default function Orders({ orders: propOrders, hideModal = false }) {
  const paymentMethods = usePaymentMethods();
  const methodOptionSource = useMemo(
    () => (paymentMethods.length ? paymentMethods : DEFAULT_PAYMENT_METHODS),
    [paymentMethods]
  );
  const paymentMethodLabels = useMemo(
    () => methodOptionSource.map((method) => method.label),
    [methodOptionSource]
  );
  const fallbackMethodLabel = paymentMethodLabels[0] || "Cash";

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [editingPayment, setEditingPayment] = useState({});
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [mapStops, setMapStops] = useState([]);
  const [mapOrders, setMapOrders] = useState([]);
  const [showRoute, setShowRoute] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [editingDriver, setEditingDriver] = useState({});
  const [selectedDriverId, setSelectedDriverId] = useState("all");
  const [restaurantCoords, setRestaurantCoords] = useState({ lat: 38.099579, lng: 27.718065, label: "Restaurant", address: "" }); // Fetch from /api/me
  const socketRef = useRef();
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [activeTab, setActiveTab] = useState("phone");
  const { t } = useTranslation();
  const { formatCurrency, config } = useCurrency();
  const [showDrinkModal, setShowDrinkModal] = useState(false);
const [drinksList, setDrinksList] = useState([]);
const normalizedDrinkNames = useMemo(
  () =>
    drinksList.map((d) =>
      (d || "").replace(/[\s\-]/g, "").toLowerCase()
    ),
  [drinksList]
);
const [driverReport, setDriverReport] = useState(null);
const [reportFromDate, setReportFromDate] = useState(
  () => new Date().toISOString().slice(0, 10)
);
const [reportToDate, setReportToDate] = useState(
  () => new Date().toISOString().slice(0, 10)
);
const [reportLoading, setReportLoading] = useState(false);
const [showDriverReport, setShowDriverReport] = useState(false);
const [excludedKitchenIds, setExcludedKitchenIds] = useState([]);
const [excludedKitchenCategories, setExcludedKitchenCategories] = useState([]);
const [productPrepById, setProductPrepById] = useState({});
  const [autoConfirmOrders, setAutoConfirmOrders] = useState(false);
const showDriverColumn = selectedDriverId === "all";

const [showPaymentModal, setShowPaymentModal] = useState(false);
const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
const [splitPayments, setSplitPayments] = useState([{ method: "", amount: "" }]);
const [pendingCloseOrderId, setPendingCloseOrderId] = useState(null);
const [showCancelModal, setShowCancelModal] = useState(false);
const [cancelOrder, setCancelOrder] = useState(null);
const [cancelReason, setCancelReason] = useState("");
const [cancelLoading, setCancelLoading] = useState(false);
const [refundMethodId, setRefundMethodId] = useState("");

const getDefaultRefundMethod = useCallback(
  (order) => {
    if (!methodOptionSource.length) return "";
    const normalizedOrderPayment = (order?.payment_method || "").trim().toLowerCase();
    if (!normalizedOrderPayment) {
      return methodOptionSource[0].id;
    }
    const match = methodOptionSource.find((method) => {
      const label = (method.label || "").trim().toLowerCase();
      const id = (method.id || "").trim().toLowerCase();
      return label === normalizedOrderPayment || id === normalizedOrderPayment;
    });
    return match?.id || methodOptionSource[0].id;
  },
  [methodOptionSource]
);

const handlePacketPrint = async (orderId) => {
  if (!orderId) {
    toast.warn(t("No order selected to print"));
    return;
  }
  try {
    const printable = await fetchOrderWithItems(orderId);
    const ok = await printViaBridge("", printable);
    toast[ok ? "success" : "warn"](
      ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
    );
  } catch (err) {
    console.error("❌ Print failed:", err);
    toast.error(t("Failed to print receipt"));
  }
};

const openPaymentModalForOrder = useCallback(
  (order, { closeAfterSave = false } = {}) => {
    if (!order) return;
    const total =
      calcOrderTotalWithExtras(order) - calcOrderDiscount(order);
    setEditingPaymentOrder(order);
    setPendingCloseOrderId(closeAfterSave ? order.id : null);
    setSplitPayments([
      {
        method: fallbackMethodLabel,
        amount: total > 0 && closeAfterSave ? total.toFixed(2) : "",
      },
    ]);
    setShowPaymentModal(true);
  },
  [fallbackMethodLabel]
);

const closePaymentModal = useCallback(() => {
  setShowPaymentModal(false);
  setEditingPaymentOrder(null);
  setPendingCloseOrderId(null);
}, []);

useEffect(() => {
  if (!methodOptionSource.length) return;
  setRefundMethodId((prev) => {
    if (prev && methodOptionSource.some((method) => method.id === prev)) {
      return prev;
    }
    return getDefaultRefundMethod(cancelOrder);
  });
}, [cancelOrder, getDefaultRefundMethod, methodOptionSource]);

const isOrderPaid = useCallback((order) => {
  const status = String(order?.status || "").trim().toLowerCase();
  const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();
  if (order?.is_paid === true || status === "paid" || paymentStatus === "paid") {
    return true;
  }
  const normalizedPayment = String(order?.payment_method || "").trim().toLowerCase();
  if (!normalizedPayment) return false;
  const onlinePayments = [
    "online",
    "online payment",
    "online card",
    "yemeksepeti online",
  ];
  return onlinePayments.some((type) => normalizedPayment.includes(type));
}, []);

const openCancelModalForOrder = useCallback(
  (order) => {
    if (!order) return;
    setCancelOrder(order);
    setCancelReason("");
    setCancelLoading(false);
    setRefundMethodId(getDefaultRefundMethod(order));
    setShowCancelModal(true);
  },
  [getDefaultRefundMethod]
);

const closeCancelModal = useCallback(() => {
  setShowCancelModal(false);
  setCancelOrder(null);
  setCancelReason("");
  setCancelLoading(false);
}, []);


function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty;
    const extras = (item.extras || []).reduce(
      (s, ex) => s + (Number(ex.price || ex.extraPrice || 0) * (Number(ex.quantity) || 1)),
      0
    ) * qty;
    return sum + base + extras;
  }, 0);
}

function calcOrderDiscount(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty; // extras excluded
    const dv = Number(item?.discount_value) || 0;
    const dt = item?.discount_type;
    if (dv <= 0) return sum;
    if (dt === "percent") return sum + base * (dv / 100);
    if (dt === "fixed") return sum + dv;
    return sum;
  }, 0);
}

function calcOrderBaseTotal(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty;
    return sum + base; // extras excluded
  }, 0);
}

function normalizeDriverStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  // Driver mobile API uses `picked_up`; dashboard uses `on_road`.
  if (normalized === "picked_up") return "on_road";
  return normalized;
}

useEffect(() => {
  if (showPaymentModal && editingPaymentOrder) {
    const fetchSplit = async () => {
      try {
        if (editingPaymentOrder.receipt_id) {
          const split = await secureFetch(
            `/receipt-methods/${editingPaymentOrder.receipt_id}`
          );

          if (Array.isArray(split) && split.length) {
            setSplitPayments(
              split.map((row) => ({
                method: row.payment_method,
                amount: row.amount,
              }))
            );
            return;
          }
        }

        const totalWithExtras = calcOrderTotalWithExtras(editingPaymentOrder);
        const discounted =
          totalWithExtras - calcOrderDiscount(editingPaymentOrder);

        setSplitPayments([
          {
            method: editingPaymentOrder.payment_method || fallbackMethodLabel,
            amount: discounted,
          },
        ]);
      } catch (err) {
        console.warn("⚠️ Failed to fetch split payments:", err);

        const totalWithExtras = calcOrderTotalWithExtras(editingPaymentOrder);
        const discounted =
          totalWithExtras - calcOrderDiscount(editingPaymentOrder);
        setSplitPayments([
          {
            method: editingPaymentOrder.payment_method || fallbackMethodLabel,
            amount: discounted,
          },
        ]);
      }
    };

    fetchSplit();
  }
  // eslint-disable-next-line
}, [showPaymentModal, editingPaymentOrder, fallbackMethodLabel]);




useEffect(() => {
  secureFetch("/settings/integrations")
    .then((data) => setAutoConfirmOrders(!!data.auto_confirm_orders))
    .catch(() => setAutoConfirmOrders(false));
}, []);

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

async function fetchDriverReport() {
  if (!selectedDriverId || !reportFromDate || !reportToDate) return;
  setReportLoading(true);
  setDriverReport(null);
  try {
    if (selectedDriverId === "all") {
      let driverList = Array.isArray(drivers) ? drivers : [];
      let driverIds = driverList.map((d) => Number(d.id)).filter(Number.isFinite);
      if (driverIds.length === 0) {
        const list = await fetchDrivers();
        driverList = Array.isArray(list) ? list : [];
        driverIds = driverList.map((d) => Number(d.id)).filter(Number.isFinite);
      }
      if (driverIds.length === 0) {
        setDriverReport({ error: "No drivers available" });
        return;
      }

      const dates = reportFromDate === reportToDate ? [reportFromDate] : buildDateRange(reportFromDate, reportToDate);
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
              const data = await secureFetch(
                `/orders/driver-report?driver_id=${task.driverId}&date=${task.date}`
              );
              results[current] = { data, driverId: task.driverId };
            } catch {
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
        (driverList || []).map((d) => [
          Number(d.id),
          d.name || d.full_name || d.username || String(d.id),
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

      setDriverReport(aggregated);
      return;
    }

    if (reportFromDate === reportToDate) {
      const data = await secureFetch(
        `/orders/driver-report?driver_id=${selectedDriverId}&date=${reportFromDate}`
      );
      setDriverReport(data);
      return;
    }

    const dates = buildDateRange(reportFromDate, reportToDate);
    if (dates.length === 0) {
      setDriverReport({ error: "Invalid date range" });
      return;
    }

    const limit = 4;
    const results = new Array(dates.length);
    let idx = 0;

    await Promise.all(
      Array.from({ length: Math.min(limit, dates.length) }, async () => {
        while (idx < dates.length) {
          const current = idx++;
          const date = dates[current];
          try {
            results[current] = await secureFetch(
              `/orders/driver-report?driver_id=${selectedDriverId}&date=${date}`
            );
          } catch {
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

    results.forEach((data) => {
      if (!data) return;
      aggregated.packets_delivered += Number(data.packets_delivered || 0);
      aggregated.total_sales += Number(data.total_sales || 0);
      if (data.sales_by_method && typeof data.sales_by_method === "object") {
        Object.entries(data.sales_by_method).forEach(([method, amount]) => {
          aggregated.sales_by_method[method] =
            Number(aggregated.sales_by_method[method] || 0) + Number(amount || 0);
        });
      }
      if (Array.isArray(data.orders)) {
        aggregated.orders.push(...data.orders);
      }
    });

    setDriverReport(aggregated);
  } catch (err) {
    setDriverReport({ error: "Failed to load driver report" });
  } finally {
    setReportLoading(false);
  }
}

const handleToggleDriverReport = () => {
  setShowDriverReport((prev) => {
    const next = !prev;
    if (!prev) {
      setTimeout(() => {
        fetchDriverReport();
      }, 0);
    }
    return next;
  });
};

useEffect(() => {
  if (!showDriverReport) return;
  fetchDriverReport();
}, [selectedDriverId, reportFromDate, reportToDate, showDriverReport]);



useEffect(() => {
  let mounted = true;
  let debounceTimer;

  const safeFetch = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!mounted) return;
      await fetchOrders();          // ✅ keeps items
    }, 400);
  };

  // initial load
  fetchOrders();

  socket.on("orders_updated", safeFetch);
  const handleOrderClosed = (payload = {}) => {
    const closedId = Number(payload.orderId);
    if (Number.isFinite(closedId)) {
      setOrders((prev) => prev.filter((o) => Number(o.id) !== closedId));
    }
    safeFetch();
  };
  socket.on("order_closed", handleOrderClosed);
// 👇 NEW — ensures late-fetch if the event came too early
socket.on("connect", () => {
  setTimeout(fetchOrders, 800);
});
  const interval = setInterval(fetchOrders, 15000);

  return () => {
    mounted = false;
    clearInterval(interval);
    socket.off("orders_updated", safeFetch);
    socket.off("order_closed", handleOrderClosed);
    clearTimeout(debounceTimer);
  };
}, []);






useEffect(() => {
  // Fetch restaurant coordinates and address from /api/me
  const fetchRestaurantCoords = async () => {
    try {
      const data = await secureFetch("/me");
      if (data) {
        const lat = data.pos_location_lat || data.restaurant_lat || data.lat || data.latitude || data.latitude_existing;
        const lng = data.pos_location_lng || data.restaurant_lng || data.lng || data.longitude || data.longitude_existing;
        const address = data.pos_location || data.restaurant_address || data.address || data.full_address || data.location_address || data.plus_code || data.pluscode || data.plus_code_short || data.open_location_code || "";
        const label = data.restaurant_name || data.name || data.restaurant || "Restaurant";
        if (lat && lng) {
          setRestaurantCoords({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            label,
            address,
          });
          console.log("🏪 Restaurant coords fetched:", { lat, lng, label, address });
        }
      }
    } catch (err) {
      console.error("Failed to fetch restaurant coordinates:", err);
      // Keep using fallback coordinates
    }
  };

  fetchRestaurantCoords();
}, []);

useEffect(() => {
  // ...existing fetchOrders
  fetchDrivers();
}, []);




const fetchOrders = async () => {
// 🚀 Avoid wiping orders to prevent flicker
if (!orders.length) setLoading(true);
try {
  const data = await secureFetch("/orders?status=open_phone");

  const phoneOrders = data.filter((o) => {
    const status = String(o.status || "").toLowerCase();
    return (
      (o.order_type === "phone" || o.order_type === "packet") &&
      !["closed", "cancelled"].includes(status)
    );
  });

  const withKitchenStatus = [];
  for (const order of phoneOrders) {
    let items = await secureFetch(`/orders/${order.id}/items`);
    if (!items?.length) {
      await new Promise(r => setTimeout(r, 200));
      items = await secureFetch(`/orders/${order.id}/items`);
    }

// ✅ Normalize items: auto-mark drinks / excluded as delivered
const drinksLower = drinksList.map(d =>
  d.replace(/[\s\-]/g, "").toLowerCase()
);

const normalizedItems = (items || []).map(i => {
  const normalizedName = (i.name || i.product_name || "")
    .replace(/[\s\-]/g, "")
    .toLowerCase();
  const isExcluded =
    drinksLower.includes(normalizedName) || isKitchenExcludedItem(i);

  // 🟢 Mark excluded items as delivered
  if (isExcluded && i.kitchen_status !== "delivered") {
    return { ...i, kitchen_status: "delivered", kitchen_excluded: true };
  }
  return { ...i, kitchen_excluded: isExcluded || i.kitchen_excluded === true };
});

const relevantItems = normalizedItems.filter(
  (i) => !i.kitchen_excluded
);

let overallKitchenStatus = "new";
if (relevantItems.length > 0 && relevantItems.every(i => i.kitchen_status === "delivered"))
  overallKitchenStatus = "delivered";
else if (relevantItems.some(i => i.kitchen_status === "ready"))
  overallKitchenStatus = "ready";
else if (relevantItems.some(i => i.kitchen_status === "preparing"))
  overallKitchenStatus = "preparing";

   withKitchenStatus.push({ ...order, items: normalizedItems, overallKitchenStatus });

  }

  // ✅ Merge instead of overwrite
  setOrders(prev => {
    const map = new Map(prev.map(o => [o.id, o]));
    withKitchenStatus.forEach(o => map.set(o.id, { ...map.get(o.id), ...o }));
    return Array.from(map.values());
  });
} catch (err) {
  console.error("❌ fetchOrders failed:", err);
} finally {
  setLoading(false);
}

};







  // Geocode orders into stops, start from restaurant
  async function fetchOrderStops(phoneOrders) {
  // Ensure we have restaurant info (avoid race if /me hasn't returned yet)
  if (
    !restaurantCoords ||
    !restaurantCoords.address ||
    restaurantCoords.address === "Restaurant" ||
    restaurantCoords.address === restaurantCoords.label
  ) {
    try {
      const me = await secureFetch("/me");
      const lat = me.pos_location_lat || me.restaurant_lat || me.lat || me.latitude || me.latitude_existing;
      const lng = me.pos_location_lng || me.restaurant_lng || me.lng || me.longitude || me.longitude_existing;
      const address = me.pos_location || me.restaurant_address || me.address || me.full_address || me.location_address || "";
      const label = me.restaurant_name || me.name || me.restaurant || "Restaurant";
      if (lat && lng) {
        setRestaurantCoords({ lat: parseFloat(lat), lng: parseFloat(lng), label, address });
        console.log("🏪 (fetchOrderStops) Restaurant coords refreshed:", { lat, lng, label, address });
      }
    } catch (e) {
      // ignore - we'll use existing fallback
    }
  }

  const geoStops = await Promise.all(
    phoneOrders.map(async order => {

      // Prefer the explicit customer_address but fall back to any available coordinates
      const addr = order.customer_address || order.address || order.delivery_address || "";

      // Try geocoding if we have an address
      let coords = null;
      if (addr) {
        try {
          coords = await geocodeAddress(addr);
        } catch (e) {
          console.warn("🗺️ geocodeAddress failed:", e);
        }
      }

      // If geocoding failed, fall back to coordinates on the order (many APIs store them)
      const fallbackLat = order.delivery_lat || order.delivery_latitude || order.lat || order.latitude || order.pickup_lat || order.pickup_latitude;
      const fallbackLng = order.delivery_lng || order.delivery_longitude || order.lng || order.longitude || order.pickup_lng || order.pickup_longitude;

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
        console.log("🗺️ Using fallback coords from order for orderId", order.id, { fallbackLat, fallbackLng });
        return {
          lat: Number(fallbackLat),
          lng: Number(fallbackLng),
          label: order.customer_name || t("Customer"),
          address: addr,
          orderId: order.id,
        };
      }

      // No usable coordinates — log and skip
      console.warn("🗺️ No coords for order, skipping stop:", order.id, addr);
      return null;
    })
  );
  const restaurantStop = {
    label: restaurantCoords.label || "Restaurant",
    lat: restaurantCoords.lat,
    lng: restaurantCoords.lng,
    // only use address if it's a real address (don't fallback to label)
    address: restaurantCoords.address || "",
  };
  const stops = [restaurantStop, ...geoStops.filter(Boolean)];

  return stops;
}


  // Payment Method Update
  const savePaymentMethod = async (order) => {
    setUpdating((prev) => ({ ...prev, [order.id]: true }));
    try {
    await secureFetch(`/orders/${order.id}`, {
  method: "PUT",
  body: JSON.stringify({
    total: order.total,
    payment_method: editingPayment[order.id] || order.payment_method
  }),
});

      if (!propOrders) if (!propOrders) await fetchOrders();

    } catch (err) {
      alert("Failed to update payment method");
    }
    setUpdating((prev) => ({ ...prev, [order.id]: false }));
  };

 async function fetchDrivers() {
  try {
   const data = await secureFetch("/staff/drivers");
   const list = Array.isArray(data) ? data : data?.drivers || [];
   setDrivers(list);
   return list;

  } catch {
    setDrivers([]);
    return [];
  }
}

const normalizeCategoryValue = (value) =>
  value ? String(value).trim().toLowerCase() : "";

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
      excludedKitchenIds.includes(idNumber) ||
      excludedKitchenIds.includes(idString);
    const categoryMatches = excludedKitchenCategories.includes(normalizedCategory);
    return idMatches || categoryMatches;
  },
  [excludedKitchenCategories, excludedKitchenIds]
);

const normalizeItemName = (value) =>
  (value || "").replace(/[\s\-]/g, "").toLowerCase();

const getRelevantOrderItems = useCallback(
  (order) => {
    if (!order || !Array.isArray(order.items)) return [];
    return order.items.filter((item) => {
      const normalizedName = normalizeItemName(
        item.name || item.order_item_name || item.product_name
      );
      return (
        !isKitchenExcludedItem(item) &&
        !normalizedDrinkNames.includes(normalizedName)
      );
    });
  },
  [isKitchenExcludedItem, normalizedDrinkNames]
);

const areDriverItemsDelivered = (order) => {
  const relevant = getRelevantOrderItems(order);
  if (relevant.length === 0) return true;
  return relevant.every((item) => {
    const status = (item.kitchen_status || "").toLowerCase();
    return (
      status === "delivered" ||
      status === "packet_delivered" ||
      status === "ready"
    );
  });
};

useEffect(() => {
  secureFetch("/kitchen/compile-settings")
    .then((data) => {
      const normalizedIds = (data.excludedItems || [])
        .map((value) => {
          if (value === null || value === undefined || value === "") return null;
          const numeric = Number(value);
          if (!Number.isNaN(numeric)) return numeric;
          return String(value).trim();
        })
        .filter((val) => val !== null && val !== "");
      const normalizedCategories = (data.excludedCategories || [])
        .map((val) => normalizeCategoryValue(val))
        .filter(Boolean);
      setExcludedKitchenIds(normalizedIds);
      setExcludedKitchenCategories(normalizedCategories);
    })
    .catch(() => {
      setExcludedKitchenIds([]);
      setExcludedKitchenCategories([]);
    });
}, []);

const isYemeksepetiOrder = (order) =>
  String(order?.external_source || "").toLowerCase() === "yemeksepeti" ||
  Boolean(order?.external_id);

const isYemeksepetiPickupOrder = (order) => {
  if (!isYemeksepetiOrder(order)) return false;
  const expedition = String(order?.external_expedition_type || "").toLowerCase().trim();
  if (expedition === "pickup") return true;
  const address = String(order?.customer_address || "").toLowerCase().trim();
  return address === "pickup order";
};

  // Driver Button Logic
  const handleDriverMultifunction = async (order) => {
  setUpdating(prev => ({ ...prev, [order.id]: true }));

// ✅ Pick up: allow as soon as all non-drink items are delivered
const allNonDrinksDelivered = areDriverItemsDelivered(order);

if (!order.driver_status && allNonDrinksDelivered) {
  // For Yemeksepeti pickup orders, the final external status is `order_picked_up`,
  // so treat the first action as completion (driver_status = delivered).
  const nextStatus = isYemeksepetiPickupOrder(order) ? "delivered" : "on_road";
  await secureFetch(`/orders/${order.id}/driver-status`, {
    method: "PATCH",
    body: JSON.stringify({ driver_status: nextStatus }),
  });
  setHighlightedOrderId(order.id);
  setTimeout(() => setHighlightedOrderId(null), 2000);

// ✅ Deliver: allow if all non-drink items are delivered
} else if (order.driver_status === "on_road" && allNonDrinksDelivered) {
  await secureFetch(`/orders/${order.id}/driver-status`, {
    method: "PATCH",
    body: JSON.stringify({ driver_status: "delivered" }),
  });
  // DO NOT CLOSE AUTOMATICALLY! Let user close manually with the button.
}



  if (!propOrders) if (!propOrders) await fetchOrders();

  setUpdating(prev => ({ ...prev, [order.id]: false }));
};

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
}, []);

  // UI Helpers
  function getDriverButtonLabel(order, drivers = []) {
  if (!order.driver_id) {
    if (order.kitchen_status === "preparing") return t("preparing");
    return t("Waiting...");
  }
  if (isYemeksepetiPickupOrder(order) && normalizeDriverStatus(order.driver_status) === "on_road") {
    return t("Picked up");
  }
  if (
    normalizeDriverStatus(order.driver_status) === "on_road" &&
    order.kitchen_status === "delivered"
  ) return t("On Road");
  if (normalizeDriverStatus(order.driver_status) === "delivered") return t("Completed");
  if (order.kitchen_status === "delivered") {
    const driver = drivers.find(d => d.id === Number(order.driver_id));
    return `${t("Pick by {{name}}", { name: driver ? driver.name : t("Driver") })} 🕒`;
  }
  // If assigned but not ready/picked up
  const driver = drivers.find(d => d.id === Number(order.driver_id));
  return `${t("Pick by {{name}}", { name: driver ? driver.name : t("Driver") })} 🕒`;
}

const fetchDrinks = async () => {
  try {
    const data = await secureFetch("/drinks"); // returns JSON directly
    setDrinksList(data.map(d => d.name));
  } catch (err) {
    console.error("❌ Failed to fetch drinks:", err);
    setDrinksList([]);
  }
};


useEffect(() => {
  fetchDrinks();
}, []);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const data = await secureFetch("/products");
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : data?.product
        ? [data.product]
        : [];
      const next = {};
      for (const p of list) {
        const id = Number(p?.id);
        const prep = parseFloat(p?.preparation_time ?? p?.prep_time ?? p?.prepTime);
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
}, []);

function driverButtonDisabled(order) {
  if (normalizeDriverStatus(order.driver_status) === "delivered") return true;
  if (updating[order.id]) return true;

  if (!order.driver_id) return true;

  const kitchenStatus = String(
    order.kitchen_status || order.overallKitchenStatus || ""
  )
    .trim()
    .toLowerCase();
  const relevantItemsCount = getRelevantOrderItems(order).length;
  if (relevantItemsCount > 0 && !["ready", "delivered"].includes(kitchenStatus)) {
    return true;
  }

  return !areDriverItemsDelivered(order);
}




  function getOrderPrepMinutes(order) {
    const direct = parseFloat(
      order?.preparation_time ??
        order?.prep_time ??
        order?.prepTime ??
        order?.prep_minutes ??
        order?.preparation_minutes ??
        order?.preparationTime
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    const items = Array.isArray(order?.items) ? order.items : [];
    let maxMinutes = 0;
    items.forEach((item) => {
      const raw =
        item?.preparation_time ??
        item?.prep_time ??
        item?.prepTime ??
        item?.prep_minutes ??
        item?.preparation_minutes ??
        item?.preparationTime ??
        item?.prep_time_minutes ??
        item?.prepMinutes ??
        item?.product_preparation_time ??
        item?.product?.preparation_time ??
        productPrepById?.[Number(item?.product_id ?? item?.productId)];
      const minutes = parseFloat(raw ?? 0);
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      const qty = Number(item?.quantity ?? item?.qty ?? 1);
      const total = minutes * Math.max(1, qty);
      if (total > maxMinutes) maxMinutes = total;
    });
    return maxMinutes;
  }

  function getPrepStartMs(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };

    const direct = toMs(order?.prep_started_at ?? order?.prepStartedAt);
    if (Number.isFinite(direct)) return direct;

    const updated = toMs(order?.kitchen_status_updated_at);
    if (Number.isFinite(updated)) return updated;

    const items = Array.isArray(order?.items) ? order.items : [];
    for (const item of items) {
      const ms = toMs(item?.prep_started_at ?? item?.prepStartedAt);
      if (Number.isFinite(ms)) return ms;
    }
    for (const item of items) {
      const itemUpdated = toMs(item?.kitchen_status_updated_at);
      if (Number.isFinite(itemUpdated)) return itemUpdated;
    }
    return NaN;
  }

  function getReadyAtLabel(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };

    const directReadyMs = toMs(
      order?.estimated_ready_at ??
        order?.ready_at ??
        order?.readyAt ??
        order?.estimatedReadyAt
    );
    if (Number.isFinite(directReadyMs)) {
      return new Date(directReadyMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    const startMs = getPrepStartMs(order);
    const prepMinutes = getOrderPrepMinutes(order);
    if (!Number.isFinite(startMs) || !prepMinutes) return "";
    const readyMs = startMs + prepMinutes * 60 * 1000;
    return new Date(readyMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function getPrepTimer(order) {
    // Robust elapsed calculation tolerant to timezone format issues
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      // try interpreting as local time (strip timezone info) if that’s closer to now
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };

    const startMs = toMs(order.prep_started_at);
    if (!Number.isFinite(startMs)) return "00:00";
    const endMs = order.kitchen_delivered_at ? toMs(order.kitchen_delivered_at) : Date.now();
    const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getDeliveryTimer(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };
    const startMs = toMs(order.on_road_at || order.picked_up_at);
    if (!Number.isFinite(startMs)) return "00:00";
    const endMs = order.delivered_at ? toMs(order.delivered_at) : Date.now();
    const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getWaitingTimer(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };
    const startMs = toMs(order.created_at);
    if (!Number.isFinite(startMs)) return "00:00";
    const endMs = order.delivered_at ? toMs(order.delivered_at) : Date.now();
    const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getDeliverySeconds(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };
    if (!order.kitchen_delivered_at) return 0;
    const start = toMs(order.kitchen_delivered_at);
    return Math.max(0, Math.floor((now - start) / 1000));
  }
  function getWaitingSeconds(order) {
    const toMs = (val) => {
      if (!val) return NaN;
      const a = new Date(val).getTime();
      const bStr = String(val).replace(/([Zz]|[+-]\d{2}:?\d{2})$/, "");
      const b = new Date(bStr).getTime();
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return Math.abs(Date.now() - a) <= Math.abs(Date.now() - b) ? a : b;
      }
      return Number.isFinite(a) ? a : b;
    };
    if (!order.created_at) return 0;
    const start = toMs(order.created_at);
    const end = order.delivered_at ? toMs(order.delivered_at) : Date.now();
    return Math.max(0, Math.floor((end - start) / 1000));
  }
function countDrinksForDriver(orders, drinksList, driverId) {
  const result = {};
  // Normalize drink names by removing spaces/dashes, lowercase
  const drinksLower = drinksList.map(d => d.replace(/[\s\-]/g, '').toLowerCase());
  orders
    .filter(o => o.driver_id && String(o.driver_id) === String(driverId))
    .forEach(order => {
      (order.items || []).forEach(item => {

        // Main product name check
        const normalizedName = (item.name || '').replace(/[\s\-]/g, '').toLowerCase();
        if (drinksLower.includes(normalizedName)) {
          result[item.name] = (result[item.name] || 0) + Number(item.quantity || 1);
        }
        // Extras check
        if (Array.isArray(item.extras)) {
          item.extras.forEach(ex => {
            const normalizedExtra = (ex.name || '').replace(/[\s\-]/g, '').toLowerCase();
            if (drinksLower.includes(normalizedExtra)) {
              result[ex.name] = (result[ex.name] || 0) + 1;
            }
          });
        }
      });
    });
  return result;
}


const filteredOrders = orders.filter(o => o.driver_id === Number(selectedDriverId));
const totalByMethod = useMemo(() => {
  return paymentMethodLabels.reduce((obj, label) => {
    obj[label] = filteredOrders
      .filter((o) => (o.payment_method || "").toLowerCase() === label.toLowerCase())
      .reduce((sum, o) => sum + Number(o.total || 0), 0);
    return obj;
  }, {});
}, [filteredOrders, paymentMethodLabels]);


const [openDetails, setOpenDetails] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem("orderDetailsState")) || {};
  } catch {
    return {};
  }
});

const safeOrders = Array.isArray(orders)
  ? orders.map(o => ({ ...o, items: o.items ?? [] }))
  : [];

const drinkSummaryByDriver = useMemo(() => {
  if (!Array.isArray(drivers) || !drivers.length) return [];
  if (!Array.isArray(orders) || !orders.length) return [];

  const normalizeToken = (value = "") =>
    value.replace(/[\s\-]/g, "").toLowerCase();

  const drinkTokens = drinksList.map(normalizeToken).filter(Boolean);
  if (!drinkTokens.length) return [];

  const isDrinkToken = (token) =>
    token &&
    (drinkTokens.includes(token) ||
      drinkTokens.some((entry) => token.includes(entry)));

  return drivers
    .map((driver) => {
      const assignedOrders = orders.filter(
        (o) => Number(o.driver_id) === Number(driver.id)
      );
      if (!assignedOrders.length) return null;

      const totalDrinks = new Map();
      const customerGroups = new Map();
      const groupOrder = [];

      const ensureGroup = (order) => {
        const customerRaw = (order.customer_name || "").trim();
        const key = customerRaw
          ? customerRaw.toLowerCase()
          : `order-${order.id}`;
        if (!customerGroups.has(key)) {
          customerGroups.set(key, {
            key,
            name: customerRaw || order.customer_name || t("Customer"),
            address: order.customer_address || "",
            drinks: new Map(),
          });
          groupOrder.push(key);
        }
        return customerGroups.get(key);
      };

      const recordDrink = (group, label, qty = 1) => {
        if (!label) return;
        const normalized = normalizeToken(label);
        if (!isDrinkToken(normalized)) return;

        const amount = Number(qty) || 1;

        const existingGroupDrink = group.drinks.get(normalized);
        if (existingGroupDrink) {
          existingGroupDrink.qty += amount;
          if (label.length > existingGroupDrink.name.length) {
            existingGroupDrink.name = label;
          }
        } else {
          group.drinks.set(normalized, {
            key: normalized,
            name: label,
            qty: amount,
          });
        }

        const existingTotal = totalDrinks.get(normalized);
        if (existingTotal) {
          existingTotal.qty += amount;
          if (label.length > existingTotal.name.length) {
            existingTotal.name = label;
          }
        } else {
          totalDrinks.set(normalized, {
            key: normalized,
            name: label,
            qty: amount,
          });
        }
      };

      assignedOrders.forEach((order) => {
        const group = ensureGroup(order);

        if (!group.address && order.customer_address) {
          group.address = order.customer_address;
        }
        if ((!group.name || group.name === t("Customer")) && order.customer_name) {
          group.name = order.customer_name;
        }

        (order.items || []).forEach((item) => {
          const rawName =
            item.order_item_name ||
            item.external_product_name ||
            item.product_name ||
            "";
          recordDrink(group, rawName.trim(), item.quantity);

          if (Array.isArray(item.extras)) {
            item.extras.forEach((ex) => {
              recordDrink(group, (ex.name || "").trim(), 1);
            });
          }
        });
      });

      const customers = groupOrder
        .map((key) => {
          const group = customerGroups.get(key);
          const drinks = Array.from(group.drinks.values()).sort(
            (a, b) => b.qty - a.qty
          );
          return {
            key: group.key,
            name: group.name || t("Customer"),
            address: group.address,
            drinks,
          };
        })
        .filter((entry) => entry.drinks.length > 0);

      if (!customers.length) return null;

      return {
        driverId: driver.id,
        driverName: driver.name,
        totals: Array.from(totalDrinks.values()).sort(
          (a, b) => b.qty - a.qty
        ),
        customers,
      };
    })
    .filter(Boolean);
}, [drivers, orders, drinksList]);

const renderPaymentModal = () => {
  if (!showPaymentModal || !editingPaymentOrder) return null;

  const grandTotal =
    calcOrderTotalWithExtras(editingPaymentOrder) -
    calcOrderDiscount(editingPaymentOrder);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
      <div className="relative bg-white rounded-3xl w-[94vw] max-w-md mx-auto p-7 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 animate-fade-in">
        {/* Close */}
        <button
          onClick={closePaymentModal}
          className="absolute top-3 right-4 text-2xl text-slate-400 hover:text-emerald-500 transition"
          title={t("Close")}
        >
          ✕
        </button>
        {/* Title */}
        <div className="flex flex-col items-center mb-5">
          <div className="text-3xl font-semibold text-slate-900 mb-1">💸 {t("Payment")}</div>
          <div className="text-sm font-medium text-slate-500 mb-2">
            {t("Order")} #{editingPaymentOrder.id}
          </div>
          <div className="text-xs bg-slate-100 text-slate-500 rounded-xl px-4 py-1 font-medium tracking-[0.35em] uppercase border border-slate-200">
            {t("Split between multiple payment methods if needed.")}
          </div>
        </div>
        {/* Split Payment Rows */}
        <div className="flex flex-col gap-3 mb-5">
          {splitPayments.map((pay, idx) => (
            <div
              key={idx}
              className="flex gap-3 items-center group animate-fade-in border-b border-slate-200 pb-2"
            >
              <select
                value={pay.method}
                onChange={(e) => {
                  const copy = [...splitPayments];
                  copy[idx].method = e.target.value;
                  setSplitPayments(copy);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 font-medium text-base bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
              >
                {!methodOptionSource.some((method) => method.label === pay.method) &&
                  pay.method && (
                    <option value={pay.method}>{pay.method}</option>
                  )}
                {methodOptionSource.map((method) => (
                  <option key={method.id} value={method.label}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="w-28 rounded-xl border border-slate-200 px-4 py-2 text-base text-right font-mono bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                placeholder={`${config?.symbol || ""}0.00`}
                value={pay.amount}
                onChange={(e) => {
                  const value = e.target.value;
                  const copy = [...splitPayments];
                  copy[idx].amount = value;

                  if (splitPayments.length === 2) {
                    const otherIdx = idx === 0 ? 1 : 0;
                    const thisVal = Number(value || 0);
                    const otherVal = Math.max(grandTotal - thisVal, 0);
                    copy[otherIdx].amount = otherVal === 0 ? "" : otherVal.toFixed(2);
                  }
                  setSplitPayments(copy);
                }}
              />
              {splitPayments.length > 1 && (
                <button
                  className="ml-2 p-2 bg-slate-100 text-rose-500 rounded-full hover:bg-rose-100 border border-slate-200 transition"
                  onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                  title={t("Remove")}
                >
                  –
                </button>
              )}
            </div>
          ))}
          <button
            className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium shadow transition-all"
            onClick={() =>
              setSplitPayments([...splitPayments, { method: fallbackMethodLabel, amount: "" }])
            }
          >
            <span className="text-lg sm:text-xl">+</span> {t("Add Payment Method")}
          </button>
        </div>
        {/* Total Summary */}
        <div className="bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-2xl shadow-inner text-center">
  <span className="text-2xl sm:text-4xl text-emerald-700 font-extrabold font-mono tracking-tight">
    {formatCurrency(grandTotal)}


          </span>
          <span className="text-sm sm:text-base text-slate-600 flex gap-2 items-center">
            {t("Split Amount Paid")}:&nbsp;
            <span className="text-lg sm:text-xl font-semibold text-slate-900 font-mono">
              {formatCurrency(
                splitPayments.reduce(
                  (sum, p) => sum + Number(p.amount || 0),
                  0
                )
              )}
            </span>
          </span>
          {/* Remaining Balance */}
          {(() => {
            const paid = splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const remaining = grandTotal - paid;
            return (
              <div
                className={`mt-2 text-base sm:text-lg font-semibold ${
                  remaining > 0
                    ? "text-amber-500"
                    : remaining < 0
                    ? "text-rose-500"
                    : "text-emerald-600"
                }`}
              >
                {remaining > 0
                  ? t("Remaining: {{amount}}", { amount: formatCurrency(remaining) })
                  : remaining < 0
                  ? t("Overpaid: {{amount}}", { amount: formatCurrency(Math.abs(remaining)) })
                  : ``}
              </div>
            );
          })()}
          {splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) !== grandTotal && (
            <span className="text-rose-500 text-sm mt-1 animate-pulse">
              {t("Amounts must sum to order total.")}
            </span>
          )}
        </div>
        {/* Save/Cancel */}
        <div className="flex gap-3 justify-end mt-5">
          <button
            className="px-5 py-2 rounded-xl bg-white text-slate-600 font-medium border border-slate-200 hover:bg-slate-100"
            onClick={closePaymentModal}
          >
            {t("Cancel")}
          </button>
          <button
            className={`px-6 py-2 rounded-xl font-semibold shadow text-white transition-all duration-150 ${
              splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) === grandTotal
                ? "bg-emerald-500 hover:bg-emerald-400 scale-[1.02]"
                : "bg-slate-300 cursor-not-allowed text-slate-500"
            }`}
            disabled={splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) !== grandTotal}
            onClick={async () => {
              const receiptId = editingPaymentOrder.receipt_id || uuidv4();
              const cleanedSplits = {};
              splitPayments.forEach((p) => {
                if (p.method && p.amount > 0) cleanedSplits[p.method] = Number(p.amount);
              });
              const shouldCloseAfterSave =
                pendingCloseOrderId && pendingCloseOrderId === editingPaymentOrder.id;

              await secureFetch(`/orders/receipt-methods`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_id: editingPaymentOrder.id,
                  receipt_id: receiptId,
                  methods: cleanedSplits,
                }),
              });

            await secureFetch(`/orders/${editingPaymentOrder.id}`, {
  method: "PUT",
  body: JSON.stringify({
    payment_method: splitPayments[0].method,
    total: grandTotal,
    receipt_id: receiptId,
  }),
});

              if (shouldCloseAfterSave) {
                await secureFetch(`/orders/${editingPaymentOrder.id}/close`, {
                  method: "POST",
                });
                setOrders((prev) =>
                  prev.filter((o) => Number(o.id) !== Number(editingPaymentOrder.id))
                );
              }

              closePaymentModal();
              if (!shouldCloseAfterSave) await fetchOrders();
            }}
          >
            {t("Save Payment")}
          </button>
        </div>
        <style>{`
          .animate-fade-in {
            animation: fadeIn .3s cubic-bezier(.4,0,.2,1);
          }
          @keyframes fadeIn {
            from { opacity:0; transform:scale(0.95);}
            to { opacity:1; transform:scale(1);}
          }
        `}</style>
      </div>
    </div>
  );
};

const renderCancelModal = () => {
  if (!showCancelModal || !cancelOrder) return null;

  const totalWithExtras = calcOrderTotalWithExtras(cancelOrder);
  const totalDiscount = calcOrderDiscount(cancelOrder);
  const discountedTotal = totalWithExtras - totalDiscount;
  const refundAmount = isOrderPaid(cancelOrder) ? discountedTotal : 0;
  const isUnpaidPaymentMethod =
    (cancelOrder?.payment_method || "").toLowerCase().trim() === "unpaid";
  const shouldShowRefundMethod = refundAmount > 0 && !isUnpaidPaymentMethod;

  const handleConfirm = async () => {
    if (!cancelOrder?.id) {
      toast.error(t("Select an order first"));
      return;
    }
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      toast.warn(t("Enter a cancellation reason."));
      return;
    }

    setCancelLoading(true);
    try {
      const payload = { reason: trimmedReason };
      if (shouldShowRefundMethod && refundMethodId) {
        payload.refund_method = refundMethodId;
      }

      const result = await secureFetch(`/orders/${cancelOrder.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (refundAmount > 0 && shouldShowRefundMethod) {
        const refundLabel =
          getPaymentMethodLabel(methodOptionSource, refundMethodId) ||
          refundMethodId ||
          t("Unknown");
        const note = cancelOrder?.id
          ? `Refund for Order #${cancelOrder.id} (${refundLabel})`
          : t("Refund recorded");
        try {
          await logCashRegisterEvent({
            type: "expense",
            amount: Number(refundAmount.toFixed(2)),
            note,
          });
        } catch (logErr) {
          console.warn("⚠️ Refund log failed:", logErr);
        }
      }

      if (result?.externalSync?.ok === false) {
        toast.warn(t("Order cancelled, but external sync failed."));
      } else {
        toast.success(t("Order cancelled"));
      }
      setOrders((prev) =>
        prev.filter((o) => Number(o.id) !== Number(cancelOrder.id))
      );
      closeCancelModal();
      if (!propOrders) await fetchOrders();
    } catch (err) {
      console.error("❌ Cancel order failed:", err);
      toast.error(err?.message || t("Failed to cancel order"));
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
              {t("Cancel Order")}
            </p>
            <p className="text-lg font-bold text-slate-900">
              {t("Order")} #{cancelOrder?.id || "-"}
            </p>
            <p className="text-sm text-rose-500 mt-1">
              {cancelOrder?.customer_name || t("Customer")}
            </p>
          </div>
          <button
            type="button"
            onClick={closeCancelModal}
            className="text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          {t("The cancellation reason will be recorded for auditing.")}
        </p>

        {shouldShowRefundMethod ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 mb-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-rose-500">
              {t("Refund Method")}
              <select
                className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                value={refundMethodId}
                onChange={(event) => setRefundMethodId(event.target.value)}
              >
                {methodOptionSource.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-rose-500">
              {t("Refund amount")}: {formatCurrency(refundAmount)}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-500">
            {t("No paid items detected. This will simply cancel the order.")}
          </p>
        )}

        <textarea
          rows={4}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder={t("Why is the order being cancelled?")}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none"
        />

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={closeCancelModal}
            className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition"
          >
            {t("Back")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={cancelLoading || !cancelReason.trim()}
            className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
              cancelLoading || !cancelReason.trim()
                ? "cursor-not-allowed bg-rose-200"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {cancelLoading ? t("Cancelling...") : t("Confirm Cancellation")}
          </button>
        </div>
      </div>
    </div>
  );
};

return (
  <div className="min-h-screen w-full bg-[#f7f9fc] text-slate-900">

{/* --- HEADER & ACTIONS, Always Centered --- */}
<div className="w-full flex flex-col items-center justify-center pt-1 pb-0 min-h-[50px]">

  <div className="flex flex-col items-center justify-center w-full max-w-6xl">
    <div className="flex flex-col gap-3 w-full">
      <div className="flex flex-col md:flex-row md:flex-nowrap items-center justify-center gap-3 w-full">
        <select
          className="w-full md:w-auto px-4 py-2 rounded-2xl text-base font-medium bg-white text-slate-900 border border-slate-200 shadow-sm focus:border-slate-400 focus:ring-slate-300 min-w-[180px]"
          value={selectedDriverId || ""}
          onChange={(e) => {
            setSelectedDriverId(e.target.value);
          }}
        >
          <option value="">{t("Select Driver")}</option>
          <option value="all">{t("All Drivers")}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <div className="w-full md:w-auto flex items-center justify-center gap-3 flex-nowrap overflow-x-auto md:overflow-visible">
          <button
            className="w-full md:w-auto md:shrink-0 whitespace-nowrap leading-none px-6 py-2 rounded-2xl bg-slate-900 text-white font-semibold shadow hover:bg-slate-800 hover:-translate-y-0.5 inline-flex items-center justify-center gap-2 disabled:opacity-40 transition"
            disabled={!selectedDriverId}
            onClick={async () => {
              // Ensure we have the latest restaurant info before building stops
              try {
                const me = await secureFetch("/me");
                if (me) {
                  const lat = me.restaurant_lat || me.lat || me.latitude || me.latitude_existing;
                  const lng = me.restaurant_lng || me.lng || me.longitude || me.longitude_existing;
                  const address = me.restaurant_address || me.address || me.full_address || me.location_address || me.plus_code || me.pluscode || me.open_location_code || "";
                  const label = me.restaurant_name || me.name || me.restaurant || "Restaurant";
                  if (lat && lng) {
                    setRestaurantCoords({ lat: parseFloat(lat), lng: parseFloat(lng), label, address });
                    console.log("🏪 (Live Route) Restaurant coords refreshed:", { lat, lng, label, address });
                  }
                }
              } catch (e) {
                console.warn("Could not refresh /me before building route:", e);
              }

              let driverOrders = [];
              try {
                const data = await secureFetch(`drivers/${selectedDriverId}/active-orders`);
                if (Array.isArray(data)) {
                  driverOrders = data;
                } else if (Array.isArray(data?.orders)) {
                  driverOrders = data.orders;
                }
              } catch (e) {
                console.warn("Could not fetch driver active orders:", e);
              }

              if (!driverOrders.length) {
                driverOrders = orders.filter(
                  (o) =>
                    o.driver_id === Number(selectedDriverId) && o.driver_status !== "delivered"
                );
              }
              console.log("🗺️ LIVE ROUTE DEBUG - driverOrders:", driverOrders);
              console.log("🗺️ LIVE ROUTE DEBUG - driverOrders[0]?.customer_address:", driverOrders[0]?.customer_address);
              const stops = await fetchOrderStops(driverOrders);
              console.log("🗺️ LIVE ROUTE DEBUG - stops after fetchOrderStops:", stops);
              setMapOrders(driverOrders);
              setMapStops(stops);
              setShowRoute(true);
            }}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              🛵
              <span className="shrink-0 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-lg border border-emerald-300 font-semibold">
                LIVE
              </span>
              <span className="whitespace-nowrap">{t("Route")}</span>
            </span>
          </button>

          <button
            className="w-full md:w-auto md:shrink-0 whitespace-nowrap leading-none px-6 py-2 rounded-2xl bg-slate-900 text-white font-semibold shadow hover:bg-slate-800 hover:-translate-y-0.5 inline-flex items-center justify-center gap-2 disabled:opacity-40 transition"
            disabled={!selectedDriverId}
            onClick={() => setShowDrinkModal(true)}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="whitespace-nowrap">{t("Checklist")}</span>
            </span>
          </button>

          <button
            className="w-full md:w-auto md:shrink-0 whitespace-nowrap leading-none px-6 py-2 rounded-2xl bg-slate-900 text-white font-semibold shadow hover:bg-slate-800 hover:-translate-y-0.5 inline-flex items-center justify-center gap-2 disabled:opacity-40 transition"
            disabled={!selectedDriverId}
            onClick={handleToggleDriverReport}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              📊 <span className="whitespace-nowrap">{t("Driver Report")}</span>
            </span>
          </button>
        </div>

        {/* Date range sits next to Driver Report on big screens */}
        <div className="hidden md:flex md:w-auto items-center gap-2 flex-nowrap whitespace-nowrap bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-sm">
          <input
            type="date"
            className="shrink-0 border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition"
            value={reportFromDate}
            max={reportToDate || new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportFromDate(e.target.value)}
            disabled={reportLoading}
          />
          <input
            type="date"
            className="shrink-0 border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition"
            value={reportToDate}
            min={reportFromDate || undefined}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportToDate(e.target.value)}
            disabled={reportLoading}
          />
        </div>
      </div>

      {/* On small screens keep date range on its own row */}
      <div className="w-full flex items-center justify-center md:hidden">
        <div className="w-full md:w-auto flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-sm">
          <input
            type="date"
            className="shrink-0 border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition"
            value={reportFromDate}
            max={reportToDate || new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportFromDate(e.target.value)}
            disabled={reportLoading}
          />
          <input
            type="date"
            className="shrink-0 border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition"
            value={reportToDate}
            min={reportFromDate || undefined}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportToDate(e.target.value)}
            disabled={reportLoading}
          />
        </div>
      </div>
    </div>
  </div>
</div>


    {/* --- DRIVER REPORT --- */}
    {selectedDriverId && showDriverReport && (
      <div className="mt-2">
        {reportLoading ? (
          <div className="animate-pulse text-lg sm:text-xl">{t("Loading driver report...")}</div>
        ) : driverReport?.error ? (
          <div className="text-red-600 font-bold">{driverReport.error}</div>
        ) : driverReport ? (
          <div className="rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] p-8 bg-white border border-slate-200 space-y-5">
            <div className="flex flex-wrap gap-10 items-center mb-3">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">{t("Packets Delivered")}</div>
                <div className="text-xl sm:text-4xl font-extrabold text-slate-900">{driverReport.packets_delivered}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">{t("Total Sales")}</div>
                <div className="text-xl sm:text-4xl font-extrabold text-slate-900">
                  {driverReport.total_sales != null
                    ? formatCurrency(driverReport.total_sales)
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">{t("By Payment Method")}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(driverReport.sales_by_method).map(
                    ([method, amt]) => (
                      <span
                        key={method}
                        className="bg-slate-100 border border-slate-200 shadow-sm px-3 py-1 rounded-lg font-semibold text-sm text-slate-700"
                      >
                        {method}: {formatCurrency(amt)}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <thead>
	  <tr>
	    {showDriverColumn && (
	      <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Driver")}</th>
	    )}
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Customer")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Address")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Total")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Payment")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Delivered")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Pickup→Delivery")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">{t("Kitchen→Delivery")}</th>
	  </tr>
</thead>
<tbody>
  {driverReport.orders.map(ord => (
    <tr key={ord.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      {showDriverColumn && (
        <td className="p-3 text-slate-700">{ord.driver_name || "-"}</td>
      )}
      <td className="p-3 text-slate-700">{ord.customer_name || "-"}</td>
      <td className="p-3 text-slate-500">{ord.customer_address || "-"}</td>
      <td className="p-3 text-slate-900 font-semibold">
        {formatCurrency(parseFloat(ord.total || 0))}
      </td>
      <td className="p-3 text-slate-600">{ord.payment_method}</td>
      <td className="p-3 text-slate-500">{ord.delivered_at ? new Date(ord.delivered_at).toLocaleTimeString() : "-"}</td>
      <td className="p-3 text-slate-500">
        {ord.delivery_time_seconds
          ? (ord.delivery_time_seconds / 60).toFixed(1) + ` ${t("min")}`
          : "-"}
      </td>
      <td className="p-3 text-slate-500">
        {ord.kitchen_to_delivery_seconds
          ? (ord.kitchen_to_delivery_seconds / 60).toFixed(1) + ` ${t("min")}`
          : "-"}
      </td>
    </tr>
  ))}
</tbody>

              </table>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm">{t("Select a driver and date to see the report.")}</div>
        )}
      </div>
    )}

    {/* --- LIVE ROUTE MODAL (FULL SCREEN) --- */}
    {showRoute && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
        <div className="relative w-full h-full max-w-7xl max-h-[95vh] mx-auto bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col">
          {/* Close Button */}
          <button
            onClick={() => setShowRoute(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition shadow-lg"
            title="Close Map"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Map Container */}
          <LiveRouteMap
            stopsOverride={mapStops}
            driverNameOverride={drivers.find(d => d.id === Number(selectedDriverId))?.name || ""}
            driverId={selectedDriverId}
            orders={mapOrders.length ? mapOrders : filteredOrders}
          />
        </div>
      </div>
    )}


    {/* --- DRINK SETTINGS MODAL --- */}
    <DrinkSettingsModal
      open={showDrinkModal}
      onClose={() => setShowDrinkModal(false)}
      fetchDrinks={fetchDrinks}
      summaryByDriver={drinkSummaryByDriver}
    />

   {/* --- ORDERS LIST --- */}
<div className="min-h-screen px-0 sm:px-0 py-0 w-full mx-auto relative bg-[#f7f9fc] text-slate-900 transition-colors duration-300">
<div
  className={`
    grid
    gap-8
    w-full
    py-8
    ${orders.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-1"}
    sm:grid-cols-1
    md:grid-cols-${orders.length === 1 ? "1" : "1"}
    lg:grid-cols-${orders.length === 1 ? "1" : "1"}
  `}
>



{safeOrders.map((order, i) => {
const totalWithExtras = calcOrderTotalWithExtras(order);
const totalDiscount = calcOrderDiscount(order);
  const discountedTotal = totalWithExtras - totalDiscount; // ✅ includes extras now
  // shown on the card
      const driverStatus = normalizeDriverStatus(order.driver_status);
      const isDelivered = driverStatus === "delivered";
      const isPicked = driverStatus === "on_road";
      const kitchenStatus = order.kitchen_status || order.overallKitchenStatus;
      const isReady = kitchenStatus === "ready";
      const isPrep = kitchenStatus === "preparing";
      const onlinePayments = [
        "online", "online payment", "online card", "yemeksepeti online"
      ];
      const isOnlinePayment = order.payment_method &&
        onlinePayments.some(type => order.payment_method.toLowerCase().includes(type));
      const isYemeksepeti = order.order_type === "packet" && order.external_id;
      const externalOrderRef =
        order.external_id ||
        order.externalId ||
        order.external_order_id ||
        order.externalOrderId ||
        order.order_code ||
        order.orderCode ||
        "";
      const orderNote =
        order.takeaway_notes ||
        order.takeawayNotes ||
        order.notes ||
        order.note ||
        "";
      const sanitizedOrderNote = (() => {
        const noteRaw = String(orderNote || "").trim();
        if (!noteRaw) return "";
        const pay = String(order.payment_method || "").trim();
        if (!pay) return noteRaw;
        const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return noteRaw
          .replace(new RegExp(escapeRegExp(pay), "gi"), "")
          .replace(/\s{2,}/g, " ")
          .replace(/[;,\-|–—]+\s*[;,\-|–—]+/g, "; ")
          .replace(/^[;,\-|–—\s]+/g, "")
          .replace(/[;,\-|–—\s]+$/g, "")
          .trim();
      })();

 const statusVisual = (() => {
  const isPacketOrder = order.order_type === "packet";

  // ✅ Delivered Orders (Completed)
  if (isDelivered) {
    return {
      card: "bg-emerald-50 border-4 border-emerald-400 text-emerald-900 shadow-md",
      header: "bg-emerald-100 border border-emerald-300 shadow-sm",
      timer: "bg-emerald-200 text-emerald-900 border border-emerald-300 shadow-sm",
      nameChip: "bg-emerald-50 text-emerald-800 border border-emerald-300",
      phoneBtn: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
      statusChip: "bg-emerald-500 text-white border border-emerald-600 shadow-sm",
      priceTag: "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm",
      extrasRow: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm",
      noteBox: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm",
    };
  }

  // 🚗 On Road (Driver picked up)
  if (isPicked) {
    return {
      card: "bg-blue-50 border-4 border-blue-400 text-blue-900 shadow-md",
      header: "bg-blue-100 border border-blue-300 shadow-sm",
      timer: "bg-blue-200 text-blue-900 border border-blue-300 shadow-sm",
      nameChip: "bg-blue-50 text-blue-800 border border-blue-300",
      phoneBtn: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
      statusChip: "bg-blue-500 text-white border border-blue-600 shadow-sm",
      priceTag: "bg-blue-100 text-blue-800 border border-blue-300 shadow-sm",
      extrasRow: "bg-blue-50 text-blue-800 border border-blue-300 shadow-sm",
      noteBox: "bg-blue-50 text-blue-800 border border-blue-300 shadow-sm",
    };
  }

  // 🍳 Preparing / Ready
  if (isReady || isPrep) {
    return {
      card: "bg-amber-50 border-4 border-amber-400 text-amber-900 shadow-md",
      header: "bg-amber-100 border border-amber-300 shadow-sm",
      timer: "bg-amber-200 text-amber-900 border border-amber-300 shadow-sm",
      nameChip: "bg-amber-50 text-amber-800 border border-amber-300",
      phoneBtn: "bg-amber-600 text-white hover:bg-amber-700 shadow-sm",
      statusChip: "bg-amber-500 text-white border border-amber-600 shadow-sm",
      priceTag: "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm",
      extrasRow: "bg-amber-50 text-amber-800 border border-amber-300 shadow-sm",
      noteBox: "bg-amber-50 text-amber-900 border border-amber-300 shadow-sm",
    };
  }

  // 🕓 Pending / Unconfirmed (default)
  return {
    card: `bg-slate-50 border-4 ${isPacketOrder ? "border-fuchsia-400" : "border-slate-400"} text-slate-900 shadow-md`,
    header: "bg-slate-100 border border-slate-300 shadow-sm",
    timer: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm",
    nameChip: "bg-slate-50 text-slate-900 border border-slate-300",
    phoneBtn: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
    statusChip: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm",
    priceTag: "bg-slate-100 text-slate-900 border border-slate-300 shadow-sm",
    extrasRow: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm",
    noteBox: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm",
  };
})();

      const isKitchenDelivered =
        kitchenStatus === "delivered" || Boolean(order?.kitchen_delivered_at);
      const readyAtLabel =
        isPrep && !isKitchenDelivered ? getReadyAtLabel(order) : "";
      const kitchenBadgeLabel =
        isDelivered
          ? t("Order Delivered!")
          : kitchenStatus === "new"
          ? t("New Order")
          : kitchenStatus === "preparing"
          ? t("Preparing")
          : kitchenStatus === "ready" || kitchenStatus === "delivered"
          ? t("Order ready!")
          : "";
      const kitchenBadgeIcon =
        isDelivered
          ? "✅"
          : kitchenStatus === "new"
          ? ""
          : kitchenStatus === "preparing"
          ? "🍳"
          : kitchenStatus === "ready" || kitchenStatus === "delivered"
          ? "✅"
          : "";
      const kitchenBadgeClass =
        isDelivered
          ? "bg-teal-600 text-white hover:bg-teal-700 shadow-sm"
          : kitchenStatus === "new"
          ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
          : statusVisual.phoneBtn;



      const assignedDriver = drivers.find((d) => Number(d.id) === Number(order.driver_id));
      const assignedDriverName = assignedDriver?.name ? String(assignedDriver.name) : "";
      const rawDriverStatus = String(order.driver_status || "").trim().toLowerCase();
      const isPickedUp = rawDriverStatus === "picked_up";
      const driverStatusBaseLabel = isDelivered
        ? t("Delivered")
        : isPickedUp
        ? t("Picked up by")
        : isPicked
        ? t("Driver On Road")
        : t("Awaiting Driver");
      const driverStatusLabel = (() => {
        // No driver assigned yet
        if (!assignedDriverName) return t("Awaiting Driver");

        // Driver assigned but not yet picked up / on road
        if (!isPickedUp && !isPicked && !isDelivered) {
          return `${t("Picked up by")}: ${assignedDriverName}`;
        }

        // Picked up status (mobile) OR on-road status (dashboard)
        if (isPickedUp || isPicked) {
          return `${driverStatusBaseLabel}: ${assignedDriverName}`;
        }

        // Delivered
        return `${driverStatusBaseLabel}: ${assignedDriverName}`;
      })();

      return (
        <div
          key={order.id}
          className="relative group flex flex-col items-stretch w-full"
          style={{
            minWidth: 0,
            width: "100%",
            margin: 0
          }}
        >

          {/* CARD */}
<div
  className={`w-full h-full rounded-[28px] p-7 flex flex-col gap-5 transition-all duration-500 ${statusVisual.card}`}
  style={{ minHeight: 210 }}
>





            {/* CARD HEADER */}
<div
 className="flex flex-col gap-[2px] w-full pb-0 mb-[2px]"
  style={{ minWidth: 0 }}
>
  {/* Top Row: Address + Timer */}
  <div className={`relative rounded-t-3xl px-5 sm:px-6 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between transition-colors duration-500 ${statusVisual.header}`}>
  {/* Address + icon */}
  <div className="flex flex-col flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-xl sm:text-2xl text-emerald-500">📍</span>
      {order.customer_address ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="
            text-lg sm:text-2xl font-extrabold text-slate-900
            leading-snug break-words w-full underline decoration-emerald-300 decoration-2 underline-offset-4 hover:decoration-emerald-500 transition-colors
          "
          style={{
            wordBreak: "break-word",
            whiteSpace: "pre-line",
            overflowWrap: "break-word",
            maxWidth: "100%",
            display: "block"
          }}
        >
          {order.customer_address}
        </a>
      ) : (
        <span
          className="
            text-lg sm:text-2xl font-extrabold text-slate-900
            leading-snug break-words w-full
          "
          style={{
            wordBreak: "break-word",
            whiteSpace: "pre-line",
            overflowWrap: "break-word",
            maxWidth: "100%",
            display: "block"
          }}
        >
          {t("No address available")}
        </span>
      )}

    </div>
    {externalOrderRef && (
      <div className="mt-2">
        <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/80 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold shadow-sm">
          {t("Order")} #{externalOrderRef}
        </span>
      </div>
    )}
  </div>
  {/* Right badges */}
  <div className="flex flex-row sm:flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto min-w-0 sm:min-w-[160px] overflow-x-auto sm:overflow-visible whitespace-nowrap pr-1">
    {isYemeksepeti && (
  <span className="inline-flex items-center justify-center w-full sm:w-auto px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 text-white text-sm sm:text-lg lg:text-xl font-extrabold shadow gap-2 tracking-wider border border-pink-200 flex-shrink-0" style={{ letterSpacing: 1 }}>
    Yemeksepeti
    <svg width="28" height="28" viewBox="0 0 24 24" className="inline -mt-0.5 ml-1"><circle cx="12" cy="12" r="12" fill="#FF3B30"/><text x="12" y="16" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="bold">YS</text></svg>
  </span>
)}
    <div className="flex items-center justify-end gap-2 w-full sm:w-auto flex-nowrap overflow-x-auto sm:overflow-visible whitespace-nowrap">
     
      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition flex-shrink-0 ${statusVisual.statusChip}`}>
        {driverStatusLabel}
      </span>
  
       <span className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-2xl font-mono font-semibold text-sm transition flex-shrink-0 ${statusVisual.timer}`}>
        <span className="text-base opacity-80"></span> {getWaitingTimer(order)}
      </span>
      {order && order.items?.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePacketPrint(order.id);
          }}
          className="px-2.5 py-1.5 bg-gradient-to-r from-slate-100 to-slate-200 text-slate-800 font-semibold sm:font-bold rounded-full shadow hover:brightness-105 border border-slate-300 transition flex-shrink-0"
          title={t("Print Receipt")}
        >
          🖨️
        </button>
        
      )}
    </div>

  </div>



  </div>
  {/* Second Row: Customer + Statuses */}
  <div className="flex flex-wrap items-center justify-between gap-3 mt-1 w-full">
    <div className="flex flex-wrap items-center gap-3 my-2">
      <span className={`inline-flex items-center justify-center sm:justify-start px-4 py-2 rounded-xl text-base sm:text-xl font-semibold transition ${statusVisual.nameChip}`}>
        <span className="mr-2">👤</span> {order.customer_name}
      </span>

      {order.customer_phone && (
        <a
          href={`tel:${order.customer_phone}`}
          className={`inline-flex items-center justify-center sm:justify-start px-3 py-2 rounded-xl font-semibold text-base sm:text-lg transition-transform duration-200 hover:-translate-y-0.5 ${statusVisual.phoneBtn}`}
          title={t("Click to call")}
          style={{ textDecoration: "none" }}
        >
          <svg className="mr-2" width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.11-.21c1.21.49 2.53.76 3.88.76.55 0 1 .45 1 1v3.5c0 .55-.45 1-1 1C7.72 22 2 16.28 2 9.5c0-.55.45-1 1-1H6.5c.55 0 1 .45 1 1 0 1.35.27 2.67.76 3.88.17.39.09.85-.21 1.11l-2.2 2.2z"
            />
          </svg>
          {order.customer_phone}
        </a>
      )}
      {kitchenBadgeLabel &&
        !(kitchenBadgeLabel === t("Order ready!") && (isPicked || isPickedUp)) && (
        <span
          className={`inline-flex items-center justify-center sm:justify-start px-3 py-2 rounded-xl font-semibold text-base sm:text-lg transition ${kitchenBadgeClass}`}
        >
          {kitchenBadgeIcon ? <span className="mr-2">{kitchenBadgeIcon}</span> : null}
          {kitchenBadgeLabel}
        </span>
      )}
      {readyAtLabel && (
        <span className="px-3 py-2 rounded-xl font-semibold text-base sm:text-lg bg-slate-100 text-slate-700 border border-slate-200 shadow-sm flex items-center gap-1">
          ⏳ {t("Ready at")} {readyAtLabel}
        </span>
      )}
    </div>

 
  </div>


  </div>


            {/* Items */}
  {sanitizedOrderNote && (
    <div
      className={`px-3 py-2 rounded-xl font-medium italic flex items-start gap-2 text-base transition ${statusVisual.noteBox}`}
      style={{ wordBreak: "break-word", whiteSpace: "pre-line" }}
    >
      📝 <span>{sanitizedOrderNote}</span>
    </div>
  )}
<details
  open={openDetails[order.id] || false}
  onToggle={(e) => {
    setOpenDetails((prev) => ({
      ...prev,
      [order.id]: e.target.open,
    }));
    localStorage.setItem(
      "orderDetailsState",
      JSON.stringify({
        ...openDetails,
        [order.id]: e.target.open,
      })
    );
  }}
  className="w-full"
>
  <summary className="cursor-pointer flex items-center gap-2 text-base font-semibold select-none hover:underline">
    <span className="text-lg sm:text-xl">🛒</span>
    {t("Order Items")} <span className="text-sm opacity-60">({order.items?.length ?? 0})</span>
  </summary>

  <ul className="pl-0 mt-2 flex flex-col gap-2">
    {(order.items ?? []).map((item, idx) => (
      <li
        key={item.unique_id || idx}
        className="flex flex-col gap-1 px-2 py-2 rounded-xl bg-slate-50 border border-slate-200 shadow-sm"
      >
        {/* Main Product Row */}
        <div className="flex items-center justify-between flex-nowrap gap-2 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="inline-block min-w-[28px] h-7 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-mono font-semibold text-base border border-emerald-200 flex-shrink-0">
              {item.quantity}×
            </span>

            <div className="flex items-center gap-2 min-w-0 flex-nowrap">
              <span className="text-base sm:text-xl font-semibold text-slate-900 break-words tracking-wide truncate max-w-[140px] sm:max-w-[240px]">
                {item.product_name ||
                  item.external_product_name ||
                  item.order_item_name ||
                  t("Unnamed")}
              </span>

              <span className="inline-flex items-center px-2 py-0.5 rounded-lg font-semibold text-xs tracking-wide border flex-shrink-0 bg-slate-100 text-slate-500 border-slate-200">
                {t("Item")}
              </span>
            </div>
          </div>

          <span
            className={`text-base sm:text-xl font-semibold font-mono px-3 py-1 rounded-xl border transition whitespace-nowrap ${statusVisual.priceTag}`}
          >
            {formatCurrency(Number(item.price || 0))}
          </span>
        </div>

        {item.extras?.length > 0 && (
          <div className="ml-3 sm:ml-6 mt-2 flex flex-col gap-1">
            {item.extras.map((ex, i) => {
              const perItemQty = ex.quantity || 1;
              const itemQty = item.quantity || 1;
              const totalQty = perItemQty * itemQty;
              const unit = parseFloat(ex.price || ex.extraPrice || 0) || 0;
              const lineTotal = unit * totalQty;
              return (
                <div
                  key={i}
                  className={`flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 px-3 py-1 rounded-xl text-base font-medium transition ${statusVisual.extrasRow}`}
                  style={{ fontSize: "1.08em" }}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    ➕ {ex.name}
                    <span className="ml-2 font-semibold text-inherit text-base sm:text-lg tracking-wide">
                      ×{totalQty}
                    </span>
                  </span>
                  <span className="font-mono text-center sm:text-right w-full sm:w-auto">
                    {formatCurrency(lineTotal)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {item.note && (
          <div
            className={`ml-3 sm:ml-6 mt-2 px-3 py-1 rounded-xl font-medium italic flex items-start sm:items-center gap-2 text-base transition ${statusVisual.noteBox}`}
          >
            📝 <span style={{ wordBreak: "break-word" }}>{item.note}</span>
          </div>
        )}
      </li>
    ))}
  </ul>
</details>


{/* --- DRIVER + PAYMENT + TOTAL + BUTTONS --- */}
<div className="flex flex-col w-full mt-auto pt-0 gap-2">

<div className="flex items-center justify-between w-full gap-2 mt-2 flex-nowrap overflow-x-auto">
  <div className="flex items-center gap-2 flex-1 min-w-0">
    <span className="font-semibold font-mono text-slate-500 text-sm tracking-wide uppercase flex-shrink-0">
      {t("Driver")}:
    </span>
  <div className="relative flex-1 min-w-[140px] max-w-full sm:w-[160px]">
      <select
        value={order.driver_id || ""}
        onChange={async (e) => {
          const driverId = e.target.value;
          await secureFetch(`/orders/${order.id}`, {
            method: "PUT",
            body: JSON.stringify({
              driver_id: driverId,
              total: order.total,
              payment_method: order.payment_method,
            }),
          });
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id ? { ...o, driver_id: driverId } : o
            )
          );
        }}
         className="appearance-none w-full h-[42px] px-3 pr-8 bg-white border border-slate-200 rounded-xl 
               text-slate-800 text-sm font-mono shadow-sm 
               focus:ring-2 focus:ring-emerald-300/70 focus:border-emerald-300 transition-all"
  >
        <option value="">{t("Unassigned")}</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 text-emerald-400 text-base">
        ▼
      </span>
    </div>
  </div>

  <span
    className="flex items-center justify-center h-[42px] text-m sm:text-lg font-extrabold font-mono text-emerald-700 
               bg-emerald-50 border border-emerald-200 px-3 sm:px-5 rounded-2xl text-right sm:ml-auto
               w-auto whitespace-nowrap flex-shrink-0"
  >
    &nbsp;{formatCurrency(discountedTotal)}
  </span>
</div>


<div className="flex items-center w-full mt-2 gap-2 sm:gap-3 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible sm:justify-between">
  {/* --- Status (Left Side) --- */}
  <div className="flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-visible sm:flex-1">
    {["packet", "phone"].includes(order.order_type) &&
      order.status !== "confirmed" &&
      order.status !== "closed" && (
        <button
          onClick={async () => {
            const res = await secureFetch(`/orders/${order.id}/confirm-online`, { method: "POST" });
            if (!res.ok) {
              const err = await res.json();
              return alert(`Confirm failed: ${err.error}`);
            }
            const { order: updated } = await res.json();
            const items = await secureFetch(`/orders/${order.id}/items`);
            setOrders((prev) =>
              prev.map((o) => (o.id === updated.id ? { ...updated, items } : o))
            );
          }}
          className="animate-pulse inline-flex items-center justify-center px-3 py-1.5 rounded-xl 
                     bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm 
                     shadow transition-all"
        >
          ⚡ {t("Confirm")}
        </button>
      )}

    {order.status !== "cancelled" && order.status !== "closed" && (
      <button
        onClick={() => openCancelModalForOrder(order)}
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl 
                   bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs sm:text-sm 
                   shadow transition-all"
      >
        ✖ {t("Cancel")}
      </button>
    )}

    {!autoConfirmOrders && order.status === "confirmed" && (
      <span
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl 
                   bg-emerald-100 text-emerald-700 font-semibold text-xs sm:text-sm 
                   border border-emerald-300 shadow-sm"
      >
        ✅ {t("confirmed")}
      </span>
    )}

    {autoConfirmOrders && order.status === "confirmed" && (
      <span
        className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl 
                   bg-emerald-100 text-emerald-700 font-semibold text-xs sm:text-sm 
                   border border-emerald-300 shadow-sm"
      >
        ⚙️ {t("Auto Confirmed")}
      </span>
    )}

    {order.status === "draft" && (
      <span className="px-3 py-1.5 rounded-xl font-semibold text-xs sm:text-sm bg-slate-100 text-slate-500 border border-slate-200 shadow-sm">
        {t("draft")}
      </span>
    )}
    {order.status === "cancelled" && (
      <span className="px-3 py-1.5 rounded-xl font-semibold text-xs sm:text-sm bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">
        {t("cancelled")}
      </span>
    )}
    {order.status === "closed" && (
      <span className="px-3 py-1.5 rounded-xl font-semibold text-xs sm:text-sm bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
        {t("closed")}
      </span>
    )}
  </div>

  {/* --- Payment + Edit (Right Side, unchanged) --- */}
  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 pl-1">
    <div className="flex items-center gap-2">
      <span className="font-semibold text-slate-700 text-s sm:text-base">
        {t("Paid")}:
      </span>
      <span
        className="px-1.5 py-1 rounded-xl bg-emerald-100 border border-emerald-300 
                   text-emerald-800 font-bold text-s sm:text-base shadow-sm"
      >
        {order.payment_method ? order.payment_method : "—"}
      </span>
    </div>

    {!isOnlinePayment && (
      <button
        className="px-1.5 py-1.5 rounded-xl bg-white border border-slate-300 
                   text-slate-700 hover:text-emerald-700 hover:border-emerald-400 
                   font-semibold text-sm sm:text-base shadow-sm transition"
        onClick={() => openPaymentModalForOrder(order)}
      >
        ✏️ {t("Edit")}
      </button>
    )}
  </div>
</div>



</div>



  {/* === ACTION BUTTON === */}
  <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full">
    {!normalizeDriverStatus(order.driver_status) && (
      <button
        className="w-full px-5 py-3 rounded-2xl font-semibold text-base bg-slate-900 hover:bg-slate-800 
                   text-white shadow transition"
        disabled={driverButtonDisabled(order)}
        onClick={async () => {
          if (driverButtonDisabled(order)) return;
          const nextStatus = isYemeksepetiPickupOrder(order) ? "delivered" : "on_road";
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id ? { ...o, driver_status: nextStatus } : o
            )
          );
          await secureFetch(`/orders/${order.id}/driver-status`, {
            method: 'PATCH',
            body: JSON.stringify({ driver_status: nextStatus }),
          });
        }}
      >
        {isYemeksepetiPickupOrder(order) ? t("Picked up") : t("On Road")}
      </button>
    )}

    {normalizeDriverStatus(order.driver_status) === "on_road" && !isYemeksepetiPickupOrder(order) && (
      <button
        className="w-full px-5 py-3 rounded-2xl font-semibold text-base bg-sky-500 hover:bg-sky-600 
                   text-white shadow transition"
        disabled={driverButtonDisabled(order)}
        onClick={async () => {
          if (driverButtonDisabled(order)) return;
          setUpdating((prev) => ({ ...prev, [order.id]: true }));
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id ? { ...o, driver_status: 'delivered' } : o
            )
          );
          try {
            await secureFetch(`/orders/${order.id}/driver-status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ driver_status: 'delivered' }),
            });
          } catch (err) {
            console.error("❌ Failed to mark delivered:", err);
            if (!propOrders) await fetchOrders();
          } finally {
            setUpdating((prev) => ({ ...prev, [order.id]: false }));
          }
        }}
      >
        {t("Delivered")}
      </button>
    )}

    {normalizeDriverStatus(order.driver_status) === "on_road" && isYemeksepetiPickupOrder(order) && (
      <button
        className="w-full px-5 py-3 rounded-2xl font-semibold text-base bg-emerald-500 hover:bg-emerald-600 
                   text-white shadow transition"
        disabled={driverButtonDisabled(order)}
        onClick={async () => {
          if (driverButtonDisabled(order)) return;
          setUpdating((prev) => ({ ...prev, [order.id]: true }));
          setOrders((prev) =>
            prev.map((o) =>
              o.id === order.id ? { ...o, driver_status: 'delivered' } : o
            )
          );
          try {
            await secureFetch(`/orders/${order.id}/driver-status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ driver_status: 'delivered' }),
            });
          } catch (err) {
            console.error("❌ Failed to complete pickup order:", err);
            if (!propOrders) await fetchOrders();
          } finally {
            setUpdating((prev) => ({ ...prev, [order.id]: false }));
          }
        }}
      >
        {t("Completed")}
      </button>
    )}

    {normalizeDriverStatus(order.driver_status) === "delivered" && (
      <button
        className="w-full px-5 py-3 rounded-2xl font-semibold text-base bg-emerald-500 hover:bg-emerald-600 
                   text-white shadow transition"
        onClick={async () => {
          if (isOnlinePayment) {
            try {
              await secureFetch(`/orders/${order.id}/close`, { method: "POST" });
              setOrders((prev) => prev.filter((o) => Number(o.id) !== Number(order.id)));
            } catch (err) {
              console.error("❌ Failed to close online-paid order:", err);
              toast.error(t("Failed to close order"));
              if (!propOrders) await fetchOrders();
            }
            return;
          }

          openPaymentModalForOrder(order, { closeAfterSave: true });
        }}
      >
        {t("Close Order")}
      </button>
    )}
    
  </div>
  
</div>


            
          </div>

     

      );
    })}

  </div>
  {renderPaymentModal()}
  {renderCancelModal()}
  <style>{`
    @keyframes pulseGlow {
      0% { filter: brightness(1.12) blur(0.8px);}
      100% { filter: brightness(1.24) blur(2.5px);}
    }
  `}</style>
</div>
  </div>
);




}

// --- Show items for each phone order ---
function OrderItems({ orderId }) {
  const [items, setItems] = useState([]);
  const { formatCurrency } = useCurrency();
  useEffect(() => {
    fetch(`/orders/${orderId}/items`)
      .then((res) => res.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, [orderId]);
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 border-t pt-2 text-sm space-y-1">
      {items.map((item) => (
        <li key={item.id || item.product_id}>
          <div className="flex justify-between">
           <span>
  {item.product_name || item.external_product_name || item.order_item_name || "Unmatched Product"} x{item.quantity}
</span>

            <span className="text-slate-700 font-mono">
              {formatCurrency((parseFloat(item.price) || 0) * item.quantity)}
            </span>

          </div>
          {/* --- EXTRAS --- */}


        </li>
      ))}
    </ul>
  );
}
