import React from "react";

function GuestCounter({ label, value, onDecrease, onIncrease, disabled = false }) {
  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onDecrease}
          disabled={disabled}
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
          disabled={disabled}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-xl font-semibold text-neutral-900 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function GuestCompositionCard({
  title = "Guest Composition",
  description = "",
  menLabel = "Men",
  womenLabel = "Women",
  menCount = 0,
  womenCount = 0,
  onMenChange,
  onWomenChange,
  locked = false,
  error = "",
  policyMessage = "",
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-base font-semibold text-neutral-950 dark:text-white">{title}</div>
        {description ? (
          <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</div>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GuestCounter
          label={menLabel}
          value={menCount}
          onDecrease={() => onMenChange?.(-1)}
          onIncrease={() => onMenChange?.(1)}
          disabled={locked}
        />
        <GuestCounter
          label={womenLabel}
          value={womenCount}
          onDecrease={() => onWomenChange?.(-1)}
          onIncrease={() => onWomenChange?.(1)}
          disabled={locked}
        />
      </div>
      {policyMessage && !error ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/30 dark:bg-sky-950/20 dark:text-sky-100">
          {policyMessage}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
