import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import secureFetch from "../../utils/secureFetch";
import { Toaster, toast } from "react-hot-toast";

export default function StandaloneStaffCheckInPage() {
  const { currentUser, setCurrentUser } = useAuth();
  const location = useLocation();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [matchedStaff, setMatchedStaff] = useState(null);
  const [profileStaff, setProfileStaff] = useState(null);
  const [attendanceStatus, setAttendanceStatus] = useState("unknown"); // checked_in | checked_out | unknown
  const LAST_STAFF_KEY = "beypro:last_staff_checkin";

  const DEFAULT_AVATAR =
    "https://www.pngkey.com/png/full/115-1150152_default-profile-picture-avatar-png-green.png";

  const getAvatar = (url) => {
    if (!url) return DEFAULT_AVATAR;
    if (url.startsWith("http://localhost") || url.startsWith("/uploads/"))
      return DEFAULT_AVATAR;
    if (url.startsWith("http")) return url;
    return DEFAULT_AVATAR;
  };

  const getDisplayValue = (value) => {
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  };

  const selectedStaffId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const staffId = params.get("staffId");
    return staffId ? String(staffId) : "";
  }, [location.search]);

  const getRestaurantId = () =>
    currentUser?.restaurant_id || localStorage.getItem("restaurant_id") || "";

  const loadProfileAndStatus = async (staffId, fallbackStaff = null) => {
    if (!staffId) return "unknown";
    let fullStaff = null;
    try {
      const fullList = await secureFetch("/staff");
      fullStaff = Array.isArray(fullList)
        ? fullList.find((s) => String(s.id) === String(staffId))
        : null;
    } catch {
      fullStaff = null;
    }

    const resolvedStaff = fullStaff || fallbackStaff || null;
    if (resolvedStaff) {
      setProfileStaff(resolvedStaff);
      setMatchedStaff((prev) => prev || resolvedStaff);
    }

    try {
      const attendance = await secureFetch(`/staff/${staffId}/attendance`);
      const latest = Array.isArray(attendance) ? attendance[0] : null;
      const status =
        latest && !latest.check_out_time ? "checked_in" : "checked_out";
      setAttendanceStatus(status);
      return status;
    } catch {
      setAttendanceStatus("unknown");
      return "unknown";
    }
  };

  useEffect(() => {
    const storedStaffId =
      selectedStaffId ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem(LAST_STAFF_KEY)
        : "");
    if (!storedStaffId) return;
    loadProfileAndStatus(storedStaffId);
  }, [selectedStaffId]);

  const handleAction = async (action) => {
    if (!pin.trim()) {
      toast.error("PIN is required");
      return;
    }
    const restaurantId = getRestaurantId();
    if (!restaurantId) {
      toast.error("Restaurant not configured");
      return;
    }
    setLoading(true);
    try {
      const login = await secureFetch("/staff/login", {
        method: "POST",
        body: JSON.stringify({ pin: pin.trim(), restaurant_id: restaurantId }),
      });

      if (!login?.success || !login?.staff?.id) {
        throw new Error(login?.error || "Invalid PIN");
      }

      const staff = login.staff;
      setMatchedStaff(staff);
      setCurrentUser((prev) => ({
        ...(prev || {}),
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role || prev?.role || "staff",
        restaurant_id: staff.restaurant_id || prev?.restaurant_id,
        permissions: Array.isArray(staff.permissions)
          ? staff.permissions
          : prev?.permissions || [],
      }));

      try {
        sessionStorage.setItem(LAST_STAFF_KEY, String(staff.id));
      } catch {}

      const currentStatus = await loadProfileAndStatus(staff.id, staff);

      if (selectedStaffId && String(staff.id) !== String(selectedStaffId)) {
        throw new Error("PIN does not match selected staff");
      }

      if (action === "checkin" && currentStatus === "checked_in") {
        toast.error("Already checked in");
        return;
      }
      if (action === "checkout" && currentStatus !== "checked_in") {
        toast.error("Not checked in");
        return;
      }

      await secureFetch("/staff/checkin", {
        method: "POST",
        body: JSON.stringify({
          staffId: staff.id,
          action,
          deviceId: "standalone-pin",
        }),
      });

      toast.success(
        `${action === "checkin" ? "Checked in" : "Checked out"}: ${staff.name}`
      );
      setPin("");
      setAttendanceStatus(action === "checkin" ? "checked_in" : "checked_out");
    } catch (err) {
      toast.error(err?.message || "Failed to submit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-8">
      <Toaster position="top-center" />
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Staff Check-In / Check-Out
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Enter PIN to check in or check out.
        </p>

        {profileStaff || matchedStaff ? (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
            Matched staff:{" "}
            <span className="font-semibold">
              {(profileStaff || matchedStaff)?.name}
            </span>{" "}
            ({(profileStaff || matchedStaff)?.role})
          </div>
        ) : null}
        {(profileStaff || matchedStaff) && (
          <div className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Status -{" "}
            <span
              className={
                attendanceStatus === "checked_in"
                  ? "text-emerald-600"
                  : attendanceStatus === "checked_out"
                  ? "text-rose-600"
                  : "text-slate-500"
              }
            >
              {attendanceStatus === "checked_in"
                ? "Checked in!"
                : attendanceStatus === "checked_out"
                ? "Checked out!"
                : "Unknown"}
            </span>
          </div>
        )}

        <div className="mt-6">
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            PIN
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-800 dark:text-slate-100"
            placeholder="Enter PIN"
            disabled={loading}
          />
        </div>

        <div className="mt-6 flex gap-4">
          <button
            type="button"
            disabled={loading || attendanceStatus === "checked_in"}
            onClick={() => handleAction("checkin")}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
          >
            Check In
          </button>
          <button
            type="button"
            disabled={loading || attendanceStatus !== "checked_in"}
            onClick={() => handleAction("checkout")}
            className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition disabled:opacity-60"
          >
            Check Out
          </button>
        </div>
        {profileStaff && (
          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-5">
            <div className="flex items-center gap-4 mb-4">
              <img
                src={getAvatar(profileStaff.avatar)}
                alt={profileStaff.name}
                className="w-14 h-14 rounded-full border border-slate-300 dark:border-slate-600 object-cover"
              />
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {getDisplayValue(profileStaff.name)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {getDisplayValue(profileStaff.role)}
                </p>
              </div>
            </div>
            <div className="grid gap-y-2 gap-x-4 text-sm sm:grid-cols-2">
              <div className="text-slate-500 dark:text-slate-400">Staff ID</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.id)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Phone</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.phone)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Email</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.email)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Address</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.address)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Salary</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.salary)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Salary Model</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.salary_model)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Payment Type</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.payment_type)}
              </div>
              <div className="text-slate-500 dark:text-slate-400">Hourly Rate</div>
              <div className="text-slate-900 dark:text-white">
                {getDisplayValue(profileStaff.hourly_rate)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
