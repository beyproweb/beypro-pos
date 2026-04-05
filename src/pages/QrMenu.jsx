// src/pages/QrMenu.jsx
// src/pages/QrMenu.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import OrderStatusScreen, { useSocketIO as useOrderSocket } from "../components/OrderStatusScreen";
import ModernTableSelector from "../components/ModernTableSelector";
import MenuProductsSection from "../features/qrmenu/components/MenuProductsSection";
import RequestSongTab from "../features/qrmenu/components/RequestSongTab";
import ProductModal from "../features/qrmenu/components/modals/ProductModal";
import CartModal from "../features/qrmenu/components/modals/CartModal";
import CheckoutModal from "../features/qrmenu/components/modals/CheckoutModal";
import useQrMenuController from "../features/qrmenu/hooks/useQrMenuController";
import { Header as QrMenuHeader } from "../features/qrmenu/header";
import {
  HeaderDrawer,
  getCheckoutPrefill,
  LoginPage,
  RegisterPage,
  useCustomerAuth,
  useHeaderDrawer,
} from "../features/qrmenu/header-drawer";
import { VoiceOrderController } from "../features/voiceOrder";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
  House,
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
import QRCode from "qrcode";
import { Toaster, toast } from "react-hot-toast";
import { API_BASE as API_URL, API_ORIGIN as API_BASE, SOCKET_BASE } from "../utils/api";
import {
  getEffectiveBookingMaxDaysInAdvance,
  normalizeQrBookingSettings,
  computeReservationSlot,
  computeConcertSlot,
  parseLocalDateTime,
  normalizeReservationTimeSlotOptions,
} from "../utils/qrBooking";
import {
  appendPublicBookingSubPath,
  buildConcertBookingPath,
  buildReservationBookingPath,
} from "../features/qrmenu/publicBookingRoutes";
import QuantityStepperCard from "../features/floorPlan/components/QuantityStepperCard";
import { isInStandaloneMode, isIos } from "../utils/pwaMode";
import { DEFAULT_LANGUAGE, resolvePreferredLanguage } from "../utils/language";
import {
  APP_RESTAURANT_BASE_URL,
  PUBLIC_RESTAURANT_BASE_URL,
  buildAppRestaurantUrl,
  buildPublicRestaurantUrl,
} from "../utils/publicRestaurantUrl";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QR_PHONE_REGEX = /^(5\d{9}|[578]\d{7})$/;

function normalizeQrPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("90") && digits.length > 2) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length > 1) digits = digits.slice(1);

  if (digits.startsWith("5")) return digits.slice(0, 10);
  if (digits.startsWith("7") || digits.startsWith("8")) return digits.slice(0, 8);
  return digits.slice(0, 10);
}

function navigateToMarketplaceFromQrMenu() {
  if (typeof window === "undefined") return;

  if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
    try {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          action: "OPEN_MARKETPLACE",
          source: "qr-menu",
        })
      );
      return;
    } catch {
      // fallback below
    }
  }

  if (window.ReactNativeWebView) {
    window.location.href = "beypro://marketplace";
    return;
  }

  window.location.href = `${APP_RESTAURANT_BASE_URL}/marketplace`;
}

function formatQrPhoneForInput(value) {
  const normalized = normalizeQrPhone(value);
  if (!normalized) return "";
  if (/^5\d{0,9}$/.test(normalized)) {
    const a = normalized.slice(0, 3);
    const b = normalized.slice(3, 6);
    const c = normalized.slice(6, 8);
    const d = normalized.slice(8, 10);
    return ["+90", a, b, c, d].filter(Boolean).join(" ");
  }
  return normalized;
}

function parseGuestCompositionCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildReservationGuestComposition(totalGuests, menGuests, womenGuests) {
  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) {
    return {
      reservation_men: "",
      reservation_women: "",
    };
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women === total) {
    return {
      reservation_men: String(men),
      reservation_women: String(women),
    };
  }

  const balancedMen = Math.ceil(total / 2);
  return {
    reservation_men: String(balancedMen),
    reservation_women: String(total - balancedMen),
  };
}

function buildGuestComposition(totalGuests, menGuests, womenGuests, keys = {}) {
  const menKey = keys.menKey || "men";
  const womenKey = keys.womenKey || "women";
  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) {
    return {
      [menKey]: "",
      [womenKey]: "",
    };
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women === total) {
    return {
      [menKey]: String(men),
      [womenKey]: String(women),
    };
  }

  const balancedMen = Math.ceil(total / 2);
  return {
    [menKey]: String(balancedMen),
    [womenKey]: String(total - balancedMen),
  };
}

function hasGuestCompositionValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeGuestCompositionFieldMode(value, fallback = "hidden") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["hidden", "optional", "required"].includes(normalized) ? normalized : fallback;
}

function normalizeGuestCompositionRestrictionRule(value, fallback = "no_restriction") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return [
    "no_restriction",
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
    "custom_rule_later",
  ].includes(normalized)
    ? normalized
    : fallback;
}

function getDefaultGuestCompositionRestrictionMessage(rule) {
  switch (normalizeGuestCompositionRestrictionRule(rule)) {
    case "male_only_groups_not_allowed":
      return "Male-only groups are not allowed for this reservation.";
    case "female_only_groups_not_allowed":
      return "Female-only groups are not allowed for this reservation.";
    case "at_least_1_female_required":
      return "At least 1 female guest is required for this reservation.";
    case "couple_only":
      return "Only mixed couples with equal men and women are allowed for this reservation.";
    default:
      return "Guest composition does not match the reservation policy.";
  }
}

function resolveGuestCompositionPolicyMessage(message, fallbackRule, translate) {
  const t = typeof translate === "function" ? translate : (value) => value;
  const trimmedMessage = String(message || "").trim();
  if (trimmedMessage) return t(trimmedMessage);
  return t(getDefaultGuestCompositionRestrictionMessage(fallbackRule));
}

function buildGuestCountOptions(maxGuests, evenOnly = false) {
  const limit = Math.max(0, Math.floor(Number(maxGuests) || 0));
  const options = [];
  for (let count = 1; count <= limit; count += 1) {
    if (evenOnly && count % 2 !== 0) continue;
    options.push(count);
  }
  return options;
}

function normalizeGuestCountSelection(value, options = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  if (options.includes(parsed)) return String(parsed);
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (options[index] <= parsed) return String(options[index]);
  }
  return options.length > 0 ? String(options[0]) : "";
}

function guestCompositionRuleRequiresInput(rule) {
  const normalizedRule = normalizeGuestCompositionRestrictionRule(
    rule,
    "no_restriction"
  );
  return [
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
  ].includes(normalizedRule);
}

function getGuestCompositionValidationError({
  enabled,
  fieldMode,
  restrictionRule,
  validationMessage,
  totalGuests,
  menGuests,
  womenGuests,
  translate,
}) {
  if (!enabled) return "";
  const t = typeof translate === "function" ? translate : (value) => value;

  const normalizedRule = normalizeGuestCompositionRestrictionRule(
    restrictionRule,
    "no_restriction"
  );
  const normalizedMode = normalizeGuestCompositionFieldMode(fieldMode, "hidden");
  const effectiveMode = guestCompositionRuleRequiresInput(normalizedRule)
    ? "required"
    : normalizedMode;
  if (effectiveMode === "hidden") return "";

  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) return "";

  const policyMessage =
    String(validationMessage || "").trim() ||
    t(getDefaultGuestCompositionRestrictionMessage(normalizedRule));
  if (normalizedRule === "couple_only" && total % 2 !== 0) {
    return policyMessage;
  }

  const hasInput = hasGuestCompositionValue(menGuests) || hasGuestCompositionValue(womenGuests);
  if (effectiveMode === "optional" && !hasInput) return "";
  if (!hasInput) {
    return guestCompositionRuleRequiresInput(normalizedRule)
      ? policyMessage
      : t("Please complete guest composition to continue.");
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women !== total) {
    return t("Guest composition must match guest count.");
  }

  let blocked = false;
  switch (normalizedRule) {
    case "male_only_groups_not_allowed":
      blocked = men > 0 && women === 0;
      break;
    case "female_only_groups_not_allowed":
      blocked = women > 0 && men === 0;
      break;
    case "at_least_1_female_required":
      blocked = women < 1;
      break;
    case "couple_only":
      blocked = total % 2 !== 0 || men !== women || men < 1 || women < 1;
      break;
    case "custom_rule_later":
    case "no_restriction":
    default:
      blocked = false;
      break;
  }

  if (!blocked) return "";
  return policyMessage;
}

function normalizeQrTableNumberList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
}

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

const QR_MENU_BRANDING_CACHE_PREFIX = "qr-menu-branding-cache:";
const QR_MENU_BRANDING_UPDATED_EVENT = "qr:branding-cache-updated";

function getQrMenuBrandingCacheKey(identifier) {
  const value = String(identifier || "").trim();
  return value ? `${QR_MENU_BRANDING_CACHE_PREFIX}${value}` : "";
}

function readCachedQrMenuBranding(identifier) {
  if (typeof window === "undefined") return null;
  const key = getQrMenuBrandingCacheKey(identifier);
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedQrMenuBranding(identifier, customization) {
  if (typeof window === "undefined") return;
  const normalizedIdentifier = String(identifier || "").trim();
  const key = getQrMenuBrandingCacheKey(normalizedIdentifier);
  if (!key || !customization || typeof customization !== "object") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(customization));
  } catch {
    // Ignore storage quota/privacy errors and continue with in-memory state.
  }

  try {
    window.dispatchEvent(
      new CustomEvent(QR_MENU_BRANDING_UPDATED_EVENT, {
        detail: {
          identifier: normalizedIdentifier,
          customization,
        },
      })
    );
  } catch {
    // Ignore custom event failures and continue with in-memory state.
  }
}

const apiUrl = (path) =>
  `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;

function resolveUploadedAsset(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const uploadsBase = API_BASE || "";
  return `${uploadsBase}/uploads/${value.replace(/^\/?uploads\//, "")}`;
}

function resolveYouTubeEmbedUrl(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = String(url.hostname || "").toLowerCase();
    let videoId = "";
    if (host.includes("youtu.be")) {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host.includes("youtube.com")) {
      videoId =
        url.searchParams.get("v") ||
        url.pathname.split("/").filter(Boolean).slice(-1)[0] ||
        "";
    }
    if (!videoId) return "";
    return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return "";
  }
}

function showQrCartToast(message) {
  toast.success(message, {
    duration: 2400,
    position: "top-center",
    style: {
      borderRadius: "16px",
      border: "1px solid rgba(15, 23, 42, 0.08)",
      background: "rgba(15, 23, 42, 0.96)",
      color: "#fff",
      padding: "12px 16px",
      boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
      fontSize: "14px",
      fontWeight: 600,
    },
    iconTheme: {
      primary: "#10B981",
      secondary: "#fff",
    },
  });
}

function GuestWelcomeAuthModal({
  open,
  view,
  onViewChange,
  onClose,
  onAppleLogin,
  onGoogleLogin,
  onLogin,
  onRegister,
  t,
  brandName,
  accentColor = "#111827",
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#4F46E5");
  const panelBackground = `radial-gradient(circle at top left, rgba(255,255,255,0.96), ${
    toRgba(resolvedAccentColor, 0.14) || "rgba(79,70,229,0.14)"
  } 48%, ${toRgba(resolvedAccentColor, 0.24) || "rgba(79,70,229,0.24)"} 100%)`;
  const panelGlowStart = toRgba(resolvedAccentColor, 0.24) || "rgba(79,70,229,0.24)";
  const panelGlowEnd = toRgba(resolvedAccentColor, 0.18) || "rgba(79,70,229,0.18)";

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1400]">
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
        className="absolute inset-0 bg-white sm:bg-[rgba(15,23,42,0.58)] sm:backdrop-blur-md"
      />

      <div className="relative z-[1401] flex min-h-full items-stretch justify-center p-0 sm:items-center sm:p-5">
        <div className="relative flex min-h-screen w-full max-w-none overflow-hidden rounded-none border-0 bg-white shadow-none sm:max-h-[92vh] sm:min-h-0 sm:max-w-[1040px] sm:rounded-[34px] sm:border sm:border-white/40 sm:bg-white/90 sm:shadow-[0_40px_120px_rgba(15,23,42,0.35)] sm:backdrop-blur-2xl dark:bg-neutral-950 dark:sm:border-white/10 dark:sm:bg-neutral-950/92">
          <div
            className="relative hidden w-[42%] overflow-hidden border-r border-white/40 p-7 lg:flex lg:flex-col dark:border-white/10"
            style={{ backgroundImage: panelBackground }}
          >
            <div
              className="pointer-events-none absolute -left-10 top-0 h-40 w-40 rounded-full blur-3xl"
              style={{ backgroundColor: panelGlowStart }}
            />
            <div
              className="pointer-events-none absolute bottom-0 right-0 h-40 w-40 rounded-full blur-3xl"
              style={{ backgroundColor: panelGlowEnd }}
            />
            <div className="relative">
              <div
                className="inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] shadow-sm"
                style={{
                  borderColor: toRgba(resolvedAccentColor, 0.22) || resolvedAccentColor,
                  backgroundColor: toRgba(resolvedAccentColor, 0.08) || "rgba(255,255,255,0.8)",
                  color: resolvedAccentColor,
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t("Welcome, guest")}
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {brandName || t("QR Menu")}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                {t("Sign in to sync your profile, orders, and checkout details across visits.")}
              </p>
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  {t("My Orders")}
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  {t("Saved checkout details")}
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                  {t("Active and past orders")}
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col min-h-screen sm:min-h-0">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 transition hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
              aria-label={t("Close")}
            >
              ×
            </button>

            <div className="min-h-0 flex-1">
              {view === "register" ? (
                <RegisterPage
                  t={t}
                  onRegister={async (payload) => {
                    await onRegister?.(payload);
                    onClose?.();
                  }}
                  onGoogleLogin={onGoogleLogin}
                  onAppleLogin={onAppleLogin}
                  onGoLogin={() => onViewChange?.("login")}
                  onBack={onClose}
                  accentColor={accentColor}
                />
              ) : (
                <LoginPage
                  t={t}
                  onLogin={async (payload) => {
                    await onLogin?.(payload);
                    onClose?.();
                  }}
                  onGoogleLogin={onGoogleLogin}
                  onAppleLogin={onAppleLogin}
                  onGoRegister={() => onViewChange?.("register")}
                  onBack={onClose}
                  accentColor={accentColor}
                />
              )}
            </div>

            <div className="border-t border-slate-200/80 bg-white px-4 py-3 dark:border-white/10 dark:bg-neutral-950 sm:bg-white/85 sm:dark:bg-neutral-950/88">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:border-white/20 dark:hover:bg-white/10"
              >
                {t("Continue as Guest")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function resolveBrandingAsset(raw, fallback = "") {
  const value = String(raw || "").trim();
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/Beylogo")) return value;
  if (value.startsWith("/uploads/")) {
    return `${API_BASE || ""}${value}`;
  }
  if (value.startsWith("uploads/")) {
    return `${API_BASE || ""}/${value}`;
  }
  if (value.startsWith("/")) return value;
  return `${API_BASE || ""}/uploads/${value.replace(/^\/?uploads\//, "")}`;
}

function toAbsolutePublicUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  if (typeof window === "undefined") return value;
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function appendCacheVersion(rawUrl, version) {
  const url = String(rawUrl || "").trim();
  const normalizedVersion = String(version || "").trim();
  if (!url || !normalizedVersion) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(normalizedVersion)}`;
}

function formatConcertDisplayDateWithoutYear(value, locale) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = raw.includes("T") ? raw : `${raw}T00:00:00`;
  const parsed = new Date(source);

  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(locale || undefined, {
      month: "short",
      day: "numeric",
    }).format(parsed);
  }

  const normalized = raw.slice(0, 10);
  const [year, month, day] = normalized.split("-");
  if (year && month && day) return `${day}/${month}`;
  return normalized;
}

function formatConcertDisplayWeekday(value, locale) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const source = raw.includes("T") ? raw : `${raw}T00:00:00`;
  const parsed = new Date(source);

  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(locale || undefined, {
      weekday: "long",
    }).format(parsed);
  }

  const normalized = raw.slice(0, 10);
  const [year, month, day] = normalized.split("-").map(Number);
  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    const fallbackDate = new Date(year, month - 1, day);
    if (!Number.isNaN(fallbackDate.getTime())) {
      return new Intl.DateTimeFormat(locale || undefined, {
        weekday: "long",
      }).format(fallbackDate);
    }
  }
  return "";
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

function toRgba(value, alpha) {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

const QR_MENU_FONT_FAMILIES = {
  gotham: '"Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-thin": '"Gotham Thin", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-light": '"Gotham Light", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-book": '"Gotham Book", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-medium": '"Gotham Medium", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-ultra": '"Gotham Ultra", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-narrow-thin": '"Gotham Narrow Thin", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-narrow-book": '"Gotham Narrow Book", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-narrow-black": '"Gotham Narrow Black", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  "gotham-narrow-ultra": '"Gotham Narrow Ultra", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  segoe: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  avenir: '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif',
  helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  verdana: "Verdana, Geneva, sans-serif",
  tahoma: 'Tahoma, "Segoe UI", sans-serif',
  trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  garamond: 'Garamond, "Times New Roman", serif',
  palatino: '"Palatino Linotype", Palatino, serif',
  courier: '"Courier New", Courier, monospace',
  lucida: '"Lucida Sans Unicode", "Lucida Grande", "Segoe UI", sans-serif',
  mono: 'Menlo, Consolas, Monaco, "Liberation Mono", "Courier New", monospace',
};

function resolveQrMenuFontFamily(value) {
  const key = String(value || "").trim().toLowerCase();
  return QR_MENU_FONT_FAMILIES[key] || QR_MENU_FONT_FAMILIES.gotham;
}

const QR_PREFIX = "qr_";
const QR_TOKEN_KEY = "qr_token";
const normalizeReservationStatus = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
const isCheckedInReservationStatus = (value) => {
  const normalized = normalizeReservationStatus(value);
  return normalized === "checked_in" || normalized === "checkedin" || normalized === "checkin";
};
const formatCurrentLocalYmd = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const normalizeEntryDateYmd = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const ymdMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymdMatch?.[1]) return ymdMatch[1];
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
const isCancelledLikeStatus = (status) =>
  ["canceled", "cancelled", "deleted", "void"].includes(
    String(status || "").toLowerCase()
  );
const isFinishedLikeStatus = (status) =>
  ["delivered", "served", "closed", "completed"].includes(
    String(status || "").toLowerCase()
  );
const extractCancellationReason = (source) => {
  if (!source || typeof source !== "object") return "";
  return String(
    source?.cancellation_reason ||
      source?.cancel_reason ||
      source?.cancelReason ||
      source?.cancellationReason ||
      source?.delete_reason ||
      source?.deletion_reason ||
      source?.deleteReason ||
      source?.deletionReason ||
      source?.payment_cancellation_reason ||
      source?.payment_cancel_reason ||
      source?.paymentCancellationReason ||
      source?.paymentCancelReason ||
      source?.cancel_note ||
      source?.cancellation_note ||
      source?.concert_booking_reason ||
      source?.concertBookingReason ||
      source?.reason ||
      ""
  ).trim();
};
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
      order?.reservation_status ||
      order?.reservationStatus ||
      nested?.id ||
      nested?.reservation_id ||
      nested?.reservationId ||
      nested?.reservation_date ||
      nested?.reservationDate ||
      nested?.reservation_time ||
      nested?.reservationTime ||
      nested?.status ||
      nested?.reservation_status ||
      nested?.reservationStatus
  );
};
const getReservationSlotDateYmd = (order) => {
  if (!order || typeof order !== "object") return "";
  const nested =
    order?.reservation && typeof order.reservation === "object" ? order.reservation : null;
  return normalizeEntryDateYmd(
    order?.reservation_date ??
      order?.reservationDate ??
      order?.event_date ??
      order?.eventDate ??
      nested?.reservation_date ??
      nested?.reservationDate ??
      nested?.event_date ??
      nested?.eventDate ??
      ""
  );
};
const isReservationRelevantForCurrentDay = (order, fallbackStatus = null) => {
  if (!hasReservationPayload(order)) return false;
  const nested =
    order?.reservation && typeof order.reservation === "object" ? order.reservation : null;
  const fallback = normalizeReservationStatus(fallbackStatus);
  if (
    order?.checked_in === true ||
    nested?.checked_in === true ||
    [
      order?.status,
      order?.reservation_status,
      order?.reservationStatus,
      nested?.status,
      nested?.reservation_status,
      nested?.reservationStatus,
      fallback,
    ].some((value) => isCheckedInReservationStatus(value))
  ) {
    return true;
  }
  const bookingDateYmd = getReservationSlotDateYmd(order);
  if (!bookingDateYmd) return true;
  return bookingDateYmd === formatCurrentLocalYmd();
};
const isReservationPendingCheckIn = (order, fallbackStatus = null) => {
  if (!order || typeof order !== "object") return false;
  const nested =
    order?.reservation && typeof order.reservation === "object" ? order.reservation : null;
  const directStatus = normalizeReservationStatus(order?.status);
  const nestedStatus = normalizeReservationStatus(nested?.status);
  const flatReservationStatus = normalizeReservationStatus(
    order?.reservation_status ??
      order?.reservationStatus ??
      nested?.reservation_status ??
      nested?.reservationStatus
  );
  const fallback = normalizeReservationStatus(fallbackStatus);
  const status = directStatus || nestedStatus || flatReservationStatus || fallback;
  const hasReservationContext = hasReservationPayload(order);
  if (!hasReservationContext) return false;
  if (!isReservationRelevantForCurrentDay(order, fallbackStatus)) return false;
  if (
    order?.checked_in === true ||
    nested?.checked_in === true ||
    [status, directStatus, nestedStatus, flatReservationStatus, fallback].some((value) =>
      isCheckedInReservationStatus(value)
    )
  ) {
    return false;
  }
  if (
    isCancelledLikeStatus(status) ||
    isCancelledLikeStatus(nestedStatus) ||
    isCancelledLikeStatus(flatReservationStatus)
  ) {
    return false;
  }
  const orderType = String(
    order?.order_type ?? order?.orderType ?? nested?.order_type ?? nested?.orderType ?? ""
  ).toLowerCase();
  if (
    status === "reserved" ||
    nestedStatus === "reserved" ||
    flatReservationStatus === "reserved" ||
    orderType === "reservation"
  ) {
    return true;
  }
  // Keep reservation lock for any pre-checkin state (including transient "paid/closed" before restore).
  return true;
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
  if (isIos()) return "ios";
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
      const base = typeof window !== "undefined" ? window.location.origin : PUBLIC_RESTAURANT_BASE_URL;
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
    "Phone (+90 555 555 55 55)": "Phone (+90 555 555 55 55)",
    Address: "Address",
    "Add item": "Add item",
    "Reserve now": "Reserve now",
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
      "Continue Shopping": "Continue Shopping",
    "Dine in": "Dine in",
    "Order Another": "Order Another",
    "Order Again": "Order Again",
    Table: "Table",
    Capacity: "Capacity",
    Type: "Type",
    Flexible: "Flexible",
    "Main floor": "Main floor",
    "Select Areas": "Select Areas",
    "Choose your table": "Choose your table",
    "Select table": "Select table",
    "Confirm table": "Confirm table",
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
    "Guest composition": "Guest composition",
    "Male-only groups are not allowed for this reservation.": "Male-only groups are not allowed for this reservation.",
    "Female-only groups are not allowed for this reservation.": "Female-only groups are not allowed for this reservation.",
    "At least 1 female guest is required for this reservation.": "At least 1 female guest is required for this reservation.",
    "Only mixed couples with equal men and women are allowed for this reservation.": "Only mixed couples with equal men and women are allowed for this reservation.",
    "Guest composition does not match the reservation policy.": "Guest composition does not match the reservation policy.",
    "Please complete guest composition to continue.": "Please complete guest composition to continue.",
    "Guest composition must match guest count.": "Guest composition must match guest count.",
    Men: "Men",
    Women: "Women",
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
    "Please select a valid reservation time.": "Please select a valid reservation time.",
    "This table is currently occupied. Please select another table.": "This table is currently occupied. Please select another table.",
    "Reservation saved": "Reservation saved",
    "Failed to save reservation": "Failed to save reservation",
    "Table must be closed by staff first": "Table must be closed by staff first",
    Available: "Available",
    "Limited Availability": "Limited Availability",
    "Fully Booked": "Fully Booked",
    "Next Available": "Next Available",
    "Select Date": "Select Date",
    "Select Time": "Select Time",
    Duration: "Duration",
    "Event Time": "Event Time",
    "Entry Opens": "Entry Opens",
    "Entry Closes": "Entry Closes",
    "Auto-assign best table": "Auto-assign best table",
    "This event has already started.": "This event has already started.",
    Pickup: "Pickup",
    Home: "Home",
    Waiter: "Waiter",
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
    "Concert Tickets": "Concert Tickets",
    "Free concert": "Free concert",
    "Deactivated": "Deactivated",
    "Concert date is over. Booking is disabled.": "Concert date is over. Booking is disabled.",
    "Buy Ticket": "Buy Ticket",
    "Reserve Table": "Reserve Table",
    "Ticket Types / Packages": "Ticket Types / Packages",
    "Bank Transfer": "Bank Transfer",
    "Available table": "Available table",
    "No available concert tables in this area": "No available concert tables in this area",
    "Bank transfer reference (optional)": "Bank transfer reference (optional)",
    "Stamp my card": "Stamp my card",
    Reward: "Reward",
    "Free Menu Item": "Free Menu Item",
    "Popular This Week": "Popular This Week",
    Reviews: "Reviews",
    "No reviews yet.": "No reviews yet.",
    Featured: "Featured",
    "Order Status": "Order Status",
    "Order received": "Order received",
    "Order ready": "Order ready",
    "Order Cancelled": "Order Cancelled",
    "Sold Out": "Sold Out",
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
    "Awaiting confirm": "Awaiting confirm",
    Pending: "Pending",
    Open: "Open",
    Completed: "Completed",
    "Reservation pending check-in": "Reservation pending check-in",
    "Please check in at the restaurant to unlock ordering for this table.": "Please check in at the restaurant to unlock ordering for this table.",
    "Payment required before Close or Check Out.": "Payment required before Close or Check Out.",
    "Pending check-in": "Pending check-in",
    "Invoice #{{id}}": "Invoice #{{id}}",
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
    "Request Song": "Request Song",
    "Add a song to the queue": "Add a song to the queue",
    "Enter a song name and follow its queue number and live status updates here.": "Enter a song name and follow its queue number and live status updates here.",
    "Song name": "Song name",
    "Enter song name": "Enter song name",
    "Send Request": "Send Request",
    "Sending...": "Sending...",
    "Song request controls will appear here for checked-in guests.": "Song request controls will appear here for checked-in guests.",
    "You can request a new song after the current one is cancelled or closed.": "You can request a new song after the current one is cancelled or closed.",
    "Current song request is still active": "Current song request is still active",
    "Requests": "Requests",
    "No song requests yet.": "No song requests yet.",
    "Unknown song": "Unknown song",
    "Queue": "Queue",
    // ✅ Added translations
    "Share QR Menu": "Share QR Menu",
    "Save QR Menu to Phone": "Save QR Menu to Phone",
    "Tap here to install the menu as an app": "Tap here to install the menu as an app",
    "Add to Home Screen": "Add to Home Screen",
    "Download Qr": "Download Qr",
    "Install App": "Install App",
    "Download QR Image": "Download QR Image",
    "Share this menu with your guests.": "Share this menu with your guests.",
    "Choose what to do with this QR menu.": "Choose what to do with this QR menu.",
    "Download failed. Please try again.": "Download failed. Please try again.",
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
    Copy: "Copy",
    Copied: "Copied",
    Cancel: "Cancel",
    Email: "Email",
    Phone: "Phone",
    Username: "Username",
    Password: "Password",
    Save: "Save",
    Refresh: "Refresh",
    Guest: "Guest",
    Login: "Login",
    Logout: "Logout",
    Register: "Register",
    Menu: "Menu",
    "Header drawer": "Header drawer",
    "Member access": "Member access",
    "Welcome, guest": "Welcome, guest",
    "Sign in to sync your profile, orders, and checkout details across visits.": "Sign in to sync your profile, orders, and checkout details across visits.",
    "Continue as Guest": "Continue as Guest",
    "My Orders": "My Orders",
    "My Profile": "My Profile",
    "Login / Register": "Login / Register",
    "Login to sync profile and orders": "Login to sync profile and orders",
    "Active and past orders": "Active and past orders",
    "Saved checkout details": "Saved checkout details",
    "Sign out from this device": "Sign out from this device",
    "Access your account": "Access your account",
    "Support / Contact": "Support / Contact",
    "Contact support for help": "Contact support for help",
    "Support section will be available soon.": "Support section will be available soon.",
    "Email or username": "Email or username",
    "Email (optional)": "Email (optional)",
    "Full name": "Full name",
    "Address (optional)": "Address (optional)",
    "Create Account": "Create Account",
    "Login instead": "Login instead",
    "Registration failed": "Registration failed",
    "Unable to save profile": "Unable to save profile",
    "Profile updated.": "Profile updated.",
    "Loading orders...": "Loading orders...",
    "No orders": "No orders",
    Active: "Active",
    Past: "Past",
    "Failed to load orders": "Failed to load orders",
    "Please fill all required fields.": "Please fill all required fields.",
    "Please enter your phone number or email and password.": "Please enter your phone number or email and password.",
    "Email already registered.": "Email already registered.",
    "Username already in use.": "Username already in use.",
    "Please enter your credentials.": "Please enter your credentials.",
    "No account found for this phone number or email. Please register.": "No account found for this phone number or email. Please register.",
    "Invalid credentials.": "Invalid credentials.",
    "Please login first.": "Please login first.",
    "Profile not found.": "Profile not found.",
    "Live delivery": "Live delivery",
    "Follow my order": "Follow my order",
    "Updating": "Updating",
    "Very soon": "Very soon",
    "Waiting for update": "Waiting for update",
    "Updated": "Updated",
    "ago": "ago",
    "Updated just now": "Updated just now",
    "Updated earlier": "Updated earlier",
    DRV: "DRV",
    YOU: "YOU",
    Driver: "Driver",
    Destination: "Destination",
    "Your order is in the kitchen": "Your order is in the kitchen",
    "We will keep the ETA updated while everything is being prepared.": "We will keep the ETA updated while everything is being prepared.",
    "Estimated departure soon": "Estimated departure soon",
    "Your order is ready for dispatch": "Your order is ready for dispatch",
    "The driver handoff is about to begin.": "The driver handoff is about to begin.",
    "Your driver is already visible on the map": "Your driver is already visible on the map",
    "Your driver has been assigned": "Your driver has been assigned",
    "Follow the driver live even before the trip officially starts.": "Follow the driver live even before the trip officially starts.",
    "Departure is expected soon. We will switch to live movement as soon as coordinates arrive.": "Departure is expected soon. We will switch to live movement as soon as coordinates arrive.",
    "On the way": "On the way",
    "Your driver is heading to you": "Your driver is heading to you",
    "The map will keep updating automatically.": "The map will keep updating automatically.",
    "Arriving soon": "Arriving soon",
    "Your driver is almost there": "Your driver is almost there",
    "Please keep your phone nearby for the handoff.": "Please keep your phone nearby for the handoff.",
    "Your order has arrived": "Your order has arrived",
    "Tracking is complete.": "Tracking is complete.",
    "Dispatch is being prepared": "Dispatch is being prepared",
    "We are organizing your delivery": "We are organizing your delivery",
    "You can already check the driver position and estimated arrival.": "You can already check the driver position and estimated arrival.",
    "Searching/assigning driver. ETA will update as soon as dispatch is ready.": "Searching/assigning driver. ETA will update as soon as dispatch is ready.",
    "Tracking is no longer available for this order.": "Tracking is no longer available for this order.",
    "Unable to load live tracking right now.": "Unable to load live tracking right now.",
    "Live route": "Live route",
    "Loading live tracking...": "Loading live tracking...",
    "Your destination": "Your destination",
    "We are preparing the tracking view. Status and ETA will keep updating here.": "We are preparing the tracking view. Status and ETA will keep updating here.",
    "Route progress": "Route progress",
    "ETA and route will update automatically.": "ETA and route will update automatically.",
    "Delivery address will appear here once available.": "Delivery address will appear here once available.",
    "Driver location": "Driver location",
    "Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.": "Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.",
    "Preparing your order": "Preparing your order",
    "Order picked up": "Order picked up",
    items: "items",
    new: "New",
    confirmed: "Confirmed",
    pending: "Pending",
    open: "Open",
    preparing: "Preparing",
    ready: "Ready",
    delivered: "Delivered",
    closed: "Closed",
    completed: "Completed",
    reserved: "Reserved",
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
    "Phone (+90 555 555 55 55)": "Telefon (+90 555 555 55 55)",
    Address: "Adres",
    "Add item": "Urun ekle",
    "Reserve now": "Simdi rezerve et",
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
      "Continue Shopping": "Alışverişe Devam Et",
    "Dine in": "Restoranda",
    "Order Another": "Yeni Sipariş Ver",
    "Order Again": "Tekrar Sipariş Ver",
    Table: "Masa",
    Capacity: "Kapasite",
    Type: "Tür",
    Flexible: "Esnek",
    "Main floor": "Ana salon",
    "Select Areas": "Alan Seçin",
    "Choose your table": "Masanızı seçin",
    "Select table": "Masa seçin",
    "Confirm table": "Masayı onayla",
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
    "Guest composition": "Misafir dağılımı",
    "Male-only groups are not allowed for this reservation.": "Sadece erkeklerden oluşan gruplara bu rezervasyon için izin verilmez.",
    "Female-only groups are not allowed for this reservation.": "Sadece kadınlardan oluşan gruplara bu rezervasyon için izin verilmez.",
    "At least 1 female guest is required for this reservation.": "Bu rezervasyon için grupta en az 1 kadın misafir bulunmalıdır.",
    "Only mixed couples with equal men and women are allowed for this reservation.": "Bu rezervasyon için yalnızca eşit sayıda kadın ve erkekten oluşan çift gruplarına izin verilir.",
    "Guest composition does not match the reservation policy.": "Misafir dağılımı rezervasyon politikasına uymuyor.",
    "Please complete guest composition to continue.": "Devam etmek için misafir dağılımını tamamlayın.",
    "Guest composition must match guest count.": "Misafir dağılımı toplam misafir sayısıyla eşleşmelidir.",
    Men: "Erkek",
    Women: "Kadın",
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
    "Please select a valid reservation time.": "Lütfen geçerli bir rezervasyon saati seçin.",
    "This table is currently occupied. Please select another table.": "Bu masa şu anda dolu. Lütfen başka bir masa seçin.",
    "Reservation saved": "Rezervasyon kaydedildi",
    "Failed to save reservation": "Rezervasyon kaydedilemedi",
    "Table must be closed by staff first": "Önce personel masayı kapatmalıdır",
    Available: "Uygun",
    "Limited Availability": "Sınırlı müsaitlik",
    "Fully Booked": "Tam dolu",
    "Next Available": "Sonraki müsait saat",
    "Select Date": "Tarih seçin",
    "Select Time": "Saat seçin",
    Duration: "Süre",
    "Event Time": "Etkinlik saati",
    "Entry Opens": "Giriş açılır",
    "Entry Closes": "Giriş kapanır",
    "Auto-assign best table": "En uygun masayı otomatik ata",
    "This event has already started.": "Bu etkinlik zaten başladı.",
    Pickup: "Gel Al",
    Home: "Ana Sayfa",
    Waiter: "Garson",
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
    "Loyalty Card": "Abone Kartı",
    "Concert Tickets": "Konser Biletleri",
    "Free concert": "Ucretsiz konser",
    "Deactivated": "Deaktif",
    "Concert date is over. Booking is disabled.": "Konser tarihi geçtiği için rezervasyon devre dışı bırakıldı.",
    "Buy Ticket": "Bilet Al",
    "Reserve Table": "Masa Rezerve Et",
    "Ticket Types / Packages": "Bilet Türleri / Paketler",
    "Bank Transfer": "Banka Havalesi",
    "Available table": "Uygun masa",
    "No available concert tables in this area": "Bu alanda uygun konser masası yok",
    "Bank transfer reference (optional)": "Banka havale referansı (opsiyonel)",
    "Stamp my card": "Kartımı damgala",
    Reward: "Ödül",
    "Free Menu Item": "Ücretsiz Menü Ürünü",
    "Popular This Week": "Bu Haftanın Popülerleri",
    Reviews: "Yorumlar",
    "No reviews yet.": "Henüz yorum yok.",
    Featured: "Öne Çıkan",
    "Order Status": "Sipariş Durumu",
    "Order received": "Sipariş alındı",
    "Order ready": "Sipariş hazır",
    "Order Cancelled": "Sipariş iptal edildi",
    "Sold Out": "Tükendi",
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
    "Awaiting confirm": "Onay bekleniyor",
    Pending: "Bekliyor",
    Open: "Açık",
    Completed: "Tamamlandı",
    "Reservation pending check-in": "Rezervasyon check-in bekliyor",
    "Please check in at the restaurant to unlock ordering for this table.": "Bu masa için siparişi açmak üzere lütfen restoranda check-in yapın.",
    "Payment required before Close or Check Out.": "Kapatma veya Check Out işleminden önce ödeme gerekli.",
    "Pending check-in": "Check-in bekleniyor",
    "Invoice #{{id}}": "Fatura #{{id}}",
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
    "Request Song": "Şarkı İste",
    "Add a song to the queue": "Sıraya bir şarkı ekle",
    "Enter a song name and follow its queue number and live status updates here.": "Bir şarkı adı girin, sıra numarasını ve canlı durum güncellemelerini buradan takip edin.",
    "Song name": "Şarkı adı",
    "Enter song name": "Şarkı adını girin",
    "Send Request": "İsteği Gönder",
    "Sending...": "Gönderiliyor...",
    "Song request controls will appear here for checked-in guests.": "Şarkı istek kontrolleri check-in yapan misafirler için burada görünecek.",
    "You can request a new song after the current one is cancelled or closed.": "Mevcut şarkı iptal edilene veya kapanana kadar yeni bir şarkı isteyemezsiniz.",
    "Current song request is still active": "Mevcut şarkı isteği hâlâ aktif",
    "Requests": "İstekler",
    "No song requests yet.": "Henüz şarkı isteği yok.",
    "Unknown song": "Bilinmeyen şarkı",
    "Queue": "Sıra",
    // ✅ Added translations
    "Share QR Menu": "QR Menüyü Paylaş",
    "Save QR Menu to Phone": "QR Menüyü Telefona Kaydet",
    "Tap here to install the menu as an app": "Menüyü uygulama olarak yüklemek için buraya dokunun",
    "Add to Home Screen": "Ana Ekrana Ekle",
    "Download Qr": "QR İndir",
    "Install App": "Uygulamayı Yükle",
    "Download QR Image": "QR Görselini İndir",
    "Share this menu with your guests.": "Bu menüyü misafirlerinizle paylaşın.",
    "Choose what to do with this QR menu.": "Bu QR menü için ne yapmak istediğinizi seçin.",
    "Download failed. Please try again.": "İndirme başarısız oldu. Lütfen tekrar deneyin.",
    "Shop Hours": "Çalışma Saatleri",
    "Shop Closed": "Dükkan Kapalı",
    "Delivery Closed": "Paket Kapalı",
    Closed: "Kapalı",
    "Open now!": "Açık",
    "Scan Table QR": "Masa QR'ını Tara",
    "Scan the QR code on your table to continue.": "Devam etmek için masanızdaki QR kodunu tarayın.",
    "Invalid table QR code.": "Geçersiz masa QR kodu.",
    "This QR is for table": "Bu QR şu masa için",
    "Please scan table": "Lütfen şu masayı tarayın",
    "Camera permission is required.": "Kamera izni gereklidir.",
    Copy: "Kopyala",
    Copied: "Kopyalandı",
    Cancel: "İptal",
    Email: "E-posta",
    Phone: "Telefon",
    Username: "Kullanıcı adı",
    Password: "Şifre",
    Save: "Kaydet",
    Refresh: "Yenile",
    Guest: "Misafir",
    Login: "Giriş Yap",
    Logout: "Çıkış Yap",
    Register: "Kayıt Ol",
    Menu: "Menü",
    "Header drawer": "Yan menü",
    "Member access": "Üye girişi",
    "Welcome, guest": "Hos geldiniz, misafir",
    "Sign in to sync your profile, orders, and checkout details across visits.": "Profilinizi, siparişlerinizi ve ödeme bilgilerinizi ziyaretler arasında senkronize etmek için giriş yapın.",
    "Continue as Guest": "Misafir olarak devam et",
    "My Orders": "Siparişlerim",
    "My Profile": "Profilim",
    "Login / Register": "Giriş / Kayıt",
    "Login to sync profile and orders": "Profilinizi ve siparişlerinizi senkronize etmek için giriş yapın",
    "Active and past orders": "Aktif ve geçmiş siparişler",
    "Saved checkout details": "Kayıtlı ödeme ve teslimat bilgileri",
    "Sign out from this device": "Bu cihazdan çıkış yap",
    "Access your account": "Hesabınıza erişin",
    "Support / Contact": "Destek / İletişim",
    "Contact support for help": "Yardım için destekle iletişime geçin",
    "Support section will be available soon.": "Destek bölümü yakında kullanıma açılacak.",
    "Email or username": "E-posta veya kullanıcı adı",
    "Email (optional)": "E-posta (isteğe bağlı)",
    "Full name": "Ad soyad",
    "Address (optional)": "Adres (isteğe bağlı)",
    "Create Account": "Hesap Oluştur",
    "Login instead": "Bunun yerine giriş yap",
    "Registration failed": "Kayıt başarısız",
    "Unable to save profile": "Profil kaydedilemedi",
    "Profile updated.": "Profil güncellendi.",
    "Loading orders...": "Siparişler yükleniyor...",
    DRV: "KUR",
    YOU: "SIZ",
    Driver: "Kurye",
    Destination: "Teslimat noktası",
    "No orders": "Sipariş yok",
    Active: "Aktif",
    Past: "Geçmiş",
    "Failed to load orders": "Siparişler yüklenemedi",
    "Please fill all required fields.": "Lütfen tüm gerekli alanları doldurun.",
    "Please enter your phone number or email and password.": "Lütfen telefon numaranızı veya e-posta adresinizi ve şifrenizi girin.",
    "Email already registered.": "E-posta zaten kayıtlı.",
    "Username already in use.": "Kullanıcı adı zaten kullanılıyor.",
    "Please enter your credentials.": "Lütfen giriş bilgilerinizi girin.",
    "No account found for this phone number or email. Please register.": "Bu telefon numarası veya e-posta için hesap bulunamadı. Lütfen kayıt olun.",
    "Invalid credentials.": "Geçersiz giriş bilgileri.",
    "Please login first.": "Lütfen önce giriş yapın.",
    "Profile not found.": "Profil bulunamadı.",
    "Live delivery": "Canlı teslimat",
    "Follow my order": "Siparişimi takip et",
    "Updating": "Güncelleniyor",
    "Very soon": "Çok yakında",
    "Waiting for update": "Güncelleme bekleniyor",
    "Updated": "Güncellendi",
    "ago": "önce",
    "Updated just now": "Az önce güncellendi",
    "Updated earlier": "Daha önce güncellendi",
    "Your order is in the kitchen": "Siparişiniz mutfakta hazırlanıyor",
    "We will keep the ETA updated while everything is being prepared.": "Her şey hazırlanırken tahmini varış süresini güncel tutacağız.",
    "Estimated departure soon": "Tahmini çıkış yakında",
    "Your order is ready for dispatch": "Siparişiniz yola çıkmak için hazır",
    "The driver handoff is about to begin.": "Kurye teslim süreci birazdan başlayacak.",
    "Your driver is already visible on the map": "Kuryeniz haritada şimdiden görünüyor",
    "Your driver has been assigned": "Kuryeniz atandı",
    "Follow the driver live even before the trip officially starts.": "Yolculuk resmi olarak başlamadan önce bile kuryeyi canlı takip edin.",
    "Departure is expected soon. We will switch to live movement as soon as coordinates arrive.": "Çıkışın yakında olması bekleniyor. Konum gelir gelmez canlı takibe geçeceğiz.",
    "On the way": "Yolda",
    "Your driver is heading to you": "Kuryeniz size doğru geliyor",
    "The map will keep updating automatically.": "Harita otomatik olarak güncellenmeye devam edecek.",
    "Arriving soon": "Yakında kapınızda",
    "Your driver is almost there": "Kuryeniz neredeyse geldi",
    "Please keep your phone nearby for the handoff.": "Teslimat için lütfen telefonunuzu yakınınızda tutun.",
    "Your order has arrived": "Siparişiniz ulaştı",
    "Tracking is complete.": "Takip tamamlandı.",
    "Dispatch is being prepared": "Gönderim hazırlanıyor",
    "We are organizing your delivery": "Teslimatınızı organize ediyoruz",
    "You can already check the driver position and estimated arrival.": "Kurye konumunu ve tahmini varışı şimdiden kontrol edebilirsiniz.",
    "Searching/assigning driver. ETA will update as soon as dispatch is ready.": "Kurye aranıyor/atanıyor. Gönderim hazır olur olmaz tahmini süre güncellenecek.",
    "Tracking is no longer available for this order.": "Bu sipariş için takip artık kullanılamıyor.",
    "Unable to load live tracking right now.": "Canlı takip şu anda yüklenemiyor.",
    "Live route": "Canlı rota",
    "Loading live tracking...": "Canlı takip yükleniyor...",
    "Your destination": "Teslimat adresiniz",
    "We are preparing the tracking view. Status and ETA will keep updating here.": "Takip ekranı hazırlanıyor. Durum ve tahmini süre burada güncellenmeye devam edecek.",
    "Route progress": "Rota ilerlemesi",
    "ETA and route will update automatically.": "Tahmini süre ve rota otomatik güncellenecek.",
    "Delivery address will appear here once available.": "Teslimat adresi hazır olduğunda burada görünecek.",
    "Driver location": "Kurye konumu",
    "Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.": "Canlı konum geçici olarak kullanılamıyor. Bu sırada yedek tahmini süre ve durum gösteriliyor.",
    "Preparing your order": "Siparişiniz hazırlanıyor",
    "Order picked up": "Sipariş teslim alındı",
    items: "ürün",
    new: "Yeni",
    confirmed: "Onaylandı",
    pending: "Bekliyor",
    open: "Açık",
    preparing: "Hazırlanıyor",
    ready: "Hazır",
    delivered: "Teslim Edildi",
    closed: "Kapalı",
    completed: "Tamamlandı",
    reserved: "Rezerve",
  },
  de: {
    Information: "Informationen",
    Date: "Datum",
    "Add item": "Artikel hinzufugen",
    "Reserve now": "Jetzt reservieren",
    "Select Order Type": "Bestellart wählen",
    "Choose how you'd like to continue.": "Wählen Sie, wie Sie fortfahren möchten.",
    "Select how you'd like to order this item.": "Wählen Sie, wie Sie diesen Artikel bestellen möchten.",
    Search: "Suchen",
    "Voice Order": "Sprachbestellung",
    Categories: "Kategorien",
    "Loyalty Card": "Treuekarte",
    "Concert Tickets": "Konzerttickets",
    "Free concert": "Kostenloses Konzert",
    "Deactivated": "Deaktiviert",
    "Concert date is over. Booking is disabled.": "Das Konzertdatum ist vorbei. Buchung ist deaktiviert.",
    "Buy Ticket": "Ticket kaufen",
    "Reserve Table": "Tisch reservieren",
    "Ticket Types / Packages": "Ticketarten / Pakete",
    "Bank Transfer": "Banküberweisung",
    "Available table": "Verfügbarer Tisch",
    "No available concert tables in this area": "Keine verfügbaren Konzerttische in diesem Bereich",
    "Bank transfer reference (optional)": "Überweisungsreferenz (optional)",
    "Stamp my card": "Karte stempeln",
    Reward: "Belohnung",
    "Free Menu Item": "Kostenloser Menüartikel",
    "Popular This Week": "Diese Woche beliebt",
    Reviews: "Bewertungen",
    "No reviews yet.": "Noch keine Bewertungen.",
    Featured: "Empfohlen",
    "Order Status": "Bestellstatus",
    "Order received": "Bestellung erhalten",
    Preparing: "In Zubereitung",
    "Order ready": "Bestellung fertig",
    Delivered: "Geliefert",
    "Order Cancelled": "Bestellung storniert",
    "Sold Out": "Ausverkauft",
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
    "Awaiting confirm": "Bestätigung ausstehend",
    Pending: "Ausstehend",
    Open: "Offen",
    Completed: "Abgeschlossen",
    "Reservation pending check-in": "Reservierung wartet auf Check-in",
    "Please check in at the restaurant to unlock ordering for this table.": "Bitte checken Sie im Restaurant ein, um die Bestellung für diesen Tisch freizuschalten.",
    "Payment required before Close or Check Out.": "Vor dem Schließen oder Check-out ist eine Zahlung erforderlich.",
    "Pending check-in": "Check-in ausstehend",
    "Invoice #{{id}}": "Rechnung #{{id}}",
    Closed: "Geschlossen",
    Table: "Tisch",
    Capacity: "Kapazität",
    Type: "Typ",
    Flexible: "Flexibel",
    "Main floor": "Hauptbereich",
    "Select Areas": "Bereiche wählen",
    "Choose your table": "Wählen Sie Ihren Tisch",
    "Select table": "Tisch auswählen",
    "Confirm table": "Tisch bestätigen",
    Pickup: "Abholung",
    Delivery: "Lieferung",
    Home: "Startseite",
    Waiter: "Kellner",
    Time: "Zeit",
    Guests: "Gäste",
    "Guest composition": "Gästeverteilung",
    "Male-only groups are not allowed for this reservation.": "Reine Männergruppen sind für diese Reservierung nicht erlaubt.",
    "Female-only groups are not allowed for this reservation.": "Reine Frauengruppen sind für diese Reservierung nicht erlaubt.",
    "At least 1 female guest is required for this reservation.": "Für diese Reservierung ist mindestens 1 weiblicher Gast erforderlich.",
    "Only mixed couples with equal men and women are allowed for this reservation.": "Für diese Reservierung sind nur gemischte Paare mit gleicher Anzahl von Männern und Frauen erlaubt.",
    "Guest composition does not match the reservation policy.": "Die Gästeverteilung entspricht nicht der Reservierungsrichtlinie.",
    "Please complete guest composition to continue.": "Bitte vervollständigen Sie die Gästeverteilung, um fortzufahren.",
    "Guest composition must match guest count.": "Die Gästeverteilung muss mit der Gästeanzahl übereinstimmen.",
    Men: "Männer",
    Women: "Frauen",
    "Select Guests": "Gäste wählen",
    "Select guests": "Gäste wählen",
    "Select guests first": "Zuerst Gäste wählen",
    "Choose guest amount first": "Wählen Sie zuerst die Gästeanzahl",
    "Select guests on a table card to enable QR scan": "Wählen Sie Gäste auf einer Tischkarte, um den QR-Scan zu aktivieren",
    "Select Your Table": "Wählen Sie Ihren Tisch",
    Seats: "Sitze",
    "Reservation Time": "Reservierungszeit",
    "Please select a valid reservation time.": "Bitte wählen Sie eine gültige Reservierungszeit.",
    Available: "Verfügbar",
    "Limited Availability": "Begrenzte Verfügbarkeit",
    "Fully Booked": "Ausgebucht",
    "Next Available": "Nächste Verfügbarkeit",
    "Select Date": "Datum wählen",
    "Select Time": "Uhrzeit wählen",
    Duration: "Dauer",
    "Event Time": "Eventzeit",
    "Entry Opens": "Einlass ab",
    "Entry Closes": "Einlass bis",
    "Auto-assign best table": "Besten Tisch automatisch zuweisen",
    "This event has already started.": "Diese Veranstaltung hat bereits begonnen.",
    Payment: "Zahlung",
    Cash: "Bar",
    Total: "Gesamt",
    "Your Order": "Ihre Bestellung",
    "Order Again": "Erneut bestellen",
    Close: "Schließen",
    "Dine in": "Vor Ort",
    Note: "Notiz",
    "Share QR Menu": "QR-Menü teilen",
    "Save QR Menu to Phone": "QR-Menü auf dem Handy speichern",
    "Tap here to install the menu as an app": "Tippen Sie hier, um das Menü als App zu installieren",
    "Add to Home Screen": "Zum Startbildschirm hinzufügen",
    "Download Qr": "QR herunterladen",
    "Install App": "App installieren",
    "Download QR Image": "QR-Bild herunterladen",
    "Share this menu with your guests.": "Teilen Sie dieses Menü mit Ihren Gästen.",
    "Choose what to do with this QR menu.": "Wählen Sie, was Sie mit diesem QR-Menü tun möchten.",
    "Download failed. Please try again.": "Download fehlgeschlagen. Bitte versuchen Sie es erneut.",
    DRV: "KUR",
    YOU: "DU",
    Driver: "Fahrer",
    Destination: "Ziel",
    "Scan Table QR": "Tisch-QR scannen",
    "Scan the QR code on your table to continue.": "Scannen Sie den QR-Code auf Ihrem Tisch, um fortzufahren.",
    "Invalid table QR code.": "Ungültiger Tisch-QR-Code.",
    "This QR is for table": "Dieser QR ist für Tisch",
    "Please scan table": "Bitte scannen Sie Tisch",
    "Camera permission is required.": "Kameraberechtigung ist erforderlich.",
    Copy: "Kopieren",
    Copied: "Kopiert",
    Cancel: "Abbrechen",
    Email: "E-Mail",
    Phone: "Telefon",
    "Phone (+90 555 555 55 55)": "Telefon (+90 555 555 55 55)",
    Username: "Benutzername",
    Password: "Passwort",
    Save: "Speichern",
    Refresh: "Aktualisieren",
    Guest: "Gast",
    Login: "Anmelden",
    Logout: "Abmelden",
    Register: "Registrieren",
    Menu: "Menü",
    "Header drawer": "Seitenmenü",
    "Member access": "Mitgliederzugang",
    "Welcome, guest": "Willkommen, Gast",
    "Sign in to sync your profile, orders, and checkout details across visits.": "Melden Sie sich an, um Profil, Bestellungen und Checkout-Daten zwischen Besuchen zu synchronisieren.",
    "Continue as Guest": "Als Gast fortfahren",
    "My Orders": "Meine Bestellungen",
    "My Profile": "Mein Profil",
    "Login / Register": "Anmelden / Registrieren",
    "Login to sync profile and orders": "Zum Synchronisieren von Profil und Bestellungen anmelden",
    "Active and past orders": "Aktive und vergangene Bestellungen",
    "Saved checkout details": "Gespeicherte Checkout-Daten",
    "Sign out from this device": "Von diesem Gerät abmelden",
    "Access your account": "Auf Ihr Konto zugreifen",
    "Support / Contact": "Support / Kontakt",
    "Contact support for help": "Support für Hilfe kontaktieren",
    "Support section will be available soon.": "Der Support-Bereich ist bald verfügbar.",
    "Email or username": "E-Mail oder Benutzername",
    "Create Account": "Konto erstellen",
    "Login instead": "Stattdessen anmelden",
    "Registration failed": "Registrierung fehlgeschlagen",
    "Unable to save profile": "Profil konnte nicht gespeichert werden",
    "Profile updated.": "Profil aktualisiert.",
    "Loading orders...": "Bestellungen werden geladen...",
    "No orders": "Keine Bestellungen",
    Active: "Aktiv",
    Past: "Vergangen",
    "Failed to load orders": "Bestellungen konnten nicht geladen werden",
    "Please fill all required fields.": "Bitte alle Pflichtfelder ausfüllen.",
    "Please enter your phone number or email and password.": "Bitte geben Sie Ihre Telefonnummer oder E-Mail-Adresse und Ihr Passwort ein.",
    "Email already registered.": "E-Mail ist bereits registriert.",
    "Username already in use.": "Benutzername wird bereits verwendet.",
    "Email (optional)": "E-Mail (optional)",
    "Full name": "Vollständiger Name",
    "Address (optional)": "Adresse (optional)",
    "Please enter your credentials.": "Bitte Zugangsdaten eingeben.",
    "No account found for this phone number or email. Please register.": "Für diese Telefonnummer oder E-Mail wurde kein Konto gefunden. Bitte registrieren Sie sich.",
    "Invalid credentials.": "Ungültige Zugangsdaten.",
    "Please login first.": "Bitte zuerst anmelden.",
    "Profile not found.": "Profil nicht gefunden.",
    "Live delivery": "Live-Lieferung",
    "Follow my order": "Meine Bestellung verfolgen",
    "Updating": "Wird aktualisiert",
    "Very soon": "Sehr bald",
    "Waiting for update": "Warte auf Aktualisierung",
    "Updated": "Aktualisiert",
    "ago": "zuvor",
    "Updated just now": "Gerade eben aktualisiert",
    "Updated earlier": "Früher aktualisiert",
    "Your order is in the kitchen": "Ihre Bestellung wird in der Küche vorbereitet",
    "We will keep the ETA updated while everything is being prepared.": "Wir halten die voraussichtliche Ankunftszeit aktuell, während alles vorbereitet wird.",
    "Estimated departure soon": "Voraussichtliche Abfahrt bald",
    "Your order is ready for dispatch": "Ihre Bestellung ist bereit für den Versand",
    "The driver handoff is about to begin.": "Die Übergabe an den Fahrer beginnt gleich.",
    "Your driver is already visible on the map": "Ihr Fahrer ist bereits auf der Karte sichtbar",
    "Your driver has been assigned": "Ihr Fahrer wurde zugewiesen",
    "Follow the driver live even before the trip officially starts.": "Verfolgen Sie den Fahrer live, noch bevor die Fahrt offiziell beginnt.",
    "Departure is expected soon. We will switch to live movement as soon as coordinates arrive.": "Die Abfahrt wird in Kürze erwartet. Sobald Koordinaten vorliegen, wechseln wir zur Live-Bewegung.",
    "On the way": "Unterwegs",
    "Your driver is heading to you": "Ihr Fahrer ist auf dem Weg zu Ihnen",
    "The map will keep updating automatically.": "Die Karte wird sich automatisch weiter aktualisieren.",
    "Arriving soon": "Kommt bald an",
    "Your driver is almost there": "Ihr Fahrer ist fast da",
    "Please keep your phone nearby for the handoff.": "Bitte halten Sie Ihr Telefon für die Übergabe bereit.",
    "Your order has arrived": "Ihre Bestellung ist angekommen",
    "Tracking is complete.": "Die Sendungsverfolgung ist abgeschlossen.",
    "Dispatch is being prepared": "Der Versand wird vorbereitet",
    "We are organizing your delivery": "Wir organisieren Ihre Lieferung",
    "You can already check the driver position and estimated arrival.": "Sie können die Fahrerposition und die geschätzte Ankunft bereits prüfen.",
    "Searching/assigning driver. ETA will update as soon as dispatch is ready.": "Fahrer wird gesucht/zugewiesen. Die ETA wird aktualisiert, sobald der Versand bereit ist.",
    "Tracking is no longer available for this order.": "Die Sendungsverfolgung ist für diese Bestellung nicht mehr verfügbar.",
    "Unable to load live tracking right now.": "Die Live-Verfolgung kann derzeit nicht geladen werden.",
    "Live route": "Live-Route",
    "Loading live tracking...": "Live-Verfolgung wird geladen...",
    "Request Song": "Song wünschen",
    "Add a song to the queue": "Einen Song zur Warteschlange hinzufügen",
    "Enter a song name and follow its queue number and live status updates here.": "Gib einen Songnamen ein und verfolge hier seine Warteschlangennummer und Live-Statusupdates.",
    "Song name": "Songname",
    "Enter song name": "Songnamen eingeben",
    "Send Request": "Anfrage senden",
    "Sending...": "Wird gesendet...",
    "Song request controls will appear here for checked-in guests.": "Die Songwunsch-Steuerung erscheint hier für eingecheckte Gäste.",
    "You can request a new song after the current one is cancelled or closed.": "Du kannst erst dann einen neuen Song anfragen, wenn der aktuelle storniert oder geschlossen wurde.",
    "Current song request is still active": "Der aktuelle Songwunsch ist noch aktiv",
    "Requests": "Anfragen",
    "No song requests yet.": "Noch keine Songwünsche.",
    "Unknown song": "Unbekannter Song",
    "Queue": "Warteschlange",
    "Your destination": "Ihr Zielort",
    "We are preparing the tracking view. Status and ETA will keep updating here.": "Wir bereiten die Tracking-Ansicht vor. Status und ETA werden hier weiter aktualisiert.",
    "Route progress": "Routenfortschritt",
    "ETA and route will update automatically.": "ETA und Route werden automatisch aktualisiert.",
    "Delivery address will appear here once available.": "Die Lieferadresse wird hier angezeigt, sobald sie verfügbar ist.",
    "Driver location": "Fahrerstandort",
    "Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.": "Live-Koordinaten sind vorübergehend nicht verfügbar. In der Zwischenzeit werden Ersatz-ETA und Status angezeigt.",
    "Preparing your order": "Ihre Bestellung wird vorbereitet",
    "Order picked up": "Bestellung abgeholt",
    items: "Artikel",
    new: "Neu",
    confirmed: "Bestätigt",
    pending: "Ausstehend",
    open: "Offen",
    preparing: "In Zubereitung",
    ready: "Bereit",
    delivered: "Geliefert",
    closed: "Geschlossen",
    completed: "Abgeschlossen",
    reserved: "Reserviert",
  },
  fr: {
    Information: "Informations",
    Date: "Date",
    "Add item": "Ajouter un article",
    "Reserve now": "Reserver maintenant",
    "Select Order Type": "Sélectionnez le type de commande",
    "Choose how you'd like to continue.": "Choisissez comment vous souhaitez continuer.",
    "Select how you'd like to order this item.": "Choisissez comment vous souhaitez commander cet article.",
    Search: "Rechercher",
    "Voice Order": "Commande vocale",
    Categories: "Catégories",
    "Loyalty Card": "Carte fidélité",
    "Concert Tickets": "Billets de concert",
    "Free concert": "Concert gratuit",
    "Deactivated": "Désactivé",
    "Concert date is over. Booking is disabled.": "La date du concert est passée. La réservation est désactivée.",
    "Buy Ticket": "Acheter un billet",
    "Reserve Table": "Réserver une table",
    "Ticket Types / Packages": "Types de billets / Forfaits",
    "Bank Transfer": "Virement bancaire",
    "Available table": "Table disponible",
    "No available concert tables in this area": "Aucune table de concert disponible dans cette zone",
    "Bank transfer reference (optional)": "Référence du virement bancaire (optionnel)",
    "Stamp my card": "Tamponner ma carte",
    Reward: "Récompense",
    "Free Menu Item": "Article du menu gratuit",
    "Popular This Week": "Populaire cette semaine",
    Reviews: "Avis",
    "No reviews yet.": "Aucun avis pour le moment.",
    Featured: "En vedette",
    "Order Status": "Statut de la commande",
    "Order received": "Commande reçue",
    Preparing: "Préparation",
    "Order ready": "Commande prête",
    Delivered: "Livré",
    "Order Cancelled": "Commande annulée",
    "Sold Out": "Complet",
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
    "Awaiting confirm": "En attente de confirmation",
    Pending: "En attente",
    Open: "Ouvert",
    Completed: "Terminé",
    "Reservation pending check-in": "Réservation en attente de check-in",
    "Please check in at the restaurant to unlock ordering for this table.": "Veuillez effectuer le check-in au restaurant pour activer la commande de cette table.",
    "Payment required before Close or Check Out.": "Paiement requis avant Fermer ou Check-out.",
    "Pending check-in": "Check-in en attente",
    "Invoice #{{id}}": "Facture n°{{id}}",
    Closed: "Fermé",
    Table: "Table",
    Capacity: "Capacité",
    Type: "Type",
    Flexible: "Flexible",
    "Main floor": "Salle principale",
    "Select Areas": "Sélectionner des zones",
    "Choose your table": "Choisissez votre table",
    "Select table": "Sélectionner une table",
    "Confirm table": "Confirmer la table",
    Pickup: "À emporter",
    Delivery: "Livraison",
    Home: "Accueil",
    Waiter: "Serveur",
    Time: "Temps",
    Guests: "Invités",
    "Guest composition": "Répartition des invités",
    "Male-only groups are not allowed for this reservation.": "Les groupes composés uniquement d'hommes ne sont pas autorisés pour cette réservation.",
    "Female-only groups are not allowed for this reservation.": "Les groupes composés uniquement de femmes ne sont pas autorisés pour cette réservation.",
    "At least 1 female guest is required for this reservation.": "Au moins 1 invitée est requise pour cette réservation.",
    "Only mixed couples with equal men and women are allowed for this reservation.": "Seuls les couples mixtes avec un nombre égal d'hommes et de femmes sont autorisés pour cette réservation.",
    "Guest composition does not match the reservation policy.": "La répartition des invités ne correspond pas à la politique de réservation.",
    "Please complete guest composition to continue.": "Veuillez compléter la répartition des invités pour continuer.",
    "Guest composition must match guest count.": "La répartition des invités doit correspondre au nombre d'invités.",
    Men: "Hommes",
    Women: "Femmes",
    "Select Guests": "Choisir des invités",
    "Select guests": "Choisir des invités",
    "Select guests first": "Choisissez d'abord les invités",
    "Choose guest amount first": "Choisissez d'abord le nombre d'invités",
    "Select guests on a table card to enable QR scan": "Sélectionnez les invités sur une carte de table pour activer le scan QR",
    "Select Your Table": "Choisissez votre table",
    Seats: "Places",
    "Reservation Time": "Heure de réservation",
    "Please select a valid reservation time.": "Veuillez sélectionner une heure de réservation valide.",
    Available: "Disponible",
    "Limited Availability": "Disponibilité limitée",
    "Fully Booked": "Complet",
    "Next Available": "Prochaine disponibilité",
    "Select Date": "Sélectionner la date",
    "Select Time": "Sélectionner l'heure",
    Duration: "Durée",
    "Event Time": "Heure de l'événement",
    "Entry Opens": "Entrée ouvre à",
    "Entry Closes": "Entrée ferme à",
    "Auto-assign best table": "Attribuer automatiquement la meilleure table",
    "This event has already started.": "Cet événement a déjà commencé.",
    Payment: "Paiement",
    Cash: "Espèces",
    Total: "Total",
    "Your Order": "Votre commande",
    "Order Again": "Commander à nouveau",
    Close: "Fermer",
    "Dine in": "Sur place",
    Note: "Note",
    "Share QR Menu": "Partager le menu QR",
    "Save QR Menu to Phone": "Enregistrer le menu QR sur le téléphone",
    "Tap here to install the menu as an app": "Appuyez ici pour installer le menu comme une application",
    "Add to Home Screen": "Ajouter à l'écran d'accueil",
    "Download Qr": "Télécharger QR",
    "Install App": "Installer l'application",
    "Download QR Image": "Télécharger l'image QR",
    "Share this menu with your guests.": "Partagez ce menu avec vos invités.",
    "Choose what to do with this QR menu.": "Choisissez ce que vous voulez faire avec ce menu QR.",
    "Download failed. Please try again.": "Le téléchargement a échoué. Veuillez réessayer.",
    "Scan Table QR": "Scanner le QR de la table",
    "Scan the QR code on your table to continue.": "Scannez le code QR sur votre table pour continuer.",
    "Invalid table QR code.": "Code QR de table invalide.",
    "This QR is for table": "Ce QR est pour la table",
    "Please scan table": "Veuillez scanner la table",
    "Camera permission is required.": "L'autorisation de la caméra est requise.",
    Copy: "Copier",
    Copied: "Copié",
    Cancel: "Annuler",
    Email: "E-mail",
    Phone: "Téléphone",
    "Phone (+90 555 555 55 55)": "Téléphone (+90 555 555 55 55)",
    Username: "Nom d'utilisateur",
    Password: "Mot de passe",
    Save: "Enregistrer",
    Refresh: "Actualiser",
    Guest: "Invité",
    Login: "Connexion",
    Logout: "Déconnexion",
    Register: "Inscription",
    Menu: "Menu",
    "Header drawer": "Menu latéral",
    "Member access": "Accès membre",
    "Welcome, guest": "Bienvenue, invité",
    "Sign in to sync your profile, orders, and checkout details across visits.": "Connectez-vous pour synchroniser votre profil, vos commandes et vos informations de paiement entre vos visites.",
    "Continue as Guest": "Continuer en invité",
    "My Orders": "Mes commandes",
    "My Profile": "Mon profil",
    "Login / Register": "Connexion / Inscription",
    "Login to sync profile and orders": "Connectez-vous pour synchroniser votre profil et vos commandes",
    "Active and past orders": "Commandes actives et passées",
    "Saved checkout details": "Informations de commande enregistrées",
    "Sign out from this device": "Se déconnecter de cet appareil",
    "Access your account": "Accéder à votre compte",
    "Support / Contact": "Support / Contact",
    "Contact support for help": "Contacter le support pour obtenir de l'aide",
    "Support section will be available soon.": "La section support sera bientôt disponible.",
    "Email or username": "E-mail ou nom d'utilisateur",
    "Create Account": "Créer un compte",
    "Login instead": "Se connecter à la place",
    "Registration failed": "Échec de l'inscription",
    "Unable to save profile": "Impossible d'enregistrer le profil",
    "Profile updated.": "Profil mis à jour.",
    "Loading orders...": "Chargement des commandes...",
    "No orders": "Aucune commande",
    Active: "Actif",
    Past: "Passées",
    "Failed to load orders": "Impossible de charger les commandes",
    "Please fill all required fields.": "Veuillez remplir tous les champs obligatoires.",
    "Please enter your phone number or email and password.": "Veuillez saisir votre numéro de téléphone ou votre e-mail ainsi que votre mot de passe.",
    "Email already registered.": "L'e-mail est déjà enregistré.",
    "Username already in use.": "Le nom d'utilisateur est déjà utilisé.",
    "Email (optional)": "E-mail (facultatif)",
    "Full name": "Nom complet",
    "Address (optional)": "Adresse (facultatif)",
    "Please enter your credentials.": "Veuillez saisir vos identifiants.",
    "No account found for this phone number or email. Please register.": "Aucun compte n’a été trouvé pour ce numéro de téléphone ou cet e-mail. Veuillez vous inscrire.",
    "Invalid credentials.": "Identifiants invalides.",
    "Please login first.": "Veuillez vous connecter d'abord.",
    "Profile not found.": "Profil introuvable.",
    "Live delivery": "Livraison en direct",
    "Follow my order": "Suivre ma commande",
    "Updating": "Mise à jour",
    "Very soon": "Très bientôt",
    "Waiting for update": "En attente d'une mise à jour",
    "Updated": "Mis à jour",
    "ago": "plus tôt",
    "Updated just now": "Mis à jour à l'instant",
    "Updated earlier": "Mis à jour plus tôt",
    "Your order is in the kitchen": "Votre commande est en préparation en cuisine",
    "We will keep the ETA updated while everything is being prepared.": "Nous garderons l'heure d'arrivée estimée à jour pendant la préparation.",
    "Estimated departure soon": "Départ estimé bientôt",
    "Your order is ready for dispatch": "Votre commande est prête pour l'expédition",
    "The driver handoff is about to begin.": "La remise au livreur va commencer.",
    "Your driver is already visible on the map": "Votre livreur est déjà visible sur la carte",
    "Your driver has been assigned": "Votre livreur a été attribué",
    "Follow the driver live even before the trip officially starts.": "Suivez le livreur en direct avant même le début officiel du trajet.",
    "Departure is expected soon. We will switch to live movement as soon as coordinates arrive.": "Le départ est prévu bientôt. Nous passerons au mouvement en direct dès que les coordonnées arriveront.",
    "On the way": "En route",
    "Your driver is heading to you": "Votre livreur se dirige vers vous",
    "The map will keep updating automatically.": "La carte continuera de se mettre à jour automatiquement.",
    "Arriving soon": "Arrive bientôt",
    "Your driver is almost there": "Votre livreur est presque arrivé",
    "Please keep your phone nearby for the handoff.": "Gardez votre téléphone à proximité pour la remise.",
    "Your order has arrived": "Votre commande est arrivée",
    "Tracking is complete.": "Le suivi est terminé.",
    "Dispatch is being prepared": "L'expédition est en préparation",
    "We are organizing your delivery": "Nous organisons votre livraison",
    "You can already check the driver position and estimated arrival.": "Vous pouvez déjà vérifier la position du livreur et l'arrivée estimée.",
    "Searching/assigning driver. ETA will update as soon as dispatch is ready.": "Recherche/attribution du livreur. L'heure estimée sera mise à jour dès que l'expédition sera prête.",
    "Tracking is no longer available for this order.": "Le suivi n'est plus disponible pour cette commande.",
    "Unable to load live tracking right now.": "Impossible de charger le suivi en direct pour le moment.",
    "Live route": "Itinéraire en direct",
    "Loading live tracking...": "Chargement du suivi en direct...",
    "Request Song": "Demander une chanson",
    "Add a song to the queue": "Ajouter une chanson à la file",
    "Enter a song name and follow its queue number and live status updates here.": "Saisissez un nom de chanson et suivez ici son numéro dans la file ainsi que les mises à jour en direct.",
    "Song name": "Nom de la chanson",
    "Enter song name": "Saisir le nom de la chanson",
    "Send Request": "Envoyer la demande",
    "Sending...": "Envoi...",
    "Song request controls will appear here for checked-in guests.": "Les commandes de demande de chanson apparaîtront ici pour les clients enregistrés.",
    "You can request a new song after the current one is cancelled or closed.": "Vous pourrez demander une nouvelle chanson une fois la demande actuelle annulée ou clôturée.",
    "Current song request is still active": "La demande de chanson actuelle est encore active",
    "Requests": "Demandes",
    "No song requests yet.": "Aucune demande de chanson pour le moment.",
    "Unknown song": "Chanson inconnue",
    "Queue": "File",
    "Your destination": "Votre destination",
    "We are preparing the tracking view. Status and ETA will keep updating here.": "Nous préparons l'affichage du suivi. Le statut et l'heure estimée continueront de se mettre à jour ici.",
    "Route progress": "Progression de l'itinéraire",
    "ETA and route will update automatically.": "L'heure estimée et l'itinéraire seront mis à jour automatiquement.",
    "Delivery address will appear here once available.": "L'adresse de livraison apparaîtra ici dès qu'elle sera disponible.",
    "Driver location": "Position du livreur",
    "Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.": "Les coordonnées en direct sont temporairement indisponibles. Une heure estimée et un statut de secours sont affichés en attendant.",
    "Preparing your order": "Préparation de votre commande",
    "Order picked up": "Commande récupérée",
    DRV: "LIV",
    YOU: "VOUS",
    Driver: "Livreur",
    Destination: "Destination",
    items: "articles",
    new: "Nouveau",
    confirmed: "Confirmé",
    pending: "En attente",
    open: "Ouvert",
    preparing: "Préparation",
    ready: "Prêt",
    delivered: "Livré",
    closed: "Fermé",
    completed: "Terminé",
    reserved: "Réservé",
  },
};

function makeT(lang) {
  const base = DICT.en;
  const interpolate = (template, params) => {
    if (typeof template !== "string") return template;
    if (!params || typeof params !== "object") return template;
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token) => {
      const value = params[token];
      return value === undefined || value === null ? "" : String(value);
    });
  };
  return (key, params) => {
    const template = DICT[lang]?.[key] ?? base[key] ?? key;
    return interpolate(template, params);
  };
}

/* ====================== SUPPORTED LANGS ====================== */
const LANGS = [
  { code: "en", label: "🇺🇸 Eng" },
  { code: "tr", label: "🇹🇷 Tr" },
  { code: "de", label: "🇩🇪 De" },
  { code: "fr", label: "🇫🇷 Fr" },
];


/* ====================== LANGUAGE SWITCHER ====================== */
function LanguageSwitcher({
  lang,
  setLang,
  t,
  isDark = false,
  dropdownDirection = "down",
  compact = false,
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);
  const current = LANGS.find((item) => item.code === lang) || LANGS[0];
  const compactLabel = String(current?.code || "en")
    .slice(0, 2)
    .toUpperCase();

  React.useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center ${
          compact
            ? "justify-center w-full h-full rounded-xl text-[11px] sm:text-[12px]"
            : "gap-2 px-3 py-1.5 rounded-lg text-[12px] sm:text-[13px]"
        } border font-medium transition focus:outline-none focus:ring-2 ${
          isDark
            ? "border-neutral-800 bg-transparent text-neutral-200 hover:bg-neutral-900/70 focus:ring-white/15"
            : "border-gray-200/90 bg-white/95 text-gray-700 hover:bg-white focus:ring-slate-200"
        }`}
        aria-label={t("Language")}
        aria-expanded={open}
      >
        <span>{compact ? compactLabel : current.label}</span>
        {!compact ? (
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        ) : null}
      </button>

      {open ? (
        <div
          className={`absolute ${dropdownDirection === "up" ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"} right-0 z-[180] ${compact ? "w-[150px]" : "w-[180px]"} rounded-2xl border p-2 shadow-lg ${
            isDark
              ? "border-gray-200/20 bg-neutral-950/90 text-white backdrop-blur"
              : "border-gray-200 bg-white/95 text-gray-900 backdrop-blur"
          }`}
        >
          <div className={`px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            isDark ? "text-white/45" : "text-gray-400"
          }`}>
            {t("Language")}
          </div>
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
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
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
            <>
              <p className="text-xs text-gray-500 dark:text-neutral-400">
                Open this page in Safari, then install from the Share menu.
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>{t("Share QR Menu")}</li>
                <li>{t("Add to Home Screen")}</li>
              </ol>
            </>
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

function ShareMenuModal({ open, onClose, t, onShare, onCopy }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {t("Share QR Menu")}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {t("Share this menu with your guests.")}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          <div className="flex flex-col sm:flex-row gap-3">
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

function DownloadQrModal({
  open,
  onClose,
  t,
  onInstall,
  onDownloadImage,
}) {
  if (!open) return null;
  const installLabel = t("Install App");
  const title = t("Download App");
  const subtitle = t("Open the Beypro app for the best experience.");

  return createPortal(
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
        <div className="p-5 border-b border-gray-100 dark:border-neutral-800">
          <div className="text-lg font-semibold text-gray-900 dark:text-neutral-100">
            {title}
          </div>
          <div className="text-sm text-gray-600 dark:text-neutral-300 mt-1">
            {subtitle}
          </div>
        </div>

        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-neutral-200">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onInstall}
              className="w-full py-3 rounded-2xl bg-neutral-900 text-white font-semibold shadow-sm hover:bg-neutral-800 transition"
            >
              {installLabel}
            </button>
            <button
              type="button"
              onClick={onDownloadImage}
              className="w-full py-3 rounded-2xl bg-white dark:bg-neutral-950 border border-gray-300 dark:border-neutral-800 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm hover:bg-gray-50 dark:hover:bg-neutral-800 transition"
            >
              {t("Download QR Image")}
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
  formatTableName,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onVoiceStart,
  voiceListening,
  hideSearch = false,
}) {
  const displayRestaurantName = React.useMemo(() => {
    return normalizeRestaurantDisplayName(restaurantName, "Restaurant");
  }, [restaurantName]);

  return (
    <>
      <header className="w-full sticky top-0 z-50 flex items-center justify-between gap-3 bg-white/85 dark:bg-neutral-900/85 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800 px-4 md:px-6 py-3 shadow-sm">
        <span className="text-[18px] md:text-[20px] font-serif font-bold text-gray-900 dark:text-neutral-100 tracking-tight">
          {displayRestaurantName}
        </span>
        <div className="flex-1 min-w-0">
          {!hideSearch ? (
            <>
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
                    ? typeof formatTableName === "function"
                      ? formatTableName(table)
                      : t("Table")
                    : t("Table Order (short)")
                  : t("Online Order")}
              </div>
            </>
          ) : null}
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
    </>
  );
}

function TableOrderHeader({ t, onBack, title = "Table Order", accentColor = "#111827" }) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  return (
    <header
      className="sticky top-0 z-50 px-4 py-3 backdrop-blur-md"
      style={{
        backgroundColor: toRgba(resolvedAccentColor, 0.94) || resolvedAccentColor,
        borderBottom: `1px solid ${toRgba(resolvedAccentColor, 0.24) || resolvedAccentColor}`,
        color: accentTextColor,
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Back")}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition"
          style={{
            border: `1px solid ${toRgba(accentTextColor, 0.18) || accentTextColor}`,
            background: toRgba(accentTextColor, 0.1) || "rgba(255, 255, 255, 0.1)",
            color: accentTextColor,
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[18px] font-semibold tracking-tight" style={{ color: accentTextColor }}>
            {t(title)}
          </h1>
        </div>

        <div className="h-10 w-10 shrink-0" aria-hidden="true" />
      </div>
    </header>
  );
}

/* ====================== PREMIUM APPLE-STYLE HOME PAGE ====================== */
function OrderTypeSelect({
  identifier, // 🔥 required for backend load
  appendIdentifier,
  onSelect,
  lang,
  setLang,
  t,
  onShare,
  onDownloadQr,
  onShopOpenChange,
  canInstall,
  showHelp,
  setShowHelp,
  platform,
  onPopularClick,
  onCustomizationLoaded,
  onConcertReservationSuccess,
  onFreeConcertReservationStart,
  onConcertBookingRequest,
  statusShortcutCount = 0,
  statusShortcutEnabled = false,
  statusShortcutOpen = false,
  onStatusShortcutToggle,
  reservationEnabled = true,
  tableEnabled = true,
}) {

  /* ============================================================
     1) Load Custom QR Menu Website Settings from Backend
     ============================================================ */
  const [custom, setCustom] = React.useState(() => readCachedQrMenuBranding(identifier));
  const handleOpenMarketplace = React.useCallback(() => {
    navigateToMarketplaceFromQrMenu();
  }, []);
  const onCustomizationLoadedRef = React.useRef(onCustomizationLoaded);
  React.useEffect(() => {
    onCustomizationLoadedRef.current = onCustomizationLoaded;
  }, [onCustomizationLoaded]);

  React.useEffect(() => {
    if (!identifier) {
      setCustom({});
      return;
    }

    const applyCustomization = (nextCustomization) => {
      const customization =
        nextCustomization && typeof nextCustomization === "object" ? nextCustomization : {};
      setCustom(customization);
    };

    const cachedCustomization = readCachedQrMenuBranding(identifier);
    applyCustomization(cachedCustomization);

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
      const customization = data.customization || {};
      writeCachedQrMenuBranding(identifier, customization);
	    applyCustomization(customization);
	  } catch (err) {
	    console.error("❌ Failed to load QR customization:", err);
      if (!cachedCustomization) {
	      applyCustomization({}); // allow component to render with defaults
      }
	  }
	}


    load();

    if (typeof window === "undefined") return undefined;
    const cacheKey = getQrMenuBrandingCacheKey(identifier);

    const handleStorage = (event) => {
      if (event.key !== cacheKey) return;
      applyCustomization(readCachedQrMenuBranding(identifier));
    };

    const handleBrandingUpdate = (event) => {
      const eventIdentifier = String(event?.detail?.identifier || "").trim();
      if (eventIdentifier !== String(identifier || "").trim()) return;
      applyCustomization(event?.detail?.customization || readCachedQrMenuBranding(identifier));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(QR_MENU_BRANDING_UPDATED_EVENT, handleBrandingUpdate);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(QR_MENU_BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, [identifier]);

  // Keep hooks order stable; render with placeholders until loaded

  /* ============================================================
     2) Extract dynamic fields with fallbacks
     ============================================================ */
  const c = custom || {};
  const qrBookingSettings = React.useMemo(
    () => normalizeQrBookingSettings(c || {}),
    [c]
  );
  React.useEffect(() => {
    onCustomizationLoadedRef.current?.(custom || {});
  }, [custom]);
  const restaurantName = c.app_display_name || c.title || c.main_title || "Restaurant";
  const displayRestaurantName = React.useMemo(() => {
    return normalizeRestaurantDisplayName(restaurantName, "Restaurant");
  }, [restaurantName]);
  const subtitle = (c.subtitle ?? "").trim();
  const tagline = (c.tagline ?? "").trim();
  const mainTitleLogo = resolveUploadedAsset(c.main_title_logo);
  const phoneNumber = c.phone || "";
  const callUsHref = phoneNumber ? `tel:${String(phoneNumber).replace(/\s+/g, "")}` : "";
  const allowDelivery = boolish(c.delivery_enabled, true);
  const reservationTabEnabled = boolish(c.reservation_tab_enabled, true);
  const hideAllProducts = boolish(c.disable_all_products, false);
  const accent = c.branding_color || c.primary_color || "#4F46E5";
  const primaryAccentColor = normalizeHexColor(c.primary_color || c.branding_color, "#4F46E5");
  const concertReservationButtonColor = normalizeHexColor(
    c.concert_reservation_button_color,
    "#111827"
  );
  const logoUrl = c.splash_logo || c.logo || c.app_icon || "/Beylogo.svg";
  const themeMode = (c.qr_theme || "auto").toLowerCase();
  const {
    isOpen: isReservationHeaderDrawerOpen,
    openDrawer: openReservationHeaderDrawer,
    closeDrawer: closeReservationHeaderDrawer,
  } = useHeaderDrawer();
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

  const storyTitle = c.story_title || "Our Story";
  const storyText = c.story_text || "";
  const storyVideoTitle = String(c.story_video_title || "").trim();
  const storyVideoSource = String(c.story_video_source || "").trim().toLowerCase();
  const storyVideoYoutubeEmbeds = React.useMemo(() => {
    const ordered = Array.isArray(c.story_video_youtube_urls) ? c.story_video_youtube_urls : [];
    const legacy = String(c.story_video_youtube_url || "").trim();
    const urls = ordered.length > 0 ? ordered : legacy ? [legacy] : [];
    return urls.map((item) => resolveYouTubeEmbedUrl(item)).filter(Boolean);
  }, [c.story_video_youtube_url, c.story_video_youtube_urls]);
  const storyVideoYoutubeEmbed = storyVideoYoutubeEmbeds[0] || "";
  const storyVideoUpload = resolveUploadedAsset(c.story_video_upload);
  const [isMobileStoryVideoViewport, setIsMobileStoryVideoViewport] = React.useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileStoryVideoViewport(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);
  const activeStoryVideo =
    storyVideoSource === "youtube"
      ? storyVideoYoutubeEmbed || storyVideoUpload
      : storyVideoSource === "upload"
      ? storyVideoUpload || storyVideoYoutubeEmbed
      : storyVideoYoutubeEmbed || storyVideoUpload;
  const storyVideoYoutubePlayerUrl = React.useMemo(() => {
    if (!storyVideoYoutubeEmbed) return "";
    try {
      const url = new URL(storyVideoYoutubeEmbed);
      url.searchParams.set("playsinline", "1");
      url.searchParams.set("rel", "0");
      url.searchParams.set("controls", "1");
      if (isMobileStoryVideoViewport) {
        url.searchParams.delete("autoplay");
        url.searchParams.delete("mute");
      } else {
        url.searchParams.set("autoplay", "1");
        url.searchParams.set("mute", "1");
      }
      return url.toString();
    } catch {
      return storyVideoYoutubeEmbed;
    }
  }, [isMobileStoryVideoViewport, storyVideoYoutubeEmbed]);
  const storyVideoYoutubePlayerUrls = React.useMemo(() => {
    return storyVideoYoutubeEmbeds.map((embedUrl) => {
      try {
        const url = new URL(embedUrl);
        url.searchParams.set("playsinline", "1");
        url.searchParams.set("rel", "0");
        url.searchParams.set("controls", "1");
        if (isMobileStoryVideoViewport) {
          url.searchParams.delete("autoplay");
          url.searchParams.delete("mute");
        } else {
          url.searchParams.set("autoplay", "1");
          url.searchParams.set("mute", "1");
        }
        return url.toString();
      } catch {
        return embedUrl;
      }
    });
  }, [isMobileStoryVideoViewport, storyVideoYoutubeEmbeds]);
  const showStoryVideoSection = Boolean(activeStoryVideo) || storyVideoYoutubeEmbeds.length > 0;
  const storyImages = React.useMemo(() => {
    const orderedImages = Array.isArray(c.story_images) ? c.story_images : [];
    const legacyImage = c.story_image ? [c.story_image] : [];
    const uniqueImages = [];

    [...orderedImages, ...legacyImage].forEach((item) => {
      const value = String(item || "").trim();
      if (!value || uniqueImages.includes(value)) return;
      uniqueImages.push(value);
    });

    return uniqueImages.map((item) => resolveUploadedAsset(item));
  }, [c.story_images, c.story_image]);
  const showStorySection = boolish(c.story_enabled, true) && storyImages.length > 0;

  const reviews = Array.isArray(c.reviews) ? c.reviews : [];

  // ===== Popular This Week (optional) =====
  const [popularProducts, setPopularProducts] = React.useState([]);
  React.useEffect(() => {
    let cancelled = false;
    async function loadPopular() {
      try {
        if (!identifier || !c.enable_popular || hideAllProducts) {
          setPopularProducts([]);
          return;
        }
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
  }, [identifier, c.enable_popular, hideAllProducts]);

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
        if (!identifier || hideAllProducts) {
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
  }, [identifier, hideAllProducts]);

  React.useEffect(() => {
    if (!activeHomeCategory) return;
    storage.setItem("qr_home_active_category", activeHomeCategory);
  }, [activeHomeCategory]);

  React.useEffect(() => {
    storage.setItem("qr_home_search", homeSearch || "");
  }, [homeSearch]);

  const qrLang = React.useMemo(() => {
    if (typeof window === "undefined") return DEFAULT_LANGUAGE;
    return resolvePreferredLanguage({
      storage,
      fallback: DEFAULT_LANGUAGE,
    });
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
    if (hideAllProducts) return [];
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
  }, [homeProducts, activeHomeCategory, homeSearch, hideAllProducts]);

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

  const [concertLoading, setConcertLoading] = React.useState(false);
  const [concertEvents, setConcertEvents] = React.useState([]);
  const [concertModalOpen, setConcertModalOpen] = React.useState(false);
  const [concertModalEvent, setConcertModalEvent] = React.useState(null);
  const [concertSubmitting, setConcertSubmitting] = React.useState(false);
  const [concertTablesLoading, setConcertTablesLoading] = React.useState(false);
  const [concertAvailableTables, setConcertAvailableTables] = React.useState([]);
  const [concertInstructionCopied, setConcertInstructionCopied] = React.useState(false);
  const [concertForm, setConcertForm] = React.useState({
    booking_type: "ticket",
    ticket_type_id: "",
    table_number: "",
    quantity: "1",
    guests_count: "2",
    male_guests_count: "",
    female_guests_count: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    customer_note: "",
    bank_reference: "",
  });

  const loadConcertEvents = React.useCallback(async () => {
    if (!identifier) {
      setConcertEvents([]);
      return;
    }
    setConcertLoading(true);
    try {
      const res = await secureFetch(
        `/public/concerts/${encodeURIComponent(identifier)}/events`
      );
      const nextEvents = Array.isArray(res?.events) ? res.events : [];
      setConcertEvents(nextEvents);
      setConcertModalEvent((prev) => {
        if (!prev?.id) return prev;
        return nextEvents.find((row) => Number(row?.id) === Number(prev.id)) || prev;
      });
    } catch {
      setConcertEvents([]);
    } finally {
      setConcertLoading(false);
    }
  }, [identifier]);

  React.useEffect(() => {
    loadConcertEvents();
  }, [loadConcertEvents]);

  const openFreeConcertReservationModal = React.useCallback((event) => {
    if (typeof onFreeConcertReservationStart === "function") {
      onFreeConcertReservationStart(event);
      return;
    }
    onSelect?.("takeaway");
  }, [onFreeConcertReservationStart, onSelect]);

  const openConcertBookingModal = React.useCallback((event, defaults = {}) => {
    if (!event) return;
    if (typeof onConcertBookingRequest === "function") {
      onConcertBookingRequest(event, defaults);
      return;
    }
    const customerPrefill = getCheckoutPrefill(storage);
    const availableTicketTypes = (Array.isArray(event.ticket_types) ? event.ticket_types : []).filter(
      (row) => Number(row?.available_count || 0) > 0
    );
    const preferredType = defaults.ticketTypeId
      ? availableTicketTypes.find((row) => Number(row.id) === Number(defaults.ticketTypeId))
      : defaults.bookingType === "table"
        ? availableTicketTypes.find((row) => row.is_table_package) ||
          availableTicketTypes.find((row) => !row.is_table_package) ||
          availableTicketTypes[0] ||
          null
        : availableTicketTypes.find((row) => !row.is_table_package) ||
          availableTicketTypes.find((row) => row.is_table_package) ||
          availableTicketTypes[0] ||
          null;
    const nextBookingType = preferredType?.is_table_package ? "table" : "ticket";
    setConcertModalEvent(event);
    setConcertForm({
      booking_type: nextBookingType,
      ticket_type_id: preferredType ? String(preferredType.id) : "",
      table_number: "",
      quantity: "1",
      guests_count: "2",
      male_guests_count: "",
      female_guests_count: "",
      customer_name: customerPrefill?.name || "",
      customer_phone: customerPrefill?.phone || "",
      customer_email: customerPrefill?.email || "",
      customer_note: "",
      bank_reference: "",
    });
    setConcertModalOpen(true);
  }, [onConcertBookingRequest, storage]);

  const closeConcertModal = React.useCallback(() => {
    setConcertModalOpen(false);
    setConcertModalEvent(null);
    setConcertSubmitting(false);
    setConcertAvailableTables([]);
    setConcertTablesLoading(false);
  }, []);

  const selectedConcertTicketType = React.useMemo(() => {
    const selectedId = Number(concertForm.ticket_type_id);
    if (!Number.isFinite(selectedId) || selectedId <= 0) return null;
    return (concertModalEvent?.ticket_types || []).find((row) => Number(row.id) === selectedId) || null;
  }, [concertForm.ticket_type_id, concertModalEvent]);

  const concertMode = selectedConcertTicketType
    ? (selectedConcertTicketType.is_table_package ? "table" : "ticket")
    : concertForm.booking_type;
  const selectedConcertUnitPrice = React.useMemo(() => {
    const price = Number(selectedConcertTicketType?.price ?? concertModalEvent?.ticket_price ?? 0);
    return Number.isFinite(price) && price > 0 ? price : 0;
  }, [selectedConcertTicketType, concertModalEvent?.ticket_price]);
  const selectedConcertTicketAvailable = React.useMemo(() => {
    const byType = Number(selectedConcertTicketType?.available_count);
    if (Number.isFinite(byType) && byType >= 0) return byType;
    const byEvent = Number(concertModalEvent?.available_ticket_count);
    if (Number.isFinite(byEvent) && byEvent >= 0) return byEvent;
    return null;
  }, [selectedConcertTicketType?.available_count, concertModalEvent?.available_ticket_count]);
  const selectedConcertTableStockAvailable = React.useMemo(() => {
    const byEvent = Number(concertModalEvent?.available_table_count);
    if (Number.isFinite(byEvent) && byEvent >= 0) return byEvent;
    return null;
  }, [concertModalEvent?.available_table_count]);
  const selectedConcertTablePackageTicketAvailable = React.useMemo(() => {
    const byType = Number(selectedConcertTicketType?.available_count);
    if (Number.isFinite(byType) && byType >= 0) return byType;
    return null;
  }, [selectedConcertTicketType?.available_count]);
  const selectedConcertTableNumber = Number(concertForm.table_number);
  const selectedConcertTableRow = React.useMemo(() => {
    if (!Number.isFinite(selectedConcertTableNumber) || selectedConcertTableNumber <= 0) return null;
    return (
      (Array.isArray(concertAvailableTables) ? concertAvailableTables : []).find(
        (row) => Number(row?.table_number) === selectedConcertTableNumber
      ) || null
    );
  }, [concertAvailableTables, selectedConcertTableNumber]);
  const selectedConcertMaxGuests = React.useMemo(() => {
    const rawLimit = Number(
      selectedConcertTableRow?.seats ??
      selectedConcertTableRow?.max_guests ??
      selectedConcertTableRow?.guest_limit ??
      0
    );
    if (Number.isFinite(rawLimit) && rawLimit > 0) {
      return Math.max(1, Math.floor(rawLimit));
    }
    return 20;
  }, [selectedConcertTableRow]);
  const selectedConcertGuestCap = React.useMemo(() => {
    const ticketCapRaw = Number(selectedConcertTablePackageTicketAvailable);
    if (Number.isFinite(ticketCapRaw) && ticketCapRaw > 0) {
      return Math.max(1, Math.min(selectedConcertMaxGuests, Math.floor(ticketCapRaw)));
    }
    return selectedConcertMaxGuests;
  }, [selectedConcertMaxGuests, selectedConcertTablePackageTicketAvailable]);
  const concertGuestCompositionEnabled =
    concertMode === "table" &&
    boolish(concertModalEvent?.guest_composition_enabled, false);
  const concertGuestCompositionFieldMode = normalizeGuestCompositionFieldMode(
    concertModalEvent?.guest_composition_field_mode,
    "hidden"
  );
  const concertGuestCompositionRestrictionRule = normalizeGuestCompositionRestrictionRule(
    concertModalEvent?.guest_composition_restriction_rule,
    "no_restriction"
  );
  const concertGuestCompositionRequiresInput = guestCompositionRuleRequiresInput(
    concertGuestCompositionRestrictionRule
  );
  const concertGuestCompositionEffectiveFieldMode =
    concertGuestCompositionRequiresInput ? "required" : concertGuestCompositionFieldMode;
  const concertGuestCompositionVisible =
    concertGuestCompositionEnabled &&
    concertGuestCompositionEffectiveFieldMode !== "hidden";
  const concertRequiresEvenGuestCount =
    concertGuestCompositionVisible &&
    concertGuestCompositionRestrictionRule === "couple_only";
  const concertGuestCompositionLocked = concertRequiresEvenGuestCount;
  const concertGuestOptions = React.useMemo(
    () => buildGuestCountOptions(selectedConcertGuestCap, concertRequiresEvenGuestCount),
    [selectedConcertGuestCap, concertRequiresEvenGuestCount]
  );
  const selectedConcertGuests =
    Number(normalizeGuestCountSelection(concertForm.guests_count, concertGuestOptions)) ||
    0;
  const concertMaleGuestsCount = parseGuestCompositionCount(concertForm.male_guests_count);
  const concertFemaleGuestsCount = parseGuestCompositionCount(concertForm.female_guests_count);
  const hasConcertGuestCompositionInput =
    hasGuestCompositionValue(concertForm.male_guests_count) ||
    hasGuestCompositionValue(concertForm.female_guests_count);
  const concertGuestCompositionPolicyMessage =
    concertGuestCompositionVisible &&
    concertGuestCompositionRestrictionRule !== "no_restriction"
      ? resolveGuestCompositionPolicyMessage(
          concertModalEvent?.guest_composition_validation_message,
          concertGuestCompositionRestrictionRule,
          t
        )
      : "";
  const concertGuestCompositionError = getGuestCompositionValidationError({
    enabled: concertGuestCompositionEnabled,
    fieldMode: concertGuestCompositionEffectiveFieldMode,
    restrictionRule: concertGuestCompositionRestrictionRule,
    validationMessage: concertGuestCompositionPolicyMessage,
    totalGuests: selectedConcertGuests,
    menGuests: concertForm.male_guests_count,
    womenGuests: concertForm.female_guests_count,
    translate: t,
  });
  const concertGuestCountValid =
    concertMode !== "table" || concertGuestOptions.includes(selectedConcertGuests);
  const selectedConcertQuantity = concertMode === "table" ? 1 : Math.max(1, Number(concertForm.quantity) || 1);
  const selectedConcertTotal =
    selectedConcertUnitPrice * (concertMode === "table" ? selectedConcertGuests : selectedConcertQuantity);
  const computedConcertSlot = React.useMemo(
    () =>
      computeConcertSlot({
        eventDate: concertModalEvent?.event_date,
        eventTime: concertModalEvent?.event_time,
        settings: qrBookingSettings,
      }),
    [
      concertModalEvent?.event_date,
      concertModalEvent?.event_time,
      qrBookingSettings,
    ]
  );
  const concertSlotStartRaw =
    concertModalEvent?.slot_start_datetime ||
    computedConcertSlot?.slot_start_datetime ||
    "";
  const concertSlotEndRaw =
    concertModalEvent?.slot_end_datetime ||
    computedConcertSlot?.slot_end_datetime ||
    "";
  const concertEntryOpenRaw =
    concertModalEvent?.entry_open_datetime ||
    computedConcertSlot?.entry_open_datetime ||
    "";
  const concertEntryCloseRaw =
    concertModalEvent?.entry_close_datetime ||
    computedConcertSlot?.entry_close_datetime ||
    "";
  const concertSlotStartDate = React.useMemo(
    () => parseLocalDateTime(concertSlotStartRaw),
    [concertSlotStartRaw]
  );
  const concertSlotEndDate = React.useMemo(
    () => parseLocalDateTime(concertSlotEndRaw),
    [concertSlotEndRaw]
  );
  const concertEntryOpenDate = React.useMemo(
    () => parseLocalDateTime(concertEntryOpenRaw),
    [concertEntryOpenRaw]
  );
  const concertEntryCloseDate = React.useMemo(
    () => parseLocalDateTime(concertEntryCloseRaw),
    [concertEntryCloseRaw]
  );
  const concertEventHasStarted =
    concertSlotStartDate instanceof Date &&
    Number.isFinite(concertSlotStartDate.getTime()) &&
    concertSlotStartDate.getTime() < Date.now();
  const concertEventWindowLabel = React.useMemo(() => {
    if (!concertSlotStartDate || !concertSlotEndDate) return "";
    const startLabel = concertSlotStartDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const endLabel = concertSlotEndDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${startLabel} - ${endLabel}`;
  }, [concertSlotEndDate, concertSlotStartDate]);
  const concertDurationMinutes = React.useMemo(() => {
    if (!concertSlotStartDate || !concertSlotEndDate) {
      const fallback = Number(
        concertModalEvent?.event_duration_minutes ||
          qrBookingSettings.concert_event_duration_minutes
      );
      return Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : null;
    }
    const diffMinutes = Math.round(
      (concertSlotEndDate.getTime() - concertSlotStartDate.getTime()) / 60000
    );
    return Number.isFinite(diffMinutes) && diffMinutes > 0 ? diffMinutes : null;
  }, [
    concertModalEvent?.event_duration_minutes,
    concertSlotEndDate,
    concertSlotStartDate,
    qrBookingSettings.concert_event_duration_minutes,
  ]);
  const concertBankInstructions = React.useMemo(() => {
    return String(
      concertModalEvent?.bank_transfer_instructions ||
      t("Booking will stay pending until bank transfer is confirmed by the venue.")
    ).trim();
  }, [concertModalEvent?.bank_transfer_instructions, t]);

  const copyConcertInstructions = React.useCallback(async () => {
    if (!concertBankInstructions) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(concertBankInstructions);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = concertBankInstructions;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setConcertInstructionCopied(true);
      window.setTimeout(() => setConcertInstructionCopied(false), 1400);
    } catch (err) {
      console.warn("⚠️ Failed to copy bank transfer instructions:", err);
    }
  }, [concertBankInstructions]);

  React.useEffect(() => {
    if (!concertModalOpen) {
      setConcertInstructionCopied(false);
    }
  }, [concertModalOpen, concertModalEvent?.id]);

  React.useEffect(() => {
    if (concertMode !== "table") return;
    setConcertForm((prev) => {
      const nextGuests =
        normalizeGuestCountSelection(prev.guests_count, concertGuestOptions) ||
        (concertGuestOptions.length > 0 ? String(concertGuestOptions[0]) : "");
      if (prev.guests_count === nextGuests) return prev;
      return { ...prev, guests_count: nextGuests };
    });
  }, [concertMode, concertGuestOptions]);

  React.useEffect(() => {
    if (concertMode !== "table" || !concertGuestCompositionVisible) {
      setConcertForm((prev) => {
        if (!prev.male_guests_count && !prev.female_guests_count) return prev;
        return {
          ...prev,
          male_guests_count: "",
          female_guests_count: "",
        };
      });
      return;
    }

    setConcertForm((prev) => {
      const hasInput =
        hasGuestCompositionValue(prev.male_guests_count) ||
        hasGuestCompositionValue(prev.female_guests_count);
      if (concertGuestCompositionEffectiveFieldMode === "optional" && !hasInput) {
        return prev;
      }
      const nextComposition = buildGuestComposition(
        prev.guests_count,
        prev.male_guests_count,
        prev.female_guests_count,
        {
          menKey: "male_guests_count",
          womenKey: "female_guests_count",
        }
      );
      if (
        prev.male_guests_count === nextComposition.male_guests_count &&
        prev.female_guests_count === nextComposition.female_guests_count
      ) {
        return prev;
      }
      return { ...prev, ...nextComposition };
    });
  }, [
    concertMode,
    concertGuestCompositionVisible,
    concertGuestCompositionEffectiveFieldMode,
    concertForm.guests_count,
  ]);

  const handleConcertGuestCompositionChange = React.useCallback((field, delta) => {
    setConcertForm((prev) => {
      if (concertGuestCompositionLocked) return prev;
      const totalGuests = parseGuestCompositionCount(prev.guests_count);
      if (totalGuests <= 0) return prev;

      const hasInput =
        hasGuestCompositionValue(prev.male_guests_count) ||
        hasGuestCompositionValue(prev.female_guests_count);
      const currentMaleGuests = hasInput
        ? parseGuestCompositionCount(prev.male_guests_count)
        : field === "male_guests_count"
          ? 0
          : totalGuests;
      const currentFemaleGuests = hasInput
        ? parseGuestCompositionCount(prev.female_guests_count)
        : field === "female_guests_count"
          ? 0
          : totalGuests;
      const currentValue =
        field === "male_guests_count" ? currentMaleGuests : currentFemaleGuests;
      const nextValue = Math.min(totalGuests, Math.max(0, currentValue + delta));
      const nextMaleGuests =
        field === "male_guests_count" ? nextValue : totalGuests - nextValue;
      const nextFemaleGuests =
        field === "female_guests_count" ? nextValue : totalGuests - nextValue;
      const nextMaleValue = String(nextMaleGuests);
      const nextFemaleValue = String(nextFemaleGuests);

      if (
        prev.male_guests_count === nextMaleValue &&
        prev.female_guests_count === nextFemaleValue
      ) {
        return prev;
      }

      return {
        ...prev,
        male_guests_count: nextMaleValue,
        female_guests_count: nextFemaleValue,
      };
    });
  }, [concertGuestCompositionLocked]);

  React.useEffect(() => {
    let cancelled = false;

    async function loadAvailableTables() {
      if (!concertModalOpen || !concertModalEvent?.id || !identifier || concertMode !== "table") {
        setConcertAvailableTables([]);
        setConcertTablesLoading(false);
        return;
      }

      setConcertTablesLoading(true);
      try {
        const params = new URLSearchParams();
        if (selectedConcertTicketType?.id) {
          params.set("ticket_type_id", String(selectedConcertTicketType.id));
        }
        if (selectedConcertTicketType?.area_name) {
          params.set("area_name", String(selectedConcertTicketType.area_name));
        }
        const query = params.toString();
        const response = await secureFetch(
          `/public/concerts/${encodeURIComponent(identifier)}/events/${concertModalEvent.id}/available-tables${query ? `?${query}` : ""}`
        );
        if (cancelled) return;
        const tableRows = Array.isArray(response?.tables) ? response.tables : [];
        setConcertAvailableTables(tableRows);
        setConcertForm((prev) => {
          const selectedTableNumber = Number(prev.table_number);
          if (!Number.isFinite(selectedTableNumber) || selectedTableNumber <= 0) {
            return prev;
          }
          const stillAvailable = tableRows.some(
            (row) => Number(row?.table_number) === selectedTableNumber
          );
          return stillAvailable ? prev : { ...prev, table_number: "" };
        });
      } catch (err) {
        if (!cancelled) {
          console.error("❌ Failed to load available concert tables:", err);
          setConcertAvailableTables([]);
        }
      } finally {
        if (!cancelled) {
          setConcertTablesLoading(false);
        }
      }
    }

    loadAvailableTables();
    return () => {
      cancelled = true;
    };
  }, [
    concertModalOpen,
    concertModalEvent?.id,
    concertMode,
    identifier,
    selectedConcertTicketType?.id,
    selectedConcertTicketType?.area_name,
  ]);

  const concertPriceLabel = React.useCallback(
    (event) => {
      const min = Number(event?.price_min || 0);
      const max = Number(event?.price_max || 0);
      if (min > 0 && max > 0 && min !== max) {
        return `${formatCurrency(min)} - ${formatCurrency(max)}`;
      }
      if (max > 0) return formatCurrency(max);
      if (min > 0) return formatCurrency(min);
      return formatCurrency(Number(event?.ticket_price || 0));
    },
    [formatCurrency]
  );

  const submitConcertBooking = React.useCallback(async () => {
    if (!concertModalEvent?.id || !identifier) return;
    if (concertEventHasStarted) return;
    const customerEmail = concertForm.customer_email.trim().toLowerCase();
    if (!concertForm.customer_name.trim() || !concertForm.customer_phone.trim()) {
      alert(t("Please fill required fields"));
      return;
    }
    if (customerEmail && !EMAIL_REGEX.test(customerEmail)) {
      alert(t("Please enter a valid email address"));
      return;
    }
    if (concertMode === "table") {
      const selectedTableNumber = Number(concertForm.table_number);
      if (!Number.isFinite(selectedTableNumber) || selectedTableNumber <= 0) {
        alert(t("Please select an available table."));
        return;
      }
      const tableStillAvailable = (Array.isArray(concertAvailableTables) ? concertAvailableTables : []).some(
        (row) => Number(row?.table_number) === selectedTableNumber
      );
      if (!tableStillAvailable) {
        alert(t("Please select an available table."));
        return;
      }
      if (!concertGuestOptions.includes(selectedConcertGuests)) {
        alert(
          concertGuestCompositionPolicyMessage ||
            t("Please select a valid guest count.")
        );
        return;
      }
      const availableTableStock = Number(selectedConcertTableStockAvailable);
      if (Number.isFinite(availableTableStock) && availableTableStock <= 0) {
        const packageTickets = Number(selectedConcertTablePackageTicketAvailable);
        const packageTicketsLabel = Number.isFinite(packageTickets) ? packageTickets : 0;
        alert(`Concert table stock is sold out. Available table slots: ${availableTableStock}. Table-package tickets: ${packageTicketsLabel}.`);
        return;
      }
      const availablePackageTickets = Number(selectedConcertTablePackageTicketAvailable);
      if (Number.isFinite(availablePackageTickets) && selectedConcertGuests > availablePackageTickets) {
        alert(`Only ${availablePackageTickets} table-package ticket(s) available for ${selectedConcertGuests} guest(s).`);
        return;
      }
      if (concertGuestCompositionError) {
        alert(concertGuestCompositionError);
        return;
      }
    }
    const quantity = concertMode === "table" ? selectedConcertGuests : Math.max(1, Number(concertForm.quantity) || 1);
    if (concertMode !== "table") {
      const availableTickets = Number(selectedConcertTicketAvailable);
      if (Number.isFinite(availableTickets) && availableTickets <= 0) {
        alert(t("Sold Out"));
        return;
      }
      if (Number.isFinite(availableTickets) && quantity > availableTickets) {
        alert(`Only ${availableTickets} ticket(s) available.`);
        return;
      }
    }
    const payload = {
      booking_type: concertMode === "table" ? "table" : "ticket",
      ticket_type_id: concertForm.ticket_type_id ? Number(concertForm.ticket_type_id) : null,
      requested_table_number:
        concertMode === "table" && concertForm.table_number
          ? Number(concertForm.table_number)
          : null,
      quantity,
      guests_count: concertMode === "table" ? selectedConcertGuests : null,
      male_guests_count:
        concertMode === "table" && concertGuestCompositionVisible && hasConcertGuestCompositionInput
          ? concertMaleGuestsCount
          : null,
      female_guests_count:
        concertMode === "table" && concertGuestCompositionVisible && hasConcertGuestCompositionInput
          ? concertFemaleGuestsCount
          : null,
      customer_name: concertForm.customer_name.trim(),
      customer_phone: concertForm.customer_phone.trim(),
      customer_email: customerEmail || null,
      customer_note: concertForm.customer_note.trim(),
      bank_reference: concertForm.bank_reference.trim(),
      area_name: selectedConcertTicketType?.area_name || null,
    };

    setConcertSubmitting(true);
    try {
      const response = await secureFetch(
        `/public/concerts/${encodeURIComponent(identifier)}/events/${concertModalEvent.id}/bookings`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      if (response?.event && Number(response?.event?.id) === Number(concertModalEvent?.id)) {
        setConcertModalEvent(response.event);
      }
      if (response?.event && Number(response?.event?.id) > 0) {
        setConcertEvents((prev) =>
          (Array.isArray(prev) ? prev : []).map((row) =>
            Number(row?.id) === Number(response.event.id) ? response.event : row
          )
        );
      }

      const paymentStatus = response?.booking?.payment_status || "pending_bank_transfer";
      const instructions =
        response?.booking?.payment_instructions ||
        response?.event?.bank_transfer_instructions ||
        t("Please complete bank transfer and wait for confirmation.");
      const linkedOrderId = Number(
        response?.booking?.reservation_order_id ||
          response?.linked_order?.id ||
          response?.reservation?.id ||
          0
      );
      if (Number.isFinite(linkedOrderId) && linkedOrderId > 0) {
        const reservedTableNumber = Number(
          response?.booking?.reserved_table_number || concertForm.table_number || 0
        );
        closeConcertModal();
        showQrCartToast(concertMode === "table" ? t("Reservation confirmed") : t("Ticket created"));
        onConcertReservationSuccess?.({
          reservationOrderId: linkedOrderId,
          reservedTableNumber:
            Number.isFinite(reservedTableNumber) && reservedTableNumber > 0
              ? reservedTableNumber
              : null,
          bookingType: concertMode,
          paymentStatus,
          instructions,
        });
        void loadConcertEvents();
        return;
      }

      closeConcertModal();
      showQrCartToast(concertMode === "table" ? t("Reservation confirmed") : t("Ticket created"));
      void loadConcertEvents();
    } catch (err) {
      const message = String(err?.message || "");
      if (concertMode === "table" && /table stock is sold out/i.test(message)) {
        const backendTableSlotsRaw = Number(
          err?.available_count ??
            err?.available ??
            err?.data?.available_count ??
            err?.response?.available_count ??
            err?.response?.data?.available_count ??
            err?.details?.body?.available_count
        );
        let tableSlotsForPrompt = Number.isFinite(backendTableSlotsRaw)
          ? backendTableSlotsRaw
          : null;
        if (!Number.isFinite(tableSlotsForPrompt)) {
          try {
            const latest = await secureFetch(
              `/public/concerts/${encodeURIComponent(identifier)}/events`
            );
            const latestEvents = Array.isArray(latest?.events) ? latest.events : [];
            const latestEvent = latestEvents.find(
              (row) => Number(row?.id) === Number(concertModalEvent?.id)
            );
            const freshSlots = Number(latestEvent?.available_table_count);
            if (Number.isFinite(freshSlots)) {
              tableSlotsForPrompt = freshSlots;
            }
          } catch {
            // ignore and fall back to current modal value
          }
        }
        if (!Number.isFinite(tableSlotsForPrompt)) {
          const fallbackTableSlots = Number(selectedConcertTableStockAvailable);
          tableSlotsForPrompt = Number.isFinite(fallbackTableSlots) ? fallbackTableSlots : 0;
        }
        const packageTickets = Number(selectedConcertTablePackageTicketAvailable);
        const packageTicketsLabel = Number.isFinite(packageTickets) ? packageTickets : 0;
        alert(`Concert table stock is sold out. Available table slots: ${tableSlotsForPrompt}. Table-package tickets: ${packageTicketsLabel}.`);
      } else {
        alert(err?.message || t("Failed to save reservation"));
      }
    } finally {
      setConcertSubmitting(false);
    }
  }, [
    closeConcertModal,
    concertForm,
    concertModalEvent,
    concertMode,
    concertEventHasStarted,
    selectedConcertGuests,
    concertGuestCompositionError,
    concertGuestCompositionVisible,
    concertMaleGuestsCount,
    concertFemaleGuestsCount,
    hasConcertGuestCompositionInput,
    onConcertReservationSuccess,
    identifier,
    loadConcertEvents,
    concertAvailableTables,
    selectedConcertTicketType?.area_name,
    selectedConcertTableStockAvailable,
    selectedConcertTablePackageTicketAvailable,
    t,
  ]);

  const slides =
    Array.isArray(c.hero_slides) && c.hero_slides.length > 0
      ? c.hero_slides.map(s => ({
          title: s.title,
          subtitle: s.subtitle,
          src: s.image,
        }))
      : [];


  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [shopHours, setShopHours] = React.useState({});
  const [loadingShopHours, setLoadingShopHours] = React.useState(true);

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

  const [activeHeaderOrderType, setActiveHeaderOrderType] = React.useState("takeaway");
  const handleHeaderOrderTypeSelect = React.useCallback(
    (nextType) => {
      if (!nextType) return;
      setActiveHeaderOrderType(nextType);
      onSelect?.(nextType);
    },
    [onSelect]
  );

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
      const SOCKET_URL = SOCKET_BASE;
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
  const [currentStorySlide, setCurrentStorySlide] = React.useState(0);

  React.useEffect(() => {
    setCurrentSlide((prev) => {
      if (slides.length === 0) return 0;
      return prev >= slides.length ? 0 : prev;
    });
  }, [slides.length]);

  React.useEffect(() => {
    if (slides.length > 1) {
      const timer = setInterval(
        () => setCurrentSlide((s) => (s + 1) % slides.length),
        4500
      );
      return () => clearInterval(timer);
    }
  }, [slides.length]);

  React.useEffect(() => {
    setCurrentStorySlide(0);
  }, [storyImages.length]);

  React.useEffect(() => {
    if (storyImages.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setCurrentStorySlide((s) => (s + 1) % storyImages.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [storyImages.length]);

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

  const storyTouchStartXRef = React.useRef(null);
  function handleStoryTouchStart(e) {
    storyTouchStartXRef.current = e.touches[0].clientX;
  }
  function handleStoryTouchEnd(e) {
    const startX = storyTouchStartXRef.current;
    if (startX == null || storyImages.length <= 1) {
      storyTouchStartXRef.current = null;
      return;
    }

    const endX = e.changedTouches[0].clientX;
    const delta = endX - startX;
    const threshold = 40;

    if (delta > threshold) {
      setCurrentStorySlide((s) => (s - 1 + storyImages.length) % storyImages.length);
    } else if (delta < -threshold) {
      setCurrentStorySlide((s) => (s + 1) % storyImages.length);
    }

    storyTouchStartXRef.current = null;
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
        backgroundImage:
          slides.length > 0 && slides[currentSlide]?.src
            ? `url(${slides[currentSlide].src})`
            : "none",
        backgroundSize: "cover",
        backgroundPosition: "center",
        transform: `translateY(${scrollY * 0.15}px)`,
        filter: "brightness(0.6)",
      }}
    />
	    <div className="absolute inset-x-0 top-0 h-[420px] sm:h-[480px] -z-10 bg-gradient-to-b from-white/70 via-white/80 to-white dark:from-neutral-950/40 dark:via-neutral-950/70 dark:to-black/90" />

      <QrMenuHeader
        isDark={isDark}
        isDrawerOpen={isReservationHeaderDrawerOpen}
        onOpenDrawer={openReservationHeaderDrawer}
        onOpenMarketplace={handleOpenMarketplace}
        onSelect={handleHeaderOrderTypeSelect}
        reservationEnabled={reservationEnabled && reservationTabEnabled && openStatus.isOpen}
        tableEnabled={tableEnabled && openStatus.isOpen}
        deliveryEnabled={allowDelivery && openStatus.isOpen}
        activeOrderType={activeHeaderOrderType}
        statusShortcutCount={statusShortcutCount}
        statusShortcutEnabled={statusShortcutEnabled}
        statusShortcutOpen={statusShortcutOpen}
        onStatusShortcutClick={onStatusShortcutToggle}
        restaurantName={displayRestaurantName || "Apollo Cafe"}
        mainTitleLogo={mainTitleLogo}
        tagline={subtitle || tagline || "Fresh • Local • Crafted"}
        accentColor={primaryAccentColor}
        t={t}
        languageControl={
          <LanguageSwitcher
            lang={lang}
            setLang={setLang}
            t={t}
            isDark={isDark}
            compact
          />
        }
      />
      <HeaderDrawer
        isOpen={isReservationHeaderDrawerOpen}
        onClose={closeReservationHeaderDrawer}
        t={t}
        appendIdentifier={appendIdentifier}
        isDark={isDark}
        accentColor={primaryAccentColor}
        openStatus={openStatus}
        days={days}
        todayName={todayName}
        shopHours={shopHours}
        loadingShopHours={loadingShopHours}
        languageControl={
          <LanguageSwitcher
            lang={lang}
            setLang={setLang}
            t={t}
            isDark={isDark}
            dropdownDirection="up"
          />
        }
      />
		
      {/* === HERO SECTION === */}
        <section id="order-section" className="max-w-6xl mx-auto px-4 pt-[24px] pb-4 space-y-10">

	      <div className="max-w-4xl mx-auto">
              {/* CONCERT TICKETS */}
                <div className="mt-3 max-w-3xl mx-auto">
	                {concertEvents.length > 0 ? (
	                  <div className="space-y-3">
                    {concertEvents.map((event) => {
                      const isFreeConcert = boolish(event?.free_concert, false);
                      const forcedSoldOut =
                        String(event?.status || "").toLowerCase() === "sold_out" ||
                        (event?.auto_sold_out === true);
                      const computedEventSlot = computeConcertSlot({
                        eventDate: event?.event_date,
                        eventTime: event?.event_time,
                        settings: qrBookingSettings,
                      });
                      const eventSlotEndRaw =
                        event?.slot_end_datetime ||
                        computedEventSlot?.slot_end_datetime ||
                        "";
                      const eventSlotEndDate = parseLocalDateTime(eventSlotEndRaw);
                      let fallbackEventEndDate = null;
                      if (!eventSlotEndDate) {
                        const fallbackDate = String(event?.event_date || "").slice(0, 10);
                        const fallbackTimeRaw = String(event?.event_time || "").trim();
                        const fallbackTime = /^\d{2}:\d{2}(:\d{2})?$/.test(fallbackTimeRaw)
                          ? fallbackTimeRaw
                          : "00:00:00";
                        if (fallbackDate) {
                          const fallbackStartDate = parseLocalDateTime(`${fallbackDate} ${fallbackTime}`);
                          if (fallbackStartDate) {
                            const fallbackDurationMinutes = Math.max(
                              15,
                              Number(event?.event_duration_minutes) ||
                                Number(qrBookingSettings?.concert_event_duration_minutes) ||
                                150
                            );
                            fallbackStartDate.setMinutes(
                              fallbackStartDate.getMinutes() + fallbackDurationMinutes
                            );
                            fallbackEventEndDate = fallbackStartDate;
                          }
                        }
                      }
                      const eventDateIsOver =
                        ((eventSlotEndDate instanceof Date &&
                          Number.isFinite(eventSlotEndDate.getTime()) &&
                          eventSlotEndDate.getTime() < Date.now()) ||
                          (fallbackEventEndDate instanceof Date &&
                            Number.isFinite(fallbackEventEndDate.getTime()) &&
                            fallbackEventEndDate.getTime() < Date.now()));
                      const eventImage = resolveUploadedAsset(event?.event_image);
                      const artistName = String(event?.artist_name || "").trim();
                      const eventTitle = String(event?.event_title || "").trim();
                      const showEventTitle =
                        eventTitle && eventTitle.toLowerCase() !== artistName.toLowerCase();
                      const eventDate = formatConcertDisplayDateWithoutYear(event?.event_date, lang);
                      const eventWeekday = formatConcertDisplayWeekday(event?.event_date, lang);
                      const eventTime = String(event?.event_time || "").slice(0, 5);
                      const tableCountAvailable = Number(event?.available_table_count || 0) > 0;
                      const ticketCountAvailable = Number(event?.available_ticket_count || 0) > 0;
                      const normalTicketTypeAvailable = (event?.ticket_types || []).some(
                        (row) => !row?.is_table_package && Number(row?.available_count || 0) > 0
                      );
                      const tablePackageTypeAvailable = (event?.ticket_types || []).some(
                        (row) => row?.is_table_package && Number(row?.available_count || 0) > 0
                      );
                      const ticketAvailable = ticketCountAvailable || normalTicketTypeAvailable;
                      const tableAvailable = tableCountAvailable && tablePackageTypeAvailable;
                      const badgeSoldOut =
                        forcedSoldOut ||
                        (!isFreeConcert && !ticketAvailable && !tableAvailable);
                      const fullySoldOut = badgeSoldOut;
                      const concertBookingDeactivated = eventDateIsOver;
                      const tableTicketType = (event?.ticket_types || []).find(
                        (row) => row?.is_table_package && Number(row?.available_count || 0) > 0
                      );
                      const normalTicketType = (event?.ticket_types || []).find(
                        (row) => !row?.is_table_package && Number(row?.available_count || 0) > 0
                      );

                      return (
                        <div
                          key={event.id}
                          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/75 p-4 shadow-sm"
                        >
                          {eventImage ? (
                            <div className="mb-3 w-full aspect-[16/9] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950">
                              <img
                                src={eventImage}
                                alt={event.event_title || event.artist_name || "Concert"}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : null}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              {!isFreeConcert ? (
                                <div className="mb-2 inline-flex items-center rounded-full border border-neutral-200 dark:border-neutral-700 bg-white/80 dark:bg-neutral-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-300">
                                  {t("Concert Tickets")}
                                </div>
                              ) : null}
                              <div className="pl-2.5">
                                <div className="text-xl sm:text-2xl font-extrabold leading-tight text-neutral-900 dark:text-neutral-100">
                                  {artistName || eventTitle}
                                </div>
                                {showEventTitle ? (
                                  <div className="mt-0.5 text-xs sm:text-sm uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                                    {eventTitle}
                                  </div>
                                ) : null}
                                <div className="mt-1 text-sm sm:text-base font-medium text-neutral-700 dark:text-white/90">
                                  {eventDate}
                                  {eventWeekday ? ` • ${eventWeekday}` : ""}
                                  {eventTime ? ` ${eventTime}` : ""}
                                  {!isFreeConcert ? ` • ${concertPriceLabel(event)}` : ""}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full border ${
                                concertBookingDeactivated
                                  ? "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                                  : badgeSoldOut
                                  ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
                                  : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                              }`}
                            >
                              {concertBookingDeactivated
                                ? t("Deactivated")
                                : badgeSoldOut
                                ? t("Sold Out")
                                : t("Available")}
                            </span>
                          </div>

                          {(event?.ticket_types || []).length > 0 ? (
                            <div className="mt-2 pl-2.5 text-xs text-neutral-600 dark:text-neutral-300 space-y-1">
                              {(event.ticket_types || []).slice(0, 4).map((ticketType) => (
                                <div key={ticketType.id}>
                                  {ticketType.name}
                                  {ticketType.area_name ? ` • ${ticketType.area_name}` : ""}
                                  {` • ${ticketType.available_count}/${ticketType.quantity_total}`}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {(event?.area_allocations || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(event.area_allocations || []).slice(0, 4).map((area) => (
                                <span
                                  key={`${event.id}-${area.id}`}
                                  className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
                                >
                                  {area.area_name} • {area.allocation_type}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <button
                              type="button"
                              disabled={fullySoldOut || concertBookingDeactivated}
                              onClick={() => {
                                if (isFreeConcert) {
                                  openFreeConcertReservationModal(event);
                                  return;
                                }
                                openConcertBookingModal(event, {
                                  bookingType: tableAvailable && tableTicketType ? "table" : "ticket",
                                  ticketTypeId:
                                    (tableAvailable && tableTicketType
                                      ? tableTicketType?.id
                                      : normalTicketType?.id || tableTicketType?.id) || "",
                                });
                              }}
                              className="rounded-xl border px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-45 disabled:cursor-not-allowed"
                              style={{
                                backgroundColor: concertReservationButtonColor,
                                borderColor: concertReservationButtonColor,
                              }}
                            >
                              {isFreeConcert ? t("Reservation") : t("Buy Ticket")}
                            </button>
                            {concertBookingDeactivated ? (
                              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                                {t("Concert date is over. Booking is disabled.")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
	                  </div>
	                ) : null}
	              </div>

              {showStoryVideoSection ? (
                <div id="story-video-section" className="mt-6">
                  {storyVideoTitle ? (
                    <h2 className="mb-3 text-center text-[1.4rem] sm:text-[1.7rem] font-serif font-semibold tracking-[-0.02em] text-gray-900 dark:text-neutral-50">
                      {storyVideoTitle}
                    </h2>
                  ) : null}
                  {storyVideoYoutubePlayerUrls.length > 0 ? (
                    <div className="mx-auto max-w-4xl space-y-4">
                      {storyVideoYoutubePlayerUrls.map((videoUrl, index) => (
                        <div
                          key={`story-video-${index}`}
                          className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                        >
                          <div className="aspect-video w-full bg-black">
                            <iframe
                              src={videoUrl}
                              title={`${t("Story Video")} ${index + 1}`}
                              className="h-full w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              referrerPolicy="strict-origin-when-cross-origin"
                              allowFullScreen
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto overflow-hidden rounded-[28px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                      <div className="aspect-video w-full bg-black">
                        <video
                          src={activeStoryVideo}
                          autoPlay
                          muted
                          playsInline
                          loop
                          controls
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

		      </div>

      {/* CATEGORIES (scrollable 1 row) */}
      {!hideAllProducts && homeCategories.length > 0 && (
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
      {!hideAllProducts && homeVisibleProducts.length > 0 && (
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

	      {/* Popular This Week */}
	      {!hideAllProducts && c.enable_popular && popularProducts.length > 0 && (
	        <div className="mt-6 max-w-3xl">
	          <PopularCarousel
	            title={`⭐ ${t("Popular This Week")}`}
	            items={popularProducts}
	            onProductClick={onPopularClick}
	          />
	        </div>
	      )}
	    </section>

    {/* === STORY SECTION === */}
      {showStorySection && (
		      <section id="story-section" className="max-w-6xl mx-auto px-4 pt-3 pb-14">
		        <div className="grid grid-cols-1 gap-6 lg:gap-10 items-center">
		          <div className="max-w-2xl mx-auto text-center">
		            <h2 className="text-[2rem] sm:text-[2.35rem] font-serif font-semibold tracking-[-0.03em] text-gray-900 dark:text-neutral-50">
		              {storyTitle}
		            </h2>
		            {storyText ? (
		              <p className="mt-3 text-[15px] sm:text-base text-gray-600 dark:text-neutral-300 leading-relaxed whitespace-pre-line">
		                {storyText}
		              </p>
		            ) : null}
		          </div>
	
		          <div className="w-full max-w-4xl mx-auto">
		            <div
		              className="relative overflow-hidden rounded-[28px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
		              onTouchStart={storyImages.length > 1 ? handleStoryTouchStart : undefined}
	              onTouchEnd={storyImages.length > 1 ? handleStoryTouchEnd : undefined}
	              style={{ touchAction: "pan-y" }}
	            >
	              <div className="aspect-[4/5] sm:aspect-[16/10] md:aspect-[4/3] w-full bg-neutral-100 dark:bg-neutral-950">
	                <div
	                  className="flex h-full w-full transition-transform duration-700 ease-out"
	                  style={{ transform: `translateX(-${currentStorySlide * 100}%)` }}
	                >
	                  {storyImages.map((image, index) => (
	                    <div key={`${image}-${index}`} className="h-full w-full shrink-0">
	                      <img
	                        src={image}
	                        alt={`${storyTitle} ${index + 1}`}
	                        className="h-full w-full object-cover"
	                        loading={index === 0 ? "eager" : "lazy"}
	                      />
	                    </div>
	                  ))}
	                </div>
	              </div>
	            </div>

	            {storyImages.length > 1 ? (
	              <div className="mt-3 flex items-center justify-center gap-2">
	                {storyImages.map((_, index) => (
	                  <button
	                    key={index}
	                    type="button"
	                    onClick={() => setCurrentStorySlide(index)}
	                    className={`transition-all ${
	                      index === currentStorySlide
	                        ? "w-6 h-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100"
	                        : "w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-500"
	                    }`}
	                    aria-label={`${t("Go to slide")} ${index + 1}`}
	                  />
	                ))}
	              </div>
	            ) : null}
	          </div>
	        </div>
	      </section>
      )}

      {reviews.length > 0 ? (
	    <section id="reviews-section" className="max-w-6xl mx-auto px-4 pt-2 pb-16">
	      <h2 className="text-3xl font-serif font-bold text-gray-900 dark:text-neutral-50 mb-4">
	        {t("Reviews")}
	      </h2>

	      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      ) : null}

      {/* === BOTTOM ACTIONS === */}
      <section className="max-w-6xl mx-auto px-4 pb-6">
        <div className="max-w-3xl mx-auto rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/70 backdrop-blur-sm p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
            {phoneNumber ? (
              <a
                href={callUsHref}
                className="w-full h-11 rounded-xl text-white font-semibold shadow-sm flex items-center justify-center gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all"
                style={{ backgroundColor: accent }}
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm">{t("Call Us")}</span>
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="w-full h-11 rounded-xl bg-neutral-200 text-neutral-500 font-semibold shadow-sm flex items-center justify-center gap-2 cursor-not-allowed dark:bg-neutral-800/60 dark:text-neutral-400"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm">{t("Call Us")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onShare?.()}
              className="w-full h-11 rounded-xl bg-white dark:bg-neutral-900 border border-gray-300/90 dark:border-neutral-700 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-sm">{t("Share")}</span>
            </button>

            <button
              type="button"
              onClick={() => onDownloadQr?.()}
              className="w-full h-11 rounded-xl bg-white dark:bg-neutral-900 border border-gray-300/90 dark:border-neutral-700 text-gray-900 dark:text-neutral-100 font-semibold shadow-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-neutral-800 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">{t("Download Qr")}</span>
            </button>
          </div>
        </div>
      </section>

      {phoneNumber ? (
        <a
          href={callUsHref}
          className="sm:hidden fixed right-4 z-[95] inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/90 p-[3px] shadow-[0_14px_36px_rgba(0,0,0,0.38)] active:scale-[0.98] transition-transform"
          style={{
            background: `linear-gradient(145deg, ${accent}, #111827)`,
            bottom: "calc(1rem + env(safe-area-inset-bottom))",
          }}
          aria-label={t("Call Us")}
          title={t("Call Us")}
        >
          <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-white shadow-inner">
            <Phone className="h-5 w-5" style={{ color: accent }} />
          </span>
        </a>
      ) : null}

	    {/* === SOCIAL ICONS === */}
	    <div className="relative w-full max-w-3xl mx-auto flex items-center justify-center pb-10 px-4 sm:px-0 min-h-[40px]">
        <div className="flex items-center justify-center gap-6 mx-auto">
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

      {concertModalOpen && concertModalEvent ? (
        <div
          className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !concertSubmitting) {
              closeConcertModal();
            }
          }}
        >
          <div className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl p-5 space-y-4">
            {(() => {
              const artistName = String(concertModalEvent?.artist_name || "").trim();
              const eventTitle = String(concertModalEvent?.event_title || "").trim();
              const isFreeConcert = boolish(concertModalEvent?.free_concert, false);
              const showEventTitle =
                eventTitle && eventTitle.toLowerCase() !== artistName.toLowerCase();
              const eventDate = formatConcertDisplayDateWithoutYear(concertModalEvent?.event_date, lang);
              const eventWeekday = formatConcertDisplayWeekday(concertModalEvent?.event_date, lang);
              const eventTime = String(concertModalEvent?.event_time || "").slice(0, 5);
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {!isFreeConcert ? (
                        <p className="mb-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{t("Concert Tickets")}</p>
                      ) : null}
                      <h4 className="text-2xl font-extrabold leading-tight text-neutral-900 dark:text-neutral-100">
                        {artistName || eventTitle}
                      </h4>
                      {showEventTitle ? (
                        <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                          {eventTitle}
                        </p>
                      ) : null}
                      <p className="mt-1 text-base sm:text-lg font-medium text-neutral-700 dark:text-white/90">
                        {eventDate}
                        {eventWeekday ? ` • ${eventWeekday}` : ""}
                        {eventTime ? ` ${eventTime}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeConcertModal}
                      disabled={concertSubmitting}
                      className="text-2xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                </>
              );
            })()}

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    {t("Date")}
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
                    {formatConcertDisplayDateWithoutYear(concertModalEvent?.event_date, lang)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    {t("Event Time")}
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
                    {concertEventWindowLabel || String(concertModalEvent?.event_time || "").slice(0, 5)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    {t("Duration")}
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
                    {concertDurationMinutes ? `${concertDurationMinutes} min` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                    {t("Quantity")}
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
                    {concertMode === "table" ? selectedConcertGuests || 0 : selectedConcertQuantity}
                  </p>
                </div>
              </div>
              {concertEntryOpenDate || concertEntryCloseDate ? (
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-neutral-600 dark:text-neutral-300">
                  <div>
                    <span className="font-semibold">{t("Entry Opens")}:</span>{" "}
                    {concertEntryOpenDate
                      ? concertEntryOpenDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "—"}
                  </div>
                  <div>
                    <span className="font-semibold">{t("Entry Closes")}:</span>{" "}
                    {concertEntryCloseDate
                      ? concertEntryCloseDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : "—"}
                  </div>
                </div>
              ) : null}
            </div>

            {concertEventHasStarted ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                {t("This event has already started.")}
              </div>
            ) : null}

            {(concertModalEvent.ticket_types || []).length > 0 && !boolish(concertModalEvent?.free_concert, false) ? (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {t("Ticket Types / Packages")}
                </label>
                <select
                  value={concertForm.ticket_type_id}
                  onChange={(e) => {
                    const value = e.target.value;
                    const selected = (concertModalEvent.ticket_types || []).find(
                      (row) => Number(row.id) === Number(value)
                    );
                    setConcertForm((prev) => ({
                      ...prev,
                      ticket_type_id: value,
                      booking_type: selected?.is_table_package ? "table" : "ticket",
                    }));
                  }}
                  className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
                >
                  <option value="">{t("Select")}</option>
                  {(concertModalEvent.ticket_types || []).map((row) => (
                    <option
                      key={row.id}
                      value={String(row.id)}
                      disabled={
                        Number(row.available_count || 0) <= 0 ||
                        (row?.is_table_package && Number(selectedConcertTableStockAvailable) <= 0)
                      }
                    >
                      {`${row.name}${row.area_name ? ` • ${row.area_name}` : ""} • ${formatCurrency(Number(row?.price || concertModalEvent?.ticket_price || 0))} • ${row.available_count}/${row.quantity_total}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {concertMode === "table" ? (
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {t("Available table")}
                </label>
                <select
                  value={concertForm.table_number}
                  onChange={(e) =>
                    setConcertForm((prev) => ({ ...prev, table_number: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
                  disabled={concertTablesLoading}
                >
                  <option value="">
                    {concertTablesLoading ? t("Loading...") : t("Select")}
                  </option>
                  {concertAvailableTables.map((row) => {
                    const tableNo = Number(row?.table_number);
                    if (!Number.isFinite(tableNo) || tableNo <= 0) return null;
                    const seats = Number(row?.seats || 0);
                    const area = String(row?.area_name || "").trim();
                    return (
                      <option key={`concert-table-${tableNo}`} value={String(tableNo)}>
                        {`${t("Table")} ${tableNo}${area ? ` • ${area}` : ""}${seats > 0 ? ` • ${seats} ${t("Guests")}` : ""}`}
                      </option>
                    );
                  })}
                </select>
                {!concertTablesLoading && concertAvailableTables.length === 0 ? (
                  <div className="mt-1 text-xs text-rose-600">
                    {t("No available concert tables in this area")}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedConcertTicketType ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                      {selectedConcertTicketType.name}
                    </p>
                    {selectedConcertTicketType.area_name ? (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">
                        {selectedConcertTicketType.area_name}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t("Price")}</p>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(selectedConcertUnitPrice)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-neutral-600 dark:text-neutral-300">
                    {concertMode === "table"
                      ? `${t("Guests")}: ${selectedConcertGuests}`
                      : `${t("Quantity")}: ${selectedConcertQuantity}`}
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                      {t("Total")}
                    </p>
                    <p className="text-[18px] sm:text-[22px] font-extrabold leading-tight text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(selectedConcertTotal)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              {concertMode === "table" ? (
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("Guests")}</label>
                  <input
                    type="number"
                    min={concertRequiresEvenGuestCount ? 2 : 1}
                    max={concertGuestOptions.length > 0 ? concertGuestOptions[concertGuestOptions.length - 1] : selectedConcertGuestCap}
                    step={concertRequiresEvenGuestCount ? 2 : 1}
                    value={concertForm.guests_count}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      const normalizedInput =
                        Number.isFinite(raw) && raw > 0 ? String(Math.floor(raw)) : "";
                      const next =
                        normalizeGuestCountSelection(normalizedInput, concertGuestOptions) ||
                        (concertGuestOptions.length > 0 ? String(concertGuestOptions[0]) : "");
                      setConcertForm((prev) => ({ ...prev, guests_count: String(next) }));
                    }}
                    disabled={!concertForm.table_number || concertGuestOptions.length === 0}
                    className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
                  />
                  {concertForm.table_number ? (
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {concertRequiresEvenGuestCount
                        ? concertGuestCompositionPolicyMessage
                        : `Max ${selectedConcertGuestCap} ${t("Guests")}`}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div>
                  <QuantityStepperCard
                    label={t("Quantity")}
                    value={selectedConcertQuantity}
                    onDecrease={() =>
                      setConcertForm((prev) => ({
                        ...prev,
                        quantity: String(Math.max(1, (Number(prev.quantity) || 1) - 1)),
                      }))
                    }
                    onIncrease={() => {
                      const safeMax =
                        Number.isFinite(selectedConcertTicketAvailable) && selectedConcertTicketAvailable > 0
                          ? Math.min(20, selectedConcertTicketAvailable)
                          : 20;
                      setConcertForm((prev) => ({
                        ...prev,
                        quantity: String(Math.min(safeMax, Math.max(1, Number(prev.quantity) || 1) + 1)),
                      }));
                    }}
                    decreaseDisabled={selectedConcertQuantity <= 1}
                    increaseDisabled={
                      Number.isFinite(selectedConcertTicketAvailable) && selectedConcertTicketAvailable > 0
                        ? selectedConcertQuantity >= Math.min(20, selectedConcertTicketAvailable)
                        : selectedConcertQuantity >= 20
                    }
                    helperText={t("Up to {{count}} tickets", {
                      count:
                        Number.isFinite(selectedConcertTicketAvailable) && selectedConcertTicketAvailable > 0
                          ? Math.min(20, selectedConcertTicketAvailable)
                          : 20,
                    })}
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("Payment Method")}</label>
                <div className="mt-1 w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-3 py-2.5 text-sm font-semibold">
                  {t("Bank Transfer")}
                </div>
              </div>
            </div>

            {concertMode === "table" && concertGuestCompositionVisible ? (
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {t("Guest composition")}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {hasConcertGuestCompositionInput
                        ? `${concertMaleGuestsCount + concertFemaleGuestsCount}/${selectedConcertGuests} ${t("Guests")}`
                        : concertGuestCompositionEffectiveFieldMode === "required"
                          ? `${selectedConcertGuests} ${t("Guests")}`
                          : t("Select Guests")}
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-800">
                    {selectedConcertGuests}
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      key: "male_guests_count",
                      label: t("Men"),
                      value: concertMaleGuestsCount,
                    },
                    {
                      key: "female_guests_count",
                      label: t("Women"),
                      value: concertFemaleGuestsCount,
                    },
                  ].map(({ key, label, value }) => {
                    const decreaseDisabled = concertGuestCompositionLocked
                      ? true
                      : concertGuestCompositionEffectiveFieldMode === "optional" &&
                        !hasConcertGuestCompositionInput
                        ? value <= 0
                        : value <= 0;
                    const increaseDisabled =
                      concertGuestCompositionLocked || value >= selectedConcertGuests;

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl bg-white px-3 py-2.5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
                      >
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                          {label}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleConcertGuestCompositionChange(key, -1)}
                            disabled={decreaseDisabled}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-base font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            aria-label={`${label} -`}
                          >
                            -
                          </button>
                          <div className="min-w-[2.5rem] text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {value}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleConcertGuestCompositionChange(key, 1)}
                            disabled={increaseDisabled}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-base font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            aria-label={`${label} +`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {concertGuestCompositionPolicyMessage &&
                !concertGuestCompositionError &&
                !concertRequiresEvenGuestCount ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    {concertGuestCompositionPolicyMessage}
                  </div>
                ) : null}

                {concertGuestCompositionError ? (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                    {concertGuestCompositionError}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                placeholder={t("Full Name")}
                value={concertForm.customer_name}
                onChange={(e) => setConcertForm((prev) => ({ ...prev, customer_name: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
              <input
                type="tel"
                placeholder={t("Phone")}
                value={concertForm.customer_phone}
                onChange={(e) => setConcertForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
              <input
                type="email"
                placeholder={t("Email")}
                value={concertForm.customer_email}
                onChange={(e) => setConcertForm((prev) => ({ ...prev, customer_email: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
                autoComplete="email"
              />
              <input
                type="text"
                placeholder={t("Bank transfer reference (optional)")}
                value={concertForm.bank_reference}
                onChange={(e) => setConcertForm((prev) => ({ ...prev, bank_reference: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
              />
              <textarea
                rows={2}
                placeholder={t("Notes (optional)")}
                value={concertForm.customer_note}
                onChange={(e) => setConcertForm((prev) => ({ ...prev, customer_note: e.target.value }))}
                className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm resize-none"
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-start justify-between gap-3">
                <p className="whitespace-pre-line">
                  {concertBankInstructions}
                </p>
                <button
                  type="button"
                  onClick={copyConcertInstructions}
                  className="shrink-0 rounded-lg border border-amber-300/80 dark:border-amber-800 px-2 py-1 text-[11px] font-semibold hover:bg-amber-100/80 dark:hover:bg-amber-900/40 transition"
                >
                  {concertInstructionCopied ? t("Copied") : t("Copy")}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={submitConcertBooking}
              disabled={
                concertSubmitting ||
                concertEventHasStarted ||
                !concertGuestCountValid ||
                !!concertGuestCompositionError
              }
              className="w-full rounded-xl border px-4 py-3 text-sm font-semibold text-white disabled:opacity-55"
              style={{
                backgroundColor: concertReservationButtonColor,
                borderColor: concertReservationButtonColor,
              }}
            >
              {concertSubmitting ? t("Please wait...") : t("Buy Ticket")}
            </button>
          </div>
        </div>
      ) : null}

	  </div>
	  </div>
	  );





}





function ReservationSlotSelect({
  value,
  onChange,
  slots = [],
  disabled = false,
  invalid = false,
  t,
}) {
  return (
    <select
      className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
        invalid ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
      }`}
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      <option value="">{t("Select Time")}</option>
      {(Array.isArray(slots) ? slots : []).map((slot) => (
        <option
          key={`${slot.time}-${slot.availabilityStatus}`}
          value={slot.time}
          disabled={!slot.isAvailable}
        >
          {slot.label}
        </option>
      ))}
    </select>
  );
}

/* ====================== TAKEAWAY ORDER FORM ====================== */
function TakeawayOrderForm({
  submitting,
  t,
  onClose,
  onSubmit,
  onAddItem,
  initialValues,
  tables = [],
  occupiedTables = [],
  reservedTables = [],
  pickupEnabled = true,
  guestCompositionSettings = null,
  paymentMethod,
  setPaymentMethod,
  formatTableName,
  submitButtonColor = "#111827",
  loadReservationTimeSlots = null,
  loadReservationAvailability = null,
  bookingSettings = null,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const paymentMethods = usePaymentMethods();
  const submitButtonTextColor = getReadableTextColor(submitButtonColor);
  const normalizedBookingSettings = useMemo(
    () => normalizeQrBookingSettings(bookingSettings || {}),
    [bookingSettings]
  );
  const guestCompositionEnabledSetting = Boolean(guestCompositionSettings?.enabled);
  const guestCompositionFieldModeSetting = guestCompositionSettings?.fieldMode;
  const normalizedInitialValues = useMemo(
    () => {
      const initialFieldMode = normalizeGuestCompositionFieldMode(
        guestCompositionFieldModeSetting,
        "hidden"
      );
      const initialGuestCompositionEnabled =
        guestCompositionEnabledSetting && initialFieldMode !== "hidden";
      const hasInitialGuestCompositionInput =
        hasGuestCompositionValue(initialValues?.reservation_men) ||
        hasGuestCompositionValue(initialValues?.reservation_women);
      const guestComposition =
        initialGuestCompositionEnabled &&
        (initialFieldMode === "required" || hasInitialGuestCompositionInput)
          ? buildGuestComposition(
              initialValues?.reservation_clients,
              initialValues?.reservation_men,
              initialValues?.reservation_women,
              {
                menKey: "reservation_men",
                womenKey: "reservation_women",
              }
            )
          : {
              reservation_men: initialValues?.reservation_men || "",
              reservation_women: initialValues?.reservation_women || "",
            };

      return {
        name: initialValues?.name || "",
        phone: formatQrPhoneForInput(initialValues?.phone || ""),
        email: initialValues?.email || "",
        pickup_date: initialValues?.pickup_date || "",
        pickup_time: initialValues?.pickup_time || "",
        mode: pickupEnabled
          ? (initialValues?.mode || "reservation")
          : "reservation",
        table_number: initialValues?.table_number ? String(initialValues.table_number) : "auto",
        reservation_clients: initialValues?.reservation_clients || "",
        ...guestComposition,
        notes: initialValues?.notes || "",
        payment_method: initialValues?.payment_method || "",
      };
    },
    [
      initialValues,
      pickupEnabled,
      guestCompositionEnabledSetting,
      guestCompositionFieldModeSetting,
    ]
  );
  const [form, setForm] = useState({
    ...normalizedInitialValues,
  });
  const [touched, setTouched] = useState({});
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const [shakeModal, setShakeModal] = useState(false);
  const [reservationTimeSlotsLoading, setReservationTimeSlotsLoading] = useState(false);
  const [reservationTimeSlots, setReservationTimeSlots] = useState([]);
  const [dateScopedAvailability, setDateScopedAvailability] = useState(null);
  const maxBookingDate = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + getEffectiveBookingMaxDaysInAdvance(normalizedBookingSettings));
    return next.toISOString().slice(0, 10);
  }, [normalizedBookingSettings]);

  useEffect(() => {
    setForm(normalizedInitialValues);
  }, [normalizedInitialValues]);

  useEffect(() => {
    let active = true;
    if (
      form.mode !== "reservation" ||
      !form.pickup_date ||
      typeof loadReservationTimeSlots !== "function"
    ) {
      setReservationTimeSlotsLoading(false);
      setReservationTimeSlots([]);
      return undefined;
    }

    (async () => {
      try {
        if (active) setReservationTimeSlotsLoading(true);
        const next = await loadReservationTimeSlots(
          form.pickup_date,
          form.reservation_clients
        );
        if (!active) return;
        setReservationTimeSlots(
          normalizeReservationTimeSlotOptions(next?.timeSlots || next?.time_slots || [], t)
        );
      } catch {
        if (!active) return;
        setReservationTimeSlots([]);
      } finally {
        if (active) setReservationTimeSlotsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    form.mode,
    form.pickup_date,
    form.reservation_clients,
    loadReservationTimeSlots,
    t,
  ]);

  useEffect(() => {
    let active = true;
    if (
      form.mode !== "reservation" ||
      !form.pickup_date ||
      !form.pickup_time ||
      typeof loadReservationAvailability !== "function"
    ) {
      setDateScopedAvailability(null);
      return undefined;
    }

    (async () => {
      try {
        const next = await loadReservationAvailability(
          form.pickup_date,
          form.pickup_time,
          form.reservation_clients
        );
        if (!active) return;
        setDateScopedAvailability(
          next && typeof next === "object"
            ? {
                availableTables: Array.isArray(next.availableTables || next.available_tables)
                  ? next.availableTables || next.available_tables
                  : [],
                occupiedTables: Array.isArray(next.occupiedTables) ? next.occupiedTables : [],
                reservedTables: Array.isArray(next.reservedTables) ? next.reservedTables : [],
                availabilityStatus: String(
                  next.availabilityStatus || next.availability_status || ""
                ).trim(),
                nextAvailableTime: String(
                  next.nextAvailableTime || next.next_available_time || ""
                ).trim(),
                selectedSlot: next.selectedSlot || next.selected_slot || null,
              }
            : {
                availableTables: [],
                occupiedTables: [],
                reservedTables: [],
                availabilityStatus: "",
                nextAvailableTime: "",
                selectedSlot: null,
              }
        );
      } catch {
        if (!active) return;
        setDateScopedAvailability(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [form.mode, form.pickup_date, form.pickup_time, form.reservation_clients, loadReservationAvailability]);

  const safeTables = useMemo(() => (Array.isArray(tables) ? tables : []), [tables]);
  const availableReservationTables = useMemo(() => {
    if (form.mode !== "reservation") return [];
    const scopedTables = Array.isArray(dateScopedAvailability?.availableTables)
      ? dateScopedAvailability.availableTables
      : [];
    return scopedTables.map((row) => ({
      ...row,
      tableNumber: Number(row?.table_number ?? row?.tableNumber ?? row?.number),
      seats: Number(row?.seats ?? row?.guest_limit ?? 0),
    }));
  }, [dateScopedAvailability?.availableTables, form.mode]);
  const reservedTableSet = useMemo(() => {
    const set = new Set();
    (Array.isArray(dateScopedAvailability?.reservedTables) ? dateScopedAvailability.reservedTables : [])
      .forEach((value) => {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) set.add(n);
      });
    return set;
  }, [dateScopedAvailability?.reservedTables]);

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
  const requiresPayment = pickupEnabled && form.mode !== "reservation";
  const normalizedPhone = normalizeQrPhone(form.phone);
  const phoneValid = QR_PHONE_REGEX.test(normalizedPhone);
  const emailValid = !form.email.trim() || EMAIL_REGEX.test(form.email.trim());
  const reservationSlotPreview = useMemo(() => {
    if (!form.pickup_date || !form.pickup_time) return null;
    const slot =
      dateScopedAvailability?.selectedSlot ||
      computeReservationSlot({
        reservationDate: form.pickup_date,
        reservationTime: form.pickup_time,
        settings: normalizedBookingSettings,
      });
    if (!slot?.slot_end_datetime) return null;
    const start = parseLocalDateTime(slot.slot_start_datetime);
    const end = parseLocalDateTime(slot.slot_end_datetime);
    if (!start || !end) return null;
    return {
      label: `${start.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })} • ${start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })} - ${end.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })}`,
      slot,
    };
  }, [
    dateScopedAvailability?.selectedSlot,
    form.pickup_date,
    form.pickup_time,
    normalizedBookingSettings,
  ]);
  const selectedTableNumber = Number(form.table_number);
  const selectedReservationTimeSlot = useMemo(
    () =>
      reservationTimeSlots.find(
        (slot) => slot.time === String(form.pickup_time || "").slice(0, 5)
      ) || null,
    [form.pickup_time, reservationTimeSlots]
  );
  const selectedTable = useMemo(
    () =>
      availableReservationTables.find(
        (tbl) => Number(tbl?.tableNumber ?? tbl?.table_number) === selectedTableNumber
      ) ||
      safeTables.find((tbl) => Number(tbl?.tableNumber) === selectedTableNumber) ||
      null,
    [availableReservationTables, safeTables, selectedTableNumber]
  );
  const reservationClientsCount = Number(form.reservation_clients);
  const reservationGuestCompositionDisabledForSelectedTable =
    requiresReservationTable &&
    Number.isFinite(selectedTableNumber) &&
    selectedTableNumber > 0 &&
    normalizeQrTableNumberList(guestCompositionSettings?.disabledTables).includes(
      selectedTableNumber
    );
  const reservationGuestCompositionEnabled =
    requiresReservationTable &&
    Boolean(guestCompositionSettings?.enabled) &&
    !reservationGuestCompositionDisabledForSelectedTable;
  const reservationGuestCompositionFieldMode = normalizeGuestCompositionFieldMode(
    guestCompositionSettings?.fieldMode,
    "hidden"
  );
  const reservationGuestCompositionRestrictionRule = normalizeGuestCompositionRestrictionRule(
    guestCompositionSettings?.restrictionRule,
    "no_restriction"
  );
  const reservationGuestCompositionRequiresInput = guestCompositionRuleRequiresInput(
    reservationGuestCompositionRestrictionRule
  );
  const reservationGuestCompositionEffectiveFieldMode =
    reservationGuestCompositionRequiresInput
      ? "required"
      : reservationGuestCompositionFieldMode;
  const reservationGuestCompositionVisible =
    reservationGuestCompositionEnabled &&
    reservationGuestCompositionEffectiveFieldMode !== "hidden";
  const reservationRequiresEvenGuestCount =
    reservationGuestCompositionVisible &&
    reservationGuestCompositionRestrictionRule === "couple_only";
  const reservationGuestCompositionLocked = reservationRequiresEvenGuestCount;
  const reservationGuestCap = useMemo(() => {
    const selectedSeats = Number(
      selectedTable?.seats ?? selectedTable?.guest_limit ?? selectedTable?.guests ?? 0
    );
    if (Number.isFinite(selectedSeats) && selectedSeats > 0) {
      return Math.max(1, Math.floor(selectedSeats));
    }
    const maxAvailableSeats = availableReservationTables.reduce((maxSeats, row) => {
      const nextSeats = Number(row?.seats ?? row?.guest_limit ?? row?.guests ?? 0);
      if (!Number.isFinite(nextSeats) || nextSeats <= 0) return maxSeats;
      return Math.max(maxSeats, Math.floor(nextSeats));
    }, 0);
    return maxAvailableSeats > 0 ? maxAvailableSeats : 20;
  }, [availableReservationTables, selectedTable]);
  const guestOptions = useMemo(
    () => buildGuestCountOptions(reservationGuestCap, reservationRequiresEvenGuestCount),
    [reservationGuestCap, reservationRequiresEvenGuestCount]
  );
  const reservationMenCount = parseGuestCompositionCount(form.reservation_men);
  const reservationWomenCount = parseGuestCompositionCount(form.reservation_women);
  const hasReservationGuestCompositionInput =
    hasGuestCompositionValue(form.reservation_men) ||
    hasGuestCompositionValue(form.reservation_women);
  const hasReservationClients =
    requiresReservationTable &&
    guestOptions.includes(reservationClientsCount);
  const reservationGuestCompositionPolicyMessage =
    reservationGuestCompositionVisible &&
    reservationGuestCompositionRestrictionRule !== "no_restriction"
      ? resolveGuestCompositionPolicyMessage(
          guestCompositionSettings?.validationMessage,
          reservationGuestCompositionRestrictionRule,
          t
        )
      : "";
  const reservationGuestCompositionError = getGuestCompositionValidationError({
    enabled: reservationGuestCompositionEnabled,
    fieldMode: reservationGuestCompositionEffectiveFieldMode,
    restrictionRule: reservationGuestCompositionRestrictionRule,
    validationMessage: reservationGuestCompositionPolicyMessage,
    totalGuests: reservationClientsCount,
    menGuests: form.reservation_men,
    womenGuests: form.reservation_women,
    translate: t,
  });
  const hasReservationTable =
    requiresReservationTable &&
    ((String(form.table_number) === "auto" && availableReservationTables.length > 0) ||
      (Number.isFinite(selectedTableNumber) &&
        selectedTableNumber > 0 &&
        availableReservationTables.some(
          (row) => Number(row?.tableNumber ?? row?.table_number) === selectedTableNumber
        )));
  const hasValidReservationTimeSlot =
    !requiresReservationTable ||
    (!reservationTimeSlotsLoading &&
      !!selectedReservationTimeSlot &&
      selectedReservationTimeSlot.isAvailable);
  const valid =
    form.name &&
    phoneValid &&
    emailValid &&
    form.pickup_date &&
    form.pickup_time &&
    hasValidReservationTimeSlot &&
    (!requiresReservationTable ||
      (hasReservationTable && hasReservationClients && !reservationGuestCompositionError)) &&
    (!requiresPayment || !!form.payment_method);
  const reservationSubmitDisabled =
    submitting ||
    reservationTimeSlotsLoading ||
    (form.mode === "reservation" && !valid);
  const reservationAvailabilityStatus = String(
    dateScopedAvailability?.availabilityStatus ||
      (form.pickup_date && form.pickup_time
        ? availableReservationTables.length > 0
          ? "available"
          : "fully_booked"
        : "")
  )
    .trim()
    .toLowerCase();
  const reservationAvailabilityBadge = useMemo(() => {
    switch (reservationAvailabilityStatus) {
      case "limited":
        return {
          label: t("Limited Availability"),
          className:
            "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
        };
      case "fully_booked":
        return {
          label: t("Fully Booked"),
          className:
            "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200",
        };
      case "available":
        return {
          label: t("Available"),
          className:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
        };
      default:
        return null;
    }
  }, [reservationAvailabilityStatus, t]);
  const nextAvailableTimeLabel = useMemo(() => {
    const raw = String(dateScopedAvailability?.nextAvailableTime || "").trim();
    if (!raw) return "";
    return `${t("Next Available")}: ${raw}`;
  }, [dateScopedAvailability?.nextAvailableTime, t]);

  useEffect(() => {
    if (!requiresReservationTable) return;
    if (!Number.isFinite(selectedTableNumber) || selectedTableNumber <= 0) return;
    setForm((prev) => {
      const next = normalizeGuestCountSelection(prev.reservation_clients, guestOptions);
      if (prev.reservation_clients === next) return prev;
      return { ...prev, reservation_clients: next };
    });
  }, [requiresReservationTable, selectedTableNumber, guestOptions]);

  useEffect(() => {
    if (!form.pickup_date) return;
    if (!reservationTimeSlots.length) {
      setForm((prev) => (prev.pickup_time ? { ...prev, pickup_time: "" } : prev));
      return;
    }
    const normalizedCurrentTime = String(form.pickup_time || "").slice(0, 5);
    if (
      !normalizedCurrentTime ||
      reservationTimeSlots.some(
        (slot) => slot.time === normalizedCurrentTime && slot.isAvailable
      )
    ) {
      return;
    }
    setForm((prev) => ({ ...prev, pickup_time: "" }));
  }, [form.pickup_date, form.pickup_time, reservationTimeSlots]);

  useEffect(() => {
    if (!requiresReservationTable) return;
    const availableTableNumbers = new Set(
      availableReservationTables
        .map((row) => Number(row?.tableNumber ?? row?.table_number))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    setForm((prev) => {
      const current = String(prev.table_number || "").trim();
      if (!current) {
        return availableTableNumbers.size > 0 ? { ...prev, table_number: "auto" } : prev;
      }
      if (current === "auto") {
        return availableTableNumbers.size > 0 ? prev : { ...prev, table_number: "" };
      }
      const currentNumber = Number(current);
      if (Number.isFinite(currentNumber) && availableTableNumbers.has(currentNumber)) {
        return prev;
      }
      return {
        ...prev,
        table_number: availableTableNumbers.size > 0 ? "auto" : "",
      };
    });
  }, [availableReservationTables, requiresReservationTable]);

  useEffect(() => {
    if (!requiresReservationTable || !reservationGuestCompositionVisible) {
      setForm((prev) => {
        if (!prev.reservation_men && !prev.reservation_women) return prev;
        return {
          ...prev,
          reservation_men: "",
          reservation_women: "",
        };
      });
      return;
    }
    setForm((prev) => {
      const hasInput =
        hasGuestCompositionValue(prev.reservation_men) ||
        hasGuestCompositionValue(prev.reservation_women);
      if (reservationGuestCompositionEffectiveFieldMode === "optional" && !hasInput) {
        return prev;
      }
      const nextComposition = buildGuestComposition(
        prev.reservation_clients,
        prev.reservation_men,
        prev.reservation_women,
        {
          menKey: "reservation_men",
          womenKey: "reservation_women",
        }
      );
      if (
        prev.reservation_men === nextComposition.reservation_men &&
        prev.reservation_women === nextComposition.reservation_women
      ) {
        return prev;
      }
      return { ...prev, ...nextComposition };
    });
  }, [
    requiresReservationTable,
    reservationGuestCompositionVisible,
    reservationGuestCompositionEffectiveFieldMode,
    form.reservation_clients,
  ]);

  useEffect(() => {
    if (pickupEnabled) return;
    if (form.mode !== "reservation") {
      setForm((prev) => ({ ...prev, mode: "reservation" }));
    }
  }, [pickupEnabled, form.mode]);

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

  const handleGuestCompositionChange = useCallback((field, delta) => {
    setForm((prev) => {
      if (reservationGuestCompositionLocked) return prev;
      const totalGuests = parseGuestCompositionCount(prev.reservation_clients);
      if (totalGuests <= 0) return prev;

      const hasInput =
        hasGuestCompositionValue(prev.reservation_men) ||
        hasGuestCompositionValue(prev.reservation_women);
      const currentMen = hasInput
        ? parseGuestCompositionCount(prev.reservation_men)
        : field === "reservation_men"
          ? 0
          : totalGuests;
      const currentWomen = hasInput
        ? parseGuestCompositionCount(prev.reservation_women)
        : field === "reservation_women"
          ? 0
          : totalGuests;
      const currentValue = field === "reservation_men" ? currentMen : currentWomen;
      const nextValue = Math.min(totalGuests, Math.max(0, currentValue + delta));

      const nextMen =
        field === "reservation_men" ? nextValue : totalGuests - nextValue;
      const nextWomen =
        field === "reservation_women" ? nextValue : totalGuests - nextValue;
      const nextMenValue = String(nextMen);
      const nextWomenValue = String(nextWomen);

      if (
        prev.reservation_men === nextMenValue &&
        prev.reservation_women === nextWomenValue
      ) {
        return prev;
      }

      return {
        ...prev,
        reservation_men: nextMenValue,
        reservation_women: nextWomenValue,
      };
    });
  }, [reservationGuestCompositionLocked]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!valid) {
      setTouched({
        name: true,
        phone: true,
        email: true,
        pickup_date: true,
        pickup_time: true,
        table_number: requiresReservationTable,
        reservation_clients: requiresReservationTable,
        payment_method: requiresPayment,
      });
      if (requiresReservationTable && !hasValidReservationTimeSlot) {
        return;
      }
      if (requiresPayment && !form.payment_method) {
        triggerPaymentError();
        return;
      }
      return;
    }
    onSubmit({ ...form, phone: normalizedPhone });
  };

  return (
    <div className="fixed inset-0 z-[160] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl p-5 space-y-4 relative"
        style={shakeModal ? { animation: "takeawayShake 420ms ease-in-out" } : undefined}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label={t("Close")}
          className="absolute right-4 top-4 text-2xl leading-none text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>

        {/* Title */}
        <div className="pr-8">
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{t("Reservation")}</p>
          <h2 className="text-2xl font-extrabold leading-tight text-neutral-900 dark:text-neutral-100">
            {t("Information")}
          </h2>
        </div>

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          {/* Pickup / Reservation Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                {t("Select Date")}
              </label>
              <input
                type="date"
                min={today}
                max={maxBookingDate}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
                  touched.pickup_date && !form.pickup_date ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
                }`}
                value={form.pickup_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pickup_date: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                {t("Select Time")}
              </label>
              <ReservationSlotSelect
                value={form.pickup_time}
                onChange={(e) => setForm((f) => ({ ...f, pickup_time: e.target.value }))}
                slots={reservationTimeSlots}
                disabled={
                  !form.pickup_date ||
                  reservationTimeSlotsLoading ||
                  reservationTimeSlots.length === 0
                }
                invalid={touched.pickup_time && !hasValidReservationTimeSlot}
                t={t}
              />
              {reservationTimeSlotsLoading ? (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {t("Loading...")}
                </p>
              ) : null}
            </div>
          </div>

          {form.mode === "reservation" && (reservationSlotPreview || reservationAvailabilityBadge) ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  {reservationSlotPreview ? (
                    <>
                      <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                        {t("Reservation Time")}
                      </p>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {reservationSlotPreview.label}
                      </p>
                    </>
                  ) : null}
                  {reservationSlotPreview?.slot?.reservation_duration_minutes ? (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {t("Duration")}: {reservationSlotPreview.slot.reservation_duration_minutes} min
                    </p>
                  ) : null}
                </div>
                {reservationAvailabilityBadge ? (
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${reservationAvailabilityBadge.className}`}
                  >
                    {reservationAvailabilityBadge.label}
                  </span>
                ) : null}
              </div>
              {nextAvailableTimeLabel ? (
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {nextAvailableTimeLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Pickup / Reservation toggle */}
          {pickupEnabled ? (
            <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
              {t("Pickup / Reservation")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: "reservation" }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  form.mode === "reservation"
                    ? ""
                    : "bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700"
                }`}
                style={
                  form.mode === "reservation"
                    ? {
                        backgroundColor: submitButtonColor,
                        borderColor: submitButtonColor,
                        color: submitButtonTextColor,
                      }
                    : undefined
                }
              >
                🎫 {t("Reservation")}
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, mode: "pickup" }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                  form.mode === "pickup"
                    ? ""
                    : "bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-700"
                }`}
                style={
                  form.mode === "pickup"
                    ? {
                        backgroundColor: submitButtonColor,
                        borderColor: submitButtonColor,
                        color: submitButtonTextColor,
                      }
                    : undefined
                }
              >
                🛍️ {t("Pickup")}
              </button>
            </div>
            </div>
          ) : null}

          {/* Table select (only for reservation) */}
          {form.mode === "reservation" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                  {t("Guests")}
                </label>
                <select
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
                    touched.reservation_clients && !hasReservationClients ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
                  }`}
                  value={form.reservation_clients}
                  onChange={(e) => setForm((f) => ({ ...f, reservation_clients: e.target.value }))}
                  disabled={!form.pickup_date || !form.pickup_time || guestOptions.length === 0}
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
                {reservationRequiresEvenGuestCount ? (
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {reservationGuestCompositionPolicyMessage}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                  {t("Select Table")}
                </label>
                <select
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
                    touched.table_number && !hasReservationTable ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
                  }`}
                  value={form.table_number}
                  onChange={(e) => setForm((f) => ({ ...f, table_number: e.target.value }))}
                  disabled={!form.pickup_date || !form.pickup_time}
                >
                  <option value="">
                    {!form.pickup_date || !form.pickup_time
                      ? t("Select Time")
                      : t("Select Table")}
                  </option>
                  {availableReservationTables.length > 0 ? (
                    <option value="auto">{t("Auto-assign best table")}</option>
                  ) : null}
                  {availableReservationTables.map((tbl) => {
                    const tableNumber = Number(tbl?.tableNumber ?? tbl?.table_number);
                    if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;
                    const tableText =
                      typeof formatTableName === "function"
                        ? formatTableName({
                            ...tbl,
                            tableNumber,
                          })
                        : `${t("Table")} ${String(tableNumber).padStart(2, "0")}`;
                    const seats = Number(tbl?.seats ?? 0);
                    const limited = reservedTableSet.has(tableNumber);
                    return (
                      <option key={tableNumber} value={String(tableNumber)}>
                        {`${tableText}${seats > 0 ? ` • ${seats} ${t("Guests")}` : ""}${
                          limited ? ` • ${t("Limited Availability")}` : ""
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
                {String(form.table_number) === "auto" && availableReservationTables.length > 0 ? (
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {t("Auto-assign best table")}
                  </p>
                ) : null}
                {!form.pickup_date || !form.pickup_time ? null : availableReservationTables.length === 0 ? (
                  <p className="mt-1 text-xs text-rose-600">
                    {reservationAvailabilityBadge?.label || t("Fully Booked")}
                  </p>
                ) : null}
              </div>
              {selectedTable && String(form.table_number) !== "auto" ? (
                <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                    {typeof formatTableName === "function"
                      ? formatTableName({
                          ...selectedTable,
                          tableNumber: Number(
                            selectedTable?.tableNumber ?? selectedTable?.table_number
                          ),
                        })
                      : `${t("Table")} ${String(selectedTableNumber).padStart(2, "0")}`}
                  </div>
                  {Number(selectedTable?.seats || 0) > 0 ? (
                    <div className="mt-1">
                      {selectedTable.seats} {t("Guests")}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <input
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm"
            placeholder={t("Full Name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          <input
            className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
              touched.phone && !phoneValid ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
            }`}
            placeholder={t("Phone (+90 555 555 55 55)")}
            value={form.phone}
            onChange={(e) => {
              setForm((f) => ({ ...f, phone: formatQrPhoneForInput(e.target.value) }));
            }}
            inputMode="tel"
            maxLength={18}
          />

          <input
            type="email"
            className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
              touched.email && !emailValid ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
            }`}
            placeholder={t("Email")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            autoComplete="email"
          />

          {form.mode === "reservation" && reservationGuestCompositionVisible && (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3 dark:border-neutral-800 dark:bg-neutral-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                    {t("Guest composition")}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {hasReservationGuestCompositionInput
                      ? `${reservationMenCount + reservationWomenCount}/${reservationClientsCount} ${t("Guests")}`
                      : reservationGuestCompositionEffectiveFieldMode === "required"
                        ? `${reservationClientsCount || 0} ${t("Guests")}`
                        : t("Select Guests")}
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-800">
                  {hasReservationClients ? reservationClientsCount : 0}
                </div>
              </div>

              <div className="space-y-2">
                {[
                  {
                    key: "reservation_men",
                    label: t("Men"),
                    value: reservationMenCount,
                  },
                  {
                    key: "reservation_women",
                    label: t("Women"),
                    value: reservationWomenCount,
                  },
                ].map(({ key, label, value }) => {
                  const decreaseDisabled =
                    reservationGuestCompositionLocked ||
                    !hasReservationClients ||
                    value <= 0;
                  const increaseDisabled =
                    reservationGuestCompositionLocked ||
                    !hasReservationClients ||
                    value >= reservationClientsCount;

                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-2xl bg-white px-3 py-2.5 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800"
                    >
                      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                        {label}
                      </span>

                      {reservationGuestCompositionLocked ? (
                        <div className="min-w-[2.5rem] rounded-full bg-neutral-100 px-3 py-1 text-center text-sm font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
                          {value}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleGuestCompositionChange(key, -1)}
                            disabled={decreaseDisabled}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-base font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            aria-label={`${label} -`}
                          >
                            -
                          </button>
                          <div className="min-w-[2.5rem] text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {value}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleGuestCompositionChange(key, 1)}
                            disabled={increaseDisabled}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-base font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                            aria-label={`${label} +`}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {reservationGuestCompositionPolicyMessage &&
              !reservationGuestCompositionError &&
              !reservationRequiresEvenGuestCount ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  {reservationGuestCompositionPolicyMessage}
                </div>
              ) : null}

              {reservationGuestCompositionError ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                  {reservationGuestCompositionError}
                </div>
              ) : null}
            </div>
          )}

          {/* Payment Method */}
          {requiresPayment && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("Payment Method")}</label>
              <select
                className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white dark:bg-neutral-950 ${
                  paymentPrompt && !form.payment_method ? "border-red-500" : "border-neutral-300 dark:border-neutral-700"
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
            className="w-full rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2.5 text-sm resize-none h-24"
            placeholder={t("Notes (optional)")}
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={reservationSubmitDisabled}
            className="w-full rounded-xl border px-4 py-3 text-sm font-semibold text-white disabled:opacity-55"
            style={{
              backgroundColor: submitButtonColor,
              borderColor: submitButtonColor,
              color: submitButtonTextColor,
            }}
          >
            {submitting
              ? t("Please wait...")
              : form.mode === "reservation"
                ? t("Reserve now")
                : t("Continue")}
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
  reservationEnabled = true,
  tableEnabled = true,
  shopIsOpen = true,
  accentColor = "#111827",
}) {
  const productName = String(product?.name || "").trim();
  const isGeneric = !productName;
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const enabledActionStyle = {
    backgroundColor: resolvedAccentColor,
    borderColor: resolvedAccentColor,
    color: accentTextColor,
    boxShadow: `0 14px 28px ${toRgba(resolvedAccentColor, 0.18) || "rgba(15,23,42,0.18)"}`,
  };
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
            onClick={() => shopIsOpen && reservationEnabled && onSelect?.("takeaway")}
            disabled={!shopIsOpen || !reservationEnabled}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition ${
              shopIsOpen && reservationEnabled
                ? "hover:opacity-95"
                : "border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed"
            }`}
            style={shopIsOpen && reservationEnabled ? enabledActionStyle : undefined}
          >
            <UtensilsCrossed className="w-5 h-5" />
            {shopIsOpen ? t("Reservation") : t("Shop Closed")}
          </button>
          <button
            onClick={() => shopIsOpen && tableEnabled && onSelect?.("table")}
            disabled={!shopIsOpen || !tableEnabled}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-lg transition ${
              shopIsOpen && tableEnabled
                ? "hover:opacity-95"
                : "border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed shadow-sm"
            }`}
            style={shopIsOpen && tableEnabled ? enabledActionStyle : undefined}
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
                  ? "hover:opacity-95"
                  : "border-neutral-200 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-950 text-neutral-400 cursor-not-allowed shadow-sm"
              }`}
              style={shopIsOpen ? enabledActionStyle : undefined}
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
  orderId,
  orderType,
  table,
  onOrderAnother,
  onCheckout,
  onClose,
  onFinished,
  t,
  appendIdentifier,
  cancelReason,
  orderScreenStatus,
  forceDark,
  forceLock = false,
  allowOrderAnotherWhenLocked = false,
  checkoutPending = false,
  checkoutCompletedLabel = false,
}) {
  if (!open || !orderId) return null;

  const backendStatus = (orderScreenStatus || "").toLowerCase(); // confirmed | cancelled | closed | ...
  const isCancelled = isCancelledLikeStatus(backendStatus);
  const lockBlocksActions = forceLock && !allowOrderAnotherWhenLocked;
  const lockBlocksForCancelState = lockBlocksActions && !isCancelled;

  return (
    <OrderStatusScreen
      orderId={orderId}
      table={orderType === "table" ? table : null}
      onOrderAnother={lockBlocksForCancelState ? null : onOrderAnother}
      onCheckout={onCheckout}
      onClose={lockBlocksForCancelState ? null : onClose}
      onFinished={onFinished}
      checkoutPending={checkoutPending}
      forceLock={forceLock}
      forceDark={forceDark}
      orderScreenStatus={orderScreenStatus}
      externalCancelReason={cancelReason}
      checkoutCompletedView={checkoutCompletedLabel}
      hideNativeHeader={false}
      offsetForAppHeader={false}
      t={t}
      buildUrl={(path) => apiUrl(path)}
      appendIdentifier={appendIdentifier}
    />
  );
}






/* ====================== MAIN QR MENU ====================== */
export default function QrMenu() {
  const { slug, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const handledNavigationOrderStatusRef = useRef(null);
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
    setSelectedProduct,
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
    takeaway,
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
    selectTableDirectly,
    closeTableScanner,
    resetToTypePicker,
    handleCloseOrderPage,
    hydrateCartFromActiveOrder,
    handleOrderAnother,
    handleSubmitOrder,
    handleReset,
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
    setOrderScreenStatus,
    setCustomerInfo,
  } = useQrMenuController({
    slug,
    id,
    QR_TOKEN_KEY,
    API_URL,
    API_BASE,
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

  const statusPortalOrderId = (() => {
    const activeStateId = Number(orderId || 0);
    if (Number.isFinite(activeStateId) && activeStateId > 0) return activeStateId;
    const activeOrderId = Number(activeOrder?.id || 0);
    if (Number.isFinite(activeOrderId) && activeOrderId > 0) return activeOrderId;
    const storedId = Number(storage.getItem("qr_active_order_id") || 0);
    return Number.isFinite(storedId) && storedId > 0 ? storedId : null;
  })();
  const [callWaiterFeedback, setCallWaiterFeedback] = useState("");
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [concertBookingConfirmLabel, setConcertBookingConfirmLabel] = useState(false);
  const [checkoutCompletedLabel, setCheckoutCompletedLabel] = useState(false);
  const [pendingNonTableConcertReorderLock, setPendingNonTableConcertReorderLock] = useState(false);
  const [showStandaloneSplash, setShowStandaloneSplash] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [downloadQrModalOpen, setDownloadQrModalOpen] = useState(false);
  const {
    isOpen: isAppHeaderDrawerOpen,
    openDrawer: openAppHeaderDrawer,
    closeDrawer: closeAppHeaderDrawer,
  } = useHeaderDrawer();
  const customerAuthFetcher = useCallback(
    async (path, options = undefined) => secureFetch(appendIdentifier(path), options),
    [appendIdentifier]
  );
  const {
    customer: qrCustomerSession,
    isLoggedIn: isCustomerLoggedIn,
    isRestoring: isCustomerAuthRestoring,
    login: loginCustomerSession,
    loginWithApple: loginCustomerWithApple,
    loginWithGoogle: loginCustomerWithGoogle,
    register: registerCustomerSession,
  } = useCustomerAuth(storage, {
    fetcher: customerAuthFetcher,
    identifier: restaurantIdentifier,
  });
  const isCustomerLoggedInEffective = Boolean(
    isCustomerLoggedIn || qrCustomerSession?.id
  );
  const [appHeaderDrawerInitialView, setAppHeaderDrawerInitialView] = useState("menu");
  const [isManualAuthModalOpen, setIsManualAuthModalOpen] = useState(false);
  const [isAuthWelcomeDismissed, setIsAuthWelcomeDismissed] = useState(false);
  const [authWelcomeView, setAuthWelcomeView] = useState("login");
  const callWaiterFeedbackTimeoutRef = useRef(null);
  const authPromptWasLoggedInRef = useRef(isCustomerLoggedInEffective);

  const handleCloseAppHeaderDrawer = useCallback(() => {
    closeAppHeaderDrawer();
    setAppHeaderDrawerInitialView("menu");
  }, [closeAppHeaderDrawer]);

  useEffect(() => {
    const wasLoggedIn = authPromptWasLoggedInRef.current;

    if (isCustomerLoggedInEffective) {
      setIsAuthWelcomeDismissed(false);
      setAuthWelcomeView("login");
      setIsManualAuthModalOpen(false);
      if (!wasLoggedIn) {
        handleCloseAppHeaderDrawer();
      }
    } else if (wasLoggedIn) {
      setIsAuthWelcomeDismissed(false);
      setAuthWelcomeView("login");
    }
    authPromptWasLoggedInRef.current = isCustomerLoggedInEffective;
  }, [handleCloseAppHeaderDrawer, isCustomerLoggedInEffective]);

  const openMenuHeaderDrawer = useCallback(() => {
    setAppHeaderDrawerInitialView("menu");
    openAppHeaderDrawer();
  }, [openAppHeaderDrawer]);

  const openFullScreenAuth = useCallback(
    (nextView = "login") => {
      setAuthWelcomeView(nextView === "register" ? "register" : "login");
      setIsManualAuthModalOpen(true);
      handleCloseAppHeaderDrawer();
    },
    [handleCloseAppHeaderDrawer]
  );

  const handleCloseAuthWelcomeModal = useCallback(() => {
    setIsManualAuthModalOpen(false);
    setIsAuthWelcomeDismissed(true);
  }, []);

  useEffect(() => {
    const authParamRaw = String(
      new URLSearchParams(location.search || "").get("auth") || ""
    )
      .trim()
      .toLowerCase();

    if (!authParamRaw) return;

    const targetView =
      authParamRaw === "register" ||
      authParamRaw === "signup" ||
      authParamRaw === "sign-up"
        ? "register"
        : authParamRaw === "login" || authParamRaw === "signin" || authParamRaw === "sign-in"
        ? "login"
        : "";

    if (!targetView) return;

    setAuthWelcomeView(targetView);
    setIsAuthWelcomeDismissed(false);
    setIsManualAuthModalOpen(true);
    handleCloseAppHeaderDrawer();
  }, [handleCloseAppHeaderDrawer, location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__isQrMenuPage = true;
    if (typeof document !== "undefined") {
      document.body.classList.add("qrmenu-font-theme");
    }
    return () => {
      window.__isQrMenuPage = false;
      if (typeof document !== "undefined") {
        document.body.classList.remove("qrmenu-font-theme");
        document.body.style.removeProperty("--qrmenu-font-family");
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.setProperty(
      "--qrmenu-font-family",
      resolveQrMenuFontFamily(orderSelectCustomization?.qrmenu_font_family)
    );
  }, [orderSelectCustomization?.qrmenu_font_family]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleCartVisibility = (event) => {
      setIsCartDrawerOpen(Boolean(event?.detail?.open));
    };
    window.addEventListener("qr:cart-visibility", handleCartVisibility);
    return () => {
      window.removeEventListener("qr:cart-visibility", handleCartVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const identifier =
      String(restaurantIdentifier || "").trim() ||
      String(slug || "").trim() ||
      String(id || "").trim();
    if (!identifier) return undefined;

    const themeColor = normalizeHexColor(
      orderSelectCustomization?.pwa_primary_color || orderSelectCustomization?.primary_color,
      "#4F46E5"
    );
    const backgroundColor = normalizeHexColor(
      orderSelectCustomization?.pwa_background_color,
      "#FFFFFF"
    );
    const brandingVersion = String(orderSelectCustomization?.branding_updated_at || "").trim();
    const manifestPath = `/api/public/manifest.json?identifier=${encodeURIComponent(identifier)}${
      brandingVersion ? `&v=${encodeURIComponent(brandingVersion)}` : ""
    }`;
    const manifestHref = toAbsolutePublicUrl(manifestPath);
    const appleTouchIconBase = resolveBrandingAsset(
      orderSelectCustomization?.apple_touch_icon ||
        orderSelectCustomization?.app_icon_192 ||
        orderSelectCustomization?.app_icon_512 ||
        orderSelectCustomization?.app_icon,
      "/apple-touch-icon.png"
    );
    const appleTouchIconHref = appendCacheVersion(
      toAbsolutePublicUrl(appleTouchIconBase),
      brandingVersion
    );
    const faviconPngBase = resolveBrandingAsset(
      orderSelectCustomization?.app_icon_192 ||
        orderSelectCustomization?.app_icon_512 ||
        orderSelectCustomization?.app_icon,
      "/icon-192.png"
    );
    const faviconPngHref = appendCacheVersion(
      toAbsolutePublicUrl(faviconPngBase),
      brandingVersion
    );
    const webAppTitle =
      String(orderSelectCustomization?.app_display_name || brandName || "").trim() ||
      "Beypro";

    const touched = [];
    const upsertMeta = (selector, attrs, content) => {
      let node = document.head.querySelector(selector);
      const created = !node;
      if (!node) {
        node = document.createElement("meta");
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        document.head.appendChild(node);
      }
      touched.push({
        node,
        created,
        attr: "content",
        previous: node.getAttribute("content"),
      });
      node.setAttribute("content", content);
    };
    const upsertLink = (selector, attrs, href) => {
      let node = document.head.querySelector(selector);
      const created = !node;
      if (!node) {
        node = document.createElement("link");
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        document.head.appendChild(node);
      }
      touched.push({
        node,
        created,
        attr: "href",
        previous: node.getAttribute("href"),
      });
      node.setAttribute("href", href);
    };

    upsertMeta('meta[name="theme-color"]', { name: "theme-color" }, themeColor);
    upsertMeta(
      'meta[name="apple-mobile-web-app-capable"]',
      { name: "apple-mobile-web-app-capable" },
      "yes"
    );
    upsertMeta(
      'meta[name="mobile-web-app-capable"]',
      { name: "mobile-web-app-capable" },
      "yes"
    );
    upsertMeta(
      'meta[name="apple-mobile-web-app-status-bar-style"]',
      { name: "apple-mobile-web-app-status-bar-style" },
      "default"
    );
    upsertMeta(
      'meta[name="apple-mobile-web-app-title"]',
      { name: "apple-mobile-web-app-title" },
      webAppTitle
    );
    upsertMeta('meta[name="background-color"]', { name: "background-color" }, backgroundColor);
    upsertLink('link[rel="manifest"]', { rel: "manifest" }, manifestHref);
    upsertLink(
      'link[rel="apple-touch-icon"][sizes="180x180"]',
      { rel: "apple-touch-icon", sizes: "180x180" },
      appleTouchIconHref
    );
    upsertLink(
      'link[rel="apple-touch-icon"][sizes="167x167"]',
      { rel: "apple-touch-icon", sizes: "167x167" },
      appleTouchIconHref
    );
    upsertLink(
      'link[rel="apple-touch-icon"][sizes="152x152"]',
      { rel: "apple-touch-icon", sizes: "152x152" },
      appleTouchIconHref
    );
    upsertLink('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon" }, appleTouchIconHref);
    upsertLink(
      'link[rel="icon"][type="image/png"][sizes="192x192"]',
      { rel: "icon", type: "image/png", sizes: "192x192" },
      faviconPngHref
    );

    return () => {
      touched.forEach(({ node, created, attr, previous }) => {
        if (created) {
          node.remove();
          return;
        }
        if (previous == null) {
          node.removeAttribute(attr);
        } else {
          node.setAttribute(attr, previous);
        }
      });
    };
  }, [
    id,
    restaurantIdentifier,
    slug,
    brandName,
    orderSelectCustomization?.app_display_name,
    orderSelectCustomization?.app_icon,
    orderSelectCustomization?.app_icon_192,
    orderSelectCustomization?.app_icon_512,
    orderSelectCustomization?.apple_touch_icon,
    orderSelectCustomization?.branding_updated_at,
    orderSelectCustomization?.primary_color,
    orderSelectCustomization?.pwa_background_color,
    orderSelectCustomization?.pwa_primary_color,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const standalone = isInStandaloneMode();
    const splashLogo = resolveBrandingAsset(
      orderSelectCustomization?.splash_logo ||
        orderSelectCustomization?.main_title_logo ||
        orderSelectCustomization?.app_icon ||
        "",
      ""
    );
    if (!standalone || !splashLogo) {
      setShowStandaloneSplash(false);
      return undefined;
    }
    setShowStandaloneSplash(true);
    const timerId = window.setTimeout(() => {
      setShowStandaloneSplash(false);
    }, 1200);
    return () => window.clearTimeout(timerId);
  }, [
    brandName,
    orderSelectCustomization?.app_display_name,
    orderSelectCustomization?.app_icon,
    orderSelectCustomization?.main_title_logo,
    orderSelectCustomization?.splash_logo,
    restaurantIdentifier,
  ]);

  const standaloneSplashLogo = resolveBrandingAsset(
    orderSelectCustomization?.splash_logo ||
      orderSelectCustomization?.main_title_logo ||
      orderSelectCustomization?.app_icon ||
      "",
    ""
  );
  const takeawaySubmitButtonColor = normalizeHexColor(
    orderSelectCustomization?.primary_color,
    "#4F46E5"
  );

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
  const normalizedActiveOrderStatus = String(orderScreenStatus || activeOrder?.status || "").toLowerCase();
  const reservationPendingCheckIn =
    resolvedOrderTypeForActions === "table" &&
    isReservationPendingCheckIn(activeOrder, normalizedActiveOrderStatus) &&
    Number.isFinite(resolvedTableForActions) &&
    resolvedTableForActions > 0;
  const requestSongEnabled =
    resolvedOrderTypeForActions === "table" &&
    Number.isFinite(resolvedTableForActions) &&
    resolvedTableForActions > 0 &&
    (
      activeOrder?.checked_in === true ||
      activeOrder?.reservation?.checked_in === true ||
      isCheckedInReservationStatus(orderScreenStatus) ||
      isCheckedInReservationStatus(activeOrder?.status) ||
      isCheckedInReservationStatus(activeOrder?.reservation?.status) ||
      isCheckedInReservationStatus(activeOrder?.reservation_status) ||
      isCheckedInReservationStatus(activeOrder?.reservationStatus)
    );
  const [isRequestSongViewOpen, setIsRequestSongViewOpen] = useState(false);
  const reservationPendingCheckInMessage = t("Items can be added after check-in.");
  const showReservationPendingCheckInMessage = useCallback(() => {
    alert(reservationPendingCheckInMessage);
  }, [reservationPendingCheckInMessage]);

  useEffect(() => {
    if (requestSongEnabled) return;
    setIsRequestSongViewOpen(false);
  }, [requestSongEnabled]);

  const showCallWaiterButton =
    (!showHome || showStatus) &&
    resolvedOrderTypeForActions === "table" &&
    Number.isFinite(resolvedTableForActions) &&
    resolvedTableForActions > 0;
  const callWaiterButtonDisabledBase = callingWaiter || callWaiterCooldownSeconds > 0;
  const homeLabel = t("Home");
  const callWaiterLabel = t("Waiter");
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
  const allowReservationPickup = boolish(
    orderSelectCustomization?.reservation_pickup_enabled,
    true
  );
  const allowTableOrder = boolish(orderSelectCustomization?.table_order_enabled, true);
  const tableQrScanEnabled = boolish(orderSelectCustomization?.table_qr_scan_enabled, true);
  const hideAllQrProducts = boolish(orderSelectCustomization?.disable_all_products, false);
  const editingCartItem = useMemo(
    () =>
      editingCartItemId
        ? cartItems.find((item) => String(item?.unique_id) === String(editingCartItemId)) || null
        : null,
    [cartItems, editingCartItemId]
  );
  const cartNewItemsCount = cartItems.filter((item) => !item?.locked).length;
  const isTableOrderProductPage = !showHome && resolvedOrderTypeForActions === "table";
  const takeawayMode = String(takeaway?.mode || "").toLowerCase();
  const isReservationProductPage =
    !showHome &&
    resolvedOrderTypeForActions === "takeaway" &&
    takeawayMode === "reservation";
  const isDeliveryProductPage = !showHome && resolvedOrderTypeForActions === "online";
  const forceBottomNavProductPage =
    isTableOrderProductPage || isReservationProductPage || isDeliveryProductPage;
  const canOpenCartFromNav = cartItems.length > 0 || hasActiveOrder || forceBottomNavProductPage;
  const hasBottomNavContext =
    showStatus || hasActiveOrder || cartItems.length > 0 || forceBottomNavProductPage;
  const showBottomActions =
    !isDesktopLayout &&
    !showTableSelector &&
    hasBottomNavContext &&
    (!showHome || showStatus) &&
    !isCartDrawerOpen;
  const showCustomerAuthWelcomeModal =
    isManualAuthModalOpen ||
    (
    !showStatus &&
    !showDeliveryForm &&
    !showTakeawayForm &&
    !showTableScanner &&
    !isCustomerLoggedInEffective &&
    !isAppHeaderDrawerOpen &&
    !isAuthWelcomeDismissed
    );
  const shouldLockReorderForNonTableConcert = (() => {
    const concertBookingType = String(
      activeOrder?.concert_booking_type ?? activeOrder?.concertBookingType ?? ""
    )
      .trim()
      .toLowerCase();
    const concertPaymentStatus = normalizeReservationStatus(
      activeOrder?.concert_booking_payment_status ?? activeOrder?.concertBookingPaymentStatus ?? ""
    );
    const concertBookingStatus = normalizeReservationStatus(
      activeOrder?.concert_booking_status ?? activeOrder?.concertBookingStatus ?? ""
    );
    const concertBookingId = Number(
      activeOrder?.concert_booking_id ?? activeOrder?.concertBookingId ?? 0
    );
    const hasConcertContextFromOrder = Boolean(
      (Number.isFinite(concertBookingId) && concertBookingId > 0) ||
        concertBookingType ||
        concertPaymentStatus ||
        concertBookingStatus
    );
    const isNonTableConcertFromOrder =
      hasConcertContextFromOrder &&
      (concertBookingType === "ticket" ||
        (concertBookingType !== "table" &&
          String(activeOrder?.order_type || "").toLowerCase() !== "table"));
    const isConcertConfirmed =
      concertPaymentStatus === "confirmed" || concertBookingStatus === "confirmed";
    const isConcertCheckedIn =
      activeOrder?.checked_in === true ||
      activeOrder?.reservation?.checked_in === true ||
      isCheckedInReservationStatus(orderScreenStatus) ||
      isCheckedInReservationStatus(activeOrder?.status) ||
      isCheckedInReservationStatus(concertBookingStatus);
    const lockFromOrder =
      isNonTableConcertFromOrder && (!isConcertConfirmed || !isConcertCheckedIn);

    // Keep lock active right after booking success (before fresh order payload hydrates).
    if (!hasConcertContextFromOrder && pendingNonTableConcertReorderLock) return true;
    return lockFromOrder;
  })();
  const canReOrderFromNav =
    Boolean(hasActiveOrder || showStatus) && !shouldLockReorderForNonTableConcert;
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
  const sharedHeaderOpenStatus = useMemo(
    () => ({
      isOpen: Boolean(shopIsOpen),
      label: shopIsOpen ? t("Open") : t("Closed"),
    }),
    [shopIsOpen, t]
  );
  const isQrHeaderDark = Boolean(isDarkMain);
  const sharedHeaderOrderType = useMemo(() => {
    if (isRequestSongViewOpen && requestSongEnabled) return "request_song";
    const normalized = String(orderType || "").toLowerCase();
    if (normalized === "table") return "table";
    if (normalized === "online") return "online";
    return "takeaway";
  }, [isRequestSongViewOpen, orderType, requestSongEnabled]);
  const shouldShowTableOrderHeader = !showStatus && sharedHeaderOrderType === "table";
  const shouldShowInnerOrderHeader = !showStatus && sharedHeaderOrderType !== "table";
  const handleBookingOrderTypeSelect = useCallback(
    (nextType) => {
      if (!nextType) return;
      if (nextType === "table") {
        if (isCustomerAuthRestoring) return;
        if (!isCustomerLoggedInEffective) {
          openFullScreenAuth("login");
          return;
        }
      }
      if (nextType === "takeaway") {
        if (isCustomerAuthRestoring && !isCustomerLoggedInEffective) return;
        const bookingPath = buildReservationBookingPath({
          pathname: location.pathname,
          slug,
          id,
          search: location.search,
        });
        navigate(
          isCustomerLoggedInEffective
            ? bookingPath
            : appendPublicBookingSubPath(bookingPath, "contact")
        );
        return;
      }
      triggerOrderType(nextType);
    },
    [
      id,
      isCustomerAuthRestoring,
      isCustomerLoggedInEffective,
      location.pathname,
      location.search,
      navigate,
      openFullScreenAuth,
      slug,
      triggerOrderType,
    ]
  );
  const handleSharedHeaderOrderTypeSelect = useCallback(
    (nextType) => {
      if (!nextType) return;
      if (nextType === "request_song") {
        if (!requestSongEnabled) return;
        setIsRequestSongViewOpen(true);
        return;
      }
      setIsRequestSongViewOpen(false);
      handleBookingOrderTypeSelect(nextType);
    },
    [handleBookingOrderTypeSelect, requestSongEnabled]
  );
  const handleEditCartItem = useCallback(
    (item) => {
      if (!item) return;
      if (reservationPendingCheckIn) {
        showReservationPendingCheckInMessage();
        return;
      }
      const sourceProduct =
        toArray(safeProducts).find((product) => Number(product?.id) === Number(item?.id)) || item;
      setEditingCartItemId(item?.unique_id || null);
      setReturnHomeAfterAdd(false);
      setSelectedProduct(sourceProduct);
      setShowAddModal(true);
    },
    [
      reservationPendingCheckIn,
      safeProducts,
      setReturnHomeAfterAdd,
      setSelectedProduct,
      setShowAddModal,
      showReservationPendingCheckInMessage,
    ]
  );

  useEffect(() => {
    if (!reservationPendingCheckIn) return;
    setCart((prev) => {
      const items = Array.isArray(prev) ? prev : [];
      return items.length > 0 ? [] : prev;
    });
    storage.setItem("qr_cart", "[]");
    setEditingCartItemId(null);
    setShowAddModal(false);
    setSelectedProduct(null);
    setQrVoiceModalOpen(false);
  }, [
    reservationPendingCheckIn,
    setCart,
    setEditingCartItemId,
    setQrVoiceModalOpen,
    setSelectedProduct,
    setShowAddModal,
    storage,
  ]);

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

  const onGoHomeFromNav = useCallback(() => {
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    setShowDeliveryForm(false);
    setShowTakeawayForm(false);
    setShowOrderTypePrompt(false);
    setPendingPopularProduct(null);
    setEditingCartItemId(null);
    setSelectedProduct(null);
    setQrVoiceModalOpen(false);
    setIsRequestSongViewOpen(false);
    setForceHome(true);
    handleCloseAppHeaderDrawer();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("qr:cart-close"));
      window.dispatchEvent(new Event("qr:voice-order-close"));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [
    setEditingCartItemId,
    setForceHome,
    handleCloseAppHeaderDrawer,
    setPendingPopularProduct,
    setQrVoiceModalOpen,
    setSelectedProduct,
    setShowDeliveryForm,
    setShowOrderTypePrompt,
    setShowStatus,
    setShowTakeawayForm,
    storage,
  ]);

  const onOpenCartFromNav = useCallback(async () => {
    // Ensure status overlay is dismissed before opening cart to avoid open/close flicker.
    setShowStatus(false);
    storage.setItem("qr_show_status", "0");
    setIsRequestSongViewOpen(false);
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

  const onOpenSharedCartFromVoice = useCallback(() => {
    window.dispatchEvent(new Event("qr:voice-order-close"));
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        onOpenCartFromNav();
      });
    } else {
      onOpenCartFromNav();
    }
  }, [onOpenCartFromNav]);

  const onOpenCatalogProductFromVoice = useCallback(
    (product) => {
      if (!product) return;
      if (reservationPendingCheckIn) {
        showReservationPendingCheckInMessage();
        return;
      }
      window.dispatchEvent(new Event("qr:voice-order-close"));
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          handleMenuProductOpen(product);
        });
      } else {
        handleMenuProductOpen(product);
      }
    },
    [handleMenuProductOpen, reservationPendingCheckIn, showReservationPendingCheckInMessage]
  );

  const syncVoiceDraftToSharedCart = useCallback(
    (draftItems = []) => {
      if (reservationPendingCheckIn) {
        showReservationPendingCheckInMessage();
        return;
      }
      const mappedDraftItems = toArray(draftItems).map((item, index) => {
        const product = item?.product || safeProducts.find((it) => String(it?.id) === String(item?.productId)) || null;
        const extras = toArray(item?.extras).map((extra, extraIndex) => ({
          ...(extra || {}),
          key:
            extra?.key ||
            extra?.id ||
            extra?.extraId ||
            `${extra?.name || "extra"}-${extraIndex}`,
          id: extra?.id ?? extra?.extraId ?? extra?.key ?? `${extra?.name || "extra"}-${extraIndex}`,
          name: extra?.name || "",
          price: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
          extraPrice: Number(extra?.price ?? extra?.extraPrice ?? 0) || 0,
          quantity: Math.max(1, Number(extra?.quantity) || 1),
        }));

        return {
          id: product?.id ?? item?.productId ?? null,
          name: product?.name || item?.name || t("Unknown product"),
          image: product?.image || null,
          price: Number(product?.price ?? item?.unitPrice ?? 0) || 0,
          quantity: Math.max(1, Number(item?.qty) || 1),
          extras,
          note: item?.notes || "",
          unique_id: `ai-draft-${item?.key || item?.productId || index}`,
          ai_draft: true,
        };
      });

      setCart((prev) => {
        const preserved = toArray(prev).filter((item) => !item?.ai_draft);
        return [...preserved, ...mappedDraftItems];
      });
    },
    [reservationPendingCheckIn, safeProducts, setCart, showReservationPendingCheckInMessage, t]
  );

  const onOpenVoiceFromNav = useCallback(() => {
    window.dispatchEvent(new Event("qr:voice-order-open"));
  }, []);

  const onReOrderFromNav = useCallback(async () => {
    // Use the same restore logic as "Order Another" so table flow does not fall back to home.
    window.dispatchEvent(new Event("qr:voice-order-close"));
    await handleOrderAnother?.();
  }, [handleOrderAnother]);
  const handleReservationCheckout = useCallback(async () => {
    if (!statusPortalOrderId || checkoutSubmitting) return;

    if (cartNewItemsCount > 0) {
      const openCart =
        typeof window === "undefined"
          ? false
          : window.confirm(t("You still have items in cart. Open cart before checkout?"));
      if (openCart) {
        await onOpenCartFromNav();
      }
      return;
    }

    const shouldCheckoutNow =
      typeof window === "undefined"
        ? false
        : window.confirm(t("Close this table and check out now?"));
    if (!shouldCheckoutNow) return;

    try {
      setCheckoutSubmitting(true);
      await secureFetch(appendIdentifier(`/orders/${statusPortalOrderId}/close`), {
        method: "POST",
        body: JSON.stringify({ preserve_reservation_checkout_badge: true }),
      });
      window.dispatchEvent(new Event("qr:voice-order-close"));
      storage.removeItem("qr_force_status_until_closed");
      storage.setItem("qr_show_status", "1");
      setOrderStatus("success");
      setShowStatus(true);
      setConcertBookingConfirmLabel(false);
      setCheckoutCompletedLabel(true);
    } catch (err) {
      alert(String(err?.message || t("Unable to check out right now.")));
    } finally {
      setCheckoutSubmitting(false);
    }
  }, [
    appendIdentifier,
    cartNewItemsCount,
    checkoutSubmitting,
    onOpenCartFromNav,
    setOrderStatus,
    setShowStatus,
    statusPortalOrderId,
    storage,
    t,
  ]);
  const onForceCloseStatusFromNav = useCallback(() => {
    storage.removeItem("qr_force_status_until_closed");
    storage.setItem("qr_show_status", "0");
    setConcertBookingConfirmLabel(false);
    setCheckoutCompletedLabel(false);
    setShowStatus(false);
    window.dispatchEvent(new Event("qr:voice-order-close"));
    resetToTypePicker?.({ allowForceClose: true });
  }, [resetToTypePicker, setShowStatus, storage]);

  const handleStatusModalClose = useCallback(
    (...args) => {
      setConcertBookingConfirmLabel(false);
      setCheckoutCompletedLabel(false);
      return handleReset?.(...args);
    },
    [handleReset]
  );

  const handleStatusModalOrderAnother = useCallback(
    async (...args) => {
      setConcertBookingConfirmLabel(false);
      setCheckoutCompletedLabel(false);
      return handleOrderAnother?.(...args);
    },
    [handleOrderAnother]
  );

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
  const canUseStatusOrderAnother =
    !shouldLockReorderForNonTableConcert &&
    !(forceStatusLockActive && !allowOrderAnotherWhenLocked);
  const activeOrderHasReservation = isReservationRelevantForCurrentDay(
    activeOrder,
    orderScreenStatus || activeOrder?.status || null
  );
  const activeDeliveryLockOrderId = Number(
    orderId || activeOrder?.id || storage.getItem("qr_active_order_id") || 0
  );
  const activeDeliveryLockType = String(
    activeOrder?.order_type || orderType || storage.getItem("qr_orderType") || ""
  )
    .trim()
    .toLowerCase();
  const activeDeliveryLockStatus = String(orderScreenStatus || activeOrder?.status || "")
    .trim()
    .toLowerCase();
  const hasActiveDeliveryLock =
    Number.isFinite(activeDeliveryLockOrderId) &&
    activeDeliveryLockOrderId > 0 &&
    ["online", "packet", "delivery", "phone"].includes(activeDeliveryLockType) &&
    !["closed", "completed"].includes(activeDeliveryLockStatus) &&
    !isCancelledLikeStatus(activeDeliveryLockStatus);
  const activeOrderItemCount = (() => {
    if (Array.isArray(activeOrder?.items)) return activeOrder.items.length;
    const countFromPayload = Number(activeOrder?.items_count ?? activeOrder?.item_count);
    if (Number.isFinite(countFromPayload) && countFromPayload >= 0) return countFromPayload;
    return 0;
  })();
  const activeOrderTotal = Number(activeOrder?.total || 0);
  const hasStatusShortcutOrder = Boolean(statusPortalOrderId || hasActiveOrder);
  const statusShortcutCount = hasStatusShortcutOrder
    ? Math.max(1, Number(activeOrderItemCount) || 0)
    : 0;
  const statusShortcutEnabled = true;
  const statusAllowsCloseSlot =
    normalizedStatusForLock === "" ||
    ["confirmed", "closed", "completed", "cancelled", "canceled", "deleted", "void"].includes(
      normalizedStatusForLock
    );
  const statusNavDisableCandidates = [
    orderScreenStatus,
    activeOrder?.status,
    activeOrder?.reservation?.status,
    activeOrder?.reservation_status,
    activeOrder?.reservationStatus,
    activeOrder?.concert_booking_payment_status,
    activeOrder?.concertBookingPaymentStatus,
    activeOrder?.concert_booking_status,
    activeOrder?.concertBookingStatus,
  ];
  const hasCancellationReasonSignal = Boolean(
    String(orderCancelReason || "").trim() ||
      extractCancellationReason(activeOrder) ||
      extractCancellationReason(
        activeOrder?.reservation && typeof activeOrder.reservation === "object"
          ? activeOrder.reservation
          : null
      ) ||
      extractCancellationReason(
        activeOrder?.concert_booking && typeof activeOrder.concert_booking === "object"
          ? activeOrder.concert_booking
          : null
      )
  );
  const disableBottomNavForCancelledStatus =
    showStatus &&
    (statusNavDisableCandidates.some((status) => isCancelledLikeStatus(status)) ||
      hasCancellationReasonSignal);
  const showCloseInReorderSlot =
    forceStatusLockActive &&
    statusAllowsCloseSlot &&
    !activeOrderHasReservation &&
    activeOrderItemCount === 0 &&
    activeOrderTotal <= 0;
  const disableAuxBottomNavActions =
    showCloseInReorderSlot || disableBottomNavForCancelledStatus;
  const callWaiterButtonDisabled = callWaiterButtonDisabledBase || disableAuxBottomNavActions;
  const canStartVoiceFromNav =
    canStartVoiceFromNavBase &&
    !disableAuxBottomNavActions &&
    !reservationPendingCheckIn &&
    !shouldLockReorderForNonTableConcert;
  const reorderActionLabel = showCloseInReorderSlot ? t("Close") : reOrderLabel;
  const canUseReorderSlot = showCloseInReorderSlot || canReOrderFromNav;
  const onReorderSlotClick = showCloseInReorderSlot
    ? onForceCloseStatusFromNav
    : onReOrderFromNav;
  const disableCallWaiterAction = !showCallWaiterButton || callWaiterButtonDisabled;
  const disableReorderAction = !canUseReorderSlot || disableBottomNavForCancelledStatus;
  const disableCartAction = !canOpenCartFromNav || disableBottomNavForCancelledStatus;
  const disableVoiceAction =
    !canStartVoiceFromNav || disableBottomNavForCancelledStatus || hideAllQrProducts;
  const shouldAnimateCartNavButton = cartNewItemsCount > 0 && !disableCartAction;
  const loggedInCustomerPrefill = useMemo(
    () => ({
      name: qrCustomerSession?.username || "",
      phone: qrCustomerSession?.phone || "",
      email: qrCustomerSession?.email || "",
      address: qrCustomerSession?.address || "",
    }),
    [
      qrCustomerSession?.address,
      qrCustomerSession?.email,
      qrCustomerSession?.phone,
      qrCustomerSession?.username,
    ]
  );
  const savedCustomerPrefill = useMemo(
    () => {
      const fromStorage = getCheckoutPrefill(storage) || {};
      return {
        name: fromStorage?.name || loggedInCustomerPrefill?.name || "",
        phone: fromStorage?.phone || loggedInCustomerPrefill?.phone || "",
        email: fromStorage?.email || loggedInCustomerPrefill?.email || "",
        address: fromStorage?.address || loggedInCustomerPrefill?.address || "",
        payment_method: fromStorage?.payment_method || "",
        bank_reference: fromStorage?.bank_reference || "",
      };
    },
    [
      loggedInCustomerPrefill?.address,
      loggedInCustomerPrefill?.email,
      loggedInCustomerPrefill?.name,
      loggedInCustomerPrefill?.phone,
      orderType,
      showDeliveryForm,
      showTakeawayForm,
      storage,
    ]
  );
  const takeawayInitialValues = useMemo(
    () => ({
      ...takeaway,
      name: savedCustomerPrefill?.name || takeaway?.name || "",
      phone: savedCustomerPrefill?.phone || takeaway?.phone || "",
      email: savedCustomerPrefill?.email || takeaway?.email || "",
    }),
    [savedCustomerPrefill, takeaway]
  );
  const qrBookingSettings = useMemo(
    () => normalizeQrBookingSettings(orderSelectCustomization || {}),
    [orderSelectCustomization]
  );
  const reservationGuestCompositionSettings = useMemo(
    () => ({
      enabled: boolish(
        orderSelectCustomization?.reservation_guest_composition_enabled,
        false
      ),
      fieldMode: orderSelectCustomization?.reservation_guest_composition_field_mode,
      restrictionRule:
        orderSelectCustomization?.reservation_guest_composition_restriction_rule,
      validationMessage:
        orderSelectCustomization?.reservation_guest_composition_validation_message,
      disabledTables: normalizeQrTableNumberList(
        orderSelectCustomization?.reservation_guest_composition_disabled_tables
      ),
    }),
    [
      orderSelectCustomization?.reservation_guest_composition_enabled,
      orderSelectCustomization?.reservation_guest_composition_field_mode,
      orderSelectCustomization?.reservation_guest_composition_restriction_rule,
      orderSelectCustomization?.reservation_guest_composition_validation_message,
      orderSelectCustomization?.reservation_guest_composition_disabled_tables,
    ]
  );

  useEffect(() => {
    if (allowTableOrder) return;
    if (orderType !== "table") return;
    setOrderType(null);
    setTable(null);
    try {
      storage.removeItem("qr_orderType");
      storage.removeItem("qr_table");
    } catch {
      // ignore storage errors
    }
  }, [allowTableOrder, orderType, setOrderType, setTable, storage]);

  const statusPortal = showStatus && statusPortalOrderId
    ? createPortal(
        <OrderStatusModal
          open={true}
          status={orderStatus}
          orderId={statusPortalOrderId}
          orderType={orderType}
          table={orderType === "table" ? table : null}
          onOrderAnother={canUseStatusOrderAnother ? handleStatusModalOrderAnother : null}
          onCheckout={handleReservationCheckout}
          onClose={handleStatusModalClose}
          onFinished={checkoutCompletedLabel ? null : resetToTypePicker}
          t={t}
          appendIdentifier={appendIdentifier}
          errorMessage={lastError}
          cancelReason={orderCancelReason}
          orderScreenStatus={orderScreenStatus}
          forceDark={isQrHeaderDark}
          forceLock={forceStatusLockActive}
          allowOrderAnotherWhenLocked={allowOrderAnotherWhenLocked}
          checkoutPending={checkoutSubmitting}
          bookingConfirmLabel={concertBookingConfirmLabel}
          checkoutCompletedLabel={checkoutCompletedLabel}
        />,
        document.body
      )
    : null;
  const openOrderStatus = useCallback(
    (requestedOrderId = null) => {
      const resolvedOrderId = Number(
        requestedOrderId || orderId || activeOrder?.id || storage.getItem("qr_active_order_id") || 0
      );

      if (!Number.isFinite(resolvedOrderId) || resolvedOrderId <= 0) {
        return false;
      }

      window.dispatchEvent(new Event("qr:cart-close"));
      setShowStatus(false);
      storage.setItem("qr_show_status", "0");
      setOrderId(resolvedOrderId);
      setConcertBookingConfirmLabel(false);
      setOrderStatus("success");
      setShowStatus(true);
      storage.setItem("qr_show_status", "1");
      return true;
    },
    [activeOrder?.id, orderId, setConcertBookingConfirmLabel, setOrderId, setOrderStatus, setShowStatus, storage]
  );

  const handleHeaderStatusShortcutToggle = useCallback(() => {
    openOrderStatus();
  }, [openOrderStatus]);

  useEffect(() => {
    const requestedOrderId = Number(location.state?.openOrderStatusOrderId || 0);
    if (!Number.isFinite(requestedOrderId) || requestedOrderId <= 0) return;
    if (handledNavigationOrderStatusRef.current === requestedOrderId) return;

    handledNavigationOrderStatusRef.current = requestedOrderId;

    const requestedOrderType = String(location.state?.openOrderStatusOrderType || "")
      .trim()
      .toLowerCase();
    const requestedTableNumber = Number(location.state?.openOrderStatusTableNumber || 0);

    if (requestedOrderType) {
      setOrderType(requestedOrderType);
      storage.setItem("qr_orderType", requestedOrderType);
    }

    if (requestedOrderType === "table" && Number.isFinite(requestedTableNumber) && requestedTableNumber > 0) {
      setTable(requestedTableNumber);
      storage.setItem("qr_table", String(requestedTableNumber));
    }

    openOrderStatus(requestedOrderId);
  }, [location.state, openOrderStatus, setOrderType, setTable, storage]);

  useEffect(() => {
    if (!pendingNonTableConcertReorderLock) return;

    const concertBookingType = String(
      activeOrder?.concert_booking_type ?? activeOrder?.concertBookingType ?? ""
    )
      .trim()
      .toLowerCase();
    const concertPaymentStatus = normalizeReservationStatus(
      activeOrder?.concert_booking_payment_status ?? activeOrder?.concertBookingPaymentStatus ?? ""
    );
    const concertBookingStatus = normalizeReservationStatus(
      activeOrder?.concert_booking_status ?? activeOrder?.concertBookingStatus ?? ""
    );
    const concertBookingId = Number(
      activeOrder?.concert_booking_id ?? activeOrder?.concertBookingId ?? 0
    );
    const hasConcertContextFromOrder = Boolean(
      (Number.isFinite(concertBookingId) && concertBookingId > 0) ||
        concertBookingType ||
        concertPaymentStatus ||
        concertBookingStatus
    );
    const isNonTableConcertFromOrder =
      hasConcertContextFromOrder &&
      (concertBookingType === "ticket" ||
        (concertBookingType !== "table" &&
          String(activeOrder?.order_type || "").toLowerCase() !== "table"));
    const isConcertConfirmed =
      concertPaymentStatus === "confirmed" || concertBookingStatus === "confirmed";
    const isConcertCheckedIn =
      activeOrder?.checked_in === true ||
      activeOrder?.reservation?.checked_in === true ||
      isCheckedInReservationStatus(orderScreenStatus) ||
      isCheckedInReservationStatus(activeOrder?.status) ||
      isCheckedInReservationStatus(concertBookingStatus);

    if (hasConcertContextFromOrder && !isNonTableConcertFromOrder) {
      setPendingNonTableConcertReorderLock(false);
      return;
    }
    if (isNonTableConcertFromOrder && isConcertConfirmed && isConcertCheckedIn) {
      setPendingNonTableConcertReorderLock(false);
      return;
    }
    if (!hasConcertContextFromOrder && !showStatus && !hasActiveOrder) {
      setPendingNonTableConcertReorderLock(false);
    }
  }, [
    activeOrder,
    hasActiveOrder,
    orderScreenStatus,
    pendingNonTableConcertReorderLock,
    showStatus,
  ]);

  const handleConcertReservationSuccess = useCallback(
    ({ reservationOrderId, reservedTableNumber, bookingType = "table", paymentStatus = "" }) => {
      const nextOrderId = Number(reservationOrderId || 0);
      if (!Number.isFinite(nextOrderId) || nextOrderId <= 0) {
        return;
      }

      if (String(bookingType || "").toLowerCase() !== "table") {
        const normalizedConcertPaymentStatus = String(paymentStatus || "")
          .trim()
          .toLowerCase();
        setPendingNonTableConcertReorderLock(true);
        setOrderType("takeaway");
        storage.setItem("qr_orderType", "takeaway");
        setTable(null);
        storage.removeItem("qr_table");
        storage.setItem("qr_show_status", "1");
        storage.removeItem("qr_force_status_until_closed");
        setOrderStatus("success");
        setOrderScreenStatus(
          normalizedConcertPaymentStatus === "confirmed"
            ? "confirmed"
            : normalizedConcertPaymentStatus || "pending_bank_transfer"
        );
        setConcertBookingConfirmLabel(
          normalizedConcertPaymentStatus === "confirmed"
        );
        setCheckoutCompletedLabel(false);
        setShowStatus(true);
        setOrderId(nextOrderId);
        storage.setItem("qr_active_order_id", String(nextOrderId));
        storage.setItem(
          "qr_active_order",
          JSON.stringify({
            orderId: nextOrderId,
            orderType: "takeaway",
            table: null,
          })
        );
        return;
      }

      setPendingNonTableConcertReorderLock(false);
      const nextTableNumber = Number(reservedTableNumber || 0);
      setOrderType("table");
      storage.setItem("qr_orderType", "table");
      if (Number.isFinite(nextTableNumber) && nextTableNumber > 0) {
        setTable(nextTableNumber);
        storage.setItem("qr_table", String(nextTableNumber));
      }

      storage.setItem("qr_show_status", "1");
      storage.setItem("qr_force_status_until_closed", "1");
      setOrderStatus("booking_confirm");
      setConcertBookingConfirmLabel(true);
      setCheckoutCompletedLabel(false);
      setShowStatus(true);
      setOrderId(nextOrderId);
      storage.setItem("qr_active_order_id", String(nextOrderId));
      storage.setItem(
        "qr_active_order",
        JSON.stringify({
          orderId: nextOrderId,
          orderType: "table",
          table:
            Number.isFinite(nextTableNumber) && nextTableNumber > 0 ? nextTableNumber : null,
        })
      );
    },
    [
      setConcertBookingConfirmLabel,
      setOrderId,
      setOrderScreenStatus,
      setOrderStatus,
      setOrderType,
      setPendingNonTableConcertReorderLock,
      setShowStatus,
      setTable,
      storage,
    ]
  );

  const handleConcertBookingRequest = useCallback(
    (event, defaults = {}) => {
      if (!event?.id) return;
      if (isCustomerAuthRestoring && !isCustomerLoggedInEffective) return;
      const bookingPath = buildConcertBookingPath({
        pathname: location.pathname,
        slug,
        id,
        search: location.search,
        concertId: event.id,
      });
      const [pathname, rawSearch = ""] = String(bookingPath).split("?");
      const params = new URLSearchParams(rawSearch);
      const requestedBookingType = String(defaults?.bookingType || "").trim().toLowerCase();
      const requestedTicketTypeId = String(defaults?.ticketTypeId || "").trim();
      if (requestedBookingType) {
        params.set("booking_type", requestedBookingType);
      }
      if (requestedTicketTypeId) {
        params.set("ticket_type_id", requestedTicketTypeId);
      }
      const resolvedPath = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      navigate(
        isCustomerLoggedInEffective
          ? resolvedPath
          : appendPublicBookingSubPath(resolvedPath, "contact")
      );
    },
    [
      id,
      isCustomerAuthRestoring,
      isCustomerLoggedInEffective,
      location.pathname,
      location.search,
      navigate,
      slug,
    ]
  );

  const handleFreeConcertReservationStart = useCallback(
    (event) => {
      if (isCustomerAuthRestoring && !isCustomerLoggedInEffective) return;
      if (event?.id) {
        const bookingPath = buildConcertBookingPath({
          pathname: location.pathname,
          slug,
          id,
          search: location.search,
          concertId: event.id,
        });
        navigate(
          isCustomerLoggedInEffective
            ? bookingPath
            : appendPublicBookingSubPath(bookingPath, "contact")
        );
        return;
      }
      const bookingPath = buildReservationBookingPath({
        pathname: location.pathname,
        slug,
        id,
        search: location.search,
      });
      navigate(
        isCustomerLoggedInEffective
          ? bookingPath
          : appendPublicBookingSubPath(bookingPath, "contact")
      );
    },
    [
      id,
      isCustomerAuthRestoring,
      isCustomerLoggedInEffective,
      location.pathname,
      location.search,
      navigate,
      slug,
    ]
  );

  const handleVoiceDraftAddToCart = useCallback(
    ({ product, productId, name, qty, unitPrice, extras, notes }) => {
      if (reservationPendingCheckIn) {
        showReservationPendingCheckInMessage();
        return;
      }
      const resolvedQty = Math.max(1, Number(qty) || 1);
      const resolvedProduct = product || safeProducts.find((it) => String(it?.id) === String(productId)) || null;
      const resolvedName = resolvedProduct?.name || name || t("Unknown product");
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
      storage.setItem("qr_cart_auto_open", "0");
      setCart((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: resolvedProduct?.id ?? productId ?? null,
          name: resolvedName,
          image: resolvedProduct?.image || null,
          price: Number(resolvedProduct?.price ?? unitPrice ?? 0) || 0,
          quantity: resolvedQty,
          extras: resolvedExtras,
          note: notes || "",
          unique_id: `${resolvedProduct?.id || productId || "voice"}-waiter-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        },
      ]);
      setPaymentMethod("");
      showQrCartToast(`${resolvedQty} ${resolvedName} added to Cart`);
    },
    [
      reservationPendingCheckIn,
      safeProducts,
      setCart,
      setPaymentMethod,
      showReservationPendingCheckInMessage,
      storage,
      t,
    ]
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

  const brandedShareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const identifier = String(restaurantIdentifier || slug || id || "").trim();
    if (!identifier) return window.location.href;
    return buildPublicRestaurantUrl(identifier);
  }, [
    id,
    restaurantIdentifier,
    slug,
  ]);

  const brandedAppUrl = useMemo(() => {
    const identifier = String(restaurantIdentifier || slug || id || "").trim();
    if (!identifier) return APP_RESTAURANT_BASE_URL;
    return buildAppRestaurantUrl(identifier);
  }, [id, restaurantIdentifier, slug]);

  const openMarketplaceFromQrMenu = useCallback(() => {
    navigateToMarketplaceFromQrMenu();
  }, []);

  const openRealAppLink = useCallback(() => {
    if (typeof window === "undefined") return;

    const targetUrl = brandedAppUrl || APP_RESTAURANT_BASE_URL;
    const ua = String(window.navigator?.userAgent || "").toLowerCase();
    const isAndroid = /android/.test(ua);
    const isIos = /iphone|ipad|ipod/.test(ua);
    const appStoreUrl = String(import.meta.env.VITE_APP_STORE_URL || "").trim();
    const playStoreUrl = String(import.meta.env.VITE_PLAY_STORE_URL || "").trim();

    // Attempt app-link first so installed app opens directly.
    window.location.href = targetUrl;

    // Optional store fallback if app is not installed.
    if (isAndroid && playStoreUrl) {
      window.setTimeout(() => {
        window.location.href = playStoreUrl;
      }, 1400);
      return;
    }
    if (isIos && appStoreUrl) {
      window.setTimeout(() => {
        window.location.href = appStoreUrl;
      }, 1400);
    }
  }, [brandedAppUrl]);

  const copyCurrentMenuLink = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = brandedShareUrl || window.location.href;
    try {
      navigator.clipboard.writeText(url);
      alert(t("Link copied."));
    } catch {
      alert(url);
    }
  }, [brandedShareUrl, t]);

  const shareCurrentMenu = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = brandedShareUrl || window.location.href;
    if (navigator.share) {
      navigator
        .share({
          title: brandName || t("Restaurant"),
          url,
        })
        .catch(() => {});
      return;
    }
    copyCurrentMenuLink();
  }, [brandName, brandedShareUrl, copyCurrentMenuLink, t]);

  const handleDownloadQrImage = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const brandingName = normalizeRestaurantDisplayName(
      orderSelectCustomization?.app_display_name || brandName,
      "qr-menu"
    );
    const safeName =
      String(brandingName || "qr-menu")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "qr-menu";

    try {
      const qrImageDataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H",
        width: 1024,
        margin: 2,
        color: {
          dark: "#111111",
          light: "#FFFFFF",
        },
      });

      const anchor = document.createElement("a");
      anchor.href = qrImageDataUrl;
      anchor.download = `${safeName}-qr.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      console.error("Failed to export QR image:", error);
      alert(t("Download failed. Please try again."));
    }
  }, [brandName, orderSelectCustomization?.app_display_name, t]);

  const openShareModal = useCallback(() => {
    setShareModalOpen(true);
  }, []);

  const openDownloadQrModal = useCallback(() => {
    if (!boolish(orderSelectCustomization?.qr_download_popup_enabled, true)) {
      handleDownloadQrImage();
      return;
    }
    setDownloadQrModalOpen(true);
  }, [handleDownloadQrImage, orderSelectCustomization?.qr_download_popup_enabled]);

  const handleShareFromModal = useCallback(() => {
    shareCurrentMenu();
    setShareModalOpen(false);
  }, [shareCurrentMenu]);

  const handleCopyFromModal = useCallback(() => {
    copyCurrentMenuLink();
    setShareModalOpen(false);
  }, [copyCurrentMenuLink]);

  const handleInstallFromModal = useCallback(() => {
    openRealAppLink();
    setDownloadQrModalOpen(false);
    setShowQrPrompt(false);
  }, [openRealAppLink, setShowQrPrompt]);

  const handleDownloadImageFromModal = useCallback(async () => {
    await handleDownloadQrImage();
    setDownloadQrModalOpen(false);
  }, [handleDownloadQrImage]);

  const loadReservationAvailability = useCallback(
    async (reservationDate, reservationTime, guestCount) => {
      const normalizedDate = String(reservationDate || "").trim();
      const normalizedTime = String(reservationTime || "").trim();
      if (
        !restaurantIdentifier ||
        !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) ||
        !/^\d{2}:\d{2}$/.test(normalizedTime)
      ) {
        return null;
      }

      const params = new URLSearchParams({
        date: normalizedDate,
        time: normalizedTime,
      });
      const safeGuestCount = Number.parseInt(String(guestCount ?? ""), 10);
      if (Number.isFinite(safeGuestCount) && safeGuestCount > 0) {
        params.set("guest_count", String(safeGuestCount));
      }
      const path = `/public/unavailable-tables/${encodeURIComponent(
        restaurantIdentifier
      )}?${params.toString()}`;
      const payload = await secureFetch(appendIdentifier(path));

      return {
        occupiedTables: Array.isArray(payload?.table_numbers) ? payload.table_numbers : [],
        reservedTables: Array.isArray(payload?.reserved_table_numbers)
          ? payload.reserved_table_numbers
          : [],
        availableTables: Array.isArray(payload?.available_tables) ? payload.available_tables : [],
        availabilityStatus: String(payload?.availability_status || "").trim(),
        nextAvailableTime: String(payload?.next_available_time || "").trim(),
        selectedSlot: payload?.selected_slot || null,
      };
    },
    [appendIdentifier, restaurantIdentifier]
  );

  const loadReservationTimeSlots = useCallback(
    async (reservationDate, guestCount) => {
      const normalizedDate = String(reservationDate || "").trim();
      if (!restaurantIdentifier || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        return { timeSlots: [] };
      }

      const params = new URLSearchParams({
        date: normalizedDate,
        slots: "1",
      });
      const safeGuestCount = Number.parseInt(String(guestCount ?? ""), 10);
      if (Number.isFinite(safeGuestCount) && safeGuestCount > 0) {
        params.set("guest_count", String(safeGuestCount));
      }

      const payload = await secureFetch(
        appendIdentifier(
          `/public/unavailable-tables/${encodeURIComponent(
            restaurantIdentifier
          )}?${params.toString()}`
        )
      );

      return {
        timeSlots: Array.isArray(payload?.time_slots) ? payload.time_slots : [],
      };
    },
    [appendIdentifier, restaurantIdentifier]
  );

  if (showTableSelector) {
    return (
      <>
        <div className={isQrHeaderDark ? "dark" : ""}>
          <ModernTableSelector
            tables={tables}
            showAreas={showTableAreas}
            t={t}
            accentColor={takeawaySubmitButtonColor}
            headerAreaTabs={true}
            formatTableName={formatTableName}
            occupiedNumbers={filteredOccupied}
            occupiedLabel={t("Occupied")}
            reservedNumbers={filteredReserved}
            reservedLabel={t("Reserved")}
            hideTopBar={true}
            onSelect={(tbl) => {
              if (tableQrScanEnabled) {
                openTableScanner(tbl?.tableNumber, Number(tbl?.guests));
                return;
              }
              selectTableDirectly(tbl?.tableNumber, Number(tbl?.guests));
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
      <Toaster
        position="top-center"
        toastOptions={{
          success: {
            style: {
              borderRadius: "16px",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              background: "rgba(15, 23, 42, 0.96)",
              color: "#fff",
              padding: "12px 16px",
              boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
              fontSize: "14px",
              fontWeight: 600,
            },
          },
        }}
      />
      <style>{`
        @keyframes qr-cart-nav-pulse {
          0%, 100% {
            transform: translateY(0) scale(1);
            box-shadow: 0 10px 24px rgba(5, 150, 105, 0.18);
          }
          35% {
            transform: translateY(-2px) scale(1.03);
            box-shadow: 0 16px 30px rgba(16, 185, 129, 0.3);
          }
          65% {
            transform: translateY(0) scale(1.01);
            box-shadow: 0 12px 26px rgba(5, 150, 105, 0.22);
          }
        }
        @keyframes qr-cart-icon-bob {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
          }
          30% {
            transform: translateY(-2px) rotate(-6deg);
          }
          60% {
            transform: translateY(0) rotate(6deg);
          }
        }
      `}</style>
      {showStandaloneSplash ? (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center"
          style={{
            backgroundColor: normalizeHexColor(
              orderSelectCustomization?.pwa_background_color,
              "#FFFFFF"
            ),
          }}
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            {standaloneSplashLogo ? (
              <img
                src={standaloneSplashLogo}
                alt={t("QR Menu")}
                className="h-36 w-36 object-contain"
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <InstallHelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        t={t}
        platform={platform}
        onShare={shareCurrentMenu}
        onCopy={copyCurrentMenuLink}
      />
      <ShareMenuModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        t={t}
        onShare={handleShareFromModal}
        onCopy={handleCopyFromModal}
      />
      <DownloadQrModal
        open={downloadQrModalOpen}
        onClose={() => setDownloadQrModalOpen(false)}
        t={t}
        onInstall={handleInstallFromModal}
        onDownloadImage={handleDownloadImageFromModal}
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
                      ? t("Install App")
                      : t("Tap here to open the Beypro app")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
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
                onClick={() => {
                  setDownloadQrModalOpen(true);
                }}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition dark:border-neutral-800"
              >
                <Download className="h-5 w-5" />
                {t("Download App")}
              </button>
            </div>
          </div>
        </div>
      )}
      <GuestWelcomeAuthModal
        open={showCustomerAuthWelcomeModal}
        view={authWelcomeView}
        onViewChange={setAuthWelcomeView}
        onClose={handleCloseAuthWelcomeModal}
        onGoogleLogin={() =>
          loginCustomerWithGoogle({
            returnTo: typeof window !== "undefined" ? window.location.href : "",
          })
        }
        onAppleLogin={() =>
          loginCustomerWithApple({
            returnTo: typeof window !== "undefined" ? window.location.href : "",
          })
        }
        onLogin={loginCustomerSession}
        onRegister={registerCustomerSession}
        t={t}
        brandName={brandName}
        accentColor={takeawaySubmitButtonColor}
      />
      {showHome ? (
        <>
          <OrderTypeSelect
            identifier={restaurantIdentifier}
            appendIdentifier={appendIdentifier}
            onSelect={handleBookingOrderTypeSelect}
            lang={lang}
            setLang={setLang}
            t={t}
            onShare={openShareModal}
            onDownloadQr={openDownloadQrModal}
            onShopOpenChange={setShopIsOpen}
            canInstall={canInstall}
            showHelp={showHelp}
            setShowHelp={setShowHelp}
            platform={platform}
            onPopularClick={handlePopularProductClick}
            onCustomizationLoaded={(next) =>
              setOrderSelectCustomization((prev) => ({ ...prev, ...(next || {}) }))
            }
            onConcertReservationSuccess={handleConcertReservationSuccess}
            onFreeConcertReservationStart={handleFreeConcertReservationStart}
            onConcertBookingRequest={handleConcertBookingRequest}
            statusShortcutCount={statusShortcutCount}
            statusShortcutEnabled={statusShortcutEnabled}
            statusShortcutOpen={showStatus}
            onStatusShortcutToggle={handleHeaderStatusShortcutToggle}
            reservationEnabled={true}
            tableEnabled={allowTableOrder}
          />

          {!orderType && showOrderTypePrompt && (
            <OrderTypePromptModal
              product={pendingPopularProduct}
              t={t}
              shopIsOpen={shopIsOpen}
              accentColor={takeawaySubmitButtonColor}
              onClose={() => {
                setShowOrderTypePrompt(false);
                setPendingPopularProduct(null);
                setReturnHomeAfterAdd(false);
              }}
              onSelect={(type) => {
                handleBookingOrderTypeSelect(type);
                setShowOrderTypePrompt(false);
              }}
              deliveryEnabled={boolish(orderSelectCustomization.delivery_enabled, true)}
              reservationEnabled={!hasActiveDeliveryLock}
              tableEnabled={!hasActiveDeliveryLock && allowTableOrder}
            />
          )}
        </>
      ) : (
        <div
          className={`${isQrHeaderDark ? "dark " : ""}flex-1`}
          style={{ opacity: suppressMenuFlash ? 0 : 1, pointerEvents: suppressMenuFlash ? "none" : "auto" }}
        >
          <div className="min-h-screen w-full max-w-full bg-neutral-50 dark:bg-neutral-900 flex flex-col">
            {shouldShowTableOrderHeader ? (
              <TableOrderHeader
                t={t}
                onBack={handleCloseOrderPage}
                title="Table Order"
                accentColor={takeawaySubmitButtonColor}
              />
            ) : null}
            {shouldShowInnerOrderHeader ? (
              <>
                <QrMenuHeader
                  isDark={isQrHeaderDark}
                  isDrawerOpen={isAppHeaderDrawerOpen}
                  onOpenDrawer={openMenuHeaderDrawer}
                  onOpenMarketplace={openMarketplaceFromQrMenu}
                  onSelect={handleSharedHeaderOrderTypeSelect}
                  reservationEnabled={shopIsOpen && !hasActiveDeliveryLock}
                  tableEnabled={shopIsOpen && !hasActiveDeliveryLock && allowTableOrder}
                  deliveryEnabled={boolish(orderSelectCustomization?.delivery_enabled, true) && shopIsOpen}
                  requestSongEnabled={requestSongEnabled}
                  activeOrderType={sharedHeaderOrderType}
                  statusShortcutCount={statusShortcutCount}
                  statusShortcutEnabled={statusShortcutEnabled}
                  statusShortcutOpen={showStatus}
                  onStatusShortcutClick={handleHeaderStatusShortcutToggle}
                  restaurantName={brandName}
                  tagline="Fresh • Local • Crafted"
                  accentColor={takeawaySubmitButtonColor}
                  t={t}
                  openStatus={sharedHeaderOpenStatus}
                  showShopHoursDropdown={false}
                  onToggleShopHoursDropdown={() => {}}
                  onCloseShopHoursDropdown={() => {}}
                  days={[]}
                  todayName=""
                  shopHours={{}}
                  loadingShopHours={false}
                  shopHoursDropdownRef={null}
                  languageControl={
                    <LanguageSwitcher
                      lang={lang}
                      setLang={setLang}
                      t={t}
                      isDark={isQrHeaderDark}
                      compact
                    />
                  }
                  showInfo={false}
                />
                <HeaderDrawer
                  isOpen={isAppHeaderDrawerOpen}
                  onClose={handleCloseAppHeaderDrawer}
                  t={t}
                  appendIdentifier={appendIdentifier}
                  isDark={isQrHeaderDark}
                  accentColor={takeawaySubmitButtonColor}
                  initialView={appHeaderDrawerInitialView}
                  hasOrderStatus={hasStatusShortcutOrder}
                  onOpenOrderStatus={() => openOrderStatus()}
                  onRequestAuthView={openFullScreenAuth}
                />
              </>
            ) : null}

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
                      onShowStatus={openOrderStatus}
                      isOrderStatusOpen={showStatus}
                      onOpenCart={() => {
                        setShowStatus(false);
                        storage.setItem("qr_show_status", "0");
                      }}
                      onEditItem={handleEditCartItem}
                      appendIdentifier={appendIdentifier}
                      layout="panel"
                      storage={storage}
                      voiceListening={qrVoiceListening}
                    />
                  </aside>
                )}

                {isRequestSongViewOpen && requestSongEnabled ? (
                  <RequestSongTab t={t} />
                ) : (
                  <MenuProductsSection
                    categories={hideAllQrProducts ? [] : categories}
                    activeCategory={activeCategory}
                    categoryImages={categoryImages}
                    products={hideAllQrProducts ? [] : productsForGrid}
                    onSelectCategory={handleMenuCategorySelect}
                    onCategoryClick={handleMenuCategoryClick}
                    onOpenProduct={(product) => {
                      if (reservationPendingCheckIn) {
                        showReservationPendingCheckInMessage();
                        return;
                      }
                      handleMenuProductOpen(product);
                    }}
                    t={t}
                    apiUrl={API_URL}
                  />
                )}
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
          onShowStatus={openOrderStatus}
          isOrderStatusOpen={showStatus}
          onOpenCart={() => {
            setShowStatus(false);
            storage.setItem("qr_show_status", "0");
          }}
          onEditItem={handleEditCartItem}
          appendIdentifier={appendIdentifier}
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
          <div className="mx-auto grid w-full max-w-xl grid-cols-5 gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-[0_10px_35px_rgba(0,0,0,0.2)] backdrop-blur">
            <button
              type="button"
              onClick={onGoHomeFromNav}
              className="inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border border-slate-300 bg-gradient-to-b from-slate-100 to-white px-1 text-[11px] font-semibold leading-none text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 active:scale-[0.98]"
              aria-label={homeLabel}
            >
              <House className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="block whitespace-nowrap">{homeLabel}</span>
            </button>

            <button
              type="button"
              onClick={onCallWaiterClick}
              disabled={disableCallWaiterAction}
              className={`relative inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                disableCallWaiterAction
                  ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
                  : "border-red-500 bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]"
              }`}
              aria-label={callWaiterLabel}
            >
              {callingWaiter ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
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
              disabled={disableReorderAction}
              className={`inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                !disableReorderAction
                  ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
              aria-label={reorderActionLabel}
            >
              <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="block whitespace-nowrap">{reorderActionLabel}</span>
            </button>

            <button
              type="button"
              onClick={onOpenCartFromNav}
              disabled={disableCartAction}
              className={`relative inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                !disableCartAction
                  ? "border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              } ${shouldAnimateCartNavButton ? "will-change-transform" : ""}`}
              style={
                shouldAnimateCartNavButton
                  ? { animation: "qr-cart-nav-pulse 1.8s ease-in-out infinite" }
                  : undefined
              }
              aria-label={cartLabel}
            >
              <ShoppingCart
                className="h-[18px] w-[18px]"
                aria-hidden="true"
                style={
                  shouldAnimateCartNavButton
                    ? { animation: "qr-cart-icon-bob 1.15s ease-in-out infinite" }
                    : undefined
                }
              />
              <span className="block whitespace-nowrap">{cartLabel}</span>
              {cartNewItemsCount > 0 ? (
                <span className="absolute right-1 top-1 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-sky-700 px-1 text-[9px] font-bold leading-none text-white animate-pulse">
                  {cartNewItemsCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={onOpenVoiceFromNav}
              disabled={disableVoiceAction}
              className={`inline-flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold leading-none transition ${
                !disableVoiceAction
                  ? "border-violet-500 bg-violet-600 text-white hover:bg-violet-700 active:scale-[0.98]"
                  : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400"
              }`}
              aria-label={aiOrderLabel}
            >
              <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
              <span className="block whitespace-nowrap">{aiOrderLabel}</span>
            </button>
          </div>
        </div>
      )}

      <VoiceOrderController
        restaurantId={restaurantIdentifier || id || slug}
        tableId={resolvedTableForActions || table}
        products={hideAllQrProducts ? [] : safeProducts}
        onAddToCart={handleVoiceDraftAddToCart}
        onSyncDraftToCart={syncVoiceDraftToSharedCart}
        onOpenSharedCart={onOpenSharedCartFromVoice}
        onOpenCatalogProduct={onOpenCatalogProductFromVoice}
        onConfirmOrder={orderType ? handleVoiceDraftConfirmOrder : undefined}
        language={lang}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        canStartVoiceOrder={
          Boolean(resolvedOrderTypeForActions) &&
          (!showHome || showStatus) &&
          !reservationPendingCheckIn
        }
        onRequireOrderType={handleVoiceRequireOrderType}
        forceMinimized={Boolean(showStatus)}
        hideMiniButton={true}
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
          setEditingCartItemId(null);
          if (hasCartItems) {
            window.dispatchEvent(new Event("qr:cart-open"));
            return;
          }
          setForceHome(false);
          setShowDeliveryForm(false);
          setShowTakeawayForm(false);
          setShowStatus(false);
        }}
        onAddToCart={(item) => {
          if (reservationPendingCheckIn) {
            showReservationPendingCheckInMessage();
            return;
          }
          const isEditingCartItem = Boolean(editingCartItemId);
          storage.setItem("qr_cart_auto_open", isEditingCartItem ? "0" : "1");
          setCart((prev) => {
            const prevItems = toArray(prev);
            if (!editingCartItemId) {
              return [...prevItems, item];
            }
            return prevItems.map((existingItem) =>
              String(existingItem?.unique_id) === String(editingCartItemId)
                ? { ...item, unique_id: editingCartItemId }
                : existingItem
            );
          });
          setEditingCartItemId(null);
          setShowAddModal(false);
          setShowStatus(false);
          if (isEditingCartItem) {
            showQrCartToast(t("Save changes"));
          } else {
            showQrCartToast(`${Math.max(1, Number(item?.quantity) || 1)} ${item?.name || t("Unknown product")} added to Cart`);
            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
              window.requestAnimationFrame(() => {
                window.dispatchEvent(new Event("qr:cart-open"));
              });
            } else {
              window.dispatchEvent(new Event("qr:cart-open"));
            }
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
        initialQuantity={editingCartItem?.quantity || 1}
        initialExtras={editingCartItem?.extras || []}
        initialNote={editingCartItem?.note || ""}
        submitLabel={editingCartItem ? t("Save changes") : undefined}
      />

      {statusPortal}

      {orderType === "online" && showDeliveryForm && (
        <CheckoutModal
          submitting={submitting}
          t={t}
          appendIdentifier={appendIdentifier}
          storage={storage}
          accentColor={takeawaySubmitButtonColor}
          onClose={() => {
            setShowDeliveryForm(false);
            setOrderType(null);
          }}
          onSubmit={(form) => {
            setCustomerInfo({
              name: form.name,
              phone: form.phone,
              email: form.email,
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
          submitButtonColor={takeawaySubmitButtonColor}
          initialValues={takeawayInitialValues}
          tables={tables}
          occupiedTables={occupiedTables}
          reservedTables={safeReservedTables}
          pickupEnabled={allowReservationPickup}
          guestCompositionSettings={reservationGuestCompositionSettings}
          formatTableName={formatTableName}
          loadReservationTimeSlots={loadReservationTimeSlots}
          loadReservationAvailability={loadReservationAvailability}
          bookingSettings={qrBookingSettings}
          onClose={() => {
            setShowTakeawayForm(false);
            setOrderType(null);
          }}
          onAddItem={(form) => {
            setTakeaway(form);
            setShowTakeawayForm(false);
            setShowStatus(false);
            setForceHome(false);
            window.dispatchEvent(new Event("qr:voice-order-close"));
            setQrVoiceModalOpen(false);
          }}
          onSubmit={async (form) => {
            if (!form) {
              setTakeaway({
                name: "",
                phone: "",
                email: "",
                pickup_date: "",
                pickup_time: "",
                mode: "reservation",
                table_number: "",
                reservation_clients: "",
                reservation_men: "",
                reservation_women: "",
                notes: "",
                payment_method: "",
              });
              setShowTakeawayForm(false);
              return;
            }

            if (String(form?.mode || "").toLowerCase() === "reservation") {
              const latestTimeSlots = await loadReservationTimeSlots(
                form.pickup_date,
                form.reservation_clients
              );
              const normalizedTimeSlots = normalizeReservationTimeSlotOptions(
                latestTimeSlots?.timeSlots || latestTimeSlots?.time_slots || [],
                t
              );
              const selectedTimeSlot = normalizedTimeSlots.find(
                (slot) => slot.time === String(form?.pickup_time || "").slice(0, 5) && slot.isAvailable
              );
              if (!selectedTimeSlot) {
                alert(t("Please select a valid reservation time."));
                return;
              }

              const selectedTableNumber =
                String(form?.table_number || "").trim().toLowerCase() === "auto"
                  ? null
                  : Number(form?.table_number);
              if (
                selectedTableNumber != null &&
                (!Number.isFinite(selectedTableNumber) || selectedTableNumber <= 0)
              ) {
                alert(t("Please select an available table."));
                return;
              }

              try {
                setSubmitting(true);
                const response = await secureFetch(appendIdentifier("/orders/reservations"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    table_number:
                      Number.isFinite(selectedTableNumber) && selectedTableNumber > 0
                        ? selectedTableNumber
                        : null,
                    reservation_date: form.pickup_date,
                    reservation_time: form.pickup_time,
                    reservation_clients: Number(form.reservation_clients) || 1,
                    reservation_men: hasGuestCompositionValue(form.reservation_men)
                      ? Number(form.reservation_men) || 0
                      : null,
                    reservation_women: hasGuestCompositionValue(form.reservation_women)
                      ? Number(form.reservation_women) || 0
                      : null,
                    reservation_notes: form.notes || "",
                    customer_name: form.name || null,
                    customer_phone: form.phone || null,
                    customer_email: form.email || null,
                  }),
                });

                const reservationOrderId = Number(response?.reservation?.id);
                const resolvedTableNumber = Number(
                  response?.reservation?.table_number || selectedTableNumber || 0
                );
                setTakeaway({
                  ...form,
                  table_number:
                    Number.isFinite(resolvedTableNumber) && resolvedTableNumber > 0
                      ? String(resolvedTableNumber)
                      : form.table_number,
                });
                setShowTakeawayForm(false);
                window.dispatchEvent(new Event("qr:voice-order-close"));
                setQrVoiceModalOpen(false);
                setOrderType("table");
                storage.setItem("qr_orderType", "table");
                if (Number.isFinite(resolvedTableNumber) && resolvedTableNumber > 0) {
                  setTable(resolvedTableNumber);
                  storage.setItem("qr_table", String(resolvedTableNumber));
                }
                storage.setItem("qr_show_status", "1");
                setConcertBookingConfirmLabel(false);
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
                      table:
                        Number.isFinite(resolvedTableNumber) && resolvedTableNumber > 0
                          ? resolvedTableNumber
                          : null,
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
