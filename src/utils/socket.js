// src/utils/socket.js
import { io } from "socket.io-client";
import { BASE_URL } from "./secureFetch";

// 🧩 Detect environment
const isElectron =
  typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent || "");

// Detect if we're in dev mode (Vite dev server or electron dev tools)
const isDev =
  import.meta.env.MODE === "development" ||
  (isElectron && window.location.href.includes("localhost"));

// Normalize: remove trailing /api for socket base using the same base as secureFetch
const BASE_FROM_API = String(BASE_URL).replace(/\/api\/?$/, "");

// Allow overriding via VITE_SOCKET_URL (rarely needed)
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  BASE_FROM_API ||
  (typeof window !== "undefined" ? window.location.origin : "");

// 🧠 Log actual target for debugging
console.log("🔌 [SOCKET] Environment:", {
  isElectron,
  isDev,
  SOCKET_URL,
});

// Initialize socket connection
const socket = io(SOCKET_URL, {
  path: "/socket.io",
  // Start with polling (works through proxies) then upgrade to websocket when possible.
  transports: ["polling", "websocket"],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 2000,
  withCredentials: true,
  autoConnect: true,
  timeout: 20000,
});

// 🧠 Helper to safely get restaurant ID from common auth storage shapes
function getRestaurantId() {
  try {
    const toId = (value) => {
      const normalized = String(value ?? "").trim();
      return normalized || null;
    };

    const directLocal = toId(localStorage.getItem("restaurant_id"));
    if (directLocal) return directLocal;

    const directSession = toId(sessionStorage.getItem("restaurant_id"));
    if (directSession) return directSession;

    const localUser = JSON.parse(localStorage.getItem("beyproUser") || "{}");
    const localUserId = toId(localUser?.restaurant_id);
    if (localUserId) return localUserId;

    const sessionUser = JSON.parse(sessionStorage.getItem("beyproUser") || "{}");
    const sessionUserId = toId(sessionUser?.restaurant_id);
    if (sessionUserId) return sessionUserId;
  } catch {
    // ignore parsing/storage errors
  }
  return null;
}

// 🟢 On first connect
socket.on("connect", () => {
  console.log(`[SOCKET] ✅ Connected: ${socket.id}`);
  const restaurantId = getRestaurantId();
  if (restaurantId) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] 👥 Joined restaurant_${restaurantId}`);
  } else if (!window.__isQrMenuPage && isDev) {
    console.warn("[SOCKET] ⚠️ No restaurant_id found for room join on connect");
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
  const restaurantId = getRestaurantId();
  if (restaurantId) {
    socket.emit("join_restaurant", restaurantId);
    console.log(`[SOCKET] 🧩 Auto rejoined restaurant_${restaurantId} from storage change`);
  }
});

// 🔌 On disconnect
socket.on("disconnect", (reason) => {
  console.warn(`[SOCKET] ❌ Disconnected: ${reason}`);
});

// ⚠️ Connection errors
socket.on("connect_error", (err) => {
  // Some environments block websocket upgrades; polling may still succeed.
  if (!socket.connected) {
    console.warn("[SOCKET] 🚫 Connection error:", err?.message || err);
  }
});

// 🖨️ Print request from backend (Mobile app → Backend → Electron)
socket.on("print_request", async (printData) => {
  console.log("🖨️ [SOCKET] Print request received:", printData);
  
  // Try to use window-level print handler if available (set by GlobalOrderAlert)
  if (window.__handleRemotePrint && typeof window.__handleRemotePrint === "function") {
    try {
      window.__handleRemotePrint(printData);
      console.log("🖨️ [SOCKET] Print request forwarded to handler");
    } catch (err) {
      console.error("🖨️ [SOCKET] Failed to handle print request:", err);
    }
  } else {
    console.warn("🖨️ [SOCKET] No print handler registered - print feature unavailable");
  }
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
