import React from "react";
import { House, Music2, ShoppingCart } from "lucide-react";
import DrawerButton from "./DrawerButton";

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "");
  if (!normalized) return null;
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return "#FFFFFF";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? "#0F172A" : "#FFFFFF";
}

function toRgba(value, alpha) {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function HeaderTabs({
  isDark = false,
  isDrawerOpen = false,
  onOpenDrawer,
  onSelect,
  reservationEnabled = true,
  tableEnabled = true,
  deliveryEnabled = true,
  requestSongEnabled = false,
  activeOrderType = "takeaway",
  statusShortcutCount = 0,
  statusShortcutEnabled = false,
  statusShortcutOpen = false,
  onStatusShortcutClick,
  restaurantName,
  mainTitleLogo,
  showCompactBranding = false,
  layout = "toolbar",
  accentColor = "#111827",
  t,
  onOpenMarketplace,
  languageControl = null,
}) {
  const isToolbar = layout === "toolbar";
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const containerClass = isDark
    ? "border-white/10 bg-white/[0.03]"
    : "border-white/60 bg-white/75";

  const baseTabClass = isToolbar
    ? "h-10 sm:h-11 rounded-xl px-2.5 sm:px-3 text-[12px] sm:text-[14px] font-medium transition-all duration-200 truncate"
    : "min-h-[42px] rounded-xl px-3.5 sm:px-4 py-2 text-[12px] sm:text-[13px] font-medium tracking-[0.01em] transition-all duration-200 truncate";

  const activeTabClass = isToolbar
    ? isDark
      ? "bg-white text-neutral-950 border border-white/85 shadow-sm"
      : "bg-slate-900 text-white border border-slate-900 shadow-sm"
    : isDark
      ? "bg-white text-neutral-950 border border-white/85 shadow-[0_16px_30px_rgba(255,255,255,0.08)]"
      : "bg-slate-900 text-white border border-slate-900 shadow-[0_16px_30px_rgba(15,23,42,0.14)]";

  const inactiveTabClass = isToolbar
    ? isDark
      ? "bg-transparent text-white/82 border border-transparent hover:bg-white/[0.08] hover:text-white"
      : "bg-transparent text-gray-700 border border-transparent hover:bg-white hover:text-gray-900"
    : isDark
      ? "bg-transparent text-white/76 border border-transparent hover:bg-white/[0.08] hover:text-white"
      : "bg-transparent text-slate-500 border border-transparent hover:bg-white hover:text-slate-900";

  const normalizedCount = Math.max(0, Number(statusShortcutCount) || 0);
  const hasMarketplaceShortcut = typeof onOpenMarketplace === "function";
  const hasLanguageControl = Boolean(languageControl);
  const iconSlotClass = "h-10 w-10 sm:h-11 sm:w-11 shrink-0";
  const needsRightBalanceSlot = hasMarketplaceShortcut && !hasLanguageControl;
  const needsLeftBalanceSlot = !hasMarketplaceShortcut && hasLanguageControl;

  const segments = [
    {
      key: "takeaway",
      label: t("Reserve"),
      enabled: reservationEnabled,
    },
    {
      key: "table",
      label: t("Dine in"),
      enabled: tableEnabled,
    },
    {
      key: "online",
      label: t("Delivery"),
      enabled: deliveryEnabled,
    },
    {
      key: "request_song",
      label: t("Request Song"),
      enabled: requestSongEnabled,
      icon: Music2,
    },
  ];
  const visibleSegments = segments.filter((segment) => segment.enabled);
  const hasVisibleSegments = visibleSegments.length > 0;
  const compactLogoSrc = String(mainTitleLogo || "").trim();
  const showCompactBrandSlot = isToolbar && showCompactBranding;

  const segmentControl = hasVisibleSegments ? (
    <div
      className={isToolbar ? `min-w-0 flex-1 rounded-2xl border backdrop-blur-xl p-1 ${containerClass}` : "w-full max-w-2xl rounded-2xl border border-slate-200/80 bg-white/88 p-1.5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/75 dark:ring-white/10"}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${visibleSegments.length}, minmax(0, 1fr))` }}
      >
        {visibleSegments.map((segment) => {
          const isActive = activeOrderType === segment.key;
          const nextClass = isActive ? activeTabClass : inactiveTabClass;
          const SegmentIcon = segment.icon;
          const activeStyle = isActive
            ? {
                backgroundColor: resolvedAccentColor,
                borderColor: resolvedAccentColor,
                color: accentTextColor,
                boxShadow: isToolbar
                  ? `0 8px 20px ${toRgba(resolvedAccentColor, 0.18) || "rgba(15,23,42,0.18)"}`
                  : `0 16px 30px ${toRgba(resolvedAccentColor, 0.22) || "rgba(15,23,42,0.18)"}`,
              }
            : undefined;

          return (
            <button
              key={segment.key}
              type="button"
              onClick={() => onSelect?.(segment.key)}
              className={`${baseTabClass} ${nextClass}`}
              style={activeStyle}
            >
              <span className="inline-flex max-w-full items-center justify-center gap-2 truncate">
                {SegmentIcon ? <SegmentIcon className="h-4 w-4 shrink-0" /> : null}
                <span className="truncate">{segment.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  if (!isToolbar) {
    return hasVisibleSegments ? <div className="flex justify-center">{segmentControl}</div> : null;
  }

  return (
    <div
      className={`flex w-full min-w-0 items-center ${
        hasVisibleSegments ? "gap-4" : "gap-2"
      }`}
    >
      <div className="flex items-center gap-1.5 sm:gap-2">
        <DrawerButton onClick={onOpenDrawer} isDark={isDark} isOpen={isDrawerOpen} />

        {hasMarketplaceShortcut ? (
          <button
            type="button"
            onClick={onOpenMarketplace}
            aria-label={t("Marketplace")}
            className={`${iconSlotClass} rounded-xl border flex items-center justify-center transition-all duration-200 ${
              isDark
                ? "bg-white/[0.06] text-white/90 border-white/12 hover:bg-white/[0.12]"
                : "bg-white/95 text-gray-700 border-gray-200 hover:bg-white hover:text-gray-900"
            }`}
          >
            <House className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
          </button>
        ) : null}

        {needsLeftBalanceSlot ? (
          <div aria-hidden className={`${iconSlotClass} pointer-events-none opacity-0`} />
        ) : null}
      </div>

      {showCompactBrandSlot ? (
        <div className="min-w-0 flex-1 px-0.5">
          <div className="flex h-10 sm:h-11 items-center justify-center">
            {compactLogoSrc ? (
              <img
                src={compactLogoSrc}
                alt={restaurantName || t("Restaurant")}
                className="block h-auto max-h-[39px] sm:max-h-[41px] w-auto max-w-full object-contain"
                loading="lazy"
              />
            ) : (
              <div
                className={`truncate text-center text-sm sm:text-[15px] font-semibold ${
                  isDark ? "text-white/92" : "text-slate-900"
                }`}
              >
                {restaurantName || t("Restaurant")}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-1.5 sm:gap-2">
        {statusShortcutEnabled ? (
          <button
            type="button"
            onClick={onStatusShortcutClick}
            aria-label={statusShortcutOpen ? "Close order status" : "Open order status"}
            aria-pressed={statusShortcutOpen}
            className={`relative ${iconSlotClass} rounded-xl border flex items-center justify-center transition-all duration-200 ${
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
        ) : (
          <div aria-hidden className={`${iconSlotClass} pointer-events-none opacity-0`} />
        )}

        {hasLanguageControl ? (
          <div className={`${iconSlotClass} relative z-[170] flex items-center justify-center`}>
            {languageControl}
          </div>
        ) : null}

        {needsRightBalanceSlot ? (
          <div aria-hidden className={`${iconSlotClass} pointer-events-none opacity-0`} />
        ) : null}
      </div>

    </div>
  );
}

export default React.memo(HeaderTabs);
