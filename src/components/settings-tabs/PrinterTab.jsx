// src/pages/PrinterTab.jsx — USB via LOCAL BRIDGE (127.0.0.1:7777)
// Updated: bridge download links now point to your domain /bridge/* via Vercel rewrite to GitHub Releases
// Added: Bridge status check (pings /ping), robust USB scan fallback

import React, { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

const BRIDGE = "http://127.0.0.1:7777"; // local bridge service (runs beside the USB printer)
const BRIDGE_DOWNLOAD_BASE = `${window.location.origin.replace(/\/$/, "")}/bridge`;

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
  try {
    data = JSON.parse(txt);
  } catch {
    throw new Error(`Non-JSON from ${url} (HTTP ${r.status})`);
  }
  if (!r.ok || data?.ok === false || data?.error) {
    throw new Error(data?.error || `HTTP ${r.status}`);
  }
  return data;
}

function makeTicketText(order, shopAddress) {
  const lines = [];
  lines.push("*** BEYPRO ***");
  if (shopAddress) lines.push(shopAddress);
  lines.push(new Date().toLocaleString());
  lines.push(`Order #${order.id}`);
  lines.push("------------------------------");
  order.items.forEach((i) => {
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

export default function PrinterTab() {
  const { t } = useTranslation();

  const [bridgeInfo, setBridgeInfo] = useState(null);
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [selected, setSelected] = useState(() => {
    const v = localStorage.getItem("usbSelectedJson");
    return v ? JSON.parse(v) : null;
  });

  const [encoding, setEncoding] = useState(localStorage.getItem("usbEncoding") || "cp857");
  const [autoCut, setAutoCut] = useState(localStorage.getItem("usbAutoCut") !== "false");
  const [shopAddress, setShopAddress] = useState(localStorage.getItem("shopAddress") || "Hurrybey Burger\nİzmir");

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const content = useMemo(() => makeTicketText(previewOrder, shopAddress), [shopAddress]);
  const pingTimer = useRef(null);

  // --- Bridge status ping ---
  const pingBridge = async () => {
    try {
      const j = await fetchJson(`${BRIDGE.replace(/\/+$/, "")}/ping`, { cache: "no-store" });
      setBridgeInfo(j);
    } catch (e) {
      setBridgeInfo({ ok: false, error: e.message || String(e) });
    }
  };

  // --- USB scan with fallback (/printers -> /usb/list) ---
  const refreshUsb = async () => {
    setStatus("Detecting USB printers…");
    try {
      // Try bridge-mini format
      let list = [];
      try {
        const j1 = await fetchJson(`${BRIDGE.replace(/\/+$/, "")}/printers`, { cache: "no-store" });
        list = j1?.usb || j1?.printers?.usb || [];
      } catch {
        // Fallback to local-print-bridge format
        const j2 = await fetchJson(`${BRIDGE.replace(/\/+$/, "")}/usb/list`, { cache: "no-store" });
        list = j2?.ports || [];
        // normalize to {vendorId, productId} if available
        list = list.map((p) => ({
          vendorId: p.vendorId || p.vendorID || p.vendor || "",
          productId: p.productId || p.productID || p.product || "",
          path: p.path || p.comName || "",
        }));
      }

      setUsbPrinters(list);
      setStatus(`Found ${list.length} USB device(s).`);
      if (!selected && list.length > 0) {
        setSelected(list[0]);
        localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = async () => {
    if (!selected?.vendorId || !selected?.productId) return setStatus("Pick a USB printer first.");
    setBusy(true);
    setStatus("Printing…");
    const base = BRIDGE.replace(/\/+$/, "");

    // Preferred: bridge-mini generic /print endpoint
    const tryBridgeMiniPrint = async () => {
      await fetchJson(`${base}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interface: "usb",
          vendorId: selected.vendorId, // e.g. "0x04b8"
          productId: selected.productId,
          content,
          encoding,
          cut: !!autoCut,
          cashdraw: false,
        }),
      });
    };

    // Fallback: older local bridge raw USB (needs device path)
    const tryLegacyUsbRaw = async () => {
      if (!selected?.path) throw new Error("Legacy USB print requires a device path (not available).");
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content + "\n\n\n"); // simple test
      const dataBase64 = btoa(String.fromCharCode(...bytes));
      await fetchJson(`${base}/usb/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, dataBase64 }),
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
      </head><body><pre class="receipt">${content.replace(/[<&>]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre></body></html>
    `);
    w.document.close();
    w.focus();
    w.print();
    setTimeout(() => w.close(), 300);
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-win-x64.zip`} download>Windows</a>
<a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-mac-universal.tar.gz`} download>macOS (Universal)</a>
<a href={`${BRIDGE_DOWNLOAD_BASE}/beypro-bridge-linux-x64.tar.gz`} download>Linux</a>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Apple-silicon Macs may need Rosetta for the x64 build:{" "}
          <code>softwareupdate --install-rosetta --agree-to-license</code>
        </p>

        {/* Bridge Status */}
        <div className="mt-3 rounded-xl border bg-white p-3">
          <div className="font-semibold mb-1">Bridge Status</div>
          {bridgeInfo?.ok ? (
            <div className="text-sm text-emerald-700">
              ✅ Detected: <span className="font-mono">v{bridgeInfo.version || "?"}</span> on{" "}
              <span className="font-mono">{bridgeInfo.platform || "?"}</span> | USB:{" "}
              <span className="font-mono">
                {String(bridgeInfo.usb !== undefined ? bridgeInfo.usb : "unknown")}
              </span>
            </div>
          ) : (
            <div className="text-sm text-rose-700">
              ❌ Not detected on <span className="font-mono">http://127.0.0.1:7777</span>
              {bridgeInfo?.error ? ` — ${bridgeInfo.error}` : ""}
            </div>
          )}
          <button
            onClick={() => {
              setStatus("");
              pingBridge();
            }}
            className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
          >
            Recheck
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow">
          🖨️ {t("USB Thermal Printer")}
        </h2>
        <button
          onClick={refreshUsb}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold shadow hover:bg-indigo-700 transition"
        >
          {t("Scan USB")}
        </button>
      </div>

      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-bold">{t("USB Printer")}</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={selected ? `${selected.vendorId}:${selected.productId}` : ""}
              onChange={(e) => {
                const [vid, pid] = e.target.value.split(":");
                const found = usbPrinters.find((p) => p.vendorId === vid && p.productId === pid) || null;
                setSelected(found);
                localStorage.setItem("usbSelectedJson", JSON.stringify(found));
              }}
            >
              <option value="">
                {usbPrinters.length ? t("Select a device") : t("No devices found")}
              </option>
              {usbPrinters.map((p, i) => (
                <option key={i} value={`${p.vendorId}:${p.productId}`}>
                  {`VID:${p.vendorId || "?"}  PID:${p.productId || "?"}`}
                </option>
              ))}
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
              onChange={(e) => {
                setEncoding(e.target.value);
                localStorage.setItem("usbEncoding", e.target.value);
              }}
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
                onChange={(e) => {
                  setAutoCut(e.target.checked);
                  localStorage.setItem("usbAutoCut", String(e.target.checked));
                }}
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
            onChange={(e) => {
              setShopAddress(e.target.value);
              localStorage.setItem("shopAddress", e.target.value);
            }}
            placeholder="Your shop name\nStreet, City"
          />
          <div className="text-xs text-gray-500">{t("Shown at the top of the receipt.")}</div>
        </div>

        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-4 relative min-h-[320px]">
          <div className="absolute top-3 right-4 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow">
            Live Preview
          </div>
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
          {t("Browser Print (Fallback")}
        </button>
        <span className="text-sm text-gray-700 self-center">{status}</span>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <div>• Windows: install the printer’s USB driver if detection fails.</div>
        <div>
          • macOS/Linux: install <code>libusb</code> (e.g. <code>brew install libusb</code> /{" "}
          <code>apt-get install libusb-1.0-0</code>), then replug.
        </div>
      </div>
    </div>
  );
}
