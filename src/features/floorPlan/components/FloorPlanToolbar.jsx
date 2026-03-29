import React from "react";
import { useTranslation } from "react-i18next";

const TOOLBAR_ITEMS = [
  { kind: "table", label: "Add Table" },
  { kind: "stage", label: "Stage" },
  { kind: "bar", label: "Bar" },
  { kind: "dance_floor", label: "Dance Floor" },
  { kind: "dj_booth", label: "DJ Booth" },
  { kind: "entrance", label: "Entrance" },
  { kind: "exit", label: "Exit" },
  { kind: "wc", label: "WC" },
  { kind: "label", label: "Label" },
  { kind: "wall", label: "Wall" },
];

export default function FloorPlanToolbar({
  onAddElement,
  onArrangeTables,
  onTableSpacingChange,
  onSelectAllTables,
  onClearSelection,
  onResizeSelectedSmaller,
  onResizeSelectedLarger,
  onDuplicate,
  onDelete,
  onReset,
  onPreviewToggle,
  previewMode = false,
  selectedElement = null,
  selectedCount = 0,
  selectedTableCount = 0,
  tableCount = 0,
  allTablesSelected = false,
  canvas = null,
}) {
  const { t } = useTranslation();
  const tableGapX = Math.max(0, Math.min(48, Number(canvas?.tableGapX || 0)));
  const tableGapY = Math.max(0, Math.min(48, Number(canvas?.tableGapY || 0)));
  const [arrangeRows, setArrangeRows] = React.useState(Math.max(1, Number(canvas?.rows || 4)));
  const [arrangeColumns, setArrangeColumns] = React.useState(Math.max(1, Number(canvas?.columns || 4)));

  React.useEffect(() => {
    setArrangeRows(Math.max(1, Number(canvas?.rows || 4)));
    setArrangeColumns(Math.max(1, Number(canvas?.columns || 4)));
  }, [canvas?.rows, canvas?.columns]);

  return (
    <div className="space-y-3 rounded-[28px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">{t("Designer Tools")}</div>
        <div className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {selectedTableCount > 0
            ? t("{{selected}}/{{total}} tables selected", {
                selected: selectedTableCount,
                total: tableCount || selectedTableCount,
              })
            : t("{{count}} selected", { count: selectedCount })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => onAddElement?.(item.kind)}
            className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            {t(item.label)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-[24px] border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-900/60 md:grid-cols-2">
        <div className="rounded-[20px] border border-neutral-200 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70 md:col-span-2">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {t("Arrange Tables")}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[88px] flex-1">
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Rows")}</div>
              <input
                type="number"
                min="1"
                value={arrangeRows}
                onChange={(event) => setArrangeRows(Math.max(1, Number(event.target.value) || 1))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <div className="pb-2 text-sm font-semibold text-neutral-400">x</div>
            <label className="min-w-[88px] flex-1">
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Columns")}</div>
              <input
                type="number"
                min="1"
                value={arrangeColumns}
                onChange={(event) => setArrangeColumns(Math.max(1, Number(event.target.value) || 1))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <button
              type="button"
              onClick={() => onArrangeTables?.({ rows: arrangeRows, columns: arrangeColumns })}
              disabled={!tableCount}
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {t("Apply Grid")}
            </button>
          </div>
          <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {t("Example: `5 x 8` arranges tables into 5 rows and 8 columns.")}
          </div>
        </div>
        <label className="block">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {t("Horizontal Gap")}
          </div>
          <input
            type="range"
            min="0"
            max="48"
            step="1"
            value={tableGapX}
            onChange={(event) => onTableSpacingChange?.({ tableGapX: Number(event.target.value) || 0 })}
            className="w-full"
          />
          <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {t("-{{value}}px gap", { value: Math.round(tableGapX) })}
          </div>
        </label>
        <label className="block">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {t("Vertical Gap")}
          </div>
          <input
            type="range"
            min="0"
            max="48"
            step="1"
            value={tableGapY}
            onChange={(event) => onTableSpacingChange?.({ tableGapY: Number(event.target.value) || 0 })}
            className="w-full"
          />
          <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {t("-{{value}}px gap", { value: Math.round(tableGapY) })}
          </div>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelectAllTables}
          disabled={!tableCount || allTablesSelected}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Select All Tables")}
        </button>
        <button
          type="button"
          onClick={onClearSelection}
          disabled={!selectedCount}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Clear Selection")}
        </button>
        <button
          type="button"
          onClick={onResizeSelectedSmaller}
          disabled={!selectedTableCount}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Smaller Tables")}
        </button>
        <button
          type="button"
          onClick={onResizeSelectedLarger}
          disabled={!selectedTableCount}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Larger Tables")}
        </button>
        <button
          type="button"
          onClick={onPreviewToggle}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {previewMode ? t("Back to Edit") : t("Mobile Preview")}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={!selectedElement}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Duplicate")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!selectedCount}
          className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40 dark:border-rose-900/30 dark:bg-rose-950/30 dark:text-rose-200"
        >
          {t("Delete")}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Reset to Generated")}
        </button>
      </div>
    </div>
  );
}
