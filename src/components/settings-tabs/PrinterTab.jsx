// PrinterTab.jsx (drop-in replacement)
// - Auto-detect printers on Windows/Electron (via preload bridge like window.beypro / window.electron)
// - Modern UI with dropdown, refresh, status badge, live receipt preview, and test-print
// - Persists selected printer in localStorage under "beyproSelectedPrinter"
// - Graceful browser fallback if not running under Electron

import React, { useEffect, useMemo, useRef, useState } from "react";
import secureFetch from "../../utils/secureFetch";

// ---------- Small helpers ----------
const LS_KEY = "beyproSelectedPrinter";

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
    const init = Uint8Array.from([0x1B, 0x40]);           // ESC @
    const body = enc.encode("Beypro Test\nMerhaba Yazıcı!\n\n\n");
    const cut  = Uint8Array.from([0x1D, 0x56, 0x00]);      // GS V 0 (full cut)

    const bytes = new Uint8Array(init.length + body.length + cut.length);
    bytes.set(init, 0);
    bytes.set(body, init.length);
    bytes.set(cut, init.length + body.length);
    console.debug("🧾 handleTestPrint sending", { printerName: selected, bytes: bytes.length });

    await printRawSafe({ data: bytes, printerName: selected });
    console.debug("🧾 handleTestPrint done");
    setStatus("ok");
    setMessage("RAW test print sent successfully.");
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Right: Receipt preview */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border shadow-sm bg-white p-4 md:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Backend USB / Serial Detection</h2>
            <button
              onClick={fetchBackendPrinters}
              className="px-3 py-2 rounded-xl border shadow-sm text-sm hover:shadow"
              disabled={backendDetecting}
            >
              {backendDetecting ? "Detecting…" : "Detect"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">USB printers</h3>
              <div className="rounded-xl border bg-gray-50 max-h-48 overflow-auto p-2 text-sm">
                {backendPrinters.usb?.length ? (
                  backendPrinters.usb.map((p, idx) => (
                    <div key={idx} className="py-1 border-b last:border-none">
                      <div className="font-semibold">{p.vendorId} / {p.productId}</div>
                      <div className="text-xs text-gray-500">{p.id}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No USB printers detected.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Serial ports</h3>
              <div className="rounded-xl border bg-gray-50 max-h-48 overflow-auto p-2 text-sm">
                {backendPrinters.serial?.length ? (
                  backendPrinters.serial.map((p, idx) => (
                    <div key={idx} className="py-1 border-b last:border-none">
                      <div className="font-semibold">{p.path}</div>
                      <div className="text-xs text-gray-500">{p.friendlyName || p.manufacturer || "Unknown"}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500">No serial devices detected.</p>
                )}
              </div>
            </div>
          </div>

          {!!backendPrinters.tips?.length && (
            <ul className="text-xs text-gray-500 list-disc pl-4">
              {backendPrinters.tips.map((tip, idx) => (
                <li key={idx}>{tip}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border shadow-sm bg-white p-4 md:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">LAN Scanner</h2>
            <button
              onClick={runLanScan}
              className="px-3 py-2 rounded-xl border shadow-sm text-sm hover:shadow"
              disabled={lanScanning}
            >
              {lanScanning ? "Scanning…" : "Scan"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500">Subnet Base</label>
              <input
                type="text"
                className="w-full rounded-xl border px-3 py-2"
                value={lanConfig.base}
                onChange={(e) => setLanConfig((prev) => ({ ...prev, base: e.target.value }))}
                placeholder="192.168.1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">From</label>
              <input
                type="number"
                className="w-full rounded-xl border px-3 py-2"
                value={lanConfig.from}
                onChange={(e) => setLanConfig((prev) => ({ ...prev, from: e.target.value }))}
                min={1}
                max={254}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">To</label>
              <input
                type="number"
                className="w-full rounded-xl border px-3 py-2"
                value={lanConfig.to}
                onChange={(e) => setLanConfig((prev) => ({ ...prev, to: e.target.value }))}
                min={1}
                max={254}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Custom IPs (comma separated)</label>
            <input
              type="text"
              className="w-full rounded-xl border px-3 py-2"
              value={lanConfig.hosts}
              onChange={(e) => setLanConfig((prev) => ({ ...prev, hosts: e.target.value }))}
              placeholder="192.168.1.201, 192.168.1.210"
            />
          </div>
          <div className="rounded-xl border bg-gray-50 p-3 max-h-60 overflow-auto text-sm">
            {lanScanResults.length === 0 ? (
              <p className="text-gray-500">Scan results will appear here.</p>
            ) : (
              lanScanResults.map((result, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between border-b last:border-none py-1"
                >
                  <div>
                    <div className="font-semibold">{result.host}:{result.port}</div>
                    <div className="text-xs text-gray-500">
                      {result.ok ? `Responded in ${result.latency}ms` : result.error || "unreachable"}
                    </div>
                  </div>
                  <span className={result.ok ? "text-green-600" : "text-red-500"}>
                    {result.ok ? "🟢" : "⚪️"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-gray-500 text-center">
        Tip: Make sure your Electron preload exposes <code>getPrinters</code> and
        either <code>printHTML</code> or <code>printRaw</code>. The selected printer
        is saved locally.
      </div>
    </div>
  );
}
