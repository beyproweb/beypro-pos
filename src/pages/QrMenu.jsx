// src/pages/QrMenu.jsx
import React, { useState, useEffect, useMemo } from "react";
import OrderStatusScreen from "../components/OrderStatusScreen";
import { createPortal } from "react-dom";

const API_URL = import.meta.env.VITE_API_URL || "";

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

/* ====================== CART DRAWER ====================== */
function CartDrawer({
  cart,
  setCart,
  onSubmitOrder,
  orderType,
  paymentMethod,
  setPaymentMethod,
  submitting,
  t,
}) {
  const [show, setShow] = useState(false);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    setShow(cart.length > 0);
  }, [cart.length]);

  function removeItem(idx) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <>
      {!show && cart.length > 0 && (
        <button
          className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold py-3 px-7 rounded-3xl shadow-xl z-50"
          onClick={() => setShow(true)}
        >
          🛒 {t("View Cart")} ({cart.length})
        </button>
      )}
      {show && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/30">
          <div className="w-full max-w-md bg-white rounded-t-3xl md:rounded-3xl shadow-2xl p-5 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <span className="text-lg font-bold text-blue-800">🛒 {t("Your Order")}</span>
              <button
                className="text-2xl text-gray-400 hover:text-red-500"
                onClick={() => setShow(false)}
                aria-label={t("Close")}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[48vh]">
              {cart.length === 0 ? (
                <div className="text-gray-400 text-center py-8">{t("Cart is empty.")}</div>
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

                        {item.extras && item.extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.extras.map((ex, j) => {
                              const unit = parseFloat(ex.price ?? ex.extraPrice ?? 0);
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
                            📝 {t("Note")}: {item.note}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="font-bold text-indigo-700">
                          ₺{(item.price * item.quantity).toFixed(2)}
                        </span>
                        <button
                          className="text-xs text-red-400 hover:text-red-700 mt-1"
                          onClick={() => removeItem(i)}
                        >
                          {t("Remove")}
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
                  <span>{t("Total")}:</span>
                  <span className="text-indigo-700 text-xl">₺{total.toFixed(2)}</span>
                </div>
                {orderType === "online" && (
                  <div className="flex flex-col gap-2 mb-2">
                    <label className="font-bold text-blue-900">{t("Payment:")}</label>
                    <select
                      className="rounded-xl px-2 py-1 border"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="cash">💵 {t("Cash")}</option>
                      <option value="card">💳 {t("Credit Card")}</option>
                      <option value="online">🌐 {t("Online Payment")}</option>
                    </select>
                  </div>
                )}
                <button
                  className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 mt-3 text-lg shadow-lg hover:scale-105 transition"
                  onClick={onSubmitOrder}
                  disabled={submitting}
                >
                  {submitting ? t("Please wait...") : t("Submit Order")}
                </button>
                <button
                  className="w-full mt-2 py-2 rounded-lg font-medium text-xs text-gray-700 bg-gray-100 hover:bg-red-50 transition"
                  onClick={() => setCart([])}
                >
                  {t("Clear Cart")}
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
function OrderStatusModal({ open, status, orderId, table, onOrderAnother, onClose, t }) {
  if (!open) return null;

  const title =
    status === "success"
      ? t("Order Sent!")
      : status === "pending"
      ? t("Sending Order...")
      : t("Order Failed");

  const message =
    status === "success"
      ? t("Thank you! Your order has been received.")
      : status === "pending"
      ? t("Please wait...")
      : t("Something went wrong. Please try again.");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-xs w-full text-center">
        <h2 className="text-2xl font-extrabold mb-5 bg-gradient-to-r from-green-500 via-blue-500 to-indigo-500 text-transparent bg-clip-text">
          {title}
        </h2>
        <div className="text-lg text-blue-900 mb-6">{message}</div>

        {orderId && open && (
          <OrderStatusScreen
            orderId={orderId}
            table={table}
            onOrderAnother={onOrderAnother}
            t={t}
          />
        )}

        <button
          className="py-3 px-6 rounded-xl bg-blue-500 text-white font-bold shadow hover:bg-blue-600 transition"
          onClick={status === "success" ? onOrderAnother : onClose}
        >
          {status === "success" ? t("Order Another") : t("Close")}
        </button>
      </div>
    </div>
  );
}

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
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [categoryImages, setCategoryImages] = useState({});
  
function handleOrderAnother() {
  // close status, keep SAME orderId for table to append sub-orders
  setShowStatus(false);
  setOrderStatus("pending");

  // clear only the cart; do NOT clear orderId if table
  setCart([]);
  localStorage.removeItem("qr_cart");

  if (orderType === "table") {
    // keep table and active order; do not touch qr_active_order
    localStorage.setItem("qr_show_status", "0"); // don't auto-open until next submit
    return;
  }

  // for online, reset to chooser flow
  setOrderId(null);
  setOrderType(null);
  setCustomerInfo(null);
  localStorage.setItem("qr_show_status", "0");
  localStorage.removeItem("qr_active_order");
}



  // Restore last context on refresh (order status, order type, table)
useEffect(() => {
  try {
    const show = localStorage.getItem("qr_show_status") === "1";
    const last = JSON.parse(localStorage.getItem("qr_last_order") || "null");

    if (show && last) {
      if (last.orderType === "table" && last.table) {
        setOrderType("table");
        setTable(Number(last.table));
      } else if (last.orderType === "online") {
        setOrderType("online");
      }
      setOrderId(last.id || null);
      setOrderStatus(last.status || "pending");
      setShowStatus(true);
      return; // don't override with defaults below
    }

    // No status to show—restore last chosen order type/table for continuity
    const savedType = localStorage.getItem("qr_orderType");
    if (savedType) {
      setOrderType(savedType);
      if (savedType === "table") {
        const savedTable = Number(localStorage.getItem("qr_table"));
        if (savedTable) setTable(savedTable);
      }
    }
  } catch {}
}, []);

// --- restore order status after refresh ---
useEffect(() => {
  try {
    const shouldShow = localStorage.getItem("qr_show_status") === "1";
    const active = JSON.parse(localStorage.getItem("qr_active_order") || "null");
    if (shouldShow && active?.orderId) {
      setOrderId(active.orderId);
      setOrderType(active.orderType || null);
      if (active.orderType === "table" && active.table) {
        setTable(Number(active.table));
      }
      setShowStatus(true);
    } else {
      // restore last chosen type/table for continuity (optional)
      const savedType = localStorage.getItem("qr_orderType");
      const savedTable = localStorage.getItem("qr_table");
      if (savedType) setOrderType(savedType);
      if (savedType === "table" && savedTable) setTable(Number(savedTable));
    }
  } catch {}
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

  if (!orderType)
    return <OrderTypeSelect
  onSelect={(type) => {
    // when selecting type:
setOrderType(type);
localStorage.setItem("qr_orderType", type);
if (type !== "table") localStorage.removeItem("qr_table");

// when selecting table:
setTable(num);
localStorage.setItem("qr_table", String(num));
localStorage.setItem("qr_orderType", "table");

  }}
  lang={lang}
  setLang={setLang}
  t={t}
/>
;

  if (orderType === "table" && !table)
    return (
     <TableSelectModal
  onSelectTable={(num) => {
    setTable(num);
    localStorage.setItem("qr_table", String(num));
    localStorage.setItem("qr_orderType", "table");
  }}
  occupiedTables={occupiedTables}
  onClose={() => setOrderType(null)}
  t={t}
/>

    );

  if (orderType === "online" && !customerInfo)
    return (
      <OnlineOrderForm
        onSubmit={(info) => {
          setCustomerInfo(info);
          setPaymentMethod(info.payment_method);     // keep global in sync
        }}
        submitting={submitting}
        onClose={() => setOrderType(null)}
        t={t}
      />
    );

async function handleSubmitOrder() {
  try {
    // compute totals the way you already do
    const total = calcOrderTotalWithExtras(cart); // or your existing total function

    // --- TABLE SUB-ORDER PATH ---
    if (orderType === "table" && orderId) {
      // append items to existing order, do NOT create a new one
      const res = await fetch(`${API_URL}/api/orders/sub-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          items: cart,                 // your cart line items payload
          total,                       // backend will recalc/verify anyway
          payment_method: "Table",     // or what you use for table orders
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Failed to append sub-order");
      }

      // success: keep SAME orderId, clear cart, show status
      setCart([]);
      setShowStatus(true);
      setOrderStatus("success");

      // persist active order + status
      localStorage.setItem(
        "qr_active_order",
        JSON.stringify({ orderId, orderType, table })
      );
      localStorage.setItem("qr_show_status", "1");

      // (optional) refetch order details for status screen if you show merged items
      // await fetchOrder(orderId);

      return;
    }

    // --- INITIAL ORDER CREATION (TABLE OR ONLINE) ---
    // If ONLINE: ensure-customer block (your existing code) runs only for online
    let customerId = null;
    if (orderType === "online" && customerInfo?.phone) {
      // ... your existing ensure-customer logic here ...
    }

    // create order
    const orderRes = await fetch(`${API_URL}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: orderType,                 // "table" or "online"
        table_number: orderType === "table" ? table : null,
        customer_id: customerId,
        items: cart,
        total,
        // include other fields you already send
      }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      throw new Error(err || "Order create failed");
    }

    const order = await orderRes.json();
    setOrderId(order.id);
    setOrderStatus("success");
    setShowStatus(true);

    // persist active order + status for refresh
    localStorage.setItem(
      "qr_active_order",
      JSON.stringify({ orderId: order.id, orderType, table: orderType === "table" ? table : null })
    );
    localStorage.setItem("qr_show_status", "1");

    // clear cart for a clean state (status screen shows from server)
    setCart([]);

  } catch (e) {
    console.error(e);
    setOrderStatus("fail");
    setShowStatus(true);
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
        onClose={() => { setOrderType(null); }}
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
        orderType={orderType}
        onSubmitOrder={handleSubmitOrder}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        submitting={submitting}
        t={t}
      />

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
        t={t}
      />

      <OrderStatusModal
        open={showStatus}
        status={orderStatus}
        orderId={orderId}
        table={orderType === "table" ? table : null}
        onOrderAnother={handleOrderAnother}
        onClose={handleReset}
        t={t}
      />
    </div>
  );
}
