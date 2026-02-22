export async function fetchDriverRoute(secureFetch, { origin, destination, waypoints = "", mode } = {}) {
  const params = new globalThis.URLSearchParams({
    origin: String(origin || ""),
    destination: String(destination || ""),
    ...(waypoints ? { waypoints: String(waypoints) } : {}),
    ...(mode ? { mode: String(mode) } : {}),
  });
  return secureFetch(`drivers/google-directions?${params.toString()}`);
}

export async function fetchDriverReport(secureFetch, { driverId, date }) {
  return secureFetch(`/orders/driver-report?driver_id=${driverId}&date=${date}`);
}

export async function fetchLiveStops(secureFetch, waypoints = []) {
  return secureFetch("drivers/optimize-route", {
    method: "POST",
    body: JSON.stringify({ waypoints }),
  });
}
