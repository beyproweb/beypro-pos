import React, { useEffect, useState, useRef  } from "react";
import { geocodeAddress } from '../utils/geocode';
import LiveRouteMap from "../components/LiveRouteMap";
import socket from "../utils/socket";
import PhoneOrderModal from "../components/PhoneOrderModal";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
const API_URL = import.meta.env.VITE_API_URL || "";

const paymentMethods = ["Cash", "Credit Card", "Multinet", "Sodexo"];

function DrinkSettingsModal({ open, onClose, fetchDrinks }) {
  const [input, setInput] = useState("");
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");



function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const base = (parseFloat(item.price) || 0) * item.quantity;
    const extras = (item.extras || []).reduce(
      (s, ex) =>
        s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
      0
    ) * item.quantity;
    return sum + base + extras;
  }, 0);
}

  // Fetch drinks on modal open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_URL}/api/drinks`)
      .then((res) => res.json())
      .then((data) => {
        setDrinks(data);
        setError("");
      })
      .catch(() => setError("Failed to load drinks"))
      .finally(() => setLoading(false));
  }, [open]);

  const addDrink = async () => {
    const name = input.trim();
    if (!name || drinks.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/drinks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      setInput("");
      setError("");
      // Refresh list
      const res = await fetch(`${API_URL}/api/drinks`);
      setDrinks(await res.json());
      if (fetchDrinks) fetchDrinks();
    } catch {
      setError("Failed to add drink.");
    } finally {
      setSaving(false);
    }
  };

  const removeDrink = async (id) => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/drinks/${id}`, { method: "DELETE" });
      setError("");
      // Refresh list
      const res = await fetch(`${API_URL}/api/drinks`);
      setDrinks(await res.json());
      if (fetchDrinks) fetchDrinks();
    } catch {
      setError("Failed to delete drink.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-md w-full">
        <h2 className="font-bold text-2xl mb-3">🍹 Define Drinks</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border rounded-lg px-3 py-2"
            value={input}
            placeholder="Drink name (e.g. Cola)"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addDrink()}
            disabled={saving}
          />
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
            onClick={addDrink}
            disabled={saving || !input.trim()}
          >
            Add
          </button>

        </div>
        {loading ? (
          <div className="text-gray-600 mb-2">Loading drinks...</div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {drinks.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center gap-2 bg-blue-100 text-blue-900 px-3 py-1 rounded-xl"
              >
                {d.name}
                <button
                  className="text-red-500 ml-1"
                  onClick={() => removeDrink(d.id)}
                  disabled={saving}
                  title="Delete"
                >
                  ✕
                </button>
              </span>
            ))}
            {drinks.length === 0 && !loading && (
              <span className="text-gray-400 italic">No drinks defined yet.</span>
            )}
          </div>
        )}
        {error && <div className="text-red-500 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-gray-200"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-blue-600 text-white"
            onClick={() => {
              if (fetchDrinks) fetchDrinks();
              onClose();
            }}
            disabled={saving}
          >
            Done
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
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState({});
  const [editingPayment, setEditingPayment] = useState({});
  const [highlightedOrderId, setHighlightedOrderId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [mapStops, setMapStops] = useState([]);
  const [showRoute, setShowRoute] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [editingDriver, setEditingDriver] = useState({});
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const socketRef = useRef();
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [activeTab, setActiveTab] = useState("phone");
  const { t } = useTranslation();
  const [showDrinkModal, setShowDrinkModal] = useState(false);
const [drinksList, setDrinksList] = useState([]);
const [driverReport, setDriverReport] = useState(null);
const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0,10)); // YYYY-MM-DD today
const [reportLoading, setReportLoading] = useState(false);
const [excludedKitchenIds, setExcludedKitchenIds] = useState([]);
  const [autoConfirmOrders, setAutoConfirmOrders] = useState(false);

const [showPaymentModal, setShowPaymentModal] = useState(false);
const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
const [splitPayments, setSplitPayments] = useState([{ method: "Cash", amount: "" }]);


function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const base = (parseFloat(item.price) || 0) * item.quantity;
    const extras = (item.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
      0
    ) * item.quantity;
    return sum + base + extras;
  }, 0);
}

function calcOrderDiscount(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const base = (parseFloat(item.price) || 0) * item.quantity;
    const extras = (item.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
      0
    ) * item.quantity;
    if (!item.discount_value || item.discount_value <= 0) return sum;
    if (item.discount_type === "percent")
      return sum + ((base + extras) * (item.discount_value / 100));
    if (item.discount_type === "fixed")
      return sum + parseFloat(item.discount_value);
    return sum;
  }, 0);
}

useEffect(() => {
  if (showPaymentModal && editingPaymentOrder) {
    const fetchSplit = async () => {
      if (editingPaymentOrder.receipt_id) {
        const res = await fetch(`${API_URL}/receipt-methods/${editingPaymentOrder.receipt_id}`);
        const split = await res.json();
        if (Array.isArray(split) && split.length) {
          setSplitPayments(
            split.map(row => ({ method: row.payment_method, amount: row.amount }))
          );
          return;
        }
      }
      // Always use calcOrderTotalWithExtras!
      const totalWithExtras = calcOrderTotalWithExtras(editingPaymentOrder);
setSplitPayments([{ method: editingPaymentOrder.payment_method || "Cash", amount: totalWithExtras }]);

    };

    fetchSplit();
  }
  // eslint-disable-next-line
}, [showPaymentModal, editingPaymentOrder]);



useEffect(() => {
  fetch(`${API_URL}/api/settings/integrations`)
    .then(res => res.json())
    .then(data => setAutoConfirmOrders(!!data.auto_confirm_orders))
    .catch(() => setAutoConfirmOrders(false));
}, []);

async function fetchDriverReport() {
  if (!selectedDriverId || !reportDate) return;
  setReportLoading(true);
  setDriverReport(null);
  try {
    const res = await fetch(`${API_URL}/driver-report?driver_id=${selectedDriverId}&date=${reportDate}`);
    setDriverReport(await res.json());
  } catch (err) {
    setDriverReport({ error: "Failed to load driver report" });
  }
  setReportLoading(false);
}

useEffect(() => {
  fetchDriverReport();
}, [selectedDriverId, reportDate]);



useEffect(() => {
  if (!propOrders) {
    setLoading(true);
    fetchOrders().then(() => setLoading(false));


    socket.on("orders_updated", () => {

      fetchOrders();
    });

    return () => {
      if (window.socket) {
        socket.off("orders_updated")
;
      }
    };
  } else {
    setOrders(propOrders);
    setLoading(false);
  }
}, [propOrders]);



useEffect(() => {
  // ...existing fetchOrders
  fetchDrivers();
}, []);




  // Fetch orders from backend
const fetchOrders = async () => {
  setLoading(true);
  try {
    const res = await fetch(`${API_URL}/api/orders`);
    const data = await res.json();
    const phoneOrders = data.filter(
      (o) => (o.order_type === "phone" || o.order_type === "packet") && o.status !== "closed"
    );

    const withKitchenStatus = [];
    for (const order of phoneOrders) {
      const itemsRes = await fetch(`${API_URL}/${order.id}/items`);
      const items = await itemsRes.json();
      if (items.length > 0) {
        let overallKitchenStatus = "preparing";
        if (items.every(i => i.kitchen_status === "delivered")) overallKitchenStatus = "delivered";
        else if (items.some(i => i.kitchen_status === "ready")) overallKitchenStatus = "ready";
        else if (items.some(i => i.kitchen_status === "preparing")) overallKitchenStatus = "preparing";
        else overallKitchenStatus = items[0]?.kitchen_status || "";
        withKitchenStatus.push({
          ...order,
          kitchen_status: overallKitchenStatus,
          items,
          receiptMethods: order.receipt_methods || [] // DIRECTLY MAP THIS FIELD
        });
      }
    }

    setOrders(withKitchenStatus);
  } catch (err) {
    console.error(err);
    setOrders([]);
  } finally {
    setLoading(false);
  }
};




  // Geocode orders into stops, start from restaurant
  async function fetchOrderStops(phoneOrders) {
  const geoStops = await Promise.all(
    phoneOrders.map(async order => {

      if (!order.customer_address) {

        return null;
      }
      const coords = await geocodeAddress(order.customer_address);

      if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
        return { lat: coords.lat, lng: coords.lng, label: order.customer_name || "Customer" };
      }
      return null;
    })
  );
  const stops = [RESTAURANT, ...geoStops.filter(Boolean)];

  return stops;
}


  // Payment Method Update
  const savePaymentMethod = async (order) => {
    setUpdating((prev) => ({ ...prev, [order.id]: true }));
    try {
      await fetch(`${API_URL}/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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
    const res = await fetch('${API_URL}/api/staff/drivers');
    const data = await res.json();
    setDrivers(data);
  } catch {
    setDrivers([]);
  }
}
useEffect(() => {
  fetch(`${API_URL}/api/kitchen/compile-settings`)
    .then(res => res.json())
    .then(data => setExcludedKitchenIds(data.excludedItems || []))
    .catch(() => setExcludedKitchenIds([]));
}, []);

  // Driver Button Logic
  const handleDriverMultifunction = async (order) => {
  setUpdating(prev => ({ ...prev, [order.id]: true }));

  // Normalize frontend drink names (remove spaces/dashes, lowercase)
  const drinksLower = drinksList.map(d =>
    d.replace(/[\s\-]/g, "").toLowerCase()
  );

  // Build list of “non-drink” items (ignore any whose normalized name is in drinksLower)
const nonDrinkItems = order.items.filter(item => {
  const normalizedName = (item.name || "")
    .replace(/[\s\-]/g, "")
    .toLowerCase();
  // Exclude if it's a drink or if product_id is in excludedKitchenIds
  return !drinksLower.includes(normalizedName) && !excludedKitchenIds.includes(item.product_id);
});
const allNonDrinksDelivered = nonDrinkItems.every(
  i => i.kitchen_status === "delivered"
);

  // Pick up: allow as soon as all non-drink items are delivered
  if (!order.driver_status && allNonDrinksDelivered) {
    await fetch(`${API_URL}/${order.id}/driver-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_status: "on_road" }),
    });
    setHighlightedOrderId(order.id);
    setTimeout(() => setHighlightedOrderId(null), 2000);

  // Deliver: allow if all non-drink items are delivered
} else if (order.driver_status === "on_road" && allNonDrinksDelivered) {
  await fetch(`${API_URL}/${order.id}/driver-status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driver_status: "delivered" }),
  });
  // DO NOT CLOSE AUTOMATICALLY! Let user close manually with the button.
}


  if (!propOrders) if (!propOrders) await fetchOrders();

  setUpdating(prev => ({ ...prev, [order.id]: false }));
};


  // UI Helpers
  function getDriverButtonLabel(order, drivers = []) {
  if (!order.driver_id) {
    if (order.kitchen_status === "preparing") return "Preparing";
    return "Waiting..";
  }
  if (
    order.driver_status === "on_road" &&
    order.kitchen_status === "delivered"
  ) return "On Road";
  if (order.driver_status === "delivered") return "Completed";
  if (order.kitchen_status === "delivered") {
    const driver = drivers.find(d => d.id === Number(order.driver_id));
    return `Pick by ${driver ? driver.name : "Driver"} 🕒`;
  }
  // If assigned but not ready/picked up
  const driver = drivers.find(d => d.id === Number(order.driver_id));
  return `Pick by ${driver ? driver.name : "Driver"} 🕒`;
}

const fetchDrinks = async () => {
  try {
    const res = await fetch(`${API_URL}/api/drinks`);
    const data = await res.json();
    setDrinksList(data.map(d => d.name));
  } catch {
    setDrinksList([]);
  }
};

useEffect(() => {
  fetchDrinks();
}, []);

function driverButtonDisabled(order) {
  if (order.driver_status === "delivered") return true;
  if (updating[order.id]) return true;

  // 👇 NEW: Block if driver is not assigned
  if (!order.driver_id) return true;

  const drinksLower = drinksList.map(d => d.replace(/[\s\-]/g, "").toLowerCase());
  const nonDrinkNonExcludedItems = (order.items || []).filter(item => {
    const normalizedName = (item.name || "").replace(/[\s\-]/g, "").toLowerCase();
    return (
      !drinksLower.includes(normalizedName) &&
      !(excludedKitchenIds.includes(item.product_id))
    );
  });
  const allNonDrinksDelivered = nonDrinkNonExcludedItems.every(i => i.kitchen_status === "delivered");
  if (nonDrinkNonExcludedItems.length && !allNonDrinksDelivered) return true;
  return false;
}




  function getPrepTimer(order) {
    if (!order.prep_started_at) return "00:00";
    const start = new Date(order.prep_started_at).getTime();
    const end = order.kitchen_delivered_at
      ? new Date(order.kitchen_delivered_at).getTime()
      : Date.now();
    const elapsed = Math.floor((end - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getDeliveryTimer(order) {
    if (!order.on_road_at) return "00:00";
    const start = new Date(order.on_road_at).getTime();
    const end = order.delivered_at
      ? new Date(order.delivered_at).getTime()
      : Date.now();
    const elapsed = Math.floor((end - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getWaitingTimer(order) {
    if (!order.created_at) return "00:00";
    const start = new Date(order.created_at).getTime();
    const end = order.delivered_at
      ? new Date(order.delivered_at).getTime()
      : Date.now();
    const elapsed = Math.floor((end - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function getDeliverySeconds(order) {
    if (!order.kitchen_delivered_at) return 0;
    const start = new Date(order.kitchen_delivered_at).getTime();
    return Math.floor((now - start) / 1000);
  }
  function getWaitingSeconds(order) {
    if (!order.created_at) return 0;
    const start = new Date(order.created_at).getTime();
    const end = order.delivered_at
      ? new Date(order.delivered_at).getTime()
      : Date.now();
    return Math.floor((end - start) / 1000);
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
const totalByMethod = paymentMethods.reduce((obj, method) => {
  obj[method] = filteredOrders.filter(o => o.payment_method === method).reduce((sum, o) => sum + Number(o.total || 0), 0); return obj;
}, {});


return (
  <div className="min-h-screen pt-0 px-4 pb-4 w-full  relative text-gray-900 dark:text-white transition-colors duration-300 space-y-8">

{/* --- HEADER & ACTIONS, Always Centered --- */}
<div className="w-full flex flex-col items-center justify-center pt-1 pb-0 min-h-[50px]">

  <div className="flex flex-col items-center justify-center w-full max-w-3xl">
    <div className="flex flex-col md:flex-row items-center justify-center gap-5 w-full">
      <select
        className="border px-4 py-2 rounded-2xl text-lg font-semibold bg-white dark:bg-gray-900 dark:text-white dark:border-gray-600 min-w-[180px] shadow"
        value={selectedDriverId || ""}
        onChange={e => setSelectedDriverId(e.target.value)}
      >
        <option value="">{t("Select driver to view report")}</option>
        {drivers.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        className="px-6 py-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow hover:scale-105 flex items-center gap-2 disabled:opacity-40 transition"
        disabled={!selectedDriverId}
        onClick={async () => {
          const driverOrders = orders.filter(
            o => o.driver_id === Number(selectedDriverId) && o.driver_status !== "delivered"
          );
          const stops = await fetchOrderStops(driverOrders);
          setMapStops(stops);
          setShowRoute(true);
        }}
      >
        🛵<span className="bg-green-400 text-black text-xs px-2 py-0.5 rounded-lg">LIVE</span> {t("Route")}
      </button>
      <div className="flex items-center gap-2 bg-indigo-100 dark:bg-indigo-900 rounded-xl px-3 py-1">
        <label className="font-semibold">{t("Date")}:</label>
        <input
          type="date"
          className="border px-2 py-1 rounded text-lg bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
          value={reportDate}
          max={new Date().toISOString().slice(0,10)}
          onChange={e => setReportDate(e.target.value)}
          disabled={reportLoading}
        />
      </div>
    </div>
    <button
      className="mt-4 md:mt-0 md:absolute md:right-14 px-4 py-2 rounded-2xl bg-blue-100 text-blue-800 font-bold shadow hover:bg-blue-200 transition"
      onClick={() => setShowDrinkModal(true)}
    >
      {t("Settings")}
    </button>
  </div>
</div>


    {/* --- DRIVER REPORT --- */}
    {selectedDriverId && (
      <div className="mt-4">
        {reportLoading ? (
          <div className="animate-pulse text-xl">Loading driver report...</div>
        ) : driverReport?.error ? (
          <div className="text-red-600 font-bold">{driverReport.error}</div>
        ) : driverReport ? (
          <div className="rounded-2xl shadow-2xl p-8 bg-gradient-to-tr from-indigo-50 to-blue-100 dark:from-indigo-950 dark:to-blue-900 border border-blue-200 dark:border-blue-900 space-y-5">
            <div className="flex flex-wrap gap-10 items-center mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase">Packets Delivered</div>
                <div className="text-4xl font-extrabold text-green-600 dark:text-green-400">{driverReport.packets_delivered}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase">Total Sales</div>
                <div className="text-4xl font-extrabold text-blue-700 dark:text-blue-300">₺{driverReport.total_sales?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-300 uppercase">By Payment Method</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(driverReport.sales_by_method).map(([method, amt]) =>
                    <span key={method} className="bg-white dark:bg-gray-800 shadow px-3 py-1 rounded-lg font-bold text-sm text-blue-700 dark:text-blue-200">
                      {method}: ₺{amt.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm bg-white dark:bg-gray-900 rounded-xl shadow border border-blue-100 dark:border-blue-700">
                <thead>
  <tr>
    <th className="p-2">Customer</th>
    <th className="p-2">Address</th>
    <th className="p-2">Total</th>
    <th className="p-2">Payment</th>
    <th className="p-2">Delivered At</th>
    <th className="p-2">Pickup→Delivery</th>
    <th className="p-2">Kitchen→Delivery</th>
  </tr>
</thead>
<tbody>
  {driverReport.orders.map(ord => (
    <tr key={ord.id} className="hover:bg-indigo-50 dark:hover:bg-blue-950">
      <td className="p-2">{ord.customer_name || "-"}</td>
      <td className="p-2">{ord.customer_address || "-"}</td>
      <td className="p-2">₺{parseFloat(ord.total).toFixed(2)}</td>
      <td className="p-2">{ord.payment_method}</td>
      <td className="p-2">{ord.delivered_at ? new Date(ord.delivered_at).toLocaleTimeString() : "-"}</td>
      <td className="p-2">
        {ord.delivery_time_seconds
          ? (ord.delivery_time_seconds / 60).toFixed(1) + " min"
          : "-"}
      </td>
      <td className="p-2">
        {ord.kitchen_to_delivery_seconds
          ? (ord.kitchen_to_delivery_seconds / 60).toFixed(1) + " min"
          : "-"}
      </td>
    </tr>
  ))}
</tbody>

              </table>
            </div>
          </div>
        ) : (
          <div className="text-gray-400 text-sm">{t("Select a driver and date to see the report.")}</div>
        )}
      </div>
    )}

    {/* --- LIVE ROUTE MODAL --- */}
    {showRoute && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl relative shadow-lg w-full max-w-6xl">
          <button
            onClick={() => setShowRoute(false)}
            className="absolute top-3 right-4 text-2xl text-gray-500 dark:text-gray-300 hover:text-red-500"
          >
            ✖
          </button>
          <LiveRouteMap
            stopsOverride={mapStops}
            driverNameOverride={drivers.find(d => d.id === Number(selectedDriverId))?.name || ""}
            driverId={selectedDriverId}
          />
        </div>
        
      </div>
    )}


    {/* --- DRINK SETTINGS MODAL --- */}
    <DrinkSettingsModal
      open={showDrinkModal}
      onClose={() => setShowDrinkModal(false)}
      drinks={drinksList}
      setDrinks={setDrinksList}
      fetchDrinks={fetchDrinks}
    />

{/* --- Drinks summary per assigned driver --- */}
{drivers.map(driver => {
  const assignedOrders = orders.filter(o => o.driver_id === driver.id);
  if (!assignedOrders.length) return null;

  const totalDrinks = {};
  const normDrinks = drinksList.map(d =>
    d.replace(/[\s\-]/g, "").toLowerCase()
  );

  const clientBags = assignedOrders.map(order => {
    const orderDrinks = {};

    (order.items || []).forEach(item => {
      const rawName =
        item.order_item_name ||
        item.external_product_name ||
        item.product_name ||
        "";
      const name = rawName.trim();
      const normName = name.replace(/[\s\-]/g, "").toLowerCase();

      const isDrink =
        normDrinks.includes(normName) ||
        normDrinks.some(d => normName.includes(d));

      if (isDrink) {
        orderDrinks[name] = (orderDrinks[name] || 0) + Number(item.quantity || 1);
        totalDrinks[name] = (totalDrinks[name] || 0) + Number(item.quantity || 1);
      }

      if (Array.isArray(item.extras)) {
        item.extras.forEach(ex => {
          const rawEx = ex.name || "";
          const exName = rawEx.trim();
          const normEx = exName.replace(/[\s\-]/g, "").toLowerCase();

          const isDrinkExtra =
            normDrinks.includes(normEx) ||
            normDrinks.some(d => normEx.includes(d));

          if (isDrinkExtra) {
            orderDrinks[exName] = (orderDrinks[exName] || 0) + 1;
            totalDrinks[exName] = (totalDrinks[exName] || 0) + 1;
          }
        });
      }
    });

    const drinkStr = Object.entries(orderDrinks).map(([name, qty]) => (
      <span
        key={name}
        className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-900 rounded-xl text-sm font-bold shadow"
      >
        {qty}× {name}
      </span>
    ));

    return (
      <div
        key={order.id}
        className="min-w-[180px] max-w-[220px] bg-white dark:bg-gray-900 rounded-3xl shadow-lg border border-indigo-300 dark:border-indigo-700 flex flex-col justify-between px-4 py-3 mx-2 transition hover:scale-105"
      >
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 text-center truncate mb-1">
          {order.customer_name || "Customer"}
        </div>
        <div className="flex flex-wrap justify-center gap-1 mb-2 min-h-[40px]">
          {drinkStr.length > 0 ? drinkStr : <span className="italic text-gray-400">No drinks</span>}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center truncate">
          {order.customer_address}
        </div>
      </div>
    );
  });

  const totalStr = Object.entries(totalDrinks).map(([name, qty]) => (
    <span
      key={name}
      className="inline-flex items-center px-2 py-1 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow"
    >
      {qty}× {name}
    </span>
  ));

  return (
    <div key={driver.id} className="mb-6 px-2">
      <div className="flex items-center gap-4 mb-2">
        <span className="text-xl font-extrabold bg-gradient-to-r from-blue-400 to-fuchsia-500 bg-clip-text text-transparent drop-shadow">
          🧃 {driver.name}
        </span>
        <span className="ml-auto text-base font-bold text-indigo-700 dark:text-indigo-300 flex flex-wrap gap-1">
          {totalStr}
        </span>
      </div>
      <div className="flex overflow-x-auto py-2 px-1 space-x-4 scrollbar-thin scrollbar-thumb-indigo-400 scrollbar-track-gray-100">
        {clientBags}
      </div>
    </div>
  );
})}






   {/* --- ORDERS LIST --- */}
<div className="min-h-screen p-5 w-full mx-auto relative text-gray-900 dark:text-white transition-colors duration-300">
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



{orders.map((order, i) => {
  const totalWithExtras = calcOrderTotalWithExtras(order);
  const totalDiscount = calcOrderDiscount(order);
  const discountedTotal = totalWithExtras - totalDiscount;
      const isDelivered = order.driver_status === "delivered";
      const isPicked = order.driver_status === "on_road";
      const isReady = order.kitchen_status === "ready";
      const isPrep = order.kitchen_status === "preparing";
      const onlinePayments = [
        "online", "online payment", "online card", "yemeksepeti online"
      ];
      const isOnlinePayment = order.payment_method &&
        onlinePayments.some(type => order.payment_method.toLowerCase().includes(type));
      const isYemeksepeti = order.order_type === "packet" && order.external_id;

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
  className={`
    w-full h-full rounded-3xl shadow-2xl p-7 flex flex-col gap-5
    ${order.driver_status === "delivered"
      ? "bg-[#1ddb5c] dark:bg-[#087b30] text-black dark:text-white"
      : order.driver_status === "on_road"
      ? "bg-[#15d4e0] dark:bg-[#0c6280] text-black dark:text-white"
      : order.status === "confirmed"
      ? "bg-[#ffe600] dark:bg-[#ffb300] text-black dark:text-black"
      : "bg-[#f1f5f9] dark:bg-[#1e293b] text-black dark:text-white"
    }
  `}
  style={{
    borderRadius: "2rem",
    minHeight: 210,
    border: "3px solid #222",
    boxShadow:
      order.driver_status === "delivered"
        ? "0 0 30px 5px #1ddb5c88"
        : order.driver_status === "on_road"
        ? "0 0 30px 5px #15d4e088"
        : order.status === "confirmed"
        ? "0 0 18px 2px #ffe60088"
        : "0 0 6px 1px #8888",
    transition: "background 0.4s cubic-bezier(.7,1.8,.5,.8), box-shadow 0.25s"
  }}
>





            {/* CARD HEADER */}
<div
  className="flex flex-col gap-1 w-full pb-2 border-b border-blue-100 dark:border-blue-900 mb-3"
  style={{ minWidth: 0 }}
>
  {/* Top Row: Address + Timer */}
  <div className="relative rounded-t-3xl px-6 py-4 flex items-start justify-between gap-4 bg-white/70 dark:bg-blue-950/60 backdrop-blur shadow-md border-b border-blue-100 dark:border-blue-900">
  {/* Address + icon */}
  <div className="flex flex-col flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-2xl text-blue-600">📍</span>
      <span
  className="
    text-2xl font-extrabold text-blue-900 dark:text-blue-100
    leading-snug break-words w-full
    sm:text-xl sm:leading-snug
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
</span>

    </div>
  </div>
  {/* Right badges */}
  <div className="flex flex-col items-end gap-2 min-w-[135px]">
    {isYemeksepeti && (
  <span className="inline-flex items-center px-5 py-2 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 text-white text-lg font-extrabold shadow-lg gap-2 tracking-wider border-2 border-pink-300" style={{ fontSize: '1.35rem', letterSpacing: 1 }}>
    Yemeksepeti
    <svg width="28" height="28" viewBox="0 0 24 24" className="inline -mt-0.5 ml-1"><circle cx="12" cy="12" r="12" fill="#FF3B30"/><text x="12" y="16" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="bold">YS</text></svg>
  </span>
)}

    <span className="flex items-center gap-2 px-2 py-1.5 rounded-2xl font-mono font-bold bg-cyan-800 text-white shadow border border-cyan-300 text-sm">
  <span className="text-base">⏰</span> {getWaitingTimer(order)}
</span>

  </div>



  </div>
  {/* Second Row: Customer + Statuses */}
  <div className="flex flex-wrap items-center gap-3 mt-1 w-full">
<div className="flex items-center gap-4 my-2">
 <span className="inline-flex items-center px-4 py-2 rounded-xl bg-blue-200 dark:bg-blue-700 text-blue-900 dark:text-white text-xl font-extrabold shadow">
  <span className="mr-2">👤</span> {order.customer_name}
</span>

  {order.customer_phone && (
    <a
      href={`tel:${order.customer_phone}`}
      className="inline-flex items-center px-3 py-2 rounded-xl bg-gradient-to-r from-yellow-200 via-yellow-100 to-blue-100 text-cyan-900 font-bold text-lg shadow-lg border border-yellow-400 hover:scale-105 active:scale-95 transition-all"
      title="Click to call"
      style={{ textDecoration: 'none' }}
    >
      <svg className="mr-2" width="22" height="22" fill="none" viewBox="0 0 24 24"><path fill="#06b6d4" d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.11-.21c1.21.49 2.53.76 3.88.76.55 0 1 .45 1 1v3.5c0 .55-.45 1-1 1C7.72 22 2 16.28 2 9.5c0-.55.45-1 1-1H6.5c.55 0 1 .45 1 1 0 1.35.27 2.67.76 3.88.17.39.09.85-.21 1.11l-2.2 2.2z"/></svg>
      {order.customer_phone}
    </a>
  )}
</div>


{/* --- Confirmation / Auto-Confirm UI --- */}
{/* Confirm Online Order button, only shows/blinks if NOT confirmed */}
{["packet", "phone"].includes(order.order_type)
  && order.status !== "confirmed"
  && order.status !== "closed" && (
  <button
    onClick={async () => {
      const res = await fetch(`${API_URL}/api/orders/${order.id}/confirm-online`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        return alert(`Confirm failed: ${err.error}`);
      }
      const { order: updated } = await res.json();

      // Fetch items for this order
      const itemsRes = await fetch(`${API_URL}/${order.id}/items`);
      const items = await itemsRes.json();

      setOrders(prev =>
        prev.map(o =>
          o.id === updated.id ? { ...updated, items } : o
        )
      );
    }}
    className="animate-pulse inline-flex items-center px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-700 text-white font-extrabold text-lg shadow-lg border-2 border-blue-400 transition-all"
  >
    <span className="mr-2">⚡</span> Confirm Online Order
  </button>
)}

{/* SOLID "Confirmed" badge, never blinks */}
{!autoConfirmOrders && order.status === "confirmed" && (
  <span
    className="inline-flex items-center px-3 py-2 rounded-xl bg-green-500 text-white font-bold text-lg shadow-lg border-2 border-green-400"
    title="Order Confirmed"
  >
    <span className="mr-1">✅</span> Confirmed
  </span>
)}

{/* Auto-confirmed badge, always solid */}
{autoConfirmOrders && order.status === "confirmed" && (
  <span
    className="inline-flex items-center px-4 py-2 rounded-xl bg-green-500 text-white font-bold text-lg shadow-lg border-2 border-green-400"
    style={{
      fontSize: "1.1rem",
      letterSpacing: 1,
    }}
  >
    <span className="mr-1"></span> Auto Confirmed!
  </span>
)}

{order.status !== 'closed' && (
  <button
    className="px-4 py-2 rounded-xl bg-fuchsia-600 text-white font-bold shadow hover:bg-fuchsia-700 transition"
    onClick={async () => {
  // Fetch latest items (including extras) for this order!
  const itemsRes = await fetch(`${API_URL}/${order.id}/items`);
  const items = await itemsRes.json();
  setEditingPaymentOrder({ ...order, items }); // set with freshest items+extras!
  setShowPaymentModal(true);
}}

  >
    Change/Add Payment
  </button>
)}


{order.status === "paid" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-blue-600 text-white shadow">
    Paid
  </span>
)}
{order.status === "draft" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-gray-400 text-white shadow">
    Draft
  </span>
)}
{order.status === "cancelled" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-red-500 text-white shadow">
    Cancelled
  </span>
)}
{order.status === "closed" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-gray-800 text-white shadow">
    Closed
  </span>
)}


{/* Kitchen Status */}
{order.kitchen_status === "preparing" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-yellow-400/90 text-gray-900 shadow flex items-center gap-1">
    🍳 Preparing
  </span>
)}
{order.kitchen_status === "ready" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-orange-400/90 text-white shadow flex items-center gap-1">
    🟠 Ready
  </span>
)}
{order.kitchen_status === "delivered" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-green-500/90 text-white shadow flex items-center gap-1">
    ✅ Delivered
  </span>
)}

  </div>


              {/* Items */}
              <details open className="w-full">
                <summary className="cursor-pointer flex items-center gap-2 text-base font-semibold select-none hover:underline">
                  <span className="text-xl">🛒</span>
                  Order Items <span className="text-sm opacity-60">({order.items.length})</span>
                </summary>
<ul className="pl-0 mt-2 flex flex-col gap-2">
  {order.items.map((item, idx) => (
    <li
      key={item.unique_id || idx}
      className="flex flex-col gap-1 px-2 py-2 rounded-xl bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900 dark:to-blue-950 shadow border border-cyan-100 dark:border-cyan-800"
    >
      {/* Main Product Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block min-w-[28px] h-7 flex items-center justify-center rounded-lg bg-yellow-200/70 text-yellow-800 font-mono font-bold text-base shadow border border-yellow-300">
            {item.quantity}×
          </span>
          <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 break-words tracking-wide">
            {item.product_name || item.external_product_name || item.order_item_name || "Unnamed"}
          </span>


        </div>
        <div className="flex items-center gap-2">
          <span
            className={`
              flex items-center px-3 py-1 rounded-xl font-extrabold text-lg shadow-lg
              ${item.kitchen_status === "preparing" ? "bg-yellow-300 text-yellow-900 border-2 border-yellow-400 animate-pulse" : ""}
              ${item.kitchen_status === "ready" ? "bg-orange-400 text-white border-2 border-orange-600 animate-pulse" : ""}
              ${item.kitchen_status === "delivered" ? "bg-green-500 text-white border-2 border-green-600" : ""}
            `}
            style={{ minWidth: 100, textAlign: "center", letterSpacing: 0.5 }}
          >
            {item.kitchen_status === "preparing" && <>🍳 PREP</>}
            {item.kitchen_status === "ready" && <>🟠 READY</>}
            {item.kitchen_status === "delivered" && <>✅ READY</>}
          </span>
          <span className="text-xl font-extrabold font-mono text-blue-800 dark:text-blue-200 ml-2 px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-xl shadow border border-blue-300 dark:border-blue-800">
            ₺{Number(item.price).toFixed(2)}
          </span>
        </div>
        {order.estimated_ready_at && (
  <span className="inline-flex items-center gap-2 px-4 py-1 rounded-2xl bg-indigo-100 text-indigo-800 font-bold shadow text-base">
    <span className="text-xl">⏰</span>
    Ready by:&nbsp;
    {new Date(order.estimated_ready_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
  </span>
)}

      </div>

{item.extras && item.extras.length > 0 && (
  <div className="ml-6 mt-2 flex flex-col gap-1">
    {item.extras.map((ex, i) => (
      <div
        key={i}
        className="flex justify-between items-center px-3 py-1 rounded-xl bg-yellow-100 dark:bg-yellow-700/40 border border-yellow-400 dark:border-yellow-600 text-base font-semibold shadow-sm"
        style={{ fontSize: "1.08em" }}
      >
        <span className="text-yellow-900 dark:text-yellow-100 flex items-center gap-2 font-bold">
          ➕ {ex.name}
          <span className="ml-2 font-extrabold text-yellow-800 dark:text-yellow-100 text-lg tracking-wide drop-shadow-sm" style={{letterSpacing: "0.5px"}}>
  ×{ex.quantity || 1}
</span>
        </span>
        <span className="text-yellow-900 dark:text-yellow-100 font-mono">
          ₺{((ex.price || 0) * (ex.quantity || 1)).toFixed(2)}
        </span>
      </div>
    ))}
  </div>
)}

{/* --- NOTE: Always shows below the EXTRAS, with unique color --- */}
{item.note && (
  <div className="ml-6 mt-2 px-3 py-1 rounded-xl bg-rose-100 dark:bg-rose-900 text-rose-900 dark:text-rose-100 border border-rose-300 dark:border-rose-800 font-bold italic flex items-center gap-2 shadow text-base">
    📝 <span style={{ wordBreak: "break-word" }}>{item.note}</span>
  </div>
)}




    </li>
  ))}
</ul>



              </details>
              {/* Payment/driver/total/actions */}
<div className="flex justify-between items-start w-full mt-auto pt-2 gap-2">
  {/* LEFT: Payment + Driver */}
  <div className="flex items-center gap-4 flex-wrap">
    {/* --- PAYMENT --- */}
    <div className="flex items-center gap-2 text-base">
      <span
        className="font-extrabold font-mono text-blue-900 dark:text-blue-200 text-xl tracking-wide"
        style={{
          letterSpacing: 1.1,
          fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
          textShadow: "0 2px 4px #e0e7ef",
        }}
      >
        Payment:
      </span>
      <div className="flex flex-wrap gap-2 items-center">
        {(order.receiptMethods?.length > 0
          ? order.receiptMethods
          : [{ payment_method: order.payment_method, amount: order.total }]
        ).map((pm, idx) => {
          const icons = {
            "Cash": "💵",
            "Credit Card": "💳",
            "Sodexo": "🍽️",
            "Multinet": "🪙"
          };
          return (
            <span
              key={idx}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-200 to-blue-200 dark:from-cyan-900 dark:to-blue-900 border-2 border-blue-400 dark:border-blue-700 rounded-2xl font-extrabold font-mono text-blue-800 dark:text-blue-100 text-xl shadow"
              style={{
                fontSize: "1.17rem",
                letterSpacing: 1.1,
                minWidth: 110,
                height: 44,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <span style={{ fontSize: "1.15em", lineHeight: 1, marginRight: 2 }}>{icons[pm.payment_method] || "💳"}</span>
              {pm.payment_method}
            </span>
          );
        })}
      </div>
    </div>
    {/* --- DRIVER --- */}
    <div className="flex items-center gap-2 text-base">
      <span className="font-extrabold font-mono text-blue-900 dark:text-blue-200 text-xl tracking-wide mr-1"
        style={{
          letterSpacing: 1.1,
          fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
          textShadow: "0 2px 4px #e0e7ef",
        }}
      >
        Driver:
      </span>
      <div className="relative">
        <select
          value={order.driver_id || ""}
          onChange={async e => {
            const driverId = e.target.value;
            setEditingDriver(prev => ({ ...prev, [order.id]: driverId }));
            await fetch(`${API_URL}/${order.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                driver_id: driverId,
                total: order.total,
                payment_method: order.payment_method,
              }),
            });
            setHighlightedOrderId(order.id);
            setTimeout(() => setHighlightedOrderId(null), 1200);
            if (!propOrders) await fetchOrders();
          }}
          className={`
            peer appearance-none px-4 pr-10 py-2 w-[140px]
            bg-gradient-to-r from-cyan-200 to-blue-200 dark:from-cyan-900 dark:to-blue-900
            border-2 border-blue-400 dark:border-blue-700 rounded-2xl font-extrabold font-mono text-blue-800 dark:text-blue-100 text-xl shadow
            focus:ring-2 focus:ring-blue-400 focus:border-blue-500
            disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:opacity-60
            transition-all
          `}
          disabled={isDelivered}
          style={{
            minWidth: 110,
            height: 44,
            fontSize: "1.17rem",
            letterSpacing: 1.1,
            outline: "none",
            fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
          }}
        >
          <option value="">Unassigned</option>
          {drivers.map(d => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 transform -translate-y-1/2 text-blue-400 dark:text-blue-200 text-xl">
          ▼
        </span>
      </div>
    </div>
  </div>
  {/* RIGHT: Discount (if any) above Total */}
  <div className="flex flex-col items-end min-w-[180px]">
    {totalDiscount > 0 && (
      <span className="font-extrabold font-mono text-red-700 text-xl px-4 py-1 bg-red-100 rounded-xl border-2 border-red-300 shadow-sm mb-1 text-right flex justify-end items-center w-full">
        🎁 Discount: &nbsp; –₺{totalDiscount.toFixed(2)}
      </span>
    )}
    <span className="font-extrabold font-mono text-blue-800 text-xl px-4 py-1 bg-blue-100 rounded-xl border-2 border-blue-300 shadow-sm text-right flex justify-end items-center w-full">
      Total: &nbsp; ₺{discountedTotal.toFixed(2)}
    </span>
  </div>
</div>


              {/* Action Buttons */}
              <div className="flex gap-3 mt-3">
                {!order.driver_status && (
                  <button
  className="flex-1 px-5 py-3 rounded-2xl font-bold text-base bg-cyan-600 hover:bg-cyan-700 shadow-lg text-white transition"
  disabled={driverButtonDisabled(order)}
  onClick={async () => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, driver_status: "on_road" }
          : o
      )
    );
    await fetch(`${API_URL}/${order.id}/driver-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_status: "on_road" }),
    });
    // Optionally: await fetchOrders();
  }}
>
  On Road
</button>



                )}
                {order.driver_status === "on_road" && (
                  <button
  className="flex-1 px-5 py-3 rounded-2xl font-bold text-base bg-orange-600 hover:bg-orange-700 shadow-lg text-white transition"
  onClick={async () => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, driver_status: "delivered" }
          : o
      )
    );
    await fetch(`${API_URL}/${order.id}/driver-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_status: "delivered" }),
    });
    // Optionally: await fetchOrders();
  }}
>
  Delivered
</button>

                )}
                {order.driver_status === "delivered" && (
                  <button
  className="flex-1 px-5 py-3 rounded-2xl font-bold text-base bg-green-600 hover:bg-green-700 shadow-lg text-white transition"
  onClick={async () => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, status: "closed" }
          : o
      )
    );
    await fetch(`${API_URL}/${order.id}/close`, { method: "POST" });
    // Optionally: await fetchOrders();
  }}
>
  Close Order
</button>

                )}
              </div>
            </div>
          </div>

        </div>

      );

    })}

  </div>
{showPaymentModal && editingPaymentOrder && (
  (() => {
    const grandTotal = calcOrderTotalWithExtras(editingPaymentOrder);

    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 transition-all duration-300">
        <div className="relative bg-white rounded-3xl w-[94vw] max-w-md mx-auto p-7 shadow-2xl border border-fuchsia-200 animate-fade-in">
          {/* Close */}
          <button
            onClick={() => setShowPaymentModal(false)}
            className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-fuchsia-500 transition"
            title="Close"
          >✕</button>
          {/* Title */}
          <div className="flex flex-col items-center mb-5">
            <div className="text-4xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text mb-1">💸 Payment</div>
            <div className="text-base font-semibold text-gray-700 mb-2">Order #{editingPaymentOrder.id}</div>
            <div className="text-xs bg-fuchsia-100 text-fuchsia-700 rounded-xl px-4 py-1 font-bold tracking-wide shadow">
              Split between multiple payment methods if needed.
            </div>
          </div>
          {/* Split Payment Rows */}
          <div className="flex flex-col gap-3 mb-5">
            {splitPayments.map((pay, idx) => (
              <div key={idx} className="flex gap-3 items-center group animate-fade-in border-b border-fuchsia-100 pb-2">
                <select
                  value={pay.method}
                  onChange={e => {
                    const copy = [...splitPayments];
                    copy[idx].method = e.target.value;
                    setSplitPayments(copy);
                  }}
                  className="rounded-xl border-2 border-fuchsia-200 px-3 py-2 font-semibold text-lg focus:ring-2 focus:ring-fuchsia-300 bg-white"
                >
                  <option>Cash</option>
                  <option>Credit Card</option>
                  <option>Multinet</option>
                  <option>Sodexo</option>
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="w-28 rounded-xl border-2 border-fuchsia-200 px-4 py-2 text-lg text-right font-mono shadow focus:ring-2 focus:ring-blue-200 bg-white"
                  placeholder="₺0.00"
                  value={pay.amount}
                  onChange={e => {
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
                    className="ml-2 p-2 bg-fuchsia-100 text-fuchsia-600 rounded-full hover:bg-fuchsia-200 shadow transition"
                    onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                    title="Remove"
                  >–</button>
                )}
              </div>
            ))}
            <button
              className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-200 text-blue-800 font-bold shadow transition-all"
              onClick={() => setSplitPayments([...splitPayments, { method: "Cash", amount: "" }])}
            >
              <span className="text-xl">+</span> Add Payment Method
            </button>
          </div>
          {/* Total Summary */}
          <div className="bg-fuchsia-50 p-4 rounded-xl flex flex-col items-center gap-1 shadow-inner mb-2 border border-fuchsia-100">
            <span className="text-lg font-bold text-gray-900 flex gap-2 items-center">
              Grand Total:&nbsp;
              <span className="text-2xl text-indigo-800 font-extrabold font-mono tracking-wider">
                ₺{grandTotal.toFixed(2)}
              </span>
            </span>
            <span className="text-md text-gray-700 flex gap-2 items-center">
              Split Amount Paid:&nbsp;
              <span className="text-xl font-bold text-fuchsia-700 font-mono">
                ₺{splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0).toFixed(2)}
              </span>
            </span>
            {/* Remaining Balance */}
            {(() => {
              const paid = splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
              const remaining = grandTotal - paid;
              return (
                <div className={`mt-2 text-lg font-semibold ${
                  remaining > 0
                    ? "text-orange-600"
                    : remaining < 0
                    ? "text-red-600"
                    : "text-green-700"
                }`}>
                  {remaining > 0
                    ? `Remaining: ₺${remaining.toFixed(2)}`
                    : remaining < 0
                    ? `Overpaid: ₺${Math.abs(remaining).toFixed(2)}`
                    : ``}
                </div>
              );
            })()}
            {splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) !== grandTotal && (
              <span className="text-red-500 text-sm mt-1 animate-pulse">Amounts must sum to order total.</span>
            )}
          </div>
          {/* Save/Cancel */}
          <div className="flex gap-3 justify-end mt-5">
            <button
              className="px-5 py-2 rounded-xl bg-gray-200 text-gray-700 font-bold hover:bg-gray-300"
              onClick={() => setShowPaymentModal(false)}
            >Cancel</button>
            <button
              className={`px-6 py-2 rounded-xl font-bold shadow text-white transition-all duration-150 ${
                splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) === grandTotal
                  ? "bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-700 hover:to-indigo-700 scale-105"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
              disabled={splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) !== grandTotal}
onClick={async () => {
  const receiptId = editingPaymentOrder.receipt_id || uuidv4();
  const cleanedSplits = {};
  splitPayments.forEach(p => {
    if (p.method && p.amount > 0) cleanedSplits[p.method] = Number(p.amount);
  });

  await fetch(`${API_URL}/api/orders/receipt-methods`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: editingPaymentOrder.id,   // FIXED
      receipt_id: receiptId,
      methods: cleanedSplits
    }),
  });

  await fetch(`${API_URL}/${editingPaymentOrder.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payment_method: splitPayments[0].method,
      total: grandTotal,
      receipt_id: receiptId
    })
  });
  setShowPaymentModal(false);
  await fetchOrders();
}}

            >Save Payment</button>
          </div>
        </div>
        {/* Small fade-in animation */}
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
    );
  })()
)}


  <style>{`
    @keyframes pulseGlow {
      0% { filter: brightness(1.12) blur(0.8px);}
      100% { filter: brightness(1.24) blur(2.5px);}
    }
  `}</style>
</div>
<style>{`
  @keyframes pulseGlow {
    0% { filter: brightness(1.12) blur(0.8px);}
    100% { filter: brightness(1.24) blur(2.5px);}
  }
`}</style>

  </div>
);




}

// --- Show items for each phone order ---
function OrderItems({ orderId }) {
  const [items, setItems] = useState([]);
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

            <span className="text-gray-700 font-mono">
  ₺{(parseFloat(item.price) * item.quantity).toFixed(2)}
</span>

          </div>
          {/* --- EXTRAS --- */}


        </li>
      ))}
    </ul>
  );
}

