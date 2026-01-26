// src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import secureFetch from "../utils/secureFetch";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useCurrency } from "../context/CurrencyContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";

import { useNavigate } from 'react-router-dom';
import {
  Home, Utensils, Package, BarChart, Users, Settings, QrCode,
  PieChart, ClipboardList, TrendingUp, FileText, Factory, Bot,
  UserCheck, Megaphone, Wrench, Star, AlertTriangle, CreditCard,
  Clock, ChevronRight, ArrowUpRight, ArrowDownRight, ChefHat,
  UserCog, Bell, Printer, Plug, Video
} from 'lucide-react';
import axios from "axios";
// adjust path as needed!
// Set your API URL

const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const QUICK_ACCESS_CONFIG = [
  {
    id: "orders",
    labelKey: "Orders",
    defaultLabel: "Orders",
    path: "/tableoverview?tab=tables",
    color: "bg-gradient-to-r from-rose-400 to-pink-500",
    iconColor: "text-rose-600",
    iconRing: "ring-rose-400/40",
    icon: "ClipboardList",
  },
  {
    id: "packet",
    labelKey: "Packet",
    defaultLabel: "Packet",
    path: "/tableoverview?tab=packet",
    color: "bg-gradient-to-r from-sky-500 to-cyan-500",
    iconColor: "text-sky-600",
    iconRing: "ring-sky-400/40",
    icon: "Package",
    permission: "packet-orders",
  },
  {
    id: "history",
    labelKey: "History",
    defaultLabel: "History",
    path: "/tableoverview?tab=history",
    color: "bg-gradient-to-r from-indigo-500 to-purple-600",
    iconColor: "text-indigo-600",
    iconRing: "ring-indigo-400/40",
    icon: "Clock",
    permission: "history",
  },
  {
    id: "kitchen",
    labelKey: "Kitchen",
    defaultLabel: "Kitchen",
    path: "/kitchen",
    color: "bg-gradient-to-r from-purple-500 to-violet-600",
    iconColor: "text-violet-600",
    iconRing: "ring-violet-400/40",
    icon: "ChefHat",
  },
  {
    id: "products",
    labelKey: "Products",
    defaultLabel: "Products",
    path: "/products",
    color: "bg-gradient-to-r from-blue-500 to-indigo-500",
    iconColor: "text-indigo-600",
    iconRing: "ring-indigo-400/40",
    icon: "Utensils",
  },
  {
    id: "suppliers",
    labelKey: "Suppliers",
    defaultLabel: "Suppliers",
    path: "/suppliers",
    color: "bg-gradient-to-r from-green-500 to-teal-500",
    iconColor: "text-emerald-600",
    iconRing: "ring-emerald-400/40",
    icon: "Package",
  },
  {
    id: "stock",
    labelKey: "Stock",
    defaultLabel: "Stock",
    path: "/stock",
    color: "bg-gradient-to-r from-yellow-500 to-amber-500",
    iconColor: "text-amber-600",
    iconRing: "ring-amber-400/40",
    icon: "BarChart",
  },
  {
    id: "production",
    labelKey: "Production",
    defaultLabel: "Production",
    path: "/production",
    color: "bg-gradient-to-r from-purple-500 to-violet-500",
    iconColor: "text-purple-600",
    iconRing: "ring-purple-400/40",
    icon: "Factory",
  },
  {
    id: "staff",
    labelKey: "Staff",
    defaultLabel: "Staff",
    path: "/staff",
    color: "bg-gradient-to-r from-sky-500 to-cyan-500",
    iconColor: "text-cyan-600",
    iconRing: "ring-cyan-400/40",
    icon: "Users",
  },
  {
    id: "payroll",
    labelKey: "Payroll",
    defaultLabel: "Payroll",
    path: "/staff?tab=payroll",
    color: "bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500",
    iconColor: "text-emerald-600",
    iconRing: "ring-emerald-400/40",
    icon: "CreditCard",
    permission: "staff-payroll",
  },
  {
    id: "task",
    labelKey: "Task",
    defaultLabel: "Task",
    path: "/task",
    color: "bg-gradient-to-r from-indigo-500 to-blue-700",
    iconColor: "text-blue-700",
    iconRing: "ring-blue-400/40",
    icon: "Bot",
  },
  {
    id: "reports",
    labelKey: "Reports",
    defaultLabel: "Reports",
    path: "/reports",
    color: "bg-gradient-to-r from-orange-500 to-yellow-600",
    iconColor: "text-orange-600",
    iconRing: "ring-orange-400/40",
    icon: "FileText",
  },
  {
    id: "expenses",
    labelKey: "Expenses",
    defaultLabel: "Expenses",
    path: "/expenses",
    color: "bg-gradient-to-r from-red-500 to-rose-500",
    iconColor: "text-rose-600",
    iconRing: "ring-rose-400/40",
    icon: "FileText",
  },
  {
    id: "ingredient-prices",
    labelKey: "Ingredient Prices",
    defaultLabel: "Ingredient Prices",
    path: "/ingredient-prices",
    color: "bg-gradient-to-r from-lime-500 to-green-600",
    iconColor: "text-lime-600",
    iconRing: "ring-lime-400/40",
    icon: "BarChart",
  },
  {
    id: "cash-history",
    labelKey: "Cash History",
    defaultLabel: "Cash History",
    path: "/cash-register-history",
    color: "bg-accent",
    iconColor: "text-indigo-600",
    iconRing: "ring-indigo-400/40",
    icon: "PieChart",
  },
  {
    id: "integrations",
    labelKey: "Integrations",
    defaultLabel: "Integrations",
    path: "/integrations",
    color: "bg-accent",
    iconColor: "text-sky-600",
    iconRing: "ring-sky-400/40",
    icon: "Plug",
  },
  {
    id: "settings",
    labelKey: "Settings",
    defaultLabel: "Settings",
    path: "/settings",
    color: "bg-gradient-to-r from-gray-700 to-gray-900",
    iconColor: "text-slate-700 dark:text-slate-200",
    iconRing: "ring-slate-400/40",
    icon: "Settings",
  },
  {
    id: "qr-menu",
    labelKey: "QR Menu",
    defaultLabel: "QR Menu",
    path: "/qr-menu-settings",
    color: "bg-gradient-to-r from-indigo-500 to-blue-700",
    iconColor: "text-indigo-600",
    iconRing: "ring-indigo-400/40",
    icon: "QrCode",
  },
  {
    id: "customer-insights",
    labelKey: "Customer Insights",
    defaultLabel: "Customer Insights",
    path: "/customer-insights",
    color: "bg-gradient-to-r from-pink-400 to-purple-500",
    iconColor: "text-fuchsia-600",
    iconRing: "ring-fuchsia-400/40",
    icon: "UserCheck",
  },
  {
    id: "marketing-campaigns",
    labelKey: "Marketing Campaigns",
    defaultLabel: "Marketing Campaigns",
    path: "/marketing-campaigns",
    color: "bg-gradient-to-r from-amber-400 to-orange-600",
    iconColor: "text-orange-600",
    iconRing: "ring-orange-400/40",
    icon: "Megaphone",
  },
  {
    id: "maintenance",
    labelKey: "Maintenance",
    defaultLabel: "Maintenance",
    path: "/maintenance",
    color: "bg-gradient-to-r from-gray-400 to-gray-700",
    iconColor: "text-slate-600 dark:text-slate-200",
    iconRing: "ring-slate-400/40",
    icon: "Wrench",
  },
  {
    id: "user-management",
    labelKey: "User Management",
    defaultLabel: "User Management",
    path: "/user-management",
    color: "bg-gradient-to-r from-blue-500 to-indigo-500",
    iconColor: "text-blue-600",
    iconRing: "ring-blue-400/40",
    icon: "UserCog",
    permission: "settings-users",
  },
  {
    id: "notifications",
    labelKey: "Notifications",
    defaultLabel: "Notifications",
    path: "/settings/notifications",
    color: "bg-gradient-to-r from-amber-500 to-orange-500",
    iconColor: "text-amber-600",
    iconRing: "ring-amber-400/40",
    icon: "Bell",
    permission: "settings-notifications",
  },
  {
    id: "printers",
    labelKey: "Printers",
    defaultLabel: "Printers",
    path: "/printers",
    color: "bg-gradient-to-r from-slate-600 to-slate-800",
    iconColor: "text-slate-700 dark:text-slate-200",
    iconRing: "ring-slate-400/40",
    icon: "Printer",
    permission: "settings-printers",
  },
];

const DASHBOARD_TO_SIDEBAR_TYPE = "application/x-dashboard-shortcut";

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const hasDashboardAccess = useHasPermission("dashboard");
  const hasCameraAccess = useHasPermission("settings-cameras");
  const canSeeBusinessSnapshot = useHasPermission("business-snapshot");
  
  if (!hasDashboardAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view the Dashboard.")}
      </div>
    );
  }

  // --- CAMERA STATE ---
  const [cameras, setCameras] = useState([]);
  const [camerasLoading, setCamerasLoading] = useState(true);

  // --- MODERN SUMMARY STATE ---
  const [summary, setSummary] = useState({
    dailySales: 4520,
    salesDelta: 8, // % vs yesterday
    dailyOrders: 39,
    ordersInProgress: 4,
    cash: 2000,
    card: 1800,
    online: 720,
    paymentBreakdown: [],
    openOrders: 0,
    openTables: 0,
    openDeliveryOrders: 0,
    openUnpaidTotal: 0,
    onDutyStaff: [],
    onDutySummary: {
      onDuty: 0,
      onTime: 0,
      late: 0,
      early: 0,
      noSchedule: 0,
      totalMinutesWorked: 0,
      avgLatencyMinutes: 0,
    },
    bestSelling: "Double Burger",
    bestSellingId: 11,
    lowStockCount: 2,
    newCustomers: 4,
    repeatRate: 54,
    avgDelivery: 17,
    avgPrep: 14,
    salesTrend: [1100, 1400, 1900, 3250, 4520],
  });

  // Load cameras
  const loadCameras = useCallback(async () => {
    if (!hasCameraAccess) {
      console.log("📷 No camera access");
      setCamerasLoading(false);
      return;
    }
    console.log("📷 Loading cameras...");
    setCamerasLoading(true);
    try {
      const data = await secureFetch("/camera/list");
      console.log("📷 Cameras loaded:", data);
      setCameras(Array.isArray(data) ? data.slice(0, 3) : []);
    } catch (err) {
      console.log("📷 Camera loading failed:", err.message);
      console.log("📷 Using demo cameras...");
      // Demo cameras for testing
      setCameras([
        {
          id: "demo-1",
          name: "Kitchen Camera",
          hlsUrl: "https://test-streams.mux.dev/x36xhzz/x3izzzyzzde85dt8.m3u8",
          enabled: true,
          location: "Kitchen",
          bitrate: "2500k",
          resolution: "1920x1080",
        },
        {
          id: "demo-2",
          name: "Entrance Camera",
          hlsUrl: "https://test-streams.mux.dev/x36xhzz/x3izzzyzzde85dt8.m3u8",
          enabled: false,
          location: "Entrance",
          bitrate: "1500k",
          resolution: "1280x720",
        },
      ]);
    } finally {
      setCamerasLoading(false);
    }
  }, [hasCameraAccess]);




// ---------------- FETCH SUMMARY (live + tenant-safe) ----------------
const fetchSummaryStats = useCallback(async () => {
  try {
    const today = toLocalYmd(new Date());

    const [
      summaryRes,
      paymentRes,
      categoryRes,
      stockRes,
      ordersRes,
      attendanceRes,
      schedulesRes,
    ] = await Promise.all([
      secureFetch(`/reports/summary?from=${today}&to=${today}`),
      secureFetch(`/reports/sales-by-payment-method?from=${today}&to=${today}`),
      secureFetch(`/reports/sales-by-category-detailed?from=${today}&to=${today}`),
      secureFetch(`/stock`),
      secureFetch(`/orders?status=confirmed`),
      secureFetch(`/staff/attendance`),
      secureFetch(`/staff/schedule`),
    ]);

    // 🥇 3️⃣ Best seller
    let bestSelling = "–";
    let bestTotal = 0;
    for (const category in categoryRes) {
      for (const product of categoryRes[category]) {
        if (product.total > bestTotal) {
          bestTotal = product.total;
          bestSelling = product.name;
        }
      }
    }

    // ⚠️ 4️⃣ Low stock count
    const lowStockCount = Array.isArray(stockRes)
      ? stockRes.filter((s) => {
          if (s.critical_quantity === null || s.critical_quantity === undefined) {
            return false;
          }
          return Number(s.quantity ?? 0) <= Number(s.critical_quantity ?? 0);
        }).length
      : 0;

    const confirmedOrders = Array.isArray(ordersRes) ? ordersRes : [];
    const ordersInProgress = confirmedOrders.length;
    const openTables = confirmedOrders.filter(
      (order) => String(order?.order_type || "").toLowerCase() === "table"
	    ).length;
	    const openDeliveryOrders = confirmedOrders.filter((order) => {
	      const type = String(order?.order_type || "").toLowerCase();
	      return type === "packet" || type === "phone" || type === "takeaway";
	    }).length;
	    const openUnpaidTotal = confirmedOrders.reduce((sum, order) => {
	      const value = Number(order?.total || 0);
	      return sum + (Number.isFinite(value) ? value : 0);
	    }, 0);

      // 🧑‍🍳 5b️⃣ On-duty staff (active check-ins today)
      const schedules = Array.isArray(schedulesRes) ? schedulesRes : [];
      const attendance = Array.isArray(attendanceRes) ? attendanceRes : [];
      const todayKey = today;
      const now = Date.now();
      const thresholdMinutes = 5;

      const normalizeDateKey = (value) => {
        if (!value) return "";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        return toLocalYmd(d);
      };

      const schedulesByStaff = new Map();
      schedules.forEach((shift) => {
        const staffId = Number(shift?.staff_id);
        if (!Number.isFinite(staffId)) return;
        const dateKey = normalizeDateKey(shift?.shift_date);
        if (!dateKey || dateKey !== todayKey) return;
        if (!schedulesByStaff.has(staffId)) schedulesByStaff.set(staffId, []);
        schedulesByStaff.get(staffId).push(shift);
      });

      const getScheduledStart = (shift) => {
        const start = String(shift?.shift_start || "").trim();
        if (!start) return null;
        const startWithSeconds = start.length === 5 ? `${start}:00` : start;
        const dt = new Date(`${todayKey}T${startWithSeconds}`);
        if (Number.isNaN(dt.getTime())) return null;
        return dt;
      };

      const activeToday = attendance.filter((row) => {
        if (!row || row.check_out_time) return false;
        const dateKey = normalizeDateKey(row.check_in_time);
        return dateKey === todayKey;
      });

      const onDutyStaff = activeToday
        .map((row) => {
          const staffId = Number(row.staff_id);
          const staffName = row.staff_name || row.staffName || row.name || `#${row.staff_id}`;
          const role = row.role || "";
          const checkIn = new Date(row.check_in_time);
          const minutesWorked = !Number.isNaN(checkIn.getTime())
            ? Math.max(0, Math.floor((now - checkIn.getTime()) / 60000))
            : 0;

          const staffShifts = schedulesByStaff.get(staffId) || [];
          const scheduledStart = staffShifts.length ? getScheduledStart(staffShifts[0]) : null;
          const latencyMinutes =
            scheduledStart && !Number.isNaN(checkIn.getTime())
              ? Math.round((checkIn.getTime() - scheduledStart.getTime()) / 60000)
              : null;

          const status = (() => {
            if (latencyMinutes === null) return "no_schedule";
            if (Math.abs(latencyMinutes) <= thresholdMinutes) return "on_time";
            return latencyMinutes > 0 ? "late" : "early";
          })();

          return {
            staff_id: staffId,
            name: staffName,
            role,
            check_in_time: row.check_in_time,
            minutesWorked,
            latencyMinutes,
            status,
          };
        })
        .sort((a, b) => (b.minutesWorked || 0) - (a.minutesWorked || 0));

      const onDutySummary = (() => {
        const base = {
          onDuty: onDutyStaff.length,
          onTime: 0,
          late: 0,
          early: 0,
          noSchedule: 0,
          totalMinutesWorked: 0,
          avgLatencyMinutes: 0,
        };
        let latencySum = 0;
        let latencyCount = 0;
        onDutyStaff.forEach((s) => {
          base.totalMinutesWorked += Number(s.minutesWorked || 0);
          if (s.status === "on_time") base.onTime += 1;
          else if (s.status === "late") base.late += 1;
          else if (s.status === "early") base.early += 1;
          else base.noSchedule += 1;

          if (typeof s.latencyMinutes === "number" && Number.isFinite(s.latencyMinutes)) {
            latencySum += s.latencyMinutes;
            latencyCount += 1;
          }
        });
        base.avgLatencyMinutes = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;
        return base;
      })();

	    // 💰 Group payment breakdown
	    const normalizeMethod = (method) => (method || "").toString().toLowerCase().trim();
	    const isCashMethod = (method) => {
      const value = normalizeMethod(method);
      return value === "cash" || value === "nakit";
    };
    const isCardMethod = (method) => {
      const value = normalizeMethod(method);
      return (
        value.includes("card") ||
        value.includes("credit") ||
        value.includes("debit") ||
        value.includes("visa") ||
        value.includes("master") ||
        value.includes("pos") ||
        value.includes("kart")
      );
    };
    const isOnlineMethod = (method) => {
      const value = normalizeMethod(method);
      return (
        value.includes("online") ||
        value.includes("iyzico") ||
        value.includes("stripe") ||
        value.includes("paypal") ||
        value.includes("trendyol") ||
        value.includes("yemeksepeti")
      );
    };

    const cash = paymentRes
      .filter((p) => isCashMethod(p.method))
      .reduce((total, item) => total + (item.value || 0), 0);
    const card = paymentRes
      .filter((p) => isCardMethod(p.method))
      .reduce((total, item) => total + (item.value || 0), 0);
    const online = paymentRes
      .filter((p) => {
        const method = normalizeMethod(p.method);
        if (!method) return false;
        if (isCashMethod(method) || isCardMethod(method)) return false;
        return isOnlineMethod(method) || !!method;
      })
      .reduce((total, item) => total + (item.value || 0), 0);

	    // 📊 6️⃣ Apply to dashboard
	    setSummary({
	      dailySales: summaryRes.daily_sales || 0,
	      salesDelta: 0, // % change placeholder, can add /sales-trends later
	      dailyOrders: Math.round((summaryRes.daily_sales / (summaryRes.average_order_value || 1)) || 0),
	      ordersInProgress,
	      cash,
	      card,
	      online,
	      paymentBreakdown: Array.isArray(paymentRes) ? paymentRes : [],
	      openOrders: ordersInProgress,
	      openTables,
	      openDeliveryOrders,
	      openUnpaidTotal,
        onDutyStaff,
        onDutySummary,
	      bestSelling,
	      lowStockCount,
	      newCustomers: 0, // optional later via /customers
	      repeatRate: 0,
	      avgDelivery: 0,
      avgPrep: 0,
      salesTrend: [summaryRes.gross_sales || 0],
    });
  } catch (err) {
    console.error("❌ Failed to fetch dashboard summary:", err);
  }
}, []);





  useEffect(() => { 
    fetchSummaryStats(); 
    loadCameras();
  }, [fetchSummaryStats, loadCameras]);

  // --- ICONS FOR QUICK ACCESS ---
  const getIcon = (iconName, size = 34) => {
    switch (iconName) {
      case 'Utensils': return <Utensils size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'ChefHat': return <ChefHat size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Package': return <Package size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'BarChart': return <BarChart size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Users': return <Users size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Settings': return <Settings size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'PieChart': return <PieChart size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'ClipboardList': return <ClipboardList size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'TrendingUp': return <TrendingUp size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'FileText': return <FileText size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Factory': return <Factory size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Bot': return <Bot size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'QrCode': return <QrCode size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'CreditCard': return <CreditCard size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'UserCheck': return <UserCheck size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Megaphone': return <Megaphone size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Clock': return <Clock size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Wrench': return <Wrench size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'UserCog': return <UserCog size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Bell': return <Bell size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Printer': return <Printer size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      case 'Plug': return <Plug size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
      default: return <Home size={size} strokeWidth={2.5} className="drop-shadow-sm" />;
    }
  };

  const storageKey = "dashboardQuickAccessOrder";
  const defaultOrder = useMemo(() => {
    // Default dashboard order for first login / fresh browser (matches design screenshot)
    const preferred = [
      "suppliers",
      "stock",
      "products",
      "production",
      "task",
      "user-management",
      "reports",
      "cash-history",
      "ingredient-prices",
      "history",
      "expenses",
      "integrations",
      "qr-menu",
      "staff",
      "payroll",
      "orders",
      "packet",
      "kitchen",
      "maintenance",
      "customer-insights",
      "marketing-campaigns",
      "printers",
      "notifications",
      "settings",
    ];

    const allIds = QUICK_ACCESS_CONFIG.map((item) => item.id);
    const base = preferred.filter((id) => allIds.includes(id));
    const remainder = allIds.filter((id) => !base.includes(id));
    return [...base, ...remainder];
  }, []);

  const [quickAccessOrder, setQuickAccessOrder] = useState(() => {
    if (typeof window === "undefined") return [...defaultOrder];
    try {
      const raw = JSON.parse(
        window.localStorage.getItem(storageKey) || "[]"
      );
      if (Array.isArray(raw) && raw.length) {
        const filtered = raw.filter((id) =>
          defaultOrder.includes(id)
        );
        const merged = [
          ...filtered,
          ...defaultOrder.filter((id) => !filtered.includes(id)),
        ];
        return merged;
      }
    } catch (err) {
      console.warn("⚠️ Failed to parse quick access order from storage:", err);
    }
    return [...defaultOrder];
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(quickAccessOrder)
    );
  }, [quickAccessOrder]);

  useEffect(() => {
    setQuickAccessOrder((prev) => {
      const merged = [
        ...prev.filter((id) => defaultOrder.includes(id)),
        ...defaultOrder.filter((id) => !prev.includes(id)),
      ];
      const unique = merged.filter(
        (id, index) => merged.indexOf(id) === index
      );
      const isSame =
        unique.length === prev.length &&
        unique.every((id, idx) => id === prev[idx]);
      return isSame ? prev : unique;
    });
  }, [defaultOrder]);

  const configMap = useMemo(() => {
    const map = new Map();
    QUICK_ACCESS_CONFIG.forEach((item) => map.set(item.id, item));
    return map;
  }, []);

  const orderedConfigs = useMemo(
    () =>
      quickAccessOrder
        .map((id) => configMap.get(id))
        .filter(Boolean),
    [quickAccessOrder, configMap]
  );

  const allowedAccess = useMemo(() => {
    if (!currentUser) return [];
    return orderedConfigs.filter((item) => {
      const permissionKey =
        item.permission || item.path.replace("/", "").toLowerCase();
      if (currentUser.permissions?.includes("all")) return true;
      if (permissionKey) {
        const normalizedKey = String(permissionKey).toLowerCase().replaceAll(".", "-");
        if (currentUser.permissions?.includes(normalizedKey)) return true;
      }
      if (!permissionKey) return false;
      return currentUser.permissions?.some(
        (perm) =>
          String(permissionKey).toLowerCase().replaceAll(".", "-") ===
          String(perm).toLowerCase().replaceAll(".", "-")
      );
    });
  }, [orderedConfigs, currentUser]);

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = (item, label) => (event) => {
    event.dataTransfer.setData("text/plain", item.id);
    try {
      event.dataTransfer.setData(
        DASHBOARD_TO_SIDEBAR_TYPE,
        JSON.stringify({
          labelKey: item.labelKey,
          defaultLabel: label,
          path: item.path,
        })
      );
    } catch {
      /* ignore serialization issues */
    }
    event.dataTransfer.effectAllowed = "move";
    setDraggedId(item.id);
  };

  const handleDragOverItem = (id) => (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDragLeave = (id) => () => {
    setDragOverId((prev) => (prev === id ? null : prev));
  };

  const handleDrop = (targetId) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const dragged = event.dataTransfer.getData("text/plain");
    setDragOverId(null);
    setDraggedId(null);
    if (!dragged || dragged === targetId) return;

    setQuickAccessOrder((prev) => {
      if (!prev.includes(dragged) || !prev.includes(targetId)) return prev;
      const updated = prev.filter((id) => id !== dragged);
      const targetIndex = updated.indexOf(targetId);
      if (targetIndex === -1) return prev;
      updated.splice(targetIndex, 0, dragged);
      return updated;
    });
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleNavDrop = (event) => {
    event.preventDefault();
    const dragged = event.dataTransfer.getData("text/plain");
    setDragOverId(null);
    setDraggedId(null);
    if (!dragged) return;
    setQuickAccessOrder((prev) => {
      if (!prev.includes(dragged)) return prev;
      const filtered = prev.filter((id) => id !== dragged);
      return [...filtered, dragged];
    });
  };

  return (
    <div className="min-h-screen px-3 md:px-6 py-8 space-y-8">
      {/* Quick Access Grid (Filtered by permissions) */}
      {allowedAccess.length > 0 ? (
        <div
          className="w-full flex justify-center"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleNavDrop}
        >
          <div className="w-full max-w-7xl px-0 py-5 rounded-[2rem] bg-transparent border border-transparent">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 sm:gap-x-8 gap-y-6 place-items-center">
              {allowedAccess.map((item) => {
                const label = t(item.labelKey, {
                  defaultValue: item.defaultLabel ?? item.labelKey,
                });
                const isDragging = draggedId === item.id;
                const isDragOver = dragOverId === item.id && draggedId !== item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (draggedId) return;
                      navigate(item.path);
                    }}
                    className={`group w-24 sm:w-28 lg:w-32 select-none outline-none cursor-grab active:cursor-grabbing transition-transform duration-200 ${
                      isDragOver ? "scale-[1.03]" : ""
                    } ${isDragging ? "opacity-60" : ""}`}
                    draggable
                    onDragStart={handleDragStart(item, label)}
                    onDragOver={handleDragOverItem(item.id)}
                    onDragLeave={handleDragLeave(item.id)}
                    onDrop={handleDrop(item.id)}
                    onDragEnd={handleDragEnd}
                    aria-grabbed={isDragging}
                  >
                    <div className="flex flex-col items-center justify-end gap-2">
                      <div
                        className={`w-[4.25rem] h-[4.25rem] sm:w-[4.75rem] sm:h-[4.75rem] rounded-2xl shadow-lg ring-1 ring-black/10 dark:ring-white/10 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${
                          item.color || "bg-gradient-to-br from-indigo-400 to-indigo-600"
                        }`}
                      >
                        <div className="text-white drop-shadow-sm">
                          {getIcon(item.icon, 38)}
                        </div>
                      </div>
                      <div className="h-9 flex items-center justify-center text-[0.86rem] font-medium tracking-tight text-black/90 dark:text-white/90 text-center leading-tight">
                        {label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8 text-lg">
          {t("You have limited access. Please contact your admin for more permissions.")}
        </div>
      )}

	    {/* Live Cameras Section - Always show if permitted and has cameras or loading */}
	    {hasCameraAccess && (camerasLoading || cameras.length > 0) && (
        <div className="w-full flex justify-center">
          <div className="w-full max-w-7xl">
	          <LiveCamerasSection cameras={cameras} loading={camerasLoading} onNavigate={() => navigate("/settings/cameras")} t={t} />
          </div>
        </div>
	    )}

	    {/* Business Snapshot */}
	    {canSeeBusinessSnapshot && (
        <div className="w-full flex justify-center">
          <div className="w-full max-w-7xl">
	          <BusinessSnapshot summary={summary} onRefresh={fetchSummaryStats} />
          </div>
        </div>
	    )}

	    </div>
	  );

}

// ---- Business Snapshot Section ----
function BusinessSnapshot({ summary = {}, onRefresh }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const paymentMethods = usePaymentMethods();

  const snap = {
    dailySales: summary.dailySales ?? 0,
    salesDelta: summary.salesDelta ?? 0,
    dailyOrders: summary.dailyOrders ?? 0,
    ordersInProgress: summary.ordersInProgress ?? 0,
    cash: summary.cash ?? 0,
    card: summary.card ?? 0,
    online: summary.online ?? 0,
    openOrders: summary.openOrders ?? summary.ordersInProgress ?? 0,
    openTables: summary.openTables ?? 0,
    openDeliveryOrders: summary.openDeliveryOrders ?? 0,
    openUnpaidTotal: summary.openUnpaidTotal ?? 0,
    onDutyStaff: Array.isArray(summary.onDutyStaff) ? summary.onDutyStaff : [],
    onDutySummary:
      summary.onDutySummary && typeof summary.onDutySummary === "object"
        ? summary.onDutySummary
        : {
            onDuty: 0,
            onTime: 0,
            late: 0,
            early: 0,
            noSchedule: 0,
            totalMinutesWorked: 0,
            avgLatencyMinutes: 0,
          },
    bestSelling: summary.bestSelling ?? "-",
    lowStockCount: summary.lowStockCount ?? 0,
    newCustomers: summary.newCustomers ?? 0,
    repeatRate: summary.repeatRate ?? 0,
    avgDelivery: summary.avgDelivery ?? 0,
    avgPrep: summary.avgPrep ?? 0,
    salesTrend: summary.salesTrend ?? [],
  };

  const safeSlug = useCallback((value) => {
    const base = (value || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return base;
  }, []);

  const paymentMix = useMemo(() => {
    const methods = Array.isArray(paymentMethods) ? paymentMethods : [];
    const breakdown = Array.isArray(summary.paymentBreakdown)
      ? summary.paymentBreakdown
      : [];

    const keyToId = new Map();
    methods.forEach((method) => {
      const id = String(method?.id || "").trim();
      if (!id) return;
      keyToId.set(id, id);
      keyToId.set(safeSlug(id), id);

      const label = String(method?.label || "").trim();
      if (label) {
        keyToId.set(label.toLowerCase(), id);
        keyToId.set(safeSlug(label), id);
      }
    });

    const totalsById = new Map();
    let otherTotal = 0;
    breakdown.forEach((row) => {
      const rawMethod = String(row?.method || "").trim();
      const value = Number(row?.value || 0) || 0;
      if (!rawMethod || !Number.isFinite(value) || value <= 0) return;

      const id =
        keyToId.get(safeSlug(rawMethod)) || keyToId.get(rawMethod.toLowerCase());
      if (!id) {
        otherTotal += value;
        return;
      }
      totalsById.set(id, (totalsById.get(id) || 0) + value);
    });

    const items = methods.map((method) => ({
      id: method.id,
      label: method.label,
      icon: method.icon || "💳",
      amount: totalsById.get(method.id) || 0,
    }));

    if (otherTotal > 0) {
      items.push({
        id: "__other__",
        label: t("Other", "Other"),
        icon: "➕",
        amount: otherTotal,
      });
    }

    const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const sorted = [...items].sort((a, b) => (b.amount || 0) - (a.amount || 0));

    return {
      methods,
      total,
      items: sorted,
    };
  }, [paymentMethods, summary.paymentBreakdown, safeSlug, t]);

  const paymentStyles = useMemo(
    () => [
      {
        bar: "bg-emerald-500",
        tileBg: "bg-emerald-50",
        ring: "ring-emerald-100",
        text: "text-emerald-700",
        darkBg: "dark:bg-emerald-500/10",
        darkRing: "dark:ring-emerald-500/20",
        darkText: "dark:text-emerald-300",
      },
      {
        bar: "bg-sky-500",
        tileBg: "bg-sky-50",
        ring: "ring-sky-100",
        text: "text-sky-700",
        darkBg: "dark:bg-sky-500/10",
        darkRing: "dark:ring-sky-500/20",
        darkText: "dark:text-sky-300",
      },
      {
        bar: "bg-pink-500",
        tileBg: "bg-pink-50",
        ring: "ring-pink-100",
        text: "text-pink-700",
        darkBg: "dark:bg-pink-500/10",
        darkRing: "dark:ring-pink-500/20",
        darkText: "dark:text-pink-300",
      },
      {
        bar: "bg-amber-500",
        tileBg: "bg-amber-50",
        ring: "ring-amber-100",
        text: "text-amber-800",
        darkBg: "dark:bg-amber-500/10",
        darkRing: "dark:ring-amber-500/20",
        darkText: "dark:text-amber-300",
      },
      {
        bar: "bg-violet-500",
        tileBg: "bg-violet-50",
        ring: "ring-violet-100",
        text: "text-violet-700",
        darkBg: "dark:bg-violet-500/10",
        darkRing: "dark:ring-violet-500/20",
        darkText: "dark:text-violet-300",
      },
      {
        bar: "bg-teal-500",
        tileBg: "bg-teal-50",
        ring: "ring-teal-100",
        text: "text-teal-800",
        darkBg: "dark:bg-teal-500/10",
        darkRing: "dark:ring-teal-500/20",
        darkText: "dark:text-teal-300",
      },
    ],
    []
  );

  const paymentStyleById = useMemo(() => {
    const map = new Map();
    (paymentMix.methods || []).forEach((method, idx) => {
      map.set(method.id, paymentStyles[idx % paymentStyles.length]);
    });
    map.set("__other__", {
      bar: "bg-slate-400",
      tileBg: "bg-slate-50",
      ring: "ring-slate-200",
      text: "text-slate-700",
      darkBg: "dark:bg-slate-500/10",
      darkRing: "dark:ring-slate-500/20",
      darkText: "dark:text-slate-300",
    });
    return map;
  }, [paymentMix.methods, paymentStyles]);

  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {t("Business Snapshot")}
        </h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="ml-2 px-3 py-1 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 font-semibold hover:bg-blue-200 hover:scale-105 transition"
          >
            {t("Refresh")}
          </button>
        )}
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-4">
        <SnapshotCard>
          <div className="flex items-center gap-3">
            <BarChart className="text-green-500 w-7 h-7" />
            <div>
              <div className="text-2xl font-extrabold">
                {formatCurrency(snap.dailySales)}
              </div>
              <div className="text-xs text-gray-500">{t("Sales today")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm font-bold">
            {snap.salesDelta >= 0 ? (
              <span className="flex items-center text-green-600 animate-slideup">
                <ArrowUpRight className="w-4 h-4" /> +{snap.salesDelta}%
              </span>
            ) : (
              <span className="flex items-center text-red-600 animate-slidedown">
                <ArrowDownRight className="w-4 h-4" /> {snap.salesDelta}%
              </span>
            )}
            <span className="text-gray-400 text-xs">{t("vs yesterday")}</span>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {t("Orders count label", { count: snap.dailyOrders })}
          </div>
        </SnapshotCard>

        <SnapshotCard
          onClick={() => navigate("/kitchen")}
          className="cursor-pointer hover:ring-2 hover:ring-blue-400"
        >
          <div className="flex items-center gap-3">
            <ClipboardList className="text-blue-500 w-7 h-7" />
            <div>
              <div className="text-2xl font-extrabold">{snap.ordersInProgress}</div>
              <div className="text-xs text-gray-500">{t("In Progress")}</div>
            </div>
          </div>
        </SnapshotCard>

        <SnapshotCard
          onClick={() => navigate("/stock")}
          className="cursor-pointer hover:ring-2 hover:ring-red-400"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500 w-7 h-7" />
            <div>
              <div className="text-2xl font-extrabold">{snap.lowStockCount}</div>
              <div className="text-xs text-gray-500">{t("Stock Alerts")}</div>
            </div>
          </div>
        </SnapshotCard>

        <SnapshotCard
          onClick={() => navigate("/products")}
          className="cursor-pointer hover:ring-2 hover:ring-yellow-300"
        >
          <div className="flex items-center gap-3">
            <Star className="text-yellow-400 w-7 h-7" />
            <div>
              <div className="text-lg font-extrabold">{snap.bestSelling}</div>
              <div className="text-xs text-gray-500">{t("Best Seller")}</div>
            </div>
          </div>
        </SnapshotCard>
      </div>

      {/* Payment mix */}
      <div className="grid grid-cols-1 gap-5">
        <MiniCard className="p-7 sm:p-8">
          {(() => {
            const total = paymentMix.total || 0;
            const pct = (value) => (total > 0 ? (value / total) * 100 : 0);
            const barItems = paymentMix.items.filter((item) => (item.amount || 0) > 0);

            return (
              <>
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div className="text-sm font-extrabold text-gray-900 dark:text-white">
                    {t("Payment Mix", "Payment Mix")}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                    {t("Total", "Total")}:{" "}
                    <span className="text-gray-900 dark:text-gray-100 font-extrabold">
                      {formatCurrency(total)}
                    </span>
                  </div>
                </div>

                <div className="flex h-4 sm:h-5 rounded-full bg-gray-100 dark:bg-zinc-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
                  {barItems.length > 0 ? (
                    barItems.map((item) => {
                      const style = paymentStyleById.get(item.id) || paymentStyleById.get("__other__");
                      return (
                        <div
                          key={item.id}
                          className={`h-full ${style.bar}`}
                          style={{ width: `${pct(item.amount)}%` }}
                          title={`${item.label}: ${formatCurrency(item.amount)}`}
                        />
                      );
                    })
                  ) : (
                    <div className="h-full w-full bg-gray-200 dark:bg-zinc-700" />
                  )}
                </div>

                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-center">
                  {paymentMix.items.map((item) => {
                    const style = paymentStyleById.get(item.id) || paymentStyleById.get("__other__");
                    const percent = pct(item.amount || 0);
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl ${style.tileBg} ${style.darkBg} py-3 ring-1 ${style.ring} ${style.darkRing}`}
                      >
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1 px-3">
                          <span className="text-base leading-none">{item.icon}</span>
                          <span className="truncate">{t(item.label)}</span>
                        </div>
                        <div className={`text-lg font-extrabold ${style.text} ${style.darkText}`}>
                          {Math.round(percent)}%
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                          {formatCurrency(item.amount || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </MiniCard>

        <MiniCard className="p-7 sm:p-8">
          {(() => {
            const openOrders = Number(snap.openOrders || 0);
            const openTables = Number(snap.openTables || 0);
            const openDelivery = Number(snap.openDeliveryOrders || 0);
            const openTotal = Number(snap.openUnpaidTotal || 0);
            const avgTicket = openOrders > 0 ? openTotal / openOrders : 0;

            const tiles = [
              {
                label: t("Open Orders", "Open Orders"),
                value: openOrders,
                icon: <ClipboardList className="w-4 h-4" />,
                bg: "bg-indigo-50",
                ring: "ring-indigo-100",
                text: "text-indigo-700",
                darkBg: "dark:bg-indigo-500/10",
                darkRing: "dark:ring-indigo-500/20",
                darkText: "dark:text-indigo-300",
              },
              {
                label: t("Tables", "Tables"),
                value: openTables,
                icon: <Utensils className="w-4 h-4" />,
                bg: "bg-emerald-50",
                ring: "ring-emerald-100",
                text: "text-emerald-700",
                darkBg: "dark:bg-emerald-500/10",
                darkRing: "dark:ring-emerald-500/20",
                darkText: "dark:text-emerald-300",
              },
              {
                label: t("Delivery", "Delivery"),
                value: openDelivery,
                icon: <Package className="w-4 h-4" />,
                bg: "bg-amber-50",
                ring: "ring-amber-100",
                text: "text-amber-800",
                darkBg: "dark:bg-amber-500/10",
                darkRing: "dark:ring-amber-500/20",
                darkText: "dark:text-amber-300",
              },
              {
                label: t("Avg Ticket", "Avg Ticket"),
                value: formatCurrency(avgTicket),
                icon: <TrendingUp className="w-4 h-4" />,
                bg: "bg-sky-50",
                ring: "ring-sky-100",
                text: "text-sky-700",
                darkBg: "dark:bg-sky-500/10",
                darkRing: "dark:ring-sky-500/20",
                darkText: "dark:text-sky-300",
              },
            ];

            return (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-50 dark:bg-zinc-800 flex items-center justify-center ring-1 ring-slate-200 dark:ring-white/10">
                      <Clock className="w-5 h-5 text-slate-700 dark:text-slate-200" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-gray-900 dark:text-white">
                        {t("Shift Pulse", "Shift Pulse")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Unpaid total", "Unpaid total")}:{" "}
                        <span className="font-extrabold text-gray-900 dark:text-gray-100">
                          {formatCurrency(openTotal)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/tableoverview?tab=tables")}
                    className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-extrabold hover:bg-slate-800 transition"
                  >
                    {t("Go to Tables", "Go to Tables")}
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  {tiles.map((tile) => (
                    <div
                      key={tile.label}
                      className={`rounded-2xl ${tile.bg} ${tile.darkBg} py-3 ring-1 ${tile.ring} ${tile.darkRing}`}
                    >
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2 px-3">
                        <span className={`${tile.text} ${tile.darkText}`}>{tile.icon}</span>
                        <span className="truncate">{tile.label}</span>
                      </div>
                      <div className={`mt-0.5 text-lg font-extrabold ${tile.text} ${tile.darkText}`}>
                        {tile.value}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </MiniCard>

        <MiniCard className="p-7 sm:p-8">
          {(() => {
            const summary = snap.onDutySummary || {};
            const onDuty = Number(summary.onDuty || 0);
            const onTime = Number(summary.onTime || 0);
            const late = Number(summary.late || 0);
            const early = Number(summary.early || 0);
            const noSchedule = Number(summary.noSchedule || 0);
            const totalMinutesWorked = Number(summary.totalMinutesWorked || 0);

            const formatMinutes = (minutes) => {
              const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
              const hours = Math.floor(safeMinutes / 60);
              const mins = safeMinutes % 60;
              return `${hours}h ${String(mins).padStart(2, "0")}m`;
            };

            const badgeForStatus = (status, latencyMinutes) => {
              if (status === "on_time") {
                return {
                  label: t("On time", "On time"),
                  cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
                };
              }
              if (status === "late") {
                const mins = Math.abs(Number(latencyMinutes || 0));
                return {
                  label: `${t("Late", "Late")} ${mins}m`,
                  cls: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
                };
              }
              if (status === "early") {
                const mins = Math.abs(Number(latencyMinutes || 0));
                return {
                  label: `${t("Early", "Early")} ${mins}m`,
                  cls: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
                };
              }
              return {
                label: t("No schedule", "No schedule"),
                cls: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
              };
            };

            const staff = Array.isArray(snap.onDutyStaff) ? snap.onDutyStaff : [];
            const top = staff.slice(0, 6);

            return (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center ring-1 ring-indigo-100 dark:ring-indigo-500/20">
                      <Users className="w-5 h-5 text-indigo-700 dark:text-indigo-200" />
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-gray-900 dark:text-white">
                        {t("On Duty Staff", "On Duty Staff")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {t("Worked today", "Worked today")}:{" "}
                        <span className="font-extrabold text-gray-900 dark:text-gray-100">
                          {formatMinutes(totalMinutesWorked)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/staff")}
                    className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-extrabold hover:bg-indigo-500 transition"
                  >
                    {t("Staff", "Staff")}
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                  {[
                    { label: t("On duty", "On duty"), value: onDuty, cls: "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200 ring-indigo-100 dark:ring-indigo-500/20" },
                    { label: t("On time", "On time"), value: onTime, cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200 ring-emerald-100 dark:ring-emerald-500/20" },
                    { label: t("Late", "Late"), value: late, cls: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200 ring-rose-100 dark:ring-rose-500/20" },
                    { label: t("Early", "Early"), value: early, cls: "bg-sky-50 text-sky-800 dark:bg-sky-500/10 dark:text-sky-200 ring-sky-100 dark:ring-sky-500/20" },
                    { label: t("No schedule", "No schedule"), value: noSchedule, cls: "bg-slate-50 text-slate-700 dark:bg-white/5 dark:text-slate-200 ring-slate-200 dark:ring-white/10" },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      className={`rounded-2xl py-3 ring-1 ${tile.cls}`}
                    >
                      <div className="text-[11px] font-semibold opacity-80 px-2 truncate">
                        {tile.label}
                      </div>
                      <div className="text-lg font-extrabold">{tile.value}</div>
                    </div>
                  ))}
                </div>

                {top.length > 0 ? (
                  <div className="mt-5 space-y-2">
                    {top.map((member) => {
                      const badge = badgeForStatus(member.status, member.latencyMinutes);
                      return (
                        <div
                          key={member.staff_id || member.name}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 dark:bg-zinc-900/50 px-4 py-3 ring-1 ring-black/5 dark:ring-white/10"
                        >
                          <div className="min-w-0">
                            <div className="font-extrabold text-gray-900 dark:text-white truncate">
                              {member.name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {(member.role && `${member.role} • `) || ""}
                              {t("Worked", "Worked")}: {formatMinutes(member.minutesWorked || 0)}
                            </div>
                          </div>
                          <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-extrabold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl bg-slate-50 dark:bg-white/5 px-4 py-4 text-center text-sm font-semibold text-slate-600 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-white/10">
                    {t("No one checked in yet", "No one checked in yet")}
                  </div>
                )}
              </>
            );
          })()}
        </MiniCard>
      </div>
    </section>
  );
}


function SnapshotCard({ children, onClick, className }) {
  return (
    <div
      className={`
        rounded-2xl bg-white dark:bg-zinc-900 shadow-xl p-6 border border-gray-100 dark:border-zinc-800
        hover:shadow-2xl transition min-h-[130px] flex flex-col justify-between group ${className || ""}
      `}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {children}
    </div>
  );
}
function MiniCard({ children, className }) {
  return (
    <div
      className={`rounded-xl bg-white dark:bg-zinc-900/80 shadow p-5 border border-gray-100 dark:border-zinc-800 ${className || ""}`}
    >
      {children}
    </div>
  );
}

// ---- Live Cameras Section ----
function LiveCamerasSection({ cameras = [], loading = false, onNavigate, t }) {
  if (loading) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="w-6 h-6 text-red-500" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {t("Live Cameras", "Live Cameras")}
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-xl h-40 animate-pulse border border-gray-100 dark:border-zinc-800"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!cameras || cameras.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Video className="w-6 h-6 text-red-500" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t("Live Cameras", "Live Cameras")}
          </h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({cameras.length})
          </span>
        </div>
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 px-3 py-1 text-sm rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 font-semibold hover:bg-blue-200 hover:scale-105 transition"
        >
          {t("View All", "View All")}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cameras.map((camera) => (
          <div
            key={camera.id}
            className="group bg-white dark:bg-zinc-900 rounded-xl overflow-hidden border border-gray-100 dark:border-zinc-800 shadow-md hover:shadow-xl transition"
          >
            {/* Camera Placeholder/Status */}
            <div className="w-full h-40 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-zinc-800 dark:to-zinc-700 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-black/5 dark:bg-black/20" />
              <Video className="w-16 h-16 text-gray-400 dark:text-gray-500 relative z-10" />
              
              {/* Live Badge */}
              {camera.enabled && (
                <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-bold z-20">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
              )}
            </div>

            {/* Camera Info */}
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1 truncate">
                {camera.name}
              </h3>
              
              {camera.location && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">
                  📍 {camera.location}
                </p>
              )}

              {/* Camera Details */}
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {camera.resolution && (
                  <div className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">
                    <span className="text-gray-600 dark:text-gray-400">Resolution</span>
                    <div className="font-mono text-gray-900 dark:text-white">
                      {camera.resolution}
                    </div>
                  </div>
                )}
                {camera.bitrate && (
                  <div className="bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded">
                    <span className="text-gray-600 dark:text-gray-400">Bitrate</span>
                    <div className="font-mono text-gray-900 dark:text-white">
                      {camera.bitrate}
                    </div>
                  </div>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    camera.enabled ? "bg-green-500 animate-pulse" : "bg-gray-400"
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    camera.enabled
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {camera.enabled ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
