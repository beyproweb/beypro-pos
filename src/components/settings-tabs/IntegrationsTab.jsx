import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import secureFetch from "../../utils/secureFetch";

const getDefaultYemeksepeti = () => ({
  enabled: false,
  restaurantName: "",
  remoteId: "",
  vendorId: "",
  chainCode: "",
  menuSync: false,
  autoConfirmOrders: false,
});

const getDefaultMigros = () => ({
  enabled: false,
  apiKey: "",
  chainId: "",
  restoranId: "",
  autoConfirmOrders: false,
});

const getDefaultIntegrations = () => ({
  whatsapp: true,
  getir: false,
  trendyol: false,
  qr_menu: true,
  // Backward compatible key used by backend today
  auto_confirm_orders: false,
  // New Yemeksepeti configuration object
  yemeksepeti: getDefaultYemeksepeti(),
  // Migros configuration object
  migros: getDefaultMigros(),
});

const normalizeYemeksepeti = (rawYemeksepeti, rawIntegrations) => {
  const defaults = getDefaultYemeksepeti();

  if (typeof rawYemeksepeti === "boolean") {
    return {
      ...defaults,
      enabled: rawYemeksepeti,
      menuSync: rawYemeksepeti,
      autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
    };
  }

  if (rawYemeksepeti && typeof rawYemeksepeti === "object") {
    const merged = { ...defaults, ...rawYemeksepeti };
    if (typeof rawYemeksepeti.enabled !== "boolean") {
      merged.enabled = Boolean(rawYemeksepeti.menuSync ?? defaults.enabled);
    }
    if (typeof rawYemeksepeti.autoConfirmOrders !== "boolean") {
      merged.autoConfirmOrders = rawIntegrations?.auto_confirm_orders === true;
    }
    return merged;
  }

  return {
    ...defaults,
    autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
  };
};

const normalizeMigros = (rawMigros, rawIntegrations) => {
  const defaults = getDefaultMigros();

  if (typeof rawMigros === "boolean") {
    return {
      ...defaults,
      enabled: rawMigros,
      autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
    };
  }

  if (rawMigros && typeof rawMigros === "object") {
    const merged = { ...defaults, ...rawMigros };
    if (typeof rawMigros.autoConfirmOrders !== "boolean") {
      merged.autoConfirmOrders = rawIntegrations?.auto_confirm_orders === true;
    }
    return merged;
  }

  return {
    ...defaults,
    autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
  };
};

const normalizeIntegrations = (raw) => {
  const defaults = getDefaultIntegrations();
  const base = {
    ...defaults,
    ...(raw && typeof raw === "object" ? raw : {}),
  };

  return {
    ...base,
    yemeksepeti: normalizeYemeksepeti(base.yemeksepeti, base),
    migros: normalizeMigros(base.migros, base),
  };
};

const INTEGRATION_TOGGLES = [
  { key: "whatsapp", name: "WhatsApp Auto Order Message" },
  { key: "getir", name: "Getir Restaurant Sync" },
  { key: "trendyol", name: "Trendyol Go Integration" },
  { key: "qr_menu", name: "Digital QR Menu Link" },
];

export default function IntegrationsTab() {
  const { t } = useTranslation();

  const [integrations, setIntegrations] = useState(() => getDefaultIntegrations());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    secureFetch("/settings/integrations")
      .then((data) => {
        if (!mounted) return;
        setIntegrations(normalizeIntegrations(data));
        setLoading(false);
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load integrations settings:", err);
        if (!mounted) return;
        setIntegrations(getDefaultIntegrations());
        setLoading(false);
        toast.error(t("Failed to load settings"));
      });

    return () => {
      mounted = false;
    };
  }, [t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const latest = await secureFetch("/settings/integrations");
      const normalizedLatest = normalizeIntegrations(latest);

      const payload = {
        ...normalizedLatest,
        ...integrations,
        yemeksepeti: normalizeYemeksepeti(integrations?.yemeksepeti, {
          ...normalizedLatest,
          ...integrations,
        }),
        migros: normalizeMigros(integrations?.migros, {
          ...normalizedLatest,
          ...integrations,
        }),
        // Keep backend behavior working while it still reads this key
        auto_confirm_orders:
          integrations?.yemeksepeti?.autoConfirmOrders === true ||
          integrations?.migros?.autoConfirmOrders === true,
      };

      await secureFetch("/settings/integrations", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success("Yemeksepeti integration saved successfully");
    } catch (err) {
      console.error("❌ Failed to save integrations:", err);
      toast.error(err?.message || t("Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
      <div className="space-y-6">
        {/* Existing integration toggles */}
        {INTEGRATION_TOGGLES.map(({ key, name }) => (
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

        {/* Yemeksepeti integration card */}
        <div className="mt-8 border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-indigo-700 dark:text-indigo-300">
              {t("Yemeksepeti Integration")}
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!integrations?.yemeksepeti?.enabled}
                onChange={() =>
                  setIntegrations((prev) => ({
                    ...prev,
                    yemeksepeti: {
                      ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                      enabled: !prev?.yemeksepeti?.enabled,
                    },
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-600 shadow space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Restaurant Name")}
                </label>
                <input
                  type="text"
                  value={integrations?.yemeksepeti?.restaurantName || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        restaurantName: e.target.value,
                      },
                    }))
                  }
                  placeholder="HURRYBEY"
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Remote ID")}
                </label>
                <input
                  type="text"
                  value={integrations?.yemeksepeti?.remoteId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        remoteId: e.target.value,
                      },
                    }))
                  }
                  placeholder="1191"
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("POS remoteId used by Yemeksepeti")}
                </div>
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Vendor ID (Restaurant ID)")}
                </label>
                <input
                  type="text"
                  value={integrations?.yemeksepeti?.vendorId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        vendorId: e.target.value,
                      },
                    }))
                  }
                  placeholder="wo58"
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Chain Code")}
                </label>
                <input
                  type="text"
                  value={integrations?.yemeksepeti?.chainCode || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        chainCode: e.target.value,
                      },
                    }))
                  }
                  placeholder="qN***"
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t("Menu Sync")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("When ON, Beypro will push menu & prices to Yemeksepeti")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.yemeksepeti?.menuSync}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        menuSync: !prev?.yemeksepeti?.menuSync,
                      },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t("Auto Orders Confirm")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t(
                    "When ON, incoming Yemeksepeti orders are auto-confirmed; otherwise they stay pending."
                  )}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.yemeksepeti?.autoConfirmOrders}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      yemeksepeti: {
                        ...(prev?.yemeksepeti || getDefaultYemeksepeti()),
                        autoConfirmOrders: !prev?.yemeksepeti?.autoConfirmOrders,
                      },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          </div>
        </div>

        {/* Migros integration card */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-indigo-700 dark:text-indigo-300">
              {t("Migros Integration")}
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!integrations?.migros?.enabled}
                onChange={() =>
                  setIntegrations((prev) => ({
                    ...prev,
                    migros: {
                      ...(prev?.migros || getDefaultMigros()),
                      enabled: !prev?.migros?.enabled,
                    },
                  }))
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
            </label>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-900 p-4 rounded-xl border border-indigo-200 dark:border-indigo-600 shadow space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("ApiKey")}
                </label>
                <input
                  type="text"
                  value={integrations?.migros?.apiKey || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      migros: {
                        ...(prev?.migros || getDefaultMigros()),
                        apiKey: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Chain Id")}
                </label>
                <input
                  type="text"
                  value={integrations?.migros?.chainId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      migros: {
                        ...(prev?.migros || getDefaultMigros()),
                        chainId: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Restoran Id")}
                </label>
                <input
                  type="text"
                  value={integrations?.migros?.restoranId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      migros: {
                        ...(prev?.migros || getDefaultMigros()),
                        restoranId: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t("Auto Orders Confirm")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("When ON, incoming Migros orders are auto-confirmed; otherwise they stay pending.")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.migros?.autoConfirmOrders}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      migros: {
                        ...(prev?.migros || getDefaultMigros()),
                        autoConfirmOrders: !prev?.migros?.autoConfirmOrders,
                      },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-10">
        <button
          onClick={handleSave}
          disabled={loading || saving}
          className={`px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-bold shadow transition-all ${
            loading || saving
              ? "opacity-60 cursor-not-allowed"
              : "hover:brightness-110"
          }`}
        >
          💾 {saving ? t("Saving...") : t("Save Settings")}
        </button>
      </div>
    </div>
  );
}
