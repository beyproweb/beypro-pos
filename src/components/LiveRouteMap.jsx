import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, WMSTileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import polyline from "@mapbox/polyline";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import socket from "../utils/socket";

// Custom marker colors
const MARKER_COLORS = {
  ready: "#22C55E", // Green
  in_progress: "#EAB308", // Yellow
  delayed: "#EF4444", // Red
  completed: "#8B5CF6", // Purple
  restaurant: "#3B82F6", // Blue
};

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
  onClose,
  onOrderDelivered,
}) {
  const [driverPos, setDriverPos] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [nextStop, setNextStop] = useState(null);
  const [liveRouteCoords, setLiveRouteCoords] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapType, setMapType] = useState("standard"); // "standard" or "satellite"
  const [showTraffic, setShowTraffic] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [stops, setStops] = useState([]);
  const [optimizedRoute, setOptimizedRoute] = useState([]);
  const [showStopsPanel, setShowStopsPanel] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState(() => Date.now());
  
  const mapRef = useRef(null);
  const scooterMarkerRef = useRef(null);
  const { t } = useTranslation();
  // traffic tile URL can be configured via env: VITE_TRAFFIC_TILE_URL or use Mapbox token
  const TRAFFIC_TILE_URL =
    import.meta.env.VITE_TRAFFIC_TILE_URL ||
    (import.meta.env.VITE_MAPBOX_TOKEN
      ? `https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/{z}/{x}/{y}.png?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`
      : null);
  const hasSelectedDriver = String(driverId || "").trim() !== "";
  const baseRoute = stopsOverride && stopsOverride.length > 1 ? stopsOverride : [];
  const routeKey = useMemo(() => JSON.stringify(baseRoute || []), [baseRoute]);

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
    if (!optimizedRoute.length) return;

    const stopsWithStatus = optimizedRoute.map((stop, idx) => {
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
        status: order?.status || order?.delivery_status || "ready",
        orderId: order?.id || order?.order_id || stop.orderId,
        customerName: order?.customer_name || order?.customer || stop.label || `Stop ${idx}`,
        address: order?.customer_address || order?.address || stop.address || stop.label || "Unknown Address",
        eta: order?.eta || order?.estimated_arrival,
        delivered: order?.delivered_at || order?.delivery_time,
        phone: order?.customer_phone || order?.phone,
      };
    });
    
    setStops(stopsWithStatus);
    // Auto-select the first customer stop (index 1) so address/details are visible immediately
    if (!selectedMarker && stopsWithStatus.length > 1) {
      const firstCustomer = stopsWithStatus[1];
      if (firstCustomer) {
        setSelectedMarker({ ...firstCustomer, index: 1 });
      }
    }
  }, [optimizedRoute, orders, selectedMarker]);

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

  // Fetch driver's real-time location
  useEffect(() => {
    if (!driverId) return;
    let isMounted = true;

    const fetchLocation = async () => {
      try {
        const data = await secureFetch(`drivers/location/${driverId}`);
        if (isMounted && typeof data?.lat === "number" && typeof data?.lng === "number") {
          setDriverPos({ lat: data.lat, lng: data.lng });
          setLastUpdateAt(Date.now());
        } else if (isMounted) {
          setDriverPos(null);
          setLastUpdateAt(Date.now());
        }
      } catch {
        if (isMounted) {
          setDriverPos(null);
          setLastUpdateAt(Date.now());
        }
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 5000);

    // Socket.io real-time updates
    const handleDriverUpdate = (data) => {
      if (data.driver_id === Number(driverId) && isMounted) {
        setDriverPos({ lat: data.lat, lng: data.lng });
        setLastUpdateAt(Date.now());
      }
    };

    socket.on("driver_location_updated", handleDriverUpdate);

    return () => {
      isMounted = false;
      clearInterval(interval);
      socket.off("driver_location_updated", handleDriverUpdate);
    };
  }, [driverId]);

  // Update next stop and live route
  useEffect(() => {
    if (stops.length >= 2) {
      const nextUndelivered = stops.find((s, idx) => idx > 0 && !s.delivered);
      setNextStop(nextUndelivered || stops[stops.length - 1]);
    }
  }, [stops]);

  // Fetch live driver route to next stop
  useEffect(() => {
    if (!driverPos || !nextStop) return;

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
        const data = await secureFetch(`drivers/google-directions?${params.toString()}`);
        if (
          isMounted &&
          data.routes &&
          data.routes[0] &&
          data.routes[0].overview_polyline
        ) {
          const points = polyline.decode(data.routes[0].overview_polyline.points);
          const latlngs = points.map(([lat, lng]) => ({ lat, lng }));
          setLiveRouteCoords(latlngs);
        }
      } catch (err) {
        if (isMounted) console.error("Failed to fetch live driver route:", err);
      }
    };

    fetchLiveRoute();
  }, [driverPos, nextStop]);

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
    if (!hasSelectedDriver) {
      setRouteCoords(null);
      return;
    }
    if (!optimizedRoute || optimizedRoute.length < 2) {
      setRouteCoords(null);
      return;
    }

    let isMounted = true;

    const fetchRoute = async () => {
      const workingRoute = optimizedRoute;

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
        const data = await secureFetch(`drivers/google-directions?${params.toString()}`);
        
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
          const fallback = workingRoute.map(pt => ({ lat: pt.lat, lng: pt.lng }));
          setRouteCoords(fallback);
        }
      }
    };

    fetchRoute();
  }, [hasSelectedDriver, JSON.stringify(optimizedRoute)]);

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
  }, [driverNameOverride]);

  const scooterPos =
    hasSelectedDriver && driverPos && typeof driverPos.lat === "number" && typeof driverPos.lng === "number"
      ? driverPos
      : optimizedRoute[0];

  if (optimizedRoute.length < 2) {
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

  const handleSelectStop = (stop, idx) => {
    const marker = { ...stop, index: idx };
    setSelectedMarker(marker);
    focusStopOnMap(marker);
    setShowStopsPanel(false);
  };

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

  const markAsDelivered = async () => {
    if (!selectedStopIsCustomer) return;
    if (!selectedMarker?.orderId) return;
    if (selectedMarker.delivered || selectedMarker.status === "delivered" || selectedMarker.status === "completed") return;
    setMarkingDelivered(true);
    try {
      await secureFetch(`orders/${selectedMarker.orderId}/driver-status`, {
        method: "PATCH",
        body: JSON.stringify({ driver_status: "delivered" }),
      });

      const deliveredAt = new Date().toISOString();
      setStops((prev) =>
        prev.map((s, idx) =>
          idx === Number(selectedMarker.index)
            ? { ...s, status: "delivered", delivered: s.delivered || deliveredAt }
            : s
        )
      );
      setSelectedMarker((prev) => (prev ? { ...prev, status: "delivered", delivered: prev.delivered || deliveredAt } : prev));
      if (typeof onOrderDelivered === "function") onOrderDelivered(selectedMarker.orderId);
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
                {t("Driver")}: {driverNameOverride || t("Driver")}
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
              onClick={() => setShowTraffic(!showTraffic)}
              className={`px-4 py-2 rounded-xl border transition text-sm font-semibold flex items-center gap-2 ${
                showTraffic
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
        <aside className="hidden md:flex w-80 shrink-0 bg-white border-r border-slate-200 dark:bg-slate-950 dark:border-slate-800 flex-col">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs font-black tracking-[0.22em] text-slate-600 dark:text-slate-300">
              {t("Stops").toUpperCase()}
            </div>
            <button
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition dark:bg-slate-900/50 dark:border-slate-800 dark:hover:bg-slate-900"
              title={t("Stops")}
              onClick={() => setShowStopsPanel((v) => !v)}
              type="button"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {stops.map((stop, idx) => {
              const isSelected = Number(selectedMarker?.index) === idx;
              const isCompleted = stop.delivered || stop.status === "completed" || stop.status === "delivered";
              const markerColor = getMarkerColor(stop.status, idx);
              const title = idx === 0 ? (stop.label || t("Restaurant")) : (stop.customerName || stop.label || `${t("Stop")} ${idx}`);
              const subtitle = idx === 0 ? (stop.address || t("Restaurant")) : (stop.address || "");

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
                      {idx > 0 && isCompleted ? (
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

          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-sm text-slate-700 dark:text-slate-200">
              {stopCount} {t("stops")} • {deliveredCount} {t("delivered")}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t("Live updates every 5s")} • {t("Last")}: {lastUpdateLabel}
            </div>
          </div>
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
                  {stops.map((stop, idx) => {
                    const markerColor = getMarkerColor(stop.status, idx);
                    const title = idx === 0 ? (stop.label || t("Restaurant")) : (stop.customerName || stop.label || `${t("Stop")} ${idx}`);
                    const subtitle = idx === 0 ? (stop.address || t("Restaurant")) : (stop.address || "");
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
              </div>
            </div>
          )}

          <MapContainer
            ref={mapRef}
            center={scooterPos}
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
                />
                {showTraffic && TRAFFIC_TILE_URL ? (
                  <TileLayer
                    url={TRAFFIC_TILE_URL}
                    attribution={import.meta.env.VITE_TRAFFIC_ATTRIBUTION || ""}
                    pane="trafficPane"
                    opacity={0.75}
                  />
                ) : null}
                {showTraffic && !TRAFFIC_TILE_URL && (
                  <WMSTileLayer
                    url="https://ows.mundialis.de/services/service?"
                    layers="TRAFFIC"
                    transparent={true}
                    format="image/png"
                    pane="trafficPane"
                  />
                )}
              </>
            ) : (
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution="&copy; Esri"
              />
            )}

            {/* Optimized Route Path */}
            {hasSelectedDriver && routeCoords && routeCoords.length > 1 && (
              <Polyline
                positions={routeCoords.map((pt) => [pt.lat, pt.lng])}
                color="#2563EB"
                weight={6}
                opacity={0.8}
                dashArray="8, 4"
              />
            )}

            {/* Live Driver Route */}
            {hasSelectedDriver && liveRouteCoords && liveRouteCoords.length > 1 && (
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
                    click: () => setSelectedMarker({ ...stop, index: idx }),
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
                  <Popup closeButton={true} className="delivery-popup" maxWidth={350} minWidth={280}>
                    <div className="p-3 min-w-60 bg-white text-slate-900">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-slate-600">
                          {t("Stop")} #{idx}
                        </span>
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-900 text-white">
                          {getStopStatusLabel(stop).toUpperCase()}
                        </span>
                      </div>

                      <div className="border-t pt-2 space-y-2 text-slate-900">
                        {stop.orderId && (
                          <div>
                            <p className="text-xs text-slate-600 font-semibold">{t("Order ID")}</p>
                            <p className="font-mono font-bold text-slate-900">#{stop.orderId}</p>
                          </div>
                        )}
                        {stop.customerName && (
                          <div>
                            <p className="text-xs text-slate-600 font-semibold">{t("Customer")}</p>
                            <p className="font-semibold text-slate-900">{stop.customerName}</p>
                          </div>
                        )}
                        {stop.phone && (
                          <div>
                            <p className="text-xs text-slate-600 font-semibold">{t("Phone")}</p>
                            <p className="text-sm text-slate-900 font-mono">{stop.phone}</p>
                          </div>
                        )}
                        {stop.address && (
                          <div>
                            <p className="text-xs text-slate-600 font-semibold">{t("Address")}</p>
                            <p className="text-sm text-slate-900">{stop.address}</p>
                          </div>
                        )}
                        {stop.delivered && (
                          <div className="bg-green-50 border border-green-200 rounded px-2 py-1">
                            <p className="text-xs text-green-700">
                              ✓ {t("Delivered at")} {new Date(stop.delivered).toLocaleTimeString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
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
                    <p className="font-bold text-slate-900">{driverNameOverride || t("Driver")}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      📍 {scooterPos.lat.toFixed(4)}, {scooterPos.lng.toFixed(4)}
                    </p>
                    <p className="text-xs text-slate-500 mt-2">🕒 {new Date().toLocaleTimeString()}</p>
                  </div>
                </Popup>
              </Marker>
            )}
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
                  disabled={markingDelivered || Boolean(selectedMarker?.delivered) || selectedMarker?.status === "delivered" || selectedMarker?.status === "completed"}
                  className="w-full h-11 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {markingDelivered ? t("Loading...") : t("Mark as Delivered")}
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

        .delivery-popup .leaflet-popup-content {
          border-radius: 12px;
          padding: 0 !important;
        }

        .delivery-popup .leaflet-popup-content-wrapper {
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        }

        .delivery-popup .leaflet-popup-tip {
          background-color: white;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
