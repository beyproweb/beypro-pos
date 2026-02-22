import { ONLINE_SOURCE_DISPLAY_NAMES } from "./constants";

export function formatOnlineSourceLabel(source) {
  if (!source) return null;
  const trimmed = String(source).trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (!normalized) return trimmed;
  if (Object.prototype.hasOwnProperty.call(ONLINE_SOURCE_DISPLAY_NAMES, normalized)) {
    return ONLINE_SOURCE_DISPLAY_NAMES[normalized];
  }
  const parts = normalized
    .split(/[^a-z0-9]+/)
    .filter((chunk) => chunk.length)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1));
  return parts.length ? parts.join(" ") : trimmed;
}

export function normalizePaymentKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
