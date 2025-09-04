// src/pages/PrinterTab.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

/* ---------------------- Backend (unchanged) ---------------------- */
const API_URL = (import.meta?.env?.VITE_API_URL || "https://hurrypos-backend.onrender.com").replace(/\/+$/, "");
const BACKEND = "https://pos.beypro.com";

/* ---------------------- Defaults (unchanged) ---------------------- */
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

const previewOrder = {
  id: 1234,
  date: new Date().toLocaleString(),
  customer: "Hurry Bey",
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

const BRIDGE_DEFAULT = "http://127.0.0.1:7777";

/* =================================================================
   SIMPLE LAN PRINTING — BridgeToolsSimple
   ================================================================= */
function BridgeToolsSimple() {
  const { t } = useTranslation();

  // --- State
  const [bridgeUrl, setBridgeUrl] = useState(() => {
    const saved = localStorage.getItem("lanBridgeUrl");
    return saved && saved.startsWith("http") ? BRIDGE_DEFAULT : BRIDGE_DEFAULT;
  });
  const [status, setStatus] = useState("");
  const [bridgeOk, setBridgeOk] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState([]); // [{host, ports:[...], base, sameSubnet}]
  const [selectedHost, setSelectedHost] = useState(localStorage.getItem("lanPrinterHost") || "");
  const [selectedPort, setSelectedPort] = useState(Number(localStorage.getItem("lanPrinterPort") || "9100") || 9100);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // --- Helpers
  const lockBridgeUrl = (val) => {
    // Always lock to local bridge
    setBridgeUrl(BRIDGE_DEFAULT);
    localStorage.setItem("lanBridgeUrl", BRIDGE_DEFAULT);
  };

  async function fetchJson(url, init) {
    const r = await fetch(url, init);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      const head = text.slice(0, 120);
      throw new Error(`Non-JSON from ${url} (HTTP ${r.status}). First bytes: ${head}`);
    }
    if (!r.ok || data?.error) {
      throw new Error(data?.error || `HTTP ${r.status}`);
    }
    return data;
  }

  const safeBridge = useMemo(() => bridgeUrl.replace(/\/+$/, ""), [bridgeUrl]);

  // --- Bridge ping
  const pingBridge = async () => {
    try {
      const j = await fetchJson(`${safeBridge}/ping`, { cache: "no-store" });
      setBridgeOk(true);
      setStatus(`Bridge online ✅ (${new Date(j.ts || Date.now()).toLocaleTimeString()})`);
    } catch (e) {
      setBridgeOk(false);
      setStatus(`Bridge offline ❌ ${e.message || e}`);
    }
  };

  // --- Discover printers (all local subnets)
  const scanPrinters = async () => {
    setScanning(true);
    setStatus("Scanning LAN for printers…");
    setFound([]);
    try {
      const u = `${safeBridge}/discover?all=1&timeoutMs=2000&concurrency=48`;
      const j = await fetchJson(u, { cache: "no-store" });
      const list = Array.isArray(j.results) ? j.results : [];
      // Prefer hosts with 9100 open
      list.sort((a,b) => {
        const a9100 = a.ports.includes(9100) ? 1 : 0;
        const b9100 = b.ports.includes(9100) ? 1 : 0;
        if (b9100 !== a9100) return b9100 - a9100;
        return a.host.localeCompare(b.host);
      });
      setFound(list);
      setStatus(`Found ${list.length} printer(s).`);
      // If nothing selected yet but there is a candidate, preselect first 9100
      if (!selectedHost && list.length) {
        const first = list[0];
        setSelectedHost(first.host);
        localStorage.setItem("lanPrinterHost", first.host);
        if (first.ports?.includes(9100)) {
          setSelectedPort(9100);
          localStorage.setItem("lanPrinterPort", "9100");
        }
      }
    } catch (e) {
      setStatus("Scan failed ❌ " + (e.message || e));
    } finally {
      setScanning(false);
    }
  };

  // --- Probe a single host to see if web is reachable
  const probeSelected = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    try {
      setStatus(`Probing ${selectedHost}…`);
      const u = `${safeBridge}/probe?host=${encodeURIComponent(selectedHost)}&ports=80,443,8080,8000,8443,9100,9101,515,631&timeoutMs=1200`;
      const j = await fetchJson(u, { cache: "no-store" });
      const openPorts = (j.open || []).map(p => p.port);
      const webOpen = openPorts.some(p => [80,443,8080,8000,8443].includes(p));
      const printOpen = openPorts.includes(9100);
      const same = j.sameSubnet;
      setStatus([
        `Open ports: ${openPorts.length ? openPorts.join(", ") : "none"}.`,
        same === false ? ` ⚠️ Different subnet (PC ${j.primaryBase} vs printer ${selectedHost}).` : "",
        printOpen ? " ✅ 9100 open – should print." : " ❌ 9100 closed – check RAW/JetDirect.",
        webOpen ? " 🌐 Web UI reachable — you can open and set DHCP." : "",
      ].join(""));
      return { webOpen, printOpen, same };
    } catch (e) {
      setStatus("Probe failed ❌ " + (e.message || e));
      return { webOpen:false, printOpen:false, same:null };
    }
  };

  // --- Open printer web UI via bridge (OS default browser)
  const openPrinterUI = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    try {
      await fetchJson(`${safeBridge}/assist/subnet/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: selectedHost })
      });
      setStatus("Printer UI opened. In Network → TCP/IP, set Mode = DHCP, save & reboot.");
    } catch (e) {
      setStatus("Open UI failed ❌ " + (e.message || e));
    }
  };

  // --- One-click rescue: add temp IP (Win), open UI, guide; store temp for cleanup
  const rescuePrinter = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    setLoading(true);
    try {
      // 1) Add temp IP (Windows only; if not win will return error gracefully)
      let addOk = false;
      try {
        const addJ = await fetchJson(`${safeBridge}/assist/subnet/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ printerHost: selectedHost })
        });
        addOk = true;
        localStorage.setItem("lanTempIp", addJ.tempIp || "");
        localStorage.setItem("lanAdapterAlias", addJ.adapterAlias || "");
        setStatus(`✅ Temp IP ${addJ.tempIp} set on ${addJ.adapterAlias}.`);
      } catch (e) {
        // Not Windows or elevation issue — continue, we may still reach web port
        setStatus(`Temp IP step skipped/failed: ${e.message}. Trying to open UI…`);
      }

      // 2) Probe & open UI
      await probeSelected();
      await openPrinterUI();

      setStatus((prev) =>
        prev + "  In the page, set DHCP (or set a static in your main LAN), save & reboot. Then click “Remove Temp IP”."
      );
    } catch (e) {
      setStatus("Rescue failed ❌ " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // --- Remove temp IP (Windows)
  const cleanupTemp = async () => {
    setLoading(true);
    try {
      const tempIp = localStorage.getItem("lanTempIp") || "";
      const adapterAlias = localStorage.getItem("lanAdapterAlias") || "";
      if (!tempIp || !adapterAlias) {
        setStatus("Cleanup failed ❌ Missing temp IP info. Run Rescue/Add Temp again.");
        return;
      }
      await fetchJson(`${safeBridge}/assist/subnet/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempIp, adapterAlias })
      });
      setStatus("Temporary IP removed ✅");
      localStorage.removeItem("lanTempIp");
      localStorage.removeItem("lanAdapterAlias");
    } catch (e) {
      setStatus("Cleanup failed ❌ " + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // --- Test print
  const testPrint = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    setTesting(true);
    try {
      await fetchJson(`${safeBridge}/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: selectedHost,
          port: selectedPort || 9100,
          content: "Beypro Test\n1x Burger 195.00\nTOTAL 195.00 TL\n",
          timeoutMs: 15000,
        })
      });
      setStatus("Test sent ✅ Check your printer.");
    } catch (e) {
      setStatus("Print failed ❌ " + (e.message || e));
    } finally {
      setTesting(false);
    }
  };

  // --- Auto ping on mount + lock URL
  useEffect(() => {
    lockBridgeUrl(BRIDGE_DEFAULT);
    pingBridge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- UI
  return (
    <div className="space-y-4">
      {/* Step 1 — Install Bridge */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-2">
        <h3 className="text-xl font-bold">Step 1 — Install Beypro Bridge</h3>
        <div className="flex flex-wrap gap-2">
          <a className="px-3 py-2 rounded-xl bg-black text-white" href={`${BACKEND}/bridge/beypro-bridge-mac.zip`}>macOS (ZIP)</a>
          <a className="px-3 py-2 rounded-xl bg-blue-700 text-white" href={`${BACKEND}/bridge/beypro-bridge-win-x64.zip`}>Windows (ZIP)</a>
          <a className="px-3 py-2 rounded-xl bg-gray-800 text-white" href={`${BACKEND}/bridge/beypro-bridge-linux-x64.tar.gz`}>Linux (TAR.GZ)</a>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={pingBridge} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold">Detect Bridge</button>
          <button onClick={() => lockBridgeUrl(BRIDGE_DEFAULT)} className="px-3 py-2 rounded-xl bg-gray-600 text-white font-bold">Reset Bridge URL</button>
          <span className="text-sm text-gray-700">{status}</span>
        </div>
      </div>

      {/* Step 2 — Plug & Print (Find → Select → Test) */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-3">
        <h3 className="text-xl font-bold">Step 2 — Plug & Print (LAN)</h3>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={scanPrinters}
            disabled={scanning || !bridgeOk}
            className="px-3 py-2 rounded-xl bg-purple-600 text-white font-bold disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Find Printers"}
          </button>

          <button
            onClick={probeSelected}
            disabled={!selectedHost}
            className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold disabled:opacity-50"
          >
            Probe Selected
          </button>

          <button
            onClick={testPrint}
            disabled={!selectedHost || testing}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
          >
            {testing ? "Printing…" : "Send Test Ticket"}
          </button>
        </div>

        {/* Printers list */}
        {found.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="font-semibold">Select a printer</label>
            <select
              className="rounded-xl border p-2"
              value={selectedHost || ""}
              onChange={(e) => {
                const host = e.target.value;
                setSelectedHost(host);
                localStorage.setItem("lanPrinterHost", host);
                // pick a sensible port (prefer 9100 if present in list)
                const x = found.find(f => f.host === host);
                const pick = (x?.ports || []).includes(9100) ? 9100 : (x?.ports?.[0] || 9100);
                setSelectedPort(pick);
                localStorage.setItem("lanPrinterPort", String(pick));
                setStatus(`Selected ${host}:${pick}`);
              }}
            >
              {found.map(({ host, ports, sameSubnet }) => (
                <option key={host} value={host}>
                  {host}:{ports.includes(9100) ? 9100 : (ports[0] || "—")}
                  {sameSubnet === false ? "  (other subnet ⚠️)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* One-click Rescue */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={rescuePrinter}
            disabled={!selectedHost}
            className="px-3 py-2 rounded-xl bg-amber-600 text-white font-bold disabled:opacity-50"
          >
            Rescue Printer (Open UI & Fix)
          </button>
          <button
            onClick={openPrinterUI}
            disabled={!selectedHost}
            className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold disabled:opacity-50"
          >
            Open Printer UI
          </button>
          <button
            onClick={cleanupTemp}
            className="px-3 py-2 rounded-xl bg-gray-600 text-white font-bold"
          >
            Remove Temp IP
          </button>

          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="ml-auto px-3 py-2 rounded-xl bg-gray-200 text-gray-800 font-bold"
          >
            {showAdvanced ? "Hide Advanced" : "Advanced…"}
          </button>
        </div>

        {/* Advanced (optional IP/port override) */}
        {showAdvanced && (
          <div className="rounded-lg border bg-white/70 p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="font-semibold">Printer IP</label>
                <input
                  className="rounded-xl border p-2 w-full"
                  value={selectedHost}
                  onChange={(e) => {
                    const host = e.target.value.trim();
                    setSelectedHost(host);
                    localStorage.setItem("lanPrinterHost", host);
                  }}
                  placeholder="e.g. 192.168.1.50"
                />
              </div>
              <div>
                <label className="font-semibold">Port</label>
                <input
                  type="number"
                  className="rounded-xl border p-2 w-full"
                  value={selectedPort}
                  onChange={(e) => {
                    const p = Number(e.target.value || "9100") || 9100;
                    setSelectedPort(p);
                    localStorage.setItem("lanPrinterPort", String(p));
                  }}
                  placeholder="9100"
                />
              </div>
              <div className="flex items-end">
                <button onClick={probeSelected} className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold w-full">
                  Probe IP
                </button>
              </div>
            </div>
            <div className="text-xs text-gray-600">
              Tip: Printers should be DHCP (recommended) or a static IP in your main LAN. Printing uses RAW/JetDirect (port 9100).
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-sm text-gray-700">{status}</div>
      </div>
    </div>
  );
}

/* =================================================================
   MAIN PAGE — keeps your customize-print section the same
   ================================================================= */
export default function PrinterTab() {
  const { t } = useTranslation();

  const [layout, setLayout] = useState(defaultLayout);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [autoPrintTable, setAutoPrintTable] = useState(localStorage.getItem("autoPrintTable") === "true");
  const [autoPrintPacket, setAutoPrintPacket] = useState(localStorage.getItem("autoPrintPacket") === "true");

  const [printingMode, setPrintingMode] = useState(localStorage.getItem("printingMode") || "lan"); // default to LAN

  // Load saved layout
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/printer-settings`)
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

  // Listen preview-only (unchanged)
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

  // Browser print preview test (unchanged)
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

  // Layout handlers (unchanged)
  const handle = (k, v) => setLayout((prev) => ({ ...prev, [k]: v }));
  const handleExtraChange = (i, key, v) => {
    const updated = [...layout.extras];
    updated[i][key] = v;
    setLayout((prev) => ({ ...prev, extras: updated }));
  };
  const addExtra = () => setLayout((prev) => ({ ...prev, extras: [...prev.extras, { label: "", value: "" }]}));
  const removeExtra = (i) => setLayout((prev) => ({ ...prev, extras: prev.extras.filter((_, idx) => idx !== i) }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow mb-3">
        🖨️ {t("Printer Settings")}
      </h2>

      {/* Printing Mode + Auto-print (kept) */}
      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <p className="text-xs text-gray-500">Choose how printing should work on this device.</p>
          </div>

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

      {/* Show simplified LAN tools by default */}
      {printingMode === "lan" && <BridgeToolsSimple />}

      <p className="text-gray-500 mb-4">
        {t("Customize how your orders are printed. All changes preview live!")}
      </p>

      {/* Customize print (unchanged UI) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
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

          <div>
            <label className="font-bold flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showPacketCustomerInfo}
                onChange={(e) => handle("showPacketCustomerInfo", e.target.checked)}
              />
              {t("Show Customer Name, Phone & Address on Packet Receipt")}
            </label>
            <div className="text-xs text-gray-500 pl-7">
              {t("When enabled, the packet/delivery receipt will display the customer's info (name, phone, address) at the top.")}
            </div>
          </div>

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
              {t("Set a fixed height for your receipt (e.g. 300mm, 1000px). Leave blank for auto height.")}
            </div>
          </div>

          <div>
            <label className="font-bold">{t("Extra Fields")}:</label>
            <div className="space-y-2">
              {layout.extras.map((extra, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Label")}
                    value={extra.label}
                    onChange={(e) => handleExtraChange(i, "label", e.target.value)}
                  />
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Value")}
                    value={extra.value}
                    onChange={(e) => handleExtraChange(i, "value", e.target.value)}
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
              <input type="checkbox" checked={layout.showLogo} onChange={(e) => handle("showLogo", e.target.checked)} />
              {t("Show Logo")}
            </label>
            <label className="flex gap-2 items-center">
              <input type="checkbox" checked={layout.showHeader} onChange={(e) => handle("showHeader", e.target.checked)} />
              {t("Show Header")}
            </label>
            <label className="flex gap-2 items-center">
              <input type="checkbox" checked={layout.showFooter} onChange={(e) => handle("showFooter", e.target.checked)} />
              {t("Show Footer")}
            </label>
            <label className="flex gap-2 items-center">
              <input type="checkbox" checked={layout.showQr} onChange={(e) => handle("showQr", e.target.checked)} />
              {t("Show QR")}
            </label>
          </div>

          {layout.showHeader && (
            <div>
              <label className="font-bold">{t("Header Text")}:</label>
              <input className="border rounded-xl p-2 w-full" value={layout.headerText} onChange={(e) => handle("headerText", e.target.value)} />
            </div>
          )}

          {layout.showFooter && (
            <div>
              <label className="font-bold">{t("Footer Text")}:</label>
              <input className="border rounded-xl p-2 w-full" value={layout.footerText} onChange={(e) => handle("footerText", e.target.value)} />
            </div>
          )}
        </div>

        {/* Live Preview (unchanged) */}
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-6 relative min-h-[450px]">
          <div
            id="printable-receipt"
            style={{
              fontSize: layout.fontSize,
              lineHeight: layout.lineHeight,
              textAlign: layout.alignment,
              fontFamily: "monospace",
              width: layout.receiptWidth === "custom" ? (layout.customReceiptWidth || "70mm") : layout.receiptWidth,
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

            {layout.showHeader && <div className="font-bold text-lg mb-2">{layout.headerText}</div>}

            <div className="text-xs whitespace-pre-line mb-2">{layout.shopAddress}</div>
            <div className="text-xs mb-1">{previewOrder.date}</div>
            <div className="mb-1">{t("Order")} #{previewOrder.id}</div>

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
                  <span>{item.qty}x {item.name}</span>
                  <span>₺{item.price}</span>
                </div>
              ))}
            </div>
            <hr className="my-2" />
            <div className="font-bold text-xl mb-2">{t("Total")}: ₺{previewOrder.total}</div>
            <div className="mb-2">{t("Payment")}: {previewOrder.payment}</div>

            {layout.extras.length > 0 && (
              <div className="mt-4 mb-2 space-y-1">
                {layout.extras.map((ex, i) =>
                  ex.label && ex.value ? (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-semibold">{ex.label}:</span>
                      <span>{ex.value}</span>
                    </div>
                  ) : null
                )}
              </div>
            )}

            {layout.showQr && (
              <div className="flex justify-center mt-3">
                <img src="https://api.qrserver.com/v1/create-qr-code/?data=https://hurrybey.com&size=80x80" alt="QR" />
              </div>
            )}

            {layout.showFooter && <div className="mt-4 text-xs text-gray-500">{layout.footerText}</div>}
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
            const res = await fetch(`${API_URL}/api/printer-settings`, {
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

      {success && <div className="mt-2 text-green-600 font-bold animate-pulse">Saved!</div>}
      {error && <div className="mt-2 text-red-600 font-bold">{error}</div>}
    </div>
  );
}
