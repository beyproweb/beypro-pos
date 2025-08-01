import React, { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import polyline from "@mapbox/polyline";
import "leaflet/dist/leaflet.css";
import { useTranslation } from "react-i18next";

export default function LiveRouteMap({ stopsOverride, driverNameOverride, driverId }) {
  const [driverPos, setDriverPos] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [nextStop, setNextStop] = useState(null);    // 🛵 Where the driver should go next
  const [liveRouteCoords, setLiveRouteCoords] = useState(null);  // 🔵 Dynamic updated route
  const scooterMarkerRef = useRef(null);
  const { t, i18n } = useTranslation();
  const route = stopsOverride && stopsOverride.length > 1 ? stopsOverride : [];


  // Scooter SVG icon as DivIcon
const scooterIcon = new L.DivIcon({
  className: "",
  html: `
    <div style="display: flex; flex-direction: column; align-items: center; transform: translate(-14px, -14px);">
      <div style="background: white; padding: 4px 6px; border-radius: 12px; font-size: 12px; font-weight: bold; color: #2986cc; box-shadow: 0 2px 6px rgba(0,0,0,0.3); margin-bottom: 4px;">
        ${driverNameOverride || ""}
      </div>
      <div style="font-size:32px;">🛵</div>
    </div>
  `,
  iconSize: [40, 48],
  iconAnchor: [16, 48],
});


  useEffect(() => {
  if (route.length >= 2) {
    setNextStop(route[1]); // first customer after restaurant
  }
}, [route]);

useEffect(() => {
  if (driverPos && scooterMarkerRef.current) {
    scooterMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
  }
}, [driverPos]);


useEffect(() => {
  if (!driverPos || !nextStop) return;

  async function fetchLiveRoute() {
    const origin = `${driverPos.lat},${driverPos.lng}`;
    const destination = `${nextStop.lat},${nextStop.lng}`;

    const params = new URLSearchParams({
      origin,
      destination,
      mode: "driving",
    });

    try {
      const res = await fetch(`${API_URL}/api/google-directions?${params.toString()}`);
      const data = await res.json();
      if (data.routes && data.routes[0] && data.routes[0].overview_polyline) {
        const points = polyline.decode(data.routes[0].overview_polyline.points);
        const latlngs = points.map(([lat, lng]) => ({ lat, lng }));
        setLiveRouteCoords(latlngs);
      }
    } catch (err) {
      console.error("Failed to fetch live driver route:", err);
    }
  }

  fetchLiveRoute();
}, [driverPos, nextStop]);



    // Fetch driver's real location from backend
  useEffect(() => {
    if (!driverId) return;
    let isMounted = true;
    async function fetchLocation() {
      try {
        const res = await fetch(`${API_URL}/api/drivers/location/${driverId}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        if (isMounted) setDriverPos({ lat: data.lat, lng: data.lng });
      } catch {
        if (isMounted) setDriverPos(null);
      }
    }
    fetchLocation();
    const intv = setInterval(fetchLocation, 3000);
    return () => {
      isMounted = false;
      clearInterval(intv);
    };
  }, [driverId]);

  // Fetch the real route from Google Directions API (via your backend)
  useEffect(() => {
    if (!route || route.length < 2) {
      setRouteCoords(null);
      return;
    }
    const origin = `${route[0].lat},${route[0].lng}`;
    const destination = `${route[route.length - 1].lat},${route[route.length - 1].lng}`;
    const waypoints =
      route.length > 2
        ? route.slice(1, -1).map(pt => `${pt.lat},${pt.lng}`).join("|")
        : "";

    const params = new URLSearchParams({
      origin,
      destination,
      ...(waypoints ? { waypoints } : {})
    });

    fetch(`${API_URL}/api/google-directions?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        console.log("Google Directions API data:", data);
        if (
          data.routes &&
          data.routes[0] &&
          data.routes[0].overview_polyline &&
          data.routes[0].overview_polyline.points
        ) {
          // Decode the Google polyline
          const latlngs = polyline
            .decode(data.routes[0].overview_polyline.points)
            .map(([lat, lng]) => ({ lat, lng }));
          setRouteCoords(latlngs);
          console.log("Decoded polyline coordinates:", latlngs);
        } else {
          setRouteCoords(null);
          console.warn("No polyline found in Google Directions API response.");
        }
      })
      .catch((e) => {
        setRouteCoords(null);
        console.error("Error fetching Google Directions:", e);
      });
  }, [JSON.stringify(route)]);

  const scooterPos =
    driverPos && typeof driverPos.lat === "number" && typeof driverPos.lng === "number"
      ? driverPos
      : route[0]; // fallback to first stop (restaurant)

  if (route.length < 2)
    return <div>{t("Route needs at least restaurant and one customer.")}</div>;

  return (
  <div
    className="bg-white dark:bg-gray-900 rounded-xl relative shadow-lg transition-colors duration-300"
    style={{
      width: "70vw",
      maxWidth: "1000px",
      padding: "2rem",
    }}
  >
    <h2 className="text-lg font-bold mb-3 text-gray-800 dark:text-white">
      🗺️ {t("Delivery Route")}: {driverNameOverride}
    </h2>

    <MapContainer
      center={route[0]}
      zoom={14}
      scrollWheelZoom={false}
      style={{
        height: "500px",
        width: "100%",
        maxWidth: 900,
        borderRadius: 10,
        boxShadow: "0 4px 24px #0002",
      }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />

      {/* Route Path */}
      {liveRouteCoords && liveRouteCoords.length > 1 && (
        <Polyline
          positions={liveRouteCoords.map(pt => [pt.lat, pt.lng])}
          color="#4f8cff"
          weight={8}
        />
      )}

      {/* Stops */}
      {route.map((pt, idx) => (
        <Marker key={idx} position={[pt.lat, pt.lng]}>
          <Tooltip direction="top" offset={[0, -16]} permanent>
            <b>{pt.label || `${t("Stop")} ${idx + 1}`}</b>
          </Tooltip>
        </Marker>
      ))}

      {/* Live Scooter Marker */}
      {scooterPos && (
        <Marker
          position={[scooterPos.lat, scooterPos.lng]}
          icon={scooterIcon}
          ref={scooterMarkerRef}
        />
      )}
    </MapContainer>

    <div className="text-xs mt-2 text-gray-600 dark:text-gray-300">
      {t("Live route with real driver location!")}
    </div>
  </div>
);

}
