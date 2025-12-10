import React from "react";
import { useTranslation } from "react-i18next";
import CameraTab from "../components/settings-tabs/CameraTab";

export default function CamerasPage() {
  const { t } = useTranslation();

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <header className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            📷 {t("Live Cameras")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("Manage and configure your live camera feeds for monitoring")}
          </p>
        </header>
        <div className="p-4 sm:p-6">
          <CameraTab />
        </div>
      </div>
    </div>
  );
}
