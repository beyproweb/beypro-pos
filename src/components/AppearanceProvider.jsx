import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AppearanceContext } from "../context/AppearanceContext";
import axios from "axios";
import secureFetch from "../utils/secureFetch";

const API_URL = import.meta.env.VITE_API_URL || "";

const DEFAULT_APPEARANCE = {
  theme: "light",
  fontSize: "medium",
  accent: "sky-500",
  highContrast: false,
};

export default function AppearanceProvider({ children }) {
  const { currentUser } = useAuth();
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [loaded, setLoaded] = useState(false);

useEffect(() => {
  if (!currentUser?.id) {
    setLoaded(true);
    setAppearance(DEFAULT_APPEARANCE);
    return;
  }

  setLoaded(false); // reset loaded when user changes

  secureFetch(`/settings/appearance`)
    .then((data) => {
      setAppearance({ ...DEFAULT_APPEARANCE, ...data });
      setLoaded(true);
    })
    .catch((err) => {
      console.warn("⚠️ Failed to load appearance:", err);
      setAppearance(DEFAULT_APPEARANCE);
      setLoaded(true);
    });
}, [currentUser]);



  useEffect(() => {
    if (!loaded || !appearance) return;
    const root = document.documentElement;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const appliedTheme =
      appearance.theme === "system" ? (dark ? "dark" : "light") : appearance.theme;
    document.body.classList.toggle("dark", appliedTheme === "dark");

    root.style.setProperty(
      "--font-size",
      {
        small: "14px",
        medium: "16px",
        large: "18px",
      }[appearance.fontSize]
    );

    const accentMap = {
      default: { solid: "79 70 229", from: "79 70 229", to: "99 102 241" }, // indigo-600 -> indigo-500
      "emerald-500": { solid: "16 185 129", from: "16 185 129", to: "20 184 166" }, // emerald -> teal
      "rose-500": { solid: "244 63 94", from: "244 63 94", to: "236 72 153" }, // rose -> pink
      "amber-500": { solid: "245 158 11", from: "245 158 11", to: "249 115 22" }, // amber -> orange
      "cyan-500": { solid: "6 182 212", from: "6 182 212", to: "14 165 233" }, // cyan -> sky
      "violet-500": { solid: "139 92 246", from: "139 92 246", to: "236 72 153" }, // violet -> pink
      "lime-500": { solid: "132 204 22", from: "132 204 22", to: "34 197 94" }, // lime -> green
      "sky-500": { solid: "14 165 233", from: "14 165 233", to: "99 102 241" }, // sky -> indigo

      // Gradient accents (new)
      sunset: { solid: "249 115 22", from: "244 63 94", to: "245 158 11" }, // rose -> amber
      ocean: { solid: "14 165 233", from: "6 182 212", to: "59 130 246" }, // cyan -> blue
      grape: { solid: "139 92 246", from: "139 92 246", to: "236 72 153" }, // violet -> pink
      forest: { solid: "34 197 94", from: "16 185 129", to: "132 204 22" }, // emerald -> lime
      midnight: { solid: "79 70 229", from: "30 41 59", to: "79 70 229" }, // slate-800 -> indigo-600
      fire: { solid: "239 68 68", from: "239 68 68", to: "249 115 22" }, // red -> orange
    };

    const key = appearance.accent;
    const selected = accentMap[key] || accentMap.default;

    root.style.setProperty("--accent-color", selected.solid);
    root.style.setProperty("--accent-from", selected.from);
    root.style.setProperty("--accent-to", selected.to);
    document.body.classList.toggle("contrast-more", appearance.highContrast);
  }, [loaded, appearance]);

  // Only block rendering when user is logged in but settings are not loaded yet
  if (currentUser?.id && !loaded) return null;

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
