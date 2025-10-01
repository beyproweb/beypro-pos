import { io } from "socket.io-client";

// Use Vite env variable or default to your Render backend
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "https://hurrypos-backend.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
});

// Debug logs
socket.on("connect", () => {
  console.log("[SOCKET] Connected:", socket.id);

  // 🔑 Join the restaurant room after connect
  try {
    const user = JSON.parse(localStorage.getItem("beyproUser"));
    if (user?.restaurant_id) {
      socket.emit("join_restaurant", user.restaurant_id);
      console.log(`[SOCKET] Joined restaurant_${user.restaurant_id}`);
    }
  } catch (err) {
    console.warn("[SOCKET] Failed to join restaurant room:", err.message);
  }
});

socket.on("disconnect", () => {
  console.warn("[SOCKET] Disconnected");
});

socket.on("connect_error", (err) => {
  console.error("[SOCKET] Connection error:", err?.message || err);
});

export default socket;
