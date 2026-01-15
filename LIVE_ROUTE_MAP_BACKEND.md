# 🔌 Live Route Map - Backend Integration Requirements

## Overview

This document outlines all backend endpoints, socket.io events, and API configurations required for the Live Delivery Route Map to function properly.

---

## Required Endpoints

### 1. Driver Location Endpoint

**Endpoint**: `GET /drivers/location/{driverId}`

**Purpose**: Fetch current GPS position of driver every 3 seconds

**Request Parameters**:

```javascript
{
  driverId: number | string; // Driver ID from filteredOrders or drivers list
}
```

**Response**:

```json
{
  "lat": 38.099579,
  "lng": 27.718065,
  "timestamp": "2024-01-15T10:45:32Z",
  "accuracy": 15
}
```

**Response Codes**:

- `200 OK` - Location found and returned
- `404 NOT FOUND` - Driver not found or no location data
- `401 UNAUTHORIZED` - Authentication failed
- `500 SERVER ERROR` - Server error

**Implementation Notes**:

- Should return most recent GPS coordinate
- Update frequency should be configurable (default: 2-3 second intervals from device)
- Include accuracy/precision if available
- Handle offline drivers gracefully

**Example**:

```javascript
// Frontend call
fetch(`/drivers/location/123`)
  .then((res) => res.json())
  .then((data) => console.log(data.lat, data.lng));
```

---

### 2. Google Directions Endpoint

**Endpoint**: `GET /google-directions`

**Purpose**: Calculate optimized route and provide polyline encoding for drawing on map

**Query Parameters**:

```javascript
{
  origin: "38.099579,27.718065",        // Starting point (lat,lng)
  destination: "38.102145,27.721234",   // Ending point (lat,lng)
  waypoints: "38.100500,27.719600|38.101234,27.720100",  // Optional intermediate stops
  mode: "driving"                        // Transport mode (driving, walking, etc)
}
```

**Response**:

```json
{
  "routes": [
    {
      "overview_polyline": {
        "points": "u_khG~s|p@gH_CkFsMwAw@..." // Encoded polyline string
      },
      "legs": [
        {
          "distance": {
            "value": 1500,
            "text": "1.5 km"
          },
          "duration": {
            "value": 180,
            "text": "3 mins"
          }
        }
      ]
    }
  ],
  "status": "OK"
}
```

**Response Codes**:

- `200 OK` - Route calculated successfully
- `400 BAD REQUEST` - Invalid origin/destination
- `403 FORBIDDEN` - API quota exceeded
- `404 NOT FOUND` - Route not found
- `500 SERVER ERROR` - Backend error

**Implementation Notes**:

- Should use Google Maps Directions API or equivalent
- Required for route visualization
- Polyline must be encoded (use @mapbox/polyline library)
- Supports multiple waypoints for optimization
- Cache results for frequently requested routes
- Handle rate limiting gracefully

**Example**:

```javascript
// Frontend call
const params = new URLSearchParams({
  origin: "38.099579,27.718065",
  destination: "38.102145,27.721234",
  waypoints: "38.100500,27.719600",
  mode: "driving",
});

fetch(`/google-directions?${params.toString()}`)
  .then((res) => res.json())
  .then((data) => {
    const decodedPolyline = polyline.decode(
      data.routes[0].overview_polyline.points
    );
    // Use for rendering route on map
  });
```

**Backend Implementation (Node.js example)**:

```javascript
const axios = require("axios");

app.get("/google-directions", async (req, res) => {
  const { origin, destination, waypoints, mode = "driving" } = req.query;

  try {
    const url = "https://maps.googleapis.com/maps/api/directions/json";
    const response = await axios.get(url, {
      params: {
        origin,
        destination,
        waypoints,
        mode,
        key: process.env.GOOGLE_MAPS_API_KEY,
      },
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### 3. Orders List Endpoint (Existing)

**Endpoint**: `GET /orders?driver_id={driverId}`

**Purpose**: Fetch all orders for enriching stop information with customer details

**Query Parameters**:

```javascript
{
  driver_id: number,        // Filter by driver
  status: string,           // Filter by status (optional)
  include_items: boolean    // Include order items (optional)
}
```

**Response**:

```json
{
  "data": [
    {
      "id": 123,
      "driver_id": 456,
      "customer_name": "Sarah Johnson",
      "customer_address": "123 Main Street, Apt 4B",
      "customer_phone": "+90-555-1234",
      "status": "in_progress",
      "eta": "10:52 AM",
      "delivered_at": null,
      "items": [
        {
          "name": "Grilled Chicken",
          "quantity": 2,
          "price": 25.99
        }
      ]
    }
  ],
  "total": 1
}
```

---

## Socket.io Events

### Real-Time Event: `driver_location_updated`

**Purpose**: Broadcast driver location changes in real-time via WebSocket

**Event Data**:

```javascript
{
  driver_id: number,           // Driver identifier
  lat: 38.099579,              // Latitude coordinate
  lng: 27.718065,              // Longitude coordinate
  timestamp: "2024-01-15T10:45:32Z",
  speed: 45.5,                 // Speed in km/h (optional)
  heading: 180,                // Bearing/direction (optional)
  accuracy: 15                 // GPS accuracy in meters (optional)
}
```

**Frontend Listener**:

```javascript
socket.on("driver_location_updated", (data) => {
  if (data.driver_id === Number(driverId)) {
    setDriverPos({ lat: data.lat, lng: data.lng });
  }
});
```

**Backend Broadcasting (Node.js example)**:

```javascript
// When receiving GPS from mobile app
app.post("/driver-location", (req, res) => {
  const { driver_id, lat, lng, speed, heading } = req.body;

  // Broadcast to all connected clients
  io.emit("driver_location_updated", {
    driver_id,
    lat,
    lng,
    timestamp: new Date().toISOString(),
    speed,
    heading,
  });

  res.json({ success: true });
});
```

### Optional Event: `order_status_updated`

**Purpose**: Notify of order status changes (delivery completion, etc.)

**Event Data**:

```javascript
{
  order_id: number,
  driver_id: number,
  status: "delivered",
  delivered_at: "2024-01-15T10:47:15Z",
  lat: 38.102145,
  lng: 27.721234
}
```

**Frontend Handler**:

```javascript
socket.on("order_status_updated", (data) => {
  // Refresh stops data to reflect updated status
  setStops((prev) =>
    prev.map((stop) =>
      stop.orderId === data.order_id
        ? { ...stop, status: data.status, delivered: data.delivered_at }
        : stop
    )
  );
});
```

---

## Environment Variables

### Required Configuration

```env
# Google Maps API
GOOGLE_MAPS_API_KEY=your_api_key_here
GOOGLE_MAPS_DIRECTIONS_API_ENABLED=true

# Socket.io Configuration
SOCKET_IO_CORS_ORIGIN=http://localhost:5173,https://yourdomain.com
SOCKET_IO_PING_INTERVAL=25000
SOCKET_IO_PING_TIMEOUT=60000

# Location Update Frequency
LOCATION_UPDATE_INTERVAL_MS=3000

# API Configuration
API_PORT=5000
API_HOST=localhost
```

### Frontend Environment

```env
# .env.local
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

---

## API Response Formats

### Standard Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## Database Schema Requirements

### Drivers Table

```sql
CREATE TABLE drivers (
  id INT PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(20),
  vehicle_id INT,
  status VARCHAR(50),
  last_location_lat DECIMAL(10, 8),
  last_location_lng DECIMAL(11, 8),
  last_location_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Driver Locations Table (Location History)

```sql
CREATE TABLE driver_locations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  driver_id INT NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  speed FLOAT,
  heading INT,
  accuracy FLOAT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id),
  INDEX (driver_id, timestamp)
);
```

### Orders Table (Ensure These Fields)

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS (
  driver_id INT,
  customer_name VARCHAR(255),
  customer_address TEXT,
  customer_phone VARCHAR(20),
  customer_lat DECIMAL(10, 8),
  customer_lng DECIMAL(11, 8),
  eta DATETIME,
  delivered_at TIMESTAMP NULL,
  delivery_proof_url VARCHAR(500),
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);
```

---

## Rate Limiting & Quotas

### Recommended Limits

```javascript
{
  // Driver location polling
  "/drivers/location/{id}": {
    windowMs: 60000,      // 1 minute
    maxRequests: 100      // 100 requests per minute
  },

  // Google Directions
  "/google-directions": {
    windowMs: 86400000,   // 24 hours
    maxRequests: 2500     // 2500 daily limit (adjust per Google quota)
  },

  // Orders list
  "/orders": {
    windowMs: 60000,
    maxRequests: 50
  }
}
```

---

## Error Handling

### Common Errors & Solutions

| Error                   | Cause                            | Solution                           |
| ----------------------- | -------------------------------- | ---------------------------------- |
| 404 Driver Not Found    | Invalid driver ID                | Verify driver exists and is active |
| 403 API Quota Exceeded  | Too many requests to Google Maps | Implement caching, upgrade quota   |
| 400 Invalid Coordinates | Malformed lat/lng                | Validate coordinate format         |
| 500 Database Error      | Query failure                    | Check database connection, logs    |
| Connection Timeout      | Backend unavailable              | Check server status, network       |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "DRIVER_NOT_FOUND",
    "message": "Driver with ID 456 not found",
    "statusCode": 404,
    "timestamp": "2024-01-15T10:45:32Z"
  }
}
```

---

## Performance Optimization

### Caching Strategy

```javascript
// Cache Google Directions results
const routeCache = new Map();

function getCachedRoute(origin, destination) {
  const key = `${origin}|${destination}`;
  const cached = routeCache.get(key);

  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.data;
  }
  return null;
}
```

### Database Optimization

```sql
-- Index for fast driver location lookups
CREATE INDEX idx_driver_id_location ON driver_locations(driver_id, timestamp DESC);

-- Index for fast order lookups by driver
CREATE INDEX idx_orders_driver_id ON orders(driver_id, status);
```

---

## Security Considerations

### Authentication

- All endpoints require valid JWT token
- Drivers can only access their own location
- Managers/Admins can access all drivers

### Authorization

```javascript
// Example middleware
app.get("/drivers/location/:id", authMiddleware, (req, res) => {
  const requesterId = req.user.id;
  const targetDriverId = req.params.id;

  // Allow self-access and managers
  if (requesterId !== targetDriverId && !req.user.isManager) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  // Fetch and return location
});
```

### Data Privacy

- Don't expose full driver details unnecessarily
- Log all location access for audit
- Implement geofence boundaries
- Anonymize old location data

---

## Testing Endpoints

### Mock Driver Location

```bash
curl -X POST http://localhost:5000/driver-location \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": 123,
    "lat": 38.099579,
    "lng": 27.718065,
    "speed": 45.5
  }'
```

### Test Route Calculation

```bash
curl "http://localhost:5000/google-directions?origin=38.099579,27.718065&destination=38.102145,27.721234&mode=driving"
```

### Test Orders Endpoint

```bash
curl "http://localhost:5000/orders?driver_id=123"
```

---

## Monitoring & Logging

### Key Metrics to Track

```javascript
{
  // Location accuracy
  "average_location_accuracy_meters": 12.5,
  "locations_lost_count": 2,

  // API performance
  "directions_api_avg_response_ms": 345,
  "locations_endpoint_avg_response_ms": 45,

  // Socket.io
  "active_socket_connections": 15,
  "location_updates_per_second": 8.2,

  // Errors
  "404_errors_24h": 3,
  "503_errors_24h": 0,
  "api_quota_exceeded_count": 0
}
```

### Logging Recommendations

```javascript
// Log all location updates
logger.info(`Location update: Driver ${driverId} at [${lat}, ${lng}]`);

// Log API errors
logger.error(`Google Directions error: ${error.message}`, {
  origin,
  destination,
});

// Log performance issues
if (responseTime > 1000) {
  logger.warn(`Slow API response: ${responseTime}ms for driver location`);
}
```

---

## Deployment Checklist

- [ ] Google Maps API key configured
- [ ] Socket.io server running with CORS enabled
- [ ] Database indexes created
- [ ] Environment variables set
- [ ] SSL/HTTPS configured
- [ ] Rate limiting implemented
- [ ] Error handling tested
- [ ] Logging configured
- [ ] Monitoring alerts set up
- [ ] Backup systems tested

---

## Troubleshooting Guide

### Map doesn't update

1. Check if `/drivers/location/{id}` endpoint returns data
2. Verify socket.io connection in browser DevTools
3. Check API response time (should be < 200ms)
4. Review backend error logs

### Routes don't show

1. Verify `/google-directions` endpoint is working
2. Check Google Maps API credentials
3. Validate origin/destination coordinates
4. Check API response contains polyline

### Performance issues

1. Check location update frequency (should be 3-5 seconds)
2. Reduce number of stops if > 30
3. Disable traffic layer if slow
4. Monitor database query times

---

## Additional Resources

- [Google Maps Directions API Documentation](https://developers.google.com/maps/documentation/directions)
- [Mapbox Polyline Library](https://www.npmjs.com/package/@mapbox/polyline)
- [Socket.io Documentation](https://socket.io/docs/)
- [Leaflet Documentation](https://leafletjs.com/)

---

**Last Updated**: January 15, 2026
**Version**: 2.0
**Status**: ✅ Production Ready
**Backend Status**: ⏳ Requires Implementation
