import React, { useEffect, useState } from "react";
import ProductForm from "../components/ProductForm"; // Import ProductForm
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Filter, Edit3, Layers } from "lucide-react";
import secureFetch from "../utils/secureFetch";

const API_URL =
  import.meta.env.VITE_API_URL || "https://hurrypos-backend.onrender.com";

/**
 * Gradient colors for product cards (rotating)
 */
const cardGradients = [
  "from-blue-200 to-indigo-200",
  "from-green-200 to-teal-100",
  "from-yellow-200 to-orange-100",
  "from-pink-100 to-fuchsia-200",
  "from-lime-200 to-green-200",
  "from-purple-200 to-violet-100",
];

export default function Products() {
  const { t } = useTranslation();

  // ---------- State ----------
  const [products, setProducts] = useState([]);
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [productCostsById, setProductCostsById] = useState({}); // { [id]: costNumber }
  const [extrasGroups, setExtrasGroups] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [showGroupModal, setShowGroupModal] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedCategoryToDelete, setSelectedCategoryToDelete] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categories, setCategories] = useState([]);

  const collectCategories = (list) =>
    Array.from(
      new Set(
        (Array.isArray(list) ? list : [])
          .map((item) => item?.category)
          .filter(Boolean)
      )
    );

  const deriveCategoriesFromProducts = () => collectCategories(products);

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      selectedCategories.length === 0 ||
      selectedCategories.includes(product.category);
    const matchesSearch = (product.name || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });
 
// 🔑 Track tenant id from localStorage
const [tenantId, setTenantId] = useState(localStorage.getItem("restaurant_id"));

// Ingredients (tenant-protected)
useEffect(() => {
  if (!tenantId) {
    setAvailableIngredients([]);
    return;
  }

  secureFetch("/suppliers/ingredients")
    .then((data) => {
      console.log("🔎 Ingredients for tenant", tenantId, data);
      setAvailableIngredients(Array.isArray(data) ? data : []);
    })
    .catch(() => setAvailableIngredients([]));
}, [tenantId]);


  // Products (tenant-protected)
const fetchProducts = async () => {
  try {
    const data = await secureFetch("/products");

    let normalizedProducts = [];

    // 🧠 Normalize backend responses
    if (Array.isArray(data)) {
      // ✅ Backend already returns an array
      normalizedProducts = data;
    } else if (data && Array.isArray(data.products)) {
      // ✅ Some endpoints return { products: [...] }
      normalizedProducts = data.products;
    } else if (data && data.product) {
      // ✅ Single product object (e.g. after add/update)
      normalizedProducts = [data.product];
    } else {
      console.warn("⚠️ Unexpected products response:", data);
      normalizedProducts = [];
    }

    setProducts(normalizedProducts);
    const derivedFromResponse = collectCategories(normalizedProducts);
    setCategories((prev) =>
      Array.from(new Set([...(prev || []), ...derivedFromResponse])).filter(Boolean)
    );
  } catch (err) {
    console.error("❌ Failed to fetch products:", err);
    setProducts([]);
  }
};

useEffect(() => {
  fetchProducts();
}, []);

const fetchCategories = async () => {
  try {
    const data = await secureFetch("/products/categories");
    const list = Array.isArray(data) ? data : [];
    setCategories(Array.from(new Set([...list, ...deriveCategoriesFromProducts()])).filter(Boolean));
  } catch (err) {
    console.error("❌ Failed to fetch categories:", err);
    setCategories(deriveCategoriesFromProducts());
  }
};

useEffect(() => {
  fetchCategories();
}, []);


  // Costs (tenant-protected) — stores as map by id for easy lookups
useEffect(() => {
  secureFetch("/products/costs")
    .then((data) => {
      if (!Array.isArray(data)) {
        setProductCostsById({});
        return;
      }
      const map = {};
      for (const row of data) {
        const rawCost =
          row.ingredient_cost ?? row.cost ?? 0;
        const costNum = parseFloat(rawCost) || 0;
        map[row.id] = costNum;
      }
      setProductCostsById(map);
    })
    .catch(() => setProductCostsById({}));
}, [products]);


  // Extras Groups (tenant-protected) under /api/products/extras-group
  const fetchExtrasGroups = async () => {
    try {
      const data = await secureFetch("/products/extras-group");
      const safeGroups = (Array.isArray(data) ? data : []).map((g) => ({
        id: g.id,
        groupName: g.name || g.group_name || g.groupName,
        required: !!g.required,
        max_selection: g.max_selection ?? 1,
        items: Array.isArray(g.items)
          ? g.items.map((i) => ({
              id: i.id,
              name: i.name,
              price: Number(i.price ?? 0),
              amount: Number(i.amount ?? 1),
              unit: i.unit || "",
            }))
          : [],
      }));
      setExtrasGroups(safeGroups);
    } catch (err) {
      console.error("❌ Failed to fetch extras groups:", err);
      setExtrasGroups([]);
    }
  };

  useEffect(() => {
    fetchExtrasGroups();
  }, []);



  // ---------- Handlers ----------
  const handleCategoryToggle = (category) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setNewCategoryName("");
  };

  const handleCategoryDelete = async () => {
    if (!selectedCategoryToDelete) return;

    const confirmMsg =
      selectedCategoryToDelete === "ALL"
        ? t("Are you sure you want to DELETE ALL PRODUCTS?")
        : `${t("Delete all products from")}: "${selectedCategoryToDelete}" ${t(
            "category"
          )}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const url =
        selectedCategoryToDelete === "ALL"
          ? "/products" // bulk delete all (tenant-safe backend route)
          : `/products?category=${encodeURIComponent(selectedCategoryToDelete)}`;

      await secureFetch(url, { method: "DELETE" });
      alert(t("Deleted successfully"));
      fetchProducts();
    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert(t("Delete failed. Check console."));
    }
  };

  const handleProductUpdate = () => {
    fetchProducts();
    fetchCategories();
    setShowModal(false);
    setSelectedProduct(null);
  };

  const handleAddCategory = async (event) => {
    event.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      await secureFetch("/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: trimmed }),
      });
      fetchCategories();
      closeCategoryModal();
    } catch (err) {
      console.error("❌ Failed to add category:", err);
      alert(t("Failed to add category"));
    }
  };

  // ---------- Render ----------
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
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Filter className="absolute left-2 top-2 text-gray-400" size={18} />
          </div>

          {/* Category dropdown for delete */}
          <select
            className="border px-3 py-2 rounded-xl shadow-sm bg-white"
            value={selectedCategoryToDelete}
            onChange={(e) => setSelectedCategoryToDelete(e.target.value)}
          >
            <option value="">{t("-- Select Category to Delete --")}</option>
            <option value="ALL">🧨 {t("Delete ALL Products")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Delete button */}
          <button
            onClick={handleCategoryDelete}
            className={`flex items-center gap-1 px-4 py-2 rounded-2xl shadow transition-all font-semibold ${
              selectedCategoryToDelete
                ? "bg-gradient-to-r from-red-500 to-rose-500 text-white hover:scale-[1.03]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
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

        <button
          onClick={() => setShowCategoryModal(true)}
          className="flex items-center gap-1 px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow hover:scale-[1.05] transition-all"
        >
          <Plus size={18} /> {t("Add Category")}
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

      {/* CATEGORY FILTER TAGS */}
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        {categories.map((cat) => (
          <label
            key={cat}
            className={`px-4 py-1.5 rounded-xl cursor-pointer border font-medium shadow-sm transition ${
              selectedCategories.includes(cat)
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-blue-50"
            }`}
            onClick={() => handleCategoryToggle(cat)}
          >
            {cat}
          </label>
        ))}
      </div>

      {/* PRODUCT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product, i) => (
            <div
              key={product.id}
              className={`group p-5 rounded-2xl shadow-xl bg-gradient-to-br ${
                cardGradients[i % cardGradients.length]
              } border border-white/30 dark:border-white/5 hover:shadow-2xl hover:border-accent hover:scale-[1.03] transition-all duration-300 flex flex-col justify-between min-h-[180px] relative`}
              style={{
                boxShadow:
                  "0 6px 24px -2px rgba(30,34,90,0.16), 0 1.5px 8px -0.5px rgba(88,99,255,0.04)",
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
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {product.name}
                    </h3>
                    <span className="block text-xs text-gray-500">
                      {product.category}
                    </span>
                  </div>
                </div>

                <div className="text-2xl font-extrabold mt-2 text-indigo-600 dark:text-indigo-400 tracking-tight">
                  ₺{product.price}
                </div>

                {product.tags && (
                  <div className="mt-1 text-xs text-gray-500">
                    {product.tags}
                  </div>
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

                {/* BADGES */}
                <div className="flex gap-2">
                  {product.allergens && (
                    <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs">
                      {t("Allergens")}
                    </span>
                  )}
                  {product.visible === false && (
                    <span className="px-2 py-0.5 rounded-full bg-gray-400 text-white text-xs">
                      {t("Hidden")}
                    </span>
                  )}
                  {product.discount_type && product.discount_type !== "none" && (
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                      {product.discount_type === "percentage"
                        ? `-%${product.discount_value}`
                        : `₺${product.discount_value} off`}
                    </span>
                  )}
                </div>
              </div>

              {/* Cost (if available) */}
{productCostsById[product.id] !== undefined && (() => {
  const cost = Number(productCostsById[product.id]) || 0;
  const price = Number(product.price) || 0;
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  const isLoss = profit < 0;
  const marginColor = isLoss
    ? "bg-red-500"
    : margin > 40
    ? "bg-green-500"
    : margin > 20
    ? "bg-yellow-400"
    : "bg-orange-400";

  const profitLabel = isLoss ? "Loss" : "Profit";

  return (
    <div className="mt-2 text-xs font-semibold space-y-1">
      <div className="text-gray-500">
        {t("Cost Price")}:{" "}
        <span className="text-rose-700">₺{cost.toFixed(2)}</span>
      </div>
      <div className="text-gray-500">
        {t(profitLabel)}:{" "}
        <span className={isLoss ? "text-red-600" : "text-blue-700"}>
          {isLoss ? "-₺" : "₺"}
          {Math.abs(profit).toFixed(2)}
        </span>
      </div>
      <div className="text-gray-500 flex items-center gap-2">
        {t("Margin")}:{" "}
        <span
          className={
            isLoss
              ? "text-red-600"
              : margin > 40
              ? "text-green-600"
              : margin > 20
              ? "text-yellow-600"
              : "text-orange-600"
          }
        >
          {margin.toFixed(1)}%
        </span>
      </div>

      {/* --- margin bar --- */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
        <div
          className={`${marginColor} h-2 rounded-full transition-all duration-300`}
          style={{
            width:
              margin <= 0
                ? "5%"
                : margin >= 100
                ? "100%"
                : `${Math.min(margin, 100)}%`,
          }}
        ></div>
      </div>
    </div>
  );
})()}


            </div>
          ))
        ) : (
          <div className="col-span-full text-center text-gray-500 py-16 text-lg">
            {t("No products found.")}
          </div>
        )}
      </div>

      {/* PRODUCT MODAL */}
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
                categories={categories}
              />
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative">
            <div className="flex justify-between items-center px-6 pt-6 pb-2">
              <h2 className="text-xl font-bold">{t("Add Category")}</h2>
              <button
                onClick={closeCategoryModal}
                className="text-gray-500 text-2xl font-bold hover:text-accent transition"
                aria-label={t("Close")}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="px-6 pb-6 space-y-4">
              <label className="block">
                <span className="font-medium">{t("Category Name")}</span>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full p-3 mt-1 rounded-xl border"
                  placeholder={t("e.g. Burgers")}
                  autoFocus
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeCategoryModal}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!newCategoryName.trim()}
                  className={`flex items-center gap-2 px-5 py-2 rounded-xl text-white font-semibold transition ${
                    newCategoryName.trim()
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:scale-[1.02]"
                      : "bg-gray-300 cursor-not-allowed"
                  }`}
                >
                  <Plus size={18} />
                  {t("Save Category")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXTRAS GROUP MODAL */}
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
              {/* Group name */}
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

              {/* Group items */}
              {(group.items || []).map((item, itemIdx) => (
                <div key={itemIdx} className="flex gap-2 mb-2">
                  {/* Ingredient Dropdown */}
                  <select
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items[itemIdx].name = e.target.value;

                      // Auto-fill unit if match found
                      const match = availableIngredients.find(
                        (ai) => ai.name === e.target.value
                      );
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

                  {/* Price */}
                  <input
                    type="number"
                    placeholder={t("₺ Price")}
                    value={item.price}
                    onChange={(e) => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items[itemIdx].price = e.target.value;
                      setExtrasGroups(updated);
                    }}
                    className="w-20 p-2 border rounded-xl"
                  />

                  {/* Amount */}
                  <input
                    type="text"
                    placeholder={t("Amount")}
                    value={item.amount || ""}
                    onChange={(e) => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items[itemIdx].amount = e.target.value;
                      setExtrasGroups(updated);
                    }}
                    className="w-20 p-2 border rounded-xl"
                  />

                  {/* Unit */}
                  <select
                    value={item.unit || ""}
                    onChange={(e) => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items[itemIdx].unit = e.target.value;
                      setExtrasGroups(updated);
                    }}
                    className="w-24 p-2 border rounded-xl"
                  >
                    <option value="">{t("Select Unit")}</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="piece">piece</option>
                    <option value="portion">portion</option>
                    <option value="ml">ml</option>
                    <option value="l">l</option>
                  </select>

                  {/* Delete item (local only; persisted on Save All) */}
                  <button
                    onClick={() => {
                      const updated = [...extrasGroups];
                      updated[groupIdx].items = updated[groupIdx].items.filter(
                        (_, i) => i !== itemIdx
                      );
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
                  updated[groupIdx].items.push({
                    name: "",
                    price: "",
                    amount: "",
                    unit: "",
                  });
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
                      await secureFetch(`/products/extras-group/${groupId}`, {
                        method: "DELETE",
                      });
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
              setExtrasGroups((prev) => [
                ...prev,
                {
                  groupName: "",
                  items: [{ name: "", price: "", amount: "", unit: "" }],
                },
              ]);
            }}
            className="bg-blue-500 text-white px-4 py-2 rounded-xl"
          >
            {t("Add Group")}
          </button>

          <button
            onClick={async () => {
              try {
                await Promise.all(
                  (extrasGroups || []).map(async (group) => {
                    const payload = {
                      name: (group.groupName || "").trim(),
                      items: (group.items || [])
                        .filter((i) => (i.name || "").trim() !== "")
                        .map((i) => ({
                          name: i.name,
                          price: Number(i.price) || 0,
                          amount:
                            i.amount !== undefined &&
                            i.amount !== null &&
                            i.amount !== ""
                              ? Number(i.amount)
                              : 1,
                          unit: i.unit || "",
                        })),
                    };

                    if (!payload.name || payload.items.length === 0) return;


                    if (group.id) {
                      // Update existing group
                      await secureFetch(`/products/extras-group/${group.id}`, {
                        method: "PUT",
                        body: JSON.stringify({
                          name: payload.name,
                          required: group.required || false,
                          max_selection: group.max_selection || 1,
                          items: payload.items,
                        }),
                      });
                    } else {
                      // Create new group
                      await secureFetch(`/products/extras-group`, {
                        method: "POST",
                        body: JSON.stringify({
                          name: payload.name,
                          required: false,
                          max_selection: 1,
                          items: payload.items,
                        }),
                      });
                    }
                  })
                );

                alert("✅ Groups saved!");
                setShowGroupModal(false);
                fetchExtrasGroups();
              } catch (err) {
                console.error("❌ Failed to save groups:", err);
                alert("❌ Failed to save one or more groups.");
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
