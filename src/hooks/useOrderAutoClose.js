import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "";
let socket;

export default function useOrderAutoClose(orderId, onResetToTypePicker) {
  const idRef = useRef(orderId);
  useEffect(() => { idRef.current = orderId; }, [orderId]);

  // --- Socket listener ---
  useEffect(() => {
    if (!socket) socket = io(API_URL, { transports: ["websocket"] });

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
      const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
        headers: { Accept: "application/json" },
      });

      // If order is gone (404) or any non-OK, don't try to parse JSON
      if (!res.ok) {
        if (res.status === 404) {
          try {
            localStorage.removeItem("qr_active_order_id");
            localStorage.removeItem("qr_table");
            localStorage.removeItem("qr_orderType"); // <- camelCase
            localStorage.removeItem("qr_cart");
          } catch {}
          onResetToTypePicker?.();
        }
        return;
      }

      const order = await res.json();
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
    } catch {
      // network/HTML error → ignore one tick; next poll will retry
    }
  }, 10000);

  return () => clearInterval(timer);
}, [orderId, onResetToTypePicker]);

}
