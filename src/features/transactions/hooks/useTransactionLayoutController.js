import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useTransactionLayoutController({
  categories,
  setCategoryOrderKeys,
  setCurrentCategoryIndex,
  normalizeGroupKey,
  activeCategory,
}) {
  const [categoryColumnSlots, setCategoryColumnSlots] = useState(0);
  const rightCategoryColumnRef = useRef(null);
  const categoryMeasureRef = useRef(null);
  const [bottomBarScrollable, setBottomBarScrollable] = useState(false);
  const [bottomScrollEnd, setBottomScrollEnd] = useState(false);
  const [bottomScrollStart, setBottomScrollStart] = useState(true);
  const [topRowScroll, setTopRowScroll] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });
  const [rightColScroll, setRightColScroll] = useState({
    canScrollUp: false,
    canScrollDown: false,
  });
  const [rightColThumb, setRightColThumb] = useState({ heightPct: 0, translatePct: 0 });
  const topRowRef = useRef(null);

  const activeCategoryKeyRef = useRef("");
  useEffect(() => {
    activeCategoryKeyRef.current = normalizeGroupKey(activeCategory);
  }, [activeCategory, normalizeGroupKey]);

  const categoriesRef = useRef(categories);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    // Keep selection stable when categories change/reorder.
    if (!Array.isArray(categories) || categories.length === 0) {
      setCurrentCategoryIndex(0);
      return;
    }
    const key = activeCategoryKeyRef.current;
    const idx = key
      ? categories.findIndex((cat) => normalizeGroupKey(cat) === key)
      : -1;
    if (idx >= 0) {
      setCurrentCategoryIndex(idx);
      return;
    }
    setCurrentCategoryIndex((prev) =>
      Math.min(Math.max(0, prev), categories.length - 1)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const [isReorderingCategories, setIsReorderingCategories] = useState(false);
  const [draggingCategoryKey, setDraggingCategoryKey] = useState("");
  const draggedCategoryKeyRef = useRef("");
  const reorderCategoryByKeyToIndex = useCallback((fromKey, toIdx) => {
    const current = categoriesRef.current || [];
    const key = normalizeGroupKey(fromKey);
    if (!key) return;
    const fromIdx = current.findIndex((cat) => normalizeGroupKey(cat) === key);
    if (fromIdx < 0) return;
    if (!Number.isFinite(toIdx) || toIdx < 0 || toIdx >= current.length) return;
    if (fromIdx === toIdx) return;

    const next = [...current];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    const nextKeys = next.map((cat) => normalizeGroupKey(cat)).filter(Boolean);
    setCategoryOrderKeys(nextKeys);

    const activeKey = activeCategoryKeyRef.current;
    const nextActiveIdx = Math.max(0, nextKeys.indexOf(activeKey));
    setCurrentCategoryIndex(nextActiveIdx);
  }, []);

  const updateRightThumb = useCallback(() => {
    const node = rightCategoryColumnRef.current;
    if (!node) return;
    const { scrollTop, scrollHeight, clientHeight } = node;
    const trackHeight = Math.max(1, scrollHeight);
    const visible = Math.max(1, clientHeight);
    const heightPct = Math.min(100, (visible / trackHeight) * 100);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const translatePct = Math.min(
      100 - heightPct,
      (scrollTop / maxScroll) * (100 - heightPct)
    );
    setRightColThumb({ heightPct, translatePct });
  }, []);

  const measureCategorySlots = useCallback(() => {
    if (typeof window === "undefined") return;
    const column = rightCategoryColumnRef.current;
    const sample = categoryMeasureRef.current;
    if (!column || !sample) return;
    const columnHeight = column.clientHeight;
    const itemHeight = sample.clientHeight;
    if (!columnHeight || !itemHeight) return;
    const gapRaw = window.getComputedStyle(column).rowGap;
    const gap = Number.isFinite(parseFloat(gapRaw)) ? parseFloat(gapRaw) : 0;
    const slots = Math.max(
      1,
      Math.floor((columnHeight + gap) / (itemHeight + gap))
    );
    setCategoryColumnSlots((prev) => (prev === slots ? prev : slots));
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || categories.length === 0) return;
    const id = window.requestAnimationFrame(measureCategorySlots);
    window.addEventListener("resize", measureCategorySlots);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", measureCategorySlots);
    };
  }, [categories.length, measureCategorySlots]);

  useEffect(() => {
    const checkScroll = (ref, setter, isVertical) => {
      if (!ref?.current) return;
      if (isVertical) {
        const { scrollTop, scrollHeight, clientHeight } = ref.current;
        setter({
          canScrollUp: scrollTop > 0,
          canScrollDown: scrollTop + clientHeight < scrollHeight - 1,
        });
        if (ref?.current === rightCategoryColumnRef.current) {
          updateRightThumb();
        }
      } else {
        const { scrollLeft, scrollWidth, clientWidth } = ref.current;
        setter({
          canScrollLeft: scrollLeft > 0,
          canScrollRight: scrollLeft + clientWidth < scrollWidth - 1,
        });
      }
    };

    const handleTopRowScroll = () => checkScroll(topRowRef, setTopRowScroll, false);
    const handleRightColScroll = () =>
      checkScroll(rightCategoryColumnRef, setRightColScroll, true);

    const handleResize = () => {
      handleTopRowScroll();
      handleRightColScroll();
    };

    topRowRef.current?.addEventListener("scroll", handleTopRowScroll);
    rightCategoryColumnRef.current?.addEventListener("scroll", handleRightColScroll);
    window.addEventListener("resize", handleResize);

    handleTopRowScroll();
    handleRightColScroll();
    updateRightThumb();

    return () => {
      topRowRef.current?.removeEventListener("scroll", handleTopRowScroll);
      rightCategoryColumnRef.current?.removeEventListener(
        "scroll",
        handleRightColScroll
      );
      window.removeEventListener("resize", handleResize);
    };
  }, [updateRightThumb]);

  useLayoutEffect(() => {
    updateRightThumb();
  }, [categories.length, updateRightThumb]);

  const handleCategoryScrollUp = useCallback(() => {
    if (topRowRef.current) {
      topRowRef.current.scrollBy({ top: -80, behavior: "smooth" });
    }
  }, []);

  const handleCategoryScrollDown = useCallback(() => {
    if (topRowRef.current) {
      topRowRef.current.scrollBy({ top: 80, behavior: "smooth" });
    }
  }, []);

  return {
    rightCategoryColumnRef,
    categoryMeasureRef,
    topRowRef,
    categoryColumnSlots,
    bottomBarScrollable,
    bottomScrollStart,
    bottomScrollEnd,
    topRowScroll,
    rightColScroll,
    rightColThumb,
    isReorderingCategories,
    setIsReorderingCategories,
    draggingCategoryKey,
    setDraggingCategoryKey,
    draggedCategoryKeyRef,
    reorderCategoryByKeyToIndex,
    measureCategorySlots,
    updateRightThumb,
    handleCategoryScrollUp,
    handleCategoryScrollDown,
    setBottomBarScrollable,
    setBottomScrollStart,
    setBottomScrollEnd,
  };
}

