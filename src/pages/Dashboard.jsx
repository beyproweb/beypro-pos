// src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";

import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useNavigate } from 'react-router-dom';
import {
  Home, Utensils, Package, BarChart, Users, Settings, QrCode,
  PieChart, ClipboardList, TrendingUp, FileText, Factory, Bot,
  UserCheck, Megaphone, Wrench, Star, AlertTriangle, CreditCard,
  Clock, ChevronRight, ArrowUpRight, ArrowDownRight, ChefHat
} from 'lucide-react';
import axios from "axios";
import socket from "../utils/socket"; // adjust path as needed!
// Set your API URL

const QUICK_ACCESS_CONFIG = [
  {
    id: "orders",
    labelKey: "Orders",
    defaultLabel: "Orders",
    path: "/tables",
    color: "bg-gradient-to-r from-rose-400 to-pink-500",
    icon: "ClipboardList",
  },
  {
    id: "kitchen",
    labelKey: "Kitchen",
    defaultLabel: "Kitchen",
    path: "/kitchen",
    color: "bg-gradient-to-r from-purple-500 to-violet-600",
    icon: "ChefHat",
  },
  {
    id: "products",
    labelKey: "Products",
    defaultLabel: "Products",
    path: "/products",
    color: "bg-gradient-to-r from-blue-500 to-indigo-500",
    icon: "Utensils",
  },
  {
    id: "suppliers",
    labelKey: "Suppliers",
    defaultLabel: "Suppliers",
    path: "/suppliers",
    color: "bg-gradient-to-r from-green-500 to-teal-500",
    icon: "Package",
  },
  {
    id: "stock",
    labelKey: "Stock",
    defaultLabel: "Stock",
    path: "/stock",
    color: "bg-gradient-to-r from-yellow-500 to-amber-500",
    icon: "BarChart",
  },
  {
    id: "production",
    labelKey: "Production",
    defaultLabel: "Production",
    path: "/production",
    color: "bg-gradient-to-r from-purple-500 to-violet-500",
    icon: "Factory",
  },
  {
    id: "staff",
    labelKey: "Staff",
    defaultLabel: "Staff",
    path: "/staff",
    color: "bg-gradient-to-r from-sky-500 to-cyan-500",
    icon: "Users",
  },
  {
    id: "task",
    labelKey: "Task",
    defaultLabel: "Task",
    path: "/task",
    color: "bg-gradient-to-r from-indigo-500 to-blue-700",
    icon: "Bot",
  },
  {
    id: "reports",
    labelKey: "Reports",
    defaultLabel: "Reports",
    path: "/reports",
    color: "bg-gradient-to-r from-orange-500 to-yellow-600",
    icon: "FileText",
  },
  {
    id: "expenses",
    labelKey: "Expenses",
    defaultLabel: "Expenses",
    path: "/expenses",
    color: "bg-gradient-to-r from-red-500 to-rose-500",
    icon: "FileText",
  },
  {
    id: "ingredient-prices",
    labelKey: "Ingredient Prices",
    defaultLabel: "Ingredient Prices",
    path: "/ingredient-prices",
    color: "bg-gradient-to-r from-lime-500 to-green-600",
    icon: "BarChart",
  },
  {
    id: "cash-history",
    labelKey: "Cash History",
    defaultLabel: "Cash History",
    path: "/cash-register-history",
    color: "bg-accent",
    icon: "PieChart",
  },
  {
    id: "integrations",
    labelKey: "Integrations",
    defaultLabel: "Integrations",
    path: "/integrations",
    color: "bg-accent",
    icon: "Settings",
  },
  {
    id: "settings",
    labelKey: "Settings",
    defaultLabel: "Settings",
    path: "/settings",
    color: "bg-gradient-to-r from-gray-700 to-gray-900",
    icon: "Settings",
  },
  {
    id: "qr-menu",
    labelKey: "QR Menu",
    defaultLabel: "QR Menu",
    path: "/qr-menu-settings",
    color: "bg-gradient-to-r from-indigo-500 to-blue-700",
    icon: "QrCode",
  },
  {
    id: "customer-insights",
    labelKey: "Customer Insights",
    defaultLabel: "Customer Insights",
    path: "/customer-insights",
    color: "bg-gradient-to-r from-pink-400 to-purple-500",
    icon: "UserCheck",
  },
  {
    id: "marketing-campaigns",
    labelKey: "Marketing Campaigns",
    defaultLabel: "Marketing Campaigns",
    path: "/marketing-campaigns",
    color: "bg-gradient-to-r from-amber-400 to-orange-600",
    icon: "Megaphone",
  },
  {
    id: "maintenance",
    labelKey: "Maintenance",
    defaultLabel: "Maintenance",
    path: "/maintenance",
    color: "bg-gradient-to-r from-gray-400 to-gray-700",
    icon: "Wrench",
  },
];


export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const hasDashboardAccess = useHasPermission("dashboard");
  if (!hasDashboardAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view the Dashboard.")}
      </div>
    );
  }

  // --- MODERN SUMMARY STATE ---
  const [summary, setSummary] = useState({
    dailySales: 4520,
    salesDelta: 8, // % vs yesterday
    dailyOrders: 39,
    ordersInProgress: 4,
    cash: 2000,
    card: 1800,
    online: 720,
    bestSelling: "Double Burger",
    bestSellingId: 11,
    lowStockCount: 2,
    newCustomers: 4,
    repeatRate: 54,
    avgDelivery: 17,
    avgPrep: 14,
    salesTrend: [1100, 1400, 1900, 3250, 4520],
  });

  // Fetch all summary stats (replace mock logic here)
  const fetchSummaryStats = useCallback(async () => {
    // TODO: Connect to your real API endpoints
    // Example:
    // const salesRes = await axios.get(`${API_URL}/api/reports/summary`);
    // ...setSummary({ ... })
    // Keep the mock for now
  }, []);

  useEffect(() => { fetchSummaryStats(); }, [fetchSummaryStats]);

  // --- ICONS FOR QUICK ACCESS ---
  const getIcon = (iconName) => {
    switch (iconName) {
      case 'Utensils': return <Utensils size={28} />;
      case 'ChefHat': return <ChefHat size={28} />;
      case 'Package': return <Package size={28} />;
      case 'BarChart': return <BarChart size={28} />;
      case 'Users': return <Users size={28} />;
      case 'Settings': return <Settings size={28} />;
      case 'PieChart': return <PieChart size={28} />;
      case 'ClipboardList': return <ClipboardList size={28} />;
      case 'TrendingUp': return <TrendingUp size={28} />;
      case 'FileText': return <FileText size={28} />;
      case 'Factory': return <Factory size={28} />;
      case 'Bot': return <Bot size={28} />;
      case 'QrCode': return <QrCode size={28} />;
      case 'UserCheck': return <UserCheck size={28} />;
      case 'Megaphone': return <Megaphone size={28} />;
      case 'Wrench': return <Wrench size={28} />;
      default: return <Home size={28} />;
    }
  };

  const storageKey = "dashboardQuickAccessOrder";
  const defaultOrder = useMemo(
    () => QUICK_ACCESS_CONFIG.map((item) => item.id),
    []
  );

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
      if (permissionKey && currentUser.permissions?.includes(permissionKey))
        return true;
      if (!permissionKey) return false;
      return currentUser.permissions?.some((perm) =>
        permissionKey.includes(perm.toLowerCase())
      );
    });
  }, [orderedConfigs, currentUser]);

  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleDragStart = (id) => (event) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggedId(id);
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
    <div className="min-h-screen px-6 py-8 bg-gradient-to-br from-white-50 to-gray-100 dark:from-black dark:to-gray-900 space-y-8">
      {/* Quick Access Grid (Filtered by permissions) */}
      {allowedAccess.length > 0 ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-5"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleNavDrop}
        >
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
                className={`group rounded-2xl p-4 ${item.color} text-white shadow-lg hover:scale-[1.03] transform transition-all duration-300 cursor-grab active:cursor-grabbing ${
                  isDragOver ? "ring-2 ring-white/70" : ""
                } ${isDragging ? "opacity-70" : ""}`}
                draggable
                onDragStart={handleDragStart(item.id)}
                onDragOver={handleDragOverItem(item.id)}
                onDragLeave={handleDragLeave(item.id)}
                onDrop={handleDrop(item.id)}
                onDragEnd={handleDragEnd}
                aria-grabbed={isDragging}
              >
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-accent mb-2 shadow-inner group-hover:rotate-6 transition-all">
                  {getIcon(item.icon)}
                </div>
                <div className="text-sm font-semibold text-center tracking-tight">
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8 text-lg">
          {t("You have limited access. Please contact your admin for more permissions.")}
        </div>
      )}

    {/* Business Snapshot (only if user has higher-level access) */}
{(currentUser.permissions?.includes("all") ||
  currentUser.permissions?.includes("reports")) && (
  <BusinessSnapshot summary={summary} onRefresh={fetchSummaryStats} />
)}

    </div>
  );

}

// ---- Business Snapshot Section ----
function BusinessSnapshot({ summary = {}, onRefresh }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const snap = {
    dailySales: summary.dailySales ?? 4350,
    salesDelta: summary.salesDelta ?? +12,
    dailyOrders: summary.dailyOrders ?? 43,
    ordersInProgress: summary.ordersInProgress ?? 6,
    cash: summary.cash ?? 2100,
    card: summary.card ?? 1500,
    online: summary.online ?? 750,
    bestSelling: summary.bestSelling ?? "Double Burger",
    bestSellingId: summary.bestSellingId ?? 11,
    lowStockCount: summary.lowStockCount ?? 3,
    newCustomers: summary.newCustomers ?? 7,
    repeatRate: summary.repeatRate ?? 56,
    avgDelivery: summary.avgDelivery ?? 19,
    avgPrep: summary.avgPrep ?? 14,
    salesTrend: summary.salesTrend ?? [1400, 1800, 2100, 3000, 4350],
  };

  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("Business Snapshot")}</h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="ml-2 px-3 py-1 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200 font-semibold hover:bg-blue-200 hover:scale-105 transition"
          >
            {t("Refresh")}
          </button>
        )}
      </div>
      {/* Main cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-4">
        {/* Sales Today */}
        <SnapshotCard>
          <div className="flex items-center gap-3">
            <BarChart className="text-green-500 w-7 h-7" />
            <div>
              <div className="text-2xl font-extrabold">₺{snap.dailySales.toLocaleString()}</div>
              <div className="text-xs text-gray-500">{t("Sales today")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm font-bold">
            {snap.salesDelta >= 0
              ? <span className="flex items-center text-green-600 animate-slideup">
                  <ArrowUpRight className="w-4 h-4" />
                  +{snap.salesDelta}%
                </span>
              : <span className="flex items-center text-red-600 animate-slidedown">
                  <ArrowDownRight className="w-4 h-4" />
                  {snap.salesDelta}%
                </span>}
            <span className="text-gray-400 text-xs">{t("vs yesterday")}</span>
          </div>
          <div className="mt-2 text-xs text-gray-400">
            {t("Orders count label", { count: snap.dailyOrders })}
          </div>
          {/* Optional: Sparkline */}
          <div className="mt-2 flex items-end gap-1 h-8">
            {snap.salesTrend.map((val, i, arr) => (
              <span
                key={i}
                className={`block w-2 rounded-full ${i === arr.length - 1 ? "bg-green-500" : "bg-green-300"} transition-all`}
                style={{ height: `${10 + (val / Math.max(...arr)) * 18}px` }}
              ></span>
            ))}
          </div>
        </SnapshotCard>
        {/* Orders in Progress */}
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
          <button className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:underline">
            {t("View Orders")} <ChevronRight className="w-4 h-4" />
          </button>
        </SnapshotCard>
        {/* Stock Alerts */}
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
          <button className="mt-3 flex items-center gap-1 text-xs text-red-600 hover:underline">
            {t("View Stock")} <ChevronRight className="w-4 h-4" />
          </button>
        </SnapshotCard>
        {/* Best Seller */}
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
          <span className="mt-3 block text-xs text-yellow-600">{t("See all products")}</span>
        </SnapshotCard>
      </div>
      {/* Sub cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Revenue Breakdown */}
        <MiniCard>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="text-indigo-500 w-5 h-5" />
            <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">{t("Revenue Breakdown")}</div>
          </div>
          <div className="flex gap-4 text-sm font-semibold">
            <span className="text-green-600">₺{snap.cash}</span> <span className="text-gray-400">{t("Cash")}</span>
            <span className="text-blue-600">₺{snap.card}</span> <span className="text-gray-400">{t("Card")}</span>
            <span className="text-pink-600">₺{snap.online}</span> <span className="text-gray-400">{t("Online")}</span>
          </div>
        </MiniCard>
        {/* Customers Today */}
        <MiniCard>
          <div className="flex items-center gap-2 mb-1">
            <Users className="text-purple-500 w-5 h-5" />
            <div className="text-xs font-bold text-purple-900 dark:text-purple-200">{t("Customers")}</div>
          </div>
          <div className="flex flex-col text-sm font-semibold">
            <span>{t("New customers today", { count: snap.newCustomers })}</span>
            <span className="text-gray-400">{t("Repeat rate label", { rate: snap.repeatRate })}</span>
          </div>
        </MiniCard>
        {/* Delivery/Prep Times */}
        <MiniCard>
          <div className="flex items-center gap-2 mb-1">
            <Clock className="text-emerald-500 w-5 h-5" />
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">{t("Times (min)")}</div>
          </div>
          <div className="flex flex-col text-sm">
            <span>{t("Prep average label", { value: snap.avgPrep })}</span>
            <span>{t("Delivery average label", { value: snap.avgDelivery })}</span>
          </div>
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
function MiniCard({ children }) {
  return (
    <div className="rounded-xl bg-white dark:bg-zinc-900/80 shadow p-4 border border-gray-100 dark:border-zinc-800">
      {children}
    </div>
  );
}
