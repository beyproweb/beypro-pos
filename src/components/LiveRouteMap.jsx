import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import polyline from "@mapbox/polyline";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";
import { useAuth } from "../context/AuthContext";
import RouteSummaryCard from "./RouteSummaryCard";
import { getRouteLegSummaries } from "./liveRouteSummary";

// Custom marker colors
const MARKER_COLORS = {
  ready: "#22C55E", // Green
  in_progress: "#EAB308", // Yellow
  delayed: "#EF4444", // Red
  completed: "#8B5CF6", // Purple
  restaurant: "#3B82F6", // Blue
};

function extractDriverIdFromOrder(order) {
  const direct = order?.driver_id;
  const directCandidates =
    direct && typeof direct === "object"
      ? [direct.id, direct.driver_id, direct.staff_id, direct.user_id]
      : [direct];
  const nestedDriver = order?.driver;
  const nestedCandidates =
    nestedDriver && typeof nestedDriver === "object"
      ? [nestedDriver.id, nestedDriver.driver_id, nestedDriver.staff_id, nestedDriver.user_id]
      : [];

  return (
    [...directCandidates, order?.driverId, order?.assigned_driver_id, order?.assignedDriverId, ...nestedCandidates]
      .map((value) => String(value ?? "").trim())
      .find(Boolean) || ""
  );
}

function extractDriverIdFromDriver(driver) {
  return (
    [
      driver?.id,
      driver?.driver_id,
      driver?.staff_id,
      driver?.user_id,
      driver?.assigned_driver_id,
      driver?.assignedDriverId,
    ]
      .map((value) => String(value ?? "").trim())
      .find(Boolean) || ""
  );
}

function extractDriverIdCandidatesFromDriver(driver) {
  return [
    driver?.id,
    driver?.driver_id,
    driver?.staff_id,
    driver?.user_id,
    driver?.assigned_driver_id,
    driver?.assignedDriverId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function extractDriverIdCandidatesFromUser(user) {
  return [
    user?.id,
    user?.driver_id,
    user?.staff_id,
    user?.user_id,
    user?.assigned_driver_id,
    user?.assignedDriverId,
    user?.user?.id,
    user?.user?.driver_id,
    user?.user?.staff_id,
    user?.user?.user_id,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function extractCoordsFromOrder(order) {
  const lat = Number(
    order?.delivery_lat ??
      order?.delivery_latitude ??
      order?.lat ??
      order?.latitude ??
      order?.pickup_lat ??
      order?.pickup_latitude
  );
  const lng = Number(
    order?.delivery_lng ??
      order?.delivery_longitude ??
      order?.lng ??
      order?.longitude ??
      order?.pickup_lng ??
      order?.pickup_longitude
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Professional Google Maps-style delivery map interface
 * Features:
 * - Real-time driver location tracking
 * - Numbered delivery stops with status colors
 * - Interactive info windows
 * - Live route updates
 * - Map controls (satellite/standard, traffic, completed deliveries)
 * - Socket.io integration for real-time updates
 */
export default function LiveRouteMap({
  stopsOverride,
  driverNameOverride,
  driverId,
  orders = [],
  drivers = [],
  onClose,
  onOrderDelivered,
}) {
  const [driverPos, setDriverPos] = useState(null);
  const [driverPositions, setDriverPositions] = useState([]);
  const [resolvedDriverName, setResolvedDriverName] = useState("");
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeDirections, setRouteDirections] = useState(null);
  const [routeMetricsLoading, setRouteMetricsLoading] = useState(false);
  const [nextStop, setNextStop] = useState(null);
  const [liveRouteCoords, setLiveRouteCoords] = useState(null);
  const [firstLegOverride, setFirstLegOverride] = useState(null);
  const [firstLegMetricsLoading, setFirstLegMetricsLoading] = useState(false);
  const [activeStopIndex, setActiveStopIndex] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapType, setMapType] = useState("standard"); // "standard" or "satellite"
  const [showTraffic, setShowTraffic] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [stops, setStops] = useState([]);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [showStopsPanel, setShowStopsPanel] = useState(false);
  const [showSidebarStops, setShowSidebarStops] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState(() => Date.now());
  
  const mapRef = useRef(null);
  const scooterMarkerRef = useRef(null);
  const autoSelectedRouteKeyRef = useRef("");
  const fittedViewportKeyRef = useRef("");
  const failedLocationIdsRef = useRef(new Map());
  const auth = useAuth();
  const currentUser = auth?.currentUser || null;
  const { t } = useTranslation();
  // traffic tile URL can be configured via env: VITE_TRAFFIC_TILE_URL or use Mapbox token
  const TRAFFIC_TILE_URL =
    import.meta.env.VITE_TRAFFIC_TILE_URL ||
    (import.meta.env.VITE_MAPBOX_TOKEN
      ? `https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.png?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`
      : null);
  const canShowTraffic = Boolean(TRAFFIC_TILE_URL);
  const currentUserRoleRaw = String(currentUser?.role || "").trim().toLowerCase();
  const knownDriverIds = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(drivers) ? drivers : []).flatMap((driver) =>
            extractDriverIdCandidatesFromDriver(driver)
          )
        )
      ),
    [drivers]
  );
  const knownOrderDriverIds = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(orders) ? orders : [])
            .map((order) => extractDriverIdFromOrder(order))
            .filter(Boolean)
        )
      ),
    [orders]
  );
  const currentUserDriverIds = useMemo(() => {
    const authIds = extractDriverIdCandidatesFromUser(currentUser);
    if (authIds.length) return Array.from(new Set(authIds));

    if (typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(
        window.sessionStorage?.getItem("beyproUser") ||
          window.localStorage?.getItem("beyproUser") ||
          "{}"
      );
      return Array.from(new Set(extractDriverIdCandidatesFromUser(stored)));
    } catch {
      return [];
    }
  }, [currentUser]);
  const inferredDriverId = useMemo(() => {
    const explicit = String(driverId || "").trim();
    if (explicit) return "";
    if (currentUserRoleRaw !== "driver") return "";
    if (!currentUserDriverIds.length) return "";

    const preferredId =
      [...knownOrderDriverIds, ...knownDriverIds].find((id) => currentUserDriverIds.includes(id)) ||
      "";
    return preferredId || currentUserDriverIds[0] || "";
  }, [currentUserDriverIds, currentUserRoleRaw, driverId, knownDriverIds, knownOrderDriverIds]);
  const selectedDriverRaw = String(driverId || inferredDriverId || "").trim();
  const hasSelectedDriver = selectedDriverRaw !== "";
  const effectiveDriverName = driverNameOverride || resolvedDriverName || "";
  const headerDriverLabel = hasSelectedDriver
    ? effectiveDriverName || t("Driver")
    : t("All Drivers");
  const baseRoute = stopsOverride && stopsOverride.length > 1 ? stopsOverride : [];
  const routeKey = useMemo(() => JSON.stringify(baseRoute || []), [baseRoute]);
  const displayRoute = optimizedRoute.length ? optimizedRoute : baseRoute;
  const displayRouteKey = useMemo(() => JSON.stringify(displayRoute || []), [displayRoute]);
  const trackedDriverIds = useMemo(() => {
    if (selectedDriverRaw) return [selectedDriverRaw];

    const fromDrivers = Array.from(
      new Set(
        (Array.isArray(drivers) ? drivers : [])
          .map((driver) => extractDriverIdFromDriver(driver))
          .filter(Boolean)
      )
    );

    const fromOrders = Array.from(
      new Set(
        (Array.isArray(orders) ? orders : [])
          .map((order) => extractDriverIdFromOrder(order))
          .filter(Boolean)
      )
    );

    if (fromOrders.length) return fromOrders;
    return fromDrivers;
  }, [drivers, orders, selectedDriverRaw]);
  const locationDebugKeyRef = useRef("");
  const isCurrentUserSelectedDriver = useMemo(() => {
    if (!selectedDriverRaw) return false;
    return currentUserDriverIds.includes(selectedDriverRaw);
  }, [currentUserDriverIds, selectedDriverRaw]);

  const nearbyCounts = useMemo(() => {
    if (!stops.length) return [];
    const toRad = (deg) => (deg * Math.PI) / 180;
    const distMeters = (a, b) => {
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    const threshold = 75;
    return stops.map((stop, idx) => {
      if (typeof stop.lat !== "number" || typeof stop.lng !== "number") return 0;
      let count = 0;
      for (let i = 0; i < stops.length; i++) {
        if (i === idx) continue;
        const other = stops[i];
        if (typeof other.lat !== "number" || typeof other.lng !== "number") continue;
        if (distMeters(stop, other) <= threshold) count += 1;
      }
      return count;
    });
  }, [stops]);

  const getStopStatusLabel = useCallback(
    (stop) => {
      if (!stop) return t("Confirmed");
      if (stop.delivered || stop.status === "completed" || stop.status === "delivered") return t("Delivered");
      if (stop.status === "delayed") return t("Delayed");
      if (stop.status === "in_progress" || stop.status === "on_road") return t("In Progress");
      return t("Confirmed");
    },
    [t]
  );

  const getStopStatusPillClass = useCallback((stop) => {
    const label = getStopStatusLabel(stop);
    if (label === t("Delivered")) return "bg-emerald-600 text-white";
    if (label === t("Delayed")) return "bg-rose-600 text-white";
    if (label === t("In Progress")) return "bg-amber-600 text-white";
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }, [getStopStatusLabel, t]);

  const focusStopOnMap = useCallback((stop) => {
    const map = mapRef.current;
    if (!map || !stop || typeof stop.lat !== "number" || typeof stop.lng !== "number") return;
    try {
      map.flyTo([stop.lat, stop.lng], Math.max(map.getZoom?.() || 14, 15), {
        animate: true,
        duration: 0.6,
      });
    } catch {
      // ignore flyTo failures
    }
  }, []);

  // Initialize stops with status info
  useEffect(() => {
    if (!displayRoute.length) {
      setStops([]);
      setActiveStopIndex(null);
      setSelectedMarker(null);
      return;
    }

    const stopsWithStatus = displayRoute.map((stop, idx) => {
      // Try multiple matching strategies to find the corresponding order
      let order = null;
      
      // Strategy 1: Match by address from stop object directly (if available)
      if (!order && stop.address && orders.length > 0) {
        order = orders.find(o => 
          o.customer_address && 
          o.customer_address.toLowerCase().trim() === stop.address.toLowerCase().trim()
        );
      }

      // Strategy 2: Match by exact address (fallback)
      if (!order && orders.length > 0) {
        order = orders.find(o => 
          o.customer_address && stop.label && 
          o.customer_address.toLowerCase().trim() === stop.label.toLowerCase().trim()
        );
      }
      
      // Strategy 3: Match by coordinates (lat/lng)
      if (!order && orders.length > 0) {
        order = orders.find(o => 
          o.lat && o.lng && stop.lat && stop.lng &&
          Math.abs(o.lat - stop.lat) < 0.0001 && 
          Math.abs(o.lng - stop.lng) < 0.0001
        );
      }
      
      // Strategy 4: Match by partial address (contains)
      if (!order && orders.length > 0 && stop.label) {
        order = orders.find(o => 
          o.customer_address && 
          (o.customer_address.toLowerCase().includes(stop.label.toLowerCase()) ||
           stop.label.toLowerCase().includes(o.customer_address.toLowerCase()))
        );
      }
      
      // Strategy 5: If no order found, try to find by index (sequential matching)
      if (!order && idx > 0 && idx < orders.length) {
        order = orders[idx];
      }
      
      return {
        ...stop,
        index: idx,
        driverId: extractDriverIdFromOrder(order) || null,
        hasKitchenExcludedItem: Array.isArray(order?.items)
          ? order.items.some(
              (item) => item?.kitchen_excluded === true || item?.excluded === true
            )
          : false,
        status:
          order?.driver_status ||
          (order?.delivered_at ? "delivered" : "") ||
          order?.delivery_status ||
          order?.status ||
          "ready",
        kitchenStatus: order?.kitchen_status || order?.overallKitchenStatus || "",
        externalSource: order?.external_source || "",
        externalId: order?.external_id || null,
        orderId: order?.id || order?.order_id || stop.orderId,
        customerName: order?.customer_name || order?.customer || stop.label || `Stop ${idx}`,
        address: order?.customer_address || order?.address || stop.address || stop.label || "Unknown Address",
        eta: order?.eta || order?.estimated_arrival,
        delivered: order?.delivered_at || order?.delivery_time,
        phone: order?.customer_phone || order?.phone,
      };
    });

    setStops(stopsWithStatus);
    const autoSelectKey = JSON.stringify(
      stopsWithStatus.map((stop) => [stop.orderId || null, stop.lat, stop.lng, stop.status || ""])
    );

    if (autoSelectedRouteKeyRef.current !== autoSelectKey && stopsWithStatus.length > 1) {
      const firstCustomer = stopsWithStatus[1];
      if (firstCustomer) {
        autoSelectedRouteKeyRef.current = autoSelectKey;
        setActiveStopIndex(1);
        setSelectedMarker(null);
      }
    }
  }, [displayRoute, orders]);

  // Optimize route ordering (when route changes)
  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!baseRoute || baseRoute.length < 2) {
        if (isMounted) setOptimizedRoute([]);
        return;
      }
      if (!hasSelectedDriver) {
        if (isMounted) setOptimizedRoute(baseRoute);
        return;
      }
      if (baseRoute.length <= 2) {
        if (isMounted) setOptimizedRoute(baseRoute);
        return;
      }
      if (isMounted) setOptimizedRoute(baseRoute);
      try {
        const optimizeBody = {
          waypoints: baseRoute.map((pt) => ({
            lat: pt.lat,
            lng: pt.lng,
            label: pt.label,
            address: pt.address,
            orderId: pt.orderId,
          })),
        };
        const optimized = await secureFetch("drivers/optimize-route", {
          method: "POST",
          body: JSON.stringify(optimizeBody),
        });
        if (!isMounted) return;
        if (optimized?.optimized_waypoints?.length) {
          setOptimizedRoute(optimized.optimized_waypoints);
        } else {
          setOptimizedRoute(baseRoute);
        }
      } catch {
        if (isMounted) setOptimizedRoute(baseRoute);
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [hasSelectedDriver, routeKey]);

  // Fetch real-time driver location(s)
  useEffect(() => {
    if (!trackedDriverIds.length) {
      setDriverPos(null);
      setDriverPositions([]);
      return;
    }
    let isMounted = true;

    const fetchLocations = async () => {
      const now = Date.now();
      const retryDelayMs = 60_000;
      const idsToQuery = trackedDriverIds.filter((id) => {
        const failedAt = failedLocationIdsRef.current.get(String(id));
        return !failedAt || now - failedAt >= retryDelayMs;
      });

      if (!idsToQuery.length) {
        if (isMounted) setLastUpdateAt(Date.now());
        return;
      }

      try {
        const results = await Promise.all(
          idsToQuery.map(async (id) => {
            try {
              const data = await secureFetch(`drivers/location/${id}`);
              if (typeof data?.lat === "number" && typeof data?.lng === "number") {
                failedLocationIdsRef.current.delete(String(id));
                return { driverId: String(id), lat: data.lat, lng: data.lng };
              }
            } catch (err) {
              const status = Number(err?.details?.status ?? err?.status);
              if (status === 404) {
                failedLocationIdsRef.current.set(String(id), Date.now());
                if (import.meta.env.DEV) {
                  console.warn("⚠️ [LiveRouteMap] /drivers/location returned 404", {
                    requestedDriverId: String(id),
                    selectedDriverId: selectedDriverRaw,
                    trackedDriverIds,
                    knownDriverIds,
                    knownOrderDriverIds,
                    message:
                      "No location key found for this driver id. Check if mobile app posts /drivers/location with same driver_id value.",
                  });
                }
              }
              return null;
            }
            return null;
          })
        );

        if (!isMounted) return;
        const nextPositions = results.filter(Boolean);
        setDriverPositions(nextPositions);
        if (nextPositions.length === 1) {
          setDriverPos({ lat: nextPositions[0].lat, lng: nextPositions[0].lng });
        } else {
          setDriverPos(null);
        }
        setLastUpdateAt(Date.now());
      } catch {
        if (isMounted) {
          setDriverPos(null);
          setDriverPositions([]);
          setLastUpdateAt(Date.now());
        }
      }
    };

    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);

    // Socket.io real-time updates
    const handleDriverUpdate = (data) => {
      const rawDriverId = String(data?.driver_id || "").trim();
      if (!rawDriverId || !trackedDriverIds.includes(rawDriverId) || !isMounted) return;
      failedLocationIdsRef.current.delete(rawDriverId);

      setDriverPositions((prev) => {
        const next = [...prev];
        const index = next.findIndex((entry) => String(entry.driverId) === rawDriverId);
        const entry = { driverId: rawDriverId, lat: data.lat, lng: data.lng };
        if (index >= 0) next[index] = entry;
        else next.push(entry);
        return next;
      });

      if (trackedDriverIds.length === 1) {
        setDriverPos({ lat: data.lat, lng: data.lng });
      } else {
        setDriverPos(null);
      }
      setLastUpdateAt(Date.now());
    };

    socket.on("driver_location_updated", handleDriverUpdate);

    return () => {
      isMounted = false;
      clearInterval(interval);
      socket.off("driver_location_updated", handleDriverUpdate);
    };
  }, [knownDriverIds, knownOrderDriverIds, selectedDriverRaw, trackedDriverIds]);

  const visibleDriverPositions = useMemo(
    () =>
      driverPositions.filter(
        (entry) => typeof entry?.lat === "number" && typeof entry?.lng === "number"
      ),
    [driverPositions]
  );
  const fallbackDriverPositions = useMemo(() => {
    const liveIds = new Set(visibleDriverPositions.map((entry) => String(entry.driverId || "").trim()));
    const fallbackByDriver = new Map();

    (Array.isArray(orders) ? orders : []).forEach((order) => {
      const id = extractDriverIdFromOrder(order);
      if (!id || liveIds.has(id) || fallbackByDriver.has(id)) return;
      const coords = extractCoordsFromOrder(order);
      if (!coords) return;
      fallbackByDriver.set(id, { driverId: id, lat: coords.lat, lng: coords.lng, approximate: true });
    });

    return Array.from(fallbackByDriver.values());
  }, [orders, visibleDriverPositions]);
  const allDriverMarkerPositions = useMemo(
    () => [...visibleDriverPositions, ...fallbackDriverPositions],
    [fallbackDriverPositions, visibleDriverPositions]
  );
  const selectedDriverFallbackPos = useMemo(() => {
    if (!hasSelectedDriver) return null;
    const explicit = String(driverId || "").trim();
    if (!explicit) return null;
    const match = (Array.isArray(orders) ? orders : []).find(
      (order) => extractDriverIdFromOrder(order) === explicit
    );
    if (!match) return null;
    return extractCoordsFromOrder(match);
  }, [driverId, hasSelectedDriver, orders]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!hasSelectedDriver) return;

    const matchedDriver =
      (Array.isArray(drivers) ? drivers : []).find((driver) =>
        extractDriverIdCandidatesFromDriver(driver).includes(selectedDriverRaw)
      ) || null;

    const payload = {
      inferredDriverId,
      selectedDriverId: selectedDriverRaw,
      trackedDriverIds,
      selectedDriverFoundInDrivers: knownDriverIds.includes(selectedDriverRaw),
      knownDriverIds,
      knownOrderDriverIds,
      matchedDriver: matchedDriver
        ? {
            id: matchedDriver.id,
            staff_id: matchedDriver.staff_id,
            user_id: matchedDriver.user_id,
            driver_id: matchedDriver.driver_id,
            name:
              matchedDriver.name ||
              matchedDriver.full_name ||
              matchedDriver.driver_name ||
              matchedDriver.username ||
              "",
          }
        : null,
    };

    const payloadKey = JSON.stringify(payload);
    if (locationDebugKeyRef.current === payloadKey) return;
    locationDebugKeyRef.current = payloadKey;

    console.info("🧭 [LiveRouteMap] Driver location debug snapshot", payload);
  }, [
    drivers,
    hasSelectedDriver,
    knownDriverIds,
    knownOrderDriverIds,
    inferredDriverId,
    selectedDriverRaw,
    trackedDriverIds,
  ]);

  useEffect(() => {
    if (!hasSelectedDriver) return;
    if (!selectedDriverRaw) return;
    if (typeof window === "undefined") return;
    if (!isCurrentUserSelectedDriver) {
      if (import.meta.env.DEV) {
        console.info("🧭 [LiveRouteMap] Skipping browser GPS: selected driver does not match current user", {
          selectedDriverId: selectedDriverRaw,
          currentUserDriverIds,
        });
      }
      return;
    }
    if (!window.isSecureContext) {
      if (import.meta.env.DEV) {
        console.warn("⚠️ [LiveRouteMap] Browser GPS requires localhost or HTTPS", {
          origin: window.location.origin,
          isSecureContext: window.isSecureContext,
        });
      }
      return;
    }
    if (!navigator?.geolocation) {
      if (import.meta.env.DEV) {
        console.warn("⚠️ [LiveRouteMap] Browser geolocation API unavailable", {
          userAgent: navigator?.userAgent || "",
        });
      }
      return;
    }

    let isMounted = true;
    let watchId = null;

    const postPosition = async (position, source) => {
      if (!isMounted || !position?.coords) return;
      const lat = Number(position.coords.latitude);
      const lng = Number(position.coords.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      try {
        await secureFetch("/drivers/location", {
          method: "POST",
          body: JSON.stringify({
            driver_id: selectedDriverRaw,
            lat,
            lng,
          }),
        });
        failedLocationIdsRef.current.delete(selectedDriverRaw);
        setDriverPos({ lat, lng });
        setDriverPositions((prev) => {
          const next = [...prev];
          const idx = next.findIndex((entry) => String(entry?.driverId) === selectedDriverRaw);
          const payload = { driverId: selectedDriverRaw, lat, lng };
          if (idx >= 0) next[idx] = payload;
          else next.push(payload);
          return next;
        });
        if (import.meta.env.DEV) {
          console.info("📡 [LiveRouteMap] Published browser GPS for selected driver", {
            driverId: selectedDriverRaw,
            source,
            lat,
            lng,
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("⚠️ [LiveRouteMap] Failed to publish browser GPS", {
            driverId: selectedDriverRaw,
            source,
            error: String(err?.message || err),
          });
        }
      }
    };

    const onError = (err) => {
      if (import.meta.env.DEV) {
        console.warn("⚠️ [LiveRouteMap] Browser geolocation failed", {
          driverId: selectedDriverRaw,
          code: err?.code,
          message: err?.message,
        });
      }
    };

    const options = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => postPosition(position, "getCurrentPosition"),
      onError,
      options
    );

    watchId = navigator.geolocation.watchPosition(
      (position) => postPosition(position, "watchPosition"),
      onError,
      options
    );

    const heartbeat = window.setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => postPosition(position, "heartbeat"),
        onError,
        options
      );
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(heartbeat);
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUserDriverIds, hasSelectedDriver, isCurrentUserSelectedDriver, selectedDriverRaw]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (hasSelectedDriver) return;
    if (!allDriverMarkerPositions.length) return;

    const points = [...displayRoute, ...allDriverMarkerPositions].filter(
      (point) => typeof point?.lat === "number" && typeof point?.lng === "number"
    );
    if (!points.length) return;

    const viewportKey = JSON.stringify({
      driverIds: trackedDriverIds,
      stopCount: displayRoute.length,
      driverCount: allDriverMarkerPositions.length,
    });
    if (fittedViewportKeyRef.current === viewportKey) return;
    fittedViewportKeyRef.current = viewportKey;

    try {
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    } catch {
      // ignore fitBounds failures
    }
  }, [allDriverMarkerPositions, displayRoute, hasSelectedDriver, trackedDriverIds]);

  // Keep the single-driver live route only when exactly one driver is being tracked.
  useEffect(() => {
    if (trackedDriverIds.length !== 1) {
      setLiveRouteCoords(null);
      setFirstLegOverride(null);
      setFirstLegMetricsLoading(false);
    }
  }, [trackedDriverIds.length]);

  useEffect(() => {
    if (trackedDriverIds.length !== 1) return;
    if (!driverPos || !nextStop) {
      setFirstLegOverride(null);
      setFirstLegMetricsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchLiveRoute = async () => {
      const origin = `${driverPos.lat},${driverPos.lng}`;
      const destination = `${nextStop.lat},${nextStop.lng}`;

      const params = new URLSearchParams({
        origin,
        destination,
        mode: "driving",
      });

      try {
        if (isMounted) setFirstLegMetricsLoading(true);
        const data = await secureFetch(`drivers/google-directions?${params.toString()}`);
        const liveRoute = data?.routes?.[0] || null;
        const liveLeg = liveRoute?.legs?.[0] || null;
        if (isMounted) {
          setFirstLegOverride({
            leg: liveLeg,
            approximate: false,
            startPoint: driverPos,
            sourceLabel: effectiveDriverName || t("Driver"),
            targetOrderId: nextStop?.orderId || null,
            targetLat: nextStop?.lat,
            targetLng: nextStop?.lng,
          });
        }
        if (
          isMounted &&
          data.decoded_polyline &&
          Array.isArray(data.decoded_polyline) &&
          data.decoded_polyline.length > 0
        ) {
          setLiveRouteCoords(data.decoded_polyline);
        } else if (
          isMounted &&
          data.routes &&
          data.routes[0] &&
          data.routes[0].overview_polyline
        ) {
          const points = polyline.decode(data.routes[0].overview_polyline.points);
          const latlngs = points.map(([lat, lng]) => ({ lat, lng }));
          setLiveRouteCoords(latlngs);
        } else if (isMounted) {
          setLiveRouteCoords([
            { lat: driverPos.lat, lng: driverPos.lng },
            { lat: nextStop.lat, lng: nextStop.lng },
          ]);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to fetch live driver route:", err);
          setFirstLegOverride({
            leg: null,
            approximate: true,
            startPoint: driverPos,
            sourceLabel: effectiveDriverName || t("Driver"),
            targetOrderId: nextStop?.orderId || null,
            targetLat: nextStop?.lat,
            targetLng: nextStop?.lng,
          });
          setLiveRouteCoords([
            { lat: driverPos.lat, lng: driverPos.lng },
            { lat: nextStop.lat, lng: nextStop.lng },
          ]);
        }
      } finally {
        if (isMounted) setFirstLegMetricsLoading(false);
      }
    };

    fetchLiveRoute();

    return () => {
      isMounted = false;
    };
  }, [driverPos, effectiveDriverName, nextStop, t, trackedDriverIds.length]);

  // Update next stop
  useEffect(() => {
    if (stops.length >= 2) {
      const nextUndelivered = stops.find((s, idx) => idx > 0 && !s.delivered);
      setNextStop(nextUndelivered || stops[stops.length - 1]);
    }
  }, [stops]);

  useEffect(() => {
    let isMounted = true;

    const loadDriverName = async () => {
      if (driverNameOverride) {
        if (isMounted) setResolvedDriverName("");
        return;
      }

      const driverIdRaw = String(driverId || "").trim();
      if (!driverIdRaw) {
        if (isMounted) setResolvedDriverName("");
        return;
      }

      try {
        const data = await secureFetch("/staff/drivers");
        const drivers = Array.isArray(data) ? data : data?.drivers || [];
        const match =
          drivers.find((driver) =>
            [driver?.id, driver?.staff_id, driver?.driver_id, driver?.user_id]
              .map((value) => String(value || "").trim())
              .filter(Boolean)
              .includes(driverIdRaw)
          ) || null;

        if (!isMounted) return;
        setResolvedDriverName(
          match?.name || match?.full_name || match?.driver_name || match?.username || ""
        );
      } catch {
        if (isMounted) setResolvedDriverName("");
      }
    };

    loadDriverName();

    return () => {
      isMounted = false;
    };
  }, [driverId, driverNameOverride]);

  // Create a dedicated pane for traffic tiles so they render above base layers but below markers/popups
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (!map.getPane("trafficPane")) {
        map.createPane("trafficPane");
        const pane = map.getPane("trafficPane");
        pane.style.zIndex = 650; // above tile layers, below markers/popups (700+)
        pane.style.pointerEvents = "none"; // allow clicks to pass through unless needed
      }
    } catch (err) {
      // ignore if pane exists or createPane not supported
    }
  }, [mapRef.current]);

  // Fetch the optimized route from Google Directions API
  useEffect(() => {
    if (!displayRoute || displayRoute.length < 2) {
      setRouteCoords(null);
      setRouteDirections(null);
      setRouteMetricsLoading(false);
      return;
    }

    let isMounted = true;

    const fetchRoute = async () => {
      const workingRoute = displayRoute;

      const origin = `${workingRoute[0].lat},${workingRoute[0].lng}`;
      const destination = `${workingRoute[workingRoute.length - 1].lat},${workingRoute[workingRoute.length - 1].lng}`;
      const waypoints =
        workingRoute.length > 2
          ? workingRoute.slice(1, -1).map(pt => `${pt.lat},${pt.lng}`).join("|")
          : "";

      const params = new URLSearchParams({
        origin,
        destination,
        ...(waypoints ? { waypoints } : {}),
      });

      try {
        if (isMounted) setRouteMetricsLoading(true);
        const data = await secureFetch(`drivers/google-directions?${params.toString()}`);
        if (isMounted) {
          setRouteDirections(data?.routes?.[0] || null);
        }
        
        // Prefer backend-decoded polyline (more reliable)
        if (isMounted && data.decoded_polyline && Array.isArray(data.decoded_polyline) && data.decoded_polyline.length > 0) {
          setRouteCoords(data.decoded_polyline);
        } else if (
          isMounted &&
          data.routes &&
          data.routes[0] &&
          data.routes[0].overview_polyline
        ) {
          // Fallback: decode on client if backend didn't
          const latlngs = polyline
            .decode(data.routes[0].overview_polyline.points)
            .map(([lat, lng]) => ({ lat, lng }));
          setRouteCoords(latlngs);
        } else {
          // Last resort: draw straight lines between waypoints
          if (isMounted) {
            const fallback = workingRoute.map(pt => ({ lat: pt.lat, lng: pt.lng }));
            setRouteCoords(fallback);
          }
        }
      } catch (err) {
        // On error, still fallback to direct route so UI remains useful
        if (isMounted) {
          setRouteDirections(null);
          const fallback = workingRoute.map(pt => ({ lat: pt.lat, lng: pt.lng }));
          setRouteCoords(fallback);
        }
      } finally {
        if (isMounted) setRouteMetricsLoading(false);
      }
    };

    fetchRoute();
  }, [displayRouteKey]);

  // Get marker color based on status
  const getMarkerColor = useCallback((status, index) => {
    if (index === 0) return MARKER_COLORS.restaurant; // Restaurant
    if (status === "completed" || status === "delivered") return MARKER_COLORS.completed;
    if (status === "delayed") return MARKER_COLORS.delayed;
    if (status === "in_progress") return MARKER_COLORS.in_progress;
    return MARKER_COLORS.ready;
  }, []);

  // Create numbered marker icon
  const createNumberedMarker = useCallback((number, color, isDriver = false) => {
    if (isDriver) {
      return new L.DivIcon({
        className: "delivery-marker-driver",
        html: `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          ">
            <div style="
              background: white;
              padding: 4px 8px;
              border-radius: 8px;
              font-size: 11px;
              font-weight: bold;
              color: #1e40af;
              margin-bottom: 4px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.2);
              white-space: nowrap;
            ">
              🛵 ${driverNameOverride || "Driver"}
            </div>
            <div style="font-size: 28px; animation: pulse 2s infinite;">🛵</div>
          </div>
        `,
        iconSize: [44, 52],
        iconAnchor: [22, 52],
      });
    }

    return new L.DivIcon({
      className: "delivery-marker",
      html: `
        <div style="
          width: 40px;
          height: 40px;
          background-color: ${color};
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
          font-size: 16px;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.2s;
        ">
          ${number}
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });
  }, [effectiveDriverName]);

  const scooterPos =
    hasSelectedDriver && driverPos && typeof driverPos.lat === "number" && typeof driverPos.lng === "number"
      ? driverPos
      : selectedDriverFallbackPos || displayRoute[0];
  const mapCenter =
    scooterPos ||
    displayRoute[0] ||
    allDriverMarkerPositions[0] ||
    stops[0] || {
      lat: 38.089497,
      lng: 27.7318214,
    };
  const canRenderMap =
    displayRoute.length > 0 ||
    allDriverMarkerPositions.length > 0 ||
    (scooterPos && typeof scooterPos.lat === "number" && typeof scooterPos.lng === "number");
  const routeSummary = useMemo(
    () =>
      getRouteLegSummaries({
        stops,
        directionsRoute: routeDirections,
        firstLegOverride,
      }),
    [firstLegOverride, routeDirections, stops]
  );
  const routeSummaryLoading =
    (routeMetricsLoading || firstLegMetricsLoading) && routeSummary.legs.length === 0;

  if (!canRenderMap) {
    return (
      <div className="relative flex items-center justify-center h-96 bg-slate-50 rounded-lg border border-slate-200">
        {typeof onClose === "function" && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 p-2 rounded-full bg-white shadow hover:bg-slate-100 border border-slate-200 text-slate-600"
            title={t("Close")}
          >
            ✕
          </button>
        )}
        <p className="text-slate-500 text-center">{t("Route needs at least restaurant and one customer.")}</p>
      </div>
    );
  }

  const deliveredCount = stops.filter((s, idx) => idx > 0 && Boolean(s.delivered || s.status === "delivered" || s.status === "completed")).length;
  const stopCount = Math.max(stops.length - 1, 0);
  const selectedStopIsCustomer = selectedMarker && Number(selectedMarker.index) > 0;
  const lastUpdateLabel = new Date(lastUpdateAt).toLocaleTimeString();
  const restaurantStop = stops[0] || null;
  const restaurantTitle = restaurantStop?.label || t("Restaurant");
  const restaurantAddress = restaurantStop?.address || t("Restaurant");
  const customerStops = stops.filter((_, idx) => idx > 0);

  const handleSelectStop = (stop, idx) => {
    const marker = { ...stop, index: idx };
    setActiveStopIndex(idx);
    if (Number(selectedMarker?.index) === idx) {
      setSelectedMarker(null);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setShowStopsPanel(false);
      }
      return;
    }
    setSelectedMarker(marker);
    focusStopOnMap(marker);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setShowStopsPanel(false);
    }
  };

  const handleSelectSummaryLeg = (leg) => {
    const idx = Number(leg?.stopIndex);
    if (!Number.isFinite(idx) || idx <= 0) return;
    const stop = stops[idx];
    if (!stop) return;
    handleSelectStop(stop, idx);
  };

  const handleToggleTraffic = () => {
    if (!canShowTraffic) {
      if (import.meta.env.DEV) {
        console.warn(
          "Traffic overlay unavailable: set VITE_TRAFFIC_TILE_URL or VITE_MAPBOX_TOKEN to enable it."
        );
      }
      return;
    }
    setShowTraffic((value) => !value);
  };

  useEffect(() => {
    if (!canShowTraffic && showTraffic) {
      setShowTraffic(false);
    }
  }, [canShowTraffic, showTraffic]);

  const openNavigation = (stop) => {
    if (!stop) return;
    const hasCoords = typeof stop.lat === "number" && typeof stop.lng === "number";
    const destination = hasCoords ? `${stop.lat},${stop.lng}` : String(stop.address || "").trim();
    if (!destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const callCustomer = (phone) => {
    const cleaned = String(phone || "").trim();
    if (!cleaned) return;
    window.location.href = `tel:${cleaned}`;
  };

  const externalSource = String(selectedMarker?.externalSource || "").toLowerCase();
  const isSelectedMarkerYemeksepetiOrder =
    externalSource === "yemeksepeti" || Boolean(selectedMarker?.externalId);
  const isSelectedMarkerPickupOrder =
    isSelectedMarkerYemeksepetiOrder &&
    String(selectedMarker?.address || "").toLowerCase().trim() === "pickup order";
  const kitchenStatus = String(selectedMarker?.kitchenStatus || "").trim().toLowerCase();
  const isSelectedMarkerKitchenReady =
    kitchenStatus === "ready" || kitchenStatus === "delivered";
  const hasSelectedMarkerKitchenExcludedItem = Boolean(selectedMarker?.hasKitchenExcludedItem);
  const onRoadAllowed = isSelectedMarkerKitchenReady || hasSelectedMarkerKitchenExcludedItem;
  const onRoadActionDisabled =
    !selectedMarker ||
    markingDelivered ||
    Boolean(selectedMarker.delivered) ||
    selectedMarker.status === "delivered" ||
    selectedMarker.status === "completed" ||
    (selectedMarker.status !== "on_road" &&
      ((!selectedMarker.driverId && !isSelectedMarkerPickupOrder) || !onRoadAllowed));

  const markAsDelivered = async () => {
    if (!selectedStopIsCustomer) return;
    if (!selectedMarker?.orderId) return;
    if (selectedMarker.delivered || selectedMarker.status === "delivered" || selectedMarker.status === "completed") return;
    const nextStatus = selectedMarker.status === "on_road" ? "delivered" : "on_road";
    setMarkingDelivered(true);
    try {
      await secureFetch(`orders/${selectedMarker.orderId}/driver-status`, {
        method: "PATCH",
        body: JSON.stringify({ driver_status: nextStatus }),
      });

      const deliveredAt = nextStatus === "delivered" ? new Date().toISOString() : null;
      setStops((prev) =>
        prev.map((s, idx) =>
          idx === Number(selectedMarker.index)
            ? {
                ...s,
                status: nextStatus,
                delivered: nextStatus === "delivered" ? s.delivered || deliveredAt : s.delivered,
              }
            : s
        )
      );
      setSelectedMarker((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              delivered: nextStatus === "delivered" ? prev.delivered || deliveredAt : prev.delivered,
            }
          : prev
      );
      if (nextStatus === "delivered" && typeof onOrderDelivered === "function") {
        onOrderDelivered(selectedMarker.orderId);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to mark order delivered:", err);
      window.alert(t("Failed to mark delivered"));
    } finally {
      setMarkingDelivered(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden dark:bg-slate-950">
      {/* Header with Controls */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white px-6 py-4 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🛵</div>
            <div>
              <h2 className="text-xl font-bold leading-tight">{t("Live Delivery Route")}</h2>
              <p className="text-sm text-slate-300">
                {t("Driver")}: {headerDriverLabel}
              </p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <button
              onClick={() => setMapType(mapType === "standard" ? "satellite" : "standard")}
              className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl transition text-sm font-semibold flex items-center gap-2"
            >
              {mapType === "standard" ? "📡 Satellite" : "🗺️ Map"}
            </button>

            <button
              onClick={handleToggleTraffic}
              disabled={!canShowTraffic}
              title={
                canShowTraffic
                  ? t("Traffic")
                  : t("Traffic overlay requires a configured traffic tile provider")
              }
              className={`px-4 py-2 rounded-xl border transition text-sm font-semibold flex items-center gap-2 ${
                !canShowTraffic
                  ? "bg-white/5 border-white/10 text-slate-400 cursor-not-allowed"
                  : showTraffic
                  ? "bg-amber-600 border-amber-500/40"
                  : "bg-white/10 hover:bg-white/15 border-white/10"
              }`}
            >
              🚗 {t("Traffic")}
            </button>

            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className={`px-4 py-2 rounded-xl border transition text-sm font-semibold flex items-center gap-2 ${
                showCompleted
                  ? "bg-purple-600 border-purple-500/40"
                  : "bg-white/10 hover:bg-white/15 border-white/10"
              }`}
            >
              ✓ {t("Complete")}
            </button>

            {typeof onClose === "function" && (
              <button
                onClick={onClose}
                className="ml-1 p-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition"
                title={t("Close")}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 18L18 6M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex bg-slate-100 dark:bg-slate-950">
        {/* Desktop Stops Sidebar */}
        <aside
          className={`hidden md:flex shrink-0 bg-white border-r border-slate-200 dark:bg-slate-950 dark:border-slate-800 flex-col transition-all duration-200 ${
            isSidebarCollapsed ? "w-20" : "w-96"
          }`}
        >
          <div className={`border-b border-slate-200 dark:border-slate-800 ${isSidebarCollapsed ? "px-3 py-4" : "px-5 py-4"}`}>
            <div className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"}`}>
              {!isSidebarCollapsed ? (
                <div className="text-xs font-black tracking-[0.22em] text-slate-600 dark:text-slate-300">
                  {t("Route").toUpperCase()}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed((value) => !value)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                aria-label={isSidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
                title={isSidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d={isSidebarCollapsed ? "M9 6L15 12L9 18" : "M15 6L9 12L15 18"}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {isSidebarCollapsed ? (
            <>
              <div className="flex-1 flex flex-col items-center gap-3 px-3 py-4">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-blue-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-blue-300 dark:hover:bg-slate-900"
                  title={restaurantTitle}
                  aria-label={restaurantTitle}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 21C12 21 5 13.8 5 9A7 7 0 0 1 19 9C19 13.8 12 21 12 21Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900"
                  title={t("Route Summary")}
                  aria-label={t("Route Summary")}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 7H20M4 12H16M4 17H13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarCollapsed(false);
                    setShowSidebarStops(true);
                  }}
                  className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900"
                  title={t("Stops")}
                  aria-label={t("Stops")}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M8 6H20M8 12H20M8 18H20M4 6H4.01M4 12H4.01M4 18H4.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {stopCount}
                  </span>
                </button>
              </div>

              <div className="px-2 pb-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-center dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {t("Live")}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {lastUpdateLabel}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <button
                  type="button"
                  onClick={() => setShowSidebarStops((value) => !value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm">
                      0
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {restaurantTitle}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {restaurantAddress}
                      </div>
                    </div>
                    <svg
                      className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${showSidebarStops ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 9L12 15L18 9"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                <RouteSummaryCard
                  summary={routeSummary}
                  loading={routeSummaryLoading || routeMetricsLoading || firstLegMetricsLoading}
                  t={t}
                  className="w-full"
                  onLegClick={handleSelectSummaryLeg}
                />

                {showSidebarStops ? (
                  <div className="space-y-2">
                    {customerStops.map((stop, listIdx) => {
                      const idx = listIdx + 1;
                      const isSelected = Number(activeStopIndex) === idx;
                      const isCompleted = stop.delivered || stop.status === "completed" || stop.status === "delivered";
                      const markerColor = getMarkerColor(stop.status, idx);
                      const title = stop.customerName || stop.label || `${t("Stop")} ${idx}`;
                      const subtitle = stop.address || "";

                      return (
                        <button
                          key={`stop-sidebar-${idx}`}
                          type="button"
                          onClick={() => handleSelectStop(stop, idx)}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition text-left ${
                            isSelected
                              ? "bg-slate-50 border-slate-300 shadow-sm dark:bg-slate-900/50 dark:border-slate-700"
                              : "bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-800 dark:hover:bg-slate-900/40"
                          }`}
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-base shadow-sm"
                            style={{ backgroundColor: markerColor }}
                          >
                            {idx}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {title}
                              </div>
                              {isCompleted ? (
                                <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full dark:bg-emerald-950/35 dark:text-emerald-200 dark:border-emerald-500/30">
                                  {t("Delivered")}
                                </span>
                              ) : null}
                            </div>
                            {subtitle ? (
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  {stopCount} {t("stops")} • {deliveredCount} {t("delivered")}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {t("Live updates every 5s")} • {t("Last")}: {lastUpdateLabel}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Map Container */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {/* Mobile Stops Toggle */}
          <div className="md:hidden absolute top-4 left-4 z-50">
            <button
              type="button"
              onClick={() => setShowStopsPanel(true)}
              className="px-3 py-2 rounded-xl bg-white/95 border border-slate-200 shadow-lg text-slate-700 font-semibold text-sm"
            >
              {t("Stops")}
            </button>
          </div>

          {/* Mobile Stops Panel */}
          {showStopsPanel && (
            <div className="md:hidden absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm">
              <div className="absolute inset-x-0 top-0 bottom-0 bg-white dark:bg-slate-950">
                <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-xs font-black tracking-[0.22em] text-slate-600 dark:text-slate-300">
                    {t("Stops").toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowStopsPanel(false)}
                    className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-200"
                    title={t("Close")}
                  >
                    ✕
                  </button>
                </div>
                <div className="p-4 space-y-2 overflow-y-auto" style={{ maxHeight: "calc(100vh - 72px)" }}>
                  <button
                    type="button"
                    onClick={() => setShowSidebarStops((value) => !value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm">
                        0
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {restaurantTitle}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          {restaurantAddress}
                        </div>
                      </div>
                      <svg
                        className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${showSidebarStops ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 9L12 15L18 9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </button>

                  <RouteSummaryCard
                    summary={routeSummary}
                    loading={routeSummaryLoading || routeMetricsLoading || firstLegMetricsLoading}
                    t={t}
                    className="w-full"
                    onLegClick={handleSelectSummaryLeg}
                  />

                  {showSidebarStops ? (
                    <div className="space-y-2">
                      {customerStops.map((stop, listIdx) => {
                        const idx = listIdx + 1;
                        const markerColor = getMarkerColor(stop.status, idx);
                        const title = stop.customerName || stop.label || `${t("Stop")} ${idx}`;
                        const subtitle = stop.address || "";
                        return (
                          <button
                            key={`stop-mobile-${idx}`}
                            type="button"
                            onClick={() => handleSelectStop(stop, idx)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white text-left dark:bg-slate-950 dark:border-slate-800"
                          >
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-base shadow-sm"
                              style={{ backgroundColor: markerColor }}
                            >
                              {idx}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</div>
                              {subtitle ? (
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <MapContainer
            ref={mapRef}
            center={mapCenter}
            zoom={14}
            scrollWheelZoom={true}
            zoomControl={true}
            style={{ height: "100%", width: "100%" }}
            className="map-container"
          >
            {/* Base Layer - Toggle between standard and satellite */}
            {mapType === "standard" ? (
              <>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap"
                  maxZoom={19}
                />
                {showTraffic && TRAFFIC_TILE_URL ? (
                  <TileLayer
                    url={TRAFFIC_TILE_URL}
                    attribution={import.meta.env.VITE_TRAFFIC_ATTRIBUTION || ""}
                    pane="trafficPane"
                    opacity={0.75}
                  />
                ) : null}
              </>
            ) : (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="&copy; Esri"
              />
            )}

            {/* Optimized Route Path */}
            {routeCoords && routeCoords.length > 1 && (
              <Polyline
                positions={routeCoords.map((pt) => [pt.lat, pt.lng])}
                color="#2563EB"
                weight={6}
                opacity={0.8}
                dashArray="8, 4"
              />
            )}

            {/* Live Driver Route */}
            {liveRouteCoords && liveRouteCoords.length > 1 && (
              <Polyline
                positions={liveRouteCoords.map((pt) => [pt.lat, pt.lng])}
                color="#10B981"
                weight={5}
                opacity={0.9}
              />
            )}

            {/* Numbered Delivery Stops */}
            {stops.map((stop, idx) => {
              const isCompleted = stop.delivered || stop.status === "completed" || stop.status === "delivered";
              if (isCompleted && !showCompleted) return null;

              const markerColor = getMarkerColor(stop.status, idx);
              return (
                <Marker
                  key={`stop-${idx}`}
                  position={[stop.lat, stop.lng]}
                  icon={createNumberedMarker(idx, markerColor)}
                  eventHandlers={{
                    click: () => handleSelectStop(stop, idx),
                  }}
                >
                  <Tooltip direction="right" offset={[12, 0]} opacity={0.95}>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>
                        {t("Stop")} #{idx}: {stop.label || stop.customerName}
                      </div>
                      {nearbyCounts[idx] > 0 ? (
                        <div style={{ fontSize: 12, color: "#0f172a", marginTop: 2 }}>
                          {nearbyCounts[idx] + 1} {t("nearby")}
                        </div>
                      ) : null}
                    </div>
                  </Tooltip>
                </Marker>
              );
            })}

            {/* Live Driver Marker */}
            {hasSelectedDriver && scooterPos && (
              <Marker
                position={[scooterPos.lat, scooterPos.lng]}
                icon={createNumberedMarker(0, MARKER_COLORS.restaurant, true)}
                ref={scooterMarkerRef}
              >
                <Popup closeButton={true}>
                  <div className="p-2 min-w-48">
                    <p className="font-bold text-slate-900">{effectiveDriverName || t("Driver")}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      📍 {scooterPos.lat.toFixed(4)}, {scooterPos.lng.toFixed(4)}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">🕒 {new Date().toLocaleTimeString()}</p>
                  </div>
                </Popup>
              </Marker>
            )}

            {!hasSelectedDriver &&
              allDriverMarkerPositions.map((entry) => (
                <Marker
                  key={`driver-${entry.driverId}-${entry.approximate ? "approx" : "live"}`}
                  position={[entry.lat, entry.lng]}
                  icon={createNumberedMarker(0, MARKER_COLORS.restaurant, true)}
                >
                  <Popup closeButton={true}>
                    <div className="p-2 min-w-48">
                      <p className="font-bold text-slate-900">{t("Driver")} #{entry.driverId}</p>
                      {entry.approximate ? (
                        <p className="text-xs text-amber-700 mt-1">~ {t("Estimated position")}</p>
                      ) : null}
                      <p className="text-xs text-slate-600 mt-1">
                        📍 {entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}
                      </p>
                      <p className="text-xs text-slate-500 mt-2">🕒 {new Date().toLocaleTimeString()}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>

          {/* Stop Details Panel */}
          {selectedStopIsCustomer && selectedMarker ? (
            <div className="absolute bottom-6 right-6 w-[22rem] max-w-[calc(100%-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-40 overflow-hidden dark:bg-slate-950 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start gap-3">
                <div className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                  {t("Stop")} #{selectedMarker.index}
                </div>
                <span className={`ml-auto px-3 py-1 rounded-full text-xs font-black ${getStopStatusPillClass(selectedMarker)}`}>
                  {getStopStatusLabel(selectedMarker).toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveStopIndex(Number(selectedMarker?.index));
                    setSelectedMarker(null);
                  }}
                  className="h-8 w-8 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
                  aria-label={t("Close")}
                  title={t("Close")}
                >
                  ×
                </button>
              </div>

              <div className="px-5 py-4 space-y-3 text-slate-900 dark:text-slate-100">
                {selectedMarker.orderId ? (
                  <div className="flex items-center gap-2">
                    <div className="w-24 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Order ID")}</div>
                    <div className="font-mono font-bold">#{selectedMarker.orderId}</div>
                  </div>
                ) : null}

                {selectedMarker.customerName ? (
                  <div className="flex items-center gap-2">
                    <div className="w-24 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Customer")}</div>
                    <div className="font-semibold">{selectedMarker.customerName}</div>
                  </div>
                ) : null}

                {selectedMarker.phone ? (
                  <div className="flex items-center gap-2">
                    <div className="w-24 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Phone")}</div>
                    <div className="font-mono">{selectedMarker.phone}</div>
                  </div>
                ) : null}

                {selectedMarker.address ? (
                  <div className="pt-1">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Address")}</div>
                    <div className="text-sm leading-snug">{selectedMarker.address}</div>
                  </div>
                ) : null}
              </div>

              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={markAsDelivered}
                  disabled={onRoadActionDisabled}
                  title={
                    !onRoadAllowed && selectedMarker?.status !== "on_road"
                      ? t("Available after kitchen delivered or excluded items")
                      : undefined
                  }
                  className={`w-full h-11 rounded-xl font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm ${
                    selectedMarker?.status === "on_road"
                      ? "bg-sky-800 hover:bg-sky-900"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {markingDelivered
                    ? t("Loading...")
                    : selectedMarker?.status === "on_road"
                    ? t("Delivered")
                    : t("On Road")}
                </button>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => callCustomer(selectedMarker.phone)}
                    disabled={!selectedMarker.phone}
                    className="h-11 rounded-xl font-semibold border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition text-slate-800 dark:bg-slate-900/50 dark:border-slate-800 dark:hover:bg-slate-900 dark:text-slate-100"
                  >
                    {t("Call Customer")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openNavigation(selectedMarker)}
                    className="h-11 rounded-xl font-semibold border border-blue-700 bg-blue-600 hover:bg-blue-700 transition text-white shadow-sm"
                  >
                    {t("Navigate")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }

        .map-container {
          background-color: #f0f4f8;
          z-index: 0;
        }

        .delivery-marker {
          animation: bounceIn 0.6s ease-out;
        }

        @keyframes bounceIn {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }

      `}</style>
    </div>
  );
}
