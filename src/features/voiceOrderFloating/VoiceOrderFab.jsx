import React, { memo } from "react";
import { WaiterHeadIcon, WaiterMicIcon } from "./waiterIcons";

function formatExtraPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `(+₺${value.toFixed(2)})`;
}

function VoiceOrderFabComponent({
  onStart,
  onStop,
  onHoldStart,
  onHoldEnd,
  onClose,
  onToggleNoisyMode,
  onOpenRecap,
  onSelectSuggestion,
  noisyMode = false,
  isListening = false,
  title = "Waiter",
  subtitle = "Tap to speak",
  holdLabel = "Hold to talk",
  tapToStartLabel = "Tap to start",
  tapToStopLabel = "Tap to stop",
  statusMessage = "",
  modeHint = "",
  countText = "",
  draftItemsPreview = [],
  showOpenRecap = false,
  openRecapLabel = "Open Cart",
  showClearRecap = false,
  clearRecapLabel = "Clear Item",
  onClearRecap,
  noisyModeLabel = "Noisy Mode",
  noisyModeDescription = "",
  suggestions = [],
  addSuggestionLabel = "Add",
  lastTranscript = "",
  lastTranscriptLabel = "Last heard",
  unknownPrompt = null,
  unknownPromptTitle = "I couldn't find that item. Pick a close match.",
  unknownPromptSelectHint = "Select one option.",
  tryAgainLabel = "Try again",
  cancelLabel = "Cancel",
  onTryAgainUnknown,
  onCancelUnknown,
  onSelectUnknownOption,
}) {
  const handleMainClick = () => {
    if (noisyMode && isListening && typeof onStop === "function") {
      onStop();
      return;
    }
    if (typeof onStart === "function") onStart();
  };

  const mainSubtitle = noisyMode ? (isListening ? tapToStopLabel : tapToStartLabel) : subtitle;

  return (
    <div className="pointer-events-none relative w-[min(24rem,calc(100vw-2rem))]">
      <button
        type="button"
        onClick={handleMainClick}
        aria-label="Start voice order"
        className={`pointer-events-auto group flex w-full items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/95 pr-12 text-left shadow-[0_12px_28px_rgba(2,132,199,0.2)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(2,132,199,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:border-sky-700 dark:bg-sky-950/70 ${
          noisyMode ? "px-4 py-4" : "px-3 py-3"
        }`}
      >
        <div className="relative shrink-0">
          <WaiterHeadIcon className={`${noisyMode ? "h-14 w-14" : "h-12 w-12"} rounded-full`} />
          <span className="absolute -bottom-0.5 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-slate-900" />
        </div>

        <div className="min-w-0 flex-1">
          <div className={`truncate font-semibold text-slate-900 dark:text-neutral-100 ${noisyMode ? "text-base" : "text-sm"}`}>
            {title}
          </div>
          <div className={`truncate text-sky-700 dark:text-sky-200 ${noisyMode ? "text-sm font-medium" : "text-xs"}`}>
            {mainSubtitle}
          </div>
        </div>

        <div className="relative shrink-0">
          <WaiterMicIcon className={`${noisyMode ? "h-12 w-12" : "h-10 w-10"} rounded-full`} />
          <span
            className={`absolute -right-1 top-1 h-1.5 w-1.5 rounded-full ${
              isListening ? "bg-emerald-400 animate-pulse" : "bg-sky-400"
            }`}
          />
        </div>
      </button>

      {noisyMode ? (
        <button
          type="button"
          onPointerDown={onHoldStart}
          onPointerUp={onHoldEnd}
          onPointerCancel={onHoldEnd}
          onBlur={onHoldEnd}
          className="pointer-events-auto mt-2 w-full rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100 dark:hover:bg-sky-900/50"
        >
          {holdLabel}
        </button>
      ) : null}

      <div className="pointer-events-auto mt-2 rounded-2xl border border-sky-200 bg-sky-50/95 p-3 text-xs shadow-[0_12px_28px_rgba(2,132,199,0.2)] backdrop-blur dark:border-sky-700 dark:bg-sky-950/70">
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(noisyMode)}
          onClick={onToggleNoisyMode}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
            noisyMode
              ? "bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          }`}
        >
          <span className={`font-semibold ${noisyMode ? "text-base" : "text-sm"}`}>{noisyModeLabel}</span>
          <span
            aria-hidden="true"
            className={`inline-flex h-6 w-11 items-center rounded-full p-1 transition ${
              noisyMode ? "bg-emerald-400/30" : "bg-slate-300/70 dark:bg-neutral-600"
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition ${noisyMode ? "translate-x-5" : "translate-x-0"}`}
            />
          </span>
        </button>

        {noisyModeDescription ? (
          <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-neutral-300">{noisyModeDescription}</p>
        ) : null}

        {countText ? (
          <div className="mt-3 text-[11px] font-semibold text-slate-700 dark:text-neutral-200">{countText}</div>
        ) : null}
        {Array.isArray(draftItemsPreview) && draftItemsPreview.length > 0 ? (
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/80">
            {draftItemsPreview.map((entry, index) => (
              <div
                key={entry?.key || `${entry?.label || "item"}-${index}`}
                className="truncate text-[11px] font-medium text-slate-700 dark:text-neutral-200"
                title={entry?.label || ""}
              >
                {entry?.label || "-"}
              </div>
            ))}
          </div>
        ) : null}
        {modeHint ? <div className="mt-1 text-[11px] text-slate-700 dark:text-neutral-200">{modeHint}</div> : null}
        {statusMessage ? (
          <div className="mt-1 text-[11px] text-slate-600 dark:text-neutral-300">{statusMessage}</div>
        ) : null}

        {Array.isArray(suggestions) && suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(0, 3).map((entry, index) => {
              const product = entry?.product || {};
              const name = product?.name || "-";
              return (
                <button
                  key={entry?.key || `${name}-${index}`}
                  type="button"
                  onClick={() => onSelectSuggestion?.(entry)}
                  className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 transition hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-sky-700/60 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
                >
                  {addSuggestionLabel} {name} {formatExtraPrice(product?.price)}
                </button>
              );
            })}
          </div>
        ) : null}

        {unknownPrompt ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3 dark:border-amber-700/70 dark:bg-amber-900/25">
            <div className="text-xs font-semibold text-slate-900 dark:text-neutral-100">{unknownPromptTitle}</div>
            {unknownPrompt?.queryName ? (
              <div className="mt-1 text-[11px] text-slate-700 dark:text-neutral-200">{unknownPrompt.queryName}</div>
            ) : null}

            {Array.isArray(unknownPrompt?.options) && unknownPrompt.options.length > 0 ? (
              <>
                <div className="mt-2 text-[11px] text-slate-600 dark:text-neutral-300">{unknownPromptSelectHint}</div>
                <div className="mt-2 space-y-1.5">
                  {unknownPrompt.options.slice(0, 3).map((option, index) => (
                    <button
                      key={option?.id || option?.key || option?.productId || `${option?.name || "option"}-${index}`}
                      type="button"
                      onClick={() => onSelectUnknownOption?.(option)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-left text-xs font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      {index + 1}. {option?.name || option?.label || "-"}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onTryAgainUnknown}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              >
                {tryAgainLabel}
              </button>
              <button
                type="button"
                onClick={onCancelUnknown}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
              >
                {cancelLabel}
              </button>
            </div>
          </div>
        ) : null}

        {showOpenRecap ? (
          <button
            type="button"
            onClick={onOpenRecap}
            className="mt-3 w-full rounded-xl border border-emerald-300 bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:border-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {openRecapLabel}
          </button>
        ) : null}
        {showClearRecap ? (
          <button
            type="button"
            onClick={onClearRecap}
            className="mt-2 w-full rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-300 dark:border-rose-500/80 dark:bg-neutral-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            {clearRecapLabel}
          </button>
        ) : null}

        {lastTranscript ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {lastTranscriptLabel}: {lastTranscript}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Hide voice order button"
        className="pointer-events-auto absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
      >
        <span className="text-base leading-none" aria-hidden="true">
          X
        </span>
      </button>
    </div>
  );
}

const VoiceOrderFab = memo(VoiceOrderFabComponent);

export default VoiceOrderFab;
