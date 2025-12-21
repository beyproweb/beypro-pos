let nav = null;

export function setNavigator(fn) {
  nav = fn;
}

export function safeNavigate(path, options) {
  // Prefer the router navigate function when available
  if (nav) {
    nav(path, options);
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
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch (err) {
    // As a last resort, force a full navigation
    if (typeof window !== "undefined") {
      window.location.href = typeof path === "string" ? path : "/";
    }
  }
}
