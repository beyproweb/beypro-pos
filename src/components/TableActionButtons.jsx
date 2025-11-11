import React from "react";
import { ArrowLeftRight, GitMerge } from "lucide-react";

export default function TableActionButtons({
  onMove,
  onMerge,
  cartMode = false,
  showLabels = true,
  className = "",
  moveLabel = "Move Table",
  mergeLabel = "Merge Table",
}) {
  const containerClasses = cartMode
    ? "grid w-full grid-cols-2 gap-2 py-1"
    : "flex w-full flex-wrap items-center justify-center gap-2 sm:gap-4 py-2";
  const baseButton =
    "flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  const dimensionClass = cartMode ? "w-full text-xs sm:text-sm" : "min-w-[150px]";

  const mergedClasses = [containerClasses, className].filter(Boolean).join(" ");

  return (
    <div className={mergedClasses}>
      <button
        type="button"
        onClick={onMove}
        className={`${baseButton} ${dimensionClass} border-emerald-200 text-emerald-700 hover:bg-emerald-50 focus-visible:ring-emerald-200`}
        aria-label={moveLabel}
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
        {showLabels && <span className="tracking-wide">{moveLabel}</span>}
      </button>
      <button
        type="button"
        onClick={onMerge}
        className={`${baseButton} ${dimensionClass} border-amber-200 text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-200`}
        aria-label={mergeLabel}
      >
        <GitMerge className="h-4 w-4" aria-hidden="true" />
        {showLabels && <span className="tracking-wide">{mergeLabel}</span>}
      </button>
    </div>
  );
}
