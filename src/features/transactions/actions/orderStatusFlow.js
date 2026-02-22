export function createOrderStatusFlow(deps) {
  const {
    order,
    orderId,
    tableId,
    orderType,
    phoneOrderDraft,
    selectedPaymentMethod,
    phoneOrderCreatePromiseRef,
    txApiRequest,
    identifier,
    setOrder,
    showToast,
    t,
    resolvePaymentLabel,
  } = deps;

  async function updateOrderStatus(newStatus = null, total = null, method = null) {
    let targetId = order?.id || (orderId && String(orderId) !== "new" ? orderId : null) || tableId;
    if (!targetId) {
      if (orderType === "phone") {
        try {
          const payload = {
            order_type: "phone",
            status: "draft",
            customer_name:
              order?.customer_name ??
              phoneOrderDraft?.customer_name ??
              phoneOrderDraft?.customerName ??
              "",
            customer_phone:
              order?.customer_phone ??
              phoneOrderDraft?.customer_phone ??
              phoneOrderDraft?.customerPhone ??
              "",
            customer_address:
              order?.customer_address ??
              phoneOrderDraft?.customer_address ??
              phoneOrderDraft?.customerAddress ??
              "",
            payment_method:
              order?.payment_method ??
              phoneOrderDraft?.payment_method ??
              phoneOrderDraft?.paymentMethod ??
              selectedPaymentMethod ??
              "",
            total: 0,
          };

          // Avoid creating duplicate phone orders when multiple actions race.
          // If a create request is already in-flight, reuse it.
          let created = null;
          if (phoneOrderCreatePromiseRef.current) {
            created = await phoneOrderCreatePromiseRef.current;
          } else {
            const promise = (async () => {
              const result = await txApiRequest(`/orders${identifier}`, {
                method: "POST",
                body: JSON.stringify(payload),
              });
              if (!result?.id) {
                throw new Error(result?.error || "Failed to create order");
              }
              setOrder((prev) => (prev ? { ...prev, ...result } : result));
              return result;
            })();
            phoneOrderCreatePromiseRef.current = promise;
            promise.finally(() => {
              if (phoneOrderCreatePromiseRef.current === promise) {
                phoneOrderCreatePromiseRef.current = null;
              }
            });
            created = await promise;
          }

          if (!created?.id) throw new Error(created?.error || "Failed to create order");
          targetId = created.id;
        } catch (err) {
          console.error("❌ Failed to create phone order:", err);
          showToast(err?.message || t("Failed to create phone order"));
          return null;
        }
      } else {
        console.error("❌ No order ID found.");
        showToast("Invalid order ID");
        return null;
      }
    }

    const prevOrderTotal = Number(order?.total || 0);

    try {
      const body = {
        status: newStatus || undefined,
        payment_status: newStatus === "paid" ? "paid" : undefined,
        total: total ?? order?.total ?? undefined,
        payment_method:
          method ||
          order?.payment_method ||
          resolvePaymentLabel(selectedPaymentMethod) ||
          "Unknown",
      };

      const updated = await txApiRequest(`/orders/${targetId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!updated || updated.error) throw new Error(updated?.error || "Failed to update order status");

      // ✅ TableOverview timer start: when a table order transitions from "effectively free" (0 total)
      // to having a real total, start the timer at 00:00 even if TableOverview isn't mounted.
      try {
        const nextStatus = String(newStatus || updated.status || "").toLowerCase();
        const nextTotal = Number(total ?? updated.total ?? 0);
        const tableNumber = updated?.table_number;

        if (
          nextStatus === "confirmed" &&
          tableNumber != null &&
          Number.isFinite(nextTotal) &&
          nextTotal > 0 &&
          (!Number.isFinite(prevOrderTotal) || prevOrderTotal <= 0)
        ) {
          const restaurantId =
            (typeof window !== "undefined" && window?.localStorage?.getItem("restaurant_id")) ||
            "global";
          const key = `hurrypos:${restaurantId}:tableOverview.confirmedTimers.v1`;
          const raw = window?.localStorage?.getItem(key);
          const parsed = raw ? JSON.parse(raw) : null;
          const timers = parsed && typeof parsed === "object" ? parsed : {};
          timers[String(Number(tableNumber))] = Date.now();
          window?.localStorage?.setItem(key, JSON.stringify(timers));
        }
      } catch {
        // ignore localStorage errors
      }

      setOrder(updated);
      console.log("Order status updated:", updated.status, updated.payment_status);
      return updated;
    } catch (error) {
      console.error("❌ Error updating order status:", error);
      showToast(error.message || "Failed to update order status");
      return null;
    }
  }

  return { updateOrderStatus };
}
