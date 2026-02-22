import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  calcDiscountedTotal,
  rebalanceTwoWaySplit,
  resolveAutoClosePaymentMethod,
  shouldAutoClosePacketOnDelivered as shouldAutoClosePacketOnDeliveredRule,
} from "../utils/paymentMath";
import {
  isOnlinePaymentMethod,
  normalizeDriverStatus,
} from "../../shared/guards";

export function usePaymentFlow({
  fallbackMethodLabel,
  methodOptionSource,
  transactionSettings,
  orders,
  emitToast,
  t,
  propOrders,
  actions,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [splitPayments, setSplitPayments] = useState([{ method: "", amount: "" }]);
  const [pendingCloseOrderId, setPendingCloseOrderId] = useState(null);
  const autoClosingDeliveredRef = useRef(new Set());

  const grandTotal = useMemo(() => {
    if (!editingOrder) return 0;
    return calcDiscountedTotal(editingOrder);
  }, [editingOrder]);

  const paidTotal = useMemo(
    () => splitPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    [splitPayments]
  );

  const remaining = useMemo(() => grandTotal - paidTotal, [grandTotal, paidTotal]);

  const openPaymentModalForOrder = useCallback(
    (order, { closeAfterSave = false } = {}) => {
      if (!order) return;
      const total = calcDiscountedTotal(order);
      setEditingOrder(order);
      setPendingCloseOrderId(closeAfterSave ? order.id : null);
      setSplitPayments([
        {
          method: fallbackMethodLabel,
          amount: total > 0 && closeAfterSave ? total.toFixed(2) : "",
        },
      ]);
      setIsOpen(true);
    },
    [fallbackMethodLabel]
  );

  const closePaymentModal = useCallback(() => {
    setIsOpen(false);
    setEditingOrder(null);
    setPendingCloseOrderId(null);
  }, []);

  useEffect(() => {
    if (isOpen && editingOrder) {
      const fetchSplit = async () => {
        try {
          if (editingOrder.receipt_id) {
            const split = await actions.fetchReceiptMethods?.(editingOrder.receipt_id);

            if (Array.isArray(split) && split.length) {
              setSplitPayments(
                split.map((row) => ({
                  method: row.payment_method,
                  amount: row.amount,
                }))
              );
              return;
            }
          }

          const discounted = calcDiscountedTotal(editingOrder);

          setSplitPayments([
            {
              method: editingOrder.payment_method || fallbackMethodLabel,
              amount: discounted,
            },
          ]);
        } catch (err) {
          globalThis.console.warn("⚠️ Failed to fetch split payments:", err);

          const discounted = calcDiscountedTotal(editingOrder);
          setSplitPayments([
            {
              method: editingOrder.payment_method || fallbackMethodLabel,
              amount: discounted,
            },
          ]);
        }
      };

      fetchSplit();
    }
  }, [actions, editingOrder, fallbackMethodLabel, isOpen]);

  const addSplitPaymentRow = useCallback(() => {
    setSplitPayments((prev) => [...prev, { method: fallbackMethodLabel, amount: "" }]);
  }, [fallbackMethodLabel]);

  const removeSplitPaymentRow = useCallback((index) => {
    setSplitPayments((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  }, []);

  const updateSplitPaymentMethod = useCallback((index, method) => {
    setSplitPayments((prev) => {
      const copy = [...prev];
      copy[index].method = method;
      return copy;
    });
  }, []);

  const updateSplitPaymentAmount = useCallback(
    (index, value) => {
      setSplitPayments((prev) => rebalanceTwoWaySplit(prev, index, value, grandTotal));
    },
    [grandTotal]
  );

  const submitPayment = useCallback(async () => {
    if (!editingOrder) return;

    const receiptId = editingOrder.receipt_id || uuidv4();
    const cleanedSplits = {};
    splitPayments.forEach((payment) => {
      if (payment.method && payment.amount > 0) {
        cleanedSplits[payment.method] = Number(payment.amount);
      }
    });
    const shouldCloseAfterSave =
      pendingCloseOrderId && pendingCloseOrderId === editingOrder.id;

    await actions.createReceiptMethods?.({
      order_id: editingOrder.id,
      receipt_id: receiptId,
      methods: cleanedSplits,
    });

    await actions.updateOrder?.(editingOrder.id, {
      payment_method: splitPayments[0].method,
      total: grandTotal,
      receipt_id: receiptId,
    });

    if (shouldCloseAfterSave) {
      await actions.closeOrderIdempotent?.(editingOrder.id);
    }

    closePaymentModal();
    if (!shouldCloseAfterSave) await actions.fetchOrders?.();
  }, [
    actions,
    closePaymentModal,
    editingOrder,
    grandTotal,
    pendingCloseOrderId,
    splitPayments,
  ]);

  const shouldAutoClosePacketOnDelivered = useCallback(
    (order) =>
      shouldAutoClosePacketOnDeliveredRule({
        order,
        transactionSettings,
        methodOptionSource,
      }),
    [methodOptionSource, transactionSettings]
  );

  const closeOrderInstantly = useCallback(
    async (order) => {
      const orderId = order?.id;
      if (!orderId) return;

      const discountedTotal = calcDiscountedTotal(order);
      const isOnline = isOnlinePaymentMethod(order?.payment_method);

      if (!isOnline && discountedTotal > 0) {
        const receiptId = order.receipt_id || uuidv4();
        const method = resolveAutoClosePaymentMethod({
          order,
          transactionSettings,
          methodOptionSource,
          fallbackMethodLabel,
        });

        await actions.createReceiptMethods?.({
          order_id: orderId,
          receipt_id: receiptId,
          methods: { [method.label]: Number(discountedTotal.toFixed(2)) },
        });

        await actions.updateOrder?.(orderId, {
          payment_method: method.label,
          total: discountedTotal,
          receipt_id: receiptId,
        });
      }

      await actions.closeOrderIdempotent?.(orderId);
    },
    [actions, fallbackMethodLabel, methodOptionSource, transactionSettings]
  );

  useEffect(() => {
    if (!transactionSettings?.autoClosePacketAfterPay) return;
    if (!Array.isArray(orders) || orders.length === 0) return;

    const deliveredCandidates = orders.filter((order) => {
      const id = order?.id;
      if (!id) return false;
      if (autoClosingDeliveredRef.current.has(id)) return false;
      if (normalizeDriverStatus(order?.driver_status) !== "delivered") return false;
      return shouldAutoClosePacketOnDelivered(order);
    });

    if (deliveredCandidates.length === 0) return;

    deliveredCandidates.forEach((order) => {
      const id = order.id;
      autoClosingDeliveredRef.current.add(id);
      closeOrderInstantly(order).catch((err) => {
        autoClosingDeliveredRef.current.delete(id);
        globalThis.console.error("❌ Failed to auto-close delivered order:", err);
        emitToast?.("error", t("Failed to close order"));
        if (!propOrders) {
          actions.fetchOrders?.();
        }
      });
    });
  }, [
    actions,
    closeOrderInstantly,
    emitToast,
    orders,
    propOrders,
    shouldAutoClosePacketOnDelivered,
    t,
    transactionSettings?.autoClosePacketAfterPay,
  ]);

  const paymentModalProps = useMemo(
    () => ({
      open: isOpen,
      order: editingOrder,
      splitPayments,
      grandTotal,
      paidTotal,
      onClose: closePaymentModal,
      onMethodChange: updateSplitPaymentMethod,
      onAmountChange: updateSplitPaymentAmount,
      onRemoveRow: removeSplitPaymentRow,
      onAddRow: addSplitPaymentRow,
      onSubmit: submitPayment,
    }),
    [
      addSplitPaymentRow,
      closePaymentModal,
      editingOrder,
      grandTotal,
      isOpen,
      paidTotal,
      removeSplitPaymentRow,
      splitPayments,
      submitPayment,
      updateSplitPaymentAmount,
      updateSplitPaymentMethod,
    ]
  );

  return {
    isOpen,
    editingOrder,
    splitPayments,
    setSplitPayments,
    pendingCloseOrderId,
    grandTotal,
    paidTotal,
    remaining,
    isTotalValid: paidTotal === grandTotal,
    openPaymentModalForOrder,
    closePaymentModal,
    addSplitPaymentRow,
    removeSplitPaymentRow,
    updateSplitPaymentMethod,
    updateSplitPaymentAmount,
    submitPayment,
    shouldAutoClosePacketOnDelivered,
    closeOrderInstantly,
    paymentModalProps,
  };
}
