import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Mic } from "lucide-react";
import { API_BASE as API_URL } from "../../../../utils/api";
import { useCurrency } from "../../../../context/CurrencyContext";
import {
  getReadableTextColor,
  normalizeHexColor,
  normalizeRestaurantDisplayName,
  toRgba,
} from "../../utils/branding";
import { LANGS } from "../../constants/translations";

const CategorySlider = React.memo(function CategorySlider({
  categories,
  activeCategory,
  onCategorySelect,
  categoryImages,
  apiUrl,
}) {
  const sliderRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const normalizedCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
  const updateScrollState = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setCanScroll({
      left: scrollLeft > 10,
      right: scrollLeft + clientWidth < scrollWidth - 10,
    });
  }, []);

  const scrollToCategory = useCallback(
    (index) => {
      const el = sliderRef.current;
      if (!el || index < 0 || index >= el.children.length) return;
      const button = el.children[index];
      const buttonRect = button.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const offset =
        buttonRect.left -
        containerRect.left -
        containerRect.width / 2 +
        buttonRect.width / 2;
      el.scrollBy({ left: offset, behavior: "smooth" });
    },
    []
  );

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return undefined;
    updateScrollState();
    const handleResize = () => updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateScrollState]);

  useEffect(() => {
    if (!activeCategory) return;
    const idx = normalizedCategories.findIndex((cat) => cat === activeCategory);
    if (idx >= 0) {
      scrollToCategory(idx);
    }
  }, [activeCategory, normalizedCategories, scrollToCategory]);

  const handleArrow = useCallback(
    (direction) => {
      const el = sliderRef.current;
      if (!el) return;
      const step = Math.max(el.clientWidth * 0.65, 180);
      el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
    },
    []
  );

  const categoryFallbackSrc = "/Beylogo.svg";

  return (
    <div className="relative">
      <div
        ref={sliderRef}
        className="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide px-0.5"
        style={{ scrollBehavior: "smooth" }}
      >
        {normalizedCategories.map((cat, idx) => {
          const key = (cat || "").trim().toLowerCase();
          const imgSrc = categoryImages?.[key];
          const resolvedSrc = imgSrc
            ? /^https?:\/\//.test(String(imgSrc))
              ? String(imgSrc)
              : `${apiUrl}/uploads/${String(imgSrc).replace(/^\/?uploads\//, "")}`
            : "";
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onCategorySelect?.(cat);
                scrollToCategory(idx);
              }}
              className={`flex-none w-32 min-w-[120px] rounded-2xl border bg-white/90 dark:bg-neutral-900/75 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                active
                  ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                  : "border-gray-200 text-gray-700 dark:border-neutral-800 dark:text-neutral-200"
              }`}
            >
              <div className="p-3 flex flex-col items-center gap-2">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="text-xs font-semibold leading-tight text-center truncate">{cat}</span>
              </div>
            </button>
          );
        })}
      </div>
      {canScroll.left && (
        <button
          type="button"
          onClick={() => handleArrow("left")}
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
          aria-label="Scroll categories left"
        >
          <ChevronLeft className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
        </button>
      )}
      {canScroll.right && (
        <button
          type="button"
          onClick={() => handleArrow("right")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
          aria-label="Scroll categories right"
        >
          <ChevronRight className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
        </button>
      )}
    </div>
  );
});

function LanguageSwitcher({
  lang,
  setLang,
  t,
  isDark = false,
  dropdownDirection = "down",
  compact = false,
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);
  const current = LANGS.find((item) => item.code === lang) || LANGS[0];
  const compactLabel = String(current?.code || "en")
    .slice(0, 2)
    .toUpperCase();

  React.useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center ${
          compact
            ? "justify-center w-full h-full rounded-xl text-[11px] sm:text-[12px]"
            : "gap-2 px-3 py-1.5 rounded-lg text-[12px] sm:text-[13px]"
        } border font-medium transition focus:outline-none focus:ring-2 ${
          isDark
            ? "border-neutral-800 bg-transparent text-neutral-200 hover:bg-neutral-900/70 focus:ring-white/15"
            : "border-gray-200/90 bg-white/95 text-gray-700 hover:bg-white focus:ring-slate-200"
        }`}
        aria-label={t("Language")}
        aria-expanded={open}
      >
        <span>{compact ? compactLabel : current.label}</span>
        {!compact ? (
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        ) : null}
      </button>

      {open ? (
        <div
          className={`absolute ${dropdownDirection === "up" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"} right-0 z-[180] ${compact ? "w-[150px]" : "w-[180px]"} rounded-2xl border p-2 shadow-lg ${
            isDark
              ? "border-gray-200/20 bg-neutral-950/90 text-white backdrop-blur"
              : "border-gray-200 bg-white/95 text-gray-900 backdrop-blur"
          }`}
        >
          <div className={`px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            isDark ? "text-white/45" : "text-gray-400"
          }`}>
            {t("Language")}
          </div>
          <div className="space-y-1">
            {LANGS.map((item) => {
              const active = item.code === lang;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLang(item.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? isDark
                        ? "bg-white text-neutral-950"
                        : "bg-slate-900 text-white"
                      : isDark
                        ? "text-white/82 hover:bg-white/[0.08] hover:text-white"
                        : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <span>{item.label}</span>
                  {active ? <span className="text-xs font-semibold">•</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableQrScannerModal({
  open,
  tableNumber,
  tableDisplayName,
  guestCount,
  guestOptions = [],
  onGuestChange,
  onStartScan,
  scanReady,
  onClose,
  error,
  t,
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {scanReady ? t("Scan Table QR") : t("Guests")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {scanReady
              ? t("Scan the QR code on your table to continue.")
              : t("Select Guests")}
          </div>
          {tableDisplayName || tableNumber ? (
            <div className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
              {tableDisplayName || `${t("Table")} ${String(tableNumber).padStart(2, "0")}`}
            </div>
          ) : null}
        </div>
        <div className="p-5">
          {scanReady ? (
            <div
              id="qr-table-reader"
              className="w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-neutral-950"
            />
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {t("Guests")}
              </label>
              <select
                value={guestCount ? String(guestCount) : ""}
                onChange={(e) => onGuestChange?.(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:bg-neutral-950 dark:border-neutral-700 dark:text-neutral-100"
              >
                <option value="">{t("Select Guests")}</option>
                {guestOptions.map((count) => (
                  <option key={count} value={String(count)}>
                    {count}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onStartScan?.()}
                disabled={!guestCount}
                className="w-full rounded-xl bg-neutral-900 text-white py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("Continue")}
              </button>
            </div>
          )}
          {error ? (
            <div className="mt-3 text-sm text-red-600">{error}</div>
          ) : null}
        </div>
        <div className="p-4 pt-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 py-2.5 text-sm font-semibold text-gray-700 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800"
          >
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function InstallHelpModal({ open, onClose, t, platform, onShare, onCopy }) {
  if (!open) return null;
  const isIosPlatform = platform === "ios";
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {t("Add to Home Screen")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {t("Tap here to install the menu as an app")}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          {isIosPlatform ? (
            <>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Open this page in Safari, then install from the Share menu.
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>{t("Share QR Menu")}</li>
                <li>{t("Add to Home Screen")}</li>
              </ol>
            </>
          ) : (
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t("Share QR Menu")}</li>
              <li>{t("Add to Home Screen")}</li>
            </ol>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onShare}
              className="flex-1 py-3 rounded-2xl bg-neutral-900 text-white font-semibold shadow-sm hover:bg-neutral-800 transition"
            >
              {t("Share")}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 py-3 rounded-2xl bg-white dark:bg-neutral-950 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
            >
              {t("Copy Link")}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-100 hover:bg-gray-200 dark:hover:bg-neutral-700 transition"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ShareMenuModal({ open, onClose, t, onShare, onCopy }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {t("Share QR Menu")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {t("Share this menu with your guests.")}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onShare}
              className="flex-1 py-3 rounded-2xl bg-neutral-900 text-white font-semibold shadow-sm hover:bg-neutral-800 transition"
            >
              {t("Share")}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 py-3 rounded-2xl bg-white dark:bg-neutral-950 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
            >
              {t("Copy Link")}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-100 hover:bg-gray-200 dark:hover:bg-neutral-700 transition"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DownloadQrModal({
  open,
  onClose,
  t,
  onInstall,
  onDownloadImage,
}) {
  if (!open) return null;
  const installLabel = t("Install App");
  const title = t("Download App");
  const subtitle = t("Open the Beypro app for the best experience.");

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {title}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {subtitle}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onInstall}
              className="w-full py-3 rounded-2xl bg-neutral-900 text-white font-semibold shadow-sm hover:bg-neutral-800 transition"
            >
              {installLabel}
            </button>
            <button
              type="button"
              onClick={onDownloadImage}
              className="w-full py-3 rounded-2xl bg-white dark:bg-neutral-950 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
            >
              {t("Download QR Image")}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-100 hover:bg-gray-200 dark:hover:bg-neutral-700 transition"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function QrHeader({
  orderType,
  table,
  onClose,
  t,
  restaurantName,
  formatTableName,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onVoiceStart,
  voiceListening,
  hideSearch = false,
}) {
  const displayRestaurantName = React.useMemo(() => {
    return normalizeRestaurantDisplayName(restaurantName, "Restaurant");
  }, [restaurantName]);

  return (
    <>
      <header className="w-full sticky top-0 z-50 flex items-center justify-between gap-3 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800 px-4 md:px-6 py-3 shadow-sm">
        <span className="text-[18px] md:text-[20px] font-serif font-bold text-gray-900 dark:text-neutral-100 tracking-tight">
          {displayRestaurantName}
        </span>
        <div className="flex-1 min-w-0">
          {!hideSearch ? (
            <>
              <div className="relative w-full max-w-[520px] mx-auto">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-neutral-500">
                  <span className="text-base leading-none">⌕</span>
                </div>
                <input
                  value={searchValue || ""}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  placeholder={searchPlaceholder || t("Search")}
                  className="w-full h-10 pl-9 pr-3 rounded-full border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm text-gray-800 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 focus:border-gray-300 dark:focus:border-neutral-700"
                  aria-label={t("Search")}
                />
              </div>
              <div className="hidden md:block text-xs text-gray-500 mt-1 text-center">
                {orderType === "table"
                  ? table
                    ? typeof formatTableName === "function"
                      ? formatTableName(table)
                      : t("Table")
                    : t("Table Order (short)")
                  : t("Online Order")}
              </div>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onVoiceStart ? (
            <button
              type="button"
              onClick={onVoiceStart}
              aria-label={t("Voice Order")}
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                voiceListening
                  ? "bg-emerald-600 text-white animate-pulse"
                  : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-neutral-700"
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : null}
          <button
            onClick={onClose}
            aria-label={t("Close")}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-rose-950/40 text-gray-500 dark:text-neutral-300 hover:text-red-600 transition-all"
          >
            ×
          </button>
        </div>
      </header>
    </>
  );
}

function TableOrderHeader({ t, onBack, title = "Table Order", accentColor = "#111827" }) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  return (
    <header
      className="sticky top-0 z-50 px-4 py-3 backdrop-blur-md"
      style={{
        backgroundColor: toRgba(resolvedAccentColor, 0.94) || resolvedAccentColor,
        borderBottom: `1px solid ${toRgba(resolvedAccentColor, 0.24) || resolvedAccentColor}`,
        color: accentTextColor,
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Back")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition"
          style={{
            border: `1px solid ${toRgba(accentTextColor, 0.18) || accentTextColor}`,
            background: toRgba(accentTextColor, 0.1) || "rgba(255, 255, 255, 0.1)",
            color: accentTextColor,
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[18px] font-semibold tracking-tight" style={{ color: accentTextColor }}>
            {t(title)}
          </h1>
        </div>

        <div className="h-10 w-10 shrink-0" aria-hidden="true" />
      </div>
    </header>
  );
}

function CategoryBar({ categories, activeCategory, setActiveCategory, categoryImages }) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const scrollRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);
  const categoryFallbackSrc = "/Beylogo.svg";

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  const scrollByAmount = (amount) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const scrollToCategory = (index) => {
    const el = scrollRef.current;
    if (!el) return;
    const button = el.children[index];
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();

    const offset =
      buttonRect.left -
      containerRect.left -
      containerRect.width / 2 +
      buttonRect.width / 2;

    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-neutral-200 z-[100] backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.05)] px-2 sm:px-3">
      <div className="relative w-full max-w-6xl mx-auto">
        {canScrollLeft && (
          <button
            onClick={() => scrollByAmount(-250)}
            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {canScrollRight && (
          <button
            onClick={() => scrollByAmount(250)}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex flex-nowrap gap-2 md:gap-3 px-10 sm:px-12 py-2 md:py-3 overflow-x-auto scrollbar-hide scroll-smooth"
        >
          {categoryList.map((cat, idx) => {
            const key = cat?.toLowerCase?.();
            const imgSrc = categoryImages?.[key];
            const active = activeCategory === cat;
            const resolvedSrc = imgSrc
              ? /^https?:\/\//.test(imgSrc)
                ? imgSrc
                : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
              : "";

            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  scrollToCategory(idx);
                }}
                className={`group flex items-center gap-2 px-4 md:px-5 py-2 rounded-full text-sm md:text-base font-medium transition-all whitespace-nowrap
                  ${
                    active
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
                  }`}
              >
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-neutral-300 bg-white/70">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="tracking-wide">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function CategoryRail({ categories, activeCategory, setActiveCategory, categoryImages, t = (key) => key }) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const categoryFallbackSrc = "/Beylogo.svg";

  return (
    <aside className="w-full h-full">
      <div className="h-full rounded-2xl border border-neutral-200 bg-white/85 shadow-sm p-3 flex flex-col">
        <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-2 px-1">
          {t("Categories")}
        </div>
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
          {categoryList.map((cat) => {
            const key = cat?.toLowerCase?.();
            const imgSrc = categoryImages?.[key];
            const active = activeCategory === cat;
            const resolvedSrc = imgSrc
              ? /^https?:\/\//.test(imgSrc)
                ? imgSrc
                : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
              : "";

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left
                  ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                      : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300"
                  }`}
              >
                <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-neutral-200 bg-white/70">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="object-cover w-full h-full"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="truncate">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function PopularCarousel({ title, items, onProductClick }) {
  const { formatCurrency } = useCurrency();
  const scrollRef = React.useRef(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const check = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [check]);

  const scrollBy = (amount) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <div className="relative">
        {canLeft && (
          <button
            onClick={() => scrollBy(-260)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 border border-neutral-200 shadow-sm hover:shadow-md"
            aria-label="Prev"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-700" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scrollBy(260)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 border border-neutral-200 shadow-sm hover:shadow-md"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5 text-neutral-700" />
          </button>
        )}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth scrollbar-none"
        >
          {items.map((p) => (
            <div
              key={p.id}
              role={onProductClick ? "button" : undefined}
              tabIndex={onProductClick ? 0 : undefined}
              onClick={() => onProductClick?.(p)}
              onKeyDown={(event) => {
                if (onProductClick && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onProductClick(p);
                }
              }}
              className="min-w-[180px] sm:min-w-[200px] bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl shadow-sm snap-start cursor-pointer"
            >
              <div className="w-full h-28 overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-neutral-800">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold line-clamp-1">{p.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {formatCurrency(Number(p.price))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({ slides, currentSlide, setCurrentSlide, onTouchStart, onTouchEnd, t }) {
  if (!Array.isArray(slides) || slides.length === 0) return null;
  return (
    <div className="flex items-stretch">
      <div className="w-full rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
        <div
          className="w-full h-64 sm:h-72 overflow-hidden"
          onTouchStart={slides.length > 1 ? onTouchStart : undefined}
          onTouchEnd={slides.length > 1 ? onTouchEnd : undefined}
          style={{ touchAction: "pan-y" }}
        >
          <img
            src={slides[currentSlide].src}
            alt={slides[currentSlide].title}
            className="w-full h-full object-cover transition-all duration-700 ease-out"
          />
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            {t("Featured")}
          </p>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-1">
            {slides[currentSlide].title}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1 line-clamp-2">
            {slides[currentSlide].subtitle}
          </p>
        </div>

        <div className="pb-4 flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`transition-all ${
                i === currentSlide
                  ? "w-5 h-1.5 bg-neutral-900 dark:bg-white rounded-full"
                  : "w-1.5 h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-full"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export {
  CategoryBar,
  CategoryRail,
  CategorySlider,
  DownloadQrModal,
  FeaturedCard,
  InstallHelpModal,
  LanguageSwitcher,
  PopularCarousel,
  QrHeader,
  ShareMenuModal,
  TableOrderHeader,
  TableQrScannerModal,
};
