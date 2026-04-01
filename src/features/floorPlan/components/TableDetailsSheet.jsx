import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import GuestCompositionCard from "./GuestCompositionCard";

function normalizeHexColor(value, fallback = "#111827") {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "");
  if (!normalized) return null;
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return "#FFFFFF";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? "#0F172A" : "#FFFFFF";
}

export default function TableDetailsSheet({
  tableNode,
  onClose,
  onConfirm,
  confirmDisabled = false,
  confirmLabel,
  embedded = false,
  guestCompositionProps = null,
  accentColor = "#111827",
}) {
  const { t } = useTranslation();
  if (!tableNode) return null;
  const state = tableNode.state || {};
  const areaLabel = state.zone || tableNode.zone || t("Main floor");
  const resolvedConfirmLabel = confirmLabel || t("Select table");
  const tableNumber = Number(tableNode.linked_table_number || tableNode.table_number || 0);
  const rawName = String(tableNode.displayName || "").trim();
  const resolvedTableTitle =
    tableNumber > 0 && (!rawName || /^Table\s+\d+$/i.test(rawName))
      ? t("Table {{count}}", { count: tableNumber })
      : rawName || t("Table");
  const capacity = Number(tableNode.capacity || state.capacity || 0);
  const tableType = t(String(state.table_type || tableNode.table_type || "regular").replace(/_/g, " "));
  const useMobileFullscreen = embedded && Boolean(guestCompositionProps);
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  return (
    <div
      className={[
        embedded
          ? useMobileFullscreen
            ? "fixed inset-0 z-[95] overflow-y-auto bg-[linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] p-4 sm:static sm:z-auto sm:border-t sm:border-neutral-200 sm:bg-white/98 sm:p-4 sm:shadow-[0_-12px_30px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:sm:border-neutral-800 dark:sm:bg-neutral-950/98"
            : "border-t border-neutral-200 bg-white/98 p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] sm:p-4 dark:border-neutral-800 dark:bg-neutral-950/98"
          : "fixed inset-x-0 bottom-0 z-[70] max-h-[58vh] overflow-y-auto rounded-t-[28px] border border-neutral-200 bg-white p-3 shadow-[0_-18px_50px_rgba(15,23,42,0.18)] overscroll-contain [touch-action:pan-y] sm:p-4 dark:border-neutral-800 dark:bg-neutral-950",
      ].join(" ")}
    >
      <div className={["mx-auto max-w-3xl space-y-3", useMobileFullscreen ? "flex min-h-full flex-col" : ""].join(" ")}>
        {/* Header */}
        <div className={["flex items-start justify-between gap-3", useMobileFullscreen ? "sticky top-0 z-10 bg-inherit pb-2" : ""].join(" ")}>
          <div>
            <div className="text-base font-semibold text-neutral-950 dark:text-white">{resolvedTableTitle}</div>
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{areaLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 dark:border-neutral-800"
            aria-label={t("Close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={useMobileFullscreen ? "flex-1 space-y-3" : "space-y-3"}>
          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[24px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                {t("Capacity")}
              </div>
              <div className="mt-3 text-2xl font-semibold text-neutral-950 dark:text-white">
                {capacity > 0 ? capacity : "—"}
              </div>
            </div>
            <div className="rounded-[24px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                {t("Type")}
              </div>
              <div className="mt-3 text-2xl font-semibold capitalize text-neutral-950 dark:text-white">
                {tableType}
              </div>
            </div>
          </div>

          {guestCompositionProps ? (
            <div className="rounded-[24px] border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70">
              <GuestCompositionCard {...guestCompositionProps} accentColor={accentColor} />
            </div>
          ) : null}
        </div>

        {/* Confirm */}
        <button
          type="button"
          onClick={() => onConfirm?.(tableNode)}
          disabled={confirmDisabled}
          className={[
            "w-full rounded-[24px] px-4 py-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            useMobileFullscreen ? "sticky bottom-0 mt-4" : "",
          ].join(" ")}
          style={{
            backgroundColor: resolvedAccentColor,
            color: accentTextColor,
            boxShadow: "0 18px 45px -24px rgba(15,23,42,0.8)",
          }}
        >
          {resolvedConfirmLabel}
        </button>
      </div>
    </div>
  );
}
