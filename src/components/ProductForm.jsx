import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INGREDIENT_PRICES_API,
  EXTRAS_GROUPS_API,
} from "../utils/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const normalizeUnit = (u) => {
  if (!u) return "";
  u = u.toLowerCase();
  if (u === "pieces") return "piece";
  if (u === "portion" || u === "portions") return "portion";
  return u;
};

const convertPrice = (basePrice, supplierUnit, targetUnit) => {
  if (!basePrice || !supplierUnit || !targetUnit) return null;
  supplierUnit = normalizeUnit(supplierUnit);
  targetUnit = normalizeUnit(targetUnit);

  if (supplierUnit === targetUnit) return basePrice;

  if (supplierUnit === "kg" && targetUnit === "g") return basePrice / 1000;
  if (supplierUnit === "g" && targetUnit === "kg") return basePrice * 1000;

  if (supplierUnit === "l" && targetUnit === "ml") return basePrice / 1000;
  if (supplierUnit === "ml" && targetUnit === "l") return basePrice * 1000;

  return null;
};


export default function ProductForm({ onSuccess, initialData = null }) {
  const { t } = useTranslation();

  const [product, setProduct] = useState({
    name: "",
    price: "",
    category: "",
    preparation_time: "",
    description: "",
    image: null,
    ingredients: [],
    extras: [],
    discount_type: "none",
    discount_value: "",
    visible: true,
    tags: "",
    allergens: "",
    promo_start: "",
    promo_end: "",
    // IMPORTANT: store group IDs here
    selectedExtrasGroup: [],
  });
  const [estimatedCost, setEstimatedCost] = useState(0);

  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [calculatedCost, setCalculatedCost] = useState(0);
  const [extrasGroups, setExtrasGroups] = useState([]); // [{id, group_name, items:[{id,name,extraPrice}]}]
  const [imagePreview, setImagePreview] = useState(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [availableIngredients, setAvailableIngredients] = useState([]);
  useEffect(() => {
  fetch(`${API_URL}/api/suppliers/ingredients`)
    .then(res => res.json())
    .then(data => setAvailableIngredients(Array.isArray(data) ? data : []))
    .catch(() => setAvailableIngredients([]));
}, []);
  // ---------- helpers ----------
  const handleUpload = async () => {
    if (!imageFile) return "";
    const formData = new FormData();
    formData.append("file", imageFile);
    const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok || !data.url) {
      toast.error("Image upload failed!");
      return "";
    }
    setImageUrl(data.url);
    setImagePreview(data.url);
    return data.url;
  };

  const getImageSource = () => imageUrl || imagePreview || null;

  // ---------- effects ----------
  useEffect(() => {
    fetch(INGREDIENT_PRICES_API)
      .then(res => res.json())
      .then(data => setIngredientPrices(Array.isArray(data) ? data : []))
      .catch(() => setIngredientPrices([]));
  }, []);

  useEffect(() => {
    fetch(EXTRAS_GROUPS_API)
      .then(res => res.json())
      .then(data => {
        const normalized = (Array.isArray(data) ? data : []).map(g => ({
          ...g,
          group_name: g.group_name || g.groupName,
          items: Array.isArray(g.items)
            ? g.items.map(i => ({
                ...i,
                // ensure we always have the price field under extraPrice
                extraPrice:
                  i.extraPrice !== undefined
                    ? i.extraPrice
                    : (i.price !== undefined ? i.price : 0),
              }))
            : [],
        }));
        setExtrasGroups(normalized);
      })
      .catch(() => setExtrasGroups([]));
  }, []);

  // auto-fetch category preview when category changes
  useEffect(() => {
    if (!product.category) return;
    const cat = product.category.trim().toLowerCase();
    fetch(`${API_URL}/api/category-images?category=${encodeURIComponent(cat)}`)
      .then(res => res.json())
      .then(data => {
        if (data.length > 0 && data[0].image) {
          const img = data[0].image;
          if (img && img.startsWith("http")) setCategoryImagePreview(img);
          else if (img) setCategoryImagePreview(`${API_URL}/uploads/${img}`);
          else setCategoryImagePreview(null);
        } else {
          setCategoryImagePreview(null);
        }
      })
      .catch(() => setCategoryImagePreview(null));
  }, [product.category]);


// cost calc
useEffect(() => {
  let total = 0;

  (product.ingredients || []).forEach((ing) => {
    if (!ing.ingredient || !ing.quantity || !ing.unit) return;

    // find latest supplier price for this ingredient
    const match = availableIngredients.find(ai => ai.name === ing.ingredient);
    if (!match) return;

    const converted = convertPrice(match.price, match.unit, ing.unit);
    if (converted !== null) {
      total += parseFloat(ing.quantity) * converted;
    }
  });

  setEstimatedCost(total);
}, [product.ingredients, availableIngredients]);

  // hydrate initial data
  useEffect(() => {
    if (!initialData) return;

    // normalize image field for preview
    const normalized = {
      ...initialData,
      image: initialData.image || initialData.image_url || null,
    };

    // Convert selectedExtrasGroup possibly coming as names → to IDs
    // (happens if older records saved strings)  (Old code saved names: )
    const currentGroups = Array.isArray(normalized.selectedExtrasGroup)
      ? normalized.selectedExtrasGroup
      : [];

    const mappedToIds = currentGroups.map(g => {
      // if it's already a number, keep it
      if (typeof g === "number") return g;
      // if it's a string (old data), find group by title
      const byName = extrasGroups.find(x => x.group_name === g);
      return byName ? byName.id : null;
    }).filter(x => Number.isFinite(x));

    setProduct(prev => ({
      ...prev,
      ...normalized,
      selectedExtrasGroup: mappedToIds,
    }));

    if (normalized.image) {
      setImagePreview(normalized.image);
      setImageUrl(normalized.image);
    }
  }, [initialData, extrasGroups]);

  // ---------- handlers ----------
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProduct(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleImageChange = (e) => setImageFile(e.target.files[0]);

  // ingredients
  const addIngredient = () =>
    setProduct(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { ingredient: "", quantity: "", unit: "" }],
    }));

  const handleIngredientChange = (index, e) => {
    const { name, value } = e.target;
    const list = [...product.ingredients];
    list[index][name] = value;
    setProduct(prev => ({ ...prev, ingredients: list }));
  };

  const removeIngredient = (index) =>
    setProduct(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));

  // extras (manual add)
  const addExtra = () =>
    setProduct(prev => ({
      ...prev,
      extras: [...prev.extras, { name: "", extraPrice: "" }],
    }));

  const handleExtraChange = (index, e) => {
    const { name, value } = e.target;
    const list = [...product.extras];
    list[index][name] = value;
    setProduct(prev => ({ ...prev, extras: list }));
  };

  const removeExtra = (index) =>
    setProduct(prev => ({
      ...prev,
      extras: prev.extras.filter((_, i) => i !== index),
    }));

  // derive a map for quick id→group lookup
  const groupById = useMemo(() => {
    const map = new Map();
    extrasGroups.forEach(g => map.set(g.id, g));
    return map;
  }, [extrasGroups]);

  // ---------- submit ----------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!product.name.trim() || !product.price || Number(product.price) <= 0) {
      toast.error("Product name and price required");
      return;
    }

    // upload if needed
    let uploadedImageUrl = imageUrl;
    if (imageFile) {
      uploadedImageUrl = await handleUpload();
      if (!uploadedImageUrl) {
        toast.error("Image upload failed!");
        return;
      }
    }

    // ensure group IDs are numeric
    const groupIds = (product.selectedExtrasGroup || [])
      .map(n => Number(n))
      .filter(n => Number.isFinite(n));

    const payload = {
      ...product,
      image: uploadedImageUrl || product.image || "",
      price: product.price ? Number(product.price) : 0,
      preparation_time: product.preparation_time ? Number(product.preparation_time) : null,
      discount_value:
        product.discount_value !== undefined && product.discount_value !== ""
          ? Number(product.discount_value)
          : 0,
      ingredients: product.ingredients || [],
      extras: product.extras || [],
      selectedExtrasGroup: groupIds, // <-- IDs to backend
    };

    try {
      const isEdit = !!initialData?.id;
      const method = isEdit ? "PUT" : "POST";
      const endpoint = isEdit
        ? `${API_URL}/api/products/${initialData.id}`
        : `${API_URL}/api/products`;

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to save product");
        return;
      }

      toast.success(isEdit ? "Product updated!" : "Product saved!");

      // reset
      setProduct({
        name: "",
        price: "",
        category: "",
        preparation_time: "",
        description: "",
        image: null,
        ingredients: [],
        extras: [],
        discount_type: "none",
        discount_value: "",
        visible: true,
        tags: "",
        allergens: "",
        promo_start: "",
        promo_end: "",
        selectedExtrasGroup: [],
      });
      setImageFile(null);
      setImageUrl("");
      setImagePreview(null);

      onSuccess && onSuccess();
    } catch (err) {
      console.error("❌ Product save error:", err);
      toast.error("Product save error");
    }
  };

  // ---------- UI ----------
  return (
    <form onSubmit={handleSubmit} className="space-y-7 max-w-4xl w-full mx-auto" autoComplete="off">
      <h2 className="text-xl font-bold text-indigo-700 mb-1">
        {initialData ? t("Edit Product") : t("Add Product")}
      </h2>

      {/* BASIC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <div>
          <label className="font-semibold">{t("Name")}</label>
          <input type="text" name="name" value={product.name} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-4" required />

          <label className="font-semibold">{t("Price (₺)")}</label>
          <input type="number" name="price" value={product.price} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-2" required />
          <div className="mt-4 text-sm font-bold text-gray-600">
  Estimated Cost: <span className="text-rose-600">₺{estimatedCost.toFixed(2)}</span>
</div>


          <label className="font-semibold">{t("Promotion Start Date")}</label>
          <input type="date" name="promo_start" value={product.promo_start} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-4" />

          <label className="font-semibold">{t("Visible on Website")}</label>
          <input type="checkbox" name="visible" checked={product.visible} onChange={handleChange}
                 className="ml-2 align-middle" />
        </div>

        <div>
          <label className="font-semibold">{t("Category")}</label>
          <input type="text" name="category" value={product.category} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-4" />

          <label className="font-semibold">Category Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file || !product.category) {
                toast.error("Category required first!");
                return;
              }
              const fd = new FormData();
              fd.append("image", file);
              fd.append("category", product.category.trim().toLowerCase());

              try {
                const res = await fetch(`${API_URL}/api/category-images`, { method: "POST", body: fd });
                if (!res.ok) {
                  toast.error("Upload failed");
                  return;
                }
                toast.success("Category image uploaded!");
                const cat = product.category.trim().toLowerCase();
                const resp = await fetch(`${API_URL}/api/category-images?category=${encodeURIComponent(cat)}`);
                const data = await resp.json();
                if (data.length > 0 && data[0].image) {
                  const img = data[0].image;
                  setCategoryImagePreview(img.startsWith("http") ? img : `${API_URL}/uploads/${img}`);
                }
              } catch (err) {
                console.error("Category upload failed:", err);
                toast.error("Category upload failed!");
              }
            }}
            className="w-full p-1 mt-1"
          />

          {categoryImagePreview && (
            <div className="my-2">
              <p className="text-xs text-gray-500">{t("Category Image Preview")}</p>
              <img src={categoryImagePreview} alt="Category" className="w-20 h-20 rounded-xl object-cover border shadow" />
            </div>
          )}

          <label className="font-semibold">{t("Preparation Time (min)")}</label>
          <input type="number" name="preparation_time" value={product.preparation_time} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-4" />

          <label className="font-semibold">{t("Promotion End Date")}</label>
          <input type="date" name="promo_end" value={product.promo_end} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mt-1 mb-4" />

          <label className="font-semibold">{t("Product Image")}</label>
          <input type="file" accept="image/*" onChange={handleImageChange} />
          {getImageSource() && <img src={getImageSource()} alt="Preview" style={{ width: 120, margin: 8 }} />}
        </div>
      </div>

      {/* Ingredients & Extras */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        {/* INGREDIENTS */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="font-bold mb-3">{t("Ingredients")}</h3>
          <div className="space-y-2">
            {product.ingredients.map((ing, i) => (
  <div key={i} className="flex flex-wrap gap-2 items-center">
    {/* ✅ Ingredient Dropdown */}
    <select
      name="ingredient"
      value={ing.ingredient}
      onChange={e => {
        handleIngredientChange(i, e);

        // Auto-fill unit when ingredient is selected
        const match = availableIngredients.find(ai => ai.name === e.target.value);
        if (match) {
          const list = [...product.ingredients];
          list[i].unit = match.unit;
          setProduct(prev => ({ ...prev, ingredients: list }));
        }
      }}
      className="p-2 rounded-xl border flex-1 min-w-[120px]"
    >
      <option value="">{t("Select Ingredient")}</option>
      {availableIngredients.map((item, idx) => (
        <option key={idx} value={item.name}>
          {item.name} ({item.unit})
        </option>
      ))}
    </select>

   {/* Quantity (free text, no increment arrows) */}
<input
  type="text"
  name="quantity"
  placeholder={t("Qty")}
  value={ing.quantity}
  onChange={e => handleIngredientChange(i, e)}
  className="p-2 rounded-xl border w-20 min-w-[60px]"
/>

{/* Unit (dropdown only) */}
<select
  name="unit"
  value={ing.unit || ""}
  onChange={e => handleIngredientChange(i, e)}
  className="p-2 rounded-xl border w-24 min-w-[70px]"
>
  <option value="">{t("Select Unit")}</option>
  <option value="kg">kg</option>
  <option value="g">g</option>
  <option value="pieces">pieces</option>
  <option value="portion">portion</option>
  <option value="ml">ml</option>
  <option value="l">l</option>
</select>

    {/* Remove button */}
    <button
      type="button"
      onClick={() => removeIngredient(i)}
      className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl"
      title={t("Remove")}
    >
      <Trash2 size={16} />
    </button>
  </div>
))}

            <button type="button" onClick={addIngredient}
                    className="mt-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-1 font-semibold">
              <Plus size={18} /> {t("Add Ingredient")}
            </button>
          </div>
        </div>

        {/* EXTRAS */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="font-bold mb-3">{t("Extras")}</h3>

          {/* Select group (by ID) */}
          <label className="block font-semibold mb-2">{t("Select Extras Group")}</label>
          <select
            value=""
            onChange={(e) => {
              const groupId = Number(e.target.value);
              if (!groupId) return;
              if (product.selectedExtrasGroup?.includes(groupId)) return;

              const selected = groupById.get(groupId);
              if (!selected) return;

              setProduct(prev => {
  const updatedGroupIds = [...(prev.selectedExtrasGroup || []), groupId];
  // Dynamically derive extras from all selected groups
  const newExtras = updatedGroupIds.flatMap(id => {
    const group = groupById.get(id);
    return group?.items?.map(item => ({
      name: item.name,
      extraPrice: item.extraPrice,
    })) || [];
  });

  return {
    ...prev,
    selectedExtrasGroup: updatedGroupIds,
    extras: newExtras,
  };
});

            }}
            className="p-2 border rounded-xl w-full mb-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white"
          >
            <option value="">{t("-- Select Extras Group --")}</option>
            {extrasGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.group_name}
              </option>
            ))}
          </select>

          {/* Selected group chips (show titles) */}
          <div className="flex flex-wrap gap-2 mb-2">
            {(product.selectedExtrasGroup || []).map((groupId, idx) => {
              const group = groupById.get(groupId);
              if (!group) return null;
              return (
                <div key={idx} className="flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 rounded-xl font-semibold">
                  {group.group_name}
                  <button
                    type="button"
                    onClick={() => {
  const updatedGroups = product.selectedExtrasGroup.filter((id) => id !== groupId);
  const updatedExtras = updatedGroups.flatMap(id => {
    const group = groupById.get(id);
    return group?.items?.map(item => ({
      name: item.name,
      extraPrice: item.extraPrice,
    })) || [];
  });
  setProduct(prev => ({
    ...prev,
    selectedExtrasGroup: updatedGroups,
    extras: updatedExtras,
  }));
}}

                    className="ml-2 text-red-500 font-bold text-lg"
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>

          {/* Extras list preview */}
          {product.extras.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-sm text-gray-700 dark:text-gray-200 space-y-1">
              {product.extras.map((ex, idx) => (
                <li key={idx}>{ex.name} — ₺{parseFloat(ex.extraPrice || 0).toFixed(2)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Description / Discount */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <div>
          <label className="font-semibold">{t("Description")}</label>
          <textarea name="description" value={product.description} onChange={handleChange}
                    className="w-full p-3 rounded-xl border mb-4" rows={3} />
          <label className="font-semibold">{t("Tags (comma separated)")}</label>
          <input type="text" name="tags" value={product.tags} onChange={handleChange}
                 className="w-full p-3 rounded-xl border mb-4" />
          <label className="font-semibold">{t("Allergens")}</label>
          <input type="text" name="allergens" value={product.allergens} onChange={handleChange}
                 className="w-full p-3 rounded-xl border" />
        </div>
        <div>
          <h3 className="font-bold mb-2">{t("Discount")}</h3>
          <div className="flex gap-4 items-center mb-2">
            {["none", "percentage", "fixed"].map(type => (
              <label key={type} className="flex items-center gap-1">
                <input type="radio" name="discount_type" value={type}
                       checked={product.discount_type === type}
                       onChange={handleChange} />
                {t(type === "none" ? "None" : type === "percentage" ? "Percentage" : "Fixed Price")}
              </label>
            ))}
          </div>
          {product.discount_type !== "none" && (
            <input
              type="number"
              name="discount_value"
              placeholder={product.discount_type === "percentage" ? t("Discount %") : t("Discount ₺")}
              value={product.discount_value}
              onChange={handleChange}
              className="p-2 border rounded-xl w-40 mb-4"
            />
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-4 justify-end mt-4">
        <button
          type="submit"
          className="bg-gradient-to-r from-green-500 to-teal-500 hover:brightness-110 text-white font-bold px-8 py-3 rounded-2xl shadow-lg hover:scale-[1.04] transition-all"
        >
          {t("Save Product")}
        </button>
        {initialData?.id && (
          <button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 rounded-2xl shadow-lg hover:scale-[1.03] transition-all"
            onClick={async () => {
              if (window.confirm(t("Are you sure you want to delete this product?"))) {
                try {
                  const res = await fetch(`${API_URL}/api/products/${initialData.id}`, { method: "DELETE" });
                  if (!res.ok) throw new Error("Failed to delete product");
                  onSuccess && onSuccess();
                } catch {
                  alert(t("Failed to delete product."));
                }
              }
            }}
          >
            {t("Delete Product")}
          </button>
        )}
      </div>
    </form>
  );
}
