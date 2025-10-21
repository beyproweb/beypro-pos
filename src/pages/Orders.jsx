import React, { useEffect, useState, useRef  } from "react";
import { geocodeAddress } from '../utils/geocode';
import LiveRouteMap from "../components/LiveRouteMap";
import socket from "../utils/socket";
import PhoneOrderModal from "../components/PhoneOrderModal";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import secureFetch from "../utils/secureFetch";
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

  const fetchDrinks = async () => {
    setLoading(true);
    try {
      const data = await secureFetch("/drinks");
      setDrinks(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      console.error("❌ Failed to fetch drinks in modal:", err);
      setError("Failed to load drinks");
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
    setError("Failed to add drink.");
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
    setError("Failed to delete drink.");
  } finally {
    setSaving(false);
  }
};





  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 p-7 max-w-md w-full text-slate-900">
        <h2 className="font-semibold text-2xl mb-3 tracking-tight text-slate-900">🍹 Define Drinks</h2>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-300"
            value={input}
            placeholder="Drink name (e.g. Cola)"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addDrink()}
            disabled={saving}
          />
          <button
            className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition"
            onClick={addDrink}
            disabled={saving || !input.trim()}
          >
            Add
          </button>

        </div>
        {loading ? (
          <div className="text-slate-500 mb-2">Loading drinks...</div>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            {drinks.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded-xl border border-slate-200"
              >
                {d.name}
                <button
                  className="text-rose-500 ml-1 hover:text-rose-600 transition"
                  onClick={() => removeDrink(d.id)}
                  disabled={saving}
                  title="Delete"
                >
                  ✕
                </button>
              </span>
            ))}
            {drinks.length === 0 && !loading && (
              <span className="text-slate-400 italic">No drinks defined yet.</span>
            )}
          </div>
        )}
        {error && <div className="text-rose-500 mb-2">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
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
    const qty = Number(item?.quantity) || 1;
    const base = (Number(item?.price) || 0) * qty; // extras excluded
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
    const base = (Number(item?.price) || 0) * qty;
    return sum + base; // extras excluded
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
const discounted = totalWithExtras - calcOrderDiscount(editingPaymentOrder);
setSplitPayments([
  { method: editingPaymentOrder.payment_method || "Cash", amount: discounted },
]);


    };

    fetchSplit();
  }
  // eslint-disable-next-line
}, [showPaymentModal, editingPaymentOrder]);



useEffect(() => {
  secureFetch("/settings/integrations")
  .then(data => setAutoConfirmOrders(!!data.auto_confirm_orders))
  .catch(() => setAutoConfirmOrders(false));
}, []);

async function fetchDriverReport() {
  if (!selectedDriverId || !reportDate) return;
  setReportLoading(true);
  setDriverReport(null);
  try {
  const data = await secureFetch(`/orders/driver-report?driver_id=${selectedDriverId}&date=${reportDate}`);
setDriverReport(data);

  } catch (err) {
    setDriverReport({ error: "Failed to load driver report" });
  }
  setReportLoading(false);
}

useEffect(() => {
  fetchDriverReport();
}, [selectedDriverId, reportDate]);



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
  socket.on("order_closed", safeFetch);
// 👇 NEW — ensures late-fetch if the event came too early
socket.on("connect", () => {
  setTimeout(fetchOrders, 800);
});
  const interval = setInterval(fetchOrders, 15000);

  return () => {
    mounted = false;
    clearInterval(interval);
    socket.off("orders_updated", safeFetch);
    socket.off("order_closed", safeFetch);
    clearTimeout(debounceTimer);
  };
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

  const phoneOrders = data.filter(
    o => (o.order_type === "phone" || o.order_type === "packet") && o.status !== "closed"
  );

  const withKitchenStatus = [];
  for (const order of phoneOrders) {
    let items = await secureFetch(`/orders/${order.id}/items`);
    if (!items?.length) {
      await new Promise(r => setTimeout(r, 200));
      items = await secureFetch(`/orders/${order.id}/items`);
    }

    let overallKitchenStatus = "preparing";
    if (items.every(i => i.kitchen_status === "delivered")) overallKitchenStatus = "delivered";
    else if (items.some(i => i.kitchen_status === "ready")) overallKitchenStatus = "ready";

    withKitchenStatus.push({ ...order, items, overallKitchenStatus });
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
setDrivers(Array.isArray(data) ? data : data?.drivers || []);

  } catch {
    setDrivers([]);
  }
}

useEffect(() => {
  secureFetch("/kitchen/compile-settings")
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

// ✅ Pick up: allow as soon as all non-drink items are delivered
if (!order.driver_status && allNonDrinksDelivered) {
  await secureFetch(`/orders/${order.id}/driver-status`, {
    method: "PATCH",
    body: JSON.stringify({ driver_status: "on_road" }),
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



const safeOrders = Array.isArray(orders)
  ? orders.map(o => ({ ...o, items: o.items ?? [] }))
  : [];

return (

  <div className="min-h-screen pt-0 px-4 pb-4 w-full relative bg-[#f7f9fc] text-slate-900 transition-colors duration-300 space-y-8">

{/* --- HEADER & ACTIONS, Always Centered --- */}
<div className="w-full flex flex-col items-center justify-center pt-1 pb-0 min-h-[50px]">

  <div className="flex flex-col items-center justify-center w-full max-w-3xl">
    <div className="flex flex-col md:flex-row items-center justify-center gap-5 w-full">
      <select
        className="px-4 py-2 rounded-2xl text-base font-medium bg-white text-slate-900 border border-slate-200 shadow-sm focus:border-slate-400 focus:ring-slate-300 min-w-[180px]"
        value={selectedDriverId || ""}
        onChange={e => setSelectedDriverId(e.target.value)}
      >
        <option value="">{t("Select driver to view report")}</option>
        {drivers.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button
        className="px-6 py-2 rounded-2xl bg-slate-900 text-white font-semibold shadow hover:bg-slate-800 hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-40 transition"
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
        🛵<span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-lg border border-emerald-300 font-semibold">LIVE</span> {t("Route")}
      </button>
      <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-1 border border-slate-200 shadow-sm">
        <label className="font-semibold text-slate-600">{t("Date")}:</label>
        <input
          type="date"
          className="border border-slate-200 px-2 py-1 rounded text-lg bg-white text-slate-900 focus:border-slate-400 focus:ring-slate-300"
          value={reportDate}
          max={new Date().toISOString().slice(0,10)}
          onChange={e => setReportDate(e.target.value)}
          disabled={reportLoading}
        />
      </div>
    </div>
    <button
      className="mt-4 md:mt-0 md:absolute md:right-14 px-4 py-2 rounded-2xl bg-white text-slate-700 font-semibold border border-slate-200 shadow-sm hover:bg-slate-100 transition"
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
          <div className="rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] p-8 bg-white border border-slate-200 space-y-5">
            <div className="flex flex-wrap gap-10 items-center mb-3">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">Packets Delivered</div>
                <div className="text-4xl font-extrabold text-slate-900">{driverReport.packets_delivered}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">Total Sales</div>
                <div className="text-4xl font-extrabold text-slate-900">₺{driverReport.total_sales?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em]">By Payment Method</div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(driverReport.sales_by_method).map(([method, amt]) =>
                    <span key={method} className="bg-slate-100 border border-slate-200 shadow-sm px-3 py-1 rounded-lg font-semibold text-sm text-slate-700">
                      {method}: ₺{amt.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <thead>
  <tr>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Customer</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Address</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Total</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Payment</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Delivered At</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Pickup→Delivery</th>
    <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50">Kitchen→Delivery</th>
  </tr>
</thead>
<tbody>
  {driverReport.orders.map(ord => (
    <tr key={ord.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="p-3 text-slate-700">{ord.customer_name || "-"}</td>
      <td className="p-3 text-slate-500">{ord.customer_address || "-"}</td>
      <td className="p-3 text-slate-900 font-semibold">₺{parseFloat(ord.total).toFixed(2)}</td>
      <td className="p-3 text-slate-600">{ord.payment_method}</td>
      <td className="p-3 text-slate-500">{ord.delivered_at ? new Date(ord.delivered_at).toLocaleTimeString() : "-"}</td>
      <td className="p-3 text-slate-500">
        {ord.delivery_time_seconds
          ? (ord.delivery_time_seconds / 60).toFixed(1) + " min"
          : "-"}
      </td>
      <td className="p-3 text-slate-500">
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
          <div className="text-slate-500 text-sm">{t("Select a driver and date to see the report.")}</div>
        )}
      </div>
    )}

    {/* --- LIVE ROUTE MODAL --- */}
    {showRoute && (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-3xl relative shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 w-full max-w-6xl">
          <button
            onClick={() => setShowRoute(false)}
            className="absolute top-3 right-4 text-2xl text-slate-400 hover:text-rose-500 transition"
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

  const normalizeToken = (value = "") =>
    value.replace(/[\s\-]/g, "").toLowerCase();
  const normDrinks = drinksList.map(d => normalizeToken(d)).filter(Boolean);
  const isDrinkToken = (token) =>
    token &&
    (normDrinks.includes(token) || normDrinks.some(d => token.includes(d)));

  const totalDrinks = new Map();
  const customerGroups = new Map();
  const groupOrder = [];

  assignedOrders.forEach(order => {
    const customerRaw = (order.customer_name || "").trim();
    const groupKey = customerRaw ? customerRaw.toLowerCase() : `order-${order.id}`;

    if (!customerGroups.has(groupKey)) {
      customerGroups.set(groupKey, {
        key: groupKey,
        name: customerRaw || order.customer_name || "Customer",
        address: order.customer_address || "",
        drinks: new Map(),
      });
      groupOrder.push(groupKey);
    }

    const group = customerGroups.get(groupKey);
    if (!group.address && order.customer_address) {
      group.address = order.customer_address;
    }
    if ((!group.name || group.name === "Customer") && order.customer_name) {
      group.name = order.customer_name;
    }

    const recordDrink = (label, qty = 1) => {
      if (!label) return;
      const normalized = normalizeToken(label);
      if (!normalized) return;
      const amount = Number(qty) || 1;

      const groupEntry = group.drinks.get(normalized);
      if (groupEntry) {
        groupEntry.qty += amount;
        if (label.length > groupEntry.name.length) groupEntry.name = label;
      } else {
        group.drinks.set(normalized, { key: normalized, name: label, qty: amount });
      }

      const totalEntry = totalDrinks.get(normalized);
      if (totalEntry) {
        totalEntry.qty += amount;
        if (label.length > totalEntry.name.length) totalEntry.name = label;
      } else {
        totalDrinks.set(normalized, { key: normalized, name: label, qty: amount });
      }
    };

    (order.items || []).forEach(item => {
      const rawName =
        item.order_item_name ||
        item.external_product_name ||
        item.product_name ||
        "";
      const name = rawName.trim();
      const normName = normalizeToken(name);

      if (isDrinkToken(normName)) {
        recordDrink(name, Number(item.quantity || 1));
      }

      if (Array.isArray(item.extras)) {
        item.extras.forEach(ex => {
          const exName = (ex.name || "").trim();
          const normEx = normalizeToken(exName);

          if (isDrinkToken(normEx)) {
            recordDrink(exName, 1);
          }
        });
      }
    });
  });

  const clientBags = groupOrder.map(groupKey => {
    const group = customerGroups.get(groupKey);
    const drinkEntries = Array.from(group.drinks.values());
    const drinkBadges = drinkEntries.map(({ key, name, qty }) => (
      <span
        key={key}
        className="inline-flex items-center px-3 py-1 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-semibold tracking-tight"
      >
        {qty}× {name}
      </span>
    ));

    return (
      <div
        key={group.key}
        className="min-w-[180px] max-w-[220px] bg-white rounded-3xl shadow-[0_18px_30px_-22px_rgba(15,23,42,0.18)] border border-slate-200 flex flex-col justify-between px-4 py-3 mx-2 transition-transform duration-300 hover:-translate-y-1"
      >
        <div className="text-xs font-semibold text-slate-600 text-center truncate mb-1">
          {group.name || "Customer"}
        </div>
        <div className="flex flex-wrap justify-center gap-1 mb-2 min-h-[40px]">
          {drinkBadges.length > 0 ? drinkBadges : (
            <span className="italic text-slate-400">No drinks</span>
          )}
        </div>
        <div className="text-xs text-slate-500 text-center truncate">
          {group.address}
        </div>
      </div>
    );
  });

  const totalStr = Array.from(totalDrinks.values()).map(({ key, name, qty }) => (
    <span
      key={key}
      className="inline-flex items-center px-2 py-1 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 text-sm font-semibold"
    >
      {qty}× {name}
    </span>
  ));


  return (
    <div key={driver.id} className="mb-6 px-2">
      <div className="flex items-center gap-4 mb-2">
        <span className="text-lg font-semibold text-slate-800 tracking-tight">
          🧃 {driver.name}
        </span>
        <span className="ml-auto text-base font-medium text-emerald-700 flex flex-wrap gap-1">
          {totalStr}
        </span>
      </div>
      <div className="flex overflow-x-auto py-2 px-1 space-x-4 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {clientBags}
      </div>
    </div>
  );
})}






   {/* --- ORDERS LIST --- */}
<div className="min-h-screen p-6 w-full mx-auto relative bg-[#f7f9fc] text-slate-900 transition-colors duration-300">
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

      const statusVisual = (() => {
        const isPacketOrder = order.order_type === "packet";

        if (isDelivered) {
          return {
            card: "border-2 border-emerald-300 ring-4 ring-emerald-200/70 bg-gradient-to-br from-emerald-100 via-white to-white text-emerald-900 shadow-[0_35px_65px_-32px_rgba(16,185,129,0.45)]",
            header: "bg-white/80 border border-emerald-200 shadow-sm",
            timer: "bg-emerald-500 text-white border border-emerald-400 shadow-sm",
            nameChip: "bg-white text-emerald-700 border border-emerald-200 shadow-sm",
            phoneBtn: "bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-200 shadow-sm",
            statusChip: "bg-emerald-500 text-white border border-emerald-600 shadow-sm",
            priceTag: "text-emerald-700 bg-white/70 border border-emerald-200 shadow-sm",
            extrasRow: "bg-white/70 border border-emerald-200 text-emerald-700 shadow-sm",
            noteBox: "bg-white/75 border border-emerald-200 text-emerald-800 shadow-sm",
          };
        }
        if (isPicked) {
          return {
            card: "border-2 border-sky-400 ring-4 ring-sky-200/70 bg-gradient-to-br from-sky-100 via-white to-white text-slate-900 shadow-[0_35px_65px_-32px_rgba(56,189,248,0.45)]",
            header: "bg-white/80 border border-sky-200 shadow-sm",
            timer: "bg-sky-500 text-white border border-sky-400 shadow-sm",
            nameChip: "bg-white text-sky-700 border border-sky-200 shadow-sm",
            phoneBtn: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
            statusChip: "bg-sky-500 text-white border border-sky-600 shadow-sm",
            priceTag: "text-sky-700 bg-white/70 border border-sky-200 shadow-sm",
            extrasRow: "bg-white/70 border border-sky-200 text-sky-700 shadow-sm",
            noteBox: "bg-white/75 border border-sky-200 text-sky-800 shadow-sm",
          };
        }
        return {
          card: `border-2 ${isPacketOrder ? "border-fuchsia-400" : "border-slate-300"} ring-1 ring-slate-100 bg-white text-slate-900 shadow-[0_24px_50px_-32px_rgba(15,23,42,0.12)]`,
          header: "bg-slate-50 border border-slate-200 shadow-sm",
          timer: "bg-slate-100 text-slate-700 border border-slate-200 shadow-sm",
          nameChip: "bg-slate-100 text-slate-900 border border-slate-200 shadow-sm",
          phoneBtn: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm",
          statusChip: "bg-amber-100 text-amber-700 border border-amber-200 shadow-sm",
          priceTag: "text-emerald-700 bg-emerald-100 border border-emerald-200 shadow-sm",
          extrasRow: "bg-emerald-50 border border-emerald-200 text-emerald-700 shadow-sm",
          noteBox: "bg-rose-50 border border-rose-200 text-rose-700 shadow-sm",
        };
      })();

      const driverStatusLabel =
        order.driver_status === "on_road"
          ? "Driver On Road"
          : order.driver_status === "delivered"
          ? "Delivered"
          : "Awaiting Driver";

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
  className="flex flex-col gap-1 w-full pb-2 mb-3"
  style={{ minWidth: 0 }}
>
  {/* Top Row: Address + Timer */}
  <div className={`relative rounded-t-3xl px-6 py-4 flex items-start justify-between gap-4 transition-colors duration-500 ${statusVisual.header}`}>
  {/* Address + icon */}
  <div className="flex flex-col flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-2xl text-emerald-500">📍</span>
      <span
  className="
    text-2xl font-extrabold text-slate-900
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
  <span className="inline-flex items-center px-5 py-2 rounded-2xl bg-gradient-to-r from-pink-500 to-orange-400 text-white text-lg font-extrabold shadow gap-2 tracking-wider border border-pink-200" style={{ fontSize: '1.35rem', letterSpacing: 1 }}>
    Yemeksepeti
    <svg width="28" height="28" viewBox="0 0 24 24" className="inline -mt-0.5 ml-1"><circle cx="12" cy="12" r="12" fill="#FF3B30"/><text x="12" y="16" textAnchor="middle" fontSize="13" fill="#fff" fontWeight="bold">YS</text></svg>
  </span>
)}

    <span className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl font-mono font-semibold text-sm transition ${statusVisual.timer}`}>
  <span className="text-base opacity-80">⏰</span> {getWaitingTimer(order)}
</span>
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition ${statusVisual.statusChip}`}>
      {driverStatusLabel}
    </span>

  </div>



  </div>
  {/* Second Row: Customer + Statuses */}
  <div className="flex flex-wrap items-center gap-3 mt-1 w-full">
<div className="flex items-center gap-4 my-2">
<span className={`inline-flex items-center px-4 py-2 rounded-xl text-xl font-semibold transition ${statusVisual.nameChip}`}>
  <span className="mr-2">👤</span> {order.customer_name}
</span>

  {order.customer_phone && (
    <a
      href={`tel:${order.customer_phone}`}
      className={`inline-flex items-center px-3 py-2 rounded-xl font-semibold text-lg transition-transform duration-200 hover:-translate-y-0.5 ${statusVisual.phoneBtn}`}
      title="Click to call"
      style={{ textDecoration: 'none' }}
    >
      <svg className="mr-2" width="22" height="22" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1.003 1.003 0 011.11-.21c1.21.49 2.53.76 3.88.76.55 0 1 .45 1 1v3.5c0 .55-.45 1-1 1C7.72 22 2 16.28 2 9.5c0-.55.45-1 1-1H6.5c.55 0 1 .45 1 1 0 1.35.27 2.67.76 3.88.17.39.09.85-.21 1.11l-2.2 2.2z"/></svg>
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
      const res = await secureFetch(`/orders/${order.id}/confirm-online`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        return alert(`Confirm failed: ${err.error}`);
      } 
      const { order: updated } = await res.json();

      // Fetch items for this order
      const items = await secureFetch(`/orders/${order.id}/items`);


      setOrders(prev =>
        prev.map(o =>
          o.id === updated.id ? { ...updated, items } : o
        )
      );
    }}
    className="animate-pulse inline-flex items-center px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-lg shadow transition-all"
  >
    <span className="mr-2">⚡</span> Confirm Online Order
  </button>
)}

{/* SOLID "Confirmed" badge, never blinks */}
{!autoConfirmOrders && order.status === "confirmed" && (
  <span
    className="inline-flex items-center px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 font-semibold text-lg border border-emerald-300 shadow-sm"
    title="Order Confirmed"
  >
    <span className="mr-1">✅</span> Confirmed
  </span>
)}

{/* Auto-confirmed badge, always solid */}
{autoConfirmOrders && order.status === "confirmed" && (
  <span
    className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 font-semibold text-lg border border-emerald-300 shadow-sm"
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
    className="px-4 py-2 rounded-xl bg-white text-slate-700 font-medium border border-slate-200 shadow-sm hover:bg-slate-100 transition"
    onClick={async () => {
  // Fetch latest items (including extras) for this order!
  const items = await secureFetch(`/orders/${order.id}/items`);

  setEditingPaymentOrder({ ...order, items }); // set with freshest items+extras!
  setShowPaymentModal(true);
}}

  >
    Change/Add Payment
  </button>
)}


{order.status === "paid" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
    Paid
  </span>
)}
{order.status === "draft" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-slate-100 text-slate-500 border border-slate-200 shadow-sm">
    Draft
  </span>
)}
{order.status === "cancelled" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-rose-100 text-rose-700 border border-rose-200 shadow-sm">
    Cancelled
  </span>
)}
{order.status === "closed" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-slate-100 text-slate-600 border border-slate-200 shadow-sm">
    Closed
  </span>
)}


{/* Kitchen Status */}
{order.kitchen_status === "preparing" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-amber-100 text-amber-700 border border-amber-200 shadow-sm flex items-center gap-1">
    🍳 Preparing
  </span>
)}
{order.kitchen_status === "ready" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-orange-100 text-orange-700 border border-orange-200 shadow-sm flex items-center gap-1">
    🟠 Ready
  </span>
)}
{order.kitchen_status === "delivered" && (
  <span className="px-3 py-1 rounded-xl font-semibold text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm flex items-center gap-1">
    ✅ Delivered
  </span>
)}

  </div>


              {/* Items */}
              <details open className="w-full">
                <summary className="cursor-pointer flex items-center gap-2 text-base font-semibold select-none hover:underline">
                  <span className="text-xl">🛒</span>
                  Order Items <span className="text-sm opacity-60">({order.items?.length ?? 0})</span>
                </summary>
<ul className="pl-0 mt-2 flex flex-col gap-2">
  {(order.items ?? []).map((item, idx) => (
    <li
      key={item.unique_id || idx}
      className="flex flex-col gap-1 px-2 py-2 rounded-xl bg-slate-50 border border-slate-200 shadow-sm"
    >
      {/* Main Product Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block min-w-[28px] h-7 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 font-mono font-semibold text-base border border-emerald-200">
            {item.quantity}×
          </span>
          <span className="text-lg sm:text-xl font-semibold text-slate-900 break-words tracking-wide">
            {item.product_name || item.external_product_name || item.order_item_name || "Unnamed"}
          </span>


        </div>
        <div className="flex items-center gap-2">
          <span
            className={`
              flex items-center px-3 py-1 rounded-xl font-semibold text-sm tracking-wide border
              ${item.kitchen_status === "preparing" ? "bg-amber-100 text-amber-700 border-amber-200 animate-pulse" : ""}
              ${item.kitchen_status === "ready" ? "bg-orange-100 text-orange-700 border-orange-200 animate-pulse" : ""}
              ${item.kitchen_status === "delivered" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-white text-slate-600 border-slate-200"}
            `}
            style={{ minWidth: 100, textAlign: "center", letterSpacing: 0.5 }}
          >
            {item.kitchen_status === "preparing" && <>🍳 PREP</>}
            {item.kitchen_status === "ready" && <>🟠 READY</>}
            {item.kitchen_status === "delivered" && <>✅ READY</>}
          </span>
          <span className={`text-xl font-semibold font-mono ml-2 px-3 py-1 rounded-xl border transition ${statusVisual.priceTag}`}>
            ₺{Number(item.price).toFixed(2)}
          </span>
        </div>
        {order.estimated_ready_at && (
  <span className="inline-flex items-center gap-2 px-4 py-1 rounded-2xl bg-slate-100 text-slate-600 font-medium border border-slate-200 text-base">
    <span className="text-xl text-slate-500">⏰</span>
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
        className={`flex justify-between items-center px-3 py-1 rounded-xl text-base font-medium transition ${statusVisual.extrasRow}`}
        style={{ fontSize: "1.08em" }}
      >
        <span className="flex items-center gap-2 font-semibold">
          ➕ {ex.name}
          <span className="ml-2 font-semibold text-inherit text-lg tracking-wide" style={{letterSpacing: "0.5px"}}>
  ×{ex.quantity || 1}
</span>
        </span>
        <span className="font-mono">
          ₺{((ex.price || 0) * (ex.quantity || 1)).toFixed(2)}
        </span>
      </div>
    ))}
  </div>
)}

{/* --- NOTE: Always shows below the EXTRAS, with unique color --- */}
{item.note && (
  <div className={`ml-6 mt-2 px-3 py-1 rounded-xl font-medium italic flex items-center gap-2 text-base transition ${statusVisual.noteBox}`}>
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
        className="font-semibold font-mono text-slate-500 text-lg tracking-wide uppercase"
        style={{
          letterSpacing: 2,
          fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
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
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-2xl font-mono text-slate-800 text-lg shadow-sm tracking-tight"
              style={{
                fontSize: "1.05rem",
                letterSpacing: 0.8,
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
      <span className="font-semibold font-mono text-slate-500 text-lg tracking-wide mr-1 uppercase"
        style={{
          letterSpacing: 2,
          fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
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

   await secureFetch(`/orders/${order.id}`, {
  method: "PUT",
  body: JSON.stringify({
    driver_id: driverId,
    total: order.total,
    payment_method: order.payment_method,
  }),
});


    // Optimistically update local UI immediately
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, driver_id: driverId }
          : o
      )
    );

    setHighlightedOrderId(order.id);
    setTimeout(() => setHighlightedOrderId(null), 1200);
    if (!propOrders) await fetchOrders();
  }}
  className={`
    peer appearance-none px-4 pr-10 py-2 w-[140px]
    bg-white border border-slate-200 rounded-2xl font-mono text-slate-800 text-lg shadow-sm
    focus:ring-2 focus:ring-emerald-300/70 focus:border-emerald-300
    disabled:bg-slate-100 disabled:opacity-60
    transition-all
  `}
  disabled={isDelivered}
  style={{
    minWidth: 110,
    height: 44,
    fontSize: "1.05rem",
    letterSpacing: 1,
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

        <span className="pointer-events-none absolute right-4 top-1/2 transform -translate-y-1/2 text-emerald-400 text-xl">
          ▼
        </span>
      </div>
    </div>
  </div>
  {/* RIGHT: Discount (if any) above Total */}
  <div className="flex flex-col items-end min-w-[180px]">
    {totalDiscount > 0 && (
      <span className="font-semibold font-mono text-rose-600 text-lg px-4 py-1 bg-rose-100 rounded-xl border border-rose-200 shadow-sm mb-1 text-right flex justify-end items-center w-full">
        🎁 Discount: &nbsp; –₺{totalDiscount.toFixed(2)}
      </span>
    )}
    <span className="font-semibold font-mono text-emerald-700 text-lg px-4 py-1 bg-emerald-100 rounded-xl border border-emerald-200 shadow-sm text-right flex justify-end items-center w-full">
      Total: &nbsp; ₺{discountedTotal.toFixed(2)}
    </span>
  </div>
</div>


              {/* Action Buttons */}
              <div className="flex gap-3 mt-3">
                {!order.driver_status && (
                  <button
  className="flex-1 px-5 py-3 rounded-2xl font-semibold text-base bg-slate-900 hover:bg-slate-800 text-white shadow transition"
  disabled={driverButtonDisabled(order)}
  onClick={async () => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, driver_status: "on_road" }
          : o
      )
    );
  await secureFetch(`/orders/${order.id}/driver-status`, {
  method: "PATCH",
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
  className="flex-1 px-5 py-3 rounded-2xl font-semibold text-base bg-sky-500 hover:bg-sky-600 text-white shadow transition"
  onClick={async () => {
    setOrders(prev =>
      prev.map(o =>
        o.id === order.id
          ? { ...o, driver_status: "delivered" }
          : o
      )
    );
    await secureFetch(`/orders/${order.id}/driver-status`,  {      method: "PATCH",
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
  className="flex-1 px-5 py-3 rounded-2xl font-semibold text-base bg-emerald-500 hover:bg-emerald-600 text-white shadow transition"
    onClick={async () => {
      setOrders(prev =>
        prev.map(o =>
          o.id === order.id
            ? { ...o, status: "closed" }
            : o
        )
      );
      await secureFetch(`/orders/${order.id}/close`,{ method: "POST" });
      setOrders(prev => prev.filter(o => Number(o.id) !== Number(order.id)));
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
const grandTotal =
  calcOrderTotalWithExtras(editingPaymentOrder) -
  calcOrderDiscount(editingPaymentOrder);

    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300">
        <div className="relative bg-white rounded-3xl w-[94vw] max-w-md mx-auto p-7 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 animate-fade-in">
          {/* Close */}
          <button
            onClick={() => setShowPaymentModal(false)}
            className="absolute top-3 right-4 text-2xl text-slate-400 hover:text-emerald-500 transition"
            title="Close"
          >✕</button>
          {/* Title */}
          <div className="flex flex-col items-center mb-5">
            <div className="text-3xl font-semibold text-slate-900 mb-1">💸 Payment</div>
            <div className="text-sm font-medium text-slate-500 mb-2">Order #{editingPaymentOrder.id}</div>
            <div className="text-xs bg-slate-100 text-slate-500 rounded-xl px-4 py-1 font-medium tracking-[0.35em] uppercase border border-slate-200">
              Split between multiple payment methods if needed.
            </div>
          </div>
          {/* Split Payment Rows */}
          <div className="flex flex-col gap-3 mb-5">
            {splitPayments.map((pay, idx) => (
              <div key={idx} className="flex gap-3 items-center group animate-fade-in border-b border-slate-200 pb-2">
                <select
                  value={pay.method}
                  onChange={e => {
                    const copy = [...splitPayments];
                    copy[idx].method = e.target.value;
                    setSplitPayments(copy);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-medium text-base bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
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
                  className="w-28 rounded-xl border border-slate-200 px-4 py-2 text-base text-right font-mono bg-white text-slate-900 focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
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
                    className="ml-2 p-2 bg-slate-100 text-rose-500 rounded-full hover:bg-rose-100 border border-slate-200 transition"
                    onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}
                    title="Remove"
                  >–</button>
                )}
              </div>
            ))}
            <button
              className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium shadow transition-all"
              onClick={() => setSplitPayments([...splitPayments, { method: "Cash", amount: "" }])}
            >
              <span className="text-xl">+</span> Add Payment Method
            </button>
          </div>
          {/* Total Summary */}
          <div className="bg-slate-50 p-4 rounded-xl flex flex-col items-center gap-2 shadow-inner mb-2 border border-slate-200">
            <span className="text-lg font-semibold text-slate-700 flex gap-2 items-center">
              Grand Total:&nbsp;
              <span className="text-2xl text-slate-900 font-semibold font-mono tracking-wide">
                ₺{grandTotal.toFixed(2)}
              </span>
            </span>
            <span className="text-md text-slate-600 flex gap-2 items-center">
              Split Amount Paid:&nbsp;
              <span className="text-xl font-semibold text-slate-900 font-mono">
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
                    ? "text-amber-500"
                    : remaining < 0
                    ? "text-rose-500"
                    : "text-emerald-600"
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
              <span className="text-rose-500 text-sm mt-1 animate-pulse">Amounts must sum to order total.</span>
            )}
          </div>
          {/* Save/Cancel */}
          <div className="flex gap-3 justify-end mt-5">
            <button
              className="px-5 py-2 rounded-xl bg-white text-slate-600 font-medium border border-slate-200 hover:bg-slate-100"
              onClick={() => setShowPaymentModal(false)}
            >Cancel</button>
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
  splitPayments.forEach(p => {
    if (p.method && p.amount > 0) cleanedSplits[p.method] = Number(p.amount);
  });

  await secureFetch(`/orders/receipt-methods`, {

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

            <span className="text-slate-700 font-mono">
  ₺{(parseFloat(item.price) * item.quantity).toFixed(2)}
</span>

          </div>
          {/* --- EXTRAS --- */}


        </li>
      ))}
    </ul>
  );
}
