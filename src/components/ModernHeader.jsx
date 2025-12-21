// src/components/ModernHeader.jsx
import React from "react";
import { ArrowLeft, Home, Menu } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "./hooks/useHasPermission";

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
  const currentPath = `${location.pathname}${location.search}`;
  const handleGoBack = React.useCallback(() => {
    if (previousRoute && previousRoute !== currentPath) {
      navigate(previousRoute);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  }, [navigate, previousRoute, currentPath]);

  const handleGoHome = React.useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  const isTableOverviewRoute =
    location.pathname.includes("/tables") || location.pathname.includes("/tableoverview");

  const canSeeTablesTab = useHasPermission("tables");
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
  const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone-orders");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");

  const headerTabs = React.useMemo(() => {
    const all = [
      { id: "takeaway", label: t("Pre Order") },
      { id: "tables", label: t("Tables") },
      { id: "kitchen", label: t("All Orders") },
      { id: "history", label: t("History") },
      { id: "packet", label: t("Packet") },
      { id: "phone", label: t("Phone") },
      { id: "register", label: t("Register") },
    ];

    return all.filter((tab) => {
      if (tab.id === "takeaway") return canSeeTakeawayTab;
      if (tab.id === "tables") return canSeeTablesTab;
      if (tab.id === "kitchen") return canSeeKitchenTab;
      if (tab.id === "history") return canSeeHistoryTab;
      if (tab.id === "packet") return canSeePacketTab;
      if (tab.id === "phone") return canSeePhoneTab;
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
    canSeeRegisterTab,
  ]);

  const activeHeaderTab = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get("tab") || "tables").toLowerCase();
  }, [location.search]);

  const handleHeaderTabClick = React.useCallback(
    (tabId) => {
      const base = "/tableoverview";
      const params = new URLSearchParams(location.search);
      params.set("tab", tabId);
      navigate(`${base}?${params.toString()}`);
    },
    [location.search, navigate]
  );

  return (
    <header className="sticky top-0 z-40 w-full px-6 h-16 flex items-center bg-white/80 dark:bg-zinc-900/70 backdrop-blur-xl shadow-2xl border-b border-blue-100 dark:border-zinc-800">
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
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-indigo-400/50 bg-white/70 text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-white dark:bg-zinc-800/70 dark:text-indigo-200 dark:hover:bg-indigo-700/20 dark:focus:ring-offset-zinc-900 transition"
          aria-label="Go to previous page"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={handleGoHome}
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:text-indigo-200 dark:hover:bg-indigo-500/20 transition"
          aria-label="Go to dashboard"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>

      {/* Center: sticky subtitle (no flicker) */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 px-4 gap-1">
        <StickySubtitle text={subtitle} />
        {isTableOverviewRoute && headerTabs.length > 0 && (
          <div className="hidden md:flex items-center justify-center gap-2 flex-wrap">
            {headerTabs.map((tab) => {
              const isActive = activeHeaderTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleHeaderTabClick(tab.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    isActive
                      ? "border-indigo-300 bg-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-white/80 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800"
                  }`}
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
