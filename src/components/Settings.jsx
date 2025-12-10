import React, { useState, useEffect } from "react";
import { settingsTabs } from "../constants/settingsTabs";
import { useTranslation } from "react-i18next";
import { useHasPermission } from "../components/hooks/useHasPermission";
import { useNavigate, useParams } from "react-router-dom";

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
import PrinterTabModern from "../components/settings-tabs/PrinterTabModern";
import CameraTab from "../components/settings-tabs/CameraTab";
import TablesSettingsTab from "../components/settings-tabs/TablesSettingsTab";

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
  printers: PrinterTabModern,
  cameras: CameraTab,
  tables: TablesSettingsTab,
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tabKey } = useParams();

  // ✅ List of all valid settings permissions
  const settingsPermissions = [
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
    "settings-printers",
    "settings-cameras",
    "settings-tables",
  ];

  // ✅ Properly check each permission
  const anySettingsAccess = settingsPermissions.some((perm) =>
    useHasPermission(perm)
  );

  if (!anySettingsAccess) {
    return (
      <div className="p-12 text-2xl text-red-600 text-center">
        {t("Access Denied: You do not have permission to view any Settings tabs.")}
      </div>
    );
  }

  // ✅ Only show tabs the user actually has permission for
  const normalizedTabKey = tabKey ? tabKey.toLowerCase() : null;

  const permittedTabs = settingsTabs.filter((tab) =>
    useHasPermission(tab.permission)
  );
  const defaultTab = permittedTabs.length > 0 ? permittedTabs[0].key : null;
  const hasTabAccess = normalizedTabKey
    ? permittedTabs.some((tab) => tab.key === normalizedTabKey)
    : false;

  const [activeTab, setActiveTab] = useState(
    hasTabAccess ? normalizedTabKey : defaultTab
  );

  useEffect(() => {
    if (normalizedTabKey && hasTabAccess) {
      setActiveTab(normalizedTabKey);
      return;
    }
    if (!normalizedTabKey && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [normalizedTabKey, hasTabAccess, defaultTab]);

  useEffect(() => {
    if (!defaultTab) return;
    if (!normalizedTabKey) {
      navigate(`/settings/${defaultTab}`, { replace: true });
      return;
    }
    if (!hasTabAccess) {
      navigate(`/settings/${defaultTab}`, { replace: true });
    }
  }, [normalizedTabKey, hasTabAccess, defaultTab, navigate]);

  const ActiveComponent = activeTab ? tabComponents[activeTab] : null;

  const handleTabSelect = (key) => {
    if (key === normalizedTabKey) return;
    setActiveTab(key);
    navigate(`/settings/${key}`);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-base bg-transparent dark:bg-gray-900 text-gray-900 dark:text-white transition-colors">
      <div className="flex flex-col md:flex-row rounded-2xl shadow-2xl overflow-hidden border border-accent/20 backdrop-blur-sm">
        {/* Tabs rail */}
        <div className="w-full md:w-72 bg-gradient-to-b from-indigo-100 to-white dark:from-gray-800 dark:to-gray-900 border-b md:border-b-0 md:border-r border-accent/20">
          <div className="flex md:flex-col gap-2 md:gap-0 overflow-x-auto md:overflow-visible px-3 py-3 md:px-0 md:py-0">
            {permittedTabs.map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => handleTabSelect(key)}
                className={`flex-shrink-0 md:flex-none text-left px-4 md:px-6 py-3 md:py-4 font-semibold text-sm md:text-lg rounded-xl md:rounded-none transition-all duration-200 ${
                  activeTab === key
                    ? "bg-accent text-white shadow-lg md:shadow-inner"
                    : "text-accent hover:bg-accent/10"
                }`}
                title={t(label)}
              >
                <span className="whitespace-nowrap">
                  {emoji} {t(label)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Active Tab Content */}
        <div className="flex-1 bg-transparent dark:bg-gray-950 p-4 md:p-8 min-h-[480px] transition-colors">
          {permittedTabs.some((tab) => tab.key === activeTab) && ActiveComponent ? (
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
