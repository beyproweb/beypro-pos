// src/utils/socket.js
import { io } from "socket.io-client";

// 🧩 Detect environment
const isElectron =
  typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "");

// Detect if we're in dev mode (Vite dev server or electron dev tools)
const isDev =
  import.meta.env.MODE === "development" ||
  (isElectron && window.location.href.includes("localhost"));

// 🌍 Default production API (Render)
const PROD_API = "https://hurrypos-backend.onrender.com/api";

// 🧩 Decide which API base to use
const RAW =
  import.meta.env.VITE_API_URL ||
  (isDev
    ? "http://localhost:5000/api" // local backend when dev
    : PROD_API); // Render backend for packaged Electron or prod web

// Normalize: remove trailing /api for socket base
const BASE_FROM_API = String(RAW).replace(/\/api\/?$/, "");

// Allow overriding via VITE_SOCKET_URL (rarely needed)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || BASE_FROM_API;

// 🧠 Log actual target for debugging
console.log("🔌 [SOCKET] Environment:", {
  isElectron,
  isDev,
  SOCKET_URL,
});

// Initialize socket connection
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

  // 🧩 Safety rejoin few seconds after connect
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
