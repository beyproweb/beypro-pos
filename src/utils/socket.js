// src/utils/socket.js
import { io } from "socket.io-client";

// 🧩 Choose backend automatically (align with secureFetch VITE_API_URL)
const isElectron =
  typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "");

const RAW =
  import.meta.env.VITE_API_URL ||
  (isElectron
    ? "https://hurrypos-backend.onrender.com/api"
    : import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://hurrypos-backend.onrender.com/api");

// Normalize: strip trailing /api for socket base
const BASE_FROM_API = String(RAW).replace(/\/api\/?$/, "");

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || BASE_FROM_API;

// Initialize socket
const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 2000,
  withCredentials: true,
  autoConnect: true,
});

// 🧠 Helper to safely get restaurant ID
function getRestaurantId() {
  try {
    const user = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    return user?.restaurant_id || null;
  } catch {
    return null;
  }
}

// 🟢 On first connect
socket.on("connect", () => {
  console.log(`[SOCKET] ✅ Connected: ${socket.id}`);
  const restaurantId = getRestaurantId();
  if (restaurantId) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] 👥 Joined restaurant_${restaurantId}`);
  } else {
    console.warn("[SOCKET] ⚠️ No restaurant_id found in localStorage on connect");
  }

  // 🧩 Safety rejoin few seconds after connect (handles slow logins)
  setTimeout(() => {
    const rid = getRestaurantId();
    if (rid) {
      socket.emit("join_restaurant", rid);
      console.log(`[SOCKET] 🧠 Safety rejoin restaurant_${rid}`);
    }
  }, 3000);
});

// ♻️ Auto-rejoin on reconnect attempts
socket.io.on("reconnect_attempt", (attempt) => {
  console.log(`[SOCKET] 🔄 Reconnect attempt #${attempt}`);
  const restaurantId = getRestaurantId();
  if (restaurantId) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] 🔁 Rejoined restaurant_${restaurantId}`);
  }
});

// 🔁 Rejoin whenever app reloads or localStorage changes
window.addEventListener("storage", () => {
  const user = JSON.parse(localStorage.getItem("beyproUser") || "{}");
  if (user?.restaurant_id) {
    socket.emit("join_restaurant", user.restaurant_id);
    console.log(`[SOCKET] 🧩 Auto rejoined restaurant_${user.restaurant_id} from storage change`);
  }
});

// 🔌 On disconnect
socket.on("disconnect", (reason) => {
  console.warn(`[SOCKET] ❌ Disconnected: ${reason}`);
});

// ⚠️ Connection errors
socket.on("connect_error", (err) => {
  console.error("[SOCKET] 🚫 Connection error:", err?.message || err);
});

// 🔄 Public helper to manually rejoin (used in GlobalOrderAlert)
export function joinRestaurantRoom() {
  const restaurantId = getRestaurantId();
  if (restaurantId && socket.connected) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] ✅ Manually joined restaurant_${restaurantId}`);
  } else if (!socket.connected) {
    console.warn("[SOCKET] ⚠️ Socket not connected yet, will join on connect");
  }
}

export default socket;
