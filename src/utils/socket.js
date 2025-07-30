import { io } from "socket.io-client";

// Use Vite env variable or default to your Render backend (never localhost in prod)
const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || "https://hurrypos-backend.onrender.com";

// Use path ONLY if your backend server is configured to serve socket.io at a custom path!
// Otherwise, you can omit the `path` option.
// By default, socket.io uses "/socket.io" anyway, so you can safely leave this out unless you’ve changed it server-side.

// Final socket client:
const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  // Remove withCredentials unless you use cookie-based auth
  // withCredentials: true, 
});

// Debug logs for status:
socket.on("connect", () => {
  console.log("[SOCKET] Connected:", socket.id);
});
socket.on("disconnect", () => {
  console.warn("[SOCKET] Disconnected");
});
socket.on("connect_error", err => {
  console.error("[SOCKET] Connection error:", err?.message || err);
});

export default socket;
