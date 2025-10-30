// src/pages/CustomerInsights.jsx
import React, { useEffect, useState } from "react";
import { Search, User, Gift, Phone, Repeat, Star } from "lucide-react";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";

export default function CustomerInsights() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const { t } = useTranslation();
  const canAccess = useHasPermission("customer");
  const [editModal, setEditModal] = useState({ open: false, data: null });

async function handleSaveCustomer(updated) {
  try {
    const res = await secureFetch(`/customers/${updated.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: updated.name,
        phone: updated.phone,
        address: updated.address || "",
        birthday: updated.birthday ? updated.birthday : null,
        email: updated.email || null,
      }),
    });
    setCustomers(cs => cs.map(c => c.id === updated.id ? { ...res } : c));
    setEditModal({ open: false, data: null });
    alert("✅ Customer updated successfully!");
  } catch (err) {
    alert("❌ Failed to update: " + err.message);
  }
}


async function handleDeleteCustomer(id) {
  if (!window.confirm("Are you sure you want to delete this customer?")) return;
  try {
    await secureFetch(`/customers/${id}`, { method: "DELETE" });
    setCustomers(cs => cs.filter(c => c.id !== id));
    setEditModal({ open: false, data: null });
    alert("🗑️ Customer deleted successfully!");
  } catch (err) {
    alert("❌ Failed to delete customer: " + err.message);
  }
}

  if (!canAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Customer Insights.")}
      </div>
    );
  }

  useEffect(() => {
    secureFetch("/customers/birthdays")
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
        const query = search ? `?search=${encodeURIComponent(search)}` : "";
        const res = await secureFetch(`/customers${query}`);
        if (ignore) return;
        setCustomers(res);
        // You can compute stats here or fetch from backend
        setStats(s => ({
          ...s,
          total: res.length,
          repeat: res.filter(c => c.visit_count && c.visit_count > 1).length,
          birthdays: res.filter(c => isThisWeekBirthday(c.birthday)).length,
          top: [...res]
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
    <tr><td colSpan={9} className="py-12 text-center text-blue-500 font-semibold">Loading…</td></tr>
  ) : customers.length === 0 ? (
    <tr><td colSpan={9} className="py-12 text-center text-gray-500">No customers found</td></tr>
  ) : (
    customers.map(c => (
      <tr
        key={c.id}
        className="border-b border-blue-50 dark:border-zinc-800 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-zinc-800 dark:hover:to-zinc-900 transition-all group"
      >
        <td className="py-3 px-4 font-semibold text-blue-700 dark:text-blue-200">{c.name}</td>
        <td className="py-3 px-4">{c.phone}</td>
        <td className="py-3 px-4">{c.address}</td>
        <td className="py-3 px-4 text-center">{c.visit_count || 1}</td>
        <td className="py-3 px-4">₺{c.lifetime_value?.toLocaleString?.() ?? "0"}</td>
        <td className="py-3 px-4">{c.last_visit ? new Date(c.last_visit).toLocaleDateString() : "-"}</td>
        <td className="py-3 px-4">{c.birthday ? new Date(c.birthday).toLocaleDateString("en-GB") : "-"}</td>
        <td className="py-3 px-4">{c.email || <span className="text-gray-400">—</span>}</td>
        <td className="py-3 px-4 text-right">
          <button
            className="text-blue-600 hover:underline text-sm"
            onClick={() => setEditModal({ open: true, data: c })}
          >
            ✏️ Edit
          </button>
        </td>
      </tr>
    ))
  )}
</tbody>



{editModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl w-full max-w-lg p-6 relative">
      <h2 className="text-2xl font-bold mb-4 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
        Edit Customer
      </h2>

      <div className="space-y-3">
        <input
          className="border-2 border-blue-100 rounded-xl px-3 py-2 w-full"
          value={editModal.data.name || ""}
          onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, name: e.target.value } }))}
          placeholder="Name"
        />
        <input
          className="border-2 border-blue-100 rounded-xl px-3 py-2 w-full"
          value={editModal.data.phone || ""}
          onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, phone: e.target.value } }))}
          placeholder="Phone"
        />
        <input
          className="border-2 border-blue-100 rounded-xl px-3 py-2 w-full"
          value={editModal.data.address || ""}
          onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, address: e.target.value } }))}
          placeholder="Address"
        />
        <input
          type="email"
          className="border-2 border-blue-100 rounded-xl px-3 py-2 w-full"
          value={editModal.data.email || ""}
          onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, email: e.target.value } }))}
          placeholder="Email"
        />
        <input
          type="date"
          className="border-2 border-pink-100 rounded-xl px-3 py-2 w-full"
          value={editModal.data.birthday ? new Date(editModal.data.birthday).toISOString().slice(0, 10) : ""}
          onChange={e => setEditModal(m => ({ ...m, data: { ...m.data, birthday: e.target.value } }))}
        />
      </div>

      <div className="flex flex-wrap gap-2 justify-between mt-6">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold"
          onClick={() => handleSaveCustomer(editModal.data)}
        >
          💾 Save Changes
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold"
          onClick={() => handleDeleteCustomer(editModal.data.id)}
        >
          🗑 Delete
        </button>
        <button
          className="text-gray-700 dark:text-gray-200 hover:underline px-4 py-2"
          onClick={() => setEditModal({ open: false, data: null })}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}



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
