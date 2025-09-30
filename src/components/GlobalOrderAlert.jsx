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
import secureFetch from "../utils/secureFetch"; // 🔐 tenant-safe fetch (adds Bearer + handles 401)
import socket from "../utils/socket"; // your initialized socket.io client (already tenant aware)
import { useSetting } from "../components/hooks/useSetting";

/* ------------------------------------------
 * Helpers: sound files, playback, utilities
 * ------------------------------------------ */

const DEFAULT_SOUNDS = {
  new_order: "new_order.mp3",
  order_preparing: "prepare.mp3",
  order_ready: "chime.mp3",
  order_delivered: "success.mp3",
  payment_made: "cash.mp3",
  stock_low: "warning.mp3",
  stock_restocked: "pop.mp3",
};

const DEFAULT_NOTIFICATIONS = {
  defaultSound: "ding.mp3",
  eventSounds: { ...DEFAULT_SOUNDS },
  enableToasts: true,
  enableSounds: true,
};

const soundPath = (name) => {
  // Serve from public; adjust if you use CDN
  if (!name) return "/sounds/ding.mp3";
  return name.startsWith("/") ? name : `/sounds/${name}`;
};

// Simple cooldown memory (avoid sound spam)
const cooldownMillis = {
  new_order: 4000,
  order_preparing: 3000,
  order_ready: 3000,
  order_delivered: 3000,
  payment_made: 2500,
  stock_low: 8000,
  stock_restocked: 6000,
};

/* ------------------------------------------
 * Receipt layout (printer) defaults
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
 * Receipt rendering
 * ------------------------------------------ */

function renderReceiptText(order, layout = defaultLayout) {
  const items =
    order?.suborders?.flatMap((so) => so.items || []) ||
    order?.items ||
    [];

  const lines = [];
  const add = (l = "") => lines.push(String(l));

  if (layout.showHeader) add(layout.headerText || "Beypro POS");
  if (layout.shopAddress) add(layout.shopAddress.replace(/\n/g, " "));
  add(new Date(order.created_at || Date.now()).toLocaleString());
  add(`Order #${order.id}`);

  if (layout.showPacketCustomerInfo && (order.customer || order.customer_name)) {
    add(`Cust: ${order.customer || order.customer_name}`);
    if (order.customer_phone) add(`Phone: ${order.customer_phone}`);
    if (order.address || order.customer_address) {
      add(
        `Addr: ${(order.address || order.customer_address)
          .replace(/\s+/g, " ")
          .trim()}`
      );
    }
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
  if (order.payment_method) add(`PAYMENT: ${String(order.payment_method).toUpperCase()}`);

  if (layout.showFooter && layout.footerText) {
    add("--------------------------------");
    add(layout.footerText);
  }
  return lines.join("\n");
}

/* ------------------------------------------
 * Print via Beypro Bridge (Electron, USB)
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

/* ------------------------------------------
 * De-dupe printing per order id
 * ------------------------------------------ */

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
  /* ----------------- settings / layout ----------------- */
  const [notif, setNotif] = useState(DEFAULT_NOTIFICATIONS);
  const [layout, setLayout] = useState(defaultLayout);

  // global user-managed settings (optional; keeps consistency with the rest of app)
  useSetting("printer", (val) => {
    if (val?.layout) setLayout({ ...defaultLayout, ...val.layout });
  });

  /* ---------------------- audio ------------------------ */
  const audioRefs = useRef({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundQueue, setSoundQueue] = useState([]);
  const soundPlayingRef = useRef(false);
  const lastSoundAtRef = useRef({}); // key => timestamp

  const eventKeys = useMemo(
    () => [
      "new_order",
      "order_preparing",
      "order_ready",
      "order_delivered",
      "payment_made",
      "stock_low",
      "stock_restocked",
    ],
    []
  );

  // register refs
  useEffect(() => {
    eventKeys.forEach((k) => (audioRefs.current[k] ||= React.createRef()));
  }, [eventKeys]);

  // unlock iOS/Chrome audio AFTER user input
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

  // play queued sounds (serialized)
  useEffect(() => {
    if (!notif.enableSounds || !audioUnlocked) return;
    if (soundPlayingRef.current) return;
    if (!soundQueue.length) return;

    const key = soundQueue[0];
    const now = Date.now();
    const cool = cooldownMillis[key] || 2000;
    if (now - (lastSoundAtRef.current[key] || 0) < cool) {
      // skip due to cooldown; dequeue and continue
      setSoundQueue((q) => q.slice(1));
      return;
    }

    const ref = audioRefs.current[key]?.current;
    const chosen =
      notif.eventSounds?.[key] || notif.defaultSound || DEFAULT_NOTIFICATIONS.defaultSound;

    if (!ref) {
      console.warn("No audio ref for", key);
      setSoundQueue((q) => q.slice(1));
      return;
    }

    soundPlayingRef.current = true;
    ref
      .play()
      .then(() => {
        lastSoundAtRef.current[key] = Date.now();
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => {
          soundPlayingRef.current = false;
          setSoundQueue((q) => q.slice(1));
        }, 250);
      });
  }, [soundQueue, notif.enableSounds, audioUnlocked]);

  /* ------------------- load config --------------------- */

  // load notification config (tenant-safe)
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
        // keep defaults
      }
    })();
  }, []);

  // load printer layout (tenant-safe)
  useEffect(() => {
    (async () => {
      try {
        const printer = await secureFetch("/printer-settings/1");
        if (printer?.layout) {
          setLayout((old) => ({ ...old, ...printer.layout }));
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  /* ----------------- SOCKET INTEGRATION ---------------- */

  // helper: enqueue sound + toast
  const notify = useCallback(
    (key, msg) => {
      if (notif.enableToasts && msg) toast.info(msg);
      if (notif.enableSounds) setSoundQueue((q) => q.concat(key));
    },
    [notif.enableToasts, notif.enableSounds]
  );

  // print helper
  const printOrder = useCallback(
    async (orderId) => {
      if (!orderId) return false;
      try {
        const order = await secureFetch(`/orders/${orderId}`);
        if (!order?.id) return false;

        if (!shouldPrintNow(order.id)) return false;

        const text = renderReceiptText(order, layout);
        const ok = printViaBridge(text);
        if (!ok) {
          toast.warn("🖨️ Beypro Bridge not connected");
          return false;
        }
        toast.success(`🧾 Printed order #${order.id}`);
        return true;
      } catch (err) {
        console.error("Print fetch error:", err);
        return false;
      }
    },
    [layout]
  );

  // Socket listeners (tenant-safe events)
  useEffect(() => {
    const onNewOrder = async (payload) => {
      // payload may include order id or full order
      const id = payload?.order?.id || payload?.id;
      notify("new_order", "🔔 New order received");
      if (id) await printOrder(id);
    };

    const onPreparing = () => notify("order_preparing", "👩‍🍳 Order set to preparing");
    const onReady = () => notify("order_ready", "✅ Order ready");
    const onDelivered = () => notify("order_delivered", "🚚 Order delivered");
    const onPaid = () => notify("payment_made", "💸 Payment made");
    const onStockLow = () => notify("stock_low", "⚠️ Stock critical");
    const onRestocked = () => notify("stock_restocked", "📦 Stock replenished");

    socket.on("order_confirmed", onNewOrder);
    socket.on("order_preparing", onPreparing);
    socket.on("order_ready", onReady);
    socket.on("order_delivered", onDelivered);
    socket.on("payment_made", onPaid);
    socket.on("stock_critical", onStockLow);
    socket.on("stock_restocked", onRestocked);

    return () => {
      socket.off("order_confirmed", onNewOrder);
      socket.off("order_preparing", onPreparing);
      socket.off("order_ready", onReady);
      socket.off("order_delivered", onDelivered);
      socket.off("payment_made", onPaid);
      socket.off("stock_critical", onStockLow);
      socket.off("stock_restocked", onRestocked);
    };
  }, [notify, printOrder]);

  /* ---------------- POLLING (FALLBACK) ------------------ */

  // keeps last snapshot ids to detect new entities
  const prevSetRef = useRef({
    preparingIds: new Set(),
    kitchenIds: new Set(),
    orderIds: new Set(),
    stockIds: new Set(),
  });

  const pollAll = useCallback(async () => {
    // Poll these endpoints only as a fallback to ensure events are never missed.
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

        // Build current set of ids
        const fresh = new Set(
          data.map((row) => row.id || row.item_id || row.order_id).filter(Boolean)
        );
        const prev = prevSetRef.current[ep.field] || new Set();

        // Detect newly appeared ids
        let newCount = 0;
        for (const id of fresh) if (!prev.has(id)) newCount++;

        if (newCount > 0) {
          notify(ep.key, `🔔 ${ep.key.replace("_", " ")} (${newCount})`);
        }

        prevSetRef.current[ep.field] = fresh;
      } catch (err) {
        // If unauthorized (expired token), secureFetch already navigates to /login.
        // Here we just log softly to avoid noisy console.
        console.debug("Poll error:", ep.path, err?.message || err);
      }
    }
  }, [notify]);

  // Poll every 12 seconds
  useEffect(() => {
    pollAll();
    const int = setInterval(pollAll, 12000);
    return () => clearInterval(int);
  }, [pollAll]);

  /* --------------- STOCK CHANGE WATCHER ----------------- */
  // If you want to play sound when a specific stock qty crosses threshold,
  // keep a map of last seen qty per item_id.
  const lastQtyRef = useRef({});
  const watchStockChanges = useCallback(async () => {
    try {
      const rows = await secureFetch("/stock"); // expects array [{id, qty, min_qty}, ...]
      if (!Array.isArray(rows)) return;

      for (const r of rows) {
        const id = r.id || r.item_id;
        if (!id) continue;
        const prevQty = lastQtyRef.current[id];
        const q = Number(r.qty ?? 0);
        const min = Number(r.min_qty ?? 0);

        if (typeof prevQty === "number") {
          // went below threshold
          if (prevQty >= min && q < min) notify("stock_low", `⚠️ ${r.name || "Item"} low`);
          // restocked above threshold
          if (prevQty < min && q >= min)
            notify("stock_restocked", `📦 ${r.name || "Item"} restocked`);
        }
        lastQtyRef.current[id] = q;
      }
    } catch {
      /* ignore */
    }
  }, [notify]);

  useEffect(() => {
    watchStockChanges();
    const int = setInterval(watchStockChanges, 20000);
    return () => clearInterval(int);
  }, [watchStockChanges]);

  /* ------------------ UI / AUDIO TAGS ------------------- */

  return (
    <Fragment>
      {/* Invisible audio tags (preloaded) */}
      {eventKeys.map((key) => {
        const src =
          soundPath(notif.eventSounds?.[key]) || soundPath(notif.defaultSound);
        return (
          <audio key={key} ref={audioRefs.current[key]} src={src} preload="auto" />
        );
      })}
    </Fragment>
  );
}
