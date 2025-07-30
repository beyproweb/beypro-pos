import React, { useState, useEffect } from "react";

// --- 1. QR Header ---
function QrHeader({ table }) {
  return (
    <header className="w-full sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-lg border-b border-blue-100 dark:border-zinc-800 shadow-xl flex items-center px-5 py-2">
      <div className="flex-1 flex items-center gap-3">
        <span className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent">
          Beypro
        </span>
        <span className="text-lg font-bold text-blue-700 dark:text-blue-200 ml-4">
          {table ? `Table ${table}` : ""}
        </span>
      </div>
    </header>
  );
}

// --- 2. Table Selection Modal ---
function TableSelectModal({ onSelectTable, tableCount = 20, occupiedTables = [] }) {
  const [selected, setSelected] = useState(null);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center">
        <h2 className="text-2xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          Please select your table
        </h2>
        <div className="grid grid-cols-4 gap-4 justify-center mb-6">
          {[...Array(tableCount)].map((_, i) => {
            const tableNum = i + 1;
            const isOccupied = occupiedTables.includes(tableNum);
            return (
              <button
                key={i}
                onClick={() => !isOccupied && setSelected(tableNum)}
                className={`
                  rounded-2xl font-bold py-3 text-lg shadow
                  transition-all relative
                  ${isOccupied
                    ? "bg-gray-300 text-gray-500 opacity-60 cursor-not-allowed"
                    : selected === tableNum
                    ? "bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-400 text-white scale-110"
                    : "bg-gray-100 dark:bg-zinc-800 text-blue-700 dark:text-blue-100 hover:scale-105"}
                `}
                disabled={isOccupied}
                title={isOccupied ? "Occupied" : `Table ${tableNum}`}
              >
                {tableNum}
                {isOccupied && (
                  <span className="absolute text-[10px] left-1/2 -translate-x-1/2 bottom-1 text-red-700 font-semibold bg-white/80 rounded px-1 pointer-events-none">
                    Occupied
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          disabled={!selected}
          className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg text-lg disabled:opacity-60"
          onClick={() => selected && onSelectTable(selected)}
        >
          Start
        </button>
      </div>
    </div>
  );
}

// --- 3. Category Grid ---
function QrCategoryGrid({ categories, images, activeCategory, setActiveCategory }) {
  return (
    <aside className="md:w-[280px] w-full md:sticky top-16 bg-gradient-to-br from-blue-50 via-indigo-100 to-blue-200 dark:from-blue-950 dark:via-blue-900 dark:to-indigo-950 rounded-3xl p-3 m-5 shadow-2xl h-fit">
      <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`
              flex flex-col items-center justify-center rounded-2xl py-4
              shadow transition
              ${activeCategory === cat
                ? "bg-gradient-to-r from-fuchsia-400 via-blue-400 to-indigo-400 text-white scale-105 ring-2 ring-fuchsia-300"
                : "bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 hover:scale-105"}
            `}
          >
            {images[cat.trim().toLowerCase()] ? (
              <img
                src={
                  images[cat.trim().toLowerCase()]
                    ? `${window.location.origin.replace(':5173', ':5000')}/uploads/${images[cat.trim().toLowerCase()]}`
                    : ""
                }
                alt={cat}
                className="w-12 h-12 rounded-xl mb-1 object-cover border shadow"
              />
            ) : (
              <span className="text-3xl mb-1">{getCategoryIcon(cat)}</span>
            )}
            <span className="font-bold text-xs text-center">{cat}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
function getCategoryIcon(category) {
  const icons = {
    Meat: "🍔", Pizza: "🍕", Drinks: "🥤", Salad: "🥗", Dessert: "🍰", Breakfast: "🍳", Chicken: "🍗", default: "🍽️"
  };
  return icons[category] || icons.default;
}

// --- 4. Product Grid ---
function QrProductGrid({ products, onProductClick }) {
  return (
    <main className="flex-1 py-6 px-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
      {products.length === 0 && (
        <div className="col-span-full text-center text-gray-400 font-bold text-xl py-8">
          No products in this category.
        </div>
      )}
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => onProductClick(product)}
          className="bg-white/90 dark:bg-zinc-900 rounded-2xl border-2 border-blue-100/40 dark:border-zinc-800/40 shadow-md hover:shadow-2xl transition hover:scale-105 flex flex-col items-center p-3 cursor-pointer group"
        >
          <img
            src={
              product.image
                ? `${window.location.origin.replace(':5173', ':5000')}/uploads/${product.image}`
                : "https://via.placeholder.com/100?text=🍽️"
            }
            alt={product.name}
            className="w-20 h-20 object-cover rounded-xl mb-2 border shadow"
          />
          <div className="font-bold text-blue-900 dark:text-blue-200 text-xs text-center truncate w-full">
            {product.name}
          </div>
          <div className="mt-1 text-indigo-700 dark:text-indigo-300 font-extrabold text-lg text-center w-full">
            ₺{parseFloat(product.price).toFixed(2)}
          </div>
        </div>
      ))}
    </main>
  );
}

// --- 5. Cart Drawer/Sidebar ---
function QrCartDrawer({ cart, setCart, table, onSubmitOrder }) {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return (
    <aside className="md:w-[340px] w-full fixed md:static right-0 bottom-0 bg-white/95 dark:bg-zinc-900/95 rounded-t-2xl md:rounded-3xl shadow-2xl p-5 flex flex-col z-40">
      <h3 className="text-lg font-bold text-blue-800 dark:text-blue-200 mb-4">
        🛒 Your Order {table ? `(Table ${table})` : ""}
      </h3>
      <div className="flex-1 overflow-y-auto max-h-[60vh]">
        {cart.length === 0 ? (
          <div className="text-gray-400 text-center py-8">Cart is empty.</div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((item, i) => (
              <li key={i} className="flex items-center justify-between border-b border-blue-100 pb-2">
                <span className="font-bold">{item.name} <span className="text-xs text-gray-500">x{item.quantity}</span></span>
                <span className="font-bold text-indigo-700">₺{(item.price * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {cart.length > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-base font-bold">
            <span>Total:</span>
            <span className="text-indigo-700 text-xl">₺{total.toFixed(2)}</span>
          </div>
          <button
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 mt-3 text-lg shadow-lg hover:scale-105 transition"
            onClick={onSubmitOrder}
          >
            Submit Order
          </button>
          <button
            className="w-full mt-2 py-2 rounded-lg font-medium text-sm text-gray-700 bg-gray-100 hover:bg-red-50 transition"
            onClick={() => setCart([])}
          >
            Clear Cart
          </button>
        </div>
      )}
    </aside>
  );
}

// --- 6. Add to Cart Modal (2-column extras as before) ---
function AddToCartModal({ open, product, onClose, onAddToCart, extrasGroups }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [note, setNote] = useState("");

  const extrasGroupNames = product?.selectedExtrasGroup || [];
  const availableGroups = Array.isArray(extrasGroupNames)
    ? extrasGroupNames.map(name =>
        extrasGroups.find(g =>
          (g.groupName || g.group_name)?.toLowerCase() === name.toLowerCase()
        )
      ).filter(Boolean)
    : [];

  useEffect(() => {
    setQuantity(1);
    setSelectedExtras([]);
    setNote("");
  }, [product, open]);

  const validExtras = selectedExtras.filter(ex => ex.quantity > 0);
  const extrasTotal = validExtras.reduce(
    (sum, ex) => sum + (parseFloat(ex.price || ex.extraPrice || 0) * (ex.quantity || 1)),
    0
  );
  const basePrice = product ? parseFloat(product.price) || 0 : 0;
  const perItemTotal = basePrice + extrasTotal;
  const fullTotal = perItemTotal * quantity;

  const handleToggleExtra = (group, item, add) => {
    setSelectedExtras(prev => {
      const idx = prev.findIndex(
        ex => ex.group === group.groupName && ex.name === item.name
      );
      if (add) {
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx].quantity += 1;
          return copy;
        }
        return [
          ...prev,
          {
            group: group.groupName,
            name: item.name,
            price: parseFloat(item.price || item.extraPrice || 0),
            quantity: 1,
          },
        ];
      } else {
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx].quantity = Math.max(copy[idx].quantity - 1, 0);
          if (copy[idx].quantity === 0) copy.splice(idx, 1);
          return copy;
        }
        return prev;
      }
    });
  };

  if (!open || !product) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-2 py-6">
      <div className="relative w-full max-w-[420px] sm:max-h-[95vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-y-auto">
        {/* Close Button */}
        <button
          className="absolute right-3 top-3 z-20 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-full w-10 h-10 flex items-center justify-center text-2xl text-gray-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 shadow transition"
          onClick={onClose}
        >×</button>
        {/* Image */}
        <div className="w-full flex items-center justify-center pt-6 pb-3">
          <img
            src={
              product.image
                ? `${window.location.origin.replace(':5173', ':5000')}/uploads/${product.image}`
                : "https://via.placeholder.com/120?text=🍽️"
            }
            alt={product.name}
            className="w-28 h-28 object-cover rounded-2xl border shadow"
          />
        </div>
        {/* Title & Price */}
        <div className="px-5 pb-2">
          <div className="font-extrabold text-xl text-blue-800 dark:text-blue-200 text-center mb-1">{product.name}</div>
          <div className="text-base text-indigo-800 dark:text-indigo-300 text-center mb-2">
            ₺{parseFloat(product.price).toFixed(2)}
          </div>
        </div>
        {/* Extras */}
        {availableGroups.length > 0 && (
          <div className="px-5 mb-3 space-y-3">
            {availableGroups.map(group => (
              <div key={group.groupName || group.group_name}>
                <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1 text-sm">
                  {group.groupName || group.group_name}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Array.isArray(group.items) ? group.items : []).map(item => {
                    const sel = selectedExtras.find(
                      ex => ex.group === group.groupName && ex.name === item.name
                    );
                    return (
                      <div
                        key={item.name}
                        className="flex flex-col items-center justify-center bg-blue-50 dark:bg-zinc-800 border border-blue-100 dark:border-zinc-700 rounded-xl px-2 py-2 min-h-[82px] shadow"
                      >
                        {/* Name and price */}
                        <span className="font-medium truncate text-center">{item.name}</span>
                        <span className="text-xs text-indigo-700 font-bold text-center">₺{parseFloat(item.price || item.extraPrice || 0)}</span>
                        {/* Increments row */}
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <button
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-200 hover:bg-indigo-400 text-base font-bold"
                            onClick={() => handleToggleExtra(group, item, false)}
                            disabled={!sel || sel.quantity === 0}
                            style={{ lineHeight: "1" }}
                          >–</button>
                          <span className="w-5 text-center font-bold text-blue-800">{sel?.quantity || 0}</span>
                          <button
                            className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-200 hover:bg-indigo-400 text-base font-bold"
                            onClick={() => handleToggleExtra(group, item, true)}
                            style={{ lineHeight: "1" }}
                          >+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Note Input */}
        <div className="px-5 pb-2">
          <textarea
            className="w-full rounded-xl border border-blue-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-inner text-sm resize-none"
            placeholder="Add a note (optional)..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />
        </div>
        {/* Quantity & Total */}
        <div className="w-full bg-gradient-to-t from-blue-50 via-white/90 to-white dark:from-blue-900 dark:via-zinc-900/90 dark:to-zinc-900 sticky bottom-0 z-10 px-5 py-4 flex flex-col gap-2 border-t border-blue-100 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-indigo-200 text-xl font-bold"
                onClick={() => setQuantity(q => Math.max(q - 1, 1))}
              >–</button>
              <span className="text-xl font-extrabold min-w-[40px] text-center">{quantity}</span>
              <button
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-green-200 text-xl font-bold"
                onClick={() => setQuantity(q => q + 1)}
              >+</button>
            </div>
            <div className="text-lg font-extrabold text-indigo-700 dark:text-indigo-200">
              Total: ₺{fullTotal.toFixed(2)}
            </div>
          </div>
          <button
            className="w-full py-3 mt-2 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg hover:scale-105 transition"
            onClick={() => {
              const extrasPart = validExtras.map(ex => `${ex.group}:${ex.name}:${ex.quantity}`).join(",");
              const unique_id = extrasPart.length > 0
                ? `${product.id}-${btoa(extrasPart)}`
                : `${product.id}-NO_EXTRAS`;
              onAddToCart({
                id: product.id,
                name: product.name,
                price: perItemTotal,
                quantity,
                extras: validExtras,
                note,
                unique_id,
              });
            }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 7. MAIN PAGE ---
export default function QrMenu() {
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryImages, setCategoryImages] = useState({});
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
useEffect(() => {
  if (!window.socket) return;
  function refetchTables() {
    fetch("/api/orders")
      .then((res) => res.json())
      .then((orders) => {
        const occupied = orders
          .filter(order => order.table_number && order.status !== "closed")
          .map(order => Number(order.table_number));
        setOccupiedTables(occupied);
      });
  }
  window.socket.on("orders_updated", refetchTables);
  return () => window.socket.off("orders_updated", refetchTables);
}, []);

  // Fetch all required data
  useEffect(() => {
    // Products
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))].filter(Boolean);
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      });

    // Category Images
    fetch("/api/category-images")
      .then((res) => res.json())
      .then((rows) => {
        const dict = {};
        rows.forEach(({ category, image }) => {
          dict[category.trim().toLowerCase()] = image;
        });
        setCategoryImages(dict);
      });

    // Extras Groups
    fetch("/api/extras-groups")
      .then((res) => res.json())
      .then((data) => setExtrasGroups(data));
  }, []);

  // Fetch occupied tables: any table with a non-closed order is considered occupied
  useEffect(() => {
    async function fetchOccupiedTables() {
      try {
        const res = await fetch("/api/orders");
        const orders = await res.json();
        const occupied = orders
          .filter(order =>
            order.table_number &&
            order.status !== "closed"
          )
          .map(order => Number(order.table_number));
        setOccupiedTables(occupied);
      } catch (err) {
        setOccupiedTables([]);
      }
    }
    fetchOccupiedTables();
  }, []);

  // Order submission logic
  const handleQrSubmitOrder = async () => {
    if (!table || cart.length === 0) return;
    // 1. Try to find an open order for this table (status not closed)
    const orderRes = await fetch(`/api/orders?table_number=${table}`);
    const orders = await orderRes.json();
    let order = orders[0];
    let orderId;

    if (!order) {
      // 2. If not exists, create order
      const createRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table_number: table,
          total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
          items: cart.map(i => ({
            product_id: i.id,
            quantity: i.quantity,
            price: i.price,
            ingredients: i.ingredients || [],
            extras: i.extras || [],
            unique_id: i.unique_id,
            note: i.note || "",
            confirmed: true, // All QR orders are auto-confirmed
          })),
          order_type: "table",
        }),
      });
      order = await createRes.json();
      orderId = order.id;
    } else {
      orderId = order.id;
      // 3. Add new items to open order
      await fetch("/api/orders/order-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          items: cart.map(i => ({
            product_id: i.id,
            quantity: i.quantity,
            price: i.price,
            ingredients: i.ingredients || [],
            extras: i.extras || [],
            unique_id: i.unique_id,
            note: i.note || "",
            confirmed: true,
          })),
        }),
      });
      // Optionally, update status to confirmed
      await fetch(`/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" }),
      });
    }

    // 4. Clear QR cart
    setCart([]);
    alert("✅ Order sent! Your server has been notified.");
  };

  // If no table, show modal first
  if (!table) {
    return (
      <TableSelectModal
        onSelectTable={setTable}
        tableCount={20}
        occupiedTables={occupiedTables}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 flex flex-col">
      <QrHeader table={table} />
      <div className="flex-1 flex flex-col md:flex-row">
        <QrCategoryGrid
          categories={categories}
          images={categoryImages}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />
        <QrProductGrid
          products={products.filter((p) => p.category === activeCategory)}
          onProductClick={(product) => {
            setSelectedProduct(product);
            setShowAddModal(true);
          }}
        />
        <QrCartDrawer
          cart={cart}
          setCart={setCart}
          table={table}
          onSubmitOrder={handleQrSubmitOrder}
        />
      </div>
      <AddToCartModal
        open={showAddModal}
        product={selectedProduct}
        extrasGroups={extrasGroups}
        onClose={() => setShowAddModal(false)}
        onAddToCart={(item) => {
          setCart((prev) => {
            // If same unique_id, increment
            const idx = prev.findIndex((x) => x.unique_id === item.unique_id);
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx].quantity += item.quantity;
              return copy;
            }
            return [...prev, item];
          });
          setShowAddModal(false);
        }}
      />
    </div>
  );
}
