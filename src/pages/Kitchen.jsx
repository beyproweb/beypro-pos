import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import socket from "../utils/socket"; // adjust path as needed!

import { useHasPermission } from "../components/hooks/useHasPermission";

export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
  try {
    // Use a unique key for this page, e.g. 'kitchenSelectedIds'
    const saved = localStorage.getItem("kitchenSelectedIds");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
});
  const [showModal, setShowModal] = useState(false);
  const [compiled, setCompiled] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [products, setProducts] = useState([]);
  const { t } = useTranslation();
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timers, setTimers] = useState([]);
const [newTimerName, setNewTimerName] = useState("");
const [newTimerSeconds, setNewTimerSeconds] = useState(60);
const [excludedCategories, setExcludedCategories] = useState([]);
const [excludedItems, setExcludedItems] = useState([]);
// List any ingredients to always exclude from compile (empty means include all)
const [excludedIngredients, setExcludedIngredients] = useState([]);
  // Only allow users with "settings" permission
  const hasSettingsAccess = useHasPermission("settings");
  if (!hasSettingsAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view Settings.")}
      </div>
    );
  }

const productIdToCategory = {};
products.forEach(p => {
  productIdToCategory[p.id] = p.category || "Uncategorized";
});

// Fetch all 3 on mount
useEffect(() => {
  fetch("/api/kitchen/compile-settings")
    .then(res => res.json())
    .then(data => {
      setExcludedIngredients(data.excludedIngredients || []);
      setExcludedCategories(data.excludedCategories || []);
      setExcludedItems(data.excludedItems || []);
    })
    .catch(() => {
      setExcludedIngredients([]);
      setExcludedCategories([]);
      setExcludedItems([]);
    });
}, []);
useEffect(() => {
  fetch("/api/kitchen/compile-settings")
    .then(res => res.json())
    .then(data => {
      setExcludedIngredients(data.excludedIngredients || []);
    })
    .catch(() => setExcludedIngredients([]));
}, []);

// 2. Any time selectedIds changes, update localStorage
useEffect(() => {
  localStorage.setItem("kitchenSelectedIds", JSON.stringify(selectedIds));
}, [selectedIds]);

// 3. When orders are fetched, filter out selections for any IDs that no longer exist
useEffect(() => {
  if (orders.length) {
    setSelectedIds((prev) => prev.filter(id => orders.some(o => o.item_id === id)));
  }
}, [orders]);
useEffect(() => {
  if (!showTimerModal) return;
  const interval = setInterval(() => {
    setTimers(prev =>
      prev.map(timer =>
        timer.running && timer.secondsLeft > 0
  ? (() => {
      const newSeconds = timer.secondsLeft - 1;
      // If finished, reset to total and pause
      if (newSeconds === 0) {
        // Update DB with reset and paused state
        fetch("/api/kitchen-timers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: timer.id,
            name: timer.name,
            secondsLeft: timer.total, // Reset to original time
            total: timer.total,
            running: false, // Pause
          }),
        });
        return { ...timer, secondsLeft: timer.total, running: false };
      } else {
        // Usual tick-down logic
        fetch("/api/kitchen-timers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: timer.id,
            name: timer.name,
            secondsLeft: newSeconds,
            total: timer.total,
            running: timer.running,
          }),
        });
        return { ...timer, secondsLeft: newSeconds };
      }
    })()
  : timer

      )
    );
  }, 1000);
  return () => clearInterval(interval);
}, [showTimerModal, timers]);



useEffect(() => {
  if (showTimerModal) {
    fetch("/api/kitchen-timers")
      .then(res => res.json())
      .then(timers => setTimers(timers.map(timer => ({
        ...timer,
        secondsLeft: timer.seconds_left,
        total: timer.total_seconds,
        running: timer.running,
        id: timer.id
      }))))
      .catch(() => setTimers([]));
  }
}, [showTimerModal]);

// Inside useEffect:
useEffect(() => {
  socket.on("kitchen_timers_update", (timersUpdate) => {
    // update timer states with the pushed updates
    setTimers((oldTimers) => oldTimers.map(timer => {
      const updated = timersUpdate.find(t => t.id === timer.id);
      return updated
        ? {
            ...timer,
            secondsLeft: updated.seconds_left,
            running: updated.running,
            total: updated.total_seconds
          }
        : timer;
    }));
  });
  return () => {
    socket.off("kitchen_timers_update");
  };
}, []);

const updateTimerInDB = async (timer) => {
  await fetch("/api/kitchen-timers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: timer.id,
      name: timer.name,
      secondsLeft: timer.secondsLeft,
      total: timer.total,
      running: timer.running,
    }),
  });
};

  // Always use full URL for backend fetches!
  const fetchKitchenOrders = async () => {
    try {
      const res = await fetch("/api/kitchen-orders");
      const data = await res.json();
      const filtered = data.filter((item) => {
  // Keep showing if:
  // - NOT delivered yet
  // - OR delivered but NOT paid/closed
  const isDelivered = item.kitchen_status === "delivered";
  const isPaid = item.status === "paid" || item.transaction_closed; // adjust field as needed
  return !(isDelivered && isPaid); // Only hide if delivered AND paid/closed
});

      setOrders(filtered);
    } catch (err) {
      console.error("❌ Kitchen route failed:", err);
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
    const interval = setInterval(fetchKitchenOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
  if (orders.length) {
    console.log("🍟 Kitchen orders:", orders);
  }
}, [orders]);


  // Fetch all products at mount (always use full URL)
  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(setProducts)
      .catch(() => setProducts([]));
  }, []);

  // Parse all ingredient names, robust for any data
  const allIngredients = Array.from(
    new Set(
      products.flatMap(product => {
        let arr = [];
        try {
          arr = Array.isArray(product.ingredients)
            ? product.ingredients
            : (typeof product.ingredients === "string"
              ? JSON.parse(product.ingredients)
              : []);
        } catch { arr = []; }
        return arr.map(ing => ing && ing.ingredient).filter(Boolean);
      })
    )
  ).sort();

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectGroup = (items) => {
    const itemIds = items.map((item) => item.item_id);
    const allSelected = itemIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !itemIds.includes(id));
      } else {
        const newSet = new Set([...prev, ...itemIds]);
        return Array.from(newSet);
      }
    });
  };

  const updateKitchenStatus = async (status) => {
    try {
      const idsToUpdate = selectedIds.filter(id => {
        const item = orders.find(o => o.item_id === id);
        return item && item.kitchen_status !== status;
      });

      if (idsToUpdate.length === 0) return;

      await fetch("/api/order-items/kitchen-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToUpdate, status }),
      });

      fetchKitchenOrders();

      setSelectedIds(prev =>
        prev.filter(id => {
          const item = orders.find(o => o.item_id === id);
          return item && item.kitchen_status !== status;
        })
      );
    } catch (err) {
      console.error("❌ Failed to update kitchen status:", err);
    }
  };

  // --- Compile Ingredients Logic ---
function compileTotals(selectedOrders) {
  const totalIngredients = {};
  const productsByCategory = {};

  // Lookup for category by product_id
  const productIdToCategory = {};
  products.forEach(p => {
    productIdToCategory[p.id] = p.category || "Uncategorized";
  });

  selectedOrders.forEach((item) => {
    const category =
      productIdToCategory[item.product_id] ||
      item.product_category ||
      item.category ||
      "Uncategorized";
    if (!productsByCategory[category]) productsByCategory[category] = {};

    if (item.product_name) {
      productsByCategory[category][item.product_name] =
        (productsByCategory[category][item.product_name] || 0) +
        (item.quantity || 1);
    }

    // Ingredient logic stays as is...
    let ingredients = [];
    try {
      ingredients = Array.isArray(item.ingredients)
        ? item.ingredients
        : (typeof item.ingredients === "string" ? JSON.parse(item.ingredients) : []);
    } catch { ingredients = []; }

    ingredients.forEach((ing) => {
      if (
        !ing || typeof ing !== "object" || !ing.ingredient ||
        excludedIngredients.includes(ing.ingredient)
      ) return;

      const key = ing.ingredient;
      const qty = Number(ing.quantity) || 1;
      totalIngredients[key] = (totalIngredients[key] || 0) + qty * (item.quantity || 1);
    });
  });

  return {
    ingredients: totalIngredients,
    productsByCategory,
  };
}





  const openCompileModal = () => {
    const selectedOrders = orders.filter(o => selectedIds.includes(o.item_id));
    setCompiled(compileTotals(selectedOrders));
    setShowModal(true);
  };
  const closeCompileModal = () => setShowModal(false);

  const safeParse = (data) => {
    try {
      return typeof data === "string" ? JSON.parse(data) : data || [];
    } catch {
      return [];
    }
  };

  useEffect(() => {
  if (orders.length) {
    console.log("🔥 DEBUG Kitchen Orders Raw:", orders);
  }
}, [orders]);


  // --- GROUP BY TABLE OR PHONE ORDER ---
const groupedKitchenOrders = orders.reduce((acc, item) => {
  if (item.order_type === "phone" || item.order_type === "packet") {
    const key = `${item.order_type}-${item.customer_name || item.customer_phone || item.order_id}`;
    if (!acc[key]) acc[key] = { type: item.order_type, items: [], header: item };
    acc[key].items.push(item);
  } else {
    // Table order, group by table_number
    const key = `table-${item.table_number}`;
    if (!acc[key]) acc[key] = { type: "table", items: [], header: item };
    acc[key].items.push(item);
  }
  return acc;
}, {});




return (
  <div className="min-h-screen px-2 py-3 sm:px-6 sm:py-2 flex flex-col gap-4 sm:gap-8 relative">
    {/* Header */}
    <header className="flex items-center justify-between mb-0">

 <div className="flex justify-end w-full mb-0">
  <button
    onClick={() => setShowSettings(true)}
    className="
      px-3 py-1.5
      text-sm
      bg-gradient-to-r from-indigo-500 to-purple-600
      text-white
      rounded-xl
      font-semibold
      shadow
      hover:scale-105
      transition
      mr-1
      md-2
    "
    style={{ minWidth: 0 }}
  >
    ⚙️ {t("Settings")}
  </button>
</div>
    </header>

    {/* Stats Cards */}
    <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5 mb-0">
      <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl bg-gradient-to-tr from-indigo-100/70 to-indigo-300/80 dark:from-blue-900/40 dark:to-indigo-700/30 shadow">
        <span className="text-indigo-600 dark:text-indigo-300 text-xl sm:text-2xl font-bold">{orders.length}</span>
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-200">{t("Orders")}</span>
      </div>
      <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl bg-gradient-to-tr from-yellow-100 to-yellow-300 dark:from-yellow-800/40 dark:to-yellow-600/20 shadow">
        <span className="text-yellow-600 dark:text-yellow-200 text-xl sm:text-2xl font-bold">{orders.filter(o => o.kitchen_status === "preparing").length}</span>
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-200">{t("Preparing")}</span>
      </div>
      <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl bg-gradient-to-tr from-green-100/70 to-green-300/70 dark:from-green-900/30 dark:to-green-600/20 shadow">
        <span className="text-green-600 dark:text-green-200 text-xl sm:text-2xl font-bold">{orders.filter(o => o.kitchen_status === "delivered").length}</span>
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-200">{t("Delivered")}</span>
      </div>
      <div className="flex flex-col items-center justify-center gap-1 py-4 rounded-xl bg-gradient-to-tr from-indigo-100/80 to-purple-200/60 dark:from-indigo-800/30 dark:to-purple-900/30 shadow">
        <span className="text-indigo-600 dark:text-indigo-200 text-xl sm:text-2xl font-bold">{selectedIds.length}</span>
        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-200">{t("To Compile")}</span>
      </div>
    </section>

    {/* Action Buttons */}
    <section className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:justify-center sm:items-center mb-1 w-full">
      <button
        onClick={() => updateKitchenStatus("preparing")}
        disabled={selectedIds.length === 0}
        className="py-3 w-full rounded-xl shadow bg-yellow-400 hover:bg-yellow-500 text-white font-bold text-base transition disabled:opacity-50"
      >
        {t("Preparing")}
      </button>
      <button
        onClick={() => updateKitchenStatus("delivered")}
        disabled={selectedIds.length === 0}
        className="py-3 w-full rounded-xl shadow bg-gray-800 hover:bg-gray-900 text-white font-bold text-base transition disabled:opacity-50"
      >
        {t("Delivered")}
      </button>
      <button
        onClick={openCompileModal}
        disabled={selectedIds.length === 0}
        className="py-3 w-full rounded-xl shadow bg-green-600 hover:bg-green-700 text-white font-bold text-base transition disabled:opacity-50"
      >
        {t("Compile")}
      </button>
      <button
        onClick={() => setShowTimerModal(true)}
        className="py-3 w-full rounded-xl shadow bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-base transition"
      >
        ⏱ {t("Timer")}
      </button>
    </section>

    {/* Orders */}
    <section className="flex-1">
      {Object.keys(groupedKitchenOrders).length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8 text-base sm:text-lg">
          {t("No kitchen orders yet.")}
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(groupedKitchenOrders).map(([groupKey, group]) => {
            const items = group.items;
            const first = group.header;
            const isPhoneOrPacketOrder = group.type === "phone" || group.type === "packet";

            const allSelected = items.every(item => selectedIds.includes(item.item_id));
            return (
              <div
  key={groupKey}
  className={`p-4 rounded-2xl border shadow-lg transition hover:scale-[1.01] flex flex-col gap-2
    ${
      (() => {
        // Consistent color for each table/phone group
        const tableColors = [
          "bg-gradient-to-br from-indigo-100 to-blue-200 dark:from-indigo-900 dark:to-blue-900",
          "bg-gradient-to-br from-pink-100 to-red-200 dark:from-pink-900 dark:to-red-900",
          "bg-gradient-to-br from-green-100 to-teal-200 dark:from-green-900 dark:to-teal-900",
          "bg-gradient-to-br from-yellow-100 to-orange-200 dark:from-yellow-900 dark:to-orange-900",
          "bg-gradient-to-br from-purple-100 to-fuchsia-200 dark:from-purple-900 dark:to-fuchsia-900",
          "bg-gradient-to-br from-cyan-100 to-sky-200 dark:from-cyan-900 dark:to-sky-900",
        ];
        // Use table number or phone key to pick color
        let idx = 0;
        if (group.type === "table" && first.table_number) {
          idx = parseInt(first.table_number) % tableColors.length;
        } else if (group.type === "phone") {
          // Hash to color
          let h = 0;
          for (let i = 0; i < groupKey.length; i++) h += groupKey.charCodeAt(i);
          idx = h % tableColors.length;
        }
        return tableColors[idx];
      })()
    }
    border-white/40 dark:border-gray-700
  `}
>

{/* Card header */}
<div
  onClick={() => toggleSelectGroup(items)}
  className={`
    cursor-pointer flex items-center gap-3 font-bold text-base sm:text-lg mb-1
    rounded-2xl px-4 py-2 shadow-md transition
    ${
      group.type === "table"
        ? "bg-gradient-to-r from-indigo-500 via-blue-400 to-purple-500 text-white"
        : group.type === "phone"
        ? "bg-gradient-to-r from-blue-300 to-blue-500 text-white"
        : group.type === "packet" && first.external_id
        ? "bg-gradient-to-r from-pink-400 via-orange-400 to-yellow-300 text-white"
        : "bg-gradient-to-r from-yellow-300 via-orange-300 to-orange-500 text-white"
    }
    border-2 border-white/80 dark:border-indigo-800/60 select-none
    ${allSelected ? "ring-2 ring-accent scale-105" : ""}
  `}
>
  {/* Icon and Platform */}
  <span className="text-2xl">
    {group.type === "table" && "🍽"}
    {group.type === "phone" && "📞"}
    {group.type === "packet" && "🛵"}
  </span>

  {/* Info */}
  <span className="flex flex-col gap-0.5 flex-1 min-w-0">
    {group.type === "table" && (
      <span className="font-black text-lg truncate">{t("Table")} {first.table_number}</span>
    )}
    {(group.type === "phone" || group.type === "packet") && (
      <>
        <span className="truncate max-w-[160px]">
          {first.customer_name || first.customer_phone || t("No Name")}
        </span>
        {first.customer_phone && (
          <span className="text-xs text-blue-100">{first.customer_phone}</span>
        )}
        {first.customer_address && (
          <span className="text-xs text-green-100 truncate max-w-[180px]">📍 {first.customer_address}</span>
        )}
      </>
    )}
  </span>

  {/* Platform Badges */}
  {group.type === "packet" && first.external_id && (
    <span className="ml-2 flex items-center gap-1 px-2 py-1 rounded-xl bg-white/80">
      {/* Yemeksepeti SVG Logo */}
      <span className="inline-flex w-5 h-5">
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="#FF0058"/>
          <path d="M8 17.5C9 13 20 13 21 17.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          <ellipse cx="13" cy="21" rx="1.5" ry="1.5" fill="#fff"/>
          <ellipse cx="19" cy="21" rx="1.5" ry="1.5" fill="#fff"/>
        </svg>
      </span>
      <span className="text-xs font-extrabold text-pink-700">Yemeksepeti</span>
    </span>
  )}
  {group.type === "packet" && !first.external_id && (
    <span className="ml-2 px-2 py-1 rounded-xl bg-orange-100 text-orange-700 text-xs font-extrabold">
      Packet
    </span>
  )}
  {group.type === "phone" && (
    <span className="ml-2 px-2 py-1 rounded-xl bg-blue-100 text-blue-700 text-xs font-extrabold">
      Phone
    </span>
  )}
</div>


                {/* Items in group */}
                <div className="flex flex-col gap-6">
                  {items.map(item => {
                    const itemId = item.item_id;
                    const isSelected = selectedIds.includes(itemId);
                    const isPreparing = item.kitchen_status === "preparing";
                    const parsedExtras = safeParse(item.extras);
                    return (
                     <div
  key={itemId}
  onClick={() => toggleSelect(itemId)}
  className={`flex flex-col gap-1 rounded-lg border shadow px-4 py-3 mx-auto max-w-[420px] w-full cursor-pointer transition
    ${
      item.kitchen_status === "new"
        ? "bg-blue-50 dark:bg-blue-900/40"
        : item.kitchen_status === "preparing"
        ? "bg-yellow-50 dark:bg-yellow-900/40"
        : "bg-green-50 dark:bg-green-900/40"
    }
    ${isSelected ? "ring-2 ring-indigo-400 scale-80" : ""}
  `}
>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelect(itemId)}
                            className="w-5 h-5 accent-indigo-600"
                          />
                          <span className="font-semibold text-base">{item.product_name}</span>
                          {isPreparing && (
                            <span className="ml-2 animate-spin text-yellow-600 text-lg">⏳</span>
                          )}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          {t("Qty")}: <b>{item.quantity}</b>
                        </div>
                        {item.note && (
                          <div className="text-xs text-yellow-900 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800 rounded px-2 py-1">
                            📝 {item.note}
                          </div>
                        )}
                        {parsedExtras.length > 0 && (
                          <ul className="text-xs sm:text-sm list-disc pl-5 text-gray-600 dark:text-gray-200">
                            {parsedExtras.map((ex, idx) => (
                              <li key={idx}>➕ {ex.name} x{ex.quantity}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>

    {/* --- Modals --- */}
    {showModal && compiled && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative w-full max-w-xl bg-white/95 dark:bg-gray-900/95 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 border border-white/20 dark:border-white/10">
          <button
            onClick={closeCompileModal}
            className="absolute top-3 right-3 bg-white/80 dark:bg-gray-800/80 rounded-full p-2 shadow hover:scale-110 transition"
            aria-label="Close"
          >
            <span className="text-xl">✖️</span>
          </button>
          <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-400 text-transparent bg-clip-text flex items-center gap-2">
            🧮 {t("Compiled Control Center")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 shadow-inner min-h-[100px]">
              <div className="flex items-center gap-2 mb-2 text-indigo-700 dark:text-indigo-200 font-semibold">
                📦 {t("Products")}
              </div>
              {compiled.productsByCategory && Object.keys(compiled.productsByCategory).length === 0 ? (
                <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(compiled.productsByCategory).map(([category, products]) => (
                    <div key={category}>
                      <div className="font-bold text-md text-indigo-600 dark:text-indigo-200 mb-1">{category}</div>
                      <ul className="ml-2 space-y-1">
                        {Object.entries(products).map(([name, qty]) => (
                          <li key={name} className="flex justify-between">
                            <span>{name}</span>
                            <span className="font-bold text-indigo-700 dark:text-indigo-200">{qty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-2xl p-4 bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-800 shadow-inner min-h-[100px]">
              <div className="flex items-center gap-2 mb-2 text-pink-700 dark:text-pink-200 font-semibold">
                🥕 {t("Ingredients")}
              </div>
              {Object.keys(compiled.ingredients).length === 0 ? (
                <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
              ) : (
                <ul className="space-y-1">
                  {Object.entries(compiled.ingredients).map(([name, qty]) => (
                    <li key={name} className="flex justify-between">
                      <span>{name}</span>
                      <span className="font-bold text-pink-600 dark:text-pink-200">{qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button
            className="mt-2 px-6 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:brightness-110 text-white text-lg font-semibold rounded-2xl shadow-lg transition"
            onClick={closeCompileModal}
          >
            {t("Close")}
          </button>
        </div>
      </div>
    )}

    {/* Timer Modal */}
    {showTimerModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-xs sm:max-w-md flex flex-col gap-3">
          <h2 className="text-lg font-bold text-indigo-700 dark:text-indigo-300">⏱ {t("Kitchen Timers")}</h2>
          <div className="flex flex-col sm:flex-row gap-2 items-center mb-2">
            <input
              className="p-2 rounded border border-gray-300 dark:bg-gray-900 dark:border-gray-700 text-sm flex-1"
              type="text"
              placeholder={t("Timer Name (e.g. Fries 1)")}
              value={newTimerName}
              onChange={e => setNewTimerName(e.target.value)}
            />
            <input
              className="p-2 rounded border border-gray-300 dark:bg-gray-900 dark:border-gray-700 w-16 text-sm"
              type="number"
              min={1}
              max={3600}
              value={newTimerSeconds}
              onChange={e => setNewTimerSeconds(Number(e.target.value))}
            />
            <span className="text-xs text-gray-600 dark:text-gray-300">s</span>
            <button
              className="px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:brightness-110 transition"
              onClick={async () => {
                if (!newTimerName || newTimerSeconds < 1) return;
                const res = await fetch("/api/kitchen-timers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: newTimerName,
                    secondsLeft: newTimerSeconds,
                    total: newTimerSeconds,
                    running: false,
                  }),
                });
                const saved = await res.json();
                setTimers(prev => [...prev, { ...saved, secondsLeft: saved.seconds_left, total: saved.total_seconds }]);
                setNewTimerName("");
                setNewTimerSeconds(60);
              }}
            >
              ➕ {t("Add")}
            </button>
          </div>
          <div className="flex gap-2 mb-2">
            {[30, 60, 180].map(s => (
              <button
                key={s}
                className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs hover:bg-blue-200"
                onClick={() => setNewTimerSeconds(s)}
              >
                {s < 60 ? `${s}s` : `${s/60}m`}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {timers.length === 0 && (
              <div className="text-gray-400 text-sm">{t("No timers running.")}</div>
            )}
            {timers.map(timer => (
              <div
                key={timer.id}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-xl
                  ${timer.secondsLeft === 0
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                    : "bg-gray-100 dark:bg-gray-700"}
                  shadow
                `}
              >
                <span className="font-bold flex-1">{timer.name}</span>
                <span className={`font-mono text-lg w-14 text-center ${timer.secondsLeft === 0 ? "line-through" : ""}`}>
                  {Math.floor(timer.secondsLeft / 60).toString().padStart(2, "0")}:{(timer.secondsLeft % 60).toString().padStart(2, "0")}
                </span>
                {timer.secondsLeft === 0 ? (
                  <span className="text-green-600 font-semibold">{t("Done")}</span>
                ) : timer.running ? (
                  <button
                    className="text-yellow-600 hover:text-yellow-800 px-1"
                    title={t("Pause")}
                    onClick={async () => {
                      setTimers(timers => timers.map(t => t.id === timer.id ? { ...t, running: false } : t));
                      await fetch("/api/kitchen-timers", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: timer.id,
                          name: timer.name,
                          secondsLeft: timer.secondsLeft,
                          total: timer.total,
                          running: false,
                        }),
                      });
                    }}
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    className="text-green-600 hover:text-green-800 px-1"
                    title={t("Resume")}
                    onClick={async () => {
                      setTimers(timers => timers.map(t => t.id === timer.id ? { ...t, running: true } : t));
                      await fetch("/api/kitchen-timers", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: timer.id,
                          name: timer.name,
                          secondsLeft: timer.secondsLeft,
                          total: timer.total,
                          running: true,
                        }),
                      });
                    }}
                  >
                    ▶️
                  </button>
                )}
                <button
                  className="text-red-500 hover:text-red-700 px-1"
                  title="Delete"
                  onClick={async () => {
                    await fetch(`/api/kitchen-timers/${timer.id}`, { method: "DELETE" });
                    setTimers(timers => timers.filter(t => t.id !== timer.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            className="mt-3 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white rounded"
            onClick={() => setShowTimerModal(false)}
          >
            {t("Close")}
          </button>
        </div>
      </div>
    )}


    {/* === Settings Modal (existing) === */}
 {showSettings && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-gradient-to-br from-white/90 to-indigo-50/80 dark:from-[#17172b]/90 dark:to-[#222244]/90 shadow-2xl border border-white/20 dark:border-indigo-900/30 p-8">

      {/* Close Button */}
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-gradient-to-r from-indigo-400 to-purple-500 text-white shadow-lg hover:scale-110 hover:brightness-110 transition-all z-10"
        onClick={() => setShowSettings(false)}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Modal Title */}
      <h2 className="text-2xl font-bold text-indigo-700 dark:text-indigo-200 mb-4 tracking-tight">
        🍽️ {t("Kitchen Settings")}
      </h2>

      {/* Exclude Ingredients First */}
      <div className="mb-7">
        <div className="font-semibold text-gray-800 dark:text-white mb-2">
          {t("Exclude Ingredients from Compile:")}
        </div>
        <div className="max-h-24 overflow-y-auto rounded-lg bg-white/50 dark:bg-gray-900/30 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border border-white/10 dark:border-white/10">
          {allIngredients.length === 0 ? (
            <div className="text-gray-400">{t("No ingredients found")}</div>
          ) : (
            allIngredients.map((ingredient) => (
              <label
                key={ingredient}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={excludedIngredients.includes(ingredient)}
                  onChange={() => {
                    let updated;
                    setExcludedIngredients(prev => {
                      updated = prev.includes(ingredient)
                        ? prev.filter(ing => ing !== ingredient)
                        : [...prev, ingredient];
                      fetch("/api/kitchen/compile-settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          excludedCategories,
                          excludedItems,
                          excludedIngredients: updated
                        }),
                      });
                      return updated;
                    });
                  }}
                  className="accent-indigo-600 w-4 h-4"
                />
                <span className="font-medium">{ingredient}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Exclude Items */}
      <div>
        <div className="font-semibold text-gray-800 dark:text-white mb-2">
          {t("Exclude Items from Kitchen:")}
        </div>
        <div className="space-y-5">
          {Array.from(new Set(products.map(p => p.category))).filter(Boolean).map(category => (
            <div
              key={category}
              className="rounded-2xl border border-white/20 dark:border-indigo-800/30 shadow-xl bg-gradient-to-br from-indigo-100/80 to-purple-100/80 dark:from-indigo-900/70 dark:to-purple-900/50 p-4 backdrop-blur-lg group transition-all hover:scale-[1.01] hover:border-accent"
            >
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-accent transition-all"
                  checked={products.filter(p => p.category === category).every(p => excludedItems?.includes(p.id))}
                  onChange={() => {
                    const catProducts = products.filter(p => p.category === category).map(p => p.id);
                    setExcludedItems(prev => {
                      const allChecked = catProducts.every(id => prev.includes(id));
                      const updated = allChecked
                        ? prev.filter(id => !catProducts.includes(id))
                        : Array.from(new Set([...prev, ...catProducts]));
                      fetch("/api/kitchen/compile-settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          excludedCategories,
                          excludedItems: updated,
                          excludedIngredients
                        }),
                      });
                      return updated;
                    });
                  }}
                />
                <span className="font-bold text-lg bg-gradient-to-r from-indigo-600 via-blue-500 to-purple-500 bg-clip-text text-transparent drop-shadow">
                  {category}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products.filter(p => p.category === category).map(product => (
                  <label
                    key={product.id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 shadow bg-white/80 dark:bg-gray-900/60 border border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-800/40 transition-all"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-purple-600"
                      checked={excludedItems?.includes(product.id)}
                      onChange={() => {
                        setExcludedItems(prev => {
                          const updated = prev.includes(product.id)
                            ? prev.filter(id => id !== product.id)
                            : [...prev, product.id];
                          fetch("/api/kitchen/compile-settings", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              excludedCategories,
                              excludedItems: updated,
                              excludedIngredients
                            }),
                          });
                          return updated;
                        });
                      }}
                    />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-100">
                      {product.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
)}



  </div>
);



}
