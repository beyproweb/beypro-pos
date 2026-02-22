import { useState, useEffect, useMemo } from "react";

export function useQrMenuProducts({
  API_URL,
  restaurantIdentifier,
  appendIdentifier,
  toArray,
}) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [categoryImages, setCategoryImages] = useState({});
  const [menuSearch, setMenuSearch] = useState("");

  const safeProducts = useMemo(() => toArray(products), [products, toArray]);
  const safeCategories = useMemo(() => toArray(categories), [categories, toArray]);
  const safeExtrasGroups = useMemo(() => toArray(extrasGroups), [extrasGroups, toArray]);

  const productsInActiveCategory = useMemo(
    () =>
      safeProducts.filter(
        (p) =>
          (p?.category || "").trim().toLowerCase() ===
          (activeCategory || "").trim().toLowerCase()
      ),
    [safeProducts, activeCategory]
  );

  const productsForGrid = useMemo(() => {
    const q = String(menuSearch || "").trim().toLowerCase();
    if (!q) return productsInActiveCategory;
    return safeProducts.filter((p) => {
      const name = String(p?.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [menuSearch, productsInActiveCategory, safeProducts]);

  useEffect(() => {
    if (!restaurantIdentifier) {
      setCategoryImages({});
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/public/category-images/${encodeURIComponent(restaurantIdentifier)}`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const dict = {};
        (Array.isArray(data) ? data : []).forEach(({ category, image }) => {
          const key = (category || "").trim().toLowerCase();
          if (!key || !image) return;
          dict[key] = image;
        });
        setCategoryImages(dict);
      } catch (err) {
        console.warn("⚠️ Failed to fetch public category images:", err);
        setCategoryImages({});
      }
    })();
  }, [API_URL, restaurantIdentifier]);

  useEffect(() => {
    let cancelled = false;

    const parseArray = (raw) =>
      Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

    const tryJSON = (value) => {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const loadProducts = async () => {
      const assignProducts = (payload) => {
        const list = parseArray(payload);
        setProducts(list);
        const cats = [...new Set(list.map((p) => p.category))].filter(Boolean);
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      };

      try {
        let payload = null;

        if (restaurantIdentifier) {
          const res = await fetch(
            `${API_URL}/public/products/${encodeURIComponent(restaurantIdentifier)}`
          );
          if (!res.ok) throw new Error(`Server responded ${res.status}`);
          payload = await res.json();
        }

        assignProducts(payload);
      } catch (err) {
        console.warn("⚠️ Failed to fetch products:", err);
        setProducts([]);
        setCategories([]);
        setActiveCategory("");
      }
    };

    const loadExtras = async () => {
      if (!restaurantIdentifier) {
        setExtrasGroups([]);
        return;
      }

      try {
        const res = await fetch(
          `${API_URL}/public/extras-groups/${encodeURIComponent(restaurantIdentifier)}`
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const list = await res.json();
        if (cancelled) return;

        const listArray = toArray(list);
        setExtrasGroups(
          listArray.map((g) => ({
            groupName: g.groupName || g.group_name,
            items: typeof g.items === "string" ? tryJSON(g.items) : g.items || [],
          }))
        );
      } catch (err) {
        console.warn("⚠️ Failed to fetch extras groups:", err);
        if (cancelled) return;
        setExtrasGroups([]);
      }
    };

    loadProducts();
    loadExtras();

    return () => {
      cancelled = true;
    };
  }, [appendIdentifier, API_URL, restaurantIdentifier, toArray]);

  return {
    categories,
    setCategories,
    products,
    setProducts,
    extrasGroups,
    setExtrasGroups,
    activeCategory,
    setActiveCategory,
    categoryImages,
    setCategoryImages,
    menuSearch,
    setMenuSearch,
    safeProducts,
    safeCategories,
    safeExtrasGroups,
    productsForGrid,
  };
}

export default useQrMenuProducts;
