import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";
const API_URL = import.meta.env.VITE_API_URL || "";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ShopHoursTab() {
  const { t } = useTranslation();
  const [shopHours, setShopHours] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    secureFetch("/settings/shop-hours/all")
      .then((data) => {
        const hoursMap = {};
        if (Array.isArray(data)) {
          data.forEach((row) => {
            hoursMap[row.day] = {
              open: row.open_time,
              close: row.close_time,
            };
          });
        }
        setShopHours(hoursMap);
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
      },
    }));
  };

const handleSave = async () => {
  try {
    const res = await secureFetch("/settings/shop-hours/all", {
      method: "POST",
      body: JSON.stringify({ hours: shopHours }),
    });
    toast.success("✅ Shop hours saved successfully!");
  } catch (err) {
    console.error("❌ Save failed:", err);
    toast.error("Save failed");
  }
};


  return (
  <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 transition-colors duration-300">
    <h2 className="text-2xl font-semibold mb-6 text-indigo-600 dark:text-indigo-300">
      {t("Customize Shop Hours")}
    </h2>

    {loading ? (
      <p className="text-gray-500 dark:text-gray-400">{t("Loading...")}</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {days.map((day) => (
          <div
            key={day}
            className="bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900 dark:to-indigo-800 border border-indigo-200 dark:border-indigo-600 p-4 rounded-xl shadow-md"
          >
            <h3 className="capitalize font-semibold text-indigo-700 dark:text-indigo-300 mb-3 text-center">
              {t(day)}
            </h3>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t("Open Time")}
            </label>
            <input
              type="time"
              value={shopHours[day]?.open || ""}
              onChange={(e) => handleTimeChange(day, "open", e.target.value)}
              className="w-full border rounded-lg p-2 mb-3 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t("Close Time")}
            </label>
            <input
              type="time"
              value={shopHours[day]?.close || ""}
              onChange={(e) => handleTimeChange(day, "close", e.target.value)}
              className="w-full border rounded-lg p-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        ))}
      </div>
    )}

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
