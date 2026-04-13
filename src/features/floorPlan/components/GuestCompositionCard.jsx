import React from "react";

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

function toRgba(value, alpha) {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function GuestCounter({
  label,
  value,
  onDecrease,
  onIncrease,
  disabled = false,
  accentColor = "#111827",
  compact = false,
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  return (
    <div
      className={[
        "rounded-[24px] border border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80",
        compact ? "p-3" : "p-4",
      ].join(" ")}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className={[compact ? "mt-2.5" : "mt-3", "flex items-center justify-between gap-3"].join(" ")}>
        <button
          type="button"
          onClick={onDecrease}
          disabled={disabled}
          className={[
            "inline-flex items-center justify-center rounded-2xl border text-xl font-semibold disabled:opacity-40",
            compact ? "h-10 w-10" : "h-11 w-11",
          ].join(" ")}
          style={{
            borderColor: toRgba(resolvedAccentColor, 0.22) || resolvedAccentColor,
            backgroundColor: toRgba(resolvedAccentColor, 0.08) || "#F8FAFC",
            color: resolvedAccentColor,
          }}
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
          className={[
            "inline-flex items-center justify-center rounded-2xl border text-xl font-semibold disabled:opacity-40",
            compact ? "h-10 w-10" : "h-11 w-11",
          ].join(" ")}
          style={{
            borderColor: toRgba(resolvedAccentColor, 0.22) || resolvedAccentColor,
            backgroundColor: toRgba(resolvedAccentColor, 0.08) || "#F8FAFC",
            color: resolvedAccentColor,
          }}
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
  // Total guest count picker (optional)
  guestOptions = [],
  selectedGuests = 0,
  onGuestCountChange,
  guestsLabel = "Guests",
  // Men / women split (optional)
  menLabel = "Men",
  womenLabel = "Women",
  menCount = 0,
  womenCount = 0,
  onMenChange,
  onWomenChange,
  locked = false,
  error = "",
  policyMessage = "",
  accentColor = "#111827",
  compact = false,
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const hasTotalPicker = Array.isArray(guestOptions) && guestOptions.length > 0;
  const hasSplit = Boolean(onMenChange || onWomenChange);
  const sortedGuestOptions = hasTotalPicker
    ? [...guestOptions]
        .map((option) => Number(option) || 0)
        .filter((option) => option > 0)
        .sort((left, right) => left - right)
    : [];
  const minGuests = sortedGuestOptions[0] || 0;
  const maxGuests = sortedGuestOptions[sortedGuestOptions.length - 1] || 0;
  const selectedGuestValue = sortedGuestOptions.includes(Number(selectedGuests || 0))
    ? Number(selectedGuests || 0)
    : minGuests;
  const selectedGuestIndex = sortedGuestOptions.findIndex((option) => option === selectedGuestValue);
  const canDecreaseGuests = selectedGuestIndex > 0;
  const canIncreaseGuests = selectedGuestIndex >= 0 && selectedGuestIndex < sortedGuestOptions.length - 1;

  const handleGuestStep = (direction) => {
    if (!hasTotalPicker || typeof onGuestCountChange !== "function") return;
    const nextIndex = selectedGuestIndex + direction;
    if (nextIndex < 0 || nextIndex >= sortedGuestOptions.length) return;
    onGuestCountChange(sortedGuestOptions[nextIndex]);
  };

  return (
    <div className={compact ? "space-y-2.5" : "space-y-3"}>
      {/* Title + description */}
      {title || description ? (
        <div>
          {title ? (
            <div className="text-base font-semibold text-neutral-950 dark:text-white">{title}</div>
          ) : null}
          {description ? (
            <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</div>
          ) : null}
        </div>
      ) : null}

      {/* Total guest count picker */}
      {hasTotalPicker ? (
        <div>
          {guestsLabel ? (
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
              {guestsLabel}
            </div>
          ) : null}
          <div
            className={[
              "rounded-[24px] border border-neutral-200 bg-white/90 dark:border-neutral-800 dark:bg-neutral-900/80",
              compact ? "p-3" : "p-4",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                {guestsLabel ? (
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                    {guestsLabel}
                  </div>
                ) : null}
                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-semibold text-neutral-950 dark:text-white">
                    {selectedGuestValue}
                  </span>
                  <span className="pb-1 text-sm font-medium text-neutral-400 dark:text-neutral-500">
                    / {maxGuests}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGuestStep(-1)}
                  disabled={!canDecreaseGuests}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl border text-xl font-semibold transition disabled:opacity-40",
                    compact ? "h-10 w-10" : "h-11 w-11",
                  ].join(" ")}
                  style={{
                    borderColor: toRgba(resolvedAccentColor, 0.22) || resolvedAccentColor,
                    backgroundColor: toRgba(resolvedAccentColor, 0.08) || "#F8FAFC",
                    color: resolvedAccentColor,
                  }}
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => handleGuestStep(1)}
                  disabled={!canIncreaseGuests}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl border text-xl font-semibold transition disabled:opacity-40",
                    compact ? "h-10 w-10" : "h-11 w-11",
                  ].join(" ")}
                  style={{
                    borderColor: toRgba(resolvedAccentColor, 0.22) || resolvedAccentColor,
                    backgroundColor: resolvedAccentColor,
                    color: accentTextColor,
                    boxShadow: `0 14px 28px ${toRgba(resolvedAccentColor, 0.18) || "rgba(15,23,42,0.18)"}`,
                  }}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Men / women split */}
      {hasSplit ? (
        <div className={["grid grid-cols-1 sm:grid-cols-2", compact ? "gap-2.5" : "gap-3"].join(" ")}>
          <GuestCounter
            label={menLabel}
            value={menCount}
            onDecrease={() => onMenChange?.(-1)}
            onIncrease={() => onMenChange?.(1)}
            disabled={locked}
            accentColor={resolvedAccentColor}
            compact={compact}
          />
          <GuestCounter
            label={womenLabel}
            value={womenCount}
            onDecrease={() => onWomenChange?.(-1)}
            onIncrease={() => onWomenChange?.(1)}
            disabled={locked}
            accentColor={resolvedAccentColor}
            compact={compact}
          />
        </div>
      ) : null}

      {/* Policy + error messages */}
      {policyMessage && !error ? (
        <div
          className={[
            "rounded-2xl border text-sm",
            compact ? "px-3 py-2.5" : "px-4 py-3",
          ].join(" ")}
          style={{
            borderColor: toRgba(resolvedAccentColor, 0.2) || resolvedAccentColor,
            backgroundColor: toRgba(resolvedAccentColor, 0.08) || "rgba(248,250,252,0.9)",
            color: resolvedAccentColor,
          }}
        >
          {policyMessage}
        </div>
      ) : null}
      {error ? (
        <div
          className={[
            "rounded-2xl border border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-100",
            compact ? "px-3 py-2.5" : "px-4 py-3",
          ].join(" ")}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
