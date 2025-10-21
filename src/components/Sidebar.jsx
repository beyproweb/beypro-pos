import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Utensils, BarChart, ChefHat, FileText, Settings,
  Grid2x2, LogIn, LogOut, Package, Users, ShoppingBag
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { hasPermission } from "../utils/permissions";
import { useTranslation } from "react-i18next";

const MENU = [
  { labelKey: "Dashboard", defaultLabel: "Dashboard", path: "/", icon: Home, permission: "dashboard" },
  { labelKey: "Orders", defaultLabel: "Orders", path: "/tables", icon: Grid2x2, permission: "tables" },
  { labelKey: "Packet", defaultLabel: "Packet", path: "/tableoverview?tab=packet", icon: ShoppingBag, permission: "tables" },
  { labelKey: "Products", defaultLabel: "Products", path: "/products", icon: Utensils, permission: "products" },
  { labelKey: "Suppliers", defaultLabel: "Suppliers", path: "/suppliers", icon: Package, permission: "suppliers" },
  { labelKey: "Stock", defaultLabel: "Stock", path: "/stock", icon: BarChart, permission: "stock" },
  { labelKey: "Kitchen", defaultLabel: "Kitchen", path: "/kitchen", icon: ChefHat, permission: "kitchen" },
  { labelKey: "Reports", defaultLabel: "Reports", path: "/reports", icon: FileText, permission: "reports" },
  { labelKey: "Staff", defaultLabel: "Staff", path: "/staff", icon: Users, permission: "staff" },
  { labelKey: "Settings", defaultLabel: "Settings", path: "/settings", icon: Settings, permission: "settings" },
];

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem("beyproUser");
  const { currentUser } = useAuth();
  const { t } = useTranslation();

  // Add login/logout at bottom
  const finalMenu = [
    ...MENU,
    !isLoggedIn
      ? { labelKey: "Login", defaultLabel: "Login", path: "/login", icon: LogIn }
      : { labelKey: "Logout", defaultLabel: "Logout", path: "#", icon: LogOut, action: "logout" },
  ];

  function handleLogout() {
    localStorage.removeItem("beyproUser");
    window.location = "/login";
  }

  return (
    <aside
      className={`
        fixed top-0 left-0 z-50 h-screen
        ${isOpen ? "w-[94px] md:w-[170px]" : "w-[64px] md:w-[56px]"}
        transition-all duration-300 ease-in-out
        bg-gradient-to-br from-blue-800/90 via-blue-700/80 to-blue-900/90
        shadow-2xl border-r border-white/15
        backdrop-blur-2xl
        flex flex-col items-center md:items-stretch py-3 px-0
      `}
      style={{ minWidth: isOpen ? 64 : 48 }}
    >

      {/* Logo */}
     <div className={`flex items-center gap-2 justify-center py-2 transition-all ${isOpen ? "pl-3" : ""}`}>
  <button
    onClick={() => setIsOpen((prev) => !prev)}
    title={t(isOpen ? "Collapse sidebar" : "Expand sidebar", {
      defaultValue: isOpen ? "Collapse sidebar" : "Expand sidebar",
    })}
    className={`
      relative flex flex-col items-center justify-center
      rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-400
      transition-transform duration-200
      ${isOpen ? "w-12 h-12 md:w-14 md:h-14" : "w-10 h-10"}
      bg-white/5 hover:bg-white/10 border border-white/20 shadow-lg
      hover:scale-105 active:scale-95
    `}
  >
    <span
      className={`
        block w-6 h-0.5 bg-white rounded transition-transform duration-200
        ${isOpen ? "translate-y-1.5 rotate-45" : "-translate-y-1.5"}
      `}
    />
    <span
      className={`
        block w-6 h-0.5 bg-white rounded mb-1.5 mt-1.5 transition-opacity duration-200
        ${isOpen ? "opacity-0" : "opacity-100"}
      `}
    />
    <span
      className={`
        block w-6 h-0.5 bg-white rounded transition-transform duration-200
        ${isOpen ? "-translate-y-1.5 -rotate-45" : "translate-y-1.5"}
      `}
    />
    <span className="sr-only">
      {t(isOpen ? "Collapse sidebar" : "Expand sidebar", {
        defaultValue: isOpen ? "Collapse sidebar" : "Expand sidebar",
      })}
    </span>
  </button>
</div>


      {/* Menu */}
      <nav className="flex-1 flex flex-col gap-0 mt-6">
{finalMenu
  .filter((item) => {
    if (!currentUser) return false;
    if (item.action === "logout" || item.path === "/login") return true;

    const permKey = item.permission || item.labelKey?.toLowerCase();
    return hasPermission(permKey, currentUser);
  })
  .map((item) => {
    const active = location.pathname + location.search === item.path;
    const Icon = item.icon;
    const label = t(item.labelKey, {
      defaultValue: item.defaultLabel ?? item.labelKey,
    });

    return item.action === "logout" ? (
      <button
        key={item.labelKey}
        onClick={handleLogout}
        className={`group flex items-center gap-3 px-3 py-3 rounded-xl mx-2 my-1
          text-white hover:bg-white/10 hover:text-fuchsia-300 transition shadow-lg relative
          ${active ? "bg-white/20 shadow-2xl" : ""}
        `}
      >
        <Icon size={24} />
        {isOpen && <span className="font-medium truncate">{label}</span>}
      </button>
    ) : (
      <NavLink
        key={item.labelKey}
        to={item.path}
        className={`group flex items-center gap-3 px-3 py-3 rounded-xl mx-2 my-1
          text-white hover:bg-white/10 hover:text-fuchsia-300 transition shadow-lg relative
          ${active ? "bg-gradient-to-r from-fuchsia-400/30 via-indigo-400/20 to-blue-600/40 ring-2 ring-fuchsia-300" : ""}
        `}
        title={label}
      >
        <Icon size={24} />
        {isOpen && <span className="font-medium truncate">{label}</span>}
        {!isOpen && (
          <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
            {label}
          </span>
        )}
      </NavLink>
    );
  })}

      </nav>

      {/* Spacer for mobile */}
      <div className="mt-auto mb-1" />
    </aside>
  );
}
