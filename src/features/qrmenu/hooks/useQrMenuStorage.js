import { useState, useEffect, useMemo, useCallback } from "react";
import { getCheckoutPrefill } from "../header-drawer/services/customerService";
import i18n from "../../../i18n";
import { isInStandaloneMode, isLikelyInAppBrowser, isIosSafari } from "../../../utils/pwaMode";
import {
  persistLanguage,
  resolvePreferredLanguage,
} from "../../../utils/language";

export function useQrMenuStorage({
  slug,
  id,
  QR_TOKEN_KEY,
  API_URL,
  restaurantIdentifierResolved,
  restaurantIdentifier,
  makeT,
  storage,
  getStoredToken,
  getPlatform,
  appendIdentifier,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (restaurantIdentifierResolved) {
        window.localStorage.setItem("qr_last_identifier", String(restaurantIdentifierResolved));
        return;
      }

      const path = window.location.pathname || "";
      if (path === "/menu") {
        const last = window.localStorage.getItem("qr_last_identifier");
        if (last && last !== "null" && last !== "undefined") {
          window.location.replace(`/qr-menu/${encodeURIComponent(last)}/scan`);
        }
      }
    } catch {}
  }, [restaurantIdentifierResolved]);

  const tokenResolveIdentifier = id || restaurantIdentifier;

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      if (urlToken) {
        storage.setItem(QR_TOKEN_KEY, urlToken);
        return;
      }
    } catch {}

    (async () => {
      try {
        const existing = getStoredToken();
        if (existing) return;
        if (!tokenResolveIdentifier) return;
        const res = await fetch(
          `${API_URL}/public/qr-resolve/${encodeURIComponent(tokenResolveIdentifier)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.qr_token) {
          storage.setItem(QR_TOKEN_KEY, data.qr_token);
        }
      } catch {}
    })();
  }, [tokenResolveIdentifier, API_URL, QR_TOKEN_KEY, getStoredToken, storage]);

  const [lang, setLang] = useState(() => resolvePreferredLanguage({ storage }));
  useEffect(() => {
    persistLanguage(lang, storage);
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang).catch(() => {});
    }
  }, [lang, storage]);
  const t = useMemo(() => makeT(lang), [lang, makeT]);

  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const resolveInstallSurface = useCallback(() => {
    const detectedPlatform =
      typeof getPlatform === "function" ? getPlatform() : "other";
    const iosSafari = isIosSafari();
    const iosInApp = detectedPlatform === "ios" && isLikelyInAppBrowser();
    return {
      platform: detectedPlatform,
      isIosSafari: iosSafari,
      isIosInAppBrowser: iosInApp,
    };
  }, [getPlatform]);

  const [platform, setPlatform] = useState(() => resolveInstallSurface().platform);
  const [isIosSafariBrowser, setIsIosSafariBrowser] = useState(
    () => resolveInstallSurface().isIosSafari
  );
  const [isIosInAppBrowser, setIsIosInAppBrowser] = useState(
    () => resolveInstallSurface().isIosInAppBrowser
  );
  const qrSavedKey = useMemo(() => {
    const raw =
      restaurantIdentifierResolved ||
      restaurantIdentifier ||
      slug ||
      id ||
      "";
    const normalized = String(raw).trim();
    if (!normalized) return "qr_saved";
    return `qr_saved_${normalized.toLowerCase()}`;
  }, [id, restaurantIdentifier, restaurantIdentifierResolved, slug]);
  const [showQrPrompt, setShowQrPrompt] = useState(() => {
    return !storage.getItem(qrSavedKey);
  });
  const [qrPromptMode, setQrPromptMode] = useState("default");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const markQrSaved = useCallback(() => {
    storage.setItem(qrSavedKey, "1");
  }, [qrSavedKey, storage]);

  useEffect(() => {
    setShowQrPrompt(!storage.getItem(qrSavedKey));
  }, [qrSavedKey, storage]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const refreshInstallSurface = () => {
      const next = resolveInstallSurface();
      setPlatform(next.platform);
      setIsIosSafariBrowser(next.isIosSafari);
      setIsIosInAppBrowser(next.isIosInAppBrowser);
    };

    refreshInstallSurface();

    const onPageShow = () => refreshInstallSurface();
    const onVisibilityChange = () => {
      if (!document.hidden) refreshInstallSurface();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [resolveInstallSurface]);

  const getSavedDeliveryInfo = useCallback(() => {
    try {
      const profilePrefill = getCheckoutPrefill(storage);
      if (profilePrefill && profilePrefill.address) return profilePrefill;
    } catch {}
    return null;
  }, [storage]);

  useEffect(() => {
    const handler = (e) => {
      // Temporarily disabled — let the browser handle install natively.
      setDeferredPrompt(null);
      setCanInstall(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    const isStandalone = isInStandaloneMode();
    if (!isStandalone) return;
    markQrSaved();
    setShowQrPrompt(false);
  }, [markQrSaved]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleInstalled = () => {
      markQrSaved();
      setShowQrPrompt(false);
      setDeferredPrompt(null);
      setCanInstall(false);
    };
    window.addEventListener("appinstalled", handleInstalled);
    return () => window.removeEventListener("appinstalled", handleInstalled);
  }, [markQrSaved]);

  const handleInstallClick = useCallback(() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === "accepted") {
        markQrSaved();
        setShowQrPrompt(false);
        console.log("✅ User installed app");
      }
      setDeferredPrompt(null);
      setCanInstall(false);
    });
  }, [deferredPrompt, markQrSaved]);

  const handleDownloadQr = useCallback(() => {
    const isStandalone = isInStandaloneMode();
    const installSurface = resolveInstallSurface();
    const isIosManualInstall = installSurface.platform === "ios";

    if (isStandalone) {
      markQrSaved();
      setShowQrPrompt(false);
      return;
    }

    if (isIosManualInstall) {
      // iOS install is manual in Safari; keep users in a single guided modal flow.
      setShowQrPrompt(true);
      setShowHelp(false);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        if (choice?.outcome === "accepted") {
          markQrSaved();
          setShowQrPrompt(false);
        } else {
          setShowQrPrompt(true);
        }
      }).finally(() => {
        setDeferredPrompt(null);
        setCanInstall(false);
      });
      return;
    }

    // Keep prompt persistent until an actual install happens.
    setShowQrPrompt(true);
    setShowHelp(true);
  }, [deferredPrompt, markQrSaved, resolveInstallSurface]);

  return {
    lang,
    setLang,
    t,
    showIosHelp,
    setShowIosHelp,
    showHelp,
    setShowHelp,
    platform,
    setPlatform,
    isIosSafariBrowser,
    isIosInAppBrowser,
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    getSavedDeliveryInfo,
    handleInstallClick,
    handleDownloadQr,
  };
}

export default useQrMenuStorage;
