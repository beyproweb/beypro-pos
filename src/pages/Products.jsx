import React, { useEffect, useState } from "react";
import ProductForm from "../components/ProductForm"; // Import ProductForm
import Modal from "react-modal";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Filter, Edit3, Layers } from "lucide-react";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import ModernHeader from "../components/ModernHeader";
import { useOutletContext } from "react-router-dom";
import socket from "../utils/socket";

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[^\d,.\-]+/g, "").replace(/\s+/g, "");
  if (!cleaned) return 0;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let normalized = cleaned;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalized = cleaned.replace(/,/g, ".");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};

const normalizeUnit = (u) => {
  if (!u) return "";
  const v = String(u).toLowerCase();
  if (v === "lt") return "l";
  if (v === "piece" || v === "pieces" || v === "pcs") return "pcs";
  if (v === "portion" || v === "portions") return "portion";
  return v;
};

const convertPrice = (basePrice, supplierUnit, targetUnit) => {
  if (!basePrice || !supplierUnit || !targetUnit) return null;
  const from = normalizeUnit(supplierUnit);
  const to = normalizeUnit(targetUnit);
  if (!from || !to) return null;
  if (from === to) return basePrice;
  if (from === "kg" && to === "g") return basePrice / 1000;
  if (from === "g" && to === "kg") return basePrice * 1000;
  if (from === "l" && to === "ml") return basePrice / 1000;
  if (from === "ml" && to === "l") return basePrice * 1000;
  return null;
};

const parseJsonDeep = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  try {
    let parsed = JSON.parse(raw);
    for (let i = 0; i < 2 && typeof parsed === "string"; i++) {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch {
    return fallback;
  }
};

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
  const { formatCurrency, config } = useCurrency();
  const outletContext = useOutletContext();
  const shouldRenderStandaloneHeader =
    !outletContext ||
    typeof outletContext !== "object" ||
    !("isSidebarOpen" in outletContext);

  // ---------- State ----------
  const [products, setProducts] = useState([]);
  const [availableIngredients, setAvailableIngredients] = useState([]);
  const [productCostsById, setProductCostsById] = useState({}); // { [id]: costNumber }
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [stockByName, setStockByName] = useState({}); // { [lowerName]: { [unit]: { quantity, unit, critical_quantity, price_per_unit } } }

  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryEdits, setCategoryEdits] = useState([]);
  const [categoryAction, setCategoryAction] = useState({ name: null, type: null });

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

  const normalizeStockList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.stock)) return payload.stock;
    if (Array.isArray(payload?.stocks)) return payload.stocks;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const loadIngredients = async () => {
    try {
      let list = [];
      try {
        const prices = await secureFetch("/ingredient-prices");
        if (Array.isArray(prices)) list = prices;
      } catch {}

      try {
        const supplierIngs = await secureFetch("/suppliers/ingredients");
        if (Array.isArray(supplierIngs)) list = [...list, ...supplierIngs];
      } catch {}

      const base = (Array.isArray(list) ? list : [])
        .map((row) => ({
          name: String(row?.name || row?.ingredient || "").trim(),
          unit: String(row?.unit || "").trim(),
          price_per_unit: toNumber(
            row?.price_per_unit ??
              row?.unit_price ??
              row?.purchase_price ??
              row?.cost_per_unit ??
              row?.costPrice ??
              row?.price ??
              0
          ),
        }))
        .filter((r) => r.name);

      const mergedMap = new Map(); // lowerName -> row
      for (const r of base) {
        const lower = r.name.toLowerCase();
        if (!mergedMap.has(lower)) {
          mergedMap.set(lower, { ...r });
        } else {
          const existing = mergedMap.get(lower);
          if (!existing.unit && r.unit) existing.unit = r.unit;
          if (!(existing.price_per_unit > 0) && r.price_per_unit > 0) {
            existing.price_per_unit = r.price_per_unit;
          }
        }
      }
      let merged = Array.from(mergedMap.values());

      const missing = merged.some((r) => !(toNumber(r.price_per_unit) > 0));
      const stockSupplierMap = new Map(); // name|unit or name| -> supplier_id
      if (missing) {
        try {
          const stockRaw = await secureFetch("/stock");
          const stock = normalizeStockList(stockRaw);
          const stockPriceMap = new Map(); // name|unit -> price
          const stockPriceMapNameOnly = new Map(); // name -> price

          for (const s of stock) {
            const nameKey = String(s?.name || "").trim().toLowerCase();
            const unitKey = normalizeUnit(s?.unit);
            const key = `${nameKey}|${unitKey}`;
            const keyNoUnit = `${nameKey}|`;

            const rawPrice =
              s?.price_per_unit ??
              s?.unit_price ??
              s?.purchase_price ??
              s?.cost_per_unit ??
              s?.costPrice ??
              s?.price ??
              0;
            let price = toNumber(rawPrice);
            if (!(price > 0)) {
              const total = toNumber(s?.total_value ?? s?.value ?? s?.amount);
              const qty = toNumber(s?.quantity);
              if (qty > 0 && total > 0) price = total / qty;
            }

            if (price > 0 && !stockPriceMap.has(key)) stockPriceMap.set(key, price);
            if (price > 0 && !stockPriceMapNameOnly.has(nameKey)) {
              stockPriceMapNameOnly.set(nameKey, price);
            }

            if (s?.supplier_id) {
              stockSupplierMap.set(key, s.supplier_id);
              stockSupplierMap.set(keyNoUnit, s.supplier_id);
            }
          }

          merged = merged.map((r) => {
            if (toNumber(r.price_per_unit) > 0) return r;
            const nameKey = String(r.name || "").trim().toLowerCase();
            const unitKey = normalizeUnit(r.unit);
            const key = `${nameKey}|${unitKey}`;
            const stockPrice = stockPriceMap.get(key) ?? stockPriceMapNameOnly.get(nameKey) ?? 0;
            if (stockPrice > 0) return { ...r, price_per_unit: stockPrice };
            return r;
          });
        } catch {}
      }

      const stillMissing = merged.filter((r) => !(toNumber(r.price_per_unit) > 0));
      if (stillMissing.length > 0 && stockSupplierMap.size > 0) {
        const supplierIds = Array.from(
          new Set(
            stillMissing
              .map((r) => {
                const nameKey = String(r.name || "").trim().toLowerCase();
                const unitKey = normalizeUnit(r.unit);
                return (
                  stockSupplierMap.get(`${nameKey}|${unitKey}`) ||
                  stockSupplierMap.get(`${nameKey}|`)
                );
              })
              .filter(Boolean)
          )
        );

        const txnPriceMap = new Map(); // name|unit -> {price,time}
        for (const sid of supplierIds) {
          try {
            const txRaw = await secureFetch(`/suppliers/${sid}/transactions`);
            const txns = Array.isArray(txRaw?.transactions)
              ? txRaw.transactions
              : Array.isArray(txRaw)
                ? txRaw
                : [];

            txns.forEach((txn) => {
              const time = new Date(
                txn?.delivery_date ||
                  txn?.created_at ||
                  txn?.updated_at ||
                  txn?.date ||
                  txn?.timestamp ||
                  0
              ).getTime();

              const rows = Array.isArray(txn.items) && txn.items.length > 0 ? txn.items : [txn];
              rows.forEach((row) => {
                const name = row?.ingredient || row?.name || row?.product_name;
                const unit = normalizeUnit(row?.unit);
                if (!name || !unit) return;
                const nameKey = String(name).trim().toLowerCase();
                const key = `${nameKey}|${unit}`;
                if (nameKey === "payment" || nameKey === "compiled receipt") return;

                const total = toNumber(row?.total_cost ?? row?.totalCost ?? row?.amount);
                const qty = toNumber(row?.quantity);
                let price = toNumber(row?.price_per_unit ?? row?.unit_price ?? row?.price ?? 0);
                if (!(price > 0) && qty > 0 && total > 0) price = total / qty;
                if (!(price > 0)) return;

                const existing = txnPriceMap.get(key);
                if (!existing || time > existing.time) {
                  txnPriceMap.set(key, { price, time });
                }
              });
            });
          } catch {}
        }

        if (txnPriceMap.size > 0) {
          merged = merged.map((r) => {
            if (toNumber(r.price_per_unit) > 0) return r;
            const nameKey = String(r.name || "").trim().toLowerCase();
            const unitKey = normalizeUnit(r.unit);
            const key = `${nameKey}|${unitKey}`;
            const hit = txnPriceMap.get(key);
            if (hit?.price > 0) return { ...r, price_per_unit: hit.price };
            return r;
          });
        }
      }

      // Include production recipes as "ingredients" so products can use produced items.
      try {
        const recipeEndpoint = tenantId
          ? `/production/recipes?restaurant_id=${tenantId}`
          : "/production/recipes";
        const recipesRaw = await secureFetch(recipeEndpoint);
        const recipes = Array.isArray(recipesRaw)
          ? recipesRaw
          : Array.isArray(recipesRaw?.data)
            ? recipesRaw.data
            : Array.isArray(recipesRaw?.items)
              ? recipesRaw.items
              : [];

        if (recipes.length > 0) {
          const ingredientByName = new Map(
            merged.map((r) => [String(r?.name || "").trim().toLowerCase(), r])
          );

          const resolveUnitPrice = (ingredientName, targetUnitRaw) => {
            const nameKey = String(ingredientName || "").trim().toLowerCase();
            if (!nameKey) return 0;
            const targetUnit = normalizeUnit(targetUnitRaw);
            const row = ingredientByName.get(nameKey);
            if (!row) return 0;
            const basePrice = toNumber(row?.price_per_unit ?? 0);
            if (!(basePrice > 0)) return 0;
            const fromUnit = normalizeUnit(row?.unit);
            const converted = convertPrice(basePrice, fromUnit, targetUnit);
            if (converted !== null && converted > 0) return converted;
            if (!fromUnit || fromUnit === targetUnit) return basePrice;
            return 0;
          };

          for (const recipe of recipes) {
            const recipeName = String(recipe?.name || "").trim();
            const recipeKey = recipeName.toLowerCase();
            if (!recipeName) continue;
            const outputUnit = normalizeUnit(recipe?.output_unit ?? recipe?.outputUnit);
            const baseQty = toNumber(recipe?.base_quantity ?? recipe?.baseQuantity ?? 0);
            if (!outputUnit || !(baseQty > 0)) continue;

            const ings = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
            const totalCost = ings.reduce((sum, ing) => {
              const ingName = ing?.name ?? ing?.ingredient_name ?? ing?.ingredientName;
              const ingUnit = ing?.unit;
              const amt = toNumber(
                ing?.amountPerBatch ??
                  ing?.amount_per_batch ??
                  ing?.amount ??
                  ing?.qty ??
                  ing?.quantity ??
                  0
              );
              if (!ingName || !ingUnit || !(amt > 0)) return sum;
              const ppu = resolveUnitPrice(ingName, ingUnit);
              if (!(ppu > 0)) return sum;
              return sum + amt * ppu;
            }, 0);

            const perUnit = totalCost / baseQty;
            if (!(perUnit > 0)) continue;

            const existing = ingredientByName.get(recipeKey);
            if (!existing) {
              const row = { name: recipeName, unit: outputUnit, price_per_unit: perUnit };
              merged.push(row);
              ingredientByName.set(recipeKey, row);
            } else {
              if (!existing.unit && outputUnit) existing.unit = outputUnit;
              if (!(toNumber(existing.price_per_unit) > 0)) existing.price_per_unit = perUnit;
            }
          }
        }
      } catch {}

      if (import.meta.env.DEV) {
        console.log("🔎 Ingredients for tenant", tenantId, merged);
      }
      setAvailableIngredients(merged);
    } catch (err) {
      console.error("❌ Failed to load ingredients:", err);
      setAvailableIngredients([]);
    }
  };

  loadIngredients();
  const onIngredientPricesUpdated = () => loadIngredients();
  socket.on("ingredient-prices-updated", onIngredientPricesUpdated);
  return () => socket.off("ingredient-prices-updated", onIngredientPricesUpdated);
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

const fetchStock = async () => {
  const normalizeStockList = (payload) => {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.stock)) return payload.stock;
    if (Array.isArray(payload?.stocks)) return payload.stocks;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  try {
    const raw = await secureFetch("/stock");
    const list = normalizeStockList(raw);
    const next = {};

    for (const row of Array.isArray(list) ? list : []) {
      const nameKey = String(row?.name || "").trim().toLowerCase();
      if (!nameKey) continue;
      const unitKey = normalizeUnit(row?.unit);
      if (!unitKey) continue;

      if (!next[nameKey]) next[nameKey] = {};
      const existing = next[nameKey][unitKey] || {
        unit: unitKey,
        quantity: 0,
        critical_quantity: 0,
        price_per_unit: 0,
      };

      existing.quantity += toNumber(row?.quantity);
      existing.critical_quantity = Math.max(
        toNumber(existing.critical_quantity),
        toNumber(row?.critical_quantity)
      );
      // keep the latest non-zero price_per_unit we see
      const rawPrice =
        row?.price_per_unit ??
        row?.unit_price ??
        row?.purchase_price ??
        row?.cost_per_unit ??
        row?.costPrice ??
        row?.price ??
        0;
      let ppu = toNumber(rawPrice);
      if (!(ppu > 0)) {
        const total = toNumber(row?.total_value ?? row?.value ?? row?.amount);
        const qty = toNumber(row?.quantity);
        if (qty > 0 && total > 0) ppu = total / qty;
      }
      if (ppu > 0) existing.price_per_unit = ppu;
      next[nameKey][unitKey] = existing;
    }

    setStockByName(next);
  } catch (err) {
    console.error("❌ Failed to fetch stock:", err);
    setStockByName({});
  }
};

useEffect(() => {
  fetchStock();
  const onStockUpdated = () => fetchStock();
  socket.on("stock-updated", onStockUpdated);
  return () => socket.off("stock-updated", onStockUpdated);
}, []);

const getStockMetaForProduct = (product) => {
  const nameKey = String(product?.name || "").trim().toLowerCase();
  if (!nameKey) return null;
  const byUnit = stockByName?.[nameKey];
  if (!byUnit || typeof byUnit !== "object") return null;
  const candidates = Object.values(byUnit).filter(Boolean);
  if (candidates.length === 0) return null;

  const preferred =
    candidates.find((c) => normalizeUnit(c?.unit) === "pcs") || candidates[0];
  const qty = toNumber(preferred?.quantity);
  const critical = toNumber(preferred?.critical_quantity);
  const isLow = critical > 0 && qty <= critical;

  return {
    quantity: qty,
    unit: preferred?.unit || "",
    critical_quantity: critical,
    isLow,
  };
};

const getStockUnitPrice = (name, unit) => {
  const nameKey = String(name || "").trim().toLowerCase();
  if (!nameKey) return 0;
  const unitKey = normalizeUnit(unit);
  const byUnit = stockByName?.[nameKey];
  if (!byUnit) return 0;
  const exact = byUnit?.[unitKey]?.price_per_unit;
  if (toNumber(exact) > 0) return toNumber(exact);
  const any = Object.values(byUnit).find((v) => toNumber(v?.price_per_unit) > 0);
  return toNumber(any?.price_per_unit);
};

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

  const computeFallbackCost = (product) => {
    const rawIngredients = product?.ingredients;
    const parsedIngredients = parseJsonDeep(rawIngredients, rawIngredients);
    const ingredients = Array.isArray(parsedIngredients) ? parsedIngredients : [];
    if (!Array.isArray(ingredients)) return 0;
    let total = 0;
    for (const ing of ingredients) {
      const name = String(ing?.ingredient || ing?.name || "").trim().toLowerCase();
      const qty = toNumber(ing?.quantity);
      const unit = normalizeUnit(ing?.unit);
      if (!name || !unit || !(qty > 0)) continue;
      const match = availableIngredients.find(
        (ai) => String(ai?.name || "").trim().toLowerCase() === name
      );
      let basePrice = 0;
      let fromUnit = unit;
      if (match) {
        basePrice = toNumber(
          match.price_per_unit ??
            match.unit_price ??
            match.purchase_price ??
            match.cost_per_unit ??
            match.costPrice ??
            match.price ??
            0
        );
        fromUnit = match.unit || unit;
      }

      // extra fallback: use price_per_unit directly from stock (useful for items selected "from stock")
      if (!(basePrice > 0)) {
        basePrice = getStockUnitPrice(name, unit);
        fromUnit = unit;
      }

      if (!(basePrice > 0)) continue;

      const converted = convertPrice(basePrice, fromUnit, unit);
      const perUnit = converted !== null ? converted : basePrice;
      if (perUnit > 0) {
        total += qty * perUnit;
      }
    }
    return total;
  };


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

  useEffect(() => {
    if (showCategoryModal) {
      const normalized = [...(categories || [])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map((name) => ({
          original: name,
          value: name,
        }));
      setCategoryEdits(normalized);
    } else {
      setCategoryEdits([]);
      setCategoryAction({ name: null, type: null });
    }
  }, [showCategoryModal, categories]);

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
    setCategoryEdits([]);
    setCategoryAction({ name: null, type: null });
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

  const isCategoryBusy = (name, type) =>
    categoryAction.name === name && (type ? categoryAction.type === type : true);

  const updateCategoryDraft = (original, value) => {
    setCategoryEdits((prev) =>
      prev.map((cat) =>
        cat.original === original ? { ...cat, value } : cat
      )
    );
  };

const handleRenameCategory = async (original, value) => {
  const trimmedOldName = (original || "").trim();
  const trimmedNewName = (value || "").trim();

  if (!trimmedOldName || !trimmedNewName || trimmedOldName === trimmedNewName) {
    return;
  }

  setCategoryAction({ name: original, type: "rename" });

  try {
    await secureFetch("/products/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName: trimmedOldName, newName: trimmedNewName }),
    });

    setCategoryEdits((prev) =>
      prev.map((cat) =>
        cat.original === original
          ? { original: trimmedNewName, value: trimmedNewName }
          : cat
      )
    );

    await fetchCategories();
    await fetchProducts();
  } catch (err) {
    console.error("❌ Failed to rename category:", err);
    alert("Failed to rename category — check console.");
  } finally {
    setCategoryAction({ name: null, type: null });
  }
};


  const handleDeleteCategoryEntry = async (name) => {
    if (!name) return;
    const confirmDelete = window.confirm(
      t(
        "Deleting this category will remove it from all products (they will appear without a category). Continue?"
      )
    );
    if (!confirmDelete) return;

    setCategoryAction({ name, type: "delete" });
    try {
      await secureFetch("/products/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: name }),
      });

      setCategoryEdits((prev) => prev.filter((cat) => cat.original !== name));
      await fetchCategories();
      await fetchProducts();
    } catch (err) {
      console.error("❌ Failed to delete category:", err);
      alert(t("Failed to delete category"));
    } finally {
      setCategoryAction({ name: null, type: null });
    }
  };

  // ---------- Render ----------
  return (
    <>
      {shouldRenderStandaloneHeader && <ModernHeader title={t("Products")} />}
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

        <button
          onClick={() => setShowCategoryModal(true)}
          className="flex items-center gap-1 px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow hover:scale-[1.05] transition-all"
        >
          <Plus size={18} /> {t("Add Category")}
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
          filteredProducts.map((product, i) => {
            const stockMeta = getStockMetaForProduct(product);
            return (
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
                {stockMeta && (
                  <div className="absolute top-4 right-4 flex flex-col items-end gap-1 z-10">
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-extrabold shadow-md border backdrop-blur ${
                        stockMeta.isLow
                          ? "bg-rose-600 text-white border-rose-200/60"
                          : "bg-white/80 text-slate-900 border-white/70"
                      }`}
                      title={
                        stockMeta.critical_quantity > 0
                          ? `${t("Critical threshold")}: ${stockMeta.critical_quantity}`
                          : undefined
                      }
                    >
                      {t("Stock")}: {stockMeta.quantity.toLocaleString()}{" "}
                      {stockMeta.unit}
                    </div>
                    {stockMeta.isLow && (
                      <div className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">
                        {t("Low stock")}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-3 mb-1 pr-20">
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
                  {formatCurrency(Number(product.price || 0))}
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
                        : `${formatCurrency(
                            Number(product.discount_value || 0)
                          )} off`}
                    </span>
                  )}
                </div>
              </div>

              {/* Cost (backend or fallback) */}
{(() => {
  const backendCostRaw =
    productCostsById[product.id] !== undefined ? productCostsById[product.id] : null;
  const backendCost = toNumber(backendCostRaw);
  const fallbackCost = !(backendCost > 0) ? computeFallbackCost(product) : 0;
  const cost = backendCost > 0 ? backendCost : fallbackCost;

  if (!(cost > 0)) return null;

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
        <span className="text-rose-700">
          {formatCurrency(cost)}
        </span>
      </div>
      <div className="text-gray-500">
        {t(profitLabel)}:{" "}
        <span className={isLoss ? "text-red-600" : "text-blue-700"}>
          {isLoss ? "-" : ""}
          {formatCurrency(Math.abs(profit))}
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
          );
          })
        ) : (
          <div className="col-span-full text-center text-gray-500 py-16 text-lg">
            {t("No products found.")}
          </div>
        )}
      </div>

      {/* PRODUCT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[55.2rem] relative">
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
            <div className="px-6 pb-6 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {t("Existing Categories")}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                {t("Edit names or delete categories directly from this list.")}
              </p>
              <div className="mt-3 max-h-64 overflow-y-auto pr-1 space-y-2">
                {categoryEdits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
                    {t("No categories have been added yet.")}
                  </div>
                ) : (
                  categoryEdits.map((cat) => {
                    const trimmed = (cat.value || "").trim();
                    const hasChanges = trimmed && trimmed !== cat.original;
                    const renameBusy = isCategoryBusy(cat.original, "rename");
                    const deleteBusy = isCategoryBusy(cat.original, "delete");
                    return (
                      <div
                        key={cat.original}
                        className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm"
                      >
                        <input
                          type="text"
                          value={cat.value}
                          onChange={(e) => updateCategoryDraft(cat.original, e.target.value)}
                          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameCategory(cat.original, trimmed)}
                          disabled={!hasChanges || renameBusy}
                          className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            hasChanges && !renameBusy
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:scale-[1.02]"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                          }`}
                          title={t("Save changes")}
                        >
                          <Edit3 size={14} />
                          {renameBusy ? t("Saving...") : t("Save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategoryEntry(cat.original)}
                          disabled={deleteBusy}
                          className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-white bg-gradient-to-r from-red-500 to-rose-500 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed transition"
                          title={t("Delete category")}
                        >
                          <Trash2 size={14} />
                          {deleteBusy ? t("Deleting...") : t("Delete")}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
                    placeholder={t("Price")}
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
                    value={(item.unit === "piece" ? "pcs" : item.unit) || ""}
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
                    <option value="pcs">pcs</option>
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
    </>
  );
}
