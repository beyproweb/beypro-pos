// src/pages/QrMenu.jsx
// src/pages/QrMenu.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import OrderStatusScreen, { useSocketIO as useOrderSocket } from "../components/OrderStatusScreen";
import ModernTableSelector from "../components/ModernTableSelector";
import MenuProductsSection from "../features/qrmenu/components/MenuProductsSection";
import ProductModal from "../features/qrmenu/components/modals/ProductModal";
import CartModal from "../features/qrmenu/components/modals/CartModal";
import CheckoutModal from "../features/qrmenu/components/modals/CheckoutModal";
import useQrMenuController from "../features/qrmenu/hooks/useQrMenuController";
import { VoiceOrderController } from "../features/voiceOrder";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { UtensilsCrossed, Soup, Bike, Phone, Share2, Search, Download, ChevronDown, Mic, Loader2 } from "lucide-react";
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
    "Shop Hours": "Shop Hours",
    "Shop Closed": "Shop Closed",
    Closed: "Closed",
    "Open now!": "Open now!",
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
    "Shop Hours": "Çalışma Saatleri",
    "Shop Closed": "Dükkan Kapalı",
    Closed: "Kapalı",
    "Open now!": "Şu an açık!",
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
  onVoiceStart,
  voiceListening,
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
        {onVoiceStart ? (
          <button
            type="button"
            onClick={onVoiceStart}
            aria-label={t("Voice Order")}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
              voiceListening
                ? "bg-emerald-600 text-white animate-pulse"
                : "bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-200 hover:bg-gray-200 dark:hover:bg-neutral-700"
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : null}
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
  onShopOpenChange,
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
  const [voiceListening, setVoiceListening] = React.useState(false);
  const [voiceTranscript, setVoiceTranscript] = React.useState("");
  const [voiceResult, setVoiceResult] = React.useState(null);
  const [voiceParsing, setVoiceParsing] = React.useState(false);
  const [showVoiceCard, setShowVoiceCard] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState("");
  const speechRecognitionRef = React.useRef(null);

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

  const qrLang = React.useMemo(() => {
    if (typeof window === "undefined") return "en";
    return (
      storage.getItem("beyproGuestLanguage") ||
      storage.getItem("beyproLanguage") ||
      "en"
    ).split("-")[0];
  }, []);

  const getSpeechRecognition = React.useCallback(() => {
    if (speechRecognitionRef.current !== null) return speechRecognitionRef.current;
    if (typeof window === "undefined") return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognitionRef.current = SR ? SR : null;
    return speechRecognitionRef.current;
  }, []);

  const parseVoiceTranscript = React.useCallback(
    async (text) => {
      if (!text) return;
      setVoiceParsing(true);
      setVoiceError("");
      setVoiceResult(null);
      setShowVoiceCard(true);
      try {
        const token = getStoredToken();
        const res = await fetch(`${API_URL}/voice/parse-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            restaurant_identifier: identifier,
            transcript: text,
            language: qrLang,
            order_type: "table",
            table_id: null,
          }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || "Voice parse failed");
        }
        const json = await res.json();
        setVoiceResult(json);
      } catch (err) {
        console.error("❌ QR voice parse failed", err);
        setVoiceError(err?.message || "Voice parsing failed");
      } finally {
        setVoiceParsing(false);
      }
    },
    [identifier, qrLang]
  );

  const handleVoiceStart = React.useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) {
      setVoiceError(t("Voice recognition not supported in this browser"));
      setShowVoiceCard(true);
      return;
    }
    setVoiceTranscript("");
    setVoiceResult(null);
    setShowVoiceCard(true);
    const rec = new SR();
    rec.lang = qrLang || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => setVoiceListening(true);
    rec.onerror = (e) => {
      setVoiceListening(false);
      setVoiceError(e.error || "Mic error");
    };
    rec.onend = () => setVoiceListening(false);
    rec.onresult = (evt) => {
      const text = Array.from(evt.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      setVoiceTranscript(text);
      if (text) parseVoiceTranscript(text);
    };
    try {
      rec.start();
    } catch (err) {
      setVoiceListening(false);
      setVoiceError(err?.message || "Mic start failed");
    }
  }, [getSpeechRecognition, parseVoiceTranscript, qrLang, t]);

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
  const [loyaltyEligibleOrderId, setLoyaltyEligibleOrderId] = React.useState(
    () => storage.getItem("qr_loyalty_eligible_order_id") || ""
  );
  const [loyaltyStampedOrderId, setLoyaltyStampedOrderId] = React.useState(
    () => storage.getItem("qr_loyalty_stamped_order_id") || ""
  );
  const canStampLoyalty =
    Boolean(loyaltyEligibleOrderId) &&
    String(loyaltyEligibleOrderId) !== String(loyaltyStampedOrderId || "");

  React.useEffect(() => {
    const sync = () => {
      setLoyaltyEligibleOrderId(storage.getItem("qr_loyalty_eligible_order_id") || "");
      setLoyaltyStampedOrderId(storage.getItem("qr_loyalty_stamped_order_id") || "");
    };
    sync();
    window.addEventListener("qr:loyalty-change", sync);
    return () => window.removeEventListener("qr:loyalty-change", sync);
  }, []);
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
    if (!canStampLoyalty) return;
    try {
      const res = await fetch(`${API_URL}/public/loyalty/${encodeURIComponent(identifier)}/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: deviceId, points: 1 })
      });
      const data = await res.json();
      if (res.ok && typeof data.points !== 'undefined') {
        setLoyalty((s) => ({ ...s, points: Number(data.points) }));
        try {
          storage.setItem("qr_loyalty_stamped_order_id", String(loyaltyEligibleOrderId));
          window.dispatchEvent(new Event("qr:loyalty-change"));
        } catch {}
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

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [shopHours, setShopHours] = React.useState({});
  const [loadingShopHours, setLoadingShopHours] = React.useState(true);
  const [showShopHoursDropdown, setShowShopHoursDropdown] = React.useState(false);
  const shopHoursDropdownRef = React.useRef(null);

  const todayName = React.useMemo(() => {
    const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return map[new Date().getDay()];
  }, []);

  const parseTimeToMinutes = React.useCallback((value) => {
    const s = String(value || "").trim();
    if (!s) return null;
    const [hh, mm] = s.split(":").map((part) => Number(part));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }, []);

  const openStatus = React.useMemo(() => {
    const today = shopHours?.[todayName];
    const openMin = parseTimeToMinutes(today?.open);
    const closeMin = parseTimeToMinutes(today?.close);
    if (openMin === null || closeMin === null) {
      return { isOpen: false, label: t("Closed") };
    }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    if (closeMin > openMin) {
      const isOpen = nowMin >= openMin && nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed") };
    }

    if (closeMin < openMin) {
      const isOpen = nowMin >= openMin || nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed") };
    }

    return { isOpen: false, label: t("Closed") };
  }, [parseTimeToMinutes, shopHours, t, todayName]);

  React.useEffect(() => {
    onShopOpenChange?.(openStatus.isOpen);
  }, [onShopOpenChange, openStatus.isOpen]);

  React.useEffect(() => {
    const onDown = (e) => {
      const el = shopHoursDropdownRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setShowShopHoursDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  React.useEffect(() => {
    let active = true;

    const loadShopHours = async ({ withSpinner = false } = {}) => {
      if (withSpinner && active) setLoadingShopHours(true);
      try {
        const token = getStoredToken();
        if (!token) throw new Error("Missing token");
        const data = await secureFetch("/settings/shop-hours/all", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!active) return;
        const hoursMap = {};
        if (Array.isArray(data)) {
          data.forEach((row) => {
            hoursMap[row.day] = { open: row.open_time, close: row.close_time };
          });
        }
        setShopHours(hoursMap);
      } catch (err) {
        if (active) setShopHours({});
      } finally {
        if (withSpinner && active) setLoadingShopHours(false);
      }
    };

    loadShopHours({ withSpinner: true });
    const pollId = window.setInterval(() => {
      loadShopHours({ withSpinner: false });
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadShopHours({ withSpinner: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
              <div className="inline-flex items-center" ref={shopHoursDropdownRef}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowShopHoursDropdown((v) => !v)}
                    className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm text-[11px] font-medium transition ${
                      openStatus.isOpen
                        ? "bg-emerald-50/80 text-emerald-700 border-emerald-200 hover:bg-emerald-100/80 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-900/40"
                        : "bg-rose-50/80 text-rose-700 border-rose-200 hover:bg-rose-100/80 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-900/40"
                    }`}
                    aria-label={t("Shop Hours")}
                    title={t("Shop Hours")}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${openStatus.isOpen ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span>{openStatus.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showShopHoursDropdown ? "rotate-180" : ""}`}
                    />
                  </button>

                  {showShopHoursDropdown && (
                    <div className="absolute left-0 top-[calc(100%+10px)] w-[320px] rounded-2xl border border-gray-200 bg-white/95 dark:bg-neutral-950/90 shadow-2xl backdrop-blur p-3 z-20">
                      <div className="flex items-center justify-between gap-2 px-1 pb-2">
                        <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                          {t("Shop Hours")}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowShopHoursDropdown(false)}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 text-lg leading-none"
                          aria-label={t("Close")}
                        >
                          ×
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-1">
                        {days.map((day) => {
                          const isToday = day === todayName;
                          const open = shopHours?.[day]?.open || "";
                          const close = shopHours?.[day]?.close || "";
                          const has = !!(open && close);
                          return (
                            <div
                              key={day}
                              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                                isToday
                                  ? "bg-indigo-50 text-indigo-800 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/30 dark:text-indigo-200"
                                  : "bg-gray-50/80 text-gray-700 dark:bg-neutral-900/40 dark:text-neutral-200"
                              }`}
                            >
                              <span className="font-semibold">{t(day)}</span>
                              <span className="font-mono text-xs">
                                {loadingShopHours ? "…" : has ? `${open} - ${close}` : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
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
            onClick={() => openStatus.isOpen && onSelect("takeaway")}
            disabled={!openStatus.isOpen}
            className={`min-w-0 px-2 py-4 sm:py-5 rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 ${
              openStatus.isOpen
                ? "bg-gray-900 text-white hover:shadow-lg hover:-translate-y-1"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
          >
            <UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {openStatus.isOpen ? t("Pre Order") : t("Shop Closed")}
            </span>
          </button>
          <button
            onClick={() => openStatus.isOpen && onSelect("table")}
            disabled={!openStatus.isOpen}
            className={`min-w-0 px-2 py-4 sm:py-5 rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 ${
              openStatus.isOpen
                ? "bg-gray-800 text-white hover:shadow-lg hover:-translate-y-1"
                : "bg-gray-300 text-gray-600 cursor-not-allowed"
            }`}
          >
            <Soup className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {openStatus.isOpen ? t("Table Order") : t("Shop Closed")}
            </span>
          </button>
          <button
            onClick={() => allowDelivery && openStatus.isOpen && onSelect("online")}
            disabled={!allowDelivery || !openStatus.isOpen}
            className={`min-w-0 px-2 py-4 sm:py-5 rounded-2xl shadow-md transition-all flex flex-col items-center justify-center gap-2 ${
              allowDelivery && openStatus.isOpen
                ? "bg-red-600 hover:shadow-lg hover:-translate-y-1"
                : "bg-red-200 text-red-600 cursor-not-allowed"
            }`}
          >
            <Bike className={`w-5 h-5 sm:w-6 sm:h-6 ${allowDelivery ? "text-white" : "text-red-600"}`} />
            <span className="text-[10px] sm:text-xs leading-tight text-center font-semibold tracking-wide break-words">
              {allowDelivery && openStatus.isOpen ? t("Delivery") : t("Shop Closed")}
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
	            <div className="relative flex items-center gap-2">
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
                <button
                  type="button"
                  onClick={handleVoiceStart}
                  className={`ml-3 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow ${
                    voiceListening
                      ? "bg-emerald-600 text-white animate-pulse"
                      : "bg-white border border-gray-200 text-gray-800 hover:bg-gray-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("Voice Order")}</span>
                </button>
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
              disabled={!canStampLoyalty}
              className={`px-4 py-2 rounded-full text-white font-semibold shadow transition ${
                canStampLoyalty ? "hover:opacity-90" : "opacity-50 cursor-not-allowed"
              }`}
            >
              Stamp my card
            </button>
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

function OrderTypePromptModal({
  product,
  onSelect,
  onClose,
  t,
  deliveryEnabled = true,
  shopIsOpen = true,
}) {
  const productName = String(product?.name || "").trim();
  const isGeneric = !productName;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 py-6">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-400">{t("Order Type")}</p>
            <h3 className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              {isGeneric ? t("Select Order Type") : productName}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-300">
              {isGeneric
                ? t("Choose how you'd like to continue.")
                : t("Select how you'd like to order this item.")}
            </p>
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
            onClick={() => shopIsOpen && onSelect?.("takeaway")}
            disabled={!shopIsOpen}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition ${
              shopIsOpen
                ? "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-100 hover:border-neutral-900 dark:hover:border-white hover:text-neutral-900"
                : "border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed"
            }`}
          >
            <UtensilsCrossed className="w-5 h-5" />
            {shopIsOpen ? t("Pre Order") : t("Shop Closed")}
          </button>
          <button
            onClick={() => shopIsOpen && onSelect?.("table")}
            disabled={!shopIsOpen}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg transition ${
              shopIsOpen
                ? "border-neutral-200 dark:border-neutral-700 bg-gradient-to-r from-neutral-900 to-neutral-700 text-white hover:opacity-95"
                : "border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed shadow-sm"
            }`}
          >
            <Soup className="w-5 h-5" />
            {shopIsOpen ? t("Table Order") : t("Shop Closed")}
          </button>
          {deliveryEnabled ? (
            <button
              onClick={() => shopIsOpen && onSelect?.("online")}
              disabled={!shopIsOpen}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg transition ${
                shopIsOpen
                  ? "border-neutral-200 dark:border-neutral-700 bg-red-600 text-white hover:bg-red-500"
                  : "border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed shadow-sm"
              }`}
            >
              <Bike className="w-5 h-5" />
              {shopIsOpen ? t("Delivery") : t("Shop Closed")}
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
  const { slug, id } = useParams();
  const {
    restaurantIdentifier,
    lang,
    setLang,
    t,
    showHelp,
    setShowHelp,
    platform,
    table,
    setTable,
    categories,
    activeCategory,
    categoryImages,
    cart,
    setCart,
    selectedProduct,
    showAddModal,
    setShowAddModal,
    showStatus,
    setShowStatus,
    orderStatus,
    setOrderStatus,
    orderId,
    setOrderId,
    tables,
    isDarkMain,
    submitting,
    safeExtrasGroups,
    safeCart,
    safeProducts,
    safeOccupiedTables,
    hasActiveOrder,
    productsForGrid,
    paymentMethod,
    setPaymentMethod,
    orderType,
    setOrderType,
    showTakeawayForm,
    setShowTakeawayForm,
    orderSelectCustomization,
    setOrderSelectCustomization,
    showDeliveryForm,
    setShowDeliveryForm,
    pendingPopularProduct,
    setPendingPopularProduct,
    returnHomeAfterAdd,
    setReturnHomeAfterAdd,
    forceHome,
    setForceHome,
    showOrderTypePrompt,
    setShowOrderTypePrompt,
    shopIsOpen,
    setShopIsOpen,
    suppressMenuFlash,
    showTableScanner,
    tableScanTarget,
    tableScanError,
    menuSearch,
    setMenuSearch,
    qrVoiceListening,
    qrVoiceParsing,
    qrVoiceTranscript,
    setQrVoiceTranscript,
    qrVoiceResult,
    qrVoiceError,
    qrVoiceModalOpen,
    setQrVoiceModalOpen,
    setTakeaway,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    canInstall,
    isDesktopLayout,
    appendIdentifier,
    triggerOrderType,
    handlePopularProductClick,
    handleMenuCategorySelect,
    handleMenuCategoryClick,
    handleMenuProductOpen,
    parseQrVoiceTranscript,
    startQrVoiceCapture,
    injectQrVoiceItemsToCart,
    openTableScanner,
    closeTableScanner,
    resetToTypePicker,
    handleCloseOrderPage,
    handleOrderAnother,
    handleSubmitOrder,
    handleReset,
    handleInstallClick,
    handleDownloadQr,
    showHome,
    showTableSelector,
    filteredOccupied,
    brandName,
    lastError,
    orderCancelReason,
    orderScreenStatus,
    setCustomerInfo,
  } = useQrMenuController({
    slug,
    id,
    QR_TOKEN_KEY,
    API_URL,
    API_BASE,
    BEYPRO_APP_STORE_URL,
    BEYPRO_PLAY_STORE_URL,
    storage,
    toArray,
    boolish,
    parseRestaurantIdFromIdentifier,
    getStoredToken,
    getQrModeFromLocation,
    getTableFromLocation,
    makeT,
    getPlatform,
    saveSelectedTable,
    extractTableNumberFromQrText,
  });

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

  const handleVoiceDraftAddToCart = useCallback(
    ({ product, productId, name, qty, unitPrice, extras, notes }) => {
      const resolvedQty = Math.max(1, Number(qty) || 1);
      const resolvedProduct = product || safeProducts.find((it) => String(it?.id) === String(productId)) || null;
      const resolvedExtras = (Array.isArray(extras) ? extras : []).map((extra, index) => ({
        ...(extra || {}),
        key:
          extra?.key ||
          extra?.id ||
          extra?.extraId ||
          `${extra?.name || "extra"}-${index}`,
        id: extra?.id ?? extra?.extraId ?? extra?.key ?? `${extra?.name || "extra"}-${index}`,
        name: extra?.name || "",
        price: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
        extraPrice: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
        quantity: Math.max(1, Number(extra?.quantity) || 1),
      }));
      storage.setItem("qr_cart_auto_open", "1");
      setCart((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: resolvedProduct?.id ?? productId ?? null,
          name: resolvedProduct?.name || name || t("Unknown product"),
          image: resolvedProduct?.image || null,
          price: Number(resolvedProduct?.price ?? unitPrice ?? 0) || 0,
          quantity: resolvedQty,
          extras: resolvedExtras,
          note: notes || "",
          unique_id: `${resolvedProduct?.id || productId || "voice"}-waiter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        },
      ]);
    },
    [safeProducts, setCart, storage, t]
  );

  const handleVoiceDraftConfirmOrder = useCallback(async (draftItems = [], options = {}) => {
    if (typeof handleSubmitOrder === "function") {
      const directItems = (Array.isArray(draftItems) ? draftItems : []).map((item, index) => ({
        id: item?.productId ?? null,
        product_id: item?.productId ?? null,
        name: item?.name || t("Unknown product"),
        quantity: Math.max(1, Number(item?.qty) || 1),
        price: Number(item?.unitPrice) || 0,
        extras: (Array.isArray(item?.extras) ? item.extras : []).map((extra, extraIndex) => ({
          ...extra,
          key: extra?.key || `${extra?.name || "extra"}-${extraIndex}`,
          name: extra?.name || "",
          quantity: Math.max(1, Number(extra?.quantity) || 1),
          price: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
          extraPrice: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
        })),
        note: item?.notes || "",
        unique_id:
          item?.key ||
          `${item?.productId || "voice"}-direct-${Date.now().toString(36)}-${index}`,
      }));
      await handleSubmitOrder(directItems, {
        paymentMethodOverride:
          typeof options?.paymentMethodOverride === "string"
            ? options.paymentMethodOverride
            : undefined,
      });
    }
  }, [handleSubmitOrder, t]);

  const handleVoiceRequireOrderType = useCallback(() => {
    setShowStatus(false);
    setShowDeliveryForm(false);
    setShowTakeawayForm(false);
    setShowOrderTypePrompt(true);
    setPendingPopularProduct(null);
    setOrderType(null);
    setTable(null);
    setForceHome(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [
    setForceHome,
    setOrderType,
    setTable,
    setPendingPopularProduct,
    setShowDeliveryForm,
    setShowOrderTypePrompt,
    setShowStatus,
    setShowTakeawayForm,
  ]);

  if (showTableSelector) {
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
            onShopOpenChange={setShopIsOpen}
            canInstall={canInstall}
            showHelp={showHelp}
            setShowHelp={setShowHelp}
            platform={platform}
            onPopularClick={handlePopularProductClick}
            onCustomizationLoaded={(next) =>
              setOrderSelectCustomization((prev) => ({ ...prev, ...(next || {}) }))
            }
          />

          {!orderType && showOrderTypePrompt && (
            <OrderTypePromptModal
              product={pendingPopularProduct}
              t={t}
              shopIsOpen={shopIsOpen}
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
              onVoiceStart={orderType === "table" ? startQrVoiceCapture : null}
              voiceListening={qrVoiceListening}
            />

            <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 lg:px-6 xl:px-8 pb-24">
              <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-4 lg:gap-5 xl:gap-6 items-start">
                {isDesktopLayout && (
                  <aside className="hidden xl:block sticky top-[76px] h-[calc(100vh-140px)]">
                    <CartModal
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
                      storage={storage}
                    />
                  </aside>
                )}

                <MenuProductsSection
                  categories={categories}
                  activeCategory={activeCategory}
                  categoryImages={categoryImages}
                  products={productsForGrid}
                  onSelectCategory={handleMenuCategorySelect}
                  onCategoryClick={handleMenuCategoryClick}
                  onOpenProduct={handleMenuProductOpen}
                  t={t}
                  apiUrl={API_URL}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {!isDesktopLayout && (
        <CartModal
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
          storage={storage}
        />
      )}

      <VoiceOrderController
        restaurantId={restaurantIdentifier || id || slug}
        tableId={table}
        products={safeProducts}
        onAddToCart={handleVoiceDraftAddToCart}
        onConfirmOrder={orderType ? handleVoiceDraftConfirmOrder : undefined}
        language={lang}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        canStartVoiceOrder={Boolean(orderType) && !showHome}
        onRequireOrderType={handleVoiceRequireOrderType}
      />

      {qrVoiceModalOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 p-5 space-y-4 dark:bg-neutral-900 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center dark:bg-indigo-950/30">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-neutral-100">
                    {t("Voice order")}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    {qrVoiceListening
                      ? t("Listening…")
                      : qrVoiceParsing
                        ? t("Parsing…")
                        : t("Review and confirm")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setQrVoiceModalOpen(false)}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-200 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {t("Close")}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-neutral-300">
                {t("Transcript")}
              </label>
              <textarea
                value={qrVoiceTranscript}
                onChange={(e) => setQrVoiceTranscript(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100"
                placeholder={t("Press the mic and speak, or type here…")}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={startQrVoiceCapture}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-60"
                  disabled={qrVoiceListening || qrVoiceParsing}
                >
                  {qrVoiceListening ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {t("Speak again")}
                </button>
                <button
                  type="button"
                  onClick={() => parseQrVoiceTranscript(qrVoiceTranscript)}
                  className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-gray-800 disabled:opacity-60"
                  disabled={!qrVoiceTranscript || qrVoiceParsing}
                >
                  {qrVoiceParsing ? t("Parsing…") : t("Parse")}
                </button>
              </div>
              {qrVoiceError ? (
                <div className="rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm border border-rose-100 dark:bg-rose-900/30 dark:text-rose-100 dark:border-rose-800/50">
                  {qrVoiceError}
                </div>
              ) : null}
            </div>

            {!qrVoiceParsing && qrVoiceResult ? (
              <div className="space-y-3">
                {qrVoiceResult.clarification_required ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-100">
                    {qrVoiceResult.clarification_question || t("We need clarification.")}
                  </div>
                ) : null}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                  <div className="text-xs font-semibold text-gray-500 mb-2 dark:text-neutral-300">
                    {t("We understood")}:
                  </div>
                  <ul className="space-y-2">
                    {(qrVoiceResult.items || []).map((it, idx) => (
                      <li
                        key={idx}
                        className="rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm flex flex-col gap-1 shadow-sm dark:bg-neutral-800 dark:border-neutral-700"
                      >
                        <div className="font-semibold text-gray-800 dark:text-neutral-100">
                          {it.quantity}x {it.product_name}
                        </div>
                        {it.size ? (
                          <div className="text-xs text-gray-500">
                            {t("Size")}: {it.size}
                          </div>
                        ) : null}
                        {Array.isArray(it.modifiers) && it.modifiers.length > 0 ? (
                          <div className="text-xs text-gray-600 dark:text-neutral-300">
                            {it.modifiers.map((m, i) => (
                              <span key={i} className="inline-block mr-2">
                                {m.type === "remove" ? "-" : "+"}
                                {m.value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => injectQrVoiceItemsToCart(qrVoiceResult.items)}
                    className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold shadow hover:bg-emerald-700"
                    disabled={!qrVoiceResult.items || qrVoiceResult.items.length === 0}
                  >
                    {t("Confirm order")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <ProductModal
        open={showAddModal}
        product={selectedProduct}
        extrasGroups={safeExtrasGroups}
        onClose={() => {
          setShowAddModal(false);
          setReturnHomeAfterAdd(false);
        }}
        onAddToCart={(item) => {
          storage.setItem("qr_cart_auto_open", "0");
          setCart((prev) => [...prev, item]);
          setShowAddModal(false);
          if (returnHomeAfterAdd) {
            setReturnHomeAfterAdd(false);
            setForceHome(true);
            setShowDeliveryForm(false);
            setShowTakeawayForm(false);
          }
        }}
        t={t}
        apiUrl={API_URL}
      />

      {statusPortal}

      {orderType === "online" && showDeliveryForm && (
        <CheckoutModal
          submitting={submitting}
          t={t}
          appendIdentifier={appendIdentifier}
          storage={storage}
          onClose={() => {
            setShowDeliveryForm(false);
            setOrderType(null);
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
            setOrderType(null);
          }}
          onSubmit={(form) => {
            if (!form) {
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
