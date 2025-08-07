import React, { useState, useEffect } from "react";

// Change to match your backend
const API_URL = import.meta.env.VITE_API_URL || "";

// Supported languages for the QR
const LANGS = [
  { code: "en", label: "🇺🇸 English" },
  { code: "tr", label: "🇹🇷 Türkçe" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "fr", label: "🇫🇷 Français" },
];

// --- HEADER ---
function QrHeader({ orderType, table, lang, setLang }) {
  return (
    <header className="w-full sticky top-0 z-50 flex items-center justify-between bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-blue-100 dark:border-zinc-800 shadow-lg px-4 py-3">
      <span className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent tracking-tight drop-shadow">
        Hurrybey
      </span>
      <span className="ml-3 text-lg font-bold text-blue-700 dark:text-blue-200 flex-1">
        {orderType === "table"
          ? (table ? `Table ${table}` : "")
          : "Online Order"}
      </span>
      <div>
        <select
          value={lang}
          onChange={e => setLang(e.target.value)}
          className="rounded-xl px-2 py-1 bg-white border text-sm font-semibold"
        >
          {LANGS.map(l => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
    </header>
  );
}

// --- ORDER TYPE MODAL ---
function OrderTypeSelect({ onSelect }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[340px] text-center">
        <h2 className="text-2xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">Order Type</h2>
        <button
          className="py-4 w-full mb-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-xl hover:scale-105 transition"
          onClick={() => onSelect("table")}
        >
          🍽️ Table Order
        </button>
        <button
          className="py-4 w-full rounded-2xl font-bold text-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-xl hover:scale-105 transition"
          onClick={() => onSelect("online")}
        >
          🏠 Delivery
        </button>
      </div>
    </div>
  );
}

// --- TABLE SELECT MODAL ---
function TableSelectModal({ onSelectTable, tableCount = 20, occupiedTables = [] }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[350px] text-center">
        <h2 className="text-xl font-bold mb-5 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">Choose Table</h2>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[...Array(tableCount)].map((_, i) => {
            const num = i + 1;
            const occ = occupiedTables.includes(num);
            return (
              <button
                key={i}
                disabled={occ}
                className={`rounded-xl font-bold py-3 text-lg transition relative ${occ
                  ? "bg-gray-300 text-gray-400 cursor-not-allowed"
                  : selected === num
                    ? "bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-400 text-white scale-105"
                    : "bg-gray-100 text-blue-700 hover:scale-105"}`}
                onClick={() => setSelected(num)}
              >
                {num}
                {occ && <span className="absolute left-1/2 -translate-x-1/2 text-[10px] bottom-1 text-red-600">Occupied</span>}
              </button>
            );
          })}
        </div>
        <button
          disabled={!selected}
          className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 shadow-lg text-lg disabled:opacity-60"
          onClick={() => onSelectTable(selected)}
        >
          Start Order
        </button>
      </div>
    </div>
  );
}

// --- ONLINE ORDER FORM ---
function OnlineOrderForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [touched, setTouched] = useState({});
  const validate = () => form.name && /^5\d{9}$/.test(form.phone) && form.address;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[350px] text-center">
        <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">Delivery Info</h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!validate()) {
              setTouched({ name: true, phone: true, address: true });
              return;
            }
            onSubmit(form);
          }}
          className="flex flex-col gap-3"
        >
          <input className="rounded-xl px-4 py-3 border" placeholder="Full Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={`rounded-xl px-4 py-3 border ${touched.phone && !/^5\d{9}$/.test(form.phone) ? "border-red-500" : ""}`} placeholder="Phone (5XXXXXXXXX)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))} maxLength={10} />
          <textarea className="rounded-xl px-4 py-3 border" placeholder="Address" rows={3} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          <button type="submit" disabled={submitting} className="w-full py-3 mt-2 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg">{submitting ? "Sending..." : "Continue"}</button>
        </form>
      </div>
    </div>
  );
}

// --- CATEGORIES BOTTOM BAR (scrollable on mobile) ---
function CategoryBar({ categories, activeCategory, setActiveCategory }) {
  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-zinc-900/95 border-t border-blue-100 z-50 flex overflow-x-auto gap-2 py-2 px-1 shadow-inner md:static md:bg-transparent md:shadow-none md:p-0">
      {categories.map(cat => (
        <button
          key={cat}
          className={`flex-1 px-4 py-2 rounded-2xl font-bold transition text-xs ${activeCategory === cat
            ? "bg-gradient-to-r from-fuchsia-400 via-blue-400 to-indigo-400 text-white scale-105 ring-2 ring-fuchsia-300"
            : "bg-gray-100 text-blue-700 hover:scale-105"}`}
          onClick={() => setActiveCategory(cat)}
        >{cat}</button>
      ))}
    </nav>
  );
}

// --- PRODUCT GRID ---
function ProductGrid({ products, onProductClick }) {
  return (
    <main className="w-full max-w-full pt-3 pb-28 px-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 overflow-hidden">
      {products.length === 0 && (
        <div className="col-span-full text-center text-gray-400 font-bold text-lg py-8">
          No products.
        </div>
      )}
      {products.map(product => (
        <div
          key={product.id}
          onClick={() => onProductClick(product)}
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-blue-100 shadow hover:shadow-2xl transition hover:scale-105 flex flex-col items-center p-2 cursor-pointer"
        >
          <img src={product.image ? (/^https?:\/\//.test(product.image) ? product.image : `${API_URL}/uploads/${product.image}`) : "https://via.placeholder.com/100?text=🍽️"} alt={product.name} className="w-16 h-16 object-cover rounded-xl mb-1 border shadow" />
          <div className="font-bold text-blue-900 dark:text-blue-200 text-xs text-center truncate w-full">{product.name}</div>
          <div className="mt-1 text-indigo-700 dark:text-indigo-300 font-extrabold text-lg text-center w-full">₺{parseFloat(product.price).toFixed(2)}</div>
        </div>
      ))}
    </main>
  );
}

// --- ADD TO CART MODAL (with extras logic from TransactionScreen) ---
function AddToCartModal({ open, product, extrasGroups, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    setQuantity(1);
    setSelectedExtras([]);
    setNote("");
  }, [product, open]);

  if (!open || !product) return null;

  const basePrice = parseFloat(product.price) || 0;
  const availableGroups = extrasGroups.filter(g => (product.selectedExtrasGroup || []).includes(g.groupName));
  const extrasTotal = selectedExtras.reduce((sum, ex) => sum + (parseFloat(ex.price || 0) * (ex.quantity || 1)), 0);
  const fullTotal = (basePrice + extrasTotal) * quantity;

  function handleToggleExtra(group, item, add) {
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
        return [...prev, { group: group.groupName, name: item.name, price: parseFloat(item.price || 0), quantity: 1 }];
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
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-2 py-7 bg-black/40">
      <div className="relative w-full max-w-[380px] sm:max-h-[98vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-y-auto">
        <button className="absolute right-3 top-3 z-20 bg-white border rounded-full w-9 h-9 flex items-center justify-center text-2xl text-gray-400 hover:text-red-400 hover:bg-red-50 shadow transition" onClick={onClose}>×</button>
        <div className="flex flex-col items-center p-5">
          <img src={product.image ? (/^https?:\/\//.test(product.image) ? product.image : `${API_URL}/uploads/${product.image}`) : "https://via.placeholder.com/120?text=🍽️"} alt={product.name} className="w-24 h-24 object-cover rounded-2xl border shadow" />
          <div className="font-extrabold text-lg text-blue-800 text-center mt-2 mb-1">{product.name}</div>
          <div className="text-base text-indigo-800 text-center mb-2">₺{basePrice.toFixed(2)}</div>
        </div>
        {availableGroups.length > 0 && (
          <div className="px-5 mb-3">
            {availableGroups.map(group => (
              <div key={group.groupName} className="mb-2">
                <div className="font-semibold text-blue-700 mb-1 text-sm">{group.groupName}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(group.items || []).map(item => {
                    const sel = selectedExtras.find(ex => ex.group === group.groupName && ex.name === item.name);
                    return (
                      <div key={item.name} className="flex flex-col items-center bg-blue-50 border border-blue-100 rounded-xl px-2 py-2 min-h-[78px] shadow">
                        <span className="font-medium truncate">{item.name}</span>
                        <span className="text-xs text-indigo-700 font-bold">₺{parseFloat(item.price || 0)}</span>
                        <div className="flex items-center justify-center gap-2 mt-2">
                          <button className="w-7 h-7 rounded-full bg-indigo-200 text-base font-bold" onClick={() => handleToggleExtra(group, item, false)} disabled={!sel || sel.quantity === 0}>–</button>
                          <span className="w-5 text-center font-bold text-blue-800">{sel?.quantity || 0}</span>
                          <button className="w-7 h-7 rounded-full bg-indigo-200 text-base font-bold" onClick={() => handleToggleExtra(group, item, true)}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="px-5 mb-2">
          <textarea className="w-full rounded-xl border p-2 text-sm" placeholder="Add a note (optional)..." value={note} onChange={e => setNote(e.target.value)} rows={2} />
        </div>
        <div className="w-full bg-gradient-to-t from-blue-50 via-white to-white sticky bottom-0 px-5 py-4 flex flex-col gap-2 border-t border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-gray-200 text-xl font-bold" onClick={() => setQuantity(q => Math.max(q - 1, 1))}>–</button>
              <span className="text-xl font-extrabold min-w-[40px] text-center">{quantity}</span>
              <button className="w-8 h-8 rounded-full bg-gray-200 text-xl font-bold" onClick={() => setQuantity(q => q + 1)}>+</button>
            </div>
            <div className="text-lg font-extrabold text-indigo-700">₺{fullTotal.toFixed(2)}</div>
          </div>
          <button className="w-full py-3 mt-2 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg hover:scale-105" onClick={() => {
            const unique_id = product.id + "-" + btoa(JSON.stringify(selectedExtras) + note);
            onAddToCart({
              id: product.id,
              name: product.name,
              price: basePrice + extrasTotal,
              quantity,
              extras: selectedExtras.filter(e => e.quantity > 0),
              note,
              unique_id,
            });
          }}>Add to Cart</button>
        </div>
      </div>
    </div>
  );
}

// --- CART DRAWER (slide up on mobile, sidebar on desktop) ---
function CartDrawer({ cart, setCart, onSubmitOrder, orderType, paymentMethod, setPaymentMethod, submitting }) {
  const [show, setShow] = useState(false);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    setShow(cart.length > 0);
  }, [cart.length]);

  function removeItem(idx) {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      {/* Button floating for mobile */}
      {!show && cart.length > 0 && (
        <button className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-7 rounded-3xl shadow-xl z-50" onClick={() => setShow(true)}>
          🛒 View Cart ({cart.length})
        </button>
      )}
      {/* Drawer */}
      {show && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/30">
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-bold text-blue-800">🛒 Your Order</span>
              <button className="text-2xl text-gray-400 hover:text-red-500" onClick={() => setShow(false)}>×</button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[48vh]">
              {cart.length === 0 ? (
                <div className="text-gray-400 text-center py-8">Cart is empty.</div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {cart.map((item, i) => (
                    <li key={i} className="flex items-center justify-between border-b border-blue-100 pb-2">
                      <div>
                        <span className="font-bold">{item.name} <span className="text-xs text-gray-500">x{item.quantity}</span></span>
                        {item.extras && item.extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.extras.map((ex, j) => (
                              <span key={j} className="inline-block px-2 py-0.5 bg-indigo-100 text-xs rounded-full">{ex.name} ×{ex.quantity || 1}</span>
                            ))}
                          </div>
                        )}
                        {item.note && <div className="text-xs text-yellow-700">{item.note}</div>}
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-indigo-700">₺{(item.price * item.quantity).toFixed(2)}</span>
                        <button className="text-xs text-red-400 hover:text-red-700 mt-1" onClick={() => removeItem(i)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {cart.length > 0 && (
              <>
                <div className="flex justify-between text-base font-bold mt-5 mb-3">
                  <span>Total:</span>
                  <span className="text-indigo-700 text-xl">₺{total.toFixed(2)}</span>
                </div>
                {orderType === "online" && (
                  <div className="flex flex-col gap-2 mb-2">
                    <label className="font-bold text-blue-900">Payment:</label>
                    <select className="rounded-xl px-2 py-1 border" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                      <option value="cash">💵 Cash</option>
                      <option value="card">💳 Credit Card</option>
                      <option value="online">🌐 Online Payment</option>
                    </select>
                  </div>
                )}
                <button className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 mt-3 text-lg shadow-lg hover:scale-105 transition" onClick={onSubmitOrder} disabled={submitting}>
                  {submitting ? "Sending..." : "Submit Order"}
                </button>
                <button className="w-full mt-2 py-2 rounded-lg font-medium text-xs text-gray-700 bg-gray-100 hover:bg-red-50 transition" onClick={() => setCart([])}>
                  Clear Cart
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// --- ORDER STATUS MODAL ---
function OrderStatusModal({ open, status, orderId, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full text-center">
        <h2 className="text-2xl font-extrabold mb-5 bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          {status === "success"
            ? "✅ Order Sent!"
            : status === "pending"
              ? "⏳ Sending Order..."
              : "❌ Order Failed"}
        </h2>
        <div className="text-lg text-blue-900 mb-6">
          {status === "success"
            ? "Thank you! Your order has been received."
            : status === "pending"
              ? "Please wait..."
              : "Something went wrong. Please try again."}
        </div>
        {orderId && (
          <div className="mb-4 font-mono text-sm text-gray-500">
            Order ID: {orderId}
          </div>
        )}
        <button
          className="py-3 px-6 rounded-xl bg-blue-500 text-white font-bold shadow hover:bg-blue-600 transition"
          onClick={onClose}
        >
          {status === "success" ? "Order Another" : "Close"}
        </button>
      </div>
    </div>
  );
}

// === MAIN QR MENU PAGE ===
export default function QrMenu() {
  const [orderType, setOrderType] = useState(null);
  const [table, setTable] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem("qr_cart");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [showStatus, setShowStatus] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [lang, setLang] = useState(LANGS[0].code);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem("qr_cart", JSON.stringify(cart));
  }, [cart]);

  // Fetch initial data
  useEffect(() => {
    fetch(`${API_URL}/api/products`)
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))].filter(Boolean);
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      });
    fetch(`${API_URL}/api/extras-groups`)
      .then(res => res.json())
      .then(data => setExtrasGroups(data));
    // Get occupied tables
    fetch(`${API_URL}/api/orders`)
      .then(res => res.json())
      .then(orders => {
        const occupied = orders
          .filter(order => order.table_number && order.status !== "closed")
          .map(order => Number(order.table_number));
        setOccupiedTables(occupied);
      });
  }, []);

  // Order flow
  if (!orderType)
    return <OrderTypeSelect onSelect={setOrderType} />;
  if (orderType === "table" && !table)
    return <TableSelectModal onSelectTable={setTable} occupiedTables={occupiedTables} />;
  if (orderType === "online" && !customerInfo)
    return <OnlineOrderForm onSubmit={info => setCustomerInfo(info)} submitting={submitting} />;

  // --- SUBMIT ORDER ---
  async function handleSubmitOrder() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setShowStatus(true);
    setOrderStatus("pending");
    try {
      // Table order
      if (orderType === "table") {
        const orderRes = await fetch(`${API_URL}/api/orders`, {
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
              confirmed: true,
            })),
            order_type: "table",
          }),
        });
        const order = await orderRes.json();
        setOrderId(order.id);
        setOrderStatus(orderRes.ok ? "success" : "fail");
      } else {
        // Online order (address-based triggers driver logic)
        const orderRes = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
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
            order_type: "packet",
            customer_name: customerInfo.name,
            customer_phone: customerInfo.phone,
            customer_address: customerInfo.address,
            payment_method: paymentMethod,
          }),
        });
        const order = await orderRes.json();
        setOrderId(order.id);
        setOrderStatus(orderRes.ok ? "success" : "fail");
      }
      setCart([]);
      localStorage.removeItem("qr_cart");
    } catch (e) {
      setOrderStatus("fail");
    } finally {
      setSubmitting(false);
    }
  }

  // Reset for another order
  function handleReset() {
    setOrderStatus("pending");
    setShowStatus(false);
    setOrderId(null);
    setCart([]);
    localStorage.removeItem("qr_cart");
    if (orderType === "table") setTable(null);
    else setCustomerInfo(null);
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <QrHeader orderType={orderType} table={table} lang={lang} setLang={setLang} />
<div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 w-full">
  <ProductGrid
    products={products.filter((p) => p.category === activeCategory)}
    onProductClick={product => {
      setSelectedProduct(product);
      setShowAddModal(true);
    }}
  />
</div>

<CategoryBar
  categories={categories}
  activeCategory={activeCategory}
  setActiveCategory={setActiveCategory}
/>

      <CartDrawer
        cart={cart}
        setCart={setCart}
        orderType={orderType}
        onSubmitOrder={handleSubmitOrder}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        submitting={submitting}
      />
      <AddToCartModal
        open={showAddModal}
        product={selectedProduct}
        extrasGroups={extrasGroups}
        onClose={() => setShowAddModal(false)}
        onAddToCart={item => {
          setCart(prev => {
            const idx = prev.findIndex(x => x.unique_id === item.unique_id);
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
      <OrderStatusModal
        open={showStatus}
        status={orderStatus}
        orderId={orderId}
        onClose={handleReset}
      />
    </div>
  );
}
