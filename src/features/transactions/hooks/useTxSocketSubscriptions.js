import { useEffect } from "react";

export const useTxSocketSubscriptions = ({
  order,
  fetchTakeawayOrder,
  hasGlobalSocket,
  txGlobalSocketOn,
  txGlobalSocketOff,
}) => {
  useEffect(() => {
    if (!hasGlobalSocket()) return;
    const refresh = () => {
      if (order?.order_type === "takeaway") {
        fetchTakeawayOrder(order.id);
      }
    };
    txGlobalSocketOn("orders_updated", refresh);
    return () => txGlobalSocketOff("orders_updated", refresh);
  }, [
    fetchTakeawayOrder,
    hasGlobalSocket,
    order?.id,
    order?.order_type,
    txGlobalSocketOff,
    txGlobalSocketOn,
  ]);

  // Keep existing semantics from TransactionScreen where this listener path
  // was registered in two places.
  useEffect(() => {
    if (!hasGlobalSocket()) return;
    const refresh = () => {
      if (order?.order_type === "takeaway") {
        fetchTakeawayOrder(order.id);
      }
    };
    txGlobalSocketOn("orders_updated", refresh);
    return () => txGlobalSocketOff("orders_updated", refresh);
  }, [
    fetchTakeawayOrder,
    hasGlobalSocket,
    order?.id,
    order?.order_type,
    txGlobalSocketOff,
    txGlobalSocketOn,
  ]);

  useEffect(() => {
    if (!hasGlobalSocket()) return;
    txGlobalSocketOn("item_paid", () => {
      if (window && typeof window.playPaidSound === "function") {
        window.playPaidSound();
      }
    });
    return () => {
      if (!hasGlobalSocket()) return;
      txGlobalSocketOff("item_paid");
    };
  }, [hasGlobalSocket, txGlobalSocketOff, txGlobalSocketOn]);
};
