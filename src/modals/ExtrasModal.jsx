import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const API_URL = import.meta.env.VITE_API_URL || "";

export default function ExtrasModal({
  showExtrasModal,
  setShowExtrasModal,
  selectedProduct,
  setSelectedProduct,
  selectedExtras,
  setSelectedExtras,
  extrasGroups,            // [{ id, group_name, items:[{id,name,extraPrice|price}] }]
  setCartItems,
  cartItems,
  editingCartItemIndex,
  setEditingCartItemIndex,
  note,
  setNote,
  fullTotal,
  t,
}) {
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [availableIngredients, setAvailableIngredients] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/suppliers/ingredients`)
      .then(res => res.json())
      .then(data => setAvailableIngredients(Array.isArray(data) ? data : []))
      .catch(() => setAvailableIngredients([]));
  }, []);

  if (!showExtrasModal || !selectedProduct) return null;

  // --- Normalize groups ---
  const groups = Array.isArray(extrasGroups) ? extrasGroups.map(g => ({
    id: g.id,
    groupName: g.group_name ?? g.groupName ?? "",
    items: Array.isArray(g.items) ? g.items.map(it => ({
      id: it.id,
      name: it.name ?? it.ingredient_name ?? "",
      price: Number(it.extraPrice ?? it.price ?? 0),
    })) : [],
  })) : [];

  const selectedGroupIds = new Set(
    (selectedProduct?.selectedExtrasGroup || [])
      .map(id => Number(id))
      .filter(Number.isFinite)
  );

  let allowedGroups = groups.filter(g => selectedGroupIds.has(Number(g.id)));

  // Fallback to supplier ingredients
  if (allowedGroups.length === 0) {
    allowedGroups = [
      {
        id: "manual",
        groupName: "Extras",
        items: availableIngredients.map((item, idx) => ({
          id: idx,
          name: item.name,
          price: 0,
          unit: item.unit,
        })),
      },
    ];
  }

  const safeIdx = allowedGroups.length === 0
    ? 0
    : Math.min(activeGroupIdx, allowedGroups.length - 1);
  const activeGroup = allowedGroups[safeIdx];
  const groupTabs = allowedGroups.map(g => g.groupName || String(g.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-gradient-to-br from-white via-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-0 border-b border-blue-100 flex flex-col items-center">
          <h2 className="text-2xl font-extrabold text-blue-900 dark:text-white mb-1 drop-shadow">
            ✨ {t("Select Extras")}
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-center text-base mb-4">
            {t("Add-ons for")} <span className="font-bold text-blue-600">{selectedProduct.name}</span>
          </p>

          {/* Tabs */}
          <div className="w-full overflow-x-auto flex gap-3 mb-4">
            {groupTabs.length === 0 ? (
              <div className="w-full text-center text-sm text-gray-500">
                {t("No extras available for this product.")}
              </div>
            ) : groupTabs.map((name, idx) => (
              <button
                key={`${name}-${idx}`}
                onClick={() => setActiveGroupIdx(idx)}
                className={`flex-1 whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition
                  ${safeIdx === idx
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-indigo-800'
                }`}
              >
                {t(name)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 pb-4 flex flex-col gap-3">
          {/* ✅ Ingredient Dropdown for manual selection */}
          {activeGroup?.id === "manual" && (
            <select
              onChange={(e) => {
                const value = e.target.value;
                const match = availableIngredients.find(ai => ai.name === value);
                if (match) {
                  setSelectedExtras((prev) => {
                    if (prev.find(ex => ex.name === match.name)) return prev;
                    return [...prev, { ...match, price: 0, quantity: 1 }];
                  });
                }
              }}
              className="border p-2 rounded w-full"
            >
              <option value="">{t("Select Extra Ingredient")}</option>
              {availableIngredients.map((item, i) => (
                <option key={i} value={item.name}>
                  {item.name} ({item.unit})
                </option>
              ))}
            </select>
          )}

          {/* Grid of extras */}
          <div className="grid grid-cols-2 gap-3">
            {activeGroup?.items.map((item) => {
              const found = selectedExtras.find((e) => e.name === item.name) || { quantity: 0 };
              return (
                <label
                  key={item.id ?? item.name}
                  className={`border-2 rounded-xl p-3 cursor-pointer transition flex flex-col justify-between h-full
                    ${found.quantity > 0
                      ? 'bg-gradient-to-br from-blue-100 via-fuchsia-50 to-indigo-100 border-blue-400'
                      : 'bg-white dark:bg-gray-800 border-blue-100 hover:bg-blue-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">
                      {item.name} {item.unit ? `(${item.unit})` : ""}
                    </span>
                    <span className="text-sm text-blue-700">₺{item.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <button
                      className="bg-gray-300 text-black px-2 py-1 rounded-full hover:bg-gray-400 transition"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedExtras((prev) => {
                          const cur = prev.find((ex) => ex.name === item.name);
                          if (!cur) return prev;
                          if (cur.quantity === 1) return prev.filter((ex) => ex.name !== item.name);
                          return prev.map((ex) => ex.name === item.name ? {...ex, quantity: ex.quantity - 1} : ex);
                        });
                      }}
                    >➖</button>
                    <span className="text-lg font-semibold">{found.quantity}</span>
                    <button
                      className="bg-green-500 text-white px-2 py-1 rounded-full hover:bg-green-600 transition"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedExtras((prev) => {
                          const cur = prev.find((ex) => ex.name === item.name);
                          if (!cur) return [...prev, { ...item, quantity: 1 }];
                          return prev.map((ex) => ex.name === item.name ? {...ex, quantity: cur.quantity + 1} : ex);
                        });
                      }}
                    >➕</button>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-blue-50 via-white to-indigo-50 dark:from-zinc-900 dark:to-zinc-800 border-t border-blue-100/40 dark:border-zinc-800/70 rounded-b-3xl px-6 py-4 flex flex-col space-y-3">
          {/* Quantity & Total */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <button
                className="bg-gray-200 dark:bg-zinc-700 text-black dark:text-white px-4 py-2 rounded-full hover:bg-blue-200 dark:hover:bg-indigo-900 font-bold text-xl transition"
                onClick={() =>
                  setSelectedProduct((prev) => ({ ...prev, quantity: Math.max((prev.quantity || 1) - 1, 1) }))
                }
              >➖</button>
              <span className="text-2xl font-semibold text-blue-900 dark:text-blue-200">
                {selectedProduct.quantity || 1}
              </span>
              <button
                className="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600 font-bold text-xl transition"
                onClick={() =>
                  setSelectedProduct((prev) => ({ ...prev, quantity: (prev.quantity || 1) + 1 }))
                }
              >➕</button>
            </div>
            <div className="text-lg font-bold">
              {t("Total")}:
              <span className="ml-2">₺{fullTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-100 mb-1">📝 {t("Notes")}</h3>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Custom notes, e.g. 'no bun', 'extra napkins'...")}
              className="w-full border border-blue-100 dark:border-zinc-800 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-indigo-500 bg-white dark:bg-zinc-900 text-gray-800 dark:text-gray-100"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowExtrasModal(false)}
              className="flex-1 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-xl font-bold transition"
            >
              ❌ {t("Cancel")}
            </button>
            <button
              onClick={() => {
                const productQty = selectedProduct.quantity || 1;
                const validExtras = selectedExtras
                  .filter((ex) => ex.quantity > 0)
                  .map((ex) => ({ ...ex, quantity: Number(ex.quantity), price: Number(ex.price ?? ex.extraPrice ?? 0) }));

                const itemPrice = Number(selectedProduct.price);
                const extrasKey = JSON.stringify(validExtras);
                const uniqueId = `${selectedProduct.id}-${extrasKey}-${uuidv4()}`;

                if (editingCartItemIndex !== null) {
                  setCartItems((prev) => {
                    const updated = [...prev];
                    updated[editingCartItemIndex] = {
                      ...updated[editingCartItemIndex],
                      quantity: productQty,
                      price: itemPrice,
                      extras: validExtras,
                      unique_id: uniqueId,
                      note: note || null,
                    };
                    return updated;
                  });
                  setEditingCartItemIndex(null);
                } else {
                  setCartItems((prev) => [
                    ...prev,
                    {
                      id: selectedProduct.id,
                      name: selectedProduct.name,
                      price: itemPrice,
                      quantity: productQty,
                      ingredients: selectedProduct.ingredients || [],
                      extras: validExtras,
                      unique_id: uniqueId,
                      note: note || null,
                    },
                  ]);
                }

                setShowExtrasModal(false);
                setSelectedExtras([]);
              }}
              className="flex-1 py-2 bg-gradient-to-r from-green-500 via-blue-400 to-indigo-400 text-white rounded-xl font-bold shadow-lg hover:brightness-105 transition-all"
            >
              ✅ {t("Add to Cart")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
