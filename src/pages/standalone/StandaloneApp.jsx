import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import secureFetch, { getAuthToken } from "../../utils/secureFetch";

export default function StandaloneApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const isKitchenRoute = location.pathname.startsWith("/standalone/app/kitchen");

  useEffect(() => {
    let active = true;
    const checkAccess = async () => {
      const token = getAuthToken();
      if (!token) {
        navigate("/standalone/login", { replace: true });
        return;
      }
      try {
        const me = await secureFetch("/standalone/auth/me");
        const allowed =
          me?.allowed_modules ||
          me?.user?.allowed_modules ||
          me?.restaurant?.allowed_modules ||
          [];
        if (!Array.isArray(allowed) || !allowed.includes("qr_kitchen")) {
          navigate("/standalone/login", { replace: true });
          return;
        }
        if (active) setReady(true);
      } catch {
        navigate("/standalone/login", { replace: true });
      }
    };
    checkAccess();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleLogout = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("beyproUser");
      localStorage.removeItem("standaloneToken");
    } catch {}
    try {
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("beyproUser");
      sessionStorage.removeItem("standaloneToken");
    } catch {}
    navigate("/standalone/login", { replace: true });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <header className="bg-white border-b border-gray-200">
        <div className="w-full px-4 py-4 flex items-center justify-between">
          <nav className="flex gap-3">
            <NavLink
              to="/standalone/app/qr-menu-settings"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  isActive ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              QR Menü Ayarları
            </NavLink>
            <NavLink
              to="/standalone/app/kitchen"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm font-semibold ${
                  isActive ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              Orders
            </NavLink>
          </nav>
          <button
            onClick={handleLogout}
            className="text-sm font-semibold text-gray-700 hover:text-red-600"
          >
            Logout
          </button>
        </div>
      </header>

      <main className={isKitchenRoute ? "w-full px-4 py-6" : "max-w-6xl mx-auto px-4 py-6"}>
        <Outlet />
      </main>
    </div>
  );
}
