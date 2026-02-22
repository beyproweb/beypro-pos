import { memo } from "react";

const OrdersFiltersBar = memo(function OrdersFiltersBar({ statusFilter, onStatusFilterChange, t }) {
  return (
    <div className="relative">
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className="h-[46px] w-full appearance-none rounded-xl border border-emerald-300/60 bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 px-4 pr-10 text-base font-semibold text-white shadow-md focus:outline-none"
      >
        <option value="all" className="text-slate-900">{t("All")}</option>
        <option value="new" className="text-slate-900">{t("New Order")}</option>
        <option value="on_road" className="text-slate-900">{t("On Road")}</option>
        <option value="delivered" className="text-slate-900">{t("Delivered")}</option>
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/90">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    </div>
  );
});

export default OrdersFiltersBar;
