export function createCloseFlow(deps) {
  const {
    txApiRequest,
    identifier,
    order,
    orderType,
    transactionSettings,
    paymentMethods,
    selectedPaymentMethod,
    existingReservationRef,
    getReservationSchedule,
    broadcastTableOverviewOrderStatus,
    navigate,
    excludedItemsSet,
    excludedCategoriesSet,
  } = deps;

  function hasActiveReservation(orderLike) {
    if (!orderLike || typeof orderLike !== "object") return false;
    const reservation = orderLike?.reservation && typeof orderLike.reservation === "object"
      ? orderLike.reservation
      : null;
    const reservationDate =
      reservation?.reservation_date ??
      orderLike?.reservation_date ??
      orderLike?.reservationDate ??
      null;
    const reservationTime =
      reservation?.reservation_time ??
      orderLike?.reservation_time ??
      orderLike?.reservationTime ??
      null;
    const reservationId = reservation?.id;
    return Boolean(getReservationSchedule(orderLike) || reservationDate || reservationTime || reservationId != null);
  }

  function isReservationMissingError(err) {
    const message = String(err?.message || err || "").toLowerCase();
    return (
      message.includes("not found") ||
      message.includes("no reservation") ||
      message.includes("already deleted")
    );
  }

  async function autoDeleteReservationForPaidClose(reservationSource) {
    const orderId = Number(order?.id ?? reservationSource?.order_id ?? reservationSource?.id);
    const reservationId = Number(
      reservationSource?.reservation?.id ??
      reservationSource?.reservation_id ??
      reservationSource?.reservationId
    );

    let lastErr = null;

    if (Number.isFinite(orderId) && orderId > 0) {
      try {
        await txApiRequest(`/orders/${orderId}/reservations${identifier}`, { method: "DELETE" });
        return true;
      } catch (err) {
        if (isReservationMissingError(err)) return true;
        lastErr = err;
      }
    }

    if (Number.isFinite(reservationId) && reservationId > 0) {
      try {
        await txApiRequest(`/orders/reservations/${reservationId}${identifier}`, { method: "DELETE" });
        return true;
      } catch (err) {
        if (isReservationMissingError(err)) return true;
        lastErr = err;
      }
    }

    if (lastErr) throw lastErr;
    return false;
  }

  async function resetTableGuests(tableNumber) {
    const normalizedNumber =
      tableNumber === null || tableNumber === undefined
        ? NaN
        : Number(tableNumber);
    if (!Number.isFinite(normalizedNumber)) return;

    try {
      await txApiRequest(`/tables/${normalizedNumber}${identifier}`, {
        method: "PATCH",
        body: JSON.stringify({ guests: null }),
      });
    } catch (err) {
      console.warn("⚠️ Failed to reset table guests:", err);
    }
  }

  function allItemsDelivered(items) {
    return Array.isArray(items) && items.every((item) => {
      // If the product is excluded from kitchen, skip from delivery check
      const itemId = String(item?.id ?? item?.product_id ?? "");
      const category = String(item?.category ?? "").trim().toLowerCase();
      const isExcluded =
        (itemId && excludedItemsSet.has(itemId)) ||
        (category && excludedCategoriesSet.has(category));

      const status = String(item?.kitchen_status ?? "").toLowerCase();
      return (
        isExcluded ||
        !status ||
        status === "delivered" ||
        status === "packet_delivered"
      );
    });
  }

  async function runAutoCloseIfConfigured(shouldClose, paymentMethodIds = null) {
    if (!shouldClose || !order?.id) return;

    const shouldAutoCloseTable =
      orderType === "table" && transactionSettings.autoCloseTableAfterPay;
    const isPacketType = ["packet", "phone", "online"].includes(orderType);

    const packetMethodsSetting = transactionSettings.autoClosePacketAfterPayMethods;
    const packetAllowsAll =
      packetMethodsSetting === null || typeof packetMethodsSetting === "undefined";
    const allowedPacketMethodIds = Array.isArray(packetMethodsSetting)
      ? packetMethodsSetting.filter(Boolean)
      : null;

    const normalizePaymentKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

    const deriveUsedPacketMethodIds = () => {
      if (Array.isArray(paymentMethodIds) && paymentMethodIds.length > 0) {
        return paymentMethodIds.filter(Boolean);
      }

      const raw = String(order?.payment_method || "").trim();
      const tokens = raw
        ? raw
            .split(/[+,]/)
            .map((part) => part.trim())
            .filter(Boolean)
        : [];

      const derived = tokens
        .map((token) => {
          const norm = normalizePaymentKey(token);
          const match = (Array.isArray(paymentMethods) ? paymentMethods : []).find((m) => {
            const idNorm = normalizePaymentKey(m.id);
            const labelNorm = normalizePaymentKey(m.label);
            return idNorm === norm || labelNorm === norm;
          });
          return match?.id || null;
        })
        .filter(Boolean);

      if (derived.length === 0 && selectedPaymentMethod) {
        derived.push(selectedPaymentMethod);
      }

      return derived;
    };

    const packetMethodAllowed = (() => {
      if (packetAllowsAll) return true;
      if (!Array.isArray(allowedPacketMethodIds)) return true;
      if (allowedPacketMethodIds.length === 0) return false; // explicit "none selected"

      const usedIds = deriveUsedPacketMethodIds();
      if (usedIds.length === 0) return true; // unknown method => keep legacy behavior
      return usedIds.some((id) => allowedPacketMethodIds.includes(id));
    })();

    const shouldAutoClosePacket =
      isPacketType && transactionSettings.autoClosePacketAfterPay && packetMethodAllowed;

    if (!shouldAutoCloseTable && !shouldAutoClosePacket) return;

    if (shouldAutoCloseTable) {
      const reservationSource = existingReservationRef.current ?? order;
      if (hasActiveReservation(reservationSource)) {
        try {
          const deleted = await autoDeleteReservationForPaidClose(reservationSource);
          if (!deleted) return;
        } catch (err) {
          console.warn("⚠️ Auto-delete reservation before auto-close failed:", err?.message || err);
          return;
        }
      }
    }

    try {
      await txApiRequest(`/orders/${order.id}/close${identifier}`, { method: "POST" });
      await resetTableGuests(order?.table_number ?? order?.tableNumber);
      broadcastTableOverviewOrderStatus("closed");
    } catch (err) {
      console.warn("⚠️ Auto-close failed:", err?.message || err);
    }

    navigate(shouldAutoCloseTable ? "/tableoverview?tab=tables" : "/orders");
  }

  return {
    resetTableGuests,
    allItemsDelivered,
    runAutoCloseIfConfigured,
  };
}
