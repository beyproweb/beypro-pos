import React from "react";
import { Search, Mic } from "lucide-react";

function TransactionHeader({
  catalogSearch,
  setCatalogSearch,
  t,
  visibleCount,
  isReorderingCategories,
  onToggleReorder,
  activeCategory,
  isCatalogSearching,
  matchingCategories,
  onSelectCategory,
  onVoiceStart,
  voiceListening,
}) {
  return (
    <div className="border-b border-slate-200/70 bg-white/50 px-4 py-3 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1 w-[calc(100%-1cm)] max-w-none sm:flex-none sm:w-full sm:max-w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              placeholder={t("Search products or categories")}
              className="w-full rounded-full border border-white/70 bg-white/90 px-9 py-2 text-sm text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.08)] outline-none transition placeholder:text-slate-400 focus:border-indigo-200 focus:ring-4 focus:ring-indigo-100 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-400 dark:shadow-[0_10px_24px_rgba(0,0,0,0.35)] dark:focus:border-indigo-500/60 dark:focus:ring-indigo-500/20"
            />
            {catalogSearch.trim() && (
              <button
                type="button"
                onClick={() => setCatalogSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                aria-label={t("Clear search")}
              >
                ✕
              </button>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-indigo-50/90 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm dark:bg-indigo-950/35 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-500/20">
            {visibleCount} {t("Products")}
          </span>
          {onVoiceStart && (
            <button
              type="button"
              onClick={onVoiceStart}
              className={`ml-2 inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                voiceListening
                  ? "bg-emerald-600 text-white shadow-[0_10px_20px_rgba(16,185,129,0.35)]"
                  : "bg-white/80 text-slate-700 ring-1 ring-slate-200 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-700/70 dark:hover:bg-slate-900/80"
              }`}
              aria-pressed={voiceListening}
              aria-label={t("Voice order")}
            >
              <Mic className={`h-4 w-4 ${voiceListening ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{t("Voice")}</span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 min-w-[140px]">
          <button
            type="button"
            onClick={onToggleReorder}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
              isReorderingCategories
                ? "bg-indigo-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]"
                : "bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white dark:bg-slate-900/60 dark:text-slate-200 dark:ring-slate-700/70 dark:hover:bg-slate-900/80"
            }`}
            aria-pressed={isReorderingCategories}
          >
            {isReorderingCategories ? t("Done") : t("Reorder")}
          </button>
          <h2 className="text-lg font-semibold text-slate-800 text-right dark:text-slate-100">
            {activeCategory ? t(activeCategory) : t("Products")}
          </h2>
        </div>
      </div>
      {isCatalogSearching && matchingCategories.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pb-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("Results")}:</span>
          {matchingCategories.map((entry) => (
            <button
              key={`catmatch-${entry.idx}`}
              type="button"
              onClick={() => onSelectCategory(entry.idx)}
              className="rounded-full border border-slate-300/60 bg-slate-100/60 px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-200/80 transition-colors dark:border-slate-600/40 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-700/60"
            >
              {t(entry.cat)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(TransactionHeader);
