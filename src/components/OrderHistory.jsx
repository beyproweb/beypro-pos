import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
const API_URL = import.meta.env.VITE_API_URL || "";
import secureFetch from "../utils/secureFetch";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { useCurrency } from "../context/CurrencyContext";

const FALLBACK_PAYMENT_OPTIONS = [
  "Cash",
  "Credit Card",
  "Sodexo",
  "Multinet",
];

export default function OrderHistory({
  fromDate, toDate, paymentFilter,
  setFromDate, setToDate, setPaymentFilter,
}) {
  const paymentMethods = usePaymentMethods();
  const paymentFilterOptions = useMemo(
    () =>
      paymentMethods.length
        ? paymentMethods.map((method) => method.label)
        : FALLBACK_PAYMENT_OPTIONS,
    [paymentMethods]
  );
  const [closedOrders, setClosedOrders] = useState([]);
  const [showCancellationsOnly, setShowCancellationsOnly] = useState(false);
  const [editingPaymentOrderId, setEditingPaymentOrderId] = useState(null);
  const [paymentMethodDraft, setPaymentMethodDraft] = useState({});
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();

  function calculateGrandTotal(items = []) {
  let total = 0;
  for (const item of items) {
    const qty = parseInt(item.quantity || item.qty || 1);
    const itemTotal = parseFloat(item.price) * qty;
    const extrasTotal = (item.extras || []).reduce((sum, ex) => {
      const extraQty = parseInt(ex.quantity || ex.qty || 1);
      return sum + (qty * extraQty * parseFloat(ex.price || 0));
    }, 0);
    total += itemTotal + extrasTotal;
  }
  return total;
}

	  // Fetch closed orders
	const fetchClosedOrders = async () => {
	  if (!fromDate || !toDate) {
	    setClosedOrders([]);
	    return;
	  }

	  try {
	    const query = new URLSearchParams({ from: fromDate, to: toDate });
	    const data = await secureFetch(`/reports/history?${query.toString()}`);


 const enriched = await Promise.all(
  data.map(async (order) => {
    const itemsRaw = await secureFetch(`/orders/${order.id}/items`);
    const items = itemsRaw.map(item => ({
      ...item,
      discount_type: item.discount_type || null,
      discount_value: item.discount_value ? parseFloat(item.discount_value) : 0,
      name: item.product_name || item.order_item_name || item.external_product_name || "Unnamed"
    }));

    const paymentsRaw = await secureFetch(`/orders/${order.id}/payments`);
    const payments = Array.isArray(paymentsRaw)
      ? paymentsRaw.map((p) => ({
          ...p,
          amount: Number(p.amount || 0),
        }))
      : [];

    let receiptMethods = [];
    if (order.receipt_id) {
      const methodsRes = await secureFetch(`/reports/receipt-methods/${order.receipt_id}`);
      receiptMethods = Array.isArray(methodsRes) ? methodsRes : [];
    }

    return { ...order, items, payments, receiptMethods };
  })
);


    const nonEmptyOrders = enriched.filter(order => Array.isArray(order.items) && order.items.length > 0);

    setClosedOrders(nonEmptyOrders);
  } catch (err) {
    console.error("❌ Fetch closed orders failed:", err);
    toast.error("Failed to load order history");
  }
};

const filteredOrders = useMemo(() => {
  if (showCancellationsOnly) {
    return closedOrders.filter((order) => order.status === "cancelled");
  }
  return closedOrders;
}, [closedOrders, showCancellationsOnly]);

const groupedClosedOrders = useMemo(() => {
  return filteredOrders.reduce((acc, order) => {
    const dateKey = order.created_at
      ? new Date(order.created_at).toLocaleDateString()
      : "Unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(order);
    return acc;
  }, {});
}, [filteredOrders]);

function autoFillSplitAmounts(draft, idxChanged, value, order, isAmountChange) {
  let arr = draft || [];
  arr = arr.map(obj => ({ ...obj })); // Deep clone

  if (isAmountChange && arr.length > 1) {
    arr[idxChanged].amount = value; // Update the changed amount

    // Update the last split's amount to always be remaining
    const grandTotal = Number(calculateGrandTotal(order.items));
    const sumExceptLast = arr.slice(0, -1).reduce((s, pm, i) => s + (i === idxChanged ? Number(value) : Number(pm.amount) || 0), 0);
    arr[arr.length - 1].amount = Math.max(0, (grandTotal - sumExceptLast).toFixed(2));
  } else {
    // Not an amount change, just method change or single payment
    arr[idxChanged] = { ...arr[idxChanged], ...value };
  }
  return arr;
}

  // Fetch when filters change
  useEffect(() => {
    fetchClosedOrders();
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  const historyEmptyMessage = showCancellationsOnly
    ? t("No cancelled orders found for the selected range.")
    : t("No order history found for the selected range.");

  return (
    <div className="px-3 md:px-8 py-6">
      {/* Header and filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-7">
        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text mb-0 tracking-tight drop-shadow">
          📘 {t('Order History')}
        </h2>
        <div className="flex gap-2 flex-wrap">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition" />
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition" />
          <select
            onChange={e => setPaymentFilter(e.target.value)}
            className="border-2 border-blue-100 rounded-xl px-3 py-1 text-gray-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400 transition"
            value={paymentFilter}
          >
            <option value="All">{t('All Payments')}</option>
            {paymentFilterOptions.map((p) => (
              <option key={p} value={p}>
                {t(p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowCancellationsOnly((prev) => !prev)}
            className={`rounded-xl border-2 px-3 py-1 text-sm font-semibold transition ${
              showCancellationsOnly
                ? "border-rose-500 bg-rose-600 text-white hover:bg-rose-700"
                : "border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            {showCancellationsOnly ? t("Showing Cancellations") : t("Show Cancellations")}
          </button>
        </div>
      </div>

      {/* History Grid */}
      {Object.entries(groupedClosedOrders).length === 0 ? (
        <div className="flex flex-col items-center mt-20">
          <span className="text-6xl mb-2">🗂️</span>
          <span className="text-xl text-gray-400 font-semibold">{historyEmptyMessage}</span>
        </div>
      ) : (
        Object.entries(groupedClosedOrders).map(([date, orders]) => (
          <div key={date} className="mb-14">
            {/* Date Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <span className="bg-gradient-to-tr from-blue-200 via-fuchsia-200 to-indigo-100 text-blue-900 px-4 py-1 rounded-2xl shadow-inner font-mono">
                  📅 {date}
                </span>
              </h3>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-blue-700 font-semibold bg-blue-50 hover:bg-blue-200 transition"
              >
                🖨️ {t('Print All')}
              </button>
            </div>
            {/* Order Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
              {orders
.filter((order) => {
    if (paymentFilter === "All") return true;
    const target = (paymentFilter || "").toLowerCase();
    const normalize = (val) => (val || "").toLowerCase();

    if (Array.isArray(order.receiptMethods) && order.receiptMethods.length > 0) {
      return order.receiptMethods.some(
        (rm) => normalize(rm.payment_method) === target
      );
    }
    if (Array.isArray(order.payments) && order.payments.length > 0) {
      return order.payments.some(
        (pm) => normalize(pm.payment_method) === target
      );
    }

    return normalize(order.payment_method) === target;
  })
  .map((order) => {
    const normalizedStatus = (order.status || "").toLowerCase();
    const isOrderCancelled = ["cancelled", "canceled"].includes(normalizedStatus);
    const paymentEditingAllowed = !isOrderCancelled;
    const showPaymentEditor = paymentEditingAllowed && editingPaymentOrderId === order.id;
    return (
    <div
      key={order.id}
      className="rounded-3xl bg-gradient-to-br from-white/90 via-blue-50 to-indigo-50 border border-white/60 shadow-xl p-6 flex flex-col gap-4 transition hover:scale-[1.02] hover:shadow-2xl"
    >
      {/* --- Order Header --- */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-bold text-xl text-blue-800 leading-tight">
            {order.order_type === "table" && order.table_number ? (
              <>🍽️ {t("Table")} {order.table_number}</>
            ) : order.order_type === "packet" ? (
              <>🛵 {t("Packet Order")}</>
            ) : order.order_type === "phone" ? (
              <>📞 {t("Phone Order")}</>
            ) : (
              <># {order.id}</>
            )}
          </span>
          <span className="text-xs text-gray-500 mt-0.5">
            {order.created_at
              ? `${new Date(order.created_at).toLocaleDateString()} • ${new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`
              : ""}
          </span>
          {["phone", "packet"].includes(order.order_type) && (
            <>
              {order.customer_name && (
                <span className="text-xs text-gray-700">{order.customer_name}</span>
              )}
              {order.customer_address && (
                <span className="text-xs text-gray-500">{order.customer_address}</span>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-2 py-1 rounded-full text-xs font-bold
            ${order.status === "closed" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-800"}
          `}>
            {t(order.status)}
          </span>
          {order.debt_paid_at && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
              {t("Debt Paid")}
            </span>
          )}
      </div>
    </div>

    {order.status === "cancelled" && (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700 transition">
        <p className="font-semibold text-rose-800">{t("Cancellation Reason")}:</p>
        <p className="text-xs text-rose-700">
          {order.cancellation_reason || t("No reason provided")}
        </p>
        {order.cancelled_at && (
          <p className="mt-1 text-xs text-rose-500">
            {t("Cancelled at")}:{" "}
            {new Date(order.cancelled_at).toLocaleString([], {
              hour: "2-digit",
              minute: "2-digit",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </p>
        )}
      </div>
    )}

    <hr className="my-2" />

      {/* --- Items List --- */}
      <div>
        {order.items && order.items.length > 0 ? (
          <ul className="text-base font-medium space-y-3">
            {order.items.map((item, idx) => (
              <li key={idx} className="flex flex-col gap-0.5">
                <div className="flex flex-row items-end justify-between w-full">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-900">{item.name}</span>
                      {item.note && (
                        <span className="ml-1 text-yellow-700 text-xs font-normal">📝 {item.note}</span>
                      )}
                    </div>
                    <div className="flex gap-2 text-sm text-gray-700 mt-0.5">
                      <span className="bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-mono">
                        {t("Unit")}:{" "}
                        {formatCurrency(parseFloat(item.price) || 0)}
                      </span>
                      <span className="bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 font-mono">
                        {t("Qty")}: {item.quantity}
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-extrabold text-indigo-800 text-right min-w-[90px] pl-4">
                    {formatCurrency(
                      (parseFloat(item.price) || 0) * (item.quantity || 1)
                    )}
                  </span>
                </div>
                {/* --- EXTRAS (align under main price, full-width indent) --- */}
                {item.extras && Array.isArray(item.extras) && item.extras.length > 0 && (
                  <div className="flex flex-col mt-1 pl-12">
                    {item.extras.map((ex, exIdx) => {
                      const itemQty = parseInt(item.quantity || item.qty || 1);
                      const extraQty = parseInt(ex.quantity || ex.qty || 1);
                      const unitPrice = parseFloat(ex.price || 0);
                      const lineQty = itemQty * extraQty;
                      const lineTotal = (unitPrice * lineQty).toFixed(2);
                      return (
                        <div key={exIdx} className="flex flex-row items-center justify-between">
                          <div className="flex items-center gap-2 text-blue-700 text-xs">
                            <span>➕ {ex.name}{extraQty > 1 && <span> ({extraQty}x)</span>}</span>
                            <span className="text-gray-500">
                              @ {formatCurrency(unitPrice || 0)}
                            </span>
                          </div>
                          <span className="ml-2 text-base text-blue-900 font-semibold min-w-[64px] text-right">
                            {formatCurrency(parseFloat(lineTotal) || 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-gray-400 text-xs">{t("No items")}</span>
        )}
      </div>

      {order.payments && order.payments.length > 0 && (
        <div className="mt-3 rounded-2xl bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-inner border border-slate-100 dark:bg-zinc-900/60 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
            {t("Payments")}
          </p>
          <div className="space-y-1">
            {order.payments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between">
                <span>
                  {new Date(payment.created_at).toLocaleString([], {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {payment.payment_method || t("Payment")}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(Number(payment.amount || 0))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Payment/Total Block --- */}
      <div className="flex items-center justify-between mt-4 border-t border-indigo-100 pt-3">
        <span className="font-extrabold text-xl text-indigo-900">{t("Total")}</span>
        <span className="font-extrabold text-2xl text-indigo-900 tracking-wide">
          {formatCurrency(calculateGrandTotal(order.items))}
        </span>
      </div>

      {/* --- Payment Methods - EDITABLE (Split or Single) --- */}
<div className="flex flex-wrap gap-2 items-center mt-2">
  {order.receiptMethods?.length > 0 ? (
    showPaymentEditor ? (
      <>
        {(paymentMethodDraft[order.id] || order.receiptMethods).map((m, idx, arr) => (
          <span key={idx} className="inline-flex items-center gap-1 px-3 py-2 bg-white rounded-xl border-2 border-blue-200 shadow text-lg font-bold mr-2">
            <select
              value={paymentMethodDraft[order.id]?.[idx]?.payment_method ?? m.payment_method}
              onChange={e => {
                setPaymentMethodDraft(pm => ({
                  ...pm,
                  [order.id]: [
                    ...(pm[order.id] || order.receiptMethods).map((old, i) =>
                      i === idx ? { ...old, payment_method: e.target.value } : old
                    )
                  ]
                }));
              }}
              className="border rounded px-2 py-1 text-base mr-2"
            >
                {(paymentMethods.length
                  ? paymentMethods.map((method) => method.label)
                  : FALLBACK_PAYMENT_OPTIONS
                ).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
            </select>
            <input
  type="number"
  min={0}
  step={0.01}
  value={paymentMethodDraft[order.id]?.[idx]?.amount ?? m.amount}
  onChange={e => {
    const val = e.target.value;
    setPaymentMethodDraft(pm => ({
      ...pm,
      [order.id]: autoFillSplitAmounts(
        pm[order.id] || order.receiptMethods,
        idx,
        val,
        order,
        true // <- amount change
      )
    }));
  }}
  className="border rounded px-2 py-1 text-base w-20 mr-2"
/>

            <span className="text-indigo-800 font-extrabold ml-1">
              {formatCurrency(
                parseFloat(
                  paymentMethodDraft[order.id]?.[idx]?.amount ?? m.amount
                ) || 0
              )}
            </span>
            {((paymentMethodDraft[order.id] || order.receiptMethods).length > 1) && (
              <button
                className="ml-1 px-2 py-1 bg-red-200 text-red-800 rounded"
                onClick={() =>
                  setPaymentMethodDraft(pm => ({
                    ...pm,
                    [order.id]: (pm[order.id] || order.receiptMethods).filter((_, i) => i !== idx)
                  }))
                }
                title="Remove split"
              >✖️</button>
            )}
          </span>
        ))}
        <button
          className="px-2 py-1 bg-green-100 text-green-800 rounded text-base font-bold mr-2"
          onClick={() => {
                const draftArr = paymentMethodDraft[order.id] || order.receiptMethods;
                setPaymentMethodDraft(pm => ({
                  ...pm,
                  [order.id]: [
                    ...draftArr,
                    {
                      payment_method:
                        (paymentMethods.length
                          ? paymentMethods
                              .map((method) => method.label)
                              .find(
                                (opt) =>
                                  !draftArr
                                    .map((x) => x.payment_method)
                                    .includes(opt)
                              )
                          : FALLBACK_PAYMENT_OPTIONS.find(
                              (opt) =>
                                !draftArr
                                  .map((x) => x.payment_method)
                                  .includes(opt)
                            )) || (paymentMethods[0]?.label || FALLBACK_PAYMENT_OPTIONS[0]),
                      amount: 0,
                    }
                  ]
                }));
          }}
        >➕ Add Split</button>
        <button
          className="ml-2 px-3 py-2 bg-blue-500 text-white rounded text-base"
          onClick={async () => {
            let arr = paymentMethodDraft[order.id] || order.receiptMethods;
            // --- AUTO-MERGE: If multiple splits with SAME payment_method, sum to one split ---
            const uniqueMethods = [...new Set(arr.map(pm => pm.payment_method))];
            if (uniqueMethods.length === 1 && arr.length > 1) {
              arr = [{
                payment_method: uniqueMethods[0],
                amount: Number(calculateGrandTotal(order.items)).toFixed(2)
              }];
            }
            // --- If only one split remains, set to grand total ---
            if (arr.length === 1) {
              arr = [{
                ...arr[0],
                amount: Number(calculateGrandTotal(order.items)).toFixed(2)
              }];
            }
            // --- If multiple splits, sum-check and auto-fix last if needed ---
            let totalEntered = arr.reduce((sum, pm) => sum + Number(pm.amount || 0), 0);
            const grandTotal = Number(calculateGrandTotal(order.items));
            if (arr.length > 1 && Math.abs(totalEntered - grandTotal) > 0.01) {
              arr[arr.length - 1] = {
                ...arr[arr.length - 1],
                amount: (grandTotal - arr.slice(0, -1).reduce((s, pm) => s + Number(pm.amount || 0), 0)).toFixed(2)
              };
            }
            // --- Build backend object ---
            const methodsObj = {};
            arr.forEach(pm => {
              if (pm.payment_method && pm.amount > 0) {
                methodsObj[pm.payment_method] = Number(pm.amount);
              }
            });
            await secureFetch(`/orders/receipt-methods`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                order_id: order.id,
                receipt_id: order.receipt_id,
                methods: methodsObj
              }),
            });
            toast.success("Payment methods updated!");
            setEditingPaymentOrderId(null);
            setTimeout(fetchClosedOrders, 350);
          }}
        >💾</button>
        <button
          className="ml-1 px-2 py-2 bg-gray-200 rounded text-base"
          onClick={() => setEditingPaymentOrderId(null)}
        >✖️</button>
      </>
    ) : (
      <>
        <span className="flex flex-wrap gap-2">
          {order.receiptMethods
            .filter((pm) => parseFloat(pm.amount) > 0)
            .map((m, idx, arr) => (
              <span
                key={idx}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border-2 border-blue-300 bg-white/80 shadow text-lg font-extrabold text-blue-700"
              >
                {m.payment_method}
                <span className="ml-2 font-extrabold text-indigo-900 text-lg">
                  {formatCurrency(parseFloat(m.amount) || 0)}
                </span>
                {idx !== arr.length - 1 && (
                  <span className="mx-1 font-bold text-fuchsia-500">+</span>
                )}
              </span>
            ))}
        </span>
        <button
          className={`ml-2 px-2 py-1 rounded text-base font-bold ${
            paymentEditingAllowed
              ? "bg-fuchsia-500 text-white"
              : "bg-slate-200 text-slate-500 cursor-not-allowed"
          }`}
          onClick={() => {
            if (!paymentEditingAllowed) return;
            setEditingPaymentOrderId(order.id);
            setPaymentMethodDraft((pm) => ({
              ...pm,
              [order.id]: order.receiptMethods.map((obj) => ({ ...obj })),
            }));
          }}
          disabled={!paymentEditingAllowed}
        >
          {t("Edit Splits")} ✏️
        </button>
      </>
    )
  ) : (
    showPaymentEditor ? (
      Array.isArray(paymentMethodDraft[order.id]) ? (
        <>
          {paymentMethodDraft[order.id].map((m, idx, arr) => (
            <span key={idx} className="inline-flex items-center gap-1 px-3 py-2 bg-white rounded-xl border-2 border-blue-200 shadow text-lg font-bold mr-2">
              <select
                value={m.payment_method}
                onChange={e => {
                  setPaymentMethodDraft(pm => ({
                    ...pm,
                    [order.id]: pm[order.id].map((old, i) =>
                      i === idx ? { ...old, payment_method: e.target.value } : old
                    )
                  }));
                }}
                className="border rounded px-2 py-1 text-base mr-2"
              >
                {(paymentMethods.length
                  ? paymentMethods.map((method) => method.label)
                  : FALLBACK_PAYMENT_OPTIONS
                ).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={0.01}
                value={m.amount}
                onChange={e => {
                  setPaymentMethodDraft(pm => ({
                    ...pm,
                    [order.id]: pm[order.id].map((old, i) =>
                      i === idx ? { ...old, amount: e.target.value } : old
                    )
                  }));
                }}
                className="border rounded px-2 py-1 text-base w-20 mr-2"
              />
              <span className="text-indigo-800 font-extrabold ml-1">
                {formatCurrency(parseFloat(m.amount) || 0)}
              </span>
              {arr.length > 1 && (
                <button
                  className="ml-1 px-2 py-1 bg-red-200 text-red-800 rounded"
                  onClick={() =>
                    setPaymentMethodDraft(pm => ({
                      ...pm,
                      [order.id]: pm[order.id].filter((_, i) => i !== idx)
                    }))
                  }
                  title="Remove split"
                >✖️</button>
              )}
            </span>
          ))}
          <button
            className="px-2 py-1 bg-green-100 text-green-800 rounded text-base font-bold mr-2"
            onClick={() => {
              const options =
                paymentMethods.length > 0
                  ? paymentMethods.map((method) => method.label)
                  : FALLBACK_PAYMENT_OPTIONS;
              setPaymentMethodDraft((pm) => ({
                ...pm,
                [order.id]: [
                  ...pm[order.id],
                  {
                    payment_method:
                      options.find(
                        (opt) =>
                          !pm[order.id].map((x) => x.payment_method).includes(opt)
                      ) || options[0],
                    amount: 0,
                  },
                ],
              }));
            }}
          >
            ➕ Add Split
          </button>
          <button
            className="ml-2 px-3 py-2 bg-blue-500 text-white rounded text-base"
            onClick={async () => {
              let arr = paymentMethodDraft[order.id];
              const uniqueMethods = [...new Set(arr.map(pm => pm.payment_method))];
              if (uniqueMethods.length === 1 && arr.length > 1) {
                arr = [{
                  payment_method: uniqueMethods[0],
                  amount: Number(calculateGrandTotal(order.items)).toFixed(2)
                }];
              }
              if (arr.length === 1) {
                arr = [{
                  ...arr[0],
                  amount: Number(calculateGrandTotal(order.items)).toFixed(2)
                }];
              }
              let totalEntered = arr.reduce((sum, pm) => sum + Number(pm.amount || 0), 0);
              const grandTotal = Number(calculateGrandTotal(order.items));
              if (arr.length > 1 && Math.abs(totalEntered - grandTotal) > 0.01) {
                arr[arr.length - 1] = {
                  ...arr[arr.length - 1],
                  amount: (grandTotal - arr.slice(0, -1).reduce((s, pm) => s + Number(pm.amount || 0), 0)).toFixed(2)
                };
              }
              const methodsObj = {};
              arr.forEach(pm => {
                if (pm.payment_method && pm.amount > 0) {
                  methodsObj[pm.payment_method] = Number(pm.amount);
                }
              });
              await secureFetch(`/orders/receipt-methods`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  order_id: order.id,
                  receipt_id: order.receipt_id,
                  methods: methodsObj
                }),
              }); 
              toast.success("Payment methods updated!");
              setEditingPaymentOrderId(null);
              setTimeout(fetchClosedOrders, 350);
            }}
          >💾</button>
          <button
            className="ml-1 px-2 py-2 bg-gray-200 rounded text-base"
            onClick={() => setEditingPaymentOrderId(null)}
          >✖️</button>
        </>
      ) : (
        <>
          <select
            value={paymentMethodDraft[order.id] || order.payment_method}
            onChange={(e) =>
              setPaymentMethodDraft((pm) => ({ ...pm, [order.id]: e.target.value }))
            }
            className="border rounded px-2 py-1 text-base mr-2"
          >
            {(paymentMethods.length
              ? paymentMethods.map((method) => method.label)
              : FALLBACK_PAYMENT_OPTIONS
            ).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            className="px-2 py-1 bg-fuchsia-200 text-fuchsia-800 rounded text-base font-bold mr-2"
            onClick={() => {
              const allOptions = paymentMethods.length
                ? paymentMethods.map((method) => method.label)
                : FALLBACK_PAYMENT_OPTIONS;
              const current = paymentMethodDraft[order.id] || order.payment_method;

              const nextOption =
                allOptions.find((option) => option !== current) || allOptions[0];

              setPaymentMethodDraft((pm) => ({
                ...pm,
                [order.id]: [
                  {
                    payment_method: current,
                    amount: Number(calculateGrandTotal(order.items)).toFixed(2),
                  },
                  {
                    payment_method: nextOption,
                    amount: 0,
                  },
                ],
              }));
            }}
          >
            ➕ Add Split
          </button>
          <button
            className="px-2 py-1 bg-blue-500 text-white rounded text-base"
           onClick={async () => {
  try {
    const draft = paymentMethodDraft[order.id];
    // ✅ Determine main payment method string
    const mainMethod =
      Array.isArray(draft) && draft.length > 0
        ? draft[0].payment_method
        : typeof draft === "string"
        ? draft
        : order.payment_method || "Cash";

    // ✅ Authenticated tenant-safe update
await secureFetch(`/orders/${order.id}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    payment_method:
      typeof paymentMethodDraft[order.id] === "string"
        ? paymentMethodDraft[order.id]
        : paymentMethodDraft[order.id]?.payment_method ||
          (Array.isArray(paymentMethodDraft[order.id])
            ? paymentMethodDraft[order.id][0]?.payment_method
            : order.payment_method || "Cash"),
  }),
});



    toast.success("Payment method updated!");
    setEditingPaymentOrderId(null);
    setTimeout(fetchClosedOrders, 350);
  } catch (err) {
    console.error("❌ Failed to update payment method:", err);
    toast.error("Failed to update payment method");
  }
}}


          >💾</button>
          <button
            className="ml-1 px-2 py-1 bg-gray-200 rounded text-base"
            onClick={() => setEditingPaymentOrderId(null)}
          >✖️</button>
        </>
      )
    ) : (
      <span
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-blue-300 bg-white/80 shadow text-lg font-extrabold text-blue-700 ${
          paymentEditingAllowed ? "cursor-pointer" : "cursor-not-allowed opacity-60"
        }`}
        onClick={() => {
          if (!paymentEditingAllowed) return;
          setEditingPaymentOrderId(order.id);
          setPaymentMethodDraft((pm) => ({
            ...pm,
            [order.id]: order.payment_method,
          }));
        }}
        title={t("Edit payment method")}
      >
        {order.payment_method || "UNKNOWN"}
        <span className="ml-2 text-gray-400">✏️</span>
      </span>
    )
  )}
</div>


    </div>
  );
})}

            </div>
          </div>
        ))
      )}
    </div>
  );
}
