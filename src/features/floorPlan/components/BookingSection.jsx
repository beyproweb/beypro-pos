import React from "react";
import { useTranslation } from "react-i18next";

export default function BookingSection({
  step,
  title,
  description = "",
  children,
  rightSlot = null,
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800/60">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-900">
              {step}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
              {t("Step")}
            </span>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
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
