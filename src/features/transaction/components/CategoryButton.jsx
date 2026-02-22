import React, { useCallback } from "react";
import { normalizeGroupKey } from "../../transactions/utils/normalization";

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
  setIsReorderingCategories,
  CATEGORY_FALLBACK_IMAGE,
}) {
  const normalizedVariant = variant === "bar" ? "vertical" : variant;
  const slug = (cat || "").trim().toLowerCase();
  const catSrc = categoryImages[slug] || "";
  const resolvedCatSrc = catSrc || CATEGORY_FALLBACK_IMAGE;
  const isDragEnabled = isReorderingCategories && normalizedVariant === "horizontal";
  const key = normalizeGroupKey(cat);
  const isDragging = !!key && key === draggingCategoryKey;
  const hasCatalogSearch = catalogSearch.trim() !== "";

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
      } catch {}
    },
    [cat, isDragEnabled, setDraggingCategoryKey]
  );

  const handleDragOver = useCallback((e) => {
    if (!isDragEnabled) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {}
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
      } catch {}
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

  const baseClasses =
    "flex flex-col items-center justify-center gap-0.5 rounded-lg border bg-white/70 px-1.5 py-1 text-center shadow-xs transition-all duration-100 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/60 active:scale-[0.98] dark:bg-slate-900/50 dark:border-slate-700/50 dark:shadow-xs";

  const paddingClass =
    normalizedVariant === "mobile"
      ? "px-1 py-1.5"
      : normalizedVariant === "grid"
      ? "px-1 py-1"
      : normalizedVariant === "vertical"
      ? "px-1 py-1"
      : normalizedVariant === "horizontal"
      ? "px-1 py-0.5"
      : "px-1.5 py-1.5";

  const widthClass =
    normalizedVariant === "mobile"
      ? "min-w-[80px] max-w-[90px] snap-start"
      : normalizedVariant === "grid"
      ? "w-[80px]"
      : normalizedVariant === "vertical"
      ? "w-[80px]"
      : normalizedVariant === "horizontal"
      ? "w-[80px]"
      : "w-full";
  const activeClasses =
    "border-indigo-400/80 bg-indigo-50 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-950/30";
  const inactiveClasses =
    "border-slate-200/60 hover:border-slate-300 dark:border-slate-700/40 dark:hover:border-slate-600";

  const imageClasses = "h-[48px] w-[48px] object-cover rounded-lg";
  const labelClasses =
    normalizedVariant === "grid" || normalizedVariant === "vertical" || normalizedVariant === "horizontal"
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
      <img
        src={resolvedCatSrc}
        alt={cat}
        className={imageClasses}
        loading="lazy"
        onError={handleTileImageError}
      />
      <span className={labelClasses}>{t(cat)}</span>
    </button>
  );
}

export default React.memo(CategoryButton);
