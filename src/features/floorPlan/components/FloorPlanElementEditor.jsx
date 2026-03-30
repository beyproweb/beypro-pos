import React from "react";
import { useTranslation } from "react-i18next";
import {
  FLOOR_PLAN_TABLE_TYPES,
  formatFloorPlanZoneLabel,
} from "../utils/floorPlan";

const TABLE_SHAPE_OPTIONS = [
  { value: "circle", label: "Circle" },
  { value: "square", label: "Square" },
  { value: "rectangle", label: "Rectangle" },
  { value: "oval", label: "Oval" },
];

function Input({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      {children}
    </label>
  );
}

export default function FloorPlanElementEditor({
  element,
  tables = [],
  zoneGroups = [],
  onChange,
  onUpdateAllTables = null,
  selectionCount = 0,
  selectedTableCount = 0,
}) {
  const { t } = useTranslation();
  const [nudgeStep, setNudgeStep] = React.useState(8);
  const linkedTableNumber = element?.linked_table_number ?? element?.table_number ?? "";
  const zoneOptions = (() => {
    const values = zoneGroups.flatMap((group) => group.zones || []);
    const currentLabel = String(element?.zone || "").trim();
    if (currentLabel && !values.some((zone) => zone.label === currentLabel)) {
      return [{ key: currentLabel.toLowerCase(), label: currentLabel }, ...values];
    }
    return values;
  })();

  if (!element && selectionCount > 1) {
    return (
      <div className="rounded-[28px] border border-neutral-200 bg-white/90 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-neutral-400">
        <div className="font-semibold text-neutral-900 dark:text-neutral-50">Bulk Selection</div>
        <div className="mt-1">
          {selectedTableCount > 0
            ? t("{{count}} tables are selected. Use the toolbar to resize them together.", { count: selectedTableCount })
            : t("{{count}} elements are selected. Pick one element to edit detailed settings.", { count: selectionCount })}
        </div>
      </div>
    );
  }

  if (!element) {
    return (
      <div className="rounded-[28px] border border-neutral-200 bg-white/90 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-neutral-400">
        {t("Select an element to edit its properties.")}
      </div>
    );
  }

  const update = (key, value) => onChange?.(element.id, { [key]: value });
  const updatePatch = (patch) => onChange?.(element.id, patch);
  const moveByPixels = (deltaX, deltaY) =>
    onChange?.(element.id, {
      offset_x: Number(element.offset_x || 0) + deltaX,
      offset_y: Number(element.offset_y || 0) + deltaY,
    });

  return (
    <div className="space-y-4 rounded-[28px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div>
        <div className="text-sm font-semibold text-neutral-950 dark:text-white">Element Settings</div>
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{t(element.kind)}</div>
      </div>

      <Input label={t("Name")}>
        <input
          type="text"
          value={element.name || ""}
          onChange={(event) => update("name", event.target.value)}
          className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </Input>

      {element.kind === "table" ? (
        <>
          <Input label={t("Linked Table")}>
            <select
              value={linkedTableNumber || ""}
              onChange={(event) => {
                const nextTableNumber = Number(event.target.value) || null;
                const linkedTable = tables.find((table) => {
                  const tableNumber = Number(
                    table?.number ?? table?.tableNumber ?? table?.table_number
                  );
                  return tableNumber === nextTableNumber;
                });

                updatePatch({
                  table_number: nextTableNumber,
                  linked_table_number: nextTableNumber,
                  name:
                    linkedTable?.label ||
                    (nextTableNumber ? `${t("Table")} ${String(nextTableNumber).padStart(2, "0")}` : ""),
                  zone: String(linkedTable?.area || linkedTable?.zone || "").trim(),
                });
              }}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            >
              <option value="">{t("Unlinked")}</option>
              {tables.map((table) => {
                const tableNumber = Number(table?.number ?? table?.tableNumber ?? table?.table_number);
                return (
                  <option key={tableNumber} value={tableNumber}>
                      {table?.label || `${t("Table")} ${String(tableNumber).padStart(2, "0")}`}
                    </option>
                  );
                })}
              </select>
          </Input>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("Shape")}>
              <select
                value={element.shape || "circle"}
                onChange={(event) => update("shape", event.target.value)}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {TABLE_SHAPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </Input>
            <Input label={t("Table Type")}>
              <select
                value={element.table_type || "regular"}
                onChange={(event) => update("table_type", event.target.value)}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {FLOOR_PLAN_TABLE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </Input>
            <Input label={t("Capacity")}>
              <input
                type="number"
                min="0"
                value={element.capacity || ""}
                onChange={(event) => update("capacity", Number(event.target.value) || 0)}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </Input>
            <Input label={t("Zone")}>
              <select
                value={element.zone || ""}
                onChange={(event) => update("zone", event.target.value)}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                <option value="">{t("Main Hall")}</option>
                {zoneOptions.map((zone) => (
                  <option key={zone.key || zone.label} value={zone.label}>
                    {t(formatFloorPlanZoneLabel(zone.label))}
                  </option>
                ))}
              </select>
            </Input>
          </div>
          <Input label={t("All Tables Shape")}>
            <select
              value=""
              onChange={(event) => {
                const nextShape = String(event.target.value || "").trim();
                if (!nextShape) return;
                onUpdateAllTables?.({ shape: nextShape });
                event.target.value = "";
              }}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            >
              <option value="">{t("Apply one shape to every table")}</option>
              {TABLE_SHAPE_OPTIONS.map((option) => (
                <option key={`all-${option.value}`} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </Input>
        </>
      ) : (
        <>
          <Input label={t("Text")}>
            <input
              type="text"
              value={element.text || ""}
              onChange={(event) => update("text", event.target.value)}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </Input>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("Fill Color")}>
              <input
                type="color"
                value={element.color || "#ffffff"}
                onChange={(event) => update("color", event.target.value)}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </Input>
            <Input label={t("Font Color")}>
              <input
                type="color"
                value={element.text_color || "#52525b"}
                onChange={(event) => update("text_color", event.target.value)}
                className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </Input>
          </div>
          <Input label={t("Font Size")}>
            <div className="space-y-2">
              <input
                type="range"
                min="10"
                max="48"
                step="1"
                value={Math.min(48, Math.max(10, Number(element.text_size || (element.kind === "label" ? 16 : 14))))}
                onChange={(event) =>
                  update(
                    "text_size",
                    Number(event.target.value) || (element.kind === "label" ? 16 : 14)
                  )
                }
                className="w-full"
              />
              <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                {Math.min(48, Math.max(10, Number(element.text_size || (element.kind === "label" ? 16 : 14))))}px
              </div>
            </div>
          </Input>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input label={t("Column")}>
          <input
            type="number"
            min="0"
            value={element.col || 0}
            onChange={(event) => update("col", Math.max(0, Number(event.target.value) || 0))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        <Input label={t("Row")}>
          <input
            type="number"
            min="0"
            value={element.row || 0}
            onChange={(event) => update("row", Math.max(0, Number(event.target.value) || 0))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        <Input label={t("Columns")}>
          <input
            type="number"
            min="1"
            value={element.col_span || 1}
            onChange={(event) => update("col_span", Math.max(1, Number(event.target.value) || 1))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        <Input label={t("Rows")}>
          <input
            type="number"
            min="1"
            value={element.row_span || 1}
            onChange={(event) => update("row_span", Math.max(1, Number(event.target.value) || 1))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        <Input label={t("Width (px)")}>
          <input
            type="number"
            min="24"
            value={element.width || 0}
            onChange={(event) => update("width", Math.max(24, Number(event.target.value) || 24))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        <Input label={t("Height (px)")}>
          <input
            type="number"
            min="24"
            value={element.height || 0}
            onChange={(event) => update("height", Math.max(24, Number(event.target.value) || 24))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
          />
        </Input>
        {element.kind === "table" ? (
          <Input label={t("Table Scale")}>
            <div className="space-y-2">
              <input
                type="range"
                min="0.15"
                max="1.35"
                step="0.05"
                value={Math.max(0.15, Math.min(1.35, Number(element.visual_scale || 1)))}
                onChange={(event) => update("visual_scale", Number(event.target.value) || 1)}
                className="w-full"
              />
              <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100">
                {Math.round(Math.max(0.15, Math.min(1.35, Number(element.visual_scale || 1))) * 100)}%
              </div>
            </div>
          </Input>
        ) : null}
        <Input label={t("Rotation")}>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => update("rotation", Number(element.rotation || 0) - 15)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg font-bold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                -
              </button>
              <input
                type="number"
                value={element.rotation || 0}
                onChange={(event) => update("rotation", Number(event.target.value) || 0)}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
              <button
                type="button"
                onClick={() => update("rotation", Number(element.rotation || 0) + 15)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg font-bold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                +
              </button>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="15"
              value={Math.max(-180, Math.min(180, Number(element.rotation || 0)))}
              onChange={(event) => update("rotation", Number(event.target.value) || 0)}
              className="w-full"
            />
          </div>
        </Input>
        {element.kind === "table" ? (
          <Input label={t("Color")}>
            <input
              type="color"
              value={element.color || "#ffffff"}
              onChange={(event) => update("color", event.target.value)}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-950"
            />
          </Input>
        ) : null}
        <Input label={t("Move")}>
          <div className="space-y-2">
            <input
              type="number"
              min="1"
              value={nudgeStep}
              onChange={(event) => setNudgeStep(Math.max(1, Number(event.target.value) || 1))}
              className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
            <div className="grid grid-cols-3 gap-2">
              <div />
              <button
                type="button"
                onClick={() => moveByPixels(0, -nudgeStep)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {t("Up")}
              </button>
              <div />
              <button
                type="button"
                onClick={() => moveByPixels(-nudgeStep, 0)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {t("Left")}
              </button>
              <button
                type="button"
                onClick={() => moveByPixels(0, nudgeStep)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {t("Down")}
              </button>
              <button
                type="button"
                onClick={() => moveByPixels(nudgeStep, 0)}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              >
                {t("Right")}
              </button>
            </div>
          </div>
        </Input>
      </div>
    </div>
  );
}
