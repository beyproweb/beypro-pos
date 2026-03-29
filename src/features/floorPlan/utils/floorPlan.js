const DEFAULT_CANVAS = {
  width: 1008,
  height: 672,
  gridSize: 84,
  cellSize: 84,
  rowHeight: 84,
  columns: 12,
  rows: 8,
};

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

function asText(value, fallback = "") {
  const next = String(value ?? "").trim();
  return next || fallback;
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

function normalizeArray(values) {
  return Array.isArray(values) ? values : [];
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
    tableGapX: Math.min(48, Math.max(0, asNumber(canvas.table_gap_x ?? canvas.tableGapX, 0))),
    tableGapY: Math.min(48, Math.max(0, asNumber(canvas.table_gap_y ?? canvas.tableGapY, 0))),
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

  const maxCol = Math.max(...shifted.map((element) => Number(element.col || 0) + Number(element.col_span || 1)));
  const maxRow = Math.max(...shifted.map((element) => Number(element.row || 0) + Number(element.row_span || 1)));
  const columns = Math.max(4, asPositiveInt(layout?.canvas?.columns, 0), maxCol);
  const rows = Math.max(4, asPositiveInt(layout?.canvas?.rows, 0), maxRow);

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
      tableGapX: Math.min(48, Math.max(0, asNumber(layout?.canvas?.tableGapX ?? layout?.canvas?.table_gap_x, 0))),
      tableGapY: Math.min(48, Math.max(0, asNumber(layout?.canvas?.tableGapY ?? layout?.canvas?.table_gap_y, 0))),
    },
    elements: shifted,
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
    zone: asText(element.zone || element.area, ""),
    capacity: asPositiveInt(element.capacity ?? element.seats ?? element.guest_limit, 0),
    table_number: asPositiveInt(element.table_number ?? element.tableNumber, 0) || null,
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
    metadata:
      layout.metadata && typeof layout.metadata === "object" && !Array.isArray(layout.metadata)
        ? layout.metadata
        : {},
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

export function buildTableStateMap(tableStates = []) {
  return new Map(
    normalizeArray(tableStates)
      .map((state) => [Number(state?.table_number), state])
      .filter(([tableNumber]) => Number.isFinite(tableNumber) && tableNumber > 0)
  );
}

export function buildFloorPlanElements(layout, tables = [], tableStates = []) {
  const normalizedLayout = normalizeFloorPlanLayout(layout) || buildGeneratedFloorPlan(tables);
  const tableMap = new Map(
    normalizeArray(tables)
      .map((table) => [Number(table?.table_number ?? table?.number), table])
      .filter(([tableNumber]) => Number.isFinite(tableNumber) && tableNumber > 0)
  );
  const stateMap = buildTableStateMap(tableStates);

  return normalizedLayout.elements.map((element) => {
    const tableNumber = Number(element.table_number || 0);
    const table = tableMap.get(tableNumber) || null;
    const state = stateMap.get(tableNumber) || null;
    return {
      ...element,
      table,
      state,
      status: state?.status || (element.kind === "table" ? "available" : "available"),
      capacity:
        Number(element.capacity || 0) ||
        Number(table?.seats || table?.guests || state?.capacity || 0) ||
        0,
      zone: asText(element.zone || state?.zone || table?.area, ""),
      displayName:
        asText(element.name || state?.label || table?.label) ||
        (tableNumber ? `Table ${tableNumber}` : element.kind.replace(/_/g, " ")),
    };
  });
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
      : Math.max(resolvedCanvas.cellSize * 4, Math.ceil(bounds.width)),
    height: preserveCanvasSize
      ? Math.max(resolvedCanvas.height, Math.ceil(bounds.height))
      : Math.max(resolvedCanvas.rowHeight * 4, Math.ceil(bounds.height)),
  };
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
