import React, { useCallback } from "react";
import { normalizeGroupKey } from "../../transactions/utils/normalization";
import { normalizeTableDensity, TABLE_DENSITY } from "../../tables/tableDensity";

function CategoryButton({
  cat,
  idx,
  variant = "desktop",
  isActive,
  isReorderingCategories,
  draggingCategoryKey,
  catalogSearch,
  setCatalogSearch,
  setCurrentCategoryIndex,
  setDraggingCategoryKey,
  reorderCategoryByKeyToIndex,
  categoryImages,
  t,
  CATEGORY_FALLBACK_IMAGE,
  tableDensity = TABLE_DENSITY.COMFORTABLE,
}) {
  const normalizedDensity = normalizeTableDensity(tableDensity);
  const isCompactMode =
    normalizedDensity === TABLE_DENSITY.COMPACT ||
    normalizedDensity === TABLE_DENSITY.DENSE;
  const normalizedVariant = variant === "bar" ? "vertical" : variant;
  const slug = (cat || "").trim().toLowerCase();
  const catSrc = categoryImages[slug] || "";
  const resolvedCatSrc = catSrc || CATEGORY_FALLBACK_IMAGE;
  const isDragEnabled = isReorderingCategories && normalizedVariant === "horizontal";
  const key = normalizeGroupKey(cat);
  const isDragging = !!key && key === draggingCategoryKey;
  const hasCatalogSearch = catalogSearch.trim() !== "";
  const compactPalette = [
    {
      base: "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-900/20",
      text: "text-emerald-900 dark:text-emerald-100",
    },
    {
      base: "border-sky-200/80 bg-sky-50/80 dark:border-sky-500/30 dark:bg-sky-900/20",
      text: "text-sky-900 dark:text-sky-100",
    },
    {
      base: "border-amber-200/80 bg-amber-50/85 dark:border-amber-500/30 dark:bg-amber-900/20",
      text: "text-amber-900 dark:text-amber-100",
    },
    {
      base: "border-rose-200/80 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-900/20",
      text: "text-rose-900 dark:text-rose-100",
    },
    {
      base: "border-violet-200/80 bg-violet-50/80 dark:border-violet-500/30 dark:bg-violet-900/20",
      text: "text-violet-900 dark:text-violet-100",
    },
    {
      base: "border-cyan-200/80 bg-cyan-50/80 dark:border-cyan-500/30 dark:bg-cyan-900/20",
      text: "text-cyan-900 dark:text-cyan-100",
    },
  ];
  const paletteClass = compactPalette[Math.abs(Number(idx) || 0) % compactPalette.length];

  const clearDraggingCategory = useCallback(() => {
    setDraggingCategoryKey("");
  }, [setDraggingCategoryKey]);

  const handleSelectCategory = useCallback(() => {
    if (isReorderingCategories) return;
    if (hasCatalogSearch) setCatalogSearch("");
    setCurrentCategoryIndex(idx);
  }, [
    hasCatalogSearch,
    idx,
    isReorderingCategories,
    setCatalogSearch,
    setCurrentCategoryIndex,
  ]);

  const handleDragStart = useCallback(
    (e) => {
      if (!isDragEnabled) return;
      const dragKey = normalizeGroupKey(cat);
      setDraggingCategoryKey(dragKey);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragKey);
      } catch (err) {
        void err;
      }
    },
    [cat, isDragEnabled, setDraggingCategoryKey]
  );

  const handleDragOver = useCallback((e) => {
    if (!isDragEnabled) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {
      void err;
    }
  }, [isDragEnabled]);

  const handleDrop = useCallback(
    (e) => {
      if (!isDragEnabled) return;
      e.preventDefault();
      const fromKey =
        draggingCategoryKey ||
        (() => {
          try {
            return e.dataTransfer.getData("text/plain");
          } catch {
            return "";
          }
        })();
      reorderCategoryByKeyToIndex(fromKey, idx);
      setDraggingCategoryKey("");
    },
    [
      draggingCategoryKey,
      idx,
      isDragEnabled,
      reorderCategoryByKeyToIndex,
      setDraggingCategoryKey,
    ]
  );

  const handlePointerDown = useCallback(
    (e) => {
      if (!isDragEnabled) return;
      const dragKey = normalizeGroupKey(cat);
      setDraggingCategoryKey(dragKey);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        void err;
      }
      e.preventDefault();
    },
    [cat, isDragEnabled, setDraggingCategoryKey]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragEnabled) return;
      if (!draggingCategoryKey) return;
      const el =
        typeof document !== "undefined"
          ? document.elementFromPoint(e.clientX, e.clientY)
          : null;
      const target = el?.closest?.("[data-cat-idx]");
      if (!target) return;
      const toIdx = Number(target.getAttribute("data-cat-idx"));
      if (!Number.isFinite(toIdx)) return;
      reorderCategoryByKeyToIndex(draggingCategoryKey, toIdx);
    },
    [draggingCategoryKey, isDragEnabled, reorderCategoryByKeyToIndex]
  );

  const handleSidebarImageError = useCallback(
    (e) => {
      e.currentTarget.onerror = null;
      e.currentTarget.src = CATEGORY_FALLBACK_IMAGE;
      e.currentTarget.style.objectFit = "contain";
      e.currentTarget.style.padding = "10px";
      e.currentTarget.style.background = "rgba(255,255,255,0.8)";
    },
    [CATEGORY_FALLBACK_IMAGE]
  );

  const handleTileImageError = useCallback(
    (e) => {
      e.currentTarget.onerror = null;
      e.currentTarget.src = CATEGORY_FALLBACK_IMAGE;
      e.currentTarget.style.objectFit = "contain";
      e.currentTarget.style.padding = "6px";
      e.currentTarget.style.background = "rgba(255,255,255,0.75)";
      e.currentTarget.style.borderRadius = "10px";
    },
    [CATEGORY_FALLBACK_IMAGE]
  );

  if (normalizedVariant === "sidebar") {
    if (isCompactMode) {
      return (
        <button
          key={`${variant}-${cat}-${idx}`}
          type="button"
          data-cat-idx={idx}
          onClick={handleSelectCategory}
          className={[
            "group relative flex w-full items-center justify-center overflow-hidden rounded-lg px-2 py-2",
            "border text-left shadow-none transition-all duration-150 select-none",
            isActive ? "" : paletteClass.base,
            "active:scale-[0.985]",
            isActive
              ? "border-[rgb(var(--accent-color))/0.6] bg-[rgb(var(--accent-color))/0.16] dark:bg-[rgb(var(--accent-color))/0.24]"
              : "hover:brightness-[0.97] dark:hover:brightness-110",
          ].join(" ")}
        >
          <span
            className={[
              "min-w-0 truncate text-sm font-semibold leading-tight text-center",
              isActive ? "text-slate-900 dark:text-slate-50" : paletteClass.text,
            ].join(" ")}
          >
            {t(cat)}
          </span>
        </button>
      );
    }

    return (
      <button
        key={`${variant}-${cat}-${idx}`}
        type="button"
        data-cat-idx={idx}
        onClick={handleSelectCategory}
        className={[
          "group relative flex w-full flex-col overflow-hidden rounded-2xl",
          "ring-1 ring-slate-200/70 bg-white/70 shadow-[0_12px_28px_rgba(15,23,42,0.08)]",
          "backdrop-blur-sm transition-all duration-150 select-none",
          "hover:ring-slate-300/80 hover:shadow-[0_18px_36px_rgba(15,23,42,0.10)]",
          "active:scale-[0.985]",
          "dark:bg-slate-950/35 dark:ring-slate-800/70 dark:hover:ring-slate-700/80",
          isActive ? "ring-2 ring-indigo-400/80" : "",
        ].join(" ")}
      >
        <div className="relative h-[62px] w-full overflow-hidden">
          <img
            src={resolvedCatSrc}
            alt={cat}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={handleSidebarImageError}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="flex-1 text-[11px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">
            {t(cat)}
          </span>
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              isActive ? "bg-indigo-500" : "bg-slate-300/70 dark:bg-slate-600/70",
            ].join(" ")}
            aria-hidden="true"
          />
        </div>
      </button>
    );
  }

  const baseClasses = isCompactMode
    ? "flex items-center justify-center gap-0.5 rounded-md border bg-white/75 px-1 py-1 text-center shadow-none transition-all duration-100 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 active:scale-[0.98] dark:bg-slate-900/55 dark:border-slate-700/60"
    : "flex flex-col items-center justify-center gap-0.5 rounded-lg border bg-white/70 px-1.5 py-1 text-center shadow-xs transition-all duration-100 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 active:scale-[0.98] dark:bg-slate-900/50 dark:border-slate-700/50 dark:shadow-xs";

  const paddingClass = isCompactMode
    ? normalizedVariant === "mobile"
      ? "px-1 py-1"
      : "px-1 py-0.5"
    : normalizedVariant === "mobile"
    ? "px-1 py-1.5"
    : normalizedVariant === "grid"
    ? "px-1 py-1"
    : normalizedVariant === "vertical"
    ? "px-1 py-1"
    : normalizedVariant === "horizontal"
    ? "px-1 py-0.5"
    : "px-1.5 py-1.5";

  const widthClass = isCompactMode
    ? normalizedVariant === "mobile"
      ? "min-w-[84px] max-w-[94px] snap-start"
      : normalizedVariant === "grid" || normalizedVariant === "vertical" || normalizedVariant === "horizontal"
      ? "w-[84px]"
      : "w-full"
    : normalizedVariant === "mobile"
    ? "min-w-[80px] max-w-[90px] snap-start"
    : normalizedVariant === "grid"
    ? "w-[80px]"
    : normalizedVariant === "vertical"
    ? "w-[80px]"
    : normalizedVariant === "horizontal"
    ? "w-[80px]"
    : "w-full";
  const activeClasses = isCompactMode
    ? "border-[rgb(var(--accent-color))/0.6] bg-[rgb(var(--accent-color))/0.12] shadow-none dark:bg-[rgb(var(--accent-color))/0.22]"
    : "border-indigo-400/80 bg-indigo-50 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-950/30";
  const inactiveClasses =
    "border-slate-200/60 hover:border-slate-300 dark:border-slate-700/40 dark:hover:border-slate-600";

  const imageClasses = "h-[48px] w-[48px] object-cover rounded-lg";
  const labelClasses = isCompactMode
    ? normalizedVariant === "grid" || normalizedVariant === "vertical" || normalizedVariant === "horizontal"
      ? "text-[11px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[84px] dark:text-slate-200"
      : "text-[12px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[86px] dark:text-slate-200"
    : normalizedVariant === "grid" || normalizedVariant === "vertical" || normalizedVariant === "horizontal"
    ? "text-[10px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[78px] dark:text-slate-200"
    : "text-[11px] font-semibold text-slate-700 text-center leading-tight truncate max-w-[76px] dark:text-slate-200";

  return (
    <button
      key={`${variant}-${cat}-${idx}`}
      type="button"
      data-cat-idx={idx}
      onClick={handleSelectCategory}
      draggable={isDragEnabled}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={clearDraggingCategory}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearDraggingCategory}
      onPointerCancel={clearDraggingCategory}
      className={`${widthClass} ${baseClasses} ${paddingClass} ${
        isActive ? activeClasses : inactiveClasses
      } ${isDragEnabled ? "cursor-grab" : "cursor-pointer"} ${
        isDragging ? "ring-2 ring-indigo-400/70" : ""
      }`}
    >
      {!isCompactMode && (
        <img
          src={resolvedCatSrc}
          alt={cat}
          className={imageClasses}
          loading="lazy"
          onError={handleTileImageError}
        />
      )}
      <span className={labelClasses}>{t(cat)}</span>
    </button>
  );
}

export default React.memo(CategoryButton);
