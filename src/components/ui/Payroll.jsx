// Payroll.jsx - Tenant-safe version using secureFetch (2025-10-08)
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import { Toaster, toast } from "react-hot-toast";
import { Plus, Save, Download, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";
import { openCashDrawer, logCashRegisterEvent, isCashLabel } from "../../utils/cashDrawer";
import { useCurrency } from "../../context/CurrencyContext";
const dateStr = (d) => new Date(d).toLocaleDateString("tr-TR");

const formatMoney = (formatCurrencyFn, value) => {
  if (typeof formatCurrencyFn !== "function") return String(value ?? "");
  if (value === null || value === undefined) return formatCurrencyFn(0);
  if (typeof value === "number") return formatCurrencyFn(Number.isFinite(value) ? value : 0);
  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    return formatCurrencyFn(Number.isFinite(parsed) ? parsed : 0);
  }
  const parsed = Number(value);
  return formatCurrencyFn(Number.isFinite(parsed) ? parsed : 0);
};

function calcDueHistory(totalSalaryDue, payments = []) {
  const seed =
    Number.isFinite(Number(totalSalaryDue))
      ? Number(totalSalaryDue)
      : payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  let due = seed;
  const out = [];
  payments
    .slice()
    .reverse()
    .forEach((p) => {
      const amount = Number(p.amount || 0);
      out.push({ ...p, amount, dueAfter: due });
      due -= amount;
    });
  return out.reverse();
}

const formatMinutes = (mins) => {
  const numeric = Number(mins);
  if (!Number.isFinite(numeric) || numeric === 0) return "0min";
  const sign = numeric < 0 ? "-" : "";
  const abs = Math.abs(Math.round(numeric));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  if (hours > 0) {
    return `${sign}${hours}h ${minutes}min`;
  }
  return `${sign}${minutes}min`;
};

const toFiniteNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const replaced = normalized.replace(",", ".");
    const parsed = Number(replaced);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDurationTextToMinutes = (input) => {
  if (typeof input !== "string") return 0;
  const text = input.trim();
  if (!text) return 0;

  const colonMatch = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colonMatch) {
    const hours = Number.parseInt(colonMatch[1], 10);
    const minutes = Number.parseInt(colonMatch[2], 10);
    const seconds = colonMatch[3] ? Number.parseInt(colonMatch[3], 10) : 0;
    if ([hours, minutes, seconds].every((n) => Number.isFinite(n))) {
      return hours * 60 + minutes + Math.round(seconds / 60);
    }
  }

  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  const minuteMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m/i);
  let minutes = 0;

  if (hourMatch) {
    const value = parseFloat(hourMatch[1].replace(",", "."));
    if (Number.isFinite(value)) minutes += value * 60;
  }
  if (minuteMatch) {
    const value = parseFloat(minuteMatch[1].replace(",", "."));
    if (Number.isFinite(value)) minutes += value;
  }

  if (!hourMatch && !minuteMatch) {
    const numeric = toFiniteNumber(text);
    if (numeric !== null) {
      minutes += numeric > 24 ? numeric : numeric * 60;
    }
  }

  return Math.round(minutes);
};

const computeSessionMinutes = (session) => {
  if (!session || typeof session !== "object") return 0;

  const minuteFields = [
    "durationMinutes",
    "duration_minutes",
    "minutes",
    "totalMinutes",
    "total_minutes",
    "workedMinutes",
    "worked_minutes",
  ];

  for (const field of minuteFields) {
    if (field in session) {
      const value = toFiniteNumber(session[field]);
      if (value !== null && value > 0) return value;
    }
  }

  const hourFields = ["durationHours", "hours", "workedHours"];
  for (const field of hourFields) {
    if (field in session) {
      const value = toFiniteNumber(session[field]);
      if (value !== null && value > 0) return value * 60;
    }
  }

  const textFields = ["duration", "totalTime", "workedTime"];
  for (const field of textFields) {
    if (field in session && typeof session[field] === "string") {
      const minutes = parseDurationTextToMinutes(session[field]);
      if (minutes > 0) return minutes;
    }
  }

  const start =
    session.check_in ||
    session.checkIn ||
    session.start_time ||
    session.start ||
    session.clock_in;
  const end =
    session.check_out ||
    session.checkOut ||
    session.end_time ||
    session.end ||
    session.clock_out;

  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate - startDate;
    if (Number.isFinite(diffMs) && diffMs > 0) {
      return Math.round(diffMs / 60000);
    }
  }

  return 0;
};

const computeEntryMinutes = (entry) => {
  if (!entry || typeof entry !== "object") return 0;

  const minuteFields = [
    "totalMinutes",
    "total_minutes",
    "totalTimeMinutes",
    "total_time_minutes",
    "workedMinutes",
    "worked_minutes",
    "minutes",
  ];

  for (const field of minuteFields) {
    if (field in entry) {
      const value = toFiniteNumber(entry[field]);
      if (value !== null && value > 0) return value;
    }
  }

  const hourFields = ["totalHours", "workedHours"];
  for (const field of hourFields) {
    if (field in entry) {
      const value = toFiniteNumber(entry[field]);
      if (value !== null && value > 0) return value * 60;
    }
  }

  if (typeof entry.totalTime === "string") {
    const minutes = parseDurationTextToMinutes(entry.totalTime);
    if (minutes > 0) return minutes;
  }

  if (Array.isArray(entry.sessions)) {
    const minutes = entry.sessions.reduce(
      (sum, session) => sum + computeSessionMinutes(session),
      0
    );
    if (minutes > 0) return minutes;
  }

  return 0;
};

const ClearHistoryToast = ({
  toastInstance,
  defaultStart,
  defaultEnd,
  onConfirm,
  onCancel,
}) => {
  const { t: translate } = useTranslation();
  const [start, setStart] = useState(defaultStart || "");
  const [end, setEnd] = useState(defaultEnd || "");
  const [includeDownload, setIncludeDownload] = useState(true);
  const visible = toastInstance?.visible;

  return (
    <div
      className={`max-w-md w-full bg-white border border-blue-100 rounded-2xl shadow-lg p-5 text-base text-blue-900 transition-all duration-200 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      }`}
    >
      <div className="font-semibold text-lg text-blue-800 dark:text-slate-50">
        {translate("Clear payment history?")}
      </div>
      <p className="text-sm text-blue-700 dark:text-slate-200 mt-1">
        {translate(
          "Choose a date range and optionally download the history before clearing."
        )}
      </p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-slate-300 gap-1">
          {translate("From")}
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
          />
        </label>
        <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-slate-300 gap-1">
          {translate("To")}
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 mt-4 text-sm text-blue-800 dark:text-slate-200">
        <input
          type="checkbox"
          checked={includeDownload}
          onChange={(e) => setIncludeDownload(e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        {translate("Download CSV before clearing")}
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 transition dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {translate("Cancel")}
        </button>
        <button
          onClick={() =>
            onConfirm({
              startDate: start,
              endDate: end,
              download: includeDownload,
            })
          }
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          {translate("Confirm")}
        </button>
      </div>
    </div>
  );
};

const DEFAULT_AVATAR =
  "https://www.pngkey.com/png/full/115-1150152_default-profile-picture-avatar-png-green.png";

const getAvatar = (url) => {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith("http://localhost") || url.startsWith("/uploads/"))
    return DEFAULT_AVATAR;
  if (url.startsWith("http")) return url;
  return DEFAULT_AVATAR;
};

const StaffCard = ({
  staff,
  staffHistory,
  paymentHistory,
  onExport,
  onClear,
}) => {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const currency = (value) => formatMoney(formatCurrency, value);
  if (!staff) {
    return (
      <div className="w-full rounded-2xl border border-blue-100 bg-white/80 p-6 text-center text-blue-700 shadow dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
        {t("Select Staff")}
      </div>
    );
  }
  const history = staffHistory || {};
  const breakdown = Array.isArray(history.weeklyCheck)
    ? history.weeklyCheck
    : [];
  const paymentRows = calcDueHistory(
    history.totalSalaryDue,
    paymentHistory
  );
  console.log("📊 StaffCard payment rows:", paymentRows, paymentHistory);
  const hasPayments = Array.isArray(paymentRows) && paymentRows.length > 0;
  const autoPaymentInfo = history.autoPayment || null;
  const hasAutoPayment =
    !!autoPaymentInfo &&
    (autoPaymentInfo.active ||
      autoPaymentInfo.repeat_type ||
      Number(autoPaymentInfo.amount) > 0);
  const repeatLabels = {
    daily: t("Daily"),
    weekly: t("Weekly"),
    monthly: t("Monthly"),
    none: t("None"),
  };
  const repeatLabel = autoPaymentInfo?.repeat_type
    ? repeatLabels[autoPaymentInfo.repeat_type] ||
      autoPaymentInfo.repeat_type
    : repeatLabels.none;
  const todayIso = new Date().toISOString().split("T")[0];
  const todayEntry = breakdown.find((entry) => entry?.date === todayIso);
  const latencyStats = history.latency || {};
  const absenceMinutes = latencyStats.absentMinutes ?? 0;
  const absentDays = breakdown.filter((entry) =>
    Array.isArray(entry?.latency) && entry.latency.includes("Absent")
  ).length;
  const weeklyScheduledHours = Number.isFinite(Number(history.weeklyHours))
    ? `${Number(history.weeklyHours).toFixed(1)}h`
    : t("No data");
  const totalCheckins = breakdown.reduce(
    (sum, entry) => sum + (Array.isArray(entry?.sessions) ? entry.sessions.length : 0),
    0
  );
  const weeklyActualMinutes = breakdown.reduce(
    (sum, entry) => sum + computeEntryMinutes(entry),
    0
  );
  const weeklyCheckinsLabel =
    weeklyActualMinutes > 0
      ? `${formatMinutes(weeklyActualMinutes)}${
          totalCheckins > 0 ? ` (${totalCheckins}×)` : ""
        }`
      : totalCheckins > 0
      ? `${formatMinutes(weeklyActualMinutes)} (${totalCheckins}×)`
      : t("No data");
  const lateCheckinMinutes = latencyStats.checkinLateMinutes ?? 0;
  const earlyCheckoutMinutes =
    history.earlyCheckoutMinutes ?? latencyStats.earlyCheckout ?? 0;
  const rawDifference = history.timeDifferenceMinutes ?? 0;
  const overtimeMinutes = rawDifference > 0 ? rawDifference : 0;
  const overtimeLabel =
    overtimeMinutes > 0 ? formatMinutes(overtimeMinutes) : t("None");
  const overtimeHelper =
    rawDifference < 0
      ? t("Undertime: {{value}}", { value: formatMinutes(rawDifference) })
      : undefined;
  const summaryMetrics = [
    {
      key: "weeklyHours",
      label: t("Weekly Scheduled Hours"),
      value: weeklyScheduledHours,
    },
    {
      key: "weeklyCheckins",
      label: t("Total Weekly Check-In/Out"),
      value: weeklyCheckinsLabel,
    },
    {
      key: "absence",
      label: t("Absence"),
      value: absentDays > 0 ? `${absentDays}×` : t("None"),
      helper:
        absenceMinutes > 0 ? formatMinutes(absenceMinutes) : undefined,
    },
    {
      key: "latency",
      label: t("Latency"),
      value: formatMinutes(lateCheckinMinutes),
    },
    {
      key: "earlyCheckout",
      label: t("Checkout Early"),
      value: formatMinutes(-earlyCheckoutMinutes),
    },
    {
      key: "overtime",
      label: t("Overtime"),
      value: overtimeLabel,
      helper: overtimeHelper,
    },
  ];

  return (
    <div className="w-full rounded-3xl shadow-2xl p-0 mb-18 overflow-hidden bg-gradient-to-tr from-blue-100 via-blue-50 to-white dark:from-blue-950 dark:via-slate-900 dark:to-purple-950">
      <div className="flex flex-col md:flex-row gap-4 items-center p-8 bg-gradient-to-br from-blue-200 via-blue-100 to-blue-50 dark:from-blue-900 dark:via-purple-900 dark:to-slate-900">
        <img
          src={getAvatar(staff.avatar)}
          alt=""
          className="w-20 h-20 rounded-full border-4 border-white shadow-lg"
        />
        <div>
          <div className="flex gap-3 items-center">
            <h2 className="text-3xl font-extrabold text-blue-900 dark:text-white tracking-tight">
              {staff.name}
            </h2>
            <span className="bg-gradient-to-r from-blue-300 to-blue-400 px-3 py-1 rounded-full text-base font-semibold text-blue-900 shadow">
              {staff.role}
            </span>
          </div>
          <p className="text-blue-600 mt-2 text-base">{staff.email}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-200 hover:bg-blue-300 text-blue-900 font-bold shadow text-base"
          >
            <Download size={18} /> {t("Export")}
          </button>
          <button
            onClick={onClear}
            disabled={!hasPayments}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg font-bold shadow text-base transition ${
              hasPayments
                ? "bg-rose-200 hover:bg-rose-300 text-rose-900"
                : "bg-rose-100 text-rose-400 cursor-not-allowed"
            }`}
          >
            <Trash2 size={18} /> {t("Clear History")}
          </button>
        </div>
      </div>

      {/* Salary & Attendance Section */}
      <div className="p-8 flex flex-col gap-6 bg-white/60 dark:bg-slate-900">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-blue-700 mb-1">
            {t("Salary Progress")}
          </h3>
          <div className="flex gap-2 mb-2 flex-wrap">
            <span className="bg-blue-200 text-blue-900 px-3 py-1 rounded text-base">
              {t("Paid")}: {currency(history.salaryPaid)}
            </span>
            <span className="bg-orange-100 text-orange-900 px-3 py-1 rounded text-base">
              {t("Due")}: {currency(history.salaryDue)}
            </span>
            <span className="bg-gray-100 text-gray-900 px-3 py-1 rounded text-base">
              {t("Total")}: {currency(history.totalSalaryDue)}
            </span>
          </div>
          <div className="relative w-full h-6 bg-blue-100 rounded-full overflow-hidden shadow-inner">
            <div
              className="absolute h-6 bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-700"
              style={{
                width:
                  history.totalSalaryDue > 0
                    ? `${Math.min(
                        (history.salaryPaid / history.totalSalaryDue) * 100,
                        100
                      )}%`
                    : "0%",
              }}
            ></div>
          </div>
          <div className="mt-1 text-right text-base text-blue-600 font-semibold">
            {history.totalSalaryDue > 0
              ? t("{{value}}% paid", {
                  value: Math.min(
                    (history.salaryPaid / history.totalSalaryDue) * 100,
                    100
                  ).toFixed(0),
                })
              : t("No payment data")}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {summaryMetrics.map((metric) => (
            <div
              key={metric.key}
              className="rounded-2xl border border-blue-100 bg-white/70 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-500 dark:text-slate-300">
                {metric.label}
              </div>
              <div className="text-2xl font-bold text-blue-900 dark:text-white mt-1">
                {metric.value}
              </div>
              {metric.helper && (
                <div className="text-xs text-blue-500 dark:text-slate-400 mt-1">
                  {metric.helper}
                </div>
              )}
              {metric.key === "overtime" && history.overtimePendingApproval && (
                <div className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {t("Pending approval")}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {hasAutoPayment && (
        <div className="px-8 pb-6 -mt-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 dark:border-blue-800 dark:bg-slate-900/70 p-6 shadow-inner space-y-2 text-base">
            <div className="flex items-center justify-between text-blue-800 dark:text-blue-200">
              <h4 className="text-lg font-bold">
                {t("Auto Payroll Plan")}
              </h4>
              <span className="text-sm font-medium bg-blue-200 text-blue-900 px-3 py-1 rounded-full">
                {autoPaymentInfo.active ? t("Active") : t("Paused")}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full bg-white text-blue-900 font-semibold shadow-sm">
                {formatCurrency(autoPaymentInfo.amount || 0)}
              </span>
              <span className="px-3 py-1 rounded-full bg-white text-blue-900 font-medium shadow-sm">
                {repeatLabel} @ {autoPaymentInfo.repeat_time || "--:--"}
              </span>
              {autoPaymentInfo.payment_method && (
                <span className="px-3 py-1 rounded-full bg-white text-blue-900 font-medium shadow-sm capitalize">
                  {autoPaymentInfo.payment_method}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-800 dark:text-blue-100">
              <div>
                <span className="font-semibold">{t("Next Run")}:</span>{" "}
                {autoPaymentInfo.scheduled_date
                  ? dateStr(autoPaymentInfo.scheduled_date)
                  : t("Not scheduled")}
              </div>
              <div>
                <span className="font-semibold">{t("Last Payment")}:</span>{" "}
                {autoPaymentInfo.last_payment_date
                  ? dateStr(autoPaymentInfo.last_payment_date)
                  : t("No history")}
              </div>
              {autoPaymentInfo.note && (
                <div className="md:col-span-2">
                  <span className="font-semibold">{t("Note")}:</span>{" "}
                  {autoPaymentInfo.note}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="bg-blue-50 dark:bg-slate-950 p-8 mt-4 rounded-b-2xl">
        <h4 className="font-extrabold text-xl text-blue-700 mb-3">
          {t("💳 Payment History")}
        </h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-base">
            <thead>
              <tr className="text-blue-700 font-bold bg-blue-100 dark:bg-slate-900 text-left">
                <th className="p-3">{t("Date")}</th>
                <th className="p-3">{t("Amount")}</th>
                <th className="p-3">{t("Method")}</th>
                <th className="p-3">{t("Type")}</th>
                <th className="p-3">{t("Note")}</th>
                <th className="p-3">{t("Due After Payment")}</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(paymentRows) && paymentRows.length > 0 ? (
                paymentRows.map((pay, i) => (
                  <tr
                    key={i}
                    className="text-blue-900 odd:bg-white even:bg-blue-50"
                  >
                    <td className="p-3">
  {pay.payment_date
    ? dateStr(pay.payment_date)
    : pay.scheduled_date
    ? dateStr(pay.scheduled_date)
    : "-"}
</td>
                    <td className="p-3">{formatCurrency(pay.amount)}</td>
                    <td className="p-3">{pay.payment_method || "-"}</td>
                    <td className="p-3">
                      {pay.auto ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                          {t("Auto")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                          {t("Manual")}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{pay.note || "-"}</td>
                    <td className="p-3">{formatCurrency(pay.dueAfter)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-3 text-blue-400">
                    {t("No payment records")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Payroll = () => {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const currency = (value) => formatMoney(formatCurrency, value);
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffHistory, setStaffHistory] = useState({});
  const [paymentHistory, setPaymentHistory] = useState([]);
  console.log("📘 Payroll component state:", staffHistory);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(false);
  const [autoPaymentDate, setAutoPaymentDate] = useState("");
  const [repeatType, setRepeatType] = useState("none");
  const [repeatTime, setRepeatTime] = useState("09:00");
  const [searchQuery, setSearchQuery] = useState("");

  // Date filtering (current week)
  const getMonday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(now);
    monday.setDate(diff);
    return monday.toISOString().split("T")[0];
  };
  const getSunday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return sunday.toISOString().split("T")[0];
  };
  const [startDate, setStartDate] = useState(getMonday());
  const [endDate, setEndDate] = useState(getSunday());

  // ✅ Fetch staff securely on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await secureFetch("/staff");
        setStaffList(data);
      } catch (err) {
        console.error("❌ Failed to load staff:", err);
        toast.error(t("Failed to load staff list"));
      }
    })();
  }, []);

  // ✅ Fetch payroll data
  const fetchStaffHistory = async (staffId) => {
    setSelectedStaff(staffId);
    if (!staffId) {
      setStaffHistory({});
      setPaymentHistory([]);
      return;
    }

    try {
      const [payments, autoSchedule] = await Promise.all([
        secureFetch(`/staff/${staffId}/payments`),
        secureFetch(`/staff/${staffId}/payments/auto`),
      ]);

      console.log("📥 Payments API raw:", payments);

      const normalizedPayments = Array.isArray(payments)
        ? payments.map((p) => ({
            ...p,
            amount: Number(p.amount || 0),
          }))
        : [];

      setPaymentHistory(normalizedPayments);
      setStaffHistory({ autoPayment: autoSchedule });
    } catch (err) {
      console.error("❌ Payment history fetch error:", err);
      toast.error(t("Failed to fetch payment history"));
    }

    try {
      const payroll = await secureFetch(
        `/staff/${staffId}/payroll?startDate=${startDate}&endDate=${endDate}`
      );
      setStaffHistory((prev) => ({
        ...payroll.payroll,
        autoPayment: prev.autoPayment,
      }));
    } catch (err) {
      console.error("❌ Detailed payroll fetch error:", err);
    }
  };


  useEffect(() => {
    if (selectedStaff) fetchStaffHistory(selectedStaff);
  }, [selectedStaff, startDate, endDate]);

  // ✅ Export payroll
  const exportPayroll = () => {
    const staff = staffList.find((s) => s.id === selectedStaff);
    if (!staff || !staffHistory.weeklyCheck)
      return toast.error(t("No data to export"));
    const rows = [
      [t("Day"), t("Date"), t("Scheduled"), t("Attended"), t("Late"), t("Early Out"), t("Total")],
      ...staffHistory.weeklyCheck.map((row) => [
        row.day,
        row.date,
        row.schedule,
        row.sessions.length > 0 ? "✔" : t("Absent"),
        (row.latency || []).join(";"),
        (row.earlyCheckout || []).filter(Boolean).join(";"),
        row.totalTime,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${staff.name}-payroll.csv`;
    a.click();
  };

  // ✅ Save payment securely
  const handlePayment = async () => {
    if (!selectedStaff) return toast.error(t("Select staff first"));
    const amt = parseFloat(paymentAmount);
    if (!amt && !autoPaymentEnabled)
      return toast.error(t("Enter amount or enable auto"));
    try {
      await secureFetch(`/staff/${selectedStaff}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: amt,
          date: new Date().toISOString().slice(0, 10),
          note,
          payment_method: paymentMethod,
          auto: autoPaymentEnabled,
          scheduled_date: autoPaymentEnabled ? autoPaymentDate : null,
          repeat_type: repeatType,
          repeat_time: repeatTime,
        }),
      });
      toast.success(t("Payment saved!"));
      setIsModalOpen(false);
      setPaymentAmount("");
      setNote("");
      fetchStaffHistory(selectedStaff);

      if (isCashLabel(paymentMethod) && amt > 0) {
        const staffEntry = staffList.find(
          (person) => String(person.id) === String(selectedStaff)
        );
        const staffLabel = staffEntry?.name || t("Staff");
        await logCashRegisterEvent({
          type: "payroll",
          amount: amt,
          note: `Payroll - ${staffLabel}`,
        });
        await openCashDrawer();
      }
    } catch (err) {
      console.error("❌ Payment error:", err);
      toast.error(t("Failed to save payment"));
    }
  };

  const downloadPaymentHistory = (rangeStart, rangeEnd) => {
    const staff = staffList.find((s) => s.id === selectedStaff);
    if (!staff) return false;

    const rows = calcDueHistory(
      staffHistory.totalSalaryDue,
      paymentHistory
    );

    const filtered = rows.filter((entry) => {
      const rawDate =
        entry.payment_date || entry.scheduled_date || entry.created_at || "";
      if (!rawDate) return true;
      const dateOnly = rawDate.slice(0, 10);
      if (rangeStart && dateOnly && dateOnly < rangeStart) return false;
      if (rangeEnd && dateOnly && dateOnly > rangeEnd) return false;
      return true;
    });

    if (filtered.length === 0) {
      toast(t("No payment records in selected range"));
      return false;
    }

    const csvRows = [
      [
        t("Date"),
        t("Amount"),
        t("Method"),
        t("Type"),
        t("Note"),
        t("Due After Payment"),
      ],
      ...filtered.map((pay) => [
        pay.payment_date
          ? dateStr(pay.payment_date)
          : pay.scheduled_date
          ? dateStr(pay.scheduled_date)
          : "-",
        currency(pay.amount),
        pay.payment_method || "-",
        pay.auto ? t("Auto") : t("Manual"),
        pay.note || "-",
        currency(pay.dueAfter),
      ]),
    ];

    const csvContent = csvRows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const safeName = staff.name ? staff.name.replace(/\s+/g, "_") : "staff";
    let rangeSuffix = "all";
    if (rangeStart && rangeEnd) {
      rangeSuffix = `${rangeStart}_to_${rangeEnd}`;
    } else if (rangeStart) {
      rangeSuffix = `from_${rangeStart}`;
    } else if (rangeEnd) {
      rangeSuffix = `until_${rangeEnd}`;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}-payments-${rangeSuffix}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(t("Download started"));
    return true;
  };

  const clearPaymentHistory = async ({
    startDate: rangeStart,
    endDate: rangeEnd,
    download,
  }) => {
    if (!selectedStaff) return;

    if (
      rangeStart &&
      rangeEnd &&
      new Date(rangeStart).getTime() > new Date(rangeEnd).getTime()
    ) {
      toast.error(t("Start date must be before end date"));
      return;
    }

    if (download) {
      downloadPaymentHistory(rangeStart, rangeEnd);
    }

    try {
      await secureFetch(`/staff/${selectedStaff}/payments`, {
        method: "DELETE",
        body: JSON.stringify({
          startDate: rangeStart || null,
          endDate: rangeEnd || null,
        }),
      });
      toast.success(t("Payment history cleared"));
      fetchStaffHistory(selectedStaff);
    } catch (err) {
      console.error("❌ Clear payment history error:", err);
      toast.error(t("Failed to clear payment history"));
    }
  };

  const handleClearHistoryPrompt = () => {
    if (!selectedStaff) {
      toast.error(t("Select staff first"));
      return;
    }
    if (!paymentHistory || paymentHistory.length === 0) {
      toast.error(t("No payment records to clear"));
      return;
    }
    toast.custom(
      (toastInstance) => (
        <ClearHistoryToast
          toastInstance={toastInstance}
          defaultStart={startDate}
          defaultEnd={endDate}
          onCancel={() => toast.dismiss(toastInstance.id)}
          onConfirm={(payload) => {
            toast.dismiss(toastInstance.id);
            clearPaymentHistory(payload);
          }}
        />
      ),
      { duration: Infinity }
    );
  };

  // Search filter
  useEffect(() => {
    if (searchQuery.trim() && staffList.length > 0) {
      const found = staffList.find((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      if (found) {
        setSelectedStaff(found.id);
      }
    }
  }, [searchQuery, staffList]);

  return (
    <div className="min-h-screen w-full bg-transparent text-blue-900 dark:text-slate-100 pb-12 text-base">
      <div className="w-full px-8 py-8 flex flex-col md:flex-row gap-6 items-center justify-between bg-transparent">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select
            className="p-4 rounded-lg border border-gray-300 bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 text-base"
            value={selectedStaff || ""}
            onChange={(e) => fetchStaffHistory(Number(e.target.value))}
          >
            <option value="">{t("Select Staff")}</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("Search staff...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="p-4 rounded-lg border border-gray-300 bg-white shadow w-full md:w-1/3 text-base text-blue-900 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-base">{t("From")}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg p-3 border bg-white text-base dark:bg-slate-800 dark:text-slate-100"
          />
          <label className="text-base">{t("To")}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg p-3 border bg-white text-base dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col px-2 py-8">
        {selectedStaff && staffList.length > 0 && (
          <StaffCard
            staff={staffList.find((s) => String(s.id) === String(selectedStaff))}
            staffHistory={staffHistory}
            paymentHistory={paymentHistory}
            onExport={exportPayroll}
            onClear={handleClearHistoryPrompt}
          />
        )}
      </div>
      <Toaster />
    </div>
  );
};

export default Payroll;
