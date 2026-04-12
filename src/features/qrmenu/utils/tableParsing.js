import { PUBLIC_RESTAURANT_BASE_URL } from "../../../utils/publicRestaurantUrl";

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
  const colon = raw.split(":");
  const last = colon[colon.length - 1];
  const match = String(last).match(/(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
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

export {
  boolish,
  decodeJwtPayload,
  extractTableFromParams,
  extractTableNumberFromQrText,
  getQrModeFromLocation,
  getTableFromLocation,
  parsePositiveTableNumber,
  parseRestaurantIdFromIdentifier,
};
