import React, { useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";
import { imageUrlToEscposBytes } from "../../utils/imageToEscpos";
import { qrStringToEscposBytes } from "../../utils/qrToEscpos";

const DEFAULT_LAYOUT = {
  headerTitle: "Hurrybey Gıda",
  headerSubtitle: "POS Receipt",
  shopAddress: "",
  shopAddressFontSize: 11,
  alignment: "left",
  paperWidth: "58mm",
  spacing: 1.2,
  itemFontSize: 13,
  showHeader: true,
  showFooter: true,
  showLogo: false,
  logoUrl: "",
  showQr: false,
  qrText: "",
  qrUrl: "",
  showTaxes: false,
  taxLabel: "Tax",
  taxRate: 8,
  showDiscounts: false,
  discountLabel: "Discount",
  discountRate: 0,
  footerText: "Thank you for your order!",
};

const createDefaultLayout = () => ({ ...DEFAULT_LAYOUT });
const createDefaultPrinterConfig = () => ({
  receiptPrinter: "",
  kitchenPrinter: "",
  layout: createDefaultLayout(),
  defaults: { cut: true, cashDrawer: false },
  customLines: [],
  lastSynced: null,
});

const SAMPLE_ORDER = {
  store: "Hurrybey Gıda",
  date: new Date().toLocaleString(),
  items: [
    { name: "Smash Burger", qty: 2, price: 185 },
    { name: "Patates (Büyük)", qty: 1, price: 65 },
    { name: "Kola", qty: 2, price: 45 },
  ],
};

const ALIGNMENT_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const PAPER_WIDTH_OPTIONS = ["58mm", "72mm", "80mm"];
const DEFAULT_LAN_CONFIG = {
  base: "",
  from: 1,
  to: 254,
  hosts: "",
};
const LS_KEY_SELECTED_PRINTER = "beyproSelectedPrinter";
const getSelectedPrinterKey = (tenantId) =>
  tenantId ? `${LS_KEY_SELECTED_PRINTER}_${tenantId}` : LS_KEY_SELECTED_PRINTER;
const getLayoutBroadcastKey = (tenantId) =>
  tenantId ? `beypro_receipt_layout_update_${tenantId}` : "beypro_receipt_layout_update";

const STATUS_MAP = {
  idle: { text: "Idle", className: "bg-gray-100 text-gray-700" },
  ok: { text: "Ready", className: "bg-green-100 text-green-800" },
  error: { text: "Error", className: "bg-red-100 text-red-800" },
};

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function formatCurrency(value = 0, symbol = "₺") {
  return `${value.toFixed(2)} ${symbol}`;
}

function mergePrinterConfig(base, override) {
  if (!override) return base;
  const merged = {
    ...base,
    ...override,
    defaults: {
      ...base.defaults,
      ...(override.defaults || {}),
    },
    layout: {
      ...base.layout,
      ...(override.layout || {}),
    },
  };
  if (Array.isArray(override.customLines)) {
    merged.customLines = override.customLines;
  }
  if (override.lastSynced) {
    merged.lastSynced = override.lastSynced;
  }
  return merged;
}

function buildTestTicket(layout, order = SAMPLE_ORDER, customLines = []) {
  const subTotal = order.items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const taxAmount = layout.showTaxes ? (subTotal * (layout.taxRate || 0)) / 100 : 0;
  const discountAmount = layout.showDiscounts ? (subTotal * (layout.discountRate || 0)) / 100 : 0;
  const total = subTotal + taxAmount - discountAmount;

  const lines = [
    "*** BEYPRO TEST TICKET ***",
    layout.headerTitle,
    layout.headerSubtitle,
    "",
    "Items:",
    ...order.items.map(
      (item) => `${item.qty} × ${item.name} - ${formatCurrency(item.qty * item.price)}`
    ),
    "",
    `Subtotal: ${formatCurrency(subTotal)}`,
  ];
  if (layout.showTaxes) {
    lines.push(
      `${layout.taxLabel || "Tax"} (${layout.taxRate || 0}%): ${formatCurrency(
        taxAmount
      )}`
    );
  }
  if (layout.showDiscounts) {
    lines.push(
      `${layout.discountLabel || "Discount"} (${layout.discountRate || 0}%): -${formatCurrency(
        discountAmount
      )}`
    );
  }
  lines.push(`TOTAL: ${formatCurrency(total)}`);
  if (customLines?.length) {
    lines.push("");
    lines.push(...customLines);
  }
  lines.push("", layout.footerText, "", `Printed at ${new Date().toLocaleString()}`);
  return lines.join("\n");
}

// Build ESC/POS bytes with alignment + Turkish codepage (matches receiptPrinter util)
function buildEscposBytes(text, { alignment = "left", cut = true, feedLines = 3 } = {}) {
  const normalized = `${text || ""}\n${"\n".repeat(Math.max(0, feedLines))}`;
  const init = Uint8Array.from([0x1b, 0x40]); // reset
  const selectTurkish = Uint8Array.from([0x1b, 0x74, 19]); // CP1254
  const alignMap = { left: 0x00, center: 0x01, right: 0x02 };
  const alignCmd = Uint8Array.from([0x1b, 0x61, alignMap[alignment] || 0x00]);
  const encoder = new TextEncoder();
  const body = encoder.encode(normalized.endsWith("\n") ? normalized : `${normalized}\n`);
  const cutBytes = cut ? Uint8Array.from([0x1d, 0x56, 0x00]) : new Uint8Array(0);

  const bytes = new Uint8Array(
    init.length + selectTurkish.length + alignCmd.length + body.length + cutBytes.length
  );
  let offset = 0;
  bytes.set(init, offset); offset += init.length;
  bytes.set(selectTurkish, offset); offset += selectTurkish.length;
  bytes.set(alignCmd, offset); offset += alignCmd.length;
  bytes.set(body, offset); offset += body.length;
  bytes.set(cutBytes, offset);
  return bytes;
}

function ReceiptPreview({ layout, order = SAMPLE_ORDER, customLines = [] }) {
  const items = order.items || [];
  const subTotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const taxAmount = layout.showTaxes ? (subTotal * (layout.taxRate || 0)) / 100 : 0;
  const discountAmount = layout.showDiscounts ? (subTotal * (layout.discountRate || 0)) / 100 : 0;
  const total = subTotal + taxAmount - discountAmount;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-inner"
      style={{
        width: 280,
        lineHeight: layout.spacing,
        textAlign: layout.alignment,
        fontSize: layout.itemFontSize,
      }}
    >
      {layout.showLogo ? (
        layout.logoUrl ? (
          <img
            src={layout.logoUrl}
            alt="Logo"
            className="mx-auto mb-3 h-12 w-auto object-contain"
          />
        ) : (
          <div className="mb-3 text-center text-[10px] uppercase tracking-[0.2em] text-slate-500">
            LOGO
          </div>
        )
      ) : null}
      {layout.showHeader && (
        <div className="mb-2 text-center text-sm font-semibold uppercase tracking-wide text-slate-800">
          <div>{layout.headerTitle}</div>
          <div className="text-xs font-normal text-slate-500">{layout.headerSubtitle}</div>
        </div>
      )}
      {layout.shopAddress ? (
        <div
          className="mb-2 text-center text-slate-500"
          style={{ fontSize: layout.shopAddressFontSize || 11 }}
        >
          {layout.shopAddress}
        </div>
      ) : null}
      <div className="border-y border-dashed border-slate-200 py-2 text-[12px]">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between py-1">
            <span>
              {item.qty} × {item.name}
            </span>
            <span>{formatCurrency(item.qty * item.price)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-[12px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(subTotal)}</span>
        </div>
        {layout.showTaxes && (
          <div className="flex justify-between text-slate-600">
            <span>
              {layout.taxLabel} ({layout.taxRate}%)
            </span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>
        )}
        {layout.showDiscounts && (
          <div className="flex justify-between text-slate-600">
            <span>
              {layout.discountLabel} ({layout.discountRate}%)
            </span>
            <span>-{formatCurrency(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
      {customLines?.length > 0 && (
        <div className="mt-3 text-[11px] text-slate-500">
          {customLines.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      )}
      {layout.showQr && (
        <div className="mt-4 flex flex-col items-center gap-1 rounded-2xl border border-dashed border-slate-300 p-3 text-[10px] uppercase text-slate-500">
          {layout.qrUrl && layout.qrUrl.match(/^https?:\/\/.*\.(png|jpg|jpeg)$/i) ? (
            <img
              src={layout.qrUrl}
              alt="QR"
              className="h-16 w-16 rounded-xl object-contain bg-white border"
              style={{ background: '#fff' }}
            />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-slate-900" />
          )}
          <div className="text-[9px]">{layout.qrText}</div>
          {layout.qrUrl && !layout.qrUrl.match(/^https?:\/\/.*\.(png|jpg|jpeg)$/i) && (
            <div className="text-[8px] text-slate-400">{layout.qrUrl}</div>
          )}
        </div>
      )}
      {layout.showFooter && (
        <div className="mt-3 text-center text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {layout.footerText}
        </div>
      )}
    </div>
  );
}

export default function PrinterTab() {
  const tenantId =
    typeof window !== "undefined" ? window.localStorage.getItem("restaurant_id") : null;

  // Helper: open receipt preview in native print dialog
  function openNativePrintPreview() {
    const receiptHtml = document.getElementById('beypro-receipt-preview')?.outerHTML;
    if (!receiptHtml) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Receipt Preview</title><style>body{background:#fff;margin:0;padding:20px;} .rounded-2xl{border-radius:1rem;} .border{border:1px solid #e2e8f0;} .shadow-inner{box-shadow:inset 0 1px 2px #0001;} .text-slate-900{color:#0f172a;} .p-4{padding:1rem;} .mx-auto{margin-left:auto;margin-right:auto;} .mb-3{margin-bottom:.75rem;} .h-12{height:3rem;} .w-auto{width:auto;} .object-contain{object-fit:contain;} .text-center{text-align:center;} .text-sm{font-size:.875rem;} .font-semibold{font-weight:600;} .uppercase{text-transform:uppercase;} .tracking-wide{letter-spacing:.05em;} .text-slate-800{color:#1e293b;} .text-xs{font-size:.75rem;} .font-normal{font-weight:400;} .text-slate-500{color:#64748b;} .border-y{border-top:1px dashed #e2e8f0;border-bottom:1px dashed #e2e8f0;} .py-2{padding-top:.5rem;padding-bottom:.5rem;} .text-[12px]{font-size:12px;} .flex{display:flex;} .justify-between{justify-content:space-between;} .py-1{padding-top:.25rem;padding-bottom:.25rem;} .mt-3{margin-top:.75rem;} .space-y-1 > :not([hidden]) ~ :not([hidden]){margin-top:.25rem;} .text-sm{font-size:.875rem;} .font-semibold{font-weight:600;} .rounded-2xl{border-radius:1rem;} .border-dashed{border-style:dashed;} .border-slate-300{border-color:#cbd5e1;} .p-3{padding:0.75rem;} .text-[10px]{font-size:10px;} .uppercase{text-transform:uppercase;} .tracking-[0.2em]{letter-spacing:0.2em;} .text-slate-500{color:#64748b;} .mt-4{margin-top:1rem;} .flex-col{flex-direction:column;} .items-center{align-items:center;} .gap-1{gap:0.25rem;} .rounded-xl{border-radius:0.75rem;} .bg-slate-900{background:#0f172a;} .text-[9px]{font-size:9px;} .text-[8px]{font-size:8px;} .text-slate-400{color:#94a3b8;} .mt-3{margin-top:.75rem;} .text-center{text-align:center;} .tracking-[0.2em]{letter-spacing:0.2em;} .text-slate-500{color:#64748b;}</style></head><body onload='window.print();'>${receiptHtml}</body></html>`);
    printWindow.document.close();
  }
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [serialPrinters, setSerialPrinters] = useState([]);
  const [windowsPrinters, setWindowsPrinters] = useState([]);
  const [lanScanResults, setLanScanResults] = useState([]);
  const [lanScanning, setLanScanning] = useState(false);
  const [detecting, setDetecting] = useState(true);
  const [printerConfig, setPrinterConfig] = useState(createDefaultPrinterConfig());
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [operationStatus, setOperationStatus] = useState({
    level: "idle",
    message: "Preparing printer workspace…",
  });
  const [testStatus, setTestStatus] = useState({ level: "idle", message: "" });
  const [lanConfig, setLanConfig] = useState({ ...DEFAULT_LAN_CONFIG });
  const [customLineInput, setCustomLineInput] = useState("");
  const [detectedAt, setDetectedAt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const hasBridge = typeof window !== "undefined" && !!window.beypro;

  const allPrinters = useMemo(() => {
    const list = [];
    windowsPrinters.forEach((printer, idx) => {
      list.push({
        id: `windows:${printer.name}:${idx}`,
        label: printer.name,
        type: "windows",
        status: "ready",
        meta: printer,
      });
    });
    usbPrinters.forEach((printer) => {
      list.push({
        id: printer.id,
        label: `USB ${printer.vendorId}/${printer.productId}`,
        type: "usb",
        status: printer.status || "ready",
        meta: printer,
      });
    });
    serialPrinters.forEach((printer) => {
      list.push({
        id: printer.id,
        label: printer.friendlyName || printer.path,
        type: "serial",
        status: printer.status || "ready",
        meta: printer,
      });
    });
    lanScanResults.forEach((printer) => {
      list.push({
        id: `lan:${printer.host}:${printer.port}`,
        label: `${printer.host}:${printer.port}`,
        type: "lan",
        status: printer.ok ? "online" : "offline",
        latency: printer.latency,
        meta: printer,
      });
    });
    return list;
  }, [lanScanResults, serialPrinters, usbPrinters, windowsPrinters]);

  useEffect(() => {
    loadConfig();
    refreshDetections();
  }, []);

  useEffect(() => {
    if (!hasBridge) return undefined;
    const handle = setInterval(refreshWindows, 30000);
    return () => clearInterval(handle);
  }, [hasBridge]);

  async function refreshWindows() {
    if (!hasBridge) return;
    try {
      const list = await window.beypro.getPrinters();
      setWindowsPrinters(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn("Windows printer refresh failed:", err);
    }
  }

  async function loadConfig() {
    setLoadingConfig(true);
    try {
      const local = hasBridge
        ? await window.beypro.getPrinterConfig(tenantId).catch(() => ({ config: null }))
        : { config: null };
      const remote = await secureFetch("/printer-settings/sync").catch((err) => {
        console.warn("Remote printer settings unavailable:", err);
        return null;
      });

      let config = createDefaultPrinterConfig();
      if (remote?.settings) {
        config = mergePrinterConfig(config, remote.settings);
      }
      if (local?.config) {
        const localConfig = local.config;
        const remoteStamp = remote?.settings?.lastSynced || "";
        const localStamp = localConfig.lastSynced || "";
        if (!remote || localStamp > remoteStamp) {
          config = mergePrinterConfig(config, localConfig);
        }
      }
      setPrinterConfig(config);
      // Hydrate address from /me if missing
      if (!config.layout.shopAddress) {
        try {
          const me = await secureFetch("me");
          const userObj = me?.user || me;
          const addr =
            userObj?.pos_location ||
            userObj?.posLocation ||
            userObj?.restaurant_pos_location ||
            userObj?.restaurant?.pos_location;
          if (addr) {
            setPrinterConfig((prev) =>
              mergePrinterConfig(prev, { layout: { ...prev.layout, shopAddress: addr } })
            );
          }
        } catch (err) {
          console.warn("⚠️ Could not hydrate address from /me:", err?.message || err);
        }
      }
      if (!operationStatus.message.includes("Offline")) {
        setOperationStatus({ level: "ok", message: "Printer preferences ready" });
      }
    } catch (err) {
      console.error("Failed to load printer preferences:", err);
      setOperationStatus({ level: "error", message: "Unable to read printer settings" });
    } finally {
      setLoadingConfig(false);
    }
  }

  async function refreshDetections() {
    setDetecting(true);
    try {
      const backend = await secureFetch("/printer-settings/printers");
      setUsbPrinters(backend?.printers?.usb || []);
      setSerialPrinters(backend?.printers?.serial || []);
      await refreshWindows();
      await runLanScan();
      setDetectedAt(new Date().toISOString());
      setOperationStatus({ level: "ok", message: "Printers refreshed" });
    } catch (err) {
      console.error("Printer detection failed:", err);
      setOperationStatus({ level: "error", message: err?.message || "Detection failed" });
    } finally {
      setDetecting(false);
    }
  }

  async function runLanScan(overrides = {}) {
    const payload = {};
    const base = overrides.base ?? lanConfig.base;
    if (base) payload.base = base;
    const from = Number(overrides.from ?? lanConfig.from) || 1;
    const to = Number(overrides.to ?? lanConfig.to) || from;
    payload.from = from;
    payload.to = to;
    const hostsRaw = overrides.hosts ?? lanConfig.hosts;
    if (hostsRaw?.trim()) {
      payload.hosts = hostsRaw
        .split(/[,\\s]+/)
        .map((ip) => ip.trim())
        .filter(Boolean);
    }
    if (!payload.base && !(payload.hosts && payload.hosts.length)) {
      setOperationStatus({
        level: "error",
        message: "Provide a subnet base or explicit hosts to scan.",
      });
      return;
    }

    setLanScanning(true);
    try {
      const data = await secureFetch("/printer-settings/lan-scan", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLanScanResults(Array.isArray(data?.printers) ? data.printers : []);
      setOperationStatus({ level: "ok", message: "LAN scan updated" });
    } catch (err) {
      console.error("LAN scan failed:", err);
      setLanScanResults([]);
      setOperationStatus({ level: "error", message: err?.message || "LAN scan failed" });
    } finally {
      setLanScanning(false);
    }
  }

  function persistReceiptSelection(targetId) {
    if (typeof window === "undefined") return;
    try {
      if (!targetId) {
        localStorage.removeItem(getSelectedPrinterKey(tenantId));
        return;
      }
      const target = allPrinters.find((printer) => printer.id === targetId);
      if (!target) return;
      const printerName = target.meta?.name || target.label || target.id;
      localStorage.setItem(getSelectedPrinterKey(tenantId), printerName);
    } catch (err) {
      console.warn("Failed to persist selected printer:", err);
    }
  }

  function handleDefaultChange(field, value) {
    setPrinterConfig((prev) => ({ ...prev, [field]: value }));
    if (field === "receiptPrinter") {
      persistReceiptSelection(value);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!printerConfig.receiptPrinter) return;
    const target = allPrinters.find((printer) => printer.id === printerConfig.receiptPrinter);
    if (!target) return;
    const desired = target.meta?.name || target.label || target.id;
    const stored = localStorage.getItem(getSelectedPrinterKey(tenantId));
    if (stored !== desired) {
      persistReceiptSelection(printerConfig.receiptPrinter);
    }
  }, [printerConfig.receiptPrinter, allPrinters]);

  // Restore persisted selection when printers are discovered (including LAN)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(getSelectedPrinterKey(tenantId));
      if (!stored) return;

      // Try to find a matching printer by meta.name or label or id.
      // This will succeed for LAN printers where label is "host:port".
      const found = allPrinters.find((p) => {
        const name = p.meta?.name || p.label || p.id;
        return name === stored;
      });

      if (found && printerConfig.receiptPrinter !== found.id) {
        setPrinterConfig((prev) => ({ ...prev, receiptPrinter: found.id }));
        // ensure persisted representation is in sync (will write name)
        persistReceiptSelection(found.id);
      }
    } catch (err) {
      console.warn("Failed to restore persisted printer selection:", err);
    }
    // run whenever discovered printers change or the current selection changes
  }, [allPrinters, printerConfig.receiptPrinter]);

  async function handleLayoutUpdate(field, value) {
    setPrinterConfig((prev) => {
      const next = { ...prev, layout: { ...prev.layout, [field]: value } };
      // Auto-save to backend
      (async () => {
        setOperationStatus({ level: "idle", message: `Saving ${field}…` });
        try {
          const remote = await secureFetch("/printer-settings/sync", {
            method: "POST",
            body: JSON.stringify(next),
          });
          if (remote?.settings) {
            setPrinterConfig((prev2) => mergePrinterConfig(prev2, remote.settings));
            // Broadcast layout update to all tabs for this tenant
            localStorage.setItem(getLayoutBroadcastKey(tenantId), JSON.stringify({
              layout: remote.settings.layout,
              ts: Date.now(),
            }));
          }
          setOperationStatus({ level: "ok", message: `${field} saved.` });
        } catch (err) {
          setOperationStatus({ level: "error", message: `Failed to save ${field}.` });
        }
      })();
      return next;
    });
  }

  function handleToggle(field) {
    setPrinterConfig((prev) => ({
      ...prev,
      layout: { ...prev.layout, [field]: !prev.layout[field] },
    }));
  }

  function addCustomLine() {
    const trimmed = customLineInput.trim();
    if (!trimmed) return;
    setPrinterConfig((prev) => ({
      ...prev,
      customLines: [...prev.customLines, trimmed],
    }));
    setCustomLineInput("");
  }


  function removeCustomLine(index) {
    setPrinterConfig((prev) => {
      const copy = [...prev.customLines];
      copy.splice(index, 1);
      return { ...prev, customLines: copy };
    });
  }

  // Cloudinary upload handler
  async function handleLogoUpload(result) {
    if (result.event === 'success') {
      setLogoUploading(false);
      setLogoError("");
      const url = result.info.secure_url;
      // Update local state
      setPrinterConfig((prev) => ({
        ...prev,
        layout: { ...prev.layout, logoUrl: url },
      }));
      // Save to backend
      setOperationStatus({ level: "idle", message: "Saving logo…" });
      try {
        const payload = { ...printerConfig, layout: { ...printerConfig.layout, logoUrl: url } };
        const remote = await secureFetch("/printer-settings/sync", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (remote?.settings) {
          setPrinterConfig((prev) => mergePrinterConfig(prev, remote.settings));
        }
        setOperationStatus({ level: "ok", message: "Logo saved and synced." });
      } catch (err) {
        setOperationStatus({ level: "error", message: "Failed to save logo." });
      }
    } else if (result.event === 'queues-end') {
      setLogoUploading(false);
    } else if (result.event === 'error') {
      setLogoUploading(false);
      setLogoError('Upload failed. Please try again.');
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    setOperationStatus({ level: "idle", message: "Saving printer settings…" });
    const payload = { ...printerConfig };
    try {
      let updated = payload;
      if (hasBridge) {
        const local = await window.beypro.setPrinterConfig(tenantId, payload);
        if (local?.config) {
          updated = mergePrinterConfig(updated, local.config);
        }
      }
      const remote = await secureFetch("/printer-settings/sync", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (remote?.settings) {
        updated = mergePrinterConfig(updated, remote.settings);
      }
      setPrinterConfig((prev) => mergePrinterConfig(prev, updated));
      setOperationStatus({ level: "ok", message: "Settings saved locally and synced." });
    } catch (err) {
      console.error("Save failed:", err);
      setOperationStatus({ level: "error", message: err?.message || "Saving failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    // Only open the native print preview in web (no desktop bridge).
    if (!hasBridge) openNativePrintPreview();
    const targetId = printerConfig.receiptPrinter || printerConfig.kitchenPrinter;
    const target = allPrinters.find((printer) => printer.id === targetId);
    if (!target) {
      setTestStatus({ level: "error", message: "Select a default printer first." });
      return;
    }
    const layout = printerConfig.layout;
    const ticket = buildTestTicket(layout, SAMPLE_ORDER, printerConfig.customLines);
    const textBytes = buildEscposBytes(ticket, {
      alignment: layout.alignment || "left",
    });
    const textBase64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(textBytes).toString("base64")
        : btoa(String.fromCharCode(...textBytes));
    let finalBase64 = textBase64;
    let paperWidthPx = 384;
    if (layout.paperWidth === "80mm") paperWidthPx = 576;
    if (layout.paperWidth === "72mm") paperWidthPx = 512;
    // Decide composition strategy: if using desktop bridge for printing (windows/lan),
    // send text bytes + layout so Electron main composes logo/QR.
    // If no bridge or printing via backend/USB/Serial, compose images here and send final raw bytes.
    setTestStatus({ level: "idle", message: "Sending test print…" });

    try {
      if (target.type === "windows") {
        if (!hasBridge) throw new Error("Windows printing requires the desktop bridge.");
        const res = await window.beypro.printWindows({
          printerName: target.meta.name,
          dataBase64: textBase64,
          layout: printerConfig.layout,
        });
        if (!res?.ok) {
          throw new Error(res?.error || "Windows driver rejected the job.");
        }
      } else if (target.type === "lan") {
        if (!hasBridge) throw new Error("LAN printing requires the desktop bridge.");
        const { host, port = 9100 } = target.meta;
        const res = await window.beypro.printNet({
          host,
          port,
          dataBase64: textBase64,
          layout: printerConfig.layout,
        });
        if (!res?.ok) {
          throw new Error(res?.error || "LAN printer did not respond.");
        }
      } else {
        const payload = {
          interface: target.type === "usb" ? "usb" : "serial",
          content: ticket,
          encoding: "cp857",
          align:
            printerConfig.layout.alignment === "center"
              ? "ct"
              : printerConfig.layout.alignment === "right"
              ? "rt"
              : "lt",
          cut: printerConfig.defaults.cut,
          cashdraw: printerConfig.defaults.cashDrawer,
          dataBase64: finalBase64,
        };
        if (target.type === "usb") {
          payload.vendorId = target.meta.vendorId;
          payload.productId = target.meta.productId;
        } else if (target.type === "serial") {
          payload.path = target.meta.path;
        }
        await secureFetch("/printer-settings/print", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setTestStatus({ level: "ok", message: `Test print uploaded to ${target.label}` });
    } catch (err) {
      console.error("Test print error:", err);
      setTestStatus({ level: "error", message: err?.message || "Test print failed" });
    }
  }

  const readyCount = allPrinters.filter(
    (printer) => printer.status === "ready" || printer.status === "online"
  ).length;

  const lastSyncedLabel = printerConfig.lastSynced
    ? new Date(printerConfig.lastSynced).toLocaleString()
    : "Never";

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 w-full max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Printers</h1>
            <p className="text-sm text-slate-500">
              Configure detection, defaults, and receipt templates with a single unified workflow.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-2xl border px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400"
              onClick={refreshDetections}
              disabled={detecting}
            >
              {detecting ? "Detecting…" : "Refresh all"}
            </button>
            <span
              className={classNames(
                "rounded-2xl px-3 py-1 text-xs font-semibold",
                STATUS_MAP[operationStatus.level]?.className || STATUS_MAP.idle.className
              )}
            >
              {operationStatus.message}
            </span>
          </div>
        </div>
        {!hasBridge && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Printer discovery and Windows/LAN printing are only available inside the desktop app.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Default printers</h2>
              <p className="text-xs text-slate-500">
                Choose where receipts and kitchen orders land. Saved locally and synced to the backend.
              </p>
            </div>
            <span className="text-xs text-slate-400">Ready slots: {readyCount}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Receipt printer
              </label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                value={printerConfig.receiptPrinter}
                onChange={(event) => handleDefaultChange("receiptPrinter", event.target.value)}
              >
                <option value="">Manual / none</option>
                {allPrinters.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.label} [{printer.type.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kitchen printer
              </label>
              <select
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                value={printerConfig.kitchenPrinter}
                onChange={(event) => handleDefaultChange("kitchenPrinter", event.target.value)}
              >
                <option value="">Manual / none</option>
                {allPrinters.map((printer) => (
                  <option key={`k-${printer.id}`} value={printer.id}>
                    {printer.label} [{printer.type.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
            <button
              className="flex-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              onClick={handleSaveConfig}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save & sync settings"}
            </button>
            <button
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm"
              onClick={handleTestPrint}
            >
              🧾 Test print
            </button>
          </div>
          {testStatus.message && (
            <p
              className={classNames(
                "mt-2 text-xs font-semibold",
                testStatus.level === "error" ? "text-red-600" : "text-emerald-700"
              )}
            >
              {testStatus.message}
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Receipt customization</h2>
            <span className="text-xs text-slate-400">Preview live updates</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
            <div className="flex justify-center">
              <div id="beypro-receipt-preview">
                <ReceiptPreview
                  layout={printerConfig.layout}
                  order={SAMPLE_ORDER}
                  customLines={printerConfig.customLines}
                />
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Shop Logo</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold"
                  disabled={logoUploading}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setLogoUploading(true);
                    setLogoError("");
                    try {
                      const formData = new FormData();
                      formData.append("file", file);
                      const data = await secureFetch("/upload", {
                        method: "POST",
                        body: formData,
                      });
                      if (!data || !data.url) {
                        setLogoError("Image upload failed!");
                        setLogoUploading(false);
                        return;
                      }
                      setPrinterConfig((prev) => ({
                        ...prev,
                        layout: { ...prev.layout, logoUrl: data.url },
                      }));
                      // Save to backend
                      setOperationStatus({ level: "idle", message: "Saving logo…" });
                      try {
                        const payload = { ...printerConfig, layout: { ...printerConfig.layout, logoUrl: data.url } };
                        const remote = await secureFetch("/printer-settings/sync", {
                          method: "POST",
                          body: JSON.stringify(payload),
                        });
                        if (remote?.settings) {
                          setPrinterConfig((prev) => mergePrinterConfig(prev, remote.settings));
                        }
                        setOperationStatus({ level: "ok", message: "Logo saved and synced." });
                      } catch (err) {
                        setOperationStatus({ level: "error", message: "Failed to save logo." });
                      }
                      setLogoUploading(false);
                    } catch (err) {
                      setLogoError("Image upload failed!");
                      setLogoUploading(false);
                    }
                  }}
                />
                <div className="text-xs text-slate-400 mt-1">PNG/JPG, max 2MB, square preferred</div>
                {logoUploading && (
                  <div className="mt-2 text-xs text-blue-600">Uploading…</div>
                )}
                {printerConfig.layout.logoUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={printerConfig.layout.logoUrl} alt="Logo preview" className="h-10 w-auto rounded border" />
                    <span className="text-xs text-slate-400">Preview</span>
                  </div>
                )}
                {logoError && (
                  <div className="mt-2 text-xs text-red-600">{logoError}</div>
                )}
                <label className="mt-2 block text-xs uppercase tracking-wide text-slate-500">
                  Header title
                </label>
                <input
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.headerTitle}
                  onChange={(event) => handleLayoutUpdate("headerTitle", event.target.value)}
                />
                <label className="mt-2 block text-xs uppercase tracking-wide text-slate-500">
                  Header subtitle
                </label>
                <input
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.headerSubtitle}
                  onChange={(event) => handleLayoutUpdate("headerSubtitle", event.target.value)}
                />
                <label className="mt-2 block text-xs uppercase tracking-wide text-slate-500">
                  Address
                </label>
                <textarea
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  rows={2}
                  value={printerConfig.layout.shopAddress}
                  onChange={(event) => handleLayoutUpdate("shopAddress", event.target.value)}
                  placeholder="123 Street, City"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs uppercase tracking-wide text-slate-500">Alignment</label>
                <select
                  className="rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.alignment}
                  onChange={(event) => handleLayoutUpdate("alignment", event.target.value)}
                >
                  {ALIGNMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <label className="text-xs uppercase tracking-wide text-slate-500">Paper</label>
                <select
                  className="rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.paperWidth}
                  onChange={(event) => handleLayoutUpdate("paperWidth", event.target.value)}
                >
                  {PAPER_WIDTH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">Spacing</label>
                  <input
                    type="range"
                    min={0.9}
                    max={1.7}
                    step={0.05}
                    className="w-full"
                    value={printerConfig.layout.spacing}
                    onChange={(event) => handleLayoutUpdate("spacing", Number(event.target.value))}
                  />
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {printerConfig.layout.spacing.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">Font size</label>
                  <input
                    type="range"
                    min={10}
                    max={20}
                    step={1}
                    className="w-full"
                    value={printerConfig.layout.itemFontSize}
                    onChange={(event) =>
                      handleLayoutUpdate("itemFontSize", Number(event.target.value))
                    }
                  />
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {printerConfig.layout.itemFontSize}px
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">
                    Address font size
                  </label>
                  <input
                    type="range"
                    min={9}
                    max={18}
                    step={1}
                    className="w-full"
                    value={printerConfig.layout.shopAddressFontSize || 11}
                    onChange={(event) =>
                      handleLayoutUpdate("shopAddressFontSize", Number(event.target.value))
                    }
                  />
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    {(printerConfig.layout.shopAddressFontSize || 11)}px
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">Tax rate %</label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                    value={printerConfig.layout.taxRate}
                    onChange={(event) => handleLayoutUpdate("taxRate", Number(event.target.value))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-slate-500">
                    Discount rate %
                  </label>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                    value={printerConfig.layout.discountRate}
                    onChange={(event) =>
                      handleLayoutUpdate("discountRate", Number(event.target.value))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-3 text-xs">
                {[
                  { label: "Show header", key: "showHeader" },
                  { label: "Show footer", key: "showFooter" },
                  { label: "Show logo", key: "showLogo" },
                  { label: "Show QR", key: "showQr" },
                  { label: "Show taxes", key: "showTaxes" },
                  { label: "Show discounts", key: "showDiscounts" },
                ].map((toggle) => (
                  <label key={toggle.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={printerConfig.layout[toggle.key]}
                      onChange={() => handleToggle(toggle.key)}
                    />
                    {toggle.label}
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">QR label</label>
                <input
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.qrText}
                  onChange={(event) => handleLayoutUpdate("qrText", event.target.value)}
                />
                <label className="mt-2 block text-xs uppercase tracking-wide text-slate-500">
                  QR url or image
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    className="flex-1 rounded-2xl border px-3 py-2 text-sm"
                    value={printerConfig.layout.qrUrl}
                    onChange={(event) => handleLayoutUpdate("qrUrl", event.target.value)}
                    placeholder="Paste QR URL or upload image"
                  />
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="w-32 text-xs"
                    style={{ minWidth: 0 }}
                    disabled={logoUploading}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      setLogoUploading(true);
                      setLogoError("");
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        const data = await secureFetch("/upload", {
                          method: "POST",
                          body: formData,
                        });
                        if (!data || !data.url) {
                          setLogoError("QR image upload failed!");
                          setLogoUploading(false);
                          return;
                        }
                        setPrinterConfig((prev) => ({
                          ...prev,
                          layout: { ...prev.layout, qrUrl: data.url },
                        }));
                        // Save to backend
                        setOperationStatus({ level: "idle", message: "Saving QR image…" });
                        try {
                          const payload = { ...printerConfig, layout: { ...printerConfig.layout, qrUrl: data.url } };
                          const remote = await secureFetch("/printer-settings/sync", {
                            method: "POST",
                            body: JSON.stringify(payload),
                          });
                          if (remote?.settings) {
                            setPrinterConfig((prev) => mergePrinterConfig(prev, remote.settings));
                          }
                          setOperationStatus({ level: "ok", message: "QR image saved and synced." });
                        } catch (err) {
                          setOperationStatus({ level: "error", message: "Failed to save QR image." });
                        }
                        setLogoUploading(false);
                      } catch (err) {
                        setLogoError("QR image upload failed!");
                        setLogoUploading(false);
                      }
                    }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">Paste a QR code URL or upload a QR image (PNG/JPG, max 2MB)</div>
                {printerConfig.layout.qrUrl && printerConfig.layout.qrUrl.match(/^https?:\/\/.+\.(png|jpg|jpeg)$/i) && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={printerConfig.layout.qrUrl} alt="QR preview" className="h-10 w-auto rounded border" />
                    <span className="text-xs text-slate-400">QR Preview</span>
                  </div>
                )}
                {logoError && (
                  <div className="mt-2 text-xs text-red-600">{logoError}</div>
                )}
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Footer text</label>
                <textarea
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  rows={2}
                  value={printerConfig.layout.footerText}
                  onChange={(event) => handleLayoutUpdate("footerText", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-slate-500">Custom lines</span>
                  <button
                    className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 transition hover:text-slate-600"
                    type="button"
                    onClick={() => setPrinterConfig((prev) => ({ ...prev, customLines: [] }))}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-2xl border px-3 py-2 text-sm"
                    value={customLineInput}
                    onChange={(event) => setCustomLineInput(event.target.value)}
                    placeholder="Add footer reminder"
                  />
                  <button
                    className="rounded-2xl border px-3 py-2 text-xs font-semibold text-slate-600"
                    type="button"
                    onClick={addCustomLine}
                  >
                    Add
                  </button>
                </div>
                <ul className="max-h-32 space-y-1 overflow-auto text-[12px] text-slate-600">
                  {printerConfig.customLines.length ? (
                    printerConfig.customLines.map((line, idx) => (
                      <li
                        key={`${line}-${idx}`}
                        className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-1"
                      >
                        <span>{line}</span>
                        <button
                          className="text-[11px] font-semibold tracking-wide text-red-500"
                          onClick={() => removeCustomLine(idx)}
                        >
                          Remove
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">No custom lines yet.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Detection overview</h2>
              <p className="text-sm text-slate-500">
                {readyCount} ready out of {allPrinters.length} discovered printers.
                {detectedAt && ` Last scan ${new Date(detectedAt).toLocaleTimeString()}.`}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {loadingConfig ? "Loading prefs…" : `Synced: ${lastSyncedLabel}`}
            </span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>Windows and printers</span>
                <span className="text-xs text-slate-500">{windowsPrinters.length} detected</span>
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {windowsPrinters.length ? (
                  windowsPrinters.map((printer, idx) => (
                    <div
                      key={`${printer.name}-${idx}`}
                      className="rounded-xl border bg-slate-50 px-3 py-2"
                    >
                      <div className="font-semibold">{printer.name}</div>
                      <div className="text-[10px] text-slate-500">
                        Default: {printer.isDefault ? "Yes" : "No"}
                      </div>
                    </div>
                  ))
                ) : (
                  <p>No Windows printers found.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>USB + Serial (ESC/POS)</span>
                <span className="text-xs text-slate-500">
                  {usbPrinters.length + serialPrinters.length}
                </span>
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {usbPrinters.map((printer) => (
                  <div key={printer.id} className="rounded-xl border bg-slate-50 px-3 py-2">
                    <div className="font-semibold">
                      USB {printer.vendorId}/{printer.productId}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Status: {printer.status || "ready"}
                    </div>
                  </div>
                ))}
                {serialPrinters.map((printer) => (
                  <div key={printer.id} className="rounded-xl border bg-slate-50 px-3 py-2">
                    <div className="font-semibold">{printer.path}</div>
                    <div className="text-[10px] text-slate-500">
                      {printer.friendlyName || printer.manufacturer || "Serial device"}
                    </div>
                  </div>
                ))}
                {!usbPrinters.length && !serialPrinters.length && (
                  <p>No ESC/POS devices detected.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>LAN Discovery</span>
                <span className="text-xs text-slate-500">{lanScanResults.length || "No"}</span>
              </div>
              <div className="mt-3 grid gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    className="w-full rounded-xl border px-3 py-1 text-xs"
                    value={lanConfig.base}
                    onChange={(event) =>
                      setLanConfig((prev) => ({ ...prev, base: event.target.value }))
                    }
                    placeholder="Subnet base (e.g. 192.168.1)"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    className="w-1/2 rounded-xl border px-3 py-1 text-xs"
                    type="number"
                    min={1}
                    max={254}
                    value={lanConfig.from}
                    onChange={(event) =>
                      setLanConfig((prev) => ({ ...prev, from: event.target.value }))
                    }
                    placeholder="From"
                  />
                  <input
                    className="w-1/2 rounded-xl border px-3 py-1 text-xs"
                    type="number"
                    min={1}
                    max={254}
                    value={lanConfig.to}
                    onChange={(event) =>
                      setLanConfig((prev) => ({ ...prev, to: event.target.value }))
                    }
                    placeholder="To"
                  />
                </div>
                <input
                  className="rounded-2xl border px-3 py-1 text-xs"
                  value={lanConfig.hosts}
                  onChange={(event) =>
                    setLanConfig((prev) => ({ ...prev, hosts: event.target.value }))
                  }
                  placeholder="Explicit hosts (comma separated)"
                />
                <button
                  className="rounded-2xl border px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400"
                  onClick={() => runLanScan()}
                  disabled={lanScanning}
                >
                  {lanScanning ? "Scanning…" : "Scan LAN"}
                </button>
                <div className="max-h-40 overflow-auto rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-2 text-[11px]">
                  {lanScanResults.length ? (
                    lanScanResults.map((printer) => (
                      <div
                        key={`${printer.host}:${printer.port}`}
                        className="flex items-center justify-between border-b border-slate-200 py-1 last:border-none"
                      >
                        <div>
                          <div className="font-semibold">
                            {printer.host}:{printer.port}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {printer.ok
                              ? `Responded ${printer.latency}ms`
                              : printer.error || "Offline"}
                          </div>
                        </div>
                        <span
                          className={classNames(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            printer.ok
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {printer.ok ? "Online" : "Offline"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400">LAN scan results appear here.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
