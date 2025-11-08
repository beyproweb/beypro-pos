import React, { useState } from "react";
import { QRCode } from "react-qrcode-logo";
import { Copy, Download } from "lucide-react";

export default function QrLinkGenerator() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchQrLink = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await fetch("/api/settings/qr-link", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setLink(data.link);
      else alert(data.error || "Failed to generate QR link");
    } catch (e) {
      console.error(e);
      alert("Network error while fetching QR link");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(link);
    alert("✅ QR link copied!");
  };

  const downloadQr = () => {
    const canvas = document.querySelector("#qrCanvas canvas");
    if (!canvas) return;
    const pngUrl = canvas
      .toDataURL("image/png")
      .replace("image/png", "image/octet-stream");
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = "Beypro-QR.png";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-900 p-6 shadow-md flex flex-col items-center gap-4">
      <button
        onClick={fetchQrLink}
        disabled={loading}
        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-xl shadow hover:scale-105 transition"
      >
        {loading ? "Generating..." : "Generate QR Link"}
      </button>

      {link && (
        <div className="flex flex-col items-center gap-3 mt-4" id="qrCanvas">
          <QRCode
            value={link}
            size={180}
            quietZone={10}
            fgColor="#000000"
            logoImage="/logo192.png" // optional logo in center
            logoWidth={40}
            logoHeight={40}
          />
          <p className="text-sm text-center text-slate-700 dark:text-slate-300 break-all max-w-xs">
            {link}
          </p>

          <div className="flex gap-3 mt-2">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-700 text-sm"
            >
              <Copy size={14} /> Copy Link
            </button>

            <button
              onClick={downloadQr}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-700 text-sm"
            >
              <Download size={14} /> Download QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
