export function normalizeCategoryValue(value) {
  return value ? String(value).trim().toLowerCase() : "";
}

export function normalizeCompileSettings(data = {}) {
  const normalizedIds = (data.excludedItems || [])
    .map((value) => {
      if (value === null || value === undefined || value === "") return null;
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) return numeric;
      return String(value).trim();
    })
    .filter((val) => val !== null && val !== "");

  const normalizedCategories = (data.excludedCategories || [])
    .map((val) => normalizeCategoryValue(val))
    .filter(Boolean);

  return { normalizedIds, normalizedCategories };
}

export function normalizeItemName(value) {
  return (value || "").replace(/[\s-]/g, "").toLowerCase();
}

export function mergeOrdersById(previousOrders = [], nextOrders = []) {
  const map = new Map((previousOrders || []).map((order) => [order.id, order]));
  (nextOrders || []).forEach((order) => {
    map.set(order.id, { ...map.get(order.id), ...order });
  });
  return Array.from(map.values());
}

export function normalizeOrderWithKitchenStatus(order, items, drinksList, isKitchenExcludedItem) {
  const drinksLower = (drinksList || []).map((drink) =>
    String(drink || "").replace(/[\s-]/g, "").toLowerCase()
  );

  const normalizedItems = (items || []).map((item) => {
    const normalizedName = normalizeItemName(item.name || item.product_name || "");
    const isExcluded =
      drinksLower.includes(normalizedName) || Boolean(isKitchenExcludedItem?.(item));

    if (isExcluded && item.kitchen_status !== "delivered") {
      return { ...item, kitchen_status: "delivered", kitchen_excluded: true };
    }
    return { ...item, kitchen_excluded: isExcluded || item.kitchen_excluded === true };
  });

  const relevantItems = normalizedItems.filter((item) => !item.kitchen_excluded);

  let overallKitchenStatus = "new";
  if (
    relevantItems.length > 0 &&
    relevantItems.every((item) => item.kitchen_status === "delivered")
  ) {
    overallKitchenStatus = "delivered";
  } else if (relevantItems.some((item) => item.kitchen_status === "ready")) {
    overallKitchenStatus = "ready";
  } else if (relevantItems.some((item) => item.kitchen_status === "preparing")) {
    overallKitchenStatus = "preparing";
  }

  return { ...order, items: normalizedItems, overallKitchenStatus };
}
