import React, { memo } from "react";

function DraftOrderBubbleComponent({
  visible,
  isListening,
  itemCount,
  message,
  modeHint,
  emphasized = false,
  titleText,
  countText,
  showOpenRecap = false,
  openRecapLabel = "Open recap",
  onOpenRecap,
  offsetClassName = "right-4 bottom-36 sm:bottom-24",
}) {
  if (!visible) return null;

  return (
    <div className={`pointer-events-none fixed z-[126] ${offsetClassName}`}>
      <div
        className={`pointer-events-auto rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-[0_10px_25px_rgba(15,23,42,0.14)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 ${
          emphasized ? "text-sm" : "text-xs"
        }`}
      >
        <div className="flex items-center gap-2 text-slate-700 dark:text-neutral-200">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isListening ? "animate-pulse bg-emerald-500" : "bg-sky-500"
            }`}
            aria-hidden="true"
          />
          <span className="font-medium">{titleText || (isListening ? "Waiter listening..." : "Waiter")}</span>
        </div>
        <div className="mt-1 text-slate-500 dark:text-neutral-400">
          {countText || (itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} in pad` : "No items yet")}
        </div>
        {modeHint ? <div className="mt-1 text-slate-700 dark:text-neutral-200">{modeHint}</div> : null}
        {message ? <div className="mt-1 max-w-[240px] text-slate-600 dark:text-neutral-300">{message}</div> : null}
        {showOpenRecap && typeof onOpenRecap === "function" ? (
          <button
            type="button"
            onClick={onOpenRecap}
            className="mt-2 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            {openRecapLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

const DraftOrderBubble = memo(DraftOrderBubbleComponent);

export default DraftOrderBubble;
