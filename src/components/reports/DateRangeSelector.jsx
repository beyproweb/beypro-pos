import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/button";

export default function DateRangeSelector({
  range,
  onRangeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  todayIcon = null,
  children,
  className = "",
}) {
  const { t } = useTranslation();

  return (
    <div className={`flex w-full flex-col gap-3 ${className}`}>
      <div className="grid w-full grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:gap-2">
        <Button
          variant={range === "today" ? "default" : "outline"}
          onClick={() => onRangeChange("today")}
          className="inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap sm:h-11 sm:gap-2 sm:rounded-2xl sm:px-4 sm:text-sm sm:tracking-normal"
        >
          {todayIcon ? <span className="hidden sm:inline-flex">{todayIcon}</span> : null}
          <span>{t("Today")}</span>
        </Button>
        <Button
          variant={range === "week" ? "default" : "outline"}
          onClick={() => onRangeChange("week")}
          className="h-8 w-full min-w-0 rounded-xl px-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap sm:h-11 sm:rounded-2xl sm:px-4 sm:text-sm sm:tracking-normal"
        >
          <span className="sm:hidden">{t("Week")}</span>
          <span className="hidden sm:inline">{t("This Week")}</span>
        </Button>
        <Button
          variant={range === "custom" ? "default" : "outline"}
          onClick={() => onRangeChange("custom")}
          className="h-8 w-full min-w-0 rounded-xl px-1 text-[10px] font-semibold leading-none tracking-tight whitespace-nowrap sm:h-11 sm:rounded-2xl sm:px-4 sm:text-sm sm:tracking-normal"
        >
          <span className="sm:hidden">{t("Custom")}</span>
          <span className="hidden sm:inline">{t("Custom Range")}</span>
        </Button>

        {children}
      </div>

      {range === "custom" && (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-3 sm:flex-row sm:flex-wrap sm:items-center dark:border-slate-700/70 dark:bg-slate-900/60">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("From")}
          </label>
          <input
            type="date"
            value={customStart}
            onChange={(event) => onCustomStartChange(event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("To")}
          </label>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => onCustomEndChange(event.target.value)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      )}
    </div>
  );
}
