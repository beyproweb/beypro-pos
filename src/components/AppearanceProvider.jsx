import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AppearanceContext } from "../context/AppearanceContext";
import {
  DEFAULT_TABLE_DENSITY,
  normalizeTableDensity,
} from "../features/tables/tableDensity";
import secureFetch from "../utils/secureFetch";

const DEFAULT_APPEARANCE = {
  theme: "light",
  fontSize: "medium",
  accent: "sky-500",
  highContrast: false,
  table_density: DEFAULT_TABLE_DENSITY,
};

const hasLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const safeParseJson = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getTenantKey = () => {
  if (!hasLocalStorage()) return "default";
  return (
    localStorage.getItem("restaurant_id") ||
    localStorage.getItem("restaurant_slug") ||
    "default"
  );
};

const getUserKey = (currentUser) => {
  const candidates = [
    currentUser?.id,
    currentUser?.user_id,
    currentUser?.email,
    currentUser?.username,
  ];
  const first = candidates
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);
  return first || "anonymous";
};

const getAppearanceCacheKeys = (currentUser) => {
  const tenantKey = getTenantKey();
  const userKey = getUserKey(currentUser);
  return [
    `beypro:settings:${tenantKey}:appearance:user:${userKey}`,
    `beypro:settings:${tenantKey}:appearance`,
  ];
};

const normalizeAppearancePayload = (payload = {}) => ({
  ...DEFAULT_APPEARANCE,
  ...(payload && typeof payload === "object" ? payload : {}),
  table_density: normalizeTableDensity(
    payload?.table_density ?? payload?.tableDensity ?? DEFAULT_TABLE_DENSITY
  ),
});

const readCachedAppearance = (currentUser) => {
  if (!hasLocalStorage()) return null;
  const keys = getAppearanceCacheKeys(currentUser);
  for (const key of keys) {
    const parsed = safeParseJson(localStorage.getItem(key));
    if (parsed && typeof parsed === "object") {
      return normalizeAppearancePayload(parsed);
    }
  }
  return null;
};

const writeCachedAppearance = (currentUser, appearance) => {
  if (!hasLocalStorage()) return;
  try {
    const normalized = normalizeAppearancePayload(appearance || {});
    const serialized = JSON.stringify(normalized);
    getAppearanceCacheKeys(currentUser).forEach((key) => {
      localStorage.setItem(key, serialized);
    });
  } catch {
    // ignore cache serialization/quota errors
  }
};

export default function AppearanceProvider({ children }) {
  const { currentUser } = useAuth();
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const isStandalone =
      typeof window !== "undefined" &&
      typeof window.location?.pathname === "string" &&
      window.location.pathname.startsWith("/standalone");

    if (isStandalone) {
      setLoaded(true);
      setAppearance(DEFAULT_APPEARANCE);
      return;
    }

    if (!currentUser?.id) {
      setLoaded(true);
      setAppearance(DEFAULT_APPEARANCE);
      return;
    }

    let mounted = true;
    setLoaded(false);

    const cached = readCachedAppearance(currentUser);
    if (cached) {
      setAppearance(cached);
    } else {
      setAppearance(DEFAULT_APPEARANCE);
    }

    secureFetch(`/settings/appearance`)
      .then((data) => {
        if (!mounted) return;
        const normalized = normalizeAppearancePayload(data || {});
        setAppearance(normalized);
        writeCachedAppearance(currentUser, normalized);
        setLoaded(true);
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn("⚠️ Failed to load appearance:", err);
        setAppearance(cached || DEFAULT_APPEARANCE);
        setLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [
    currentUser?.email,
    currentUser?.id,
    currentUser?.restaurant_id,
    currentUser?.user_id,
    currentUser?.username,
  ]);

  const saveAppearance = useCallback(
    async (nextAppearance, options = {}) => {
      const merge = options?.merge !== false;
      const silent = options?.silent === true;
      const input =
        typeof nextAppearance === "function"
          ? nextAppearance(appearance)
          : nextAppearance || {};
      const normalized = normalizeAppearancePayload(
        merge ? { ...(appearance || {}), ...(input || {}) } : input
      );

      setAppearance(normalized);
      writeCachedAppearance(currentUser, normalized);

      try {
        await secureFetch(`/settings/appearance`, {
          method: "POST",
          body: JSON.stringify(normalized),
        });
        return normalized;
      } catch (err) {
        if (!silent) {
          console.error("❌ Failed to save appearance settings:", err);
        }
        return null;
      }
    },
    [appearance, currentUser]
  );

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
      default: { solid: "79 70 229", from: "79 70 229", to: "99 102 241" },
      black: { solid: "0 0 0", from: "0 0 0", to: "38 38 38" },
      "emerald-500": { solid: "16 185 129", from: "16 185 129", to: "20 184 166" },
      "rose-500": { solid: "244 63 94", from: "244 63 94", to: "236 72 153" },
      "amber-500": { solid: "245 158 11", from: "245 158 11", to: "249 115 22" },
      "cyan-500": { solid: "6 182 212", from: "6 182 212", to: "14 165 233" },
      "violet-500": { solid: "139 92 246", from: "139 92 246", to: "236 72 153" },
      "lime-500": { solid: "132 204 22", from: "132 204 22", to: "34 197 94" },
      "sky-500": { solid: "14 165 233", from: "14 165 233", to: "99 102 241" },
      white: { solid: "255 255 255", from: "255 255 255", to: "226 232 240" },
      sunset: { solid: "249 115 22", from: "244 63 94", to: "245 158 11" },
      ocean: { solid: "14 165 233", from: "6 182 212", to: "59 130 246" },
      grape: { solid: "139 92 246", from: "139 92 246", to: "236 72 153" },
      forest: { solid: "34 197 94", from: "16 185 129", to: "132 204 22" },
      midnight: { solid: "79 70 229", from: "30 41 59", to: "79 70 229" },
      fire: { solid: "239 68 68", from: "239 68 68", to: "249 115 22" },
    };

    const key = appearance.accent;
    const selected = accentMap[key] || accentMap.default;
    const textColor =
      key === "white" && appliedTheme !== "dark" ? "15 23 42" : selected.solid;

    root.style.setProperty("--accent-color", selected.solid);
    root.style.setProperty("--accent-from", selected.from);
    root.style.setProperty("--accent-to", selected.to);
    root.style.setProperty("--base-text-color", textColor);
    document.body.classList.toggle("contrast-more", appearance.highContrast);
  }, [loaded, appearance]);

  const contextValue = useMemo(
    () => ({ appearance, setAppearance, saveAppearance }),
    [appearance, saveAppearance]
  );

  if (currentUser?.id && !loaded) return null;

  return (
    <AppearanceContext.Provider value={contextValue}>
      {children}
    </AppearanceContext.Provider>
  );
}
