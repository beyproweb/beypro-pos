const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" &&
      window?.localStorage?.getItem("restaurant_id")) ||
    (typeof window !== "undefined" &&
      window?.localStorage?.getItem("restaurant_slug")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const readCachedProducts = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("products.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return Array.isArray(parsed) ? parsed : [];
};

export const writeCachedProducts = (products) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("products.v1"),
      JSON.stringify(Array.isArray(products) ? products : [])
    );
    localStorage.setItem(
      getRestaurantScopedCacheKey("productsUpdatedAtMs.v1"),
      String(Date.now())
    );
  } catch {}
};

export const readCachedCategoryImages = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("categoryImages.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

export const writeCachedCategoryImages = (imagesByCategory) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("categoryImages.v1"),
      JSON.stringify(
        imagesByCategory && typeof imagesByCategory === "object" ? imagesByCategory : {}
      )
    );
  } catch {}
};

export const readCachedCategoryOrderKeys = () => {
  const raw =
    typeof window !== "undefined"
      ? window?.localStorage?.getItem(getRestaurantScopedCacheKey("categoryOrderKeys.v1"))
      : null;
  const parsed = safeParseJson(raw);
  return Array.isArray(parsed)
    ? parsed.map((v) => String(v ?? "").trim()).filter(Boolean)
    : [];
};

export const writeCachedCategoryOrderKeys = (orderKeys) => {
  try {
    localStorage.setItem(
      getRestaurantScopedCacheKey("categoryOrderKeys.v1"),
      JSON.stringify(Array.isArray(orderKeys) ? orderKeys : [])
    );
  } catch {}
};
