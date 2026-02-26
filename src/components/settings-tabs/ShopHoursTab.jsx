import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ShopHoursTab() {
  const { t } = useTranslation();
  const [shopHours, setShopHours] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingShopHours, setSavingShopHours] = useState(false);
  const [shopHoursDirty, setShopHoursDirty] = useState(false);
  const [shopHoursSaveStatus, setShopHoursSaveStatus] = useState("idle");

  useEffect(() => {
    secureFetch("/settings/shop-hours/all")
      .then((data) => {
        const hoursMap = {};
        days.forEach((day) => {
          hoursMap[day] = { open: "", close: "", enabled: false };
        });
        if (Array.isArray(data)) {
          data.forEach((row) => {
            hoursMap[row.day] = {
              open: row.open_time || "",
              close: row.close_time || "",
              enabled: Boolean(row.open_time && row.close_time),
            };
          });
        }
        setShopHours(hoursMap);
        setShopHoursDirty(false);
        setShopHoursSaveStatus("idle");
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Failed to load shop hours:", err);
        toast.error("Failed to load settings");
      });
  }, []);


  const handleTimeChange = (day, field, value) => {
    setShopHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
        enabled: true,
      },
    }));
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleDayEnabledToggle = (day) => {
    setShopHours((prev) => {
      const current = prev[day] || { open: "", close: "", enabled: false };
      const nextEnabled = !(current.enabled !== false);
      return {
        ...prev,
        [day]: {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        },
      };
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const handleShopToggle = () => {
    setShopHours((prev) => {
      const currentlyOpen = days.some((day) => prev[day]?.enabled !== false);
      const nextEnabled = !currentlyOpen;
      const updated = { ...prev };
      days.forEach((day) => {
        const current = updated[day] || { open: "", close: "", enabled: false };
        updated[day] = {
          ...current,
          enabled: nextEnabled,
          open: nextEnabled ? current.open || "09:00" : current.open || "",
          close: nextEnabled ? current.close || "22:00" : current.close || "",
        };
      });
      return updated;
    });
    setShopHoursDirty(true);
    setShopHoursSaveStatus("idle");
  };

  const shopEnabled = days.some((day) => shopHours[day]?.enabled !== false);

  const persistShopHours = async ({ showSuccessToast = false } = {}) => {
    if (savingShopHours) return;
    const payloadHours = {};
    for (const day of days) {
      const current = shopHours[day] || {};
      const enabled = current.enabled !== false;
      payloadHours[day] = {
        open: enabled ? current.open || "09:00" : null,
        close: enabled ? current.close || "22:00" : null,
      };
    }

    try {
      setSavingShopHours(true);
      setShopHoursSaveStatus("saving");
      await secureFetch("/settings/shop-hours/all", {
        method: "POST",
        body: JSON.stringify({ hours: payloadHours }),
      });
      try {
        window.dispatchEvent(new Event("qr:shop-hours-updated"));
        localStorage.setItem("qr_shop_hours_updated_at", String(Date.now()));
      } catch {}
      setShopHoursDirty(false);
      setShopHoursSaveStatus("saved");
      if (showSuccessToast) {
        toast.success("✅ Shop hours saved successfully!");
      }
    } catch (err) {
      console.error("❌ Save failed:", err);
      setShopHoursSaveStatus("error");
      toast.error("Save failed");
    } finally {
      setSavingShopHours(false);
    }
  };

  useEffect(() => {
    if (loading || savingShopHours || !shopHoursDirty) return;
    const timer = window.setTimeout(() => {
      persistShopHours({ showSuccessToast: false });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [loading, savingShopHours, shopHoursDirty, shopHours]);


  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 transition-colors duration-300">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold text-indigo-600 dark:text-indigo-300">
          {t("Customize Shop Hours")}
        </h2>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <span
            className={`text-sm font-semibold ${
              shopEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {shopEnabled ? t("Shop Open") : t("Shop Closed")}
          </span>
          <span className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={shopEnabled}
              onChange={handleShopToggle}
              className="sr-only peer"
            />
            <span className="w-11 h-6 bg-gray-300 peer-checked:bg-emerald-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </span>
        </label>
      </div>

      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">{t("Loading...")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {days.map((day) => {
            const enabled = shopHours[day]?.enabled !== false;
            return (
              <div
                key={day}
                className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900 dark:to-indigo-800 border border-indigo-200 dark:border-indigo-600 p-4 rounded-xl shadow-md"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="capitalize font-semibold text-indigo-700 dark:text-indigo-300">
                    {t(day)}
                  </h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => handleDayEnabledToggle(day)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-checked:bg-indigo-600 rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                </div>

                <div className={enabled ? "" : "opacity-50"}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    {t("Open Time")}
                  </label>
                  <input
                    type="time"
                    value={shopHours[day]?.open || ""}
                    disabled={!enabled}
                    onChange={(e) => handleTimeChange(day, "open", e.target.value)}
                    className="w-full border rounded-lg p-2 mb-3 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed"
                  />
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    {t("Close Time")}
                  </label>
                  <input
                    type="time"
                    value={shopHours[day]?.close || ""}
                    disabled={!enabled}
                    onChange={(e) => handleTimeChange(day, "close", e.target.value)}
                    className="w-full border rounded-lg p-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          {shopHoursSaveStatus === "saving"
            ? t("Saving...")
            : shopHoursSaveStatus === "saved"
            ? t("Saved")
            : shopHoursSaveStatus === "error"
            ? t("Save failed")
            : t("Auto-save enabled")}
        </div>
      </div>
    </div>
  );
}
