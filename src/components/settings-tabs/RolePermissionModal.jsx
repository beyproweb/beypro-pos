import React, { useState, useEffect } from "react";

// Use your full list and labels from previous assistant reply!
const PERMISSION_LABELS = {
  dashboard: "Dashboard",
  products: "Products",
  suppliers: "Suppliers",
  stock: "Stock",
  production: "Production",
  staff: "Staff",
  Task: "Task",
  reports: "Reports",
  expenses: "Expenses",
  "ingredient-prices": "Ingredient Prices",
  "cash-register-history": "Cash Register History",
  integrations: "Integrations",
  settings: "Settings (Main)",
  "settings-shop-hours": "Shop Hours",
  "settings-localization": "Localization",
  "settings-notifications": "Notifications",
  "settings-subscription": "Subscription",
  "settings-payments": "Payments",
  "settings-register": "Register Settings",
  "settings-users": "User Management",
  "settings-integrations": "Integrations (Settings)",
  "settings-inventory": "Inventory Logs",
  "settings-appearance": "Appearance",
  orders: "Orders",
  kitchen: "Kitchen",
  delivery: "Delivery",
  register: "Register",
  payments: "Payments",
  "tables": "Table Overview",
"history": "Order History",
"packet": "Packet Orders",
"phone": "Phone Orders",
"table-register": "Register Modal",
"settings-register-summary": "Register Summary Modal",
};

const ALL_PERMISSIONS = [
  "dashboard",
  "products",
  "suppliers",
  "stock",
  "production",
  "staff",
  "Task",
  "reports",
  "expenses",
  "ingredient-prices",
  "cash-register-history",
  "integrations",
  "settings",
  "settings-shop-hours",
  "settings-localization",
  "settings-notifications",
  "settings-subscription",
  "settings-payments",
  "settings-register",
   "settings-register-summary",
  "settings-users",
  "settings-integrations",
  "settings-inventory",
  "settings-appearance",
  "orders",
  "kitchen",
  "delivery",
  "register",
  "payments",
   "tables",
  "history",
  "packet",
  "phone",
  "table-register",
];

export default function RolePermissionModal({
  role,
  isOpen,
  onClose,
  onSave,
  initialPermissions = [],
}) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (isOpen) setSelected(initialPermissions || []);
  }, [isOpen, initialPermissions]);

  const togglePermission = (perm) => {
    setSelected((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSelectAll = () => setSelected([...ALL_PERMISSIONS]);
  const handleClearAll = () => setSelected([]);

  const handleSave = () => {
    onSave(selected);
    onClose();
  };

  if (!isOpen) return null;

  // Modern card look with glassmorphism, grid, accent glowing buttons, bigger checkboxes
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-900/80 via-indigo-700/40 to-blue-400/30 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-3xl shadow-2xl bg-white/80 dark:bg-gray-900/90 border border-indigo-400/30 p-7">
        {/* Header */}
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

        {/* Select/Clear All */}
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

        {/* Permission Grid */}
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-72 overflow-y-auto mb-8">
  {ALL_PERMISSIONS.map((perm) => (
    <label
      key={perm}
      className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2
        border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-white/70 to-indigo-50 dark:from-gray-900 dark:to-gray-800
        transition cursor-pointer select-none
        shadow-lg hover:border-accent
        ${
          selected.includes(perm)
            ? "border-2 border-accent ring-2 ring-accent/30 bg-gradient-to-r from-indigo-100 to-blue-100 dark:from-indigo-950/80 dark:to-indigo-900/80"
            : ""
        }
      `}
      style={{
        fontSize: "1.13rem",
        minHeight: "48px",
        boxShadow: selected.includes(perm)
          ? "0 4px 16px 0 rgba(100,82,255,0.10)"
          : "0 1px 4px 0 rgba(30,34,90,0.06)"
      }}
    >
      <input
        type="checkbox"
        className="accent-indigo-600 h-5 w-5 rounded-md shadow-sm"
        checked={selected.includes(perm)}
        onChange={() => togglePermission(perm)}
      />
      <span className="font-semibold text-gray-800 dark:text-white">
        {PERMISSION_LABELS[perm] || perm}
      </span>
    </label>
  ))}
</div>


        {/* Modal Actions */}
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
    </div>
  );
}
