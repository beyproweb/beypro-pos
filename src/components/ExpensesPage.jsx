import React, { useEffect, useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";

const allowedMethods = ["Cash", "Credit Card", "Bank Transfer", "Not Paid"];



export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [form, setForm] = useState({
    type: "",
    amount: "",
    note: "",
    payment_method: "",
  });
  const [newType, setNewType] = useState("");
  const [range, setRange] = useState("monthly");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const { currentUser } = useAuth();
  const [visibleDetails, setVisibleDetails] = useState(null);
 const { t, i18n } = useTranslation();
  const fetchExpenses = async () => {
  try {
    const params = new URLSearchParams();

    if (range === "today") {
      const today = new Date().toISOString().slice(0, 10);
      params.set("from", today);
      params.set("to", today);
    } else if (range === "week") {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      params.set("from", start.toISOString().slice(0, 10));
      params.set("to", now.toISOString().slice(0, 10));
    } else if (range === "monthly") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      params.set("from", firstDay.toISOString().slice(0, 10));
      params.set("to", lastDay.toISOString().slice(0, 10));
    } else if (range === "custom" && customRange.from && customRange.to) {
      params.set("from", customRange.from);
      params.set("to", customRange.to);
    }

    const res = await fetch(`/api/expenses?${params.toString()}`);
    const data = await res.json();
    setExpenses(data);
  } catch (err) {
    console.error("❌ Fetch expenses failed", err);
  }
};

 const fetchExpenseTypes = async () => {
  try {
    const res = await fetch("/api/expenses/types");
    const data = await res.json();
    setExpenseTypes(data);
  } catch (err) {
    console.error("❌ Failed to fetch expense types", err);
  }
};
useEffect(() => {
  fetchExpenseTypes();
}, []);


useEffect(() => {
  fetchExpenses();
}, [range, customRange]);


  const handleSave = async () => {
  const selectedType = form.type || newType;

  if (!selectedType || isNaN(parseFloat(form.amount))) {
    toast.error("Please fill in expense type and amount");
    return;
  }

  const payload = {
    type: selectedType.trim(),
    amount: parseFloat(form.amount),
    note: form.note?.trim(),
    payment_method: form.payment_method,
    created_by: currentUser?.id


  };

  try {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success("✅ Expense saved");
      setForm({ type: "", amount: "", note: "", payment_method: "" });
      setNewType("");
      setShowModal(false);
      fetchExpenses();
    } else {
      toast.error("❌ Failed to save");
    }
  } catch (err) {
    console.error("❌ Save failed", err);
    toast.error("❌ Server error");
  }
};



  const getTodayTotal = (type) => {
    const today = new Date().toISOString().slice(0, 10);
    return expenses
      .filter((e) => e.type === type && e.created_at.startsWith(today))
      .reduce((acc, cur) => acc + parseFloat(cur.amount), 0)
      .toFixed(2);
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-white-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-white transition-colors">
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div className="flex gap-2 flex-wrap">
<button
  onClick={() => setRange("today")}
  className={`px-3 py-1 rounded ${range === "today" ? "bg-accent text-white" : "bg-white dark:bg-gray-800"}`}
>
  {t("Today")}
</button>
<button
  onClick={() => setRange("week")}
  className={`px-3 py-1 rounded ${range === "week" ? "bg-accent text-white" : "bg-white dark:bg-gray-800"}`}
>
  {t("Week")}
</button>
<button
  onClick={() => setRange("monthly")}
  className={`px-3 py-1 rounded ${range === "monthly" ? "bg-accent text-white" : "bg-white dark:bg-gray-800"}`}
>
  {t("Monthly")}
</button>

          <input type="date" value={customRange.from} onChange={(e) => setCustomRange({ ...customRange, from: e.target.value })} className="border p-1 rounded" />
          <input type="date" value={customRange.to} onChange={(e) => setCustomRange({ ...customRange, to: e.target.value })} className="border p-1 rounded" />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl shadow hover:brightness-110 transition-all"
        >
          <PlusCircle size={20} />
          {t("Add Expense")}
        </button>
      </div>

      {/* Expense Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {expenseTypes.map((type) => {
  const totalForType = expenses
    .filter((e) => e.type === type)
    .reduce((acc, cur) => acc + parseFloat(cur.amount), 0);

  const dueTotal = expenses
    .filter((e) => e.type === type && e.payment_method === "Not Paid")
    .reduce((acc, cur) => acc + parseFloat(cur.amount), 0);

  return (
    <div
      key={type}
      className="p-4 rounded-xl bg-white dark:bg-gray-800 shadow-md flex flex-col justify-between hover:shadow-lg transition min-h-[250px]"
    >
      <div>
        <h2 className="text-xl font-semibold mb-1">{type}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          ₺{totalForType.toFixed(2)} {range === "today" ? "today" : ""}
        </p>
        {dueTotal > 0 && (
          <p className="text-sm text-red-500 font-semibold mt-1">
            {t("Due")}: ₺{dueTotal.toFixed(2)}
          </p>
        )}
      </div>

      <div className="mt-4">
        <button
          className="w-full px-3 py-1 text-sm font-medium bg-accent text-white rounded shadow hover:brightness-110 transition"
          onClick={() =>
            setVisibleDetails(visibleDetails === type ? null : type)
          }
        >
          {visibleDetails === type ? t("Hide") : t("View Details")}
        </button>

        {visibleDetails === type && (
          <div className="mt-3 p-2 rounded bg-gray-100 dark:bg-gray-900 text-sm max-h-64 overflow-y-auto space-y-2">
            {expenses
              .filter((e) => e.type === type)
              .map((e) => (
                <div
                  key={e.id}
                  className="border-b border-gray-300 dark:border-gray-700 pb-1"
                >
                  <div className="flex justify-between">
                    <span className="font-medium">₺{e.amount}</span>
                    <span className="text-xs text-gray-500">
                      {e.payment_method}
                    </span>
                  </div>
                  {e.note && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      📝 {e.note}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
})}

      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-md shadow-lg relative">
            <button
              className="absolute top-2 right-2 text-gray-600 hover:text-black dark:text-gray-300"
              onClick={() => setShowModal(false)}
            >
              <X />
            </button>
            <h2 className="text-lg font-bold mb-4">➕ Add Expense</h2>

            <select
              className="w-full p-2 mb-3 border rounded dark:bg-gray-900 dark:text-white"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="">-- {t("-- Select Type --")} --</option>
              {expenseTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>

            <input
              className="w-full p-2 mb-2 border rounded dark:bg-gray-900 dark:text-white"
              placeholder={t("Or create new type")}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onBlur={() => {
                if (newType && !expenseTypes.includes(newType)) {
                  setExpenseTypes((prev) => [...prev, newType]);
                  setForm((f) => ({ ...f, type: newType }));
                  setNewType("");
                }
              }}
            />

            <input
              className="w-full p-2 mb-3 border rounded dark:bg-gray-900 dark:text-white"
              placeholder={t("Amount (₺)")}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />

            <input
              className="w-full p-2 mb-3 border rounded dark:bg-gray-900 dark:text-white"
              placeholder={t("Note (optional)")}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />

            <select
              className="w-full p-2 mb-4 border rounded dark:bg-gray-900 dark:text-white"
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="">-- {t("Payment Method")} --</option>
              {allowedMethods.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>

            <button
              onClick={handleSave}
              className="w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded hover:brightness-110 transition"
            >
              💾 {t("Save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
