import React from "react";
import { Rnd } from "react-rnd";
import {
  getFloorPlanElementFrame,
  getFloorPlanMapOffset,
  getFloorPlanMapScale,
  getFloorPlanRenderSize,
  getFloorPlanTableNumberSize,
  getFloorPlanTableScale,
  isFloorPlanLayoutLocked,
  resolveFloorPlanCanvas,
} from "../utils/floorPlan";

function toGridIndex(value, unit) {
  const safeUnit = Math.max(1, Number(unit) || 1);
  return Math.max(0, Math.round(Number(value || 0) / safeUnit));
}

function shapeClass(shape = "circle") {
  switch (shape) {
    case "square":
      return "rounded-[16px]";
    case "rectangle":
      return "rounded-[18px]";
    case "oval":
      return "rounded-[999px]";
    default:
      return "rounded-full";
  }
}

function baseKindStyle(kind) {
  switch (kind) {
    case "stage":
      return "bg-slate-900 text-white";
    case "bar":
      return "bg-amber-500 text-slate-950";
    case "dance_floor":
      return "bg-fuchsia-100 text-fuchsia-950";
    case "wall":
      return "bg-neutral-300 text-neutral-800";
    case "no_go":
      return "bg-rose-100 text-rose-900";
    default:
      return "bg-white text-neutral-900";
  }
}

function rotatePoint(x, y, centerX, centerY, angleDegrees) {
  const radians = (Number(angleDegrees || 0) * Math.PI) / 180;
  if (!radians) {
    return { x, y };
  }
  const dx = x - centerX;
  const dy = y - centerY;
  const cos = Math.cos(-radians);
  const sin = Math.sin(-radians);
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

function getElementHitMetrics(element, canvas) {
  const frame = getFloorPlanElementFrame(element, canvas);
  const isTable = element.kind === "table";
  const visualScale = isTable ? getFloorPlanTableScale(element, canvas) : { scaleX: 1, scaleY: 1 };
  const centerX = frame.left + frame.width / 2;
  const centerY = frame.top + frame.height / 2;
  return {
    element,
    frame,
    centerX,
    centerY,
    width: frame.width * Number(visualScale.scaleX || 1),
    height: frame.height * Number(visualScale.scaleY || 1),
    rotation: Number(element.rotation || 0),
    shape: isTable ? element.shape || "circle" : "rectangle",
  };
}

function getHitScore(metrics, pointX, pointY) {
  const rotatedPoint = rotatePoint(
    pointX,
    pointY,
    metrics.centerX,
    metrics.centerY,
    metrics.rotation
  );
  const localX = rotatedPoint.x - metrics.centerX;
  const localY = rotatedPoint.y - metrics.centerY;
  const halfWidth = Math.max(1, metrics.width / 2);
  const halfHeight = Math.max(1, metrics.height / 2);

  if (metrics.shape === "circle" || metrics.shape === "oval") {
    const ellipseScore = (localX * localX) / (halfWidth * halfWidth) + (localY * localY) / (halfHeight * halfHeight);
    return ellipseScore <= 1 ? ellipseScore : null;
  }

  if (Math.abs(localX) <= halfWidth && Math.abs(localY) <= halfHeight) {
    return Math.max(Math.abs(localX) / halfWidth, Math.abs(localY) / halfHeight);
  }

  return null;
}

export default function FloorPlanCanvas({
  layout,
  elements = [],
  selectedIds = [],
  onSelect,
  onElementChange,
  onElementsMove,
  onLayoutOffsetChange,
}) {
  const canvas = resolveFloorPlanCanvas(layout?.canvas);
  const centerWholeMap = Boolean(layout?.metadata?.center_whole_map ?? layout?.metadata?.centerWholeMap);
  const layoutLocked = isFloorPlanLayoutLocked(layout);
  const mapOffsetX = getFloorPlanMapOffset(layout, "x", 0);
  const mapOffsetY = getFloorPlanMapOffset(layout, "y", 0);
  const mapScale = getFloorPlanMapScale(layout, 1);
  const tableNumberSize = getFloorPlanTableNumberSize(layout, 1);
  const renderSize = React.useMemo(
    () => getFloorPlanRenderSize(layout, elements, { preserveCanvasSize: centerWholeMap }),
    [centerWholeMap, elements, layout]
  );
  const baseWidth = Number(renderSize.width || canvas.width || 1200);
  const baseHeight = Number(renderSize.height || canvas.height || 780);
  const width = Math.max(1, Math.round(baseWidth * mapScale));
  const height = Math.max(1, Math.round(baseHeight * mapScale));
  const cellSize = Math.max(24, Number(canvas.cellSize || canvas.gridSize || 84));
  const rowHeight = Math.max(24, Number(canvas.rowHeight || cellSize));
  const selectedIdSet = React.useMemo(
    () => new Set((selectedIds || []).map((value) => String(value))),
    [selectedIds]
  );
  const [dragOffset, setDragOffset] = React.useState({ x: mapOffsetX, y: mapOffsetY });
  const [isDraggingLayout, setIsDraggingLayout] = React.useState(false);
  const dragStateRef = React.useRef(null);
  const dragOffsetRef = React.useRef({ x: mapOffsetX, y: mapOffsetY });
  const suppressLockedClickRef = React.useRef(false);

  React.useEffect(() => {
    if (dragStateRef.current?.active) return;
    const nextOffset = { x: mapOffsetX, y: mapOffsetY };
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  }, [mapOffsetX, mapOffsetY]);

  React.useEffect(() => {
    if (!layoutLocked) {
      dragStateRef.current = null;
      return undefined;
    }

    const handleWindowMouseMove = (event) => {
      const state = dragStateRef.current;
      if (!state?.active) return;
      const deltaX = event.clientX - state.startClientX;
      const deltaY = event.clientY - state.startClientY;
      const nextOffset = {
        x: state.startOffsetX + deltaX / Math.max(mapScale, 0.01),
        y: state.startOffsetY + deltaY / Math.max(mapScale, 0.01),
      };
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        state.moved = true;
      }
      dragOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);
    };

    const handleWindowMouseUp = () => {
      const state = dragStateRef.current;
      if (!state?.active) return;
      dragStateRef.current = null;
      setIsDraggingLayout(false);
      if (state.moved) {
        suppressLockedClickRef.current = true;
        onLayoutOffsetChange?.(dragOffsetRef.current.x, dragOffsetRef.current.y);
        return;
      }
      const nextOffset = { x: mapOffsetX, y: mapOffsetY };
      dragOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [layoutLocked, mapOffsetX, mapOffsetY, mapScale, onLayoutOffsetChange]);
  const hitMetrics = React.useMemo(
    () => elements.map((element) => getElementHitMetrics(element, canvas)),
    [canvas, elements]
  );
  const occupiedBounds = React.useMemo(() => {
    if (!elements.length) {
      return { minLeft: 0, minTop: 0, width: baseWidth, height: baseHeight };
    }
    const logicalCellWidth = Math.max(24, Number(canvas.cellSize || canvas.gridSize || 84));
    const logicalRowHeight = Math.max(24, Number(canvas.rowHeight || logicalCellWidth));
    const bounds = elements.reduce(
      (acc, element) => {
        const frame = getFloorPlanElementFrame(element, canvas);
        if (element.kind === "table") {
          const tableScale = getFloorPlanTableScale(element, canvas);
          const scaledWidth = frame.width * Number(tableScale.scaleX || 1);
          const scaledHeight = frame.height * Number(tableScale.scaleY || 1);
          const visibleLeft = frame.left + (frame.width - scaledWidth) / 2;
          const visibleTop = frame.top + (frame.height - scaledHeight) / 2;
          const visibleRight = visibleLeft + scaledWidth;
          const visibleBottom = visibleTop + scaledHeight;
          return {
            minLeft: Math.min(acc.minLeft, visibleLeft),
            minTop: Math.min(acc.minTop, visibleTop),
            maxRight: Math.max(acc.maxRight, visibleRight),
            maxBottom: Math.max(acc.maxBottom, visibleBottom),
          };
        }
        const logicalWidth = Math.max(
          24,
          Math.max(1, Number(element.col_span || element.colSpan || 1)) * logicalCellWidth
        );
        const logicalHeight = Math.max(
          24,
          Math.max(1, Number(element.row_span || element.rowSpan || 1)) * logicalRowHeight
        );
        return {
          minLeft: Math.min(acc.minLeft, frame.left),
          minTop: Math.min(acc.minTop, frame.top),
          maxRight: Math.max(acc.maxRight, frame.left + logicalWidth),
          maxBottom: Math.max(acc.maxBottom, frame.top + logicalHeight),
        };
      },
      { minLeft: Number.POSITIVE_INFINITY, minTop: Number.POSITIVE_INFINITY, maxRight: 0, maxBottom: 0 }
    );
    return {
      minLeft: Number.isFinite(bounds.minLeft) ? bounds.minLeft : 0,
      minTop: Number.isFinite(bounds.minTop) ? bounds.minTop : 0,
      width: Math.max(1, bounds.maxRight - (Number.isFinite(bounds.minLeft) ? bounds.minLeft : 0)),
      height: Math.max(1, bounds.maxBottom - (Number.isFinite(bounds.minTop) ? bounds.minTop : 0)),
    };
  }, [baseHeight, baseWidth, canvas, elements]);
  const contentOffsetX = centerWholeMap ? Math.max(0, (baseWidth - occupiedBounds.width) / 2 - occupiedBounds.minLeft) : 0;
  const contentOffsetY = centerWholeMap ? Math.max(0, (baseHeight - occupiedBounds.height) / 2 - occupiedBounds.minTop) : 0;

  const resolveCanvasPoint = React.useCallback(
    (eventLike, offset = dragOffset) => {
      const bounds = eventLike.currentTarget.getBoundingClientRect();
      return {
        x: (eventLike.clientX - bounds.left) / Math.max(mapScale, 0.01) - contentOffsetX - offset.x,
        y: (eventLike.clientY - bounds.top) / Math.max(mapScale, 0.01) - contentOffsetY - offset.y,
      };
    },
    [contentOffsetX, contentOffsetY, dragOffset, mapScale]
  );

  const selectElementAtPoint = React.useCallback(
    (pointX, pointY, options = {}) => {
      const scoredHits = hitMetrics
        .map((metrics) => ({
          id: metrics.element.id,
          score: getHitScore(metrics, pointX, pointY),
        }))
        .filter((entry) => entry.score !== null)
        .sort((a, b) => a.score - b.score);

      if (scoredHits.length > 0) {
        onSelect?.(scoredHits[0].id, options);
        return;
      }

      const frameHit = [...hitMetrics]
        .reverse()
        .find(({ frame }) => (
          pointX >= frame.left &&
          pointX <= frame.left + frame.width &&
          pointY >= frame.top &&
          pointY <= frame.top + frame.height
        ));

      if (frameHit) {
        onSelect?.(frameHit.element.id, options);
        return;
      }

      onSelect?.("", { toggle: false });
    },
    [hitMetrics, onSelect]
  );

  const handleCanvasMouseDownCapture = React.useCallback(
    (event) => {
      if (event.button !== 0) return;
      if (layoutLocked) {
        event.preventDefault();
        setIsDraggingLayout(true);
        dragStateRef.current = {
          active: true,
          moved: false,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startOffsetX: dragOffset.x,
          startOffsetY: dragOffset.y,
        };
        return;
      }

      const point = resolveCanvasPoint(event, { x: mapOffsetX, y: mapOffsetY });
      selectElementAtPoint(point.x, point.y, {
        toggle: Boolean(event.metaKey || event.ctrlKey || event.shiftKey),
      });
    },
    [dragOffset.x, dragOffset.y, layoutLocked, mapOffsetX, mapOffsetY, resolveCanvasPoint, selectElementAtPoint]
  );

  const handleCanvasClick = React.useCallback(
    (event) => {
      if (!layoutLocked) return;
      if (suppressLockedClickRef.current) {
        suppressLockedClickRef.current = false;
        return;
      }
      const point = resolveCanvasPoint(event, dragOffset);
      selectElementAtPoint(point.x, point.y, {
          toggle: Boolean(event.metaKey || event.ctrlKey || event.shiftKey),
        });
    },
    [dragOffset, layoutLocked, resolveCanvasPoint, selectElementAtPoint]
  );

  return (
    <div className="overflow-auto rounded-[28px] border border-neutral-200 bg-white/90 p-3 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div
        className="relative mx-auto rounded-[24px] border border-dashed border-neutral-300 bg-[linear-gradient(0deg,rgba(255,255,255,0.96),rgba(255,255,255,0.96)),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.04)_1px,transparent_1px)] shadow-inner dark:border-neutral-700 dark:bg-[linear-gradient(0deg,rgba(10,10,11,0.96),rgba(10,10,11,0.96)),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)]"
        onMouseDownCapture={handleCanvasMouseDownCapture}
        onClick={handleCanvasClick}
        style={{
          width,
          height,
          backgroundSize: `${cellSize * mapScale}px ${rowHeight * mapScale}px`,
          cursor: layoutLocked ? (isDraggingLayout ? "grabbing" : "grab") : undefined,
        }}
      >
        {elements.map((element) => {
          const isSelected = selectedIdSet.has(String(element.id));
          const isTable = element.kind === "table";
          const frame = getFloorPlanElementFrame(element, canvas);
          const logicalWidth = Math.max(
            24,
            Math.max(1, Number(element.col_span || element.colSpan || 1)) * cellSize
          );
          const logicalHeight = Math.max(
            24,
            Math.max(1, Number(element.row_span || element.rowSpan || 1)) * rowHeight
          );
          const visualScale = isTable ? getFloorPlanTableScale(element, canvas) : null;
          const scaleX = Number(visualScale?.scaleX || 1);
          const scaleY = Number(visualScale?.scaleY || 1);
          const stepX = Math.max(12, cellSize - Number(canvas.tableGapX || 0));
          const stepY = Math.max(12, rowHeight - Number(canvas.tableGapY || 0));
          const offsetX = Number(element.offset_x || 0);
          const offsetY = Number(element.offset_y || 0);
          const renderWidth = isTable ? frame.width * scaleX : frame.width;
          const renderHeight = isTable ? frame.height * scaleY : frame.height;
          const renderShiftX = isTable
            ? (frame.width - renderWidth) / 2
            : (logicalWidth - frame.width) / 2;
          const renderShiftY = isTable
            ? (frame.height - renderHeight) / 2
            : (logicalHeight - frame.height) / 2;
          const resizeGrid = isTable ? [Math.max(8, cellSize * scaleX), Math.max(8, rowHeight * scaleY)] : [8, 8];
          const minWidth = isTable ? Math.max(24, cellSize * scaleX) : 24;
          const minHeight = isTable ? Math.max(24, rowHeight * scaleY) : 24;
          const contentTransform = isTable
            ? `rotate(${Number(element.rotation || 0)}deg)`
            : `rotate(${Number(element.rotation || 0)}deg)`;
          return (
            <Rnd
              key={element.id}
              bounds="parent"
              size={{ width: renderWidth * mapScale, height: renderHeight * mapScale }}
              position={{
                x: (frame.left + renderShiftX + contentOffsetX + dragOffset.x) * mapScale,
                y: (frame.top + renderShiftY + contentOffsetY + dragOffset.y) * mapScale,
              }}
              style={{ zIndex: isSelected ? 20 : 1 }}
              dragGrid={[stepX * mapScale, stepY * mapScale]}
              resizeGrid={resizeGrid.map((value) => value * mapScale)}
              minWidth={minWidth * mapScale}
              minHeight={minHeight * mapScale}
              disableDragging={layoutLocked}
              enableResizing={!layoutLocked}
              onDragStop={(event, data) => {
                const nextCol = toGridIndex(
                  data.x / Math.max(mapScale, 0.01) - contentOffsetX - dragOffset.x - offsetX - renderShiftX,
                  stepX
                );
                const nextRow = toGridIndex(
                  data.y / Math.max(mapScale, 0.01) - contentOffsetY - dragOffset.y - offsetY - renderShiftY,
                  stepY
                );
                if ((selectedIds || []).length > 1) {
                  onElementsMove?.(element.id, nextCol, nextRow);
                  return;
                }
                onElementChange?.(element.id, {
                  col: nextCol,
                  row: nextRow,
                });
              }}
              onResizeStop={(event, direction, ref, delta, position) => {
                const nextWidth = Math.max(minWidth, ref.offsetWidth / Math.max(mapScale, 0.01));
                const nextHeight = Math.max(minHeight, ref.offsetHeight / Math.max(mapScale, 0.01));
                const storedWidth = isTable ? nextWidth / Math.max(scaleX, 0.01) : nextWidth;
                const storedHeight = isTable ? nextHeight / Math.max(scaleY, 0.01) : nextHeight;
                onElementChange?.(element.id, {
                  col: toGridIndex(
                    position.x / Math.max(mapScale, 0.01) - contentOffsetX - dragOffset.x - offsetX - renderShiftX,
                    stepX
                  ),
                  row: toGridIndex(
                    position.y / Math.max(mapScale, 0.01) - contentOffsetY - dragOffset.y - offsetY - renderShiftY,
                    stepY
                  ),
                  col_span: Math.max(1, Math.ceil(storedWidth / cellSize)),
                  row_span: Math.max(1, Math.ceil(storedHeight / rowHeight)),
                  width: storedWidth,
                  height: storedHeight,
                });
              }}
              className="overflow-visible"
            >
              <div
                className={[
                  "flex h-full w-full overflow-hidden border-2 shadow-md transition",
                  isTable ? shapeClass(element.shape) : "rounded-[20px]",
                  baseKindStyle(element.kind),
                ].join(" ")}
                style={{
                  transform: contentTransform,
                  transformOrigin: "center center",
                  pointerEvents: "none",
                  borderColor: isSelected ? "#2563eb" : "#d4d4d8",
                  borderWidth: isSelected ? "4px" : undefined,
                  backgroundColor: element.color || undefined,
                  boxShadow: isSelected
                    ? "0 0 0 5px rgba(37,99,235,0.18), 0 12px 24px rgba(15,23,42,0.16)"
                    : undefined,
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center">
                  <div
                    className="max-w-full overflow-hidden break-words text-[14px] font-semibold leading-tight tracking-[0.08em]"
                    style={
                      isTable
                        ? { fontSize: `${Math.max(12, 14 * tableNumberSize)}px` }
                        : {
                            color: element.text_color || undefined,
                            fontSize: `${Math.max(10, Number(element.text_size || (element.kind === "label" ? 16 : 14)) * mapScale)}px`,
                          }
                    }
                  >
                    {element.kind === "table"
                      ? element.table_number || element.name || "-"
                      : element.text || element.label || element.name}
                  </div>
                </div>
              </div>
            </Rnd>
          );
        })}
      </div>
    </div>
  );
}
