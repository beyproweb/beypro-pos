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

  // Fallback: update the URL manually and fire events so React Router notices.
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
      try {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } catch {
        window.dispatchEvent(new Event("hashchange"));
      }
    } else {
      const nextPath = target.startsWith("/")
        ? target
        : `/${target}`;
      if (options?.replace) {
        window.history.replaceState({}, "", nextPath);
      } else {
        window.history.pushState({}, "", nextPath);
      }
    }

    try {
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      window.dispatchEvent(new Event("popstate"));
    }
  } catch (err) {
    // As a last resort, force a full navigation
    if (typeof window !== "undefined") {
      window.location.href = typeof path === "string" ? path : "/";
    }
  }
}
