export function createReceiptFlow(deps) {
  const {
    order,
    identifier,
    txApiRequest,
    setReceiptItems,
    setCartItems,
  } = deps;

  function safeParseExtras(extras) {
    try {
      if (Array.isArray(extras)) return extras;
      if (typeof extras === "string" && extras.trim() !== "") {
        const parsed = JSON.parse(extras);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch (err) {
      console.error("❌ Error parsing extras:", err);
      return [];
    }
  }

  function computeItemLineTotal(item) {
    const extrasList = safeParseExtras(item.extras);
    const extrasTotal = (Array.isArray(extrasList) ? extrasList : []).reduce(
      (acc, ex) => {
        const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
        const qty = Number(ex.quantity) || 1;
        return acc + price * qty;
      },
      0
    );
    const basePrice = parseFloat(item.price) || 0;
    const quantity = Number(item.quantity) || 1;
    return (basePrice + extrasTotal) * quantity;
  }

  function getPaymentMethodSummaryWithIcon(items) {
    // Step 1: Log everything for debug
    console.log("🧾 Receipt Group Debug:");
    items.forEach((item, idx) => {
      console.log(
        `  #${idx + 1}: ${item.name} — method: ${item.payment_method} — receipt_id: ${item.receipt_id}`
      );
    });

    // Step 2: Filter valid methods only
    const validMethods = items
      .map((i) => i.payment_method)
      .filter((m) => m && m !== "Unknown");

    console.log("Valid methods in group:", validMethods);

    if (validMethods.length === 0) {
      console.warn("❓ All methods invalid or missing");
      return "❓ Unknown";
    }

    // 🚫 No more "Mixed" — just return first valid method
    const method = validMethods[0];

    // Step 3: Icon mapping
    const icons = {
      Cash: "💵",
      "Credit Card": "💳",
      Sodexo: "🍽️",
      Multinet: "🪙",
      Unknown: "❓",
    };

    console.log(`🎯 Final method for group: ${method}`);
    return `${icons[method] || "❓"} ${method}`;
  }

  async function refreshReceiptAfterPayment() {
    try {
      const data = await txApiRequest(`/orders/${order.id}/items${identifier}`);

      const fetchedItems = data.map((item) => {
        let extras = safeParseExtras(item.extras);

        // 🧩 FIX for QRMenu duplicates — divide quantities if they look pre-multiplied
        if (order?.order_type === "table" && order?.source === "qr") {
          const qty = parseInt(item.quantity, 10) || 1;
          extras = extras.map((ex) => ({
            ...ex,
            // prevent QR double count: if quantity matches product qty, normalize
            quantity: Math.max(1, Math.round((ex.quantity || 1) / qty)),
          }));
        }

        return {
          id: item.product_id,
          name: item.name || item.order_item_name || item.product_name,
          category: item.category || null,
          quantity: parseInt(item.quantity, 10),
          price: parseFloat(item.price),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients
            : typeof item.ingredients === "string"
            ? JSON.parse(item.ingredients || "[]")
            : [],

          extras,
          unique_id: item.unique_id,
          note: item.note || "",
          confirmed: item.confirmed ?? true,
          paid: !!item.paid_at,
          payment_method: item.payment_method ?? "Unknown",
          receipt_id: item.receipt_id || null,

          kitchen_status: item.kitchen_status || "", // ✅ Add this line!
        };
      });

      // ✅ Filter receipts with real payment only
      const paidItems = fetchedItems.filter((i) => i.paid && i.receipt_id);
      const unpaidItems = fetchedItems.filter((i) => !i.paid);

      // ✅ Group by receipt ID for display
      const grouped = paidItems.reduce((acc, i) => {
        const key = i.receipt_id;
        if (!acc[key]) acc[key] = [];
        acc[key].push(i);
        return acc;
      }, {});
      console.log("Grouped receipt IDs:", Object.keys(grouped));

      // ✅ Update states
      setReceiptItems(paidItems); // only those with receipt_id
      setCartItems(fetchedItems); // includes confirmed & unconfirmed, not yet paid
    } catch (err) {
      console.error("❌ Failed to refresh receipt:", err);
    }
  }

  return {
    safeParseExtras,
    computeItemLineTotal,
    getPaymentMethodSummaryWithIcon,
    refreshReceiptAfterPayment,
  };
}
