import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import secureFetch from "../../../utils/secureFetch";
import { Eye, EyeOff, Search, Copy, Download, Printer, Trash2, ChevronDown, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";
import { API_ORIGIN } from "../../../utils/api";
import { useHasPermission } from "../../../components/hooks/useHasPermission";
import { useNavigate } from "react-router-dom";
import { getCustomDomainPreview } from "../../../utils/customDomain";
import {
  PUBLIC_RESTAURANT_BASE_HOST,
  normalizePublicRestaurantUrl,
} from "../../../utils/publicRestaurantUrl";
import {
  QR_BOOKING_DEFAULTS,
  normalizeQrBookingSettings,
  computeConcertSlot,
  parseLocalDateTime,
} from "../../../utils/qrBooking";
import FloorPlanDesigner from "../../floorPlan/components/FloorPlanDesigner";
import {
  buildGeneratedFloorPlan,
  normalizeFloorPlanLayout,
  renumberFloorPlanTables,
  syncFloorPlanLayoutWithTables,
} from "../../floorPlan/utils/floorPlan";

const extractIdentifierFromQrUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const parts = (url.pathname || "").split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const clean = raw.replace(/\/+$/, "");
    const parts = clean.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
};

const QR_MENU_BRANDING_UPDATED_EVENT = "qr:branding-cache-updated";
const QR_EXPORT_SIZE = 2048;

const writeQrMenuBrandingCache = (identifier, customization) => {
  if (typeof window === "undefined") return;
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier || !customization || typeof customization !== "object") return;

  try {
    window.localStorage.setItem(
      `qr-menu-branding-cache:${normalizedIdentifier}`,
      JSON.stringify(customization)
    );
  } catch {
    // Ignore storage quota/privacy errors.
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
    // Ignore custom event failures and keep the saved cache value.
  }
};

const syncRestaurantSlugCache = (slug) => {
  if (typeof window === "undefined") return;
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return;

  try {
    window.localStorage.setItem("restaurant_slug", normalizedSlug);
  } catch {
    // Ignore storage errors.
  }

  try {
    const rawUser = window.localStorage.getItem("beyproUser");
    if (!rawUser) return;

    const parsedUser = JSON.parse(rawUser);
    let changed = false;

    if (parsedUser && typeof parsedUser === "object") {
      if (parsedUser.restaurant_slug !== normalizedSlug) {
        parsedUser.restaurant_slug = normalizedSlug;
        changed = true;
      }
      if (parsedUser.user && typeof parsedUser.user === "object") {
        if (parsedUser.user.restaurant_slug !== normalizedSlug) {
          parsedUser.user.restaurant_slug = normalizedSlug;
          changed = true;
        }
        if (parsedUser.user.restaurant && typeof parsedUser.user.restaurant === "object") {
          if (parsedUser.user.restaurant.slug !== normalizedSlug) {
            parsedUser.user.restaurant.slug = normalizedSlug;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      window.localStorage.setItem("beyproUser", JSON.stringify(parsedUser));
    }
  } catch {
    // Ignore malformed cached user data.
  }
};

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const normalizeAssetValue = (value) => {
  const raw = String(value || "").trim();
  return raw || "";
};

const getAssetFileName = (value) => {
  const raw = normalizeAssetValue(value);
  if (!raw) return "";
  const clean = raw.split("?")[0];
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
};

const toAbsolutePublicUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) return raw;
  if (typeof window === "undefined") return raw;
  try {
    return new URL(raw, window.location.origin).toString();
  } catch {
    return raw;
  }
};

const appendVersionParam = (value, version) => {
  const raw = String(value || "").trim();
  const normalizedVersion = String(version || "").trim();
  if (!raw || !normalizedVersion) return raw;
  const separator = raw.includes("?") ? "&" : "?";
  return `${raw}${separator}v=${encodeURIComponent(normalizedVersion)}`;
};

const resolveYouTubeEmbedUrl = (value) => {
  const raw = String(value || "").trim();
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
};

const MAX_STORY_VIDEO_UPLOAD_MB = 95;
const QR_MENU_FONT_OPTIONS = [
  { value: "gotham", label: "Gotham", family: '"Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-thin", label: "Gotham Thin", family: '"Gotham Thin", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-light", label: "Gotham Light", family: '"Gotham Light", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-book", label: "Gotham Book", family: '"Gotham Book", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-medium", label: "Gotham Medium", family: '"Gotham Medium", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-ultra", label: "Gotham Ultra", family: '"Gotham Ultra", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-narrow-thin", label: "Gotham Narrow Thin", family: '"Gotham Narrow Thin", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-narrow-book", label: "Gotham Narrow Book", family: '"Gotham Narrow Book", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-narrow-black", label: "Gotham Narrow Black", family: '"Gotham Narrow Black", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "gotham-narrow-ultra", label: "Gotham Narrow Ultra", family: '"Gotham Narrow Ultra", "Gotham Narrow", "Gotham", "Avenir Next", "Helvetica Neue", Arial, sans-serif' },
  { value: "system", label: "System UI", family: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { value: "segoe", label: "Segoe UI", family: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { value: "avenir", label: "Avenir Next", family: '"Avenir Next", Avenir, "Helvetica Neue", Arial, sans-serif' },
  { value: "helvetica", label: "Helvetica Neue", family: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: "arial", label: "Arial", family: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { value: "verdana", label: "Verdana", family: "Verdana, Geneva, sans-serif" },
  { value: "tahoma", label: "Tahoma", family: 'Tahoma, "Segoe UI", sans-serif' },
  { value: "trebuchet", label: "Trebuchet MS", family: '"Trebuchet MS", Helvetica, sans-serif' },
  { value: "georgia", label: "Georgia", family: 'Georgia, "Times New Roman", serif' },
  { value: "times", label: "Times New Roman", family: '"Times New Roman", Times, serif' },
  { value: "garamond", label: "Garamond", family: 'Garamond, "Times New Roman", serif' },
  { value: "palatino", label: "Palatino", family: '"Palatino Linotype", Palatino, serif' },
  { value: "courier", label: "Courier New", family: '"Courier New", Courier, monospace' },
  { value: "lucida", label: "Lucida Sans", family: '"Lucida Sans Unicode", "Lucida Grande", "Segoe UI", sans-serif' },
  { value: "mono", label: "Modern Mono", family: 'Menlo, Consolas, Monaco, "Liberation Mono", "Courier New", monospace' },
];
const resolveQrMenuFontFamily = (value) => {
  const key = String(value || "").trim().toLowerCase();
  const found = QR_MENU_FONT_OPTIONS.find((item) => item.value === key);
  return found?.family || QR_MENU_FONT_OPTIONS[0].family;
};

const makeEmptyConcertAreaAllocation = () => ({
  area_name: "",
  allocation_type: "ticket",
  price: "",
  quantity_total: "",
});

const makeEmptyConcertTicketType = () => ({
  name: "",
  area_name: "",
  price: "",
  quantity_total: "",
  description: "",
  is_table_package: false,
});

const CONCERT_GUEST_COMPOSITION_FIELD_MODES = [
  { value: "hidden", label: "Hidden" },
  { value: "optional", label: "Optional" },
  { value: "required", label: "Required" },
];

const CONCERT_GUEST_COMPOSITION_RESTRICTION_RULES = [
  { value: "no_restriction", label: "No restriction" },
  { value: "male_only_groups_not_allowed", label: "Male-only groups not allowed" },
  { value: "female_only_groups_not_allowed", label: "Female-only groups not allowed" },
  { value: "at_least_1_female_required", label: "At least 1 female required" },
  { value: "couple_only", label: "Couple only" },
  { value: "custom_rule_later", label: "Custom rule later" },
];

const makeEmptyConcertForm = () => ({
  artist_name: "",
  event_title: "",
  event_date: "",
  event_time: "",
  description: "",
  event_image: "",
  ticket_price: "",
  total_ticket_quantity: "",
  total_table_quantity: "",
  reservation_payment_method: "bank_transfer",
  bank_transfer_instructions: "",
  status: "active",
  free_concert: false,
  guest_composition_enabled: false,
  guest_composition_field_mode: "optional",
  guest_composition_restriction_rule: "no_restriction",
  guest_composition_validation_message: "",
  guest_composition_disabled_tables: [],
  area_allocations: [makeEmptyConcertAreaAllocation()],
  ticket_types: [makeEmptyConcertTicketType()],
});

function normalizeTableNumberList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b);
}

function normalizeLocationText(value) {
  return String(value || "").trim();
}

function normalizeCoordinateValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDeliveryZoneCitiesInput(value) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeDeliveryRangeKmInput(value, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(0.5, Math.min(parsed, 100));
}

export default function QrMenuSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canAccessQrSettingsTab = useHasPermission(["qr-menu-settings", "qr-menu-settings-qr"]);
  const canAccessAppSettingsTab = useHasPermission(["qr-menu-settings", "qr-menu-settings-app"]);
  const canAccessConcertTicketsTab = useHasPermission(["qr-menu-settings", "qr-menu-settings-concert"]);
  const canAccessOrderSettingsTab = useHasPermission(["qr-menu-settings", "qr-menu-settings-controls"]);
  const canAccessGenerateQrTab = useHasPermission(["qr-menu-settings", "qr-menu-settings-generate-qr"]);
  const [qrUrl, setQrUrl] = useState("");
  const [products, setProducts] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingLink, setLoadingLink] = useState(false);
  const qrRef = useRef();
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [savingReservationPickup, setSavingReservationPickup] = useState(false);
  const [savingTableOrder, setSavingTableOrder] = useState(false);
  const [savingTableQrScan, setSavingTableQrScan] = useState(false);
  const [savingReservationTab, setSavingReservationTab] = useState(false);
  const [savingReservationGuestComposition, setSavingReservationGuestComposition] =
    useState(false);
  const [savingDisableAllProducts, setSavingDisableAllProducts] = useState(false);
  const [savingDeliveryCoverage, setSavingDeliveryCoverage] = useState(false);
  const [savingConcertReservationButtonColor, setSavingConcertReservationButtonColor] = useState(false);
  const [savingBookingSettings, setSavingBookingSettings] = useState(false);
  const [savingFloorPlanLayout, setSavingFloorPlanLayout] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("qr");
  const concertSectionRef = useRef(null);
  const shouldScrollToConcertEditorRef = useRef(false);
  const [tables, setTables] = useState([]);
  const [tableQr, setTableQr] = useState({}); // { [tableNumber]: { url, loading } }
  const [tableCount, setTableCount] = useState("");
  const [savingTableCount, setSavingTableCount] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
  });
  const productImageInputRef = useRef(null);
  const [newProductImageFile, setNewProductImageFile] = useState(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState("");
  const [uploadingNewProductImage, setUploadingNewProductImage] = useState(false);

  const categoryImageInputRef = useRef(null);
  const [categoryImageFileName, setCategoryImageFileName] = useState("");
  const [categoryImagePreview, setCategoryImagePreview] = useState("");
  const [uploadingCategoryImage, setUploadingCategoryImage] = useState(false);
  const appIconInputRef = useRef(null);
  const splashLogoInputRef = useRef(null);
  const mainTitleLogoInputRef = useRef(null);
  const marketplaceBannerInputRef = useRef(null);
  const [appIconFileName, setAppIconFileName] = useState("");
  const [splashLogoFileName, setSplashLogoFileName] = useState("");
  const [mainTitleLogoFileName, setMainTitleLogoFileName] = useState("");
  const [marketplaceBannerFileName, setMarketplaceBannerFileName] = useState("");
  const [uploadingAppIcon, setUploadingAppIcon] = useState(false);
  const [uploadingSplashLogo, setUploadingSplashLogo] = useState(false);
  const [uploadingMainTitleLogo, setUploadingMainTitleLogo] = useState(false);
  const [uploadingMarketplaceBanner, setUploadingMarketplaceBanner] = useState(false);

  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState(null);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const [shopHours, setShopHours] = useState({});
  const [loadingShopHours, setLoadingShopHours] = useState(true);
  const [savingShopHours, setSavingShopHours] = useState(false);
  const [shopHoursDirty, setShopHoursDirty] = useState(false);
  const [shopHoursSaveStatus, setShopHoursSaveStatus] = useState("idle");
  const [showShopHoursDropdown, setShowShopHoursDropdown] = useState(false);
  const shopHoursDropdownRef = useRef(null);
  const [
    showReservationGuestCompositionTablesDropdown,
    setShowReservationGuestCompositionTablesDropdown,
  ] = useState(false);
  const reservationGuestCompositionTablesDropdownRef = useRef(null);
  const [showGuestCompositionTablesDropdown, setShowGuestCompositionTablesDropdown] =
    useState(false);
  const guestCompositionTablesDropdownRef = useRef(null);
  const [deliveryZoneCitiesInput, setDeliveryZoneCitiesInput] = useState("");
  const [restaurantDeliveryProfile, setRestaurantDeliveryProfile] = useState({
    location: "",
    city: "",
    pos_location_lat: null,
    pos_location_lng: null,
  });
  const [uploadingStoryImages, setUploadingStoryImages] = useState(false);
  const [uploadingStoryVideo, setUploadingStoryVideo] = useState(false);
  const [draggedStoryImageIndex, setDraggedStoryImageIndex] = useState(null);
  const [settings, setSettings] = useState({
  main_title: "",
  subtitle: "",
  tagline: "",
  phone: "",
  primary_color: "#4F46E5",
  concert_reservation_button_color: "#111827",
  // New customization defaults
  enable_popular: true,
  qr_download_popup_enabled: true,
  qr_theme: "auto", // auto | light | dark
  loyalty_enabled: false,
  loyalty_goal: 10,
  loyalty_reward_text: "Free Menu Item",
  loyalty_color: "#F59E0B",
  hero_slides: [],
  story_enabled: true,
  story_title: "",
  story_text: "",
  story_images: [],
  story_image: "",
  story_video_title: "",
  story_video_source: "none",
  story_video_youtube_url: "",
  story_video_youtube_urls: [""],
  story_video_upload: "",
  reviews: [],
  social_instagram: "",
  social_tiktok: "",
  social_website: "",
  delivery_enabled: true,
  delivery_zone_cities: [],
  delivery_range_km: 5,
  delivery_origin_location: "",
  delivery_origin_lat: null,
  delivery_origin_lng: null,
  reservation_pickup_enabled: true,
  reservation_guest_composition_enabled: false,
  reservation_guest_composition_field_mode: "optional",
  reservation_guest_composition_restriction_rule: "no_restriction",
  reservation_guest_composition_validation_message: "",
  reservation_guest_composition_disabled_tables: [],
  qr_floor_plan_layout: null,
  ...QR_BOOKING_DEFAULTS,
  table_order_enabled: true,
  table_qr_scan_enabled: true,
  disable_all_products: false,
  reservation_tab_enabled: true,
  table_geo_enabled: false,
  table_geo_radius_meters: 150,
  app_icon: "",
  app_icon_192: "",
  app_icon_512: "",
  apple_touch_icon: "",
  splash_logo: "",
  main_title_logo: "",
  marketplace_banner: "",
  app_display_name: "",
  pwa_primary_color: "#4F46E5",
  pwa_background_color: "#FFFFFF",
  qrmenu_font_family: "gotham",
});
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [customDomainError, setCustomDomainError] = useState("");
  const [currentRestaurantSlug, setCurrentRestaurantSlug] = useState("");
  const [concertEvents, setConcertEvents] = useState([]);
  const [concertAreas, setConcertAreas] = useState([]);
  const [loadingConcerts, setLoadingConcerts] = useState(false);
  const [savingConcert, setSavingConcert] = useState(false);
  const [deletingConcertId, setDeletingConcertId] = useState(null);
  const [editingConcertId, setEditingConcertId] = useState(null);
  const concertImageInputRef = useRef(null);
  const [uploadingConcertImage, setUploadingConcertImage] = useState(false);
  const [concertForm, setConcertForm] = useState(makeEmptyConcertForm());
  const [concertBookingsByEvent, setConcertBookingsByEvent] = useState({});
  const [loadingConcertBookingsEventId, setLoadingConcertBookingsEventId] = useState(null);
  const [updatingConcertBookingId, setUpdatingConcertBookingId] = useState(null);

  const settingsTabs = useMemo(
    () =>
      [
        { id: "qr", label: t("Menu Setup"), allowed: canAccessQrSettingsTab },
        { id: "app", label: t("App Settings"), allowed: canAccessAppSettingsTab },
        { id: "concert", label: t("Concert Tickets"), allowed: canAccessConcertTicketsTab },
        { id: "controls", label: t("Order Settings"), allowed: canAccessOrderSettingsTab },
        { id: "generate-qr", label: t("Generate Qr"), allowed: canAccessGenerateQrTab },
        { id: "floor-plan", label: t("Floor plan"), allowed: canAccessAppSettingsTab },
      ].filter((tab) => tab.allowed),
    [
      canAccessAppSettingsTab,
      canAccessConcertTicketsTab,
      canAccessGenerateQrTab,
      canAccessOrderSettingsTab,
      canAccessQrSettingsTab,
      t,
    ]
  );

  useEffect(() => {
    if (settingsTabs.length === 0) return;
    if (!settingsTabs.some((tab) => tab.id === activeSettingsTab)) {
      setActiveSettingsTab(settingsTabs[0].id);
    }
  }, [activeSettingsTab, settingsTabs]);

  useEffect(() => {
    if (activeSettingsTab !== "concert") return;
    if (!shouldScrollToConcertEditorRef.current) return;

    shouldScrollToConcertEditorRef.current = false;

    const rafId = window.requestAnimationFrame(() => {
      concertSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [activeSettingsTab, editingConcertId]);

  const uploadsBaseUrl = API_ORIGIN || "";

  const resolveUploadSrc = (raw, version = "") => {
    const value = normalizeAssetValue(raw);
    if (!value) return "";
    const resolved = value.startsWith("http")
      ? value
      : `${uploadsBaseUrl}/uploads/${value.replace(/^\/?uploads\//, "")}`;

    if (!version) return resolved;
    const separator = resolved.includes("?") ? "&" : "?";
    return `${resolved}${separator}v=${encodeURIComponent(version)}`;
  };

  const normalizeStoryImages = (source) => {
    const ordered = Array.isArray(source?.story_images) ? source.story_images : [];
    const next = ordered
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    if (next.length > 0) return next;

    const legacy = String(source?.story_image || "").trim();
    return legacy ? [legacy] : [];
  };

  const normalizeStoryVideoUrls = (source) => {
    const ordered = Array.isArray(source?.story_video_youtube_urls)
      ? source.story_video_youtube_urls
      : [];
    const next = ordered.map((item) => String(item || "").trim());
    if (next.some(Boolean)) {
      return next.length > 0 ? next : [""];
    }

    const legacy = String(source?.story_video_youtube_url || "").trim();
    return legacy ? [legacy] : [""];
  };

  const applyLoadedCustomization = React.useCallback((customization = {}, restaurantMeta = null) => {
    const normalizedRestaurantMeta = {
      location: normalizeLocationText(restaurantMeta?.location),
      city: normalizeLocationText(restaurantMeta?.city),
      pos_location_lat: normalizeCoordinateValue(restaurantMeta?.pos_location_lat),
      pos_location_lng: normalizeCoordinateValue(restaurantMeta?.pos_location_lng),
    };
    const normalizedCustomization = {
      ...customization,
      app_icon: normalizeAssetValue(customization.app_icon),
      app_icon_192: normalizeAssetValue(customization.app_icon_192),
      app_icon_512: normalizeAssetValue(customization.app_icon_512),
      apple_touch_icon: normalizeAssetValue(customization.apple_touch_icon),
      splash_logo: normalizeAssetValue(customization.splash_logo),
      main_title_logo: normalizeAssetValue(customization.main_title_logo),
      marketplace_banner: normalizeAssetValue(customization.marketplace_banner),
      branding_updated_at: normalizeAssetValue(customization.branding_updated_at),
      qr_floor_plan_layout: normalizeFloorPlanLayout(customization.qr_floor_plan_layout),
      delivery_origin_location:
        normalizeLocationText(customization.delivery_origin_location) ||
        normalizedRestaurantMeta.location,
      delivery_origin_lat:
        normalizeCoordinateValue(customization.delivery_origin_lat) ??
        normalizedRestaurantMeta.pos_location_lat,
      delivery_origin_lng:
        normalizeCoordinateValue(customization.delivery_origin_lng) ??
        normalizedRestaurantMeta.pos_location_lng,
      delivery_zone_cities: normalizeDeliveryZoneCitiesInput(customization.delivery_zone_cities),
      delivery_range_km: normalizeDeliveryRangeKmInput(customization.delivery_range_km, 5),
    };
    const storyImages = normalizeStoryImages(normalizedCustomization);
    const storyVideoYoutubeUrls = normalizeStoryVideoUrls(normalizedCustomization);
    const bookingSettings = normalizeQrBookingSettings(normalizedCustomization);

    setSettings((prev) => ({
      ...prev,
      ...normalizedCustomization,
      ...bookingSettings,
      story_enabled: normalizedCustomization.story_enabled !== false,
      story_images: storyImages,
      story_image: storyImages[0] || "",
      story_video_youtube_urls: storyVideoYoutubeUrls,
      story_video_youtube_url: String(storyVideoYoutubeUrls[0] || "").trim(),
    }));
    setDeliveryZoneCitiesInput(
      normalizeDeliveryZoneCitiesInput(normalizedCustomization.delivery_zone_cities).join(", ")
    );
    if (restaurantMeta && typeof restaurantMeta === "object") {
      setRestaurantDeliveryProfile(normalizedRestaurantMeta);
    }

    setAppIconFileName(
      getAssetFileName(
        normalizedCustomization.app_icon_512 ||
          normalizedCustomization.app_icon_192 ||
          normalizedCustomization.app_icon
      )
    );
    setSplashLogoFileName(getAssetFileName(normalizedCustomization.splash_logo));
    setMainTitleLogoFileName(getAssetFileName(normalizedCustomization.main_title_logo));
    setMarketplaceBannerFileName(getAssetFileName(normalizedCustomization.marketplace_banner));
  }, []);

  const customDomainPreview = useMemo(
    () => getCustomDomainPreview(customDomainInput),
    [customDomainInput]
  );
  const fallbackRestaurantSlug = String(
    currentRestaurantSlug || extractIdentifierFromQrUrl(qrUrl) || ""
  ).trim();
  const slugPreviewValue = customDomainPreview.isBlank
    ? fallbackRestaurantSlug || "-"
    : customDomainPreview.generatedSlug || "-";
  const domainPreviewValue = customDomainPreview.isBlank
    ? PUBLIC_RESTAURANT_BASE_HOST
    : customDomainPreview.normalizedDomain || "-";
  const customDomainInlineError =
    customDomainError ||
    (!customDomainPreview.isBlank && !customDomainPreview.isValid
      ? t("Please enter a valid domain like menu.myrestaurant.com")
      : "");
  const iosPwaIconSource = useMemo(
    () =>
      normalizeAssetValue(
        settings.apple_touch_icon ||
          settings.app_icon_192 ||
          settings.app_icon_512 ||
          settings.app_icon
      ),
    [
      settings.apple_touch_icon,
      settings.app_icon,
      settings.app_icon_192,
      settings.app_icon_512,
    ]
  );
  const iosPwaIconHref = useMemo(() => {
    if (!iosPwaIconSource) return toAbsolutePublicUrl("/apple-touch-icon.png");

    const resolved = iosPwaIconSource.startsWith("http")
      ? iosPwaIconSource
      : `${uploadsBaseUrl}/uploads/${iosPwaIconSource.replace(/^\/?uploads\//, "")}`;
    return appendVersionParam(
      toAbsolutePublicUrl(resolved),
      normalizeAssetValue(settings.branding_updated_at)
    );
  }, [iosPwaIconSource, settings.branding_updated_at, uploadsBaseUrl]);
  const iosPwaTitle = useMemo(
    () => String(settings.app_display_name || settings.main_title || "Beypro").trim() || "Beypro",
    [settings.app_display_name, settings.main_title]
  );

  const generatedVenueFloorPlan = useMemo(() => buildGeneratedFloorPlan(tables), [tables]);
  const effectiveVenueFloorPlan =
    syncFloorPlanLayoutWithTables(settings.qr_floor_plan_layout, tables) || generatedVenueFloorPlan;

  const saveFloorPlanLayout = async () => {
    setSavingFloorPlanLayout(true);
    try {
      const nextFloorPlanLayout = renumberFloorPlanTables(
        syncFloorPlanLayoutWithTables(settings.qr_floor_plan_layout, tables)
      );
      const payload = {
        qr_floor_plan_layout: nextFloorPlanLayout,
      };
      setSettings((prev) => ({
        ...prev,
        qr_floor_plan_layout: nextFloorPlanLayout,
      }));
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      writeQrMenuBrandingCache(extractIdentifierFromQrUrl(qrUrl), {
        ...settings,
        ...payload,
      });
      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to save floor plan layout:", err);
      toast.error(err?.message || t("Save failed"));
    } finally {
      setSavingFloorPlanLayout(false);
    }
  };

  const updateStoryImages = (nextImages) => {
    const normalized = nextImages
      .map((item) => String(item || "").trim())
      .filter(Boolean);

    setSettings((prev) => ({
      ...prev,
      story_images: normalized,
      story_image: normalized[0] || "",
    }));
  };

function updateField(key, value) {
  setSettings((prev) => ({ ...prev, [key]: value }));
}

function buildDeliveryCoveragePayload(currentSettings, zoneCitiesInput, fallbackProfile = {}) {
  const nextDeliveryZoneCities = normalizeDeliveryZoneCitiesInput(zoneCitiesInput);
  const nextDeliveryRangeKm = normalizeDeliveryRangeKmInput(currentSettings.delivery_range_km, 5);
  const fallbackLocation = normalizeLocationText(fallbackProfile.location);
  const fallbackLat = normalizeCoordinateValue(fallbackProfile.pos_location_lat);
  const fallbackLng = normalizeCoordinateValue(fallbackProfile.pos_location_lng);

  return {
    delivery_zone_cities: nextDeliveryZoneCities,
    delivery_range_km: nextDeliveryRangeKm,
    delivery_origin_location:
      normalizeLocationText(currentSettings.delivery_origin_location) || fallbackLocation,
    delivery_origin_lat: normalizeCoordinateValue(currentSettings.delivery_origin_lat) ?? fallbackLat,
    delivery_origin_lng: normalizeCoordinateValue(currentSettings.delivery_origin_lng) ?? fallbackLng,
  };
}

function updateStoryVideoUrl(index, value) {
  setSettings((prev) => {
    const nextUrls = normalizeStoryVideoUrls(prev);
    nextUrls[index] = value;
    return {
      ...prev,
      story_video_youtube_urls: nextUrls,
      story_video_youtube_url: String(nextUrls[0] || "").trim(),
    };
  });
}

function addStoryVideoUrl() {
  setSettings((prev) => ({
    ...prev,
    story_video_youtube_urls: [...normalizeStoryVideoUrls(prev), ""],
  }));
}

function removeStoryVideoUrl(index) {
  setSettings((prev) => {
    const nextUrls = normalizeStoryVideoUrls(prev).filter((_, urlIndex) => urlIndex !== index);
    const normalized = nextUrls.length > 0 ? nextUrls : [""];
    return {
      ...prev,
      story_video_youtube_urls: normalized,
      story_video_youtube_url: String(normalized[0] || "").trim(),
    };
  });
}

async function uploadBrandingAsset(field, file) {
  if (!file) return;
  const isAppIcon = field === "app_icon";
  const isSplashLogo = field === "splash_logo";
  const isMainTitleLogo = field === "main_title_logo";
  const isMarketplaceBanner = field === "marketplace_banner";
  if (isAppIcon) setUploadingAppIcon(true);
  if (isSplashLogo) setUploadingSplashLogo(true);
  if (isMainTitleLogo) setUploadingMainTitleLogo(true);
  if (isMarketplaceBanner) setUploadingMarketplaceBanner(true);
  try {
    if (isMainTitleLogo) {
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await secureFetch("/upload", {
        method: "POST",
        body: uploadForm,
      });
      const uploadedPath = String(uploadRes?.url || "").trim();
      if (!uploadedPath) {
        toast.error(t("Upload failed"));
        return;
      }
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({
          main_title_logo: uploadedPath,
        }),
      });
      setSettings((prev) => ({
        ...prev,
        main_title_logo: uploadedPath,
      }));
      toast.success(t("Saved successfully!"));
      return;
    }

    const formData = new FormData();
    formData.append(field, file);
    formData.append(
      "pwa_background_color",
      String(settings.pwa_background_color || "#FFFFFF")
    );
    const res = await secureFetch("/settings/qr-menu-branding-assets", {
      method: "POST",
      body: formData,
    });
    if (res?.success && res?.customization) {
      applyLoadedCustomization(res.customization);
      toast.success(t("Saved successfully!"));
      return;
    }
    toast.error(t("Upload failed"));
  } catch (err) {
    console.error("❌ Failed to upload QR branding asset:", err);
    toast.error(t("Upload failed"));
  } finally {
    if (isAppIcon) setUploadingAppIcon(false);
    if (isSplashLogo) setUploadingSplashLogo(false);
    if (isMainTitleLogo) setUploadingMainTitleLogo(false);
    if (isMarketplaceBanner) setUploadingMarketplaceBanner(false);
  }
}

function addHeroSlide() {
  setSettings((prev) => ({
    ...prev,
    hero_slides: [...prev.hero_slides, { title: "", subtitle: "", image: "" }],
  }));
}

function updateHeroSlide(index, key, value) {
  const updated = [...settings.hero_slides];
  updated[index][key] = value;
  setSettings((p) => ({ ...p, hero_slides: updated }));
}

function removeHeroSlide(index) {
  setSettings((prev) => ({
    ...prev,
    hero_slides: prev.hero_slides.filter((_, slideIndex) => slideIndex !== index),
  }));
}

async function uploadHeroImage(e, index) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const res = await secureFetch("/upload", {
    method: "POST",
    body: formData,
  });

  if (res.url) {
    updateHeroSlide(index, "image", res.url);
  }
}



async function uploadStoryImages(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  setUploadingStoryImages(true);

  try {
    const uploads = await Promise.allSettled(
      files.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await secureFetch("/upload", {
          method: "POST",
          body: formData,
        });
        return res?.url || "";
      })
    );

    const uploadedImages = uploads
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .filter(Boolean);
    if (uploadedImages.length === 0) {
      toast.error(t("Upload failed"));
      return;
    }

    setSettings((prev) => {
      const nextImages = [
        ...normalizeStoryImages(prev),
        ...uploadedImages,
      ];
      return {
        ...prev,
        story_images: nextImages,
        story_image: nextImages[0] || "",
      };
    });
  } catch (err) {
    console.error("❌ Failed to upload story images:", err);
    toast.error(t("Upload failed"));
  } finally {
    setUploadingStoryImages(false);
    e.target.value = "";
  }
}

async function uploadStoryVideo(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const fileSizeMb = Number(file.size || 0) / (1024 * 1024);
  if (fileSizeMb > MAX_STORY_VIDEO_UPLOAD_MB) {
    toast.error(
      t(`Video is too large. Max allowed is ${MAX_STORY_VIDEO_UPLOAD_MB} MB.`)
    );
    e.target.value = "";
    return;
  }

  setUploadingStoryVideo(true);
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await secureFetch("/upload", {
      method: "POST",
      body: formData,
    });
    const uploadedVideo = String(res?.url || "").trim();
    if (!uploadedVideo) {
      toast.error(t("Upload failed"));
      return;
    }
    setSettings((prev) => ({
      ...prev,
      story_video_upload: uploadedVideo,
      story_video_source: "upload",
    }));
  } catch (err) {
    console.error("❌ Failed to upload story video:", err);
    toast.error(err?.message || t("Upload failed"));
  } finally {
    setUploadingStoryVideo(false);
    e.target.value = "";
  }
}

function removeStoryVideoUpload() {
  setSettings((prev) => ({
    ...prev,
    story_video_upload: "",
    story_video_source: prev.story_video_source === "upload" ? "none" : prev.story_video_source,
  }));
}

function removeStoryImage(index) {
  updateStoryImages(settings.story_images.filter((_, i) => i !== index));
}

function moveStoryImage(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= settings.story_images.length) return;

  const nextImages = [...settings.story_images];
  const [moved] = nextImages.splice(index, 1);
  nextImages.splice(targetIndex, 0, moved);
  updateStoryImages(nextImages);
}

function handleStoryImageDrop(dropIndex) {
  if (draggedStoryImageIndex == null || draggedStoryImageIndex === dropIndex) {
    setDraggedStoryImageIndex(null);
    return;
  }

  const nextImages = [...settings.story_images];
  const [moved] = nextImages.splice(draggedStoryImageIndex, 1);
  nextImages.splice(dropIndex, 0, moved);
  updateStoryImages(nextImages);
  setDraggedStoryImageIndex(null);
}

function updateReview(i, key, value) {
  const updated = [...settings.reviews];
  updated[i][key] = value;
  setSettings((p) => ({ ...p, reviews: updated }));
}

function addReview() {
  setSettings((prev) => ({
    ...prev,
    reviews: [...prev.reviews, { name: "", rating: 5, text: "" }],
  }));
}

function removeReview(index) {
  setSettings((prev) => ({
    ...prev,
    reviews: prev.reviews.filter((_, reviewIndex) => reviewIndex !== index),
  }));
}



async function saveAllCustomization() {
  try {
    if (!customDomainPreview.isBlank && !customDomainPreview.isValid) {
      setCustomDomainError(t("Please enter a valid domain like menu.myrestaurant.com"));
      return;
    }

    const storyImages = normalizeStoryImages(settings);
    const storyVideoYoutubeUrls = normalizeStoryVideoUrls(settings)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const normalizedBookingSettings = normalizeQrBookingSettings(settings);
    const deliveryCoveragePayload = buildDeliveryCoveragePayload(
      settings,
      deliveryZoneCitiesInput,
      restaurantDeliveryProfile
    );
    const payload = {
      ...settings,
      ...deliveryCoveragePayload,
      ...normalizedBookingSettings,
      custom_domain: String(customDomainInput || "").trim(),
      story_enabled: settings.story_enabled !== false,
      story_images: storyImages,
      story_image: storyImages[0] || "",
      story_video_youtube_urls: storyVideoYoutubeUrls,
      story_video_youtube_url: storyVideoYoutubeUrls[0] || "",
    };
    const saveRes = await secureFetch("/settings/qr-menu-customization", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const savedSlug = String(saveRes?.restaurant?.slug || fallbackRestaurantSlug || "").trim();
    const savedCustomDomain = String(saveRes?.restaurant?.custom_domain || "").trim();
    setCustomDomainError("");
    setCurrentRestaurantSlug(savedSlug);
    setCustomDomainInput(savedCustomDomain);
    setDeliveryZoneCitiesInput(deliveryCoveragePayload.delivery_zone_cities.join(", "));
    if (savedSlug) {
      syncRestaurantSlugCache(savedSlug);
      writeQrMenuBrandingCache(savedSlug, saveRes?.customization || payload);
    }

    try {
      const linkRes = await secureFetch("/settings/qr-link");
      if (linkRes?.success && linkRes.link) {
        setQrUrl(normalizePublicRestaurantUrl(linkRes.link));
      }
      if (linkRes?.slug) {
        setCurrentRestaurantSlug(String(linkRes.slug || "").trim());
        syncRestaurantSlugCache(linkRes.slug);
      }
    } catch (linkErr) {
      console.warn("⚠️ Failed to refresh QR link after customization save:", linkErr);
    }

    toast.success(t("Saved!"));
  } catch (err) {
    if (err?.details?.body?.field === "custom_domain") {
      setCustomDomainError(err.message || t("Invalid custom domain"));
    }
    toast.error(err?.message || t("Save failed"));
  }
}

  // ✅ Load products and short QR link
  useEffect(() => {
  const loadData = async () => {
    try {
      // 1) Load products
      const prodData = await secureFetch("/products");
      setProducts(Array.isArray(prodData) ? prodData : prodData?.data || []);

      // 2) Load disabled products
      const disData = await secureFetch("/settings/qr-menu-disabled");
      if (Array.isArray(disData)) setDisabledIds(disData);
      else if (typeof disData === "object" && disData?.disabled)
        setDisabledIds(disData.disabled);

      // ✅ 3) LOAD QR MENU CUSTOMIZATION (THE FIX)
      const customRes = await secureFetch("/settings/qr-menu-customization");
      if (customRes?.success && customRes.customization) {
        applyLoadedCustomization(customRes.customization, customRes?.restaurant || null);
        setCustomDomainInput(String(customRes?.restaurant?.custom_domain || "").trim());
        setCurrentRestaurantSlug(String(customRes?.restaurant?.slug || "").trim());
        setCustomDomainError("");
      }

      // 4) Load short QR link
      setLoadingLink(true);
      const linkRes = await secureFetch("/settings/qr-link");
      if (linkRes?.success && linkRes.link) setQrUrl(normalizePublicRestaurantUrl(linkRes.link));
      if (linkRes?.slug) {
        const normalizedSlug = String(linkRes.slug || "").trim();
        setCurrentRestaurantSlug(normalizedSlug);
        syncRestaurantSlugCache(normalizedSlug);
      }
      if (!customRes?.restaurant?.custom_domain && linkRes?.custom_domain) {
        setCustomDomainInput(String(linkRes.custom_domain || "").trim());
      }

      // 5) Load concert/event builder data
      await loadConcerts();

    } catch (err) {
      console.error("❌ Failed to load QR settings:", err);
      toast.error(t("Failed to load QR menu data"));
    } finally {
      setLoadingLink(false);
    }
  };

  loadData();
}, [applyLoadedCustomization, t]);

  // Load tables for per-table QR codes
  useEffect(() => {
    const loadTables = async () => {
      try {
        const data = await secureFetch("/tables?active=true");
        const arr = Array.isArray(data) ? data : data?.data || [];
        setTables(arr);
        const activeTables = arr.filter((t) => t.active !== false);
        setTableCount(String(activeTables.length || 0));
      } catch (err) {
        console.error("❌ Failed to load tables for QR:", err);
      }
    };
    loadTables();
  }, []);

  const saveTableCount = async () => {
    const total = Number(tableCount);
    if (!Number.isFinite(total) || total < 0) {
      toast.error(t("Invalid table count"));
      return;
    }
    setSavingTableCount(true);
    try {
      await secureFetch("/tables/count", {
        method: "PUT",
        body: JSON.stringify({ total }),
      });
      toast.success(t("Saved successfully!"));
      const data = await secureFetch("/tables?active=true");
      const arr = Array.isArray(data) ? data : data?.data || [];
      setTables(arr);
      const activeTables = arr.filter((t) => t.active !== false);
      setTableCount(String(activeTables.length || total));
    } catch (err) {
      console.error("❌ Failed to save table count:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setSavingTableCount(false);
    }
  };

  const saveNewProduct = async () => {
    if (!newProduct.name || !newProduct.price) {
      toast.error(t("Please fill required fields"));
      return;
    }
    setSavingProduct(true);
    try {
      let imageUrl = "";
      if (newProductImageFile) {
        setUploadingNewProductImage(true);
        try {
          const formData = new FormData();
          formData.append("file", newProductImageFile);
          const res = await secureFetch("/upload", {
            method: "POST",
            body: formData,
          });
          if (!res?.url) {
            toast.error(t("Image upload failed!"));
            return;
          }
          imageUrl = res.url;
        } finally {
          setUploadingNewProductImage(false);
        }
      }

      await secureFetch("/products", {
        method: "POST",
        body: JSON.stringify({
          name: newProduct.name,
          price: Number(newProduct.price) || 0,
          category: newProduct.category || "",
          description: newProduct.description || "",
          image: imageUrl || "",
          visible: true,
        }),
      });
      toast.success(t("Saved successfully!"));
      setNewProduct({ name: "", price: "", category: "", description: "" });
      setNewProductImageFile(null);
      setNewProductImagePreview("");
      setCategoryImageFileName("");
      setCategoryImagePreview("");
      const prodData = await secureFetch("/products");
      setProducts(Array.isArray(prodData) ? prodData : prodData?.data || []);
    } catch (err) {
      console.error("❌ Failed to add product:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setSavingProduct(false);
    }
  };

  useEffect(() => {
    if (!newProductImageFile) {
      setNewProductImagePreview("");
      return undefined;
    }
    const url = URL.createObjectURL(newProductImageFile);
    setNewProductImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newProductImageFile]);

  const uploadCategoryImage = async (file) => {
    const category = String(newProduct.category || "").trim();
    if (!category) {
      toast.error(t("Category required first!"));
      return;
    }
    setUploadingCategoryImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("category", category.toLowerCase());
      const res = await secureFetch("/category-images", { method: "POST", body: fd });
      if (!res || res?.error) {
        toast.error(t("Upload failed"));
        return;
      }
      toast.success(t("Category image uploaded!"));
      const data = await secureFetch(
        `/category-images?category=${encodeURIComponent(category.toLowerCase())}`
      );
      if (Array.isArray(data) && data.length > 0 && data[0]?.image) {
        setCategoryImagePreview(resolveUploadSrc(data[0].image));
      }
    } catch (err) {
      console.error("❌ Category upload failed:", err);
      toast.error(t("Category upload failed!"));
    } finally {
      setUploadingCategoryImage(false);
    }
  };


  const toggleDisable = async (productId) => {
    const updated = disabledIds.includes(productId)
      ? disabledIds.filter((id) => id !== productId)
      : [...disabledIds, productId];
    setDisabledIds(updated);
    try {
      await secureFetch(`/settings/qr-menu-disabled`, {
        method: "POST",
        body: JSON.stringify({ disabled: updated }),
      });
      toast.success(t("Saved successfully!"));
    } catch {
      toast.error(t("Failed to save changes"));
    }
  };

  const deleteProduct = async (product) => {
    const productId = product?.id;
    if (!productId) return;

    const label = String(product?.name || "").trim() || `#${productId}`;
    const ok = window.confirm(
      t("Delete product?") + `\n\n${label}\n\n` + t("This cannot be undone.")
    );
    if (!ok) return;

    setDeletingProductId(productId);
    try {
      await secureFetch(`/products/${productId}`, { method: "DELETE" });
      setProducts((prev) => (Array.isArray(prev) ? prev.filter((p) => p?.id !== productId) : prev));

      if (disabledIds.includes(productId)) {
        const updatedDisabled = disabledIds.filter((id) => id !== productId);
        setDisabledIds(updatedDisabled);
        try {
          await secureFetch(`/settings/qr-menu-disabled`, {
            method: "POST",
            body: JSON.stringify({ disabled: updatedDisabled }),
          });
        } catch {
          // ignore; list is already cleaned locally
        }
      }

      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to delete product:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setDeletingProductId(null);
    }
  };

  const saveDeliveryCoverage = async () => {
    setSavingDeliveryCoverage(true);
    try {
      const payload = buildDeliveryCoveragePayload(
        settings,
        deliveryZoneCitiesInput,
        restaurantDeliveryProfile
      );
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSettings((prev) => ({ ...prev, ...payload }));
      setDeliveryZoneCitiesInput(payload.delivery_zone_cities.join(", "));
      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to save delivery coverage settings:", err);
      toast.error(t("Save failed"));
    } finally {
      setSavingDeliveryCoverage(false);
    }
  };

  const toggleDelivery = async () => {
    const nextValue = !settings.delivery_enabled;
    updateField("delivery_enabled", nextValue);
    setSavingDelivery(true);
    try {
      await secureFetch("/settings/qr-menu-delivery", {
        method: "POST",
        body: JSON.stringify({ delivery_enabled: nextValue }),
      });
      toast.success(nextValue ? t("Delivery is open") : t("Delivery is closed"));
    } catch (err) {
      console.error("❌ Failed to toggle delivery:", err);
      toast.error(t("Failed to save delivery setting"));
      updateField("delivery_enabled", !nextValue);
    } finally {
      setSavingDelivery(false);
    }
  };

  const toggleReservationPickup = async () => {
    const nextValue = !settings.reservation_pickup_enabled;
    updateField("reservation_pickup_enabled", nextValue);
    setSavingReservationPickup(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ reservation_pickup_enabled: nextValue }),
      });
      toast.success(nextValue ? t("Pickup is open") : t("Pickup is closed"));
    } catch (err) {
      console.error("❌ Failed to toggle reservation pickup:", err);
      toast.error(t("Failed to save pickup setting"));
      updateField("reservation_pickup_enabled", !nextValue);
    } finally {
      setSavingReservationPickup(false);
    }
  };

  const toggleTableOrder = async () => {
    const nextValue = !settings.table_order_enabled;
    updateField("table_order_enabled", nextValue);
    setSavingTableOrder(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ table_order_enabled: nextValue }),
      });
      toast.success(nextValue ? t("Table order is open") : t("Table order is closed"));
    } catch (err) {
      console.error("❌ Failed to toggle table order:", err);
      toast.error(t("Failed to save table order setting"));
      updateField("table_order_enabled", !nextValue);
    } finally {
      setSavingTableOrder(false);
    }
  };

  const toggleTableQrScan = async () => {
    const nextValue = !settings.table_qr_scan_enabled;
    updateField("table_qr_scan_enabled", nextValue);
    setSavingTableQrScan(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ table_qr_scan_enabled: nextValue }),
      });
      toast.success(
        nextValue
          ? t("Table QR scan is enabled")
          : t("Table QR scan is disabled")
      );
    } catch (err) {
      console.error("❌ Failed to toggle table QR scan:", err);
      toast.error(t("Failed to save table QR scan setting"));
      updateField("table_qr_scan_enabled", !nextValue);
    } finally {
      setSavingTableQrScan(false);
    }
  };

  const toggleReservationTab = async () => {
    const nextValue = !settings.reservation_tab_enabled;
    updateField("reservation_tab_enabled", nextValue);
    setSavingReservationTab(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ reservation_tab_enabled: nextValue }),
      });
      toast.success(
        nextValue ? t("Reservation tab is open") : t("Reservation tab is closed")
      );
    } catch (err) {
      console.error("❌ Failed to toggle reservation tab:", err);
      toast.error(t("Failed to save reservation tab setting"));
      updateField("reservation_tab_enabled", !nextValue);
    } finally {
      setSavingReservationTab(false);
    }
  };

  const updateReservationGuestCompositionField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateReservationGuestCompositionEnabled = (value) => {
    setSettings((prev) => ({
      ...prev,
      reservation_guest_composition_enabled: value,
      reservation_guest_composition_field_mode:
        value && prev.reservation_guest_composition_field_mode === "hidden"
          ? "optional"
          : prev.reservation_guest_composition_field_mode,
    }));
  };

  const saveReservationGuestCompositionSettings = async () => {
    setSavingReservationGuestComposition(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({
          reservation_guest_composition_enabled: Boolean(
            settings.reservation_guest_composition_enabled
          ),
          reservation_guest_composition_field_mode:
            settings.reservation_guest_composition_field_mode || "optional",
          reservation_guest_composition_restriction_rule:
            settings.reservation_guest_composition_restriction_rule || "no_restriction",
          reservation_guest_composition_validation_message: String(
            settings.reservation_guest_composition_validation_message || ""
          ).trim(),
          reservation_guest_composition_disabled_tables: normalizeTableNumberList(
            settings.reservation_guest_composition_disabled_tables
          ),
        }),
      });
      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to save reservation guest composition settings:", err);
      toast.error(t("Save failed"));
    } finally {
      setSavingReservationGuestComposition(false);
    }
  };

  const toggleDisableAllProducts = async () => {
    const nextValue = !settings.disable_all_products;
    updateField("disable_all_products", nextValue);
    setSavingDisableAllProducts(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify({ disable_all_products: nextValue }),
      });
      toast.success(
        nextValue ? t("All products are now hidden") : t("All products are now visible")
      );
    } catch (err) {
      console.error("❌ Failed to toggle disable all products:", err);
      toast.error(t("Failed to save product visibility setting"));
      updateField("disable_all_products", !nextValue);
    } finally {
      setSavingDisableAllProducts(false);
    }
  };

  const saveConcertReservationButtonColor = async () => {
    setSavingConcertReservationButtonColor(true);
    try {
      const payload = {
        concert_reservation_button_color:
          String(settings.concert_reservation_button_color || "").trim() || "#111827",
      };
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      writeQrMenuBrandingCache(extractIdentifierFromQrUrl(qrUrl), {
        ...settings,
        ...payload,
      });
      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to save concert reservation button color:", err);
      toast.error(t("Save failed"));
    } finally {
      setSavingConcertReservationButtonColor(false);
    }
  };

  const saveBookingSettings = async () => {
    setSavingBookingSettings(true);
    try {
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify(normalizeQrBookingSettings(settings)),
      });
      toast.success(t("Saved successfully!"));
    } catch (err) {
      console.error("❌ Failed to save booking settings:", err);
      toast.error(t("Save failed"));
    } finally {
      setSavingBookingSettings(false);
    }
  };

  const resetConcertEditor = () => {
    setEditingConcertId(null);
    setConcertForm(makeEmptyConcertForm());
  };

  const toConcertPayload = (source) => ({
    artist_name: String(source?.artist_name || "").trim(),
    event_title: String(source?.event_title || "").trim(),
    event_date: String(source?.event_date || "").trim(),
    event_time: String(source?.event_time || "").trim(),
    description: String(source?.description || "").trim(),
    event_image: String(source?.event_image || "").trim(),
    ticket_price: Number(source?.ticket_price) || 0,
    total_ticket_quantity: Number(source?.total_ticket_quantity) || 0,
    total_table_quantity: Number(source?.total_table_quantity) || 0,
    reservation_payment_method: "bank_transfer",
    bank_transfer_instructions: String(source?.bank_transfer_instructions || "").trim(),
    status: String(source?.status || "active").toLowerCase(),
    free_concert: Boolean(source?.free_concert),
    guest_composition_enabled: Boolean(source?.guest_composition_enabled),
    guest_composition_field_mode: String(
      source?.guest_composition_field_mode || "optional"
    ).toLowerCase(),
    guest_composition_restriction_rule: String(
      source?.guest_composition_restriction_rule || "no_restriction"
    ).toLowerCase(),
    guest_composition_validation_message: String(
      source?.guest_composition_validation_message || ""
    ).trim(),
    guest_composition_disabled_tables: normalizeTableNumberList(
      source?.guest_composition_disabled_tables
    ),
    area_allocations: (Array.isArray(source?.area_allocations) ? source.area_allocations : [])
      .map((row) => ({
        area_name: String(row?.area_name || "").trim(),
        allocation_type: String(row?.allocation_type || "ticket").toLowerCase() === "table" ? "table" : "ticket",
        price: Number(row?.price) || 0,
        quantity_total: Number(row?.quantity_total) || 0,
      }))
      .filter((row) => row.area_name),
    ticket_types: (Array.isArray(source?.ticket_types) ? source.ticket_types : [])
      .map((row) => ({
        name: String(row?.name || "").trim(),
        area_name: String(row?.area_name || "").trim(),
        price: Number(row?.price) || 0,
        quantity_total: Number(row?.quantity_total) || 0,
        description: String(row?.description || "").trim(),
        is_table_package: Boolean(row?.is_table_package),
      }))
      .filter((row) => row.name),
  });

  const loadConcerts = async () => {
    setLoadingConcerts(true);
    try {
      const [eventsRes, areasRes] = await Promise.all([
        secureFetch("/concerts/events?include_hidden=true"),
        secureFetch("/concerts/areas"),
      ]);
      setConcertEvents(Array.isArray(eventsRes?.events) ? eventsRes.events : []);
      setConcertAreas(Array.isArray(areasRes?.areas) ? areasRes.areas : []);
    } catch (err) {
      console.error("❌ Failed to load concert data:", err);
      setConcertEvents([]);
      setConcertAreas([]);
    } finally {
      setLoadingConcerts(false);
    }
  };

  const updateConcertFormField = (key, value) => {
    setConcertForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateConcertGuestCompositionEnabled = (value) => {
    setConcertForm((prev) => ({
      ...prev,
      guest_composition_enabled: value,
      guest_composition_field_mode:
        value && prev.guest_composition_field_mode === "hidden"
          ? "optional"
          : prev.guest_composition_field_mode,
    }));
  };

  const addConcertAreaAllocation = () => {
    setConcertForm((prev) => ({
      ...prev,
      area_allocations: [...(prev.area_allocations || []), makeEmptyConcertAreaAllocation()],
    }));
  };

  const removeConcertAreaAllocation = (index) => {
    setConcertForm((prev) => ({
      ...prev,
      area_allocations: (prev.area_allocations || []).filter((_, i) => i !== index),
    }));
  };

  const updateConcertAreaAllocationField = (index, key, value) => {
    setConcertForm((prev) => {
      const next = [...(prev.area_allocations || [])];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [key]: value };
      return { ...prev, area_allocations: next };
    });
  };

  const addConcertTicketType = () => {
    setConcertForm((prev) => ({
      ...prev,
      ticket_types: [...(prev.ticket_types || []), makeEmptyConcertTicketType()],
    }));
  };

  const removeConcertTicketType = (index) => {
    setConcertForm((prev) => ({
      ...prev,
      ticket_types: (prev.ticket_types || []).filter((_, i) => i !== index),
    }));
  };

  const updateConcertTicketTypeField = (index, key, value) => {
    setConcertForm((prev) => {
      const next = [...(prev.ticket_types || [])];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [key]: value };
      return { ...prev, ticket_types: next };
    });
  };

  const startEditConcert = (event) => {
    shouldScrollToConcertEditorRef.current = true;
    setActiveSettingsTab("concert");
    setEditingConcertId(event.id);
    setConcertForm({
      artist_name: event.artist_name || "",
      event_title: event.event_title || "",
      event_date: String(event.event_date || "").slice(0, 10),
      event_time: String(event.event_time || "").slice(0, 5),
      description: event.description || "",
      event_image: event.event_image || "",
      ticket_price: String(event.ticket_price ?? ""),
      total_ticket_quantity: String(event.total_ticket_quantity ?? ""),
      total_table_quantity: String(event.total_table_quantity ?? ""),
      reservation_payment_method: "bank_transfer",
      bank_transfer_instructions: event.bank_transfer_instructions || "",
      status: event.status || "active",
      free_concert: Boolean(event.free_concert),
      guest_composition_enabled: Boolean(event.guest_composition_enabled),
      guest_composition_field_mode: event.guest_composition_field_mode || "optional",
      guest_composition_restriction_rule:
        event.guest_composition_restriction_rule || "no_restriction",
      guest_composition_validation_message:
        event.guest_composition_validation_message || "",
      guest_composition_disabled_tables: normalizeTableNumberList(
        event.guest_composition_disabled_tables
      ),
      area_allocations:
        Array.isArray(event.area_allocations) && event.area_allocations.length > 0
          ? event.area_allocations.map((row) => ({
              area_name: row.area_name || "",
              allocation_type: row.allocation_type || "ticket",
              price: String(row.price ?? ""),
              quantity_total: String(row.quantity_total ?? ""),
            }))
          : [makeEmptyConcertAreaAllocation()],
      ticket_types:
        Array.isArray(event.ticket_types) && event.ticket_types.length > 0
          ? event.ticket_types.map((row) => ({
              name: row.name || "",
              area_name: row.area_name || "",
              price: String(row.price ?? ""),
              quantity_total: String(row.quantity_total ?? ""),
              description: row.description || "",
              is_table_package: Boolean(row.is_table_package),
            }))
          : [makeEmptyConcertTicketType()],
    });
  };

  const uploadConcertImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingConcertImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await secureFetch("/upload", {
        method: "POST",
        body: formData,
      });
      if (!res?.url) {
        toast.error(t("Upload failed"));
        return;
      }
      updateConcertFormField("event_image", res.url);
    } catch (err) {
      console.error("❌ Failed to upload concert image:", err);
      toast.error(t("Upload failed"));
    } finally {
      setUploadingConcertImage(false);
      event.target.value = "";
    }
  };

  const saveConcert = async () => {
    const payload = toConcertPayload(concertForm);
    if (!payload.artist_name || !payload.event_date || !payload.event_time) {
      toast.error(t("Please fill required fields"));
      return;
    }
    setSavingConcert(true);
    try {
      const endpoint = editingConcertId
        ? `/concerts/events/${editingConcertId}`
        : "/concerts/events";
      const method = editingConcertId ? "PUT" : "POST";
      const mirroredReservationRules = {
        reservation_guest_composition_enabled: payload.guest_composition_enabled,
        reservation_guest_composition_field_mode: payload.guest_composition_field_mode,
        reservation_guest_composition_restriction_rule:
          payload.guest_composition_restriction_rule,
        reservation_guest_composition_validation_message:
          payload.guest_composition_validation_message,
        reservation_guest_composition_disabled_tables:
          payload.guest_composition_disabled_tables,
      };
      await secureFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      await secureFetch("/settings/qr-menu-customization", {
        method: "POST",
        body: JSON.stringify(mirroredReservationRules),
      });
      setSettings((prev) => ({
        ...prev,
        ...mirroredReservationRules,
      }));
      toast.success(t("Saved successfully!"));
      resetConcertEditor();
      await loadConcerts();
    } catch (err) {
      console.error("❌ Failed to save concert:", err);
      toast.error(err?.message || t("Failed to save changes"));
    } finally {
      setSavingConcert(false);
    }
  };

  const removeConcert = async (event) => {
    if (!event?.id) return;
    const ok = window.confirm(
      `${t("Delete")} ${event.event_title || event.artist_name || ""}?\n\n${t("This cannot be undone.")}`
    );
    if (!ok) return;
    setDeletingConcertId(event.id);
    try {
      await secureFetch(`/concerts/events/${event.id}`, { method: "DELETE" });
      toast.success(t("Saved successfully!"));
      if (editingConcertId === event.id) {
        resetConcertEditor();
      }
      await loadConcerts();
    } catch (err) {
      console.error("❌ Failed to delete concert:", err);
      toast.error(t("Failed to save changes"));
    } finally {
      setDeletingConcertId(null);
    }
  };

  const loadConcertBookings = async (eventId) => {
    const numericId = Number(eventId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;
    setLoadingConcertBookingsEventId(numericId);
    try {
      const res = await secureFetch(`/concerts/events/${numericId}/bookings`);
      setConcertBookingsByEvent((prev) => ({
        ...prev,
        [numericId]: Array.isArray(res?.bookings) ? res.bookings : [],
      }));
    } catch (err) {
      console.error("❌ Failed to load concert bookings:", err);
      toast.error(t("Failed to load settings"));
    } finally {
      setLoadingConcertBookingsEventId(null);
    }
  };

  const updateConcertBookingPayment = async (eventId, bookingId, paymentStatus) => {
    const numericBookingId = Number(bookingId);
    if (!Number.isFinite(numericBookingId) || numericBookingId <= 0) return;
    setUpdatingConcertBookingId(numericBookingId);
    try {
      await secureFetch(`/concerts/bookings/${numericBookingId}/payment-status`, {
        method: "PATCH",
        body: JSON.stringify({ payment_status: paymentStatus }),
      });
      toast.success(t("Saved successfully!"));
      await Promise.all([loadConcerts(), loadConcertBookings(eventId)]);
    } catch (err) {
      console.error("❌ Failed to update concert booking payment:", err);
      toast.error(err?.message || t("Failed to save changes"));
    } finally {
      setUpdatingConcertBookingId(null);
    }
  };

  const formatConcertDateTime = (event) => {
    const dateValue = String(event?.event_date || "").slice(0, 10);
    const timeValue = String(event?.event_time || "").slice(0, 5);
    return [dateValue, timeValue].filter(Boolean).join(" ");
  };

  const resolveConcertEndDate = (event) => {
    const directEnd = parseLocalDateTime(event?.slot_end_datetime);
    if (directEnd) return directEnd;

    const computedSlot = computeConcertSlot({
      eventDate: event?.event_date,
      eventTime: event?.event_time,
      settings,
    });
    const computedEnd = parseLocalDateTime(computedSlot?.slot_end_datetime);
    if (computedEnd) return computedEnd;

    return null;
  };

  const copyLink = () => {
    if (!qrUrl) return;
    navigator.clipboard.writeText(qrUrl);
    toast.info(t("QR link copied!"));
  };

  const buildQrDownloadDataUrl = async (value, size = QR_EXPORT_SIZE) => {
    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) throw new Error("QR code not ready yet");
    return QRCode.toDataURL(trimmedValue, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: size,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  };

  const triggerDownload = (href, filename) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadQR = async () => {
    if (!qrUrl) return;
    try {
      const dataUrl = await buildQrDownloadDataUrl(qrUrl);
      triggerDownload(dataUrl, "qr-menu.png");
    } catch (err) {
      console.error("❌ Failed to download QR:", err);
      toast.error(t("QR code not ready yet"));
    }
  };

  const shareQR = async () => {
    if (!qrUrl) return;
    try {
      const dataUrl = await buildQrDownloadDataUrl(qrUrl, 1024);
      const file = new File([await dataUrlToBlob(dataUrl)], "qr-menu.png", {
        type: "image/png",
      });

      if (navigator.share) {
        const sharePayload = {
          title: t("QR Menu"),
          text: qrUrl,
          url: qrUrl,
        };

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            ...sharePayload,
            files: [file],
          });
        } else {
          await navigator.share(sharePayload);
        }
        return;
      }

      await navigator.clipboard.writeText(qrUrl);
      toast.info(t("Sharing is not supported on this device. Link copied instead."));
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error("❌ Failed to share QR:", err);
      try {
        await navigator.clipboard.writeText(qrUrl);
        toast.info(t("Sharing is not supported on this device. Link copied instead."));
      } catch {
        toast.error(t("Failed to share QR"));
      }
    }
  };

  const printQR = async () => {
    if (!qrUrl) return;

    try {
      const imgSrc = await buildQrDownloadDataUrl(qrUrl, 1200);
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`
        <html><head><title>${t("Print QR Code")}</title></head>
        <body style="text-align:center;font-family:sans-serif">
          <img src="${imgSrc}" style="margin-top:30px;width:260px;height:260px;image-rendering:pixelated;" />
          <div style="margin-top:10px;font-size:16px">${qrUrl}</div>
          <script>window.onload=()=>window.print()</script>
        </body></html>
      `);
      win.document.close();
    } catch (err) {
      console.error("❌ Failed to print QR:", err);
      toast.error(t("QR code not ready yet"));
    }
  };

  const filteredProducts = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );
  const concertAreaOptions = Array.from(
    new Set([
      ...concertAreas,
      ...tables.map((tbl) => String(tbl?.area || "").trim()).filter(Boolean),
    ])
  );

  const loadTableQr = async (number) => {
    setTableQr((prev) => ({
      ...prev,
      [number]: { ...(prev[number] || {}), loading: true },
    }));
    try {
      const res = await secureFetch(`/tables/${number}/qr-token`);
      if (res?.url) {
        setTableQr((prev) => ({
          ...prev,
          [number]: { ...prev[number], url: normalizePublicRestaurantUrl(res.url), loading: false },
        }));
      } else {
        setTableQr((prev) => ({
          ...prev,
          [number]: { ...(prev[number] || {}), loading: false },
        }));
        toast.error(t("Failed to generate table QR link"));
      }
    } catch (err) {
      console.error("❌ Failed to generate table QR:", err);
      setTableQr((prev) => ({
        ...prev,
        [number]: { ...(prev[number] || {}), loading: false },
      }));
      toast.error(t("Failed to generate table QR link"));
    }
  };

  const copyTableQr = (number) => {
    const url = tableQr[number]?.url;
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.info(t("QR link copied!"));
  };

  const printTableQr = (number, canvasId) => {
    const url = tableQr[number]?.url;
    if (!url) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const png = canvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>${t("Print QR Code")}</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <img src="${png}" style="margin-top:30px;width:260px;height:260px;" />
        <div style="margin-top:10px;font-size:16px">${url}</div>
        <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  useEffect(() => {
    let active = true;
    const identifier = extractIdentifierFromQrUrl(qrUrl);

    const loadShopHours = async ({ withSpinner = false, showToastOnError = false } = {}) => {
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
          data = await secureFetch("/settings/shop-hours/all");
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
        setShopHoursDirty(false);
        setShopHoursSaveStatus("idle");
      } catch (err) {
        console.error("❌ Failed to load shop hours:", err);
        if (showToastOnError) {
          toast.error(t("Failed to load settings"));
        }
      } finally {
        if (withSpinner && active) setLoadingShopHours(false);
      }
    };

    loadShopHours({ withSpinner: true, showToastOnError: true });

    const pollId = window.setInterval(() => {
      loadShopHours({ withSpinner: false, showToastOnError: false });
    }, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadShopHours({ withSpinner: false, showToastOnError: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [qrUrl, t]);

  const handleShopHoursChange = (day, field, value) => {
    setShopHours((prev) => ({
      ...prev,
      [day]: {
        ...(prev[day] || {}),
        [field]: value,
        enabled: true,
      },
    }));
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleShopHoursDayToggle = (day) => {
    setShopHours((prev) => {
      const current = prev[day] || { open: "", close: "", enabled: false };
      const nextEnabled = !(current.enabled !== false);
      return {
        ...prev,
        [day]: {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        },
      };
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleMainShopToggle = () => {
    setShopHours((prev) => {
      const currentlyOpen = days.some((day) => prev[day]?.enabled !== false);
      const nextEnabled = !currentlyOpen;
      const updated = { ...prev };
      days.forEach((day) => {
        const current = updated[day] || { open: "", close: "", enabled: false };
        updated[day] = {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        };
      });
      return updated;
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const shopEnabled = days.some((day) => shopHours[day]?.enabled !== false);

  const saveShopHours = async ({ showToast = false } = {}) => {
    if (savingShopHours) return;
    setSavingShopHours(true);
    setShopHoursSaveStatus("saving");
    try {
      const payloadHours = {};
      for (const day of days) {
        const current = shopHours[day] || {};
        const enabled = current.enabled !== false;
        payloadHours[day] = {
          open: enabled ? current.open || "09:00" : null,
          close: enabled ? current.close || "22:00" : null,
        };
      }
      await secureFetch("/settings/shop-hours/all", {
        method: "POST",
        body: JSON.stringify({ hours: payloadHours }),
      });
      try {
        window.dispatchEvent(new Event("qr:shop-hours-updated"));
        localStorage.setItem("qr_shop_hours_updated_at", String(Date.now()));
      } catch {}
      setShopHoursDirty(false);
      setShopHoursSaveStatus("saved");
      if (showToast) {
        toast.success(t("✅ Shop hours saved successfully!"));
      }
    } catch (err) {
      console.error("❌ Save failed:", err);
      setShopHoursSaveStatus("error");
      toast.error(t("Save failed"));
    } finally {
      setSavingShopHours(false);
    }
  };

  useEffect(() => {
    if (loadingShopHours || savingShopHours || !shopHoursDirty) return;
    const timer = window.setTimeout(() => {
      saveShopHours({ showToast: false });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [loadingShopHours, savingShopHours, shopHoursDirty, shopHours]);

  const todayName = (() => {
    const map = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return map[new Date().getDay()];
  })();

  const parseTimeToMinutes = (value) => {
    const s = String(value || "").trim();
    if (!s) return null;
    const [hh, mm] = s.split(":").map((part) => Number(part));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };

  const openStatus = (() => {
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
  })();

  useEffect(() => {
    const onDown = (e) => {
      const shopHoursEl = shopHoursDropdownRef.current;
      if (shopHoursEl && !shopHoursEl.contains(e.target)) {
        setShowShopHoursDropdown(false);
      }

      const reservationGuestCompositionEl =
        reservationGuestCompositionTablesDropdownRef.current;
      if (
        reservationGuestCompositionEl &&
        !reservationGuestCompositionEl.contains(e.target)
      ) {
        setShowReservationGuestCompositionTablesDropdown(false);
      }

      const guestCompositionEl = guestCompositionTablesDropdownRef.current;
      if (guestCompositionEl && !guestCompositionEl.contains(e.target)) {
        setShowGuestCompositionTablesDropdown(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const touched = [];
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

    upsertLink(
      'link[rel="apple-touch-icon"][sizes="180x180"]',
      { rel: "apple-touch-icon", sizes: "180x180" },
      iosPwaIconHref
    );
    upsertLink(
      'link[rel="apple-touch-icon"][sizes="167x167"]',
      { rel: "apple-touch-icon", sizes: "167x167" },
      iosPwaIconHref
    );
    upsertLink(
      'link[rel="apple-touch-icon"][sizes="152x152"]',
      { rel: "apple-touch-icon", sizes: "152x152" },
      iosPwaIconHref
    );
    upsertLink('link[rel="apple-touch-icon"]', { rel: "apple-touch-icon" }, iosPwaIconHref);
    upsertLink(
      'link[rel="icon"][type="image/png"][sizes="192x192"]',
      { rel: "icon", type: "image/png", sizes: "192x192" },
      iosPwaIconHref
    );
    upsertMeta(
      'meta[name="apple-mobile-web-app-title"]',
      { name: "apple-mobile-web-app-title" },
      iosPwaTitle
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
  }, [iosPwaIconHref, iosPwaTitle]);

  return (
  <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-6 flex items-center justify-center gap-2 max-w-full overflow-x-auto scrollbar-hide whitespace-nowrap rounded-2xl border border-slate-200/60 bg-slate-50/70 p-1 backdrop-blur dark:border-slate-700/60 dark:bg-zinc-800/30">
      {settingsTabs.map((tab) => {
        const isActive = activeSettingsTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveSettingsTab(tab.id);
            }}
            className={[
              "shrink-0 w-24 sm:w-28 truncate",
              "inline-flex items-center justify-center gap-2",
              "rounded-xl border border-slate-300/60 dark:border-slate-700/60 px-3 py-2 text-[12px] md:text-[13px] lg:text-sm font-semibold",
              "shadow-md transition-all duration-150 hover:shadow-lg active:scale-[0.98]",
              "focus:outline-none focus:ring-2 focus:ring-indigo-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-zinc-900",
              isActive
                ? "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 text-white"
                : "bg-white/80 text-slate-800 hover:bg-white dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/70",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
    {activeSettingsTab === "qr" && (
      <>
    {/* Shop Hours */}
    <div className="mb-10 bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 overflow-hidden">
      <div className="p-5 border-b border-blue-100 dark:border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
            {t("Customize Shop Hours")}
          </h2>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span
              className={`text-sm font-bold ${
                shopEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {shopEnabled ? t("Shop Open") : t("Shop Closed")}
            </span>
            <span className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={shopEnabled}
                onChange={handleMainShopToggle}
                className="sr-only peer"
              />
              <span className="w-11 h-6 bg-gray-300 peer-checked:bg-emerald-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </span>
          </label>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t("Set opening and closing times for each day.")}
        </p>
      </div>

      <div className="p-5">
        {loadingShopHours ? (
          <div className="text-slate-500 dark:text-slate-400">{t("Loading...")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {days.map((day) => {
              const enabled = shopHours[day]?.enabled !== false;
              return (
                <div
                  key={day}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-zinc-900/60 dark:to-zinc-950/40 p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {t(day)}
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => handleShopHoursDayToggle(day)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className={enabled ? "" : "opacity-50"}>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {t("Open Time")}
                    </label>
                    <input
                      type="time"
                      value={shopHours[day]?.open || ""}
                      disabled={!enabled}
                      onChange={(e) => handleShopHoursChange(day, "open", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition disabled:cursor-not-allowed"
                    />
                    <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {t("Close Time")}
                    </label>
                    <input
                      type="time"
                      value={shopHours[day]?.close || ""}
                      disabled={!enabled}
                      onChange={(e) => handleShopHoursChange(day, "close", e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {shopHoursSaveStatus === "saving"
              ? t("Saving...")
              : shopHoursSaveStatus === "saved"
              ? t("Saved")
              : shopHoursSaveStatus === "error"
              ? t("Save failed")
              : t("Auto-save enabled")}
          </div>
        </div>
      </div>
    </div>

    {/* Products list */}
    <div className="bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 overflow-hidden">
      <div className="flex items-center gap-3 p-4 border-b border-blue-100 dark:border-zinc-800">
        <Search className="w-5 h-5 text-blue-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search products...")}
          className="flex-1 px-4 py-2 rounded-xl border-2 border-blue-100 bg-white dark:bg-zinc-900 text-base focus:ring-2 focus:ring-blue-300 transition"
        />
      </div>

      <div className="max-h-[440px] overflow-y-auto p-4">
        <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-transparent bg-clip-text">
          {t("Products visible in QR Menu")}
        </h2>

        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-lg">
            {t("No products found.")}
          </div>
        ) : (
          <ul className="divide-y divide-blue-50 dark:divide-zinc-900">
	            {filteredProducts.map((p) => (
	              <li key={p.id} className="flex items-center justify-between py-2 px-1">
	                <span
	                  className={`flex items-center gap-2 font-medium ${
	                    disabledIds.includes(p.id)
	                      ? "line-through text-gray-400"
	                      : "text-blue-900 dark:text-blue-100"
	                  }`}
	                >
                  <img
                    src={
                      p.image
                        ? p.image.startsWith("http")
                          ? p.image
                          : `${window.location.origin.replace(":5173", ":5000")}/uploads/${p.image}`
                        : "/Productsfallback.jpg"
                    }
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/Productsfallback.jpg";
                    }}
                    alt={p.name}
                    className="w-7 h-7 rounded-lg object-cover border"
                    loading="lazy"
                  />
	                  {p.name}
	                </span>

	                <div className="ml-4 flex items-center gap-2">
	                  <button
	                    type="button"
	                    onClick={() => deleteProduct(p)}
	                    disabled={deletingProductId === p.id}
	                    className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-60 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"
	                    title={t("Delete")}
	                  >
	                    <Trash2 className="w-4 h-4" />
	                  </button>

	                  <button
	                    type="button"
	                    className={`w-14 h-8 rounded-full flex items-center px-1 transition-all ${
	                      disabledIds.includes(p.id)
	                        ? "bg-gray-300"
	                        : "bg-gradient-to-r from-blue-400 to-indigo-500 shadow-lg"
	                    }`}
	                    onClick={() => toggleDisable(p.id)}
	                  >
	                    <span
	                      className={`w-6 h-6 rounded-full bg-white shadow transition-all flex items-center justify-center ${
	                        disabledIds.includes(p.id) ? "translate-x-6" : "translate-x-0"
	                      }`}
	                    >
	                      {disabledIds.includes(p.id) ? (
	                        <EyeOff className="w-4 h-4 text-gray-400" />
	                      ) : (
	                        <Eye className="w-4 h-4 text-blue-500" />
	                      )}
	                    </span>
	                  </button>
	                </div>
	              </li>
	            ))}
	          </ul>
	        )}
	      </div>
      </div>

        {/* QUICK SETUP */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
            <h3 className="text-xl font-bold mb-3 text-indigo-600">
              {t("Tables")}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {t("Set the total number of tables for QR codes.")}
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                className="w-32 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={saveTableCount}
                disabled={savingTableCount}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
              >
                {savingTableCount ? t("Please wait...") : t("Save")}
              </button>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
            <h3 className="text-xl font-bold mb-3 text-indigo-600">
              {t("Add Product")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={newProduct.name}
                onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                placeholder={t("Product Name")}
                className="p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newProduct.price}
                onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                placeholder={t("Price")}
                className="p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
              <input
                value={newProduct.category}
                onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))}
                placeholder={t("Category")}
                className="p-3 rounded-xl border bg-white dark:bg-zinc-900 sm:col-span-2"
              />

              <div className="sm:col-span-2">
                <label className="font-semibold block mb-2">{t("Category Image")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={categoryImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setCategoryImageFileName(file?.name || "");
                      if (!file) return;
                      await uploadCategoryImage(file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => categoryImageInputRef.current?.click()}
                    disabled={uploadingCategoryImage}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingCategoryImage ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {categoryImageFileName ? categoryImageFileName : t("No file chosen")}
                  </span>
                </div>
                {categoryImagePreview ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={categoryImagePreview}
                      alt={t("Category")}
                      className="w-16 h-16 rounded-xl object-cover border bg-white"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-300">
                      {t("Category Preview")}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold block mb-2">{t("Product Image")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={productImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      if (!file) return;
                      setNewProductImageFile(file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => productImageInputRef.current?.click()}
                    disabled={uploadingNewProductImage}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingNewProductImage ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {newProductImageFile?.name ? newProductImageFile.name : t("No file chosen")}
                  </span>
                </div>
                {newProductImagePreview ? (
                  <img
                    src={newProductImagePreview}
                    alt={t("Product Image")}
                    className="mt-2 w-24 h-24 rounded-xl object-cover border bg-white"
                  />
                ) : null}
              </div>

              <textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
                placeholder={t("Description")}
                className="p-3 rounded-xl border bg-white dark:bg-zinc-900 sm:col-span-2"
                rows={3}
              />
            </div>
            <button
              type="button"
              onClick={saveNewProduct}
              disabled={savingProduct || uploadingNewProductImage || uploadingCategoryImage}
              className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {savingProduct ? t("Please wait...") : t("Save")}
            </button>
          </div>
        </div>
      </>
    )}

    {(activeSettingsTab === "app" || activeSettingsTab === "concert" || activeSettingsTab === "controls" || activeSettingsTab === "generate-qr" || activeSettingsTab === "floor-plan") && (
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
        {activeSettingsTab === "generate-qr" && (
          <div className="space-y-10">
            <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-white/80 via-blue-50 to-indigo-100 p-7 shadow-2xl dark:border-zinc-700 dark:from-zinc-900/80 dark:via-blue-950/80 dark:to-indigo-950/80">
              <div className="flex flex-col items-center gap-8 md:flex-row">
                <div
                  ref={qrRef}
                  className="flex flex-col items-center rounded-2xl border border-blue-100 bg-white p-4 shadow-xl dark:border-blue-800 dark:bg-zinc-950"
                >
                  {loadingLink ? (
                    <div className="flex h-[180px] w-[180px] items-center justify-center text-gray-400">
                      {t("Generating QR...")}
                    </div>
                  ) : (
                    <QRCodeCanvas id="qrCanvas" value={qrUrl || ""} size={180} />
                  )}
                  <div className="mt-3 flex w-full items-center justify-center" ref={shopHoursDropdownRef}>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowShopHoursDropdown((v) => !v)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold shadow-sm transition ${
                          openStatus.isOpen
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                        title={t("Shop Hours")}
                      >
                        <span>{openStatus.label}</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${showShopHoursDropdown ? "rotate-180" : ""}`}
                        />
                      </button>

                      {showShopHoursDropdown && (
                        <div className="absolute left-1/2 top-[calc(100%+10px)] z-10 w-[320px] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-800 dark:bg-zinc-950">
                          <div className="flex items-center justify-between gap-2 px-1 pb-2">
                            <div className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                              {t("Shop Hours")}
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowShopHoursDropdown(false)}
                              className="text-lg leading-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
                                      ? "border border-indigo-100 bg-indigo-50 text-indigo-800 dark:border-indigo-900/30 dark:bg-indigo-950/30 dark:text-indigo-200"
                                      : "bg-slate-50 text-slate-700 dark:bg-zinc-900/40 dark:text-slate-200"
                                  }`}
                                >
                                  <span className="font-semibold">{t(day)}</span>
                                  <span className="font-mono text-xs">
                                    {has ? `${open} - ${close}` : "—"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 max-w-xs break-all text-center font-mono text-xs text-gray-500">
                    {qrUrl || t("QR link not available yet")}
                  </div>
                </div>

                <div className="flex w-full max-w-[320px] flex-col gap-3">
                  <button
                    onClick={copyLink}
                    disabled={!qrUrl}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
                  >
                    <Copy className="w-4 h-4" /> {t("Copy Link")}
                  </button>

                  <button
                    onClick={() => {
                      if (!qrUrl) return;
                      window.open(qrUrl, "_blank", "noopener,noreferrer");
                    }}
                    disabled={!qrUrl}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
                  >
                    <Eye className="w-4 h-4" /> {t("Navigate")}
                  </button>

                  <button
                    onClick={downloadQR}
                    disabled={!qrUrl}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" /> {t("Download QR")}
                  </button>

                  <button
                    onClick={shareQR}
                    disabled={!qrUrl}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
                  >
                    <Share2 className="w-4 h-4" /> {t("Share QR")}
                  </button>

                  <button
                    onClick={printQR}
                    disabled={!qrUrl}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-400 to-gray-700 px-6 py-3 font-bold text-white shadow-lg transition hover:scale-105 disabled:opacity-50"
                  >
                    <Printer className="w-4 h-4" /> {t("Print QR")}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <h3 className="text-xl font-bold mb-3 text-indigo-600">
                {t("Table QR Codes")}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                {t("Generate QR codes that open the menu directly for a specific table.")}
              </p>
              {tables.length === 0 ? (
                <div className="text-gray-400 text-sm">
                  {t("No tables configured yet. Go to the Tables page to add tables.")}
                </div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto pr-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tables.map((tbl) => {
                      const n = tbl.number || tbl.tableNumber;
                      const key = String(n);
                      const info = tableQr[key] || {};
                      const canvasId = `table-qr-${key}`;
                      return (
                        <div
                          key={key}
                          className="flex gap-4 rounded-2xl border border-blue-100 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <div className="flex w-[122px] shrink-0 flex-col items-center">
                            {info.url ? (
                              <QRCodeCanvas
                                id={canvasId}
                                value={info.url}
                                size={110}
                              />
                            ) : (
                              <div className="w-[110px] h-[110px] flex items-center justify-center text-xs text-gray-400 border border-dashed rounded-xl">
                                {t("No QR yet")}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => (info.url ? printTableQr(key, canvasId) : loadTableQr(key))}
                              className="mt-3 rounded-full px-4 py-2 text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition disabled:opacity-60"
                              disabled={info.loading}
                            >
                              {info.loading
                                ? t("Please wait...")
                                : info.url
                                ? t("Print")
                                : t("Generate QR")}
                            </button>
                          </div>
                          <div className="flex-1 pt-2 min-w-0">
                            <div className="font-semibold text-sm">
                              {t("Table")} {n}
                              {tbl.label ? ` – ${tbl.label}` : ""}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 break-all">
                              {info.url || t("QR link will appear here")}
                            </div>
                            {info.url && (
                              <button
                                type="button"
                                onClick={() => copyTableQr(key)}
                                className="mt-2 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800"
                              >
                                {t("Copy link")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSettingsTab === "app" && (
          <h2 className="text-xl font-extrabold mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
            {t("Menu Website Builder")}
          </h2>
        )}

        {activeSettingsTab === "floor-plan" && (
          <div className="rounded-[32px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t("Floor Plan Designer")}
                </h3>
                <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
                  {t("Design the visual reservation layout used by guests when choosing tables. Drag tables into place, add venue markers, and save the exact plan used on mobile booking pages.")}
                </p>
              </div>
              <button
                type="button"
                onClick={saveFloorPlanLayout}
                disabled={savingFloorPlanLayout}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingFloorPlanLayout ? t("Please wait...") : t("Save Floor Plan")}
              </button>
            </div>

            <div className="mt-5">
              <FloorPlanDesigner
                title={t("Venue Layout")}
                description={t("Linked tables stay connected to real reservation tables, so capacities and restrictions stay in sync.")}
                value={effectiveVenueFloorPlan}
                tables={tables}
                onChange={(layout) => updateField("qr_floor_plan_layout", normalizeFloorPlanLayout(layout))}
              />
            </div>
          </div>
        )}

        {activeSettingsTab === "controls" && (
          <div className="space-y-8">
            <div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {t("Order Settings")}
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Delivery Ordering")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.delivery_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.delivery_enabled ? t("Delivery is open") : t("Delivery is closed")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleDelivery}
                    disabled={savingDelivery}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.delivery_enabled ? t("Close Delivery") : t("Open Delivery")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("Toggle whether delivery/online ordering appears in the QR menu order picker.")}
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <label className="block text-base font-bold text-slate-900 dark:text-slate-100">
                      {t("Delivery Coverage")}
                    </label>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t("Set which cities can order and the max delivery distance in km.")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={saveDeliveryCoverage}
                    disabled={savingDeliveryCoverage}
                    className="rounded-xl border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-500/10"
                  >
                    {savingDeliveryCoverage ? t("Saving...") : t("Save Delivery Coverage")}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("Delivery Area (Cities)")}
                    </label>
                    <textarea
                      rows={3}
                      value={deliveryZoneCitiesInput}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setDeliveryZoneCitiesInput(nextValue);
                        updateField("delivery_zone_cities", normalizeDeliveryZoneCitiesInput(nextValue));
                      }}
                      placeholder={t("Example: Istanbul, Izmir, Ankara")}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("Delivery Range (km)")}
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      max={100}
                      step={0.5}
                      value={settings.delivery_range_km}
                      onChange={(event) => updateField("delivery_range_km", event.target.value)}
                      onBlur={() =>
                        updateField(
                          "delivery_range_km",
                          normalizeDeliveryRangeKmInput(settings.delivery_range_km, 5)
                        )
                      }
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {t("Delivery Origin")}
                    </label>
                    <input
                      type="text"
                      value={settings.delivery_origin_location}
                      onChange={(event) => updateField("delivery_origin_location", event.target.value)}
                      placeholder={t("Restaurant address")}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {t("Detected restaurant location from backend")}:{" "}
                  {restaurantDeliveryProfile.location || t("Not available yet")}
                </p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Reservation Modal Pickup")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.reservation_pickup_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.reservation_pickup_enabled ? t("Pickup is open") : t("Pickup is closed")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleReservationPickup}
                    disabled={savingReservationPickup}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.reservation_pickup_enabled ? t("Close Pickup") : t("Open Pickup")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("Toggle pickup option inside the reservation modal (Pickup / Reservation).")}
                </p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Dine in")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.table_order_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.table_order_enabled ? t("Dine in is open") : t("Dine in is closed")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleTableOrder}
                    disabled={savingTableOrder}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.table_order_enabled ? t("Close Dine in") : t("Open Dine in")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("Toggle whether dine in appears in QR menu order type options.")}
                </p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Table QR Scan")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.table_qr_scan_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.table_qr_scan_enabled
                      ? t("Table QR scan is enabled")
                      : t("Table QR scan is disabled")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleTableQrScan}
                    disabled={savingTableQrScan}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.table_qr_scan_enabled
                      ? t("Disable Table QR Scan")
                      : t("Enable Table QR Scan")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("When disabled, guests select a table and guest count and start shopping immediately without scanning the table QR.")}
                </p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Reservation Header Tab")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.reservation_tab_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.reservation_tab_enabled ? t("Reservation tab is open") : t("Reservation tab is closed")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleReservationTab}
                    disabled={savingReservationTab}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.reservation_tab_enabled ? t("Close Reservation Tab") : t("Open Reservation Tab")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("This only controls the Reservation tab in the QR header. Concert reservations stay active.")}
                </p>
              </div>

              <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t("Guest composition rules")}
                </h4>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("Configure whether concert table reservations must include a guest composition split and how it should be validated.")}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="font-semibold">{t("Enable guest composition field")}</label>
                    <select
                      value={settings.reservation_guest_composition_enabled ? "on" : "off"}
                      onChange={(e) =>
                        updateReservationGuestCompositionEnabled(e.target.value === "on")
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    >
                      <option value="off">{t("Off")}</option>
                      <option value="on">{t("On")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold">{t("Field mode")}</label>
                    <select
                      value={settings.reservation_guest_composition_field_mode || "optional"}
                      onChange={(e) =>
                        updateReservationGuestCompositionField(
                          "reservation_guest_composition_field_mode",
                          e.target.value
                        )
                      }
                      disabled={!settings.reservation_guest_composition_enabled}
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 disabled:opacity-60"
                    >
                      {CONCERT_GUEST_COMPOSITION_FIELD_MODES.map((option) => (
                        <option key={`reservation-${option.value}`} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-semibold">{t("Restriction rule")}</label>
                    <select
                      value={
                        settings.reservation_guest_composition_restriction_rule ||
                        "no_restriction"
                      }
                      onChange={(e) =>
                        updateReservationGuestCompositionField(
                          "reservation_guest_composition_restriction_rule",
                          e.target.value
                        )
                      }
                      disabled={!settings.reservation_guest_composition_enabled}
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 disabled:opacity-60"
                    >
                      {CONCERT_GUEST_COMPOSITION_RESTRICTION_RULES.map((option) => (
                        <option key={`reservation-rule-${option.value}`} value={option.value}>
                          {t(option.label)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-semibold">{t("Validation message")}</label>
                    <textarea
                      rows={3}
                      value={settings.reservation_guest_composition_validation_message || ""}
                      onChange={(e) =>
                        updateReservationGuestCompositionField(
                          "reservation_guest_composition_validation_message",
                          e.target.value
                        )
                      }
                      disabled={!settings.reservation_guest_composition_enabled}
                      placeholder={t(
                        "This policy does not allow reservations for male-only groups."
                      )}
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none disabled:opacity-60"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-semibold">{t("Disable for specific tables")}</label>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {t(
                        "Selected tables will skip guest composition requirements even when the field is enabled."
                      )}
                    </p>
                    <div className="mt-3" ref={reservationGuestCompositionTablesDropdownRef}>
                      {tables.length > 0 ? (
                        <>
                          <button
                            type="button"
                            disabled={!settings.reservation_guest_composition_enabled}
                            onClick={() =>
                              setShowReservationGuestCompositionTablesDropdown((prev) => !prev)
                            }
                            className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm transition hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span>
                              {(settings.reservation_guest_composition_disabled_tables || []).length > 0
                                ? t("{{count}} table(s) excluded", {
                                    count:
                                      (
                                        settings.reservation_guest_composition_disabled_tables || []
                                      ).length,
                                  })
                                : t("Select tables")}
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                showReservationGuestCompositionTablesDropdown
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                          </button>

                          {showReservationGuestCompositionTablesDropdown && (
                            <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                              {tables.map((tbl) => {
                                const tableNumber = Number(tbl?.table_number ?? tbl?.number);
                                if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;
                                const isSelected = (
                                  settings.reservation_guest_composition_disabled_tables || []
                                ).includes(tableNumber);
                                return (
                                  <label
                                    key={`reservation-guest-comp-table-${tableNumber}`}
                                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-zinc-900"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={!settings.reservation_guest_composition_enabled}
                                      onChange={() => {
                                        const current = normalizeTableNumberList(
                                          settings.reservation_guest_composition_disabled_tables
                                        );
                                        const next = current.includes(tableNumber)
                                          ? current.filter((value) => value !== tableNumber)
                                          : [...current, tableNumber];
                                        updateReservationGuestCompositionField(
                                          "reservation_guest_composition_disabled_tables",
                                          normalizeTableNumberList(next)
                                        );
                                      }}
                                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="font-medium">
                                      {t("Table")} {tableNumber}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {(settings.reservation_guest_composition_disabled_tables || []).length >
                            0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {normalizeTableNumberList(
                                settings.reservation_guest_composition_disabled_tables
                              ).map((tableNumber) => (
                                <span
                                  key={`reservation-guest-comp-selected-${tableNumber}`}
                                  className="rounded-full border border-amber-500 bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:border-amber-400 dark:bg-amber-500/20 dark:text-amber-100"
                                >
                                  {t("Table")} {tableNumber}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                          {t("No tables configured yet. Go to the Tables page to add tables.")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={saveReservationGuestCompositionSettings}
                    disabled={savingReservationGuestComposition}
                    className="rounded-full border border-indigo-500 px-6 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {savingReservationGuestComposition
                      ? t("Saving...")
                      : t("Save Guest Composition Rules")}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t("Booking Settings")}
                </h4>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {t("Configure slot duration, time intervals, event entry rules, and reservation timing behavior for QR bookings.")}
                </p>

                <div className="mt-5 space-y-5">
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h5 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {t("Reservation Timing Rules")}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {t("Control reservation duration, buffers, and arrival windows.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            "reservation_booking_settings_enabled",
                            !settings.reservation_booking_settings_enabled
                          )
                        }
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          settings.reservation_booking_settings_enabled
                            ? "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200"
                        }`}
                      >
                        {settings.reservation_booking_settings_enabled ? t("On") : t("Off")}
                      </button>
                    </div>

                    <div
                      className={`mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 ${
                        settings.reservation_booking_settings_enabled ? "" : "pointer-events-none opacity-50"
                      }`}
                    >
                      <div>
                    <label className="font-semibold">{t("Default reservation duration (minutes)")}</label>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={settings.reservation_default_duration_minutes ?? 120}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField("reservation_default_duration_minutes", Number(e.target.value) || 0)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Buffer time between reservations (minutes)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.reservation_buffer_minutes ?? 0}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField("reservation_buffer_minutes", Number(e.target.value) || 0)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Maximum reservations per table per day (optional)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={settings.reservation_max_per_table_per_day ?? ""}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField(
                          "reservation_max_per_table_per_day",
                          e.target.value === "" ? "" : Number(e.target.value) || 0
                        )
                      }
                      placeholder={t("Unlimited")}
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Allow booking while table is occupied now")}</label>
                    <select
                      disabled={!settings.reservation_booking_settings_enabled}
                      value={settings.reservation_allow_while_occupied_now ? "on" : "off"}
                      onChange={(e) =>
                        updateField("reservation_allow_while_occupied_now", e.target.value === "on")
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    >
                      <option value="off">{t("Off")}</option>
                      <option value="on">{t("On")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold">{t("Early check-in window (minutes before slot)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.reservation_early_checkin_window_minutes ?? 15}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField(
                          "reservation_early_checkin_window_minutes",
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Late arrival grace period (minutes)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.reservation_late_arrival_grace_minutes ?? 15}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField(
                          "reservation_late_arrival_grace_minutes",
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Auto cancel no-show after X minutes")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.reservation_auto_cancel_no_show_after_minutes ?? 0}
                      disabled={!settings.reservation_booking_settings_enabled}
                      onChange={(e) =>
                        updateField(
                          "reservation_auto_cancel_no_show_after_minutes",
                          Number(e.target.value) || 0
                        )
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h5 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {t("Booking Slot Rules")}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {t("Control booking intervals and how far ahead guests can book.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            "booking_slot_settings_enabled",
                            !settings.booking_slot_settings_enabled
                          )
                        }
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          settings.booking_slot_settings_enabled
                            ? "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200"
                        }`}
                      >
                        {settings.booking_slot_settings_enabled ? t("On") : t("Off")}
                      </button>
                    </div>

                    <div
                      className={`mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 ${
                        settings.booking_slot_settings_enabled ? "" : "pointer-events-none opacity-50"
                      }`}
                    >
                      <div>
                    <label className="font-semibold">{t("Time interval step (minutes)")}</label>
                    <select
                      disabled={!settings.booking_slot_settings_enabled}
                      value={String(settings.booking_time_interval_minutes ?? 30)}
                      onChange={(e) =>
                        updateField("booking_time_interval_minutes", Number(e.target.value) || 30)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    >
                      {[5, 10, 15, 20, 30, 45, 60].map((step) => (
                        <option key={`booking-step-${step}`} value={String(step)}>
                          {step}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold">{t("Max booking days in advance")}</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={settings.booking_max_days_in_advance ?? 30}
                      disabled={!settings.booking_slot_settings_enabled}
                      onChange={(e) =>
                        updateField("booking_max_days_in_advance", Number(e.target.value) || 1)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h5 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {t("Concert Entry Rules")}
                        </h5>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {t("Control concert duration, entry windows, and re-entry behavior.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateField(
                            "concert_booking_settings_enabled",
                            !settings.concert_booking_settings_enabled
                          )
                        }
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                          settings.concert_booking_settings_enabled
                            ? "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "border-rose-200 bg-rose-100 text-rose-700 hover:bg-rose-200"
                        }`}
                      >
                        {settings.concert_booking_settings_enabled ? t("On") : t("Off")}
                      </button>
                    </div>

                    <div
                      className={`mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 ${
                        settings.concert_booking_settings_enabled ? "" : "pointer-events-none opacity-50"
                      }`}
                    >
                      <div>
                    <label className="font-semibold">{t("Event duration (minutes)")}</label>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={settings.concert_event_duration_minutes ?? 150}
                      disabled={!settings.concert_booking_settings_enabled}
                      onChange={(e) =>
                        updateField("concert_event_duration_minutes", Number(e.target.value) || 0)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Event end time (optional)")}</label>
                    <input
                      type="time"
                      value={settings.concert_event_end_time || ""}
                      disabled={!settings.concert_booking_settings_enabled}
                      onChange={(e) => updateField("concert_event_end_time", e.target.value)}
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Early entry window (minutes before start)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.concert_early_entry_window_minutes ?? 30}
                      disabled={!settings.concert_booking_settings_enabled}
                      onChange={(e) =>
                        updateField("concert_early_entry_window_minutes", Number(e.target.value) || 0)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Late entry cutoff (minutes after start)")}</label>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={settings.concert_late_entry_cutoff_minutes ?? 30}
                      disabled={!settings.concert_booking_settings_enabled}
                      onChange={(e) =>
                        updateField("concert_late_entry_cutoff_minutes", Number(e.target.value) || 0)
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold">{t("Allow re-entry")}</label>
                    <select
                      disabled={!settings.concert_booking_settings_enabled}
                      value={settings.concert_allow_reentry ? "on" : "off"}
                      onChange={(e) =>
                        updateField("concert_allow_reentry", e.target.value === "on")
                      }
                      className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                    >
                      <option value="off">{t("Off")}</option>
                      <option value="on">{t("On")}</option>
                    </select>
                  </div>
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                    {t("Opening hours are taken from the existing Shop Hours settings and used to build QR booking time slots.")}
                  </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={saveBookingSettings}
                    disabled={savingBookingSettings}
                    className="rounded-full border border-indigo-500 px-6 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {savingBookingSettings ? t("Saving...") : t("Save Booking Settings")}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("All Product Visibility")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.disable_all_products
                        ? "border border-rose-200 bg-rose-100 text-rose-700"
                        : "border border-emerald-200 bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {settings.disable_all_products ? t("All products are hidden") : t("All products are visible")}
                  </span>
                  <button
                    type="button"
                    onClick={toggleDisableAllProducts}
                    disabled={savingDisableAllProducts}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    {settings.disable_all_products ? t("Enable All Products") : t("Disable All Products")}
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("When enabled, categories and products are hidden on QR home and in all QR menu product lists.")}
                </p>
              </div>

              <div>
                <label className="block text-[18px] font-bold text-slate-900 dark:text-slate-100">{t("Table Order Location Check")}</label>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-medium ${
                      settings.table_geo_enabled
                        ? "border border-emerald-200 bg-emerald-100 text-emerald-800"
                        : "border border-rose-200 bg-rose-100 text-rose-700"
                    }`}
                  >
                    {settings.table_geo_enabled ? t("Location check enabled") : t("Location check disabled")}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateField("table_geo_enabled", !settings.table_geo_enabled)}
                    className="rounded-full border border-blue-500 px-6 py-2.5 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                  >
                    {settings.table_geo_enabled ? t("Disable Location Check") : t("Enable Location Check")}
                  </button>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="25"
                      max="1000"
                      step="5"
                      value={settings.table_geo_radius_meters ?? 150}
                      onChange={(e) =>
                        updateField("table_geo_radius_meters", Number(e.target.value) || 0)
                      }
                      className="w-24 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{t("meters")}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  {t("Require table orders to be within this distance of the restaurant.")}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === "app" && (
          <>
        {/* Main Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="font-semibold">{t("Main Title")}</label>
            <input
              type="text"
              value={settings.main_title}
              onChange={(e) => updateField("main_title", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Subtitle")}</label>
            <input
              type="text"
              value={settings.subtitle}
              onChange={(e) => updateField("subtitle", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Tagline (small)")}</label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Phone Number")}</label>
            <input
              type="text"
              value={settings.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div className="md:col-span-2 rounded-2xl border border-indigo-100 dark:border-zinc-700 bg-indigo-50/50 dark:bg-zinc-800/40 p-4">
            <h4 className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mb-3">
              {t("QR Menu App Branding")}
            </h4>
            <p className="mb-4 text-xs text-gray-500">
              {t("Branding upload guide: App Icon 1024 x 1024 px (square), Splash Logo 1600 x 900 px, Main Title Logo 1200 x 320 px.")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold block mb-2">{t("Restaurant App Icon")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={appIconInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setAppIconFileName(file?.name || "");
                      if (!file) return;
                      await uploadBrandingAsset("app_icon", file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => appIconInputRef.current?.click()}
                    disabled={uploadingAppIcon}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingAppIcon ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {appIconFileName ? appIconFileName : t("No file chosen")}
                  </span>
                </div>
                {(settings.app_icon_512 || settings.app_icon_192 || settings.app_icon) ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={resolveUploadSrc(
                        settings.app_icon_512 || settings.app_icon_192 || settings.app_icon,
                        settings.branding_updated_at
                      )}
                      alt={t("Restaurant App Icon")}
                      className="w-14 h-14 rounded-2xl object-cover border bg-white"
                    />
                    <span className="text-xs text-gray-500">
                      {t("Auto-resized to 192px and 512px for PWA install compatibility.")}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    {t("If not uploaded, Beypro default icon is used.")}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  {t("Recommended: 1024 x 1024 px (square), PNG/SVG, transparent background.")}
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-2">{t("Splash Screen Logo")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={splashLogoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setSplashLogoFileName(file?.name || "");
                      if (!file) return;
                      await uploadBrandingAsset("splash_logo", file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => splashLogoInputRef.current?.click()}
                    disabled={uploadingSplashLogo}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingSplashLogo ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {splashLogoFileName ? splashLogoFileName : t("No file chosen")}
                  </span>
                </div>
                {settings.splash_logo ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={resolveUploadSrc(settings.splash_logo, settings.branding_updated_at)}
                      alt={t("Splash Screen Logo")}
                      className="h-14 w-28 rounded-xl object-contain border bg-white px-2"
                    />
                    <span className="text-xs text-gray-500">
                      {t("Used for standalone launch splash experience.")}
                    </span>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-gray-500">
                  {t("Recommended: 1600 x 900 px (16:9), minimum 1200 x 675 px.")}
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-2">{t("Main Title Logo")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={mainTitleLogoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setMainTitleLogoFileName(file?.name || "");
                      if (!file) return;
                      await uploadBrandingAsset("main_title_logo", file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => mainTitleLogoInputRef.current?.click()}
                    disabled={uploadingMainTitleLogo}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingMainTitleLogo ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {mainTitleLogoFileName ? mainTitleLogoFileName : t("No file chosen")}
                  </span>
                </div>
                {settings.main_title_logo ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={resolveUploadSrc(
                        settings.main_title_logo,
                        settings.branding_updated_at
                      )}
                      alt={t("Main Title Logo")}
                      className="h-14 w-36 rounded-xl object-contain border bg-white px-2"
                    />
                    <span className="text-xs text-gray-500">
                      {t("Shown at the top of QR menu as the main title logo.")}
                    </span>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-gray-500">
                  {t("Recommended size: 1200 x 320 px (minimum 600 x 160 px), PNG/SVG with transparent background.")}
                </p>
              </div>

              <div>
                <label className="font-semibold block mb-2">{t("Marketplace Banner")}</label>
                <div className="flex items-center gap-3">
                  <input
                    ref={marketplaceBannerInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] || null;
                      setMarketplaceBannerFileName(file?.name || "");
                      if (!file) return;
                      await uploadBrandingAsset("marketplace_banner", file);
                      try {
                        e.target.value = "";
                      } catch {}
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => marketplaceBannerInputRef.current?.click()}
                    disabled={uploadingMarketplaceBanner}
                    className="px-4 py-2 rounded-xl border bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800 transition disabled:opacity-60"
                  >
                    {uploadingMarketplaceBanner ? t("Please wait...") : t("Choose file")}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-300">
                    {marketplaceBannerFileName ? marketplaceBannerFileName : t("No file chosen")}
                  </span>
                </div>
                {settings.marketplace_banner ? (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={resolveUploadSrc(
                        settings.marketplace_banner,
                        settings.branding_updated_at
                      )}
                      alt={t("Marketplace Banner")}
                      className="h-16 w-28 rounded-xl object-cover border bg-white"
                    />
                    <span className="text-xs text-gray-500">
                      {t("Used as marketplace card cover in Beypro Marketplace.")}
                    </span>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-gray-500">
                  {t("Recommended: 1600 x 900 px (16:9), JPG/PNG/WEBP.")}
                </p>
              </div>

              <div>
                <label className="font-semibold">{t("App Display Name")}</label>
                <input
                  type="text"
                  value={settings.app_display_name || ""}
                  onChange={(e) => updateField("app_display_name", e.target.value)}
                  placeholder={t("Restaurant name")}
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
                />
              </div>

              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/70">
                <label className="font-semibold block">{t("Custom Domain")}</label>
                <input
                  type="text"
                  value={customDomainInput}
                  onChange={(e) => {
                    setCustomDomainInput(e.target.value);
                    setCustomDomainError("");
                  }}
                  placeholder="menu.myrestaurant.com"
                  className={`w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800 ${
                    customDomainInlineError
                      ? "border-rose-400 focus:border-rose-500"
                      : "border-slate-300 dark:border-zinc-700"
                  }`}
                />
                <p className="mt-2 text-xs text-gray-500">
                  {t("Your QR menu link can be connected to your own domain.")}
                </p>
                {customDomainInlineError ? (
                  <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                    {customDomainInlineError}
                  </p>
                ) : null}

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/80">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t("Domain preview")}
                    </p>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {domainPreviewValue}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {customDomainPreview.isBlank
                        ? t("Using the default Beypro domain until a custom domain is saved.")
                        : customDomainPreview.isValid
                          ? `https://${domainPreviewValue}`
                          : t("Enter a valid domain to preview your custom domain.")}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/80">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {t("Generated slug preview")}
                    </p>
                    <p className="mt-2 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {slugPreviewValue}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {customDomainPreview.isBlank
                        ? t("Using current/default slug behavior while no custom domain is set.")
                        : customDomainPreview.isValid
                          ? t("Slug will be saved automatically from the custom domain.")
                          : t("Enter a valid domain to generate the slug safely.")}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold">{t("QR Menu Font Family")}</label>
                <select
                  value={String(settings.qrmenu_font_family || "gotham")}
                  onChange={(e) => updateField("qrmenu_font_family", e.target.value)}
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
                  style={{ fontFamily: resolveQrMenuFontFamily(settings.qrmenu_font_family) }}
                >
                  {QR_MENU_FONT_OPTIONS.map((fontOption) => (
                    <option
                      key={fontOption.value}
                      value={fontOption.value}
                      style={{ fontFamily: fontOption.family }}
                    >
                      {fontOption.label}
                    </option>
                  ))}
                </select>
                <p
                  className="mt-2 text-xs text-gray-500"
                  style={{ fontFamily: resolveQrMenuFontFamily(settings.qrmenu_font_family) }}
                >
                  {t("Preview text for selected QR menu font")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold">{t("Primary Color")}</label>
                  <input
                    type="color"
                    value={settings.pwa_primary_color || "#4F46E5"}
                    onChange={(e) => updateField("pwa_primary_color", e.target.value)}
                    className="mt-1 w-full h-12 p-1 rounded-xl border"
                  />
                </div>
                <div>
                  <label className="font-semibold">{t("Background Color")}</label>
                  <input
                    type="color"
                    value={settings.pwa_background_color || "#FFFFFF"}
                    onChange={(e) => updateField("pwa_background_color", e.target.value)}
                    className="mt-1 w-full h-12 p-1 rounded-xl border"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="font-semibold">{t("Primary Accent Color")}</label>
            <input
              type="color"
              value={settings.primary_color || "#4F46E5"}
              onChange={(e) => updateField("primary_color", e.target.value)}
              className="w-20 h-12 p-1 rounded-xl border"
            />
          </div>
        </div>

        {/* HERO SLIDER */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Hero Slider")}</h3>
          <p className="mb-3 text-xs text-gray-500">
            {t("Recommended slide image size: 1600 x 900 px (16:9), minimum 1200 x 675 px.")}
          </p>

          {settings.hero_slides.map((slide, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-800 border rounded-2xl p-4 mb-4 shadow-md"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("Slide")} {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeHeroSlide(index)}
                  className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  {t("Remove")}
                </button>
              </div>

              <label className="font-semibold">{t("Slide Image")}</label>
              <input type="file" onChange={(e) => uploadHeroImage(e, index)} className="w-full mt-1" />
              {slide.image ? (
                <div className="mt-2">
                  <img
                    src={resolveUploadSrc(slide.image)}
                    alt={`${t("Slide Image")} ${index + 1}`}
                    className="h-16 w-24 rounded-lg border object-cover"
                  />
                </div>
              ) : null}

              <label className="font-semibold mt-2 block">{t("Title")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.title}
                onChange={(e) => updateHeroSlide(index, "title", e.target.value)}
              />

              <label className="font-semibold mt-2 block">{t("Subtitle")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.subtitle}
                onChange={(e) => updateHeroSlide(index, "subtitle", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addHeroSlide}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Slide")}
          </button>
        </div>

        {/* POPULAR + THEME */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border">
            <label className="font-semibold block mb-2">{t("Popular This Week")}</label>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!settings.enable_popular}
                onChange={(e) => updateField("enable_popular", e.target.checked)}
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {t("Automatically shows trending products based on orders.")}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border">
            <label className="font-semibold block mb-2">{t("QR Download Popup")}</label>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.qr_download_popup_enabled !== false}
                onChange={(e) => updateField("qr_download_popup_enabled", e.target.checked)}
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {t("Show a popup before downloading the QR code.")}
              </span>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-2xl border">
            <label className="font-semibold block mb-2">{t("Theme")}</label>
            <select
              value={settings.qr_theme || "auto"}
              onChange={(e) => updateField("qr_theme", e.target.value)}
              className="w-full p-3 rounded-xl border bg-white dark:bg-zinc-900"
            >
              <option value="auto">{t("Auto")}</option>
              <option value="light">{t("Light")}</option>
              <option value="dark">{t("Dark")}</option>
            </select>
          </div>
        </div>
          </>
        )}

        {activeSettingsTab === "concert" && (
        <div ref={concertSectionRef} className="mt-2 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-indigo-600">{t("Concert Tickets")}</h3>
            <span className="text-xs px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700">
              {t("Payment Method")}: {t("Bank Transfer")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {t("Create events, ticket packages, and table reservations synced with QR table reservations.")}
          </p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Concert Reservation Button Color")}</label>
              <div className="mt-1 flex items-center gap-3 rounded-2xl border bg-white p-3 dark:bg-zinc-900">
                <input
                  type="color"
                  value={settings.concert_reservation_button_color || "#111827"}
                  onChange={(e) =>
                    updateField("concert_reservation_button_color", e.target.value)
                  }
                  className="h-11 w-16 rounded-xl border bg-transparent"
                />
                <input
                  type="text"
                  value={settings.concert_reservation_button_color || "#111827"}
                  onChange={(e) =>
                    updateField("concert_reservation_button_color", e.target.value)
                  }
                  className="flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm dark:bg-zinc-900"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                {t("Used for the concert booking and reservation buttons on the QR page.")}
              </p>
              <button
                type="button"
                onClick={saveConcertReservationButtonColor}
                disabled={savingConcertReservationButtonColor}
                className="mt-3 inline-flex min-h-[42px] items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingConcertReservationButtonColor ? t("Please wait...") : t("Save")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Artist name")}</label>
              <input
                type="text"
                value={concertForm.artist_name}
                onChange={(e) => updateConcertFormField("artist_name", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Event title")}</label>
              <input
                type="text"
                value={concertForm.event_title}
                onChange={(e) => updateConcertFormField("event_title", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Concert date")}</label>
              <input
                type="date"
                value={concertForm.event_date}
                onChange={(e) => updateConcertFormField("event_date", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Concert time")}</label>
              <input
                type="time"
                value={concertForm.event_time}
                onChange={(e) => updateConcertFormField("event_time", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold">{t("Concert picture")}</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={concertForm.event_image}
                  onChange={(e) => updateConcertFormField("event_image", e.target.value)}
                  placeholder={t("Image URL or uploaded path")}
                  className="flex-1 min-w-[220px] p-3 rounded-xl border bg-white dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => concertImageInputRef.current?.click()}
                  disabled={uploadingConcertImage}
                  className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60"
                >
                  {uploadingConcertImage ? t("Please wait...") : t("Upload image")}
                </button>
                <input
                  ref={concertImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={uploadConcertImage}
                  className="hidden"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {t("Recommended concert picture size: 1600 x 900 px (16:9), minimum 1200 x 675 px.")}
              </p>
              {concertForm.event_image ? (
                <img
                  src={resolveUploadSrc(concertForm.event_image)}
                  alt={t("Concert preview")}
                  className="mt-2 w-full max-w-sm aspect-[16/9] rounded-xl object-cover border border-gray-200"
                />
              ) : null}
            </div>
            <div>
              <label className="font-semibold">{t("Ticket price")}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={concertForm.ticket_price}
                onChange={(e) => updateConcertFormField("ticket_price", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Status")}</label>
              <select
                value={concertForm.status}
                onChange={(e) => updateConcertFormField("status", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              >
                <option value="active">{t("active")}</option>
                <option value="sold_out">{t("sold out")}</option>
                <option value="hidden">{t("hidden")}</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 rounded-xl border bg-white dark:bg-zinc-900 px-3 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(concertForm.free_concert)}
                  onChange={(e) => updateConcertFormField("free_concert", e.target.checked)}
                />
                <span className="text-sm font-semibold">{t("Free concert")}</span>
              </label>
            </div>
            <div>
              <label className="font-semibold">{t("Total ticket quantity available")}</label>
              <input
                type="number"
                min="0"
                value={concertForm.total_ticket_quantity}
                onChange={(e) => updateConcertFormField("total_ticket_quantity", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Total table quantity available")}</label>
              <input
                type="number"
                min="0"
                value={concertForm.total_table_quantity}
                onChange={(e) => updateConcertFormField("total_table_quantity", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="font-semibold">{t("Description")}</label>
            <textarea
              rows={3}
              value={concertForm.description}
              onChange={(e) => updateConcertFormField("description", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>
          <div className="mt-4">
            <label className="font-semibold">{t("Bank Transfer Instructions")}</label>
            <textarea
              rows={2}
              value={concertForm.bank_transfer_instructions}
              onChange={(e) => updateConcertFormField("bank_transfer_instructions", e.target.value)}
              placeholder={t("Share account details and transfer note here")}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>

          <div className="mt-6 rounded-2xl border bg-white dark:bg-zinc-900 p-4">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("Guest composition rules")}
            </h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {t("Configure whether concert table reservations must include a guest composition split and how it should be validated.")}
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-semibold">{t("Enable guest composition field")}</label>
                <select
                  value={concertForm.guest_composition_enabled ? "on" : "off"}
                  onChange={(e) =>
                    updateConcertGuestCompositionEnabled(e.target.value === "on")
                  }
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                >
                  <option value="off">{t("Off")}</option>
                  <option value="on">{t("On")}</option>
                </select>
              </div>

              <div>
                <label className="font-semibold">{t("Field mode")}</label>
                <select
                  value={concertForm.guest_composition_field_mode}
                  onChange={(e) =>
                    updateConcertFormField("guest_composition_field_mode", e.target.value)
                  }
                  disabled={!concertForm.guest_composition_enabled}
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 disabled:opacity-60"
                >
                  {CONCERT_GUEST_COMPOSITION_FIELD_MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold">{t("Restriction rule")}</label>
                <select
                  value={concertForm.guest_composition_restriction_rule}
                  onChange={(e) =>
                    updateConcertFormField(
                      "guest_composition_restriction_rule",
                      e.target.value
                    )
                  }
                  disabled={!concertForm.guest_composition_enabled}
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 disabled:opacity-60"
                >
                  {CONCERT_GUEST_COMPOSITION_RESTRICTION_RULES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold">{t("Validation message")}</label>
                <textarea
                  rows={3}
                  value={concertForm.guest_composition_validation_message}
                  onChange={(e) =>
                    updateConcertFormField(
                      "guest_composition_validation_message",
                      e.target.value
                    )
                  }
                  disabled={!concertForm.guest_composition_enabled}
                  placeholder={t("This policy does not allow reservations for male-only groups.")}
                  className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none disabled:opacity-60"
                />
              </div>

              <div className="md:col-span-2">
                <label className="font-semibold">{t("Disable for specific tables")}</label>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {t("Selected tables will skip guest composition requirements even when the field is enabled.")}
                </p>
                <div className="mt-3" ref={guestCompositionTablesDropdownRef}>
                  {tables.length > 0 ? (
                    <>
                      <button
                        type="button"
                        disabled={!concertForm.guest_composition_enabled}
                        onClick={() =>
                          setShowGuestCompositionTablesDropdown((prev) => !prev)
                        }
                        className="flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm transition hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span>
                          {(concertForm.guest_composition_disabled_tables || []).length > 0
                            ? t("{{count}} table(s) excluded", {
                                count: (concertForm.guest_composition_disabled_tables || []).length,
                              })
                            : t("Select tables")}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            showGuestCompositionTablesDropdown ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {showGuestCompositionTablesDropdown && (
                        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
                          {tables.map((tbl) => {
                            const tableNumber = Number(tbl?.table_number ?? tbl?.number);
                            if (!Number.isFinite(tableNumber) || tableNumber <= 0) return null;
                            const isSelected = (concertForm.guest_composition_disabled_tables || []).includes(
                              tableNumber
                            );
                            return (
                              <label
                                key={`guest-comp-table-${tableNumber}`}
                                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-slate-50 dark:hover:bg-zinc-900"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!concertForm.guest_composition_enabled}
                                  onChange={() => {
                                    setConcertForm((prev) => {
                                      const current = normalizeTableNumberList(
                                        prev.guest_composition_disabled_tables
                                      );
                                      const next = current.includes(tableNumber)
                                        ? current.filter((value) => value !== tableNumber)
                                        : [...current, tableNumber];
                                      return {
                                        ...prev,
                                        guest_composition_disabled_tables:
                                          normalizeTableNumberList(next),
                                      };
                                    });
                                  }}
                                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="font-medium">
                                  {t("Table")} {tableNumber}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {(concertForm.guest_composition_disabled_tables || []).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {normalizeTableNumberList(
                            concertForm.guest_composition_disabled_tables
                          ).map((tableNumber) => (
                            <span
                              key={`guest-comp-selected-${tableNumber}`}
                              className="rounded-full border border-amber-500 bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900 dark:border-amber-400 dark:bg-amber-500/20 dark:text-amber-100"
                            >
                              {t("Table")} {tableNumber}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
                      {t("No tables configured yet. Go to the Tables page to add tables.")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Area-based allocation")}</h4>
              <button
                type="button"
                onClick={addConcertAreaAllocation}
                className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t("Add")}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {(concertForm.area_allocations || []).map((row, index) => (
                <div key={`alloc-${index}`} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded-xl border bg-white dark:bg-zinc-900">
                  <div>
                    <label className="text-xs font-semibold">{t("Area")}</label>
                    <input
                      list="concert-area-options"
                      value={row.area_name}
                      onChange={(e) => updateConcertAreaAllocationField(index, "area_name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Type")}</label>
                    <select
                      value={row.allocation_type}
                      onChange={(e) => updateConcertAreaAllocationField(index, "allocation_type", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    >
                      <option value="ticket">{t("Ticket")}</option>
                      <option value="table">{t("Table")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Price")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateConcertAreaAllocationField(index, "price", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Quantity")}</label>
                    <input
                      type="number"
                      min="0"
                      value={row.quantity_total}
                      onChange={(e) => updateConcertAreaAllocationField(index, "quantity_total", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeConcertAreaAllocation(index)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Ticket Types / Packages")}</h4>
              <button
                type="button"
                onClick={addConcertTicketType}
                className="px-3 py-1.5 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t("Add")}
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {(concertForm.ticket_types || []).map((row, index) => (
                <div key={`ticket-type-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 rounded-xl border bg-white dark:bg-zinc-900">
                  <div>
                    <label className="text-xs font-semibold">{t("Name")}</label>
                    <input
                      value={row.name}
                      onChange={(e) => updateConcertTicketTypeField(index, "name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Area")}</label>
                    <input
                      list="concert-area-options"
                      value={row.area_name}
                      onChange={(e) => updateConcertTicketTypeField(index, "area_name", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Price")}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateConcertTicketTypeField(index, "price", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold">{t("Quantity")}</label>
                    <input
                      type="number"
                      min="0"
                      value={row.quantity_total}
                      onChange={(e) => updateConcertTicketTypeField(index, "quantity_total", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id={`ticket-type-table-${index}`}
                      type="checkbox"
                      checked={Boolean(row.is_table_package)}
                      onChange={(e) => updateConcertTicketTypeField(index, "is_table_package", e.target.checked)}
                    />
                    <label htmlFor={`ticket-type-table-${index}`} className="text-xs font-semibold">
                      {t("Table Package")}
                    </label>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeConcertTicketType(index)}
                      className="w-full mt-1 p-2.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      {t("Delete")}
                    </button>
                  </div>
                  <div className="md:col-span-6">
                    <label className="text-xs font-semibold">{t("Description")}</label>
                    <textarea
                      rows={2}
                      value={row.description}
                      onChange={(e) => updateConcertTicketTypeField(index, "description", e.target.value)}
                      className="w-full mt-1 p-2.5 rounded-lg border bg-white dark:bg-zinc-900 resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <datalist id="concert-area-options">
            {concertAreaOptions.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveConcert}
              disabled={savingConcert}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {savingConcert ? t("Please wait...") : editingConcertId ? t("Update") : t("Create")}
            </button>
            {editingConcertId ? (
              <button
                type="button"
                onClick={resetConcertEditor}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white dark:bg-zinc-900 font-semibold hover:bg-gray-50"
              >
                {t("Cancel")}
              </button>
            ) : null}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">{t("Upcoming Concerts")}</h4>
              {loadingConcerts ? (
                <span className="text-xs text-gray-500">{t("Loading...")}</span>
              ) : null}
            </div>
            {concertEvents.length === 0 ? (
              <div className="mt-3 text-sm text-gray-500">{t("No concerts yet.")}</div>
            ) : (
              <div className="mt-3 space-y-4">
                {concertEvents.map((event) => {
                  const bookings = concertBookingsByEvent[event.id];
                  const isBookingOpen = Array.isArray(bookings);
                  const eventImage = resolveUploadSrc(event.event_image);
                  const concertEndDate = resolveConcertEndDate(event);
                  const isPastConcert =
                    concertEndDate instanceof Date &&
                    Number.isFinite(concertEndDate.getTime()) &&
                    concertEndDate.getTime() < Date.now();
                  const effectiveStatus = isPastConcert ? "deactivated" : String(event.status || "active");
                  return (
                    <div key={event.id} className="rounded-2xl border border-gray-200 bg-white dark:bg-zinc-900 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {eventImage ? (
                            <img
                              src={eventImage}
                              alt={event.event_title || event.artist_name || t("Concert Tickets")}
                              className="w-20 h-14 rounded-lg object-cover border border-gray-200"
                            />
                          ) : null}
                          <div>
                            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                              {event.event_title || event.artist_name}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-300">
                              {event.artist_name} • {formatConcertDateTime(event)}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {t("Tickets sold")}: {event.sold_ticket_count || 0} / {event.total_ticket_quantity || 0} • {t("Tables reserved")}: {event.sold_table_count || 0} / {event.total_table_quantity || 0}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            effectiveStatus === "deactivated"
                              ? "bg-slate-200 text-slate-700 border border-slate-300"
                              : event.status === "sold_out"
                              ? "bg-rose-100 text-rose-700 border border-rose-200"
                              : event.status === "hidden"
                              ? "bg-slate-100 text-slate-700 border border-slate-200"
                              : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}>
                            {effectiveStatus}
                          </span>
                          {event.free_concert ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              {t("Free concert")}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => startEditConcert(event)}
                            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                          >
                            {t("Edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeConcert(event)}
                            disabled={deletingConcertId === event.id}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-60"
                          >
                            {deletingConcertId === event.id ? t("Please wait...") : t("Delete")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isBookingOpen) {
                                setConcertBookingsByEvent((prev) => {
                                  const next = { ...prev };
                                  delete next[event.id];
                                  return next;
                                });
                                return;
                              }
                              loadConcertBookings(event.id);
                            }}
                            className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-50"
                          >
                            {isBookingOpen ? t("Hide bookings") : t("View bookings")}
                          </button>
                        </div>
                      </div>
                      {isPastConcert ? (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          {t("Concert date is over. Booking is disabled.", {
                            defaultValue: "Concert date is over. Booking is disabled.",
                          })}
                        </div>
                      ) : null}

                      {Array.isArray(event.ticket_types) && event.ticket_types.length > 0 ? (
                        <div className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                          {(event.ticket_types || []).map((ticketType) => (
                            <div key={ticketType.id} className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{ticketType.name}</span>
                              {ticketType.area_name ? <span>• {ticketType.area_name}</span> : null}
                              <span>• {ticketType.available_count}/{ticketType.quantity_total}</span>
                              <span>• {ticketType.price}</span>
                              {ticketType.is_table_package ? (
                                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{t("Table Package")}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isBookingOpen ? (
                        <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
                          {loadingConcertBookingsEventId === event.id ? (
                            <div className="p-3 text-sm text-gray-500">{t("Loading...")}</div>
                          ) : bookings.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">{t("No bookings yet.")}</div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {bookings.map((booking) => (
                                <div key={booking.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                                  <div>
                                    <div className="font-semibold">
                                      {booking.customer_name || t("Guest")} {booking.customer_phone ? `• ${booking.customer_phone}` : ""}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {booking.booking_type} • {booking.quantity} • {booking.payment_status}
                                      {booking.ticket_type_name ? ` • ${booking.ticket_type_name}` : ""}
                                      {booking.reserved_table_number ? ` • ${t("Table")} ${booking.reserved_table_number}` : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => updateConcertBookingPayment(event.id, booking.id, "confirmed")}
                                      disabled={updatingConcertBookingId === booking.id || booking.payment_status === "confirmed"}
                                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-xs hover:bg-emerald-50 disabled:opacity-60"
                                    >
                                      {t("Confirm")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateConcertBookingPayment(event.id, booking.id, "cancelled")}
                                      disabled={updatingConcertBookingId === booking.id || booking.payment_status === "cancelled"}
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs hover:bg-rose-50 disabled:opacity-60"
                                    >
                                      {t("Cancel")}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}

        {activeSettingsTab === "app" && (
          <>
        {/* LOYALTY PROGRAM */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Loyalty Program")}</h3>
          <div className="flex items-center gap-3 mb-4">
            <input
              id="loyalty_enabled"
              type="checkbox"
              checked={!!settings.loyalty_enabled}
              onChange={(e) => updateField("loyalty_enabled", e.target.checked)}
            />
            <label htmlFor="loyalty_enabled" className="font-medium">
              {t("Enable Loyalty")}
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="font-semibold">{t("Stamps needed")}</label>
              <input
                type="number"
                min="1"
                value={settings.loyalty_goal || 10}
                onChange={(e) => updateField("loyalty_goal", Number(e.target.value))}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="font-semibold">{t("Reward Description")}</label>
              <input
                type="text"
                value={settings.loyalty_reward_text || ""}
                onChange={(e) => updateField("loyalty_reward_text", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>
            <div>
              <label className="font-semibold">{t("Loyalty Card Color")}</label>
              <input
                type="color"
                value={settings.loyalty_color || "#F59E0B"}
                onChange={(e) => updateField("loyalty_color", e.target.value)}
                className="w-20 h-12 p-1 rounded-xl border"
              />
            </div>
          </div>
        </div>

        {/* STORY */}
        <div className="mt-10 bg-gray-50 dark:bg-zinc-800 p-6 rounded-2xl border">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-xl font-bold text-indigo-600">{t("Our Story Section")}</h3>
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={settings.story_enabled !== false}
                onChange={(e) => updateField("story_enabled", e.target.checked)}
              />
              <span>{t("Enable Story Section")}</span>
            </label>
          </div>
          <p className="mb-4 text-xs text-gray-500 dark:text-zinc-400">
            {t("Recommended story image size: 1600 x 900 px (16:9), minimum 1200 x 675 px.")}
          </p>

          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Story Video Title")}</label>
              <input
                type="text"
                value={settings.story_video_title || ""}
                onChange={(e) => updateField("story_video_title", e.target.value)}
                placeholder={t("Title above the video")}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>

            <div>
              <label className="font-semibold">{t("Story Video Source")}</label>
              <select
                value={String(settings.story_video_source || "none")}
                onChange={(e) => updateField("story_video_source", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              >
                <option value="none">{t("None")}</option>
                <option value="youtube">{t("YouTube URL")}</option>
                <option value="upload">{t("Upload Video")}</option>
              </select>
            </div>

            {String(settings.story_video_source || "").toLowerCase() === "youtube" ? (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="font-semibold">{t("YouTube Video Links")}</label>
                  <button
                    type="button"
                    onClick={addStoryVideoUrl}
                    className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                  >
                    {t("Add Video Link")}
                  </button>
                </div>
                <div className="mt-2 space-y-3">
                  {normalizeStoryVideoUrls(settings).map((url, index) => (
                    <div key={`story-video-url-${index}`} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => updateStoryVideoUrl(index, e.target.value)}
                        placeholder={t("YouTube Video Link")}
                        className="w-full min-w-0 p-3 rounded-xl border bg-white dark:bg-zinc-900"
                      />
                      {normalizeStoryVideoUrls(settings).length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeStoryVideoUrl(index)}
                          className="inline-flex shrink-0 items-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-950/30"
                        >
                          {t("Remove")}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                  {t("Paste one or more YouTube watch/share URLs to show videos above the story section.")}
                </p>
              </div>
            ) : null}

            {String(settings.story_video_source || "").toLowerCase() === "upload" ? (
              <div>
                <label className="font-semibold">{t("Story Video Upload")}</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={uploadStoryVideo}
                  className="w-full mt-1"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                  {uploadingStoryVideo
                    ? t("Uploading story video...")
                    : t(`Recommended: MP4 (H.264), 1920 x 1080 px, max ${MAX_STORY_VIDEO_UPLOAD_MB} MB, 30-60 seconds for best mobile performance.`)}
                </p>
              </div>
            ) : null}
          </div>

          {String(settings.story_video_source || "").toLowerCase() === "youtube" &&
          normalizeStoryVideoUrls(settings).some((url) => resolveYouTubeEmbedUrl(url)) ? (
            <div className="mb-5 space-y-3 rounded-2xl border bg-white dark:bg-zinc-900 p-3">
              {normalizeStoryVideoUrls(settings)
                .map((url) => resolveYouTubeEmbedUrl(url))
                .filter(Boolean)
                .map((embedUrl, index) => (
                  <div
                    key={`story-video-preview-${index}`}
                    className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700 bg-black"
                  >
                    <iframe
                      src={embedUrl}
                      title={`${t("Story Video Preview")} ${index + 1}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ))}
            </div>
          ) : null}

          {String(settings.story_video_source || "").toLowerCase() === "upload" &&
          settings.story_video_upload ? (
            <div className="mb-5 rounded-2xl border bg-white dark:bg-zinc-900 p-3">
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200 dark:border-zinc-700 bg-black">
                <video
                  src={resolveUploadSrc(settings.story_video_upload)}
                  controls
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={removeStoryVideoUpload}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                >
                  {t("Remove Video")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold">{t("Story Title")}</label>
              <input
                type="text"
                value={settings.story_title}
                onChange={(e) => updateField("story_title", e.target.value)}
                className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900"
              />
            </div>

            <div>
              <label className="font-semibold">{t("Story Images")}</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={uploadStoryImages}
                className="w-full mt-1"
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                {uploadingStoryImages
                  ? t("Uploading story images...")
                  : t("Upload multiple images. Drag thumbnails or use arrows to reorder them.")}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="font-semibold">{t("Story Text")}</label>
            <textarea
              rows="5"
              value={settings.story_text}
              onChange={(e) => updateField("story_text", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-900 resize-none"
            />
          </div>

          {settings.story_images.length > 0 ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-zinc-200">
                  {t("Story Slide Order")}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  {t("First image appears first in the slider.")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {settings.story_images.map((image, index) => (
                  <div
                    key={`${image}-${index}`}
                    draggable
                    onDragStart={() => setDraggedStoryImageIndex(index)}
                    onDragEnd={() => setDraggedStoryImageIndex(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleStoryImageDrop(index)}
                    className={`rounded-2xl border bg-white dark:bg-zinc-900 overflow-hidden transition ${
                      draggedStoryImageIndex === index
                        ? "border-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-900/40"
                        : "border-gray-200 dark:border-zinc-700"
                    }`}
                  >
                    <div className="aspect-[4/3] bg-gray-100 dark:bg-zinc-950">
                      <img
                        src={resolveUploadSrc(image)}
                        alt={`${t("Story Image")} ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                          {t("Slide")} {index + 1}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                          {t("Drag to reorder")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveStoryImage(index, -1)}
                          disabled={index === 0}
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {t("Up")}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStoryImage(index, 1)}
                          disabled={index === settings.story_images.length - 1}
                          className="px-2.5 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {t("Down")}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeStoryImage(index)}
                          className="p-2 rounded-lg border text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                          aria-label={t("Remove Story Image")}
                          title={t("Remove Story Image")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 px-4 py-8 text-center text-sm text-gray-500 dark:text-zinc-400">
              {t("No story images uploaded yet.")}
            </div>
          )}
        </div>

        {/* REVIEWS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Customer Reviews")}</h3>

          {settings.reviews.map((rev, index) => (
            <div key={index} className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-xl mb-3">
              <div className="mb-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => removeReview(index)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("Remove")}
                </button>
              </div>
              <input
                type="text"
                className="w-full p-2 rounded-xl border"
                placeholder={t("Name")}
                value={rev.name}
                onChange={(e) => updateReview(index, "name", e.target.value)}
              />

              <input
                type="number"
                min="1"
                max="5"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Rating")}
                value={rev.rating}
                onChange={(e) => updateReview(index, "rating", e.target.value)}
              />

              <textarea
                rows="3"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Review text")}
                value={rev.text}
                onChange={(e) => updateReview(index, "text", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addReview}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Review")}
          </button>
        </div>

        {/* SOCIAL LINKS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Social Media")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder={t("Instagram URL")}
              value={settings.social_instagram}
              onChange={(e) => updateField("social_instagram", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder={t("TikTok URL")}
              value={settings.social_tiktok}
              onChange={(e) => updateField("social_tiktok", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder={t("Website URL")}
              value={settings.social_website}
              onChange={(e) => updateField("social_website", e.target.value)}
              className="p-3 rounded-xl border"
            />
          </div>
        </div>

        <div className="h-24" aria-hidden="true" />

        {/* SAVE BUTTON */}
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <button
            onClick={saveAllCustomization}
            className="pointer-events-auto inline-flex min-h-[52px] w-full max-w-xs items-center justify-center rounded-2xl border border-slate-900 bg-slate-900/95 px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.22)] backdrop-blur-md transition hover:bg-slate-800 sm:w-auto dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            💾 {t("Save All Changes")}
          </button>
        </div>
          </>
        )}
      </div>
    )}
  </div>
);

}
