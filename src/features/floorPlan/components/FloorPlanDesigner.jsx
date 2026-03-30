import React from "react";
import { useTranslation } from "react-i18next";
import FloorPlanToolbar from "./FloorPlanToolbar";
import FloorPlanCanvas from "./FloorPlanCanvas";
import FloorPlanElementEditor from "./FloorPlanElementEditor";
import FloorPlanLegendHeader from "./FloorPlanLegendHeader";
import FloorPlanPreview from "./FloorPlanPreview";
import {
  buildGeneratedFloorPlan,
  buildFloorPlanZoneGroups,
  createFloorPlanId,
  getFloorPlanTableNumberSize,
  getFloorPlanLinkedTableNumber,
  normalizeFloorPlanLayout,
  renumberFloorPlanTables,
  resolveFloorPlanCanvas,
  syncFloorPlanLayoutWithTables,
} from "../utils/floorPlan";

const HISTORY_LIMIT = 50;

function rectanglesOverlap(a, b) {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  );
}

function findNextGridSlot(existingElements = [], { columns = 12, colSpan = 1, rowSpan = 1 } = {}) {
  for (let row = 0; row < 64; row += 1) {
    for (let col = 0; col <= Math.max(0, columns - colSpan); col += 1) {
      const candidate = { col, row, colSpan, rowSpan };
      const blocked = existingElements.some((element) =>
        rectanglesOverlap(candidate, {
          col: Number(element.col || 0),
          row: Number(element.row || 0),
          colSpan: Number(element.col_span || element.colSpan || 1),
          rowSpan: Number(element.row_span || element.rowSpan || 1),
        })
      );
      if (!blocked) return { col, row };
    }
  }
  return { col: 0, row: existingElements.length };
}

function getLastOccupiedRow(existingElements = []) {
  if (!existingElements.length) return 0;
  return existingElements.reduce((maxRow, element) => {
    const row = Number(element.row || 0);
    const rowSpan = Math.max(1, Number(element.row_span || element.rowSpan || 1));
    return Math.max(maxRow, row + rowSpan);
  }, 0);
}

function createElement(kind, tables = [], existingElements = [], canvas = {}, translate = (value) => value) {
  const canvasMetrics = resolveFloorPlanCanvas(canvas);
  const defaultSpan =
    kind === "table"
      ? { colSpan: 1, rowSpan: 1 }
      : kind === "stage"
        ? { colSpan: Math.min(Math.max(4, Math.ceil(canvasMetrics.columns * 0.5)), canvasMetrics.columns), rowSpan: 1 }
        : kind === "dance_floor"
          ? { colSpan: Math.min(Math.max(3, Math.ceil(canvasMetrics.columns * 0.4)), canvasMetrics.columns), rowSpan: 2 }
          : kind === "bar"
            ? { colSpan: Math.min(4, canvasMetrics.columns), rowSpan: 1 }
      : kind === "wall"
        ? { colSpan: 3, rowSpan: 1 }
        : { colSpan: 2, rowSpan: 1 };
  const slot =
    kind === "table"
      ? findNextGridSlot(existingElements, {
          columns: canvasMetrics.columns,
          colSpan: defaultSpan.colSpan,
          rowSpan: defaultSpan.rowSpan,
        })
      : {
          col: 0,
          row: getLastOccupiedRow(existingElements),
        };
  if (kind === "table") {
    const used = new Set(
      existingElements
        .map((element) => Number(element?.table_number || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    const linkedTable =
      tables.find((table) => {
        const tableNumber = Number(table?.number ?? table?.tableNumber ?? table?.table_number);
        return Number.isFinite(tableNumber) && tableNumber > 0 && !used.has(tableNumber);
      }) || tables[0] || null;
    const tableNumber = Number(
      linkedTable?.number ?? linkedTable?.tableNumber ?? linkedTable?.table_number ?? 0
    );
    return {
      id: createFloorPlanId("table"),
      kind: "table",
      name: linkedTable?.label || `${translate("Table")} ${tableNumber || existingElements.length + 1}`,
      table_number: Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : null,
      linked_table_number: Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : null,
      shape: "circle",
      col: slot.col,
      row: slot.row,
      col_span: 1,
      row_span: 1,
      rotation: 0,
      visual_scale: 1,
      zone: String(linkedTable?.area || "").trim(),
      capacity: Number(linkedTable?.seats || 0) || 4,
      table_type: "regular",
      color: "",
    };
  }

  return {
    id: createFloorPlanId(kind),
    kind,
    name: translate(kind.replace(/_/g, " ")),
    text: translate(kind.replace(/_/g, " ")).toUpperCase(),
    col: slot.col,
    row: slot.row,
    col_span: defaultSpan.colSpan,
    row_span: defaultSpan.rowSpan,
    rotation: 0,
    visual_scale: 1,
    color: "",
  };
}

export default function FloorPlanDesigner({
  title = "Floor Plan Designer",
  description = "",
  value,
  tables = [],
  onChange,
  previewTableStates = [],
}) {
  const { t } = useTranslation();
  const defaultLayout = React.useMemo(() => buildGeneratedFloorPlan(tables), [tables]);
  const normalizedValue = React.useMemo(
    () => syncFloorPlanLayoutWithTables(value, tables) || defaultLayout,
    [defaultLayout, tables, value]
  );
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [previewMode, setPreviewMode] = React.useState(false);
  const [history, setHistory] = React.useState({ past: [], future: [] });
  const normalizedSnapshot = React.useMemo(
    () => JSON.stringify(normalizedValue),
    [normalizedValue]
  );
  const latestSnapshotRef = React.useRef(normalizedSnapshot);

  React.useEffect(() => {
    if (normalizedSnapshot === latestSnapshotRef.current) return;
    latestSnapshotRef.current = normalizedSnapshot;
    setHistory({ past: [], future: [] });
  }, [normalizedSnapshot]);

  React.useEffect(() => {
    if (!selectedIds.length) return;
    const nextIds = selectedIds.filter((selectedId) =>
      (normalizedValue.elements || []).some((element) => String(element.id) === String(selectedId))
    );
    if (nextIds.length !== selectedIds.length) {
      setSelectedIds(nextIds);
    }
  }, [normalizedValue, selectedIds]);

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : "";
  const selectedIdSet = React.useMemo(
    () => new Set(selectedIds.map((value) => String(value))),
    [selectedIds]
  );

  const selectedElement = React.useMemo(
    () =>
      selectedIds.length === 1
        ? (normalizedValue.elements || []).find((element) => String(element.id) === String(selectedId)) || null
        : null,
    [normalizedValue.elements, selectedId, selectedIds.length]
  );

  const tableElementIds = React.useMemo(
    () =>
      (normalizedValue.elements || [])
        .filter((element) => element.kind === "table")
        .map((element) => String(element.id)),
    [normalizedValue.elements]
  );
  const zoneGroups = React.useMemo(
    () => buildFloorPlanZoneGroups({ elements: normalizedValue.elements || [], tables }),
    [normalizedValue.elements, tables]
  );

  const selectedTableCount = React.useMemo(
    () =>
      (normalizedValue.elements || []).filter(
        (element) => element.kind === "table" && selectedIdSet.has(String(element.id))
      ).length,
    [normalizedValue.elements, selectedIdSet]
  );

  const allTablesSelected =
    tableElementIds.length > 0 && selectedTableCount === tableElementIds.length;
  const centerWholeMap = Boolean(
    normalizedValue?.metadata?.center_whole_map ?? normalizedValue?.metadata?.centerWholeMap
  );
  const tableNumbering = React.useMemo(() => {
    const config =
      normalizedValue?.metadata?.table_numbering &&
      typeof normalizedValue.metadata.table_numbering === "object"
        ? normalizedValue.metadata.table_numbering
        : normalizedValue?.metadata?.tableNumbering &&
            typeof normalizedValue.metadata.tableNumbering === "object"
          ? normalizedValue.metadata.tableNumbering
          : {};

    return {
      mode: config.mode === "column-based" ? "column-based" : "row-based",
      direction: ["ltr", "rtl", "ttb", "btt"].includes(config.direction) ? config.direction : "ltr",
      startNumber: Math.max(1, Number(config.startNumber) || 1),
      alternateColumns: Boolean(config.alternateColumns),
    };
  }, [normalizedValue?.metadata]);
  const tableNumberSize = React.useMemo(
    () => getFloorPlanTableNumberSize(normalizedValue, 1),
    [normalizedValue]
  );

  const applyLayout = React.useCallback(
    (nextLayout, { recordHistory = true } = {}) => {
      const normalizedLayout = normalizeFloorPlanLayout(nextLayout);
      if (!normalizedLayout) return;
      const nextSnapshot = JSON.stringify(normalizedLayout);
      if (nextSnapshot === latestSnapshotRef.current) return;
      if (recordHistory) {
        setHistory((prev) => ({
          past: [...prev.past, normalizedValue].slice(-HISTORY_LIMIT),
          future: [],
        }));
      }
      latestSnapshotRef.current = nextSnapshot;
      onChange?.(normalizedLayout);
    },
    [normalizedValue, onChange]
  );

  const commit = React.useCallback(
    (nextLayout) => {
      applyLayout(nextLayout);
    },
    [applyLayout]
  );

  const undoLayoutChange = React.useCallback(() => {
    setHistory((prev) => {
      if (!prev.past.length) return prev;
      const previousLayout = prev.past[prev.past.length - 1];
      latestSnapshotRef.current = JSON.stringify(previousLayout);
      onChange?.(previousLayout);
      return {
        past: prev.past.slice(0, -1),
        future: [normalizedValue, ...prev.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, [normalizedValue, onChange]);

  const updateElement = React.useCallback(
    (elementId, patch) => {
      commit({
        ...normalizedValue,
        elements: (normalizedValue.elements || []).map((element) =>
          String(element.id) === String(elementId) ? { ...element, ...patch } : element
        ),
      });
    },
    [commit, normalizedValue]
  );

  const updateElements = React.useCallback(
    (elementIds, patchFactory) => {
      const idSet = new Set((Array.isArray(elementIds) ? elementIds : []).map((value) => String(value)));
      if (!idSet.size) return;
      commit({
        ...normalizedValue,
        elements: (normalizedValue.elements || []).map((element) => {
          if (!idSet.has(String(element.id))) return element;
          const patch =
            typeof patchFactory === "function" ? patchFactory(element) : patchFactory;
          return patch ? { ...element, ...patch } : element;
        }),
      });
    },
    [commit, normalizedValue]
  );

  const updateCanvas = React.useCallback(
    (patch) => {
      commit({
        ...normalizedValue,
        canvas: {
          ...(normalizedValue.canvas || {}),
          ...patch,
        },
      });
    },
    [commit, normalizedValue]
  );

  const updateTableNumbering = React.useCallback(
    (patch) => {
      if (!patch || typeof patch !== "object") return;
      applyLayout(
        {
          ...normalizedValue,
          metadata: {
            ...(normalizedValue.metadata || {}),
            table_numbering: {
              ...(normalizedValue.metadata?.table_numbering || {}),
              ...patch,
            },
          },
        },
        { recordHistory: false }
      );
    },
    [applyLayout, normalizedValue]
  );

  const updateCenterWholeMap = React.useCallback(
    (enabled) => {
      applyLayout(
        {
          ...normalizedValue,
          metadata: {
            ...(normalizedValue.metadata || {}),
            center_whole_map: Boolean(enabled),
          },
        },
        { recordHistory: false }
      );
    },
    [applyLayout, normalizedValue]
  );

  const updateTableNumberSize = React.useCallback(
    (value) => {
      applyLayout(
        {
          ...normalizedValue,
          metadata: {
            ...(normalizedValue.metadata || {}),
            table_number_size: getFloorPlanTableNumberSize(
              { metadata: { table_number_size: value } },
              1
            ),
          },
        },
        { recordHistory: false }
      );
    },
    [applyLayout, normalizedValue]
  );

  const arrangeTables = React.useCallback(
    ({ rows, columns, mode, direction, startNumber, alternateColumns }) => {
      const nextRows = Math.max(1, Number(rows) || 1);
      const nextColumns = Math.max(1, Number(columns) || 1);
      const tableElements = (normalizedValue.elements || [])
        .filter((element) => element.kind === "table")
        .sort((a, b) => {
          const aNumber = Number((getFloorPlanLinkedTableNumber(a) ?? a.table_number) || 0);
          const bNumber = Number((getFloorPlanLinkedTableNumber(b) ?? b.table_number) || 0);
          if (aNumber && bNumber && aNumber !== bNumber) return aNumber - bNumber;
          return String(a.id).localeCompare(String(b.id));
        });
      const requestedCapacity = nextRows * nextColumns;
      const actualTableColumns = nextColumns;
      const actualTableRows =
        tableElements.length > requestedCapacity
          ? Math.max(nextRows, Math.ceil(tableElements.length / Math.max(1, nextColumns)))
          : nextRows;
      const tableIdSet = new Set(tableElements.map((element) => String(element.id)));
      const arrangedTables = tableElements.map((element, index) => ({
        ...element,
        row: Math.floor(index / actualTableColumns),
        col: index % actualTableColumns,
      }));
      const staticSource = (normalizedValue.elements || []).filter(
        (element) => !tableIdSet.has(String(element.id))
      );
      const minStaticRow = staticSource.length
        ? Math.min(...staticSource.map((element) => Number(element.row || 0)))
        : 0;
      const staticElements = staticSource.map((element) => {
        const relativeRow = Math.max(0, Number(element.row || 0) - minStaticRow);
        return {
          ...element,
          row: actualTableRows + relativeRow,
        };
      });
      const requiredCanvasRows = [...arrangedTables, ...staticElements].reduce((maxRows, element) => {
        const row = Number(element.row || 0);
        const rowSpan = Math.max(1, Number(element.row_span || element.rowSpan || 1));
        return Math.max(maxRows, row + rowSpan);
      }, actualTableRows);
      const requiredCanvasColumns = [...arrangedTables, ...staticElements].reduce((maxColumns, element) => {
        const col = Number(element.col || 0);
        const colSpan = Math.max(1, Number(element.col_span || element.colSpan || 1));
        return Math.max(maxColumns, col + colSpan);
      }, actualTableColumns);

      const arrangedLayout = renumberFloorPlanTables({
        ...normalizedValue,
        metadata: {
          ...(normalizedValue.metadata || {}),
          table_numbering: {
            ...(normalizedValue.metadata?.table_numbering || {}),
            mode: mode || tableNumbering.mode,
            direction: direction || tableNumbering.direction,
            startNumber: Math.max(1, Number(startNumber) || tableNumbering.startNumber || 1),
            alternateColumns:
              typeof alternateColumns === "boolean"
                ? alternateColumns
                : tableNumbering.alternateColumns,
          },
        },
        canvas: {
          ...(normalizedValue.canvas || {}),
          columns: Math.max(1, requiredCanvasColumns),
          rows: Math.max(1, requiredCanvasRows),
        },
        elements: [...arrangedTables, ...staticElements],
      });

      commit(arrangedLayout);
      setSelectedIds(arrangedTables.map((element) => element.id));
    },
    [commit, normalizedValue, tableNumbering.alternateColumns, tableNumbering.direction, tableNumbering.mode, tableNumbering.startNumber]
  );

  const addElement = React.useCallback(
    (kind) => {
      const nextElement = createElement(
        kind,
        tables,
        normalizedValue.elements || [],
        normalizedValue.canvas,
        t
      );
      commit({
        ...normalizedValue,
        elements: [...(normalizedValue.elements || []), nextElement],
      });
      setSelectedIds([nextElement.id]);
    },
    [commit, normalizedValue, t, tables]
  );

  const duplicateSelected = React.useCallback(() => {
    if (!selectedElement) return;
    const slot = findNextGridSlot(normalizedValue.elements || [], {
      columns: resolveFloorPlanCanvas(normalizedValue.canvas).columns,
      colSpan: Number(selectedElement.col_span || 1),
      rowSpan: Number(selectedElement.row_span || 1),
    });
    const duplicate = {
      ...selectedElement,
      id: createFloorPlanId(selectedElement.kind || "element"),
      col: slot.col,
      row: slot.row,
    };
    commit({
      ...normalizedValue,
      elements: [...(normalizedValue.elements || []), duplicate],
    });
    setSelectedIds([duplicate.id]);
  }, [commit, normalizedValue, selectedElement]);

  const deleteSelected = React.useCallback(() => {
    if (!selectedIds.length) return;
    commit({
      ...normalizedValue,
      elements: (normalizedValue.elements || []).filter(
        (element) => !selectedIdSet.has(String(element.id))
      ),
    });
    setSelectedIds([]);
  }, [commit, normalizedValue, selectedIdSet, selectedIds.length]);

  const selectAllTables = React.useCallback(() => {
    setSelectedIds(tableElementIds);
  }, [tableElementIds]);

  const clearSelection = React.useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleCanvasSelect = React.useCallback((elementId, options = {}) => {
    if (!elementId) {
      setSelectedIds([]);
      return;
    }
    const nextId = String(elementId);
    if (options.toggle) {
      setSelectedIds((prev) =>
        prev.includes(nextId) ? prev.filter((value) => value !== nextId) : [...prev, nextId]
      );
      return;
    }
    setSelectedIds([nextId]);
  }, []);

  const moveSelectedElements = React.useCallback(
    (anchorId, nextCol, nextRow) => {
      const anchor = (normalizedValue.elements || []).find(
        (element) => String(element.id) === String(anchorId)
      );
      if (!anchor) return;
      const deltaCol = Number(nextCol || 0) - Number(anchor.col || 0);
      const deltaRow = Number(nextRow || 0) - Number(anchor.row || 0);
      if (!deltaCol && !deltaRow) return;

      const selectedGroup = selectedIdSet.has(String(anchorId)) ? selectedIds : [String(anchorId)];
      updateElements(selectedGroup, (element) => ({
        col: Math.max(0, Number(element.col || 0) + deltaCol),
        row: Math.max(0, Number(element.row || 0) + deltaRow),
      }));
    },
    [normalizedValue.elements, selectedIdSet, selectedIds, updateElements]
  );

  const resizeSelectedTables = React.useCallback(
    (direction) => {
      if (!selectedIdSet.size) return;
      const delta = direction === "grow" ? 1 : -1;
      commit({
        ...normalizedValue,
        elements: (normalizedValue.elements || []).map((element) => {
          if (element.kind !== "table" || !selectedIdSet.has(String(element.id))) {
            return element;
          }
          return {
            ...element,
            visual_scale: Math.max(
              0.15,
              Math.min(1.35, Number(element.visual_scale || 1) + delta * 0.1)
            ),
          };
        }),
      });
    },
    [commit, normalizedValue, selectedIdSet]
  );

  const updateAllTables = React.useCallback(
    (patch) => {
      if (!patch || typeof patch !== "object") return;
      commit({
        ...normalizedValue,
        elements: (normalizedValue.elements || []).map((element) =>
          element.kind === "table" ? { ...element, ...patch } : element
        ),
      });
    },
    [commit, normalizedValue]
  );

  const resetLayout = React.useCallback(() => {
    commit(defaultLayout);
    setSelectedIds([]);
  }, [commit, defaultLayout]);

  return (
    <div className="space-y-4">
      <div className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,244,245,0.98))] p-5 shadow-sm dark:border-neutral-800 dark:bg-[linear-gradient(180deg,_rgba(10,10,11,0.96),_rgba(17,24,39,0.96))]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-neutral-950 dark:text-white">{title}</div>
            {description ? (
              <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</div>
            ) : null}
          </div>
          <div className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            {normalizedValue.elements?.length || 0} elements
          </div>
        </div>
      </div>

      <FloorPlanToolbar
        onAddElement={addElement}
        onArrangeTables={arrangeTables}
        onTableNumberingChange={updateTableNumbering}
        onTableNumberSizeChange={updateTableNumberSize}
        onTableSpacingChange={updateCanvas}
        onCenterWholeMapChange={updateCenterWholeMap}
        onUndo={undoLayoutChange}
        onSelectAllTables={selectAllTables}
        onClearSelection={clearSelection}
        onResizeSelectedSmaller={() => resizeSelectedTables("shrink")}
        onResizeSelectedLarger={() => resizeSelectedTables("grow")}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onReset={resetLayout}
        onPreviewToggle={() => setPreviewMode((prev) => !prev)}
        previewMode={previewMode}
        selectedElement={selectedElement}
        selectedCount={selectedIds.length}
        selectedTableCount={selectedTableCount}
        tableCount={tableElementIds.length}
        allTablesSelected={allTablesSelected}
        canUndo={history.past.length > 0}
        canvas={normalizedValue.canvas}
        tableNumbering={tableNumbering}
        tableNumberSize={tableNumberSize}
        centerWholeMap={centerWholeMap}
      />

      {previewMode ? (
        <FloorPlanPreview
          layout={normalizedValue}
          tables={tables}
          tableStates={previewTableStates}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.7fr)_380px] xl:items-start">
          <div className="rounded-[32px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.9),_rgba(244,244,245,0.92))] p-4 shadow-sm dark:border-neutral-800 dark:bg-[linear-gradient(180deg,_rgba(10,10,11,0.92),_rgba(17,24,39,0.92))]">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
              <div className="space-y-3">
                <FloorPlanLegendHeader
                  elements={(normalizedValue.elements || []).filter((element) => element.kind === "table")}
                  showStatuses={false}
                  showZones
                />
                <FloorPlanCanvas
                  layout={normalizedValue}
                  elements={normalizedValue.elements || []}
                  selectedIds={selectedIds}
                  onSelect={handleCanvasSelect}
                  onElementChange={updateElement}
                  onElementsMove={moveSelectedElements}
                />
              </div>
              <div className="xl:sticky xl:top-4">
                <FloorPlanElementEditor
                  element={selectedElement}
                  tables={tables}
                  zoneGroups={zoneGroups}
                  onChange={updateElement}
                  onUpdateAllTables={updateAllTables}
                  selectionCount={selectedIds.length}
                  selectedTableCount={selectedTableCount}
                />
              </div>
            </div>
          </div>
          <div className="xl:sticky xl:top-4">
            <FloorPlanPreview
              layout={normalizedValue}
              tables={tables}
              tableStates={previewTableStates}
            />
          </div>
        </div>
      )}
    </div>
  );
}
