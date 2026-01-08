import React, { useEffect, useRef, useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import secureFetch, { BASE_URL } from "../utils/secureFetch";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import { useCurrency } from "../context/CurrencyContext";

const allowedMethods = ["Cash", "Credit Card", "Bank Transfer", "Not Paid"];

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
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
  const { formatCurrency, config } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const didAutoOpenModalRef = useRef(false);
  const backendUrlRaw = BASE_URL.replace(/\/api\/?$/, "");
  const backendUrl =
    backendUrlRaw ||
    (import.meta.env.MODE === "development" ? "http://localhost:5000" : "");

  useEffect(() => {
    if (!showModal) {
      setReceiptFile(null);
    }
  }, [showModal]);

  const paymentMethodLabel = (method) => {
    if (method === "Cash") return t("Cash");
    if (method === "Credit Card") return t("Credit Card");
    if (method === "Bank Transfer") return t("Bank Transfer");
    if (method === "Not Paid") return t("Not Paid");
    return String(method || "");
  };

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      const status = await secureFetch("/reports/cash-register-status");
      if (!isActive) return;

      const registerStatus = status?.status;
      const needsAttention = registerStatus === "closed" || registerStatus === "unopened";

      if (needsAttention) {
        navigate("/tableoverview?tab=tables", {
          replace: true,
          state: { openRegisterModal: true },
        });
        return;
      }

      if (didAutoOpenModalRef.current) return;
      if (location.state?.openExpenseModal !== true) return;
      didAutoOpenModalRef.current = true;
      setShowModal(true);
      navigate(location.pathname + location.search, { replace: true, state: {} });
    };

    run().catch((err) => {
      console.error("❌ Failed to check register status for expenses page:", err);
    });

    return () => {
      isActive = false;
    };
  }, [location.pathname, location.search, location.state, navigate]);

  // ✅ Fetch expense types
  const fetchExpenseTypes = async () => {
    try {
      const data = await secureFetch("/expenses/types");
      setExpenseTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Failed to fetch expense types", err);
      setExpenseTypes([]);
    }
  };

  // ✅ Fetch expenses (tenant-safe)
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

      const data = await secureFetch(`/expenses?${params.toString()}`);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Fetch expenses failed", err);
      setExpenses([]);
    }
  };

  useEffect(() => {
    fetchExpenseTypes();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [range, customRange]);

  // ✅ Save expense securely
  const handleSave = async () => {
    const selectedType = form.type || newType;
    if (!selectedType || isNaN(parseFloat(form.amount))) {
      toast.error(t("Please fill in expense type and amount"));
      return;
    }

    const payload = {
      type: selectedType.trim(),
      amount: parseFloat(form.amount),
      note: form.note?.trim(),
      payment_method: form.payment_method,
      created_by: currentUser?.id,
    };

    try {
      if (receiptFile) {
        const formData = new FormData();
        formData.append("type", payload.type);
        formData.append("amount", String(payload.amount));
        if (payload.note) formData.append("note", payload.note);
        if (payload.payment_method) formData.append("payment_method", payload.payment_method);
        if (payload.created_by) formData.append("created_by", String(payload.created_by));
        formData.append("receipt", receiptFile);

        await secureFetch("/expenses", {
          method: "POST",
          body: formData,
        });
      } else {
        await secureFetch("/expenses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      toast.success(t("✅ Expense saved"));
      setForm({ type: "", amount: "", note: "", payment_method: "" });
      setNewType("");
      setShowModal(false);
      setReceiptFile(null);
      fetchExpenses();

      if (isCashLabel(payload.payment_method)) {
        await logCashRegisterEvent({
          type: "expense",
          amount: payload.amount,
          note: payload.type || payload.note || "Expense",
        });
        await openCashDrawer();
      }
    } catch (err) {
      console.error("❌ Save failed", err);
      toast.error(t("❌ Failed to save"));
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-white-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 text-gray-900 dark:text-white transition-colors">
      {receiptPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur"
          onClick={() => setReceiptPreview(null)}
          style={{ cursor: "zoom-out" }}
        >
          <img
            src={receiptPreview.startsWith("http") ? receiptPreview : backendUrl + receiptPreview}
            alt={t("Receipt preview")}
            className="max-h-[90vh] max-w-[95vw] rounded-3xl border-8 border-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-3">
        <div className="flex gap-2 flex-wrap">
          {["today", "week", "monthly"].map((period) => (
            <button
              key={period}
              onClick={() => setRange(period)}
              className={`px-3 py-1 rounded ${
                range === period
                  ? "bg-accent text-white"
                  : "bg-white dark:bg-gray-800"
              }`}
            >
              {t(period.charAt(0).toUpperCase() + period.slice(1))}
            </button>
          ))}
          <input
            type="date"
            value={customRange.from}
            onChange={(e) =>
              setCustomRange({ ...customRange, from: e.target.value })
            }
            className="border p-1 rounded"
          />
          <input
            type="date"
            value={customRange.to}
            onChange={(e) =>
              setCustomRange({ ...customRange, to: e.target.value })
            }
            className="border p-1 rounded"
          />
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
                  {formatCurrency(totalForType)}
                </p>
                {dueTotal > 0 && (
                  <p className="text-sm text-red-500 font-semibold mt-1">
                    {t("Due")}: {formatCurrency(dueTotal)}
                  </p>
                )}
              </div>

              <div className="mt-4">
                <button
                  className="w-full px-3 py-1 text-sm font-medium bg-accent text-white rounded shadow hover:brightness-110 transition"
                  onClick={() =>
                    setVisibleDetails(
                      visibleDetails === type ? null : type
                    )
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
                            <span className="font-medium">
                              {formatCurrency(Number(e.amount || 0))}
                            </span>
                            <span className="text-xs text-gray-500">
                              {paymentMethodLabel(e.payment_method)}
                            </span>
                          </div>
                          {e.note && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              📝 {e.note}
                            </div>
                          )}
                          {e.receipt_url && (
                            <button
                              type="button"
                              onClick={() => setReceiptPreview(e.receipt_url)}
                              className="text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
                            >
                              {t("View receipt")}
                            </button>
                          )}
                          <div className="text-xs text-gray-400">
                            {new Date(e.created_at).toLocaleString(i18n.language)}
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
            <h2 className="text-lg font-bold mb-4">➕ {t("Add Expense")}</h2>

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
              placeholder={t("Amount")}
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
              onChange={(e) =>
                setForm({ ...form, payment_method: e.target.value })
              }
            >
              <option value="">-- {t("Payment Method")} --</option>
              {allowedMethods.map((opt) => (
                <option key={opt} value={opt}>
                  {paymentMethodLabel(opt)}
                </option>
              ))}
            </select>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("Upload Receipt")}
              </label>
              <input
                type="file"
                accept="image/*"
                className="w-full text-sm"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              {receiptFile && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <span className="truncate">{receiptFile.name}</span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => setReceiptFile(null)}
                  >
                    {t("Remove")}
                  </button>
                </div>
              )}
            </div>

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
