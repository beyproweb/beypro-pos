import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PlusCircle, X } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import secureFetch, { BASE_URL } from "../utils/secureFetch";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../utils/cashDrawer";
import { useCurrency } from "../context/CurrencyContext";

const allowedMethods = ["Cash", "Credit Card", "Bank Transfer", "Not Paid"];

const normalizeExpensePaymentMethod = (method) => {
  const raw = String(method || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "cash") return "Cash";
  if (lower === "card" || lower === "credit card" || lower === "credit") return "Credit Card";
  if (lower === "bank" || lower === "bank transfer" || lower === "transfer" || lower === "iban") {
    return "Bank Transfer";
  }
  if (lower === "due" || lower === "not paid" || lower === "unpaid") return "Not Paid";
  if (lower === "papara") return "Bank Transfer";
  return raw;
};

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function ComparisonBadge({ cmp, formatCurrency, t }) {
  if (!cmp || cmp.status === "none") return null;

  if (cmp.status === "first") {
    return (
      <div className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 bg-indigo-50 text-indigo-700 ring-indigo-200">
        {t("First payment")}
      </div>
    );
  }

  if (cmp.status === "same") {
    return (
      <div className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 bg-slate-50 text-slate-700 ring-slate-200">
        — {t("No change")}
      </div>
    );
  }

  const isUp = cmp.status === "up";
  const arrow = isUp ? "▲" : "▼";
  const diffAbs = Math.abs(Number(cmp.diff || 0));
  const pctAbs =
    cmp.pct === null || cmp.pct === undefined ? null : Math.abs(Number(cmp.pct || 0));

  return (
    <div
      className={classNames(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        isUp
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
      )}
      title={t("Change vs previous payment")}
    >
      {arrow} {isUp ? "+" : "-"}
      {formatCurrency(diffAbs)}
      {pctAbs != null ? (
        <span className="ml-1 font-medium opacity-80">
          ({isUp ? "+" : "-"}
          {pctAbs.toFixed(1)}%)
        </span>
      ) : null}
    </div>
  );
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierDueTotal, setSupplierDueTotal] = useState(0);
  const [staffDueTotal, setStaffDueTotal] = useState(0);
  const [dueLoading, setDueLoading] = useState(false);
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
  const { formatCurrency } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const didAutoOpenModalRef = useRef(false);

  const backendUrlRaw = BASE_URL.replace(/\/api\/?$/, "");
  const backendUrl =
    backendUrlRaw || (import.meta.env.MODE === "development" ? "http://localhost:5000" : "");

  const effectiveRange = useMemo(() => {
    let from = "";
    let to = "";

    if (range === "today") {
      const today = new Date().toISOString().slice(0, 10);
      from = today;
      to = today;
    } else if (range === "week") {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      from = start.toISOString().slice(0, 10);
      to = now.toISOString().slice(0, 10);
    } else if (range === "monthly") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      from = firstDay.toISOString().slice(0, 10);
      to = lastDay.toISOString().slice(0, 10);
    } else if (range === "custom" && customRange.from && customRange.to) {
      from = customRange.from;
      to = customRange.to;
    }

    return { from, to };
  }, [range, customRange.from, customRange.to]);

  useEffect(() => {
    if (!showModal) setReceiptFile(null);
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

  const fetchExpenseTypes = async () => {
    try {
      const data = await secureFetch("/expenses/types");
      setExpenseTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Failed to fetch expense types", err);
      setExpenseTypes([]);
    }
  };

  const fetchExpenses = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (effectiveRange.from) params.set("from", effectiveRange.from);
      if (effectiveRange.to) params.set("to", effectiveRange.to);

      const qs = params.toString();
      const expensesUrl = qs ? `/expenses?${qs}` : "/expenses";
      const staffPaymentsUrl = qs ? `/reports/staff-payments?${qs}` : "/reports/staff-payments";
      const supplierPaymentsUrl = qs
        ? `/reports/supplier-payments?${qs}`
        : "/reports/supplier-payments";

      const [manualRes, staffRes, supplierRes] = await Promise.allSettled([
        secureFetch(expensesUrl),
        secureFetch(staffPaymentsUrl),
        secureFetch(supplierPaymentsUrl),
      ]);

      const manualExpenses =
        manualRes.status === "fulfilled" && Array.isArray(manualRes.value) ? manualRes.value : [];

      const staffPayments =
        staffRes.status === "fulfilled" && Array.isArray(staffRes.value) ? staffRes.value : [];

      const supplierPayments =
        supplierRes.status === "fulfilled" && Array.isArray(supplierRes.value)
          ? supplierRes.value
          : [];

      const staffPaymentExpenses = staffPayments.map((row, index) => {
        const rawDate = row?.payment_date || row?.date || row?.created_at || row?.createdAt || null;
        const createdAt = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
        const note =
          String(row?.note || "").trim() ||
          String(row?.staff_name || row?.staffName || row?.name || "").trim() ||
          "Staff payroll";
        const id = row?.id != null ? `staffpay-${row.id}` : `staffpay-${createdAt}-${index}`;

        return {
          id,
          type: "Staff Payments",
          amount: parseFloat(row?.amount || 0),
          note,
          payment_method: normalizeExpensePaymentMethod(row?.payment_method),
          created_at: createdAt,
        };
      });

      const supplierPaymentExpenses = supplierPayments.map((row, index) => {
        const rawDate = row?.payment_date || row?.date || row?.created_at || row?.createdAt || null;
        const createdAt = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
        const note =
          String(row?.note || "").trim() ||
          String(row?.supplier_name || row?.supplierName || row?.name || "").trim() ||
          "Supplier payment";
        const id = row?.id != null ? `supplierpay-${row.id}` : `supplierpay-${createdAt}-${index}`;

        return {
          id,
          type: "Supplier Payments",
          amount: parseFloat(row?.amount || 0),
          note,
          payment_method: normalizeExpensePaymentMethod(row?.payment_method),
          created_at: createdAt,
        };
      });

      setExpenses([...manualExpenses, ...supplierPaymentExpenses, ...staffPaymentExpenses]);
    } catch (err) {
      console.error("❌ Fetch expenses failed", err);
      setExpenses([]);
    }
  }, [effectiveRange.from, effectiveRange.to]);

  const filteredExpenses = useMemo(() => {
    const list = Array.isArray(expenses) ? expenses : [];
    const q = String(searchQuery || "").trim().toLowerCase();
    if (!q) return list;

    return list.filter((e) => {
      const type = String(e?.type || "").toLowerCase();
      const note = String(e?.note || "").toLowerCase();
      const method = String(e?.payment_method || "").toLowerCase();
      const amount = String(e?.amount ?? "").toLowerCase();
      const createdAt = String(e?.created_at || "").toLowerCase();
      const createdDay = createdAt ? createdAt.slice(0, 10) : "";
      return (
        type.includes(q) ||
        note.includes(q) ||
        method.includes(q) ||
        amount.includes(q) ||
        createdAt.includes(q) ||
        createdDay.includes(q)
      );
    });
  }, [expenses, searchQuery]);

  const displayExpenseTypes = useMemo(() => {
    const q = String(searchQuery || "").trim();
    const filtered = Array.isArray(filteredExpenses) ? filteredExpenses : [];

    if (q) {
      const types = new Set();
      filtered.forEach((e) => {
        if (e?.type) types.add(e.type);
      });
      return Array.from(types);
    }

    const types = new Set(Array.isArray(expenseTypes) ? expenseTypes : []);
    (Array.isArray(expenses) ? expenses : []).forEach((e) => {
      if (e?.type) types.add(e.type);
    });
    return Array.from(types);
  }, [expenseTypes, expenses, filteredExpenses, searchQuery]);

  const comparisonByType = useMemo(() => {
    const map = new Map();
    const byType = {};

    (Array.isArray(filteredExpenses) ? filteredExpenses : []).forEach((e) => {
      if (!e?.type) return;
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e);
    });

    Object.entries(byType).forEach(([type, entries]) => {
      const sorted = entries
        .slice()
        .sort(
          (a, b) =>
            new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
        );

      if (sorted.length === 1) {
        map.set(type, { status: "first" });
        return;
      }

      if (sorted.length < 2) return;

      const latest = sorted[0];
      const prev = sorted[1];
      const latestAmt = parseFloat(latest?.amount || 0);
      const prevAmt = parseFloat(prev?.amount || 0);

      if (!Number.isFinite(latestAmt) || !Number.isFinite(prevAmt)) {
        map.set(type, { status: "none" });
        return;
      }

      const diff = latestAmt - prevAmt;
      if (Math.abs(diff) < 1e-6) {
        map.set(type, { status: "same" });
        return;
      }

      const pct = prevAmt === 0 ? null : (diff / prevAmt) * 100;
      map.set(type, { status: diff > 0 ? "up" : "down", diff, pct });
    });

    return map;
  }, [filteredExpenses]);

  const latestInfoByType = useMemo(() => {
    const map = new Map();
    const grouped = {};

    (Array.isArray(filteredExpenses) ? filteredExpenses : []).forEach((e) => {
      if (!e?.type) return;
      if (!grouped[e.type]) grouped[e.type] = [];
      grouped[e.type].push(e);
    });

    Object.entries(grouped).forEach(([type, entries]) => {
      const sorted = entries
        .slice()
        .sort(
          (a, b) =>
            new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
        );
      const latest = sorted[0] || null;
      const prev = sorted[1] || null;
      map.set(type, {
        latestAmount: latest ? parseFloat(latest.amount || 0) : null,
        latestDate: latest?.created_at || null,
        prevAmount: prev ? parseFloat(prev.amount || 0) : null,
        prevDate: prev?.created_at || null,
      });
    });

    return map;
  }, [filteredExpenses]);

  const paidTotal = useMemo(() => {
    return (Array.isArray(expenses) ? expenses : [])
      .filter((e) => normalizeExpensePaymentMethod(e?.payment_method) !== "Not Paid")
      .reduce((sum, e) => sum + parseFloat(e?.amount || 0), 0);
  }, [expenses]);

  const manualDueTotal = useMemo(() => {
    return (Array.isArray(expenses) ? expenses : [])
      .filter((e) => {
        const id = String(e?.id || "");
        const isDerivedPayment = id.startsWith("staffpay-") || id.startsWith("supplierpay-");
        if (isDerivedPayment) return false;
        return normalizeExpensePaymentMethod(e?.payment_method) === "Not Paid";
      })
      .reduce((sum, e) => sum + parseFloat(e?.amount || 0), 0);
  }, [expenses]);

  const dueTotal = manualDueTotal + supplierDueTotal + staffDueTotal;

  useEffect(() => {
    fetchExpenseTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customRange]);

  const fetchAllDues = useCallback(async () => {
    if (!effectiveRange.from || !effectiveRange.to) return;

    setDueLoading(true);
    try {
      const [suppliersRes, staffRes] = await Promise.allSettled([
        secureFetch("/suppliers"),
        secureFetch("/staff"),
      ]);

      const suppliers =
        suppliersRes.status === "fulfilled" && Array.isArray(suppliersRes.value)
          ? suppliersRes.value
          : [];
      const supplierDue = suppliers.reduce((sum, s) => sum + (Number(s?.total_due) || 0), 0);

      const staffList =
        staffRes.status === "fulfilled" && Array.isArray(staffRes.value) ? staffRes.value : [];
      const staffIds = staffList
        .map((s) => s?.id)
        .filter((id) => id !== null && id !== undefined && id !== "");

      const payrollResults = await Promise.allSettled(
        staffIds.map((id) =>
          secureFetch(
            `/staff/${encodeURIComponent(id)}/payroll?startDate=${encodeURIComponent(
              effectiveRange.from
            )}&endDate=${encodeURIComponent(effectiveRange.to)}`
          )
        )
      );

      const staffDue = payrollResults.reduce((sum, r) => {
        if (r.status !== "fulfilled") return sum;
        const due = Number(r.value?.payroll?.salaryDue ?? 0);
        return sum + (Number.isFinite(due) ? due : 0);
      }, 0);

      setSupplierDueTotal(supplierDue);
      setStaffDueTotal(staffDue);
    } catch (err) {
      console.error("❌ Fetch dues failed", err);
      setSupplierDueTotal(0);
      setStaffDueTotal(0);
    } finally {
      setDueLoading(false);
    }
  }, [effectiveRange.from, effectiveRange.to]);

  useEffect(() => {
    fetchAllDues();
  }, [fetchAllDues]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      fetchExpenses();
      fetchAllDues();
    };
    window.addEventListener("expenses:refresh", handler);
    window.addEventListener("reports:refresh", handler);
    return () => {
      window.removeEventListener("expenses:refresh", handler);
      window.removeEventListener("reports:refresh", handler);
    };
  }, [fetchExpenses, fetchAllDues]);

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

        await secureFetch("/expenses", { method: "POST", body: formData });
      } else {
        await secureFetch("/expenses", { method: "POST", body: JSON.stringify(payload) });
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

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("reports:refresh"));
        window.dispatchEvent(new Event("expenses:refresh"));
      }
    } catch (err) {
      console.error("❌ Save failed", err);
      toast.error(t("❌ Failed to save"));
    }
  };

  const dateLabel = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(i18n.language, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Receipt fullscreen preview */}
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

      <div className="px-6 py-6">
          {/* Top bar (filters/search/add) */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {["today", "week", "monthly"].map((period) => (
                <button
                  key={period}
                  onClick={() => setRange(period)}
                  className={classNames(
                    "px-3 py-1.5 rounded-lg text-sm font-semibold border transition",
                    range === period
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {t(period.charAt(0).toUpperCase() + period.slice(1))}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setRange("custom")}
                className={classNames(
                  "px-3 py-1.5 rounded-lg text-sm font-semibold border transition",
                  range === "custom"
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                )}
              >
                {t("Custom")}
              </button>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customRange.from}
                  onChange={(e) => {
                    setRange("custom");
                    setCustomRange({ ...customRange, from: e.target.value });
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                />
                <input
                  type="date"
                  value={customRange.to}
                  onChange={(e) => {
                    setRange("custom");
                    setCustomRange({ ...customRange, to: e.target.value });
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-end">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("Search expenses...")}
                  className="h-10 w-[280px] max-w-full rounded-xl border border-slate-200 bg-white px-4 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="h-10 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <PlusCircle size={18} />
                {t("Add Expense")}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-500">{t("Total Paid")}</div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight text-emerald-600">
                {formatCurrency(paidTotal)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-500">{t("Total Due")}</div>
              <div className="mt-1 text-2xl font-extrabold tracking-tight text-red-600">
                {dueLoading ? t("Loading...") : formatCurrency(dueTotal)}
              </div>

              <div className="mt-2 text-xs text-slate-500 space-y-1">
                <div className="flex items-center justify-between">
                  <span>{t("Suppliers")}</span>
                  <span className="font-semibold text-slate-700">
                    {dueLoading ? t("Loading...") : formatCurrency(supplierDueTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("Staff Payroll")}</span>
                  <span className="font-semibold text-slate-700">
                    {dueLoading ? t("Loading...") : formatCurrency(staffDueTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t("Other")}</span>
                  <span className="font-semibold text-slate-700">{formatCurrency(manualDueTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expense cards (match the mock image style) */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {displayExpenseTypes.map((type) => {
              const rows = filteredExpenses.filter((e) => e.type === type);
              const totalForType = rows.reduce((acc, cur) => acc + parseFloat(cur.amount), 0);
              const dueForType = rows
                .filter((e) => normalizeExpensePaymentMethod(e.payment_method) === "Not Paid")
                .reduce((acc, cur) => acc + parseFloat(cur.amount), 0);

              const cmp = comparisonByType.get(type);
              const info = latestInfoByType.get(type);

              return (
                <div
                  key={type}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-lg font-extrabold tracking-tight text-slate-900">
                          {type}
                        </h3>
                        {dueForType > 0 ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                            {t("Due")}: {formatCurrency(dueForType)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {t("Latest paid")} • {info?.latestDate ? dateLabel(info.latestDate) : "—"}
                      </div>
                    </div>

                    <ComparisonBadge cmp={cmp} formatCurrency={formatCurrency} t={t} />
                  </div>

                  <div className="mt-5 text-center">
                    <div className="text-4xl font-extrabold tracking-tight text-slate-900">
                      {formatCurrency(totalForType)}
                    </div>

                    {/* View details button – styled like the image */}
                    <button
                      className="mt-4 w-full rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                      onClick={() => setVisibleDetails(visibleDetails === type ? null : type)}
                    >
                      {visibleDetails === type ? t("Hide") : t("View Details")}
                    </button>
                  </div>

                  {visibleDetails === type && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm max-h-64 overflow-y-auto space-y-3">
                      {rows.map((e) => (
                        <div key={e.id} className="border-b border-slate-200/70 pb-3 last:border-b-0 last:pb-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-semibold text-slate-900">
                              {formatCurrency(Number(e.amount || 0))}
                            </div>
                            <div className="text-xs font-semibold text-slate-600">
                              {paymentMethodLabel(e.payment_method)}
                            </div>
                          </div>

                          {e.note ? (
                            <div className="mt-1 text-xs text-slate-600">📝 {e.note}</div>
                          ) : null}

                          <div className="mt-1 text-xs text-slate-500">
                            {new Date(e.created_at).toLocaleString(i18n.language)}
                          </div>

                          {e.receipt_url ? (
                            <button
                              type="button"
                              onClick={() => setReceiptPreview(e.receipt_url)}
                              className="mt-2 inline-flex text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                            >
                              {t("View receipt")}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t("Prev")}</span>
                      <span className="font-semibold text-slate-800">
                        {info && Number.isFinite(info?.prevAmount) ? formatCurrency(info.prevAmount) : "—"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{t("Last paid")}</span>
                      <span className="font-semibold text-slate-800">
                        {info?.latestDate ? dateLabel(info.latestDate) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      {/* Modal (kept, restyled to match) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-xl relative border border-slate-200">
            <button
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-900"
              onClick={() => setShowModal(false)}
            >
              <X />
            </button>

            <h2 className="text-lg font-extrabold mb-4">➕ {t("Add Expense")}</h2>

            <select
              className="w-full h-10 px-3 mb-3 rounded-xl border border-slate-200 bg-white text-sm"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="">-- {t("-- Select Type --")} --</option>
              {expenseTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>

            <input
              className="w-full h-10 px-3 mb-2 rounded-xl border border-slate-200 bg-white text-sm"
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
              className="w-full h-10 px-3 mb-3 rounded-xl border border-slate-200 bg-white text-sm"
              placeholder={t("Amount")}
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />

            <input
              className="w-full h-10 px-3 mb-3 rounded-xl border border-slate-200 bg-white text-sm"
              placeholder={t("Note (optional)")}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />

            <select
              className="w-full h-10 px-3 mb-4 rounded-xl border border-slate-200 bg-white text-sm"
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="">-- {t("Payment Method")} --</option>
              {allowedMethods.map((opt) => (
                <option key={opt} value={opt}>
                  {paymentMethodLabel(opt)}
                </option>
              ))}
            </select>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t("Upload Receipt")}
              </label>
              <input
                type="file"
                accept="image/*"
                className="w-full text-sm"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
              {receiptFile && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span className="truncate">{receiptFile.name}</span>
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700 font-semibold"
                    onClick={() => setReceiptFile(null)}
                  >
                    {t("Remove")}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              className="w-full h-10 rounded-xl bg-indigo-600 text-white font-extrabold shadow-sm hover:bg-indigo-700 transition"
            >
              💾 {t("Save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
