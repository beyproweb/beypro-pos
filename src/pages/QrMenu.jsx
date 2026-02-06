// src/pages/QrMenu.jsx
// src/pages/QrMenu.jsx
import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from "react";
import OrderStatusScreen, { useSocketIO as useOrderSocket } from "../components/OrderStatusScreen";
import ModernTableSelector from "../components/ModernTableSelector";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { UtensilsCrossed, Soup, Bike, Phone, Share2, Search, Download } from "lucide-react";
import { Instagram, Music2, Globe } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { io } from "socket.io-client";

const RAW_API = import.meta.env.VITE_API_URL || "";
const API_ROOT = RAW_API.replace(/\/+$/, "");
const API_BASE = API_ROOT.endsWith("/api")
  ? API_ROOT.slice(0, -4)
  : API_ROOT || "";
const API_URL = API_BASE ? `${API_BASE}/api` : "/api";
const apiUrl = (path) =>
  `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
const QR_PREFIX = "qr_";
const QR_TOKEN_KEY = "qr_token";
const BEYPRO_APP_STORE_URL = import.meta.env.VITE_BEYPRO_APPSTORE_URL || "";
const BEYPRO_PLAY_STORE_URL = import.meta.env.VITE_BEYPRO_PLAYSTORE_URL || "";

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

function boolish(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  const s = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(s)) return false;
  if (["true", "1", "yes", "on"].includes(s)) return true;
  return defaultValue;
}

function parseRestaurantIdFromIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  // patterns: "hurrybey:1", "tenant_1", "1"
  const colon = raw.split(":");
  const last = colon[colon.length - 1];
  const match = String(last).match(/(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
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
    const direct = storage.getItem(QR_TOKEN_KEY);
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

// Read QR mode from current URL: "table" | "delivery" | null
function getQrModeFromLocation() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const m = (params.get("mode") || "").toLowerCase();
    if (m === "table" || m === "delivery") return m;
    return null;
  } catch {
    return null;
  }
}

// Read table number from current URL (for table QR links)
function getTableFromLocation() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("table");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function extractTableNumberFromQrText(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const tableParam = url.searchParams.get("table");
    if (tableParam) {
      const n = Number(tableParam);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    // not a URL
  }
  const match = text.match(/(?:table|masa)\s*#?\s*(\d+)/i);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const fallback = Number(text);
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return null;
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
    // Missing keys added for QR menu flow
    "Pre Order": "Pre Order",
    "Pre Order Information": "Pre Order Information",
    "Pickup / Delivery Date": "Pickup / Delivery Date",
    "Pickup / Delivery": "Pickup / Delivery",
    Pickup: "Pickup",
    "Call Us": "Call Us",
    Share: "Share",
    "Phone (🇹🇷 5XXXXXXXXX or 🇲🇺 7/8XXXXXXX)": "Phone (🇹🇷 5XXXXXXXXX or 🇲🇺 7/8XXXXXXX)",
    "Pickup Time": "Pickup Time",
    "Notes (optional)": "Notes (optional)",
    "Delivery Information": "Delivery Information",
    "Payment Method": "Payment Method",
    "Saved Card": "Saved Card",
    "Use Saved": "Use Saved",
    "Use New": "Use New",
    "Saving...": "Saving...",
    Saved: "Saved",
    "Save for next time": "Save for next time",
    "No products available.": "No products available.",
    "Previously ordered": "Previously ordered",
    Locked: "Locked",
    "New items": "New items",
    "No new items yet.": "No new items yet.",
    Payment: "Payment",
    "Pay Online Now": "Pay Online Now",
    "Card at Table": "Card at Table",
    "Cash at Table": "Cash at Table",
    "Clear New Items": "Clear New Items",
    "Link copied.": "Link copied.",
    // ✅ Added translations
    "Share QR Menu": "Share QR Menu",
    "Save QR Menu to Phone": "Save QR Menu to Phone",
    "Tap here to install the menu as an app": "Tap here to install the menu as an app",
    "Add to Home Screen": "Add to Home Screen",
    "Download Qr": "Download Qr",
    "Scan Table QR": "Scan Table QR",
    "Scan the QR code on your table to continue.": "Scan the QR code on your table to continue.",
    "Invalid table QR code.": "Invalid table QR code.",
    "This QR is for table": "This QR is for table",
    "Please scan table": "Please scan table",
    "Camera permission is required.": "Camera permission is required.",
    Cancel: "Cancel",
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
    // Missing keys added for QR menu flow
    "Pre Order": "Ön Sipariş",
    "Pre Order Information": "Ön Sipariş Bilgileri",
    "Pickup / Delivery Date": "Alış / Teslim Tarihi",
    "Pickup / Delivery": "Alış / Teslim Şekli",
    Pickup: "Gel Al",
    "Call Us": "Bizi Ara",
    Share: "Paylaş",
    "Phone (🇹🇷 5XXXXXXXXX or 🇲🇺 7/8XXXXXXX)": "Telefon (🇹🇷 5XXXXXXXXX veya 🇲🇺 7/8XXXXXXX)",
    "Pickup Time": "Alış Zamanı",
    "Notes (optional)": "Notlar (opsiyonel)",
    "Delivery Information": "Teslimat Bilgileri",
    "Payment Method": "Ödeme Yöntemi",
    "Saved Card": "Kayıtlı Kart",
    "Use Saved": "Kayıtlıyı Kullan",
    "Use New": "Yeni Kullan",
    "Saving...": "Kaydediliyor...",
    Saved: "Kaydedildi",
    "Save for next time": "Sonraki için kaydet",
    "No products available.": "Ürün yok.",
    "Previously ordered": "Önceden sipariş edildi",
    Locked: "Kilitli",
    "New items": "Yeni ürünler",
    "No new items yet.": "Henüz yeni ürün yok.",
    Payment: "Ödeme",
    "Pay Online Now": "Şimdi Online Öde",
    "Card at Table": "Masada Kart",
    "Cash at Table": "Masada Nakit",
    "Clear New Items": "Yeni Ürünleri Temizle",
    "Link copied.": "Bağlantı kopyalandı.",
    // ✅ Added translations
    "Share QR Menu": "QR Menüyü Paylaş",
    "Save QR Menu to Phone": "QR Menüyü Telefona Kaydet",
    "Tap here to install the menu as an app": "Menüyü uygulama olarak yüklemek için buraya dokunun",
    "Add to Home Screen": "Ana Ekrana Ekle",
    "Download Qr": "QR İndir",
    "Scan Table QR": "Masa QR'ını Tara",
    "Scan the QR code on your table to continue.": "Devam etmek için masanızdaki QR kodunu tarayın.",
    "Invalid table QR code.": "Geçersiz masa QR kodu.",
    "This QR is for table": "Bu QR şu masa için",
    "Please scan table": "Lütfen şu masayı tarayın",
    "Camera permission is required.": "Kamera izni gereklidir.",
    Cancel: "İptal",
  },
  de: {
    "Share QR Menu": "QR-Menü teilen",
    "Save QR Menu to Phone": "QR-Menü auf dem Handy speichern",
    "Tap here to install the menu as an app": "Tippen Sie hier, um das Menü als App zu installieren",
    "Add to Home Screen": "Zum Startbildschirm hinzufügen",
    "Download Qr": "QR herunterladen",
    "Scan Table QR": "Tisch-QR scannen",
    "Scan the QR code on your table to continue.": "Scannen Sie den QR-Code auf Ihrem Tisch, um fortzufahren.",
    "Invalid table QR code.": "Ungültiger Tisch-QR-Code.",
    "This QR is for table": "Dieser QR ist für Tisch",
    "Please scan table": "Bitte scannen Sie Tisch",
    "Camera permission is required.": "Kameraberechtigung ist erforderlich.",
    Cancel: "Abbrechen",
  },
  fr: {
    "Share QR Menu": "Partager le menu QR",
    "Save QR Menu to Phone": "Enregistrer le menu QR sur le téléphone",
    "Tap here to install the menu as an app": "Appuyez ici pour installer le menu comme une application",
    "Add to Home Screen": "Ajouter à l'écran d'accueil",
    "Download Qr": "Télécharger QR",
    "Scan Table QR": "Scanner le QR de la table",
    "Scan the QR code on your table to continue.": "Scannez le code QR sur votre table pour continuer.",
    "Invalid table QR code.": "Code QR de table invalide.",
    "This QR is for table": "Ce QR est pour la table",
    "Please scan table": "Veuillez scanner la table",
    "Camera permission is required.": "L'autorisation de la caméra est requise.",
    Cancel: "Annuler",
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


/* ====================== LANGUAGE SWITCHER ====================== */
function LanguageSwitcher({ lang, setLang, t }) {
  return (
    <div className="flex items-center gap-2">
      <label className="hidden sm:block text-[11px] uppercase tracking-[0.15em] text-gray-500 dark:text-neutral-400">
        {t("Language")}
      </label>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="appearance-none rounded-full border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-gray-700 dark:text-neutral-100 shadow-sm hover:border-gray-400 dark:hover:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-gray-300/60 dark:focus:ring-white/10"
        aria-label={t("Language")}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TableQrScannerModal({ open, tableNumber, onClose, error, t }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">{t("Scan Table QR")}</div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {t("Scan the QR code on your table to continue.")}
          </div>
          {tableNumber ? (
            <div className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
              {t("Table")} {String(tableNumber).padStart(2, "0")}
            </div>
          ) : null}
        </div>
        <div className="p-5">
          <div
            id="qr-table-reader"
            className="w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-neutral-950"
          />
          {error ? (
            <div className="mt-3 text-sm text-red-600">{error}</div>
          ) : null}
        </div>
        <div className="p-4 pt-0">
			        <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 py-2.5 text-sm font-semibold text-gray-700 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800"
          >
            {t("Cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function InstallHelpModal({ open, onClose, t, platform, onShare, onCopy }) {
  if (!open) return null;
  const isIos = platform === "ios";
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {t("Add to Home Screen")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {t("Tap here to install the menu as an app")}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          {isIos ? (
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t("Share QR Menu")}</li>
              <li>{t("Add to Home Screen")}</li>
            </ol>
          ) : (
            <ol className="list-decimal pl-5 space-y-1">
              <li>{t("Share QR Menu")}</li>
              <li>{t("Add to Home Screen")}</li>
            </ol>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onShare}
              className="flex-1 py-3 rounded-2xl bg-neutral-900 text-white font-semibold shadow-sm hover:bg-neutral-800 transition"
            >
              {t("Share")}
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="flex-1 py-3 rounded-2xl bg-white dark:bg-neutral-950 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
            >
              {t("Copy Link")}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-neutral-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl px-4 py-2 text-sm font-semibold bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-100 hover:bg-gray-200 dark:hover:bg-neutral-700 transition"
          >
            {t("Close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


/* ====================== HEADER ====================== */
function QrHeader({
  orderType,
  table,
  onClose,
  t,
  restaurantName,
  searchValue,
  onSearchChange,
  searchPlaceholder,
}) {
  const displayRestaurantName = React.useMemo(() => {
    const raw = String(restaurantName || "").trim();
    if (!raw) return "Restaurant";
    // Some tenants store names like "Brand+username" — hide the "+username" in the UI.
    if (raw.includes("+")) {
      const [head] = raw.split("+");
      const trimmed = String(head || "").trim();
      return trimmed || raw;
    }
    return raw;
  }, [restaurantName]);

  return (
    <header className="w-full sticky top-0 z-50 flex items-center justify-between gap-3 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800 px-4 md:px-6 py-3 shadow-sm">
      <span className="text-[18px] md:text-[20px] font-serif font-bold text-gray-900 dark:text-neutral-100 tracking-tight">
        {displayRestaurantName}
      </span>
      <div className="flex-1 min-w-0">
        <div className="relative w-full max-w-[520px] mx-auto">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-neutral-500">
            <span className="text-base leading-none">⌕</span>
          </div>
          <input
            value={searchValue || ""}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder || t("Search")}
            className="w-full h-10 pl-9 pr-3 rounded-full border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm text-gray-800 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 focus:border-gray-300 dark:focus:border-neutral-700"
            aria-label={t("Search")}
          />
        </div>
        <div className="hidden md:block text-xs text-gray-500 mt-1 text-center">
          {orderType === "table"
            ? table
              ? `${t("Table")} ${table}`
              : t("Table Order (short)")
            : t("Online Order")}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800 hover:bg-red-50 dark:hover:bg-rose-950/40 text-gray-500 dark:text-neutral-300 hover:text-red-600 transition-all"
        >
          ×
        </button>
      </div>
    </header>
  );
}

/* ====================== PREMIUM APPLE-STYLE HOME PAGE ====================== */
function OrderTypeSelect({
  identifier, // 🔥 required for backend load
  onSelect,
  lang,
  setLang,
  t,
  onInstallClick,
  onDownloadQr,
  canInstall,
  showHelp,
  setShowHelp,
  platform,
  onPopularClick,
  onCustomizationLoaded,
}) {

  /* ============================================================
     1) Load Custom QR Menu Website Settings from Backend
     ============================================================ */
  const [custom, setCustom] = React.useState(null);
  const onCustomizationLoadedRef = React.useRef(onCustomizationLoaded);
  React.useEffect(() => {
    onCustomizationLoadedRef.current = onCustomizationLoaded;
  }, [onCustomizationLoaded]);

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
	    onCustomizationLoadedRef.current?.(data.customization || {});
	  } catch (err) {
	    console.error("❌ Failed to load QR customization:", err);
	    setCustom({}); // allow component to render with defaults
	    onCustomizationLoadedRef.current?.({});
	  }
	}


    load();
  }, [identifier]);

  // Keep hooks order stable; render with placeholders until loaded

  /* ============================================================
     2) Extract dynamic fields with fallbacks
     ============================================================ */
  const c = custom || {};
  React.useEffect(() => {
    onCustomizationLoadedRef.current?.(custom || {});
  }, [custom]);
  const restaurantName = c.title || c.main_title || "Restaurant";
  const displayRestaurantName = React.useMemo(() => {
    const raw = String(restaurantName || "").trim();
    if (!raw) return "Restaurant";
    if (raw.includes("+")) {
      const [head] = raw.split("+");
      const trimmed = String(head || "").trim();
      return trimmed || raw;
    }
    return raw;
  }, [restaurantName]);
  const subtitle = c.subtitle || "Welcome";
  const tagline = c.tagline || "Fresh • Crafted • Delicious";
  const phoneNumber = c.phone || "";
  const allowDelivery = boolish(c.delivery_enabled, true);
  const accent = c.branding_color || c.primary_color || "#4F46E5";
  const logoUrl = c.logo || "/Beylogo.svg";
  const themeMode = (c.qr_theme || "auto").toLowerCase();
  const [isDark, setIsDark] = React.useState(() =>
    themeMode === "dark" || (themeMode === "auto" && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
  React.useEffect(() => {
    if (themeMode === "auto") {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => setIsDark(mq.matches);
      handler();
      mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
      return () => {
        mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler);
      };
    } else {
      setIsDark(themeMode === "dark");
    }
  }, [themeMode]);


  const storyTitle = c.story_title || "Our Story";
  const storyText = c.story_text || "";
  const storyImage = c.story_image || "";

  const reviews = Array.isArray(c.reviews) ? c.reviews : [];

  // ===== Popular This Week (optional) =====
  const [popularProducts, setPopularProducts] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    async function loadPopular() {
      try {
        if (!identifier || !c.enable_popular) return;
        const [prodRes, popRes] = await Promise.all([
          fetch(`${API_URL}/public/products/${encodeURIComponent(identifier)}`),
          fetch(`${API_URL}/public/popular/${encodeURIComponent(identifier)}`),
        ]);
        if (!prodRes.ok || !popRes.ok) return;
        const all = await prodRes.json();
        const pop = await popRes.json();
        const ids = Array.isArray(pop?.product_ids) ? pop.product_ids : [];
        if (ids.length === 0) return setPopularProducts([]);
        const idIndex = new Map(ids.map((id, i) => [Number(id), i]));
        const merged = (Array.isArray(all) ? all : []).filter(p => idIndex.has(Number(p.id)));
        merged.sort((a,b) => idIndex.get(Number(a.id)) - idIndex.get(Number(b.id)));
        if (!cancelled) setPopularProducts(merged);
      } catch (e) {
        if (!cancelled) setPopularProducts([]);
      }
    }
    loadPopular();
    return () => { cancelled = true; };
  }, [identifier, c.enable_popular]);

  // ===== Categories strip (always) =====
  const { formatCurrency } = useCurrency();
  const [homeCategories, setHomeCategories] = React.useState([]);
  const [homeCategoryImages, setHomeCategoryImages] = React.useState({});
  const [activeHomeCategory, setActiveHomeCategory] = React.useState(
    () => storage.getItem("qr_home_active_category") || ""
  );
  const [homeProducts, setHomeProducts] = React.useState([]);
  const [homeSearch, setHomeSearch] = React.useState(
    () => storage.getItem("qr_home_search") || ""
  );

  React.useEffect(() => {
    let cancelled = false;

    async function loadHomeCategories() {
      try {
        if (!identifier) {
          setHomeCategories([]);
          setHomeCategoryImages({});
          setActiveHomeCategory("");
          setHomeProducts([]);
          return;
        }

        const [productsRes, imagesRes] = await Promise.all([
          fetch(`${API_URL}/public/products/${encodeURIComponent(identifier)}`),
          fetch(`${API_URL}/public/category-images/${encodeURIComponent(identifier)}`),
        ]);

        if (cancelled) return;

        if (productsRes.ok) {
          const productsPayload = await productsRes.json();
          const list = Array.isArray(productsPayload)
            ? productsPayload
            : Array.isArray(productsPayload?.data)
              ? productsPayload.data
              : [];
          setHomeProducts(list);
          const cats = [...new Set(list.map((p) => p?.category).filter(Boolean))];
          setHomeCategories(cats);
          setActiveHomeCategory((prev) => {
            const stored = storage.getItem("qr_home_active_category") || "";
            const candidate = prev || stored;
            if (candidate && cats.includes(candidate)) return candidate;
            return cats[0] || "";
          });
        } else {
          setHomeCategories([]);
          setActiveHomeCategory("");
          setHomeProducts([]);
        }

        if (imagesRes.ok) {
          const data = await imagesRes.json();
          const dict = {};
          (Array.isArray(data) ? data : []).forEach(({ category, image }) => {
            const key = (category || "").trim().toLowerCase();
            if (!key || !image) return;
            dict[key] = image;
          });
          setHomeCategoryImages(dict);
        } else {
          setHomeCategoryImages({});
        }
      } catch {
        if (cancelled) return;
        setHomeCategories([]);
        setHomeCategoryImages({});
        setActiveHomeCategory("");
        setHomeProducts([]);
      }
    }

    loadHomeCategories();
    return () => {
      cancelled = true;
    };
  }, [identifier]);

  React.useEffect(() => {
    if (!activeHomeCategory) return;
    storage.setItem("qr_home_active_category", activeHomeCategory);
  }, [activeHomeCategory]);

  React.useEffect(() => {
    storage.setItem("qr_home_search", homeSearch || "");
  }, [homeSearch]);

  const homeVisibleProducts = React.useMemo(() => {
    const list = Array.isArray(homeProducts) ? homeProducts : [];
    const q = (homeSearch || "").trim().toLowerCase();
    if (q) {
      return list.filter((p) => {
        const haystack = `${p?.name || ""} ${p?.category || ""}`.toLowerCase();
        return haystack.includes(q);
      });
    }
    const active = (activeHomeCategory || "").trim().toLowerCase();
    if (!active) return list;
    return list.filter((p) => (p?.category || "").trim().toLowerCase() === active);
  }, [homeProducts, activeHomeCategory, homeSearch]);

  // ===== Loyalty (optional) =====
  const [deviceId, setDeviceId] = React.useState(() => {
    try {
      const existing = storage.getItem("qr_device_id");
      if (existing) return existing;
      const id = makeToken();
      storage.setItem("qr_device_id", id);
      return id;
    } catch {
      return makeToken();
    }
  });
  const [loyalty, setLoyalty] = React.useState({ enabled: false, points: 0, goal: 10, reward_text: "", color: "#F59E0B" });
  React.useEffect(() => {
    let cancelled = false;
    async function loadLoyalty() {
      try {
        if (!identifier || !c.loyalty_enabled) return;
        const url = `${API_URL}/public/loyalty/${encodeURIComponent(identifier)}?fp=${encodeURIComponent(deviceId)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setLoyalty({
          enabled: !!data.enabled,
          points: Number(data.points || 0),
          goal: Number(data.goal || 10),
          reward_text: data.reward_text || "",
          color: data.color || "#F59E0B",
        });
      } catch {}
    }
    loadLoyalty();
    return () => { cancelled = true; };
  }, [identifier, c.loyalty_enabled, deviceId]);
  const handleStamp = async () => {
    try {
      const res = await fetch(`${API_URL}/public/loyalty/${encodeURIComponent(identifier)}/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: deviceId, points: 1 })
      });
      const data = await res.json();
      if (res.ok && typeof data.points !== 'undefined') {
        setLoyalty((s) => ({ ...s, points: Number(data.points) }));
      }
    } catch {}
  };

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
	  <div className={`${isDark ? 'dark ' : ''}flex-1`}>
	  <div className="min-h-screen w-full bg-gradient-to-b from-white via-[#fafafa] to-[#f5f5f7] text-gray-900 dark:from-neutral-900 dark:via-neutral-900 dark:to-black dark:text-neutral-100 relative overflow-x-hidden">

    {/* === HERO BACKGROUND === */}
    <div
      className="absolute inset-x-0 top-0 h-[420px] sm:h-[480px] -z-10 transition-all duration-700"
      style={{
        backgroundImage: `url(${slides[currentSlide].src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: `translateY(${scrollY * 0.15}px)`,
        filter: "brightness(0.6)",
      }}
    />
	    <div className="absolute inset-x-0 top-0 h-[420px] sm:h-[480px] -z-10 bg-gradient-to-b from-white/70 via-white/80 to-white dark:from-neutral-950/40 dark:via-neutral-950/70 dark:to-black/90" />

	    {/* === TOP BAR === */}
	    <header className="max-w-6xl mx-auto px-4 pt-3 flex items-center justify-between gap-3">
	      {/* Left spacer (keep layout balanced) */}
	      <div className="w-10" />

	      {/* Dot nav removed */}
	    </header>
	
	    {/* === HERO SECTION === */}
		    <section id="order-section" className="max-w-6xl mx-auto px-4 pt-4 pb-14 space-y-10">
	
	      {/* TITLE & TAGLINE */}
	      <div className="max-w-3xl">
	        <div className="flex items-center justify-between gap-3">
		          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 dark:bg-neutral-900/60 border border-gray-200 dark:border-neutral-700 shadow-sm text-[11px] font-medium text-gray-700 dark:text-neutral-200">
		            <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-emerald-500" : "bg-red-500"}`} />
		            {isOpen ? "Open now • Order anytime" : "Currently closed"}
		          </p>
	          <div className="shrink-0">
	            <LanguageSwitcher lang={lang} setLang={setLang} t={t} />
	          </div>
	        </div>

		        <h1 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-serif font-bold leading-tight tracking-tight text-gray-900 dark:text-neutral-50">
		          {displayRestaurantName}
		        </h1>

	        {/* Featured products */}
	        <div className="mt-5 space-y-4 max-w-3xl">
	          <FeaturedCard
	            slides={slides}
	            currentSlide={currentSlide}
	            setCurrentSlide={setCurrentSlide}
	          />
	        </div>

		        <p className="mt-3 text-lg font-light text-gray-600 dark:text-neutral-200/80">{subtitle}</p>
		        <p className="mt-3 text-base text-gray-500 dark:text-neutral-400 max-w-xl">{tagline}</p>

        {/* ORDER TYPE BUTTONS */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3 max-w-xl">
          <button
            onClick={() => onSelect("takeaway")}
            className="min-w-0 px-2 py-4 sm:py-5 rounded-2xl bg-gray-900 text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-2"
          >
            <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {t("Pre Order")}
            </span>
          </button>
          <button
            onClick={() => onSelect("table")}
            className="min-w-0 px-2 py-4 sm:py-5 rounded-2xl bg-gray-800 text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-2"
          >
            <Soup className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {t("Table Order")}
            </span>
          </button>
          <button
            onClick={() => allowDelivery && onSelect("online")}
            disabled={!allowDelivery}
            className={`min-w-0 px-2 py-4 sm:py-5 rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 ${
              allowDelivery
                ? "bg-red-600 hover:shadow-lg hover:-translate-y-1"
                : "bg-red-200 text-red-600 cursor-not-allowed"
            }`}
          >
            <Bike className={`w-5 h-5 sm:w-6 sm:h-6 ${allowDelivery ? "text-white" : "text-red-600"}`} />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {allowDelivery ? t("Delivery") : t("Delivery is closed")}
            </span>
          </button>
        </div>
      </div>

      {/* CATEGORIES (scrollable 1 row) */}
      {homeCategories.length > 0 && (
        <div className="mt-5 max-w-3xl">
	          {/* INFO BOXES */}
	          <div className="grid grid-cols-3 gap-2 sm:gap-3">
	            <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-2 py-2 shadow-sm min-w-0">
	              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-400 leading-tight truncate">Delivery</p>
	              <p className="mt-1 text-[11px] sm:text-sm font-semibold text-emerald-600 leading-tight truncate">⏱️ {deliveryTime}</p>
	              <p className="mt-1 text-[10px] text-gray-500 dark:text-neutral-400 leading-tight truncate hidden sm:block">Fast doorstep service</p>
	            </div>
	
	            <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-2 py-2 shadow-sm min-w-0">
	              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-400 leading-tight truncate">Pickup</p>
	              <p className="mt-1 text-[11px] sm:text-sm font-semibold text-sky-600 leading-tight truncate">🛍️ {pickupTime}</p>
	              <p className="mt-1 text-[10px] text-gray-500 dark:text-neutral-400 leading-tight truncate hidden sm:block">Ready on arrival</p>
	            </div>
	
	            <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 px-2 py-2 shadow-sm min-w-0">
	              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-neutral-400 leading-tight truncate">Rating</p>
	              <p className="mt-1 text-[11px] sm:text-sm font-semibold text-amber-600 leading-tight truncate">★★★★★</p>
	              <p className="mt-1 text-[10px] text-gray-500 dark:text-neutral-400 leading-tight truncate hidden sm:block">Guest favorites</p>
	            </div>
	          </div>

	          {/* Search */}
	          <div className="mt-3 mb-4">
	            <div className="relative">
	              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
	              <input
	                value={homeSearch}
	                onChange={(e) => setHomeSearch(e.target.value)}
	                placeholder={t("Search")}
	                className="w-full rounded-2xl border border-gray-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 shadow-sm pl-11 pr-10 py-3 text-sm text-gray-800 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-white/10"
	                autoComplete="off"
	                inputMode="search"
	              />
	              {homeSearch ? (
	                <button
	                  type="button"
	                  onClick={() => setHomeSearch("")}
	                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-neutral-700 transition flex items-center justify-center"
	                  aria-label={t("Clear")}
	                >
	                  ×
	                </button>
	              ) : null}
	            </div>
	          </div>

	          <div className="flex items-end justify-between">
	            <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-neutral-400">
	              Categories
	            </div>
	          </div>

          <div className="mt-3 flex gap-3 overflow-x-auto pb-2 scroll-smooth scrollbar-hide">
            {homeCategories.map((cat) => {
              const categoryFallbackSrc = "/Beylogo.svg";
              const key = (cat || "").trim().toLowerCase();
              const imgSrc = homeCategoryImages?.[key];
              const active = activeHomeCategory === cat;
              const resolvedSrc = imgSrc
                ? /^https?:\/\//.test(String(imgSrc))
                  ? String(imgSrc)
                  : `${API_URL}/uploads/${String(imgSrc).replace(/^\/?uploads\//, "")}`
                : "";

              return (
	                <button
	                  key={cat}
	                  type="button"
	                  onClick={() => setActiveHomeCategory(cat)}
	                  className={`flex-none w-[calc((100%-2.25rem)/4)] sm:w-32 rounded-2xl border bg-white/80 dark:bg-neutral-900/70 shadow-sm hover:shadow-md transition text-left ${
	                    active ? "border-gray-900 dark:border-white" : "border-gray-200 dark:border-neutral-800"
	                  }`}
	                  aria-label={`Category ${cat}`}
	                >
	                  <div className="p-2">
	                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                        <img
                          src={resolvedSrc || categoryFallbackSrc}
                          alt={cat}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = categoryFallbackSrc;
                          }}
                        />
	                    </div>
	                    <div className="mt-2 text-[11px] sm:text-xs font-semibold text-neutral-800 dark:text-neutral-100 text-center line-clamp-1">
	                      {cat}
	                    </div>
	                  </div>
	                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PRODUCTS (2 columns) */}
      {homeVisibleProducts.length > 0 && (
        <div className="mt-5 max-w-3xl">
          <div className="grid grid-cols-2 gap-3">
            {homeVisibleProducts.map((product) => {
              const fallbackSrc = "/Productsfallback.jpg";
              const img = product?.image;
              const src = img
                ? /^https?:\/\//.test(String(img))
                  ? String(img)
                  : `${API_URL}/uploads/${String(img).replace(/^\/+/, "")}`
                : "";

              return (
                <button
                  key={product?.id ?? `${product?.name}-${product?.price}`}
                  type="button"
	                  onClick={() =>
	                    onPopularClick?.(product, {
	                      source: "home-products",
	                      returnToHomeAfterAdd: true,
	                    })
	                  }
	                  className="group text-left rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 shadow-sm hover:shadow-md hover:-translate-y-[1px] transition"
	                >
	                  <div className="p-2">
	                    <div className="w-full aspect-[4/5] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                        <img
                          src={src || fallbackSrc}
                          alt={product?.name || "Product"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = fallbackSrc;
                          }}
                        />
	                    </div>
	                    <div className="mt-2 text-xs font-semibold text-neutral-800 dark:text-neutral-100 line-clamp-2 text-center">
	                      {product?.name || "—"}
	                    </div>
	                    <div className="mt-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100 text-center">
	                      {formatCurrency(parseFloat(product?.price || 0))}
	                    </div>
	                  </div>
	                </button>
              );
            })}
          </div>
        </div>
      )}
	      {homeVisibleProducts.length === 0 && homeSearch.trim() !== "" && (
	        <div className="mt-5 max-w-3xl">
	          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 px-4 py-4 text-sm text-neutral-600 dark:text-neutral-300">
	            {t("No products available.")}
	          </div>
	        </div>
	      )}

      {/* LOYALTY CARD (optional) */}
      {loyalty.enabled && (
        <div className="mt-2 rounded-3xl border border-amber-200/70 dark:border-amber-800/50 bg-white/80 dark:bg-amber-950/20 p-5 shadow-sm max-w-3xl">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">⭐ Loyalty Card</div>
            <button
              onClick={handleStamp}
              style={{ backgroundColor: loyalty.color }}
              className="px-4 py-2 rounded-full text-white font-semibold shadow hover:opacity-90 transition"
            >Stamp my card</button>
          </div>
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">Reward: {loyalty.reward_text || 'Free Menu Item'}</div>
          <div className="mt-3 flex items-center gap-1">
            {Array.from({ length: loyalty.goal || 10 }).map((_, i) => {
              const filled = i < Math.min(loyalty.points % (loyalty.goal || 10), loyalty.goal || 10);
              return (
                <span key={i}
                  className={`w-5 h-5 rounded-full border ${filled ? 'bg-amber-500 border-amber-600' : 'bg-transparent border-amber-400'} inline-block`}
                />
              );
            })}
            <span className="ml-2 text-sm text-gray-500">({Math.min(loyalty.points % (loyalty.goal || 10), loyalty.goal || 10)}/{loyalty.goal})</span>
          </div>
        </div>
      )}

	      {/* CALL + SHARE */}
	      <div className="mt-6 flex flex-col sm:flex-row gap-4 max-w-3xl">
	        {phoneNumber && (
	          <a
	            href={`tel:${phoneNumber}`}
	            className="flex-1 py-4 rounded-2xl bg-black text-white font-semibold shadow-md flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-1 transition-all"
	            style={{ backgroundColor: accent }}
	          >
	            <Phone className="w-5 h-5" />
	            {t("Call Us")}
	          </a>
	        )}

          <div className="flex-1 flex flex-col gap-3">
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
	                alert(t("Link copied."));
	              }
	            }}
		          className="w-full py-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:-translate-y-1 transition-all"
		        >
		          <Share2 className="w-5 h-5" />
		          {t("Share")}
		        </button>

            <button
              type="button"
              onClick={() => onDownloadQr?.()}
              className="w-full py-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:-translate-y-1 transition-all"
            >
              <Download className="w-5 h-5" />
              {t("Download Qr")}
            </button>
          </div>
	      </div>

	      {/* Popular This Week (below Share button) */}
	      {c.enable_popular && popularProducts.length > 0 && (
	        <div className="mt-6 max-w-3xl">
	          <PopularCarousel
	            title="⭐ Popular This Week"
	            items={popularProducts}
	            onProductClick={onPopularClick}
	          />
	        </div>
	      )}
	    </section>

    {/* === STORY SECTION (B: TEXT LEFT — IMAGE RIGHT) === */}
	    <section id="story-section" className="max-w-6xl mx-auto px-4 pt-4 pb-14">
	      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        
	        {/* TEXT LEFT */}
	        <div>
	          <h2 className="text-3xl font-serif font-bold text-gray-900 dark:text-neutral-50 mb-3">
	            {storyTitle}
	          </h2>
	          <p className="text-base text-gray-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
	            {storyText}
	          </p>
	        </div>

        {/* IMAGE RIGHT */}
	        {storyImage && (
	          <div className="flex justify-center">
	            <div
	              className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-sm border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
	              style={{
	                backgroundImage: storyImage
	                  ? `linear-gradient(135deg, rgba(255,255,255,0.9), rgba(229,231,235,0.8)), url(${storyImage})`
	                  : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
	            >
	              <div className="relative w-full h-48 flex items-center justify-center bg-white/70 dark:bg-neutral-950/40 backdrop-blur-sm">
	                <img
	                  src={storyImage}
	                  alt={storyTitle}
                  className="h-full w-full max-w-full object-contain"
                  style={{ objectPosition: "center" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>

	    {/* === REVIEWS === */}
	    <section id="reviews-section" className="max-w-6xl mx-auto px-4 pt-2 pb-16">
	      <h2 className="text-3xl font-serif font-bold text-gray-900 dark:text-neutral-50 mb-4">
	        What our guests say
	      </h2>

	      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
	        {reviews.length === 0 && (
	          <p className="text-neutral-500 dark:text-neutral-400 text-sm">No reviews yet.</p>
	        )}

	        {reviews.map((r, idx) => (
	          <div
	            key={idx}
	            className="rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col gap-2"
	          >
	            <div className="flex items-center gap-2">
	              <div className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-semibold text-neutral-700 dark:text-neutral-200">
	                {(r.name || "?")[0]}
	              </div>
	              <div>
	                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{r.name}</p>
	                <p className="text-xs text-amber-500">★★★★★</p>
	              </div>
	            </div>
	            <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{r.text}</p>
	          </div>
	        ))}
	      </div>
	    </section>

	    {/* === SOCIAL ICONS === */}
	    <div className="flex items-center justify-center gap-6 pb-10">
	      {c.social_instagram && (
	        <a
	          href={c.social_instagram}
	          target="_blank"
	          rel="noreferrer"
	          className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800 
	                     flex items-center justify-center hover:shadow-lg hover:-translate-y-1 
	                     transition-all"
	        >
	          <Instagram className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
	        </a>
	      )}

	      {c.social_tiktok && (
	        <a
	          href={c.social_tiktok}
	          target="_blank"
	          rel="noreferrer"
	          className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800 
	                     flex items-center justify-center hover:shadow-lg hover:-translate-y-1 
	                     transition-all"
	        >
	          <Music2 className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
	        </a>
	      )}

	      {c.social_website && (
	        <a
	          href={c.social_website}
	          target="_blank"
	          rel="noreferrer"
	          className="w-10 h-10 rounded-full bg-white dark:bg-neutral-900 shadow-sm border border-neutral-200 dark:border-neutral-800 
	                     flex items-center justify-center hover:shadow-lg hover:-translate-y-1 
	                     transition-all"
	        >
	          <Globe className="w-5 h-5 text-neutral-700 dark:text-neutral-200" />
	        </a>
	      )}
	    </div>

	  </div>
	  </div>
	  );





}





/* ====================== TAKEAWAY ORDER FORM ====================== */
function TakeawayOrderForm({ submitting, t, onClose, onSubmit, deliveryEnabled = true }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pickup_date: "",
    pickup_time: "",
    mode: "pickup", // "pickup" | "delivery"
    address: "",
    notes: "",
  });
  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (deliveryEnabled) return;
    setForm((f) => {
      if (f.mode !== "delivery") return f;
      return { ...f, mode: "pickup", address: "" };
    });
  }, [deliveryEnabled]);

  const requiresAddress = form.mode === "delivery";
  const phoneValid = /^(5\d{9}|[578]\d{7})$/.test(form.phone);
  const valid =
    form.name &&
    phoneValid &&
    form.pickup_date &&
    form.pickup_time &&
    (!requiresAddress || (form.address || "").trim().length > 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8 w-full max-w-md relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
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
          {t("Pre Order Information")}
        </h2>

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setTouched({
                name: true,
                phone: true,
                pickup_date: true,
                pickup_time: true,
                address: requiresAddress,
              });
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
	              touched.phone && !phoneValid ? "border-red-500" : "border-neutral-300"
	            }`}
	            placeholder={t("Phone")}
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

          {/* Pickup / Delivery Date */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t("Pickup / Delivery Date")}
            </label>
            <input
              type="date"
              min={today}
              className={`w-full rounded-xl border px-4 py-3 text-neutral-800 focus:ring-1 focus:ring-neutral-400 ${
                touched.pickup_date && !form.pickup_date ? "border-red-500" : "border-neutral-300"
              }`}
              value={form.pickup_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, pickup_date: e.target.value }))
              }
            />
          </div>

          {/* Pickup Time */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t("Pickup Time")}
            </label>
            <input
              type="time"
              className={`w-full rounded-xl border px-4 py-3 text-neutral-800 focus:ring-1 focus:ring-neutral-400 ${
                touched.pickup_time && !form.pickup_time ? "border-red-500" : "border-neutral-300"
              }`}
              value={form.pickup_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, pickup_time: e.target.value }))
              }
            />
          </div>

	          {/* Pickup / Delivery toggle */}
	          <div>
	            <label className="block text-sm font-medium text-neutral-700 mb-1">
	              {t("Pickup / Delivery")}
	            </label>
	            <div className="grid grid-cols-2 gap-2">
	              <button
	                type="button"
	                onClick={() => setForm((f) => ({ ...f, mode: "pickup" }))}
	                className={`py-2.5 rounded-xl text-sm font-semibold border ${
	                  form.mode === "pickup"
	                    ? "bg-neutral-900 text-white border-neutral-900"
	                    : "bg-white text-neutral-700 border-neutral-300"
	                }`}
	              >
	                🛍️ {t("Pickup")}
	              </button>
	              <button
	                type="button"
	                onClick={() => {
	                  if (!deliveryEnabled) return;
	                  setForm((f) => ({ ...f, mode: "delivery" }));
	                }}
	                disabled={!deliveryEnabled}
	                className={`py-2.5 rounded-xl text-sm font-semibold border ${
	                  form.mode === "delivery"
	                    ? "bg-neutral-900 text-white border-neutral-900"
	                    : "bg-white text-neutral-700 border-neutral-300"
	                }`}
	              >
	                🛵 {t("Delivery")}
	              </button>
	            </div>
	            {!deliveryEnabled ? (
	              <div className="mt-2 text-xs font-medium text-rose-600">
	                {t("Delivery is closed")}
	              </div>
	            ) : null}
	          </div>

          {/* Address (only for delivery) */}
          {form.mode === "delivery" && (
            <textarea
              className={`rounded-xl border px-4 py-3 text-neutral-800 placeholder-neutral-400 focus:ring-1 focus:ring-neutral-400 resize-none h-20 ${
                touched.address && !form.address ? "border-red-500" : "border-neutral-300"
              }`}
              placeholder={t("Address")}
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          )}

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
      // 1️⃣ Always save locally (even for guest/QR users)
      storage.setItem("qr_delivery_info", JSON.stringify({ name, phone, address }));

      // 2️⃣ Sync with backend only if authenticated
      const token = getAuthToken();
      if (token) {
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
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8 w-full max-w-md text-left relative max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
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
	  placeholder={t("Phone")}
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


function OrderTypePromptModal({
  product,
  onSelect,
  onClose,
  t,
  deliveryEnabled = true,
}) {
  if (!product) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-400">{t("Order Type")}</p>
            <h3 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{product.name}</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-300">Select how you'd like to order this item.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onSelect?.("takeaway")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-4 py-3 text-sm font-semibold text-neutral-700 dark:text-neutral-100 hover:border-neutral-900 dark:hover:border-white hover:text-neutral-900 shadow-sm transition"
          >
            <UtensilsCrossed className="w-5 h-5" />
            {t("Pre Order")}
          </button>
          <button
            onClick={() => onSelect?.("table")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-gradient-to-r from-neutral-900 to-neutral-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95"
          >
            <Soup className="w-5 h-5" />
            {t("Table Order")}
          </button>
          {deliveryEnabled ? (
            <button
              onClick={() => onSelect?.("online")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500"
            >
              <Bike className="w-5 h-5" />
              {t("Delivery")}
            </button>
          ) : (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm font-semibold text-rose-600 dark:text-rose-300">
              {t("Delivery is closed")}
            </div>
          )}
        </div>
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
  const categoryFallbackSrc = "/Beylogo.svg";

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
    <nav className="fixed bottom-0 inset-x-0 bg-white/95 border-t border-neutral-200 z-[100] backdrop-blur-md shadow-[0_-2px_12px_rgba(0,0,0,0.05)] px-2 sm:px-3">
      <div className="relative w-full max-w-6xl mx-auto">
        {/* Left arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scrollByAmount(-250)}
            className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {/* Right arrow */}
        {canScrollRight && (
          <button
            onClick={() => scrollByAmount(250)}
            className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 border border-neutral-200 shadow-sm hover:shadow-md hover:bg-white transition z-10"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-neutral-600" />
          </button>
        )}

        {/* Scrollable Categories */}
	        <div
	          ref={scrollRef}
	          className="flex flex-nowrap gap-2 md:gap-3 px-10 sm:px-12 py-2 md:py-3 overflow-x-auto scrollbar-hide scroll-smooth"
	        >
          {categoryList.map((cat, idx) => {
            const key = cat?.toLowerCase?.();
            const imgSrc = categoryImages?.[key];
            const active = activeCategory === cat;
            const resolvedSrc = imgSrc
              ? /^https?:\/\//.test(imgSrc)
                ? imgSrc
                : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
              : "";

            return (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  scrollToCategory(idx); // ⬅️ auto-center when clicked
                }}
                className={`group flex items-center gap-2 px-4 md:px-5 py-2 rounded-full text-sm md:text-base font-medium transition-all whitespace-nowrap
                  ${
                    active
                      ? "bg-neutral-900 text-white shadow-sm"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
                  }`}
              >
                <div className="relative w-7 h-7 rounded-full overflow-hidden border border-neutral-300 bg-white/70">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="tracking-wide">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/* ====================== TOP CATEGORY ROW (transaction page) ====================== */
function CategoryTopBar({
  categories,
  activeCategory,
  setActiveCategory,
  categoryImages,
  onCategoryClick,
}) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const scrollRef = React.useRef(null);
  const categoryFallbackSrc = "/Beylogo.svg";

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

  return (
    <div className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm shadow-sm px-2 py-1">
	      <div
	        ref={scrollRef}
	        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-0.5"
	        style={{ scrollBehavior: "smooth" }}
	      >
        {categoryList.map((cat, idx) => {
          const key = cat?.toLowerCase?.();
          const imgSrc = categoryImages?.[key];
          const active = activeCategory === cat;
          const resolvedSrc = imgSrc
            ? /^https?:\/\//.test(imgSrc)
              ? imgSrc
              : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
            : "";
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setActiveCategory(cat);
                onCategoryClick?.(cat);
                scrollToCategory(idx);
              }}
              className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[13px] font-medium transition-all whitespace-nowrap border
                ${
                  active
                    ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                    : "bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200 hover:text-neutral-900 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-white"
                }`}
            >
              <div className="relative w-6 h-6 rounded-full overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-white/70">
                <img
                  src={resolvedSrc || categoryFallbackSrc}
                  alt={cat}
                  className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = categoryFallbackSrc;
                  }}
                />
              </div>
              <span className="tracking-wide">{cat}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ====================== RIGHT CATEGORY RAIL ====================== */
function CategoryRail({ categories, activeCategory, setActiveCategory, categoryImages }) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const categoryFallbackSrc = "/Beylogo.svg";

  return (
    <aside className="w-full h-full">
      <div className="h-full rounded-2xl border border-neutral-200 bg-white/85 shadow-sm p-3 flex flex-col">
        <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-2 px-1">
          Categories
        </div>
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
          {categoryList.map((cat) => {
            const key = cat?.toLowerCase?.();
            const imgSrc = categoryImages?.[key];
            const active = activeCategory === cat;
            const resolvedSrc = imgSrc
              ? /^https?:\/\//.test(imgSrc)
                ? imgSrc
                : `${API_URL}/uploads/${imgSrc.replace(/^\/?uploads\//, "")}`
              : "";

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left
                  ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900 shadow-sm"
                      : "bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300"
                  }`}
              >
                <div className="relative w-8 h-8 rounded-xl overflow-hidden border border-neutral-200 bg-white/70">
                  <img
                    src={resolvedSrc || categoryFallbackSrc}
                    alt={cat}
                    className="object-cover w-full h-full"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = categoryFallbackSrc;
                    }}
                  />
                </div>
                <span className="truncate">{cat}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}


/* ====================== POPULAR CAROUSEL ====================== */
function PopularCarousel({ title, items, onProductClick }) {
  const { formatCurrency } = useCurrency();
  const scrollRef = React.useRef(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);

  const check = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 10);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [check]);

  const scrollBy = (amount) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <div className="relative">
        {canLeft && (
          <button
            onClick={() => scrollBy(-260)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 border border-neutral-200 shadow-sm hover:shadow-md"
            aria-label="Prev"
          >
            <ChevronLeft className="w-5 h-5 text-neutral-700" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scrollBy(260)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 border border-neutral-200 shadow-sm hover:shadow-md"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5 text-neutral-700" />
          </button>
        )}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth scrollbar-none"
        >
          {items.map((p) => (
            <div
              key={p.id}
              role={onProductClick ? "button" : undefined}
              tabIndex={onProductClick ? 0 : undefined}
              onClick={() => onProductClick?.(p)}
              onKeyDown={(event) => {
                if (onProductClick && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onProductClick(p);
                }
              }}
              className="min-w-[180px] sm:min-w-[200px] bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-2xl shadow-sm snap-start cursor-pointer"
            >
              <div className="w-full h-28 overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-neutral-800">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                )}
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold line-clamp-1">{p.name}</div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {formatCurrency(Number(p.price))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ====================== FEATURED CARD (Moved below Popular) ====================== */
function FeaturedCard({ slides, currentSlide, setCurrentSlide }) {
  if (!Array.isArray(slides) || slides.length === 0) return null;
  return (
    <div className="flex items-stretch">
      <div className="w-full rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
        <div className="w-full h-64 sm:h-72 overflow-hidden">
          <img
            src={slides[currentSlide].src}
            alt={slides[currentSlide].title}
            className="w-full h-full object-cover transition-all duration-700 ease-out"
          />
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Featured
          </p>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mt-1">
            {slides[currentSlide].title}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1 line-clamp-2">
            {slides[currentSlide].subtitle}
          </p>
        </div>

        <div className="pb-4 flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`transition-all ${
                i === currentSlide
                  ? "w-5 h-1.5 bg-neutral-900 dark:bg-white rounded-full"
                  : "w-1.5 h-1.5 bg-neutral-300 dark:bg-neutral-700 rounded-full"
              }`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}



/* ====================== PRODUCT GRID (Luxury Fine Dining Style) ====================== */
function ProductGrid({ products, onProductClick, t }) {
  const { formatCurrency } = useCurrency();
  const productList = Array.isArray(products) ? products : [];

  return (
    <main className="w-full max-w-none mx-auto pt-3 pb-28 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4 xl:gap-5">
      {productList.length === 0 && (
        <div className="col-span-full text-center text-neutral-400 font-medium text-lg py-12 italic">
          {t("No products available.")}
        </div>
      )}

      {productList.map((product) => (
        <div
          key={product.id}
          onClick={() => onProductClick(product)}
          className="group relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-[2px] transition-all duration-300 cursor-pointer"
        >
          <div className="aspect-[4/5] w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
            {product.image ? (
              <img
                src={
                  /^https?:\/\//.test(product.image)
                    ? product.image
                    : `${API_URL}/uploads/${product.image}`
                }
                alt={product.name}
                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900" />
            )}
          </div>

          <div className="p-3 flex flex-col items-center text-center space-y-1.5">
            <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-100 tracking-wide group-hover:text-black dark:group-hover:text-white transition-colors line-clamp-2">
              {product.name}
            </h3>
            <p className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-200 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
              {formatCurrency(parseFloat(product.price || 0))}
            </p>
          </div>

          {/* Subtle highlight border */}
          <span className="absolute inset-0 rounded-2xl ring-0 ring-neutral-400/0 group-hover:ring-1 group-hover:ring-neutral-300 dark:group-hover:ring-neutral-700 transition-all duration-300"></span>
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
  const { formatCurrency } = useCurrency();

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
            {formatCurrency(basePrice)}
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
                        {formatCurrency(unit)}
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
          {t('Total')}:{" "}
          <span className="font-semibold">
            {formatCurrency(lineTotal)}
          </span>
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
  hasActiveOrder,
  orderScreenStatus,
  onShowStatus,
  isOrderStatusOpen,
  onOpenCart,
  layout = "drawer",
}) {
  const isPanel = layout === "panel";
  const [show, setShow] = useState(isPanel);
  const { formatCurrency } = useCurrency();
  const paymentMethods = usePaymentMethods();

  const cartArray = toArray(cart);
  const cartLength = cartArray.length;
  const prevItems = cartArray.filter((i) => i.locked);
  const newItems  = cartArray.filter((i) => !i.locked);
  const newItemsCount = newItems.length;
  const hasNewItems = newItemsCount > 0;

  const lineTotal = (item) => {
    const base = parseFloat(item.price) || 0;
    const extrasTotal = (item.extras || []).reduce(
      (sum, ex) => sum + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return (base + extrasTotal) * (item.quantity || 1);
  };

  const total = newItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const statusLabel = useMemo(() => {
    if (!hasActiveOrder || !orderScreenStatus) return null;
    const s = (orderScreenStatus || "").toLowerCase();
    if (["new", "pending", "confirmed", "preparing"].includes(s)) return t("Preparing");
    if (["ready"].includes(s)) return t("Ready for Pickup");
    if (["delivered", "served"].includes(s)) return t("Delivered");
    return null;
  }, [hasActiveOrder, orderScreenStatus, t]);

  // 👂 close by global event
  useEffect(() => {
    if (isPanel) return;
    const handler = () => setShow(false);
    window.addEventListener("qr:cart-close", handler);
    return () => window.removeEventListener("qr:cart-close", handler);
  }, [isPanel]);

  // 🚪 auto-open only if allowed
  useEffect(() => {
    if (isPanel) return;
    const auto = storage.getItem("qr_cart_auto_open") !== "0";
    if (auto) setShow(cartLength > 0);
  }, [cartLength, isPanel]);

  // Never allow Cart + OrderStatus to overlap.
  useEffect(() => {
    if (isPanel) return;
    if (isOrderStatusOpen) setShow(false);
  }, [isOrderStatusOpen, isPanel]);

  function removeItem(idx, isNew) {
    if (!isNew) return; // don't remove locked (read-only)
    setCart((prev) => {
      let n = -1;
      return toArray(prev).filter((it) => (it.locked ? true : (++n !== idx)));
    });
  }

  const cartPanel = (
    <div
      className={`${isPanel ? "h-full rounded-2xl border border-neutral-200 bg-white/95 shadow-sm" : "w-[92vw] max-w-md max-h-[88vh] overflow-hidden bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)]"} p-4 sm:p-6 flex flex-col`}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4 border-b border-neutral-200 pb-2">
        <span className="text-base sm:text-lg font-serif font-semibold text-neutral-900 tracking-tight">
          {t("Your Order")}
        </span>
        {!isPanel && (
          <button
            className="text-2xl text-neutral-400 hover:text-red-600 transition"
            onClick={() => setShow(false)}
            aria-label={t("Close")}
          >
            ×
          </button>
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {cartLength === 0 ? (
          <div className="text-neutral-400 text-center py-8 italic">
            {t("Cart is empty.")}
          </div>
        ) : (
          <div className="space-y-5">
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
                              const perItemQty = ex.quantity || 1;
                              const itemQty = item.quantity || 1;
                              const totalQty = perItemQty * itemQty;
                              const unit =
                                parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                              const line = unit * totalQty;
                              return (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                >
                                  {ex.name} ×{totalQty}{" "}
                                  {formatCurrency(line)}
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
                          {formatCurrency(lineTotal(item))}
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
                              const perItemQty = ex.quantity || 1;
                              const itemQty = item.quantity || 1;
                              const totalQty = perItemQty * itemQty;
                              const unit =
                                parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                              const line = unit * totalQty;
                              return (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                >
                                  {ex.name} ×{totalQty}{" "}
                                  {formatCurrency(line)}
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
                          {formatCurrency(lineTotal(item))}
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
        <div className="mt-5 border-t border-neutral-200 pt-4 space-y-3">
          {/* Total */}
          <div className="flex justify-between items-center text-base">
            <span className="font-medium text-neutral-700">
              {t("Total")}:
            </span>
            <span className="text-lg font-semibold text-neutral-900">
              {formatCurrency(total)}
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
              {/* POS-configured payment methods; filter for QR usage */}
              {paymentMethods
                .filter((m) => m.enabled !== false)
                .map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.icon ? `${method.icon} ` : ""}{method.label}
                  </option>
                ))}
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
          {!isPanel && (
            <button
              onClick={() => setShow(false)}
              className="w-full py-3 rounded-full border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 transition-all"
            >
              {t("Order Another")}
            </button>
          )}

          {/* Clear new */}
          <button
            onClick={() => {
              const lockedOnly = cartArray.filter((i) => i.locked);
              setCart(lockedOnly);
              storage.setItem("qr_cart", JSON.stringify(lockedOnly));
            }}
            className="w-full mt-1 py-2 rounded-md text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition"
          >
            {t("Clear New Items")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Floating cart button */}
	      {!isPanel && !show && (cartLength > 0 || hasActiveOrder) && (
	        <button
          onClick={() => {
            if (hasNewItems) {
              onOpenCart?.();
              storage.setItem("qr_cart_auto_open", "1");
              setShow(true);
            } else if (hasActiveOrder && onShowStatus) {
              onShowStatus();
            } else {
              onOpenCart?.();
              setShow(true);
            }
	          }}
		          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-full min-w-[260px] font-medium tracking-wide shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all z-50 ${
		            hasActiveOrder
		              ? "bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-600 text-white animate-pulse"
		              : "bg-sky-700 dark:bg-sky-600 text-white hover:bg-sky-800 dark:hover:bg-sky-500 hover:scale-105"
		          }`}
		        >
          <span className="text-xl">🛒</span>
          <div className="flex flex-col items-start">
            <span className="text-sm">
              {hasNewItems ? t("View Cart") : t("Your Order")}
            </span>
            {hasActiveOrder && statusLabel && (
              <span className="text-[11px] uppercase tracking-wide opacity-90">
                {statusLabel}
              </span>
            )}
          </div>
          {hasNewItems && (
            <span className="ml-3 inline-flex items-center justify-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
              {newItemsCount}
            </span>
          )}
        </button>
      )}

      {/* Cart Drawer */}
      {isPanel ? (
        <div className="h-full">{cartPanel}</div>
      ) : (
        show && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShow(false);
            }}
          >
            {cartPanel}
          </div>
        )
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
function OrderStatusModal({ open, status, orderId, orderType, table, onOrderAnother, onClose, onFinished, t, appendIdentifier, errorMessage, cancelReason, orderScreenStatus, forceDark }) {
  if (!open) return null;

  const uiStatus = (status || "").toLowerCase(); // pending | success | fail
  const backendStatus = (orderScreenStatus || "").toLowerCase(); // confirmed | cancelled | closed | ...
  const isCancelled = backendStatus === "canceled" || backendStatus === "cancelled";
  const isSending = uiStatus === "pending";
  const isFailed = uiStatus === "fail";

  const title =
    isCancelled ? t("Your order has been cancelled!")
    : isSending ? t("Sending Order...")
    : isFailed ? t("Order Failed")
    : t("Order Sent!");

  const message =
    isCancelled
      ? cancelReason || t("The restaurant cancelled this order.")
      : isSending
        ? t("Please wait...")
        : isFailed
          ? errorMessage || t("Something went wrong. Please try again.")
          : t("Thank you! Your order has been received.");

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
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
	  onClose={onClose}
	  onFinished={onFinished}
	  forceDark={forceDark}

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

// Identifier used for public QR menu endpoints (slug, qr_code_id, or explicit identifier query)
let restaurantIdentifier = safeSlug;
if (!restaurantIdentifier && typeof window !== "undefined") {
  try {
    const params = new URLSearchParams(window.location.search);
    restaurantIdentifier =
      params.get("identifier") ||
      params.get("tenant_id") ||
      params.get("tenant") ||
      params.get("restaurant_id") ||
      params.get("restaurant") ||
      null;
  } catch {
    restaurantIdentifier = null;
  }
}

  const restaurantIdentifierResolved = restaurantIdentifier;

  // Persist last opened restaurant identifier so the installed PWA can reopen the same menu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (restaurantIdentifierResolved) {
        window.localStorage.setItem("qr_last_identifier", String(restaurantIdentifierResolved));
        return;
      }

      // If app was launched from PWA start_url (/menu), redirect to last known menu.
      const path = window.location.pathname || "";
      if (path === "/menu") {
        const last = window.localStorage.getItem("qr_last_identifier");
        if (last && last !== "null" && last !== "undefined") {
          window.location.replace(`/qr-menu/${encodeURIComponent(last)}/scan`);
        }
      }
    } catch {}
  }, [restaurantIdentifierResolved]);

  const tokenResolveIdentifier = id || restaurantIdentifier;

  // Ensure we have a valid JWT for protected endpoints (e.g., POST /orders)
  // Priority: ?token=... in URL, else resolve via /api/public/qr-resolve/:code using route id or identifier
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        storage.setItem(QR_TOKEN_KEY, urlToken);
        return;
      }
    } catch {}

    // If no token present but we have an identifier, resolve it once
    (async () => {
      try {
        const existing = getStoredToken();
        if (existing) return; // already have a token in storage
        if (!tokenResolveIdentifier) return;
        const res = await fetch(
          `${API_URL}/public/qr-resolve/${encodeURIComponent(tokenResolveIdentifier)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.qr_token) {
          storage.setItem(QR_TOKEN_KEY, data.qr_token);
        }
      } catch {}
    })();
  }, [tokenResolveIdentifier]);

  // QR entry mode: "table" (scanned at a table) or "delivery" (generic menu link)
  const [qrMode] = useState(() => getQrModeFromLocation());
  // If table QR link encodes the table number, keep it around for defaults
  const [initialTableFromUrl] = useState(() => getTableFromLocation());

  const appendIdentifier = useCallback(
    (url) => {
      const [base, hash] = String(url).split("#");
      const hasQuery = base.includes("?");
      const hasIdentifier = /[?&]identifier=/.test(base);
      const hasMode = /[?&]mode=/.test(base);

      const parts = [];
      if (restaurantIdentifier && !hasIdentifier) {
        parts.push(
          `identifier=${encodeURIComponent(restaurantIdentifier)}`
        );
      }
      if (qrMode && !hasMode) {
        parts.push(`mode=${encodeURIComponent(qrMode)}`);
      }

      if (!parts.length) return url;

      const separator = hasQuery ? "&" : "?";
      const appended = `${base}${separator}${parts.join("&")}`;
      return hash ? `${appended}#${hash}` : appended;
    },
    [restaurantIdentifier, qrMode]
  );

  // 🔒 One liner to always pass identifier via secureFetch
  const sFetch = useCallback((path, options) => {
    return secureFetch(appendIdentifier(path), options);
  }, [appendIdentifier]);

  const socketRestaurantId = useMemo(() => {
    // Prefer explicit numeric id if present.
    try {
      const stored = window?.localStorage?.getItem("restaurant_id");
      const n = stored ? Number(stored) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
    return parseRestaurantIdFromIdentifier(restaurantIdentifier);
  }, [restaurantIdentifier]);

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

  const [table, setTable] = useState(() => {
    // Prefer explicit table number from QR link, else start empty
    const fromUrl = getTableFromLocation();
    return fromUrl ?? null;
  });
  const [customerInfo, setCustomerInfo] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [extrasGroups, setExtrasGroups] = useState([]);
  const [activeCategory, setActiveCategory] = useState("");
  const getSavedDeliveryInfo = useCallback(() => {
    try {
      const saved = JSON.parse(storage.getItem("qr_delivery_info") || "null");
      if (saved && typeof saved === "object" && saved.address) {
        return {
          name: saved.name || "",
          phone: saved.phone || "",
          address: saved.address || "",
          payment_method: saved.payment_method || "",
        };
      }
    } catch {}
    return null;
  }, []);
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
        setOrderSelectCustomization((prev) => ({ ...prev, ...c }));
        try {
          const mode = String(c.qr_theme || "auto").toLowerCase();
          storage.setItem("qr_theme", mode);
        } catch {}
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
  const [isDarkMain, setIsDarkMain] = React.useState(false);
  const [orderCancelReason, setOrderCancelReason] = useState("");
  const orderIdToTableRef = useRef(new Map());

  const [submitting, setSubmitting] = useState(false);
  const [categoryImages, setCategoryImages] = useState({});
  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderScreenStatus, setOrderScreenStatus] = useState(null);
  const paymentMethods = usePaymentMethods();
  const [paymentMethod, setPaymentMethod] = useState(() => {
    const stored = storage.getItem("qr_payment_method");
    if (stored) return stored;
    // Fallback: first enabled method from settings, else "online"
    return (paymentMethods.find((m) => m.enabled !== false)?.id) || "online";
  });
  const [orderType, setOrderType] = useState(() => {
    // For QR links we can pre-lock the flow
    const mode = getQrModeFromLocation();
    if (mode === "table") return "table";
    if (mode === "delivery") return "online";

    // Fallback: any previously stored type
    try {
      const saved = storage.getItem("qr_orderType");
      if (saved === "table" || saved === "online" || saved === "takeaway") {
        return saved;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [showTakeawayForm, setShowTakeawayForm] = useState(false);
  const [orderSelectCustomization, setOrderSelectCustomization] = useState({
    delivery_enabled: true,
    table_geo_enabled: false,
    table_geo_radius_meters: 150,
  });

  // Apply QR theme to the transaction/menu (mobile-first) area.
  useEffect(() => {
    const mode = String(orderSelectCustomization?.qr_theme || storage.getItem("qr_theme") || "auto")
      .trim()
      .toLowerCase();
    if (mode === "dark") {
      setIsDarkMain(true);
      return;
    }
    if (mode === "light") {
      setIsDarkMain(false);
      return;
    }
    // auto
    try {
      const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
      setIsDarkMain(!!mq?.matches);
    } catch {
      setIsDarkMain(false);
    }
  }, [orderSelectCustomization?.qr_theme]);
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
	const [pendingPopularProduct, setPendingPopularProduct] = useState(null);
	const [returnHomeAfterAdd, setReturnHomeAfterAdd] = useState(false);
	const [forceHome, setForceHome] = useState(false);
	const [showOrderTypePrompt, setShowOrderTypePrompt] = useState(false);
	const [suppressMenuFlash, setSuppressMenuFlash] = useState(true);
	const tableScannerRef = useRef(null);
	const tableScanInFlight = useRef(false);
	const [showTableScanner, setShowTableScanner] = useState(false);
  const [tableScanTarget, setTableScanTarget] = useState(null);
  const [tableScanError, setTableScanError] = useState("");
  const deliveredResetRef = useRef({ orderId: null, timeoutId: null });

  const safeProducts = useMemo(() => toArray(products), [products]);
  const safeCategories = useMemo(() => toArray(categories), [categories]);
  const safeExtrasGroups = useMemo(() => toArray(extrasGroups), [extrasGroups]);
  const safeCart = useMemo(() => toArray(cart), [cart]);
  const safeOccupiedTables = useMemo(() => toArray(occupiedTables), [occupiedTables]);
  const hasActiveOrder = useMemo(() => {
    if (!activeOrder) return false;
    const s = (activeOrder.status || "").toLowerCase();
    return !["closed", "completed", "canceled"].includes(s);
  }, [activeOrder]);
  const productsInActiveCategory = useMemo(
    () =>
      safeProducts.filter(
        (p) =>
          (p?.category || "").trim().toLowerCase() ===
          (activeCategory || "").trim().toLowerCase()
      ),
    [safeProducts, activeCategory]
  );
  const [menuSearch, setMenuSearch] = useState("");
  const productsForGrid = useMemo(() => {
    const q = String(menuSearch || "").trim().toLowerCase();
    if (!q) return productsInActiveCategory;
    return safeProducts.filter((p) => {
      const name = String(p?.name || "").toLowerCase();
      return name.includes(q);
    });
  }, [menuSearch, productsInActiveCategory, safeProducts]);

  // 🥡 Pre-order (takeaway) fields
const [takeaway, setTakeaway] = useState({
  name: "",
  phone: "",
  pickup_date: "",
  pickup_time: "",
  mode: "pickup", // "pickup" | "delivery"
  address: "",
  notes: "",
});
const restaurantSlug =
  localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";
// at the top of QrMenu component
const [showQrPrompt, setShowQrPrompt] = useState(() => {
  return !storage.getItem("qr_saved");
});
const [qrPromptMode, setQrPromptMode] = useState("default"); // "default" | "hint"
// === PWA INSTALL HANDLER ===
const [deferredPrompt, setDeferredPrompt] = useState(null);
const [canInstall, setCanInstall] = useState(false);
const stopTableScanner = useCallback(async () => {
  const scanner = tableScannerRef.current;
  if (!scanner) return;
  try {
    await scanner.stop();
  } catch {}
  try {
    await scanner.clear();
  } catch {}
  tableScannerRef.current = null;
}, []);

const closeTableScanner = useCallback(() => {
  setShowTableScanner(false);
  setTableScanTarget(null);
  setTableScanError("");
  tableScanInFlight.current = false;
  stopTableScanner();
}, [stopTableScanner]);

const openTableScanner = useCallback((tableNumber) => {
  if (!tableNumber) return;
  setTableScanTarget(tableNumber);
  setTableScanError("");
  setShowTableScanner(true);
}, []);

const handleTableScanSuccess = useCallback(
  (decodedText) => {
    if (tableScanInFlight.current) return;
    const scannedTable = extractTableNumberFromQrText(decodedText);
    if (!scannedTable) {
      setTableScanError(t("Invalid table QR code."));
      return;
    }
    if (tableScanTarget && Number(scannedTable) !== Number(tableScanTarget)) {
      setTableScanError(
        `${t("This QR is for table")} ${scannedTable}. ${t("Please scan table")} ${tableScanTarget}.`
      );
      return;
    }
    tableScanInFlight.current = true;
    const finalTable = tableScanTarget || scannedTable;
    stopTableScanner().finally(() => {
      setShowTableScanner(false);
      setTableScanError("");
      setTable(finalTable);
      saveSelectedTable(finalTable);
      tableScanInFlight.current = false;
    });
  },
  [stopTableScanner, t, tableScanTarget]
);
  const resetToTypePicker = () => {
    setShowStatus(false);
    setOrderStatus("pending");
    setOrderId(null);
    setCart([]);
    setCustomerInfo(null);
    if (qrMode === "table") {
      // In table mode always stay in table flow
      const urlTable = initialTableFromUrl;
      if (urlTable) {
        setTable(urlTable);
        saveSelectedTable(urlTable);
      } else {
        setTable(null); // will re-open table selector
      }
      setOrderType("table");
    } else if (qrMode === "delivery") {
      // Delivery QR only supports online orders
      setTable(null);
      setOrderType("online");
    } else {
      // Generic QR menu → back to type chooser
      setTable(null);
      setOrderType(null);
    }
    setActiveOrder(null);
    setOrderScreenStatus(null);
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

useEffect(() => {
  const isStandalone =
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone)) ||
    false;
  if (!isStandalone) return;
  storage.setItem("qr_saved", "1");
  setShowQrPrompt(false);
}, [storage]);

useEffect(() => {
  if (!showTableScanner) return;
  let active = true;
  const start = async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (!active) return;
      const scanner = new Html5Qrcode("qr-table-reader");
      tableScannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (!active) return;
          handleTableScanSuccess(decodedText);
        },
        () => {}
      );
    } catch (err) {
      if (!active) return;
      setTableScanError(t("Camera permission is required."));
    }
  };
  start();
  return () => {
    active = false;
    stopTableScanner();
  };
}, [handleTableScanSuccess, showTableScanner, stopTableScanner, t]);

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
  // If store links are configured, prefer taking users to the native app stores.
  // (Useful when you want the QR menu experience inside the Beypro mobile app.)
  if (platform === "ios" && BEYPRO_APP_STORE_URL) {
    window.open(BEYPRO_APP_STORE_URL, "_blank", "noopener,noreferrer");
    storage.setItem("qr_saved", "1");
    setShowQrPrompt(false);
    return;
  }
  if (platform === "android" && BEYPRO_PLAY_STORE_URL) {
    window.open(BEYPRO_PLAY_STORE_URL, "_blank", "noopener,noreferrer");
    storage.setItem("qr_saved", "1");
    setShowQrPrompt(false);
    return;
  }

  const isStandalone =
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone)) ||
    false;

  if (isStandalone) {
    storage.setItem("qr_saved", "1");
    setShowQrPrompt(false);
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => {
      setDeferredPrompt(null);
      setCanInstall(false);
      storage.setItem("qr_saved", "1");
      setShowQrPrompt(false);
    });
    return;
  }

  // No native install prompt (e.g., iOS Safari). Show "Add to Home Screen" instructions.
  storage.setItem("qr_saved", "1");
  setShowQrPrompt(false);
  setShowHelp(true);
}

useEffect(() => {
  const timer = setTimeout(() => setSuppressMenuFlash(false), 250);
  return () => clearTimeout(timer);
}, []);

// When switching order type, choose a sensible default
useEffect(() => {
  // Ensure paymentMethod always matches one of the configured methods
  const allowedIds = paymentMethods.map((m) => m.id);
  if (!allowedIds.length) return;
  if (!paymentMethod || !allowedIds.includes(paymentMethod)) {
    setPaymentMethod(allowedIds[0]);
  }
}, [paymentMethods, paymentMethod]);

useEffect(() => {
  storage.setItem("qr_payment_method", paymentMethod);
}, [paymentMethod]);

const [isDesktopLayout, setIsDesktopLayout] = useState(() => {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 1280;
});

useEffect(() => {
  const handleResize = () => {
    if (typeof window === "undefined") return;
    setIsDesktopLayout(window.innerWidth >= 1280);
  };
  handleResize();
  window.addEventListener("resize", handleResize);
  return () => window.removeEventListener("resize", handleResize);
}, []);


// === Always-mounted Order Status (portal) ===
const statusPortalOrderId =
  orderId || Number(storage.getItem("qr_active_order_id")) || null;
const statusPortal = showStatus && statusPortalOrderId
		  ? createPortal(
			        <OrderStatusModal
			        open={true}
			        status={orderStatus}
			        orderId={statusPortalOrderId}
			        orderType={orderType} 
			        table={orderType === "table" ? table : null}
			        onOrderAnother={orderType === "table" ? handleReset : handleOrderAnother}
			        onClose={handleReset}
			        onFinished={resetToTypePicker}
		        t={t}
			        appendIdentifier={appendIdentifier}
			        errorMessage={lastError}
		        cancelReason={orderCancelReason}
		        orderScreenStatus={orderScreenStatus}
		        forceDark={isDarkMain}
		      />,
	      document.body
	    )
	  : null;
  // show Delivery Info form first, every time Delivery is chosen
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
    resetTableIfEmptyCart();
    resetToTypePicker();
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
      const wantsStatusOpen = storage.getItem("qr_show_status") === "1";

      // helper: true if ALL items are delivered
     // helper: true if ALL items are delivered
	async function allItemsDelivered(id) {
  try {
    const token = getStoredToken();
    if (!token) return false;
    const ir = await secureFetch(appendIdentifier(`/orders/${id}/items`), {
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

    // Restore the active order, but don't pop "Order Sent" on refresh unless user had it open.
    setOrderStatus("success");
    setShowStatus(wantsStatusOpen);

    setActiveOrder(order);
    setOrderScreenStatus(status);
    setOrderCancelReason(
      status === "canceled" || status === "cancelled"
        ? order?.cancellation_reason || order?.cancel_reason || order?.cancelReason || ""
        : ""
    );

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
      const q = await secureFetch(appendIdentifier(`/orders?table_number=${savedTable}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      const raw = await q.json();
      const list = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
        ? raw.data
        : [];

        const openOrder = list.find((o) => o?.status);

	        if (openOrder) {
	          const status = (openOrder?.status || "").toLowerCase();
	          const paid =
	            status === "paid" ||
	            openOrder.payment_status === "paid" ||
	            openOrder.payment_state === "paid";

	          // Restore the active order, but don't pop "Order Sent" on refresh unless user had it open.
	          setOrderType("table");
	          setTable(savedTable);
	          setOrderId(openOrder.id);
	          setOrderStatus("success");
	          setShowStatus(wantsStatusOpen);

	        setActiveOrder(openOrder);
	          setOrderScreenStatus(status);
          setOrderCancelReason(
            status === "canceled" || status === "cancelled"
              ? openOrder?.cancellation_reason || openOrder?.cancel_reason || openOrder?.cancelReason || ""
              : ""
          );

	          storage.setItem("qr_active_order_id", String(openOrder.id));
	          storage.setItem("qr_orderType", "table");
	          return;
	      }
	    } catch (err) {
      console.warn("⚠️ Failed to restore table order:", err);
    }
  }
}


      // 3️⃣ Nothing to restore
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      resetToTypePicker();
    } catch (err) {
      console.error("❌ QRMenu restore failed:", err);
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      resetToTypePicker();
    }
  })();
}, [appendIdentifier, qrMode, initialTableFromUrl]);

  // 🔄 Keep a lightweight, real-time summary of the active order status
  const refreshOrderScreenStatus = useCallback(async () => {
    if (!orderId) return;
    try {
      const token = getStoredToken();
      const opts = token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : {};
      const res = await secureFetch(appendIdentifier(`/orders/${orderId}`), opts);
      if (!res || res.ok === false) return;

      const data = typeof res.json === "function" ? await res.json() : res;
      setActiveOrder(data || null);

      const s = (data?.status || "").toLowerCase();
      if (!s) {
        setOrderScreenStatus(null);
        return;
      }
      setOrderScreenStatus(s);
      setOrderCancelReason(
        s === "canceled" || s === "cancelled"
          ? data?.cancellation_reason || data?.cancel_reason || data?.cancelReason || ""
          : ""
      );

      // Keep the status modal visible when order is cancelled/closed
      if (s === "canceled" || s === "cancelled" || s === "closed") {
        setShowStatus(true);
        setOrderStatus("success");
      }

      if (import.meta.env.DEV) {
        console.info("[QR] refreshOrderScreenStatus", {
          orderId,
          status: s,
          cancel_reason:
            data?.cancellation_reason || data?.cancel_reason || data?.cancelReason || null,
        });
      }
    } catch (err) {
      console.warn("⚠️ Failed to refresh QR order status:", err);
    }
  }, [orderId, appendIdentifier]);

  // Listen to kitchen/order events over Socket.IO and refresh summary
  useOrderSocket(refreshOrderScreenStatus, orderId);

  // Also refresh once whenever orderId changes (e.g. after first submit)
	useEffect(() => {
    refreshOrderScreenStatus();
  }, [refreshOrderScreenStatus]);

  useEffect(() => {
    return () => {
      if (deliveredResetRef.current.timeoutId) {
        window.clearTimeout(deliveredResetRef.current.timeoutId);
      }
    };
  }, []);


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

  const refreshOccupiedTables = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const orders = await sFetch("/orders", { headers: { Authorization: `Bearer ${token}` } });
      const list = parseArray(orders);
      try {
        const nextMap = new Map();
        toArray(list).forEach((o) => {
          const oid = Number(o?.id);
          const tno = Number(o?.table_number);
          if (Number.isFinite(oid) && Number.isFinite(tno) && tno > 0) nextMap.set(oid, tno);
        });
        orderIdToTableRef.current = nextMap;
      } catch {}
      const occupied = toArray(list)
        .filter((order) => {
          if (!order?.table_number) return false;
          const status = String(order?.status || "").toLowerCase();
          return !["closed", "completed", "canceled", "cancelled"].includes(status);
        })
        .map((order) => Number(order.table_number))
        .filter((n) => Number.isFinite(n) && n > 0);
      setOccupiedTables(occupied);
    } catch (err) {
      console.warn("⚠️ Failed to refresh occupied tables:", err);
    }
  }, [sFetch]);

  // Realtime table occupancy: join restaurant room and refresh on order events.
  useEffect(() => {
    if (!socketRestaurantId) return;
    const SOCKET_URL =
      import.meta.env.VITE_SOCKET_URL ||
      (API_BASE ? String(API_BASE) : "") ||
      (typeof window !== "undefined" ? window.location.origin : "");

    const s = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      upgrade: true,
      withCredentials: true,
      timeout: 20000,
      auth: { restaurantId: socketRestaurantId },
    });

    let refreshTimer = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refreshOccupiedTables();
      }, 50);
    };

    try {
      s.emit("join_restaurant", socketRestaurantId);
    } catch {}

    const upsertOccupied = (tableNo) => {
      const n = Number(tableNo);
      if (!Number.isFinite(n) || n <= 0) return;
      setOccupiedTables((prev) => {
        const next = new Set(toArray(prev).map(Number));
        next.add(n);
        return Array.from(next);
      });
    };

    const removeOccupied = (tableNo) => {
      const n = Number(tableNo);
      if (!Number.isFinite(n) || n <= 0) return;
      setOccupiedTables((prev) => toArray(prev).map(Number).filter((x) => x !== n));
    };

    const onConfirmed = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id ?? payload?.order?.id);
      const tableNo =
        payload?.table_number ??
        payload?.order?.table_number ??
        payload?.tableNumber ??
        null;
      if (Number.isFinite(orderId)) {
        const tno = Number(tableNo);
        if (Number.isFinite(tno) && tno > 0) orderIdToTableRef.current.set(orderId, tno);
      }
      if (tableNo) upsertOccupied(tableNo);
      scheduleRefresh();
    };

    const onCancelled = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id ?? payload?.order?.id);
      const tableNo = payload?.table_number ?? payload?.order?.table_number ?? null;
      if (tableNo) removeOccupied(tableNo);
      else if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) removeOccupied(cached);
      }
      if (Number.isFinite(orderId)) orderIdToTableRef.current.delete(orderId);
      scheduleRefresh();
    };

    const onClosed = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id);
      if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) removeOccupied(cached);
        orderIdToTableRef.current.delete(orderId);
      }
      scheduleRefresh();
    };

    const onAny = () => scheduleRefresh();
    s.on("order_confirmed", onConfirmed);
    s.on("orders_updated", onAny);
    s.on("order_cancelled", onCancelled);
    s.on("order_closed", onClosed);

    // Initial refresh on connect
    s.on("connect", () => scheduleRefresh());

    return () => {
      try {
        if (refreshTimer) window.clearTimeout(refreshTimer);
      } catch {}
      try {
        s.off("order_confirmed", onConfirmed);
        s.off("orders_updated", onAny);
        s.off("order_cancelled", onCancelled);
        s.off("order_closed", onClosed);
        s.disconnect();
      } catch {}
    };
  }, [socketRestaurantId, refreshOccupiedTables]);




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
          .filter((order) => {
            if (!order?.table_number) return false;
            const status = String(order?.status || "").toLowerCase();
            return !["closed", "completed", "canceled", "cancelled"].includes(status);
          })
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



const triggerOrderType = useCallback(
  (type) => {
    setForceHome(false);
    setOrderType(type);
    if (type === "online") {
      setShowDeliveryForm(true);
    }
    if (type === "takeaway") {
      setShowTakeawayForm(true);
    }
  },
  [setForceHome, setOrderType, setShowDeliveryForm, setShowTakeawayForm]
);

const handlePopularProductClick = useCallback(
  (product, meta) => {
    if (!product) return;
    setPendingPopularProduct(product);
    setReturnHomeAfterAdd(!!meta?.returnToHomeAfterAdd);
    setShowOrderTypePrompt(true);
  },
  [setPendingPopularProduct, setReturnHomeAfterAdd, setShowOrderTypePrompt]
);

		useEffect(() => {
		  if (!orderType || !pendingPopularProduct) return;
      // If the chosen order type requires an info modal (delivery / pre-order),
      // wait until the modal is completed/closed before opening the add-to-cart flow.
      if (orderType === "online" && showDeliveryForm) return;
      if (orderType === "takeaway" && showTakeawayForm) return;
		  const targetCategory = (pendingPopularProduct.category || "").trim();
		  if (targetCategory) {
		    setActiveCategory(targetCategory);
		  }
		  setSelectedProduct(pendingPopularProduct);
		  setShowAddModal(true);
		  setPendingPopularProduct(null);
		}, [
      orderType,
      pendingPopularProduct,
      showDeliveryForm,
      showTakeawayForm,
      setActiveCategory,
      setSelectedProduct,
      setShowAddModal,
    ]);

		const showHome = !orderType || forceHome;

// --- Table select (let THIS device re-open its own occupied table) ---
if (!forceHome && orderType === "table" && !table) {
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
      <div className={isDarkMain ? "dark" : ""}>
        <ModernTableSelector
          tables={tables}
          occupiedNumbers={filteredOccupied}
          occupiedLabel={t("Occupied")}
          onSelect={(tbl) => {
            openTableScanner(tbl?.tableNumber);
          }}
          onBack={() => {
            setOrderType(null);
          }}
        />

        <TableQrScannerModal
          open={showTableScanner}
          tableNumber={tableScanTarget}
          onClose={closeTableScanner}
          error={tableScanError}
          t={t}
        />
      </div>



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

    // Check if current order is cancelled - if so, clear everything for fresh start
    if (id) {
      try {
        const token = getStoredToken();
        const res = await secureFetch(appendIdentifier(`/orders/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res) {
          const orderStatus = (res.status || "").toLowerCase();
          if (orderStatus === "cancelled" || orderStatus === "canceled") {
            // Clear everything for a fresh start
            setCart([]);
            storage.removeItem("qr_cart");
            storage.removeItem("qr_active_order_id");
            storage.removeItem("qr_orderType");
            storage.setItem("qr_show_status", "0");
            setOrderId(null);
            setOrderType(null);
            return;
          }
        }
      } catch (err) {
        console.warn("⚠️ Failed to check order status:", err);
      }
    }

    // If table known but no id, fetch open order for that table
    if (!id && (type === "table" || table)) {
      const tNo = table || Number(storage.getItem("qr_table")) || null;
      if (tNo) {
        const token = getStoredToken();
        if (token) {
          try {
            const q = await secureFetch(appendIdentifier(`/orders?table_number=${tNo}`) , {
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
    // IMPORTANT: QRMenu order placement should use the backend's public QR POST flow (identifier-based).
    // Do not send an Authorization header here, otherwise some tokens can hit MODULE_NOT_ALLOWED.
    const json = await secureFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "",
      },
      body: JSON.stringify(body),
    });
    return json; // secureFetch already returns parsed JSON or throws
  } catch (err) {
    throw new Error(err.message || "Request failed");
  }
}

function buildOrderPayload({ orderType, table, items, total, customer, takeaway, paymentMethod, tableGeo }) {
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

  const pickupDate = takeaway?.pickup_date;
  const pickupTime = takeaway?.pickup_time;
  const combinedPickupTime =
    pickupDate && pickupTime
      ? `${pickupDate} ${pickupTime}`
      : pickupTime || pickupDate || null;
  const isTakeawayDelivery = isTakeaway && !!(takeaway && takeaway.mode === "delivery");

  return {
    table_number: isTable ? Number(table) : null,
    order_type: isOnline ? "packet" : isTakeaway ? "takeaway" : "table",
    total: Number(total) || 0,
    items: itemsPayload,
    table_geo_lat: isTable ? tableGeo?.lat ?? null : null,
    table_geo_lng: isTable ? tableGeo?.lng ?? null : null,

    // ✅ Safely handle missing objects
    customer_name: isTakeaway
      ? takeaway?.name || null
      : customer?.name || null,
    customer_phone: isTakeaway
      ? takeaway?.phone || null
      : customer?.phone || null,
    customer_address: isOnline
      ? customer?.address || null
      : isTakeawayDelivery
      ? takeaway?.address || null
      : null,
    pickup_time: isTakeaway
      ? combinedPickupTime
      : null,
    notes: isTakeaway
      ? takeaway?.notes || null
      : null,
    // Only set payment method for delivery orders; avoid leaking "Online" into takeaway/table.
    payment_method: isOnline ? (paymentMethod || null) : null,
  };
}


async function handleSubmitOrder() {
  try {
    setLastError(null);

    const type = orderType || storage.getItem("qr_orderType");
    if (!type) {
      window.dispatchEvent(new Event("qr:cart-close"));
      alert(t("Please choose an order type first."));
      return;
    }
    if (!orderType) {
      setOrderType(type);
    }

    // Require delivery details for ONLINE orders (always)
    const hasActiveOnline =
      type === "online" &&
      (orderId || storage.getItem("qr_active_order_id"));
    let deliveryInfo = customerInfo;
    if (type === "online") {
      if (!deliveryInfo || !deliveryInfo.address) {
        const savedDelivery = getSavedDeliveryInfo();
        if (savedDelivery && savedDelivery.address) {
          deliveryInfo = savedDelivery;
          setCustomerInfo(savedDelivery);
        } else {
          window.dispatchEvent(new Event("qr:cart-close"));
          setShowDeliveryForm(true);
          return;
        }
      }
    }

    // 🔒 Require payment method ONLY for delivery orders
    if (type === "online" && !paymentMethod) {
      alert(t("Please select a payment method before continuing."));
      return;
    }

    setSubmitting(true);
    setOrderStatus("pending");
    setShowStatus(true);

    const newItems = toArray(cart).filter((i) => !i.locked);
    if (newItems.length === 0) {
      setOrderStatus("success");
      setShowStatus(true);
      return;
    }

    if (type === "table" && !table) {
      throw new Error("Please select a table.");
    }

    // Prevent creating a new table order if that table is already occupied by another session
    // (allow if appending to existing orderId; below branch handles append)
    if (!orderId && type === "table") {
      const nTable = Number(table);
      if (safeOccupiedTables.includes(nTable)) {
        throw new Error("This table is currently occupied. Please contact staff.");
      }
    }

    let tableGeo = null;
    if (type === "table" && orderSelectCustomization.table_geo_enabled) {
      if (!navigator?.geolocation) {
        throw new Error("Location is required for table orders. Please rescan at the restaurant.");
      }
      tableGeo = await new Promise((resolve, reject) => {
        const timeoutMs = 10000;
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Location request timed out. Please rescan at the restaurant."));
        }, timeoutMs);
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            window.clearTimeout(timeoutId);
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          },
          () => {
            window.clearTimeout(timeoutId);
            reject(new Error("Location permission is required for table orders."));
          },
          { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
        );
      });
    }

    // ---------- APPEND to existing order ----------
    if (orderId) {
      // First, fetch the current order to check its payment status
      let existingOrder = activeOrder;
      if (!existingOrder) {
        try {
          const res = await secureFetch(appendIdentifier(`/orders/${orderId}`));
          existingOrder = res;
        } catch (err) {
          console.warn("Could not fetch existing order:", err);
        }
      }
      
      const isOrderAlreadyPaid = existingOrder && (
        existingOrder.is_paid === true ||
        (existingOrder.status || "").toLowerCase() === "paid" ||
        (existingOrder.payment_status || "").toLowerCase() === "paid"
      );

      const itemsPayload = newItems.map((i) => ({
        product_id: i.id,
        quantity: i.quantity,
        price: parseFloat(i.price) || 0,
        ingredients: i.ingredients ?? [],
        extras: i.extras ?? [],
        unique_id: i.unique_id,
        note: i.note || null,
        confirmed: true,
        payment_method: paymentMethod === "online" ? "Online" : paymentMethod,
        receipt_id: null,
      }));

await postJSON(appendIdentifier("/orders/order-items"), {
  order_id: orderId,
  receipt_id: null,
  items: itemsPayload,
  table_geo_lat: tableGeo?.lat ?? null,
  table_geo_lng: tableGeo?.lng ?? null,
});


      // Save/patch the chosen payment method on the order (ignore if backend doesn't support)
      try {
     await secureFetch(appendIdentifier(`/orders/${orderId}/status`), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payment_method: paymentMethod }),
});

      } catch {}

      // If user chose Online, create/refresh a checkout session
      if (paymentMethod === "online") {
        await startOnlinePaymentSession(orderId);
        
        // For sub-orders, we need to create a proper payment receipt for these items
        try {
          const subOrderTotal = newItems.reduce(
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
          );
          
          // Create a receipt for these specific items
          console.log("📝 Creating receipt for sub-order items with online payment");
          const receiptData = await postJSON(appendIdentifier("/receipts"), {
            order_id: orderId,
            payment_method: "Online",
            amount: subOrderTotal,
            items: itemsPayload.map(item => ({
              ...item,
              payment_method: "Online",
            })),
          });
          
          console.log("✅ Receipt created for sub-order:", receiptData);
        } catch (err) {
          console.error("❌ Failed to create receipt for sub-order:", err);
        }
      }

      // clear only NEW items
      setCart((prev) => toArray(prev).filter((i) => i.locked));

      storage.setItem(
        "qr_active_order",
        JSON.stringify({
          orderId,
          orderType: type,
          table: type === "table" ? table : null,
        })
      );
      storage.setItem("qr_active_order_id", String(orderId));
      if (type === "table" && table)
        storage.setItem("qr_table", String(table));
      storage.setItem("qr_orderType", type);
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
    orderType: type,
    table,
    items: newItems,
    total,
    customer: type === "online" ? deliveryInfo || customerInfo : null,
    takeaway: type === "takeaway" ? takeaway : null,
    paymentMethod,
    tableGeo,
  })
);


    const newId = created?.id;
    if (!newId) throw new Error("Server did not return order id.");

    // If Online, start a checkout session for this order
    if (paymentMethod === "online") {
      await startOnlinePaymentSession(newId);
          // 🔑 Immediately mark order as Paid Online
     try {
       await secureFetch(appendIdentifier(`/orders/${newId}/status`) , {
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
    // Optimistically mark table as occupied immediately for other sessions on this device.
    if (type === "table" && table) {
      const nTable = Number(table);
      if (Number.isFinite(nTable) && nTable > 0) {
        setOccupiedTables((prev) => {
          const next = new Set(toArray(prev).map(Number));
          next.add(nTable);
          return Array.from(next);
        });
      }
    }
    storage.setItem(
      "qr_active_order",
      JSON.stringify({
        orderId: newId,
        orderType: type,
        table: type === "table" ? table : null,
      })
    );
    storage.setItem("qr_active_order_id", String(newId));
    if (type === "table" && table)
      storage.setItem("qr_table", String(table));
    storage.setItem("qr_orderType", type);
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
		  // Check if order is delivered or cancelled - if so, navigate to home
		  const status = (orderScreenStatus || "").toLowerCase();
		  const isFinished = ["delivered", "served", "cancelled", "canceled", "closed", "completed"].includes(status);
		  
		  if (isFinished) {
		    // Order is complete - navigate to home and clear everything
		    resetToTypePicker();
		  } else {
		    // Order still active - just hide status to return to menu
		    setShowStatus(false);
		    storage.setItem("qr_show_status", "0");
		  }
		}


  

	return (
	  <>
      <InstallHelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        t={t}
        platform={platform}
        onShare={() => {
          const url = window.location.href;
          if (navigator.share) {
            navigator.share({
              title: restaurantName,
              text: "Check out our menu!",
              url,
            });
          } else {
            try {
              navigator.clipboard.writeText(url);
              alert(t("Link copied."));
            } catch {
              alert(url);
            }
          }
        }}
        onCopy={() => {
          const url = window.location.href;
          try {
            navigator.clipboard.writeText(url);
            alert(t("Link copied."));
          } catch {
            alert(url);
          }
        }}
      />
      {showQrPrompt && (
        <div className="fixed bottom-5 left-1/2 z-[999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 px-2">
          <div className="pointer-events-auto rounded-2xl border border-neutral-200/80 bg-white/95 shadow-[0_18px_50px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-neutral-800/70 dark:bg-neutral-950/85">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {t("Save QR Menu to Phone")}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                    {qrPromptMode === "hint"
                      ? t("Add to Home Screen")
                      : t("Tap here to install the menu as an app")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    storage.setItem("qr_saved", "1");
                    setShowQrPrompt(false);
                    setQrPromptMode("default");
                  }}
                  className="shrink-0 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {t("Close")}
                </button>
              </div>

              <button
                type="button"
                onClick={handleDownloadQr}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition dark:border-neutral-800"
              >
                <Download className="h-5 w-5" />
                {t("Download Qr")}
              </button>
            </div>
          </div>
        </div>
      )}
	    {showHome ? (
	      <>
	        <OrderTypeSelect
	          identifier={restaurantIdentifier}
	          onSelect={triggerOrderType}
	          lang={lang}
	          setLang={setLang}
	          t={t}
	          onInstallClick={handleInstallClick}
            onDownloadQr={handleDownloadQr}
	          canInstall={canInstall}
	          showHelp={showHelp}
	          setShowHelp={setShowHelp}
	          platform={platform}
	          onPopularClick={handlePopularProductClick}
	          onCustomizationLoaded={(next) =>
	            setOrderSelectCustomization((prev) => ({ ...prev, ...(next || {}) }))
	          }
	        />

		        {!orderType && showOrderTypePrompt && pendingPopularProduct && (
		          <OrderTypePromptModal
		            product={pendingPopularProduct}
		            t={t}
		            onClose={() => {
		              setShowOrderTypePrompt(false);
		              setPendingPopularProduct(null);
		              setReturnHomeAfterAdd(false);
		            }}
		            onSelect={(type) => {
		              triggerOrderType(type);
		              setShowOrderTypePrompt(false);
		            }}
		            deliveryEnabled={boolish(orderSelectCustomization.delivery_enabled, true)}
		          />
		        )}
	      </>
	    ) : (
	      <div
	        className={`${isDarkMain ? "dark " : ""}flex-1`}
	        style={{ opacity: suppressMenuFlash ? 0 : 1, pointerEvents: suppressMenuFlash ? "none" : "auto" }}
	      >
		        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-neutral-50 dark:bg-neutral-900 flex flex-col">
		          <QrHeader
		            orderType={orderType}
		            table={table}
		            onClose={handleCloseOrderPage}
		            t={t}
		            restaurantName={brandName}
		            searchValue={menuSearch}
		            onSearchChange={setMenuSearch}
		            searchPlaceholder={t("Search products")}
		          />

		          <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 lg:px-6 xl:px-8 pb-24">
		            <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-4 lg:gap-5 xl:gap-6 items-start">
		              {isDesktopLayout && (
		                <aside className="hidden xl:block sticky top-[76px] h-[calc(100vh-140px)]">
			                  <CartDrawer
		                    cart={safeCart}
		                    setCart={setCart}
		                    onSubmitOrder={handleSubmitOrder}
		                    orderType={orderType}
		                    paymentMethod={paymentMethod}
		                    setPaymentMethod={setPaymentMethod}
		                    submitting={submitting}
		                    onOrderAnother={orderType === "table" ? handleReset : handleOrderAnother}
		                    t={t}
		                    hasActiveOrder={hasActiveOrder}
		                    orderScreenStatus={orderScreenStatus}
		                    onShowStatus={() => {
		                      window.dispatchEvent(new Event("qr:cart-close"));
	                      const savedId = Number(storage.getItem("qr_active_order_id")) || null;
	                      if (!orderId && savedId) {
	                        setOrderId(savedId);
	                      }
	                      setOrderStatus("success");
	                      setShowStatus(true);
	                      storage.setItem("qr_show_status", "1");
	                    }}
	                    isOrderStatusOpen={showStatus}
	                    onOpenCart={() => {
	                      setShowStatus(false);
	                      storage.setItem("qr_show_status", "0");
	                    }}
	                    layout="panel"
	                  />
	                </aside>
		              )}

		              <section className="order-2 xl:order-none">
		                <div className="mb-4">
		                  <CategoryTopBar
		                    categories={categories}
		                    activeCategory={activeCategory}
		                    setActiveCategory={(cat) => {
		                      setActiveCategory(cat);
		                    }}
		                    categoryImages={categoryImages}
		                    onCategoryClick={() => {
		                      setMenuSearch("");
		                    }}
		                  />
		                </div>
		                <ProductGrid
		                  products={productsForGrid}
		                  onProductClick={(product) => {
		                    setSelectedProduct(product);
		                    setShowAddModal(true);
		                  }}
		                  t={t}
		                />
		              </section>
		            </div>
		          </div>

		        </div>
		      </div>
		    )}

    {!isDesktopLayout && (
	      <CartDrawer
	        cart={safeCart}
	        setCart={setCart}
	        onSubmitOrder={handleSubmitOrder}
	        orderType={orderType}
	        paymentMethod={paymentMethod}
	        setPaymentMethod={setPaymentMethod}
	        submitting={submitting}
	        onOrderAnother={orderType === "table" ? handleReset : handleOrderAnother}
	        t={t}
	        hasActiveOrder={hasActiveOrder}
	        orderScreenStatus={orderScreenStatus}
	        onShowStatus={() => {
	          window.dispatchEvent(new Event("qr:cart-close"));
          const savedId = Number(storage.getItem("qr_active_order_id")) || null;
          if (!orderId && savedId) {
            setOrderId(savedId);
          }
          setOrderStatus("success");
          setShowStatus(true);
          storage.setItem("qr_show_status", "1");
        }}
        isOrderStatusOpen={showStatus}
        onOpenCart={() => {
          setShowStatus(false);
          storage.setItem("qr_show_status", "0");
        }}
      />
    )}

	    <AddToCartModal
	      open={showAddModal}
	      product={selectedProduct}
	      extrasGroups={safeExtrasGroups}
	      onClose={() => {
	        setShowAddModal(false);
	        setReturnHomeAfterAdd(false);
	      }}
	      onAddToCart={(item) => {
	  storage.setItem("qr_cart_auto_open", "0");
	  setCart((prev) => [...prev, item]);   // always append new line
	  setShowAddModal(false);
	  if (returnHomeAfterAdd) {
	    setReturnHomeAfterAdd(false);
	    setForceHome(true);
	    setShowDeliveryForm(false);
	    setShowTakeawayForm(false);
	  }
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
    deliveryEnabled={boolish(orderSelectCustomization?.delivery_enabled, true)}
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
          pickup_date: "",
          pickup_time: "",
          mode: "pickup",
          address: "",
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


    {suppressMenuFlash && (
      <div className="fixed inset-0 z-[120] bg-white" aria-hidden="true" />
    )}
  </>
);

}
