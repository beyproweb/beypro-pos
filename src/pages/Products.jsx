import React, { useEffect, useState } from "react";
import ProductForm from "../components/ProductForm"; // Import ProductForm
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import {
  SUPPLIERS_API,
  SUPPLIER_CARTS_API,
  SUPPLIER_CART_ITEMS_API,
  TRANSACTIONS_API,
  PRODUCTS_API,
  EXTRAS_GROUPS_API,
} from "../utils/api";
import { Plus, Trash2, Filter, Edit3, Layers } from "lucide-react";
import { useHasPermission } from "../components/hooks/useHasPermission";
const API_URL = import.meta.env.VITE_API_URL || "https://hurrypos-backend.onrender.com";

// Gradient colors for product cards (rotating)
const cardGradients = [
  "from-blue-200 to-indigo-200",
  "from-green-200 to-teal-100",
  "from-yellow-200 to-orange-100",
  "from-pink-100 to-fuchsia-200",
  "from-lime-200 to-green-200",
  "from-purple-200 to-violet-100",
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategoryToDelete, setSelectedCategoryToDelete] = useState("");
  const categories = [...new Set(products.map(p => p.category))].filter(Boolean);
const [showGroupModal, setShowGroupModal] = useState(false);
const [groupName, setGroupName] = useState("");
const [groupItems, setGroupItems] = useState([{ name: "", price: "" }]);
const [extrasGroups, setExtrasGroups] = useState([]);
const [editIndex, setEditIndex] = useState(null); // for inline editing
const { t } = useTranslation();
const [availableIngredients, setAvailableIngredients] = useState([]);

useEffect(() => {
  fetch(`${API_URL}/api/suppliers/ingredients`)
    .then(res => res.json())
    .then(data => setAvailableIngredients(Array.isArray(data) ? data : []))
    .catch(() => setAvailableIngredients([]));
}, []);

const [productCosts, setProductCosts] = useState({});
// In Products.jsx
useEffect(() => {
  fetch(`${API_URL}/api/products/costs`)
    .then(res => res.json())
    .then(setProductCosts)
    .catch(() => setProductCosts({}));
}, [products]);


useEffect(() => { console.log("🧮 Product Costs Fetched:", productCosts); }, [productCosts]);

  useEffect(() => {
    fetch(`${API_URL}/api/products`)
      .then(res => res.json())
      .then(data => setProducts(data));
  }, []);


  // Only allow users with "settings" permission
  const hasSettingsAccess = useHasPermission("settings");
  if (!hasSettingsAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Settings.")}
      </div>
    );
  }


  const filteredProducts = products.filter(product => {
    const matchesCategory =
      selectedCategories.length === 0 || selectedCategories.includes(product.category);
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

const fetchProducts = async () => {
  try {
    // Always use the API_URL, never prefix with window.location.origin
    const url = `${API_URL}/api/products`;
    console.log("📦 Fetching products from:", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch products");
    const data = await response.json();
    setProducts(data);
  } catch (error) {
    console.error("Error fetching products:", error);
  }
};



useEffect(() => {
  fetchProducts();
}, []);

useEffect(() => {
  const fetchExtrasGroups = async () => {
    try {
      const res = await fetch(EXTRAS_GROUPS_API);
      const data = await res.json();
      console.log("Fetched extras groups:", data);
      setExtrasGroups(
  data.map(g => ({
    ...g,
    id: g.id, // group id
    groupName: g.group_name || g.groupName,
    items: Array.isArray(g.items)
      ? g.items.map(i => ({
          ...i,
          id: i.id, // item id
          name: i.name,
          price: i.price !== undefined ? i.price : i.extraPrice,
        }))
      : [],
  }))
);

    } catch (err) {
      console.error("❌ Failed to fetch extras groups:", err);
      setExtrasGroups([]);
    }
  };
  fetchExtrasGroups();
}, []);






  const handleProductUpdate = () => {
    fetchProducts();
    setShowModal(false);
    setSelectedProduct(null);
  };

  const handleEditClick = (product) => {
    setSelectedProduct(product);
    setShowModal(true);
  };

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

return (
  <div className="min-h-screen px-6 py-8 space-y-8">
    {/* PAGE HEADER */}
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">

      {/* All-in-1 action row */}
      <div className="flex flex-wrap gap-3 items-center justify-start">
        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            placeholder={t("Search by name...")}
            className="pl-9 pr-3 py-2 rounded-xl border shadow-sm focus:border-accent transition-all w-48 md:w-60"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <Filter className="absolute left-2 top-2 text-gray-400" size={18} />
        </div>
        {/* Category dropdown for delete */}
        <select
          className="border px-3 py-2 rounded-xl shadow-sm bg-white"
          value={selectedCategoryToDelete}
          onChange={e => setSelectedCategoryToDelete(e.target.value)}
        >
          <option value="">{t("-- Select Category to Delete --")}</option>
          <option value="ALL">🧨 {t("Delete ALL Products")}</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
          {/* Delete button */}
          <button
            onClick={async () => {
              if (
                window.confirm(
                  selectedCategoryToDelete === "ALL"
                    ? t("Are you sure you want to DELETE ALL PRODUCTS?")
                    : `${t("Delete all products from")}: \"${selectedCategoryToDelete}\" ${t("category")}?`
                )
              ) {
                try {
                  const url = selectedCategoryToDelete === "ALL"
                    ? PRODUCTS_API
                    : `${PRODUCTS_API}?category=${encodeURIComponent(selectedCategoryToDelete)}`;
                  const res = await fetch(url, { method: "DELETE" });
                  if (!res.ok) throw new Error("Delete failed");
                  alert(t("Deleted successfully"));
                  fetchProducts();
                } catch (err) {
                  alert(t("Delete failed. Check console."));
                }
              }
            }}
            className={`flex items-center gap-1 px-4 py-2 rounded-2xl shadow transition-all font-semibold
              ${selectedCategoryToDelete
                ? "bg-gradient-to-r from-red-500 to-rose-500 text-white hover:scale-[1.03]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"}
            `}
            disabled={!selectedCategoryToDelete}
          >
            <Trash2 size={18} /> {t("Delete")}
          </button>
          {/* Add Product */}
          <button
            onClick={() => {
              setSelectedProduct(null);
              setShowModal(true);
            }}
            className="flex items-center gap-1 px-5 py-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold shadow hover:scale-[1.05] transition-all"
          >
            <Plus size={20} /> {t("Add Product")}
          </button>

  {/* Manage Extras Group button */}
  <button
    onClick={() => setShowGroupModal(true)}
    className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-bold shadow hover:scale-[1.05] transition ml-2"
    style={{ minWidth: "max-content" }}
  >
    <Layers size={17} /> {t("Manage Extras Groups")}
  </button>
        </div>
      </div>

     {/* CATEGORY FILTER TAGS + MANAGE EXTRAS GROUP */}
<div className="flex flex-wrap gap-2 mb-6 items-center">
  {categories.map(cat => (
    <label
      key={cat}
      className={`px-4 py-1.5 rounded-xl cursor-pointer border font-medium shadow-sm transition
        ${selectedCategories.includes(cat)
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-blue-50"}
      `}
      onClick={() => handleCategoryToggle(cat)}
    >
      {cat}
    </label>
  ))}

</div>


      {/* PRODUCT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
        {filteredProducts.map((product, i) => (
          <div
            key={product.id}
            className={`
              group p-5 rounded-2xl shadow-xl bg-gradient-to-br ${cardGradients[i % cardGradients.length]}
              border border-white/30 dark:border-white/5
              hover:shadow-2xl hover:border-accent hover:scale-[1.03]
              transition-all duration-300 flex flex-col justify-between min-h-[180px] relative
            `}
            style={{
              boxShadow: "0 6px 24px -2px rgba(30,34,90,0.16), 0 1.5px 8px -0.5px rgba(88,99,255,0.04)"
            }}
          >
            <div>
              <div className="flex items-center gap-3 mb-1">
                {product.image && (
  <img
 src={
  product.image?.startsWith("http")
    ? product.image
    : `${API_URL}/uploads/${product.image}`
}

    alt=""
    className="w-12 h-12 rounded-xl object-cover border shadow"
  />
)}

                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{product.name}</h3>
                  <span className="block text-xs text-gray-500">{product.category}</span>
                </div>
              </div>
              <div className="text-2xl font-extrabold mt-2 text-indigo-600 dark:text-indigo-400 tracking-tight">
                ₺{product.price}
              </div>
              {product.tags && (
                <div className="mt-1 text-xs text-gray-500">{product.tags}</div>
              )}
            </div>
            <div className="flex items-center justify-between mt-4 gap-2">
              <button
                onClick={() => {
                  setSelectedProduct(product);
                  setShowModal(true);
                }}
                className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-gradient-to-r from-yellow-400 to-amber-400 text-white font-bold shadow hover:scale-105 transition"
              >
                <Edit3 size={17} /> {t("Edit")}
              </button>
              {/* Show allergens, visible, discount badges if set */}
              <div className="flex gap-2">
                {product.allergens && (
                  <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs">{t("Allergens")}</span>
                )}
                {product.visible === false && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-400 text-white text-xs">{t("Hidden")}</span>
                )}
                {product.discount_type && product.discount_type !== "none" && (
                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                    {product.discount_type === "percentage"
                      ? `-%${product.discount_value}`
                      : `₺${product.discount_value} off`}
                  </span>
                )}
              </div>
              {productCosts[product.id] !== undefined && (
  <div className="text-xs font-bold text-gray-500 mt-1">
    {t("Cost Price")}: <span className="text-rose-700">₺{productCosts[product.id].toFixed(2)}</span>
  </div>
)}

            </div>

          </div>

        ))}
        {/* Empty state */}
        {filteredProducts.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-16 text-lg">{t("No products found.")}</div>
        )}
      </div>

      {/* PRODUCT MODAL (modern, clean) */}
     {showModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl relative">
      <div className="flex justify-between items-center px-8 pt-8 pb-2">
        <h2 className="text-2xl font-bold">
          {selectedProduct ? t("Edit Product") : t("Add Product")}
        </h2>
        <button
          onClick={() => {
            setShowModal(false);
            setSelectedProduct(null);
          }}
          className="text-gray-500 text-2xl font-bold hover:text-accent transition"
        >
          ×
        </button>
      </div>
      {/* Scrollable form area */}
      <div className="px-8 pb-8 max-h-[75vh] overflow-y-auto">
        <ProductForm
          initialData={selectedProduct}
          onSuccess={handleProductUpdate}
        />
      </div>
    </div>
  </div>
)}


      {/* EXTRAS GROUP MODAL (keep as is, style optional) */}
      <Modal
        isOpen={showGroupModal}
        onRequestClose={() => setShowGroupModal(false)}
        contentLabel={t("Manage Extras Groups")}
        className="bg-white p-6 rounded-3xl shadow-2xl max-w-2xl mx-auto mt-34"
        overlayClassName="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center"
      >
        <h2 className="text-2xl font-bold mb-4">{t("Manage Extras Groups")}</h2>
        <div className="max-h-[60vh] overflow-y-auto pr-2">
          {(extrasGroups || []).map((group, groupIdx) => (
            <div key={groupIdx} className="mb-6 border rounded-2xl p-4 bg-gray-50 relative">
              <input
                type="text"
                placeholder={t("Enter Group Name")}
                value={group.groupName}
                onChange={(e) => {
                  const updatedGroups = [...extrasGroups];
                  updatedGroups[groupIdx].groupName = e.target.value;
                  setExtrasGroups(updatedGroups);
                }}
                className="w-full font-bold text-lg mb-3 p-2 border rounded-xl"
              />
              {(group.items || []).map((item, itemIdx) => (
                <div key={itemIdx} className="flex gap-2 mb-2">
                  <select
  value={item.name}
  onChange={(e) => {
    const updated = [...extrasGroups];
    updated[groupIdx].items[itemIdx].name = e.target.value;

    // ✅ Auto-fill unit if match is found
    const match = availableIngredients.find(ai => ai.name === e.target.value);
    if (match) {
      updated[groupIdx].items[itemIdx].unit = match.unit;
    }

    setExtrasGroups(updated);
  }}
  className="flex-1 p-2 border rounded-xl"
>
  <option value="">{t("Select Ingredient")}</option>
  {availableIngredients.map((ing, idx) => (
    <option key={idx} value={ing.name}>
      {ing.name} ({ing.unit})
    </option>
  ))}
</select>

                  <input
                    type={t("number")}
                    placeholder={t("₺ Price")}
                    value={item.price}
                    onChange={(e) => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items[itemIdx].price = e.target.value;
                      setExtrasGroups(updated);
                    }}
                    className="w-24 p-2 border rounded-xl"
                  />
         <button
  onClick={async () => {
    // Remove from backend if item has an id (already saved)
    const itemId = item.id;
    const groupId = group.id; // Make sure group.id exists!
    if (itemId && groupId) {
      try {
        await fetch(`${API_URL}/api/extras-groups/${groupId}/items/${itemId}`, {
          method: "DELETE",
        });
      } catch (err) {
        alert("❌ Failed to delete from server!");
        // Optionally: return early here
      }
    }
    // Remove from local state
    const updated = [...extrasGroups];
    updated[groupIdx].items = updated[groupIdx].items.filter((_, i) => i !== itemIdx);
    setExtrasGroups(updated);
  }}
  className="bg-red-500 text-white px-3 rounded-xl"
>
  x
</button>

                </div>
              ))}
              <div className="my-4" />
              <button
                onClick={() => {
                  const updated = [...extrasGroups];
                  if (!Array.isArray(updated[groupIdx].items)) {
                    updated[groupIdx].items = [];
                  }
                  updated[groupIdx].items.push({ name: "", price: "" });
                  setExtrasGroups(updated);
                }}
                className="text-sm text-blue-600"
              >
                {t("Add Extra to this group")}
              </button>
              {/* Delete group */}
              <button
               onClick={async () => {
  const groupId = group.id;
  if (groupId) {
    try {
      await fetch(`${API_URL}/api/extras-groups/${groupId}`, { method: "DELETE" });
    } catch (err) {
      alert("❌ Failed to delete group from server!");
      return;
    }
  }
  const updated = extrasGroups.filter((_, i) => i !== groupIdx);
  setExtrasGroups(updated);
}}

                className="text-red-600 text-sm font-bold flex items-center gap-1 mt-2"
              >
                🗑 {t("Delete Group")}
              </button>
            </div>
          ))}
        </div>
        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => {
              setExtrasGroups((prev) => [...prev, { groupName: "", items: [{ name: "", price: "" }] }]);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded-xl"
          >
            {t("Add Group")}
          </button>
          <button
           onClick={async () => {
  try {
    await Promise.all(
      extrasGroups.map(async (group) => {
        const cleaned = {
          group_name: (group.groupName || "").trim(),
          items: (group.items || []).filter((i) => (i.name || "").trim() !== "").map(i => ({
            name: i.name,
            price: Number(i.price) || 0
          })),
        };
        if (!cleaned.group_name || cleaned.items.length === 0) return;
        await fetch(EXTRAS_GROUPS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cleaned),
        });
      })
    );
    alert("✅ Groups saved!");
    setShowGroupModal(false);
  } catch (err) {
    alert("Failed to save one or more groups.");
  }
}}



            className="bg-green-600 text-white px-4 py-2 rounded-xl"
          >
            💾 {t("Save All")}
          </button>
          <button
            onClick={() => setShowGroupModal(false)}
            className="bg-gray-500 text-white px-4 py-2 rounded-xl"
          >
            ❌ {t("Cancel")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
