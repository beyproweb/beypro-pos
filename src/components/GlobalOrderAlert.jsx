// src/components/GlobalOrderAlert.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from "react";
import { toast } from "react-toastify";
import secureFetch from "../utils/secureFetch";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import socket, { joinRestaurantRoom } from "../utils/socket";
import {
  defaultReceiptLayout,
  renderReceiptText,
  printViaBridge,
  setReceiptLayout,
} from "../utils/receiptPrinter";

/* ------------------------------------------
 * Helpers: sounds, cooldowns, defaults
 * ------------------------------------------ */
const DEFAULT_SOUNDS = {
  new_order: "new_order.mp3",
  order_preparing: "prepare.mp3",
  order_ready: "chime.mp3",
  order_delivered: "success.mp3",
  payment_made: "cash.mp3",
  stock_low: "warning.mp3",
  stock_restocked: "pop.mp3",
  driver_assigned: "horn.mp3",
  stock_expiry: "alarm.mp3",
};

const DEFAULT_NOTIFICATIONS = {
  enabled: true,
  defaultSound: "ding.mp3",
  eventSounds: { ...DEFAULT_SOUNDS },
  enableToasts: true,
  enableSounds: true,
  volume: 0.8,
};

const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".ogg"];

const clampVolume = (value, fallback = 1) => {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
};

const normalizeSoundConfig = (value) => {
  if (value === undefined || value === null) return { src: null, explicit: false };
  const trimmed = String(value).trim();
  if (!trimmed) return { src: null, explicit: false };

  const lowered = trimmed.toLowerCase();
  if (lowered === "none" || lowered === "off" || lowered === "silent") {
    return { src: null, explicit: true };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { src: trimmed, explicit: true };
  }

  let candidate = trimmed.replace(/^(\.\/|\.{2}\/)+/, "");
  const hasKnownExtension = SUPPORTED_EXTENSIONS.some((ext) =>
    candidate.toLowerCase().endsWith(ext)
  );

  if (!hasKnownExtension) candidate += ".mp3";

  if (candidate.startsWith("/")) return { src: candidate, explicit: true };
  if (candidate.startsWith("sounds/")) return { src: `/${candidate}`, explicit: true };
  return { src: `/sounds/${candidate}`, explicit: true };
};

const cooldownMillis = {
  new_order: 4000,
  order_preparing: 3000,
  order_ready: 3000,
  order_delivered: 3000,
  payment_made: 2500,
  stock_low: 8000,
  stock_restocked: 6000,
  driver_assigned: 2500,
};

function shouldPrintNow(orderId, windowMs = 10000) {
  if (!orderId) return false;
  const key = String(orderId);
  const now = Date.now();
  if (!window.__beyproPrinted) window.__beyproPrinted = {};
  if (now - (window.__beyproPrinted[key] || 0) < windowMs) return false;
  window.__beyproPrinted[key] = now;
  return true;
}

/* ------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------ */
export default function GlobalOrderAlert() {
  const [notif, setNotif] = useState(DEFAULT_NOTIFICATIONS);
  const [layout, setLayout] = useState(defaultReceiptLayout);
  const hasBridge = typeof window !== "undefined" && !!window.beypro;
  const tenantId =
    typeof window !== "undefined" ? window.localStorage.getItem("restaurant_id") : null;
  const layoutBroadcastKey = tenantId
    ? `beypro_receipt_layout_update_${tenantId}`
    : "beypro_receipt_layout_update";

  const audioRefs = useRef({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundQueue, setSoundQueue] = useState([]);
  const soundPlayingRef = useRef(false);
  const lastSoundAtRef = useRef({});

  const eventKeys = useMemo(
    () => [
      "new_order",
      "order_preparing",
      "order_ready",
      "order_delivered",
      "payment_made",
      "stock_low",
      "stock_restocked",
      "driver_assigned",
      "stock_expiry",
    ],
    []
  );

  const alertEventKeyMap = {
    stock_low: "stock_low",
    stock_restocked: "stock_restocked",
    stock_expiry: "stock_expiry",
  };

  const resolveSoundSrc = useCallback(
    (key) => {
      const attempts = [
        notif?.eventSounds?.[key],
        DEFAULT_SOUNDS[key],
        notif?.defaultSound,
        DEFAULT_NOTIFICATIONS.defaultSound,
      ];

      for (const candidate of attempts) {
        const { src, explicit } = normalizeSoundConfig(candidate);
        if (explicit && !src) return null;
        if (src) return src;
      }
      return null;
    },
    [notif]
  );

  useEffect(() => {
    setReceiptLayout(layout);
  }, [layout]);

  /* Auto rejoin socket room */
  useEffect(() => {
    const handleConnect = () => {
      joinRestaurantRoom();
      console.log("[SOCKET] 🎯 Ensured restaurant room join from GlobalOrderAlert");
    };
    socket.on("connect", handleConnect);
    return () => socket.off("connect", handleConnect);
  }, []);

  /* Unlock browser audio */
  useEffect(() => {
    const unlock = () => {
      document.querySelectorAll("audio").forEach((a) => {
        a.play().catch(() => {});
        a.pause();
        a.currentTime = 0;
      });
      setAudioUnlocked(true);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  /* Sequential sound queue playback */
  useEffect(() => {
    if (!notif.enabled) {
      if (soundQueue.length) {
        console.log(
          "[Notifications] Sound queue present but notifications disabled; dropping",
          soundQueue
        );
        setSoundQueue([]);
      }
      return;
    }
    if (!notif.enableSounds) {
      if (soundQueue.length) {
        console.log("[Notifications] Sounds disabled; clearing queue", soundQueue);
        setSoundQueue([]);
      }
      return;
    }
    if (!audioUnlocked) {
      if (soundQueue.length) {
        console.log(
          "[Notifications] Audio context locked; waiting for user gesture",
          soundQueue
        );
      }
      return;
    }
    if (soundPlayingRef.current) {
      return;
    }
    if (!soundQueue.length) return;

    const key = soundQueue[0];
    const now = Date.now();
    const cool = cooldownMillis[key] || 2000;
    const lastPlayAt = lastSoundAtRef.current[key] || 0;
    if (now - lastPlayAt < cool) {
      console.log(`[Notifications] Cooldown active for ${key}; skipping sound.`);
      setSoundQueue((q) => q.slice(1));
      return;
    }

    const resolvedSound = resolveSoundSrc(key);
    if (!resolvedSound) {
      console.log(
        `[Notifications] Resolved sound is empty for ${key}; removing from queue.`
      );
      setSoundQueue((q) => q.slice(1));
      return;
    }

    if (!audioRefs.current[key]) {
      audioRefs.current[key] = React.createRef();
    }
    const ref = audioRefs.current[key]?.current;
    if (!ref) {
      console.warn("[Notifications] Audio element missing for", key, "- skipping.");
      setSoundQueue((q) => q.slice(1));
      return;
    }

    const currentSrcAttr = ref.getAttribute("src");
    if (currentSrcAttr !== resolvedSound) {
      ref.setAttribute("src", resolvedSound);
    }
    ref.currentTime = 0;
    ref.volume = clampVolume(
      notif?.volume ?? DEFAULT_NOTIFICATIONS.volume ?? 1,
      DEFAULT_NOTIFICATIONS.volume ?? 1
    );

    console.log("[Notifications] Playing sound for", key, resolvedSound);
    soundPlayingRef.current = true;
    ref
      .play()
      .then(() => (lastSoundAtRef.current[key] = Date.now()))
      .catch((err) => {
        console.warn(
          `[Notifications] Playback failed for ${key}:`,
          err?.message || err
        );
      })
      .finally(() => {
        setTimeout(() => {
          soundPlayingRef.current = false;
          setSoundQueue((q) => q.slice(1));
        }, 250);
      });
  }, [
    soundQueue,
    notif.enabled,
    notif.enableSounds,
    audioUnlocked,
    resolveSoundSrc,
    notif.volume,
  ]);

  /* Load notification config */
  useEffect(() => {
    (async () => {
      try {
        const data = await secureFetch("/settings/notifications");
        if (!data) return;
        setNotif((prev) => ({
          ...prev,
          ...data,
          eventSounds: { ...DEFAULT_SOUNDS, ...(data.eventSounds || {}) },
        }));
      } catch (err) {
        console.warn("Notifications settings load failed:", err?.message || err);
      }
    })();
  }, []);

  /* ✅ Listen for settings changes (from NotificationsTab) */
  useEffect(() => {
    const handler = () => {
      const updated = window.notificationSettings;
      if (updated) {
        setNotif({
          ...DEFAULT_NOTIFICATIONS,
          ...updated,
          eventSounds: { ...DEFAULT_SOUNDS, ...(updated.eventSounds || {}) },
        });

        console.log("🔄 Notification settings refreshed in GlobalOrderAlert");
      }
    };
    window.addEventListener("notification_settings_updated", handler);
    return () => window.removeEventListener("notification_settings_updated", handler);
  }, []);

  /* Load printer layout */
  useEffect(() => {
    (async () => {
      try {
        const printer = await secureFetch("/printer-settings/sync");
        const nextLayout = printer?.settings?.layout || printer?.layout;
        if (nextLayout) setLayout((old) => ({ ...old, ...nextLayout }));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  /* Toast + sound helper */
  const notify = useCallback(
    (key, msg) => {
      if (!notif.enabled) {
        console.log(`[Notifications] Ignoring ${key}; notifications disabled.`);
        return;
      }

      const configuredSound = notif.eventSounds?.[key] ?? null;
      const resolvedSound = resolveSoundSrc(key);

      console.log("[Notifications] Event", {
        key,
        msg,
        toast: notif.enableToasts,
        soundsEnabled: notif.enableSounds,
        configuredSound,
        resolvedSound,
        audioUnlocked,
      });

      if (notif.enableToasts && msg) toast.info(msg);
      if (!notif.enableSounds) return;

      if (!resolvedSound) {
        console.log(`[Notifications] No resolved sound for ${key}; skipping audio playback.`);
        return;
      }

      setSoundQueue((q) => {
        const nextQueue = q.concat(key);
        console.log("[Notifications] Queue updated:", nextQueue);
        return nextQueue;
      });
    },
    [
      notif.enabled,
      notif.enableToasts,
      notif.enableSounds,
      notif.eventSounds,
      resolveSoundSrc,
      audioUnlocked,
    ]
  );


  useEffect(() => {
    const handleAlertEvent = (payload) => {
      if (!payload?.message) return;
      const key =
        alertEventKeyMap[payload.type] || alertEventKeyMap.stock_low || "stock_expiry";
      notify(key, payload.message);
    };

    socket.on("alert_event", handleAlertEvent);
    return () => socket.off("alert_event", handleAlertEvent);
  }, [notify]);


  /* Print helper */
  // Print preview helper
  function openNativePrintPreview(order) {
    if (!order) return;
    // Use the same logic as PrinterTabModern test print
    const layoutData = window.localStorage.getItem(layoutBroadcastKey);
    let customLayout = layout;
    if (layoutData) {
      try {
        const parsed = JSON.parse(layoutData);
        if (parsed?.layout) customLayout = { ...customLayout, ...parsed.layout };
      } catch {}
    }
    // Normalize items array from different API shapes
    const itemsRaw = order.items || order.order_items || order.items_list || order.itemsArray || [];
    const items = Array.isArray(itemsRaw)
      ? itemsRaw.map((it) => {
          // normalize extras (may be JSON string or array)
          let extras = it.extras || it.item_extras || it.extras_list || [];
          if (typeof extras === "string") {
            try {
              extras = JSON.parse(extras || "[]");
            } catch {
              extras = [];
            }
          }
          if (!Array.isArray(extras)) extras = [];
          extras = extras.map((ex) => ({
            name: ex.name || ex.extra_name || ex.product_name || String(ex).slice(0, 32),
            quantity: Number(ex.quantity ?? ex.qty ?? 1) || 1,
            price: Number(ex.price ?? ex.extraPrice ?? ex.unit_price ?? 0) || 0,
          }));

          return {
            name: it.name || it.item_name || it.product_name || it.product || "Item",
            quantity: Number(it.quantity ?? it.qty ?? it.count ?? 1) || 1,
            price: Number(it.price ?? it.unit_price ?? it.total_price ?? 0) || 0,
            extras,
            note: it.note || it.item_note || it.comment || it.notes || "",
          };
        })
      : [];
    const customLines = order.customLines || customLayout.customLines || [];
    const subTotal = items.reduce((sum, item) => sum + (item.quantity || 1) * (item.price || 0), 0);
    const taxAmount = customLayout.showTaxes ? (subTotal * (customLayout.taxRate || 0)) / 100 : 0;
    const discountAmount = customLayout.showDiscounts ? (subTotal * (customLayout.discountRate || 0)) / 100 : 0;
    const total = subTotal + taxAmount - discountAmount;
    const logoHtml = customLayout.showLogo && customLayout.logoUrl ? `<img src='${customLayout.logoUrl}' alt='Logo' style='display:block;margin:0 auto 12px;height:48px;max-width:100px;object-fit:contain;'/>` : '';
    const qrHtml = customLayout.showQr && customLayout.qrUrl && customLayout.qrUrl.match(/^https?:\/\/.*\.(png|jpg|jpeg)$/i)
      ? `<img src='${customLayout.qrUrl}' alt='QR' style='display:block;margin:12px auto 0;height:64px;width:64px;object-fit:contain;border-radius:12px;border:1px dashed #cbd5e1;background:#fff;'/>`
      : customLayout.showQr ? `<div style='height:64px;width:64px;margin:12px auto 0;background:#0f172a;border-radius:12px;'></div>` : '';
    const html = `
      <div style='width:280px;margin:0 auto;padding:16px;border-radius:16px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;font-size:${customLayout.itemFontSize}px;line-height:${customLayout.spacing};text-align:${customLayout.alignment};font-family:sans-serif;'>
        ${logoHtml}
        ${customLayout.showHeader ? `<div style='margin-bottom:8px;text-align:center;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#1e293b;'>${customLayout.headerTitle || ''}<div style='font-size:12px;font-weight:400;color:#64748b;'>${customLayout.headerSubtitle || ''}</div></div>` : ''}
        <div style='border-top:1px dashed #e2e8f0;border-bottom:1px dashed #e2e8f0;padding:8px 0;font-size:12px;'>
          ${items.map(item => {
            const main = `<div style='display:flex;justify-content:space-between;padding:4px 0;'><span>${item.quantity} × ${item.name}</span><span>${(item.price * item.quantity).toFixed(2)} ₺</span></div>`;
            const extrasHtml = (item.extras && item.extras.length)
              ? `<div style='padding-left:8px;font-size:11px;color:#64748b;margin-top:4px;'>${item.extras.map(ex => `<div style="display:flex;justify-content:space-between;"><span>+ ${ex.quantity}x ${ex.name}</span><span>${(ex.price * ex.quantity).toFixed(2)} ₺</span></div>`).join('')}</div>`
              : '';
            const noteHtml = item.note ? `<div style='padding-left:8px;font-size:11px;font-style:italic;color:#b45309;margin-top:4px;'>NOTE: ${item.note}</div>` : '';
            return main + extrasHtml + noteHtml;
          }).join('')}
        </div>
        <div style='margin-top:12px;font-size:12px;'>
          <div style='display:flex;justify-content:space-between;'><span>Subtotal</span><span>${subTotal.toFixed(2)} ₺</span></div>
          ${customLayout.showTaxes ? `<div style='display:flex;justify-content:space-between;color:#64748b;'><span>${customLayout.taxLabel || ''} (${customLayout.taxRate || 0}%)</span><span>${taxAmount.toFixed(2)} ₺</span></div>` : ''}
          ${customLayout.showDiscounts ? `<div style='display:flex;justify-content:space-between;color:#64748b;'><span>${customLayout.discountLabel || ''} (${customLayout.discountRate || 0}%)</span><span>-${discountAmount.toFixed(2)} ₺</span></div>` : ''}
          <div style='display:flex;justify-content:space-between;font-weight:600;'><span>Total</span><span>${total.toFixed(2)} ₺</span></div>
        </div>
        ${customLines && customLines.length ? `<div style='margin-top:12px;font-size:11px;color:#64748b;'>${customLines.map(line => `<div>${line}</div>`).join('')}</div>` : ''}
        ${qrHtml}
        ${customLayout.showQr && customLayout.qrText ? `<div style='font-size:10px;text-transform:uppercase;color:#64748b;margin-top:4px;'>${customLayout.qrText}</div>` : ''}
        ${customLayout.showQr && customLayout.qrUrl && !customLayout.qrUrl.match(/^https?:\/\/.*\.(png|jpg|jpeg)$/i) ? `<div style='font-size:8px;color:#94a3b8;'>${customLayout.qrUrl}</div>` : ''}
        ${customLayout.showFooter ? `<div style='margin-top:12px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.2em;color:#64748b;'>${customLayout.footerText || ''}</div>` : ''}
      </div>
    `;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Receipt Preview</title></head><body onload='window.print();'>${html}</body></html>`);
    printWindow.document.close();
  }

  const printOrder = useCallback(
    async (orderId) => {
      if (!orderId) return false;
      try {
        // Fetch full order with items (same as manual print)
        const order = await fetchOrderWithItems(orderId);
        if (!order?.id) return false;
        console.log("🖨️ Auto-printing order with items:", order.items?.length || 0);
        // If running in desktop (Electron) with bridge available, skip preview and print directly.
        if (!hasBridge) {
          // web: open native preview before printing
          openNativePrintPreview(order);
        }
        if (!shouldPrintNow(order.id)) return false;
        const ok = await printViaBridge("", order);
        if (!ok) toast.warn("🖨️ Printer job could not be queued");
        else toast.success(`🧾 Printed order #${order.id}`);
        return true;
      } catch (err) {
        console.error("Print fetch error:", err);
        return false;
      }
    },
    [layout]
  );

  /* 🖨️ Register remote print handler for socket events */
  useEffect(() => {
    window.__handleRemotePrint = async (printData) => {
      console.log("🖨️ [RemotePrint] Handling print request for order:", printData?.orderId);
      try {
        // If we have the order data directly, use it
        if (printData?.orderId && printData?.items) {
          // Create order object from print data
          const order = {
            id: printData.orderId,
            table_number: printData.tableNumber,
            total: printData.total,
            items: printData.items || [],
          };
          console.log("🖨️ [RemotePrint] Printing directly with received data");
          await printViaBridge("", order);
          toast.success(`🧾 Printed order #${printData.orderId} from phone app`);
        } else if (printData?.orderId) {
          // Fetch order with items
          console.log("🖨️ [RemotePrint] Fetching order details:", printData.orderId);
          await printOrder(printData.orderId);
        } else {
          console.warn("🖨️ [RemotePrint] Invalid print data:", printData);
        }
      } catch (err) {
        console.error("🖨️ [RemotePrint] Error:", err);
        toast.error("🖨️ Failed to print order from phone");
      }
    };

    return () => {
      window.__handleRemotePrint = null;
    };
  }, [printOrder]);

  /* SOCKET EVENTS (main trigger) */
  useEffect(() => {
    const onNewOrder = async (p) => {
      const id = p?.order?.id || p?.orderId || p?.id;
      notify("new_order", "🔔 New order received");
      if (id) await printOrder(id);
    };
    const onPreparing = () => notify("order_preparing", "👩‍🍳 Order set to preparing");
    const onReady = () => notify("order_ready", "✅ Order ready");
    const onDelivered = () => notify("order_delivered", "🚚 Order delivered");
const onPaid = (p) => {
  console.log("💰 [Socket] payment_made event received:", p);
  notify("payment_made", "💸 Payment made");
};
    const onStockLow = () => notify("stock_low", "⚠️ Stock critical");
    const onRestocked = () => notify("stock_restocked", "📦 Stock replenished");
    const onDriverAssigned = (payload = {}) => {
      const driverName = payload.driverName || "Driver";
      const orderSuffix = payload.orderId ? ` #${payload.orderId}` : "";
      notify(
        "driver_assigned",
        `🚗 ${driverName} assigned to order${orderSuffix}`
      );
    };

    socket.on("order_confirmed", onNewOrder);
    socket.on("order_preparing", onPreparing);
    socket.on("order_ready", onReady);
    socket.on("order_delivered", onDelivered);
    socket.on("payment_made", onPaid);
    socket.on("stock_critical", onStockLow);
    socket.on("stock_restocked", onRestocked);
    socket.on("driver_assigned", onDriverAssigned);

    return () => {
      socket.off("order_confirmed", onNewOrder);
      socket.off("order_preparing", onPreparing);
      socket.off("order_ready", onReady);
      socket.off("order_delivered", onDelivered);
      socket.off("payment_made", onPaid);
      socket.off("stock_critical", onStockLow);
      socket.off("stock_restocked", onRestocked);
      socket.off("driver_assigned", onDriverAssigned);
    };
  }, [notify, printOrder]);

  /* POLLING (fallback only if socket disconnected) */
  const prevSetRef = useRef({
    preparingIds: new Set(),
    kitchenIds: new Set(),
    orderIds: new Set(),
    stockIds: new Set(),
  });

  const pollAll = useCallback(async () => {
    if (socket.connected) return; // 🔇 disable when socket alive
    const endpoints = [
      { key: "order_preparing", path: "/order-items/preparing", field: "preparingIds" },
      { key: "order_ready", path: "/kitchen-orders", field: "kitchenIds" },
      { key: "order_delivered", path: "/orders?status=delivered", field: "orderIds" },
      { key: "stock_low", path: "/stock/critical", field: "stockIds" },
    ];

    for (const ep of endpoints) {
      try {
        const data = await secureFetch(ep.path);
        if (!Array.isArray(data)) continue;
        const fresh = new Set(data.map((r) => r.id || r.item_id || r.order_id).filter(Boolean));
        const prev = prevSetRef.current[ep.field] || new Set();
        let newCount = 0;
        for (const id of fresh) if (!prev.has(id)) newCount++;
        if (newCount > 0)
          console.debug(`[poll] ${ep.key} new items (${newCount}) - socket offline`);
        prevSetRef.current[ep.field] = fresh;
      } catch (err) {
        console.debug("Poll error:", ep.path, err?.message || err);
      }
    }
  }, []);

  useEffect(() => {
    pollAll();
    const int = setInterval(pollAll, 12000);
    return () => clearInterval(int);
  }, [pollAll]);

  /* STOCK WATCHER (disabled when socket online) */
  const lastQtyRef = useRef({});
  const watchStockChanges = useCallback(async () => {
    if (socket.connected) return; // 🔇 skip duplicate
    try {
      const rows = await secureFetch("/stock");
      if (!Array.isArray(rows)) return;
      for (const r of rows) {
        const id = r.id || r.item_id;
        if (!id) continue;
        const prevQty = lastQtyRef.current[id];
        const q = Number(r.qty ?? 0);
        const min = Number(r.min_qty ?? 0);
        if (typeof prevQty === "number") {
          if (prevQty >= min && q < min)
            console.debug(`[watchStock] ${r.name} low (socket offline)`);
          if (prevQty < min && q >= min)
            console.debug(`[watchStock] ${r.name} restocked (socket offline)`);
        }
        lastQtyRef.current[id] = q;
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    watchStockChanges();
    const int = setInterval(watchStockChanges, 20000);
    return () => clearInterval(int);
  }, [watchStockChanges]);

  /* Render hidden audio tags */
  return (
    <Fragment>
      {eventKeys.map((key) => {
        const src = resolveSoundSrc(key);
        if (!src) return null;
        if (!audioRefs.current[key]) {
          audioRefs.current[key] = React.createRef();
        }
        return (
          <audio
            key={key}
            ref={audioRefs.current[key]}
            src={src}
            preload="auto"
          />
        );
      })}
    </Fragment>
  );
}
