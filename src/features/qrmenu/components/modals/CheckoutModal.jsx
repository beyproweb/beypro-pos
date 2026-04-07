import React, { useEffect, useState } from "react";
import secureFetch from "../../../../utils/secureFetch";
import { getCheckoutPrefill } from "../../header-drawer/services/customerService";
import {
  PHONE_API_REGEX,
  formatPhoneForInput,
  normalizePhoneForApi,
} from "../../../../utils/phone";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = PHONE_API_REGEX;

function detectBrand(num) {
  const n = (num || "").replace(/\s+/g, "");
  if (/^4\d{6,}$/.test(n)) return "Visa";
  if (/^(5[1-5]\d{4,}|2[2-7]\d{4,})$/.test(n)) return "Mastercard";
  if (/^3[47]\d{5,}$/.test(n)) return "Amex";
  return "Card";
}

function luhnValid(num) {
  const n = (num || "").replace(/\D/g, "");
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = +n[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return n.length >= 12 && sum % 10 === 0;
}

function parseExpiry(exp) {
  const s = (exp || "").replace(/[^\d]/g, "").slice(0, 4);
  const mm = s.slice(0, 2);
  const yy = s.slice(2, 4);
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

function formatCardNumber(v) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(v) {
  const s = v.replace(/[^\d]/g, "").slice(0, 4);
  if (s.length <= 2) return s;
  return s.slice(0, 2) + "/" + s.slice(2);
}

function normalizeHexColor(value, fallback) {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "");
  if (!normalized) return null;
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return "#FFFFFF";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? "#0F172A" : "#FFFFFF";
}

const CheckoutModal = React.memo(function CheckoutModal({
  submitting,
  t,
  onClose,
  onSubmit,
  appendIdentifier,
  storage,
  accentColor = "#111827",
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    payment_method: "",
  });
  const [touched, setTouched] = useState({});
  const [useSaved, setUseSaved] = useState(false);
  const [savedCard, setSavedCard] = useState(null);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [saveCard, setSaveCard] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const [shakeModal, setShakeModal] = useState(false);
  const normalizedPhone = normalizePhoneForApi(form.phone);

  useEffect(() => {
    try {
      const saved = getCheckoutPrefill(storage);
      if (saved && typeof saved === "object") {
        setForm((f) => ({
          ...f,
          name: saved.name || f.name,
          phone: saved.phone ? formatPhoneForInput(saved.phone) : f.phone,
          email: saved.email || f.email,
          address: saved.address || f.address,
          payment_method: saved.payment_method || f.payment_method,
        }));
      }
    } catch {}
  }, [appendIdentifier, storage]);

  useEffect(() => {
    const phoneOk = PHONE_REGEX.test(normalizedPhone);
    if (!phoneOk) {
      setSavedCard(null);
      setUseSaved(false);
      return;
    }

    try {
      const store = JSON.parse(storage.getItem("qr_saved_cards") || "{}");
      const arr = Array.isArray(store[normalizedPhone]) ? store[normalizedPhone] : [];
      setSavedCard(arr[0] || null);
      setUseSaved(!!arr[0]);
    } catch {
      setSavedCard(null);
      setUseSaved(false);
    }
  }, [normalizedPhone, storage]);

  async function saveDelivery() {
    const name = form.name.trim();
    const phone = normalizedPhone;
    const email = form.email.trim().toLowerCase();
    const address = form.address.trim();
    const emailValid = !email || EMAIL_REGEX.test(email);

    if (!name || !PHONE_REGEX.test(phone) || !address || !emailValid) return;

    setSaving(true);
    try {
      storage.setItem(
        "qr_delivery_info",
        JSON.stringify({
          name,
          phone,
          email,
          address,
          payment_method: form.payment_method || "",
        })
      );

      try {
        let customer = await secureFetch(
          appendIdentifier(`/public/customers/by-phone/${encodeURIComponent(phone)}`),
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!customer || !customer.id) {
          customer = await secureFetch(appendIdentifier("/public/customers"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, phone, email: email || null, address }),
          });
        } else if (
          name !== customer.name ||
          (email && customer.email !== email) ||
          address !== (customer.address || "")
        ) {
          try {
            customer = await secureFetch(appendIdentifier(`/public/customers/${customer.id}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email: email || null, address }),
            });
          } catch {}
        }

        if (customer && (customer.id || customer.customer_id)) {
          const cid = customer.id ?? customer.customer_id;
          const addrs = Array.isArray(customer.addresses) ? customer.addresses : [];

          const existing = addrs.find((a) => (a.address || "").trim() === address);
          if (existing) {
            if (!existing.is_default) {
              await secureFetch(
                appendIdentifier(`/public/customer-addresses/customer-addresses/${existing.id}`),
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ is_default: true }),
                }
              );
            }
          } else {
            await secureFetch(
              appendIdentifier(`/public/customer-addresses/customers/${cid}/addresses`),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: "Default", address, is_default: true }),
              }
            );
          }
        }
      } catch (err) {
        console.warn("⚠️ Backend sync failed:", err);
      }

      setSavedOnce(true);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const phoneOk = PHONE_REGEX.test(normalizedPhone);
    if (!phoneOk) return;

    (async () => {
      try {
        const match = await secureFetch(
          appendIdentifier(`/public/customers/by-phone/${encodeURIComponent(normalizedPhone)}`),
          {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          }
        );
        if (!match) return;

        if (match.name && !form.name) {
          setForm((f) => ({ ...f, name: match.name }));
        }
        if (match.email && !form.email) {
          setForm((f) => ({ ...f, email: match.email }));
        }

        const addrs = Array.isArray(match.addresses) ? match.addresses : [];
        const def = addrs.find((a) => a.is_default) || addrs[0];
        if (def && !form.address) {
          setForm((f) => ({ ...f, address: def.address }));
        }
      } catch {}
    })();
  }, [appendIdentifier, form.address, form.email, form.name, normalizedPhone]);

  useEffect(() => {
    if (form.payment_method) {
      setPaymentPrompt(false);
    }
  }, [form.payment_method]);

  const emailValid = !form.email.trim() || EMAIL_REGEX.test(form.email.trim());
  const validBase =
    form.name &&
    PHONE_REGEX.test(normalizedPhone) &&
    emailValid &&
    form.address &&
    !!form.payment_method;

  const validCard =
    form.payment_method !== "card" ||
    (useSaved && !!savedCard) ||
    (cardName.trim().length >= 2 &&
      luhnValid(cardNumber) &&
      expiryValid(cardExpiry) &&
      (detectBrand(cardNumber) === "Amex"
        ? /^[0-9]{4}$/.test(cardCvc)
        : /^[0-9]{3}$/.test(cardCvc)));

  const triggerPaymentError = () => {
    setPaymentPrompt(true);
    setShakeModal(true);
    setTimeout(() => setShakeModal(false), 420);
  };

  const validate = () => validBase && validCard;

  function persistCardIfRequested(meta) {
    if (!saveCard) return;
    try {
      const store = JSON.parse(storage.getItem("qr_saved_cards") || "{}");
      const list = Array.isArray(store[normalizedPhone]) ? store[normalizedPhone] : [];
      if (!list.some((c) => c.token === meta.token || c.last4 === meta.last4)) list.unshift(meta);
      store[normalizedPhone] = list.slice(0, 3);
      storage.setItem("qr_saved_cards", JSON.stringify(store));
    } catch {}
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      setTouched({
        name: true,
        phone: true,
        email: true,
        address: true,
        payment_method: true,
        card: true,
      });
      if (!form.payment_method) {
        triggerPaymentError();
      }
      return;
    }
    try {
      await saveDelivery();
    } catch {}
    onSubmit({ ...form, phone: normalizedPhone });
  };

  const showNewCard = !savedCard || !useSaved;

  return (
    <div className="fixed inset-0 z-[160] flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-6">
      <div
        className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-5 sm:p-8 pb-[calc(1.25rem+env(safe-area-inset-bottom))] w-full max-w-md text-left relative max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        style={shakeModal ? { animation: "checkoutShake 420ms ease-in-out" } : undefined}
      >
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
        >
          ×
        </button>

        <h2 className="text-2xl font-serif font-semibold text-neutral-900 mb-6 border-b border-neutral-200 pb-2">
          {t("Delivery Information")}
        </h2>

        <form
          onSubmit={handleFormSubmit}
          className="flex flex-col gap-4"
        >
          <input
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder={t("Full Name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          <input
            className={`rounded-xl border px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
              touched.phone && !PHONE_REGEX.test(normalizedPhone)
                ? "border-red-500"
                : "border-neutral-300"
            }`}
            placeholder={t("Phone (905555555555)")}
            value={form.phone}
            onChange={(e) => {
              setForm((f) => ({ ...f, phone: formatPhoneForInput(e.target.value) }));
            }}
            inputMode="tel"
          />

          <input
            type="email"
            className={`rounded-xl border px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
              touched.email && form.email && !EMAIL_REGEX.test(form.email.trim())
                ? "border-red-500"
                : "border-neutral-300"
            }`}
            placeholder={t("Email")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            autoComplete="email"
          />

          <textarea
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder={t("Address")}
            rows={3}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-800">{t("Payment Method")}</label>
            <select
              className={`rounded-xl border px-4 py-3 text-neutral-800 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
                touched.payment_method && !form.payment_method ? "border-red-500" : "border-neutral-300"
              }`}
              value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            >
              <option value="">{t("Select Payment Method")}</option>
              <option value="cash">{t("Cash")}</option>
              <option value="card">{t("Credit Card")}</option>
              <option value="online">{t("Online Payment")}</option>
            </select>
            {paymentPrompt && !form.payment_method && (
              <p className="text-xs font-semibold text-rose-600">
                {t("Please select a payment method before continuing.")}
              </p>
            )}
          </div>

          {form.payment_method === "card" && (
            <div className="mt-1 p-4 rounded-2xl border border-neutral-200 bg-neutral-50">
              {savedCard && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-neutral-600 mb-1">
                    {t("Saved Card")}:
                  </div>
                  <div className="text-sm text-neutral-700">
                    {savedCard.brand} •••• {savedCard.last4} ({savedCard.expMonth}/
                    {String(savedCard.expYear).slice(-2)})
                  </div>
                  <div className="mt-2 flex gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={useSaved} onChange={() => setUseSaved(true)} />
                      {t("Use Saved")}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={!useSaved} onChange={() => setUseSaved(false)} />
                      {t("Use New")}
                    </label>
                  </div>
                </div>
              )}

              {showNewCard && (
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <input
                    className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400"
                    placeholder={t("Name on Card")}
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    autoComplete="cc-name"
                  />
                  <input
                    className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400"
                    placeholder={t("Card Number")}
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    inputMode="numeric"
                    autoComplete="cc-number"
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400"
                      placeholder={t("Expiry (MM/YY)")}
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                    />
                    <input
                      className="w-24 rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400"
                      placeholder={t("CVC")}
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-neutral-600">
                    <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />
                    {t("Save card for next time")}
                  </label>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={saveDelivery}
            disabled={
              saving ||
              !form.name ||
              !PHONE_REGEX.test(normalizedPhone) ||
              !emailValid ||
              !form.address
            }
            className="w-full py-2 rounded-xl border border-neutral-300 bg-white text-neutral-800 font-medium hover:bg-neutral-100 transition disabled:opacity-50"
          >
            {saving ? t("Saving...") : savedOnce ? `✓ ${t("Saved")}` : t("Save for next time")}
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full font-medium text-lg transition disabled:opacity-50"
            style={{
              backgroundColor: resolvedAccentColor,
              color: accentTextColor,
            }}
          >
            {submitting ? t("Please wait...") : t("Continue")}
          </button>
        </form>
      </div>
      <style>{`
        @keyframes checkoutShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
});

export default CheckoutModal;
