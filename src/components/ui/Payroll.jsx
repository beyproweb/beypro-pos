// Payroll.jsx - 2025-07-25 - Fullscreen, Larger Font, Lighter Colors, Pro UI
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from 'react-modal';
import { Toaster, toast } from 'react-hot-toast';
import { Plus, Save, Download } from 'lucide-react';
import { useTranslation } from "react-i18next";
const API_URL = import.meta.env.VITE_API_URL || "";



const currency = (amt) => `₺${parseFloat(amt || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
const dateStr = (d) => new Date(d).toLocaleDateString('tr-TR');
const timeStr = (h, m) => `${h}h ${m}min`;

function calcDueHistory(totalSalaryDue, payments = []) {
  let due = totalSalaryDue || 0;
  const out = [];
  payments.slice().reverse().forEach(p => {
    out.push({ ...p, dueAfter: due });
    due = due + (p.amount || 0) * -1;
  });
  return out.reverse();
}

const DEFAULT_AVATAR = 'https://www.pngkey.com/png/full/115-1150152_default-profile-picture-avatar-png-green.png';

const getAvatar = (url) => {
  if (!url) return DEFAULT_AVATAR;
  if (url.startsWith('http://localhost') || url.startsWith('/uploads/')) return DEFAULT_AVATAR;
  if (url.startsWith('http')) return url;
  return DEFAULT_AVATAR;
};


const StaffCard = ({ staff, staffHistory, onExport }) => {
  const { t } = useTranslation();
  const history = staffHistory || {};
  const breakdown = Array.isArray(history.weeklyCheck) ? history.weeklyCheck : [];
  const paymentRows = calcDueHistory(history.totalSalaryDue, history.paymentHistory);

  return (
    <div className="w-full rounded-3xl shadow-2xl p-0 mb-18 overflow-hidden bg-gradient-to-tr from-blue-100 via-blue-50 to-white dark:from-blue-950 dark:via-slate-900 dark:to-purple-950">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 items-center p-8 bg-gradient-to-br from-blue-200 via-blue-100 to-blue-50 dark:from-blue-900 dark:via-purple-900 dark:to-slate-900">
       <img src={getAvatar(staff.avatar)} alt="" className="w-20 h-20 rounded-full border-4 border-white shadow-lg"/>
        <div>
          <div className="flex gap-3 items-center">
            <h2 className="text-3xl font-extrabold text-blue-900 dark:text-white tracking-tight">{staff.name}</h2>
            <span className="bg-gradient-to-r from-blue-300 to-blue-400 px-3 py-1 rounded-full text-base font-semibold text-blue-900 shadow">{staff.role}</span>
          </div>
          <p className="text-blue-600 mt-2 text-base">{staff.email}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onExport} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-200 hover:bg-blue-300 text-blue-900 font-bold shadow text-base">
            <Download size={18}/> {t('Export')}
          </button>
        </div>
      </div>
      {/* Salary Progress & Summary */}
      <div className="p-8 flex flex-col lg:flex-row gap-8 justify-between bg-white/60 dark:bg-slate-900">
        {/* Salary Bar */}
        <div className="flex-1">
          <h3 className="text-xl font-bold text-blue-700 mb-1">{t('Salary Progress')}</h3>
          <div className="flex gap-2 mb-2 flex-wrap">
            <span className="bg-blue-200 text-blue-900 px-3 py-1 rounded text-base">{t('Paid')}: {currency(history.salaryPaid)}</span>
            <span className="bg-orange-100 text-orange-900 px-3 py-1 rounded text-base">{t('Due')}: {currency(history.salaryDue)}</span>
            <span className="bg-gray-100 text-gray-900 px-3 py-1 rounded text-base">{t('Total')}: {currency(history.totalSalaryDue)}</span>
          </div>
          <div className="relative w-full h-6 bg-blue-100 rounded-full overflow-hidden shadow-inner">
            <div className="absolute h-6 bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-700"
              style={{width: history.totalSalaryDue > 0 ? `${Math.min((history.salaryPaid/history.totalSalaryDue)*100,100)}%` : '0%'}}></div>
          </div>
          <div className="mt-1 text-right text-base text-blue-600 font-semibold">
            {history.totalSalaryDue > 0
              ? `${Math.min((history.salaryPaid/history.totalSalaryDue)*100,100).toFixed(0)}% paid`
              : t('No payment data')}
          </div>
        </div>
        {/* Salary Details */}
        <div className="flex-1 mt-6 lg:mt-0 text-base text-blue-800 grid grid-cols-2 gap-3">
          <span>{t('Model')}:</span>
          <span className="font-semibold">{history.salaryModel === 'hourly'
            ? t('Hourly') : history.payment_type === 'weekly'
            ? t('Weekly') : t('Monthly')}</span>
          <span>{t('Hourly Rate')}:</span>
          <span>{currency(history.hourlyRate)}</span>
          <span>{t('Weekly Salary')}:</span>
          <span>{currency(history.weeklySalary)}</span>
          <span>{t('Monthly Salary')}:</span>
          <span>{currency(history.monthlySalary)}</span>
          <span>{t('Earned This Week')}:</span>
          <span className="font-bold text-green-600">{currency(history.earnedThisWeek)}</span>
          <span>{t('Shifts')}:</span>
          <span>{(history.shifts?.attended ?? 0)} / {(history.shifts?.total ?? 0)} ({(history.shifts?.percentage ?? 0)}%)</span>
        </div>
      </div>
      {/* Attendance - vertical stack for full width */}
      <div className="bg-white dark:bg-slate-950 p-8 grid grid-cols-1 gap-8">
        <div>
          <h4 className="font-extrabold text-xl text-blue-700 mb-3">{t('Attendance This Week')}</h4>
          <div className="mb-2 flex flex-wrap gap-2">
            <span className="bg-blue-300 text-blue-900 px-3 py-1 rounded-full text-base">{t('Attended')}: {history.shifts?.attended ?? 0}/{history.shifts?.total ?? 0}</span>
            <span className="bg-blue-200 text-blue-900 px-3 py-1 rounded-full text-base">{history.weeklyHours}h</span>
            <span className="bg-green-200 text-green-900 px-3 py-1 rounded-full text-base">{t('Paid')}: {((history.totalMinutesThisWeek??0)/60).toFixed(2)}h</span>
          </div>
          <div className="space-y-1 text-base mb-4">
            <div className="flex justify-between">
              <span className="text-blue-700">{t('Late')}</span>
              <span className="font-bold text-red-500">{history.latency?.checkinLateMinutes ?? 0} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">{t('Early Checkout')}</span>
              <span className="font-bold text-orange-600">{history.earlyCheckoutMinutes ?? 0} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">{t('Absent')}</span>
              <span className="font-bold text-yellow-600">{history.latency?.absentMinutes ?? 0} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">{t('Total Penalty')}</span>
              <span className="font-bold text-yellow-500">{history.latency?.totalMinutes ?? 0} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-700">{t('Overtime')}</span>
              <span className="font-bold text-green-600">{history.overtimePendingApproval && history.timeDifferenceMinutes > 0
                ? history.timeDifferenceFormatted : '-'}</span>
            </div>
          </div>
          {/* Detailed Attendance */}
          <div>
            <h4 className="font-extrabold text-xl text-blue-700 mb-3">{t('Detailed Attendance')}</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-base bg-white dark:bg-slate-900 rounded-xl overflow-hidden">
                <thead>
                  <tr className="text-blue-700 font-bold bg-blue-100 dark:bg-slate-900 text-left">
                    <th className="p-3">{t('Day')}</th>
                    <th className="p-3">{t('Date')}</th>
                    <th className="p-3">{t('Scheduled')}</th>
                    <th className="p-3">{t('Attended')}</th>
                    <th className="p-3">{t('Late')}</th>
                    <th className="p-3">{t('Early Out')}</th>
                    <th className="p-3">{t('Total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row, i) => (
                    <tr key={i} className={`text-blue-900 ${i%2?'bg-blue-50':'bg-white'}`}>
                      <td className="p-3 font-bold">{row.day}</td>
                      <td className="p-3">{row.date}</td>
                      <td className="p-3">{row.schedule}</td>
                      <td className="p-3">
                        {row.sessions.length > 0
                          ? row.sessions.map((s,j)=>(
                            <div key={j}>
                              {new Date(s.check_in_time).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})}
                              {" - "}
                              {s.check_out_time
                                ? new Date(s.check_out_time).toLocaleTimeString('tr-TR', {hour: '2-digit', minute: '2-digit'})
                                : <span className="text-orange-600">...</span>}
                            </div>))
                          : <span className="text-red-400">{t('Absent')}</span>}
                      </td>
                      <td className="p-3">{row.latency?.join(', ') || '-'}</td>
                      <td className="p-3">{row.earlyCheckout?.filter(Boolean).join(', ') || '-'}</td>
                      <td className="p-3">{row.totalTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {/* Payment History */}
      <div className="bg-blue-50 dark:bg-slate-950 p-8 mt-4 rounded-b-2xl">
        <h4 className="font-extrabold text-xl text-blue-700 mb-3">{t('💳 Payment History')}</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-base">
            <thead>
              <tr className="text-blue-700 font-bold bg-blue-100 dark:bg-slate-900 text-left">
                <th className="p-3">{t('Date')}</th>
                <th className="p-3">{t('Amount')}</th>
                <th className="p-3">{t('Method')}</th>
                <th className="p-3">{t('Note')}</th>
                <th className="p-3">{t('Due After Payment')}</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(paymentRows) && paymentRows.length > 0 ? paymentRows.map((pay, i) => (
                <tr key={i} className="text-blue-900 odd:bg-white even:bg-blue-50">
                  <td className="p-3">{dateStr(pay.payment_date)}</td>
                  <td className="p-3">{currency(pay.amount)}</td>
                  <td className="p-3">{pay.payment_method || '-'}</td>
                  <td className="p-3">{pay.note || '-'}</td>
                  <td className="p-3">{currency(pay.dueAfter)}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="p-3 text-blue-400">{t('No payment records')}</td></tr>
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
  const [paymentAmount, setPaymentAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [autoPaymentEnabled, setAutoPaymentEnabled] = useState(false);
  const [autoPaymentDate, setAutoPaymentDate] = useState('');
  const [repeatType, setRepeatType] = useState('none');
  const [repeatTime, setRepeatTime] = useState('09:00');
  const [searchQuery, setSearchQuery] = useState('');

  // Date filtering (current week)
  const getMonday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(now);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
  };
  const getSunday = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - (day === 0 ? 6 : day - 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return sunday.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState(getMonday());
  const [endDate, setEndDate] = useState(getSunday());

  // Fetch staff on mount
  useEffect(() => {
    axios.get(`${API_URL}/api/staff`).then(res => setStaffList(res.data));
  }, []);

  // Handle staff selection + fetch their payroll
  const fetchStaffHistory = async (staffId) => {
    setSelectedStaff(staffId);
    if (!staffId) { setStaffHistory({}); return; }
    try {
      const [payroll, payments] = await Promise.all([
        axios.get(`${API_URL}/api/staff/${staffId}/payroll?startDate=${startDate}&endDate=${endDate}`),
        axios.get(`${API_URL}/api/staff/${staffId}/payments`)
      ]);
      setStaffHistory({
        ...payroll.data.payroll,
        paymentHistory: payments.data
      });
    } catch (err) {
      toast.error(t('Failed to fetch payroll data'));
    }
  };

  useEffect(() => {
    if (selectedStaff) fetchStaffHistory(selectedStaff);
  }, [selectedStaff, startDate, endDate]);

  // Export payroll as CSV
  const exportPayroll = () => {
    const staff = staffList.find(s => s.id === selectedStaff);
    if (!staff || !staffHistory.weeklyCheck) return toast.error('No data');
    const rows = [
      ['Day', 'Date', 'Scheduled', 'Attended', 'Late', 'Early Out', 'Total'],
      ...staffHistory.weeklyCheck.map(row => [
        row.day, row.date, row.schedule,
        row.sessions.length > 0 ? '✔' : 'Absent',
        (row.latency||[]).join(';'),
        (row.earlyCheckout||[]).filter(Boolean).join(';'),
        row.totalTime
      ])
    ];
    const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${staff.name}-payroll.csv`;
    a.click();
  };

  // Payment modal handler
  const handlePayment = async () => {
    if (!selectedStaff) return toast.error('Select staff');
    const amt = parseFloat(paymentAmount);
    if (!amt && !autoPaymentEnabled) return toast.error('Enter amount or enable auto');
    try {
      await axios.post(`${API_URL}/api/staff/${selectedStaff}/payments`, {
        amount: amt,
        date: new Date().toISOString().slice(0,10),
        note,
        payment_method: paymentMethod,
        auto: autoPaymentEnabled,
        scheduled_date: autoPaymentEnabled ? autoPaymentDate : null,
        repeat_type: repeatType,
        repeat_time: repeatTime
      });
      toast.success('Payment saved!');
      setIsModalOpen(false);
      setPaymentAmount('');
      setNote('');
      fetchStaffHistory(selectedStaff);
    } catch {
      toast.error('Failed to save payment');
    }
  };

  // Search filter
  useEffect(() => {
    if (searchQuery.trim() && staffList.length > 0) {
      const found = staffList.find(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (found) {
        setSelectedStaff(found.id);
      }
    }
  }, [searchQuery, staffList]);

  return (
<div className="min-h-screen w-full bg-transparent text-blue-900 dark:text-slate-100 pb-12 text-base">
      {/* Top Bar */}
<div className="w-full px-8 py-8 flex flex-col md:flex-row gap-6 items-center justify-between bg-transparent">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select className="p-4 rounded-lg border border-gray-300 bg-white shadow text-blue-900 dark:bg-slate-800 dark:text-slate-100 text-base"
            value={selectedStaff || ''}
            onChange={e => fetchStaffHistory(Number(e.target.value))}
          >
            <option value="">{t('Select Staff')}</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
          <input
            type="text"
            placeholder={t("Search staff...")}
            value={searchQuery}
            onChange={e=>setSearchQuery(e.target.value)}
            className="p-4 rounded-lg border border-gray-300 bg-white shadow w-full md:w-1/3 text-base text-blue-900 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <label className="text-base">{t('From')}</label>
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="rounded-lg p-3 border bg-white text-base dark:bg-slate-800 dark:text-slate-100"/>
          <label className="text-base">{t('To')}</label>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="rounded-lg p-3 border bg-white text-base dark:bg-slate-800 dark:text-slate-100"/>
        </div>
      </div>
      {/* Main content */}
      <div className="flex flex-col px-2 py-8">
        {selectedStaff && staffList.length > 0 && (
          <StaffCard
            staff={staffList.find(s=>s.id===selectedStaff)}
            staffHistory={staffHistory}
            onExport={exportPayroll}
          />
        )}
      </div>

      <Toaster/>
    </div>
  );
};

export default Payroll;
