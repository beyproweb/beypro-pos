import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  INGREDIENT_PRICES_API,
  EXTRAS_GROUPS_API,
  PRODUCTS_API,
} from "../utils/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";


export default function ProductForm({ onSuccess, initialData = null }) {
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
    selectedExtrasGroup: [],
  });
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [calculatedCost, setCalculatedCost] = useState(0);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const { t } = useTranslation();
  const [imagePreview, setImagePreview] = useState(null);
  const [categoryImagePreview, setCategoryImagePreview] = useState(null);
   const [imageFile, setImageFile] = useState(null);
const [imageUrl, setImageUrl] = useState(""); // new



// Upload to backend /api/upload (which uploads to Cloudinary)
const handleUpload = async () => {
  if (!imageFile) return "";
  const formData = new FormData();
  formData.append("file", imageFile); // <-- FIELD NAME **MUST** BE "file"!
  const res = await fetch(`${API_URL}/api/upload`, {

    method: "POST",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok || !data.url) {
    toast.error("Image upload failed!");
    return "";
  }
  setImageUrl(data.url);
  setImagePreview(data.url);

  return data.url;
};

 
const getImageSource = () => {
  return imageUrl || imagePreview || null;
};





function normalizeExtras(arr = []) {
  return arr.map(ex => ({
    ...ex,
    extraPrice:
      ex.extraPrice !== undefined
        ? ex.extraPrice
        : (ex.price !== undefined ? ex.price : 0),
    // Optionally, always include name for consistency
    name: ex.name || ex.ingredient_name || "",
  }));
}

useEffect(() => {
  if (product.category) {
    const cat = product.category.trim().toLowerCase();
    fetch(`${API_URL}/api/category-images?category=${encodeURIComponent(cat)}`)
      .then(res => res.json())
      .then(data => {
        console.log("Category image fetch result:", data);
        if (data.length > 0 && data[0].image) {
          const img = data[0].image;
          if (img && img.startsWith("http")) {
            setCategoryImagePreview(img); // Cloudinary full URL
          } else if (img) {
            setCategoryImagePreview(`${API_URL}/uploads/${img}`); // fallback
          } else {
            setCategoryImagePreview(null);
          }
        } else {
          setCategoryImagePreview(null);
        }
      })
      .catch(err => {
        console.error("Category image fetch failed:", err);
        setCategoryImagePreview(null);
      });
  }
}, [product.category]);


  useEffect(() => {
    fetch(INGREDIENT_PRICES_API)
      .then((res) => res.json())
      .then((data) => setIngredientPrices(Array.isArray(data) ? data : []))
      .catch(() => setIngredientPrices([]));
  }, []);

useEffect(() => {
  fetch(EXTRAS_GROUPS_API)
    .then((res) => res.json())
    .then((data) => {
      setExtrasGroups(
        Array.isArray(data)
          ? data.map(g => ({
              ...g,
              group_name: g.group_name || g.groupName, // always normalize to group_name
              items: Array.isArray(g.items)
                ? g.items.map(i => ({
                    ...i,
                    extraPrice: i.extraPrice !== undefined ? i.extraPrice : (i.price !== undefined ? i.price : 0),
                  }))
                : [],
            }))
          : []
      );
    })
    .catch(() => setExtrasGroups([]));
}, []);



  useEffect(() => {
    let total = 0;
    product.ingredients.forEach((ing) => {
      const found = ingredientPrices.find((i) => i.name === ing.ingredient);
      if (found && ing.quantity) {
        total += parseFloat(ing.quantity) * parseFloat(found.price_per_unit);
      }
    });
    product.extras.forEach((ex) => {
      if (ex.extraPrice) total += parseFloat(ex.extraPrice);
    });
    setCalculatedCost(total);
  }, [product.ingredients, product.extras, ingredientPrices]);

useEffect(() => {
  if (initialData) {
    const normalized = {
      ...initialData,
      image: initialData.image || initialData.image_url || null,
    };

   

    setProduct((prev) => ({ ...prev, ...normalized }));
    if (normalized.image) {
  setImagePreview(normalized.image);
  setImageUrl(normalized.image); // ensure preview works
}

  }
}, [initialData]);



  // --- Handlers ---
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProduct((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

 // Handle file selection
const handleImageChange = (e) => {
  setImageFile(e.target.files[0]);
};

  // INGREDIENTS
  const addIngredient = () => {
    setProduct((prev) => ({
      ...prev,
      ingredients: [...prev.ingredients, { ingredient: "", quantity: "", unit: "" }],
    }));
  };
  const handleIngredientChange = (index, e) => {
    const { name, value } = e.target;
    const newIngredients = [...product.ingredients];
    newIngredients[index][name] = value;
    setProduct((prev) => ({
      ...prev,
      ingredients: newIngredients,
    }));
  };
  const removeIngredient = (index) => {
    setProduct((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  // EXTRAS
  const addExtra = () => {
    setProduct((prev) => ({
      ...prev,
      extras: [...prev.extras, { name: "", extraPrice: "" }],
    }));
  };
  const handleExtraChange = (index, e) => {
    const { name, value } = e.target;
    const newExtras = [...product.extras];
    newExtras[index][name] = value;
    setProduct((prev) => ({
      ...prev,
      extras: newExtras,
    }));
  };
  const removeExtra = (index) => {
    setProduct((prev) => ({
      ...prev,
      extras: prev.extras.filter((_, i) => i !== index),
    }));
  };

  // SUBMIT
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!product.name.trim() || !product.price || Number(product.price) <= 0) {
    toast.error("Product name and price required");
    return;
  }

  // Always upload image if a new file is chosen
  let uploadedImageUrl = imageUrl;
  if (imageFile) {
    uploadedImageUrl = await handleUpload();
    if (!uploadedImageUrl) {
      toast.error("Image upload failed!");
      return;
    }
  }

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
    selectedExtrasGroup: product.selectedExtrasGroup || [],
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
      const err = await res.json();
      toast.error(err.error || "Failed to save product");
      return;
    }

    toast.success(isEdit ? "Product updated!" : "Product saved!");

    // Reset all state:
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

    if (onSuccess) onSuccess(); // <- This will close the modal in Products.jsx!
  } catch (err) {
    console.error("❌ Product save error:", err);
    toast.error("Product save error");
  }
};





  // --- UI ---
 return (
    <form onSubmit={handleSubmit} className="space-y-7 max-w-4xl w-full mx-auto" autoComplete="off">
      {/* HEADER */}
      <h2 className="text-xl font-bold text-indigo-700 mb-1">
        {initialData ? t("Edit Product") : t("Add Product")}
      </h2>

      {/* BASIC & PROMO INFO 2x2 GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        <div>
          <label className="font-semibold">{t("Name")}</label>
          <input type="text" name="name" value={product.name} onChange={handleChange}
            className="w-full p-3 rounded-xl border mt-1 mb-4" required />

          <label className="font-semibold">{t("Price (₺)")}</label>
          <input type="number" name="price" value={product.price} onChange={handleChange}
            className="w-full p-3 rounded-xl border mt-1 mb-2" required />
          <div className="text-xs text-gray-500 mb-3">
            💰 {t("Estimated Cost")}: <span className="font-bold">₺{calculatedCost.toFixed(2)}</span>
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
      const res = await fetch(`${API_URL}/api/category-images`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        toast.error("Upload failed");
        return;
      }
      toast.success("Category image uploaded!");

      // Refetch preview after upload
      const cat = product.category.trim().toLowerCase();
      const resp = await fetch(`${API_URL}/api/category-images?category=${encodeURIComponent(cat)}`);
      const data = await resp.json();
      if (data.length > 0 && data[0].image) {
        const img = data[0].image;
        if (img && img.startsWith("http")) {
          setCategoryImagePreview(img);
        } else if (img) {
          setCategoryImagePreview(`${API_URL}/uploads/${img}`);
        } else {
          setCategoryImagePreview(null);
        }
      }
    } catch (err) {
      console.error("Category upload failed:", err);
      toast.error("Category upload failed!");
    }
  }}
  className="w-full p-1 mt-1"
/>



{/* Show category image preview */}
{categoryImagePreview && (
  <div className="my-2">
    <p className="text-xs text-gray-500">{t("Category Image Preview")}</p>
    <img
      src={categoryImagePreview}
      alt="Category"
      className="w-20 h-20 rounded-xl object-cover border shadow"
    />
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
{getImageSource() && (
  <img
    src={getImageSource()}
    alt="Preview"
    style={{ width: 120, margin: 8 }}
  />
)}





        </div>
      </div>

      {/* 2x2 GRID FOR LONG FIELDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
        {/* INGREDIENTS */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="font-bold mb-3">{t("Ingredients")}</h3>
          <div className="space-y-2">
            {product.ingredients.map((ing, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
  <input type="text" name="ingredient" placeholder={t("Ingredient Name")}
    value={ing.ingredient} onChange={e => handleIngredientChange(i, e)}
    className="p-2 rounded-xl border flex-1 min-w-[120px]" />
  <input type="number" name="quantity" placeholder={t("Qty")}
    value={ing.quantity} onChange={e => handleIngredientChange(i, e)}
    className="p-2 rounded-xl border w-20 min-w-[60px]" />
  <input type="text" name="unit" placeholder={t("Unit")}
    value={ing.unit} onChange={e => handleIngredientChange(i, e)}
    className="p-2 rounded-xl border w-20 min-w-[60px]" />
  <button type="button"
    onClick={() => removeIngredient(i)}
    className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-xl"
    title={t("Remove")}
  >
    <Trash2 size={16} />
  </button>
</div>

            ))}
            <button type="button" onClick={addIngredient}
              className="mt-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center gap-1 font-semibold"
            >
              <Plus size={18} /> {t("Add Ingredient")}
            </button>
          </div>
        </div>

        {/* EXTRAS */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="font-bold mb-3">{t("Extras")}</h3>
          <label className="block font-semibold mb-2">{t("Select Extras Group")}</label>
         <select
  value=""
  onChange={(e) => {
    const groupName = e.target.value;
    if (!groupName) return;
    if (product.selectedExtrasGroup?.includes(groupName)) return;
    const selected = extrasGroups.find((g) => g.group_name === groupName);
    if (selected) {
      setProduct((prev) => ({
        ...prev,
        selectedExtrasGroup: [...(prev.selectedExtrasGroup || []), groupName],
  extras: [
  ...(prev.extras || []),
  ...(selected.items || []).map(item => ({
    name: item.name,
    extraPrice:
      item.extraPrice !== undefined
        ? item.extraPrice
        : (item.price !== undefined ? item.price : 0),
  }))
],

      }));
    }
  }}
  className="p-2 border rounded-xl w-full mb-2 bg-white text-gray-900 dark:bg-gray-900 dark:text-white"
>
  <option value="" className="text-gray-700 dark:text-white bg-white dark:bg-gray-900">
    {t("-- Select Extras Group --")}
  </option>
  {extrasGroups.map((group, i) => (
    <option
      key={i}
      value={group.group_name}
      className="text-gray-900 dark:text-white bg-white dark:bg-gray-900"
    >
      {group.group_name}
    </option>
  ))}
</select>


          <div className="flex flex-wrap gap-2 mb-2">
            {(product.selectedExtrasGroup || []).map((groupName, idx) => (
              <div key={idx} className="flex items-center px-3 py-1 bg-indigo-100 text-indigo-800 rounded-xl font-semibold">
                {groupName}
                <button type="button" onClick={() => {
                  const updatedGroups = product.selectedExtrasGroup.filter((g) => g !== groupName);
                  const updatedExtras = (product.extras || []).filter(
                    (ex) => !extrasGroups.find((g) => g.group_name === groupName)?.items.some((item) => item.name === ex.name)
                  );
                  setProduct((prev) => ({
                    ...prev,
                    selectedExtrasGroup: updatedGroups,
                    extras: updatedExtras,
                  }));
                }} className="ml-2 text-red-500 font-bold text-lg">&times;</button>
              </div>
            ))}
          </div>
          {product.extras.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-sm text-gray-700 dark:text-gray-200 space-y-1">
              {product.extras.map((ex, idx) => (
                <li key={idx}>{ex.name} — ₺{parseFloat(ex.extraPrice || 0).toFixed(2)}</li>
              ))}
            </ul>
          )}

        </div>
      </div>

      {/* DESCRIPTION, TAGS, DISCOUNT */}
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
            {["none", "percentage", "fixed"].map((type) => (
              <label key={type} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="discount_type"
                  value={type}
                  checked={product.discount_type === type}
                  onChange={handleChange}
                />
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

      {/* SAVE / DELETE BUTTONS */}
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
