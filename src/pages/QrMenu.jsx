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
import {
  UtensilsCrossed,
  Soup,
  Bike,
  Phone,
  Share2,
  Search,
  Download,
  ChevronDown,
  Mic,
  RotateCcw,
  Loader2,
  Bell,
  ShoppingCart,
  Sparkles,
  Instagram,
  Music2,
  Globe,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { io } from "socket.io-client";

function normalizeRestaurantDisplayName(value, fallback = "Restaurant") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const withoutBrandPrefix = raw.replace(/^(beypro\s+(qr\s+menu|pos)\s*[-:|]\s*)/i, "").trim();
  const candidate = withoutBrandPrefix || raw;

  if (candidate.includes("+")) {
    const [head] = candidate.split("+");
    const trimmed = String(head || "").trim();
    return trimmed || candidate;
  }

  return candidate;
}

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
const isCancelledLikeStatus = (status) =>
  ["canceled", "cancelled", "deleted", "void"].includes(
    String(status || "").toLowerCase()
  );
const hasReservationPayload = (order) => {
  if (!order || typeof order !== "object") return false;
  const nested =
    order?.reservation && typeof order.reservation === "object" ? order.reservation : null;
  return Boolean(
    order?.reservation_id ||
      order?.reservationId ||
      order?.reservation_date ||
      order?.reservationDate ||
      order?.reservation_time ||
      order?.reservationTime ||
      nested?.id ||
      nested?.reservation_id ||
      nested?.reservationId ||
      nested?.reservation_date ||
      nested?.reservationDate ||
      nested?.reservation_time ||
      nested?.reservationTime
  );
};

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

function readQrTableShowAreasSetting(restaurantIdentifier) {
  if (typeof window === "undefined") return true;
  try {
    const native = window.localStorage;
    if (!native) return true;
    const candidates = [
      String(native.getItem("restaurant_id") || "").trim(),
      String(native.getItem("restaurant_slug") || "").trim(),
      String(restaurantIdentifier || "").trim(),
    ].filter((value) => value && value !== "undefined" && value !== "null");

    const visited = new Set();
    for (const tenant of candidates) {
      if (visited.has(tenant)) continue;
      visited.add(tenant);
      const raw = native.getItem(`beypro:settings:${tenant}:tables`);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "showAreas" in parsed) {
        return parsed.showAreas !== false;
      }
    }
  } catch {
    // ignore and fall back to default
  }
  return true;
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

const CategorySlider = React.memo(function CategorySlider({
  categories,
  activeCategory,
  onCategorySelect,
  categoryImages,
  apiUrl,
}) {
  const sliderRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const normalizedCategories = useMemo(() => (Array.isArray(categories) ? categories : []), [categories]);
  const updateScrollState = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    setCanScroll({
      left: scrollLeft > 10,
      right: scrollLeft + clientWidth < scrollWidth - 10,
    });
  }, []);

  const scrollToCategory = useCallback(
    (index) => {
      const el = sliderRef.current;
      if (!el || index < 0 || index >= el.children.length) return;
      const button = el.children[index];
      const buttonRect = button.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      const offset =
        buttonRect.left -
        containerRect.left -
        containerRect.width / 2 +
        buttonRect.width / 2;
      el.scrollBy({ left: offset, behavior: "smooth" });
    },
    []
  );

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    updateScrollState();
    const handleResize = () => updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", handleResize);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateScrollState]);

  useEffect(() => {
    if (!activeCategory) return;
    const idx = normalizedCategories.findIndex((cat) => cat === activeCategory);
    if (idx >= 0) {
      scrollToCategory(idx);
    }
  }, [activeCategory, normalizedCategories, scrollToCategory]);

  const handleArrow = useCallback(
    (direction) => {
      const el = sliderRef.current;
      if (!el) return;
      const step = Math.max(el.clientWidth * 0.65, 180);
      el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
    },
    []
  );

  const categoryFallbackSrc = "/Beylogo.svg";

  return (
    <div className="relative">
      <div
        ref={sliderRef}
        className="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide px-0.5"
        style={{ scrollBehavior: "smooth" }}
      >
        {normalizedCategories.map((cat, idx) => {
          const key = (cat || "").trim().toLowerCase();
          const imgSrc = categoryImages?.[key];
          const resolvedSrc = imgSrc
            ? /^https?:\/\//.test(String(imgSrc))
              ? String(imgSrc)
              : `${apiUrl}/uploads/${String(imgSrc).replace(/^\/?uploads\//, "")}`
            : "";
          const active = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onCategorySelect?.(cat);
                scrollToCategory(idx);
              }}
              className={`flex-none w-32 min-w-[120px] rounded-2xl border bg-white/90 dark:bg-neutral-900/75 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                active
                  ? "border-gray-900 text-gray-900 dark:border-white dark:text-white"
                  : "border-gray-200 text-gray-700 dark:border-neutral-800 dark:text-neutral-200"
              }`}
            >
              <div className="p-3 flex flex-col items-center gap-2">
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
                <span className="text-xs font-semibold leading-tight text-center truncate">{cat}</span>
              </div>
            </button>
          );
        })}
      </div>
      {canScroll.left && (
        <button
          type="button"
          onClick={() => handleArrow("left")}
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
          aria-label="Scroll categories left"
        >
          <ChevronLeft className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
        </button>
      )}
      {canScroll.right && (
        <button
          type="button"
          onClick={() => handleArrow("right")}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur transition hover:bg-white dark:bg-neutral-900/80"
          aria-label="Scroll categories right"
        >
          <ChevronRight className="w-4 h-4 text-neutral-800 dark:text-neutral-100" />
        </button>
      )}
    </div>
  );
});

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

function parsePositiveTableNumber(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function decodeJwtPayload(token) {
  try {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    if (typeof atob !== "function") return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function extractTableFromParams(params) {
  if (!params) return null;
  const keys = ["table", "table_number", "tableNumber", "tableNo", "t", "masa", "no"];
  for (const key of keys) {
    const parsed = parsePositiveTableNumber(params.get(key));
    if (parsed) return parsed;
  }

  const token =
    params.get("token") ||
    params.get("qr_token") ||
    params.get("jwt") ||
    params.get("table_token");
  if (token) {
    const payload = decodeJwtPayload(token);
    const fromPayload =
      parsePositiveTableNumber(payload?.table_number) ||
      parsePositiveTableNumber(payload?.tableNumber) ||
      parsePositiveTableNumber(payload?.table);
    if (fromPayload) return fromPayload;
  }

  return null;
}

// Read table number from current URL (for table QR links)
function getTableFromLocation() {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromSearch = extractTableFromParams(params);
    if (fromSearch) return fromSearch;

    const hash = String(window.location.hash || "");
    if (hash.includes("?")) {
      const hashParams = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
      const fromHash = extractTableFromParams(hashParams);
      if (fromHash) return fromHash;
    }

    const path = String(window.location.pathname || "");
    const pathMatch = path.match(/\/(?:table|tables|masa)\/(\d+)(?:\/|$)/i);
    if (pathMatch) return parsePositiveTableNumber(pathMatch[1]);
  } catch {
    return null;
  }
  return null;
}

function extractTableNumberFromQrText(raw) {
  if (!raw) return null;
  const text = String(raw).trim().replace(/^['"]|['"]$/g, "");
  if (!text) return null;

  const parseFromUrlLike = (value) => {
    const url = new URL(value);

    const fromQuery = extractTableFromParams(url.searchParams);
    if (fromQuery) return fromQuery;

    const pathMatch = String(url.pathname || "").match(
      /\/(?:table|tables|masa)\/(\d+)(?:\/|$)/i
    );
    if (pathMatch) return parsePositiveTableNumber(pathMatch[1]);

    const hash = String(url.hash || "");
    if (hash.includes("?")) {
      const hashParams = new URLSearchParams(hash.slice(hash.indexOf("?") + 1));
      const fromHash = extractTableFromParams(hashParams);
      if (fromHash) return fromHash;
    }

    return null;
  };

  try {
    const fromUrl = parseFromUrlLike(text);
    if (fromUrl) return fromUrl;
  } catch {
    // maybe missing scheme; try using current origin
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "https://pos.beypro.com";
      const fromRelativeUrl = parseFromUrlLike(new URL(text, base).toString());
      if (fromRelativeUrl) return fromRelativeUrl;
    } catch {
      // not URL-like
    }
  }

  const explicitParamMatch = text.match(
    /(?:table_number|tableNumber|tableNo|table|masa|t)\s*[:=#\s_-]*\s*(\d{1,4})/i
  );
  if (explicitParamMatch) {
    const parsed = parsePositiveTableNumber(explicitParamMatch[1]);
    if (parsed) return parsed;
  }

  const tokenMatch = text.match(/(?:token|qr_token|jwt|table_token)\s*[:=#]\s*([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)/);
  if (tokenMatch) {
    const payload = decodeJwtPayload(tokenMatch[1]);
    const fromPayload =
      parsePositiveTableNumber(payload?.table_number) ||
      parsePositiveTableNumber(payload?.tableNumber) ||
      parsePositiveTableNumber(payload?.table);
    if (fromPayload) return fromPayload;
  }

  const fallback = parsePositiveTableNumber(text);
  if (fallback) return fallback;
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
    Information: "Information",
    Date: "Date",
    "Select Order Type": "Select Order Type",
    "Choose how you'd like to continue.": "Choose how you'd like to continue.",
    "Select how you'd like to order this item.": "Select how you'd like to order this item.",
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
    "Order Again": "Order Again",
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
    Guests: "Guests",
    "Select Guests": "Select Guests",
    "Select guests": "Select guests",
    "Select guests first": "Select guests first",
    "Choose guest amount first": "Choose guest amount first",
    "Select guests on a table card to enable QR scan": "Select guests on a table card to enable QR scan",
    "Select Your Table": "Select Your Table",
    Seats: "Seats",
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
    "Pickup / Reservation Date": "Pickup / Reservation Date",
    "Pickup / Reservation": "Pickup / Reservation",
    Reservation: "Reservation",
    Reserved: "Reserved",
    "Reservation Time": "Reservation Time",
    "Select Table": "Select Table",
    "Please select an available table.": "Please select an available table.",
    "This table is currently occupied. Please select another table.": "This table is currently occupied. Please select another table.",
    "Reservation saved": "Reservation saved",
    "Failed to save reservation": "Failed to save reservation",
    "Table must be closed by staff first": "Table must be closed by staff first",
    Pickup: "Pickup",
    "Call Us": "Call Us",
    "Call Waiter": "Call Waiter",
    "Calling Waiter...": "Calling Waiter...",
    "Waiter notified!": "Waiter notified!",
    "Please wait before calling again.": "Please wait before calling again.",
    "Unable to call waiter right now.": "Unable to call waiter right now.",
    "AI Order": "AI Order",
    Share: "Share",
    Search: "Search",
    "Voice Order": "Voice Order",
    Categories: "Categories",
    "Loyalty Card": "Loyalty Card",
    "Stamp my card": "Stamp my card",
    Reward: "Reward",
    "Free Menu Item": "Free Menu Item",
    "Popular This Week": "Popular This Week",
    "What our guests say": "What our guests say",
    "No reviews yet.": "No reviews yet.",
    Featured: "Featured",
    "Order Status": "Order Status",
    "Order received": "Order received",
    "Order ready": "Order ready",
    "Order Cancelled": "Order Cancelled",
    Status: "Status",
    Items: "Items",
    Unpaid: "Unpaid",
    Unknown: "Unknown",
    Cancelled: "Cancelled",
    Order: "Order",
    Online: "Online",
    Card: "Card",
    Split: "Split",
    Back: "Back",
    Item: "Item",
    Restaurant: "Restaurant",
    New: "New",
    Confirmed: "Confirmed",
    Pending: "Pending",
    Open: "Open",
    Completed: "Completed",
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
    "Delivery Closed": "Delivery Closed",
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
    Information: "Bilgi",
    Date: "Tarih",
    "Select Order Type": "Sipariş Türü Seçin",
    "Choose how you'd like to continue.": "Nasıl devam etmek istediğinizi seçin.",
    "Select how you'd like to order this item.": "Bu ürünü nasıl sipariş etmek istediğinizi seçin.",
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
    "Order Again": "Tekrar Sipariş Ver",
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
    Guests: "Misafir",
    "Select Guests": "Misafir Seçin",
    "Select guests": "Misafir seçin",
    "Select guests first": "Önce misafir seçin",
    "Choose guest amount first": "Önce misafir sayısını seçin",
    "Select guests on a table card to enable QR scan": "QR taramayı açmak için masa kartında misafir seçin",
    "Select Your Table": "Masanızı Seçin",
    Seats: "Kişilik",
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
    "Pickup / Reservation Date": "Alış / Rezervasyon Tarihi",
    "Pickup / Reservation": "Alış / Rezervasyon",
    Reservation: "Rezervasyon",
    Reserved: "Rezerve",
    "Reservation Time": "Rezervasyon Saati",
    "Select Table": "Masa Seçin",
    "Please select an available table.": "Lütfen uygun bir masa seçin.",
    "This table is currently occupied. Please select another table.": "Bu masa şu anda dolu. Lütfen başka bir masa seçin.",
    "Reservation saved": "Rezervasyon kaydedildi",
    "Failed to save reservation": "Rezervasyon kaydedilemedi",
    "Table must be closed by staff first": "Önce personel masayı kapatmalıdır",
    Pickup: "Gel Al",
    "Call Us": "Bizi Ara",
    "Call Waiter": "Garson Çağır",
    "Calling Waiter...": "Garson Çağırılıyor...",
    "Waiter notified!": "Garsona haber verildi!",
    "Please wait before calling again.": "Lütfen tekrar çağırmadan önce bekleyin.",
    "Unable to call waiter right now.": "Şu anda garson çağrılamıyor.",
    "AI Order": "YZ Siparis",
    Share: "Paylaş",
    Search: "Ara",
    "Voice Order": "Sesli Sipariş",
    Categories: "Kategoriler",
    "Loyalty Card": "Sadakat Kartı",
    "Stamp my card": "Kartımı damgala",
    Reward: "Ödül",
    "Free Menu Item": "Ücretsiz Menü Ürünü",
    "Popular This Week": "Bu Haftanın Popülerleri",
    "What our guests say": "Misafirlerimiz ne diyor",
    "No reviews yet.": "Henüz yorum yok.",
    Featured: "Öne Çıkan",
    "Order Status": "Sipariş Durumu",
    "Order received": "Sipariş alındı",
    "Order ready": "Sipariş hazır",
    "Order Cancelled": "Sipariş iptal edildi",
    Status: "Durum",
    Items: "Ürünler",
    Unpaid: "Ödenmedi",
    Unknown: "Bilinmiyor",
    Cancelled: "İptal edildi",
    Order: "Sipariş",
    Online: "Online",
    Card: "Kart",
    Split: "Bölünmüş",
    Back: "Geri",
    Item: "Ürün",
    Restaurant: "Restoran",
    New: "Yeni",
    Confirmed: "Onaylandı",
    Pending: "Bekliyor",
    Open: "Açık",
    Completed: "Tamamlandı",
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
    "Delivery Closed": "Paket Kapalı",
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
    Information: "Informationen",
    Date: "Datum",
    "Select Order Type": "Bestellart wählen",
    "Choose how you'd like to continue.": "Wählen Sie, wie Sie fortfahren möchten.",
    "Select how you'd like to order this item.": "Wählen Sie, wie Sie diesen Artikel bestellen möchten.",
    Search: "Suchen",
    "Voice Order": "Sprachbestellung",
    Categories: "Kategorien",
    "Loyalty Card": "Treuekarte",
    "Stamp my card": "Karte stempeln",
    Reward: "Belohnung",
    "Free Menu Item": "Kostenloser Menüartikel",
    "Popular This Week": "Diese Woche beliebt",
    "What our guests say": "Was unsere Gäste sagen",
    "No reviews yet.": "Noch keine Bewertungen.",
    Featured: "Empfohlen",
    "Order Status": "Bestellstatus",
    "Order received": "Bestellung erhalten",
    Preparing: "In Zubereitung",
    "Order ready": "Bestellung fertig",
    Delivered: "Geliefert",
    "Order Cancelled": "Bestellung storniert",
    Status: "Status",
    Items: "Artikel",
    Unpaid: "Unbezahlt",
    Unknown: "Unbekannt",
    Cancelled: "Storniert",
    Order: "Bestellung",
    Online: "Online",
    Card: "Karte",
    Split: "Geteilt",
    Back: "Zurück",
    Item: "Artikel",
    Restaurant: "Restaurant",
    New: "Neu",
    Confirmed: "Bestätigt",
    Pending: "Ausstehend",
    Open: "Offen",
    Completed: "Abgeschlossen",
    Closed: "Geschlossen",
    Table: "Tisch",
    Pickup: "Abholung",
    Delivery: "Lieferung",
    Time: "Zeit",
    Guests: "Gäste",
    "Select Guests": "Gäste wählen",
    "Select guests": "Gäste wählen",
    "Select guests first": "Zuerst Gäste wählen",
    "Choose guest amount first": "Wählen Sie zuerst die Gästeanzahl",
    "Select guests on a table card to enable QR scan": "Wählen Sie Gäste auf einer Tischkarte, um den QR-Scan zu aktivieren",
    "Select Your Table": "Wählen Sie Ihren Tisch",
    Seats: "Sitze",
    "Reservation Time": "Reservierungszeit",
    Payment: "Zahlung",
    Cash: "Bar",
    Total: "Gesamt",
    "Your Order": "Ihre Bestellung",
    "Order Again": "Erneut bestellen",
    Close: "Schließen",
    Note: "Notiz",
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
    Information: "Informations",
    Date: "Date",
    "Select Order Type": "Sélectionnez le type de commande",
    "Choose how you'd like to continue.": "Choisissez comment vous souhaitez continuer.",
    "Select how you'd like to order this item.": "Choisissez comment vous souhaitez commander cet article.",
    Search: "Rechercher",
    "Voice Order": "Commande vocale",
    Categories: "Catégories",
    "Loyalty Card": "Carte fidélité",
    "Stamp my card": "Tamponner ma carte",
    Reward: "Récompense",
    "Free Menu Item": "Article du menu gratuit",
    "Popular This Week": "Populaire cette semaine",
    "What our guests say": "Ce que disent nos clients",
    "No reviews yet.": "Aucun avis pour le moment.",
    Featured: "En vedette",
    "Order Status": "Statut de la commande",
    "Order received": "Commande reçue",
    Preparing: "Préparation",
    "Order ready": "Commande prête",
    Delivered: "Livré",
    "Order Cancelled": "Commande annulée",
    Status: "Statut",
    Items: "Articles",
    Unpaid: "Impayé",
    Unknown: "Inconnu",
    Cancelled: "Annulé",
    Order: "Commande",
    Online: "En ligne",
    Card: "Carte",
    Split: "Partagé",
    Back: "Retour",
    Item: "Article",
    Restaurant: "Restaurant",
    New: "Nouveau",
    Confirmed: "Confirmé",
    Pending: "En attente",
    Open: "Ouvert",
    Completed: "Terminé",
    Closed: "Fermé",
    Table: "Table",
    Pickup: "À emporter",
    Delivery: "Livraison",
    Time: "Temps",
    Guests: "Invités",
    "Select Guests": "Choisir des invités",
    "Select guests": "Choisir des invités",
    "Select guests first": "Choisissez d'abord les invités",
    "Choose guest amount first": "Choisissez d'abord le nombre d'invités",
    "Select guests on a table card to enable QR scan": "Sélectionnez les invités sur une carte de table pour activer le scan QR",
    "Select Your Table": "Choisissez votre table",
    Seats: "Places",
    "Reservation Time": "Heure de réservation",
    Payment: "Paiement",
    Cash: "Espèces",
    Total: "Total",
    "Your Order": "Votre commande",
    "Order Again": "Commander à nouveau",
    Close: "Fermer",
    Note: "Note",
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
  { code: "en", label: "🇺🇸 Eng" },
  { code: "tr", label: "🇹🇷 Tr" },
  { code: "de", label: "🇩🇪 De" },
  { code: "fr", label: "🇫🇷 Fr" },
];


/* ====================== LANGUAGE SWITCHER ====================== */
function LanguageSwitcher({ lang, setLang, t, isDark = false }) {
  const [open, setOpen] = React.useState(false);
  const current = LANGS.find((item) => item.code === lang) || LANGS[0];

  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-2.5 text-[11px] font-medium transition focus:outline-none focus:ring-2 ${
          isDark
            ? "border-white/10 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:bg-white/[0.12] focus:ring-white/15"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 focus:ring-slate-200"
        }`}
        aria-label={t("Language")}
        aria-expanded={open}
      >
        <span>{current.label}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            aria-label={t("Close")}
            onClick={() => setOpen(false)}
          />
          <div className={`absolute right-0 top-0 h-full w-[280px] border-l shadow-[0_24px_60px_rgba(0,0,0,0.18)] ${
            isDark
              ? "border-white/10 bg-neutral-950 text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
              : "border-gray-200 bg-white text-gray-900"
          }`}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-white/10" : "border-gray-200"}`}>
              <div>
                <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? "text-white/45" : "text-gray-400"}`}>
                  {t("Language")}
                </div>
                <div className={`mt-1 text-sm font-medium ${isDark ? "text-white/80" : "text-gray-600"}`}>
                  {current.label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  isDark
                    ? "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
                    : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
                aria-label={t("Close")}
              >
                ×
              </button>
            </div>

            <div className="p-3">
              <div className="space-y-1">
                {LANGS.map((item) => {
                  const active = item.code === lang;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setLang(item.code);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm transition ${
                        active
                          ? isDark
                            ? "bg-white text-neutral-950"
                            : "bg-slate-900 text-white"
                          : isDark
                            ? "text-white/82 hover:bg-white/[0.08] hover:text-white"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span>{item.label}</span>
                      {active ? <span className="text-xs font-semibold">•</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableQrScannerModal({
  open,
  tableNumber,
  tableDisplayName,
  guestCount,
  guestOptions = [],
  onGuestChange,
  onStartScan,
  scanReady,
  onClose,
  error,
  t,
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {scanReady ? t("Scan Table QR") : t("Guests")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {scanReady
              ? t("Scan the QR code on your table to continue.")
              : t("Select Guests")}
          </div>
          {tableDisplayName || tableNumber ? (
            <div className="mt-2 text-xs text-gray-500 dark:text-neutral-400">
              {tableDisplayName || `${t("Table")} ${String(tableNumber).padStart(2, "0")}`}
            </div>
          ) : null}
        </div>
        <div className="p-5">
          {scanReady ? (
            <div
              id="qr-table-reader"
              className="w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-neutral-950"
            />
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {t("Guests")}
              </label>
              <select
                value={guestCount ? String(guestCount) : ""}
                onChange={(e) => onGuestChange?.(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:bg-neutral-950 dark:border-neutral-700 dark:text-neutral-100"
              >
                <option value="">{t("Select Guests")}</option>
                {guestOptions.map((count) => (
                  <option key={count} value={String(count)}>
                    {count}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onStartScan?.()}
                disabled={!guestCount}
                className="w-full rounded-xl bg-neutral-900 text-white py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("Continue")}
              </button>
            </div>
          )}
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
    return normalizeRestaurantDisplayName(restaurantName, "Restaurant");
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
              ? formatTableName(table)
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
    return normalizeRestaurantDisplayName(restaurantName, "Restaurant");
  }, [restaurantName]);
  const subtitle = (c.subtitle ?? "").trim();
  const tagline = (c.tagline ?? "").trim();
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

  React.useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const pageTitle = displayRestaurantName || "Restaurant";
    const description = subtitle || tagline || pageTitle;
    const previousTitle = document.title;
    document.title = pageTitle;

    const touchedMeta = [];
    const upsertMeta = (selector, attributes, content) => {
      let node = document.head.querySelector(selector);
      const created = !node;
      if (!node) {
        node = document.createElement("meta");
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
        document.head.appendChild(node);
      }
      touchedMeta.push({ node, created, previous: node.getAttribute("content") });
      node.setAttribute("content", content);
    };

    upsertMeta('meta[property="og:title"]', { property: "og:title" }, pageTitle);
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title" }, pageTitle);
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name" }, pageTitle);
    upsertMeta('meta[name="apple-mobile-web-app-title"]', { name: "apple-mobile-web-app-title" }, pageTitle);
    upsertMeta('meta[name="description"]', { name: "description" }, description);
    upsertMeta('meta[property="og:description"]', { property: "og:description" }, description);
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description" }, description);

    return () => {
      document.title = previousTitle;
      touchedMeta.forEach(({ node, created, previous }) => {
        if (created) {
          node.remove();
          return;
        }
        if (previous == null) {
          node.removeAttribute("content");
        } else {
          node.setAttribute("content", previous);
        }
      });
    };
  }, [displayRestaurantName, subtitle, tagline]);

  React.useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;

    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return undefined;

    const previousHref = manifestLink.getAttribute("href");
    const pageTitle = displayRestaurantName || "Restaurant";
    const description = subtitle || tagline || pageTitle;
    const startUrl = `${window.location.pathname}${window.location.search || ""}`;
    const iconSrc = logoUrl || "/Beylogo.svg";
    const manifest = {
      name: pageTitle,
      short_name: pageTitle,
      description,
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      theme_color: "#0f172a",
      background_color: "#0f172a",
      icons: [
        {
          src: iconSrc,
          sizes: "any",
          type: iconSrc.endsWith(".svg") ? "image/svg+xml" : "image/png",
          purpose: "any",
        },
        {
          src: iconSrc,
          sizes: "any",
          type: iconSrc.endsWith(".svg") ? "image/svg+xml" : "image/png",
          purpose: "maskable",
        },
      ],
    };

    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const manifestUrl = URL.createObjectURL(blob);
    manifestLink.setAttribute("href", manifestUrl);

    return () => {
      if (previousHref) {
        manifestLink.setAttribute("href", previousHref);
      } else {
        manifestLink.removeAttribute("href");
      }
      URL.revokeObjectURL(manifestUrl);
    };
  }, [displayRestaurantName, subtitle, tagline, logoUrl]);


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
    if (today?.enabled === false) {
      return { isOpen: false, label: t("Closed"), source: "schedule" };
    }
    const openMin = parseTimeToMinutes(today?.open);
    const closeMin = parseTimeToMinutes(today?.close);
    if (openMin === null || closeMin === null) {
      return { isOpen: false, label: t("Closed"), source: "schedule" };
    }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    if (closeMin > openMin) {
      const isOpen = nowMin >= openMin && nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed"), source: "schedule" };
    }

    if (closeMin < openMin) {
      const isOpen = nowMin >= openMin || nowMin < closeMin;
      return { isOpen, label: isOpen ? t("Open now!") : t("Closed"), source: "schedule" };
    }

    return { isOpen: false, label: t("Closed"), source: "schedule" };
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
    let realtimeSocket = null;

    const loadShopHours = async ({ withSpinner = false } = {}) => {
      if (withSpinner && active) setLoadingShopHours(true);
      try {
        let data = null;

        if (identifier) {
          try {
            data = await secureFetch(`/public/shop-hours/${encodeURIComponent(identifier)}`);
          } catch {
            data = null;
          }
        }

        if (!Array.isArray(data)) {
          const token = getStoredToken() || getAuthToken();
          if (!token) throw new Error("Missing token");
          data = await secureFetch("/settings/shop-hours/all", {
            headers: { Authorization: `Bearer ${token}` },
          });
        }

        if (!active) return;
        const hoursMap = {};
        days.forEach((day) => {
          hoursMap[day] = { open: "", close: "", enabled: false };
        });
        if (Array.isArray(data)) {
          data.forEach((row) => {
            hoursMap[row.day] = {
              open: row.open_time || "",
              close: row.close_time || "",
              enabled: Boolean(row.open_time && row.close_time),
            };
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

    const refreshFromRealtime = () => {
      loadShopHours({ withSpinner: false });
    };

    const onLocalShopHoursUpdated = () => {
      refreshFromRealtime();
    };
    window.addEventListener("qr:shop-hours-updated", onLocalShopHoursUpdated);

    const onStorage = (e) => {
      if (e?.key !== "qr_shop_hours_updated_at") return;
      refreshFromRealtime();
    };
    window.addEventListener("storage", onStorage);

    try {
      const SOCKET_URL =
        import.meta.env.VITE_SOCKET_URL ||
        (API_BASE ? String(API_BASE) : "") ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const socketRestaurantId = parseRestaurantIdFromIdentifier(identifier);

      realtimeSocket = io(SOCKET_URL, {
        path: "/socket.io",
        transports: ["polling", "websocket"],
        upgrade: true,
        withCredentials: true,
        timeout: 20000,
      });

      if (socketRestaurantId) {
        realtimeSocket.emit("join_restaurant", socketRestaurantId);
      }

      realtimeSocket.on("connect", () => {
        if (socketRestaurantId) {
          realtimeSocket.emit("join_restaurant", socketRestaurantId);
        }
      });
      realtimeSocket.on("shop_hours_updated", refreshFromRealtime);
      realtimeSocket.on("shop_hours_updated_public", refreshFromRealtime);
    } catch (socketErr) {
      console.warn("⚠️ QR shop-hours realtime socket unavailable:", socketErr?.message || socketErr);
    }

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("qr:shop-hours-updated", onLocalShopHoursUpdated);
      window.removeEventListener("storage", onStorage);
      try {
        if (realtimeSocket) {
          realtimeSocket.off("shop_hours_updated", refreshFromRealtime);
          realtimeSocket.off("shop_hours_updated_public", refreshFromRealtime);
          realtimeSocket.disconnect();
        }
      } catch {}
    };
  }, [identifier]);

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
	    <header className={`fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl ${
        isDark
          ? "border-white/10 bg-neutral-950/88"
          : "border-gray-200/80 bg-white/92"
      }`}>
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3">
          <div className="grid grid-cols-1 items-center gap-3">
            <div className="grid grid-cols-3 gap-2 min-w-0">
              <button
                onClick={() => openStatus.isOpen && onSelect("takeaway")}
                disabled={!openStatus.isOpen}
                className={`h-10 sm:h-11 rounded-lg border px-3 text-[13px] sm:text-[15px] font-medium transition-colors ${
                  !openStatus.isOpen
                    ? isDark
                      ? "bg-white/[0.04] text-white/35 border-white/10 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : isDark
                      ? "bg-white text-neutral-950 border-white/80 hover:bg-white/90"
                      : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                }`}
              >
                {t("Reservation")}
              </button>

              <button
                onClick={() => openStatus.isOpen && onSelect("table")}
                disabled={!openStatus.isOpen}
                className={`h-10 sm:h-11 rounded-lg border px-3 text-[13px] sm:text-[15px] font-medium transition-colors ${
                  !openStatus.isOpen
                    ? isDark
                      ? "bg-white/[0.04] text-white/35 border-white/10 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : isDark
                      ? "bg-white/[0.04] text-white/82 border-white/12 hover:bg-white/[0.08] hover:text-white"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {t("Table Order")}
              </button>

              <button
                onClick={() => allowDelivery && openStatus.isOpen && onSelect("online")}
                disabled={!allowDelivery || !openStatus.isOpen}
                className={`h-10 sm:h-11 rounded-lg border px-3 text-[13px] sm:text-[15px] font-medium transition-colors ${
                  !allowDelivery || !openStatus.isOpen
                    ? isDark
                      ? "bg-white/[0.04] text-white/35 border-white/10 cursor-not-allowed"
                      : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : isDark
                      ? "bg-white/[0.04] text-white/82 border-white/12 hover:bg-white/[0.08] hover:text-white"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                {t("Delivery")}
              </button>
            </div>
          </div>
        </div>
	    </header>
      <div className="h-[72px] sm:h-[76px]" aria-hidden="true" />
	
	    {/* === HERO SECTION === */}
		    <section id="order-section" className="max-w-6xl mx-auto px-4 pt-8 pb-4 space-y-10">
	
	      {/* TITLE & TAGLINE */}
	      <div className="max-w-4xl mx-auto">
              <div className="text-center">
			        <h1 className="text-[2.05rem] sm:text-[2.65rem] md:text-[3.15rem] font-serif font-semibold leading-[1.04] tracking-[-0.035em] text-gray-900 dark:text-neutral-50">
			          {displayRestaurantName}
			        </h1>
                {subtitle ? (
                  <p className="mt-3 text-[16px] sm:text-[17px] font-light tracking-[0.01em] text-gray-600 dark:text-neutral-300/85">
                    {subtitle}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3" ref={shopHoursDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowShopHoursDropdown((v) => !v)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] sm:text-[13px] font-medium transition ${
                      openStatus.isOpen
                        ? "bg-emerald-50/90 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/25 dark:text-emerald-200 dark:border-emerald-900/30"
                        : "bg-rose-50/90 text-rose-700 border-rose-200/80 dark:bg-rose-950/25 dark:text-rose-200 dark:border-rose-900/30"
                    }`}
                    aria-label={t("Shop Hours")}
                    title={t("Shop Hours")}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${openStatus.isOpen ? "bg-emerald-500" : "bg-rose-500"}`} />
                    <span>{openStatus.label}</span>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowShopHoursDropdown((v) => !v)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200/90 bg-transparent text-gray-700 text-[12px] sm:text-[13px] font-medium hover:bg-gray-50 dark:text-neutral-200 dark:border-neutral-800 dark:hover:bg-neutral-900/70 transition"
                      aria-label={t("Shop Hours")}
                      title={t("Shop Hours")}
                    >
                      <span>{t("Shop Hours")}</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showShopHoursDropdown ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showShopHoursDropdown && (
                      <div className="absolute left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 top-[calc(100%+10px)] w-[min(320px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-gray-200 bg-white/95 dark:bg-neutral-950/90 shadow-xl backdrop-blur p-3 z-20">
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
                            const enabled = shopHours?.[day]?.enabled !== false;
                            const has = enabled && !!(open && close);
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
              </div>

			        {/* Featured products */}
			        <div className="mt-7 space-y-4 max-w-3xl mx-auto">
			          <FeaturedCard
			            slides={slides}
			            currentSlide={currentSlide}
			            setCurrentSlide={setCurrentSlide}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={handleTouchEnd}
                  t={t}
			          />
			        </div>
                {tagline ? (
				          <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400 max-w-xl mx-auto text-center leading-relaxed">{tagline}</p>
                ) : null}

	      </div>

      {/* CATEGORIES (scrollable 1 row) */}
      {homeCategories.length > 0 && (
        <div className="mt-3 max-w-3xl">
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
	              {t("Categories")}
	            </div>
	          </div>

          <div className="mt-3">
            <CategorySlider
              categories={homeCategories}
              activeCategory={activeHomeCategory}
              onCategorySelect={(cat) => setActiveHomeCategory(cat)}
              categoryImages={homeCategoryImages}
              apiUrl={API_URL}
            />
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
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">⭐ {t("Loyalty Card")}</div>
            <div className="text-sm text-right text-gray-600 dark:text-gray-300">
              {t("Reward")}: {loyalty.reward_text || t("Free Menu Item")}
            </div>
          </div>
          <button
            onClick={handleStamp}
            style={{ backgroundColor: loyalty.color }}
            disabled={!canStampLoyalty}
            className={`mt-3 mb-5 px-4 py-2 rounded-xl text-[14px] text-white font-semibold shadow transition ${
              canStampLoyalty ? "hover:opacity-90" : "opacity-50 cursor-not-allowed"
            }`}
          >
            {t("Stamp my card")}
          </button>
          <div className="flex items-center gap-1">
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

	      {/* CALL + SHARE + DOWNLOAD */}
	      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 max-w-3xl">
	        {phoneNumber ? (
	          <a
	            href={`tel:${phoneNumber}`}
	            className="w-full py-3 sm:py-4 rounded-2xl bg-black text-white font-semibold shadow-md flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-1 transition-all"
	            style={{ backgroundColor: accent }}
	          >
	            <Phone className="w-5 h-5" />
	            <span className="text-xs sm:text-sm">{t("Call Us")}</span>
	          </a>
	        ) : (
	          <button
	            type="button"
	            disabled
	            className="w-full py-3 sm:py-4 rounded-2xl bg-neutral-200 text-neutral-500 font-semibold shadow-sm flex items-center justify-center gap-2 cursor-not-allowed"
	          >
	            <Phone className="w-5 h-5" />
	            <span className="text-xs sm:text-sm">{t("Call Us")}</span>
	          </button>
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
	              alert(t("Link copied."));
	            }
	          }}
	          className="w-full py-3 sm:py-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:-translate-y-1 transition-all"
	        >
	          <Share2 className="w-5 h-5" />
	          <span className="text-xs sm:text-sm">{t("Share")}</span>
	        </button>

	        <button
	          type="button"
	          onClick={() => onDownloadQr?.()}
	          className="w-full py-3 sm:py-4 rounded-2xl bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:-translate-y-1 transition-all"
	        >
	          <Download className="w-5 h-5" />
	          <span className="text-xs sm:text-sm">{t("Download Qr")}</span>
	        </button>
	      </div>
	      {/* Popular This Week (below Share button) */}
	      {c.enable_popular && popularProducts.length > 0 && (
	        <div className="mt-6 max-w-3xl">
	          <PopularCarousel
	            title={`⭐ ${t("Popular This Week")}`}
	            items={popularProducts}
	            onProductClick={onPopularClick}
	          />
	        </div>
	      )}
	    </section>

    {/* === STORY SECTION (B: TEXT LEFT — IMAGE RIGHT) === */}
	    <section id="story-section" className="max-w-6xl mx-auto px-4 pt-2 pb-14">
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
	        {t("What our guests say")}
	      </h2>

	      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
	        {reviews.length === 0 && (
	          <p className="text-neutral-500 dark:text-neutral-400 text-sm">{t("No reviews yet.")}</p>
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
	    <div className="flex flex-col items-center justify-center gap-4 pb-10">
        <LanguageSwitcher lang={lang} setLang={setLang} t={t} isDark={isDark} />
        <div className="flex items-center justify-center gap-6">
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
	  </div>
	  );





}





/* ====================== TAKEAWAY ORDER FORM ====================== */
function TakeawayOrderForm({
  submitting,
  t,
  onClose,
  onSubmit,
  tables = [],
  occupiedTables = [],
  reservedTables = [],
  paymentMethod,
  setPaymentMethod,
  formatTableName,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const paymentMethods = usePaymentMethods();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    pickup_date: "",
    pickup_time: "",
    mode: "reservation", // "pickup" | "reservation"
    table_number: "",
    reservation_clients: "",
    notes: "",
    payment_method: "",
  });
  const [touched, setTouched] = useState({});
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const [shakeModal, setShakeModal] = useState(false);
  const safeTables = useMemo(() => (Array.isArray(tables) ? tables : []), [tables]);
  const unavailableTables = useMemo(() => {
    const set = new Set();
    (Array.isArray(occupiedTables) ? occupiedTables : []).forEach((value) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) set.add(n);
    });
    return set;
  }, [occupiedTables]);
  const reservedTableSet = useMemo(() => {
    const set = new Set();
    (Array.isArray(reservedTables) ? reservedTables : []).forEach((value) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) set.add(n);
    });
    return set;
  }, [reservedTables]);

  useEffect(() => {
    if (form.payment_method) {
      setPaymentPrompt(false);
    }
  }, [form.payment_method]);

  const fallbackPaymentMethods = useMemo(
    () => [
      { id: "cash", label: t("Cash") },
      { id: "card", label: t("Credit Card") },
      { id: "online", label: t("Online Payment") },
    ],
    [t]
  );
  const availablePaymentMethods =
    paymentMethods.length > 0 ? paymentMethods : fallbackPaymentMethods;

  const requiresReservationTable = form.mode === "reservation";
  const requiresPayment = form.mode !== "reservation";
  const phoneValid = /^(5\d{9}|[578]\d{7})$/.test(form.phone);
  const selectedTableNumber = Number(form.table_number);
  const selectedTable = useMemo(
    () => safeTables.find((tbl) => Number(tbl?.tableNumber) === selectedTableNumber) || null,
    [safeTables, selectedTableNumber]
  );
  const maxGuestsForSelectedTable = (() => {
    const seats = Number(selectedTable?.seats);
    if (Number.isFinite(seats) && seats > 0) return Math.min(20, Math.max(1, Math.floor(seats)));
    return 12;
  })();
  const guestOptions = useMemo(
    () => Array.from({ length: maxGuestsForSelectedTable }, (_, i) => i + 1),
    [maxGuestsForSelectedTable]
  );
  const reservationClientsCount = Number(form.reservation_clients);
  const hasReservationClients =
    requiresReservationTable &&
    Number.isFinite(reservationClientsCount) &&
    reservationClientsCount > 0 &&
    reservationClientsCount <= maxGuestsForSelectedTable;
  const hasReservationTable =
    requiresReservationTable &&
    Number.isFinite(selectedTableNumber) &&
    selectedTableNumber > 0 &&
    !unavailableTables.has(selectedTableNumber);
  const valid =
    form.name &&
    phoneValid &&
    form.pickup_date &&
    form.pickup_time &&
    (!requiresReservationTable || (hasReservationTable && hasReservationClients)) &&
    (!requiresPayment || !!form.payment_method);

  useEffect(() => {
    if (!requiresReservationTable) return;
    if (!Number.isFinite(selectedTableNumber) || selectedTableNumber <= 0) return;
    setForm((prev) => {
      if (!prev.reservation_clients) return prev;
      const current = Number(prev.reservation_clients);
      const nextValue = Number.isFinite(current) && current > 0
        ? Math.min(current, maxGuestsForSelectedTable)
        : "";
      if (nextValue === "") return { ...prev, reservation_clients: "" };
      const next = String(Math.max(1, nextValue));
      if (prev.reservation_clients === next) return prev;
      return { ...prev, reservation_clients: next };
    });
  }, [requiresReservationTable, selectedTableNumber, maxGuestsForSelectedTable]);

  const triggerPaymentError = () => {
    setPaymentPrompt(true);
    setShakeModal(true);
    setTimeout(() => setShakeModal(false), 420);
  };

  const handlePaymentChange = (value) => {
    setForm((prev) => ({ ...prev, payment_method: value }));
    if (typeof setPaymentMethod === "function") {
      setPaymentMethod(value);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!valid) {
      setTouched({
        name: true,
        phone: true,
        pickup_date: true,
        pickup_time: true,
        table_number: requiresReservationTable,
        reservation_clients: requiresReservationTable,
        payment_method: requiresPayment,
      });
      if (requiresPayment && !form.payment_method) {
        triggerPaymentError();
        return;
      }
      return;
    }
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-6">
      <div
        className="bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-5 sm:p-8 pb-[calc(1.25rem+env(safe-area-inset-bottom))] w-full max-w-md relative max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
        style={shakeModal ? { animation: "takeawayShake 420ms ease-in-out" } : undefined}
      >
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
          {t("Information")}
        </h2>

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
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
              let maxLen = 10;
              if (/^[78]/.test(clean)) maxLen = 8;
              const trimmed = clean.slice(0, maxLen);
              setForm((f) => ({ ...f, phone: trimmed }));
            }}
            inputMode="numeric"
            maxLength={10}
          />

          {/* Pickup / Reservation Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                {t("Date")}
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
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                {t("Time")}
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
          </div>

          {/* Pickup / Reservation toggle */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {t("Pickup / Reservation")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: "reservation" }))}
                className={`py-2.5 rounded-xl text-sm font-semibold border ${
                  form.mode === "reservation"
                    ? "bg-neutral-900 text-white border-neutral-900"
                    : "bg-white text-neutral-700 border-neutral-300"
                }`}
              >
                🎫 {t("Reservation")}
              </button>
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
            </div>
          </div>

          {/* Table select (only for reservation) */}
          {form.mode === "reservation" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {t("Select Table")}
                </label>
                <select
                  className={`w-full rounded-xl border px-4 py-3 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
                    touched.table_number && !hasReservationTable ? "border-red-500" : "border-neutral-300"
                  }`}
                  value={form.table_number}
                  onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))}
                >
                  <option value="">{t("Select Table")}</option>
                  {safeTables.map((tbl) => {
                    const tableNumber = Number(tbl?.tableNumber);
                    if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;
                    const disabled = unavailableTables.has(tableNumber);
                    const reserved = reservedTableSet.has(tableNumber);
                    const tableText =
                      typeof formatTableName === "function"
                        ? formatTableName(tbl)
                        : `${t("Table")} ${String(tableNumber).padStart(2, "0")}`;
                    return (
                      <option key={tableNumber} value={String(tableNumber)} disabled={disabled}>
                        {`${tableText}${
                          disabled ? ` - ${reserved ? t("Reserved") : t("Occupied")}` : ""
                        }`}
                      </option>
                    );
                  })}
                </select>
                {touched.table_number && !hasReservationTable && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    {t("Please select an available table.")}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {t("Guests")}
                </label>
                <select
                  className={`w-full rounded-xl border px-4 py-3 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
                    touched.reservation_clients && !hasReservationClients ? "border-red-500" : "border-neutral-300"
                  }`}
                  value={form.reservation_clients}
                  onChange={(e) => setForm((f) => ({ ...f, reservation_clients: e.target.value }))}
                  disabled={!hasReservationTable}
                >
                  <option value="">{t("Select Guests")}</option>
                  {guestOptions.map((count) => (
                    <option key={count} value={String(count)}>
                      {count}
                    </option>
                  ))}
                </select>
                {touched.reservation_clients && !hasReservationClients && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    {t("Select Guests")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Payment Method */}
          {requiresPayment && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-800">{t("Payment Method")}</label>
              <select
                className={`rounded-xl border px-4 py-3 text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-400 ${
                  paymentPrompt && !form.payment_method ? "border-red-500" : "border-neutral-300"
                }`}
                value={form.payment_method}
                onChange={(e) => handlePaymentChange(e.target.value)}
              >
                <option value="">{t("Select Payment Method")}</option>
                {availablePaymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label}
                  </option>
                ))}
              </select>
              {paymentPrompt && !form.payment_method && (
                <p className="text-xs font-semibold text-rose-600">
                  {t("Please select a payment method before continuing.")}
                </p>
              )}
            </div>
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
      <style>{`
        @keyframes takeawayShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
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
            {shopIsOpen ? t("Reservation") : t("Shop Closed")}
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
function CategoryRail({ categories, activeCategory, setActiveCategory, categoryImages, t = (key) => key }) {
  const categoryList = Array.isArray(categories) ? categories : [];
  const categoryFallbackSrc = "/Beylogo.svg";

  return (
    <aside className="w-full h-full">
      <div className="h-full rounded-2xl border border-neutral-200 bg-white/85 shadow-sm p-3 flex flex-col">
        <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500 mb-2 px-1">
          {t("Categories")}
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
function FeaturedCard({ slides, currentSlide, setCurrentSlide, onTouchStart, onTouchEnd, t }) {
  if (!Array.isArray(slides) || slides.length === 0) return null;
  return (
    <div className="flex items-stretch">
      <div className="w-full rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
        <div
          className="w-full h-64 sm:h-72 overflow-hidden"
          onTouchStart={slides.length > 1 ? onTouchStart : undefined}
          onTouchEnd={slides.length > 1 ? onTouchEnd : undefined}
          style={{ touchAction: "pan-y" }}
        >
          <img
            src={slides[currentSlide].src}
            alt={slides[currentSlide].title}
            className="w-full h-full object-cover transition-all duration-700 ease-out"
          />
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            {t("Featured")}
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
function OrderStatusModal({
  open,
  status,
  orderId,
  orderType,
  table,
  onOrderAnother,
  onClose,
  onFinished,
  t,
  appendIdentifier,
  errorMessage,
  cancelReason,
  orderScreenStatus,
  forceDark,
  forceLock = false,
  allowOrderAnotherWhenLocked = false,
}) {
  if (!open) return null;

  const uiStatus = (status || "").toLowerCase(); // pending | success | fail
  const backendStatus = (orderScreenStatus || "").toLowerCase(); // confirmed | cancelled | closed | ...
  const isCancelled = isCancelledLikeStatus(backendStatus);
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

  const lockBlocksActions = forceLock && !allowOrderAnotherWhenLocked;
  const lockBlocksForCancelState = lockBlocksActions && !isCancelled;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (lockBlocksForCancelState) return;
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
		   onOrderAnother={lockBlocksForCancelState ? null : onOrderAnother}   
		  onClose={lockBlocksForCancelState ? null : onClose}
		  onFinished={onFinished}
      forceLock={forceLock}
		  forceDark={forceDark}

	  t={t}
	  buildUrl={(path) => apiUrl(path)}
	  appendIdentifier={appendIdentifier}
	/>

  ) : null}
</div>


        {/* Footer: keep only when no embedded OrderStatusScreen is rendered.
            OrderStatusScreen already renders Close + Order Again actions. */}
        {!orderId && (
          <div className="p-4 border-t bg-white">
            {lockBlocksActions ? (
              <button
                className="w-full py-3 rounded-xl bg-slate-200 text-slate-700 font-bold shadow cursor-not-allowed"
                disabled
              >
                {t("Table must be closed by staff first")}
              </button>
            ) : (
              <button
                className="w-full py-3 rounded-xl bg-blue-500 text-white font-bold shadow hover:bg-blue-600 transition"
                onClick={status === "success" ? onOrderAnother : onClose}
              >
                {status === "success" ? t("Order Another") : t("Close")}
              </button>
            )}
          </div>
        )}
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
    occupiedTables,
    isDarkMain,
    submitting,
    setSubmitting,
    safeExtrasGroups,
    safeCart,
    safeProducts,
    safeOccupiedTables,
    safeReservedTables,
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
    tableScanGuests,
    setTableScanGuests,
    tableScanReady,
    startTableScannerWithGuests,
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
    hydrateCartFromActiveOrder,
    handleOrderAnother,
    handleSubmitOrder,
    handleReset,
    handleInstallClick,
    handleDownloadQr,
    showHome,
    showTableSelector,
    filteredOccupied,
    filteredReserved,
    callingWaiter,
    callWaiterCooldownSeconds,
    handleCallWaiter,
    brandName,
    lastError,
    orderCancelReason,
    activeOrder,
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
  const [callWaiterFeedback, setCallWaiterFeedback] = useState("");
  const callWaiterFeedbackTimeoutRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__isQrMenuPage = true;
    return () => {
      window.__isQrMenuPage = false;
    };
  }, []);

  const resolvedTableForActions =
    Number(table) ||
    Number(storage.getItem("qr_table")) ||
    Number(storage.getItem("qr_selected_table")) ||
    Number(activeOrder?.table_number) ||
    Number(activeOrder?.tableNumber) ||
    Number(activeOrder?.table) ||
    null;
  const resolvedOrderTypeForActions =
    orderType || storage.getItem("qr_orderType") || (Number.isFinite(resolvedTableForActions) && resolvedTableForActions > 0 ? "table" : null);

  const showCallWaiterButton =
    (!showHome || showStatus) &&
    resolvedOrderTypeForActions === "table" &&
    Number.isFinite(resolvedTableForActions) &&
    resolvedTableForActions > 0;
  const callWaiterButtonDisabledBase = callingWaiter || callWaiterCooldownSeconds > 0;
  const callWaiterLabel = t("Call Waiter");
  const reOrderLabel = "Re-Order";
  const aiOrderLabel = t("AI Order");
  const cartLabel = t("Your Order");
  const scanTargetTable = useMemo(
    () => toArray(tables).find((tbl) => Number(tbl?.tableNumber) === Number(tableScanTarget)) || null,
    [tables, tableScanTarget]
  );
  const scanGuestOptions = useMemo(() => {
    const seats = Number(scanTargetTable?.seats ?? scanTargetTable?.chairs ?? 0);
    const max = Number.isFinite(seats) && seats > 0 ? Math.min(20, Math.floor(seats)) : 12;
    return Array.from({ length: max }, (_, idx) => idx + 1);
  }, [scanTargetTable]);
  const cartItems = toArray(safeCart);
  const cartNewItemsCount = cartItems.filter((item) => !item?.locked).length;
  const canOpenCartFromNav = cartItems.length > 0 || hasActiveOrder;
  const hasBottomNavContext = showStatus || hasActiveOrder || cartItems.length > 0;
  const showBottomActions =
    !isDesktopLayout &&
    !showTableSelector &&
    hasBottomNavContext &&
    (!showHome || showStatus);
  const canReOrderFromNav = Boolean(hasActiveOrder || showStatus);
  const canStartVoiceFromNavBase =
    Boolean(resolvedOrderTypeForActions) && (!showHome || showStatus);
  const showTableAreas = useMemo(
    () => readQrTableShowAreasSetting(restaurantIdentifier),
    [restaurantIdentifier, tables.length]
  );
  const formatTableName = useCallback(
    (tableValue) => {
      const inputIsObject = tableValue && typeof tableValue === "object";
      const tableNumber = Number(
        inputIsObject
          ? tableValue?.tableNumber ?? tableValue?.number ?? tableValue?.table_number
          : tableValue
      );
      if (!Number.isFinite(tableNumber) || tableNumber <= 0) {
        return t("Table");
      }
      const tableRecord = inputIsObject
        ? tableValue
        : toArray(tables).find((tbl) => Number(tbl?.tableNumber) === tableNumber);
      const customLabel = String(tableRecord?.label || "").trim();
      if (customLabel) {
        return customLabel;
      }
      return `${t("Table")} ${String(tableNumber).padStart(2, "0")}`;
    },
    [t, tables]
  );
  const scanTargetTableDisplayName = useMemo(
    () => formatTableName(scanTargetTable || tableScanTarget),
    [formatTableName, scanTargetTable, tableScanTarget]
  );

  const showCallWaiterFeedback = useCallback((message) => {
    setCallWaiterFeedback(message);
    if (callWaiterFeedbackTimeoutRef.current) {
      window.clearTimeout(callWaiterFeedbackTimeoutRef.current);
    }
    callWaiterFeedbackTimeoutRef.current = window.setTimeout(() => {
      setCallWaiterFeedback("");
      callWaiterFeedbackTimeoutRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (callWaiterFeedbackTimeoutRef.current) {
        window.clearTimeout(callWaiterFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const onCallWaiterClick = useCallback(async () => {
    const result = await handleCallWaiter?.();
    if (result?.ok) {
      showCallWaiterFeedback(t("Waiter notified!"));
      return;
    }
    if (result?.reason === "cooldown") {
      showCallWaiterFeedback(t("Please wait before calling again."));
      return;
    }
    showCallWaiterFeedback(t("Unable to call waiter right now."));
  }, [handleCallWaiter, showCallWaiterFeedback, t]);

  const onOpenCartFromNav = useCallback(async () => {
    // Ensure status overlay is dismissed before opening cart to avoid open/close flicker.
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    // Rehydrate when there are no pending new items; locked-only cart can be stale
    // right after sub-order submit and must be refreshed from server.
    if (cartNewItemsCount === 0 && hasActiveOrder) {
      try {
        await hydrateCartFromActiveOrder?.();
      } catch (err) {
        console.warn("⚠️ Failed to hydrate cart from active order:", err);
      }
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event("qr:cart-open"));
      });
    } else {
      window.dispatchEvent(new Event("qr:cart-open"));
    }
  }, [cartNewItemsCount, hasActiveOrder, hydrateCartFromActiveOrder, setShowStatus, storage]);

  const onOpenVoiceFromNav = useCallback(() => {
    window.dispatchEvent(new Event("qr:voice-order-open"));
  }, []);

  const onReOrderFromNav = useCallback(async () => {
    // Use the same restore logic as "Order Another" so table flow does not fall back to home.
    window.dispatchEvent(new Event("qr:voice-order-close"));
    await handleOrderAnother?.();
  }, [handleOrderAnother]);
  const onForceCloseStatusFromNav = useCallback(() => {
    storage.removeItem("qr_force_status_until_closed");
    storage.setItem("qr_show_status", "0");
    setShowStatus(false);
    window.dispatchEvent(new Event("qr:voice-order-close"));
    resetToTypePicker?.({ allowForceClose: true });
  }, [resetToTypePicker, setShowStatus, storage]);

  const forceStatusLockActive = (() => {
    const forced = storage.getItem("qr_force_status_until_closed") === "1";
    if (!forced) return false;
    const activeId = Number(orderId || storage.getItem("qr_active_order_id"));
    return Number.isFinite(activeId) && activeId > 0;
  })();
  const normalizedStatusForLock = String(orderScreenStatus || "").toLowerCase();
  const reservedTableContextWhileLocked =
    Number.isFinite(Number(resolvedTableForActions)) &&
    safeReservedTables.some((n) => Number(n) === Number(resolvedTableForActions));
  const allowOrderAnotherWhenLocked =
    forceStatusLockActive &&
    (normalizedStatusForLock === "reserved" ||
      normalizedStatusForLock === "confirmed" ||
      reservedTableContextWhileLocked);
  const activeOrderHasReservation = hasReservationPayload(activeOrder);
  const activeOrderItemCount = (() => {
    if (Array.isArray(activeOrder?.items)) return activeOrder.items.length;
    const countFromPayload = Number(activeOrder?.items_count ?? activeOrder?.item_count);
    if (Number.isFinite(countFromPayload) && countFromPayload >= 0) return countFromPayload;
    return 0;
  })();
  const activeOrderTotal = Number(activeOrder?.total || 0);
  const statusAllowsCloseSlot =
    normalizedStatusForLock === "" ||
    ["confirmed", "closed", "completed", "cancelled", "canceled", "deleted", "void"].includes(
      normalizedStatusForLock
    );
  const showCloseInReorderSlot =
    forceStatusLockActive &&
    statusAllowsCloseSlot &&
    !activeOrderHasReservation &&
    activeOrderItemCount === 0 &&
    activeOrderTotal <= 0;
  const disableAuxBottomNavActions = showCloseInReorderSlot;
  const callWaiterButtonDisabled = callWaiterButtonDisabledBase || disableAuxBottomNavActions;
  const canStartVoiceFromNav =
    canStartVoiceFromNavBase && !disableAuxBottomNavActions;
  const reorderActionLabel = showCloseInReorderSlot ? t("Close") : reOrderLabel;
  const canUseReorderSlot = showCloseInReorderSlot || canReOrderFromNav;
  const onReorderSlotClick = showCloseInReorderSlot
    ? onForceCloseStatusFromNav
    : onReOrderFromNav;

  const statusPortal = showStatus && statusPortalOrderId
    ? createPortal(
        <OrderStatusModal
          open={true}
          status={orderStatus}
          orderId={statusPortalOrderId}
          orderType={orderType}
          table={orderType === "table" ? table : null}
          onOrderAnother={forceStatusLockActive && !allowOrderAnotherWhenLocked ? null : handleOrderAnother}
          onClose={handleReset}
          onFinished={resetToTypePicker}
          t={t}
          appendIdentifier={appendIdentifier}
          errorMessage={lastError}
          cancelReason={orderCancelReason}
          orderScreenStatus={orderScreenStatus}
          forceDark={isDarkMain}
          forceLock={forceStatusLockActive}
          allowOrderAnotherWhenLocked={allowOrderAnotherWhenLocked}
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
      setPaymentMethod("");
    },
    [safeProducts, setCart, storage, t, setPaymentMethod]
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
            showAreas={showTableAreas}
            t={t}
            formatTableName={formatTableName}
            occupiedNumbers={filteredOccupied}
            occupiedLabel={t("Occupied")}
            reservedNumbers={filteredReserved}
            reservedLabel={t("Reserved")}
            onSelect={(tbl) => {
              openTableScanner(tbl?.tableNumber, Number(tbl?.guests));
            }}
            onBack={() => {
              setOrderType(null);
            }}
          />

          <TableQrScannerModal
            open={showTableScanner}
            tableNumber={tableScanTarget}
            tableDisplayName={scanTargetTableDisplayName}
            guestCount={tableScanGuests}
            guestOptions={scanGuestOptions}
            onGuestChange={(value) => {
              const n = Number(value);
              setTableScanGuests(Number.isFinite(n) && n > 0 ? n : null);
            }}
            onStartScan={() => {
              if (!startTableScannerWithGuests(tableScanGuests)) {
                return;
              }
            }}
            scanReady={tableScanReady}
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

            <div className="w-full max-w-[1400px] mx-auto px-3 sm:px-4 md:px-6 lg:px-6 xl:px-8 pb-32">
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
                      onOrderAnother={handleOrderAnother}
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
                      voiceListening={qrVoiceListening}
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
          onOrderAnother={handleOrderAnother}
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
          voiceListening={qrVoiceListening}
          hideFloatingButton={true}
        />
      )}

      {showBottomActions && (
        <div className="fixed inset-x-0 bottom-0 z-[130] px-3 pb-[calc(8px+env(safe-area-inset-bottom))]">
          {callWaiterFeedback ? (
            <div className="mx-auto mb-2 w-fit rounded-xl bg-white/95 border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm whitespace-nowrap">
              {callWaiterFeedback}
            </div>
          ) : null}
          <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-[0_10px_35px_rgba(0,0,0,0.2)] backdrop-blur">
            <button
              type="button"
              onClick={onCallWaiterClick}
              disabled={!showCallWaiterButton || callWaiterButtonDisabled}
              className={`relative inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                !showCallWaiterButton || callWaiterButtonDisabled
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                  : "border-red-500 bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]"
              }`}
              title={callWaiterLabel}
              aria-label={callWaiterLabel}
            >
              {callingWaiter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" aria-hidden="true" />}
              <span className="block whitespace-nowrap">{callWaiterLabel}</span>
              {!callingWaiter && callWaiterCooldownSeconds > 0 ? (
                <span className="absolute right-1 top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full border border-red-200 bg-white px-1 text-[9px] font-bold leading-none text-red-600">
                  {callWaiterCooldownSeconds}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={onReorderSlotClick}
              disabled={!canUseReorderSlot}
              className={`inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                canUseReorderSlot
                  ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
              title={reorderActionLabel}
              aria-label={reorderActionLabel}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="block whitespace-nowrap">{reorderActionLabel}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCartFromNav}
              disabled={!canOpenCartFromNav}
              className={`relative inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                canOpenCartFromNav
                  ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
              title={cartLabel}
              aria-label={cartLabel}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              <span className="block whitespace-nowrap">{cartLabel}</span>
              {cartNewItemsCount > 0 ? (
                <span className="absolute right-1 top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sky-700 px-1 text-[9px] font-bold leading-none text-white">
                  {cartNewItemsCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={onOpenVoiceFromNav}
              disabled={!canStartVoiceFromNav}
              className={`inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                canStartVoiceFromNav
                  ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
              title={aiOrderLabel}
              aria-label={aiOrderLabel}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span className="block whitespace-nowrap">{aiOrderLabel}</span>
            </button>
          </div>
        </div>
      )}

      <VoiceOrderController
        restaurantId={restaurantIdentifier || id || slug}
        tableId={resolvedTableForActions || table}
        products={safeProducts}
        onAddToCart={handleVoiceDraftAddToCart}
        onConfirmOrder={orderType ? handleVoiceDraftConfirmOrder : undefined}
        language={lang}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        canStartVoiceOrder={Boolean(resolvedOrderTypeForActions) && (!showHome || showStatus)}
        onRequireOrderType={handleVoiceRequireOrderType}
        forceMinimized={Boolean(showStatus)}
        hideMiniButton={showHome || !isDesktopLayout}
        openEventName={!isDesktopLayout ? "qr:voice-order-open" : ""}
        closeEventName={!isDesktopLayout ? "qr:voice-order-close" : ""}
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
          const hasCartItems = toArray(safeCart).length > 0;
          setShowAddModal(false);
          setReturnHomeAfterAdd(false);
          if (hasCartItems) {
            window.dispatchEvent(new Event("qr:cart-open"));
            return;
          }
          setForceHome(true);
          setShowDeliveryForm(false);
          setShowTakeawayForm(false);
          setShowStatus(false);
        }}
        onAddToCart={(item) => {
          storage.setItem("qr_cart_auto_open", "1");
          setCart((prev) => [...prev, item]);
          setShowAddModal(false);
          setShowStatus(false);
          if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
            window.requestAnimationFrame(() => {
              window.dispatchEvent(new Event("qr:cart-open"));
            });
          } else {
            window.dispatchEvent(new Event("qr:cart-open"));
          }
          if (returnHomeAfterAdd) {
            // Home-product flow should return home with cart open.
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
          tables={tables}
          occupiedTables={occupiedTables}
          reservedTables={safeReservedTables}
          formatTableName={formatTableName}
          onClose={() => {
            setShowTakeawayForm(false);
            setOrderType(null);
          }}
          onSubmit={async (form) => {
            if (!form) {
              setTakeaway({
                name: "",
                phone: "",
                pickup_date: "",
                pickup_time: "",
                mode: "reservation",
                table_number: "",
                reservation_clients: "",
                notes: "",
                payment_method: "",
              });
              setShowTakeawayForm(false);
              return;
            }

            if (String(form?.mode || "").toLowerCase() === "reservation") {
              const tableNumber = Number(form?.table_number);
              if (!Number.isFinite(tableNumber) || tableNumber <= 0) {
                alert(t("Please select an available table."));
                return;
              }
              if (safeOccupiedTables.includes(tableNumber)) {
                alert(t("This table is currently occupied. Please select another table."));
                return;
              }

              try {
                setSubmitting(true);
                const response = await secureFetch(appendIdentifier("/orders/reservations"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    table_number: tableNumber,
                    reservation_date: form.pickup_date,
                    reservation_time: form.pickup_time,
                    reservation_clients: Number(form.reservation_clients) || 1,
                    reservation_notes: form.notes || "",
                    customer_name: form.name || null,
                    customer_phone: form.phone || null,
                  }),
                });

                const reservationOrderId = Number(response?.reservation?.id);
                setTakeaway(form);
                setShowTakeawayForm(false);
                setOrderType("table");
                setTable(tableNumber);
                storage.setItem("qr_orderType", "table");
                storage.setItem("qr_table", String(tableNumber));
                storage.setItem("qr_show_status", "1");
                setOrderStatus("success");
                setShowStatus(true);
                if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
                  storage.setItem("qr_force_status_until_closed", "1");
                  setOrderId(reservationOrderId);
                  storage.setItem("qr_active_order_id", String(reservationOrderId));
                  storage.setItem(
                    "qr_active_order",
                    JSON.stringify({
                      orderId: reservationOrderId,
                      orderType: "table",
                      table: tableNumber,
                    })
                  );
                }
              } catch (err) {
                console.error("❌ Failed to save reservation from QR menu:", err);
                alert(err?.message || t("Failed to save reservation"));
              } finally {
                setSubmitting(false);
              }
              return;
            }

            setTakeaway(form);
            setShowTakeawayForm(false);
          }}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
        />
      )}

      {suppressMenuFlash && (
        <div className="fixed inset-0 z-[120] bg-white" aria-hidden="true" />
      )}
    </>
  );
}
