import React from "react";
import { ShoppingCart } from "lucide-react";
import DrawerButton from "./DrawerButton";

function HeaderTabs({
  isDark = false,
  isDrawerOpen = false,
  onOpenDrawer,
  onSelect,
  reservationEnabled = true,
  tableEnabled = true,
  deliveryEnabled = true,
  activeOrderType = "takeaway",
  statusShortcutCount = 0,
  statusShortcutEnabled = false,
  statusShortcutOpen = false,
  onStatusShortcutClick,
  t,
}) {
  const containerClass = isDark
    ? "border-white/10 bg-white/[0.03]"
    : "border-white/60 bg-white/75";

  const baseTabClass =
    "h-10 sm:h-11 rounded-xl px-2.5 sm:px-3 text-[12px] sm:text-[14px] font-medium transition-all duration-200 truncate";

  const activeTabClass = isDark
    ? "bg-white text-neutral-950 border border-white/85 shadow-sm"
    : "bg-slate-900 text-white border border-slate-900 shadow-sm";

  const inactiveTabClass = isDark
    ? "bg-transparent text-white/82 border border-transparent hover:bg-white/[0.08] hover:text-white"
    : "bg-transparent text-gray-700 border border-transparent hover:bg-white hover:text-gray-900";

  const normalizedCount = Math.max(0, Number(statusShortcutCount) || 0);

  const segments = [
    {
      key: "takeaway",
      label: t("Reservation"),
      enabled: reservationEnabled,
    },
    {
      key: "table",
      label: t("Table Order"),
      enabled: tableEnabled,
    },
    {
      key: "online",
      label: t("Delivery"),
      enabled: deliveryEnabled,
    },
  ];
  const visibleSegments = segments.filter((segment) => segment.enabled);
  const hasVisibleSegments = visibleSegments.length > 0;

  return (
    <div className={`flex items-center min-w-0 ${hasVisibleSegments ? "gap-6" : ""}`}>
      <DrawerButton onClick={onOpenDrawer} isDark={isDark} isOpen={isDrawerOpen} />

      {hasVisibleSegments ? (
        <div className={`min-w-0 flex-1 rounded-2xl border backdrop-blur-xl p-1 ${containerClass}`}>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${visibleSegments.length}, minmax(0, 1fr))` }}
          >
            {visibleSegments.map((segment) => {
              const isActive = activeOrderType === segment.key;
              const nextClass = isActive ? activeTabClass : inactiveTabClass;

              return (
                <button
                  key={segment.key}
                  type="button"
                  onClick={() => onSelect?.(segment.key)}
                  className={`${baseTabClass} ${nextClass}`}
                >
                  {segment.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {hasVisibleSegments && statusShortcutEnabled ? (
        <button
          type="button"
          onClick={onStatusShortcutClick}
          aria-label={statusShortcutOpen ? "Close order status" : "Open order status"}
          aria-pressed={statusShortcutOpen}
          className={`relative h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-xl border flex items-center justify-center transition-all duration-200 ${
            statusShortcutOpen
              ? isDark
                ? "bg-white text-neutral-950 border-white/85 shadow-sm"
                : "bg-slate-900 text-white border-slate-900 shadow-sm"
              : isDark
                ? "bg-white/[0.06] text-white/90 border-white/12 hover:bg-white/[0.12]"
                : "bg-white/95 text-gray-700 border-gray-200 hover:bg-white hover:text-gray-900"
          }`}
        >
          <ShoppingCart className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          {normalizedCount > 0 ? (
            <span
              className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-none font-semibold flex items-center justify-center ${
                isDark
                  ? "bg-emerald-500 text-white"
                  : "bg-emerald-600 text-white"
              }`}
            >
              {normalizedCount > 99 ? "99+" : normalizedCount}
            </span>
          ) : null}
        </button>
      ) : null}

    </div>
  );
}

export default React.memo(HeaderTabs);
