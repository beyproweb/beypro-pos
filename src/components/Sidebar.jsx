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
  Lock,
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
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingCart,
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
import {
  DEFAULT_LANGUAGE,
  normalizeLanguageCode,
  persistLanguage,
  readStoredLanguage,
  resolvePreferredLanguage,
} from "../utils/language";

export const SIDEBAR_WIDTH_OPEN = 196;
export const SIDEBAR_WIDTH_COLLAPSED = 64;
export const DASHBOARD_ITEM_DRAG_TYPE = "application/x-dashboard-shortcut";
const MAX_VISIBLE_SIDEBAR_TABS = 9;

const MENU = [
  { labelKey: "Dashboard", defaultLabel: "Dashboard", path: "/dashboard", icon: Home, permission: "dashboard", moduleKey: "page.dashboard" },
  { labelKey: "Orders", defaultLabel: "Tables", path: "/tableoverview?tab=tables", icon: Grid2x2, permission: ["tables", "view-booking", "song-request"], moduleKey: "page.tables" },
  { labelKey: "Tickets/Orders", defaultLabel: "Tickets/Orders", path: "/tableoverview?tab=takeaway", icon: ShoppingCart, permission: "takeaway", moduleKey: "page.takeaway_overview" },
  { labelKey: "All Orders", defaultLabel: "All Orders", path: "/tableoverview?tab=kitchen", icon: ClipboardList, permission: "kitchen", moduleKey: "page.kitchen" },
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
  { labelKey: "Customer Insights", defaultLabel: "Customer Profile", path: "/customer-insights", icon: UserCheck, permission: "dashboard", moduleKey: "page.customer_insights" },
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

// Always keep these directly under Dashboard in the sidebar.
const PINNED_KEYS = ["Dashboard", "Orders", "Tickets/Orders", "All Orders", "Packet", "Phone", "Register"];
const PINNED_SET = new Set(PINNED_KEYS);

const HIDDEN_STORAGE_KEY = "beyproHiddenSidebarItems";
const ORDER_STORAGE_KEY = "beyproSidebarOrder";
const AUTH_STORAGE_KEY = "beypro_auth_storage";
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
  "Customer Profile",
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

function readHiddenKeys(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return DEFAULT_HIDDEN_KEYS.filter((key) => !PINNED_SET.has(key));
    }
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter((key) => key && !PINNED_SET.has(key));
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

export default function Sidebar({ isOpen, setIsOpen, onLockClick }) {
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

    const lookup = new Map(MENU.map((item) => [item.labelKey, item]));
    const pinnedMenu = PINNED_KEYS.map((key) => lookup.get(key)).filter(Boolean);
    const menuWithPinned = [
      ...pinnedMenu,
      ...orderedMenu.filter((item) => !PINNED_SET.has(item.labelKey)),
    ];

    const filteredMenu = menuWithPinned.filter((item) => {
      if (
        !PINNED_SET.has(item.labelKey) &&
        hasDashboardPermission &&
        hiddenKeys.includes(item.labelKey)
      )
        return false;

      if (item.moduleKey && !isModuleAllowed(item.moduleKey)) return false;

      const permKey = item.permission || item.labelKey?.toLowerCase();
      return hasPermission(permKey, currentUser);
    });

    const limitedMenu = filteredMenu.slice(0, MAX_VISIBLE_SIDEBAR_TABS);
    const activePath = location.pathname + location.search;
    const activeItem = filteredMenu.find((item) => item.path === activePath);

    if (activeItem && !limitedMenu.some((item) => item.labelKey === activeItem.labelKey)) {
      limitedMenu[limitedMenu.length - 1] = activeItem;
    }

    return [...limitedMenu, dynamicItem];
  }, [
    currentUser,
    hasDashboardPermission,
    hiddenKeys,
    isLoggedIn,
    isModuleAllowed,
    location.pathname,
    location.search,
    orderedMenu,
  ]);

  const canSeeLocalization = useMemo(() => {
    if (!currentUser) return false;
    return (
      hasPermission("settings-localization", currentUser) ||
      hasPermission("settings", currentUser)
    );
  }, [currentUser]);
  const canShowLanguageSelector = useMemo(() => isLoggedIn, [isLoggedIn]);

  const [sidebarLanguage, setSidebarLanguage] = useState(DEFAULT_LANGUAGE);
  const [sidebarCurrency, setSidebarCurrency] = useState(currencyKey || "₺ TRY");
  const lastSavedLocalization = useRef({ language: null, currency: null });
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (!canShowLanguageSelector) return undefined;

    if (!canSeeLocalization) {
      const storedLanguage = readStoredLanguage();
      const currentLanguage = normalizeLanguageCode(i18n.language);
      const nextLanguage = resolvePreferredLanguage({
        preferred: storedLanguage || currentLanguage,
      });

      setSidebarLanguage(nextLanguage);
      if (normalizeLanguageCode(i18n.language) !== nextLanguage) {
        i18n.changeLanguage(nextLanguage);
      }

      if (currencyKey) {
        setSidebarCurrency(currencyKey);
      }
      return undefined;
    }

    let active = true;
    secureFetch("/settings/localization")
      .then((data) => {
        if (!active) return;

        const storedLanguage = readStoredLanguage();
        const serverLanguage = normalizeLanguageCode(data?.language);
        const currentLanguage = normalizeLanguageCode(i18n.language);
        const nextLanguage = resolvePreferredLanguage({
          storage: localStorage,
          preferred: storedLanguage || serverLanguage || currentLanguage,
        });
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
  }, [canSeeLocalization, canShowLanguageSelector, currencyKey, i18n, setCurrencyKey]);

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
    // ✅ Preserve restaurant_id for staff PIN login
    const restaurantId = localStorage.getItem("restaurant_id");
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("beyproUser");
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
    try {
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("beyproUser");
    } catch {}
    // ✅ Restore restaurant_id after clearing storage
    if (restaurantId) {
      try {
        localStorage.setItem("restaurant_id", restaurantId);
      } catch {}
    }
    safeNavigate("/login");
  }

    const handleHideItem = (labelKey) => (event) => {
      if (!isAdminUser || PINNED_SET.has(labelKey)) return;
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
        ios-safe-sidebar fixed top-0 left-0 z-50 h-screen
        transition-all duration-300 ease-in-out
        shadow-2xl border-r border-white/15
        backdrop-blur-2xl
        flex flex-col items-center md:items-stretch py-2 px-0
      `}
      style={{
        width: `${sidebarWidth}px`,
        background:
          "linear-gradient(160deg, rgb(var(--accent-from) / 0.88), rgb(var(--accent-to) / 0.8) 52%, rgb(15 23 42 / 0.96))",
      }}
    >

      {/* Logo */}
      <div
        className={`flex gap-1.5 py-1.5 transition-all ${
          isOpen ? "flex-row items-center justify-center px-2.5" : "flex-col items-center justify-center"
        }`}
      >
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title={t(isOpen ? "Collapse sidebar" : "Expand sidebar", {
            defaultValue: isOpen ? "Collapse sidebar" : "Expand sidebar",
          })}
          className={`
            relative flex flex-col items-center justify-center
            rounded-lg outline-none focus:ring-2 focus:ring-accent/60
            transition-transform duration-200
            ${isOpen ? "w-8 h-8 md:w-11 md:h-11" : "w-9 h-9"}
            bg-white/5 hover:bg-white/10 border border-white/20 shadow-lg
            hover:scale-105 active:scale-95
          `}
        >
          {isOpen ? (
            <PanelLeftClose size={20} className="text-white" strokeWidth={2.2} />
          ) : (
            <PanelLeftOpen size={18} className="text-white" strokeWidth={2.2} />
          )}
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
        className="mt-4 flex flex-1 flex-col gap-0"
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
      item.action !== "logout" && item.path !== "/login" && !PINNED_SET.has(item.labelKey);
    const isOrderable = ORDERABLE_SET.has(item.labelKey);
    const canDrag = isOrderable && isOpen && !PINNED_SET.has(item.labelKey);
    const isDragOver = canDrag && dragOverKey === item.labelKey && dragKey !== item.labelKey;

    return item.action === "logout" ? (
      <>
        {/* Lock Button - above logout */}
        {onLockClick && (
          <button
            onClick={() => {
              onLockClick();
              setIsOpen(false);
            }}
            className="group relative mx-1.5 my-0.5 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white shadow-lg transition hover:bg-orange-500/20 hover:text-orange-300"
            title={t("Lock Session", { defaultValue: "Lock Session" })}
          >
            <Lock size={20} />
            {isOpen && <span className="truncate text-sm font-medium">{t("Lock Session", { defaultValue: "Lock Session" })}</span>}
            {!isOpen && (
              <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
                {t("Lock Session", { defaultValue: "Lock Session" })}
              </span>
            )}
          </button>
        )}
        <button
          key={item.labelKey}
          onClick={handleLogout}
          className={`group relative mx-1.5 my-0.5 flex items-center gap-2.5 rounded-xl px-2.5 py-2
            text-white hover:bg-white/10 hover:text-white transition shadow-lg relative
            ${active ? "bg-white/20 shadow-2xl ring-2 ring-accent/60" : ""}
          `}
        >
          <Icon size={20} />
          {isOpen && <span className="truncate text-sm font-medium">{label}</span>}
        </button>
      </>
    ) : (
      <NavLink
        key={item.labelKey}
        to={item.path}
        className={`group relative mx-1.5 my-0.5 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white hover:bg-white/10 hover:text-white transition shadow-lg ${
          active
            ? "bg-accent ring-2 ring-white/60"
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
        <Icon size={20} />
        {isOpen && (
          <>
            <span className="flex-1 truncate text-sm font-medium">{label}</span>
            {hideable && isAdminUser && (
              <button
                type="button"
                onClick={handleHideItem(item.labelKey)}
                className="ml-1 p-0.5 rounded-full hover:bg-white/20 transition"
                title={t("Hide tab", { defaultValue: "Hide tab" })}
              >
                <X size={12} />
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

      {canShowLanguageSelector && (
        <div className="mt-0.5 w-full px-1.5">
          <div className="mx-1.5 my-1.5 h-px bg-white/15" />
          {isOpen ? (
            <div className="mx-1.5 my-1.5 rounded-xl border border-white/15 bg-white/5 px-2 py-1.5 shadow-lg">
              <div className="flex min-w-0 items-center gap-1.5">
                <Globe size={14} className="text-white/70 flex-shrink-0" />
                <label className="sr-only" htmlFor="sidebar-language">
                  {t("Language", { defaultValue: "Language" })}
                </label>
                <select
                  id="sidebar-language"
                  value={sidebarLanguage || DEFAULT_LANGUAGE}
                  onChange={(e) => {
                    const selectedLang = e.target.value || DEFAULT_LANGUAGE;
                    setSidebarLanguage(selectedLang);
                    i18n.changeLanguage(selectedLang);
                    persistLanguage(selectedLang, localStorage);
                  }}
                  title={t("Language", { defaultValue: "Language" })}
                  className="h-7 w-[62px] rounded-lg px-1.5 bg-white/10 text-white text-[11px] font-bold border border-white/15 focus:ring-2 focus:ring-accent/60 outline-none"
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
                  className="ml-auto h-7 w-[104px] rounded-lg px-1.5 bg-white/10 text-white text-[10px] font-bold border border-white/15 focus:ring-2 focus:ring-accent/60 outline-none"
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
              className="group relative mx-1.5 my-0.5 flex w-full items-center justify-center rounded-xl px-2.5 py-2 text-white shadow-lg transition hover:bg-white/10 hover:text-white"
              title={t("Language & Localization", {
                defaultValue: "Language & Localization",
              })}
            >
              <Globe size={20} />
              <span className="absolute left-[110%] bg-black/70 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition">
                {t("Language & Localization", {
                  defaultValue: "Language & Localization",
                })}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="mb-1.5 flex flex-col items-center gap-1 px-2.5 text-center">
        {displayName && (
          <span className="w-full max-w-[140px] truncate text-center text-[10px] uppercase tracking-[0.18em] text-white/55">
            {displayName}
          </span>
        )}
        <NavLink
          to="/dashboard"
          className="flex min-h-8 items-center justify-center rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-accent/60"
          aria-label="Go to dashboard"
          onClick={() => setIsOpen?.(false)}
        >
          <img
            src="/Beylogo.svg"
            alt="Beypro"
            className={isOpen ? "h-6 w-auto" : "h-6 w-6"}
          />
        </NavLink>
      </div>
    </aside>
  );
}
