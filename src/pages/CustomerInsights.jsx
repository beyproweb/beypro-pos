// src/pages/CustomerInsights.jsx
import React, { useEffect, useState, useMemo } from "react";
import { Search, User, Gift, Phone, Calendar, Repeat, Star } from "lucide-react";
import axios from "axios";
import { useHasPermission } from "../components/hooks/useHasPermission";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
import { useTranslation } from "react-i18next";

export default function CustomerInsights() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const { t } = useTranslation();
  const canAccess = useHasPermission("customer");
if (!canAccess) {
  return <div className="p-12 text-2xl text-red-600 text-center">
    {t("Access Denied: You do not have permission to view Customer Insights.")}
  </div>;
}
useEffect(() => {
  fetch(`${API_URL}/api/customers/birthdays`)
    .then(res => res.json())
    .then(setBirthdayCustomers)
    .catch(console.error);
}, []);

  const [stats, setStats] = useState({
    total: 0,
    repeat: 0,
    birthdays: 0,
    top: [],
  });

  // Fetch customers (searching by name/phone)
  useEffect(() => {
    let ignore = false;
    async function fetchCustomers() {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/api/customers`, {
          params: { search },
        });
        if (ignore) return;
        setCustomers(res.data);
        // You can compute stats here or fetch from backend
        setStats(s => ({
          ...s,
          total: res.data.length,
          repeat: res.data.filter(c => c.visit_count && c.visit_count > 1).length,
          birthdays: res.data.filter(c => isThisWeekBirthday(c.birthday)).length,
top: [...res.data]
  .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
  .slice(0, 3),
        }));
      } catch (e) {
        setCustomers([]);
      }
      setLoading(false);
    }
    fetchCustomers();
    return () => { ignore = true; };
  }, [search]);

  // Helper: is birthday this week
  function isThisWeekBirthday(birthday) {
    if (!birthday) return false;
    const today = new Date();
    const bday = new Date(birthday);
    const thisYear = today.getFullYear();
    bday.setFullYear(thisYear);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return bday >= weekStart && bday <= weekEnd;
  }

  return (
    <div className="w-full px-3 py-6 max-w-6xl mx-auto">
      {/* Page Title + Quick Stats */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-1 flex items-center gap-2">
            <User className="inline w-7 h-7 text-blue-500" /> Customer Insights
          </h1>
          <span className="text-gray-500 dark:text-gray-400 text-base">Know your guests, boost retention and sales 🚀</span>
        </div>
        {/* Stats Cards */}
        <div className="flex gap-3 flex-wrap">
          <StatCard icon={<User />} label="Total" value={stats.total} color="from-blue-400 to-blue-700" />
          <StatCard icon={<Repeat />} label="Repeat" value={stats.repeat} color="from-green-400 to-green-600" />
          <StatCard icon={<Gift />} label="Birthdays" value={stats.birthdays} color="from-pink-400 to-pink-600" />
        </div>
      </div>
      {/* Search */}
      <div className="flex items-center gap-2 mb-5 max-w-lg">
        <div className="relative w-full">
          <input
            type="text"
            className="w-full rounded-xl border border-blue-200 dark:border-zinc-800 px-4 py-2 pl-10 text-base bg-white dark:bg-zinc-900 shadow focus:ring-2 focus:ring-blue-400 focus:outline-none transition"
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search className="absolute left-2 top-2.5 text-blue-400 dark:text-blue-300 w-5 h-5 pointer-events-none" />
        </div>
        <button
          className="ml-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow transition"
          onClick={() => setSearch("")}
        >
          Clear
        </button>
      </div>
      {/* Top Customers */}
      {stats.top.length > 0 && (
        <div className="mb-7">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-1 text-yellow-600 dark:text-yellow-300">
            <Star className="w-5 h-5 text-yellow-400" /> Top Customers
          </h2>
          <div className="flex flex-wrap gap-4">
            {stats.top.map(c => (
              <div key={c.id} className="flex flex-col gap-1 bg-gradient-to-br from-yellow-100/90 to-yellow-50 dark:from-yellow-900/70 dark:to-zinc-900/40 rounded-2xl px-6 py-4 shadow-lg min-w-[200px]">
                <span className="font-bold text-lg text-yellow-800 dark:text-yellow-100">{c.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"><Phone className="w-4 h-4" /> {c.phone}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200">₺{c.lifetime_value?.toLocaleString?.() ?? "0"}</span>
                <span className="text-xs text-yellow-700 dark:text-yellow-200">Visits: {c.visit_count || 1}</span>
              </div>
            ))}
          </div>
          <section className="mt-10">
  <h2 className="text-xl font-bold mb-3">🎂 Birthday Customers This Month</h2>
  {birthdayCustomers.length === 0 ? (
    <p className="text-gray-500">No birthdays this month.</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Phone</th>
            <th className="p-2 border">Birthday</th>
            <th className="p-2 border">Visits</th>
            <th className="p-2 border">Total Spent</th>
            <th className="p-2 border">Last Visit</th>
          </tr>
        </thead>
        <tbody>
          {birthdayCustomers.map(c => (
            <tr key={c.id}>
              <td className="p-2 border">{c.name}</td>
              <td className="p-2 border">{c.phone}</td>
              <td className="p-2 border">{new Date(c.birthday).toLocaleDateString()}</td>
              <td className="p-2 border text-center">{c.visit_count}</td>
              <td className="p-2 border">₺{parseFloat(c.lifetime_value).toFixed(2)}</td>
              <td className="p-2 border">{c.last_visit ? new Date(c.last_visit).toLocaleString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</section>
        </div>
      )}
      

      {/* Customer List */}
      <div className="rounded-2xl shadow-xl bg-white dark:bg-zinc-900/70 border border-blue-100 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm sm:text-base">
          <thead>
            <tr className="text-left border-b border-blue-100 dark:border-zinc-700">
              <th className="py-3 px-4 font-bold">Name</th>
              <th className="py-3 px-4 font-bold">Phone</th>
              <th className="py-3 px-4 font-bold">Address</th>
              <th className="py-3 px-4 font-bold">Visits</th>
              <th className="py-3 px-4 font-bold">Lifetime Value</th>
              <th className="py-3 px-4 font-bold">Last Visit</th>
              <th className="py-3 px-4 font-bold">Birthday</th>
              <th className="py-3 px-4 font-bold">Email</th>

            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-blue-500 font-semibold">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-gray-500">No customers found</td></tr>
            ) : (
              customers.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-blue-50 dark:border-zinc-800 hover:bg-blue-50/60 dark:hover:bg-zinc-800/30 transition group"
                >
                  <td className="py-3 px-4 font-semibold text-blue-700 dark:text-blue-200">{c.name}</td>
                  <td className="py-3 px-4">{c.phone}</td>
                  <td className="py-3 px-4">{c.address}</td>
                  <td className="py-3 px-4">{c.visit_count || 1}</td>
                  <td className="py-3 px-4">₺{c.lifetime_value?.toLocaleString?.() ?? "0"}</td>
                  <td className="py-3 px-4">{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : "-"}</td>
                  <td className="py-3 px-4">{c.birthday ? new Date(c.birthday).toLocaleDateString("en-GB") : "-"}</td>
                  <td className="py-3 px-4">{c.email || <span className="text-gray-400">—</span>}</td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Footer */}
      <div className="mt-8 text-sm text-gray-400 text-center">
        Beypro Customer Insights — <span className="font-semibold">Grow your loyal customer base</span>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className={`flex flex-col items-center justify-center min-w-[80px] rounded-xl bg-gradient-to-br ${color} text-white shadow-lg px-4 py-2`}>
      <span className="mb-1">{icon}</span>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
