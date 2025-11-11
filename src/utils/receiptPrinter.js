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

let layoutCache = defaultReceiptLayout;

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

export function printViaBridge(text) {
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

export { defaultReceiptLayout };
