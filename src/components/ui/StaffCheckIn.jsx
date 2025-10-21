import React, { useState, useEffect, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeCanvas } from "qrcode.react";
import { Toaster, toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

let html5QrcodeScannerInstance = null;

const StaffCheckIn = () => {
  const { t } = useTranslation();

  const [status, setStatus] = useState(t("Awaiting Scan"));
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [staffList, setStaffList] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [attendanceList, setAttendanceList] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanMode, setScanMode] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const containerRef = useRef(null);
  const [selectedStaffProfile, setSelectedStaffProfile] = useState(null);
  const [filter, setFilter] = useState("day");

  useEffect(() => {
    fetchStaff();
    fetchAttendance();
  }, []);

  const startScanner = (action) => {
    if (html5QrcodeScannerInstance) return;
    setIsCameraActive(true);
    setTimeout(() => {
      const readerElement = document.getElementById("reader");
      if (!readerElement) {
        toast.error("Camera not ready. Please try again.");
        return;
      }
      const config = { fps: 10, qrbox: 250, videoConstraints: { facingMode: "environment" } };
      html5QrcodeScannerInstance = new Html5QrcodeScanner("reader", config, false);
      html5QrcodeScannerInstance.render(
        (decodedText) => onScanSuccess(decodedText, action),
        onScanFailure
      );
    }, 100);
  };

  const stopScanner = () => {
    if (html5QrcodeScannerInstance) {
      html5QrcodeScannerInstance
        .clear()
        .then(() => {
          html5QrcodeScannerInstance = null;
          setIsCameraActive(false);
        })
        .catch((err) => console.error("Failed to clear scanner:", err));
    }
  };

  const onScanSuccess = (decodedText, action) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const staffId = parseInt(decodedText.trim(), 10);
    if (!isNaN(staffId)) {
      stopScanner();
      sendCheckInData(staffId, action).finally(() =>
        setTimeout(() => setIsProcessing(false), 2000)
      );
    } else {
      toast.error(`Invalid QR code data: ${decodedText}`);
      setIsProcessing(false);
      stopScanner();
    }
  };
  const onScanFailure = () => {};

  const sendCheckInData = async (staffId, action) => {
    try {
      const payload = {
        staffId,
        deviceId: "BeyproDevice001",
        wifiVerified: true,
        action,
      };
      const data = await secureFetch("/staff/checkin", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.alreadyCheckedIn) {
        toast.error("Already checked in, please check out first!");
        return;
      }
      if (data.notCheckedIn) {
        toast.error("Not checked in, please check in first!");
        return;
      }

      if (action === "checkin") {
        toast.success("Staff checked in successfully!");
        setStatus("Checked In");
      } else if (action === "checkout" && data.attendance) {
        const last = data.attendance;
        if (last.check_in_time && last.check_out_time) {
          const duration = calculateDuration(last.check_in_time, last.check_out_time);
          toast.success(`Total Working Time: ${duration}`);
        }
        setStatus("Checked Out");
      }

      const sound = action === "checkin" ? "/sounds/checkin.mp3" : "/sounds/checkout.mp3";
      new Audio(sound).play();

      await fetchAttendance();
      stopScanner();
    } catch (err) {
      console.error("❌ Error during check-in/out:", err);
      toast.error("Error during check-in/out.");
      stopScanner();
    }
  };

  const deleteStaff = async (staffId) => {
    if (!window.confirm("Are you sure you want to delete this staff member?")) return;
    try {
      await secureFetch(`/staff/${staffId}`, { method: "DELETE" });
      toast.success("Staff member deleted successfully");
      fetchStaff();
      setSelectedStaffProfile(null);
    } catch (err) {
      console.error("❌ Error deleting staff:", err);
      toast.error("Error deleting staff member");
    }
  };

  const handleStaffDeletion = () => {
    if (selectedStaffId) deleteStaff(selectedStaffId);
  };

  const fetchStaff = async () => {
    try {
      const data = await secureFetch("/staff");
      setStaffList(data);
    } catch (err) {
      console.error("❌ Error fetching staff:", err);
      setMessage("Error fetching staff");
    }
  };

  const fetchAttendance = async () => {
    try {
      const data = await secureFetch("/staff/attendance");
      setAttendanceList(data);
    } catch (err) {
      console.error("❌ Error fetching attendance:", err);
      setMessage("Error fetching attendance");
    }
  };

  const addStaff = async () => {
    if (!name || !role || !phone) {
      setMessage("All fields are required");
      return;
    }
    try {
      await secureFetch("/staff", {
        method: "POST",
        body: JSON.stringify({ name, role, phone }),
      });
      setMessage("Staff added successfully");
      fetchStaff();
      setName("");
      setRole("");
      setPhone("");
    } catch (err) {
      console.error("❌ Error adding staff:", err);
      setMessage("Error adding staff");
    }
  };

  const calculateDuration = (checkInTime, checkOutTime) => {
    const start = new Date(
      new Date(checkInTime).toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
    );
    const end = checkOutTime
      ? new Date(
          new Date(checkOutTime).toLocaleString("en-US", { timeZone: "Europe/Istanbul" })
        )
      : new Date();
    const diffMs = end - start;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const filterAttendanceByDays = (days) => {
    const now = new Date();
    return attendanceList.filter((r) => now - new Date(r.check_in_time) <= days * 86400000);
  };

  const calculateTotalDuration = (records) => {
    let totalMs = 0;
    records.forEach((r) => {
      const start = new Date(r.check_in_time);
      const end = r.check_out_time ? new Date(r.check_out_time) : new Date();
      totalMs += end - start;
    });
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    return { hours, minutes };
  };

  const weeklyTotal = calculateTotalDuration(filterAttendanceByDays(7));
  const monthlyTotal = calculateTotalDuration(filterAttendanceByDays(30));

  const handleArchive = async (recordId, name) => {
    try {
      await secureFetch(`/staff/attendance/archive/${recordId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "archived" }),
      });
      setAttendanceList(attendanceList.filter((i) => i.id !== recordId));
      toast.success(`${name} ${t("archived from the list.")}`);
    } catch (err) {
      console.error("❌ Error archiving staff:", err);
      toast.error(t("Failed to archive staff from the list."));
    }
  };

  return (
    <div className="p-0 w-full h-[calc(100vh-80px)] min-h-screen space-y-5 text-gray-800 dark:text-gray-100 transition-colors mt-12">
      <Toaster position="top-center" />
      <div className="flex gap-2">
        <button
          onClick={() => startScanner("checkin")}
          className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg shadow-lg hover:bg-green-600 transition-colors duration-300"
        >
          {t("Check In")}
        </button>
        <button
          onClick={() => startScanner("checkout")}
          className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-700 text-white rounded-lg shadow-lg hover:bg-red-600 transition-colors duration-300"
        >
          {t("Check Out")}
        </button>
      </div>

      {isCameraActive && <div id="reader" style={{ width: "100%" }} ref={containerRef}></div>}

      <p className="mt-4 text-lg font-semibold">
        {t("Status")}: {status}
      </p>
      <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">{message}</p>

      <div className="border p-4 rounded-lg shadow bg-white dark:bg-gray-800">
        <h3 className="text-2xl font-semibold mb-4">
          {t("Generate QR Code / View Profile")}
        </h3>
        <select
          className="block w-full p-2 border rounded mb-4"
          onChange={(e) => setSelectedStaffId(parseInt(e.target.value, 10))}
          value={selectedStaffId}
        >
          <option value="">{t("Select Staff")}</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} - {s.role}
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
              includeMargin
            />
            <p className="text-lg font-medium">
              {t("QR Code for Staff ID")}: {selectedStaffId}
            </p>
            <button
              onClick={handleStaffDeletion}
              className="mt-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
            >
              {t("Delete Staff")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-2xl font-semibold mb-4">{t("Active Staff")}</h3>
        {attendanceList.length > 0 ? (
          <div className="grid gap-4">
            {attendanceList.map((r) => {
              const active = !r.check_out_time;
              const bg = active
                ? "bg-green-100 dark:bg-green-900"
                : "bg-yellow-100 dark:bg-yellow-800";
              const badge = active ? "bg-green-500" : "bg-yellow-500";
              const text = active ? t("Active") : t("Checked Out (within 12 hrs)");
              return (
                <div key={r.id} className={`p-4 shadow rounded-lg ${bg}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xl font-semibold">{r.name}</p>
                      <p className="text-base text-gray-700 dark:text-gray-300">
                        <span className="font-medium">Check-In:</span>{" "}
                        {new Date(r.check_in_time).toLocaleString()}
                      </p>
                      {!active && (
                        <p className="text-base text-gray-700 dark:text-gray-300">
                          <span className="font-medium">Check-Out:</span>{" "}
                          {new Date(r.check_out_time).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">
                        {calculateDuration(r.check_in_time, r.check_out_time)}
                      </p>
                      <p className="text-sm text-gray-500">{t("Session Duration")}</p>
                      <span
                        className={`px-3 py-1 text-xs font-semibold text-white rounded-full ${badge}`}
                      >
                        {text}
                      </span>
                      {!active && (
                        <button
                          onClick={() => handleArchive(r.id, r.name)}
                          className="mt-1 px-1 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                        >
                          {t("Clear")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500">{t("No active staff currently.")}</p>
        )}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="p-4 bg-white dark:bg-gray-800 shadow rounded-lg text-center">
          <h4 className="text-xl font-bold mb-2">{t("Weekly Total")}</h4>
          <p className="text-2xl font-semibold text-green-600">
            {weeklyTotal.hours}h {weeklyTotal.minutes}m
          </p>
          <p className="text-sm text-gray-500">{t("Last 7 Days")}</p>
        </div>
        <div className="p-4 bg-white dark:bg-gray-800 shadow rounded-lg text-center">
          <h4 className="text-xl font-bold mb-2">{t("Monthly Total")}</h4>
          <p className="text-2xl font-semibold text-green-600">
            {monthlyTotal.hours}h {monthlyTotal.minutes}m
          </p>
          <p className="text-sm text-gray-500">{t("Last 30 Days")}</p>
        </div>
      </div>
    </div>
  );
};

export default StaffCheckIn;
