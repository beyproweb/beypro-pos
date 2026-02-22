import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CategoryBar = ({
  categoryColumns,
  renderCategoryButton,
  topRowRef,
  topRowScroll,
  onScrollLeft,
  onScrollRight,
  disabled,
  placement = "top",
}) => {
  if (!categoryColumns?.top?.length) return null;

  const isRight = placement === "right";
  const scrollElRef = useRef(null);

  // Keep parent ref working while also retaining an internal ref.
  const setScrollRef = useCallback(
    (node) => {
      scrollElRef.current = node;
      if (!topRowRef) return;
      if (typeof topRowRef === "function") topRowRef(node);
      else topRowRef.current = node;
    },
    [topRowRef]
  );

  const [scrollMetrics, setScrollMetrics] = useState({
    top: 0,
    height: 0,
    scrollHeight: 0,
  });

  const rafIdRef = useRef(0);
  const syncScrollMetrics = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) return;
    setScrollMetrics({
      top: el.scrollTop || 0,
      height: el.clientHeight || 0,
      scrollHeight: el.scrollHeight || 0,
    });
  }, []);

  const scheduleSync = useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafIdRef.current) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = 0;
      syncScrollMetrics();
    });
  }, [syncScrollMetrics]);

  useEffect(() => {
    // Initial sync with a small delay to ensure layout is complete
    const timer = setTimeout(syncScrollMetrics, 50);
    syncScrollMetrics();
    
    // Add ResizeObserver to detect container size changes
    const el = scrollElRef.current;
    let resizeObserver = null;
    
    if (el && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncScrollMetrics();
      });
      resizeObserver.observe(el);
    }
    
    return () => {
      clearTimeout(timer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (typeof window !== "undefined" && rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = 0;
    };
  }, [syncScrollMetrics, categoryColumns?.top?.length]);

  const showScrollRail =
    isRight && scrollMetrics.scrollHeight > scrollMetrics.height + 2;

  const thumb = useMemo(() => {
    const { height, scrollHeight, top } = scrollMetrics;
    if (!showScrollRail) return { size: 0, offset: 0, maxOffset: 0 };
    const viewport = Math.max(1, height);
    const content = Math.max(viewport + 1, scrollHeight);
    const size = Math.max(26, Math.round((viewport * viewport) / content));
    const maxOffset = Math.max(0, viewport - size);
    const maxScroll = Math.max(1, content - viewport);
    const offset = Math.max(0, Math.min(maxOffset, (top / maxScroll) * maxOffset));
    return { size, offset, maxOffset };
  }, [scrollMetrics, showScrollRail]);

  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startScrollTop: 0,
    startOffset: 0,
  });

  const setScrollTopFromThumbOffset = useCallback(
    (nextOffset) => {
      const el = scrollElRef.current;
      if (!el) return;
      const viewport = Math.max(1, el.clientHeight || 0);
      const content = Math.max(viewport + 1, el.scrollHeight || 0);
      const maxScroll = Math.max(0, content - viewport);
      const maxOffset = Math.max(1, viewport - Math.max(26, Math.round((viewport * viewport) / content)));
      const ratio = maxScroll / maxOffset;
      el.scrollTop = Math.max(0, Math.min(maxScroll, nextOffset * ratio));
      scheduleSync();
    },
    [scheduleSync]
  );

  const containerClasses = isRight
    ? `group relative flex h-full min-h-0 w-full flex-col rounded-[26px] border border-slate-200/60 bg-gradient-to-b from-white/90 to-slate-50/70 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.10)] dark:border-slate-700/40 dark:from-slate-900/60 dark:to-slate-950/40 transition-opacity duration-200 ${
        disabled ? "opacity-50 pointer-events-none" : "opacity-100"
      }`
    : `relative mx-3 mt-2 mb-2 flex flex-none rounded-lg border border-slate-200/50 bg-slate-50/70 p-1 shadow-xs dark:border-slate-700/30 dark:bg-slate-900/30 dark:shadow-none transition-opacity duration-200 ${
        disabled ? "opacity-50 pointer-events-none" : "opacity-100"
      }`;
  const getCategoryKey = useCallback((entry) => {
    const normalized = String(entry?.cat ?? "").trim().toLowerCase();
    return normalized || String(entry?.index ?? "");
  }, []);

  if (isRight) {
    return (
      <div className={containerClasses}>
        <div className="flex flex-none items-center justify-between px-1 pb-1.5">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
            Categories
          </div>
          <div className="h-1.5 w-8 rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 opacity-60" />
        </div>
        <div
          ref={setScrollRef}
          data-category-scroll
          onScroll={scheduleSync}
          className="grid flex-1 min-h-0 max-h-full grid-cols-1 gap-2 px-0.5 pt-0.5 pr-3 pb-[calc(200px+env(safe-area-inset-bottom))] overflow-y-auto scroll-smooth xl:grid-cols-2 scrollbar-hide overscroll-contain touch-pan-y"
          style={{ scrollBehavior: "smooth", maxHeight: '100%' }}
        >
          {categoryColumns.top.map((entry) => (
            <div key={`right-${getCategoryKey(entry)}`} className="flex">
              {renderCategoryButton(entry.cat, entry.index, "sidebar")}
            </div>
          ))}
        </div>

        {showScrollRail && (
          <div className="pointer-events-none absolute right-1.5 top-9 bottom-2 w-3.5 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div
              className="pointer-events-auto relative h-full w-2.5 rounded-full bg-white/45 dark:bg-slate-900/45 ring-1 ring-slate-200/70 dark:ring-slate-800/70 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)] overflow-hidden backdrop-blur-md"
              onPointerDown={(e) => {
                // Jump-to-position when clicking the rail
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const nextOffset = Math.max(0, Math.min(thumb.maxOffset, y - thumb.size / 2));
                setScrollTopFromThumbOffset(nextOffset);
              }}
              role="scrollbar"
              aria-orientation="vertical"
              aria-valuenow={Math.round(scrollMetrics.top)}
              aria-valuemin={0}
              aria-valuemax={Math.max(0, scrollMetrics.scrollHeight - scrollMetrics.height)}
              tabIndex={0}
            >
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/35 via-white/5 to-transparent"
                aria-hidden="true"
              />
              <div
                className="absolute left-1/2 rounded-full bg-slate-500/55 dark:bg-slate-300/35 shadow-[0_6px_14px_rgba(15,23,42,0.12)] ring-1 ring-white/40 active:scale-[1.02] cursor-grab active:cursor-grabbing"
                style={{
                  width: 6,
                  height: `${thumb.size}px`,
                  top: `${thumb.offset}px`,
                  transform: 'translateX(-50%)',
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragRef.current = {
                    dragging: true,
                    startY: e.clientY,
                    startScrollTop: scrollMetrics.top,
                    startOffset: thumb.offset,
                  };
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                }}
                onPointerMove={(e) => {
                  if (!dragRef.current.dragging) return;
                  const dy = e.clientY - dragRef.current.startY;
                  const nextOffset = Math.max(
                    0,
                    Math.min(thumb.maxOffset, dragRef.current.startOffset + dy)
                  );
                  setScrollTopFromThumbOffset(nextOffset);
                }}
                onPointerUp={() => {
                  dragRef.current.dragging = false;
                }}
                onPointerCancel={() => {
                  dragRef.current.dragging = false;
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div
        ref={setScrollRef}
        data-category-scroll
        className="flex flex-row items-center gap-1.5 justify-start overflow-x-auto px-1 py-0.5 scroll-smooth scrollbar-hide"
        style={{ scrollBehavior: "smooth" }}
      >
        {categoryColumns.top.map((entry) => (
          <div key={`top-${getCategoryKey(entry)}`}>
            {renderCategoryButton(entry.cat, entry.index, "horizontal")}
          </div>
        ))}
      </div>
      {topRowScroll?.canScrollLeft && (
        <button
          onClick={onScrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-5 w-5 rounded-full bg-slate-600/50 text-white shadow-md flex items-center justify-center hover:bg-slate-700 transition-colors"
          aria-label="Scroll left"
        >
          ‹
        </button>
      )}
      {topRowScroll?.canScrollRight && (
        <button
          onClick={onScrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-5 w-5 rounded-full bg-slate-600/50 text-white shadow-md flex items-center justify-center hover:bg-slate-700 transition-colors"
          aria-label="Scroll right"
        >
          ›
        </button>
      )}
    </div>
  );
};

export default React.memo(CategoryBar);
