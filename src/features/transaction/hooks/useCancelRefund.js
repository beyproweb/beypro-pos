import { useCallback, useEffect, useState } from "react";
import { getPaymentMethodLabel } from "../../../utils/paymentMethods";

export const useCancelRefund = ({
  t,
  order,
  normalizedStatus,
  selectedCartItems,
  selectionQuantities,
  setSelectionQuantities,
  paymentMethods,
  shouldShowRefundMethod,
  selectedPaidRefundAmount,
  refundAmount,
  isCashMethod,
  showToast,
  txApiRequest,
  identifier,
  fetchOrderItems,
  setOrder,
  clearCartState,
  setSelectedCartItemIds,
  clearRegisterSummaryCache,
  clearRegisterDataCache,
  txLogCashRegisterEvent,
  setShowCancelModal,
}) => {
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [refundMethodId, setRefundMethodId] = useState("");

  const getDefaultRefundMethod = useCallback(() => {
    if (!paymentMethods.length) return "";
    const normalizedOrderPayment = (order?.payment_method || "").trim().toLowerCase();
    if (!normalizedOrderPayment) {
      return paymentMethods[0].id;
    }
    const match = paymentMethods.find((method) => {
      const label = (method.label || "").trim().toLowerCase();
      const id = (method.id || "").trim().toLowerCase();
      return label === normalizedOrderPayment || id === normalizedOrderPayment;
    });
    return match?.id || paymentMethods[0].id;
  }, [order?.payment_method, paymentMethods]);

  useEffect(() => {
    if (!paymentMethods.length) return;
    setRefundMethodId((prev) => {
      if (prev && paymentMethods.some((method) => method.id === prev)) {
        return prev;
      }
      return getDefaultRefundMethod();
    });
  }, [getDefaultRefundMethod, paymentMethods]);

  const openCancelModal = useCallback(() => {
    if (!order?.id) return;
    const canCancelStatus =
      normalizedStatus === "confirmed" ||
      normalizedStatus === "paid" ||
      normalizedStatus === "reserved";
    if (!canCancelStatus) {
      showToast(t("Order must be confirmed, reserved, or paid before cancelling."));
      return;
    }
    if (selectedCartItems.length === 0) {
      showToast(t("Select item to cancel"));
      return;
    }
    setCancelReason("");
    setSelectionQuantities({});
    setRefundMethodId(getDefaultRefundMethod());
    setShowCancelModal(true);
  }, [
    getDefaultRefundMethod,
    order?.id,
    normalizedStatus,
    selectedCartItems.length,
    t,
    setSelectionQuantities,
    showToast,
    setShowCancelModal,
  ]);

  const closeCancelModal = useCallback(() => {
    setShowCancelModal(false);
    setCancelReason("");
    setSelectionQuantities({});
  }, [setSelectionQuantities, setShowCancelModal]);

  const handleCancelConfirm = useCallback(async () => {
    if (!order?.id) {
      showToast(t("Select an order first"));
      return;
    }
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      showToast(t("Enter a cancellation reason."));
      return;
    }
    const selectedItemsForCancel = selectedCartItems
      .flatMap((item) => {
        const selectionKey = String(item.cancel_key || item.unique_id || item.id || "");
        if (!selectionKey) return [];

        const targets = Array.isArray(item.cancel_targets)
          ? item.cancel_targets.filter((target) => target?.unique_id)
          : [];

        const totalMaxQty =
          targets.length > 0
            ? targets.reduce(
                (sum, target) => sum + Math.max(1, Number(target.maxQty) || 1),
                0
              )
            : Math.max(1, Number(item.quantity) || 1);

        let remaining = Math.min(
          Math.max(1, Number(selectionQuantities[selectionKey]) || 1),
          totalMaxQty
        );

        if (!targets.length) {
          const uniqueId = item.unique_id || item.id;
          if (!uniqueId) return [];
          return [{ unique_id: String(uniqueId), quantity: remaining }];
        }

        const allocations = [];
        for (const target of targets) {
          if (remaining <= 0) break;
          const maxQty = Math.max(1, Number(target.maxQty) || 1);
          const qty = Math.min(remaining, maxQty);
          allocations.push({ unique_id: String(target.unique_id), quantity: qty });
          remaining -= qty;
        }
        return allocations;
      })
      .filter((entry) => entry && entry.unique_id && Number(entry.quantity) > 0);
    const isPartialCancel = selectedItemsForCancel.length > 0;
    if (!isPartialCancel) {
      showToast(t("Select item to cancel"));
      return;
    }

    setCancelLoading(true);
    try {
      const payload = { reason: trimmedReason };
      if (shouldShowRefundMethod && refundMethodId) {
        payload.refund_method = refundMethodId;
      }
      if (isPartialCancel) {
        payload.items = selectedItemsForCancel;
      }

      const cancelResult = await txApiRequest(`/orders/${order.id}/cancel`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const orderIsCancelled = cancelResult?.orderCancelled ?? !isPartialCancel;
      const refundTargetAmount = isPartialCancel ? selectedPaidRefundAmount : refundAmount;
      if (refundTargetAmount > 0 && shouldShowRefundMethod) {
        const refundLabel =
          getPaymentMethodLabel(paymentMethods, refundMethodId) ||
          refundMethodId ||
          t("Unknown");
        const note = order?.id
          ? `Refund for Order #${order.id} (${refundLabel})`
          : t("Refund recorded");
        const refundIsCash = isCashMethod(refundMethodId);
        try {
          if (refundIsCash) {
            await txLogCashRegisterEvent({
              type: "expense",
              amount: Number(refundTargetAmount.toFixed(2)),
              note,
            });
            clearRegisterSummaryCache();
            clearRegisterDataCache();
          }
        } catch (logErr) {
          console.warn("⚠️ Refund log failed:", logErr);
        }
      }
      if (orderIsCancelled) {
        showToast(t("Order cancelled"));
        clearCartState();
        setOrder((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
        setShowCancelModal(false);
        return;
      }

      showToast(t("Selected items cancelled"));
      await fetchOrderItems(order.id);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              total:
                typeof cancelResult?.newTotal === "number"
                  ? cancelResult.newTotal
                  : prev.total,
            }
          : prev
      );
      setSelectedCartItemIds(new Set());
      setShowCancelModal(false);
    } catch (err) {
      console.error("❌ Cancel order failed:", err);
      showToast(err?.message || t("Failed to cancel order"));
    } finally {
      setCancelLoading(false);
    }
  }, [
    order?.id,
    cancelReason,
    selectedCartItems,
    selectionQuantities,
    shouldShowRefundMethod,
    refundMethodId,
    selectedPaidRefundAmount,
    refundAmount,
    paymentMethods,
    isCashMethod,
    txLogCashRegisterEvent,
    clearRegisterSummaryCache,
    clearRegisterDataCache,
    t,
    txApiRequest,
    identifier,
    fetchOrderItems,
    setOrder,
    clearCartState,
    setSelectedCartItemIds,
    showToast,
  ]);

  return {
    cancelReason,
    setCancelReason,
    cancelLoading,
    refundMethodId,
    setRefundMethodId,
    openCancelModal,
    closeCancelModal,
    handleCancelConfirm,
  };
};
