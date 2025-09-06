// src/pages/PrinterTab.jsx — USB-ONLY (Pro Clean)
// Wires to backend routes:
//   GET  ${API_URL}/api/printer-settings/printers
//   POST ${API_URL}/api/printer-settings/print   { interface:"usb", vendorId, productId, content, encoding?, cut? }

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

/* ---------------------- Backend base ---------------------- */
const API_URL = (import.meta?.env?.VITE_API_URL || "http://127.0.0.1:5000").replace(/\/+$/, "");

/* ---------------------- Minimal preview demo order ---------------------- */
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
const calcTotal = (items) => items.reduce((s, i) => s + i.price * i.qty, 0);

/* ---------------------- Helpers ---------------------- */
async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); }
  catch { throw new Error(`Non-JSON from ${url} (HTTP ${r.status})`); }
  if (!r.ok || data?.error || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
function makeTicketText({ order, shopAddress }) {
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
  lines.push(`TOTAL: ${calcTotal(order.items).toFixed(2)} TL`);
  lines.push(`PAY: ${order.payment}`);
  lines.push("");
  // Turkish chars sample for cp857:
  lines.push("ĞÜŞİÖÇ ğüşiöç — Teşekkürler!");
  lines.push("\n");
  return lines.join("\n");
}

/* =================================================================
   USB Printer Tools
   ================================================================= */
export default function PrinterTab() {
  const { t } = useTranslation();

  // USB devices from backend
  const [usbPrinters, setUsbPrinters] = useState([]);
  const [selectedUsb, setSelectedUsb] = useState(() => {
    const v = localStorage.getItem("usbSelectedJson");
    return v ? JSON.parse(v) : null;
  });

  const [encoding, setEncoding] = useState(localStorage.getItem("usbEncoding") || "cp857");
  const [autoCut, setAutoCut] = useState(localStorage.getItem("usbAutoCut") !== "false"); // default true
  const [shopAddress, setShopAddress] = useState(localStorage.getItem("shopAddress") || "Hurrybey Burger\nİzmir");

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const content = useMemo(
    () => makeTicketText({ order: previewOrder, shopAddress }),
    [shopAddress]
  );

  // Load available USB printers
  const refreshUsb = async () => {
    setStatus("Detecting USB printers…");
    try {
      const j = await fetchJson(`${API_URL}/api/printer-settings/printers`, { cache: "no-store" });
      const list = j?.printers?.usb || [];
      setUsbPrinters(list);
      setStatus(`Found ${list.length} USB device(s).`);
      if (!selectedUsb && list.length > 0) {
        setSelectedUsb(list[0]);
        localStorage.setItem("usbSelectedJson", JSON.stringify(list[0]));
      }
    } catch (e) {
      setStatus(`Scan failed ❌ ${e.message || e}`);
    }
  };
  useEffect(() => { refreshUsb(); }, []); // on mount

  const handlePrint = async () => {
    if (!selectedUsb?.vendorId || !selectedUsb?.productId) {
      return setStatus("Pick a USB printer first.");
    }
    setBusy(true);
    setStatus("Printing…");
    try {
      await fetchJson(`${API_URL}/api/printer-settings/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interface: "usb",
          vendorId: selectedUsb.vendorId, // e.g. "0x04b8"
          productId: selectedUsb.productId,
          content,
          encoding,           // cp857 (Türkçe) by default
          cut: !!autoCut,
          cashdraw: false,
        }),
      });
      setStatus("Printed ✅");
    } catch (e) {
      setStatus(`Print failed ❌ ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  // Browser print (fallback)
  const handleBrowserPrint = () => {
    const win = window.open("", "print", "width=700,height=900");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Print Preview</title>
          <style>
            @media print { body { margin:0; } }
            body { font-family: monospace; font-size: 13px; line-height: 1.2; }
            .receipt { width: 80mm; margin: 0 auto; }
            hr { border: 0; border-top: 1px dashed #999; }
          </style>
        </head>
        <body>
          <pre class="receipt">${content.replace(/[<&>]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
    setTimeout(() => win.close(), 300);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
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

      {/* Device picker + options */}
      <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-bold">{t("USB Printer")}</label>
            <select
              className="rounded-xl border p-2 w-full"
              value={selectedUsb ? `${selectedUsb.vendorId}:${selectedUsb.productId}` : ""}
              onChange={(e) => {
                const [vendorId, productId] = e.target.value.split(":");
                const found = usbPrinters.find(p => p.vendorId === vendorId && p.productId === productId) || null;
                setSelectedUsb(found);
                localStorage.setItem("usbSelectedJson", JSON.stringify(found));
              }}
            >
              <option value="">{usbPrinters.length ? t("Select a device") : t("No devices found")}</option>
              {usbPrinters.map((p, idx) => (
                <option key={idx} value={`${p.vendorId}:${p.productId}`}>
                  {`VID:${p.vendorId}  PID:${p.productId}`}
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

      {/* Preview + Address */}
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

        {/* Live Text Preview (monospace) */}
        <div className="bg-gradient-to-b from-gray-100 to-white rounded-2xl border border-indigo-200 shadow-xl p-4 relative min-h-[320px]">
          <div className="absolute top-3 right-4 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow">
            Live Preview
          </div>
          <pre
            className="font-mono text-[13px] leading-[1.2] whitespace-pre-wrap"
            style={{ width: "80mm", margin: "0 auto" }}
          >
{content}
          </pre>
        </div>
      </div>

      {/* Actions */}
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

      {/* Foot hints */}
      <div className="text-xs text-gray-500 space-y-1">
        <div>• {t("Windows")}: {t("Install the printer's USB driver if detection fails.")}</div>
        <div>• macOS/Linux: <code>libusb</code> ({t("e.g.")} <code>brew install libusb</code> / <code>apt-get install libusb-1.0-0</code>)</div>
        <div>• {t("Encoding tip")}: <code>cp857</code> {t("prints Turkish characters like ğüşiöç correctly on most thermal printers.")}</div>
      </div>
    </div>
  );
}
