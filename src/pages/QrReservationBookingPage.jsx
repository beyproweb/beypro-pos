import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { io } from "socket.io-client";
import secureFetch, { getAuthToken } from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";
import { SOCKET_BASE } from "../utils/api";
import {
  getCheckoutPrefill,
  saveCheckoutPrefill,
  useCustomerAuth,
} from "../features/qrmenu/header-drawer";
import PhoneVerificationModal from "../features/qrmenu/components/modals/PhoneVerificationModal";
import {
  computeReservationSlot,
  getEffectiveBookingMaxDaysInAdvance,
  normalizeQrBookingSettings,
  normalizeReservationTimeSlotOptions,
  parseLocalDateTime,
} from "../utils/qrBooking";
import {
  buildConcertBookingPath,
  buildReservationContactPath,
  buildPublicMenuPath,
  resolvePublicBookingIdentifier,
} from "../features/qrmenu/publicBookingRoutes";
import { createQrScopedStorage } from "../features/qrmenu/utils/createQrScopedStorage";
import {
  getOrderTableNumberKey,
  isActiveTableOrderStatus,
  isSameTableNumberKey,
  normalizeTableNumberKey,
} from "../utils/activeTableState";
import {
  getFloorPlanStateTableNumber,
  mergeFloorPlanVisualStyles,
  normalizeFloorPlanTableStatus,
} from "../features/floorPlan/utils/floorPlan";
import BookingPageLayout from "../features/floorPlan/components/BookingPageLayout";
import BookingSection from "../features/floorPlan/components/BookingSection";
import BookingSummaryCard from "../features/floorPlan/components/BookingSummaryCard";
import FloorPlanPickerModal from "../features/floorPlan/components/FloorPlanPickerModal";
import GuestCompositionCard from "../features/floorPlan/components/GuestCompositionCard";
import RegisteredCustomerBadge from "../features/floorPlan/components/RegisteredCustomerBadge";
import {
  buildGuestComposition,
  buildGuestCountOptions,
  EMAIL_REGEX,
  formatQrPhoneForInput,
  getGuestCompositionValidationError,
  guestCompositionRuleRequiresInput,
  hasGuestCompositionValue,
  normalizeGuestCompositionFieldMode,
  normalizeGuestCompositionRestrictionRule,
  normalizeMinimumGuestsPerTable,
  normalizeGuestCountSelection,
  normalizeQrPhone,
  parseGuestCompositionCount,
  QR_PHONE_REGEX,
  resolveGuestCompositionPolicyMessage,
} from "../features/floorPlan/utils/bookingRules";

function formatTableLabel(tableLike, fallbackPrefix = "Table") {
  const number = Number(
    tableLike?.table_number ?? tableLike?.tableNumber ?? tableLike?.number ?? tableLike
  );
  if (!Number.isFinite(number) || number <= 0) return fallbackPrefix;
  const label = String(tableLike?.label || tableLike?.name || "").trim();
  return label || `${fallbackPrefix} ${String(number).padStart(2, "0")}`;
}

function getActiveTables(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.active !== false);
}

function buildReservationApiPath(identifier, pathname = "/orders/reservations") {
  const params = new URLSearchParams();
  if (identifier) {
    params.set("identifier", identifier);
  }
  return `${pathname}?${params.toString()}`;
}

function normalizeHexColor(value, fallback = "#111827") {
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

const TABLE_STATE_SOURCE_PRIORITY = {
  fallback: 0,
  unavailable_list: 20,
  unavailable_reserved_list: 30,
  unavailable_state: 40,
  active_order: 90,
  table_lock: 100,
};
const TABLE_10_DEBUG_KEY = "10";
const LIVE_REFRESH_SOCKET_EVENTS = [
  "order_confirmed",
  "orders_updated",
  "order_cancelled",
  "order_deleted",
  "order_closed",
  "reservation_created",
  "reservation_updated",
  "reservation_cancelled",
  "reservation_deleted",
];
const TERMINAL_FLOOR_MAP_ORDER_STATUSES = new Set([
  "checked_out",
  "checkedout",
  "checkout",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
  "archived",
]);
const RESERVATION_LIKE_ORDER_TYPES = new Set([
  "reservation",
  "concert",
  "concert_table",
]);

function parseRestaurantIdFromIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const parts = raw.split(":");
  const lastPart = parts[parts.length - 1];
  const match = String(lastPart).match(/(\d+)$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseReservationTableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseReservationOrdersPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.orders)) return payload.orders;
  return [];
}

function normalizeReservationDateYmd(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const datePrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return datePrefix ? datePrefix[1] : "";
}

function getReservationLocalTodayYmd() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const RESERVATION_SHOP_HOURS_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const RESERVATION_WEEKDAY_NAMES_BY_INDEX = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function createEmptyReservationShopHoursMap() {
  const hoursMap = {};
  RESERVATION_SHOP_HOURS_DAYS.forEach((day) => {
    hoursMap[day] = { open: "", close: "", enabled: false };
  });
  return hoursMap;
}

function getReservationShopHoursDayKey(value = "") {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (Number.isNaN(date.getTime())) return "";
  return RESERVATION_WEEKDAY_NAMES_BY_INDEX[date.getDay()] || "";
}

function parseReservationTimeToMinutes(value = "") {
  const match = String(value || "")
    .trim()
    .match(/^(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isReservationTimeWithinShopHours(timeValue = "", shopHoursEntry = null) {
  if (!shopHoursEntry?.enabled) return false;

  const targetMinutes = parseReservationTimeToMinutes(timeValue);
  const openMinutes = parseReservationTimeToMinutes(shopHoursEntry?.open);
  const closeMinutes = parseReservationTimeToMinutes(shopHoursEntry?.close);

  if (targetMinutes === null || openMinutes === null || closeMinutes === null) return false;
  if (openMinutes === closeMinutes) return true;
  if (closeMinutes > openMinutes) {
    return targetMinutes >= openMinutes && targetMinutes <= closeMinutes;
  }
  return targetMinutes >= openMinutes || targetMinutes <= closeMinutes;
}

function isReservationSelectedDateToday(reservationDateYmd = "") {
  const targetYmd = normalizeReservationDateYmd(reservationDateYmd);
  if (!targetYmd) return true;
  return targetYmd === getReservationLocalTodayYmd();
}

function shouldIncludeReservationCurrentOccupancy({
  reservationDateYmd = "",
  requestedSlot = null,
} = {}) {
  if (!isReservationSelectedDateToday(reservationDateYmd)) return false;
  if (!requestedSlot || typeof requestedSlot !== "object") return true;

  const slotStart = parseLocalDateTime(requestedSlot?.slot_start_datetime);
  const slotEnd = parseLocalDateTime(requestedSlot?.slot_end_datetime);
  if (!slotStart || !slotEnd) return false;

  const now = new Date();
  return now >= slotStart && now < slotEnd;
}

function getReservationOrderStatus(order) {
  return String(
    order?.status ??
      order?.order_status ??
      order?.orderStatus ??
      order?.reservation_order_status ??
      order?.reservationOrderStatus ??
      order?.reservation?.status ??
      order?.reservation?.reservation_status ??
      order?.reservation?.reservationStatus ??
      ""
  )
    .trim()
    .toLowerCase();
}

function getReservationOrderDateYmd(order) {
  return normalizeReservationDateYmd(
    order?.reservation_date ??
      order?.reservationDate ??
      order?.reservation?.reservation_date ??
      order?.reservation?.reservationDate ??
      order?.event_date ??
      order?.eventDate ??
      order?.reservation?.event_date ??
      order?.reservation?.eventDate
  );
}

function hasReservationPayload(order) {
  return Boolean(
    order?.reservation_id ??
      order?.reservationId ??
      order?.reservation_date ??
      order?.reservationDate ??
      order?.reservation_time ??
      order?.reservationTime ??
      order?.reservation?.id ??
      order?.reservation?.reservation_id ??
      order?.reservation?.reservationId ??
      order?.reservation?.reservation_date ??
      order?.reservation?.reservationDate ??
      order?.reservation?.reservation_time ??
      order?.reservation?.reservationTime
  );
}

function isReservationLikeOrder(order, normalizedStatus = "") {
  const orderType = String(
    order?.order_type ??
      order?.orderType ??
      order?.reservation?.order_type ??
      order?.reservation?.orderType ??
      ""
  )
    .trim()
    .toLowerCase();
  if (RESERVATION_LIKE_ORDER_TYPES.has(orderType)) return true;
  if (hasReservationPayload(order)) return true;
  return normalizedStatus === "reserved" || normalizedStatus === "checked_in";
}

function isOrderOccupyingForReservationDate(order, reservationDateYmd = "") {
  const normalizedStatus = getReservationOrderStatus(order);
  if (!normalizedStatus) return false;
  if (TERMINAL_FLOOR_MAP_ORDER_STATUSES.has(normalizedStatus)) return false;
  if (isActiveTableOrderStatus(normalizedStatus)) {
    return isReservationSelectedDateToday(reservationDateYmd);
  }
  if (!isReservationLikeOrder(order, normalizedStatus)) return false;
  if (normalizedStatus === "checked_in") return true;

  const orderDateYmd = getReservationOrderDateYmd(order);
  if (!reservationDateYmd) return true;
  if (!orderDateYmd) return isReservationSelectedDateToday(reservationDateYmd);
  return orderDateYmd === reservationDateYmd;
}

function isReservationTable10(value) {
  return normalizeTableNumberKey(value) === TABLE_10_DEBUG_KEY;
}

function resolveReservationTableNumberFromTables(tables = [], rawValue) {
  const targetKey = normalizeTableNumberKey(rawValue);
  if (!targetKey) return null;
  const matched = (Array.isArray(tables) ? tables : []).find((table) =>
    isSameTableNumberKey(
      targetKey,
      table?.number ?? table?.tableNumber ?? table?.table_number
    )
  );
  const resolvedRaw = matched
    ? matched?.number ?? matched?.tableNumber ?? matched?.table_number
    : rawValue;
  return parseReservationTableNumber(resolvedRaw);
}

function normalizeReservationFloorPlanStatus(value) {
  return normalizeFloorPlanTableStatus(value);
}

function getUnavailableReservationStateDateYmd(state = {}) {
  return normalizeReservationDateYmd(
    state?.reservation_date ??
      state?.reservationDate ??
      state?.event_date ??
      state?.eventDate ??
      state?.booking_date ??
      state?.bookingDate ??
      state?.date
  );
}

function suppressFutureCurrentOccupancyState(
  state = {},
  reservationDateYmd = "",
  includeCurrentOccupancy = true
) {
  if (!state || typeof state !== "object" || includeCurrentOccupancy) return state;
  const normalizedStatus = normalizeReservationFloorPlanStatus(
    state?.status ??
      state?.table_status ??
      state?.tableStatus ??
      state?.availability_status ??
      state?.availabilityStatus ??
      state?.state
  );
  if (normalizedStatus !== "occupied") return state;

  const stateDateYmd = getUnavailableReservationStateDateYmd(state);
  if (stateDateYmd && reservationDateYmd && stateDateYmd === reservationDateYmd) {
    return state;
  }

  return {
    ...state,
    status: "available",
    table_status: "available",
    tableStatus: "available",
    availability_status: "available",
    availabilityStatus: "available",
    state: "available",
  };
}

function mergeStateEntryByPriority(
  map,
  source = {},
  fallbackStatus = "available",
  options = {}
) {
  const tableNumber = parseReservationTableNumber(getFloorPlanStateTableNumber(source));
  if (!tableNumber) return;
  const sourcePriority =
    TABLE_STATE_SOURCE_PRIORITY[String(options?.source || "fallback").trim()] || 0;
  const sourceName = String(options?.source || "fallback").trim();
  const forceStatus = Boolean(options?.forceStatus);

  let normalizedStatus = normalizeReservationFloorPlanStatus(
    source?.status ??
      source?.table_status ??
      source?.tableStatus ??
      source?.availability_status ??
      source?.availabilityStatus ??
      source?.state ??
      fallbackStatus
  );
  if (normalizedStatus === "reserved") {
    normalizedStatus = "occupied";
  }
  if (
    sourceName !== "active_order" &&
    sourceName !== "unavailable_state" &&
    sourceName !== "unavailable_reserved_list" &&
    (normalizedStatus === "occupied" || normalizedStatus === "reserved")
  ) {
    normalizedStatus = "available";
  }

  const previous = map.get(tableNumber);
  if (!previous) {
    map.set(tableNumber, {
      ...(source && typeof source === "object" ? source : {}),
      table_number: tableNumber,
      status: normalizedStatus,
      __sourcePriority: sourcePriority,
    });
    return;
  }

  const previousStatus = normalizeReservationFloorPlanStatus(previous?.status || "available");
  const previousSourcePriority = Number(previous?.__sourcePriority || 0);
  const lockedStatusStays = previousStatus === "blocked" && normalizedStatus !== "blocked";
  const strongerSource = sourcePriority > previousSourcePriority;
  const equalSource = sourcePriority === previousSourcePriority;
  const shouldTakeNextStatus =
    !lockedStatusStays &&
    (forceStatus ||
      (strongerSource && normalizedStatus !== previousStatus) ||
      // For equal-source updates, let latest payload win (including downgrades)
      // so stale occupied/reserved entries can return to available immediately.
      (equalSource && normalizedStatus !== previousStatus));

  map.set(tableNumber, {
    ...previous,
    ...(source && typeof source === "object" ? source : {}),
    table_number: tableNumber,
    status: shouldTakeNextStatus ? normalizedStatus : previousStatus,
    __sourcePriority: Math.max(previousSourcePriority, sourcePriority),
  });
}

function mergeNumberListAsStatus(map, values, status, options = {}) {
  (Array.isArray(values) ? values : []).forEach((value) => {
    const tableNumber = parseReservationTableNumber(value);
    if (!tableNumber) return;
    mergeStateEntryByPriority(map, { table_number: tableNumber }, status, options);
  });
}

function buildMergedReservationTableStates({
  activeOrders = [],
  unavailablePayload = null,
  tables = [],
  reservationDateYmd = "",
  reservationTimeValue = "",
  includeCurrentOccupancy = isReservationSelectedDateToday(reservationDateYmd),
}) {
  const merged = new Map();
  const shouldMergeCurrentOccupancy = Boolean(includeCurrentOccupancy);
  const shouldMergeCurrentLocks = isReservationSelectedDateToday(reservationDateYmd);

  (Array.isArray(tables) ? tables : []).forEach((table) => {
    const tableNumber = resolveReservationTableNumberFromTables(
      tables,
      table?.number ?? table?.tableNumber ?? table?.table_number
    );
    if (!tableNumber) return;
    mergeStateEntryByPriority(
      merged,
      {
        table_number: tableNumber,
        label: table?.label || "",
        capacity: Number(table?.seats ?? table?.guests ?? 0) || undefined,
      },
      "available",
      { source: "fallback", forceStatus: true }
    );
  });

  if (unavailablePayload && typeof unavailablePayload === "object") {
    (Array.isArray(unavailablePayload?.table_states) ? unavailablePayload.table_states : []).forEach(
      (state) => {
        const sanitizedState = suppressFutureCurrentOccupancyState(
          state,
          reservationDateYmd,
          shouldMergeCurrentOccupancy
        );
        mergeStateEntryByPriority(
          merged,
          {
            ...(sanitizedState && typeof sanitizedState === "object" ? sanitizedState : {}),
            table_number: resolveReservationTableNumberFromTables(
              tables,
              getFloorPlanStateTableNumber(sanitizedState)
            ),
          },
          "available",
          {
            source: "unavailable_state",
          }
        )
      }
    );
    (Array.isArray(unavailablePayload?.tables) ? unavailablePayload.tables : []).forEach((state) => {
      const sanitizedState = suppressFutureCurrentOccupancyState(
        state,
        reservationDateYmd,
        shouldMergeCurrentOccupancy
      );
      mergeStateEntryByPriority(
        merged,
        {
          ...(sanitizedState && typeof sanitizedState === "object" ? sanitizedState : {}),
          table_number: resolveReservationTableNumberFromTables(
            tables,
            getFloorPlanStateTableNumber(sanitizedState)
          ),
        },
        "available",
        {
          source: "unavailable_state",
        }
      );
    });
    mergeNumberListAsStatus(
      merged,
      (Array.isArray(unavailablePayload?.table_numbers) ? unavailablePayload.table_numbers : []).map(
        (value) => resolveReservationTableNumberFromTables(tables, value)
      ),
      "pending_hold",
      {
        source: "unavailable_list",
        forceStatus: true,
      }
    );
    if (shouldMergeCurrentOccupancy) {
      mergeNumberListAsStatus(
        merged,
        (Array.isArray(unavailablePayload?.occupied_table_numbers)
          ? unavailablePayload.occupied_table_numbers
          : []
        ).map((value) => resolveReservationTableNumberFromTables(tables, value)),
        "pending_hold",
        {
          source: "unavailable_state",
        }
      );
    }
    mergeNumberListAsStatus(
      merged,
      (Array.isArray(unavailablePayload?.reserved_table_numbers)
        ? unavailablePayload.reserved_table_numbers
        : []
      ).map((value) => resolveReservationTableNumberFromTables(tables, value)),
      "occupied",
      {
        source: "unavailable_reserved_list",
        forceStatus: true,
      }
    );
  }

  (Array.isArray(activeOrders) ? activeOrders : []).forEach((order) => {
    if (!isOrderOccupyingForReservationDate(order, reservationDateYmd)) return;
    const tableNumber = resolveReservationTableNumberFromTables(
      tables,
      getOrderTableNumberKey(order)
    );
    if (!tableNumber) return;
    mergeStateEntryByPriority(
      merged,
      {
        table_number: tableNumber,
      },
      "occupied",
      {
        source: "active_order",
        forceStatus: true,
      }
    );
  });

  if (shouldMergeCurrentLocks) {
    (Array.isArray(tables) ? tables : []).forEach((table) => {
      const tableNumber = resolveReservationTableNumberFromTables(
        tables,
        table?.number ?? table?.tableNumber ?? table?.table_number
      );
      if (!tableNumber) return;
      const locked = Boolean(
        table?.locked ??
          table?.is_locked ??
          table?.isLocked ??
          table?.unavailable ??
          table?.disabled
      );
      if (!locked) return;

      mergeStateEntryByPriority(
        merged,
        {
          table_number: tableNumber,
          reason:
            table?.lock_reason ??
            table?.lockReason ??
            table?.unavailable_reason ??
            table?.unavailableReason ??
            "Blocked",
        },
        "blocked",
        { source: "table_lock", forceStatus: true }
      );
    });
  }

  return [...merged.values()]
    .map((row) => {
      const { __sourcePriority, ...rest } = row || {};
      return rest;
    })
    .sort((a, b) => {
      const aNum = parseReservationTableNumber(a?.table_number) || 0;
      const bNum = parseReservationTableNumber(b?.table_number) || 0;
      return aNum - bNum;
    });
}

async function fetchUnavailableTablesSnapshot(identifier, params = {}, cacheBustValue = "") {
  if (!identifier) return null;
  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    searchParams.set(key, String(value));
  });
  if (cacheBustValue) searchParams.set("_ts", String(cacheBustValue));

  const token = getAuthToken();
  const authorization = token
    ? token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`
    : "";
  const requestOptions = {
    ...(authorization ? { headers: { Authorization: authorization } } : {}),
    cache: "no-store",
  };

  const query = searchParams.toString();
  try {
    return await secureFetch(
      `/public/unavailable-tables/${encodeURIComponent(identifier)}${query ? `?${query}` : ""}`,
      requestOptions
    );
  } catch (primaryError) {
    const shouldRetryLegacy = /401|404|405|unauthorized|token missing/i.test(
      String(primaryError?.message || "")
    );
    if (!shouldRetryLegacy) throw primaryError;
    const fallbackQuery = new URLSearchParams(query);
    fallbackQuery.set("identifier", identifier);
    return secureFetch(`/public/unavailable-tables?${fallbackQuery.toString()}`, requestOptions);
  }
}

export default function QrReservationBookingPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id } = useParams();
  const identifier = React.useMemo(
    () => resolvePublicBookingIdentifier({ slug, id, search: location.search }),
    [id, location.search, slug]
  );
  const customerAuthFetcher = React.useCallback(
    async (path, options = undefined) => {
      const rawPath = String(path || "");
      if (!identifier || rawPath.includes("identifier=")) {
        return secureFetch(rawPath, options);
      }
      const separator = rawPath.includes("?") ? "&" : "?";
      return secureFetch(
        `${rawPath}${separator}identifier=${encodeURIComponent(identifier)}`,
        options
      );
    },
    [identifier]
  );
  const menuPath = React.useMemo(
    () => buildPublicMenuPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const contactPath = React.useMemo(
    () => buildReservationContactPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const storage = React.useMemo(() => createQrScopedStorage(identifier), [identifier]);
  const {
    customer,
    isLoggedIn,
    requestPhoneOtp: requestCustomerPhoneOtp,
    verifyPhoneOtp: verifyCustomerPhoneOtp,
    getPhoneVerificationStatus: getCustomerPhoneVerificationStatus,
  } = useCustomerAuth(storage, { fetcher: customerAuthFetcher });
  const isLoggedInEffective = Boolean(isLoggedIn || customer?.id);
  const [customerPrefill, setCustomerPrefill] = React.useState(() => getCheckoutPrefill(storage));
  const customerEmailPrefill = React.useMemo(() => {
    const value = String(customerPrefill?.email || "").trim().toLowerCase();
    return !value || EMAIL_REGEX.test(value) ? value : "";
  }, [customerPrefill?.email]);

  const [settings, setSettings] = React.useState(null);
  const [tables, setTables] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [concertEventsLoading, setConcertEventsLoading] = React.useState(false);
  const [concertEventsForDate, setConcertEventsForDate] = React.useState([]);
  const [slotsLoading, setSlotsLoading] = React.useState(false);
  const [slots, setSlots] = React.useState([]);
  const [floorPlanLoading, setFloorPlanLoading] = React.useState(false);
  const [floorPlan, setFloorPlan] = React.useState(null);
  const [floorPlanSource, setFloorPlanSource] = React.useState("generated");
  const [tableStates, setTableStates] = React.useState([]);
  const [shopHours, setShopHours] = React.useState(() => createEmptyReservationShopHoursMap());
  const [shopHoursLoading, setShopHoursLoading] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const phoneVerificationResolverRef = React.useRef(null);
  const [phoneVerificationModalState, setPhoneVerificationModalState] = React.useState({
    open: false,
    phone: "",
    flowLabel: "",
  });
  const [resolvedRestaurantId, setResolvedRestaurantId] = React.useState(() =>
    parseRestaurantIdFromIdentifier(identifier)
  );
  const [floorPlanRefreshTick, setFloorPlanRefreshTick] = React.useState(0);
  const confirmationSectionRef = React.useRef(null);
  const previousConfirmedTableRef = React.useRef("");
  const liveRefreshTimerRef = React.useRef(null);
  const tableSnapshotRef = React.useRef([]);
  const todayIsoDate = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = React.useState({
    reservation_date: todayIsoDate,
    reservation_time: "",
    reservation_clients: "0",
    reservation_men: "",
    reservation_women: "",
    table_number: "",
    name: customerPrefill?.name || "",
    phone: formatQrPhoneForInput(customerPrefill?.phone || ""),
    email: customerEmailPrefill,
    notes: "",
  });

  React.useEffect(() => {
    setCustomerPrefill(getCheckoutPrefill(storage));
  }, [
    customer?.address,
    customer?.email,
    customer?.id,
    customer?.phone,
    customer?.updatedAt,
    customer?.username,
    storage,
  ]);

  React.useEffect(() => {
    const nextName = customer?.username || customerPrefill?.name || "";
    const nextPhone = formatQrPhoneForInput(customer?.phone || customerPrefill?.phone || "");
    const nextEmail = customer?.email || customerEmailPrefill || "";
    setForm((prev) =>
      isLoggedInEffective
        ? {
            ...prev,
            name: nextName,
            phone: nextPhone,
            email: nextEmail,
          }
        : {
            ...prev,
            name: prev.name || nextName,
            phone: prev.phone || nextPhone,
            email: prev.email || nextEmail,
          }
    );
  }, [
    customer?.email,
    customer?.phone,
    customer?.username,
    customerEmailPrefill,
    customerPrefill?.name,
    customerPrefill?.phone,
    isLoggedInEffective,
  ]);

  React.useEffect(() => {
    tableSnapshotRef.current = tables;
  }, [tables]);

  React.useEffect(() => {
    const parsed = parseRestaurantIdFromIdentifier(identifier);
    if (Number.isFinite(parsed) && parsed > 0) {
      setResolvedRestaurantId(parsed);
      return;
    }

    setResolvedRestaurantId(null);
    if (!identifier) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const info = await secureFetch(
          `/public/restaurant-info?identifier=${encodeURIComponent(identifier)}`
        );
        if (cancelled) return;
        const resolvedId = Number(info?.id);
        if (!Number.isFinite(resolvedId) || resolvedId <= 0) return;
        setResolvedRestaurantId(resolvedId);
      } catch {
        // Realtime socket remains optional.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identifier]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadShopHours() {
      if (!identifier) {
        setShopHours(createEmptyReservationShopHoursMap());
        setShopHoursLoading(false);
        return;
      }

      setShopHoursLoading(true);
      try {
        const response = await secureFetch(`/public/shop-hours/${encodeURIComponent(identifier)}`);
        if (cancelled) return;

        const nextHours = createEmptyReservationShopHoursMap();
        if (Array.isArray(response)) {
          response.forEach((row) => {
            nextHours[row.day] = {
              open: String(row?.open_time || "").slice(0, 5),
              close: String(row?.close_time || "").slice(0, 5),
              enabled: Boolean(row?.open_time && row?.close_time),
            };
          });
        }
        setShopHours(nextHours);
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load public shop hours:", error);
          setShopHours(createEmptyReservationShopHoursMap());
        }
      } finally {
        if (!cancelled) {
          setShopHoursLoading(false);
        }
      }
    }

    loadShopHours();

    return () => {
      cancelled = true;
    };
  }, [identifier]);

  React.useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current) {
        window.clearTimeout(liveRefreshTimerRef.current);
        liveRefreshTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!identifier) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [customizationRes, tablesRes] = await Promise.all([
          secureFetch(`/public/qr-menu-customization/${encodeURIComponent(identifier)}`),
          secureFetch(`/public/tables/${encodeURIComponent(identifier)}`),
        ]);
        if (cancelled) return;
        setSettings(
          customizationRes?.customization
            ? {
                ...customizationRes.customization,
                ...normalizeQrBookingSettings(customizationRes.customization),
              }
            : normalizeQrBookingSettings({})
        );
        setTables(getActiveTables(tablesRes));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation booking page:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [identifier]);

  const guestCompositionFieldMode = normalizeGuestCompositionFieldMode(
    settings?.reservation_guest_composition_field_mode,
    "hidden"
  );
  const guestCompositionRule = normalizeGuestCompositionRestrictionRule(
    settings?.reservation_guest_composition_restriction_rule,
    "no_restriction"
  );
  const selectedTableNumber = Number(form.table_number || 0);
  const guestCompositionDisabledTables = Array.isArray(
    settings?.reservation_guest_composition_disabled_tables
  )
    ? settings.reservation_guest_composition_disabled_tables
    : [];
  const guestCompositionEnabled =
    Boolean(settings?.reservation_guest_composition_enabled) &&
    !guestCompositionDisabledTables.includes(selectedTableNumber);
  const guestCompositionRequiresInput = guestCompositionRuleRequiresInput(guestCompositionRule);
  const guestCompositionEffectiveFieldMode = guestCompositionRequiresInput
    ? "required"
    : guestCompositionFieldMode;
  const guestCompositionVisible =
    guestCompositionEnabled && guestCompositionEffectiveFieldMode !== "hidden";
  const minimumGuestsPerTable = normalizeMinimumGuestsPerTable(
    settings?.reservation_guest_composition_min_guests_per_table,
    1
  );
  const minimumGuestsRuleActive =
    guestCompositionEnabled && guestCompositionRule === "minimum_guests_per_table";
  const guestCountLimit = React.useMemo(() => {
    const fromTables = (Array.isArray(tables) ? tables : []).reduce((max, table) => {
      const seats = Number(table?.seats || 0);
      return Number.isFinite(seats) && seats > 0 ? Math.max(max, seats) : max;
    }, 0);
    return fromTables > 0 ? fromTables : 20;
  }, [tables]);
  const guestOptions = React.useMemo(
    () =>
      buildGuestCountOptions(guestCountLimit, guestCompositionRule === "couple_only").filter(
        (count) => count >= minimumGuestsPerTable
      ),
    [guestCompositionRule, guestCountLimit, minimumGuestsPerTable]
  );
  const selectedGuestCount = Number(
    normalizeGuestCountSelection(form.reservation_clients, guestOptions) || 0
  );
  const menCount = parseGuestCompositionCount(form.reservation_men);
  const womenCount = parseGuestCompositionCount(form.reservation_women);
  const hasGuestCompositionInput =
    hasGuestCompositionValue(form.reservation_men) || hasGuestCompositionValue(form.reservation_women);
  const guestCompositionMessage =
    (guestCompositionVisible || minimumGuestsRuleActive) &&
    guestCompositionRule !== "no_restriction"
      ? resolveGuestCompositionPolicyMessage(
          settings?.reservation_guest_composition_validation_message,
          guestCompositionRule,
          t,
          {
            minimumGuestsPerTable,
          }
        )
      : "";
  const guestCompositionError = getGuestCompositionValidationError({
    enabled: guestCompositionEnabled,
    fieldMode: guestCompositionEffectiveFieldMode,
    restrictionRule: guestCompositionRule,
    validationMessage: guestCompositionMessage,
    minimumGuestsPerTable,
    totalGuests: selectedGuestCount,
    menGuests: form.reservation_men,
    womenGuests: form.reservation_women,
    translate: t,
  });
  const scheduleLiveTableStateRefresh = React.useCallback(
    (delayMs = 80) => {
      if (!identifier) return;
      if (liveRefreshTimerRef.current) {
        window.clearTimeout(liveRefreshTimerRef.current);
      }
      liveRefreshTimerRef.current = window.setTimeout(() => {
        setFloorPlanRefreshTick((value) => value + 1);
      }, Math.max(0, Number(delayMs) || 0));
    },
    [identifier]
  );

  React.useEffect(() => {
    if (!guestCompositionVisible) {
      setForm((prev) =>
        !prev.reservation_men && !prev.reservation_women
          ? prev
          : { ...prev, reservation_men: "", reservation_women: "" }
      );
      return;
    }
    setForm((prev) => {
      const hasInput =
        hasGuestCompositionValue(prev.reservation_men) || hasGuestCompositionValue(prev.reservation_women);
      if (guestCompositionEffectiveFieldMode === "optional" && !hasInput) {
        return prev;
      }
      const nextComposition = buildGuestComposition(
        prev.reservation_clients,
        prev.reservation_men,
        prev.reservation_women,
        { menKey: "reservation_men", womenKey: "reservation_women" }
      );
      if (
        prev.reservation_men === nextComposition.reservation_men &&
        prev.reservation_women === nextComposition.reservation_women
      ) {
        return prev;
      }
      return { ...prev, ...nextComposition };
    });
  }, [form.reservation_clients, guestCompositionEffectiveFieldMode, guestCompositionVisible]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadConcertEvents() {
      if (!identifier || !form.reservation_date) {
        setConcertEventsForDate([]);
        setConcertEventsLoading(false);
        return;
      }
      setConcertEventsLoading(true);
      try {
        const response = await secureFetch(
          `/public/concerts/${encodeURIComponent(identifier)}/events`
        );
        if (cancelled) return;
        const nextEvents = Array.isArray(response?.events) ? response.events : [];
        setConcertEventsForDate(
          nextEvents.filter(
            (event) => normalizeReservationDateYmd(event?.event_date) === form.reservation_date
          )
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load concert events for reservation date:", error);
          setConcertEventsForDate([]);
        }
      } finally {
        if (!cancelled) {
          setConcertEventsLoading(false);
        }
      }
    }

    loadConcertEvents();

    return () => {
      cancelled = true;
    };
  }, [form.reservation_date, identifier]);

  const hasConcertEventOnSelectedDate = concertEventsForDate.length > 0;
  const bookingSlotRulesEnabled = settings?.booking_slot_settings_enabled !== false;

  React.useEffect(() => {
    if (!hasConcertEventOnSelectedDate) return;
    setForm((prev) => {
      if (!prev.reservation_time && !prev.table_number) return prev;
      return {
        ...prev,
        reservation_time: "",
        table_number: "",
      };
    });
  }, [hasConcertEventOnSelectedDate]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      if (
        !identifier ||
        !form.reservation_date ||
        hasConcertEventOnSelectedDate ||
        !bookingSlotRulesEnabled
      ) {
        setSlots([]);
        setSlotsLoading(false);
        return;
      }
      setSlotsLoading(true);
      try {
        const cacheBust = String(Date.now());
        const params = new URLSearchParams({
          date: form.reservation_date,
          slots: "1",
          _ts: cacheBust,
        });
        if (selectedGuestCount > 0) {
          params.set("guest_count", String(selectedGuestCount));
        }
        const response = await secureFetch(
          `/public/unavailable-tables/${encodeURIComponent(identifier)}?${params.toString()}`,
          { cache: "no-store" }
        );
        if (cancelled) return;
        setSlots(normalizeReservationTimeSlotOptions(response?.time_slots || [], t));
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation slots:", error);
          setSlots([]);
        }
      } finally {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      }
    }
    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [
    bookingSlotRulesEnabled,
    form.reservation_date,
    hasConcertEventOnSelectedDate,
    identifier,
    selectedGuestCount,
    t,
  ]);

  React.useEffect(() => {
    if (!bookingSlotRulesEnabled || !form.reservation_time) return;
    const currentTime = String(form.reservation_time || "").slice(0, 5);
    const slotStillAvailable = slots.some((slot) => slot.time === currentTime && slot.isAvailable);
    if (!slotStillAvailable) {
      setForm((prev) => ({ ...prev, reservation_time: "" }));
    }
  }, [bookingSlotRulesEnabled, form.reservation_time, slots]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPlan() {
      if (!identifier || hasConcertEventOnSelectedDate) {
        setFloorPlan(null);
        setTableStates([]);
        setFloorPlanLoading(false);
        return;
      }
      setFloorPlanLoading(true);
      try {
        const cacheBust = String(Date.now());
        const params = new URLSearchParams();
        if (form.reservation_date) params.set("date", form.reservation_date);
        if (form.reservation_time) params.set("time", form.reservation_time);
        if (selectedGuestCount > 0) params.set("guest_count", String(selectedGuestCount));
        if (hasGuestCompositionInput) {
          params.set("reservation_men", String(menCount));
          params.set("reservation_women", String(womenCount));
        }
        params.set("_ts", cacheBust);
        const query = params.toString();
        const authToken = getAuthToken();
        const [response, tablesPayload, unavailablePayload, ordersPayload] = await Promise.all([
          secureFetch(
            `/public/floor-plan/${encodeURIComponent(identifier)}${query ? `?${query}` : ""}`,
            { cache: "no-store" }
          ),
          secureFetch(`/public/tables/${encodeURIComponent(identifier)}?_ts=${cacheBust}`, {
            cache: "no-store",
          }).catch(() => null),
          fetchUnavailableTablesSnapshot(
            identifier,
            {
              date: form.reservation_date,
              time: form.reservation_time,
              guest_count: selectedGuestCount > 0 ? selectedGuestCount : "",
            },
            cacheBust
          ).catch((error) => {
            console.warn("Failed to load unavailable reservation tables:", error);
            return null;
          }),
          authToken
            ? secureFetch(`/orders?_ts=${encodeURIComponent(cacheBust)}`, {
                cache: "no-store",
              }).catch(() => [])
            : Promise.resolve([]),
        ]);
        if (cancelled) return;
        const hasTablesPayload =
          Array.isArray(tablesPayload) || Array.isArray(tablesPayload?.data);
        const normalizedTables = hasTablesPayload
          ? getActiveTables(Array.isArray(tablesPayload) ? tablesPayload : tablesPayload?.data || [])
          : [];
        if (hasTablesPayload) setTables(normalizedTables);
        const normalizedOrders = parseReservationOrdersPayload(ordersPayload);
        const selectedReservationDateYmd = normalizeReservationDateYmd(form.reservation_date);
        const selectedReservationSlot = form.reservation_time
          ? computeReservationSlot({
              reservationDate: form.reservation_date,
              reservationTime: form.reservation_time,
              settings,
            })
          : null;
        const includeCurrentOccupancy = shouldIncludeReservationCurrentOccupancy({
          reservationDateYmd: selectedReservationDateYmd,
          requestedSlot: selectedReservationSlot,
        });
        const activeOrderTableKeys = new Set();
        const table10RawOrders = [];
        (Array.isArray(normalizedOrders) ? normalizedOrders : []).forEach((order) => {
          const tableKey = getOrderTableNumberKey(order);
          const status = getReservationOrderStatus(order);
          const occupiesNow = isOrderOccupyingForReservationDate(
            order,
            selectedReservationDateYmd
          );
          if (isReservationTable10(tableKey)) {
            table10RawOrders.push({
              id: order?.id ?? null,
              status,
              table_number:
                order?.table_number ??
                order?.tableNumber ??
                order?.reserved_table_number ??
                order?.reservedTableNumber ??
                order?.table_id ??
                order?.tableId ??
                order?.table ??
                order?.reservation?.table_number ??
                order?.reservation?.tableNumber ??
                null,
              reservation_date: getReservationOrderDateYmd(order),
              occupiesNow,
            });
          }
          if (!tableKey || !occupiesNow) return;
          activeOrderTableKeys.add(normalizeTableNumberKey(tableKey));
        });

        const table10RawUnavailableRows = [
          ...(Array.isArray(unavailablePayload?.table_states) ? unavailablePayload.table_states : []),
          ...(Array.isArray(unavailablePayload?.tables) ? unavailablePayload.tables : []),
        ]
          .filter((row) => isReservationTable10(getFloorPlanStateTableNumber(row)))
          .map((row) => ({
            table_number: getFloorPlanStateTableNumber(row),
            status:
              row?.status ??
              row?.table_status ??
              row?.tableStatus ??
              row?.availability_status ??
              row?.availabilityStatus ??
              row?.state ??
              "unknown",
          }));
        const table10UnavailableReservedNumbers = (
          Array.isArray(unavailablePayload?.reserved_table_numbers)
            ? unavailablePayload.reserved_table_numbers
            : []
        ).filter((value) => isReservationTable10(value));
        const table10UnavailableOccupiedNumbers = (
          Array.isArray(unavailablePayload?.occupied_table_numbers)
            ? unavailablePayload.occupied_table_numbers
            : []
        ).filter((value) => isReservationTable10(value));

        setFloorPlan(mergeFloorPlanVisualStyles(response?.layout || null, settings?.qr_floor_plan_layout));
        setFloorPlanSource(String(response?.source || "generated"));
        const mergedStates = buildMergedReservationTableStates({
          activeOrders: normalizedOrders,
          unavailablePayload,
          tables: hasTablesPayload ? normalizedTables : tableSnapshotRef.current,
          reservationDateYmd: selectedReservationDateYmd,
          reservationTimeValue: form.reservation_time,
          includeCurrentOccupancy,
        });

        if (import.meta.env.DEV) {
          const table10State =
            (Array.isArray(mergedStates) ? mergedStates : []).find((state) =>
              isReservationTable10(getFloorPlanStateTableNumber(state))
            ) || null;
          if (
            table10RawOrders.length > 0 ||
            table10RawUnavailableRows.length > 0 ||
            activeOrderTableKeys.has(TABLE_10_DEBUG_KEY) ||
            table10State
          ) {
            console.warn("[table10-debug][qr-floor-map][raw-api]", {
              orders: table10RawOrders,
              unavailableRows: table10RawUnavailableRows,
              unavailableReservedNumbers: table10UnavailableReservedNumbers,
              unavailableOccupiedNumbers: table10UnavailableOccupiedNumbers,
            });
            console.warn("[table10-debug][qr-floor-map][derived-occupied]", {
              activeOrderTableKeys: Array.from(activeOrderTableKeys),
              table10Occupied: activeOrderTableKeys.has(TABLE_10_DEBUG_KEY),
            });
            console.warn("[table10-debug][qr-floor-map][derived-state]", {
              table10State,
            });
          }
        }

        setTableStates(mergedStates);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load reservation floor plan:", error);
          setFloorPlan(null);
          setTableStates([]);
        }
      } finally {
        if (!cancelled) {
          setFloorPlanLoading(false);
        }
      }
    }
    loadPlan();
    return () => {
      cancelled = true;
    };
  }, [
    form.reservation_date,
    form.reservation_time,
    hasConcertEventOnSelectedDate,
    hasGuestCompositionInput,
    identifier,
    menCount,
    settings?.qr_floor_plan_layout,
    selectedGuestCount,
    womenCount,
    floorPlanRefreshTick,
  ]);

  React.useEffect(() => {
    if (!identifier) return undefined;
    const intervalId = window.setInterval(() => {
      scheduleLiveTableStateRefresh(0);
    }, 8000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [identifier, scheduleLiveTableStateRefresh]);

  React.useEffect(() => {
    if (!identifier) return undefined;

    let realtimeSocket = null;
    const socketRestaurantId = Number(resolvedRestaurantId || 0);
    const onSocketRefresh = () => scheduleLiveTableStateRefresh(50);
    const onConnect = () => {
      if (socketRestaurantId > 0) {
        realtimeSocket?.emit("join_restaurant", socketRestaurantId);
      }
      onSocketRefresh();
    };

    try {
      realtimeSocket = io(SOCKET_BASE, {
        path: "/socket.io",
        transports: ["polling", "websocket"],
        upgrade: true,
        withCredentials: true,
        timeout: 20000,
      });

      if (socketRestaurantId > 0) {
        realtimeSocket.emit("join_restaurant", socketRestaurantId);
      }

      realtimeSocket.on("connect", onConnect);
      LIVE_REFRESH_SOCKET_EVENTS.forEach((eventName) => {
        realtimeSocket.on(eventName, onSocketRefresh);
      });
    } catch (socketError) {
      console.warn("Reservation booking realtime socket unavailable:", socketError);
    }

    return () => {
      if (!realtimeSocket) return;
      try {
        LIVE_REFRESH_SOCKET_EVENTS.forEach((eventName) => {
          realtimeSocket.off(eventName, onSocketRefresh);
        });
        realtimeSocket.off("connect", onConnect);
        realtimeSocket.disconnect();
      } catch {
        // Ignore socket cleanup failures.
      }
    };
  }, [identifier, resolvedRestaurantId, scheduleLiveTableStateRefresh]);

  const selectedTableState = React.useMemo(() => {
    return (
      (Array.isArray(tableStates) ? tableStates : []).find(
        (state) =>
          isSameTableNumberKey(
            getFloorPlanStateTableNumber(state),
            selectedTableNumber
          )
      ) || null
    );
  }, [selectedTableNumber, tableStates]);
  const selectedTableRecord = React.useMemo(() => {
    return (
      (Array.isArray(tables) ? tables : []).find(
        (table) =>
          isSameTableNumberKey(
            table?.number ?? table?.tableNumber ?? table?.table_number,
            selectedTableNumber
          )
      ) || null
    );
  }, [selectedTableNumber, tables]);

  React.useEffect(() => {
    const selectedNumber = Number(form.table_number || 0);
    if (!selectedNumber) return;
    const currentState = (Array.isArray(tableStates) ? tableStates : []).find(
      (state) => isSameTableNumberKey(getFloorPlanStateTableNumber(state), selectedNumber)
    );
    const normalizedStateStatus = normalizeReservationFloorPlanStatus(
      currentState?.status ??
        currentState?.table_status ??
        currentState?.tableStatus ??
        currentState?.availability_status ??
        currentState?.availabilityStatus ??
        currentState?.state
    );
    if (import.meta.env.DEV && isReservationTable10(selectedNumber)) {
      console.warn("[table10-debug][qr-floor-map][selected-state]", {
        selectedNumber,
        normalizedStateStatus,
        state: currentState || null,
      });
    }
    if (!currentState || normalizedStateStatus !== "available") {
      setForm((prev) => ({ ...prev, table_number: "" }));
    }
  }, [form.table_number, tableStates]);

  const phoneValue = normalizeQrPhone(form.phone);
  const phoneValid = QR_PHONE_REGEX.test(phoneValue);
  const emailValid = !String(form.email || "").trim() || EMAIL_REGEX.test(String(form.email).trim());
  const hasRegisteredProfile = Boolean(
    isLoggedInEffective && form.name.trim() && phoneValid && emailValid
  );
  const hasConfirmedTable = Number(form.table_number || 0) > 0;
  const normalizedReservationTime = String(form.reservation_time || "").slice(0, 5);
  const selectedShopHours = React.useMemo(() => {
    const dayKey = getReservationShopHoursDayKey(form.reservation_date);
    const entry = dayKey ? shopHours?.[dayKey] : null;
    const open = String(entry?.open || "").slice(0, 5);
    const close = String(entry?.close || "").slice(0, 5);

    return {
      day: dayKey,
      open,
      close,
      enabled: Boolean(entry?.enabled && open && close),
    };
  }, [form.reservation_date, shopHours]);
  const selectedTimeSlot = slots.find(
    (slot) => slot.time === normalizedReservationTime
  );
  const manualTimeHasBoundedInputWindow = React.useMemo(() => {
    const openMinutes = parseReservationTimeToMinutes(selectedShopHours.open);
    const closeMinutes = parseReservationTimeToMinutes(selectedShopHours.close);
    return (
      selectedShopHours.enabled &&
      openMinutes !== null &&
      closeMinutes !== null &&
      closeMinutes > openMinutes
    );
  }, [selectedShopHours.close, selectedShopHours.enabled, selectedShopHours.open]);
  const manualTimeDayClosed =
    !bookingSlotRulesEnabled &&
    !shopHoursLoading &&
    !hasConcertEventOnSelectedDate &&
    !selectedShopHours.enabled;
  const manualTimeWithinShopHours = bookingSlotRulesEnabled
    ? true
    : isReservationTimeWithinShopHours(normalizedReservationTime, selectedShopHours);
  const manualTimeOutsideShopHours =
    !bookingSlotRulesEnabled &&
    Boolean(normalizedReservationTime) &&
    !manualTimeDayClosed &&
    !manualTimeWithinShopHours;
  const hasValidReservationTimeSelection = bookingSlotRulesEnabled
    ? Boolean(selectedTimeSlot?.isAvailable)
    : Boolean(normalizedReservationTime) && !manualTimeDayClosed && manualTimeWithinShopHours;
  const formErrors = {
    name: form.name.trim() ? "" : t("Please enter your name."),
    phone: phoneValid ? "" : t("Please enter a valid phone number."),
    email: emailValid ? "" : t("Please enter a valid email address."),
  };
  const canSubmit =
    form.name.trim() &&
    phoneValid &&
    emailValid &&
    form.reservation_date &&
    form.reservation_time &&
    selectedGuestCount > 0 &&
    hasValidReservationTimeSelection &&
    Number(form.table_number || 0) > 0 &&
    !guestCompositionError &&
    !submitting;

  const accentColor = normalizeHexColor(settings?.primary_color, "#111827");
  const summaryItems = [
    {
      label: t("Date"),
      value: form.reservation_date || "",
    },
    {
      label: t("Time"),
      value: form.reservation_time || "",
    },
    {
      label: t("Guests"),
      value: selectedGuestCount > 0 ? String(selectedGuestCount) : "",
    },
    {
      label: t("Table"),
      value: selectedTableRecord
        ? formatTableLabel(selectedTableRecord, t("Table"))
        : selectedTableState
          ? formatTableLabel(selectedTableState, t("Table"))
          : "",
    },
    {
      label: t("Layout"),
      value: floorPlanSource ? String(floorPlanSource).replace(/_/g, " ") : "",
    },
  ];

  React.useEffect(() => {
    if (!hasRegisteredProfile) {
      navigate(contactPath, { replace: true });
    }
  }, [contactPath, hasRegisteredProfile, navigate]);

  React.useEffect(() => {
    const nextConfirmedTable = String(form.table_number || "");
    if (
      nextConfirmedTable &&
      nextConfirmedTable !== previousConfirmedTableRef.current &&
      confirmationSectionRef.current
    ) {
      window.requestAnimationFrame(() => {
        confirmationSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
    previousConfirmedTableRef.current = nextConfirmedTable;
  }, [form.table_number]);

  const handleBack = React.useCallback(() => {
    navigate(menuPath);
  }, [menuPath, navigate]);
  const handleOpenConcertEvent = React.useCallback(
    (event) => {
      if (!event?.id) return;
      const bookingPath = buildConcertBookingPath({
        pathname: location.pathname,
        slug,
        id,
        search: location.search,
        concertId: event.id,
      });
      navigate(bookingPath, {
        state: {
          prefetchedConcertEvent: event,
          prefetchedAt: Date.now(),
        },
      });
    },
    [id, location.pathname, location.search, navigate, slug]
  );
  const handleEditCustomer = React.useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("edit", "1");
    navigate(params.toString() ? `${contactPath}?${params.toString()}` : contactPath);
  }, [contactPath, location.search, navigate]);

  const handleGuestCompositionDelta = React.useCallback((field, delta) => {
    setForm((prev) => {
      const totalGuests = parseGuestCompositionCount(prev.reservation_clients);
      if (totalGuests <= 0) return prev;
      const currentMen = hasGuestCompositionInput ? parseGuestCompositionCount(prev.reservation_men) : 0;
      const currentWomen = hasGuestCompositionInput ? parseGuestCompositionCount(prev.reservation_women) : 0;
      const nextValue = Math.min(
        totalGuests,
        Math.max(0, (field === "reservation_men" ? currentMen : currentWomen) + delta)
      );
      const nextMen = field === "reservation_men" ? nextValue : totalGuests - nextValue;
      const nextWomen = field === "reservation_women" ? nextValue : totalGuests - nextValue;
      return {
        ...prev,
        reservation_men: String(nextMen),
        reservation_women: String(nextWomen),
      };
    });
  }, [hasGuestCompositionInput]);

  const handleChooseTable = React.useCallback(() => {
    if (guestCompositionError) {
      window.alert(guestCompositionError);
      return;
    }
    if (selectedGuestCount <= 0) {
      window.alert(t("Please select guest amount."));
      return;
    }
    setPickerOpen(true);
  }, [guestCompositionError, selectedGuestCount, t]);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) {
      const firstError =
        formErrors.name ||
        formErrors.phone ||
        formErrors.email ||
        (!form.reservation_date ? t("Please select a date.") : "") ||
        (manualTimeDayClosed ? t("Reservations are unavailable for the selected day.") : "") ||
        (!form.reservation_time ? t("Please select a time.") : "") ||
        (manualTimeOutsideShopHours
          ? t("Please select a time between {{open}} and {{close}}.", {
              open: selectedShopHours.open,
              close: selectedShopHours.close,
            })
          : "") ||
        (selectedGuestCount <= 0 ? t("Please select guest amount.") : "") ||
        (bookingSlotRulesEnabled && !selectedTimeSlot?.isAvailable
          ? t("Please select an available time.")
          : "") ||
        (!Number(form.table_number || 0) ? t("Please select a table from the floor plan.") : "") ||
        guestCompositionError;
      if (firstError) {
        window.alert(firstError);
      }
      return;
    }

    const ensureVerifiedPhoneForFlow = async ({ phone, flowLabel = "" }) => {
      const normalizedPhone = normalizeQrPhone(phone);
      if (!QR_PHONE_REGEX.test(normalizedPhone)) {
        window.alert(t("Please enter a valid phone number."));
        return { ok: false, phone: normalizedPhone, phoneVerificationToken: "" };
      }

      const sessionPhone = normalizeQrPhone(customer?.phone || "");
      const sessionAlreadyVerified =
        isLoggedInEffective &&
        customer?.phone_verified === true &&
        QR_PHONE_REGEX.test(sessionPhone) &&
        sessionPhone === normalizedPhone;
      if (sessionAlreadyVerified) {
        return { ok: true, phone: normalizedPhone, phoneVerificationToken: "" };
      }

      try {
        const status = await getCustomerPhoneVerificationStatus({
          phone: normalizedPhone,
        });
        if (status?.verified) {
          return {
            ok: true,
            phone: normalizedPhone,
            phoneVerificationToken: String(status?.phoneVerificationToken || "").trim(),
          };
        }
      } catch {
        // Continue with modal fallback.
      }

      const modalResult = await new Promise((resolve) => {
        phoneVerificationResolverRef.current = resolve;
        setPhoneVerificationModalState({
          open: true,
          phone: normalizedPhone,
          flowLabel: String(flowLabel || "").trim(),
        });
      });
      if (modalResult?.verified) {
        return {
          ok: true,
          phone: normalizeQrPhone(modalResult.phone || normalizedPhone),
          phoneVerificationToken: String(modalResult.phoneVerificationToken || "").trim(),
        };
      }
      return { ok: false, phone: normalizedPhone, phoneVerificationToken: "" };
    };

    const verification = await ensureVerifiedPhoneForFlow({
      phone: phoneValue,
      flowLabel: t("Reservation"),
    });
    if (!verification?.ok) return;

    const verifiedPhone = normalizeQrPhone(verification.phone || phoneValue);
    if (QR_PHONE_REGEX.test(verifiedPhone)) {
      setForm((prev) => ({ ...prev, phone: formatQrPhoneForInput(verifiedPhone) }));
      saveCheckoutPrefill({ phone: verifiedPhone }, storage);
    }

    setSubmitting(true);
    try {
      const bookingToken = String(storage.getItem("qr_customer_token") || "").trim();
      const bookingAuthorization = bookingToken
        ? bookingToken.startsWith("Bearer ")
          ? bookingToken
          : `Bearer ${bookingToken}`
        : "";
      const response = await secureFetch(buildReservationApiPath(identifier), {
        headers: bookingAuthorization ? { Authorization: bookingAuthorization } : undefined,
        method: "POST",
        body: JSON.stringify({
          table_number: Number(form.table_number || 0),
          reservation_date: form.reservation_date,
          reservation_time: form.reservation_time,
          reservation_clients: selectedGuestCount,
          reservation_men:
            guestCompositionVisible && hasGuestCompositionInput ? menCount : null,
          reservation_women:
            guestCompositionVisible && hasGuestCompositionInput ? womenCount : null,
          reservation_notes: form.notes || "",
          customer_name: form.name.trim(),
          customer_phone: verifiedPhone || phoneValue,
          customer_email: String(form.email || "").trim().toLowerCase() || null,
          phone_verification_token: verification.phoneVerificationToken || null,
        }),
      });
      const reservationOrderId = Number(response?.reservation?.id || 0);
      const resolvedTableNumber = Number(response?.reservation?.table_number || form.table_number || 0);

      storage.setItem("qr_orderType", "table");
      storage.setItem("qr_table", String(resolvedTableNumber));
      storage.setItem("qr_show_status", "1");
      storage.setItem("qr_force_status_until_closed", "1");
      if (Number.isFinite(reservationOrderId) && reservationOrderId > 0) {
        storage.setItem("qr_active_order_id", String(reservationOrderId));
        storage.setItem(
          "qr_active_order",
          JSON.stringify({
            orderId: reservationOrderId,
            orderType: "table",
            table: resolvedTableNumber,
          })
        );
      }
      navigate(menuPath);
    } catch (error) {
      window.alert(error?.message || t("Failed to save reservation"));
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    form.email,
    form.name,
    form.notes,
    form.reservation_date,
    form.reservation_time,
    form.table_number,
    formErrors.email,
    formErrors.name,
    formErrors.phone,
    bookingSlotRulesEnabled,
    guestCompositionError,
    guestCompositionVisible,
    hasGuestCompositionInput,
    identifier,
    getCustomerPhoneVerificationStatus,
    manualTimeDayClosed,
    manualTimeOutsideShopHours,
    menuPath,
    menCount,
    navigate,
    phoneValue,
    saveCheckoutPrefill,
    selectedShopHours.close,
    selectedShopHours.open,
    selectedGuestCount,
    hasValidReservationTimeSelection,
    storage,
    t,
    womenCount,
  ]);

  React.useEffect(
    () => () => {
      const resolver = phoneVerificationResolverRef.current;
      phoneVerificationResolverRef.current = null;
      if (typeof resolver === "function") {
        resolver({
          verified: false,
          phone: "",
          phoneVerificationToken: "",
          source: "dismissed",
        });
      }
    },
    []
  );

  if (!hasRegisteredProfile) {
    return null;
  }

  const primaryActionLabel = hasConcertEventOnSelectedDate
    ? concertEventsForDate.length === 1
      ? t("Open Event")
      : t("Choose Event")
    : hasConfirmedTable
      ? t("Reserve Now")
      : t("Choose Table");
  const primaryActionHelper = hasConcertEventOnSelectedDate
    ? concertEventsForDate.length === 1
      ? String(
          concertEventsForDate[0]?.event_title ||
            concertEventsForDate[0]?.artist_name ||
            t("Concert event")
        )
      : t("This date has events. Choose one below to continue.")
    : hasConfirmedTable
      ? selectedTableState?.capacity
        ? t("Selected table for {{count}} guests", { count: selectedTableState.capacity })
        : t("Secure your reservation in a few taps")
      : selectedGuestCount > 0
        ? t("Pick your table from the live floor plan.")
        : t("Select guest amount to continue.");
  const primaryActionHandler = hasConcertEventOnSelectedDate
    ? () => {
        if (concertEventsForDate.length === 1) {
          handleOpenConcertEvent(concertEventsForDate[0]);
        }
      }
    : hasConfirmedTable
      ? handleSubmit
      : handleChooseTable;
  const primaryActionDisabled = hasConcertEventOnSelectedDate
    ? concertEventsForDate.length !== 1
    : hasConfirmedTable
      ? !canSubmit
      : !form.reservation_date ||
        !hasValidReservationTimeSelection ||
        pickerOpen ||
        selectedGuestCount <= 0 ||
        Boolean(guestCompositionError);

  return (
    <>
      <BookingPageLayout
      title={t("Reserve Table")}
      subtitle={loading ? t("Loading booking page") : t("Step-by-step reservation flow")}
      onBack={handleBack}
      accentColor={accentColor}
      showHeaderIndicator={false}
      actionLabel={submitting && hasConfirmedTable ? t("Saving...") : primaryActionLabel}
      actionHelper={primaryActionHelper}
      onAction={primaryActionHandler}
      actionDisabled={primaryActionDisabled}
    >
      <BookingSection
        step={1}
        title={t("Select Date")}
        description={t("Choose the day you want to visit.")}
      >
        <input
          type="date"
          value={form.reservation_date}
          min={new Date().toISOString().slice(0, 10)}
          max={(() => {
            const next = new Date();
            next.setDate(next.getDate() + getEffectiveBookingMaxDaysInAdvance(settings));
            return next.toISOString().slice(0, 10);
          })()}
          onChange={(event) => setForm((prev) => ({ ...prev, reservation_date: event.target.value }))}
          className="w-full rounded-[24px] border border-neutral-200 bg-white px-4 py-4 text-base dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
        />
      </BookingSection>

      <BookingSection
        step={2}
        title={hasConcertEventOnSelectedDate ? t("Event") : t("Select Time")}
        description={
          hasConcertEventOnSelectedDate
            ? t("This date has an event. Open the event instead of selecting a reservation slot.")
            : bookingSlotRulesEnabled
              ? t("Available slots update live based on your guest count.")
              : t("Choose your preferred reservation time.")
        }
        rightSlot={
          hasConcertEventOnSelectedDate ? (
            concertEventsLoading ? (
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                {t("Loading")}
              </span>
            ) : null
          ) : bookingSlotRulesEnabled && slotsLoading ? (
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {t("Loading")}
            </span>
          ) : null
        }
      >
        {hasConcertEventOnSelectedDate ? (
          <div className="space-y-3">
            {(Array.isArray(concertEventsForDate) ? concertEventsForDate : []).map((event) => {
              const headline = String(
                event?.event_title || event?.artist_name || t("Concert event")
              ).trim();
              const subline = String(event?.artist_name || "").trim();
              const eventTime = String(event?.event_time || "").slice(0, 5);
              return (
                <button
                  key={String(event?.id || `${event?.event_date || "concert"}-${eventTime}`)}
                  type="button"
                  onClick={() => handleOpenConcertEvent(event)}
                  className="w-full rounded-[22px] border border-neutral-200 bg-white px-4 py-4 text-left transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-950 dark:text-white">
                        {headline}
                      </div>
                      {subline && subline !== headline ? (
                        <div className="mt-1 truncate text-xs uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                          {subline}
                        </div>
                      ) : null}
                      <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {eventTime || t("Event details")}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
                      {t("Open Event")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : bookingSlotRulesEnabled ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Array.isArray(slots) ? slots : []).map((slot) => {
              const selected = slot.time === form.reservation_time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={!slot.isAvailable}
                  onClick={() => setForm((prev) => ({ ...prev, reservation_time: slot.time }))}
                  className={[
                    "rounded-[22px] border px-3 py-3 text-left transition",
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : slot.isAvailable
                        ? "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                        : "border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">{slot.time}</div>
                  <div className="mt-1 text-xs opacity-75">{slot.availabilityLabel}</div>
                </button>
              );
            })}
            {!slotsLoading && slots.length === 0 ? (
              <div className="col-span-full rounded-[22px] border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                {form.reservation_date
                  ? t("No reservation slots available for this day.")
                  : t("Select a date to load reservation slots.")}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="time"
              value={normalizedReservationTime}
              min={manualTimeHasBoundedInputWindow ? selectedShopHours.open : undefined}
              max={manualTimeHasBoundedInputWindow ? selectedShopHours.close : undefined}
              disabled={manualTimeDayClosed || shopHoursLoading}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  reservation_time: event.target.value,
                }))
              }
              className={[
                "w-full rounded-[24px] border bg-white px-4 py-4 text-base text-neutral-900 dark:bg-neutral-950 dark:text-white",
                manualTimeOutsideShopHours
                  ? "border-rose-500 dark:border-rose-500"
                  : "border-neutral-200 dark:border-neutral-800",
              ].join(" ")}
            />
            <p
              className={[
                "text-sm",
                manualTimeOutsideShopHours
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-neutral-500 dark:text-neutral-400",
              ].join(" ")}
            >
              {shopHoursLoading
                ? t("Loading shop hours.")
                : manualTimeDayClosed
                  ? t("Reservations are unavailable for the selected day.")
                  : manualTimeOutsideShopHours
                    ? t("Please select a time between {{open}} and {{close}}.", {
                        open: selectedShopHours.open,
                        close: selectedShopHours.close,
                      })
                    : selectedShopHours.open && selectedShopHours.close
                      ? t("Choose a time between {{open}} and {{close}}.", {
                          open: selectedShopHours.open,
                          close: selectedShopHours.close,
                        })
                      : t("Choose your preferred reservation time.")}
            </p>
          </div>
        )}
      </BookingSection>

      {!hasConcertEventOnSelectedDate ? (
        <BookingSection
          step={3}
          title=""
          description={t("Select number of guests")}
          compact
        >
          <GuestCompositionCard
            title=""
            description=""
            guestOptions={guestOptions}
            selectedGuests={selectedGuestCount}
            onGuestCountChange={(option) =>
              setForm((prev) => ({
                ...prev,
                reservation_clients: String(option),
                table_number: "",
              }))
            }
            guestsLabel=""
            menLabel={t("Men")}
            womenLabel={t("Women")}
            menCount={guestCompositionVisible ? menCount : undefined}
            womenCount={guestCompositionVisible ? womenCount : undefined}
            onMenChange={
              guestCompositionVisible
                ? (delta) => handleGuestCompositionDelta("reservation_men", delta)
                : undefined
            }
            onWomenChange={
              guestCompositionVisible
                ? (delta) => handleGuestCompositionDelta("reservation_women", delta)
                : undefined
            }
            locked={guestCompositionRule === "couple_only"}
            error={guestCompositionError}
            policyMessage={guestCompositionMessage}
            accentColor={accentColor}
            compact
            allowZeroSelection
          />
        </BookingSection>
      ) : null}

      {!hasConcertEventOnSelectedDate && hasConfirmedTable ? (
        <div ref={confirmationSectionRef}>
          <BookingSection
            step={4}
            title={t("Notes & Confirmation")}
            description={t("Add a short note, then review the booking summary.")}
          >
            <RegisteredCustomerBadge
              customer={{
                username: customer?.username || form.name,
                phone: customer?.phone || phoneValue,
                email: customer?.email || form.email,
              }}
              accentColor={accentColor}
              onEdit={handleEditCustomer}
            />
            <label className="block">
              <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {t("Reservation Notes")}
              </div>
              <textarea
                rows={4}
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
              />
            </label>
            <div className="mt-4">
              <BookingSummaryCard items={summaryItems} accentColor={accentColor} />
            </div>
          </BookingSection>
        </div>
      ) : null}

      <FloorPlanPickerModal
        open={!hasConcertEventOnSelectedDate && pickerOpen}
        title={t("Choose your table")}
        subtitle={t("Live availability for {{date}} {{time}}", {
          date: form.reservation_date || t("selected date"),
          time: form.reservation_time || t("selected time"),
        })}
        layout={floorPlan}
        tables={tables}
        tableStates={tableStates}
        selectedTableNumber={form.table_number}
        accentColor={accentColor}
        statusFilterKeys={["available", "pending_hold", "occupied", "blocked"]}
        onClose={() => setPickerOpen(false)}
        onConfirm={(node) => {
          setForm((prev) => ({ ...prev, table_number: String(node.table_number || "") }));
          setPickerOpen(false);
        }}
      />
      </BookingPageLayout>

      <PhoneVerificationModal
        open={phoneVerificationModalState.open}
        t={t}
        requireVerification={true}
        initialPhone={phoneVerificationModalState.phone}
        flowLabel={phoneVerificationModalState.flowLabel}
        onClose={() => {
          const resolver = phoneVerificationResolverRef.current;
          phoneVerificationResolverRef.current = null;
          setPhoneVerificationModalState({ open: false, phone: "", flowLabel: "" });
          if (typeof resolver === "function") {
            resolver({
              verified: false,
              phone: "",
              phoneVerificationToken: "",
              source: "dismissed",
            });
          }
        }}
        onRequestOtp={requestCustomerPhoneOtp}
        onVerifyOtp={verifyCustomerPhoneOtp}
        onVerified={(result) => {
          const resolver = phoneVerificationResolverRef.current;
          phoneVerificationResolverRef.current = null;
          setPhoneVerificationModalState({ open: false, phone: "", flowLabel: "" });
          if (typeof resolver === "function") {
            resolver({
              verified: true,
              phone: result?.phone || phoneVerificationModalState.phone,
              phoneVerificationToken: String(result?.phoneVerificationToken || "").trim(),
              source: result?.source || "otp_verified",
            });
          }
        }}
      />
    </>
  );
}
