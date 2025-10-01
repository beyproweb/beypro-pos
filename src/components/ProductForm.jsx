import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INGREDIENT_PRICES_API,
  EXTRAS_GROUPS_API,
} from "../utils/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import secureFetch from "../utils/secureFetch";
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

  // fetch server-side product costs when editing
// fetch server-side product costs when editing
useEffect(() => {
  if (!initialData?.id) return;
  if (!product.ingredients || product.ingredients.length === 0) return;

  fetch(`${API_URL}/api/products/costs`)
    .then(res => res.json())
    .then(data => {
      if (data && data[initialData.id] !== undefined) {
        setEstimatedCost(data[initialData.id]);
      }
    })
    .catch(() => {});
}, [initialData, product.ingredients]);

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

    const basePrice = match.price ?? match.price_per_unit ?? 0;
  const converted = convertPrice(basePrice, normalizeUnit(match.unit), normalizeUnit(ing.unit));
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

  // 🧮 trigger cost update right after ingredient/unit/qty change
  if (name === "ingredient" || name === "unit" || name === "quantity") {
    recalcEstimatedCost(list);
  }
};


const recalcEstimatedCost = (ingredients) => {
  let total = 0;
  (ingredients || []).forEach(ing => {
    if (!ing.ingredient || !ing.quantity || !ing.unit) return;
    const match = availableIngredients.find(ai => ai.name === ing.ingredient);
    if (!match) return;
    const converted = convertPrice(match.price, match.unit, ing.unit);
    if (converted !== null) {
      total += parseFloat(ing.quantity) * converted;
    }
  });
  setEstimatedCost(total);
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
  selected_extras_group: groupIds, // ✅ use snake_case for DB
};



try {
  const isEdit = !!initialData?.id;
  const method = isEdit ? "PUT" : "POST";
  const endpoint = isEdit
    ? `/products/${initialData.id}`
    : `/products`;

  // secureFetch already returns parsed JSON data
  const data = await secureFetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (data?.error) {
    toast.error(data.error || "Failed to save product");
    return;
  }

  toast.success(isEdit ? "✅ Product updated!" : "✅ Product saved!");

  // reset form
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
  selected_extras_group: [], // ✅ match DB
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
  <form
    onSubmit={handleSubmit}
    className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6"
    autoComplete="off"
  >
    {/* MAIN LAYOUT */}
    <div className="flex flex-col xl:flex-row gap-6">
      {/* LEFT: FORM */}
      <div className="flex-1 space-y-6">
        {/* Basic Info */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 space-y-4">
  <h3 className="text-lg font-semibold">{t("Basic Information")}</h3>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* Name always spans full width */}
    <label className="block lg:col-span-2">
      <span className="font-medium">{t("Name")}</span>
      <input
        type="text"
        name="name"
        value={product.name}
        onChange={handleChange}
        className="w-full p-3 mt-1 rounded-xl border"
        required
      />
    </label>

    {/* LEFT COLUMN: Category + Category Image */}
    <div>
      <label className="block">
        <span className="font-medium">{t("Category")}</span>
        <input
          type="text"
          name="category"
          value={product.category}
          onChange={handleChange}
          className="w-full p-3 mt-1 rounded-xl border"
        />
      </label>

      <label className="block mt-3">
        <span className="font-medium">{t("Category Image")}</span>
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files[0];
            if (!file || !product.category) {
              toast.error(t("Category required first!"));
              return;
            }
            const fd = new FormData();
            fd.append("image", file);
            fd.append("category", product.category.trim().toLowerCase());
            try {
              const res = await fetch(`${API_URL}/api/category-images`, {
                method: "POST",
                body: fd,
              });
              if (!res.ok) {
                toast.error("Upload failed");
                return;
              }
              toast.success("Category image uploaded!");
              const cat = product.category.trim().toLowerCase();
              const resp = await fetch(
                `${API_URL}/api/category-images?category=${encodeURIComponent(cat)}`
              );
              const data = await resp.json();
              if (data.length > 0 && data[0].image) {
                const img = data[0].image;
                setCategoryImagePreview(
                  img.startsWith("http") ? img : `${API_URL}/uploads/${img}`
                );
              }
            } catch (err) {
              toast.error("Category upload failed!");
            }
          }}
          className="w-full mt-1"
        />
      </label>

      {categoryImagePreview && (
        <div className="mt-2 flex items-center gap-3">
          <img
            src={categoryImagePreview}
            alt="Category"
            className="w-16 h-16 rounded-lg object-cover border shadow"
          />
          <span className="text-sm text-gray-500">{t("Category Preview")}</span>
        </div>
      )}
    </div>

    {/* RIGHT COLUMN: Price + Prep Time */}
    <div>
      <label className="block">
        <span className="font-medium">{t("Price (₺)")}</span>
        <input
          type="number"
          name="price"
          value={product.price}
          onChange={handleChange}
          className="w-full p-3 mt-1 rounded-xl border"
          required
        />
      </label>

      <label className="block mt-3">
        <span className="font-medium">{t("Preparation Time (min)")}</span>
        <input
          type="number"
          name="preparation_time"
          value={product.preparation_time}
          onChange={handleChange}
          className="w-full p-3 mt-1 rounded-xl border"
        />
      </label>
    </div>
  </div>

          {/* Product Image Upload */}
          <label className="block mt-3">
            <span className="font-medium">{t("Product Image")}</span>
            <input type="file" accept="image/*" onChange={handleImageChange} />
          </label>
          {getImageSource() && (
            <img
              src={getImageSource()}
              alt="Preview"
              className="mt-2 w-24 h-24 rounded-xl object-cover border"
            />
          )}

        


          {/* Promotion + visible */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-medium">{t("Promotion Start Date")}</span>
              <input
                type="date"
                name="promo_start"
                value={product.promo_start}
                onChange={handleChange}
                className="w-full p-3 mt-1 rounded-xl border"
              />
            </label>

            <label className="block">
              <span className="font-medium">{t("Promotion End Date")}</span>
              <input
                type="date"
                name="promo_end"
                value={product.promo_end}
                onChange={handleChange}
                className="w-full p-3 mt-1 rounded-xl border"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="visible"
              checked={product.visible}
              onChange={handleChange}
              className="w-5 h-5 rounded"
            />
            <span>{t("Visible on Website")}</span>
          </div>
        </section>

        {/* Ingredients */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5">
          <details open>
            <summary className="cursor-pointer text-lg font-semibold mb-3">
              {t("Ingredients")}
            </summary>
            <div className="space-y-3">
              {product.ingredients.map((ing, i) => {
                let cost = null;
                if (ing.ingredient && ing.quantity && ing.unit) {
                  const match = ingredientPrices.find(
                    (ai) =>
                      ai.name.toLowerCase().trim() ===
                      ing.ingredient.toLowerCase().trim()
                  );
                  if (match) {
                    const basePrice = match.price_per_unit ?? 0;
                    const converted = convertPrice(
                      basePrice,
                      normalizeUnit(match.unit),
                      normalizeUnit(ing.unit)
                    );
                    if (converted !== null) {
                      cost = parseFloat(ing.quantity) * converted;
                    }
                  }
                }

                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border"
                  >
                    <select
                      name="ingredient"
                      value={ing.ingredient}
                      onChange={(e) => handleIngredientChange(i, e)}
                      className="p-2 rounded-xl border flex-1 min-w-[120px]"
                    >
                      <option value="">{t("Select Ingredient")}</option>
                      {ingredientPrices.map((item, idx) => (
                        <option key={idx} value={item.name}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      name="quantity"
                      placeholder={t("Qty")}
                      value={ing.quantity}
                      onChange={(e) => handleIngredientChange(i, e)}
                      className="p-2 rounded-xl border w-20"
                    />

                    <select
                      name="unit"
                      value={ing.unit || ""}
                      onChange={(e) => handleIngredientChange(i, e)}
                      className="p-2 rounded-xl border w-24"
                    >
                      <option value="">{t("Select Unit")}</option>
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="pieces">pieces</option>
                      <option value="portion">portion</option>
                      <option value="ml">ml</option>
                      <option value="l">l</option>
                    </select>

                    {cost !== null && (
                      <span className="ml-2 text-sm font-bold text-rose-600">
                        ₺{cost.toFixed(2)}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => removeIngredient(i)}
                      className="ml-auto bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addIngredient}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center justify-center gap-1 font-semibold"
              >
                <Plus size={18} /> {t("Add Ingredient")}
              </button>
            </div>
              {/* Cost per unit */}
          <p className="text-sm text-rose-600 font-semibold mt-2">
            {t("Cost per unit")}: ₺{estimatedCost.toFixed(2)}
          </p>
          </details>
        </section>

        {/* Extras */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5">
          <details open>
            <summary className="cursor-pointer text-lg font-semibold mb-3">
              {t("Extras")}
            </summary>
            <label className="block font-semibold mb-2">
              {t("Select Extras Group")}
            </label>
            <select
              value=""
              onChange={(e) => {
                const groupId = Number(e.target.value);
                if (!groupId) return;
                if (product.selectedExtrasGroup?.includes(groupId)) return;
                const selected = groupById.get(groupId);
                if (!selected) return;

                setProduct((prev) => {
                  const updatedGroupIds = [
                    ...(prev.selectedExtrasGroup || []),
                    groupId,
                  ];
                  const newExtras = updatedGroupIds.flatMap((id) => {
                    const group = groupById.get(id);
                    return (
                      group?.items?.map((item) => ({
                        name: item.name,
                        extraPrice: item.extraPrice,
                      })) || []
                    );
                  });
                  return {
                    ...prev,
                    selectedExtrasGroup: updatedGroupIds,
                    extras: newExtras,
                  };
                });
              }}
              className="p-2 border rounded-xl w-full mb-2"
            >
              <option value="">{t("-- Select Extras Group --")}</option>
              {extrasGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.group_name}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-2 mb-3">
              {(product.selectedExtrasGroup || []).map((groupId, idx) => {
                const group = groupById.get(groupId);
                if (!group) return null;
                return (
                  <div
                    key={idx}
                    className="flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 rounded-xl font-semibold"
                  >
                    {group.group_name}
                    <button
                      type="button"
                      onClick={() => {
                        const updatedGroups =
                          product.selectedExtrasGroup.filter(
                            (id) => id !== groupId
                          );
                        const updatedExtras = updatedGroups.flatMap((id) => {
                          const group = groupById.get(id);
                          return (
                            group?.items?.map((item) => ({
                              name: item.name,
                              extraPrice: item.extraPrice,
                            })) || []
                          );
                        });
                        setProduct((prev) => ({
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

            {product.extras.length > 0 && (
              <ul className="list-disc list-inside text-sm space-y-1">
                {product.extras.map((ex, idx) => (
                  <li key={idx}>
                    {ex.name} — ₺{parseFloat(ex.extraPrice || 0).toFixed(2)}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>

        {/* Description + Discounts */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 space-y-4">
          <label className="block">
            <span className="font-medium">{t("Descriptions")}</span>
            <textarea
              name="description"
              value={product.description}
              onChange={handleChange}
              rows={3}
              className="w-full p-3 mt-1 rounded-xl border"
            />
          </label>
          <label className="block">
            <span className="font-medium">{t("Tags (comma separated)")}</span>
            <input
              type="text"
              name="tags"
              value={product.tags}
              onChange={handleChange}
              className="w-full p-3 mt-1 rounded-xl border"
            />
          </label>
          <label className="block">
            <span className="font-medium">{t("Allergens")}</span>
            <input
              type="text"
              name="allergens"
              value={product.allergens}
              onChange={handleChange}
              className="w-full p-3 mt-1 rounded-xl border"
            />
          </label>

          <div>
            <h4 className="font-semibold mb-3">{t("Discounts")}</h4>
            <div className="flex flex-col gap-2">
              {["none", "percentage", "fixed"].map((type) => (
                <label key={type} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="discount_type"
                    value={type}
                    checked={product.discount_type === type}
                    onChange={handleChange}
                  />
                  {t(
                    type === "none"
                      ? "None"
                      : type === "percentage"
                      ? "Percentage"
                      : "Fixed Price"
                  )}
                </label>
              ))}
            </div>
            {product.discount_type !== "none" && (
              <input
                type="number"
                name="discount_value"
                value={product.discount_value}
                onChange={handleChange}
                className="mt-3 w-40 p-2 border rounded-xl"
              />
            )}
          </div>
        </section>

        {/* Mobile/Laptop Preview */}
        <section className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 xl:hidden">
          <details>
            <summary className="cursor-pointer text-lg font-semibold">
              {t("Live Preview")}
            </summary>
            <div className="mt-3 border rounded-xl overflow-hidden">
              {getImageSource() ? (
                <img
                  src={getImageSource()}
                  alt="Preview"
                  className="w-full h-40 object-cover"
                />
              ) : (
                <div className="w-full h-40 flex items-center justify-center text-gray-400 bg-gray-50">
                  {t("No Image")}
                </div>
              )}
              <div className="p-4 space-y-1">
                <h4 className="text-base font-bold">
                  {product.name || t("Untitled")}
                </h4>
                <p className="text-gray-600 text-sm">
                  ₺{product.price ? Number(product.price).toFixed(2) : "0.00"}
                </p>
                <p className="text-xs text-rose-600 font-semibold">
                  {t("Cost per unit")}: ₺{estimatedCost.toFixed(2)}
                </p>
              </div>
            </div>
          </details>
        </section>
      </div>

      {/* RIGHT PREVIEW on XL screens */}
      <aside className="hidden xl:block w-64">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow p-5 sticky top-4">
          <h3 className="text-lg font-semibold mb-4">{t("Live Preview")}</h3>
          <div className="border rounded-xl overflow-hidden">
            {getImageSource() ? (
              <img
                src={getImageSource()}
                alt="Preview"
                className="w-full h-36 object-cover"
              />
            ) : (
              <div className="w-full h-36 flex items-center justify-center text-gray-400 bg-gray-50">
                {t("No Image")}
              </div>
            )}
            <div className="p-4 space-y-1">
              <h4 className="text-base font-bold">
                {product.name || t("Untitled")}
              </h4>
              <p className="text-gray-600 text-sm">
                ₺{product.price ? Number(product.price).toFixed(2) : "0.00"}
              </p>
              <p className="text-xs text-rose-600 font-semibold">
                {t("Cost per unit")}: ₺{estimatedCost.toFixed(2)}
              </p>
              {product.description && (
                <p className="text-xs text-gray-500 line-clamp-3">
                  {product.description}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>

    {/* Sticky Actions */}
    <div className="sticky bottom-0 bg-white dark:bg-gray-900 py-4 border-t flex flex-col sm:flex-row gap-3 justify-end">
      <button
        type="submit"
        className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl shadow"
      >
        {t("Save Product")}
      </button>
      {initialData?.id && (
        <button
          type="button"
          className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl shadow"
          onClick={async () => {
            if (window.confirm(t("Are you sure you want to delete this product?"))) {
              try {
                const res = await fetch(`${API_URL}/api/products/${initialData.id}`, {
                  method: "DELETE",
                });
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
