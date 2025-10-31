import React, { useState, useEffect } from 'react';
import StaffCheckIn from '../components/ui/StaffCheckIn';
import StaffSchedule from '../components/ui/StaffSchedule';
import Payroll from '../components/ui/Payroll';

import Modal from 'react-modal';
import { Toaster, toast } from 'react-hot-toast';
import { Plus, Save } from 'lucide-react';
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
const API_URL = import.meta.env.VITE_API_URL || "";
Modal.setAppElement('#root');

// Helper for ₺ currency formatting
const currency = (amt) => `₺${parseFloat(amt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;

const Staff = () => {
  const { t } = useTranslation();
  const [savedAutoPayment, setSavedAutoPayment] = useState(null);

  const [activeTab, setActiveTab] = useState(0);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [isSendShiftModalOpen, setIsSendShiftModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [id, setId] = useState('');
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

  // ✅ Add new staff
  const addStaff = async () => {
    if (!name || !role || !phone || !id || !address || !salary || !email) {
      toast.error("All fields are required");
      return;
    }
    try {
      await secureFetch("/staff", {
        method: "POST",
        body: JSON.stringify({
          id,
          name,
          role,
          phone,
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
      setName(""); setRole(""); setPhone(""); setId(""); setAddress("");
      setSalary(""); setEmail(""); setPaymentType("daily"); setSalaryModel("fixed"); setHourlyRate("");
      setShowAddStaff(false);
      const res = await secureFetch("/staff");
      setStaffList(res);
    } catch (err) {
      toast.error("Please enter a valid numeric ID");
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
    const amt = parseFloat(paymentAmount);
    if (!amt && !autoPaymentEnabled) return toast.error("Enter amount or enable auto");
    try {
      await secureFetch(`/staff/${selectedStaffForPayment}/payments`, {
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
      setAutoPaymentEnabled(false);
      setAutoPaymentDate("");
      setRepeatType("none");
      setRepeatTime("09:00");
      setSelectedStaffForPayment("");
      setStaffHistory({});
      setSavedAutoPayment(null);

    } catch {
      toast.error("Failed to save payment");
    }
  };

  const tabs = [
    { title: t("Check-In/Check-Out"), component: <StaffCheckIn /> },
    { title: t("Staff Schedule"), component: <StaffSchedule /> },
    { title: t("Payroll"), component: <Payroll /> },
  ];

  return (
    <div className="p-6 space-y-1 relative dark:bg-900 text-gray-800 dark:text-white text-base transition-colors">
      <Toaster position="top-center" reverseOrder={false} />

<div className="flex justify-center mb-4 w-full">
  <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-7xl">
    {/* Tabs */}
    {tabs.map((tab, index) => (
      <button
        key={index}
        onClick={() => setActiveTab(index)}
        className={`px-6 py-3 min-w-[180px] text-lg rounded-2xl font-semibold shadow transition-all duration-300
          ${activeTab === index
            ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
            : 'bg-gray-300 text-gray-800 hover:bg-blue-400 hover:text-white'}
        `}
      >
        {t(tab.title)}
      </button>
    ))}

    {/* --- SEND SHIFT --- */}
    <button
      onClick={() => setIsSendShiftModalOpen(true)}
      className="px-6 py-3 min-w-[180px] text-lg rounded-2xl font-semibold bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow hover:brightness-110 transition-all"
    >
      {t("Send Shift")}
    </button>

    {/* --- ADD STAFF --- */}
    <button
      onClick={() => setShowAddStaff(!showAddStaff)}
      className="px-6 py-3 min-w-[180px] text-lg rounded-2xl font-semibold bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow hover:brightness-110 transition-all"
    >
      {showAddStaff ? t("Close Add Staff") : t("Add Staff")}
    </button>
    {/* --- ADD PAYMENT BUTTON --- */}
    <button
      onClick={()=>setIsModalOpen(true)}
      className="px-6 py-3 min-w-[180px] text-lg rounded-2xl font-semibold bg-gradient-to-r from-green-400 to-blue-500 text-white shadow hover:brightness-110 transition-all"
    >
      {t("Payment")}
    </button>
  </div>
</div>


      {/* Main Content */}
      <div className="bg-transparent">
        {tabs[activeTab].component}
        <div className="mt-4">{/* Add extra content here if needed */}</div>
      </div>

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 w-96 text-gray-800 dark:text-white">
            <h3 className="text-xl font-bold mb-4">{t("Add New Staff")}</h3>
            <input type="text" placeholder={t("ID")} className="block w-full p-2 border rounded mb-2" value={id} onChange={(e) => setId(e.target.value)} />
            <input type="text" placeholder={t("Name")} className="block w-full p-2 border rounded mb-2" value={name} onChange={(e) => setName(e.target.value)} />
            <input type="text" placeholder={t("Role")} className="block w-full p-2 border rounded mb-2" value={role} onChange={(e) => setRole(e.target.value)} />
            <input type="text" placeholder={t("Phone")} className="block w-full p-2 border rounded mb-2" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">{t("Hourly Rate")} (₺):</label>
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
      {isSendShiftModalOpen && (
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
            return (
              <>
                <div className="mb-4">
                  <p className="text-lg font-semibold text-blue-900 dark:text-slate-100">
                    {staffList.find(s => s.id === selectedStaffForPayment)?.name} – {staffList.find(s => s.id === selectedStaffForPayment)?.role}
                  </p>
                  <p className="text-base text-blue-600 dark:text-slate-300">{t('Salary Due')}: <span className="font-semibold text-red-600">{currency(staffHistory.salaryDue)}</span></p>
                </div>

                {/* Auto Payroll Banner */}
                {autoActive && (
                  <div className="mb-4 p-4 border-2 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 rounded-xl text-yellow-800 dark:text-yellow-200 shadow">
                    <div className="font-bold mb-1">🔁 {t('Auto Payroll Active')}</div>
                    <div className="text-sm">
                      {t('Manual payments are disabled while auto payroll is active.')}
                      {" "}
                      <span className="whitespace-nowrap">
                        {t('Schedule')}: <strong>{repeatLabel}</strong>
                        {savedAutoPayment?.repeat_time ? ` @ ${savedAutoPayment.repeat_time}` : ""}
                      </span>
                      {savedAutoPayment?.scheduled_date && (
                        <span className="whitespace-nowrap"> • {t('Next Run')}: <strong>{savedAutoPayment.scheduled_date}</strong></span>
                      )}
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
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={e=>setPaymentAmount(e.target.value)}
                  placeholder={t('Payment amount (TL)')}
                  disabled={autoActive}
                  className={`p-4 border rounded-lg w-full bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 mb-4 text-base ${autoActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                />

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
                    🔁 {t('Auto Payment Amount')}: <span className="font-semibold">{currency(staffHistory.salaryDue)}</span>
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
                    disabled={autoActive}
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
                  disabled={autoActive || (!paymentAmount && !autoPaymentEnabled)}
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
      {/* ---------------------- END PAYMENT MODAL ---------------------- */}

      {/* ---------------------- END PAYMENT MODAL ---------------------- */}
    </div>
  );
};

export default Staff;
