export function createConfirmFlow(deps) {
  const {
    order,
    t,
    selectedCartItemIds,
    cartItems,
    discountedTotal,
    orderType,
    debugNavigate,
    txApiRequest,
    identifier,
    showToast,
    resetTableGuests,
    broadcastTableOverviewOrderStatus,
    navigate,
    getPrimaryActionLabel,
    receiptItems,
    hasUnconfirmedCartItems,
    updateOrderStatus,
    safeCartItems,
    discountValue,
    discountType,
    fetchOrderItems,
    transactionSettings,
    setIsFloatingCartOpen,
    scheduleNavigate,
    setHeader,
    hasConfirmedCartUnpaid,
    hasSuborderUnpaid,
    allPaidIncludingSuborders,
    existingReservation,
    getReservationSchedule,
    isEarlyReservationClose,
    requestReservationCloseConfirmation,
    allItemsDelivered,
    setDiscountValue,
    setDiscountType,
    setOrder,
    setCartItems,
  } = deps;

  function hasPreparingItems(orderItems) {
    return Array.isArray(orderItems)
      ? orderItems.some((item) => item.kitchen_status === "preparing")
      : false;
  }

  async function handleMultifunction() {
    console.log("ENTERED handleMultifunction()");
    console.log("order before any checks →", order);

    // 🔍 DEV profiling for confirm flow
    const isDev = import.meta.env.DEV;
    const perfLog = isDev ? (label, startTime) => {
      const elapsed = performance.now() - startTime;
      console.log(`⏱️ [PERF] ${label}: ${elapsed.toFixed(1)}ms`);
    } : () => {};

    if (!order || !order.status) return;

    const selectionKeys = new Set(Array.from(selectedCartItemIds, (key) => String(key)));
    const hasUnconfirmedSelected = cartItems.some(
      (item) => selectionKeys.has(String(item.unique_id || item.id)) && !item.confirmed
    );

    if (hasUnconfirmedSelected) {
      showToast(t("Selected items must be confirmed before payment"));
      return;
    }

    const confirmTotal = discountedTotal;

    // ✅ Allow phone orders to close even if empty
    if (cartItems.length === 0) {
      if (orderType === "phone") {
        if (!order?.id) {
          debugNavigate("/orders");
          return;
        }
        if (String(order?.status || "").toLowerCase() === "closed") {
          debugNavigate("/orders");
          return;
        }
        try {
          await txApiRequest(`/orders/${order.id}/close${identifier}`, { method: "POST" });
          debugNavigate("/orders");
          return;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.toLowerCase().includes("already closed")) {
            debugNavigate("/orders");
            return;
          }
          console.error("❌ Failed to close empty phone order:", err);
          showToast("Failed to close phone order");
          return;
        }
      } else {
        await resetTableGuests(order?.table_number ?? order?.tableNumber);
        broadcastTableOverviewOrderStatus("closed");
        navigate("/tableoverview?tab=tables");
        return;
      }
    }

    // 1️⃣ If closing, block if any item is preparing
    if (
      getPrimaryActionLabel() === "Close" &&
      hasPreparingItems(receiptItems.concat(cartItems))
    ) {
      showToast(t("Table cannot be closed: preparing"));
      return;
    }

    // 2️⃣ Confirm unconfirmed items first
    if (hasUnconfirmedCartItems) {
      const isPhoneConfirmAction =
        orderType === "phone" && getPrimaryActionLabel() === "Confirm";
      const previousOrderSnapshot = order ? { ...order } : order;
      const previousCartSnapshot = Array.isArray(cartItems) ? [...cartItems] : [];
      const unconfirmedItems = safeCartItems.filter((i) => !i.confirmed);

      // ✅ STEP 1: Instant optimistic UI (do not wait for network)
      setOrder((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
      setCartItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((i) => (i.confirmed ? i : { ...i, confirmed: true }))
      );
      if (isDev) console.log("⚡ Optimistic confirm applied");

      if (window && window.playNewOrderSound) window.playNewOrderSound();

      const sendUnconfirmedItemsToKitchen = async (resolvedOrderId) => {
        if (!resolvedOrderId || unconfirmedItems.length === 0) return true;
        const t1 = isDev ? performance.now() : 0;
        try {
          await txApiRequest(`/orders/order-items${identifier}`, {
            method: "POST",
            body: JSON.stringify({
              order_id: resolvedOrderId,
              receipt_id: null,
              items: unconfirmedItems.map((i) => ({
                product_id: i.id,
                quantity: i.quantity,
                price: i.price,
                ingredients: i.ingredients,
                extras: (i.extras || []).map((ex) => ({
                  ...ex,
                  amount: Number(ex.amount) || 1,
                  unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase(),
                })),
                unique_id: i.unique_id,
                note: i.note || null,
                confirmed: true,
                kitchen_status: "new",
                payment_method: null,
                receipt_id: null,
                discountType: discountValue > 0 ? discountType : null,
                discountValue: discountValue > 0 ? discountValue : 0,
              })),
            }),
          });
          if (isDev) perfLog("order-items POST", t1);
          return true;
        } catch (err) {
          console.error("❌ Failed to send items to kitchen:", err);
          showToast(t("Failed to send items to kitchen"));
          return false;
        }
      };

      // ✅ STEP 2: Server reconciliation
      const t0 = isDev ? performance.now() : 0;
      let updated;
      try {
        const currentOrderId = Number(order?.id);
        const hasCurrentOrderId = Number.isFinite(currentOrderId) && currentOrderId > 0;

        if (hasCurrentOrderId) {
          if (isPhoneConfirmAction) {
            // Prioritize instant navigation for phone flow: don't block on kitchen POST.
            updated = await updateOrderStatus("confirmed", confirmTotal);
            sendUnconfirmedItemsToKitchen(currentOrderId).catch((err) => {
              console.warn("⚠️ Phone confirm background kitchen sync failed:", err);
            });
          } else {
            // Run in parallel to avoid additive latency from two sequential requests.
            const results = await Promise.all([
              updateOrderStatus("confirmed", confirmTotal),
              sendUnconfirmedItemsToKitchen(currentOrderId),
            ]);
            updated = results[0];
          }
        } else {
          updated = await updateOrderStatus("confirmed", confirmTotal);
          if (updated?.id) {
            if (isPhoneConfirmAction) {
              sendUnconfirmedItemsToKitchen(updated.id).catch((err) => {
                console.warn("⚠️ Phone confirm background kitchen sync failed:", err);
              });
            } else {
              await sendUnconfirmedItemsToKitchen(updated.id);
            }
          }
        }

        if (isDev) perfLog("updateOrderStatus", t0);
        if (!updated) {
          setOrder(previousOrderSnapshot);
          setCartItems(previousCartSnapshot);
          return;
        }
      } catch (err) {
        console.error("❌ Failed to confirm order:", err);
        setOrder(previousOrderSnapshot);
        setCartItems(previousCartSnapshot);
        showToast(t("Failed to confirm order"));
        return;
      }

      if (isPhoneConfirmAction) {
        setHeader((prev) => ({ ...prev, subtitle: "" }));
        debugNavigate("/orders");
        return;
      }

      // ✅ STEP 3: Background reconciliation (don't block UI)
      const t2 = isDev ? performance.now() : 0;
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => {
          fetchOrderItems(updated.id).then(() => {
            if (isDev) perfLog("fetchOrderItems (background)", t2);
          }).catch((err) => {
            console.warn("⚠️ Background refresh failed:", err);
          });
        });
      } else {
        setTimeout(() => {
          fetchOrderItems(updated.id).then(() => {
            if (isDev) perfLog("fetchOrderItems (background)", t2);
          }).catch((err) => {
            console.warn("⚠️ Background refresh failed:", err);
          });
        }, 0);
      }

      // 🚪 Optionally leave Transaction screen after confirm (table only)
      if (orderType === "table" && transactionSettings.autoNavigateTableAfterConfirm) {
        setIsFloatingCartOpen(false);
        scheduleNavigate("/tableoverview?tab=tables", 200);
      }

      // 🥡 TAKEAWAY — confirm but STAY here (no navigate, no payment modal)
      if (orderType === "takeaway" && getPrimaryActionLabel() === "Confirm") {
        setHeader((prev) => ({ ...prev, subtitle: "" }));
        // 🚫 Do NOT open pay modal or navigate
        return;
      }

      // ✅ Do NOT auto-open payment modal; user must tap Pay
      return;
    }

    // If there are unpaid items after confirmation, this button acts as Pay Later (leave unpaid)
    if (hasConfirmedCartUnpaid || hasSuborderUnpaid) {
      setIsFloatingCartOpen(false);
      navigate("/tableoverview?tab=tables");
      return;
    }

    if (orderType === "phone" && order.status !== "closed") {
      // ✅ Allow phone orders to close after payment
      try {
        await txApiRequest(`/orders/${order.id}/close${identifier}`, { method: "POST" });
        debugNavigate("/orders");
        showToast(t("Phone order closed successfully"));
      } catch (err) {
        console.error("❌ Failed to close phone order:", err);
        showToast(t("Failed to close phone order"));
      }
      return;
    }

    // 🧠 For table orders → close ONLY when user manually presses “Close”
    // 🧠 For table orders → close ONLY when all items are delivered
    if (getPrimaryActionLabel() === "Close" && (order.status === "paid" || allPaidIncludingSuborders)) {
      const reservationSource = existingReservation ?? order;
      const schedule = getReservationSchedule(reservationSource);
      if (schedule && isEarlyReservationClose(reservationSource)) {
        const ok = await requestReservationCloseConfirmation(schedule);
        if (!ok) return;
      }

      // Re-check against the latest backend state so we don't block close due to stale kitchen_status/category
      // (and so excluded-from-kitchen items don't show a brief "Not delivered yet" toast).
      let itemsToCheck = cartItems;
      try {
        const latest = await txApiRequest(`/orders/${order.id}/items${identifier}`);
        if (Array.isArray(latest)) {
          itemsToCheck = latest.map((row) => ({
            id: row.product_id,
            category: row.category || null,
            kitchen_status: row.kitchen_status || "",
          }));
        }
      } catch (err) {
        console.warn("⚠️ Failed to refresh order items before close:", err);
      }

      const allDelivered = allItemsDelivered(itemsToCheck);

      // ❌ Not all delivered → don’t close; show message and bounce to TableOverview after 3s
      if (!allDelivered) {
        showToast("⚠️ " + t("Cannot close: some kitchen items not yet delivered!"));
        scheduleNavigate("/tableoverview?tab=tables", 800);
        return;
      }

      // ✅ All delivered → close and go immediately
      try {
        await txApiRequest(`/orders/${order.id}/close${identifier}`, { method: "POST" });
        await resetTableGuests(order?.table_number ?? order?.tableNumber);
        setDiscountValue(0);
        setDiscountType("percent");
        broadcastTableOverviewOrderStatus("closed");
        debugNavigate("/tableoverview?tab=tables"); // <— correct route
      } catch (err) {
        console.error("❌ Close failed:", err);
        showToast(t("Failed to close table"));
      }
    }
  }

  return {
    hasPreparingItems,
    handleMultifunction,
  };
}
