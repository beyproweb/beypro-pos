import React from "react";
import { useTranslation } from "react-i18next";
import {
  getFloorPlanElementFrame,
  getFloorPlanLinkedTableNumber,
  getFloorPlanMapOffset,
  getFloorPlanRenderSize,
  getFloorPlanStatusStyle,
  getFloorPlanTableNumberSize,
  getFloorPlanTableScale,
  resolveFloorPlanCanvas,
} from "../utils/floorPlan";

function renderShape(shape = "circle") {
  switch (shape) {
    case "square":
      return "rounded-[18px]";
    case "rectangle":
      return "rounded-[20px]";
    case "oval":
      return "rounded-[999px]";
    case "circle":
    default:
      return "rounded-full";
  }
}

export default function FloorPlanView({
  layout,
  elements = [],
  boundsElements = null,
  selectedTableNumber = null,
  deemphasizedElementIds = [],
  onTableClick,
  interactive = true,
  useFullCanvas = false,
  showCanvasOutline = true,
  compactPadding = false,
  viewportPadding = 0,
  scrollMode = "both",
  statusStyleOverrides = null,
}) {
  const { t } = useTranslation();
  const deemphasizedIdSet = React.useMemo(
    () => new Set((Array.isArray(deemphasizedElementIds) ? deemphasizedElementIds : []).map((value) => String(value))),
    [deemphasizedElementIds]
  );
  const centerWholeMap = Boolean(layout?.metadata?.center_whole_map ?? layout?.metadata?.centerWholeMap);
  const mapOffsetX = getFloorPlanMapOffset(layout, "x", 0);
  const mapOffsetY = getFloorPlanMapOffset(layout, "y", 0);
  const tableNumberSize = getFloorPlanTableNumberSize(layout, 1);
  const resolvedViewportPadding = React.useMemo(() => {
    if (viewportPadding && typeof viewportPadding === "object") {
      const base = Math.max(0, Number(viewportPadding.base ?? viewportPadding.all ?? 0) || 0);
      return {
        top: Math.max(base, Number(viewportPadding.top ?? base) || 0),
        right: Math.max(base, Number(viewportPadding.right ?? viewportPadding.x ?? base) || 0),
        bottom: Math.max(base, Number(viewportPadding.bottom ?? viewportPadding.y ?? base) || 0),
        left: Math.max(base, Number(viewportPadding.left ?? viewportPadding.x ?? base) || 0),
      };
    }

    const uniform = Math.max(0, Number(viewportPadding) || 0);
    return {
      top: uniform,
      right: uniform,
      bottom: uniform,
      left: uniform,
    };
  }, [viewportPadding]);
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const canvas = React.useMemo(() => resolveFloorPlanCanvas(layout?.canvas), [layout?.canvas]);
  const measurementElements = Array.isArray(boundsElements) && boundsElements.length ? boundsElements : elements;
  const renderSize = React.useMemo(
    () =>
      getFloorPlanRenderSize(layout, measurementElements, {
        preserveCanvasSize: useFullCanvas || centerWholeMap,
      }),
    [centerWholeMap, layout, measurementElements, useFullCanvas]
  );
  const occupiedBounds = React.useMemo(() => {
    if (!Array.isArray(measurementElements) || !measurementElements.length) {
      const fallback = getFloorPlanRenderSize(layout, measurementElements);
      return {
        minLeft: 0,
        minTop: 0,
        width: Number(fallback.width || canvas.width || 1200),
        height: Number(fallback.height || canvas.height || 780),
      };
    }

    const logicalCellWidth = Math.max(24, Number(canvas.cellSize || canvas.gridSize || 84));
    const logicalRowHeight = Math.max(24, Number(canvas.rowHeight || logicalCellWidth));

    const bounds = measurementElements.reduce(
      (acc, element) => {
        const frame = getFloorPlanElementFrame(element, canvas);
        if (element.kind === "table") {
          const tableScale = getFloorPlanTableScale(element, canvas);
          const scaledWidth = frame.width * tableScale.scaleX;
          const scaledHeight = frame.height * tableScale.scaleY;
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
      {
        minLeft: Number.POSITIVE_INFINITY,
        minTop: Number.POSITIVE_INFINITY,
        maxRight: 0,
        maxBottom: 0,
      }
    );

    return {
      minLeft: Number.isFinite(bounds.minLeft) ? bounds.minLeft : 0,
      minTop: Number.isFinite(bounds.minTop) ? bounds.minTop : 0,
      width: Math.max(1, Math.ceil(bounds.maxRight - (Number.isFinite(bounds.minLeft) ? bounds.minLeft : 0))),
      height: Math.max(1, Math.ceil(bounds.maxBottom - (Number.isFinite(bounds.minTop) ? bounds.minTop : 0))),
    };
  }, [canvas, layout, measurementElements]);
  const viewBounds = React.useMemo(
    () =>
      useFullCanvas || centerWholeMap
        ? {
            minLeft: 0,
            minTop: 0,
            width: Number(renderSize.width || canvas.width || 1200),
            height: Number(renderSize.height || canvas.height || 780),
          }
        : {
            minLeft: occupiedBounds.minLeft - resolvedViewportPadding.left,
            minTop: occupiedBounds.minTop - resolvedViewportPadding.top,
            width: occupiedBounds.width + resolvedViewportPadding.left + resolvedViewportPadding.right,
            height: occupiedBounds.height + resolvedViewportPadding.top + resolvedViewportPadding.bottom,
          },
    [canvas.height, canvas.width, centerWholeMap, occupiedBounds, renderSize.height, renderSize.width, resolvedViewportPadding, useFullCanvas]
  );
  const width = Number(viewBounds.width || canvas.width || 1200);
  const height = Number(viewBounds.height || canvas.height || 780);
  const contentOffsetX = centerWholeMap && !useFullCanvas
    ? Math.max(0, (width - occupiedBounds.width) / 2 - occupiedBounds.minLeft)
    : 0;
  const contentOffsetY = centerWholeMap && !useFullCanvas
    ? Math.max(0, (height - occupiedBounds.height) / 2 - occupiedBounds.minTop)
    : 0;
  const cellSize = Number(canvas.cellSize || canvas.gridSize || 84);
  const rowHeight = Number(canvas.rowHeight || cellSize);
  const scale = containerWidth > 0 ? Math.min(1, containerWidth / width) : 1;
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const scaledCellSize = Math.max(12, cellSize * scale);
  const scaledRowHeight = Math.max(12, rowHeight * scale);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => {
      setContainerWidth(Math.max(0, node.clientWidth - (compactPadding ? 0 : 24)));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const overflowClass =
    scrollMode === "horizontal"
      ? "overflow-x-auto overflow-y-visible"
      : scrollMode === "none"
        ? "overflow-visible"
        : "overflow-auto";

  if (!layout) return null;

  return (
    <div
      ref={containerRef}
      className={[
        overflowClass,
        compactPadding
          ? "rounded-none border-0 bg-transparent p-0"
          : "bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(244,244,245,0.98))] dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.55),_rgba(9,9,11,0.95))] rounded-[28px] border border-neutral-200 p-3 dark:border-neutral-800",
      ].join(" ")}
    >
      <div
        className="relative mx-auto"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <div
          className={[
            "absolute left-0 top-0 bg-white dark:bg-white",
            compactPadding ? "rounded-none" : "rounded-[24px]",
            showCanvasOutline ? "border border-dashed border-neutral-300 dark:border-neutral-700" : "border-0",
          ].join(" ")}
          style={{
            width: scaledWidth,
            height: scaledHeight,
            backgroundSize: `${scaledCellSize}px ${scaledRowHeight}px`,
            boxShadow: compactPadding
              ? "0 24px 60px rgba(15,23,42,0.10), 0 4px 16px rgba(15,23,42,0.06)"
              : undefined,
          }}
        >
          {elements.map((element) => {
            const isTable = element.kind === "table";
            const isDeemphasized = deemphasizedIdSet.has(String(element.id));
            const selectedNumber = Number(selectedTableNumber || 0);
            const linkedTableNumber = Number(getFloorPlanLinkedTableNumber(element) || 0);
            const visibleTableNumber = Number(linkedTableNumber || element.table_number || 0);
            const isSelected =
              isTable &&
              selectedNumber > 0 &&
              (visibleTableNumber === selectedNumber || linkedTableNumber === selectedNumber);
            const resolvedStatus = String(element.status || "available").toLowerCase();
            const style = {
              ...getFloorPlanStatusStyle(resolvedStatus),
              ...(statusStyleOverrides && typeof statusStyleOverrides === "object"
                ? statusStyleOverrides[resolvedStatus] || null
                : null),
            };
            const tableScale = isTable ? getFloorPlanTableScale(element, canvas) : null;
            const frame = getFloorPlanElementFrame(element, canvas);
            const logicalWidth = Math.max(
              24,
              Math.max(1, Number(element.col_span || element.colSpan || 1)) * cellSize
            );
            const logicalHeight = Math.max(
              24,
              Math.max(1, Number(element.row_span || element.rowSpan || 1)) * rowHeight
            );
            const nonTableLeft = frame.left + (logicalWidth - frame.width) / 2;
            const nonTableTop = frame.top + (logicalHeight - frame.height) / 2;
            const tableNumberLabel =
              isTable && Number.isFinite(visibleTableNumber) && visibleTableNumber > 0
                ? String(visibleTableNumber)
                : t(element.displayName || "");
            const wrapperStyle = {
              left: `${((isTable ? frame.left : nonTableLeft) - viewBounds.minLeft + contentOffsetX + mapOffsetX) * scale}px`,
              top: `${((isTable ? frame.top : nonTableTop) - viewBounds.minTop + contentOffsetY + mapOffsetY) * scale}px`,
              width: `${frame.width * scale}px`,
              height: `${frame.height * scale}px`,
              transform: isTable
                ? `rotate(${Number(element.rotation || 0)}deg) scale(${tableScale.scaleX}, ${tableScale.scaleY})`
                : `rotate(${Number(element.rotation || 0)}deg)`,
              transformOrigin: "center center",
            };

            if (!isTable) {
              return (
                <div
                  key={element.id}
                  className="absolute flex items-center justify-center overflow-hidden rounded-[20px] border border-neutral-300 px-2 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
                  style={{
                    ...wrapperStyle,
                    backgroundColor: element.color || "rgba(255,255,255,0.75)",
                    color: element.text_color || undefined,
                    fontSize: `${Math.max(10, Number(element.text_size || (element.kind === "label" ? 16 : 12)) * scale)}px`,
                    opacity: isDeemphasized ? 0.3 : 1,
                    filter: isDeemphasized ? "saturate(0.45) blur(0.4px)" : undefined,
                  }}
                >
                    <span className="max-w-full overflow-hidden break-words leading-tight">
                    {t(element.text || element.label || element.name || "")}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={element.id}
                type="button"
                onClick={() => interactive && onTableClick?.(element)}
                disabled={!interactive || element.status === "hidden"}
                className={`absolute flex flex-col items-center justify-center border-2 text-center shadow-md transition ${renderShape(
                  element.shape
                )} ${interactive ? "hover:scale-[1.02]" : ""}`}
                style={{
                  ...wrapperStyle,
                  backgroundColor: style.fill,
                  borderColor: isSelected ? "#2563eb" : style.border,
                  borderWidth: isSelected ? "4px" : undefined,
                  color: style.text,
                  opacity: element.status === "hidden" ? 0.2 : isDeemphasized ? 0.34 : 1,
                  filter: isDeemphasized ? "saturate(0.45) blur(0.45px)" : undefined,
                  boxShadow: isSelected
                    ? compactPadding
                      ? "0 0 0 6px rgba(59,130,246,0.22), 0 22px 48px rgba(37,99,235,0.34), 0 8px 20px rgba(15,23,42,0.18)"
                      : "0 0 0 5px rgba(37,99,235,0.18), 0 14px 28px rgba(15,23,42,0.18)"
                    : compactPadding
                      ? "0 12px 30px rgba(15,23,42,0.16), 0 3px 10px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.5)"
                      : undefined,
                }}
              >
                <span
                  className="px-1 font-extrabold leading-none tracking-[-0.02em]"
                  style={{ fontSize: `${Math.max(14, 45 * scale * tableNumberSize)}px` }}
                >
                  {tableNumberLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
