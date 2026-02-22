import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useTranslation } from "react-i18next";
import DateRangeSelector from "../components/reports/DateRangeSelector";
import useDateRangeState from "../hooks/reports/useDateRangeState";
import secureFetch from "../utils/secureFetch";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useCurrency } from "../context/CurrencyContext";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";

const formatNumber = (value) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number.isFinite(Number(value)) ? Number(value) : 0
  );

export default function OperationalEfficiency() {
  const { t } = useTranslation();
  const hasReports = useHasPermission("reports");
  const { formatCurrency } = useCurrency();
  const {
    dateRange,
    setDateRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    from,
    to,
  } = useDateRangeState("week");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ops, setOps] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const opsRes = await secureFetch(
          `/analytics/operational-efficiency?start_date=${from}&end_date=${to}`
        );
        if (!cancelled) setOps(opsRes);
      } catch (err) {
        if (!cancelled) {
          console.error("❌ Failed to load operational efficiency:", err);
          setError(err?.message || "Failed to load report");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const cleaningUsagePer100Customers = useMemo(() => {
    const direct = Number(ops?.cleaning_usage_per_100_customers);
    if (Number.isFinite(direct)) return direct;
    const totalUnits = Number(ops?.cleaning_stock_usage_total?.total_units || 0);
    const customers = Number(ops?.total_customers || 0);
    return customers > 0 ? (totalUnits / customers) * 100 : 0;
  }, [ops]);

  const kpis = useMemo(() => {
    if (!ops) return [];
    const deltas = ops?.comparisons?.delta_percent || {};
    return [
      {
        key: "total_customers",
        label: t("Total Customers"),
        value: formatNumber(ops.total_customers),
        delta: deltas.total_customers,
      },
      {
        key: "total_staff_hours",
        label: t("Total Staff Hours"),
        value: formatNumber(ops.total_staff_hours),
        delta: deltas.total_staff_hours,
      },
      {
        key: "cleaning_expense_total",
        label: t("Cleaning Expense (₺)"),
        value: formatCurrency(ops.cleaning_expense_total || 0),
        delta: deltas.cleaning_expense_total,
      },
      {
        key: "cleaning_cost_per_customer",
        label: t("Cleaning Cost / Customer"),
        value: formatCurrency(ops.cleaning_cost_per_customer || 0),
        delta: deltas.cleaning_cost_per_customer,
      },
      {
        key: "cleaning_cost_per_staff_hour",
        label: t("Cleaning Cost / Staff Hour"),
        value: formatCurrency(ops.cleaning_cost_per_staff_hour || 0),
        delta: deltas.cleaning_cost_per_staff_hour,
      },
      {
        key: "cleaning_usage_per_100_customers",
        label: t("Cleaning Usage / 100 Customers"),
        value: formatNumber(cleaningUsagePer100Customers),
        delta: deltas.cleaning_usage_per_100_customers,
      },
    ];
  }, [ops, t, formatCurrency, cleaningUsagePer100Customers]);

  const dailySeries = useMemo(() => ops?.daily_metrics || [], [ops]);
  const topCleaningItems = useMemo(() => {
    const rows = Array.isArray(ops?.cleaning_stock_usage_total?.by_product)
      ? ops.cleaning_stock_usage_total.by_product
      : [];
    if (rows.length > 0) {
      return rows.slice(0, 5).map((row) => ({
        name: row.product_name || `#${row.stock_id || "-"}`,
        units: row.total_units || 0,
        value: row.total_value || 0,
      }));
    }
    const totalUnits = Number(ops?.cleaning_stock_usage_total?.total_units || 0);
    const totalValue = Number(ops?.cleaning_stock_usage_total?.total_value || 0);
    if (totalUnits > 0 || totalValue > 0) {
      return [{ name: t("Total Cleaning Usage"), units: totalUnits, value: totalValue }];
    }
    return [];
  }, [ops, t]);

  const alerts = ops?.alerts || [];

  if (!hasReports) {
    return (
      <div className="p-10 text-center text-rose-600 font-semibold">
        {t("Access denied for reports")}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              {t("Operational Efficiency")}
            </h1>
            <Link
              to="/reports"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("Back to Reports")}
            </Link>
          </div>
          <p className="text-slate-500">
            {t("Correlate customers, staff hours, and cleaning cost signals.")}
          </p>
        </div>
        <DateRangeSelector
          range={dateRange}
          onRangeChange={setDateRange}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-slate-500">{t("Loading report...")}</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpis.map((kpi) => (
              <Card key={kpi.key} className="shadow-sm border-slate-200">
                <CardContent className="p-4 space-y-2">
                  <div className="text-sm text-slate-500 font-semibold">{kpi.label}</div>
                  <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                  {kpi.delta != null && (
                    <div
                      className={`text-sm font-semibold ${
                        kpi.delta > 0 ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {kpi.delta > 0 ? "▲" : "▼"} {Math.abs(kpi.delta).toFixed(1)}%
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 shadow-sm border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {t("Cleaning Cost per Customer")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("Daily trend")}
                  </div>
                </div>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <ReTooltip formatter={(v) => formatCurrency(v)} />
                      <Line
                        type="monotone"
                        dataKey="cleaning_cost_per_customer"
                        stroke="#0ea5e9"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {t("Top Cleaning Items (usage)")}
                  </div>
                  <div className="text-xs text-slate-500">{t("Units used")}</div>
                </div>
                <div style={{ width: "100%", height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={topCleaningItems}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Legend />
                      <ReTooltip />
                      <Bar dataKey="units" fill="#22c55e" name={t("Units")} />
                      <Bar dataKey="value" fill="#6366f1" name={t("Value")} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="text-lg font-semibold text-slate-900">
                  {t("Alerts")}
                </div>
                {alerts.length === 0 ? (
                  <div className="text-slate-500 text-sm">
                    {t("No alerts for this period.")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                      >
                        <div className="text-sm font-semibold text-amber-700">
                          {alert.title}
                        </div>
                        <div className="text-xs text-amber-700/90">
                          {alert.message}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardContent className="p-4 space-y-3">
                <div className="text-lg font-semibold text-slate-900">
                  {t("Daily Customers")}
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2">{t("Date")}</th>
                        <th className="py-2">{t("Customers")}</th>
                        <th className="py-2">{t("Cleaning Cost / Customer")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ops?.daily_metrics || []).map((row) => (
                        <tr key={row.date} className="border-t border-slate-100">
                          <td className="py-2">{row.date}</td>
                          <td className="py-2 font-semibold">{row.customer_count}</td>
                          <td className="py-2">
                            {formatCurrency(row.cleaning_cost_per_customer || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">
                  {t("Cleaning Supplies Usage")}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCustomStart(from)}
                  className="hidden"
                >
                  {t("Refresh")}
                </Button>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2">{t("Item")}</th>
                      <th className="py-2">{t("Units Used")}</th>
                      <th className="py-2">{t("Value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCleaningItems.map((row, idx) => (
                      <tr key={`${row.name || idx}`} className="border-t border-slate-100">
                        <td className="py-2">{row.name || `#${idx + 1}`}</td>
                        <td className="py-2">{formatNumber(row.units)}</td>
                        <td className="py-2">{formatCurrency(row.value || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
