import { useCallback, useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";

export const useTxUiController = ({ categoriesLength }) => {
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showMergeTableModal, setShowMergeTableModal] = useState(false);
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [showMoveTableModal, setShowMoveTableModal] = useState(false);
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);

  const onSwipedLeft = useCallback(() => {
    if (currentCategoryIndex < categoriesLength - 1) {
      setCurrentCategoryIndex((prev) => prev + 1);
    }
  }, [categoriesLength, currentCategoryIndex]);

  const onSwipedRight = useCallback(() => {
    if (currentCategoryIndex > 0) {
      setCurrentCategoryIndex((prev) => prev - 1);
    }
  }, [currentCategoryIndex]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft,
    onSwipedRight,
    trackMouse: true,
  });

  useEffect(() => {
    if (categoriesLength > 0) {
      setCurrentCategoryIndex(0);
    }
  }, [categoriesLength]);

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
    showReservationModal,
    setShowReservationModal,
    showMoveTableModal,
    setShowMoveTableModal,
    currentCategoryIndex,
    setCurrentCategoryIndex,
    swipeHandlers,
  };
};
