import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import secureFetch from "../utils/secureFetch";
import { Eye, EyeOff, Search, Copy, Download, Printer, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useTranslation } from "react-i18next";

export default function QrMenuSettings() {
  const { t } = useTranslation();
  const [qrUrl, setQrUrl] = useState("");
  const [products, setProducts] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingLink, setLoadingLink] = useState(false);
  const qrRef = useRef();

  // ✅ Load products and short QR link
  useEffect(() => {
    const loadData = async () => {
      try {
        const prodData = await secureFetch("/products");
        setProducts(Array.isArray(prodData) ? prodData : prodData?.data || []);

        const disData = await secureFetch("/settings/qr-menu-disabled");
        if (Array.isArray(disData)) setDisabledIds(disData);
        else if (typeof disData === "object" && disData?.disabled) setDisabledIds(disData.disabled);

        // ✅ fetch short QR link (no JWT)
        setLoadingLink(true);
        const linkRes = await secureFetch("/settings/qr-link");
        if (linkRes?.success && linkRes.link) setQrUrl(linkRes.link);
        else toast.error(t("Failed to generate QR link"));
      } catch (err) {
        console.error("❌ Failed to load QR settings:", err);
        toast.error(t("Failed to load QR menu data"));
      } finally {
        setLoadingLink(false);
      }
    };
    loadData();
  }, [t]);

  const toggleDisable = async (productId) => {
    const updated = disabledIds.includes(productId)
      ? disabledIds.filter((id) => id !== productId)
      : [...disabledIds, productId];
    setDisabledIds(updated);
    try {
      await secureFetch(`/settings/qr-menu-disabled`, {
        method: "POST",
        body: JSON.stringify({ disabled: updated }),
      });
      toast.success(t("Saved successfully!"));
    } catch {
      toast.error(t("Failed to save changes"));
    }
  };

  const copyLink = () => {
    if (!qrUrl) return;
    navigator.clipboard.writeText(qrUrl);
    toast.info(t("QR link copied!"));
  };

  const downloadQR = () => {
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new window.Image();
    const size = 320;
    canvas.width = size;
    canvas.height = size;
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      const png = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = png;
      a.download = "beypro-qr-menu.png";
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const printQR = () => {
    if (!qrUrl) return;
    const svg = qrRef.current.innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`
      <html><head><title>${t("Print QR Code")}</title></head>
      <body style="text-align:center;font-family:sans-serif">
        <div style="margin-top:30px">${svg}</div>
        <div style="margin-top:10px;font-size:16px">${qrUrl}</div>
        <script>window.onload=()=>window.print()</script>
      </body></html>
    `);
    win.document.close();
  };

  const filteredProducts = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-extrabold mb-6 flex items-center gap-3 bg-gradient-to-r from-blue-600 via-fuchsia-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow">
        <QrCode className="w-9 h-9" />
        {t("QR Menu Settings")}
      </h1>

      {/* QR section */}
      <div className="flex flex-col md:flex-row items-center gap-8 mb-10 bg-gradient-to-br from-white/80 via-blue-50 to-indigo-100 dark:from-zinc-900/80 dark:via-blue-950/90 dark:to-indigo-950/90 rounded-3xl shadow-2xl p-7 border border-white/30 backdrop-blur-xl">
        <div
          ref={qrRef}
          className="bg-white dark:bg-zinc-950 rounded-2xl p-4 shadow-xl border border-blue-100 dark:border-blue-800 flex flex-col items-center"
        >
          {loadingLink ? (
            <div className="w-[180px] h-[180px] flex items-center justify-center text-gray-400">
              {t("Generating QR...")}
            </div>
          ) : (
            <QRCodeCanvas id="qrCanvas" value={qrUrl || ""} size={180} />
          )}
          <div className="font-mono text-xs text-gray-500 mt-3 text-center break-all max-w-xs">
            {qrUrl || t("QR link not available yet")}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full md:w-auto">
          <button
            onClick={copyLink}
            disabled={!qrUrl}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg hover:scale-105 transition"
          >
            <Copy className="w-4 h-4" /> {t("Copy Link")}
          </button>

          <button
            onClick={downloadQR}
            disabled={!qrUrl}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white shadow-lg hover:scale-105 transition"
          >
            <Download className="w-4 h-4" /> {t("Download QR")}
          </button>

          <button
            onClick={printQR}
            disabled={!qrUrl}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-slate-400 to-gray-700 text-white shadow-lg hover:scale-105 transition"
          >
            <Printer className="w-4 h-4" /> {t("Print QR")}
          </button>
        </div>
      </div>

      {/* Products list */}
      <div className="bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-blue-100 dark:border-zinc-800">
          <Search className="w-5 h-5 text-blue-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search products...")}
            className="flex-1 px-4 py-2 rounded-xl border-2 border-blue-100 bg-white dark:bg-zinc-900 text-base focus:ring-2 focus:ring-blue-300 transition"
          />
        </div>

        <div className="max-h-[440px] overflow-y-auto p-4">
          <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-transparent bg-clip-text">
            {t("Products visible in QR Menu")}
          </h2>
          {filteredProducts.length === 0 ? (
            <div className="text-center text-gray-400 py-10 text-lg">
              {t("No products found.")}
            </div>
          ) : (
            <ul className="divide-y divide-blue-50 dark:divide-zinc-900">
              {filteredProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 px-1">
                  <span
                    className={`flex items-center gap-2 font-medium ${
                      disabledIds.includes(p.id)
                        ? "line-through text-gray-400"
                        : "text-blue-900 dark:text-blue-100"
                    }`}
                  >
                    {p.image && (
                      <img
                        src={
                          p.image.startsWith("http")
                            ? p.image
                            : `${window.location.origin.replace(":5173", ":5000")}/uploads/${p.image}`
                        }
                        alt={p.name}
                        className="w-7 h-7 rounded-lg object-cover border"
                      />
                    )}
                    {p.name}
                  </span>
                  <button
                    className={`ml-4 w-14 h-8 rounded-full flex items-center px-1 transition-all ${
                      disabledIds.includes(p.id)
                        ? "bg-gray-300"
                        : "bg-gradient-to-r from-blue-400 to-indigo-500 shadow-lg"
                    }`}
                    onClick={() => toggleDisable(p.id)}
                  >
                    <span
                      className={`w-6 h-6 rounded-full bg-white shadow transition-all flex items-center justify-center ${
                        disabledIds.includes(p.id) ? "translate-x-6" : "translate-x-0"
                      }`}
                    >
                      {disabledIds.includes(p.id) ? (
                        <EyeOff className="w-4 h-4 text-gray-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-blue-500" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
