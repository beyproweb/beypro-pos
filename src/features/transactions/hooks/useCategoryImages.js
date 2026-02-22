import { useEffect, useRef, useState } from "react";
import { txApiRequest } from "../services/transactionApi";
import {
  readCachedCategoryImages,
  writeCachedCategoryImages,
} from "../utils/cache";
import { prefetchImageUrls } from "../utils/prefetchImageUrls";

export const useCategoryImages = (identifier) => {
  const [categoryImages, setCategoryImages] = useState(() =>
    readCachedCategoryImages()
  );
  const identifierRef = useRef(identifier || "");

  useEffect(() => {
    txApiRequest(`/category-images${identifierRef.current}`)
      .then((data) => {
        const dict = {};
        (Array.isArray(data) ? data : []).forEach(({ category, image }) => {
          const key = (category || "").trim().toLowerCase();
          if (!key || !image) return;
          dict[key] = image;
        });
        setCategoryImages(dict);
        writeCachedCategoryImages(dict);
        prefetchImageUrls(Object.values(dict).filter(Boolean), 16);
      })
      .catch((err) => {
        console.error("❌ Failed to load category images:", err);
        // keep cached images if available
      });
  }, []);

  useEffect(() => {
    prefetchImageUrls(Object.values(categoryImages || {}).filter(Boolean), 16);
  }, [Object.keys(categoryImages || {}).length]); // eslint-disable-line react-hooks/exhaustive-deps

  return { categoryImages };
};
