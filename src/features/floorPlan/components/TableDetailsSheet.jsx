import React from "react";
import { useTranslation } from "react-i18next";
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
  const state = tableNode?.state || {};
  const resolvedConfirmLabel = confirmLabel || t("Select table");
  const tableNumber = Number(tableNode?.linked_table_number || tableNode?.table_number || 0);
  const rawName = String(tableNode?.displayName || "").trim();
  const capacity = Number(tableNode?.capacity || state.capacity || 0);
  const tableArea = String(
    state.zone || tableNode?.zone || tableNode?.table?.area || t("Main floor")
  ).trim();
  const hasGuestCompositionStep = embedded && Boolean(guestCompositionProps);
  const [showGuestComposition, setShowGuestComposition] = React.useState(false);
  const useMobileFullscreen = hasGuestCompositionStep && showGuestComposition;
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);

  React.useEffect(() => {
    setShowGuestComposition(false);
  }, [hasGuestCompositionStep, tableNumber, tableNode?.id]);

  if (!tableNode) return null;

  if (hasGuestCompositionStep && !showGuestComposition) {
    return (
      <div className="mt-2 rounded-[24px] border border-neutral-200 bg-white/98 p-2.5 shadow-[0_-10px_26px_rgba(15,23,42,0.12)] dark:border-neutral-800 dark:bg-neutral-950/98">
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <div className="flex justify-center">
              <div className="rounded-[16px] bg-white/90 px-2.5 py-1.5 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-900/80 dark:ring-neutral-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                    {t("Table")}
                  </span>
                  <span className="text-[13px] font-semibold text-neutral-950 dark:text-white">
                    {tableNumber > 0 ? tableNumber : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="rounded-[16px] bg-white/90 px-2.5 py-1.5 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-900/80 dark:ring-neutral-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                    {t("Capacity")}
                  </span>
                  <span className="text-[13px] font-semibold text-neutral-950 dark:text-white">
                    {capacity > 0 ? capacity : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="rounded-[16px] bg-white/90 px-2.5 py-1.5 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-900/80 dark:ring-neutral-800">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                    {t("Area")}
                  </span>
                  <span className="truncate text-[13px] font-semibold capitalize text-neutral-950 dark:text-white">
                    {tableArea}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGuestComposition(true)}
            className="w-full rounded-[20px] px-4 py-2 text-sm font-semibold transition"
            style={{
              backgroundColor: resolvedAccentColor,
              color: accentTextColor,
              boxShadow: "0 18px 45px -24px rgba(15,23,42,0.8)",
            }}
          >
            {t("Choose table")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        embedded
          ? useMobileFullscreen
            ? "fixed inset-0 z-[95] overflow-y-auto bg-[linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] p-4 sm:static sm:z-auto sm:border-t sm:border-neutral-200 sm:bg-white/98 sm:p-4 sm:shadow-[0_-12px_30px_rgba(15,23,42,0.08)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:sm:border-neutral-800 dark:sm:bg-neutral-950/98"
            : "border-t border-neutral-200 bg-white/98 p-2.5 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] sm:p-3 dark:border-neutral-800 dark:bg-neutral-950/98"
          : "fixed inset-x-0 bottom-0 z-[70] max-h-[58vh] overflow-y-auto rounded-t-[28px] border border-neutral-200 bg-white p-3 shadow-[0_-18px_50px_rgba(15,23,42,0.18)] overscroll-contain [touch-action:pan-y] sm:p-4 dark:border-neutral-800 dark:bg-neutral-950",
      ].join(" ")}
    >
      <div className={["mx-auto max-w-3xl space-y-2.5", useMobileFullscreen ? "flex min-h-full flex-col" : ""].join(" ")}>
        <div className={useMobileFullscreen ? "flex-1 space-y-2.5" : "space-y-2.5"}>
          {/* Info cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  {t("Table")}
                </div>
                <div className="truncate text-[14px] font-semibold leading-none text-neutral-950 dark:text-white">
                  {tableNumber > 0 ? tableNumber : "—"}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  {t("Capacity")}
                </div>
                <div className="text-[14px] font-semibold leading-none text-neutral-950 dark:text-white">
                  {capacity > 0 ? capacity : "—"}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/80">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[13px] font-semibold capitalize leading-none text-neutral-950 dark:text-white">
                  {tableArea}
                </div>
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
            "w-full rounded-[24px] px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
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
