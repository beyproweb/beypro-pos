// src/components/Layout.jsx

import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import GlobalOrderAlert from "./GlobalOrderAlert";
import ModernHeader from "./ModernHeader";
import NotificationBell from "./NotificationBell";
import { ToastContainer } from "react-toastify";
import { useHeader } from "../context/HeaderContext";
import "react-toastify/dist/ReactToastify.css";
import { X } from "lucide-react";
export default function Layout({
  unread = 0,
  bellOpen = false,
  lowStockAlerts = [],
  onBellClick,
  onCloseModal,
  hideBell = false,
  onClearNotifications,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [now, setNow] = useState(new Date());
  const location = useLocation();
  const { title, subtitle, tableNav } = useHeader();
  const [filter, setFilter] = useState("all");
  // Live clock for header
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Username from localStorage for welcome
  let username = "Manager";
  try {
    const userStr = localStorage.getItem("beyproUser");
    if (userStr) {
      const userObj = JSON.parse(userStr);
      username =
        userObj?.name ||
        userObj?.full_name ||
        userObj?.fullName ||
        "Manager";
    }
  } catch {
    // fallback to "Manager"
  }

  // Show welcome message only on /tables
  const showWelcome = location.pathname === "/tables";

  // Default titles for common routes
  const pageTitles = {
    "/": "Dashboard",
    "/dashboard": "Dashboard",
    "/tables": "Orders",
    "/products": "Products",
    "/stock": "Stock",
    "/kitchen": "Kitchen",
    "/task": "Tasks",
    "/reports": "Reports",
    "/settings": "Settings",
    "/Production":"Production",
    "/staff":"Staff Management",
    "/expenses":"Expenses",
    "/ingredient-prices":"Prices",
    "/cash-register-history":"Cash Register",
    "/integrations":"Integrations"
    // Add more as needed...
  };
 const currentTitle = (typeof title === "undefined" ? (pageTitles[location.pathname] || "Beypro") : title);


  // Right content for ModernHeader (welcome, clock, bell)
  const rightContent = (
    <div className="flex items-center gap-4">

      <span className="font-mono text-sm text-blue-900 dark:text-blue-200 bg-white/60 dark:bg-zinc-900/50 rounded-xl px-3 py-1 shadow-inner">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
{!hideBell && (
        <NotificationBell unread={unread} onClick={onBellClick} />
      )}

    </div>
  );

  return (
    <div className="w-screen h-screen overflow-hidden flex bg-slate-50 dark:bg-zinc-950 transition-colors">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main content area */}
      <div
        className={`
          flex-1 flex flex-col h-screen transition-all duration-300 ease-in-out
          ${isSidebarOpen ? "ml-[94px] md:ml-[160px]" : "ml-[64px] md:ml-[56px]"}
        `}
        style={{
          minWidth: 0,
          width: "100%",
        }}
      >
        {/* ModernHeader with notification bell in rightContent */}
        <ModernHeader
          title={currentTitle}
          subtitle={subtitle}
          tableNav={tableNav}
          onSidebarToggle={() => setIsSidebarOpen((v) => !v)}
          rightContent={rightContent}
          userName={username}
        />

        {/* Global order alert and notifications */}
        <GlobalOrderAlert />

        {/* Page content */}
        <main className="flex-1 min-h-0 w-full px-0 sm:px-0 py-4 bg-slate-50 dark:bg-zinc-950 transition-colors overflow-y-auto">
          <div className="max-w-full min-h-[calc(100vh-70px)]">
           <Outlet context={{ isSidebarOpen }} />

          </div>
        </main>

        {/* Toast notifications */}
        <ToastContainer
          position="bottom-right"
          autoClose={2600}
          hideProgressBar
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss={false}
          draggable={false}
          pauseOnHover
          theme="colored"
        />
      </div>
{bellOpen && (
  <div className="
    fixed top-0 right-0 z-[9999] h-full w-full sm:w-[390px]
    bg-gradient-to-br from-blue-950/90 via-blue-900/80 to-slate-900/95
    shadow-2xl border-l-4 border-blue-500/40 flex flex-col
    backdrop-blur-lg animate-in slide-in-from-right-8 duration-200
    transition-all
  ">
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b border-blue-900/30 bg-blue-950/60">
      <h2 className="text-xl font-extrabold text-blue-200 flex items-center gap-2">
        <span role="img" aria-label="Bell">🔔</span> Notifications
      </h2>
   <button
  onClick={onCloseModal}
  className="p-2 rounded-full hover:bg-blue-900/30 focus:ring-2 focus:ring-blue-400 outline-none transition"
  title="Close"
>
  <X className="w-5 h-5 text-white" />
</button>



    </div>
    {/* Filter and Clear */}
    <div className="px-4 pt-3 flex gap-2 items-center">
      <select
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="rounded px-3 py-1.5 bg-blue-900/30 text-blue-100 border border-blue-800 focus:ring-2 focus:ring-blue-500 outline-none font-semibold shadow"
      >
        <option value="all">All</option>
        <option value="stock">Stock</option>
        <option value="ingredient">Ingredient</option>
        <option value="order">Order</option>
        <option value="other">Other</option>
      </select>
      <button
        className="ml-auto px-4 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold shadow transition-all"
        onClick={onClearNotifications}
      >
        Clear
      </button>
    </div>
    {/* List */}
   {/* List */}
<ul className="space-y-2 px-4 py-3 max-h-[90vh] overflow-y-auto">
  {lowStockAlerts
    .filter(alert =>
      filter === "all" ? true :
      filter === "order" ? ["order", "order_delayed", "order_ready"].includes(alert.type) :
      alert.type === filter
    )
    .map((alert, idx) => (
      <li key={idx}
        className="flex items-center gap-3 rounded-xl shadow px-4 py-3 text-base font-semibold bg-blue-900/50 border border-blue-800 text-blue-100"
      >
        <span className="text-2xl">
          {alert.type === "ingredient" ? "💸" : alert.type === "stock" ? "🧂" : "🔔"}
        </span>
        <span className="flex-1">{alert.message}</span>
        <span className="ml-auto text-xs text-blue-400 font-bold">{alert.time ? new Date(alert.time).toLocaleTimeString() : ""}</span>
      </li>
    ))
  }
</ul>

  </div>
)}




    </div>
  );
}
