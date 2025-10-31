import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
  useEffect(() => {
    if (showExtrasModal) {
      setActiveGroupIdx(0);
    }
  }, [showExtrasModal, selectedProduct?.id]);

  if (!showExtrasModal || !selectedProduct) return null;

  // --- Normalize groups (accept both group_name and groupName) ---
  const normalizeGroupKey = (value) => {
    if (value === null || value === undefined) return "";
    return String(value).trim().toLowerCase().replace(/\s+/g, " ");
  };

  // Determine which extras groups are explicitly assigned to this product
  const selectedGroupIds = new Set(
    [
      ...(selectedProduct?.selectedExtrasGroup || []),
      ...(selectedProduct?.extrasGroupRefs?.ids || []),
    ]
      .map((id) => Number(id))
      .filter(Number.isFinite)
  );

  const selectedGroupNames = new Set(
    (
      selectedProduct?.selectedExtrasGroupNames ||
      selectedProduct?.extrasGroupRefs?.names ||
      []
    )
      .map(normalizeGroupKey)
      .filter(Boolean)
  );

  const hasGroupRefs = selectedGroupIds.size > 0 || selectedGroupNames.size > 0;

  const hasModalGroups =
    Array.isArray(selectedProduct?.modalExtrasGroups) &&
    selectedProduct.modalExtrasGroups.length > 0;

  const sourceGroups =
    Array.isArray(selectedProduct?.modalExtrasGroups) &&
    selectedProduct.modalExtrasGroups.length > 0
      ? selectedProduct.modalExtrasGroups
      : hasGroupRefs
      ? extrasGroups
      : [];

  const groups = Array.isArray(sourceGroups)
    ? sourceGroups.map((g) => ({
        id: g.id,
        groupName: g.group_name ?? g.groupName ?? "",
        items: Array.isArray(g.items)
          ? g.items.map((it) => ({
              id: it.id,
              name: it.name ?? it.ingredient_name ?? "",
              price: Number(it.extraPrice ?? it.price ?? 0),
              amount:
                it.amount !== undefined && it.amount !== null && it.amount !== ""
                  ? Number(it.amount)
                  : 1,
              unit: it.unit || "", // ✅ include unit
            }))
          : [],
      }))
    : [];

  let allowedGroups;
  if (hasGroupRefs) {
    allowedGroups = groups.filter((g) => {
      const groupId = Number(g.id);
      const groupNameKey = normalizeGroupKey(g.groupName);
      return (
        selectedGroupIds.has(groupId) ||
        (groupNameKey && selectedGroupNames.has(groupNameKey))
      );
    });
  } else if (hasModalGroups) {
    // When we explicitly fetched groups for this product (e.g., editing a cart item),
    // trust that modal payload and surface them even without stored refs.
    allowedGroups = groups;
  } else {
    allowedGroups = [];
  }

  // 🧩 If we have explicit refs but filtering failed (e.g., data mismatch) keep modal-specific groups
  if (hasGroupRefs && allowedGroups.length === 0 && Array.isArray(groups) && groups.length > 0) {
    allowedGroups = groups;
  }

  // If no matched groups but the product already carries manual extras, show those instead
  if (allowedGroups.length === 0 && Array.isArray(selectedProduct?.extras) && selectedProduct.extras.length > 0) {
    allowedGroups = [
      {
        id: "manual",
        groupName: "Extras",
        items: selectedProduct.extras.map((ex, idx) => ({
          id: idx,
          name: ex.name,
          price: Number(ex.extraPrice || ex.price || 0),
          unit: ex.unit || "", // ✅ always keep unit
          amount:
            ex.amount !== undefined && ex.amount !== null && ex.amount !== ""
              ? Number(ex.amount)
              : 1, // ✅ always keep amount
        })),
      },
    ];
  }

  // Keep tab index in bounds
  const safeIdx = allowedGroups.length === 0
    ? 0
    : Math.min(activeGroupIdx, allowedGroups.length - 1);
  const activeGroup = allowedGroups[safeIdx];

  console.log("🧩 ExtrasModal selection", {
    selectedProduct,
    selectedGroupIds: Array.from(selectedGroupIds),
    selectedGroupNames: Array.from(selectedGroupNames),
    allowedGroups,
  });

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

          {/* Tabs (only allowed groups) */}
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

        {/* Content: items of the selected allowed group */}
        <div className="flex-1 overflow-auto px-6 pb-4 grid grid-cols-2 gap-3">
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
                  <span className="font-medium text-sm">{item.name}</span>
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
                        return prev.map((ex) =>
                          ex.name === item.name
                            ? { ...ex, quantity: ex.quantity - 1 }
                            : ex
                        );
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
                        if (!cur)
  return [
    ...prev,
    { ...item, quantity: 1, unit: item.unit || "", amount: item.amount }
  ];

                        return prev.map((ex) =>
                          ex.name === item.name
                            ? { ...ex, quantity: cur.quantity + 1 }
                            : ex
                        );
                      });
                    }}
                  >➕</button>
                </div>
              </label>
            );
          })}
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-blue-50 via-white to-indigo-50 dark:from-zinc-900 dark:to-zinc-800 border-t border-blue-100/40 dark:border-zinc-800/70 rounded-b-3xl px-6 py-4 flex flex-col space-y-3">
          {/* Quantity & Total */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <button
                className="bg-gray-200 dark:bg-zinc-700 text-black dark:text-white px-4 py-2 rounded-full hover:bg-blue-200 dark:hover:bg-indigo-900 font-bold text-xl transition"
                onClick={() =>
                  setSelectedProduct((prev) => ({
                    ...prev,
                    quantity: Math.max((prev.quantity || 1) - 1, 1),
                  }))
                }
              >➖</button>
              <span className="text-2xl font-semibold text-blue-900 dark:text-blue-200">
                {selectedProduct.quantity || 1}
              </span>
              <button
                className="bg-green-500 text-white px-4 py-2 rounded-full hover:bg-green-600 font-bold text-xl transition"
                onClick={() =>
                  setSelectedProduct((prev) => ({
                    ...prev,
                    quantity: (prev.quantity || 1) + 1,
                  }))
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
            <div className="flex flex-wrap gap-2 mb-2">
              {['No ketchup', 'Extra spicy', 'Sauce on side', 'Well done'].map((preset) => (
                <button
                  key={preset}
                  onClick={() =>
                    setNote((prev) =>
                      prev.includes(preset) ? prev.replace(preset, '').trim() : `${prev} ${preset}`.trim()
                    )
                  }
                  className={`px-3 py-1 rounded-full border text-xs font-semibold transition
                    ${note.includes(preset)
                      ? 'bg-blue-100 border-blue-400 text-blue-800'
                      : 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-indigo-700'
                  }`}
                >
                  {t(preset)}
                </button>
              ))}
            </div>
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
                const trimmedNote = (note || "").trim();

                // ✅ Ensure extras always carry correct unit + amount
                const validExtras = selectedExtras
                  .filter((ex) => ex.quantity > 0)
                  .map((ex) => ({
                    ...ex,
                    quantity: Number(ex.quantity),
                    price: Number(ex.price ?? ex.extraPrice ?? 0),
                    amount:
  ex.amount !== undefined && ex.amount !== null && ex.amount !== ""
    ? Number(ex.amount)
    : 1,

                    unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase(),
                  }));

                const itemPrice = Number(selectedProduct.price); // base price only
                const extrasRefs =
                  selectedProduct.extrasGroupRefs ||
                  (hasGroupRefs
                    ? {
                        ids: Array.from(selectedGroupIds),
                        names: Array.from(selectedGroupNames),
                      }
                    : null);
                const extrasKey = JSON.stringify(validExtras);
                const baseUniqueId = `${selectedProduct.id}-NO_EXTRAS`;
                const isPlain = validExtras.length === 0 && trimmedNote.length === 0;
                const uniqueId = isPlain ? baseUniqueId : `${selectedProduct.id}-${extrasKey}-${uuidv4()}`;

                if (editingCartItemIndex !== null) {
                  setCartItems((prev) => {
                    const updated = [...prev];
                    const existing = updated[editingCartItemIndex] || {};
                    const persistedRefs =
                      extrasRefs ||
                      existing.extrasGroupRefs ||
                      (Array.isArray(selectedProduct?.selectedExtrasGroup) || Array.isArray(selectedProduct?.selectedExtrasGroupNames)
                        ? {
                            ids: Array.isArray(selectedProduct.selectedExtrasGroup)
                              ? selectedProduct.selectedExtrasGroup.map((id) => Number(id)).filter(Number.isFinite)
                              : [],
                            names: Array.isArray(selectedProduct.selectedExtrasGroupNames)
                              ? selectedProduct.selectedExtrasGroupNames
                                  .map((name) =>
                                    normalizeGroupKey(
                                      typeof name === "string" ? name : String(name || "")
                                    )
                                  )
                                  .filter(Boolean)
                              : [],
                          }
                        : null);

                    updated[editingCartItemIndex] = {
                      ...updated[editingCartItemIndex],
                      quantity: productQty,
                      price: itemPrice,
                      extras: validExtras,    // ✅ carries unit + amount
                      unique_id: uniqueId,
                      note: trimmedNote || null,
                      ...(persistedRefs
                        ? {
                            extrasGroupRefs: persistedRefs,
                            selectedExtrasGroup: persistedRefs.ids,
                            selected_extras_group: persistedRefs.ids,
                            selectedExtrasGroupNames: persistedRefs.names,
                          }
                        : {}),
                    };
                    return updated;
                  });
                  setEditingCartItemIndex(null);
                } else {
                  if (isPlain) {
                    setCartItems((prev) => {
                      const existingIndex = prev.findIndex(
                        (item) =>
                          item.unique_id === baseUniqueId &&
                          !item.confirmed &&
                          !item.paid
                      );

	                      if (existingIndex !== -1) {
	                        return prev.map((item, idx) =>
	                          idx === existingIndex
	                            ? {
	                                ...item,
	                                quantity: item.quantity + productQty,
	                                ...(extrasRefs && !item.extrasGroupRefs
	                                  ? {
	                                      extrasGroupRefs: extrasRefs,
	                                      selectedExtrasGroup: extrasRefs.ids,
	                                      selected_extras_group: extrasRefs.ids,
	                                      selectedExtrasGroupNames: extrasRefs.names,
	                                    }
	                                  : {}),
	                              }
	                            : item
	                        );
	                      }

                      const hasLocked = prev.some(
                        (item) =>
                          item.unique_id === baseUniqueId &&
                          (item.confirmed || item.paid)
                      );

                      const finalUniqueId = hasLocked
                        ? `${baseUniqueId}-${uuidv4()}`
                        : baseUniqueId;

	                      return [
	                        ...prev,
	                        {
	                          id: selectedProduct.id,
	                          name: selectedProduct.name,
	                          price: itemPrice,
	                          quantity: productQty,
	                          ingredients: selectedProduct.ingredients || [],
	                          extras: [],
	                          unique_id: finalUniqueId,
	                          note: null,
	                          ...(extrasRefs
	                            ? {
	                                extrasGroupRefs: extrasRefs,
	                                selectedExtrasGroup: extrasRefs.ids,
	                                selected_extras_group: extrasRefs.ids,
	                                selectedExtrasGroupNames: extrasRefs.names,
	                              }
	                            : {}),
	                        },
	                      ];
	                    });
	                  } else {
	                    setCartItems((prev) => [
	                      ...prev,
	                      {
	                        id: selectedProduct.id,
	                        name: selectedProduct.name,
	                        price: itemPrice,
	                        quantity: productQty,
	                        ingredients: selectedProduct.ingredients || [],
	                        extras: validExtras,   // ✅ carries unit + amount
	                        unique_id: uniqueId,
	                        note: trimmedNote || null,
	                        ...(extrasRefs
	                          ? {
	                              extrasGroupRefs: extrasRefs,
	                              selectedExtrasGroup: extrasRefs.ids,
	                              selected_extras_group: extrasRefs.ids,
	                              selectedExtrasGroupNames: extrasRefs.names,
	                            }
	                          : {}),
	                      },
	                    ]);
	                  }
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
