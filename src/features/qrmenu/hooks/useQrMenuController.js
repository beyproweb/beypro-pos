import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import secureFetch from "../../../utils/secureFetch";
import { Html5Qrcode } from "html5-qrcode";
import { io } from "socket.io-client";
import { useSocketIO as useOrderSocket } from "../../../components/OrderStatusScreen";
import useQrMenuProducts from "./useQrMenuProducts";
import useQrMenuCart from "./useQrMenuCart";
import useQrMenuCheckout from "./useQrMenuCheckout";
import useQrMenuStorage from "./useQrMenuStorage";

export function useQrMenuController({
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
}) {
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

const parseArray = useCallback((raw) => {
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}, []);

  const {
    lang,
    setLang,
    t,
    showIosHelp,
    setShowIosHelp,
    showHelp,
    setShowHelp,
    platform,
    setPlatform,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    getSavedDeliveryInfo,
    handleInstallClick,
    handleDownloadQr,
  } = useQrMenuStorage({
    slug,
    id,
    QR_TOKEN_KEY,
    API_URL,
    restaurantIdentifierResolved,
    restaurantIdentifier,
    makeT,
    storage,
    getStoredToken,
    getPlatform,
    BEYPRO_APP_STORE_URL,
    BEYPRO_PLAY_STORE_URL,
    appendIdentifier,
  });

  const [brandName, setBrandName] = useState("");

  const [table, setTable] = useState(() => {
    // Prefer explicit table number from QR link, else start empty
    const fromUrl = getTableFromLocation();
    return fromUrl ?? null;
  });
  const [customerInfo, setCustomerInfo] = useState(null);
  const {
    categories,
    setCategories,
    products,
    setProducts,
    extrasGroups,
    setExtrasGroups,
    activeCategory,
    setActiveCategory,
    categoryImages,
    setCategoryImages,
    menuSearch,
    setMenuSearch,
    safeProducts,
    safeCategories,
    safeExtrasGroups,
    productsForGrid,
  } = useQrMenuProducts({
    API_URL,
    restaurantIdentifier,
    appendIdentifier,
    toArray,
  });
  const { cart, setCart, safeCart } = useQrMenuCart({ storage, toArray });

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

  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderScreenStatus, setOrderScreenStatus] = useState(null);
  const setLoyaltyEligibilityFromOrder = useCallback((order) => {
    if (!order) return;
    const status = String(order?.status || "").toLowerCase();
    const isClosed = status === "closed" || status === "completed";
    // In this system, a closed/completed order is treated as paid for loyalty purposes
    // (many cash orders go straight to "closed" without an intermediate "paid" state).
    const isPaid =
      isClosed ||
      status === "paid" ||
      String(order?.payment_status || "").toLowerCase() === "paid" ||
      String(order?.payment_state || "").toLowerCase() === "paid";

    try {
      const existingEligible = storage.getItem("qr_loyalty_eligible_order_id") || "";
      const stamped = storage.getItem("qr_loyalty_stamped_order_id") || "";

      if (isClosed && isPaid && order?.id) {
        storage.setItem("qr_loyalty_eligible_order_id", String(order.id));
      } else if (!existingEligible || existingEligible === stamped) {
        // Only clear when there's no outstanding eligible (un-stamped) order.
        storage.removeItem("qr_loyalty_eligible_order_id");
      }
      window.dispatchEvent(new Event("qr:loyalty-change"));
    } catch {}
  }, []);
  const [orderType, setOrderType] = useState(() => {
    // For QR links we can pre-lock the flow
    const mode = getQrModeFromLocation();
    if (mode === "table") return "table";
    if (mode === "delivery") return "online";
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
  const [shopIsOpen, setShopIsOpen] = useState(true);
	const [suppressMenuFlash, setSuppressMenuFlash] = useState(true);
	const tableScannerRef = useRef(null);
	const tableScanInFlight = useRef(false);
	const [showTableScanner, setShowTableScanner] = useState(false);
  const [tableScanTarget, setTableScanTarget] = useState(null);
  const [tableScanError, setTableScanError] = useState("");
  const deliveredResetRef = useRef({ orderId: null, timeoutId: null });

  const safeOccupiedTables = useMemo(() => toArray(occupiedTables), [occupiedTables]);
  const hasActiveOrder = useMemo(() => {
    if (!activeOrder) return false;
    const s = (activeOrder.status || "").toLowerCase();
    return !["closed", "completed", "canceled"].includes(s);
  }, [activeOrder]);
  const [qrVoiceListening, setQrVoiceListening] = useState(false);
  const [qrVoiceParsing, setQrVoiceParsing] = useState(false);
  const [qrVoiceTranscript, setQrVoiceTranscript] = useState("");
  const [qrVoiceResult, setQrVoiceResult] = useState(null);
  const [qrVoiceError, setQrVoiceError] = useState("");
  const [qrVoiceModalOpen, setQrVoiceModalOpen] = useState(false);
  const [qrVoiceLogId, setQrVoiceLogId] = useState(null);
  const qrVoiceRecognitionRef = useRef(null);
  const qrVoiceLanguage = useMemo(() => {
    const stored =
      storage.getItem("beyproGuestLanguage") ||
      storage.getItem("beyproLanguage") ||
      lang ||
      "en";
    return String(stored).split("-")[0] || "en";
  }, [lang]);
  const getQrSpeechRecognition = useCallback(() => {
    if (qrVoiceRecognitionRef.current !== null) return qrVoiceRecognitionRef.current;
    if (typeof window === "undefined") return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    qrVoiceRecognitionRef.current = SR || null;
    return qrVoiceRecognitionRef.current;
  }, []);
  const parseQrVoiceTranscript = useCallback(
    async (transcriptText) => {
      const text = String(transcriptText || "").trim();
      if (!text) return;
      setQrVoiceParsing(true);
      setQrVoiceError("");
      setQrVoiceResult(null);
      try {
        const token = getStoredToken();
        const response = await fetch(`${API_URL}/voice/parse-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            restaurant_identifier: restaurantIdentifier,
            transcript: text,
            language: qrVoiceLanguage,
            order_type: "table",
            table_id: table || null,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Voice parse failed");
        }
        const payload = await response.json();
        setQrVoiceResult(payload);
        setQrVoiceLogId(payload?.log_id || null);
      } catch (err) {
        console.error("❌ QR voice parse failed:", err);
        setQrVoiceError(err?.message || t("Voice parsing failed"));
      } finally {
        setQrVoiceParsing(false);
      }
    },
    [qrVoiceLanguage, restaurantIdentifier, table, t]
  );
  const startQrVoiceCapture = useCallback(() => {
    if (orderType !== "table") {
      setQrVoiceModalOpen(true);
      setQrVoiceError(t("Voice ordering is available for table orders."));
      return;
    }
    const SR = getQrSpeechRecognition();
    if (!SR) {
      setQrVoiceModalOpen(true);
      setQrVoiceError(t("Voice recognition not supported in this browser"));
      return;
    }
    setQrVoiceModalOpen(true);
    setQrVoiceError("");
    setQrVoiceResult(null);
    setQrVoiceTranscript("");
    const rec = new SR();
    rec.lang = qrVoiceLanguage || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    let safetyStop = null;
    rec.onstart = () => {
      setQrVoiceListening(true);
      safetyStop = window.setTimeout(() => {
        try {
          rec.stop();
        } catch {}
      }, 10000);
    };
    rec.onerror = (evt) => {
      setQrVoiceListening(false);
      setQrVoiceError(evt?.error || "Mic error");
    };
    rec.onend = () => {
      setQrVoiceListening(false);
      if (safetyStop) window.clearTimeout(safetyStop);
    };
    rec.onresult = (evt) => {
      const text = Array.from(evt.results || [])
        .map((r) => r?.[0]?.transcript || "")
        .join(" ")
        .trim();
      setQrVoiceTranscript(text);
      if (text) parseQrVoiceTranscript(text);
    };
    try {
      rec.start();
    } catch (err) {
      setQrVoiceListening(false);
      setQrVoiceError(err?.message || "Mic start failed");
    }
  }, [getQrSpeechRecognition, orderType, parseQrVoiceTranscript, qrVoiceLanguage, t]);
  const injectQrVoiceItemsToCart = useCallback(
    async (items) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const byId = new Map(safeProducts.map((p) => [Number(p.id), p]));
      const byName = new Map(
        safeProducts.map((p) => [String(p?.name || "").toLowerCase(), p])
      );
      const nextItems = [];
      items.forEach((item) => {
        const product =
          byId.get(Number(item?.product_id)) ||
          byName.get(String(item?.product_name || "").toLowerCase());
        if (!product) return;
        const quantity = Math.max(1, Number(item?.quantity) || 1);
        const modifiers = Array.isArray(item?.modifiers) ? item.modifiers : [];
        const extras = [];
        const notes = [];
        modifiers.forEach((mod) => {
          const value = String(mod?.value || "").trim();
          if (!value) return;
          if (mod?.type === "remove") {
            notes.push(`${t("No")} ${value}`);
          } else {
            extras.push({ group: "Voice", name: value, quantity: 1, price: 0 });
          }
        });
        if (item?.size) notes.push(`${t("Size")}: ${item.size}`);
        nextItems.push({
          id: product.id,
          name: product.name,
          image: product.image,
          price: parseFloat(product.price) || 0,
          quantity,
          extras,
          note: notes.join(" • "),
          unique_id: `${product.id}-voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        });
      });
      if (nextItems.length === 0) {
        setQrVoiceError(t("Could not match items to the menu."));
        return;
      }
      setCart((prev) => [...toArray(prev), ...nextItems]);
      setQrVoiceModalOpen(false);
      setQrVoiceResult(null);
      setQrVoiceTranscript("");
      if (qrVoiceLogId) {
        try {
          const token = getStoredToken();
          await fetch(`${API_URL}/voice/logs/${qrVoiceLogId}/confirm`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              confirmed_json: { items },
              confidence_score: qrVoiceResult?.confidence_score ?? null,
            }),
          });
        } catch (err) {
          console.warn("voice log confirm failed:", err?.message);
        }
      }
    },
    [qrVoiceLogId, qrVoiceResult?.confidence_score, safeProducts, setCart, t]
  );

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
const {
  paymentMethod,
  setPaymentMethod,
  submitting,
  setSubmitting,
  handleSubmitOrder,
} = useQrMenuCheckout({
  storage,
  toArray,
  appendIdentifier,
  getStoredToken,
  getSavedDeliveryInfo,
  t,
  orderType,
  setOrderType,
  orderId,
  setOrderId,
  cart,
  setCart,
  customerInfo,
  setCustomerInfo,
  table,
  safeOccupiedTables,
  orderSelectCustomization,
  activeOrder,
  takeaway,
  setShowDeliveryForm,
  setShowStatus,
  setOrderStatus,
  setLastError,
  setOccupiedTables,
});

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

useEffect(() => {
  const timer = setTimeout(() => setSuppressMenuFlash(false), 250);
  return () => clearTimeout(timer);
}, []);

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
      const skipRestoreOnRefresh = !qrMode && !initialTableFromUrl;

      // On a normal refresh (no explicit table/delivery mode), always land on the home page
      // and do not re-open status/menu from prior sessions. This avoids "blink" loops.
      if (skipRestoreOnRefresh) {
        setShowStatus(false);
        storage.setItem("qr_show_status", "0");
        setOrderStatus("pending");
        setOrderId(null);
        setActiveOrder(null);
        setOrderScreenStatus(null);
        setOrderCancelReason("");
        setTable(null);
        setOrderType(null);
        setShowDeliveryForm(false);
        setShowTakeawayForm(false);
        setShowAddModal(false);
        setSelectedProduct(null);
        setPendingPopularProduct(null);
        setShowOrderTypePrompt(false);
        try {
          storage.removeItem("qr_active_order_id");
          storage.removeItem("qr_orderType");
          storage.removeItem("qr_table");
          storage.removeItem("qr_selected_table");
        } catch {}
        return;
      }

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
    setLoyaltyEligibilityFromOrder(order);
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
      setLoyaltyEligibilityFromOrder(data || null);

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
  let cancelled = false;

  const parseArray = (raw) =>
    Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

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
    if (!shopIsOpen) {
      alert(t("Closed"));
      return;
    }
    setForceHome(false);
    setOrderType(type);
    if (type === "online") {
      setShowDeliveryForm(true);
    }
    if (type === "takeaway") {
      setShowTakeawayForm(true);
    }
  },
  [setForceHome, setOrderType, setShowDeliveryForm, setShowTakeawayForm, shopIsOpen, t]
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

const handleMenuCategorySelect = useCallback(
  (cat) => {
    setActiveCategory(cat);
  },
  [setActiveCategory]
);

const handleMenuCategoryClick = useCallback(() => {
  setMenuSearch("");
}, [setMenuSearch]);

const handleMenuProductOpen = useCallback(
  (product) => {
    setSelectedProduct(product);
    setShowAddModal(true);
  },
  [setSelectedProduct, setShowAddModal]
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
const showTableSelector = !forceHome && orderType === "table" && !table;


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


  

  return {
    restaurantIdentifier,
    shareUrl,
    lang,
    setLang,
    t,
    showIosHelp,
    setShowIosHelp,
    showHelp,
    setShowHelp,
    platform,
    setPlatform,
    brandName,
    setBrandName,
    table,
    setTable,
    customerInfo,
    setCustomerInfo,
    categories,
    setCategories,
    products,
    setProducts,
    extrasGroups,
    setExtrasGroups,
    activeCategory,
    setActiveCategory,
    cart,
    setCart,
    selectedProduct,
    setSelectedProduct,
    showAddModal,
    setShowAddModal,
    occupiedTables,
    setOccupiedTables,
    showStatus,
    setShowStatus,
    orderStatus,
    setOrderStatus,
    orderId,
    setOrderId,
    tables,
    setTables,
    isDarkMain,
    setIsDarkMain,
    orderCancelReason,
    setOrderCancelReason,
    submitting,
    setSubmitting,
    categoryImages,
    setCategoryImages,
    lastError,
    setLastError,
    activeOrder,
    setActiveOrder,
    orderScreenStatus,
    setOrderScreenStatus,
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
    setSuppressMenuFlash,
    showTableScanner,
    setShowTableScanner,
    tableScanTarget,
    setTableScanTarget,
    tableScanError,
    setTableScanError,
    menuSearch,
    setMenuSearch,
    qrVoiceListening,
    setQrVoiceListening,
    qrVoiceParsing,
    setQrVoiceParsing,
    qrVoiceTranscript,
    setQrVoiceTranscript,
    qrVoiceResult,
    setQrVoiceResult,
    qrVoiceError,
    setQrVoiceError,
    qrVoiceModalOpen,
    setQrVoiceModalOpen,
    takeaway,
    setTakeaway,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    isDesktopLayout,
    setIsDesktopLayout,
    appendIdentifier,
    safeProducts,
    safeCategories,
    safeExtrasGroups,
    safeCart,
    safeOccupiedTables,
    hasActiveOrder,
    productsForGrid,
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
  };
}

export default useQrMenuController;
