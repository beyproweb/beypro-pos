import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import secureFetch from "../utils/secureFetch";
import { useTranslation } from "react-i18next";
import { useCurrency } from "../context/CurrencyContext";
import socket from "../utils/socket";

export default function LiveIngredientPricesWidget({ maxItems = 4 }) {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await secureFetch("/ingredient-prices");
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const onPricesUpdated = () => load();
    socket.on("ingredient-prices-updated", onPricesUpdated);
    return () => {
      clearInterval(interval);
      socket.off("ingredient-prices-updated", onPricesUpdated);
    };
  }, []);

  const limited = useMemo(() => rows.slice(0, maxItems), [rows, maxItems]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between px-0 mb-4">
        <h2 className="text-sm font-semibold opacity-80">
          {t("Live Ingredient Prices")}
        </h2>
        {loading && (
          <span className="text-xs opacity-60">{t("Refreshing")}…</span>
        )}
      </div>

      {/* Date Picker Controls */}
      <div className="mb-4 flex flex-wrap items-end gap-3 p-3 rounded-xl bg-gray-50/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold opacity-70 mb-1">
            {t("From Date")}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300/50 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold opacity-70 mb-1">
            {t("To Date")}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300/50 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition"
        >
          {t("Apply")}
        </button>
      </div>
      
      {/* Table wrapper with proper overflow handling */}
      <div className="w-full overflow-x-auto rounded-2xl border border-gray-200/70 dark:border-white/10">
        <div className="min-w-full bg-white/80 dark:bg-white/5">
          <table className="w-full text-sm">
            <thead className="text-xs opacity-70 bg-gray-50/50 dark:bg-white/5 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 whitespace-nowrap font-semibold w-1/4">{t("Ingredient")}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap font-semibold w-1/6">{t("Past Price")}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap font-semibold w-1/6">{t("Actual Price")}</th>
                <th className="text-left px-3 py-2 whitespace-nowrap font-semibold w-1/5">{t("Up By")}</th>
                <th className="px-3 py-2 text-center whitespace-nowrap font-semibold w-1/12">{t("Trend")}</th>
              </tr>
            </thead>
            <tbody>
            {loading && !limited.length && (
              <tr>
                <td colSpan="5" className="px-4 py-4 text-center opacity-60">
                  {t("Loading")}…
                </td>
              </tr>
            )}
            {!loading && limited.length === 0 && (
              <tr>
                <td colSpan="5" className="px-4 py-4 text-center opacity-60">
                  {t("No data available")}
                </td>
              </tr>
            )}
            {limited.map((it, i) => {
              const curr = Number(it.price_per_unit) || 0;
              const prev =
                it.previous_price === null || it.previous_price === undefined
                  ? null
                  : Number(it.previous_price);
              const diff = prev === null ? 0 : curr - prev;
              const pct = prev && prev !== 0 ? ((diff / prev) * 100).toFixed(1) : null;
              const up = diff > 0;
              const down = diff < 0;
              const neutral = !up && !down;
              const deltaStr = prev != null ? (diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`) : "—";

              return (
                <tr key={i} className="border-t border-gray-100 dark:border-white/10 hover:bg-gray-50/50 dark:hover:bg-white/5 transition">
                  <td className="px-4 py-3">
                    <div className="font-semibold leading-tight">
                      {it.name || "—"}
                    </div>
                    {it.supplier && (
                      <div className="text-[11px] opacity-70 mt-0.5">
                        {it.supplier}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {prev != null && Number.isFinite(prev) ? formatCurrency(prev) : "—"}
                  </td>
                  <td className="px-4 py-3 font-bold text-green-600 dark:text-green-400">
                    {Number.isFinite(curr) ? formatCurrency(curr) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {prev != null ? (
                      <div className={`font-semibold ${up ? "text-red-600 dark:text-red-400" : down ? "text-green-600 dark:text-green-400" : "opacity-70"}`}>
                        <div>{deltaStr}</div>
                        <div className="text-xs opacity-80">
                          {pct != null ? `(${up ? "+" : ""}${pct}%)` : ""}
                        </div>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {up && <ArrowUpRight className="w-5 h-5 inline text-red-600 dark:text-red-400" />}
                    {down && <ArrowDownRight className="w-5 h-5 inline text-green-600 dark:text-green-400" />}
                    {neutral && <span className="opacity-60 text-lg">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
