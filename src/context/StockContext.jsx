import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";

const StockContext = createContext();

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  // Keep digits + separators, drop currency/letters/spaces.
  let cleaned = raw.replace(/\s+/g, "").replace(/[^\d,.-]+/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === ",") return 0;

  // Handle common localized formats:
  // - "1.234,56" (TR/EU) -> 1234.56
  // - "1,234.56" (US)    -> 1234.56
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    cleaned = cleaned.replace(/,/g, ".");
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const normalizeStockList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.stock)) return payload.stock;
  if (Array.isArray(payload?.stocks)) return payload.stocks;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeIngredientPrices = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.prices)) return payload.prices;
  if (Array.isArray(payload?.ingredient_prices)) return payload.ingredient_prices;
  if (Array.isArray(payload?.ingredientPrices)) return payload.ingredientPrices;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeSupplierTransactions = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const makePriceKey = (name, unit, supplier) => {
  const n = String(name || "").trim().toLowerCase();
  const u = String(unit || "").trim().toLowerCase();
  const s = String(supplier || "").trim().toLowerCase();
  return `${n}|${u}|${s}`;
};

const makeNameUnitKey = (name, unit) => {
  const n = String(name || "").trim().toLowerCase();
  const u = String(unit || "").trim().toLowerCase();
  return `${n}|${u}`;
};

const resolveTxnDate = (txn) =>
  txn?.delivery_date || txn?.created_at || txn?.updated_at || txn?.date || null;

const toTxnTime = (txn) => {
  const raw = resolveTxnDate(txn);
  if (!raw) return 0;
  const parsed = new Date(raw);
  const time = parsed.getTime();
  return Number.isNaN(time) ? 0 : time;
};

const computeTxnRowPrice = (row) => {
  const direct = toNumber(row?.price_per_unit ?? row?.unit_price);
  if (direct > 0) return direct;
  const qty = toNumber(row?.quantity);
  const total = toNumber(row?.total_cost ?? row?.totalCost);
  if (qty > 0 && total > 0) return total / qty;
  return 0;
};

const collectTxnRows = (txn) => {
  const rows = [];
  if (!txn) return rows;
  const time = toTxnTime(txn);

  if (Array.isArray(txn.items) && txn.items.length > 0) {
    txn.items.forEach((item) => {
      const name = item?.ingredient ?? item?.name ?? item?.product_name;
      const unit = item?.unit;
      rows.push({
        name,
        unit,
        quantity: item?.quantity,
        total_cost: item?.total_cost ?? item?.totalCost,
        price_per_unit: item?.price_per_unit ?? item?.unit_price,
        _time: time,
      });
    });
    return rows;
  }

  rows.push({
    name: txn?.ingredient ?? txn?.name ?? txn?.product_name,
    unit: txn?.unit,
    quantity: txn?.quantity,
    total_cost: txn?.total_cost ?? txn?.totalCost,
    price_per_unit: txn?.price_per_unit ?? txn?.unit_price,
    _time: time,
  });
  return rows;
};

const getPricePerUnit = (item) => {
  const direct =
    item?.price_per_unit ??
    item?.pricePerUnit ??
    item?.unit_price ??
    item?.unitPrice ??
    item?.purchase_price ??
    item?.purchasePrice ??
    item?.cost_per_unit ??
    item?.costPerUnit ??
    item?.cost_price ??
    item?.costPrice ??
    item?.price ??
    item?.unit_cost ??
    item?.unitCost;

  const nested =
    item?.product?.price_per_unit ??
    item?.product?.pricePerUnit ??
    item?.product?.unit_price ??
    item?.product?.unitPrice ??
    item?.ingredient?.price_per_unit ??
    item?.ingredient?.pricePerUnit;

  const price = toNumber(direct ?? nested);
  if (price > 0) return price;

  // Fallback if backend sends total-value but not unit price.
  const quantity = toNumber(
    item?.quantity ?? item?.qty ?? item?.count ?? item?.units ?? item?.on_hand
  );
  const totalValue = toNumber(
    item?.total_value ??
      item?.totalValue ??
      item?.value ??
      item?.total_cost ??
      item?.totalCost ??
      item?.amount
  );
  if (quantity > 0 && totalValue > 0) return totalValue / quantity;

  return 0;
};


export const useStock = () => useContext(StockContext);

export const StockProvider = ({ children }) => {
  const [stock, setStock] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const autoAddLocks = useRef(new Set());
  const debugLoggedRef = useRef(false);
  const debugGroupedLoggedRef = useRef(false);
  const ingredientPriceCacheRef = useRef({ map: null, fetchedAt: 0 });
  const supplierTxnPriceCacheRef = useRef({ bySupplierId: new Map() });

  // ✅ Add to cart helper
  const handleAddToCart = useCallback(
    async (item, onCartUpdated) => {
      try {
        if (!item.stock_id || !item.supplier_id) return;

        const { stock } = await secureFetch(`/stock/${item.stock_id}`);
        if (!stock) return;

        const quantity = toNumber(stock.quantity);
        const critical = toNumber(stock.critical_quantity);
        if (quantity > critical) {
          console.log(`🛑 ${item.name} not critical (${quantity} > ${critical}), skipping`);
          return;
        }

        // 🔁 Get or create cart
        const cartData = await secureFetch(`/supplier-carts/items?supplier_id=${item.supplier_id}`);
        const cartId = cartData.cart_id;

        const existing = cartData.items?.find(
          (ci) =>
            ci.product_name.toLowerCase() === item.name.toLowerCase() &&
            ci.unit.toLowerCase() === item.unit.toLowerCase()
        );

        let updatedCart;
        if (existing) {
          updatedCart = await secureFetch(`/supplier-cart-items/${existing.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              quantity:
                parseFloat(existing.quantity) + parseFloat(item.reorder_quantity),
            }),
          });
          console.log("🔁 Updated cart item:", item.name);
        } else {
          const newCart =
            cartId ||
            (
              await secureFetch("/supplier-carts", {
                method: "POST",
                body: JSON.stringify({ supplier_id: item.supplier_id }),
              })
            ).cart?.id;

          updatedCart = await secureFetch("/supplier-cart-items", {
            method: "POST",
            body: JSON.stringify({
              stock_id: item.stock_id,
              product_name: item.name.trim(),
              quantity: item.reorder_quantity,
              unit: item.unit.trim(),
              cart_id: newCart,
            }),
          });
          console.log("✅ Added new item to cart:", item.name);
        }

        if (onCartUpdated && updatedCart?.items) {
          onCartUpdated(updatedCart);
        }
      } catch (err) {
        console.error("❌ handleAddToCart error:", err.message);
      }
    },
    []
  );

  // ✅ Fetch stock & auto-add if below critical
  const fetchStock = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await secureFetch("/stock");
      const data = normalizeStockList(raw);
      setStock(data);

      if (import.meta.env.DEV && !debugLoggedRef.current) {
        debugLoggedRef.current = true;
        const rawPreview = Array.isArray(raw) ? raw[0] : raw;
        const sample = data?.[0];
        console.log("🧾 Stock debug (/stock)", {
          rawType: Array.isArray(raw) ? "array" : typeof raw,
          rawKeys:
            raw && !Array.isArray(raw) && typeof raw === "object"
              ? Object.keys(raw)
              : [],
          rawPreview,
          normalizedCount: Array.isArray(data) ? data.length : 0,
          sampleKeys: sample && typeof sample === "object" ? Object.keys(sample) : [],
          sample,
          parsedSample: sample
            ? {
                quantity: toNumber(sample.quantity),
                // common raw fields (might be undefined)
                price_per_unit: sample.price_per_unit,
                unit_price: sample.unit_price,
                purchase_price: sample.purchase_price,
                cost_per_unit: sample.cost_per_unit,
                total_value: sample.total_value,
                // what the UI will use
                computedPricePerUnit: getPricePerUnit(sample),
              }
            : null,
        });
      }

      // Load existing cart items per supplier
      const supplierCartMap = {};
      const supplierIds = [...new Set(data.map((d) => d.supplier_id).filter(Boolean))];
      for (const sid of supplierIds) {
        try {
          const cartData = await secureFetch(`/supplier-carts/items?supplier_id=${sid}`);
          supplierCartMap[sid] = cartData.items;
        } catch {}
      }

      for (const item of data) {
        if (!item.supplier_id || !item.reorder_quantity) continue;

        try {
          const { stock } = await secureFetch(`/stock/${item.id}`);

          if (!stock) continue;

          const quantity = toNumber(stock.quantity);
          const critical = toNumber(stock.critical_quantity);

          if (quantity > critical) {
            console.log(`🟢 ${item.name} above critical (${quantity} > ${critical}) — skip`);
            continue;
          }

          const existingItems = supplierCartMap[item.supplier_id] || [];
          const alreadyInCart = existingItems.some(
            (ci) =>
              ci.product_name.toLowerCase() === item.name.toLowerCase() &&
              ci.unit.toLowerCase() === item.unit.toLowerCase()
          );
          if (alreadyInCart) {
            console.log("🛑 Already in cart, skipping add:", item.name);
            continue;
          }

          const lastAuto = stock.last_auto_add_at ? new Date(stock.last_auto_add_at) : null;
          const now = new Date();
          const timeSinceLast = lastAuto ? now - lastAuto : Infinity;

          if (!lastAuto || timeSinceLast > 60000) {
            if (autoAddLocks.current.has(item.id)) {
              console.log("🚫 Duplicate add blocked for:", item.name);
              continue;
            }

            autoAddLocks.current.add(item.id);
            console.log("🧪 Critical hit for:", item.name);

            // ✅ Always use item.id as stock_id
            await handleAddToCart({
              stock_id: item.id,
              name: item.name,
              unit: item.unit,
              reorder_quantity: item.reorder_quantity,
              supplier_id: item.supplier_id,
            });

          await secureFetch(`/stock/${item.id}/flag-auto-added`, {
  method: "PATCH",
  body: JSON.stringify({ last_auto_add_at: new Date().toISOString() }),
});


            autoAddLocks.current.delete(item.id);
          } else {
            console.log("🔒 Already auto-added recently:", item.name);
          }
        } catch (err) {
          console.error(`❌ Auto-add failed for ${item.name}:`, err.message);
        }
      }

      // Regroup for UI (include price_per_unit so Stock page can show value)
      const refreshedRaw = await secureFetch("/stock");
      const refreshed = normalizeStockList(refreshedRaw);
      const missingPriceExamples = import.meta.env.DEV
        ? refreshed.filter((it) => getPricePerUnit(it) <= 0).slice(0, 10)
        : [];

      let ingredientPriceMap = null;
      const needsPriceFallback = refreshed.some((it) => getPricePerUnit(it) <= 0);
      if (needsPriceFallback) {
        const nowMs = Date.now();
        const cached = ingredientPriceCacheRef.current;
        const cacheFresh = cached?.map && nowMs - (cached.fetchedAt || 0) < 5 * 60 * 1000;
        if (cacheFresh) {
          ingredientPriceMap = cached.map;
        } else {
        try {
          const pricesRaw = await secureFetch("/ingredient-prices");
          const pricesList = normalizeIngredientPrices(pricesRaw);
          ingredientPriceMap = new Map();
          for (const p of pricesList) {
            const price = getPricePerUnit(p);
            if (!(price > 0)) continue;
            const supplier = p?.supplier_name ?? p?.supplier ?? "";
            ingredientPriceMap.set(makePriceKey(p?.name, p?.unit, supplier), price);
            ingredientPriceMap.set(makePriceKey(p?.name, p?.unit, ""), price);
          }
          ingredientPriceCacheRef.current = { map: ingredientPriceMap, fetchedAt: nowMs };

          if (import.meta.env.DEV) {
            console.log("🧾 Stock debug (price fallback)", {
              ingredientPricesCount: Array.isArray(pricesList) ? pricesList.length : 0,
              ingredientPriceMapSize: ingredientPriceMap.size,
              missingPriceExamples: missingPriceExamples.map((it) => ({
                id: it?.id,
                name: it?.name,
                unit: it?.unit,
                supplier_name: it?.supplier_name,
                raw_price_per_unit: it?.price_per_unit,
              })),
            });
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn("⚠️ Stock price fallback failed (/ingredient-prices).", e);
          }
        }
        }
      }

      let supplierTxnPriceMapsBySupplierId = null;
      const needsSupplierTxnFallback = refreshed.some((it) => {
        const directPrice = getPricePerUnit(it);
        if (directPrice > 0) return false;
        if (!ingredientPriceMap) return true;
        const supplier = it?.supplier_name ?? "";
        const priceFromIngredientMap =
          ingredientPriceMap.get(makePriceKey(it?.name, it?.unit, supplier)) ??
          ingredientPriceMap.get(makePriceKey(it?.name, it?.unit, ""));
        return !(toNumber(priceFromIngredientMap) > 0);
      });

      if (needsSupplierTxnFallback) {
        const supplierIdsToFetch = Array.from(
          new Set(
            refreshed
              .filter((it) => {
                if (!(it?.supplier_id > 0)) return false;
                const directPrice = getPricePerUnit(it);
                if (directPrice > 0) return false;
                if (!ingredientPriceMap) return true;
                const supplier = it?.supplier_name ?? "";
                const priceFromIngredientMap =
                  ingredientPriceMap.get(makePriceKey(it?.name, it?.unit, supplier)) ??
                  ingredientPriceMap.get(makePriceKey(it?.name, it?.unit, ""));
                return !(toNumber(priceFromIngredientMap) > 0);
              })
              .map((it) => it.supplier_id)
          )
        );

        if (supplierIdsToFetch.length > 0) {
          supplierTxnPriceMapsBySupplierId = new Map();
          const cache = supplierTxnPriceCacheRef.current;
          const nowMs = Date.now();

          for (const sid of supplierIdsToFetch) {
            const cachedEntry = cache.bySupplierId.get(sid);
            const isFresh =
              cachedEntry?.map && nowMs - (cachedEntry.fetchedAt || 0) < 5 * 60 * 1000;

            if (isFresh) {
              supplierTxnPriceMapsBySupplierId.set(sid, cachedEntry.map);
              continue;
            }

            try {
              const txRaw = await secureFetch(`/suppliers/${sid}/transactions`);
              const txns = normalizeSupplierTransactions(txRaw);

              const latestByNameUnit = new Map(); // name|unit -> { time, price }
              txns.forEach((txn) => {
                const rows = collectTxnRows(txn);
                rows.forEach((row) => {
                  const name = String(row?.name || "").trim();
                  const unit = String(row?.unit || "").trim();
                  if (!name || !unit) return;
                  if (name === "Payment" || name === "Compiled Receipt") return;

                  const price = computeTxnRowPrice(row);
                  if (!(price > 0)) return;

                  const time = toNumber(row?._time);
                  const k = makeNameUnitKey(name, unit);
                  const existing = latestByNameUnit.get(k);
                  if (!existing || time >= existing.time) {
                    latestByNameUnit.set(k, { time, price });
                  }
                });
              });

              const priceMap = new Map();
              latestByNameUnit.forEach((v, k) => priceMap.set(k, v.price));

              supplierTxnPriceMapsBySupplierId.set(sid, priceMap);
              cache.bySupplierId.set(sid, { map: priceMap, fetchedAt: nowMs });
            } catch (e) {
              if (import.meta.env.DEV) {
                console.warn(`⚠️ Stock supplier txn price fallback failed (supplier_id=${sid}).`, e);
              }
            }
          }

          if (import.meta.env.DEV) {
            const potato = refreshed.find(
              (it) => String(it?.name || "").trim().toLowerCase() === "potato"
            );
            const potatoSid = potato?.supplier_id;
            const potatoTxPrice =
              potatoSid && supplierTxnPriceMapsBySupplierId?.get(potatoSid)
                ? supplierTxnPriceMapsBySupplierId
                    .get(potatoSid)
                    .get(makeNameUnitKey(potato?.name, potato?.unit)) || 0
                : 0;

            console.log("🧾 Stock debug (supplier txn fallback)", {
              supplierIdsFetched: supplierIdsToFetch,
              suppliersWithPriceMaps: supplierTxnPriceMapsBySupplierId.size,
              potatoSupplierId: potatoSid ?? null,
              potatoTxnFallbackPrice: potatoTxPrice,
            });
          }
        }
      }

      const grouped = Object.values(
        refreshed.reduce((acc, item) => {
          const nameKey = String(item?.name || "").toLowerCase();
          const unitKey = String(item?.unit || "");
          const key = `${nameKey}_${unitKey}`;
          const quantity = toNumber(item?.quantity);
          const directPricePerUnit = getPricePerUnit(item);
          const fallbackPricePerUnit = ingredientPriceMap
            ? ingredientPriceMap.get(
                makePriceKey(item?.name, item?.unit, item?.supplier_name ?? "")
              ) ??
              ingredientPriceMap.get(makePriceKey(item?.name, item?.unit, ""))
            : 0;
          const supplierTxnFallbackPricePerUnit =
            supplierTxnPriceMapsBySupplierId && item?.supplier_id
              ? supplierTxnPriceMapsBySupplierId
                  .get(item.supplier_id)
                  ?.get(makeNameUnitKey(item?.name, item?.unit)) || 0
              : 0;

          const pricePerUnit =
            directPricePerUnit > 0
              ? directPricePerUnit
              : toNumber(fallbackPricePerUnit) > 0
                ? toNumber(fallbackPricePerUnit)
                : supplierTxnFallbackPricePerUnit;

          if (!acc[key]) {
            acc[key] = {
              name: item.name,
              quantity: 0,
              unit: item.unit,
              suppliers: new Set(),
              critical_quantity: item.critical_quantity || 0,
              reorder_quantity: item.reorder_quantity || 0,
              supplier_id: item.supplier_id || null,
              supplier_name: item.supplier_name || "",
              stock_id: item.id,
              expiry_date: item.expiry_date || null,
              // track aggregate value to compute average price per unit
              _total_value: 0,
            };
          }

          acc[key].quantity += quantity;
          acc[key].suppliers.add(item.supplier_name);
          acc[key]._total_value += quantity * pricePerUnit;

          if (item.expiry_date) {
            const candidate = new Date(item.expiry_date);
            if (!Number.isNaN(candidate.getTime())) {
              const existing = acc[key].expiry_date
                ? new Date(acc[key].expiry_date)
                : null;
              if (!existing || candidate < existing) {
                acc[key].expiry_date = item.expiry_date;
              }
            }
          }
          return acc;
        }, {})
      ).map((i) => {
        const totalValue = i._total_value || 0;
        const qty = i.quantity || 0;
        const avgPricePerUnit = qty ? totalValue / qty : 0;

        return {
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          critical_quantity: i.critical_quantity,
          reorder_quantity: i.reorder_quantity,
          supplier_id: i.supplier_id,
          supplier_name: i.supplier_name,
          stock_id: i.stock_id,
          expiry_date: i.expiry_date,
          supplier: Array.from(i.suppliers).join(", "),
          price_per_unit: avgPricePerUnit,
        };
      });

      if (import.meta.env.DEV && !debugGroupedLoggedRef.current) {
        debugGroupedLoggedRef.current = true;
        const sampleGrouped = grouped?.[0];
        console.log("🧾 Stock debug (grouped)", {
          groupedCount: Array.isArray(grouped) ? grouped.length : 0,
          sampleGroupedKeys:
            sampleGrouped && typeof sampleGrouped === "object"
              ? Object.keys(sampleGrouped)
              : [],
          sampleGrouped,
          computed: sampleGrouped
            ? {
                quantity: toNumber(sampleGrouped.quantity),
                price_per_unit: toNumber(sampleGrouped.price_per_unit),
                total_value:
                  toNumber(sampleGrouped.quantity) *
                  toNumber(sampleGrouped.price_per_unit),
              }
            : null,
        });
      }

      setGroupedData(grouped);
    } catch (error) {
      console.error("❌ fetchStock error:", error.message);
    } finally {
      setLoading(false);
    }
  }, [handleAddToCart]);

  // ✅ Socket listener for real-time auto-add
 useEffect(() => {
  const onStockUpdated = () => {
    console.log("📡 Stock updated event → refreshing...");
    fetchStock();
  };
  socket.on("stock-updated", onStockUpdated);
  return () => socket.off("stock-updated", onStockUpdated);
}, [fetchStock]);


  return (
    <StockContext.Provider
      value={{
        stock,
        groupedData,
        loading,
        fetchStock,
        handleAddToCart,
        setGroupedData,
      }}
    >
      {children}
    </StockContext.Provider>
  );
};
