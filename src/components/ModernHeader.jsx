// src/components/ModernHeader.jsx
import React from "react";
import { Menu, Lock, Search, ArrowRight, Star, Home, Mic } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSetting } from "./hooks/useSetting";
import { useHasPermission } from "./hooks/useHasPermission";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { useAuth } from "../context/AuthContext";
import { isPublicShellPath } from "../utils/routeScope";

/**
 * Prevents flicker of customer name / address (subtitle)
 * when re-fetches or socket updates cause brief empty props.
 */
function StickySubtitle({ text }) {
  const [lastNonEmpty, setLastNonEmpty] = React.useState("");

  React.useEffect(() => {
    if (typeof text !== "string") {
      setLastNonEmpty("");
      return;
    }

    const next = text.trim();

    setLastNonEmpty((prev) => {
      if (next.length === 0) {
        return prev === "" ? prev : "";
      }
      return prev === next ? prev : next;
    });
  }, [text]);

  const trimmed = typeof text === "string" ? text.trim() : "";
  const displayText = trimmed || lastNonEmpty;
  if (!displayText) return null;

  return (
    <span
      className="text-base font-semibold text-blue-700 dark:text-blue-200 opacity-90 truncate max-w-[400px] text-center transition-all duration-200"
    >
      {displayText}
    </span>
  );
}

function renderHighlightedText(text, query) {
  const source = String(text ?? "");
  const needle = String(query ?? "").trim();
  if (!source || !needle) return source;

  const lowerSource = source.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts = [];
  let startIndex = 0;
  let matchIndex = lowerSource.indexOf(lowerNeedle);

  if (matchIndex === -1) return source;

  while (matchIndex !== -1) {
    if (matchIndex > startIndex) {
      parts.push(source.slice(startIndex, matchIndex));
    }
    const endIndex = matchIndex + needle.length;
    parts.push(
      <mark
        key={`${matchIndex}-${endIndex}`}
        className="rounded bg-transparent px-0 font-extrabold text-current"
      >
        {source.slice(matchIndex, endIndex)}
      </mark>
    );
    startIndex = endIndex;
    matchIndex = lowerSource.indexOf(lowerNeedle, startIndex);
  }

  if (startIndex < source.length) {
    parts.push(source.slice(startIndex));
  }

  return parts;
}

function buildScoredSearchResults(destinations, rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) return [];

  const tokens = query.split(/\s+/).filter(Boolean);

  return destinations
    .map((item) => {
      const haystacks = [item.label, item.description, ...(item.searchTerms || [])]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      let score = 0;
      haystacks.forEach((value) => {
        if (value === query) score += 100;
        if (value.includes(query)) score += 40;
        tokens.forEach((token) => {
          if (value === token) score += 20;
          else if (value.includes(token)) score += 8;
        });
      });

      return { ...item, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, 6);
}

export default function ModernHeader({
  title = "",
  subtitle,
  notificationBell,
  onSidebarToggle,
  userName = "Manager",
  onThemeToggle,
  centerNav,
  tableNav,
  theme = "light",
  hasNotification = false,
  onBellClick,
  rightContent,
  previousRoute,
  tableStats = null,
  onLockClick, // New prop for manual lock
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const searchRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const speechRecognitionRef = React.useRef(null);
  const favoritesStorageKeys = React.useMemo(() => {
    const restaurantIdentity = currentUser?.restaurant_id ?? "global";
    const identities = [
      currentUser?.email,
      currentUser?.username,
      currentUser?.id,
      currentUser?.user_id,
      "last",
      "anonymous",
    ]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter(Boolean);

    const uniqueIdentities = identities.filter(
      (value, index) => identities.indexOf(value) === index
    );

    return uniqueIdentities.map(
      (identity) => `modern-header-favorites:${restaurantIdentity}:${identity}`
    );
  }, [
    currentUser?.email,
    currentUser?.id,
    currentUser?.restaurant_id,
    currentUser?.user_id,
    currentUser?.username,
  ]);

  const isTableOverviewRoute =
    location.pathname.includes("/tables") || location.pathname.includes("/tableoverview");
  const isPublicShellRoute = isPublicShellPath(location.pathname);
  const isTransactionRoute = location.pathname.includes("/transaction");
  const isDashboardRoute = location.pathname.includes("/dashboard");
  const isOrdersRoute = location.pathname.includes("/orders");
  const isKitchenRoute = location.pathname.includes("/kitchen");
  const isStockRoute = location.pathname.includes("/stock");
  const isProductsRoute = location.pathname.includes("/products");
  const isExpensesRoute = location.pathname.includes("/expenses");
  const isIngredientPricesRoute = location.pathname.includes("/ingredient-prices");
  const isCashRegisterRoute = location.pathname.includes("/cash-register");
  const isCashRegisterHistoryRoute = location.pathname.includes("/cash-register-history");
  const isPrintersRoute = location.pathname.includes("/printers");
  const isProductionRoute = location.pathname.includes("/production");
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const isQrMenuSettingsRoute = location.pathname.includes("/qr-menu-settings");
  const isTaskRoute = location.pathname.includes("/task");
  const isCustomerInsightsRoute = location.pathname.includes("/customer-insights");
  const isMaintenanceRoute = location.pathname.includes("/maintenance");
  const isUserManagementRoute = location.pathname.includes("/user-management");
  const isIntegrationsRoute = location.pathname.includes("/integrations");
  const isSuppliersRoute = location.pathname.startsWith("/suppliers");
  const showHeaderTabs = !isSuppliersRoute;

  const canSeeDashboardTab = useHasPermission("dashboard");
  const canSeeTablesTab = useHasPermission("tables");
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
  const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone-orders");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");
  const canSeeExpensesTab = useHasPermission("expenses");
  const canSeeStock = useHasPermission("stock");
  const canSeeViewBooking = useHasPermission("view-booking");
  const canSeeReports = useHasPermission("reports");
  const canSeeStaff = useHasPermission("staff");
  const canSeePrinters = useHasPermission("settings-printers");
  const canSeeStaffCheckin = useHasPermission("staff-checkin");
  const canSeeStaffSchedule = useHasPermission("staff-schedule");
  const canSeeStaffPayroll = useHasPermission("staff-payroll");
  const canSeeUserManagement = useHasPermission("settings-users");
  const canSeeNotifications = useHasPermission("settings-notifications");
  const canSeeAppearanceSettings = useHasPermission("settings-appearance");
  const canSeeShopHoursSettings = useHasPermission("settings-shop-hours");
  const canSeeLocalizationSettings = useHasPermission("settings-localization");
  const canSeeSubscriptionSettings = useHasPermission("settings-subscription");
  const canSeePaymentsSettings = useHasPermission("settings-payments");
  const canSeeRegisterSettings = useHasPermission("settings-register");
  const canSeeIntegrationsSettings = useHasPermission("settings-integrations");
  const canSeeInventorySettings = useHasPermission("settings-inventory");
  const canSeeCameraSettings = useHasPermission("settings-cameras");
  const canSeeTablesSettings = useHasPermission("settings-tables");
  const canSeeTransactionsSettings = useHasPermission("settings-transactions");
  const [tableSettings, setTableSettings] = React.useState({
    tableLabelText: "",
    showAreas: true,
  });
  useSetting("tables", setTableSettings, {
    tableLabelText: "",
    showAreas: true,
  });
  const tableLabelText = String(tableSettings.tableLabelText || "").trim() || t("Tables");
  const freeTablesCount =
    Number.isFinite(tableStats?.freeTables) && tableStats.freeTables >= 0
      ? tableStats.freeTables
      : null;

  const supplierTabs = React.useMemo(() => {
    const tabs = [
      { kind: "nav", key: "dashboard", label: t("Dashboard") },
      ...(canSeeTablesTab ? [{ kind: "nav", key: "tables", label: tableLabelText }] : []),
      { kind: "switch", key: "suppliers", label: t("Add Product") },
      { kind: "switch", key: "cart", label: t("Supplier Cart") },
      { kind: "section", key: "supplier-overview", label: t("Overview") },
      { kind: "section", key: "transaction-history", label: t("Transactions") },
      { kind: "section", key: "price-tracking", label: t("Price") },
      { kind: "section", key: "profile-balance", label: t("Profile") },
    ];

    return tabs;
  }, [canSeeTablesTab, t, tableLabelText]);

  const supplierView = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    return view === "cart" ? "cart" : "suppliers";
  }, [location.search]);

  const supplierSection = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get("section");
    return section ? String(section) : null;
  }, [location.search]);

  const handleSupplierTabClick = React.useCallback(
    (tab) => {
      const params = new URLSearchParams(location.search);

      if (tab.kind === "nav") {
        if (tab.key === "tables") {
          navigate("/tableoverview?tab=tables");
          return;
        }
        navigate("/dashboard");
        return;
      }

      if (tab.kind === "switch") {
        params.set("view", tab.key);
        if (tab.key === "suppliers") {
          params.set("section", "purchasing-receipts");
        } else {
          params.delete("section");
        }
        navigate(`/suppliers?${params.toString()}`);
        return;
      }

      params.set("view", "suppliers");
      params.set("section", tab.key);
      navigate(`/suppliers?${params.toString()}`);
    },
    [location.search, navigate]
  );

  const headerTabs = React.useMemo(() => {
    const all = [
      { id: "dashboard", label: t("Dashboard") },
      { id: "takeaway", label: t("Pre Order") },
      { id: "tables", label: tableLabelText },
      { id: "kitchen", label: t("All Orders") },
      { id: "history", label: t("History") },
      { id: "packet", label: t("Packet") },
      { id: "phone", label: t("Phone") },
      { id: "expenses", label: t("Expenses") },
      { id: "register", label: t("Register") },
    ];

    if (isQrMenuSettingsRoute) {
      return all.filter((tab) => tab.id === "dashboard" && canSeeDashboardTab);
    }

    return all.filter((tab) => {
      if (tab.id === "dashboard") return canSeeDashboardTab;
      if (tab.id === "takeaway") return canSeeTakeawayTab;
      if (tab.id === "tables") return canSeeTablesTab;
      if (tab.id === "kitchen") return canSeeKitchenTab;
      if (tab.id === "history") return canSeeHistoryTab;
      if (tab.id === "packet") return canSeePacketTab;
      if (tab.id === "phone") return canSeePhoneTab;
      if (tab.id === "expenses") return canSeeExpensesTab;
      if (tab.id === "register") return canSeeRegisterTab;
      return true;
    });
  }, [
    t,
    tableLabelText,
    canSeeDashboardTab,
    canSeeTakeawayTab,
    canSeeTablesTab,
    canSeeKitchenTab,
    canSeeHistoryTab,
    canSeePacketTab,
    canSeePhoneTab,
    canSeeExpensesTab,
    canSeeRegisterTab,
    isQrMenuSettingsRoute,
  ]);

  const activeHeaderTab = React.useMemo(() => {
    if (isDashboardRoute) return "dashboard";
    if (isExpensesRoute) return "expenses";
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab) return String(tab).toLowerCase();
    return isOrdersRoute ? "phone" : "tables";
  }, [isDashboardRoute, isExpensesRoute, location.search, isOrdersRoute]);

  const resolvedActiveHeaderTab = React.useMemo(() => {
    if (isDashboardRoute) return "dashboard";
    if (isExpensesRoute) return "expenses";
    if (isKitchenRoute) return "kitchen";
    if (isTableOverviewRoute) return activeHeaderTab;
    if (isTransactionRoute) return activeHeaderTab;
    if (isStockRoute) return null;
    return null;
  }, [
    activeHeaderTab,
    isDashboardRoute,
    isExpensesRoute,
    isKitchenRoute,
    isStockRoute,
    isTableOverviewRoute,
    isTransactionRoute,
  ]);

  const handleHeaderTabClick = React.useCallback(
    async (tabId) => {
      if (tabId === "dashboard") {
        navigate("/dashboard");
        return;
      }
      if (tabId === "expenses") {
        const isOpen = await checkRegisterOpen();
        if (!isOpen) {
          navigate("/tableoverview?tab=tables", {
            replace: true,
            state: { openRegisterModal: true },
          });
          return;
        }
        navigate("/expenses", { replace: isExpensesRoute });
        return;
      }
      const base = "/tableoverview";
      const params = new URLSearchParams(location.search);
      params.set("tab", tabId);
      params.delete("area");
      navigate(`${base}?${params.toString()}`);
    },
    [isExpensesRoute, location.search, navigate]
  );

  const mobileHeaderTabs = React.useMemo(() => {
    const wanted = new Set(["dashboard", "tables", "phone"]);
    return headerTabs.filter((tab) => wanted.has(tab.id));
  }, [headerTabs]);

  const supplierMobileTabs = React.useMemo(() => {
    const tables = headerTabs.find((tab) => tab.id === "tables");
    const cart = supplierTabs.find((tab) => tab.kind === "switch" && tab.key === "cart");

    return [tables, cart].filter(Boolean);
  }, [headerTabs, supplierTabs]);

  const searchDestinations = React.useMemo(
    () =>
      [
        {
          id: "dashboard",
          label: t("Dashboard"),
          description: t("Open the main dashboard"),
          path: "/dashboard",
          allowed: canSeeDashboardTab,
          searchTerms: ["dashboard", "home", "overview", "main screen"],
        },
        {
          id: "orders",
          label: t("Orders"),
          description: t("Open active order tables"),
          path: "/tableoverview?tab=tables",
          allowed: canSeeTablesTab,
          searchTerms: ["orders", "order", "tables", "table service"],
          quickActions: [
            {
              id: "orders-open",
              label: t("Open Orders"),
              path: "/tableoverview?tab=tables",
            },
            {
              id: "orders-new",
              label: t("Create New Order (+)"),
              path: "/transaction/phone/new",
            },
            {
              id: "orders-unpaid",
              label: t("View Unpaid Tables"),
              path: "/tableoverview?tab=tables&area=__UNPAID__",
            },
          ],
        },
        {
          id: "reports",
          label: t("Reports"),
          description: t("View sales and business reports"),
          path: "/reports",
          allowed: canSeeReports,
          searchTerms: ["reports", "report", "sales report", "analytics"],
        },
        {
          id: "history",
          label: t("History"),
          description: t("Open order history"),
          path: "/tableoverview?tab=history",
          allowed: canSeeHistoryTab,
          searchTerms: ["history", "past orders", "transactions", "order history"],
        },
        {
          id: "packet",
          label: t("Packet"),
          description: t("Open packet orders"),
          path: "/tableoverview?tab=packet",
          allowed: canSeePacketTab,
          searchTerms: ["packet", "delivery", "delivery orders"],
        },
        {
          id: "kitchen",
          label: t("Kitchen"),
          description: t("Open kitchen orders"),
          path: "/kitchen",
          allowed: true,
          searchTerms: ["kitchen", "all orders", "prep", "chef"],
        },
        {
          id: "products",
          label: t("Products"),
          description: t("Open product management"),
          path: "/products",
          allowed: true,
          searchTerms: ["products", "product", "menu items", "items"],
        },
        {
          id: "suppliers",
          label: t("Suppliers"),
          description: t("Open suppliers"),
          path: "/suppliers",
          allowed: true,
          searchTerms: ["suppliers", "supplier", "vendors", "purchasing"],
        },
        {
          id: "supplier-cart",
          label: t("Supplier Cart"),
          description: t("Open supplier cart"),
          path: "/suppliers?view=cart",
          allowed: true,
          searchTerms: ["supplier cart", "purchase cart", "cart"],
        },
        {
          id: "staff",
          label: t("Staff"),
          description: t("Open staff management"),
          path: "/staff",
          allowed: canSeeStaff,
          searchTerms: ["staff", "team", "employees"],
        },
        {
          id: "staff-checkin",
          label: t("Check-In"),
          description: t("Open staff check-in"),
          path: "/staff?tab=checkin",
          allowed: canSeeStaffCheckin,
          searchTerms: ["check-in", "check in", "attendance", "staff attendance"],
        },
        {
          id: "staff-schedule",
          label: t("Staff Schedule"),
          description: t("Open staff schedule"),
          path: "/staff?tab=schedule",
          allowed: canSeeStaffSchedule,
          searchTerms: ["staff schedule", "schedule", "shifts", "rota", "roster"],
        },
        {
          id: "payroll",
          label: t("Payroll"),
          description: t("Open staff payroll"),
          path: "/staff?tab=payroll",
          allowed: canSeeStaffPayroll,
          searchTerms: ["payroll", "salary", "wages", "staff payroll"],
        },
        {
          id: "expenses",
          label: t("Expenses"),
          description: t("Open expenses"),
          path: "/expenses",
          allowed: canSeeExpensesTab,
          searchTerms: ["expenses", "expense", "costs", "payments"],
        },
        {
          id: "stock",
          label: t("Stock"),
          description: t("View all stock items"),
          path: "/stock",
          allowed: canSeeStock,
          searchTerms: ["stock", "inventory", "ingredients"],
        },
        {
          id: "low-stock",
          label: t("Low Stock"),
          description: t("Open stock filtered to low-stock items"),
          path: "/stock?focus=low-stock",
          allowed: canSeeStock,
          searchTerms: [
            "low stock",
            "critical stock",
            "stock alert",
            "stock low",
            "inventory alert",
          ],
        },
        {
          id: "low-stock-waste",
          label: t("Low Stock Waste"),
          description: t("Open waste tab with low-stock focus"),
          path: "/stock?focus=low-stock&tab=waste",
          allowed: canSeeStock,
          searchTerms: [
            "low stock waste",
            "waste low stock",
            "stock waste",
            "waste tab",
            "low stock adjustments",
          ],
        },
        {
          id: "production",
          label: t("Production"),
          description: t("Open production"),
          path: "/production",
          allowed: true,
          searchTerms: ["production", "recipes", "manufacturing", "batch"],
        },
        {
          id: "task",
          label: t("Task"),
          description: t("Open tasks"),
          path: "/task",
          allowed: true,
          searchTerms: ["task", "tasks", "to do", "todo"],
        },
        {
          id: "view-booking",
          label: t("View Booking"),
          description: t("Open reservations and booking view"),
          path: "/view-booking",
          allowed: canSeeViewBooking,
          searchTerms: [
            "booking",
            "bookings",
            "reservation",
            "reservations",
            "reserve",
            "apollo reservations",
          ],
        },
        {
          id: "ingredient-prices",
          label: t("Ingredient Prices"),
          description: t("Open ingredient prices"),
          path: "/ingredient-prices",
          allowed: true,
          searchTerms: ["ingredient prices", "ingredient costs", "cost prices"],
        },
        {
          id: "cash-history",
          label: t("Cash History"),
          description: t("Open cash register history"),
          path: "/cash-register-history",
          allowed: true,
          searchTerms: ["cash", "cash history", "register", "money", "cash register"],
        },
        {
          id: "integrations",
          label: t("Integrations"),
          description: t("Open integrations"),
          path: "/integrations",
          allowed: true,
          searchTerms: ["integrations", "integration", "apps", "connections"],
        },
        {
          id: "settings",
          label: t("Settings"),
          description: t("Open settings"),
          path: "/settings",
          allowed: true,
          searchTerms: ["settings", "config", "configuration", "preferences"],
        },
        {
          id: "settings-appearance",
          label: t("Appearance & UI"),
          description: t("Open appearance settings"),
          path: "/settings/appearance",
          allowed: canSeeAppearanceSettings,
          searchTerms: ["appearance", "ui", "theme", "design settings"],
        },
        {
          id: "settings-shop-hours",
          label: t("Shop Hours"),
          description: t("Open shop hours settings"),
          path: "/settings/shop_hours",
          allowed: canSeeShopHoursSettings,
          searchTerms: ["shop hours", "opening hours", "hours", "business hours"],
        },
        {
          id: "settings-localization",
          label: t("Language & Localization"),
          description: t("Open localization settings"),
          path: "/settings/localization",
          allowed: canSeeLocalizationSettings,
          searchTerms: ["language", "localization", "translation", "locale"],
        },
        {
          id: "settings-subscription",
          label: t("Subscription & Billing"),
          description: t("Open subscription settings"),
          path: "/settings/subscription",
          allowed: canSeeSubscriptionSettings,
          searchTerms: ["subscription", "billing", "plan", "license"],
        },
        {
          id: "settings-payments",
          label: t("Payment Methods"),
          description: t("Open payment method settings"),
          path: "/settings/payments",
          allowed: canSeePaymentsSettings,
          searchTerms: ["payment methods", "payments", "payment settings", "tender"],
        },
        {
          id: "settings-register",
          label: t("Cash Register"),
          description: t("Open cash register settings"),
          path: "/settings/register",
          allowed: canSeeRegisterSettings,
          searchTerms: ["cash register", "register settings", "till settings"],
        },
        {
          id: "settings-users",
          label: t("User Management"),
          description: t("Open user management settings"),
          path: "/settings/users",
          allowed: canSeeUserManagement,
          searchTerms: ["settings users", "settings user management", "users settings", "roles settings"],
        },
        {
          id: "settings-integrations",
          label: t("Integrations"),
          description: t("Open integrations settings"),
          path: "/settings/integrations",
          allowed: canSeeIntegrationsSettings,
          searchTerms: ["integrations settings", "integration settings", "apps settings", "connections settings"],
        },
        {
          id: "settings-inventory",
          label: t("Log Files & Activity"),
          description: t("Open log files settings"),
          path: "/settings/inventory",
          allowed: canSeeInventorySettings,
          searchTerms: ["logs", "log files", "activity log", "inventory settings"],
        },
        {
          id: "qr-menu",
          label: t("QR Menu"),
          description: t("Open QR menu settings"),
          path: "/qr-menu-settings",
          allowed: true,
          searchTerms: ["qr", "qr menu", "menu website", "qr settings"],
        },
        {
          id: "customer-insights",
          label: t("Customer Insights"),
          description: t("Open customer insights"),
          path: "/customer-insights",
          allowed: true,
          searchTerms: ["customer insights", "customers", "crm", "customer data"],
        },
        {
          id: "marketing-campaigns",
          label: t("Marketing"),
          description: t("Open marketing campaigns"),
          path: "/marketing-campaigns",
          allowed: true,
          searchTerms: ["marketing", "campaigns", "promotions", "ads"],
        },
        {
          id: "maintenance",
          label: t("Maintenance"),
          description: t("Open maintenance"),
          path: "/maintenance",
          allowed: true,
          searchTerms: ["maintenance", "service", "repairs"],
        },
        {
          id: "user-management",
          label: t("User Management"),
          description: t("Open user management"),
          path: "/user-management",
          allowed: canSeeUserManagement,
          searchTerms: ["users", "user management", "roles", "permissions"],
        },
        {
          id: "notifications",
          label: t("Notifications"),
          description: t("Open notification settings"),
          path: "/settings/notifications",
          allowed: canSeeNotifications,
          searchTerms: ["notifications", "alerts", "notification settings"],
        },
        {
          id: "settings-cameras",
          label: t("Live Cameras"),
          description: t("Open camera settings"),
          path: "/settings/cameras",
          allowed: canSeeCameraSettings,
          searchTerms: ["cameras", "live cameras", "camera settings", "cctv"],
        },
        {
          id: "settings-tables",
          label: t("Tables"),
          description: t("Open table settings"),
          path: "/settings/tables",
          allowed: canSeeTablesSettings,
          searchTerms: ["table settings", "tables settings", "tables"],
        },
        {
          id: "settings-transactions",
          label: t("Transactions"),
          description: t("Open transaction settings"),
          path: "/settings/transactions",
          allowed: canSeeTransactionsSettings,
          searchTerms: ["transactions settings", "transaction settings", "transactions"],
        },
        {
          id: "printers",
          label: t("Printers"),
          description: t("Open printer settings"),
          path: "/printers",
          allowed: canSeePrinters,
          searchTerms: ["printer", "printers", "print", "receipt printer"],
        },
        {
          id: "orders-checklist",
          label: t("Checklist"),
          description: t("Open orders checklist"),
          path: "/orders?panel=checklist",
          allowed: true,
          searchTerms: ["checklist", "orders checklist", "driver checklist"],
        },
        {
          id: "orders-live-route",
          label: t("Live Route"),
          description: t("Open live route in orders"),
          path: "/orders?panel=live-route",
          allowed: true,
          searchTerms: ["live route", "route", "driver route", "delivery route"],
        },
        {
          id: "orders-driver-report",
          label: t("Driver Report"),
          description: t("Open driver report in orders"),
          path: "/orders?panel=driver-report",
          allowed: true,
          searchTerms: ["driver report", "delivery report", "courier report"],
        },
      ].filter((item) => item.allowed),
    [
      t,
      canSeeDashboardTab,
      canSeeTablesTab,
      canSeeHistoryTab,
      canSeePacketTab,
      canSeeReports,
      canSeeStaff,
      canSeeStaffCheckin,
      canSeeStaffSchedule,
      canSeeStaffPayroll,
      canSeeExpensesTab,
      canSeeStock,
      canSeeViewBooking,
      canSeeUserManagement,
      canSeeNotifications,
      canSeeAppearanceSettings,
      canSeeShopHoursSettings,
      canSeeLocalizationSettings,
      canSeeSubscriptionSettings,
      canSeePaymentsSettings,
      canSeeRegisterSettings,
      canSeeIntegrationsSettings,
      canSeeInventorySettings,
      canSeeCameraSettings,
      canSeeTablesSettings,
      canSeeTransactionsSettings,
      canSeePrinters,
    ]
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = React.useState(0);
  const [draggedFavoriteId, setDraggedFavoriteId] = React.useState(null);
  const [voiceListening, setVoiceListening] = React.useState(false);
  const [recentSearchIds, setRecentSearchIds] = React.useState(() => {
    if (typeof window === "undefined") return ["orders", "reports"];
    try {
      const raw = window.localStorage.getItem("modern-header-search-recent");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : ["orders", "reports"];
    } catch {
      return ["orders", "reports"];
    }
  });
  const [favoriteIds, setFavoriteIds] = React.useState([]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "modern-header-search-recent",
      JSON.stringify(recentSearchIds.slice(0, 6))
    );
  }, [recentSearchIds]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      for (const key of favoritesStorageKeys) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw || "[]");
        if (Array.isArray(parsed)) {
          setFavoriteIds(parsed);
          return;
        }
      }
      setFavoriteIds([]);
    } catch {
      setFavoriteIds([]);
    }
  }, [favoritesStorageKeys]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const serialized = JSON.stringify(favoriteIds.slice(0, 8));
    favoritesStorageKeys.forEach((key, index) => {
      if (index > 1) return;
      window.localStorage.setItem(key, serialized);
    });
  }, [favoriteIds, favoritesStorageKeys]);

  React.useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setActiveSearchIndex(0);
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (!searchRef.current?.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const recentDestinations = React.useMemo(() => {
    const byId = new Map(searchDestinations.map((item) => [item.id, item]));
    const favoriteIdSet = new Set(favoriteIds);
    return recentSearchIds
      .map((id) => byId.get(id))
      .filter((item) => item && !favoriteIdSet.has(item.id))
      .slice(0, 4);
  }, [favoriteIds, recentSearchIds, searchDestinations]);

  const favoriteDestinations = React.useMemo(() => {
    const byId = new Map(searchDestinations.map((item) => [item.id, item]));
    return favoriteIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 8);
  }, [favoriteIds, searchDestinations]);

  const suggestedDestinations = React.useMemo(() => {
    const suggestedIds = [
      "staff",
      "expenses",
      "reports",
      "stock",
      "orders",
      "view-booking",
      "printers",
      "settings",
    ];
    const byId = new Map(searchDestinations.map((item) => [item.id, item]));
    const favoriteIdSet = new Set(favoriteIds);
    const recentIdSet = new Set(recentSearchIds);

    return suggestedIds
      .map((id) => byId.get(id))
      .filter((item) => item && !favoriteIdSet.has(item.id) && !recentIdSet.has(item.id))
      .slice(0, 4);
  }, [favoriteIds, recentSearchIds, searchDestinations]);

  const searchResults = React.useMemo(() => {
    return buildScoredSearchResults(searchDestinations, searchQuery);
  }, [searchDestinations, searchQuery]);

  const visibleSearchItems = searchQuery.trim() ? searchResults : [];

  React.useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchQuery]);

  React.useEffect(() => {
    if (activeSearchIndex < visibleSearchItems.length) return;
    setActiveSearchIndex(0);
  }, [activeSearchIndex, visibleSearchItems.length]);

  const executeSearchTarget = React.useCallback(
    (target, options = {}) => {
      if (!target?.path) return;
      if (options.trackRecent !== false && target.id) {
        setRecentSearchIds((prev) => [target.id, ...prev.filter((id) => id !== target.id)].slice(0, 6));
      }
      if (target.id) {
        setFavoriteIds((prev) => (
          prev.includes(target.id) ? [target.id, ...prev.filter((id) => id !== target.id)] : prev
        ));
      }
      setSearchOpen(false);
      setSearchQuery("");
      navigate(target.path, target.state ? { state: target.state } : undefined);
    },
    [navigate]
  );

  const navigateFromSearch = React.useCallback(
    (item) => {
      executeSearchTarget(item);
    },
    [executeSearchTarget]
  );

  const toggleFavorite = React.useCallback((itemId) => {
    if (!itemId) return;
    setFavoriteIds((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId);
      return [itemId, ...prev].slice(0, 8);
    });
  }, []);

  const moveFavorite = React.useCallback((sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setFavoriteIds((prev) => {
      if (!prev.includes(sourceId) || !prev.includes(targetId)) return prev;
      const next = prev.filter((id) => id !== sourceId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, sourceId);
      return next;
    });
  }, []);

  const handleVoiceSearch = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognitionApi =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      setSearchOpen(true);
      searchInputRef.current?.focus();
      return;
    }

    if (voiceListening && speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognitionApi();
    speechRecognitionRef.current = recognition;
    recognition.lang = String(currentUser?.language || "").trim() || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceListening(true);
      setSearchOpen(true);
    };

    recognition.onend = () => {
      setVoiceListening(false);
      speechRecognitionRef.current = null;
    };

    recognition.onerror = () => {
      setVoiceListening(false);
      speechRecognitionRef.current = null;
      setSearchOpen(true);
      searchInputRef.current?.focus();
    };

    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) return;

      const normalizedQuery = transcript
        .replace(/^(open|show|go to|take me to|navigate to)\s+/i, "")
        .replace(/\btoday\b/gi, "")
        .trim();

      const finalQuery = normalizedQuery || transcript;
      setSearchQuery(finalQuery);
      setSearchOpen(true);

      const bestMatch = buildScoredSearchResults(searchDestinations, finalQuery)[0];
      if (bestMatch) {
        executeSearchTarget(bestMatch);
      } else {
        searchInputRef.current?.focus();
      }
    };

    recognition.start();
  }, [currentUser?.language, executeSearchTarget, searchDestinations, voiceListening]);

  React.useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop?.();
    };
  }, []);

  const handleSearchKeyDown = React.useCallback(
    (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex((prev) =>
          visibleSearchItems.length === 0 ? 0 : (prev + 1) % visibleSearchItems.length
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSearchOpen(true);
        setActiveSearchIndex((prev) =>
          visibleSearchItems.length === 0
            ? 0
            : (prev - 1 + visibleSearchItems.length) % visibleSearchItems.length
        );
        return;
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        return;
      }

      if (event.key === "Enter") {
        const picked = visibleSearchItems[activeSearchIndex] || visibleSearchItems[0];
        if (picked) {
          event.preventDefault();
          navigateFromSearch(picked);
        }
      }
    },
    [activeSearchIndex, navigateFromSearch, visibleSearchItems]
  );

  return (
    <header className="sticky top-0 z-40 w-full px-3 md:px-6 h-auto md:h-16 py-2 md:py-0 flex items-center bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl shadow-2xl border-b border-blue-100 dark:border-zinc-800">
      {/* Left: Drawer toggle */}
      <div className="flex items-center min-w-0 flex-shrink-0 gap-3">
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent/40"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Center: sticky subtitle (no flicker) */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-4 gap-2">
        <div className={isTransactionRoute ? "hidden md:block" : ""}>
          <StickySubtitle text={subtitle} />
        </div>
        <div ref={searchRef} className="relative w-full max-w-2xl">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <button
                type="button"
                onClick={handleVoiceSearch}
                className={`absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition ${
                  voiceListening
                    ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                    : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                }`}
                aria-label={t("Voice search")}
                title={t("Voice search")}
              >
                <Mic className={`h-4 w-4 ${voiceListening ? "animate-pulse" : ""}`} />
              </button>
              <input
                ref={searchInputRef}
                type="text"
                id="global-smart-search"
                name="global-smart-search"
                inputMode="search"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder={
                  voiceListening
                    ? t("Listening...")
                    : t("Search anything: low stock, reservations, printer")
                }
                className="w-full rounded-2xl border border-slate-200/80 bg-white/95 py-2.5 pl-11 pr-12 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/95 text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
              aria-label={t("Dashboard")}
              title={t("Dashboard")}
            >
              <Home className="h-4.5 w-4.5" />
            </button>
            {!isPublicShellRoute && currentUser && onLockClick && (
              <button
                type="button"
                onClick={onLockClick}
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/95 text-slate-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                aria-label={t("Lock Session")}
                title={t("Lock Session")}
              >
                <Lock className="h-4.5 w-4.5" />
              </button>
            )}
          </div>

          {searchOpen && (
            <div className="absolute left-1/2 top-[calc(100%+0.5rem)] z-50 w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur md:left-0 md:right-0 md:w-auto md:max-w-none md:translate-x-0 dark:border-slate-700 dark:bg-slate-900/95">
              {searchQuery.trim() ? (
                visibleSearchItems.length > 0 ? (
                  <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-2">
                    {visibleSearchItems.map((item, index) => (
                      <div
                        key={item.id}
                        onMouseEnter={() => setActiveSearchIndex(index)}
                            className={`flex items-center gap-2 rounded-xl px-2 py-2 transition ${
                          activeSearchIndex === index
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
                            : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/80"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => navigateFromSearch(item)}
                          className="flex min-w-0 flex-1 items-center justify-between text-left"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {renderHighlightedText(item.label, searchQuery)}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                              {renderHighlightedText(item.description, searchQuery)}
                            </div>
                            {Array.isArray(item.quickActions) && item.quickActions.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.quickActions.map((action) => (
                                  <button
                                    key={action.id}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      executeSearchTarget(action, { trackRecent: false });
                                    }}
                                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                                  >
                                    {renderHighlightedText(action.label, searchQuery)}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleFavorite(item.id);
                          }}
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                            favoriteIds.includes(item.id)
                              ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                              : "border-slate-200 bg-white text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                          }`}
                          aria-label={favoriteIds.includes(item.id) ? t("Unpin favorite") : t("Pin favorite")}
                          title={favoriteIds.includes(item.id) ? t("Unpin favorite") : t("Pin favorite")}
                        >
                          <Star className="h-4 w-4" fill="currentColor" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
                    {t("No matching shortcuts found.")}
                  </div>
                )
              ) : (
                <div className="grid max-h-[min(68vh,30rem)] gap-3 overflow-y-auto p-3 md:grid-cols-3 md:gap-4 md:p-4">
                  <div className="min-w-0 space-y-2">
                    <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                      <Star className="h-3.5 w-3.5" fill="currentColor" />
                      {t("Favorites")}
                    </div>
                    {favoriteDestinations.length > 0 ? (
                      favoriteDestinations.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-2 py-2 dark:border-amber-800/40 dark:bg-amber-950/10"
                          draggable
                          onDragStart={() => setDraggedFavoriteId(item.id)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={() => {
                            moveFavorite(draggedFavoriteId, item.id);
                            setDraggedFavoriteId(null);
                          }}
                          onDragEnd={() => setDraggedFavoriteId(null)}
                        >
                          <button
                            type="button"
                            onClick={() => navigateFromSearch(item)}
                            className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-semibold text-slate-700 transition hover:bg-amber-50/70 dark:text-slate-100 dark:hover:bg-amber-500/5"
                          >
                            <span className="truncate">{item.label}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(item.id)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-500 transition dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            aria-label={t("Remove favorite")}
                            title={t("Remove favorite")}
                          >
                            <Star className="h-4 w-4" fill="currentColor" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">
                        {t("No favorites pinned yet.")}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        {t("Recent")}
                      </div>
                      {recentDestinations.length > 0 ? (
                        recentDestinations.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-2 py-2 dark:border-slate-700 dark:bg-slate-800/70"
                          >
                            <button
                              type="button"
                              onClick={() => navigateFromSearch(item)}
                              className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="truncate">{item.label}</span>
                              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleFavorite(item.id)}
                              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                                favoriteIds.includes(item.id)
                                  ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                  : "border-slate-200 bg-white text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                              }`}
                            >
                              <Star className="h-4 w-4" fill="currentColor" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {t("No recent items yet.")}
                        </div>
                      )}
                  </div>
                  <div className="min-w-0 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        {t("Suggested")}
                      </div>
                      {suggestedDestinations.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900/80"
                        >
                          <button
                            type="button"
                            onClick={() => navigateFromSearch(item)}
                            className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                          >
                            <div className="min-w-0">
                              <div className="truncate">{item.label}</div>
                              <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                                {item.description}
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleFavorite(item.id)}
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                              favoriteIds.includes(item.id)
                                ? "border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                : "border-slate-200 bg-white text-slate-400 hover:text-amber-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                            }`}
                          >
                            <Star className="h-4 w-4" fill="currentColor" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {false && isSuppliersRoute && (
          <div className="flex flex-col items-center justify-center gap-2 max-w-full">
	            {supplierMobileTabs.length > 0 && (
	              <div className="hidden items-center justify-center gap-2 max-w-full rounded-2xl bg-slate-50/70 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-slate-700/60 p-1 backdrop-blur">
	                {supplierMobileTabs.map((tab) => {
	                  const isCartTab = tab.kind === "switch" && tab.key === "cart";
	                  const isActive = isCartTab
	                    ? supplierView === "cart"
                    : resolvedActiveHeaderTab === tab.id;
                  const isDashboardTab = tab.id === "dashboard";
                  return (
                    <button
                      key={tab.id ?? `${tab.kind}:${tab.key}`}
                      type="button"
                      onClick={() => {
                        if (isCartTab) {
                          handleSupplierTabClick(tab);
                          return;
                        }
                        handleHeaderTabClick(tab.id);
                      }}
                      className={[
                        "w-20 truncate",
                        "inline-flex items-center justify-center",
                        "rounded-full border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5 text-[12px] md:text-[13px] lg:text-sm font-semibold",
                        "transition-all duration-150 hover:shadow-sm active:scale-[0.98]",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
                        isActive
                          ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/50"
                          : isDashboardTab
                            ? "bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
                            : "bg-white/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800",
                      ].join(" ")}
                    >
                      {tab.label ?? tab.key}
                    </button>
                  );
                })}
              </div>
            )}

            {supplierTabs.length > 0 && (
              <div className="hidden md:flex items-center justify-center gap-2 max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap rounded-2xl bg-slate-50/70 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-slate-700/60 p-1 backdrop-blur">
                {supplierTabs.map((tab) => {
                  const isActive =
                    tab.kind === "switch"
                      ? supplierView === tab.key
                      : supplierView === "suppliers" && supplierSection === tab.key;

                  return (
                    <button
                      key={`${tab.kind}:${tab.key}`}
                      type="button"
                      onClick={() => handleSupplierTabClick(tab)}
                      className={[
                        "shrink-0 w-24 sm:w-28 truncate",
                        "inline-flex items-center justify-center gap-2",
                        "rounded-xl border border-slate-300/60 dark:border-slate-700/60 px-3 py-2 text-[12px] md:text-[13px] lg:text-sm font-semibold",
                        "shadow-md transition-all duration-150 hover:shadow-lg active:scale-[0.98]",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
                        isActive
                          ? "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white"
                          : "bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/70",
                      ].join(" ")}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {false && !isSuppliersRoute && centerNav && (
          <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto">
            {centerNav}
          </div>
        )}

	        {false && !isSuppliersRoute && !centerNav && showHeaderTabs && mobileHeaderTabs.length > 0 && (
	          <div className="hidden items-center justify-center gap-2 max-w-full rounded-2xl bg-slate-50/70 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-slate-700/60 p-1 backdrop-blur">
	            {mobileHeaderTabs.map((tab) => {
	              const isActive = resolvedActiveHeaderTab === tab.id;
	              const isDashboardTab = tab.id === "dashboard";
	              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleHeaderTabClick(tab.id)}
                  className={[
                    "w-20 truncate",
                    "inline-flex items-center justify-center",
                    "rounded-xl border border-slate-300/60 dark:border-slate-700/60 px-3 py-2 text-[12px] md:text-[13px] lg:text-sm font-semibold",
                    "shadow-md transition-all duration-150 hover:shadow-lg active:scale-[0.98]",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
                    isActive
                      ? "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white"
                      : isDashboardTab
                        ? "bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
                        : "bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/70",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {false && !isSuppliersRoute && !centerNav && showHeaderTabs && headerTabs.length > 0 && (
          <div className="hidden md:flex items-center justify-center gap-2 max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap rounded-2xl bg-slate-50/70 dark:bg-zinc-800/30 border border-slate-200/60 dark:border-slate-700/60 p-1 backdrop-blur">
                {headerTabs.map((tab) => {
                  const isActive = resolvedActiveHeaderTab === tab.id;
                  const isDashboardTab = tab.id === "dashboard";
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleHeaderTabClick(tab.id)}
                      className={[
                        "w-24 sm:w-28 truncate",
                        "inline-flex items-center justify-center gap-2",
                        "rounded-xl border border-slate-300/60 dark:border-slate-700/60 px-3 py-2 text-[12px] md:text-[13px] lg:text-sm font-semibold",
                        "shadow-md transition-all duration-150 hover:shadow-lg active:scale-[0.98]",
                    "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
                    isActive
                      ? "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white"
                      : isDashboardTab
                        ? "bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
                        : "bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/70",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Title + lock + bell + other right content */}
      <div className="flex items-center gap-4 min-w-0 flex-shrink-0">
        {tableNav && <div className="ml-2 hidden md:block">{tableNav}</div>}

        {title && (
          <div className="hidden items-center gap-3 md:flex">
            {isTableOverviewRoute && freeTablesCount !== null && (
              <span className="inline-flex items-center px-3 py-1 rounded-full border border-indigo-600 bg-gradient-to-r from-indigo-600 to-blue-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/40">
                {freeTablesCount} {t("Free")}
              </span>
            )}
            <span className="mr-1 text-base font-bold tracking-tight text-slate-900 drop-shadow md:text-xl dark:text-slate-100">
              {title}
            </span>
          </div>
        )}

        {rightContent && rightContent}
        {notificationBell}
        
      </div>
    </header>
  );
}
