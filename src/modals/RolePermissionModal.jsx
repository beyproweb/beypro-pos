import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

// ✅ Keep all permission keys lowercase
// Organized by category matching pages, UI components, and modals
const PERMISSION_LABELS = {
  // === MAIN PAGES (25 pages) ===
  dashboard: "📊 Dashboard",
  "business-snapshot": "📊 Business Snapshot",
  "table-overview": "🍽 Table Overview",
  "view-booking": "📅 View Booking",
  "song-request": "🎵 Song Request",
  orders: "📋 Orders",
  kitchen: "🍳 Kitchen",
  products: "🛍 Products",
  suppliers: "🏪 Suppliers",
  stock: "📦 Stock",
  "qr-menu": "🔗 QR Menu",
  staff: "👥 Staff",
  task: "✅ Task Manager",
  reports: "📈 Reports",
  "cash-register": "💰 Cash Register History",
  "ingredient-prices": "🥘 Ingredient Prices",
  integrations: "🔌 Integrations",
  "customer-insights": "👤 Customer Profile",
  "marketing-campaigns": "📢 Marketing Campaigns",
  maintenance: "🔧 Maintenance Tracker",
  "scan-ticket": "📷 Scan Ticket",
  "takeaway-overview": "🥡 Takeaway Overview",
  "printers-page": "🖨 Printers Management",
  "transaction-screen": "💳 Transaction Screen",
  "user-management": "👨‍💼 User Management",

  // === UI COMPONENTS (5 components in /components/ui) ===
  "staff-payroll": "💼 Payroll (UI)",
  "staff-checkin": "🔐 Staff Check-In (UI)",
  "staff-schedule": "📅 Staff Schedule (UI)",

  // === MODALS (12 modals in /modals) ===
  // === TRANSACTION & TABLE MODALS ===
  "modal-move-table": "🔄 Move Table Modal",
  "modal-merge-table": "🔀 Merge Table Modal",
  "modal-payment": "💳 Payment Modal",

  // === ORDER MODALS ===
  "modal-phone-order": "📞 Phone Order Modal",
  "modal-supplier-cart": "🛒 Supplier Cart Modal",

  // === PRODUCT & INVENTORY MODALS ===
  "modal-discount": "🏷 Discount Modal",
  "modal-extras": "➕ Extras Modal",
  "modal-recipe": "👨‍🍳 Recipe Modal",
  "modal-stock-confirm": "✓ Stock Confirm Modal",

  // === SETTINGS & MANAGEMENT MODALS ===
  "modal-confirm": "❓ Confirm Modal",
  "modal-kitchen-settings": "⚙️ Kitchen Settings Modal",
  "modal-role-permission": "🔐 Role Permission Modal",

  // === FEATURES & ACTIONS ===
  "register-access": "💰 Cash Register",
  payments: "💳 Payments",
  delivery: "🚗 Delivery",
  "phone-orders": "📞 Phone Orders",
  "packet-orders": "📦 Packet Orders",
  "camera.live": "📹 Live Camera Feed",

  // === SETTINGS SUB-SECTIONS ===
  settings: "⚙️ Settings",
  "qr-menu-settings": "🔗 QR Menu Settings",
  "qr-menu-settings-qr": "🔗 Menu Setup Tab",
  "qr-menu-settings-app": "📱 App Settings Tab",
  "qr-menu-settings-concert": "🎟 Concert Tickets Tab",
  "qr-menu-settings-controls": "🧾 Order Settings Tab",
  "qr-menu-settings-generate-qr": "🧩 Generate Qr Tab",
  "settings-appearance": "🎨 Appearance",
  "settings-localization": "🌍 Localization",
  "settings-notifications": "🔔 Notifications",
  "settings-payments": "💳 Payment Settings",
  "settings-register": "💰 Register Settings",
  "settings-integrations": "🔌 Integrations (Settings)",
  "settings-users": "👨‍💼 User Management (Settings)",
  "settings-subscription": "📋 Subscription",
  "settings-shop-hours": "⏰ Shop Hours",
  "settings-log-files": "📄 Log Files",

  // === LEGACY/DEPRECATED ===
  production: "⚙️ Production",
  expenses: "💸 Expenses",
  "staff-send-shift": "📤 Send Shift",
  "staff-add": "➕ Add Staff",
  "staff-payment": "💳 Staff Payment",
  "driver-report": "🚗 Driver Report",
  "drinks-settings": "🥤 Drinks Settings",
};


const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS);
const STANDALONE_STAFF_PERMISSIONS = [
  "staff",
  "staff-checkin",
  "staff-schedule",
  "staff-payroll",
  "staff-send-shift",
  "staff-add",
  "staff-payment",
];
const modalRoot =
  typeof document !== "undefined" ? document.body : null;

export default function RolePermissionModal({
  role,
  isOpen,
  onClose,
  onSave,
  initialPermissions = [],
}) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isOpen)
      setSelected(initialPermissions?.map((p) => p.toLowerCase()) || []);
  }, [isOpen, initialPermissions]);

  const togglePermission = (perm) => {
    setSelected((prev) =>
      prev.includes(perm)
        ? prev.filter((p) => p !== perm)
        : [...prev, perm]
    );
  };

  const handleSelectAll = () => setSelected(["all"]);
  const handleClearAll = () => setSelected([]);

  const handleSave = () => {
    const normalizedRole = role?.toLowerCase(); // ✅ always lowercase role key
    onSave(selected, normalizedRole); // ✅ pass normalized role + lowercase perms
    onClose();
  };

  const normalizedQuery = search.trim().toLowerCase();
  const isStandaloneStaff =
    typeof window !== "undefined" &&
    typeof window.location?.pathname === "string" &&
    window.location.pathname.startsWith("/standalone/staff");
  const permissionSource = useMemo(
    () => (isStandaloneStaff ? STANDALONE_STAFF_PERMISSIONS : ALL_PERMISSIONS),
    [isStandaloneStaff]
  );
  const visiblePermissions = useMemo(() => {
    if (!normalizedQuery) return permissionSource;
    return permissionSource.filter(
      (perm) =>
        perm.includes(normalizedQuery) ||
        (PERMISSION_LABELS[perm] || "")
          .toLowerCase()
          .includes(normalizedQuery)
    );
  }, [normalizedQuery, permissionSource]);

  if (!isOpen) return null;

  if (!modalRoot) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-gradient-to-br from-indigo-900/80 via-indigo-700/40 to-blue-400/30 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-3xl shadow-2xl bg-white/80 dark:bg-gray-900/90 border border-indigo-400/30 p-7">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-extrabold text-indigo-700 dark:text-accent tracking-tight">
            <span className="inline-block mr-2">🔐</span>
            Set Permissions for <span className="capitalize">{role}</span>
          </h3>
          <button
            className="text-2xl text-indigo-600 hover:text-indigo-800 rounded-full px-2 py-0.5 transition"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Search permissions
          </label>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value || "")}
            placeholder="e.g. dashboard, qr menu"
            className="w-full rounded-2xl border border-indigo-200/70 dark:border-indigo-800 bg-white/80 dark:bg-gray-900/60 px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition"
          />
        </div>
        <div className="flex justify-end gap-3 mb-4">
          <button
            onClick={handleSelectAll}
            className="px-4 py-2 bg-gradient-to-r from-emerald-400 to-green-500 text-white rounded-2xl font-semibold shadow hover:brightness-110 transition"
          >
            Select All
          </button>
          <button
            onClick={handleClearAll}
            className="px-4 py-2 bg-gradient-to-r from-pink-400 to-rose-500 text-white rounded-2xl font-semibold shadow hover:brightness-110 transition"
          >
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-72 overflow-y-auto mb-8">
          {visiblePermissions.map((perm) => (
            <label
              key={perm}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2
                border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-white/70 to-indigo-50 dark:from-gray-900 dark:to-gray-800
                transition cursor-pointer select-none
                shadow-lg hover:border-accent
                ${
                  selected.includes(perm) || selected.includes("all")
                    ? "border-2 border-accent ring-2 ring-accent/30 bg-gradient-to-r from-indigo-100 to-blue-100 dark:from-indigo-950/80 dark:to-indigo-900/80"
                    : ""
                }
              `}
              style={{
                fontSize: "1.13rem",
                minHeight: "48px",
                boxShadow: selected.includes(perm)
                  ? "0 4px 16px 0 rgba(100,82,255,0.10)"
                  : "0 1px 4px 0 rgba(30,34,90,0.06)",
              }}
            >
              <input
                type="checkbox"
                className="accent-indigo-600 h-5 w-5 rounded-md shadow-sm"
                checked={selected.includes("all") || selected.includes(perm)}
                onChange={() => togglePermission(perm)}
              />
              <span className="font-semibold text-gray-800 dark:text-white">
                {PERMISSION_LABELS[perm] || perm}
              </span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-800 text-gray-800 dark:text-white rounded-2xl font-semibold hover:bg-gray-400 dark:hover:bg-gray-900 transition shadow"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold shadow hover:brightness-110 transition"
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    modalRoot
  );
}
