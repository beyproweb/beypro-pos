const defaultReceiptLayout = {
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

import secureFetch from "./secureFetch";

let layoutCache = defaultReceiptLayout;
let cachedRegisterSettings = null;
let fetchingRegisterPromise = null;

async function getRegisterSettings() {
  if (cachedRegisterSettings) return cachedRegisterSettings;
  if (fetchingRegisterPromise) return fetchingRegisterPromise;
  fetchingRegisterPromise = secureFetch("/settings/register")
    .then((data) => {
      cachedRegisterSettings = data || {};
      return cachedRegisterSettings;
    })
    .catch(() => (cachedRegisterSettings = {}))
    .finally(() => {
      fetchingRegisterPromise = null;
    });
  return fetchingRegisterPromise;
}

export function setReceiptLayout(next) {
  layoutCache = next || defaultReceiptLayout;
  if (typeof window !== "undefined") {
    window.__receiptLayout = layoutCache;
  }
}

export function getReceiptLayout() {
  if (layoutCache) return layoutCache;
  if (typeof window !== "undefined" && window.__receiptLayout) {
    layoutCache = window.__receiptLayout;
    return layoutCache;
  }
  layoutCache = defaultReceiptLayout;
  return layoutCache;
}

export function renderReceiptText(order, providedLayout) {
  const layout = providedLayout || getReceiptLayout();
  const items =
    order?.suborders?.flatMap((so) => so.items || []) || order?.items || [];
  const lines = [];
  const add = (l = "") => lines.push(String(l));

  if (layout.showHeader) add(layout.headerText || "Beypro POS");
  if (layout.shopAddress) add(layout.shopAddress.replace(/\n/g, " "));
  add(new Date(order?.created_at || Date.now()).toLocaleString());
  add(`Order #${order?.id || "-"}`);

  if (layout.showPacketCustomerInfo && (order?.customer || order?.customer_name)) {
    add(`Cust: ${order.customer || order.customer_name}`);
    if (order.customer_phone) add(`Phone: ${order.customer_phone}`);
    if (order.address || order.customer_address) {
      add(
        `Addr: ${(order.address || order.customer_address || "")
          .replace(/\s+/g, " ")
          .trim()}`
      );
    }
  }

  add("--------------------------------");
  let total = 0;
  let tax = 0;
  const addMoney = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

  for (const it of items) {
    const name = it.name || it.product_name || "Item";
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

  if (order?.tax_value) {
    tax = addMoney(order.tax_value);
    add(`TAX: ${tax.toFixed(2)} TL`);
  }

  add("--------------------------------");
  add(`TOTAL: ${(total + tax).toFixed(2)} TL`);
  if (order?.payment_method) {
    add(`PAYMENT: ${String(order.payment_method).toUpperCase()}`);
  }

  if (layout.showFooter && layout.footerText) {
    add("--------------------------------");
    add(layout.footerText);
  }

  return lines.join("\n");
}

export async function printViaBridge(text) {
  // 1) Electron preload text printing (preferred)
  try {
    if (window?.beypro?.printText) {
      await window.beypro.printText(text);
      return true;
    }
  } catch (err) {
    console.warn("Electron printText failed:", err?.message || err);
  }

  // 2) LAN printing via local bridge if configured for network
  try {
    const settings = await getRegisterSettings();
    const cfg = settings?.cashDrawerPrinter || null;
    if (cfg && cfg.interface === "network" && cfg.host) {
      // Build simple ESC/POS bytes: ESC @ + text + feed + cut
      const enc = new TextEncoder();
      const init = Uint8Array.from([0x1b, 0x40]);
      const body = enc.encode(String(text || "") + "\n\n\n");
      const cut = Uint8Array.from([0x1d, 0x56, 0x00]);
      const bytes = new Uint8Array(init.length + body.length + cut.length);
      bytes.set(init, 0);
      bytes.set(body, init.length);
      bytes.set(cut, init.length + body.length);

      const dataBase64 = btoa(String.fromCharCode(...bytes));
      const res = await fetch("http://127.0.0.1:7777/tcp/print-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: cfg.host, port: cfg.port || 9100, dataBase64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok !== false) return true;
    }
  } catch (err) {
    console.warn("Local bridge TCP print failed:", err?.message || err);
  }

  // 3) Backend ESC/POS print via configured register printer (LAN/USB/Serial) — useful when backend is local
  try {
    const settings = await getRegisterSettings();
    const cfg = settings?.cashDrawerPrinter || null;
    if (cfg && cfg.interface) {
      await secureFetch("/printer-settings/print", {
        method: "POST",
        body: JSON.stringify({
          interface: cfg.interface,
          vendorId: cfg.vendorId,
          productId: cfg.productId,
          path: cfg.path,
          baudRate: cfg.baudRate,
          host: cfg.host,
          port: cfg.port,
          encoding: cfg.encoding || "cp857",
          align: "lt",
          cut: true,
          content: text,
        }),
      });
      return true;
    }
  } catch (err) {
    console.warn("Backend print via configured printer failed:", err?.message || err);
  }

  // 4) Windows local bridge (spooler) – requires running beypro bridge on 127.0.0.1:7777
  try {
    const name = localStorage.getItem("beyproSelectedPrinter");
    if (name) {
      // Minimal ESC/POS: ESC @ + text + feed + full cut
      const enc = new TextEncoder();
      const init = Uint8Array.from([0x1b, 0x40]);
      const body = enc.encode(String(text || "") + "\n\n\n");
      const cut = Uint8Array.from([0x1d, 0x56, 0x00]);
      const bytes = new Uint8Array(init.length + body.length + cut.length);
      bytes.set(init, 0);
      bytes.set(body, init.length);
      bytes.set(cut, init.length + body.length);

      const dataBase64 = btoa(String.fromCharCode(...bytes));
      const res = await fetch("http://127.0.0.1:7777/win/print-raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: name, dataBase64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok !== false) return true;
    }
  } catch (err) {
    console.warn("Local bridge spooler print failed:", err?.message || err);
  }

  return false;
}

export { defaultReceiptLayout };
