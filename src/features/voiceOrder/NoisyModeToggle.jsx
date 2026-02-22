import React, { memo } from "react";

function NoisyModeToggleComponent({
  enabled,
  onToggle,
  label,
  description,
  offsetClassName = "right-4 bottom-48 sm:bottom-36",
}) {
  return (
    <div className={`pointer-events-none fixed z-[127] ${offsetClassName}`}>
      <div className="pointer-events-auto w-[min(90vw,320px)] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_10px_25px_rgba(15,23,42,0.14)] backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(enabled)}
          onClick={onToggle}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
            enabled
              ? "bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          }`}
        >
          <span className={`font-semibold ${enabled ? "text-base" : "text-sm"}`}>{label}</span>
          <span
            aria-hidden="true"
            className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${
              enabled ? "bg-emerald-400/30" : "bg-slate-300/70 dark:bg-neutral-600"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
        </button>
        {description ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-neutral-300">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

const NoisyModeToggle = memo(NoisyModeToggleComponent);

export default NoisyModeToggle;
