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
  xl:grid-cols-4
  2xl:grid-cols-4
  gap-3
  sm:gap-8
  place-items-stretch
  w-full
`;

const DEFAULT_VIEWPORT = {
  scrollTop: 0,
  viewportHeight: 0,
  viewportWidth: 0,
  containerWidth: 0,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const findNearestScrollContainer = (startNode) => {
  if (typeof window === "undefined") return null;
  let node = startNode?.parentElement || null;

  while (node) {
    const styles = window.getComputedStyle(node);
    const overflowY = styles?.overflowY || "";
    const isScrollable =
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight;

    if (isScrollable) {
      return node;
    }

    node = node.parentElement;
  }

  return null;
};

const getColumnsForViewport = (viewportWidth) => {
  if (viewportWidth >= 1280) return 4;
  return 2;
};

const getRowGapForViewport = (viewportWidth) => {
  if (viewportWidth < 640) return 12;
  if (viewportWidth >= 640) return 32;
  return 12;
};

const getColumnsForWidth = ({
  viewportWidth,
  containerWidth,
  minColumnWidth,
  columnGap,
  maxColumns,
}) => {
  const normalizedMin = Math.max(1, Math.trunc(Number(minColumnWidth) || 0));
  if (!normalizedMin) {
    return getColumnsForViewport(viewportWidth);
  }

  const availableWidth = Math.max(0, Math.trunc(Number(containerWidth) || 0));
  if (availableWidth <= 0) return 1;

  const gap = Math.max(0, Math.trunc(Number(columnGap) || 0));
  const fit = Math.max(1, Math.floor((availableWidth + gap) / (normalizedMin + gap)));
  const normalizedMax = Math.trunc(Number(maxColumns) || 0);
  if (normalizedMax > 0) return Math.min(normalizedMax, fit);
  return fit;
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

function VirtualTablesGrid(
  {
  items,
  renderItem,
  itemKey,
  estimatedItemHeight,
  overscan = 6,
  className = "",
  minColumnWidth = null,
  maxColumns = null,
  columnGap = null,
  rowGap = null,
  containerMaxWidth = 1600,
  },
  ref
) {
  const renderCount = useRenderCount("TableGrid", { logEvery: 1 });
  const onTableGridProfileRender = React.useMemo(() => createProfilerOnRender("TableGrid"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const list = Array.isArray(items) ? items : [];
  const containerRef = React.useRef(null);
  const scrollContainerRef = React.useRef(null);
  const resizeObserversRef = React.useRef(new Map());
  const rowNodesRef = React.useRef(new Map());
  const rowRefCallbacksRef = React.useRef(new Map());
  const rafRef = React.useRef(null);
  const [viewport, setViewport] = React.useState(() => {
    if (typeof window === "undefined") return DEFAULT_VIEWPORT;
    return {
      scrollTop: 0,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      containerWidth: 0,
    };
  });
  const [measuredRowHeights, setMeasuredRowHeights] = React.useState({});
  const measuredRowHeightsRef = React.useRef({});
  const dynamicGridEnabled = Number(minColumnWidth) > 0;

  const resolveScrollContainer = React.useCallback(() => {
    const nextContainer = findNearestScrollContainer(containerRef.current);
    scrollContainerRef.current = nextContainer;
    return nextContainer;
  }, []);

  const scrollToTop = React.useCallback(
    ({ behavior = "smooth" } = {}) => {
      const scrollContainer = scrollContainerRef.current || resolveScrollContainer();
      if (!scrollContainer?.scrollTo) return false;
      scrollContainer.scrollTo({ top: 0, behavior });
      return true;
    },
    [resolveScrollContainer]
  );

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
    }),
    [scrollToTop]
  );

  React.useEffect(() => {
    resolveScrollContainer();
  }, [resolveScrollContainer]);

  React.useEffect(() => {
    measuredRowHeightsRef.current = measuredRowHeights || {};
  }, [measuredRowHeights]);

  const resolvedRowGap = React.useMemo(() => {
    const custom = Math.trunc(Number(rowGap) || 0);
    if (custom > 0) return custom;
    return getRowGapForViewport(viewport.viewportWidth || 0);
  }, [rowGap, viewport.viewportWidth]);

  const resolvedColumnGap = React.useMemo(() => {
    const custom = Math.trunc(Number(columnGap) || 0);
    if (custom > 0) return custom;
    return resolvedRowGap;
  }, [columnGap, resolvedRowGap]);

  const columnCount = React.useMemo(
    () =>
      getColumnsForWidth({
        viewportWidth: viewport.viewportWidth || 0,
        containerWidth: viewport.containerWidth || 0,
        minColumnWidth,
        columnGap: resolvedColumnGap,
        maxColumns,
      }),
    [
      maxColumns,
      minColumnWidth,
      resolvedColumnGap,
      viewport.containerWidth,
      viewport.viewportWidth,
    ]
  );

  const rowCount = React.useMemo(
    () => Math.ceil(list.length / Math.max(1, columnCount)),
    [columnCount, list.length]
  );

  const rowIdentitySignature = React.useMemo(() => {
    if (rowCount <= 0) return "";
    const cols = Math.max(1, columnCount);
    const tokens = [];
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const start = rowIndex * cols;
      const rowToken = list
        .slice(start, start + cols)
        .map((item) => String(itemKey(item)))
        .join(",");
      tokens.push(rowToken);
    }
    return tokens.join("|");
  }, [columnCount, itemKey, list, rowCount]);

  const measureMountedRows = React.useCallback(() => {
    setMeasuredRowHeights((prev) => {
      let changed = false;
      let next = prev;

      rowNodesRef.current.forEach((node, rowIndex) => {
        const nextHeight = Math.ceil(node.getBoundingClientRect().height);
        if (nextHeight <= 0) return;
        const currentHeight = next[rowIndex];
        if (currentHeight === nextHeight) return;

        if (!changed) {
          next = { ...prev };
          changed = true;
        }
        next[rowIndex] = nextHeight;
      });

      if (changed) {
        measuredRowHeightsRef.current = next;
        return next;
      }
      return prev;
    });
  }, []);

  React.useEffect(() => {
    if (dynamicGridEnabled) return undefined;
    measuredRowHeightsRef.current = {};
    setMeasuredRowHeights({});
  }, [columnCount, dynamicGridEnabled, rowIdentitySignature]);

  React.useEffect(() => {
    if (dynamicGridEnabled) return undefined;
    if (typeof window === "undefined") return undefined;
    const rafId = window.requestAnimationFrame(() => {
      measureMountedRows();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [dynamicGridEnabled, measureMountedRows, rowIdentitySignature]);

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

  const rowOffsets = React.useMemo(
    () =>
      withPerfTimer("[perf] TableGrid row offsets", () => {
        const offsets = new Array(rowCount + 1).fill(0);
        for (let i = 0; i < rowCount; i += 1) {
          const gapAfterRow = i < rowCount - 1 ? resolvedRowGap : 0;
          offsets[i + 1] = offsets[i] + rowHeights[i] + gapAfterRow;
        }
        return offsets;
      }),
    [resolvedRowGap, rowCount, rowHeights]
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
    const containerWidth = Math.max(0, Math.trunc(rect.width || 0));

    setViewport((prev) => {
      if (
        prev.scrollTop === scrollTop &&
        prev.viewportHeight === viewportHeight &&
        prev.viewportWidth === window.innerWidth &&
        prev.containerWidth === containerWidth
      ) {
        return prev;
      }
      return {
        scrollTop,
        viewportHeight,
        viewportWidth: window.innerWidth,
        containerWidth,
      };
    });
  }, []);

  React.useEffect(() => {
    if (dynamicGridEnabled) return undefined;
    if (typeof window === "undefined") return undefined;
    const scrollEventTarget = typeof document !== "undefined" ? document : window;

    const scheduleViewportCalc = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        calculateViewport();
      });
    };

    // Listen in capture phase so scrolls from nested containers (Layout main area) are observed.
    scrollEventTarget.addEventListener("scroll", scheduleViewportCalc, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", scheduleViewportCalc);
    calculateViewport();

    return () => {
      scrollEventTarget.removeEventListener("scroll", scheduleViewportCalc, {
        capture: true,
      });
      window.removeEventListener("resize", scheduleViewportCalc);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [calculateViewport, dynamicGridEnabled]);

  React.useEffect(() => {
    if (dynamicGridEnabled) return;
    calculateViewport();
  }, [
    calculateViewport,
    className,
    containerMaxWidth,
    dynamicGridEnabled,
    minColumnWidth,
    resolvedColumnGap,
    totalHeight,
  ]);

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
      if (measuredRowHeightsRef.current?.[rowIndex] === nextHeight) return;
      setMeasuredRowHeights((prev) => {
        if (prev[rowIndex] === nextHeight) return prev;
        const next = { ...prev, [rowIndex]: nextHeight };
        measuredRowHeightsRef.current = next;
        return next;
      });
    };

    updateHeight();

    if (typeof window === "undefined" || typeof window.ResizeObserver === "undefined") {
      return;
    }

    const observer = new window.ResizeObserver(updateHeight);
    observer.observe(node);
    resizeObserversRef.current.set(rowIndex, observer);
  }, []);

  React.useEffect(() => {
    return () => {
      resizeObserversRef.current.forEach((observer) => observer.disconnect());
      resizeObserversRef.current.clear();
      rowNodesRef.current.clear();
      rowRefCallbacksRef.current.clear();
    };
  }, []);

  const getRowRef = React.useCallback(
    (rowIndex) => {
      if (rowRefCallbacksRef.current.has(rowIndex)) {
        return rowRefCallbacksRef.current.get(rowIndex);
      }
      const cb = (node) => setRowNode(rowIndex, node);
      rowRefCallbacksRef.current.set(rowIndex, cb);
      return cb;
    },
    [setRowNode]
  );

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

  const autoFillMinColumnWidth = Math.max(
    120,
    Math.trunc(Number(minColumnWidth) || 120)
  );
  const autoFillGridStyle = dynamicGridEnabled
    ? {
        gridTemplateColumns: `repeat(auto-fill, minmax(${autoFillMinColumnWidth}px, 1fr))`,
        columnGap: `${resolvedColumnGap}px`,
        rowGap: `${resolvedRowGap}px`,
      }
    : undefined;
  const rowGridStyle = dynamicGridEnabled
    ? {
        gridTemplateColumns: `repeat(${Math.max(1, columnCount)}, minmax(${Math.max(
          1,
          Math.trunc(Number(minColumnWidth) || 0)
        )}px, 1fr))`,
        columnGap: `${resolvedColumnGap}px`,
      }
    : undefined;
  const rowGridClassName = dynamicGridEnabled
    ? "grid place-items-stretch w-full transition-all duration-200"
    : GRID_CLASS_NAME;
  const resolvedMaxWidth =
    typeof containerMaxWidth === "number"
      ? `${Math.max(320, Math.trunc(containerMaxWidth))}px`
      : containerMaxWidth || "1600px";

  if (dynamicGridEnabled) {
    return (
      <React.Profiler id="TableGrid" onRender={onTableGridProfileRender}>
        <div className={className}>
          {showRenderCounter && (
            <div className="mb-2 flex w-full justify-end">
              <RenderCounter label="TableGrid" value={renderCount} />
            </div>
          )}
          <div
            className="w-full transition-all duration-200"
            style={{ maxWidth: resolvedMaxWidth }}
          >
            <div
              className="grid w-full place-items-stretch transition-all duration-200"
              style={autoFillGridStyle}
            >
              {list.map((item) => (
                <React.Fragment key={itemKey(item)}>{renderItem(item)}</React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </React.Profiler>
    );
  }

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
          className="relative w-full transition-all duration-200"
          style={{
            height: `${Math.max(0, totalHeight)}px`,
            maxWidth: resolvedMaxWidth,
          }}
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
                <div ref={getRowRef(rowIndex)} className={rowGridClassName} style={rowGridStyle}>
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
    prevProps.className === nextProps.className &&
    prevProps.minColumnWidth === nextProps.minColumnWidth &&
    prevProps.maxColumns === nextProps.maxColumns &&
    prevProps.columnGap === nextProps.columnGap &&
    prevProps.rowGap === nextProps.rowGap &&
    prevProps.containerMaxWidth === nextProps.containerMaxWidth;

  if (!isEqual) {
    logMemoDiff({
      component: "TableGrid",
      prevProps,
      nextProps,
      watchedProps: [
        "items",
        "renderItem",
        "itemKey",
        "estimatedItemHeight",
        "overscan",
        "className",
        "minColumnWidth",
        "maxColumns",
        "columnGap",
        "rowGap",
        "containerMaxWidth",
      ],
    });
  }

  return isEqual;
};

const ForwardedVirtualTablesGrid = React.forwardRef(VirtualTablesGrid);

export default React.memo(ForwardedVirtualTablesGrid, areVirtualTablesGridPropsEqual);
