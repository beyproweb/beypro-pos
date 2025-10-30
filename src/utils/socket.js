// src/utils/socket.js
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000"
    : "https://beypro-backend.onrender.com");

let socket = null;

function getRestaurantId() {
  try {
    const user = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    return user?.restaurant_id || null;
  } catch {
    return null;
  }
}

// ✅ Initialize socket only after restaurant_id exists
export function initSocket() {
  const restaurantId = getRestaurantId();

  if (!restaurantId) {
    console.warn("[SOCKET] ⏳ Waiting for restaurant_id before connecting...");
    setTimeout(initSocket, 500);
    return;
  }

  socket = io(SOCKET_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 2000,
    withCredentials: true,
    auth: { restaurantId }, // 🧠 pass restaurant automatically
  });

  socket.on("connect", () => {
    console.log(`[SOCKET] ✅ Connected: ${socket.id} | restaurant_${restaurantId}`);
  });

  socket.on("reconnect_attempt", (attempt) => {
    console.log(`[SOCKET] 🔄 Reconnect attempt #${attempt}`);
  });

  socket.on("disconnect", (reason) => {
    console.warn(`[SOCKET] ❌ Disconnected: ${reason}`);
  });

  socket.on("connect_error", (err) => {
    console.error("[SOCKET] 🚫 Connection error:", err?.message || err);
  });

  return socket;
}

// ✅ Helper for manual rejoin (after login)
export function joinRestaurantRoom() {
  const restaurantId = getRestaurantId();
  if (socket && socket.connected && restaurantId) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] ✅ Joined restaurant_${restaurantId}`);
  } else {
    console.warn("[SOCKET] ⚠️ Cannot join — socket not ready or no restaurant_id");
  }
}

export default socket;
