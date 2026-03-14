import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Clock3,
  LoaderCircle,
  MapPin,
  Navigation,
  Route,
  ShieldCheck,
  Store,
  UserRound,
  X,
} from "lucide-react";
import { formatDistanceKm } from "./liveRouteSummary";

const APPROX_CITY_SPEED_KMH = 28;

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPoint(source) {
  if (!source || typeof source !== "object") return null;
  const lat = toFiniteNumber(source.lat);
  const lng = toFiniteNumber(source.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function haversineDistanceMeters(a, b) {
  if (!a || !b) return null;
  const lat1 = toFiniteNumber(a.lat);
  const lng1 = toFiniteNumber(a.lng);
  const lat2 = toFiniteNumber(b.lat);
  const lng2 = toFiniteNumber(b.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return null;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const radiusMeters = 6371000;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLng = toRad(lng2 - lng1);
  const sourceLat = toRad(lat1);
  const targetLat = toRad(lat2);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * radiusMeters * Math.asin(Math.sqrt(h));
}

function estimateDurationMinutes(distanceMeters) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  const metersPerMinute = (APPROX_CITY_SPEED_KMH * 1000) / 60;
  return Math.max(1, Math.round(distanceMeters / metersPerMinute));
}

function formatEta(etaMinutes, stage, t) {
  if (stage === "delivered") return t("Delivered");
  if (!Number.isFinite(etaMinutes)) return t("Updating");
  if (etaMinutes <= 0) return t("Very soon");
  return `${etaMinutes} min`;
}

function formatLastUpdated(rawValue, t) {
  const timestamp = rawValue ? new Date(rawValue).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return t("Waiting for update");

  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 10) return t("Updated just now");
  if (diffSeconds < 60) return `${t("Updated")} ${diffSeconds}s ${t("ago")}`;

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${t("Updated")} ${diffMinutes}m ${t("ago")}`;

  return t("Updated earlier");
}

function escapeMarkerLabel(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRestaurantMarkerLabel(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return ["Restaurant", ""];
  if (words.length === 1) {
    const word = words[0];
    if (word.length <= 10) return [word, ""];
    const midpoint = Math.ceil(word.length / 2);
    return [word.slice(0, midpoint), word.slice(midpoint)];
  }

  return [words[0], words.slice(1).join(" ")];
}

function getStageCopy(stage, tracking, t) {
  const hasDriverAssigned = Boolean(tracking?.driver?.assigned);
  const hasLiveLocation = Boolean(tracking?.driver?.has_live_location);

  switch (stage) {
    case "preparing":
      return {
        badge: t("Preparing order"),
        title: t("Your order is in the kitchen"),
        detail: t("We will keep the ETA updated while everything is being prepared."),
      };
    case "ready":
      return {
        badge: t("Estimated departure soon"),
        title: t("Your order is ready for dispatch"),
        detail: t("The driver handoff is about to begin."),
      };
    case "driver_assigned":
      return {
        badge: t("Driver assigned"),
        title: hasLiveLocation ? t("Your driver is already visible on the map") : t("Your driver has been assigned"),
        detail: hasLiveLocation
          ? t("Follow the driver live even before the trip officially starts.")
          : t("Departure is expected soon. We will switch to live movement as soon as coordinates arrive."),
      };
    case "on_road":
      return {
        badge: t("On the way"),
        title: t("Your driver is heading to you"),
        detail: t("The map will keep updating automatically."),
      };
    case "arriving":
      return {
        badge: t("Arriving soon"),
        title: t("Your driver is almost there"),
        detail: t("Please keep your phone nearby for the handoff."),
      };
    case "delivered":
      return {
        badge: t("Delivered"),
        title: t("Your order has arrived"),
        detail: t("Tracking is complete."),
      };
    case "confirmed":
    default:
      return {
        badge: hasDriverAssigned ? t("Driver assigned") : t("Confirmed"),
        title: hasDriverAssigned ? t("Dispatch is being prepared") : t("We are organizing your delivery"),
        detail: hasDriverAssigned
          ? t("You can already check the driver position and estimated arrival.")
          : t("Searching/assigning driver. ETA will update as soon as dispatch is ready."),
      };
  }
}

function createMarkerIcon({
  label,
  background,
  border,
  textColor,
  size = 44,
  width = null,
  paddingX = 0,
  multiline = false,
  fontSize = 11,
  letterSpacing = "0.06em",
}) {
  const resolvedWidth = Number.isFinite(width) ? width : size;
  const safeLabel = multiline
    ? String(label)
        .split("\n")
        .map((line) => `<span>${escapeMarkerLabel(line)}</span>`)
        .join("")
    : escapeMarkerLabel(label);
  return L.divIcon({
    className: "",
    iconSize: [resolvedWidth, size],
    iconAnchor: [resolvedWidth / 2, size / 2],
    html: `
      <div style="
        width:${resolvedWidth}px;
        height:${size}px;
        border-radius:999px;
        background:${background};
        border:2px solid ${border};
        color:${textColor};
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:0 12px 28px rgba(15,23,42,0.32);
        font-size:${fontSize}px;
        font-weight:800;
        letter-spacing:${letterSpacing};
        padding:0 ${paddingX}px;
        white-space:${multiline ? "normal" : "nowrap"};
        line-height:${multiline ? "1.05" : "1"};
        text-align:center;
        flex-direction:${multiline ? "column" : "row"};
      ">
        ${safeLabel}
      </div>
    `,
  });
}

function MapViewportController({ points = [] }) {
  const map = useMap();

  useEffect(() => {
    const validPoints = points.filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (!validPoints.length) return;

    if (validPoints.length === 1) {
      map.setView([validPoints[0].lat, validPoints[0].lng], 15, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(validPoints.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, {
      padding: [32, 32],
      maxZoom: 16,
    });
  }, [map, points]);

  return null;
}

function DetailCard({ icon: Icon, label, value, muted = false }) {
  return (
    <div
      className={`rounded-3xl border px-4 py-3 ${
        muted
          ? "border-white/8 bg-white/[0.04]"
          : "border-white/10 bg-white/[0.06] shadow-[0_16px_40px_rgba(0,0,0,0.22)]"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold leading-6 text-white">{value}</div>
    </div>
  );
}

export default function CustomerOrderTrackingView({
  open,
  orderId,
  buildUrl = (path) => path,
  appendIdentifier,
  t = (value) => value,
  onClose,
  socketInstance,
}) {
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const trackingRef = useRef(null);

  useEffect(() => {
    trackingRef.current = tracking;
  }, [tracking]);

  const requestUrl = useMemo(() => {
    const absolute = buildUrl(`/public/orders/${orderId}/tracking`);
    return appendIdentifier ? appendIdentifier(absolute) : absolute;
  }, [appendIdentifier, buildUrl, orderId]);

  const fetchTracking = useCallback(
    async ({ silent = false } = {}) => {
      if (!orderId) return;
      if (!silent) setLoading(true);

      try {
        const response = await fetch(requestUrl, {
          headers: {
            Accept: "application/json",
          },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "tracking_load_failed");
        }

        setTracking(payload);
        setError("");
      } catch (err) {
        if (!silent) {
          setError(
            err?.message === "Order not found"
              ? t("Tracking is no longer available for this order.")
              : t("Unable to load live tracking right now.")
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [orderId, requestUrl, t]
  );

  useEffect(() => {
    if (!open) return undefined;

    fetchTracking();
    const intervalId = window.setInterval(() => {
      fetchTracking({ silent: true });
    }, 8000);

    return () => window.clearInterval(intervalId);
  }, [fetchTracking, open]);

  useEffect(() => {
    if (!open || !socketInstance) return undefined;

    const refetch = () => fetchTracking({ silent: true });

    const handleDriverLocation = (payload) => {
      const current = trackingRef.current;
      const currentDriverId = String(current?.driver?.id || "").trim();
      const currentRestaurantId = Number(current?.restaurant_id || 0);
      const incomingDriverId = String(payload?.driver_id || "").trim();
      const incomingRestaurantId = Number(payload?.restaurant_id || 0);

      if (!currentDriverId || incomingDriverId !== currentDriverId) return;
      if (currentRestaurantId > 0 && incomingRestaurantId > 0 && currentRestaurantId !== incomingRestaurantId) {
        return;
      }

      setTracking((prev) =>
        prev
          ? {
              ...prev,
              updated_at: payload?.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString(),
              driver: {
                ...prev.driver,
                has_live_location: true,
                location: {
                  lat: payload?.lat,
                  lng: payload?.lng,
                  timestamp: payload?.timestamp || Date.now(),
                },
              },
              route_origin:
                Number.isFinite(Number(payload?.lat)) && Number.isFinite(Number(payload?.lng))
                  ? {
                      type: "driver",
                      label: "Driver",
                      lat: Number(payload.lat),
                      lng: Number(payload.lng),
                    }
                  : prev.route_origin,
            }
          : prev
      );
    };

    const handleOrderAwareEvent = (payload) => {
      const currentOrderId = Number(trackingRef.current?.order_id || orderId || 0);
      const candidateIds = [
        payload?.orderId,
        payload?.order_id,
        payload?.id,
        payload?.order?.id,
        payload?.order?.order_id,
      ]
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);

      if (!candidateIds.length || candidateIds.includes(currentOrderId)) {
        refetch();
      }
    };

    socketInstance.on("driver_location_updated", handleDriverLocation);
    socketInstance.on("driver_assigned", handleOrderAwareEvent);
    socketInstance.on("driver_on_road", handleOrderAwareEvent);
    socketInstance.on("driver_status_updated", handleOrderAwareEvent);
    socketInstance.on("order_preparing", handleOrderAwareEvent);
    socketInstance.on("order_ready", handleOrderAwareEvent);
    socketInstance.on("order_delivered", handleOrderAwareEvent);
    socketInstance.on("order_cancelled", handleOrderAwareEvent);
    socketInstance.on("orders_updated", refetch);

    return () => {
      socketInstance.off("driver_location_updated", handleDriverLocation);
      socketInstance.off("driver_assigned", handleOrderAwareEvent);
      socketInstance.off("driver_on_road", handleOrderAwareEvent);
      socketInstance.off("driver_status_updated", handleOrderAwareEvent);
      socketInstance.off("order_preparing", handleOrderAwareEvent);
      socketInstance.off("order_ready", handleOrderAwareEvent);
      socketInstance.off("order_delivered", handleOrderAwareEvent);
      socketInstance.off("order_cancelled", handleOrderAwareEvent);
      socketInstance.off("orders_updated", refetch);
    };
  }, [fetchTracking, open, orderId, socketInstance]);

  useEffect(() => {
    if (!open || !socketInstance || !tracking?.restaurant_id) return;
    socketInstance.emit("join_restaurant", tracking.restaurant_id);
  }, [open, socketInstance, tracking?.restaurant_id]);

  const driverPoint = toPoint(tracking?.driver?.location);
  const customerPoint = toPoint(tracking?.customer);
  const restaurantPoint = toPoint(tracking?.restaurant);
  const routeOriginPoint = toPoint(tracking?.route_origin) || driverPoint || restaurantPoint;
  const fallbackDistanceMeters = routeOriginPoint && customerPoint ? haversineDistanceMeters(routeOriginPoint, customerPoint) : null;
  const fallbackEtaMinutes = estimateDurationMinutes(fallbackDistanceMeters);

  const routePath = useMemo(() => {
    const explicitPath = Array.isArray(tracking?.route?.path)
      ? tracking.route.path
          .map((point) => toPoint(point))
          .filter(Boolean)
      : [];

    if (explicitPath.length >= 2) return explicitPath;
    if (routeOriginPoint && customerPoint) return [routeOriginPoint, customerPoint];
    return [];
  }, [customerPoint, routeOriginPoint, tracking?.route?.path]);

  const displayEtaMinutes = Number.isFinite(Number(tracking?.eta_minutes))
    ? Number(tracking.eta_minutes)
    : fallbackEtaMinutes;
  const stage = String(tracking?.tracking_stage || "confirmed");
  const stageCopy = getStageCopy(stage, tracking, t);
  const driverLocationTimestamp = tracking?.driver?.location?.timestamp || tracking?.updated_at || null;
  const routeDistanceMeters = Number.isFinite(Number(tracking?.route?.distance_meters))
    ? Number(tracking.route.distance_meters)
    : fallbackDistanceMeters;
  const routeSource = tracking?.route?.source || (routePath.length >= 2 ? "approximate" : "");
  const mapPoints = [driverPoint, customerPoint, restaurantPoint, routeOriginPoint].filter(Boolean);
  const compactDriverAssignedCopy = stage === "driver_assigned";
  const restaurantMarkerLabel = String(tracking?.restaurant?.name || t("Restaurant")).trim() || t("Restaurant");
  const restaurantMarkerLines = formatRestaurantMarkerLabel(restaurantMarkerLabel);
  const restaurantMarkerSubtext =
    stage === "preparing" || stage === "confirmed" || stage === "ready" || stage === "driver_assigned"
      ? t("Preparing your order")
      : stage === "on_road" || stage === "arriving"
        ? t("Order picked up")
        : "";

  const driverIcon = useMemo(
    () =>
      createMarkerIcon({
        label: t("DRV"),
        background: "linear-gradient(135deg,#22d3ee,#2563eb)",
        border: "rgba(255,255,255,0.8)",
        textColor: "#f8fafc",
      }),
    [t]
  );
  const customerIcon = useMemo(
    () =>
      createMarkerIcon({
        label: t("YOU"),
        background: "linear-gradient(135deg,#fb7185,#f97316)",
        border: "rgba(255,255,255,0.85)",
        textColor: "#fff7ed",
      }),
    [t]
  );
  const restaurantIcon = useMemo(
    () =>
      createMarkerIcon({
        label: restaurantMarkerLines.filter(Boolean).join("\n"),
        background: "linear-gradient(135deg,#34d399,#14b8a6)",
        border: "rgba(255,255,255,0.78)",
        textColor: "#ecfeff",
        size: 52,
        multiline: true,
        fontSize: 8.5,
        letterSpacing: "0.02em",
      }),
    [restaurantMarkerLines]
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[160] overflow-y-auto bg-[radial-gradient(circle_at_top,#15314a_0%,#0a0f18_42%,#030712_100%)] text-white">
      <div className="mx-auto min-h-screen w-full max-w-[640px] px-4 pb-6 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
              {t("Live delivery")}
            </div>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-white">
              {t("Follow my order")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/82 transition hover:bg-white/10"
            aria-label={t("Close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-[32px] border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-cyan-100">
                {stageCopy.badge}
              </div>
              <div className={`mt-3 font-semibold leading-tight text-white ${compactDriverAssignedCopy ? "text-[18px]" : "text-xl"}`}>
                {stageCopy.title}
              </div>
              <div className={`mt-2 leading-6 text-white/72 ${compactDriverAssignedCopy ? "text-[12px]" : "text-sm"}`}>
                {stageCopy.detail}
              </div>
            </div>
            <div className="rounded-[26px] border border-white/10 bg-black/20 px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                {t("ETA")}
              </div>
              <div className="mt-2 whitespace-nowrap text-base font-semibold leading-none text-white sm:text-lg">
                {formatEta(displayEtaMinutes, stage, t)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <DetailCard
              icon={ShieldCheck}
              label={t("Status")}
              value={stageCopy.badge}
              muted
            />
            <DetailCard
              icon={Clock3}
              label={t("Updates")}
              value={formatLastUpdated(driverLocationTimestamp, t)}
              muted
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[32px] border border-white/10 bg-[#07111d] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/88">
              <Navigation className="h-4 w-4 text-cyan-300" />
              <span>{t("Live route")}</span>
            </div>
            <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-white/45">
              {routeSource === "osrm" ? t("Route") : t("Approximate")}
            </div>
          </div>

          <div className="h-[360px] bg-slate-950">
            {loading && !tracking ? (
              <div className="flex h-full items-center justify-center text-white/72">
                <LoaderCircle className="mr-3 h-5 w-5 animate-spin text-cyan-300" />
                <span>{t("Loading live tracking...")}</span>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-white/72">
                {error}
              </div>
            ) : mapPoints.length ? (
              <MapContainer
                center={[mapPoints[0].lat, mapPoints[0].lng]}
                zoom={14}
                scrollWheelZoom
                className="h-full w-full"
                zoomControl={false}
              >
                <MapViewportController points={mapPoints} />
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {routePath.length >= 2 ? (
                  <Polyline
                    positions={routePath.map((point) => [point.lat, point.lng])}
                    pathOptions={{
                      color: "#22d3ee",
                      weight: 5,
                      opacity: 0.82,
                    }}
                  />
                ) : null}

                {restaurantPoint ? (
                  <Marker position={[restaurantPoint.lat, restaurantPoint.lng]} icon={restaurantIcon}>
                    <Tooltip direction="top" offset={[0, -12]} permanent={false}>
                      <div className="text-center">
                        <div>{restaurantMarkerLabel}</div>
                        {restaurantMarkerSubtext ? (
                          <div className="mt-0.5 text-[11px] text-slate-600">{restaurantMarkerSubtext}</div>
                        ) : null}
                      </div>
                    </Tooltip>
                  </Marker>
                ) : null}

                {customerPoint ? (
                  <Marker position={[customerPoint.lat, customerPoint.lng]} icon={customerIcon}>
                    <Tooltip direction="top" offset={[0, -12]} permanent={false}>
                      {t("Your destination")}
                    </Tooltip>
                  </Marker>
                ) : null}

                {driverPoint ? (
                  <Marker position={[driverPoint.lat, driverPoint.lng]} icon={driverIcon}>
                    <Tooltip direction="top" offset={[0, -12]} permanent={false}>
                      {tracking?.driver?.name || t("Driver")}
                    </Tooltip>
                  </Marker>
                ) : null}
              </MapContainer>
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-white/72">
                {t("We are preparing the tracking view. Status and ETA will keep updating here.")}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <DetailCard
            icon={UserRound}
            label={t("Driver")}
            value={
              tracking?.driver?.assigned
                ? tracking?.driver?.name || t("Driver assigned")
                : t("Searching/assigning driver")
            }
          />
          <DetailCard
            icon={MapPin}
            label={t("Destination")}
            value={tracking?.customer?.address || t("Delivery address will appear here once available.")}
          />
          <DetailCard
            icon={Route}
            label={t("Route progress")}
            value={
              Number.isFinite(routeDistanceMeters)
                ? `${formatDistanceKm(routeDistanceMeters)} • ${formatEta(displayEtaMinutes, stage, t)}`
                : t("ETA and route will update automatically.")
            }
            muted
          />
          {tracking?.driver?.assigned && !tracking?.driver?.has_live_location ? (
            <DetailCard
              icon={Store}
              label={t("Driver location")}
              value={t("Live coordinates are temporarily unavailable. Showing fallback ETA and status in the meantime.")}
              muted
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
