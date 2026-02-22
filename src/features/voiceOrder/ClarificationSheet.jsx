import React, { memo } from "react";

function ClarificationSheetComponent({
  open,
  mode,
  pendingAction,
  qtyValue,
  onQtyValueChange,
  onSelectChoice,
  onSubmitQty,
  onCancel,
  t,
  tVoice,
}) {
  if (!open || !pendingAction) return null;

  const kind = pendingAction.kind;
  const options = Array.isArray(pendingAction.options) ? pendingAction.options : [];

  const titleByKind = {
    add_ambiguous: tVoice("voice.waiter.whichOneDidYouMean", "Which one did you mean?"),
    unknown_product: tVoice("voice.waiter.unknownProduct", "I couldn't find that item. Pick a close match."),
    remove_ambiguous: tVoice("voice.waiter.whichOneToRemove", "Which one should I remove?"),
    change_ambiguous: tVoice("voice.waiter.whichOneToChange", "Which one should I change?"),
    change_qty_missing: tVoice("voice.waiter.howMany", "How many?"),
    cancel_draft: tVoice("voice.waiter.clearDraftConfirm", "Clear your draft order?"),
  };

  const title = titleByKind[kind] || tVoice("voice.waiter.whichItem", "Which item should I edit?");

  return (
    <div className="fixed inset-0 z-[146] flex items-end justify-center bg-black/35 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">{title}</div>

        {pendingAction.queryName ? (
          <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{pendingAction.queryName}</div>
        ) : null}

        {mode === "AWAITING_CHOICE" && kind === "cancel_draft" ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectChoice("__confirm_clear")}
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              {t("Yes", { defaultValue: "Yes" })}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              {t("No", { defaultValue: "No" })}
            </button>
          </div>
        ) : null}

        {mode === "AWAITING_CHOICE" && kind === "unknown_product" && options.length === 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectChoice("__try_again")}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              {tVoice("voice.waiter.tryAgain", "Try again")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </button>
          </div>
        ) : null}

        {mode === "AWAITING_CHOICE" && options.length > 0 ? (
          <>
            <div className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
              {tVoice("voice.waiter.selectOneOption", "Select one option.")}
            </div>
            <div className="mt-3 space-y-2">
              {options.slice(0, 3).map((option, index) => (
                <button
                  key={option?.key || option?.id || option?.productId || `${option?.name || "item"}-${index}`}
                  type="button"
                  onClick={() => onSelectChoice(option)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                >
                  <span className="inline-flex min-w-5 justify-center rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-neutral-700 dark:text-neutral-100">
                    {index + 1}
                  </span>
                  <span className="ml-2">{option?.name || option?.label || "-"}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </button>
          </>
        ) : null}

        {mode === "AWAITING_QTY" ? (
          <>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((qty) => (
                <button
                  key={qty}
                  type="button"
                  onClick={() => onSubmitQty(qty)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                >
                  {qty}
                </button>
              ))}
            </div>

            <input
              type="number"
              min="1"
              step="1"
              value={qtyValue}
              onChange={(e) => onQtyValueChange(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="1"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSubmitQty(qtyValue)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              >
                {t("Confirm", { defaultValue: "Confirm" })}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

const ClarificationSheet = memo(ClarificationSheetComponent);

export default ClarificationSheet;
