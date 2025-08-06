import React, { useState, useEffect } from "react";

// --- Basic i18n object for fast language switch ---
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
    submit_order: "Submit Order",
    pay_online: "Pay Online",
    pay_cash: "Pay Cash at Door",
    order_sent: "✅ Order Sent! Our team has been notified.",
    missing_fields: "Please fill all details.",
    table: "Table",
    change_lang: "TR",
    language: "Language",
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
    submit_order: "Siparişi Gönder",
    pay_online: "Online Öde",
    pay_cash: "Kapıda Nakit Öde",
    order_sent: "✅ Siparişiniz gönderildi! Ekibimiz bilgilendirildi.",
    missing_fields: "Lütfen tüm bilgileri doldurun.",
    table: "Masa",
    change_lang: "EN",
    language: "Dil",
  },
};
function t(lang, key) {
  return LANGS[lang][key] || key;
}

const API_URL = import.meta.env.VITE_API_URL || "";

export default function QrMenu() {
  // --- Language state ---
  const [lang, setLang] = useState("en");

  // --- Mode & State ---
  const [mode, setMode] = useState(null); // 'table' or 'delivery'
  const [table, setTable] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState([]);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payType, setPayType] = useState(""); // 'online' or 'cash'
  const [orderSent, setOrderSent] = useState(false);

  // --- Load menu data ---
  useEffect(() => {
    fetch(`${API_URL}/api/products`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))];
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      });
  }, []);

  // --- Helpers ---
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const handleAdd = (product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          qty: 1,
        },
      ];
    });
  };

  const handleRemove = (productId) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === productId ? { ...i, qty: Math.max(i.qty - 1, 0) } : i
        )
        .filter((i) => i.qty > 0)
    );
  };

  // --- ORDER SUBMIT (Table or Delivery) ---
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
      alert("Cart is empty!");
      return;
    }

    // Build payload based on type
    const payload =
      mode === "table"
        ? {
            table_number: table,
            total,
            items: cart.map((i) => ({
              product_id: i.id,
              quantity: i.qty,
              price: i.price,
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
            })),
            order_type: "phone", // This triggers driver system backend
            payment_method: payment_method || "none",
          };

    // --- Submit to backend ---
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
    setShowPayModal(false);
    setTimeout(() => setOrderSent(false), 4000);
  }

  // --- MODALS & FLOWS ---

  // Start screen
  if (!mode) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center px-6 text-center">
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

  // Table selection
  if (mode === "table" && !table) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
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

  // Delivery entry
  if (mode === "delivery" && (!form.name || !form.phone || !form.address)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
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
            setForm({ ...form }); // trigger render
          }}
          className="mt-5 bg-blue-600 text-white py-3 px-8 rounded-xl font-bold shadow"
        >
          {t(lang, "start_order")}
        </button>
      </div>
    );
  }

  // --- MAIN MENU ---
  return (
    <div className="min-h-screen bg-blue-50 dark:bg-zinc-900 flex flex-col pb-32">
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

      {/* Categories */}
      <div className="flex overflow-x-auto gap-3 p-4 bg-white dark:bg-zinc-800 shadow-inner">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-full font-bold whitespace-nowrap shadow ${
              activeCategory === cat
                ? "bg-blue-600 text-white"
                : "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100"
            }`}
          >
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
              onClick={() => handleAdd(prod)}
              className="bg-white dark:bg-zinc-800 rounded-2xl p-3 shadow-md flex flex-col items-center cursor-pointer"
            >
              <img
                src={
                  prod.image?.startsWith("http")
                    ? prod.image
                    : `${API_URL}/uploads/${prod.image}`
                }
                alt={prod.name}
                className="w-24 h-24 object-cover rounded-xl mb-2"
              />
              <div className="font-bold text-sm text-center text-blue-900 dark:text-blue-100">
                {prod.name}
              </div>
              <div className="font-bold text-lg text-indigo-700 dark:text-indigo-300">
                ₺{parseFloat(prod.price).toFixed(2)}
              </div>
              <button
                className="mt-2 bg-gray-100 dark:bg-zinc-700 rounded-lg px-2 py-1 text-xs font-bold text-blue-600"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(prod.id);
                }}
              >
                – {t(lang, "items")}
              </button>
            </div>
          ))}
      </div>

      {/* Cart Drawer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-blue-100 dark:border-zinc-800 p-4 shadow-inner z-50">
        <div className="flex justify-between items-center">
          <span className="font-bold text-lg">
            🛒 {cart.length} {t(lang, "items")}
          </span>
          <span className="text-indigo-600 font-extrabold text-xl">
            ₺{total.toFixed(2)}
          </span>
        </div>
        <button
          className="mt-3 w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-3 rounded-xl font-bold shadow"
          onClick={() => setShowPayModal(true)}
        >
          {t(lang, "submit_order")}
        </button>
      </div>

      {/* Pay Modal */}
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
                setPayType("online");
                handleOrderSubmit("online payment");
              }}
            >
              💳 {t(lang, "pay_online")}
            </button>
            <button
              className="w-full py-3 rounded-xl font-bold text-blue-800 bg-blue-100 dark:bg-blue-800 dark:text-white mt-3 text-lg shadow hover:scale-105"
              onClick={() => {
                setPayType("cash");
                handleOrderSubmit("cash");
              }}
            >
              💵 {t(lang, "pay_cash")}
            </button>
            <button
              className="w-full mt-5 py-2 rounded-lg font-medium text-sm text-gray-700 bg-gray-100 hover:bg-red-50 transition"
              onClick={() => setShowPayModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success Alert */}
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
