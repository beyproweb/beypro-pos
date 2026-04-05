import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeTableDensity, TABLE_DENSITY } from "../../features/tables/tableDensity";

const PRODUCT_WINDOW_INITIAL_COUNT = 60;
const PRODUCT_WINDOW_STEP = 60;

const ProductGrid = ({
  products,
  onAddProduct,
  onOpenExtras,
  t,
  formatCurrency,
  enableVirtualization = false,
  virtualizationOverscan = 6,
  tableDensity = TABLE_DENSITY.COMFORTABLE,
}) => {
  if (!Array.isArray(products)) return null;
  const fallbackSrc = "/Productsfallback.jpg";
  const scrollRef = useRef(null);
  const [windowingFallback, setWindowingFallback] = useState(false);
  const overscan = Number.isFinite(Number(virtualizationOverscan))
    ? Math.max(0, Number(virtualizationOverscan))
    : 0;
  const thresholdPx = useMemo(() => Math.max(120, overscan * 24), [overscan]);
  const normalizedDensity = useMemo(
    () => normalizeTableDensity(tableDensity),
    [tableDensity]
  );
  const isCompact = normalizedDensity === TABLE_DENSITY.COMPACT;
  const isDense = normalizedDensity === TABLE_DENSITY.DENSE;
  const compactLike = isCompact || isDense;
  const minColumnWidth = compactLike ? (isDense ? 85 : 102) : 180;
  const shouldWindowProducts =
    enableVirtualization &&
    !windowingFallback &&
    products.length > PRODUCT_WINDOW_INITIAL_COUNT;
  const [renderCount, setRenderCount] = useState(() =>
    shouldWindowProducts
      ? Math.min(products.length, PRODUCT_WINDOW_INITIAL_COUNT)
      : products.length
  );

  useEffect(() => {
    if (!enableVirtualization) {
      setWindowingFallback(false);
      return;
    }
    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      if (scrollRef.current) return;
      setWindowingFallback(true);
      if (import.meta.env.DEV) {
        console.warn("[TX_VIRTUAL] Product windowing fallback: missing scroll container ref.");
      }
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [enableVirtualization]);

  useEffect(() => {
    if (!shouldWindowProducts) {
      setRenderCount(products.length);
      return;
    }
    setRenderCount(Math.min(products.length, PRODUCT_WINDOW_INITIAL_COUNT));
  }, [products, products.length, shouldWindowProducts]);

  const handleScroll = useCallback(
    (event) => {
      if (!shouldWindowProducts) return;
      const node = event?.currentTarget;
      if (!node) {
        setWindowingFallback(true);
        if (import.meta.env.DEV) {
          console.warn("[TX_VIRTUAL] Product windowing fallback: invalid scroll node.");
        }
        return;
      }
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining > thresholdPx) return;
      setRenderCount((prev) => {
        if (prev >= products.length) return prev;
        return Math.min(products.length, prev + PRODUCT_WINDOW_STEP + overscan);
      });
    },
    [overscan, products.length, shouldWindowProducts, thresholdPx]
  );

  const renderedProducts = useMemo(() => {
    if (!shouldWindowProducts) return products;
    return products.slice(0, renderCount);
  }, [products, renderCount, shouldWindowProducts]);
  const gridStyle = useMemo(
    () =>
      compactLike
        ? { gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))` }
        : undefined,
    [compactLike, minColumnWidth]
  );
  const containerPaddingClass = compactLike ? "px-1.5 sm:px-2" : "px-3 sm:px-4";
  const gridGapClass = compactLike
    ? isDense
      ? "gap-x-1 gap-y-1"
      : "gap-x-1 gap-y-1"
    : "gap-x-2 gap-y-2";
  const gridClassName = compactLike
    ? `grid w-full ${gridGapClass}`
    : "grid w-full grid-cols-3 gap-x-2 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";
  const cardBaseClass = compactLike
    ? "relative flex aspect-square w-full flex-col overflow-hidden rounded-[10px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 text-center shadow-[0_6px_14px_rgba(15,23,42,0.08)] ring-1 ring-white/70 transition-colors active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 dark:border-slate-700/70 dark:from-slate-900/70 dark:to-slate-900/45 dark:ring-slate-800/60"
    : `
                relative flex aspect-square w-full flex-col overflow-hidden rounded-[14px] border border-white/50 bg-white/85 text-center shadow-[0_10px_20px_rgba(15,23,42,0.07)]
                hover:border-indigo-200 hover:shadow-[0_14px_28px_rgba(99,102,241,0.12)] active:scale-[0.97]
                dark:border-slate-700/50 dark:bg-slate-900/60 dark:shadow-[0_10px_22px_rgba(0,0,0,0.35)]
                dark:hover:border-indigo-500/30 dark:hover:shadow-[0_14px_28px_rgba(0,0,0,0.4)] dark:active:bg-indigo-950/40
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60
                transition-transform duration-75 active:duration-50
              `;

  return (
    <article className="flex min-w-0 flex-1 min-h-0 flex-col bg-transparent px-0 py-2 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={shouldWindowProducts ? handleScroll : undefined}
        className={`h-[calc(100vh-260px)] overflow-y-auto ${containerPaddingClass} pb-[calc(150px+env(safe-area-inset-bottom))] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent`}
        style={{ scrollbarGutter: "stable" }}
      >
        <div className={gridClassName} style={gridStyle}>
          {renderedProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => onAddProduct(product)}
              className={cardBaseClass}
              title={product.name}
            >
              {compactLike ? (
                <div
                  className={
                    isDense
                      ? "flex h-full w-full flex-col items-center justify-between px-1 py-1"
                      : "flex h-full w-full flex-col items-center justify-between px-1 py-1.5"
                  }
                >
                  <p
                    className={
                      isDense
                        ? "flex h-[2.4em] w-full items-center justify-center"
                        : "flex h-[2.5em] w-full items-center justify-center"
                    }
                  >
                    <span
                      className={
                        isDense
                          ? "line-clamp-2 text-center text-[12px] font-semibold leading-tight text-slate-800 dark:text-slate-100"
                          : "line-clamp-2 text-center text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100"
                      }
                    >
                      {product.name}
                    </span>
                  </p>
                  <span
                    className={
                      isDense
                        ? "text-[12px] font-bold leading-none text-indigo-600 dark:text-indigo-300"
                        : "text-[13px] font-bold leading-none text-indigo-600 dark:text-indigo-300"
                    }
                  >
                    {formatCurrency ? formatCurrency(parseFloat(product.price)) : product.price}
                  </span>
                </div>
              ) : (
                <>
                  <div className="relative w-full flex-1 min-h-0 overflow-hidden border-b border-white/50 bg-white/80 p-0.5 dark:border-slate-800/50 dark:bg-slate-900/50">
                    <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                      <img
                        src={product.image || fallbackSrc}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = fallbackSrc;
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex w-full flex-none flex-col items-center justify-center gap-0.5 bg-white/80 px-1 py-1 dark:bg-slate-900/40">
                    <p className="flex h-[2.4em] w-full items-center justify-center">
                      <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-slate-800 dark:text-slate-50">
                        {product.name}
                      </span>
                    </p>
                    <span className="text-[13px] font-bold text-indigo-600 leading-none dark:text-indigo-300">
                      {formatCurrency ? formatCurrency(parseFloat(product.price)) : product.price}
                    </span>
                  </div>
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
};

const areEqual = (prevProps, nextProps) =>
  prevProps.products === nextProps.products &&
  prevProps.onAddProduct === nextProps.onAddProduct &&
  prevProps.formatCurrency === nextProps.formatCurrency &&
  prevProps.enableVirtualization === nextProps.enableVirtualization &&
  prevProps.virtualizationOverscan === nextProps.virtualizationOverscan &&
  prevProps.tableDensity === nextProps.tableDensity;

export default React.memo(ProductGrid, areEqual);
