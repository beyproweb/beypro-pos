import React from "react";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";

const API_URL = import.meta.env.VITE_API_URL || "";
// Accept all your existing state and handlers as props!
export default function KitchenSettingsModal({
  allIngredients,
  excludedIngredients, setExcludedIngredients,
  excludedCategories, setExcludedCategories,
  excludedItems, setExcludedItems,
  products,
  onClose,
}) {
  const { t } = useTranslation();
  const restaurantIdentifier =
    typeof window !== "undefined"
      ? window.localStorage.getItem("restaurant_slug") ||
        window.localStorage.getItem("restaurant_id") ||
        ""
      : "";
  const identifierSuffix = restaurantIdentifier
    ? `?identifier=${encodeURIComponent(restaurantIdentifier)}`
    : "";

  const persistSettings = async (overrides = {}) => {
    try {
      await secureFetch(`/kitchen/compile-settings${identifierSuffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excludedIngredients,
          excludedItems,
          excludedCategories,
          ...overrides,
        }),
      });
    } catch (err) {
      console.error("❌ Failed to persist kitchen settings:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-gradient-to-br from-white/90 to-indigo-50/80 dark:from-[#17172b]/90 dark:to-[#222244]/90 shadow-2xl border border-white/20 dark:border-indigo-900/30 p-8">

        <button
          className="absolute top-4 right-4 p-2 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 text-white shadow-lg hover:scale-110 hover:brightness-110 transition-all z-10"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold text-indigo-700 dark:text-indigo-200 mb-4 tracking-tight">
          🍽️ {t("Kitchen Settings")}
        </h2>

        {/* Exclude Ingredients */}
        <div className="mb-7">
          <div className="font-semibold text-gray-800 dark:text-white mb-2">
            {t("Exclude Ingredients from Compile:")}
          </div>
          <div className="max-h-24 overflow-y-auto rounded-lg bg-white/50 dark:bg-gray-900/30 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border border-white/10 dark:border-white/10">
            {allIngredients.length === 0 ? (
              <div className="text-gray-400">{t("No ingredients found")}</div>
            ) : (
              allIngredients.map((ingredient) => (
                <label
                  key={ingredient}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={excludedIngredients.includes(ingredient)}
                    onChange={() => {
                      setExcludedIngredients((prev) => {
                        const updated = prev.includes(ingredient)
                          ? prev.filter((ing) => ing !== ingredient)
                          : [...prev, ingredient];
                        persistSettings({ excludedIngredients: updated });
                        return updated;
                      });
                    }}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span className="font-medium">{ingredient}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Exclude Items */}
        <div>
          <div className="font-semibold text-gray-800 dark:text-white mb-2">
            {t("Exclude Items from Kitchen:")}
          </div>
          <div className="space-y-5">
            {Array.from(new Set(products.map(p => p.category))).filter(Boolean).map(category => (
              <div
                key={category}
                className="rounded-2xl border border-white/20 dark:border-indigo-800/30 shadow-xl bg-gradient-to-br from-indigo-100/80 to-purple-100/80 dark:from-indigo-900/70 dark:to-purple-900/50 p-4 backdrop-blur-lg group transition-all hover:scale-[1.01] hover:border-accent"
              >
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-accent transition-all"
                    checked={products.filter(p => p.category === category).every(p => excludedItems?.includes(p.id))}
                    onChange={() => {
  const catProducts = products
    .filter((p) => p.category === category)
    .map((p) => p.id);

  setExcludedItems((prev) => {
    const allChecked = catProducts.every((id) => prev.includes(id));
    let updated;

    if (allChecked) {
      // ✅ Uncheck: remove all items of this category
      updated = prev.filter((id) => !catProducts.includes(id));
      // Also ensure the category itself is unexcluded
      persistSettings({
        excludedItems: updated,
        excludedCategories: excludedCategories.filter((c) => c !== category),
      });
    } else {
      // ✅ Check: add all items and mark category excluded
      updated = Array.from(new Set([...prev, ...catProducts]));
      persistSettings({
        excludedItems: updated,
        excludedCategories: Array.from(new Set([...excludedCategories, category])),
      });
    }
    return updated;
  });
}}

                  />
                  <span className="font-bold text-lg bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 bg-clip-text text-transparent drop-shadow">
                    {category}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {products.filter(p => p.category === category).map(product => (
                    <label
                      key={product.id}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 shadow bg-white/80 dark:bg-gray-900/60 border border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-800/40 transition-all"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-purple-600"
                        checked={excludedItems?.includes(product.id)}
                        onChange={() => {
                          setExcludedItems((prev) => {
                            const updated = prev.includes(product.id)
                              ? prev.filter((id) => id !== product.id)
                              : [...prev, product.id];
                            persistSettings({ excludedItems: updated });
                            return updated;
                          });
                        }}
                      />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">
                        {product.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
