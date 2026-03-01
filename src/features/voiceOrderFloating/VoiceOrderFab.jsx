import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { WaiterHeadIcon, WaiterMicIcon } from "./waiterIcons";

function formatExtraPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `(+₺${value.toFixed(2)})`;
}

function formatProductPrice(price) {
  const value = Number(price);
  if (!Number.isFinite(value)) return "₺0.00";
  return `₺${value.toFixed(2)}`;
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
  catalogProducts = [],
  catalogTitle = "Menu",
  allCategoriesLabel = "All",
  emptyCatalogLabel = "No products available.",
  fullScreen = false,
}) {
  const [activeCatalogCategory, setActiveCatalogCategory] = useState("ALL");
  const categoryScrollerRef = useRef(null);
  const categoryButtonRefs = useRef(new Map());
  const handleMainClick = () => {
    if (noisyMode && isListening && typeof onStop === "function") {
      onStop();
      return;
    }
    if (typeof onStart === "function") onStart();
  };

  const mainSubtitle = noisyMode ? (isListening ? tapToStopLabel : tapToStartLabel) : subtitle;
  const catalogCategories = useMemo(() => {
    const set = new Set();
    (Array.isArray(catalogProducts) ? catalogProducts : []).forEach((product) => {
      const category = String(product?.category || product?.category_name || "").trim();
      if (category) set.add(category);
    });
    return [allCategoriesLabel, ...Array.from(set)];
  }, [allCategoriesLabel, catalogProducts]);

  useEffect(() => {
    if (!catalogCategories.includes(activeCatalogCategory)) {
      setActiveCatalogCategory(allCategoriesLabel);
    }
  }, [activeCatalogCategory, allCategoriesLabel, catalogCategories]);

  useEffect(() => {
    const activeButton = categoryButtonRefs.current.get(activeCatalogCategory);
    if (!activeButton) return;

    activeButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeCatalogCategory]);

  const visibleCatalogProducts = useMemo(() => {
    const safeProducts = Array.isArray(catalogProducts) ? catalogProducts : [];
    if (activeCatalogCategory === allCategoriesLabel) return safeProducts;
    return safeProducts.filter(
      (product) => String(product?.category || product?.category_name || "").trim() === activeCatalogCategory
    );
  }, [activeCatalogCategory, allCategoriesLabel, catalogProducts]);

  return (
    <div className={fullScreen ? "pointer-events-none absolute inset-0" : "pointer-events-none relative w-[min(24rem,calc(100vw-2rem))]"}>
      <div
        className={`pointer-events-auto ${
          fullScreen
            ? "flex h-full w-full flex-col overflow-hidden bg-white text-slate-900 dark:bg-neutral-950 dark:text-neutral-100"
            : ""
        }`}
      >
      <div
        className={`flex w-full items-center gap-3 border border-sky-200 bg-sky-50/95 pr-12 text-left backdrop-blur dark:border-sky-700 dark:bg-sky-950/70 ${
          fullScreen
            ? "rounded-none border-x-0 border-t-0 px-4 py-4 shadow-none"
            : `pointer-events-auto rounded-2xl shadow-[0_12px_28px_rgba(2,132,199,0.2)] ${
                noisyMode ? "px-4 py-4" : "px-3 py-3"
              }`
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
          {!fullScreen ? (
            <div className={`truncate text-sky-700 dark:text-sky-200 ${noisyMode ? "text-[16px] font-medium" : "text-[14px]"}`}>
              {mainSubtitle}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleMainClick}
          aria-label={mainSubtitle}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl border border-sky-300 bg-white px-3 py-2 text-sky-800 shadow-sm transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:border-sky-600 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
        >
          <span className={`whitespace-nowrap font-semibold ${noisyMode ? "text-[16px]" : "text-[14px]"}`}>
            {mainSubtitle}
          </span>
          <span className="relative inline-flex">
            <WaiterMicIcon className={`${noisyMode ? "h-11 w-11" : "h-9 w-9"} rounded-full`} />
            <span
              className={`absolute -right-1 top-0.5 h-2 w-2 rounded-full ${
                isListening ? "bg-emerald-400 animate-pulse" : "bg-sky-400"
              }`}
            />
          </span>
        </button>
      </div>

      <div
        className={`grid grid-cols-2 gap-2 ${
          fullScreen ? "border-x-0 border-b border-sky-200 bg-sky-50/95 px-4 py-3 dark:border-sky-700 dark:bg-sky-950/70" : "pointer-events-auto mt-2"
        }`}
      >
        <button
          type="button"
          onPointerDown={noisyMode ? onHoldStart : undefined}
          onPointerUp={noisyMode ? onHoldEnd : undefined}
          onPointerCancel={noisyMode ? onHoldEnd : undefined}
          onBlur={noisyMode ? onHoldEnd : undefined}
          disabled={!noisyMode}
          className={`rounded-xl border px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 ${
            noisyMode
              ? "border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-600 dark:bg-sky-900/50 dark:text-sky-100 dark:hover:bg-sky-900/70"
              : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500"
          }`}
        >
          {holdLabel}
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={Boolean(noisyMode)}
          onClick={onToggleNoisyMode}
          className={`flex items-center justify-between rounded-xl px-3 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-sky-300 ${
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
      </div>

      <div className={`text-xs dark:border-sky-700 dark:bg-sky-950/70 ${
        fullScreen
          ? "flex-1 overflow-y-auto border-t border-sky-200 bg-sky-50/95 p-4 shadow-none"
          : "pointer-events-auto mt-2 rounded-2xl border border-sky-200 bg-sky-50/95 p-3 shadow-[0_12px_28px_rgba(2,132,199,0.2)] backdrop-blur"
      }`}>
        {noisyModeDescription ? (
          <p className={`${fullScreen ? "" : "mt-2"} text-[13px] leading-relaxed text-slate-600 dark:text-neutral-300`}>{noisyModeDescription}</p>
        ) : null}

        {countText ? (
          <div className="mt-3 text-[13px] font-semibold text-slate-700 dark:text-neutral-200">{countText}</div>
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
        {modeHint ? <div className="mt-1 text-[13px] text-slate-700 dark:text-neutral-200">{modeHint}</div> : null}
        {statusMessage ? (
          <div className="mt-1 text-[13px] text-slate-600 dark:text-neutral-300">{statusMessage}</div>
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
              <div className="mt-1 text-[13px] text-slate-700 dark:text-neutral-200">{unknownPrompt.queryName}</div>
            ) : null}

            {Array.isArray(unknownPrompt?.options) && unknownPrompt.options.length > 0 ? (
              <>
                <div className="mt-2 text-[13px] text-slate-600 dark:text-neutral-300">{unknownPromptSelectHint}</div>
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
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {lastTranscriptLabel}: {lastTranscript}
          </div>
        ) : null}

        <div className="mt-3 rounded-xl border border-slate-200 bg-white/85 p-2 dark:border-neutral-700 dark:bg-neutral-900/70">
          <div className="px-1 text-[13px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-neutral-400">
            {catalogTitle}
          </div>

          {catalogCategories.length > 0 ? (
            <div
              ref={categoryScrollerRef}
              className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
            >
              {catalogCategories.map((category) => {
                const active = category === activeCatalogCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    ref={(node) => {
                      if (node) {
                        categoryButtonRefs.current.set(category, node);
                      } else {
                        categoryButtonRefs.current.delete(category);
                      }
                    }}
                    onClick={() => setActiveCatalogCategory(category)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          ) : null}

          {visibleCatalogProducts.length > 0 ? (
            <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {visibleCatalogProducts.map((product, index) => {
                const name = product?.name || "-";
                const category = String(product?.category || product?.category_name || "").trim();
                return (
                  <button
                        key={product?.id || `${name}-${index}`}
                        type="button"
                    onClick={() =>
                      onSelectSuggestion?.({
                        key: product?.id || `${name}-${index}`,
                        product,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-2 text-left transition hover:bg-sky-50 hover:border-sky-200 dark:border-neutral-700 dark:bg-neutral-800/90 dark:hover:bg-sky-950/30 dark:hover:border-sky-700/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-slate-800 dark:text-neutral-100">
                          {name}
                        </div>
                        {category ? (
                          <div className="truncate text-[12px] text-slate-500 dark:text-neutral-400">
                            {category}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-[13px] font-semibold text-sky-700 dark:text-sky-200">
                        {formatProductPrice(product?.price)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500 dark:border-neutral-700 dark:text-neutral-400">
              {emptyCatalogLabel}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Hide voice order button"
        className={`absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 ${
          fullScreen ? "pointer-events-auto" : "pointer-events-auto"
        }`}
      >
        <span className="text-base leading-none" aria-hidden="true">
          X
        </span>
      </button>
      </div>
    </div>
  );
}

const VoiceOrderFab = memo(VoiceOrderFabComponent);

export default VoiceOrderFab;
