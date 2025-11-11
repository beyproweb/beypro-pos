// src/pages/CustomerInsights.jsx
import React, { useEffect, useState, useCallback } from "react";
import { Search, User, Gift, Phone, Repeat, Star, Mail, MapPin, Calendar, TrendingUp, Clock } from "lucide-react";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { getPaymentMethodLabel } from "../utils/paymentMethods";

export default function CustomerInsights() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [birthdayCustomers, setBirthdayCustomers] = useState([]);
  const { t } = useTranslation();
  const canAccess = useHasPermission("customer");
  const [editModal, setEditModal] = useState({ open: false, data: null });
  const paymentMethods = usePaymentMethods();
  const [debtModal, setDebtModal] = useState({
    open: false,
    loading: false,
    customer: null,
    orders: [],
    order: null,
    items: [],
    paymentMethod: "",
    amount: "",
    error: "",
  });
  const [isDebtPaying, setIsDebtPaying] = useState(false);
  const paymentOptions = paymentMethods.length
    ? paymentMethods.map((pm) => ({
        value: pm.id || pm.label,
        label: pm.label || pm.id || "Method",
      }))
    : ["Cash", "Credit Card", "Sodexo", "Multinet"].map((label) => ({
        value: label,
        label,
      }));
  const defaultPaymentMethod = paymentOptions[0]?.value || "";

  useEffect(() => {
    if (debtModal.open && !debtModal.paymentMethod && defaultPaymentMethod) {
      setDebtModal((prev) => ({
        ...prev,
        paymentMethod: defaultPaymentMethod,
      }));
    }
  }, [debtModal.open, debtModal.paymentMethod, defaultPaymentMethod]);

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

  const closeDebtModal = useCallback(() => {
    setDebtModal({
      open: false,
      loading: false,
      customer: null,
      orders: [],
      order: null,
      items: [],
      paymentMethod: "",
      amount: "",
      error: "",
    });
    setIsDebtPaying(false);
  }, []);

  const normalizeDebtItems = useCallback(
    (items = []) =>
      items.map((item) => ({
        ...item,
        display_name:
          item.name ||
          item.order_item_name ||
          item.product_name ||
          item.external_product_name ||
          t("Item"),
      })),
    [t]
  );

  const fetchDebtOrderItems = useCallback(
    async (orderId) => {
      const items = await secureFetch(`/orders/${orderId}/items`);
      return normalizeDebtItems(Array.isArray(items) ? items : []);
    },
    [normalizeDebtItems]
  );

  const handleOpenDebtPayment = async (customer) => {
    if (!customer?.phone) {
      alert("❌ Customer phone is required to pay debt");
      return;
    }
    setIsDebtPaying(false);
    setDebtModal({
      open: true,
      loading: true,
      customer,
      orders: [],
      order: null,
      items: [],
      paymentMethod: defaultPaymentMethod,
      amount: "",
      error: "",
    });
    try {
      const data = await secureFetch(`/orders/debt/find?phone=${encodeURIComponent(customer.phone)}`);
      const ordersList = Array.isArray(data?.orders)
        ? data.orders
        : data?.id
        ? [data]
        : [];
      if (!ordersList.length) {
        throw new Error(t("No unpaid debt order found for this customer."));
      }
      const normalizedOrders = ordersList.map((order) => ({
        ...order,
        debt_recorded_total: Number(order.debt_recorded_total || 0),
      }));
      const ordersWithItems = [];
      for (const order of normalizedOrders) {
        const items = await fetchDebtOrderItems(order.id);
        ordersWithItems.push({
          ...order,
          items,
          remaining: Math.max(0, order.debt_recorded_total || order.total || 0),
        });
      }
      const targetOrder =
        ordersWithItems.find((o) => Array.isArray(o.items) && o.items.length > 0) ||
        ordersWithItems[0];
      const due = targetOrder?.remaining ?? 0;
      setDebtModal({
        open: true,
        loading: false,
        customer,
        orders: ordersWithItems,
        order: targetOrder,
        items: targetOrder?.items || [],
        paymentMethod: defaultPaymentMethod,
        amount: due.toFixed(2),
        error: "",
      });
    } catch (err) {
      setDebtModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || t("Failed to load debt order"),
      }));
    }
  };

  const handleSelectDebtOrder = async (orderId) => {
    if (!orderId || debtModal.order?.id === orderId) return;
    const targetOrder = debtModal.orders.find((o) => o.id === orderId);
    if (!targetOrder) return;
    if (targetOrder.items && targetOrder.items.length) {
      setDebtModal((prev) => ({
        ...prev,
        order: targetOrder,
        items: targetOrder.items,
        amount: (targetOrder.remaining ?? Math.max(0, targetOrder.debt_recorded_total || targetOrder.total || 0)).toFixed(2),
        error: "",
      }));
      return;
    }
    setDebtModal((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));
    try {
      const items = await fetchDebtOrderItems(orderId);
      const due = Math.max(0, targetOrder.debt_recorded_total || targetOrder.total || 0);
      const updatedOrders = debtModal.orders.map((order) =>
        order.id === orderId ? { ...order, items, remaining: due } : order
      );
      setDebtModal((prev) => ({
        ...prev,
        loading: false,
        orders: updatedOrders,
        order: { ...targetOrder, items, remaining: due },
        items,
        amount: due.toFixed(2),
      }));
    } catch (err) {
      setDebtModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || t("Failed to load order items"),
      }));
    }
  };

  const handleConfirmDebtPayment = async () => {
    if (!debtModal.order || isDebtPaying) return;
    const amountDue = Math.max(
      0,
      Number(debtModal.order.debt_recorded_total || debtModal.order.total || 0)
    );
    if (amountDue <= 0) {
      setDebtModal((prev) => ({ ...prev, error: t("No unpaid debt remains for this order.") }));
      return;
    }
    const desiredAmount = Math.max(0, Number(debtModal.amount || 0));
    if (desiredAmount <= 0) {
      setDebtModal((prev) => ({ ...prev, error: t("Enter an amount to pay") }));
      return;
    }
    const amountToPay = Math.min(amountDue, desiredAmount);
    if (!debtModal.paymentMethod) {
      setDebtModal((prev) => ({ ...prev, error: t("Select a payment method") }));
      return;
    }
    try {
      setIsDebtPaying(true);
      const resolvedPaymentMethod =
        getPaymentMethodLabel(paymentMethods, debtModal.paymentMethod) || debtModal.paymentMethod;
      const response = await secureFetch(`/orders/${debtModal.order.id}/pay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: resolvedPaymentMethod,
          amount: amountToPay,
          total: debtModal.order.total,
        }),
      });
      if (response?.error) throw new Error(response.error);
      alert(t("Debt payment recorded successfully."));
      closeDebtModal();
      fetchCustomers();
    } catch (err) {
      setDebtModal((prev) => ({
        ...prev,
        error: err.message || t("Failed to record debt payment"),
      }));
    } finally {
      setIsDebtPaying(false);
    }
  };

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

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await secureFetch(`/customers${query}`);
      setCustomers(res);
      setStats((s) => ({
        ...s,
        total: res.length,
        repeat: res.filter((c) => c.visit_count && c.visit_count > 1).length,
        birthdays: res.filter((c) => isThisWeekBirthday(c.birthday)).length,
        top: [...res]
          .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
          .slice(0, 3),
      }));
    } catch (e) {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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
                          disabled={
                            (debtModal.open && debtModal.customer?.id === c.id && (debtModal.loading || isDebtPaying))
                          }
                          onClick={() => handleOpenDebtPayment(c)}
                        >
                          {t("Pay Debt")}
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

{debtModal.open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t("Pay Customer Debt")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {debtModal.customer?.name} · {debtModal.customer?.phone}
          </p>
        </div>
        <button
          className="text-slate-500 hover:text-slate-800 dark:text-slate-300"
          onClick={closeDebtModal}
          disabled={isDebtPaying}
        >
          ✕
        </button>
      </div>

      {debtModal.loading && !debtModal.order ? (
        <div className="py-10 text-center text-slate-500">{t("Loading order items...")}</div>
      ) : !debtModal.order ? (
        <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-200">
          {debtModal.error || t("No unpaid debt order found.")}
        </div>
      ) : (
        <>
          {debtModal.orders.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {debtModal.orders.map((order) => {
                const selected = debtModal.order?.id === order.id;
                const due = Math.max(0, Number(order.debt_recorded_total || order.total || 0)).toFixed(2);
                return (
                  <button
                    key={order.id}
                    className={`rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white text-slate-600 dark:bg-zinc-900 dark:border-zinc-700"
                    }`}
                    onClick={() => handleSelectDebtOrder(order.id)}
                    disabled={isDebtPaying || debtModal.loading}
                  >
                    #{order.id} • ₺{due}
                  </button>
                );
              })}
            </div>
          )}

          {debtModal.loading && (
            <div className="mb-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-zinc-800/60">
              {t("Refreshing order items...")}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/80 p-3 dark:bg-zinc-800/40 dark:border-zinc-700">
            {(!debtModal.order?.items || debtModal.order.items.length === 0) ? (
              <p className="text-sm text-slate-500">{t("No items found for this order.")}</p>
            ) : (
              debtModal.order.items.map((item, idx) => {
                const extras = Array.isArray(item.extras)
                  ? item.extras
                  : typeof item.extras === "string"
                  ? (() => {
                      try {
                        return JSON.parse(item.extras);
                      } catch {
                        return [];
                      }
                    })()
                  : [];
                return (
                  <div
                    key={item.id || item.unique_id || idx}
                    className="mb-3 rounded-2xl bg-white px-3 py-2 text-sm shadow-sm last:mb-0 dark:bg-zinc-900/70"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.display_name ||
                          item.name ||
                          item.order_item_name ||
                          item.product_name ||
                          item.external_product_name ||
                          t("Item")}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200">
                        ₺{(Number(item.price) * Number(item.quantity || 1)).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-300">
                      {t("Qty")}: {item.quantity || 1}
                    </div>
                    {extras.length > 0 && (
                      <ul className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-300">
                        {extras.map((ex, idx) => (
                          <li key={idx}>
                            ➕ {ex.name} ×{ex.quantity || 1} — ₺{Number(ex.price || 0).toFixed(2)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 dark:bg-zinc-800/60">
            <span className="text-sm font-semibold text-slate-500">{t("Total Due")}</span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              ₺{Math.max(0, Number(debtModal.order.remaining ?? debtModal.order.debt_recorded_total ?? debtModal.order.total ?? 0)).toFixed(2)}
            </span>
          </div>

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("Amount To Pay")}
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
            value={debtModal.amount}
            onChange={(e) =>
              setDebtModal((prev) => ({ ...prev, amount: e.target.value }))
            }
            disabled={isDebtPaying || debtModal.loading}
          />
        </label>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("Payment Method")}
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
              value={debtModal.paymentMethod}
              onChange={(e) =>
                setDebtModal((prev) => ({ ...prev, paymentMethod: e.target.value }))
              }
              disabled={isDebtPaying || debtModal.loading}
            >
              {paymentOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.label)}
                </option>
              ))}
            </select>
          </label>

          {debtModal.error && (
            <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-200">
              {debtModal.error}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-60"
            onClick={handleConfirmDebtPayment}
            disabled={isDebtPaying || debtModal.loading}
          >
            {isDebtPaying ? t("Processing...") : t("Confirm Payment")}
          </button>
            <button
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-slate-200"
              onClick={closeDebtModal}
              disabled={isDebtPaying}
            >
              {t("Cancel")}
            </button>
          </div>
        </>
      )}
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
