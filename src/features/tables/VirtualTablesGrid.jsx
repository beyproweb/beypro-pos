import React from "react";
import {
  RenderCounter,
  createProfilerOnRender,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
  withPerfTimer,
} from "./dev/perfDebug";

const GRID_CLASS_NAME = `
  grid
  grid-cols-2
  md:grid-cols-3
  xl:grid-cols-4
  2xl:grid-cols-4
  gap-3
  sm:gap-8
  place-items-stretch
  w-full
`;

const DEFAULT_VIEWPORT = { scrollTop: 0, viewportHeight: 0, viewportWidth: 0 };

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getColumnsForViewport = (viewportWidth) => {
  if (viewportWidth >= 1280) return 4;
  if (viewportWidth >= 768) return 3;
  return 2;
};

const getRowGapForViewport = (viewportWidth) => {
  if (viewportWidth >= 640) return 32;
  return 12;
};

const findRowIndexForOffset = (prefixHeights, offset) => {
  const target = Math.max(0, offset);
  let left = 0;
  let right = Math.max(0, prefixHeights.length - 2);

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const rowStart = prefixHeights[mid];
    const rowEnd = prefixHeights[mid + 1];
    if (target < rowStart) {
      right = mid - 1;
      continue;
    }
    if (target >= rowEnd) {
      left = mid + 1;
      continue;
    }
    return mid;
  }

  return clamp(left, 0, Math.max(0, prefixHeights.length - 2));
};

function VirtualTablesGrid({
  items,
  renderItem,
  itemKey,
  estimatedItemHeight,
  overscan = 6,
  className = "",
}) {
  const renderCount = useRenderCount("TableGrid", { logEvery: 1 });
  const onTableGridProfileRender = React.useMemo(() => createProfilerOnRender("TableGrid"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const list = Array.isArray(items) ? items : [];
  const containerRef = React.useRef(null);
  const resizeObserversRef = React.useRef(new Map());
  const rowNodesRef = React.useRef(new Map());
  const rafRef = React.useRef(null);
  const [viewport, setViewport] = React.useState(() => {
    if (typeof window === "undefined") return DEFAULT_VIEWPORT;
    return {
      scrollTop: 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
  const [measuredRowHeights, setMeasuredRowHeights] = React.useState({});

  const columnCount = React.useMemo(
    () => getColumnsForViewport(viewport.viewportWidth || 0),
    [viewport.viewportWidth]
  );

  const rowCount = React.useMemo(
    () => Math.ceil(list.length / Math.max(1, columnCount)),
    [columnCount, list.length]
  );

  React.useEffect(() => {
    setMeasuredRowHeights({});
  }, [columnCount, list.length]);

  const rowHeights = React.useMemo(
    () =>
      withPerfTimer("[perf] TableGrid row heights", () => {
        const fallbackHeight = Math.max(1, Math.trunc(Number(estimatedItemHeight) || 260));
        return Array.from(
          { length: rowCount },
          (_, rowIndex) => measuredRowHeights[rowIndex] || fallbackHeight
        );
      }),
    [estimatedItemHeight, measuredRowHeights, rowCount]
  );

  const rowGap = React.useMemo(
    () => getRowGapForViewport(viewport.viewportWidth || 0),
    [viewport.viewportWidth]
  );

  const rowOffsets = React.useMemo(
    () =>
      withPerfTimer("[perf] TableGrid row offsets", () => {
        const offsets = new Array(rowCount + 1).fill(0);
        for (let i = 0; i < rowCount; i += 1) {
          const gapAfterRow = i < rowCount - 1 ? rowGap : 0;
          offsets[i + 1] = offsets[i] + rowHeights[i] + gapAfterRow;
        }
        return offsets;
      }),
    [rowCount, rowGap, rowHeights]
  );

  const totalHeight = rowOffsets[rowCount] || 0;

  const calculateViewport = React.useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    const rect = container.getBoundingClientRect();
    const containerTopAbs = window.scrollY + rect.top;
    const containerBottomAbs = containerTopAbs + rect.height;
    const windowTop = window.scrollY;
    const windowBottom = windowTop + window.innerHeight;
    const visibleTopAbs = Math.max(windowTop, containerTopAbs);
    const visibleBottomAbs = Math.min(windowBottom, containerBottomAbs);
    const scrollTop = Math.max(0, visibleTopAbs - containerTopAbs);
    const viewportHeight = Math.max(0, visibleBottomAbs - visibleTopAbs);

    setViewport((prev) => {
      if (
        prev.scrollTop === scrollTop &&
        prev.viewportHeight === viewportHeight &&
        prev.viewportWidth === window.innerWidth
      ) {
        return prev;
      }
      return {
        scrollTop,
        viewportHeight,
        viewportWidth: window.innerWidth,
      };
    });
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const scheduleViewportCalc = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        calculateViewport();
      });
    };

    window.addEventListener("scroll", scheduleViewportCalc, { passive: true });
    window.addEventListener("resize", scheduleViewportCalc);
    calculateViewport();

    return () => {
      window.removeEventListener("scroll", scheduleViewportCalc);
      window.removeEventListener("resize", scheduleViewportCalc);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [calculateViewport]);

  React.useEffect(() => {
    calculateViewport();
  }, [calculateViewport, totalHeight]);

  const setRowNode = React.useCallback((rowIndex, node) => {
    const previousNode = rowNodesRef.current.get(rowIndex);
    const previousObserver = resizeObserversRef.current.get(rowIndex);
    if (previousNode === node) return;

    if (previousObserver && previousNode) {
      previousObserver.unobserve(previousNode);
    }

    if (!node) {
      if (previousObserver) {
        previousObserver.disconnect();
        resizeObserversRef.current.delete(rowIndex);
      }
      rowNodesRef.current.delete(rowIndex);
      return;
    }

    rowNodesRef.current.set(rowIndex, node);

    const updateHeight = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      if (nextHeight <= 0) return;
      setMeasuredRowHeights((prev) => {
        if (prev[rowIndex] === nextHeight) return prev;
        return { ...prev, [rowIndex]: nextHeight };
      });
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    resizeObserversRef.current.set(rowIndex, observer);
  }, []);

  React.useEffect(() => {
    return () => {
      resizeObserversRef.current.forEach((observer) => observer.disconnect());
      resizeObserversRef.current.clear();
      rowNodesRef.current.clear();
    };
  }, []);

  const { startRow, endRow } = React.useMemo(
    () =>
      withPerfTimer("[perf] TableGrid visible window", () => {
        if (rowCount <= 0) return { startRow: 0, endRow: -1 };

        const visibleTop = Math.max(0, viewport.scrollTop);
        const visibleBottom = Math.max(visibleTop, visibleTop + viewport.viewportHeight);
        const firstVisibleRow = findRowIndexForOffset(rowOffsets, visibleTop);
        const lastVisibleRow = findRowIndexForOffset(rowOffsets, visibleBottom);
        return {
          startRow: clamp(firstVisibleRow - overscan, 0, rowCount - 1),
          endRow: clamp(lastVisibleRow + overscan, 0, rowCount - 1),
        };
      }),
    [overscan, rowCount, rowOffsets, viewport.scrollTop, viewport.viewportHeight]
  );

  const visibleRowIndexes = React.useMemo(() => {
    if (endRow < startRow) return [];
    return Array.from({ length: endRow - startRow + 1 }, (_, idx) => startRow + idx);
  }, [endRow, startRow]);

  return (
    <React.Profiler id="TableGrid" onRender={onTableGridProfileRender}>
      <div className={className}>
        {showRenderCounter && (
          <div className="mb-2 flex w-full justify-end">
            <RenderCounter label="TableGrid" value={renderCount} />
          </div>
        )}
        <div
          ref={containerRef}
          className="relative w-full max-w-[1600px]"
          style={{ height: `${Math.max(0, totalHeight)}px` }}
        >
          {visibleRowIndexes.map((rowIndex) => {
            const rowTop = rowOffsets[rowIndex] || 0;
            const rowStart = rowIndex * columnCount;
            const rowItems = list.slice(rowStart, rowStart + columnCount);

            return (
              <div
                key={`row-${rowIndex}`}
                style={{ position: "absolute", top: `${rowTop}px`, left: 0, right: 0 }}
              >
                <div ref={(node) => setRowNode(rowIndex, node)} className={GRID_CLASS_NAME}>
                  {rowItems.map((item) => (
                    <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </React.Profiler>
  );
}

const areVirtualTablesGridPropsEqual = (prevProps, nextProps) => {
  const isEqual =
    prevProps.items === nextProps.items &&
    prevProps.renderItem === nextProps.renderItem &&
    prevProps.itemKey === nextProps.itemKey &&
    prevProps.estimatedItemHeight === nextProps.estimatedItemHeight &&
    prevProps.overscan === nextProps.overscan &&
    prevProps.className === nextProps.className;

  if (!isEqual) {
    logMemoDiff({
      component: "TableGrid",
      prevProps,
      nextProps,
      watchedProps: ["items", "renderItem", "itemKey", "estimatedItemHeight", "overscan", "className"],
    });
  }

  return isEqual;
};

export default React.memo(VirtualTablesGrid, areVirtualTablesGridPropsEqual);
