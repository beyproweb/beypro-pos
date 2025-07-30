import React, { useEffect, useState, useRef } from "react";
import { toast } from "react-toastify";
import QRCode from "react-qr-code";
import { QrCode, Eye, EyeOff, Search } from "lucide-react"; // Modern icons
const API_URL = import.meta.env.VITE_API_URL || "";
export default function QrMenuSettings() {
  const [qrUrl, setQrUrl] = useState("");
  const [products, setProducts] = useState([]);
  const [disabledIds, setDisabledIds] = useState([]);
  const [search, setSearch] = useState("");
  const qrRef = useRef();

  useEffect(() => {
    fetch(`${API_URL}/api/products`).then(r => r.json()).then(setProducts);
    fetch(`${API_URL}/api/settings/qr-menu-disabled`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setDisabledIds(data);
        else if (typeof data === "string") {
          try { setDisabledIds(JSON.parse(data) || []); }
          catch { setDisabledIds([]); }
        } else if (typeof data === "object" && data !== null && Array.isArray(data.disabled)) {
          setDisabledIds(data.disabled);
        } else setDisabledIds([]);
      });
    setQrUrl(`${window.location.origin}/qr-menu`);
  }, []);

  const toggleDisable = (productId) => {
    const safeIds = Array.isArray(disabledIds) ? disabledIds : [];
    const updated = safeIds.includes(productId)
      ? safeIds.filter(id => id !== productId)
      : [...safeIds, productId];
    setDisabledIds(updated);
    fetch(`${API_URL}/api/settings/qr-menu-disabled`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: updated }),
    }).then(() => toast.success("Saved!"));
  };

  // Download QR as PNG
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

  // Print QR
  const printQR = () => {
    const svg = qrRef.current.innerHTML;
    const win = window.open("", "_blank");
    win.document.write(`
      <html>
      <head><title>Print QR Code</title></head>
      <body style="text-align:center">
        <div style="margin-top:30px">${svg}</div>
        <div style="margin-top:10px; font-family:sans-serif; font-size:18px">${qrUrl}</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  // --- Product search ---
  const filteredProducts = products.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Title */}
      <h1 className="text-3xl font-extrabold mb-6 flex items-center gap-3 bg-gradient-to-r from-blue-600 via-fuchsia-500 to-indigo-600 text-transparent bg-clip-text tracking-tight drop-shadow">
        <QrCode className="w-9 h-9" />
        QR Menu Settings
      </h1>

      {/* QR Card */}
      <div className="flex flex-col md:flex-row items-center gap-8 mb-10 bg-gradient-to-br from-white/70 via-blue-50 to-indigo-100 dark:from-zinc-900/80 dark:via-blue-950/90 dark:to-indigo-950/90 rounded-3xl shadow-2xl p-7 border border-white/30 backdrop-blur-xl">
        <div ref={qrRef} className="bg-white dark:bg-zinc-950 rounded-2xl p-4 shadow-xl border border-blue-100 dark:border-blue-800 flex flex-col items-center">
          <QRCode value={qrUrl} size={180} />
          <div className="font-mono text-xs text-gray-500 mt-3">{qrUrl}</div>
        </div>
        <div className="flex flex-col gap-3">
          <button
            onClick={downloadQR}
            className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg hover:scale-105 transition"
          >Download QR</button>
          <button
            onClick={printQR}
            className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-slate-400 to-gray-700 text-white shadow-lg hover:scale-105 transition"
          >Print QR</button>
        </div>
      </div>

      {/* Products List */}
      <div className="mb-3 flex items-center gap-3">
        <Search className="w-5 h-5 text-blue-600" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products..."
          className="flex-1 px-4 py-2 rounded-xl border-2 border-blue-100 bg-white dark:bg-zinc-900 text-base focus:ring-2 focus:ring-blue-300 transition"
        />
      </div>

      <div className="bg-white/90 dark:bg-zinc-950/80 rounded-3xl shadow-xl border border-blue-100 dark:border-blue-800 max-h-[420px] overflow-y-auto p-4 mt-2">
        <h2 className="text-lg font-semibold mb-4 bg-gradient-to-r from-fuchsia-500 to-indigo-600 text-transparent bg-clip-text">
          Products visible in QR Menu
        </h2>
        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-lg">No products found.</div>
        ) : (
          <ul className="divide-y divide-blue-50 dark:divide-zinc-900">
            {filteredProducts.map(p => (
              <li key={p.id} className="flex items-center justify-between py-2 px-1">
                <span className={`flex items-center gap-2 font-medium ${disabledIds.includes(p.id) ? "line-through text-gray-400" : "text-blue-900 dark:text-blue-100"}`}>
                  {p.image && <img src={p.image.startsWith("http") ? p.image : `${window.location.origin.replace(':5173', ':5000')}/uploads/${p.image}`} alt={p.name} className="w-7 h-7 rounded-lg object-cover border" />}
                  {p.name}
                </span>
                {/* Toggle switch */}
                <button
                  className={`ml-4 w-14 h-8 rounded-full flex items-center px-1 transition-all ${disabledIds.includes(p.id)
                    ? "bg-gray-300"
                    : "bg-gradient-to-r from-blue-400 to-indigo-500 shadow-lg"
                  }`}
                  onClick={() => toggleDisable(p.id)}
                  aria-label={disabledIds.includes(p.id) ? "Enable" : "Disable"}
                >
                  <span className={`w-6 h-6 rounded-full bg-white shadow transition-all flex items-center justify-center
                    ${disabledIds.includes(p.id) ? "translate-x-6" : "translate-x-0"}
                  `}>
                    {disabledIds.includes(p.id)
                      ? <EyeOff className="w-4 h-4 text-gray-400" />
                      : <Eye className="w-4 h-4 text-blue-500" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
