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
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
const API_URL = import.meta.env.VITE_API_URL || "";

const ONLINE_SOURCE_DISPLAY_NAMES = {
  yemeksepeti: "Yemeksepeti",
  migros: "Migros",
  trendyol: "Trendyol",
  getir: "Getir",
  glovo: "Glovo",
};

const formatOnlineSourceLabel = (source) => {
  if (!source) return null;
  const trimmed = String(source).trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (!normalized) return trimmed;
  if (Object.prototype.hasOwnProperty.call(ONLINE_SOURCE_DISPLAY_NAMES, normalized)) {
    return ONLINE_SOURCE_DISPLAY_NAMES[normalized];
  }
  const parts = normalized
    .split(/[^a-z0-9]+/)
    .filter((chunk) => chunk.length)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1));
  return parts.length ? parts.join(" ") : trimmed;
};

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
      <div className="bg-white rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 p-7 max-w-4xl w-full text-slate-900 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
        <h2 className="font-semibold text-xl sm:text-2xl mb-4 tracking-tight text-slate-900 dark:text-slate-100">
          ⚙️ {t("Settings")}
        </h2>

        <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-2xl p-1 mb-4 dark:bg-slate-900/60 dark:border-slate-700">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={isActive}
                className={`px-4 py-2 rounded-2xl text-sm sm:text-base font-semibold transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow border border-slate-200 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-700"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100"
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
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={input}
                placeholder={t("Drink name (e.g. Cola)")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDrink()}
                disabled={saving}
              />
              <button
                className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition dark:bg-indigo-600 dark:hover:bg-indigo-500"
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
                    className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded-xl border border-slate-200 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700"
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
                  className="border border-slate-200 rounded-3xl p-4 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
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
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [editingDriver, setEditingDriver] = useState({});
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
  const [integrationsSettings, setIntegrationsSettings] = useState({});
  const [confirmingOnlineOrders, setConfirmingOnlineOrders] = useState({});
const showDriverColumn = true;

const [showPaymentModal, setShowPaymentModal] = useState(false);
const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
const [splitPayments, setSplitPayments] = useState([{ method: "", amount: "" }]);
const [pendingCloseOrderId, setPendingCloseOrderId] = useState(null);
const [showCancelModal, setShowCancelModal] = useState(false);
const [cancelOrder, setCancelOrder] = useState(null);
const [cancelReason, setCancelReason] = useState("");
const [cancelLoading, setCancelLoading] = useState(false);
const [refundMethodId, setRefundMethodId] = useState("");

const [transactionSettings, setTransactionSettings] = useState(
  DEFAULT_TRANSACTION_SETTINGS
);
useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);
const autoClosingDeliveredRef = useRef(new Set());

const [notificationSettings, setNotificationSettings] = useState({
  enabled: true,
  enableToasts: true,
});
useSetting("notifications", setNotificationSettings, {
  enabled: true,
  enableToasts: true,
});

const emitToast = useCallback(
  (type, message) => {
    const enableToasts = notificationSettings?.enableToasts ?? true;
    if (!enableToasts) return;
    const fn = toast?.[type];
    if (typeof fn === "function") fn(message);
  },
  [notificationSettings?.enableToasts]
);

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

const normalizePaymentKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const resolveAutoClosePaymentMethod = useCallback(
  (order) => {
    const methodsSetting = transactionSettings.autoClosePacketAfterPayMethods;
    const allowsAll = methodsSetting === null || typeof methodsSetting === "undefined";
    const allowedIds = Array.isArray(methodsSetting) ? methodsSetting.filter(Boolean) : null;

    const idToLabel = new Map(
      methodOptionSource.map((m) => [String(m.id || ""), String(m.label || m.id || "")])
    );

    const raw = String(order?.payment_method || "").trim();
    const tokens = raw
      ? raw
          .split(/[+,]/)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

    const matchedIds = tokens
      .map((token) => {
        const norm = normalizePaymentKey(token);
        const match = methodOptionSource.find((m) => {
          const idNorm = normalizePaymentKey(m.id);
          const labelNorm = normalizePaymentKey(m.label);
          return idNorm === norm || labelNorm === norm;
        });
        return match?.id || null;
      })
      .filter(Boolean);

    const pickId = () => {
      if (allowsAll) return matchedIds[0] || "";
      if (!Array.isArray(allowedIds)) return matchedIds[0] || "";
      const allowedMatch = matchedIds.find((id) => allowedIds.includes(id));
      if (allowedMatch) return allowedMatch;
      return allowedIds[0] || "";
    };

    const id = pickId();
    if (id) {
      return { id, label: idToLabel.get(String(id)) || String(id) };
    }

    // Fallback to whatever label is already on the order (or the first method label)
    return { id: "", label: tokens[0] || fallbackMethodLabel };
  },
  [
    fallbackMethodLabel,
    methodOptionSource,
    transactionSettings.autoClosePacketAfterPayMethods,
  ]
);

const shouldAutoClosePacketOnDelivered = useCallback(
  (order) => {
    if (!transactionSettings.autoClosePacketAfterPay) return false;
    if (!order) return false;
    const orderType = String(order?.order_type || "").trim().toLowerCase();
    const isPacketType = ["packet", "phone", "online"].includes(orderType);
    if (!isPacketType) return false;

    const methodsSetting = transactionSettings.autoClosePacketAfterPayMethods;
    const allowsAll = methodsSetting === null || typeof methodsSetting === "undefined";
    if (allowsAll) return true;
    if (!Array.isArray(methodsSetting)) return true;
    if (methodsSetting.length === 0) return false;

    const raw = String(order?.payment_method || "").trim();
    const tokens = raw
      ? raw
          .split(/[+,]/)
          .map((part) => part.trim())
          .filter(Boolean)
      : [];

    const usedIds = tokens
      .map((token) => {
        const norm = normalizePaymentKey(token);
        const match = methodOptionSource.find((m) => {
          const idNorm = normalizePaymentKey(m.id);
          const labelNorm = normalizePaymentKey(m.label);
          return idNorm === norm || labelNorm === norm;
        });
        return match?.id || null;
      })
      .filter(Boolean);

    if (usedIds.length === 0) return true; // unknown method => keep legacy behavior
    return usedIds.some((id) => methodsSetting.includes(id));
  },
  [
    methodOptionSource,
    transactionSettings.autoClosePacketAfterPay,
    transactionSettings.autoClosePacketAfterPayMethods,
  ]
);

const closeOrderInstantly = useCallback(
  async (order) => {
    const orderId = order?.id;
    if (!orderId) return;

    // If already paid online (or zero total), just close.
    const totalWithExtras = calcOrderTotalWithExtras(order);
    const discountedTotal = totalWithExtras - calcOrderDiscount(order);
    const normalizedPayment = String(order?.payment_method || "").trim().toLowerCase();
    const isOnline =
      normalizedPayment.includes("online") ||
      normalizedPayment.includes("yemeksepeti online");

    if (!isOnline && discountedTotal > 0) {
      const receiptId = order.receipt_id || uuidv4();
      const method = resolveAutoClosePaymentMethod(order);

      await secureFetch(`/orders/receipt-methods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          receipt_id: receiptId,
          methods: { [method.label]: Number(discountedTotal.toFixed(2)) },
        }),
      });

      await secureFetch(`/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          payment_method: method.label,
          total: discountedTotal,
          receipt_id: receiptId,
        }),
      });
    }

    try {
      await secureFetch(`/orders/${orderId}/close`, { method: "POST" });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const status = err?.details?.status;
      if (status === 400 && message.includes("already closed")) {
        // Treat as success (idempotent close).
      } else {
        throw err;
      }
    }
    setOrders((prev) => prev.filter((o) => Number(o.id) !== Number(orderId)));
  },
  [resolveAutoClosePaymentMethod]
);

useEffect(() => {
  if (!transactionSettings.autoClosePacketAfterPay) return;
  if (!Array.isArray(orders) || orders.length === 0) return;

  const deliveredCandidates = orders.filter((order) => {
    const id = order?.id;
    if (!id) return false;
    if (autoClosingDeliveredRef.current.has(id)) return false;
    if (normalizeDriverStatus(order?.driver_status) !== "delivered") return false;
    return shouldAutoClosePacketOnDelivered(order);
  });

  if (deliveredCandidates.length === 0) return;

  deliveredCandidates.forEach((order) => {
    const id = order.id;
    autoClosingDeliveredRef.current.add(id);
    closeOrderInstantly(order).catch((err) => {
      autoClosingDeliveredRef.current.delete(id);
      console.error("❌ Failed to auto-close delivered order:", err);
      emitToast("error", t("Failed to close order"));
    });
  });
}, [
  closeOrderInstantly,
  orders,
  shouldAutoClosePacketOnDelivered,
  t,
  transactionSettings.autoClosePacketAfterPay,
  emitToast,
]);

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
            `/orders/receipt-methods/${editingPaymentOrder.receipt_id}`
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
    .then((data) => setIntegrationsSettings(data || {}))
    .catch(() => setIntegrationsSettings({}));
}, []);

const isAutoConfirmEnabledForOrder = useCallback(
  (order) => {
    const source = String(order?.external_source || "").toLowerCase().trim();
    const bySource = source && integrationsSettings && typeof integrationsSettings === "object"
      ? integrationsSettings?.[source]?.autoConfirmOrders
      : undefined;
    const legacy = integrationsSettings?.auto_confirm_orders;
    if (typeof bySource === "boolean") return bySource;
    return legacy === true;
  },
  [integrationsSettings]
);

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
  if (!reportFromDate || !reportToDate) return;
  setReportLoading(true);
  setDriverReport(null);
  try {
    {
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

      const selectedId = Number(selectedDriverId);
      const hasSelectedDriver =
        String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);
      if (hasSelectedDriver) {
        driverIds = [selectedId];
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
}, [reportFromDate, reportToDate, selectedDriverId, showDriverReport]);



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
            console.warn("⚠️ Orders fetch failed:", err);
            results[current] = null;
          }
        }
      })
    );
    return results.filter(Boolean);
  };

  const withKitchenStatus = await runWithConcurrency(phoneOrders, 6, async (order) => {
    let items = await secureFetch(`/orders/${order.id}/items`);
    if (!items?.length) {
      await new Promise((r) => setTimeout(r, 200));
      items = await secureFetch(`/orders/${order.id}/items`);
    }
    const status = String(order?.status || "").toLowerCase();
    if (status === "draft" && (!items || items.length === 0)) {
      return null;
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

    return { ...order, items: normalizedItems, overallKitchenStatus };
  });

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

const confirmOnlineOrder = async (order) => {
  const orderId = order?.id;
  if (!orderId) return;
  setConfirmingOnlineOrders((prev) => ({ ...prev, [orderId]: true }));
  try {
    const result = await secureFetch(`/orders/${orderId}/confirm-online`, {
      method: "POST",
    });
    toast.success(t("Order confirmed"));
    setOrders((prev) =>
      prev.map((o) => (Number(o.id) === Number(orderId) ? { ...o, status: "confirmed" } : o))
    );
    if (!propOrders) await fetchOrders();
    return result;
  } catch (err) {
    console.error("❌ Failed to confirm online order:", err);
    toast.error(err?.message || t("Failed to confirm order"));
  } finally {
    setConfirmingOnlineOrders((prev) => ({ ...prev, [orderId]: false }));
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

const openRouteForSelectedDriver = async () => {
  const selectedId = Number(selectedDriverId);
  const hasSelectedDriver =
    String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);

  const scopedOrders = hasSelectedDriver
    ? (orders || []).filter((order) => Number(order?.driver_id) === selectedId)
    : (orders || []);

  setMapOrders(scopedOrders);
  const stops = await fetchOrderStops(scopedOrders);
  setMapStops(stops);
  setShowRoute(true);
};


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

  const isPickupNoDriverOk = isYemeksepetiPickupOrder(order);
  if (!order.driver_id && !isPickupNoDriverOk) return true;

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


const filteredOrders = orders;
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

const filteredDrinkSummaryByDriver = useMemo(() => {
  const selectedId = Number(selectedDriverId);
  const hasSelectedDriver =
    String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);
  if (!hasSelectedDriver) return drinkSummaryByDriver;
  return drinkSummaryByDriver.filter(
    (entry) => Number(entry?.driverId) === selectedId
  );
}, [drinkSummaryByDriver, selectedDriverId]);

const assignedOrderCountForSelectedDriver = useMemo(() => {
  const list = Array.isArray(orders) ? orders : [];
  const selectedId = Number(selectedDriverId);
  const hasSelectedDriver =
    String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);

  if (hasSelectedDriver) {
    return list.filter((order) => Number(order?.driver_id) === selectedId).length;
  }

  return list.filter((order) => Number.isFinite(Number(order?.driver_id))).length;
}, [orders, selectedDriverId]);

const renderPaymentModal = () => {
  if (!showPaymentModal || !editingPaymentOrder) return null;

  const grandTotal =
    calcOrderTotalWithExtras(editingPaymentOrder) -
    calcOrderDiscount(editingPaymentOrder);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
      <div className="relative bg-white rounded-3xl w-[94vw] max-w-md mx-auto p-7 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 animate-fade-in dark:bg-slate-950 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
        {/* Close */}
        <button
          onClick={closePaymentModal}
          className="absolute top-3 right-4 text-2xl text-slate-400 hover:text-emerald-500 transition dark:hover:text-emerald-300"
          title={t("Close")}
        >
          ✕
        </button>
        {/* Title */}
        <div className="flex flex-col items-center mb-5">
          <div className="text-3xl font-semibold text-slate-900 mb-1 dark:text-slate-100">💸 {t("Payment")}</div>
          <div className="text-sm font-medium text-slate-500 mb-2 dark:text-slate-300">
            {t("Order")} #{editingPaymentOrder.id}
          </div>
          <div className="text-xs bg-slate-100 text-slate-500 rounded-xl px-4 py-1 font-medium tracking-[0.35em] uppercase border border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700">
            {t("Split between multiple payment methods if needed.")}
          </div>
        </div>
        {/* Split Payment Rows */}
        <div className="flex flex-col gap-3 mb-5">
          {splitPayments.map((pay, idx) => (
            <div
              key={idx}
              className="flex gap-3 items-center group animate-fade-in border-b border-slate-200 pb-2 dark:border-slate-800"
            >
              <select
                value={pay.method}
                onChange={(e) => {
                  const copy = [...splitPayments];
                  copy[idx].method = e.target.value;
                  setSplitPayments(copy);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 font-medium text-base bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-indigo-500/30"
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
                className="w-28 rounded-xl border border-slate-200 px-4 py-2 text-base text-right font-mono bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-indigo-500/30"
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
                  className="ml-2 p-2 bg-slate-100 text-rose-500 rounded-full hover:bg-rose-100 border border-slate-200 transition dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-rose-950/25"
                  onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                  title={t("Remove")}
                >
                  –
                </button>
              )}
            </div>
          ))}
          <button
            className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium shadow transition-all dark:bg-indigo-600 dark:hover:bg-indigo-500"
            onClick={() =>
              setSplitPayments([...splitPayments, { method: fallbackMethodLabel, amount: "" }])
            }
          >
            <span className="text-lg sm:text-xl">+</span> {t("Add Payment Method")}
          </button>
        </div>
        {/* Total Summary */}
        <div className="bg-emerald-50 border border-emerald-200 px-5 py-3 rounded-2xl shadow-inner text-center dark:bg-emerald-950/25 dark:border-emerald-500/30">
  <span className="text-2xl sm:text-4xl text-emerald-700 font-extrabold font-mono tracking-tight dark:text-emerald-200">
    {formatCurrency(grandTotal)}


          </span>
          <span className="text-sm sm:text-base text-slate-600 flex gap-2 items-center dark:text-slate-300">
            {t("Split Amount Paid")}:&nbsp;
            <span className="text-lg sm:text-xl font-semibold text-slate-900 font-mono dark:text-slate-100">
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
            className="px-5 py-2 rounded-xl bg-white text-slate-600 font-medium border border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
            onClick={closePaymentModal}
          >
            {t("Cancel")}
          </button>
          <button
            className={`px-6 py-2 rounded-xl font-semibold shadow text-white transition-all duration-150 ${
              splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) === grandTotal
                ? "bg-emerald-500 hover:bg-emerald-400 scale-[1.02] dark:bg-emerald-600 dark:hover:bg-emerald-500"
                : "bg-slate-300 cursor-not-allowed text-slate-500 dark:bg-slate-700 dark:text-slate-300"
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
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-950 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1 dark:text-slate-500">
              {t("Cancel Order")}
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("Order")} #{cancelOrder?.id || "-"}
            </p>
            <p className="text-sm text-rose-500 mt-1">
              {cancelOrder?.customer_name || t("Customer")}
            </p>
          </div>
          <button
            type="button"
            onClick={closeCancelModal}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-3 dark:text-slate-300">
          {t("The cancellation reason will be recorded for auditing.")}
        </p>

        {shouldShowRefundMethod ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 mb-3 dark:border-rose-500/25 dark:bg-rose-950/20">
            <label className="block text-xs font-semibold uppercase tracking-wide text-rose-500">
              {t("Refund Method")}
              <select
                className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200 dark:focus:ring-rose-500/20"
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
            <p className="text-xs text-rose-500 dark:text-rose-300">
              {t("Refund amount")}: {formatCurrency(refundAmount)}
            </p>
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {t("No paid items detected. This will simply cancel the order.")}
          </p>
        )}

        <textarea
          rows={4}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          placeholder={t("Why is the order being cancelled?")}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-rose-500/20"
        />

        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={closeCancelModal}
            className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
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
  <div className="min-h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">

{/* --- HEADER & ACTIONS, Always Centered --- */}
<div className="w-full flex flex-col items-center justify-center py-2 min-h-[44px]">

  <div className="flex flex-col items-center justify-center w-full max-w-6xl">
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-col md:flex-row md:flex-nowrap items-center justify-center gap-2 w-full">
        <div className="w-full md:w-auto flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-2 sm:gap-3">
          <button
            className="w-full sm:w-auto md:shrink-0 sm:whitespace-nowrap h-10 px-4 sm:px-5 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-sm sm:text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
            disabled={!drivers.length}
            onClick={openRouteForSelectedDriver}
          >
            <span className="inline-flex items-center gap-2 sm:whitespace-nowrap">
              <span className="inline-flex h-4 w-4 items-center justify-center text-slate-600" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M5 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
                  <path d="M15 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
                  <path d="M7 16h6l2-7h4" />
                  <path d="M9 16l-1-5H5" />
                  <path d="M6 11h2" />
                </svg>
              </span>
              <span className="shrink-0 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-md border border-emerald-300 font-semibold leading-none">
                LIVE
              </span>
              <span className="sm:whitespace-nowrap">{t("Route")}</span>
            </span>
          </button>

          <button
            className="w-full sm:w-auto md:shrink-0 sm:whitespace-nowrap h-10 px-4 sm:px-5 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-sm sm:text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
            disabled={!drivers.length}
            onClick={() => setShowDrinkModal(true)}
          >
            <span className="inline-flex items-center gap-2 sm:whitespace-nowrap">
              <span className="sm:whitespace-nowrap">{t("Checklist")}</span>
            </span>
          </button>

          <button
            className="w-full sm:w-auto md:shrink-0 sm:whitespace-nowrap h-10 px-4 sm:px-5 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-sm sm:text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition inline-flex items-center justify-center gap-2"
            disabled={!drivers.length}
            onClick={handleToggleDriverReport}
          >
            <span className="inline-flex items-center gap-2 sm:whitespace-nowrap">
              <span className="inline-flex h-4 w-4 items-center justify-center text-slate-600" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M4 19V5" />
                  <path d="M4 19h16" />
                  <path d="M8 17v-6" />
                  <path d="M12 17V9" />
                  <path d="M16 17v-4" />
                </svg>
              </span>
              <span className="sm:whitespace-nowrap">{t("Driver Report")}</span>
            </span>
          </button>
        </div>

        <div className="w-full md:w-auto flex items-center justify-center gap-2">
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            className="w-full sm:w-auto md:shrink-0 sm:whitespace-nowrap h-10 px-3 pr-8 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-sm sm:text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
            disabled={!drivers.length}
          >
            <option value="">{t("All Drivers")}</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="h-10 inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-3 text-sm sm:text-base font-semibold text-slate-700 shadow-sm whitespace-nowrap">
            Assigned: {assignedOrderCountForSelectedDriver}
          </span>
        </div>

        {/* Date range sits next to Driver Report on big screens */}
        <div className="hidden md:flex md:w-auto items-center gap-2 flex-nowrap whitespace-nowrap bg-white/80 rounded-md h-10 px-2 border border-slate-200 shadow-sm">
          <input
            type="date"
            className="shrink-0 h-10 border border-slate-200 rounded-md px-4 text-slate-800 bg-white shadow-sm text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
            value={reportFromDate}
            max={reportToDate || new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportFromDate(e.target.value)}
            disabled={reportLoading}
          />
          <input
            type="date"
            className="shrink-0 h-10 border border-slate-200 rounded-md px-4 text-slate-800 bg-white shadow-sm text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
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
        <div className="w-full md:w-auto flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap bg-white/80 rounded-md h-10 px-2 border border-slate-200 shadow-sm">
          <input
            type="date"
            className="shrink-0 h-10 border border-slate-200 rounded-md px-4 text-slate-800 bg-white shadow-sm text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
            value={reportFromDate}
            max={reportToDate || new Date().toISOString().slice(0, 10)}
            onChange={(e) => setReportFromDate(e.target.value)}
            disabled={reportLoading}
          />
          <input
            type="date"
            className="shrink-0 h-10 border border-slate-200 rounded-md px-4 text-slate-800 bg-white shadow-sm text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
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
    {showDriverReport && (
      <div className="mt-2">
        {reportLoading ? (
          <div className="animate-pulse text-lg sm:text-xl">{t("Loading driver report...")}</div>
        ) : driverReport?.error ? (
          <div className="text-red-600 font-bold">{driverReport.error}</div>
        ) : driverReport ? (
          <div className="rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] p-8 bg-white border border-slate-200 space-y-5 dark:bg-slate-950/60 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
            <div className="flex flex-wrap gap-10 items-center mb-3">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">{t("Packets Delivered")}</div>
                <div className="text-xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">{driverReport.packets_delivered}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">{t("Total Sales")}</div>
                <div className="text-xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
                  {driverReport.total_sales != null
                    ? formatCurrency(driverReport.total_sales)
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">{t("By Payment Method")}</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(driverReport.sales_by_method).map(
                    ([method, amt]) => (
                      <span
                        key={method}
                        className="bg-slate-100 border border-slate-200 shadow-sm px-3 py-1 rounded-lg font-semibold text-sm text-slate-700 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-200"
                      >
                        {method}: {formatCurrency(amt)}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-950/40 dark:border-slate-800">
                <thead>
	  <tr>
	    {showDriverColumn && (
	      <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Driver")}</th>
	    )}
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Customer")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Address")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Total")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Payment")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Delivered")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Pickup→Delivery")}</th>
	    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">{t("Kitchen→Delivery")}</th>
	  </tr>
</thead>
<tbody>
  {driverReport.orders.map(ord => (
    <tr key={ord.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:hover:bg-slate-900/30">
      {showDriverColumn && (
        <td className="p-3 text-slate-700 dark:text-slate-200">{ord.driver_name || "-"}</td>
      )}
      <td className="p-3 text-slate-700 dark:text-slate-200">{ord.customer_name || "-"}</td>
      <td className="p-3 text-slate-500 dark:text-slate-400">{ord.customer_address || "-"}</td>
      <td className="p-3 text-slate-900 font-semibold dark:text-slate-100">
        {formatCurrency(parseFloat(ord.total || 0))}
      </td>
      <td className="p-3 text-slate-600 dark:text-slate-300">{ord.payment_method}</td>
      <td className="p-3 text-slate-500 dark:text-slate-400">{ord.delivered_at ? new Date(ord.delivered_at).toLocaleTimeString() : "-"}</td>
      <td className="p-3 text-slate-500 dark:text-slate-400">
        {ord.delivery_time_seconds
          ? (ord.delivery_time_seconds / 60).toFixed(1) + ` ${t("min")}`
          : "-"}
      </td>
      <td className="p-3 text-slate-500 dark:text-slate-400">
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
        <div className="relative w-full h-full max-w-7xl max-h-[95vh] mx-auto bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col dark:bg-slate-950">
          {/* Map Container */}
          {(() => {
            const selectedIdNum = Number(selectedDriverId);
            const hasSelectedDriver =
              String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedIdNum);
            const selectedDriver = hasSelectedDriver
              ? (drivers || []).find((d) => Number(d?.id) === selectedIdNum)
              : null;

            return (
              <LiveRouteMap
                stopsOverride={mapStops}
                driverNameOverride={selectedDriver?.name || ""}
                driverId={hasSelectedDriver ? String(selectedIdNum) : ""}
                orders={mapOrders.length ? mapOrders : filteredOrders}
                onClose={() => setShowRoute(false)}
              />
            );
          })()}
        </div>
      </div>
    )}


    {/* --- DRINK SETTINGS MODAL --- */}
    <DrinkSettingsModal
      open={showDrinkModal}
      onClose={() => setShowDrinkModal(false)}
      fetchDrinks={fetchDrinks}
      summaryByDriver={filteredDrinkSummaryByDriver}
    />

{/* --- ORDERS LIST --- */}
<div className="min-h-screen px-4 sm:px-6 lg:px-8 py-6 w-full mx-auto relative bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
<div
  className={`
    grid
    gap-6
    w-full
    py-6
    auto-rows-fr
    ${orders.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-1"}
    sm:grid-cols-1
    md:grid-cols-1
    lg:grid-cols-1
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
      const isCancelled = order.status === "cancelled";
      const kitchenStatus = order.kitchen_status || order.overallKitchenStatus;
      const isReady = (kitchenStatus === "ready" || kitchenStatus === "delivered") && !isDelivered && !isPicked;
      const isPrep = kitchenStatus === "preparing";
      const onlinePayments = [
        "online", "online payment", "online card", "yemeksepeti online"
      ];
      const isOnlinePayment = order.payment_method &&
        onlinePayments.some(type => order.payment_method.toLowerCase().includes(type));
      const isYemeksepeti = String(order?.external_source || "").toLowerCase() === "yemeksepeti";
      const isMigros = String(order?.external_source || "").toLowerCase() === "migros";
      const onlineSourceLabel = formatOnlineSourceLabel(order?.external_source);
      const autoConfirmEnabledForOrder = isAutoConfirmEnabledForOrder(order);
      const hasUnmatchedYsItems =
        isYemeksepeti &&
        Array.isArray(order.items) &&
        order.items.some((item) => !item.product_id);
      const externalOrderRef =
        order.external_id ||
        order.externalId ||
        order.external_order_id ||
        order.externalOrderId ||
        order.order_code ||
        order.orderCode ||
        "";
      const isExternalOnlineOrder =
        ["packet", "phone"].includes(String(order?.order_type || "").toLowerCase()) &&
        Boolean(onlineSourceLabel || externalOrderRef || isOnlinePayment);
      const normalizedOrderStatus = String(order?.status || "").toLowerCase().trim();
      const shouldShowManualConfirm =
        !autoConfirmEnabledForOrder &&
        isExternalOnlineOrder &&
        !["confirmed", "closed", "cancelled"].includes(normalizedOrderStatus);
      const orderNote =
        order.takeaway_notes ||
        order.takeawayNotes ||
        order.notes ||
        order.note ||
        "";
      const fullOrderNote = String(orderNote || "").trim();
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
      const displayOrderNote = isExternalOnlineOrder ? fullOrderNote : sanitizedOrderNote;

 const statusVisual = (() => {
  const isPacketOrder = order.order_type === "packet";

  // ✅ Delivered Orders (Completed)
  if (isDelivered) {
    return {
      card: "bg-emerald-50 border-4 border-emerald-400 text-emerald-900 shadow-md dark:bg-emerald-950/25 dark:border-emerald-500/40 dark:text-emerald-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-emerald-100 border border-emerald-300 shadow-sm dark:bg-emerald-950/25 dark:border-emerald-500/30",
      timer: "bg-emerald-200 text-emerald-900 border border-emerald-300 shadow-sm dark:bg-emerald-950/35 dark:text-emerald-100 dark:border-emerald-500/30",
      nameChip: "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/25 dark:text-emerald-100 dark:border-emerald-500/30",
      phoneBtn: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm dark:bg-emerald-600 dark:hover:bg-emerald-500",
      statusChip: "bg-emerald-500 text-white border border-emerald-600 shadow-sm dark:bg-emerald-600 dark:border-emerald-500/40",
      priceTag: "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/25 dark:text-emerald-100 dark:border-emerald-500/30",
      extrasRow: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-500/30",
      noteBox: "bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-sm dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-500/30",
    };
  }

  // 🚗 On Road (Driver picked up)
  if (isPicked) {
    return {
      card: "bg-sky-50 border-4 border-sky-400 text-sky-900 shadow-md dark:bg-sky-950/25 dark:border-sky-500/40 dark:text-sky-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-sky-100 border border-sky-300 shadow-sm dark:bg-sky-950/25 dark:border-sky-500/30",
      timer: "bg-sky-200 text-sky-900 border border-sky-300 shadow-sm dark:bg-sky-950/35 dark:text-sky-100 dark:border-sky-500/30",
      nameChip: "bg-sky-50 text-sky-800 border border-sky-300 dark:bg-sky-950/25 dark:text-sky-100 dark:border-sky-500/30",
      phoneBtn: "bg-sky-600 text-white hover:bg-sky-700 shadow-sm dark:bg-sky-600 dark:hover:bg-sky-500",
      statusChip: "bg-sky-500 text-white border border-sky-600 shadow-sm dark:bg-sky-600 dark:border-sky-500/40",
      priceTag: "bg-sky-100 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/25 dark:text-sky-100 dark:border-sky-500/30",
      extrasRow: "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/20 dark:text-sky-100 dark:border-sky-500/30",
      noteBox: "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm dark:bg-sky-950/20 dark:text-sky-100 dark:border-sky-500/30",
    };
  }

  // ✅ Ready for Pickup/Delivery
  if (isReady) {
    return {
      card: "bg-red-50 border-4 border-red-700 text-red-950 shadow-md dark:bg-rose-950/25 dark:border-rose-500/40 dark:text-rose-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-red-100 border border-red-300 shadow-sm dark:bg-rose-950/25 dark:border-rose-500/30",
      timer: "bg-red-200 text-red-950 border border-red-300 shadow-sm dark:bg-rose-950/35 dark:text-rose-100 dark:border-rose-500/30",
      nameChip: "bg-red-100 text-red-950 border border-red-300 dark:bg-rose-950/25 dark:text-rose-100 dark:border-rose-500/30",
      phoneBtn: "bg-red-800 text-white hover:bg-red-900 shadow-sm dark:bg-rose-600 dark:hover:bg-rose-500",
      statusChip: "bg-red-700 text-white border border-red-800 shadow-sm dark:bg-rose-600 dark:border-rose-500/40",
      priceTag: "bg-red-100 text-red-900 border border-red-300 shadow-sm dark:bg-rose-950/25 dark:text-rose-100 dark:border-rose-500/30",
      extrasRow: "bg-red-50 text-red-900 border border-red-300 shadow-sm dark:bg-rose-950/20 dark:text-rose-100 dark:border-rose-500/30",
      noteBox: "bg-red-50 text-red-950 border border-red-300 shadow-sm dark:bg-rose-950/20 dark:text-rose-100 dark:border-rose-500/30",
    };
  }

  // 🍳 Preparing
  if (isPrep) {
    return {
      card: "bg-amber-50 border-4 border-amber-400 text-amber-900 shadow-md dark:bg-amber-950/20 dark:border-amber-500/40 dark:text-amber-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]",
      header: "bg-amber-100 border border-amber-300 shadow-sm dark:bg-amber-950/25 dark:border-amber-500/30",
      timer: "bg-amber-200 text-amber-900 border border-amber-300 shadow-sm dark:bg-amber-950/35 dark:text-amber-100 dark:border-amber-500/30",
      nameChip: "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/25 dark:text-amber-100 dark:border-amber-500/30",
      phoneBtn: "bg-amber-600 text-white hover:bg-amber-700 shadow-sm dark:bg-amber-600 dark:hover:bg-amber-500",
      statusChip: "bg-amber-500 text-white border border-amber-600 shadow-sm dark:bg-amber-600 dark:border-amber-500/40",
      priceTag: "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm dark:bg-amber-950/25 dark:text-amber-100 dark:border-amber-500/30",
      extrasRow: "bg-amber-50 text-amber-800 border border-amber-300 shadow-sm dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-500/30",
      noteBox: "bg-amber-50 text-amber-900 border border-amber-300 shadow-sm dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-500/30",
    };
  }

  // 🕓 Pending / Unconfirmed (default)
  return {
    card: `bg-slate-50 border-4 ${
      isPacketOrder ? "border-fuchsia-400 dark:border-fuchsia-500" : "border-slate-400 dark:border-slate-700"
    } text-slate-900 shadow-md dark:bg-slate-900/55 dark:text-slate-100 dark:shadow-[0_10px_20px_rgba(0,0,0,0.4)]`,
    header: "bg-slate-100 border border-slate-300 shadow-sm dark:bg-slate-900/60 dark:border-slate-700",
    timer: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700",
    nameChip: "bg-slate-50 text-slate-900 border border-slate-300 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700",
    phoneBtn: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm dark:bg-indigo-600 dark:hover:bg-indigo-500",
    statusChip: "bg-slate-200 text-slate-700 border border-slate-300 shadow-sm dark:bg-slate-800/70 dark:text-slate-200 dark:border-slate-700",
    priceTag: "bg-slate-100 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700",
    extrasRow: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/55 dark:text-slate-100 dark:border-slate-700",
    noteBox: "bg-slate-50 text-slate-900 border border-slate-300 shadow-sm dark:bg-slate-900/55 dark:text-slate-100 dark:border-slate-700",
  };
})();

      const normalizedDriverStatus = normalizeDriverStatus(order.driver_status);
      const isDriverOnRoad = normalizedDriverStatus === "on_road";
      const isKitchenDelivered =
        kitchenStatus === "delivered" || Boolean(order?.kitchen_delivered_at);
      const readyAtLabel =
        isPrep && !isKitchenDelivered ? getReadyAtLabel(order) : "";
      const kitchenBadgeLabel =
        isDriverOnRoad
          ? t("On Road")
          :
        isDelivered
          ? t("Delivered")
          : kitchenStatus === "new"
          ? t("New Order")
          : kitchenStatus === "preparing"
          ? t("Preparing")
          : kitchenStatus === "ready" || kitchenStatus === "delivered"
          ? t("Order ready!")
          : "";
      const kitchenBadgeIcon =
        isDelivered
          ? ""
          : kitchenStatus === "new"
          ? ""
          : kitchenStatus === "preparing"
          ? ""
          : kitchenStatus === "ready" || kitchenStatus === "delivered"
          ? ""
          : "";
      const kitchenBadgeClass = isDelivered
        ? "bg-emerald-600 text-white shadow-sm"
        : isDriverOnRoad
        ? "bg-sky-500 text-white shadow-sm"
        : kitchenStatus === "new"
        ? "bg-blue-500 text-white shadow-sm"
        : kitchenStatus === "preparing"
        ? "bg-amber-500 text-white shadow-sm"
        : kitchenStatus === "ready" || kitchenStatus === "delivered"
        ? "bg-red-700 text-white shadow-sm"
        : "bg-slate-400 text-white shadow-sm";



      const assignedDriver = drivers.find((d) => Number(d.id) === Number(order.driver_id));
      const assignedDriverName = assignedDriver?.name ? String(assignedDriver.name) : "";
      const driverAvatarUrl =
        assignedDriver?.avatar || assignedDriver?.photoUrl || assignedDriver?.photo_url || "";
      const driverInitials = assignedDriverName
        ? assignedDriverName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()
        : "DR";
      const rawDriverStatus = String(order.driver_status || "").trim().toLowerCase();
      const isPickedUp = rawDriverStatus === "picked_up";
      const driverStatusBaseLabel = isDelivered
        ? t("Delivered")
        : isPickedUp
        ? t("On Road")
        : isPicked
        ? t("Driver On Road")
        : t("Awaiting Driver");
      const driverStatusLabel = (() => {
        // No driver assigned yet
        if (!assignedDriverName) return t("Awaiting Driver");

        // Driver assigned but not yet picked up / on road
        if (!isPickedUp && !isPicked && !isDelivered) {
          return `${t("Driver")}: ${assignedDriverName}`;
        }

        // Picked up status (mobile) OR on-road status (dashboard)
        if (isPickedUp || isPicked) {
          return `${driverStatusBaseLabel}: ${assignedDriverName}`;
        }

        // Delivered
        return `${driverStatusBaseLabel}: ${assignedDriverName}`;
      })();

      const cardTone = isCancelled
        ? "bg-rose-200"
        : isDelivered
        ? "bg-emerald-200"
        : isPicked || isPickedUp
        ? "bg-sky-200"
        : isReady
        ? "bg-red-200"
        : isPrep
        ? "bg-amber-200"
        : "bg-slate-300";

      const statusBarLabel = isCancelled
        ? t("cancelled")
        : isDelivered
        ? t("Delivered")
        : isPicked || isPickedUp
        ? t("On the Road")
        : isReady
        ? t("Order ready!")
        : isPrep
        ? t("Preparing")
        : t("Awaiting Driver");

      const statusBarClass = isCancelled
        ? "bg-rose-500"
        : isDelivered
        ? "bg-emerald-500"
        : isPicked || isPickedUp
        ? "bg-sky-800"
        : isReady
        ? "bg-red-700"
        : isPrep
        ? "bg-amber-500"
        : "bg-slate-500";

      return (
        <div
          key={order.id}
          className="relative group flex flex-col items-stretch w-full h-full"
          style={{
            minWidth: 0,
            width: "100%",
            margin: 0
          }}
        >

          {/* CARD */}
<div
  className={`w-full rounded-lg ${cardTone} border border-slate-900/10 shadow-sm flex flex-col overflow-hidden`}
  style={{ minHeight: 150 }}
>
  {/* TOP BAR: Address + Timer + Print */}
  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/30 border-b border-slate-300/50">
    <div className="min-w-0 flex-1">
      {order.customer_address ? (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
          target="_blank"
          rel="noopener noreferrer"
          title={order.customer_address}
          className="block font-semibold text-[17px] leading-snug text-slate-900 hover:text-blue-700 truncate"
        >
          {order.customer_address}
        </a>
      ) : (
        <div className="font-semibold text-[17px] leading-snug text-slate-500 truncate">
          {t("No address available")}
        </div>
      )}
      {hasUnmatchedYsItems && (
        <a
          href="/settings/integrations#yemeksepeti-mapping"
          className="mt-1 inline-flex items-center justify-center px-2.5 py-1 rounded-md bg-amber-500 text-white text-xs font-bold"
        >
          {t("Needs Yemeksepeti mapping")}
        </a>
      )}
    </div>
    {order?.items?.length > 0 && (
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-mono font-semibold text-sm ${statusVisual.timer}`}
        >
          {getWaitingTimer(order)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePacketPrint(order.id);
          }}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition text-base"
          title={t("Print Receipt")}
          type="button"
        >
          🖨️
        </button>
      </div>
    )}
  </div>

  {/* MIDDLE ROW: Order Source + Customer + Phone + Status Badge */}
  <div className="flex items-center gap-2 px-4 py-2 bg-white/20 border-b border-slate-300/50">
    {order.order_type && (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700">
        {order.order_type === "phone" ? t("Phone Order") : null}
        {order.order_type === "packet" ? (onlineSourceLabel || t("Packet")) : null}
        {order.order_type === "table" ? t("Table") : null}
        {order.order_type === "takeaway" ? t("Takeaway") : null}
      </span>
    )}
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700">
      {order.customer_name || t("Customer")}
    </span>
    {order.customer_phone && (
      <a
        href={`tel:${order.customer_phone}`}
        className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-white/80 border border-slate-300 text-slate-700 hover:bg-white transition"
        title={t("Click to call")}
        style={{ textDecoration: "none" }}
      >
        📞 {order.customer_phone}
      </a>
    )}
    {readyAtLabel && (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none bg-amber-100 text-amber-800 border border-amber-300">
        {t("Ready at")} {readyAtLabel}
      </span>
    )}
    {kitchenBadgeLabel && (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[15px] font-semibold leading-none ${kitchenBadgeClass}`}
      >
        {kitchenBadgeLabel}
      </span>
    )}
  </div>

  {/* DRIVER ROW: Avatar + Name + Auto Confirmed + Cancel */}
  <div className="flex items-center gap-3 px-4 py-2.5 bg-white/15 border-b border-slate-300/50">
    <div className="h-9 w-9 rounded-full bg-white border border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
      {driverAvatarUrl ? (
        <img
          src={driverAvatarUrl}
          alt={assignedDriverName || t("Driver")}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-xs font-bold text-slate-700">{driverInitials}</span>
      )}
    </div>
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
          prev.map((o) => (o.id === order.id ? { ...o, driver_id: driverId } : o))
        );
      }}
      className="appearance-none bg-white border border-slate-300 rounded-md text-slate-900 text-sm font-semibold px-2.5 py-1 pr-6 focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
    >
      <option value="">{t("Unassigned")}</option>
      {drivers.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
    {shouldShowManualConfirm && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          confirmOnlineOrder(order);
        }}
        disabled={Boolean(confirmingOnlineOrders?.[order.id])}
        className="inline-flex items-center h-8 rounded-md bg-indigo-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-indigo-700 transition disabled:opacity-50 disabled:hover:bg-indigo-600"
      >
        {confirmingOnlineOrders?.[order.id] ? t("Confirming...") : t("Confirm")}
      </button>
    )}
    {autoConfirmEnabledForOrder && order.status === "confirmed" ? (
      <>
        <span className="inline-flex items-center h-8 rounded-md bg-emerald-100 text-emerald-800 px-3 text-[13px] font-semibold leading-none border border-emerald-300">
          ✓ {t("Auto Confirmed")}
        </span>
        <button
          type="button"
          onClick={() => openCancelModalForOrder(order)}
          className="inline-flex items-center h-8 rounded-md bg-rose-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-rose-700 transition"
        >
          {t("Cancel")}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => openPaymentModalForOrder(order)}
	            className="inline-flex items-center h-8 px-3 rounded-md bg-white/80 border border-slate-300 text-base font-semibold text-slate-700 hover:text-emerald-700 hover:border-emerald-400 transition"
            title={t("Edit payment")}
            type="button"
          >
            {order.payment_method ? order.payment_method : "—"}
            {!isOnlinePayment && (
              <span className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center text-slate-400" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </span>
            )}
          </button>
          <span className="inline-flex items-center h-8 px-3 rounded-md bg-white/60 border border-slate-300 text-base font-extrabold text-emerald-700">
            {formatCurrency(discountedTotal)}
          </span>
        </div>
      </>
    ) : (
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => openCancelModalForOrder(order)}
          className="inline-flex items-center h-8 rounded-md bg-rose-600 text-white px-3 text-[13px] font-semibold leading-none hover:bg-rose-700 transition"
        >
          {t("Cancel")}
        </button>
        <button
          onClick={() => openPaymentModalForOrder(order)}
	          className="inline-flex items-center h-8 px-3 rounded-md bg-white/80 border border-slate-300 text-base font-semibold text-slate-700 hover:text-emerald-700 hover:border-emerald-400 transition"
          title={t("Edit payment")}
          type="button"
        >
          {order.payment_method ? order.payment_method : "—"}
          {!isOnlinePayment && (
            <span className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center text-slate-400" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
              </svg>
            </span>
          )}
        </button>
        <span className="inline-flex items-center h-8 px-3 rounded-md bg-white/60 border border-slate-300 text-base font-extrabold text-emerald-700">
          {formatCurrency(discountedTotal)}
        </span>
      </div>
    )}
  </div>

	  {/* BOTTOM ROW: Order Items (left) + On Road (right) */}
	  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white/10">
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
      className="min-w-0"
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none hover:text-slate-900">
        {t("Order Items")} <span className="text-slate-500">#{externalOrderRef || order.id}</span>
      </summary>
      <div className="mt-2 rounded-md border border-white/70 bg-white/50 px-2.5 py-2">
	        <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 text-sm text-slate-800">
	          {(order.items ?? []).map((item, idx) => {
	            const name =
	              item.product_name ||
	              item.external_product_name ||
	              item.order_item_name ||
	              t("Unnamed");
	            const qty = Number(item.quantity || 1);
	            const unit = Number(item.price || 0);
	            const lineTotal = unit * qty;
              const itemNote = String(
                item.note || item.notes || item.item_note || item.special_instructions || ""
              ).trim();
              const extrasList = (() => {
                const raw = item.extras;
                if (!raw) return [];
                if (Array.isArray(raw)) return raw;
                if (typeof raw === "string") {
                  try {
                    const parsed = JSON.parse(raw);
                    return Array.isArray(parsed) ? parsed : [];
                  } catch {
                    return [];
                  }
                }
                return [];
              })();
              const extrasLabel = extrasList
                .map((ex) => {
                  const exName = ex?.name || ex?.extra_name || ex?.title || "";
                  if (!exName) return "";
                  const q = Number(ex?.quantity || ex?.qty || 1);
                  return q > 1 ? `${exName} ×${q}` : exName;
                })
                .filter(Boolean)
                .join(", ");
	            return (
	              <React.Fragment key={item.unique_id || item.id || idx}>
	              <div className="min-w-0">
	                <span className="font-mono font-bold text-slate-700">{qty}×</span>{" "}
	                <span className="font-semibold truncate inline-block align-bottom max-w-[30ch]">
	                  {name}
	                </span>
	              </div>
	              <div className="font-mono font-semibold text-slate-700 whitespace-nowrap text-right">
	                {formatCurrency(lineTotal)}
	              </div>
                {(extrasLabel || itemNote) && (
                  <div className="col-span-2 pl-5 text-xs text-slate-700">
                    {extrasLabel && (
                      <div className="text-emerald-700 font-semibold">
                        + {extrasLabel}
                      </div>
                    )}
                    {itemNote && (
                      <div className="italic text-slate-700">
                        📝 {itemNote}
                      </div>
                    )}
                  </div>
                )}
	              </React.Fragment>
	            );
	          })}
	        </div>
	        {displayOrderNote && (
	          <div className="mt-1 text-xs text-slate-700 italic">
	            📝 {displayOrderNote}
	          </div>
	        )}
	      </div>
	    </details>

	    <div className="flex items-center gap-2 flex-shrink-0">
	      {!normalizeDriverStatus(order.driver_status) && (
	          <button
	            type="button"
	            disabled={driverButtonDisabled(order)}
	            className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-base font-bold text-white transition disabled:opacity-50 ${
	              kitchenStatus === "new"
                ? "bg-blue-600 hover:bg-blue-700"
                : kitchenStatus === "preparing"
                ? "bg-amber-600 hover:bg-amber-700"
                : kitchenStatus === "ready" || kitchenStatus === "delivered"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-teal-600 hover:bg-teal-700"
            }`}
            onClick={async () => {
              if (driverButtonDisabled(order)) return;
              const nextStatus = isYemeksepetiPickupOrder(order) ? "delivered" : "on_road";
              setOrders((prev) =>
                prev.map((o) => (o.id === order.id ? { ...o, driver_status: nextStatus } : o))
              );
              await secureFetch(`/orders/${order.id}/driver-status`, {
                method: "PATCH",
                body: JSON.stringify({ driver_status: nextStatus }),
              });
              if (
                nextStatus === "delivered" &&
                shouldAutoClosePacketOnDelivered(order)
              ) {
                try {
                  await closeOrderInstantly(order);
                } catch (err) {
                  console.error("❌ Failed to auto-close delivered order:", err);
                  emitToast("error", t("Failed to close order"));
                  if (!propOrders) await fetchOrders();
                }
              }
            }}
	          >
	            {isYemeksepetiPickupOrder(order) ? t("Picked up") : t("On Road")}
	          </button>
	      )}
	        {normalizeDriverStatus(order.driver_status) === "on_road" && (
	          <button
	            type="button"
	            disabled={driverButtonDisabled(order)}
            className="inline-flex items-center justify-center rounded-md bg-sky-800 hover:bg-sky-900 px-3 py-1.5 text-base font-bold text-white transition disabled:opacity-50"
            onClick={async () => {
              if (driverButtonDisabled(order)) return;
              setUpdating((prev) => ({ ...prev, [order.id]: true }));
              setOrders((prev) =>
                prev.map((o) => (o.id === order.id ? { ...o, driver_status: "delivered" } : o))
              );
              try {
                await secureFetch(`/orders/${order.id}/driver-status`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ driver_status: "delivered" }),
                });
	                if (shouldAutoClosePacketOnDelivered(order)) {
	                  try {
	                    await closeOrderInstantly(order);
	                  } catch (err) {
	                    console.error("❌ Failed to auto-close delivered order:", err);
	                    emitToast("error", t("Failed to close order"));
	                    if (!propOrders) await fetchOrders();
	                  }
	                }
              } catch (err) {
                console.error("❌ Failed to mark delivered:", err);
                if (!propOrders) await fetchOrders();
              } finally {
                setUpdating((prev) => ({ ...prev, [order.id]: false }));
              }
            }}
	          >
	            {isYemeksepetiPickupOrder(order) ? t("Completed") : t("Delivered")}
	          </button>
	        )}
	        {normalizeDriverStatus(order.driver_status) === "delivered" && (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-base font-bold text-white transition"
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
            {t("Close")}
          </button>
	        )}
	    </div>
	  </div>
</div>

{/* Ultra-compact order card layout (no collapses) - HIDDEN */}
  <div className="hidden flex-col gap-2">
    {/* Address row */}
    <div className="min-w-0 flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        {order.customer_address ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={order.customer_address}
            className="block w-full rounded-2xl bg-white/70 border border-slate-200 px-3 py-2 text-sm sm:text-base font-extrabold text-slate-900 leading-tight break-words line-clamp-2 dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
          >
            {order.customer_address}
          </a>
        ) : (
          <div className="w-full rounded-2xl bg-white/70 border border-slate-200 px-3 py-2 text-sm sm:text-base font-extrabold text-slate-900 leading-tight dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
            {t("No address available")}
          </div>
        )}
        {hasUnmatchedYsItems && (
          <a
            href="/settings/integrations#yemeksepeti-mapping"
            className="mt-1 inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-amber-500 text-white text-[11px] font-bold shadow border border-amber-200"
          >
            {t("Needs Yemeksepeti mapping")}
          </a>
        )}
      </div>
      {order?.items?.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0 scale-[0.95] origin-top-right">
          <span
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full font-mono font-semibold text-sm sm:text-base shadow-sm ${statusVisual.timer}`}
          >
            {getWaitingTimer(order)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePacketPrint(order.id);
            }}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 transition text-sm sm:text-base dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/40"
            title={t("Print Receipt")}
            type="button"
          >
            🖨️
          </button>
        </div>
      )}
    </div>

    {/* Customer/Phone row + timer right */}
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {order.order_type && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
	            {order.order_type === "phone" ? t("Phone Order") : null}
	            {order.order_type === "packet" ? (onlineSourceLabel || t("Packet")) : null}
	            {order.order_type === "table" ? t("Table") : null}
	            {order.order_type === "takeaway" ? t("Takeaway") : null}
	          </span>
	        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100">
          👤 {order.customer_name || t("Customer")}
        </span>
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm hover:bg-slate-50 transition dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/40"
            title={t("Click to call")}
            style={{ textDecoration: "none" }}
          >
            📞 {order.customer_phone}
          </a>
        )}
        {readyAtLabel && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold shadow-sm bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/25 dark:text-amber-200 dark:border-amber-500/30">
            ⏳ {t("Ready at")} {readyAtLabel}
          </span>
        )}
        {kitchenBadgeLabel && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold shadow-sm ${kitchenBadgeClass}`}
          >
            {kitchenBadgeLabel}
          </span>
        )}
      </div>
    </div>

    {/* Driver / Order Items / Amount row */}
    <div className="grid items-start gap-2 sm:grid-cols-[minmax(200px,0.9fr)_minmax(320px,1.6fr)_minmax(170px,0.7fr)]">
      {/* Driver */}
      <div className="min-w-0 flex items-center gap-2">
        <div className="h-10 w-10 rounded-full bg-white border border-slate-300 shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 dark:bg-slate-950/50 dark:border-slate-800">
          {driverAvatarUrl ? (
            <img
              src={driverAvatarUrl}
              alt={assignedDriverName || t("Driver")}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-100">{driverInitials}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[9px] font-semibold tracking-[0.24em] text-slate-400 uppercase leading-none">
            {t("Driver")}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-nowrap">
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
                  prev.map((o) => (o.id === order.id ? { ...o, driver_id: driverId } : o))
                );
              }}
              className="appearance-none bg-white border border-slate-200 rounded-xl text-slate-900 text-[12px] font-semibold px-2 py-1 pr-6 shadow-sm focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all whitespace-nowrap max-w-[200px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
            >
              <option value="">{t("Unassigned")}</option>
	              {drivers.map((d) => (
	                <option key={d.id} value={d.id}>
	                  {d.name}
	                </option>
	              ))}
	            </select>
              {shouldShowManualConfirm && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmOnlineOrder(order);
                  }}
                  disabled={Boolean(confirmingOnlineOrders?.[order.id])}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 text-white px-3 py-1 text-[12px] font-semibold shadow-sm hover:bg-indigo-700 transition whitespace-nowrap disabled:opacity-50 disabled:hover:bg-indigo-600"
                >
                  {confirmingOnlineOrders?.[order.id] ? t("Confirming...") : t("Confirm")}
                </button>
              )}
	            {autoConfirmEnabledForOrder && order.status === "confirmed" && (
	              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-[12px] font-semibold border border-emerald-200 shadow-sm whitespace-nowrap dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-500/30">
	                ✓ {t("Auto Confirmed")}
	              </span>
	            )}
            <button
              type="button"
              onClick={() => openCancelModalForOrder(order)}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 text-white px-3 py-1 text-[12px] font-semibold shadow-sm hover:bg-rose-700 transition whitespace-nowrap"
            >
              ✕ {t("Cancel")}
            </button>
          </div>
        </div>
      </div>

{/* Order items + status */}
      <div className="min-w-0 flex flex-col gap-2">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,max-content))] items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
          {order.status === "draft" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700">
              {t("draft")}
            </span>
          )}
          {order.status === "cancelled" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-rose-100 text-rose-700 border border-rose-200 shadow-sm dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-500/30">
              {t("cancelled")}
            </span>
          )}
          {order.status === "closed" && (
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-sm dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700">
              {t("closed")}
            </span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="flex flex-col items-end gap-1">
        <div className="mt-0.5 flex items-center gap-2">
          <button
            onClick={() => openPaymentModalForOrder(order)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-base sm:text-xl font-extrabold text-slate-700 hover:text-emerald-700 hover:border-emerald-300 shadow-sm transition dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:hover:text-emerald-200 dark:hover:border-emerald-500/40"
            title={t("Edit payment")}
            type="button"
          >
            {order.payment_method ? order.payment_method : "—"}
            {!isOnlinePayment && (
              <span className="text-sm sm:text-base opacity-80" aria-hidden="true">
                ✎
              </span>
            )}
          </button>
          <div className="text-base sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-200">
            {formatCurrency(discountedTotal)}
          </div>
        </div>
      </div>
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
