const IOS_UA_REGEX = /iPad|iPhone|iPod/i;
const IN_APP_BROWSER_UA_REGEX =
  /Instagram|FBAN|FBAV|FB_IAB|FB4A|Line\/|Twitter|LinkedInApp|Snapchat|TikTok|Pinterest|Telegram|WebView|; wv\)/i;
const IOS_BROWSER_UA_REGEX = /CriOS|FxiOS|EdgiOS|OPiOS/i;
const IOS_NON_SAFARI_REGEX =
  /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|YaBrowser|OPT\/|Focus\/|Brave/i;

export function isIos() {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);

  return IOS_UA_REGEX.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isAndroid() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android/i.test(ua);
}

export function isInStandaloneMode() {
  if (typeof window === "undefined") return false;

  const standaloneByMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false;
  const standaloneByNavigator = window.navigator?.standalone === true;

  return standaloneByMedia || standaloneByNavigator;
}

export function isLikelyInAppBrowser() {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  if (IN_APP_BROWSER_UA_REGEX.test(ua)) return true;

  if (!isIos()) {
    return isAndroid() && /\bwv\b|Version\/[\d.]+.*Chrome\/[\d.]+.*Mobile Safari/i.test(ua);
  }

  const isAppleWebKit = /AppleWebKit/i.test(ua);
  const hasSafariToken = /Safari/i.test(ua);
  const hasKnownBrowserToken = IOS_BROWSER_UA_REGEX.test(ua);

  return isAppleWebKit && !hasSafariToken && !hasKnownBrowserToken;
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  if (!isIos()) return false;
  if (isLikelyInAppBrowser()) return false;

  const ua = navigator.userAgent || "";
  if (!/Safari/i.test(ua)) return false;
  if (IOS_NON_SAFARI_REGEX.test(ua)) return false;
  return true;
}
