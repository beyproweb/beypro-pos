import React from "react";

export default function MobileStickyActionBar({
  label,
  onClick,
  disabled = false,
  helper = "",
  accentColor = "#111827",
}) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-black/5 bg-white/95 px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
      <div className="mx-auto max-w-3xl space-y-2">
        {helper ? (
          <div className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            {helper}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
