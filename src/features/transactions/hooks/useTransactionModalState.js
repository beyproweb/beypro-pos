import { useCallback, useRef, useState } from "react";

export function useTransactionModalState() {
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showMergeTableModal, setShowMergeTableModal] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showMoveTableModal, setShowMoveTableModal] = useState(false);

  const confirmReservationCloseResolverRef = useRef(null);
  const [confirmReservationCloseToast, setConfirmReservationCloseToast] = useState({
    show: false,
    schedule: null,
  });

  const requestReservationCloseConfirmation = useCallback((schedule) => {
    const normalizedSchedule =
      schedule && typeof schedule === "object" ? schedule : null;
    return new Promise((resolve) => {
      confirmReservationCloseResolverRef.current = resolve;
      setConfirmReservationCloseToast({
        show: true,
        schedule: normalizedSchedule,
      });
    });
  }, []);

  const resolveReservationCloseConfirmation = useCallback((value) => {
    const resolver = confirmReservationCloseResolverRef.current;
    confirmReservationCloseResolverRef.current = null;
    setConfirmReservationCloseToast({ show: false, schedule: null });
    if (typeof resolver === "function") resolver(!!value);
  }, []);

  return {
    showDiscountModal,
    setShowDiscountModal,
    showMergeTableModal,
    setShowMergeTableModal,
    showExtrasModal,
    setShowExtrasModal,
    showPaymentModal,
    setShowPaymentModal,
    showCancelModal,
    setShowCancelModal,
    showDebtModal,
    setShowDebtModal,
    showMoveTableModal,
    setShowMoveTableModal,
    confirmReservationCloseToast,
    requestReservationCloseConfirmation,
    resolveReservationCloseConfirmation,
  };
}

