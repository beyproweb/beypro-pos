// src/pages/CustomerInsights.jsx
import React, { useEffect, useState } from "react";
import { Search, User, Gift, Phone, Repeat, Star, Mail, MapPin, Calendar, TrendingUp, Clock } from "lucide-react";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useNavigate } from "react-router-dom";

export default function CustomerInsights() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const { t } = useTranslation();
  const canAccess = useHasPermission("customer");
  const [editModal, setEditModal] = useState({ open: false, data: null });
  const [reopenCustomerId, setReopenCustomerId] = useState(null);
  const navigate = useNavigate();

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

  const handleReopenDebt = async (customer) => {
    if (!customer?.phone) {
      alert("❌ Customer phone is required to reopen debt");
      return;
    }
    try {
      setReopenCustomerId(customer.id);
      const order = await secureFetch(`/orders/debt/find?phone=${encodeURIComponent(customer.phone)}`);
      if (!order) {
        alert(t("No unpaid debt order found for this customer."));
        return;
      }
      const reopened = await secureFetch(`/orders/${order.id}/reopen`, { method: "PATCH" });
      if (!reopened || reopened.error) {
        throw new Error(reopened?.error || "Failed to reopen order");
      }
      navigate(`/transaction/phone/${order.id}`, { state: { order: reopened } });
    } catch (err) {
      alert("❌ " + (err.message || "Failed to reopen debt order"));
    } finally {
      setReopenCustomerId(null);
    }
  };

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
      <div className="rounded-3xl shadow-xl bg-white dark:bg-zinc-900/70 border border-blue-100 dark:border-zinc-800 p-6">
        {loading ? (
          <div className="py-12 text-center text-blue-500 font-semibold">{t("Loading…")}</div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center text-gray-500">{t("No customers found")}</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {customers.map((c) => {
              const debtValue = Number.isFinite(Number(c.debt)) ? Number(c.debt) : 0;
              const debtPositive = debtValue > 0;
              const lastVisitText = c.last_visit ? new Date(c.last_visit).toLocaleDateString() : t("Not yet");
              const birthdayText = c.birthday ? new Date(c.birthday).toLocaleDateString("en-GB") : t("Unknown");

              return (
                <article
                  key={c.id}
                  className="relative overflow-hidden rounded-3xl border border-slate-100 bg-white/90 shadow-lg ring-1 ring-slate-100/70 transition hover:-translate-y-0.5 hover:shadow-2xl dark:bg-zinc-900 dark:border-zinc-800"
                >
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-blue-500/50 via-indigo-500/50 to-purple-500/40 blur-3xl opacity-40 pointer-events-none" />
                  <div className="relative p-5 space-y-4">
                    <header className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-semibold text-slate-900 dark:text-white">
                          {c.name || t("Guest")}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-300">
                          <Phone className="w-4 h-4" /> {c.phone || t("No phone")}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          debtPositive
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {debtPositive ? `${t("Debt")} ₺${debtValue.toFixed(2)}` : t("In good standing")}
                      </span>
                    </header>

                    <div className="flex flex-wrap gap-2">
                      <MetricChip label={t("Visits")} value={c.visit_count || 1} />
                      <MetricChip label={t("Lifetime Value")} value={`₺${c.lifetime_value?.toLocaleString?.() ?? "0"}`} icon={<TrendingUp className="w-3.5 h-3.5" />} />
                      <MetricChip label={t("Last Visit")} value={lastVisitText} icon={<Clock className="w-3.5 h-3.5" />} />
                    </div>

                    <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-200">
                      <InfoRow
                        icon={<MapPin className="w-4 h-4" />}
                        label={t("Address")}
                        value={c.address || t("No address saved")}
                      />
                      <InfoRow
                        icon={<Mail className="w-4 h-4" />}
                        label={t("Email")}
                        value={c.email || t("No email")}
                      />
                      <InfoRow
                        icon={<Calendar className="w-4 h-4" />}
                        label={t("Birthday")}
                        value={birthdayText}
                      />
                    </div>

                    <footer className="flex flex-wrap gap-3 pt-3 border-t border-slate-100/80 dark:border-zinc-700/50">
                      {debtPositive && (
                        <button
                          className="flex-1 min-w-[120px] rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-60"
                          disabled={reopenCustomerId === c.id}
                          onClick={() => handleReopenDebt(c)}
                        >
                          {reopenCustomerId === c.id ? t("Reopening…") : t("Reopen Debt")}
                        </button>
                      )}
                      <button
                        className="flex-1 min-w-[120px] rounded-xl border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700/50 dark:text-indigo-200"
                        onClick={() => setEditModal({ open: true, data: c })}
                      >
                        ✏️ {t("Edit")}
                      </button>
                    </footer>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

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

function MetricChip({ label, value, icon }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-zinc-900 dark:border-zinc-700 dark:text-slate-300">
      {icon}
      {label}: <span className="text-slate-900 dark:text-white">{value}</span>
    </span>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2 dark:bg-zinc-800/60 dark:border-zinc-700">
      <span className="text-slate-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 break-words">{value}</p>
      </div>
    </div>
    
  );
}
