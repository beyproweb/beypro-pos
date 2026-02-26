import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "./ProductCard";

const CategoryTopBar = React.memo(function CategoryTopBar({
  categories,
  activeCategory,
  onSelectCategory,
  categoryImages,
  onCategoryClick,
  apiUrl,
}) {
  const categoryList = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
  const scrollRef = useRef(null);
  const categoryFallbackSrc = "/Beylogo.svg";
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const scrollToCategory = useCallback((index) => {
    const el = scrollRef.current;
    if (!el || index < 0) return;
    const button = el.children[index];
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    const offset =
      buttonRect.left -
      containerRect.left -
      containerRect.width / 2 +
      buttonRect.width / 2;
    el.scrollBy({ left: offset, behavior: "smooth" });
  }, []);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const canScrollLeft = scrollLeft > 0;
    const canScrollRight = scrollLeft + clientWidth < scrollWidth - 1;
    setCanScroll((prev) => {
      if (prev.canScrollLeft === canScrollLeft && prev.canScrollRight === canScrollRight) {
        return prev;
      }
      return { canScrollLeft, canScrollRight };
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const handleResize = () => updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(el);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
    }
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
    };
  }, [updateScrollState, categoryList.length]);

  useEffect(() => {
    if (!activeCategory) return;
    const index = categoryList.findIndex((cat) => cat === activeCategory);
    if (index < 0) return;
    const timer = setTimeout(() => scrollToCategory(index), 0);
    return () => clearTimeout(timer);
  }, [activeCategory, categoryList, scrollToCategory]);

  const handleScroll = useCallback(
    (direction) => {
      const el = scrollRef.current;
      if (!el) return;
      const step = Math.max(el.clientWidth * 0.6, 160);
      el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
    },
    []
  );

  return (
    <div className="relative w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm shadow-sm px-2 py-1">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-0.5"
        style={{ scrollBehavior: "smooth" }}
      >
        {categoryList.map((cat, idx) => {
          const key = cat?.toLowerCase?.();
          const imgSrc = categoryImages?.[key];
          const active = activeCategory === cat;
          const resolvedSrc = imgSrc
            ? /^https?:\/\//.test(imgSrc)
              ? imgSrc
              : `${apiUrl}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
            : "";
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onSelectCategory(cat);
                onCategoryClick?.(cat);
                scrollToCategory(idx);
              }}
              className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-all whitespace-nowrap border
                ${
                  active
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                    : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-white"
                }`}
            >
              <div className="relative w-6 h-6 rounded-full overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-white/70">
                <img
                  src={resolvedSrc || categoryFallbackSrc}
                  alt={cat}
                  className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = categoryFallbackSrc;
                  }}
                />
              </div>
              <span className="tracking-wide">{cat}</span>
            </button>
          );
        })}
      </div>
      {canScroll.canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScroll("left")}
          aria-label="Scroll categories left"
          className="absolute left-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1 text-sm text-neutral-600 shadow-lg backdrop-blur-sm transition hover:bg-white dark:bg-neutral-900/80 dark:text-neutral-300"
        >
          ‹
        </button>
      )}
      {canScroll.canScrollRight && (
        <button
          type="button"
          onClick={() => handleScroll("right")}
          aria-label="Scroll categories right"
          className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/80 p-1 text-sm text-neutral-600 shadow-lg backdrop-blur-sm transition hover:bg-white dark:bg-neutral-900/80 dark:text-neutral-300"
        >
          ›
        </button>
      )}
    </div>
  );
});

const ProductGrid = React.memo(function ProductGrid({ products, onProductClick, t, apiUrl }) {
  const productList = Array.isArray(products) ? products : [];

  return (
    <main className="w-full max-w-none mx-auto pt-3 pb-28 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4 xl:gap-5">
      {productList.length === 0 && (
        <div className="col-span-full text-center text-neutral-400 font-medium text-lg py-12 italic">
          {t("No products available.")}
        </div>
      )}

      {productList.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          apiUrl={apiUrl}
          onOpenProduct={onProductClick}
        />
      ))}
    </main>
  );
});

const MenuProductsSection = React.memo(function MenuProductsSection({
  categories,
  activeCategory,
  categoryImages,
  products,
  onSelectCategory,
  onCategoryClick,
  onOpenProduct,
  t,
  apiUrl,
}) {
  return (
    <section className="order-2 xl:order-none">
      <div className="mb-4">
        <CategoryTopBar
          categories={categories}
          activeCategory={activeCategory}
          onSelectCategory={onSelectCategory}
          categoryImages={categoryImages}
          onCategoryClick={onCategoryClick}
          apiUrl={apiUrl}
        />
      </div>
      <ProductGrid products={products} onProductClick={onOpenProduct} t={t} apiUrl={apiUrl} />
    </section>
  );
});

export default MenuProductsSection;
