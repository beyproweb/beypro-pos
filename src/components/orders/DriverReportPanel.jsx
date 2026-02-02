import React from "react";

export function DriverReportPanel({
  t,
  showDriverReport,
  reportLoading,
  driverReport,
  showDriverColumn,
  formatCurrency,
}) {
  if (!showDriverReport) return null;

  if (reportLoading) {
    return (
      <div className="mt-2 animate-pulse text-lg sm:text-xl">
        {t("Loading driver report...")}
      </div>
    );
  }

  if (driverReport?.error) {
    return (
      <div className="mt-2 text-red-600 font-bold">
        {driverReport.error}
      </div>
    );
  }

  if (!driverReport) {
    return null;
  }

  return (
    <div className="mt-2 rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] p-8 bg-white border border-slate-200 space-y-5 dark:bg-slate-950/60 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
      <div className="flex flex-wrap gap-10 items-center mb-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">
            {t("Packets Delivered")}
          </div>
          <div className="text-xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
            {driverReport.packets_delivered}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">
            {t("Total Sales")}
          </div>
          <div className="text-xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
            {driverReport.total_sales != null
              ? formatCurrency(driverReport.total_sales)
              : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-[0.2em] dark:text-slate-400">
            {t("By Payment Method")}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(driverReport.sales_by_method).map(([method, amt]) => (
              <span
                key={method}
                className="bg-slate-100 border border-slate-200 shadow-sm px-3 py-1 rounded-lg font-semibold text-sm text-slate-700 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-200"
              >
                {method}: {formatCurrency(amt)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-950/40 dark:border-slate-800">
          <thead>
            <tr>
              {showDriverColumn && (
                <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                  {t("Driver")}
                </th>
              )}
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Customer")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Address")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Total")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Payment")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Delivered")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Pickup→Delivery")}
              </th>
              <th className="p-3 text-left font-semibold text-slate-500 uppercase tracking-[0.15em] bg-slate-50 dark:bg-slate-900/50 dark:text-slate-300">
                {t("Kitchen→Delivery")}
              </th>
            </tr>
          </thead>
          <tbody>
            {driverReport.orders.map((ord) => (
              <tr
                key={ord.id}
                className="border-t border-slate-100 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:hover:bg-slate-900/30"
              >
                {showDriverColumn && (
                  <td className="p-3 text-slate-700 dark:text-slate-200">
                    {ord.driver_name || "-"}
                  </td>
                )}
                <td className="p-3 text-slate-700 dark:text-slate-200">
                  {ord.customer_name || "-"}
                </td>
                <td className="p-3 text-slate-500 dark:text-slate-400">
                  {ord.customer_address || "-"}
                </td>
                <td className="p-3 text-slate-900 font-semibold dark:text-slate-100">
                  {formatCurrency(parseFloat(ord.total || 0))}
                </td>
                <td className="p-3 text-slate-600 dark:text-slate-300">
                  {ord.payment_method}
                </td>
                <td className="p-3 text-slate-500 dark:text-slate-400">
                  {ord.delivered_at
                    ? new Date(ord.delivered_at).toLocaleTimeString()
                    : "-"}
                </td>
                <td className="p-3 text-slate-500 dark:text-slate-400">
                  {ord.delivery_time_seconds
                    ? (ord.delivery_time_seconds / 60).toFixed(1) + ` ${t("min")}`
                    : "-"}
                </td>
                <td className="p-3 text-slate-500 dark:text-slate-400">
                  {ord.kitchen_to_delivery_seconds
                    ? (ord.kitchen_to_delivery_seconds / 60).toFixed(1) + ` ${t("min")}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DriverReportPanel;
