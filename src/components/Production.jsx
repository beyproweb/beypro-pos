// 📁 Production.jsx (frontend)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Pencil } from 'lucide-react';
import RecipeModal from '../modals/RecipeModal';
import StockConfirmModal from '../modals/StockConfirmModal';
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import secureFetch from "../utils/secureFetch";
import { useAuth } from "../context/AuthContext";
import { useHeader } from "../context/HeaderContext";

export default function Production() {
  const [recipes, setRecipes] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [loadingMap, setLoadingMap] = useState({});
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [stockModal, setStockModal] = useState({
    open: false,
    product: null,
    quantity: 0,
    unit: '',
    productObj: null,
    batchCount: 1,
    expiryDate: null,
  });
  const [historyMap, setHistoryMap] = useState({});
  const [lockedProduce, setLockedProduce] = useState({});

  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { setHeader } = useHeader();

  const toSafeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\s+/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  };

  const normalizeUnit = (value) => {
    if (!value) return "";
    const v = String(value).trim().toLowerCase();
    if (v === "l") return "lt";
    if (v === "lt") return "lt";
    if (v === "piece" || v === "pieces") return "pcs";
    return v;
  };

  useEffect(() => {
    setHeader({ title: "Productions" });
    return () => setHeader({});
  }, [setHeader]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await secureFetch("/ingredient-prices");
        if (cancelled) return;
        setIngredientPrices(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setIngredientPrices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tenantId = useMemo(() => {
    if (currentUser?.restaurant_id) return String(currentUser.restaurant_id);
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("restaurant_id");
      if (stored) return String(stored);
    }
    return null;
  }, [currentUser]);

  const filterByTenant = useCallback(
    (items) => {
      if (!tenantId) return items;
      return items.filter((recipe) => {
        const owners = [
          recipe.restaurant_id,
          recipe.restaurantId,
          recipe.tenant_id,
          recipe.tenantId,
        ]
          .filter(Boolean)
          .map(String);
        return owners.length > 0 && owners.includes(tenantId);
      });
    },
    [tenantId]
  );

  const loadRecipes = useCallback(async () => {
    try {
      const endpoint = tenantId
        ? `/production/recipes?restaurant_id=${tenantId}`
        : "/production/recipes";
      const data = await secureFetch(endpoint);
      const recipeList = Array.isArray(data) ? data : [];
      const normalized = recipeList.map((recipe) => {
        const owners = [
          recipe.restaurant_id,
          recipe.restaurantId,
          recipe.tenant_id,
          recipe.tenantId,
        ].filter(Boolean);
        if (!owners.length && tenantId) {
          return {
            ...recipe,
            restaurant_id: tenantId,
          };
        }
        return recipe;
      });

      const filtered = filterByTenant(normalized);

      setRecipes(filtered);

      const initialQuantities = {};
      filtered.forEach((recipe) => {
        initialQuantities[recipe.name] = 1;
      });
      setQuantities(initialQuantities);

      const historyAccumulator = {};
      const readyMap = {};

      await Promise.all(
        filtered.map(async (recipe) => {
          const encodedName = encodeURIComponent(recipe.name);
          try {
            const historyEndpoint = tenantId
              ? `/production/production-log/history?product=${encodedName}&restaurant_id=${tenantId}&limit=5`
              : `/production/production-log/history?product=${encodedName}&limit=5`;
            const history = await secureFetch(historyEndpoint);
            historyAccumulator[recipe.name] = Array.isArray(history) ? history : [];
          } catch (err) {
            console.error("❌ Failed to load history:", err);
            historyAccumulator[recipe.name] = [];
          }

          try {
            const unstockedEndpoint = tenantId
              ? `/production/production-log/unstocked?product=${encodedName}&restaurant_id=${tenantId}&limit=1`
              : `/production/production-log/unstocked?product=${encodedName}&limit=1`;
            const unstocked = await secureFetch(unstockedEndpoint);
            if (Array.isArray(unstocked) && unstocked.length > 0) {
              readyMap[recipe.name] = "ready";
            }
          } catch {
            /* ignore */
          }
        })
      );

      setHistoryMap(historyAccumulator);
      if (Object.keys(readyMap).length) {
        setLoadingMap((prev) => ({ ...prev, ...readyMap }));
      }
    } catch (err) {
      console.error("❌ Failed to load recipes:", err);
      setRecipes([]);
      setQuantities({});
    }
  }, [filterByTenant, tenantId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRecipes();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRecipes]);

  const handleAdjust = (productName, delta) => {
    setQuantities((prev) => ({
      ...prev,
      [productName]: Math.max(1, (prev[productName] ?? 1) + delta),
    }));
  };

  const fetchProductHistory = async (productName) => {
    try {
      const historyEndpoint = tenantId
        ? `/production/production-log/history?product=${encodeURIComponent(productName)}&restaurant_id=${tenantId}&limit=5`
        : `/production/production-log/history?product=${encodeURIComponent(productName)}&limit=5`;
      const history = await secureFetch(historyEndpoint);
      setHistoryMap((prev) => ({
        ...prev,
        [productName]: Array.isArray(history) ? history : [],
      }));
    } catch (err) {
      console.error("❌ Failed to load history:", err);
    }
  };

  const logProduction = useCallback(
    async (payload, { swallowNotFound = false } = {}) => {
      try {
        const enrichedPayload = {
          ...payload,
          restaurant_id: tenantId || null,
        };
        await secureFetch("/production/production-log", {
          method: "POST",
          body: JSON.stringify(enrichedPayload),
        });
        return true;
      } catch (err) {
        const message = String(err?.message || "");
        if (swallowNotFound && message.includes("404")) {
          console.info(
            "ℹ️ production/production-log endpoint not available (404). Skipping server log."
          );
          return false;
        }
        throw err;
      }
    },
    [tenantId]
  );

  const ingredientPriceMap = useMemo(() => {
    const byNameUnit = new Map(); // name|unit -> price
    const byName = new Map(); // name -> price

    for (const row of Array.isArray(ingredientPrices) ? ingredientPrices : []) {
      const name = String(row?.name || row?.ingredient || "").trim().toLowerCase();
      if (!name) continue;
      const unit = normalizeUnit(row?.unit);
      const price = toSafeNumber(
        row?.current_price ??
          row?.price_per_unit ??
          row?.unit_price ??
          row?.cost_per_unit ??
          row?.costPrice ??
          row?.price ??
          0
      );
      if (!(price > 0)) continue;
      if (unit) byNameUnit.set(`${name}|${unit}`, price);
      if (!byName.has(name)) byName.set(name, price);
    }

    return { byNameUnit, byName };
  }, [ingredientPrices]);

  const computeRecipeCostPerUnit = useCallback(
    (recipe) => {
      const precomputed = toSafeNumber(
        recipe?.cost_per_unit ?? recipe?.costPerUnit ?? recipe?.unit_cost ?? 0
      );
      if (precomputed > 0) return precomputed;

      const baseQty = toSafeNumber(recipe?.base_quantity ?? recipe?.baseQuantity ?? 0);
      if (!(baseQty > 0)) return 0;

      const list = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      const totalCost = list.reduce((sum, ing) => {
        const ingName = String(ing?.name || "").trim().toLowerCase();
        if (!ingName) return sum;
        const ingUnit = normalizeUnit(ing?.unit);
        const amount = toSafeNumber(
          ing?.amountPerBatch ??
            ing?.amount_per_batch ??
            ing?.amount ??
            ing?.qty ??
            ing?.quantity ??
            0
        );
        if (!(amount > 0)) return sum;

        const price =
          (ingUnit ? ingredientPriceMap.byNameUnit.get(`${ingName}|${ingUnit}`) : null) ??
          ingredientPriceMap.byName.get(ingName) ??
          0;
        return sum + amount * toSafeNumber(price);
      }, 0);

      const perUnit = totalCost / baseQty;
      return perUnit > 0 ? perUnit : 0;
    },
    [ingredientPriceMap]
  );

  /**
   * Produce a product (deduct ingredients + log)
   * Returns true on success, false on failure.
   */
  const handleProduce = async (product) => {
    try {
      if (lockedProduce[product.name]) {
        console.warn(`⛔ Prevented duplicate produce for: ${product.name}`);
        return false;
      }
      setLockedProduce((prev) => ({ ...prev, [product.name]: true }));
      setLoadingMap((prev) => ({ ...prev, [product.name]: 'producing' }));

      const batchCount = quantities[product.name] ?? 1;
      const payload = {
        product_name: product.name,
        base_quantity: product.base_quantity,
        batch_count: batchCount,
        produced_by: 'admin',
        ingredients: product.ingredients,
        product_unit: product.output_unit,
      };

      await logProduction(payload, { swallowNotFound: true });

      // success → show “ready” briefly, refresh history
      fetchProductHistory(product.name);
      setLoadingMap((prev) => ({ ...prev, [product.name]: 'ready' }));
      setTimeout(() => {
        setLoadingMap((prev) => ({ ...prev, [product.name]: null }));
        setLockedProduce((prev) => ({ ...prev, [product.name]: false }));
      }, 1200);

      return true;
    } catch (e) {
      console.error(e);
      toast.error(
        e?.message
          ? `${t('Failed to log production')}: ${e.message}`
          : t('Failed to log production (ingredient deduction).')
      );
      setLoadingMap((prev) => ({ ...prev, [product.name]: null }));
      setLockedProduce((prev) => ({ ...prev, [product.name]: false }));
      return false;
    }
  };

  /**
   * Add finished product to stock after production is logged
   */
  const handleAddToStock = async ({
    supplier_id,
    quantity,
    name,
    unit,
    productObj,
    batchCount,
    expiry_date,
  }) => {
    try {
      const targetRecipe = productObj || recipes.find((r) => r.name === name) || null;
      if (!targetRecipe) {
        toast.error(t("Unable to find recipe details for this product."));
        return;
      }

      // ✅ 1) Always log production first (deduct ingredients)
      const payloadLog = {
        product_name: targetRecipe.name,
        base_quantity: targetRecipe.base_quantity,
        batch_count:
          batchCount ??
          Math.max(1, Math.round(quantity / (targetRecipe.base_quantity || 1))),
        produced_by: "admin",
        ingredients: targetRecipe.ingredients,
        product_unit: targetRecipe.output_unit,
      };

      console.log("🧾 Calling /production-log with:", payloadLog);
      await logProduction(payloadLog, { swallowNotFound: true });

      const costPerUnit = computeRecipeCostPerUnit(targetRecipe);

      // ✅ 2) Then add finished product to stock (include cost/unit for stock pricing)
      const payloadStock = {
        supplier_id,
        name,
        quantity,
        unit,
        from_production: true,
        restaurant_id: tenantId || null,
        batch_count:
          batchCount ?? Math.max(1, Math.round(quantity / (targetRecipe.base_quantity || 1))),
        expiry_date: expiry_date || targetRecipe?.expiry_date || null,
        ...(costPerUnit > 0
          ? {
              price_per_unit: costPerUnit,
              total_value: costPerUnit * toSafeNumber(quantity),
            }
          : {}),
      };
      console.log("📤 Sending final stock payload:", payloadStock);

      await secureFetch("/stock", {
        method: "POST",
        body: JSON.stringify(payloadStock),
      });

      toast.success(`✔️ "${name}" added to stock!`);
    } catch (err) {
      console.error(err);
      toast.error(
        err?.message ? `❌ ${err.message}` : "❌ Network error during production/stock add!"
      );
    } finally {
      setLoadingMap((prev) => ({ ...prev, [name]: null }));
      setLockedProduce((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleAddOrUpdateRecipe = async (recipe) => {
    try {
      const payload = { ...recipe };
      if (tenantId) {
        payload.restaurant_id = tenantId;
        payload.restaurantId = tenantId;
        payload.tenant_id = tenantId;
        payload.tenantId = tenantId;
      }

      if (editRecipe) {
        const recipeIdentifier = editRecipe.id || editRecipe._id;
        const encodedId = recipeIdentifier
          ? encodeURIComponent(recipeIdentifier)
          : null;
        let updated = false;

        if (encodedId) {
          try {
            const updateEndpoint = tenantId
              ? `/production/recipes/${encodedId}?restaurant_id=${tenantId}`
              : `/production/recipes/${encodedId}`;
            await secureFetch(updateEndpoint, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
            updated = true;
          } catch (err) {
            console.warn(
              "⚠️ PUT /production/recipes failed, attempting delete + recreate",
              err
            );
            try {
              const deleteEndpoint = tenantId
                ? `/production/recipes/${encodedId}?restaurant_id=${tenantId}`
                : `/production/recipes/${encodedId}`;
              await secureFetch(deleteEndpoint, {
                method: "DELETE",
              });
            } catch (delErr) {
              console.error(
                "❌ Failed to delete recipe before recreate",
                delErr
              );
            }
          }
        }

        if (!updated) {
          const fallbackCreateEndpoint = tenantId
            ? `/production/recipes?restaurant_id=${tenantId}`
            : "/production/recipes";
          await secureFetch(fallbackCreateEndpoint, {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      } else {
        const createEndpoint = tenantId
          ? `/production/recipes?restaurant_id=${tenantId}`
          : "/production/recipes";
        await secureFetch(createEndpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await loadRecipes();
      toast.success(editRecipe ? t("Recipe updated!") : t("Recipe added!"));
    } catch (err) {
      console.error("❌ Failed to save recipe:", err);
      toast.error(err?.message || t("Failed to save recipe."));
    } finally {
      setEditRecipe(null);
    }
  };

  const handleDeleteRecipe = async (recipeName) => {
    const recipe = recipes.find(r => r.name === recipeName);
    if (!recipe) return;
    const recipeId = recipe.id || recipe._id || recipeName;
    try {
      const deleteEndpoint = tenantId
        ? `/production/recipes/${encodeURIComponent(recipeId)}?restaurant_id=${tenantId}`
        : `/production/recipes/${encodeURIComponent(recipeId)}`;
      await secureFetch(deleteEndpoint, {
        method: "DELETE",
      });
      await loadRecipes();
      toast.success(t("Recipe deleted"));
    } catch (err) {
      console.error("❌ Failed to delete recipe:", err);
      toast.error(err?.message || t("Failed to delete recipe."));
    }
  };

  const handleEdit = (recipe) => {
    setEditRecipe(recipe);
    setShowModal(true);
  };

  return (
    <div className="p-4 bg-gradient-to-br from-white-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 min-h-screen transition-colors">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => {
            setEditRecipe(null);
            setShowModal(true);
          }}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all"
        >
          ➕ {t("New Recipe")}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map((product) => {
          const batches = quantities[product.name] ?? 1;
          const totalOut = product.base_quantity * batches;
          const isBusy = loadingMap[product.name] === 'producing';

          return (
            <div key={product.name} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-lg transition-all">
              <div className="flex items-center justify-between mb-2">
                <div className="text-4xl">{product.emoji}</div>
                <div className="text-sm text-gray-500 dark:text-gray-300">
                  <span className="font-medium">{t("Total Output")}:</span>{' '}
                  {totalOut} {product.output_unit}
                </div>
              </div>

              <h2 className="text-xl font-bold mb-2 text-gray-800 dark:text-white">{product.name}</h2>

              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => handleAdjust(product.name, -1)}
                  className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  disabled={isBusy}
                >
                  <Minus />
                </button>
                <span className="text-lg font-semibold text-gray-800 dark:text-white">
                  {batches} {t("batch(es)")}
                </span>
                <button
                  onClick={() => handleAdjust(product.name, 1)}
                  className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                  disabled={isBusy}
                >
                  <Plus />
                </button>
              </div>

              <div className="flex justify-between mt-4 gap-2">
                <button
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:brightness-110 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  disabled={isBusy}
                  onClick={async () => {
                    // 1) Log production & deduct ingredients
                    const ok = await handleProduce(product);
                    if (!ok) return; // stop if deduction/log failed

                    // 2) Open modal to add finished product to stock
                    setStockModal({
  open: true,
  product: product.name,
  quantity: product.base_quantity * (quantities[product.name] || 1),
  unit: product.output_unit,
  productObj: product,                    // ✅ include full recipe
  batchCount: (quantities[product.name] || 1),
  expiryDate: product?.expiry_date || null,
}); 
                  }}
                >
                  ➕ {t("Add to Stock")}
                </button>

                <button
                  onClick={() => handleEdit(product)}
                  className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg flex items-center justify-center"
                  title={t("Edit Recipe")}
                >
                  <Pencil size={20} className="text-gray-700 dark:text-white" />
                </button>
              </div>

              {historyMap[product.name] && historyMap[product.name].length > 0 && (
                <div className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                  <h4 className="font-semibold mb-1">📅 {t("Recent Productions")}:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {historyMap[product.name].map((entry, i) => (
                      <li key={i}>
                        {new Date(entry.created_at).toLocaleString()} – {entry.quantity_produced} {product.output_unit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recipe Modal */}
      <RecipeModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditRecipe(null);
        }}
        onSave={handleAddOrUpdateRecipe}
        onDelete={handleDeleteRecipe}
        existingRecipe={editRecipe}
      />

      {/* Add to Stock Modal */}
      <StockConfirmModal
        isOpen={stockModal.open}
        onClose={() =>
          setStockModal({
            open: false,
            product: null,
            quantity: 0,
            unit: "",
            productObj: null,
            batchCount: 1,
            expiryDate: null,
          })
        }
        productName={stockModal.product}
        expectedQuantity={stockModal.quantity}
        unit={stockModal.unit}
        productObj={stockModal.productObj}
        batchCount={stockModal.batchCount}
        expiryDate={stockModal.expiryDate}
        onConfirm={handleAddToStock}
      />
    </div>
  );
}
