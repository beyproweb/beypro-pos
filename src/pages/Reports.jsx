import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";
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
  Trash2,
} from "lucide-react";
import { Card } from "../components/ui/card";
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
import useExpensesBreakdownData from "../hooks/reports/useExpensesBreakdownData";
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

const REPORTS_CACHE_VERSION = "reports.cache.v2";

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
  const [wasteStats, setWasteStats] = useState({
    totalWaste: 0,
    wastePctOfSales: 0,
    topProducts: [],
    byReason: [],
  });
  const [wasteLoading, setWasteLoading] = useState(false);
  const [wasteError, setWasteError] = useState(null);
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
    closedOrders,
    orderItems,
    summary,
    totalPayments,
    registerEvents,
    onlinePlatforms,
    refetch: refetchOverview,
  } = useReportsBundle({ from, to });

  const {
    loading: expensesLoading,
    error: expensesError,
    expensesData,
    staffPayments,
    supplierPayments,
    staffPaymentsTotal,
    supplierPaymentsTotal,
    expensesToday,
    refetch: refetchExpenses,
  } = useExpensesBreakdownData({ from, to });

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
  } = useCashRegisterHistory(from, to);

  const {
    loading: cashSnapshotLoading,
    error: cashSnapshotError,
    opening: cashOpening,
    available: cashAvailable,
    registerState: cashRegisterState,
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
  } = useProfitLossData(timeframe, { from, to });

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

  const fetchWasteMetrics = useCallback(async () => {
    setWasteLoading(true);
    setWasteError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await secureFetch(qs ? `/stock/waste/metrics?${qs}` : "/stock/waste/metrics");
      setWasteStats({
        totalWaste: res?.totalWaste || 0,
        wastePctOfSales: res?.wastePctOfSales || 0,
        topProducts: res?.topProducts || [],
        byReason: res?.byReason || [],
      });
    } catch (err) {
      console.error("❌ Waste metrics error:", err);
      setWasteError(err);
      setWasteStats({ totalWaste: 0, wastePctOfSales: 0, topProducts: [], byReason: [] });
    } finally {
      setWasteLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchStaffPerformance(false);
  }, [fetchStaffPerformance]);

  useEffect(() => {
    fetchWasteMetrics();
  }, [fetchWasteMetrics]);

  useEffect(() => {
    const handleRefresh = () => {
      refetchOverview();
      refetchExpenses();
      refetchCategory();
      refetchCategoryTrends();
      refetchCashHistory();
      refetchCashSnapshot();
      refetchSalesTrends();
      refetchProfitLoss();
      fetchStaffPerformance(true);
      fetchWasteMetrics();
    };

    socket.on("payment_made", handleRefresh);
    socket.on("order_closed", handleRefresh);
    socket.on("reports_refresh", handleRefresh);
    window.addEventListener("reports:refresh", handleRefresh);

    return () => {
      socket.off("payment_made", handleRefresh);
      socket.off("order_closed", handleRefresh);
      socket.off("reports_refresh", handleRefresh);
      window.removeEventListener("reports:refresh", handleRefresh);
    };
  }, [
    fetchStaffPerformance,
    refetchCashHistory,
    refetchCashSnapshot,
    refetchCategory,
    refetchCategoryTrends,
    refetchExpenses,
    refetchOverview,
    refetchProfitLoss,
    refetchSalesTrends,
    fetchWasteMetrics,
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
  const expensesKpiLoading = expensesLoading;
  const expensesKpiError = expensesError;

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
    <div className="h-full space-y-4 rounded-[28px] border border-slate-200/70 bg-white/95 p-4 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white sm:text-xl">{title}</h3>
        {actions}
      </div>
      <div>{children}</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f4f7fb_32%,_#eef2f7_100%)] px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-8">
      <DateRangeSelector
        range={dateRange}
        onRangeChange={setDateRange}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        todayIcon={<CalendarIcon className="w-4 h-4" />}
        className="sticky top-3 z-20 rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-4"
      >
        <div className="contents sm:flex sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setShowExportModal(true)}
            className="inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap sm:h-11 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-sm sm:tracking-normal"
          >
            <Download className="hidden h-3.5 w-3.5 sm:block sm:h-4 sm:w-4" />
            <span className="sm:hidden">{t("Exp")}</span>
            <span className="hidden sm:inline">{t("Export")}</span>
          </Button>
          <Link to="/reports/operational" className="block w-full sm:w-auto">
            <Button
              variant="default"
              className="h-8 w-full min-w-0 rounded-xl bg-indigo-600 px-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 sm:h-11 sm:rounded-2xl sm:px-4 sm:text-sm sm:tracking-normal"
            >
              <span className="sm:hidden">{t("Ops")}</span>
              <span className="hidden sm:inline">{t("Operational")}</span>
            </Button>
          </Link>
        </div>
      </DateRangeSelector>

      <SectionState
        loading={overviewLoading || cashHistoryLoading}
        error={overviewError || cashHistoryError}
        onRetry={() => {
          refetchOverview();
          refetchCashHistory();
        }}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="border-b border-slate-200/70 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 text-slate-700">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200">
                  <Wallet className="h-5 w-5 text-slate-600" />
                </span>
                <div>
                  <h3 className="text-base font-semibold sm:text-lg">{t("Cash Register")}</h3>
                  <p className="text-xs text-slate-500 sm:text-sm">
                    {t("Opening cash, live availability, and daily events")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {(() => {
            const todayStr = customStart || from;
            const isRegisterOpenToday =
              String(cashRegisterState || "").toLowerCase() === "open" &&
              dateRange === "today";

            const filteredHistory = cashRegisterHistory.filter((row) => {
              const rowDate = row.date?.slice(0, 10);
              if (!rowDate) return false;
              if (dateRange === "today") return rowDate === todayStr;
              if (dateRange === "week") {
                return rowDate >= from && rowDate <= to;
              }
              if (dateRange === "custom") {
                return rowDate >= customStart && rowDate <= customEnd;
              }
              return true;
            });

            const hasTodayRow = filteredHistory.some(
              (row) => row?.date?.slice(0, 10) === todayStr
            );
            const historyRows = isRegisterOpenToday && !hasTodayRow
              ? [
                  {
                    date: todayStr,
                    opening_cash: cashOpening,
                    closing_cash: 0,
                    cash_sales: 0,
                    supplier_expenses: 0,
                    staff_expenses: 0,
                    register_expenses: 0,
                    register_entries: 0,
                    __syntheticOpen: true,
                  },
                  ...filteredHistory,
                ]
              : filteredHistory;

            return (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">
                {historyRows.map((row) => {
                  const dayKey = row?.date?.slice(0, 10) || "";
                  const eventsForDay = groupedRegisterEvents[dayKey] || [];
                  const openingCash = parseFloat(row.opening_cash || 0);
                  const cashSales = parseFloat(row.cash_sales || 0);
                  const registerEntries = parseFloat(row.register_entries || 0);
                  const supplierExpenses = parseFloat(row.supplier_expenses || 0);
                  const staffExpenses = parseFloat(row.staff_expenses || 0);
                  const registerExpenses = parseFloat(row.register_expenses || 0);
                  const expensesForDay =
                    supplierExpenses + staffExpenses + registerExpenses;
                  const computedAvailable =
                    openingCash + cashSales + registerEntries - expensesForDay;

                  const isTodayRow = dayKey === todayStr;
                  const showLiveAvailable =
                    isTodayRow && isRegisterOpenToday && !row.closing_cash;
                  const availableForDisplay = showLiveAvailable
                    ? parseFloat(cashAvailable || 0)
                    : computedAvailable;

                  return (
                    <div
                      key={dayKey || row.date}
                      className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]"
                    >
                      <div className="flex h-full flex-col gap-3 p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-100">
                              <Wallet className="h-4 w-4 text-emerald-600" />
                            </span>
                            <span className="text-sm sm:text-base">
                              {new Date(row.date).toLocaleDateString()}
                            </span>
                          </div>
                          {showLiveAvailable ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              {t("Open")}
                            </span>
                          ) : null}
                        </div>

                        <div className="space-y-2 text-sm text-slate-600">
                          <div className="flex justify-between gap-3">
                            <span>{t("Opening Cash")}</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(openingCash)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>{t("Cash Sales")}</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(cashSales)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span>{t("Expenses")}</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(expensesForDay)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3 rounded-2xl bg-slate-100/80 px-3 py-2">
                            <span>{t("Cash Available")}</span>
                            <span className="font-semibold text-slate-900">
                              {formatCurrency(availableForDisplay)}
                            </span>
                          </div>
                        </div>

                        <details className="mt-auto text-xs text-slate-500">
                          <summary className="cursor-pointer font-medium underline underline-offset-2">
                            {t("Show Events")}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {eventsForDay.map((event) => (
                              <li key={event.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {event.note || event.reason}
                                </span>
                                <span className="font-medium text-slate-700">
                                  {formatCurrency(parseFloat(event.amount || 0))}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </SectionState>

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
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-3xl overflow-hidden border border-blue-200/60 shadow-[0_20px_60px_-30px_rgba(30,64,175,0.45)] bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-700 text-white">
              <div className="flex h-full flex-col gap-2 p-4 sm:gap-3 sm:p-6">
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                    <CalendarIcon className="h-5 w-5 text-white" />
                  </span>
                  <span className="text-sm sm:text-lg">{t("Daily Sales")}</span>
                </div>
                <div className="text-xl font-extrabold tracking-tight sm:text-4xl">
                  {kpiLoading ? t("Loading...") : formatCurrency(dailySales)}
                </div>
                <div className="mt-auto text-xs text-blue-100/90 sm:text-sm">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
              <div className="flex h-full flex-col gap-2 p-4 sm:gap-3 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
                      <TrendingUp className="h-5 w-5 text-emerald-600" />
                    </span>
                    <span className="text-sm sm:text-lg">{t("Profit")}</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm"
                    aria-label={t("Download")}
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  {kpiLoading ? t("Loading...") : formatCurrency(profit)}
                </div>
                <div className="mt-auto text-xs font-medium text-emerald-600 sm:text-sm">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)]">
              <div className="flex h-full flex-col gap-2 p-4 sm:gap-3 sm:p-6">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-200">
                    <Wallet className="h-5 w-5 text-slate-600" />
                  </span>
                  <span className="text-sm sm:text-lg">{t("Net Sales")}</span>
                </div>
                <div className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                  {kpiLoading ? t("Loading...") : formatCurrency(netSales)}
                </div>
                <div className="mt-auto text-xs text-slate-500 sm:text-sm">
                  {kpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-rose-200/70 bg-gradient-to-br from-white via-rose-50 to-rose-100 shadow-[0_20px_60px_-30px_rgba(190,18,60,0.25)]">
              <div className="flex h-full flex-col gap-2 p-4 sm:gap-3 sm:p-6">
                <div className="flex items-center gap-3 text-sm font-semibold text-rose-700">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100">
                    <CreditCard className="h-5 w-5 text-rose-600" />
                  </span>
                  <span className="text-sm sm:text-lg">
                    {dateRange === "today" ? t("Expenses Today") : t("Expenses")}
                  </span>
                </div>
                <div className="text-xl font-extrabold tracking-tight text-rose-600 sm:text-4xl">
                  {expensesKpiLoading ? t("Loading...") : formatCurrency(expensesToday)}
                </div>
                <div className="text-xs text-rose-500 sm:text-sm">
                  {expensesKpiLoading ? t("Updating data") : t("Updated just now")}
                </div>
                {expensesKpiError ? (
                  <div className="text-xs text-rose-600">{t("Failed to load expenses.")}</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <div className="flex h-full flex-col gap-2 p-4 sm:p-5">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-100">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </span>
                  <span className="text-sm sm:text-base">{t("Gross Sales")}</span>
                </div>
                <div className="text-lg font-bold text-slate-900 sm:text-2xl">
                  {kpiLoading ? t("Loading...") : formatCurrency(grossSales)}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
              <div className="flex h-full flex-col gap-2 p-4 sm:p-5">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-100">
                    <Receipt className="h-4 w-4 text-indigo-600" />
                  </span>
                  <span className="text-sm sm:text-base">{t("Avg Order Value")}</span>
                </div>
                <div className="text-lg font-bold text-slate-900 sm:text-2xl">
                  {kpiLoading ? t("Loading...") : formatCurrency(summary?.average_order_value || 0)}
                </div>
              </div>
            </div>

            <div className="col-span-2 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] xl:col-span-1">
              <div className="flex h-full flex-col gap-2 p-4 sm:p-5">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100">
                    <ShoppingBag className="h-4 w-4 text-amber-600" />
                  </span>
                  <span className="text-sm sm:text-base">{t("Total Items Sold")}</span>
                </div>
                <div className="text-lg font-bold text-slate-900 sm:text-2xl">
                  {kpiLoading ? t("Loading...") : totalItemsSold.toLocaleString()}
                </div>
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
          <div className="border-b border-slate-200/70 px-4 py-4 sm:px-6 sm:py-5">
            <h3 className="text-lg font-semibold text-slate-800 sm:text-2xl">
              {t("Sales by Payment Method")}
            </h3>
          </div>
          <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {paymentData.map(({ method, value, percent }) => (
                <div
                  key={method}
                  className="rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)] sm:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-700 sm:text-base">
                        {method}
                      </div>
                      <div className="mt-2 text-xl font-extrabold tracking-tight text-indigo-700 sm:text-2xl">
                        {formatCurrency(value)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                      {(percent || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-100/80 px-4 py-3 text-sm text-slate-600">
              <span className="font-medium">{t("Total Payments")}</span>
              <span className="text-base font-semibold text-indigo-700 sm:text-lg">
                {formatCurrency(totalPayments)}
              </span>
            </div>
          </div>
        </div>
      </SectionState>

      <SectionState
        loading={wasteLoading}
        error={wasteError}
        onRetry={fetchWasteMetrics}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-3xl border border-slate-200/70 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("Waste KPIs")}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("Waste reduces stock, increases expense, and impacts margin.")}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-100 dark:ring-rose-800/60">
              <Trash2 className="h-4 w-4" />
              {t("Tracked per restaurant")}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-rose-200/60 bg-gradient-to-br from-white via-rose-50 to-rose-100 p-4 shadow-sm dark:border-rose-900/30 dark:from-rose-950/10 dark:via-rose-900/20 dark:to-rose-950/30">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                {t("Total Waste (₺)")}
              </p>
              <p className="mt-2 text-2xl font-bold text-rose-700">
                {wasteLoading ? "…" : formatCurrency(wasteStats.totalWaste || 0)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {t("Waste % of Sales")}
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                {wasteLoading ? "…" : `${(wasteStats.wastePctOfSales || 0).toFixed(2)}%`}
              </p>
            </div>

            <div className="col-span-2 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm lg:col-span-2 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {t("Top Wasted Products")}
                </p>
                <span className="text-xs text-slate-500">
                  {wasteStats.topProducts?.length || 0} {t("items")}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {(wasteStats.topProducts || []).map((row) => {
                  const pct =
                    wasteStats.topProducts[0]?.total_loss > 0
                      ? (row.total_loss / wasteStats.topProducts[0].total_loss) * 100
                      : 0;
                  return (
                    <div
                      key={row.stock_id || row.product_name}
                      className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      <div className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <span>{row.product_name || t("Unknown product")}</span>
                        <span className="text-rose-600 dark:text-rose-300">
                          {formatCurrency(row.total_loss || 0)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-rose-500/80"
                          style={{ width: `${Math.min(100, pct || 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(wasteStats.topProducts || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    {t("Waste entries will populate this leaderboard.")}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm lg:col-span-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {t("Waste by Reason")}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(wasteStats.byReason || []).map((row) => (
                  <div
                    key={row.reason}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      {row.reason}
                    </p>
                    <p className="text-rose-600 dark:text-rose-300">
                      {formatCurrency(row.total_loss || 0)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {parseFloat(row.total_qty || 0).toLocaleString()} {t("units")}
                    </p>
                  </div>
                ))}
                {(wasteStats.byReason || []).length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    {t("No waste reasons in this period")}
                  </div>
                )}
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
              {t("Order Type Totals")}
            </h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-r from-blue-100 via-blue-50 to-blue-100 border border-blue-200/70 p-4 text-base text-blue-900 sm:col-span-1">
                {t("Dine-in")}: <b>{formatCurrency(dineInTotal)}</b>
              </div>
              <div className="rounded-2xl bg-gradient-to-r from-emerald-100 via-emerald-50 to-emerald-100 border border-emerald-200/70 p-4 text-base text-emerald-900 sm:col-span-1">
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
              <div className="rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border border-amber-200/70 p-4 text-base text-amber-900 sm:col-span-2 xl:col-span-1">
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
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <select
                  value={categoryRange}
                  onChange={(event) => {
                    setCategoryRange(event.target.value);
                    salesByCategoryRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-gray-800 dark:text-white"
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
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-gray-800 dark:text-white"
                    />
                    <input
                      type="date"
                      value={customCategoryTo}
                      onChange={(event) => setCustomCategoryTo(event.target.value)}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-gray-800 dark:text-white"
                    />
                    <Button size="sm" variant="outline" onClick={refetchCategory} className="h-11 rounded-2xl px-5">
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
            <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
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
            <div className="flex flex-col gap-4 px-6 py-5 border-b border-slate-200/70 xl:flex-row xl:items-center xl:justify-between">
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
                {t("Sales Trends")}
              </h3>
              <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center xl:w-auto">
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
              <div className="flex flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span>{t("Chart Type")}:</span>
                  <Button
                    variant={salesChartType === "area" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSalesChartType("area")}
                    className="h-10 rounded-2xl"
                  >
                    {t("Area")}
                  </Button>
                  <Button
                    variant={salesChartType === "line" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSalesChartType("line")}
                    className="h-10 rounded-2xl"
                  >
                    {t("Line")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={yMinRef}
                    defaultValue="1000"
                    className="h-10 w-24 rounded-2xl border border-slate-200 px-3 text-sm"
                    placeholder={`${config?.symbol || ""} ${t("Min")}`}
                  />
                  <span>–</span>
                  <input
                    ref={yMaxRef}
                    defaultValue="150000"
                    className="h-10 w-28 rounded-2xl border border-slate-200 px-3 text-sm"
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
        loading={expensesLoading}
        error={expensesError}
        onRetry={refetchExpenses}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="rounded-[28px] border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-200/70">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-100 shadow-inner text-slate-600">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div className="flex flex-col">
              <h3 className="text-xl sm:text-2xl font-semibold text-slate-800">
                {t("Expenses Breakdown")}
              </h3>
              <div className="text-sm text-slate-500">
                {from} → {to}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="divide-y divide-slate-200/70">
                {(() => {
                  const manual = (expensesData || []).reduce((acc, row) => {
                    acc[row.type] = (acc[row.type] || 0) + parseFloat(row.amount || 0);
                    return acc;
                  }, {});

                  const staffByName = (staffPayments || []).reduce((acc, row) => {
                    const staffName = String(row?.note || "").trim() || t("Staff");
                    acc[staffName] = (acc[staffName] || 0) + parseFloat(row.amount || 0);
                    return acc;
                  }, {});

                  const rows = [
                    ...Object.entries(manual),
                    [t("Supplier Payments"), supplierPaymentsTotal],
                    ...Object.entries(staffByName).map(([name, total]) => [
                      `${t("Staff Payroll")} - ${name}`,
                      total,
                    ]),
                  ];

                  return rows;
                })().map(([type, total]) => (
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
                  {formatCurrency(expensesToday)}
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
            <div className="flex w-full flex-wrap items-center rounded-2xl border border-slate-200/70 bg-slate-100/80 p-1 text-slate-600 shadow-inner sm:w-auto">
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
                      "flex-1 px-4 py-2 text-sm font-medium rounded-xl transition sm:flex-none sm:text-base",
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg space-y-4 rounded-t-[28px] bg-white p-6 shadow-xl dark:bg-gray-900 sm:w-[90%] sm:rounded-2xl">
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
    </div>
  );
}
