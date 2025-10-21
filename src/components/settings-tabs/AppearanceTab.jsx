import { useTranslation } from "react-i18next";
import { useAppearance } from "../../context/AppearanceContext";
import { useAuth } from "../../context/AuthContext";
import React, { useEffect } from "react";
import secureFetch from "../../utils/secureFetch"; // ✅ Add this import

// Theme options
const themes = [
  { key: "light", label: "Light", icon: "🌞" },
  { key: "dark", label: "Dark", icon: "🌚" },
  { key: "system", label: "Auto", icon: "🌓" },
];

// Accent color map (RGB hex for preview)
const accentPreviewMap = {
  default: "#4f46e5", // fallback (indigo-600)
  "emerald-500": "#10b981",
  "rose-500": "#f43f5e",
  "amber-500": "#f59e0b",
  "cyan-500": "#06b6d4",
  "violet-500": "#8b5cf6",
  "lime-500": "#84cc16",
  "sky-500": "#0ea5e9",
};

// Build accent list
const accentColors = Object.keys(accentPreviewMap).map((value) => ({
  name: value.replace("-", " ").toUpperCase(),
  value,
}));

// ✅ Helpers
async function fetchUserAppearance() {
  return await secureFetch(`/settings/appearance`);
}

async function saveUserAppearance(appearance) {
  await secureFetch(`/settings/appearance`, {
    method: "POST",
    body: JSON.stringify(appearance),
  });
}


export default function AppearanceTab() {
  const { t } = useTranslation();
  const { appearance, setAppearance } = useAppearance();
  const { currentUser } = useAuth();

useEffect(() => {
  fetchUserAppearance()
    .then((appr) => appr && setAppearance(appr))
    .catch((err) => console.error("❌ Failed to fetch appearance settings:", err));
}, []);

const handleSave = async () => {
  try {
    await saveUserAppearance(appearance);
    alert("💾 " + t("Settings saved"));
  } catch (err) {
    console.error("❌ Failed to save appearance settings:", err);
    alert(t("Failed to save settings"));
  }
};

  return (
    <div className="bg-white dark:bg-gray-800 text-gray-800 dark:text-white rounded-xl shadow p-6 max-w-4xl mx-auto transition-colors">
      <h2 className="text-2xl font-semibold text-accent mb-6">
        🎨 {t("Appearance & UI Settings")}
      </h2>

      {/* Theme Selector */}
      <div className="mb-10">
        <label className="block text-lg font-semibold mb-3">{t("App Theme")}</label>
        <div className="flex gap-3">
          {themes.map((th) => (
            <button
              key={th.key}
              onClick={() =>
                setAppearance((prev) => ({
                  ...prev,
                  theme: th.key,
                  accent: th.key === "system" ? "indigo-600" : prev.accent ?? "indigo-600",
                }))
              }
              className={`flex flex-col items-center px-4 py-3 rounded-xl border transition-all duration-200 ${
                appearance?.theme === th.key
                  ? "bg-accent text-white border-accent shadow"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white hover:bg-accent/10 border"
              }`}
            >
              <span className="text-2xl">{th.icon}</span>
              <span className="text-sm mt-1">{t(th.label)}</span>
              {th.key === "system" && (
                <span className="text-[10px] mt-1 text-gray-400">{t("System Default")}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="mb-10">
        <label className="block text-lg font-semibold mb-3">{t("Font Size")}</label>
        <div className="flex justify-between px-2 text-sm text-gray-600 dark:text-gray-300 mb-1">
          <span>{t("Small")}</span>
          <span>{t("Medium")}</span>
          <span>{t("Large")}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          value={Math.max(
            0,
            ["small", "medium", "large"].indexOf(appearance?.fontSize ?? "medium")
          )}
          onChange={(e) =>
            setAppearance((prev) => ({
              ...prev,
              fontSize: ["small", "medium", "large"][parseInt(e.target.value)],
            }))
          }
          className="w-full accent-accent"
        />
      </div>

      {/* Accent Color */}
      <div className="mb-10">
        <label className="block text-lg font-semibold mb-3">{t("Accent Color")}</label>
        <div className="flex flex-wrap gap-4">
          {accentColors.map((c) => {
            const isSelected =
              (c.value === "default" && appearance?.accent === "indigo-600") ||
              appearance?.accent === c.value;

            return (
              <div key={c.value} className="flex flex-col items-center">
                <button
                  onClick={() =>
                    setAppearance((prev) => ({
                      ...prev,
                      accent: c.value === "default" ? "indigo-600" : c.value,
                    }))
                  }
                  className={`h-10 w-10 rounded-full shadow-md transition-all duration-300 border-2 ${
                    isSelected ? "ring-2 ring-offset-2 ring-accent" : "border-white"
                  }`}
                  style={{ backgroundColor: accentPreviewMap[c.value] }}
                  title={c.name}
                />
                {c.value === "default" && (
                  <span className="text-[10px] text-gray-400 mt-1">Default</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* High Contrast Toggle */}
      <div className="flex items-center justify-between mt-8">
        <span className="text-lg font-medium">{t("Enable High Contrast Mode")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!appearance?.highContrast}
            onChange={() =>
              setAppearance((prev) => ({ ...prev, highContrast: !prev.highContrast }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:bg-accent peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-10">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-accent text-white rounded-lg font-bold shadow hover:brightness-110 transition-all"
        >
          💾 {t("Save Settings")}
        </button>
      </div>
    </div>
  );
}
