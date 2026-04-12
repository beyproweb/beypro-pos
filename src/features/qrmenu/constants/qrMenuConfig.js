import { PHONE_API_REGEX } from "../../../utils/phone";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const QR_PHONE_REGEX = PHONE_API_REGEX;
export const PHONE_REQUIRED_ORDER_TYPES = new Set(["online", "packet", "delivery", "phone"]);

export const QR_MENU_BRANDING_CACHE_PREFIX = "qr-menu-branding-cache:";
export const QR_MENU_BRANDING_UPDATED_EVENT = "qr:branding-cache-updated";

export const QR_MENU_FONT_FAMILIES = {
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

export const QR_PREFIX = "qr_";
export const QR_TOKEN_KEY = "qr_token";
export const TABLE_KEY = "qr_selected_table";
