// ModernTableSelector.jsx — Luxury Version
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

export default function ModernTableSelector({
  tables = [],
  onSelect,
  onBack,
  occupiedNumbers = [],
  occupiedLabel = "Occupied",
  reservedNumbers = [],
  reservedLabel = "Reserved",
  showAreas = true,
}) {
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

  return (
    <div className="min-h-screen w-full px-4 py-6 bg-gradient-to-br from-[#fafafa] to-[#f0f2f5] dark:from-neutral-950 dark:to-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* HEADER */}
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
          Select Your Table
        </h1>

        {/* Empty space to balance layout */}
        <div className="w-10" />
      </div>

      {/* AREA TABS */}
      {areaViewEnabled && areas.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none mb-6">
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setActiveArea(area)}
              className={`
                whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-medium transition-all
                ${
                  activeArea === area
                    ? "bg-black text-white shadow-md dark:bg-white dark:text-neutral-900"
                    : "bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-200 border border-gray-200 dark:border-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-800"
                }
              `}
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
          const isReserved = reservedSet.has(Number(tbl.tableNumber));
          return (
          <button
            key={tbl.tableNumber}
            onClick={() => {
              if (!isOcc) onSelect(tbl);
            }}
            disabled={isOcc}
            className={`
              w-full p-5 rounded-3xl bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl border border-gray-200 dark:border-neutral-800 
              shadow-[0_3px_12px_rgba(0,0,0,0.06)] hover:shadow-xl
              hover:-translate-y-1 transition-all duration-300
              text-left flex flex-col gap-3
              ${isOcc ? 'opacity-60 cursor-not-allowed ring-1 ring-red-200 dark:ring-rose-900 hover:translate-y-0 hover:shadow-[0_3px_12px_rgba(0,0,0,0.06)]' : ''}
            `}
          >
            {/* TABLE TITLE */}
            <div className="flex justify-between items-center">
              <span className="text-2xl font-serif font-bold text-gray-900 dark:text-neutral-50 tracking-wide">
                Table {String(tbl.tableNumber).padStart(2, "0")}
              </span>

              {isOcc ? (
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
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-neutral-900"
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
              🪑 {tbl.seats || tbl.chairs || "?"} Seats
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
