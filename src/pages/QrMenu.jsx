// src/pages/QrMenu.jsx
// src/pages/QrMenu.jsx
import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import OrderStatusScreen from "../components/OrderStatusScreen";
import ModernTableSelector from "../components/ModernTableSelector";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import secureFetch from "../utils/secureFetch";

const RAW_API = import.meta.env.VITE_API_URL || "";
const API_ROOT = RAW_API.replace(/\/+$/, "");
const API_BASE = API_ROOT.endsWith("/api")
  ? API_ROOT.slice(0, -4)
  : API_ROOT || "";
const API_URL = API_BASE ? `${API_BASE}/api` : "/api";
const apiUrl = (path) =>
  `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
const QR_PREFIX = "qr_";

function computeTenantSuffix() {
  if (typeof window === "undefined") return "";
  try {
    const native = window.localStorage;
    if (!native) return "";
    const storedId = native.getItem("restaurant_id");
    if (storedId && storedId !== "undefined" && storedId !== "null") {
      return `${storedId}_`;
    }

    const params = new URLSearchParams(window.location.search);
    const queryTenant =
      params.get("tenant_id") ||
      params.get("tenant") ||
      params.get("restaurant_id") ||
      params.get("restaurant");

    if (queryTenant && queryTenant !== "undefined" && queryTenant !== "null") {
      // Don't persist query-derived tenant; just scope storage while URL has it
      return `${queryTenant}_`;
    }

    const pathSegments = (window.location.pathname || "")
      .split("/")
      .filter(Boolean);
    const qrIndex = pathSegments.indexOf("qr-menu");
    if (qrIndex !== -1 && pathSegments[qrIndex + 1]) {
      return `${pathSegments[qrIndex + 1]}_`;
    }
  } catch {
    // ignore – fall back to legacy global storage keys
  }
  return "";
}

function resolveQrKey(key) {
  if (!key?.startsWith?.(QR_PREFIX)) return key;
  const suffix = computeTenantSuffix();
  if (!suffix) return key;
  const base = key.slice(QR_PREFIX.length);
  return `${QR_PREFIX}${suffix}${base}`;
}

function getQrKeyVariants(key) {
  if (!key?.startsWith?.(QR_PREFIX)) return [key];
  const scoped = resolveQrKey(key);
  if (scoped === key) return [key];
  return [scoped, key];
}

const storage = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    const native = window.localStorage;
    if (!native) return null;
    if (!key?.startsWith?.(QR_PREFIX)) {
      try {
        return native.getItem(key);
      } catch {
        return null;
      }
    }
    try {
      const variants = getQrKeyVariants(key);
      for (const candidate of variants) {
        const value = native.getItem(candidate);
        if (value !== null && value !== undefined) {
          return value;
        }
      }
    } catch {
      // ignore
    }
    return null;
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    const native = window.localStorage;
    if (!native) return;
    if (!key?.startsWith?.(QR_PREFIX)) {
      try {
        native.setItem(key, value);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const variants = getQrKeyVariants(key);
      const [primary, ...rest] = variants;
      native.setItem(primary, value);
      for (const legacy of rest) {
        if (legacy !== primary) {
          native.removeItem(legacy);
        }
      }
    } catch {
      // ignore
    }
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    const native = window.localStorage;
    if (!native) return;
    if (!key?.startsWith?.(QR_PREFIX)) {
      try {
        native.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    try {
      const variants = getQrKeyVariants(key);
      const seen = new Set();
      for (const candidate of variants) {
        if (!candidate || seen.has(candidate)) continue;
        seen.add(candidate);
        native.removeItem(candidate);
      }
    } catch {
      // ignore
    }
  },
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
};

// --- TABLE PERSISTENCE HELPERS ---
const TABLE_KEY = "qr_selected_table";

function normalizeToken(raw) {
  return String(raw || "")
    .replace(/^["']|["']$/g, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function getStoredToken() {
  try {
    const direct = storage.getItem("token");
    let candidate = null;

    if (direct && direct !== "null" && direct !== "undefined") {
      candidate = direct;
    } else {
      const stored = storage.getItem("beyproUser");
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      candidate =
        parsed?.token ||
        parsed?.accessToken ||
        parsed?.user?.token ||
        parsed?.user?.accessToken ||
        null;
    }

    const clean = normalizeToken(candidate);
    return clean || null;
  } catch {
    return null;
  }
}


function saveSelectedTable(tableNo) {
  if (tableNo !== undefined && tableNo !== null && `${tableNo}`.trim() !== "") {
    storage.setItem(TABLE_KEY, String(tableNo));
  }
}


function getPlatform() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return "ios";
  return "other";
}

function getSavedTable() {
  const v = storage.getItem(TABLE_KEY);
  return v && v !== "null" ? v : "";
}

function clearSavedTable() {
  // call this only when order is COMPLETED/CLOSED – NOT when user backs out
  storage.removeItem(TABLE_KEY);
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
    "Please select a payment method before continuing.": "Please select a payment method before continuing.",
    // ✅ Added translations
    "Share QR Menu": "Share QR Menu",
    "Save QR Menu to Phone": "Save QR Menu to Phone",
    "Tap here to install the menu as an app": "Tap here to install the menu as an app",
    "Add to Home Screen": "Add to Home Screen",
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
    "Please select a payment method before continuing.": "Lütfen devam etmeden önce bir ödeme yöntemi seçin.",
    // ✅ Added translations
    "Share QR Menu": "QR Menüyü Paylaş",
    "Save QR Menu to Phone": "QR Menüyü Telefona Kaydet",
    "Tap here to install the menu as an app": "Menüyü uygulama olarak yüklemek için buraya dokunun",
    "Add to Home Screen": "Ana Ekrana Ekle",
  },
  de: {
    "Share QR Menu": "QR-Menü teilen",
    "Save QR Menu to Phone": "QR-Menü auf dem Handy speichern",
    "Tap here to install the menu as an app": "Tippen Sie hier, um das Menü als App zu installieren",
    "Add to Home Screen": "Zum Startbildschirm hinzufügen",
  },
  fr: {
    "Share QR Menu": "Partager le menu QR",
    "Save QR Menu to Phone": "Enregistrer le menu QR sur le téléphone",
    "Tap here to install the menu as an app": "Appuyez ici pour installer le menu comme une application",
    "Add to Home Screen": "Ajouter à l'écran d'accueil",
  },
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
function QrHeader({ orderType, table, onClose, t, restaurantName }) {
  return (
    <header className="w-full sticky top-0 z-50 flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 shadow-sm">
      <span className="text-3xl font-serif font-bold text-gray-900 tracking-tight">
        {restaurantName || "Restaurant"}
      </span>
      <span className="text-lg font-medium text-gray-700 italic">
        {orderType === "table"
          ? table
            ? `${t("Table")} ${table}`
            : t("Table Order (short)")
          : t("Online Order")}
      </span>
      <button
        onClick={onClose}
        aria-label={t("Close")}
        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-600 transition-all"
      >
        ×
      </button>
    </header>
  );
}

/* ====================== PREMIUM APPLE-STYLE HOME PAGE ====================== */
function OrderTypeSelect({
  identifier,       // 🔥 required for backend load
  onSelect,
  lang,
  setLang,
  t,
  onInstallClick,
  canInstall,
  showHelp,
  setShowHelp,
  platform,
}) {

  /* ============================================================
     1) Load Custom QR Menu Website Settings from Backend
     ============================================================ */
  const [custom, setCustom] = React.useState(null);

  React.useEffect(() => {
    if (!identifier) return;

async function load() {
  try {
    const res = await fetch(
  `${API_URL}/public/qr-menu-customization/${encodeURIComponent(identifier)}`
);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const raw = await res.text();
    const data = raw ? JSON.parse(raw) : {};
    setCustom(data.customization || {});
  } catch (err) {
    console.error("❌ Failed to load QR customization:", err);
    setCustom({}); // allow component to render with defaults
  }
}


    load();
  }, [identifier]);

  // Keep hooks order stable; render with placeholders until loaded

  /* ============================================================
     2) Extract dynamic fields with fallbacks
     ============================================================ */
  const c = custom || {};
  const restaurantName = c.title || c.main_title || "Restaurant";
  const subtitle = c.subtitle || "Welcome";
  const tagline = c.tagline || "Fresh • Crafted • Delicious";
  const phoneNumber = c.phone || "";
  const accent = c.branding_color || c.primary_color || "#4F46E5";
  const logoUrl = c.logo || "/logo192.png";


  const storyTitle = c.story_title || "Our Story";
  const storyText = c.story_text || "";
  const storyImage = c.story_image || "";

  const reviews = Array.isArray(c.reviews) ? c.reviews : [];

  const slides =
    Array.isArray(c.hero_slides) && c.hero_slides.length > 0
      ? c.hero_slides.map(s => ({
          title: s.title,
          subtitle: s.subtitle,
          src: s.image,
        }))
      : [
          {
            title: "Gourmet Smash Burgers",
            subtitle: "Crispy edges, soft brioche, secret sauce.",
            src: "https://images.unsplash.com/photo-1606755962773-d324e0deedb1",
          },
        ];

  const deliveryTime = c.delivery_time || "25–35 min";
  const pickupTime = c.pickup_time || "10 min";

  const isOpen = true; // dynamic opening hours next step

  /* ============================================================
     3) Local slider state
     ============================================================ */
  const [currentSlide, setCurrentSlide] = React.useState(0);

  React.useEffect(() => {
    if (slides.length > 1) {
      const timer = setInterval(
        () => setCurrentSlide((s) => (s + 1) % slides.length),
        4500
      );
      return () => clearInterval(timer);
    }
  }, [slides.length]);

  /* SWIPE */
  const touchStartXRef = React.useRef(null);
  function handleTouchStart(e) {
    touchStartXRef.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e) {
    const startX = touchStartXRef.current;
    if (startX == null) return;

    const endX = e.changedTouches[0].clientX;
    const delta = endX - startX;
    const threshold = 40;

    if (delta > threshold) {
      setCurrentSlide((s) => (s - 1 + slides.length) % slides.length);
    } else if (delta < -threshold) {
      setCurrentSlide((s) => (s + 1) % slides.length);
    }

    touchStartXRef.current = null;
  }

  /* PARALLAX */
  const [scrollY, setScrollY] = React.useState(0);
  React.useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  /* Smooth scroll */
  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ============================================================
     4) Render the UI (same structure, now dynamic)
     ============================================================ */

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-[#f5f5f7] via-white to-[#f3f4f6] text-gray-900 relative overflow-x-hidden">

      {/* === HERO BACKGROUND === */}
      <div
        className="absolute inset-x-0 top-0 h-[340px] sm:h-[380px] -z-10 transition-all duration-700"
        style={{
          backgroundImage: `url(${slides[currentSlide].src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          transform: `translateY(${scrollY * 0.15}px)`,
          filter: "brightness(0.75)",
        }}
      />

      <div className="absolute inset-x-0 top-0 h-[340px] sm:h-[380px] -z-10 bg-gradient-to-b from-white/10 via-white/40 to-[#f5f5f7]" />

      {/* === TOP BAR === */}
      <header className="max-w-6xl mx-auto px-4 pt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img
            src={logoUrl}
            alt="Logo"
            className="w-9 h-9 rounded-2xl shadow-sm bg-white object-cover"
          />
          <span className="text-sm font-semibold tracking-tight text-gray-800">
            {restaurantName}
          </span>
        </div>

        {/* Tiny dot navigation */}
        <nav className="hidden sm:flex items-center gap-4 text-xs font-medium text-gray-500">
          <button onClick={() => scrollToId("order-section")} className="flex items-center gap-1 hover:text-gray-900 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />
            <span>Order</span>
          </button>
          <button onClick={() => scrollToId("story-section")} className="flex items-center gap-1 hover:text-gray-900 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span>Story</span>
          </button>
          <button onClick={() => scrollToId("reviews-section")} className="flex items-center gap-1 hover:text-gray-900 transition">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            <span>Reviews</span>
          </button>
        </nav>
      </header>

      {/* === MAIN HERO SECTION === */}
      <section id="order-section" className="max-w-6xl mx-auto px-4 pt-6 pb-10 flex flex-col lg:flex-row items-center gap-8">

        {/* LEFT */}
        <div className="flex-1 max-w-xl">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-white/70 shadow-sm text-xs font-medium text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {isOpen ? "Open now • Order anytime" : "Closed • See you soon"}
          </p>

          <h1 className="mt-4 text-3xl sm:text-4xl md:text-5xl font-serif font-bold leading-tight tracking-tight text-gray-900">
            {restaurantName}
          </h1>

          <p className="mt-2 text-lg font-light text-gray-600">{subtitle}</p>

          <p className="mt-3 text-sm sm:text-base text-gray-600">{tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
              ⏱️ Delivery: {deliveryTime}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-100">
              🛍️ Pickup: {pickupTime}
            </span>
          </div>

          {/* ORDER BUTTONS */}
          <div className="mt-6 space-y-3">
            <button
              onClick={() => onSelect("table")}
              className="w-full py-4 rounded-2xl bg-white shadow-md border border-gray-200 hover:shadow-lg transition text-base font-semibold text-gray-800"
            >
              🍽️ {t("Table Order")}
            </button>

            <button
              onClick={() => onSelect("takeaway")}
              className="w-full py-4 rounded-2xl bg-white shadow-md border border-gray-200 hover:shadow-lg transition text-base font-semibold text-gray-800"
            >
              🥡 {t("Take Away")}
            </button>

            <button
              onClick={() => onSelect("online")}
              className="w-full py-4 rounded-2xl bg-white shadow-md border border-gray-200 hover:shadow-lg transition text-base font-semibold text-gray-800"
            >
              🛵 {t("Delivery")}
            </button>
          </div>

          {/* CALL + SHARE */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            {phoneNumber && (
              <a
                href={`tel:${phoneNumber}`}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-semibold shadow-md"
                style={{ backgroundColor: accent }}
              >
                📞 Call the restaurant
              </a>
            )}

            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: restaurantName,
                    text: "Check out our menu!",
                    url: window.location.href,
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied.");
                }
              }}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/80 border border-gray-200 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-white transition"
            >
              🔗 {t("Share QR Menu")}
            </button>
          </div>
        </div>

        {/* RIGHT PREVIEW PHONE */}
        <div className="flex-1 flex justify-center">
          <div
            className="relative w-[260px] h-[520px] sm:w-[280px] sm:h-[540px] rounded-[2.5rem] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] border border-gray-200 overflow-hidden"
            style={{ transform: `translateY(${scrollY * 0.08}px)` }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-900/90 rounded-full opacity-80" />

            <div className="mt-8 w-full h-[60%] overflow-hidden">
              <img
                src={slides[currentSlide].src}
                alt={slides[currentSlide].title}
                className="w-full h-full object-cover transition-transform duration-700 ease-out"
              />
            </div>

            <div className="px-4 pt-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">
                Featured
              </p>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">
                {slides[currentSlide].title}
              </h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                {slides[currentSlide].subtitle}
              </p>
            </div>

            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-1.5">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`transition-all ${
                    i === currentSlide
                      ? "w-5 h-1.5 bg-gray-900 rounded-full"
                      : "w-1.5 h-1.5 bg-gray-300 rounded-full"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* === STORY SECTION === */}
      <section id="story-section" className="max-w-5xl mx-auto px-4 pt-4 pb-10 flex flex-col md:flex-row items-start gap-8">

        <div className="flex-1">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-3">
            {storyTitle}
          </h2>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed whitespace-pre-line">
            {storyText}
          </p>
        </div>

        {storyImage && (
          <div className="flex-1 flex justify-center">
            <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-lg border border-gray-200 bg-white">
              <img
                src={storyImage}
                alt={storyTitle}
                className="w-full h-40 object-cover"
              />
            </div>
          </div>
        )}
      </section>

      {/* === REVIEWS === */}
      <section id="reviews-section" className="max-w-5xl mx-auto px-4 pt-2 pb-16">
        <h2 className="text-2xl font-serif font-bold text-gray-900 mb-4">
          What our guests say
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reviews.length === 0 && (
            <p className="text-gray-500 text-sm">No reviews yet.</p>
          )}

          {reviews.map((r, idx) => (
            <div key={idx} className="rounded-2xl bg-white shadow-sm border border-gray-200 p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700">
                  {(r.name || "?")[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {r.name}
                  </p>
                  <p className="text-xs text-amber-500">★★★★★</p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                {r.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* === SOCIAL LINKS === */}
      <div className="flex items-center justify-center gap-6 pb-6">

        {c.social_instagram && (
          <a
            href={c.social_instagram}
            target="_blank"
            rel="noreferrer"
            className="w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center"
          >
            <span className="text-lg">📸</span>
          </a>
        )}

        {c.social_tiktok && (
          <a
            href={c.social_tiktok}
            target="_blank"
            rel="noreferrer"
            className="w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center"
          >
            <span className="text-lg">🎵</span>
          </a>
        )}
      </div>

      {/* Mini cart unchanged */}
      <div className="fixed bottom-6 right-6 bg-white shadow-xl px-4 py-2.5 rounded-full border border-gray-200 flex items-center gap-2 text-xs font-medium text-gray-800">
        🛒 Cart
        <span className="bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
          0
        </span>
      </div>
    </div>
  );
}





/* ====================== TAKEAWAY ORDER FORM ====================== */
function TakeawayOrderForm({ submitting, t, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: "", phone: "", pickup_time: "", notes: "" });
  const [touched, setTouched] = useState({});

  const valid = form.name && /^(5\d{9}|[578]\d{7})$/.test(form.phone)
 && form.pickup_time;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8 w-full max-w-md relative">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
        >
          ×
        </button>

        {/* Title */}
        <h2 className="text-2xl font-serif font-semibold text-neutral-900 mb-6 border-b border-neutral-200 pb-2">
          {t("Take Away Information")}
        </h2>

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setTouched({ name: true, phone: true, pickup_time: true });
              return;
            }
            onSubmit(form);
          }}
          className="flex flex-col gap-4"
        >
          {/* Name */}
          <input
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400"
            placeholder={t("Full Name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

       {/* Phone */}
<input
  className={`rounded-xl border px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400 ${
    touched.phone && !/^(5\d{9}|[578]\d{7})$/.test(form.phone)
      ? "border-red-500"
      : "border-neutral-300"
  }`}
  placeholder={t("Phone (🇹🇷 5XXXXXXXXX or 🇲🇺 7/8XXXXXXX)")}
  value={form.phone}
  onChange={(e) => {
    const clean = e.target.value.replace(/[^\d]/g, ""); // allow only digits
    // Decide max length based on first digit
    let maxLen = 10;
    if (/^[78]/.test(clean)) maxLen = 8; // Mauritius landline/mobile
    const trimmed = clean.slice(0, maxLen);
    setForm((f) => ({ ...f, phone: trimmed }));
  }}
  inputMode="numeric"
  maxLength={10}
/>


          {/* Pickup Time */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t("Pickup Time")}
            </label>
            <input
              type="time"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 focus:ring-1 focus:ring-neutral-400"
              value={form.pickup_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, pickup_time: e.target.value }))
              }
            />
          </div>

          {/* Notes */}
          <textarea
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400 resize-none h-24"
            placeholder={t("Notes (optional)")}
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
          />

      {/* Submit */}
<button
  type="submit"
  disabled={submitting}
  className="w-full py-3 rounded-full bg-neutral-900 text-white font-medium text-lg hover:bg-neutral-800 transition disabled:opacity-50"
>
  {submitting ? t("Please wait...") : t("Continue")}
</button>

{/* Skip button */}
<button
  type="button"
  onClick={() => {
    onSubmit(null);    // << SKIP
  }}
className="w-full py-3 rounded-full bg-yellow-100 text-yellow-800 
           font-medium text-lg hover:bg-yellow-200 transition mt-2"


>
  Skip
</button>

        </form>
      </div>
    </div>
  );
}

/* ====================== ONLINE ORDER FORM (Luxury Fine Dining Style) ====================== */
function OnlineOrderForm({ submitting, t, onClose, onSubmit, appendIdentifier }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", payment_method: "" });
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



/* ====================== PREFILL SAVED DELIVERY INFO ====================== */
useEffect(() => {
  try {
    const saved = JSON.parse(storage.getItem("qr_delivery_info") || "null");
    if (saved && typeof saved === "object") {
      setForm((f) => ({
        ...f,
        name: saved.name || f.name,
        phone: saved.phone || f.phone,
        address: saved.address || f.address,
      }));
    }
  } catch {}
}, [appendIdentifier]);

/* ====================== LOAD SAVED CARD ====================== */
useEffect(() => {
  const phoneOk = /^(5\d{9}|[578]\d{7})$/.test(form.phone)
;
  if (!phoneOk) {
    setSavedCard(null);
    setUseSaved(false);
    return;
  }

  try {
    const store = JSON.parse(storage.getItem("qr_saved_cards") || "{}");
    const arr = Array.isArray(store[form.phone]) ? store[form.phone] : [];
    setSavedCard(arr[0] || null);
    setUseSaved(!!arr[0]);
  } catch {
    setSavedCard(null);
    setUseSaved(false);
  }
}, [form.phone]);

/* ====================== SAVE DELIVERY INFO ====================== */
async function saveDelivery() {
  const name = form.name.trim();
  const phone = form.phone.trim();
  const address = form.address.trim();

  if (!name || !/^5\d{9}$/.test(phone) || !address) return;

  setSaving(true);
  try {
    // 1️⃣ Save locally
    storage.setItem("qr_delivery_info", JSON.stringify({ name, phone, address }));

    // 2️⃣ Sync with backend
    try {
      // Fetch existing customer by phone
      let customer = await secureFetch(appendIdentifier(`/customers?phone=${phone}`), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      // If not found, create new
      if (!customer || !customer.id) {
        customer = await secureFetch(appendIdentifier("/customers"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone }),
        });
      }

      // Handle addresses
      if (customer && (customer.id || customer.customer_id)) {
        const cid = customer.id ?? customer.customer_id;
        const addrs = Array.isArray(customer.addresses) ? customer.addresses : [];

        const existing = addrs.find((a) => (a.address || "").trim() === address);
        if (existing) {
          if (!existing.is_default) {
            await secureFetch(appendIdentifier(`/customer-addresses/${existing.id}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_default: true }),
            });
          }
        } else {
          await secureFetch(appendIdentifier(`/customers/${cid}/addresses`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: "Default", address, is_default: true }),
          });
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

/* ====================== PREFILL FROM BACKEND ====================== */
useEffect(() => {
  const phoneOk = /^(5\d{9}|[578]\d{7})$/.test(form.phone)
;
  if (!phoneOk) return;

  (async () => {
    try {
      const match = await secureFetch(appendIdentifier(`/customers?phone=${form.phone}`), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!match) return;

      if (match.name && !form.name) {
        setForm((f) => ({ ...f, name: match.name }));
      }

      const addrs = Array.isArray(match.addresses) ? match.addresses : [];
      const def = addrs.find((a) => a.is_default) || addrs[0];
      if (def && !form.address) {
        setForm((f) => ({ ...f, address: def.address }));
      }
    } catch {}
  })();
}, [form.phone]);

/* ====================== VALIDATION ====================== */
const validBase =
  form.name && /^(5\d{9}|[578]\d{7})$/.test(form.phone)
 && form.address && !!form.payment_method;

const validCard =
  form.payment_method !== "card" ||
  (useSaved && !!savedCard) ||
  (cardName.trim().length >= 2 &&
    luhnValid(cardNumber) &&
    expiryValid(cardExpiry) &&
    ((detectBrand(cardNumber) === "Amex")
      ? /^[0-9]{4}$/.test(cardCvc)
      : /^[0-9]{3}$/.test(cardCvc)));

const validate = () => validBase && validCard;

/* ====================== SAVE CARD META ====================== */
function persistCardIfRequested(meta) {
  if (!saveCard) return;
  try {
    const store = JSON.parse(storage.getItem("qr_saved_cards") || "{}");
    const list = Array.isArray(store[form.phone]) ? store[form.phone] : [];
    if (!list.some((c) => c.token === meta.token || c.last4 === meta.last4)) list.unshift(meta);
    store[form.phone] = list.slice(0, 3);
    storage.setItem("qr_saved_cards", JSON.stringify(store));
  } catch {}
}

/* ====================== CARD DISPLAY FLAG ====================== */
const showNewCard = !savedCard || !useSaved;


  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8 w-full max-w-md text-left relative">
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
        >
          ×
        </button>

        {/* Title */}
        <h2 className="text-2xl font-serif font-semibold text-neutral-900 mb-6 border-b border-neutral-200 pb-2">
          {t("Delivery Information")}
        </h2>

        {/* Form */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!validate()) {
              setTouched({ name: true, phone: true, address: true, payment_method: true, card: true });
              return;
            }
            try {
              // Optional: persist details locally for next time
              await saveDelivery();
            } catch {}
            // Hand off to parent so it can continue order flow
            onSubmit({ ...form });
          }}
          className="flex flex-col gap-4"
        >
          {/* Name */}
          <input
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder={t("Full Name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          {/* Phone */}
        <input
  className={`rounded-xl border px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
    touched.phone && !/^(5\d{9}|[578]\d{7})$/.test(form.phone)
      ? "border-red-500"
      : "border-neutral-300"
  }`}
  placeholder={t("Phone (🇹🇷 5XXXXXXXXX or 🇲🇺 7/8XXXXXXX)")}
  value={form.phone}
  onChange={(e) => {
    // Keep digits only, drop leading 0 (e.g., 05XXXXXXXXX → 5XXXXXXXXX), then cap at 10
    const onlyDigits = e.target.value.replace(/[^\d]/g, "");
    const normalized = onlyDigits.startsWith("0") ? onlyDigits.slice(1) : onlyDigits;
    setForm((f) => ({ ...f, phone: normalized.slice(0, 10) }));
  }}
  inputMode="numeric"
/>


          {/* Address */}
          <textarea
            className="rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            placeholder={t("Address")}
            rows={3}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />

          {/* Payment Method */}
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
          </div>

          {/* Card Section */}
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
                      onChange={(e) => setCardCvc(e.target.value.replace(/\\D/g, "").slice(0, 4))}
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

          {/* Save Info */}
          <button
            type="button"
            onClick={saveDelivery}
            disabled={
              saving ||
              !form.name ||
              !/^(5\\d{9}|[578]\\d{7})$/.test(form.phone) ||
              !form.address
            }
            className="w-full py-2 rounded-xl border border-neutral-300 bg-white text-neutral-800 font-medium hover:bg-neutral-100 transition disabled:opacity-50"
          >
            {saving ? t("Saving...") : savedOnce ? `✓ ${t("Saved")}` : t("Save for next time")}
          </button>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full bg-neutral-900 text-white font-medium text-lg hover:bg-neutral-800 transition disabled:opacity-50"
          >
            {submitting ? t("Please wait...") : t("Continue")}
          </button>
        </form>
      </div>
    </div>
  );
}


/* ====================== SMART CATEGORY BAR (auto-center on click + arrows) ====================== */
import { ChevronLeft, ChevronRight } from "lucide-react";


function CategoryBar({ categories, activeCategory, setActiveCategory, categoryImages }) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const scrollRef = React.useRef(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  const scrollByAmount = (amount) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
    }
  };

  const scrollToCategory = (index) => {
    const el = scrollRef.current;
    if (!el) return;
    const button = el.children[index];
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();

    const offset =
      buttonRect.left -
      containerRect.left -
      containerRect.width / 2 +
      buttonRect.width / 2;

    el.scrollBy({ left: offset, behavior: "smooth" });
  };

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white/90 border-t border-neutral-200 z-[100] backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.05)]">
      <div className="relative w-full">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scrollByAmount(-250)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scrollByAmount(250)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {/* Scrollable Categories */}
        <div
          ref={scrollRef}
          className="flex gap-3 px-12 py-3 overflow-x-auto scrollbar-none scroll-smooth"
        >
          {categoryList.map((cat, idx) => {
            const key = cat?.toLowerCase?.();
            const imgSrc = categoryImages?.[key];
            const active = activeCategory === cat;

            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  scrollToCategory(idx); // ⬅️ auto-center when clicked
                }}
                className={`group flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
                  ${
                    active
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
                  }`}
              >
                {imgSrc ? (
                  <div className="relative w-6 h-6 rounded-full overflow-hidden border border-neutral-300">
                    <img
                      src={
                        /^https?:\/\//.test(imgSrc)
                          ? imgSrc
                          : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
                      }
                      alt={cat}
                      className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
                )}
                <span className="tracking-wide">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}



/* ====================== PRODUCT GRID (Luxury Fine Dining Style) ====================== */
function ProductGrid({ products, onProductClick, t }) {
  const productList = Array.isArray(products) ? products : [];

  return (
    <main className="w-full max-w-7xl mx-auto pt-6 pb-32 px-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {productList.length === 0 && (
        <div className="col-span-full text-center text-neutral-400 font-medium text-lg py-12 italic">
          {t("No products available.")}
        </div>
      )}

      {productList.map((product) => (
        <div
          key={product.id}
          onClick={() => onProductClick(product)}
          className="group relative bg-white/90 border border-neutral-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 cursor-pointer"
        >
          <div className="aspect-square w-full overflow-hidden bg-neutral-50">
            <img
              src={
                product.image
                  ? /^https?:\/\//.test(product.image)
                    ? product.image
                    : `${API_URL}/uploads/${product.image}`
                  : "https://via.placeholder.com/400x400?text=No+Image"
              }
              alt={product.name}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          </div>

          <div className="p-4 flex flex-col items-center text-center space-y-1">
            <h3 className="text-base font-medium text-neutral-800 tracking-wide group-hover:text-black transition-colors line-clamp-2">
              {product.name}
            </h3>
            <p className="text-[15px] font-semibold text-neutral-600 group-hover:text-neutral-800 transition-colors">
              ₺{parseFloat(product.price).toFixed(2)}
            </p>
          </div>

          {/* Subtle highlight border */}
          <span className="absolute inset-0 rounded-3xl ring-0 ring-neutral-400/0 group-hover:ring-1 group-hover:ring-neutral-300 transition-all duration-300"></span>
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

  // Normalize groups: keep both id + name
  const normalizedGroups = toArray(extrasGroups).map((g) => ({
    id: g.id,
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

  // Get allowed groups by product.selectedExtrasGroup (IDs)
  const productGroupIds = toArray(product?.selectedExtrasGroup)
    .map(Number)
    .filter((n) => Number.isFinite(n));

 let availableGroups = [];
 if (productGroupIds.length > 0) {
   availableGroups = toArray(normalizedGroups).filter((g) =>
     productGroupIds.includes(Number(g.id))
   );
 }

 // ✅ Fallback: if no group IDs matched, but product.extras exists
 if (availableGroups.length === 0 &&
     Array.isArray(product?.extras) &&
     product.extras.length > 0) {
   availableGroups = [
     {
       id: "manual",
       groupName: "Extras",
       items: product.extras.map((ex, idx) => ({
         id: idx,
         name: ex.name,
         price: Number(ex.extraPrice || ex.price || 0),
         unit: ex.unit || "",
         amount:
           ex.amount !== undefined && ex.amount !== null && ex.amount !== ""
             ? Number(ex.amount)
             : 1,
       })),
     },
   ];
 }

  const priceOf = (exOrItem) =>
    parseFloat(exOrItem?.price ?? exOrItem?.extraPrice ?? 0) || 0;

  const extrasPerUnit = selectedExtras.reduce(
    (sum, ex) => sum + priceOf(ex) * (ex.quantity || 1),
    0
  );
  const lineTotal = (basePrice + extrasPerUnit) * quantity;

  const qtyOf = (groupName, itemName) =>
    selectedExtras.find(
      (ex) => ex.group === groupName && ex.name === itemName
    )?.quantity || 0;

const incExtra = (group, item) => {
  setSelectedExtras((prev) => {
    const existing = prev.find(
      (ex) => ex.group === group.groupName && ex.name === item.name
    );
    if (existing) {
      // ✅ only increment once
      return prev.map((ex) =>
        ex.group === group.groupName && ex.name === item.name
          ? { ...ex, quantity: (ex.quantity || 0) + 1 }
          : ex
      );
    } else {
      // ✅ add new extra cleanly
      return [
        ...prev,
        {
          group: group.groupName,
          name: item.name,
          price: priceOf(item),
          quantity: 1,
        },
      ];
    }
  });
};


const decExtra = (group, item) => {
  setSelectedExtras((prev) =>
    prev
      .map((ex) =>
        ex.group === group.groupName && ex.name === item.name
          ? { ...ex, quantity: Math.max(0, (ex.quantity || 0) - 1) }
          : ex
      )
      .filter((ex) => ex.quantity > 0) // 🧹 auto-remove zeroes
  );
};


  const handleBackdrop = (e) => {
    if (e.target.dataset.backdrop === "true") onClose?.();
  };

return createPortal(
  <div
    data-backdrop="true"
    onMouseDown={handleBackdrop}
    className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
  >
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:w-[720px] md:w-[860px] bg-white/95 sm:rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] flex flex-col overflow-hidden"
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label={t('Close')}
        className="absolute right-4 top-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
      >
        ×
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-neutral-200 bg-white/80 backdrop-blur-sm">
        <img
          src={
            product.image
              ? /^https?:\/\//.test(product.image)
                ? product.image
                : `${API_URL}/uploads/${product.image}`
              : 'https://via.placeholder.com/120?text=No+Image'
          }
          alt={product.name}
          className="w-16 h-16 object-cover rounded-xl border border-neutral-300 shadow-sm"
        />
        <div className="flex flex-col">
          <div className="text-xl font-medium text-neutral-900 tracking-tight">
            {product.name}
          </div>
          <div className="text-lg font-semibold text-neutral-600">
            ₺{basePrice.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
        {/* Groups rail */}
        <aside className="sm:w-48 border-b sm:border-b-0 sm:border-r border-neutral-200 bg-neutral-50/60 p-3 overflow-x-auto sm:overflow-y-auto">
          <div className="text-[11px] font-semibold text-neutral-500 mb-3 px-1 uppercase tracking-wide">
            {t('Extras')}
          </div>
          <div className="flex sm:block gap-2 sm:gap-0">
            {availableGroups.map((g, idx) => (
              <button
                key={g.id}
                onClick={() => setActiveGroupIdx(idx)}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-2 border transition-all ${
                  activeGroupIdx === idx
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                    : 'bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {g.groupName}
              </button>
            ))}
          </div>
        </aside>

        {/* Items + Quantity + Note */}
        <section className="flex-1 p-5 overflow-y-auto bg-white/80">
          {availableGroups.length > 0 ? (
            <>
              <div className="font-medium text-neutral-800 mb-3 text-base tracking-tight">
                {availableGroups[activeGroupIdx].groupName}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(availableGroups[activeGroupIdx].items || []).map((item) => {
                  const unit = priceOf(item);
                  const q =
                    selectedExtras.find(
                      (ex) =>
                        ex.group ===
                          availableGroups[activeGroupIdx].groupName &&
                        ex.name === item.name
                    )?.quantity || 0;
                  return (
                    <div
                      key={item.id ?? item.name}
                      className="flex flex-col items-center bg-white border border-neutral-200 rounded-xl px-3 py-3 min-h-[96px] shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="text-center text-sm font-medium text-neutral-800 leading-tight line-clamp-2">
                        {item.name}
                      </div>
                      <div className="text-xs text-neutral-500 font-medium mt-0.5">
                        ₺{unit.toFixed(2)}
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            decExtra(
                              availableGroups[activeGroupIdx],
                              item
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-700 text-lg hover:bg-neutral-200"
                        >
                          –
                        </button>
                        <span className="min-w-[28px] text-center text-base font-semibold text-neutral-800">
                          {q}
                        </span>
                        <button
                          onClick={() =>
                            incExtra(
                              availableGroups[activeGroupIdx],
                              item
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-700 text-lg hover:bg-neutral-200"
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
            <div className="text-neutral-400 italic">
              {t('Select a group')}
            </div>
          )}

          {/* Quantity */}
          <div className="mt-6">
            <div className="text-sm font-medium text-neutral-700 mb-2">
              {t('Quantity')}
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-full bg-neutral-100 text-neutral-700 text-2xl hover:bg-neutral-200"
              >
                –
              </button>
              <span className="w-12 text-center text-2xl font-semibold text-neutral-900">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-11 h-11 rounded-full bg-neutral-100 text-neutral-700 text-2xl hover:bg-neutral-200"
              >
                +
              </button>
            </div>
          </div>

          {/* Note */}
          <div className="mt-5">
            <textarea
              className="w-full rounded-xl border border-neutral-300 p-3 text-sm text-neutral-700 placeholder-neutral-400 bg-white/70 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder={t('Add a note (optional)…')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-neutral-200 px-6 py-4 flex items-center justify-between bg-white/90 backdrop-blur-sm">
        <div className="text-lg font-medium text-neutral-900">
          {t('Total')}: <span className="font-semibold">₺{lineTotal.toFixed(2)}</span>
        </div>
        <button
          onClick={() => {
            const unique_id = `${product.id}-${Date.now().toString(36)}-${Math.random()
              .toString(36)
              .slice(2, 8)}`;
            const extrasList = Array.isArray(selectedExtras)
              ? selectedExtras
              : [];
            onAddToCart({
              id: product.id,
              name: product.name,
              image: product.image,
              price: basePrice,
              quantity,
              extras: extrasList.filter((e) => e.quantity > 0),
              note,
              unique_id,
            });
          }}
          className="py-2.5 px-6 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-all"
        >
          {t('Add to Cart')}
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

  const cartArray = toArray(cart);
  const cartLength = cartArray.length;
  const prevItems = cartArray.filter((i) => i.locked);
  const newItems  = cartArray.filter((i) => !i.locked);

  const lineTotal = (item) => {
    const base = parseFloat(item.price) || 0;
    const extrasTotal = (item.extras || []).reduce(
      (sum, ex) => sum + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return (base + extrasTotal) * (item.quantity || 1);
  };

  const total = newItems.reduce((sum, item) => sum + lineTotal(item), 0);

  // 👂 close by global event
  useEffect(() => {
    const handler = () => setShow(false);
    window.addEventListener("qr:cart-close", handler);
    return () => window.removeEventListener("qr:cart-close", handler);
  }, []);

  // 🚪 auto-open only if allowed
  useEffect(() => {
    const auto = storage.getItem("qr_cart_auto_open") !== "0";
    if (auto) setShow(cartLength > 0);
  }, [cartLength]);

  function removeItem(idx, isNew) {
    if (!isNew) return; // don't remove locked (read-only)
    setCart((prev) => {
      let n = -1;
      return toArray(prev).filter((it) => (it.locked ? true : (++n !== idx)));
    });
  }

return (
  <>
    {/* Floating cart button */}
    {!show && cartLength > 0 && (
      <button
        onClick={() => {
          storage.setItem("qr_cart_auto_open", "1");
          setShow(true);
        }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-neutral-900 text-white font-medium tracking-wide py-3 px-8 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:scale-105 transition-all z-50"
      >
        🛒 {t("View Cart")} ({cartLength})
      </button>
    )}

    {/* Cart Drawer */}
    {show && (
      <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-md bg-white/95 rounded-t-3xl md:rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-6 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center mb-5 border-b border-neutral-200 pb-2">
            <span className="text-lg font-serif font-semibold text-neutral-900 tracking-tight">
              {t("Your Order")}
            </span>
            <button
              className="text-2xl text-neutral-400 hover:text-red-600 transition"
              onClick={() => setShow(false)}
              aria-label={t("Close")}
            >
              ×
            </button>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto max-h-[48vh] pr-1">
            {cartLength === 0 ? (
              <div className="text-neutral-400 text-center py-10 italic">
                {t("Cart is empty.")}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Locked (previously ordered) items */}
                {prevItems.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">
                      {t("Previously ordered")}
                    </div>
                    <ul className="space-y-3">
                      {prevItems.map((item, i) => (
                        <li
                          key={`prev-${i}`}
                          className="flex justify-between gap-3 border-b border-neutral-200 pb-2 opacity-70"
                        >
                          <div className="flex-1">
                            <span className="font-medium text-neutral-900 block">
                              {item.name}{" "}
                              <span className="text-xs text-neutral-500">
                                ×{item.quantity}
                              </span>
                            </span>
                            {item.extras?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.extras.map((ex, j) => {
                                  const unit =
                                    parseFloat(ex.price ?? ex.extraPrice ?? 0) ||
                                    0;
                                  const line = unit * (ex.quantity || 1);
                                  return (
                                    <span
                                      key={j}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                    >
                                      {ex.name} ×{ex.quantity || 1} ₺
                                      {line.toFixed(2)}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {item.note && (
                              <div className="text-xs text-amber-700 mt-1 italic">
                                📝 {t("Note")}: {item.note}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium text-neutral-700">
                              ₺{lineTotal(item).toFixed(2)}
                            </div>
                            <div className="text-[10px] text-neutral-400 mt-1">
                              {t("Locked")}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* New items */}
                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-2">
                    {t("New items")}
                  </div>
                  {newItems.length === 0 ? (
                    <div className="text-neutral-400 text-sm italic">
                      {t("No new items yet.")}
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {newItems.map((item, i) => (
                        <li
                          key={`new-${i}`}
                          className="flex justify-between gap-3 border-b border-neutral-200 pb-2"
                        >
                          <div className="flex-1">
                            <span className="font-medium text-neutral-900 block">
                              {item.name}{" "}
                              <span className="text-xs text-neutral-500">
                                ×{item.quantity}
                              </span>
                            </span>
                            {item.extras?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {item.extras.map((ex, j) => {
                                  const unit =
                                    parseFloat(ex.price ?? ex.extraPrice ?? 0) ||
                                    0;
                                  const line = unit * (ex.quantity || 1);
                                  return (
                                    <span
                                      key={j}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                    >
                                      {ex.name} ×{ex.quantity || 1} ₺
                                      {line.toFixed(2)}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {item.note && (
                              <div className="text-xs text-amber-700 mt-1 italic">
                                📝 {t("Note")}: {item.note}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-medium text-neutral-700">
                              ₺{lineTotal(item).toFixed(2)}
                            </div>
                            <button
                              onClick={() => removeItem(i, true)}
                              className="text-xs text-red-400 hover:text-red-600 mt-1 transition"
                            >
                              {t("Remove")}
                            </button>
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
          {cartLength > 0 && (
            <div className="mt-6 border-t border-neutral-200 pt-4 space-y-4">
              {/* Total */}
              <div className="flex justify-between items-center text-base">
                <span className="font-medium text-neutral-700">
                  {t("Total")}:
                </span>
                <span className="text-lg font-semibold text-neutral-900">
                  ₺{total.toFixed(2)}
                </span>
              </div>

              {/* Payment */}
              <div className="flex flex-col gap-2">
                <label className="font-medium text-neutral-800">
                  {t("Payment")}
                </label>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2 bg-white text-sm focus:ring-1 focus:ring-neutral-400"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {orderType === "table" ? (
                    <>
                      <option value="online">
                        🌐 {t("Pay Online Now")}
                      </option>
                      <option value="card">💳 {t("Card at Table")}</option>
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

              {/* Submit */}
              <button
                onClick={onSubmitOrder}
                disabled={submitting || newItems.length === 0}
                className="w-full py-3 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 transition-all"
              >
                {submitting ? t("Please wait...") : t("Submit Order")}
              </button>

              {/* Order Another */}
              <button
                onClick={() => setShow(false)}
                className="w-full py-3 rounded-full border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 transition-all"
              >
                {t("Order Another")}
              </button>

              {/* Clear new */}
              <button
                onClick={() => {
                  const lockedOnly = cartArray.filter((i) => i.locked);
                  setCart(lockedOnly);
                  storage.setItem("qr_cart", JSON.stringify(lockedOnly));
                }}
                className="w-full mt-2 py-2 rounded-md text-xs text-neutral-500 bg-neutral-100 hover:bg-neutral-200 transition"
              >
                {t("Clear New Items")}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
  </>
);

}

async function startOnlinePaymentSession(id) {
  try {
    const res = await secureFetch('/payments/start' , {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: id, method: "online" }),
    });

    if (!res.ok) {
      console.error("startOnlinePaymentSession failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json().catch(() => ({}));
    if (data.pay_url) {
      storage.setItem("qr_payment_url", data.pay_url);
      return data.pay_url;
    }
  } catch (e) {
    console.error("startOnlinePaymentSession failed:", e);
  }
  return null;
}



/* ====================== ORDER STATUS MODAL ====================== */
function OrderStatusModal({ open, status, orderId, orderType, table, onOrderAnother, onClose, onFinished, t, appendIdentifier }) {
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
  table={orderType === "table" ? table : null}   // now safe
   onOrderAnother={onOrderAnother}   
  onFinished={onFinished}

  t={t}
  buildUrl={(path) => apiUrl(path)}
  appendIdentifier={appendIdentifier}
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






/* ====================== MAIN QR MENU ====================== */
export default function QrMenu() {
  
// Keep both because QrMenu uses id somewhere else (token)
// Keep both slug and id because the route is /qr-menu/:slug/:id
const { slug, id } = useParams();

// Fix null/undefined slug
const safeSlug =
  slug && slug !== "null" && slug !== "undefined"
    ? slug
    : id && id !== "null" && id !== "undefined"
    ? id
    : null;

// Only use slug as identifier for backend requests
const restaurantIdentifier = safeSlug;


  const appendIdentifier = useCallback(
    (url) => {
      if (!restaurantIdentifier
) return url;
      const [base, hash] = String(url).split("#");
      const separator = base.includes("?") ? "&" : "?";
      const appended = `${base}${separator}identifier=${encodeURIComponent(restaurantIdentifier
)}`;
      return hash ? `${appended}#${hash}` : appended;
    },
    [restaurantIdentifier
]
  );

  // 🔒 One liner to always pass identifier via secureFetch
  const sFetch = useCallback((path, options) => {
    return secureFetch(appendIdentifier(path), options);
  }, [appendIdentifier]);

const shareUrl = useMemo(() => {
  const origin = window.location.origin;
  const s = slug && slug !== "null" && slug !== "undefined" ? slug : null;

  if (!s) return `${origin}/qr-menu`;

  return `${origin}/qr-menu/${s}/scan`;
}, [slug]);



  // persist language
  const [lang, setLang] = useState(() => storage.getItem("qr_lang") || "en");
  useEffect(() => { storage.setItem("qr_lang", lang); }, [lang]);
  const t = useMemo(() => makeT(lang), [lang]);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [platform, setPlatform] = useState(getPlatform());
  const [brandName, setBrandName] = useState("");

  const [table, setTable] = useState(null);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const parsed = JSON.parse(storage.getItem("qr_cart") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Load public customization to extract the brand title for header
  useEffect(() => {
    if (!restaurantIdentifier) return;
    (async () => {
      try {
        const res = await secureFetch(`/public/qr-menu-customization/${encodeURIComponent(restaurantIdentifier)}`);
        const c = res?.customization || {};
        setBrandName(c.title || c.main_title || "");
      } catch (err) {
        // ignore, fallback handled in QrHeader
      }
    })();
  }, [restaurantIdentifier]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [occupiedTables, setOccupiedTables] = useState([]);
  const [showStatus, setShowStatus] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);
  const [tables, setTables] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [categoryImages, setCategoryImages] = useState({});
  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(
  () => storage.getItem("qr_payment_method") || "online"
);
  const [orderType, setOrderType] = useState(
  () => storage.getItem("qr_orderType") || null
);
  const [showTakeawayForm, setShowTakeawayForm] = useState(false);

  const safeProducts = useMemo(() => toArray(products), [products]);
  const safeCategories = useMemo(() => toArray(categories), [categories]);
  const safeExtrasGroups = useMemo(() => toArray(extrasGroups), [extrasGroups]);
  const safeCart = useMemo(() => toArray(cart), [cart]);
  const safeOccupiedTables = useMemo(() => toArray(occupiedTables), [occupiedTables]);
  const productsInActiveCategory = useMemo(
    () =>
      safeProducts.filter(
        (p) =>
          (p?.category || "").trim().toLowerCase() ===
          (activeCategory || "").trim().toLowerCase()
      ),
    [safeProducts, activeCategory]
  );

  // 🥡 Take Away fields
const [takeaway, setTakeaway] = useState({
  name: "",
  pickup_time: "",
  notes: "",
});
const restaurantSlug =
  localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";
// at the top of QrMenu component
const [showQrPrompt, setShowQrPrompt] = useState(() => {
  return !storage.getItem("qr_saved");
});
// === PWA INSTALL HANDLER ===
const [deferredPrompt, setDeferredPrompt] = useState(null);
const [canInstall, setCanInstall] = useState(false);
  const resetToTypePicker = () => {
    setShowStatus(false);
    setOrderStatus("pending");
    setOrderId(null);
    setCart([]);
    setCustomerInfo(null);
    setTable(null);
    setOrderType(null);
  };
const [showOrderStatus, setShowOrderStatus] = useState(false);
const loadTables = async () => {
  if (!restaurantIdentifier) {
    setTables([]);
    return;
  }

  try {
    const res = await fetch(
      `${API_URL}/public/tables/${encodeURIComponent(restaurantIdentifier)}`
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    const rows = Array.isArray(payload) ? payload : payload.data || [];

    const normalized = rows.map((r) => ({
      tableNumber: r.number,
      area: r.area || "Main Hall",
      seats: r.seats || r.chairs || 0,
      label: r.label || "",
      color: r.color || "",
      active: r.active ?? true,
    }));

    setTables(normalized.filter((t) => t.active !== false));
  } catch (err) {
    console.warn("⚠️ Failed to fetch tables:", err);
    setTables([]);
  }
};



useEffect(() => {
  const handler = (e) => {
    e.preventDefault();
    setDeferredPrompt(e);
    setCanInstall(true);
  };
  window.addEventListener("beforeinstallprompt", handler);
  return () => window.removeEventListener("beforeinstallprompt", handler);
}, [appendIdentifier]);

function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choice) => {
    if (choice.outcome === "accepted") {
      console.log("✅ User installed app");
    }
    setDeferredPrompt(null);
    setCanInstall(false);
  });
}

function handleDownloadQr() {
  
// fallback: open QR Menu page so user can add it manually
window.location.href = shareUrl;


  // Remember that user saved it
  storage.setItem("qr_saved", "1");
  setShowQrPrompt(false);
}

// When switching order type, choose a sensible default
useEffect(() => {
  if (orderType === "table" && !["online","card","sodexo","multinet","cash"].includes(paymentMethod)) {
    setPaymentMethod("card");
  }
  if (orderType === "online" && !["online","card","cash"].includes(paymentMethod)) {
    setPaymentMethod("online");
  }
}, [orderType]);

useEffect(() => {
  storage.setItem("qr_payment_method", paymentMethod);
}, [paymentMethod]);


// === Always-mounted Order Status (portal) ===
const statusPortal = showStatus
  ? createPortal(
      <OrderStatusModal
        open={true}
        status={orderStatus}
        orderId={orderId}
        orderType={orderType} 
        table={orderType === "table" ? table : null}
        onOrderAnother={handleOrderAnother}
        onClose={handleReset}
        onFinished={resetToTypePicker}
        t={t}
        appendIdentifier={appendIdentifier}
      />,
      document.body
    )
  : null;
  // show Delivery Info form first, every time Delivery is chosen
// show Delivery Info form only when starting a brand-new online order
const [showDeliveryForm, setShowDeliveryForm] = useState(false);
useEffect(() => {
  const hasActive = !!(orderId || storage.getItem("qr_active_order_id"));
  if (orderType === "online" && !hasActive) {
    setShowDeliveryForm(true);
  }
}, [orderType, orderId]);






// -- clear saved table ONLY when no items in cart and no active order
function resetTableIfEmptyCart() {
  const count = safeCart.length;
  const hasActive = !!(orderId || storage.getItem("qr_active_order_id"));
  if (count === 0 && !hasActive) {
    try {
      storage.removeItem("qr_table");
      storage.removeItem("qr_selected_table");
      storage.removeItem("qr_orderType");
    } catch {}
    // let any listeners react instantly (if you add one later)
    window.dispatchEvent(new Event("qr:table-reset"));
  }
}


// when user taps the header “×”
// ✅ Updated handleCloseOrderPage
async function handleCloseOrderPage() {
  const activeId = orderId || Number(storage.getItem("qr_active_order_id")) || null;
  const cartIsEmpty = !Array.isArray(cart) || cart.length === 0;

  // 🧩 1. If an active order exists, verify its status before showing “Order Sent”
  if (activeId) {
    try {
      const token = getStoredToken();
      if (token) {
        const res = await secureFetch(appendIdentifier(`/orders/${activeId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = typeof res.json === "function" ? await res.json() : res;
        const status = (data?.status || "").toLowerCase();

        // ✅ Only show “Order Sent” if not closed/completed/canceled
        if (!["closed", "completed", "canceled"].includes(status)) {
          setShowStatus(true);
          setOrderStatus("success");
          return;
        }
      }
    } catch (err) {
      console.warn("⚠️ handleCloseOrderPage check failed:", err);
    }
  }

  // 🧩 2. If no active order or it's closed → reset everything
  if (cartIsEmpty) {
    setShowStatus(false);
    setOrderStatus("pending");
    resetTableIfEmptyCart();
    setTable(null);
    setOrderType(null);
    return;
  }

  // 🧩 3. Still items in cart → stay in current screen
  resetTableIfEmptyCart();
}



// Bootstrap on refresh: restore by saved order id, else by saved table
// Bootstrap on refresh: restore by saved order id, else by saved table
useEffect(() => {
  (async () => {
    try {
      const activeId = storage.getItem("qr_active_order_id");

      // helper: true if ALL items are delivered
     // helper: true if ALL items are delivered
async function allItemsDelivered(id) {
  try {
    const token = getStoredToken();
    if (!token) return false;
    const ir = await secureFetch(`/orders/${id}/items`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ir.ok) return false;

    const raw = await ir.json();
    const arr = Array.isArray(raw) ? raw : [];

    // ✅ Empty or missing items → treat as not delivered
    if (!arr || arr.length === 0) return false;

    // ✅ Only mark delivered when all have final kitchen statuses
    return arr.every((it) => {
      const ks = (it.kitchen_status || "").toLowerCase();
      return ["delivered", "served", "ready"].includes(ks);
    });
  } catch {
    return false;
  }
}


// --- Resolve token from either URL or local storage ---
const urlToken =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;

const storedToken = getStoredToken();
const token = urlToken || storedToken;

// 1️⃣ If we have a saved active order id, prefer that
let order = null;
if (token && activeId) {
  try {
    const res = await secureFetch(appendIdentifier(`/orders/${activeId}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res && res.ok !== false) {
      const data = typeof res.json === "function" ? await res.json() : res;
      order = data;
    }
  } catch (err) {
    console.warn("⚠️ Failed to restore active order:", err);
  }
}


if (order) {
  const status = (order?.status || "").toLowerCase();
  const paid =
    status === "paid" ||
    order.payment_status === "paid" ||
    order.payment_state === "paid";

  // ✅ Only reset when POS explicitly closes it
  if (["closed", "completed", "canceled"].includes(status)) {
    resetToTypePicker();
    return;
  }

  // 🚫 Do NOT reset just because it’s paid or delivered
  // Keep showing until table is actually closed
  setOrderStatus("success");
  setShowStatus(true);

  const type = order.order_type === "table" ? "table" : "online";
  setOrderType(type);
  setTable(type === "table" ? Number(order.table_number) || null : null);
  setOrderId(order.id);

  return;
}


      // 2️⃣ Fallback: see if a saved table has an open (non-closed) order
      const savedTable =
        Number(
          storage.getItem("qr_table") ||
            storage.getItem("qr_selected_table") ||
            "0"
        ) || null;
if (savedTable) {
  const token = getStoredToken();
  if (token) {
    try {
      const q = await secureFetch(`/orders?table_number=${savedTable}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await q.json();
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : [];

      const openOrder = list.find(
        (o) => !["closed", "completed", "canceled"].includes((o?.status || "").toLowerCase())
      );

      if (openOrder) {
        const status = (openOrder?.status || "").toLowerCase();
        const paid =
          status === "paid" ||
          openOrder.payment_status === "paid" ||
          openOrder.payment_state === "paid";

        // 🚫 DO NOT close for paid orders
        if (["closed", "completed", "canceled"].includes(status)) {
          resetToTypePicker();
          return;
        }

        // 🚫 DO NOT reset for delivered-only orders
        // Only auto-reset for online (delivery) orders that are fully done
        const allDelivered = await allItemsDelivered(openOrder.id);
        if (openOrder.order_type === "online" && allDelivered && !paid) {
          resetToTypePicker();
          return;
        }

        // ✅ Keep showing OrderStatusScreen until table is closed
        setOrderType("table");
        setTable(savedTable);
        setOrderId(openOrder.id);
        setOrderStatus("success");
        setShowStatus(true);

        storage.setItem("qr_active_order_id", String(openOrder.id));
        storage.setItem("qr_orderType", "table");
        storage.setItem("qr_show_status", "1");
        return;
      }
    } catch (err) {
      console.warn("⚠️ Failed to restore table order:", err);
    }
  }
}


      // 3️⃣ Nothing to restore
      setOrderType(null);
      setTable(null);
      setShowStatus(false);
    } catch (err) {
      console.error("❌ QRMenu restore failed:", err);
      setOrderType(null);
      setTable(null);
      setShowStatus(false);
    }
  })();
}, [appendIdentifier]);



  // QrMenu.jsx
useEffect(() => {
  if (!restaurantIdentifier) {
    setCategoryImages({});
    return;
  }

  (async () => {
    try {
      const res = await fetch(
        `${API_URL}/public/category-images/${encodeURIComponent(restaurantIdentifier)}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const dict = {};
      (Array.isArray(data) ? data : []).forEach(({ category, image }) => {
        const key = (category || "").trim().toLowerCase();
        if (!key || !image) return;
        dict[key] = image;
      });
      setCategoryImages(dict);
    } catch (err) {
      console.warn("⚠️ Failed to fetch public category images:", err);
      setCategoryImages({});
    }
  })();
}, [restaurantIdentifier]);




  useEffect(() => {
    const storedCart = safeCart;
    storage.setItem("qr_cart", JSON.stringify(storedCart));
  }, [safeCart]);

useEffect(() => {
  let cancelled = false;

  const parseArray = (raw) =>
    Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

  const tryJSON = (value) => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // ✅ UPDATED BLOCK
// ✅ Corrected public product loader
const loadProducts = async () => {
  const assignProducts = (payload) => {
    const list = parseArray(payload);
    setProducts(list);
    const cats = [...new Set(list.map((p) => p.category))].filter(Boolean);
    setCategories(cats);
    setActiveCategory(cats[0] || "");
  };

  try {
    let payload = null;

    if (restaurantIdentifier
) {
      // 👇 Always use the public endpoint; no auth required
const res = await fetch(
  `${API_URL}/public/products/${encodeURIComponent(restaurantIdentifier)}`
);
if (!res.ok) throw new Error(`Server responded ${res.status}`);
payload = await res.json();

    }

    assignProducts(payload);
  } catch (err) {
    console.warn("⚠️ Failed to fetch products:", err);
    setProducts([]);
    setCategories([]);
    setActiveCategory("");
  }
};



  // ✅ END UPDATED BLOCK

  const loadExtras = async () => {
  if (!restaurantIdentifier) {
    setExtrasGroups([]);
    return;
  }

  try {
    const res = await fetch(
      `${API_URL}/public/extras-groups/${encodeURIComponent(restaurantIdentifier)}`
    );

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const list = await res.json();
    if (cancelled) return;

    const listArray = toArray(list);
    setExtrasGroups(
      listArray.map((g) => ({
        groupName: g.groupName || g.group_name,
        items: typeof g.items === "string" ? tryJSON(g.items) : g.items || [],
      }))
    );
  } catch (err) {
    console.warn("⚠️ Failed to fetch extras groups:", err);
    if (cancelled) return;
    setExtrasGroups([]);
  }
};


  loadProducts();
  loadExtras();
  loadTables(); 
  const token = getStoredToken();
  if (token) {
    sFetch("/orders", { headers: { Authorization: `Bearer ${token}` } })
      .then((orders) => {
        if (cancelled) return;
        const list = parseArray(orders);
        const occupied = toArray(list)
          .filter((order) => order?.table_number && order.status !== "closed")
          .map((order) => Number(order.table_number));
        setOccupiedTables(occupied);
      })
      .catch((err) => {
        console.warn("⚠️ Failed to fetch orders:", err);
        if (!cancelled) setOccupiedTables([]);
      });
  } else {
    setOccupiedTables([]);
  }

  return () => {
    cancelled = true;
  };
}, [appendIdentifier]);





// --- Order type select (show modal here too if needed) ---
if (!orderType)
  return (
    <>
<OrderTypeSelect
   identifier={restaurantIdentifier}   // REQUIRED 🔥🔥🔥
onSelect={(type) => {
  setOrderType(type);

  if (type === "online") {
    setShowDeliveryForm(true);
  }
  if (type === "takeaway") {
    setShowTakeawayForm(true);
  }
}}
   lang={lang}
   setLang={setLang}
   t={t}
   onInstallClick={handleInstallClick}   
   canInstall={canInstall}
   showHelp={showHelp}
   setShowHelp={setShowHelp}
   platform={platform}
/>




      {statusPortal}
    </>
  );

// --- Table select (let THIS device re-open its own occupied table) ---
if (orderType === "table" && !table) {
function safeNumber(v) {
  if (!v) return null;
  if (v === "null" || v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const myTable =
  safeNumber(storage.getItem("qr_table")) ??
  safeNumber(storage.getItem("qr_selected_table")) ??
  null;


  const filteredOccupied = myTable
    ? safeOccupiedTables.filter((n) => n !== myTable)
    : safeOccupiedTables;

  return (
    <>
<ModernTableSelector
  tables={tables}
  onSelect={(tbl) => {
    setTable(tbl.tableNumber);
    saveSelectedTable(tbl.tableNumber);
  }}
  onBack={() => {
    setOrderType(null);
  }}
/>



      {statusPortal}
    </>
  );
}


// ---- Rehydrate cart from current order (generate NEW unique_id for each line) ----
// ---- Rehydrate cart from current order, but mark them as locked (read-only) ----
async function rehydrateCartFromOrder(orderId) {
  try {
    const token = getStoredToken();
    if (!token) {
      console.info("ℹ️ Skipping cart rehydrate (no auth token)");
      return;
    }
const res = await secureFetch(appendIdentifier(`/orders/${orderId}/items`), {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

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
    storage.setItem("qr_cart_auto_open", "0");
    window.dispatchEvent(new Event("qr:cart-close"));

    // resolve existing order
    let id = orderId || Number(storage.getItem("qr_active_order_id")) || null;
    let type = orderType || storage.getItem("qr_orderType") || (table ? "table" : null);

    // If table known but no id, fetch open order for that table
    if (!id && (type === "table" || table)) {
      const tNo = table || Number(storage.getItem("qr_table")) || null;
      if (tNo) {
        const token = getStoredToken();
        if (token) {
          try {
            const q = await secureFetch(`/orders?table_number=${tNo}` , {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (q.ok) {
              const list = await q.json();
              const arr = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []);
              const open = arr.find(o => (o?.status || "").toLowerCase() !== "closed") || null;
              if (open) {
                id = open.id;
                type = "table";
                setOrderId(id);
                setOrderType("table");
              }
            }
          } catch (err) {
            console.warn("⚠️ Failed to fetch open table order:", err);
          }
        }
      }
    }

    // ONLINE branch: rehydrate previous (locked) items too
    if (type === "online" && id) {
      await rehydrateCartFromOrder(id); // sets locked: true items
      setOrderType("online");
      storage.setItem("qr_active_order_id", String(id));
      storage.setItem("qr_orderType", "online");
      storage.setItem("qr_show_status", "0");
      setShowDeliveryForm(false); // don’t ask details again
      return;
    }

    // TABLE branch (unchanged)
    if (type === "table" && id) {
      await rehydrateCartFromOrder(id); // sets locked: true items
      storage.setItem("qr_active_order_id", String(id));
      storage.setItem("qr_orderType", "table");
      if (table) storage.setItem("qr_table", String(table));
      storage.setItem("qr_show_status", "0");
      return;
    }

    // nothing to restore → clean cart
    setCart([]);
    storage.setItem("qr_cart", "[]");
    storage.setItem("qr_show_status", "0");
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
  try {
    const json = await secureFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return json; // secureFetch already returns parsed JSON or throws
  } catch (err) {
    throw new Error(err.message || "Request failed");
  }
}

function buildOrderPayload({ orderType, table, items, total, customer, takeaway, paymentMethod }) {
  const itemsPayload = (items || []).map(i => ({
    product_id: i.id,
    quantity: i.quantity,
    price: parseFloat(i.price) || 0,
    ingredients: i.ingredients ?? [],
    extras: i.extras ?? [],
    unique_id: i.unique_id,
    note: i.note || null,
    confirmed: true,
    kitchen_status: "new",
    payment_method: null,
    receipt_id: null,
  }));

  const isTakeaway = orderType === "takeaway";
  const isOnline = orderType === "online";
  const isTable = orderType === "table";

  return {
    table_number: isTable ? Number(table) : null,
    order_type: isOnline ? "packet" : isTakeaway ? "takeaway" : "table",
    total: Number(total) || 0,
    items: itemsPayload,

    // ✅ Safely handle missing objects
    customer_name: isTakeaway
      ? takeaway?.name || null
      : customer?.name || null,
    customer_phone: isTakeaway
      ? takeaway?.phone || null
      : customer?.phone || null,
    customer_address: isOnline
      ? customer?.address || null
      : null,
    pickup_time: isTakeaway
      ? takeaway?.pickup_time || null
      : null,
    notes: isTakeaway
      ? takeaway?.notes || null
      : null,
    payment_method: paymentMethod || null,
  };
}


async function handleSubmitOrder() {
  try {
    setSubmitting(true);
    setLastError(null);

    setOrderStatus("pending");
    setShowStatus(true);

    // Require delivery details only when starting a brand-new ONLINE order
    const hasActiveOnline =
      orderType === "online" &&
      (orderId || storage.getItem("qr_active_order_id"));
    if (orderType === "online" && !hasActiveOnline && !customerInfo) {
      setShowDeliveryForm(true);
      return;
    }

    // 🔒 Require payment method ONLY for delivery orders
    if (orderType === "online" && !paymentMethod) {
      alert(t("Please select a payment method before continuing."));
      setSubmitting(false);
      setOrderStatus("pending");
      setShowStatus(false);
      return;
    }

    const newItems = toArray(cart).filter((i) => !i.locked);
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

await postJSON(appendIdentifier("/orders/order-items"), {
  order_id: orderId,
  receipt_id: null,
  items: itemsPayload,
});


      // Save/patch the chosen payment method on the order (ignore if backend doesn't support)
      try {
     await secureFetch(`/orders/${orderId}/status`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payment_method: paymentMethod }),
});

      } catch {}

      // If user chose Online, create/refresh a checkout session
      if (paymentMethod === "online") {
        await startOnlinePaymentSession(orderId);
        try {
         await secureFetch(`/orders/${orderId}/status` , {
           method: "PUT",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             status: "paid",
             payment_method: "Online",
             total: newItems.reduce(
               (sum, i) =>
                 sum +
                 (parseFloat(i.price) +
                   (i.extras || []).reduce(
                     (s, ex) =>
                     s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
                     0
                   )) *
                   (i.quantity || 1),
               0
             ),
           }),
         });
       } catch (err) {
         console.error("❌ Failed to mark existing online order as paid:", err);
       }
      }

      // clear only NEW items
      setCart((prev) => toArray(prev).filter((i) => i.locked));

      storage.setItem(
        "qr_active_order",
        JSON.stringify({
          orderId,
          orderType,
          table: orderType === "table" ? table : null,
        })
      );
      storage.setItem("qr_active_order_id", String(orderId));
      if (orderType === "table" && table)
        storage.setItem("qr_table", String(table));
      storage.setItem("qr_orderType", orderType);
      storage.setItem("qr_payment_method", paymentMethod);
      storage.setItem("qr_show_status", "1");

      setOrderStatus("success");
      setShowStatus(true);
      return;
    }

    // ---------- CREATE brand-new order ----------
    const total = newItems.reduce((sum, item) => {
      const extrasTotal = (item.extras || []).reduce(
        (s, ex) =>
          s +
          (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) *
            (ex.quantity || 1),
        0
      );
      return (
        sum +
        (parseFloat(item.price) + extrasTotal) * (item.quantity || 1)
      );
    }, 0);

const created = await postJSON(
  appendIdentifier("/orders"),
  buildOrderPayload({
    orderType,
    table,
    items: newItems,
    total,
    customer: orderType === "online" ? customerInfo : null,
    takeaway: orderType === "takeaway" ? takeaway : null,
    paymentMethod,
  })
);


    const newId = created?.id;
    if (!newId) throw new Error("Server did not return order id.");

    // If Online, start a checkout session for this order
    if (paymentMethod === "online") {
      await startOnlinePaymentSession(newId);
          // 🔑 Immediately mark order as Paid Online
     try {
       await secureFetch(`/orders/${newId}/status` , {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           status: "paid",
           payment_method: "Online",
           total,
         }),
       });
       console.log("✅ Order marked Paid Online");
     } catch (err) {
       console.error("❌ Failed to mark online order as paid:", err);
     }
    }

    setOrderId(newId);
    storage.setItem(
      "qr_active_order",
      JSON.stringify({
        orderId: newId,
        orderType,
        table: orderType === "table" ? table : null,
      })
    );
    storage.setItem("qr_active_order_id", String(newId));
    if (orderType === "table" && table)
      storage.setItem("qr_table", String(table));
    storage.setItem("qr_orderType", orderType);
    storage.setItem("qr_payment_method", paymentMethod);
    storage.setItem("qr_show_status", "1");

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
  storage.removeItem("qr_cart");
  storage.setItem("qr_show_status", "0");

  if (orderType === "table") {
    // Stay on same table & keep orderId for sub-orders
    // Do NOT remove qr_active_order
    return;
  }

  // Online flow: clear session
  setOrderId(null);
  setOrderType(null);
  setCustomerInfo(null);
  storage.removeItem("qr_active_order");
}


  

return (
  <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
    <QrHeader
      orderType={orderType}
      table={table}
      onClose={handleCloseOrderPage}
      t={t}
      restaurantName={brandName}
    />

    <div className="container mx-auto px-3 sm:px-4 md:px-6 lg:px-8 w-full">
      <ProductGrid
        products={productsInActiveCategory}
        onProductClick={(product) => {
          setSelectedProduct(product);
          setShowAddModal(true);
        }}
        t={t}
      />
    </div>

{/* ✅ Hide category bar when any modal (status, delivery, or takeaway) is open */}
{!showStatus && !showDeliveryForm && !showTakeawayForm && (
  <CategoryBar
    categories={categories}
    activeCategory={activeCategory}
    setActiveCategory={setActiveCategory}
    categoryImages={categoryImages}
  />
)}





    <CartDrawer
  cart={safeCart}
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
      extrasGroups={safeExtrasGroups}
      onClose={() => setShowAddModal(false)}
      onAddToCart={(item) => {
  storage.setItem("qr_cart_auto_open", "1");
  setCart((prev) => [...prev, item]);   // always append new line
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
    appendIdentifier={appendIdentifier}
    onClose={() => {
  setShowDeliveryForm(false);
  setOrderType(null); // 👈 return to order type picker
}}

    onSubmit={(form) => {
      setCustomerInfo({
        name: form.name,
        phone: form.phone,
        address: form.address,
        payment_method: form.payment_method,
      });
      setShowDeliveryForm(false);
    }}
  />
)}

{orderType === "takeaway" && showTakeawayForm && (
  <TakeawayOrderForm
    submitting={submitting}
    t={t}
    onClose={() => {
  setShowTakeawayForm(false);
  setOrderType(null); // 👈 return to order type picker
}}

onSubmit={(form) => {
  if (!form) {
    // SKIPPED
    setTakeaway({
      name: "",
      phone: "",
      pickup_time: "",
      notes: "",
    });
  } else {
    // Normal form submit
    setTakeaway(form);
  }

  setShowTakeawayForm(false);
}}

  />
)}




  </div>
);

}
