// src/components/GlobalOrderAlert.jsx

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
const API_URL = (import.meta.env.VITE_API_URL || "https://hurrypos-backend.onrender.com").replace(/\/+$/, "");import { useSetting } from "../components/hooks/useSetting";
import { toast } from "react-toastify";
import socket from "../utils/socket"; // ✅ Use shared socket!
import { publicPath, soundFileUrl } from '../utils/publicPath'; // adjust path if this file is deeper

// Receipt print logic (from PrinterTab, can be shared)
const defaultLayout = {
  fontSize: 14,
  lineHeight: 1.3,
  showLogo: true,
  showQr: true,
  showHeader: true,
  showFooter: true,
  headerText: "Beypro POS - HurryBey",
  footerText: "Thank you for your order! / Teşekkürler!",
  alignment: "left",
  shopAddress: "Your Shop Address\n123 Street Name, İzmir",
  extras: [
    { label: "Instagram", value: "@yourshop" },
    { label: "Tax No", value: "1234567890" },
  ],
  showPacketCustomerInfo: true,
  receiptWidth: "58mm",
  receiptHeight: "",
};



// Render a simple text receipt for ESC/POS (fits 58mm, monospaced)
function renderReceiptText(order, layout = defaultLayout) {
  const allItems =
    order.suborders && Array.isArray(order.suborders) && order.suborders.length
      ? order.suborders.flatMap((so) => so.items || [])
      : order.items || [];

  const lines = [];
  const title = (layout.showHeader ? layout.headerText : "Beypro POS");
  lines.push(title);
  lines.push((layout.shopAddress || "").split("\n").join(" "));
  lines.push(new Date(order.created_at || Date.now()).toLocaleString());
  lines.push(`Order #${order.id}`);
  if (layout.showPacketCustomerInfo && (order.customer || order.customer_name)) {
    lines.push(`Cust: ${order.customer || order.customer_name}`);
    if (order.customer_phone) lines.push(`Phone: ${order.customer_phone}`);
    if (order.address || order.customer_address)
      lines.push(`Addr: ${(order.address || order.customer_address).replace(/\s+/g, " ")}`);
  }
  lines.push("--------------------------------");

  let grand = 0;
  for (const it of allItems) {
    const name = it.name || it.product_name || "Item";
    const qty = parseInt(it.qty || it.quantity || 1);
    const price = parseFloat(it.price || 0);
    grand += qty * price;

    lines.push(`${qty} x ${name}  ${price.toFixed(2)}`);
    if (Array.isArray(it.extras)) {
      for (const ex of it.extras) {
        const exQty = parseInt(ex.qty || ex.quantity || 1);
        const exPrice = parseFloat(ex.price || 0);
        grand += qty * exQty * exPrice;
        const nm = ex.name || ex.label || "extra";
        lines.push(`  + ${exQty} x ${nm}  ${(qty * exQty * exPrice).toFixed(2)}`);
      }
    }
    if (it.note) lines.push(`  📝 ${it.note}`);
  }

  lines.push("--------------------------------");
  lines.push(`TOTAL: ${grand.toFixed(2)} TL`);
  const pay = order.payment || order.payment_method || "";
  if (pay) lines.push(`PAYMENT: ${pay}`);
  if (layout.showFooter && layout.footerText) {
    lines.push("--------------------------------");
    lines.push(layout.footerText);
  }
  // Feed & space for cut
  lines.push("");
  lines.push("");
  return lines.join("\n");
}



// NEW: kiosk-friendly + LAN printing (de-dupe handled by shouldPrintNow)
function autoPrintReceipt(order, layout = defaultLayout) {
  try {
    const mode = localStorage.getItem("printingMode") || "standard";

    if (mode === "lan") {
      const host = localStorage.getItem("lanPrinterHost");
      const port = parseInt(localStorage.getItem("lanPrinterPort") || "9100", 10);
      if (!host) {
        console.warn("🖨️ [GLOBAL] LAN mode selected but no printer IP set");
        return;
      }
      const text = renderReceiptText(order, layout);
       const bridge = (localStorage.getItem("lanBridgeUrl") || "http://127.0.0.1:7777").replace(/\/+$/,"");
      fetch(`${bridge}/print-raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port, content: text }),
      })
        .then(async (r) => {
          const ct = r.headers.get("content-type") || "";
          if (!r.ok) {
            let msg = `LAN print failed (HTTP ${r.status})`;
            if (ct.includes("application/json")) {
              const j = await r.json().catch(() => null);
              if (j && j.error) msg += ` - ${j.error}`;
            } else {
              const t = await r.text().catch(() => "");
              if (t) msg += ` - ${t.slice(0, 160)}`;
            }
            throw new Error(msg);
          }
          console.log("🖨️ [GLOBAL] LAN print sent to", `${host}:${port}`, "via", bridge);
        })
        .catch((e) => console.warn("🖨️ [GLOBAL] LAN print error:", e.message || e));
      return;


    }

    const html = renderReceiptHTML(order, layout);

    if (mode === "kiosk") {
      // Hidden iframe path works best with Chrome --kiosk-printing (no dialog)
      iframeSilentPrint(html);
      return;
    }

    // Standard: show popup (user can Cancel/OK)
    systemPrint(html);
  } catch (err) {
    console.warn("🖨️ [GLOBAL] autoPrintReceipt failed:", err);
  }
}


// Popup print with a small window (shows dialog unless kiosk flag is set)
function popupPrint(html) {
  const win = window.open("", "BeyproPrint", "width=420,height=640");
  if (win && win.document) {
    win.document.write(`
      <html>
        <head>
          <title>Print</title>
          <meta charset="utf-8" />
          <style>@media print { body { margin:0; } } body{font-family:monospace}</style>
        </head>
        <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print(); // with --kiosk-printing this is silent
      setTimeout(() => win.close(), 300);
    }, 300);
    return;
  }
  // Fallback to iframe if popup blocked
  iframeSilentPrint(html);
}

// Hidden iframe print (best for kiosk silent)
function iframeSilentPrint(html) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Print</title>
        <meta charset="utf-8" />
        <style>@media print { body { margin:0; } } body{font-family:monospace}</style>
      </head>
      <body>${html}</body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print(); // with --kiosk-printing this is silent
    setTimeout(() => document.body.removeChild(iframe), 800);
  }, 300);
}






// System dialog popup/iframe fallback
function systemPrint(html) {
  // Try popup first
  const win = window.open("", "PrintWindow", "width=400,height=600");
  if (win && win.document) {
    win.document.write(`
      <html>
        <head>
          <title>Auto Print Order</title>
          <style>
            @media print { body { margin: 0; background: #fff; } }
            body { font-family: monospace; background: #fff; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 400);
    return;
  }

  // Fallback: hidden iframe if popup blocked
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <html>
      <head>
        <title>Auto Print Order</title>
        <style>
          @media print { body { margin: 0; background: #fff; } }
          body { font-family: monospace; background: #fff; }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 800);
  }, 400);
}


// Global de-dupe: ensure we print a given order only once in a short window
function shouldPrintNow(orderId, windowMs = 10000) {
  if (!orderId) return false;
  const key = String(orderId);
  const now = Date.now();

  if (!window.__beyproPrinted) window.__beyproPrinted = {};
  const last = window.__beyproPrinted[key] || 0;

  if (now - last < windowMs) {
    console.warn(`[PRINT DE-DUPE] Skipping duplicate print for order ${orderId}`);
    return false;
  }

  window.__beyproPrinted[key] = now;
  return true;
}


export default function GlobalOrderAlert() {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(null);

  const previousIds = useRef({});
  const previousStockQty = useRef({});
  const lastCooldownAt = useRef({});
  const soundRefs = useRef({});
  const [soundQueue, setSoundQueue] = useState([]);
  const soundPlayingRef = useRef(false);
  const debounceRef = useRef(null);
  // 🔄 Receipt Layout
  const [layout, setLayout] = useState(defaultLayout);

  // Load layout from backend if needed
  useEffect(() => {
    fetch(`${API_URL}/api/printer-settings/1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.layout) setLayout(data.layout);
      })
      .catch(() => {});
  }, []);

  const enqueueSound = useCallback((key) => {
    setSoundQueue((q) => (q.includes(key) ? q : [...q, key]));
  }, []);

  const eventKeys = useMemo(
    () => [
      "new_order",
      "order_preparing",
      "order_ready",
      "order_delivered",
      "payment_made",
      "stock_low",
      "stock_restocked",
      "order_delayed",
      "driver_arrived",
      "yemeksepeti_order",
    ],
    []
  );

  const defaultEventSounds = {
    new_order: "new_order.mp3",
    order_preparing: "pop.mp3",
    order_ready: "chime.mp3",
    order_delivered: "success.mp3",
    payment_made: "cash.mp3",
    stock_low: "warning.mp3",
    stock_restocked: "ding.mp3",
    order_delayed: "alarm.mp3",
    driver_arrived: "horn.mp3",
    yemeksepeti_order: "yemeksepeti.mp3",
  };

  const defaultConfig = {
    enabled: true,
    defaultSound: "ding.mp3",
    channels: { kitchen: "app", cashier: "app", manager: "app" },
    escalation: { enabled: true, delayMinutes: 3 },
    eventSounds: defaultEventSounds,
  };

  // 🧠 Load notification settings
  useEffect(() => {
    let active = true;
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/notifications`);
        const json = await res.json();
        if (!active) return;

        const merged = {
          ...defaultConfig,
          ...json,
          eventSounds: {
            ...defaultEventSounds,
            ...(json?.eventSounds || {}),
          },
        };
        setNotificationSettings(merged);
      } catch (err) {
        console.warn("⚠️ Failed to load notifications", err);
        setNotificationSettings(defaultConfig);
      }
    };

    fetchSettings();
    window.addEventListener("notification_settings_updated", fetchSettings);
    return () => {
      active = false;
      window.removeEventListener("notification_settings_updated", fetchSettings);
    };
  }, []);

  // 🔊 Create audio refs
  useEffect(() => {
    eventKeys.forEach((key) => {
      if (!soundRefs.current[key]) {
        soundRefs.current[key] = React.createRef();
      }
    });
  }, [eventKeys]);

  // 🔓 Unlock audio on interaction
  useEffect(() => {
    const unlock = () => {
      document.querySelectorAll("audio").forEach((el) => {
        el.play().catch(() => {});
        el.pause();
        el.currentTime = 0;
      });
      setAudioUnlocked(true);
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Manual trigger handler
  useEffect(() => {
    const soundHandler = (e) => {
      enqueueSound(e.detail.key);
    };
    window.addEventListener("play_sound", soundHandler);
    const yemeksepetiHandler = () => enqueueSound("yemeksepeti_order");

    socket.on("yemeksepeti_order", yemeksepetiHandler);

    return () => {
      socket.off("yemeksepeti_order", yemeksepetiHandler);
    };
  }, [enqueueSound]);

  // 🔁 Polling checks
  const pollingChecks = useMemo(
    () => [
      {
        key: "order_preparing",
        endpoint: `${API_URL}/api/order-items/preparing`,
        extractIds: (data) => data,
      },
      {
        key: "order_ready",
        endpoint: `${API_URL}/api/kitchen-orders`,
        extractIds: (data) =>
          data.filter((i) => i.kitchen_status === "ready").map((i) => i.item_id),
      },
      {
        key: "order_delivered",
        endpoint: `${API_URL}/api/orders`,
        extractIds: (data) => data.filter((o) => o.status === "delivered").map((o) => o.id),
      },
      {
        key: "payment_made",
        endpoint: `${API_URL}/api/orders`,
        extractIds: (data) => data.filter((o) => o.is_paid).map((o) => o.id),
      },
      {
        key: "stock_low",
        endpoint: `${API_URL}/api/stock`,
        extractIds: (data) => {
          const criticalNow = [];
          data.forEach((item) => {
            const prevQty = previousStockQty.current[item.id];
            if (item.qty <= item.critical_qty) {
              if (prevQty === undefined || prevQty > item.critical_qty) {
                criticalNow.push(item.id);
              }
            }
            previousStockQty.current[item.id] = item.qty;
          });
          return criticalNow;
        },
      },
      {
        key: "stock_restocked",
        endpoint: `${API_URL}/api/stock`,
        extractIds: (data) => {
          const restocked = [];
          data.forEach((item) => {
            const prevQty = previousStockQty.current[item.id] || 0;
            if (item.qty > prevQty) {
              restocked.push(item.id);
            }
            previousStockQty.current[item.id] = item.qty;
          });
          return restocked;
        },
      },
      {
        key: "order_delayed",
        endpoint: `${API_URL}/api/orders`,
        extractIds: (data) => {
          const now = Date.now();
          return data
            .filter(
              (o) =>
                o.expected_time &&
                new Date(o.expected_time).getTime() < now &&
                !["delivered", "closed"].includes(o.status)
            )
            .map((o) => o.id);
        },
      },
      {
        key: "driver_arrived",
        endpoint: `${API_URL}/api/orders`,
        extractIds: (data) =>
          data.filter((o) => o.driver_status === "delivered").map((o) => o.id),
      },
    ],
    [API_URL]
  );

  // 🧠 Polling runner
  const pollAll = useCallback(async () => {
    for (const check of pollingChecks) {
      try {
        const res = await fetch(check.endpoint);
        const raw = await res.json();
        const ids = check.extractIds(raw);

        if (check.key === "stock_restocked" && ids.length) {
          enqueueSound(check.key);
          continue;
        }

        const prevSet = previousIds.current[check.key];
        if (!prevSet) {
          previousIds.current[check.key] = new Set(ids);
        } else {
          const newly = ids.filter((id) => !prevSet.has(id));
          if (newly.length) {
            if (check.key === "stock_low") {
              if (!notificationSettings?.stockAlert?.enabled) {
                previousIds.current[check.key] = new Set(ids);
                continue;
              }

              const itemCount = newly.length;
              const msg =
                itemCount === 1
                  ? "🧂 Stock Low item detected!"
                  : `🧂 ${itemCount} items low in stock`;

              const now = Date.now();
              const cooldownMs =
                (notificationSettings.stockAlert.cooldownMinutes ?? 10) * 60 * 1000;
              const last = lastCooldownAt.current[msg] || 0;

              if (now - last >= cooldownMs) {
                lastCooldownAt.current[msg] = now;

                toast.warn(`📢 ${msg}`, {
                  position: "top-right",
                  autoClose: 5000,
                  closeOnClick: true,
                  pauseOnHover: true,
                  pauseOnFocusLoss: false,
                  draggable: true,
                });

                enqueueSound("stock_low");
              }
            } else {
              enqueueSound(check.key);
            }
          }
          previousIds.current[check.key] = new Set(ids);
        }
      } catch (err) {
        console.warn(`⚠️ Polling failed for ${check.key}`, err);
      }
    }
  }, [pollingChecks, enqueueSound, notificationSettings]);

  async function handleOrderConfirmed(payload) {
  // Read toggles at event time
  const autoPrintTable = localStorage.getItem("autoPrintTable") === "true";
  const autoPrintPacket = localStorage.getItem("autoPrintPacket") === "true";

  // If server already gave us the full order with items, print immediately
// If server already sent the full order, print directly (no fetch) — ONLY if items exist
if (payload?.order && Array.isArray(payload.order.items) && payload.order.items.length > 0) {
  const order = {
    id: payload.order.id ?? payload.id,
    ...payload.order,
  };

  // de-dupe: only print this order once per short window
  if (shouldPrintNow(order.id)) {
    if (
      (order.order_type === "table" && autoPrintTable) ||
      ((order.order_type === "phone" || order.order_type === "packet") && autoPrintPacket)
    ) {
      enqueueSound("new_order");
      autoPrintReceipt(order, layout);
    }
  }
  return; // ok to return, since we successfully handled an order with items
}


  // Otherwise, resolve a numeric id from various shapes and fetch with retry
  const candidates = [payload?.orderId, payload?.id, payload?.order?.id, payload?.number];
  const orderId = candidates.map(Number).find(Number.isFinite);

  if (!Number.isFinite(orderId)) {
    console.warn("[GLOBAL] Could not determine order id from payload:", payload);
    return;
  }

  const fetchById = async (id) => {
    const res = await fetch(`${API_URL}/api/orders/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const maxAttempts = 10;
  const baseDelay = 400;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const order = await fetchById(orderId);

      // Ensure items are present before printing (handle eventual consistency)
      if (!order.items || order.items.length === 0) {
        if (attempt < maxAttempts) throw new Error(`No items yet (attempt ${attempt})`);
        // Final attempt — still empty, skip printing to avoid blank receipt
        console.warn(`[GLOBAL] Order ${orderId} still empty after retries, skipping print.`);
        return;
      }

    if (shouldPrintNow(order.id)) {
  if (
    (order.order_type === "table" && autoPrintTable) ||
    ((order.order_type === "phone" || order.order_type === "packet") && autoPrintPacket)
  ) {
    enqueueSound("new_order");
    autoPrintReceipt(order, layout);
  }
}
return; // success

    } catch (e) {
      lastErr = e;
      const jitter = Math.floor(Math.random() * 150);
      const delay = baseDelay * attempt + jitter;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error(`[GLOBAL] Failed to fetch order after retries:`, lastErr);
}

// Watch for order_confirmed (robust payload + retry + print)
useEffect(() => {
  const handler = (payload) => {
    // Small delay to let DB commits settle, then handle
    setTimeout(() => {
      handleOrderConfirmed(payload).catch((e) =>
        console.error("[GLOBAL] onOrderConfirmed fatal:", e)
      );
    }, 200);
  };

  socket.on("order_confirmed", handler);
  return () => socket.off("order_confirmed", handler);
}, [layout, enqueueSound]);


  // 🔌 Other socket listeners + polling
  useEffect(() => {
    let interval;

    // Define named handlers
    const ordersUpdatedHandler = () => pollAll();
    const orderReadyHandler = () => enqueueSound("order_ready");
    const orderDeliveredHandler = () => enqueueSound("order_delivered");
    const alertHandler = ({ message }) => {
      if (!message.startsWith("🧂")) return;
      const now = Date.now();
      const cooldownMs =
        (notificationSettings?.stockAlert?.cooldownMinutes ?? 10) * 60 * 1000;
      const last = lastCooldownAt.current[message] || 0;
      if (now - last < cooldownMs) return;
      lastCooldownAt.current[message] = now;
      enqueueSound("stock_low");
    };

    // Attach handlers
    socket.on("orders_updated", ordersUpdatedHandler);
    socket.on("order_ready", orderReadyHandler);
    socket.on("order_delivered", orderDeliveredHandler);
    socket.on("alert_event", alertHandler);

    // Polling
    pollAll();
    interval = setInterval(() => {
      if (document.visibilityState === "visible") pollAll();
    }, 15000);

    return () => {
      socket.off("orders_updated", ordersUpdatedHandler);
      socket.off("order_ready", orderReadyHandler);
      socket.off("order_delivered", orderDeliveredHandler);
      socket.off("alert_event", alertHandler);
      clearInterval(interval);
    };
  }, [pollAll, enqueueSound, notificationSettings]);

  // 🔈 Sound queue playback
  useEffect(() => {
    if (!audioUnlocked || soundPlayingRef.current || !soundQueue.length) return;

    const key = soundQueue[0];
    const ref = soundRefs.current[key];
    const soundName =
      notificationSettings.eventSounds[key] || notificationSettings.defaultSound;

    if (soundName === "none") {
      setSoundQueue((q) => q.slice(1));
      return;
    }

    if (ref?.current) {
      soundPlayingRef.current = true;
      const audioEl = ref.current;
      audioEl.pause();
      audioEl.currentTime = 0;

      audioEl
        .play()
        .then(() =>
          setTimeout(() => {
            soundPlayingRef.current = false;
            setSoundQueue((q) => q.slice(1));
          }, 500)
        )
        .catch(() => {
          soundPlayingRef.current = false;
          setSoundQueue((q) => q.slice(1));
        });
    } else {
      setSoundQueue((q) => q.slice(1));
    }
  }, [soundQueue, notificationSettings, audioUnlocked]);

return (
  <>
    {notificationSettings
      ? eventKeys.map((key) => {
          const soundName =
            notificationSettings.eventSounds[key] ||
            notificationSettings.defaultSound;

          // Build a safe, relative URL that works in web + Electron
          const src =
            soundName && soundName !== "none" ? soundFileUrl(soundName) : "";

          return (
            <audio
              key={`${key}-${soundName}-${notificationSettings?.volume}`}
              ref={soundRefs.current[key]}
              src={src}
              preload="auto"
            />
          );
        })
      : null}
  </>
);

}
