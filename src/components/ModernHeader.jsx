// src/components/ModernHeader.jsx
import React from "react";
import { Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "./hooks/useHasPermission";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";

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
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const isTableOverviewRoute =
    location.pathname.includes("/tables") || location.pathname.includes("/tableoverview");
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

  const supplierTabs = React.useMemo(() => {
    const tabs = [
      { kind: "nav", key: "dashboard", label: t("Dashboard") },
      ...(canSeeTablesTab ? [{ kind: "nav", key: "tables", label: t("Tables") }] : []),
      { kind: "switch", key: "suppliers", label: t("Add Product") },
      { kind: "switch", key: "cart", label: t("Supplier Cart") },
      { kind: "section", key: "supplier-overview", label: t("Overview") },
      { kind: "section", key: "transaction-history", label: t("Transactions") },
      { kind: "section", key: "price-tracking", label: t("Price") },
      { kind: "section", key: "profile-balance", label: t("Profile") },
    ];

    return tabs;
  }, [canSeeTablesTab, t]);

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
      { id: "tables", label: t("Tables") },
      { id: "kitchen", label: t("All Orders") },
      { id: "history", label: t("History") },
      { id: "packet", label: t("Packet") },
      { id: "phone", label: t("Phone") },
      { id: "expenses", label: t("Expenses") },
      { id: "register", label: t("Register") },
    ];

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
    canSeeTakeawayTab,
    canSeeTablesTab,
    canSeeKitchenTab,
    canSeeHistoryTab,
    canSeePacketTab,
    canSeePhoneTab,
    canSeeExpensesTab,
    canSeeRegisterTab,
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

  return (
    <header className="sticky top-0 z-40 w-full px-3 md:px-6 h-auto md:h-16 py-2 md:py-0 flex items-center bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl shadow-2xl border-b border-blue-100 dark:border-zinc-800">
      {/* Left: Drawer toggle + Back arrow */}
      <div className="flex items-center min-w-0 flex-shrink-0 gap-3">
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-indigo-200 dark:hover:bg-indigo-500/20 transition"
            aria-label="Toggle navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Center: sticky subtitle (no flicker) */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-4 gap-1">
        <StickySubtitle text={subtitle} />
        {isSuppliersRoute && (
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
                        "rounded-full border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5 text-[12px] md:text-[13px] lg:text-sm font-semibold",
                        "transition-all duration-150 hover:shadow-sm active:scale-[0.98]",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
                        isActive
                          ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-500/20 ring-1 ring-white/50"
                          : "bg-white/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800",
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

        {!isSuppliersRoute && centerNav && (
          <div className="flex items-center justify-center gap-2 max-w-full overflow-x-auto">
            {centerNav}
          </div>
        )}

	        {!isSuppliersRoute && !centerNav && showHeaderTabs && mobileHeaderTabs.length > 0 && (
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
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {!isSuppliersRoute && !centerNav && showHeaderTabs && headerTabs.length > 0 && (
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
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Title + bell + other right content */}
      <div className="flex items-center gap-4 min-w-0 flex-shrink-0">
        {tableNav && <div className="ml-2 hidden md:block">{tableNav}</div>}

        {title && (
          <span className="text-xl md:text-2xl font-bold tracking-tight text-indigo-700 dark:text-violet-300 drop-shadow mr-1">
            {title}
          </span>
        )}

        {rightContent && rightContent}
        {notificationBell}
        
      </div>
    </header>
  );
}
