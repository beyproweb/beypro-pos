import { useEffect } from "react";
import secureFetch from "../utils/secureFetch";

// ✅ Load settings with DEEP fallback
export const useSetting = (section, setState, defaults = {}) => {
  useEffect(() => {
    let mounted = true;

    secureFetch(`/settings/${section}`)
      .then((data) => {
        if (!mounted) return;

        // 🧠 Deep merge defaults
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

// ✅ Save setting (fixed)
export const saveSetting = async (section, data) => {
  try {
    const json = await secureFetch(`/settings/${section}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return json; // already parsed JSON
  } catch (err) {
    console.error(`❌ Failed to save setting "${section}"`, err);
    return null;
  }
};
