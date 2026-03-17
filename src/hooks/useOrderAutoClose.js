import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import secureFetch from "../utils/secureFetch";
import { SOCKET_BASE as SOCKET_URL } from "../utils/api";
let socket;

export default function useOrderAutoClose(orderId, onResetToTypePicker) {
  const idRef = useRef(orderId);
  useEffect(() => { idRef.current = orderId; }, [orderId]);

  // --- Socket listener ---
  useEffect(() => {
    if (!socket) {
      socket = io(SOCKET_URL, {
        path: "/socket.io",
        transports: ["polling", "websocket"],
        upgrade: true,
        timeout: 20000,
      });
    }

    const handleClosed = (payload = {}) => {
      const closedId = payload.orderId ?? payload.id;
      if (!closedId) return;
      if (String(closedId) !== String(idRef.current)) return;

      try {
        localStorage.removeItem("qr_active_order_id");
        localStorage.removeItem("qr_table");
        localStorage.removeItem("qr_orderType"); // <- camelCase (match QrMenu)
        localStorage.removeItem("qr_cart");
      } catch {}
      onResetToTypePicker?.();
    };

    socket.on("order_closed", handleClosed);
    return () => socket.off("order_closed", handleClosed);
  }, [onResetToTypePicker]);

// --- Fallback polling (if socket is blocked) ---
useEffect(() => {
  if (!orderId) return;

  const timer = setInterval(async () => {
    try {
      const order = await secureFetch(`/orders/${orderId}`, {
        headers: { Accept: "application/json" },
      });
      const status = (order?.status || "").toLowerCase();
      if (["closed", "completed", "paid", "delivered", "canceled", "cancelled"].includes(status)) {
        try {
          localStorage.removeItem("qr_active_order_id");
          localStorage.removeItem("qr_table");
          localStorage.removeItem("qr_orderType"); // <- camelCase
          localStorage.removeItem("qr_cart");
        } catch {}
        onResetToTypePicker?.();
      }
    } catch (err) {
      const status = err?.details?.status;
      if (status === 404) {
        try {
          localStorage.removeItem("qr_active_order_id");
          localStorage.removeItem("qr_table");
          localStorage.removeItem("qr_orderType"); // <- camelCase
          localStorage.removeItem("qr_cart");
        } catch {}
        onResetToTypePicker?.();
      }
      // network/HTML error → ignore one tick; next poll will retry
    }
  }, 10000);

  return () => clearInterval(timer);
}, [orderId, onResetToTypePicker]);

}
