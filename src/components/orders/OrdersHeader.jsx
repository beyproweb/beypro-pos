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
    <div className="w-full px-4 pt-3 lg:pt-4">
      <div className="mx-auto w-full max-w-6xl overflow-x-auto lg:overflow-visible">
        <div className="min-w-max rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/40">
          <div className="flex items-center justify-between gap-3 flex-nowrap">
            <div className="flex items-center gap-2 flex-nowrap">
              <button
                className="shrink-0 h-[40px] px-5 rounded-xl bg-indigo-600 text-white text-base font-semibold shadow-sm hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-40 transition inline-flex items-center gap-2"
                disabled={!drivers.length}
                onClick={onOpenRoute}
              >
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-lg border border-emerald-300 font-semibold leading-none">
                  LIVE
                </span>
                <span>{t("Route")}</span>
              </button>

              <button
                className="shrink-0 h-[40px] px-6 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-900"
                disabled={!drivers.length}
                onClick={onOpenChecklist}
              >
                {t("Checklist")}
              </button>

              <button
                className="shrink-0 h-[40px] px-6 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 text-base font-semibold shadow-sm hover:bg-white hover:border-slate-300 active:bg-slate-50 disabled:opacity-40 transition dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-900"
                disabled={!drivers.length}
                onClick={onToggleDriverReport}
              >
                {t("Driver Report")}
              </button>
            </div>

            <div className="shrink-0 flex items-stretch rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-950/40">
              <div className="relative">
                <select
                  value={selectedDriverId}
                  onChange={onSelectDriver}
                  className="h-[40px] w-[180px] lg:w-[210px] px-4 pr-10 text-base font-semibold text-slate-700 bg-transparent focus:outline-none disabled:opacity-40 appearance-none dark:text-slate-200"
                  disabled={!drivers.length}
                >
                  <option value="">{t("All Drivers")}</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              </div>

              {typeof assignedCount === "number" && (
                <div className="h-[40px] inline-flex items-center gap-2 border-l border-slate-200 px-4 text-base font-semibold text-slate-700 whitespace-nowrap dark:border-slate-800 dark:text-slate-200">
                  <span>{t("Assigned")}: {assignedCount}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                      <path
                        fillRule="evenodd"
                        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L10.94 10 7.23 6.29a.75.75 0 1 1 1.06-1.06l4.24 4.24a.75.75 0 0 1 0 1.06l-4.24 4.24a.75.75 0 0 1-1.08.02Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrdersHeader;
