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
// add inside BridgeToolsSimple, next to other handlers
const plugAndPrint = async () => {
  // lock bridge + ping
  try { lockBridgeUrl(BRIDGE_DEFAULT); } catch {}
  setStatus("Checking bridge…");
  try {
    await fetchJson(`${safeBridge}/ping`, { cache: "no-store" });
    setBridgeOk(true);
  } catch (e) {
    setBridgeOk(false);
    setStatus("Bridge offline ❌ Please install/run Beypro Bridge, then try again.");
    return;
  }

  // scan
  setStatus("Scanning for printers…");
  let list = [];
  try {
    const j = await fetchJson(`${safeBridge}/discover?all=1&timeoutMs=2000&concurrency=48`);
    list = Array.isArray(j.results) ? j.results : [];
  } catch (e) {
    setStatus("Scan failed ❌ " + (e.message || e));
    return;
  }
  if (!list.length) {
    setStatus("No printers found. Make sure the printer is on and connected to the router.");
    return;
  }

  // pick best candidate: 9100 + sameSubnet first
  const scored = list
    .map(x => ({
      ...x,
      score: (x.ports.includes(9100) ? 100 : 0) + (x.sameSubnet === false ? 0 : 10)
    }))
    .sort((a,b) => b.score - a.score);

  const chosen = scored[0];
  setFound(list); // optional: keep list for Advanced selector
  setSelectedHost(chosen.host);
  const pickPort = chosen.ports.includes(9100) ? 9100 : (chosen.ports[0] || 9100);
  setSelectedPort(pickPort);
  localStorage.setItem("lanPrinterHost", chosen.host);
  localStorage.setItem("lanPrinterPort", String(pickPort));

  // same subnet & 9100 open → print now
  if (chosen.score >= 110) {
    setStatus(`Printer found: ${chosen.host}:${pickPort} ✅ Sending test…`);
    try {
      await fetchJson(`${safeBridge}/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: chosen.host,
          port: pickPort,
          content: "Beypro Test\n1x Burger 195.00\nTOTAL 195.00 TL\n",
          timeoutMs: 15000,
        })
      });
      setStatus(`All set 🎉 Printed via ${chosen.host}:${pickPort}.`);
      return;
    } catch (e) {
      setStatus("Test print failed ❌ " + (e.message || e));
      return;
    }
  }

  // otherwise: rescue flow (Windows) + open UI + guidance
  setStatus("Printer is on another subnet or 9100 is closed. Running Rescue…");
  try {
    // try add temp IP (Windows); ignore errors on mac/linux
    try {
      const addJ = await fetchJson(`${safeBridge}/assist/subnet/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerHost: chosen.host })
      });
      localStorage.setItem("lanTempIp", addJ.tempIp || "");
      localStorage.setItem("lanAdapterAlias", addJ.adapterAlias || "");
      setStatus(prev => prev + ` Temp IP ${addJ.tempIp} added on ${addJ.adapterAlias}.`);
    } catch (e) {
      // not Windows/admin—fine, continue to open UI
    }

    await fetchJson(`${safeBridge}/assist/subnet/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printerHost: chosen.host })
    });

    setStatus(
      "Opened printer web page. In Network → TCP/IP set Mode = DHCP (or set a static in your main LAN), save & reboot the printer. Then click “Plug & Print” again."
    );
  } catch (e) {
    setStatus("Rescue failed ❌ " + (e.message || e));
  }
};


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
  <div className="space-y-4">
    {/* Step 1 — Bridge */}
    <div className="rounded-xl border bg-white/60 p-4 space-y-2">
      <h3 className="text-xl font-bold">Step 1 — Install Beypro Bridge</h3>
      <div className="flex flex-wrap gap-2">
        <a className="px-3 py-2 rounded-xl bg-black text-white" href={`${BACKEND}/bridge/beypro-bridge-mac.zip`}>macOS</a>
        <a className="px-3 py-2 rounded-xl bg-blue-700 text-white" href={`${BACKEND}/bridge/beypro-bridge-win-x64.zip`}>Windows</a>
        <a className="px-3 py-2 rounded-xl bg-gray-800 text-white" href={`${BACKEND}/bridge/beypro-bridge-linux-x64.tar.gz`}>Linux</a>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={pingBridge} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold">
          Detect Bridge
        </button>
        <span className="text-sm text-gray-700">{status}</span>
      </div>
    </div>

    {/* Step 2 — One button */}
    <div className="rounded-xl border bg-white/60 p-4 space-y-3">
      <h3 className="text-xl font-bold">Step 2 — Plug & Print (LAN)</h3>

      <button
        onClick={plugAndPrint}
        className="w-full px-4 py-4 rounded-2xl bg-emerald-600 text-white font-extrabold text-lg shadow hover:bg-emerald-700 transition"
      >
        Plug & Print
      </button>

      {/* tiny helper row */}
      <div className="text-xs text-gray-600">
        If the printer was factory-set to another subnet, we’ll open its page so you can set <b>DHCP</b>, then click Plug & Print again.
      </div>

      {/* Advanced drawer (keeps your existing tools but hidden) */}
      <details className="mt-2">
        <summary className="cursor-pointer text-gray-600 hover:text-gray-800">Advanced…</summary>
        <div className="mt-3 space-y-2">
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
            <div className="flex items-end gap-2">
              <button onClick={probeSelected} className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold w-full">
                Probe
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={openPrinterUI} className="px-3 py-2 rounded-xl bg-slate-700 text-white font-bold">Open Printer UI</button>
            <button onClick={rescuePrinter} className="px-3 py-2 rounded-xl bg-amber-600 text-white font-bold">Rescue (Windows)</button>
            <button onClick={cleanupTemp} className="px-3 py-2 rounded-xl bg-gray-600 text-white font-bold">Remove Temp IP</button>
          </div>
        </div>
      </details>

      {/* Status */}
      <div className="text-sm text-gray-700">{status}</div>
    </div>
  </div>
);

}
