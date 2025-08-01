import React, { useEffect, useState, useRef } from "react";
import { useStock } from "../context/StockContext";
import { toast } from "react-toastify";
import socket from "../utils/socket";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
export default function Stock() {
    const { t } = useTranslation(); // ✅ Enable translations
const API_URL = import.meta.env.VITE_API_URL || "";
const [selectedSupplier, setSelectedSupplier] = useState("__all__");
  const [searchTerm, setSearchTerm] = useState("");
  const { groupedData, fetchStock, loading, handleAddToCart, setGroupedData } = useStock();
      const [ingredientPrices, setIngredientPrices] = useState([]);

// Only allow users with "settings" permission
  const hasSettingsAccess = useHasPermission("settings");
  if (!hasSettingsAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Settings.")}
      </div>
    );
  }
    // Fetch stock and prices on mount
    useEffect(() => {
      fetchStock();
      fetch(`${API_URL}/api/ingredient-prices`)
        .then(res => res.json())
        .then(setIngredientPrices)
        .catch(() => setIngredientPrices([]));
    }, []);

    // Realtime update on socket
    useEffect(() => {
      const handleRealtimeStockUpdate = (data) => {
        fetchStock();
      };
      socket.on("stock-updated", handleRealtimeStockUpdate);
      return () => {
        socket.off("stock-updated", handleRealtimeStockUpdate);
      };
    }, []);

  useEffect(() => {
    console.log("🚀 Initial fetchStock() on page load");
    fetchStock(); // Only once on mount
  }, []);

  useEffect(() => {
  const handleRealtimeStockUpdate = (data) => {
    console.log("📦 Stock update via socket:", data);
    fetchStock();
  };

  socket.on("connect", () => {
    console.log("🔌 Stock socket connected");
  });

  socket.on("stock-updated", handleRealtimeStockUpdate);

  return () => {
    socket.off("stock-updated", handleRealtimeStockUpdate); // ✅ clean listener only
  };
}, []);

 // Compute merged stock data with price_per_unit injected
    const mergedStock = groupedData.map(item => {
      // Find matching ingredient price by name + unit
      const match = ingredientPrices.find(
        p => p.name?.toLowerCase() === item.name?.toLowerCase() && p.unit === item.unit
      );
      return {
        ...item,
        price_per_unit: match?.price_per_unit ?? 0,
      };
    });

const handleCriticalChange = async (index, value) => {
      console.log("🔥 handleCriticalChange called for index", index, "value", value);

  const updated = [...groupedData];
  const item = updated[index];

  item.critical_quantity = value;
  setGroupedData(updated);

  if (!item || !item.stock_id) return;

await fetch(`${API_URL}/api/stock/${item.stock_id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    quantity: item.quantity,
    critical_quantity: value,
    reorder_quantity: item.reorder_quantity
  })
});

console.log("PATCH STATUS:", res.status);
const json = await res.json().catch(() => ({}));
console.log("PATCH RESPONSE:", json);


  if (item.quantity <= value) {
    await fetchStock();
  }
};



  const handleDeleteStock = async (item) => {
  if (!window.confirm(`🗑 Are you sure you want to delete "${item.name}" (${item.unit}) from stock?`)) return;
  try {
    await fetch(`${API_URL}/api/stock/${item.stock_id || item.id}`, { method: 'DELETE' });
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

   await fetch(`${API_URL}/api/stock/${item.stock_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      critical_quantity: item.critical_quantity,
      reorder_quantity: parsedValue,
    }),
  });

  // ✅ No need to fetchStock() unless stock quantity may change
  // This prevents screen flicker
};





  const suppliersList = Array.from(
    new Set(groupedData.map((item) => item.supplier_name).filter(Boolean))
  );

  let filtered = groupedData;

if (selectedSupplier !== "__all__") {
  filtered = filtered.filter((item) => item.supplier_name === selectedSupplier);
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
  <div className="p-6 min-h-screen transition-colors duration-300">
    {/* Header row: title left, filters centered on desktop */}
    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">

      {/* Filters row: centered horizontally on desktop, stacked on mobile */}
      <div className="w-full flex justify-start ml-0">

        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div>
            <label className="mr-2 font-medium text-gray-800 dark:text-white">
              {t('Filter by Supplier')}:
            </label>
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="border p-2 rounded-md shadow-sm bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              <option value="__all__">{t('All Suppliers')}</option>
              {suppliersList.map((s, idx) => (
                <option key={idx} value={s}>{s}</option>
              ))}
            </select>
          </div>
   <div className="flex gap-3 items-center">
  <div>
    <label className="mr-2 font-medium text-gray-800 dark:text-white">
      {t('Search')}:
    </label>
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder={t('Search product or supplier')}
      className="border p-2 rounded-md shadow-sm bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
    />
  </div>
  {/* Total Stock Value */}
{/* Total Stock Value */}
<div
  className="ml-4 flex items-center px-4 py-2 rounded-2xl shadow bg-gradient-to-r from-emerald-400 to-indigo-500 dark:from-indigo-700 dark:to-purple-700 text-white text-lg font-bold tracking-tight"
  style={{
    minWidth: 180,
    justifyContent: "center",
    boxShadow: "0 2px 12px 0 rgba(87,43,231,0.14)",
  }}
>
  <svg className="mr-2 w-6 h-6 text-white opacity-90" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c1.657 0 3 1.343 3 3v4a3 3 0 01-6 0v-4c0-1.657 1.343-3 3-3z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v4m0 8v4m8-8a8 8 0 11-16 0 8 8 0 0116 0z"/></svg>
  {t('Total Stock Value')}: <span className="ml-2 font-extrabold">
{
  (() => {
    if (mergedStock && Array.isArray(mergedStock)) {
      mergedStock.forEach(item => {
        const q = Number(item.quantity) || 0;
        const p = Number(item.price_per_unit) || 0;
        console.log(
          `[MERGED STOCK VAL]`,
          item.name,
          "qty:", q,
          "ppu:", p,
          "rowtotal:", q*p
        );
      });
      return mergedStock.reduce(
        (acc, item) => acc + ((Number(item.quantity) || 0) * (Number(item.price_per_unit) || 0)),
        0
      ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return "0.00";
  })()
} ₺


  </span>
</div>

</div>

        </div>
      </div>
    </div>

    {loading ? (
      <p className="text-gray-600 dark:text-gray-400">{t('Loading stock data...')}</p>
    ) : filtered.length === 0 ? (
      <p className="text-gray-600 dark:text-gray-400">{t('No matching stock found.')}</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((item, index) => (
          <div
            key={index}
            className={`flex flex-col justify-between p-4 rounded-xl shadow ${
              item.quantity < item.critical_quantity
                ? "bg-red-100 dark:bg-red-800"
                : "bg-white dark:bg-gray-700"
            } hover:shadow-lg transition min-h-[300px]`}
          >
            <div>
              <h2 className="text-lg font-semibold capitalize mb-2 text-gray-900 dark:text-white">
                {item.name}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                {t('Supplier(s)')}: <span className="font-medium">{item.supplier}</span>
              </p>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-gray-700 dark:text-gray-200">{t('Unit')}: {item.unit}</p>
                <p
                  className={`text-xl font-bold ${
                    item.quantity < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {item.quantity}
                </p>
              </div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('Critical')}:</p>
                <input
                  type="number"
                  value={item.critical_quantity || ""}
                  onChange={(e) => handleCriticalChange(index, Number(e.target.value))}
                  className="border p-1 rounded w-20 text-center bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
                  placeholder="—"
                />
              </div>

              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('Order Qty')}:</p>
                <input
                  type="number"
                  value={item.reorder_quantity || ""}
                  onChange={(e) => handleReorderChange(index, e.target.value)}
                  className="border p-1 rounded w-20 text-center bg-white dark:bg-gray-800 dark:text-white dark:border-gray-600"
                  placeholder="1"
                />
              </div>
            </div>
            <button
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white font-bold px-4 py-2 rounded transition-all"
              onClick={() => handleAddToCart(item)}
            >
              ➕ {t('Add to Supplier Cart')}
            </button>
            <button
  className="mt-2 bg-red-500 hover:bg-red-600 text-white font-bold px-4 py-2 rounded transition-all"
  onClick={() => handleDeleteStock(item)}
>
  🗑 {t('Delete Item')}
</button>

          </div>
        ))}
      </div>
    )}
  </div>
);

}