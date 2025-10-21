// Payroll.jsx - Tenant-safe version using secureFetch (2025-10-08)
import React, { useState, useEffect } from "react";
import Modal from "react-modal";
import { Toaster, toast } from "react-hot-toast";
import { Plus, Save, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

const currency = (amt) =>
  `₺${parseFloat(amt || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
  })}`;
const dateStr = (d) => new Date(d).toLocaleDateString("tr-TR");
const timeStr = (h, m) => `${h}h ${m}min`;

function calcDueHistory(totalSalaryDue, payments = []) {
  let due = totalSalaryDue || 0;
  const out = [];
  payments
    .slice()
    .reverse()
    .forEach((p) => {
      out.push({ ...p, dueAfter: due });
      due = due + (p.amount || 0) * -1;
    });
  return out.reverse();
}

const DEFAULT_AVATAR =
  "https://www.pngkey.com/png/full/115-1150152_default-profile-picture-avatar-png-green.png";

const getAvatar = (url) => {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith("http://localhost") || url.startsWith("/uploads/"))
    return DEFAULT_AVATAR;
  if (url.startsWith("http")) return url;
  return DEFAULT_AVATAR;
};

const StaffCard = ({ staff, staffHistory, onExport }) => {
  const { t } = useTranslation();
  const history = staffHistory || {};
  const breakdown = Array.isArray(history.weeklyCheck)
    ? history.weeklyCheck
    : [];
  const paymentRows = calcDueHistory(
    history.totalSalaryDue,
    history.paymentHistory
  );

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
        </div>
      </div>

      {/* Salary & Attendance Section */}
      <div className="p-8 flex flex-col lg:flex-row gap-8 justify-between bg-white/60 dark:bg-slate-900">
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
              ? `${Math.min(
                  (history.salaryPaid / history.totalSalaryDue) * 100,
                  100
                ).toFixed(0)}% paid`
              : t("No payment data")}
          </div>
        </div>
      </div>

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
                    <td className="p-3">{dateStr(pay.payment_date)}</td>
                    <td className="p-3">{currency(pay.amount)}</td>
                    <td className="p-3">{pay.payment_method || "-"}</td>
                    <td className="p-3">{pay.note || "-"}</td>
                    <td className="p-3">{currency(pay.dueAfter)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-3 text-blue-400">
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
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffHistory, setStaffHistory] = useState({});
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
      return;
    }
    try {
      const [payroll, payments] = await Promise.all([
        secureFetch(
          `/staff/${staffId}/payroll?startDate=${startDate}&endDate=${endDate}`
        ),
        secureFetch(`/staff/${staffId}/payments`),
      ]);
      setStaffHistory({
        ...payroll.payroll,
        paymentHistory: payments,
      });
    } catch (err) {
      console.error("❌ Payroll fetch error:", err);
      toast.error(t("Failed to fetch payroll data"));
    }
  };

  useEffect(() => {
    if (selectedStaff) fetchStaffHistory(selectedStaff);
  }, [selectedStaff, startDate, endDate]);

  // ✅ Export payroll
  const exportPayroll = () => {
    const staff = staffList.find((s) => s.id === selectedStaff);
    if (!staff || !staffHistory.weeklyCheck)
      return toast.error("No data to export");
    const rows = [
      ["Day", "Date", "Scheduled", "Attended", "Late", "Early Out", "Total"],
      ...staffHistory.weeklyCheck.map((row) => [
        row.day,
        row.date,
        row.schedule,
        row.sessions.length > 0 ? "✔" : "Absent",
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
    if (!selectedStaff) return toast.error("Select staff first");
    const amt = parseFloat(paymentAmount);
    if (!amt && !autoPaymentEnabled)
      return toast.error("Enter amount or enable auto");
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
      toast.success("Payment saved!");
      setIsModalOpen(false);
      setPaymentAmount("");
      setNote("");
      fetchStaffHistory(selectedStaff);
    } catch (err) {
      console.error("❌ Payment error:", err);
      toast.error("Failed to save payment");
    }
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
            staff={staffList.find((s) => s.id === selectedStaff)}
            staffHistory={staffHistory}
            onExport={exportPayroll}
          />
        )}
      </div>
      <Toaster />
    </div>
  );
};

export default Payroll;
