import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Utensils,
  BarChart,
  ChefHat,
  FileText,
  Settings,
  Grid2x2,
  LogIn,
  LogOut,
  Package,
  Users,
  ShoppingBag,
  Phone,
  Wallet,
  BookOpen,
  Factory,
  ClipboardList,
  FlaskConical,
  Receipt,
  Puzzle,
  Wrench,
  QrCode,
  UserCheck,
  Megaphone,
  CreditCard,
  Globe,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "../context/AuthContext";
import { usePlanModules } from "../context/PlanModulesContext";
import { hasPermission } from "../utils/permissions";
import { useTranslation } from "react-i18next";
import { safeNavigate } from "../utils/navigation";
import secureFetch from "../utils/secureFetch";
import { CURRENCY_KEYS } from "../utils/currency";
import { useCurrency } from "../context/CurrencyContext";

export const SIDEBAR_WIDTH_OPEN = 224;
export const SIDEBAR_WIDTH_COLLAPSED = 72;
export const DASHBOARD_ITEM_DRAG_TYPE = "application/x-dashboard-shortcut";

const MENU = [
  { labelKey: "Dashboard", defaultLabel: "Dashboard", path: "/dashboard", icon: Home, permission: "dashboard", moduleKey: "page.dashboard" },
  { labelKey: "Orders", defaultLabel: "Tables", path: "/tableoverview?tab=tables", icon: Grid2x2, permission: "tables", moduleKey: "page.tables" },
  { labelKey: "Packet", defaultLabel: "Packet", path: "/tableoverview?tab=packet", icon: ShoppingBag, permission: "packet-orders", moduleKey: "page.packet_orders" },
  { labelKey: "History", defaultLabel: "History", path: "/tableoverview?tab=history", icon: BookOpen, permission: "history", moduleKey: "page.history" },
  { labelKey: "Phone", defaultLabel: "Phone", path: "/tableoverview?tab=phone", icon: Phone, permission: "phone-orders", moduleKey: "page.phone_orders" },
  { labelKey: "Register", defaultLabel: "Register", path: "/tableoverview?tab=register", icon: Wallet, permission: "register", moduleKey: "page.register" },
  { labelKey: "Production", defaultLabel: "Production", path: "/production", icon: Factory, permission: "production", moduleKey: "page.production" },
  { labelKey: "Task", defaultLabel: "Task", path: "/task", icon: ClipboardList, permission: "task", moduleKey: "page.task" },
  { labelKey: "Ingredient Prices", defaultLabel: "Ingredient Prices", path: "/ingredient-prices", icon: FlaskConical, permission: "ingredient-prices", moduleKey: "page.ingredient_prices" },
  { labelKey: "Expenses", defaultLabel: "Expenses", path: "/expenses", icon: Receipt, permission: "expenses", moduleKey: "page.expenses" },
  { labelKey: "Integrations", defaultLabel: "Integrations", path: "/integrations", icon: Puzzle, permission: "integrations", moduleKey: "page.integrations" },
  { labelKey: "Maintenance", defaultLabel: "Maintenance", path: "/maintenance", icon: Wrench, permission: "dashboard", moduleKey: "page.maintenance" },
  { labelKey: "QR Menu", defaultLabel: "QR Menu", path: "/qr-menu-settings", icon: QrCode, permission: "qr-menu-settings", moduleKey: "page.qr_menu_settings" },
  { labelKey: "Customer Insights", defaultLabel: "Customer Insights", path: "/customer-insights", icon: UserCheck, permission: "dashboard", moduleKey: "page.customer_insights" },
  { labelKey: "Marketing Campaigns", defaultLabel: "Marketing Campaigns", path: "/marketing-campaigns", icon: Megaphone, permission: "dashboard", moduleKey: "page.marketing_campaigns" },
  { labelKey: "Cash History", defaultLabel: "Cash History", path: "/cash-register-history", icon: CreditCard, permission: "cash-register-history", moduleKey: "page.cash_register_history" },
  { labelKey: "Products", defaultLabel: "Products", path: "/products", icon: Utensils, permission: "products", moduleKey: "page.products" },
  { labelKey: "Suppliers", defaultLabel: "Suppliers", path: "/suppliers", icon: Package, permission: "suppliers", moduleKey: "page.suppliers" },
  { labelKey: "Stock", defaultLabel: "Stock", path: "/stock", icon: BarChart, permission: "stock", moduleKey: "page.stock" },
  { labelKey: "Kitchen", defaultLabel: "Kitchen", path: "/kitchen", icon: ChefHat, permission: "kitchen", moduleKey: "page.kitchen" },
  { labelKey: "Reports", defaultLabel: "Reports", path: "/reports", icon: FileText, permission: "reports", moduleKey: "page.reports" },
  { labelKey: "Staff", defaultLabel: "Staff", path: "/staff", icon: Users, permission: "staff", moduleKey: "page.staff" },
  { labelKey: "Settings", defaultLabel: "Settings", path: "/settings", icon: Settings, permission: "settings", moduleKey: "page.settings" },
];

const HIDDEN_STORAGE_KEY = "beyproHiddenSidebarItems";
const ORDER_STORAGE_KEY = "beyproSidebarOrder";
const SIDEBAR_ITEM_DRAG_TYPE = "application/x-sidebar-item";
const ORDERABLE_KEYS = MENU.map((item) => item.labelKey);
const ORDERABLE_SET = new Set(ORDERABLE_KEYS);
const DEFAULT_HIDDEN_KEYS = [
  "History",
  "Phone",
  "Register",
  "Task",
  "Ingredient Prices",
  "Expenses",
  "Integrations",
  "Maintenance",
  "Customer Insights",
  "Cash History",
  "Marketing Campaigns",
  "Production",
];

const languageOptions = [
  { label: "EN", name: "English", code: "en" },
  { label: "TR", name: "Turkish", code: "tr" },
  { label: "DE", name: "German", code: "de" },
  { label: "FR", name: "French", code: "fr" },
];

function readStoredUser() {
  if (typeof window === "undefined") return null;
  const tryParse = (storage) => {
    if (!storage) return null;
    try {
      const raw = storage.getItem("beyproUser");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  return tryParse(window.sessionStorage) || tryParse(window.localStorage);
}

function getDisplayName(user) {
  if (!user || typeof user !== "object") return null;
  return (
    user?.name ||
    user?.full_name ||
    user?.fullName ||
    user?.username ||
    user?.email ||
    null
  );
}

function normalizeLanguageCode(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const mapped =
    lower === "english"
      ? "en"
      : lower === "turkish"
        ? "tr"
        : lower === "german"
          ? "de"
          : lower === "french"
            ? "fr"
            : lower.split("-")[0];

  return languageOptions.some((opt) => opt.code === mapped) ? mapped : null;
}

function readStoredLanguage() {
  if (typeof window === "undefined") return null;
  try {
    return (
      normalizeLanguageCode(window.localStorage.getItem("beyproLanguage")) ||
      normalizeLanguageCode(window.localStorage.getItem("beyproGuestLanguage"))
    );
  } catch {
    return null;
  }
}

function readHiddenKeys(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return DEFAULT_HIDDEN_KEYS.filter((key) => key !== "Dashboard");
    }
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter((key) => key && key !== "Dashboard");
    return filtered;
  } catch {
    return [];
  }
}

function normalizeOrder(order, defaults) {
  if (!Array.isArray(order)) return [...defaults];
  const defaultSet = new Set(defaults);
  const seen = new Set();
  const result = [];

  order.forEach((key) => {
    if (!defaultSet.has(key) || seen.has(key)) return;
    seen.add(key);
    result.push(key);
  });

  defaults.forEach((key) => {
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  });

  return result;
}

function readOrder(storageKey) {
  if (typeof window === "undefined") return [...ORDERABLE_KEYS];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = JSON.parse(raw || "[]");
    return normalizeOrder(parsed, ORDERABLE_KEYS);
  } catch {
    return [...ORDERABLE_KEYS];
  }
}

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isModuleAllowed } = usePlanModules();
  const storedUser = readStoredUser();
  const displayName = getDisplayName(currentUser) || getDisplayName(storedUser);
  const isLoggedIn = !!(currentUser || storedUser);
  const { t, i18n } = useTranslation();
  const { currencyKey, setCurrencyKey } = useCurrency();
  const tenantId =
    currentUser?.tenant_id ||
    currentUser?.restaurant_id ||
    (typeof window !== "undefined" ? window.localStorage.getItem("restaurant_id") : null) ||
    "default";
  const storageKey = `${HIDDEN_STORAGE_KEY}::${tenantId}`;
  const orderStorageKey = `${ORDER_STORAGE_KEY}::${tenantId}`;

  const [hiddenKeys, setHiddenKeys] = useState(() => readHiddenKeys(storageKey));
  const [customOrder, setCustomOrder] = useState(() => readOrder(orderStorageKey));
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const hasDashboardPermission = useMemo(
    () => (currentUser ? hasPermission("dashboard", currentUser) : false),
    [currentUser]
  );
  const isAdminUser = useMemo(
    () => String(currentUser?.role || "").toLowerCase() === "admin",
    [currentUser]
  );

  useEffect(() => {
    setHiddenKeys(readHiddenKeys(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(hiddenKeys));
  }, [hiddenKeys, storageKey]);

  useEffect(() => {
    setCustomOrder(readOrder(orderStorageKey));
  }, [orderStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(orderStorageKey, JSON.stringify(customOrder));
  }, [customOrder, orderStorageKey]);

  const orderedMenu = useMemo(() => {
    const lookup = new Map(MENU.map((item) => [item.labelKey, item]));
    return normalizeOrder(customOrder, ORDERABLE_KEYS)
      .map((key) => lookup.get(key))
      .filter(Boolean);
  }, [customOrder]);

  const finalMenu = useMemo(() => {
    const dynamicItem = !isLoggedIn
      ? { labelKey: "Login", defaultLabel: "Login", path: "/login", icon: LogIn }
      : { labelKey: "Logout", defaultLabel: "Logout", path: "#", icon: LogOut, action: "logout" };

    if (!currentUser) {
      return [dynamicItem];
    }

    const filteredMenu = orderedMenu.filter((item) => {
      if (
        item.labelKey !== "Dashboard" &&
        hasDashboardPermission &&
        hiddenKeys.includes(item.labelKey)
      )
        return false;

      if (item.moduleKey && !isModuleAllowed(item.moduleKey)) return false;

      const permKey = item.permission || item.labelKey?.toLowerCase();
      return hasPermission(permKey, currentUser);
    });

    return [...filteredMenu, dynamicItem];
  }, [currentUser, hiddenKeys, isLoggedIn, orderedMenu]);

  const canSeeLocalization = useMemo(() => {
    if (!currentUser) return false;
    return (
      hasPermission("settings-localization", currentUser) ||
      hasPermission("settings", currentUser)
    );
  }, [currentUser]);

  const [sidebarLanguage, setSidebarLanguage] = useState("en");
  const [sidebarCurrency, setSidebarCurrency] = useState(currencyKey || "₺ TRY");
  const lastSavedLocalization = useRef({ language: null, currency: null });
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (!canSeeLocalization) return undefined;

    let active = true;
    secureFetch("/settings/localization")
      .then((data) => {
        if (!active) return;

        const storedLanguage = readStoredLanguage();
        const serverLanguage = normalizeLanguageCode(data?.language);
        const currentLanguage = normalizeLanguageCode(i18n.language);
        const nextLanguage = storedLanguage || serverLanguage || currentLanguage || "en";
        const nextCurrency = data?.currency || currencyKey || "₺ TRY";

        setSidebarLanguage(nextLanguage);
        if (normalizeLanguageCode(i18n.language) !== nextLanguage) {
          i18n.changeLanguage(nextLanguage);
        }

        setSidebarCurrency(nextCurrency);
        setCurrencyKey?.(nextCurrency);

        lastSavedLocalization.current = {
          language: nextLanguage,
          currency: nextCurrency,
        };
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load localization:", err);
      });

    return () => {
      active = false;
    };
  }, [canSeeLocalization, i18n, setCurrencyKey]);

  useEffect(() => {
    if (!currencyKey) return;
    setSidebarCurrency(currencyKey);
  }, [currencyKey]);

  const saveLocalization = useCallback(
    async ({ language, currency }) => {
      try {
        await secureFetch("/settings/localization", {
          method: "POST",
          body: JSON.stringify({ language, currency }),
        });
        lastSavedLocalization.current = { language, currency };
      } catch (err) {
        console.error("❌ Failed to save localization:", err);
        toast.error(
          t("Failed to save localization", {
            defaultValue: "Failed to save localization",
          })
        );
      }
    },
    [t]
  );

  useEffect(() => {
    if (!canSeeLocalization) return undefined;

    const last = lastSavedLocalization.current;
    if (sidebarLanguage === last.language && sidebarCurrency === last.currency) return undefined;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveLocalization({ language: sidebarLanguage, currency: sidebarCurrency });
    }, 450);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [canSeeLocalization, saveLocalization, sidebarCurrency, sidebarLanguage]);

  function handleLogout() {
    setIsOpen?.(false);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("beyproUser");
    } catch {}
    try {
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("beyproUser");
    } catch {}
    safeNavigate("/login");
  }

    const handleHideItem = (labelKey) => (event) => {
      if (!isAdminUser || labelKey === "Dashboard") return;
      event.preventDefault();
      event.stopPropagation();
      setHiddenKeys((prev) => (prev.includes(labelKey) ? prev : [...prev, labelKey]));
    };

  const handleDragStartItem = (labelKey) => (event) => {
    if (!ORDERABLE_SET.has(labelKey)) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(SIDEBAR_ITEM_DRAG_TYPE, labelKey);
    setDragKey(labelKey);
  };

  const handleDragOverItem = (labelKey) => (event) => {
    const hasDashboardPayload =
      event.dataTransfer.types &&
      Array.from(event.dataTransfer.types).includes(DASHBOARD_ITEM_DRAG_TYPE);
    const canHandleDashboard = hasDashboardPayload && ORDERABLE_SET.has(labelKey);
    const canHandleSidebarDrag =
      dragKey && dragKey !== labelKey && ORDERABLE_SET.has(labelKey);
    if (!canHandleDashboard && !canHandleSidebarDrag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverKey((prev) => (prev === labelKey ? prev : labelKey));
  };

  const handleDragLeaveItem = (labelKey) => () => {
    setDragOverKey((prev) => (prev === labelKey ? null : prev));
  };

  const handleDropItem = (labelKey) => (event) => {
    if (!ORDERABLE_SET.has(labelKey)) return;
    event.preventDefault();
    event.stopPropagation();

    const dashboardPayload = event.dataTransfer.getData(DASHBOARD_ITEM_DRAG_TYPE);
    if (dashboardPayload) {
      try {
        const payload = JSON.parse(dashboardPayload);
        const incomingKey = payload.labelKey;
        if (ORDERABLE_SET.has(incomingKey)) {
          setHiddenKeys((prev) => prev.filter((key) => key !== incomingKey));
          setCustomOrder((prev) => {
            const normalized = normalizeOrder(prev, ORDERABLE_KEYS);
            const withoutIncoming = normalized.filter((key) => key !== incomingKey);
            const targetIndex = withoutIncoming.indexOf(labelKey);
            if (targetIndex === -1) {
              withoutIncoming.push(incomingKey);
            } else {
              withoutIncoming.splice(targetIndex, 0, incomingKey);
            }
            return normalizeOrder(withoutIncoming, ORDERABLE_KEYS);
          });
        }
      } catch {
        /* ignore malformed payload */
      }
      setDragOverKey(null);
      setDragKey(null);
      return;
    }

    const source =
      event.dataTransfer.getData(SIDEBAR_ITEM_DRAG_TYPE) || dragKey;
    setDragOverKey(null);
    setDragKey(null);
    if (!source || source === labelKey || !ORDERABLE_SET.has(source)) return;

    setCustomOrder((prev) => {
      const normalized = normalizeOrder(prev, ORDERABLE_KEYS);
      const withoutSource = normalized.filter((key) => key !== source);
      const targetIndex = withoutSource.indexOf(labelKey);
      if (targetIndex === -1) {
        withoutSource.push(source);
      } else {
        withoutSource.splice(targetIndex, 0, source);
      }
      return normalizeOrder(withoutSource, ORDERABLE_KEYS);
    });
  };

  const handleDragEndItem = () => {
    setDragKey(null);
    setDragOverKey(null);
  };

  const handleContainerDragOver = (event) => {
    if (!isOpen) return;
    const hasDashboardPayload =
      event.dataTransfer.types &&
      Array.from(event.dataTransfer.types).includes(DASHBOARD_ITEM_DRAG_TYPE);
    if (!dragKey && !hasDashboardPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleContainerDrop = (event) => {
    if (!isOpen) return;
    event.preventDefault();
    event.stopPropagation();

    const dashboardPayload = event.dataTransfer.getData(DASHBOARD_ITEM_DRAG_TYPE);
    if (dashboardPayload) {
      try {
        const payload = JSON.parse(dashboardPayload);
        const incomingKey = payload.labelKey;
        if (ORDERABLE_SET.has(incomingKey)) {
          setHiddenKeys((prev) => prev.filter((key) => key !== incomingKey));
          setCustomOrder((prev) => {
            const normalized = normalizeOrder(prev, ORDERABLE_KEYS);
            const withoutIncoming = normalized.filter((key) => key !== incomingKey);
            withoutIncoming.push(incomingKey);
            return normalizeOrder(withoutIncoming, ORDERABLE_KEYS);
          });
        }
      } catch {
        /* ignore malformed payload */
      }
      setDragOverKey(null);
      setDragKey(null);
      return;
    }

    const source =
      event.dataTransfer.getData(SIDEBAR_ITEM_DRAG_TYPE) || dragKey;
    setDragOverKey(null);
    setDragKey(null);
    if (!source || !ORDERABLE_SET.has(source)) return;

    setCustomOrder((prev) => {
      const normalized = normalizeOrder(prev, ORDERABLE_KEYS);
      const withoutSource = normalized.filter((key) => key !== source);
      withoutSource.push(source);
      return normalizeOrder(withoutSource, ORDERABLE_KEYS);
    });
  };

  const handleNavClick = (targetPath) => (event) => {
    if (dragKey) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    setIsOpen?.(false);
  };

  const sidebarWidth = isOpen ? SIDEBAR_WIDTH_OPEN : SIDEBAR_WIDTH_COLLAPSED;

  return (
    <aside
      className={`
        fixed top-0 left-0 z-50 h-screen
        transition-all duration-300 ease-in-out
        bg-gradient-to-br from-blue-800/90 via-blue-700/80 to-blue-900/90
        shadow-2xl border-r border-white/15
        backdrop-blur-2xl
        flex flex-col items-center md:items-stretch py-3 px-0
      `}
      style={{ width: `${sidebarWidth}px` }}
    >

      {/* Logo */}
      <div
        className={`flex gap-2 py-2 transition-all ${
          isOpen ? "flex-row items-center justify-center px-3" : "flex-col items-center justify-center"
        }`}
      >
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title={t(isOpen ? "Collapse sidebar" : "Expand sidebar", {
            defaultValue: isOpen ? "Collapse sidebar" : "Expand sidebar",
          })}
          className={`
            relative flex flex-col items-center justify-center
            rounded-lg outline-none focus:ring-2 focus:ring-fuchsia-400
            transition-transform duration-200
            ${isOpen ? "w-8 h-8 md:w-14 md:h-14" : "w-10 h-10"}
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
      {/* User name will be shown at the bottom below logout */}


      {/* Menu */}
      <nav
        className="flex-1 flex flex-col gap-0 mt-6"
        onDragOver={handleContainerDragOver}
        onDrop={handleContainerDrop}
      >
{finalMenu.map((item) => {
    const active = location.pathname + location.search === item.path;
    const Icon = item.icon;
    const label = t(item.labelKey, {
      defaultValue: item.defaultLabel ?? item.labelKey,
    });
    const hideable =
      item.action !== "logout" && item.path !== "/login" && item.labelKey !== "Dashboard";
    const isOrderable = ORDERABLE_SET.has(item.labelKey);
    const canDrag = isOrderable && isOpen;
    const isDragOver = canDrag && dragOverKey === item.labelKey && dragKey !== item.labelKey;

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
        className={`group flex items-center gap-3 px-3 py-3 rounded-xl mx-2 my-1 text-white hover:bg-white/10 hover:text-fuchsia-300 transition shadow-lg relative ${
          active
            ? "bg-gradient-to-r from-fuchsia-400/30 via-indigo-400/20 to-blue-600/40 ring-2 ring-fuchsia-300"
            : ""
        } ${isDragOver ? "ring-2 ring-white/70" : ""}`}
        title={label}
        draggable={canDrag}
        onDragStart={canDrag ? handleDragStartItem(item.labelKey) : undefined}
        onDragOver={canDrag ? handleDragOverItem(item.labelKey) : undefined}
        onDragLeave={canDrag ? handleDragLeaveItem(item.labelKey) : undefined}
        onDrop={canDrag ? handleDropItem(item.labelKey) : undefined}
        onDragEnd={canDrag ? handleDragEndItem : undefined}
        onClick={handleNavClick(item.path)}
      >
        <Icon size={24} />
        {isOpen && (
          <>
            <span className="font-medium truncate flex-1">{label}</span>
            {hideable && isAdminUser && (
              <button
                type="button"
                onClick={handleHideItem(item.labelKey)}
                className="ml-2 p-1 rounded-full hover:bg-white/20 transition"
                title={t("Hide tab", { defaultValue: "Hide tab" })}
              >
                <X size={14} />
              </button>
            )}
          </>
        )}
        {!isOpen && (
          <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
            {label}
          </span>
        )}
      </NavLink>
    );
  })}

      </nav>

      {canSeeLocalization && (
        <div className="w-full px-2 mt-2">
          <div className="mx-2 my-2 h-px bg-white/15" />
          {isOpen ? (
            <div className="mx-2 my-2 rounded-xl border border-white/15 bg-white/5 px-2 py-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <Globe size={16} className="text-white/70 flex-shrink-0" />
                <label className="sr-only" htmlFor="sidebar-language">
                  {t("Language", { defaultValue: "Language" })}
                </label>
                <select
                  id="sidebar-language"
                  value={sidebarLanguage || "en"}
                  onChange={(e) => {
                    const selectedLang = e.target.value || "en";
                    setSidebarLanguage(selectedLang);
                    i18n.changeLanguage(selectedLang);
                    try {
                      localStorage.setItem("beyproLanguage", selectedLang);
                      localStorage.setItem("beyproGuestLanguage", selectedLang);
                    } catch {}
                  }}
                  title={t("Language", { defaultValue: "Language" })}
                  className="h-8 w-[68px] rounded-lg px-2 bg-white/10 text-white text-xs font-bold border border-white/15 focus:ring-2 focus:ring-fuchsia-300/60 outline-none"
                >
                  {languageOptions.map((opt) => (
                    <option key={opt.code} value={opt.code} className="text-slate-900">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <select
                  id="sidebar-currency"
                  value={sidebarCurrency}
                  onChange={(e) => {
                    setSidebarCurrency(e.target.value);
                    setCurrencyKey?.(e.target.value);
                  }}
                  title={t("Currency", { defaultValue: "Currency" })}
                  className="ml-auto h-8 w-[118px] rounded-lg px-2 bg-white/10 text-white text-[11px] font-bold border border-white/15 focus:ring-2 focus:ring-fuchsia-300/60 outline-none"
                >
                  {CURRENCY_KEYS.map((cur) => (
                    <option key={cur} value={cur} className="text-slate-900">
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen?.(true)}
              className="group flex items-center justify-center w-full px-3 py-3 rounded-xl mx-2 my-1 text-white hover:bg-white/10 hover:text-fuchsia-300 transition shadow-lg relative"
              title={t("Language & Localization", {
                defaultValue: "Language & Localization",
              })}
            >
              <Globe size={24} />
              <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
                {t("Language & Localization", {
                  defaultValue: "Language & Localization",
                })}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col items-center gap-2 px-4 text-center">
        {displayName && (
          <span className="w-full max-w-[180px] truncate text-center text-xs uppercase tracking-[0.3em] text-white/60">
            {displayName}
          </span>
        )}
        <NavLink
          to="/dashboard"
          className="flex items-center justify-center rounded-lg focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
          aria-label="Go to dashboard"
          onClick={() => setIsOpen?.(false)}
        >
          <img
            src="/Beylogo.svg"
            alt="Beypro"
            className={isOpen ? "h-8 w-auto" : "h-8 w-8"}
          />
        </NavLink>
      </div>
    </aside>
  );
}
