import { useCallback, useEffect, useMemo, useState } from "react";
import { isInStandaloneMode, isIos, isLikelyInAppBrowser } from "../utils/pwaMode";

const DEFAULT_DISMISS_KEY = "beypro_ios_install_prompt_hidden";

function readPersistentDismiss(storageKey) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function detectState() {
  return {
    ios: isIos(),
    standalone: isInStandaloneMode(),
    inAppBrowser: isLikelyInAppBrowser(),
  };
}

export function useIosInstallPrompt(storageKey = DEFAULT_DISMISS_KEY) {
  const [state, setState] = useState(() => detectState());
  const [dismissedTemporarily, setDismissedTemporarily] = useState(false);
  const [dismissedPersistently, setDismissedPersistently] = useState(() =>
    readPersistentDismiss(storageKey)
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const refreshState = () => setState(detectState());
    refreshState();

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;

    const onMediaChange = () => refreshState();
    const onPageShow = () => refreshState();
    const onVisibilityChange = () => {
      if (!document.hidden) refreshState();
    };

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", onMediaChange);
      } else if (typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(onMediaChange);
      }
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === "function") {
          mediaQuery.removeEventListener("change", onMediaChange);
        } else if (typeof mediaQuery.removeListener === "function") {
          mediaQuery.removeListener(onMediaChange);
        }
      }
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissedTemporarily(true);
  }, []);

  const dontShowAgain = useCallback(() => {
    setDismissedTemporarily(true);
    setDismissedPersistently(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage errors.
    }
  }, [storageKey]);

  const shouldShow = useMemo(() => {
    if (!state.ios) return false;
    if (state.standalone) return false;
    if (dismissedTemporarily) return false;
    if (dismissedPersistently) return false;
    return true;
  }, [dismissedPersistently, dismissedTemporarily, state.ios, state.standalone]);

  return {
    shouldShow,
    isInAppBrowser: state.inAppBrowser,
    dismiss,
    dontShowAgain,
    isIosDevice: state.ios,
    isStandalone: state.standalone,
  };
}

export default useIosInstallPrompt;
