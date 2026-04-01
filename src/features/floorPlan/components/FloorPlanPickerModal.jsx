import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import FloorPlanView from "./FloorPlanView";
import TableDetailsSheet from "./TableDetailsSheet";
import {
  buildFloorPlanElements,
  buildFloorPlanZoneGroups,
  FLOOR_PLAN_STATUS_STYLES,
  formatFloorPlanZoneLabel,
  getFloorPlanLinkedTableNumber,
} from "../utils/floorPlan";

function normalizePickerGuestSelection(selectedGuests, options = []) {
  const parsed = Number(selectedGuests || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return options.length > 0 ? options[0] : 0;
  }
  if (options.includes(parsed)) return parsed;
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (options[index] <= parsed) return options[index];
  }
  return options.length > 0 ? options[0] : 0;
}

const STATUS_FILTER_KEYS = ["available", "reserved", "occupied", "blocked"];
const ALL_ZONES_KEY = "__all__";
const PICKER_STATUS_TONES = {
  available: {
    fill: "#eff6ff",
    border: "#3b82f6",
    text: "#1d4ed8",
    dot: "#60a5fa",
  },
};
const PICKER_TABLE_STATUS_STYLES = {
  available: {
    fill: "#dbeafe",
    border: "#60a5fa",
    text: "#1e3a8a",
  },
  selected: {
    fill: "#2563eb",
    border: "#1d4ed8",
    text: "#eff6ff",
  },
};

function FilterPill({
  active,
  compact = false,
  dotColor,
  label,
  value = "",
  onClick,
  tone = {},
  className = "",
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border font-semibold transition",
        compact ? "min-h-[34px] px-3 py-1.5 text-[11px] sm:min-h-[36px]" : "min-h-[38px] px-3 py-2 text-[11px] sm:min-h-[40px] sm:px-4 sm:text-xs",
        className,
      ].join(" ")}
      style={
        active
          ? {
              backgroundColor: tone.fill,
              borderColor: tone.border,
              color: tone.text,
            }
          : {
              backgroundColor: "transparent",
              borderColor: tone.border,
              color: tone.border,
            }
      }
    >
      <span className={compact ? "h-2 w-2 rounded-full" : "h-2.5 w-2.5 rounded-full"} style={{ backgroundColor: dotColor }} />
      <span>{label}</span>
      {value ? <span className="opacity-75">{value}</span> : null}
    </button>
  );
}

function translateFloorPlanReason(reason, t) {
  const normalizedReason = String(reason || "").trim();
  if (!normalizedReason) return "";

  const capacityMatch = normalizedReason.match(/^Capacity\s+(\d+)$/i);
  if (capacityMatch) {
    return t("Capacity {{count}}", { count: Number(capacityMatch[1]) || 0 });
  }

  return t(normalizedReason);
}

function normalizeZoneFilterKey(zoneName) {
  return String(formatFloorPlanZoneLabel(zoneName) || "Main Hall").trim().toLowerCase();
}

export default function FloorPlanPickerModal({
  open = false,
  title,
  subtitle = "",
  layout,
  tables = [],
  tableStates = [],
  selectedTableNumber = null,
  accentColor = "#111827",
  guestCompositionProps = null,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation();
  const resolvedTitle = title || t("Select Table");
  const elements = React.useMemo(
    () => buildFloorPlanElements(layout, tables, tableStates),
    [layout, tableStates, tables]
  );
  const [activeTable, setActiveTable] = React.useState(null);
  const [selectedStatuses, setSelectedStatuses] = React.useState(STATUS_FILTER_KEYS);
  const [selectedZone, setSelectedZone] = React.useState(ALL_ZONES_KEY);
  const hasLiveTables = Array.isArray(tables) && tables.length > 0;

  const tableElements = React.useMemo(
    () =>
      elements.filter(
        (element) => element.kind === "table" && (!hasLiveTables || element.table)
      ),
    [elements, hasLiveTables]
  );
  const statusFilteredTables = React.useMemo(
    () => tableElements.filter((element) => selectedStatuses.includes(String(element.status || "available").toLowerCase())),
    [selectedStatuses, tableElements]
  );
  const zoneGroups = React.useMemo(
    () => buildFloorPlanZoneGroups({ elements: tableElements, tables }),
    [tableElements, tables]
  );
  const zoneOptions = React.useMemo(() => {
    const counts = new Map();
    statusFilteredTables.forEach((element) => {
      const key = normalizeZoneFilterKey(element.zone);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const allZones = zoneGroups.flatMap((group) => group.zones || []);
    return allZones.map((zone) => ({
      key: zone.key,
      label: zone.label,
      count: counts.get(zone.key) || 0,
      swatch: zone.swatch,
    }));
  }, [statusFilteredTables, zoneGroups]);
  const zoneMatchedTables = React.useMemo(
    () =>
      statusFilteredTables.filter((element) =>
        selectedZone === ALL_ZONES_KEY ? true : normalizeZoneFilterKey(element.zone) === selectedZone
      ),
    [selectedZone, statusFilteredTables]
  );
  const visibleTables = React.useMemo(() => statusFilteredTables, [statusFilteredTables]);
  const deemphasizedElementIds = React.useMemo(
    () =>
      selectedZone === ALL_ZONES_KEY
        ? []
        : visibleTables
            .filter((element) => normalizeZoneFilterKey(element.zone) !== selectedZone)
            .map((element) => String(element.id)),
    [selectedZone, visibleTables]
  );
  const filteredElements = React.useMemo(
    () =>
      elements.filter((element) => {
        if (element.kind !== "table") return true;
        return visibleTables.some((table) => String(table.id) === String(element.id));
      }),
    [elements, visibleTables]
  );

  React.useEffect(() => {
    if (!open) {
      setActiveTable(null);
      setSelectedStatuses(STATUS_FILTER_KEYS);
      setSelectedZone(ALL_ZONES_KEY);
    }
  }, [open]);

  React.useEffect(() => {
    if (!activeTable) return;
    const stillVisible = visibleTables.some(
      (table) => String(table.id) === String(activeTable.id)
    );
    if (!stillVisible) {
      setActiveTable(null);
    }
  }, [activeTable, visibleTables]);

  React.useEffect(() => {
    if (!activeTable) return;
    const nextActiveTable = tableElements.find(
      (table) => String(table.id) === String(activeTable.id)
    );
    if (nextActiveTable && nextActiveTable !== activeTable) {
      setActiveTable(nextActiveTable);
    }
  }, [activeTable, tableElements]);

  if (!open) return null;

  const activeStatus = String(activeTable?.status || "").toLowerCase();
  const canConfirm = activeStatus === "available" || activeStatus === "selected";
  const highlightedTableNumber =
    activeTable?.linked_table_number != null
      ? activeTable.linked_table_number
      : activeTable?.table_number != null
        ? activeTable.table_number
        : selectedTableNumber;
  const activeTableCapacity = Number(
    activeTable?.table?.seats ||
      activeTable?.table?.guests ||
      activeTable?.capacity ||
      activeTable?.state?.capacity ||
      0
  );
  const baseGuestOptions = Array.isArray(guestCompositionProps?.guestOptions)
    ? guestCompositionProps.guestOptions
    : [];
  const filteredGuestOptions =
    Number.isFinite(activeTableCapacity) && activeTableCapacity > 0 && baseGuestOptions.length > 0
      ? baseGuestOptions.filter((option) => Number(option) <= activeTableCapacity)
      : baseGuestOptions;
  const effectiveGuestCompositionProps = guestCompositionProps
    ? {
        ...guestCompositionProps,
        guestOptions: filteredGuestOptions,
        selectedGuests: normalizePickerGuestSelection(
          guestCompositionProps.selectedGuests,
          filteredGuestOptions
        ),
      }
    : null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm">
      <div className="flex h-[100dvh] min-h-0 flex-col bg-[linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] shadow-[0_32px_120px_rgba(15,23,42,0.28)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)] dark:shadow-[0_36px_140px_rgba(0,0,0,0.55)]">
        <div className="sticky top-0 z-10 border-b border-black/5 bg-white/95 px-3 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:px-4 dark:border-white/10 dark:bg-neutral-950/95 dark:shadow-[0_12px_34px_rgba(0,0,0,0.28)]">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm sm:h-11 sm:w-11 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-neutral-950 dark:text-white">{resolvedTitle}</div>
              {subtitle ? (
                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-h-0 flex-1 overflow-y-auto pb-8 sm:pb-10">
            <div className="sticky top-0 z-10 -mx-1 mb-4 space-y-3 border-b border-black/5 bg-[#fafaf9]/95 px-1 pb-3 backdrop-blur dark:border-white/10 dark:bg-[#09090b]/95">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUS_FILTER_KEYS.map((key) => {
                  const statusTone = FLOOR_PLAN_STATUS_STYLES[key] || FLOOR_PLAN_STATUS_STYLES.available;
                  const pickerTone = PICKER_STATUS_TONES[key];
                  const active = selectedStatuses.includes(key);
                  return (
                    <FilterPill
                      key={key}
                      compact
                      active={active}
                      dotColor={pickerTone?.dot || statusTone.border}
                      label={t(statusTone.badge)}
                      className="w-full justify-center"
                      tone={{
                        fill: pickerTone?.fill || `${statusTone.fill}22`,
                        border: pickerTone?.border || statusTone.border,
                        text: pickerTone?.text || statusTone.border,
                      }}
                      onClick={() => {
                        setSelectedStatuses((prev) => {
                          if (prev.includes(key)) {
                            return prev.length === 1 ? prev : prev.filter((value) => value !== key);
                          }
                          return [...prev, key];
                        });
                      }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-[260px]">
                  <select
                    value={selectedZone}
                    onChange={(event) => setSelectedZone(event.target.value)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
                  >
                    <option value={ALL_ZONES_KEY}>
                      {t("Select Areas ({{count}})", { count: statusFilteredTables.length })}
                    </option>
                    {zoneOptions.map((zone) => (
                      <option key={zone.key} value={zone.key}>
                        {`${t(formatFloorPlanZoneLabel(zone.label))} (${zone.count})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {zoneMatchedTables.length === 0 ? (
              <div className="mb-4 rounded-[24px] border border-dashed border-neutral-300 bg-white/80 px-4 py-5 text-center text-sm font-medium text-neutral-500 sm:px-5 sm:py-6 dark:border-neutral-700 dark:bg-neutral-950/60 dark:text-neutral-400">
                {selectedZone === ALL_ZONES_KEY
                  ? t("No tables match the selected availability filters")
                  : t("No available tables in this section")}
              </div>
            ) : null}
            <div className="mt-3 sm:mt-4">
              <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[26px] border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                <FloorPlanView
                  layout={layout}
                  elements={filteredElements}
                  boundsElements={elements}
                  selectedTableNumber={highlightedTableNumber}
                  deemphasizedElementIds={deemphasizedElementIds}
                  onTableClick={(node) =>
                    setActiveTable({
                      ...node,
                      linked_table_number: getFloorPlanLinkedTableNumber(node) ?? node.table_number ?? null,
                    })
                  }
                  showCanvasOutline={false}
                  compactPadding
                  viewportPadding={18}
                  scrollMode="none"
                  statusStyleOverrides={PICKER_TABLE_STATUS_STYLES}
                />
              </div>
            </div>
          </div>
          <TableDetailsSheet
            embedded
            tableNode={activeTable}
            onClose={() => setActiveTable(null)}
            onConfirm={(node) => {
              onConfirm?.(node);
              setActiveTable(null);
            }}
            confirmDisabled={!canConfirm}
            guestCompositionProps={effectiveGuestCompositionProps}
            accentColor={accentColor}
            confirmLabel={
              canConfirm
                ? t("Confirm table")
                : translateFloorPlanReason(activeTable?.state?.reason, t) || t("Unavailable")
            }
          />
        </div>
      </div>
    </div>
  );
}
