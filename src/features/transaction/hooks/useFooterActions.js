import { useCallback, useMemo } from "react";
import { isPaidItem } from "../utils/transactionUtils";

export const useFooterActions = ({
  order,
  orderType,
  cartItems,
  hasUnconfirmedCartItems,
  hasConfirmedCartUnpaid,
  hasSuborderUnpaid,
  allPaidIncludingSuborders,
  normalizedStatus,
  t,
}) => {
  const isPhoneOrder = orderType === "phone";

  const getPrimaryActionLabel = useCallback(() => {
    if (!order) return "Preparing..";
    if (hasUnconfirmedCartItems) return "Confirm";
    if (hasConfirmedCartUnpaid || hasSuborderUnpaid) return "Pay Later";
    if (String(order?.status ?? "").trim().toLowerCase() === "paid" || !!order?.is_paid)
      return "Close";
    return "Close";
  }, [hasConfirmedCartUnpaid, hasSuborderUnpaid, hasUnconfirmedCartItems, order]);

  const showCloseLaterInFooter = useMemo(
    () =>
      !isPhoneOrder &&
      cartItems.length > 0 &&
      !hasUnconfirmedCartItems &&
      (normalizedStatus === "paid" || allPaidIncludingSuborders),
    [allPaidIncludingSuborders, cartItems.length, hasUnconfirmedCartItems, isPhoneOrder, normalizedStatus]
  );

  const showPayLaterInFooter = useMemo(
    () =>
      !isPhoneOrder &&
      cartItems.length > 0 &&
      !hasUnconfirmedCartItems &&
      ["confirmed", "unpaid", "reserved"].includes(normalizedStatus),
    [cartItems.length, hasUnconfirmedCartItems, isPhoneOrder, normalizedStatus]
  );

  const footerSecondaryLabel = useMemo(() => {
    if (showCloseLaterInFooter) return t("Close Later");
    if (showPayLaterInFooter) return t("Pay Later");
    return t("Clear");
  }, [showCloseLaterInFooter, showPayLaterInFooter, t]);

  const footerClearDisabledAfterConfirmOrPaid = useMemo(
    () => showPayLaterInFooter && normalizedStatus === "confirmed" && !hasUnconfirmedCartItems,
    [hasUnconfirmedCartItems, normalizedStatus, showPayLaterInFooter]
  );

  const payDisabled = useMemo(
    () => isPhoneOrder || hasUnconfirmedCartItems || (!hasConfirmedCartUnpaid && !hasSuborderUnpaid),
    [hasConfirmedCartUnpaid, hasSuborderUnpaid, hasUnconfirmedCartItems, isPhoneOrder]
  );

  const footerCancelDisabled = useMemo(
    () =>
      !["confirmed", "paid"].includes(normalizedStatus) ||
      hasUnconfirmedCartItems ||
      cartItems.length === 0,
    [cartItems.length, hasUnconfirmedCartItems, normalizedStatus]
  );

  const footerCanShowCancel = useMemo(
    () => orderType === "table" || orderType === "takeaway",
    [orderType]
  );

  return {
    isPhoneOrder,
    getPrimaryActionLabel,
    showCloseLaterInFooter,
    showPayLaterInFooter,
    footerSecondaryLabel,
    footerClearDisabledAfterConfirmOrPaid,
    payDisabled,
    footerCancelDisabled,
    footerCanShowCancel,
  };
};
