let nav = null;

function getWindowRoute() {
  if (typeof window === "undefined") return null;
  const isHashRouting =
    window.location.protocol === "file:" ||
    !!window.beypro ||
    window.location.hash.startsWith("#/");
  if (isHashRouting) {
    const raw = window.location.hash || "";
    if (raw.startsWith("#/")) return raw.slice(1); // "/dashboard?x=1"
    if (raw.startsWith("#")) return raw.slice(1);
    return raw || "/";
  }
  return `${window.location.pathname || "/"}${window.location.search || ""}`;
}

function installHistoryNotification() {
  if (typeof window === "undefined") return;
  if (window.__beyproHistoryNotificationInstalled) return;
  window.__beyproHistoryNotificationInstalled = true;

  const notify = () => {
    try {
      window.dispatchEvent(new Event("beypro:navigation"));
    } catch {
      // ignore
    }
  };

  const wrap = (obj, key) => {
    try {
      const original = obj[key];
      if (typeof original !== "function") return;
      obj[key] = function (...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
    } catch {
      // ignore
    }
  };

  wrap(window.history, "pushState");
  wrap(window.history, "replaceState");

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
}

export function setNavigator(fn) {
  nav = fn;
  installHistoryNotification();
}

export function safeNavigate(path, options) {
  const { notify, ...navOptions } = options || {};
  installHistoryNotification();

  // Prefer the router navigate function when available
  if (nav) {
    nav(path, navOptions);
    if (notify && typeof window !== "undefined") {
      try {
        const isHashRouting =
          window.location.protocol === "file:" ||
          !!window.beypro ||
          window.location.hash.startsWith("#/");
        if (isHashRouting) {
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        // ignore notification failures
      }
    }
    return;
  }

  // Fallback: update the URL manually and fire a popstate event so React Router notices.
  try {
    const target =
      typeof path === "string"
        ? path
        : path?.pathname || "/";

    // In Electron (hash routing) keep using the hash segment; otherwise push a normal path
    const isHashRouting =
      typeof window !== "undefined" &&
      (window.location.protocol === "file:" ||
        !!window.beypro ||
        window.location.hash.startsWith("#/"));

    if (isHashRouting) {
      const nextHash = target.startsWith("#")
        ? target
        : `#${target.replace(/^#/, "")}`;
      window.location.hash = nextHash;
    } else {
      const nextPath = target.startsWith("/")
        ? target
        : `/${target}`;
      window.history.pushState({}, "", nextPath);
    }

    // Notify React Router that location changed (pushState/hash assignment doesn't emit popstate)
    if (isHashRouting) {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    window.dispatchEvent(new PopStateEvent("popstate"));
    // Also emit internal signal for any sync listeners.
    window.dispatchEvent(new Event("beypro:navigation"));
  } catch (err) {
    // As a last resort, force a full navigation
    if (typeof window !== "undefined") {
      window.location.href = typeof path === "string" ? path : "/";
    }
  }
}

export function getCurrentWindowRoute() {
  installHistoryNotification();
  return getWindowRoute();
}
