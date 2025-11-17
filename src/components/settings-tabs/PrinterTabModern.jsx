import React, { useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";

const DEFAULT_LAYOUT = {
  logoUrl: "",
  showLogo: true,
  headerTitle: "Beypro POS",
  headerSubtitle: "Modern receipts that mirror your brand",
  showHeader: true,
  showFooter: true,
  footerText: "Thank you for your order! / Teşekkürler!",
  showQr: true,
  qrText: "Scan for menu & feedback",
  qrUrl: "https://hurrybey.com",
  alignment: "center",
  paperWidth: "80mm",
  spacing: 1.22,
  itemFontSize: 14,
  taxRate: 18,
  discountRate: 5,
  showTaxes: true,
  showDiscounts: true,
  showItemModifiers: true,
  taxLabel: "Tax",
  discountLabel: "Discount",
};

const DEFAULT_LAN_CONFIG = {
  base: "192.168.1",
  from: 1,
  to: 20,
  hosts: "",
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

function buildEscposBytes(text) {
  const encoder = new TextEncoder();
  const init = Uint8Array.from([0x1b, 0x40]);
  const body = encoder.encode(text.endsWith("\n") ? text : `${text}\n\n`);
  const cut = Uint8Array.from([0x1d, 0x56, 0x00]);
  const bytes = new Uint8Array(init.length + body.length + cut.length);
  bytes.set(init, 0);
  bytes.set(body, init.length);
  bytes.set(cut, init.length + body.length);
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
          <div className="h-16 w-16 rounded-xl bg-slate-900" />
          <div className="text-[9px]">{layout.qrText}</div>
          <div className="text-[8px] text-slate-400">{layout.qrUrl}</div>
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
        ? await window.beypro.getPrinterConfig().catch(() => ({ config: null }))
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

  function handleDefaultChange(field, value) {
    setPrinterConfig((prev) => ({ ...prev, [field]: value }));
  }

  function handleLayoutUpdate(field, value) {
    setPrinterConfig((prev) => ({
      ...prev,
      layout: { ...prev.layout, [field]: value },
    }));
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

  async function handleSaveConfig() {
    setSaving(true);
    setOperationStatus({ level: "idle", message: "Saving printer settings…" });
    const payload = { ...printerConfig };
    try {
      let updated = payload;
      if (hasBridge) {
        const local = await window.beypro.setPrinterConfig(payload);
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
    const targetId = printerConfig.receiptPrinter || printerConfig.kitchenPrinter;
    const target = allPrinters.find((printer) => printer.id === targetId);
    if (!target) {
      setTestStatus({ level: "error", message: "Select a default printer first." });
      return;
    }
    const ticket = buildTestTicket(printerConfig.layout, SAMPLE_ORDER, printerConfig.customLines);
    const bytes = buildEscposBytes(ticket);
    setTestStatus({ level: "idle", message: "Sending test print…" });

    try {
      if (target.type === "windows") {
        if (!hasBridge) throw new Error("Windows printing requires the desktop bridge.");
        const dataBase64 = btoa(String.fromCharCode(...bytes));
        const res = await window.beypro.printWindows({
          printerName: target.meta.name,
          dataBase64,
        });
        if (!res?.ok) {
          throw new Error(res?.error || "Windows driver rejected the job.");
        }
      } else if (target.type === "lan") {
        if (!hasBridge) throw new Error("LAN printing requires the desktop bridge.");
        const dataBase64 = btoa(String.fromCharCode(...bytes));
        const { host, port = 9100 } = target.meta;
        const res = await window.beypro.printNet({
          host,
          port,
          dataBase64,
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
              <ReceiptPreview
                layout={printerConfig.layout}
                order={SAMPLE_ORDER}
                customLines={printerConfig.customLines}
              />
            </div>
            <div className="space-y-3 text-sm text-slate-600">
              <div>
                <label className="text-xs uppercase tracking-wide text-slate-500">Logo URL</label>
                <input
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.logoUrl}
                  onChange={(event) => handleLayoutUpdate("logoUrl", event.target.value)}
                  placeholder="https://example.com/logo.png"
                />
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
                  QR url
                </label>
                <input
                  className="mt-1 w-full rounded-2xl border px-3 py-2 text-sm"
                  value={printerConfig.layout.qrUrl}
                  onChange={(event) => handleLayoutUpdate("qrUrl", event.target.value)}
                />
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
                <span>Windows printers</span>
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
