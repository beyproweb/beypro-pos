const defaultReceiptLayout = {
  fontSize: 14,
  lineHeight: 1.3,
  showLogo: true,
  showQr: true,
  showHeader: true,
  showFooter: true,
  headerText: "Beypro POS - HurryBey",
  footerText: "Thank you for your order! / Teşekkürler!",
  alignment: "left",
  shopAddress: "",
  shopAddressFontSize: 11,
  extras: [
    { label: "Instagram", value: "@yourshop" },
    { label: "Tax No", value: "1234567890" },
  ],
  showPacketCustomerInfo: true,
  paperWidth: "58mm",
  receiptWidth: "58mm",
  receiptHeight: "",
};

import secureFetch from "./secureFetch";
import { imageUrlToEscposBytes } from "./imageToEscpos";
import { qrStringToEscposBytes } from "./qrToEscpos";
import { formatWithActiveCurrency } from "./currency";

const PRINTER_SETTINGS_TTL = 120000; // ms
let printerSettingsCache = null;
let printerSettingsFetchedAt = 0;
let printerSettingsPromise = null;

const PRINTER_DISCOVERY_TTL = 60000; // ms
let printerDiscoveryCache = null;
let printerDiscoveryFetchedAt = 0;
let printerDiscoveryPromise = null;

const ALIGNMENT_ESC_POS = {
  center: "ct",
  right: "rt",
};

const CP1254_MAP = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "ˆ": 0x88,
  "‰": 0x89,
  "Š": 0x8a,
  "‹": 0x8b,
  "Œ": 0x8c,
  "Ž": 0x8e,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
  "š": 0x9a,
  "›": 0x9b,
  "œ": 0x9c,
  "ž": 0x9e,
  "Ÿ": 0x9f,
  "Ş": 0xde,
  "ş": 0xfe,
  "Ğ": 0xd0,
  "ğ": 0xf0,
  "İ": 0xdd,
  "ı": 0xfd,
  "Ç": 0xc7,
  "ç": 0xe7,
  "Ö": 0xd6,
  "ö": 0xf6,
  "Ü": 0xdc,
  "ü": 0xfc,
  "Â": 0xc2,
  "â": 0xe2,
  "Ê": 0xca,
  "ê": 0xea,
  "Î": 0xce,
  "î": 0xee,
  "Û": 0xdb,
  "û": 0xfb,
};

function encodeCP1254(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const codePoint = char.codePointAt(0);

    if (codePoint < 0x80) {
      bytes.push(codePoint);
      continue;
    }

    const mapped = CP1254_MAP[char];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    bytes.push(0x3f); // '?'
  }
  return new Uint8Array(bytes);
}

function coerceNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;

    const sanitized = trimmed.replace(/[^0-9.,-]/g, "");
    if (sanitized) {
      const attemptDirect = Number(sanitized);
      if (Number.isFinite(attemptDirect)) return attemptDirect;

      if (sanitized.includes(",") && sanitized.includes(".")) {
        const commaAsThousands = Number(sanitized.replace(/,/g, ""));
        if (Number.isFinite(commaAsThousands)) return commaAsThousands;
      }

      const normalized = sanitized.replace(/\.(?=.*[.,])/g, "").replace(/,/g, ".");
      const parsedNormalized = Number(normalized);
      if (Number.isFinite(parsedNormalized)) return parsedNormalized;
    }
  }

  const fallback = Number(value);
  return Number.isFinite(fallback) ? fallback : null;
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = coerceNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

const formatMoney = (value) => {
  const currencyKey = typeof window !== "undefined" ? (window.beyproCurrencyKey || window.beyproCurrencyLabel) : undefined;
  return formatWithActiveCurrency(Number.isFinite(value) ? value : 0, { currencyKey });
};

const formatQuantity = (qty) => {
  if (!Number.isFinite(qty)) return "1";
  if (Math.abs(qty - Math.round(qty)) < 1e-4) return String(Math.round(qty));
  return qty.toFixed(2);
};

function toBase64(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buf).toString("base64");
  }
  // Browser fallback: chunk to avoid call stack limits
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    const chunk = buf.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

let layoutCache = { ...defaultReceiptLayout };
let layoutLoaded = false;

// Listen for layout updates from other tabs/windows
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith("beypro_receipt_layout_update") && event.newValue) {
      try {
        const { layout } = JSON.parse(event.newValue);
        if (layout && typeof layout === "object") {
          setReceiptLayout(layout);
        }
      } catch {}
    }
  });
}
let layoutFetchPromise = null;
let cachedRegisterSettings = null;
let fetchingRegisterPromise = null;

async function getRegisterSettings() {
  if (cachedRegisterSettings) return cachedRegisterSettings;
  if (fetchingRegisterPromise) return fetchingRegisterPromise;
  fetchingRegisterPromise = secureFetch("/settings/register")
    .then((data) => {
      cachedRegisterSettings = data || {};
      return cachedRegisterSettings;
    })
    .catch(() => (cachedRegisterSettings = {}))
    .finally(() => {
      fetchingRegisterPromise = null;
    });
  return fetchingRegisterPromise;
}

export function setReceiptLayout(next) {
  layoutCache = { ...defaultReceiptLayout, ...(next || {}) };
  if (!layoutCache.receiptWidth && layoutCache.paperWidth) {
    layoutCache.receiptWidth = layoutCache.paperWidth;
  }
  if (!layoutCache.paperWidth && layoutCache.receiptWidth) {
    layoutCache.paperWidth = layoutCache.receiptWidth;
  }
  layoutLoaded = true;
  if (typeof window !== "undefined") {
    window.__receiptLayout = layoutCache;
  }
}

export function getReceiptLayout() {
  if (!layoutLoaded) {
    if (typeof window !== "undefined" && window.__receiptLayout && typeof window.__receiptLayout === "object") {
      layoutCache = { ...defaultReceiptLayout, ...window.__receiptLayout };
      console.log("✅ Receipt layout loaded from window.__receiptLayout");
    }
    layoutLoaded = true;
  }
  return layoutCache || { ...defaultReceiptLayout };
}

async function ensureReceiptLayout() {
  if (layoutLoaded && layoutCache !== null) return layoutCache;
  if (layoutFetchPromise) return layoutFetchPromise;

  layoutFetchPromise = secureFetch("/printer-settings/sync")
    .then((printer) => {
      const layout = printer?.settings?.layout || printer?.layout;
      if (layout && typeof layout === "object") {
        setReceiptLayout(layout);
        console.log("✅ Receipt layout loaded from backend sync:", Object.keys(layout));
      } else {
        console.warn("⚠️ No layout data received from backend, using defaults");
        layoutLoaded = true;
      }
      return layoutCache;
    })
    .catch((err) => {
      console.warn("⚠️ Failed to load receipt layout:", err?.message || err);
      layoutLoaded = true;
      return layoutCache;
    })
    .finally(() => {
      layoutFetchPromise = null;
    });

  return layoutFetchPromise;
}

async function getPrinterSettingsCached(force = false) {
  const now = Date.now();
  if (!force && printerSettingsCache && now - printerSettingsFetchedAt < PRINTER_SETTINGS_TTL) {
    return printerSettingsCache;
  }
  if (printerSettingsPromise) return printerSettingsPromise;

  printerSettingsPromise = secureFetch("/printer-settings/sync")
    .then((data) => {
      printerSettingsCache = data?.settings || null;
      printerSettingsFetchedAt = Date.now();
      return printerSettingsCache;
    })
    .catch((err) => {
      console.warn("⚠️ Failed to load printer settings:", err?.message || err);
      printerSettingsCache = null;
      printerSettingsFetchedAt = 0;
      return null;
    })
    .finally(() => {
      printerSettingsPromise = null;
    });

  return printerSettingsPromise;
}

async function getPrinterDiscoveryCached(force = false) {
  const now = Date.now();
  if (
    !force &&
    printerDiscoveryCache &&
    now - printerDiscoveryFetchedAt < PRINTER_DISCOVERY_TTL
  ) {
    return printerDiscoveryCache;
  }
  if (printerDiscoveryPromise) return printerDiscoveryPromise;

  printerDiscoveryPromise = secureFetch("/printer-settings/printers")
    .then((data) => {
      const raw = data?.printers || {};
      printerDiscoveryCache = {
        usb: Array.isArray(raw.usb) ? raw.usb : [],
        serial: Array.isArray(raw.serial) ? raw.serial : [],
        lan: Array.isArray(raw.lan) ? raw.lan : [],
      };
      printerDiscoveryFetchedAt = Date.now();
      return printerDiscoveryCache;
    })
    .catch((err) => {
      console.warn("⚠️ Failed to fetch printer discovery:", err?.message || err);
      printerDiscoveryCache = null;
      printerDiscoveryFetchedAt = 0;
      return null;
    })
    .finally(() => {
      printerDiscoveryPromise = null;
    });

  return printerDiscoveryPromise;
}

function parseLanTarget(printerId = "") {
  const match = /^lan:([^:]+)(?::(\d+))?$/i.exec(String(printerId));
  if (!match) return null;
  const host = match[1];
  const port = Number(match[2]) || 9100;
  if (!host) return null;
  return { interface: "network", host, port };
}

function parseDirectTarget(printerId = "") {
  const id = String(printerId || "").trim();
  if (!id) return null;

  if (/^lan:/i.test(id)) {
    return parseLanTarget(id);
  }

  if (/^network:/i.test(id)) {
    return parseLanTarget(id.replace(/^network:/i, "lan:"));
  }

  if (/^windows:/i.test(id)) {
    const parts = id.split(":");
    const name = parts.slice(1, parts.length - 1).join(":") || parts[1];
    return name ? { interface: "windows", name } : null;
  }

  if (/^usb:/i.test(id)) {
    const parts = id.split(":");
    if (parts.length >= 3) {
      const vendorId = parts[1];
      const productId = parts[2];
      if (vendorId && productId) {
        return {
          interface: "usb",
          vendorId,
          productId,
        };
      }
    }
  }

  if (/^serial:/i.test(id)) {
    const parts = id.split(":");
    if (parts.length >= 2) {
      const path = parts[1];
      const baud = parts[2];
      if (path) {
        return {
          interface: "serial",
          path,
          baudRate: Number(baud) || 9600,
        };
      }
    }
  }

  return null;
}

function resolvePrinterFromDiscovery(printerId, discovery) {
  if (!printerId || !discovery) return null;
  const { usb = [], serial = [], lan = [] } = discovery;
  const entries = [...usb, ...serial, ...lan];
  const match = entries.find((printer) => printer?.id === printerId);
  if (!match) return null;

  switch (String(match.type || "").toLowerCase()) {
    case "usb":
      if (!match.vendorId || !match.productId) return null;
      return {
        interface: "usb",
        vendorId: match.vendorId,
        productId: match.productId,
      };
    case "serial":
      if (!match.path) return null;
      return {
        interface: "serial",
        path: match.path,
        baudRate: Number(match.baudRate) || 9600,
      };
    case "lan":
    case "network": {
      const host = match.meta?.host || match.host;
      const port = Number(match.meta?.port || match.port || 9100);
      if (!host) return null;
      return {
        interface: "network",
        host,
        port,
      };
    }
    default:
      return null;
  }
}

function resolvePrinterFromRegister(printer = null) {
  if (!printer || !printer.interface) return null;
  const iface = String(printer.interface).toLowerCase();

  if (iface === "network" || iface === "lan") {
    if (!printer.host) return null;
    return {
      interface: "network",
      host: printer.host,
      port: Number(printer.port) || 9100,
    };
  }

  if (iface === "usb") {
    if (!printer.vendorId || !printer.productId) return null;
    return {
      interface: "usb",
      vendorId: printer.vendorId,
      productId: printer.productId,
    };
  }

  if (iface === "serial") {
    if (!printer.path) return null;
    return {
      interface: "serial",
      path: printer.path,
      baudRate: Number(printer.baudRate) || 9600,
    };
  }

  return null;
}

function toEscAlignment(value) {
  const key = String(value || "left").toLowerCase();
  return ALIGNMENT_ESC_POS[key] || "lt";
}

const ESC_POS_SAFE_CHAR_PATTERN = /[^\x09\x0A\x0D\x20-\x7E₺çğıöşÇĞİÖŞÂâÊêÎîÛûÜüÖöÇçĞğŞşİı]/g;

function sanitizeReceiptText(input) {
  if (!input) return "";
  return String(input)
    .replace(/\r\n/g, "\n")
    // ESC/POS codepages in use (CP1254/CP857) lack the ₺ glyph; replace with ASCII-safe token
    .replace(/\u20ba/g, "TL")
    .replace(/\u200e|\u200f/g, "")
    .replace(ESC_POS_SAFE_CHAR_PATTERN, "?")
    .trimEnd();
}

const PRIVATE_LAN_REGEX = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|169\.254\.)/;

function isPrivateLanHost(host = "") {
  const trimmed = String(host || "").trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed === "localhost" || trimmed.startsWith("127.")) return true;
  return PRIVATE_LAN_REGEX.test(trimmed);
}

function isCashLike(value = "") {
  const normalized = String(value || "").toLowerCase();
  return ["cash", "nakit", "peşin", "pesin"].some((token) => normalized.includes(token));
}

const CUT_CMD = [0x1d, 0x56, 0x00];
const DRAWER_PULSE_CMD = [0x1b, 0x70, 0x00, 0x32, 0x32]; // pin 2, ~50ms

function receiptWidthToPx(widthSetting) {
  if (widthSetting === "80mm") return 576;
  if (widthSetting === "72mm" || widthSetting === "70mm") return 512;
  const numeric = Number(String(widthSetting || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= 75) return 576;
    if (numeric >= 68) return 512; // treat 68-74 as ~70/72mm class
  }
  return 384; // default 58mm
}

function buildEscposBytes(
  text,
  {
    cut = true,
    feedLines = 3,
    alignment = 'left',
    fontSize,
    lineSpacing,
    addressFontSize,
    addressLines = [],
  } = {}
) {
  const normalized = `${text || ""}\n${"\n".repeat(Math.max(0, feedLines))}`;
  const lines = normalized.split("\n");
  const init = [0x1b, 0x40]; // ESC @ reset
  const selectTurkish = [0x1b, 0x74, 19]; // ESC t 19 (CP1254)
  const alignMap = { left: 0x00, center: 0x01, right: 0x02 };
  const alignCmd = [0x1b, 0x61, alignMap[alignment] || 0x00]; // ESC a n
  const cutBytes = cut ? [0x1d, 0x56, 0x00] : [];

  const fontSizeToCmd = (px) => {
    if (!px) return 0x00; // normal
    if (px >= 22) return 0x11; // double width + height
    if (px >= 18) return 0x01; // double height
    return 0x00;
  };

  const sizeCmd = (px) => [0x1d, 0x21, fontSizeToCmd(px)]; // GS ! n
  const baseSize = sizeCmd(fontSize);
  const addressSize = addressFontSize ? sizeCmd(addressFontSize) : baseSize;
  const addressLineSet = new Set(
    Array.isArray(addressLines)
      ? addressLines.map((l) => String(l || "").trim()).filter(Boolean)
      : []
  );

  const spacingCmd =
    typeof lineSpacing === "number" && Number.isFinite(lineSpacing)
      ? [0x1b, 0x33, Math.max(0, Math.min(255, Math.round(30 * lineSpacing)))]
      : null;

  const bytes = [];
  bytes.push(...init, ...selectTurkish, ...alignCmd);
  if (spacingCmd) bytes.push(...spacingCmd);
  bytes.push(...baseSize);

  let currentSize = baseSize[2];
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    const desiredSize = addressLineSet.has(trimmed) ? addressSize : baseSize;
    if (desiredSize[2] !== currentSize) {
      bytes.push(...desiredSize);
      currentSize = desiredSize[2];
    }
    const body = encodeCP1254(`${line}\n`);
    bytes.push(...body);
  }

  bytes.push(...cutBytes);
  return Uint8Array.from(bytes);
}

// Shared receipt math so ESC/POS text and HTML previews use
// exactly the same item/extra totals (including extras × quantity).
export function computeReceiptSummary(order) {
  const baseItems = Array.isArray(order?.items) ? order.items : [];
  const suborderItems = Array.isArray(order?.suborders)
    ? order.suborders.flatMap((so) => so?.items || [])
    : [];

  const rawItems = [...baseItems, ...suborderItems];
  const hasItems = rawItems.length > 0;

  const items = [];
  let subtotal = 0;

  for (const it of rawItems) {
    const name = it.name || it.product_name || "Item";
    const qtyRaw = pickNumber(
      it.qty,
      it.quantity,
      it.count,
      it.amount_quantity,
      it.unit_quantity,
      1
    );
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

    const unitPrice = pickNumber(
      it.price,
      it.unit_price,
      it.unitPrice,
      it.price_per_unit,
      it.price_per_item,
      it.base_price,
      it.product_price
    );

    const baseComponent =
      Number.isFinite(unitPrice) && unitPrice !== null ? unitPrice * qty : 0;

    const extrasDetails = [];
    let extrasPerUnit = 0;

    if (Array.isArray(it.extras)) {
      for (const ex of it.extras) {
        const exName = ex.name || "extra";
        const exQtyRaw = pickNumber(ex.quantity, ex.qty, 1);
        const exQty = Number.isFinite(exQtyRaw) && exQtyRaw > 0 ? exQtyRaw : 1;
        const exUnitPrice = pickNumber(
          ex.price,
          ex.extraPrice,
          ex.unit_price,
          ex.unitPrice,
          ex.amount
        );

        const perUnitExtra =
          Number.isFinite(exUnitPrice) && Number.isFinite(exQty)
            ? exUnitPrice * exQty
            : 0;

        if (Number.isFinite(perUnitExtra)) {
          extrasPerUnit += perUnitExtra;
        }

        const totalForLine =
          Number.isFinite(perUnitExtra) && qty > 0 ? perUnitExtra * qty : 0;

        extrasDetails.push({
          name: exName,
          qty: exQty * qty,
          unitPrice: Number.isFinite(exUnitPrice) ? exUnitPrice : 0,
          total: totalForLine,
        });
      }
    }

    const extrasForQty = Number.isFinite(extrasPerUnit) ? extrasPerUnit * qty : 0;
    const lineTotal = baseComponent + extrasForQty;

    const effectiveUnitPrice =
      Number.isFinite(unitPrice) && unitPrice !== null
        ? unitPrice
        : qty > 0
        ? lineTotal / qty
        : lineTotal;

    subtotal += lineTotal;

    const note =
      (it.note ||
        it.item_note ||
        it.comment ||
        it.notes ||
        "")
        .toString()
        .replace(/\s+/g, " ")
        .trim();

    items.push({
      name,
      qty,
      unitPrice: effectiveUnitPrice,
      lineTotal,
      extrasDetails,
      note,
    });
  }

  let tax = pickNumber(
    order?.tax_value,
    order?.tax,
    order?.tax_total,
    order?.taxTotal,
    order?.vat_amount,
    order?.vat
  );
  if (!Number.isFinite(tax)) tax = 0;

  if (!hasItems) {
    const orderSubtotal = pickNumber(
      order?.subtotal,
      order?.sub_total,
      order?.total_without_tax,
      order?.total_without_vat,
      order?.net_total,
      order?.amount_subtotal
    );

    if ((!Number.isFinite(subtotal) || subtotal <= 0) && Number.isFinite(orderSubtotal)) {
      subtotal = orderSubtotal;
    }

    let orderLevelTotal = pickNumber(
      order?.total_with_tax,
      order?.total_with_vat,
      order?.total,
      order?.grand_total,
      order?.price_total,
      order?.amount_total,
      order?.sum_total
    );

    if (!Number.isFinite(orderLevelTotal) || orderLevelTotal <= 0) {
      orderLevelTotal = null;
    }

    if (orderLevelTotal !== null) {
      if (!Number.isFinite(subtotal) || subtotal <= 0) {
        subtotal = orderLevelTotal;
      }
      if ((!tax || tax <= 0) && Number.isFinite(subtotal) && orderLevelTotal > subtotal) {
        tax = orderLevelTotal - subtotal;
      }
    }
  }

  if (!Number.isFinite(subtotal)) {
    subtotal = 0;
  }

  const finalTotal = subtotal + (Number.isFinite(tax) ? tax : 0);

  return {
    items,
    subtotal,
    tax,
    total: finalTotal,
  };
}

export function renderReceiptText(order, providedLayout) {
  const layout = providedLayout || getReceiptLayout();
  const summary = computeReceiptSummary(order);

  const lines = [];
  const add = (l = "") => lines.push(String(l));

  if (layout.showHeader) {
    const headerLine = layout.headerText || layout.headerTitle || "Beypro POS";
    add(headerLine);
    if (layout.headerSubtitle) add(layout.headerSubtitle);
  }
  if (layout.shopAddress) {
    String(layout.shopAddress)
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => add(l));
  }
  add(new Date(order?.created_at || Date.now()).toLocaleString());
  add(`Order #${order?.id || "-"}`);

  if (layout.showPacketCustomerInfo && (order?.customer || order?.customer_name)) {
    add(`Cust: ${order.customer || order.customer_name}`);
    if (order.customer_phone) add(`Phone: ${order.customer_phone}`);
    if (order.address || order.customer_address) {
      add(
        `Addr: ${(order.address || order.customer_address || "")
          .replace(/\s+/g, " ")
          .trim()}`
      );
    }
  }

  add("--------------------------------");

  for (const item of summary.items) {
    add(
      `${formatQuantity(item.qty)} x ${item.name}  ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`
    );

    for (const detail of item.extrasDetails) {
      add(
        `  + ${formatQuantity(detail.qty)} x ${formatMoney(detail.unitPrice)} ${detail.name}  ${formatMoney(detail.total)}`
      );
    }

    if (item.note) {
      add(`  NOTE: ${item.note}`);
    }
  }

  if (summary.tax > 0) {
    add(`TAX: ${formatMoney(summary.tax)}`);
  }

  add("--------------------------------");
  add(`TOTAL: ${formatMoney(summary.total)}`);
  if (
    (order?.status === "paid" || order?.payment_status === "paid") &&
    order?.payment_method
  ) {
    add(`PAYMENT: ${String(order.payment_method).toUpperCase()}`);
  }

  if (layout.showFooter && layout.footerText) {
    add("--------------------------------");
    add(layout.footerText);
  }
  
  // Add spacing to prevent footer cropping
  add("");
  add("");
  add("");

  return lines.join("\n");
}

export async function printViaBridge(text, orderObj) {

  let resolvedText = text;
  let logoBytes = null;
  let qrBytes = null;
  let layout = null;
  const jobKey =
    orderObj && (orderObj.id || orderObj.order_id)
      ? `order:${orderObj.id || orderObj.order_id}`
      : null;

  // Basic de-duplication: avoid printing the same order multiple times
  // within a very short window from this renderer (covers cases where
  // multiple callers trigger print for the same order almost simultaneously).
  if (typeof window !== "undefined" && jobKey) {
    const orderId = jobKey;
    const now = Date.now();
    if (!window.__beyproPrintGuard) {
      window.__beyproPrintGuard = {};
    }
    const lastTs = window.__beyproPrintGuard[orderId] || 0;
    if (now - lastTs < 1500) {
      console.warn(
        "⚠️ Skipping duplicate printViaBridge call for order within 1.5s window:",
        orderId
      );
      return false;
    }
    window.__beyproPrintGuard[orderId] = now;
  }

  if (orderObj) {
    try {
      const loaded = await ensureReceiptLayout();
      if (!loaded) {
        console.warn("⚠️ Receipt layout is null, will use defaults");
      }
    } catch (err) {
      console.warn("⚠️ Failed to ensure receipt layout before printing:", err?.message || err);
    }
    layout = getReceiptLayout();
    console.log("📝 Printing with layout:", {
      alignment: layout.alignment,
      showFooter: layout.showFooter,
      showLogo: layout.showLogo,
      logoUrl: layout.logoUrl,
      showQr: layout.showQr,
      qrUrl: layout.qrUrl,
      receiptWidth: layout.receiptWidth,
    });
    resolvedText = renderReceiptText(orderObj, layout);
    // Append any custom footer lines configured for this printer
    const customLines =
      printerSettings && Array.isArray(printerSettings.customLines)
        ? printerSettings.customLines.filter((l) => typeof l === "string" && l.trim().length > 0)
        : [];
    if (customLines.length) {
      resolvedText = `${resolvedText}\n\n${customLines.join("\n")}`;
    }
    console.log("📝 Receipt text rendered with customizations (including custom lines)");
  }

  resolvedText = sanitizeReceiptText(resolvedText);
  if (!resolvedText) {
    console.warn("⚠️ No printable receipt content provided.");
    return false;
  }

  // Paper size (width in pixels)
  const widthSetting = layout?.receiptWidth || layout?.paperWidth;
  const paperWidthPx = receiptWidthToPx(widthSetting);

  // Build text bytes with font size, alignment, spacing
  const textBytes = buildEscposBytes(resolvedText, {
    cut: false, // handle cut after logo/QR composition to avoid mid-receipt cuts
    feedLines: 3,
    alignment: layout?.alignment || "left",
    fontSize: layout?.fontSize,
    lineSpacing: layout?.spacing || layout?.lineHeight,
    addressFontSize: layout?.shopAddressFontSize,
    addressLines: layout?.shopAddress
      ? String(layout.shopAddress)
          .replace(/\r/g, "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
  });

  // base64 of text bytes — by default we only send text bytes and let the
  // Electron main process compose logo/QR when using the local desktop bridge.
  const textDataBase64 = toBase64(textBytes);
  const textBase64 = textDataBase64;

  // (Printing will continue after resolving the target below)

  let printerSettings = null;
  try {
    printerSettings = await getPrinterSettingsCached();
    if (!printerSettings) {
      printerSettings = await getPrinterSettingsCached(true);
    }
  } catch (err) {
    console.warn("⚠️ Could not read printer settings:", err?.message || err);
  }

  const candidateIds = [];
  if (printerSettings?.receiptPrinter) candidateIds.push(printerSettings.receiptPrinter);
  if (printerSettings?.kitchenPrinter) candidateIds.push(printerSettings.kitchenPrinter);

  let target = null;
  let discovery = null;

  for (const candidate of candidateIds) {
    if (!candidate) continue;

    target = parseDirectTarget(candidate);
    if (target) break;

    const lanTarget = parseLanTarget(candidate);
    if (lanTarget) {
      target = lanTarget;
      break;
    }

    if (!discovery) {
      try {
        discovery = await getPrinterDiscoveryCached();
        if (!discovery) {
          discovery = await getPrinterDiscoveryCached(true);
        }
      } catch (err) {
        console.warn("⚠️ Printer discovery failed:", err?.message || err);
      }
    }

    if (discovery) {
      target = resolvePrinterFromDiscovery(candidate, discovery);
      if (target) break;
    }
  }

  if (!target) {
    try {
      const register = await getRegisterSettings();
      target = resolvePrinterFromRegister(register?.cashDrawerPrinter);
      if (target) {
        console.log("ℹ️ Falling back to register cash drawer printer for receipts.");
      }
    } catch (err) {
      console.warn("⚠️ Failed to load register settings for printer fallback:", err?.message || err);
    }
  }

  if (!target) {
    console.warn(
      "⚠️ No printer configured for receipts. Update Settings → Printers to select one."
    );
    return false;
  }

  if (target.interface === "network" && !target.host) {
    console.warn("⚠️ Network printer configured without host. Check printer settings.");
    return false;
  }
  if (target.interface === "usb" && (!target.vendorId || !target.productId)) {
    console.warn("⚠️ USB printer configured without vendor/product IDs.");
    return false;
  }
  if (target.interface === "serial" && !target.path) {
    console.warn("⚠️ Serial printer configured without path.");
    return false;
  }

  if (target.interface === "windows" && typeof window !== "undefined" && window.beypro) {
    try {
      console.log("🖨️ Using Windows bridge (printWindows) — sending text bytes and layout to main for composition");
      const res = await window.beypro.printWindows({
        printerName: target.name,
        dataBase64: textBase64,
        layout,
        jobKey,
      });
      if (res?.ok) {
        console.log("✅ Receipt print dispatched via Windows driver");
        return true;
      }
      console.warn("⚠️ Windows driver print reported failure — will not fallback to backend:", res?.error);
      return false;
    } catch (err) {
      console.warn("⚠️ Windows driver print failed — will not fallback to backend:", err?.message || err);
      return false;
    }
  }

  const payload = {
    interface: target.interface,
    content: `${resolvedText}\n\n`,
    encoding: "cp857",
    align: toEscAlignment(printerSettings?.layout?.alignment),
    cut: printerSettings?.defaults?.cut !== false,
    cashdraw: printerSettings?.defaults?.cashDrawer === true,
    layout,
  };

  if (target.interface === "network") {
    payload.host = target.host;
    payload.port = target.port || 9100;
  } else if (target.interface === "usb") {
    payload.vendorId = target.vendorId;
    payload.productId = target.productId;
  } else if (target.interface === "serial") {
    payload.path = target.path;
    if (target.baudRate) payload.baudRate = target.baudRate;
  } else {
    console.warn(`⚠️ Unsupported printer interface: ${target.interface}`);
    return false;
  }

  const paymentLabel =
    orderObj?.payment_method ||
    orderObj?.paymentMethod ||
    (Array.isArray(orderObj?.receipt_methods) ? Object.keys(orderObj.receipt_methods).join("+") : "");
  const shouldPulseDrawer =
    printerSettings?.defaults?.cashDrawer === true && isCashLike(paymentLabel);
  payload.cashdraw = shouldPulseDrawer;

  const localBridge = typeof window !== "undefined" ? window.beypro : null;
  if (
    target.interface === "network" &&
    localBridge?.printNet &&
    (isPrivateLanHost(target.host) || localBridge?.isDesktop === true)
  ) {
    try {
      console.log("🖨️ Using local bridge for LAN printer — sending text bytes and layout to main for composition:", {
        host: target.host,
        port: payload.port || 9100,
      });
      const result = await localBridge.printNet({
        host: target.host,
        port: payload.port || 9100,
        dataBase64: textBase64,
        layout,
        cashdraw: shouldPulseDrawer,
        jobKey,
      });

      if (result?.ok === false) {
        console.warn("⚠️ Local LAN print bridge reported failure — will not fallback to backend:", result?.error);
        return false;
      } else {
        console.log("✅ Receipt print dispatched via local bridge");
        return true;
      }
    } catch (err) {
      console.warn("⚠️ Local LAN print bridge failed — will not fallback to backend:", err?.message || err);
      return false;
    }
  }
  // If we reached here, we will dispatch via backend. In this path we MUST
  // send final raw ESC/POS bytes (logo + text + QR) because the backend will
  // not perform layout composition when `dataBase64` is provided.
  try {
    // Compose logo/QR in renderer for backend submission
    let finalBytes = Array.from(textBytes);
    if (layout?.showLogo && layout?.logoUrl) {
      try {
        const logoBytesLocal = await imageUrlToEscposBytes(layout.logoUrl, paperWidthPx);
        const centerCmd = [0x1b, 0x61, 0x01];
        const leftCmd = [0x1b, 0x61, 0x00];
        finalBytes = Array.from(centerCmd).concat(Array.from(logoBytesLocal)).concat(Array.from(leftCmd)).concat(finalBytes);
      } catch (err) {
        console.warn("⚠️ Failed to load/convert logo for backend print:", err?.message || err);
      }
    }
    if (layout?.showQr && layout?.qrUrl) {
      try {
        const qrBytesLocal = await qrStringToEscposBytes(layout.qrUrl, Math.min(256, paperWidthPx));
        const centerCmd = [0x1b, 0x61, 0x01];
        const leftCmd = [0x1b, 0x61, 0x00];
        finalBytes = finalBytes.concat(Array.from(centerCmd)).concat(Array.from(qrBytesLocal)).concat(Array.from(leftCmd));
      } catch (err) {
        console.warn("⚠️ Failed to generate/convert QR for backend print:", err?.message || err);
      }
    }
    if (shouldPulseDrawer) {
      finalBytes = finalBytes.concat(DRAWER_PULSE_CMD);
    }
    finalBytes = finalBytes.concat(CUT_CMD);

    const finalBase64 = toBase64(Uint8Array.from(finalBytes));

    console.log("🖨️ Dispatching receipt print via backend (final raw bytes):", {
      interface: payload.interface,
      host: payload.host,
      port: payload.port,
      path: payload.path,
      vendorId: payload.vendorId,
      productId: payload.productId,
    });

    const response = await secureFetch("/printer-settings/print", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        dataBase64: finalBase64,
        jobKey,
      }),
    });

    if (response?.ok === false) {
      console.warn("⚠️ Backend printer responded with failure:", response);
      return false;
    }

    console.log("✅ Receipt print job dispatched via backend");
    return true;
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error("❌ Backend receipt print failed:", errMsg);
    if (
      target.interface === "network" &&
      isPrivateLanHost(target.host) &&
      /ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(errMsg)
    ) {
      console.error(
        "⚠️ Cloud backend cannot reach private LAN printer. Ensure Beypro Desktop Bridge is running on the same network or expose the printer over a reachable address."
      );
    }
    return false;
  }
}

export { defaultReceiptLayout };
