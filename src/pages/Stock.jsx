import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStock } from "../context/StockContext";
import { toast } from "react-toastify";
import socket from "../utils/socket";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { useNavigate } from "react-router-dom";

export default function Stock() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const uiDebugLoggedRef = useRef(false);
  const cardDebugLoggedRef = useRef(false);
  const [tenantId] = useState(() => {
    if (typeof window === "undefined") return null;
    const direct = window.localStorage.getItem("restaurant_id");
    if (direct) return String(direct);
    try {
      const user = JSON.parse(window.localStorage.getItem("beyproUser") || "{}");
      const rid =
        user?.restaurant_id ??
        user?.user?.restaurant_id ??
        user?.user?.restaurantId ??
        null;
      return rid ? String(rid) : null;
    } catch {
      return null;
    }
  });
  const [selectedSupplier, setSelectedSupplier] = useState("__all__");
  const [stockTypeFilter, setStockTypeFilter] = useState("all"); // all | production
  const [productionProductNames, setProductionProductNames] = useState([]);
  const [productionLoading, setProductionLoading] = useState(false);
  const [productionRecipes, setProductionRecipes] = useState([]);
  const [ingredientPrices, setIngredientPrices] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { groupedData, fetchStock, loading, handleAddToCart, setGroupedData } =
    useStock();
  const [editValuesByStockId, setEditValuesByStockId] = useState({});
  const editValuesRef = useRef({});
  const patchTimersRef = useRef(new Map());
  
  // Only allow users with "settings" permission
  const hasStockAccess = useHasPermission("stock");
  if (!hasStockAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Stock.")}
      </div>
    );
  }
  const [allSuppliers, setAllSuppliers] = useState([]);

useEffect(() => {
  secureFetch("/suppliers").then(setAllSuppliers).catch(() => setAllSuppliers([]));
}, []);

  useEffect(() => {
    if (productionLoading) return;
    if (productionRecipes.length > 0 && ingredientPrices.length > 0) return;

    let cancelled = false;
    const loadProductionData = async () => {
      setProductionLoading(true);
      try {
        const recipeEndpoint = tenantId
          ? `/production/recipes?restaurant_id=${tenantId}`
          : "/production/recipes";

        const [recipesData, pricesData] = await Promise.all([
          secureFetch(recipeEndpoint),
          secureFetch("/ingredient-prices"),
        ]);

        const recipesList = Array.isArray(recipesData)
          ? recipesData
          : Array.isArray(recipesData?.data)
          ? recipesData.data
          : Array.isArray(recipesData?.items)
          ? recipesData.items
          : [];

        const pricesList = Array.isArray(pricesData)
          ? pricesData
          : Array.isArray(pricesData?.data)
          ? pricesData.data
          : Array.isArray(pricesData?.items)
          ? pricesData.items
          : [];

        const names = Array.from(
          new Set(
            recipesList
              .map((r) => String(r?.name || "").trim())
              .filter(Boolean)
              .map((n) => n.toLowerCase())
          )
        );
        if (!cancelled) {
          setProductionRecipes(recipesList);
          setIngredientPrices(pricesList);
          setProductionProductNames(names);
        }
      } catch (e) {
        if (!cancelled) {
          setProductionRecipes([]);
          setIngredientPrices([]);
          setProductionProductNames([]);
          console.warn("Failed to load production cost inputs for stock", e);
        }
      } finally {
        if (!cancelled) setProductionLoading(false);
      }
    };

    loadProductionData();
    return () => {
      cancelled = true;
    };
  }, [
    productionLoading,
    productionProductNames.length,
    productionRecipes.length,
    ingredientPrices.length,
    tenantId,
  ]);



  // Fetch stock on mount
  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  useEffect(() => {
    return () => {
      patchTimersRef.current.forEach((timer) => clearTimeout(timer));
      patchTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (uiDebugLoggedRef.current) return;
    if (!Array.isArray(groupedData) || groupedData.length === 0) return;
    uiDebugLoggedRef.current = true;

    console.log(
      "🧾 Stock UI debug (groupedData)",
      groupedData.slice(0, 5).map((it) => ({
        name: it?.name,
        unit: it?.unit,
        quantity: it?.quantity,
        price_per_unit: it?.price_per_unit,
        number_price_per_unit: Number(it?.price_per_unit),
      }))
    );
  }, [groupedData]);

  const toSafeNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const normalized = raw.replace(/\s+/g, "").replace(",", ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  };

  const normalizeUnit = (value) => {
    if (!value) return "";
    const v = String(value).trim().toLowerCase();
    if (v === "l") return "lt";
    if (v === "lt") return "lt";
    if (v === "piece" || v === "pieces") return "pcs";
    return v;
  };

  const productionCostPerUnitByName = useMemo(() => {
    const priceByNameUnit = new Map(); // name|unit -> price/unit
    const priceByName = new Map(); // name -> price/unit (first seen)

    for (const row of Array.isArray(ingredientPrices) ? ingredientPrices : []) {
      const name = String(row?.name || row?.ingredient || "").trim().toLowerCase();
      if (!name) continue;
      const unit = normalizeUnit(row?.unit);
      const price = toSafeNumber(
        row?.current_price ??
          row?.price_per_unit ??
          row?.unit_price ??
          row?.cost_per_unit ??
          row?.costPrice ??
          row?.price ??
          0
      );
      if (!(price > 0)) continue;

      if (unit) priceByNameUnit.set(`${name}|${unit}`, price);
      if (!priceByName.has(name)) priceByName.set(name, price);
    }

    const costByRecipe = new Map(); // recipeNameLower -> cost/unit
    for (const recipe of Array.isArray(productionRecipes) ? productionRecipes : []) {
      const recipeName = String(recipe?.name || "").trim().toLowerCase();
      if (!recipeName) continue;

      const precomputed =
        toSafeNumber(
          recipe?.cost_per_unit ?? recipe?.costPerUnit ?? recipe?.unit_cost ?? 0
        ) || 0;
      if (precomputed > 0) {
        costByRecipe.set(recipeName, precomputed);
        continue;
      }

      const baseQty = toSafeNumber(recipe?.base_quantity ?? recipe?.baseQuantity ?? 0);
      if (!(baseQty > 0)) continue;

      const ingredientsList = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
      const totalCost = ingredientsList.reduce((sum, ing) => {
        const ingName = String(ing?.name || "").trim().toLowerCase();
        if (!ingName) return sum;
        const ingUnit = normalizeUnit(ing?.unit);
        const amount = toSafeNumber(
          ing?.amountPerBatch ??
            ing?.amount_per_batch ??
            ing?.amount ??
            ing?.qty ??
            ing?.quantity ??
            0
        );
        if (!(amount > 0)) return sum;

        const price =
          (ingUnit ? priceByNameUnit.get(`${ingName}|${ingUnit}`) : null) ??
          priceByName.get(ingName) ??
          0;

        return sum + amount * toSafeNumber(price);
      }, 0);

      const perUnit = totalCost / baseQty;
      if (perUnit > 0) costByRecipe.set(recipeName, perUnit);
    }

    return costByRecipe;
  }, [ingredientPrices, productionRecipes]);

  const getPricePerUnit = (item) => {
    const rawPrice =
      item?.price_per_unit ??
      item?.unit_price ??
      item?.cost_per_unit ??
      item?.costPrice ??
      item?.price ??
      0;

    let pricePerUnit = toSafeNumber(rawPrice);
    if (!(pricePerUnit > 0)) {
      const derivedFromTotal =
        (toSafeNumber(item?.total_value ?? item?.value ?? item?.amount) > 0 &&
          toSafeNumber(item?.quantity)) > 0
          ? toSafeNumber(item?.total_value ?? item?.value ?? item?.amount) /
            (toSafeNumber(item?.quantity) || 1)
          : 0;
      pricePerUnit = derivedFromTotal;
    }

    if (!(pricePerUnit > 0)) {
      const nameKey = String(item?.name || "").trim().toLowerCase();
      const productionCost = productionCostPerUnitByName.get(nameKey);
      if (productionCost > 0) pricePerUnit = productionCost;
    }

    return pricePerUnit;
  };

  const totalStockValue = useMemo(() => {
    return (Array.isArray(groupedData) ? groupedData : []).reduce((acc, item) => {
      const qty = toSafeNumber(item?.quantity);
      const ppu = getPricePerUnit(item);
      return acc + qty * (toSafeNumber(ppu) || 0);
    }, 0);
  }, [groupedData, productionCostPerUnitByName]);

  const totalItems = groupedData.length;
  const totalUnitsOnHand = groupedData.reduce(
    (acc, item) => acc + (Number(item.quantity) || 0),
    0
  );
  const lowStockCount = groupedData.filter((item) => {
    if (item.critical_quantity === null || item.critical_quantity === undefined) {
      return false;
    }
    return Number(item.quantity ?? 0) <= Number(item.critical_quantity ?? 0);
  }).length;
  const reorderSoonCount = groupedData.filter((item) => {
    const reorder = Number(item.reorder_quantity ?? 0);
    return reorder > 0 && Number(item.quantity ?? 0) <= reorder;
  }).length;

  const expiryColorMap = {
    danger: "text-rose-600 dark:text-rose-300",
    warning: "text-amber-600 dark:text-amber-200",
    ok: "text-emerald-600 dark:text-emerald-300",
    info: "text-slate-600 dark:text-slate-300",
  };

  const expiryBadgeColorMap = {
    danger: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/30 dark:text-rose-200",
    warning: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/30 dark:text-amber-200",
    ok: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-200",
    info: "bg-slate-200/70 text-slate-600 dark:bg-slate-700/40 dark:text-slate-200",
  };

  const getExpiryMeta = (expiryDate) => {
    if (!expiryDate) {
      return {
        label: t("No expiry date"),
        severity: "info",
        badge: null,
      };
    }
    const parsed = new Date(expiryDate);
    if (Number.isNaN(parsed.getTime())) {
      return {
        label: t("No expiry date"),
        severity: "info",
        badge: null,
      };
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const diffMs = parsed.getTime() - Date.now();
    const daysLeft = Math.ceil(diffMs / msPerDay);
    const formattedDate = parsed.toLocaleDateString();

    if (daysLeft <= 0) {
      return {
        label: `${t("Expired on")} ${formattedDate}`,
        severity: "danger",
        badge: t("Expired"),
      };
    }

    if (daysLeft <= 3) {
      const dayWord = daysLeft === 1 ? t("day") : t("days");
      return {
        label: `${t("Expires in")} ${daysLeft} ${dayWord}`,
        severity: "warning",
        badge: t("Expiring soon"),
      };
    }

    return {
      label: `${t("Expires on")} ${formattedDate}`,
      severity: "ok",
      badge: t("Fresh inventory"),
    };
  };

  const toNumInput = (raw) => {
    if (raw === "" || raw === null || raw === undefined) return null;
    const v = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(v) ? v : null;
  };

  const scheduleStockPatch = useCallback(
    (stockId, body) => {
      if (!stockId) return;
      const key = `${stockId}:${Object.keys(body).sort().join(",")}`;
      const existing = patchTimersRef.current.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          await secureFetch(`/stock/${stockId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        } catch (err) {
          console.error("❌ Stock PATCH failed:", err);
          toast.error(t("Failed to update stock"));
        }
      }, 450);

      patchTimersRef.current.set(key, timer);
    },
    [t]
  );

  const handleCriticalChange = (index, rawValue) => {
    const item = groupedData[index];
    if (!item?.stock_id) return;

    setEditValuesByStockId((prev) => {
      const next = {
        ...prev,
        [item.stock_id]: {
          ...(prev[item.stock_id] || {}),
          critical_quantity: rawValue,
        },
      };
      editValuesRef.current = next;
      return next;
    });

    const updated = [...groupedData];
    updated[index] = { ...item, critical_quantity: rawValue };
    setGroupedData(updated);

    const critical = toNumInput(rawValue) ?? 0;
    const reorder = toNumInput(
      editValuesRef.current[item.stock_id]?.reorder_quantity ?? item.reorder_quantity
    ) ?? 0;
    scheduleStockPatch(item.stock_id, {
      critical_quantity: critical,
      reorder_quantity: reorder,
    });
  };

  const handleDeleteStock = async (item) => {
    if (
      !window.confirm(
        t('🗑 Are you sure you want to delete "{{name}}" ({{unit}}) from stock?', {
          name: item?.name || "",
          unit: item?.unit || "",
        })
      )
    )
      return;
    try {
      await secureFetch(`/stock/${item.stock_id || item.id}`, {
        method: "DELETE",
      });
      toast.success(
        t('Deleted "{{name}}" ({{unit}}) from stock.', {
          name: item?.name || "",
          unit: item?.unit || "",
        })
      );
      fetchStock(); // Refresh list
    } catch (err) {
      toast.error(
        t('Failed to delete "{{name}}".', {
          name: item?.name || "",
        })
      );
    }
  };

  const handleReorderChange = (index, rawValue) => {
    const item = groupedData[index];
    if (!item?.stock_id) return;

    setEditValuesByStockId((prev) => {
      const next = {
        ...prev,
        [item.stock_id]: {
          ...(prev[item.stock_id] || {}),
          reorder_quantity: rawValue,
        },
      };
      editValuesRef.current = next;
      return next;
    });

    const updated = [...groupedData];
    updated[index] = { ...item, reorder_quantity: rawValue };
    setGroupedData(updated);

    const reorder = toNumInput(rawValue) ?? 0;
    const critical = toNumInput(
      editValuesRef.current[item.stock_id]?.critical_quantity ?? item.critical_quantity
    ) ?? 0;
    scheduleStockPatch(item.stock_id, {
      critical_quantity: critical,
      reorder_quantity: reorder,
    });
  };
useEffect(() => {
  const refreshSuppliers = () => {
    secureFetch("/suppliers")
      .then(setAllSuppliers)
      .catch(() => setAllSuppliers([]));
  };

  socket.on("supplier-updated", refreshSuppliers);
  socket.on("stock-updated", refreshSuppliers);

  return () => {
    socket.off("supplier-updated", refreshSuppliers);
    socket.off("stock-updated", refreshSuppliers);
  };
}, []);

const suppliersList = Array.from(
  new Set([
    ...allSuppliers.map(s => s.name),
    ...groupedData.map(i => i.supplier_name).filter(Boolean),
  ])
);
  const formattedStockValue = formatCurrency(totalStockValue);

  const statCards = [
    {
      title: t("Stock Value"),
      value: formattedStockValue,
      description: t("Estimated replacement cost"),
      accent: "from-indigo-500 to-purple-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c1.657 0 3 1.343 3 3v4a3 3 0 01-6 0v-4c0-1.657 1.343-3 3-3z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v5m0 8v5m9-9a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      title: t("Active Items"),
      value: totalItems.toLocaleString(),
      description: t("Unique inventory records"),
      accent: "from-sky-500 to-cyan-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7h18M3 12h18M3 17h18"
          />
        </svg>
      ),
    },
    {
      title: t("Low Stock Alerts"),
      value: lowStockCount.toLocaleString(),
      description: t("Below critical threshold"),
      accent: "from-rose-500 to-orange-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.62 1.73-3L13.73 4c-.77-1.38-2.69-1.38-3.46 0L3.34 16c-.77 1.38.19 3 1.73 3z"
          />
        </svg>
      ),
    },
    {
      title: t("Reorder Ready"),
      value: reorderSoonCount.toLocaleString(),
      description: t("At or below reorder target"),
      accent: "from-emerald-500 to-green-500",
      icon: (
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c-2.21 0-4 1.79-4 4v5h8v-5c0-2.21-1.79-4-4-4z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l.867-1.5a2 2 0 011.732-1h.802a2 2 0 011.732 1L15 5"
          />
        </svg>
      ),
    },
  ];

  let filtered = groupedData;

  if (stockTypeFilter === "production") {
    const byName = new Map(); // lowerName -> item[]
    (Array.isArray(groupedData) ? groupedData : []).forEach((it) => {
      const key = String(it?.name || "").trim().toLowerCase();
      if (!key) return;
      const arr = byName.get(key) || [];
      arr.push(it);
      byName.set(key, arr);
    });

    const productionRows = (Array.isArray(productionRecipes) ? productionRecipes : []).map(
      (recipe) => {
        const recipeName = String(recipe?.name || "").trim();
        const recipeKey = recipeName.toLowerCase();
        const outputUnit = normalizeUnit(recipe?.output_unit ?? recipe?.outputUnit);
        const recipeExpiry = recipe?.expiry_date || recipe?.expiryDate || null;

        const candidates = byName.get(recipeKey) || [];
        const match =
          (outputUnit
            ? candidates.find(
                (c) => normalizeUnit(c?.unit) === normalizeUnit(outputUnit)
              )
            : null) || candidates[0] || null;

        if (match) {
          return {
            ...match,
            expiry_date: match?.expiry_date || recipeExpiry || null,
          };
        }

        const pricePerUnit = productionCostPerUnitByName.get(recipeKey) || 0;
        return {
          name: recipeName,
          unit: outputUnit || "pcs",
          quantity: 0,
          price_per_unit: pricePerUnit,
          supplier_id: null,
          supplier_name: "",
          supplier: "",
          critical_quantity: 0,
          reorder_quantity: 0,
          expiry_date: recipeExpiry,
          stock_id: null,
          from_production: true,
        };
      }
    );

    filtered = productionRows;
  }

  // Supplier filter: only meaningful for normal stock list
  if (selectedSupplier !== "__all__" && stockTypeFilter !== "production") {
    filtered = filtered.filter((item) => item.supplier_name === selectedSupplier);
  }

  if (searchTerm.trim()) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        String(item?.name || "").toLowerCase().includes(term) ||
        String(item?.supplier || "").toLowerCase().includes(term)
    );
  }

  const showLoadingPlaceholder = loading && groupedData.length === 0;

      return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 transition-colors duration-300 dark:bg-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statCards.map((card, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200/70 bg-white/95 p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white ${card.accent}`}
                >
                  {card.icon}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                    {card.value}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {card.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 sm:p-6">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {t("Filters & Insights")}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {t(
                  "Refine inventory by supplier or keyword while keeping critical KPIs in view."
                )}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("Filter by Supplier")}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 7h16M4 12h16M4 17h16"
                      />
                    </svg>
                  </div>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="__all__">{t("All Suppliers")}</option>
                    {suppliersList.map((s, idx) => (
                      <option key={idx} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400 dark:text-slate-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("Search")}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 dark:text-slate-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-5.2-5.2M17 10a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("Search product or supplier")}
                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-2.5 pl-10 pr-4 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("Stock Type")}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setStockTypeFilter("all")}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                      stockTypeFilter === "all"
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t("All")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStockTypeFilter("production")}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${
                      stockTypeFilter === "production"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t("Production")} {t("Stock")}
                  </button>
                </div>
                {stockTypeFilter === "production" && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {productionLoading
                      ? t("Loading...")
                      : `${productionProductNames.length.toLocaleString()} ${t(
                          "products"
                        )}`}
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center gap-3 rounded-xl border border-dashed border-slate-300/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("Quick facts")}
                </span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <span>
                    {t("Suppliers")}:{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {suppliersList.length.toLocaleString()}
                    </span>
                  </span>
                  <span>
                    {t("Units on hand")}:{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {totalUnitsOnHand.toLocaleString()}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {showLoadingPlaceholder ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 py-16 text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
            <svg
              className="mr-2 h-5 w-5 animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v4m0 8v4m8-8h-4M8 12H4"
              />
              <circle cx="12" cy="12" r="9" />
            </svg>
            {t("Loading stock data...")}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 px-6 py-12 text-center text-slate-500 shadow-inner dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            <p className="text-lg font-semibold text-slate-600 dark:text-slate-200">
              {t("No matching stock found.")}
            </p>
            <p className="mt-2 text-sm">
              {t(
                "Try broadening your filters or resetting the search criteria."
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((item, index) => {
              const key =
                item.stock_id ||
                item.id ||
                `${item.name?.toLowerCase()}_${item.unit}`;
              const rawPrice =
                item.price_per_unit ??
                item.unit_price ??
                item.cost_per_unit ??
                item.costPrice ??
                item.price ??
                0;
              let pricePerUnit = getPricePerUnit(item);
              const itemValue =
                (toSafeNumber(item.quantity) || 0) * (toSafeNumber(pricePerUnit) || 0);

              if (
                import.meta.env.DEV &&
                !cardDebugLoggedRef.current &&
                (pricePerUnit !== 0 || itemValue !== 0)
              ) {
                cardDebugLoggedRef.current = true;
                console.log("🧾 Stock card debug (render)", {
                  name: item?.name,
                  unit: item?.unit,
                  quantity: item?.quantity,
                  raw_price_per_unit: item?.price_per_unit,
                  pricePerUnit,
                  itemValue,
                  formatCurrencyType: typeof formatCurrency,
                  formattedPricePerUnit: formatCurrency(pricePerUnit),
                  formattedItemValue: formatCurrency(itemValue),
                });
              }

              const expiryMeta = getExpiryMeta(item.expiry_date);
              const expiryColor =
                expiryColorMap[expiryMeta.severity] || expiryColorMap.info;
              const badgeClass =
                expiryBadgeColorMap[expiryMeta.severity] || expiryBadgeColorMap.info;
              const isLowStock =
                item.critical_quantity !== null &&
                item.critical_quantity !== undefined &&
                Number(item.quantity ?? 0) <= Number(item.critical_quantity ?? 0);

              return (
                <div
                  key={key}
                  className={`flex h-full flex-col overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg ${
                    isLowStock
                      ? "border-rose-200/70 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/40"
                      : "border-slate-200/70 bg-white/95 dark:border-slate-800 dark:bg-slate-900/80"
                  }`}
                >
                  <div className="flex items-start justify-between border-b border-white/40 pb-4 dark:border-white/5">
                    <div className="space-y-1">
                      <h3 className="text-lg font-semibold capitalize text-slate-900 dark:text-white">
                        {item.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-slate-200/80 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {t("Unit")}: {item.unit || "—"}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-slate-200/80 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {item.supplier || t("No supplier linked")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {(Number(item.quantity) || 0).toLocaleString()}
                      </span>
                      {isLowStock && (
                        <span className="inline-flex items-center rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
                          {t("Low stock")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 py-5">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="rounded-xl bg-white/70 px-4 py-3 text-slate-600 shadow-inner dark:bg-slate-800/80 dark:text-slate-300">
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          {t("Price / Unit")}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(pricePerUnit)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/70 px-4 py-3 text-slate-600 shadow-inner dark:bg-slate-800/80 dark:text-slate-300">
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          {t("Total Value")}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(itemValue)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200/70 pt-3 text-sm text-slate-500 dark:border-slate-800/60 dark:text-slate-300">
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {t("Expiry")}
                        </span>
                        <span className={`text-sm font-semibold ${expiryColor}`}>
                          {expiryMeta.label}
                        </span>
                      </div>
                      {expiryMeta.badge && (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                          {expiryMeta.badge}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("Critical threshold")}
                        </span>
                        <input
                          type="number"
                          value={
                            editValuesByStockId[item.stock_id]?.critical_quantity ??
                            item.critical_quantity ??
                            ""
                          }
                          onChange={(e) =>
                            handleCriticalChange(index, e.target.value)
                          }
                          disabled={!item?.stock_id}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="—"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {t("Reorder quantity")}
                        </span>
                        <input
                          type="number"
                          value={
                            editValuesByStockId[item.stock_id]?.reorder_quantity ??
                            item.reorder_quantity ??
                            ""
                          }
                          onChange={(e) =>
                            handleReorderChange(index, e.target.value)
                          }
                          disabled={!item?.stock_id}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="1"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <div className="flex items-stretch gap-2">
                      <button
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        onClick={() => handleAddToCart(item)}
                        disabled={
                          !item?.stock_id ||
                          !item?.supplier_id ||
                          !(Number(item?.reorder_quantity) > 0)
                        }
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 5v14m7-7H5"
                          />
                        </svg>
                        {t("Add to Supplier Cart")}
                      </button>

                      <button
                        type="button"
                        className="inline-flex w-12 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/60"
                        title={t("Open Supplier Cart")}
                        aria-label={t("Open Supplier Cart")}
                        onClick={() => {
                          const supplierId = item?.supplier_id;
                          const target = supplierId
                            ? `/suppliers?view=cart&openCartSupplierId=${encodeURIComponent(
                                supplierId
                              )}`
                            : "/suppliers?view=cart";
                          navigate(target);
                        }}
                        disabled={!item?.supplier_id}
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3 3h2l.4 2M7 13h10l4-8H6.4M7 13l-1.3 2.6A1 1 0 006.6 17H19M7 13l.4-8m3 16a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z"
                          />
                        </svg>
                      </button>
                    </div>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                      onClick={() => handleDeleteStock(item)}
                      disabled={!item?.stock_id}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-3h4a1 1 0 011 1v1H9V5a1 1 0 011-1z"
                        />
                      </svg>
                      {t("Delete Item")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
