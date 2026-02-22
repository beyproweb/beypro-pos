import { useEffect, useMemo } from "react";

export const useTxProductImagePrefetch = ({
  activeCategory,
  products,
  prefetchImageUrls,
  limit = 36,
}) => {
  const activeCategoryImageUrls = useMemo(
    () =>
      (Array.isArray(products) ? products : [])
        .filter(
          (p) =>
            (p?.category || "").trim().toLowerCase() ===
            (activeCategory || "").trim().toLowerCase()
        )
        .map((p) => p?.image)
        .filter(Boolean),
    [activeCategory, products]
  );

  useEffect(() => {
    prefetchImageUrls(activeCategoryImageUrls, limit);
  }, [activeCategoryImageUrls, limit, prefetchImageUrls]);
};
