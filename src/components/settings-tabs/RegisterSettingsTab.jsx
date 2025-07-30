import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";

export default function RegisterSettingsTab() {
  const { t } = useTranslation();

  const [register, setRegister] = useState({
    openingCash: "500.00",
    requirePin: true,
    autoClose: false,
    sendSummaryEmail: true,
  });

  useSetting("register", setRegister, {
    openingCash: "500.00",
    requirePin: true,
    autoClose: false,
    sendSummaryEmail: true,
  });

  const handleSave = async () => {
    await saveSetting("register", register);
    alert("✅ Register settings saved!");
  };

  return (
  <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
    <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
      🧾 {t("Cash Register Settings")}
    </h2>

    {/* Opening Cash */}
    <div className="mb-6">
      <label className="block text-lg font-medium text-gray-800 dark:text-white mb-1">
        {t("Suggested Opening Cash (₺)")}
      </label>
      <input
        type="number"
        value={register.openingCash}
        onChange={(e) =>
          setRegister((prev) => ({ ...prev, openingCash: e.target.value }))
        }
        className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-300"
      />
    </div>

    {/* Toggles */}
    <div className="space-y-5">
      {/* Require PIN */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Require PIN to open/close")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.requirePin}
            onChange={() =>
              setRegister((prev) => ({ ...prev, requirePin: !prev.requirePin }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Auto-Close */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Auto-close at midnight")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.autoClose}
            onChange={() =>
              setRegister((prev) => ({ ...prev, autoClose: !prev.autoClose }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      {/* Send Summary Email */}
      <div className="flex items-center justify-between">
        <span className="text-lg text-gray-800 dark:text-white">{t("Send daily summary email")}</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={register.sendSummaryEmail}
            onChange={() =>
              setRegister((prev) => ({
                ...prev,
                sendSummaryEmail: !prev.sendSummaryEmail,
              }))
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-indigo-400 rounded-full peer-checked:bg-indigo-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>
    </div>

    {/* Save Button */}
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
