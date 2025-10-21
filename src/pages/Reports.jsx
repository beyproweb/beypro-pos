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
import { CalendarIcon, Download, Plus, Minus } from "lucide-react";
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

  const fetchStaffPerformance = useCallback(async () => {
    if (!from || !to) return;
    setStaffLoading(true);
    setStaffError(null);
    try {
      const data = await secureFetch(`/reports/staff-performance?from=${from}&to=${to}`);
      setStaffData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("❌ Staff performance error:", error);
      setStaffError(error instanceof Error ? error : new Error("Failed to load staff performance"));
      setStaffData([]);
    } finally {
      setStaffLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchStaffPerformance();
  }, [fetchStaffPerformance]);

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

  const kpis = useMemo(
    () => [
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
    ],
    [cashAvailable, dailySales, expensesToday, grossSales, netSales, profit, summary, t, totalItemsSold]
  );

  const categoryIcons = {
    "Chicken Burger": "🍔",
    Pizzas: "🍕",
    Salads: "🥗",
    "Meat Burger": "🍔",
    Drinks: "🥤",
    Breakfast: "🍳",
  };

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
        loading={overviewLoading || cashSnapshotLoading}
        error={overviewError || cashSnapshotError}
        onRetry={() => {
          refetchOverview();
          refetchCashSnapshot();
        }}
        loadingMessage={sectionLoadingMessage}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {kpis.map(({ label, value, color }) => (
            <div
              key={label}
              className={`p-4 rounded-2xl shadow-xl bg-opacity-80 backdrop-blur-xl text-white border border-white/10 hover:scale-[1.02] transition-all duration-200 ease-in-out bg-gradient-to-br ${color}`}
            >
              <div className="text-sm font-medium opacity-90">{label}</div>
              <div className="text-3xl font-bold tracking-wide mt-1">
                {label.includes("Items") || label.includes("Orders")
                  ? value.toLocaleString()
                  : `₺${value.toLocaleString()}`}
              </div>
            </div>
          ))}
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
                          <span>₺{parseFloat(row.opening_cash || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t("Sales")}</span>
                          <span>₺{parseFloat(row.sales_total || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>{t("Expenses")}</span>
                          <span>₺{expensesForDay.toLocaleString()}</span>
                        </div>
                        <details className="text-xs text-gray-600 dark:text-gray-300">
                          <summary className="cursor-pointer underline font-medium">
                            {t("Show Events")}
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {eventsForDay.map((event) => (
                              <li key={event.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {event.type === "expense" ? "💸" : "💰"} {event.reason}
                                </span>
                                <span>
                                  ₺{parseFloat(event.amount || 0).toLocaleString()}
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
        <ChartCard
          title={t("Sales by Payment Method")}
          actions={null}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {paymentData.map(({ method, value, percent }, index) => {
              const icons = {
                Cash: "💵",
                "Credit Card": "💳",
                Sodexo: "🍽️",
                Multinet: "🪙",
              };
              const emoji = icons[method] || "💰";

              return (
                <div
                  key={method}
                  className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow text-sm flex flex-col justify-between min-h-[120px]"
                >
                  <div className="font-semibold text-gray-700 dark:text-white truncate">
                    {emoji} {method}
                  </div>
                  <div className="mt-2 text-lg font-bold text-blue-600 dark:text-blue-400">
                    ₺{value.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">{(percent || 0).toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-4 border-gray-300 dark:border-gray-700">
            🧮 {t("Total Payments")}: ₺{totalPayments.toLocaleString()}
          </div>
        </ChartCard>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <Card className="p-4 space-y-2">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {t("Order Type Totals")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-blue-100 dark:bg-blue-900 rounded-lg p-3">
              🍽️ {t("Dine-in")}: <b>₺{dineInTotal.toLocaleString()}</b>
            </div>
            <div className="bg-green-100 dark:bg-green-900 rounded-lg p-3">
              📱 {t("Online")}:{" "}
              <b>
                ₺
                {Object.values(onlinePlatforms || {})
                  .reduce((sum, platform) => sum + (platform.total || 0), 0)
                  .toLocaleString()}
              </b>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900 rounded-lg p-3">
              ☎️ {t("Phone")}: <b>₺{phoneTotal.toLocaleString()}</b>
            </div>
          </div>
        </Card>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <Card className="p-4 space-y-2">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">
            {t("Online Platforms Totals")}
          </h3>
          <div className="space-y-3">
            {Object.entries(onlinePlatforms || {}).map(([platform, data]) => (
              <details key={platform} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <summary className="cursor-pointer font-semibold flex justify-between">
                  <span>
                    {platform === "packet"
                      ? "Yemeksepeti"
                      : platform === "online"
                      ? "Trendyol"
                      : platform}
                  </span>
                  <span className="text-blue-600 dark:text-blue-300 font-bold">
                    ₺{(data.total || 0).toLocaleString()}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {(data.payments || []).map((payment, index) => (
                    <li key={`${platform}-${index}`} className="flex justify-between px-2">
                      <span>{payment.method}</span>
                      <span className="font-semibold">₺{payment.total.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </Card>
      </SectionState>

      <SectionState
        loading={staffLoading}
        error={staffError}
        onRetry={fetchStaffPerformance}
        loadingMessage={sectionLoadingMessage}
      >
        <Card className="p-4 space-y-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white">👥 {t("Staff Performance")}</h3>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left">{t("Staff")}</th>
                  <th className="px-3 py-2 text-right">{t("Orders")}</th>
                  <th className="px-3 py-2 text-right">{t("Items Sold")}</th>
                  <th className="px-3 py-2 text-right">{t("Total Sales")}</th>
                  <th className="px-3 py-2 text-right">{t("Avg Order")}</th>
                </tr>
              </thead>
              <tbody>
                {staffData.length === 0 ? (
                  <tr className="border-t border-gray-200 dark:border-gray-700">
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500 dark:text-gray-400">
                      {t("No staff performance data for this range")}
                    </td>
                  </tr>
                ) : (
                  staffData.map((staff, index) => {
                    const totalSales = Number(staff.total_sales) || 0;
                    const ordersHandled = Number(staff.orders_handled) || 0;
                    const itemsSold = Number(staff.total_items_sold) || 0;
                    const avgOrderValue = Number(staff.avg_order_value) || 0;
                    return (
                      <tr
                        key={`${staff.staff_name}-${index}`}
                        className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <td className="px-3 py-2 font-medium">{staff.staff_name}</td>
                        <td className="px-3 py-2 text-right">{ordersHandled}</td>
                        <td className="px-3 py-2 text-right">{itemsSold}</td>
                        <td className="px-3 py-2 text-right">₺{totalSales.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">₺{avgOrderValue.toFixed(1)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={staffData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="staff_name" />
                <YAxis tickFormatter={(value) => `₺${Number(value || 0).toLocaleString()}`} />
                <ReTooltip formatter={(value) => `₺${Number(value || 0).toLocaleString()}`} />
                <Bar dataKey="total_sales" fill="#6366F1" />
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
                      {categoryIcons[category.category?.trim()] ?? "📦"} {category.category}
                    </h4>
                    <button
                      onClick={() => toggleCategory(category.category)}
                      className="text-xs underline"
                    >
                      {expandedCategories[category.category] ? t("Hide") : t("Show")}
                    </button>
                  </div>
                  <p className="text-xl font-extrabold mt-1">
                    ₺
                    {(
                      categoryDetails[category.category]?.reduce(
                        (sum, item) => sum + item.total,
                        0
                      ) || 0
                    ).toLocaleString()}
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
                            <span className="tabular-nums">₺{item.total.toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-3 border-gray-300 dark:border-gray-700">
              {t("Total Category Sales")}: ₺{totalCategorySales.toLocaleString()}
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
        <ChartCard
          title={t("Category Trends")}
          actions={
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={categoryTrendRange}
                onChange={(event) => setCategoryTrendRange(event.target.value)}
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
                    onChange={(event) => setCustomTrendFrom(event.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="date"
                    value={customTrendTo}
                    onChange={(event) => setCustomTrendTo(event.target.value)}
                    className="border rounded px-2 py-1 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={refetchCategoryTrends}>
                    {t("Apply")}
                  </Button>
                </>
              )}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryTrends} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(dateStr) => {
                  const date = new Date(dateStr);
                  return date.toLocaleDateString(undefined, { weekday: "short" });
                }}
              />
              <YAxis tickFormatter={(value) => `₺${value.toLocaleString()}`} />
              <ReTooltip formatter={(value) => `₺${parseFloat(value).toFixed(2)}`} />
              <Legend />
              {allCategories.map((category, index) => (
                <Bar
                  key={category}
                  dataKey={category}
                  fill={["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#E11D48"][index % 7]}
                  barSize={20}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </SectionState>

      <SectionState
        loading={salesTrendsLoading}
        error={salesTrendsError}
        onRetry={refetchSalesTrends}
        loadingMessage={sectionLoadingMessage}
      >
        <div ref={salesTrendsRef}>
          <ChartCard
            title={t("Sales Trends")}
            actions={
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={salesViewType}
                  onChange={(event) => {
                    setSalesViewType(event.target.value);
                    salesTrendsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className="border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white"
                >
                  {["hourly", "daily", "weekly", "yearly"].map((option) => (
                    <option key={option} value={option}>
                      {t(option)}
                    </option>
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
                <input
                  ref={yMinRef}
                  defaultValue="1000"
                  className="w-24 text-sm px-2 py-1 rounded border"
                  placeholder={`₺ ${t("Min")}`}
                />
                <span className="text-sm">–</span>
                <input
                  ref={yMaxRef}
                  defaultValue="150000"
                  className="w-28 text-sm px-2 py-1 rounded border"
                  placeholder={`₺ ${t("Max")}`}
                />
                <Button size="sm" variant="outline" onClick={applyYRange}>
                  {t("Apply")}
                </Button>
                <Button size="sm" onClick={() => setZoomRange(Math.max(5, zoomRange - 5))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => setZoomRange(Math.min(salesTrendsData.length, zoomRange + 5))}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={300}>
              {salesChartType === "area" ? (
                <AreaChart data={visibleSalesData}>
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
                  <YAxis domain={[yMin, yMax]} tickFormatter={(value) => `₺${(value / 1000).toFixed(0)}k`} />
                  <ReTooltip />
                  <Area type="monotone" dataKey="sales" stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} />
                </AreaChart>
              ) : (
                <LineChart data={visibleSalesData}>
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
                  <YAxis domain={[yMin, yMax]} tickFormatter={(value) => `₺${(value / 1000).toFixed(0)}k`} />
                  <ReTooltip />
                  <Line type="monotone" dataKey="sales" stroke="#6366F1" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </SectionState>

      <SectionState
        loading={overviewLoading}
        error={overviewError}
        onRetry={refetchOverview}
        loadingMessage={sectionLoadingMessage}
      >
        <ChartCard
          title={`📉 ${t("Expenses Breakdown")}`}
        >
          <div className="space-y-2 overflow-y-auto max-h-[300px]">
            {Object.entries(
              (expensesData || []).reduce((acc, row) => {
                acc[row.type] = (acc[row.type] || 0) + parseFloat(row.amount || 0);
                return acc;
              }, {})
            ).map(([type, total]) => (
              <div
                key={type}
                className="flex justify-between text-sm border-b border-gray-200 dark:border-gray-700 pb-1"
              >
                <span>{type}</span>
                <span className="font-semibold">₺{total.toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right text-base font-bold text-indigo-600 dark:text-indigo-400 border-t pt-3 border-gray-300 dark:border-gray-700">
            {t("Total Expenses")}: ₺{extraExpenses.toLocaleString()}
          </div>
        </ChartCard>
      </SectionState>

      <SectionState
        loading={profitLossLoading}
        error={profitLossError}
        onRetry={refetchProfitLoss}
        loadingMessage={sectionLoadingMessage}
      >
        <div ref={profitLossRef}>
          <ChartCard
            title={t("Profit & Loss Breakdown")}
            actions={
              <div className="space-x-1">
                {["daily", "weekly", "monthly"].map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={timeframe === option ? "default" : "outline"}
                    onClick={() => {
                      setTimeframe(option);
                      profitLossRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                    }}
                  >
                    {t(option.charAt(0).toUpperCase() + option.slice(1))}
                  </Button>
                ))}
              </div>
            }
          >
            <div className="grid md:grid-cols-3 gap-6">
              {profitLossData.map(({ date, profit: profitValue, loss }) => {
                const net = profitValue - loss;
                const margin = profitValue + loss > 0 ? (profitValue / (profitValue + loss)) * 100 : 0;
                const profitColor =
                  net >= 0 ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-400";
                const bgColor = net >= 0 ? "bg-green-50 dark:bg-green-900" : "bg-red-50 dark:bg-red-900";

                return (
                  <div
                    key={date}
                    className={`rounded-2xl shadow-xl p-4 space-y-2 text-center ${bgColor}`}
                  >
                    <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300">{date}</h4>
                    <div className="grid grid-cols-1 gap-1 text-sm">
                      <div className="flex justify-between px-2">
                        <span className="text-gray-500">{t("Net Sales")}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-300">
                          ₺{profitValue.toLocaleString()}
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
                        <span className="font-semibold text-accent">{margin.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      </SectionState>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 w-[90%] max-w-lg space-y-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              📤 {t("Export Report Data")}
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
