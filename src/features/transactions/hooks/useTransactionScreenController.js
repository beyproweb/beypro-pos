import { useEffect, useMemo, useState } from "react";
import { useSetting } from "../../../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../../../constants/transactionSettingsDefaults";
import { useTransactionData } from "../../transaction/hooks/useTransactionData";
import { useCartState } from "../../transaction/hooks/useCartState";
import { useFooterActions } from "../../transaction/hooks/useFooterActions";
import { isPaidItem, normalizeOrderStatus } from "../../transaction/utils/transactionUtils";
import { useTxNavigation } from "./useTxNavigation";
import { useCategoryImages } from "./useCategoryImages";
import { useKitchenCompileSettings } from "./useKitchenCompileSettings";
import { useRegisterPrefetch } from "./useRegisterPrefetch";
import { useTxUiController } from "./useTxUiController";
import { useTxProductImagePrefetch } from "./useTxProductImagePrefetch";
import { useTxSocketSubscriptions } from "./useTxSocketSubscriptions";
import { useTransactionLayoutController } from "./useTransactionLayoutController";
import { useTransactionDomainRules } from "./useTransactionDomainRules";
import { useTransactionModalState } from "./useTransactionModalState";
import { useTransactionEditorsState } from "./useTransactionEditorsState";
import { useTransactionOrchestratorEffects } from "./useTransactionOrchestratorEffects";
import { normalizeGroupKey } from "../utils/normalization";
import { prefetchImageUrls } from "../utils/prefetchImageUrls";
import {
  removeTableOverviewOrderFromCache,
  upsertTableOverviewOrderInCache,
} from "../../../utils/tableOverviewOrdersCache";

const __DEV__ = import.meta.env.DEV;
const devAssert = (condition, message, details) => {
  if (!__DEV__ || condition) return;
  if (details !== undefined) {
    console.error("[TX_VIEWMODEL_ASSERT]", message, details);
  } else {
    console.error("[TX_VIEWMODEL_ASSERT]", message);
  }
};

export function useTransactionScreenController({
  navigate,
  location,
  tableId,
  orderId,
  currentUser,
  t,
  i18n,
  formatCurrency,
  txnDebugLog,
  txnDevInvariant,
  suborderItems,
  fetchTakeawayOrder,
  hasGlobalSocket,
  txGlobalSocketOn,
  txGlobalSocketOff,
  paymentMethods,
}) {
  const { debugNavigate, scheduleNavigate } = useTxNavigation({
    navigate,
    location,
    debugLog: txnDebugLog,
  });

  const data = useTransactionData({ orderId, location, currentUser });
  const { categoryImages } = useCategoryImages(data.identifier);
  const { excludedItems, excludedCategories } = useKitchenCompileSettings(data.identifier);
  useRegisterPrefetch();

  const cart = useCartState();
  const editors = useTransactionEditorsState();
  const modals = useTransactionModalState();

  const [deferHeavyUi, setDeferHeavyUi] = useState(() => String(orderId) === "new");
  const [transactionSettings, setTransactionSettings] = useState(
    DEFAULT_TRANSACTION_SETTINGS
  );
  const [tableSettings, setTableSettings] = useState({
    tableLabelText: "",
    showAreas: true,
  });

  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);
  useSetting("tables", setTableSettings, {
    tableLabelText: "",
    showAreas: true,
  });

  const ui = useTxUiController({ categoriesLength: data.categories.length });
  const activeCategory = data.categories[ui.currentCategoryIndex] || "";

  const layout = useTransactionLayoutController({
    categories: data.categories,
    setCategoryOrderKeys: data.setCategoryOrderKeys,
    setCurrentCategoryIndex: ui.setCurrentCategoryIndex,
    normalizeGroupKey,
    activeCategory,
  });

  useTxProductImagePrefetch({
    activeCategory,
    products: data.products,
    prefetchImageUrls,
    limit: 36,
  });
  useTxSocketSubscriptions({
    order: data.order,
    fetchTakeawayOrder,
    hasGlobalSocket,
    txGlobalSocketOn,
    txGlobalSocketOff,
  });

  const domain = useTransactionDomainRules({
    order: data.order,
    orderId,
    cartItems: cart.cartItems,
    suborderItems,
    allCartItemsPaid: cart.allCartItemsPaid,
    normalizeOrderStatus,
    isPaidItem,
  });

  const footer = useFooterActions({
    order: data.order,
    orderType: domain.orderType,
    cartItems: cart.cartItems,
    hasUnconfirmedCartItems: cart.hasUnconfirmedCartItems,
    hasConfirmedCartUnpaid: cart.hasConfirmedCartUnpaid,
    hasSuborderUnpaid: domain.hasSuborderUnpaid,
    allPaidIncludingSuborders: domain.allPaidIncludingSuborders,
    normalizedStatus: domain.normalizedStatus,
    t,
  });

  const orchestrator = useTransactionOrchestratorEffects({
    tableId,
    orderId,
    locationPathname: location.pathname,
    order: data.order,
    cartItems: cart.cartItems,
    restaurantSlug: data.restaurantSlug,
    loading: data.loading,
    tableSettings,
    transactionSettings,
    deferHeavyUi,
    setDeferHeavyUi,
    txnDevInvariant,
    removeTableOverviewOrderFromCache,
    upsertTableOverviewOrderInCache,
  });

  const route = useMemo(() => ({ tableId, orderId }), [tableId, orderId]);
  const nav = useMemo(
    () => ({ navigate, debugNavigate, scheduleNavigate, location }),
    [debugNavigate, location, navigate, scheduleNavigate]
  );
  const auth = useMemo(() => ({ currentUser }), [currentUser]);
  const uiWithActiveCategory = useMemo(
    () => ({ ...ui, activeCategory, deferHeavyUi, setDeferHeavyUi }),
    [
      activeCategory,
      deferHeavyUi,
      setDeferHeavyUi,
      ui.currentCategoryIndex,
      ui.setCurrentCategoryIndex,
      ui.setShowCancelModal,
      ui.setShowDebtModal,
      ui.setShowDiscountModal,
      ui.setShowExtrasModal,
      ui.setShowMergeTableModal,
      ui.setShowMoveTableModal,
      ui.setShowPaymentModal,
      ui.setShowReservationModal,
      ui.showCancelModal,
      ui.showDebtModal,
      ui.showDiscountModal,
      ui.showExtrasModal,
      ui.showMergeTableModal,
      ui.showMoveTableModal,
      ui.showPaymentModal,
      ui.showReservationModal,
      ui.swipeHandlers,
    ]
  );
  const settings = useMemo(
    () => ({
      transactionSettings,
      setTransactionSettings,
      tableSettings,
      setTableSettings,
    }),
    [tableSettings, transactionSettings]
  );
  const images = useMemo(() => ({ categoryImages }), [categoryImages]);
  const kitchen = useMemo(
    () => ({ excludedItems, excludedCategories }),
    [excludedCategories, excludedItems]
  );
  const utils = useMemo(
    () => ({ t, i18n, formatCurrency, txnDebugLog, txnDevInvariant }),
    [formatCurrency, i18n, t, txnDebugLog, txnDevInvariant]
  );
  const vmHeaderProps = useMemo(
    () => ({
      t,
      activeCategory,
      isReorderingCategories: layout.isReorderingCategories,
    }),
    [activeCategory, layout.isReorderingCategories, t]
  );

  const vmProductGridProps = useMemo(
    () => ({
      t,
      formatCurrency,
      topRowRef: layout.topRowRef,
      topRowScroll: layout.topRowScroll,
      onCategoryScrollUp: layout.handleCategoryScrollUp,
      onCategoryScrollDown: layout.handleCategoryScrollDown,
      categoryBarDisabled: false,
    }),
    [
      formatCurrency,
      layout.handleCategoryScrollDown,
      layout.handleCategoryScrollUp,
      layout.topRowRef,
      layout.topRowScroll,
      t,
    ]
  );

  const vmCartPanelProps = useMemo(
    () => ({
      t,
      formatCurrency,
    }),
    [formatCurrency, t]
  );

  const vmFooterProps = useMemo(
    () => ({
      t,
      payDisabled: footer.payDisabled,
      footerCanShowCancel: footer.footerCanShowCancel,
      footerSecondaryLabel: footer.footerSecondaryLabel,
      footerClearDisabledAfterConfirmOrPaid:
        footer.footerClearDisabledAfterConfirmOrPaid,
      showPayLaterInFooter: footer.showPayLaterInFooter,
      showCloseLaterInFooter: footer.showCloseLaterInFooter,
      footerCancelDisabled: footer.footerCancelDisabled,
    }),
    [
      footer.footerCanShowCancel,
      footer.footerCancelDisabled,
      footer.footerClearDisabledAfterConfirmOrPaid,
      footer.footerSecondaryLabel,
      footer.payDisabled,
      footer.showCloseLaterInFooter,
      footer.showPayLaterInFooter,
      t,
    ]
  );

  const vmModalsProps = useMemo(
    () => ({
      t,
      showPaymentModal: modals.showPaymentModal,
      setShowPaymentModal: modals.setShowPaymentModal,
      showCancelModal: modals.showCancelModal,
      setShowCancelModal: modals.setShowCancelModal,
      showDebtModal: modals.showDebtModal,
      setShowDebtModal: modals.setShowDebtModal,
      showExtrasModal: modals.showExtrasModal,
      setShowExtrasModal: modals.setShowExtrasModal,
      showDiscountModal: modals.showDiscountModal,
      setShowDiscountModal: modals.setShowDiscountModal,
      showMoveTableModal: modals.showMoveTableModal,
      setShowMoveTableModal: modals.setShowMoveTableModal,
      showMergeTableModal: modals.showMergeTableModal,
      setShowMergeTableModal: modals.setShowMergeTableModal,
      confirmReservationCloseToast: modals.confirmReservationCloseToast,
      resolveReservationCloseConfirmation:
        modals.resolveReservationCloseConfirmation,
      requestReservationCloseConfirmation:
        modals.requestReservationCloseConfirmation,
    }),
    [
      modals.confirmReservationCloseToast,
      modals.requestReservationCloseConfirmation,
      modals.resolveReservationCloseConfirmation,
      modals.setShowCancelModal,
      modals.setShowDebtModal,
      modals.setShowDiscountModal,
      modals.setShowExtrasModal,
      modals.setShowMergeTableModal,
      modals.setShowMoveTableModal,
      modals.setShowPaymentModal,
      modals.showCancelModal,
      modals.showDebtModal,
      modals.showDiscountModal,
      modals.showExtrasModal,
      modals.showMergeTableModal,
      modals.showMoveTableModal,
      modals.showPaymentModal,
      t,
    ]
  );

  const vmCategoryProps = useMemo(
    () => ({
      isReorderingCategories: layout.isReorderingCategories,
      draggingCategoryKey: layout.draggingCategoryKey,
      setDraggingCategoryKey: layout.setDraggingCategoryKey,
      setIsReorderingCategories: layout.setIsReorderingCategories,
      reorderCategoryByKeyToIndex: layout.reorderCategoryByKeyToIndex,
    }),
    [
      layout.draggingCategoryKey,
      layout.isReorderingCategories,
      layout.reorderCategoryByKeyToIndex,
      layout.setDraggingCategoryKey,
      layout.setIsReorderingCategories,
    ]
  );

  const vm = useMemo(
    () => ({
      headerProps: vmHeaderProps,
      productGridProps: vmProductGridProps,
      cartPanelProps: vmCartPanelProps,
      footerProps: vmFooterProps,
      modalsProps: vmModalsProps,
      categoryProps: vmCategoryProps,
    }),
    [
      vmCartPanelProps,
      vmCategoryProps,
      vmFooterProps,
      vmHeaderProps,
      vmModalsProps,
      vmProductGridProps,
    ]
  );

  useEffect(() => {
    if (!__DEV__) return;
    devAssert(Array.isArray(data.categories), "categories must be an array.", {
      valueType: typeof data.categories,
    });
    devAssert(Array.isArray(data.products), "products must be an array.", {
      valueType: typeof data.products,
    });
    devAssert(Array.isArray(cart.cartItems), "cartItems must be an array.", {
      valueType: typeof cart.cartItems,
    });
    if (String(orderId || "").trim() !== "" && String(orderId) !== "new" && !data.loading) {
      devAssert(
        data.order && typeof data.order === "object",
        "order must be an object for non-new order routes.",
        { orderId, orderType: typeof data.order }
      );
    }
    devAssert(
      layout &&
        typeof layout === "object" &&
        layout.topRowRef &&
        typeof layout.topRowRef === "object",
      "topRowRef is missing from layout controller."
    );
    devAssert(
      Array.isArray(paymentMethods),
      "paymentMethods should be an array.",
      { valueType: typeof paymentMethods }
    );
    devAssert(
      !Array.isArray(paymentMethods) || paymentMethods.length > 0,
      "paymentMethods array is empty."
    );
  }, [
    cart.cartItems,
    data.categories,
    data.loading,
    data.order,
    data.products,
    layout,
    orderId,
    paymentMethods,
  ]);

  return useMemo(
    () => ({
      route,
      nav,
      auth,
      data,
      cart,
      footer,
      ui: uiWithActiveCategory,
      layout,
      domain,
      modals,
      editors,
      orchestrator,
      settings,
      images,
      kitchen,
      utils,
      vm,
    }),
    [
      auth,
      cart,
      data,
      domain,
      editors,
      footer,
      images,
      kitchen,
      layout,
      modals,
      nav,
      orchestrator,
      route,
      settings,
      uiWithActiveCategory,
      utils,
      vm,
    ]
  );
}
