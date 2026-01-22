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
  menuSync: false,
  autoConfirmOrders: false,
});

const getDefaultGetir = () => ({
  enabled: false,
  restaurantSecretKey: "",
  menuSync: false,
  autoConfirmOrders: false,
});

const getDefaultTrendyol = () => ({
  enabled: false,
  vendorId: "",
  apiKey: "",
  apiSecret: "",
  restaurantId: "",
  menuSync: false,
  autoConfirmOrders: false,
});

const getDefaultIntegrations = () => ({
  whatsapp: true,
  getir: getDefaultGetir(),
  trendyol: getDefaultTrendyol(),
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
      menuSync: rawMigros,
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

const normalizeGetir = (rawGetir, rawIntegrations) => {
  const defaults = getDefaultGetir();

  if (typeof rawGetir === "boolean") {
    return {
      ...defaults,
      enabled: rawGetir,
      menuSync: rawGetir,
      autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
    };
  }

  if (rawGetir && typeof rawGetir === "object") {
    const merged = { ...defaults, ...rawGetir };
    if (typeof rawGetir.enabled !== "boolean") {
      merged.enabled = false;
    }
    if (typeof rawGetir.autoConfirmOrders !== "boolean") {
      merged.autoConfirmOrders = rawIntegrations?.auto_confirm_orders === true;
    }
    return merged;
  }

  return {
    ...defaults,
    autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
  };
};

const normalizeTrendyol = (rawTrendyol, rawIntegrations) => {
  const defaults = getDefaultTrendyol();

  if (typeof rawTrendyol === "boolean") {
    return {
      ...defaults,
      enabled: rawTrendyol,
      menuSync: rawTrendyol,
      autoConfirmOrders: rawIntegrations?.auto_confirm_orders === true,
    };
  }

  if (rawTrendyol && typeof rawTrendyol === "object") {
    const merged = { ...defaults, ...rawTrendyol };
    if (typeof rawTrendyol.enabled !== "boolean") {
      merged.enabled = false;
    }
    if (typeof rawTrendyol.autoConfirmOrders !== "boolean") {
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
    trendyol: normalizeTrendyol(base.trendyol, base),
    getir: normalizeGetir(base.getir, base),
  };
};

const INTEGRATION_TOGGLES_TOP = [];

const INTEGRATION_TOGGLES_BOTTOM = [
  { key: "whatsapp", name: "WhatsApp Auto Order Message" },
  { key: "qr_menu", name: "Digital QR Menu Link" },
];

export default function IntegrationsTab() {
  const { t } = useTranslation();

  const [integrations, setIntegrations] = useState(() => getDefaultIntegrations());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ysMappingType, setYsMappingType] = useState("product");
  const [ysUnmatchedItems, setYsUnmatchedItems] = useState([]);
  const [ysMappedItems, setYsMappedItems] = useState([]);
  const [ysMappingLoading, setYsMappingLoading] = useState(false);
  const [ysMappingError, setYsMappingError] = useState("");
  const [ysModalOpen, setYsModalOpen] = useState(false);
  const [ysSelectedItem, setYsSelectedItem] = useState(null);
  const [ysCandidates, setYsCandidates] = useState([]);
  const [ysCandidatesLoading, setYsCandidatesLoading] = useState(false);
  const [ysSearch, setYsSearch] = useState("");
  const [ysSelectedCandidate, setYsSelectedCandidate] = useState(null);
  const [migrosRemoteId, setMigrosRemoteId] = useState("");

  const formatShortDate = (value) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString();
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const restaurantId = localStorage.getItem("restaurant_id");

    Promise.all([
      secureFetch("/settings/integrations"),
      restaurantId
        ? secureFetch(`/settings/restaurants/${restaurantId}/external-ids`).catch(() => ({ migrosRemoteId: "" }))
        : Promise.resolve({ migrosRemoteId: "" })
    ])
      .then(([integrationsData, externalIds]) => {
        if (!mounted) return;
        setIntegrations(normalizeIntegrations(integrationsData));
        setMigrosRemoteId(externalIds?.migrosRemoteId || "");
        setLoading(false);
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load integrations settings:", err);
        if (!mounted) return;
        setIntegrations(getDefaultIntegrations());
        setMigrosRemoteId("");
        setLoading(false);
        toast.error(t("Failed to load settings"));
      });

    return () => {
      mounted = false;
    };
  }, [t]);

  const loadYsMappings = async (itemType = ysMappingType) => {
    setYsMappingLoading(true);
    setYsMappingError("");
    try {
      const [unmatched, mapped] = await Promise.all([
        secureFetch(`/integrations/yemeksepeti/unmatched?itemType=${encodeURIComponent(itemType)}`),
        secureFetch(`/integrations/yemeksepeti/mappings?itemType=${encodeURIComponent(itemType)}`),
      ]);
      setYsUnmatchedItems(unmatched?.items || []);
      setYsMappedItems(mapped?.items || []);
    } catch (err) {
      console.error("❌ Failed to load Yemeksepeti mappings:", err);
      setYsMappingError(err?.message || t("Failed to load settings"));
    } finally {
      setYsMappingLoading(false);
    }
  };

  const loadYsCandidates = async (itemType = ysMappingType) => {
    setYsCandidatesLoading(true);
    try {
      if (itemType === "extra") {
        const groups = await secureFetch("/extras-groups");
        const extras = (groups || []).flatMap((group) =>
          (group.items || []).map((item) => ({
            id: item.id,
            name: item.name,
            groupName: group.group_name,
          }))
        );
        setYsCandidates(extras);
        return;
      }
      const products = await secureFetch("/products");
      setYsCandidates(products || []);
    } catch (err) {
      console.error("❌ Failed to load Yemeksepeti candidates:", err);
      toast.error(t("Failed to load settings"));
    } finally {
      setYsCandidatesLoading(false);
    }
  };

  useEffect(() => {
    loadYsMappings(ysMappingType);
  }, [ysMappingType]);

  useEffect(() => {
    setYsCandidates([]);
    setYsSelectedCandidate(null);
  }, [ysMappingType]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const latest = await secureFetch("/settings/integrations");
      const normalizedLatest = normalizeIntegrations(latest);

      const payload = {
        ...normalizedLatest,
        ...integrations,
        trendyol: normalizeTrendyol(integrations?.trendyol, {
          ...normalizedLatest,
          ...integrations,
        }),
        getir: normalizeGetir(integrations?.getir, {
          ...normalizedLatest,
          ...integrations,
        }),
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
          integrations?.migros?.autoConfirmOrders === true ||
          integrations?.trendyol?.autoConfirmOrders === true ||
          integrations?.getir?.autoConfirmOrders === true,
      };

      // Save integrations settings
      await secureFetch("/settings/integrations", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Save Migros Remote ID to restaurants table
      const restaurantId = localStorage.getItem("restaurant_id");
      if (restaurantId) {
        try {
          await secureFetch(`/settings/restaurants/${restaurantId}/external-ids`, {
            method: "POST",
            body: JSON.stringify({ migrosRemoteId }),
          });
        } catch (remoteIdErr) {
          if (remoteIdErr?.message?.includes("DUPLICATE_MIGROS_REMOTE_ID")) {
            toast.error(t("This Migros Remote ID is already used by another restaurant"));
            setSaving(false);
            return;
          }
          console.error("⚠️ Failed to save Migros Remote ID:", remoteIdErr);
          toast.warn(t("Settings saved, but failed to update Migros Remote ID"));
        }
      }

      toast.success(t("Integrations saved successfully"));

      if (payload?.yemeksepeti?.menuSync) {
        try {
          const syncResult = await secureFetch(
            "/integrations/yemeksepeti/menu-sync",
            { method: "POST" }
          );
          const importId = syncResult?.catalogImportId;
          toast.info(
            importId
              ? t("Menu sync triggered. Import ID: {{id}}", { id: importId })
              : t("Menu sync triggered. Check backend logs for status.")
          );
        } catch (syncErr) {
          console.error("❌ Menu sync failed:", syncErr);
          toast.warn(
            syncErr?.message ||
              t("Menu sync failed. Check backend logs for details.")
          );
        }
      }
    } catch (err) {
      console.error("❌ Failed to save integrations:", err);
      toast.error(err?.message || t("Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const openYsMatchModal = async (item) => {
    setYsSelectedItem(item);
    setYsSelectedCandidate(null);
    setYsSearch("");
    setYsModalOpen(true);
    if (!ysCandidates.length) {
      await loadYsCandidates(ysMappingType);
    }
  };

  const handleYsMapSave = async () => {
    if (!ysSelectedItem || !ysSelectedCandidate) return;
    try {
      await secureFetch("/integrations/yemeksepeti/map", {
        method: "POST",
        body: JSON.stringify({
          itemType: ysMappingType,
          platformItemId: ysSelectedItem.platform_item_id,
          beyproId: ysSelectedCandidate.id,
          remoteCodeUsed: ysSelectedItem.remote_code || ysSelectedItem.remote_code_used || "",
        }),
      });
      toast.success(t("Mapping saved"));
      setYsModalOpen(false);
      setYsSelectedItem(null);
      setYsSelectedCandidate(null);
      await loadYsMappings(ysMappingType);
    } catch (err) {
      console.error("❌ Failed to save Yemeksepeti mapping:", err);
      toast.error(err?.message || t("Failed to save settings"));
    }
  };

  const handleYsUnmap = async (item) => {
    try {
      await secureFetch(
        `/integrations/yemeksepeti/map/${ysMappingType}/${encodeURIComponent(
          item.platform_item_id
        )}`,
        { method: "DELETE" }
      );
      toast.success(t("Mapping removed"));
      await loadYsMappings(ysMappingType);
    } catch (err) {
      console.error("❌ Failed to remove Yemeksepeti mapping:", err);
      toast.error(err?.message || t("Failed to save settings"));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 max-w-3xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
      <div className="space-y-6">
        {/* Existing integration toggles */}
        {INTEGRATION_TOGGLES_TOP.map(({ key, name }) => (
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

        {/* Getir integration card */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-indigo-700 dark:text-indigo-300">
              {t("Getir Restaurant Sync")}
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!integrations?.getir?.enabled}
                onChange={() =>
                  setIntegrations((prev) => ({
                    ...prev,
                    getir: {
                      ...(prev?.getir || getDefaultGetir()),
                      enabled: !prev?.getir?.enabled,
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
              <div className="sm:col-span-2">
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Restaurant Secret Key")}
                </label>
                <input
                  type="password"
                  value={integrations?.getir?.restaurantSecretKey || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      getir: {
                        ...(prev?.getir || getDefaultGetir()),
                        restaurantSecretKey: e.target.value,
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
                  {t("Menu Sync")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("When ON, Beypro will push menu & prices to Getir")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.getir?.menuSync}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      getir: {
                        ...(prev?.getir || getDefaultGetir()),
                        menuSync: !prev?.getir?.menuSync,
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
                  checked={!!integrations?.getir?.autoConfirmOrders}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      getir: {
                        ...(prev?.getir || getDefaultGetir()),
                        autoConfirmOrders: !prev?.getir?.autoConfirmOrders,
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

        <div id="yemeksepeti-mapping" className="mt-6 border-t pt-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                  {t("Yemeksepeti Mapping")}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  {t("Map existing Yemeksepeti items to Beypro products and extras.")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-200 dark:border-slate-600 overflow-hidden">
                  {["product", "extra"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setYsMappingType(type)}
                      className={`px-3 py-1.5 text-xs font-semibold ${
                        ysMappingType === type
                          ? "bg-indigo-600 text-white"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {type === "product" ? t("Products") : t("Extras")}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => loadYsMappings(ysMappingType)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {t("Refresh")}
                </button>
              </div>
            </div>

            {ysMappingError && (
              <div className="px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
                {ysMappingError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t("Unmatched items")}
                  </h5>
                  <span className="text-xs text-slate-500">
                    {ysMappingLoading ? t("Loading...") : ysUnmatchedItems.length}
                  </span>
                </div>
                <div className="overflow-auto max-h-[320px] border border-slate-100 dark:border-slate-800 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("Platform ID")}</th>
                        <th className="px-3 py-2 text-left">{t("Name")}</th>
                        <th className="px-3 py-2 text-left">{t("Remote Code")}</th>
                        <th className="px-3 py-2 text-left">{t("Updated")}</th>
                        <th className="px-3 py-2 text-right">{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ysUnmatchedItems.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            {item.platform_item_id}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            {item.platform_item_name || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            {item.remote_code || "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            {formatShortDate(item.updated_at)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => openYsMatchModal(item)}
                              className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                            >
                              {t("Match")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!ysMappingLoading && ysUnmatchedItems.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-3 py-6 text-center text-slate-400">
                            {t("No unmatched items")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t("Mapped items")}
                  </h5>
                  <span className="text-xs text-slate-500">
                    {ysMappingLoading ? t("Loading...") : ysMappedItems.length}
                  </span>
                </div>
                <div className="overflow-auto max-h-[320px] border border-slate-100 dark:border-slate-800 rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">{t("Platform ID")}</th>
                        <th className="px-3 py-2 text-left">{t("Beypro Item")}</th>
                        <th className="px-3 py-2 text-left">{t("Remote Code")}</th>
                        <th className="px-3 py-2 text-right">{t("Action")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ysMappedItems.map((item) => (
                        <tr key={`${item.platform_item_id}-${item.beypro_id}`} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            {item.platform_item_id}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                            {item.beypro_name || item.beypro_id}
                          </td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                            {item.remote_code_used || "-"}
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                openYsMatchModal({
                                  platform_item_id: item.platform_item_id,
                                  remote_code: item.remote_code_used,
                                })
                              }
                              className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                            >
                              {t("Change")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleYsUnmap(item)}
                              className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600"
                            >
                              {t("Unmap")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!ysMappingLoading && ysMappedItems.length === 0 && (
                        <tr>
                          <td colSpan="4" className="px-3 py-6 text-center text-slate-400">
                            {t("No mappings yet")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {ysModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl shadow-xl border border-slate-200 dark:border-slate-700 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h5 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    {t("Match Yemeksepeti item")}
                  </h5>
                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    {ysSelectedItem?.platform_item_id
                      ? `${t("Platform ID")}: ${ysSelectedItem.platform_item_id}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setYsModalOpen(false)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <input
                  type="text"
                  value={ysSearch}
                  onChange={(e) => setYsSearch(e.target.value)}
                  placeholder={t("Search Beypro items...")}
                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800 dark:text-white border-slate-200 dark:border-slate-700"
                />
              </div>

              <div className="mt-3 max-h-64 overflow-auto border border-slate-100 dark:border-slate-800 rounded-lg">
                {ysCandidatesLoading ? (
                  <div className="p-4 text-center text-sm text-slate-500">{t("Loading...")}</div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {ysCandidates
                      .filter((item) => {
                        const name = String(item.name || "").toLowerCase();
                        const query = String(ysSearch || "").toLowerCase();
                        return !query || name.includes(query) || String(item.id).includes(query);
                      })
                      .map((item) => (
                        <li
                          key={item.id}
                          className={`px-4 py-2 flex items-center justify-between cursor-pointer ${
                            ysSelectedCandidate?.id === item.id
                              ? "bg-indigo-50 dark:bg-indigo-900/40"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                          onClick={() => setYsSelectedCandidate(item)}
                        >
                          <div>
                            <div className="font-medium text-slate-700 dark:text-slate-200">
                              {item.name || item.ingredient_name || "-"}
                            </div>
                            <div className="text-xs text-slate-400">
                              #{item.id} {item.groupName ? `• ${item.groupName}` : ""}
                            </div>
                          </div>
                          {ysSelectedCandidate?.id === item.id && (
                            <span className="text-xs font-semibold text-indigo-600">
                              {t("Selected")}
                            </span>
                          )}
                        </li>
                      ))}
                    {!ysCandidatesLoading && ysCandidates.length === 0 && (
                      <li className="p-4 text-center text-sm text-slate-400">
                        {t("No items available")}
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setYsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleYsMapSave}
                  disabled={!ysSelectedCandidate}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-50"
                >
                  {t("Save mapping")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Trendyol Go integration card */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-indigo-700 dark:text-indigo-300">
              {t("Trendyol Go Integration")}
            </h3>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!!integrations?.trendyol?.enabled}
                onChange={() =>
                  setIntegrations((prev) => ({
                    ...prev,
                    trendyol: {
                      ...(prev?.trendyol || getDefaultTrendyol()),
                      enabled: !prev?.trendyol?.enabled,
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
                  {t("Vendor ID (Satıcı ID (Cari ID))")}
                </label>
                <input
                  type="text"
                  value={integrations?.trendyol?.vendorId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        vendorId: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Restaurant ID")}
                </label>
                <input
                  type="text"
                  value={integrations?.trendyol?.restaurantId || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        restaurantId: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("ApiKey")}
                </label>
                <input
                  type="text"
                  value={integrations?.trendyol?.apiKey || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        apiKey: e.target.value,
                      },
                    }))
                  }
                  className="w-full p-3 border rounded-lg bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Api Secret")}
                </label>
                <input
                  type="password"
                  value={integrations?.trendyol?.apiSecret || ""}
                  onChange={(e) =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        apiSecret: e.target.value,
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
                  {t("Menu Sync")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("When ON, Beypro will push menu & prices to Trendyol")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.trendyol?.menuSync}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        menuSync: !prev?.trendyol?.menuSync,
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
                    "When ON, incoming Trendyol orders are auto-confirmed; otherwise they stay pending."
                  )}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.trendyol?.autoConfirmOrders}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      trendyol: {
                        ...(prev?.trendyol || getDefaultTrendyol()),
                        autoConfirmOrders: !prev?.trendyol?.autoConfirmOrders,
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

            <div className="border-t border-indigo-200 dark:border-indigo-700 pt-4 mt-4">
              <div>
                <label className="block mb-1 font-medium text-gray-700 dark:text-gray-200">
                  {t("Migros Remote ID")}
                </label>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {t("Used to map Migros webhooks: /api/integrations/migros/order/:remoteId")}
                </div>
                <input
                  type="text"
                  value={migrosRemoteId}
                  onChange={(e) => setMigrosRemoteId(e.target.value)}
                  placeholder="MIGROS_XXX"
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

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {t("Menu Sync")}
                </div>
                <div className="text-gray-500 dark:text-gray-300 text-xs mt-1">
                  {t("When ON, Beypro will push menu & prices to Migros")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!integrations?.migros?.menuSync}
                  onChange={() =>
                    setIntegrations((prev) => ({
                      ...prev,
                      migros: {
                        ...(prev?.migros || getDefaultMigros()),
                        menuSync: !prev?.migros?.menuSync,
                      },
                    }))
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-700 rounded-full peer-focus:ring-2 peer-focus:ring-indigo-400 peer-checked:bg-indigo-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
              </label>
            </div>
          </div>
        </div>

        {/* WhatsApp + QR Menu toggles (below Migros) */}
        <div className="border-t pt-6 space-y-6">
          {INTEGRATION_TOGGLES_BOTTOM.map(({ key, name }) => (
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
