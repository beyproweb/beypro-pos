import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PhoneOrderModal from "../modals/PhoneOrderModal";
import RegisterModal from "../features/register/RegisterModal";
import useTableOrdersData from "../features/orders/useTableOrdersData";
import TablesView from "../features/tables/TablesView";
import useTablesModel from "../features/tables/hooks/useTablesModel";
import {
  getDisplayTotal,
  hasReservationSignal,
  hasUnpaidAnywhere,
  formatLocalYmd,
  isOrderPaid,
  isOrderFullyPaid,
  isEffectivelyFreeOrder,
  isOrderCancelledOrCanceled,
  normalizeOrderStatus,
  parseLooseDateToMs,
} from "../features/tables/tableVisuals";
import Orders from "../pages/Orders"; // adjust path as needed!
import {
  buildReservationShadowRecord,
  removeReservationShadow,
  upsertReservationShadow,
} from "../features/orders/tableOrdersCache";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useAuth } from "../context/AuthContext";
import { checkRegisterOpen } from "../utils/checkRegisterOpen";
import { useRegisterGuard } from "../hooks/useRegisterGuard";
import OrderHistory from "../components/OrderHistory";
import { useHeader } from "../context/HeaderContext";
import { useNotifications } from "../context/NotificationsContext";
import { useAppearance } from "../context/AppearanceContext";
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import TableDensityToggle from "../features/tables/components/TableDensityToggle";
import {
  DEFAULT_TABLE_DENSITY,
  normalizeTableDensity,
} from "../features/tables/tableDensity";
import secureFetch from "../utils/secureFetch";
import { printViaBridge } from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { useCurrency } from "../context/CurrencyContext";
import {
  hasConcertBookingContext,
  isConcertBookingConfirmed,
  isReservationConfirmedForCheckin,
  isReservationPendingConfirmation,
  hasReservationServiceActivity,
} from "../utils/reservationStatus";
import {
  RenderCounter,
  isTablePerfDebugEnabled,
  markPerfTrace,
  useRenderCount,
  withPerfTimer,
} from "../features/tables/dev/perfDebug";
import {
  generateTableOverviewStressData,
  mutateStressDataByAction,
} from "../features/tables/dev/stressData";
import socket from "../utils/socket";
import {
  hasReservationCheckinWindowRules,
  normalizeQrBookingSettings,
  QR_BOOKING_DEFAULTS,
} from "../utils/qrBooking";
import {
  isReservationCheckinNotFoundError,
  postReservationCheckinWithFallback,
} from "../utils/reservationCheckin";

const PERF_DEBUG_ENABLED = isTablePerfDebugEnabled();
const DEFAULT_STRESS_CONFIG = Object.freeze({
  tableCount: 96,
  orderCount: 420,
  itemCount: 2200,
});

const formatCheckinWindowDateTimeLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [datePart = "", timePart = ""] = raw.replace("T", " ").split(" ");
  const shortTime = timePart.slice(0, 5);
  return datePart && shortTime ? `${datePart} ${shortTime}` : raw;
};

const buildReservationCheckinWindowMessageFromError = (err) => {
  const openDateTime = String(err?.details?.body?.checkin_open_datetime || "").trim();
  const closeDateTime = String(err?.details?.body?.checkin_close_datetime || "").trim();
  if (!openDateTime && !closeDateTime) return "";

  const openLabel = formatCheckinWindowDateTimeLabel(openDateTime);
  const closeLabel = formatCheckinWindowDateTimeLabel(closeDateTime);
  if (openLabel && closeLabel) {
    return `Check-in is allowed for this reservation between ${openLabel} and ${closeLabel}.`;
  }
  if (openLabel) {
    return `Check-in is allowed for this reservation starting at ${openLabel}.`;
  }
  if (closeLabel) {
    return `Check-in is allowed for this reservation until ${closeLabel}.`;
  }
  return "";
};

const buildReservationCheckinWindowMessage = (settings, t) => {
  if (!hasReservationCheckinWindowRules(settings || QR_BOOKING_DEFAULTS)) {
    return "";
  }
  const normalizedSettings = normalizeQrBookingSettings(settings || QR_BOOKING_DEFAULTS);
  const earlyMinutes = Math.max(
    0,
    Number(normalizedSettings?.reservation_early_checkin_window_minutes || 0)
  );
  const lateMinutes = Math.max(
    0,
    Number(normalizedSettings?.reservation_late_arrival_grace_minutes || 0)
  );

  if (earlyMinutes > 0 && lateMinutes > 0) {
    return `Check-in is allowed from ${earlyMinutes} minutes before until ${lateMinutes} minutes after the reservation time.`;
  }
  if (earlyMinutes > 0) {
    return `Check-in is allowed only within ${earlyMinutes} minutes before the reservation time.`;
  }
  if (lateMinutes > 0) {
    return `Check-in is allowed only up to ${lateMinutes} minutes after the reservation time.`;
  }
  return t("Check-in is only available during the reservation check-in window.");
};

const getReservationCheckinErrorToastMessage = (err, t, settings) => {
  const statusCode = Number(err?.details?.status);
  const errorCode = String(err?.details?.body?.code || "")
    .trim()
    .toLowerCase();
  const rawMessage = String(err?.message || "").trim();
  const normalizedMessage = rawMessage.toLowerCase();
  const isCheckinWindowViolation =
    (statusCode === 400 || statusCode === 409) &&
    (errorCode === "reservation_checkin_window_violation" ||
      errorCode === "reservation_checkin_window_closed" ||
      normalizedMessage.includes("outside the allowed check-in window"));

  if (isCheckinWindowViolation) {
    return {
      level: "warning",
      message:
        buildReservationCheckinWindowMessageFromError(err) ||
        buildReservationCheckinWindowMessage(settings, t),
    };
  }

  return {
    level: "error",
    message: rawMessage || t("Failed to check in reservation"),
  };
};

const getOrderPrepMinutes = (order, productPrepById = {}) => {
  const direct = Number(order?.preparation_time ?? order?.prep_time ?? order?.prepTime);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const items = Array.isArray(order?.items) ? order.items : [];
  let maxMinutes = 0;
  items.forEach((item) => {
    const raw =
      item?.preparation_time ??
      item?.prep_time ??
      item?.prepTime ??
      item?.product_preparation_time ??
      item?.product?.preparation_time ??
      productPrepById?.[Number(item?.product_id ?? item?.productId)];
    const minutes = Number(raw);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const qty = Number(item?.quantity ?? item?.qty ?? 1);
    const total = minutes * Math.max(1, qty);
    if (total > maxMinutes) maxMinutes = total;
  });
  return maxMinutes;
};

const getPrepStartMs = (order) => {
  const direct = parseLooseDateToMs(order?.prep_started_at ?? order?.prepStartedAt);
  if (Number.isFinite(direct)) return direct;

  const updated = parseLooseDateToMs(order?.kitchen_status_updated_at);
  if (Number.isFinite(updated)) return updated;

  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const ms = parseLooseDateToMs(item?.prep_started_at ?? item?.prepStartedAt);
    if (Number.isFinite(ms)) return ms;
  }
  for (const item of items) {
    const itemUpdated = parseLooseDateToMs(item?.kitchen_status_updated_at);
    if (Number.isFinite(itemUpdated)) return itemUpdated;
  }
  return NaN;
};

const getReadyAtLabel = (order, productPrepById = {}) => {
  const directReadyMs = parseLooseDateToMs(
    order?.estimated_ready_at ??
      order?.ready_at ??
      order?.readyAt ??
      order?.estimatedReadyAt
  );
  if (Number.isFinite(directReadyMs)) {
    return new Date(directReadyMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const startMs = getPrepStartMs(order);
  const prepMinutes = getOrderPrepMinutes(order, productPrepById);
  if (!Number.isFinite(startMs) || !prepMinutes) return "";
  const readyMs = startMs + prepMinutes * 60 * 1000;
  return new Date(readyMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const getConcertEventStartMs = (event) => {
  const datePart = String(event?.event_date || "").slice(0, 10);
  const timePart = String(event?.event_time || "").slice(0, 8);
  if (!datePart) return NaN;
  const combined = `${datePart}T${timePart || "00:00:00"}`;
  return parseLooseDateToMs(combined);
};

const normalizeBookingDateYmd = (booking) => {
  const raw = String(
    booking?.booking_date ??
      booking?.bookingDate ??
      booking?.reservation_date ??
      booking?.reservationDate ??
      booking?.event_date ??
      booking?.eventDate ??
      booking?.created_at ??
      booking?.createdAt ??
      ""
  ).trim();
  if (!raw) return "";
  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch?.[1]) return ymdMatch[1];
  const parsedMs = parseLooseDateToMs(raw);
  return Number.isFinite(parsedMs) ? formatLocalYmd(new Date(parsedMs)) : "";
};

const isReservationRelevantForTableState = (reservation) => {
  const reservationStatus = normalizeOrderStatus(
    reservation?.status ??
      reservation?.reservation_status ??
      reservation?.reservationStatus ??
      reservation?.order_status ??
      reservation?.orderStatus ??
      ""
  );
  if (["cancelled", "canceled", "checked_out", "closed", "completed", "deleted", "void"].includes(reservationStatus)) {
    return false;
  }
  if (reservationStatus === "checked_in") return true;

  const bookingDateYmd = normalizeBookingDateYmd(reservation);
  if (!bookingDateYmd) return true;

  return bookingDateYmd === formatLocalYmd(new Date());
};

const isConcertBookingRelevantForTableState = (booking) => {
  const reservationOrderStatus = normalizeOrderStatus(
    booking?.reservation_order_status ?? booking?.reservationOrderStatus ?? ""
  );
  if (
    ["cancelled", "canceled", "checked_out", "closed", "completed", "deleted", "void"].includes(
      reservationOrderStatus
    )
  ) {
    return false;
  }
  if (reservationOrderStatus === "checked_in") return true;

  const bookingDateYmd = normalizeBookingDateYmd(booking);
  if (!bookingDateYmd) return false;

  return bookingDateYmd === formatLocalYmd(new Date());
};

const sanitizePdfText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const buildSimplePdfBlob = (title, lines = []) => {
  const encoder = new TextEncoder();
  const contentLines = [title, "", ...lines];
  const maxLines = 46;
  const clipped = contentLines.slice(0, maxLines);
  if (contentLines.length > maxLines) {
    clipped.push(`... truncated ${contentLines.length - maxLines} lines`);
  }

  const commands = ["BT", "/F1 10 Tf", "50 760 Td"];
  clipped.forEach((line, index) => {
    if (index > 0) commands.push("0 -14 Td");
    commands.push(`(${sanitizePdfText(line)}) Tj`);
  });
  commands.push("ET");
  const streamContent = commands.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${encoder.encode(streamContent).length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((objectText) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += objectText;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
};

const getViewBookingKey = (booking = {}) => {
  const sourceHint = String(booking?.booking_source || "").toLowerCase();
  const source = sourceHint || (booking?.event_id != null ? "concert" : "reservation");
  if (source === "concert") {
    return `concert-${booking?.id ?? booking?.booking_id ?? "x"}`;
  }
  return `reservation-${
    booking?.id ??
    booking?.order_id ??
    booking?.orderId ??
    `${booking?.table_number ?? booking?.tableNumber ?? "x"}-${
      booking?.reservation_date ?? booking?.reservationDate ?? "na"
    }-${booking?.reservation_time ?? booking?.reservationTime ?? "na"}`
  }`;
};

const TAB_LIST = [
  { id: "takeaway", label: "Tickets/Orders", icon: "⚡" },
  { id: "tables", label: "Tables", icon: "🍽️" },
  { id: "kitchen", label: "All Orders", icon: "👨‍🍳" },
  { id: "history", label: "History", icon: "📘" },
  { id: "packet", label: "Packet", icon: "🛵" },
  { id: "phone", label: "Phone", icon: "📞" },
  { id: "register", label: "Register", icon: "💵" },
];

const AREA_FILTER_ALL = "ALL";
const AREA_FILTER_VIEW_BOOKING = "__VIEW_BOOKING__";
const AREA_FILTER_SONG_REQUEST = "__SONG_REQUEST__";

const isSpecialTableArea = (value) =>
  value === AREA_FILTER_VIEW_BOOKING || value === AREA_FILTER_SONG_REQUEST;

const getTableOverviewAreaFromSearch = (search = "") => {
  const params = new globalThis.URLSearchParams(search);
  const requested = String(params.get("area") || "");
  return requested || AREA_FILTER_ALL;
};
const getTableOverviewNumberFilterFromSearch = (search = "") => {
  const params = new globalThis.URLSearchParams(search);
  return String(params.get("table") || "").replace(/[^\d]/g, "");
};

const getRestaurantScopedCacheKey = (suffix) => {
  const restaurantId =
    (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
    "global";
  return `hurrypos:${restaurantId}:${suffix}`;
};

const getTableConfigsCacheKey = () => getRestaurantScopedCacheKey("tableConfigs.v1");
const getTableCountCacheKey = () => getRestaurantScopedCacheKey("tableCount.v1");
const getOpenOrdersCacheKey = (mode = "packet") =>
  getRestaurantScopedCacheKey(`openOrders.${mode}.v1`);
const getConcertBookingsOverviewCacheKey = () =>
  getRestaurantScopedCacheKey("tableOverview.viewBooking.concert.v1");
const getReservationBookingsOverviewCacheKey = () =>
  getRestaurantScopedCacheKey("tableOverview.viewBooking.reservations.v1");

const safeParseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readOpenOrdersCache = (mode = "packet") => {
  try {
    if (typeof window === "undefined") return [];
    const raw = window?.localStorage?.getItem(getOpenOrdersCacheKey(mode));
    const parsed = safeParseJson(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((order) => order && typeof order === "object" && order.id != null);
  } catch {
    return [];
  }
};

const writeOpenOrdersCache = (mode = "packet", orders = []) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(orders)) return;
    window?.localStorage?.setItem(getOpenOrdersCacheKey(mode), JSON.stringify(orders));
  } catch {
    // ignore cache errors
  }
};

const writeViewBookingOverviewCache = (kind = "concert", rows = []) => {
  try {
    if (typeof window === "undefined") return;
    if (!Array.isArray(rows)) return;
    const key =
      kind === "reservation"
        ? getReservationBookingsOverviewCacheKey()
        : getConcertBookingsOverviewCacheKey();
    window?.localStorage?.setItem(
      key,
      JSON.stringify({
        savedAt: Date.now(),
        rows,
      })
    );
  } catch {
    // ignore cache errors
  }
};

const readInitialOpenOrdersById = () => {
  const next = {};
  readOpenOrdersCache("packet").forEach((order) => {
    const idNum = Number(order?.id);
    if (!Number.isFinite(idNum)) return;
    next[String(idNum)] = order;
  });
  return next;
};

const getSettingsTenantKey = () => {
  if (typeof window === "undefined") return "default";
  return (
    window?.localStorage?.getItem("restaurant_id") ||
    window?.localStorage?.getItem("restaurant_slug") ||
    "default"
  );
};

const getSettingCacheKey = (section) => `beypro:settings:${getSettingsTenantKey()}:${section}`;

const readInitialTableSettings = () => {
  const defaults = {
    tableLabelText: "",
    showAreas: true,
  };

  try {
    if (typeof window === "undefined") return defaults;
    const cached = safeParseJson(window?.localStorage?.getItem(getSettingCacheKey("tables")));
    if (!cached || typeof cached !== "object") return defaults;
    return { ...defaults, ...cached };
  } catch {
    return defaults;
  }
};

const readInitialTransactionSettings = () => {
  try {
    if (typeof window === "undefined") return DEFAULT_TRANSACTION_SETTINGS;
    const cached = safeParseJson(
      window?.localStorage?.getItem(getSettingCacheKey("transactions"))
    );
    if (!cached || typeof cached !== "object") return DEFAULT_TRANSACTION_SETTINGS;
    return {
      ...DEFAULT_TRANSACTION_SETTINGS,
      ...cached,
    };
  } catch {
    return DEFAULT_TRANSACTION_SETTINGS;
  }
};

const readInitialTableConfigs = () => {
  // Prefer last known full configs (fastest + keeps areas/seats stable).
  const cachedConfigs = safeParseJson(
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableConfigsCacheKey()) : null
  );
  if (Array.isArray(cachedConfigs) && cachedConfigs.length > 0) {
    return cachedConfigs
      .filter((t) => t && typeof t === "object" && t.number != null && t.active !== false)
      .sort((a, b) => Number(a.number) - Number(b.number));
  }

  // Fallback to last known count → render placeholder cards immediately.
  const cachedCountRaw =
    typeof window !== "undefined" ? window?.localStorage?.getItem(getTableCountCacheKey()) : null;
  const cachedCount = Number.parseInt(cachedCountRaw || "", 10);
  if (Number.isFinite(cachedCount) && cachedCount > 0 && cachedCount <= 500) {
    return Array.from({ length: cachedCount }, (_, idx) => ({
      number: idx + 1,
      active: true,
    }));
  }

  return [];
};

const mergeTableConfigsByNumber = (prev, next) => {
  const map = new Map();
  (Array.isArray(prev) ? prev : []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    if (t.number == null) return;
    map.set(Number(t.number), t);
  });
  (Array.isArray(next) ? next : []).forEach((t) => {
    if (!t || typeof t !== "object") return;
    if (t.number == null) return;
    const num = Number(t.number);
    map.set(num, { ...(map.get(num) || {}), ...t });
  });
  return Array.from(map.values()).sort((a, b) => Number(a.number) - Number(b.number));
};

const OPEN_ORDER_TYPES = {
  packet: ["packet", "phone"],
  kitchen: ["table", "phone", "packet", "takeaway"],
};

const isAbortError = (err) =>
  err?.name === "AbortError" ||
  String(err?.message || "")
    .toLowerCase()
    .includes("abort");

const CHECKIN_REGRESSION_STATUSES = new Set([
  "reserved",
  "confirmed",
  "draft",
  "new",
  "pending",
  "paid",
  "open",
  "in_progress",
]);
const LOCAL_REMOVE_ORDER_STATUSES = new Set([
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
]);

const preserveCheckedInStatus = (incomingStatus, previousOrder, incomingPatch = null) => {
  const normalizedIncoming = normalizeOrderStatus(incomingStatus);
  const normalizedPrevious = normalizeOrderStatus(previousOrder?.status);
  if (normalizedPrevious !== "checked_in") return normalizedIncoming;
  if (!CHECKIN_REGRESSION_STATUSES.has(normalizedIncoming)) return normalizedIncoming;
  const signalProbe = {
    ...(previousOrder && typeof previousOrder === "object" ? previousOrder : {}),
    ...(incomingPatch && typeof incomingPatch === "object" ? incomingPatch : {}),
  };
  if (!hasReservationSignal(signalProbe)) return normalizedIncoming;
  return "checked_in";
};

const TABLE_10_DEBUG_KEY = "10";
const normalizeTableKey = (value) => String(value ?? "").trim();
const isSameTableNumber = (tableNumber, tableConfigNumber) => {
  const left = normalizeTableKey(tableNumber);
  const right = normalizeTableKey(tableConfigNumber);
  return left !== "" && right !== "" && left === right;
};
const isTable10 = (value) => normalizeTableKey(value) === TABLE_10_DEBUG_KEY;
const logTable10 = (scope, payload) => {
  if (!import.meta.env.DEV) return;
  console.warn(`[table10-debug] ${scope}`, payload);
};





export default function TableOverview() {
  useRegisterGuard();
  const tableOverviewRenderCount = useRenderCount("TableOverview", { logEvery: 1 });
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const isDedicatedViewBookingPage = location.pathname === "/view-booking";
  const lastDayKeyRef = useRef(formatLocalYmd(new Date()));
  const tabFromUrl = React.useMemo(() => {
    if (isDedicatedViewBookingPage) return "tables";
    const params = new window.URLSearchParams(location.search);
    return String(params.get("tab") || "tables").toLowerCase();
  }, [isDedicatedViewBookingPage, location.search]);
  const requestedAreaFromUrl = React.useMemo(() => {
    const requestedArea = getTableOverviewAreaFromSearch(location.search);
    if (!isDedicatedViewBookingPage) return requestedArea;
    return requestedArea === AREA_FILTER_ALL ? AREA_FILTER_VIEW_BOOKING : requestedArea;
  }, [isDedicatedViewBookingPage, location.search]);
  const tableNumberFilterFromUrl = React.useMemo(
    () => getTableOverviewNumberFilterFromSearch(location.search),
    [location.search]
  );

  const activeTab = tabFromUrl;
  const [useStressData, setUseStressData] = useState(false);
  const [stressDataset, setStressDataset] = useState(null);
  const [tableConfigs, setTableConfigs] = useState(() => readInitialTableConfigs());
  const [paymentFilter, setPaymentFilter] = useState("All");
  const [orderTypeFilter, setOrderTypeFilter] = useState("All");
  const [fromDate, setFromDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [transactionSettings, setTransactionSettings] = useState(() =>
    readInitialTransactionSettings()
  );
  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);
  const [tableSettings, setTableSettings] = useState(() => readInitialTableSettings());
  useSetting("tables", setTableSettings, {
    tableLabelText: "",
    showAreas: true,
  });
  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    enableToasts: true,
  });
  const [qrBookingSettings, setQrBookingSettings] = useState(() =>
    normalizeQrBookingSettings(QR_BOOKING_DEFAULTS)
  );
  useSetting("notifications", setNotificationSettings, {
    enabled: true,
    enableToasts: true,
  });
  const [openOrdersById, setOpenOrdersById] = useState(() => readInitialOpenOrdersById());
  const [kitchenOpenOrdersLoading, setKitchenOpenOrdersLoading] = useState(false);
  const [productPrepById, setProductPrepById] = useState({});
  const [showPhoneOrderModal, setShowPhoneOrderModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const packetFetchRef = useRef({ requestId: 0, controller: null });
  const packetCountFetchRef = useRef({ requestId: 0, controller: null });
  const kitchenFetchRef = useRef({ requestId: 0, controller: null });
  const tableConfigsFetchRef = useRef({ requestId: 0, controller: null });
  const recentlyClosedRef = useRef(new Map()); // Track recently closed orders: key=orderId|tableNumber, value=timestamp
  const [closedOrdersVersion, setClosedOrdersVersion] = useState(0); // Increment to force ordersByTable recompute
  const { loading: authLoading } = useAuth();
  const { appearance, setAppearance, saveAppearance } = useAppearance();
  const tableDensity = normalizeTableDensity(
    appearance?.table_density ?? DEFAULT_TABLE_DENSITY
  );
  const { t } = useTranslation();

  useEffect(() => {
    let mounted = true;

    secureFetch("/settings/qr-menu-customization")
      .then((data) => {
        if (!mounted) return;
        setQrBookingSettings(normalizeQrBookingSettings(data?.customization || data || {}));
      })
      .catch(() => {
        if (!mounted) return;
        setQrBookingSettings(normalizeQrBookingSettings(QR_BOOKING_DEFAULTS));
      });

    return () => {
      mounted = false;
    };
  }, []);
  const { setHeader } = useHeader();
  const { customerCalls, acknowledgeCustomerCall, resolveCustomerCall } = useNotifications();
  // compute permissions once at top level (avoid calling hooks inside loops)
  const canSeeTablesGrid = useHasPermission("tables");
  const canSeeViewBookingTab = useHasPermission("view-booking");
  const canSeeSongRequestTab = useHasPermission("song-request");
  const canSeeTablesTab =
    canSeeTablesGrid || canSeeViewBookingTab || canSeeSongRequestTab;
  const canSeeKitchenTab = useHasPermission("kitchen");
  const canSeeHistoryTab = useHasPermission("history");
const canSeePacketTab = useHasPermission("packet-orders");
  const canSeePhoneTab = useHasPermission("phone-orders");
  const canSeeRegisterTab = useHasPermission("register");
  const canSeeTakeawayTab = useHasPermission("takeaway");
  const [activeArea, setActiveArea] = useState(() => requestedAreaFromUrl);
  const pendingAreaSelectionRef = useRef(null);
  const [hasUpcomingConcerts, setHasUpcomingConcerts] = useState(false);
  const [concertBookings, setConcertBookings] = useState([]);
  const [concertBookingsLoading, setConcertBookingsLoading] = useState(false);
  const [concertBookingUpdatingId, setConcertBookingUpdatingId] = useState(null);
  const [clearingBookings, setClearingBookings] = useState(false);
  const [suppressedBookingKeys, setSuppressedBookingKeys] = useState(() => new Set());
  const [reservationBookingsOverview, setReservationBookingsOverview] = useState([]);
  const [reservationBookingsLoading, setReservationBookingsLoading] = useState(false);
  const [reservationBookingUpdatingKey, setReservationBookingUpdatingKey] = useState(null);
  const [songRequests, setSongRequests] = useState([]);
  const [songRequestsLoading, setSongRequestsLoading] = useState(false);
  const [songRequestUpdatingId, setSongRequestUpdatingId] = useState(null);
  const {
    ordersByTable: ordersByTableRaw,
    setOrders,
    reservationsToday,
    setReservationsToday,
    refreshOrders: fetchOrders,
    didInitialOrdersLoadRef,
  } = useTableOrdersData({ activeTab, productPrepById });

  const isStressModeActive = PERF_DEBUG_ENABLED && useStressData && activeTab === "tables" && !!stressDataset;
  const effectiveTableConfigs = isStressModeActive ? stressDataset.tableConfigs : tableConfigs;
  const effectiveOrdersByTableRaw = isStressModeActive
    ? stressDataset.ordersByTableRaw
    : ordersByTableRaw;
  const effectiveReservationsToday = isStressModeActive
    ? stressDataset.reservationsToday
    : reservationsToday;
  const effectiveProductPrepById = isStressModeActive
    ? stressDataset.productPrepById
    : productPrepById;
  const visibleConcertBookingsOverview = React.useMemo(
    () =>
      (Array.isArray(concertBookings) ? concertBookings : []).filter(
        (booking) => !suppressedBookingKeys.has(getViewBookingKey({ ...booking, booking_source: "concert" }))
      ),
    [concertBookings, suppressedBookingKeys]
  );
  const visibleReservationBookingsOverview = React.useMemo(
    () =>
      (Array.isArray(reservationBookingsOverview) ? reservationBookingsOverview : []).filter(
        (booking) => !suppressedBookingKeys.has(getViewBookingKey({ ...booking, booking_source: "reservation" }))
      ),
    [reservationBookingsOverview, suppressedBookingKeys]
  );

  useEffect(() => {
    writeViewBookingOverviewCache("concert", Array.isArray(concertBookings) ? concertBookings : []);
  }, [concertBookings]);

  useEffect(() => {
    writeViewBookingOverviewCache(
      "reservation",
      Array.isArray(reservationBookingsOverview) ? reservationBookingsOverview : []
    );
  }, [reservationBookingsOverview]);

  const removeBookingFromViewBookingLists = useCallback(({ tableNumber, reservationId, orderId } = {}) => {
    const normalizedTableNumber = normalizeTableKey(tableNumber);
    const normalizedReservationId = Number(reservationId);
    const normalizedOrderId = Number(orderId);

    setConcertBookings((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((row) => {
        const rowTableNumber = normalizeTableKey(
          row?.reserved_table_number ?? row?.reservedTableNumber ?? row?.table_number ?? row?.tableNumber
        );
        const rowReservationId = Number(row?.id ?? row?.booking_id ?? row?.bookingId);
        const rowOrderId = Number(
          row?.reservation_order_id ?? row?.reservationOrderId ?? row?.order_id ?? row?.orderId
        );
        if (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) {
          return false;
        }
        if (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) return false;
        if (isSameTableNumber(rowTableNumber, normalizedTableNumber)) {
          return false;
        }
        return true;
      });
    });

    setReservationBookingsOverview((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((row) => {
        const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
        const rowReservationId = Number(row?.id ?? row?.reservation_id ?? row?.reservationId);
        const rowOrderId = Number(row?.order_id ?? row?.orderId);
        if (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) {
          return false;
        }
        if (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) return false;
        if (isSameTableNumber(rowTableNumber, normalizedTableNumber)) {
          return false;
        }
        return true;
      });
    });
  }, []);

  const markBookingCheckedInInViewBookingLists = useCallback(
    ({ tableNumber, reservationId, orderId, reservation } = {}) => {
      const normalizedTableNumber = normalizeTableKey(tableNumber);
      const normalizedReservationId = Number(reservationId);
      const normalizedOrderId = Number(orderId);
      const reservationPayload = reservation && typeof reservation === "object" ? reservation : null;

      setConcertBookings((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((row) => {
          const rowTableNumber = normalizeTableKey(
            row?.reserved_table_number ?? row?.reservedTableNumber ?? row?.table_number ?? row?.tableNumber
          );
          const rowReservationId = Number(row?.id ?? row?.booking_id ?? row?.bookingId);
          const rowOrderId = Number(
            row?.reservation_order_id ?? row?.reservationOrderId ?? row?.order_id ?? row?.orderId
          );
          const matches =
            (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
            (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) ||
            isSameTableNumber(rowTableNumber, normalizedTableNumber);
          if (!matches) return row;
          return {
            ...row,
            reservation_order_status: "checked_in",
            reservationOrderStatus: "checked_in",
            status:
              row?.payment_status != null || row?.paymentStatus != null
                ? row?.status
                : "checked_in",
            ...(reservationPayload
              ? {
                  order_id:
                    row?.order_id ?? row?.orderId ?? reservationPayload?.order_id ?? reservationPayload?.orderId ?? normalizedOrderId,
                  orderId:
                    row?.orderId ?? row?.order_id ?? reservationPayload?.orderId ?? reservationPayload?.order_id ?? normalizedOrderId,
                }
              : null),
          };
        });
      });

      setReservationBookingsOverview((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((row) => {
          const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id ?? row?.reservation_id ?? row?.reservationId);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          const matches =
            (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
            (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) ||
            isSameTableNumber(rowTableNumber, normalizedTableNumber);
          if (!matches) return row;
          return {
            ...row,
            ...(reservationPayload || {}),
            status: "checked_in",
            reservation_status: "checked_in",
            reservationStatus: "checked_in",
            order_id:
              row?.order_id ?? row?.orderId ?? reservationPayload?.order_id ?? reservationPayload?.orderId ?? normalizedOrderId,
            orderId:
              row?.orderId ?? row?.order_id ?? reservationPayload?.orderId ?? reservationPayload?.order_id ?? normalizedOrderId,
          };
        });
      });
    },
    []
  );
  const markBookingConfirmedLocally = useCallback(
    ({ tableNumber, reservationId, orderId, reservation } = {}) => {
      const normalizedTableNumber = normalizeTableKey(tableNumber);
      const normalizedReservationId = Number(reservationId);
      const normalizedOrderId = Number(orderId);
      const reservationPayload = reservation && typeof reservation === "object" ? reservation : null;

      setConcertBookings((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((row) => {
          const rowTableNumber = normalizeTableKey(
            row?.reserved_table_number ?? row?.reservedTableNumber ?? row?.table_number ?? row?.tableNumber
          );
          const rowReservationId = Number(row?.id ?? row?.booking_id ?? row?.bookingId);
          const rowOrderId = Number(
            row?.reservation_order_id ?? row?.reservationOrderId ?? row?.order_id ?? row?.orderId
          );
          const matches =
            (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
            (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) ||
            isSameTableNumber(rowTableNumber, normalizedTableNumber);
          if (!matches) return row;
          return {
            ...row,
            ...(reservationPayload || {}),
            status: "confirmed",
            reservation_order_status: "confirmed",
            reservationOrderStatus: "confirmed",
            payment_status: row?.payment_status ?? row?.paymentStatus,
            paymentStatus: row?.paymentStatus ?? row?.payment_status,
            order_id:
              row?.order_id ?? row?.orderId ?? reservationPayload?.order_id ?? reservationPayload?.orderId ?? normalizedOrderId,
            orderId:
              row?.orderId ?? row?.order_id ?? reservationPayload?.orderId ?? reservationPayload?.order_id ?? normalizedOrderId,
          };
        });
      });

      setReservationBookingsOverview((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((row) => {
          const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id ?? row?.reservation_id ?? row?.reservationId);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          const matches =
            (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
            (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) ||
            isSameTableNumber(rowTableNumber, normalizedTableNumber);
          if (!matches) return row;
          return {
            ...row,
            ...(reservationPayload || {}),
            status: "confirmed",
            reservation_status: "confirmed",
            reservationStatus: "confirmed",
            order_id:
              row?.order_id ?? row?.orderId ?? reservationPayload?.order_id ?? reservationPayload?.orderId ?? normalizedOrderId,
            orderId:
              row?.orderId ?? row?.order_id ?? reservationPayload?.orderId ?? reservationPayload?.order_id ?? normalizedOrderId,
          };
        });
      });

      setReservationsToday((prev) =>
        (() => {
          const list = Array.isArray(prev) ? prev : [];
          return list.map((row) => {
            const rowTableNumber = normalizeTableKey(
              row?.table_number ?? row?.tableNumber ?? row?.table
            );
            const rowReservationId = Number(row?.id ?? row?.reservation_id ?? row?.reservationId);
            const rowOrderId = Number(row?.order_id ?? row?.orderId);
            const matches =
              (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
              (Number.isFinite(normalizedOrderId) && rowOrderId === normalizedOrderId) ||
              isSameTableNumber(rowTableNumber, normalizedTableNumber);
            if (!matches) return row;
            return {
              ...row,
              ...(reservationPayload || {}),
              status: "confirmed",
              order_id:
                row?.order_id ??
                row?.orderId ??
                reservationPayload?.order_id ??
                reservationPayload?.orderId ??
                normalizedOrderId,
              orderId:
                row?.orderId ??
                row?.order_id ??
                reservationPayload?.orderId ??
                reservationPayload?.order_id ??
                normalizedOrderId,
            };
          });
        })()
      );

      setOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((row) => {
          const rowTableNumber = Number(
            row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
          );
          const rowId = Number(row?.id);
          const rowReservationId = Number(row?.reservation_id ?? row?.reservationId ?? row?.reservation?.id);
          const matches =
            (Number.isFinite(normalizedOrderId) && rowId === normalizedOrderId) ||
            (Number.isFinite(normalizedReservationId) && rowReservationId === normalizedReservationId) ||
            isSameTableNumber(rowTableNumber, normalizedTableNumber);
          if (!matches) return row;
          return {
            ...row,
            ...(normalizedOrderId === rowId ? { status: "confirmed" } : null),
            reservation: {
              ...(row?.reservation || {}),
              ...(reservationPayload || {}),
              status: "confirmed",
              reservation_status: "confirmed",
              reservationStatus: "confirmed",
            },
            reservation_id:
              row?.reservation_id ?? row?.reservationId ?? reservationPayload?.id ?? normalizedReservationId ?? null,
            reservationId:
              row?.reservationId ?? row?.reservation_id ?? reservationPayload?.id ?? normalizedReservationId ?? null,
          };
        })
      );
    },
    [setOrders, setReservationsToday]
  );
  const handleLoadStressData = useCallback(() => {
    const generated = generateTableOverviewStressData(DEFAULT_STRESS_CONFIG);
    setStressDataset(generated);
    setUseStressData(true);
    markPerfTrace("stress-data-loaded", generated?.stats || {});
  }, []);

  const handleUnloadStressData = useCallback(() => {
    setUseStressData(false);
    markPerfTrace("stress-data-unloaded");
  }, []);

  const handleStressMutation = useCallback((action) => {
    setStressDataset((prev) => {
      if (!prev) return prev;
      const next = mutateStressDataByAction(prev, action);
      markPerfTrace("stress-data-mutated", {
        action,
        orders: next?.stats?.openOrders ?? 0,
      });
      return next;
    });
  }, []);

  // Avoid tab flicker while auth/permissions are still loading by caching the last allowed tabs
  const lastPermissionsRef = useRef({
    tables: true,
    kitchen: true,
    history: true,
    packet: true,
    phone: true,
    register: true,
    takeaway: true,
  });

  const effectivePermissions = React.useMemo(() => {
    if (authLoading) return lastPermissionsRef.current;
    const next = {
      tables: canSeeTablesTab,
      kitchen: canSeeKitchenTab,
      history: canSeeHistoryTab,
      packet: canSeePacketTab,
      phone: canSeePhoneTab,
      register: canSeeRegisterTab,
      takeaway: canSeeTakeawayTab,
    };
    lastPermissionsRef.current = next;
    return next;
  }, [
    authLoading,
    canSeeTablesTab,
    canSeeKitchenTab,
    canSeeHistoryTab,
    canSeePacketTab,
    canSeePhoneTab,
    canSeeRegisterTab,
    canSeeTakeawayTab,
  ]);

  const [packetOrdersCount, setPacketOrdersCount] = useState(0);

useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const data = await secureFetch("/products");
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.products)
        ? data.products
        : data?.product
        ? [data.product]
        : [];
      const next = {};
      for (const p of list) {
        const id = Number(p?.id);
        const prep = parseFloat(p?.preparation_time ?? p?.prep_time ?? p?.prepTime);
        if (!Number.isFinite(id) || !Number.isFinite(prep) || prep <= 0) continue;
        next[id] = prep;
      }
      if (mounted) setProductPrepById(next);
    } catch {
      if (mounted) setProductPrepById({});
    }
  })();
  return () => {
    mounted = false;
  };
}, []);

const handleCloseTable = async (orderOrId, options = {}) => {
  const preserveReservationShadow = options?.preserveReservationShadow !== false;
  const requirePaidForClose = options?.requirePaid === true || !preserveReservationShadow;
  const isReservationCheckoutAction =
    options?.isReservationCheckout === true ||
    (!preserveReservationShadow && options?.requirePaid === true);
  const order = orderOrId && typeof orderOrId === "object" ? orderOrId : null;
  const orderId = order?.id ?? orderOrId;
  const closeOrderIds = Array.from(
    new Set(
      [
        ...(Array.isArray(order?.merged_ids) ? order.merged_ids : []),
        orderId,
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
  const explicitTableNumber = Number(options?.tableNumber);
  const explicitReservationId = Number(options?.reservationId);
  const tableNumber = Number(
    Number.isFinite(explicitTableNumber)
      ? explicitTableNumber
      : order?.table_number ?? order?.tableNumber
  );
  const normalizedClosedOrderIds = closeOrderIds;
  const normalizedClosedOrderId = normalizedClosedOrderIds[0] ?? Number(order?.id ?? orderId);
  const statusCandidates = [
    String(order?.status || "").toLowerCase(),
    String(order?.reservation?.status || "").toLowerCase(),
    String(order?.reservationFallback?.status || "").toLowerCase(),
  ];
  const hasCheckedInReservation = statusCandidates.includes("checked_in");
  const hasReservationSignal = Boolean(
    order?.reservation_id ||
      order?.reservationId ||
      order?.reservation?.id ||
      order?.reservation_date ||
      order?.reservationDate ||
      order?.reservation_time ||
      order?.reservationTime ||
      String(order?.order_type || "").toLowerCase() === "reservation"
  );
  const hasConcertContextOnOrderClose = hasConcertBookingContext(
    order,
    order?.reservation,
    order?.reservationFallback
  );

  if (preserveReservationShadow && hasReservationSignal && hasCheckedInReservation) {
    window.alert(t("Please check-out before closing table"));
    return false;
  }

  if (normalizedClosedOrderIds.length === 0) {
    toast.error("Failed to close table");
    return false;
  }

  try {
    const itemsByOrder = await Promise.all(
      normalizedClosedOrderIds.map(async (id) => {
        const result = await secureFetch(`/orders/${id}/items`);
        return Array.isArray(result) ? result : null;
      })
    );
    if (itemsByOrder.some((items) => !Array.isArray(items))) {
      toast.error("Failed to verify kitchen items");
      return;
    }
    const items = itemsByOrder.flat();

    if (requirePaidForClose) {
      const isCancelledLikeItem = (item) => {
        const status = String(
          item?.status ?? item?.item_status ?? item?.kitchen_status ?? ""
        ).toLowerCase();
        return ["cancelled", "canceled", "deleted", "void"].includes(status);
      };
      const isPaidLikeItem = (item) => {
        const paymentStatus = String(item?.payment_status ?? item?.paymentStatus ?? "").toLowerCase();
        return Boolean(
          item?.paid === true ||
            item?.paid_at ||
            item?.paidAt ||
            paymentStatus === "paid"
        );
      };
      const activeItems = items.filter((item) => !isCancelledLikeItem(item));
      const hasItemPaidMarkers = activeItems.some((item) => {
        const paymentStatus = String(item?.payment_status ?? item?.paymentStatus ?? "").toLowerCase();
        return (
          typeof item?.paid === "boolean" ||
          item?.paid_at != null ||
          item?.paidAt != null ||
          paymentStatus === "paid" ||
          paymentStatus === "unpaid"
        );
      });
      const orderMarkedPaid = Boolean(
        order?.is_paid ||
          String(order?.payment_status || "").toLowerCase() === "paid" ||
          String(order?.status || "").toLowerCase() === "paid"
      );
      const hasUnpaidActiveItems = hasItemPaidMarkers
        ? activeItems.some((item) => !isPaidLikeItem(item))
        : activeItems.length > 0 && !orderMarkedPaid;

      if (hasUnpaidActiveItems) {
        toast.warning(t("Cannot check out: some items are not paid yet."));
        return false;
      }
    }

    if (items.length > 0) {
      // ✅ Fetch current kitchen exclusion settings (same as TransactionScreen)
      const { excludedItems = [], excludedCategories = [] } =
        (await secureFetch("kitchen/compile-settings")) || {};

      // ✅ Allow closing if all items are delivered OR excluded
      const allDeliveredOrExcluded = items.every(
        (i) =>
          i.kitchen_status === "delivered" ||
          !i.kitchen_status ||
          excludedItems.includes(i.product_id) ||
          excludedCategories.includes(i.category)
      );

      if (!allDeliveredOrExcluded) {
        toast.warning(`⚠️ ${t("Cannot close: some kitchen items not yet delivered!")}`, {
          style: { background: "#dc2626", color: "#fff" }, // red-600
        });
        return false;
      }
    }

    const reservationShadowSource =
      (order?.reservationFallback && typeof order.reservationFallback === "object"
        ? order.reservationFallback
        : null) ||
      (order?.reservation && typeof order.reservation === "object" ? order.reservation : null);
    const reservationOwnedOrderId = Number(
      reservationShadowSource?.order_id ??
        reservationShadowSource?.orderId ??
        explicitReservationId
    );
    const shadow = buildReservationShadowRecord({
      reservation: reservationShadowSource,
      order: reservationShadowSource ? null : order,
      tableNumber,
      orderId:
        Number.isFinite(reservationOwnedOrderId) && reservationOwnedOrderId > 0
          ? reservationOwnedOrderId
          : order?.id ?? orderId,
    });
    const resolvedReservationId = Number(
      (Number.isFinite(explicitReservationId) ? explicitReservationId : null) ??
        order?.reservation?.id ??
        order?.reservation_id ??
        order?.reservationId ??
        shadow?.id
    );

    // ✅ OPTIMISTIC UPDATE: Remove order from UI immediately
    // Track this close to prevent refetch from bringing it back
    const now = Date.now();
    normalizedClosedOrderIds.forEach((id) => {
      recentlyClosedRef.current.set(`order_${id}`, now);
    });
    if (Number.isFinite(tableNumber)) {
      recentlyClosedRef.current.set(`table_${tableNumber}`, now);
    }
    setClosedOrdersVersion(v => v + 1); // Force ordersByTable to recompute
    
    // Clean up after 10 seconds (socket should have confirmed by then)
    setTimeout(() => {
      normalizedClosedOrderIds.forEach((id) => {
        recentlyClosedRef.current.delete(`order_${id}`);
      });
      if (Number.isFinite(tableNumber)) {
        recentlyClosedRef.current.delete(`table_${tableNumber}`);
      }
      setClosedOrdersVersion(v => v + 1); // Force ordersByTable to recompute
    }, 10000);

    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      const next = prevArr.filter((row) => {
        const rowTableNumber = Number(
          row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
        );
        if (Number.isFinite(tableNumber)) {
          return rowTableNumber !== tableNumber;
        }
        return !normalizedClosedOrderIds.includes(Number(row?.id));
      });

      return next.sort((a, b) => Number(a?.table_number) - Number(b?.table_number));
    });

    setOpenOrdersById((prev) => {
      const prevMap = prev && typeof prev === "object" ? prev : {};
      const nextMap = {};
      Object.entries(prevMap).forEach(([key, row]) => {
        const rowId = Number(row?.id);
        const rowTableNumber = Number(row?.table_number ?? row?.tableNumber);
        const rowType = String(row?.order_type || "").toLowerCase();
        const rowStatus = normalizeOrderStatus(row?.status);

        const sameOrderId = normalizedClosedOrderIds.includes(rowId);
        const sameTableReservationLike =
          Number.isFinite(tableNumber) &&
          rowTableNumber === tableNumber &&
          (rowType === "table" || rowType === "reservation");
        const isClosedLike = rowStatus === "closed" || isOrderCancelledOrCanceled(rowStatus);

        if (sameOrderId || sameTableReservationLike || isClosedLike) return;
        nextMap[key] = row;
      });

      try {
        const nextList = Object.values(nextMap);
        writeOpenOrdersCache(
          "packet",
          nextList.filter((row) => {
            const status = normalizeOrderStatus(row?.status);
            if (status === "closed" || isOrderCancelledOrCanceled(status)) return false;
            const type = String(row?.order_type || "").toLowerCase();
            return OPEN_ORDER_TYPES.packet.includes(type);
          })
        );
        writeOpenOrdersCache(
          "kitchen",
          nextList.filter((row) => {
            const status = normalizeOrderStatus(row?.status);
            if (status === "closed" || isOrderCancelledOrCanceled(status)) return false;
            const type = String(row?.order_type || "").toLowerCase();
            return OPEN_ORDER_TYPES.kitchen.includes(type);
          })
        );
      } catch (cacheErr) {
        void cacheErr;
      }

      return nextMap;
    });

    // ✅ Now call the server API
    const closeRequestOptions = { method: "POST" };
    if (
      hasConcertContextOnOrderClose ||
      (isReservationCheckoutAction &&
        (hasReservationSignal || Number.isFinite(explicitReservationId)))
    ) {
      closeRequestOptions.body = JSON.stringify({
        preserve_reservation_checkout_badge: true,
      });
    }
    await Promise.all(
      normalizedClosedOrderIds.map((id) =>
        secureFetch(`/orders/${id}/close`, {
          method: closeRequestOptions.method,
          ...(closeRequestOptions.body ? { body: closeRequestOptions.body } : null),
        })
      )
    );

    // ✅ Handle reservation shadows after successful close
    if (shadow && preserveReservationShadow) upsertReservationShadow(shadow);
    if (!preserveReservationShadow) {
      removeReservationShadow({
        reservationId: Number.isFinite(resolvedReservationId) ? resolvedReservationId : null,
        orderId: order?.id ?? orderId,
        tableNumber,
      });
      removeBookingFromViewBookingLists({
        reservationId: Number.isFinite(resolvedReservationId) ? resolvedReservationId : null,
        orderId: order?.id ?? orderId,
        tableNumber,
      });
      setReservationsToday((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.filter((row) => {
          const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          if (isSameTableNumber(rowTableNumber, tableNumber)) return false;
          if (Number.isFinite(resolvedReservationId) && rowReservationId === resolvedReservationId)
            return false;
          if (Number.isFinite(Number(order?.id ?? orderId)) && rowOrderId === Number(order?.id ?? orderId))
            return false;
          return true;
        });
      });
    }
    const notificationsEnabled = notificationSettings?.enabled !== false;
    const toastPopupsEnabled = notificationSettings?.enableToasts ?? true;
    if (notificationsEnabled && toastPopupsEnabled) {
      toast.success("✅ Table closed successfully!");
    }

    // Reset guest count ("seats") for the table once it's closed.
    if (Number.isFinite(tableNumber)) {
      upsertTableConfigLocal(tableNumber, { guests: null });
      void secureFetch(`/tables/${tableNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ guests: null }),
      }).catch((err) => {
        console.error("❌ Failed to reset table guests after close:", err);
      });
    }

    return true;
  } catch (err) {
    console.error("❌ Failed to close table:", err);
    toast.error("Failed to close table");
    
    // ✅ Rollback optimistic update tracking
    normalizedClosedOrderIds.forEach((id) => {
      recentlyClosedRef.current.delete(`order_${id}`);
    });
    if (Number.isFinite(tableNumber)) {
      recentlyClosedRef.current.delete(`table_${tableNumber}`);
    }
    setClosedOrdersVersion(v => v + 1);
    
    // ✅ Rollback optimistic update by refetching orders
    fetchOrders();
    return false;
  }
};

const handleDeleteReservation = useCallback(
  async (table, reservationInfo, options = null) => {
    const tableNumber = Number(table?.tableNumber ?? table?.order?.table_number ?? table?.table_number);
    const standaloneReservationRecordId = Number(
      reservationInfo?.id ?? table?.reservationFallback?.id
    );
    const activeTableOrderId = Number(table?.order?.id);
    const shouldPreferStandaloneReservationRecord =
      (!Number.isFinite(activeTableOrderId) || activeTableOrderId <= 0) &&
      Number.isFinite(standaloneReservationRecordId) &&
      standaloneReservationRecordId > 0;
    const orderId = Number(
      (shouldPreferStandaloneReservationRecord
        ? standaloneReservationRecordId
        : null) ??
        table?.order?.id ??
        reservationInfo?.order_id ??
        reservationInfo?.orderId
    );
    const reservationId = Number(
      reservationInfo?.id ?? table?.order?.reservation?.id ?? table?.reservationFallback?.id
    );

    if (!Number.isFinite(orderId) && !Number.isFinite(reservationId)) {
      toast.warning(t("Reservation record not found"));
      return;
    }

    const normalizedStatus = normalizeOrderStatus(table?.order?.status);
    const normalizedOrderType = String(table?.order?.order_type || "").trim().toLowerCase();
    const isReservationLikeOrder =
      normalizedStatus === "reserved" ||
      normalizedOrderType === "reservation" ||
      !!reservationInfo?.id;

    const isCancelledLikeItem = (item) => {
      const status = String(
        item?.status ?? item?.item_status ?? item?.kitchen_status ?? ""
      ).toLowerCase();
      return ["cancelled", "canceled", "deleted", "void"].includes(status);
    };

    let itemCount = Array.isArray(table?.order?.items)
      ? table.order.items.filter((item) => !isCancelledLikeItem(item)).length
      : null;
    if (!Number.isFinite(itemCount) && Number.isFinite(orderId)) {
      try {
        const latestItems = await secureFetch(`/orders/${orderId}/items?include_cancelled=1`);
        const items = Array.isArray(latestItems) ? latestItems : [];
        itemCount = items.filter((item) => !isCancelledLikeItem(item)).length;
      } catch {
        itemCount = null;
      }
    }
    const totalAmount = Number(table?.order?.total || 0);
    const hasAnyItemsInCartOrTable = Number(itemCount || 0) > 0 || totalAmount > 0;
    if (hasAnyItemsInCartOrTable) {
      window.alert(
        t("You cannot delete this reservation while items are in cart. Please clear or close the table/cart first.")
      );
      return;
    }

    const skipConfirm = options?.skipConfirm === true;
    if (!skipConfirm) {
      const ok = window.confirm(t("Delete this reservation?"));
      if (!ok) return;
    }

    const isEmptyReservationOnly =
      isReservationLikeOrder && totalAmount <= 0 && Number(itemCount || 0) === 0;

    let deleteReason = String(options?.reason || "").trim();
    if (!deleteReason && isEmptyReservationOnly) {
      const input = window.prompt(t("Please enter a reason for deleting this empty reservation"));
      if (input === null) return;
      const trimmed = String(input || "").trim();
      if (!trimmed) {
        toast.warning(t("Reason is required"));
        return;
      }
      deleteReason = trimmed;
    }

    try {
      const deleteOptions = {
        method: "DELETE",
        ...(deleteReason
          ? {
              body: JSON.stringify({
                delete_reason: deleteReason,
                cancellation_reason: deleteReason,
              }),
            }
          : {}),
      };
      const targetOrderId = Number.isFinite(orderId) ? orderId : reservationId;
      const response = await secureFetch(`/orders/${targetOrderId}/reservations`, deleteOptions);

      const updatedOrder = response?.order && typeof response.order === "object" ? response.order : null;
      const normalizedUpdatedStatus = String(updatedOrder?.status || "").toLowerCase();

      setOrders((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        const next = [];
        for (const row of prevArr) {
          const rowTableNumber = Number(
            row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
          );
          if (!Number.isFinite(tableNumber) || rowTableNumber !== tableNumber) {
            next.push(row);
            continue;
          }

          if (normalizedUpdatedStatus === "closed") {
            continue;
          }

          next.push({
            ...row,
            ...(updatedOrder || {}),
            reservation: null,
            reservation_id: null,
            reservationId: null,
            reservation_date: null,
            reservationDate: null,
            reservation_time: null,
            reservationTime: null,
            reservation_clients: null,
            reservationClients: null,
            reservation_notes: null,
            reservationNotes: null,
            status:
              updatedOrder?.status ??
              (String(row?.status || "").toLowerCase() === "reserved" ? "confirmed" : row?.status),
            order_type:
              ((updatedOrder?.order_type ?? row?.order_type) === "reservation" &&
              String(
                updatedOrder?.status ??
                  (String(row?.status || "").toLowerCase() === "reserved"
                    ? "confirmed"
                    : row?.status)
              ).toLowerCase() !== "reserved")
                ? "table"
                : updatedOrder?.order_type ?? row?.order_type,
          });
        }
        return next.sort((a, b) => Number(a?.table_number) - Number(b?.table_number));
      });
      setReservationsToday((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.filter((row) => {
          const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          if (isSameTableNumber(rowTableNumber, tableNumber)) return false;
          if (Number.isFinite(reservationId) && rowReservationId === reservationId) return false;
          if (Number.isFinite(orderId) && rowOrderId === orderId) return false;
          return true;
        });
      });
      removeReservationShadow({
        reservationId,
        orderId,
        tableNumber,
      });
      removeBookingFromViewBookingLists({
        reservationId,
        orderId,
        tableNumber,
      });

      if (Number.isFinite(tableNumber)) {
        setTableConfigs((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          const next = prevArr.map((cfg) =>
            Number(cfg?.number) === tableNumber ? { ...cfg, guests: null } : cfg
          );
          try {
            localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(next));
            localStorage.setItem(getTableCountCacheKey(), String(next.length));
          } catch (cacheErr) {
            void cacheErr;
          }
          return next;
        });
        try {
          await secureFetch(`/tables/${tableNumber}`, {
            method: "PATCH",
            body: JSON.stringify({ guests: null }),
          });
        } catch (guestResetErr) {
          console.error("❌ Failed to reset table guests after deleting reservation:", guestResetErr);
        }
      }

      toast.success(t("Reservation deleted"));
      fetchOrders({ skipHydration: true });
      setTimeout(() => fetchOrders(), 350);
    } catch (err) {
      console.error("❌ Failed to delete reservation:", err);
      toast.error(t("Failed to delete reservation"));
    }
  },
  [
    fetchOrders,
    removeBookingFromViewBookingLists,
    removeReservationShadow,
    setOpenOrdersById,
    setOrders,
    setReservationsToday,
    t,
  ]
);

const handleCheckinReservation = useCallback(
  async (table, reservationInfo) => {
    const tableNumber = Number(table?.tableNumber ?? table?.order?.table_number ?? table?.table_number);
    const standaloneReservationRecordId = Number(
      reservationInfo?.id ?? table?.reservationFallback?.id
    );
    const activeTableOrderId = Number(table?.order?.id);
    const shouldPreferStandaloneReservationRecord =
      (!Number.isFinite(activeTableOrderId) || activeTableOrderId <= 0) &&
      Number.isFinite(standaloneReservationRecordId) &&
      standaloneReservationRecordId > 0;
    const reservationOwnedOrderId = Number(
      (shouldPreferStandaloneReservationRecord
        ? standaloneReservationRecordId
        : null) ??
        reservationInfo?.order_id ??
        reservationInfo?.orderId ??
        reservationInfo?.id ??
        table?.reservationFallback?.order_id ??
        table?.reservationFallback?.orderId ??
        table?.reservationFallback?.id ??
        table?.order?.reservation?.order_id ??
        table?.order?.reservation?.orderId ??
        table?.order?.reservation?.id
    );
    let orderId = Number.isFinite(reservationOwnedOrderId) && reservationOwnedOrderId > 0
      ? reservationOwnedOrderId
      : Number(table?.order?.id);
    const reservationId = Number(
      reservationInfo?.id ?? table?.order?.reservation?.id ?? table?.reservationFallback?.id
    );
    const closedLikeStatuses = new Set(["closed", "completed", "cancelled", "canceled", "paid"]);
    const reservationSource =
      reservationInfo ||
      table?.reservationFallback ||
      table?.order?.reservation ||
      table?.order ||
      null;
    const buildReservationRestorePayload = () => {
      const reservationDate = String(
        reservationSource?.reservation_date ?? reservationSource?.reservationDate ?? ""
      ).trim();
      const reservationTime = String(
        reservationSource?.reservation_time ?? reservationSource?.reservationTime ?? ""
      ).trim();
      if (!reservationDate || !reservationTime) return null;
      const sourceOrderId = Number(
        reservationSource?.order_id ??
          reservationSource?.orderId ??
          table?.order?.id ??
          0
      );
      return {
        table_number: tableNumber,
        ...(Number.isFinite(sourceOrderId) && sourceOrderId > 0
          ? { order_id: sourceOrderId }
          : {}),
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        reservation_clients:
          reservationSource?.reservation_clients ??
          reservationSource?.reservationClients ??
          0,
        reservation_notes:
          reservationSource?.reservation_notes ??
          reservationSource?.reservationNotes ??
          "",
        customer_name:
          reservationSource?.customer_name ??
          reservationSource?.customerName ??
          "",
        customer_phone:
          reservationSource?.customer_phone ??
          reservationSource?.customerPhone ??
          "",
        ...(reservationSource?.reservation_men != null || reservationSource?.reservationMen != null
          ? {
              reservation_men:
                reservationSource?.reservation_men ?? reservationSource?.reservationMen ?? null,
            }
          : {}),
        ...(reservationSource?.reservation_women != null || reservationSource?.reservationWomen != null
          ? {
              reservation_women:
                reservationSource?.reservation_women ?? reservationSource?.reservationWomen ?? null,
            }
          : {}),
        skip_guest_composition_validation: true,
        restore_existing_reservation: true,
      };
    };
    const restoreReservationAndGetOrderId = async () => {
      const payload = buildReservationRestorePayload();
      if (!payload) return null;
      const restoreResponse = await secureFetch(`/orders/reservations`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const restoredOrder =
        restoreResponse?.reservation && typeof restoreResponse.reservation === "object"
          ? restoreResponse.reservation
          : null;
      const restoredId = Number(restoredOrder?.id);
      return Number.isFinite(restoredId) && restoredId > 0 ? restoredId : null;
    };
    const isCancelledLikeItem = (item) => {
      const status = String(item?.kitchen_status || "").toLowerCase();
      return ["cancelled", "canceled", "deleted", "void"].includes(status);
    };
    const isPaidLikeItem = (item) => {
      if (!item || typeof item !== "object") return false;
      const paymentStatus = String(item?.payment_status ?? item?.paymentStatus ?? "").toLowerCase();
      return Boolean(
        item?.paid ||
          item?.paid_at ||
          item?.paidAt ||
          paymentStatus === "paid" ||
          item?.payment_method ||
          item?.paymentMethod
      );
    };

    if (!Number.isFinite(orderId) && !Number.isFinite(reservationId)) {
      toast.warning(t("Reservation record not found"));
      return;
    }

    const statusCandidates = [
      String(table?.order?.status || "").toLowerCase(),
      String(reservationInfo?.status || "").toLowerCase(),
      String(table?.reservationFallback?.status || "").toLowerCase(),
    ];
    const hasClosedLikeStatus = statusCandidates.some((status) =>
      closedLikeStatuses.has(status)
    );
    const hasLiveReservationRecord =
      Number.isFinite(reservationOwnedOrderId) && reservationOwnedOrderId > 0;
    if (hasClosedLikeStatus && !hasLiveReservationRecord) {
      try {
        const refreshedOrderId = await restoreReservationAndGetOrderId();
        if (refreshedOrderId) {
          orderId = refreshedOrderId;
        } else {
          toast.warning(t("Failed to restore reservation after table close"));
          return;
        }
      } catch (restoreErr) {
        console.error("❌ Failed to restore reservation before check-in:", restoreErr);
        toast.error(restoreErr?.message || t("Failed to restore reservation after table close"));
        return;
      }
    }

    const hasConcertBookingOnTable =
      Number.isFinite(tableNumber) &&
      (Array.isArray(concertBookings) ? concertBookings : []).some((booking) => {
        if (!isConcertBookingRelevantForTableState(booking)) return false;
        const reservedTableNumber = Number(
          booking?.reserved_table_number ?? booking?.reservedTableNumber
        );
        if (!Number.isFinite(reservedTableNumber) || reservedTableNumber !== tableNumber) return false;
        const paymentStatus = String(
          booking?.payment_status ?? booking?.paymentStatus ?? ""
        )
          .trim()
          .toLowerCase();
        return paymentStatus !== "cancelled" && paymentStatus !== "canceled";
      });
    const hasConfirmedConcertBookingOnTable =
      Number.isFinite(tableNumber) &&
      (Array.isArray(concertBookings) ? concertBookings : []).some((booking) => {
        if (!isConcertBookingRelevantForTableState(booking)) return false;
        const reservedTableNumber = Number(
          booking?.reserved_table_number ?? booking?.reservedTableNumber
        );
        if (!Number.isFinite(reservedTableNumber) || reservedTableNumber !== tableNumber) return false;
        const paymentStatus = String(
          booking?.payment_status ?? booking?.paymentStatus ?? ""
        )
          .trim()
          .toLowerCase();
        const bookingStatus = String(
          booking?.status ?? booking?.booking_status ?? booking?.bookingStatus ?? ""
        )
          .trim()
          .toLowerCase();
        const reservationOrderStatus = normalizeOrderStatus(
          booking?.reservation_order_status ?? booking?.reservationOrderStatus ?? ""
        );
        const isCancelled =
          paymentStatus === "cancelled" ||
          paymentStatus === "canceled" ||
          reservationOrderStatus === "cancelled" ||
          reservationOrderStatus === "canceled";
        if (isCancelled) return false;
        return (
          paymentStatus === "confirmed" ||
          bookingStatus === "confirmed" ||
          reservationOrderStatus === "checked_in"
        );
      });
    const isConcertReservation =
      hasConcertBookingContext(table?.order, reservationInfo, table?.reservationFallback) ||
      hasConcertBookingOnTable;
    const isReservationAwaitingConfirmation = isReservationPendingConfirmation(
      table?.order,
      reservationInfo,
      table?.reservationFallback
    );
    const isConcertBookingReadyForCheckin =
      isConcertBookingConfirmed(table?.order, reservationInfo, table?.reservationFallback) ||
      hasConfirmedConcertBookingOnTable;
    const needsConcertConfirmationFirst =
      isConcertReservation && !isConcertBookingReadyForCheckin;
    const canCheckInReservation =
      isReservationConfirmedForCheckin(
        table?.order,
        reservationInfo,
        table?.reservationFallback
      ) ||
      (isConcertReservation &&
        isConcertBookingReadyForCheckin);
    const needsConfirmationFirst =
      needsConcertConfirmationFirst ||
      (isReservationAwaitingConfirmation && !canCheckInReservation);
    if (needsConfirmationFirst) {
      let hasUnpaidItemsBeforeBookingConfirm = Boolean(table?.hasUnpaidItems);
      if (!hasUnpaidItemsBeforeBookingConfirm && Array.isArray(table?.order?.items)) {
        hasUnpaidItemsBeforeBookingConfirm = table.order.items.some(
          (item) => !isCancelledLikeItem(item) && !isPaidLikeItem(item)
        );
      }
      if (!hasUnpaidItemsBeforeBookingConfirm) {
        const activeServiceOrderId = Number(table?.order?.id);
        if (Number.isFinite(activeServiceOrderId) && activeServiceOrderId > 0) {
          try {
            const latestItems = await secureFetch(
              `/orders/${activeServiceOrderId}/items?include_cancelled=1`
            );
            const items = Array.isArray(latestItems) ? latestItems : [];
            hasUnpaidItemsBeforeBookingConfirm = items.some(
              (item) => !isCancelledLikeItem(item) && !isPaidLikeItem(item)
            );
          } catch (itemsErr) {
            console.warn(
              "⚠️ Failed to verify unpaid items before confirming booking:",
              itemsErr
            );
          }
        }
      }

      if (hasUnpaidItemsBeforeBookingConfirm) {
        toast.warning(
          t("Unpaid items found. Please pay or close the current cart before confirming this booking.")
        );
        return;
      }

      const confirmReservationOrder = async () => {
        const sendConfirmRequest = async (targetId) => {
          await secureFetch(`/orders/${targetId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "confirmed",
              total:
                Number(
                  table?.order?.total ??
                    reservationInfo?.total ??
                    table?.reservationFallback?.total ??
                    0
                ) || 0,
              payment_method:
                table?.order?.payment_method ??
                table?.order?.paymentMethod ??
                reservationInfo?.payment_method ??
                reservationInfo?.paymentMethod ??
                table?.reservationFallback?.payment_method ??
                table?.reservationFallback?.paymentMethod ??
                "Unknown",
            }),
          });
        };

        const reservationOwnedOrderId = Number(
          (shouldPreferStandaloneReservationRecord
            ? standaloneReservationRecordId
            : null) ??
            reservationInfo?.order_id ??
            reservationInfo?.orderId ??
            table?.reservationFallback?.order_id ??
            table?.reservationFallback?.orderId ??
            table?.order?.reservation?.order_id ??
            table?.order?.reservation?.orderId
        );
        let targetOrderId = reservationOwnedOrderId;

        if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) {
          const tableOrderStatus = normalizeOrderStatus(table?.order?.status);
          const tableOrderHasActivity = hasReservationServiceActivity(table?.order);
          const canReuseTableOrderAsReservation =
            isReservationPendingConfirmation(
              table?.order,
              table?.order?.reservation,
              reservationInfo,
              table?.reservationFallback
            ) &&
            !tableOrderHasActivity &&
            tableOrderStatus !== "closed" &&
            tableOrderStatus !== "paid" &&
            !isOrderCancelledOrCanceled(tableOrderStatus);

          if (canReuseTableOrderAsReservation) {
            targetOrderId = Number(table?.order?.id ?? orderId);
          }
        }

        if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) {
          const restoredOrderId = await restoreReservationAndGetOrderId();
          if (Number.isFinite(restoredOrderId) && restoredOrderId > 0) {
            targetOrderId = restoredOrderId;
            orderId = restoredOrderId;
          }
        }

        if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) {
          toast.warning(t("Reservation record not found"));
          return false;
        }

        try {
          await sendConfirmRequest(targetOrderId);
        } catch (confirmErr) {
          const statusCode = Number(confirmErr?.details?.status);
          const message = String(confirmErr?.message || "").toLowerCase();
          const shouldRetryAfterRestore =
            statusCode === 404 ||
            message.includes("not found") ||
            message.includes("cannot");
          if (!shouldRetryAfterRestore) throw confirmErr;

          const restoredOrderId = await restoreReservationAndGetOrderId();
          if (!Number.isFinite(restoredOrderId) || restoredOrderId <= 0) {
            throw confirmErr;
          }

          targetOrderId = restoredOrderId;
          orderId = restoredOrderId;
          await sendConfirmRequest(targetOrderId);
        }

        const confirmedReservation = buildReservationShadowRecord({
          reservation: {
            ...(table?.reservationFallback || {}),
            ...(reservationInfo || {}),
            status: "confirmed",
            order_id:
              reservationInfo?.order_id ??
              reservationInfo?.orderId ??
              table?.reservationFallback?.order_id ??
              table?.reservationFallback?.orderId ??
              targetOrderId,
            orderId:
              reservationInfo?.orderId ??
              reservationInfo?.order_id ??
              table?.reservationFallback?.orderId ??
              table?.reservationFallback?.order_id ??
              targetOrderId,
          },
          order: null,
          tableNumber,
          orderId: targetOrderId,
        });

        setOrders((prev) =>
          (Array.isArray(prev) ? prev : []).map((row) => {
            const rowId = Number(row?.id);
            const targetReservationId = Number(
              confirmedReservation?.id ??
                reservationInfo?.id ??
                table?.reservationFallback?.id
            );
            const isReservationRow =
              (Number.isFinite(targetOrderId) && rowId === targetOrderId) ||
              (Number.isFinite(targetReservationId) && rowId === targetReservationId);
            if (!isReservationRow) return row;
            return {
              ...row,
              status: "confirmed",
              reservation: confirmedReservation ?? {
                ...(row?.reservation || {}),
                status: "confirmed",
              },
              reservation_id:
                confirmedReservation?.id ??
                row?.reservation_id ??
                row?.reservationId ??
                reservationInfo?.id ??
                table?.reservationFallback?.id ??
                null,
              reservationId:
                confirmedReservation?.id ??
                row?.reservationId ??
                row?.reservation_id ??
                reservationInfo?.id ??
                table?.reservationFallback?.id ??
                null,
            };
          })
        );

        setReservationsToday((prev) =>
          (Array.isArray(prev) ? prev : []).map((row) => {
            const rowReservationId = Number(row?.id);
            const rowOrderId = Number(row?.order_id ?? row?.orderId);
            const rowTableNumber = normalizeTableKey(
              row?.table_number ?? row?.tableNumber ?? row?.table
            );
            const targetReservationId = Number(
              confirmedReservation?.id ??
                reservationInfo?.id ??
                table?.reservationFallback?.id
            );
            const canFallbackToTableMatch =
              !Number.isFinite(targetReservationId) && !Number.isFinite(targetOrderId);
            const matchesReservation =
              (Number.isFinite(rowReservationId) && rowReservationId === targetReservationId) ||
              (Number.isFinite(rowOrderId) && rowOrderId === targetOrderId) ||
              (canFallbackToTableMatch &&
                isSameTableNumber(rowTableNumber, tableNumber));
            if (!matchesReservation) return row;
            return {
              ...row,
              ...(confirmedReservation || {}),
              status: "confirmed",
              order_id: row?.order_id ?? row?.orderId ?? targetOrderId,
              orderId: row?.orderId ?? row?.order_id ?? targetOrderId,
            };
          })
        );

        if (confirmedReservation) {
          upsertReservationShadow(confirmedReservation);
        }
        markBookingConfirmedLocally({
          tableNumber,
          reservationId: confirmedReservation?.id ?? reservationId,
          orderId: targetOrderId,
          reservation: confirmedReservation,
        });
        return true;
      };
      try {
        if (needsConcertConfirmationFirst) {
          const explicitConcertBookingId = Number(
            reservationInfo?.concert_booking_id ??
              reservationInfo?.concertBookingId ??
              table?.order?.concert_booking_id ??
              table?.order?.concertBookingId ??
              table?.order?.reservation?.concert_booking_id ??
              table?.order?.reservation?.concertBookingId ??
              table?.reservationFallback?.concert_booking_id ??
              table?.reservationFallback?.concertBookingId
          );
          const candidateOrderIds = Array.from(
            new Set(
              [
                orderId,
                Number(table?.order?.id),
                Number(reservationInfo?.order_id ?? reservationInfo?.orderId),
                Number(table?.reservationFallback?.order_id ?? table?.reservationFallback?.orderId),
              ].filter((id) => Number.isFinite(id) && id > 0)
            )
          );
          const resolveConcertBookingId = (rows = []) => {
            const fromExplicit =
              Number.isFinite(explicitConcertBookingId) && explicitConcertBookingId > 0
                ? explicitConcertBookingId
                : null;
            if (fromExplicit) return fromExplicit;

            const matches = (Array.isArray(rows) ? rows : [])
              .filter((booking) => {
                const status = String(booking?.payment_status ?? booking?.paymentStatus ?? "")
                  .trim()
                  .toLowerCase();
                if (status === "cancelled" || status === "canceled") return false;
                const bookingOrderId = Number(
                  booking?.reservation_order_id ?? booking?.reservationOrderId
                );
                const bookingTable = Number(
                  booking?.reserved_table_number ?? booking?.reservedTableNumber
                );
                if (candidateOrderIds.some((id) => id === bookingOrderId)) return true;
                return Number.isFinite(tableNumber) && bookingTable === tableNumber;
              })
              .sort((a, b) => {
                const aMs =
                  parseLooseDateToMs(a?.updated_at) ||
                  parseLooseDateToMs(a?.created_at) ||
                  Number(a?.id) ||
                  0;
                const bMs =
                  parseLooseDateToMs(b?.updated_at) ||
                  parseLooseDateToMs(b?.created_at) ||
                  Number(b?.id) ||
                  0;
                return bMs - aMs;
              });
            const idFromList = Number(matches?.[0]?.id);
            return Number.isFinite(idFromList) && idFromList > 0 ? idFromList : null;
          };

          let targetConcertBookingId = resolveConcertBookingId(concertBookings);
          if (!Number.isFinite(targetConcertBookingId) || targetConcertBookingId <= 0) {
            const freshConcertBookings = await loadConcertBookingsForOverview();
            targetConcertBookingId = resolveConcertBookingId(freshConcertBookings);
          }
          if ((!Number.isFinite(targetConcertBookingId) || targetConcertBookingId <= 0) && candidateOrderIds.length > 0) {
            for (const candidateOrderId of candidateOrderIds) {
              try {
                const orderMeta = await secureFetch(`/orders/${candidateOrderId}`);
                const metaConcertBookingId = Number(
                  orderMeta?.concert_booking_id ??
                    orderMeta?.concertBookingId ??
                    orderMeta?.concert_booking?.id ??
                    orderMeta?.concertBooking?.id
                );
                if (Number.isFinite(metaConcertBookingId) && metaConcertBookingId > 0) {
                  targetConcertBookingId = metaConcertBookingId;
                  break;
                }
              } catch (metaErr) {
                console.warn(
                  "⚠️ Failed to resolve concert booking from order metadata:",
                  candidateOrderId,
                  metaErr
                );
              }
            }
          }
          if (!Number.isFinite(targetConcertBookingId) || targetConcertBookingId <= 0) {
            const didConfirmReservation = await confirmReservationOrder();
            if (!didConfirmReservation) return;
          } else {
            try {
              await secureFetch(`/concerts/bookings/${targetConcertBookingId}/payment-status`, {
                method: "PATCH",
                body: JSON.stringify({ payment_status: "confirmed" }),
              });
            } catch (confirmConcertErr) {
              const statusCode = Number(confirmConcertErr?.details?.status);
              const errorText = String(confirmConcertErr?.message || "").toLowerCase();
              const isBookingNotFound =
                statusCode === 404 && errorText.includes("booking not found");
              if (!isBookingNotFound) throw confirmConcertErr;
              const didConfirmReservation = await confirmReservationOrder();
              if (!didConfirmReservation) return;
            }
          }
        } else {
          const didConfirmReservation = await confirmReservationOrder();
          if (!didConfirmReservation) return;
        }

        toast.success(t("Booking confirmed"));
        void Promise.all([
          fetchOrders({ skipHydration: true }),
          loadConcertBookingsForOverview(),
          loadReservationBookingsForOverview(),
        ]).catch((refreshErr) => {
          console.warn("⚠️ Failed to refresh booking data after confirmation:", refreshErr);
        });
        setTimeout(() => fetchOrders(), 350);
      } catch (confirmErr) {
        console.error("❌ Failed to confirm booking from table card:", confirmErr);
        toast.error(confirmErr?.message || t("Failed to confirm booking"));
      }
      return;
    }

    const shouldUseOrderSnapshot =
      !hasClosedLikeStatus &&
      Number.isFinite(Number(table?.order?.id)) &&
      Number(table?.order?.id) === Number(orderId);
    let activeItemCount = shouldUseOrderSnapshot && Array.isArray(table?.order?.items)
      ? table.order.items.filter((item) => {
          return !isCancelledLikeItem(item);
        }).length
      : null;
    let hasPaidItemsOnTable = shouldUseOrderSnapshot && Array.isArray(table?.order?.items)
      ? table.order.items.some((item) => !isCancelledLikeItem(item) && isPaidLikeItem(item))
      : false;

    if (!Number.isFinite(activeItemCount) && Number.isFinite(orderId) && orderId > 0) {
      try {
        const latestItems = await secureFetch(`/orders/${orderId}/items?include_cancelled=1`);
        const items = Array.isArray(latestItems) ? latestItems : [];
        activeItemCount = items.filter((item) => {
          return !isCancelledLikeItem(item);
        }).length;
        hasPaidItemsOnTable = items.some(
          (item) => !isCancelledLikeItem(item) && isPaidLikeItem(item)
        );
      } catch {
        activeItemCount = null;
      }
    }

    const orderMarkedPaid =
      shouldUseOrderSnapshot &&
      (Boolean(table?.order?.is_paid) ||
        String(table?.order?.payment_status || "").toLowerCase() === "paid" ||
        String(table?.order?.status || "").toLowerCase() === "paid");
    if (orderMarkedPaid || hasPaidItemsOnTable) {
      toast.warning(t("Paid items found. Please close the table/cart before checking in this reservation."));
      return;
    }

    const totalAmount = shouldUseOrderSnapshot ? Number(table?.order?.total || 0) : 0;
    const hasItemsOnTable = Number(activeItemCount || 0) > 0 || totalAmount > 0;
    if (hasItemsOnTable) {
      const shouldCloseTableFirst = window.confirm(
        t("This table has active items. Close the table now before checking in the reservation?")
      );
      if (shouldCloseTableFirst) {
        const didClose = await handleCloseTable(table?.order || orderId);
        if (!didClose) return;

        try {
          const refreshedOrderId = await restoreReservationAndGetOrderId();
          if (refreshedOrderId) {
            orderId = refreshedOrderId;
          } else {
            toast.warning(t("Failed to restore reservation after closing the table"));
            return;
          }
        } catch (restoreErr) {
          console.error("❌ Failed to restore reservation after closing table:", restoreErr);
          toast.error(t("Failed to restore reservation after closing the table"));
          return;
        }
      } else {
        return;
      }
    }

    try {
      let response = null;
      try {
        response = await postReservationCheckinWithFallback({
          request: secureFetch,
          orderId,
          reservationId,
        });
      } catch (checkinErr) {
        const statusCode = Number(checkinErr?.details?.status);
        const errorCode = String(checkinErr?.details?.body?.code || "").toLowerCase();
        const isConcertBookingUnconfirmed =
          statusCode === 409 && errorCode === "concert_booking_unconfirmed";
        if (isConcertBookingUnconfirmed) {
          window.alert(
            t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
          );
          return;
        }
        const shouldRetryAfterRestore = isReservationCheckinNotFoundError(checkinErr);
        if (!shouldRetryAfterRestore) throw checkinErr;
        const refreshedOrderId = await restoreReservationAndGetOrderId();
        if (!refreshedOrderId) throw checkinErr;
        orderId = refreshedOrderId;
        response = await postReservationCheckinWithFallback({
          request: secureFetch,
          orderId,
          reservationId,
        });
      }

      const updatedOrder =
        response?.order && typeof response.order === "object"
          ? response.order
          : response?.reservation && typeof response.reservation === "object"
          ? response.reservation
          : null;
      const normalizedUpdatedStatus = String(updatedOrder?.status || "").toLowerCase();
      const checkedInReservation = buildReservationShadowRecord({
        reservation: response?.reservation || updatedOrder || reservationInfo,
        order: updatedOrder || table?.order || null,
        tableNumber,
        orderId: Number(updatedOrder?.id ?? orderId) || null,
      });
      const reservationPatch = checkedInReservation
        ? {
            reservation: checkedInReservation,
            reservation_id: checkedInReservation.id ?? null,
            reservationId: checkedInReservation.id ?? null,
            reservation_date: checkedInReservation.reservation_date ?? null,
            reservationDate: checkedInReservation.reservation_date ?? null,
            reservation_time: checkedInReservation.reservation_time ?? null,
            reservationTime: checkedInReservation.reservation_time ?? null,
            reservation_clients: checkedInReservation.reservation_clients ?? 0,
            reservationClients: checkedInReservation.reservation_clients ?? 0,
            reservation_notes: checkedInReservation.reservation_notes ?? "",
            reservationNotes: checkedInReservation.reservation_notes ?? "",
          }
        : {
            reservation: null,
            reservation_id: null,
            reservationId: null,
            reservation_date: null,
            reservationDate: null,
            reservation_time: null,
            reservationTime: null,
            reservation_clients: null,
            reservationClients: null,
            reservation_notes: null,
            reservationNotes: null,
          };

      setOrders((prev) => {
        const prevArr = Array.isArray(prev) ? prev : [];
        const next = [];
        for (const row of prevArr) {
          const rowTableNumber = Number(
            row?.table_number ?? row?.tableNumber ?? row?.table_id ?? row?.tableId ?? row?.table
          );
          if (!Number.isFinite(tableNumber) || rowTableNumber !== tableNumber) {
            next.push(row);
            continue;
          }

          if (normalizedUpdatedStatus === "closed") {
            continue;
          }

          const nextStatus =
            updatedOrder?.status ??
            (String(row?.status || "").toLowerCase() === "reserved" ? "checked_in" : row?.status);
          next.push({
            ...row,
            ...(updatedOrder || {}),
            ...reservationPatch,
            status: nextStatus,
            order_type:
              ((updatedOrder?.order_type ?? row?.order_type) === "reservation" &&
              String(nextStatus).toLowerCase() !== "reserved")
                ? "table"
                : updatedOrder?.order_type ?? row?.order_type,
          });
        }
        return next.sort((a, b) => Number(a?.table_number) - Number(b?.table_number));
      });

      setReservationsToday((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const filtered = list.filter((row) => {
          const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
          const rowReservationId = Number(row?.id);
          const rowOrderId = Number(row?.order_id ?? row?.orderId);
          if (isSameTableNumber(rowTableNumber, tableNumber)) return false;
          if (Number.isFinite(reservationId) && rowReservationId === reservationId) return false;
          if (Number.isFinite(orderId) && rowOrderId === orderId) return false;
          return true;
        });
        return filtered.sort((a, b) => Number(a?.table_number) - Number(b?.table_number));
      });
      if (checkedInReservation) {
        upsertReservationShadow(checkedInReservation);
      } else {
        removeReservationShadow({
          reservationId,
          orderId,
          tableNumber,
        });
      }

      markBookingCheckedInInViewBookingLists({
        tableNumber,
        reservationId: checkedInReservation?.id ?? reservationId,
        orderId: Number(updatedOrder?.id ?? orderId) || null,
        reservation: checkedInReservation,
      });

      const checkedInGuestsRaw = Number(
        checkedInReservation?.reservation_clients ??
          checkedInReservation?.reservationClients ??
          reservationInfo?.reservation_clients ??
          reservationInfo?.reservationClients ??
          0
      );
      if (Number.isFinite(tableNumber) && Number.isFinite(checkedInGuestsRaw)) {
        const checkedInGuests = Math.max(0, Math.trunc(checkedInGuestsRaw));
        setTableConfigs((prev) => {
          const prevArr = Array.isArray(prev) ? prev : [];
          let found = false;
          const next = prevArr.map((cfg) => {
            if (Number(cfg?.number) !== tableNumber) return cfg;
            found = true;
            return { ...cfg, guests: checkedInGuests };
          });
          const resolved = found
            ? next
            : mergeTableConfigsByNumber(prevArr, [
                { number: tableNumber, active: true, guests: checkedInGuests },
              ]);
          try {
            localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(resolved));
            localStorage.setItem(getTableCountCacheKey(), String(resolved.length));
          } catch (cacheErr) {
            void cacheErr;
          }
          return resolved;
        });
        void secureFetch(`/tables/${tableNumber}`, {
          method: "PATCH",
          body: JSON.stringify({ guests: checkedInGuests }),
        }).catch((guestPatchErr) => {
          console.error("❌ Failed to sync checked-in guests to table config:", guestPatchErr);
        });
      }

      toast.success(t("Guest checked in"));
      fetchOrders({ skipHydration: true });
      setTimeout(() => fetchOrders(), 350);
    } catch (err) {
      console.error("❌ Failed to check in reservation:", err);
      const toastConfig = getReservationCheckinErrorToastMessage(err, t, qrBookingSettings);
      if (toastConfig.level === "warning") {
        toast.warning(toastConfig.message);
      } else {
        toast.error(toastConfig.message);
      }
    }
  },
  [
    concertBookings,
    fetchOrders,
    handleCloseTable,
    markBookingCheckedInInViewBookingLists,
    markBookingConfirmedLocally,
    setOrders,
    setReservationsToday,
    setTableConfigs,
    t,
  ]
);

  const visibleTabs = React.useMemo(() => {
    return TAB_LIST.filter((tab) => {
      if (tab.id === "takeaway") return effectivePermissions.takeaway;
      if (tab.id === "tables") return effectivePermissions.tables;
      if (tab.id === "kitchen") return effectivePermissions.kitchen;
      if (tab.id === "history") return effectivePermissions.history;
      if (tab.id === "packet") return effectivePermissions.packet;
      if (tab.id === "phone") return effectivePermissions.phone;
      if (tab.id === "register") return effectivePermissions.register;
      return true;
    });
  }, [effectivePermissions]);

  const handleTabSelect = useCallback(
    (tabId, options = {}) => {
      if (!tabId) return;
      const basePath = isDedicatedViewBookingPage ? "/view-booking" : "/tableoverview";
      const replace = options?.replace === true;
      const params = new window.URLSearchParams(location.search);
      if (isDedicatedViewBookingPage && tabId === "tables") {
        params.delete("tab");
        params.set("area", AREA_FILTER_VIEW_BOOKING);
      } else {
        params.set("tab", tabId);
      }
      navigate(`${basePath}?${params.toString()}`, { replace });
    },
    [isDedicatedViewBookingPage, location.search, navigate]
  );

  const syncTableAreaInUrl = useCallback(
    (nextArea, options = {}) => {
      const replace = options?.replace === true;
      const params = new window.URLSearchParams(location.search);
      const basePath = isDedicatedViewBookingPage ? "/view-booking" : "/tableoverview";
      if (nextArea && nextArea !== AREA_FILTER_ALL) {
        params.set("area", nextArea);
      } else {
        params.delete("area");
      }
      if (isDedicatedViewBookingPage) {
        params.delete("tab");
      }
      const nextSearch = params.toString();
      const currentSearch = location.search.startsWith("?")
        ? location.search.slice(1)
        : location.search;
      if (nextSearch === currentSearch) return;
      navigate(`${basePath}${nextSearch ? `?${nextSearch}` : ""}`, { replace });
    },
    [isDedicatedViewBookingPage, location.search, navigate]
  );

  const handleAreaSelect = useCallback(
    (nextArea, options = {}) => {
      pendingAreaSelectionRef.current = nextArea;
      setActiveArea(nextArea);
      syncTableAreaInUrl(nextArea, options);
    },
    [syncTableAreaInUrl]
  );

  useEffect(() => {
    if (!location.pathname.includes("tableoverview")) return;
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      handleTabSelect(visibleTabs[0].id, { replace: true });
    }
  }, [visibleTabs, activeTab, handleTabSelect, location.pathname]);




  useEffect(() => {
    setShowPhoneOrderModal(activeTab === "phone");
    if (activeTab === "register") setShowRegisterModal(true);
  }, [activeTab]);

useEffect(() => () => setHeader({}), [setHeader]);

const getRestaurantIdForBatch = useCallback(() => {
  try {
    if (typeof window === "undefined") return "";
    return String(window?.localStorage?.getItem("restaurant_id") || "").trim();
  } catch {
    return "";
  }
}, []);

const fetchSongRequests = useCallback(async () => {
  const restaurantId = getRestaurantIdForBatch();
  if (!restaurantId) {
    setSongRequests([]);
    return;
  }

  setSongRequestsLoading(true);
  try {
    const data = await secureFetch(`/song-requests?restaurant_id=${encodeURIComponent(restaurantId)}`);
    const rows = Array.isArray(data) ? data : Array.isArray(data?.requests) ? data.requests : [];
    setSongRequests(rows);
  } catch (err) {
    console.error("❌ Failed to fetch song requests:", err);
    setSongRequests([]);
  } finally {
    setSongRequestsLoading(false);
  }
}, [getRestaurantIdForBatch]);

const updateSongRequestStatus = useCallback(
  async (request, status) => {
    const requestId = Number(request?.id);
    if (!Number.isFinite(requestId) || requestId <= 0) return;

    setSongRequestUpdatingId(requestId);
    try {
      await secureFetch(`/song-requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await fetchSongRequests();
    } catch (err) {
      console.error(`❌ Failed to ${status} song request:`, err);
      toast.error(t("Failed to update song request"));
    } finally {
      setSongRequestUpdatingId(null);
    }
  },
  [fetchSongRequests, t]
);

const normalizeOpenOrderItem = useCallback((item) => {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    discount_type: item.discount_type || item.discountType || null,
    discount_value:
      item.discount_value != null
        ? parseFloat(item.discount_value)
        : item.discountValue != null
        ? parseFloat(item.discountValue)
        : 0,
  };
}, []);

const normalizeOpenOrder = useCallback(
  (order) => {
    if (!order || typeof order !== "object") return null;
    const { receipt_methods, receiptMethods: receiptMethodsRaw, ...rest } = order;
    const items = Array.isArray(order.items) ? order.items.map(normalizeOpenOrderItem) : [];
    const receiptMethods = Array.isArray(receiptMethodsRaw)
      ? receiptMethodsRaw
      : Array.isArray(receipt_methods)
      ? receipt_methods
      : [];
    const anyUnpaid = items.some((i) => !i?.paid_at && !i?.paid);
    const inferredPaid = !anyUnpaid;

    return {
      ...rest,
      status: normalizeOrderStatus(order?.status),
      items,
      receiptMethods,
      is_paid: order?.is_paid === true ? true : inferredPaid,
    };
  },
  [normalizeOpenOrderItem]
);

const startLatestRequest = useCallback((ref) => {
  if (ref.current?.controller) {
    ref.current.controller.abort();
  }
  const nextId = Number(ref.current?.requestId || 0) + 1;
  const controller = new AbortController();
  ref.current = { requestId: nextId, controller };
  return { requestId: nextId, controller };
}, []);

const isLatestRequest = useCallback(
  (ref, requestId) => Number(ref.current?.requestId || 0) === Number(requestId),
  []
);

const upsertOpenOrdersForMode = useCallback(
  (mode, nextOrders) => {
    const modeTypes = OPEN_ORDER_TYPES[mode] || OPEN_ORDER_TYPES.kitchen;
    setOpenOrdersById((prev) => {
      const next = { ...(prev || {}) };

      Object.keys(next).forEach((idKey) => {
        const prevType = String(next[idKey]?.order_type || "")
          .trim()
          .toLowerCase();
        if (modeTypes.includes(prevType)) delete next[idKey];
      });

      (Array.isArray(nextOrders) ? nextOrders : []).forEach((order) => {
        const idNum = Number(order?.id);
        if (!Number.isFinite(idNum)) return;
        const nextType = String(order?.order_type || "")
          .trim()
          .toLowerCase();
        if (!modeTypes.includes(nextType)) return;
        next[String(idNum)] = order;
      });

      return next;
    });
    writeOpenOrdersCache(mode, Array.isArray(nextOrders) ? nextOrders : []);
  },
  []
);

const fetchOpenOrdersBatch = useCallback(
  async (mode, signal) => {
    const params = new window.URLSearchParams();
    params.set("mode", mode || "both");
    const restaurantId = getRestaurantIdForBatch();
    if (restaurantId) params.set("restaurant_id", restaurantId);

    const payload = await secureFetch(`/orders/open/with-items?${params.toString()}`, { signal });
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.orders) ? payload.orders : [];
    const normalized = rows
      .map(normalizeOpenOrder)
      .filter(Boolean);

    if (import.meta.env.DEV) {
      const totalItems = normalized.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=${mode} orders=${normalized.length} items=${totalItems} calls=1`
      );
    }

    return normalized;
  },
  [getRestaurantIdForBatch, normalizeOpenOrder]
);

const fetchPacketOrdersLegacy = useCallback(
  async (signal, options = {}) => {
    const { onPartial } = options;
    let calls = 0;
    const [packet, phone] = await Promise.all([
      secureFetch(`/orders?type=packet`, { signal }).then((res) => {
        calls += 1;
        return res;
      }),
      secureFetch(`/orders?type=phone`, { signal }).then((res) => {
        calls += 1;
        return res;
      }),
    ]);

    const packetArray = Array.isArray(packet) ? packet : [];
    const phoneArray = Array.isArray(phone) ? phone : [];
    const rows = [...packetArray, ...phoneArray].filter((o) => {
      const status = normalizeOrderStatus(o?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      return true;
    });

    const fastRows = rows
      .map((order) => normalizeOpenOrder({ ...order, items: Array.isArray(order?.items) ? order.items : [] }))
      .filter(Boolean);
    if (typeof onPartial === "function") {
      onPartial(fastRows);
    }

    const runWithConcurrency = async (arr, limit, task) => {
      const list = Array.isArray(arr) ? arr : [];
      const count = Math.max(1, Math.min(limit, list.length || 1));
      const results = new Array(list.length);
      let idx = 0;
      await Promise.all(
        Array.from({ length: count }, async () => {
          while (idx < list.length) {
            const current = idx++;
            try {
              results[current] = await task(list[current]);
            } catch (err) {
              if (isAbortError(err)) throw err;
              console.warn("⚠️ Packet fallback fetch failed for order:", list[current]?.id, err);
              results[current] = null;
            }
          }
        })
      );
      return results.filter(Boolean);
    };

    const ordersWithItems = await runWithConcurrency(rows, 6, async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`, { signal });
        calls += 1;
        const items = Array.isArray(itemsRaw) ? itemsRaw : [];
        let receiptMethods = [];
        if (order.receipt_id) {
          try {
            const methods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`, { signal });
            calls += 1;
            receiptMethods = Array.isArray(methods) ? methods : [];
          } catch (err) {
            if (!isAbortError(err)) {
              console.warn("⚠️ Failed to fetch receipt methods for order", order.id, err);
            }
          }
        }
        return normalizeOpenOrder({ ...order, items, receiptMethods });
      });

    if (import.meta.env.DEV) {
      const totalItems = ordersWithItems.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=packet-legacy orders=${ordersWithItems.length} items=${totalItems} calls=${calls}`
      );
    }

    return ordersWithItems.filter(Boolean);
  },
  [normalizeOpenOrder]
);

const fetchKitchenOpenOrdersLegacy = useCallback(
  async (signal) => {
    let calls = 0;
    const data = await secureFetch("/orders", { signal });
    calls += 1;
    const list = Array.isArray(data) ? data : [];

    const openOrders = list.filter((o) => {
      const status = normalizeOrderStatus(o?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(o?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.kitchen.includes(type);
    });

    const ordersWithItems = await Promise.all(
      openOrders.map(async (order) => {
        const itemsRaw = await secureFetch(`/orders/${order.id}/items`, { signal });
        calls += 1;
        const items = Array.isArray(itemsRaw) ? itemsRaw : [];
        return normalizeOpenOrder({ ...order, items });
      })
    );

    if (import.meta.env.DEV) {
      const totalItems = ordersWithItems.reduce(
        (sum, order) => sum + (Array.isArray(order?.items) ? order.items.length : 0),
        0
      );
      console.log(
        `[TableOverview] open orders fetched: mode=kitchen-legacy orders=${ordersWithItems.length} items=${totalItems} calls=${calls}`
      );
    }

    return ordersWithItems.filter(Boolean);
  },
  [normalizeOpenOrder]
);

const fetchPacketOrders = useCallback(async () => {
  const { requestId, controller } = startLatestRequest(packetFetchRef);
  try {
    const batched = await fetchOpenOrdersBatch("packet", controller.signal);
    if (!isLatestRequest(packetFetchRef, requestId)) return;
    upsertOpenOrdersForMode("packet", batched);
    setPacketOrdersCount(batched.length);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackRows = await fetchPacketOrdersLegacy(controller.signal, {
        onPartial: (partialRows) => {
          if (!isLatestRequest(packetFetchRef, requestId)) return;
          upsertOpenOrdersForMode("packet", partialRows);
          setPacketOrdersCount(partialRows.length);
        },
      });
      if (!isLatestRequest(packetFetchRef, requestId)) return;
      upsertOpenOrdersForMode("packet", fallbackRows);
      setPacketOrdersCount(fallbackRows.length);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.error("❌ Fetch packet orders failed:", fallbackErr);
      toast.error(t("Could not load packet orders"));
    }
  }
}, [
  fetchOpenOrdersBatch,
  fetchPacketOrdersLegacy,
  isLatestRequest,
  startLatestRequest,
  t,
  upsertOpenOrdersForMode,
]);

const openOrdersList = React.useMemo(
  () => Object.values(openOrdersById || {}),
  [openOrdersById]
);

const packetOrders = React.useMemo(() => {
  return openOrdersList
    .filter((order) => {
      const status = normalizeOrderStatus(order?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(order?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.packet.includes(type);
    })
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0));
}, [openOrdersList]);

const kitchenOpenOrders = React.useMemo(() => {
  return openOrdersList
    .filter((order) => {
      const status = normalizeOrderStatus(order?.status);
      if (status === "closed") return false;
      if (isOrderCancelledOrCanceled(status)) return false;
      const type = String(order?.order_type || "").toLowerCase();
      return OPEN_ORDER_TYPES.kitchen.includes(type);
    })
    .sort((a, b) => {
      const am = parseLooseDateToMs(a?.created_at);
      const bm = parseLooseDateToMs(b?.created_at);
      if (Number.isFinite(am) && Number.isFinite(bm)) return bm - am;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
}, [openOrdersList]);

const fetchPacketOrdersCountLegacy = useCallback(async (signal) => {
  const [packet, phone] = await Promise.all([
    secureFetch(`/orders?type=packet`, { signal }),
    secureFetch(`/orders?type=phone`, { signal }),
  ]);
  const packetArray = Array.isArray(packet) ? packet : [];
  const phoneArray = Array.isArray(phone) ? phone : [];
  return [...packetArray, ...phoneArray].filter((o) => {
    const status = normalizeOrderStatus(o?.status);
    if (status === "closed") return false;
    if (isOrderCancelledOrCanceled(status)) return false;
    return true;
  }).length;
}, []);

const fetchPacketOrdersCount = useCallback(async () => {
  if (!canSeePacketTab) return;
  const { requestId, controller } = startLatestRequest(packetCountFetchRef);
  try {
    const batched = await fetchOpenOrdersBatch("packet", controller.signal);
    if (!isLatestRequest(packetCountFetchRef, requestId)) return;
    setPacketOrdersCount(batched.length);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackCount = await fetchPacketOrdersCountLegacy(controller.signal);
      if (!isLatestRequest(packetCountFetchRef, requestId)) return;
      setPacketOrdersCount(fallbackCount);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.warn("⚠️ Failed to fetch packet orders count:", fallbackErr);
      setPacketOrdersCount(0);
    }
  }
}, [
  canSeePacketTab,
  fetchOpenOrdersBatch,
  fetchPacketOrdersCountLegacy,
  isLatestRequest,
  startLatestRequest,
]);

useEffect(() => {
  fetchPacketOrdersCount();
}, [fetchPacketOrdersCount]);

useEffect(() => {
  setPacketOrdersCount(Array.isArray(packetOrders) ? packetOrders.length : 0);
}, [packetOrders]);

useEffect(() => {
  return () => {
    packetFetchRef.current?.controller?.abort?.();
    packetCountFetchRef.current?.controller?.abort?.();
    kitchenFetchRef.current?.controller?.abort?.();
  };
}, []);

const [takeawayOrders, setTakeawayOrders] = useState([]);
const [takeawayCheckInSubmittingId, setTakeawayCheckInSubmittingId] = useState(null);

const fetchTakeawayOrders = useCallback(async () => {
  try {
    const data = await secureFetch("/orders?type=takeaway");
    const filtered = Array.isArray(data)
      ? data.filter((o) => {
          const status = normalizeOrderStatus(o?.status);
          if (status === "closed") return false;
          if (isOrderCancelledOrCanceled(status)) return false;
          return true;
        })
      : [];

    // Fetch items and receipt methods for accurate total display (like tables/packet)
    const ordersWithItems = await Promise.all(
      filtered.map(async (order) => {
        try {
          let orderMeta = null;
          try {
            orderMeta = await secureFetch(`/orders/${order.id}`);
          } catch (metaErr) {
            console.warn("⚠️ Failed to fetch takeaway order meta", order.id, metaErr);
          }

          let items = (await secureFetch(`/orders/${order.id}/items`)).map((item) => ({
            ...item,
            discount_type: item.discount_type || item.discountType || null,
            discount_value:
              item.discount_value != null
                ? parseFloat(item.discount_value)
                : item.discountValue != null
                ? parseFloat(item.discountValue)
                : 0,
          }));

          // ✅ Fallback for online-paid orders missing item paid flags
          // Only do this if the backend doesn't provide per-item paid markers at all.
          if (isOrderPaid(order)) {
            const hasAnyPaidMarker = items.some(
              (i) => i?.paid_at != null || typeof i?.paid === "boolean"
            );
            if (!hasAnyPaidMarker) {
              items = items.map((i) => ({ ...i, paid: true }));
            }
          }

          let receiptMethods = [];
          if (order.receipt_id) {
            try {
              receiptMethods = await secureFetch(`/orders/receipt-methods/${order.receipt_id}`);
            } catch (e) {
              console.warn("⚠️ Failed to fetch receipt methods for takeaway order", order.id, e);
            }
          }

          return {
            ...order,
            ...(orderMeta && typeof orderMeta === "object" ? orderMeta : {}),
            items,
            receiptMethods,
          };
        } catch (e) {
          console.warn("⚠️ Failed to enrich takeaway order", order.id, e);
          return { ...order, items: [], receiptMethods: [] };
        }
      })
    );

    setTakeawayOrders(ordersWithItems);
  } catch (err) {
    console.error("❌ Fetch takeaway orders failed:", err);
    toast.error("Could not load takeaway orders");
  }
}, []);

const handleTakeawayConcertTicketCheckIn = useCallback(
  async (order) => {
    const orderId = Number(order?.id);
    if (!Number.isFinite(orderId) || orderId <= 0) return;

    const paymentStatus = String(
      order?.concert_booking_payment_status ?? order?.concertBookingPaymentStatus ?? ""
    )
      .trim()
      .toLowerCase();
    const bookingStatus = String(
      order?.concert_booking_status ?? order?.concertBookingStatus ?? ""
    )
      .trim()
      .toLowerCase();
    const isConfirmed = paymentStatus === "confirmed" || bookingStatus === "confirmed";
    if (!isConfirmed) {
      toast.warning(
        t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
      );
      return;
    }

    try {
      setTakeawayCheckInSubmittingId(orderId);
      const response = await postReservationCheckinWithFallback({
        request: secureFetch,
        orderId,
        reservationId: order?.reservation_id ?? order?.reservationId,
      });
      const updatedOrder =
        response?.order && typeof response.order === "object" ? response.order : null;

      setTakeawayOrders((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((row) => {
          if (Number(row?.id) !== orderId) return row;
          return {
            ...row,
            ...(updatedOrder || {}),
            status: updatedOrder?.status ?? "checked_in",
          };
        });
      });

      toast.success(t("Guest checked in"));
      await Promise.all([fetchTakeawayOrders(), fetchOrders({ skipHydration: true })]);
      setTimeout(() => fetchOrders(), 350);
    } catch (err) {
      const statusCode = Number(err?.details?.status);
      const errorCode = String(err?.details?.body?.code || "").toLowerCase();
      if (statusCode === 409 && errorCode === "concert_booking_unconfirmed") {
        toast.warning(
          t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
        );
        return;
      }
      console.error("❌ Failed to check in pre-order concert ticket:", err);
      const toastConfig = getReservationCheckinErrorToastMessage(err, t, qrBookingSettings);
      if (toastConfig.level === "warning") {
        toast.warning(toastConfig.message);
      } else {
        toast.error(toastConfig.message);
      }
    } finally {
      setTakeawayCheckInSubmittingId(null);
    }
  },
  [fetchOrders, fetchTakeawayOrders, t]
);

/* moved below loadDataForTab to avoid TDZ */












// (location + handleTabSelect declared above)





useEffect(() => {
  const today = formatLocalYmd(new Date());
  setFromDate(today);
  setToDate(today);
}, []);

  const loadConcertBookingsForOverview = useCallback(async (options = {}) => {
    void options;
    const showLoading = true;
    if (showLoading) setConcertBookingsLoading(true);
    try {
      const eventsRes = await secureFetch("/concerts/events?include_hidden=true");
      const allEvents = Array.isArray(eventsRes?.events) ? eventsRes.events : [];
      const eventsForOverview = allEvents
        .sort((a, b) => {
          const aMs = getConcertEventStartMs(a);
          const bMs = getConcertEventStartMs(b);
          return aMs - bMs;
        });

      if (eventsForOverview.length === 0) {
        setHasUpcomingConcerts(false);
        setConcertBookings([]);
        return [];
      }

      const bookingChunks = await Promise.all(
        eventsForOverview.map(async (event) => {
          try {
            const res = await secureFetch(`/concerts/events/${event.id}/bookings`);
            const rows = Array.isArray(res?.bookings) ? res.bookings : [];
            return rows.map((booking) => ({
              ...booking,
              event_id: event.id,
              event_title: event.event_title || "",
              artist_name: event.artist_name || "",
              event_date: event.event_date,
              event_time: event.event_time,
            }));
          } catch (err) {
            console.warn("⚠️ Failed to load concert bookings for event", event.id, err);
            return [];
          }
        })
      );

      const merged = bookingChunks
        .flat()
        .filter((booking) => {
          const paymentStatus = String(
            booking?.payment_status ?? booking?.paymentStatus ?? ""
          )
            .trim()
            .toLowerCase();
          const reservationOrderStatus = normalizeOrderStatus(
            booking?.reservation_order_status ?? booking?.reservationOrderStatus ?? ""
          );
          const bookingStatus = String(
            booking?.booking_status ?? booking?.bookingStatus ?? booking?.status ?? ""
          )
            .trim()
            .toLowerCase();
          const isCancelled =
            paymentStatus === "cancelled" ||
            paymentStatus === "canceled" ||
            reservationOrderStatus === "cancelled" ||
            reservationOrderStatus === "canceled";
          const isCheckedOutOrClosed =
            reservationOrderStatus === "checked_out" ||
            reservationOrderStatus === "closed" ||
            reservationOrderStatus === "completed" ||
            bookingStatus === "checked_out";
          return !isCancelled && !isCheckedOutOrClosed;
        })
        .sort((a, b) => {
          const aEventMs = getConcertEventStartMs(a);
          const bEventMs = getConcertEventStartMs(b);
          if (aEventMs !== bEventMs) return aEventMs - bEventMs;
          const aCreated = parseLooseDateToMs(a?.created_at) || 0;
          const bCreated = parseLooseDateToMs(b?.created_at) || 0;
          return bCreated - aCreated;
        });
      setHasUpcomingConcerts(merged.length > 0);
      setConcertBookings(merged);
      return merged;
    } catch (err) {
      console.error("❌ Failed to load concert bookings for table overview:", err);
      setHasUpcomingConcerts(false);
      setConcertBookings([]);
      return [];
    } finally {
      if (showLoading) setConcertBookingsLoading(false);
    }
  }, []);

  const loadReservationBookingsForOverview = useCallback(async (options = {}) => {
    void options;
    const showLoading = true;
    if (showLoading) setReservationBookingsLoading(true);
    try {
      const response = await secureFetch("/orders/reservations");
      const rows = Array.isArray(response?.reservations)
        ? response.reservations
        : Array.isArray(response)
        ? response
        : [];
      const normalized = rows
        .filter((booking) => {
          const hasConcertContext = hasConcertBookingContext(booking);
          const status = normalizeOrderStatus(
            booking?.status ?? booking?.reservation_status ?? booking?.reservationStatus
          );
          if (hasConcertContext) {
            return (
              status !== "cancelled" &&
              status !== "canceled" &&
              status !== "deleted" &&
              status !== "void"
            );
          }
          return (
            status === "reserved" ||
            status === "confirmed"
          );
        })
        .sort((a, b) => {
          const aTime = parseLooseDateToMs(
            `${a?.reservation_date || ""} ${a?.reservation_time || ""}`.trim()
          );
          const bTime = parseLooseDateToMs(
            `${b?.reservation_date || ""} ${b?.reservation_time || ""}`.trim()
          );
          if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
            return aTime - bTime;
          }
          const aCreated = parseLooseDateToMs(a?.created_at) || 0;
          const bCreated = parseLooseDateToMs(b?.created_at) || 0;
          return bCreated - aCreated;
        });
      setReservationBookingsOverview(normalized);
      return normalized;
    } catch (err) {
      console.error("❌ Failed to load reservations for table overview booking tab:", err);
      setReservationBookingsOverview([]);
      return [];
    } finally {
      if (showLoading) setReservationBookingsLoading(false);
    }
  }, []);

  const updateConcertBookingStatusFromOverview = useCallback(
    async (bookingId, paymentStatus) => {
      const numericBookingId = Number(bookingId);
      if (!Number.isFinite(numericBookingId) || numericBookingId <= 0) return;
      const booking = (Array.isArray(concertBookings) ? concertBookings : []).find(
        (row) => Number(row?.id ?? row?.booking_id ?? row?.bookingId) === numericBookingId
      ) || null;
      const normalizedNextStatus = String(paymentStatus || "").trim().toLowerCase();
      const isCancelling =
        normalizedNextStatus === "cancelled" || normalizedNextStatus === "canceled";
      let cancellationReason = "";
      if (isCancelling) {
        const input = window.prompt(t("Enter a cancellation reason."));
        if (input === null) return;
        const trimmed = String(input || "").trim();
        if (!trimmed) {
          toast.warning(t("Reason is required"));
          return;
        }
        cancellationReason = trimmed;
      }
      const bookingTableNumber = Number(
        booking?.reserved_table_number ??
          booking?.reservedTableNumber ??
          booking?.table_number ??
          booking?.tableNumber
      );
      const bookingOrderId = Number(
        booking?.reservation_order_id ?? booking?.reservationOrderId ?? booking?.order_id ?? booking?.orderId
      );
      setConcertBookingUpdatingId(numericBookingId);
      try {
        if (normalizedNextStatus === "confirmed") {
          markBookingConfirmedLocally({
            tableNumber: Number.isFinite(bookingTableNumber) ? bookingTableNumber : null,
            reservationId: Number(booking?.id) || null,
            orderId: Number.isFinite(bookingOrderId) ? bookingOrderId : null,
            reservation: {
              ...(booking || {}),
              status: "confirmed",
              payment_status: "confirmed",
              paymentStatus: "confirmed",
              concert_booking_payment_status: "confirmed",
              concertBookingPaymentStatus: "confirmed",
              booking_status: "confirmed",
              bookingStatus: "confirmed",
            },
          });
        } else if (isCancelling) {
          removeBookingFromViewBookingLists({
            tableNumber: Number.isFinite(bookingTableNumber) ? bookingTableNumber : null,
            reservationId: numericBookingId,
            orderId: Number.isFinite(bookingOrderId) ? bookingOrderId : null,
          });
        }

        await secureFetch(`/concerts/bookings/${numericBookingId}/payment-status`, {
          method: "PATCH",
          body: JSON.stringify({
            payment_status: paymentStatus,
            ...(cancellationReason
              ? {
                  cancellation_reason: cancellationReason,
                  cancel_reason: cancellationReason,
                  reason: cancellationReason,
                }
              : {}),
          }),
        });
        toast.success(t("Saved successfully!"));
        void Promise.all([loadConcertBookingsForOverview({ force: true }), fetchOrders()]).catch(
          () => {}
        );
      } catch (err) {
        console.error("❌ Failed to update concert booking from table overview:", err);
        await Promise.allSettled([
          loadConcertBookingsForOverview({ force: true }),
          loadReservationBookingsForOverview({ force: true }),
          fetchOrders(),
        ]);
        toast.error(err?.message || t("Failed to save changes"));
      } finally {
        setConcertBookingUpdatingId(null);
      }
    },
    [
      concertBookings,
      fetchOrders,
      loadConcertBookingsForOverview,
      loadReservationBookingsForOverview,
      markBookingConfirmedLocally,
      removeBookingFromViewBookingLists,
      t,
    ]
  );

  const updateReservationBookingStatusFromOverview = useCallback(
    async (booking, nextStatus) => {
      const bookingKey = String(
        booking?.id ??
          booking?.order_id ??
          booking?.orderId ??
          booking?.table_number ??
          booking?.tableNumber ??
          ""
      );
      if (!bookingKey) return;

      const tableNumber = Number(booking?.table_number ?? booking?.tableNumber);
      const preferredOrderId = Number(booking?.order_id ?? booking?.orderId ?? booking?.id);
      const tableOrder =
        effectiveOrdersByTableRaw instanceof Map && Number.isFinite(tableNumber)
          ? effectiveOrdersByTableRaw.get(tableNumber)
          : null;
      const tableOrderSnapshot = Array.isArray(tableOrder)
        ? (Number.isFinite(preferredOrderId) && preferredOrderId > 0
            ? tableOrder.find((order) => Number(order?.id) === preferredOrderId)
            : null) ||
          tableOrder[0] ||
          null
        : tableOrder || null;
      const tableLike = {
        tableNumber,
        table_number: tableNumber,
        order: tableOrderSnapshot,
        reservationFallback: booking,
      };
      const nextStatusNormalized = String(nextStatus || "").toLowerCase();
      const targetReservationId = Number(
        booking?.id ?? booking?.reservation_id ?? booking?.reservationId
      );
      const candidateOrderIds = Array.from(
        new Set(
          [
            booking?.order_id,
            booking?.orderId,
            booking?.reservation_order_id,
            booking?.reservationOrderId,
            tableOrderSnapshot?.id,
            tableOrderSnapshot?.order_id,
            tableOrderSnapshot?.orderId,
            tableOrderSnapshot?.reservation?.order_id,
            tableOrderSnapshot?.reservation?.orderId,
            tableOrderSnapshot?.reservation?.id,
            booking?.id,
          ]
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
        )
      );
      const primaryTargetOrderId = candidateOrderIds[0] ?? null;

      setReservationBookingUpdatingKey(bookingKey);
      try {
        if (nextStatusNormalized === "confirmed") {
          if (!Number.isFinite(primaryTargetOrderId) || primaryTargetOrderId <= 0) {
            toast.warning(t("Reservation record not found"));
            return;
          }
          markBookingConfirmedLocally({
            tableNumber: Number.isFinite(tableNumber) ? tableNumber : null,
            reservationId: Number.isFinite(targetReservationId) ? targetReservationId : null,
            orderId: primaryTargetOrderId,
            reservation: {
              ...(booking || {}),
              status: "confirmed",
              reservation_status: "confirmed",
              reservationStatus: "confirmed",
              order_id: primaryTargetOrderId,
              orderId: primaryTargetOrderId,
            },
          });
          let resolvedConfirmedOrderId = primaryTargetOrderId;
          let lastResolvableError = null;
          for (const candidateId of candidateOrderIds) {
            try {
              await secureFetch(`/orders/${candidateId}/status`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "confirmed",
                  total: Number(tableOrderSnapshot?.total ?? booking?.total ?? 0) || 0,
                  payment_method:
                    tableOrderSnapshot?.payment_method ??
                    tableOrderSnapshot?.paymentMethod ??
                    booking?.payment_method ??
                    booking?.paymentMethod ??
                    "Unknown",
                }),
              });
              resolvedConfirmedOrderId = candidateId;
              lastResolvableError = null;
              break;
            } catch (candidateErr) {
              const statusCode = Number(candidateErr?.details?.status);
              const message = String(candidateErr?.message || "").toLowerCase();
              const canRetryWithAnotherCandidate =
                statusCode === 404 ||
                message.includes("not found") ||
                message.includes("cannot");
              if (!canRetryWithAnotherCandidate) throw candidateErr;
              lastResolvableError = candidateErr;
            }
          }
          if (lastResolvableError) throw lastResolvableError;

          const confirmedReservation = buildReservationShadowRecord({
            reservation: { ...(booking || {}), status: "confirmed" },
            order: tableOrderSnapshot
              ? {
                  ...tableOrderSnapshot,
                  status: "confirmed",
                  reservation: {
                    ...(tableOrderSnapshot?.reservation || {}),
                    ...(booking || {}),
                    status: "confirmed",
                  },
                }
              : null,
            tableNumber,
            orderId: resolvedConfirmedOrderId,
          });
          if (confirmedReservation) {
            upsertReservationShadow(confirmedReservation);
          }
          markBookingConfirmedLocally({
            tableNumber,
            reservationId: confirmedReservation?.id ?? Number(booking?.id),
            orderId: resolvedConfirmedOrderId,
            reservation: confirmedReservation,
          });
          setReservationsToday((prev) =>
            (Array.isArray(prev) ? prev : []).map((row) => {
              const rowReservationId = Number(row?.id);
              const rowOrderId = Number(row?.order_id ?? row?.orderId);
              const matchesReservation =
                rowReservationId === Number(booking?.id) ||
                rowOrderId === resolvedConfirmedOrderId;
              if (!matchesReservation) return row;
              return {
                ...row,
                ...(confirmedReservation || {}),
                status: "confirmed",
              };
            })
          );
          toast.success(t("Saved successfully!"));
        } else if (nextStatusNormalized === "cancelled") {
          const input = window.prompt(t("Enter a cancellation reason."));
          if (input === null) {
            return;
          }
          const trimmedReason = String(input || "").trim();
          if (!trimmedReason) {
            toast.warning(t("Reason is required"));
            return;
          }
          await handleDeleteReservation(tableLike, booking, {
            reason: trimmedReason,
            skipConfirm: true,
          });
        }
        void Promise.all([
          loadReservationBookingsForOverview({ force: true }),
          loadConcertBookingsForOverview({ force: true }),
          fetchOrders(),
        ]).catch(() => {});
      } catch (err) {
        console.error("❌ Failed to update reservation booking from table overview:", err);
        await Promise.allSettled([
          loadReservationBookingsForOverview({ force: true }),
          loadConcertBookingsForOverview({ force: true }),
          fetchOrders(),
        ]);
        toast.error(err?.message || t("Failed to save changes"));
      } finally {
        setReservationBookingUpdatingKey(null);
      }
    },
    [
      effectiveOrdersByTableRaw,
      fetchOrders,
      handleDeleteReservation,
      loadConcertBookingsForOverview,
      loadReservationBookingsForOverview,
      markBookingConfirmedLocally,
      t,
    ]
  );

  const handleClearOldFulfilledBookings = useCallback(
    async (bookings, range = {}) => {
      const list = Array.isArray(bookings) ? bookings : [];
      if (list.length === 0) {
        toast.info(t("No bookings found for selected filters"));
        return;
      }

      const fulfilledReservationStatuses = new Set([
        "checked_out",
        "completed",
        "closed",
        "cancelled",
        "canceled",
      ]);
      const fulfilledConcertStatuses = new Set([
        "confirmed",
        "checked_in",
        "completed",
        "closed",
        "cancelled",
        "canceled",
      ]);

      const targets = list.filter((booking) => {
        if (String(booking?.booking_source || "").toLowerCase() === "concert") {
          const paymentStatus = String(
            booking?.payment_status ?? booking?.paymentStatus ?? booking?.status ?? ""
          )
            .trim()
            .toLowerCase();
          return fulfilledConcertStatuses.has(paymentStatus);
        }

        const reservationStatus = normalizeOrderStatus(
          booking?.status ?? booking?.reservation_status ?? booking?.reservationStatus ?? ""
        );
        return fulfilledReservationStatuses.has(reservationStatus);
      });

      if (targets.length === 0) {
        toast.info(t("No fulfilled or cancelled bookings to clear in selected date range"));
        return;
      }

      const ok = window.confirm(
        t("Clear {{count}} fulfilled/cancelled bookings? A PDF backup will be downloaded first.", {
          count: targets.length,
        })
      );
      if (!ok) return;

      try {
        const lines = targets.map((booking) => {
          const source = String(booking?.booking_source || "").toLowerCase();
          const name = booking?.customer_name || booking?.customerName || "Guest";
          const phone = booking?.customer_phone || booking?.customerPhone || "";
          const date = normalizeBookingDateYmd(booking) || "-";
          const status =
            source === "concert"
              ? String(booking?.payment_status ?? booking?.paymentStatus ?? booking?.status ?? "")
              : String(booking?.status ?? booking?.reservation_status ?? booking?.reservationStatus ?? "");
          const id = booking?.id ?? booking?.order_id ?? booking?.orderId ?? "-";
          return `${source || "booking"} | id:${id} | ${name} ${phone ? `| ${phone} ` : ""}| ${date} | ${status}`;
        });
        const backupDate = formatLocalYmd(new Date());
        const backupBlob = buildSimplePdfBlob(
          `Bookings Backup ${backupDate} (${range?.from || "-"} to ${range?.to || "-"})`,
          lines
        );
        const backupUrl = window.URL.createObjectURL(backupBlob);
        const link = document.createElement("a");
        link.href = backupUrl;
        link.download = `bookings-backup-${backupDate}.pdf`;
        link.click();
        window.URL.revokeObjectURL(backupUrl);
      } catch (backupErr) {
        console.error("❌ Failed to generate bookings backup PDF:", backupErr);
        toast.error(t("Failed to generate backup PDF"));
        return;
      }

      setClearingBookings(true);
      try {
        const results = await Promise.allSettled(
          targets.map(async (booking) => {
            const source = String(booking?.booking_source || "").toLowerCase();
            if (source === "concert") {
              const bookingId = Number(booking?.id);
              if (!Number.isFinite(bookingId) || bookingId <= 0) return false;
              const paymentStatus = String(
                booking?.payment_status ?? booking?.paymentStatus ?? ""
              )
                .trim()
                .toLowerCase();
              if (paymentStatus === "cancelled" || paymentStatus === "canceled") return true;
              await secureFetch(`/concerts/bookings/${bookingId}/payment-status`, {
                method: "PATCH",
                body: JSON.stringify({ payment_status: "cancelled" }),
              });
              return true;
            }

            const targetOrderId = Number(booking?.order_id ?? booking?.orderId ?? booking?.id);
            if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) return false;
            await secureFetch(`/orders/${targetOrderId}/reservations`, {
              method: "DELETE",
              body: JSON.stringify({
                delete_reason: "Bulk cleanup old fulfilled bookings",
                cancellation_reason: "Bulk cleanup old fulfilled bookings",
              }),
            });
            return true;
          })
        );

        const successCount = results.filter(
          (entry) => entry.status === "fulfilled" && entry.value === true
        ).length;
        const failedCount = results.length - successCount;
        if (successCount > 0) {
          const successKeys = targets
            .filter((_, index) => results[index]?.status === "fulfilled" && results[index]?.value === true)
            .map((booking) => getViewBookingKey(booking));
          setSuppressedBookingKeys((prev) => {
            const next = new Set(prev);
            successKeys.forEach((key) => next.add(key));
            return next;
          });
        }

        if (successCount > 0) {
          toast.success(t("Cleared {{count}} bookings", { count: successCount }));
        }
        if (failedCount > 0) {
          toast.warn(t("Failed to clear {{count}} bookings", { count: failedCount }));
        }

        await Promise.all([
          loadConcertBookingsForOverview({ force: true }),
          loadReservationBookingsForOverview({ force: true }),
          fetchOrders(),
        ]);
      } finally {
        setClearingBookings(false);
      }
    },
    [
      fetchOrders,
      loadConcertBookingsForOverview,
      loadReservationBookingsForOverview,
      t,
    ]
  );

  useEffect(() => {
    if (isStressModeActive) return;
    if (activeTab !== "tables") return;
    loadConcertBookingsForOverview();
    loadReservationBookingsForOverview();
  }, [
    activeTab,
    isStressModeActive,
    loadConcertBookingsForOverview,
    loadReservationBookingsForOverview,
  ]);

  useEffect(() => {
    if (activeTab !== "tables") return;
    if (pendingAreaSelectionRef.current === requestedAreaFromUrl) {
      pendingAreaSelectionRef.current = null;
    }
    if (
      pendingAreaSelectionRef.current != null &&
      pendingAreaSelectionRef.current !== requestedAreaFromUrl &&
      activeArea === pendingAreaSelectionRef.current
    ) {
      return;
    }
    const limitedAreas = [
      ...(canSeeViewBookingTab ? [AREA_FILTER_VIEW_BOOKING] : []),
      ...(canSeeSongRequestTab ? [AREA_FILTER_SONG_REQUEST] : []),
    ];

    if (!canSeeTablesGrid && limitedAreas.length > 0) {
      const nextArea = limitedAreas.includes(requestedAreaFromUrl)
        ? requestedAreaFromUrl
        : limitedAreas[0];
      if (activeArea !== nextArea) {
        setActiveArea(nextArea);
      }
      if (requestedAreaFromUrl !== nextArea) {
        syncTableAreaInUrl(nextArea, { replace: true });
      }
      return;
    }

    if (isSpecialTableArea(requestedAreaFromUrl) && activeArea !== requestedAreaFromUrl) {
      setActiveArea(requestedAreaFromUrl);
      return;
    }

    if (requestedAreaFromUrl === AREA_FILTER_ALL && isSpecialTableArea(activeArea)) {
      setActiveArea(AREA_FILTER_ALL);
    }
  }, [
    activeArea,
    activeTab,
    canSeeSongRequestTab,
    canSeeTablesGrid,
    canSeeViewBookingTab,
    requestedAreaFromUrl,
    syncTableAreaInUrl,
  ]);

  useEffect(() => {
    if (tableSettings.showAreas !== false || !canSeeTablesGrid) return;
    if (activeArea === AREA_FILTER_ALL || isSpecialTableArea(activeArea)) return;
    handleAreaSelect(AREA_FILTER_ALL, { replace: true });
  }, [tableSettings.showAreas, canSeeTablesGrid, activeArea, handleAreaSelect]);

  useEffect(() => {
    if (activeArea === AREA_FILTER_VIEW_BOOKING && !canSeeViewBookingTab) {
      handleAreaSelect(
        !canSeeTablesGrid && canSeeSongRequestTab
          ? AREA_FILTER_SONG_REQUEST
          : AREA_FILTER_ALL,
        { replace: true }
      );
      return;
    }
    if (activeArea === AREA_FILTER_SONG_REQUEST && !canSeeSongRequestTab) {
      handleAreaSelect(
        !canSeeTablesGrid && canSeeViewBookingTab
          ? AREA_FILTER_VIEW_BOOKING
          : AREA_FILTER_ALL,
        { replace: true }
      );
    }
  }, [
    activeArea,
    canSeeSongRequestTab,
    canSeeTablesGrid,
    canSeeViewBookingTab,
    handleAreaSelect,
  ]);

  // If the app stays open across midnight, refresh tables so reservations appear on their day.
  useEffect(() => {
    if (isStressModeActive) return;
    if (activeTab !== "tables") return;
    let timeoutId = null;

    const scheduleNext = () => {
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 0);
      const delayMs = Math.max(1000, nextMidnight.getTime() - Date.now() + 1000);

      timeoutId = window.setTimeout(() => {
        const dayKey = formatLocalYmd(new Date());
        if (lastDayKeyRef.current !== dayKey) {
          lastDayKeyRef.current = dayKey;
          fetchOrders();
        }
        scheduleNext();
      }, delayMs);
    };

    scheduleNext();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [activeTab, fetchOrders, isStressModeActive]);

const fetchKitchenOpenOrders = useCallback(async () => {
  const { requestId, controller } = startLatestRequest(kitchenFetchRef);
  try {
    setKitchenOpenOrdersLoading(true);
    const batched = await fetchOpenOrdersBatch("kitchen", controller.signal);
    if (!isLatestRequest(kitchenFetchRef, requestId)) return;
    upsertOpenOrdersForMode("kitchen", batched);
  } catch (err) {
    if (isAbortError(err)) return;
    try {
      const fallbackRows = await fetchKitchenOpenOrdersLegacy(controller.signal);
      if (!isLatestRequest(kitchenFetchRef, requestId)) return;
      upsertOpenOrdersForMode("kitchen", fallbackRows);
    } catch (fallbackErr) {
      if (isAbortError(fallbackErr)) return;
      console.error("❌ Fetch kitchen open orders failed:", fallbackErr);
    }
  } finally {
    if (isLatestRequest(kitchenFetchRef, requestId)) {
      setKitchenOpenOrdersLoading(false);
    }
  }
}, [
  fetchKitchenOpenOrdersLegacy,
  fetchOpenOrdersBatch,
  isLatestRequest,
  startLatestRequest,
  upsertOpenOrdersForMode,
]);

// Fetch table configurations when viewing tables (inside component)
const fetchTableConfigs = useCallback(async () => {
  const { requestId, controller } = startLatestRequest(tableConfigsFetchRef);
  try {
    if (import.meta.env.DEV) console.log("[TableOverview] fetchTableConfigs start", { requestId });
    const rows = await secureFetch("/tables", { signal: controller.signal });
    if (!isLatestRequest(tableConfigsFetchRef, requestId)) return;
    const arr = Array.isArray(rows) ? rows : [];
    const active = arr.filter((t) => t.active !== false);
    setTableConfigs((prev) => {
      const merged = mergeTableConfigsByNumber(prev, active);
      try {
        localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(merged));
        localStorage.setItem(getTableCountCacheKey(), String(merged.length));
      } catch (cacheErr) {
        void cacheErr;
      }
      if (import.meta.env.DEV)
        console.log("[TableOverview] fetchTableConfigs applied", { requestId, source: "network", length: merged.length });
      return merged;
    });
  } catch (err) {
    if (isAbortError(err)) {
      if (import.meta.env.DEV) console.log("[TableOverview] fetchTableConfigs aborted", { requestId });
      return;
    }
    // Keep any cached/previous configs so the grid doesn't blink on transient errors.
    console.warn("[TableOverview] fetchTableConfigs failed:", err);
  }
}, []);

const upsertTableConfigLocal = useCallback((tableNumber, patch) => {
  const normalizedNumber = Number(tableNumber);
  if (!Number.isFinite(normalizedNumber)) return;

  setTableConfigs((prev) => {
    const prevArr = Array.isArray(prev) ? prev : [];
    let found = false;
    const next = prevArr.map((cfg) => {
      if (Number(cfg?.number) !== normalizedNumber) return cfg;
      found = true;
      return { ...cfg, ...patch };
    });

    const resolved = found
      ? next
      : mergeTableConfigsByNumber(prevArr, [{ number: normalizedNumber, active: true, ...patch }]);

    try {
      localStorage.setItem(getTableConfigsCacheKey(), JSON.stringify(resolved));
      localStorage.setItem(getTableCountCacheKey(), String(resolved.length));
    } catch (cacheErr) {
      void cacheErr;
    }

    return resolved;
  });
}, []);

const handleGuestsChange = useCallback(
  async (tableNumber, nextGuests) => {
    upsertTableConfigLocal(tableNumber, { guests: nextGuests });
    try {
      await secureFetch(`/tables/${tableNumber}`, {
        method: "PATCH",
        body: JSON.stringify({ guests: nextGuests }),
      });
    } catch (err) {
      console.error("❌ Failed to update table guests:", err);
      toast.error(t("Failed to update table"));
      fetchTableConfigs();
    }
  },
  [fetchTableConfigs, upsertTableConfigLocal, t]
);

const handleToggleTableLock = useCallback(
  async (tableNumber, nextLocked) => {
    const normalizedTableNumber = Number(tableNumber);
    if (!Number.isFinite(normalizedTableNumber)) return;

    const resolvedLocked = Boolean(nextLocked);
    upsertTableConfigLocal(normalizedTableNumber, {
      locked: resolvedLocked,
      is_locked: resolvedLocked,
      occupied: resolvedLocked,
      unavailable: resolvedLocked,
    });
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("beypro:table-lock-updated", {
          detail: {
            table_number: normalizedTableNumber,
            locked: resolvedLocked,
          },
        })
      );
    }

    try {
      await secureFetch(`/tables/${normalizedTableNumber}`, {
        method: "PATCH",
        body: JSON.stringify({
          locked: resolvedLocked,
          is_locked: resolvedLocked,
          occupied: resolvedLocked,
          unavailable: resolvedLocked,
        }),
      });
    } catch (err) {
      console.error("❌ Failed to update table lock:", err);
      toast.error(t("Failed to update table"));
      fetchTableConfigs();
    }
  },
  [fetchTableConfigs, t, upsertTableConfigLocal]
);


  const loadDataForTab = useCallback(
    (tab, options = {}) => {
      const fastTablesOnly = options?.fastTablesOnly === true;
      if (tab === "tables") {
        fetchOrders(fastTablesOnly ? { skipHydration: true } : undefined);
        fetchSongRequests();
        if (!fastTablesOnly) {
          fetchTableConfigs();
        }
        return;
      }
      if (tab === "kitchen" || tab === "open") {
        fetchKitchenOpenOrders();
        return;
      }
      if (tab === "history") {
        return;
      }
      if (tab === "packet") {
        fetchPacketOrders();
        return;
      }
      if (tab === "takeaway") {
        fetchTakeawayOrders();
      }
    },
    [
      fetchKitchenOpenOrders,
      fetchOrders,
      fetchPacketOrders,
      fetchSongRequests,
      fetchTableConfigs,
      fetchTakeawayOrders,
    ]
  );

// now safe to reference loadDataForTab
useEffect(() => {
  if (isStressModeActive) return undefined;
  if (!window) return;
  let rafId = null;
  let bgRefetchTimeoutId = null;
  let bgRefetchIdleId = null;
  // ⚡ Instant refresh without animation frame delay for local events
  const instantRefetch = ({ fastTablesOnly = false } = {}) => {
    if (activeTab !== "packet") fetchPacketOrdersCount();
    if (activeTab === "tables") {
      fetchOrders(fastTablesOnly ? { skipHydration: true } : undefined);
      loadConcertBookingsForOverview();
      loadReservationBookingsForOverview();
      return;
    }
    loadDataForTab(activeTab, { fastTablesOnly });
  };

  const scheduleBackgroundRefetch = () => {
    markPerfTrace("tableoverview-bg-refetch-scheduled", { activeTab });
    if (bgRefetchTimeoutId) window.clearTimeout(bgRefetchTimeoutId);
    if (bgRefetchIdleId && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(bgRefetchIdleId);
      bgRefetchIdleId = null;
    }

    const run = () => {
      bgRefetchTimeoutId = null;
      bgRefetchIdleId = null;
      markPerfTrace("tableoverview-bg-refetch-run", { activeTab });
      instantRefetch();
    };

    if (typeof window.requestIdleCallback === "function") {
      bgRefetchIdleId = window.requestIdleCallback(run, { timeout: 1200 });
      return;
    }
    bgRefetchTimeoutId = window.setTimeout(run, 250);
  };

  const refetch = () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = window.requestAnimationFrame(() => {
      instantRefetch({ fastTablesOnly: true });
      if (activeTab === "tables") {
        // Follow fast socket refresh with one coalesced full refresh for item-level reconciliation.
        scheduleBackgroundRefetch();
      }
    });
  };

  const applyLocalOrderStatusPatch = (detail) => {
    if (!detail || typeof detail !== "object") return false;
    if (detail.kind !== "tableoverview_order_status") return false;

    const tableNumberRaw = detail.table_number;
    const tableNumberKey = normalizeTableKey(tableNumberRaw);
    if (!tableNumberKey) return false;
    const tableNumber = Number(tableNumberRaw);

    const nextStatus = String(detail.status || "").toLowerCase();
    const markItemsPaid = (items) => {
      if (!Array.isArray(items)) return [];
      const paidAt = new Date().toISOString();
      return items.map((item) => ({
        ...item,
        paid: true,
        paid_at: item?.paid_at ?? item?.paidAt ?? paidAt,
      }));
    };
    const markSubordersPaid = (suborders) => {
      if (!Array.isArray(suborders)) return [];
      return suborders.map((suborder) => ({
        ...suborder,
        items: markItemsPaid(suborder?.items),
      }));
    };
    const patchStartedAt = performance.now();
    let didMutateOrder = false;
    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];

      if (LOCAL_REMOVE_ORDER_STATUSES.has(nextStatus)) {
        const next = prevArr.filter(
          (o) =>
            !isSameTableNumber(
              o?.table_number ?? o?.tableNumber ?? o?.table_id ?? o?.tableId ?? o?.table,
              tableNumberKey
            )
        );
        didMutateOrder = next.length !== prevArr.length;
        next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
        return next;
      }

      const orderId =
        detail.order_id === null || detail.order_id === undefined
          ? null
          : Number(detail.order_id);

      const incomingPatch = detail.patch && typeof detail.patch === "object" ? detail.patch : null;
      const patch =
        nextStatus === "paid"
          ? {
              payment_status: "paid",
              is_paid: true,
              ...(incomingPatch || null),
            }
          : {
              status: detail.status,
              ...(incomingPatch || null),
            };

      const next = prevArr.map((o) => {
        const sameTable = isSameTableNumber(
          o?.table_number ?? o?.tableNumber ?? o?.table_id ?? o?.tableId ?? o?.table,
          tableNumberKey
        );
        if (!sameTable) return o;
        didMutateOrder = true;
        const shouldPreserveCheckedInOnPaid =
          nextStatus === "paid" &&
          normalizeOrderStatus(o?.status) === "checked_in" &&
          hasReservationSignal(o);
        const resolvedStatus =
          nextStatus === "paid"
            ? shouldPreserveCheckedInOnPaid
              ? "checked_in"
              : "paid"
            : preserveCheckedInStatus(detail.status, o, incomingPatch);
        const paidItemsSource =
          nextStatus === "paid"
            ? Array.isArray(incomingPatch?.items)
              ? incomingPatch.items
              : o?.items
            : null;
        const paidSubordersSource =
          nextStatus === "paid"
            ? Array.isArray(incomingPatch?.suborders)
              ? incomingPatch.suborders
              : o?.suborders
            : null;
        return {
          ...o,
          ...(orderId != null && Number.isFinite(orderId) ? { id: orderId } : null),
          ...patch,
          ...(resolvedStatus ? { status: resolvedStatus } : null),
          ...(nextStatus === "paid"
            ? {
                items: markItemsPaid(paidItemsSource),
                suborders: markSubordersPaid(paidSubordersSource),
              }
            : null),
          table_number: Number.isFinite(tableNumber) ? tableNumber : tableNumberRaw,
        };
      });

      next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
      return next;
    });

    markPerfTrace("tableoverview-local-status-patch", {
      tableNumber,
      status: nextStatus,
      durationMs: Number((performance.now() - patchStartedAt).toFixed(2)),
    });

    const detailPatch = detail.patch && typeof detail.patch === "object" ? detail.patch : null;
    const reservationPayload =
      detailPatch?.reservation && typeof detailPatch.reservation === "object"
        ? detailPatch.reservation
        : detailPatch;
    const reservationStatus = normalizeOrderStatus(
      reservationPayload?.status ??
        reservationPayload?.reservation_status ??
        reservationPayload?.reservationStatus ??
        ""
    );
    const normalizedReservationId = Number(
      reservationPayload?.id ??
        reservationPayload?.reservation_id ??
        reservationPayload?.reservationId ??
        detailPatch?.reservation_id ??
        detailPatch?.reservationId
    );
    const normalizedOrderId = Number(
      detail.order_id ??
        reservationPayload?.order_id ??
        reservationPayload?.orderId ??
        detailPatch?.order_id ??
        detailPatch?.orderId
    );

    if (nextStatus === "checked_in" || reservationStatus === "checked_in") {
      markBookingCheckedInInViewBookingLists({
        tableNumber,
        reservationId: Number.isFinite(normalizedReservationId) ? normalizedReservationId : null,
        orderId: Number.isFinite(normalizedOrderId) ? normalizedOrderId : null,
        reservation: reservationPayload,
      });
    } else if (nextStatus === "confirmed" || reservationStatus === "confirmed") {
      markBookingConfirmedLocally({
        tableNumber,
        reservationId: Number.isFinite(normalizedReservationId) ? normalizedReservationId : null,
        orderId: Number.isFinite(normalizedOrderId) ? normalizedOrderId : null,
        reservation: reservationPayload,
      });
    }

    return didMutateOrder;
  };

  const applyLocalKitchenStatusPatch = (detail) => {
    if (!detail || typeof detail !== "object") return false;
    if (detail.kind !== "kitchen_status_update") return false;

    const normalizedStatus = String(detail.status || "").trim().toLowerCase();
    const itemIdSet = new Set(
      (Array.isArray(detail.item_ids) ? detail.item_ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    );
    if (!normalizedStatus || itemIdSet.size === 0) return false;

    const timestamp = new Date().toISOString();
    const patchItems = (items = []) => {
      if (!Array.isArray(items)) return { items: [], changed: false };
      let changed = false;
      const nextItems = items.map((item) => {
        const itemId = Number(item?.item_id ?? item?.id ?? item?.order_item_id);
        if (!Number.isFinite(itemId) || !itemIdSet.has(itemId)) return item;
        changed = true;
        return {
          ...item,
          kitchen_status: normalizedStatus,
          kitchen_status_updated_at: timestamp,
          ...(normalizedStatus === "preparing"
            ? {
                prep_started_at: item?.prep_started_at ?? item?.prepStartedAt ?? timestamp,
                prepStartedAt: item?.prepStartedAt ?? item?.prep_started_at ?? timestamp,
              }
            : null),
        };
      });
      return { items: nextItems, changed };
    };

    let changedAny = false;
    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      const next = prevArr.map((order) => {
        const mainResult = patchItems(order?.items);
        let subordersChanged = false;
        const nextSuborders = Array.isArray(order?.suborders)
          ? order.suborders.map((suborder) => {
              const subResult = patchItems(suborder?.items);
              if (!subResult.changed) return suborder;
              subordersChanged = true;
              return {
                ...suborder,
                items: subResult.items,
              };
            })
          : order?.suborders;

        if (!mainResult.changed && !subordersChanged) return order;
        changedAny = true;
        const allItems = [
          ...mainResult.items,
          ...(Array.isArray(nextSuborders)
            ? nextSuborders.flatMap((suborder) => (Array.isArray(suborder?.items) ? suborder.items : []))
            : []),
        ];
        const allDelivered =
          allItems.length > 0 && allItems.every((item) => item?.kitchen_status === "delivered");

        return {
          ...order,
          items: mainResult.items,
          ...(Array.isArray(nextSuborders) ? { suborders: nextSuborders } : null),
          kitchen_status_updated_at: timestamp,
          ...(normalizedStatus === "preparing"
            ? {
                prep_started_at: order?.prep_started_at ?? order?.prepStartedAt ?? timestamp,
                prepStartedAt: order?.prepStartedAt ?? order?.prep_started_at ?? timestamp,
                kitchen_delivered_at: null,
              }
            : null),
          ...(normalizedStatus === "delivered"
            ? {
                kitchen_delivered_at: allDelivered ? timestamp : order?.kitchen_delivered_at ?? null,
              }
            : null),
        };
      });

      return changedAny ? next : prevArr;
    });

    return changedAny;
  };

  const patchTableOrderLocally = ({ status, tableNumber, orderId, patch }) => {
    const nextStatus = String(status || "").toLowerCase();
    const markItemsPaid = (items) => {
      if (!Array.isArray(items)) return [];
      const paidAt = new Date().toISOString();
      return items.map((item) => ({
        ...item,
        paid: true,
        paid_at: item?.paid_at ?? item?.paidAt ?? paidAt,
      }));
    };
    const markSubordersPaid = (suborders) => {
      if (!Array.isArray(suborders)) return [];
      return suborders.map((suborder) => ({
        ...suborder,
        items: markItemsPaid(suborder?.items),
      }));
    };
    const normalizedTableNumber = Number(tableNumber);
    const normalizedTableKey = normalizeTableKey(tableNumber);
    const hasTableNumber = Number.isFinite(normalizedTableNumber);
    const hasTableKey = Boolean(normalizedTableKey);
    const normalizedOrderId = Number(orderId);
    const hasOrderId = Number.isFinite(normalizedOrderId);
    if (!hasTableKey && !hasOrderId) return false;
    let didMutateOrder = false;
    setOrders((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];

      if (LOCAL_REMOVE_ORDER_STATUSES.has(nextStatus)) {
        if (hasTableKey) {
          const next = prevArr.filter(
            (o) =>
              !isSameTableNumber(
                o?.table_number ?? o?.tableNumber ?? o?.table_id ?? o?.tableId ?? o?.table,
                normalizedTableKey
              )
          );
          didMutateOrder = next.length !== prevArr.length;
          next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
          return next;
        }
        const next = prevArr.filter((o) => Number(o?.id) !== normalizedOrderId);
        didMutateOrder = next.length !== prevArr.length;
        next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
        return next;
      }

      const basePatch =
        nextStatus === "paid"
          ? {
              payment_status: "paid",
              is_paid: true,
            }
          : { status: status };

      const next = prevArr.map((o) => {
        const sameTable =
          hasTableKey &&
          isSameTableNumber(
            o?.table_number ?? o?.tableNumber ?? o?.table_id ?? o?.tableId ?? o?.table,
            normalizedTableKey
          );
        const sameOrder = hasOrderId && Number(o?.id) === normalizedOrderId;
        if (!sameTable && !sameOrder) return o;
        didMutateOrder = true;
        const shouldPreserveCheckedInOnPaid =
          nextStatus === "paid" &&
          normalizeOrderStatus(o?.status) === "checked_in" &&
          hasReservationSignal(o);
        const patchObj = patch && typeof patch === "object" ? patch : null;
        const resolvedStatus =
          nextStatus === "paid"
            ? shouldPreserveCheckedInOnPaid
              ? "checked_in"
              : "paid"
            : preserveCheckedInStatus(status, o, patchObj);
        const paidItemsSource =
          nextStatus === "paid"
            ? Array.isArray(patchObj?.items)
              ? patchObj.items
              : o?.items
            : null;
        const paidSubordersSource =
          nextStatus === "paid"
            ? Array.isArray(patchObj?.suborders)
              ? patchObj.suborders
              : o?.suborders
            : null;
        return {
          ...o,
          ...(hasTableNumber
            ? { table_number: normalizedTableNumber }
            : hasTableKey
            ? { table_number: normalizedTableKey }
            : null),
          ...(hasOrderId ? { id: normalizedOrderId } : null),
          ...basePatch,
          ...(patchObj || null),
          ...(resolvedStatus ? { status: resolvedStatus } : null),
          ...(nextStatus === "paid"
            ? {
                payment_status: "paid",
                is_paid: true,
                items: markItemsPaid(paidItemsSource),
                suborders: markSubordersPaid(paidSubordersSource),
              }
            : null),
        };
      });

      next.sort((a, b) => Number(a.table_number) - Number(b.table_number));
      return next;
    });

    return didMutateOrder;
  };

  const onOrderConfirmedSocket = (payload) => {
    if (activeTab !== "tables") return;
    if (import.meta.env.DEV) console.log("[socket] order_confirmed", payload?.order ? "with order" : "raw", payload);
    const order = payload?.order && typeof payload.order === "object" ? payload.order : payload;
    const tableNumber = Number(order?.table_number ?? payload?.table_number);
    const orderId = Number(order?.id ?? payload?.orderId ?? payload?.order_id);
    const total = Number(order?.total);
    const didPatch = patchTableOrderLocally({
      status: "confirmed",
      tableNumber,
      orderId,
      patch: {
        ...(Number.isFinite(total) ? { total } : null),
        ...(order?.order_type ? { order_type: order.order_type } : null),
      },
    });
    if (isTable10(tableNumber)) {
      logTable10("socket:order_confirmed", { tableNumber, orderId, payload });
    }
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    refetch();
  };

  const onPaymentMadeSocket = (payload) => {
    if (activeTab !== "tables") return;
    if (import.meta.env.DEV) console.log("[socket] payment_made", payload?.order ? "with order" : "raw", payload);
    const order = payload?.order && typeof payload.order === "object" ? payload.order : payload;
    const tableNumber = Number(order?.table_number ?? payload?.table_number);
    const orderId = Number(order?.id ?? payload?.orderId ?? payload?.order_id);
    const didPatch = patchTableOrderLocally({
      status: "paid",
      tableNumber,
      orderId,
      patch: { is_paid: true, payment_status: "paid" },
    });
    if (isTable10(tableNumber)) {
      logTable10("socket:payment_made", { tableNumber, orderId, payload });
    }
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    // Fallback when payload shape is unexpected: still force a fast local refresh.
    refetch();
  };

  const onOrderCancelledSocket = (payload) => {
    if (activeTab !== "tables") return;
    if (import.meta.env.DEV) console.log("[socket] order_cancelled", payload?.order ? "with order" : "raw", payload);
    const tableNumber = Number(payload?.table_number ?? payload?.order?.table_number);
    const orderId = Number(payload?.orderId ?? payload?.order_id ?? payload?.order?.id);
    const nextStatus = normalizeOrderStatus(
      payload?.status ?? payload?.order?.status ?? "cancelled"
    );
    const didPatch = patchTableOrderLocally({
      status: nextStatus || "cancelled",
      tableNumber,
      orderId,
      patch: { total: 0 },
    });
    if (isTable10(tableNumber)) {
      logTable10("socket:order_cancelled", { tableNumber, orderId, payload });
    }
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    refetch();
  };

  const onOrderClosedSocket = (payload) => {
    const tableNumber = Number(payload?.table_number ?? payload?.order?.table_number);
    const orderId = Number(payload?.orderId ?? payload?.order_id ?? payload?.order?.id);
    
    // Clean up recently closed tracking since server confirmed the close
    let cleaned = false;
    if (Number.isFinite(orderId)) {
      cleaned = recentlyClosedRef.current.delete(`order_${orderId}`) || cleaned;
    }
    if (Number.isFinite(tableNumber)) {
      cleaned = recentlyClosedRef.current.delete(`table_${tableNumber}`) || cleaned;
    }
    
    if (cleaned) {
      setClosedOrdersVersion(v => v + 1); // Force ordersByTable to recompute
    }
    
    const didPatch = patchTableOrderLocally({
      status: "closed",
      tableNumber,
      orderId,
    });
    if (isTable10(tableNumber)) {
      logTable10("socket:order_closed", { tableNumber, orderId, payload });
    }
    
    if (didPatch) {
      scheduleBackgroundRefetch();
      return;
    }
    refetch();
  };

  const onReservationCheckedOutSocket = (payload) => {
    const tableNumber = Number(
      payload?.table_number ??
        payload?.reservation?.table_number ??
        payload?.order?.table_number
    );
    if (!Number.isFinite(tableNumber)) return;
    const reservationId = Number(
      payload?.reservation_id ??
        payload?.reservationId ??
        payload?.id
    );
    const orderId = Number(
      payload?.order_id ??
        payload?.orderId ??
        payload?.reservation?.order_id ??
        payload?.reservation?.orderId ??
        payload?.order?.id
    );
    if (isTable10(tableNumber)) {
      logTable10("socket:reservation_checked_out", { tableNumber, reservationId, orderId, payload });
    }
    removeReservationShadow({
      reservationId: Number.isFinite(reservationId) ? reservationId : null,
      orderId: Number.isFinite(orderId) ? orderId : null,
      tableNumber,
    });
    removeBookingFromViewBookingLists({ tableNumber, reservationId, orderId });
    setReservationsToday((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((row) => {
        const rowTableNumber = normalizeTableKey(row?.table_number ?? row?.tableNumber ?? row?.table);
        const rowReservationId = Number(row?.id);
        const rowOrderId = Number(row?.order_id ?? row?.orderId);
        if (isSameTableNumber(rowTableNumber, tableNumber)) return false;
        if (Number.isFinite(reservationId) && rowReservationId === reservationId) {
          return false;
        }
        if (Number.isFinite(orderId) && rowOrderId === orderId) {
          return false;
        }
        return true;
      });
    });
    refetch();
  };

  socket.on("orders_updated", refetch);
  // Some backend flows (e.g. closing empty orders) emit `order_closed` without `orders_updated`.
  socket.on("order_closed", onOrderClosedSocket);
  socket.on("order_confirmed", onOrderConfirmedSocket);
  socket.on("payment_made", onPaymentMadeSocket);
  socket.on("order_cancelled", onOrderCancelledSocket);
  socket.on("reservation_checked_out", onReservationCheckedOutSocket);
  socket.on("song_request_updated", fetchSongRequests);
  // ⚡ Immediate local refreshes (dispatched from TransactionScreen)
  const handleLocalRefresh = (event) => {
    const didPatch = applyLocalOrderStatusPatch(event?.detail);
    if (didPatch) {
      // Patch makes the status/color instant; refetch in background to reconcile.
      scheduleBackgroundRefetch();
      return;
    }
    const didPatchKitchenStatus = applyLocalKitchenStatusPatch(event?.detail);
    if (didPatchKitchenStatus) {
      scheduleBackgroundRefetch();
      return;
    }
    instantRefetch({ fastTablesOnly: true });
    if (activeTab === "tables") {
      scheduleBackgroundRefetch();
    }
  };
  window.addEventListener("beypro:orders-local-refresh", handleLocalRefresh);
  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (bgRefetchTimeoutId) window.clearTimeout(bgRefetchTimeoutId);
    if (bgRefetchIdleId && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(bgRefetchIdleId);
    }
    socket.off("orders_updated", refetch);
    socket.off("order_closed", onOrderClosedSocket);
    socket.off("order_confirmed", onOrderConfirmedSocket);
    socket.off("payment_made", onPaymentMadeSocket);
    socket.off("order_cancelled", onOrderCancelledSocket);
    socket.off("reservation_checked_out", onReservationCheckedOutSocket);
    socket.off("song_request_updated", fetchSongRequests);
    window.removeEventListener("beypro:orders-local-refresh", handleLocalRefresh);
  };
}, [
  activeTab,
  effectiveReservationsToday,
  fetchSongRequests,
  loadConcertBookingsForOverview,
  loadDataForTab,
  loadReservationBookingsForOverview,
  fetchOrders,
  fetchPacketOrdersCount,
  isStressModeActive,
  removeBookingFromViewBookingLists,
]);

useEffect(() => {
  if (isStressModeActive) return;
  if (activeTab !== "tables") {
    loadDataForTab(activeTab);
    return;
  }

  loadDataForTab(activeTab, { fastTablesOnly: true });

  const timeoutId = window.setTimeout(() => {
    fetchOrders();
  }, 180);

  return () => window.clearTimeout(timeoutId);
}, [activeTab, loadDataForTab, isStressModeActive, fetchOrders]);

useEffect(() => {
  const handler = () => fetchKitchenOpenOrders();
  if (window && typeof window.addEventListener === "function") {
    window.addEventListener("beypro:kitchen-orders-reload", handler);
  }
  return () => {
    if (window && typeof window.removeEventListener === "function") {
      window.removeEventListener("beypro:kitchen-orders-reload", handler);
    }
  };
}, [fetchKitchenOpenOrders]);

  // Ensure table configs load when Tables tab is active
  useEffect(() => {
    if (isStressModeActive) return;
    if (activeTab === "tables" && (Array.isArray(tableConfigs) ? tableConfigs.length === 0 : true)) {
      fetchTableConfigs();
    }
  }, [activeTab, tableConfigs.length, fetchTableConfigs, isStressModeActive]);


const ordersByTable = React.useMemo(
  () =>
    withPerfTimer("[perf] TableList ordersByTable selector", () => {
      const map = new Map();
      (effectiveOrdersByTableRaw instanceof Map ? effectiveOrdersByTableRaw : new Map()).forEach(
        (tableOrders, tableKey) => {
          const tableNumber = Number(tableKey);
          if (!Number.isFinite(tableNumber) || map.has(tableNumber)) return;
          
          // Filter out recently closed orders
          if (recentlyClosedRef.current.has(`table_${tableNumber}`)) return;
          
          const ordersForTable = Array.isArray(tableOrders) ? tableOrders : [];
          const visibleOrders = ordersForTable.filter((order) => {
            // Filter out recently closed orders by ID
            const orderId = Number(order?.id);
            if (Number.isFinite(orderId) && recentlyClosedRef.current.has(`order_${orderId}`)) {
              return false;
            }
            const status = normalizeOrderStatus(order?.status);
            if (
              status === "closed" ||
              status === "completed" ||
              status === "deleted" ||
              status === "void"
            ) {
              return false;
            }
            return !isOrderCancelledOrCanceled(status) && !isEffectivelyFreeOrder(order);
          });
          if (visibleOrders.length === 0) return;
          map.set(tableNumber, visibleOrders[0]);
        }
      );
      return map;
    }),
  [effectiveOrdersByTableRaw, closedOrdersVersion]
);

const reservationsForModel = React.useMemo(() => {
  const byTable = new Map();
  const getReservationPriority = (status) => {
    const normalized = normalizeOrderStatus(status);
    if (normalized === "checked_in") return 3;
    if (normalized === "confirmed") return 2;
    if (normalized === "reserved") return 1;
    return 0;
  };
  const pendingConcertPaymentStatuses = new Set([
    "pending",
    "pending_bank_transfer",
    "awaiting_confirm",
    "awaiting_confirmation",
    "pending_confirmation",
    "unconfirmed",
    "unpaid",
  ]);

  (Array.isArray(effectiveReservationsToday) ? effectiveReservationsToday : []).forEach((reservation) => {
    if (!isReservationRelevantForTableState(reservation)) return;

    const tableNumber = Number(
      reservation?.table_number ?? reservation?.tableNumber ?? reservation?.table
    );
    if (!Number.isFinite(tableNumber)) return;
    byTable.set(normalizeTableKey(tableNumber), reservation);
  });

  (Array.isArray(concertBookings) ? concertBookings : []).forEach((booking) => {
    if (!isConcertBookingRelevantForTableState(booking)) return;

    const tableNumber = Number(
      booking?.reserved_table_number ?? booking?.reservedTableNumber ?? booking?.table_number ?? booking?.tableNumber
    );
    if (!Number.isFinite(tableNumber)) return;

    const paymentStatus = normalizeOrderStatus(
      booking?.payment_status ?? booking?.paymentStatus ?? booking?.concert_booking_payment_status ?? booking?.concertBookingPaymentStatus
    );
    const bookingStatus = normalizeOrderStatus(
      booking?.booking_status ?? booking?.bookingStatus ?? booking?.status
    );
    const reservationOrderStatus = normalizeOrderStatus(
      booking?.reservation_order_status ?? booking?.reservationOrderStatus
    );
    const isCheckedIn = reservationOrderStatus === "checked_in";
    const isBookingConfirmed = bookingStatus === "confirmed";
    const isPaymentConfirmed = paymentStatus === "confirmed";
    const isPendingPayment = pendingConcertPaymentStatuses.has(paymentStatus);
    const isReservedLikeLifecycle =
      reservationOrderStatus === "reserved" || reservationOrderStatus === "confirmed";

    if (!isCheckedIn && !isBookingConfirmed && !isPaymentConfirmed && !isReservedLikeLifecycle) {
      return;
    }
    // Do not mark the table reserved before the concert booking is confirmed.
    // Pending bank transfer/awaiting confirmation must stay free in floor plan.
    if (!isCheckedIn && isPendingPayment && !isBookingConfirmed && !isPaymentConfirmed) {
      return;
    }

    const synthesizedStatus =
      reservationOrderStatus ||
      (paymentStatus === "confirmed" ? "confirmed" : "") ||
      (bookingStatus === "confirmed" ? "confirmed" : "") ||
      bookingStatus ||
      paymentStatus ||
      "reserved";

    const synthesized = {
      id: booking?.id ?? booking?.booking_id ?? null,
      order_id:
        booking?.reservation_order_id ?? booking?.reservationOrderId ?? booking?.order_id ?? booking?.orderId ?? null,
      table_number: tableNumber,
      status: synthesizedStatus,
      order_type: booking?.order_type ?? "reservation",
      customer_name: booking?.customer_name ?? booking?.customerName ?? "",
      customer_phone: booking?.customer_phone ?? booking?.customerPhone ?? "",
      reservation_date:
        booking?.reservation_date ?? booking?.reservationDate ?? booking?.event_date ?? booking?.eventDate ?? null,
      reservation_time:
        booking?.reservation_time ?? booking?.reservationTime ?? booking?.event_time ?? booking?.eventTime ?? null,
      reservation_clients:
        booking?.reservation_clients ?? booking?.reservationClients ?? booking?.guests_count ?? booking?.guestsCount ?? 0,
      reservation_notes:
        booking?.reservation_notes ?? booking?.reservationNotes ?? booking?.event_title ?? booking?.artist_name ?? "",
      concert_booking_id: booking?.id ?? booking?.booking_id ?? null,
      concert_booking_payment_status:
        booking?.payment_status ?? booking?.paymentStatus ?? booking?.concert_booking_payment_status ?? booking?.concertBookingPaymentStatus ?? null,
      booking_status: booking?.booking_status ?? booking?.bookingStatus ?? booking?.status ?? null,
    };

    const existing = byTable.get(normalizeTableKey(tableNumber));
    if (!existing || getReservationPriority(synthesized.status) >= getReservationPriority(existing?.status)) {
      byTable.set(normalizeTableKey(tableNumber), { ...(existing || {}), ...synthesized });
    }
  });

  (effectiveOrdersByTableRaw instanceof Map ? effectiveOrdersByTableRaw : new Map()).forEach(
    (tableOrders, tableKey) => {
      const tableNumber = Number(tableKey);
      if (!Number.isFinite(tableNumber)) return;

      const ordersForTable = Array.isArray(tableOrders) ? tableOrders : [];
      const reservationOrder = ordersForTable.find((order) => {
        const status = normalizeOrderStatus(order?.status);
        if (
          status === "closed" ||
          status === "completed" ||
          status === "deleted" ||
          status === "void" ||
          status === "cancelled" ||
          status === "canceled"
        ) {
          return false;
        }
        if (!hasReservationSignal(order)) return false;
        return status === "reserved" || status === "checked_in" || order?.order_type === "reservation";
      });
      if (!reservationOrder) return;

      const synthesized = {
        id: reservationOrder?.reservation?.id ?? null,
        order_id: reservationOrder?.id ?? null,
        table_number: tableNumber,
        status: normalizeOrderStatus(reservationOrder?.status) || "reserved",
        order_type: reservationOrder?.order_type || "reservation",
        customer_name:
          reservationOrder?.customer_name ??
          reservationOrder?.customerName ??
          reservationOrder?.reservation?.customer_name ??
          reservationOrder?.reservation?.customerName ??
          "",
        customer_phone:
          reservationOrder?.customer_phone ??
          reservationOrder?.customerPhone ??
          reservationOrder?.reservation?.customer_phone ??
          reservationOrder?.reservation?.customerPhone ??
          "",
        reservation_date:
          reservationOrder?.reservation_date ??
          reservationOrder?.reservationDate ??
          reservationOrder?.reservation?.reservation_date ??
          reservationOrder?.reservation?.reservationDate ??
          null,
        reservation_time:
          reservationOrder?.reservation_time ??
          reservationOrder?.reservationTime ??
          reservationOrder?.reservation?.reservation_time ??
          reservationOrder?.reservation?.reservationTime ??
          null,
        reservation_clients:
          reservationOrder?.reservation_clients ??
          reservationOrder?.reservationClients ??
          reservationOrder?.reservation?.reservation_clients ??
          reservationOrder?.reservation?.reservationClients ??
          0,
        reservation_notes:
          reservationOrder?.reservation_notes ??
          reservationOrder?.reservationNotes ??
          reservationOrder?.reservation?.reservation_notes ??
          reservationOrder?.reservation?.reservationNotes ??
          "",
      };

      const existing = byTable.get(normalizeTableKey(tableNumber));
      if (!existing) {
        byTable.set(normalizeTableKey(tableNumber), synthesized);
        return;
      }

      byTable.set(normalizeTableKey(tableNumber), {
        ...existing,
        table_number: existing?.table_number ?? existing?.tableNumber ?? tableNumber,
        status: normalizeOrderStatus(existing?.status) || synthesized.status,
        order_type: existing?.order_type || synthesized.order_type,
        reservation_date:
          existing?.reservation_date ?? existing?.reservationDate ?? synthesized.reservation_date,
        reservation_time:
          existing?.reservation_time ?? existing?.reservationTime ?? synthesized.reservation_time,
        reservation_clients:
          existing?.reservation_clients ??
          existing?.reservationClients ??
          synthesized.reservation_clients,
        reservation_notes:
          existing?.reservation_notes ?? existing?.reservationNotes ?? synthesized.reservation_notes,
        customer_name: existing?.customer_name ?? existing?.customerName ?? synthesized.customer_name,
        customer_phone:
          existing?.customer_phone ?? existing?.customerPhone ?? synthesized.customer_phone,
      });
    }
  );

  const derived = Array.from(byTable.values());
  if (import.meta.env.DEV) {
    const table10Rows = derived.filter((row) =>
      isTable10(row?.table_number ?? row?.tableNumber ?? row?.table)
    );
    if (table10Rows.length > 0) {
      logTable10("selector:reservationsForModel", table10Rows);
    }
  }
  return derived;
}, [concertBookings, effectiveOrdersByTableRaw, effectiveReservationsToday]);

useEffect(() => {
  if (!import.meta.env.DEV) return;
  const table10Orders =
    effectiveOrdersByTableRaw instanceof Map
      ? effectiveOrdersByTableRaw.get(10) || effectiveOrdersByTableRaw.get("10")
      : null;
  const table10Reservations = (Array.isArray(reservationsForModel) ? reservationsForModel : []).filter(
    (row) => isTable10(row?.table_number ?? row?.tableNumber ?? row?.table)
  );
  logTable10("derived:tableoverview", {
    ordersByTableRaw: table10Orders,
    reservationsForModel: table10Reservations,
  });
}, [effectiveOrdersByTableRaw, reservationsForModel]);

const { tables } = useTablesModel({
  tableConfigs: effectiveTableConfigs,
  ordersByTable,
  reservationsToday: reservationsForModel,
});
const filteredTablesByNumberSearch = React.useMemo(() => {
  const allTables = Array.isArray(tables) ? tables : [];
  const normalizedNeedle = String(tableNumberFilterFromUrl || "").trim();
  if (!normalizedNeedle) return allTables;
  const queryNumber = Number.parseInt(normalizedNeedle, 10);
  if (!Number.isFinite(queryNumber)) return allTables;
  return allTables.filter((table) => Number.parseInt(String(table?.tableNumber ?? ""), 10) === queryNumber);
}, [tableNumberFilterFromUrl, tables]);
const filteredGroupedTablesByNumberSearch = React.useMemo(() => {
  const grouped = {};
  (Array.isArray(filteredTablesByNumberSearch) ? filteredTablesByNumberSearch : []).forEach(
    (table) => {
      const area = table?.area || "Main Hall";
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(table);
    }
  );
  return grouped;
}, [filteredTablesByNumberSearch]);

const freeTablesCount = React.useMemo(() => {
  if (!Array.isArray(tables)) return 0;
  return tables.filter((table) => !table?.isLocked && isEffectivelyFreeOrder(table.order)).length;
}, [tables]);
const blockedConcertTableNumbers = React.useMemo(() => {
  const blocked = new Set();
  const bookings = Array.isArray(concertBookings) ? concertBookings : [];
  bookings.forEach((booking) => {
    if (!isConcertBookingRelevantForTableState(booking)) return;

    const paymentStatus = String(
      booking?.payment_status ?? booking?.paymentStatus ?? ""
    )
      .trim()
      .toLowerCase();
    const reservationOrderStatus = normalizeOrderStatus(
      booking?.reservation_order_status ?? booking?.reservationOrderStatus ?? ""
    );
    const isCancelled =
      paymentStatus === "cancelled" ||
      paymentStatus === "canceled" ||
      reservationOrderStatus === "cancelled" ||
      reservationOrderStatus === "canceled";
    if (isCancelled) return;

    const isTicketConfirmed = paymentStatus === "confirmed";
    const isCheckedIn = reservationOrderStatus === "checked_in";
    if (isTicketConfirmed || isCheckedIn) return;

    const tableNumber = Number(
      booking?.reserved_table_number ?? booking?.reservedTableNumber
    );
    if (Number.isFinite(tableNumber) && tableNumber > 0) {
      blocked.add(tableNumber);
    }
  });
  return blocked;
}, [concertBookings]);

const handleTableDensityChange = useCallback(
  (nextDensity) => {
    const normalized = normalizeTableDensity(nextDensity);
    if (typeof saveAppearance === "function") {
      void saveAppearance({ table_density: normalized }, { merge: true, silent: true });
      return;
    }
    setAppearance((prev) => ({
      ...(prev || {}),
      table_density: normalized,
    }));
  },
  [saveAppearance, setAppearance]
);

useEffect(() => {
  const titlesByTab = {
    takeaway: t("Tickets/Orders"),
    tables: t("Tables"),
    kitchen: t("All Orders"),
    history: t("History"),
    packet: t("Packet"),
    phone: t("Phone"),
    register: t("Register"),
  };
  const headerTitle = isDedicatedViewBookingPage ? t("View Booking") : titlesByTab[activeTab] || t("Orders");
  const showDensityQuickToggle = activeTab === "tables" && !isDedicatedViewBookingPage;
  setHeader((prev) => ({
    ...prev,
    title: headerTitle,
    subtitle: undefined,
    tableNav: showDensityQuickToggle ? (
      <TableDensityToggle
        value={tableDensity}
        onChange={handleTableDensityChange}
        t={t}
        size="sm"
      />
    ) : null,
    tableStats:
      activeTab === "tables" && !isDedicatedViewBookingPage ? { freeTables: freeTablesCount } : undefined,
  }));
}, [
  activeTab,
  freeTablesCount,
  handleTableDensityChange,
  isDedicatedViewBookingPage,
  setHeader,
  t,
  tableDensity,
]);



const handlePrintOrder = useCallback(async (orderId) => {
  if (!orderId) {
    toast.warn(t("No order selected to print"));
    return;
  }
  try {
    const printable = await fetchOrderWithItems(orderId);
    const ok = await printViaBridge("", printable);
    toast[ok ? "success" : "warn"](
      ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
    );
  } catch (err) {
    console.error("❌ Print failed:", err);
    toast.error(t("Failed to print receipt"));
  }
}, [t]);


const navigateToOrder = useCallback((order) => {
  if (!order) return;
  const tableNumber =
    order.table_number ?? order.tableNumber ?? order?.table_number;
  if (tableNumber !== null && tableNumber !== undefined && tableNumber !== "") {
    navigate(`/transaction/${tableNumber}`, { state: { order } });
    return;
  }
  navigate(`/transaction/phone/${order.id}`, { state: { order } });
}, [navigate]);

const handleTableClick = useCallback(async (table) => {
  // Keep register guard behavior in TableOverview while register internals live in feature module.
  try {
    const open = await checkRegisterOpen();
    if (!open) {
      toast.error("Register must be open to access tables!", {
        position: "top-center",
        autoClose: 2500,
      });
      setShowRegisterModal(true);
      return;
    }
  } catch {
    // Fail-open here and let TransactionScreen/useRegisterGuard enforce access.
  }
  const tableNumber = Number(table?.tableNumber);
  if (Number.isFinite(tableNumber) && blockedConcertTableNumbers.has(tableNumber)) {
    toast.warning(
      t("Concert ticket is not confirmed yet. Please confirm booking and check in guest before opening this table.")
    );
    return;
  }
  if (table?.isLocked) {
    toast.warning(t("This table is currently occupied. Please unlock it first."));
    return;
  }

  const requireGuests = transactionSettings.requireGuestsBeforeOpen ?? true;
  const seatLimit = Number.isFinite(Number(table.seats)) ? Number(table.seats) : 0;
  const tableGuestsRaw =
    table?.guests === null || table?.guests === undefined ? null : Number(table.guests);
  const resolvedGuests = Number.isFinite(tableGuestsRaw) && tableGuestsRaw > 0 ? tableGuestsRaw : null;
  const guestSelection =
    Number.isFinite(resolvedGuests) && seatLimit > 0
      ? Math.min(Math.max(0, Math.trunc(resolvedGuests)), Math.trunc(seatLimit))
      : resolvedGuests;
  if (requireGuests && seatLimit > 0 && (!guestSelection || guestSelection <= 0)) {
    toast.warning(t("Please select number of seats before opening this table"), {
      style: { background: "#312E81", color: "#F8FAFC" },
    });
    return;
  }

  // 🔥 FIXED: treat cancelled or empty orders as FREE
  const isCancelledOrder = isOrderCancelledOrCanceled(table.order?.status);
  const isEffectivelyFreeTableOrder = isEffectivelyFreeOrder(table.order);
  const reservationFallback = table?.reservationFallback;
  const normalizedOpenStatus = normalizeOrderStatus(table.order?.status);
  const isClosedOrPaidNoUnpaid =
    (normalizedOpenStatus === "closed" || normalizedOpenStatus === "paid") &&
    !table?.hasUnpaidItems;
  const isClosedReservationCarryover =
    Boolean(reservationFallback) &&
    Boolean(table?.order) &&
    !table?.hasUnpaidItems &&
    normalizedOpenStatus === "closed";
  const hasExistingOrderId =
    table?.order?.id !== null &&
    table?.order?.id !== undefined &&
    String(table.order.id).trim() !== "";
  const reservationStatePatch =
    reservationFallback && typeof reservationFallback === "object"
      ? {
          reservation_id: reservationFallback.id ?? null,
          reservationId: reservationFallback.id ?? null,
          reservation_date:
            reservationFallback.reservation_date ?? reservationFallback.reservationDate ?? null,
          reservationDate:
            reservationFallback.reservationDate ?? reservationFallback.reservation_date ?? null,
          reservation_time:
            reservationFallback.reservation_time ?? reservationFallback.reservationTime ?? null,
          reservationTime:
            reservationFallback.reservationTime ?? reservationFallback.reservation_time ?? null,
          reservation_clients:
            reservationFallback.reservation_clients ?? reservationFallback.reservationClients ?? 0,
          reservationClients:
            reservationFallback.reservationClients ?? reservationFallback.reservation_clients ?? 0,
          reservation_notes:
            reservationFallback.reservation_notes ?? reservationFallback.reservationNotes ?? "",
          reservationNotes:
            reservationFallback.reservationNotes ?? reservationFallback.reservation_notes ?? "",
          customer_name: reservationFallback.customer_name ?? reservationFallback.customerName ?? "",
          customer_phone:
            reservationFallback.customer_phone ?? reservationFallback.customerPhone ?? "",
          reservation: {
            id: reservationFallback.id ?? null,
            reservation_date:
              reservationFallback.reservation_date ?? reservationFallback.reservationDate ?? null,
            reservation_time:
              reservationFallback.reservation_time ?? reservationFallback.reservationTime ?? null,
            reservation_clients:
              reservationFallback.reservation_clients ?? reservationFallback.reservationClients ?? 0,
            reservation_notes:
              reservationFallback.reservation_notes ?? reservationFallback.reservationNotes ?? "",
            customer_name:
              reservationFallback.customer_name ?? reservationFallback.customerName ?? "",
            customer_phone:
              reservationFallback.customer_phone ?? reservationFallback.customerPhone ?? "",
          },
        }
      : null;

  if (
    !table.order ||
    isCancelledOrder ||
    isEffectivelyFreeTableOrder ||
    isClosedReservationCarryover ||
    isClosedOrPaidNoUnpaid
  ) {
    // Navigate immediately with a stub order, then TransactionScreen will create/fetch in background.
    navigate(`/transaction/${table.tableNumber}`, {
      state: {
        order: {
          table_number: table.tableNumber,
          order_type: "table",
          status: "draft",
          total: 0,
          items: [],
          ...(reservationStatePatch || null),
        },
      },
    });
    return;
  }

  // If we already have a persisted order id, pass it immediately even while items hydrate.
  // This lets TransactionScreen show invoice/order number without waiting for table re-fetch.
  if (hasExistingOrderId) {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
    return;
  }

  if (Array.isArray(table.order.items) && table.order.items.length > 0) {
    navigate(`/transaction/${table.tableNumber}`, { state: { order: table.order } });
    return;
  }

  navigate(`/transaction/${table.tableNumber}`, {
    state: {
      order: {
        table_number: table.tableNumber,
        order_type: "table",
        status: "draft",
        total: 0,
        items: [],
        ...(reservationStatePatch || null),
      },
    },
  });
}, [blockedConcertTableNumbers, transactionSettings.requireGuestsBeforeOpen, t, navigate]);

  // Remove duplicate groupedByTable (already have ordersByTable memoized above)
  // const groupedByTable = orders.reduce(...) // ❌ REMOVED DUPLICATE

const areaKeys = React.useMemo(
  () => Object.keys(filteredGroupedTablesByNumberSearch),
  [filteredGroupedTablesByNumberSearch]
);
const showStandardAreaTabs =
  !isDedicatedViewBookingPage &&
  canSeeTablesGrid &&
  tableSettings.showAreas !== false &&
  areaKeys.length > 0;
const showAreaTabs = isDedicatedViewBookingPage
  ? canSeeViewBookingTab
  : showStandardAreaTabs || canSeeViewBookingTab || canSeeSongRequestTab;

const formatAreaLabel = useCallback((area) => {
  const raw = area || "Main Hall";
  return t(raw, { defaultValue: raw });
}, [t]);
const tableLabelText = String(tableSettings.tableLabelText || "").trim() || t("Table");

const handlePrintOrderRef = useRef(handlePrintOrder);
const handleCloseTableRef = useRef(handleCloseTable);

useEffect(() => {
  handlePrintOrderRef.current = handlePrintOrder;
}, [handlePrintOrder]);

useEffect(() => {
  handleCloseTableRef.current = handleCloseTable;
}, [handleCloseTable]);

const stableHandlePrintOrder = useCallback((...args) => {
  return handlePrintOrderRef.current?.(...args);
}, []);

const stableHandleCloseTable = useCallback((...args) => {
  return handleCloseTableRef.current?.(...args);
}, []);

const handleAcknowledgeWaiterCall = useCallback(
  (tableNumber) => {
    acknowledgeCustomerCall?.(tableNumber);
  },
  [acknowledgeCustomerCall]
);

const handleResolveWaiterCall = useCallback(
  (tableNumber) => {
    resolveCustomerCall?.(tableNumber);
  },
  [resolveCustomerCall]
);

const handleOpenViewBooking = useCallback(() => {
  handleAreaSelect(AREA_FILTER_VIEW_BOOKING);
}, [handleAreaSelect]);

const tableCardProps = React.useMemo(
  () => ({
    tableLabelText,
    showAreas: canSeeTablesGrid && tableSettings.showAreas !== false,
    formatAreaLabel,
    t,
    formatCurrency,
    handleTableClick,
    handleToggleTableLock,
    handlePrintOrder: stableHandlePrintOrder,
    handleGuestsChange,
    handleCloseTable: stableHandleCloseTable,
    handleCheckinReservation,
    handleOpenViewBooking,
    waiterCallsByTable: customerCalls || {},
    handleAcknowledgeWaiterCall,
    handleResolveWaiterCall,
    showManualTableLock: transactionSettings.enableManualTableLock !== false,
    showGuestCount: (transactionSettings.requireGuestsBeforeOpen ?? true) === true,
  }),
  [
    tableLabelText,
    canSeeTablesGrid,
    tableSettings.showAreas,
    formatAreaLabel,
    t,
    formatCurrency,
    handleTableClick,
    handleToggleTableLock,
    handleGuestsChange,
    stableHandlePrintOrder,
    stableHandleCloseTable,
    handleCheckinReservation,
    handleOpenViewBooking,
    customerCalls,
    handleAcknowledgeWaiterCall,
    handleResolveWaiterCall,
    transactionSettings.enableManualTableLock,
    transactionSettings.requireGuestsBeforeOpen,
  ]
);

const totalSeats = React.useMemo(() => {
  return (Array.isArray(tables) ? tables : []).reduce((sum, table) => {
    const seats = Number(table?.seats);
    if (!Number.isFinite(seats) || seats <= 0) return sum;
    return sum + Math.trunc(seats);
  }, 0);
}, [tables]);

const totalGuests = React.useMemo(() => {
  return (Array.isArray(tables) ? tables : []).reduce((sum, table) => {
    const seats = Number(table?.seats);
    if (!Number.isFinite(seats) || seats <= 0) return sum;
    const guests = Number.isFinite(table?.guests) ? Math.trunc(Number(table.guests)) : 0;
    const clamped = Math.min(Math.max(0, guests), Math.trunc(seats));
    return sum + clamped;
  }, 0);
}, [tables]);

const kitchenReadyAtByOrderId = React.useMemo(() => {
  const map = new Map();
  (Array.isArray(kitchenOpenOrders) ? kitchenOpenOrders : []).forEach((order) => {
    map.set(order.id, getReadyAtLabel(order, productPrepById));
  });
  return map;
}, [kitchenOpenOrders, productPrepById]);

  return (
    <div className="min-h-screen bg-transparent px-0 pt-4 relative">
      {PERF_DEBUG_ENABLED && (
        <div className="fixed top-24 right-4 z-50 flex flex-col items-end gap-2">
          <RenderCounter label="TableOverview" value={tableOverviewRenderCount} />
          {activeTab === "tables" && (
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={isStressModeActive ? handleUnloadStressData : handleLoadStressData}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
              >
                {isStressModeActive ? "Use Live Data" : "Load Stress Data"}
              </button>
              {isStressModeActive && (
                <>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("status-change")}
                    className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Mutate Status
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("color-change")}
                    className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Mutate Color
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStressMutation("move-status")}
                    className="rounded-full bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                  >
                    Move Status
                  </button>
                </>
              )}
            </div>
          )}
          {isStressModeActive && (
            <div className="rounded-md bg-slate-800/90 px-2 py-1 text-[10px] font-semibold text-white">
              {stressDataset?.stats?.tables || 0} tables / {stressDataset?.stats?.openOrders || 0} orders /{" "}
              {stressDataset?.stats?.items || 0} items
            </div>
          )}
        </div>
      )}
      {canSeePacketTab &&
        activeTab !== "packet" &&
        packetOrdersCount > 0 &&
        !transactionSettings.disableTableOverviewOrdersFloatingButton && (
        <button
          type="button"
          onClick={() => handleTabSelect("packet")}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-white shadow-2xl ring-1 ring-white/20 hover:brightness-110 active:scale-[0.98] transition"
          aria-label={t("Packet")}
        >
          <span className="font-semibold">{t("Packet")}</span>
          <span className="min-w-7 px-2 py-0.5 rounded-full bg-white/20 font-extrabold text-sm text-white text-center">
            {packetOrdersCount}
          </span>
	        </button>
	      )}

      {activeTab === "tables" &&
        canSeeTablesGrid &&
        !transactionSettings.disableTableOverviewGuestsFloatingButton && (
        <div className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-3 text-white shadow-2xl ring-1 ring-white/20">
          <span className="font-semibold">{t("Guests")}</span>
          <span className="min-w-7 px-2 py-0.5 rounded-full bg-white/20 font-extrabold text-sm text-white text-center">
            {totalSeats > 0 ? `${totalGuests}/${totalSeats}` : totalGuests}
          </span>
        </div>
      )}
  {activeTab === "tables" && (
    <TablesView
      showAreaTabs={showAreaTabs}
      showStandardAreaTabs={showStandardAreaTabs}
      activeArea={activeArea}
      setActiveArea={handleAreaSelect}
      tables={filteredTablesByNumberSearch}
      groupedTables={filteredGroupedTablesByNumberSearch}
      ordersByTable={effectiveOrdersByTableRaw}
      productPrepById={effectiveProductPrepById}
      formatAreaLabel={formatAreaLabel}
      t={t}
      cardProps={tableCardProps}
      showViewBookingTab={canSeeViewBookingTab}
      concertBookings={visibleConcertBookingsOverview}
      reservationBookings={visibleReservationBookingsOverview}
      concertBookingsLoading={concertBookingsLoading || reservationBookingsLoading}
      concertBookingUpdatingId={concertBookingUpdatingId}
      reservationBookingUpdatingKey={reservationBookingUpdatingKey}
      onConcertBookingUpdateStatus={updateConcertBookingStatusFromOverview}
      onReservationBookingUpdateStatus={updateReservationBookingStatusFromOverview}
      onClearBookings={handleClearOldFulfilledBookings}
      clearingBookings={clearingBookings}
      showSongRequestTab={canSeeSongRequestTab}
      songRequests={songRequests}
      songRequestsLoading={songRequestsLoading}
      songRequestUpdatingId={songRequestUpdatingId}
      onApproveSongRequest={(request) => updateSongRequestStatus(request, "approved")}
      onCompleteSongRequest={(request) => updateSongRequestStatus(request, "completed")}
      onCancelSongRequest={(request) => updateSongRequestStatus(request, "cancelled")}
      tableDensity={tableDensity}
    />
  )}



{activeTab === "takeaway" && (
  <div className="px-6 py-4">

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* ➕ New Takeaway Card */}
      <button
        onClick={async () => {
          try {
            const newOrder = await secureFetch("/orders", {
              method: "POST",
              body: JSON.stringify({
                order_type: "takeaway",
                total: 0,
                items: [],
              }),
            });
            navigate(`/transaction/phone/${newOrder.id}`, { state: { order: newOrder } });
          } catch (err) {
            console.error("❌ Failed to create takeaway order:", err);
            toast.error("Could not create new takeaway order");
          }
        }}
        className="border-2 border-dashed border-orange-400 rounded-3xl p-8 flex flex-col items-center justify-center text-orange-500 hover:bg-orange-50 transition"
      >
        <span className="text-5xl mb-2">➕</span>
        <span className="font-semibold text-lg">{t("New Pre-Orders")}</span>
      </button>

      {/* Existing Takeaway Orders */}
      {takeawayOrders.map((order) => {
        const normalizedOrderStatus = normalizeOrderStatus(order?.status);
        const isCheckedInOrder = normalizedOrderStatus === "checked_in";
        const concertBookingType = String(
          order?.concert_booking_type ?? order?.concertBookingType ?? ""
        )
          .trim()
          .toLowerCase();
        const concertBookingPaymentStatus = String(
          order?.concert_booking_payment_status ?? order?.concertBookingPaymentStatus ?? ""
        )
          .trim()
          .toLowerCase();
        const concertBookingStatus = String(
          order?.concert_booking_status ?? order?.concertBookingStatus ?? ""
        )
          .trim()
          .toLowerCase();
        const concertBookingId = Number(
          order?.concert_booking_id ?? order?.concertBookingId ?? 0
        );
        const hasConcertBookingContext = Boolean(
          (Number.isFinite(concertBookingId) && concertBookingId > 0) ||
            concertBookingType ||
            concertBookingPaymentStatus ||
            concertBookingStatus
        );
        const hasTicketConcertItem =
          Array.isArray(order?.items) &&
          order.items.some((item) => {
            const itemName = String(
              item?.order_item_name ?? item?.product_name ?? item?.name ?? ""
            )
              .trim()
              .toLowerCase();
            return itemName === "ticket concert";
          });
        const isConcertTicketPreOrder =
          hasConcertBookingContext &&
          (concertBookingType === "ticket" ||
            (concertBookingType !== "table" && hasTicketConcertItem));
        const isConcertBookingConfirmed =
          concertBookingPaymentStatus === "confirmed" ||
          concertBookingStatus === "confirmed";
        const checkInPending = takeawayCheckInSubmittingId === Number(order?.id);

        return (
        <div
          key={order.id}
          onClick={() => navigate(`/transaction/phone/${order.id}`, { state: { order } })}
          className="cursor-pointer rounded-3xl bg-white/80 p-5 shadow-lg hover:shadow-xl transition hover:scale-[1.03]"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-lg font-semibold text-orange-700">#{order.id}</span>
            <span className="text-sm text-gray-500">
              {new Date(order.created_at).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="font-bold text-gray-800">
            {formatCurrency(getDisplayTotal(order))}
          </div>
          <div className="text-sm text-gray-500">
            {order.customer_name || t("Guest")}
          </div>

          {/* Pre-order scheduling info */}
          {order.pickup_time && (
            <div className="mt-1 text-xs text-orange-700">
              🕒 {t("Pickup")}: {order.pickup_time}
            </div>
          )}
          {order.customer_address && (
            <div className="mt-0.5 text-xs text-emerald-700">
              🚚 {t("Delivery")}: {order.customer_address}
            </div>
          )}

          {/* Status + Kitchen badges (like tables) */}
          <div className="mt-2">
            {/* Order status label */}
            {order?.status && (
              <div className="flex items-center gap-2">
                <span className="uppercase font-extrabold tracking-wide text-orange-700">
                  {t(order.status)}
                </span>
                {/* Paid / Unpaid chip */}
                {Array.isArray(order.items) && order.items.length > 0 && (
                  hasUnpaidAnywhere(order) ? (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full text-xs shadow-sm">
                      {t("Unpaid")}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-100 text-green-800 font-bold rounded-full text-xs shadow-sm">
                      ✅ {t("Paid")}
                    </span>
                  )
                )}
              </div>
            )}

            {/* Kitchen status badges */}
            {Array.isArray(order.items) && order.items.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {["new", "preparing", "ready", "delivered"].map((status) => {
                  const count = order.items.filter((item) => item.kitchen_status === status).length;
                  if (!count) return null;
                  return (
                    <span
                      key={status}
	                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
	                        status === "preparing"
	                          ? "bg-yellow-400 text-indigo-700"
	                          : status === "ready"
	                          ? "bg-blue-500 text-white"
	                          : status === "delivered"
	                          ? "bg-green-500 text-white"
                          : status === "new"
                          ? "bg-gray-400 text-white"
                          : "bg-gray-300 text-black"
                      }`}
                    >
                      {count} {t(status)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {isConcertTicketPreOrder ? (
            <div className="mt-3 flex items-center gap-2">
              {isCheckedInOrder ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold border bg-emerald-100 text-emerald-800 border-emerald-200">
                  ✅ {t("Guest checked in")}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleTakeawayConcertTicketCheckIn(order);
                  }}
                  disabled={checkInPending}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    isConcertBookingConfirmed
                      ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                  } ${checkInPending ? "cursor-not-allowed opacity-60" : ""}`}
                  title={
                    isConcertBookingConfirmed
                      ? t("Check In")
                      : t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
                  }
                >
                  {checkInPending ? t("Loading...") : t("Check In")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      )})}
    </div>
  </div>
)}




    {/* --- Modal --- */}
    {showPhoneOrderModal && (
      <PhoneOrderModal
        open={showPhoneOrderModal}
        onClose={() => {
          setShowPhoneOrderModal(false);
          handleTabSelect("packet");
        }}
	onCreateOrder={() => {
	  setShowPhoneOrderModal(false);
	  handleTabSelect("takeaway");
	  setTimeout(() => {
	    fetchTakeawayOrders();
	  }, 300);
	}}





      />
    )}

    {activeTab === "phone" && <Orders />}
{activeTab === "packet" && (
  canSeePacketTab ? (
    <Orders hideModal={true} orders={packetOrders} />
  ) : (
    <div className="text-center mt-10 text-rose-500 font-bold">
      🚫 {t("Access Denied: Packet Orders")}
    </div>
  )
)}

{activeTab === "history" && (
      <OrderHistory
        fromDate={fromDate}
        toDate={toDate}
        paymentFilter={paymentFilter}
        orderTypeFilter={orderTypeFilter}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setPaymentFilter={setPaymentFilter}
        setOrderTypeFilter={setOrderTypeFilter}
      />
    )}

{activeTab === "kitchen" && (
  <div className="px-3 md:px-8 py-6">
    {kitchenOpenOrdersLoading ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-5xl mb-3">⏳</span>
        <span className="text-xl text-gray-400 font-semibold">{t("Loading orders...")}</span>
      </div>
    ) : kitchenOpenOrders.length === 0 ? (
      <div className="flex flex-col items-center mt-10">
        <span className="text-xl text-gray-400 font-semibold">{t("No open orders.")}</span>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-7">
    {kitchenOpenOrders.map((order) => {
      const orderType = String(order?.order_type || "").trim().toLowerCase();
      const readyAtLabel = kitchenReadyAtByOrderId.get(order.id) || "";
      const paid = isOrderFullyPaid(order);
      const paymentStatusLabel = paid ? t("Paid") : t("Unpaid");
      const paymentStatusClass = paid
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : "bg-amber-100 text-amber-800 border-amber-200";

      const title = (() => {
        if (orderType === "table") return `🍽️ ${tableLabelText} ${order.table_number}`;
      if (orderType === "phone") return `📞 ${t("Phone Order")}`;
      if (orderType === "packet") return "🛵 Yemeksepti";
        if (orderType === "takeaway") return `🥡 ${t("Pre Order")}`;
        return t("Order");
      })();

      const subtitle = (() => {
        if (orderType === "table") return null;
        if (orderType === "phone" || orderType === "packet") {
          return order.customer_name || order.customer_phone || null;
        }
        if (orderType === "takeaway") {
          return order.customer_name || order.customer_phone || null;
        }
        return null;
      })();

      return (
        <div
          key={order.id}
          className="rounded-3xl bg-white border border-slate-200 shadow-xl p-5 flex flex-col gap-3 hover:shadow-2xl transition cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToOrder(order);
            }
          }}
          onClick={() => navigateToOrder(order)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-extrabold text-lg text-slate-900 truncate">{title}</div>
              <div className="text-xs text-slate-500 font-semibold">
                #{order.id}
                {subtitle ? ` • ${subtitle}` : ""}
              </div>
              {order.customer_address && (orderType === "phone" || orderType === "packet") && (
                <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                  📍 {order.customer_address}
                </div>
              )}
              {order.pickup_time && orderType === "takeaway" && (
                <div className="text-xs text-slate-600 mt-1">
                  🕒 {t("Pickup")}: {order.pickup_time}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${paymentStatusClass}`}>
                {paymentStatusLabel}
              </span>
              {readyAtLabel && (
                <span className="px-2.5 py-1 rounded-full text-xs font-extrabold border bg-slate-100 text-slate-700 border-slate-200">
                  ⏳ {t("Ready at")} {readyAtLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-800">
              {formatCurrency(Number(order.total || 0))}
            </div>
            {order.payment_method && (
              <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
                {t("Paid")}: {order.payment_method}
              </span>
            )}
          </div>

          {Array.isArray(order.items) && order.items.length > 0 && (
            <div className="text-xs text-slate-600">
              {order.items.slice(0, 3).map((it, idx) => (
                <div key={`${order.id}-${it.id || idx}`} className="truncate">
                  • {it.product_name || it.name || t("Item")} ×{it.quantity || 1}
                </div>
              ))}
              {order.items.length > 3 && (
                <div className="text-xs text-slate-400 italic">
                  +{order.items.length - 3} {t("more")}
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}
      </div>
    )}
  </div>
)}



<RegisterModal
  showRegisterModal={showRegisterModal}
  setShowRegisterModal={setShowRegisterModal}
  handleTabSelect={handleTabSelect}
/>











  </div>
);



}
