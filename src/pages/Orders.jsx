import { useDeferredValue, useState, useMemo, useCallback, useReducer } from "react";
import { geocodeAddress } from "../utils/geocode";
import socket from "../utils/socket";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { usePaymentMethods } from "../hooks/usePaymentMethods";
import { DEFAULT_PAYMENT_METHODS } from "../utils/paymentMethods";
import { useCurrency } from "../context/CurrencyContext";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useSetting } from "../components/hooks/useSetting";
import { DEFAULT_TRANSACTION_SETTINGS } from "../constants/transactionSettingsDefaults";
import { printViaBridge } from "../utils/receiptPrinter";
import { fetchOrderWithItems } from "../utils/orderPrinting";
import { useOrdersController } from "../features/orders/controller/useOrdersController";
import { usePaymentFlow } from "../features/orders/payments/hooks/usePaymentFlow";
import { useCancelFlow } from "../features/orders/cancel/hooks/useCancelFlow";
import { useRouteController } from "../features/orders/route/hooks/useRouteController";
import { calcOrderDiscount, calcOrderTotalWithExtras } from "../features/orders/shared/orderMath";
import { formatOnlineSourceLabel } from "../features/orders/shared/formatters";
import {
  isAutoConfirmEnabledForOrder as isAutoConfirmEnabledForOrderGuard,
} from "../features/orders/shared/guards";
import OrdersHeaderBar from "../features/orders/ui/OrdersHeaderBar";
import OrdersLeftListPanel from "../features/orders/ui/OrdersLeftListPanel";
import OrdersRightDetailsPanel from "../features/orders/ui/OrdersRightDetailsPanel";
import OrdersActionBar from "../features/orders/ui/OrdersActionBar";
import OrdersModalsHost from "../features/orders/ui/OrdersModalsHost";
import DriverReportPanel from "../features/orders/route/components/DriverReportPanel";
import LiveRoutePanel from "../features/orders/route/components/LiveRoutePanel";
import DrinkSettingsModal from "../features/orders/components/DrinkSettingsModal";
import PaymentModal from "../features/orders/payments/components/PaymentModal";
import CancelOrderModal from "../features/orders/cancel/components/CancelOrderModal";
import OrdersErrorBoundary from "../features/orders/shared/OrdersErrorBoundary";

const initialUIState = {
  showDrinkModal: false,
};

function uiReducer(state, action) {
  switch (action.type) {
    case "open":
      return { ...state, [action.key]: true };
    case "close":
      return { ...state, [action.key]: false };
    case "toggle":
      return { ...state, [action.key]: !state[action.key] };
    default:
      return state;
  }
}

export default function Orders({ orders: propOrders }) {
  const paymentMethods = usePaymentMethods();
  const methodOptionSource = useMemo(
    () => (paymentMethods.length ? paymentMethods : DEFAULT_PAYMENT_METHODS),
    [paymentMethods]
  );
  const paymentMethodLabels = useMemo(
    () => methodOptionSource.map((method) => method.label),
    [methodOptionSource]
  );
  const fallbackMethodLabel = paymentMethodLabels[0] || "Cash";

  const [updating, setUpdating] = useState({});
  const [ui, dispatchUI] = useReducer(uiReducer, initialUIState);
  const { showDrinkModal } = ui;
  const { t } = useTranslation();
  const { formatCurrency, config } = useCurrency();

  const {
    orders,
    setOrders,
    drivers,
    mapStops: ordersMapStops,
    driverReport: ordersDriverReport,
    reportFromDate: ordersReportFromDate,
    setReportFromDate: setOrdersReportFromDate,
    reportToDate: ordersReportToDate,
    setReportToDate: setOrdersReportToDate,
    reportLoading: ordersReportLoading,
    productPrepById,
    integrationsSettings,
    confirmingOnlineOrders,
    statusFilter,
    setStatusFilter,
    selectedOrderId,
    selectedDriverId: ordersSelectedDriverId,
    setSelectedDriverId: setOrdersSelectedDriverId,
    refresh: fetchOrders,
    fetchDrinks,
    fetchDriverReport: fetchDriverReportFromOrders,
    openRouteForSelectedDriver: openRouteForSelectedDriverFromOrders,
    filteredOrders,
    safeOrders,
    routeOrders: ordersRouteOrders,
    filteredDrinkSummaryByDriver,
    assignedOrderCountForSelectedDriver,
    getRelevantOrderItems,
    areDriverItemsDelivered,
    isKitchenExcludedItem,
    actions,
  } = useOrdersController({
    restaurantId: null,
    secureFetch,
    socket,
    pollingEnabled: true,
    pollingIntervalMs: 15000,
    geocodeAddress,
    t,
    toast,
    propOrders,
    paymentMethodLabels,
  });

  const showDriverColumn = true;
  const confirmOnlineOrder = actions.confirmOnlineOrder;

  const [transactionSettings, setTransactionSettings] = useState(
    DEFAULT_TRANSACTION_SETTINGS
  );
  useSetting("transactions", setTransactionSettings, DEFAULT_TRANSACTION_SETTINGS);

  const [notificationSettings, setNotificationSettings] = useState({
    enabled: true,
    enableToasts: true,
  });
  useSetting("notifications", setNotificationSettings, {
    enabled: true,
    enableToasts: true,
  });

  const emitToast = useCallback(
    (type, message) => {
      const enableToasts = notificationSettings?.enableToasts ?? true;
      if (!enableToasts) return;
      const fn = toast?.[type];
      if (typeof fn === "function") fn(message);
    },
    [notificationSettings?.enableToasts]
  );

  const handlePacketPrint = useCallback(
    async (orderId) => {
      if (!orderId) {
        toast.warn(t("No order selected to print"));
        return;
      }
      try {
        const printable = await fetchOrderWithItems(orderId);
        const ok = await printViaBridge("", printable);
        toast[ok ? "success" : "warn"](
          ok ? t("Receipt sent to printer") : t("Printer bridge is not connected")
        );
      } catch (err) {
        globalThis.console.error("❌ Print failed:", err);
        toast.error(t("Failed to print receipt"));
      }
    },
    [t]
  );

  const {
    openPaymentModalForOrder,
    shouldAutoClosePacketOnDelivered,
    closeOrderInstantly,
    paymentModalProps,
  } = usePaymentFlow({
    fallbackMethodLabel,
    methodOptionSource,
    transactionSettings,
    orders,
    emitToast,
    t,
    propOrders,
    actions,
  });

  const { openCancelModalForOrder, cancelModalProps } = useCancelFlow({
    methodOptionSource,
    actions,
    propOrders,
    t,
    toast,
  });

  const {
    showDriverReport,
    selectedDriverId,
    setSelectedDriverId,
    openRouteForDriver,
    toggleDriverReport,
    routeProps,
    driverReportProps,
  } = useRouteController({
    orders,
    drivers,
    mapStops: ordersMapStops,
    routeOrders: ordersRouteOrders,
    filteredOrders,
    driverReport: ordersDriverReport,
    reportLoading: ordersReportLoading,
    reportFromDate: ordersReportFromDate,
    setReportFromDate: setOrdersReportFromDate,
    reportToDate: ordersReportToDate,
    setReportToDate: setOrdersReportToDate,
    selectedDriverId: ordersSelectedDriverId,
    setSelectedDriverId: setOrdersSelectedDriverId,
    refreshRoute: openRouteForSelectedDriverFromOrders,
    refreshDriverReport: fetchDriverReportFromOrders,
    t,
    formatCurrency,
    showDriverColumn,
  });

  const deferredSelectedOrderId = useDeferredValue(selectedOrderId);
  const deferredSelectedOrder = useMemo(() => {
    if (!deferredSelectedOrderId) return null;
    return (
      (orders || []).find(
        (order) => String(order?.id || "") === String(deferredSelectedOrderId)
      ) || null
    );
  }, [deferredSelectedOrderId, orders]);

  const isAutoConfirmEnabledForOrder = useCallback(
    (order) => isAutoConfirmEnabledForOrderGuard(order, integrationsSettings),
    [integrationsSettings]
  );

  const openDrinkModal = useCallback(() => {
    dispatchUI({ type: "open", key: "showDrinkModal" });
  }, []);

  const closeDrinkModal = useCallback(() => {
    dispatchUI({ type: "close", key: "showDrinkModal" });
  }, []);

  const handleStatusFilterChange = useCallback(
    (value) => {
      setStatusFilter(value);
    },
    [setStatusFilter]
  );

  const handleSelectedDriverChange = useCallback(
    (value) => {
      setSelectedDriverId(value);
    },
    [setSelectedDriverId]
  );

  const handleOpenRoute = useCallback(() => {
    openRouteForDriver(selectedDriverId);
  }, [openRouteForDriver, selectedDriverId]);

  const uiActions = useMemo(
    () => ({
      openDrinkModal,
      closeDrinkModal,
      toggleDriverReport,
      handleStatusFilterChange,
      handleSelectedDriverChange,
      handleOpenRoute,
      openCancelModalForOrder,
      openPaymentModalForOrder,
    }),
    [
      closeDrinkModal,
      handleOpenRoute,
      handleSelectedDriverChange,
      handleStatusFilterChange,
      openCancelModalForOrder,
      openDrinkModal,
      openPaymentModalForOrder,
      toggleDriverReport,
    ]
  );

  const drinkModal = useMemo(
    () => ({
      open: showDrinkModal,
      onClose: uiActions.closeDrinkModal,
      fetchDrinks,
      summaryByDriver: filteredDrinkSummaryByDriver,
    }),
    [fetchDrinks, filteredDrinkSummaryByDriver, showDrinkModal, uiActions.closeDrinkModal]
  );

  const paymentModal = useMemo(
    () => ({
      ...paymentModalProps,
      methodOptionSource,
      config,
      formatCurrency,
    }),
    [config, formatCurrency, methodOptionSource, paymentModalProps]
  );

  const cancelModal = useMemo(
    () => ({
      ...cancelModalProps,
      methodOptionSource,
      formatCurrency,
    }),
    [cancelModalProps, formatCurrency, methodOptionSource]
  );

  return (
    <div className="min-h-screen w-full bg-slate-50 pb-28 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <OrdersHeaderBar>
        <OrdersErrorBoundary>
          <DriverReportPanel {...driverReportProps} />
        </OrdersErrorBoundary>
        <OrdersErrorBoundary>
          <LiveRoutePanel {...routeProps} />
        </OrdersErrorBoundary>
      </OrdersHeaderBar>

      <OrdersErrorBoundary>
        <OrdersLeftListPanel
          safeOrders={safeOrders}
          calcOrderTotalWithExtras={calcOrderTotalWithExtras}
          calcOrderDiscount={calcOrderDiscount}
          formatOnlineSourceLabel={formatOnlineSourceLabel}
          isAutoConfirmEnabledForOrder={isAutoConfirmEnabledForOrder}
          t={t}
          drivers={drivers}
          confirmingOnlineOrders={confirmingOnlineOrders}
          confirmOnlineOrder={confirmOnlineOrder}
          actions={actions}
          setOrders={setOrders}
          shouldAutoClosePacketOnDelivered={shouldAutoClosePacketOnDelivered}
          closeOrderInstantly={closeOrderInstantly}
          emitToast={emitToast}
          fetchOrders={fetchOrders}
          propOrders={propOrders}
          openCancelModalForOrder={uiActions.openCancelModalForOrder}
          openPaymentModalForOrder={uiActions.openPaymentModalForOrder}
          formatCurrency={formatCurrency}
          handlePacketPrint={handlePacketPrint}
          getRelevantOrderItems={getRelevantOrderItems}
          areDriverItemsDelivered={areDriverItemsDelivered}
          updating={updating}
          setUpdating={setUpdating}
          toast={toast}
          productPrepById={productPrepById}
          isKitchenExcludedItem={isKitchenExcludedItem}
        />
      </OrdersErrorBoundary>

      <OrdersErrorBoundary>
        <OrdersRightDetailsPanel
          selectedOrderId={selectedOrderId}
          deferredSelectedOrderId={deferredSelectedOrderId}
          selectedOrder={deferredSelectedOrder}
        />
      </OrdersErrorBoundary>

      <OrdersActionBar
        statusFilter={statusFilter}
        onStatusFilterChange={uiActions.handleStatusFilterChange}
        drivers={drivers}
        onOpenDrinkModal={uiActions.openDrinkModal}
        showDriverReport={showDriverReport}
        onToggleDriverReport={uiActions.toggleDriverReport}
        onOpenRoute={uiActions.handleOpenRoute}
        assignedOrderCountForSelectedDriver={assignedOrderCountForSelectedDriver}
        selectedDriverId={selectedDriverId}
        onSelectedDriverChange={uiActions.handleSelectedDriverChange}
        t={t}
      />

      <OrdersModalsHost>
        <DrinkSettingsModal
          open={drinkModal.open}
          onClose={drinkModal.onClose}
          fetchDrinks={drinkModal.fetchDrinks}
          summaryByDriver={drinkModal.summaryByDriver}
        />

        <PaymentModal
          open={paymentModal.open}
          order={paymentModal.order}
          splitPayments={paymentModal.splitPayments}
          methodOptionSource={paymentModal.methodOptionSource}
          config={paymentModal.config}
          formatCurrency={paymentModal.formatCurrency}
          grandTotal={paymentModal.grandTotal}
          paidTotal={paymentModal.paidTotal}
          onClose={paymentModal.onClose}
          onMethodChange={paymentModal.onMethodChange}
          onAmountChange={paymentModal.onAmountChange}
          onRemoveRow={paymentModal.onRemoveRow}
          onAddRow={paymentModal.onAddRow}
          onSubmit={paymentModal.onSubmit}
        />

        <CancelOrderModal
          open={cancelModal.open}
          order={cancelModal.order}
          cancelReason={cancelModal.cancelReason}
          onCancelReasonChange={cancelModal.onCancelReasonChange}
          cancelLoading={cancelModal.cancelLoading}
          refundMethodId={cancelModal.refundMethodId}
          onRefundMethodIdChange={cancelModal.onRefundMethodIdChange}
          refundMode={cancelModal.refundMode}
          onRefundModeChange={cancelModal.onRefundModeChange}
          shouldShowRefundMethod={cancelModal.shouldShowRefundMethod}
          refundAmount={cancelModal.refundAmount}
          methodOptionSource={cancelModal.methodOptionSource}
          formatCurrency={cancelModal.formatCurrency}
          onClose={cancelModal.onClose}
          onSubmit={cancelModal.onSubmit}
        />
      </OrdersModalsHost>
    </div>
  );
}
