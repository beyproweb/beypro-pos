// src/pages/QrMenu.jsx
import React, { useState, useEffect, useRef, memo } from "react";
import OrderStatusScreen from "../components/OrderStatusScreen";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "";

// --- TABLE PERSISTENCE HELPERS ---
const TABLE_KEY = "qr_selected_table";


function saveSelectedTable(tableNo) {
  if (tableNo !== undefined && tableNo !== null && `${tableNo}`.trim() !== "") {
    localStorage.setItem(TABLE_KEY, String(tableNo));
  }
}

function getSavedTable() {
  const v = localStorage.getItem(TABLE_KEY);
  return v && v !== "null" ? v : "";
}

function clearSavedTable() {
  // call this only when order is COMPLETED/CLOSED – NOT when user backs out
  localStorage.removeItem(TABLE_KEY);
}

/* ====================== SMALL HELPERS ====================== */
function detectBrand(num) {
  const n = (num || "").replace(/\s+/g, "");
  if (/^4\d{6,}$/.test(n)) return "Visa";
  if (/^(5[1-5]\d{4,}|2[2-7]\d{4,})$/.test(n)) return "Mastercard";
  if (/^3[47]\d{5,}$/.test(n)) return "Amex";
  return "Card";
}
function luhnValid(num) {
  const n = (num || "").replace(/\D/g, "");
  let sum = 0, dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return n.length >= 12 && sum % 10 === 0;
}
function parseExpiry(exp) {
  const s = (exp || "").replace(/[^\d]/g, "").slice(0, 4);
  const mm = s.slice(0, 2), yy = s.slice(2, 4);
  return { mm, yy };
}
function expiryValid(exp) {
  const { mm, yy } = parseExpiry(exp);
  if (mm.length !== 2 || yy.length !== 2) return false;
  const m = +mm;
  if (m < 1 || m > 12) return false;
  const now = new Date();
  const yFull = 2000 + +yy;
  const end = new Date(yFull, m, 0, 23, 59, 59);
  return end >= new Date(now.getFullYear(), now.getMonth(), 1);
}
function makeToken() {
  return (crypto?.randomUUID?.() ?? ("tok_" + Math.random().toString(36).slice(2)));
}
function formatCardNumber(v) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}
function formatExpiry(v) {
  const s = v.replace(/[^\d]/g, "").slice(0, 4);
  if (s.length <= 2) return s;
  return s.slice(0, 2) + "/" + s.slice(2);
}

/* ====================== TRANSLATIONS ====================== */
const DICT = {
  en: {
    "Order Type": "Order Type",
    "Table Order": "Table Order",
    Delivery: "Delivery",
    Language: "Language",
    "Choose Table": "Choose Table",
    Occupied: "Occupied",
    "Start Order": "Start Order",
    "Delivery Info": "Delivery Info",
    "Full Name": "Full Name",
    "Phone (5XXXXXXXXX)": "Phone (5XXXXXXXXX)",
    Address: "Address",
    Continue: "Continue",
    "No products.": "No products.",
    "Extras Groups": "Extras Groups",
    "Select a group": "Select a group",
    Quantity: "Quantity",
    "Add a note (optional)…": "Add a note (optional)…",
    Total: "Total",
    "Add to Cart": "Add to Cart",
    "View Cart": "View Cart",
    "Your Order": "Your Order",
    "Cart is empty.": "Cart is empty.",
    "Payment:": "Payment:",
    Cash: "Cash",
    "Credit Card": "Credit Card",
    "Online Payment": "Online Payment",
    "Submit Order": "Submit Order",
    "Clear Cart": "Clear Cart",
    Remove: "Remove",
    "Order Sent!": "Order Sent!",
    "Sending Order...": "Sending Order...",
    "Order Failed": "Order Failed",
    "Thank you! Your order has been received.": "Thank you! Your order has been received.",
    "Please wait...": "Please wait...",
    "Something went wrong. Please try again.": "Something went wrong. Please try again.",
    Close: "Close",
    "Order Another": "Order Another",
    Table: "Table",
    "Table Order (short)": "Table Order",
    "Online Order": "Online Order",
    "Ready for Pickup": "Ready for Pickup",
    Price: "Price",
    Extras: "Extras",
    Note: "Note",
    Preparing: "Preparing",
    Delivered: "Delivered",
    Time: "Time",
    "Items Ordered": "Items Ordered",
    "Select Payment Method": "Select Payment Method",
    "Name on Card": "Name on Card",
    "Card Number": "Card Number",
    "Expiry (MM/YY)": "Expiry (MM/YY)",
    CVC: "CVC",
    "Save card for next time": "Save card for next time",
    "Use saved card": "Use saved card",
    "Use a new card": "Use a new card",
    "Saved card": "Saved card",
  },
  tr: {
    "Order Type": "Sipariş Türü",
    "Table Order": "Masa Siparişi",
    Delivery: "Paket",
    Language: "Dil",
    "Choose Table": "Masa Seçin",
    Occupied: "Dolu",
    "Start Order": "Siparişi Başlat",
    "Delivery Info": "Teslimat Bilgileri",
    "Full Name": "Ad Soyad",
    "Phone (5XXXXXXXXX)": "Telefon (5XXXXXXXXX)",
    Address: "Adres",
    Continue: "Devam",
    "No products.": "Ürün yok.",
    "Extras Groups": "Ekstra Grupları",
    "Select a group": "Bir grup seçin",
    Quantity: "Adet",
    "Add a note (optional)…": "Not ekleyin (opsiyonel)…",
    Total: "Toplam",
    "Add to Cart": "Sepete Ekle",
    "View Cart": "Sepeti Gör",
    "Your Order": "Siparişiniz",
    "Cart is empty.": "Sepet boş.",
    "Payment:": "Ödeme:",
    Cash: "Nakit",
    "Credit Card": "Kredi Kartı",
    "Online Payment": "Online Ödeme",
    "Submit Order": "Siparişi Gönder",
    "Clear Cart": "Sepeti Temizle",
    Remove: "Kaldır",
    "Order Sent!": "Sipariş Gönderildi!",
    "Sending Order...": "Sipariş Gönderiliyor...",
    "Order Failed": "Sipariş Başarısız",
    "Thank you! Your order has been received.": "Teşekkürler! Siparişiniz alındı.",
    "Please wait...": "Lütfen bekleyin...",
    "Something went wrong. Please try again.": "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
    Close: "Kapat",
    "Order Another": "Yeni Sipariş Ver",
    Table: "Masa",
    "Table Order (short)": "Masa",
    "Online Order": "Paket",
    "Ready for Pickup": "Teslime Hazır",
    Price: "Fiyat",
    Extras: "Ekstralar",
    Note: "Not",
    Preparing: "Hazırlanıyor",
    Delivered: "Teslim Edildi",
    Time: "Süre",
    "Items Ordered": "Sipariş Edilenler",
    "Select Payment Method": "Ödeme yöntemi seçin",
    "Name on Card": "Kart Üzerindeki İsim",
    "Card Number": "Kart Numarası",
    "Expiry (MM/YY)": "Son Kullanım (AA/YY)",
    CVC: "CVC",
    "Save card for next time": "Kartı sonraki için kaydet",
    "Use saved card": "Kayıtlı kartı kullan",
    "Use a new card": "Yeni kart kullan",
    "Saved card": "Kayıtlı kart",
  },
  de: {}, // new keys fall back to en
  fr: {}, // new keys fall back to en
};
function makeT(lang) {
  const base = DICT.en;
  return (key) => (DICT[lang]?.[key] ?? base[key] ?? key);
}

/* ====================== SUPPORTED LANGS ====================== */
const LANGS = [
  { code: "en", label: "🇺🇸 English" },
  { code: "tr", label: "🇹🇷 Türkçe" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "fr", label: "🇫🇷 Français" },
];

/* ====================== HEADER ====================== */
function QrHeader({ orderType, table, onClose, t }) {
  return (
    <header className="w-full sticky top-0 z-50 flex items-center gap-3 bg-white/90 backdrop-blur border-b border-blue-100 shadow-lg px-4 py-3">
      <span className="text-2xl font-extrabold bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 bg-clip-text text-transparent tracking-tight drop-shadow">
        Hurrybey
      </span>
      <span className="ml-1 text-lg font-bold text-blue-700 flex-1">
        {orderType === "table"
          ? table
            ? `${t("Table")} ${table}`
            : t("Table Order (short)")
          : t("Online Order")}
      </span>
      <button
        onClick={onClose}
        aria-label={t("Close")}
        className="bg-white/90 border border-blue-100 rounded-full w-10 h-10 flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-red-500 hover:bg-red-50 shadow"
      >
        ×
      </button>
    </header>
  );
}

/* ====================== ORDER TYPE MODAL ====================== */
function OrderTypeSelect({ onSelect, lang, setLang, t }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-[340px] text-center flex flex-col items-center">
        <h2 className="text-2xl font-extrabold mb-6 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          {t("Order Type")}
        </h2>
        <button
          className="py-4 w-full mb-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-xl hover:scale-105 transition"
          onClick={() => onSelect("table")}
        >
          🍽️ {t("Table Order")}
        </button>
        <button
          className="py-4 w-full rounded-2xl font-bold text-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-xl hover:scale-105 transition"
          onClick={() => onSelect("online")}
        >
          🏠 {t("Delivery")}
        </button>
        <div className="w-full mt-8 flex flex-col items-center">
          <label className="text-sm font-bold mb-1 text-blue-600">🌐 {t("Language")}</label>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="rounded-xl px-4 py-2 bg-white border border-blue-200 text-base font-semibold shadow"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/* ====================== TABLE SELECT ====================== */
function TableSelectModal({ onSelectTable, onClose, tableCount = 20, occupiedTables = [], t }) {
  const [selected, setSelected] = useState(null);
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[350px] text-center relative">
        <button
          className="absolute right-3 top-3 bg-white/90 border border-blue-100 rounded-full w-10 h-10 flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-red-500 hover:bg-red-50 shadow"
          onClick={onClose}
          aria-label={t("Close")}
        >
          ×
        </button>

        <h2 className="text-xl font-bold mb-5 bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-transparent bg-clip-text">
          {t("Choose Table")}
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
                title={occ ? t("Occupied") : undefined}
              >
                {num}
                {occ && (
                  <span className="absolute left-1/2 -translate-x-1/2 text-[10px] bottom-1 text-red-600">
                    {t("Occupied")}
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
          {t("Start Order")}
        </button>
      </div>
    </div>
  );
}

/* ====================== ONLINE ORDER FORM (with card fields) ====================== */
function OnlineOrderForm({ onSubmit, submitting, onClose, t }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    payment_method: "", // cash | card | online
  });
  const [touched, setTouched] = useState({});

  // ⬇️ start: saved card handling
  const [useSaved, setUseSaved] = useState(false);     // default to NEW CARD
  const [savedCard, setSavedCard] = useState(null);

  // new card states
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  // delivery info local save flags
const [saving, setSaving] = useState(false);
const [savedOnce, setSavedOnce] = useState(false);



// Prefill from local device storage on first open
useEffect(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("qr_delivery_info") || "null");
    if (saved && typeof saved === "object") {
      setForm((f) => ({
        ...f,
        name: saved.name || f.name,
        phone: saved.phone || f.phone,
        address: saved.address || f.address,
      }));
    }
  } catch {}
}, []);





  // Load saved card when phone looks valid; otherwise ensure we show new card inputs
  useEffect(() => {
    const phoneOk = /^5\d{9}$/.test(form.phone);
    if (!phoneOk) {
      setSavedCard(null);
      setUseSaved(false); // 🔧 force new card UI if phone not valid / no saved card
      return;
    }
    try {
      const store = JSON.parse(localStorage.getItem("qr_saved_cards") || "{}");
      const arr = Array.isArray(store[form.phone]) ? store[form.phone] : [];
      setSavedCard(arr[0] || null);
      setUseSaved(!!arr[0]); // default to saved only if one exists
    } catch {
      setSavedCard(null);
      setUseSaved(false);
    }
  }, [form.phone]);
  // ⬆️ end: saved card handling

  async function saveDelivery() {
  // basic form completeness for save
  const name = (form.name || "").trim();
  const phone = (form.phone || "").trim();
  const address = (form.address || "").trim();

  if (!name || !/^5\d{9}$/.test(phone) || !address) return;

  setSaving(true);
  try {
    // 1) Save locally so it's there on next open
    localStorage.setItem("qr_delivery_info", JSON.stringify({ name, phone, address }));

    // 2) Try to sync with backend (best-effort)
    try {
      // find existing customer
      let res = await fetch(`${API_URL}/api/customers/by-phone/${phone}`);
      let customer = await res.json();

      // create if not exists
      if (!customer) {
        const cr = await fetch(`${API_URL}/api/customers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone }),
        });
        customer = await cr.json();
      }

      // ensure default address
      if (customer && (customer.id || customer.customer_id || customer.ID)) {
        const cid = customer.id ?? customer.customer_id ?? customer.ID;

        const existing = Array.isArray(customer.addresses)
          ? customer.addresses.find((a) => (a.address || "").trim() === address)
          : null;

        if (existing) {
          if (!existing.is_default) {
            await fetch(`${API_URL}/api/customer-addresses/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_default: true }),
            });
          }
        } else {
          await fetch(`${API_URL}/api/customers/${cid}/addresses`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: "Default", address, is_default: true }),
          });
        }
      }
    } catch {
      // Backend sync is best-effort; local save is enough for UX
    }

    setSavedOnce(true);
  } finally {
    setSaving(false);
  }
}


  // Auto-prefill name + default address when phone is valid
useEffect(() => {
  const phoneOk = /^5\d{9}$/.test(form.phone);
  if (!phoneOk) return;

  (async () => {
    try {
      // exact match + addresses in one call
      const res = await fetch(`${API_URL}/api/customers/by-phone/${form.phone}`);
      const match = await res.json();
      if (!match) return;

      if (match.name && !form.name) {
        setForm(f => ({ ...f, name: match.name }));
      }

      const addrs = Array.isArray(match.addresses) ? match.addresses : [];
      const def = addrs.find(a => a.is_default) || addrs[0];
      if (def && !form.address) {
        setForm(f => ({ ...f, address: def.address }));
      }
    } catch {}
  })();
}, [form.phone]);


  const validBase =
    form.name &&
    /^5\d{9}$/.test(form.phone) &&
    form.address &&
    !!form.payment_method;

  const validCard =
    (form.payment_method !== "card") ||
    (useSaved && !!savedCard) ||
    (
      cardName.trim().length >= 2 &&
      luhnValid(cardNumber) &&
      expiryValid(cardExpiry) &&
      ((detectBrand(cardNumber) === "Amex") ? /^[0-9]{4}$/.test(cardCvc) : /^[0-9]{3}$/.test(cardCvc))
    );

  const validate = () => validBase && validCard;

  function persistCardIfRequested(meta) {
    if (!saveCard) return;
    try {
      const store = JSON.parse(localStorage.getItem("qr_saved_cards") || "{}");
      const list = Array.isArray(store[form.phone]) ? store[form.phone] : [];
      if (!list.some((c) => c.token === meta.token || c.last4 === meta.last4)) list.unshift(meta);
      store[form.phone] = list.slice(0, 3);
      localStorage.setItem("qr_saved_cards", JSON.stringify(store));
    } catch {}
  }

  const showNewCard = !savedCard || !useSaved; // 🔧 central flag

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-[360px] text-center relative">
        <button
          className="absolute right-3 top-3 bg-white/90 border border-blue-100 rounded-full w-10 h-10 flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-red-500 hover:bg-red-50 shadow"
          onClick={onClose}
          aria-label={t("Close")}
        >
          ×
        </button>

        <h2 className="text-xl font-bold mb-4 bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          {t("Delivery Info")}
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate()) {
              setTouched({ name: true, phone: true, address: true, payment_method: true, card: true });
              return;
            }
            let payment_meta = undefined;
            if (form.payment_method === "card") {
              if (!showNewCard && savedCard) {
                payment_meta = { ...savedCard, saved: true };
              } else {
                const brand = detectBrand(cardNumber);
                const token = makeToken();
                const { mm, yy } = parseExpiry(cardExpiry);
                const meta = {
                  token,
                  brand,
                  last4: cardNumber.replace(/\D/g, "").slice(-4),
                  expMonth: mm,
                  expYear: "20" + yy,
                };
                payment_meta = meta;
                persistCardIfRequested(meta);
              }
            }
            onSubmit({ ...form, payment_meta });
          }}
          className="flex flex-col gap-3 text-left"
        >
          <input
            className="rounded-xl px-4 py-3 border"
            placeholder={t("Full Name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          <input
            className={`rounded-xl px-4 py-3 border ${touched.phone && !/^5\d{9}$/.test(form.phone) ? "border-red-500" : ""}`}
            placeholder={t("Phone (5XXXXXXXXX)")}
            value={form.phone}
            onChange={(e) =>
              setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d]/g, "").slice(0, 10) }))
            }
            maxLength={10}
          />

          <textarea
            className="rounded-xl px-4 py-3 border"
            placeholder={t("Address")}
            rows={3}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />

          {/* Required Payment Method */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-bold text-blue-900">{t("Payment:")}</label>
            <select
              className={`rounded-xl px-4 py-3 border ${touched.payment_method && !form.payment_method ? "border-red-500" : ""}`}
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              <option value="">{t("Select Payment Method")}</option>
              <option value="cash">💵 {t("Cash")}</option>
              <option value="card">💳 {t("Credit Card")}</option>
              <option value="online">🌐 {t("Online Payment")}</option>
            </select>
          </div>

          {/* Card block */}
          {form.payment_method === "card" && (
            <div className="mt-2 p-3 rounded-2xl border-2 border-fuchsia-200 bg-pink-50/50">
              {savedCard && (
                <div className="mb-2">
                  <div className="text-xs font-bold text-fuchsia-700 mb-1">{t("Saved card")}:</div>
                  <div className="text-sm font-semibold text-fuchsia-800">
                    {savedCard.brand} •••• {savedCard.last4} ({savedCard.expMonth}/{String(savedCard.expYear).slice(-2)})
                  </div>

                  <div className="mt-2 flex gap-2 items-center">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={useSaved} onChange={() => setUseSaved(true)} />
                      {t("Use saved card")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="radio" checked={!useSaved} onChange={() => setUseSaved(false)} />
                      {t("Use a new card")}
                    </label>
                  </div>
                </div>
              )}

              {/* Always show new-card inputs when there's no saved card OR user chose new */}
              {showNewCard && (
                <div className="grid grid-cols-1 gap-2">
                  <input
                    className={`rounded-xl px-4 py-3 border ${touched.card && !cardName ? "border-red-500" : ""}`}
                    placeholder={t("Name on Card")}
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    autoComplete="cc-name"
                  />
                  <input
                    className={`rounded-xl px-4 py-3 border ${touched.card && !luhnValid(cardNumber) ? "border-red-500" : ""}`}
                    placeholder={t("Card Number")}
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                  <div className="flex gap-2 w-full">
                    <input
                      className={`flex-1 min-w-0 rounded-xl px-4 py-3 border ${touched.card && !expiryValid(cardExpiry) ? "border-red-500" : ""}`}
                      placeholder={t("Expiry (MM/YY)")}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                    />
                    <input
                      className={`w-20 shrink-0 rounded-xl px-4 py-3 border ${touched.card && !/^\d{3,4}$/.test(cardCvc) ? "border-red-500" : ""}`}
                      placeholder={t("CVC")}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                    />
                  </div>
                  <label className="mt-1 flex items-center gap-2 text-sm text-fuchsia-800">
                    <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                    {t("Save card for next time")}
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Save details for next time */}
<button
  type="button"
  onClick={saveDelivery}
  disabled={saving || !form.name || !/^5\d{9}$/.test(form.phone) || !form.address}
  className="w-full py-2 mt-2 rounded-2xl font-semibold text-blue-700 bg-white border border-blue-200 shadow-sm disabled:opacity-50"
>
  {saving ? t("Saving...") : (savedOnce ? `✅ ${t("Saved")}` : t("Save for next time"))}
</button>


          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 mt-3 rounded-2xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-lg shadow-lg disabled:opacity-70"
          >
            {submitting ? t("Please wait...") : t("Continue")}
          </button>
        </form>
      </div>
    </div>
  );
}


/* ====================== CATEGORY BAR ====================== */
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
function ProductGrid({ products, onProductClick, t }) {
  return (
    <main className="w-full max-w-full pt-3 pb-28 px-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 overflow-hidden">
      {products.length === 0 && (
        <div className="col-span-full text-center text-gray-400 font-bold text-lg py-8">
          {t("No products.")}
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

/* ====================== ADD TO CART (Addons) MODAL ====================== */
function AddToCartModal({ open, product, extrasGroups, onClose, onAddToCart, t }) {
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev || "");
  }, [open]);

  useEffect(() => {
    if (!open || !product) return;
    setQuantity(1);
    setSelectedExtras([]);
    setNote("");
    setActiveGroupIdx(0);
  }, [open, product]);

  if (!open || !product) return null;

  const basePrice = parseFloat(product.price) || 0;

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

  const productGroupNames = Array.isArray(product?.selectedExtrasGroup)
    ? product.selectedExtrasGroup
    : [];
  const availableGroups =
    productGroupNames.length > 0
      ? normalizedGroups.filter((g) => productGroupNames.includes(g.groupName))
      : normalizedGroups;

  const priceOf = (exOrItem) =>
    parseFloat(exOrItem?.price ?? exOrItem?.extraPrice ?? 0) || 0;

  const extrasPerUnit = selectedExtras.reduce(
    (sum, ex) => sum + priceOf(ex) * (ex.quantity || 1),
    0
  );
  const lineTotal = (basePrice + extrasPerUnit) * quantity;

  const qtyOf = (groupName, itemName) =>
    selectedExtras.find((ex) => ex.group === groupName && ex.name === itemName)?.quantity || 0;

  const incExtra = (group, item) => {
    setSelectedExtras((prev) => {
      const idx = prev.findIndex((ex) => ex.group === group.groupName && ex.name === item.name);
      if (idx === -1) {
        return [
          ...prev,
          { group: group.groupName, name: item.name, price: priceOf(item), quantity: 1 },
        ];
      }
      const copy = [...prev];
      copy[idx].quantity = (copy[idx].quantity || 0) + 1;
      return copy;
    });
  };

  const decExtra = (group, item) => {
    setSelectedExtras((prev) => {
      const idx = prev.findIndex((ex) => ex.group === group.groupName && ex.name === item.name);
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx].quantity = Math.max(0, (copy[idx].quantity || 0) - 1);
      if (copy[idx].quantity === 0) copy.splice(idx, 1);
      return copy;
    });
  };




  const handleBackdrop = (e) => {
    if (e.target.dataset.backdrop === "true") onClose?.();
  };

  return createPortal(
    <div
      data-backdrop="true"
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-[999] flex items-stretch sm:items-center justify-center bg-black/45"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[720px] md:w-[860px] bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Close */}
        <button
          className="absolute right-3 top-3 z-20 bg-white/90 border border-blue-100 rounded-full w-10 h-10 flex items-center justify-center text-2xl leading-none text-gray-500 hover:text-red-500 hover:bg-red-50 shadow"
          onClick={onClose}
          aria-label={t("Close")}
        >
          ×
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
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
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Groups rail */}
          <aside className="sm:w-48 border-b sm:border-b-0 sm:border-r-2 border-blue-100 bg-white/80 p-3 overflow-x-auto sm:overflow-y-auto">
            <div className="text-[11px] font-bold text-blue-600 mb-2 px-1">{t("Extras Groups")}</div>
            <div className="flex sm:block gap-2 sm:gap-0">
              {availableGroups.map((g, idx) => (
                <button
                  key={g.groupName}
                  onClick={() => setActiveGroupIdx(idx)}
                  className={`px-3 py-2 rounded-xl text-sm font-bold mb-2 border transition ${
                    activeGroupIdx === idx
                      ? "bg-gradient-to-r from-blue-500 via-fuchsia-500 to-indigo-500 text-white border-transparent"
                      : "bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  {g.groupName}
                </button>
              ))}
            </div>
          </aside>

          {/* Items + Quantity + Note */}
          <section className="flex-1 p-4 sm:p-5 overflow-y-auto">
            {/* Items */}
            {availableGroups.length > 0 ? (
              <>
                <div className="font-bold text-fuchsia-600 mb-2 text-base">
                  {availableGroups[activeGroupIdx].groupName}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {(availableGroups[activeGroupIdx].items || []).map((item) => {
                    const unit = parseFloat(item?.price ?? item?.extraPrice ?? 0) || 0;
                    const q = selectedExtras.find((ex) => ex.group === availableGroups[activeGroupIdx].groupName && ex.name === item.name)?.quantity || 0;
                    return (
                      <div
                        key={item.name}
                        className="flex flex-col items-center bg-white/80 border border-blue-100 rounded-xl px-2 py-2 min-h-[92px] shadow-sm"
                      >
                        <div className="text-center text-sm font-bold text-blue-900 leading-tight line-clamp-2">
                          {item.name}
                        </div>
                        <div className="text-[12px] text-indigo-700 font-semibold">₺{unit.toFixed(2)}</div>
                        <div className="mt-2 flex items-center justify-center gap-2">
                          <button
                            className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xl font-bold hover:bg-indigo-200"
                            onClick={() => {
                              setSelectedExtras((prev) => {
                                const idx = prev.findIndex((ex) => ex.group === availableGroups[activeGroupIdx].groupName && ex.name === item.name);
                                if (idx === -1) return prev;
                                const copy = [...prev];
                                copy[idx].quantity = Math.max(0, (copy[idx].quantity || 0) - 1);
                                if (copy[idx].quantity === 0) copy.splice(idx, 1);
                                return copy;
                              });
                            }}
                          >
                            –
                          </button>
                          <span className="min-w-[28px] text-center text-base font-extrabold">{q}</span>
                          <button
                            className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xl font-bold hover:bg-indigo-200"
                            onClick={() => {
                              setSelectedExtras((prev) => {
                                const idx = prev.findIndex((ex) => ex.group === availableGroups[activeGroupIdx].groupName && ex.name === item.name);
                                if (idx === -1) {
                                  return [...prev, { group: availableGroups[activeGroupIdx].groupName, name: item.name, price: unit, quantity: 1 }];
                                }
                                const copy = [...prev];
                                copy[idx].quantity = (copy[idx].quantity || 0) + 1;
                                return copy;
                              });
                            }}
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
              <div className="text-gray-400">{t("Select a group")}</div>
            )}

            {/* Quantity */}
            <div className="mt-5 sm:mt-6">
              <div className="text-sm font-bold text-blue-700 mb-2">{t("Quantity")}</div>
              <div className="flex items-center justify-center gap-3">
                <button
                  className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 text-2xl font-bold shadow hover:bg-indigo-200"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  –
                </button>
                <span className="w-12 text-center text-2xl font-extrabold">{quantity}</span>
                <button
                  className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 text-2xl font-bold shadow hover:bg-indigo-200"
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  +
                </button>
              </div>
            </div>

            {/* Note */}
            <div className="mt-4 sm:mt-5">
              <textarea
                className="w-full rounded-xl border-2 border-fuchsia-200 p-3 text-sm bg-pink-50 placeholder-fuchsia-400"
                placeholder={t("Add a note (optional)…")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-blue-100 px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between bg-gradient-to-t from-blue-100 via-fuchsia-50 to-white">
          <div className="text-lg sm:text-xl font-extrabold text-fuchsia-700">
            {t("Total")}: ₺{lineTotal.toFixed(2)}
          </div>
          <button
            className="py-2.5 sm:py-3 px-4 sm:px-5 rounded-2xl font-bold text-white bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-500 hover:scale-105 transition-all"
            onClick={() => {
              const unique_id = product.id + "-" + btoa(JSON.stringify(selectedExtras) + (note || ""));
              onAddToCart({
                id: product.id,
                name: product.name,
                image: product.image,
                price: basePrice + selectedExtras.reduce((s, ex) => s + (ex.price || 0) * (ex.quantity || 1), 0),
                quantity,
                extras: selectedExtras.filter((e) => e.quantity > 0),
                note,
                unique_id,
              });
            }}
          >
            {t("Add to Cart")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CartDrawer({
  cart,
  setCart,
  onSubmitOrder,
  orderType,
  paymentMethod,
  setPaymentMethod,
  submitting,
  onOrderAnother,
  t,
}) {
  const [show, setShow] = useState(false);

  const prevItems = cart.filter(i => i.locked);
  const newItems  = cart.filter(i => !i.locked);

  const lineTotal = (item) => {
    const extrasTotal = (item.extras || []).reduce(
      (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return (parseFloat(item.price) || 0 + extrasTotal) * (item.quantity || 1);
  };
  const total = newItems.reduce((sum, i) => sum + lineTotal(i), 0);

  // 👂 close by global event
  useEffect(() => {
    const handler = () => setShow(false);
    window.addEventListener("qr:cart-close", handler);
    return () => window.removeEventListener("qr:cart-close", handler);
  }, []);

  // 🚪 auto-open only if allowed
  useEffect(() => {
    const auto = localStorage.getItem("qr_cart_auto_open") !== "0";
    if (auto) setShow(cart.length > 0);
  }, [cart.length]);

  function removeItem(idx, isNew) {
    if (!isNew) return; // don't remove locked (read-only)
    setCart((prev) => {
      let n = -1;
      return prev.filter((it) => (it.locked ? true : (++n !== idx)));
    });
  }

  return (
    <>
      {!show && cart.length > 0 && (
        <button
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-7 rounded-3xl shadow-xl z-50"
          onClick={() => {
            localStorage.setItem("qr_cart_auto_open", "1");
            setShow(true);
          }}
        >
          🛒 {t("View Cart")} ({cart.length})
        </button>
      )}

      {show && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/30">
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-bold text-blue-800">🛒 {t("Your Order")}</span>
              <button className="text-2xl text-gray-400 hover:text-red-500" onClick={() => setShow(false)} aria-label={t("Close")}>×</button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[48vh]">
              {cart.length === 0 ? (
                <div className="text-gray-400 text-center py-8">{t("Cart is empty.")}</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Previously ordered (locked) */}
                  {prevItems.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-500 mb-1">Previously in this order (won’t be added again)</div>
                      <ul className="flex flex-col gap-2">
                        {prevItems.map((item, i) => (
                          <li key={`prev-${i}`} className="flex items-start justify-between gap-3 border-b border-blue-100 pb-2 opacity-70">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold block">{item.name} <span className="text-xs text-gray-500">x{item.quantity}</span></span>
                              {item.extras?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.extras.map((ex, j) => {
                                    const unit = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                                    const line = unit * (ex.quantity || 1);
                                    return (
                                      <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-xs rounded-full">
                                        <span>{ex.name}</span><span>×{ex.quantity || 1}</span><span className="font-semibold">₺{line.toFixed(2)}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {item.note && <div className="text-xs text-yellow-700 mt-1">📝 {t("Note")}: {item.note}</div>}
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="font-bold text-indigo-700">₺{lineTotal(item).toFixed(2)}</span>
                              <span className="text-[10px] text-gray-400 mt-1">locked</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* New items */}
                  <div>
                    <div className="text-xs font-bold text-blue-600 mb-1">New items to add</div>
                    {newItems.length === 0 ? (
                      <div className="text-gray-400 text-sm">No new items yet</div>
                    ) : (
                      <ul className="flex flex-col gap-2">
                        {newItems.map((item, i) => (
                          <li key={`new-${i}`} className="flex items-start justify-between gap-3 border-b border-blue-100 pb-2">
                            <div className="flex-1 min-w-0">
                              <span className="font-bold block">{item.name} <span className="text-xs text-gray-500">x{item.quantity}</span></span>
                              {item.extras?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {item.extras.map((ex, j) => {
                                    const unit = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                                    const line = unit * (ex.quantity || 1);
                                    return (
                                      <span key={j} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-xs rounded-full">
                                        <span>{ex.name}</span><span>×{ex.quantity || 1}</span><span className="font-semibold">₺{line.toFixed(2)}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {item.note && <div className="text-xs text-yellow-700 mt-1">📝 {t("Note")}: {item.note}</div>}
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span className="font-bold text-indigo-700">₺{lineTotal(item).toFixed(2)}</span>
                              <button className="text-xs text-red-400 hover:text-red-700 mt-1" onClick={() => removeItem(i, true)}>{t("Remove")}</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <>
                <div className="flex justify-between text-base font-bold mt-5 mb-3">
                  <span>{t("Total")}:</span>
                  <span className="text-indigo-700 text-xl">₺{total.toFixed(2)}</span>
                </div>

                {/* Payment choice */}
<div className="flex flex-col gap-2 mb-2">
  <label className="font-bold text-blue-900">{t("Payment:")}</label>
  <select
    className="rounded-xl px-2 py-1 border"
    value={paymentMethod}
    onChange={(e) => setPaymentMethod(e.target.value)}
  >
    {orderType === "table" ? (
      <>
        <option value="online">🌐 {t("Pay Online Now")}</option>
        <option value="card">💳 {t("Card at Table")}</option>
        <option value="sodexo">🍽️ Sodexo</option>
        <option value="multinet">🍽️ Multinet</option>
        <option value="cash">💵 {t("Cash at Table")}</option>
      </>
    ) : (
      <>
        <option value="cash">💵 {t("Cash")}</option>
        <option value="card">💳 {t("Credit Card")}</option>
        <option value="online">🌐 {t("Online Payment")}</option>
      </>
    )}
  </select>
</div>


                <button
                  className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 mt-3 text-lg shadow-lg hover:scale-105 transition"
                  onClick={onSubmitOrder}
                  disabled={submitting || newItems.length === 0}
                >
                  {submitting ? t("Please wait...") : t("Submit Order")}
                </button>

                <button
                  className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-fuchsia-500 to-pink-500 mt-2 text-lg shadow-lg hover:scale-105 transition"
                  onClick={() => { setShow(false); onOrderAnother?.(); }}
                >
                  {t("Order Another")}
                </button>

                <button
                  className="w-full mt-2 py-2 rounded-lg font-medium text-xs text-gray-700 bg-gray-100 hover:bg-red-50 transition"
                  onClick={() => {
                    // Clear only NEW items; keep locked items visible
                    setCart((prev) => prev.filter(i => i.locked));
                    localStorage.setItem("qr_cart", JSON.stringify(cart.filter(i => i.locked)));
                  }}
                >
                  Clear New Items
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

async function startOnlinePaymentSession(id) {
  try {
    const res = await fetch(`${API_URL}/api/payments/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, method: "online" }) // backend should compute unpaid total
    });
    const text = await res.text();
    const data = JSON.parse(text).pay_url ? JSON.parse(text) : {};
    if (data.pay_url) {
      localStorage.setItem("qr_payment_url", data.pay_url);
      return data.pay_url;
    }
  } catch (e) {
    console.error("startOnlinePaymentSession failed:", e);
  }
  return null;
}


/* ====================== ORDER STATUS MODAL ====================== */
function OrderStatusModal({ open, status, orderId, table, onOrderAnother, onClose, onFinished, t }) {
  if (!open) return null;

  const title =
    status === "success" ? t("Order Sent!")
    : status === "pending" ? t("Sending Order...")
    : t("Order Failed");

  const message =
    status === "success" ? t("Thank you! Your order has been received.")
    : status === "pending" ? t("Please wait...")
    : t("Something went wrong. Please try again.");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
      {/* Modal container: fixed height with scrollable middle */}
      <div className="bg-white rounded-3xl shadow-2xl w-[92vw] max-w-md max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6">
          <h2 className="text-2xl font-extrabold mb-3 bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
            {title}
          </h2>
          <div className="text-lg text-blue-900">{message}</div>
        </div>

        {/* Scrollable content */}
       <div className="px-4 pb-2 flex-1 min-h-0 overflow-y-auto">
  {orderId ? (
    <OrderStatusScreen
      orderId={orderId}
      table={table}
      onOrderAnother={onOrderAnother}
      onFinished={onFinished}
      t={t}
    />
  ) : null}
</div>


        {/* Footer */}
        <div className="p-4 border-t bg-white">
          <button
            className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold shadow hover:bg-blue-600 transition"
            onClick={status === "success" ? onOrderAnother : onClose}
          >
            {status === "success" ? t("Order Another") : t("Close")}
          </button>
        </div>
      </div>
    </div>
  );
}



// keep this effect to adapt the default when orderType changes
useEffect(() => {
  if (orderType === "table" && !["online","card","sodexo","multinet","cash"].includes(paymentMethod)) {
    setPaymentMethod("card");
  }
  if (orderType === "online" && !["online","card","cash"].includes(paymentMethod)) {
    setPaymentMethod("online");
  }
}, [orderType]);

useEffect(() => {
  localStorage.setItem("qr_payment_method", paymentMethod);
}, [paymentMethod]);

// When switching order type, choose a sensible default
useEffect(() => {
  if (orderType === "table" && !["online","card","sodexo","multinet","cash"].includes(paymentMethod)) {
    setPaymentMethod("card");
  }
  if (orderType === "online" && !["online","card","cash"].includes(paymentMethod)) {
    setPaymentMethod("online");
  }
}, [orderType]);

/* ====================== MAIN QR MENU ====================== */
export default function QrMenu() {
  // persist language
  const [lang, setLang] = useState(() => localStorage.getItem("qr_lang") || "en");
  useEffect(() => { localStorage.setItem("qr_lang", lang); }, [lang]);
  const t = useMemo(() => makeT(lang), [lang]);

  const [orderType, setOrderType] = useState(null);
  const [table, setTable] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(localStorage.getItem("qr_cart") || "[]"); } catch { return []; }
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [showStatus, setShowStatus] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [categoryImages, setCategoryImages] = useState({});
  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(
  () => localStorage.getItem("qr_payment_method") || "online"
);
  
  // show Delivery Info form first, every time Delivery is chosen
// show Delivery Info form only when starting a brand-new online order
const [showDeliveryForm, setShowDeliveryForm] = useState(false);
useEffect(() => {
  const hasActive = !!(orderId || localStorage.getItem("qr_active_order_id"));
  if (orderType === "online" && !hasActive) {
    setShowDeliveryForm(true);
  }
}, [orderType, orderId]);






// -- clear saved table ONLY when no items in cart and no active order
function resetTableIfEmptyCart() {
  const count = Array.isArray(cart) ? cart.length : 0;
  const hasActive = !!(orderId || localStorage.getItem("qr_active_order_id"));
  if (count === 0 && !hasActive) {
    try {
      localStorage.removeItem("qr_table");
      localStorage.removeItem("qr_selected_table");
      localStorage.removeItem("qr_orderType");
    } catch {}
    // let any listeners react instantly (if you add one later)
    window.dispatchEvent(new Event("qr:table-reset"));
  }
}

// when user taps the header “×”
function handleCloseOrderPage() {
  // If there’s an active order, keep showing status (don’t go back to type)
  const activeId = orderId || Number(localStorage.getItem("qr_active_order_id")) || null;
  if (activeId) {
    setShowStatus(true);
    setOrderStatus("success");
    return;
  }

  // No active order → normal behavior
  resetTableIfEmptyCart();
  setTable(null);
  setOrderType(null);
}




function resetToTypePicker() {
  // clear all session keys
  localStorage.removeItem("qr_active_order");
  localStorage.removeItem("qr_active_order_id");
  localStorage.removeItem("qr_cart");
  localStorage.removeItem("qr_table");
  localStorage.removeItem("qr_orderType");
  localStorage.removeItem("qr_order_type");
  localStorage.setItem("qr_show_status", "0");

  // reset UI state
  setShowStatus(false);
  setOrderStatus("pending");
  setOrderId(null);
  setCart([]);
  setCustomerInfo(null);
  setTable(null);
  setOrderType(null);
}




// Bootstrap on refresh: restore by saved order id, else by saved table
useEffect(() => {
  (async () => {
    try {
      const activeId = localStorage.getItem("qr_active_order_id");

      // helper: true if ALL items are delivered
      async function allItemsDelivered(id) {
        try {
          const ir = await fetch(`${API_URL}/api/orders/${id}/items`);
          if (!ir.ok) return false;
          const raw = await ir.json();
          const arr = Array.isArray(raw) ? raw : [];
          return arr.length > 0 && arr.every(it => (it.kitchen_status || "").toLowerCase() === "delivered");
        } catch { return false; }
      }

      // 1) If we have a saved active order id, prefer that
      if (activeId) {
        const res = await fetch(`${API_URL}/api/orders/${activeId}`);
        if (res.ok) {
          const order = await res.json();
          const status = (order?.status || "").toLowerCase();

          // finished states or everything delivered → reset to type picker
          if (["closed", "completed", "paid", "canceled"].includes(status) || await allItemsDelivered(activeId)) {
            resetToTypePicker();
            return;
          }

          // still active → restore and show status
          const type = order.order_type === "table" ? "table" : "online";
          setOrderType(type);
          setTable(type === "table" ? Number(order.table_number) || null : null);
          setOrderId(order.id);

          setOrderStatus("success");
          setShowStatus(true);
          return;
        }

        // bad fetch or missing → clean up any stale flags
        resetToTypePicker();
        return;
      }

      // 2) Fallback: see if a saved table has an open (non-closed) order
      const savedTable = Number(
        localStorage.getItem("qr_table") ||
        localStorage.getItem("qr_selected_table") ||
        "0"
      ) || null;

      if (savedTable) {
        const q = await fetch(`${API_URL}/api/orders?table_number=${savedTable}`);
        if (q.ok) {
          const raw = await q.json();
          const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
          const openOrder = list.find(o => (o?.status || "").toLowerCase() !== "closed") || null;

          if (openOrder) {
            // all delivered? → reset
            if (await allItemsDelivered(openOrder.id)) {
              resetToTypePicker();
              return;
            }

            // restore
            setOrderType("table");
            setTable(savedTable);
            setOrderId(openOrder.id);
            setOrderStatus("success");
            setShowStatus(true);

            localStorage.setItem("qr_active_order_id", String(openOrder.id));
            localStorage.setItem("qr_orderType", "table");
            localStorage.setItem("qr_show_status", "1");
            return;
          }
        }
      }

      // 3) Nothing to restore
      setOrderType(null);
      setTable(null);
      setShowStatus(false);
    } catch {
      setOrderType(null);
      setTable(null);
      setShowStatus(false);
    }
  })();
}, []);


  useEffect(() => {
    fetch(`${API_URL}/api/category-images`)
      .then((res) => res.json())
      .then((data) => {
        const dict = {};
        data.forEach(({ category, image }) => {
          dict[category.trim().toLowerCase()] = `/uploads/${image}`;
        });
        setCategoryImages(dict);
      })
      .catch(() => setCategoryImages({}));
  }, []);

  useEffect(() => {
    localStorage.setItem("qr_cart", JSON.stringify(cart));
  }, [cart]);

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

    fetch(`${API_URL}/api/orders`)
      .then((res) => res.json())
      .then((orders) => {
        const occupied = orders
          .filter((order) => order.table_number && order.status !== "closed")
          .map((order) => Number(order.table_number));
        setOccupiedTables(occupied);
      });

    function tryJSON(v) { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  }, []);


// === Always-mounted Order Status (portal) ===
const statusPortal = (showStatus && orderId)
  ? createPortal(
      <OrderStatusModal
        open={true}
        status={orderStatus}
        orderId={orderId}
        table={orderType === "table" ? table : null}
        onOrderAnother={handleOrderAnother}
        onClose={handleReset}
        onFinished={resetToTypePicker}
        t={t}
      />,
      document.body
    )
  : null;


// --- Order type select (show modal here too if needed) ---
if (!orderType)
  return (
    <>
    <OrderTypeSelect
  onSelect={(type) => {
    setOrderType(type);
    if (type === "online") {
      // always show details modal first
      setShowDeliveryForm(true);
    }
  }}
  lang={lang}
  setLang={setLang}
  t={t}
/>

      {statusPortal}
    </>
  );

// --- Table select (let THIS device re-open its own occupied table) ---
if (orderType === "table" && !table) {
  const myTable = Number(
    localStorage.getItem("qr_table") ||
    localStorage.getItem("qr_selected_table") ||
    "0"
  ) || null;

  const filteredOccupied = myTable
    ? occupiedTables.filter((n) => n !== myTable)
    : occupiedTables;

  return (
    <>
      <TableSelectModal
        onSelectTable={async (n) => {
          // Try to jump straight to an existing open order on this table
          try {
            const res = await fetch(`${API_URL}/api/orders?table_number=${n}`);
            if (res.ok) {
              const raw = await res.json();
              const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
              // backend often excludes closed already; be defensive
              const openOrder = list.find(o => (o?.status || "").toLowerCase() !== "closed") || list[0] || null;

              if (openOrder) {
                setOrderType("table");
                setTable(n);
                setOrderId(openOrder.id);
                setActiveOrder(openOrder);
                setShowStatus(true);
                setOrderStatus("success");

                localStorage.setItem("qr_active_order", JSON.stringify({ orderId: openOrder.id, orderType: "table", table: n }));
                localStorage.setItem("qr_active_order_id", String(openOrder.id));
                localStorage.setItem("qr_orderType", "table");
                localStorage.setItem("qr_table", String(n));
                localStorage.setItem("qr_show_status", "1");
                return; // <- IMPORTANT: stop here so status opens
              }
            }
          } catch {
            // fall through
          }

          // No open order -> proceed like a fresh selection
          setTable(n);
          localStorage.setItem("qr_table", String(n));
          localStorage.setItem("qr_orderType", "table");
        }}
        occupiedTables={filteredOccupied}
        onClose={() => setOrderType(null)}
        t={t}
      />
      {statusPortal}
    </>
  );
}


// ---- Rehydrate cart from current order (generate NEW unique_id for each line) ----
// ---- Rehydrate cart from current order, but mark them as locked (read-only) ----
async function rehydrateCartFromOrder(orderId) {
  try {
    const res = await fetch(`${API_URL}/api/orders/${orderId}/items`);
    if (!res.ok) throw new Error("Failed to load order items");
    const raw = await res.json();

    const now36 = Date.now().toString(36);
    const lockedItems = (Array.isArray(raw) ? raw : [])
      // keep non-delivered so customer can see what is in progress/ready
      .filter(i => (i.kitchen_status || "new") !== "delivered")
      .map((it) => ({
        id: it.product_id ?? it.external_product_id,
        name: it.order_item_name || it.product_name || it.name || "Item",
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        extras: typeof it.extras === "string" ? JSON.parse(it.extras) : (it.extras || []),
        note: it.note || "",
        image: null,
        unique_id: `${(it.product_id ?? it.external_product_id ?? "x")}-${now36}-${Math.random().toString(36).slice(2,8)}`,
        locked: true, // ← ← ← IMPORTANT
      }));

    // Show only locked items for context; new items will be added later
    setCart(lockedItems);
  } catch (e) {
    console.error("rehydrateCartFromOrder failed:", e);
  }
}

// ---- Order Another: show previous lines (locked), start fresh for new ones ----
async function handleOrderAnother() {
  try {
    setShowStatus(false);
    setOrderStatus("pending");

    // keep drawer closed; user opens if needed
    localStorage.setItem("qr_cart_auto_open", "0");
    window.dispatchEvent(new Event("qr:cart-close"));

    // resolve existing order
    let id = orderId || Number(localStorage.getItem("qr_active_order_id")) || null;
    let type = orderType || localStorage.getItem("qr_orderType") || (table ? "table" : null);

    // If table known but no id, fetch open order for that table
    if (!id && (type === "table" || table)) {
      const tNo = table || Number(localStorage.getItem("qr_table")) || null;
      if (tNo) {
        try {
          const q = await fetch(`${API_URL}/api/orders?table_number=${tNo}`);
          if (q.ok) {
            const list = await q.json();
            const open = Array.isArray(list) ? list.find(o => (o.status || "").toLowerCase() !== "closed") : null;
            if (open) {
              id = open.id;
              type = "table";
              setOrderId(id);
              setOrderType("table");
            }
          }
        } catch {}
      }
    }

    // ONLINE branch: rehydrate previous (locked) items too
    if (type === "online" && id) {
      await rehydrateCartFromOrder(id); // sets locked: true items
      setOrderType("online");
      localStorage.setItem("qr_active_order_id", String(id));
      localStorage.setItem("qr_orderType", "online");
      localStorage.setItem("qr_show_status", "0");
      setShowDeliveryForm(false); // don’t ask details again
      return;
    }

    // TABLE branch (unchanged)
    if (type === "table" && id) {
      await rehydrateCartFromOrder(id); // sets locked: true items
      localStorage.setItem("qr_active_order_id", String(id));
      localStorage.setItem("qr_orderType", "table");
      if (table) localStorage.setItem("qr_table", String(table));
      localStorage.setItem("qr_show_status", "0");
      return;
    }

    // nothing to restore → clean cart
    setCart([]);
    localStorage.setItem("qr_cart", "[]");
    localStorage.setItem("qr_show_status", "0");
  } catch (e) {
    console.error("handleOrderAnother failed:", e);
  }
}






    function calcOrderTotalWithExtras(cart) {
  return cart.reduce((sum, item) => {
    const extrasTotal = (item.extras || []).reduce(
      (extraSum, ex) => extraSum + (parseFloat(ex.price) || 0) * (ex.quantity || 1),
      0
    );
    return sum + (parseFloat(item.price) + extrasTotal) * (item.quantity || 1);
  }, 0);
}

// ---- helpers ----
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json())?.message || (await res.text()); } catch {}
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  try { return await res.json(); } catch { return null; }
}

function buildOrderPayload({ orderType, table, items, total, customer }) {
  const itemsPayload = items.map(i => ({
    product_id: i.id,
    quantity: i.quantity,
    price: parseFloat(i.price) || 0,
    ingredients: i.ingredients ?? [],
    extras: i.extras ?? [],
    unique_id: i.unique_id,
    note: i.note || null,
    confirmed: true,
    kitchen_status: 'new',      // <-- ensures it hits the kitchen
    payment_method: null,
    receipt_id: null,
  }));

  return {
    table_number: orderType === "table" ? Number(table) : null,
    order_type: orderType === "online" ? "packet" : "table", // or keep "online" if you prefer; kitchen doesn't care
    total: Number(total) || 0,
    items: itemsPayload,
    // Nice-to-have fields for online orders:
    customer_name: customer?.name || null,
    customer_phone: customer?.phone || null,
    customer_address: customer?.address || null,
    payment_method: null,
  };
}
async function handleSubmitOrder() {
  try {
    setSubmitting(true);
    setLastError(null);

    setOrderStatus("pending");
    setShowStatus(true);

    // Require delivery details only when starting a brand-new ONLINE order
    const hasActiveOnline = orderType === "online" && (orderId || localStorage.getItem("qr_active_order_id"));
    if (orderType === "online" && !hasActiveOnline && !customerInfo) {
      setShowDeliveryForm(true);
      return;
    }

    const newItems = (Array.isArray(cart) ? cart : []).filter(i => !i.locked);
    if (newItems.length === 0) {
      setOrderStatus("success");
      setShowStatus(true);
      return;
    }

    if (orderType === "table" && !table) {
      throw new Error("Please select a table.");
    }

    // ---------- APPEND to existing order ----------
    if (orderId) {
      const itemsPayload = newItems.map((i) => ({
        product_id: i.id,
        quantity: i.quantity,
        price: parseFloat(i.price) || 0,
        ingredients: i.ingredients ?? [],
        extras: i.extras ?? [],
        unique_id: i.unique_id,
        note: i.note || null,
        confirmed: true,
        payment_method: null,
        receipt_id: null,
      }));

      await postJSON(`${API_URL}/api/orders/order-items`, {
        order_id: orderId,
        receipt_id: null,
        items: itemsPayload,
      });

      // Save/patch the chosen payment method on the order (ignore if backend doesn't support)
      try {
        await fetch(`${API_URL}/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_method: paymentMethod }),
        });
      } catch {}

      // If user chose Online, create/refresh a checkout session
      if (paymentMethod === "online") {
        await startOnlinePaymentSession(orderId);
      }

      // clear only NEW items
      setCart((prev) => prev.filter(i => i.locked));

      localStorage.setItem("qr_active_order", JSON.stringify({ orderId, orderType, table: orderType === "table" ? table : null }));
      localStorage.setItem("qr_active_order_id", String(orderId));
      if (orderType === "table" && table) localStorage.setItem("qr_table", String(table));
      localStorage.setItem("qr_orderType", orderType);
      localStorage.setItem("qr_payment_method", paymentMethod);
      localStorage.setItem("qr_show_status", "1");

      setOrderStatus("success");
      setShowStatus(true);
      return;
    }

    // ---------- CREATE brand-new order ----------
    const total = newItems.reduce((sum, item) => {
      const extrasTotal = (item.extras || []).reduce(
        (s, ex) => s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
        0
      );
      return sum + (parseFloat(item.price) + extrasTotal) * (item.quantity || 1);
    }, 0);

    const created = await postJSON(
      `${API_URL}/api/orders`,
      buildOrderPayload({
        orderType,
        table,
        items: newItems,
        total,
        customer: orderType === "online" ? customerInfo : null,
        // 👇 tell backend what the customer selected (store it on the order)
        payment_method: paymentMethod,
      })
    );

    const newId = created?.id;
    if (!newId) throw new Error("Server did not return order id.");

    // If Online, start a checkout session for this order
    if (paymentMethod === "online") {
      await startOnlinePaymentSession(newId);
    }

    setOrderId(newId);
    localStorage.setItem("qr_active_order", JSON.stringify({ orderId: newId, orderType, table: orderType === "table" ? table : null }));
    localStorage.setItem("qr_active_order_id", String(newId));
    if (orderType === "table" && table) localStorage.setItem("qr_table", String(table));
    localStorage.setItem("qr_orderType", orderType);
    localStorage.setItem("qr_payment_method", paymentMethod);
    localStorage.setItem("qr_show_status", "1");

    setCart([]); // fresh order → empty cart
    setOrderStatus("success");
    setShowStatus(true);
  } catch (e) {
    console.error("Order submit failed:", e);
    setLastError(e.message || "Order failed");
    setOrderStatus("fail");
    setShowStatus(true);
  } finally {
    setSubmitting(false);
  }
}






function handleReset() {
  setShowStatus(false);
  setOrderStatus("pending");
  setCart([]);
  localStorage.removeItem("qr_cart");
  localStorage.setItem("qr_show_status", "0");

  if (orderType === "table") {
    // Stay on same table & keep orderId for sub-orders
    // Do NOT remove qr_active_order
    return;
  }

  // Online flow: clear session
  setOrderId(null);
  setOrderType(null);
  setCustomerInfo(null);
  localStorage.removeItem("qr_active_order");
}


  

return (
  <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
    <QrHeader
      orderType={orderType}
      table={table}
      onClose={handleCloseOrderPage}
      t={t}
    />

    <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 w-full">
      <ProductGrid
        products={products.filter((p) => p.category === activeCategory)}
        onProductClick={(product) => {
          setSelectedProduct(product);
          setShowAddModal(true);
        }}
        t={t}
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
  onSubmitOrder={handleSubmitOrder}
  orderType={orderType}                 // ✅ add this
  paymentMethod={paymentMethod}
  setPaymentMethod={setPaymentMethod}
  submitting={submitting}
  onOrderAnother={handleOrderAnother}
  t={t}
/>


    <AddToCartModal
      open={showAddModal}
      product={selectedProduct}
      extrasGroups={extrasGroups}
      onClose={() => setShowAddModal(false)}
      onAddToCart={(item) => {
  // allow drawer to auto-open on this user action
  localStorage.setItem("qr_cart_auto_open", "1");
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

      t={t}
    />

    {/* 🔑 Show Order Status after submit */}
    {statusPortal}

    {/* ✅ Delivery form stays inside the return */}
    {orderType === "online" && showDeliveryForm && (
      <OnlineOrderForm
        submitting={submitting}
        t={t}
        onClose={() => {
          // if they close without continuing, go back to Order Type
          setShowDeliveryForm(false);
          setOrderType(null);
        }}
        onSubmit={(form) => {
          // we ALWAYS show this screen first; saved details will be prefilled here
          setCustomerInfo({
            name: form.name,
            phone: form.phone,
            address: form.address,
            payment_method: form.payment_method, // optional to use in submission
          });
          setShowDeliveryForm(false);
        }}
      />
    )}
  </div>
);

}






