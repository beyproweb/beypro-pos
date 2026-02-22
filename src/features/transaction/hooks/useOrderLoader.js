import { useCallback, useEffect, useMemo } from "react";
import { txApiRequest } from "../../transactions/services/transactionApi";
import { isActiveTableStatus } from "../utils/transactionUtils";
import {
  formatOrderItems,
  hydrateCartState,
  normalizePaidFlag,
} from "../utils/orderFormatting";

export const useOrderLoader = ({
  orderId,
  tableId,
  location,
  initialOrder,
  identifier,
  restaurantSlug,
  products,
  safeParseExtras,
  setOrder,
  setCartItems,
  setReceiptItems,
  setLoading,
  fetchOrderItems,
  reopenOrderIfNeeded,
}) => {
  const identifierSuffix = useMemo(
    () => identifier || (restaurantSlug ? `identifier=${restaurantSlug}` : ""),
    [identifier, restaurantSlug]
  );

  const appendIdentifier = useCallback(
    (path) => {
      if (!identifierSuffix) return path;
      const hasQuery = path.includes("?");
      const suffix = identifierSuffix.startsWith("?")
        ? identifierSuffix.slice(1)
        : identifierSuffix;
      return `${path}${hasQuery ? "&" : "?"}${suffix}`;
    },
    [identifierSuffix]
  );

  const formatAndHydrate = useCallback(
    (items, options = {}) => {
      const formatted = formatOrderItems({
        items,
        products,
        safeParseExtras,
        orderType: options.orderType,
        orderSource: options.orderSource,
      });

      hydrateCartState({
        formattedItems: formatted,
        setCartItems,
        setReceiptItems,
        mergeUnconfirmed: options.mergeUnconfirmed,
      });

      return formatted;
    },
    [products, safeParseExtras, setCartItems, setReceiptItems]
  );

  const loadTakeawayOrder = useCallback(
    async (id) => {
      try {
        let currentOrder = await txApiRequest(appendIdentifier(`/orders/${id}`));
        const reopened = await reopenOrderIfNeeded(currentOrder);
        if (reopened) currentOrder = reopened;

        const items = await txApiRequest(appendIdentifier(`/orders/${currentOrder.id}/items`));

        setOrder(currentOrder);
        formatAndHydrate(items, {
          orderType: currentOrder.order_type,
          orderSource: currentOrder.source,
          mergeUnconfirmed: true,
        });
        setLoading(false);
      } catch (err) {
        console.error("❌ Error fetching takeaway order:", err);
        setLoading(false);
      }
    },
    [appendIdentifier, formatAndHydrate, reopenOrderIfNeeded, setLoading, setOrder]
  );

  const loadPhoneOrder = useCallback(
    async (id) => {
      try {
        let currentOrder = await txApiRequest(appendIdentifier(`/orders/${id}`));
        const reopened = await reopenOrderIfNeeded(currentOrder);
        if (reopened) currentOrder = reopened;

        const statusLower = String(currentOrder?.status ?? "").trim().toLowerCase();
        const looksPaid = statusLower === "paid" || normalizePaidFlag(currentOrder?.is_paid);
        const correctedStatus = looksPaid ? "paid" : currentOrder.status;

        setOrder({ ...currentOrder, status: correctedStatus });
        await fetchOrderItems(currentOrder.id, {
          orderTypeOverride: currentOrder.order_type,
          sourceOverride: currentOrder.source,
        });
        setLoading(false);
      } catch (err) {
        console.error("❌ Error fetching phone/packet order:", err);
        setLoading(false);
      }
    },
    [appendIdentifier, fetchOrderItems, reopenOrderIfNeeded, setLoading, setOrder]
  );

  const loadOrCreateTableOrder = useCallback(
    async (tableNumber) => {
      try {
        const ordersResponse = await txApiRequest(
          appendIdentifier(`/orders?table_number=${tableNumber}`)
        );

        const orders = Array.isArray(ordersResponse) ? ordersResponse : [];
        const sortedOrders = [...orders].sort((a, b) => {
          const aTime = new Date(a?.updated_at || a?.created_at || 0).getTime();
          const bTime = new Date(b?.updated_at || b?.created_at || 0).getTime();
          return bTime - aTime;
        });

        const activeOrder = sortedOrders.find((candidate) => isActiveTableStatus(candidate.status));
        let currentOrder = activeOrder || null;

        if (!currentOrder) {
          const unpaidClosed = sortedOrders.find(
            (candidate) => (candidate.status || "").toLowerCase() === "closed" && !candidate.is_paid
          );
          if (unpaidClosed) {
            const reopened = await reopenOrderIfNeeded(unpaidClosed);
            if (reopened) currentOrder = reopened;
          }
        }

        if (!currentOrder) {
          currentOrder = await txApiRequest(appendIdentifier("/orders"), {
            method: "POST",
            body: JSON.stringify({
              table_number: tableNumber,
              order_type: "table",
              total: 0,
              items: [],
            }),
          });
        }

        const statusLower = String(currentOrder?.status ?? "").trim().toLowerCase();
        const looksPaid = statusLower === "paid" || normalizePaidFlag(currentOrder?.is_paid);
        const correctedStatus = looksPaid ? "paid" : currentOrder.status;

        setOrder({ ...currentOrder, status: correctedStatus });
        setLoading(false);

        fetchOrderItems(currentOrder.id, {
          orderTypeOverride: currentOrder.order_type,
          sourceOverride: currentOrder.source,
        }).catch((err) => {
          console.error("❌ Error fetching order items:", err);
        });
      } catch (err) {
        console.error("❌ Error creating/fetching table order:", err);
        setLoading(false);
      }
    },
    [appendIdentifier, fetchOrderItems, reopenOrderIfNeeded, setLoading, setOrder]
  );

  const hydrateWarmOrder = useCallback(() => {
    const hasWarmOrder = Boolean(initialOrder && typeof initialOrder === "object");

    if (hasWarmOrder) {
      setOrder(initialOrder);

      if (!location.state?.preserveCart) {
        formatAndHydrate(initialOrder.items || [], {
          orderType: initialOrder.order_type,
          orderSource: initialOrder.source,
        });
      }

      setLoading(false);
    } else {
      setOrder(null);
      setCartItems([]);
      setReceiptItems([]);
      setLoading(true);
    }

    return { hasWarmOrder, warmOrderId: initialOrder?.id ?? null };
  }, [
    formatAndHydrate,
    initialOrder,
    location.state,
    setCartItems,
    setOrder,
    setReceiptItems,
    setLoading,
  ]);

  const runInitialLoad = useCallback(() => {
    const warmOrder = hydrateWarmOrder();

    if (orderId && String(orderId) !== "new") {
      if (!warmOrder.hasWarmOrder || String(warmOrder.warmOrderId) !== String(orderId)) {
        loadPhoneOrder(orderId);
      }
      return;
    }

    if (tableId) {
      loadOrCreateTableOrder(tableId);
      return;
    }

    if (
      location.pathname.includes("/transaction/") &&
      initialOrder?.order_type === "takeaway" &&
      initialOrder?.id
    ) {
      loadTakeawayOrder(initialOrder.id);
    }
  }, [
    hydrateWarmOrder,
    initialOrder?.id,
    initialOrder?.order_type,
    loadOrCreateTableOrder,
    loadPhoneOrder,
    loadTakeawayOrder,
    location.pathname,
    orderId,
    tableId,
  ]);

  useEffect(() => {
    runInitialLoad();
  }, [runInitialLoad]);

  return {
    loadTakeawayOrder,
    loadPhoneOrder,
    loadOrCreateTableOrder,
  };
};
