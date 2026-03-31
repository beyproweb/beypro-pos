import React from "react";

export default function QuantityStepperCard({
  label = "Quantity",
  value = 1,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  increaseDisabled = false,
  helperText = "",
}) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={decreaseDisabled}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xl font-semibold text-neutral-900 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        >
          -
        </button>
        <div className="min-w-[72px] text-center text-2xl font-semibold text-neutral-950 dark:text-white">
          {value}
        </div>
        <button
          type="button"
          onClick={onIncrease}
          disabled={increaseDisabled}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xl font-semibold text-neutral-900 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        >
          +
        </button>
      </div>
      {helperText ? (
        <div className="mt-3 text-center text-xs text-neutral-500 dark:text-neutral-400">{helperText}</div>
      ) : null}
    </div>
  );
}