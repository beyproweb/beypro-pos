// ModernTableSelector.jsx — Luxury Version
import React, { useState, useMemo } from "react";
import { ChevronLeft } from "lucide-react";

export default function ModernTableSelector({ tables = [], onSelect, onBack }) {
  // Group tables by area
  const grouped = useMemo(() => {
    return tables.reduce((acc, t) => {
      const key = t.area || "Main Hall";
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});
  }, [tables]);

  const areas = Object.keys(grouped);
  const [activeArea, setActiveArea] = useState(areas[0] || "Main Hall");

  return (
    <div className="min-h-screen w-full px-4 py-6 bg-gradient-to-br from-[#fafafa] to-[#f0f2f5]">
      {/* HEADER */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="
            w-10 h-10 flex items-center justify-center rounded-full 
            bg-white/80 backdrop-blur-md border border-gray-200 
            shadow-sm hover:bg-gray-100 transition
          "
        >
          <ChevronLeft size={22} className="text-gray-700" />
        </button>

        <h1 className="flex-1 text-center text-3xl font-serif font-bold tracking-tight text-gray-900">
          Select Your Table
        </h1>

        {/* Empty space to balance layout */}
        <div className="w-10" />
      </div>

      {/* AREA TABS */}
      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-none mb-6">
        {areas.map((area) => (
          <button
            key={area}
            onClick={() => setActiveArea(area)}
            className={`
              whitespace-nowrap px-6 py-2.5 rounded-full text-sm font-medium transition-all
              ${
                activeArea === area
                  ? "bg-black text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
              }
            `}
          >
            {area}
          </button>
        ))}
      </div>

      {/* TABLE GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 pb-20">
        {grouped[activeArea]?.map((tbl) => (
          <button
            key={tbl.tableNumber}
            onClick={() => onSelect(tbl)}
            className="
              w-full p-5 rounded-3xl bg-white/70 backdrop-blur-xl border border-gray-200 
              shadow-[0_3px_12px_rgba(0,0,0,0.06)] hover:shadow-xl
              hover:-translate-y-1 transition-all duration-300
              text-left flex flex-col gap-3
            "
          >
            {/* TABLE TITLE */}
            <div className="flex justify-between items-center">
              <span className="text-2xl font-serif font-bold text-gray-900 tracking-wide">
                Table {String(tbl.tableNumber).padStart(2, "0")}
              </span>

              {(() => {
                const lbl = (tbl.label ?? "").toString().trim();
                return lbl && lbl.toLowerCase() !== "standard";
              })() ? (
                <span
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-900 text-white"
                >
                  {(tbl.label ?? "").toString().trim()}
                </span>
              ) : null}
            </div>

            {/* AREA LABEL */}
            <div className="text-sm text-gray-600 flex items-center gap-2">
              📍 <span className="font-medium">{tbl.area}</span>
            </div>

            {/* SEATS */}
            <div className="text-sm text-gray-700 bg-gray-100 rounded-full px-3 py-1 inline-block">
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
        ))}
      </div>
    </div>
  );
}
