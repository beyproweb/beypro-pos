import { useEffect } from "react";

// ✅ Load settings with DEEP fallback
export const useSetting = (section, setState, defaults = {}) => {
  useEffect(() => {
    let mounted = true;

    fetch(`/api/settings/${section}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;

        // 🧠 Deep merge eventSounds if it exists
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

// ✅ Save setting (unchanged)
export const saveSetting = async (section, data) => {
  try {
    const res = await fetch(`/api/settings/${section}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`❌ Failed to save setting "${section}"`, err);
    return null;
  }
};
