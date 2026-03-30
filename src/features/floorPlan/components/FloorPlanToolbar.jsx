import React from "react";
import { useTranslation } from "react-i18next";

const MAX_TABLE_GAP = 72;

function clampTableGap(value) {
  return Math.max(-MAX_TABLE_GAP, Math.min(MAX_TABLE_GAP, Number(value) || 0));
}

function formatGapLabel(value, t) {
  const rounded = Math.round(Number(value) || 0);
  if (rounded < 0) return t("+{{value}}px space", { value: Math.abs(rounded) });
  if (rounded > 0) return t("-{{value}}px gap", { value: rounded });
  return t("Default spacing");
}

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
  onTableNumberingChange,
  onTableNumberSizeChange,
  onTableSpacingChange,
  onCenterWholeMapChange,
  onUndo,
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
  canUndo = false,
  canvas = null,
  tableNumbering = null,
  tableNumberSize = 1,
  centerWholeMap = false,
}) {
  const { t } = useTranslation();
  const tableGapX = clampTableGap(canvas?.tableGapX || 0);
  const tableGapY = clampTableGap(canvas?.tableGapY || 0);
  const [arrangeRows, setArrangeRows] = React.useState(Math.max(1, Number(canvas?.rows || 4)));
  const [arrangeColumns, setArrangeColumns] = React.useState(Math.max(1, Number(canvas?.columns || 4)));
  const [arrangeMode, setArrangeMode] = React.useState(tableNumbering?.mode || "row-based");
  const [arrangeDirection, setArrangeDirection] = React.useState(tableNumbering?.direction || "ltr");
  const [startNumber, setStartNumber] = React.useState(Math.max(1, Number(tableNumbering?.startNumber || 1)));
  const [alternateColumns, setAlternateColumns] = React.useState(Boolean(tableNumbering?.alternateColumns));
  const [arrangeTableNumberSize, setArrangeTableNumberSize] = React.useState(Number(tableNumberSize) || 1);

  React.useEffect(() => {
    setArrangeRows(Math.max(1, Number(canvas?.rows || 4)));
    setArrangeColumns(Math.max(1, Number(canvas?.columns || 4)));
  }, [canvas?.rows, canvas?.columns]);

  React.useEffect(() => {
    setArrangeMode(tableNumbering?.mode || "row-based");
    setArrangeDirection(tableNumbering?.direction || "ltr");
    setStartNumber(Math.max(1, Number(tableNumbering?.startNumber || 1)));
    setAlternateColumns(Boolean(tableNumbering?.alternateColumns));
  }, [tableNumbering?.alternateColumns, tableNumbering?.direction, tableNumbering?.mode, tableNumbering?.startNumber]);

  React.useEffect(() => {
    setArrangeTableNumberSize(Number(tableNumberSize) || 1);
  }, [tableNumberSize]);

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
              onClick={() =>
                onArrangeTables?.({
                  rows: arrangeRows,
                  columns: arrangeColumns,
                  mode: arrangeMode,
                  direction: arrangeDirection,
                  startNumber,
                  alternateColumns,
                })
              }
              disabled={!tableCount}
              className="rounded-2xl border border-neutral-200 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
            >
              {t("Apply Grid")}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
            <label>
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Numbering Mode")}</div>
              <select
                value={arrangeMode}
                onChange={(event) => {
                  const nextValue = String(event.target.value || "row-based");
                  setArrangeMode(nextValue);
                  onTableNumberingChange?.({ mode: nextValue });
                }}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                <option value="row-based">{t("Row based")}</option>
                <option value="column-based">{t("Column based")}</option>
              </select>
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Direction")}</div>
              <select
                value={arrangeDirection}
                onChange={(event) => {
                  const nextValue = String(event.target.value || "ltr");
                  setArrangeDirection(nextValue);
                  onTableNumberingChange?.({ direction: nextValue });
                }}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                <option value="ltr">{t("Left to right")}</option>
                <option value="rtl">{t("Right to left")}</option>
                <option value="ttb">{t("Top to bottom")}</option>
                <option value="btt">{t("Bottom to top")}</option>
              </select>
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Start Number")}</div>
              <input
                type="number"
                min="1"
                value={startNumber}
                onChange={(event) => {
                  const nextValue = Math.max(1, Number(event.target.value) || 1);
                  setStartNumber(nextValue);
                  onTableNumberingChange?.({ startNumber: nextValue });
                }}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <label>
              <div className="mb-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">{t("Table Number Size")}</div>
              <input
                type="range"
                min="0.6"
                max="1.8"
                step="0.05"
                value={arrangeTableNumberSize}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 1;
                  setArrangeTableNumberSize(nextValue);
                  onTableNumberSizeChange?.(nextValue);
                }}
                className="w-full"
              />
              <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {Math.round((Number(arrangeTableNumberSize) || 1) * 100)}%
              </div>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
              <input
                type="checkbox"
                checked={alternateColumns}
                onChange={(event) => {
                  const nextValue = Boolean(event.target.checked);
                  setAlternateColumns(nextValue);
                  onTableNumberingChange?.({ alternateColumns: nextValue });
                }}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span>{t("Alternate Columns")}</span>
            </label>
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
            min={-MAX_TABLE_GAP}
            max={MAX_TABLE_GAP}
            step="1"
            value={tableGapX}
            onChange={(event) => onTableSpacingChange?.({ tableGapX: clampTableGap(event.target.value) })}
            className="w-full"
          />
          <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {formatGapLabel(tableGapX, t)}
          </div>
        </label>
        <label className="block">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
            {t("Vertical Gap")}
          </div>
          <input
            type="range"
            min={-MAX_TABLE_GAP}
            max={MAX_TABLE_GAP}
            step="1"
            value={tableGapY}
            onChange={(event) => onTableSpacingChange?.({ tableGapY: clampTableGap(event.target.value) })}
            className="w-full"
          />
          <div className="mt-1 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {formatGapLabel(tableGapY, t)}
          </div>
        </label>
        <label className="flex items-center gap-2 rounded-[20px] border border-neutral-200 bg-white/80 px-3 py-3 text-sm font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-neutral-100 md:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(centerWholeMap)}
            onChange={(event) => onCenterWholeMapChange?.(Boolean(event.target.checked))}
            className="h-4 w-4 rounded border-neutral-300"
          />
          <span>{t("Center whole floor map")}</span>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {t("Undo")}
        </button>
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
