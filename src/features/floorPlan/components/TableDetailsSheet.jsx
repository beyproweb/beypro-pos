import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export default function TableDetailsSheet({
  tableNode,
  onClose,
  onConfirm,
  confirmDisabled = false,
  confirmLabel = "Select table",
  embedded = false,
}) {
  const { t } = useTranslation();
  if (!tableNode) return null;
  const state = tableNode.state || {};
  const areaLabel = state.zone || tableNode.zone || t("Main floor");
  return (
    <div
      className={[
        embedded
          ? "border-t border-neutral-200 bg-white/98 p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-950/98"
          : "fixed inset-x-0 bottom-0 z-[70] max-h-[58vh] overflow-y-auto rounded-t-[28px] border border-neutral-200 bg-white p-4 shadow-[0_-18px_50px_rgba(15,23,42,0.18)] overscroll-contain [touch-action:pan-y] dark:border-neutral-800 dark:bg-neutral-950",
      ].join(" ")}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              <span>{tableNode.displayName}</span>
              <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                {areaLabel}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 dark:border-neutral-800"
            aria-label={t("Close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-neutral-100 px-3 py-2.5 dark:bg-neutral-900">
            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{t("Capacity")}</div>
            <div className="mt-1 font-semibold text-neutral-900 dark:text-neutral-50">
              {Number(tableNode.capacity || state.capacity || 0) || t("Flexible")}
            </div>
          </div>
          <div className="rounded-2xl bg-neutral-100 px-3 py-2.5 dark:bg-neutral-900">
            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{t("Type")}</div>
            <div className="mt-1 font-semibold capitalize text-neutral-900 dark:text-neutral-50">
              {t(String(state.table_type || tableNode.table_type || "regular").replace(/_/g, " "))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onConfirm?.(tableNode)}
          disabled={confirmDisabled}
          className="mt-4 w-full rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-950"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
