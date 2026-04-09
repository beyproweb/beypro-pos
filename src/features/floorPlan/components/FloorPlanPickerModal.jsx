import React from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, X } from "lucide-react";
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

const DEFAULT_STATUS_FILTER_KEYS = ["available", "pending_hold", "reserved", "occupied", "blocked"];
const ALL_ZONES_KEY = "__all__";
const PICKER_STATUS_TONES = {
  available: {
    fill: "#eff6ff",
    border: "#3b82f6",
    text: "#1d4ed8",
    dot: "#60a5fa",
  },
  pending_hold: {
    fill: "#fff7ed",
    border: "#ea580c",
    text: "#9a3412",
    dot: "#fb923c",
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
  statusFilterKeys = DEFAULT_STATUS_FILTER_KEYS,
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
  const resolvedStatusFilterKeys = React.useMemo(
    () =>
      Array.isArray(statusFilterKeys) && statusFilterKeys.length > 0
        ? statusFilterKeys
        : DEFAULT_STATUS_FILTER_KEYS,
    [statusFilterKeys]
  );
  const [selectedStatuses, setSelectedStatuses] = React.useState(resolvedStatusFilterKeys);
  const [selectedZone, setSelectedZone] = React.useState(ALL_ZONES_KEY);
  const [statusMenuOpen, setStatusMenuOpen] = React.useState(false);
  const [zoneMenuOpen, setZoneMenuOpen] = React.useState(false);
  const statusMenuRef = React.useRef(null);
  const zoneMenuRef = React.useRef(null);
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
      setSelectedStatuses(resolvedStatusFilterKeys);
      setSelectedZone(ALL_ZONES_KEY);
      setStatusMenuOpen(false);
      setZoneMenuOpen(false);
    }
  }, [open, resolvedStatusFilterKeys]);

  React.useEffect(() => {
    setSelectedStatuses((prev) => {
      const next = prev.filter((value) => resolvedStatusFilterKeys.includes(value));
      if (next.length > 0) return next;
      return resolvedStatusFilterKeys;
    });
  }, [resolvedStatusFilterKeys]);

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

  React.useEffect(() => {
    if (!statusMenuOpen && !zoneMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!statusMenuRef.current?.contains(event.target)) {
        setStatusMenuOpen(false);
      }
      if (!zoneMenuRef.current?.contains(event.target)) {
        setZoneMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [statusMenuOpen, zoneMenuOpen]);

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
  const selectedStatusSummary = t("Availability ({{count}})", { count: selectedStatuses.length });
  const selectedZoneLabel =
    selectedZone === ALL_ZONES_KEY
      ? t("Areas ({{count}})", { count: statusFilteredTables.length })
      : (() => {
          const zone = zoneOptions.find((option) => option.key === selectedZone);
          if (!zone) return t("Areas");
          return `${t(formatFloorPlanZoneLabel(zone.label))} (${zone.count})`;
        })();

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
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-[15px] font-semibold text-neutral-950 dark:text-white">
                  {resolvedTitle}
                </div>
                {subtitle ? (
                  <div className="min-w-0 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
          <div className="min-h-0 flex-1 overflow-y-auto pb-8 sm:pb-10">
            <div className="sticky top-0 z-10 -mx-1 mb-2 border-b border-black/5 bg-[#fafaf9]/95 px-1 pb-1.5 backdrop-blur dark:border-white/10 dark:bg-[#09090b]/95">
              <div className="flex items-center justify-center gap-2">
                <div ref={statusMenuRef} className="relative min-w-0 w-[42.5%]">
                  <button
                    type="button"
                    onClick={() => {
                      setZoneMenuOpen(false);
                      setStatusMenuOpen((prev) => !prev);
                    }}
                    className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-[18px] border border-neutral-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
                  >
                    <span className="truncate">{selectedStatusSummary}</span>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 text-neutral-500 transition-transform dark:text-neutral-400",
                        statusMenuOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </button>
                  {statusMenuOpen ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-[18px] border border-neutral-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.16)] dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="space-y-1">
                        {resolvedStatusFilterKeys.map((key) => {
                          const statusTone = FLOOR_PLAN_STATUS_STYLES[key] || FLOOR_PLAN_STATUS_STYLES.available;
                          const pickerTone = PICKER_STATUS_TONES[key];
                          const active = selectedStatuses.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setSelectedStatuses((prev) => {
                                  if (prev.includes(key)) {
                                    return prev.length === 1 ? prev : prev.filter((value) => value !== key);
                                  }
                                  return [...prev, key];
                                });
                              }}
                              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-[13px] font-medium transition"
                              style={
                                active
                                  ? {
                                      backgroundColor: pickerTone?.fill || `${statusTone.fill}22`,
                                      color: pickerTone?.text || statusTone.border,
                                    }
                                  : undefined
                              }
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: pickerTone?.dot || statusTone.border }}
                              />
                              <span className="min-w-0 flex-1 truncate">{t(statusTone.badge)}</span>
                              {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div ref={zoneMenuRef} className="relative min-w-0 w-[42.5%]">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusMenuOpen(false);
                      setZoneMenuOpen((prev) => !prev);
                    }}
                    className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-[18px] border border-neutral-200 bg-white px-2.5 py-2 text-[12px] font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
                  >
                    <span className="truncate">{selectedZoneLabel}</span>
                    <ChevronDown
                      className={[
                        "h-4 w-4 shrink-0 text-neutral-500 transition-transform dark:text-neutral-400",
                        zoneMenuOpen ? "rotate-180" : "",
                      ].join(" ")}
                    />
                  </button>
                  {zoneMenuOpen ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-[18px] border border-neutral-200 bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.16)] dark:border-neutral-800 dark:bg-neutral-950">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedZone(ALL_ZONES_KEY);
                            setZoneMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-[13px] font-medium transition"
                          style={
                            selectedZone === ALL_ZONES_KEY
                              ? {
                                  backgroundColor: "#eff6ff",
                                  color: "#1d4ed8",
                                }
                              : undefined
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {t("Areas ({{count}})", { count: statusFilteredTables.length })}
                          </span>
                          {selectedZone === ALL_ZONES_KEY ? <Check className="h-4 w-4 shrink-0" /> : null}
                        </button>
                        {zoneOptions.map((zone) => {
                          const active = selectedZone === zone.key;
                          return (
                            <button
                              key={zone.key}
                              type="button"
                              onClick={() => {
                                setSelectedZone(zone.key);
                                setZoneMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-[13px] font-medium transition"
                              style={
                                active
                                  ? {
                                      backgroundColor: "#eff6ff",
                                      color: "#1d4ed8",
                                    }
                                  : undefined
                              }
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {`${t(formatFloorPlanZoneLabel(zone.label))} (${zone.count})`}
                              </span>
                              {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
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
            <div className="mt-1.5 sm:mt-2">
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
