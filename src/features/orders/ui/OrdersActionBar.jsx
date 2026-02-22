import { memo } from "react";
import OrdersFiltersBar from "./OrdersFiltersBar";

const OrdersActionBar = memo(function OrdersActionBar({
  statusFilter,
  onStatusFilterChange,
  drivers,
  onOpenDrinkModal,
  showDriverReport,
  onToggleDriverReport,
  onOpenRoute,
  assignedOrderCountForSelectedDriver,
  selectedDriverId,
  onSelectedDriverChange,
  t,
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-slate-200/70 bg-slate-50/90 px-3 py-2.5 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/75">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <OrdersFiltersBar
            statusFilter={statusFilter}
            onStatusFilterChange={onStatusFilterChange}
            t={t}
          />

          <button
            type="button"
            className="inline-flex h-[46px] items-center justify-center rounded-xl border border-indigo-300/60 bg-gradient-to-br from-indigo-400 via-indigo-500 to-sky-500 px-4 text-base font-semibold text-white shadow-md transition hover:from-indigo-500 hover:to-sky-600 active:scale-[0.98] disabled:opacity-40"
            disabled={!drivers.length}
            onClick={onOpenDrinkModal}
          >
            Checklist
          </button>

          <button
            type="button"
            className={`inline-flex h-[46px] items-center justify-center rounded-xl border px-4 text-base font-semibold shadow-sm transition ${
              showDriverReport
                ? "border-amber-300/60 bg-gradient-to-br from-amber-500 via-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                : "border-amber-300/60 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 text-white hover:from-amber-500 hover:to-orange-600"
            }`}
            disabled={!drivers.length}
            onClick={onToggleDriverReport}
          >
            Driver Report
          </button>

          <button
            type="button"
            className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-500 to-blue-500 px-4 text-base font-semibold text-white shadow-md transition hover:from-indigo-600 hover:via-indigo-600 hover:to-blue-600 active:scale-[0.98] disabled:opacity-40"
            disabled={!drivers.length}
            onClick={onOpenRoute}
          >
            <span className="rounded-lg border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-emerald-700">
              LIVE
            </span>
            <span>Route</span>
          </button>

          <button
            type="button"
            className="inline-flex h-[46px] items-center justify-center rounded-xl border border-emerald-300/60 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 px-4 text-base font-semibold text-white shadow-md transition hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600"
            disabled
          >
            Assigned: {assignedOrderCountForSelectedDriver || 0}
          </button>

          <div className="relative">
            <select
              value={selectedDriverId}
              onChange={(e) => onSelectedDriverChange(e.target.value)}
              className="h-[46px] w-full appearance-none rounded-xl border border-slate-200/80 bg-white/85 px-4 pr-10 text-base font-semibold text-slate-800 shadow-sm focus:outline-none dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-100"
              disabled={!drivers.length}
            >
              <option value="">{t("All Drivers")}</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default OrdersActionBar;
