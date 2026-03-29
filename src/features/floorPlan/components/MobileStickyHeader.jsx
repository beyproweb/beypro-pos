import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

export default function MobileStickyHeader({
  title,
  subtitle = "",
  onBack,
  accentColor = "#111827",
  showIndicator = true,
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          aria-label={t("Back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </div>
          {subtitle ? (
            <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </div>
          ) : null}
        </div>
        {showIndicator ? (
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
        ) : null}
      </div>
    </header>
  );
}
