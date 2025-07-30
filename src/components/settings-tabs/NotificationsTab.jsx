import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSetting, saveSetting } from "../hooks/useSetting";
import { toast } from "react-toastify";
export default function NotificationsTab() {
  const { t } = useTranslation();


  const [volume, setVolume] = useState(0.8);
  const audioRefs = useRef({});


  const eventLabels = {
    new_order: "New Order",
    order_preparing: "Preparing",
    order_ready: "Order Ready",
    order_delivered: "Delivered",
    payment_made: "Payment Made",
    stock_low: "Stock Low",
    stock_restocked: "New Stock",
    order_delayed: "Delayed Order Alert",
    driver_arrived: "Driver Delivered",
    yemeksepeti_order: "Yemeksepeti Order",
  };

  const availableSounds = [
    "new_order.mp3", "alert.mp3", "chime.mp3", "alarm.mp3", "cash.mp3", "success.mp3", "horn.mp3", "warning.mp3", "yemeksepeti.mp3", "none",
  ];

  const roles = ["kitchen", "cashier", "manager"];
  const options = ["app", "email", "whatsapp"];

  const defaultEventSounds = {
    new_order: "new_order.mp3",
    order_preparing: "pop.mp3",
    order_ready: "chime.mp3",
    order_delivered: "success.mp3",
    payment_made: "cash.mp3",
    stock_low: "warning.mp3",
    stock_restocked: "ding.mp3",
    order_delayed: "alarm.mp3",
    driver_arrived: "horn.mp3",
  };

  const defaultConfig = {
    enabled: true,
    defaultSound: "ding",
      volume: 0.8,
    channels: {
      kitchen: "app",
      cashier: "app",
      manager: "app",
    },
    escalation: {
      enabled: true,
      delayMinutes: 3,
    },
    stockAlert: {
    enabled: true,
    cooldownMinutes: 30,
  },
    eventSounds: defaultEventSounds,
  };

  const [notifications, setNotifications] = useState(null);
const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ✅ Hook loads + merges settings
useSetting("notifications", (incoming) => {
  const merged = {
    ...defaultConfig,
    ...incoming,
  };

  if (incoming?.eventSounds) {
    merged.eventSounds = {
      ...defaultEventSounds,
      ...incoming.eventSounds,
    };
  }

  console.log("✅ Final Merged Notifications:", merged);
  setNotifications(merged);
  setVolume(merged.volume ?? 0.8);
  setSettingsLoaded(true);
}, defaultConfig);






  const handleSave = async () => {
    try {
      await saveSetting("notifications", notifications);
      // 🔔 Dispatch your update event immediately after saving:
      window.dispatchEvent(new Event("notification_settings_updated"));
      window.notificationSettings = notifications; // 🔁 Sync in memory

      toast.success("💾 " + t("Settings saved"));
    } catch (err) {
      console.error(err);
      toast.error("⚠️ " + t("Failed to save"));
    }
  };





if (!settingsLoaded || !notifications) return <p>Loading settings...</p>;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
      <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300 mb-6">
        🔔 {t("Notifications")}
      </h2>

      <div className="space-y-8">
        {/* Enable Notifications */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium">{t("Enable Notifications")}</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={notifications.enabled}
              onChange={() =>
                setNotifications((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
{/* Volume Slider */}
<div className="mb-6">
  <label className="block font-medium mb-2">{t("Volume")}: {(volume * 100).toFixed(0)}%</label>
  <input
    type="range"
    min="0"
    max="1"
    step="0.01"
    value={volume}
    onChange={(e) => setVolume(parseFloat(e.target.value))}
    className="w-full"
  />
</div>

        {/* Default Sound */}
        <div>
          <label className="block text-lg font-medium mb-2">
            {t("Default Notification Sound")}
          </label>
          <select
            value={notifications.defaultSound}
            onChange={(e) =>
              setNotifications((prev) => ({ ...prev, defaultSound: e.target.value }))
            }
            className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-white"
          >
            {availableSounds.map((s) => (
              <option key={s} value={s}>
                {s === "none" ? t("None") : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
{/* Stock Alert Config */}
<div className="border-t pt-6 mt-6">
  <h3 className="text-lg font-semibold mb-2">{t("Stock Alert Settings")}</h3>
  <div className="flex items-center justify-between mb-3">
    <span className="font-medium">{t("Enable Stock Alerts")}</span>
    <label className="relative inline-flex items-center cursor-pointer">
      <input
        type="checkbox"
        checked={notifications.stockAlert?.enabled}
        onChange={() =>
          setNotifications((prev) => ({
            ...prev,
            stockAlert: {
              ...prev.stockAlert,
              enabled: !prev.stockAlert?.enabled,
            },
          }))
        }
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
    </label>
  </div>

  {notifications.stockAlert?.enabled && (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        min="1"
        value={notifications.stockAlert.cooldownMinutes}
        onChange={(e) =>
          setNotifications((prev) => ({
            ...prev,
            stockAlert: {
              ...prev.stockAlert,
              cooldownMinutes: parseInt(e.target.value),
            },
          }))
        }
        className="w-20 p-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white"
      />
      <span className="text-gray-600 dark:text-gray-400">{t("minutes between alerts")}</span>
    </div>
  )}
</div>

        {/* Channel Routing */}
        <div>
          <h3 className="text-lg font-semibold mb-2">{t("Channel Routing by Role")}</h3>
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role} className="flex items-center justify-between">
                <span className="capitalize font-medium">{t(role)}</span>
                <select
                  value={notifications.channels[role]}
                  onChange={(e) =>
                    setNotifications((prev) => ({
                      ...prev,
                      channels: { ...prev.channels, [role]: e.target.value },
                    }))
                  }
                  className="p-2 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-white"
                >
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Escalation */}
        <div>
          <h3 className="text-lg font-semibold mb-2">{t("Escalation Rule")}</h3>
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">{t("Repeat alert if unacknowledged")}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notifications.escalation.enabled}
                onChange={() =>
                  setNotifications((prev) => ({
                    ...prev,
                    escalation: {
                      ...prev.escalation,
                      enabled: !prev.escalation.enabled,
                    },
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>
          {notifications.escalation.enabled && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                value={notifications.escalation.delayMinutes}
                onChange={(e) =>
                  setNotifications((prev) => ({
                    ...prev,
                    escalation: {
                      ...prev.escalation,
                      delayMinutes: parseInt(e.target.value),
                    },
                  }))
                }
                className="w-20 p-2 border rounded-lg bg-white dark:bg-gray-800 dark:text-white"
              />
              <span className="text-gray-600 dark:text-gray-400">{t("minutes")}</span>
            </div>
          )}
        </div>

        {/* Per-Event Sound */}
        <div>
          <h3 className="text-lg font-semibold mb-2">{t("Sound Per Event")}</h3>
          <div className="space-y-4">
            {Object.entries(eventLabels).map(([eventKey, label]) => {
  console.log(`🎯 SELECT VALUE for ${eventKey}:`, notifications.eventSounds?.[eventKey]);

  return (
   <div key={eventKey} className="flex items-center justify-between gap-4">
  <span className="font-medium w-40">{t(label)}</span>

  <select
    value={notifications.eventSounds?.[eventKey] ?? ""}
    onChange={(e) =>
      setNotifications((prev) => ({
        ...prev,
        eventSounds: {
          ...prev.eventSounds,
          [eventKey]: e.target.value,
        },
      }))
    }
    className="p-2 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-white flex-1"
  >
    {Array.from(
      new Set([
        ...availableSounds,
        notifications.eventSounds?.[eventKey] ?? "",
      ])
    ).map((sound) => (
      <option key={sound} value={sound}>
        {sound === "none"
          ? t("None")
          : sound.replace(".mp3", "").replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
      </option>
    ))}
  </select>

  <button
    className="bg-indigo-500 text-white px-3 py-1 rounded-lg hover:bg-indigo-600 transition"
    onClick={() => {
      const soundFile = notifications.eventSounds?.[eventKey];
      if (!audioRefs.current[eventKey]) {
  audioRefs.current[eventKey] = new Audio();
}

const audio = audioRefs.current[eventKey];
audio.pause();
audio.src = `/${soundFile}`;
audio.volume = volume;
audio.play().catch(console.warn);

    }}
  >
    ▶️
  </button>
</div>


  );
})}

          </div>
        </div>
      </div>

      <div className="flex justify-end mt-10">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-bold shadow hover:brightness-110 transition-all"
        >
          💾 {t("Save Settings")}
        </button>
      </div>
    </div>
  );
}
