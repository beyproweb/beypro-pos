// ModernTableSelector.jsx — Luxury Version
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

function normalizeHexColor(value, fallback = "#111827") {
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

export default function ModernTableSelector({
  tables = [],
  onSelect,
  onBack,
  occupiedNumbers = [],
  occupiedLabel = "Occupied",
  reservedNumbers = [],
  reservedLabel = "Reserved",
  showAreas = true,
  formatTableName,
  t = (value) => value,
  hideTopBar = false,
  accentColor = "#111827",
  headerAreaTabs = false,
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const areaViewEnabled = showAreas !== false;

  // Group tables by area when enabled; otherwise keep one flat bucket.
  const grouped = useMemo(() => {
    if (!areaViewEnabled) {
      return { ALL: [...tables] };
    }
    return tables.reduce((acc, t) => {
      const key = t.area || "Main Hall";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});
  }, [areaViewEnabled, tables]);

  const areas = useMemo(() => Object.keys(grouped), [grouped]);
  const [activeArea, setActiveArea] = useState(
    areaViewEnabled ? areas[0] || "Main Hall" : "ALL"
  );
  useEffect(() => {
    if (!areaViewEnabled) {
      setActiveArea("ALL");
      return;
    }
    if (!areas.includes(activeArea)) {
      setActiveArea(areas[0] || "Main Hall");
    }
  }, [activeArea, areaViewEnabled, areas]);

  const resolvedArea = areaViewEnabled ? activeArea || areas[0] || "Main Hall" : "ALL";
  const visibleTables = grouped[resolvedArea] || [];
  const occupiedSet = useMemo(() => new Set((occupiedNumbers || []).map((n) => Number(n))), [occupiedNumbers]);
  const reservedSet = useMemo(() => new Set((reservedNumbers || []).map((n) => Number(n))), [reservedNumbers]);
  const renderAreaTabs = areaViewEnabled && areas.length > 1;

  return (
    <div className="min-h-screen w-full px-4 py-6 bg-gradient-to-br from-[#fafafa] to-[#f0f2f5] dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      {!hideTopBar ? (
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onBack}
            className="
              w-10 h-10 flex items-center justify-center rounded-full 
              bg-white/80 dark:bg-neutral-900/70 backdrop-blur-md border border-gray-200 dark:border-neutral-800 
              shadow-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition
            "
          >
            <ChevronLeft size={22} className="text-gray-700 dark:text-neutral-200" />
          </button>

          <h1 className="flex-1 text-center text-3xl font-serif font-bold tracking-tight text-gray-900 dark:text-neutral-50">
            {t("Select Your Table")}
          </h1>

          {/* Empty space to balance layout */}
          <div className="w-10" />
        </div>
      ) : headerAreaTabs ? (
        <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-white/80 dark:bg-neutral-900/70 backdrop-blur-md border border-gray-200 dark:border-neutral-800 shadow-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition"
              aria-label={t("Back")}
            >
              <ChevronLeft size={22} className="text-gray-700 dark:text-neutral-200" />
            </button>

            {renderAreaTabs ? (
              <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
                <div className="flex gap-3 min-w-max">
                  {areas.map((area) => (
                    <button
                      key={area}
                      onClick={() => setActiveArea(area)}
                      className={[
                        "whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-medium transition-all border",
                        activeArea === area
                          ? "shadow-md"
                          : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-800",
                      ].join(" ")}
                      style={
                        activeArea === area
                          ? {
                              backgroundColor: resolvedAccentColor,
                              borderColor: resolvedAccentColor,
                              color: accentTextColor,
                              boxShadow: `0 12px 24px ${toRgba(resolvedAccentColor, 0.2) || "rgba(15,23,42,0.16)"}`,
                            }
                          : undefined
                      }
                    >
                      {area}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* AREA TABS */}
      {renderAreaTabs && !headerAreaTabs && (
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none mb-6">
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setActiveArea(area)}
              className={[
                "whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-medium transition-all border",
                activeArea === area
                  ? "shadow-md"
                  : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border-gray-200 dark:border-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-800",
              ].join(" ")}
              style={
                activeArea === area
                  ? {
                      backgroundColor: resolvedAccentColor,
                      borderColor: resolvedAccentColor,
                      color: accentTextColor,
                      boxShadow: `0 12px 24px ${toRgba(resolvedAccentColor, 0.2) || "rgba(15,23,42,0.16)"}`,
                    }
                  : undefined
              }
            >
              {area}
            </button>
          ))}
        </div>
      )}

      {/* TABLE GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 pb-20">
        {visibleTables.map((tbl) => {
          const isOcc = occupiedSet.has(Number(tbl.tableNumber));
          const isLocked = Boolean(tbl?.isLocked);
          const isReserved = reservedSet.has(Number(tbl.tableNumber));
          const isDisabled = isOcc || isReserved || isLocked;
          const tableTitle =
            typeof formatTableName === "function"
              ? formatTableName(tbl)
              : `${t("Table")} ${String(tbl.tableNumber).padStart(2, "0")}`;
          return (
          <button
            key={tbl.tableNumber}
            onClick={() => {
              if (!isDisabled) onSelect(tbl);
            }}
            disabled={isDisabled}
            className={`
              w-full p-5 rounded-3xl bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl border border-gray-200 dark:border-neutral-800 
              shadow-[0_3px_12px_rgba(0,0,0,0.06)] hover:shadow-xl
              hover:-translate-y-1 transition-all duration-300
              text-left flex flex-col gap-3
              ${isDisabled ? 'opacity-60 cursor-not-allowed ring-1 ring-red-200 dark:ring-rose-900 hover:translate-y-0 hover:shadow-[0_3px_12px_rgba(0,0,0,0.06)]' : ''}
            `}
          >
            {/* TABLE TITLE */}
            <div className="flex justify-between items-center">
              <span className="text-2xl font-serif font-bold text-gray-900 dark:text-neutral-50 tracking-wide">
                {tableTitle}
              </span>

              {isDisabled ? (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${
                    isReserved ? "bg-amber-600" : "bg-red-600"
                  }`}
                >
                  {isReserved ? reservedLabel : occupiedLabel}
                </span>
              ) : (() => {
                const lbl = (tbl.label ?? "").toString().trim();
                return lbl && lbl.toLowerCase() !== "standard";
              })() ? (
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: resolvedAccentColor,
                    color: accentTextColor,
                  }}
                >
                  {(tbl.label ?? "").toString().trim()}
                </span>
              ) : null}
            </div>

            {/* AREA LABEL */}
            {areaViewEnabled && (
              <div className="text-sm text-gray-600 dark:text-neutral-300 flex items-center gap-2">
                📍 <span className="font-medium">{tbl.area}</span>
              </div>
            )}

            {/* SEATS */}
            <div className="text-sm text-gray-700 dark:text-neutral-200 bg-gray-100 dark:bg-neutral-800 rounded-full px-3 py-1 inline-block">
              🪑 {tbl.seats || tbl.chairs || "?"} {t("Seats")}
            </div>

            {/* COLOR STRIP */}
            {tbl.color && (
              <div
                className="w-full h-2 rounded-full mt-2"
                style={{ backgroundColor: tbl.color }}
              ></div>
            )}
          </button>
        );})}
      </div>
    </div>
  );
}
