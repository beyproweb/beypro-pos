import React, { useEffect, useMemo, useState } from "react";
import { useStock } from "../context/StockContext";
import { toast } from "react-toastify";
import socket from "../utils/socket";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";

export default function Stock() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [selectedSupplier, setSelectedSupplier] = useState("__all__");
  const [searchTerm, setSearchTerm] = useState("");
  const { groupedData, fetchStock, loading, handleAddToCart, setGroupedData } =
    useStock();
  
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



  // Fetch stock on mount
  useEffect(() => {
    fetchStock();
  }, []);

  // Realtime update on socket
  useEffect(() => {
    const handleRealtimeStockUpdate = () => {
      fetchStock();
    };
    socket.on("stock-updated", handleRealtimeStockUpdate);
    return () => {
      socket.off("stock-updated", handleRealtimeStockUpdate);
    };
  }, []);

  // Debug on mount
  useEffect(() => {
    console.log("🚀 Initial fetchStock() on page load");
    fetchStock();
  }, []);

  const totalStockValue = useMemo(() => {
    return groupedData.reduce(
      (acc, item) =>
        acc + (Number(item.quantity) || 0) * (Number(item.price_per_unit) || 0),
      0
    );
  }, [groupedData]);

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

  const handleCriticalChange = async (index, value) => {
    console.log("🔥 handleCriticalChange called for index", index, "value", value);

    const updated = [...groupedData];
    const item = updated[index];
    item.critical_quantity = value;
    setGroupedData(updated);

    if (!item || !item.stock_id) return;

    const json = await secureFetch(`/stock/${item.stock_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity: item.quantity,
        critical_quantity: value,
        reorder_quantity: item.reorder_quantity,
      }),
    });
    console.log("PATCH RESPONSE:", json);

    if (item.quantity <= value) {
      await fetchStock();
    }
  };

  const handleDeleteStock = async (item) => {
    if (
      !window.confirm(
        `🗑 Are you sure you want to delete "${item.name}" (${item.unit}) from stock?`
      )
    )
      return;
    try {
      await secureFetch(`/stock/${item.stock_id || item.id}`, {
        method: "DELETE",
      });
      toast.success(`Deleted "${item.name}" (${item.unit}) from stock.`);
      fetchStock(); // Refresh list
    } catch (err) {
      toast.error(`❌ Failed to delete "${item.name}".`);
    }
  };

  const handleReorderChange = async (index, value) => {
    const parsedValue = parseFloat(value);
    const updated = [...groupedData];
    const item = updated[index];
    item.reorder_quantity = parsedValue;
    setGroupedData(updated);

    if (!item || !item.stock_id) return;

    await secureFetch(`/stock/${item.stock_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        critical_quantity: item.critical_quantity,
        reorder_quantity: parsedValue,
      }),
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
  if (selectedSupplier !== "__all__") {
    filtered = filtered.filter(
      (item) => item.supplier_name === selectedSupplier
    );
  }
  if (searchTerm.trim()) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        (item.supplier && item.supplier.toLowerCase().includes(term))
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 transition-colors duration-300 dark:bg-slate-950 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-sky-500 text-white shadow-xl">
          <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-white/70">
                {t("Inventory Overview")}
              </p>
              <div>
                <h1 className="text-3xl font-bold sm:text-4xl">
                  {t("Stock Management")}
                </h1>
                <p className="mt-3 max-w-2xl text-base text-white/80 sm:text-lg">
                  {t(
                    "Monitor stock levels, prioritize restocks, and collaborate with suppliers in real-time."
                  )}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 rounded-2xl bg-white/10 px-5 py-4 text-white shadow-lg backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                {t("Total Stock Value")}
              </p>
              <p className="mt-2 text-3xl font-semibold sm:text-4xl">
                {formattedStockValue}
              </p>
              <p className="mt-2 text-sm text-white/70">
                {t("Live data synced with supplier inputs.")}
              </p>
            </div>
          </div>
        </section>

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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {loading ? (
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
              const pricePerUnit = Number(item.price_per_unit) || 0;
              const itemValue =
                (Number(item.quantity) || 0) * (Number(pricePerUnit) || 0);
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
                  key={index}
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
                          {pricePerUnit
                            ? formatCurrency(pricePerUnit)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/70 px-4 py-3 text-slate-600 shadow-inner dark:bg-slate-800/80 dark:text-slate-300">
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          {t("Total Value")}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                          {itemValue ? formatCurrency(itemValue) : "—"}
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
                          value={item.critical_quantity || ""}
                          onChange={(e) =>
                            handleCriticalChange(index, Number(e.target.value))
                          }
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
                          value={item.reorder_quantity || ""}
                          onChange={(e) =>
                            handleReorderChange(index, e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          placeholder="1"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      onClick={() => handleAddToCart(item)}
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40"
                      onClick={() => handleDeleteStock(item)}
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
