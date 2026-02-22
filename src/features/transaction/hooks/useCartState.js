import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTxCartController } from "../../transactions/hooks/useTxCartController";
import { isPaidItem } from "../utils/transactionUtils";

export const useCartState = () => {
  const {
    cartItems,
    setCartItems,
    receiptItems,
    setReceiptItems,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountedTotal,
    addToCart: addCartItem,
    remove: removeCartItem,
    setQty: setCartItemQty,
  } = useTxCartController();

  const [selectedCartItemIds, setSelectedCartItemIds] = useState(new Set());
  const [expandedCartItems, setExpandedCartItems] = useState(new Set());
  const [selectionQuantities, setSelectionQuantities] = useState({});
  const [showPaidCartItems, setShowPaidCartItems] = useState(false);
  const cartScrollRef = useRef(null);
  const lastVisibleCartItemRef = useRef(null);
  const computeItemLineTotal = useCallback(
    (item, safeParse = safeParseExtras) => {
      const extrasList = safeParse(item.extras);
      const extrasTotal = (Array.isArray(extrasList) ? extrasList : []).reduce(
        (acc, ex) => {
          const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
          const qty = Number(ex.quantity) || 1;
          return acc + price * qty;
        },
        0
      );
      const basePrice = parseFloat(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      return (basePrice + extrasTotal) * quantity;
    },
    []
  );

  const scrollCartToBottom = useCallback(() => {
    const node = cartScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, []);

  const toggleCartItemExpansion = useCallback((itemId) => {
    if (!itemId) return;
    setExpandedCartItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const toggleCartItemSelection = useCallback((itemId) => {
    if (!itemId) return;
    const key = String(itemId);
    setSelectedCartItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const updateSelectionQuantity = useCallback((key, qty, maxQty) => {
    if (!key) return;
    const limit = Math.max(1, Number(maxQty) || 1);
    const normalizedQty = Math.min(Math.max(1, Number(qty) || 1), limit);
    setSelectionQuantities((prev) => ({ ...(prev || {}), [key]: normalizedQty }));
  }, []);

  const removeSelectionQuantity = useCallback((key) => {
    if (!key) return;
    setSelectionQuantities((prev) => {
      const next = { ...(prev || {}) };
      if (next[key] !== undefined) delete next[key];
      return next;
    });
  }, []);

  const clearSelectedCartItems = useCallback(() => {
    if (cartItems.length === 0) return;
    setCartItems((prev) => {
      const selectedKeys = new Set(Array.from(selectedCartItemIds, (id) => String(id)));
      return prev.filter((item) => {
        const key = String(item.unique_id || item.id);
        const shouldRemove = selectedKeys.has(key) && !item.confirmed && !isPaidItem(item);
        return !shouldRemove;
      });
    });
    setSelectedCartItemIds(new Set());
  }, [cartItems.length, selectedCartItemIds, setCartItems]);

  useEffect(() => {
    setExpandedCartItems((prev) => {
      const validKeys = new Set(
        cartItems.map((item, idx) => item.unique_id || `${item.id}-index-${idx}`)
      );

      let changed = false;
      const next = new Set();
      prev.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });

      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [cartItems]);

  useEffect(() => {
    setSelectedCartItemIds((prev) => {
      const validKeys = new Set(cartItems.map((item) => String(item.unique_id || item.id)));

      let changed = false;
      const next = new Set();

      prev.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });

      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [cartItems]);

  const hasUnconfirmedCartItems = useMemo(
    () => cartItems.some((item) => !item.confirmed),
    [cartItems]
  );

  const hasConfirmedCartUnpaid = useMemo(
    () => cartItems.some((item) => item.confirmed && !isPaidItem(item)),
    [cartItems]
  );

  const allCartItemsPaid = useMemo(() => cartItems.every((item) => isPaidItem(item)), [cartItems]);

  const cartSelection = useMemo(
    () => ({
      selectedCartItemIds,
      selectionQuantities,
      toggleCartItemSelection,
      updateSelectionQuantity,
      removeSelectionQuantity,
    }),
    [selectedCartItemIds, selectionQuantities, toggleCartItemSelection, updateSelectionQuantity, removeSelectionQuantity]
  );

  return {
    cartItems,
    setCartItems,
    receiptItems,
    setReceiptItems,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    discountedTotal,
    addCartItem,
    removeCartItem,
    setCartItemQty,
    selectedCartItemIds,
    setSelectedCartItemIds,
    expandedCartItems,
    setExpandedCartItems,
    selectionQuantities,
    setSelectionQuantities,
    cartSelection,
    showPaidCartItems,
    setShowPaidCartItems,
    toggleCartItemSelection,
    toggleCartItemExpansion,
    updateSelectionQuantity,
    removeSelectionQuantity,
    clearSelectedCartItems,
    cartScrollRef,
    lastVisibleCartItemRef,
    scrollCartToBottom,
    hasUnconfirmedCartItems,
    hasConfirmedCartUnpaid,
    allCartItemsPaid,
    computeItemLineTotal,
  };
};
