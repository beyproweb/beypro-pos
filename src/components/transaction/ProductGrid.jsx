import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeTableDensity, TABLE_DENSITY } from "../../features/tables/tableDensity";

const PRODUCT_WINDOW_INITIAL_COUNT = 60;
const PRODUCT_WINDOW_STEP = 60;
const EMPTY_PRODUCTS = [];
const PRODUCT_CARD_THEMES = [
  {
    card: "border-sky-200/70 bg-gradient-to-br from-white via-sky-50/90 to-cyan-100/50 dark:border-sky-800/50 dark:from-slate-900/80 dark:via-slate-900/75 dark:to-sky-950/35",
    dot: "bg-sky-500 dark:bg-sky-300",
    price: "bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-900",
  },
  {
    card: "border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/90 to-teal-100/50 dark:border-emerald-800/50 dark:from-slate-900/80 dark:via-slate-900/75 dark:to-emerald-950/35",
    dot: "bg-emerald-500 dark:bg-emerald-300",
    price: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-900",
  },
  {
    card: "border-amber-200/80 bg-gradient-to-br from-white via-amber-50/90 to-orange-100/55 dark:border-amber-800/50 dark:from-slate-900/80 dark:via-slate-900/75 dark:to-amber-950/35",
    dot: "bg-amber-500 dark:bg-amber-300",
    price: "bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-900",
  },
  {
    card: "border-rose-200/75 bg-gradient-to-br from-white via-rose-50/90 to-pink-100/50 dark:border-rose-800/50 dark:from-slate-900/80 dark:via-slate-900/75 dark:to-rose-950/35",
    dot: "bg-rose-500 dark:bg-rose-300",
    price: "bg-rose-600 text-white dark:bg-rose-500 dark:text-slate-900",
  },
  {
    card: "border-indigo-200/75 bg-gradient-to-br from-white via-indigo-50/90 to-blue-100/55 dark:border-indigo-800/50 dark:from-slate-900/80 dark:via-slate-900/75 dark:to-indigo-950/35",
    dot: "bg-indigo-500 dark:bg-indigo-300",
    price: "bg-indigo-600 text-white dark:bg-indigo-500 dark:text-slate-900",
  },
];

const getProductTheme = (product) => {
  const seed = String(product?.id ?? product?.name ?? "");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PRODUCT_CARD_THEMES.length;
  return PRODUCT_CARD_THEMES[index];
};

const PRODUCT_NAME_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const ProductGrid = ({
  products,
  onAddProduct,
  formatCurrency,
  enableVirtualization = false,
  virtualizationOverscan = 6,
  tableDensity = TABLE_DENSITY.COMFORTABLE,
}) => {
  const safeProducts = Array.isArray(products) ? products : EMPTY_PRODUCTS;
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
  const minColumnWidth = isDense ? 85 : 102;
  const shouldWindowProducts =
    enableVirtualization &&
    !windowingFallback &&
    safeProducts.length > PRODUCT_WINDOW_INITIAL_COUNT;
  const [renderCount, setRenderCount] = useState(() =>
    shouldWindowProducts
      ? Math.min(safeProducts.length, PRODUCT_WINDOW_INITIAL_COUNT)
      : safeProducts.length
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
      setRenderCount(safeProducts.length);
      return;
    }
    setRenderCount(Math.min(safeProducts.length, PRODUCT_WINDOW_INITIAL_COUNT));
  }, [safeProducts, safeProducts.length, shouldWindowProducts]);

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
        if (prev >= safeProducts.length) return prev;
        return Math.min(safeProducts.length, prev + PRODUCT_WINDOW_STEP + overscan);
      });
    },
    [overscan, safeProducts.length, shouldWindowProducts, thresholdPx]
  );

  const renderedProducts = useMemo(() => {
    if (!shouldWindowProducts) return safeProducts;
    return safeProducts.slice(0, renderCount);
  }, [safeProducts, renderCount, shouldWindowProducts]);
  const gridStyle = useMemo(
    () =>
      isDense
        ? {
            "--tx-product-grid-min-column-width": `${minColumnWidth}px`,
          }
        : undefined,
    [isDense, minColumnWidth]
  );
  const containerPaddingClass = compactLike ? "px-1.5 sm:px-2" : "px-3 sm:px-4";
  const gridGapClass = compactLike
    ? isDense
      ? "gap-x-1 gap-y-1"
      : "gap-x-1 gap-y-1"
    : "gap-x-2 gap-y-2";
  const gridClassName = compactLike
    ? isDense
      ? `grid w-full grid-cols-3 ${gridGapClass} sm:[grid-template-columns:repeat(auto-fill,minmax(var(--tx-product-grid-min-column-width),1fr))]`
      : `grid w-full grid-cols-3 ${gridGapClass} sm:grid-cols-5`
    : "grid w-full grid-cols-3 gap-x-2 gap-y-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  const cardBaseClass = compactLike
    ? `group relative flex ${
        isCompact ? "aspect-[1/0.8]" : "aspect-square"
      } w-full flex-col overflow-hidden rounded-[12px] border text-center shadow-[0_10px_20px_rgba(15,23,42,0.10)] ring-1 ring-white/70 transition-all duration-150 hover:-translate-y-[1px] hover:shadow-[0_14px_24px_rgba(15,23,42,0.14)] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 dark:ring-slate-800/60`
    : `
                group relative flex aspect-[1/1.04] w-full flex-col overflow-hidden rounded-[16px] border text-center
                shadow-[0_12px_24px_rgba(15,23,42,0.10)] ring-1 ring-white/70 transition-all duration-150
                hover:-translate-y-[2px] hover:shadow-[0_18px_32px_rgba(15,23,42,0.16)] active:scale-[0.97]
                dark:shadow-[0_12px_28px_rgba(0,0,0,0.38)] dark:hover:shadow-[0_18px_34px_rgba(0,0,0,0.45)]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60
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
          {renderedProducts.map((product) => {
            const theme = getProductTheme(product);
            const productName = String(product?.name || "").trim() || "Unnamed Product";
            const formattedPrice = formatCurrency
              ? formatCurrency(parseFloat(product.price))
              : product.price;
            const initial = productName.charAt(0).toUpperCase();

            return (
              <button
                key={product.id}
                onClick={() => onAddProduct(product)}
                className={`${cardBaseClass} ${theme.card}`}
                title={productName}
              >
                <span
                  className={`pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rounded-full ${theme.dot}`}
                />
                {compactLike ? (
                  <div
                    className={
                      isDense
                        ? "relative flex h-full w-full flex-col items-center justify-center px-1.5 py-2"
                        : "relative flex h-full w-full flex-col items-center justify-center px-2 py-2"
                    }
                  >
                    <p
                      className="flex h-[3.5em] w-full items-center justify-center"
                    >
                      <span
                        className={
                          isDense
                            ? "block w-full px-0.5 text-center text-[10px] font-semibold leading-[1.15] text-slate-800 dark:text-slate-100"
                            : isCompact
                            ? "block w-full px-0.5 text-center text-[12px] font-semibold leading-[1.15] text-slate-800 dark:text-slate-100"
                            : "block w-full px-0.5 text-center text-[14px] font-semibold leading-[1.15] text-slate-800 dark:text-slate-100"
                        }
                        style={PRODUCT_NAME_CLAMP_STYLE}
                      >
                        {productName}
                      </span>
                    </p>
                    <span
                      className={
                        isDense
                          ? "mt-1 text-center text-[10px] font-extrabold leading-none text-slate-900 dark:text-slate-50"
                          : "mt-3 inline-flex items-center justify-center rounded-full border border-white/60 bg-white/20 px-2.5 py-1 text-center text-[12px] font-extrabold leading-none text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-900/20 dark:text-slate-50"
                      }
                    >
                      {formattedPrice}
                    </span>
                  </div>
                ) : (
                  <div className="relative flex h-full w-full flex-col">
                    <div className="relative w-full min-h-0 overflow-hidden border-b border-white/40 p-1 dark:border-slate-700/60 h-[64%]">
                      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[12px] border border-white/60 bg-white/65 dark:border-slate-700/50 dark:bg-slate-900/55">
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={productName}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.src = fallbackSrc;
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/40 via-white/20 to-white/5 dark:from-slate-800/50 dark:via-slate-800/35 dark:to-slate-900/30">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/75 text-sm font-bold text-slate-700 ring-1 ring-white/90 dark:bg-slate-800/85 dark:text-slate-100 dark:ring-slate-700/80">
                              {initial || "•"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full flex-1 flex-col items-center justify-center gap-0.5 px-2 pb-2 pt-0.5">
                      <p className="flex h-[2em] w-full items-center justify-center">
                        <span
                          className="block w-full px-0.5 text-center text-[12px] font-semibold leading-tight tracking-[0.01em] text-slate-800 dark:text-slate-50"
                          style={{
                            ...PRODUCT_NAME_CLAMP_STYLE,
                            WebkitLineClamp: 2,
                          }}
                        >
                          {productName}
                        </span>
                      </p>
                      <span
                        className="text-center text-[11px] font-extrabold leading-none text-slate-900 dark:text-slate-50"
                      >
                        {formattedPrice}
                      </span>
                    </div>
                  </div>
                )}
              </button>
            );
          })}
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
