import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import socket from "../utils/socket";
import secureFetch from "../utils/secureFetch";
import { useHeader } from "../context/HeaderContext";
import KitchenSettingsModal from "../modals/KitchenSettingsModal";
import { patchTableOrdersKitchenStatusInCache } from "../features/orders/tableOrdersCache";
import { removeTableOverviewOrderFromCache } from "../utils/tableOverviewOrdersCache";
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";

const KITCHEN_ORDER_TIMERS_KEY = "kitchenOrderTimers.v2";

const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getOpenOrdersCacheKey = (mode = "packet") =>
  getRestaurantScopedCacheKey(`openOrders.${mode}.v1`);

const pruneOpenOrdersCache = (orderId, tableNumber) => {
  if (typeof window === "undefined") return;

  ["packet", "kitchen"].forEach((mode) => {
    const key = getOpenOrdersCacheKey(mode);
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;
      const next = parsed.filter((row) => {
        const rowOrderId = Number(row?.id ?? row?.order_id ?? row?.orderId);
        const rowTableNumber = Number(
          row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
        );
        if (Number.isFinite(orderId) && rowOrderId === orderId) return false;
        if (Number.isFinite(tableNumber) && rowTableNumber === tableNumber) return false;
        return true;
      });
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // ignore cache errors
    }
  });
};

export default function KitchenNew() {
  const [orders, setOrders] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("all"); // all selected by default
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [compiled, setCompiled] = useState(null);
  const [maxCardHeight, setMaxCardHeight] = useState(0);
  const cardContainerRef = useRef(null);
  const [orderTimers, setOrderTimers] = useState(() => {
    try {
      const raw = localStorage.getItem(KITCHEN_ORDER_TIMERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [now, setNow] = useState(Date.now());

  const { t } = useTranslation();
  const { setHeader } = useHeader();
  const [showSettings, setShowSettings] = useState(false);
  const [transactionSettings, setTransactionSettings] = useState(
    DEFAULT_TRANSACTION_SETTINGS
  );
  const [products, setProducts] = useState([]);
  const [excludedIngredients, setExcludedIngredients] = useState([]);
  const [excludedCategories, setExcludedCategories] = useState([]);
  const [excludedItems, setExcludedItems] = useState([]);

  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);

  // Calculate max card height
  useEffect(() => {
    if (!cardContainerRef.current) return;
    const cards = cardContainerRef.current.querySelectorAll('[data-card]');
    if (cards.length === 0) return;
    
    const heights = Array.from(cards).map(card => card.offsetHeight);
    const max = Math.max(...heights);
    setMaxCardHeight(max);
  }, [orders]);

  useEffect(() => {
    if (!import.meta?.env?.DEV) return;
    if (typeof window === "undefined") return;
    window.__kitchenOrders = orders;
    window.__kitchenOrdersMeta = { page: "KitchenNew", updatedAt: Date.now() };
  }, [orders]);

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch kitchen orders (mirror old Kitchen.jsx behavior)
  const fetchOrders = useCallback(async () => {
    try {
      const data = await secureFetch("/kitchen-orders");

      // Include table, packet, phone, takeaway and exclude delivered/null/empty
      const active = data.filter(
        (item) =>
          item.kitchen_status !== "delivered" &&
          item.kitchen_status !== null &&
          item.kitchen_status !== "" &&
          ["table", "reservation", "packet", "phone", "takeaway"].includes(
            String(item.order_type || "").toLowerCase()
          )
      );

      // Fetch reservation info for table orders
      const withReservations = await Promise.all(
        active.map(async (item) => {
          if (["table", "reservation"].includes(String(item.order_type).toLowerCase()) && item.order_id) {
            try {
              const resData = await secureFetch(`/orders/reservations/${item.order_id}`);
              if (resData?.success && resData?.reservation) {
                return { ...item, reservation: resData.reservation };
              }
            } catch (err) {
              console.warn(`Failed to fetch reservation for order ${item.order_id}:`, err);
            }
          }
          return item;
        })
      );

      setOrders(withReservations);

      // Initialize timers for new orders
      setOrderTimers((prev) => {
        const updated = { ...prev };
        const currentTime = Date.now();
        withReservations.forEach((order) => {
          if (!updated[order.order_id]) {
            updated[order.order_id] = currentTime;
          }
        });
        // Remove old timers
        Object.keys(updated).forEach((id) => {
          if (!withReservations.some((o) => o.order_id == id)) {
            delete updated[id];
          }
        });
        localStorage.setItem(KITCHEN_ORDER_TIMERS_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error("❌ Failed to fetch kitchen orders:", err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Socket listeners
  useEffect(() => {
    const handlers = {
      "kitchen:update": fetchOrders,
      "order:new": fetchOrders,
      "order:update": fetchOrders,
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler);
      });
    };
  }, [fetchOrders]);

  useEffect(() => {
    setHeader((prev) => ({
      ...prev,
      title: <span className="hidden sm:inline">{t("Kitchen")}</span>,
    }));
  }, [setHeader, t]);

  const actionsNode = useMemo(
    () => (
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-indigo-400/50 bg-white/70 text-indigo-600 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-white dark:bg-zinc-800/70 dark:text-indigo-200 dark:hover:bg-indigo-700/20 dark:focus:ring-offset-zinc-900 transition"
        title={t("Kitchen Settings")}
      >
        <span className="text-lg">⚙️</span>
      </button>
    ),
    [t]
  );

  const headerTabs = useMemo(
    () => [
      { id: "all", label: t("ALL ORDERS") },
      { id: "new", label: t("TABLE") },
      { id: "ready", label: t("PACKET") },
      { id: "cooking", label: t("COOKING") },
    ],
    [t]
  );

  const headerNav = useMemo(
    () => (
      <div className="grid w-full grid-cols-2 items-stretch gap-1 rounded-2xl border border-slate-200/60 bg-slate-50/70 p-1 backdrop-blur sm:w-auto sm:grid-cols-4 dark:border-slate-700/60 dark:bg-zinc-800/30">
        {headerTabs.map((tab) => (
          <HeaderTabButton
            key={tab.id}
            label={tab.label}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>
    ),
    [activeTab, headerTabs]
  );

  useEffect(() => {
    setHeader((prev) => ({ ...prev, actions: actionsNode, centerNav: headerNav }));
    return () => setHeader((prev) => ({ ...prev, actions: null, centerNav: null }));
  }, [actionsNode, headerNav, setHeader]);

  // Load compile settings + products
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
        const data = await secureFetch("products");
        setProducts(data);
      } catch {
        setProducts([]);
      }
    })();
  }, []);

  // Derive list of all ingredient names
  const allIngredients = useMemo(() => {
    return Array.from(
      new Set(
        (products || []).flatMap((product) => {
          let arr = [];
          try {
            arr = Array.isArray(product.ingredients)
              ? product.ingredients
              : typeof product.ingredients === "string"
              ? JSON.parse(product.ingredients)
              : [];
          } catch {
            arr = [];
          }
          return arr.map((ing) => ing && ing.ingredient).filter(Boolean);
        })
      )
    );
  }, [products]);

  // Group orders by order_id
  const groupedOrders = useMemo(() => {
    const groups = {};
    orders.forEach((item) => {
      const orderId = item.order_id;
      if (!groups[orderId]) {
        groups[orderId] = {
          order_id: orderId,
          order_type: item.order_type,
          table_number: item.table_number,
          customer_name: item.customer_name,
          customer_phone: item.customer_phone,
          customer_address: item.customer_address,
          items: [],
          created_at: item.created_at,
        };
      }
      groups[orderId].items.push(item);
    });
    return Object.values(groups);
  }, [orders]);

  // Keep selection in sync with live order refreshes
  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.size === 0) return prev;
      const existing = new Set();
      groupedOrders.forEach((order) => {
        order.items.forEach((item) => existing.add(item.item_id));
      });
      const next = new Set();
      prev.forEach((id) => {
        if (existing.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [groupedOrders]);

  // Filter orders by tab
  const filteredOrders = useMemo(() => {
    if (activeTab === "all") return groupedOrders;
    if (activeTab === "new") {
      // Filter for Table orders only
      return groupedOrders.filter((order) => {
        const type = String(order.order_type || "").toLowerCase();
        return type === "table" || type === "reservation";
      });
    }
    if (activeTab === "cooking") {
      return groupedOrders.filter((order) =>
        order.items.some((item) => item.kitchen_status === "preparing")
      );
    }
    if (activeTab === "ready") {
      // Filter for Packet (online) orders and Phone orders
      return groupedOrders.filter((order) => {
        const type = String(order.order_type || "").toLowerCase();
        return type === "packet" || type === "phone";
      });
    }
    return groupedOrders;
  }, [groupedOrders, activeTab]);

  // Format timer
  const formatTimer = (orderId) => {
    const startTime = orderTimers[orderId] || Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  // Get timer color class
  const getTimerColorClass = (orderId) => {
    const startTime = orderTimers[orderId] || Date.now();
    const elapsed = Math.floor((now - startTime) / 1000);
    if (elapsed > 300) return "text-red-600 font-bold"; // Over 5 minutes
    if (elapsed > 180) return "text-orange-600 font-bold"; // Over 3 minutes
    if (elapsed > 120) return "text-yellow-600"; // Over 2 minutes
    return "text-green-600";
  };

  const toggleItemSelection = useCallback((itemId) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const toggleOrderSelection = useCallback((order) => {
    const itemIds = (order?.items || []).map((item) => item.item_id);
    if (itemIds.length === 0) return;
    setSelectedItemIds((prev) => {
      const allSelected = itemIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        itemIds.forEach((id) => next.delete(id));
      } else {
        itemIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const closeDeliveredTableOrders = useCallback(
    async (candidateOrders, deliveredItemIds) => {
      if (!transactionSettings.autoCloseDeliveredTableFromKitchen) return;

      const itemIdSet = new Set(
        (Array.isArray(deliveredItemIds) ? deliveredItemIds : [])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      );
      if (itemIdSet.size === 0) return;

      const excludedItemSet = new Set(
        (Array.isArray(excludedItems) ? excludedItems : []).map((value) => String(value))
      );
      const excludedCategorySet = new Set(
        (Array.isArray(excludedCategories) ? excludedCategories : [])
          .map((value) => String(value || "").trim().toLowerCase())
          .filter(Boolean)
      );
      const uniqueOrders = new Map();

      (Array.isArray(candidateOrders) ? candidateOrders : []).forEach((order) => {
        const orderId = Number(order?.order_id);
        if (!Number.isFinite(orderId)) return;
        uniqueOrders.set(orderId, order);
      });

      for (const order of uniqueOrders.values()) {
        const orderType = String(order?.order_type || "").trim().toLowerCase();
        if (!["table", "reservation"].includes(orderType)) continue;

        const orderId = Number(order?.order_id);
        const tableNumber = Number(order?.table_number);
        const items = Array.isArray(order?.items) ? order.items : [];
        if (!Number.isFinite(orderId) || !Number.isFinite(tableNumber) || items.length === 0) {
          continue;
        }

        const allDelivered = items.every((item) => {
          const itemId = Number(item?.item_id ?? item?.id ?? item?.order_item_id);
          const nextStatus = itemIdSet.has(itemId)
            ? "delivered"
            : String(item?.kitchen_status || "").trim().toLowerCase();
          const productId = String(item?.product_id ?? item?.id ?? "");
          const category = String(item?.category || "").trim().toLowerCase();
          const isExcluded =
            (productId && excludedItemSet.has(productId)) ||
            (category && excludedCategorySet.has(category));

          return (
            isExcluded ||
            !nextStatus ||
            nextStatus === "delivered" ||
            nextStatus === "packet_delivered"
          );
        });

        if (!allDelivered) continue;

        try {
          const hasReservationContext = Boolean(
            orderType === "reservation" ||
              (order?.reservation && typeof order.reservation === "object")
          );
          const closeBody = {
            allow_unpaid_table_close: true,
            ...(hasReservationContext
              ? { preserve_reservation_checkout_badge: true }
              : null),
          };

          await secureFetch(`/orders/${orderId}/close`, {
            method: "POST",
            body: JSON.stringify(closeBody),
          });
          removeTableOverviewOrderFromCache(tableNumber);
          pruneOpenOrdersCache(orderId, tableNumber);
          if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            window.dispatchEvent(
              new CustomEvent("beypro:orders-local-refresh", {
                detail: {
                  kind: "tableoverview_order_status",
                  status: "closed",
                  order_id: orderId,
                  table_number: tableNumber,
                },
              })
            );
          }
          await secureFetch(`/tables/${tableNumber}`, {
            method: "PATCH",
            body: JSON.stringify({ guests: null }),
          });
        } catch (err) {
          console.error("❌ Failed to auto-close delivered table from kitchen:", err);
        }
      }
    },
    [excludedCategories, excludedItems, transactionSettings.autoCloseDeliveredTableFromKitchen]
  );

  // Update kitchen status
  const updateKitchenStatus = async (status) => {
    if (selectedItemIds.size === 0) return;

    try {
      const itemIds = Array.from(selectedItemIds);
      const impactedOrders = groupedOrders.filter((order) =>
        Array.isArray(order?.items)
          ? order.items.some((item) => itemIds.includes(item.item_id))
          : false
      );

      // Use the backend's expected endpoint and payload
      await secureFetch("/order-items/kitchen-status", {
        method: "PUT",
        body: JSON.stringify({ ids: itemIds, status }),
      });

      const patched = patchTableOrdersKitchenStatusInCache({
        itemIds,
        status,
      });
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("beypro:orders-local-refresh", {
            detail: {
              kind: "kitchen_status_update",
              item_ids: itemIds,
              status,
              order_ids: patched.orders,
              table_numbers: patched.tables,
            },
          })
        );
      }

      if (status === "delivered") {
        await closeDeliveredTableOrders(impactedOrders, itemIds);
      }

      if (status === "preparing") {
        setActiveTab("cooking");
      } else {
        setSelectedItemIds(new Set());
      }

      await fetchOrders();
    } catch (err) {
      console.error("❌ Failed to update kitchen status:", err);
    }
  };

  // Compile selected orders
  const openCompileModal = () => {
    if (selectedItemIds.size === 0) return;

    const selectedItems = [];
    groupedOrders.forEach((order) => {
      order.items.forEach((item) => {
        if (selectedItemIds.has(item.item_id)) selectedItems.push(item);
      });
    });

    const compiled = compileTotals(selectedItems);
    setCompiled(compiled);
    setShowCompileModal(true);
  };

  const compileTotals = (items) => {
    const productCounts = {};
    const notes = [];

    items.forEach((item) => {
      const key = item.product_name;
      productCounts[key] = (productCounts[key] || 0) + (item.quantity || 1);

      if (item.note) {
        notes.push(`${item.product_name}: ${item.note}`);
      }

      // Parse extras
      try {
        const extras = typeof item.extras === "string" ? JSON.parse(item.extras) : item.extras || [];
        extras.forEach((ex) => {
          const extraKey = `+ ${ex.name}`;
          const qty = (ex.quantity || 1) * (item.quantity || 1);
          productCounts[extraKey] = (productCounts[extraKey] || 0) + qty;
        });
      } catch {}
    });

    return { productCounts, notes };
  };

  const safeParse = (data) => {
    try {
      return typeof data === "string" ? JSON.parse(data) : data || [];
    } catch {
      return [];
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-zinc-900">
      {/* Order Grid */}
      <div className="p-6 pb-32">
        <div 
          ref={cardContainerRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
        >
          {filteredOrders.map((order) => {
            const itemIds = (order?.items || []).map((item) => item.item_id);
            const anySelected = itemIds.some((id) => selectedItemIds.has(id));
            const allSelected = itemIds.length > 0 && itemIds.every((id) => selectedItemIds.has(id));
            const isTwoColumn = order.items.length > 8;

            return (
              <div 
                key={order.order_id} 
                data-card
                className={isTwoColumn ? "md:col-span-2 lg:col-span-2 xl:col-span-2 2xl:col-span-2" : ""}
                style={maxCardHeight > 0 ? { minHeight: `${maxCardHeight}px` } : {}}
              >
                <OrderCard
                  order={order}
                  anySelected={anySelected}
                  allSelected={allSelected}
                  selectedItemIds={selectedItemIds}
                  onToggleAll={() => toggleOrderSelection(order)}
                  onToggleItem={toggleItemSelection}
                  timer={formatTimer(order.order_id)}
                  timerClass={getTimerColorClass(order.order_id)}
                  safeParse={safeParse}
                  t={t}
                />
              </div>
            );
          })}
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center text-gray-500 py-20 text-lg">
            {t("No orders in this category")}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-800 border-t border-gray-300 dark:border-zinc-700 p-4 shadow-lg">
        <div className="flex gap-3 justify-center max-w-4xl mx-auto">
          <button
            onClick={() => updateKitchenStatus("preparing")}
            disabled={selectedItemIds.size === 0}
            className="flex-1 py-3 px-3 sm:py-4 sm:px-6 bg-green-600 hover:bg-green-700 text-white font-bold text-sm sm:text-lg rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {t("PREPARING")}
          </button>
          <button
            onClick={() => updateKitchenStatus("delivered")}
            disabled={selectedItemIds.size === 0}
            className="flex-1 py-3 px-3 sm:py-4 sm:px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-lg rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {t("DELIVERED")}
          </button>
          <button
            onClick={openCompileModal}
            disabled={selectedItemIds.size === 0}
            className="flex-1 py-3 px-3 sm:py-4 sm:px-6 bg-yellow-500 hover:bg-yellow-600 text-white font-bold text-sm sm:text-lg rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {t("COMPILE")}
          </button>
        </div>
      </div>

      {/* Compile Modal */}
      {showCompileModal && compiled && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                🧮 {t("Compiled Orders")}
              </h2>
              <button
                onClick={() => setShowCompileModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">
                  {t("Products")}
                </h3>
                <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg p-4">
                  {Object.entries(compiled.productCounts).map(([name, qty]) => (
                    <div key={name} className="flex justify-between py-1">
                      <span className="text-gray-700 dark:text-gray-300">{name}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">×{qty}</span>
                    </div>
                  ))}
                </div>
              </div>

              {compiled.notes.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">
                    {t("Notes")}
                  </h3>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 space-y-1">
                    {compiled.notes.map((note, idx) => (
                      <div key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                        • {note}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCompileModal(false)}
              className="mt-6 w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition"
            >
              {t("Close")}
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <KitchenSettingsModal
          allIngredients={allIngredients}
          excludedIngredients={excludedIngredients}
          setExcludedIngredients={setExcludedIngredients}
          excludedCategories={excludedCategories}
          setExcludedCategories={setExcludedCategories}
          excludedItems={excludedItems}
          setExcludedItems={setExcludedItems}
          products={products}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Order Card Component
function OrderCard({
  order,
  anySelected,
  allSelected,
  selectedItemIds,
  onToggleAll,
  onToggleItem,
  timer,
  timerClass,
  safeParse,
  t,
}) {
  const type = String(order.order_type || "").toLowerCase();
  const headerCheckboxRef = useRef(null);
  const ONLINE_SOURCE_DISPLAY_NAMES = {
    yemeksepeti: "Yemeksepeti",
    migros: "Migros",
    trendyol: "Trendyol",
    getir: "Getir",
    glovo: "Glovo",
  };

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = Boolean(anySelected && !allSelected);
  }, [anySelected, allSelected]);

  const formatOnlineSourceLabel = (source) => {
    if (!source) return null;
    const trimmed = String(source).trim();
    if (!trimmed) return null;
    const normalized = trimmed.toLowerCase();
    if (ONLINE_SOURCE_DISPLAY_NAMES[normalized]) {
      return ONLINE_SOURCE_DISPLAY_NAMES[normalized];
    }
    const parts = normalized
      .split(/[^a-z0-9]+/)
      .filter((chunk) => chunk.length)
      .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1));
    return parts.length ? parts.join(" ") : trimmed;
  };

  const resolveOnlineSourceLabelFromOrder = (o) => {
    const sourceCandidate =
      o?.external_source ??
      o?.externalSource ??
      o?.source ??
      o?.platform ??
      o?.provider ??
      o?.integration_source ??
      o?.integrationSource;
    const direct = formatOnlineSourceLabel(sourceCandidate);
    if (direct) return direct;
    const payment = String(o?.payment_method || "").toLowerCase();
    if (!payment) return null;
    const match = Object.keys(ONLINE_SOURCE_DISPLAY_NAMES).find((key) =>
      payment.includes(key)
    );
    return match ? ONLINE_SOURCE_DISPLAY_NAMES[match] : null;
  };

  const orderLabel = (() => {
    if (type === "table" || type === "reservation") return `${t("Table")} ${order.table_number}`;
    if (type === "packet") {
      const onlineLabel = resolveOnlineSourceLabelFromOrder(order);
      return onlineLabel || t("Packet");
    }
    if (type === "phone") return t("Phone Order");
    if (type === "takeaway") return t("Takeaway");
    return t("Order");
  })();

  return (
    <div
      className={`bg-white dark:bg-zinc-800 border-2 ${
        anySelected ? "border-blue-500" : "border-gray-300 dark:border-zinc-600"
      } rounded-lg p-4 shadow hover:shadow-lg transition cursor-pointer h-full flex flex-col`}
      onClick={onToggleAll}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            ref={headerCheckboxRef}
            checked={allSelected}
            onChange={onToggleAll}
            onClick={(e) => e.stopPropagation()}
            className="w-5 h-5 accent-blue-600 flex-shrink-0"
          />
          <div className="font-bold text-lg text-gray-900 dark:text-white whitespace-nowrap">
            {orderLabel}
          </div>
        </div>
        <div className={`text-xl font-bold ${timerClass} whitespace-nowrap`}>{timer}</div>
      </div>

      {/* Order Info */}
      <div className="mb-3 text-xs text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-zinc-700 pb-2">
        {t("Order ID")} #{order.order_id}
      </div>

      {/* Client Info (delivery / takeaway / phone) */}
      {!["table", "reservation"].includes(type) && (order.customer_name || order.customer_phone || order.customer_address) && (
        <div className="mb-3 text-xs text-gray-700 dark:text-gray-200 space-y-1">
          {order.customer_name && (
            <div className="font-semibold truncate">👤 {order.customer_name}</div>
          )}
          {order.customer_phone && (
            <a
              href={`tel:${order.customer_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-block text-xs text-slate-600 dark:text-slate-200 underline decoration-slate-300 hover:decoration-slate-500"
              style={{ textDecorationThickness: "1px" }}
            >
              📞 {order.customer_phone}
            </a>
          )}
          {order.customer_address && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block text-xs text-slate-700 dark:text-slate-200 font-semibold leading-snug break-words whitespace-normal underline decoration-emerald-300 decoration-2 underline-offset-2 hover:decoration-emerald-500 transition-colors"
              style={{
                wordBreak: "break-word",
                overflowWrap: "break-word",
                whiteSpace: "pre-line",
              }}
            >
              📍 {order.customer_address}
            </a>
          )}
        </div>
      )}

      {/* Items - Dynamic Columns (Max 5 items per column) */}
      <div className="border-t border-gray-200 dark:border-zinc-700 pt-2 -mx-4 px-4 flex-1 overflow-y-auto">
        {(() => {
          const itemsPerColumn = 5;
          const numColumns = Math.ceil(order.items.length / itemsPerColumn);
          const gridClass = 
            numColumns === 1 ? "grid-cols-1" :
            numColumns === 2 ? "grid-cols-2" :
            numColumns === 3 ? "grid-cols-3" :
            "grid-cols-4";
          
          return (
            <div className={`grid ${gridClass} gap-4`}>
              {Array.from({ length: numColumns }).map((_, colIndex) => (
                <div 
                  key={colIndex}
                  className={`space-y-2 ${colIndex < numColumns - 1 ? 'border-r border-gray-300 dark:border-zinc-600 pr-3' : ''}`}
                >
                  {order.items
                    .slice(colIndex * itemsPerColumn, (colIndex + 1) * itemsPerColumn)
                    .map((item) => {
                      const parsedExtras = safeParse(item.extras);
                      const isSelected = selectedItemIds.has(item.item_id);

                      return (
                        <div
                          key={item.item_id}
                          className="flex items-start gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleItem(item.item_id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onToggleItem(item.item_id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 w-4 h-4 accent-blue-600 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 dark:text-white font-medium text-sm">
                              {item.quantity}x {item.product_name}
                            </div>

                            {/* Note in brown/gold color */}
                            {item.note && (
                              <div className="text-xs text-amber-700 dark:text-amber-500 font-medium mt-0.5">
                                – {item.note}
                              </div>
                            )}

                            {/* Extras in green/olive color */}
                            {parsedExtras.length > 0 && (
                              <div className="text-xs text-green-700 dark:text-green-500 font-medium mt-0.5">
                                {parsedExtras.map((ex, idx) => (
                                  <div key={idx}>
                                    – {ex.name} {ex.quantity > 1 ? `×${ex.quantity}` : ""}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      
      {/* Bottom Design Accent */}
      <div className="mt-auto pt-3 -mx-4 px-4">
        <div className="h-1 bg-gradient-to-r from-transparent via-gray-300 dark:via-zinc-600 to-transparent rounded-full"></div>
        <div className="mt-2 flex justify-between items-center text-xs text-gray-400 dark:text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600"></span>
            {order.items.length} items
          </span>
          <span className="italic">Kitchen</span>
        </div>
      </div>
    </div>
  );
}

function HeaderTabButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-w-0 w-full h-full min-h-[40px] sm:min-h-[42px] text-center",
        "inline-flex items-center justify-center",
        "rounded-full border px-2 py-1.5 sm:px-3 text-[11px] sm:text-[12px] md:text-[13px] font-semibold leading-tight",
        "transition-all duration-150 hover:shadow-sm active:scale-[0.98]",
        "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
        active
          ? "border-emerald-500 bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-sm shadow-emerald-500/20 ring-1 ring-white/50"
          : "border-slate-200/80 bg-white/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800",
      ].join(" ")}
    >
      <span className="block whitespace-normal break-words text-center">{label}</span>
    </button>
  );
}
