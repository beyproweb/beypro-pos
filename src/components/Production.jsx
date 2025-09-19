// 📁 Production.jsx (frontend)
import React, { useEffect, useState } from 'react';
import { Minus, Plus, Pencil } from 'lucide-react';
import RecipeModal from '../modals/RecipeModal';
import StockConfirmModal from '../modals/StockConfirmModal';
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function Production() {
  const [recipes, setRecipes] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [loadingMap, setLoadingMap] = useState({});
  const [stockModal, setStockModal] = useState({ open: false, product: null, quantity: 0, unit: '' });
  const [historyMap, setHistoryMap] = useState({});
  const [lockedProduce, setLockedProduce] = useState({});

  const { t } = useTranslation();

  useEffect(() => {
    fetch(`${API_URL}/api/production/recipes`)
      .then((res) => res.json())
      .then((data) => {
        setRecipes(data);
        const q = {};
        data.forEach((r) => (q[r.name] = 1));
        setQuantities(q);

        // history for each product
        data.forEach((recipe) => {
          fetch(`${API_URL}/api/production/production-log/history?product=${encodeURIComponent(recipe.name)}&limit=5`)
            .then((res) => res.json())
            .then((history) => {
              setHistoryMap((prev) => ({ ...prev, [recipe.name]: history }));
            })
            .catch((err) => console.error('❌ Failed to load history:', err));
        });

        // mark cards as ready if there’s unstocked production
        data.forEach((recipe) => {
          fetch(`${API_URL}/api/production/production-log/unstocked?product=${encodeURIComponent(recipe.name)}&limit=1`)
            .then((res) => res.json())
            .then((unstockedLogs) => {
              if (Array.isArray(unstockedLogs) && unstockedLogs.length > 0) {
                setLoadingMap((prev) => ({ ...prev, [recipe.name]: 'ready' }));
              }
            })
            .catch(() => {});
        });
      })
      .catch((err) => console.error('❌ Failed to load recipes:', err));
  }, []);

  const handleAdjust = (productName, delta) => {
    setQuantities((prev) => ({
      ...prev,
      [productName]: Math.max(1, (prev[productName] ?? 1) + delta),
    }));
  };

  const fetchProductHistory = (productName) => {
    fetch(`${API_URL}/api/production/production-log/history?product=${encodeURIComponent(productName)}&limit=5`)
      .then((res) => res.json())
      .then((history) => {
        setHistoryMap((prev) => ({ ...prev, [productName]: history }));
      })
      .catch((err) => console.error('❌ Failed to load history:', err));
  };

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
        product_unit: product.output_unit
      };

      const res = await fetch(`${API_URL}/api/production/production-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        console.error('❌ Production failed:', msg);
        toast.error(t('Failed to log production (ingredient deduction).'));
        setLoadingMap((prev) => ({ ...prev, [product.name]: null }));
        setLockedProduce((prev) => ({ ...prev, [product.name]: false }));
        return false;
      }

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
      toast.error(t('Network error while logging production.'));
      setLoadingMap((prev) => ({ ...prev, [product.name]: null }));
      setLockedProduce((prev) => ({ ...prev, [product.name]: false }));
      return false;
    }
  };

  /**
   * Add finished product to stock after production is logged
   */
  const handleAddToStock = async ({ supplier_id, quantity, name, unit }) => {
    const payload = { supplier_id, name, quantity, unit, from_production: true };
    try {
      const res = await fetch(`${API_URL}/api/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(`✔️ "${name}" ${t('added to stock!')}`);
      } else {
        const error = await res.json().catch(() => ({}));
        toast.error(`❌ ${t('Failed to add stock')}: ${error.error || 'Unknown error'}`);
      }
    } catch {
      toast.error(`❌ ${t('Network error adding stock!')}`);
    } finally {
      setLoadingMap((prev) => ({ ...prev, [name]: null }));
      setLockedProduce((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleAddOrUpdateRecipe = async (recipe) => {
    const method = editRecipe ? 'PUT' : 'POST';
    const endpoint = editRecipe
      ? `${API_URL}/api/production/recipes/${editRecipe.id}`
      : `${API_URL}/api/production/recipes`;

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recipe)
    });

    if (res.ok) {
      const updated = await fetch(`${API_URL}/api/production/recipes`).then(res => res.json());
      setRecipes(updated);
      const q = {};
      updated.forEach((r) => (q[r.name] = 1));
      setQuantities(q);
    }
    setEditRecipe(null);
  };

  const handleDeleteRecipe = async (recipeName) => {
    const recipe = recipes.find(r => r.name === recipeName);
    if (!recipe) return;
    const res = await fetch(`${API_URL}/api/production/recipes/${recipe.id}`, { method: 'DELETE' });
    if (res.ok) {
      setRecipes((prev) => prev.filter((r) => r.name !== recipeName));
      setQuantities((prev) => {
        const updated = { ...prev };
        delete updated[recipeName];
        return updated;
      });
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
                      quantity: totalOut,
                      unit: product.output_unit
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
        onClose={() => setStockModal({ open: false, product: null, quantity: 0, unit: '' })}
        productName={stockModal.product}
        expectedQuantity={stockModal.quantity}
        unit={stockModal.unit}
        onConfirm={handleAddToStock}
      />
    </div>
  );
}
