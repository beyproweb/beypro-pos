// components/SupplierOverview.jsx
import React, { useMemo, useState } from "react";
import { useCurrency } from "../context/CurrencyContext";

export default function SupplierOverview({ suppliers = [], t }) {
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // === Filtered + Searched suppliers ===
  const filteredSuppliers = useMemo(() => {
    let list = suppliers;
    if (filter === "due") list = list.filter((s) => Number(s.total_due) > 0);
    if (filter === "paid") list = list.filter((s) => Number(s.total_due) === 0);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((s) => s.name?.toLowerCase().includes(term));
    }
    return list;
  }, [suppliers, filter, search]);

  const totalSuppliers = suppliers.length;
  const totalDue = useMemo(
    () => suppliers.reduce((sum, s) => sum + (Number(s.total_due) || 0), 0),
    [suppliers]
  );
  const totalPaid = useMemo(
    () => suppliers.reduce((sum, s) => sum + (Number(s.total_paid) || 0), 0),
    [suppliers]
  );

  const topSuppliers = useMemo(
    () =>
      [...filteredSuppliers]
        .sort((a, b) => (b.total_due || 0) - (a.total_due || 0))
        .slice(0, 6),
    [filteredSuppliers]
  );

  return (
    <div className="w-full space-y-8">
      {/* === Summary Cards === */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 p-4 text-white shadow">
          <p className="text-sm font-semibold">{t("Total Suppliers")}</p>
          <p className="text-3xl font-bold mt-2">{totalSuppliers}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 p-4 text-white shadow">
          <p className="text-sm font-semibold">{t("Total Outstanding Dues")}</p>
          <p className="text-3xl font-bold mt-2">
            {formatCurrency(totalDue)}
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 p-4 text-white shadow">
          <p className="text-sm font-semibold">{t("Total Paid (Recorded)")}</p>
          <p className="text-3xl font-bold mt-2">
            {formatCurrency(totalPaid)}
          </p>
        </div>
      </div>

      {/* === Filters & Search === */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("Filter")}
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white/90 py-2 px-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
          >
            <option value="all">{t("All Suppliers")}</option>
            <option value="due">{t("Only with Due")}</option>
            <option value="paid">{t("Only Paid")}</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.2-5.2M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder={t("Search supplier...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white/90 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
          />
        </div>
      </div>

      {/* === Supplier Table === */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              {[t("Supplier"), t("Total Spent"), t("Paid"), t("Outstanding"), t("Last Purchase")].map(
                (header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {topSuppliers.length > 0 ? (
              topSuppliers.map((s) => {
                const due = Number(s.total_due) || 0;
                const spent = Number(s.total_spent || s.total_purchase || 0);
                const paid = Number(s.total_paid || 0);
                const lastDate = s.last_purchase_date
                  ? new Date(s.last_purchase_date).toLocaleDateString()
                  : "—";

                return (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(spent)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {formatCurrency(paid)}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${
                        due > 0
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {formatCurrency(due)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {lastDate}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan="5"
                  className="px-4 py-8 text-center text-slate-500 dark:text-slate-400"
                >
                  {t("No suppliers found")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
