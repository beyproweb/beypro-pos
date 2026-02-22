import { useCallback, useEffect, useMemo, useState } from "react";
import { logCashRegisterEvent } from "../../../../utils/cashDrawer";
import { getPaymentMethodLabel } from "../../../../utils/paymentMethods";
import { calcDiscountedTotal } from "../../shared/orderMath";
import { isOnlinePaymentMethod } from "../../shared/guards";
import { UNPAID_PAYMENT_METHOD } from "../../shared/constants";
import { REFUND_MODES } from "../constants/cancelConstants";

export function useCancelFlow({
  methodOptionSource,
  actions,
  propOrders,
  t,
  toast,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [cancelOrder, setCancelOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [refundMethodId, setRefundMethodId] = useState("");
  const [refundMode, setRefundMode] = useState(REFUND_MODES.REFUND);

  const getDefaultRefundMethod = useCallback(
    (order) => {
      if (!methodOptionSource.length) return "";
      const normalizedOrderPayment = (order?.payment_method || "").trim().toLowerCase();
      if (!normalizedOrderPayment) {
        return methodOptionSource[0].id;
      }
      const match = methodOptionSource.find((method) => {
        const label = (method.label || "").trim().toLowerCase();
        const id = (method.id || "").trim().toLowerCase();
        return label === normalizedOrderPayment || id === normalizedOrderPayment;
      });
      return match?.id || methodOptionSource[0].id;
    },
    [methodOptionSource]
  );

  useEffect(() => {
    if (!methodOptionSource.length) return;
    setRefundMethodId((prev) => {
      if (prev && methodOptionSource.some((method) => method.id === prev)) {
        return prev;
      }
      return getDefaultRefundMethod(cancelOrder);
    });
  }, [cancelOrder, getDefaultRefundMethod, methodOptionSource]);

  const isOrderPaid = useCallback((order) => {
    const status = String(order?.status || "").trim().toLowerCase();
    const paymentStatus = String(order?.payment_status || "").trim().toLowerCase();
    if (order?.is_paid === true || status === "paid" || paymentStatus === "paid") {
      return true;
    }
    return isOnlinePaymentMethod(order?.payment_method);
  }, []);

  const discountedTotal = useMemo(
    () => (cancelOrder ? calcDiscountedTotal(cancelOrder) : 0),
    [cancelOrder]
  );

  const refundAmount = useMemo(
    () => (cancelOrder && isOrderPaid(cancelOrder) ? discountedTotal : 0),
    [cancelOrder, discountedTotal, isOrderPaid]
  );

  const isUnpaidPaymentMethod = useMemo(
    () =>
      (cancelOrder?.payment_method || "").toLowerCase().trim() ===
      UNPAID_PAYMENT_METHOD,
    [cancelOrder?.payment_method]
  );

  const shouldShowRefundMethod = useMemo(
    () => refundAmount > 0 && !isUnpaidPaymentMethod,
    [isUnpaidPaymentMethod, refundAmount]
  );

  const openCancelModalForOrder = useCallback(
    (order) => {
      if (!order) return;
      setCancelOrder(order);
      setCancelReason("");
      setCancelLoading(false);
      setRefundMode(REFUND_MODES.REFUND);
      setRefundMethodId(getDefaultRefundMethod(order));
      setIsOpen(true);
    },
    [getDefaultRefundMethod]
  );

  const closeCancelModal = useCallback(() => {
    setIsOpen(false);
    setCancelOrder(null);
    setCancelReason("");
    setCancelLoading(false);
    setRefundMode(REFUND_MODES.REFUND);
  }, []);

  const submitCancel = useCallback(async () => {
    if (!cancelOrder?.id) {
      toast.error(t("Select an order first"));
      return;
    }
    const trimmedReason = cancelReason.trim();
    if (!trimmedReason) {
      toast.warn(t("Enter a cancellation reason."));
      return;
    }

    const shouldProcessRefund =
      shouldShowRefundMethod && refundMode !== REFUND_MODES.NO_REFUND;

    setCancelLoading(true);
    try {
      const payload = { reason: trimmedReason };
      if (shouldProcessRefund && refundMethodId) {
        payload.refund_method = refundMethodId;
      }

      const result = await actions.cancelOrder?.(cancelOrder.id, payload);

      if (refundAmount > 0 && shouldProcessRefund) {
        const refundLabel =
          getPaymentMethodLabel(methodOptionSource, refundMethodId) ||
          refundMethodId ||
          t("Unknown");
        const note = cancelOrder?.id
          ? `Refund for Order #${cancelOrder.id} (${refundLabel})`
          : t("Refund recorded");
        try {
          await logCashRegisterEvent({
            type: "expense",
            amount: Number(refundAmount.toFixed(2)),
            note,
          });
        } catch (logErr) {
          globalThis.console.warn("⚠️ Refund log failed:", logErr);
        }
      }

      if (result?.externalSync?.ok === false) {
        toast.warn(t("Order cancelled, but external sync failed."));
      } else {
        toast.success(t("Order cancelled"));
      }
      actions.removeOrderFromState?.(cancelOrder.id);
      closeCancelModal();
      if (!propOrders) await actions.fetchOrders?.();
    } catch (err) {
      globalThis.console.error("❌ Cancel order failed:", err);
      toast.error(err?.message || t("Failed to cancel order"));
    } finally {
      setCancelLoading(false);
    }
  }, [
    actions,
    cancelOrder,
    cancelReason,
    closeCancelModal,
    methodOptionSource,
    propOrders,
    refundAmount,
    refundMethodId,
    refundMode,
    shouldShowRefundMethod,
    t,
    toast,
  ]);

  const cancelModalProps = useMemo(
    () => ({
      open: isOpen,
      order: cancelOrder,
      cancelReason,
      onCancelReasonChange: setCancelReason,
      cancelLoading,
      refundMethodId,
      onRefundMethodIdChange: setRefundMethodId,
      refundMode,
      onRefundModeChange: setRefundMode,
      shouldShowRefundMethod,
      refundAmount,
      onClose: closeCancelModal,
      onSubmit: submitCancel,
    }),
    [
      cancelLoading,
      cancelOrder,
      cancelReason,
      closeCancelModal,
      isOpen,
      refundAmount,
      refundMethodId,
      refundMode,
      shouldShowRefundMethod,
      submitCancel,
    ]
  );

  return {
    isOpen,
    cancelOrder,
    cancelReason,
    setCancelReason,
    cancelLoading,
    refundMethodId,
    setRefundMethodId,
    refundMode,
    setRefundMode,
    refundAmount,
    shouldShowRefundMethod,
    openCancelModalForOrder,
    closeCancelModal,
    submitCancel,
    cancelModalProps,
  };
}
