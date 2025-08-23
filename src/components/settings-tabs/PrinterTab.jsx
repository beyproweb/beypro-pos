// src/pages/PrinterTab.jsx
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// Prefer your prod backend when VITE_API_URL is not set
const API_URL = import.meta?.env?.VITE_API_URL || "";
const BACKEND = (API_URL && API_URL.replace(/\/+$/, "")) || "https://pos.beypro.com";

// Default printer layout (keep in sync with backend DEFAULT_LAYOUT)
const defaultLayout = {
  shopAddress: "",
  receiptWidth: "80mm",
  customReceiptWidth: "",
  receiptHeight: "",
  fontSize: 14,
  lineHeight: 1.2,
  alignment: "left",
  showLogo: false,
  showHeader: false,
  showFooter: false,
  showQr: false,
  headerText: "",
  footerText: "",
  showPacketCustomerInfo: false,
  extras: [],
};

// Demo preview order to avoid ReferenceError
const previewOrder = {
  id: 1234,
  date: new Date().toLocaleString(),
  customer: "John Doe",
  address: "Test Mah. No: 5, İzmir",
  payment: "Card",
  items: [
    { name: "Smash Burger", qty: 1, price: 195 },
    { name: "Fries", qty: 1, price: 65 },
  ],
  get total() {
    return this.items.reduce((s, i) => s + i.price * i.qty, 0);
  },
};

// Safe SHOP_ID for API calls
const SHOP_ID_SAFE =
  (typeof SHOP_ID !== "undefined" ? SHOP_ID : (import.meta?.env?.VITE_SHOP_ID || "default"));

// ---------- BridgeTools: LAN discovery + test via local bridge ----------
function BridgeTools() {
  const { t } = useTranslation();

  const [bridgeUrl, setBridgeUrl] = useState(
    localStorage.getItem("lanBridgeUrl") || "http://127.0.0.1:7777"
  );
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);

  // NEW: scan state
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState([]); // [{host, port}]

  // Persist immediately when changed
  const saveBridge = (url) => {
    const clean = (url || "").trim().replace(/\/+$/, "");
    setBridgeUrl(clean);
    localStorage.setItem("lanBridgeUrl", clean);
  };

  const pingBridge = async () => {
    try {
      setStatus("Checking bridge…");
      const r = await fetch(`${bridgeUrl}/ping`, { cache: "no-store" });
      if (!r.ok) throw new Error("Bridge HTTP " + r.status);
      const j = await r.json();
      setStatus(`Bridge online ✅ (${new Date(j.ts || Date.now()).toLocaleTimeString()})`);
    } catch (e) {
      setStatus("Bridge offline ❌ " + (e.message || e));
    }
  };

  // Scan printers on LAN via bridge /discover
  const scanPrinters = async () => {
    setScanning(true);
    setStatus("Scanning LAN for :9100 printers…");
    setFound([]);
    try {
      const u = `${bridgeUrl.replace(/\/+$/, "")}/discover`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("timeout"), 25000);
      const r = await fetch(u, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      if (!r.ok) throw new Error("Scan HTTP " + r.status);
      const j = await r.json();
      const list = Array.isArray(j.results) ? j.results : [];
      setFound(list);
      setStatus(`Found ${list.length} printer(s).`);
    } catch (e) {
      setStatus("Scan failed ❌ " + (e.message || e));
    } finally {
      setScanning(false);
    }
  };

  // Test print via bridge using stored host/port
  const testPrint = async () => {
    try {
      setTesting(true);
      setStatus("Sending test print…");
      const host = (localStorage.getItem("lanPrinterHost") || "").trim();
      const port = Number(localStorage.getItem("lanPrinterPort") || "9100") || 9100;
      if (!host) throw new Error("Set Printer IP first.");
      const body = {
        host,
        port,
        content: "Beypro Test\n1x Burger 195.00\nTOTAL 195.00 TL\n",
        timeoutMs: 15000,
      };
      const r = await fetch(`${bridgeUrl}/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || `Print HTTP ${r.status}`);
      }
      setStatus("Test sent ✅ Check your printer.");
    } catch (e) {
      setStatus("Print failed ❌ " + (e.message || e));
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    // Auto ping on mount
    pingBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Step 1 — Download & Install */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-2">
        <h3 className="text-xl font-bold">Step 1 — Download & Install Beypro Bridge</h3>
        <div className="flex flex-wrap gap-2">
          <a className="px-3 py-2 rounded-xl bg-black text-white"
             href={`${BACKEND}/bridge/beypro-bridge-mac.zip`}>macOS (ZIP)</a>
          <a className="px-3 py-2 rounded-xl bg-blue-700 text-white"
             href={`${BACKEND}/bridge/beypro-bridge-win-x64.zip`}>Windows (ZIP)</a>
          <a className="px-3 py-2 rounded-xl bg-gray-800 text-white"
             href={`${BACKEND}/bridge/beypro-bridge-linux-x64.tar.gz`}>Linux (TAR.GZ)</a>
        </div>
        <p className="text-xs text-gray-600">
          After download, run the included installer to auto-start Bridge on login.
        </p>
      </div>

      {/* Step 2 — Bridge URL */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-2">
        <h3 className="text-xl font-bold">Step 2 — Detect Bridge</h3>
        <div className="flex gap-2">
          <input
            className="rounded-xl border p-2 flex-1"
            value={bridgeUrl}
            onChange={(e) => saveBridge(e.target.value)}
          />
          <button
            type="button"
            onClick={pingBridge}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold"
          >
            {t("Detect Bridge")}
          </button>
        </div>
        <div className="text-sm text-gray-700">{status}</div>
      </div>

      {/* Step 3 — Set Printer & Scan */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-3">
        <h3 className="text-xl font-bold">Step 3 — Set Printer IP / Port</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="font-semibold">Printer IP</label>
            <input
              className="rounded-xl border p-2 w-full"
              placeholder="e.g. 192.168.1.50"
              defaultValue={localStorage.getItem("lanPrinterHost") || ""}
              onChange={(e) => localStorage.setItem("lanPrinterHost", e.target.value.trim())}
            />
          </div>
          <div>
            <label className="font-semibold">Port</label>
            <input
              type="number"
              className="rounded-xl border p-2 w-full"
              placeholder="9100"
              defaultValue={localStorage.getItem("lanPrinterPort") || "9100"}
              onChange={(e) =>
                localStorage.setItem("lanPrinterPort", e.target.value.trim() || "9100")
              }
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={scanPrinters}
              disabled={scanning}
              className="px-3 py-2 rounded-xl bg-purple-600 text-white font-bold disabled:opacity-50"
            >
              {scanning ? "Scanning…" : "Find Printers (Scan)"}
            </button>

            {found.length > 0 && (
              <select
                className="rounded-xl border p-2"
                defaultValue=""
                onChange={(e) => {
                  const host = e.target.value;
                  if (host) {
                    localStorage.setItem("lanPrinterHost", host);
                    setStatus(`Selected ${host} as printer host.`);
                  }
                }}
              >
                <option value="" disabled>Select a printer</option>
                {found.map(({ host, port }) => (
                  <option key={host} value={host}>{host}:{port}</option>
                ))}
              </select>
            )}
          </div>

          <div className="md:col-span-2 text-xs text-gray-600">
            Tip: Set your printer to a <b>Static IP</b> and enable RAW/JetDirect <code>9100</code>.
          </div>
        </div>
      </div>

      {/* Step 4 — Test Print (Bridge direct) */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-2">
        <h3 className="text-xl font-bold">Step 4 — Test Print</h3>
        <button
          type="button"
          onClick={testPrint}
          disabled={testing}
          className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
        >
          {testing ? "Printing…" : "Send Test Ticket"}
        </button>
      </div>
    </div>
  );
}

// ---------- PrinterTab ----------
export default function PrinterTab() {
  const { t } = useTranslation();

  const [layout, setLayout] = useState(defaultLayout);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [autoPrintTable, setAutoPrintTable] = useState(
    localStorage.getItem("autoPrintTable") === "true"
  );
  const [autoPrintPacket, setAutoPrintPacket] = useState(
    localStorage.getItem("autoPrintPacket") === "true"
  );

  // NEW: simple printing mode (no third-party)
  const [printingMode, setPrintingMode] = useState(
    localStorage.getItem("printingMode") || "standard" // 'standard' | 'kiosk' | 'lan'
  );

  // Load saved layout from backend
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/printer-settings/${SHOP_ID}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (data.layout) setLayout({ ...defaultLayout, ...data.layout });
        setError("");
      })
      .catch(() => setError("Could not load printer settings."))
      .finally(() => setLoading(false));
  }, []);

  // Just to show we hear order events here (printing handled globally)
  useEffect(() => {
    const sock = (typeof socket !== "undefined" ? socket : (typeof window !== "undefined" ? window.socket : null));
    if (!sock) return;
    const handler = (payload) => {
      const idForLog =
        payload?.orderId ??
        payload?.id ??
        payload?.order?.id ??
        payload?.order_number ??
        payload?.number ??
        payload;
      console.log("🖨️ [PrinterTab] order_confirmed received:", idForLog, "(preview-only)");
    };
    sock.on("order_confirmed", handler);
    return () => sock.off("order_confirmed", handler);
  }, []);

  // Test print using current preview (browser print path)
  function handlePrintTest() {
    const preview = document.getElementById("printable-receipt");
    if (!preview) return alert("Receipt preview not found!");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Test Print</title>
          <style>
            @media print { body { margin:0; background:#fff; } }
            body {
              font-family: monospace;
              font-size: ${layout.fontSize}px;
              line-height: ${layout.lineHeight};
              text-align: ${layout.alignment};
              background: #fff;
            }
            .receipt-preview {
              width: ${
                layout.receiptWidth === "custom"
                  ? layout.customReceiptWidth || "70mm"
                  : layout.receiptWidth
              };
              min-height: ${layout.receiptHeight || 400}px;
              margin: 0 auto;
              padding: 0;
            }
          </style>
        </head>
        <body>
          <div class="receipt-preview">
            ${preview.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 800);
    }, 300);
  }

  // Handlers for layout form
  const handle = (k, v) => setLayout((prev) => ({ ...prev, [k]: v }));
  const handleExtraChange = (i, key, v) => {
    const updated = [...layout.extras];
    updated[i][key] = v;
    setLayout((prev) => ({ ...prev, extras: updated }));
  };
  const addExtra = () =>
    setLayout((prev) => ({
      ...prev,
      extras: [...prev.extras, { label: "", value: "" }],
    }));
  const removeExtra = (i) =>
    setLayout((prev) => ({
      ...prev,
      extras: prev.extras.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow mb-3">
        🖨️ {t("Printer Settings")}
      </h2>

      {/* Printing Mode + Auto-print scope */}
      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Printing Mode selector */}
          <div className="space-y-2">
            <label className="font-bold">Printing Mode</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={printingMode}
              onChange={(e) => {
                const val = e.target.value;
                setPrintingMode(val);
                localStorage.setItem("printingMode", val);
              }}
            >
              <option value="standard">Standard (Browser Print)</option>
              <option value="kiosk">Kiosk (Silent Print)</option>
              <option value="lan">LAN Thermal (Bridge)</option>
            </select>
            <p className="text-xs text-gray-500">
              Choose how printing should work on this device.
            </p>
          </div>

          {/* Auto-print Scope */}
          <div>
            <label className="font-bold">Auto-print Scope</label>
            <div className="flex flex-col gap-2">
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={autoPrintTable}
                  onChange={(e) => {
                    setAutoPrintTable(e.target.checked);
                    localStorage.setItem("autoPrintTable", e.target.checked);
                  }}
                />
                Auto Print Table Orders
              </label>
              <label className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={autoPrintPacket}
                  onChange={(e) => {
                    setAutoPrintPacket(e.target.checked);
                    localStorage.setItem("autoPrintPacket", e.target.checked);
                  }}
                />
                Auto Print Packet/Delivery Orders
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Show LAN tools when selected (contains scanPrinters definition) */}
      {printingMode === "lan" && <BridgeTools />}

      <p className="text-gray-500 mb-4">
        {t("Customize how your orders are printed. All changes preview live!")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          {/* Shop Address */}
          <div>
            <label className="font-bold">{t("Shop Address")}:</label>
            <textarea
              className="border rounded-xl p-2 w-full font-mono resize-y min-h-[60px]"
              rows={2}
              value={layout.shopAddress}
              onChange={(e) => handle("shopAddress", e.target.value)}
              placeholder={t("Type your shop's printout address here")}
            />
          </div>

          {/* Width */}
          <div>
            <label className="font-bold">{t("Receipt Width")}:</label>
            <select
              value={layout.receiptWidth}
              onChange={(e) => handle("receiptWidth", e.target.value)}
              className="rounded-xl border border-gray-300 p-2 w-full"
            >
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
              <option value="custom">{t("Custom")}</option>
            </select>
            {layout.receiptWidth === "custom" && (
              <input
                type="text"
                className="border rounded-xl p-2 w-full mt-2"
                placeholder={t("Enter width (e.g. 70mm or 300px)")}
                value={layout.customReceiptWidth || ""}
                onChange={(e) => handle("customReceiptWidth", e.target.value)}
              />
            )}
          </div>

          {/* Packet info toggle */}
          <div>
            <label className="font-bold flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showPacketCustomerInfo}
                onChange={(e) =>
                  handle("showPacketCustomerInfo", e.target.checked)
                }
              />
              {t("Show Customer Name, Phone & Address on Packet Receipt")}
            </label>
            <div className="text-xs text-gray-500 pl-7">
              {t(
                "When enabled, the packet/delivery receipt will display the customer's info (name, phone, address) at the top."
              )}
            </div>
          </div>

          {/* Height */}
          <div>
            <label className="font-bold">{t("Receipt Height (optional)")}</label>
            <input
              type="text"
              className="border rounded-xl p-2 w-full"
              placeholder={t("e.g. 300mm, 1000px, or leave blank for auto")}
              value={layout.receiptHeight || ""}
              onChange={(e) => handle("receiptHeight", e.target.value)}
            />
            <div className="text-xs text-gray-500">
              {t(
                "Set a fixed height for your receipt (e.g. 300mm, 1000px). Leave blank for auto height."
              )}
            </div>
          </div>

          {/* Extras */}
          <div>
            <label className="font-bold">{t("Extra Fields")}:</label>
            <div className="space-y-2">
              {layout.extras.map((extra, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Label")}
                    value={extra.label}
                    onChange={(e) =>
                      handleExtraChange(i, "label", e.target.value)
                    }
                  />
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Value")}
                    value={extra.value}
                    onChange={(e) =>
                      handleExtraChange(i, "value", e.target.value)
                    }
                  />
                  <button
                    className="px-2 py-1 bg-red-200 text-red-700 rounded-xl font-bold"
                    onClick={() => removeExtra(i)}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="mt-2 px-3 py-1 rounded-xl bg-blue-100 text-blue-800 font-bold shadow hover:bg-blue-200 transition"
                onClick={addExtra}
              >
                + {t("Add Extra Field")}
              </button>
            </div>
          </div>

          {/* Style controls */}
          <div>
            <label className="font-bold">{t("Font Size")}:</label>
            <input
              type="range"
              min={10}
              max={24}
              value={layout.fontSize}
              onChange={(e) => handle("fontSize", Number(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-400">{layout.fontSize}px</div>
          </div>

          <div>
            <label className="font-bold">{t("Line Height")}:</label>
            <input
              type="range"
              min={1}
              max={2}
              step={0.05}
              value={layout.lineHeight}
              onChange={(e) => handle("lineHeight", Number(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-400">{layout.lineHeight}</div>
          </div>

          <div>
            <label className="font-bold">{t("Text Alignment")}:</label>
            <select
              value={layout.alignment}
              onChange={(e) => handle("alignment", e.target.value)}
              className="rounded-xl border border-gray-300 p-2 w-full"
            >
              <option value="left">{t("Left")}</option>
              <option value="center">{t("Center")}</option>
              <option value="right">{t("Right")}</option>
            </select>
          </div>

          <div className="flex gap-3 items-center mt-2">
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showLogo}
                onChange={(e) => handle("showLogo", e.target.checked)}
              />
              {t("Show Logo")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showHeader}
                onChange={(e) => handle("showHeader", e.target.checked)}
              />
              {t("Show Header")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showFooter}
                onChange={(e) => handle("showFooter", e.target.checked)}
              />
              {t("Show Footer")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showQr}
                onChange={(e) => handle("showQr", e.target.checked)}
              />
              {t("Show QR")}
            </label>
          </div>

          {layout.showHeader && (
            <div>
              <label className="font-bold">{t("Header Text")}:</label>
              <input
                className="border rounded-xl p-2 w-full"
                value={layout.headerText}
                onChange={(e) => handle("headerText", e.target.value)}
              />
            </div>
          )}

          {layout.showFooter && (
            <div>
              <label className="font-bold">{t("Footer Text")}:</label>
              <input
                className="border rounded-xl p-2 w-full"
                value={layout.footerText}
                onChange={(e) => handle("footerText", e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Live Preview */}
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-6 relative min-h-[450px]">
          <div
            id="printable-receipt"
            style={{
              fontSize: layout.fontSize,
              lineHeight: layout.lineHeight,
              textAlign: layout.alignment,
              fontFamily: "monospace",
              width:
                layout.receiptWidth === "custom"
                  ? layout.customReceiptWidth || "70mm"
                  : layout.receiptWidth,
              minHeight: layout.receiptHeight || 400,
              maxHeight: layout.receiptHeight || "none",
              height: layout.receiptHeight || "auto",
              margin: "0 auto",
              overflow: layout.receiptHeight ? "hidden" : "visible",
            }}
          >
            {layout.showLogo && (
              <div className="flex justify-center mb-2">
                <img src="/logo192.png" alt="Logo" className="h-10 mb-2" />
              </div>
            )}

            {layout.showHeader && (
              <div className="font-bold text-lg mb-2">{layout.headerText}</div>
            )}

            <div className="text-xs whitespace-pre-line mb-2">
              {layout.shopAddress}
            </div>
            <div className="text-xs mb-1">{previewOrder.date}</div>
            <div className="mb-1">
              {t("Order")} #{previewOrder.id}
            </div>

            {layout.showPacketCustomerInfo && (
              <>
                <div className="mb-2 font-bold">{previewOrder.customer}</div>
                <div className="mb-2">{previewOrder.address}</div>
                <div className="mb-2">{t("Phone")}: 0555 123 4567</div>
              </>
            )}

            <hr className="my-2" />
            <div className="mb-2">
              {previewOrder.items.map((item) => (
                <div key={item.name} className="flex justify-between">
                  <span>
                    {item.qty}x {item.name}
                  </span>
                  <span>₺{item.price}</span>
                </div>
              ))}
            </div>
            <hr className="my-2" />
            <div className="font-bold text-xl mb-2">
              {t("Total")}: ₺{previewOrder.total}
            </div>
            <div className="mb-2">
              {t("Payment")}: {previewOrder.payment}
            </div>

            {layout.extras.length > 0 && (
              <div className="mt-4 mb-2 space-y-1">
                {layout.extras.map(
                  (ex, i) =>
                    ex.label &&
                    ex.value && (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="font-semibold">{ex.label}:</span>
                        <span>{ex.value}</span>
                      </div>
                    )
                )}
              </div>
            )}

            {layout.showQr && (
              <div className="flex justify-center mt-3">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?data=https://hurrybey.com&size=80x80"
                  alt="QR"
                />
              </div>
            )}

            {layout.showFooter && (
              <div className="mt-4 text-xs text-gray-500">
                {layout.footerText}
              </div>
            )}
          </div>

          <span className="absolute top-3 right-6 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow">
            Live Preview
          </span>
        </div>

        <button
          className="px-2 py-2 rounded-xl bg-green-600 text-white font-bold shadow hover:bg-green-700 transition mt-2"
          onClick={handlePrintTest}
        >
          Print Test Receipt
        </button>
      </div>

      <button
        className="px-28 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700 transition mt-6"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          setError("");
          setSuccess(false);
          try {
            const res = await fetch(`${API_URL}/api/printer-settings/${SHOP_ID}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ layout }),
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Save failed");
            }
            setSuccess(true);
          } catch (e) {
            setError(e.message);
          } finally {
            setSaving(false);
            setTimeout(() => setSuccess(false), 1800);
          }
        }}
      >
        {saving ? "Saving..." : "Save Printer Settings"}
      </button>

      {success && (
        <div className="mt-2 text-green-600 font-bold animate-pulse">Saved!</div>
      )}
      {error && <div className="mt-2 text-red-600 font-bold">{error}</div>}
    </div>
  );
}
