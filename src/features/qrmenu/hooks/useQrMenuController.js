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
const FORCE_STATUS_UNTIL_CLOSE_KEY = "qr_force_status_until_closed";
const clampGuestCount = (value, fallback = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(20, Math.max(1, Math.floor(n)));
};
const normalizeOptionalGuestCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(20, Math.max(1, Math.floor(n)));
};
const isTerminalOrderStatus = (status) =>
  ["closed", "completed", "cancelled", "canceled"].includes(
    String(status || "").toLowerCase()
  );
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
if (!restaurantIdentifier && typeof window !== "undefined") {
  try {
    const storedRestaurantId = window?.localStorage?.getItem("restaurant_id");
    const parsed = storedRestaurantId ? Number(storedRestaurantId) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      restaurantIdentifier = String(parsed);
    }
  } catch {
    // ignore local storage read failures
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

  const [resolvedRestaurantId, setResolvedRestaurantId] = useState(() => {
    try {
      const stored = window?.localStorage?.getItem("restaurant_id");
      const n = stored ? Number(stored) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}
    return parseRestaurantIdFromIdentifier(restaurantIdentifier);
  });

  const socketRestaurantId = useMemo(() => {
    const n = Number(resolvedRestaurantId);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [resolvedRestaurantId]);

  useEffect(() => {
    const parsed = parseRestaurantIdFromIdentifier(restaurantIdentifier);
    if (Number.isFinite(parsed) && parsed > 0) {
      setResolvedRestaurantId(parsed);
      return;
    }
    setResolvedRestaurantId(null);
    if (!restaurantIdentifier) return;
    let alive = true;
    (async () => {
      try {
        const info = await secureFetch(
          `/public/restaurant-info?identifier=${encodeURIComponent(restaurantIdentifier)}`
        );
        if (!alive) return;
        const idValue = Number(info?.id);
        if (!Number.isFinite(idValue) || idValue <= 0) return;
        setResolvedRestaurantId(idValue);
        try {
          window?.localStorage?.setItem("restaurant_id", String(idValue));
        } catch {}
      } catch {
        // no-op: fallback paths continue to work without realtime
      }
    })();
    return () => {
      alive = false;
    };
  }, [restaurantIdentifier, parseRestaurantIdFromIdentifier]);

const shareUrl = useMemo(() => {
  const origin = window.location.origin;
  const s = slug && slug !== "null" && slug !== "undefined" ? slug : null;

  if (!s) return `${origin}/qr-menu`;

  return `${origin}/qr-menu/${s}/scan`;
}, [slug]);

const parseArray = useCallback((raw) => {
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
}, []);
const parseOrderItemsPayload = useCallback((raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.order_items)) return raw.order_items;
  return [];
}, []);

const parseReservationDateTimeMs = (reservationDate, reservationTime) => {
  if (!reservationDate) return NaN;
  const dateRaw = String(reservationDate).trim();
  if (!dateRaw) return NaN;
  const timeRaw = reservationTime ? String(reservationTime).trim() : "00:00:00";
  const hhmmss = timeRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmmss) {
    const hours = Math.max(0, Math.min(23, Number(hhmmss[1])));
    const minutes = Math.max(0, Math.min(59, Number(hhmmss[2])));
    const seconds = Math.max(0, Math.min(59, Number(hhmmss[3] || 0)));
    const dateParts = dateRaw.split("-").map(Number);
    if (dateParts.length === 3 && dateParts.every((v) => Number.isFinite(v))) {
      const [year, month, day] = dateParts;
      return new Date(year, month - 1, day, hours, minutes, seconds, 0).getTime();
    }
  }
  const fallback = new Date(`${dateRaw}T${timeRaw || "00:00:00"}`).getTime();
  return Number.isFinite(fallback) ? fallback : NaN;
};

const isReservationLikeEntry = (entry) => {
  if (!entry || typeof entry !== "object") return false;
  const nested =
    entry?.reservation && typeof entry.reservation === "object" ? entry.reservation : null;
  return Boolean(
    entry?.reservation_id ||
      entry?.reservationId ||
      entry?.reservation_date ||
      entry?.reservationDate ||
      entry?.reservation_time ||
      entry?.reservationTime ||
      nested?.id ||
      nested?.reservation_id ||
      nested?.reservationId ||
      nested?.reservation_date ||
      nested?.reservationDate ||
      nested?.reservation_time ||
      nested?.reservationTime
  );
};

const isReservationDueNow = (entry, nowMs = Date.now()) => {
  if (!isReservationLikeEntry(entry)) return false;
  const reservationDate = entry?.reservation_date ?? entry?.reservationDate ?? null;
  const reservationTime = entry?.reservation_time ?? entry?.reservationTime ?? null;
  if (!reservationDate) return true;
  const scheduledMs = parseReservationDateTimeMs(reservationDate, reservationTime);
  if (!Number.isFinite(scheduledMs)) return true;
  return nowMs >= scheduledMs;
};

const hasActiveReservationPayload = (entry) => {
  return isReservationLikeEntry(entry);
};

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
  const [reservedTables, setReservedTables] = useState([]);
  const [showStatus, setShowStatus] = useState(false);
  const [orderStatus, setOrderStatus] = useState("pending");
  const [orderId, setOrderId] = useState(null);
  const [tables, setTables] = useState([]);
  const [isDarkMain, setIsDarkMain] = React.useState(false);
  const [orderCancelReason, setOrderCancelReason] = useState("");
  const orderIdToTableRef = useRef(new Map());
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [callWaiterCooldownUntil, setCallWaiterCooldownUntil] = useState(0);
  const [callWaiterTickMs, setCallWaiterTickMs] = useState(() => Date.now());

  const [lastError, setLastError] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [orderScreenStatus, setOrderScreenStatus] = useState(null);
  const isForcedStatusActive = useCallback(() => {
    const forced = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
    if (!forced) return false;
    const activeIdRaw = orderId || storage.getItem("qr_active_order_id");
    const activeId = Number(activeIdRaw);
    if (!Number.isFinite(activeId) || activeId <= 0) return false;
    return true;
  }, [orderId, storage]);
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
  const [tableScanGuests, setTableScanGuests] = useState(() =>
    normalizeOptionalGuestCount(storage.getItem("qr_table_guests"))
  );
  const [tableScanReady, setTableScanReady] = useState(false);
  const [tableScanError, setTableScanError] = useState("");
  const deliveredResetRef = useRef({ orderId: null, timeoutId: null });

  const safeOccupiedTables = useMemo(() => toArray(occupiedTables), [occupiedTables]);
  const safeReservedTables = useMemo(() => toArray(reservedTables), [reservedTables]);
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
  mode: "reservation", // "pickup" | "reservation"
  table_number: "",
  notes: "",
  payment_method: "",
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
  setTableScanReady(false);
  setTableScanError("");
  tableScanInFlight.current = false;
  stopTableScanner();
}, [stopTableScanner]);

const openTableScanner = useCallback((tableNumber, guests = 1) => {
  if (!tableNumber) return;
  setTableScanGuests(normalizeOptionalGuestCount(guests));
  setTableScanReady(false);
  setTableScanTarget(tableNumber);
  setTableScanError("");
  setShowTableScanner(true);
}, []);

const startTableScannerWithGuests = useCallback((guests) => {
  const normalized = normalizeOptionalGuestCount(guests);
  if (!normalized) return false;
  setTableScanGuests(normalized);
  storage.setItem("qr_table_guests", String(normalized));
  setTableScanError("");
  setTableScanReady(true);
  return true;
}, [storage]);

const syncTableGuestsFromQr = useCallback(
  async (tableNumber, guests) => {
    const normalizedTable = Number(tableNumber);
    const normalizedGuests = normalizeOptionalGuestCount(guests);
    if (!Number.isFinite(normalizedTable) || normalizedTable <= 0 || !normalizedGuests) return;
    try {
      await secureFetch(appendIdentifier(`/tables/${normalizedTable}`), {
        method: "PATCH",
        body: JSON.stringify({ guests: normalizedGuests }),
      });
    } catch (err) {
      // Public QR flows may not have staff auth; ignore and rely on order reservation fallback.
      console.warn("⚠️ QR guest sync to table config failed:", err?.message || err);
    }
  },
  [appendIdentifier]
);

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
      const normalizedGuests = clampGuestCount(tableScanGuests, 1);
      setShowTableScanner(false);
      setTableScanError("");
      setTableScanReady(false);
      setTable(finalTable);
      saveSelectedTable(finalTable);
      storage.setItem("qr_table_guests", String(normalizedGuests));
      syncTableGuestsFromQr(finalTable, normalizedGuests);
      tableScanInFlight.current = false;
    });
  },
  [
    saveSelectedTable,
    setTable,
    stopTableScanner,
    storage,
    syncTableGuestsFromQr,
    t,
    tableScanGuests,
    tableScanTarget,
  ]
);
  const resetToTypePicker = () => {
    if (isForcedStatusActive()) {
      setShowStatus(true);
      storage.setItem("qr_show_status", "1");
      return;
    }
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
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
    let rows = [];
    try {
      // Keep QR table settings aligned with TableOverview/Settings source of truth.
      const scoped = await secureFetch(
        appendIdentifier(`/tables?active=true&identifier=${encodeURIComponent(restaurantIdentifier)}`)
      );
      rows = Array.isArray(scoped) ? scoped : scoped?.data || [];
    } catch {
      const res = await fetch(
        `${API_URL}/public/tables/${encodeURIComponent(restaurantIdentifier)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      rows = Array.isArray(payload) ? payload : payload.data || [];
    }

    const normalized = rows.map((r) => ({
      tableNumber: r.number ?? r.tableNumber ?? r.table_number,
      area: r.area || "Main Hall",
      seats: r.seats || r.chairs || 0,
      guests:
        r.guests === null || r.guests === undefined || r.guests === ""
          ? null
          : Number(r.guests),
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
  if (!showTableScanner || !tableScanReady) return;
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
}, [handleTableScanSuccess, showTableScanner, stopTableScanner, t, tableScanReady]);

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
  if (isForcedStatusActive()) {
    setShowStatus(true);
    storage.setItem("qr_show_status", "1");
    return;
  }
  const hasCartItems = Array.isArray(cart) && cart.length > 0;

  // Requested behavior:
  // - If cart has items, reopen cart.
  // - If cart is empty, go home.
  if (hasCartItems) {
    setShowStatus(false);
    window.dispatchEvent(new Event("qr:cart-open"));
    return;
  }

  if (!hasCartItems) {
    resetTableIfEmptyCart();
    resetToTypePicker();
    return;
  }
}



// Bootstrap on refresh: restore by saved order id, else by saved table
// Bootstrap on refresh: restore by saved order id, else by saved table
useEffect(() => {
  (async () => {
    try {
      const activeId = storage.getItem("qr_active_order_id");
      const forceStatusOpen = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
      const wantsStatusOpen =
        forceStatusOpen || storage.getItem("qr_show_status") === "1";
      const skipRestoreOnRefresh = !qrMode && !initialTableFromUrl;

      // On a normal refresh (no explicit table/delivery mode), always land on the home page
      // and do not re-open status/menu from prior sessions. This avoids "blink" loops.
      if (skipRestoreOnRefresh && !forceStatusOpen) {
        setShowStatus(false);
        storage.setItem("qr_show_status", "0");
        storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
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
if (activeId) {
  try {
    order = await secureFetch(appendIdentifier(`/orders/${activeId}`), {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
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
  try {
    const q = await secureFetch(appendIdentifier(`/orders?table_number=${savedTable}`), {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });

    const list = parseArray(q);

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


      // 3️⃣ Nothing to restore
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
      resetToTypePicker();
    } catch (err) {
      console.error("❌ QRMenu restore failed:", err);
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
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
      const data = await secureFetch(appendIdentifier(`/orders/${orderId}`), opts);
      setActiveOrder(data || null);
      setLoyaltyEligibilityFromOrder(data || null);

      const s = (data?.status || "").toLowerCase();
      const forceActive = storage.getItem(FORCE_STATUS_UNTIL_CLOSE_KEY) === "1";
      const wantsStatusOpen = storage.getItem("qr_show_status") === "1";
      if (!s) {
        setOrderScreenStatus(null);
        return;
      }
      const lostReservationPayload = !hasActiveReservationPayload(data);
      const resolvedTableNo = Number(
        data?.table_number ??
          table ??
          storage.getItem("qr_table") ??
          storage.getItem("qr_selected_table") ??
          null
      );
      const tableStillReserved =
        Number.isFinite(resolvedTableNo) &&
        resolvedTableNo > 0 &&
        safeReservedTables.some((n) => Number(n) === resolvedTableNo);
      let hasActiveOrderItems = false;
      if (forceActive && lostReservationPayload && s !== "reserved" && !tableStillReserved) {
        try {
          const tokenForItems = getStoredToken();
          const itemsRaw = await secureFetch(appendIdentifier(`/orders/${orderId}/items`), {
            ...(tokenForItems
              ? { headers: { Authorization: `Bearer ${tokenForItems}` } }
              : {}),
          });
          const items = parseOrderItemsPayload(itemsRaw);
          hasActiveOrderItems = items.some((item) => {
            const qty = Number(item?.quantity ?? 1);
            if (!Number.isFinite(qty) || qty <= 0) return false;
            const state = String(
              item?.status || item?.item_status || item?.kitchen_status || ""
            ).toLowerCase();
            return !["canceled", "cancelled", "deleted", "void"].includes(state);
          });
        } catch {
          // If items cannot be fetched, fail-safe to keep status open for active table orders.
          hasActiveOrderItems = true;
        }
      }
      // Keep force-status active while order is still reserved.
      // Reservation payload can momentarily be missing during sync transitions.
      if (
        forceActive &&
        (isTerminalOrderStatus(s) ||
          (lostReservationPayload &&
            s !== "reserved" &&
            !tableStillReserved &&
            !hasActiveOrderItems))
      ) {
        storage.removeItem(FORCE_STATUS_UNTIL_CLOSE_KEY);
        storage.setItem("qr_show_status", "0");
        setShowStatus(false);
        setOrderId(null);
        setActiveOrder(null);
        setOrderScreenStatus(null);
        resetToTypePicker();
        return;
      }
      setOrderScreenStatus(s);
      const keepHiddenWhileReserved = forceActive && s === "reserved" && !wantsStatusOpen;
      if (forceActive && !keepHiddenWhileReserved) {
        setShowStatus(true);
        storage.setItem("qr_show_status", "1");
      } else if (keepHiddenWhileReserved) {
        setShowStatus(false);
      }
      setOrderCancelReason(
        s === "canceled" || s === "cancelled"
          ? data?.cancellation_reason || data?.cancel_reason || data?.cancelReason || ""
          : ""
      );

      // Keep status visible for cancelled/closed only when user didn't intentionally hide it.
      // This prevents status-vs-cart flicker when opening cart from the bottom nav.
      if (s === "canceled" || s === "cancelled" || s === "closed") {
        const shouldKeepOpen = forceActive || storage.getItem("qr_show_status") === "1";
        if (shouldKeepOpen) {
          setShowStatus(true);
          storage.setItem("qr_show_status", "1");
        }
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
  }, [
    orderId,
    appendIdentifier,
    parseOrderItemsPayload,
    resetToTypePicker,
    storage,
    table,
    safeReservedTables,
    getStoredToken,
    setLoyaltyEligibilityFromOrder,
  ]);

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
    const nextOccupiedSet = new Set();
    const nextReservedSet = new Set();
    let hasAnySource = false;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const todayYmd = `${yyyy}-${mm}-${dd}`;

    const addNumbers = (targetSet, values) => {
      toArray(values).forEach((value) => {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) targetSet.add(n);
      });
    };

    try {
      if (restaurantIdentifier) {
        try {
          const token = getStoredToken();
          const authOpts = token
            ? {
                headers: { Authorization: `Bearer ${token}` },
              }
            : {};
          let payload = null;
          try {
            payload = await secureFetch(
              appendIdentifier(
                `/public/unavailable-tables/${encodeURIComponent(restaurantIdentifier)}`
              ),
              authOpts
            );
          } catch (primaryErr) {
            const retryLegacy = /401|404|405|unauthorized|token missing/i.test(
              String(primaryErr?.message || "")
            );
            if (!retryLegacy) throw primaryErr;
            // Backward-compat for older production API shape.
            payload = await secureFetch(
              appendIdentifier(
                `/public/unavailable-tables?identifier=${encodeURIComponent(
                  restaurantIdentifier
                )}`
              ),
              authOpts
            );
          }
          addNumbers(nextOccupiedSet, payload?.table_numbers);
          addNumbers(nextReservedSet, payload?.reserved_table_numbers);
          hasAnySource = true;
        } catch (err) {
          console.warn("⚠️ Public unavailable tables fetch failed:", err);
        }

        try {
          // Public fallback: derive reservation occupancy from table orders by identifier.
          const ordersPayload = await secureFetch(
            `/orders?identifier=${encodeURIComponent(restaurantIdentifier)}&type=table`
          );
          const orderRows = parseArray(ordersPayload);
          const nowMs = Date.now();

          const occupiedFromPublicOrders = toArray(orderRows)
            .filter((order) => {
              const status = String(order?.status || "").toLowerCase();
              if (["closed", "completed", "canceled", "cancelled"].includes(status)) {
                return false;
              }
              if (isReservationLikeEntry(order)) return isReservationDueNow(order, nowMs);
              return true;
            })
            .map((order) => Number(order?.table_number))
            .filter((n) => Number.isFinite(n) && n > 0);

          const reservedFromPublicOrders = toArray(orderRows)
            .filter((order) => {
              const status = String(order?.status || "").toLowerCase();
              if (["canceled", "cancelled"].includes(status)) return false;
              if (!isReservationLikeEntry(order)) return false;
              if (!isReservationDueNow(order, nowMs)) return false;

              if (["closed", "completed"].includes(status)) {
                const reservationDate =
                  String(order?.reservation_date ?? order?.reservationDate ?? "").trim();
                // Allow legacy closed+reservation rows only for today's schedule.
                if (!reservationDate || reservationDate !== todayYmd) return false;
              }
              return true;
            })
            .map((order) => Number(order?.table_number))
            .filter((n) => Number.isFinite(n) && n > 0);

          addNumbers(nextOccupiedSet, occupiedFromPublicOrders);
          // Public orders source is authoritative enough to prevent stale reserved badges.
          nextReservedSet.clear();
          addNumbers(nextReservedSet, reservedFromPublicOrders);
          addNumbers(nextOccupiedSet, reservedFromPublicOrders);
          hasAnySource = true;
        } catch (err) {
          console.warn("⚠️ Public orders fallback fetch failed:", err);
        }
      }

      const token = getStoredToken();
      if (token) {
        const [ordersRes, reservationsRes] = await Promise.allSettled([
          sFetch("/orders", { headers: { Authorization: `Bearer ${token}` } }),
          sFetch(`/orders/reservations?start_date=${todayYmd}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (ordersRes.status !== "fulfilled") {
          throw ordersRes.reason || new Error("Failed to fetch orders");
        }

        const list = parseArray(ordersRes.value);
        const reservationsRaw =
          reservationsRes.status === "fulfilled" ? reservationsRes.value : [];
        const reservations = Array.isArray(reservationsRaw?.reservations)
          ? reservationsRaw.reservations
          : Array.isArray(reservationsRaw)
          ? reservationsRaw
          : [];
        try {
          const nextMap = new Map();
          toArray(list).forEach((o) => {
            const oid = Number(o?.id);
            const tno = Number(o?.table_number);
            if (Number.isFinite(oid) && Number.isFinite(tno) && tno > 0) nextMap.set(oid, tno);
          });
          orderIdToTableRef.current = nextMap;
        } catch {}
        const nowMs = Date.now();
        const occupiedFromOrders = toArray(list)
          .filter((order) => {
            if (!order?.table_number) return false;
            const status = String(order?.status || "").toLowerCase();
            if (["closed", "completed", "canceled", "cancelled"].includes(status)) return false;
            if (isReservationLikeEntry(order)) return isReservationDueNow(order, nowMs);
            return true;
          })
          .map((order) => Number(order.table_number))
          .filter((n) => Number.isFinite(n) && n > 0);
        const occupiedFromReservations = toArray(reservations)
          .filter((reservation) => {
            const status = String(reservation?.status || "").toLowerCase();
            if (["closed", "completed", "canceled", "cancelled"].includes(status)) return false;
            return isReservationDueNow(reservation, nowMs);
          })
          .map((reservation) =>
            Number(
              reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
            )
          )
          .filter((n) => Number.isFinite(n) && n > 0);
        const reservedFromOrders = toArray(list)
          .filter((order) => {
            const status = String(order?.status || "").toLowerCase();
            if (["closed", "completed", "canceled", "cancelled"].includes(status)) return false;
            if (!isReservationLikeEntry(order)) return false;
            return isReservationDueNow(order, nowMs);
          })
          .map((order) => Number(order?.table_number))
          .filter((n) => Number.isFinite(n) && n > 0);
        const reservedFromReservations = toArray(reservations)
          .filter((reservation) => {
            const status = String(reservation?.status || "").toLowerCase();
            if (["closed", "completed", "canceled", "cancelled"].includes(status)) return false;
            return isReservationDueNow(reservation, nowMs);
          })
          .map((reservation) =>
            Number(
              reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
            )
          )
          .filter((n) => Number.isFinite(n) && n > 0);
        addNumbers(nextOccupiedSet, occupiedFromOrders);
        addNumbers(nextOccupiedSet, occupiedFromReservations);
        // Authenticated orders/reservations are authoritative for reserved state.
        nextReservedSet.clear();
        addNumbers(nextReservedSet, reservedFromOrders);
        addNumbers(nextReservedSet, reservedFromReservations);
        hasAnySource = true;
      }

      if (!hasAnySource && !restaurantIdentifier && !token) {
        setOccupiedTables([]);
        setReservedTables([]);
        return;
      }
      if (!hasAnySource) {
        // Keep previous availability state when fetch sources are temporarily unavailable.
        return;
      }
      setOccupiedTables(Array.from(nextOccupiedSet));
      setReservedTables(Array.from(nextReservedSet));
    } catch (err) {
      console.warn("⚠️ Failed to refresh occupied tables:", err);
      // Preserve previous known state on transient errors.
    }
  }, [appendIdentifier, getStoredToken, restaurantIdentifier, sFetch, toArray]);

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

    const upsertReserved = (tableNo) => {
      const n = Number(tableNo);
      if (!Number.isFinite(n) || n <= 0) return;
      setReservedTables((prev) => {
        const next = new Set(toArray(prev).map(Number));
        next.add(n);
        return Array.from(next);
      });
    };

    const removeReserved = (tableNo) => {
      const n = Number(tableNo);
      if (!Number.isFinite(n) || n <= 0) return;
      setReservedTables((prev) => toArray(prev).map(Number).filter((x) => x !== n));
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
      if (tableNo) {
        removeOccupied(tableNo);
        removeReserved(tableNo);
      }
      else if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) {
          removeOccupied(cached);
          removeReserved(cached);
        }
      }
      if (Number.isFinite(orderId)) orderIdToTableRef.current.delete(orderId);
      scheduleRefresh();
    };

    const onClosed = (payload) => {
      const orderId = Number(payload?.orderId ?? payload?.id);
      if (Number.isFinite(orderId)) {
        const cached = orderIdToTableRef.current.get(orderId);
        if (cached) {
          removeOccupied(cached);
          removeReserved(cached);
        }
        orderIdToTableRef.current.delete(orderId);
      }
      scheduleRefresh();
    };

    const onReservationCreated = (payload) => {
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      if (tableNo) {
        upsertOccupied(tableNo);
        upsertReserved(tableNo);
      }
      scheduleRefresh();
    };

    const onReservationUpdated = (payload) => {
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      if (tableNo) {
        upsertOccupied(tableNo);
        upsertReserved(tableNo);
      }
      scheduleRefresh();
    };

    const onReservationCancelled = (payload) => {
      const tableNo =
        payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number ??
        null;
      if (tableNo) {
        removeReserved(tableNo);
      }
      scheduleRefresh();
    };

    const onAny = () => scheduleRefresh();
    s.on("order_confirmed", onConfirmed);
    s.on("orders_updated", onAny);
    s.on("order_cancelled", onCancelled);
    s.on("order_closed", onClosed);
    s.on("reservation_created", onReservationCreated);
    s.on("reservation_updated", onReservationUpdated);
    s.on("reservation_cancelled", onReservationCancelled);
    s.on("reservation_deleted", onReservationCancelled);

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
        s.off("reservation_created", onReservationCreated);
        s.off("reservation_updated", onReservationUpdated);
        s.off("reservation_cancelled", onReservationCancelled);
        s.off("reservation_deleted", onReservationCancelled);
        s.disconnect();
      } catch {}
    };
  }, [socketRestaurantId, refreshOccupiedTables]);

useEffect(() => {
  let cancelled = false;

  loadTables();
  (async () => {
    await refreshOccupiedTables();
    if (cancelled) return;
  })().catch((err) => {
    console.warn("⚠️ Failed to load occupied tables:", err);
    if (!cancelled) setOccupiedTables([]);
  });

  return () => {
    cancelled = true;
  };
}, [appendIdentifier, refreshOccupiedTables]);

useEffect(() => {
  const intervalId = window.setInterval(() => {
    refreshOccupiedTables();
  }, 30000);
  return () => {
    window.clearInterval(intervalId);
  };
}, [refreshOccupiedTables]);



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
    // If order type is already chosen, open add-to-cart modal immediately.
    // This avoids getting stuck behind the order-type prompt/pending flow.
    const orderTypeReady =
      !!orderType &&
      !(orderType === "online" && showDeliveryForm) &&
      !(orderType === "takeaway" && showTakeawayForm);
    if (orderTypeReady) {
      const targetCategory = (product.category || "").trim();
      if (targetCategory) {
        setActiveCategory(targetCategory);
      }
      setReturnHomeAfterAdd(!!meta?.returnToHomeAfterAdd);
      setShowOrderTypePrompt(false);
      setPendingPopularProduct(null);
      setSelectedProduct(product);
      setShowAddModal(true);
      return;
    }

    setPendingPopularProduct(product);
    setReturnHomeAfterAdd(!!meta?.returnToHomeAfterAdd);
    setShowOrderTypePrompt(true);
  },
  [
    orderType,
    setActiveCategory,
    setPendingPopularProduct,
    setReturnHomeAfterAdd,
    setSelectedProduct,
    setShowAddModal,
    setShowOrderTypePrompt,
    showDeliveryForm,
    showTakeawayForm,
  ]
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
const filteredReserved = myTable
  ? safeReservedTables.filter((n) => n !== myTable)
  : safeReservedTables;
const showTableSelector = !forceHome && orderType === "table" && !table;


// ---- Rehydrate cart from current order (generate NEW unique_id for each line) ----
// ---- Rehydrate cart from current order, but mark them as locked (read-only) ----
async function rehydrateCartFromOrder(orderId) {
  try {
    const token = getStoredToken();
    let raw = null;
    try {
      raw = await secureFetch(appendIdentifier(`/orders/${orderId}/items`), {
        ...(token
          ? {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          : {}),
      });
    } catch (primaryErr) {
      // Some QR flows can read order items publicly with identifier-scoped endpoints.
      // Retry once without auth header before giving up.
      if (!token) throw primaryErr;
      raw = await secureFetch(appendIdentifier(`/orders/${orderId}/items`));
    }

    const now36 = Date.now().toString(36);
    const lockedItems = parseOrderItemsPayload(raw)
      .map((it) => ({
        id: it.product_id ?? it.external_product_id,
        name: it.order_item_name || it.product_name || it.name || "Item",
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        extras: (() => {
          if (Array.isArray(it.extras)) return it.extras;
          if (typeof it.extras !== "string") return [];
          try {
            const parsed = JSON.parse(it.extras);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
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

async function hydrateCartFromActiveOrder() {
  const activeOrderId = Number(
    orderId ||
      activeOrder?.id ||
      storage.getItem("qr_active_order_id") ||
      null
  );
  if (!Number.isFinite(activeOrderId) || activeOrderId <= 0) return false;
  await rehydrateCartFromOrder(activeOrderId);
  setOrderId(activeOrderId);
  storage.setItem("qr_active_order_id", String(activeOrderId));
  storage.setItem("qr_show_status", "0");
  return true;
}

// ---- Order Another: show previous lines (locked), start fresh for new ones ----
async function handleOrderAnother() {
  const currentStatus = String(orderScreenStatus || activeOrder?.status || "").toLowerCase();
  const tableForLockCheck = Number(
    table ||
      storage.getItem("qr_table") ||
      storage.getItem("qr_selected_table") ||
      activeOrder?.table_number ||
      activeOrder?.tableNumber ||
      null
  );
  const reservedTableContextWhileLocked =
    Number.isFinite(tableForLockCheck) &&
    safeReservedTables.some((n) => Number(n) === Number(tableForLockCheck));
  const allowOrderAnotherWhileReserved =
    currentStatus === "reserved" ||
    currentStatus === "confirmed" ||
    reservedTableContextWhileLocked;
  if (isForcedStatusActive() && !allowOrderAnotherWhileReserved) {
    setShowStatus(true);
    storage.setItem("qr_show_status", "1");
    return;
  }
  try {
    setForceHome(false);
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    setOrderStatus("pending");

    // keep drawer closed; user opens if needed
    storage.setItem("qr_cart_auto_open", "0");
    window.dispatchEvent(new Event("qr:cart-close"));

    // resolve existing order
    let id = orderId || Number(storage.getItem("qr_active_order_id")) || null;
    let type = orderType || storage.getItem("qr_orderType") || (table ? "table" : null);
    let resolvedTableNo =
      Number(table) ||
      Number(storage.getItem("qr_table")) ||
      Number(storage.getItem("qr_selected_table")) ||
      null;

    // Check if current order is cancelled - if so, clear everything for fresh start
    if (id) {
      try {
        const token = getStoredToken();
        const res = await secureFetch(appendIdentifier(`/orders/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res) {
          const orderStatus = (res.status || "").toLowerCase();
          const fetchedTable = Number(res.table_number);
          if (Number.isFinite(fetchedTable) && fetchedTable > 0) {
            resolvedTableNo = fetchedTable;
          }
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
            const arr = Array.isArray(q) ? q : (Array.isArray(q?.data) ? q.data : []);
            const open = arr.find(o => (o?.status || "").toLowerCase() !== "closed") || null;
            if (open) {
              id = open.id;
              type = "table";
              const openTable = Number(open.table_number);
              if (Number.isFinite(openTable) && openTable > 0) {
                resolvedTableNo = openTable;
              }
              setOrderId(id);
              setOrderType("table");
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
      setOrderId(id);
      setOrderType("table");
      if (Number.isFinite(Number(resolvedTableNo)) && Number(resolvedTableNo) > 0) {
        const tableToUse = Number(resolvedTableNo);
        setTable(tableToUse);
        saveSelectedTable(tableToUse);
        storage.setItem("qr_table", String(tableToUse));
        storage.setItem("qr_selected_table", String(tableToUse));
      }
      storage.setItem("qr_active_order_id", String(id));
      storage.setItem("qr_orderType", "table");
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
		  if (isForcedStatusActive()) {
		    setShowStatus(true);
		    storage.setItem("qr_show_status", "1");
		    return;
		  }
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

  const handleCallWaiter = useCallback(async () => {
    const tableNumber =
      Number(table) ||
      Number(storage.getItem("qr_table")) ||
      Number(storage.getItem("qr_selected_table")) ||
      null;
    if (!restaurantIdentifier || !Number.isFinite(tableNumber) || tableNumber <= 0) {
      return { ok: false, reason: "missing_table" };
    }

    const now = Date.now();
    if (callWaiterCooldownUntil > now) {
      return { ok: false, reason: "cooldown", retryAfterMs: callWaiterCooldownUntil - now };
    }

    setCallingWaiter(true);
    try {
      const token = getStoredToken();
      const authOpts = token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : {};
      const callWaiterBody = {
        table_number: tableNumber,
        source: "qr_menu",
      };
      try {
        await secureFetch(`/public/call-waiter/${encodeURIComponent(restaurantIdentifier)}`, {
          method: "POST",
          ...authOpts,
          body: JSON.stringify(callWaiterBody),
        });
      } catch (primaryErr) {
        const retryLegacy = /401|404|405|unauthorized|token missing/i.test(
          String(primaryErr?.message || "")
        );
        if (!retryLegacy) throw primaryErr;
        // Backward-compat for older production API shape.
        await secureFetch(
          `/public/call-waiter?identifier=${encodeURIComponent(restaurantIdentifier)}`,
          {
            method: "POST",
            ...authOpts,
            body: JSON.stringify({
              ...callWaiterBody,
              identifier: restaurantIdentifier,
            }),
          }
        );
      }
      setCallWaiterCooldownUntil(Date.now() + 15000);
      return { ok: true };
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("429") || msg.includes("too many")) {
        setCallWaiterCooldownUntil(Date.now() + 15000);
        return { ok: false, reason: "cooldown", retryAfterMs: 15000 };
      }
      return { ok: false, reason: "failed" };
    } finally {
      setCallingWaiter(false);
    }
  }, [restaurantIdentifier, table, storage, callWaiterCooldownUntil, getStoredToken]);

  const callWaiterCooldownSeconds = Math.max(
    0,
    Math.ceil((callWaiterCooldownUntil - callWaiterTickMs) / 1000)
  );

  useEffect(() => {
    if (!callWaiterCooldownUntil || callWaiterCooldownUntil <= Date.now()) {
      setCallWaiterTickMs(Date.now());
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setCallWaiterTickMs(Date.now());
    }, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [callWaiterCooldownUntil]);


  

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
    reservedTables,
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
    tableScanGuests,
    setTableScanGuests,
    tableScanReady,
    startTableScannerWithGuests,
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
    safeReservedTables,
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
  };
}

export default useQrMenuController;
