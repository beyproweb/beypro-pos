import React from "react";

const OcrTextEditor = ({
  t,
  originalText,
  editedText,
  onChangeEdited,
  onReset,
  onCopy,
  isLoading,
  parseErrors = [],
  discountNote = "",
  koliNote = "",
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("OCR Text")}</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {t("Editable. Edits do not re-run OCR automatically.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {t("Copy OCR Text")}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/60 dark:bg-amber-900/30 dark:text-amber-200"
          >
            {t("Reset OCR Text")}
          </button>
        </div>
      </div>

      {discountNote ? (
        <div className="mt-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/30 dark:text-emerald-200">
          {discountNote}
        </div>
      ) : null}
      {koliNote ? (
        <div className="mt-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-700/50 dark:bg-blue-900/30 dark:text-blue-200">
          {koliNote}
        </div>
      ) : null}

      {parseErrors?.length ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/30 dark:text-amber-200">
          <div className="font-semibold">{t("Parse warnings")}</div>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {parseErrors.map((err, idx) => (
              <li key={`${err}-${idx}`}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3">
        <textarea
          value={editedText}
          onChange={(e) => onChangeEdited(e.target.value)}
          disabled={isLoading}
          className="h-64 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800 shadow-inner focus:border-indigo-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          spellCheck={false}
        />
      </div>

      <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        {t("Tip: Keep edits for saving/training; re-parse can be run manually if needed.")}
      </div>
    </div>
  );
};

export default OcrTextEditor;
