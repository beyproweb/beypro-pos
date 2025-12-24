// src/components/Layout.jsx
import React, { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar, { DASHBOARD_ITEM_DRAG_TYPE } from "./Sidebar";
import GlobalOrderAlert from "./GlobalOrderAlert";
import ModernHeader from "./ModernHeader";
import NotificationBell from "./NotificationBell";
import { ToastContainer } from "react-toastify";
import { useHeader } from "../context/HeaderContext";
import "react-toastify/dist/ReactToastify.css";
import { X } from "lucide-react";

const EDGE_TRIGGER_THRESHOLD = 48;

export default function Layout({
  unread = 0,
  bellOpen = false,
  lowStockAlerts = [],
  onBellClick,
  onCloseModal,
  hideBell = false,
  onClearNotifications,
  onRefreshNotifications,
  onMarkAllRead,
  notificationSummaries = {},
  notificationsLastSeenAtMs = 0,
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { title, subtitle, tableNav, actions } = useHeader();
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const contentRef = useRef(null);

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
  // Default titles for common routes
  const pageTitles = {
    "/": "Dashboard",
    "/dashboard": "Dashboard",
    "/tables": "Orders",
    "/tableoverview": "Orders",
    "/orders": "Orders",
    "/payments": "Payments",
    "/transaction": "Transaction",
    "/transaction/phone": "Phone Order",
    "/suppliers": "Suppliers",
    "/products": "Products",
    "/stock": "Stock",
    "/kitchen": "Kitchen",
    "/task": "Tasks",
    "/reports": "Reports",
    "/settings": "Settings",
    "/user-management": "User Management",
    "/printers": "Printers",
    "/cameras": "Live Cameras",
    "/Production":"Production",
    "/staff":"Staff Management",
    "/expenses":"Expenses",
    "/ingredient-prices":"Prices",
    "/cash-register-history":"Cash Register",
    "/integrations":"Integrations"
    // Add more as needed...
  };
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const searchParams = new URLSearchParams(location.search);

  let computedTitle;

  if (typeof title === "string" && title.trim() !== "") {
    computedTitle = title;
  } else if (typeof title === "number") {
    computedTitle = String(title);
  } else if (title !== undefined && title !== null && title !== "") {
    computedTitle = title;
  } else {
    if (normalizedPath === "/tableoverview") {
      const tab = searchParams.get("tab");
      const tabTitles = {
        packet: "Packet",
        phone: "Phone",
        history: "History",
        kitchen: "Kitchen",
        register: "Register",
        tables: "Orders",
      };
      if (tab && tabTitles[tab]) {
        computedTitle = tabTitles[tab];
      }
    }

    if (!computedTitle) {
      const candidates = [];
      let cursor = normalizedPath;
      while (true) {
        candidates.push(cursor);
        if (cursor === "/" || cursor === "") break;
        const idx = cursor.lastIndexOf("/");
        if (idx <= 0) {
          cursor = "/";
        } else {
          cursor = cursor.slice(0, idx);
        }
      }

      for (const candidate of candidates) {
        if (pageTitles[candidate]) {
          computedTitle = pageTitles[candidate];
          break;
        }
      }
    }

    if (!computedTitle && normalizedPath !== "/") {
      const segments = normalizedPath.split("/").filter(Boolean);
      if (segments.length) {
        const lastSegment = segments[segments.length - 1];
        computedTitle = lastSegment
          .split(/[-_]/)
          .filter(Boolean)
          .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
          .join(" ");
      }
    }
  }

  const currentTitle = computedTitle || "Beypro";


  // Right content for ModernHeader (kitchen actions, notifications, etc.)
  const rightContent = (
    <div className="flex items-center gap-4">
      {actions}
      {!hideBell && (
        <NotificationBell unread={unread} onClick={onBellClick} />
      )}
    </div>
  );

  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let openTimeout = null;

    const shouldTriggerFromEvent = (event) => {
      if (!event?.dataTransfer?.types) return false;
      return Array.from(event.dataTransfer.types).includes(DASHBOARD_ITEM_DRAG_TYPE);
    };

    const pointerIsAtLeftEdge = (event) => {
      const pointerX =
        typeof event?.clientX === "number"
          ? event.clientX
          : event?.changedTouches?.[0]?.clientX;
      if (typeof pointerX !== "number") return false;
      return pointerX <= EDGE_TRIGGER_THRESHOLD;
    };

    const scheduleOpen = () => {
      if (isSidebarOpen) return;
      if (openTimeout !== null) return;
      openTimeout = window.setTimeout(() => {
        setIsSidebarOpen(true);
        openTimeout = null;
      }, 120);
    };

    const clearPendingOpen = () => {
      if (openTimeout !== null) {
        clearTimeout(openTimeout);
        openTimeout = null;
      }
    };

    const handleDragIntent = (event) => {
      if (!shouldTriggerFromEvent(event)) {
        clearPendingOpen();
        return;
      }
      if (!pointerIsAtLeftEdge(event)) {
        clearPendingOpen();
        return;
      }
      scheduleOpen();
    };

    const handleDragEnd = (event) => {
      if (!shouldTriggerFromEvent(event)) return;
      clearPendingOpen();
    };

    window.addEventListener("dragenter", handleDragIntent, true);
    window.addEventListener("dragover", handleDragIntent, true);
    window.addEventListener("drop", handleDragEnd, true);
    window.addEventListener("dragleave", handleDragEnd, true);
    window.addEventListener("dragend", handleDragEnd, true);

    return () => {
      clearPendingOpen();
      window.removeEventListener("dragenter", handleDragIntent, true);
      window.removeEventListener("dragover", handleDragIntent, true);
      window.removeEventListener("drop", handleDragEnd, true);
      window.removeEventListener("dragleave", handleDragEnd, true);
      window.removeEventListener("dragend", handleDragEnd, true);
    };
  }, [isSidebarOpen]);

  return (
    <div className="w-screen h-screen overflow-hidden flex bg-slate-50 dark:bg-zinc-950 transition-colors">
      {isSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          />
          <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
        </>
      )}

      {/* Main content area */}
      <div
        className="flex-1 flex flex-col h-screen transition-all duration-300 ease-in-out w-full min-w-0"
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

        {/* Page content */}
        <main
          ref={contentRef}
          className="flex-1 min-h-0 w-full px-0 sm:px-0 py-4 bg-slate-50 dark:bg-zinc-950 transition-colors overflow-y-auto"
        >
          <div className="max-w-full min-h-[calc(100vh-70px)]">
            <Outlet
              key={`${location.pathname}${location.search}`}
              context={{ isSidebarOpen }}
            />
          </div>
        </main>


        {/* Toast notifications */}
        <ToastContainer
          position="bottom-center"
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
        {/* Global order alert and notifications */}
<GlobalOrderAlert />

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
      <div className="flex flex-col">
        <h2 className="text-xl font-extrabold text-blue-200 flex items-center gap-2">
          <span role="img" aria-label="Bell">🔔</span> Notifications
        </h2>
        <div className="text-xs text-blue-300/80 font-semibold">
          {unread > 0 ? `${unread} unread` : "All caught up"}
        </div>
      </div>
   <button
  onClick={onCloseModal}
  className="p-2 rounded-full hover:bg-blue-900/30 focus:ring-2 focus:ring-blue-400 outline-none transition"
  title="Close"
>
  <X className="w-5 h-5 text-white" />
</button>



    </div>
    {/* Filter, Search, Actions */}
    <div className="px-4 pt-3 flex flex-col gap-2">
      <div className="flex gap-2 items-center">
      <select
        value={filter}
        onChange={e => setFilter(e.target.value)}
        className="rounded px-3 py-1.5 bg-blue-900/30 text-blue-100 border border-blue-800 focus:ring-2 focus:ring-blue-500 outline-none font-semibold shadow"
      >
        <option value="all">All</option>
        <option value="stock">Stock</option>
        <option value="ingredient">Ingredient</option>
        <option value="order">Order</option>
        <option value="payment">Payment</option>
        <option value="driver">Driver</option>
        <option value="task">Task</option>
        <option value="maintenance">Maintenance</option>
        <option value="other">Other</option>
      </select>

      <label className="ml-auto flex items-center gap-2 text-xs text-blue-200 font-bold select-none">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => setUnreadOnly(e.target.checked)}
          className="accent-blue-500"
        />
        Unread
      </label>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search notifications..."
        className="w-full rounded px-3 py-2 bg-blue-900/25 text-blue-100 border border-blue-800 focus:ring-2 focus:ring-blue-500 outline-none font-semibold shadow"
      />

      <div className="flex gap-2 items-center">
        <button
          className="px-3 py-1.5 rounded bg-blue-900/40 hover:bg-blue-800/50 text-blue-100 font-bold shadow transition-all border border-blue-800"
          onClick={onRefreshNotifications}
          type="button"
        >
          Refresh
        </button>
        <button
          className="px-3 py-1.5 rounded bg-blue-900/40 hover:bg-blue-800/50 text-blue-100 font-bold shadow transition-all border border-blue-800"
          onClick={onMarkAllRead}
          type="button"
        >
          Mark read
        </button>
        <button
          className="ml-auto px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold shadow transition-all"
          onClick={onClearNotifications}
          type="button"
        >
          Clear all
        </button>
      </div>
    </div>

    {/* Quick status */}
    <div className="px-4 pt-2 flex flex-wrap gap-2 text-xs font-bold">
      {Number.isFinite(notificationSummaries?.criticalStock) && notificationSummaries.criticalStock > 0 && (
        <button
          type="button"
          onClick={() => { onCloseModal?.(); navigate("/stock"); }}
          className="px-3 py-1.5 rounded-full bg-red-500/15 text-red-200 border border-red-400/30 hover:bg-red-500/25 transition"
          title="Open Stock"
        >
          ⚠️ Critical stock: {notificationSummaries.criticalStock}
        </button>
      )}
      {Number.isFinite(notificationSummaries?.openMaintenance) && notificationSummaries.openMaintenance > 0 && (
        <button
          type="button"
          onClick={() => { onCloseModal?.(); navigate("/maintenance"); }}
          className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25 transition"
          title="Open Maintenance"
        >
          🛠️ Open maintenance: {notificationSummaries.openMaintenance}
        </button>
      )}
      {Number.isFinite(notificationSummaries?.inProgressTasks) && notificationSummaries.inProgressTasks > 0 && (
        <button
          type="button"
          onClick={() => { onCloseModal?.(); navigate("/task"); }}
          className="px-3 py-1.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/30 hover:bg-sky-500/25 transition"
          title="Open Tasks"
        >
          📝 In-progress tasks: {notificationSummaries.inProgressTasks}
        </button>
      )}
    </div>
    {/* List */}
   {/* List */}
<ul className="space-y-2 px-4 py-3 max-h-[90vh] overflow-y-auto">
  {lowStockAlerts
    .filter((alert) => {
      if (!unreadOnly) return true;
      return (alert.timeMs || 0) > (notificationsLastSeenAtMs || 0);
    })
    .filter(alert =>
      filter === "all" ? true :
      filter === "order" ? ["order", "order_delayed", "order_ready"].includes(alert.type) :
      alert.type === filter
    )
    .filter((alert) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        String(alert.message || "").toLowerCase().includes(q) ||
        String(alert.type || "").toLowerCase().includes(q)
      );
    })
    .map((alert) => {
      const t = alert?.timeMs || (alert?.time ? new Date(alert.time).getTime() : 0);
      const isUnread = t > (notificationsLastSeenAtMs || 0);
      const type = String(alert.type || "other").toLowerCase();
      const icon =
        type === "ingredient" ? "💸" :
        type === "stock" ? "🧂" :
        type === "stock_expiry" ? "⏳" :
        type === "payment" ? "💸" :
        type === "driver" ? "🚗" :
        type === "task" ? "📝" :
        type === "maintenance" ? "🛠️" :
        type === "order" ? "🧾" :
        "🔔";

      const timeLabel =
        alert.time
          ? new Date(alert.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";

      const clickable = !!alert.link;

      return (
        <li
          key={String(alert.id)}
          onClick={() => {
            if (!clickable) return;
            onCloseModal?.();
            navigate(alert.link);
          }}
          className={[
            "flex items-center gap-3 rounded-xl shadow px-4 py-3 text-base font-semibold",
            "bg-blue-900/50 border text-blue-100",
            isUnread ? "border-blue-300/60" : "border-blue-800",
            clickable ? "cursor-pointer hover:bg-blue-900/65 transition" : "",
          ].join(" ")}
          title={clickable ? "Open related page" : undefined}
        >
          <span className="text-2xl">{icon}</span>
          <span className="flex-1">
            <span className="block leading-snug">{alert.message}</span>
            <span className="block text-xs text-blue-300/80 font-bold mt-0.5">
              {type.replace(/_/g, " ")}
              {isUnread ? " • new" : ""}
            </span>
          </span>
          <span className="ml-auto text-xs text-blue-300 font-bold">{timeLabel}</span>
        </li>
      );
    })
  }
</ul>

  </div>
)}




    </div>
  );
}
