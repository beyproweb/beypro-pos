const DEFAULT_CANVAS = {
  width: 1008,
  height: 672,
  gridSize: 84,
  cellSize: 84,
  rowHeight: 84,
  columns: 12,
  rows: 8,
};

const MAX_TABLE_GAP = 72;
const MIN_TABLE_NUMBER_SIZE = 0.6;
const MAX_TABLE_NUMBER_SIZE = 1.8;
const MAX_MAP_OFFSET = 2400;
const MIN_MAP_SCALE = 0.6;
const MAX_MAP_SCALE = 2.4;

function clampTableGap(value) {
  return Math.max(-MAX_TABLE_GAP, Math.min(MAX_TABLE_GAP, asNumber(value, 0)));
}

export function normalizeFloorPlanTableNumberSize(value, fallback = 1) {
  const parsed = asNumber(value, fallback);
  return Math.min(MAX_TABLE_NUMBER_SIZE, Math.max(MIN_TABLE_NUMBER_SIZE, parsed));
}

export function getFloorPlanTableNumberSize(layout = null, fallback = 1) {
  return normalizeFloorPlanTableNumberSize(
    layout?.metadata?.table_number_size ?? layout?.metadata?.tableNumberSize,
    fallback
  );
}

export function normalizeFloorPlanMapOffset(value, fallback = 0) {
  const parsed = Math.round(asNumber(value, fallback));
  return Math.max(-MAX_MAP_OFFSET, Math.min(MAX_MAP_OFFSET, parsed));
}

export function getFloorPlanMapOffset(layout = null, axis = "x", fallback = 0) {
  if (String(axis).toLowerCase() === "y") {
    return normalizeFloorPlanMapOffset(
      layout?.metadata?.map_offset_y ?? layout?.metadata?.mapOffsetY,
      fallback
    );
  }

  return normalizeFloorPlanMapOffset(
    layout?.metadata?.map_offset_x ?? layout?.metadata?.mapOffsetX,
    fallback
  );
}

export function isFloorPlanLayoutLocked(layout = null) {
  return Boolean(layout?.metadata?.layout_locked ?? layout?.metadata?.layoutLocked);
}

export function normalizeFloorPlanMapScale(value, fallback = 1) {
  const parsed = asNumber(value, fallback);
  return Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, parsed));
}

export function getFloorPlanMapScale(layout = null, fallback = 1) {
  return normalizeFloorPlanMapScale(
    layout?.metadata?.map_scale ?? layout?.metadata?.mapScale,
    fallback
  );
}

export const FLOOR_PLAN_TABLE_TYPES = [
  { value: "regular", label: "Regular" },
  { value: "vip", label: "VIP" },
  { value: "standing", label: "Standing" },
  { value: "couple", label: "Couple" },
  { value: "men_only", label: "Men only" },
  { value: "women_only", label: "Women only" },
  { value: "mixed_only", label: "Mixed only" },
  { value: "disabled", label: "Disabled" },
  { value: "hidden", label: "Hidden" },
];

export const FLOOR_PLAN_ELEMENT_KINDS = [
  { value: "table", label: "Table" },
  { value: "stage", label: "Stage" },
  { value: "bar", label: "Bar" },
  { value: "dance_floor", label: "Dance Floor" },
  { value: "dj_booth", label: "DJ Booth" },
  { value: "entrance", label: "Entrance" },
  { value: "exit", label: "Exit" },
  { value: "wc", label: "WC" },
  { value: "wall", label: "Wall" },
  { value: "label", label: "Label" },
  { value: "no_go", label: "No-Go Area" },
];

export const FLOOR_PLAN_STATUS_STYLES = {
  available: {
    fill: "#0f766e",
    border: "#115e59",
    text: "#ffffff",
    badge: "Available",
  },
  pending_hold: {
    fill: "#fef3c7",
    border: "#d97706",
    text: "#92400e",
    badge: "Busy",
  },
  selected: {
    fill: "#0f172a",
    border: "#0f172a",
    text: "#ffffff",
    badge: "Selected",
  },
  reserved: {
    fill: "#f59e0b",
    border: "#d97706",
    text: "#111827",
    badge: "Reserved",
  },
  occupied: {
    fill: "#ef4444",
    border: "#b91c1c",
    text: "#ffffff",
    badge: "Occupied",
  },
  blocked: {
    fill: "#d4d4d8",
    border: "#a1a1aa",
    text: "#3f3f46",
    badge: "Blocked",
  },
  hidden: {
    fill: "#f4f4f5",
    border: "#d4d4d8",
    text: "#71717a",
    badge: "Hidden",
  },
};

export const FLOOR_PLAN_TABLE_BASE_SCALE = 1;
export const FLOOR_PLAN_TABLE_BASE_SCALE_Y = 1;
const FLOOR_PLAN_ZONE_CATEGORY_ORDER = [
  "premium",
  "main",
  "upper",
  "private",
  "outdoor",
  "service",
  "other",
];
const FLOOR_PLAN_ZONE_CATEGORY_LABELS = {
  premium: "Premium",
  main: "Main Seating",
  upper: "Upper Level",
  private: "Private",
  outdoor: "Outdoor",
  service: "Service",
  other: "Other",
};
const FLOOR_PLAN_ZONE_SWATCHES = [
  { fill: "#dbeafe", border: "#2563eb", text: "#1e3a8a" },
  { fill: "#dcfce7", border: "#16a34a", text: "#14532d" },
  { fill: "#fef3c7", border: "#d97706", text: "#92400e" },
  { fill: "#fce7f3", border: "#db2777", text: "#9d174d" },
  { fill: "#ede9fe", border: "#7c3aed", text: "#5b21b6" },
  { fill: "#cffafe", border: "#0891b2", text: "#164e63" },
  { fill: "#fee2e2", border: "#dc2626", text: "#991b1b" },
  { fill: "#f3f4f6", border: "#4b5563", text: "#1f2937" },
];

function asText(value, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function toTableKey(value) {
  return String(value ?? "").trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPositiveInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeFloorPlanTextSize(value, fallback = 14) {
  const parsed = asNumber(value, fallback);
  return Math.min(48, Math.max(10, parsed));
}

function normalizeArray(values) {
  return Array.isArray(values) ? values : [];
}

function getZoneMatchSource(zoneName = "") {
  return String(zoneName || "").trim().toLowerCase();
}

function isGenericTableName(value = "") {
  return /^table\s+\d+$/i.test(String(value || "").trim());
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function getNormalizedTableLinkNumber(element = {}) {
  return (
    asPositiveInt(
      element.linked_table_number ??
        element.linkedTableNumber ??
        element.source_table_number ??
        element.sourceTableNumber,
      0
    ) || null
  );
}

function getClusterTolerance(values = [], explicitTolerance = null) {
  if (isFiniteNumber(explicitTolerance) && Number(explicitTolerance) >= 0) {
    return Number(explicitTolerance);
  }
  const sortedValues = [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))].sort(
    (a, b) => a - b
  );
  let minGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < sortedValues.length; index += 1) {
    const gap = sortedValues[index] - sortedValues[index - 1];
    if (gap > 0 && gap < minGap) {
      minGap = gap;
    }
  }
  if (!Number.isFinite(minGap)) return 0.49;
  return minGap > 1 ? 1 : 0.49;
}

function buildAxisClusterMap(elements = [], axis = "row", explicitTolerance = null) {
  const values = elements.map((element) => Number(element?.[axis] || 0));
  const tolerance = getClusterTolerance(values, explicitTolerance);
  const sorted = [...elements].sort((a, b) => {
    const aValue = Number(a?.[axis] || 0);
    const bValue = Number(b?.[axis] || 0);
    if (aValue !== bValue) return aValue - bValue;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  const clusters = [];
  const clusterMap = new Map();

  sorted.forEach((element) => {
    const value = Number(element?.[axis] || 0);
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster || Math.abs(value - lastCluster.anchor) > tolerance) {
      clusters.push({ anchor: value, values: [value] });
      clusterMap.set(String(element.id), clusters.length - 1);
      return;
    }
    lastCluster.values.push(value);
    lastCluster.anchor = lastCluster.values.reduce((sum, item) => sum + item, 0) / lastCluster.values.length;
    clusterMap.set(String(element.id), clusters.length - 1);
  });

  return clusterMap;
}

function rectanglesOverlap(a, b) {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  );
}

function findNextGridSlot(existingElements = [], { columns = 12, colSpan = 1, rowSpan = 1 } = {}) {
  for (let row = 0; row < 128; row += 1) {
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

function replaceTrailingNumber(text = "", nextNumber) {
  const source = asText(text, "");
  if (!source) return source;
  if (/\d+\s*$/.test(source)) {
    return source.replace(/\d+\s*$/, String(nextNumber));
  }
  return source;
}

function getTableSortNumber(element = {}) {
  return getNormalizedTableLinkNumber(element) ?? (asPositiveInt(element.table_number ?? element.tableNumber, 0) || null);
}

function resolveTableNumberingOptions(layout = null, overrides = {}) {
  const config =
    layout?.metadata?.table_numbering && typeof layout.metadata.table_numbering === "object"
      ? layout.metadata.table_numbering
      : layout?.metadata?.tableNumbering && typeof layout.metadata.tableNumbering === "object"
        ? layout.metadata.tableNumbering
        : {};
  const mode = String(overrides.mode ?? config.mode ?? "row-based").trim().toLowerCase();
  const direction = String(overrides.direction ?? config.direction ?? "ltr").trim().toLowerCase();
  return {
    mode: mode === "column-based" ? "column-based" : "row-based",
    direction: ["ltr", "rtl", "ttb", "btt"].includes(direction) ? direction : "ltr",
    startNumber: Math.max(1, asPositiveInt(overrides.startNumber ?? config.startNumber, 1) || 1),
    keepPrefix: Boolean(overrides.keepPrefix ?? config.keepPrefix),
    alternateColumns: Boolean(overrides.alternateColumns ?? config.alternateColumns),
    rowTolerance:
      isFiniteNumber(overrides.rowTolerance) || isFiniteNumber(config.rowTolerance)
        ? Number(overrides.rowTolerance ?? config.rowTolerance)
        : null,
    colTolerance:
      isFiniteNumber(overrides.colTolerance) || isFiniteNumber(config.colTolerance)
        ? Number(overrides.colTolerance ?? config.colTolerance)
        : null,
  };
}

export function createFloorPlanId(prefix = "element", suffix = "") {
  const tail = suffix || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return `${prefix}-${tail}`;
}

function resolveCanvasGrid(canvas = {}) {
  const cellSize = Math.max(
    48,
    asNumber(canvas.cell_size || canvas.cellSize || canvas.grid_size || canvas.gridSize, DEFAULT_CANVAS.cellSize)
  );
  const rowHeight = Math.max(
    48,
    asNumber(canvas.row_height || canvas.rowHeight, cellSize)
  );
  const columns = Math.max(
    4,
    asPositiveInt(canvas.columns, DEFAULT_CANVAS.columns)
  );
  return { cellSize, rowHeight, columns };
}

export function resolveFloorPlanCanvas(canvas = {}) {
  const { cellSize, rowHeight, columns } = resolveCanvasGrid(canvas);
  const rows = Math.max(4, asPositiveInt(canvas.rows, DEFAULT_CANVAS.rows));
  return {
    width: Math.max(600, asNumber(canvas.width, DEFAULT_CANVAS.width)),
    height: Math.max(420, asNumber(canvas.height, DEFAULT_CANVAS.height)),
    gridSize: cellSize,
    cellSize,
    rowHeight,
    columns,
    rows,
    tableGapX: clampTableGap(canvas.table_gap_x ?? canvas.tableGapX),
    tableGapY: clampTableGap(canvas.table_gap_y ?? canvas.tableGapY),
  };
}

function trimFloorPlanLayout(layout = null) {
  if (!layout || !Array.isArray(layout.elements)) return layout;
  const { cellSize, rowHeight } = resolveCanvasGrid(layout.canvas);
  const elements = layout.elements.map((element) => ({ ...element }));
  if (!elements.length) {
    return {
      ...layout,
      canvas: {
        ...layout.canvas,
        width: DEFAULT_CANVAS.width,
        height: DEFAULT_CANVAS.height,
        columns: DEFAULT_CANVAS.columns,
        rows: DEFAULT_CANVAS.rows,
        cellSize,
        rowHeight,
        gridSize: cellSize,
        tableGapX: 0,
        tableGapY: 0,
      },
    };
  }

  const minCol = Math.min(...elements.map((element) => Number(element.col || 0)));
  const minRow = Math.min(...elements.map((element) => Number(element.row || 0)));
  const shifted = elements.map((element) => {
    const col = Math.max(0, Number(element.col || 0) - minCol);
    const row = Math.max(0, Number(element.row || 0) - minRow);
    const colSpan = Math.max(1, Number(element.col_span || element.colSpan || 1));
    const rowSpan = Math.max(1, Number(element.row_span || element.rowSpan || 1));
    const offsetX = asNumber(element.offset_x ?? element.offsetX, 0);
    const offsetY = asNumber(element.offset_y ?? element.offsetY, 0);
    const width = Math.max(24, asNumber(element.width, colSpan * cellSize));
    const height = Math.max(24, asNumber(element.height, rowSpan * rowHeight));
    return {
      ...element,
      col,
      row,
      col_span: colSpan,
      row_span: rowSpan,
      offset_x: offsetX,
      offset_y: offsetY,
      width,
      height,
      x: col * cellSize + offsetX,
      y: row * rowHeight + offsetY,
    };
  });

  const occupiedCols = new Set();
  const occupiedRows = new Set();
  shifted.forEach((element) => {
    const col = Number(element.col || 0);
    const row = Number(element.row || 0);
    const colSpan = Math.max(1, Number(element.col_span || element.colSpan || 1));
    const rowSpan = Math.max(1, Number(element.row_span || element.rowSpan || 1));
    for (let colIndex = col; colIndex < col + colSpan; colIndex += 1) {
      occupiedCols.add(colIndex);
    }
    for (let rowIndex = row; rowIndex < row + rowSpan; rowIndex += 1) {
      occupiedRows.add(rowIndex);
    }
  });

  const compactedCols = [...occupiedCols].sort((a, b) => a - b);
  const compactedRows = [...occupiedRows].sort((a, b) => a - b);
  const colIndexMap = new Map(compactedCols.map((value, index) => [value, index]));
  const rowIndexMap = new Map(compactedRows.map((value, index) => [value, index]));
  const compacted = shifted.map((element) => {
    const col = Number(element.col || 0);
    const row = Number(element.row || 0);
    return {
      ...element,
      col: colIndexMap.get(col) ?? 0,
      row: rowIndexMap.get(row) ?? 0,
      x: (colIndexMap.get(col) ?? 0) * cellSize + asNumber(element.offset_x ?? element.offsetX, 0),
      y: (rowIndexMap.get(row) ?? 0) * rowHeight + asNumber(element.offset_y ?? element.offsetY, 0),
    };
  });

  const maxCol = Math.max(...compacted.map((element) => Number(element.col || 0) + Number(element.col_span || 1)));
  const maxRow = Math.max(...compacted.map((element) => Number(element.row || 0) + Number(element.row_span || 1)));
  const columns = Math.max(4, maxCol);
  const rows = Math.max(4, maxRow);

  return {
    ...layout,
    canvas: {
      ...layout.canvas,
      width: columns * cellSize,
      height: rows * rowHeight,
      columns,
      rows,
      cellSize,
      rowHeight,
      gridSize: cellSize,
      tableGapX: clampTableGap(layout?.canvas?.tableGapX ?? layout?.canvas?.table_gap_x),
      tableGapY: clampTableGap(layout?.canvas?.tableGapY ?? layout?.canvas?.table_gap_y),
    },
    elements: compacted,
  };
}

export function normalizeFloorPlanElement(element = {}, canvas = DEFAULT_CANVAS) {
  const { cellSize, rowHeight } = resolveCanvasGrid(canvas);
  const kind = asText(
    element.kind || (element.table_number || element.tableNumber ? "table" : "label"),
    "table"
  ).toLowerCase();
  const explicitCol = hasValue(element.col) ? element.col : element.column;
  const explicitRow = hasValue(element.row) ? element.row : null;
  const explicitColSpan = hasValue(element.col_span) ? element.col_span : element.colSpan;
  const explicitRowSpan = hasValue(element.row_span) ? element.row_span : element.rowSpan;
  const derivedWidth = Math.max(48, asNumber(element.width, kind === "label" ? cellSize * 2 : cellSize));
  const derivedHeight = Math.max(32, asNumber(element.height, kind === "label" ? rowHeight : rowHeight));
  const colSpan = Math.max(
    1,
    hasValue(explicitColSpan) ? asPositiveInt(explicitColSpan, 1) : Math.round(derivedWidth / cellSize) || 1
  );
  const rowSpan = Math.max(
    1,
    hasValue(explicitRowSpan) ? asPositiveInt(explicitRowSpan, 1) : Math.round(derivedHeight / rowHeight) || 1
  );
  const col = Math.max(
    0,
    hasValue(explicitCol) ? Math.floor(Number(explicitCol) || 0) : Math.round(asNumber(element.x, 0) / cellSize)
  );
  const row = Math.max(
    0,
    hasValue(explicitRow) ? Math.floor(Number(explicitRow) || 0) : Math.round(asNumber(element.y, 0) / rowHeight)
  );
  const renderWidth = Math.max(
    24,
    hasValue(element.width) ? asNumber(element.width, colSpan * cellSize) : colSpan * cellSize
  );
  const renderHeight = Math.max(
    24,
    hasValue(element.height) ? asNumber(element.height, rowSpan * rowHeight) : rowSpan * rowHeight
  );
  const offsetX = asNumber(element.offset_x ?? element.offsetX, 0);
  const offsetY = asNumber(element.offset_y ?? element.offsetY, 0);
  return {
    id: asText(element.id, createFloorPlanId(kind)),
    kind,
    name: asText(
      element.name || element.label,
      element.table_number || element.tableNumber
        ? `Table ${element.table_number || element.tableNumber}`
        : kind.replace(/_/g, " ")
    ),
    label: asText(element.label || element.name, ""),
    text: asText(element.text, ""),
    shape: asText(element.shape, kind === "table" ? "circle" : "rectangle").toLowerCase(),
    col,
    row,
    col_span: colSpan,
    row_span: rowSpan,
    offset_x: offsetX,
    offset_y: offsetY,
    x: col * cellSize + offsetX,
    y: row * rowHeight + offsetY,
    width: renderWidth,
    height: renderHeight,
    rotation: asNumber(element.rotation, 0),
    visual_scale: Math.min(1.35, Math.max(0.15, asNumber(element.visual_scale ?? element.visualScale, 1))),
    color: asText(element.color, ""),
    text_color: asText(element.text_color ?? element.textColor, ""),
    text_size: normalizeFloorPlanTextSize(element.text_size ?? element.textSize, kind === "label" ? 16 : 14),
    zone: asText(element.zone || element.area, ""),
    capacity: asPositiveInt(element.capacity ?? element.seats ?? element.guest_limit, 0),
    table_number: asPositiveInt(element.table_number ?? element.tableNumber, 0) || null,
    linked_table_number:
      getNormalizedTableLinkNumber(element) ||
      asPositiveInt(element.table_number ?? element.tableNumber, 0) ||
      null,
    table_type: asText(element.table_type || element.tableType, "regular").toLowerCase(),
    compatible_ticket_type_ids: normalizeArray(
      element.compatible_ticket_type_ids || element.compatibleTicketTypeIds
    )
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0),
    compatible_area_names: normalizeArray(
      element.compatible_area_names || element.compatibleAreaNames
    )
      .map((value) => String(value || "").trim())
      .filter(Boolean),
    hidden: Boolean(element.hidden),
    metadata:
      element.metadata && typeof element.metadata === "object" && !Array.isArray(element.metadata)
        ? element.metadata
        : {},
  };
}

export function normalizeFloorPlanLayout(layout) {
  if (!layout || typeof layout !== "object") return null;
  const canvas = layout.canvas && typeof layout.canvas === "object" ? layout.canvas : {};
  const resolvedCanvas = resolveFloorPlanCanvas(canvas);
  const metadata =
    layout.metadata && typeof layout.metadata === "object" && !Array.isArray(layout.metadata)
      ? { ...layout.metadata }
      : {};
  metadata.table_number_size = getFloorPlanTableNumberSize({ metadata }, 1);
  metadata.layout_locked = isFloorPlanLayoutLocked({ metadata });
  metadata.map_offset_x = getFloorPlanMapOffset({ metadata }, "x", 0);
  metadata.map_offset_y = getFloorPlanMapOffset({ metadata }, "y", 0);
  metadata.map_scale = getFloorPlanMapScale({ metadata }, 1);
  return trimFloorPlanLayout({
    id: asText(layout.id, "default-floor-plan"),
    name: asText(layout.name, "Floor Plan"),
    layout_type: asText(layout.layout_type || layout.layoutType, "venue"),
    version: asPositiveInt(layout.version, 1) || 1,
    canvas: {
      width: resolvedCanvas.width,
      height: resolvedCanvas.height,
      gridSize: resolvedCanvas.gridSize,
      cellSize: resolvedCanvas.cellSize,
      rowHeight: resolvedCanvas.rowHeight,
      columns: resolvedCanvas.columns,
      rows: resolvedCanvas.rows,
      tableGapX: resolvedCanvas.tableGapX,
      tableGapY: resolvedCanvas.tableGapY,
    },
    metadata,
    elements: normalizeArray(layout.elements).map((element) =>
      normalizeFloorPlanElement(element, {
        cellSize: resolvedCanvas.cellSize,
        rowHeight: resolvedCanvas.rowHeight,
        columns: resolvedCanvas.columns,
      })
    ),
  });
}

export function buildGeneratedFloorPlan(tables = []) {
  const columns = 4;
  const normalizedTables = normalizeArray(tables);

  return normalizeFloorPlanLayout({
    id: "generated-floor-plan",
    name: "Generated Floor Plan",
    layout_type: "generated",
    version: 1,
    canvas: DEFAULT_CANVAS,
    metadata: { generated: true },
    elements: normalizedTables.map((table, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const tableNumber = asPositiveInt(table?.table_number ?? table?.number, 0) || null;
      return {
        id: createFloorPlanId("table", tableNumber || index + 1),
        kind: "table",
        table_number: tableNumber,
        linked_table_number: tableNumber,
        name: asText(table?.label, tableNumber ? `Table ${tableNumber}` : `Table ${index + 1}`),
        col: col * 2,
        row: row * 2,
        col_span: 1,
        row_span: 1,
        shape: index % 2 === 0 ? "circle" : "square",
        capacity: asPositiveInt(table?.seats ?? table?.guests, 0),
        zone: asText(table?.area, ""),
        table_type: "regular",
      };
    }),
  });
}

export function syncFloorPlanLayoutWithTables(layout, tables = []) {
  const normalizedTables = normalizeArray(tables);
  const normalizedLayout = normalizeFloorPlanLayout(layout);
  if (!normalizedLayout) return buildGeneratedFloorPlan(normalizedTables);

  const currentTableNumbers = new Set(
    normalizedTables
      .map((table) => asPositiveInt(table?.table_number ?? table?.number ?? table?.tableNumber, 0))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

  const tableMap = new Map(
    normalizedTables
      .map((table) => {
        const tableNumber = asPositiveInt(table?.table_number ?? table?.number ?? table?.tableNumber, 0);
        return tableNumber > 0 ? [tableNumber, table] : null;
      })
      .filter(Boolean)
  );

  const staticElements = normalizedLayout.elements.filter((element) => element.kind !== "table");
  const keptTableElements = normalizedLayout.elements
    .filter((element) => element.kind === "table")
    .filter((element) => currentTableNumbers.has(getFloorPlanLinkedTableNumber(element)));

  const usedLinkedNumbers = new Set(
    keptTableElements
      .map((element) => getFloorPlanLinkedTableNumber(element))
      .filter((value) => Number.isFinite(value) && value > 0)
  );

  const tableElements = keptTableElements.map((element) => {
    const linkedTableNumber = getFloorPlanLinkedTableNumber(element);
    const table = tableMap.get(linkedTableNumber) || null;
    return {
      ...element,
      linked_table_number: linkedTableNumber,
      zone: asText(table?.area ?? table?.zone, element.zone || ""),
      capacity: asPositiveInt(table?.seats ?? table?.guests, 0) || element.capacity || 4,
      name: asText(table?.label, element.name || (linkedTableNumber ? `Table ${linkedTableNumber}` : "Table")),
    };
  });

  const resolvedCanvas = resolveFloorPlanCanvas(normalizedLayout.canvas || {});
  normalizedTables.forEach((table, index) => {
    const linkedTableNumber = asPositiveInt(table?.table_number ?? table?.number ?? table?.tableNumber, 0);
    if (!linkedTableNumber || usedLinkedNumbers.has(linkedTableNumber)) return;
    const slot = findNextGridSlot([...tableElements, ...staticElements], {
      columns: resolvedCanvas.columns,
      colSpan: 1,
      rowSpan: 1,
    });
    tableElements.push({
      id: createFloorPlanId("table", linkedTableNumber || index + 1),
      kind: "table",
      table_number: linkedTableNumber,
      linked_table_number: linkedTableNumber,
      name: asText(table?.label, linkedTableNumber ? `Table ${linkedTableNumber}` : `Table ${index + 1}`),
      shape: "circle",
      col: slot.col,
      row: slot.row,
      col_span: 1,
      row_span: 1,
      rotation: 0,
      visual_scale: 1,
      zone: asText(table?.area ?? table?.zone, ""),
      capacity: asPositiveInt(table?.seats ?? table?.guests, 0) || 4,
      table_type: "regular",
      color: "",
    });
    usedLinkedNumbers.add(linkedTableNumber);
  });

  return renumberFloorPlanTables({
    ...normalizedLayout,
    elements: [...tableElements, ...staticElements],
  });
}

export function mergeFloorPlanVisualStyles(layout, sourceLayout) {
  const normalizedLayout = normalizeFloorPlanLayout(layout);
  const normalizedSource = normalizeFloorPlanLayout(sourceLayout);
  if (!normalizedLayout || !normalizedSource) return normalizedLayout || normalizedSource || null;

  const sourceById = new Map(
    (normalizedSource.elements || []).map((element) => [String(element.id), element])
  );
  const sourceByLinkedNumber = new Map(
    (normalizedSource.elements || [])
      .filter((element) => element.kind === "table")
      .map((element) => [Number(getFloorPlanLinkedTableNumber(element) || element.table_number || 0), element])
      .filter(([tableNumber]) => Number.isFinite(tableNumber) && tableNumber > 0)
  );

  return {
    ...normalizedLayout,
    metadata: {
      ...(normalizedLayout.metadata || {}),
      table_number_size: getFloorPlanTableNumberSize(
        normalizedSource,
        getFloorPlanTableNumberSize(normalizedLayout, 1)
      ),
    },
    elements: (normalizedLayout.elements || []).map((element) => {
      const sourceMatch =
        sourceById.get(String(element.id)) ||
        (element.kind === "table"
          ? sourceByLinkedNumber.get(Number(getFloorPlanLinkedTableNumber(element) || element.table_number || 0))
          : null);
      if (!sourceMatch) return element;
      if (element.kind !== "table") {
        return {
          ...element,
          ...sourceMatch,
          id: element.id,
        };
      }
      return {
        ...element,
        color: sourceMatch.color || element.color || "",
        text_color: sourceMatch.text_color || sourceMatch.textColor || element.text_color || "",
        text_size: sourceMatch.text_size || sourceMatch.textSize || element.text_size || element.textSize || undefined,
      };
    }),
  };
}

export function resolveEffectiveFloorPlan({ venueLayout, eventLayout, tables = [] }) {
  const normalizedEvent = normalizeFloorPlanLayout(eventLayout);
  if (normalizedEvent?.elements?.length) {
    return { layout: normalizedEvent, source: "event" };
  }
  const normalizedVenue = normalizeFloorPlanLayout(venueLayout);
  if (normalizedVenue?.elements?.length) {
    return { layout: normalizedVenue, source: "venue" };
  }
  return { layout: buildGeneratedFloorPlan(tables), source: "generated" };
}

export function getFloorPlanStateTableNumber(state = {}) {
  return Number(
    state?.table_number ??
      state?.tableNumber ??
      state?.number ??
      state?.table ??
      state?.table_id ??
      state?.tableId ??
      state?.reserved_table_number ??
      state?.reservedTableNumber ??
      state?.linked_table_number ??
      state?.linkedTableNumber ??
      state?.table?.table_number ??
      state?.table?.tableNumber ??
      state?.table?.number
  );
}

export function normalizeFloorPlanTableStatus(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!raw) return "available";

  if (
    raw === "checked_out" ||
    raw === "checkedout" ||
    raw === "checkout" ||
    raw === "closed" ||
    raw === "completed" ||
    raw === "cancelled" ||
    raw === "canceled" ||
    raw === "deleted" ||
    raw === "void"
  ) {
    return "available";
  }
  if (
    raw === "blocked" ||
    raw === "lock" ||
    raw === "locked" ||
    raw === "unavailable" ||
    raw === "disabled" ||
    raw === "hidden" ||
    raw === "maintenance" ||
    raw === "out_of_service"
  ) {
    return "blocked";
  }
  if (
    raw === "pending_bank_transfer" ||
    raw === "pending" ||
    raw === "awaiting_confirm" ||
    raw === "awaiting_confirmation" ||
    raw === "pending_confirmation" ||
    raw === "unconfirmed" ||
    raw === "hold" ||
    raw === "held" ||
    raw === "pending_hold" ||
    raw === "draft" ||
    raw === "new" ||
    raw === "created"
  ) {
    return "pending_hold";
  }
  if (
    raw === "occupied" ||
    raw === "checked_in" ||
    raw === "checkedin" ||
    raw === "busy" ||
    raw === "in_use" ||
    raw === "active" ||
    raw === "paid" ||
    raw === "preparing"
  ) {
    return "occupied";
  }
  if (
    raw === "reserved" ||
    raw === "reserve" ||
    raw === "reservation" ||
    raw === "confirmed" ||
    raw === "booking_confirm"
  ) {
    return "reserved";
  }
  if (raw === "available" || raw === "free" || raw === "open" || raw === "empty") {
    return "available";
  }

  if (raw.includes("block") || raw.includes("lock")) return "blocked";
  if (raw.includes("occup") || raw.includes("check_in") || raw.includes("checkedin")) return "occupied";
  if (raw.includes("pending") || raw.includes("unconfirm") || raw.includes("hold")) return "pending_hold";
  if (raw.includes("reserv") || raw.includes("confirm")) return "reserved";
  if (raw.includes("unavail")) return "blocked";
  return "available";
}

export function buildTableStateMap(tableStates = []) {
  const map = new Map();
  normalizeArray(tableStates).forEach((state) => {
    const tableKey = toTableKey(
      state?.table_number ??
        state?.tableNumber ??
        state?.number ??
        state?.table ??
        state?.table_id ??
        state?.tableId ??
        state?.reserved_table_number ??
        state?.reservedTableNumber ??
        state?.linked_table_number ??
        state?.linkedTableNumber ??
        state?.table?.table_number ??
        state?.table?.tableNumber ??
        state?.table?.number
    );
    if (!tableKey) return;
    const tableNumber = getFloorPlanStateTableNumber(state);
    map.set(tableKey, {
      ...(state && typeof state === "object" ? state : {}),
      table_number: Number.isFinite(tableNumber) && tableNumber > 0 ? tableNumber : state?.table_number ?? null,
      status: normalizeFloorPlanTableStatus(
        state?.status ??
          state?.table_status ??
          state?.tableStatus ??
          state?.availability_status ??
          state?.availabilityStatus ??
          state?.state
      ),
    });
  });
  return map;
}

export function buildFloorPlanElements(layout, tables = [], tableStates = []) {
  const normalizedLayout = normalizeFloorPlanLayout(layout) || buildGeneratedFloorPlan(tables);
  const tableMap = new Map(
    normalizeArray(tables)
      .map((table) => {
        const tableKey = toTableKey(
          table?.table_number ??
            table?.tableNumber ??
            table?.number ??
            table?.table ??
            table?.id
        );
        if (!tableKey) return null;
        return [tableKey, table];
      })
      .filter(Boolean)
  );
  const stateMap = buildTableStateMap(tableStates);

  return normalizedLayout.elements.map((element) => {
    const tableNumber = Number(element.table_number || element.tableNumber || 0);
    const linkedTableNumber = Number((getNormalizedTableLinkNumber(element) ?? tableNumber) || 0);
    const linkedTableKey = toTableKey(
      getNormalizedTableLinkNumber(element) ??
        element.table_number ??
        element.tableNumber ??
        tableNumber
    );
    const directTableKey = toTableKey(element.table_number ?? element.tableNumber ?? tableNumber);
    const table = tableMap.get(linkedTableKey) || tableMap.get(directTableKey) || null;
    const state = stateMap.get(linkedTableKey) || stateMap.get(directTableKey) || null;
    const lockLikeState = Boolean(
      table?.locked ??
        table?.is_locked ??
        table?.isLocked ??
        table?.unavailable ??
        table?.disabled ??
        state?.locked ??
        state?.is_locked ??
        state?.isLocked
    );
    const resolvedStatus =
      element.kind === "table"
        ? normalizeFloorPlanTableStatus(
            state?.status ??
              state?.table_status ??
              state?.tableStatus ??
              state?.availability_status ??
              state?.availabilityStatus ??
              state?.state ??
              (lockLikeState ? "blocked" : "available")
          )
        : "available";
    const rawElementName = asText(element.name, "");
    const fallbackTableNumber =
      Number(linkedTableNumber || table?.table_number || table?.number || tableNumber || 0) || 0;
    const resolvedTableName =
      asText(state?.label || table?.label, "") ||
      (fallbackTableNumber > 0 && (!rawElementName || isGenericTableName(rawElementName))
        ? `Table ${fallbackTableNumber}`
        : rawElementName);
    return {
      ...element,
      table,
      state,
      linked_table_number: linkedTableNumber || null,
      status: resolvedStatus,
      capacity:
        Number(table?.seats || table?.guests || state?.capacity || 0) ||
        Number(element.capacity || 0) ||
        0,
      zone: asText(table?.area ?? state?.zone ?? element.zone, ""),
      displayName:
        resolvedTableName ||
        (fallbackTableNumber ? `Table ${fallbackTableNumber}` : element.kind.replace(/_/g, " ")),
    };
  });
}

export function getFloorPlanLinkedTableNumber(element = {}) {
  return getNormalizedTableLinkNumber(element) ?? (asPositiveInt(element.table_number ?? element.tableNumber, 0) || null);
}

export function renumberFloorPlanTables(layout, options = {}) {
  const normalizedLayout = normalizeFloorPlanLayout(layout);
  if (!normalizedLayout?.elements?.length) return normalizedLayout;

  const numbering = resolveTableNumberingOptions(normalizedLayout, options);
  const tableElements = normalizedLayout.elements.filter((element) => element.kind === "table");
  if (!tableElements.length) return normalizedLayout;

  const rowClusterMap = buildAxisClusterMap(tableElements, "row", numbering.rowTolerance);
  const colClusterMap = buildAxisClusterMap(tableElements, "col", numbering.colTolerance);
  const primaryDescending =
    numbering.mode === "row-based" ? numbering.direction === "btt" : numbering.direction === "rtl";
  const secondaryDescending =
    numbering.mode === "row-based" ? numbering.direction === "rtl" : numbering.direction === "btt";
  const primaryClusterValues = [...new Set(tableElements.map((element) => {
    const primaryValue =
      numbering.mode === "row-based"
        ? rowClusterMap.get(String(element.id)) ?? Number(element.row || 0)
        : colClusterMap.get(String(element.id)) ?? Number(element.col || 0);
    return Number(primaryValue);
  }))].sort((a, b) => a - b);
  const primaryRankMap = new Map(
    primaryClusterValues.map((value, index) => [
      value,
      primaryDescending ? primaryClusterValues.length - 1 - index : index,
    ])
  );

  const orderedIds = [...tableElements]
    .sort((a, b) => {
      const aPrimary =
        numbering.mode === "row-based"
          ? rowClusterMap.get(String(a.id)) ?? Number(a.row || 0)
          : colClusterMap.get(String(a.id)) ?? Number(a.col || 0);
      const bPrimary =
        numbering.mode === "row-based"
          ? rowClusterMap.get(String(b.id)) ?? Number(b.row || 0)
          : colClusterMap.get(String(b.id)) ?? Number(b.col || 0);
      if (aPrimary !== bPrimary) {
        return primaryDescending ? bPrimary - aPrimary : aPrimary - bPrimary;
      }

      const primaryRank = primaryRankMap.get(Number(aPrimary)) ?? 0;
      const useAlternatingColumnDirection =
        numbering.mode === "column-based" && numbering.alternateColumns;
      const alternateSecondaryDescending =
        useAlternatingColumnDirection && primaryRank % 2 === 1
          ? !secondaryDescending
          : secondaryDescending;

      const aSecondary =
        numbering.mode === "row-based"
          ? colClusterMap.get(String(a.id)) ?? Number(a.col || 0)
          : rowClusterMap.get(String(a.id)) ?? Number(a.row || 0);
      const bSecondary =
        numbering.mode === "row-based"
          ? colClusterMap.get(String(b.id)) ?? Number(b.col || 0)
          : rowClusterMap.get(String(b.id)) ?? Number(b.row || 0);
      if (aSecondary !== bSecondary) {
        return alternateSecondaryDescending ? bSecondary - aSecondary : aSecondary - bSecondary;
      }

      const aStable = getTableSortNumber(a);
      const bStable = getTableSortNumber(b);
      if (aStable && bStable && aStable !== bStable) {
        return aStable - bStable;
      }
      return String(a.id).localeCompare(String(b.id));
    })
    .map((element) => String(element.id));

  const numberingMap = new Map(
    orderedIds.map((id, index) => [id, numbering.startNumber + index])
  );

  return {
    ...normalizedLayout,
    elements: normalizedLayout.elements.map((element) => {
      if (element.kind !== "table") return element;
      const nextNumber = numberingMap.get(String(element.id));
      if (!nextNumber) return element;
      const nextName = replaceTrailingNumber(element.name, nextNumber);
      const nextLabel = numbering.keepPrefix ? replaceTrailingNumber(element.label, nextNumber) : element.label;
      return {
        ...element,
        table_number: nextNumber,
        linked_table_number: getFloorPlanLinkedTableNumber(element) ?? nextNumber,
        name: nextName || element.name,
        label: nextLabel,
      };
    }),
  };
}

export function getFloorPlanStatusStyle(status) {
  return FLOOR_PLAN_STATUS_STYLES[status] || FLOOR_PLAN_STATUS_STYLES.available;
}

export function getFloorPlanTableScale(element = null, canvas = null) {
  const storedScale = Math.min(1.35, Math.max(0.15, asNumber(element?.visual_scale ?? element?.visualScale, 1)));
  return {
    scaleX: Math.min(1.35, Math.max(0.15, FLOOR_PLAN_TABLE_BASE_SCALE * storedScale)),
    scaleY: Math.min(1.35, Math.max(0.15, FLOOR_PLAN_TABLE_BASE_SCALE_Y * storedScale)),
  };
}

export function getFloorPlanElementFrame(element = null, canvas = null) {
  const resolvedCanvas = resolveFloorPlanCanvas(canvas || {});
  const col = Math.max(0, Number(element?.col || 0));
  const row = Math.max(0, Number(element?.row || 0));
  const offsetX = asNumber(element?.offset_x ?? element?.offsetX, 0);
  const offsetY = asNumber(element?.offset_y ?? element?.offsetY, 0);
  const colSpan = Math.max(1, Number(element?.col_span || element?.colSpan || 1));
  const rowSpan = Math.max(1, Number(element?.row_span || element?.rowSpan || 1));
  const stepX = Math.max(12, resolvedCanvas.cellSize - resolvedCanvas.tableGapX);
  const stepY = Math.max(12, resolvedCanvas.rowHeight - resolvedCanvas.tableGapY);
  const left = col * stepX + offsetX;
  const top = row * stepY + offsetY;
  const width = Math.max(24, asNumber(element?.width, colSpan * resolvedCanvas.cellSize));
  const height = Math.max(24, asNumber(element?.height, rowSpan * resolvedCanvas.rowHeight));

  return {
    left,
    top,
    width,
    height,
  };
}

export function getFloorPlanRenderSize(layout = null, elements = [], options = {}) {
  const resolvedCanvas = resolveFloorPlanCanvas(layout?.canvas || {});
  const sourceElements = Array.isArray(elements) && elements.length ? elements : layout?.elements || [];
  const preserveCanvasSize = Boolean(options.preserveCanvasSize);
  if (!sourceElements.length) {
    return {
      width: preserveCanvasSize ? resolvedCanvas.width : Math.max(resolvedCanvas.cellSize * 4, resolvedCanvas.width),
      height: preserveCanvasSize
        ? resolvedCanvas.height
        : Math.max(resolvedCanvas.rowHeight * 4, resolvedCanvas.height),
    };
  }

  const bounds = sourceElements.reduce(
    (acc, element) => {
      const frame = getFloorPlanElementFrame(element, resolvedCanvas);
      return {
        width: Math.max(acc.width, frame.left + frame.width),
        height: Math.max(acc.height, frame.top + frame.height),
      };
    },
    { width: 0, height: 0 }
  );

  return {
    width: preserveCanvasSize
      ? Math.max(resolvedCanvas.width, Math.ceil(bounds.width))
      : Math.max(resolvedCanvas.cellSize, Math.ceil(bounds.width)),
    height: preserveCanvasSize
      ? Math.max(resolvedCanvas.height, Math.ceil(bounds.height))
      : Math.max(resolvedCanvas.rowHeight, Math.ceil(bounds.height)),
  };
}

export function formatFloorPlanZoneLabel(zoneName) {
  return asText(zoneName, "Main Hall");
}

export function getFloorPlanZoneCategory(zoneName) {
  const value = getZoneMatchSource(zoneName);
  if (!value) return "main";
  if (/(vip|royal|diamond|gold|premium|platinum|front row)/.test(value)) return "premium";
  if (/(balcony|upper|mezzanine|level|terrace|gallery)/.test(value)) return "upper";
  if (/(private|lounge|box|suite|exclusive)/.test(value)) return "private";
  if (/(garden|outdoor|patio|terrace|beach|pool|rooftop)/.test(value)) return "outdoor";
  if (/(bar|service|staff|waiter|entrance|exit|foyer)/.test(value)) return "service";
  if (/(main|hall|floor|seated|regular|standard|center|centre|section|row)/.test(value)) return "main";
  return "other";
}

export function buildFloorPlanZoneGroups({ elements = [], tables = [] } = {}) {
  const zoneMap = new Map();
  const registerZone = (zoneName, count = 0) => {
    const label = formatFloorPlanZoneLabel(zoneName);
    const key = getZoneMatchSource(label) || "main hall";
    if (!zoneMap.has(key)) {
      const category = getFloorPlanZoneCategory(label);
      const swatch = FLOOR_PLAN_ZONE_SWATCHES[zoneMap.size % FLOOR_PLAN_ZONE_SWATCHES.length];
      zoneMap.set(key, {
        key,
        label,
        category,
        categoryLabel: FLOOR_PLAN_ZONE_CATEGORY_LABELS[category] || FLOOR_PLAN_ZONE_CATEGORY_LABELS.other,
        count: 0,
        swatch,
      });
    }
    zoneMap.get(key).count += count;
  };

  normalizeArray(tables).forEach((table) => registerZone(table?.area || table?.zone, 0));
  normalizeArray(elements)
    .filter((element) => element?.kind === "table")
    .forEach((element) => registerZone(element?.zone || element?.area, 1));

  const zones = [...zoneMap.values()].sort((a, b) => {
    const categoryDelta =
      FLOOR_PLAN_ZONE_CATEGORY_ORDER.indexOf(a.category) - FLOOR_PLAN_ZONE_CATEGORY_ORDER.indexOf(b.category);
    if (categoryDelta !== 0) return categoryDelta;
    return a.label.localeCompare(b.label);
  });

  return FLOOR_PLAN_ZONE_CATEGORY_ORDER
    .map((category) => ({
      key: category,
      label: FLOOR_PLAN_ZONE_CATEGORY_LABELS[category] || FLOOR_PLAN_ZONE_CATEGORY_LABELS.other,
      zones: zones.filter((zone) => zone.category === category),
    }))
    .filter((group) => group.zones.length > 0);
}

export function getTableRestrictionPreview({
  tableType = "regular",
  guestCount = 0,
  menCount = null,
  womenCount = null,
  capacity = 0,
}) {
  const normalizedGuestCount = asPositiveInt(guestCount, 0);
  const normalizedMen = menCount === null || menCount === "" ? null : asPositiveInt(menCount, 0);
  const normalizedWomen =
    womenCount === null || womenCount === "" ? null : asPositiveInt(womenCount, 0);
  if (tableType === "hidden") return { valid: false, reason: "Hidden table" };
  if (tableType === "disabled") return { valid: false, reason: "Table is disabled" };
  if (capacity > 0 && normalizedGuestCount > 0 && normalizedGuestCount > capacity) {
    return { valid: false, reason: `Capacity ${capacity}` };
  }
  if (
    ["couple", "mixed_only", "men_only", "women_only"].includes(tableType) &&
    (normalizedMen === null || normalizedWomen === null)
  ) {
    return { valid: false, reason: "Guest composition required" };
  }
  switch (tableType) {
    case "couple":
      if (
        normalizedGuestCount <= 0 ||
        normalizedGuestCount % 2 !== 0 ||
        normalizedMen !== normalizedWomen ||
        !normalizedMen
      ) {
        return { valid: false, reason: "Couples only" };
      }
      break;
    case "mixed_only":
      if (!normalizedMen || !normalizedWomen) {
        return { valid: false, reason: "Mixed groups only" };
      }
      break;
    case "men_only":
      if (!normalizedMen || normalizedWomen) {
        return { valid: false, reason: "Men only" };
      }
      break;
    case "women_only":
      if (!normalizedWomen || normalizedMen) {
        return { valid: false, reason: "Women only" };
      }
      break;
    default:
      break;
  }
  return { valid: true, reason: "" };
}
