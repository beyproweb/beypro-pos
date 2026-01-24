import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "recharts";
import { useTranslation } from "react-i18next";
import {
  CalendarIcon,
  Download,
  Plus,
  Minus,
  TrendingUp,
  Wallet,
  CreditCard,
  BarChart3,
  ShoppingBag,
  Receipt,
  Calculator,
  Users,
  MoreHorizontal,
  PhoneCall,
  Globe,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "react-toastify";
import { useHasPermission } from "../components/hooks/useHasPermission";
import useDateRangeState from "../hooks/reports/useDateRangeState";
import useReportsBundle from "../hooks/reports/useReportsBundle";
import useSalesTrendsData from "../hooks/reports/useSalesTrendsData";
import useProfitLossData from "../hooks/reports/useProfitLossData";
import useCategoryData from "../hooks/reports/useCategoryData";
import useCategoryTrendsData from "../hooks/reports/useCategoryTrendsData";
import useCashRegisterHistory from "../hooks/reports/useCashRegisterHistory";
import useCashRegisterSnapshot from "../hooks/reports/useCashRegisterSnapshot";
import DateRangeSelector from "../components/reports/DateRangeSelector";
import SectionState from "../components/reports/SectionState";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import socket from "../utils/socket";

function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const base = (parseFloat(item.price) || 0) * item.quantity;
    const extras = (item.extras || []).reduce(
      (extraSum, ex) =>
        extraSum + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
      0
    ) * item.quantity;
    return sum + base + extras;
  }, 0);
}

const REPORTS_CACHE_VERSION = "reports.cache.v1";

function getStaffCacheKey(from, to) {
  return `${REPORTS_CACHE_VERSION}:staff:${from}:${to}`;
}

function readStaffCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.data || null;
  } catch {
    return null;
  }
}

function writeStaffCache(key, data) {
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

export default function Reports() {
  const { t } = useTranslation();
  const { formatCurrency, config } = useCurrency();
  const hasDashboardAccess = useHasPermission("dashboard");

  if (!hasDashboardAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view the Dashboard.")}
      </div>
    );
  }

  const {
    dateRange,
    setDateRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    from,
    to,
  } = useDateRangeState();

  const [categoryRange, setCategoryRange] = useState("today");
  const [customCategoryFrom, setCustomCategoryFrom] = useState("");
  const [customCategoryTo, setCustomCategoryTo] = useState("");
  const [categoryTrendRange, setCategoryTrendRange] = useState("week");
  const [customTrendFrom, setCustomTrendFrom] = useState("");
  const [customTrendTo, setCustomTrendTo] = useState("");
  const [expandedCategories, setExpandedCategories] = useState({});
  const [showExportModal, setShowExportModal] = useState(false);
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
  const [salesViewType, setSalesViewType] = useState("daily");
  const [salesChartType, setSalesChartType] = useState("area");
  const [zoomRange, setZoomRange] = useState(10);
  const [timeframe, setTimeframe] = useState("daily");
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [staffData, setStaffData] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState(null);
  const yMinRef = useRef();
  const yMaxRef = useRef();
  const [yMin, setYMin] = useState(1000);
  const [yMax, setYMax] = useState(150000);
  const salesByCategoryRef = useRef(null);
  const profitLossRef = useRef(null);
  const salesTrendsRef = useRef(null);

  const {
    loading: overviewLoading,
    error: overviewError,
    paymentData,
    productSalesData,
    expensesData,
    closedOrders,
    orderItems,
    summary,
    totalPayments,
    registerEvents,
    onlinePlatforms,
    refetch: refetchOverview,
  } = useReportsBundle({ from, to });

  const {
    loading: categoryLoading,
    error: categoryError,
    details: categoryDetails,
    refetch: refetchCategory,
  } = useCategoryData({
    range: categoryRange,
    customFrom: customCategoryFrom,
    customTo: customCategoryTo,
  });

  const {
    loading: categoryTrendsLoading,
    error: categoryTrendsError,
    data: categoryTrends,
    refetch: refetchCategoryTrends,
  } = useCategoryTrendsData(categoryTrendRange, customTrendFrom, customTrendTo);

  const {
    loading: cashHistoryLoading,
    error: cashHistoryError,
    data: cashRegisterHistory,
    refetch: refetchCashHistory,
  } = useCashRegisterHistory();

  const {
    loading: cashSnapshotLoading,
    error: cashSnapshotError,
    opening: cashOpening,
    available: cashAvailable,
    refetch: refetchCashSnapshot,
  } = useCashRegisterSnapshot();

  const {
    loading: salesTrendsLoading,
    error: salesTrendsError,
    data: salesTrendsData,
    refetch: refetchSalesTrends,
  } = useSalesTrendsData(salesViewType);

  const {
    loading: profitLossLoading,
    error: profitLossError,
    data: profitLossData,
    refetch: refetchProfitLoss,
  } = useProfitLossData(timeframe);

  const fetchStaffPerformance = useCallback(async (force = false) => {
    if (!from || !to) return;
    const cacheKey = getStaffCacheKey(from, to);
    if (!force) {
      const cached = readStaffCache(cacheKey);
      if (cached) {
        setStaffData(Array.isArray(cached) ? cached : []);
        setStaffError(null);
        return;
      }
    }
    setStaffLoading(true);
    setStaffError(null);
    try {
      const data = await secureFetch(`/reports/staff-performance?from=${from}&to=${to}`);
      const nextData = Array.isArray(data) ? data : [];
      setStaffData(nextData);
      writeStaffCache(cacheKey, nextData);
    } catch (error) {
      console.error("❌ Staff performance error:", error);
      setStaffError(error instanceof Error ? error : new Error("Failed to load staff performance"));
      setStaffData([]);
    } finally {
      setStaffLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchStaffPerformance(false);
  }, [fetchStaffPerformance]);

  useEffect(() => {
    const handleRefresh = () => {
      refetchOverview();
      refetchCategory();
      refetchCategoryTrends();
      refetchCashHistory();
      refetchCashSnapshot();
      refetchSalesTrends();
      refetchProfitLoss();
      fetchStaffPerformance(true);
    };

    socket.on("payment_made", handleRefresh);
    socket.on("order_closed", handleRefresh);
    window.addEventListener("reports:refresh", handleRefresh);

    return () => {
      socket.off("payment_made", handleRefresh);
      socket.off("order_closed", handleRefresh);
      window.removeEventListener("reports:refresh", handleRefresh);
    };
  }, [
    fetchStaffPerformance,
    refetchCashHistory,
    refetchCashSnapshot,
    refetchCategory,
    refetchCategoryTrends,
    refetchOverview,
    refetchProfitLoss,
    refetchSalesTrends,
  ]);

  const globalLoading =
    overviewLoading ||
    categoryLoading ||
    categoryTrendsLoading ||
    cashHistoryLoading ||
    cashSnapshotLoading ||
    salesTrendsLoading ||
    profitLossLoading ||
    staffLoading;

  useEffect(() => {
    if (!globalLoading) {
      setHasLoadedOnce(true);
    }
  }, [globalLoading]);

  const sectionLoadingMessage = hasLoadedOnce ? null : undefined;
  const kpiLoading = overviewLoading || cashSnapshotLoading;
  const kpiError = overviewError || cashSnapshotError;

  if (!hasLoadedOnce && globalLoading) {
    return (
      <div className="min-h-screen px-6 py-8 flex items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">{t("Loading report data…")}</div>
      </div>
    );
  }

  const totalItemsSold = useMemo(() => {
    if (!Array.isArray(orderItems)) return 0;
    return orderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [orderItems]);

  const grossSales = summary?.gross_sales || 0;
  const netSales = summary?.net_sales || 0;

  const extraExpenses = useMemo(
    () =>
      Array.isArray(expensesData)
        ? expensesData.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0)
        : 0,
    [expensesData]
  );

  const expensesToday = (summary?.expenses_today || 0) + extraExpenses;
  const profit = netSales - expensesToday;
  const dailySales = totalPayments || 0;

  const dineInTotal = useMemo(() => {
    if (!Array.isArray(closedOrders)) return 0;
    return closedOrders
      .filter(
        (order) =>
          order.order_type === "table" ||
          (!!order.table_number && (order.order_type == null || order.order_type === "dinein"))
      )
      .reduce((sum, order) => {
        const receiptSum =
          order.receiptMethods?.reduce(
            (acc, method) => acc + parseFloat(method.amount || 0),
            0
          ) || 0;
        const fallback = calcOrderTotalWithExtras(order);
        return sum + (receiptSum > 0 ? receiptSum : fallback);
      }, 0);
  }, [closedOrders]);

  const onlineTotal = useMemo(() => {
    if (!Array.isArray(closedOrders)) return 0;
    return closedOrders
      .filter((order) => order.order_type === "online")
      .reduce((sum, order) => {
        const receiptSum =
          order.receiptMethods?.reduce(
            (acc, method) => acc + parseFloat(method.amount || 0),
            0
          ) || 0;
        const fallback = calcOrderTotalWithExtras(order);
        return sum + (receiptSum > 0 ? receiptSum : fallback);
      }, 0);
  }, [closedOrders]);

  const phoneTotal = useMemo(() => {
    if (!Array.isArray(closedOrders)) return 0;
    return closedOrders
      .filter((order) => order.order_type === "phone")
      .reduce((sum, order) => {
        const receiptSum =
          order.receiptMethods?.reduce((acc, method) => acc + parseFloat(method.amount || 0), 0) ||
          0;
        const fallback = calcOrderTotalWithExtras(order);
        return sum + (receiptSum > 0 ? receiptSum : fallback);
      }, 0);
  }, [closedOrders]);

  const groupedRegisterEvents = useMemo(() => {
    if (!Array.isArray(registerEvents)) return {};
    return registerEvents.reduce((acc, event) => {
      const date = event.date || event.created_at?.slice(0, 10);
      if (!date) return acc;
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    }, {});
  }, [registerEvents]);

  const totalCategorySales = useMemo(() => {
    return Object.values(categoryDetails || {}).reduce(
      (sum, items) => sum + items.reduce((subSum, item) => subSum + item.total, 0),
      0
    );
  }, [categoryDetails]);

  const staffChartData = useMemo(
    () =>
      staffData.map((staff) => ({
        ...staff,
        total_sales: Number(staff.total_sales) || 0,
      })),
    [staffData]
  );

  const getStaffIcon = useCallback((name = "") => {
    const lower = String(name).toLowerCase();
    if (lower.includes("phone")) return PhoneCall;
    if (lower.includes("online") || lower.includes("packet")) return Globe;
    return Users;
  }, []);

  const allCategories = useMemo(() => {
    const categories = new Set();
    (categoryTrends || []).forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== "date") categories.add(key);
      });
    });
    return Array.from(categories);
  }, [categoryTrends]);

  const visibleSalesData = useMemo(
    () => salesTrendsData.slice(-zoomRange),
    [salesTrendsData, zoomRange]
  );

  const applyYRange = () => {
    const minValue = yMinRef.current?.value || "";
    const maxValue = yMaxRef.current?.value || "";
    const min = parseInt(minValue.replace(/,/g, ""), 10);
    const max = parseInt(maxValue.replace(/,/g, ""), 10);

    if (!Number.isNaN(min) && !Number.isNaN(max) && min < max) {
      setYMin(min);
      setYMax(max);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleExport = async () => {
    const selectedSections = Object.entries(exportChecks)
      .filter(([, value]) => value)
      .map(([key]) => key);

    if (selectedSections.length === 0) {
      toast.warn(t("Select at least one section to export."));
      return;
    }

    const payload = {
      from,
      to,
      sections: selectedSections,
    };

    const format = "pdf";
    const endpoint = format === "pdf" ? "/reports/export/pdf" : "/reports/export/csv";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `report.${format}`;
      link.click();
      toast.success(`Exported ${format.toUpperCase()} report`);
      setShowExportModal(false);
    } catch (error) {
      console.error("Failed to export report:", error);
      toast.error(t("Failed to export report"));
    }
  };

  const ChartCard = ({ title, children, actions }) => (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl shadow space-y-2 h-full">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-lg text-gray-700 dark:text-white">{title}</h3>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen px-6 py-8 space-y-8">
      <DateRangeSelector
        range={dateRange}
        onRangeChange={setDateRange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        todayIcon={<CalendarIcon className="w-4 h-4" />}
      >
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
      </DateRangeSelector>

      <SectionState
        loading={false}
        error={kpiError}
        onRetry={() => {
          refetchOverview();
          refetchCashSnapshot();
        }}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="grid gap-4 lg:gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-3xl overflow-hidden border border-blue-200/60 shadow-[0_20px_60px_-30px_rgba(30,64,175,0.45)] bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-700 text-white">
              <div className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                    <CalendarIcon className="h-5 w-5 text-white" />
                  </span>
                  <span className="text-lg">{t("Daily Sales")}</span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  {kpiLoading ? t("Loading...") : formatCurrency(dailySales)}
                </div>
                <div className="text-sm text-blue-100/90">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
              <div className="p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </span>
                    <span className="text-lg">{t("Profit")}</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm"
                    aria-label={t("Download")}
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  {kpiLoading ? t("Loading...") : formatCurrency(profit)}
                </div>
                <div className="text-sm text-emerald-600 font-medium">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
              <div className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200">
                    <Wallet className="h-5 w-5 text-slate-600" />
                  </span>
                  <span className="text-lg">{t("Net Sales")}</span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  {kpiLoading ? t("Loading...") : formatCurrency(netSales)}
                </div>
                <div className="text-sm text-slate-500">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-rose-200/70 bg-gradient-to-br from-white via-rose-50 to-rose-100 shadow-[0_20px_60px_-30px_rgba(190,18,60,0.25)]">
              <div className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-3 text-sm font-semibold text-rose-700">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100">
                    <CreditCard className="h-5 w-5 text-rose-600" />
                  </span>
                  <span className="text-lg">{t("Expenses Today")}</span>
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-rose-600">
                  {kpiLoading ? t("Loading...") : formatCurrency(expensesToday)}
                </div>
                <div className="text-sm text-rose-500">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <div className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </span>
                  <span className="text-base">{t("Gross Sales")}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {kpiLoading ? t("Loading...") : formatCurrency(grossSales)}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <div className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-100">
                    <Receipt className="h-4 w-4 text-indigo-600" />
                  </span>
                  <span className="text-base">{t("Avg Order Value")}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {kpiLoading ? t("Loading...") : formatCurrency(summary?.average_order_value || 0)}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <div className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100">
                    <ShoppingBag className="h-4 w-4 text-amber-600" />
                  </span>
                  <span className="text-base">{t("Total Items Sold")}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {kpiLoading ? t("Loading...") : totalItemsSold.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={overviewLoading || cashHistoryLoading}
        error={overviewError || cashHistoryError}
        onRetry={() => {
          refetchOverview();
          refetchCashHistory();
        }}
        loadingMessage={sectionLoadingMessage}
      >
        <Card className="space-y-4 p-4">
          <CardContent>
            <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
              <DateRangeSelector
                range={dateRange}
                onRangeChange={setDateRange}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </div>

            {(() => {
              const today = new Date();
              const todayStr = today.toISOString().slice(0, 10);

              const filteredHistory = cashRegisterHistory.filter((row) => {
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
                return true;
              });

              return (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredHistory.map((row) => {
                    const eventsForDay = groupedRegisterEvents[row.date] || [];
                    const expensesForDay = eventsForDay
                      .filter((event) => event.type === "expense")
                      .reduce((sum, event) => sum + parseFloat(event.amount || 0), 0);

                    return (
                      <div
                        key={row.date}
                        className="rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 border border-white/10 shadow p-4 space-y-2"
                      >
                        <div className="font-semibold text-gray-800 dark:text-white text-sm">
                          {new Date(row.date).toLocaleDateString()}
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t("Opening Cash")}</span>
                          <span>{formatCurrency(parseFloat(row.opening_cash || 0))}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t("Sales")}</span>
                          <span>{formatCurrency(parseFloat(row.sales_total || 0))}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t("Expenses")}</span>
                          <span>{formatCurrency(expensesForDay)}</span>
                        </div>
                        <details className="text-xs text-gray-600 dark:text-gray-300">
                          <summary className="cursor-pointer underline font-medium">
                            {t("Show Events")}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {eventsForDay.map((event) => (
                              <li key={event.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {event.reason}
                                </span>
                                <span>
                                  {formatCurrency(parseFloat(event.amount || 0))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200/70">
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
              {t("Sales by Payment Method")}
            </h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentData.map(({ method, value, percent }) => (
                <div
                  key={method}
                  className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)] p-5 flex flex-col gap-3 min-h-[140px]"
                >
                  <div className="text-lg font-semibold text-slate-700 truncate">
                    {method}
                  </div>
                  <div className="text-2xl font-semibold text-indigo-700">
                    {formatCurrency(value)}
                  </div>
                  <div className="text-sm text-slate-500">{(percent || 0).toFixed(1)}%</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-slate-200/70 pt-4 text-slate-600">
              <span className="text-base">{t("Total Payments")}:</span>
              <span className="ml-2 text-lg font-semibold text-indigo-700">
                {formatCurrency(totalPayments)}
              </span>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200/70">
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
              {t("Order Type Totals")}
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="rounded-2xl bg-gradient-to-r from-blue-100 via-blue-50 to-blue-100 border border-blue-200/70 p-4 text-base text-blue-900">
                {t("Dine-in")}: <b>{formatCurrency(dineInTotal)}</b>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-emerald-100 via-emerald-50 to-emerald-100 border border-emerald-200/70 p-4 text-base text-emerald-900">
                {t("Online")}:{" "}
                <b>
                  {formatCurrency(
                    Object.values(onlinePlatforms || {}).reduce(
                      (sum, platform) => sum + (platform.total || 0),
                      0
                    )
                  )}
                </b>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border border-amber-200/70 p-4 text-base text-amber-900">
                {t("Phone")}: <b>{formatCurrency(phoneTotal)}</b>
              </div>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200/70">
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
              {t("Online Platforms Totals")}
            </h3>
          </div>
          <div className="p-6 space-y-4">
            {Object.entries(onlinePlatforms || {}).map(([platform, data]) => (
              <details
                key={platform}
                className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.3)]"
              >
                <summary className="cursor-pointer font-semibold flex justify-between items-center px-5 py-4 text-slate-700">
                  <span>
                    {platform === "packet"
                      ? "Yemeksepeti"
                      : platform === "online"
                      ? "Trendyol"
                      : platform}
                  </span>
                  <span className="text-lg text-indigo-700 font-semibold">
                    {formatCurrency(data.total || 0)}
                  </span>
                </summary>
                <ul className="px-5 pb-4 space-y-2 text-sm text-slate-600">
                  {(data.payments || []).map((payment, index) => (
                    <li key={`${platform}-${index}`} className="flex justify-between">
                      <span>{payment.method}</span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(payment.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={staffLoading}
        error={staffError}
        onRetry={fetchStaffPerformance}
        loadingMessage={sectionLoadingMessage}
      >
        <Card className="p-6 sm:p-8 space-y-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_25px_60px_-30px_rgba(15,23,42,0.3)]">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-xl font-semibold text-slate-800">{t("Staff Performance")}</h3>
                <p className="text-sm text-slate-500">
                  {t("Track orders, items sold, and sales totals")}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm"
              aria-label={t("More")}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/80">
            <table className="min-w-full text-sm">
              <thead className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">{t("Staff")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("Orders")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("Items Sold")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("Total Sales")}</th>
                  <th className="px-4 py-3 text-right font-semibold">{t("Avg Order")}</th>
                </tr>
              </thead>
              <tbody>
                {staffData.length === 0 ? (
                  <tr className="border-t border-slate-200">
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      {t("No staff performance data for this range")}
                    </td>
                  </tr>
                ) : (
                  staffData.map((staff, index) => {
                    const totalSales = Number(staff.total_sales) || 0;
                    const ordersHandled = Number(staff.orders_handled) || 0;
                    const itemsSold = Number(staff.total_items_sold) || 0;
                    const avgOrderValue = Number(staff.avg_order_value) || 0;
                    const Icon = getStaffIcon(staff.staff_name);
                    return (
                      <tr
                        key={`${staff.staff_name}-${index}`}
                        className="border-t border-slate-200 hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 text-slate-800 font-medium">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                              <Icon className="h-4 w-4" />
                            </span>
                            {staff.staff_name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">{ordersHandled}</td>
                        <td className="px-4 py-3 text-right">{itemsSold}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {formatCurrency(totalSales)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatCurrency(avgOrderValue)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={staffChartData} barSize={64}>
                <CartesianGrid strokeDasharray="4 6" stroke="#E2E8F0" />
                <XAxis dataKey="staff_name" tick={{ fill: "#475569" }} />
                <YAxis
                  tickFormatter={(value) => formatCurrency(Number(value || 0))}
                  tick={{ fill: "#64748B" }}
                />
                <ReTooltip
                  formatter={(value) => formatCurrency(Number(value || 0))}
                  contentStyle={{
                    borderRadius: "12px",
                    borderColor: "#E2E8F0",
                    boxShadow: "0 18px 45px -30px rgba(15,23,42,0.4)",
                  }}
                />
                <Bar dataKey="total_sales" fill="url(#staffSalesGradient)" radius={[14, 14, 0, 0]} />
                <defs>
                  <linearGradient id="staffSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B6EFF" />
                    <stop offset="100%" stopColor="#93B4FF" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </SectionState>

      <SectionState
        loading={overviewLoading || categoryLoading}
        error={overviewError || categoryError}
        onRetry={() => {
          refetchOverview();
          refetchCategory();
        }}
        loadingMessage={sectionLoadingMessage}
      >
        <div ref={salesByCategoryRef}>
          <ChartCard
            title={t("Sales by Category")}
            actions={
              <div className="flex gap-2 items-center">
                <select
                  value={categoryRange}
                  onChange={(event) => {
                    setCategoryRange(event.target.value);
                    salesByCategoryRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
                >
                  <option value="today">{t("Today")}</option>
                  <option value="week">{t("This Week")}</option>
                  <option value="custom">{t("Custom Range")}</option>
                </select>
                {categoryRange === "custom" && (
                  <>
                    <input
                      type="date"
                      value={customCategoryFrom}
                      onChange={(event) => setCustomCategoryFrom(event.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <input
                      type="date"
                      value={customCategoryTo}
                      onChange={(event) => setCustomCategoryTo(event.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={refetchCategory}>
                      {t("Apply")}
                    </Button>
                  </>
                )}
              </div>
            }
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 items-stretch">
              {productSalesData.map((category) => (
                <div
                  key={category.category}
                  className="p-4 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow text-gray-800 dark:text-white min-h-[160px] flex flex-col justify-between"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-md truncate">
                      {category.category}
                    </h4>
                    <button
                      onClick={() => toggleCategory(category.category)}
                      className="text-xs underline"
                    >
                      {expandedCategories[category.category] ? t("Hide") : t("Show")}
                    </button>
                  </div>
                  <p className="text-xl font-extrabold mt-1">
                    {formatCurrency(
                      categoryDetails[category.category]?.reduce(
                        (sum, item) => sum + item.total,
                        0
                      ) || 0
                    )}
                  </p>
                  {expandedCategories[category.category] &&
                    categoryDetails[category.category] && (
                      <ul className="mt-3 space-y-1 text-sm border-t border-white/20 pt-2">
                        {categoryDetails[category.category].map((item, index) => (
                          <li key={`${category.category}-${index}`} className="flex justify-between items-center">
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
                            <span className="tabular-nums">
                              {formatCurrency(item.total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-3 border-gray-300 dark:border-gray-700">
              {t("Total Category Sales")}: {formatCurrency(totalCategorySales)}
            </div>
          </ChartCard>
        </div>
      </SectionState>

      <SectionState
        loading={categoryTrendsLoading}
        error={categoryTrendsError}
        onRetry={refetchCategoryTrends}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-200/70">
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
              {t("Category Trends")}
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={categoryTrendRange}
                onChange={(event) => setCategoryTrendRange(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm"
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
                    onChange={(event) => setCustomTrendFrom(event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm"
                  />
                  <input
                    type="date"
                    value={customTrendTo}
                    onChange={(event) => setCustomTrendTo(event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm"
                  />
                  <Button size="sm" onClick={refetchCategoryTrends} className="h-11 px-5 rounded-xl">
                    {t("Apply")}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={categoryTrends} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="#D8DEEF" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(dateStr) => {
                    const date = new Date(dateStr);
                    return date.toLocaleDateString(undefined, { weekday: "short" });
                  }}
                  tick={{ fill: "#475569" }}
                />
                <YAxis
                  tickFormatter={(value) => formatCurrency(Number(value || 0))}
                  tick={{ fill: "#64748B" }}
                />
                <ReTooltip
                  formatter={(value) => formatCurrency(parseFloat(value || 0))}
                  contentStyle={{
                    borderRadius: "12px",
                    borderColor: "#E2E8F0",
                    boxShadow: "0 18px 45px -30px rgba(15,23,42,0.4)",
                  }}
                />
                <Legend />
                {allCategories.map((category, index) => (
                  <Bar
                    key={category}
                    dataKey={category}
                    fill={["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#E11D48"][index % 7]}
                    barSize={20}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={salesTrendsLoading}
        error={salesTrendsError}
        onRetry={refetchSalesTrends}
        loadingMessage={sectionLoadingMessage}
      >
        <div ref={salesTrendsRef}>
          <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-200/70">
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
                {t("Sales Trends")}
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={salesViewType}
                  onChange={(event) => {
                    setSalesViewType(event.target.value);
                    salesTrendsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm"
                >
                  {["hourly", "daily", "weekly", "yearly"].map((option) => (
                    <option key={option} value={option}>
                      {t(option)}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={applyYRange} className="h-11 px-5 rounded-xl">
                  {t("Apply")}
                </Button>
                <Button size="sm" className="h-11 w-11 rounded-xl" onClick={() => setZoomRange(Math.max(5, zoomRange - 5))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  className="h-11 w-11 rounded-xl"
                  onClick={() => setZoomRange(Math.min(salesTrendsData.length, zoomRange + 5))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="px-6 pt-4">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <span>{t("Chart Type")}:</span>
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
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={yMinRef}
                    defaultValue="1000"
                    className="h-9 w-24 text-sm px-3 rounded-lg border border-slate-200"
                    placeholder={`${config?.symbol || ""} ${t("Min")}`}
                  />
                  <span>–</span>
                  <input
                    ref={yMaxRef}
                    defaultValue="150000"
                    className="h-9 w-28 text-sm px-3 rounded-lg border border-slate-200"
                    placeholder={`${config?.symbol || ""} ${t("Max")}`}
                  />
                </div>
              </div>
            </div>

            <div className="p-6">
              <ResponsiveContainer width="100%" height={360}>
                {salesChartType === "area" ? (
                  <AreaChart data={visibleSalesData}>
                    <CartesianGrid strokeDasharray="4 6" stroke="#D8DEEF" />
                    <XAxis
                      dataKey="label"
                      tickFormatter={(label) => {
                        if (salesViewType === "daily") {
                          const date = new Date(label);
                          return date.toLocaleDateString(undefined, { weekday: "short" });
                        }
                        return label;
                      }}
                      tick={{ fill: "#475569" }}
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      tickFormatter={(value) => formatCurrency(value, { decimals: 0 })}
                      tick={{ fill: "#64748B" }}
                    />
                    <ReTooltip />
                    <Area type="monotone" dataKey="sales" stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} />
                  </AreaChart>
                ) : (
                  <LineChart data={visibleSalesData}>
                    <CartesianGrid strokeDasharray="4 6" stroke="#D8DEEF" />
                    <XAxis
                      dataKey="label"
                      tickFormatter={(label) => {
                        if (salesViewType === "daily") {
                          const date = new Date(label);
                          return date.toLocaleDateString(undefined, { weekday: "short" });
                        }
                        return label;
                      }}
                      tick={{ fill: "#475569" }}
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      tickFormatter={(value) => formatCurrency(value, { decimals: 0 })}
                      tick={{ fill: "#64748B" }}
                    />
                    <ReTooltip />
                    <Line type="monotone" dataKey="sales" stroke="#6366F1" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-200/70">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 shadow-inner text-slate-600">
              <BarChart3 className="h-5 w-5" />
            </span>
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
              {t("Expenses Breakdown")}
            </h3>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="divide-y divide-slate-200/70">
                {Object.entries(
                  (expensesData || []).reduce((acc, row) => {
                    acc[row.type] = (acc[row.type] || 0) + parseFloat(row.amount || 0);
                    return acc;
                  }, {})
                ).map(([type, total]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between px-5 py-4 text-base text-slate-700"
                  >
                    <span className="font-medium text-slate-600">{type}</span>
                    <span className="text-lg font-semibold text-slate-800">
                      {formatCurrency(total)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-200/70 text-slate-600">
                <span className="text-base">{t("Total Expenses")}:</span>
                <span className="text-xl font-semibold text-indigo-700">
                  {formatCurrency(extraExpenses)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={profitLossLoading}
        error={profitLossError}
        onRetry={refetchProfitLoss}
        loadingMessage={sectionLoadingMessage}
      >
        <div ref={profitLossRef}>
          <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-b border-slate-200/70">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 shadow-inner text-slate-600">
                  <Calculator className="h-6 w-6" />
                </span>
                <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
                  {t("Profit & Loss Breakdown")}
                </h3>
              </div>
              <div className="flex items-center rounded-2xl bg-slate-100/80 border border-slate-200/70 p-1 text-slate-600 shadow-inner">
                {["daily", "weekly", "monthly"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setTimeframe(option);
                      profitLossRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                    className={[
                      "px-4 py-2 text-sm sm:text-base font-medium rounded-xl transition",
                      timeframe === option
                        ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow"
                        : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                  >
                    {t(option.charAt(0).toUpperCase() + option.slice(1))}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 text-lg text-slate-500">
              {profitLossData[0]?.date || ""}
            </div>

            <div className="px-6 pb-8 space-y-5">
              {profitLossData.map(({ date, profit: profitValue, loss }) => {
                const net = profitValue - loss;
                const margin =
                  profitValue + loss > 0 ? (profitValue / (profitValue + loss)) * 100 : 0;
                const profitColor = net >= 0 ? "text-emerald-600" : "text-rose-600";
                return (
                  <div
                    key={date}
                    className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                  >
                    <div className="divide-y divide-slate-200/70">
                      <div className="flex items-center justify-between px-5 py-4">
                        <span className="text-lg text-slate-700">{t("Net Sales")}</span>
                        <span className="text-2xl font-semibold text-blue-700">
                          {formatCurrency(profitValue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-5 py-4">
                        <span className="text-lg text-slate-700">{t("Expenses")}</span>
                        <span className="text-2xl font-semibold text-rose-600">
                          {formatCurrency(loss)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-5 py-4">
                        <span className="text-lg text-slate-700">{t("Profit")}</span>
                        <span className={`text-2xl font-semibold ${profitColor}`}>
                          {formatCurrency(net)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2 text-lg text-slate-700">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                            <BarChart3 className="h-4 w-4" />
                          </span>
                          {t("Margin")}
                        </div>
                        <span className="text-2xl font-semibold text-blue-700">
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionState>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-[90%] max-w-lg space-y-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              {t("Export Report Data")}
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(exportChecks).map(([key, value]) => (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) =>
                      setExportChecks((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                    className="form-checkbox h-4 w-4 text-blue-600"
                  />
                  <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowExportModal(false)}>
                {t("Cancel")}
              </Button>
              <Button onClick={handleExport}>{t("Export")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
