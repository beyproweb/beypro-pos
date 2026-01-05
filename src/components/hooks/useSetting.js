import { useEffect } from "react";
import secureFetch from "../../utils/secureFetch";
const API_URL = import.meta.env.VITE_API_URL || "";

const hasLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const getTenantKey = () => {
  if (!hasLocalStorage()) return "default";
  return (
    localStorage.getItem("restaurant_id") ||
    localStorage.getItem("restaurant_slug") ||
    "default"
  );
};

const getSettingCacheKey = (section) => `beypro:settings:${getTenantKey()}:${section}`;

const safeParseJson = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const readCachedSetting = (section) => {
  if (!hasLocalStorage()) return null;
  return safeParseJson(localStorage.getItem(getSettingCacheKey(section)));
};

const writeCachedSetting = (section, data) => {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(getSettingCacheKey(section), JSON.stringify(data || {}));
  } catch {
    // ignore quota / serialization errors
  }
};

// ✅ Load settings with DEEP fallback
// ✅ Load settings with DEEP fallback
export const useSetting = (section, setState, defaults = {}) => {
  useEffect(() => {
    let mounted = true;

    const cached = readCachedSetting(section);
    if (cached && typeof cached === "object") {
      const cachedMerged = {
        ...defaults,
        ...cached,
      };
      if (defaults.eventSounds && cached.eventSounds) {
        cachedMerged.eventSounds = {
          ...defaults.eventSounds,
          ...cached.eventSounds,
        };
      }
      setState(cachedMerged);
    }

    secureFetch(`/settings/${section}`)
      .then((data) => {
        if (!mounted) return;

        const merged = {
          ...defaults,
          ...data,
        };

        if (defaults.eventSounds && data.eventSounds) {
          merged.eventSounds = {
            ...defaults.eventSounds,
            ...data.eventSounds,
          };
        }

        writeCachedSetting(section, merged);
        setState(merged);
      })
      .catch((err) => {
        console.warn(`⚠️ Failed to load setting "${section}" — using defaults`, err);
        setState(defaults);
      });

    return () => {
      mounted = false;
    };
  }, [section]);
};

// ✅ Save setting
export const saveSetting = async (section, data) => {
  try {
    const json = await secureFetch(`/settings/${section}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    // Cache locally so settings apply immediately on reload (before network fetch resolves).
    writeCachedSetting(section, { ...(data || {}) });
    return json;
  } catch (err) {
    console.error(`❌ Failed to save setting "${section}"`, err);
    return null;
  }
};
