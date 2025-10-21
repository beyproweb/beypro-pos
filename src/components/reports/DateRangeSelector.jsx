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
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${className}`}>
      <Button
        variant={range === "today" ? "default" : "outline"}
        onClick={() => onRangeChange("today")}
        className="flex items-center gap-2"
      >
        {todayIcon}
        <span>{t("Today")}</span>
      </Button>
      <Button
        variant={range === "week" ? "default" : "outline"}
        onClick={() => onRangeChange("week")}
      >
        {t("This Week")}
      </Button>
      <Button
        variant={range === "custom" ? "default" : "outline"}
        onClick={() => onRangeChange("custom")}
      >
        {t("Custom Range")}
      </Button>

      {range === "custom" && (
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm font-medium">{t("From")}</label>
          <input
            type="date"
            value={customStart}
            onChange={(event) => onCustomStartChange(event.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-800 shadow-sm"
          />
          <label className="text-sm font-medium">{t("To")}</label>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => onCustomEndChange(event.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-800 shadow-sm"
          />
        </div>
      )}

      {children}
    </div>
  );
}
