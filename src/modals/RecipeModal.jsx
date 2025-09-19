import React, { useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
const API_URL = import.meta.env.VITE_API_URL || "";

// For fetch fallback and badge style
const BADGE_STYLE = "ml-2 px-2 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 text-sm font-bold";

export default function RecipeModal({ isOpen, onClose, onSave, existingRecipe = null, onDelete }) {
  const [productName, setProductName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [baseQuantity, setBaseQuantity] = useState('');
  const [outputUnit, setOutputUnit] = useState('pcs');
  const [ingredients, setIngredients] = useState([{ name: '', amount: '', unit: '' }]);
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [availableUnits, setAvailableUnits] = useState([]); // ✅ from stock
  const { t } = useTranslation();

  // Fetch latest ingredient prices for live costing
  useEffect(() => {
    fetch(`${API_URL}/api/ingredient-prices`)
      .then(res => res.json())
      .then(data => setIngredientPrices(Array.isArray(data) ? data : []))
      .catch(() => setIngredientPrices([]));
  }, []);

  // Fetch units from stock
  useEffect(() => {
    fetch(`${API_URL}/api/stock`)
      .then(res => res.json())
      .then(data => {
        const units = Array.from(new Set(data.map(item => item.unit))).sort();
        setAvailableUnits(units);
      })
      .catch(() => setAvailableUnits([]));
  }, []);

  // Populate fields when editing
  useEffect(() => {
    if (existingRecipe) {
      setProductName(existingRecipe.name || '');
      setEmoji(existingRecipe.emoji || '');
      setBaseQuantity(existingRecipe.base_quantity || '');
      setOutputUnit(existingRecipe.output_unit || 'pcs');
      setIngredients(
        existingRecipe.ingredients?.length
          ? existingRecipe.ingredients.map((i) => ({
              name: i.name,
              amount: i.amountPerBatch,
              unit: i.unit
            }))
          : [{ name: '', amount: '', unit: '' }]
      );
    } else {
      setProductName('');
      setEmoji('');
      setBaseQuantity('');
      setOutputUnit('pcs');
      setIngredients([{ name: '', amount: '', unit: '' }]);
    }
  }, [existingRecipe]);

  const handleIngredientChange = (index, field, value) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '', unit: '' }]);
  };

  const handleSave = () => {
    const parsedQuantity = parseFloat(baseQuantity);

    if (
      !productName.trim() ||
      isNaN(parsedQuantity) ||
      parsedQuantity <= 0 ||
      !outputUnit.trim() ||
      ingredients.some(ing =>
        !ing.name.trim() || isNaN(parseFloat(ing.amount)) || parseFloat(ing.amount) <= 0 || !ing.unit.trim()
      )
    ) {
      alert("❌ Please fill all fields correctly. Numbers must be valid and positive.");
      return;
    }

    const newRecipe = {
      name: productName.trim(),
      emoji: emoji.trim(),
      base_quantity: parsedQuantity,
      output_unit: outputUnit.trim(),
      ingredients: ingredients.map(ing => ({
        name: ing.name.trim(),
        amountPerBatch: parseFloat(ing.amount),
        unit: ing.unit.trim().toLowerCase() // ✅ normalize
      }))
    };

    onSave(newRecipe);
    onClose();
  };

  const handleDelete = () => {
    if (!existingRecipe) return;
    const confirm = window.confirm(`🗑 Are you sure you want to delete "${existingRecipe.name}"?`);
    if (confirm && onDelete) {
      onDelete(existingRecipe.name);
      onClose();
    }
  };

  // ---- COST CALCULATION SECTION ----
  let totalCost = 0, perUnit = 0;
  if (Array.isArray(ingredients) && parseFloat(baseQuantity) > 0) {
    totalCost = ingredients.reduce((sum, ing) => {
      const match = ingredientPrices.find(ip =>
        ip.name?.toLowerCase() === ing.name?.toLowerCase() &&
        ip.unit?.toLowerCase() === ing.unit?.toLowerCase()
      );
      const pricePer = match?.current_price || match?.price_per_unit || 0;
      const amt = parseFloat(ing.amount) || 0;
      return sum + (amt * pricePer);
    }, 0);
    perUnit = totalCost / parseFloat(baseQuantity);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-lg rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">
          {existingRecipe ? `✏️ ${t("Edit Recipe")}` : `➕ ${t("Create New Recipe")}`}
        </h2>

        <div className="mb-3">
          <label className="block font-medium">{t("Product Name")}:</label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="border p-2 rounded w-full"
          />
        </div>

        <div className="mb-3 flex gap-3">
          <div className="flex-1">
            <label className="block font-medium">{t("Emoji (optional)")}:</label>
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block font-medium">{t("Output Unit (e.g. pcs, kg, L)")}:</label>
            <input
              type="text"
              value={outputUnit}
              onChange={(e) => setOutputUnit(e.target.value)}
              className="border p-2 rounded w-full"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="block font-medium">{t("Output Quantity per Batch")}:</label>
          <input
            type="number"
            value={baseQuantity}
            onChange={(e) => setBaseQuantity(e.target.value)}
            className="border p-2 rounded w-full"
          />
        </div>

        <div>
          <h3 className="font-semibold mb-2">{t("Ingredients")}</h3>
          {ingredients.map((ing, index) => (
            <div key={index} className="flex gap-2 mb-2">
              <input
                placeholder={t("Name")}
                value={ing.name}
                onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                className="border p-2 rounded w-1/3"
              />
              <input
                placeholder={t("Amount")}
                type="number"
                value={ing.amount}
                onChange={(e) => handleIngredientChange(index, 'amount', e.target.value)}
                className="border p-2 rounded w-1/3"
              />
              {/* ✅ Unit dropdown */}
              <select
                value={ing.unit}
                onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                className="border p-2 rounded w-1/3"
              >
                <option value="">{t("Select Unit")}</option>
                {availableUnits.map((unit, i) => (
                  <option key={i} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            onClick={handleAddIngredient}
            className="text-sm text-blue-600 hover:underline mt-1"
          >
            + {t("Add Ingredient")}
          </button>
        </div>

        {/* COST DISPLAY */}
        <div className="my-6">
          <div className="text-lg font-bold">
            {t("Total Recipe Cost")}: <span className="text-rose-700">₺{totalCost.toFixed(2)}</span>
          </div>
          <div className={BADGE_STYLE} style={{ display: "inline-block", marginTop: 8 }}>
            {t("Cost per Unit")}: ₺{perUnit.toFixed(2)}
          </div>
        </div>

        <div className="flex justify-between mt-6">
          {existingRecipe && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              🗑 {t("Delete")}
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              {t("Cancel")}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
            >
              {t("Save Recipe")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
