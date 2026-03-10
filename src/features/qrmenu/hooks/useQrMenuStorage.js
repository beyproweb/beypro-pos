import { useState, useEffect, useMemo, useCallback } from "react";

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

  const [lang, setLang] = useState(() => storage.getItem("qr_lang") || "en");
  useEffect(() => {
    storage.setItem("qr_lang", lang);
  }, [lang, storage]);
  const t = useMemo(() => makeT(lang), [lang, makeT]);

  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [platform, setPlatform] = useState(getPlatform());
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

  const getSavedDeliveryInfo = useCallback(() => {
    try {
      const saved = JSON.parse(storage.getItem("qr_delivery_info") || "null");
      if (saved && typeof saved === "object" && saved.address) {
        return {
          name: saved.name || "",
          phone: saved.phone || "",
          address: saved.address || "",
          payment_method: saved.payment_method || "",
        };
      }
    } catch {}
    return null;
  }, [storage]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [appendIdentifier]);

  useEffect(() => {
    const isStandalone =
      (typeof window !== "undefined" &&
        (window.matchMedia?.("(display-mode: standalone)")?.matches ||
          window.navigator?.standalone)) ||
      false;
    if (!isStandalone) return;
    markQrSaved();
    setShowQrPrompt(false);
  }, [markQrSaved]);

  const handleInstallClick = useCallback(() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === "accepted") {
        console.log("✅ User installed app");
      }
      setDeferredPrompt(null);
      setCanInstall(false);
    });
  }, [deferredPrompt]);

  const handleDownloadQr = useCallback(() => {
    const isStandalone =
      (typeof window !== "undefined" &&
        (window.matchMedia?.("(display-mode: standalone)")?.matches ||
          window.navigator?.standalone)) ||
      false;

    if (isStandalone) {
      markQrSaved();
      setShowQrPrompt(false);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => {
        setDeferredPrompt(null);
        setCanInstall(false);
        markQrSaved();
        setShowQrPrompt(false);
      });
      return;
    }

    markQrSaved();
    setShowQrPrompt(false);
    setShowHelp(true);
  }, [deferredPrompt, markQrSaved]);

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
    showQrPrompt,
    setShowQrPrompt,
    qrPromptMode,
    setQrPromptMode,
    deferredPrompt,
    setDeferredPrompt,
    canInstall,
    setCanInstall,
    getSavedDeliveryInfo,
    markQrSaved,
    handleInstallClick,
    handleDownloadQr,
  };
}

export default useQrMenuStorage;
