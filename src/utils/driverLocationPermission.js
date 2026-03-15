function isDriverUser(user) {
  const role = String(user?.role || user?.user?.role || "")
    .trim()
    .toLowerCase();
  return role === "driver";
}

export function requestDriverLocationPermission(user) {
  if (!isDriverUser(user)) return;
  if (typeof window === "undefined") return;
  if (!window.isSecureContext) return;
  if (!navigator?.geolocation) return;

  try {
    navigator.geolocation.getCurrentPosition(
      () => {
        // Permission granted or location resolved. LiveRouteMap will start publishing later.
      },
      () => {
        // Best-effort prompt only; keep login flow uninterrupted.
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  } catch {
    // Ignore browser geolocation errors during login bootstrap.
  }
}

export default requestDriverLocationPermission;
