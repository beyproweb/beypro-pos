import React, { useState, useEffect } from "react";

// Edit this to match your deployment
const API_URL = import.meta.env.VITE_API_URL || "";

const PAYMENT_OPTIONS = [
  { label: "Cash", value: "cash", icon: "💵" },
  { label: "Credit Card", value: "card", icon: "💳" },
  { label: "Online Payment", value: "online", icon: "🌐" }
];

function QrHeader({ orderType, table }) {
  return (
    <header className="w-full sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/70 backdrop-blur-lg border-b border-blue-100 dark:border-zinc-800 shadow-xl flex items-center px-6 py-3">
      <span className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent tracking-tight drop-shadow">
        Hurrybey
      </span>
      <span className="ml-5 text-lg font-bold text-blue-700 dark:text-blue-200">
        {orderType === "table" ? (table ? `Table ${table}` : "") : "Online Order"}
      </span>
    </header>
  );
}

// 1. First choice modal: Table or Online Order
function OrderTypeSelect({ onSelect }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">
        <h2 className="text-3xl font-extrabold mb-5 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          How would you like to order?
        </h2>
        <div className="flex flex-col gap-4">
          <button
            className="py-4 rounded-2xl font-bold text-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-xl hover:scale-105 transition"
            onClick={() => onSelect("table")}
          >
            🍽️ Order at Table
          </button>
          <button
            className="py-4 rounded-2xl font-bold text-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-xl hover:scale-105 transition"
            onClick={() => onSelect("online")}
          >
            🏠 Order for Delivery
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. Table select modal (if table)
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

// 3. Online order info form
function OnlineOrderForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({
    name: "", phone: "", address: ""
  });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState("");
  const validate = () =>
    form.name.trim() && /^5\d{9}$/.test(form.phone.trim()) && form.address.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center">
        <h2 className="text-2xl font-extrabold mb-4 bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          Delivery Info
        </h2>
        <form
          onSubmit={e => {
            e.preventDefault();
            if (!validate()) {
              setTouched({ name: true, phone: true, address: true });
              setError("Please fill out all fields correctly.");
              return;
            }
            setError("");
            onSubmit(form);
          }}
          className="flex flex-col gap-4 text-left"
        >
          <input
            className="rounded-xl px-4 py-3 border border-blue-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow"
            placeholder="Full Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onBlur={() => setTouched(t => ({ ...t, name: true }))}
            required
          />
          <input
            className={`rounded-xl px-4 py-3 border ${touched.phone && !/^5\d{9}$/.test(form.phone.trim()) ? "border-red-500" : "border-blue-200"} dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow`}
            placeholder="Phone (5XXXXXXXXX)"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))}
            onBlur={() => setTouched(t => ({ ...t, phone: true }))}
            required
            inputMode="numeric"
            maxLength={10}
          />
          <textarea
            className="rounded-xl px-4 py-3 border border-blue-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow"
            placeholder="Address"
            rows={3}
            value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            onBlur={() => setTouched(t => ({ ...t, address: true }))}
            required
          />
          {error && <div className="text-red-500 font-bold">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 mt-3 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg hover:scale-105 transition"
          >
            {submitting ? "Sending..." : "Continue to Menu"}
          </button>
        </form>
      </div>
    </div>
  );
}

// 4. Category Sidebar
function CategorySidebar({ categories, images, activeCategory, setActiveCategory }) {
  return (
    <aside className="md:w-[220px] w-full md:sticky top-20 bg-gradient-to-br from-blue-50 via-indigo-100 to-blue-200 dark:from-blue-950 dark:via-blue-900 dark:to-indigo-950 rounded-3xl p-2 m-4 shadow-2xl h-fit">
      <div className="flex md:flex-col gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`
              flex flex-col items-center justify-center rounded-2xl py-3
              shadow transition
              ${activeCategory === cat
                ? "bg-gradient-to-r from-fuchsia-400 via-blue-400 to-indigo-400 text-white scale-105 ring-2 ring-fuchsia-300"
                : "bg-white/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 hover:scale-105"}
            `}
          >
            {images[cat.trim().toLowerCase()] ? (
              <img
                src={
                  /^https?:\/\//.test(images[cat.trim().toLowerCase()])
                    ? images[cat.trim().toLowerCase()]
                    : `${API_URL}/uploads/${images[cat.trim().toLowerCase()]}`
                }
                alt={cat}
                className="w-10 h-10 rounded-xl mb-1 object-cover border shadow"
              />
            ) : (
              <span className="text-2xl mb-1">🍽️</span>
            )}
            <span className="font-bold text-xs text-center">{cat}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

// 5. Product Grid
function ProductGrid({ products, onProductClick }) {
  return (
    <main className="flex-1 py-5 px-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
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
                ? /^https?:\/\//.test(product.image)
                  ? product.image
                  : `${API_URL}/uploads/${product.image}`
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

// 6. Cart Drawer/Sidebar with payment for online order
function CartDrawer({ cart, setCart, onSubmitOrder, orderType, onPaymentChange, paymentMethod, submitting }) {
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return (
    <aside className="md:w-[320px] w-full fixed md:static right-0 bottom-0 bg-white/95 dark:bg-zinc-900/95 rounded-t-2xl md:rounded-3xl shadow-2xl p-5 flex flex-col z-40">
      <h3 className="text-lg font-bold text-blue-800 dark:text-blue-200 mb-4">
        🛒 Your Order
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
          {orderType === "online" && (
            <div className="flex flex-col gap-2 my-2">
              <label className="font-bold text-blue-900">Payment:</label>
              <div className="flex gap-2">
                {PAYMENT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onPaymentChange(opt.value)}
                    className={`
                      px-3 py-2 rounded-lg font-medium text-sm border shadow
                      ${paymentMethod === opt.value
                        ? "bg-gradient-to-r from-fuchsia-400 to-indigo-500 text-white"
                        : "bg-gray-100 dark:bg-zinc-800 text-blue-700 dark:text-blue-100"}
                    `}
                  >
                    <span className="mr-1">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 mt-3 text-lg shadow-lg hover:scale-105 transition"
            onClick={onSubmitOrder}
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Submit Order"}
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

// 7. Add to Cart Modal (EXTRAS + note)
function AddToCartModal({ open, product, onClose, onAddToCart, extrasGroups }) {
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
  const extrasTotal = selectedExtras.reduce(
    (sum, ex) => sum + (parseFloat(ex.price || 0) * (ex.quantity || 1)),
    0
  );
  const fullTotal = (basePrice + extrasTotal) * quantity;

  // Find extras group by product category, fallback to none
  const availableGroups = extrasGroups.filter(g =>
    (product.selectedExtrasGroup || []).includes(g.groupName)
  );

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
        return [
          ...prev,
          {
            group: group.groupName,
            name: item.name,
            price: parseFloat(item.price || 0),
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
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-2 py-6">
      <div className="relative w-full max-w-[420px] sm:max-h-[95vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-y-auto">
        <button
          className="absolute right-3 top-3 z-20 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-full w-10 h-10 flex items-center justify-center text-2xl text-gray-400 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 shadow transition"
          onClick={onClose}
        >×</button>
        <div className="w-full flex items-center justify-center pt-6 pb-3">
          <img
            src={
              product.image
                ? /^https?:\/\//.test(product.image)
                  ? product.image
                  : `${API_URL}/uploads/${product.image}`
                : "https://via.placeholder.com/120?text=🍽️"
            }
            alt={product.name}
            className="w-28 h-28 object-cover rounded-2xl border shadow"
          />
        </div>
        <div className="px-5 pb-2">
          <div className="font-extrabold text-xl text-blue-800 dark:text-blue-200 text-center mb-1">{product.name}</div>
          <div className="text-base text-indigo-800 dark:text-indigo-300 text-center mb-2">
            ₺{parseFloat(product.price).toFixed(2)}
          </div>
        </div>
        {availableGroups.length > 0 && (
          <div className="px-5 mb-3 space-y-3">
            {availableGroups.map(group => (
              <div key={group.groupName}>
                <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1 text-sm">
                  {group.groupName}
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
                        <span className="font-medium truncate text-center">{item.name}</span>
                        <span className="text-xs text-indigo-700 font-bold text-center">₺{parseFloat(item.price || 0)}</span>
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
        <div className="px-5 pb-2">
          <textarea
            className="w-full rounded-xl border border-blue-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-inner text-sm resize-none"
            placeholder="Add a note (optional)..."
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
          />
        </div>
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
            }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

// 8. Order Status/Confirmation
function OrderStatusModal({ open, status, orderId, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center">
        <h2 className="text-2xl font-extrabold mb-5 bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          {status === "success"
            ? "✅ Order Sent!"
            : status === "pending"
            ? "⏳ Sending Order..."
            : "❌ Order Failed"}
        </h2>
        <div className="text-lg text-blue-900 dark:text-blue-100 mb-6">
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

// Main QR Page
export default function QRMenuModern() {
  const [orderType, setOrderType] = useState(null); // "table" | "online"
  const [table, setTable] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null); // {name, phone, address}
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryImages, setCategoryImages] = useState({});
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
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);

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
    fetch(`${API_URL}/api/category-images`)
      .then(res => res.json())
      .then(rows => {
        const dict = {};
        rows.forEach(({ category, image }) => {
          dict[category.trim().toLowerCase()] = image;
        });
        setCategoryImages(dict);
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

  // Table or Online selection logic
  if (!orderType)
    return <OrderTypeSelect onSelect={setOrderType} />;
  if (orderType === "table" && !table)
    return <TableSelectModal onSelectTable={setTable} occupiedTables={occupiedTables} />;
  if (orderType === "online" && !customerInfo)
    return <OnlineOrderForm onSubmit={info => setCustomerInfo(info)} submitting={submitting} />;

  // Submit order to backend
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
        // Online order
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
            order_type: "phone", // or "packet" if that's your logic
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

  // Reset order process
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 flex flex-col">
      <QrHeader orderType={orderType} table={table} />
      <div className="flex-1 flex flex-col md:flex-row">
        <CategorySidebar
          categories={categories}
          images={categoryImages}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
        />
        <ProductGrid
          products={products.filter((p) => p.category === activeCategory)}
          onProductClick={(product) => {
            setSelectedProduct(product);
            setShowAddModal(true);
          }}
        />
        <CartDrawer
          cart={cart}
          setCart={setCart}
          orderType={orderType}
          onSubmitOrder={handleSubmitOrder}
          paymentMethod={paymentMethod}
          onPaymentChange={setPaymentMethod}
          submitting={submitting}
        />
      </div>
      <AddToCartModal
        open={showAddModal}
        product={selectedProduct}
        extrasGroups={extrasGroups}
        onClose={() => setShowAddModal(false)}
        onAddToCart={(item) => {
          setCart((prev) => {
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
      <OrderStatusModal
        open={showStatus}
        status={orderStatus}
        orderId={orderId}
        onClose={handleReset}
      />
    </div>
  );
}
