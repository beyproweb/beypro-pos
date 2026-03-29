import React from "react";
import { Rnd } from "react-rnd";
import {
  getFloorPlanElementFrame,
  getFloorPlanRenderSize,
  getFloorPlanTableScale,
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

export default function FloorPlanCanvas({
  layout,
  elements = [],
  selectedIds = [],
  onSelect,
  onElementChange,
  onElementsMove,
}) {
  const canvas = resolveFloorPlanCanvas(layout?.canvas);
  const renderSize = React.useMemo(
    () => getFloorPlanRenderSize(layout, elements),
    [elements, layout]
  );
  const width = Number(renderSize.width || canvas.width || 1200);
  const height = Number(renderSize.height || canvas.height || 780);
  const cellSize = Math.max(24, Number(canvas.cellSize || canvas.gridSize || 84));
  const rowHeight = Math.max(24, Number(canvas.rowHeight || cellSize));
  const selectedIdSet = React.useMemo(
    () => new Set((selectedIds || []).map((value) => String(value))),
    [selectedIds]
  );

  return (
    <div className="overflow-auto rounded-[28px] border border-neutral-200 bg-white/90 p-3 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div
        className="relative mx-auto min-w-full rounded-[24px] border border-dashed border-neutral-300 bg-[linear-gradient(0deg,rgba(255,255,255,0.96),rgba(255,255,255,0.96)),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.04)_1px,transparent_1px)] shadow-inner dark:border-neutral-700 dark:bg-[linear-gradient(0deg,rgba(10,10,11,0.96),rgba(10,10,11,0.96)),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)]"
        style={{
          width,
          height,
          backgroundSize: `${cellSize}px ${rowHeight}px`,
        }}
      >
        {elements.map((element) => {
          const isSelected = selectedIdSet.has(String(element.id));
          const isTable = element.kind === "table";
          const frame = getFloorPlanElementFrame(element, canvas);
          const visualScale = isTable ? getFloorPlanTableScale(element, canvas) : null;
          const stepX = Math.max(12, cellSize - Number(canvas.tableGapX || 0));
          const stepY = Math.max(12, rowHeight - Number(canvas.tableGapY || 0));
          const offsetX = Number(element.offset_x || 0);
          const offsetY = Number(element.offset_y || 0);
          const resizeGrid = isTable ? [cellSize, rowHeight] : [8, 8];
          const minWidth = isTable ? cellSize : 24;
          const minHeight = isTable ? rowHeight : 24;
          const contentTransform = isTable
            ? `rotate(${Number(element.rotation || 0)}deg) scale(${visualScale.scaleX}, ${visualScale.scaleY})`
            : `rotate(${Number(element.rotation || 0)}deg)`;
          return (
            <Rnd
              key={element.id}
              bounds="parent"
              size={{ width: frame.width, height: frame.height }}
              position={{ x: frame.left, y: frame.top }}
              dragGrid={[stepX, stepY]}
              resizeGrid={resizeGrid}
              minWidth={minWidth}
              minHeight={minHeight}
              onDragStop={(event, data) => {
                const nextCol = toGridIndex(data.x - offsetX, stepX);
                const nextRow = toGridIndex(data.y - offsetY, stepY);
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
                const nextWidth = Math.max(minWidth, ref.offsetWidth);
                const nextHeight = Math.max(minHeight, ref.offsetHeight);
                onElementChange?.(element.id, {
                  col: toGridIndex(position.x - offsetX, stepX),
                  row: toGridIndex(position.y - offsetY, stepY),
                  col_span: Math.max(1, Math.ceil(nextWidth / cellSize)),
                  row_span: Math.max(1, Math.ceil(nextHeight / rowHeight)),
                  width: nextWidth,
                  height: nextHeight,
                });
              }}
              onClick={(event) =>
                onSelect?.(element.id, {
                  toggle: Boolean(event.metaKey || event.ctrlKey || event.shiftKey),
                })
              }
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
                  borderColor: isSelected ? "#0ea5e9" : "#d4d4d8",
                  backgroundColor: element.color || undefined,
                  boxShadow: isSelected
                    ? "inset 0 0 0 3px rgba(103,232,249,0.92), 0 10px 18px rgba(15,23,42,0.14)"
                    : undefined,
                }}
              >
                <div className="flex h-full w-full flex-col items-center justify-center px-2 text-center">
                  <div className="max-w-full overflow-hidden break-words text-[11px] font-semibold uppercase leading-tight tracking-[0.14em]">
                    {element.kind === "table"
                      ? element.name || (element.table_number ? `Table ${element.table_number}` : "Table")
                      : element.text || element.label || element.name}
                  </div>
                  {isTable ? (
                    <div className="mt-1 text-[11px] opacity-80">
                      {element.capacity ? `${element.capacity} guests` : element.zone || "Unassigned"}
                    </div>
                  ) : null}
                </div>
              </div>
            </Rnd>
          );
        })}
      </div>
    </div>
  );
}
