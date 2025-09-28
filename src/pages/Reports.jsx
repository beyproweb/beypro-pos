// Enhanced UI with uncontrolled inputs for Y-axis range
import React, { useEffect, useState, useRef } from "react";
import { Button } from "../components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend,
  PieChart as RePieChart,
  Pie as RePie,
  Cell
} from "recharts";
import { useTranslation } from "react-i18next";
import { CalendarIcon, Download, Bell, DollarSign, PieChart, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "react-toastify";
import { useHasPermission } from "../components/hooks/useHasPermission";
const API_URL = import.meta.env.VITE_API_URL || "";



// Helper to calculate order total including extras
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

export default function Reports() {
  const { t } = useTranslation();
   const hasDashboardAccess = useHasPermission("dashboard");
if (!hasDashboardAccess) {
  return (
    <div className="p-12 text-2xl text-red-600 text-center">
      {t("Access Denied: You do not have permission to view the Dashboard.")}
    </div>
  );
}

  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryRange, setCategoryRange] = useState("today");
  const [customCategoryFrom, setCustomCategoryFrom] = useState("");
  const [customCategoryTo, setCustomCategoryTo] = useState("");
  const [categoryDetails, setCategoryDetails] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [categoryTrends, setCategoryTrends] = useState([]);
  const [cashOpening, setCashOpening] = useState(0);
  const [cashExpenses, setCashExpenses] = useState(0);
  const [cashAvailable, setCashAvailable] = useState(0);
  const [closedOrders, setClosedOrders] = useState([]);
const [categoryTrendRange, setCategoryTrendRange] = useState("week");
const [customTrendFrom, setCustomTrendFrom] = useState("");
const [customTrendTo, setCustomTrendTo] = useState("");
const [expensesData, setExpensesData] = useState([]);
const [summary, setSummary] = useState(null);
const [showExportModal, setShowExportModal] = useState(false);
const [expandedRegisterDates, setExpandedRegisterDates] = useState({});

const [exportChecks, setExportChecks] = useState({
  kpis: true,
  salesByPayment: true,
  salesByCategory: true,
  categoryTrends: true,
  cashTrends: true,
  salesTrends: true,
  expensesBreakdown: true,
  profitLoss: true,
});
const [orderItems, setOrderItems] = useState([]);
const [dateRange, setDateRange] = useState("today");
const [registerEvents, setRegisterEvents] = useState([]);

const toggleRegisterDate = (date) => {
  setExpandedRegisterDates(prev => ({
    ...prev,
    [date]: !prev[date]
  }));
};

useEffect(() => {
  // set your date range as needed
  const from = customStart || new Date().toISOString().slice(0, 10);
  const to = customEnd || new Date().toISOString().slice(0, 10);

  fetch(`${API_URL}/api/reports/cash-register-events?from=${from}&to=${to}`)
    .then(res => res.json())
    .then(setRegisterEvents)
    .catch((err) => {
      console.error("❌ Failed to fetch register events:", err);
    });
}, [customStart, customEnd]);
useEffect(() => {
  if (!orderItems || orderItems.length === 0) {
    setTotalItemsSold(0);
    return;
  }

  const total = orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  setTotalItemsSold(total);
}, [orderItems]);

const formatDate = (d) => {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};
const [expenseRangeLabel, setExpenseRangeLabel] = useState("");
const fetchCategoryTrends = async (range) => {
  let from, to;
  const today = new Date().toISOString().slice(0, 10);

  if (range === "today") {
    from = today;
    to = today;
  } else if (range === "week") {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    from = d.toISOString().slice(0, 10);
    to = today;
  } else {
    from = customTrendFrom;
    to = customTrendTo;
  }

  const res = await fetch(`${API_URL}/api/reports/category-trends?from=${from}&to=${to}`);
  const data = await res.json();
  setCategoryTrends(data);
};
const [totalItemsSold, setTotalItemsSold] = useState(0);


useEffect(() => {
  let from = "", to = "";
  const today = new Date().toISOString().slice(0, 10);

  if (dateRange === "today") {
    from = to = today;
  } else if (dateRange === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    from = start.toISOString().slice(0, 10);
    to = today;
  } else {
    from = customStart || today;
    to = customEnd || today;
  }

  setExpenseRangeLabel(`${formatDate(from)} - ${formatDate(to)}`);

  fetch(`${API_URL}/api/reports/expenses?from=${from}&to=${to}`)
    .then(res => res.json())
    .then(setExpensesData)
    .catch((err) => {
      console.error("❌ Failed to fetch expenses:", err);
      toast.error("Failed to load expenses");
    });
}, [dateRange, customStart, customEnd]);


    const salesByCategoryRef = useRef(null);
    const profitLossRef = useRef(null);

  // Summary stats
  const [grossSales, setGrossSales] = useState(0);
  const [netSales, setNetSales] = useState(0);
  const [expensesToday, setExpensesToday] = useState(0);
  const [profit, setProfit] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [dailySales, setDailySales] = useState(0);

  // Chart data
  const [paymentData, setPaymentData] = useState([]);
  const [profitLossData, setProfitLossData] = useState([]);
  const [salesTrendsData, setSalesTrendsData] = useState([]);
  const [productSalesData, setProductSalesData] = useState([]);
  const [cashRegisterData, setCashRegisterData] = useState([]);

  // Controls
  const [timeframe, setTimeframe] = useState("daily");
  const [salesViewType, setSalesViewType] = useState("daily");
  const [salesChartType, setSalesChartType] = useState("area");
  const [zoomRange, setZoomRange] = useState(10);

  // Y-axis range
  const yMinRef = useRef();
  const yMaxRef = useRef();
  const [yMin, setYMin] = useState(1000);
  const [yMax, setYMax] = useState(150000);

  const totalCategorySales = Object.values(categoryDetails).reduce((sum, items) => {
  return sum + items.reduce((subSum, item) => subSum + item.total, 0);
}, 0);

const [cashRegisterHistory, setCashRegisterHistory] = useState([]);
const [onlinePlatforms, setOnlinePlatforms] = useState({});

useEffect(() => {
  let from = "", to = "";
  const today = new Date().toISOString().slice(0, 10);

  if (dateRange === "today") {
    from = to = today;
  } else if (dateRange === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    from = start.toISOString().slice(0, 10);
    to = today;
  } else {
    from = customStart || today;
    to = customEnd || today;
  }

  fetch(`${API_URL}/api/reports/online-sales?from=${from}&to=${to}`)
    .then(r => r.json())
    .then(setOnlinePlatforms)
    .catch(err => console.error("❌ Failed to load online sales", err));
}, [dateRange, customStart, customEnd]);
  
useEffect(() => {
  const from = "2024-01-01";
  const to = new Date().toISOString().slice(0, 10);

  console.log("🚀 Calling /reports/cash-register-history", { from, to });

  fetch(`${API_URL}/api/reports/cash-register-history?from=${from}&to=${to}`)
    .then(res => res.json())
    .then((data) => {
      console.log("✅ Fetched cash register history:", data);
      setCashRegisterHistory(data);
    })
    .catch(err => console.error("❌ Failed to load cash register history", err));
}, []);

useEffect(() => {
  const today = new Date().toISOString().slice(0, 10);
  let from = "", to = "";

  if (dateRange === "today") {
    from = to = today;
  } else if (dateRange === "week") {
    const first = new Date();
    first.setDate(first.getDate() - 6);
    from = first.toISOString().slice(0, 10);
    to = today;
  } else if (dateRange === "custom") {
    from = customStart || today;
    to = customEnd || today;
  }

  console.log("📦 Fetching order history from", from, "to", to);

  // 🧾 Fetch closed orders
  fetch(`${API_URL}/api/reports/history?from=${from}&to=${to}`)
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch order history");
      const orders = await res.json();
      if (!Array.isArray(orders)) throw new Error("Order history is not an array");
      return orders;
    })
    .then(async (orders) => {
const enriched = await Promise.all(
  orders.map(async (order) => {
    const items = await fetch(`${API_URL}/api/orders/${order.id}/items`).then(r => r.json());
    const suborders = await fetch(`${API_URL}/api/orders/${order.id}/suborders`).then(r => r.json());

    const receiptIds = [
      ...new Set([
        ...items.map(i => i.receipt_id).filter(Boolean),
        ...suborders.map(s => s.receipt_id).filter(Boolean),
      ]),
    ];

    let receiptMethods = [];
    for (const receiptId of receiptIds) {
      try {
        const r = await fetch(`${API_URL}/api/reports/receipt-methods/${receiptId}`);
        const methods = await r.json();
        receiptMethods.push(...methods);
      } catch (err) {
        console.warn("❌ Receipt fetch failed for", receiptId);
      }
    }

    // ✅ attach items and suborders
    return { ...order, items, suborders, receiptMethods };
  })
);

// ✅ keep all phone/packet orders even if no items, others only if they have items
setClosedOrders(
  enriched.filter(order =>
    order.order_type === "phone" ||
    order.order_type === "packet" ||
    (Array.isArray(order.items) && order.items.length > 0)
  )
);

    })
    .catch((err) => {
      console.error("❌ Failed to load order history:", err);
      setClosedOrders([]);
      toast.error("Failed to load order history");
    });

  // 📦 Fetch order items
  fetch(`${API_URL}/api/reports/order-items?from=${from}&to=${to}`)
    .then(res => {
      console.log("📦 Fetching order items from", from, "to", to);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    })
    .then(setOrderItems)
    .catch((err) => {
      console.error("❌ Failed to fetch order items:", err);
      setOrderItems([]);
      toast.error("Failed to load order items");
    });

}, [dateRange, customStart, customEnd]);



  const applyYRange = () => {
    const min = parseInt(yMinRef.current.value.replace(/,/g, ''), 10);
    const max = parseInt(yMaxRef.current.value.replace(/,/g, ''), 10);
    if (!isNaN(min) && !isNaN(max) && min < max) {
      setYMin(min);
      setYMax(max);
    }
  };

  const loadCategoryData = () => {
  let from = "", to = "";
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (categoryRange === "today") {
    from = to = today;
  } else if (categoryRange === "week") {
    const first = new Date();
    first.setDate(now.getDate() - 6);
    from = first.toISOString().slice(0, 10);
    to = today;
  } else if (categoryRange === "custom") {
    from = customCategoryFrom;
    to = customCategoryTo;
  }

  // 🟢 Load detailed category sales
  fetch(`${API_URL}/api/reports/sales-by-category-detailed?from=${from}&to=${to}`)
    .then((r) => r.json())
    .then(setCategoryDetails)
    .catch((err) => {
      console.error("❌ Failed to load sales-by-category-detailed:", err);
    });


  // 🟢 Load category trends
  fetch(`${API_URL}/api/reports/category-trends?from=${from}&to=${to}`)
    .then((r) => r.json())
    .then((data) => {
      console.log("📊 Category Trends:", data);
      setCategoryTrends(data);
    })
    .catch((err) => {
      console.error("❌ Failed to load category-trends:", err);
    });
};

const handleExport = async () => {
  const selected = Object.entries(exportChecks)
    .filter(([_, val]) => val)
    .map(([key]) => key);

  const today = new Date().toISOString().slice(0, 10);

  let from = customStart;
  let to = customEnd;

  // Fallback if empty
  if (!from || !to) {
    from = to = today;
  }

  const payload = {
    from,
    to,
    sections: selected,
  };

  const format = "pdf";
  const endpoint = format === "pdf" ? "/reports/export/pdf" : "/reports/export/csv";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `report.${format}`;
    link.click();

    toast.success(`Exported ${format.toUpperCase()} report`);
    setShowExportModal(false);
  } catch (err) {
    console.error(err);
    toast.error("Failed to export report");
  }
};




// at top of Reports.js, after state defs:
const allCategories = React.useMemo(() => {
  const cats = new Set();
  categoryTrends.forEach(row => {
    Object.keys(row).forEach(k => {
      if (k !== "date") cats.add(k);
    });
  });
  return Array.from(cats);
}, [categoryTrends]);


const toggleCategory = (cat) => {
  setExpandedCategories((prev) => ({
    ...prev,
    [cat]: !prev[cat],
  }));
};

// --- Totals by order type ---
// --- Totals by order type ---

const dineInTotal = closedOrders
  .filter(
    o =>
      o.order_type === "table" ||
      (!!o.table_number && (o.order_type == null || o.order_type === "dinein"))
  )
  .reduce((sum, o) => {
    const receiptSum =
      o.receiptMethods?.reduce(
        (s, m) => s + parseFloat(m.amount || 0),
        0
      ) || 0;
    const fallbackTotal = calcOrderTotalWithExtras(o); // ✅ includes extras
    return sum + (receiptSum > 0 ? receiptSum : fallbackTotal);
  }, 0);

const onlineTotal = closedOrders
  .filter(o => o.order_type === "online")
  .reduce((sum, o) => {
    const receiptSum =
      o.receiptMethods?.reduce(
        (s, m) => s + parseFloat(m.amount || 0),
        0
      ) || 0;
    const fallbackTotal = calcOrderTotalWithExtras(o); // ✅ includes extras
    return sum + (receiptSum > 0 ? receiptSum : fallbackTotal);
  }, 0);

const phoneTotal = closedOrders
  .filter(o => o.order_type === "phone")
  .reduce((sum, o) => {
    const receiptSum =
      o.receiptMethods?.reduce((s, m) => s + parseFloat(m.amount || 0), 0) || 0;
    const fallbackTotal = calcOrderTotalWithExtras(o); // ✅ includes extras
    return sum + (receiptSum > 0 ? receiptSum : fallbackTotal);
  }, 0);






useEffect(() => {
  loadCategoryData();
}, [categoryRange, customCategoryFrom, customCategoryTo]);

  // Fetch data
useEffect(() => {
  let from = "", to = "";
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (dateRange === "today") {
    from = to = today;
  } else if (dateRange === "week") {
    const first = new Date();
    first.setDate(now.getDate() - 6);
    from = first.toISOString().slice(0, 10);
    to = today;
  } else if (dateRange === "custom") {
    from = customStart;
    to = customEnd;
  }

  fetch(`${API_URL}/api/reports/sales-by-payment-method?from=${from}&to=${to}`)
    .then(r => r.json())
    .then((data) => {
      setPaymentData(data);
      const total = data.reduce((sum, d) => sum + d.value, 0);
      setTotalPayments(total);
    });

  fetch(`${API_URL}/api/reports/sales-by-category?from=${from}&to=${to}`)
    .then(r => r.json())
    .then(setProductSalesData);

  fetch(`${API_URL}/api/reports/cash-register-trends`)
    .then(r => r.json())
    .then(setCashRegisterData);



}, [dateRange, customStart, customEnd, timeframe, salesViewType]);
const [plFrom, setPlFrom] = useState("");
const [plTo, setPlTo] = useState("");

useEffect(() => {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  let from = "", to = "";

  if (timeframe === "daily") {
    from = to = today;
  } else if (timeframe === "weekly") {
    const start = new Date();
    start.setDate(now.getDate() - 6);
    from = start.toISOString().slice(0, 10);
    to = today;
  } else if (timeframe === "monthly") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    from = first.toISOString().slice(0, 10);
    to = today;
  }

  setPlFrom(from);
  setPlTo(to);

  fetch(`${API_URL}/api/reports/profit-loss?timeframe=${timeframe}&from=${from}&to=${to}`)
    .then(r => r.json())
    .then((data) => {
      console.log("📊 Profit/Loss API response:", data);
      setProfitLossData(data);
    });
}, [timeframe]);


// ✅ Sales Trends Section with own time type
const [salesFrom, setSalesFrom] = useState("");
const [salesTo, setSalesTo] = useState("");

useEffect(() => {
  const today = new Date();
  const nowStr = today.toISOString().slice(0, 10);

  let from = nowStr, to = nowStr;

  if (salesViewType === "daily") {
    const d = new Date();
    d.setDate(today.getDate() - 6);
    from = d.toISOString().slice(0, 10);
  } else if (salesViewType === "weekly") {
    const d = new Date();
    d.setDate(today.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  } else if (salesViewType === "yearly") {
    const jan1 = new Date(today.getFullYear(), 0, 1);
    from = jan1.toISOString().slice(0, 10);
  } else if (salesViewType === "hourly") {
    // Optional filter for today
    from = to = nowStr;
  }

  setSalesFrom(from);
  setSalesTo(to);

  fetch(`${API_URL}/api/reports/sales-trends?type=${salesViewType}`)
    .then(r => r.json())
    .then(setSalesTrendsData);
}, [salesViewType]);

useEffect(() => {
  fetch(`${API_URL}/api/reports/cash-register-status`)
    .then(res => res.json())
    .then((statusData) => {
      const openTime = statusData.last_open_at;
      setCashOpening(parseFloat(statusData.opening_cash || 0));

      if (!openTime) return;

      fetch(`${API_URL}/api/reports/daily-cash-total?openTime=${encodeURIComponent(openTime)}`)
        .then(res => res.json())
        .then(data => {
          const sales = parseFloat(data.cash_total || 0);
          fetch(`${API_URL}/api/reports/daily-cash-expenses?openTime=${encodeURIComponent(openTime)}`)
            .then(res => res.json())
            .then(expenseData => {
              const totalCashExpense = parseFloat(expenseData?.[0]?.total_expense || 0);
              setCashExpenses(totalCashExpense);
              const openingCash = parseFloat(statusData.opening_cash || 0);
setCashAvailable(openingCash + sales - totalCashExpense);

            });
        });
    });
}, []);

useEffect(() => {
  let from = "", to = "";
  const today = new Date().toISOString().slice(0, 10);

  if (dateRange === "today") {
    from = to = today;
  } else if (dateRange === "week") {
    const first = new Date();
    first.setDate(first.getDate() - 6);
    from = first.toISOString().slice(0, 10);
    to = today;
  } else {
    from = customStart || today;
    to = customEnd || today;
  }

  fetch(`${API_URL}/api/reports/summary?from=${from}&to=${to}`)
    .then(r => r.json())
    .then(d => {
      const extraExpenses = (expensesData || []).reduce(
        (sum, e) => sum + parseFloat(e.amount || 0),
        0
      );
      const fullExpenses = (d.expenses_today || 0) + extraExpenses;

      setGrossSales(d.gross_sales || 0);
      setNetSales(d.net_sales || 0);
      setExpensesToday(fullExpenses);
      setProfit((d.net_sales || 0) - fullExpenses);
      setSummary(d);
    })
    .catch(err => console.error("❌ Failed to fetch summary:", err));
}, [dateRange, customStart, customEnd, expensesData]);

// ✅ New effect to calculate gross/net from closedOrders with extras
useEffect(() => {
  if (!closedOrders.length) {
    setGrossSales(0);
    setNetSales(0);
    return;
  }

  const gross = closedOrders.reduce((sum, o) => {
    const receiptSum =
      o.receiptMethods?.reduce(
        (s, m) => s + parseFloat(m.amount || 0),
        0
      ) || 0;
    const fallback = calcOrderTotalWithExtras(o);
    return sum + (receiptSum > 0 ? receiptSum : fallback);
  }, 0);

  setGrossSales(gross);

  const net = closedOrders.reduce((sum, o) => {
    const receiptSum =
      o.receiptMethods?.reduce(
        (s, m) => s + parseFloat(m.amount || 0),
        0
      ) || 0;
    const fallback = calcOrderTotalWithExtras(o);
    const base = receiptSum > 0 ? receiptSum : fallback;
    // subtract discounts if any
    return sum + base - (parseFloat(o.discountValue || 0) || 0);
  }, 0);

  setNetSales(net);
}, [closedOrders])

useEffect(() => {
  if (dateRange === "today") {
    const today = new Date().toISOString().slice(0, 10);
    setCustomStart(today);
    setCustomEnd(today);
  }
}, []);

useEffect(() => {
  // Keep the KPI in sync with the payment tiles
  setDailySales(totalPayments || 0);
}, [totalPayments]);

const salesTrendsRef = useRef(null);

const categoryIcons = {
  "Chicken Burger": "🍔",
  "Pizzas": "🍕",
  "Salads": "🥗",
  "Meat Burger": "🍔",
  "Drinks": "🥤",
  "Breakfast": "🍳",
};


const kpis = [
  { label: t("Daily Sales"), value: dailySales, color: "from-blue-400 to-blue-600" },
  { label: t("Gross Sales"), value: grossSales, color: "from-indigo-500 to-indigo-700" },
  { label: t("Net Sales"), value: netSales, color: "from-sky-500 to-sky-700" },
  { label: t("Expenses Today"), value: expensesToday, color: "from-red-500 to-red-700" },
  { label: t("Cash Available"), value: cashAvailable, color: "from-yellow-500 to-yellow-700" },
  { label: t("Profit"), value: profit, color: "from-green-500 to-green-700" },
  {
  label: t("Avg Order Value"),
  value: summary?.average_order_value || 0,
  color: "from-purple-500 to-purple-700",
},

  {
    label: t("Total Items Sold"),
    value: totalItemsSold,
    color: "from-amber-500 to-amber-700",
  },
];

const groupedRegisterEvents = registerEvents.reduce((acc, ev) => {
  const date = ev.date || ev.created_at.slice(0, 10);
  if (!acc[date]) acc[date] = [];
  acc[date].push(ev);
  return acc;
}, {});


  const ChartCard = ({ title, children, actions }) => (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl shadow space-y-2 h-full">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg text-gray-700 dark:text-white">{title}</h3>
        {actions}
      </div>
     <div>{children}</div> {/* ✅ auto height */}
    </div>
  );

  const getCategoryRangeDates = () => {
  const today = new Date();
  let from = new Date(today);
  let to = new Date(today);

  if (categoryRange === "week") {
    from.setDate(today.getDate() - 6);
  } else if (categoryRange === "custom") {
    from = new Date(customCategoryFrom);
    to = new Date(customCategoryTo);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};


  const visibleData = salesTrendsData.slice(-zoomRange);

  return (
 <div className="min-h-screen px-6 py-8 space-y-8">
  {/* Header Buttons - All left aligned */}
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">

    <Button
      variant={dateRange === "today" ? "default" : "outline"}
      onClick={() => setDateRange("today")}
      className="flex items-center gap-2"
    >
      <CalendarIcon className="w-4 h-4" />
      <span>{t("Today")}</span>
    </Button>
    <Button
      variant={dateRange === "week" ? "default" : "outline"}
      onClick={() => setDateRange("week")}
      className="flex items-center gap-2"
    >
      {t("This Week")}
    </Button>
    <Button
      variant={dateRange === "custom" ? "default" : "outline"}
      onClick={() => setDateRange("custom")}
      className="flex items-center gap-2"
    >
      {t("Custom Range")}
    </Button>

    {/* Custom range pickers */}
    {dateRange === "custom" && (
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm font-medium">{t("From")}</label>
        <input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-800 shadow-sm"
        />
        <label className="text-sm font-medium">{t("To")}</label>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-800 shadow-sm"
        />
      </div>
    )}


<div className="flex gap-2">
  <Button
    variant="outline"
    onClick={() => setShowExportModal(true)}
    className="flex items-center gap-2"
  >
    <Download className="w-4 h-4" />
    {t("Export")}
  </Button>
</div>

    </div>

    {/* KPI Cards */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {kpis.map(({ label, value, color }) => (
        <div key={label} className={`p-4 rounded-2xl shadow-xl bg-opacity-80 backdrop-blur-xl text-white border border-white/10 hover:scale-[1.02] transition-all duration-200 ease-in-out bg-gradient-to-br ${color}`}>
          <div className="text-sm font-medium opacity-90">{label}</div>
         <div className="text-3xl font-bold tracking-wide mt-1">
  {label.includes("Items") || label.includes("Orders")
    ? value.toLocaleString()
    : `₺${value.toLocaleString()}`}
</div>

        </div>
      ))}
    </div>
   {/* 🧾 Cash Register Trends */}
<Card className="space-y-4 p-4">
  <CardContent>
    {/* 🔁 Range Controls */}
    <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
      <div className="flex gap-2">
        <Button variant={dateRange === "today" ? "default" : "outline"} onClick={() => setDateRange("today")}>
          {t("Today")}
        </Button>
        <Button variant={dateRange === "week" ? "default" : "outline"} onClick={() => setDateRange("week")}>
          {t("This Week")}
        </Button>
        <Button variant={dateRange === "custom" ? "default" : "outline"} onClick={() => setDateRange("custom")}>
          {t("Custom Range")}
        </Button>
      </div>
      {dateRange === "custom" && (
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
      )}
    </div>

    {/* 🧮 Register History */}
    {(() => {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);

      // Group unique by date for register summary (one card per date)
      const filtered = cashRegisterHistory.filter((row) => {
        const rowDate = row.date?.slice(0, 10);
        if (!rowDate) return false;
        if (dateRange === "today") return rowDate === todayStr;
        if (dateRange === "week") {
          const weekStart = new Date();
          weekStart.setDate(today.getDate() - 6);
          const weekStartStr = weekStart.toISOString().slice(0, 10);
          return rowDate >= weekStartStr && rowDate <= todayStr;
        }
        if (dateRange === "custom") {
          return rowDate >= customStart && rowDate <= customEnd;
        }
        return false;
      });

      // 💡 Deduplicate: make sure you only render one card per unique date
      const uniqueByDate = [];
      const seen = new Set();
      for (const row of filtered) {
        if (!seen.has(row.date)) {
          uniqueByDate.push(row);
          seen.add(row.date);
        }
      }

      if (uniqueByDate.length === 0) {
        return <div className="text-sm text-center text-gray-500">{t("No register data in selected range.")}</div>;
      }

      return uniqueByDate.map((row, i) => {
        const expected =
  parseFloat(row.opening_cash || 0) +
  parseFloat(row.cash_sales || 0) +
  parseFloat(row.register_entries || 0) - // <--- add this
  (parseFloat(row.register_expenses || 0) +
    parseFloat(row.supplier_expenses || 0) +
    parseFloat(row.staff_expenses || 0));

        const diff = parseFloat(row.closing_cash || 0) - expected;
        const isMatch = Math.abs(diff) < 0.01;

        // All open/close logs for this date
        const logsForDate = registerEvents.filter(ev =>
          (ev.date || ev.created_at.slice(0, 10)) === row.date
        );

        return (
          <div key={row.date} className="mt-4 border rounded-xl p-4 bg-gray-50 dark:bg-gray-800 space-y-2 shadow">
            <div className="text-lg font-bold flex justify-between">
              <span>📅 {row.date}</span>
              <span className="text-sm text-gray-500">
                {isMatch ? <>✅ {t("Balanced")}</> : <>❌ {t("Discrepancy")}</>}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>🔓 {t("Opening Cash")}: <b>₺{parseFloat(row.opening_cash || 0).toFixed(2)}</b></div>
              <div>💰 {t("Cash Sales")}: <b>₺{parseFloat(row.cash_sales || 0).toFixed(2)}</b></div>
              <div>📉 {t("Register Expenses")}: <b>₺{parseFloat(row.register_expenses || 0).toFixed(2)}</b></div>
              <div>📦 {t("Supplier Cash")}: <b>₺{parseFloat(row.supplier_expenses || 0).toFixed(2)}</b></div>
              <div>👥 {t("Staff Payments")}: <b>₺{parseFloat(row.staff_expenses || 0).toFixed(2)}</b></div>
              <div>🧾 {t("Closing Cash")}: <b>₺{parseFloat(row.closing_cash || 0).toFixed(2)}</b></div>
            </div>

            {!isMatch && (
              <div className={`text-sm font-semibold p-2 rounded-md ${diff < 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                {diff < 0
                  ? <>❌ {t("Missing")} ₺{Math.abs(diff).toFixed(2)}</>
                  : <>🟢 {t("Extra")} ₺{diff.toFixed(2)}</>
                }
              </div>
            )}
<div>➕ {t("Cash Entries")}: <b>₺{parseFloat(row.register_entries || 0).toFixed(2)}</b></div>

            {/* 👇 TOGGLE BUTTON + LOGS */}
            {logsForDate.length > 1 && (
              <div className="mt-2">
                <button
                  onClick={() => setExpandedRegisterDates(prev => ({
                    ...prev,
                    [row.date]: !prev[row.date]
                  }))}
                  className="px-3 py-1 rounded-full bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-semibold mb-2"
                >
                  {expandedRegisterDates[row.date]
                    ? t("Hide All Transactions")
                    : t("Show All Transactions")}
                </button>
                {expandedRegisterDates[row.date] && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm mt-2">
                     <thead>
  <tr>
    <th className="text-left p-2">{t("Time")}</th>
    <th className="text-left p-2">{t("Type")}</th>
    <th className="text-left p-2">{t("Reason")}</th>
    <th className="text-right p-2">{t("Amount")}</th>
  </tr>
</thead>
<tbody>
  {logsForDate.map((ev, idx) => (
    <tr key={idx} className={ev.type === "open" ? "bg-green-50" : ev.type === "close" ? "bg-blue-50" : "bg-yellow-50"}>
      <td className="p-2">{new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td className="p-2 font-semibold">
        {ev.type === "open"
          ? t("Opening")
          : ev.type === "close"
          ? t("Closing")
          : ev.type === "entry"
          ? t("Cash Entry")
          : ev.type === "expense"
          ? t("Expense")
          : ev.type}
      </td>
      <td className="p-2">
        {ev.note
          ? <span className="inline-block bg-blue-100 text-blue-800 rounded-xl px-2 py-1 text-xs">{ev.note}</span>
          : <span className="italic text-gray-400">—</span>
        }
      </td>
      <td className="p-2 text-right">₺{parseFloat(ev.amount).toFixed(2)}</td>
    </tr>
  ))}
</tbody>

                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      });
    })()}
  </CardContent>
</Card>

{/* Sales by Payment Method */}
<ChartCard title={t("Sales by Payment Method")}>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 items-stretch">
   {paymentData.map(({ method, value }) => {
      const percent = (value / totalPayments) * 100;

      // Match emoji from TransactionScreen
      const icons = {
        "Cash": "💵",
        "Credit Card": "💳",
        "Sodexo": "🍽️",
        "Multinet": "🪙",
        "Unknown": "❓"
      };
      const emoji = icons[method] || "💰";

      return (
        <div
          key={method}
          className="bg-gradient-to-br from-white/70 to-gray-100 dark:from-gray-800 dark:to-gray-900 
             p-4 rounded-xl shadow text-sm flex flex-col justify-between min-h-[120px]"
        >
          <div className="font-semibold text-gray-700 dark:text-white truncate">
            {emoji} {method}
          </div>
          <div className="mt-2 text-lg font-bold text-blue-600 dark:text-blue-400">
            ₺{value.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500">{percent.toFixed(1)}%</div>
        </div>
      );
    })}
  </div>

  {/* Sticky-style total below grid */}
  <div className="mt-6 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-4 border-gray-300 dark:border-gray-700">
     🧮 {t("Total Payments")}: ₺{totalPayments.toLocaleString()}
  </div>
</ChartCard>





<Card className="p-4 space-y-2">
  <h3 className="text-lg font-bold text-gray-800 dark:text-white">
    {t("Order Type Totals")}
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">

    {/* Dine-in */}
    <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-3">
      🍽️ {t("Dine-in")}: <b>₺{dineInTotal.toLocaleString()}</b>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs underline">
          {t("Show Details")}
        </summary>
        <ul className="mt-1 space-y-1 text-xs">
          {Object.entries(
            closedOrders
              .filter(
                o =>
                  o.order_type === "table" ||
                  (!!o.table_number &&
                    (o.order_type == null || o.order_type === "dinein"))
              )
              .reduce((acc, order) => {
                if (order.receiptMethods?.length) {
                  order.receiptMethods.forEach(m => {
                    const method = m.payment_method || "Unknown";
                    acc[method] =
                      (acc[method] || 0) + parseFloat(m.amount || 0);
                  });
                } else if (order.payment_method) {
                  acc[order.payment_method] =
                    (acc[order.payment_method] || 0) +
                    calcOrderTotalWithExtras(order);
                }
                return acc;
              }, {})
          ).map(([method, total], i) => (
            <li key={i} className="flex justify-between">
              <span>{method}</span>
              <span>₺{total.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>

    {/* Online */}
    <div className="bg-green-100 dark:bg-green-900 rounded-lg p-3">
      📱 {t("Online")}:{" "}
      <b>
        ₺
        {Object.values(onlinePlatforms)
          .reduce((sum, p) => sum + (p.total || 0), 0)
          .toLocaleString()}
      </b>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs underline">
          {t("Show Details")}
        </summary>
        <ul className="mt-1 space-y-1 text-xs">
          {Object.entries(onlinePlatforms).map(([platform, data]) => (
            <li key={platform}>
              <b>
                {platform === "packet"
                  ? "Yemeksepeti"
                  : platform === "online"
                  ? "Trendyol"
                  : platform}
              </b>{" "}
              – ₺{data.total.toLocaleString()}
              <ul className="pl-4">
                {data.payments.map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{p.method}</span>
                    <span>₺{p.total.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </div>

    {/* Phone */}
    <div className="bg-yellow-100 dark:bg-yellow-900 rounded-lg p-3">
      ☎️ {t("Phone")}: <b>₺{phoneTotal.toLocaleString()}</b>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs underline">
          {t("Show Details")}
        </summary>
        <ul className="mt-1 space-y-1 text-xs">
          {Object.entries(
            closedOrders
              .filter(o => o.order_type === "phone")
              .reduce((acc, order) => {
                if (order.receiptMethods?.length) {
                  order.receiptMethods.forEach(m => {
                    const method = m.payment_method || "Unknown";
                    acc[method] =
                      (acc[method] || 0) + parseFloat(m.amount || 0);
                  });
                } else if (order.payment_method) {
                  acc[order.payment_method] =
                    (acc[order.payment_method] || 0) +
                    calcOrderTotalWithExtras(order);
                }
                return acc;
              }, {})
          ).map(([method, total], i) => (
            <li key={i} className="flex justify-between">
              <span>{method}</span>
              <span>₺{total.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  </div>
</Card>


<Card className="p-4 space-y-2">
  <h3 className="text-lg font-bold text-gray-800 dark:text-white">
    {t("Online Platforms Totals")}
  </h3>

  <div className="space-y-3">
    {Object.entries(onlinePlatforms).map(([platform, data]) => (
      <details key={platform} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
        <summary className="cursor-pointer font-semibold flex justify-between">
          <span>
            {platform === "packet" ? "Yemeksepeti" : platform === "online" ? "Trendyol" : platform}
          </span>
          <span className="text-blue-600 dark:text-blue-300 font-bold">
            ₺{data.total.toLocaleString()}
          </span>
        </summary>

        <ul className="mt-2 space-y-1 text-sm">
          {data.payments.map((p, i) => (
            <li key={i} className="flex justify-between px-2">
              <span>{p.method}</span>
              <span className="font-semibold">₺{p.total.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </details>
    ))}
  </div>
</Card>


    {/* Sales by Category */}
    <div ref={salesByCategoryRef}>
<ChartCard
  title={t("Sales by Category")}
  actions={
    <div className="flex gap-2 items-center">
      <select
        value={categoryRange}
        onChange={(e) => {
          setCategoryRange(e.target.value);
          salesByCategoryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
      >
        <option value="today">{t("Today")}</option>
        <option value="week">{t("This Week")}</option>
        <option value="custom">{t("Custom Range")}</option>
      </select>

      {categoryRange === "custom" && (
        <>
          <input type="date" value={customCategoryFrom} onChange={(e) => setCustomCategoryFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <input type="date" value={customCategoryTo} onChange={(e) => setCustomCategoryTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </>
      )}
    </div>
  }
>
  {/* Category Grid */}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 items-stretch">

    {productSalesData.map((cat, i) => (
      <div
        key={i}
        className="p-4 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-gray-800 dark:to-gray-900 
             rounded-xl shadow text-gray-800 dark:text-white min-h-[160px] flex flex-col justify-between"
      >
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-md truncate">
            {categoryIcons[cat.category?.trim()] ?? "📦"} {cat.category}
          </h4>
          <button
            onClick={() => toggleCategory(cat.category)}
            className="text-xs underline"
          >
            {expandedCategories[cat.category] ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xl font-extrabold mt-1">
          ₺
          {(categoryDetails[cat.category]?.reduce((sum, item) => sum + item.total, 0) || 0).toLocaleString()}
        </p>
        {expandedCategories[cat.category] && categoryDetails[cat.category] && (
          <ul className="mt-3 space-y-1 text-sm border-t border-white/20 pt-2">
            {categoryDetails[cat.category].map((item, j) => (
              <li key={j} className="flex justify-between text-blue/90 items-center">
                <span className="truncate">
                  <a
                    href={`/stock?search=${encodeURIComponent(item.name)}`}
                    className="underline hover:text-blue-300"
                    title={t("View in Stock")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.name}
                  </a>{" "}
                  x{item.quantity}
                </span>
                <span className="tabular-nums">₺{item.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    ))}
  </div>

  {/* ✅ Total Summary Below */}
  <div className="mt-6 px-6 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-right font-bold text-gray-800 dark:text-white shadow-sm text-base">
    🧮 {t("Total Category Sales")}: ₺{totalCategorySales.toLocaleString()}
  </div>
</ChartCard>

    </div>

  {/* 📊 Category Trends Over Time */}
<ChartCard
  title={t("Category Trends Over Time")}
  actions={
    <div className="flex gap-2 items-center">
      <select
        value={categoryTrendRange}
        onChange={(e) => {
          setCategoryTrendRange(e.target.value);
          if (e.target.value !== "custom") fetchCategoryTrends(e.target.value); // Trigger fetch
        }}
        className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
      >
        <option value="today">{t("Today")}</option>
        <option value="week">{t("This Week")}</option>
        <option value="custom">{t("Custom Range")}</option>
      </select>

      {categoryTrendRange === "custom" && (
        <>
          <input
            type="date"
            value={customTrendFrom}
            onChange={(e) => setCustomTrendFrom(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={customTrendTo}
            onChange={(e) => setCustomTrendTo(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => fetchCategoryTrends("custom")}
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
          >
            {t("Apply")}
          </button>
        </>
      )}
    </div>
  }
>
  {/* ✅ Chart */}
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={categoryTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="date"
        tickFormatter={(dateStr) => {
          const d = new Date(dateStr);
          return d.toLocaleDateString(undefined, { weekday: "short" }); // "Mon"
        }}
      />
      <YAxis tickFormatter={(v) => `₺${v.toLocaleString()}`} />
      <ReTooltip formatter={(value) => `₺${parseFloat(value).toFixed(2)}`} />
      <Legend />
      {allCategories.map((cat, i) => (
        <Bar
          key={cat}
          dataKey={cat}
          fill={["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#E11D48"][i % 7]}
          barSize={20}
        />
      ))}
    </BarChart>
  </ResponsiveContainer>



</ChartCard>










{showExportModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-[90%] max-w-lg space-y-4">
      <h2 className="text-xl font-bold text-gray-800 dark:text-white">📤 {t("Export Report Data")}</h2>

      {/* Checkbox options */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {Object.entries(exportChecks).map(([key, value]) => (
          <label key={key} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) =>
                setExportChecks((prev) => ({ ...prev, [key]: e.target.checked }))
              }
              className="form-checkbox h-4 w-4 text-blue-600"
            />
            <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
          </label>
        ))}
      </div>

      {/* Date range inputs */}
      <div className="flex items-center gap-3 text-sm mt-4">
        <label className="font-medium">From</label>
        <input
          type="date"
          value={customStart}
          onChange={(e) => setCustomStart(e.target.value)}
          className="px-2 py-1 border rounded bg-white dark:bg-gray-800"
        />
        <label className="font-medium">To</label>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => setCustomEnd(e.target.value)}
          className="px-2 py-1 border rounded bg-white dark:bg-gray-800"
        />
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={() => setShowExportModal(false)} variant="outline">{t("Cancel")}</Button>
        <Button
  onClick={() => handleExport()}
  disabled={!customStart || !customEnd}
  className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow"
>
{t("Download")}
</Button>

      </div>
    </div>
  </div>
)}







    {/* Sales Trends */}
    <div ref={salesTrendsRef}>
      <ChartCard
        title={t("Sales Trends")}
        className="rounded-3xl bg-white/80 dark:bg-white/10 backdrop-blur-xl shadow-xl"
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={salesViewType}
              onChange={(e) => {
                setSalesViewType(e.target.value);
                salesTrendsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
            >
              {["hourly", "daily", "weekly", "yearly"].map(opt => (
                <option key={opt} value={opt}>{t(opt)}</option>
              ))}
            </select>
<Button
  variant={salesChartType === "area" ? "default" : "outline"}
  size="sm"
  onClick={() => setSalesChartType("area")}
>
  {t("Area")}
</Button>

<Button
  variant={salesChartType === "line" ? "default" : "outline"}
  size="sm"
  onClick={() => setSalesChartType("line")}
>
  {t("Line")}
</Button>

            <input ref={yMinRef} defaultValue="1000" className="w-24 text-sm px-2 py-1 rounded border" placeholder="₺ {t(Min)}" />
            <span className="text-sm">–</span>
            <input ref={yMaxRef} defaultValue="150000" className="w-28 text-sm px-2 py-1 rounded border" placeholder="₺ {t(Max)}" />
            <Button size="sm" variant="outline" onClick={applyYRange}>{t("Apply")}</Button>
            <Button size="sm" onClick={() => setZoomRange(Math.max(5, zoomRange - 5))}><Minus className="w-4 h-4" /></Button>
            <Button size="sm" onClick={() => setZoomRange(Math.min(salesTrendsData.length, zoomRange + 5))}><Plus className="w-4 h-4" /></Button>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={300}>
          {salesChartType === "area" ? (
            <AreaChart data={visibleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
  dataKey="label"
  tickFormatter={(label) => {
    if (salesViewType === "daily") {
      const date = new Date(label);
      return date.toLocaleDateString(undefined, { weekday: "short" }); // "Mon"
    }
    return label; // fallback to original for hourly, weekly, etc.
  }}
/>

              <YAxis domain={[yMin, yMax]} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
              <ReTooltip />
              <Area type="monotone" dataKey="sales" stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} />
            </AreaChart>
          ) : (
            <LineChart data={visibleData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
  dataKey="label"
  tickFormatter={(label) => {
    if (salesViewType === "daily") {
      const date = new Date(label);
      return date.toLocaleDateString(undefined, { weekday: "short" });
    }
    return label;
  }}
/>

              <YAxis domain={[yMin, yMax]} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
              <ReTooltip />
              <Line type="monotone" dataKey="sales" stroke="#6366F1" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </ChartCard>
    </div>

<ChartCard
  title={`📉 ${t("Expenses Breakdown")}`}

  actions={
    <div className="flex gap-2 items-center">
      <Button variant={dateRange === "today" ? "default" : "outline"} size="sm" onClick={() => setDateRange("today")}>
        {t("Today")}
      </Button>
      <Button variant={dateRange === "week" ? "default" : "outline"} size="sm" onClick={() => setDateRange("week")}>
        {t("This Week")}
      </Button>
      <Button variant={dateRange === "custom" ? "default" : "outline"} size="sm" onClick={() => setDateRange("custom")}>
        {t("Custom")}
      </Button>

      {dateRange === "custom" && (
        <>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </>
      )}
    </div>
  }
>
  <div className="space-y-2 overflow-y-auto max-h-[300px]">
    {Object.entries(
      expensesData.reduce((acc, cur) => {
        acc[cur.type] = (acc[cur.type] || 0) + parseFloat(cur.amount || 0);
        return acc;
      }, {})
    ).map(([type, total]) => (
      <div key={type} className="flex justify-between text-sm border-b border-gray-200 dark:border-gray-700 pb-1">
        <span>{type}</span>
        <span className="font-semibold">₺{total.toLocaleString()}</span>
      </div>
    ))}
  </div>

  {/* 🧮 Total */}
  <div className="mt-4 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-3 border-gray-300 dark:border-gray-700">
    {t("Total Expenses")}: ₺
    {expensesData
      .reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
      .toLocaleString()}
  </div>
</ChartCard>



<div ref={profitLossRef}>
  <ChartCard
    title={t("Profit & Loss Breakdown")}
    actions={
<div className="space-x-1">
  {["daily", "weekly", "monthly"].map((opt) => (
    <Button
      key={opt}
      size="sm"
      variant={timeframe === opt ? "default" : "outline"}
      onClick={() => {
        setTimeframe(opt);
        profitLossRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      {t(opt.charAt(0).toUpperCase() + opt.slice(1))}
    </Button>
  ))}
</div>

    }
  >
    <div className="grid md:grid-cols-3 gap-6">
      {profitLossData.map(({ date, profit, loss }) => {
        const net = profit - loss;
        const margin = (profit + loss) > 0 ? (profit / (profit + loss)) * 100 : 0;
        const profitColor = net >= 0 ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-400";
        const bgColor = net >= 0 ? "bg-green-50 dark:bg-green-900" : "bg-red-50 dark:bg-red-900";

        return (
          <div key={date} className={`rounded-2xl shadow-xl p-4 space-y-2 text-center ${bgColor}`}>
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{date}</h4>
            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="flex justify-between px-2">
                <span className="text-gray-500">{t("Net Sales")}</span>
                <span className="font-bold text-blue-600 dark:text-blue-300">
                  ₺{profit.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-2">
                <span className="text-gray-500">{t("Expenses")}</span>
                <span className="font-bold text-red-500">
                  ₺{loss.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-2">
                <span className="text-gray-500">{t("Profit")}</span>
                <span className={`font-bold ${profitColor}`}>
                  ₺{net.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-2">
                <span className="text-gray-500">🧮 {t("Margin")}</span>
                <span className="font-semibold text-accent">
                  {margin.toFixed(1)}%
                </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>
    </div>
  </div>
);
}
