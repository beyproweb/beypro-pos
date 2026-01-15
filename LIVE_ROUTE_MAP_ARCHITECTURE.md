# 🗺️ Live Route Map - Architecture & Component Structure

## Component Hierarchy

```
LiveRouteMap (Main Component)
├── Header Section
│   ├── Driver Info Display
│   │   ├── Scooter Icon
│   │   ├── "Live Delivery Route" Title
│   │   └── Driver Name
│   └── Control Buttons
│       ├── Map/Satellite Toggle
│       ├── Traffic Toggle
│       └── Completed Deliveries Toggle
│
├── Map Container (Leaflet)
│   ├── Base Layer (Tile Layer)
│   │   ├── OpenStreetMap (Standard View)
│   │   └── ESRI Satellite (Satellite View)
│   │
│   ├── Data Layers
│   │   ├── Optimized Route (Blue Dashed Polyline)
│   │   ├── Live Route (Green Solid Polyline)
│   │   ├── Traffic Layer (Optional WMS Layer)
│   │   ├── Stop Markers (Numbered, Color-Coded)
│   │   └── Driver Marker (Animated Scooter)
│   │
│   ├── Interactive Elements
│   │   ├── Marker Click Handler
│   │   └── Popup Windows
│   │       ├── Order Details
│   │       ├── Customer Info
│   │       └── ETA Display
│   │
│   └── Controls
│       ├── Zoom Controls
│       ├── Pan Controls
│       └── Attribution
│
├── Legend Panel (Bottom-Left)
│   ├── Color Reference
│   │   ├── Blue → Restaurant
│   │   ├── Green → Ready
│   │   ├── Yellow → In Progress
│   │   ├── Red → Delayed
│   │   └── Purple → Completed
│   │
│   └── Route Reference
│       ├── Blue Dashed → Optimized Route
│       └── Green Solid → Live Route
│
└── Footer Section
    ├── Stop Count
    ├── Delivery Progress
    ├── Update Frequency
    └── Last Update Timestamp
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Orders.jsx Component                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  selectedDriverId: "123"                              │  │
│  │  filteredOrders: [{ id: 1, address: "...", ... }]    │  │
│  │  mapStops: [{ lat: 38.1, lng: 27.7, label: "..." }]  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────────────────────┘
               │ Pass Props
               ▼
┌─────────────────────────────────────────────────────────────┐
│              LiveRouteMap Component State                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Input Props:                                            │ │
│ │  - stopsOverride: Route stops                          │ │
│ │  - driverId: "123"                                     │ │
│ │  - orders: [{ customer_name, address, ... }]          │ │
│ │  - driverNameOverride: "Ahmed Karim"                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Internal State:                                         │ │
│ │  - driverPos: { lat, lng }                            │ │
│ │  - routeCoords: [{ lat, lng }, ...]                   │ │
│ │  - liveRouteCoords: [{ lat, lng }, ...]               │ │
│ │  - stops: [{ ...stop, status, orderId, ... }, ...]   │ │
│ │  - mapType: "standard" | "satellite"                 │ │
│ │  - showTraffic: boolean                               │ │
│ │  - showCompleted: boolean                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────────┬───────────────────────────────────────────┘
                 │ useEffect Hooks
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
   API Polling         Socket.io Listeners
   (3 seconds)        (Real-time events)
        │                 │
        │ Every 3s        │ driver_location_updated
        │                 │
        ▼                 ▼
   GET /drivers/location/{id}
        │
        ├──→ setDriverPos({ lat, lng })
        │
        └──→ triggerLiveRouteRecalc()
              │
              ▼
        GET /google-directions?...
              │
              ├──→ decode polyline
              ├──→ setLiveRouteCoords()
              │
              └──→ Re-render map
```

---

## State Management Diagram

```
┌───────────────────────────────────────────────┐
│           Initial State on Mount              │
├───────────────────────────────────────────────┤
│ driverPos: null                               │
│ routeCoords: null                             │
│ nextStop: null                                │
│ liveRouteCoords: null                         │
│ stops: []                                     │
│ selectedMarker: null                          │
│ mapType: "standard"                           │
│ showTraffic: false                            │
│ showCompleted: true                           │
└───────────────────────────────────────────────┘
          │
          │ useEffect on mount
          ▼
┌───────────────────────────────────────────────┐
│    Fetch Initial Route & Driver Location     │
├───────────────────────────────────────────────┤
│ 1. Initialize stops from props                │
│ 2. Set initial route coordinates              │
│ 3. Fetch first driver location                │
│ 4. Setup polling interval                     │
│ 5. Setup socket listener                      │
└───────────────────────────────────────────────┘
          │
          │ Every 3 seconds + Real-time
          ▼
┌───────────────────────────────────────────────┐
│         Active Polling & Listening             │
├───────────────────────────────────────────────┤
│ driverPos: { lat: 38.1, lng: 27.7 }          │
│ routeCoords: [{...}, {...}, ...]              │
│ nextStop: { lat: 38.1, lng: 27.7, ... }      │
│ liveRouteCoords: [{...}, {...}, ...]          │
│ stops: [{...status, orderId...}, ...]         │
└───────────────────────────────────────────────┘
          │
          │ User interactions
          ├──→ Click marker → setSelectedMarker()
          ├──→ Toggle map → setMapType()
          ├──→ Toggle traffic → setShowTraffic()
          └──→ Toggle completed → setShowCompleted()
          │
          ▼
┌───────────────────────────────────────────────┐
│   Component Re-renders with New State         │
├───────────────────────────────────────────────┤
│ Updated markers, routes, popups, controls     │
└───────────────────────────────────────────────┘
          │
          │ Cleanup on unmount
          ▼
┌───────────────────────────────────────────────┐
│      Cleanup & Resource Management            │
├───────────────────────────────────────────────┤
│ clearInterval(polling)                        │
│ socket.off("driver_location_updated")         │
│ Reset state                                   │
└───────────────────────────────────────────────┘
```

---

## Marker Lifecycle

```
Component Mount
    │
    ▼
Initialize Stops
    │ Enrich with order data
    ▼
createNumberedMarker(number, color)
    │
    ├─→ Create DivIcon with HTML
    │   ├─→ Styled circle with number
    │   ├─→ Border & shadow
    │   └─→ Color based on status
    │
    └─→ Return L.DivIcon with:
        ├─→ iconSize
        ├─→ iconAnchor
        └─→ popupAnchor
    │
    ▼
Render Marker on Map
    │ Position: [lat, lng]
    │ Icon: createNumberedMarker()
    │ Event: onClick → setSelectedMarker()
    │
    ▼
User Clicks Marker
    │
    ├─→ showPopup()
    │   ├─→ Order ID
    │   ├─→ Customer Name
    │   ├─→ Address
    │   ├─→ ETA
    │   └─→ Delivery Status
    │
    └─→ Click elsewhere
        └─→ hidePopup()
    │
    ▼
Marker Status Changes
    │ (via socket or polling)
    │
    ├─→ setStops([...updated])
    │
    ▼

Marker Re-renders
    │ Color updates
    │ Status badge updates
    │ Popup refreshes if open
    │
    ▼
Component Unmount
    │
    └─→ Cleanup listeners, markers removed
```

---

## Real-Time Update Flow

```
         Mobile App (Driver)
         Sends GPS Update
              │
              ▼
    Backend Receives Location
    POST /driver-location
              │
              ├─→ Save to Database
              │
              ├─→ Broadcast via Socket.io
              │   emit('driver_location_updated', {
              │     driver_id: 123,
              │     lat: 38.1,
              │     lng: 27.7
              │   })
              │
              └─→ Also available via API
                  GET /drivers/location/123
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
    Socket Event  API Polling   API Polling
    (Instant)    (3 sec 1)      (3 sec 2)
         │             │             │
         └─────────────┼─────────────┘
                       │
                       ▼
            socket.on('driver_location_updated')
            OR fetchLocation() every 3s
                       │
                       ▼
            setDriverPos({ lat, lng })
                       │
                       ▼
            Update Marker Position
                       │
                       ▼
            Recalculate Live Route
                       │
                       ▼
            GET /google-directions
                       │
                       ▼
            Decode Polyline
                       │
                       ▼
            setLiveRouteCoords([...])
                       │
                       ▼
            Redraw Green Route Line
                       │
                       ▼
            Trigger Animation
                       │
                       ▼
            User Sees:
            - Driver marker moved
            - Green route updated
            - Marker animation played
```

---

## Route Calculation Workflow

```
Component Mount
    │ stops array provided
    ▼
Initialize Route Calculation
    │
    ├─→ Extract coordinates:
    │   - origin: stops[0] (restaurant)
    │   - destination: stops[n-1] (last stop)
    │   - waypoints: stops[1..n-2] (middle stops)
    │
    ▼
Call Google Directions API
    │
    GET /google-directions?
      origin=38.1,27.7&
      destination=38.15,27.75&
      waypoints=38.11,27.71|38.12,27.72&
      mode=driving
    │
    ▼
Backend Proxies to Google Maps API
    │
    ├─→ Google optimizes route
    ├─→ Returns encoded polyline
    └─→ Returns legs with distance/duration
    │
    ▼
Frontend Receives Response
    │
    ├─→ Extract overview_polyline.points
    ├─→ Decode using @mapbox/polyline
    └─→ Convert to [{lat, lng}, ...] array
    │
    ▼
setRouteCoords([...decoded...])
    │
    ▼
MapContainer Re-renders
    │
    ├─→ Polyline positions updated
    ├─→ Route drawn (blue dashed)
    └─→ Animated path visible
    │
    ▼
Route Displayed on Map
```

---

## Interactive Popup Flow

```
User Clicks Marker Number
    │
    ▼
Marker onClick Handler
    │
    ├─→ setSelectedMarker({
    │     ...stopData,
    │     index: stopIndex
    │   })
    │
    ▼
Popup Component Renders
    │
    ├─→ Leaflet Popup opens at marker
    │
    ├─→ Popup Content:
    │   ├─→ <div className="p-3 min-w-60">
    │   │
    │   ├─→ Header Section
    │   │   ├─→ Stop #{index}
    │   │   └─→ Status Badge
    │   │       └─→ READY|IN PROGRESS|DELAYED|COMPLETED
    │   │
    │   ├─→ Order Details
    │   │   ├─→ Order ID: #ORD-123456
    │   │   ├─→ Customer: Sarah Johnson
    │   │   ├─→ Address: 123 Main St
    │   │   └─→ ETA: 10:52 AM
    │   │
    │   └─→ Delivery Status
    │       └─→ ✓ Delivered at 10:47:15
    │
    ▼
User Clicks Outside Popup
    │
    ▼
Popup Closes
    │ Click event propagates
    ├─→ setSelectedMarker(null)
    │
    └─→ Popup hidden
```

---

## Map View Toggle Flow

```
User Clicks "Satellite" / "Map" Button
    │
    ▼
setMapType(mapType === "standard" ? "satellite" : "standard")
    │
    ▼
Component Re-renders
    │
    ├─→ IF mapType === "standard":
    │   │
    │   ├─→ Remove: ESRI Satellite Layer
    │   ├─→ Add: OpenStreetMap Layer
    │   ├─→ Remove: Traffic Layer (if shown)
    │   └─→ If traffic was on, will re-add
    │
    └─→ ELSE (mapType === "satellite"):
        │
        ├─→ Remove: OpenStreetMap Layer
        ├─→ Add: ESRI Satellite Layer
        ├─→ Optionally show: Traffic WMS Layer
        └─→ Render same markers/routes
    │
    ▼
Map Background Changes
    │ Smooth transition between layers
    │
    ▼
All Markers/Routes Still Visible
    │ They layer on top of map tile layer
    │
    ▼
User Sees:
    - Road map OR satellite imagery
    - Same numbered markers
    - Same colored route lines
    - Same interactive features
```

---

## Performance Optimization Points

```
Component Render
    │
    ├─→ useCallback prevents re-creating:
    │   ├─→ getMarkerColor()
    │   └─→ createNumberedMarker()
    │
    ├─→ useRef prevents re-renders for:
    │   ├─→ mapRef
    │   └─→ scooterMarkerRef
    │
    ├─→ useEffect optimization:
    │   ├─→ Proper dependency arrays
    │   ├─→ Cleanup in returns
    │   └─→ No infinite loops
    │
    ├─→ Conditional rendering:
    │   ├─→ Skip completed stops if !showCompleted
    │   └─→ Skip traffic layer unless enabled
    │
    ├─→ Route caching:
    │   └─→ Only recalculate on stops change
    │
    └─→ Polling interval:
        └─→ 3 seconds (not too frequent)
    │
    ▼
Optimized Rendering Performance
    │ - Smooth marker animations
    │ - No jank on real-time updates
    │ - Handles 20-30 stops efficiently
    │ - ~50-100ms per frame (60fps target)
```

---

## Error Handling Flow

```
Component Initialization
    │
    ├─→ Try: Fetch initial route
    │   ├─→ setRouteCoords([...])
    │   └─→ Catch: console.error(), keep going
    │
    ├─→ Try: Fetch driver location
    │   ├─→ setDriverPos({lat, lng})
    │   └─→ Catch: setDriverPos(null), fallback to restaurant
    │
    └─→ Try: Setup socket listener
        ├─→ socket.on('driver_location_updated')
        └─→ Catch: Fallback to polling only
    │
    ▼
During Operation
    │
    ├─→ Location update fails
    │   └─→ Use fallback restaurant position
    │
    ├─→ Route calculation fails
    │   └─→ Keep previous route visible
    │
    ├─→ Socket event fails
    │   └─→ Continue with API polling
    │
    └─→ Marker click fails
        └─→ Silently fail, don't break UI
    │
    ▼
Cleanup on Error
    │
    ├─→ Clear intervals
    ├─→ Remove listeners
    ├─→ Reset problematic state
    └─→ Display user-friendly message (if critical)
```

---

## Browser Rendering Pipeline

```
JavaScript Execution
    │ LiveRouteMap component
    ▼
DOM Manipulation
    │ Update stops array
    │ Update driverPos state
    │ Update route coords
    ▼
Recalculate Layout
    │ Map container size
    │ Legend panel position
    │ Popup positioning
    ▼
Paint Phase
    │ Draw map tiles
    │ Draw polylines
    │ Draw markers
    │ Draw legend
    │ Draw popups
    ▼
Composite Phase
    │ Z-index layering
    │ Opacity blending
    │ Shadow effects
    ▼
Display on Screen
    │ Visual output
    │ ~16ms per frame (60fps)
    ▼
User Perceives:
    - Smooth map pan/zoom
    - Animated markers
    - Updated routes
    - No lag/jank
```

---

## Component Lifecycle

```
MOUNT
    │
    ├─→ Constructor & Initial State
    │
    ├─→ render()
    │   └─→ Return JSX with MapContainer
    │
    ├─→ useEffect (route calculation)
    │   └─→ Fetch initial route
    │
    ├─→ useEffect (location polling)
    │   └─→ Start 3-second polling
    │   └─→ Setup socket listener
    │
    └─→ useEffect (stops enrichment)
        └─→ Merge stops with order data
    │
    ▼
RUNNING
    │
    ├─→ Every 3s: API polling
    │   └─→ setDriverPos() → Re-render
    │
    ├─→ Real-time: Socket events
    │   └─→ setDriverPos() → Re-render
    │
    ├─→ User events: Clicks
    │   └─→ setSelectedMarker() → Re-render
    │
    └─→ User events: Toggles
        └─→ setMapType/Traffic/Completed → Re-render
    │
    ▼
UNMOUNT
    │
    ├─→ Stop polling interval
    ├─→ Remove socket listener
    ├─→ Clear state
    └─→ Cleanup complete
```

---

**Last Updated**: January 15, 2026
**Version**: 2.0
**Purpose**: Technical Reference for Developers
