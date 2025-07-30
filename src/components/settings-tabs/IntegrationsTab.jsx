import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";

export default function IntegrationsTab() {
  const { t } = useTranslation();

  // Include auto_confirm_orders in initial state
  const [integrations, setIntegrations] = useState({
    whatsapp: true,
    getir: false,
    trendyol: false,
    yemeksepeti: false,
    qr_menu: true,
    auto_confirm_orders: false, // <-- NEW!
  });

  useSetting("integrations", setIntegrations, {
    whatsapp: true,
    getir: false,
    trendyol: false,
    yemeksepeti: false,
    qr_menu: true,
    auto_confirm_orders: false, // <-- NEW!
  });

  const handleSave = async () => {
    await saveSetting("integrations", integrations);
    alert("🔌 Integrations saved!");
  };

  const integrationList = [
    { key: "whatsapp", name: "WhatsApp Auto Order Message" },
    { key: "getir", name: "Getir Restaurant Sync" },
    { key: "trendyol", name: "Trendyol Go Integration" },
    { key: "yemeksepeti", name: "Yemeksepeti Menu Sync" },
    { key: "qr_menu", name: "Digital QR Menu Link" },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
      <div className="space-y-6">
        {/* Existing toggles */}
        {integrationList.map(({ key, name }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-lg text-gray-800 dark:text-white">
              {t(name)}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!integrations[key]}
                onChange={() =>
                  setIntegrations((prev) => ({
                    ...prev,
                    [key]: !prev[key],
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>
        ))}

        {/* NEW: Auto Confirm toggle */}
        <div className="flex items-center justify-between mt-8 border-t pt-6">
          <div>
            <span className="text-lg font-semibold text-indigo-700 dark:text-indigo-300">
              ✅ {t("Auto Confirm Incoming Orders")}
            </span>
            <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
              {t(
                "When enabled, online orders from integrations (like Yemeksepeti or Getir) will be confirmed automatically."
              )}
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!!integrations.auto_confirm_orders}
              onChange={() =>
                setIntegrations((prev) => ({
                  ...prev,
                  auto_confirm_orders: !prev.auto_confirm_orders,
                }))
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>

      <div className="flex justify-end mt-10">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 text-white rounded-lg font-bold shadow transition-all"
        >
          💾 {t("Save Settings")}
        </button>
      </div>
    </div>
  );
}
