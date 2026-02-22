export function createPrintFlow(deps) {
  const {
    order,
    cartItems,
    identifier,
    txFetchOrderWithItems,
    txPrintViaBridge,
    showToast,
    t,
  } = deps;

  async function handleCartPrint() {
    if (!order?.id) {
      showToast(t("No order selected to print"));
      return;
    }
    try {
      const printable = await txFetchOrderWithItems(order.id, identifier);
      if (!Array.isArray(printable.items) || printable.items.length === 0) {
        printable.items = cartItems;
      }
      const ok = await txPrintViaBridge("", printable);
      showToast(
        ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
      );
    } catch (err) {
      console.error("❌ Print failed:", err);
      showToast(t("Failed to print receipt"));
    }
  }

  return { handleCartPrint };
}
