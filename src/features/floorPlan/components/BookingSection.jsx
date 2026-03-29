import React from "react";

export default function BookingSection({
  step,
  title,
  description = "",
  children,
  rightSlot = null,
}) {
  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
            Step {step}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          ) : null}
        </div>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}
