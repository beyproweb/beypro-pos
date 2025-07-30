import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home, Utensils, BarChart, ChefHat, Bot, FileText, Settings,
  Grid2x2, LogIn, LogOut, Package, Users, ShoppingBag
} from "lucide-react";

const MENU = [
  { label: "Dashboard", path: "/", icon: Home },
  { label: "Orders", path: "/tables", icon: Grid2x2 },
{ label: "Packet", path: "/tableoverview?tab=packet", icon: ShoppingBag },
  { label: "Products", path: "/products", icon: Utensils },
  { label: "Suppliers", path: "/suppliers", icon: Package },
  { label: "Stock", path: "/stock", icon: BarChart },
  { label: "Kitchen", path: "/kitchen", icon: ChefHat },

  { label: "Reports", path: "/reports", icon: FileText },
  { label: "Staff", path: "/staff", icon: Users },
  { label: "Settings", path: "/settings", icon: Settings },
];

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();
  const isLoggedIn = !!localStorage.getItem("beyproUser");

  // Add login/logout at bottom
  const finalMenu = [
    ...MENU,
    !isLoggedIn
      ? { label: "Login", path: "/login", icon: LogIn }
      : { label: "Logout", path: "#", icon: LogOut, action: "logout" },
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
    title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    className={`
      bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-500 bg-clip-text text-transparent
      font-extrabold drop-shadow-lg outline-none focus:ring-2 focus:ring-fuchsia-400 rounded-full
      transition-all duration-200
      ${isOpen ? "text-2xl md:text-3xl" : "text-xl"}
      hover:scale-110 active:scale-95
    `}
    style={{
      border: "none",
      padding: 0,
      margin: 0,
      cursor: "pointer",
      width: "1.6em",
      height: "1.6em",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    🛡️
  </button>
</div>


      {/* Menu */}
      <nav className="flex-1 flex flex-col gap-0 mt-6">
        {finalMenu.map((item, i) => {
          const active = location.pathname + location.search === item.path;

          const Icon = item.icon;
          return item.action === "logout" ? (
            <button
              key={item.label}
              onClick={handleLogout}
              className={`
                group flex items-center gap-3 px-3 py-3 rounded-xl mx-2 my-1
                text-white hover:bg-white/10 hover:text-fuchsia-300
                transition shadow-lg relative
                ${active ? "bg-white/20 shadow-2xl" : ""}
              `}
              tabIndex={0}
            >
              <Icon size={24} />
              {isOpen && <span className="font-medium truncate">{item.label}</span>}
            </button>
          ) : (
            <NavLink
              key={item.label}
              to={item.path}
              tabIndex={0}
              className={`
                group flex items-center gap-3 px-3 py-3 rounded-xl mx-2 my-1
                text-white hover:bg-white/10 hover:text-fuchsia-300
                transition shadow-lg relative
                ${active ? "bg-gradient-to-r from-fuchsia-400/30 via-indigo-400/20 to-blue-600/40 ring-2 ring-fuchsia-300" : ""}
              `}
              style={{ outline: "none" }}
              title={item.label}
            >
              <Icon size={24} />
              {isOpen && <span className="font-medium truncate">{item.label}</span>}
              {!isOpen && (
                <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
                  {item.label}
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
