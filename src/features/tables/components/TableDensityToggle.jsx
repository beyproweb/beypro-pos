import React from "react";
import {
  TABLE_DENSITY_OPTIONS,
  normalizeTableDensity,
} from "../tableDensity";

const passthrough = (value) => value;

function TableDensityToggle({
  value,
  onChange,
  t = passthrough,
  size = "md",
  className = "",
}) {
  const normalizedValue = normalizeTableDensity(value);
  const isSmall = size === "sm";

  const wrapperClassName = isSmall
    ? "inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm"
    : "inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-sm";

  const buttonClassName = isSmall
    ? "rounded-lg px-2.5 py-1 text-xs"
    : "rounded-xl px-3.5 py-2 text-sm";

  return (
    <div className={`${wrapperClassName} ${className}`.trim()} role="group" aria-label={t("Table Layout Density")}>
      {TABLE_DENSITY_OPTIONS.map((option) => {
        const active = normalizedValue === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange?.(option.id)}
            aria-pressed={active}
            className={`${buttonClassName} font-semibold transition-all duration-200 ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            title={option.label}
          >
            {option.id === "dense" ? `${t("Dense")} ⚡` : t(option.label)}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(TableDensityToggle);
