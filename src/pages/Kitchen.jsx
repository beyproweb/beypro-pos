import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import socket from "../utils/socket"; // adjust path as needed!
import secureFetch from "../utils/secureFetch";
import { useHeader } from "../context/HeaderContext";

const API_URL = import.meta.env.VITE_API_URL || "";
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
  const { setHeader } = useHeader();
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timers, setTimers] = useState([]);
const [newTimerName, setNewTimerName] = useState("");
const [newTimerSeconds, setNewTimerSeconds] = useState(60);
const [excludedCategories, setExcludedCategories] = useState([]);
const [excludedItems, setExcludedItems] = useState([]);
const [prepStart, setPrepStart] = useState(null);
// 🕒 Track when each order first arrived in the kitchen (to start timer immediately)
const [orderTimers, setOrderTimers] = useState({});
const [drivers, setDrivers] = useState([]);
const [recentlyAssigned, setRecentlyAssigned] = useState({});
const audioCtxRef = useRef(null);
const prevOrdersRef = useRef([]);

const normalizeTimerRow = useCallback((row) => ({
  id: row.id,
  name: row.name,
  secondsLeft: Number(row.seconds_left ?? row.secondsLeft ?? 0),
  total: Number(row.total_seconds ?? row.total ?? 0),
  running: Boolean(row.running),
}), []);

const playAssignmentChime = useCallback(async () => {
  try {
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContextConstructor();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // ignore
      }
    }
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  } catch (err) {
    console.warn("🔕 Unable to play notification sound:", err);
  }
}, []);

useEffect(() => {
  return () => {
    if (audioCtxRef.current && typeof audioCtxRef.current.close === "function") {
      audioCtxRef.current.close();
    }
  };
}, []);

// 🕒 Always start timers as soon as the order appears in kitchen
useEffect(() => {
  if (!orders || orders.length === 0) return;

  setOrderTimers(prev => {
    const updated = { ...prev };
    const now = Date.now();

    orders.forEach(o => {
      if (!updated[o.order_id]) {
        // Convert backend UTC -> local timestamp safely
        let createdAt = now;
        try {
          if (o.created_at) {
            // ❌ remove timezone math — Date() already converts correctly to local time
            createdAt = new Date(o.created_at).getTime();
          }
        } catch {
          createdAt = now;
        }

        updated[o.order_id] = createdAt;
      }
    });

    // remove old timers
    for (const id of Object.keys(updated)) {
      if (!orders.some(o => o.order_id == id)) delete updated[id];
    }

    console.log("⏱ Final fixed orderTimers:", updated);
    return updated;
  });
}, [orders]);





useEffect(() => {
  if (orders.length) {
    console.log("🕒 First order created_at:", orders[0]?.created_at);
  }
}, [orders]);

useEffect(() => {
  let timer;
  if (prepStart) {
    timer = setInterval(() => {
      // Trigger rerender every second
      setPrepStart((prev) => (prev ? new Date(prev) : null));
    }, 1000);
  }
  return () => clearInterval(timer);
}, [prepStart]);

// Live refresh for header timers every second
// ⏱ re-render once per second so header timers update live
useEffect(() => {
  const i = setInterval(() => {
    // lightweight state bump to trigger render
    setOrders((o) => o);
  }, 1000);
  return () => clearInterval(i);
}, []);



// List any ingredients to always exclude from compile (empty means include all)
const [excludedIngredients, setExcludedIngredients] = useState([]);
  // Only allow users with "settings" permission


const productIdToCategory = {};
products.forEach(p => {
  productIdToCategory[p.id] = p.category || "Uncategorized";
});

useEffect(() => {
  const actionsNode = (
    <button
      type="button"
      onClick={() => setShowSettings(true)}
      className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-indigo-400/50 bg-white/70 text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-white dark:bg-zinc-800/70 dark:text-indigo-200 dark:hover:bg-indigo-700/20 dark:focus:ring-offset-zinc-900 transition"
      title={t("Kitchen Settings")}
    >
      <span className="text-lg">⚙️</span>
    </button>
  );

  setHeader((prev) => ({
    ...prev,
    actions: actionsNode,
  }));

  return () =>
    setHeader((prev) => ({
      ...prev,
      actions: null,
    }));
}, [setHeader, setShowSettings, t]);

// Fetch all 3 on mount
useEffect(() => {
  (async () => {
    try {
      const data = await secureFetch("kitchen/compile-settings");
      setExcludedIngredients(data.excludedIngredients || []);
      setExcludedCategories(data.excludedCategories || []);
      setExcludedItems(data.excludedItems || []);
    } catch {
      setExcludedIngredients([]);
      setExcludedCategories([]);
      setExcludedItems([]);
    }
  })();
}, []);

useEffect(() => {
  (async () => {
    try {
      const data = await secureFetch("kitchen/compile-settings");
      setExcludedIngredients(data.excludedIngredients || []);
    } catch {
      setExcludedIngredients([]);
    }
  })();
}, []);

useEffect(() => {
  (async () => {
    try {
      const list = await secureFetch("/kitchen-timers");
      if (Array.isArray(list)) {
        setTimers(list.map(normalizeTimerRow));
      } else {
        setTimers([]);
      }
    } catch (err) {
      console.warn("⚠️ Failed to load kitchen timers:", err);
      setTimers([]);
    }
  })();
}, [normalizeTimerRow]);


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
  const interval = setInterval(() => {
    setTimers(prev =>
      prev.map(timer => {
        if (!timer.running) return timer;
        if (timer.secondsLeft <= 0) return timer;

        const newSeconds = timer.secondsLeft - 1;

        if (newSeconds === 0) {
          secureFetch("/kitchen-timers", {
            method: "POST",
            body: JSON.stringify({
              id: timer.id,
              name: timer.name,
              secondsLeft: timer.total,
              total: timer.total,
              running: false,
            }),
          });
          return { ...timer, secondsLeft: timer.total, running: false };
        }

        secureFetch("/kitchen-timers", {
          method: "POST",
          body: JSON.stringify({
            id: timer.id,
            name: timer.name,
            secondsLeft: newSeconds,
            total: timer.total,
            running: timer.running,
          }),
        });

        return { ...timer, secondsLeft: newSeconds };
      })
    );
  }, 1000);
  return () => clearInterval(interval);
}, []);



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
await secureFetch("/kitchen-timers", {
  method: "POST",
  body: JSON.stringify({
    id: timer.id,
    name: timer.name,
    secondsLeft: timer.secondsLeft,
    total: timer.total,
    running: timer.running,
  }),
});

};

const pauseTimer = async (timer) => {
  setTimers(prev =>
    prev.map(t => (t.id === timer.id ? { ...t, running: false } : t))
  );
  await secureFetch("/kitchen-timers", {
    method: "POST",
    body: JSON.stringify({
      id: timer.id,
      name: timer.name,
      secondsLeft: timer.secondsLeft,
      total: timer.total,
      running: false,
    }),
  });
};

const resumeTimer = async (timer) => {
  setTimers(prev =>
    prev.map(t => (t.id === timer.id ? { ...t, running: true } : t))
  );
  await secureFetch("/kitchen-timers", {
    method: "POST",
    body: JSON.stringify({
      id: timer.id,
      name: timer.name,
      secondsLeft: timer.secondsLeft,
      total: timer.total,
      running: true,
    }),
  });
};

const deleteTimer = async (timer) => {
  setTimers(prev => prev.filter(t => t.id !== timer.id));
  await secureFetch(`/kitchen-timers/${timer.id}`, {
    method: "DELETE",
  });
};

const formatTimerValue = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const activeTimers = useMemo(
  () => timers.filter((t) => t.secondsLeft > 0 || t.running),
  [timers]
);


  // Always use full URL for backend fetches!
const fetchKitchenOrders = async () => {
  try {
    const data = await secureFetch("/kitchen-orders");

    // ✅ Include TAKEAWAY orders in the kitchen view
    const active = data.filter(
      (item) =>
        item.kitchen_status !== "delivered" &&
        item.kitchen_status !== null &&
        item.kitchen_status !== "" &&
        ["table", "packet", "phone", "takeaway"].includes(
          String(item.order_type || "").toLowerCase()
        )
    );

    console.log("🍽️ Active Kitchen Orders:", active.map(i => ({
      id: i.item_id,
      status: i.kitchen_status,
      type: i.order_type,
      table: i.table_number,
    })));

    setOrders(active);
  } catch (err) {
    console.error("❌ Fetch kitchen orders failed:", err);
  }
};



useEffect(() => {
  (async () => {
    try {
      const list = await secureFetch("/staff/drivers");
      if (Array.isArray(list)) {
        setDrivers(list);
      } else if (list?.drivers && Array.isArray(list.drivers)) {
        setDrivers(list.drivers);
      } else {
        setDrivers([]);
      }
    } catch (err) {
      console.warn("⚠️ Failed to fetch drivers for kitchen view:", err);
      setDrivers([]);
    }
  })();
}, []);

useEffect(() => {
  if (!Array.isArray(drivers) || drivers.length === 0) return;

  fetchKitchenOrders();
  const interval = setInterval(fetchKitchenOrders, 10000);
  return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [drivers]); // <-- close it properly

// ✅ Now start the next useEffect separately
useEffect(() => {
  if (orders.length) {
    console.log("🍟 Kitchen orders:", orders);
  }
}, [orders]);



  // Fetch all products at mount (always use full URL)
useEffect(() => {
  (async () => {
    try {
      const data = await secureFetch("products");
      setProducts(data);
    } catch {
      setProducts([]);
    }
  })();
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

    console.log(`🟢 ${status.toUpperCase()} button clicked`, {
      selectedIds,
      ordersCount: orders.length,
    });

    // ✅ correct endpoint
const res = await secureFetch("/order-items/kitchen-status", {
  method: "PUT",
  body: JSON.stringify({ ids: idsToUpdate, status }),
});




    console.log("✅ Kitchen status update response:", res);

    // Refresh data
    await fetchKitchenOrders();

  } catch (err) {
    console.error("❌ Failed to update kitchen status:", err);
  }
};


  // --- Compile Ingredients Logic ---
function compileTotals(selectedOrders) {
  const totalIngredients = {};
  const productsByCategory = {};
  const extrasSummary = {};
  const notesSummary = [];

  const productIdToCategory = {};
  products.forEach(p => {
    productIdToCategory[p.id] = p.category || "Uncategorized";
  });

  selectedOrders.forEach((item) => {
    const category = productIdToCategory[item.product_id] || item.product_category || "Uncategorized";
    if (!productsByCategory[category]) productsByCategory[category] = {};

    // Products
    if (item.product_name) {
      productsByCategory[category][item.product_name] =
        (productsByCategory[category][item.product_name] || 0) + (item.quantity || 1);
    }

    // Ingredients
    let ingredients = [];
    try {
      ingredients = Array.isArray(item.ingredients) ? item.ingredients : JSON.parse(item.ingredients || "[]");
    } catch { ingredients = []; }
    ingredients.forEach(ing => {
      if (!ing?.ingredient || excludedIngredients.includes(ing.ingredient)) return;
      totalIngredients[ing.ingredient] =
        (totalIngredients[ing.ingredient] || 0) + (Number(ing.quantity) || 1) * (item.quantity || 1);
    });

    // ✅ Extras
    let extras = [];
    try {
      extras = Array.isArray(item.extras) ? item.extras : JSON.parse(item.extras || "[]");
    } catch { extras = []; }
    extras.forEach(ex => {
      if (!ex?.name) return;
      const key = ex.name;
      extrasSummary[key] = (extrasSummary[key] || 0) + (Number(ex.quantity) || 1);
    });

    // ✅ Notes
    if (item.note) {
      notesSummary.push(`• ${item.product_name}: ${item.note}`);
    }
  });

  return { ingredients: totalIngredients, productsByCategory, extrasSummary, notesSummary };
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
  const normalizedType = String(item.order_type || "").toLowerCase();

  if (["phone", "packet", "takeaway"].includes(normalizedType)) {
    const identifier =
      item.order_id ||
      item.customer_name ||
      item.customer_phone ||
      item.pickup_time ||
      "";
    const key = `${normalizedType}-${identifier}`;
    if (!acc[key]) acc[key] = { type: normalizedType, items: [], header: item };
    acc[key].items.push(item);
  } else {
    const key = `table-${item.table_number}`;
    if (!acc[key]) acc[key] = { type: "table", items: [], header: item };
    acc[key].items.push(item);
  }
  return acc;
}, {});




return (
  <div className="min-h-screen px-2 pt-0 pb-3 sm:px-6 sm:pt-0 sm:pb-3 flex flex-col gap-4 sm:gap-8 relative">

    {/* Action Buttons */}
 <div className="sticky top-0 sm:top-0 z-30 bg-[#f7f9fc]/95 dark:bg-zinc-900/95 backdrop-blur border border-slate-200/70 dark:border-zinc-800/70 border-t-0 border-l-0 border-r-0 rounded-none sm:rounded-none px-3 py-3 shadow-sm">
 <section className="grid grid-cols-2 gap-3 sm:flex sm:flex-row sm:justify-center sm:items-center w-full relative z-40">
  <button
    onClick={() => {
      console.debug("🟡 Preparing button clicked", {
        selectedIds,
        ordersCount: orders.length,
      });
      updateKitchenStatus("preparing");
    }}
    disabled={selectedIds.length === 0}
    className="py-3 w-full rounded-xl shadow-sm bg-slate-800 hover:bg-slate-700 text-white font-semibold text-base transition disabled:opacity-40"
  >
    {t("Preparing")}
  </button>

  <button
    onClick={() => {
      console.debug("🟢 Delivered button clicked", {
        selectedIds,
        ordersCount: orders.length,
      });
      updateKitchenStatus("delivered");
    }}
    disabled={selectedIds.length === 0}
    className="py-3 w-full rounded-xl shadow-sm bg-slate-600 hover:bg-slate-500 text-white font-semibold text-base transition disabled:opacity-40"
  >
    {t("Delivered")}
  </button>

  <button
    onClick={openCompileModal}
    disabled={selectedIds.length === 0}
    className="py-3 w-full rounded-xl shadow-sm bg-slate-500 hover:bg-slate-400 text-white font-semibold text-base transition disabled:opacity-40"
  >
    {t("Compile")}
  </button>

  <button
    onClick={() => setShowTimerModal(true)}
    className="py-3 w-full rounded-xl shadow-sm bg-[#49c0c0] hover:bg-[#3ea9a9] text-slate-900 font-semibold text-base transition"
  >
    ⏱ {t("Timer")}
  </button>
</section>
 </div>


    {activeTimers.length > 0 && (
      <section className="mt-3 sm:mt-4">
        <div className="rounded-2xl border border-slate-200/70 dark:border-zinc-800/70 bg-white dark:bg-zinc-900/60 shadow-sm px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-300">
                {t("Active Timers")}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t("Tap any timer to pause, resume, or adjust.")}
              </p>
            </div>
            <button
              onClick={() => setShowTimerModal(true)}
              className="self-start inline-flex items-center gap-2 rounded-full border border-slate-300 dark:border-zinc-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-zinc-500 transition"
            >
              ⏱ {t("Manage Timers")}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-stretch overflow-x-auto pb-1">
            {activeTimers.map((timer) => {
              const isRunning = timer.running;
              const isPaused = !timer.running && timer.secondsLeft !== timer.total;
              const elapsed = timer.total - timer.secondsLeft;
              const progress = timer.total > 0 ? Math.min(100, Math.max(0, (elapsed / timer.total) * 100)) : 0;
              const statusLabel = isRunning
                ? t("Running")
                : isPaused
                ? t("Paused")
                : t("Ready");
              const statusTone = isRunning
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : isPaused
                ? "bg-amber-100 text-amber-700 border border-amber-200"
                : "bg-slate-200 text-slate-600 border border-slate-300";

              return (
                <div
                  key={timer.id}
                  className="min-w-[230px] sm:min-w-[260px] flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-zinc-700 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-zinc-900 dark:to-zinc-800 px-4 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[160px]">
                      {timer.name}
                    </h4>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full ${statusTone}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                        {formatTimerValue(Math.max(0, (timer.total || 0) - (timer.secondsLeft || 0)))}
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {t("Total")} {formatTimerValue(timer.total)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isRunning ? (
                        <button
                          onClick={() => pauseTimer(timer).catch(() => {})}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 transition"
                          title={t("Pause")}
                        >
                          ⏸
                        </button>
                      ) : (
                        <button
                          onClick={() => resumeTimer(timer).catch(() => {})}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition"
                          title={t("Resume")}
                        >
                          ▶️
                        </button>
                      )}
                      <button
                        onClick={() => deleteTimer(timer).catch(() => {})}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-rose-500 border border-rose-200 hover:bg-rose-50 transition"
                        title={t("Delete")}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-200/70 dark:bg-zinc-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#49c0c0] via-[#8f7cf8] to-[#4130b5] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    )}


   {/* Orders */}
<section className="flex-1 mt-4 sm:mt-6">
  {Object.keys(groupedKitchenOrders).length === 0 ? (
    <div className="text-center text-slate-500 dark:text-slate-400 py-10 text-base sm:text-lg">
      {t("No kitchen orders yet.")}
    </div>
  ) : (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(groupedKitchenOrders).map(([groupKey, group]) => {
        const items = group.items;
        const first = group.header;
        const ordersArePacket = group.type === "packet";
        const ordersArePhone = group.type === "phone";
        const ordersAreTakeaway = group.type === "takeaway";

        // ✨ 4-tone palette matching POS
        const groupTheme = ordersArePacket
          ? {
              container: "border-l-[#3FA7D6]",
              header: "bg-[#E8F7FB] text-slate-800",
              badge: "bg-[#CBEFFC] text-[#0F5177]",
            }
          : ordersArePhone
          ? {
              container: "border-l-[#7C6EF6]",
              header: "bg-[#EFEDFF] text-slate-800",
              badge: "bg-[#DCD6FF] text-[#3B33A8]",
            }
          : ordersAreTakeaway
          ? {
              container: "border-l-[#FB923C]",
              header: "bg-[#FFF0E5] text-slate-800",
              badge: "bg-[#FFE0CC] text-[#9A3412]",
            }
          : {
              container: "border-l-[#14B8A6]",
              header: "bg-[#EBFDFB] text-slate-800",
              badge: "bg-[#CFFAF5] text-[#0F766E]",
            };

        const allSelected = items.every((item) =>
          selectedIds.includes(item.item_id)
        );

        return (
          <div
            key={groupKey}
            className={`p-4 rounded-2xl border border-slate-200 dark:border-zinc-700 
            bg-white dark:bg-zinc-900/50 shadow-md hover:shadow-lg 
            transition hover:scale-[1.01] flex flex-col gap-3 border-l-[6px] ${groupTheme.container}`}
          >
            {/* === Card Header === */}
            <div
              onClick={() => toggleSelectGroup(items)}
              className={`cursor-pointer flex items-center gap-3 font-semibold 
              text-base sm:text-lg mb-1 rounded-xl px-4 py-2 border border-slate-200 
              ${groupTheme.header} dark:bg-zinc-800 dark:text-slate-200 
              transition select-none ${allSelected ? "ring-2 ring-[#14B8A6]" : ""}`}
            >
              <span className="text-2xl">
                {group.type === "table" && "🍽"}
                {group.type === "phone" && "📞"}
                {group.type === "packet" && "🛵"}
                {group.type === "takeaway" && "🥡"}
              </span>

              <span className="flex items-center justify-between flex-1 min-w-0">
                <div className="flex flex-col min-w-0">
                  {group.type === "table" && (
                    <span className="font-black text-lg truncate">
                      {t("Table")} {first.table_number}
                    </span>
                  )}

                  {(group.type === "phone" || group.type === "packet") && (
                    <>
                      <span className="truncate max-w-[160px] font-medium">
                        {first.customer_name || first.customer_phone || t("No Name")}
                      </span>
                      {first.customer_phone && (
                        <span className="text-xs text-slate-500">{first.customer_phone}</span>
                      )}
                      {first.customer_address && (
                        <span className="text-xs text-slate-400 truncate max-w-[180px]">
                          📍 {first.customer_address}
                        </span>
                      )}
                      {first.driver_name && (
                        <span className="text-xs font-semibold text-[#1E3A8A] dark:text-indigo-200">
                          🚗 {first.driver_name}
                        </span>
                      )}
                    </>
                  )}

                  {ordersAreTakeaway && (
                    <>
                      <span className="font-black text-lg truncate">
                        {t("Take Away")}
                      </span>
                      {first.customer_name && (
                        <span className="text-sm text-slate-700">
                          👤 {first.customer_name}
                        </span>
                      )}
                      {first.customer_phone && (
                        <span className="text-xs text-slate-500">
                          📞 {first.customer_phone}
                        </span>
                      )}
                      {first.pickup_time && (
                        (() => {
                          const raw = String(first.pickup_time);
                          const match = raw.match(/(\d{1,2}:\d{2})/);
                          const display = match ? match[1] : raw;
                          return (
                            <span className="text-xs text-orange-600">
                              🕒 {t("Pickup")}: {display}
                            </span>
                          );
                        })()
                      )}
                      {(first.takeaway_notes || first.notes) && (
                        <span className="text-xs text-rose-600 truncate max-w-[220px]">
                          📝 {(first.takeaway_notes || first.notes || "").slice(0, 140)}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* 🕒 Live elapsed timer (counts up from 00:00) */}
                {(() => {
                  const arrival = orderTimers[first.order_id] || Date.now();
                  const elapsed = Math.floor((Date.now() - arrival) / 1000);
                  let text = "";
                  let colorClass = "";
                  const toneCritical = "bg-rose-600";
                  const toneWarning = "bg-amber-500";
                  const toneNormal = "bg-[#14B8A6]";

                  // Always show count-up from 0; color by age thresholds
                  const mins = Math.floor(elapsed / 60);
                  const secs = elapsed % 60;
                  text = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
                  colorClass =
                    elapsed >= 1200
                      ? `${toneCritical} animate-pulse`
                      : elapsed >= 600
                      ? toneWarning
                      : toneNormal;

                  return (
                    <span
                      className={`ml-2 shrink-0 text-xs font-mono px-2 py-0.5 rounded-lg shadow 
                      text-white border border-white/10 ${colorClass}`}
                    >
                      {text}
                    </span>
                  );
                })()}
              </span>

              {/* Badge (hide for takeaway to avoid duplicate label) */}
              {(ordersArePacket || ordersArePhone) && (
                <span
                  className={`ml-2 px-2 py-1 rounded-lg text-xs font-semibold ${groupTheme.badge}`}
                >
                  {ordersArePacket
                    ? `Packet${first.external_id ? " · Online" : ""}`
                    : ordersArePhone
                    ? "Phone"
                    : null}
                </span>
              )}
            </div>

            {/* === Items === */}
            <div className="flex flex-col gap-5">
              {items.map((item) => {
                const itemId = item.item_id;
                const isSelected = selectedIds.includes(itemId);
                const isPreparing = item.kitchen_status === "preparing";
                const parsedExtras = safeParse(item.extras);
                const statusClass = (() => {
                  switch (item.kitchen_status) {
                    case "new":
                      return "bg-[#F0F9FF] border-sky-200 text-slate-800 dark:bg-sky-900/30 dark:border-sky-700/60";
                    case "preparing":
                      return "bg-[#FFF7E6] border-amber-200 text-slate-800 dark:bg-amber-900/30 dark:border-amber-700/60";
                    case "delivered":
                      return "bg-[#ECFDF5] border-emerald-200 text-slate-800 dark:bg-emerald-900/30 dark:border-emerald-700/60";
                    default:
                      return "bg-white border-slate-300 text-slate-800 dark:bg-zinc-900/40 dark:border-zinc-700";
                  }
                })();
                const recentAssignmentClass = recentlyAssigned[itemId]
                  ? "shadow-[0_0_0_2px_rgba(124,110,246,0.5)]"
                  : "";

                return (
                  <div
                    key={itemId}
                    onClick={() => toggleSelect(itemId)}
                    className={`flex flex-col gap-1 rounded-lg border shadow px-4 py-3 
                    transition cursor-pointer ${statusClass} ${recentAssignmentClass} 
                    ${isSelected ? "ring-2 ring-[#14B8A6] scale-[0.99]" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(itemId)}
                        className="w-5 h-5 accent-[#14B8A6]"
                      />
                      <span className="font-semibold text-base truncate">
                        {item.product_name}
                      </span>
                      {isPreparing && (
                        <span className="ml-2 animate-spin text-slate-500 text-lg">⏳</span>
                      )}
                    </div>

                    <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {t("Qty")}: <b>{item.quantity}</b>
                    </div>

                    {item.note && (
                      <div className="text-xs text-slate-700 dark:text-slate-200 
                      bg-slate-100 dark:bg-zinc-800 rounded px-2 py-1">
                        📝 {item.note}
                      </div>
                    )}

                    {parsedExtras.length > 0 && (
                      <ul className="text-xs sm:text-sm list-disc pl-5 text-slate-600 dark:text-slate-200">
                        {parsedExtras.map((ex, idx) => (
                          <li key={idx}>➕ {ex.name} ×{ex.quantity}</li>
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
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            🧮 {t("Compiled Control Center")}
          </h2>
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Products */}
  <div className="rounded-2xl p-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-inner min-h-[100px]">
    <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-semibold">
      📦 {t("Products")}
    </div>
    {compiled.productsByCategory && Object.keys(compiled.productsByCategory).length === 0 ? (
      <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
    ) : (
      <div className="space-y-2">
        {Object.entries(compiled.productsByCategory).map(([category, products]) => (
          <div key={category}>
            <div className="font-bold text-md text-slate-800 dark:text-slate-100 mb-1">{category}</div>
            <ul className="ml-2 space-y-1">
              {Object.entries(products).map(([name, qty]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{qty}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )}
  </div>

  {/* Ingredients */}
  <div className="rounded-2xl p-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-inner min-h-[100px]">
    <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-semibold">
      🥕 {t("Ingredients")}
    </div>
    {Object.keys(compiled.ingredients).length === 0 ? (
      <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
    ) : (
      <ul className="space-y-1">
        {Object.entries(compiled.ingredients).map(([name, qty]) => (
          <li key={name} className="flex justify-between">
            <span>{name}</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{qty}</span>
          </li>
        ))}
      </ul>
    )}
  </div>

  {/* ✅ Extras */}
  <div className="rounded-2xl p-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-inner min-h-[100px]">
    <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-semibold">
      ➕ {t("Extras")}
    </div>
    {Object.keys(compiled.extrasSummary).length === 0 ? (
      <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
    ) : (
      <ul className="space-y-1">
        {Object.entries(compiled.extrasSummary).map(([name, qty]) => (
          <li key={name} className="flex justify-between">
            <span>{name}</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">x{qty}</span>
          </li>
        ))}
      </ul>
    )}
  </div>

  {/* ✅ Notes */}
  <div className="rounded-2xl p-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 shadow-inner min-h-[100px]">
    <div className="flex items-center gap-2 mb-2 text-slate-700 dark:text-slate-200 font-semibold">
      📝 {t("Notes")}
    </div>
    {compiled.notesSummary.length === 0 ? (
      <div className="text-gray-500 dark:text-gray-400">{t("None")}</div>
    ) : (
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {compiled.notesSummary.map((note, idx) => (
          <li key={idx}>{note}</li>
        ))}
      </ul>
    )}
  </div>
</div>

          
        
<div className="grid grid-cols-2 gap-3">
  <button
    onClick={() => {
      updateKitchenStatus("preparing");
      setPrepStart(new Date()); // start timer
    }}
    className="py-3 w-full rounded-xl shadow bg-slate-900 hover:bg-slate-800 text-white font-semibold text-base transition disabled:opacity-50"
    disabled={selectedIds.length === 0}
  >
    {t("Preparing")}
  </button>

<button
  onClick={() => {
    updateKitchenStatus("delivered");
    setPrepStart(null); // reset timer
    setShowModal(false); // ✅ auto-close modal
  }}
  className="py-3 w-full rounded-xl shadow bg-slate-800 hover:bg-slate-700 text-white font-semibold text-base transition disabled:opacity-50"
  disabled={selectedIds.length === 0}
>
  {t("Delivered")}
</button>

</div>

{/* 🧾 Show currently preparing orders */}
<div className="bg-slate-100 dark:bg-zinc-800 rounded-2xl p-3 border border-slate-200 dark:border-zinc-700 shadow-inner">
  <div className="font-semibold text-slate-700 dark:text-slate-200 mb-2">
    {t("Currently Preparing")}
  </div>
  {orders.filter(o => o.kitchen_status === "preparing").length === 0 ? (
    <div className="text-gray-500 dark:text-gray-400 text-sm">
      {t("No active preparing orders.")}
    </div>
  ) : (
    <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
      {orders
        .filter(o => o.kitchen_status === "preparing")
        .map((o, i) => (
          <li
            key={i}
            className="flex justify-between border-b border-slate-200/60 pb-0.5"
          >
            <span>
              {o.order_type === "table"
                ? `🍽️ Table ${o.table_number}`
                : o.order_type === "packet"
                ? `🛵 Packet ${o.customer_name || o.customer_phone || ""}`
                : `📞 Phone ${o.customer_name || ""}`}
            </span>
            <span className="text-slate-700 dark:text-slate-200 font-semibold text-xs uppercase">
              {t("PREPARING")}
            </span>
          </li>
        ))}
    </ul>
  )}
</div>

{/* ⏱ Improved timer */}
{prepStart && (
  <div className="flex flex-col items-center text-gray-700 dark:text-gray-300 mt-3">
    <div className="flex items-center gap-2 text-lg font-semibold">
      ⏱ {t("Elapsed Time")}
      <span className="px-3 py-1 rounded-lg bg-gray-800 text-white text-base font-mono shadow-inner">
        {(() => {
          const diff = Math.floor((new Date() - prepStart) / 1000);
          const mins = Math.floor(diff / 60);
          const secs = diff % 60;
          return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        })()}
      </span>
    </div>
    <div className="text-xs text-gray-500 mt-1">
      {t("Timer resets when order is delivered")}
    </div>
  </div>
)}



        </div>
        
      </div>
      
    )}

    {/* Timer Modal */}
    {showTimerModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
        <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
          <button
            className="absolute top-4 right-4 inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-200 transition"
            onClick={() => setShowTimerModal(false)}
            aria-label={t("Close")}
          >
            ✕
          </button>
          <div className="p-6 sm:p-8 space-y-6">
            <header className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                ⏱ {t("Kitchen Timers")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                {t("Keep prep stations synchronized across mobile and tablet screens. Timers run in the background even when you close this panel.")}
              </p>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
              <form
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 p-4 flex flex-col gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newTimerName || newTimerSeconds < 1) return;
                  const payload = {
                    name: newTimerName,
                    secondsLeft: newTimerSeconds,
                    total: newTimerSeconds,
                    running: false,
                  };
                  const saved = await secureFetch("kitchen-timers", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });

                  if (saved) {
                    setTimers((prev) => [...prev, normalizeTimerRow(saved)]);
                  }
                  setNewTimerName("");
                  setNewTimerSeconds(60);
                }}
              >
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {t("Timer Name")}
                  </label>
                  <input
                    className="w-full rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#49c0c0]/70"
                    placeholder={t("e.g. Grill Station")}
                    value={newTimerName}
                    onChange={(e) => setNewTimerName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {t("Duration (seconds)")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className="w-24 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#49c0c0]/70"
                      type="number"
                      min={5}
                      max={3600}
                      value={newTimerSeconds}
                      onChange={(e) => setNewTimerSeconds(Number(e.target.value))}
                    />
                    <span className="text-xs text-slate-400">
                      {formatTimerValue(newTimerSeconds)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[30, 45, 60, 90, 180, 300].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewTimerSeconds(s)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                          newTimerSeconds === s
                            ? "bg-[#49c0c0] text-slate-900 border-[#49c0c0]"
                            : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"
                        } transition`}
                      >
                        {s < 60 ? `${s}s` : `${s / 60}m`}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-2 inline-flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 transition"
                >
                  ➕ {t("Add Timer")}
                </button>
              </form>

              <div className="space-y-4">
                {timers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                    {t("No timers yet. Add your first kitchen timer to keep prep on schedule.")}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {timers.map((timer) => {
                      const isRunning = timer.running;
                      const isComplete = !timer.running && timer.secondsLeft === timer.total;
                      const isPaused = !timer.running && timer.secondsLeft !== timer.total;
                      const progress =
                        timer.total > 0
                          ? Math.min(100, Math.max(0, ((timer.total - timer.secondsLeft) / timer.total) * 100))
                          : 0;
                      const statusTone = isRunning
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : isPaused
                        ? "bg-amber-100 text-amber-700 border border-amber-200"
                        : "bg-slate-200 text-slate-600 border border-slate-300";

                      return (
                        <div
                          key={timer.id}
                          className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/70 px-4 py-4 flex flex-col gap-3 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {timer.name}
                            </h4>
                            <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full ${statusTone}`}>
                              {isRunning ? t("Running") : isPaused ? t("Paused") : t("Ready")}
                            </span>
                          </div>
                          <div className="flex items-end justify-between gap-2">
                            <div>
                              <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white tracking-tight">
                                {formatTimerValue(timer.secondsLeft)}
                              </div>
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                                {t("Total")} {formatTimerValue(timer.total)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {timer.running ? (
                                <button
                                  onClick={() => pauseTimer(timer).catch(() => {})}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-slate-900 text-white hover:bg-slate-700 transition"
                                  title={t("Pause")}
                                >
                                  ⏸
                                </button>
                              ) : (
                                <button
                                  onClick={() => resumeTimer(timer).catch(() => {})}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500 text-white hover:bg-emerald-400 transition"
                                  title={t("Resume")}
                                >
                                  ▶️
                                </button>
                              )}
                              <button
                                onClick={() => deleteTimer(timer).catch(() => {})}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white text-rose-500 border border-rose-200 hover:bg-rose-50 transition"
                                title={t("Delete")}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-zinc-700/60 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#49c0c0] via-[#8f7cf8] to-[#4130b5] transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>
                                {t("Elapsed")}: {formatTimerValue(timer.total - timer.secondsLeft)}
                              </span>
                              {isPaused && (
                                <span>{t("Paused at")} {formatTimerValue(timer.secondsLeft)}</span>
                              )}
                              {isComplete && <span>{t("Ready to start")}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* === Settings Modal (existing) === */}
 {showSettings && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200 dark:border-zinc-800 p-8">

      {/* Close Button */}
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-slate-900 text-white shadow hover:scale-105 transition-all z-10"
        onClick={() => setShowSettings(false)}
        aria-label="Close"
      >
        ✕
      </button>

      {/* Modal Title */}
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 tracking-tight">
        🍽️ {t("Kitchen Settings")}
      </h2>

      {/* Exclude Ingredients First */}
      <div className="mb-7">
        <div className="font-semibold text-gray-800 dark:text-white mb-2">
          {t("Exclude Ingredients from Compile:")}
        </div>
        <div className="max-h-24 overflow-y-auto rounded-lg bg-slate-100 dark:bg-zinc-800 p-3 grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-200 dark:border-zinc-700">
          {allIngredients.length === 0 ? (
            <div className="text-gray-400">{t("No ingredients found")}</div>
          ) : (
            allIngredients.map((ingredient) => (
              <label
                key={ingredient}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-sm"
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
secureFetch("kitchen/compile-settings", {
  method: "POST",
  body: JSON.stringify({
    excludedCategories,
    excludedItems,
    excludedIngredients: updated,
  }),
});


                      return updated;
                    });
                  }}
                  className="accent-slate-700 w-4 h-4"
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
              className="rounded-2xl border border-slate-200 dark:border-zinc-700 shadow bg-slate-100 dark:bg-zinc-800 p-4 transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-slate-700 transition-all"
                  checked={products.filter(p => p.category === category).every(p => excludedItems?.includes(p.id))}
                  onChange={() => {
                    const catProducts = products.filter(p => p.category === category).map(p => p.id);
                    setExcludedItems(prev => {
                      const allChecked = catProducts.every(id => prev.includes(id));
                      const updated = allChecked
                        ? prev.filter(id => !catProducts.includes(id))
                        : Array.from(new Set([...prev, ...catProducts]));
                   secureFetch("/kitchen/compile-settings", {
  method: "POST",
  body: JSON.stringify({
    excludedCategories,
    excludedItems: updated,
    excludedIngredients,
  }),
});

                      return updated;
                    });
                  }}
                />
                <span className="font-bold text-lg text-slate-800 dark:text-slate-100">
                  {category}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products.filter(p => p.category === category).map(product => (
                  <label
                    key={product.id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 shadow bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all"
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-slate-700"
                      checked={excludedItems?.includes(product.id)}
                      onChange={() => {
                        setExcludedItems(prev => {
                          const updated = prev.includes(product.id)
                            ? prev.filter(id => id !== product.id)
                            : [...prev, product.id];
secureFetch("kitchen/compile-settings", {
  method: "POST",
  body: JSON.stringify({
    excludedCategories,
    excludedItems,
    excludedIngredients: updated,
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
