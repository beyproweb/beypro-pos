import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import socket from "../../utils/socket";

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
  receiptHeight: "",
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

  // Printer method + preferred printer
  const [printMethod, setPrintMethod] = useState(
    localStorage.getItem("printMethod") || "system" // "system" | "qz"
  );
  const [printers, setPrinters] = useState([]);
  const [preferredPrinter, setPreferredPrinter] = useState(
    localStorage.getItem("preferredPrinter") || ""
  );
  const [qzStatus, setQzStatus] = useState("disconnected"); // disconnected | connected | error

  // Load saved layout from backend
  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/printer-settings/${SHOP_ID}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (data.layout) setLayout(data.layout);
        setError("");
      })
      .catch(() => setError("Could not load printer settings."))
      .finally(() => setLoading(false));
  }, []);

  // Dynamically load qz-tray client if it's missing
  function loadQzScript() {
    return new Promise((resolve, reject) => {
      if (window.qz) return resolve();
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qz-tray/qz-tray.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load qz-tray.js"));
      document.body.appendChild(s);
    });
  }

  // Dev-only: allow unsigned connection during development
  function setupQzDevSecurity() {
    if (!window.qz || !qz.security) return;
    try {
      qz.security.setCertificatePromise((resolve, reject) => resolve(null));
      qz.security.setSignaturePromise((toSign) => (resolve, reject) => resolve(null));
    } catch {}
  }

  // Robust connect that auto-loads client and uses dev handshake
  async function ensureQzConnected() {
    try {
      if (!window.qz) {
        await loadQzScript(); // try to load the client if missing
      }
      if (!window.qz) throw new Error("QZ Tray client script not found");

      // Dev handshake (unsigned) so connect works without cert during development
      setupQzDevSecurity();

      if (!qz.websocket.isActive()) {
        await qz.websocket.connect(); // requires QZ Tray desktop app running
      }
      setQzStatus("connected");
      return true;
    } catch (e) {
      console.warn("[QZ] connect failed:", e);
      setQzStatus("error");
      return false;
    }
  }

  async function loadQzPrinters() {
    if (printMethod !== "qz") return;
    const ok = await ensureQzConnected();
    if (!ok) return;
    try {
      const list = await qz.printers.find();
      setPrinters(list || []);
      if (!preferredPrinter && list?.length) {
        setPreferredPrinter(list[0]);
        localStorage.setItem("preferredPrinter", list[0]);
      }
    } catch (e) {
      console.warn("[QZ] list printers failed:", e);
    }
  }

  // Load printer list when switching to QZ method
  useEffect(() => {
    if (printMethod === "qz") {
      loadQzPrinters();
    }
    return () => {
      if (window.qz && qz.websocket.isActive()) {
        qz.websocket.disconnect().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printMethod]);

  // Just to show we hear order events here (printing handled globally)
  useEffect(() => {
    if (!socket) return;
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
    socket.on("order_confirmed", handler);
    return () => socket.off("order_confirmed", handler);
  }, []);

  // Test print using current preview (system dialog)
  function handlePrintTest() {
    const preview = document.getElementById("printable-receipt");
    if (!preview) return alert("Receipt preview not found!");

    const printWindow = window.open("", "PrintWindow", "width=400,height=600");
    printWindow.document.write(`
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

  // Handlers for layout form
  const handle = (k, v) => setLayout((prev) => ({ ...prev, [k]: v }));
  const handleExtraChange = (i, key, v) => {
    const updated = [...layout.extras];
    updated[i][key] = v;
    setLayout((prev) => ({ ...prev, extras: updated }));
  };
  const addExtra = () =>
    setLayout((prev) => ({
      ...prev,
      extras: [...prev.extras, { label: "", value: "" }],
    }));
  const removeExtra = (i) =>
    setLayout((prev) => ({
      ...prev,
      extras: prev.extras.filter((_, idx) => idx !== i),
    }));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-3xl font-extrabold bg-gradient-to-r from-fuchsia-500 via-blue-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow mb-3">
        🖨️ {t("Printer Settings")}
      </h2>

      {/* Auto-print toggles + PRINTER DROPDOWNS */}
      <div className="flex flex-col gap-4 mb-3">
        <div className="flex flex-wrap gap-4">
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
            Auto Print Packet Orders (Phone/Online)
          </label>
        </div>

        <div className="rounded-2xl border p-4 bg-white/70 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-bold">Auto-print Method</label>
              <select
                className="rounded-xl border border-gray-300 p-2 w-full"
                value={printMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  setPrintMethod(v);
                  localStorage.setItem("printMethod", v);
                }}
              >
                <option value="system">System dialog (popup/iframe)</option>
                <option value="qz">QZ Tray (silent)</option>
              </select>

              {printMethod === "qz" && qzStatus !== "connected" && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm p-2">
                  QZ Tray not connected. Make sure the <b>QZ Tray</b> app is installed and running on this computer,
                  then click <b>Refresh</b>. Until then, printing will fall back to the system dialog.
                </div>
              )}
            </div>

            <div>
              <label className="font-bold">Preferred Printer</label>
              <div className="flex gap-2">
                <select
                  className="rounded-xl border border-gray-300 p-2 w-full"
                  disabled={printMethod !== "qz"}
                  value={preferredPrinter}
                  onChange={(e) => {
                    setPreferredPrinter(e.target.value);
                    localStorage.setItem("preferredPrinter", e.target.value);
                  }}
                >
                  <option value="">(Default system printer)</option>
                  {printers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  className="px-3 py-2 rounded-xl bg-indigo-100 text-indigo-700"
                  disabled={printMethod !== "qz"}
                  onClick={() => loadQzPrinters()}
                >
                  Refresh
                </button>
              </div>
              {printMethod === "qz" && (
                <div className="text-xs mt-1">
                  QZ:{" "}
                  <span
                    className={
                      qzStatus === "connected"
                        ? "text-green-600"
                        : qzStatus === "error"
                        ? "text-red-600"
                        : "text-gray-600"
                    }
                  >
                    {qzStatus}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
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
              onChange={(e) => handle("shopAddress", e.target.value)}
              placeholder={t("Type your shop's printout address here")}
            />
          </div>

          {/* Width */}
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

          {/* Packet info toggle */}
          <div>
            <label className="font-bold flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showPacketCustomerInfo}
                onChange={(e) =>
                  handle("showPacketCustomerInfo", e.target.checked)
                }
              />
              {t("Show Customer Name, Phone & Address on Packet Receipt")}
            </label>
            <div className="text-xs text-gray-500 pl-7">
              {t(
                "When enabled, the packet/delivery receipt will display the customer's info (name, phone, address) at the top."
              )}
            </div>
          </div>

          {/* Height */}
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
              {t(
                "Set a fixed height for your receipt (e.g. 300mm, 1000px). Leave blank for auto height."
              )}
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
                    onChange={(e) =>
                      handleExtraChange(i, "label", e.target.value)
                    }
                  />
                  <input
                    className="border rounded-xl p-2 flex-1"
                    placeholder={t("Value")}
                    value={extra.value}
                    onChange={(e) =>
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
              <input
                type="checkbox"
                checked={layout.showLogo}
                onChange={(e) => handle("showLogo", e.target.checked)}
              />
              {t("Show Logo")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showHeader}
                onChange={(e) => handle("showHeader", e.target.checked)}
              />
              {t("Show Header")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showFooter}
                onChange={(e) => handle("showFooter", e.target.checked)}
              />
              {t("Show Footer")}
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={layout.showQr}
                onChange={(e) => handle("showQr", e.target.checked)}
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
                onChange={(e) => handle("headerText", e.target.value)}
              />
            </div>
          )}

          {layout.showFooter && (
            <div>
              <label className="font-bold">{t("Footer Text")}:</label>
              <input
                className="border rounded-xl p-2 w-full"
                value={layout.footerText}
                onChange={(e) => handle("footerText", e.target.value)}
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
                  ? layout.customReceiptWidth || "70mm"
                  : layout.receiptWidth,
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

            {layout.showHeader && (
              <div className="font-bold text-lg mb-2">{layout.headerText}</div>
            )}

            <div className="text-xs whitespace-pre-line mb-2">
              {layout.shopAddress}
            </div>
            <div className="text-xs mb-1">{previewOrder.date}</div>
            <div className="mb-1">
              {t("Order")} #{previewOrder.id}
            </div>

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

            {layout.showQr && (
              <div className="flex justify-center mt-3">
                <img
                  src="https://api.qrserver.com/v1/create-qr-code/?data=https://hurrybey.com&size=80x80"
                  alt="QR"
                />
              </div>
            )}

            {layout.showFooter && (
              <div className="mt-4 text-xs text-gray-500">
                {layout.footerText}
              </div>
            )}
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
            const res = await fetch(`${API_URL}/api/printer-settings/${SHOP_ID}`, {
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

      {success && (
        <div className="mt-2 text-green-600 font-bold animate-pulse">Saved!</div>
      )}
      {error && <div className="mt-2 text-red-600 font-bold">{error}</div>}
    </div>
  );
}
