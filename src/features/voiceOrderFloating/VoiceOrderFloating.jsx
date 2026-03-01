import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import VoiceOrderFab from "./VoiceOrderFab";
import VoiceOrderMini from "./VoiceOrderMini";
import useVoiceOrderFabState from "./useVoiceOrderFabState";

export default function VoiceOrderFloating({
  restaurantId,
  tableId,
  onStartVoiceOrder: onStartVoiceOrderProp,
  onStopVoiceOrder: onStopVoiceOrderProp,
  onHoldStartVoiceOrder: onHoldStartVoiceOrderProp,
  onHoldEndVoiceOrder: onHoldEndVoiceOrderProp,
  noisyMode = false,
  isListening = false,
  title = "Waiter",
  miniLabel = "AI Order",
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
  onOpenRecap,
  showClearRecap = false,
  clearRecapLabel = "Clear Item",
  onClearRecap,
  onToggleNoisyMode,
  noisyModeLabel = "Noisy Mode",
  noisyModeDescription = "",
  suggestions = [],
  onSelectSuggestion,
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
  startActionOnly = false,
  forceMinimized = false,
  hideMiniButton = false,
  openEventName = "",
  closeEventName = "",
  offsetClassName = "right-4 bottom-20 sm:bottom-6",
  zIndexClassName = "z-[125]",
}) {
  const location = useLocation();
  const [stubModalOpen, setStubModalOpen] = useState(false);
  const [statusMinimized, setStatusMinimized] = useState(false);
  const prevForceMinimizedRef = useRef(false);

  const fallbackScope = useMemo(
    () => `${location.pathname || ""}${location.search || ""}`,
    [location.pathname, location.search]
  );

  const { isOpen, open, close } = useVoiceOrderFabState({
    restaurantId,
    tableId,
    fallbackScope,
  });

  const onStartVoiceOrder = useCallback(() => {
    setStubModalOpen(true);
  }, []);

  const closeStubModal = useCallback(() => {
    setStubModalOpen(false);
  }, []);

  const handleStartVoiceOrder = useCallback(() => {
    if (typeof onStartVoiceOrderProp === "function") {
      onStartVoiceOrderProp();
      return;
    }
    onStartVoiceOrder();
  }, [onStartVoiceOrderProp, onStartVoiceOrder]);

  const handleStopVoiceOrder = useCallback(() => {
    if (typeof onStopVoiceOrderProp === "function") {
      onStopVoiceOrderProp();
      return;
    }
    closeStubModal();
  }, [closeStubModal, onStopVoiceOrderProp]);

  const handleHoldStartVoiceOrder = useCallback(() => {
    if (typeof onHoldStartVoiceOrderProp === "function") {
      onHoldStartVoiceOrderProp();
      return;
    }
    handleStartVoiceOrder();
  }, [onHoldStartVoiceOrderProp, handleStartVoiceOrder]);

  const handleHoldEndVoiceOrder = useCallback(() => {
    if (typeof onHoldEndVoiceOrderProp === "function") {
      onHoldEndVoiceOrderProp();
      return;
    }
    handleStopVoiceOrder();
  }, [onHoldEndVoiceOrderProp, handleStopVoiceOrder]);

  const bypassFab = Boolean(startActionOnly);
  const showExpanded = !bypassFab && isOpen && !statusMinimized;

  useEffect(() => {
    const wasForceMinimized = prevForceMinimizedRef.current;
    if (forceMinimized && !wasForceMinimized) {
      setStatusMinimized(true);
    }
    if (!forceMinimized && wasForceMinimized) {
      setStatusMinimized(false);
    }
    prevForceMinimizedRef.current = forceMinimized;
  }, [forceMinimized]);

  const handleOpenMini = useCallback(() => {
    if (statusMinimized) {
      setStatusMinimized(false);
    }
    if (bypassFab) {
      handleStartVoiceOrder();
      return;
    }
    open();
  }, [bypassFab, handleStartVoiceOrder, open, statusMinimized]);

  const handleClosePanel = useCallback(() => {
    setStatusMinimized(false);
    close();
    closeStubModal();
  }, [close, closeStubModal]);

  const handleToggleFromOpenEvent = useCallback(() => {
    if (showExpanded) {
      handleClosePanel();
      return;
    }
    handleOpenMini();
  }, [handleClosePanel, handleOpenMini, showExpanded]);

  useEffect(() => {
    if (!openEventName) return undefined;
    const handler = () => handleToggleFromOpenEvent();
    window.addEventListener(openEventName, handler);
    return () => window.removeEventListener(openEventName, handler);
  }, [handleToggleFromOpenEvent, openEventName]);

  useEffect(() => {
    if (!closeEventName) return undefined;
    const handler = () => {
      setStatusMinimized(true);
      close();
      closeStubModal();
    };
    window.addEventListener(closeEventName, handler);
    return () => window.removeEventListener(closeEventName, handler);
  }, [close, closeEventName, closeStubModal]);

  useEffect(() => {
    if (!showExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showExpanded]);

  const showMiniButton = !hideMiniButton;

  return (
    <>
      {showExpanded ? (
        <div className={`fixed inset-0 ${zIndexClassName}`}>
          <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" />
          <VoiceOrderFab
            onStart={handleStartVoiceOrder}
            onStop={handleStopVoiceOrder}
            onHoldStart={handleHoldStartVoiceOrder}
            onHoldEnd={handleHoldEndVoiceOrder}
            onClose={handleClosePanel}
            noisyMode={noisyMode}
            isListening={isListening}
            title={title}
            subtitle={subtitle}
            holdLabel={holdLabel}
            tapToStartLabel={tapToStartLabel}
            tapToStopLabel={tapToStopLabel}
            statusMessage={statusMessage}
            modeHint={modeHint}
            countText={countText}
            draftItemsPreview={draftItemsPreview}
            showOpenRecap={showOpenRecap}
            openRecapLabel={openRecapLabel}
            onOpenRecap={onOpenRecap}
            showClearRecap={showClearRecap}
            clearRecapLabel={clearRecapLabel}
            onClearRecap={onClearRecap}
            onToggleNoisyMode={onToggleNoisyMode}
            noisyModeLabel={noisyModeLabel}
            noisyModeDescription={noisyModeDescription}
            suggestions={suggestions}
            onSelectSuggestion={onSelectSuggestion}
            addSuggestionLabel={addSuggestionLabel}
            lastTranscript={lastTranscript}
            lastTranscriptLabel={lastTranscriptLabel}
            unknownPrompt={unknownPrompt}
            unknownPromptTitle={unknownPromptTitle}
            unknownPromptSelectHint={unknownPromptSelectHint}
            tryAgainLabel={tryAgainLabel}
            cancelLabel={cancelLabel}
            onTryAgainUnknown={onTryAgainUnknown}
            onCancelUnknown={onCancelUnknown}
            onSelectUnknownOption={onSelectUnknownOption}
            catalogProducts={catalogProducts}
            catalogTitle={catalogTitle}
            allCategoriesLabel={allCategoriesLabel}
            emptyCatalogLabel={emptyCatalogLabel}
            fullScreen={true}
          />
        </div>
      ) : (
        <div className={`pointer-events-none fixed ${offsetClassName} ${zIndexClassName}`}>
          {bypassFab ? (
            showMiniButton ? <VoiceOrderMini onOpen={handleOpenMini} label={miniLabel} /> : null
          ) : (
            showMiniButton ? <VoiceOrderMini onOpen={handleOpenMini} label={miniLabel} /> : null
          )}
        </div>
      )}

      {stubModalOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Voice order placeholder"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
              Waiter
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-300">
              Listening...
            </p>
            <p className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
              Voice ordering flow is coming soon for this menu mode.
            </p>
            <button
              type="button"
              onClick={closeStubModal}
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
