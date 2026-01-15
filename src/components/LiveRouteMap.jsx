import React, { useEffect, useState, useRef, useCallback } from "react";
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
export default function LiveRouteMap({ stopsOverride, driverNameOverride, driverId, orders = [] }) {
  const [driverPos, setDriverPos] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [nextStop, setNextStop] = useState(null);
  const [liveRouteCoords, setLiveRouteCoords] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [mapType, setMapType] = useState("standard"); // "standard" or "satellite"
  const [showTraffic, setShowTraffic] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [stops, setStops] = useState([]);
  
  const mapRef = useRef(null);
  const scooterMarkerRef = useRef(null);
  const { t } = useTranslation();
  const route = stopsOverride && stopsOverride.length > 1 ? stopsOverride : [];

  // Initialize stops with status info
  useEffect(() => {
    if (!route.length) return;
    
    console.log("🗺️ LiveRouteMap - route:", route);
    console.log("🗺️ LiveRouteMap - orders prop:", orders);
    
    const stopsWithStatus = route.map((stop, idx) => {
      // Try multiple matching strategies to find the corresponding order
      let order = null;
      
      // Strategy 1: Match by address from stop object directly (if available)
      if (!order && stop.address && orders.length > 0) {
        order = orders.find(o => 
          o.customer_address && 
          o.customer_address.toLowerCase().trim() === stop.address.toLowerCase().trim()
        );
        if (order) console.log(`✅ Stop ${idx} matched by stop.address:`, order.customer_address);
      }

      // Strategy 2: Match by exact address (fallback)
      if (!order && orders.length > 0) {
        order = orders.find(o => 
          o.customer_address && stop.label && 
          o.customer_address.toLowerCase().trim() === stop.label.toLowerCase().trim()
        );
        if (order) console.log(`✅ Stop ${idx} matched by stop.label:`, order.customer_address);
      }
      
      // Strategy 3: Match by coordinates (lat/lng)
      if (!order && orders.length > 0) {
        order = orders.find(o => 
          o.lat && o.lng && stop.lat && stop.lng &&
          Math.abs(o.lat - stop.lat) < 0.0001 && 
          Math.abs(o.lng - stop.lng) < 0.0001
        );
        if (order) console.log(`✅ Stop ${idx} matched by coordinates:`, order.customer_address);
      }
      
      // Strategy 4: Match by partial address (contains)
      if (!order && orders.length > 0 && stop.label) {
        order = orders.find(o => 
          o.customer_address && 
          (o.customer_address.toLowerCase().includes(stop.label.toLowerCase()) ||
           stop.label.toLowerCase().includes(o.customer_address.toLowerCase()))
        );
        if (order) console.log(`✅ Stop ${idx} matched by partial address:`, order.customer_address);
      }
      
      // Strategy 5: If no order found, try to find by index (sequential matching)
      if (!order && idx > 0 && idx < orders.length) {
        order = orders[idx];
        if (order) console.log(`✅ Stop ${idx} matched by index:`, order.customer_address);
      }
      
      if (!order) console.warn(`❌ Stop ${idx} NOT matched! stop:`, stop);
      
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
    console.log("🗺️ FINAL stopsWithStatus:", stopsWithStatus);
    // Auto-select the first customer stop (index 1) so address/details are visible immediately
    if (!selectedMarker && stopsWithStatus.length > 1) {
      const firstCustomer = stopsWithStatus[1];
      if (firstCustomer) {
        console.log("🗺️ Auto-selecting first customer stop:", firstCustomer);
        setSelectedMarker({ ...firstCustomer, index: 1 });
      }
    }
  }, [route, orders]);

  // Fetch driver's real-time location
  useEffect(() => {
    if (!driverId) return;
    let isMounted = true;

    const fetchLocation = async () => {
      try {
        const res = await secureFetch(`drivers/location/${driverId}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (isMounted) setDriverPos({ lat: data.lat, lng: data.lng });
      } catch (err) {
        if (isMounted) setDriverPos(null);
      }
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 3000);

    // Socket.io real-time updates
    const handleDriverUpdate = (data) => {
      if (data.driver_id === Number(driverId) && isMounted) {
        setDriverPos({ lat: data.lat, lng: data.lng });
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

  // Fetch the optimized route from Google Directions API
  useEffect(() => {
    if (!route || route.length < 2) {
      setRouteCoords(null);
      return;
    }

    let isMounted = true;

    const fetchRoute = async () => {
      const origin = `${route[0].lat},${route[0].lng}`;
      const destination = `${route[route.length - 1].lat},${route[route.length - 1].lng}`;
      const waypoints =
        route.length > 2
          ? route.slice(1, -1).map(pt => `${pt.lat},${pt.lng}`).join("|")
          : "";

      const params = new URLSearchParams({
        origin,
        destination,
        ...(waypoints ? { waypoints } : {}),
      });

      try {
        const data = await secureFetch(`drivers/google-directions?${params.toString()}`);
        if (
          isMounted &&
          data.routes &&
          data.routes[0] &&
          data.routes[0].overview_polyline
        ) {
          const latlngs = polyline
            .decode(data.routes[0].overview_polyline.points)
            .map(([lat, lng]) => ({ lat, lng }));
          setRouteCoords(latlngs);
        }
      } catch (err) {
        if (isMounted) console.error("Error fetching route:", err);
      }
    };

    fetchRoute();
  }, [JSON.stringify(route)]);

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
    driverPos && typeof driverPos.lat === "number" && typeof driverPos.lng === "number"
      ? driverPos
      : route[0];

  if (route.length < 2) {
    return (
      <div className="flex items-center justify-center h-96 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-slate-500 text-center">{t("Route needs at least restaurant and one customer.")}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg shadow-2xl overflow-hidden">
      {/* Header with Controls */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🛵</div>
            <div>
              <h2 className="text-xl font-bold">{t("Live Delivery Route")}</h2>
              <p className="text-sm text-slate-300">{driverNameOverride || t("Driver")}</p>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <button
              onClick={() => setMapType(mapType === "standard" ? "satellite" : "standard")}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-sm font-semibold flex items-center gap-2"
            >
              {mapType === "standard" ? "📡 Satellite" : "🗺️ Map"}
            </button>

            <button
              onClick={() => setShowTraffic(!showTraffic)}
              className={`px-4 py-2 rounded-lg transition text-sm font-semibold flex items-center gap-2 ${
                showTraffic ? "bg-amber-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              🚗 {t("Traffic")}
            </button>

            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className={`px-4 py-2 rounded-lg transition text-sm font-semibold flex items-center gap-2 ${
                showCompleted ? "bg-purple-600" : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              ✓ {t("Completed")}
            </button>
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative overflow-hidden">
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
                attribution='&copy; OpenStreetMap'
              />
              {showTraffic && (
                <WMSTileLayer
                  url="https://ows.mundialis.de/services/service?"
                  layers="TRAFFIC"
                  transparent={true}
                  format="image/png"
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
          {routeCoords && routeCoords.length > 1 && (
            <Polyline
              positions={routeCoords.map(pt => [pt.lat, pt.lng])}
              color="#2563EB"
              weight={6}
              opacity={0.8}
              dashArray="8, 4"
            />
          )}

          {/* Live Driver Route */}
          {liveRouteCoords && liveRouteCoords.length > 1 && (
            <Polyline
              positions={liveRouteCoords.map(pt => [pt.lat, pt.lng])}
              color="#10B981"
              weight={5}
              opacity={0.9}
            />
          )}

          {/* Numbered Delivery Stops */}
          {stops.map((stop, idx) => {
            console.log(`🗺️ Rendering Stop ${idx}:`, stop);
            const isCompleted = stop.delivered || stop.status === "completed";
            if (isCompleted && !showCompleted) return null;

            const markerColor = getMarkerColor(stop.status, idx);

            return (
              <Marker
                key={`stop-${idx}`}
                position={[stop.lat, stop.lng]}
                icon={createNumberedMarker(idx, markerColor)}
                eventHandlers={{
                  click: () => {
                    console.log(`🗺️ CLICKED Stop ${idx}:`, stop);
                    setSelectedMarker({ ...stop, index: idx });
                  },
                }}
              >
                  <Tooltip direction="right" offset={[12, 0]} opacity={0.95} permanent>
                    <div style={{minWidth:120}}>
                      <div style={{fontWeight:700, color:'#0f172a'}}>{stop.label || stop.customerName}</div>
                      {stop.address ? (
                        <div style={{fontSize:12, color:'#0f172a', marginTop:2}}>{stop.address}</div>
                      ) : null}
                    </div>
                  </Tooltip>
                <Popup
                  closeButton={true}
                  className="delivery-popup"
                  maxWidth={350}
                  minWidth={280}
                  onOpen={() => console.log(`🗺️ POPUP OPENED for Stop ${idx}:`, { address: stop.address, customerName: stop.customerName, phone: stop.phone })}
                >
                  <div className="p-3 min-w-60 bg-white text-slate-900">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-600">
                        {t("Stop")} #{idx}
                      </span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold text-white ${
                          stop.status === "completed"
                            ? "bg-purple-500"
                            : stop.status === "delayed"
                            ? "bg-red-500"
                            : stop.status === "in_progress"
                            ? "bg-yellow-500"
                            : "bg-green-500"
                        }`}
                      >
                        {stop.status.toUpperCase()}
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
                      {stop.address && stop.address !== "Restaurant" && (
                        <div>
                          <p className="text-xs text-slate-600 font-semibold">{t("Address")}</p>
                          <p className="text-sm text-slate-900 font-medium whitespace-normal break-words leading-snug bg-blue-50 p-2 rounded">{stop.address}</p>
                        </div>
                      )}
                      {stop.phone && (
                        <div>
                          <p className="text-xs text-slate-600 font-semibold">{t("Phone")}</p>
                          <p className="text-sm text-slate-900 font-mono">{stop.phone}</p>
                        </div>
                      )}
                      {stop.eta && (
                        <div>
                          <p className="text-xs text-slate-600 font-semibold">{t("ETA")}</p>
                          <p className="font-semibold text-slate-900">{stop.eta}</p>
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
          {scooterPos && (
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
                  <p className="text-xs text-slate-500 mt-2">
                    🕒 {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 border border-slate-200 max-w-xs">
          <h3 className="font-bold text-sm text-slate-900 mb-3">{t("Legend")}</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: MARKER_COLORS.restaurant }}
              />
              <span className="text-slate-700">{t("Restaurant / Restaurant")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: MARKER_COLORS.ready }}
              />
              <span className="text-slate-700">{t("Ready to Deliver")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: MARKER_COLORS.in_progress }}
              />
              <span className="text-slate-700">{t("In Progress")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: MARKER_COLORS.delayed }}
              />
              <span className="text-slate-700">{t("Delayed")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: MARKER_COLORS.completed }}
              />
              <span className="text-slate-700">{t("Completed")}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-blue-500" style={{ borderRadius: "1px" }} />
                <span className="text-slate-600">{t("Optimized Route")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500" style={{ borderRadius: "1px" }} />
                <span className="text-slate-600">{t("Live Route")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Stats */}
      <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-between text-sm">
        <div className="text-slate-600">
          {stops.length} {t("stops")} • {stops.filter(s => s.delivered).length} {t("delivered")}
        </div>
        <div className="text-xs text-slate-500">
          {t("Live updates every 3s")} • Last: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Custom Info Panel - Shows when marker is clicked */}
      {selectedMarker && (
        <div className="absolute bottom-6 right-6 w-80 bg-white rounded-lg shadow-2xl border-l-4 border-blue-500 z-50 animate-slideIn">
          <div className="p-4">
            {/* DEBUG: Log panel content */}
            {console.log("🗺️ INFO PANEL RENDERING - selectedMarker:", selectedMarker)}
            
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-lg text-slate-900">
                {t("Stop")} #{selectedMarker.index}
              </span>
              <button
                onClick={() => setSelectedMarker(null)}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                ✕
              </button>
            </div>

            {/* Status Badge */}
            <div className="mb-4">
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${
                  selectedMarker.status === "completed"
                    ? "bg-purple-500"
                    : selectedMarker.status === "delayed"
                    ? "bg-red-500"
                    : selectedMarker.status === "in_progress"
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
              >
                {selectedMarker.status?.toUpperCase() || "PENDING"}
              </span>
            </div>

            {/* Content */}
            <div className="space-y-3 border-t pt-3">
              {selectedMarker.orderId && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{t("Order ID")}</p>
                  <p className="font-mono font-bold text-slate-900 text-sm">#{selectedMarker.orderId}</p>
                </div>
              )}

              {selectedMarker.customerName && selectedMarker.customerName !== "Restaurant" && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{t("Customer")}</p>
                  <p className="font-bold text-slate-900 text-sm">{selectedMarker.customerName}</p>
                </div>
              )}

              {selectedMarker.address && selectedMarker.address !== "Restaurant" && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{t("Address")}</p>
                  <div className="bg-blue-50 border-2 border-blue-300 rounded p-2">
                    <p className="text-sm text-slate-900 font-bold leading-snug">{selectedMarker.address}</p>
                  </div>
                </div>
              )}

              {selectedMarker.phone && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{t("Phone")}</p>
                  <p className="text-sm text-slate-900 font-mono">{selectedMarker.phone}</p>
                </div>
              )}

              {selectedMarker.eta && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{t("ETA")}</p>
                  <p className="text-sm text-slate-900">{selectedMarker.eta}</p>
                </div>
              )}

              {selectedMarker.delivered && (
                <div className="bg-green-50 border border-green-300 rounded p-2 mt-2">
                  <p className="text-xs text-green-700 font-semibold">
                    ✓ {t("Delivered at")} {new Date(selectedMarker.delivered).toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
