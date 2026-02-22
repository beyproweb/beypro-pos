export function createPaymentFlow(deps) {
  const {
    order,
    orderType,
    hasUnconfirmedCartItems,
    selectedCartItemIds,
    cartItems,
    getPaymentItemKey,
    setShowPaymentModal,
    showToast,
    t,
    hasSuborderUnpaid,
    selectionQuantities,
    resolvePaymentLabel,
    isCashMethod,
    uuidv4,
    discountValue,
    discountType,
    txApiRequest,
    identifier,
    broadcastTableOverviewOrderStatus,
    setCartItems,
    dispatchOrdersLocalRefresh,
    splits,
    refreshReceiptAfterPayment,
    fetchOrderItems,
    fetchSubOrders,
    updateOrderStatus,
    setOrder,
    runAutoCloseIfConfigured,
    setSelectedCartItemIds,
    txLogCashRegisterEvent,
    txOpenCashDrawer,
  } = deps;

  function handlePayClick() {
    if (!order) return;
    if (orderType === "phone") {
      showToast(t("Payments are handled through the Orders screen"));
      return;
    }
    if (hasUnconfirmedCartItems) {
      showToast(t("Confirm the order before paying"));
      return;
    }

    const selectionKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));
    const hasUnconfirmedSelected = cartItems.some(
      (item) => selectionKeys.has(String(item.unique_id || item.id)) && !item.confirmed
    );
    if (hasUnconfirmedSelected) {
      showToast(t("Selected items must be confirmed before payment"));
      return;
    }

    let paymentIds =
      selectionKeys.size > 0
        ? cartItems
            .filter((item) => !item.paid && item.confirmed && selectionKeys.has(getPaymentItemKey(item)))
            .map((item) => getPaymentItemKey(item))
            .filter(Boolean)
        : cartItems
            .filter((item) => !item.paid && item.confirmed)
            .map((item) => getPaymentItemKey(item))
            .filter(Boolean);

    if (paymentIds.length === 0) {
      showToast(t("No items available to pay"));
      return;
    }

    setShowPaymentModal(true);
  }

  async function confirmPayment(method, payIds = null) {
    // Close the modal immediately for a snappier feel
    setShowPaymentModal(false);

    const methodLabel = resolvePaymentLabel(method);
    const methodIsCash = isCashMethod(method);
    const receiptId = uuidv4();

    // Map of selected IDs to desired quantity (defaults to full qty)
    const selectionQty = new Map(
      Array.from(selectedCartItemIds).map((id) => {
        const key = String(id);
        const item = cartItems.find((i) => getPaymentItemKey(i) === key);
        const maxQty = Math.max(1, Number(item?.quantity) || 1);
        const desired = Number(selectionQuantities?.[key]) || maxQty;
        return [key, Math.min(Math.max(1, desired), maxQty)];
      })
    );

    const ids =
      payIds && payIds.length > 0
        ? payIds
        : cartItems
            .filter((i) => !i.paid && i.confirmed)
            .map((i) => getPaymentItemKey(i));
    const idsSet = new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => (id === null || id === undefined ? "" : String(id)))
        .map((value) => value.trim())
        .filter(Boolean)
    );

    const unpaidConfirmedItems = cartItems.filter((i) => !i.paid && i.confirmed);
    const isAttemptingFullPay =
      unpaidConfirmedItems.length > 0 &&
      !hasSuborderUnpaid &&
      unpaidConfirmedItems.every((i) => {
        const key = getPaymentItemKey(i);
        if (!idsSet.has(key)) return false;
        const originalQty = Math.max(1, Number(i.quantity) || 1);
        const payQty = selectionQty.get(key) || originalQty;
        return payQty >= originalQty;
      });
    let paidTotal = 0;
    let isFullyPaidAfter = false;

    const unpaidItems = cartItems.filter(
      (i) => idsSet.has(getPaymentItemKey(i)) && !i.paid && i.confirmed
    );
    if (unpaidItems.length === 0) {
      showToast(t("No unpaid items to pay."));
      return;
    }

    let total = unpaidItems
      .reduce((sum, i) => {
        const maxQty = Math.max(1, Number(i.quantity) || 1);
        const qty = selectionQty.get(getPaymentItemKey(i)) || maxQty;
        const perUnit = deps.computeItemLineTotal(i) / maxQty;
        return sum + perUnit * qty;
      }, 0);

    if (discountValue > 0) {
      if (discountType === "percent") total -= total * (discountValue / 100);
      if (discountType === "fixed") total = Math.max(0, total - discountValue);
    }

    paidTotal = total;

    const enhancedItems = unpaidItems.map((i) => {
      const qty = selectionQty.get(getPaymentItemKey(i)) || Number(i.quantity) || 1;
      return {
        product_id: i.product_id || i.id,
        quantity: qty,
        price: i.price,
        ingredients: i.ingredients,
        extras: i.extras,
        unique_id: i.unique_id,
        payment_method: methodLabel,
        receipt_id: receiptId,
        note: i.note || null,
        discountType: discountValue > 0 ? discountType : null,
        discountValue: discountValue > 0 ? discountValue : 0,
        confirmed: true,
      };
    });

    const previousCartItems = Array.isArray(cartItems) ? cartItems : [];
    const previousOrderStatus = order
      ? {
          status: order.status,
          is_paid: order.is_paid,
          payment_status: order.payment_status,
        }
      : null;

    // ⚡ INSTANT: apply optimistic paid state before network round-trips.
    setCartItems((prev) => {
      const next = [];
      (Array.isArray(prev) ? prev : []).forEach((item) => {
        const key = getPaymentItemKey(item);
        if (!idsSet.has(key) || item.paid) {
          next.push(item);
          return;
        }
        const originalQty = Math.max(1, Number(item.quantity) || 1);
        const payQty = selectionQty.get(key) || originalQty;
        const remainingQty = Math.max(0, originalQty - payQty);
        if (remainingQty > 0) {
          next.push({ ...item, quantity: remainingQty, paid: false, paid_at: null });
        }
        next.push({
          ...item,
          quantity: payQty,
          paid: true,
          paid_at: new Date().toISOString(),
        });
      });
      return next;
    });

    if (isAttemptingFullPay) {
      setOrder((prev) =>
        prev
          ? { ...prev, status: "paid", payment_status: "paid", is_paid: true }
          : prev
      );
      broadcastTableOverviewOrderStatus("paid");
    }

    try {
      await txApiRequest(`/orders/sub-orders${identifier}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.id,
          total,
          payment_method: methodLabel,
          receipt_id: receiptId,
          mark_paid: true,
          items: enhancedItems,
        }),
      });
    } catch {
      setCartItems(previousCartItems);
      if (previousOrderStatus) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                status: previousOrderStatus.status,
                is_paid: previousOrderStatus.is_paid,
                payment_status: previousOrderStatus.payment_status,
              }
            : prev
        );
      }
      showToast(t("Payment failed. Please try again."));
      return;
    }

    // ⚡ Fire table update IMMEDIATELY (don't block on receipt methods)
    dispatchOrdersLocalRefresh();
    if (window && typeof window.playPaidSound === "function") window.playPaidSound();

    // ⚡ Run all background tasks in parallel (fire and forget)
    const cleanedSplits = {};
    Object.entries(splits || {}).forEach(([methodId, amt]) => {
      const val = parseFloat(amt);
      if (val > 0) {
        const label = resolvePaymentLabel(methodId);
        cleanedSplits[label] = val;
      }
    });
    const receiptMethodsPayload =
      Object.keys(cleanedSplits).length > 0
        ? cleanedSplits
        : { [methodLabel]: paidTotal };

    // These run in background without blocking
    Promise.allSettled([
      txApiRequest(`/orders/receipt-methods${identifier}`, {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          receipt_id: receiptId,
          methods: receiptMethodsPayload,
        }),
      }),
      refreshReceiptAfterPayment(),
      fetchOrderItems(order.id),
      fetchSubOrders(),
    ]).catch((err) => console.warn("⚠️ Background tasks failed:", err));
    dispatchOrdersLocalRefresh();

    const allItems2 = await txApiRequest(`/orders/${order.id}/items${identifier}`);

    if (!Array.isArray(allItems2)) {
      console.error("❌ Unexpected items response:", allItems2);
      return;
    }

    const isFullyPaid2 = allItems2.every((item) => item.paid_at);
    isFullyPaidAfter = isFullyPaid2;

    if (isFullyPaid2) {
      await updateOrderStatus("paid", total, method);
      setOrder((prev) => ({ ...prev, status: "paid" }));
      broadcastTableOverviewOrderStatus("paid");
      await runAutoCloseIfConfigured(true, [method]);
    }

    await refreshReceiptAfterPayment();
    await fetchOrderItems(order.id);
    await fetchSubOrders();
    setSelectedCartItemIds(new Set());
    setShowPaymentModal(false);

    if (methodIsCash && paidTotal > 0) {
      const note = order?.id ? `Order #${order.id} (${methodLabel})` : `Sale (${methodLabel})`;
      await txLogCashRegisterEvent({ type: "sale", amount: paidTotal, note });
      await txOpenCashDrawer();
    }
    if (isFullyPaidAfter) {
      await runAutoCloseIfConfigured(true, [method]);
    }
  }

  return {
    handlePayClick,
    confirmPayment,
  };
}
