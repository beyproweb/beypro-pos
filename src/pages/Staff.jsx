import React, { useState, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import StaffCheckIn from '../components/ui/StaffCheckIn';
import StaffSchedule from '../components/ui/StaffSchedule';
import Payroll from '../components/ui/Payroll';
import { useHasPermission } from "../components/hooks/useHasPermission";

import Modal from 'react-modal';
import { Toaster, toast } from 'react-hot-toast';
import { Plus, Save } from 'lucide-react';
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useLocation, useNavigate } from "react-router-dom";
import { useCurrency } from "../context/CurrencyContext";
import { useHeader } from "../context/HeaderContext";
const API_URL = import.meta.env.VITE_API_URL || "";
Modal.setAppElement('#root');

const Staff = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { config, formatCurrency } = useCurrency();
  const isStandalone =
    typeof window !== "undefined" &&
    typeof window.location?.pathname === "string" &&
    window.location.pathname.startsWith("/standalone");
  const [savedAutoPayment, setSavedAutoPayment] = useState(null);

  const [activeTabId, setActiveTabId] = useState("checkin");
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [isSendShiftModalOpen, setIsSendShiftModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [id, setId] = useState('');
  const [pin, setPin] = useState("");
  const [address, setAddress] = useState('');
  const [salary, setSalary] = useState('');
  const [email, setEmail] = useState('');
  const [paymentType, setPaymentType] = useState('daily');
  const [salaryModel, setSalaryModel] = useState('fixed');
  const [hourlyRate, setHourlyRate] = useState('');
  const [staffList, setStaffList] = useState([]);

  const [shiftDetails, setShiftDetails] = useState({
    staff_id: 1,
    role: 'Manager',
    shift_start: '08:00:00',
    shift_end: '17:00:00',
    days: 'Mon, Tue, Wed, Thu, Fri',
    salary: 5000,
    staffName: 'John Doe'
  });
  const [sendToEveryone, setSendToEveryone] = useState(true);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStaffForPayment, setSelectedStaffForPayment] = useState('');
  const [staffHistory, setStaffHistory] = useState({});
  const [paymentAmount, setPaymentAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(false);
  const [autoPaymentDate, setAutoPaymentDate] = useState('');
  const [repeatType, setRepeatType] = useState('none');
  const [repeatTime, setRepeatTime] = useState('09:00');
  const [autoPayPreview, setAutoPayPreview] = useState(null); // { amount, startDate, endDate }

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const startOfWeekMonday = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  };
  const endOfWeekSunday = (dateStr) => {
    const monday = new Date(`${startOfWeekMonday(dateStr)}T00:00:00`);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return sunday.toISOString().slice(0, 10);
  };
  const startOfMonth = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    return first.toISOString().slice(0, 10);
  };
  const endOfMonth = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().slice(0, 10);
  };
  const resolveAutoRange = (basisDate) => {
    const base = basisDate || todayStr();
    const rt = String(repeatType || "none").toLowerCase();
    if (rt === "daily") return { startDate: base, endDate: base };
    if (rt === "weekly") return { startDate: startOfWeekMonday(base), endDate: endOfWeekSunday(base) };
    if (rt === "monthly") return { startDate: startOfMonth(base), endDate: endOfMonth(base) };
    // default payroll range (backend default week) if not specified
    return { startDate: null, endDate: null };
  };

  // Allow child components (e.g. Payroll tab) to open the Payment modal for a specific staff member.
  useEffect(() => {
    const onOpenPayment = (e) => {
      const staffId = e?.detail?.staffId;
      if (staffId == null || staffId === "") return;
      setSelectedStaffForPayment(String(staffId));
      setIsModalOpen(true);
    };
    window.addEventListener("staff:open-payment", onOpenPayment);
    return () => window.removeEventListener("staff:open-payment", onOpenPayment);
  }, []);

  const canCheckIn = useHasPermission("staff-checkin");
  const canSchedule = useHasPermission("staff-schedule");
  const canPayroll = useHasPermission("staff-payroll");
  const canSendShift = useHasPermission("staff-send-shift");
  const canAddStaff = useHasPermission("staff-add");
  const canPayment = useHasPermission("staff-payment");

  const handleSelectTab = useCallback(
    (tabId) => {
      setActiveTabId(tabId);
      const params = new URLSearchParams(location.search);
      params.set("tab", tabId);
      const base = isStandalone ? "/standalone/staff" : "/staff";
      navigate(`${base}?${params.toString()}`);
    },
    [location.search, navigate, isStandalone]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get("tab");
    if (!requestedTab) return;

    const normalized = requestedTab.toLowerCase().trim();
    const match =
      normalized === "checkin" && canCheckIn
        ? "checkin"
        : normalized === "schedule" && canSchedule
        ? "schedule"
        : normalized === "payroll" && canPayroll
        ? "payroll"
        : null;

    if (match) {
      setActiveTabId(match);
    }
  }, [location.search, canCheckIn, canSchedule, canPayroll]);

  const tabDefinitions = useMemo(
    () => [
      { id: "checkin", title: "Check-In", component: <StaffCheckIn /> },
      { id: "schedule", title: "Staff Schedule", component: <StaffSchedule /> },
      { id: "payroll", title: "Payroll", component: <Payroll /> },
    ],
    []
  );

  const accessibleTabs = useMemo(
    () =>
      [
        canCheckIn ? tabDefinitions[0] : null,
        canSchedule ? tabDefinitions[1] : null,
        canPayroll ? tabDefinitions[2] : null,
      ].filter(Boolean),
    [canCheckIn, canSchedule, canPayroll, tabDefinitions]
  );

  const tabsToRender = accessibleTabs;

  const staffHeaderNav = useMemo(() => {
    const pillClass = (isActive) =>
      [
        "shrink-0 w-28 sm:w-32 truncate",
        "inline-flex items-center justify-center gap-2",
        "rounded-xl border border-slate-200/80 dark:border-slate-700/80 px-3 py-1.5 text-sm font-semibold",
        "transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
        isActive
          ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/50"
          : "bg-white/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800",
      ].join(" ");

    return (
      <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap">
        {!isStandalone && (
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className={pillClass(false)}
          >
            {t("Dashboard")}
          </button>
        )}

        {tabsToRender.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleSelectTab(tab.id)}
            className={pillClass(activeTabId === tab.id)}
          >
            {t(tab.title)}
          </button>
        ))}

        {canSendShift && (
          <button
            type="button"
            onClick={() => setIsSendShiftModalOpen(true)}
            className={pillClass(isSendShiftModalOpen)}
          >
            {t("Send Shift")}
          </button>
        )}

        {canAddStaff && (
          <button
            type="button"
            onClick={() => setShowAddStaff((v) => !v)}
            className={pillClass(showAddStaff)}
          >
            {showAddStaff ? t("Close Add Staff") : t("Add Staff")}
          </button>
        )}

        {canPayment && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className={pillClass(isModalOpen)}
          >
            {t("Payment")}
          </button>
        )}
      </div>
    );
  }, [
    tabsToRender,
    activeTabId,
    canAddStaff,
    canPayment,
    canSendShift,
    handleSelectTab,
    isModalOpen,
    isSendShiftModalOpen,
    showAddStaff,
    t,
    isStandalone,
  ]);

  useLayoutEffect(() => {
    setHeader((prev) => ({
      ...prev,
      title: t("Staff Management"),
      subtitle: isStandalone ? t("Staff-only portal") : undefined,
      tableNav: null,
      centerNav: staffHeaderNav,
    }));
  }, [setHeader, staffHeaderNav, t, isStandalone]);

  useEffect(() => () => setHeader({}), [setHeader]);

  // ✅ Load staff
  useEffect(() => {
    let isMounted = true;
    const fetchStaff = async () => {
      try {
        const response = await secureFetch("/staff");
        if (isMounted) setStaffList(response);
      } catch (err) {
        console.error("Error fetching staff:", err);
        toast.error("Error fetching staff");
      }
    };
    fetchStaff();
    return () => { isMounted = false; };
  }, []);

  // ✅ Fetch payroll + payment history
  const fetchStaffHistory = async (staffId) => {
    setSelectedStaffForPayment(staffId);
    if (!staffId) { setStaffHistory({}); return; }
    try {
  const [payroll, payments, autoSchedule] = await Promise.all([
  secureFetch(`/staff/${staffId}/payroll`),
  secureFetch(`/staff/${staffId}/payments`),
  secureFetch(`/staff/${staffId}/payments/auto`)
]);
console.log("📥 Staff.jsx payments:", payments);
setStaffHistory({
  ...payroll.payroll,
  paymentHistory: payments
});
setSavedAutoPayment(autoSchedule); // ✅ new line

    } catch (err) {
      toast.error(t("Failed to fetch payroll data"));
    }
  };

  // Refresh selected staff payroll/payment state whenever the payment modal is opened.
  useEffect(() => {
    if (!isModalOpen) return;
    if (!selectedStaffForPayment) return;
    fetchStaffHistory(Number(selectedStaffForPayment));
  }, [isModalOpen, selectedStaffForPayment]);

  // Keep the auto schedule "repeat" aligned with the staff's configured payment_type (daily/weekly/monthly).
  useEffect(() => {
    if (!selectedStaffForPayment) return;
    const staff = staffList.find((s) => String(s.id) === String(selectedStaffForPayment));
    const next = String(staff?.payment_type || "").toLowerCase();
    if (next === "daily" || next === "weekly" || next === "monthly") {
      setRepeatType(next);
    }
  }, [selectedStaffForPayment, staffList]);

  // Hydrate payment modal fields from the saved auto payroll config (when available).
  useEffect(() => {
    if (!isModalOpen) return;
    if (!selectedStaffForPayment) return;
    if (!savedAutoPayment) return;

    setRepeatTime(savedAutoPayment.repeat_time || "09:00");
    setAutoPaymentDate(savedAutoPayment.scheduled_date || "");
    if (savedAutoPayment.payment_method) {
      setPaymentMethod(savedAutoPayment.payment_method);
    }
    if (typeof savedAutoPayment.note === "string" && savedAutoPayment.note.trim()) {
      setNote(savedAutoPayment.note);
    }
  }, [isModalOpen, selectedStaffForPayment, savedAutoPayment]);

  // ✅ Add new staff
  const addStaff = async () => {
    if (!name || !role || !phone || !id || !address || !salary || !email || !pin) {
      toast.error("All fields are required");
      return;
    }
    const parsedId = Number.parseInt(String(id || "").trim(), 10);
    if (!Number.isInteger(parsedId)) {
      toast.error(t("Please enter a valid numeric ID"));
      return;
    }
    try {
      await secureFetch("/staff", {
        method: "POST",
        body: JSON.stringify({
          id: parsedId,
          name,
          role,
          phone,
          pin: String(pin || "").trim(),
          address,
          email,
          salary: parseFloat(salary),
          salary_model: salaryModel,
          payment_type: paymentType,
          hourly_rate: salaryModel === "hourly" ? parseFloat(hourlyRate) : null,
          weekly_salary: salaryModel === "fixed" && paymentType === "weekly" ? parseFloat(salary) : null,
          monthly_salary: salaryModel === "fixed" && paymentType === "monthly" ? parseFloat(salary) : null,
        }),
      });
      toast.success(t("Staff added successfully"));
      setName(""); setRole(""); setPhone(""); setId(""); setPin(""); setAddress("");
      setSalary(""); setEmail(""); setPaymentType("daily"); setSalaryModel("fixed"); setHourlyRate("");
      setShowAddStaff(false);
      const res = await secureFetch("/staff");
      setStaffList(res);
    } catch (err) {
      toast.error(err?.message || t("Failed to add staff"));
    }
  };

  // ✅ Send shift schedule
  const handleSendShift = async () => {
    try {
      const period = shiftDetails.period || "week";
      const recipients = sendToEveryone ? staffList.map((staff) => staff.id) : selectedRecipients;
      await secureFetch("/staff/send-schedule", {
        method: "POST",
        body: JSON.stringify({ period, recipients }),
      });
      toast.success("Shift schedule sent successfully");
      setIsSendShiftModalOpen(false);
    } catch (err) {
      toast.error("Failed to send shift schedule");
    }
  };

  // ✅ Handle payment
  const handlePayment = async () => {
    if (!selectedStaffForPayment) return toast.error("Select staff");
    const autoActive = !!(savedAutoPayment && savedAutoPayment.active);
    const previewAmt = Number(autoPayPreview?.amount ?? staffHistory.salaryDue ?? 0);
    const manualAmt = parseFloat(paymentAmount);

    if (autoPaymentEnabled) {
      if (autoActive) return toast.error(t("Manual payments are disabled while auto payroll is active."));
      if (!autoPaymentDate) return toast.error("Scheduled date is required");
      if (!repeatType || repeatType === "none") return toast.error("Repeat is required");
      if (!repeatTime) return toast.error("Time is required");
      if (!Number.isFinite(previewAmt)) {
        return toast.error("Invalid auto payment amount");
      }
    } else {
      if (!manualAmt) return toast.error("Enter amount or enable auto");
    }
    try {
      await secureFetch(`/staff/${selectedStaffForPayment}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: autoPaymentEnabled ? previewAmt : manualAmt,
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
      setAutoPaymentEnabled(false);
      setAutoPaymentDate("");
      setRepeatType("none");
      setRepeatTime("09:00");
      setSelectedStaffForPayment("");
      setStaffHistory({});
      setSavedAutoPayment(null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("register:refresh"));
        window.dispatchEvent(new Event("reports:refresh"));
      }

    } catch (err) {
      console.error("❌ Failed to save payment:", err);
      toast.error(err?.message || "Failed to save payment");
    }
  };

  // When auto payment is enabled, compute the amount based on payroll for the selected period.
  useEffect(() => {
    let active = true;
    const autoActive = !!(savedAutoPayment && savedAutoPayment.active);
    if (!autoPaymentEnabled || autoActive) {
      setAutoPayPreview(null);
      return;
    }
    if (!selectedStaffForPayment) {
      setAutoPayPreview(null);
      return;
    }
    const basis = autoPaymentDate || todayStr();
    const { startDate, endDate } = resolveAutoRange(basis);
    const staffId = Number(selectedStaffForPayment);
    const query =
      startDate && endDate ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}` : "";

    (async () => {
      try {
        const payroll = await secureFetch(`/staff/${staffId}/payroll${query}`);
        const amount = Number(payroll?.payroll?.salaryDue ?? payroll?.payroll?.totalSalaryDue ?? 0);
        if (!active) return;
        setAutoPayPreview({
          amount: Number.isFinite(amount) ? amount : 0,
          startDate: startDate || null,
          endDate: endDate || null,
        });
      } catch {
        if (!active) return;
        setAutoPayPreview(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [autoPaymentEnabled, autoPaymentDate, repeatType, selectedStaffForPayment, savedAutoPayment]);

  const activeTabContent =
    tabsToRender.find((tab) => tab.id === activeTabId)?.component ||
    tabsToRender[0]?.component;

  useEffect(() => {
    if (!tabsToRender.length) return;
    if (!tabsToRender.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabsToRender[0].id);
    }
  }, [tabsToRender, activeTabId]);

  return (
    <div className="p-6 space-y-1 relative dark:bg-900 text-gray-800 dark:text-white text-base transition-colors">
      <Toaster position="top-center" reverseOrder={false} />

      {/* Main Content */}
      <div className="bg-transparent">
        {activeTabContent ? (
          activeTabContent
        ) : (
          <div className="p-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900 text-center text-gray-600 dark:text-gray-400">
            {t("You have limited access. Please contact your admin for more permissions.")}
          </div>
        )}
        <div className="mt-4">{/* Add extra content here if needed */}</div>
      </div>

      {/* Add Staff Modal */}
      {canAddStaff && showAddStaff && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 w-96 text-gray-800 dark:text-white">
            <h3 className="text-xl font-bold mb-4">{t("Add New Staff")}</h3>
            <input type="text" placeholder={t("ID")} className="block w-full p-2 border rounded mb-2" value={id} onChange={(e) => setId(e.target.value)} />
            <input type="text" placeholder={t("Name")} className="block w-full p-2 border rounded mb-2" value={name} onChange={(e) => setName(e.target.value)} />
            <input type="text" placeholder={t("Role")} className="block w-full p-2 border rounded mb-2" value={role} onChange={(e) => setRole(e.target.value)} />
            <input type="text" placeholder={t("Phone")} className="block w-full p-2 border rounded mb-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input type="text" placeholder={t("PIN")} className="block w-full p-2 border rounded mb-2" value={pin} onChange={(e) => setPin(e.target.value)} />
            <input type="text" placeholder={t("Address")} className="block w-full p-2 border rounded mb-2" value={address} onChange={(e) => setAddress(e.target.value)} />
            <input type="text" placeholder={t("Email")} className="block w-full p-2 border rounded mb-2" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="text" placeholder={t("Salary")} className="block w-full p-2 border rounded mb-4" value={salary} onChange={(e) => setSalary(e.target.value)} />
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="block w-full p-2 border rounded mb-4"
            >
              <option value="daily">{t("Daily")}</option>
              <option value="weekly">{t("Weekly")}</option>
              <option value="monthly">{t("Monthly")}</option>
            </select>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t("Salary Model")}:</label>
            <select
              className="block w-full p-2 border rounded mb-2"
              value={salaryModel}
              onChange={(e) => setSalaryModel(e.target.value)}
            >
              <option value="fixed">{t("Fixed")}</option>
              <option value="hourly">{t("Hourly")}</option>
            </select>
            {salaryModel === 'hourly' && (
              <>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t("Hourly Rate")} {config?.symbol ? `(${config.symbol})` : ""}
                  :
                </label>
                <input
                  type="number"
                  placeholder={t("Hourly Rate")}
                  className="block w-full p-2 border rounded mb-2"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </>
            )}
            <div className="flex space-x-2">
              <button onClick={addStaff} className="flex-1 bg-accent text-white py-2 rounded hover:brightness-110 transition">
                {t("Add")}
              </button>
              <button onClick={() => setShowAddStaff(false)} className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600 transition">
                {t("Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Shift Modal (unchanged) */}
      {canSendShift && isSendShiftModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 w-96 text-gray-800 dark:text-white">
            <h3 className="text-xl font-bold mb-4">{t("Send Shift Schedule")}</h3>
            <div className="mb-4">
              <label className="block mb-2 font-semibold">{t("Select Period")}:</label>
              <select
                className="w-full p-2 border rounded"
                onChange={(e) => setShiftDetails({ ...shiftDetails, period: e.target.value })}
              >
                <option value="week">{t("Weekly")}</option>
                <option value="month">{t("Monthly")}</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="block mb-2 font-semibold">{t("Send To")}:</label>
              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input type="radio" name="sendTo" checked={sendToEveryone} onChange={() => setSendToEveryone(true)} />
                  <span className="ml-2">{t("Everyone")}</span>
                </label>
                <label className="flex items-center">
                  <input type="radio" name="sendTo" checked={!sendToEveryone} onChange={() => setSendToEveryone(false)} />
                  <span className="ml-2">{t("Specific Staff")}</span>
                </label>
              </div>
            </div>
            {!sendToEveryone && (
              <div className="mb-4">
                <label className="block mb-2 font-semibold">{t("Select Staff")}:</label>
                <div className="max-h-40 overflow-y-auto border p-2 rounded">
                  {staffList.map((staff) => (
                    <div key={staff.id} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedRecipients.includes(staff.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRecipients([...selectedRecipients, staff.id]);
                          } else {
                            setSelectedRecipients(selectedRecipients.filter((id) => id !== staff.id));
                          }
                        }}
                      />
                      <span className="ml-2">{staff.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex space-x-2">
              <button onClick={handleSendShift} className="flex-1 bg-accent text-white py-2 rounded hover:brightness-110 transition">
                {t("Send")}
              </button>
              <button onClick={() => setIsSendShiftModalOpen(false)} className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600 transition">
                {t("Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

         {/* ---------------------- ADD PAYMENT MODAL ---------------------- */}
      {canPayment && (
        <Modal
          isOpen={isModalOpen}
          onRequestClose={()=>setIsModalOpen(false)}
        className="bg-white dark:bg-slate-900 p-8 rounded-2xl outline-none w-full max-w-lg mx-auto mt-20 shadow-2xl border border-blue-200 max-h-[90vh] overflow-y-auto z-[1002]"
        overlayClassName="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-start z-[1001]"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-blue-900 dark:text-slate-100">{t('Add Payment')}</h2>
          <button onClick={()=>setIsModalOpen(false)} className="p-2 rounded-full bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 transition"><span className="text-xl font-bold text-gray-700 dark:text-slate-200">×</span></button>
        </div>

        {/* compute auto state */}
        {/*
          savedAutoPayment is already set in fetchStaffHistory()
          We treat auto as ACTIVE only if savedAutoPayment?.active === true
        */}
        {(() => null)()}
        <select
          className="w-full p-3 border rounded-md mb-4 text-base dark:bg-slate-800 dark:text-slate-100"
          value={selectedStaffForPayment}
          onChange={e => fetchStaffHistory(Number(e.target.value))}
        >
          <option value="">{t('Select Staff')}</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
          ))}
        </select>

        {selectedStaffForPayment && (
        <>
          {/*
            Determine if auto payroll is active for selected staff
          */}
	          {(() => {
	            const autoActive = !!(savedAutoPayment && savedAutoPayment.active);
	            const repeatLabel = (savedAutoPayment?.repeat_type || "none")
	              .replace("daily", t("Daily"))
	              .replace("weekly", t("Weekly"))
	              .replace("monthly", t("Monthly"))
	              .replace("none", t("None"));
		            const selectedStaffObj = staffList.find(
		              (s) => String(s.id) === String(selectedStaffForPayment)
		            );
		            return (
		              <>
		                <div className="mb-4">
			                  <p className="text-lg font-semibold text-blue-900 dark:text-slate-100">
			                    {selectedStaffObj?.name} – {selectedStaffObj?.role}
			                  </p>
			                  <p className="text-base text-blue-600 dark:text-slate-300">
                          {t('Salary Due')}:{" "}
                          <span className="font-semibold text-red-600">
                            {formatCurrency(staffHistory.salaryDue)}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {t("Salary Model")}:{" "}
                          <span className="font-semibold">
                            {(() => {
                              const raw = String(selectedStaffObj?.salary_model || "").toLowerCase();
                              if (raw === "hourly") return t("Hourly");
                              if (raw === "fixed") return t("Fixed");
                              return raw || "-";
                            })()}
                          </span>{" "}
                          • {t("Repeat")}:{" "}
                          <span className="font-semibold">
                            {(() => {
                              const raw = String(selectedStaffObj?.payment_type || "").toLowerCase();
                              if (raw === "daily") return t("Daily");
                              if (raw === "weekly") return t("Weekly");
                              if (raw === "monthly") return t("Monthly");
                              return raw || "-";
                            })()}
                          </span>
                        </p>
			                </div>

	                {/* Auto Payroll Banner */}
	                {autoActive && (
	                  <div className="mb-4 p-4 border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 rounded-xl text-yellow-800 dark:text-yellow-200 shadow break-words">
	                    <div className="font-bold mb-1">🔁 {t('Auto Payroll Active')}</div>
	                    <div className="text-sm space-y-1">
	                      <div>{t('Manual payments are disabled while auto payroll is active.')}</div>
	                      <div className="flex flex-wrap gap-x-3 gap-y-1">
	                        <span>
	                          {t('Schedule')}: <strong>{repeatLabel}</strong>
	                          {savedAutoPayment?.repeat_time ? ` @ ${savedAutoPayment.repeat_time}` : ""}
	                        </span>
	                        {typeof savedAutoPayment?.amount !== "undefined" && (
	                          <span>
	                            {t("Amount")}:{" "}
	                            <strong>{formatCurrency(savedAutoPayment.amount || 0)}</strong>
	                          </span>
	                        )}
	                        {savedAutoPayment?.scheduled_date && (
	                          <span>
	                            {t('Next Run')}: <strong>{savedAutoPayment.scheduled_date}</strong>
	                          </span>
	                        )}
	                      </div>
	                    </div>
	                    {autoActive && (
	  <button
	    onClick={async () => {
      try {
        await secureFetch(`/staff/${selectedStaffForPayment}/payments/auto/toggle`, {
          method: "PUT",
          body: JSON.stringify({ active: false }),
        });
        toast.success(t("Auto payroll disabled successfully"));
        fetchStaffHistory(selectedStaffForPayment);
      } catch (err) {
        console.error("❌ Disable auto payroll error:", err);
        toast.error(t("Failed to disable auto payroll"));
      }
    }}
    className="mt-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold shadow"
  >
    {t("Disable Auto Payroll")}
  </button>
)}

                  </div>
                )}
                

	                {/* Amount */}
	                {(() => {
	                  const autoActive = !!(savedAutoPayment && savedAutoPayment.active);
	                  const autoAmount = Number(autoPayPreview?.amount ?? staffHistory.salaryDue ?? 0);
	                  const showAuto = autoPaymentEnabled && !autoActive;
	                  const disabled = autoActive || autoPaymentEnabled;
	                  return (
	                <input
	                  type="number"
	                  value={showAuto ? (Number.isFinite(autoAmount) ? autoAmount : 0) : paymentAmount}
	                  onChange={e=>{ if (!autoPaymentEnabled) setPaymentAmount(e.target.value); }}
	                  placeholder={autoPaymentEnabled ? t("Auto Payment Amount") : t('Payment amount (TL)')}
	                  disabled={disabled}
	                  className={`p-4 border rounded-lg w-full bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 mb-4 text-base ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
	                />
	                  );
	                })()}

                {/* Date */}
                <input
                  type="date"
                  className="p-4 border rounded-lg w-full bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 mb-4 text-base"
                  value={new Date().toISOString().slice(0,10)}
                  readOnly
                />

                {/* Method */}
                <label className="text-base font-medium text-blue-900 dark:text-slate-200 mt-3">{t('Payment Method')}</label>
                <select
                  className={`w-full p-3 border rounded-md mb-4 text-base dark:bg-slate-800 dark:text-slate-100 ${autoActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                  value={paymentMethod}
                  onChange={e=>setPaymentMethod(e.target.value)}
                  disabled={autoActive}
                >
                  <option value="cash">{t('Cash')}</option>
                  <option value="bank">{t('Bank Transfer')}</option>
                  <option value="papara">{t('Papara')}</option>
                  <option value="card">{t('Card')}</option>
                </select>

                {/* Auto schedule creator — disabled when auto already active */}
                <div className="flex items-center mt-2 mb-2">
                  <input
                    type="checkbox"
                    id="autoPay"
                    checked={autoPaymentEnabled}
                    onChange={e=>setAutoPaymentEnabled(e.target.checked)}
                    className="mr-2"
                    disabled={autoActive}
                  />
                  <label htmlFor="autoPay" className={`text-base ${autoActive ? 'opacity-60' : ''}`}>
                    {t('Schedule Auto Payment')}
                  </label>
                </div>

		                {autoPaymentEnabled && !autoActive && (
		                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-900 rounded-lg text-base text-yellow-800 dark:text-yellow-200 shadow">
		                    🔁 {t('Auto Payment Amount')}:{" "}
                        <span className="font-semibold">
                          {formatCurrency(Number(autoPayPreview?.amount ?? staffHistory.salaryDue ?? 0))}
                        </span>
                        {autoPayPreview?.startDate && autoPayPreview?.endDate && (
                          <span className="ml-2 text-xs opacity-80">
                            ({autoPayPreview.startDate} → {autoPayPreview.endDate})
                          </span>
                        )}
		                    <p className="text-xs mt-1 text-yellow-600 dark:text-yellow-200">{t('Will be paid on each schedule.')}</p>
		                  </div>
		                )}

                {autoPaymentEnabled && !autoActive && (
                  <div className="mb-4">
                    <label className="text-base font-medium text-blue-900 dark:text-slate-200">{t('Scheduled Date')}</label>
                    <input
                      type="date"
                      className="w-full p-3 border rounded-md dark:bg-slate-800 dark:text-slate-100 text-base"
                      value={autoPaymentDate}
                      min={todayStr()}
                      onChange={e=>setAutoPaymentDate(e.target.value)}
                    />
                  </div>
                )}

	                <div className="mt-3">
	                  <label className={`text-base font-medium text-blue-900 dark:text-slate-200 ${autoActive ? 'opacity-60' : ''}`}>{t('Repeat')}</label>
	                  <select
	                    className={`w-full p-3 border rounded-md dark:bg-slate-800 dark:text-slate-100 text-base ${autoActive ? 'opacity-60 cursor-not-allowed' : ''}`}
	                    value={repeatType}
	                    onChange={e=>setRepeatType(e.target.value)}
	                    disabled={true}
	                  >
	                    <option value="none">{t('Do not repeat')}</option>
	                    <option value="daily">{t('Daily')}</option>
	                    <option value="weekly">{t('Weekly')}</option>
	                    <option value="monthly">{t('Monthly')}</option>
	                  </select>
	                </div>

                <div className="mt-3">
                  <label className={`text-base font-medium text-blue-900 dark:text-slate-200 ${autoActive ? 'opacity-60' : ''}`}>{t('Time')}</label>
                  <input
                    type="time"
                    className={`w-full p-3 border rounded-md dark:bg-slate-800 dark:text-slate-100 text-base ${autoActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                    value={repeatTime}
                    onChange={e=>setRepeatTime(e.target.value)}
                    disabled={autoActive}
                  />
                </div>

                <textarea
                  rows="3"
                  placeholder={t('Optional note...')}
                  className={`p-4 border rounded-lg w-full bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 mb-4 text-base ${autoActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                  value={note}
                  onChange={e=>setNote(e.target.value)}
                  disabled={autoActive}
                ></textarea>

	                {/* Save button — fully disabled when auto is active */}
	                <button
	                  onClick={handlePayment}
	                  disabled={
	                      autoActive ||
	                      (autoPaymentEnabled
	                        ? !Number.isFinite(Number(autoPayPreview?.amount ?? staffHistory.salaryDue ?? 0))
	                        : !paymentAmount)
	                    }
	                  className={`flex items-center justify-center gap-2 transition-colors p-4 rounded-xl w-full text-white font-bold text-base shadow
	                    ${
	                      autoActive
	                        ? 'bg-gray-300 cursor-not-allowed'
	                        : (paymentAmount || autoPaymentEnabled
                            ? 'bg-gradient-to-r from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600'
                            : 'bg-gray-300 cursor-not-allowed')
                    }`}
                  title={autoActive ? t('Manual payments are disabled while auto payroll is active.') : ''}
                >
                  <Save size={22}/>
                  {autoActive ? t('Auto payroll active — manual disabled') : t('Save Payment')}
                </button>
              </>
            );
          })()}
        </>
        )}
      </Modal>
      )}
      {/* ---------------------- END PAYMENT MODAL ---------------------- */}

      {/* ---------------------- END PAYMENT MODAL ---------------------- */}
    </div>
  );
};

export default Staff;
