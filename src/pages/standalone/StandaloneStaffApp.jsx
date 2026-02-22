import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Staff from "../Staff";
import UserManagementPage from "../UserManagementPage";
import StandaloneStaffCheckInPage from "./StandaloneStaffCheckInPage";
import secureFetch, { getAuthToken } from "../../utils/secureFetch";
import { useAuth } from "../../context/AuthContext";
import { useHeader } from "../../context/HeaderContext";
import { normalizeUser } from "../../utils/normalizeUser";
import { useHasPermission } from "../../components/hooks/useHasPermission";

export default function StandaloneStaffApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const { setCurrentUser } = useAuth();
  const { centerNav } = useHeader();
  const canCheckIn = useHasPermission("staff-checkin");
  const canSchedule = useHasPermission("staff-schedule");
  const canPayroll = useHasPermission("staff-payroll");
  const canSendShift = useHasPermission("staff-send-shift");
  const canAddStaff = useHasPermission("staff-add");
  const canPayment = useHasPermission("staff-payment");
  const canStaffPage =
    useHasPermission("staff") ||
    canSchedule ||
    canPayroll ||
    canSendShift ||
    canAddStaff ||
    canPayment;
  const canUserManagement =
    useHasPermission("settings-users") ||
    useHasPermission("user-management") ||
    canAddStaff;

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      const token = getAuthToken();
      if (!token) {
        redirectToMarketing();
        return;
      }
      try {
        const me = await secureFetch("/standalone/auth/me");
        const allowed =
          me?.allowed_modules ||
          me?.user?.allowed_modules ||
          me?.restaurant?.allowed_modules ||
          [];
        if (!Array.isArray(allowed) || !allowed.includes("staff")) {
          redirectToMarketing();
          return;
        }

        let userSettings = {};
        try {
          const usersConfig = await secureFetch("/settings/users");
          userSettings = usersConfig || {};
        } catch {
          userSettings = {};
        }

        // Prime auth context with standalone user + permissions
        const baseUser =
          me?.user ||
          me?.staff ||
          (me && typeof me === "object" && !Array.isArray(me) ? me : null) ||
          {};
        const normalizedUser = normalizeUser(
          {
            ...baseUser,
            token: token,
            allowed_modules: allowed,
            role: baseUser.role || "admin",
            permissions: Array.isArray(baseUser.permissions)
              ? baseUser.permissions
              : [],
          },
          userSettings
        );
        try {
          setCurrentUser(normalizedUser);
          localStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
          sessionStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
        } catch {
          // ignore storage errors
        }

        if (active) {
          setRestaurantName(me?.restaurant?.name || "");
          setReady(true);
        }
      } catch {
        redirectToMarketing();
      }
    };
    checkAccess();
    return () => {
      active = false;
    };
  }, []);

  const redirectToMarketing = () => {
    const target =
      import.meta.env.MODE === "development"
        ? "http://localhost:5174/standalone/staff/login"
        : "https://beypro.com/standalone/staff/login";
    window.location.href = target;
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("standaloneToken");
      sessionStorage.removeItem("standaloneToken");
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      localStorage.removeItem("beyproUser");
      sessionStorage.removeItem("beyproUser");
    } catch {}
    redirectToMarketing();
  };

  const isUsersPage = useMemo(
    () => location.pathname.startsWith("/standalone/staff/users"),
    [location.pathname]
  );
  const isCheckinPage = useMemo(
    () => location.pathname.startsWith("/standalone/staff/checkin"),
    [location.pathname]
  );

  useEffect(() => {
    if (!ready) return;
    if (isCheckinPage && !canCheckIn) {
      navigate("/standalone/staff", { replace: true });
      return;
    }
    if (isUsersPage && !canUserManagement) {
      navigate("/standalone/staff", { replace: true });
    }
  }, [ready, isCheckinPage, isUsersPage, canCheckIn, canUserManagement, navigate]);

  useEffect(() => {
    if (!ready) return;
    const isStaffPage = location.pathname === "/standalone/staff";
    if (isStaffPage && !canStaffPage && canCheckIn) {
      navigate("/standalone/staff/checkin", { replace: true });
    }
  }, [ready, location.pathname, canStaffPage, canCheckIn, navigate]);

  const headerButton = (label, to, active = false) => (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
        active ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  const headerNav = useMemo(() => {
    if (isCheckinPage) return null;
    if (centerNav) {
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {centerNav}
          {canUserManagement &&
            headerButton("User Management", "/standalone/staff/users", isUsersPage)}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        {canStaffPage &&
          headerButton("Staff", "/standalone/staff", !isUsersPage && !isCheckinPage)}
        {canUserManagement &&
          headerButton("User Management", "/standalone/staff/users", isUsersPage)}
      </div>
    );
  }, [
    centerNav,
    isUsersPage,
    isCheckinPage,
    navigate,
    canCheckIn,
    canStaffPage,
    canUserManagement,
  ]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-4 py-3">
        <div className="w-full flex items-center gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">
              Staff Management
            </h1>
            {restaurantName && (
              <p className="text-sm text-slate-500 truncate">{restaurantName}</p>
            )}
          </div>

          <div className="flex-1 min-w-0 flex justify-center">
            {headerNav}
          </div>

          <button
            onClick={handleLogout}
            className="text-sm font-semibold text-slate-700 hover:text-red-600"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-0">
        {isUsersPage ? (
          <UserManagementPage />
        ) : isCheckinPage ? (
          <StandaloneStaffCheckInPage />
        ) : (
          <Staff />
        )}
      </main>
    </div>
  );
}
