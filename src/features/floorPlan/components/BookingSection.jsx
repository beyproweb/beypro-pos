import React from "react";

export default function BookingSection({
  step,
  title,
  description = "",
  children,
  rightSlot = null,
  compact = false,
}) {
  const hasHeaderContent = Boolean(title || description || rightSlot);
  return (
    <section
      className={[
        "border-b border-neutral-200 bg-white shadow-none dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-[28px] sm:border sm:shadow-[0_20px_45px_rgba(15,23,42,0.08)]",
        compact ? "p-3 sm:p-4" : "p-4",
      ].join(" ")}
    >
      {hasHeaderContent ? (
        <div className={[compact ? "mb-3" : "mb-4", "flex items-start justify-between gap-3"].join(" ")}>
          <div className="min-w-0">
            {title ? (
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            ) : null}
          </div>
          {rightSlot}
        </div>
      ) : null}
      {children}
    </section>
  );
}
