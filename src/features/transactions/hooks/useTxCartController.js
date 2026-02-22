import { useCallback, useMemo, useState } from "react";

export const useTxCartController = () => {
  const [cartItems, setCartItems] = useState([]);
  const [receiptItems, setReceiptItems] = useState([]);
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState(10);

  const discountedTotal = useMemo(() => {
    const subtotal = cartItems
      .filter((item) => !item.paid)
      .reduce((sum, item) => {
        const base = item.price * item.quantity;
        const extras =
          (item.extras || []).reduce(
            (extrasSum, ex) =>
              extrasSum +
              (parseFloat(ex.price || ex.extraPrice || 0) *
                (ex.quantity || 1)),
            0
          ) * item.quantity;
        return sum + base + extras;
      }, 0);

    if (discountType === "percent") {
      return subtotal - subtotal * (discountValue / 100);
    }
    if (discountType === "fixed") {
      return Math.max(0, subtotal - discountValue);
    }
    return subtotal;
  }, [cartItems, discountType, discountValue]);

  const addToCart = useCallback((item) => {
    if (!item || typeof item !== "object") return;
    setCartItems((prev) => [...prev, item]);
  }, []);

  const remove = useCallback((uniqueId, canRemove) => {
    setCartItems((prev) =>
      prev.filter((item) => {
        if (item?.unique_id !== uniqueId) return true;
        if (typeof canRemove === "function") return !canRemove(item);
        return false;
      })
    );
  }, []);

  const setQty = useCallback((uniqueId, nextQtyOrUpdater, options = {}) => {
    const min = Number.isFinite(options.min) ? Number(options.min) : 1;
    const max = Number.isFinite(options.max) ? Number(options.max) : Infinity;
    const canMutate =
      typeof options.canMutate === "function" ? options.canMutate : () => true;

    setCartItems((prev) =>
      prev.map((item) => {
        if (item?.unique_id !== uniqueId) return item;
        if (!canMutate(item)) return item;

        const resolved =
          typeof nextQtyOrUpdater === "function"
            ? nextQtyOrUpdater(item.quantity)
            : nextQtyOrUpdater;
        const numeric = Number(resolved);
        const clamped = Math.min(Math.max(Number.isFinite(numeric) ? numeric : min, min), max);
        return { ...item, quantity: clamped };
      })
    );
  }, []);

  const applyExtras = useCallback((uniqueId, extras, note) => {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item?.unique_id !== uniqueId) return item;
        return {
          ...item,
          extras: Array.isArray(extras) ? extras : item.extras,
          note: note !== undefined ? note : item.note,
        };
      })
    );
  }, []);

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
    addToCart,
    remove,
    setQty,
    applyExtras,
  };
};
