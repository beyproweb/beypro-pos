import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide px-0.5"
        style={{ scrollBehavior: "smooth" }}
      >
        {categoryList.map((cat, idx) => {
          const key = (cat || "").trim().toLowerCase();
          const imgSrc = categoryImages?.[key];
          const active = activeCategory === cat;
          const resolvedSrc = imgSrc
            ? /^https?:\/\//.test(String(imgSrc))
              ? String(imgSrc)
              : `${apiUrl}/uploads/${String(imgSrc).replace(/^\/?uploads\//, "")}`
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
              className={`flex-none w-32 min-w-[120px] rounded-2xl border bg-white/90 dark:bg-neutral-900/75 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                active
                  ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                  : "border-gray-200 text-gray-700 dark:border-neutral-800 dark:text-neutral-200"
              }`}
            >
              <div className="p-3 flex flex-col items-center gap-2">
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="text-xs font-semibold leading-tight text-center truncate w-full">{cat}</span>
              </div>
            </button>
          );
        })}
      </div>
      {canScroll.canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScroll("left")}
          aria-label="Scroll categories left"
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
        >
          <ChevronLeft className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
        </button>
      )}
      {canScroll.canScrollRight && (
        <button
          type="button"
          onClick={() => handleScroll("right")}
          aria-label="Scroll categories right"
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
        >
          <ChevronRight className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
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
  const hasCategories = Array.isArray(categories) && categories.length > 0;

  return (
    <section className="order-2 xl:order-none min-w-0">
      {hasCategories ? (
        <div className="sticky top-[74px] sm:top-[80px] z-30 mb-4 -mx-1 px-1 py-1 bg-neutral-50/88 dark:bg-neutral-900/88 backdrop-blur-md">
          <CategoryTopBar
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={onSelectCategory}
            categoryImages={categoryImages}
            onCategoryClick={onCategoryClick}
            apiUrl={apiUrl}
          />
        </div>
      ) : null}
      <ProductGrid products={products} onProductClick={onOpenProduct} t={t} apiUrl={apiUrl} />
    </section>
  );
});

export default MenuProductsSection;
