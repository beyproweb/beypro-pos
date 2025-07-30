// src/components/GlobalOrderAlert.jsx

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
const API_URL = import.meta.env.VITE_API_URL || "";
import { useSetting } from "../components/hooks/useSetting";
import { toast } from "react-toastify";
import socket from "../utils/socket"; // ✅ Use shared socket!
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

function renderReceiptHTML(order, layout = defaultLayout) {
  // 1. Gather all items (including suborders)
  const allItems =
    order.suborders && Array.isArray(order.suborders) && order.suborders.length
      ? order.suborders.flatMap((so) => so.items || [])
      : order.items || [];

  // 2. Calculate grand total with correct extras qty logic
  const calculateGrandTotal = (items) => {
    let total = 0;
    items.forEach((item) => {
      const qty = parseInt(item.qty || item.quantity || 1);
      const itemTotal = parseFloat(item.price) * qty;
      const extrasTotal = (item.extras || []).reduce((sum, ex) => {
        const extraQty = parseInt(ex.qty || ex.quantity || 1);
        return sum + (qty * extraQty * parseFloat(ex.price || 0));
      }, 0);
      total += itemTotal + extrasTotal;
    });
    return total.toFixed(2);
  };

  const grandTotal = calculateGrandTotal(allItems);

  // 3. Build receipt HTML
  return `
    <div style="font-size:${layout.fontSize}px;line-height:${layout.lineHeight};text-align:${layout.alignment};font-family:monospace;width:${
      layout.receiptWidth === "custom"
        ? layout.customReceiptWidth || "70mm"
        : layout.receiptWidth
    };min-height:${layout.receiptHeight || 400}px;">
      ${layout.showLogo ? `<div style="text-align:center;"><img src='/logo192.png' alt="Logo" style="height:40px;"/></div>` : ""}
      ${layout.showHeader ? `<div style="font-weight:bold;font-size:16px;">${layout.headerText}</div>` : ""}
      <div style="font-size:11px;white-space:pre-line">${layout.shopAddress}</div>
      <div style="font-size:11px;">${order.date || new Date().toLocaleString()}</div>
      <div>Order #${order.id}</div>
      ${
        layout.showPacketCustomerInfo && (order.customer || order.customer_name)
          ? `<div style="font-weight:bold">${order.customer || order.customer_name}</div>
             <div>${order.address || order.customer_address || ""}</div>
             <div>Phone: ${order.customer_phone || ""}</div>`
          : ""
      }
      <hr/>
      <div>
        ${allItems
          .map((item) => {
            const qty = parseInt(item.qty || item.quantity || 1);
            return `<div style="margin-bottom:4px;">
                <div style="display:flex;justify-content:space-between">
                  <span>${qty}x ${item.name || item.product_name}</span>
                  <span>₺${item.price}</span>
                </div>
                ${
                  item.extras && item.extras.length > 0
                    ? `<div style="font-size:11px;color:gray;margin-left:8px;">
                        ${item.extras
                          .map((ex) => {
                            const extraQty = parseInt(ex.qty || ex.quantity || 1);
                            const lineQty = qty * extraQty;
                            return `<div style="display:flex;justify-content:space-between;">
                              <span>+${extraQty > 1 ? ` ${extraQty}x ` : " "}${ex.name || ex.label}</span>
                              <span>₺${(lineQty * parseFloat(ex.price || 0)).toFixed(2)}</span>
                            </div>`;
                          })
                          .join("")}
                      </div>`
                    : ""
                }
                ${
                  item.note
                    ? `<div style="font-size:11px;color:#c2410c;margin-left:8px;">
                        📝 ${item.note}
                      </div>`
                    : ""
                }
              </div>`;
          })
          .join("")}
      </div>
      <hr/>
      <div style="font-weight:bold;font-size:18px;">Grand Total: ₺${grandTotal}</div>
      <div>Payment: ${order.payment || order.payment_method || ""}</div>
      ${
        layout.extras && layout.extras.length > 0
          ? `<div style="margin-top:12px;">
              ${layout.extras
                .map(
                  (ex) =>
                    ex.label && ex.value
                      ? `<div style="display:flex;justify-content:space-between;font-size:12px;">
                            <span>${ex.label}:</span>
                            <span>${ex.value}</span>
                         </div>`
                      : ""
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        layout.showFooter
          ? `<div style="margin-top:10px;font-size:11px;color:gray;">${layout.footerText}</div>`
          : ""
      }
    </div>
  `;
}




function autoPrintReceipt(order, layout = defaultLayout) {
  console.log("🖨️ [GLOBAL] Opening print window for order:", order);
  const html = renderReceiptHTML(order, layout);

  const printWindow = window.open("", "PrintWindow", "width=400,height=600");
  printWindow.document.write(`
    <html>
      <head>
        <title>Auto Print Order</title>
        <style>
          @media print {
            body { margin: 0; background: #fff; }
          }
          body {
            font-family: monospace;
            background: #fff;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 400);
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
      .then(res => res.json())
      .then(data => {
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
  const yemeksepetiHandler = () => enqueueSound('yemeksepeti_order');

  socket.on("yemeksepeti_order", yemeksepetiHandler);

  return () => {
    socket.off("yemeksepeti_order", yemeksepetiHandler);
  };
}, [enqueueSound])

  // 🔁 Polling checks
  const pollingChecks = useMemo(() => [
    {
      key: "order_preparing",
      endpoint: "/api/order-items/preparing",
      extractIds: (data) => data,  // since data is already an array of IDs
    },
    {
      key: "order_ready",
      endpoint: "/api/kitchen-orders",
      extractIds: (data) =>
        data.filter((i) => i.kitchen_status === "ready").map((i) => i.item_id),
    },
    {
      key: "order_delivered",
      endpoint: "/api/orders",
      extractIds: (data) =>
        data.filter((o) => o.status === "delivered").map((o) => o.id),
    },
    {
      key: "payment_made",
      endpoint: "/api/orders",
      extractIds: (data) =>
        data.filter((o) => o.is_paid).map((o) => o.id),
    },
    {
      key: "stock_low",
      endpoint: "/api/stock",
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
      endpoint: "/api/stock",
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
      endpoint: "/api/orders",
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
      endpoint: "/api/orders",
      extractIds: (data) =>
        data.filter((o) => o.driver_status === "delivered").map((o) => o.id),
    },
  ], []);

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
              const msg = itemCount === 1
                ? "🧂 Stock Low item detected!"
                : `🧂 ${itemCount} items low in stock`;

              const now = Date.now();
              const cooldownMs = (notificationSettings.stockAlert.cooldownMinutes ?? 10) * 60 * 1000;
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

  // Watch for order_confirmed
useEffect(() => {
const onConfirmed = async ({ orderId }) => {
  const autoPrintTable = localStorage.getItem("autoPrintTable") === "true";
  const autoPrintPacket = localStorage.getItem("autoPrintPacket") === "true";

  try {
    const res = await fetch(`${API_URL}/api/orders/${orderId}`);
    if (!res.ok) throw new Error("Could not fetch order");
    const order = await res.json();

    // ✅ Verify order items exist before printing
    if (!order.items || order.items.length === 0) {
      console.warn("Order fetched without items; skipping receipt print.");
      return;
    }

    if (
      (order.order_type === "table" && autoPrintTable) ||
      ((order.order_type === "phone" || order.order_type === "packet") && autoPrintPacket)
    ) {
      enqueueSound("new_order");
      autoPrintReceipt(order, layout);
    }
  } catch (e) {
    console.error("Failed to auto-print order:", e);
  }
};


  const handler = ({ orderId }) => {
    setTimeout(() => onConfirmed({ orderId }), 200);
  };

  socket.on("order_confirmed", handler);
  return () => socket.off("order_confirmed", handler); // ✅ Now properly removes
}, [layout, enqueueSound]);

  // 🔌 Socket listeners
   useEffect(() => {
    let interval;

    // Define named handlers
    const ordersUpdatedHandler = () => pollAll();
    const orderConfirmedHandler = () => enqueueSound("new_order");
    const orderReadyHandler = () => enqueueSound("order_ready");
    const orderDeliveredHandler = () => enqueueSound("order_delivered");
    const alertHandler = ({ message }) => {
      if (!message.startsWith("🧂")) return;
      const now = Date.now();
      const cooldownMs = (notificationSettings?.stockAlert?.cooldownMinutes ?? 10) * 60 * 1000;
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
    const soundName = notificationSettings.eventSounds[key] || notificationSettings.defaultSound;

    if (soundName === "none") {
      setSoundQueue((q) => q.slice(1));
      return;
    }

    if (ref?.current) {
      soundPlayingRef.current = true;
      const audioEl = ref.current;
      audioEl.pause();
      audioEl.currentTime = 0;

      audioEl.play()
        .then(() => setTimeout(() => {
          soundPlayingRef.current = false;
          setSoundQueue((q) => q.slice(1));
        }, 500))
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
            const soundName = notificationSettings.eventSounds[key] || notificationSettings.defaultSound;
            const src = soundName && soundName !== "none" ? `/${soundName}` : "";
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
