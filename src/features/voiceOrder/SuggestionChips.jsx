import React, { memo, useMemo } from "react";

function formatPrice(price, lang) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return `(+₺${new Intl.NumberFormat(lang || "en").format(value)})`;
  } catch {
    return `(+₺${value.toFixed(2)})`;
  }
}

function SuggestionChipsComponent({
  suggestions,
  lang,
  tVoice,
  onSelect,
  offsetClassName = "right-4 bottom-24 sm:bottom-14",
}) {
  const chips = useMemo(() => (Array.isArray(suggestions) ? suggestions.slice(0, 3) : []), [suggestions]);

  if (!chips.length) return null;

  return (
    <div className={`pointer-events-none fixed z-[127] ${offsetClassName}`}>
      <div className="pointer-events-auto w-[min(90vw,320px)] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_10px_25px_rgba(15,23,42,0.14)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
          {tVoice("voice.waiter.suggestionsTitle", "Often added")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((entry) => {
            const product = entry?.product || null;
            if (!product) return null;
            const name = product?.name || "-";
            const priceLabel = formatPrice(product?.price, lang);

            return (
              <button
                key={entry?.key || `${name}-${entry?.tokenKey || "s"}`}
                type="button"
                onClick={() => onSelect(entry)}
                aria-label={tVoice("voice.waiter.addSuggestion", "Add {{name}}", { name })}
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:scale-[1.01] hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-sky-700/60 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
              >
                {tVoice("voice.waiter.addSuggestion", "Add {{name}}", { name })}
                {priceLabel ? ` ${priceLabel}` : ""}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const SuggestionChips = memo(SuggestionChipsComponent);

export default SuggestionChips;
