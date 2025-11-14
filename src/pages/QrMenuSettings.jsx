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
  const [settings, setSettings] = useState({
  main_title: "",
  subtitle: "",
  tagline: "",
  phone: "",
  primary_color: "#4F46E5",
  hero_slides: [],
  story_title: "",
  story_text: "",
  story_image: "",
  reviews: [],
  social_instagram: "",
  social_tiktok: "",
  social_website: "",
});

function updateField(key, value) {
  setSettings((prev) => ({ ...prev, [key]: value }));
}

function addHeroSlide() {
  setSettings((prev) => ({
    ...prev,
    hero_slides: [...prev.hero_slides, { title: "", subtitle: "", image: "" }],
  }));
}

function updateHeroSlide(index, key, value) {
  const updated = [...settings.hero_slides];
  updated[index][key] = value;
  setSettings((p) => ({ ...p, hero_slides: updated }));
}

async function uploadHeroImage(e, index) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const res = await secureFetch("/upload", {
    method: "POST",
    body: formData,
  });

  if (res.url) {
    updateHeroSlide(index, "image", res.url);
  }
}

async function uploadStoryImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const res = await secureFetch("/upload", {
    method: "POST",
    body: formData,
  });

  if (res.url) {
    updateField("story_image", res.url);
  }
}

function updateReview(i, key, value) {
  const updated = [...settings.reviews];
  updated[i][key] = value;
  setSettings((p) => ({ ...p, reviews: updated }));
}

function addReview() {
  setSettings((prev) => ({
    ...prev,
    reviews: [...prev.reviews, { name: "", rating: 5, text: "" }],
  }));
}

async function saveAllCustomization() {
  try {
    await secureFetch("/settings/qr-menu-customization", {
      method: "POST",
      body: JSON.stringify(settings),
    });
    toast.success("Saved!");
  } catch {
    toast.error("Save failed");
  }
}

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
        const token = localStorage.getItem("token");
const linkRes = await secureFetch("/settings/qr-link", {
  headers: { Authorization: `Bearer ${token}` },
});

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

      {/* --------------------------------------------------------------------------------
         QR MENU WEBSITE BUILDER 
      -------------------------------------------------------------------------------- */}
      <div className="mt-12 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-gray-200 dark:border-gray-700">
        <h2 className="text-3xl font-extrabold mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-transparent bg-clip-text">
          🛠️ QR Menu Website Builder
        </h2>

        {/* Main Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="font-semibold">{t("Main Title")}</label>
            <input
              type="text"
              value={settings.main_title}
              onChange={(e) => updateField("main_title", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Subtitle")}</label>
            <input
              type="text"
              value={settings.subtitle}
              onChange={(e) => updateField("subtitle", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Tagline (small)")}</label>
            <input
              type="text"
              value={settings.tagline}
              onChange={(e) => updateField("tagline", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Phone Number")}</label>
            <input
              type="text"
              value={settings.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className="w-full mt-1 p-3 rounded-xl border bg-white dark:bg-zinc-800"
            />
          </div>

          <div>
            <label className="font-semibold">{t("Primary Accent Color")}</label>
            <input
              type="color"
              value={settings.primary_color || "#4F46E5"}
              onChange={(e) => updateField("primary_color", e.target.value)}
              className="w-20 h-12 p-1 rounded-xl border"
            />
          </div>
        </div>

        {/* HERO SLIDER */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Hero Slider")}</h3>

          {settings.hero_slides.map((slide, index) => (
            <div
              key={index}
              className="bg-white dark:bg-zinc-800 border rounded-2xl p-4 mb-4 shadow-md"
            >
              <label className="font-semibold">{t("Slide Image")}</label>
              <input type="file" onChange={(e) => uploadHeroImage(e, index)} className="w-full mt-1" />

              <label className="font-semibold mt-2 block">{t("Title")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.title}
                onChange={(e) => updateHeroSlide(index, "title", e.target.value)}
              />

              <label className="font-semibold mt-2 block">{t("Subtitle")}</label>
              <input
                className="w-full p-3 rounded-xl border"
                value={slide.subtitle}
                onChange={(e) => updateHeroSlide(index, "subtitle", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addHeroSlide}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Slide")}
          </button>
        </div>

        {/* STORY */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Our Story Section")}</h3>

          <label className="font-semibold">{t("Story Title")}</label>
          <input
            type="text"
            value={settings.story_title}
            onChange={(e) => updateField("story_title", e.target.value)}
            className="w-full p-3 rounded-xl border"
          />

          <label className="font-semibold mt-3">{t("Story Text")}</label>
          <textarea
            rows="5"
            value={settings.story_text}
            onChange={(e) => updateField("story_text", e.target.value)}
            className="w-full p-3 rounded-xl border resize-none"
          />

          <label className="font-semibold mt-3">{t("Story Image")}</label>
          <input type="file" onChange={uploadStoryImage} className="w-full" />
        </div>

        {/* REVIEWS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Customer Reviews")}</h3>

          {settings.reviews.map((rev, index) => (
            <div key={index} className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-xl mb-3">
              <input
                type="text"
                className="w-full p-2 rounded-xl border"
                placeholder={t("Name")}
                value={rev.name}
                onChange={(e) => updateReview(index, "name", e.target.value)}
              />

              <input
                type="number"
                min="1"
                max="5"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Rating")}
                value={rev.rating}
                onChange={(e) => updateReview(index, "rating", e.target.value)}
              />

              <textarea
                rows="3"
                className="w-full mt-2 p-2 rounded-xl border"
                placeholder={t("Review text")}
                value={rev.text}
                onChange={(e) => updateReview(index, "text", e.target.value)}
              />
            </div>
          ))}

          <button
            onClick={addReview}
            className="mt-2 px-4 py-2 bg-indigo-500 text-white rounded-xl"
          >
            ➕ {t("Add Review")}
          </button>
        </div>

        {/* SOCIAL LINKS */}
        <div className="mt-10">
          <h3 className="text-xl font-bold mb-3 text-indigo-600">{t("Social Media")}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Instagram URL"
              value={settings.social_instagram}
              onChange={(e) => updateField("social_instagram", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder="TikTok URL"
              value={settings.social_tiktok}
              onChange={(e) => updateField("social_tiktok", e.target.value)}
              className="p-3 rounded-xl border"
            />

            <input
              type="text"
              placeholder="Website URL"
              value={settings.social_website}
              onChange={(e) => updateField("social_website", e.target.value)}
              className="p-3 rounded-xl border"
            />
          </div>
        </div>

        {/* SAVE BUTTON */}
        <div className="flex justify-end mt-10">
          <button
            onClick={saveAllCustomization}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white rounded-xl shadow-lg font-bold"
          >
            💾 {t("Save All Changes")}
          </button>
        </div>
      </div>
    </div>
  </div>
);

}
