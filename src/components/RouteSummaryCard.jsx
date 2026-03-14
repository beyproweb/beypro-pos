import React from "react";

export default function RouteSummaryCard({
  summary,
  loading = false,
  className = "",
  t = (value) => value,
  onClose,
  onLegClick,
}) {
  const legs = Array.isArray(summary?.legs) ? summary.legs : [];

  if (!legs.length && !loading) return null;

  return (
    <div
      className={`pointer-events-auto bg-transparent text-slate-900 dark:text-slate-100 ${className}`}
    >
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">
              {t("Route Summary")}
            </div>
          </div>
          <div className="flex items-start gap-2">
            {summary?.hasApproximateLegs ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:border-amber-500/45 dark:bg-amber-500/18 dark:text-amber-100">
                {summary?.allApproximate ? t("Approximate") : t("Mixed")}
              </span>
            ) : null}
            {typeof onClose === "function" ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label={t("Close")}
                title={t("Close")}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        {loading && !legs.length ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" />
            <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800" />
          </div>
        ) : (
          <>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {legs.map((leg) => (
                <button
                  key={`route-leg-${leg.orderId || leg.stopIndex}`}
                  type="button"
                  onClick={() => onLegClick?.(leg)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {leg.customerName}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-300">
                        {t("From")} {leg.fromLabel}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{leg.distanceLabel}</div>
                      <div className="mt-1 text-[11px] font-semibold text-cyan-300">{leg.durationLabel}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {summary?.hasTotals ? (
              <>
                <div className="my-3 h-px bg-slate-200 dark:bg-slate-800" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 dark:border-cyan-900 dark:bg-cyan-950/70">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-200">
                      {t("Total Distance")}
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{summary.totalDistanceLabel}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/70">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                      {t("Total ETA")}
                    </div>
                    <div className="mt-1 text-lg font-black text-slate-900 dark:text-white">{summary.totalDurationLabel}</div>
                  </div>
                </div>
              </>
            ) : null}

            {loading ? (
              <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-300">{t("Refreshing route metrics...")}</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
