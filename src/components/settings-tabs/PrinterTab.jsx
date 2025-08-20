import React, { useState,useEffect } from "react";
import { useTranslation } from "react-i18next";
import socket from "../../utils/socket";
console.log("🔌 [AUTO-PRINT] socket:", socket);
const API_URL = import.meta.env.VITE_API_URL || "";

const SHOP_ID = 1;
const previewOrder = {
  id: 12345,
  date: "2025-07-18 13:30",
  customer: "Shai Hurry",
  address: "123 Smashburger Ave.",
  items: [
    { name: "Smash Burger", qty: 2, price: 195 },
    { name: "Fries", qty: 1, price: 59 },
    { name: "Coke", qty: 1, price: 35 },
  ],
  total: 484,
  payment: "Cash",
};

const defaultLayout = {
  fontSize: 14,
  lineHeight: 1.3,
  showLogo: true,
  showQr: true,
  showHeader: true,
  showFooter: true,
  headerText: "Beypro POS - HurryBey",
  footerText: "Thank you for your order! / Teşekkürler!",
  alignment: "left",
  shopAddress: "Your Shop Address\n123 Street Name, İzmir",
  extras: [
    { label: "Instagram", value: "@yourshop" },
    { label: "Tax No", value: "1234567890" },
  ],
  showPacketCustomerInfo: true,
  receiptWidth: "58mm",
     receiptHeight: "",// <--- ADD THIS
};


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

async function handleOrderConfirmed(payload) {
  try {
    // Resolve a numeric internal order id from various payload shapes
    const candidates = [
      payload?.id,
      payload?.order?.id,
      payload?.orderId,
    ];
    const orderId = candidates
      .map(v => Number(v))
      .find(v => Number.isFinite(v)) ?? null;

    if (!Number.isFinite(orderId)) {
      console.warn("[AUTO-PRINT] Could not parse numeric id from payload:", payload);
      return; // do NOT fetch /api/orders/undefined
    }

    const fetchById = async (id) => {
      const url = `${API_URL}/api/orders/${id}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    };

    // Retry loop to tolerate read-after-write lag
    const maxAttempts = 10;
    const baseDelayMs = 400;
    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const order = await fetchById(orderId);

        // If items aren’t in yet, treat as not-ready and retry
        const itemCount = Array.isArray(order?.items) ? order.items.length : 0;
        if (itemCount === 0 && attempt < maxAttempts) {
          throw new Error(`Order ${orderId} has 0 items (attempt ${attempt})`);
        }

        console.log("[AUTO-PRINT] Ready to print:", { id: orderId, items: itemCount });
        await autoPrintReceipt(order);
        return; // success
      } catch (err) {
        lastErr = err;
        const jitter = Math.floor(Math.random() * 150);
        const delay = baseDelayMs * attempt + jitter; // simple backoff + jitter
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.error(`[AUTO-PRINT] Failed to fetch order ${orderId} after retries:`, lastErr);
  } catch (outer) {
    console.error("[AUTO-PRINT] handleOrderConfirmed fatal:", outer);
  }
}


// ✅ Print order receipt in hidden window
function autoPrintReceipt(order) {
  const printWindow = window.open("", "PrintWindow", "width=400,height=600");
  printWindow.document.write(`
    <html>
      <head>
        <title>Order Receipt</title>
        <style>
          body {
            font-family: monospace;
            font-size: ${layout.fontSize}px;
            line-height: ${layout.lineHeight};
            text-align: ${layout.alignment};
            background: #fff;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div>
          <h3>${layout.headerText}</h3>
          <p>Order #${order.id}</p>
          <p>Total: ₺${order.total}</p>
          <hr/>
          ${order.items.map(item => `
            <div>${item.quantity}x ${item.name} - ₺${item.price}</div>
          `).join("")}
          <hr/>
          <p>${layout.footerText}</p>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 400);
}

useEffect(() => {
  if (!socket) return;

  const handler = (payload) => {
    const idForLog =
      payload?.orderId ?? payload?.id ?? payload?.order?.id ??
      payload?.order_number ?? payload?.number ?? payload;
    console.log("🖨️ [PrinterTab] order_confirmed received:", idForLog, "(preview-only)");
    // Printing is centrally handled in GlobalOrderAlert.jsx to avoid duplicates.
  };

  socket.on("order_confirmed", handler);
  return () => socket.off("order_confirmed", handler);
}, []);


function handlePrintTest() {
  const preview = document.getElementById("printable-receipt");
  if (!preview) return alert("Receipt preview not found!");

  // Open print window
  const printWindow = window.open("", "PrintWindow", "width=400,height=600");
  printWindow.document.write(`
    <html>
      <head>
        <title>Test Print</title>
        <style>
          @media print {
            body {
              margin: 0;
              background: #fff;
            }
          }
          body {
            font-family: monospace;
            font-size: ${layout.fontSize}px;
            line-height: ${layout.lineHeight};
            text-align: ${layout.alignment};
            background: #fff;
          }
          .receipt-preview {
            width: ${layout.receiptWidth === "custom"
              ? (layout.customReceiptWidth || "70mm")
              : layout.receiptWidth};
            min-height: ${layout.receiptHeight || 400}px;
            margin: 0 auto;
            padding: 0;
            box-shadow: none;
            border: none;
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
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 400);
}


useEffect(() => {
  setLoading(true);
  fetch(`${API_URL}/api/printer-settings/${SHOP_ID}`)
    .then(res => {
      if (!res.ok) throw new Error("Not found");
      return res.json();
    })
    .then(data => {
      if (data.layout) setLayout(data.layout);
      setError("");
    })
    .catch(() => setError("Could not load printer settings."))
    .finally(() => setLoading(false));
}, []);
  // For adding/editing extras
  const handle = (k, v) => setLayout(prev => ({ ...prev, [k]: v }));
  const handleExtraChange = (i, key, v) => {
    const updated = [...layout.extras];
    updated[i][key] = v;
    setLayout(prev => ({ ...prev, extras: updated }));
  };
  const addExtra = () =>
    setLayout(prev => ({
      ...prev,
      extras: [...prev.extras, { label: "", value: "" }],
    }));
  const removeExtra = i =>
    setLayout(prev => ({
      ...prev,
      extras: prev.extras.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow mb-3">
        🖨️ {t("Printer Settings")}
      </h2>
      <div className="flex gap-4 mb-3">
  <label className="flex gap-2 items-center">
    <input
      type="checkbox"
      checked={autoPrintTable}
      onChange={e => {
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
      onChange={e => {
        setAutoPrintPacket(e.target.checked);
        localStorage.setItem("autoPrintPacket", e.target.checked);
      }}
    />
    Auto Print Packet Orders (Phone/Online)
  </label>
</div>

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
              onChange={e => handle("shopAddress", e.target.value)}
              placeholder={t("Type your shop's printout address here")}
            />
          </div>
          <div>
  <label className="font-bold">{t("Receipt Width")}:</label>
  <select
    value={layout.receiptWidth}
    onChange={e => handle("receiptWidth", e.target.value)}
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
      onChange={e => handle("customReceiptWidth", e.target.value)}
    />
  )}
</div>
<div>
  <label className="font-bold flex gap-2 items-center">
    <input
      type="checkbox"
      checked={layout.showPacketCustomerInfo}
      onChange={e => handle("showPacketCustomerInfo", e.target.checked)}
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
    onChange={e => handle("receiptHeight", e.target.value)}
  />
  <div className="text-xs text-gray-500">
    {t("Set a fixed height for your receipt (e.g. 300mm, 1000px). Leave blank for auto height.")}
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
                    onChange={e =>
                      handleExtraChange(i, "label", e.target.value)
                    }
                  />
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Value")}
                    value={extra.value}
                    onChange={e =>
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
              onChange={e => handle("fontSize", Number(e.target.value))}
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
              onChange={e => handle("lineHeight", Number(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-400">{layout.lineHeight}</div>
          </div>
          <div>
            <label className="font-bold">{t("Text Alignment")}:</label>
            <select
              value={layout.alignment}
              onChange={e => handle("alignment", e.target.value)}
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
                onChange={e => handle("showLogo", e.target.checked)}
              />
              {t("Show Logo")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showHeader}
                onChange={e => handle("showHeader", e.target.checked)}
              />
              {t("Show Header")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showFooter}
                onChange={e => handle("showFooter", e.target.checked)}
              />
              {t("Show Footer")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showQr}
                onChange={e => handle("showQr", e.target.checked)}
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
                onChange={e => handle("headerText", e.target.value)}
              />
            </div>

          )}


          {layout.showFooter && (
            <div>
              <label className="font-bold">{t("Footer Text")}:</label>
              <input
                className="border rounded-xl p-2 w-full"
                value={layout.footerText}
                onChange={e => handle("footerText", e.target.value)}
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
          ? (layout.customReceiptWidth || "70mm")
          : layout.receiptWidth,
      minHeight: layout.receiptHeight || 400,
      maxHeight: layout.receiptHeight || "none",
      height: layout.receiptHeight || "auto",
      margin: "0 auto",
      overflow: layout.receiptHeight ? "hidden" : "visible",
    }}
  >

            {/* Logo */}
            {layout.showLogo && (
              <div className="flex justify-center mb-2">
                <img src="/logo192.png" alt="Logo" className="h-10 mb-2" />
              </div>
            )}
            {/* Header */}
            {layout.showHeader && (
              <div className="font-bold text-lg mb-2">{layout.headerText}</div>
            )}
            {/* Shop Address */}
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
              {previewOrder.items.map(item => (
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


            {/* Extras section in preview */}
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
            {/* QR */}
            {layout.showQr && (
              <div className="flex justify-center mt-3">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?data=https://hurrybey.com&size=80x80"
                  alt="QR"
                />
              </div>
            )}
            {/* Footer */}
            {layout.showFooter && (
              <div className="mt-4 text-xs text-gray-500">{layout.footerText}</div>
            )}
          </div>
       <span className="absolute top-3 right-6 bg-indigo-200 text-indigo-800 rounded-xl px-3 py-1 font-mono text-xs shadow live-preview-badge">
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
        method: "PUT", // Use PUT for update, POST for first-time creation
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
      setTimeout(() => setSuccess(false), 1800); // hide success after 1.8s
    }
  }}
>

  {saving ? "Saving..." : "Save Printer Settings"}


</button>
{success && (
  <div className="mt-2 text-green-600 font-bold animate-pulse">Saved!</div>
)}

{error && (
  <div className="mt-2 text-red-600 font-bold">{error}</div>
)}



    </div>


  );
}
