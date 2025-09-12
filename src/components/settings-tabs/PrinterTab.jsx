// ==============================
// File: src/pages/PrinterTab.jsx
// Purpose: Bridge download links, bridge ping,
//          USB scan & print (robust keying),
//          Windows printers (name) detection & optional spooler print
// ==============================

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

// --- ESC/POS bridge helpers ---
async function printEscposToBridge(printerIp, escposUint8Array) {
  const dataBase64 = btoa(String.fromCharCode(...escposUint8Array));
  const r = await fetch("http://127.0.0.1:7777/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host: printerIp, dataBase64 })
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Print failed");
}

function buildSimpleEscpos(text) {
  // ESC @ (init), text, LFx3, GS V 0 (full cut)
  const bytes = [];
  bytes.push(0x1B, 0x40);
  const enc = new TextEncoder();
  bytes.push(...enc.encode(text + "\n\n\n"));
  // full cut
  bytes.push(0x1D, 0x56, 0x00);
  return new Uint8Array(bytes);
}

const BRIDGE = "http://127.0.0.1:7777";

// Backend origin for downloads
const DEFAULT_BACKEND = "https://hurrypos-backend.onrender.com";
let BRIDGE_DOWNLOAD_ORIGIN =
  (import.meta?.env?.VITE_BRIDGE_DOWNLOAD_ORIGIN || window.location.origin)
    .replace(/\/$/, "");
if (window.location.hostname === "pos.beypro.com") {
  BRIDGE_DOWNLOAD_ORIGIN = DEFAULT_BACKEND;
}
const BRIDGE_DOWNLOAD_BASE = `${BRIDGE_DOWNLOAD_ORIGIN}/bridge`;
const BRIDGE_VER = (import.meta?.env?.VITE_BRIDGE_VER || "1.2.2");

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
};
const total = (items) => items.reduce((s, i) => s + i.price * i.qty, 0);

async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { throw new Error(`Non-JSON from ${url} (HTTP ${r.status})`); }
  if (!r.ok || data?.ok === false || data?.error) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

function makeTicketText(order, shopAddress) {
  const lines = [];
  lines.push("*** BEYPRO ***");
  if (shopAddress) lines.push(shopAddress);
  lines.push(new Date().toLocaleString());
  lines.push(`Order #${order.id}`);
  lines.push("------------------------------");
  order.items.forEach(i => {
    const left = `${i.qty}x ${i.name}`.padEnd(20, " ").slice(0, 20);
    const right = `${i.price.toFixed(2)} TL`.padStart(10, " ");
    lines.push(left + right);
  });
  lines.push("------------------------------");
  lines.push(`TOTAL: ${total(order.items).toFixed(2)} TL`);
  lines.push(`PAY: ${order.payment}`);
  lines.push("");
  lines.push("ĞÜŞİÖÇ ğüşiöç — Teşekkürler!");
  lines.push("\n");
  return lines.join("\n");
}

// ---- Helpers for stable USB device identity ----
function keyFor(dev, idx = 0) {
  const vid = `${dev?.vendorId ?? dev?.VID ?? ""}`.trim();
  const pid = `${dev?.productId ?? dev?.PID ?? ""}`.trim();
  const path = `${dev?.path ?? dev?.deviceAddress ?? ""}`.trim();
  const base = [vid, pid, path].join(":");
  return base || `idx:${idx}`;
}
function sameKey(a, b, idxA = 0, idxB = 0) {
  return keyFor(a, idxA) === keyFor(b, idxB);
}

export default function PrinterTab() {
  const { t } = useTranslation();

  const [printerIpState, setPrinterIpState] = useState(localStorage.getItem("printerIp") || "");
  const [bridgeInfo, setBridgeInfo] = useState(null);

  // USB state
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [selectedUsb, setSelectedUsb] = useState(() => {
    const v = localStorage.getItem("usbSelectedJson");
    return v ? JSON.parse(v) : null;
  });

  // Windows printers state
  const [winPrinters, setWinPrinters] = useState([]);
  const [selectedWin, setSelectedWin] = useState(localStorage.getItem("winPrinterName") || "");
  const [manualWinName, setManualWinName] = useState(localStorage.getItem("winPrinterName") || "");

  const [encoding, setEncoding] = useState(localStorage.getItem("usbEncoding") || "cp857");
  const [autoCut, setAutoCut] = useState(localStorage.getItem("usbAutoCut") !== "false");
  const [shopAddress, setShopAddress] = useState(localStorage.getItem("shopAddress") || "Hurrybey Burger\nİzmir");

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const content = useMemo(() => makeTicketText(previewOrder, shopAddress), [shopAddress]);
  const pingTimer = useRef(null);

  const handleTestPrint = async () => {
    try {
      const ip = (printerIpState || localStorage.getItem("printerIp") || "").trim();
      if (!ip) { alert("Please set a printer IP first."); return; }
      const text = "HURRYBEY - BEYPRO\n---------------------\n1x Burger   195.00 TL\nTOTAL       195.00 TL";
      await printEscposToBridge(ip, buildSimpleEscpos(text));
      alert("✅ Test print sent to bridge!");
    } catch (e) {
      alert("❌ Print failed: " + e.message);
    }
  };

  // --- Bridge status ping ---
  const pingBridge = async () => {
    try {
      const j = await fetchJson(`${BRIDGE.replace(/\/+$/, "")}/ping`, { cache: "no-store" });
      setBridgeInfo(j);
    } catch (e) {
      setBridgeInfo({ ok: false, error: e.message || String(e) });
    }
  };

  // --- USB scan with fallback (/printers -> /usb/list) and robust reconciliation ---
  const refreshUsb = async () => {
    setStatus("Detecting USB printers…");
    try {
      const base = BRIDGE.replace(/\/+$/, "");
      let list = [];
      try {
        const j1 = await fetchJson(`${base}/printers`, { cache: "no-store" });
        list = j1?.usb || j1?.printers?.usb || [];
      } catch {
        const j2 = await fetchJson(`${base}/usb/list`, { cache: "no-store" });
        const ports = j2?.ports || [];
        list = ports.map(p => ({
          vendorId: `${p.vendorId || p.vendorID || p.vendor || ""}`,
          productId: `${p.productId || p.productID || p.product || ""}`,
          path: `${p.path || p.comName || ""}`,
          name: p.product || p.manufacturer || "USB Printer",
        }));
      }

      // Normalize
      list = list.map(p => ({
        ...p,
        vendorId: `${p.vendorId ?? p.VID ?? ""}`,
        productId: `${p.productId ?? p.PID ?? ""}`,
        path: `${p.path ?? p.deviceAddress ?? ""}`,
      }));

      setUsbPrinters(list);
      setStatus(`Found ${list.length} USB device(s).`);

      // Reconcile/auto-select
      const saved = selectedUsb;
      if (list.length === 1 && !saved) {
        setSelectedUsb(list[0]);
        localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
      } else if (saved) {
        const idx = list.findIndex((p, i) => sameKey(p, saved, i, 0));
        if (idx >= 0) {
          setSelectedUsb(list[idx]);
          localStorage.setItem("usbSelectedJson", JSON.stringify(list[idx]));
        } else if (list.length) {
          setSelectedUsb(list[0]);
          localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
        } else {
          setSelectedUsb(null);
          localStorage.removeItem("usbSelectedJson");
        }
      }
    } catch (e) {
      setStatus(`Scan failed ❌ ${e.message || e}`);
    }
  };

  // --- Windows printers: detect friendly names from OS ---
  const refreshWindowsPrinters = async () => {
    setStatus("Detecting Windows printers…");
    try {
      const base = BRIDGE.replace(/\/+$/, "");
      const j = await fetchJson(`${base}/win/printers?d=${Date.now()}`, { cache: "no-store" });
      const list = Array.isArray(j.printers) ? j.printers : [];
      setWinPrinters(list);
      setStatus(`Found ${list.length} Windows printer(s).`);
      if (!selectedWin && list.length) {
        const def = list.find(p => p.isDefault);
        const first = def || list[0];
        if (first?.name) {
          setSelectedWin(first.name);
          localStorage.setItem("winPrinterName", first.name);
        }
      }
    } catch (e) {
      setStatus(`Windows scan failed ❌ ${e.message || e}`);
    }
  };

  useEffect(() => {
    pingBridge();
    refreshUsb();
    pingTimer.current = setInterval(pingBridge, 5000);
    return () => clearInterval(pingTimer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load Windows printers when bridge says it's Windows
  useEffect(() => {
    if (bridgeInfo?.platform && String(bridgeInfo.platform).toLowerCase().includes("win")) {
      refreshWindowsPrinters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeInfo?.platform]);

  // --- Tolerant USB print: prefer /print (VID/PID), fallback to /usb/print-raw (path) ---
  const handlePrintUsb = async () => {
    let chosen = selectedUsb;
    if (!chosen && usbPrinters.length === 1) {
      chosen = usbPrinters[0];
      setSelectedUsb(chosen);
      localStorage.setItem("usbSelectedJson", JSON.stringify(chosen));
    }
    if (!chosen) { setStatus("Select a USB printer from the list first."); return; }

    setBusy(true);
    setStatus("Printing via USB…");
    const base = BRIDGE.replace(/\/+$/, "");

    const tryBridgeMiniPrint = async () => {
      const hasIds = chosen.vendorId && chosen.productId;
      if (!hasIds) throw new Error("Missing VID/PID for bridge /print");
      await fetchJson(`${base}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interface: "usb",
          vendorId: `${chosen.vendorId}`,
          productId: `${chosen.productId}`,
          content,
          encoding,
          cut: !!autoCut,
          cashdraw: false,
        }),
      });
    };

    const tryLegacyUsbRaw = async () => {
      const path = chosen.path || chosen.deviceAddress || "";
      if (!path) throw new Error("Legacy USB print requires a device path.");
      const encoder = new TextEncoder();
      let bytes = encoder.encode(content + "\n\n\n");
      if (autoCut) bytes = new Uint8Array([...bytes, 0x1D, 0x56, 0x00]);
      const dataBase64 = btoa(String.fromCharCode(...bytes));
      await fetchJson(`${base}/usb/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, dataBase64 }),
      });
    };

    try {
      try { await tryBridgeMiniPrint(); } catch { await tryLegacyUsbRaw(); }
      setStatus("Printed via USB ✅");
    } catch (e) {
      setStatus(`USB print failed ❌ ${e.message || e}`);
    } finally { setBusy(false); }
  };

  // --- (Optional) Windows spooler print by friendly name ---
  const handlePrintWindows = async () => {
    if (!selectedWin) { setStatus("Select a Windows printer first."); return; }
    setBusy(true);
    setStatus("Printing via Windows…");
    try {
      const base = BRIDGE.replace(/\/+$/, "");
      const encoder = new TextEncoder();
      let bytes = encoder.encode(content + "\n\n\n");
      if (autoCut) bytes = new Uint8Array([...bytes, 0x1D, 0x56, 0x00]);
      const dataBase64 = btoa(String.fromCharCode(...bytes));
      await fetchJson(`${base}/win/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: selectedWin, dataBase64, encoding }),
      });
      setStatus("Printed via Windows ✅");
    } catch (e) {
      setStatus(`Windows print failed ❌ ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBrowserPrint = () => {
    const w = window.open("", "print", "width=700,height=900");
    if (!w) return;
    w.document.write(`
      <html><head><title>Print Preview</title>
      <style>@media print{body{margin:0}} body{font-family:monospace;font-size:13px;line-height:1.2}.receipt{width:80mm;margin:0 auto}</style>
      </head><body><pre class="receipt">${content.replace(/[<&>]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre></body></html>
    `);
    w.document.close(); w.focus(); w.print(); setTimeout(() => w.close(), 300);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Step 1 — Download & Install Bridge */}
      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <h3 className="text-xl font-bold">Step 1 — Install Beypro Bridge</h3>
        <p className="text-sm text-gray-600">
          Install the bridge on the computer where your USB printer is plugged in. It will allow this page to talk to the
          printer at <code>http://127.0.0.1:7777</code>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-win-x64.zip?v=${BRIDGE_VER}`} className="px-4 py-3 rounded-2xl bg-blue-700 text-white font-bold text-center shadow hover:bg-blue-800" download>Windows</a>
          <a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-mac-x64.tar.gz?v=${BRIDGE_VER}`} className="px-4 py-3 rounded-2xl bg-gray-800 text-white font-bold text-center shadow hover:bg-gray-900" download>macOS (Apple Silicon via Rosetta)</a>
          <a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-mac-x64.tar.gz?v=${BRIDGE_VER}`} className="px-4 py-3 rounded-2xl bg-neutral-900 text-white font-bold text-center shadow hover:bg-neutral-950" download>macOS (Intel/Rosetta)</a>
          <a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-linux-x64.tar.gz?v=${BRIDGE_VER}`} className="px-4 py-3 rounded-2xl bg-zinc-900 text-white font-bold text-center shadow hover:bg-zinc-950" download>Linux</a>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Apple-silicon Macs may need Rosetta to run the x64 build: <code>softwareupdate --install-rosetta --agree-to-license</code>
        </p>

        {/* Bridge Status */}
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="font-semibold mb-1">Bridge Status</div>
          {bridgeInfo?.ok ? (
            <div className="text-sm text-emerald-700">
              ✅ Detected: <span className="font-mono">v{bridgeInfo.version || "?"}</span> on{" "}
              <span className="font-mono">{bridgeInfo.platform || "?"}</span> | USB:{" "}
              <span className="font-mono">{String(bridgeInfo.usb !== undefined ? bridgeInfo.usb : "unknown")}</span>
            </div>
          ) : (
            <div className="text-sm text-rose-700">
              ❌ Not detected on <span className="font-mono">http://127.0.0.1:7777</span>
              {bridgeInfo?.error ? ` — ${bridgeInfo.error}` : ""}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setStatus(""); pingBridge(); }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
              Recheck
            </button>
           {String(bridgeInfo?.platform || "").toLowerCase().includes("win") && (
  <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
    <h3 className="text-xl font-bold">🪟 {t("Windows Printers (Spooler)")}</h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left column: either dropdown (if any) or manual input fallback */}
      <div>
        <label className="font-bold">{t("Printer Name")}</label>

        {winPrinters.length > 0 ? (
          <select
            className="rounded-xl border p-2 w-full"
            value={selectedWin}
            onChange={(e) => {
              setSelectedWin(e.target.value);
              setManualWinName(e.target.value);
              localStorage.setItem("winPrinterName", e.target.value);
            }}
          >
            <option value="">{t("Select a Windows printer")}</option>
            {winPrinters.map((p, i) => (
              <option key={`${p.name}:${i}`} value={p.name}>
                {p.isDefault ? "⭐ " : ""}{p.name} {p.driver ? `— ${p.driver}` : ""} {p.port ? `(${p.port})` : ""}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              className="rounded-xl border p-2 w-full font-mono"
              placeholder='Type exact Windows printer name (e.g. "EPSON TM-T20II Receipt")'
              value={manualWinName}
              onChange={(e) => setManualWinName(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              {t("List is empty. Enter the exact printer name from Control Panel → Devices and Printers, then click “Use This Name”.")}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const name = (manualWinName || "").trim();
                  setSelectedWin(name);
                  if (name) localStorage.setItem("winPrinterName", name);
                  setStatus(name ? `Using manual printer name: ${name}` : "Please enter a printer name.");
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              >
                {t("Use This Name")}
              </button>

              <button
                onClick={refreshWindowsPrinters}
                className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700"
              >
                {t("Re-scan Windows Printers")}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-1">
          {t("Shows printers installed in Windows (Control Panel → Devices and Printers).")}
        </p>
      </div>

      {/* Right column: actions */}
      <div className="flex items-end gap-2">
        <button
          onClick={handlePrintWindows}
          disabled={busy || !selectedWin}
          className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow hover:bg-blue-700 transition disabled:opacity-60"
        >
          {busy ? t("Printing…") : t("Print via Windows")}
        </button>

        <button
          onClick={async () => {
            setStatus("Detecting Windows printers…");
            await refreshWindowsPrinters();
          }}
          className="px-4 py-3 rounded-xl bg-slate-600 text-white font-bold shadow hover:bg-slate-700 transition"
        >
          {t("Scan")}
        </button>
      </div>
    </div>
  </div>
)}

          </div>
        </div>

        <button
          onClick={handleTestPrint}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Test Print
        </button>
      </div>

      {/* USB section */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow">
          🖨️ {t("USB Thermal Printer")}
        </h2>
        <button onClick={refreshUsb} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700 transition">
          {t("Scan USB")}
        </button>
      </div>

      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-bold">{t("USB Printer")}</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={selectedUsb ? keyFor(selectedUsb, 0) : ""}
              onChange={(e) => {
                const chosenKey = e.target.value;
                const found = usbPrinters.find((p, i) => keyFor(p, i) === chosenKey) || null;
                setSelectedUsb(found);
                if (found) localStorage.setItem("usbSelectedJson", JSON.stringify(found));
                else localStorage.removeItem("usbSelectedJson");
              }}
            >
              <option value="">{usbPrinters.length ? t("Select a device") : t("No devices found")}</option>
              {usbPrinters.map((p, i) => {
                const label =
                  (p.name || p.product || "USB Printer") +
                  `  (VID:${p.vendorId || "?"}  PID:${p.productId || "?"})`;
                return (
                  <option key={keyFor(p, i)} value={keyFor(p, i)}>
                    {label}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {t("If empty: install printer driver (Windows) or libusb (macOS/Linux), then replug.")}
            </p>
          </div>
          <div>
            <label className="font-bold">{t("Encoding")}</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={encoding}
              onChange={(e) => { setEncoding(e.target.value); localStorage.setItem("usbEncoding", e.target.value); }}
            >
              <option value="cp857">cp857 (Türkçe)</option>
              <option value="cp437">cp437</option>
              <option value="gb18030">gb18030</option>
              <option value="utf8">utf8 (printer must support)</option>
            </select>
            <label className="flex gap-2 items-center mt-2">
              <input
                type="checkbox"
                checked={autoCut}
                onChange={(e) => { setAutoCut(e.target.checked); localStorage.setItem("usbAutoCut", String(e.target.checked)); }}
              />
              {t("Auto Cut")}
            </label>
          </div>
        </div>
      </div>

      {/* Windows printers section */}
      {String(bridgeInfo?.platform || "").toLowerCase().includes("win") && (
        <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
          <h3 className="text-xl font-bold">🪟 {t("Windows Printers (Spooler)")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-bold">{t("Printer Name")}</label>
              <select
                className="rounded-xl border p-2 w-full"
                value={selectedWin}
                onChange={(e) => {
                  setSelectedWin(e.target.value);
                  localStorage.setItem("winPrinterName", e.target.value);
                }}
              >
                <option value="">{winPrinters.length ? t("Select a Windows printer") : t("No printers found")}</option>
                {winPrinters.map((p, i) => (
                  <option key={`${p.name}:${i}`} value={p.name}>
                    {p.isDefault ? "⭐ " : ""}{p.name} {p.driver ? `— ${p.driver}` : ""} {p.port ? `(${p.port})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {t("Shows printers installed in Windows (Control Panel → Devices and Printers).")}
              </p>
            </div>
            <div className="flex items-end">
              <button
                onClick={handlePrintWindows}
                disabled={busy || !selectedWin}
                className="px-6 py-3 rounded-xl bg-blue-600 text-white font-bold shadow hover:bg-blue-700 transition disabled:opacity-60"
              >
                {busy ? t("Printing…") : t("Print via Windows")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border p-4 bg-white/70 space-y-2">
          <label className="font-bold">{t("Shop Address on Ticket")}</label>
          <textarea
            className="border rounded-xl p-2 w-full font-mono resize-y min-h-[70px]"
            value={shopAddress}
            onChange={(e) => { setShopAddress(e.target.value); localStorage.setItem("shopAddress", e.target.value); }}
            placeholder="Your shop name\nStreet, City"
          />
          <div className="text-xs text-gray-500">{t("Shown at the top of the receipt.")}</div>
        </div>
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-4 relative min-h-[320px]">
          <div className="absolute top-3 right-4 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow">Live Preview</div>
          <pre className="font-mono text-[13px] leading-[1.2] whitespace-pre-wrap" style={{ width: "80mm", margin: "0 auto" }}>
{content}
          </pre>
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePrintUsb}
          disabled={busy}
          className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow hover:bg-emerald-700 transition disabled:opacity-60"
        >
          {busy ? t("Printing…") : t("Print via USB")}
        </button>
        <button
          onClick={handleBrowserPrint}
          className="px-6 py-3 rounded-xl bg-slate-700 text-white font-bold shadow hover:bg-slate-800 transition"
        >
          {t("Browser Print (Fallback)")}
        </button>
        <span className="text-sm text-gray-700 self-center">{status}</span>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <div>• Windows: install the printer’s USB driver if detection fails.</div>
        <div>• macOS/Linux: install <code>libusb</code> (e.g. <code>brew install libusb</code> / <code>apt-get install libusb-1.0-0</code>), then replug.</div>
      </div>
    </div>
  );
}
