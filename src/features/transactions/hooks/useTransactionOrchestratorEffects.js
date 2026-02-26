import { useCallback, useEffect } from "react";

export function useTransactionOrchestratorEffects({
  tableId,
  orderId,
  locationPathname,
  order,
  cartItems,
  restaurantSlug,
  loading,
  tableSettings,
  transactionSettings,
  deferHeavyUi,
  setDeferHeavyUi,
  txnDevInvariant,
  removeTableOverviewOrderFromCache,
  upsertTableOverviewOrderInCache,
}) {
  const dispatchKitchenOrdersReload = useCallback(() => {
    if (!window || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new Event("beypro:kitchen-orders-reload"));
  }, []);

  const dispatchOrdersLocalRefresh = useCallback((detail) => {
    if (!window || typeof window.dispatchEvent !== "function") return;
    if (detail && typeof detail === "object") {
      window.dispatchEvent(
        new CustomEvent("beypro:orders-local-refresh", { detail })
      );
      return;
    }
    window.dispatchEvent(new Event("beypro:orders-local-refresh"));
  }, []);

  const broadcastTableOverviewOrderStatus = useCallback(
    (nextStatus) => {
      const tableNumberRaw =
        order?.table_number ?? order?.tableNumber ?? tableId ?? null;
      const tableNumber = Number(tableNumberRaw);
      if (!Number.isFinite(tableNumber)) return;

      const orderIdNum =
        order?.id === null || order?.id === undefined ? null : Number(order.id);

      if (String(nextStatus).toLowerCase() === "closed") {
        removeTableOverviewOrderFromCache(tableNumber);
      } else {
        const patch =
          String(nextStatus).toLowerCase() === "paid"
            ? {
                status: "paid",
                payment_status: "paid",
                is_paid: true,
                total: 0,
                items: [],
                suborders: [],
              }
            : {
                status: nextStatus,
                payment_status: order?.payment_status,
                is_paid: order?.is_paid,
                total: order?.total,
              };

        if (String(nextStatus).toLowerCase() !== "paid" && Array.isArray(order?.items)) {
          patch.items = order.items;
        }

        upsertTableOverviewOrderInCache({
          tableNumber,
          orderId: orderIdNum,
          patch,
        });
      }

      dispatchOrdersLocalRefresh({
        kind: "tableoverview_order_status",
        table_number: tableNumber,
        order_id: orderIdNum,
        status: nextStatus,
        patch:
          String(nextStatus).toLowerCase() === "closed"
            ? null
            : String(nextStatus).toLowerCase() === "paid"
            ? {
                status: "paid",
                payment_status: "paid",
                is_paid: true,
                total: 0,
                items: [],
                suborders: [],
              }
            : {
                status: nextStatus,
                payment_status: order?.payment_status,
                is_paid: order?.is_paid,
                total: order?.total,
                items: Array.isArray(order?.items) ? order.items : undefined,
              },
      });
    },
    [
      dispatchOrdersLocalRefresh,
      order?.id,
      order?.is_paid,
      order?.items,
      order?.payment_status,
      order?.tableNumber,
      order?.table_number,
      order?.total,
      removeTableOverviewOrderFromCache,
      tableId,
      upsertTableOverviewOrderInCache,
    ]
  );

  useEffect(() => {
    const hasTableId =
      tableId !== undefined && tableId !== null && String(tableId).trim() !== "";
    const hasOrderId =
      orderId !== undefined && orderId !== null && String(orderId).trim() !== "";

    txnDevInvariant(
      hasTableId || hasOrderId,
      "Route params missing: expected tableId or orderId.",
      { tableId, orderId, path: locationPathname }
    );
    txnDevInvariant(
      !(hasTableId && hasOrderId),
      "Both tableId and orderId are present. Expected only one route identity param.",
      { tableId, orderId, path: locationPathname }
    );
    txnDevInvariant(
      restaurantSlug !== null && restaurantSlug !== undefined,
      "Restaurant identifier is missing in localStorage (restaurant_slug/restaurant_id).",
      { path: locationPathname }
    );
    txnDevInvariant(
      Array.isArray(cartItems),
      "cartItems invariant failed: expected array.",
      { type: typeof cartItems }
    );
    txnDevInvariant(
      transactionSettings && typeof transactionSettings === "object",
      "transactionSettings invariant failed: expected object."
    );
    txnDevInvariant(
      tableSettings && typeof tableSettings === "object",
      "tableSettings invariant failed: expected object."
    );

    if (hasOrderId && String(orderId) !== "new" && !loading) {
      txnDevInvariant(
        order && typeof order === "object",
        "order invariant failed: expected order object after load for order route.",
        { orderId, orderType: typeof order }
      );
    }
  }, [
    cartItems,
    loading,
    locationPathname,
    order,
    orderId,
    restaurantSlug,
    tableId,
    tableSettings,
    transactionSettings,
    txnDevInvariant,
  ]);

  useEffect(() => {
    if (!deferHeavyUi) return;
    const id = window.requestAnimationFrame(() => setDeferHeavyUi(false));
    return () => window.cancelAnimationFrame(id);
  }, [deferHeavyUi, setDeferHeavyUi]);

  return {
    dispatchKitchenOrdersReload,
    dispatchOrdersLocalRefresh,
    broadcastTableOverviewOrderStatus,
  };
}
