import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PhoneOrderModal from "../components/PhoneOrderModal";
import Orders from "../pages/Orders"; // adjust path as needed!
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import OrderHistory from "../components/OrderHistory";
const TOTAL_TABLES = 20;
 const API_URL = import.meta.env.VITE_API_URL || "";
const isDelayed = (order) => {
  if (!order || order.status !== "confirmed" || !order.created_at) return false;
  const created = new Date(order.created_at);
  const now = new Date();
  const diffMins = (now - created) / 1000 / 60;
  return diffMins > 1;
};

const getTableColor = (order) => {
  if (!order) return "bg-gray-300 text-black";

  // Confirmed but not yet paid
  if (order.status === "confirmed") return "bg-red-500 text-white";

  // Paid orders
  if (order.status === "paid") {
    const allDelivered = order.suborders?.every(sub => sub.kitchen_status === "delivered");
    return allDelivered
      ? "bg-green-500 text-white"
      : "bg-yellow-400 text-black"; // paid but not fully delivered
  }

  return "bg-gray-300 text-black";
};


const getDisplayTotal = (order) => {
  if (!order) return 0;

  if (order.receiptMethods?.length > 0) {
    return order.receiptMethods.reduce((sum, m) => sum + parseFloat(m.amount || 0), 0);
  }

  if (order.items?.some(i => !i.paid_at)) {
    return order.items.filter(i => !i.paid_at)
      .reduce((sum, i) => {
        const base = i.price * i.quantity;
        const extrasTotal = Array.isArray(i.extras)
          ? i.extras.reduce((extraSum, ex) => {
              const exQty = parseInt(ex.quantity || 1);
              const exPrice = parseFloat(ex.price || 0);
              return extraSum + exQty * exPrice;
            }, 0) * i.quantity // extras apply per product quantity
          : 0;
        return sum + base + extrasTotal;
      }, 0);
  }

  return parseFloat(order.total || 0);
};





export default function TableOverview() {
  useRegisterGuard();
  const [orders, setOrders] = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [groupedClosedOrders, setGroupedClosedOrders] = useState({});
  const [activeTab, setActiveTab] = useState("tables");
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const navigate = useNavigate();
  const alertIntervalRef = useRef(null);
  const [now, setNow] = useState(new Date());
  const [kitchenOrders, setKitchenOrders] = useState([]); // used for kitchen
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [phoneOrders, setPhoneOrders] = useState([]); // For active phone orders if you want to display/manage them
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [expectedCash, setExpectedCash] = useState(0);
  const [registerState, setRegisterState] = useState("loading");
  const [openingCash, setOpeningCash] = useState("");
  const [dailyCashExpense, setDailyCashExpense] = useState(undefined);
  const [yesterdayCloseCash, setYesterdayCloseCash] = useState(null);
  const [cashDataLoaded, setCashDataLoaded] = useState(false);
  const [lastOpenAt, setLastOpenAt] = useState(null);
  const canViewRegisterSummary = useHasPermission("settings-register-summary");
  const [packetOrders, setPacketOrders] = useState([]);
  const [showEntryForm, setShowEntryForm] = useState(false);
const [entryAmount, setEntryAmount] = useState("");
const [entryReason, setEntryReason] = useState("");
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [registerEntries, setRegisterEntries] = useState(0);
  const [showRegisterLog, setShowRegisterLog] = useState(false);
 
  const [todayRegisterEvents, setTodayRegisterEvents] = useState([]);
const [todayExpenses, setTodayExpenses] = useState([]);
useEffect(() => {
  if (!showRegisterModal) return;
  const today = new Date().toISOString().slice(0, 10);
  fetch(`${API_URL}/api/reports/expenses?from=${today}&to=${today}`)
    .then(res => res.json())
    .then(setTodayExpenses)
    .catch(() => setTodayExpenses([]));
}, [showRegisterModal]);

useEffect(() => {
  if (!showRegisterModal) return;
  const today = new Date().toISOString().slice(0, 10);
  fetch(`${API_URL}/api/reports/cash-register-events?from=${today}&to=${today}`)
    .then(res => res.json())
    .then(setTodayRegisterEvents)
    .catch(() => setTodayRegisterEvents([]));
}, [showRegisterModal]);

const [supplierCashPayments, setSupplierCashPayments] = useState([]);
const [staffCashPayments, setStaffCashPayments] = useState([]);

useEffect(() => {
  if (!showRegisterModal) return;
  const today = new Date().toISOString().slice(0, 10);

  fetch(`${API_URL}/api/reports/supplier-cash-payments?from=${today}&to=${today}`)
    .then(res => res.json())
    .then(setSupplierCashPayments)
    .catch(() => setSupplierCashPayments([]));

  fetch(`${API_URL}/api/reports/staff-cash-payments?from=${today}&to=${today}`)
    .then(res => res.json())
    .then(setStaffCashPayments)
    .catch(() => setStaffCashPayments([]));
}, [showRegisterModal]);


const groupByDate = (orders) => {
  return orders.reduce((acc, order) => {
    const dateKey = order.created_at?.slice(0, 10) || "Unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(order);
    return acc;
  }, {});
};
  // Only allow users with "settings" permission
  const hasSettingsAccess = useHasPermission("settings");
  if (!hasSettingsAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Settings.")}
      </div>
    );
  }
const TAB_LIST = [
  { id: "tables", label: "Tables", icon: "🍽️" },
  { id: "kitchen", label: "Kitchen", icon: "👨‍🍳" },
  { id: "history", label: "History", icon: "📘" },
  { id: "packet", label: "Packet", icon: "🛵" },
  { id: "phone", label: "Phone", icon: "📞" },
  { id: "register", label: "Register", icon: "💵" }
];
const visibleTabs = TAB_LIST.filter(tab =>
  tab.id === "register"
    ? useHasPermission("table-register")
    : useHasPermission(tab.id)
);

const combinedEvents = [
  ...(todayRegisterEvents || []),
  ...(todayExpenses || []).map(e => ({
    type: "expense",
    amount: e.amount,
    note: e.note,
    created_at: e.created_at
  })),
  ...(supplierCashPayments || []),
  ...(staffCashPayments || []),
].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));



const refreshRegisterState = () => {
  fetch(`${API_URL}/api/reports/cash-register-status`)
    .then(async (res) => {
      if (!res.ok) throw new Error("Bad response from /cash-register-status");
      return await res.json();
    })
    .then((data) => {
      console.log("📥 /cash-register-status response:", data);

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      if (data.status === "open") {
        const opening = data.opening_cash?.toString() ?? "";
        setOpeningCash(opening);
        console.log("🔓 Register is OPEN, Opening Cash:", opening);
      } else {
        setOpeningCash("");
        console.log("🔐 Register is NOT open");
      }

      setActualCash("");
    })
    .catch((err) => {
      console.error("❌ Failed to refresh register state:", err);
      toast.error("Could not load register status");
    });
};


const fetchPacketOrders = async () => {
  try {
    // Fetch both packet and phone orders
    const [resPacket, resPhone] = await Promise.all([
      fetch(`${API_URL}/api/orders?type=packet`),
      fetch(`${API_URL}/api/orders?type=phone`),
    ]);
    const packet = await resPacket.json();
    const phone = await resPhone.json();
    const data = [...packet, ...phone];

    // Only keep orders that are not closed
    const ordersWithItems = await Promise.all(
      data.filter((o) => o.status !== "closed").map(async (order) => {
        const itemRes = await fetch(`${API_URL}/api/orders/${order.id}/items`);
        const itemsRaw = await itemRes.json();
        const items = itemsRaw.map(item => ({
          ...item,
          discount_type: item.discount_type || item.discountType || null,
          discount_value: item.discount_value != null
            ? parseFloat(item.discount_value)
            : item.discountValue != null
            ? parseFloat(item.discountValue)
            : 0,
        }));

        // Fetch receipt methods for split payments
        let receiptMethods = [];
        if (order.receipt_id) {
          try {
            const res = await fetch(`${API_URL}/api/orders/receipt-methods/${order.receipt_id}`);
            if (res.ok) {
              receiptMethods = await res.json();
            }
          } catch (e) {
            console.warn("Failed to fetch receipt methods for order", order.id);
          }
        }

        return { ...order, items, receiptMethods };
      })
    );

    setPacketOrders(ordersWithItems);
  } catch (err) {
    console.error("Fetch packet orders failed:", err);
  }
};



useEffect(() => {
  if (activeTab === "packet") fetchPacketOrders();
}, [activeTab]);

useEffect(() => {
  function refetch() {
    setTimeout(() => {
      if (activeTab === "tables") fetchOrders();
      if (activeTab === "kitchen") fetchKitchenOrders();
      if (activeTab === "history") fetchClosedOrders();
      if (activeTab === "phone") fetchPhoneOrders();
      if (activeTab === "packet") fetchPacketOrders();
    }, 300);
  }
  if (!window.socket) return;
  window.socket.on("orders_updated", refetch);
  return () => window.socket && window.socket.off("orders_updated", refetch);
}, [activeTab]);



useEffect(() => {
  if (!showRegisterModal) return;
  const todayStr = new Date().toISOString().slice(0, 10);

  fetch(`${API_URL}/api/reports/cash-register-history?from=${todayStr}&to=${todayStr}`)
    .then(res => res.json())
    .then(data => {
      // Find today’s row
      const todayRow = data.find(row => row.date === todayStr);
      setRegisterEntries(todayRow?.register_entries ? Number(todayRow.register_entries) : 0);
    })
    .catch(err => {
      console.error("❌ Failed to fetch register entries:", err);
      setRegisterEntries(0);
    });
}, [showRegisterModal]);

useEffect(() => {
  fetch(`${API_URL}/api/reports/cash-register-status`)
    .then(async (res) => {
      if (!res.ok) throw new Error("Bad response from /cash-register-status");
      const data = await res.json();

      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);

      if (data.status === "open" || data.status === "closed") {
  setOpeningCash(""); // <-- Always start blank
  setYesterdayCloseCash(data.yesterday_close ?? null);
}


      setActualCash("");
    })
    .catch((err) => {
      console.error("❌ Failed to refresh register state:", err);
      toast.error("Could not load register status");
    });
}, []);



useEffect(() => {
  if (!showRegisterModal) return;

  setCashDataLoaded(false);
  setExpectedCash(0);
  setDailyCashExpense(0);
  setActualCash("");
  setRegisterState("loading");

  let openTime = null;

  

  fetch(`${API_URL}/api/reports/cash-register-status`)
    .then((res) => res.json())
    .then((data) => {
      setRegisterState(data.status);
      setYesterdayCloseCash(data.yesterday_close ?? null);
      setLastOpenAt(data.last_open_at || null);
      setOpeningCash("");
      if (data.status === "open" || data.status === "closed") {
        openTime = data.last_open_at;
        const opening =
          data.opening_cash !== undefined && data.opening_cash !== null
            ? data.opening_cash.toString()
            : "";
        setOpeningCash(opening);
      }

      return fetch(`${API_URL}/api/reports/daily-cash-total?openTime=${encodeURIComponent(openTime)}`);

    })
    .then((res) => res.json())
    .then((data) => {
      console.log("💰 New Expected Cash:", data.cash_total);
      setExpectedCash(data.cash_total || 0);

      if (!openTime) {
        console.log("ℹ️ Skipping expense fetch - no open timestamp yet");
        setDailyCashExpense(0);
        setCashDataLoaded(true);
        return null; // 💡 FIX: stop the chain properly
      }
      

return fetch(`${API_URL}/api/reports/daily-cash-expenses?openTime=${encodeURIComponent(openTime)}`);
})
.then((res) => {
  if (!res) return;
  return res.json();
})
.then(async (data) => {
  if (!data) return;
  const logExpense = parseFloat(data[0]?.total_expense || 0);

  // 🔄 Fetch additional general expenses from /expenses for today
  const today = new Date().toISOString().slice(0, 10);
  const extraExpenses = await fetch(`${API_URL}/api/expenses?from=${today}&to=${today}`)
    .then(r => r.json())
    .then(rows => rows.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0))
    .catch(() => 0);

  const totalExpense = logExpense + extraExpenses;

  console.log("📉 New Daily Cash Expense (log + expenses):", totalExpense);
  setDailyCashExpense(totalExpense);
  setCashDataLoaded(true);
  console.log("✅ All cash data loaded");
})

    .catch((err) => {
      console.error("❌ Error in modal init:", err);
      toast.error("Failed to load register data");
    });
}, [showRegisterModal]);









const location = useLocation();
useEffect(() => {
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  if (tab) setActiveTab(tab);
}, [location]);





useEffect(() => {
  const today = new Date().toISOString().split("T")[0];
  setFromDate(today);
  setToDate(today);
}, []);

const fetchOrders = async () => {
  try {
    const res = await fetch(`${API_URL}/api/orders`)
;
    const data = await res.json();

    const openOrders = data
      .filter((o) => o.status !== "closed")
      .map((order) => ({
        ...order,
        total: order.status === "paid" ? 0 : parseFloat(order.total || 0)
      }));

    const ordersWithItems = await Promise.all(
      openOrders.map(async (order) => {
        const itemRes = await fetch(`${API_URL}/api/orders/${order.id}/items`);
        const itemsRaw = await itemRes.json();
const items = itemsRaw.map(item => ({
  ...item,
  discount_type: item.discount_type || item.discountType || null,
  discount_value:
    item.discount_value != null
      ? parseFloat(item.discount_value)
      : item.discountValue != null
      ? parseFloat(item.discountValue)
      : 0,
}));


        return { ...order, items };
      })
    );

    setOrders(ordersWithItems);
  } catch (err) {
    console.error("Fetch open orders failed:", err);
  }
};



function hasReadyOrder(order) {
  // If any item in the order is ready and not delivered
  return (
    Array.isArray(order?.items)
      ? order.items.some(item => item.kitchen_status === "ready")
      : false
  );
}


const fetchClosedOrders = async () => {
  const query = new URLSearchParams();
  if (fromDate) query.append("from", fromDate);
  if (toDate) query.append("to", toDate);

  try {
    const res = await fetch(`${API_URL}/api/reports/history?${query.toString()}`);
    const data = await res.json();

    const enriched = await Promise.all(
      data.map(async (order) => {
        const itemRes = await fetch(`${API_URL}/api/orders/${order.id}/items`);
        const itemsRaw = await itemRes.json();
     const items = itemsRaw.map(item => ({
  ...item,
  discount_type: item.discount_type || null,
  discount_value: item.discount_value ? parseFloat(item.discount_value) : 0,
  name: item.product_name || item.order_item_name || item.external_product_name || "Unnamed"
}));

        const subRes = await fetch(`${API_URL}/api/orders/${order.id}/suborders`);
        const suborders = await subRes.json();

        const receiptIds = [
          ...new Set([
            order.receipt_id,
            ...items.map(i => i.receipt_id).filter(Boolean),
            ...suborders.map(s => s.receipt_id).filter(Boolean)
          ].filter(Boolean))
        ];

        let receiptMethods = [];
        for (const receiptId of receiptIds) {
          const r = await fetch(`${API_URL}/api/reports/receipt-methods/${receiptId}`);
          const methods = await r.json();
          receiptMethods.push(...methods);
        }

        return { ...order, items, suborders, receiptMethods };
      })
    );

    const nonEmptyOrders = enriched.filter(order => Array.isArray(order.items));

    const grouped = nonEmptyOrders.reduce((acc, order) => {
      const date = new Date(order.created_at).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(order);
      return acc;
    }, {});

    setClosedOrders(nonEmptyOrders);
    setGroupedClosedOrders(grouped);
    console.log("✅ Closed orders loaded:", nonEmptyOrders);
  } catch (err) {
    console.error("❌ Fetch closed orders failed:", err);
    toast.error("Failed to load order history");
  }
};



   const fetchKitchenOrders = async () => {
  try {
    const res = await fetch(`${API_URL}/api/kitchen-orders`);
    const data = await res.json();

    const active = data.filter(
      (item) =>
        item.kitchen_status !== "delivered" &&
        item.kitchen_status !== null &&
        item.kitchen_status !== ""
    );

    console.log("🍽️ Active Kitchen Orders:", active.map(i => ({
      id: i.item_id,
      status: i.kitchen_status,
      table: i.table_number
    })));

    setKitchenOrders(active);
  } catch (err) {
    console.error("❌ Fetch kitchen orders failed:", err);
  }
};





    useEffect(() => {
  if (activeTab === "kitchen" || activeTab === "open") {
    fetchKitchenOrders();
  }
}, [activeTab]);


  useEffect(() => {
  if (activeTab === "tables") fetchOrders(); // only fetch full orders when viewing tables
  if (activeTab === "open") fetchKitchenOrders(); // fetch only kitchen orders for open tab
  if (activeTab === "history") fetchClosedOrders();
}, [activeTab, fromDate, toDate]);


  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

    useEffect(() => {
  if (activeTab === "phone") {
    fetchPhoneOrders();
  }
}, [activeTab]);

const fetchPhoneOrders = async () => {
  try {
    const res = await fetch(`${API_URL}/orders?type=phone`);
    const data = await res.json();
    // Filter for open phone orders (not closed)
    setPhoneOrders(data.filter((o) => o.order_type === "phone" && o.status !== "closed"));
  } catch (err) {
    console.error("Fetch phone orders failed:", err);
  }
};

  const tables = Array.from({ length: TOTAL_TABLES }, (_, i) => {
    const tableNumber = i + 1;
    const order = orders.find((o) => o.table_number === tableNumber);
    return { tableNumber, order };
  });



const handleTableClick = async (table) => {
  // Always check register state before allowing navigation
  const res = await fetch(`${API_URL}/api/reports/cash-register-status`);
  const data = await res.json();

  if (data.status === "closed" || data.status === "unopened") {
    toast.error("Register must be open to access tables!", {
      position: "top-center",
      autoClose: 2500,
      hideProgressBar: false,
    });
    // Optionally, open the register modal here:
    setShowRegisterModal(true);
    return;
  }

  // ... existing logic:
if (!table.order) {
  try {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table_number: table.tableNumber,
        total: 0,
        order_type: "table", // ✅ ALWAYS INCLUDE THIS!
      }),
    });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Order creation failed");
        return;
      }

      const newOrder = await res.json();
      navigate(`/transaction/${table.tableNumber}`, { state: { order: newOrder } });
    } catch (err) {
      console.error("Create order failed:", err);
    }
  } else {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
  }
};



  const getTimeElapsed = (order) => {
    if (!order?.created_at || order.status !== "confirmed") return null;
    const created = new Date(order.created_at);
    const diff = now - created;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };



 const markMultipleAsDelivered = async (itemIds) => {
  try {
    new Audio("/sound-ready.mp3").play(); // 🔊 Play instantly
    await fetch(`${API_URL}/order-items/kitchen-status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: itemIds, status: "delivered" }),
    });
    fetchKitchenOrders();
  } catch (err) {
    console.error("❌ Failed to mark as delivered:", err);
  }
};

useEffect(() => {
  fetch(`${API_URL}/api/reports/cash-register-status`)
    .then(res => res.json())
    .then(data => {
      setRegisterState(data.status);
       setOpeningCash("");
      if (
        (location.pathname.startsWith("/tableoverview") ||
         location.pathname.startsWith("/transaction")) &&
        (data.status === "closed" || data.status === "unopened")
      ) {
        toast.error("Register must be open to access this page!", {
          position: "top-center",
          autoClose: 2500,
          hideProgressBar: false,
        });
        navigate("/Dashboard"); // or any safe page
      }
    });
}, [location.pathname, navigate]);



  const groupedByTable = orders.reduce((acc, item) => {
  const table = item.table_number;
  if (!acc[table]) acc[table] = [];
  acc[table].push(item);
  return acc;
}, {});

  function safeParse(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : data || [];
  } catch {
    return [];
  }
}


  // --- RETURN (NEW UI) ---
  return (
    <div className="min-h-screen bg-transparent px-0 pt-4 relative">


      {/* MODERN NAV TABS */}
      <div className="flex justify-center gap-3 flex-wrap mb-10">
        {visibleTabs.map((tab) => (

          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === "phone") setShowPhoneOrderModal(true);
              else if (tab.id === "register") setShowRegisterModal(true);
              else setActiveTab(tab.id);
            }}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-full font-bold text-lg shadow-xl
              transition-all duration-200 backdrop-blur
              ${
                activeTab === tab.id
                  ? "bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-400 text-white scale-105 shadow-2xl"
                  : "bg-white/80 dark:bg-gray-800/80 text-gray-800 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-gray-700"
              }
              ring-1 ring-inset ring-white/40 dark:ring-black/30 hover:scale-105
            `}
            style={{ minWidth: 130 }}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="">{t(tab.label)}</span>
          </button>
        ))}
      </div>

      {/* TABS CONTENT */}
      {activeTab === "tables" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-7 px-8">
          {tables.map((table) => {

            return (
<div
  key={table.tableNumber}
  onClick={() => handleTableClick(table)}
  className={`
    group relative cursor-pointer p-6 rounded-[2.5rem]
    ${getTableColor(table.order)}
    shadow-2xl hover:shadow-accent/50 hover:scale-[1.035] transition-all
    duration-200 border-4 border-white/30 flex flex-col justify-between

    hover:z-30
  `}
  style={{
    minHeight: "200px",
    boxShadow: "0 3px 16px 0 rgba(30,34,90,0.08)"

  }}
>
  {/* Top Row: Table Number and Timer */}
  <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
  <span className="text-gray-800 dark:text-gray-100 text-lg font-bold">{t("Table")}</span>
  <span className="text-lg font-bold text-blue-500 bg-white/60 rounded-xl px-2">
    {table.tableNumber <= 9 ? `0${table.tableNumber}` : table.tableNumber}
  </span>
</div>

    {table.order?.status === "confirmed" && (
      <span className="bg-blue-600 text-white rounded-xl px-3 py-1 font-mono text-sm shadow-md animate-pulse">
        ⏱ {getTimeElapsed(table.order)}
      </span>
    )}
  </div>

  <div className="flex flex-col gap-2 flex-grow">
    {
      // If no order at all, show Free
      !table.order
      // If order exists but has NO items, show Free (NOT draft)
      || (table.order && (!table.order.items || table.order.items.length === 0))
      ? (
        <span className="inline-block px-4 py-1 rounded-full bg-gradient-to-r from-green-300 via-green-200 to-green-100 text-green-900 font-extrabold text-base shadow">
          {t("Free")}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-2">
    <span className="uppercase font-extrabold tracking-wide text-white">
  {t(table.order.status === "draft" ? "Free" : table.order.status)}
</span>

          </div>
          {/* Kitchen Status Badges */}
          {table.order && table.order.items && table.order.items.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {["new", "preparing", "ready", "delivered"].map((status) => {
                const count = table.order.items.filter(
                  (item) => item.kitchen_status === status
                ).length;
                if (!count) return null;
                return (
                  <span
                    key={status}
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold
                      ${status === "preparing" ? "bg-yellow-400 text-white" :
                        status === "ready" ? "bg-blue-500 text-white" :
                        status === "delivered" ? "bg-green-500 text-white" :
                        status === "new" ? "bg-gray-400 text-white" :
                        "bg-gray-300 text-black"}
                    `}
                  >
                    {count} {t(status)}
                  </span>
                );
              })}
            </div>
          )}
        </>
      )
    }
  </div>


  {/* Bottom Row: Total and "Over 1 min" alert */}
  <div className="flex items-end justify-between mt-2">
    {isDelayed(table.order) && (
      <span className="text-yellow-500 font-bold animate-pulse drop-shadow">
        ⚠️
      </span>
    )}
 <span className="text-lg font-bold text-indigo-700 dark:text-indigo-200 tracking-wide ml-auto">
  ₺{getDisplayTotal(table.order).toFixed(2)}
</span>

     </div>
              </div>
            );
          })}
        </div>
      )}




    {/* --- Modal --- */}
    {showPhoneOrderModal && (
      <PhoneOrderModal
        open={showPhoneOrderModal}
        onClose={() => setShowPhoneOrderModal(false)}
onCreateOrder={() => {
  setShowPhoneOrderModal(false);
  setActiveTab("tables");
  setTimeout(() => {
    setActiveTab("packet");
    // Give the tab a moment to switch, then fetch
    setTimeout(fetchPacketOrders, 100);
  }, 250);
}}




      />
    )}

    {activeTab === "phone" && <Orders />}
    {activeTab === "packet" && <Orders hideModal={true} orders={packetOrders} />}


{activeTab === "history" && (
      <OrderHistory
        fromDate={fromDate}
        toDate={toDate}
        paymentFilter={paymentFilter}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setPaymentFilter={setPaymentFilter}
      />
    )}

{activeTab === "kitchen" && (
  <div className="px-3 md:px-8 py-6">
    <h2 className="text-3xl font-extrabold bg-gradient-to-r from-indigo-500 via-blue-400 to-pink-500 text-transparent bg-clip-text mb-6">
      👨‍🍳 {t('Kitchen Orders')}
    </h2>
    {kitchenOrders.length === 0 ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-6xl mb-3">🥲</span>
        <span className="text-xl text-gray-400 font-semibold">{t("No kitchen orders in progress.")}</span>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
        {kitchenOrders.map(item => (
          <div
            key={item.item_id}
            className="rounded-3xl bg-gradient-to-br from-white/80 via-blue-50 to-indigo-50 border border-white/40 shadow-xl p-5 flex flex-col gap-3 hover:scale-[1.03] hover:shadow-2xl transition"
          >
            <div className="flex justify-between items-center">
<div className="font-bold text-lg text-blue-800 flex flex-col">
  {String(item.order_type || "").trim().toLowerCase() === "phone" ? (
    <>
      <span>📞 {item.customer_name || item.customer_phone}</span>
      {item.customer_address && (
        <span className="text-xs text-green-700">{item.customer_address}</span>
      )}
      <span className="ml-1 px-2 py-0.5 rounded bg-blue-200 text-blue-800 text-xs font-bold">Phone</span>
    </>
  ) : String(item.order_type || "").trim().toLowerCase() === "packet" ? (
    <>
      <span>🛵 {item.customer_name || "Online Order"}</span>
      {item.customer_address && (
        <span className="text-xs text-green-700">{item.customer_address}</span>
      )}
      {/* Platform badge */}
      <span className="ml-1 px-2 py-0.5 rounded bg-orange-200 text-orange-800 text-xs font-bold">
        {item.external_id ? "Yemeksepeti" : "Packet"}
      </span>
    </>
  ) : (
    <>
      <span>🍽 {t("Table")} {item.table_number}</span>
      <span className="ml-1 px-2 py-0.5 rounded bg-indigo-200 text-indigo-800 text-xs font-bold">Table</span>
    </>
  )}
</div>

              <div className={`px-2 py-1 rounded-full text-xs font-bold
                ${item.kitchen_status === "preparing" ? "bg-yellow-400 text-white" :
                  item.kitchen_status === "ready" ? "bg-blue-500 text-white" :
                  item.kitchen_status === "delivered" ? "bg-green-500 text-white" :
                  "bg-gray-300 text-black"}`}>
                {t(item.kitchen_status || "new")}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-gray-800 text-base">
              <span className="font-semibold">{item.product_name}</span>
              <span>{t("Qty")}: {item.quantity}</span>
              {item.note && (
                <span className="text-xs bg-yellow-100 text-yellow-900 rounded px-2 py-1 mt-1">📝 {item.note}</span>
              )}
{item.extras && Array.isArray(item.extras) && item.extras.length > 0 && (
  <ul className="text-xs mt-2 ml-3 text-blue-700">
    {item.extras.map((ex, idx) => {
      const itemQty = parseInt(item.quantity || item.qty || 1);
      const extraQty = parseInt(ex.quantity || ex.qty || 1);
      const lineQty = itemQty * extraQty;
      const unitPrice = parseFloat(ex.price || 0);
      const total = (lineQty * unitPrice).toFixed(2);
      return (
        <li key={idx} className="flex items-center gap-2">
          <span>
            ➕
            {extraQty > 1 ? ` ${extraQty}x ` : " "}
            {ex.name}
          </span>
          <span className="text-gray-500">
            @ ₺{unitPrice.toFixed(2)}
          </span>
          <span className="ml-2 text-blue-900 font-semibold">
            ₺{total}
          </span>
        </li>
      );
    })}
  </ul>
)}


            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}


{showRegisterModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all">
    <div
      className={`
        relative bg-gradient-to-br from-white/90 via-indigo-50 to-blue-100
        dark:from-gray-900 dark:via-slate-900 dark:to-gray-800
        rounded-3xl shadow-2xl mx-3 w-full max-w-[520px] max-h-[90vh] overflow-y-auto
        p-8 animate-fade-in
        border-4 border-white/50 dark:border-black/20
      `}
      style={{
        boxShadow: "0 12px 60px 0 rgba(30,34,90,0.18)",
      }}
    >
      {/* Close Button */}
      <button
        onClick={() => setShowRegisterModal(false)}
        className="absolute top-5 right-5 text-2xl text-gray-400 hover:text-indigo-700 transition-all hover:-translate-y-1"
        title={t("Close")}
        aria-label="Close"
        tabIndex={0}
      >
        <span className="block bg-white/80 dark:bg-gray-800/70 rounded-full p-2 shadow hover:shadow-xl">✕</span>
      </button>

      {/* Title */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-3xl bg-gradient-to-r from-blue-500 via-fuchsia-400 to-indigo-400 text-white rounded-full p-3 shadow-md">💵</span>
        <h2 className="text-2xl md:text-3xl font-extrabold bg-gradient-to-r from-blue-600 via-fuchsia-600 to-indigo-600 text-transparent bg-clip-text tracking-tight">
          {registerState === "unopened" || registerState === "closed"
            ? t('Open Register')
            : t('Register Summary')}
        </h2>
      </div>
      <div className="h-[2px] w-full bg-gradient-to-r from-blue-200 via-indigo-300 to-fuchsia-200 rounded-full mb-5 opacity-60" />


      {/* Modal Content */}
      {!cashDataLoaded ? (
        <p className="text-center text-gray-500 font-semibold">{t('Loading register data...')}</p>
      ) : registerState === "closed" || registerState === "unopened" ? (
        <>
          {/* Opening Cash Entry */}
          <div className="mb-8">
            <label className="block text-base font-semibold text-gray-700 mb-2">
              💼 {t('Opening Cash')}
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              className="w-full p-5 rounded-2xl border-2 border-blue-300 text-lg shadow-lg focus:border-blue-500 outline-none transition"
              placeholder="₺0.00"
            />
            {yesterdayCloseCash !== null && (
              <div className="text-blue-700 text-sm mt-2">
                🔒 Last Closing: ₺{parseFloat(yesterdayCloseCash).toFixed(2)}
              </div>
            )}
          </div>
          {/* Comparison Card */}
          {openingCash !== "" && yesterdayCloseCash !== null && (
            <div className="bg-gradient-to-r from-white via-blue-50 to-indigo-50 border border-gray-200 rounded-3xl p-5 mt-2 shadow-md space-y-2">
              <div className="flex justify-between items-center font-semibold">
                <span>💼 {t("Opening")}</span>
                <span className="text-green-700 tabular-nums">₺{parseFloat(openingCash).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center font-semibold">
                <span>🔒 {t("Last Closing")}</span>
                <span className="text-blue-700 tabular-nums">₺{parseFloat(yesterdayCloseCash).toFixed(2)}</span>
              </div>
              <div className={`flex justify-between items-center font-semibold ${
                parseFloat(openingCash) !== parseFloat(yesterdayCloseCash)
                  ? "text-red-600"
                  : "text-green-600"
              }`}>
                <span>🔁 {t("Difference")}</span>
                <span>
                  ₺{(parseFloat(openingCash) - parseFloat(yesterdayCloseCash)).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (() => {
        // Summary content (register is open)
        const expected = Number(expectedCash || 0);
const expense = Number(dailyCashExpense || 0);
const opening = Number(openingCash || 0);

// ✅ calculate entries directly from combinedEvents
const entryTotal = combinedEvents
  .filter(ev => ev.type === "entry")
  .reduce((sum, ev) => sum + parseFloat(ev.amount || 0), 0);

const netCash = opening + expected + entryTotal - expense;


        return (
          <>
            {/* Summary Card */}
            <div className="bg-white/80 border border-gray-200 rounded-3xl p-6 shadow-xl mb-7">
              <div className="space-y-4 text-base font-semibold">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-green-700"><span className="bg-green-400 text-white rounded-full px-2 py-1">💼</span> {t('Opening')}</span>
                  <span className="tabular-nums text-green-800">₺{opening.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-yellow-700"><span className="bg-yellow-400 text-white rounded-full px-2 py-1">💰</span> {t('Cash Sales')}</span>
                  <span className="tabular-nums text-yellow-800">₺{expected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-orange-700"><span className="bg-orange-400 text-white rounded-full px-2 py-1">📉</span> {t('Cash Expenses')}</span>
                  <span className="tabular-nums text-orange-800">₺{expense.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
  <span className="flex items-center gap-2 text-lime-700">
    <span className="bg-lime-400 text-white rounded-full px-2 py-1">➕</span> {t('Cash Entries')}
  </span>
  <span className="tabular-nums text-lime-800">₺{entryTotal.toFixed(2)}</span>
</div>

                <div className="h-[1px] w-full bg-gradient-to-r from-blue-200 to-fuchsia-200 rounded-full opacity-60 my-3" />
                <div className="flex justify-between items-center text-lg">
                  <span className="flex items-center gap-2 text-blue-900 font-bold">
                    <span className="bg-blue-600 text-white rounded-full px-2 py-1">🧮</span>
                    {t('Net Expected Cash')}
                  </span>
                  <span className="tabular-nums text-blue-900 font-extrabold text-2xl">
                    ₺{netCash.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            {/* Actual Cash Input */}
            <div className="mb-7">
              <label className="block text-base font-semibold text-gray-800 mb-2">
                🔢 {t('Actual Counted Cash')}
              </label>
              <input
                type="number"
                value={actualCash}
                onChange={e => setActualCash(e.target.value)}
                className={`
                  w-full p-5 rounded-2xl border-2 text-lg shadow-lg outline-none transition
                  ${actualCash === ""
                    ? "border-gray-300"
                    : parseFloat(actualCash) === netCash
                    ? "border-green-500"
                    : "border-red-500"}
                `}
                placeholder="₺0.00"
              />
              {actualCash && (
                parseFloat(actualCash) === netCash
                  ? <p className="text-green-600 font-semibold mt-2">{t('Cash matches perfectly.')}</p>
                  : <p className="text-red-600 font-semibold mt-2">
                      ❌ {t('Difference')}: ₺{Math.abs(parseFloat(actualCash) - netCash).toFixed(2)}
                    </p>
              )}
            </div>
           {registerState === "open" && (
  <div className="mb-7">
    {/* Toggle Entry Form */}
    <button
      type="button"
      onClick={() => setShowEntryForm(v => !v)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl font-semibold mb-3
        transition-all shadow
        ${showEntryForm ? 'bg-lime-200 text-lime-900' : 'bg-gray-100 text-gray-700 hover:bg-lime-100'}
      `}
    >
      <span>{showEntryForm ? "Hide Cash Entry" : "➕ Add Cash Entry"}</span>
      <span className="text-lg">{showEntryForm ? "▲" : "▼"}</span>
    </button>
    {/* Entry Form */}
    {showEntryForm && (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!entryAmount || isNaN(entryAmount) || Number(entryAmount) <= 0) {
            toast.error("Enter a valid amount");
            return;
          }
          const res = await fetch(`${API_URL}/api/reports/cash-register-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "entry",
              amount: Number(entryAmount),
              note: entryReason || undefined
            }),
          });
          if (res.ok) {
            toast.success("Cash entry added!");
            setEntryAmount("");
            setEntryReason("");
            setShowEntryForm(false);
            // Refresh all cash data and event log
            setShowRegisterModal(false);
            setTimeout(() => setShowRegisterModal(true), 350);
          } else {
            const err = await res.json();
            toast.error(err.error || "Failed to add cash entry");
          }
        }}
        className="flex flex-col gap-2 bg-white/70 rounded-2xl p-4 shadow border border-lime-200"
      >
        <label className="font-semibold text-gray-800">Amount (₺):</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={entryAmount}
          onChange={e => setEntryAmount(e.target.value)}
          className="p-3 rounded-xl border-2 border-lime-300 focus:border-lime-500 text-lg mb-1"
          placeholder="₺0.00"
          required
        />
        <label className="font-semibold text-gray-800">Reason / Note:</label>
        <input
          type="text"
          value={entryReason}
          onChange={e => setEntryReason(e.target.value)}
          className="p-3 rounded-xl border-2 border-gray-300 focus:border-lime-500 text-base"
          placeholder="Optional note"
          maxLength={40}
        />
        <button
          type="submit"
          className="mt-3 bg-lime-500 hover:bg-lime-600 text-white font-bold py-2 rounded-xl transition"
        >
          Add Cash Entry
        </button>
      </form>
    )}
  </div>
)}


            
          </>
        );
      })()}
{/* --- Register Event Log Toggle --- */}
{todayRegisterEvents && todayRegisterEvents.length > 0 && (
  <div className="mt-5">
    <button
      type="button"
      onClick={() => setShowRegisterLog(v => !v)}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl font-semibold
        transition-all shadow
        ${showRegisterLog ? 'bg-blue-200 text-blue-900' : 'bg-gray-100 text-gray-700 hover:bg-blue-100'}
      `}
    >
      <span>{showRegisterLog ? 'Hide Register Log' : 'Show Register Log'}</span>
      <span className="text-lg">{showRegisterLog ? "▲" : "▼"}</span>
    </button>
    {showRegisterLog && (
      <div className="bg-white/90 border border-blue-100 rounded-2xl p-4 mt-3 max-h-64 overflow-y-auto shadow">
        {/* Header Row */}
        <div className="flex text-xs font-bold text-gray-400 pb-2 px-1">
          <span className="w-8"></span>
          <span className="min-w-[80px]">Type</span>
          <span className="min-w-[85px]">Amount</span>
          <span className="flex-1">Reason / Note</span>
          <span className="w-14 text-right">Time</span>
        </div>
 <ul className="divide-y">
  {combinedEvents.map((event, idx) => (
    <li key={idx} className="flex items-center py-2 gap-2 text-sm">
      <span className="text-xl">
        {event.type === "open" && "🔓"}
        {event.type === "close" && "🔒"}
        {event.type === "expense" && "📉"}
        {event.type === "entry" && "➕"}
        {!["open","close","expense","entry"].includes(event.type) && "📝"}
      </span>
      <span className="font-bold min-w-[70px] capitalize">
        {event.type}
      </span>
      <span className="tabular-nums min-w-[85px] text-blue-900 font-semibold">
        {event.amount ? `₺${parseFloat(event.amount).toFixed(2)}` : ""}
      </span>
      <span className={`
        flex-1
        ${event.type === "entry" ? "font-semibold text-lime-800" : ""}
        ${event.type === "expense" ? "font-semibold text-orange-800" : ""}
        ${!["entry", "expense"].includes(event.type) ? "text-gray-600 italic" : ""}
        max-w-[180px]"
      `}>
        {event.note || (["entry", "expense"].includes(event.type) ? "(No reason provided)" : "")}
      </span>
      <span className="ml-auto text-xs text-gray-400">
        {event.created_at && new Date(event.created_at).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit"})}
      </span>
    </li>
  ))}
</ul>

      </div>
    )}
  </div>
)}


      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t mt-7">
        <button
          onClick={() => {
            const type =
              registerState === "unopened" || registerState === "closed"
                ? "open"
                : "close";

            const amount = parseFloat(
              registerState === "unopened" || registerState === "closed"
                ? openingCash
                : actualCash
            );

            if (!amount) return toast.error(t('Missing amount'));

            fetch(`${API_URL}/api/reports/cash-register-log`, {

              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type, amount }),
            })
              .then(async res => {
                if (!res.ok) {
                  const err = await res.json();
                  toast.error(err.error || t('Register action failed'));
                  return;
                }
                toast.success(type === "open"
                  ? t("Register opened successfully.")
                  : t("Register closed successfully."));

                refreshRegisterState();
                setShowRegisterModal(false);
              })
              .catch(err => {
                console.error(`❌ Failed to ${type} register:`, err);
                toast.error(`${t('Register')} ${type} failed`);
              });
          }}
          disabled={
            ((registerState === "unopened" || registerState === "closed") && !openingCash) ||
            (registerState === "open" && !actualCash)
          }
          className={`
            px-8 py-3 rounded-2xl text-white font-bold text-lg transition-all
            ${registerState === "unopened" || registerState === "closed"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-indigo-600 hover:bg-blue-700"}
            disabled:opacity-50 shadow-lg
          `}
        >
          {(registerState === "unopened" || registerState === "closed")
            ? t('Open Register')
            : t('Close Register')}
        </button>
      </div>

      {/* Optional: subtle fade-in animation */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: none; } }
        .animate-fade-in { animation: fade-in 0.36s cubic-bezier(.6,-0.28,.735,.045) both; }
      `}</style>
    </div>
  </div>
)}











  </div>
);



}
