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
  const socketRefreshTimerRef = useRef(null);
  const stockCursorRef = useRef("");

  const buildGroupedStock = useCallback((rows) => {
    const grouped = Object.values(
      (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
        const nameKey = String(item?.name || "").trim().toLowerCase();
        const unitKey = String(item?.unit || "").trim().toLowerCase();
        const key = `${nameKey}_${unitKey}`;
        const quantity = toNumber(item?.quantity);
        const pricePerUnit = getPricePerUnit(item);

        if (!acc[key]) {
          acc[key] = {
            name: item?.name || "",
            quantity: 0,
            unit: item?.unit || "",
            suppliers: new Set(),
            critical_quantity: item?.critical_quantity || 0,
            reorder_quantity: item?.reorder_quantity || 0,
            supplier_id: item?.supplier_id || null,
            supplier_name: item?.supplier_name || "",
            stock_id: item?.id,
            expiry_date: item?.expiry_date || null,
            _total_value: 0,
          };
        }

        acc[key].quantity += quantity;
        if (item?.supplier_name) {
          acc[key].suppliers.add(item.supplier_name);
        }
        acc[key]._total_value += quantity * pricePerUnit;

        if (item?.expiry_date) {
          const candidate = new Date(item.expiry_date);
          if (!Number.isNaN(candidate.getTime())) {
            const existing = acc[key].expiry_date ? new Date(acc[key].expiry_date) : null;
            if (!existing || candidate < existing) {
              acc[key].expiry_date = item.expiry_date;
            }
          }
        }

        return acc;
      }, {})
    ).map((entry) => {
      const totalValue = entry._total_value || 0;
      const qty = entry.quantity || 0;
      return {
        name: entry.name,
        quantity: entry.quantity,
        unit: entry.unit,
        critical_quantity: entry.critical_quantity,
        reorder_quantity: entry.reorder_quantity,
        supplier_id: entry.supplier_id,
        supplier_name: entry.supplier_name,
        stock_id: entry.stock_id,
        expiry_date: entry.expiry_date,
        supplier: Array.from(entry.suppliers).join(", "),
        price_per_unit: qty > 0 ? totalValue / qty : 0,
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
      });
    }

    return grouped;
  }, []);

  const commitStockRows = useCallback(
    (rows) => {
      const normalized = normalizeStockList(rows);
      setStock(normalized);
      setGroupedData(buildGroupedStock(normalized));
      return normalized;
    },
    [buildGroupedStock]
  );

  const getLatestStockCursor = useCallback((rows, fallback = "") => {
    let latestValue = fallback || "";
    let latestMs = Number.isFinite(Date.parse(fallback)) ? Date.parse(fallback) : 0;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const candidate = row?.updated_at || row?.created_at || "";
      const candidateMs = Date.parse(candidate);
      if (Number.isFinite(candidateMs) && candidateMs >= latestMs) {
        latestMs = candidateMs;
        latestValue = new Date(candidateMs).toISOString();
      }
    });
    return latestValue;
  }, []);

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
  const fetchStock = useCallback(async (options = {}) => {
    try {
      const incremental = options?.incremental === true;
      const since = incremental ? stockCursorRef.current : "";
      setLoading((prev) => (incremental ? prev : true));
      const path = since ? `/stock?since=${encodeURIComponent(since)}` : "/stock";
      const raw = await secureFetch(path);
      const normalized = normalizeStockList(raw);
      const data = incremental
        ? (() => {
            // Socket payloads patch locally first; this incremental fetch only reconciles missed rows.
            let merged = normalized;
            setStock((prev) => {
              const prevList = Array.isArray(prev) ? prev : [];
              const nextById = new Map(prevList.map((item) => [Number(item?.id), item]));
              normalized.forEach((item) => {
                const stockId = Number(item?.id);
                if (!Number.isFinite(stockId)) return;
                nextById.set(stockId, item);
              });
              merged = Array.from(nextById.values());
              setGroupedData(buildGroupedStock(merged));
              return merged;
            });
            return merged;
          })()
        : commitStockRows(normalized);
      stockCursorRef.current = getLatestStockCursor(normalized, since || stockCursorRef.current);

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

      const supplierIds = [...new Set(data.map((d) => d.supplier_id).filter(Boolean))];
      const supplierCartEntries = await Promise.all(
        supplierIds.map(async (sid) => {
          try {
            const cartData = await secureFetch(`/supplier-carts/items?supplier_id=${sid}`);
            return [sid, Array.isArray(cartData?.items) ? cartData.items : []];
          } catch {
            return [sid, []];
          }
        })
      );
      const supplierCartMap = Object.fromEntries(supplierCartEntries);

      for (const item of data) {
        if (!item.supplier_id || !item.reorder_quantity) continue;

        try {
          const quantity = toNumber(item.quantity);
          const critical = toNumber(item.critical_quantity);

          if (quantity > critical) {
            if (import.meta.env.DEV) {
              console.log(
                `🟢 ${item.name} above critical (${quantity} > ${critical}) — skip`
              );
            }
            continue;
          }

          const existingItems = supplierCartMap[item.supplier_id] || [];
          const alreadyInCart = existingItems.some(
            (ci) =>
              ci.product_name.toLowerCase() === item.name.toLowerCase() &&
              ci.unit.toLowerCase() === item.unit.toLowerCase()
          );
          if (alreadyInCart) {
            if (import.meta.env.DEV) {
              console.log("🛑 Already in cart, skipping add:", item.name);
            }
            continue;
          }

          const lastAuto = item.last_auto_add_at ? new Date(item.last_auto_add_at) : null;
          const now = new Date();
          const timeSinceLast = lastAuto ? now - lastAuto : Infinity;

          if (!lastAuto || timeSinceLast > 60000) {
            if (autoAddLocks.current.has(item.id)) {
              if (import.meta.env.DEV) {
                console.log("🚫 Duplicate add blocked for:", item.name);
              }
              continue;
            }

            autoAddLocks.current.add(item.id);
            if (import.meta.env.DEV) {
              console.log("🧪 Critical hit for:", item.name);
            }

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
            if (import.meta.env.DEV) {
              console.log("🔒 Already auto-added recently:", item.name);
            }
          }
        } catch (err) {
          console.error(`❌ Auto-add failed for ${item.name}:`, err.message);
        }
      }

    } catch (error) {
      console.error("❌ fetchStock error:", error.message);
    } finally {
      setLoading(false);
    }
  }, [buildGroupedStock, commitStockRows, getLatestStockCursor, handleAddToCart]);

  const applyStockDelta = useCallback(
    (payload = {}) => {
      const stockRow = payload?.stock && typeof payload.stock === "object" ? payload.stock : null;
      const stockId = Number(payload?.stockId ?? stockRow?.id);
      if (!Number.isFinite(stockId)) return false;

      setStock((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const next = payload?.deleted
          ? list.filter((item) => Number(item?.id) !== stockId)
          : (() => {
              let found = false;
              const mapped = list.map((item) => {
                if (Number(item?.id) !== stockId) return item;
                found = true;
                return { ...item, ...stockRow };
              });
              if (!found && stockRow) mapped.push(stockRow);
              return mapped;
            })();
        setGroupedData(buildGroupedStock(next));
        return next;
      });
      return true;
    },
    [buildGroupedStock]
  );

  useEffect(() => {
    const scheduleRefresh = () => {
      if (socketRefreshTimerRef.current) {
        window.clearTimeout(socketRefreshTimerRef.current);
      }
      socketRefreshTimerRef.current = window.setTimeout(() => {
        socketRefreshTimerRef.current = null;
        fetchStock({ incremental: true });
      }, 350);
    };

    const onStockUpdated = (payload = {}) => {
      if (!applyStockDelta(payload)) {
        scheduleRefresh();
      }
    };

    socket.on("stock-updated", onStockUpdated);
    return () => {
      socket.off("stock-updated", onStockUpdated);
      if (socketRefreshTimerRef.current) {
        window.clearTimeout(socketRefreshTimerRef.current);
        socketRefreshTimerRef.current = null;
      }
    };
  }, [applyStockDelta, fetchStock]);


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
