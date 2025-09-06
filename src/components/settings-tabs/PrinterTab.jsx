// src/pages/PrinterTab.jsx — CLEANED
// - Step 2 buttons aligned + equal sizing
// - USB printing tools (generic ESC/POS over USB‑Serial via Bridge)
// - Auto‑fallback: if LAN fails or internet goes offline → switch to USB (when enabled)

import React, { useEffect, useMemo, useState } from "react";
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
  get total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
};

const BRIDGE_DEFAULT = "http://127.0.0.1:7777";

/* =================================================================
   SHARED helpers
   ================================================================= */
async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); }
  catch { throw new Error(`Non-JSON from ${url} (HTTP ${r.status})`); }
  if (!r.ok || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

/* =================================================================
   USB PRINTING — BridgeToolsUSB
   ================================================================= */
function BridgeToolsUSB() {
  const [bridgeUrl, setBridgeUrl] = useState(BRIDGE_DEFAULT);
  const safeBridge = useMemo(() => bridgeUrl.replace(/\/+$/, ""), [bridgeUrl]);

  const [ports, setPorts] = useState([]);
  const [selectedPath, setSelectedPath] = useState(localStorage.getItem("usbPath") || "");
  const [baudRate, setBaudRate] = useState(Number(localStorage.getItem("usbBaud") || "9600") || 9600);
  const [status, setStatus] = useState("");

  useEffect(() => { setBridgeUrl(BRIDGE_DEFAULT); }, []);

  const refresh = async () => {
    try {
      const j = await fetchJson(`${safeBridge}/usb/list`, { cache: "no-store" });
      setPorts(j.ports || []);
      if (!selectedPath && j.ports?.[0]?.path) {
        setSelectedPath(j.ports[0].path);
        localStorage.setItem("usbPath", j.ports[0].path);
      }
      setStatus(`Found ${j.ports?.length || 0} device(s).`);
    } catch (e) {
      setStatus(`USB scan failed ❌ ${e.message || e}`);
    }
  };

  const testPrint = async () => {
    if (!selectedPath) return setStatus("Pick a USB device first.");
    try {
      await fetchJson(`${safeBridge}/usb/print-test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedPath, baudRate }),
      });
      setStatus(`Printed via USB ${selectedPath} ✅`);
    } catch (e) {
      setStatus(`USB print failed ❌ ${e.message || e}`);
    }
  };

  return (
    <div className="rounded-xl border bg-white/60 p-4 space-y-3">
      <h3 className="text-xl font-bold">USB Thermal Printer</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="font-semibold">Device</label>
          <select
            className="rounded-xl border p-2 w-full"
            value={selectedPath}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedPath(v);
              localStorage.setItem("usbPath", v);
            }}
          >
            <option value="">{ports.length ? "Select a device" : "No devices"}</option>
            {ports.map(p => (
              <option key={p.path} value={p.path}>
                {p.path} {p.friendlyName ? `(${p.friendlyName})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="font-semibold">Baud Rate</label>
          <input
            type="number"
            className="rounded-xl border p-2 w-full"
            value={baudRate}
            onChange={(e) => {
              const v = Number(e.target.value || "9600") || 9600;
              setBaudRate(v);
              localStorage.setItem("usbBaud", String(v));
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <button onClick={refresh} className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold w-full">
            Scan USB
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <button onClick={testPrint} className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold">
          Test Print (USB)
        </button>
        <span className="text-sm text-gray-700">{status}</span>
      </div>
    </div>
  );
}

/* =================================================================
   LAN PRINTING — BridgeToolsLAN (with fallback hooks)
   ================================================================= */
function BridgeToolsLAN({ onLanFailureFallback }) {
  const { t } = useTranslation();

  const [bridgeUrl, setBridgeUrl] = useState(BRIDGE_DEFAULT);
  const [status, setStatus] = useState("");
  const [bridgeOk, setBridgeOk] = useState(false);

  const [found, setFound] = useState([]);
  const [selectedHost, setSelectedHost] = useState(localStorage.getItem("lanPrinterHost") || "");
  const [selectedPort, setSelectedPort] = useState(Number(localStorage.getItem("lanPrinterPort") || "9100") || 9100);

  const [testing, setTesting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto fallback toggle (LAN → USB)
  const [autoFallbackUsb, setAutoFallbackUsb] = useState(localStorage.getItem("autoFallbackUsb") === "true");

  const safeBridge = useMemo(() => bridgeUrl.replace(/\/+$/, ""), [bridgeUrl]);
  const lockBridgeUrl = () => {
    setBridgeUrl(BRIDGE_DEFAULT);
    localStorage.setItem("lanBridgeUrl", BRIDGE_DEFAULT);
  };
  useEffect(() => { lockBridgeUrl(); }, []);

  // Bridge ping
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

  // Scan all subnets
  const scanAll = async () => {
    const j = await fetchJson(`${safeBridge}/discover?all=1&timeoutMs=2000&concurrency=48`, { cache: "no-store" });
    const list = Array.isArray(j.results) ? j.results : [];
    list.sort((a,b) => {
      const aScore = (a.ports.includes(9100) ? 100 : 0) + (a.sameSubnet === false ? 0 : 10);
      const bScore = (b.ports.includes(9100) ? 100 : 0) + (b.sameSubnet === false ? 0 : 10);
      return bScore - aScore;
    });
    setFound(list);
    return list;
  };

  // Probe selected
  const probeSelected = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    try {
      const j = await fetchJson(`${safeBridge}/probe?host=${encodeURIComponent(selectedHost)}&ports=80,443,8080,8000,8443,9100,9101,515,631&timeoutMs=1200`);
      const openPorts = (j.open || []).map(p => p.port);
      const webOpen = openPorts.some(p => [80,443,8080,8000,8443].includes(p));
      const printOpen = openPorts.includes(9100);
      const same = j.sameSubnet;
      setStatus([
        `Open ports: ${openPorts.length ? openPorts.join(", ") : "none"}.`,
        same === false ? ` ⚠️ Different subnet.` : "",
        printOpen ? " ✅ 9100 open – should print." : " ❌ 9100 closed – enable RAW/JetDirect.",
        webOpen ? " 🌐 Web UI reachable — set DHCP there." : "",
      ].join(""));
      return { webOpen, printOpen, same };
    } catch (e) {
      setStatus("Probe failed ❌ " + (e.message || e));
      return { webOpen:false, printOpen:false, same:null };
    }
  };

  // Open printer UI (Bridge opens OS browser)
  const openPrinterUI = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    try {
      await fetchJson(`${safeBridge}/assist/subnet/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: selectedHost })
      });
      setStatus("Printer page opened. In Network → TCP/IP set Mode = DHCP, save & reboot.");
    } catch (e) {
      setStatus("Open UI failed ❌ " + (e.message || e));
    }
  };

  // Windows rescue flow (temp IP add + open UI)
  const rescuePrinter = async (host) => {
    const target = host || selectedHost;
    if (!target) return setStatus("Select a printer first.");
    try {
      try {
        const addJ = await fetchJson(`${safeBridge}/assist/subnet/add`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ printerHost: target })
        });
        localStorage.setItem("lanTempIp", addJ.tempIp || "");
        localStorage.setItem("lanAdapterAlias", addJ.adapterAlias || "");
        setStatus(`Temp IP ${addJ.tempIp} added on ${addJ.adapterAlias}. Opening printer page…`);
      } catch {}
      await fetchJson(`${safeBridge}/assist/subnet/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: target })
      });
      setStatus("Set DHCP on the printer page, save & reboot. Then press Plug & Print again.");
    } catch (e) {
      setStatus("Rescue failed ❌ " + (e.message || e));
    }
  };

  // Remove temp IP
  const cleanupTemp = async () => {
    try {
      const tempIp = localStorage.getItem("lanTempIp") || "";
      const adapterAlias = localStorage.getItem("lanAdapterAlias") || "";
      if (!tempIp || !adapterAlias) return setStatus("Missing temp IP info. Run Rescue again.");
      await fetchJson(`${safeBridge}/assist/subnet/cleanup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempIp, adapterAlias })
      });
      setStatus("Temporary IP removed ✅");
      localStorage.removeItem("lanTempIp");
      localStorage.removeItem("lanAdapterAlias");
    } catch (e) { setStatus("Cleanup failed ❌ " + (e.message || e)); }
  };

  // Auto-reserve (Pin IP)
  const autoReserve = async () => {
    if (!selectedHost) return setStatus("Select a printer first.");
    setStatus("Trying to pin IP (auto-reserve)…");
    try {
      await fetchJson(`${safeBridge}/router/reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: selectedHost })
      });
      setStatus("Router reservation succeeded ✅");
    } catch {
      setStatus("Auto-reserve not supported on this setup. Opening common router pages…");
      const gateways = ["http://192.168.1.1","http://192.168.0.1","http://10.0.0.1","http://192.168.2.1"];
      gateways.forEach(u => { try { window.open(u, "_blank", "noopener,noreferrer"); } catch {} });
    }
  };

  // LAN test print with optional fallback
  const testPrint = async (host, port) => {
    const h = host || selectedHost;
    const p = port || selectedPort || 9100;
    if (!h) return setStatus("Select a printer first.");
    setTesting(true);
    try {
      await fetchJson(`${safeBridge}/print-raw`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: h, port: p,
          content: "Beypro Test\n1x Burger 195.00\nTOTAL 195.00 TL\n",
          timeoutMs: 15000,
        })
      });
      setStatus(`Printed via ${h}:${p} ✅`);
    } catch (e) {
      setStatus("LAN print failed ❌ " + (e.message || e));
      if (autoFallbackUsb && typeof onLanFailureFallback === "function") {
        onLanFailureFallback();
      }
    } finally { setTesting(false); }
  };

  // Plug & Print flow
  const plugAndPrint = async () => {
    try { await fetchJson(`${safeBridge}/ping`, { cache: "no-store" }); setBridgeOk(true); }
    catch (e) { setBridgeOk(false); setStatus("Bridge offline ❌ Install/run Beypro Bridge, then try again."); return; }

    setStatus("Scanning for printers…");
    let list = [];
    try { list = await scanAll(); } catch (e) { setStatus("Scan failed ❌ " + (e.message || e)); return; }
    if (!list.length) { setStatus("No printers found. Is it powered and connected to the router?"); return; }

    const top = list[0];
    setFound(list);
    setSelectedHost(top.host);
    const pickPort = top.ports.includes(9100) ? 9100 : (top.ports[0] || 9100);
    setSelectedPort(pickPort);
    localStorage.setItem("lanPrinterHost", top.host);
    localStorage.setItem("lanPrinterPort", String(pickPort));

    const sameSubnet = top.sameSubnet !== false;
    if (sameSubnet && top.ports.includes(9100)) {
      setStatus(`Printer found: ${top.host}:${pickPort} ✅ Sending test…`);
      await testPrint(top.host, pickPort);
      return;
    }
    setStatus("Printer is on a different subnet or RAW is closed. Opening its page to set DHCP…");
    await rescuePrinter(top.host);
  };

  return (
    <div className="space-y-4">
      {/* Step 1 — Bridge installers */}
      <div className="rounded-xl border bg-white/60 p-4 space-y-2">
        <h3 className="text-xl font-bold">Step 1 — Install Beypro Bridge</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <a className="px-3 py-2 rounded-xl bg-black text-white text-center" href={`${BACKEND}/bridge/beypro-bridge-mac.zip`}>macOS</a>
          <a className="px-3 py-2 rounded-xl bg-blue-700 text-white text-center" href={`${BACKEND}/bridge/beypro-bridge-win-x64.zip`}>Windows</a>
          <a className="px-3 py-2 rounded-xl bg-gray-800 text-white text-center" href={`${BACKEND}/bridge/beypro-bridge-linux-x64.tar.gz`}>Linux</a>
        </div>
      </div>

     {/* Step 2 — Aligned grid actions */}
<div className="rounded-xl border bg-white/60 p-4 space-y-4">
  <h3 className="text-xl font-bold">Step 2 — Plug & Print (LAN)</h3>

  {/* Fallback toggle */}
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={autoFallbackUsb}
      onChange={e => {
        const v = e.target.checked;
        setAutoFallbackUsb(v);
        localStorage.setItem("autoFallbackUsb", String(v));
      }}
    />
    Auto-fallback to USB if LAN fails or internet is offline
  </label>

{/* --- Buttons: Plug / Detect Bridge / Print Test --- */}
<div className="flex flex-wrap items-center gap-2">
  {(() => {
    const btn =
      "inline-flex items-center justify-center h-11 min-w-[160px] px-4 " +
      "rounded-xl border border-blue-200/60 bg-white/80 text-gray-800 " +
      "hover:bg-blue-50 active:scale-[0.98] shadow-sm transition font-semibold";
    return (
      <>
        <button className={btn} onClick={plugAndPrint}>
          🔌 Plug
        </button>

        <button className={btn} onClick={pingBridge}>
          🌉 Detect Bridge
        </button>

        <button className={btn} onClick={handlePrintTest}>
          🖨️ Print Test
        </button>
      </>
    );
  })()}
</div>




  <span className="text-sm text-gray-700">{status}</span>

  {showAdvanced && (
    <div className="mt-3 space-y-3 rounded-xl border bg-white/70 p-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button
          onClick={() => testPrint()}
          className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow hover:bg-emerald-700 transition"
          disabled={testing}
        >
          {testing ? "Printing…" : "Test Print"}
        </button>

        <button
          onClick={async () => {
            const r = await probeSelected();
            if (!r?.printOpen && autoFallbackUsb && typeof onLanFailureFallback === "function")
              onLanFailureFallback();
          }}
          className="px-4 py-3 rounded-xl bg-slate-700 text-white font-bold shadow hover:bg-slate-800 transition"
        >
          Probe
        </button>

        <button
          onClick={openPrinterUI}
          className="px-4 py-3 rounded-xl bg-slate-700 text-white font-bold shadow hover:bg-slate-800 transition"
        >
          Open Printer UI
        </button>

        <button
          onClick={() => rescuePrinter()}
          className="px-4 py-3 rounded-xl bg-amber-600 text-white font-bold shadow hover:bg-amber-700 transition"
        >
          Rescue (Win)
        </button>

        <button
          onClick={cleanupTemp}
          className="px-4 py-3 rounded-xl bg-gray-600 text-white font-bold shadow hover:bg-gray-700 transition"
        >
          Remove Temp IP
        </button>

        <button
          onClick={autoReserve}
          className="px-4 py-3 rounded-xl bg-indigo-700 text-white font-bold shadow hover:bg-indigo-800 transition"
        >
          Pin IP
        </button>
      </div>

      {/* Advanced input fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
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
        <div className="flex items-end gap-2">
          <button
            onClick={probeSelected}
            className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold w-full"
          >
            Probe
          </button>
        </div>
      </div>
    </div>
  )}
</div>

    </div>
  );
}

/* =================================================================
   MAIN PAGE — PrinterTab
   ================================================================= */
export default function PrinterTab() {
  const { t } = useTranslation();

  const [layout, setLayout] = useState(defaultLayout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [printingMode, setPrintingMode] = useState(localStorage.getItem("printingMode") || "lan");
  const [autoPrintTable, setAutoPrintTable] = useState(localStorage.getItem("autoPrintTable") === "true");
  const [autoPrintPacket, setAutoPrintPacket] = useState(localStorage.getItem("autoPrintPacket") === "true");

  // Load printer settings once
  useEffect(() => {
    fetch(`${API_URL}/api/printer-settings`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (data.layout) setLayout({ ...defaultLayout, ...data.layout }); })
      .catch(() => setError("Could not load printer settings."));
  }, []);

  // Offline auto-switch: when LAN is selected + autoFallback enabled + USB available
  useEffect(() => {
    function handleOnlineChange() {
      const autoFallbackUsb = localStorage.getItem("autoFallbackUsb") === "true";
      const hasUsb = !!localStorage.getItem("usbPath");
      if (!navigator.onLine && printingMode === "lan" && autoFallbackUsb && hasUsb) {
        setPrintingMode("usb");
        localStorage.setItem("printingMode", "usb");
      }
    }
    window.addEventListener("online", handleOnlineChange);
    window.addEventListener("offline", handleOnlineChange);
    handleOnlineChange();
    return () => {
      window.removeEventListener("online", handleOnlineChange);
      window.removeEventListener("offline", handleOnlineChange);
    };
  }, [printingMode]);

  // Browser print preview (unchanged)
  function handlePrintTest() {
    const preview = document.getElementById("printable-receipt");
    if (!preview) return alert("Receipt preview not found!");

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.bottom = "0";
    iframe.style.width = "0"; iframe.style.height = "0"; iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>Test Print</title>
          <style>
            @media print { body { margin:0; background:#fff; } }
            body { font-family: monospace; font-size: ${layout.fontSize}px; line-height: ${layout.lineHeight}; text-align: ${layout.alignment}; }
            .receipt-preview { width: ${layout.receiptWidth === "custom" ? (layout.customReceiptWidth || "70mm") : layout.receiptWidth}; min-height: ${layout.receiptHeight || 400}px; margin:0 auto; }
          </style>
        </head>
        <body>
          <div class="receipt-preview">${preview.innerHTML}</div>
        </body>
      </html>
    `);
    doc.close();
    setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => document.body.removeChild(iframe), 800); }, 300);
  }

  // Layout handlers (fixed spreads)
  const handle = (k, v) => setLayout(prev => ({ ...prev, [k]: v }));
  const handleExtraChange = (i, key, v) => {
    setLayout(prev => {
      const updated = [...prev.extras];
      updated[i] = { ...updated[i], [key]: v };
      return { ...prev, extras: updated };
    });
  };
  const addExtra = () => setLayout(prev => ({ ...prev, extras: [...prev.extras, { label: "", value: "" }] }));
  const removeExtra = (i) => setLayout(prev => ({ ...prev, extras: prev.extras.filter((_, idx) => idx !== i) }));

  // LAN failure → try USB test once, switch mode on success
  const handleLanFailureFallback = async () => {
    try {
      const bridge = BRIDGE_DEFAULT.replace(/\/+$/, "");
      const path = localStorage.getItem("usbPath");
      const baud = Number(localStorage.getItem("usbBaud") || "9600") || 9600;
      if (!path) return;
      await fetchJson(`${bridge}/usb/print-test`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, baudRate: baud }),
      });
      setPrintingMode("usb");
      localStorage.setItem("printingMode", "usb");
    } catch {
      // keep mode; user can check USB panel for errors
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow mb-3">
        🖨️ {t("Printer Settings")}
      </h2>

      {/* Printing mode + auto-print toggles */}
      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="font-bold">Printing Mode</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={printingMode}
              onChange={(e) => { const val = e.target.value; setPrintingMode(val); localStorage.setItem("printingMode", val); }}
            >
              <option value="standard">Standard (Browser Print)</option>
              <option value="kiosk">Kiosk (Silent Print)</option>
              <option value="lan">LAN Thermal (Bridge)</option>
              <option value="usb">USB Thermal (Bridge)</option>
            </select>
            <p className="text-xs text-gray-500">Choose how printing should work on this device. Tip: enable “Auto‑fallback to USB” inside LAN tools.</p>
          </div>

          <div>
            <label className="font-bold">Auto‑print Scope</label>
            <div className="flex flex-col gap-2">
              <label className="flex gap-2 items-center">
                <input type="checkbox" checked={autoPrintTable} onChange={(e) => { setAutoPrintTable(e.target.checked); localStorage.setItem("autoPrintTable", e.target.checked); }} />
                Auto Print Table Orders
              </label>
              <label className="flex gap-2 items-center">
                <input type="checkbox" checked={autoPrintPacket} onChange={(e) => { setAutoPrintPacket(e.target.checked); localStorage.setItem("autoPrintPacket", e.target.checked); }} />
                Auto Print Packet/Delivery Orders
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Tools by mode */}
      {printingMode === "lan" && <BridgeToolsLAN onLanFailureFallback={handleLanFailureFallback} />}
      {printingMode === "usb" && <BridgeToolsUSB />}

      <p className="text-gray-500 mb-4">{t("Customize how your orders are printed. All changes preview live!")}</p>

      {/* Customize print controls */}
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
            <select value={layout.receiptWidth} onChange={(e) => handle("receiptWidth", e.target.value)} className="rounded-xl border border-gray-300 p-2 w-full">
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
              <option value="custom">{t("Custom")}</option>
            </select>
            {layout.receiptWidth === "custom" && (
              <input type="text" className="border rounded-xl p-2 w-full mt-2" placeholder={t("Enter width (e.g. 70mm or 300px)")}
                     value={layout.customReceiptWidth || ""} onChange={(e) => handle("customReceiptWidth", e.target.value)} />
            )}
          </div>

          <div>
            <label className="font-bold flex gap-2 items-center">
              <input type="checkbox" checked={layout.showPacketCustomerInfo} onChange={(e) => handle("showPacketCustomerInfo", e.target.checked)} />
              {t("Show Customer Name, Phone & Address on Packet Receipt")}
            </label>
            <div className="text-xs text-gray-500 pl-7">
              {t("When enabled, the packet/delivery receipt will display the customer's info (name, phone, address) at the top.")}
            </div>
          </div>

          <div>
            <label className="font-bold">{t("Receipt Height (optional)")}</label>
            <input type="text" className="border rounded-xl p-2 w-full" placeholder={t("e.g. 300mm, 1000px, or leave blank for auto")}
                   value={layout.receiptHeight || ""} onChange={(e) => handle("receiptHeight", e.target.value)} />
            <div className="text-xs text-gray-500">{t("Set a fixed height for your receipt (e.g. 300mm, 1000px). Leave blank for auto height.")}</div>
          </div>

          <div>
            <label className="font-bold">{t("Extra Fields")}:</label>
            <div className="space-y-2">
              {layout.extras.map((extra, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="border rounded-xl p-2 flex-1" placeholder={t("Label")}
                         value={extra.label} onChange={(e) => handleExtraChange(i, "label", e.target.value)} />
                  <input className="border rounded-xl p-2 flex-1" placeholder={t("Value")}
                         value={extra.value} onChange={(e) => handleExtraChange(i, "value", e.target.value)} />
                  <button className="px-2 py-1 bg-red-200 text-red-700 rounded-xl font-bold" onClick={() => removeExtra(i)}>✕</button>
                </div>
              ))}
              <button className="mt-2 px-3 py-1 rounded-xl bg-blue-100 text-blue-800 font-bold shadow hover:bg-blue-200 transition" onClick={addExtra}>
                + {t("Add Extra Field")}
              </button>
            </div>
          </div>

          <div>
            <label className="font-bold">{t("Font Size")}:</label>
            <input type="range" min={10} max={24} value={layout.fontSize} onChange={(e) => handle("fontSize", Number(e.target.value))} className="w-full" />
            <div className="text-sm text-gray-400">{layout.fontSize}px</div>
          </div>

          <div>
            <label className="font-bold">{t("Line Height")}:</label>
            <input type="range" min={1} max={2} step={0.05} value={layout.lineHeight} onChange={(e) => handle("lineHeight", Number(e.target.value))} className="w-full" />
            <div className="text-sm text-gray-400">{layout.lineHeight}</div>
          </div>

          <div>
            <label className="font-bold">{t("Text Alignment")}:</label>
            <select value={layout.alignment} onChange={(e) => handle("alignment", e.target.value)} className="rounded-xl border border-gray-300 p-2 w-full">
              <option value="left">{t("Left")}</option>
              <option value="center">{t("Center")}</option>
              <option value="right">{t("Right")}</option>
            </select>
          </div>

          <div className="flex gap-3 items-center mt-2">
            <label className="flex gap-2 items-center"><input type="checkbox" checked={layout.showLogo} onChange={(e) => handle("showLogo", e.target.checked)} />{t("Show Logo")}</label>
            <label className="flex gap-2 items-center"><input type="checkbox" checked={layout.showHeader} onChange={(e) => handle("showHeader", e.target.checked)} />{t("Show Header")}</label>
            <label className="flex gap-2 items-center"><input type="checkbox" checked={layout.showFooter} onChange={(e) => handle("showFooter", e.target.checked)} />{t("Show Footer")}</label>
            <label className="flex gap-2 items-center"><input type="checkbox" checked={layout.showQr} onChange={(e) => handle("showQr", e.target.checked)} />{t("Show QR")}</label>
          </div>

          {layout.showHeader && (<div><label className="font-bold">{t("Header Text")}:</label><input className="border rounded-xl p-2 w-full" value={layout.headerText} onChange={(e) => handle("headerText", e.target.value)} /></div>)}
          {layout.showFooter && (<div><label className="font-bold">{t("Footer Text")}:</label><input className="border rounded-xl p-2 w-full" value={layout.footerText} onChange={(e) => handle("footerText", e.target.value)} /></div>)}

          <button className="px-2 py-2 rounded-xl bg-green-600 text-white font-bold shadow hover:bg-green-700 transition mt-2" onClick={handlePrintTest}>
            Print Test Receipt
          </button>
        </div>

        {/* Live Preview */}
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-6 relative min-h-[450px]">
          <div
            id="printable-receipt"
            style={{
              fontSize: layout.fontSize, lineHeight: layout.lineHeight, textAlign: layout.alignment, fontFamily: "monospace",
              width: layout.receiptWidth === "custom" ? (layout.customReceiptWidth || "70mm") : layout.receiptWidth,
              minHeight: layout.receiptHeight || 400, maxHeight: layout.receiptHeight || "none", height: layout.receiptHeight || "auto",
              margin: "0 auto", overflow: layout.receiptHeight ? "hidden" : "visible",
            }}
          >
            {layout.showLogo && (<div className="flex justify-center mb-2"><img src="/logo192.png" alt="Logo" className="h-10 mb-2" /></div>)}
            {layout.showHeader && <div className="font-bold text-lg mb-2">{layout.headerText}</div>}
            <div className="text-xs whitespace-pre-line mb-2">{layout.shopAddress}</div>
            <div className="text-xs mb-1">{previewOrder.date}</div>
            <div className="mb-1">{t("Order")} #{previewOrder.id}</div>
            {layout.showPacketCustomerInfo && (<>
              <div className="mb-2 font-bold">{previewOrder.customer}</div>
              <div className="mb-2">{previewOrder.address}</div>
              <div className="mb-2">{t("Phone")}: 0555 123 4567</div>
            </>)}
            <hr className="my-2" />
            <div className="mb-2">{previewOrder.items.map((item) => (
              <div key={item.name} className="flex justify-between"><span>{item.qty}x {item.name}</span><span>₺{item.price}</span></div>
            ))}</div>
            <hr className="my-2" />
            <div className="font-bold text-xl mb-2">{t("Total")}: ₺{previewOrder.total}</div>
            <div className="mb-2">{t("Payment")}: {previewOrder.payment}</div>
            {layout.extras.length > 0 && (<div className="mt-4 mb-2 space-y-1">
              {layout.extras.map((ex, i) => ex.label && ex.value ? (
                <div key={i} className="flex justify-between text-xs"><span className="font-semibold">{ex.label}:</span><span>{ex.value}</span></div>
              ) : null)}
            </div>)}
            {layout.showQr && (<div className="flex justify-center mt-3"><img src="https://api.qrserver.com/v1/create-qr-code/?data=https://hurrybey.com&size=80x80" alt="QR" /></div>)}
            {layout.showFooter && <div className="mt-4 text-xs text-gray-500">{layout.footerText}</div>}
          </div>
          <span className="absolute top-3 right-6 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow">Live Preview</span>
        </div>
      </div>

      <button
        className="px-28 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700 transition mt-6"
        disabled={saving}
        onClick={async () => {
          setSaving(true); setError(""); setSuccess(false);
          try {
            const res = await fetch(`${API_URL}/api/printer-settings`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }),
            });
            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Save failed"); }
            setSuccess(true);
          } catch (e) { setError(e.message); }
          finally { setSaving(false); setTimeout(() => setSuccess(false), 1800); }
        }}
      >
        {saving ? "Saving..." : "Save Printer Settings"}
      </button>

      {success && <div className="mt-2 text-green-600 font-bold animate-pulse">Saved!</div>}
      {error && <div className="mt-2 text-red-600 font-bold">{error}</div>}
    </div>
  );
}
