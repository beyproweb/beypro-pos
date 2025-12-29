import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { INGREDIENT_PRICES_API } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};

const normalizeStockList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.stock)) return payload.stock;
  if (Array.isArray(payload?.stocks)) return payload.stocks;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};
const normalizeUnit = (u) => {
  if (!u) return "";
  u = u.toLowerCase();
  if (u === "lt") return "l";
  if (u === "pieces") return "piece";
  if (u === "portion" || u === "portions") return "portion";
  return u;
};

const normalizeUnitForApi = (u) => {
  const normalized = normalizeUnit(u);
  if (!normalized) return "";
  if (normalized === "l") return "lt";
  return normalized;
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


export default function ProductForm({ onSuccess, initialData = null, categories = [] }) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { formatCurrency } = useCurrency();
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
    selected_extras_group: [],
    show_add_to_cart_modal: true,
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

  const categoryOptions = useMemo(() => {
    const unique = new Set(
      (Array.isArray(categories) ? categories : []).filter((item) => !!item)
    );
    if (product.category) {
      unique.add(product.category);
    }
    return Array.from(unique).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [categories, product.category]);
useEffect(() => {
  // keep this in sync with the ingredient price source used below
  secureFetch("/ingredient-prices")
    .then((data) => setAvailableIngredients(Array.isArray(data) ? data : []))
    .catch(() => setAvailableIngredients([]));
}, []);

  // ---------- helpers ----------
const handleUpload = async () => {
  if (!imageFile) return "";
  try {
    const formData = new FormData();
    formData.append("file", imageFile);

    // Use secureFetch (it auto-handles headers + token)
    const data = await secureFetch("/upload", {
      method: "POST",
      body: formData,
    });

    if (!data || !data.url) {
      toast.error("Image upload failed!");
      return "";
    }

    setImageUrl(data.url);
    setImagePreview(data.url);
    return data.url;
  } catch (err) {
    console.error("❌ Upload error:", err);
    toast.error("Image upload failed!");
    return "";
  }
};


  const getImageSource = () => imageUrl || imagePreview || null;

  // ---------- effects ----------
// ✅ Fetch tenant-safe ingredients, merge duplicates, and format names nicely
useEffect(() => {
  // Prefer /ingredient-prices (it reflects latest supplier deliveries), fall back to /suppliers/ingredients.
  const load = async () => {
    let data = [];
    try {
      const primary = await secureFetch("/ingredient-prices");
      if (Array.isArray(primary)) data = primary;
    } catch {}
    if (!Array.isArray(data) || data.length === 0) {
      try {
        const fallback = await secureFetch("/suppliers/ingredients");
        if (Array.isArray(fallback)) data = fallback;
      } catch {}
    }

      // Step 1: normalize all
    const normalized = (Array.isArray(data) ? data : []).map((item) => ({
      name: item.name?.trim(),
      lower: item.name?.trim().toLowerCase(),
      unit: item.unit?.trim(),
      trend: item.trend,
      price_per_unit: toNumber(
        item.price_per_unit ??
          item.unit_price ??
          item.price ??
          item.cost_per_unit ??
          item.costPrice ??
          0
      ),
    }));

      // Step 2: merge duplicates (case-insensitive)
      const mergedMap = new Map();
      for (const ing of normalized) {
        if (!ing.lower) continue;
        if (!mergedMap.has(ing.lower)) {
          mergedMap.set(ing.lower, {
            name:
              ing.name.charAt(0).toUpperCase() + ing.name.slice(1).toLowerCase(), // Title Case
            unit: ing.unit,
            price_per_unit: ing.price_per_unit,
            trend: ing.trend,
          });
        } else {
          const existing = mergedMap.get(ing.lower);
          if (!existing.unit && ing.unit) existing.unit = ing.unit;
          if (!(existing.price_per_unit > 0) && ing.price_per_unit > 0) {
            existing.price_per_unit = ing.price_per_unit;
          }
        }
      }

    const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    );

    // If prices are missing/0, fall back to current stock prices (Stock page uses this).
    const hasMissingPrices = mergedList.some((it) => !(toNumber(it.price_per_unit) > 0));
    let finalList = mergedList;
    if (hasMissingPrices) {
      try {
        const stockRaw = await secureFetch("/stock");
        const stock = normalizeStockList(stockRaw);
        const stockPriceMap = new Map(); // name|unit -> price_per_unit
        for (const s of stock) {
          const nameKey = String(s?.name || "").trim().toLowerCase();
          const unitKey = normalizeUnit(s?.unit);
          const key = `${nameKey}|${unitKey}`;
          const price = toNumber(s?.price_per_unit ?? s?.unit_price ?? s?.price ?? 0);
          if (price > 0 && !stockPriceMap.has(key)) stockPriceMap.set(key, price);
        }

        finalList = mergedList.map((it) => {
          const nameKey = String(it?.name || "").trim().toLowerCase();
          const unitKey = normalizeUnit(it?.unit);
          const key = `${nameKey}|${unitKey}`;
          const stockPrice = stockPriceMap.get(key) || 0;
          if (toNumber(it.price_per_unit) > 0 || !(stockPrice > 0)) return it;
          return { ...it, price_per_unit: stockPrice };
        });
      } catch {}
    }

    setIngredientPrices(finalList);
    setAvailableIngredients(finalList);
  };
  load().catch(() => setIngredientPrices([]));
}, []);




useEffect(() => {
  if (!initialData?.id) return;

  secureFetch("/products/costs")
    .then(data => {
      if (!Array.isArray(data)) return;

      const match = data.find(p => p.id === initialData.id);
      const costNum = parseFloat(match?.ingredient_cost ?? 0);
      setEstimatedCost(isNaN(costNum) ? 0 : costNum);
    })
    .catch(() => setEstimatedCost(0));
}, [initialData]);

useEffect(() => {
secureFetch("/products/extras-group")
    .then(data => {
        const normalized = (Array.isArray(data) ? data : []).map(g => ({
          ...g,
          group_name: g.name || g.group_name || g.groupName,
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

  const loadCategoryImage = async () => {
    try {
      const cat = product.category.trim().toLowerCase();
      const identifier = currentUser?.restaurant_id || currentUser?.restaurant?.slug || "";
      const data = await secureFetch(`/category-images?category=${encodeURIComponent(cat)}&identifier=${identifier}`);

      if (Array.isArray(data) && data.length > 0 && data[0].image) {
        const img = data[0].image;
        setCategoryImagePreview(
          img.startsWith("http")
            ? img
            : `${import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:5000"}/uploads/${img}`
        );
      } else {
        setCategoryImagePreview(null);
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch category image:", err);
      setCategoryImagePreview(null);
    }
  };

  loadCategoryImage();
}, [product.category, currentUser]);




// cost calc
useEffect(() => {
  let total = 0;

  (product.ingredients || []).forEach((ing) => {
    if (!ing.ingredient || !ing.quantity || !ing.unit) return;

    // ✅ Case-insensitive match
    const match = ingredientPrices.find(
      ai => ai.name?.trim().toLowerCase() === ing.ingredient?.trim().toLowerCase()
    );
    if (!match) return;

    const basePrice = match.price ?? match.price_per_unit ?? 0;
    const converted = convertPrice(
      basePrice,
      normalizeUnit(match.unit),
      normalizeUnit(ing.unit)
    );
    if (converted !== null) {
      total += parseFloat(ing.quantity) * converted;
    }
  });

  setEstimatedCost(total);
}, [product.ingredients, ingredientPrices]);




  // hydrate initial data
useEffect(() => {
  if (!initialData) return;

  const normalizedExtras = Array.isArray(initialData.extras)
    ? initialData.extras.map((e) => {
        if (typeof e === "string") {
          try { e = JSON.parse(e); } catch { return null; }
        }
        return { name: e?.name || "", extraPrice: Number(e?.extraPrice ?? e?.price) || 0 };
      }).filter(Boolean)
    : [];

  const normalized = {
    ...initialData,
    image: initialData.image || initialData.image_url || null,
    ingredients: Array.isArray(initialData.ingredients) ? initialData.ingredients : [],
    extras: normalizedExtras,
  };

  const currentGroups = Array.isArray(normalized.selected_extras_group)
    ? normalized.selected_extras_group
    : [];

  const mappedToIds = currentGroups.map(g => {
    if (typeof g === "number") return g;
    const byName = extrasGroups.find(x => x.group_name === g);
    return byName ? byName.id : null;
  }).filter(x => Number.isFinite(x));

  setProduct(prev => ({
    ...prev,
    ...normalized,
    selected_extras_group: mappedToIds,
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

  if (name === "ingredient") {
    const picked = String(value || "").trim().toLowerCase();
    const match = ingredientPrices.find(
      (ai) => String(ai?.name || "").trim().toLowerCase() === picked
    );
    if (match?.unit && !list[index].unit) {
      list[index].unit = normalizeUnitForApi(match.unit);
    }
  }

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
    const match = availableIngredients.find(
      (ai) =>
        String(ai?.name || "").trim().toLowerCase() ===
        String(ing?.ingredient || "").trim().toLowerCase()
    );
    if (!match) return;
    const base = toNumber(match.price_per_unit ?? match.unit_price ?? match.price ?? 0);
    const converted = convertPrice(base, match.unit, ing.unit);
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
// ---------- submit ----------
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!product.name.trim() || !product.price || Number(product.price) <= 0) {
    toast.error("Product name and price required");
    return;
  }

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const v = Number(String(value).replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  };

  const normalizedIngredients = Array.isArray(product.ingredients)
    ? product.ingredients
        .map((ing) => {
          const ingredient = String(ing?.ingredient || "").trim();
          const quantity = toNumber(ing?.quantity);
          const unit = normalizeUnitForApi(ing?.unit);
          return { ingredient, quantity, unit };
        })
        .filter((ing) => ing.ingredient)
    : [];

  const invalidIngredient = normalizedIngredients.find(
    (ing) => !ing.unit || !(ing.quantity > 0)
  );
  if (invalidIngredient) {
    toast.error(t("Please enter quantity and unit for all ingredients."));
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
  const groupIds = (product.selected_extras_group || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));

  const payload = {
    ...product,
    image: uploadedImageUrl || product.image || "",
    price: product.price ? Number(product.price) : 0,
    preparation_time: product.preparation_time
      ? Number(product.preparation_time)
      : null,
    discount_value:
      product.discount_value !== undefined && product.discount_value !== ""
        ? Number(product.discount_value)
        : 0,
    ingredients: normalizedIngredients,
    extras: (product.extras || [])
      .map((e) => {
        // normalize strings to objects
        if (typeof e === "string") {
          try {
            e = JSON.parse(e);
          } catch {
            return null;
          }
        }
        return {
          name: e?.name || "",
          extraPrice: Number(e?.extraPrice ?? e?.price) || 0,
          amount: Number(e?.amount ?? 1),
          unit: e?.unit || "",
        };
      })
      .filter(Boolean),
    selected_extras_group: groupIds,
    show_add_to_cart_modal: product.show_add_to_cart_modal !== false,
  };

  try {
    const isEdit = !!initialData?.id;
    const method = isEdit ? "PUT" : "POST";
    const endpoint = isEdit ? `/products/${initialData.id}` : `/products`;

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
      selected_extras_group: [],
      show_add_to_cart_modal: true,
    });

    setImageFile(null);
    setImageUrl("");
    setImagePreview(null);

    onSuccess && onSuccess();
  } catch (err) {
    console.error("❌ Product save error:", err?.details || err);
    const msg =
      err?.details?.body?.error ||
      err?.details?.body?.message ||
      err?.message ||
      "Product save error";
    toast.error(msg);
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
                value={product.name ?? ""}
                onChange={handleChange}
                className="w-full p-3 mt-1 rounded-xl border"
                required
              />
            </label>

            {/* LEFT COLUMN: Category + Category Image */}
            <div>
              <label className="block">
                <span className="font-medium">{t("Category")}</span>
                <select
                  name="category"
                  value={product.category ?? ""}
                  onChange={handleChange}
                  className="w-full p-3 mt-1 rounded-xl border bg-white dark:bg-gray-900"
                >
                  <option value="">{t("Select Category")}</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {categoryOptions.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500">
                    {t("Add a category to get started.")}
                  </p>
                )}
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
               const res = await secureFetch("/category-images", {
  method: "POST",
  body: fd, // ✅ FormData: secureFetch handles this automatically
});

if (!res || res.error) {
  toast.error("Upload failed");
  return;
}

                      toast.success("Category image uploaded!");
                      const cat = product.category.trim().toLowerCase();
const data = await secureFetch(`/category-images?category=${encodeURIComponent(cat)}`);
if (Array.isArray(data) && data.length > 0 && data[0].image) {
  const img = data[0].image;
  setCategoryImagePreview(
    img.startsWith("http")
      ? img
      : `${import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || "http://localhost:5000"}/uploads/${img}`
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
                <span className="font-medium">{t("Price")}</span>
                <input
                  type="number"
                  name="price"
                  value={product.price ?? ""}
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
                  value={product.preparation_time ?? ""}
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
 {/* Promotion + visible */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <label className="block">
              <span className="font-medium">{t("Promotion Start Date")}</span>
              <input
                type="date"
                name="promo_start"
                value={product.promo_start ?? ""}
                onChange={handleChange}
                className="w-full p-3 mt-1 rounded-xl border"
              />
            </label>

            <label className="block">
              <span className="font-medium">{t("Promotion End Date")}</span>
              <input
                type="date"
                name="promo_end"
                value={product.promo_end ?? ""}
                onChange={handleChange}
                className="w-full p-3 mt-1 rounded-xl border"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="visible"
              checked={!!product.visible}
              onChange={handleChange}
              className="w-5 h-5 rounded"
            />
            <span>{t("Visible on Website")}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="show_add_to_cart_modal"
              checked={product.show_add_to_cart_modal !== false}
              onChange={handleChange}
              className="w-5 h-5 rounded"
            />
            <span>{t("Show Add-to-Cart confirmation modal")}</span>
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
                let perUnit = null;
                if (ing.ingredient && ing.unit) {
                  const match = ingredientPrices.find(
                    (ai) =>
                      ai.name.toLowerCase().trim() ===
                      ing.ingredient.toLowerCase().trim()
                  );
                  if (match) {
                    const basePrice = toNumber(match.price_per_unit ?? match.unit_price ?? match.price ?? 0);
                    const fromUnit = normalizeUnit(match.unit);
                    const toUnit = normalizeUnit(ing.unit);
                    let converted = convertPrice(basePrice, fromUnit, toUnit);
                    if (converted === null && basePrice > 0) {
                      // if we can't convert (missing unit), at least show base price
                      converted = fromUnit === toUnit || !fromUnit ? basePrice : null;
                    }
                    if (converted !== null && converted > 0) {
                      perUnit = converted;
                      const qty = toNumber(ing.quantity);
                      if (qty > 0) {
                        cost = qty * converted;
                      }
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
  value={ing.ingredient ?? ""}
  onChange={(e) => handleIngredientChange(i, e)}
  className="p-2 rounded-xl border flex-1 min-w-[120px]"
>
  <option value="">{t("Select Ingredient")}</option>
{ingredientPrices.map((item, idx) => {
  let icon = "⚪";
  if (item.trend === "up") icon = "🔺";
  else if (item.trend === "down") icon = "🟢";

  return (
    <option key={idx} value={item.name}>
      {icon} {item.name.charAt(0).toUpperCase() + item.name.slice(1).toLowerCase()} ({item.unit})
    </option>
  );
})}

</select>


<input
  type="text"
  name="quantity"
  placeholder={t("Qty")}
  value={ing.quantity ?? ""}  // ✅ always a string
  onChange={(e) => handleIngredientChange(i, e)}
  className="p-2 rounded-xl border w-20"
/>

<select
  name="unit"
  value={ing.unit ?? ""}  // ✅ default to empty string
  onChange={(e) => handleIngredientChange(i, e)}
  className="p-2 rounded-xl border w-24"
>
  <option value="">{t("Select Unit")}</option>
  <option value="kg">kg</option>
  <option value="g">g</option>
  <option value="piece">piece</option>
  <option value="portion">portion</option>
  <option value="ml">ml</option>
  <option value="lt">lt</option>
</select>


                    {cost !== null && (
                      <span className="ml-2 text-sm font-bold text-rose-600">
                        {formatCurrency(cost)}
                      </span>
                    )}
                    {perUnit !== null && (
                      <span className="text-xs font-semibold text-slate-500">
                        {t("Unit price")}: {formatCurrency(perUnit)}
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
            {t("Cost per unit")}: {formatCurrency(estimatedCost)}
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
                if (product.selected_extras_group?.includes(groupId)) return;
                const selected = groupById.get(groupId);
                if (!selected) return;

                setProduct((prev) => {
                  const updatedGroupIds = [
                    ...(prev.selected_extras_group || []),
                    groupId,
                  ];
                 const newExtras = updatedGroupIds.flatMap((id) => {
  const group = groupById.get(id);
  return (
    group?.items?.map((item) => ({
      name: item.name,
      extraPrice: Number(item.extraPrice ?? item.price) || 0,
      amount: Number(item.amount ?? 1),
      unit: item.unit || "",
    })) || []
  );
});

                  return {
                    ...prev,
                    selected_extras_group: updatedGroupIds,
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
              {(product.selected_extras_group || []).map((groupId, idx) => {
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
                          product.selected_extras_group.filter(
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
                          selected_extras_group: updatedGroups,
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
                    {ex.name} —{" "}
                    {formatCurrency(parseFloat(ex.extraPrice || 0) || 0)}
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
              value={product.description ?? ""}
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
              value={product.tags ?? ""}
              onChange={handleChange}
              className="w-full p-3 mt-1 rounded-xl border"
            />
          </label>
          <label className="block">
            <span className="font-medium">{t("Allergens")}</span>
            <input
              type="text"
              name="allergens"
              value={product.allergens ?? ""}
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
                value={product.discount_value ?? ""}
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
                  {formatCurrency(product.price ? Number(product.price) : 0)}
                </p>
                <p className="text-xs text-rose-600 font-semibold">
                  {t("Cost per unit")}: {formatCurrency(estimatedCost)}
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
                {formatCurrency(product.price ? Number(product.price) : 0)}
              </p>
              <p className="text-xs text-rose-600 font-semibold">
                {t("Cost per unit")}: {formatCurrency(estimatedCost)}
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
                const res = await secureFetch(`/products/${initialData.id}`, {
                  method: "DELETE",
                });
                if (res?.status !== "success") {
                  throw new Error(res?.message || "Failed to delete product");
                }
                toast.success("✅ Product deleted!");
                onSuccess && onSuccess();
              } catch (err) {
                console.error("❌ Delete failed:", err);
                toast.error("Failed to delete product.");
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
