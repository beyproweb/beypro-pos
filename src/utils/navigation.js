let nav = null;

export function setNavigator(fn) {
  nav = fn;
}

export function safeNavigate(path) {
  if (nav) {
    nav(path);
  } else {
    // Electron fallback
    window.location.hash = "#" + path;
  }
}
