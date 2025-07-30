import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const StockContext = createContext();
const API_URL = import.meta.env.VITE_API_URL || "";
export const useStock = () => useContext(StockContext);

export const StockProvider = ({ children }) => {
  const [stock, setStock] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const recentlyArchived = useRef(new Set());
  const autoAddLocks = useRef(new Set());

  const handleAddToCart = useCallback(async (item) => {
  try {
    if (!item.stock_id || !item.supplier_id) return;

    // ✅ Live check
    const res = await fetch(`${API_URL}/api/stock/${item.stock_id}`);
    const { stock } = await res.json();
    if (!stock) return;

    const quantity = parseFloat(stock.quantity);
    const critical = parseFloat(stock.critical_quantity || 0);
    if (quantity > critical) {
      console.log(`🛑 ${item.name} not critical (${quantity} > ${critical}), skipping`);
      return;
    }

    // 🔁 cart setup
    const checkRes = await fetch(`${API_URL}/api/supplier-carts/items?supplier_id=${item.supplier_id}`);
    const cartData = await checkRes.json();
    const cartId = cartData.cart_id;

    const existing = cartData.items?.find(
      (ci) => ci.product_name.toLowerCase() === item.name.toLowerCase() && ci.unit.toLowerCase() === item.unit.toLowerCase()
    );

    if (existing) {
      await fetch(`${API_URL}/api/supplier-cart-items/${existing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: parseFloat(existing.quantity) + parseFloat(item.reorder_quantity) }),
      });
      console.log("🔁 Updated cart item:", item.name);
    } else {
      const newCart = cartId || (await (await fetch("/api/supplier-carts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: item.supplier_id }),
      })).json()).cart?.id;

      await fetch("/api/supplier-cart-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  } catch (err) {
    console.error("❌ handleAddToCart error:", err.message);
  }
}, []);



 const fetchStock = useCallback(async () => {
  try {
    setLoading(true);

    const res = await fetch("/api/stock");
    const data = await res.json();
    setStock(data);

    // 🔁 Load existing cart items for all suppliers
    const supplierCartMap = {};
    const supplierIds = [...new Set(data.map((d) => d.supplier_id).filter(Boolean))];
    for (const sid of supplierIds) {
      try {
        const cartData = await fetchSupplierCartItems(sid);
supplierCartMap[sid] = cartData.items;

      } catch (e) {}
    }

    for (const item of data) {
      if (!item.supplier_id || !item.reorder_quantity) continue;

      try {
        const stockRes = await fetch(`${API_URL}/api/stock/${item.id}`);
        const { stock } = await stockRes.json();
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

          await handleAddToCart({
            stock_id: item.id,
            name: item.name,
            unit: item.unit,
            reorder_quantity: item.reorder_quantity,
            supplier_id: item.supplier_id,
          });

          await fetch(`${API_URL}/api/stock/${item.id}/flag-auto-added`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
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

    // 💡 Regroup for UI
    const refreshRes = await fetch("/api/stock");
    const refreshed = await refreshRes.json();

    const grouped = Object.values(
      refreshed.reduce((acc, item) => {
        const key = `${item.name.toLowerCase()}_${item.unit}`;
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
          };
        }
        acc[key].quantity += parseFloat(item.quantity);
        acc[key].suppliers.add(item.supplier_name);
        return acc;
      }, {})
    ).map((i) => ({
      ...i,
      supplier: Array.from(i.suppliers).join(", "),
    }));

    setGroupedData(grouped);
  } catch (error) {
    console.error("❌ fetchStock error:", error.message);
  } finally {
    setLoading(false);
  }
}, [handleAddToCart]);


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
