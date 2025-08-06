import React, { useState, useEffect } from "react";

// ---- Language/i18n Fast Switcher ----
const LANGS = {
  en: {
    welcome: "Welcome to Hurrybey 🍔",
    table_order: "Order at Table",
    delivery_pickup: "Delivery or Pickup",
    select_table: "Select Your Table",
    enter_details: "Enter Delivery Details",
    name: "Name",
    phone: "Phone",
    address: "Address",
    start_order: "Start Order",
    categories: "Categories",
    items: "items",
    cart: "Cart",
    add: "Add",
    added: "Added!",
    extras: "Extras",
    note: "Note (optional)",
    qty: "Qty",
    submit_order: "Submit Order",
    pay_online: "Pay Online",
    pay_cash: "Pay Cash at Door",
    order_sent: "✅ Order Sent! Our team has been notified.",
    missing_fields: "Please fill all details.",
    table: "Table",
    change_lang: "TR",
    total: "Total",
    empty_cart: "Cart is empty.",
    clear: "Clear Cart",
    back: "Back",
    confirm: "Confirm",
    cancel: "Cancel",
  },
  tr: {
    welcome: "Hurrybey'e Hoşgeldiniz 🍔",
    table_order: "Masa Siparişi",
    delivery_pickup: "Teslimat veya Paket",
    select_table: "Masanızı Seçin",
    enter_details: "Teslimat Bilgileri",
    name: "Ad",
    phone: "Telefon",
    address: "Adres",
    start_order: "Siparişi Başlat",
    categories: "Kategoriler",
    items: "ürün",
    cart: "Sepet",
    add: "Ekle",
    added: "Eklendi!",
    extras: "Ekstralar",
    note: "Not (opsiyonel)",
    qty: "Adet",
    submit_order: "Siparişi Gönder",
    pay_online: "Online Öde",
    pay_cash: "Kapıda Nakit Öde",
    order_sent: "✅ Siparişiniz gönderildi! Ekibimiz bilgilendirildi.",
    missing_fields: "Lütfen tüm bilgileri doldurun.",
    table: "Masa",
    change_lang: "EN",
    total: "Toplam",
    empty_cart: "Sepet boş.",
    clear: "Sepeti Temizle",
    back: "Geri",
    confirm: "Onayla",
    cancel: "İptal",
  },
};
function t(lang, key) {
  return LANGS[lang][key] || key;
}

const API_URL = import.meta.env.VITE_API_URL || "";

// --- CATEGORY ICONS ---
const CATEGORY_ICONS = {
  Burger: "🍔",
  Pizza: "🍕",
  Drinks: "🥤",
  Salad: "🥗",
  Dessert: "🍰",
  Breakfast: "🍳",
  Chicken: "🍗",
  Fries: "🍟",
  default: "🍽️",
};

export default function QrMenu() {
  // LANG
  const [lang, setLang] = useState("en");
  // FLOW
  const [mode, setMode] = useState(null); // 'table' | 'delivery'
  const [table, setTable] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  // MENU
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  // CART/ORDER
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);

  // MODALS
  const [addModal, setAddModal] = useState({ open: false, product: null });
  const [showPayModal, setShowPayModal] = useState(false);

  // LOAD MENU
  useEffect(() => {
    fetch(`${API_URL}/api/products`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))].filter(Boolean);
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      });
  }, []);

  // ---- CART ----
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  // --- ORDER SUBMIT ---
  async function handleOrderSubmit(payment_method) {
    if (
      (mode === "table" && !table) ||
      (mode === "delivery" &&
        (!form.name || !form.phone || !form.address))
    ) {
      alert(t(lang, "missing_fields"));
      return;
    }
    if (cart.length === 0) {
      alert(t(lang, "empty_cart"));
      return;
    }

    const payload =
      mode === "table"
        ? {
            table_number: table,
            total,
            items: cart.map((i) => ({
              product_id: i.id,
              quantity: i.qty,
              price: i.price,
              note: i.note || "",
            })),
            order_type: "table",
            payment_method: payment_method || "none",
          }
        : {
            customer_name: form.name,
            customer_phone: form.phone,
            customer_address: form.address,
            total,
            items: cart.map((i) => ({
              product_id: i.id,
              quantity: i.qty,
              price: i.price,
              note: i.note || "",
            })),
            order_type: "phone",
            payment_method: payment_method || "none",
          };

    const res = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const { error } = await res.json();
      alert(error || "Order failed!");
      return;
    }
    setOrderSent(true);
    setCart([]);
    setCartOpen(false);
    setShowPayModal(false);
    setTimeout(() => setOrderSent(false), 4000);
  }

  // ---- UI ----

  // --- AddToCart Modal ---
  function AddToCartModal({ open, product, onClose }) {
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState("");

    if (!open || !product) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50 transition-all duration-150">
        <div className="w-full md:w-[380px] rounded-t-3xl md:rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl px-6 pt-6 pb-5 flex flex-col items-center relative animate-fade-in">
          {/* Close */}
          <button
            className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-fuchsia-500"
            onClick={onClose}
          >
            ×
          </button>
          {/* Image */}
          <img
            src={
              product.image?.startsWith("http")
                ? product.image
                : `${API_URL}/uploads/${product.image}`
            }
            alt={product.name}
            className="w-28 h-28 object-cover rounded-xl mb-2 shadow"
          />
          {/* Title & Price */}
          <div className="font-extrabold text-2xl text-blue-800 dark:text-blue-200 text-center mb-1">
            {product.name}
          </div>
          <div className="text-lg text-indigo-800 dark:text-indigo-300 mb-3">
            ₺{parseFloat(product.price).toFixed(2)}
          </div>
          {/* Note */}
          <textarea
            className="w-full rounded-xl border border-blue-100 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 shadow-inner text-sm resize-none mb-3"
            placeholder={t(lang, "note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          {/* Qty */}
          <div className="flex items-center gap-4 mb-3">
            <button
              className="w-10 h-10 rounded-full bg-gray-200 hover:bg-blue-200 text-2xl font-bold"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              –
            </button>
            <span className="text-xl font-extrabold min-w-[40px] text-center">
              {qty}
            </span>
            <button
              className="w-10 h-10 rounded-full bg-gray-200 hover:bg-green-200 text-2xl font-bold"
              onClick={() => setQty((q) => q + 1)}
            >
              +
            </button>
          </div>
          <button
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg hover:scale-105 transition"
            onClick={() => {
              setCart((prev) => {
                const idx = prev.findIndex(
                  (x) => x.id === product.id && (x.note || "") === note.trim()
                );
                if (idx !== -1) {
                  const copy = [...prev];
                  copy[idx].qty += qty;
                  return copy;
                }
                return [
                  ...prev,
                  {
                    id: product.id,
                    name: product.name,
                    price: parseFloat(product.price),
                    qty,
                    note: note.trim(),
                  },
                ];
              });
              setAddModal({ open: false, product: null });
            }}
          >
            {t(lang, "add")}
          </button>
        </div>
        <style>{`
          .animate-fade-in { animation: fadeIn .23s cubic-bezier(.6,0,.4,1); }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(40px);}
            to { opacity: 1; transform: translateY(0);}
          }
        `}</style>
      </div>
    );
  }

  // --- Cart Modal ---
  function CartModal({ open, onClose }) {
    if (!open) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
        <div className="w-full md:w-[400px] rounded-t-3xl md:rounded-3xl bg-white dark:bg-zinc-900 shadow-2xl px-6 pt-5 pb-6 flex flex-col relative animate-fade-in">
          {/* Close */}
          <button
            className="absolute top-3 right-4 text-2xl text-gray-400 hover:text-fuchsia-500"
            onClick={onClose}
          >
            ×
          </button>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">🛒</span>
            <span className="text-xl font-extrabold">{t(lang, "cart")}</span>
          </div>
          {cart.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              {t(lang, "empty_cart")}
            </div>
          ) : (
            <ul className="flex flex-col gap-3 mb-3 max-h-60 overflow-y-auto">
              {cart.map((item, i) => (
                <li key={i} className="flex items-center justify-between border-b border-blue-100 pb-2">
                  <div>
                    <span className="font-bold">{item.name}</span>
                    <span className="text-xs text-gray-500 ml-2">x{item.qty}</span>
                    {item.note && (
                      <div className="block text-xs text-rose-500 mt-1">📝 {item.note}</div>
                    )}
                  </div>
                  <span className="font-bold text-indigo-700">
                    ₺{(item.price * item.qty).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between mt-3 mb-1 text-base font-bold">
            <span>{t(lang, "total")}:</span>
            <span className="text-indigo-700 text-xl">₺{total.toFixed(2)}</span>
          </div>
          <button
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 to-blue-500 mt-2 text-lg shadow-lg hover:scale-105 transition"
            onClick={() => {
              setShowPayModal(true);
              onClose();
            }}
            disabled={cart.length === 0}
          >
            {t(lang, "submit_order")}
          </button>
          <button
            className="w-full mt-2 py-2 rounded-lg font-medium text-sm text-gray-700 bg-gray-100 hover:bg-red-50 transition"
            onClick={() => setCart([])}
          >
            {t(lang, "clear")}
          </button>
        </div>
      </div>
    );
  }

  // --- Start/Entry Screens ---
  if (!mode) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-6 text-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="flex justify-between w-full max-w-xs mb-2">
          <div />
          <button
            className="rounded-xl bg-gray-200 px-3 py-1 font-bold text-blue-700 text-sm"
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
          >
            {t(lang, "change_lang")}
          </button>
        </div>
        <h1 className="text-3xl font-extrabold mb-8">{t(lang, "welcome")}</h1>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => setMode("table")}
            className="bg-blue-500 text-white py-4 rounded-xl font-bold text-lg shadow-md"
          >
            📍 {t(lang, "table_order")}
          </button>
          <button
            onClick={() => setMode("delivery")}
            className="bg-green-500 text-white py-4 rounded-xl font-bold text-lg shadow-md"
          >
            🏠 {t(lang, "delivery_pickup")}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "table" && !table) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-blue-50">
        <div className="flex justify-between w-full max-w-xs mb-2">
          <button
            className="rounded-xl bg-gray-200 px-3 py-1 font-bold text-blue-700 text-sm"
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
          >
            {t(lang, "change_lang")}
          </button>
        </div>
        <h2 className="text-xl font-bold mb-4">{t(lang, "select_table")}</h2>
        <div className="grid grid-cols-4 gap-3 max-w-sm">
          {Array.from({ length: 20 }).map((_, i) => (
            <button
              key={i}
              onClick={() => setTable(i + 1)}
              className="bg-white rounded-xl py-3 font-bold shadow hover:scale-105"
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "delivery" && (!form.name || !form.phone || !form.address)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-blue-50">
        <div className="flex justify-between w-full max-w-xs mb-2">
          <button
            className="rounded-xl bg-gray-200 px-3 py-1 font-bold text-blue-700 text-sm"
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
          >
            {t(lang, "change_lang")}
          </button>
        </div>
        <h2 className="text-xl font-bold mb-4">{t(lang, "enter_details")}</h2>
        <input
          className="input w-full max-w-xs"
          placeholder={t(lang, "name")}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="input mt-3 w-full max-w-xs"
          placeholder={t(lang, "phone")}
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <textarea
          className="input mt-3 w-full max-w-xs"
          placeholder={t(lang, "address")}
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <button
          onClick={() => {
            if (!form.name || !form.phone || !form.address)
              return alert(t(lang, "missing_fields"));
            setForm({ ...form });
          }}
          className="mt-5 bg-blue-600 text-white py-3 px-8 rounded-xl font-bold shadow"
        >
          {t(lang, "start_order")}
        </button>
      </div>
    );
  }

  // --- MAIN PAGE ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900 flex flex-col pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white dark:bg-zinc-900 shadow px-4 py-3 flex justify-between items-center">
        <span className="font-extrabold text-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-transparent bg-clip-text">
          Hurrybey
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-blue-700 dark:text-blue-100">
            {mode === "table"
              ? `${t(lang, "table")} ${table}`
              : form.name}
          </span>
          <button
            className="rounded-xl bg-gray-200 px-3 py-1 font-bold text-blue-700 text-xs ml-2"
            onClick={() => setLang(lang === "en" ? "tr" : "en")}
          >
            {t(lang, "change_lang")}
          </button>
        </div>
      </div>

      {/* Categories: Horizontal scroll like a real app */}
      <div className="flex overflow-x-auto gap-3 px-4 py-3 bg-white dark:bg-zinc-800 shadow-inner">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex items-center gap-2 px-5 py-2 rounded-2xl font-bold whitespace-nowrap shadow transition-all text-lg ${
              activeCategory === cat
                ? "bg-gradient-to-r from-fuchsia-400 via-blue-400 to-indigo-400 text-white scale-105 ring-2 ring-fuchsia-300"
                : "bg-white dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 hover:scale-105"
            }`}
          >
            <span className="text-2xl">
              {CATEGORY_ICONS[cat] || CATEGORY_ICONS.default}
            </span>
            {cat}
          </button>
        ))}
      </div>

      {/* Products */}
      <div className="grid grid-cols-2 gap-4 p-4">
        {products
          .filter((p) => p.category === activeCategory)
          .map((prod) => (
            <div
              key={prod.id}
              onClick={() => setAddModal({ open: true, product: prod })}
              className="bg-white dark:bg-zinc-800 rounded-2xl p-3 shadow-md flex flex-col items-center cursor-pointer group transition hover:scale-105"
            >
              <img
                src={
                  prod.image?.startsWith("http")
                    ? prod.image
                    : `${API_URL}/uploads/${prod.image}`
                }
                alt={prod.name}
                className="w-24 h-24 object-cover rounded-xl mb-2 border shadow"
              />
              <div className="font-bold text-sm text-center text-blue-900 dark:text-blue-100">
                {prod.name}
              </div>
              <div className="font-bold text-lg text-indigo-700 dark:text-indigo-300">
                ₺{parseFloat(prod.price).toFixed(2)}
              </div>
            </div>
          ))}
      </div>

      {/* Floating Cart Bar (always visible) */}
      <div className="fixed bottom-3 left-0 right-0 flex justify-center z-50">
        <div
          className="flex items-center justify-between w-full max-w-md mx-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-xl px-5 py-3 cursor-pointer"
          onClick={() => setCartOpen(true)}
        >
          <span className="font-bold text-xl">
            🛒 {cartCount} {t(lang, "items")}
          </span>
          <span className="font-extrabold text-2xl tracking-wider">
            ₺{total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Add To Cart Modal */}
      <AddToCartModal
        open={addModal.open}
        product={addModal.product}
        onClose={() => setAddModal({ open: false, product: null })}
      />

      {/* Slide-up Cart Modal */}
      <CartModal open={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex flex-col items-center justify-center px-2">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-xs w-full p-7 flex flex-col">
            <h2 className="text-xl font-bold mb-5 text-center">
              {t(lang, "submit_order")}
            </h2>
            <span className="text-lg font-bold mb-2 text-center text-indigo-700">
              ₺{total.toFixed(2)}
            </span>
            <button
              className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-500 mt-2 text-lg shadow-lg hover:scale-105 transition"
              onClick={() => {
                handleOrderSubmit("online payment");
              }}
            >
              💳 {t(lang, "pay_online")}
            </button>
            <button
              className="w-full py-3 rounded-xl font-bold text-blue-800 bg-blue-100 dark:bg-blue-800 dark:text-white mt-3 text-lg shadow hover:scale-105"
              onClick={() => {
                handleOrderSubmit("cash");
              }}
            >
              💵 {t(lang, "pay_cash")}
            </button>
            <button
              className="w-full mt-5 py-2 rounded-lg font-medium text-sm text-gray-700 bg-gray-100 hover:bg-red-50 transition"
              onClick={() => setShowPayModal(false)}
            >
              {t(lang, "cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Order Sent Alert */}
      {orderSent && (
        <div className="fixed top-4 left-0 right-0 flex justify-center z-[9999]">
          <div className="bg-green-500 text-white font-bold px-6 py-4 rounded-xl shadow-2xl text-lg animate-bounce">
            {t(lang, "order_sent")}
          </div>
        </div>
      )}
    </div>
  );
}
