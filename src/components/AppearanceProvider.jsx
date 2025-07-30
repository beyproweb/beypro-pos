import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AppearanceContext } from "../context/AppearanceContext";
import axios from "axios";

const DEFAULT_APPEARANCE = {
  theme: "system",
  fontSize: "medium",
  accent: "default",
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
    axios
      .get(`/api/user-settings/${currentUser.id}/appearance`)
      .then((res) => {
        setAppearance({ ...DEFAULT_APPEARANCE, ...res.data });
        setLoaded(true);
      })
      .catch(() => {
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
    root.style.setProperty("--font-size", {
      small: "14px",
      medium: "16px",
      large: "18px",
    }[appearance.fontSize]);
    const tailwindColorMap = {
      default: "79 70 229",
      "emerald-500": "16 185 129",
      "rose-500": "244 63 94",
      "amber-500": "245 158 11",
      "cyan-500": "6 182 212",
      "violet-500": "139 92 246",
      "lime-500": "132 204 22",
      "sky-500": "14 165 233",
    };
    const rgb = tailwindColorMap[appearance.accent] || tailwindColorMap["default"];
    root.style.setProperty("--accent-color", rgb);
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
