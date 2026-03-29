import React from "react";
import {
  getFloorPlanElementFrame,
  getFloorPlanRenderSize,
  getFloorPlanStatusStyle,
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
  selectedTableNumber = null,
  onTableClick,
  interactive = true,
}) {
  if (!layout) return null;
  const containerRef = React.useRef(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const canvas = React.useMemo(() => resolveFloorPlanCanvas(layout?.canvas), [layout?.canvas]);
  const renderSize = React.useMemo(
    () => getFloorPlanRenderSize(layout, elements),
    [elements, layout]
  );
  const width = Number(renderSize.width || canvas.width || 1200);
  const height = Number(renderSize.height || canvas.height || 780);
  const cellSize = Number(canvas.cellSize || canvas.gridSize || 84);
  const rowHeight = Number(canvas.rowHeight || cellSize);
  const scale =
    containerWidth > 0 ? Math.min(1, Math.max(0.24, containerWidth / width)) : 1;
  const scaledWidth = Math.max(260, Math.round(width * scale));
  const scaledHeight = Math.max(220, Math.round(height * scale));

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => {
      setContainerWidth(Math.max(0, node.clientWidth - 24));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="overflow-auto rounded-[28px] border border-neutral-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(244,244,245,0.98))] p-3 dark:border-neutral-800 dark:bg-[linear-gradient(180deg,_rgba(15,23,42,0.55),_rgba(9,9,11,0.95))]"
    >
      <div
        className="relative mx-auto"
        style={{ width: scaledWidth, height: scaledHeight }}
      >
        <div
          className="absolute left-0 top-0 rounded-[24px] border border-dashed border-neutral-300 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.05),_transparent_35%),linear-gradient(0deg,_rgba(255,255,255,0.92),_rgba(255,255,255,0.92))] shadow-inner dark:border-neutral-700 dark:bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_35%),linear-gradient(0deg,_rgba(17,24,39,0.96),_rgba(17,24,39,0.96))]"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundSize: `${cellSize}px ${rowHeight}px`,
          }}
        >
          {elements.map((element) => {
            const isTable = element.kind === "table";
            const isSelected =
              isTable && Number(element.table_number) === Number(selectedTableNumber || 0);
            const style = getFloorPlanStatusStyle(element.status);
            const tableScale = isTable ? getFloorPlanTableScale(element, canvas) : null;
            const frame = getFloorPlanElementFrame(element, canvas);
            const tableNumberLabel =
              isTable && Number.isFinite(Number(element.table_number)) && Number(element.table_number) > 0
                ? String(Number(element.table_number))
                : element.displayName;
            const wrapperStyle = {
              left: `${frame.left}px`,
              top: `${frame.top}px`,
              width: `${frame.width}px`,
              height: `${frame.height}px`,
              transform: isTable
                ? `rotate(${Number(element.rotation || 0)}deg) scale(${tableScale.scaleX}, ${tableScale.scaleY})`
                : `rotate(${Number(element.rotation || 0)}deg)`,
              transformOrigin: "center center",
            };

            if (!isTable) {
              return (
                <div
                  key={element.id}
                  className="absolute flex items-center justify-center overflow-hidden rounded-[20px] border border-dashed border-neutral-300 px-2 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
                  style={{
                    ...wrapperStyle,
                    backgroundColor: element.color || "rgba(255,255,255,0.75)",
                  }}
                >
                  <span className="max-w-full overflow-hidden break-words text-[10px] leading-tight">
                    {element.text || element.label || element.name}
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
                  borderColor: isSelected ? "#67e8f9" : style.border,
                  color: style.text,
                  opacity: element.status === "hidden" ? 0.2 : 1,
                  boxShadow: isSelected
                    ? "0 0 0 2px rgba(103,232,249,0.95), 0 0 18px rgba(34,211,238,0.9), 0 0 34px rgba(45,212,191,0.55)"
                    : undefined,
                }}
              >
                <span className="px-1 text-[45px] font-extrabold leading-none tracking-[-0.02em]">
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
