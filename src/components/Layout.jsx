// src/components/Layout.jsx
import React, { useState, useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar, { DASHBOARD_ITEM_DRAG_TYPE } from "./Sidebar";
import GlobalOrderAlert from "./GlobalOrderAlert";
import ModernHeader from "./ModernHeader";
import NotificationBell from "./NotificationBell";
import { ToastContainer } from "react-toastify";
import { useHeader } from "../context/HeaderContext";
import { useSessionLock } from "../context/SessionLockContext";
import { useSetting } from "./hooks/useSetting";
import "react-toastify/dist/ReactToastify.css";
import { ArrowUpDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";

const EDGE_TRIGGER_THRESHOLD = 48;

const tableKeys = ["table_label", "tableLabel", "table_number", "tableNumber", "table"];

function stripEmojis(text) {
  return String(text || "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeTableValue(value) {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value.trim() : String(value);
  return text || null;
}

function getTableLabel(source) {
  if (!source || typeof source !== "object") return null;
  const orderRef = source.order;
  const candidates = [
    ...tableKeys.map((key) => normalizeTableValue(source[key])),
    ...tableKeys.map((key) => normalizeTableValue(orderRef?.[key])),
  ];
  for (const value of candidates) {
    if (value) return value;
  }
  return null;
}

function getTableFromMessage(message) {
  const text = String(message || "");
  const match = text.match(/table\s+([^\s#]+)/i);
  if (match && match[1]) return match[1].trim();
  return null;
}

function getYsStatusLabel(event) {
  const normalized = String(event || "").toLowerCase();
  if (!normalized.startsWith("ys_order_")) return null;
  return normalized.replace("ys_order_", "").replace(/_/g, " ");
}

function formatNotificationMessage(alert, t) {
  const type = String(alert?.type || "other").toLowerCase();
  const extra = alert?.extra && typeof alert.extra === "object" ? alert.extra : {};
  const event = String(extra?.event || "").toLowerCase();

  const orderId = extra.orderId ?? extra.order_id ?? null;
  const orderNumber = extra.order_number ?? extra.orderNumber ?? null;
  const orderSuffix = orderNumber ? `#${orderNumber}` : orderId ? `#${orderId}` : "";
  const tableRef = getTableLabel(extra) || getTableFromMessage(alert?.message);
  const ysLabel = getYsStatusLabel(event);

  if (ysLabel) {
    return `Yemeksepeti order ${orderSuffix} ${ysLabel}`.replace(/\s{2,}/g, " ").trim();
  }

  if (event === "order_confirmed") {
    if (tableRef) return `New order on Table ${tableRef}`;
    return t("New order {{order}}", { order: orderSuffix }).trim();
  }
  
  if (event === "order_preparing") {
    if (tableRef) return `Kitchen preparing Table ${tableRef}`;
    // Extract order details for customer name
    const orderData = extra?.order || extra;
    const orderType = String(orderData?.order_type || "").toLowerCase().trim();
    const customerName = String(orderData?.customer_name || "").trim();
    const externalId = orderData?.external_id || "";
    const externalSource = String(orderData?.external_source || "").toLowerCase();
    const id = orderData?.id || orderData?.order_id || orderId;
    
    // Online order (Yemeksepeti, Migros, etc.)
    if (externalId && externalSource) {
      const sourceName = externalSource === "yemeksepeti" ? "Yemeksepeti" : 
                         externalSource === "migros" ? "Migros" : 
                         externalSource.charAt(0).toUpperCase() + externalSource.slice(1);
      const customerInfo = customerName ? ` - ${customerName}` : "";
      return `Kitchen preparing ${sourceName} order #${externalId}${customerInfo}`;
    }
    
    // Phone/packet order
    if (orderType === "packet" || orderType === "phone") {
      const customerInfo = customerName ? ` - ${customerName}` : "";
      const idInfo = id ? ` #${id}` : "";
      return `Kitchen preparing Phone order${idInfo}${customerInfo}`;
    }
    
    return t("Kitchen preparing order {{order}}", { order: orderSuffix }).trim();
  }
  
  if (event === "order_delivered") {
    if (tableRef) return `Kitchen delivered Table ${tableRef}`;
    // Extract order details for customer name
    const orderData = extra?.order || extra;
    const orderType = String(orderData?.order_type || "").toLowerCase().trim();
    const customerName = String(orderData?.customer_name || "").trim();
    const externalId = orderData?.external_id || "";
    const externalSource = String(orderData?.external_source || "").toLowerCase();
    const id = orderData?.id || orderData?.order_id || orderId;
    
    // Online order (Yemeksepeti, Migros, etc.)
    if (externalId && externalSource) {
      const sourceName = externalSource === "yemeksepeti" ? "Yemeksepeti" : 
                         externalSource === "migros" ? "Migros" : 
                         externalSource.charAt(0).toUpperCase() + externalSource.slice(1);
      const customerInfo = customerName ? ` - ${customerName}` : "";
      return `Kitchen Delivered ${sourceName} order #${externalId}${customerInfo}`;
    }
    
    // Phone/packet order
    if (orderType === "packet" || orderType === "phone") {
      const customerInfo = customerName ? ` - ${customerName}` : "";
      const idInfo = id ? ` #${id}` : "";
      return `Kitchen Delivered Phone order${idInfo}${customerInfo}`;
    }
    
    return t("Kitchen delivered order {{order}}", { order: orderSuffix }).trim();
  }
  
  if (event === "payment_made") {
    if (tableRef) return `Table ${tableRef} Paid ${orderSuffix}`.trim();
    return t("Payment made {{order}}", { order: orderSuffix }).trim();
  }

  if (event === "driver_assigned" || type === "driver") {
    const driverName = String(extra.driverName || extra.driver_name || "").trim() || t("Driver");
    if (event === "driver_delivered") {
      const customerName = String(extra.customerName || extra.customer_name || "").trim();
      if (customerName) return t("Order ({{customer}}) delivered", { customer: customerName });
      if (orderSuffix) return t("Order {{order}} delivered", { order: orderSuffix });
      return t("Order delivered");
    }
    if (event === "driver_on_road") {
      const customerName = String(extra.customerName || extra.customer_name || "").trim();
      if (customerName) return `${customerName} - on the way`;
      if (orderSuffix) return t("Order {{order}} - on the way", { order: orderSuffix });
      return "On the way";
    }
    if (event === "driver_assigned") {
      return t("Driver {{driver}} assigned to order {{order}}", { driver: driverName, order: orderSuffix });
    }
  }

  if (event === "task_created") return t("New task: {{title}}", { title: extra.title || "" }).trim();
  if (event === "task_completed") return t("Task completed: {{title}}", { title: extra.title || "" }).trim();
  if (event === "maintenance_created") return t("Maintenance created: {{title}}", { title: extra.title || "" }).trim();
  if (event === "maintenance_resolved") return t("Maintenance resolved: {{title}}", { title: extra.title || "" }).trim();
  if (event === "stock_deducted") {
    const name = extra.stockName || extra.stock_name || extra.name || "Stock";
    const qty = extra.quantity ?? extra.qty ?? null;
    const unit = extra.unit || "";
    const suffix = qty !== null && qty !== undefined ? ` (-${qty} ${unit})`.trim() : "";
    return `Stock deducted: ${name}${suffix ? ` ${suffix}` : ""}`.trim();
  }

  // Backend saved notifications may contain emojis; strip for bell.
  return stripEmojis(alert?.message || "");
}

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
  const { t } = useTranslation();
  const { lock } = useSessionLock();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { title, subtitle, tableNav, centerNav, actions, tableStats } = useHeader();
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const contentRef = useRef(null);
  const [userSettings, setUserSettings] = useState({ pinRequired: true });

  useSetting("users", setUserSettings, { pinRequired: true });

  const isPinLoginEnabled = userSettings?.pinRequired !== false;
  const handleManualLock = isPinLoginEnabled ? () => lock("manual") : undefined;

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
    "/production":"Productions",
    "/staff":"Staff Management",
    "/expenses":"Expenses",
    "/maintenance": "Maintenance",
    "/customer-insights": "Customer Insights",
    "/ingredient-prices":"Prices",
    "/marketing-campaigns":"Marketing Campaigns",
    "/cash-register-history":"Cash History",
    "/qr-menu-settings":"QR Menu Settings",
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
        if (candidate === "/" && normalizedPath !== "/") continue;
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

  const translatedTitle =
    typeof computedTitle === "string" ? t(computedTitle, { defaultValue: computedTitle }) : computedTitle;

  const currentTitle = translatedTitle || "Beypro";


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
          <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} onLockClick={handleManualLock} />
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
          centerNav={centerNav}
          tableNav={tableNav}
          onSidebarToggle={() => setIsSidebarOpen((v) => !v)}
          onLockClick={handleManualLock}
          rightContent={rightContent}
          userName={username}
          tableStats={tableStats}
        />

        {/* Global order alert and notifications */}

        {/* Page content */}
        <main
          ref={contentRef}
          className={`flex-1 min-h-0 w-full px-0 sm:px-0 py-4 bg-slate-50 dark:bg-zinc-950 transition-colors ${
            location.pathname.includes("/transaction") ? "overflow-hidden" : "overflow-y-auto"
          }`}
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
          Notifications
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
        <option value="register">Register</option>
        <option value="other">Other</option>
      </select>

      <button
        type="button"
        onClick={() => setSortNewestFirst((value) => !value)}
        className="inline-flex items-center gap-1 rounded px-2 py-1.5 bg-blue-900/40 hover:bg-blue-800/50 text-blue-100 font-bold shadow transition-all border border-blue-800"
        title={sortNewestFirst ? "Sort: newest first" : "Sort: oldest first"}
        aria-label="Toggle notification sort order"
      >
        <ArrowUpDown className="h-4 w-4" />
        <span className="text-xs">{sortNewestFirst ? "Latest" : "Oldest"}</span>
      </button>

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
          Critical stock: {notificationSummaries.criticalStock}
        </button>
      )}
      {Number.isFinite(notificationSummaries?.openMaintenance) && notificationSummaries.openMaintenance > 0 && (
        <button
          type="button"
          onClick={() => { onCloseModal?.(); navigate("/maintenance"); }}
          className="px-3 py-1.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25 transition"
          title="Open Maintenance"
        >
          Open maintenance: {notificationSummaries.openMaintenance}
        </button>
      )}
      {Number.isFinite(notificationSummaries?.inProgressTasks) && notificationSummaries.inProgressTasks > 0 && (
        <button
          type="button"
          onClick={() => { onCloseModal?.(); navigate("/task"); }}
          className="px-3 py-1.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-400/30 hover:bg-sky-500/25 transition"
          title="Open Tasks"
        >
          In-progress tasks: {notificationSummaries.inProgressTasks}
        </button>
      )}
    </div>
    {/* List */}
   {/* List */}
    <ul className="space-y-2 px-4 py-3 max-h-[90vh] overflow-y-auto">
    {(() => {
      const filteredAlerts = lowStockAlerts
        .filter((alert) => {
          if (!unreadOnly) return true;
          return (alert.timeMs || 0) > (notificationsLastSeenAtMs || 0);
        })
        .filter((alert) =>
          filter === "all"
            ? true
            : filter === "order"
              ? ["order", "order_delayed", "order_ready"].includes(alert.type)
              : alert.type === filter
        )
        .filter((alert) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return (
            String(alert.message || "").toLowerCase().includes(q) ||
            String(alert.type || "").toLowerCase().includes(q)
          );
        });

      const sortedAlerts = filteredAlerts.slice().sort((a, b) => {
        const aTime = a?.timeMs || (a?.time ? new Date(a.time).getTime() : 0);
        const bTime = b?.timeMs || (b?.time ? new Date(b.time).getTime() : 0);
        return sortNewestFirst ? bTime - aTime : aTime - bTime;
      });

      return sortedAlerts.map((alert) => {
      const timeMs = alert?.timeMs || (alert?.time ? new Date(alert.time).getTime() : 0);
      const isUnread = timeMs > (notificationsLastSeenAtMs || 0);
      const type = String(alert.type || "other").toLowerCase();
      const message = formatNotificationMessage(alert, t);

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
          <span className="flex-1">
            <span className="block leading-snug">{message}</span>
            <span className="block text-xs text-blue-300/80 font-bold mt-0.5">
              {type.replace(/_/g, " ")}
              {isUnread ? " • new" : ""}
            </span>
          </span>
          <span className="ml-auto text-xs text-blue-300 font-bold">{timeLabel}</span>
        </li>
      );
    });
    })()}
    </ul>

  </div>
)}




    </div>
  );
}
