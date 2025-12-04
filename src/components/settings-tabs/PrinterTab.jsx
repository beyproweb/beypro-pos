// PrinterTab.jsx (drop-in replacement)
// - Auto-detect printers on Windows/Electron (via preload bridge like window.beypro / window.electron)
// - Modern UI with dropdown, refresh, status badge, live receipt preview, and test-print
// - Persists selected printer in localStorage under "beyproSelectedPrinter"
// - Graceful browser fallback if not running under Electron
// - Supports network printer detection via TCP 9100

import React, { useEffect, useMemo, useRef, useState } from "react";
import secureFetch from "../../utils/secureFetch";

// ---------- Small helpers ----------
const LS_KEY = "beyproSelectedPrinter";

// Detect printer type from name
function detectPrinterType(printerName = "") {
  const lower = String(printerName).toLowerCase();
  if (/network|lan|tcp|ip|[\d.]+|192\.168|10\.0|172\.16/i.test(lower)) {
    return "network";
  }
  if (/usb|thermal|pos|escpos/i.test(lower)) {
    return "usb";
  }
  if (/serial|com\d+|tty|uart/i.test(lower)) {
    return "serial";
  }
  return "unknown";
}

// Extract IP from printer name
function extractIpFromPrinterName(printerName = "") {
  const match = String(printerName).match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match ? match[1] : null;
}

async function getPrintersSafe() {
  try {
    // Preferred (your Electron preload contract)
    if (window?.beypro?.getPrinters) {
      // expected: [{name, isDefault, status}, ...]
      const list = await window.beypro.getPrinters();
      return Array.isArray(list) ? list : [];
    }
    // Alternative common bridge shape
    if (window?.electron?.printers?.getPrinters) {
      const list = await window.electron.printers.getPrinters();
      return Array.isArray(list) ? list : [];
    }
    // Generic IPC pattern (invoke channel)
    if (window?.beypro?.invoke) {
      const list = await window.beypro.invoke("getPrinters");
      return Array.isArray(list) ? list : [];
    }
  } catch (e) {
    console.error("getPrintersSafe error:", e);
  }

  // Fallback: attempt local Windows spooler bridge (if installed and running)
  try {
    const res = await fetch("http://127.0.0.1:7777/win/printers", {
      method: "GET",
      headers: { "Accept": "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && Array.isArray(data.printers)) {
        return data.printers.map((name) => ({ name, isDefault: false }));
      }
    }
  } catch (err) {
    // ignore — bridge likely not running
  }

  // Browser fallback (no listing possible)
  return [];
}

async function printHTMLSafe({ html, printerName }) {
  // Prefer HTML printing if available
  if (window?.beypro?.printHTML) {
    return window.beypro.printHTML({ html, printerName });
  }
  if (window?.electron?.printers?.printHTML) {
    return window.electron.printers.printHTML({ html, printerName });
  }
  if (window?.beypro?.invoke) {
    return window.beypro.invoke("printHTML", { html, printerName });
  }
  throw new Error("No HTML print bridge found");
}

// Optionally try raw ESC/POS if your bridge supports it
// Optionally try raw ESC/POS if your bridge supports it
async function printRawSafe({ data, printerName }) {
  if (!(data instanceof Uint8Array)) {
    throw new Error("printRawSafe expects Uint8Array in 'data'");
  }
  // Encode bytes to base64 for the Electron IPC
  const dataBase64 = btoa(String.fromCharCode(...data));

  // Preferred preload contract (your preload.js exposes 'printRaw')
  if (window?.beypro?.printRaw) {
    return window.beypro.printRaw({ printerName, dataBase64, type: "RAW" });
  }
  // Alternative common shapes (kept for compatibility)
  if (window?.electron?.printers?.printRaw) {
    return window.electron.printers.printRaw({ printerName, dataBase64, type: "RAW" });
  }
  if (window?.beypro?.invoke) {
    return window.beypro.invoke("printRaw", { printerName, dataBase64, type: "RAW" });
  }
  throw new Error("No RAW print bridge found");
}


function isElectron() {
  return (
    (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent)) ||
    (typeof window !== "undefined" && !!window.beypro) ||
    (typeof window !== "undefined" && window.location.protocol === "file:")
  );
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

// ---------- Demo receipt (HTML) ----------
function ReceiptPreviewHTML({ order }) {
  // Printer-friendly, 58/80mm thermal style
  const css = `
    <style>
      * { box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial; margin:0; }
      .ticket { width: 280px; padding: 12px; }
      .center { text-align:center; }
      .muted { color:#555; font-size:12px; }
      hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
      .row { display:flex; justify-content:space-between; font-size:14px; margin: 2px 0; }
      .title { font-weight:700; font-size:16px; }
      .totals .row { font-weight:700; }
      .qr { margin-top: 8px; }
    </style>
  `;
  const items = order.items || [];
  const sub = items.reduce((s, it) => s + it.qty * it.price, 0);
  const tax = Math.round(sub * 0.1 * 100) / 100; // demo 10%
  const total = Math.round((sub + tax) * 100) / 100;

  return (
    <div
      className="ticket bg-white"
      dangerouslySetInnerHTML={{
        __html: `
      ${css}
      <div class="ticket">
        <div class="center">
          <div class="title">Beypro — Test Receipt</div>
          <div class="muted">${order.store ?? "Hurrybey"}</div>
          <div class="muted">${order.date}</div>
        </div>
        <hr />
        ${items
          .map(
            (it) => `
          <div class="row">
            <div>${it.qty} × ${it.name}</div>
            <div>${(it.qty * it.price).toFixed(2)} ₺</div>
          </div>`
          )
          .join("")}
        <hr />
        <div class="totals">
          <div class="row"><div>Ara Toplam</div><div>${sub.toFixed(2)} ₺</div></div>
          <div class="row"><div>Vergi (10%)</div><div>${tax.toFixed(2)} ₺</div></div>
          <div class="row"><div>Toplam</div><div>${total.toFixed(2)} ₺</div></div>
        </div>
        <hr />
        <div class="center muted">Teşekkür ederiz! / Thank you!</div>
      </div>
      `,
      }}
    />
  );
}

// ---------- Main Component ----------
export default function PrinterTab() {
  const [loading, setLoading] = useState(true);
  const [printers, setPrinters] = useState([]);
  const [selected, setSelected] = useState(
    () => localStorage.getItem(LS_KEY) || ""
  );
  const [status, setStatus] = useState("idle"); // idle | ok | error
  const [message, setMessage] = useState("");
  const [usingElectron, setUsingElectron] = useState(isElectron());
  const previewRef = useRef(null);
  const [backendDetecting, setBackendDetecting] = useState(false);
  const [backendPrinters, setBackendPrinters] = useState({ usb: [], serial: [], tips: [] });
  const [lanScanResults, setLanScanResults] = useState([]);
  const [lanScanning, setLanScanning] = useState(false);
  const [lanConfig, setLanConfig] = useState({ base: "192.168.1", from: 10, to: 40, hosts: "" });

  const demoOrder = useMemo(
    () => ({
      store: "Hurrybey Gıda",
      date: new Date().toLocaleString(),
      items: [
        { name: "Smash Burger", qty: 2, price: 185 },
        { name: "Patates (Büyük)", qty: 1, price: 65 },
        { name: "Kola", qty: 2, price: 45 },
      ],
    }),
    []
  );

  useEffect(() => {
    refreshPrinters();
    fetchBackendPrinters();
    // Listen for hot-plug events if your preload provides them
    if (window?.beypro?.onPrintersChanged) {
      const off = window.beypro.onPrintersChanged(() => refreshPrinters());
      return () => off && off();
    }
  }, []);

  async function refreshPrinters() {
    setLoading(true);
    setStatus("idle");
    setMessage("");
    try {
      const list = await getPrintersSafe();
      setPrinters(list);
      // Ensure selected still exists
      if (list.length) {
        const has = list.find((p) => p.name === selected);
        if (!has) {
          const def = list.find((p) => p.isDefault) || list[0];
          setSelected(def?.name || "");
          localStorage.setItem(LS_KEY, def?.name || "");
        }
      } else {
        setSelected("");
      }
      setUsingElectron(isElectron());
    } catch (e) {
      console.error(e);
      setStatus("error");
      setMessage("Could not fetch printers.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchBackendPrinters() {
    setBackendDetecting(true);
    try {
      const data = await secureFetch("/printer-settings/printers");
      setBackendPrinters(data?.printers || { usb: [], serial: [], tips: [] });
    } catch (err) {
      console.error("USB detection failed:", err);
      setBackendPrinters({ usb: [], serial: [], tips: [err?.message || "Detection failed"] });
    } finally {
      setBackendDetecting(false);
    }
  }

  async function runLanScan() {
    const payload = {};
    const trimmedBase = lanConfig.base?.trim();
    if (trimmedBase) {
      payload.base = trimmedBase;
      payload.from = Number(lanConfig.from) || 1;
      payload.to = Number(lanConfig.to) || payload.from;
    }
    if (lanConfig.hosts?.trim()) {
      payload.hosts = lanConfig.hosts
        .split(/[,\s]+/)
        .map((ip) => ip.trim())
        .filter(Boolean);
    }
    if (!payload.base && !(payload.hosts && payload.hosts.length)) {
      setMessage("Enter a base subnet or custom hosts to scan.");
      setStatus("error");
      return;
    }

    setLanScanning(true);
    try {
      const data = await secureFetch("/printer-settings/lan-scan", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setLanScanResults(Array.isArray(data?.printers) ? data.printers : []);
    } catch (err) {
      console.error("LAN scan failed:", err);
      setLanScanResults([]);
      setStatus("error");
      setMessage(err?.message || "LAN scan failed");
    } finally {
      setLanScanning(false);
    }
  }

  function saveSelected(name) {
    setSelected(name);
    localStorage.setItem(LS_KEY, name);
    setStatus("ok");
    setMessage(`Selected printer: ${name || "—"}`);
  }

async function handleTestPrint() {
  setStatus("idle");
  setMessage("");
  if (!selected) {
    setStatus("error");
    setMessage("Please select a printer first.");
    return;
  }

  try {
    // Minimal, reliable ESC/POS: ESC @ (init) + text + feed + full cut
    const enc = new TextEncoder();
    const init = Uint8Array.from([0x1b, 0x40]); // ESC @
    const body = enc.encode("Beypro Test\nMerhaba Yazıcı!\n\n\n");
    const cut = Uint8Array.from([0x1d, 0x56, 0x00]); // GS V 0 (full cut)

    const bytes = new Uint8Array(init.length + body.length + cut.length);
    bytes.set(init, 0);
    bytes.set(body, init.length);
    bytes.set(cut, init.length + body.length);
    console.debug("🧾 handleTestPrint sending", { printerName: selected, bytes: bytes.length });

    const printerType = detectPrinterType(selected);
    console.log(`📠 Test print to: ${selected} (type: ${printerType})`);

    // 1) For network printers, try direct TCP 9100 connection first
    if (printerType === "network") {
      const ip = extractIpFromPrinterName(selected);
      if (ip && window?.beypro?.printNet) {
        try {
          const dataBase64 = btoa(String.fromCharCode(...bytes));
          console.log(`🌐 Attempting network print to ${ip}:9100`);
          await window.beypro.printNet({ host: ip, port: 9100, dataBase64 });
          console.log("✅ Network print sent successfully");
          setStatus("ok");
          setMessage(`Network printer test sent to ${ip}:9100`);
          return;
        } catch (netErr) {
          console.warn("Network print failed, trying RAW fallback…", netErr);
        }
      }
    }

    // 2) Try Electron RAW path (works for USB and network via driver)
    try {
      await printRawSafe({ data: bytes, printerName: selected });
      console.debug("🧾 RAW test via preload ok");
      setStatus("ok");
      setMessage("RAW test print sent successfully.");
      return;
    } catch (e1) {
      console.warn("printRawSafe failed, trying local bridge…", e1);
    }

    // 3) Fallback to local Windows spooler bridge
    try {
      const dataBase64 = btoa(String.fromCharCode(...bytes));
      const res = await fetch("http://127.0.0.1:7777/win/print-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: selected, dataBase64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      console.debug("🧾 RAW test via local bridge ok");
      setStatus("ok");
      setMessage("RAW test print sent successfully (bridge).");
      return;
    } catch (e2) {
      console.warn("Local bridge print failed:", e2);
    }

    throw new Error("No available print bridge (Electron/local) detected.");
  } catch (err) {
    setStatus("error");
    setMessage(`Print failed: ${err?.message || err}`);
  }
}

  // ---------- UI ----------
  const electronWarn =
    !usingElectron &&
    "Not running under Electron. Printer auto-detect requires the desktop app.";

  const statusColors = {
    idle: "bg-gray-100 text-gray-700",
    ok: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };

  return (
    <div className="h-full w-full flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Printers</h1>
          <p className="text-gray-600">
            Detect local printers via the desktop bridge and scan LAN / USB devices from the backend.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshPrinters}
            className="px-3 py-2 rounded-xl border shadow-sm hover:shadow transition"
            title="Refresh printers"
          >
            🔄 Refresh
          </button>
          <span
            className={classNames(
              "px-2 py-1 rounded-xl text-sm",
              statusColors[status]
            )}
          >
            {status === "idle" ? "Idle" : status === "ok" ? "Ready" : "Error"}
          </span>
        </div>
      </div>

      {electronWarn && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-3">
          {electronWarn}
        </div>
      )}

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Printer selection + actions */}
        <div className="rounded-2xl border shadow-sm bg-white p-4 md:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Choose Printer</h2>
            <span className="text-sm text-gray-500">
              {loading
                ? "Detecting…"
                : printers.length
                ? `${printers.length} found`
                : "No printers found"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-600">Printer</label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border bg-white p-3 pr-10 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selected}
                onChange={(e) => saveSelected(e.target.value)}
                disabled={loading || !printers.length}
              >
                {!printers.length ? (
                  <option value="">— No printers —</option>
                ) : (
                  printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.isDefault ? " (Default)" : ""}
                    </option>
                  ))
                )}
              </select>
              <span className="pointer-events-none absolute right-3 top-3.5">
                ▼
              </span>
            </div>
            {!!selected && (
              <div className="text-xs text-gray-500">
                Saved as default: <b>{selected}</b>
              </div>
            )}
          </div>

          <div className="pt-2 flex gap-3">
            <button
              onClick={handleTestPrint}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium shadow hover:shadow-lg active:scale-[.99] transition"
              disabled={!selected}
            >
              🧾 Test Print
            </button>
            <button
              onClick={() => saveSelected("")}
              className="px-4 py-3 rounded-xl border bg-white shadow-sm hover:shadow transition"
            >
              Clear
            </button>
          </div>

          {message && (
            <div
              className={classNames(
                "mt-2 rounded-xl p-3 text-sm",
                status === "error"
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-green-50 text-green-800 border border-green-200"
              )}
            >
              {message}
            </div>
          )}

          {/* Tiny debug block */}
          {!!printers.length && (
            <details className="mt-2 text-sm text-gray-600">
              <summary className="cursor-pointer select-none">
                Debug details
              </summary>
              <pre className="text-xs bg-gray-50 border rounded-xl p-2 overflow-auto">
                {JSON.stringify(printers, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* Middle: LAN Scan */}
        <div className="rounded-2xl border shadow-sm bg-white p-4 md:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">🌐 Network Printer Scan</h2>
            <span className="text-sm text-gray-500">
              {lanScanning ? "Scanning…" : lanScanResults.length ? `${lanScanResults.length} found` : "Idle"}
            </span>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex flex-col gap-1.5">
              <label className="text-gray-600 font-medium">Base Subnet (192.168.1)</label>
              <input
                type="text"
                value={lanConfig.base}
                onChange={(e) => setLanConfig({ ...lanConfig, base: e.target.value })}
                placeholder="192.168.123"
                className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={lanScanning}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-600 font-medium">From</label>
                <input
                  type="number"
                  value={lanConfig.from}
                  onChange={(e) => setLanConfig({ ...lanConfig, from: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="254"
                  className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={lanScanning}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-gray-600 font-medium">To</label>
                <input
                  type="number"
                  value={lanConfig.to}
                  onChange={(e) => setLanConfig({ ...lanConfig, to: parseInt(e.target.value) || lanConfig.from })}
                  min="1"
                  max="254"
                  className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={lanScanning}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-gray-600 font-medium">Custom Hosts (comma/space separated)</label>
              <input
                type="text"
                value={lanConfig.hosts}
                onChange={(e) => setLanConfig({ ...lanConfig, hosts: e.target.value })}
                placeholder="192.168.123.100, 192.168.123.101"
                className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={lanScanning}
              />
              <p className="text-xs text-gray-500">Tip: For single IP 192.168.123.100, use base "192.168.123", from "100", to "100"</p>
            </div>

            <button
              onClick={runLanScan}
              disabled={lanScanning}
              className="w-full px-4 py-3 rounded-xl bg-indigo-600 text-white font-medium shadow hover:shadow-lg active:scale-[.99] transition disabled:opacity-50"
            >
              {lanScanning ? "Scanning…" : "🔍 Scan for Printers"}
            </button>
          </div>

          {lanScanResults.length > 0 && (
            <div className="border-t pt-3">
              <h3 className="text-sm font-semibold mb-2">Results:</h3>
              <div className="space-y-2">
                {lanScanResults.map((printer, idx) => {
                  const status = printer.ok ? (printer.isEscpos ? "🟢 ESC/POS" : "🟡 Open") : "⚪️ Offline";
                  return (
                    <div key={idx} className="text-xs bg-gray-50 border rounded-xl p-2">
                      <div className="font-mono font-semibold">
                        {status} {printer.host}:{printer.port}
                      </div>
                      {printer.manufacturer && (
                        <div className="text-gray-600">{printer.manufacturer} {printer.model}</div>
                      )}
                      {printer.latency && (
                        <div className="text-gray-500">Latency: {printer.latency}ms</div>
                      )}
                      {printer.error && (
                        <div className="text-red-600 text-xs">Error: {printer.error}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        /* Right: Receipt preview */
          <div className="rounded-2xl border shadow-sm bg-white p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Receipt Preview</h2>
              <span className="text-sm text-gray-500">Demo layout</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
            <div className="text-gray-500">Paper</div>
            <div className="font-semibold">80mm (Demo)</div>
                </div>
                <div className="rounded-xl border p-3">
            <div className="text-gray-500">Language</div>
            <div className="font-semibold">TR / EN</div>
                </div>
                <div className="rounded-xl border p-3">
            <div className="text-gray-500">Totals</div>
            <div className="font-semibold">Auto</div>
                </div>
                <div className="rounded-xl border p-3">
            <div className="text-gray-500">Cut</div>
            <div className="font-semibold">Full</div>
                </div>
              </div>

              <p className="mt-4 text-gray-600">
                Adjust actual live template on your Reports/Receipts screen. This
                preview prints exactly as shown when using HTML printing.
              </p>
            </div>
            <div className="flex items-start gap-6">
              <div
                ref={previewRef}
                className="rounded-xl border bg-gray-50 p-4"
                style={{ width: 300 }}
              >
                <ReceiptPreviewHTML order={demoOrder} />
              </div>
            </div>
          </div>
      </div>

      <div className="text-xs text-gray-500 text-center">
        Tip: Make sure your Electron preload exposes <code>getPrinters</code> and
        either <code>printHTML</code> or <code>printRaw</code>. The selected printer
        is saved locally.
      </div>
    </div>
  );
}
