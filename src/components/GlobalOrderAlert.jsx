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
import socket, { joinRestaurantRoom } from "../utils/socket";

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

/* ------------------------------------------
 * Receipt layout defaults
 * ------------------------------------------ */
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

/* ------------------------------------------
 * Receipt generation
 * ------------------------------------------ */
function renderReceiptText(order, layout = defaultLayout) {
  const items =
    order?.suborders?.flatMap((so) => so.items || []) || order?.items || [];
  const lines = [];
  const add = (l = "") => lines.push(String(l));

  if (layout.showHeader) add(layout.headerText || "Beypro POS");
  if (layout.shopAddress) add(layout.shopAddress.replace(/\n/g, " "));
  add(new Date(order.created_at || Date.now()).toLocaleString());
  add(`Order #${order.id}`);

  if (layout.showPacketCustomerInfo && (order.customer || order.customer_name)) {
    add(`Cust: ${order.customer || order.customer_name}`);
    if (order.customer_phone) add(`Phone: ${order.customer_phone}`);
    if (order.address || order.customer_address)
      add(`Addr: ${(order.address || order.customer_address).replace(/\s+/g, " ").trim()}`);
  }

  add("--------------------------------");
  let total = 0;
  let tax = 0;
  const addMoney = (n) => (isNaN(n) ? 0 : Number(n));

  for (const it of items) {
    const name = it.name || "Item";
    const qty = addMoney(it.qty ?? it.quantity ?? 1);
    const price = addMoney(it.price ?? 0);
    const lineTotal = qty * price;
    total += lineTotal;
    add(`${qty} x ${name}  ${price.toFixed(2)} = ${lineTotal.toFixed(2)}`);

    if (Array.isArray(it.extras)) {
      for (const ex of it.extras) {
        const exName = ex.name || "extra";
        const exQty = addMoney(ex.qty ?? ex.quantity ?? 1);
        const exPrice = addMoney(ex.price ?? 0);
        const exTotal = qty * exQty * exPrice;
        total += exTotal;
        add(`  + ${exQty} x ${exName}  ${exPrice.toFixed(2)} = ${exTotal.toFixed(2)}`);
      }
    }
    if (it.note) add(`  📝 ${it.note}`);
  }

  if (order.tax_value) {
    tax = addMoney(order.tax_value);
    add(`TAX: ${tax.toFixed(2)} TL`);
  }

  add("--------------------------------");
  add(`TOTAL: ${(total + tax).toFixed(2)} TL`);
  if (order.payment_method)
    add(`PAYMENT: ${String(order.payment_method).toUpperCase()}`);

  if (layout.showFooter && layout.footerText) {
    add("--------------------------------");
    add(layout.footerText);
  }
  return lines.join("\n");
}

/* ------------------------------------------
 * Printing helpers
 * ------------------------------------------ */
function printViaBridge(text) {
  try {
    if (window?.beypro?.printText) {
      window.beypro.printText(text);
      return true;
    }
    console.warn("Beypro Bridge not available on window.beypro.printText");
    return false;
  } catch (err) {
    console.error("Print error:", err);
    return false;
  }
}

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
  const [layout, setLayout] = useState(defaultLayout);

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
    ],
    []
  );

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
        const printer = await secureFetch("/printer-settings/1");
        if (printer?.layout) setLayout((old) => ({ ...old, ...printer.layout }));
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



  /* Print helper */
  const printOrder = useCallback(
    async (orderId) => {
      if (!orderId) return false;
      try {
        const order = await secureFetch(`/orders/${orderId}`);
        if (!order?.id || !shouldPrintNow(order.id)) return false;
        const text = renderReceiptText(order, layout);
        const ok = printViaBridge(text);
        if (!ok) toast.warn("🖨️ Beypro Bridge not connected");
        else toast.success(`🧾 Printed order #${order.id}`);
        return true;
      } catch (err) {
        console.error("Print fetch error:", err);
        return false;
      }
    },
    [layout]
  );

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
