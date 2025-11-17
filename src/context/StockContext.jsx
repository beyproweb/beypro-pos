import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";

const StockContext = createContext();


export const useStock = () => useContext(StockContext);

export const StockProvider = ({ children }) => {
  const [stock, setStock] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const autoAddLocks = useRef(new Set());

  // ✅ Add to cart helper
  const handleAddToCart = useCallback(
    async (item, onCartUpdated) => {
      try {
        if (!item.stock_id || !item.supplier_id) return;

        const { stock } = await secureFetch(`/stock/${item.stock_id}`);
        if (!stock) return;

        const quantity = parseFloat(stock.quantity);
        const critical = parseFloat(stock.critical_quantity || 0);
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
      const data = await secureFetch("/stock");
      setStock(data);

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

          const quantity = parseFloat(stock.quantity);
          const critical = parseFloat(stock.critical_quantity || 0);

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
      const refreshed = await secureFetch("/stock");
      const grouped = Object.values(
        refreshed.reduce((acc, item) => {
          const key = `${item.name.toLowerCase()}_${item.unit}`;
          const quantity = parseFloat(item.quantity) || 0;
          const pricePerUnit = Number(item.price_per_unit) || 0;

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
