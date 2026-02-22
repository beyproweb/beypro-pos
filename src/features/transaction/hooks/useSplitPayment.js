import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { txIsCashLabel, txLogCashRegisterEvent, txOpenCashDrawer } from "../../transactions/services/transactionCash";

export const useSplitPayment = ({
  cartItems,
  selectedCartItemIds,
  selectionQuantities,
  discountValue,
  discountType,
  computeItemLineTotal,
  getPaymentItemKey,
  resolvePaymentLabel,
  txApiRequest,
  identifier,
  order,
  setSelectedCartItemIds,
  setOrder,
  dispatchOrdersLocalRefresh,
  broadcastTableOverviewOrderStatus,
  refreshReceiptAfterPayment,
  fetchOrderItems,
  fetchSubOrders,
  dispatchKitchenOrdersReload,
  runAutoCloseIfConfigured,
  setShowPaymentModal,
}) => {
  const confirmPaymentWithSplits = useCallback(
    async (splits) => {
      setShowPaymentModal(false);

      try {
        const splitMethodIds = Object.entries(splits || {})
          .filter(([, value]) => {
            const parsed = parseFloat(value);
            return !Number.isNaN(parsed) && parsed > 0;
          })
          .map(([methodId]) => methodId)
          .filter(Boolean);

        const selectionQty = new Map(
          Array.from(selectedCartItemIds).map((id) => {
            const key = String(id);
            const item = cartItems.find((i) => getPaymentItemKey(i) === key);
            const maxQty = Math.max(1, Number(item?.quantity) || 1);
            const desired = Number(selectionQuantities?.[key]) || maxQty;
            return [key, Math.min(Math.max(1, desired), maxQty)];
          })
        );

        const itemsToPay =
          selectedCartItemIds.size > 0
            ? cartItems.filter((i) => selectedCartItemIds.has(String(getPaymentItemKey(i))))
            : cartItems;

        let totalDue = itemsToPay.reduce((sum, i) => {
          const maxQty = Math.max(1, Number(i.quantity) || 1);
          const qty = selectionQty.get(getPaymentItemKey(i)) || maxQty;
          const perUnit = computeItemLineTotal(i) / maxQty;
          return sum + perUnit * qty;
        }, 0);

        if (discountValue > 0) {
          if (discountType === "percent") totalDue -= totalDue * (discountValue / 100);
          if (discountType === "fixed") totalDue = Math.max(0, totalDue - discountValue);
        }

        const receiptId = uuidv4();

        const enhancedItems = itemsToPay.map((i) => {
          const qty = selectionQty.get(getPaymentItemKey(i)) || Number(i.quantity) || 1;
          return {
            ...i,
            product_id: i.product_id || i.id,
            quantity: qty,
            price: i.price,
            ingredients: i.ingredients,
            extras: (i.extras || []).map((ex) => ({
              ...ex,
              amount: Number(ex.amount) || 1,
              unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase(),
            })),
            unique_id: i.unique_id,
            payment_method: null,
            receipt_id: receiptId,
            confirmed: true,
            discountType: discountValue > 0 ? discountType : null,
            discountValue: discountValue > 0 ? discountValue : 0,
          };
        });

        const rSub = await txApiRequest(`/orders/sub-orders${identifier}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            total: totalDue,
            payment_method: "Split",
            receipt_id: receiptId,
            mark_paid: true,
            items: enhancedItems,
          }),
        });

        if (!rSub?.sub_order_id) {
          throw new Error("Sub-order creation failed: Missing sub_order_id");
        }

        const cleanedSplits = {};
        Object.entries(splits || {}).forEach(([methodId, value]) => {
          const parsed = parseFloat(value);
          if (!isNaN(parsed) && parsed > 0) {
            const label = resolvePaymentLabel(methodId);
            cleanedSplits[label] = parsed;
          }
        });

        const sumSplits = Object.values(cleanedSplits).reduce((s, v) => s + v, 0);
        if (Math.abs(sumSplits - totalDue) > 0.005) {
          throw new Error("Split amounts must equal the total.");
        }
        const cashPortion = Object.entries(cleanedSplits).reduce((sum, [label, value]) => {
          if (txIsCashLabel(label)) {
            const numeric = Number(value);
            return sum + (Number.isFinite(numeric) ? numeric : 0);
          }
          return sum;
        }, 0);

        const rMethods = await txApiRequest(`/orders/receipt-methods${identifier}`, {
          method: "POST",
          body: JSON.stringify({
            order_id: order.id,
            receipt_id: receiptId,
            methods: cleanedSplits,
          }),
        });
        if (!rMethods) throw new Error("Failed to save receipt methods");

        setSelectedCartItemIds(new Set());
        setShowPaymentModal(false);
        dispatchOrdersLocalRefresh();
        broadcastTableOverviewOrderStatus("paid");
        if (window && typeof window.playPaidSound === "function") window.playPaidSound();

        Promise.allSettled([
          refreshReceiptAfterPayment(),
          fetchOrderItems(order.id),
          fetchSubOrders(),
          dispatchKitchenOrdersReload(),
          (async () => {
            const allItems = await txApiRequest(`/orders/${order.id}/items${identifier}`);
            if (Array.isArray(allItems) && allItems.every((item) => item.paid_at)) {
              await txApiRequest(`/orders/${order.id}/status${identifier}`, {
                method: "PUT",
                body: JSON.stringify({
                  status: "paid",
                  total: totalDue,
                  payment_method: Object.keys(cleanedSplits).join("+"),
                }),
              });
              setOrder((prev) => (prev ? { ...prev, status: "paid" } : prev));
              broadcastTableOverviewOrderStatus("paid");
              await runAutoCloseIfConfigured(true, splitMethodIds);
            }
          })(),
          (async () => {
            if (cashPortion > 0) {
              const note = order?.id ? `Order #${order.id} (split)` : "Split payment";
              await txLogCashRegisterEvent({ type: "sale", amount: cashPortion, note });
              await txOpenCashDrawer();
            }
          })(),
        ]).catch((err) => console.warn("⚠️ Background tasks failed:", err));
      } catch (err) {
        console.error("❌ confirmPaymentWithSplits failed:", err);
      }
    },
    [
      selectedCartItemIds,
      cartItems,
      selectionQuantities,
      discountValue,
      discountType,
      computeItemLineTotal,
      getPaymentItemKey,
      resolvePaymentLabel,
      txApiRequest,
      identifier,
      order?.id,
      setSelectedCartItemIds,
      dispatchOrdersLocalRefresh,
      broadcastTableOverviewOrderStatus,
      refreshReceiptAfterPayment,
      fetchOrderItems,
      fetchSubOrders,
      dispatchKitchenOrdersReload,
      runAutoCloseIfConfigured,
      txLogCashRegisterEvent,
      txOpenCashDrawer,
      setShowPaymentModal,
      setOrder,
    ]
  );

  return { confirmPaymentWithSplits };
};
