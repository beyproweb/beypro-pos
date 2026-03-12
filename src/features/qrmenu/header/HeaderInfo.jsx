import React from "react";
import { ChevronDown } from "lucide-react";

function HeaderInfo({
  restaurantName,
  tagline,
  t,
  openStatus,
  showShopHoursDropdown,
  onToggleShopHoursDropdown,
  onCloseShopHoursDropdown,
  days,
  todayName,
  shopHours,
  loadingShopHours,
  shopHoursDropdownRef,
  languageControl,
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 pt-8">
      <div className="text-center">
        <h1 className="text-[2rem] sm:text-[2.55rem] md:text-[3rem] font-serif font-semibold leading-[1.05] tracking-[-0.03em] text-gray-900 dark:text-neutral-50">
          {restaurantName}
        </h1>
        <p className="mt-2 text-[15px] sm:text-[16px] font-light tracking-[0.02em] text-gray-600 dark:text-neutral-300/85">
          {tagline}
        </p>

        <div
          className="mt-5 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          ref={shopHoursDropdownRef}
        >
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] sm:text-[13px] font-medium ${
              openStatus?.isOpen
                ? "bg-emerald-50/90 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-900/30"
                : "bg-rose-50/90 text-rose-700 border-rose-200/80 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-900/30"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${openStatus?.isOpen ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span>{openStatus?.label || t("Closed")}</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={onToggleShopHoursDropdown}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200/90 bg-transparent text-gray-700 text-[12px] sm:text-[13px] font-medium hover:bg-gray-50 dark:text-neutral-200 dark:border-neutral-800 dark:hover:bg-neutral-900/70 transition"
              aria-label={t("Shop Hours")}
              title={t("Shop Hours")}
            >
              <span>{t("Shop Hours")}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showShopHoursDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {showShopHoursDropdown && (
              <div className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 top-[calc(100%+10px)] w-[min(320px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-gray-200 bg-white/95 dark:bg-neutral-950/90 shadow-xl backdrop-blur p-3 z-20">
                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                  <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                    {t("Shop Hours")}
                  </div>
                  <button
                    type="button"
                    onClick={onCloseShopHoursDropdown}
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 text-lg leading-none"
                    aria-label={t("Close")}
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  {days.map((day) => {
                    const isToday = day === todayName;
                    const open = shopHours?.[day]?.open || "";
                    const close = shopHours?.[day]?.close || "";
                    const enabled = shopHours?.[day]?.enabled !== false;
                    const has = enabled && !!(open && close);

                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                          isToday
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/30 dark:text-indigo-200"
                            : "bg-gray-50/80 text-gray-700 dark:bg-neutral-900/40 dark:text-neutral-200"
                        }`}
                      >
                        <span className="font-semibold">{t(day)}</span>
                        <span className="font-mono text-xs">
                          {loadingShopHours ? "…" : has ? `${open} - ${close}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {languageControl}
        </div>
      </div>
    </div>
  );
}

export default React.memo(HeaderInfo);
