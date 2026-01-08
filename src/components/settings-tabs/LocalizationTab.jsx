import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";
import { CURRENCY_KEYS } from "../../utils/currency";
import { useCurrency } from "../../context/CurrencyContext";
const languageOptions = [
  { label: "English", code: "en" },
  { label: "Turkish", code: "tr" },
  { label: "German", code: "de" },
  { label: "French", code: "fr" },
];

function normalizeLanguageCode(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const mapped =
    lower === "english"
      ? "en"
      : lower === "turkish"
        ? "tr"
        : lower === "german"
          ? "de"
          : lower === "french"
            ? "fr"
            : lower.split("-")[0];
  return languageOptions.some((opt) => opt.code === mapped) ? mapped : null;
}

export default function LocalizationTab() {
  const { t, i18n } = useTranslation();
  const { currencyKey, setCurrencyKey, config } = useCurrency();
  const [language, setLanguage] = useState("English");
  const [currency, setCurrency] = useState(currencyKey || "₺ TRY");

  // ✅ Load current localization settings
  useEffect(() => {
    secureFetch("/settings/localization")
      .then((data) => {
        const nextLangCode = normalizeLanguageCode(data?.language);
        if (nextLangCode) {
          const langLabel =
            languageOptions.find((opt) => opt.code === nextLangCode)?.label ||
            "English";
          setLanguage(langLabel);
          i18n.changeLanguage(nextLangCode);
          try {
            localStorage.setItem("beyproLanguage", nextLangCode);
            localStorage.setItem("beyproGuestLanguage", nextLangCode);
          } catch {}
        }
        if (data.currency) {
          setCurrency(data.currency);
          setCurrencyKey(data.currency);
        }
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load localization:", err);
      });
  }, []);

  // ✅ Save changes
  const handleSave = async () => {
    const selectedLang =
      languageOptions.find((opt) => opt.label === language)?.code || "en";

    try {
      await secureFetch(`/settings/localization`, {
        method: "POST",
        body: JSON.stringify({ language: selectedLang, currency }),
      });

      i18n.changeLanguage(selectedLang); // apply immediately
      setCurrencyKey(currency); // apply currency immediately
      try {
        localStorage.setItem("beyproLanguage", selectedLang);
        localStorage.setItem("beyproGuestLanguage", selectedLang);
      } catch {}
      toast.success(`✅ ${t("Localization saved successfully!")}`);
    } catch (err) {
      console.error("❌ Failed to save localization:", err);
      toast.error(t("Failed to save localization"));
    }
  };

  // ✅ Render UI
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 transition-colors duration-300">
      <h2 className="text-2xl font-semibold mb-6 text-indigo-600 dark:text-indigo-300">
        {t("🌍 Language & Localization")}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Language Selector */}
        <div className="bg-indigo-50 dark:bg-indigo-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-600 shadow">
          <label className="block mb-2 font-medium text-gray-700 dark:text-gray-200">
            {t("🌐 Preferred Language")}
          </label>
          <select
            value={language}
            onChange={(e) => {
              const selectedLabel = e.target.value;
              const selectedLang =
                languageOptions.find((opt) => opt.label === selectedLabel)?.code ||
                "en";
              setLanguage(selectedLabel);
              i18n.changeLanguage(selectedLang);
              try {
                localStorage.setItem("beyproLanguage", selectedLang);
                localStorage.setItem("beyproGuestLanguage", selectedLang);
              } catch {}
            }}
            className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            {languageOptions.map((opt) => (
              <option key={opt.code} value={opt.label}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Currency Selector */}
        <div className="bg-indigo-50 dark:bg-indigo-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-600 shadow">
          <label className="block mb-2 font-medium text-gray-700 dark:text-gray-200">
            {t("💱 Currency")}{" "}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({config?.symbol || "₺"})
            </span>
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          >
            {CURRENCY_KEYS.map((cur) => (
              <option key={cur} value={cur}>
                {cur}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white rounded-lg font-bold shadow transition-all"
        >
          💾 {t("Save All")}
        </button>
      </div>
    </div>
  );
}
