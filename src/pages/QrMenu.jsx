// src/pages/QrMenu.jsx
import React, { useState, useEffect } from "react";
import OrderStatusScreen from "../components/OrderStatusScreen";
import { createPortal } from "react-dom";

const API_URL = import.meta.env.VITE_API_URL || "";

// Supported languages for the QR
const LANGS = [
  { code: "en", label: "🇺🇸 English" },
  { code: "tr", label: "🇹🇷 Türkçe" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "fr", label: "🇫🇷 Français" },
];

/* ====================== HEADER ====================== */
function QrHeader({ orderType, table, lang, setLang }) {
  return (
    <header className="w-full sticky top-0 z-50 flex items-center justify-between bg-white/80 dark:bg-zinc-900/80 backdrop-blur-lg border-b border-blue-100 dark:border-zinc-800 shadow-lg px-4 py-3">
      <span className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent tracking-tight drop-shadow">
        Hurrybey
      </span>
      <span className="ml-3 text-lg font-bold text-blue-700 dark:text-blue-200 flex-1">
        {orderType === "table" ? (table ? `Table ${table}` : "") : "Online Order"}
      </span>
      <div>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-xl px-2 py-1 bg-white border text-sm font-semibold"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

/* ====================== ORDER TYPE MODAL ====================== */
function OrderTypeSelect({ onSelect, lang, setLang }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[340px] text-center flex flex-col items-center">
        <h2 className="text-2xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          Order Type
        </h2>
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
        {/* Language Switcher */}
        <div className="w-full mt-8 flex flex-col items-center">
          <label className="text-sm font-bold mb-1 text-blue-600">🌐 Language</label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-xl px-4 py-2 bg-white border border-blue-200 text-base font-semibold shadow"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/* ====================== TABLE SELECT ====================== */
function TableSelectModal({ onSelectTable, tableCount = 20, occupiedTables = [] }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[350px] text-center">
        <h2 className="text-xl font-bold mb-5 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          Choose Table
        </h2>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {[...Array(tableCount)].map((_, i) => {
            const num = i + 1;
            const occ = occupiedTables.includes(num);
            return (
              <button
                key={i}
                disabled={occ}
                className={`rounded-xl font-bold py-3 text-lg transition relative ${
                  occ
                    ? "bg-gray-300 text-gray-400 cursor-not-allowed"
                    : selected === num
                    ? "bg-gradient-to-r from-blue-400 via-fuchsia-400 to-indigo-400 text-white scale-105"
                    : "bg-gray-100 text-blue-700 hover:scale-105"
                }`}
                onClick={() => setSelected(num)}
              >
                {num}
                {occ && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-[10px] bottom-1 text-red-600">
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
          onClick={() => onSelectTable(selected)}
        >
          Start Order
        </button>
      </div>
    </div>
  );
}

/* ====================== ONLINE ORDER FORM ====================== */
function OnlineOrderForm({ onSubmit, submitting }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [touched, setTouched] = useState({});
  const validate = () => form.name && /^5\d{9}$/.test(form.phone) && form.address;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[350px] text-center">
        <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          Delivery Info
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate()) {
              setTouched({ name: true, phone: true, address: true });
              return;
            }
            onSubmit(form);
          }}
          className="flex flex-col gap-3"
        >
          <input
            className="rounded-xl px-4 py-3 border"
            placeholder="Full Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            className={`rounded-xl px-4 py-3 border ${
              touched.phone && !/^5\d{9}$/.test(form.phone) ? "border-red-500" : ""
            }`}
            placeholder="Phone (5XXXXXXXXX)"
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10),
              }))
            }
            maxLength={10}
          />
          <textarea
            className="rounded-xl px-4 py-3 border"
            placeholder="Address"
            rows={3}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 mt-2 rounded-2xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg"
          >
            {submitting ? "Sending..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ====================== CATEGORY BAR ====================== */
// Place this near top of QrMenu.jsx with other constants
const categoryIcons = {
  Meat: "🍔",
  Pizza: "🍕",
  Drinks: "🥤",
  Salad: "🥗",
  Dessert: "🍰",
  Breakfast: "🍳",
  Chicken: "🍗",
  default: "🍽️",
};



// Replace your CategoryBar component in QrMenu.jsx with this:
// --- Replace your CategoryBar with this ---
function CategoryBar({ categories, activeCategory, setActiveCategory, categoryImages }) {
  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-zinc-900/95 border-t border-blue-100 dark:border-zinc-800 z-50">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 overflow-x-auto snap-x snap-mandatory">
          {categories.map((cat) => {
            const imgSrc = categoryImages[cat.trim().toLowerCase()];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "flex-none w-20 h-20 rounded-2xl border-2 shadow-sm overflow-hidden transition snap-start",
                  isActive
                    ? "ring-2 ring-fuchsia-400 scale-[1.03] border-fuchsia-300"
                    : "border-blue-200 hover:scale-[1.02]",
                ].join(" ")}
                aria-pressed={isActive}
                title={cat}
              >
                <div className="flex h-full flex-col items-center justify-center p-1">
                  {imgSrc ? (
                    <img
                      src={
                        /^https?:\/\//.test(imgSrc)
                          ? imgSrc
                          : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
                      }
                      alt={cat}
                      className="w-10 h-10 object-cover rounded-xl border shadow"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-2xl">🍽️</span>
                  )}
                  <span className="mt-1 text-[11px] font-bold text-center leading-tight line-clamp-2">
                    {cat}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}


/* ====================== PRODUCT GRID ====================== */
function ProductGrid({ products, onProductClick }) {
  return (
    <main className="w-full max-w-full pt-3 pb-28 px-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 overflow-hidden">
      {products.length === 0 && (
        <div className="col-span-full text-center text-gray-400 font-bold text-lg py-8">
          No products.
        </div>
      )}
      {products.map((product) => (
        <div
          key={product.id}
          onClick={() => onProductClick(product)}
          className="bg-white dark:bg-zinc-900 rounded-2xl border border-blue-100 shadow hover:shadow-2xl transition hover:scale-105 flex flex-col items-center p-2 cursor-pointer"
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
            className="w-16 h-16 object-cover rounded-xl mb-1 border shadow"
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


/* ====================== ADD-TO-CART MODAL (REDESIGNED) ====================== */
/** Redesigned like TransactionScreen ExtrasModal:
 *  - Left: group/category rail
 *  - Right: items with price, +/–, per-extra total
 *  - Totals use (ex.price || ex.extraPrice) * quantity
 */
function AddToCartModal({ open, product, extrasGroups, onClose, onAddToCart }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [note, setNote] = useState("");

  // 🔒 Prevent body scrolling when modal is open (mobile stacking fix)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [open]);

  // Reset state on open/product change
  useEffect(() => {
    if (!open) return;
    setQuantity(1);
    setSelectedExtras([]);
    setNote("");
    setActiveGroupIdx(0);
  }, [open, product]);

  if (!open || !product) return null;

  const basePrice = parseFloat(product.price) || 0;

  // Normalize groups
  const normalizedGroups = (extrasGroups || []).map((g) => ({
    groupName: g.groupName || g.group_name,
    items: Array.isArray(g.items)
      ? g.items
      : (() => {
          try {
            const parsed = JSON.parse(g.items || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
  }));

  // Respect product‑scoped group allowlist if present
  const productGroupNames = Array.isArray(product?.selectedExtrasGroup)
    ? product.selectedExtrasGroup
    : [];
  const availableGroups =
    productGroupNames.length > 0
      ? normalizedGroups.filter((g) => productGroupNames.includes(g.groupName))
      : normalizedGroups;

  const priceOf = (exOrItem) =>
    parseFloat(
      (exOrItem?.price ?? exOrItem?.extraPrice ?? 0)
    ) || 0;

  const extrasPerUnit = selectedExtras.reduce(
    (sum, ex) => sum + priceOf(ex) * (ex.quantity || 1),
    0
  );
  const lineTotal = (basePrice + extrasPerUnit) * quantity;

  // helpers
  const qtyOf = (groupName, itemName) =>
    selectedExtras.find((ex) => ex.group === groupName && ex.name === itemName)
      ?.quantity || 0;

  const incExtra = (group, item) => {
    setSelectedExtras((prev) => {
      const idx = prev.findIndex(
        (ex) => ex.group === group.groupName && ex.name === item.name
      );
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
          price: priceOf(item),
          quantity: 1,
        },
      ];
    });
  };

  const decExtra = (group, item) => {
    setSelectedExtras((prev) => {
      const idx = prev.findIndex(
        (ex) => ex.group === group.groupName && ex.name === item.name
      );
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx].quantity = Math.max(0, (copy[idx].quantity || 0) - 1);
      if (copy[idx].quantity === 0) copy.splice(idx, 1);
      return copy;
    });
  };

  // close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target.dataset.backdrop === "true") onClose?.();
  };

  const modal = (
    <div
      data-backdrop="true"
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-[999] flex items-stretch sm:items-center justify-center bg-black/45"
    >
      <div
        // Stop propagation so content clicks don't close modal
        onMouseDown={(e) => e.stopPropagation()}
        className="
          relative
          w-full h-full
          sm:h-[90vh] sm:max-w-4xl
          bg-white
          sm:rounded-3xl
          shadow-2xl
          flex flex-col
          overflow-hidden
        "
      >
        {/* Close */}
        <button
          className="absolute right-3 top-3 z-20 bg-white/90 border border-blue-100 rounded-full w-10 h-10 flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-red-500 hover:bg-red-50 shadow"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
          <img
            src={
              product.image
                ? /^https?:\/\//.test(product.image)
                  ? product.image
                  : `${API_URL}/uploads/${product.image}`
                : "https://via.placeholder.com/120?text=🍽️"
            }
            alt={product.name}
            className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-xl border-4 border-fuchsia-200 shadow"
          />
          <div className="flex flex-col">
            <div className="font-extrabold text-xl sm:text-2xl text-blue-700">
              {product.name}
            </div>
            <div className="text-base sm:text-lg text-indigo-700 font-bold">
              ₺{basePrice.toFixed(2)}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <button
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700 shadow hover:bg-indigo-200"
              onClick={() => setQuantity((q) => Math.max(q - 1, 1))}
            >
              –
            </button>
            <span className="text-xl sm:text-2xl font-extrabold min-w-[36px] text-center">
              {quantity}
            </span>
            <button
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700 shadow hover:bg-indigo-200"
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </button>
          </div>
        </div>

        {/* Body: rail + items (mobile = stacked vertically) */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Groups rail */}
          <aside className="sm:w-48 border-b sm:border-b-0 sm:border-r border-blue-100 bg-white/80 p-3 overflow-x-auto sm:overflow-y-auto">
            <div className="text-[11px] font-bold text-blue-600 mb-2 px-1">
              Extras Groups
            </div>
            <div className="flex sm:block gap-2 sm:gap-0">
              {availableGroups.length ? (
                availableGroups.map((g, idx) => (
                  <button
                    key={g.groupName}
                    onClick={() => setActiveGroupIdx(idx)}
                    className={`px-3 py-2 rounded-xl font-semibold whitespace-nowrap transition ${
                      activeGroupIdx === idx
                        ? "bg-gradient-to-r from-fuchsia-400 via-blue-400 to-indigo-400 text-white"
                        : "bg-gray-100 text-blue-800 hover:bg-gray-200"
                    } ${idx !== 0 ? "sm:mt-2" : ""}`}
                  >
                    {g.groupName}
                  </button>
                ))
              ) : (
                <div className="text-sm text-gray-400 px-2 py-1">No extras</div>
              )}
            </div>
          </aside>

          {/* Items grid */}
          <section className="flex-1 p-3 sm:p-4 overflow-y-auto">
            {availableGroups[activeGroupIdx] ? (
              <>
                <div className="font-bold text-fuchsia-600 mb-2 text-base">
                  {availableGroups[activeGroupIdx].groupName}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {(availableGroups[activeGroupIdx].items || []).map((item) => {
                    const unit = priceOf(item);
                    const q = qtyOf(
                      availableGroups[activeGroupIdx].groupName,
                      item.name
                    );
                    return (
                      <div
                        key={item.name}
                        className="flex flex-col items-center bg-gradient-to-t from-blue-100 via-white to-fuchsia-100 border border-blue-100 rounded-xl px-2 py-2 min-h-[92px] shadow hover:shadow-lg transition-all"
                      >
                        <span className="font-semibold truncate text-blue-900">
                          {item.name}
                        </span>
                        <span className="text-xs text-indigo-700 font-bold mb-1">
                          ₺{unit.toFixed(2)}
                        </span>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <button
                            className="w-8 h-8 rounded-full bg-pink-100 text-xl font-bold text-fuchsia-600 shadow hover:bg-pink-200 disabled:opacity-40"
                            onClick={() => decExtra(availableGroups[activeGroupIdx], item)}
                            disabled={!q}
                          >
                            –
                          </button>
                          <span className="w-5 text-center font-bold text-blue-800">
                            {q}
                          </span>
                          <button
                            className="w-8 h-8 rounded-full bg-green-100 text-xl font-bold text-green-700 shadow hover:bg-green-200"
                            onClick={() => incExtra(availableGroups[activeGroupIdx], item)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-gray-400">Select a group</div>
            )}

            {/* Note */}
            <div className="mt-3 sm:mt-4">
              <textarea
                className="w-full rounded-xl border-2 border-fuchsia-200 p-2 text-sm bg-pink-50 placeholder-fuchsia-400"
                placeholder="Add a note (optional)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </section>
        </div>

        {/* Footer (sticky) */}
        <div className="border-t-2 border-blue-100 px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between bg-gradient-to-t from-blue-100 via-fuchsia-50 to-white">
          <div className="text-lg sm:text-xl font-extrabold text-fuchsia-700">
            Total: ₺{lineTotal.toFixed(2)}
          </div>
          <button
            className="py-2.5 sm:py-3 px-4 sm:px-5 rounded-2xl font-bold text-white text-base sm:text-lg shadow-xl bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 hover:scale-105 transition-all"
            onClick={() => {
              const unique_id =
                product.id +
                "-" +
                btoa(JSON.stringify(selectedExtras) + (note || ""));
              onAddToCart({
                id: product.id,
                name: product.name,
                price: basePrice + extrasPerUnit, // per-unit price incl. extras
                quantity,
                extras: selectedExtras.filter((e) => e.quantity > 0),
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

  // Use portal to guarantee it's on top of everything (prevents “over stacking”)
  return createPortal(modal, document.body);
}


/* ====================== CART DRAWER ====================== */
function CartDrawer({
  cart,
  setCart,
  onSubmitOrder,
  orderType,
  paymentMethod,
  setPaymentMethod,
  submitting,
}) {
  const [show, setShow] = useState(false);

  // Recompute total from current cart items:
  // (price already includes extras per unit)
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    setShow(cart.length > 0);
  }, [cart.length]);

  function removeItem(idx) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      {/* Button floating for mobile */}
      {!show && cart.length > 0 && (
        <button
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-7 rounded-3xl shadow-xl z-50"
          onClick={() => setShow(true)}
        >
          🛒 View Cart ({cart.length})
        </button>
      )}
      {/* Drawer */}
      {show && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/30">
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-bold text-blue-800">🛒 Your Order</span>
              <button
                className="text-2xl text-gray-400 hover:text-red-500"
                onClick={() => setShow(false)}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[48vh]">
              {cart.length === 0 ? (
                <div className="text-gray-400 text-center py-8">Cart is empty.</div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {cart.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start justify-between gap-3 border-b border-blue-100 pb-2"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block">
                          {item.name}{" "}
                          <span className="text-xs text-gray-500">x{item.quantity}</span>
                        </span>

                        {/* Extras chips with price per extra */}
                        {item.extras && item.extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.extras.map((ex, j) => {
                              const unit = parseFloat(
                                ex.price ?? ex.extraPrice ?? 0
                              );
                              const line = unit * (ex.quantity || 1);
                              return (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-xs rounded-full"
                                >
                                  <span>{ex.name}</span>
                                  <span>×{ex.quantity || 1}</span>
                                  <span className="font-semibold">₺{line.toFixed(2)}</span>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {item.note && (
                          <div className="text-xs text-yellow-700 mt-1">
                            📝 {item.note}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        {/* item.price already includes (base + extras per unit) */}
                        <span className="font-bold text-indigo-700">
                          ₺{(item.price * item.quantity).toFixed(2)}
                        </span>
                        <button
                          className="text-xs text-red-400 hover:text-red-700 mt-1"
                          onClick={() => removeItem(i)}
                        >
                          Remove
                        </button>
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
                    <select
                      className="rounded-xl px-2 py-1 border"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="card">💳 Credit Card</option>
                      <option value="online">🌐 Online Payment</option>
                    </select>
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
                  className="w-full mt-2 py-2 rounded-lg font-medium text-xs text-gray-700 bg-gray-100 hover:bg-red-50 transition"
                  onClick={() => setCart([])}
                >
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

/* ====================== ORDER STATUS MODAL ====================== */
function OrderStatusModal({ open, status, orderId, table, onOrderAnother, onClose }) {
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

        {orderId && open && (
          <OrderStatusScreen
            orderId={orderId}
            table={table}
            onOrderAnother={onOrderAnother}
          />
        )}

        <button
          className="py-3 px-6 rounded-xl bg-blue-500 text-white font-bold shadow hover:bg-blue-600 transition"
          onClick={status === "success" ? onOrderAnother : onClose}
        >
          {status === "success" ? "Order Another" : "Close"}
        </button>
      </div>
    </div>
  );
}



/* ====================== MAIN QR MENU ====================== */
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
    } catch {
      return [];
    }
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
  const [categoryImages, setCategoryImages] = useState({});
  
  // inside export default function QrMenu() { ... }

function handleOrderAnother() {
  // close status UI
  setShowStatus(false);
  setOrderStatus("pending");
  setOrderId(null);

  // clear cart and locals
  setCart([]);
  localStorage.removeItem("qr_cart");

  // go to ORDER TYPE selection (not cart)
  setOrderType(null);     // 👈 this sends user to OrderTypeSelect
  setTable(null);
  setCustomerInfo(null);
}

useEffect(() => {
  fetch(`${API_URL}/api/category-images`)
    .then(res => res.json())
    .then(data => {
      const dict = {};
      data.forEach(({ category, image }) => {
        dict[category.trim().toLowerCase()] = `/uploads/${image}`;
      });
      setCategoryImages(dict);
    })
    .catch(() => setCategoryImages({}));
}, []);
  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem("qr_cart", JSON.stringify(cart));
  }, [cart]);

  // Fetch initial data
  useEffect(() => {
    fetch(`${API_URL}/api/products`)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        const cats = [...new Set(data.map((p) => p.category))].filter(Boolean);
        setCategories(cats);
        setActiveCategory(cats[0] || "");
      });

    fetch(`${API_URL}/api/extras-groups`)
      .then((res) => res.json())
      .then((data) =>
        setExtrasGroups(
          (data || []).map((g) => ({
            groupName: g.groupName || g.group_name,
            items: typeof g.items === "string" ? tryJSON(g.items) : g.items || [],
          }))
        )
      );

    // Get occupied tables
    fetch(`${API_URL}/api/orders`)
      .then((res) => res.json())
      .then((orders) => {
        const occupied = orders
          .filter((order) => order.table_number && order.status !== "closed")
          .map((order) => Number(order.table_number));
        setOccupiedTables(occupied);
      });

    function tryJSON(v) {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : [];
      } catch {
        return [];
      }
    }
  }, []);

  // Flow screens
  if (!orderType)
    return (
      <OrderTypeSelect onSelect={setOrderType} lang={lang} setLang={setLang} />
    );
  if (orderType === "table" && !table)
    return (
      <TableSelectModal
        onSelectTable={setTable}
        occupiedTables={occupiedTables}
      />
    );
  if (orderType === "online" && !customerInfo)
    return (
      <OnlineOrderForm
        onSubmit={(info) => setCustomerInfo(info)}
        submitting={submitting}
      />
    );

  /* -------- SUBMIT ORDER -------- */
  async function handleSubmitOrder() {
    if (cart.length === 0) return;
    setSubmitting(true);
    setShowStatus(true);
    setOrderStatus("pending");
    try {
      const payloadBase = {
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        items: cart.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
          price: i.price, // per-unit price (base + extras)
          ingredients: i.ingredients || [],
          extras: i.extras || [],
          unique_id: i.unique_id,
          note: i.note || "",
          confirmed: true,
        })),
      };

      let orderRes;
      if (orderType === "table") {
        orderRes = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadBase,
            table_number: table,
            order_type: "table",
          }),
        });
      } else {
        orderRes = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadBase,
            order_type: "packet",
            customer_name: customerInfo.name,
            customer_phone: customerInfo.phone,
            customer_address: customerInfo.address,
            payment_method: paymentMethod,
          }),
        });
      }

      const order = await orderRes.json();
      setOrderId(order.id);
      setOrderStatus(orderRes.ok ? "success" : "fail");
      setCart([]);
      localStorage.removeItem("qr_cart");
    } catch (e) {
      setOrderStatus("fail");
    } finally {
      setSubmitting(false);
    }
  }

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
      <QrHeader
        orderType={orderType}
        table={table}
        lang={lang}
        setLang={setLang}
      />

      <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 w-full">
        <ProductGrid
          products={products.filter((p) => p.category === activeCategory)}
          onProductClick={(product) => {
            setSelectedProduct(product);
            setShowAddModal(true);
          }}
        />
      </div>

      <CategoryBar
  categories={categories}
  activeCategory={activeCategory}
  setActiveCategory={setActiveCategory}
  categoryImages={categoryImages}
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
        onAddToCart={(item) => {
          setCart((prev) => {
            // If same unique combo exists, stack quantity
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
  table={orderType === "table" ? table : null}
  onOrderAnother={handleOrderAnother}
  onClose={handleReset}
/>


    </div>
  );
}