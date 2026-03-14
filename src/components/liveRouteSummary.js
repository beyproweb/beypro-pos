const DEFAULT_CITY_SPEED_KMH = 28;
const COORD_TOLERANCE = 0.0001;

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseDistanceText(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/([\d.,]+)\s*(km|m)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  return match[2] === "km" ? amount * 1000 : amount;
}

function parseDurationText(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;
  const hourMatch = raw.match(/(\d+)\s*h/);
  const minMatch = raw.match(/(\d+)\s*min/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minMatch ? Number(minMatch[1]) : 0;
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes > 0 ? totalMinutes * 60 : null;
}

function normalizeDistanceMeters(distance) {
  if (typeof distance === "object" && distance !== null) {
    return toFiniteNumber(distance.value) ?? parseDistanceText(distance.text);
  }
  return toFiniteNumber(distance) ?? parseDistanceText(distance);
}

function normalizeDurationSeconds(duration) {
  if (typeof duration === "object" && duration !== null) {
    return toFiniteNumber(duration.value) ?? parseDurationText(duration.text);
  }
  return toFiniteNumber(duration) ?? parseDurationText(duration);
}

function haversineDistanceMeters(a, b) {
  if (!a || !b) return null;
  const lat1 = toFiniteNumber(a.lat);
  const lng1 = toFiniteNumber(a.lng);
  const lat2 = toFiniteNumber(b.lat);
  const lng2 = toFiniteNumber(b.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

function estimateDurationSeconds(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  const metersPerHour = DEFAULT_CITY_SPEED_KMH * 1000;
  return Math.max(Math.round((distanceMeters / metersPerHour) * 3600), 60);
}

function formatStopName(stop, fallback) {
  return (
    String(stop?.customerName || "").trim() ||
    String(stop?.label || "").trim() ||
    String(stop?.address || "").trim() ||
    fallback
  );
}

function stopsMatch(stop, override) {
  if (!stop || !override) return false;
  const stopOrderId = String(stop.orderId || "").trim();
  const overrideOrderId = String(override.targetOrderId || "").trim();
  if (stopOrderId && overrideOrderId) return stopOrderId === overrideOrderId;

  const stopLat = toFiniteNumber(stop.lat);
  const stopLng = toFiniteNumber(stop.lng);
  const targetLat = toFiniteNumber(override.targetLat);
  const targetLng = toFiniteNumber(override.targetLng);
  if ([stopLat, stopLng, targetLat, targetLng].some((value) => value === null)) return false;

  return Math.abs(stopLat - targetLat) <= COORD_TOLERANCE && Math.abs(stopLng - targetLng) <= COORD_TOLERANCE;
}

export function formatDistanceKm(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) return "--";
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatDurationShort(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) return "--";
  const totalMinutes = Math.max(Math.round(durationSeconds / 60), 1);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function getApproximateLegMetric(fromPoint, toPoint) {
  const distanceMeters = haversineDistanceMeters(fromPoint, toPoint);
  const durationSeconds = estimateDurationSeconds(distanceMeters);

  return {
    distanceMeters,
    durationSeconds,
    approximate: true,
  };
}

export function getRouteLegSummaries({
  stops = [],
  directionsRoute = null,
  firstLegOverride = null,
} = {}) {
  const routeStops = Array.isArray(stops) ? stops : [];
  const customerStops = routeStops.filter((stop, idx) => {
    const stopIndex = Number(stop?.index ?? idx);
    return Number.isFinite(stopIndex) ? stopIndex > 0 : idx > 0;
  });
  const directionsLegs = Array.isArray(directionsRoute?.legs) ? directionsRoute.legs : [];

  const legs = customerStops.map((stop, listIndex) => {
    const routeIndex = Math.max(Number(stop?.index ?? listIndex + 1), 1) - 1;
    const previousStop = listIndex === 0 ? routeStops[0] || null : customerStops[listIndex - 1];
    const previousLabel =
      listIndex === 0
        ? String(firstLegOverride?.sourceLabel || "").trim() || formatStopName(previousStop, "Start")
        : formatStopName(previousStop, `Stop ${routeIndex}`);

    const shouldUseFirstLegOverride = listIndex === 0 && firstLegOverride && stopsMatch(stop, firstLegOverride);
    const chosenLeg = shouldUseFirstLegOverride ? firstLegOverride.leg : directionsLegs[routeIndex] || null;

    let distanceMeters = normalizeDistanceMeters(chosenLeg?.distance);
    let durationSeconds = normalizeDurationSeconds(
      chosenLeg?.duration_in_traffic ?? chosenLeg?.duration
    );
    let approximate = Boolean(shouldUseFirstLegOverride && firstLegOverride?.approximate);

    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      const fallbackStart = shouldUseFirstLegOverride ? firstLegOverride?.startPoint || previousStop : previousStop;
      const fallback = getApproximateLegMetric(fallbackStart, stop);
      distanceMeters = Number.isFinite(distanceMeters) && distanceMeters > 0 ? distanceMeters : fallback.distanceMeters;
      durationSeconds =
        Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : fallback.durationSeconds;
      approximate = true;
    }

    return {
      stopIndex: routeIndex + 1,
      orderId: stop?.orderId ?? null,
      customerName: formatStopName(stop, `Stop ${routeIndex + 1}`),
      fromLabel: previousLabel,
      distanceMeters,
      durationSeconds,
      distanceLabel: formatDistanceKm(distanceMeters),
      durationLabel: formatDurationShort(durationSeconds),
      approximate,
      status: stop?.status || "",
    };
  });

  const totalDistanceMeters = legs.reduce((sum, leg) => sum + (Number(leg.distanceMeters) || 0), 0);
  const totalDurationSeconds = legs.reduce((sum, leg) => sum + (Number(leg.durationSeconds) || 0), 0);
  const hasApproximateLegs = legs.some((leg) => leg.approximate);
  const allApproximate = legs.length > 0 && legs.every((leg) => leg.approximate);

  return {
    totalOrders: legs.length,
    totalDistanceMeters,
    totalDurationSeconds,
    totalDistanceLabel: formatDistanceKm(totalDistanceMeters),
    totalDurationLabel: formatDurationShort(totalDurationSeconds),
    hasTotals: legs.length > 1,
    hasApproximateLegs,
    allApproximate,
    legs,
  };
}
