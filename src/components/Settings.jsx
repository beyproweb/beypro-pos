import React, { useState, useEffect } from "react";
import { settingsTabs } from "../constants/settingsTabs";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";

// Tab components
import ShopHoursTab from "../components/settings-tabs/ShopHoursTab";
import LocalizationTab from "../components/settings-tabs/LocalizationTab";
import NotificationsTab from "../components/settings-tabs/NotificationsTab";
import SubscriptionTab from "../components/settings-tabs/SubscriptionTab";
import PaymentMethodsTab from "../components/settings-tabs/PaymentMethodsTab";
import RegisterSettingsTab from "../components/settings-tabs/RegisterSettingsTab";
import UserManagementTab from "../components/settings-tabs/UserManagementTab";
import IntegrationsTab from "../components/settings-tabs/IntegrationsTab";
import LogFilesTab from "../components/settings-tabs/LogFilesTab";
import AppearanceTab from "../components/settings-tabs/AppearanceTab";
import PrinterTab from "../components/settings-tabs/PrinterTab";

const tabComponents = {
  shop_hours: ShopHoursTab,
  localization: LocalizationTab,
  notifications: NotificationsTab,
  subscription: SubscriptionTab,
  payments: PaymentMethodsTab,
  register: RegisterSettingsTab,
  users: UserManagementTab,
  integrations: IntegrationsTab,
  inventory: LogFilesTab,
  appearance: AppearanceTab,
  printer: PrinterTab,
};

export default function SettingsPage() {
  const { t } = useTranslation();

  // Only allow users with "settings" permission
 const anySettingsAccess = [
  "settings",
  "settings-appearance",
  "settings-users",
  "settings-notifications",
  "settings-shop-hours",
  "settings-localization",
  "settings-subscription",
  "settings-payments",
  "settings-register",
  "settings-integrations",
  "settings-inventory",
].some(useHasPermission);

if (!anySettingsAccess) {
  return (
    <div className="p-12 text-2xl text-red-600 text-center">
      {t("Access Denied: You do not have permission to view Settings.")}
    </div>
  );
}


  // Only show tabs the user has permission for
  const permittedTabs = settingsTabs.filter(tab => useHasPermission(tab.permission));
  const defaultTab = permittedTabs.length > 0 ? permittedTabs[0].key : null;

  // Set the first available tab as default
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Whenever permittedTabs change, ensure activeTab is still valid
  useEffect(() => {
    if (!permittedTabs.some(tab => tab.key === activeTab)) {
      setActiveTab(defaultTab);
    }
    // eslint-disable-next-line
  }, [defaultTab, activeTab, permittedTabs.length]);

  const ActiveComponent = tabComponents[activeTab];

  return (
    <div className="p-6 max-w-7xl mx-auto text-base bg-transparent dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">

      <div className="flex rounded-2xl shadow-2xl overflow-hidden border border-accent/20">
        {/* Sidebar Tabs */}
        <div className="w-72 bg-gradient-to-b from-indigo-100 to-white dark:from-gray-800 dark:to-gray-900 border-r border-accent/20">
          {permittedTabs.map(({ key, label, emoji }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full text-left px-5 py-4 font-semibold text-lg transition-all duration-200 ${
                activeTab === key
                  ? "bg-accent text-white shadow-inner"
                  : "text-accent hover:bg-accent/10"
              }`}
            >
              {emoji} {t(label)}
            </button>
          ))}
        </div>

        {/* Active Tab Content */}
        <div className="flex-1 bg-transparent dark:bg-gray-950 p-8 min-h-[600px] transition-colors">
          {permittedTabs.some(tab => tab.key === activeTab) && ActiveComponent ? (
            <ActiveComponent />
          ) : (
            <div className="text-red-600 text-lg p-6">
              {t("Access Denied for this tab.")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
