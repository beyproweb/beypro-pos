import React from "react";

export function OrdersHeader({
  t,
  drivers = [],
  selectedDriverId,
  onSelectDriver,
  onOpenRoute,
  onOpenChecklist,
  onToggleDriverReport,
  assignedCount,
}) {
  return (
    <div className="w-full py-2 overflow-x-auto">
      <div className="flex items-center justify-center gap-2 min-w-max px-4">
        <button
          className="shrink-0 h-[42px] px-3 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-xs font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition inline-flex items-center gap-1.5"
          disabled={!drivers.length}
          onClick={onOpenRoute}
        >
          <span className="inline-flex h-3 w-3 items-center justify-center text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
              <path d="M5 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
              <path d="M15 16a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
              <path d="M7 16h6l2-7h4" />
              <path d="M9 16l-1-5H5" />
              <path d="M6 11h2" />
            </svg>
          </span>
          <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 font-semibold leading-none">
            LIVE
          </span>
          <span>{t("Route")}</span>
        </button>

        <button
          className="shrink-0 h-[42px] px-3 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-xs font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition"
          disabled={!drivers.length}
          onClick={onOpenChecklist}
        >
          {t("Checklist")}
        </button>

        <button
          className="shrink-0 h-[42px] px-3 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-xs font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition inline-flex items-center gap-1.5"
          disabled={!drivers.length}
          onClick={onToggleDriverReport}
        >
          <span className="inline-flex h-3 w-3 items-center justify-center text-slate-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
              <path d="M4 19V5" />
              <path d="M4 19h16" />
              <path d="M8 17v-6" />
              <path d="M12 17V9" />
              <path d="M16 17v-4" />
            </svg>
          </span>
          <span>{t("Driver Report")}</span>
        </button>

        <select
          value={selectedDriverId}
          onChange={onSelectDriver}
          className="shrink-0 h-[42px] px-2 pr-6 rounded-md bg-white/80 text-slate-800 border border-slate-200 text-xs font-semibold shadow-sm hover:bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
          disabled={!drivers.length}
        >
          <option value="">{t("All Drivers")}</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {typeof assignedCount === "number" && (
          <span className="shrink-0 h-[42px] inline-flex items-center rounded-md bg-white/80 border border-slate-200 px-2 text-xs font-semibold text-slate-700 shadow-sm whitespace-nowrap">
            Assigned: {assignedCount}
          </span>
        )}
      </div>
    </div>
  );
}

export default OrdersHeader;
