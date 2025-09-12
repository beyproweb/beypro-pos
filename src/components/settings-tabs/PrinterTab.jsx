// ==============================
// File: src/pages/PrinterTab.jsx
// Purpose: Stable bridge download links (GitHub Releases or backend),
//          Bridge status ping, robust USB scan & print fallback
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

// ⬅️ Ensure version query param is present for cache-busting
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

// ---- Helpers for stable device identity ----
function keyFor(dev, idx = 0) {
  const vid = `${dev?.vendorId ?? dev?.VID ?? ""}`.trim();
  const pid = `${dev?.productId ?? dev?.PID ?? ""}`.trim();
  const path = `${dev?.path ?? dev?.deviceAddress ?? ""}`.trim();
  const base = [vid, pid, path].join(":");
  return base || `idx:${idx}`; // last resort fallback
}
function sameKey(a, b, idxA = 0, idxB = 0) {
  return keyFor(a, idxA) === keyFor(b, idxB);
}

export default function PrinterTab() {
  const { t } = useTranslation();

  const [printerIpState, setPrinterIpState] = useState(
    localStorage.getItem("printerIp") || ""
  );
  const [bridgeInfo, setBridgeInfo] = useState(null);
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [selected, setSelected] = useState(() => {
    const v = localStorage.getItem("usbSelectedJson");
    return v ? JSON.parse(v) : null;
  });

  const [encoding, setEncoding] = useState(localStorage.getItem("usbEncoding") || "cp857");
  const [autoCut, setAutoCut]   = useState(localStorage.getItem("usbAutoCut") !== "false");
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

      // Ensure normalized strings for all IDs/fields we rely on
      list = list.map(p => ({
        ...p,
        vendorId: `${p.vendorId ?? p.VID ?? ""}`,
        productId: `${p.productId ?? p.PID ?? ""}`,
        path: `${p.path ?? p.deviceAddress ?? ""}`,
      }));

      setUsbPrinters(list);
      setStatus(`Found ${list.length} USB device(s).`);

      // Reconcile selection or auto-select single device
      const saved = selected;
      if (list.length === 1 && !saved) {
        setSelected(list[0]);
        localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
      } else if (saved) {
        const idx = list.findIndex((p, i) => sameKey(p, saved, i, 0));
        if (idx >= 0) {
          setSelected(list[idx]);
          localStorage.setItem("usbSelectedJson", JSON.stringify(list[idx]));
        } else if (list.length) {
          setSelected(list[0]);
          localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
        } else {
          setSelected(null);
          localStorage.removeItem("usbSelectedJson");
        }
      }
    } catch (e) {
      setStatus(`Scan failed ❌ ${e.message || e}`);
    }
  };

  useEffect(() => {
    pingBridge();
    refreshUsb();
    pingTimer.current = setInterval(pingBridge, 5000);
    return () => clearInterval(pingTimer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Tolerant USB print: prefer /print (VID/PID), fallback to /usb/print-raw (path) ---
  const handlePrint = async () => {
    // If nothing selected but exactly one exists, auto-pick it
    let chosen = selected;
    if (!chosen && usbPrinters.length === 1) {
      chosen = usbPrinters[0];
      setSelected(chosen);
      localStorage.setItem("usbSelectedJson", JSON.stringify(chosen));
    }
    if (!chosen) {
      setStatus("Select a USB printer from the list first.");
      return;
    }

    setBusy(true);
    setStatus("Printing…");
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
      const bytes = encoder.encode(content + "\n\n\n");
      const dataBase64 = btoa(String.fromCharCode(...bytes));
      await fetchJson(`${base}/usb/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, dataBase64, cut: !!autoCut }),
      });
    };

    try {
      try {
        await tryBridgeMiniPrint();
      } catch {
        await tryLegacyUsbRaw();
      }
      setStatus("Printed ✅");
    } catch (e) {
      setStatus(`Print failed ❌ ${e.message || e}`);
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
          {/* Use the same x64 package on Apple Silicon (installer will use Rosetta if needed) */}
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
          <button onClick={() => { setStatus(""); pingBridge(); }} className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
            Recheck
          </button>
        </div>

        <button
          onClick={handleTestPrint}
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Test Print
        </button>
      </div>

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
              value={selected ? keyFor(selected, 0) : ""}
              onChange={(e) => {
                const chosenKey = e.target.value;
                const found = usbPrinters.find((p, i) => keyFor(p, i) === chosenKey) || null;
                setSelected(found);
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

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePrint}
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
