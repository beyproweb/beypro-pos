import { useState, useEffect, useMemo } from "react";

export function useQrMenuCart({ storage, toArray }) {
  const [cart, setCart] = useState(() => {
    try {
      const parsed = JSON.parse(storage.getItem("qr_cart") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const safeCart = useMemo(() => toArray(cart), [cart, toArray]);

  useEffect(() => {
    const storedCart = safeCart;
    storage.setItem("qr_cart", JSON.stringify(storedCart));
  }, [safeCart, storage]);

  return {
    cart,
    setCart,
    safeCart,
  };
}

export default useQrMenuCart;
