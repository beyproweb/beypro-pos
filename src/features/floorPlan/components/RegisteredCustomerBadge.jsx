import React from "react";
import { useTranslation } from "react-i18next";

export default function RegisteredCustomerBadge({
  customer,
  accentColor = "#111827",
  onEdit,
}) {
  const { t } = useTranslation();
  const displayName = String(customer?.name || customer?.username || "").trim();
  const displayPhone = String(customer?.phone || "").trim();
  const displayEmail = String(customer?.email || "").trim();
  const infoItems = [
    displayPhone ? { label: t("Phone"), value: displayPhone } : null,
    displayEmail ? { label: t("Email"), value: displayEmail } : null,
  ].filter(Boolean);

  return (
    <div className="rounded-[24px] border border-neutral-200 bg-white px-4 py-3 shadow-[0_14px_32px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex max-w-full items-center rounded-xl bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-950 dark:bg-neutral-900 dark:text-white">
            <span className="truncate">
            {displayName || t("Saved checkout details")}
            </span>
          </div>
        </div>
        {typeof onEdit === "function" ? (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300 hover:bg-white dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600 dark:hover:bg-neutral-950"
          >
            {t("Edit")}
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {infoItems.map((item) => (
          <div
            key={`${item.label}-${item.value}`}
            className="max-w-full rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <span className="mr-1 font-semibold text-neutral-500 dark:text-neutral-400">{item.label}:</span>
            <span className="break-all">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}