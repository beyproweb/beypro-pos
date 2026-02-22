import { useMemo } from "react";

export function useTransactionDomainRules({
  order,
  orderId,
  cartItems,
  suborderItems,
  allCartItemsPaid,
  normalizeOrderStatus,
  isPaidItem,
  refundAmount = 0,
}) {
  const safeCartItems = useMemo(
    () => (Array.isArray(cartItems) ? cartItems : []),
    [cartItems]
  );
  const safeSuborderItems = useMemo(
    () => (Array.isArray(suborderItems) ? suborderItems : []),
    [suborderItems]
  );

  const hasSuborderUnpaid = useMemo(
    () => safeSuborderItems.some((item) => !isPaidItem(item)),
    [safeSuborderItems, isPaidItem]
  );

  const allSuborderPaid = useMemo(
    () => safeSuborderItems.every((item) => isPaidItem(item)),
    [safeSuborderItems, isPaidItem]
  );

  const allPaidIncludingSuborders = useMemo(
    () => allCartItemsPaid && allSuborderPaid,
    [allCartItemsPaid, allSuborderPaid]
  );

  const orderType = useMemo(
    () =>
      String(order?.order_type || (orderId ? "phone" : "table") || "table").toLowerCase(),
    [order?.order_type, orderId]
  );

  const normalizedStatus = useMemo(
    () => normalizeOrderStatus(order?.status),
    [normalizeOrderStatus, order?.status]
  );

  // Debt can be added only when order is confirmed/paid AND there are confirmed items and no unconfirmed items
  const hasUnconfirmedItems = useMemo(
    () => safeCartItems.some((item) => !item.confirmed),
    [safeCartItems]
  );

  const hasConfirmedUnpaidItems = useMemo(
    () => safeCartItems.some((item) => item.confirmed && !item.paid),
    [safeCartItems]
  );

  const canShowDebtButton = useMemo(
    () => normalizedStatus === "confirmed",
    [normalizedStatus]
  );

  const isDebtEligible = useMemo(
    () => canShowDebtButton && !hasUnconfirmedItems && hasConfirmedUnpaidItems,
    [canShowDebtButton, hasConfirmedUnpaidItems, hasUnconfirmedItems]
  );

  const hasUnpaidConfirmed = useMemo(
    () => safeCartItems.some((item) => item.confirmed && !item.paid),
    [safeCartItems]
  );

  const hasPaidItems = useMemo(() => refundAmount > 0, [refundAmount]);

  const isUnpaidPaymentMethod = useMemo(
    () => (order?.payment_method || "").toLowerCase().trim() === "unpaid",
    [order?.payment_method]
  );

  const shouldShowRefundMethod = useMemo(
    () => hasPaidItems && !isUnpaidPaymentMethod,
    [hasPaidItems, isUnpaidPaymentMethod]
  );

  return {
    orderType,
    normalizedStatus,
    hasUnconfirmedItems,
    hasConfirmedUnpaidItems,
    canShowDebtButton,
    isDebtEligible,
    hasSuborderUnpaid,
    allSuborderPaid,
    allPaidIncludingSuborders,
    hasUnpaidConfirmed,
    hasPaidItems,
    isUnpaidPaymentMethod,
    shouldShowRefundMethod,
  };
}
