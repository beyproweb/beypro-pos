import { useCallback, useMemo } from "react";
import { readCachedProducts } from "../utils/cache";

export const useTxBootstrap = ({ orderId, location }) => {
  const phoneOrderDraft = location.state?.phoneOrderDraft || null;

  const initialOrder = useMemo(() => {
    const initialOrderFromState = location.state?.order || null;
    const isNewPhoneOrderDraft =
      String(orderId) === "new" &&
      phoneOrderDraft &&
      typeof phoneOrderDraft === "object";

    return (
      initialOrderFromState ||
      (isNewPhoneOrderDraft
        ? {
            ...phoneOrderDraft,
            id: null,
            status: "draft",
            items: [],
            order_type: "phone",
          }
        : null)
    );
  }, [location.state, orderId, phoneOrderDraft]);

  const restaurantSlug = useMemo(
    () =>
      typeof window !== "undefined"
        ? localStorage.getItem("restaurant_slug") ||
          localStorage.getItem("restaurant_id")
        : null,
    []
  );

  const identifier = useMemo(
    () => (restaurantSlug ? `?identifier=${restaurantSlug}` : ""),
    [restaurantSlug]
  );

  const getInitialProducts = useCallback(() => readCachedProducts(), []);

  return {
    initialOrder,
    phoneOrderDraft,
    restaurantSlug,
    identifier,
    getInitialProducts,
  };
};
