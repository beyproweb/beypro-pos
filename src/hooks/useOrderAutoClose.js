// src/hooks/useOrderAutoClose.js
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "";
let socket;

/**
 * Auto-resets the QR flow back to the order type selection when the order closes.
 *
 * @param {string|number|null} orderId
 * @param {Function} onResetToTypePicker - callback that navigates to the type picker
 * @param {Object} opts
 * @param {string[]} [opts.closedStatuses=["closed","paid","cancelled"]] - statuses treated as closed
 * @param {number} [opts.pollMs=10000] - polling interval ms
 */
export default function useOrderAutoClose(orderId, onResetToTypePicker, opts = {}) {
  const idRef = useRef(orderId);
  const doneRef = useRef(false);

  const closedStatuses =
    opts.closedStatuses || ["closed", "paid", "cancelled"];

  useEffect(() => {
    idRef.current = orderId;
  }, [orderId]);

  const resetClient = () => {
    if (doneRef.current) return;
    doneRef.current = true;

    // Defensive clear: handle both legacy and current key names
    try {
      const keys = [
        "qr_active_order_id",
        "qr_active_order",
        "qr_table",
        "qr_order_type",
        "qr_orderType",
        "qr_cart",
        "qr_show_status",
      ];
      for (const k of keys) {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    } catch {}

    try {
      onResetToTypePicker?.();
    } catch {}
  };

  // --- Socket listener for immediate close events ---
  useEffect(() => {
    if (!socket) {
      try {
        socket = io(API_URL, { transports: ["websocket"] });
      } catch {
        // ignore if socket fails; polling fallback below will handle it
      }
    }
    if (!socket) return;

    const handleClosed = (payload = {}) => {
      const target = String(idRef.current ?? "");
      if (!target) return;

      const { orderId: oid, id, orderIds } = payload;

      if (oid != null && String(oid) === target) return resetClient();
      if (id != null && String(id) === target) return resetClient();
      if (Array.isArray(orderIds) && orderIds.map(String).includes(target)) {
        return resetClient();
      }
    };

    socket.on("order_closed", handleClosed);
    return () => socket.off("order_closed", handleClosed);
  }, [onResetToTypePicker]);

  // --- Polling fallback (works even if sockets are blocked) ---
  useEffect(() => {
    if (!orderId) return;

    const controller = new AbortController();

    const tick = async () => {
      if (doneRef.current) return;
      try {
        const res = await fetch(`${API_URL}/api/orders/${orderId}`, {
          signal: controller.signal,
          credentials: "include",
        });

        // If the order disappears, treat as closed
        if (res.status === 404) return resetClient();
        if (!res.ok) return;

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return;

        const order = await res.json();
        const st = String(order?.status || "").toLowerCase();
        const paidFlag =
          !!order?.is_paid ||
          order?.payment_status === "paid" ||
          order?.paid === true;

        if (closedStatuses.includes(st) || paidFlag) {
          return resetClient();
        }
      } catch {
        // ignore network/abort errors
      }
    };

    // run once immediately, then every pollMs
    tick();
    const timer = setInterval(tick, opts.pollMs ?? 10000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [orderId, opts.pollMs]);
}
