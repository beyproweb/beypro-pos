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
import { formatWithActiveCurrency } from "./currency";

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
    add(`TAX: ${formatWithActiveCurrency(tax)}`);
  }

  add("--------------------------------");
  add(`TOTAL: ${formatWithActiveCurrency(total + tax)}`);
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
  try {
    // 1) Try Electron preload printText first (recommended for text-based receipts)
    if (window?.beypro?.printText) {
      console.log("📄 Using Electron printText");
      await window.beypro.printText(text);
      return true;
    }
  } catch (err) {
    console.warn("⚠️ Electron printText failed:", err?.message || err);
  }

  try {
    // 2) Try using Electron's printRaw with ESC/POS bytes (for more control)
    if (window?.beypro?.printRaw) {
      console.log("🖨️ Using Electron printRaw with ESC/POS");
      let printerName = localStorage.getItem("beyproSelectedPrinter");
      
      // If no printer in localStorage, try to auto-detect one
      if (!printerName && window?.beypro?.getPrinters) {
        console.log("📡 No printer in localStorage, attempting auto-detect...");
        try {
          const printers = await window.beypro.getPrinters();
          console.log("📡 Available printers:", printers);
          if (Array.isArray(printers) && printers.length > 0) {
            // Use first printer or first ready one
            const firstReady = printers.find(p => p.status === "ready") || printers[0];
            printerName = firstReady?.name || printers[0];
            console.log("🔄 Auto-selected printer:", printerName);
            localStorage.setItem("beyproSelectedPrinter", printerName);
          }
        } catch (detectErr) {
          console.warn("⚠️ Auto-detect failed:", detectErr?.message);
        }
      }
      
      if (printerName) {
        // Build ESC/POS bytes: ESC @ (reset) + text + feed + cut
        const enc = new TextEncoder();
        const init = Uint8Array.from([0x1b, 0x40]); // ESC @ reset
        const body = enc.encode(String(text || "") + "\n\n\n");
        const cut = Uint8Array.from([0x1d, 0x56, 0x00]); // GS V (cut)
        const bytes = new Uint8Array(init.length + body.length + cut.length);
        bytes.set(init, 0);
        bytes.set(body, init.length);
        bytes.set(cut, init.length + body.length);

        const dataBase64 = btoa(String.fromCharCode(...bytes));
        console.log("🖨️ Printing to:", printerName);
        const result = await window.beypro.printRaw({
          printerName,
          dataBase64,
        });
        
        if (result?.ok !== false) {
          console.log("✅ Electron printRaw succeeded");
          return true;
        } else {
          console.error("❌ Electron printRaw returned error:", result?.error);
        }
      } else {
        console.warn("⚠️ No printer available - could not detect any printers");
      }
    } else {
      console.warn("⚠️ Electron printRaw not available (not running in Electron)");
    }
  } catch (err) {
    console.error("❌ Electron printRaw failed:", err?.message || err);
  }

  // If no Electron, don't try backend - just fail gracefully
  console.error("❌ No printer available");
  return false;
}

export { defaultReceiptLayout };
