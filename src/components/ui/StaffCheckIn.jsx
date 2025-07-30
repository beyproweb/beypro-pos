import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { QRCodeCanvas } from 'qrcode.react';
import axios from 'axios';
import { Toaster, toast } from 'react-hot-toast';
import { useTranslation } from "react-i18next";

// Global scanner instance
let html5QrcodeScannerInstance = null;

const StaffCheckIn = () => {
 const { t } = useTranslation();
  // ----- State -----
  const [status, setStatus] = useState(t('Awaiting Scan')); // Translated initial value

  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [attendanceList, setAttendanceList] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanMode, setScanMode] = useState(''); // Tracks whether the current mode is 'checkin' or 'checkout'
  const [isCameraActive, setIsCameraActive] = useState(false); // Tracks if the camera is active
  const containerRef = useRef(null);
  const [selectedStaffProfile, setSelectedStaffProfile] = useState(null);
  const [filter, setFilter] = useState('day'); // 'day', 'week', 'month'

  // ----- Effects -----
  useEffect(() => {
    fetchStaff();
    fetchAttendance();
  }, []);



  // ----- Scanner Handlers -----
// Start the camera and set the scan mode
const startScanner = (action) => {
  if (html5QrcodeScannerInstance) return;

  setIsCameraActive(true);

  setTimeout(() => {
    const readerElement = document.getElementById('reader');
    if (!readerElement) {
      console.error("HTML Element with id='reader' not found");
      toast.error("Camera not ready. Please try again.");
      return;
    }

    const config = {
      fps: 10,
      qrbox: 250,
      videoConstraints: { facingMode: 'environment' },
    };
    html5QrcodeScannerInstance = new Html5QrcodeScanner('reader', config, false);
    html5QrcodeScannerInstance.render(
      (decodedText) => onScanSuccess(decodedText, action),
      onScanFailure
    );
  }, 100);
};



// Stop the camera
const stopScanner = () => {
  if (html5QrcodeScannerInstance) {
    html5QrcodeScannerInstance.clear()
      .then(() => {
        html5QrcodeScannerInstance = null;
        setIsCameraActive(false);
      })
      .catch((error) => console.error('Failed to clear scanner:', error));
  }
};


  const onScanSuccess = (decodedText, action) => {
  if (isProcessing) return;  // Prevent multiple triggers
  setIsProcessing(true);     // Set processing to true

  const staffId = parseInt(decodedText.trim(), 10);
  if (!isNaN(staffId)) {
    // Immediately stop the scanner to prevent multiple scans
    stopScanner();

    sendCheckInData(staffId, action).finally(() => {
      // Prevent multiple submissions for 2 seconds
      setTimeout(() => setIsProcessing(false), 2000);
    });
  } else {
    toast.error(`Invalid QR code data: ${decodedText}`);
    setIsProcessing(false);
    stopScanner();
  }
};

  const onScanFailure = (error) => {
    // Optionally log errors if needed
    // console.warn('QR Code Scan Error:', error);
  };

  // ----- Check-In/Check-Out Handler -----
  const sendCheckInData = async (staffId, action) => {
  try {
    const payload = {
      staffId: staffId,
      deviceId: 'HurryPOSDevice001',
      wifiVerified: true,
      action: action
    };

    console.log("Sending payload:", payload);

    const { data } = await axios.post(`/api/staff/checkin`, payload);

    if (data.alreadyCheckedIn) {
      toast.error('Already checked in, please check out first!');
      stopScanner();
      return;
    }

    if (data.notCheckedIn) {
      toast.error('Not checked in, please check in first!');
      stopScanner();
      return;
    }

    // Display a simple message for check-in
    if (action === 'checkin') {
      toast.success(`Staff checked in successfully!`);
      setStatus('Checked In');
    }

    // Display duration only after checkout
    if (action === 'checkout' && data.attendance) {
      const lastAttendance = data.attendance;
      if (lastAttendance.check_in_time && lastAttendance.check_out_time) {
        const duration = calculateDuration(lastAttendance.check_in_time, lastAttendance.check_out_time);
        toast.success(`Total Working Time: ${duration}`);
      }
      setStatus('Checked Out');
    }

    // Play sound based on action
    const sound = action === 'checkin' ? '/sounds/checkin.mp3' : '/sounds/checkout.mp3';
    new Audio(sound).play();

    // Fetch updated attendance data
    await fetchAttendance();
    stopScanner();
  } catch (err) {
    console.error('Error response:', err.response?.data);
    toast.error(err.response?.data?.message || 'Error during check-in/out.');
    stopScanner();
  }
};

const deleteStaff = async (staffId) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) return;
    try {
      await axios.delete(`/api/staff/${staffId}`);
      toast.success('Staff member deleted successfully');
      fetchStaff();
      setSelectedStaffProfile(null);
    } catch (err) {
      console.error('Error deleting staff:', err);
      toast.error('Error deleting staff member');
    }
  };

const handleStaffDeletion = () => {
    if (selectedStaffId) deleteStaff(selectedStaffId);
  };

  // ----- Data Fetching -----
  const fetchStaff = async () => {
  try {
    const response = await axios.get(`/api/staff`);
    setStaffList(response.data);
  } catch (err) {
    console.error('Error fetching staff:', err);
    setMessage('Error fetching staff');
  }
};

// Fetch only active (checked-in) staff members
// Fetch active staff (checked-in or checked out within 12 hours)
const fetchActiveStaff = async () => {
  try {
    const response = await axios.get(`/api/staff/attendance`);
    const now = new Date();
    const activeStaff = response.data.filter((record) => {
      const isArchived = record.status === 'archived';
      if (isArchived) return false;

      if (!record.check_out_time) return true; // Checked-in staff
      const checkOutTime = new Date(record.check_out_time);
      const timeDiff = now - checkOutTime;
      return timeDiff <= 12 * 60 * 60 * 1000; // Keep if checked out within 12 hours
    });
    setAttendanceList(activeStaff);
  } catch (err) {
    console.error('Error fetching active staff:', err);
    setMessage('Error fetching active staff');
  }
};



  const fetchAttendance = async () => {
    try {
      const response = await axios.get(`/api/staff/attendance`);
      setAttendanceList(response.data);
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setMessage('Error fetching attendance');
    }
  };

  // ----- Add Staff -----
  const addStaff = async () => {
    if (!name || !role || !phone) {
      setMessage('All fields are required');
      return;
    }
    try {
      const response = await axios.post(`/api/staff`, { name, role, phone });
      setMessage(response.data.message);
      fetchStaff();
      setName('');
      setRole('');
      setPhone('');
    } catch (err) {
      console.error('Error adding staff:', err);
      setMessage('Error adding staff');
    }
  };

  // ----- Helpers: Duration Calculations -----
  // Calculate duration for a single record
  const calculateDuration = (checkInTime, checkOutTime) => {
  const start = new Date(new Date(checkInTime).toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const end = checkOutTime ? new Date(new Date(checkOutTime).toLocaleString("en-US", { timeZone: "Europe/Istanbul" })) : new Date();
  const diffMs = end - start;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};


  // Filter attendance records within the last X days
  const filterAttendanceByDays = (days) => {
    const now = new Date();
    return attendanceList.filter(record => {
      const checkIn = new Date(record.check_in_time);
      return (now - checkIn) <= days * 24 * 60 * 60 * 1000;
    });
  };

  // Calculate total duration (in hours and minutes) for an array of records
  const calculateTotalDuration = (records) => {
    let totalMs = 0;
    records.forEach(record => {
      const start = new Date(record.check_in_time);
      const end = record.check_out_time ? new Date(record.check_out_time) : new Date();
      totalMs += (end - start);
    });
    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  };

  // Compute weekly and monthly totals
  const weeklyRecords = filterAttendanceByDays(7);
  const monthlyRecords = filterAttendanceByDays(30);
  const weeklyTotal = calculateTotalDuration(weeklyRecords);
  const monthlyTotal = calculateTotalDuration(monthlyRecords);


  // Fetch individual staff profile
const fetchStaffProfile = async (staffId, timePeriod) => {
    try {
      const response = await axios.get(`/api/staff/profile/${staffId}?period=${timePeriod}`);
      setSelectedStaffProfile(response.data);
    } catch (err) {
      console.error('Error fetching staff profile:', err);
      toast.error('Failed to load profile');
    }
  };

// Handle dropdown change to view profile
// Handle dropdown change to view profile
const handleStaffSelection = (e) => {
  const staffId = parseInt(e.target.value, 10);
  setSelectedStaffId(staffId);
  fetchStaffProfile(staffId, filter);
};


// Handle filter change (day, week, month)
const handleFilterChange = (period) => {
  setFilter(period);
  if (selectedStaffId) fetchStaffProfile(selectedStaffId, period);
};


  return (
<div className="p-0 w-full h-[calc(100vh-80px)] min-h-screen space-y-5 text-gray-800 dark:text-gray-100 transition-colors mt-12">

    <Toaster position="top-center" reverseOrder={false} />
    {/* Scanner Controls */}
    <div className="flex gap-2">
      <button
        onClick={() => startScanner('checkin')}
        className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg shadow-lg hover:bg-green-600 transition-colors duration-300"
      >
        {t('Check In')}
      </button>
      <button
        onClick={() => startScanner('checkout')}
        className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-lg shadow-lg hover:bg-red-600 transition-colors duration-300"
      >
        {t('Check Out')}
      </button>
    </div>

    {isCameraActive && (
      <div id="reader" style={{ width: '100%' }} ref={containerRef}></div>
    )}
    <p className="mt-4 text-lg font-semibold">{t('Status')}: {status}</p>
    <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">{message}</p>

    <div className="border p-4 rounded-lg shadow bg-white dark:bg-gray-800">
      <h3 className="text-2xl font-semibold mb-4">{t('Generate QR Code / View Profile')}</h3>
      <select
        className="block w-full p-2 border rounded mb-4"
        onChange={handleStaffSelection}
        value={selectedStaffId}
      >
        <option value="">{t('Select Staff')}</option>
        {staffList.map((staff) => (
          <option key={staff.id} value={staff.id}>
            {staff.name} - {staff.role}
          </option>
        ))}
      </select>
      {selectedStaffId && (
        <div className="flex flex-col items-center space-y-4">
          <QRCodeCanvas
            value={String(selectedStaffId)}
            size={256}
            bgColor="#ffffff"
            fgColor="#000000"
            level="H"
            includeMargin={true}
          />
          <p className="text-lg font-medium">{t('QR Code for Staff ID')}: {selectedStaffId}</p>
          <button
            onClick={handleStaffDeletion}
            className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
          >
            {t('Delete Staff')}
          </button>
        </div>
      )}
    </div>

    {selectedStaffProfile?.attendance?.length > 0 ? (
      <ul className="list-disc pl-5">
        {selectedStaffProfile.attendance.map((record, index) => (
          <li key={index} className="text-sm text-gray-700 dark:text-gray-300">
            {new Date(record.check_in_time).toLocaleString()} -
            {record.check_out_time ? new Date(record.check_out_time).toLocaleString() : t('Still Working')}
            <span className="ml-2 text-green-600">
              ({calculateDuration(record.check_in_time, record.check_out_time)})
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p>{t('No attendance records for this period.')}</p>
    )}

    <div className="mt-6">
      <h3 className="text-2xl font-semibold mb-4">{t('Active Staff')}</h3>
      {attendanceList.length > 0 ? (
        <div className="grid gap-4">
          {attendanceList.map((record) => {
            const isActive = !record.check_out_time;
            const cardBg = isActive ? 'bg-green-100 dark:bg-green-900' : 'bg-yellow-100 dark:bg-yellow-800';
            const badgeBg = isActive ? 'bg-green-500' : 'bg-yellow-500';
            const badgeText = isActive ? t('Active') : t('Checked Out (within 12 hrs)');

            const clearStaff = async () => {
              try {
                await axios.put(`/api/staff/attendance/archive/${record.id}`);
                setAttendanceList(attendanceList.filter((item) => item.id !== record.id));
                toast.success(`${record.name} ${t('archived from the list.')}`);
              } catch (err) {
                console.error('❌ Error archiving staff:', err);
                toast.error(t('Failed to archive staff from the list.'));
              }
            };

            return (
              <div key={record.id} className={`p-4 shadow rounded-lg ${cardBg}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xl font-semibold">{record.name}</p>
                    <p className="text-base text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Check-In:</span> {new Date(record.check_in_time).toLocaleString()}
                    </p>
                    {!isActive && (
                      <p className="text-base text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Check-Out:</span> {new Date(record.check_out_time).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">
                      {calculateDuration(record.check_in_time, record.check_out_time)}
                    </p>
                    <p className="text-sm text-gray-500">{t('Session Duration')}</p>
                    <span className={`px-3 py-1 text-xs font-semibold text-white rounded-full ${badgeBg}`}>
                      {badgeText}
                    </span>
                    {!isActive && (
                      <button
                        onClick={clearStaff}
                        className="mt-1 px-1 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                      >
                        {t('Clear')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500">{t('No active staff currently.')}</p>
      )}
    </div>

    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="p-4 bg-white dark:bg-gray-800 shadow rounded-lg text-center">
        <h4 className="text-xl font-bold mb-2">{t('Weekly Total')}</h4>
        <p className="text-2xl font-semibold text-green-600">
          {weeklyTotal.hours}h {weeklyTotal.minutes}m
        </p>
        <p className="text-sm text-gray-500">{t('Last 7 Days')}</p>
      </div>
      <div className="p-4 bg-white dark:bg-gray-800 shadow rounded-lg text-center">
        <h4 className="text-xl font-bold mb-2">{t('Monthly Total')}</h4>
        <p className="text-2xl font-semibold text-green-600">
          {monthlyTotal.hours}h {monthlyTotal.minutes}m
        </p>
        <p className="text-sm text-gray-500">{t('Last 30 Days')}</p>
      </div>
    </div>
  </div>
);



};

export default StaffCheckIn;
