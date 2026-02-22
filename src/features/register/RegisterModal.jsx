import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useCurrency } from "../../context/CurrencyContext";
import secureFetch from "../../utils/secureFetch";
import { clearRegisterSummaryCache, loadExpectedCashInBackground } from "../../utils/registerSummaryCache";
import LegacyRegisterModal from "../../modals/RegisterModal";
import { useRegisterState } from "./useRegisterState";
import { useRegisterTimeline } from "./useRegisterTimeline";
import { useRegisterReconciliation } from "./useRegisterReconciliation";
import { useTerminalZReport } from "./useTerminalZReport";
import { useStockDiscrepancy } from "./useStockDiscrepancy";
import { useRegisterModalBoot } from "./useRegisterModalBoot";

const formatLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeOrderStatus = (status) => {
  if (!status) return "";
  const normalized = String(status).toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

const isOrderCancelledOrCanceled = (status) => {
  const normalized = normalizeOrderStatus(status);
  return normalized === "cancelled" || normalized === "canceled";
};

const isOrderPaid = (order) => {
  const status = normalizeOrderStatus(order?.status);
  const paymentStatus = String(order?.payment_status || "").toLowerCase();
  return status === "paid" || paymentStatus === "paid" || order?.is_paid === true;
};

const hasUnpaidAnywhere = (order) => {
  if (!order) return false;
  const suborders = Array.isArray(order.suborders) ? order.suborders : [];
  const items = Array.isArray(order.items) ? order.items : [];
  const unpaidSub = suborders.some((sub) =>
    Array.isArray(sub.items) ? sub.items.some((i) => !i.paid_at && !i.paid) : false
  );
  const unpaidMain = items.some((i) => !i.paid_at && !i.paid);
  return unpaidSub || unpaidMain;
};

const isOrderFullyPaid = (order) => isOrderPaid(order) && !hasUnpaidAnywhere(order);

const getOrderTabHint = (order) => {
  if (!order) return "tables";
  const type = String(order.order_type || "").toLowerCase();
  if (type === "takeaway") return "takeaway";
  if (type === "packet") return "packet";
  if (type === "phone") return "phone";
  if (order.table_number != null) return "tables";
  return isOrderFullyPaid(order) ? "history" : "kitchen";
};

const formatOpenOrderLabel = (order) => {
  if (!order) return "";
  const status = normalizeOrderStatus(order.status);
  const type = String(order.order_type || "").toLowerCase();
  const where = order.table_number != null ? `table ${order.table_number}` : type ? type : "order";
  return `#${order.id} (${where}, ${status || "unknown"})`;
};

export default function RegisterModal({
  showRegisterModal,
  setShowRegisterModal,
  handleTabSelect,
}) {
  const { t } = useTranslation();
  const { formatCurrency, config } = useCurrency();
  const location = useLocation();
  const didAutoOpenRegisterRef = useRef(false);
  const lastStockOpenRef = useRef(null);

  const [actualCash, setActualCash] = useState("");
  const [dailyCashExpense, setDailyCashExpense] = useState(undefined);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryAmount, setEntryAmount] = useState("");
  const [entryReason, setEntryReason] = useState("");
  const [showRegisterLog, setShowRegisterLog] = useState(false);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeAmount, setChangeAmount] = useState("");
  const [lastCloseReceiptUrl, setLastCloseReceiptUrl] = useState("");
  const [lastCloseReceiptAt, setLastCloseReceiptAt] = useState(null);

  const CASH_DIFF_THRESHOLD = 50;
  const CARD_DIFF_THRESHOLD = 50;

  const fetchRegisterStatus = useCallback(
    (forceFresh = false) =>
      secureFetch(
        forceFresh
          ? `/reports/cash-register-status?_t=${Date.now()}`
          : "/reports/cash-register-status"
      ),
    []
  );

  const {
    registerEntries,
    fetchRegisterEntriesForToday,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    combinedEvents,
    cashRefundTotal,
  } = useRegisterTimeline({ secureFetch });

  const fetchLastCloseReceipt = useCallback(async () => {
    try {
      const rows = await secureFetch("/reports/last-register-closes?limit=1");
      const row = Array.isArray(rows) && rows.length ? rows[0] : null;
      setLastCloseReceiptUrl(row?.terminal_report_url || "");
      setLastCloseReceiptAt(row?.created_at || null);
    } catch (err) {
      console.warn("⚠️ Failed to load last close receipt:", err);
      setLastCloseReceiptUrl("");
      setLastCloseReceiptAt(null);
    }
  }, []);

  const {
    registerState,
    setRegisterState,
    openingCash,
    setOpeningCash,
    expectedCash,
    setExpectedCash,
    yesterdayCloseCash,
    setYesterdayCloseCash,
    lastOpenAt,
    setLastOpenAt,
    refreshRegisterState,
    initializeRegisterSummary,
  } = useRegisterState({
    fetchRegisterStatus,
  });

  const {
    terminalCardTotal,
    setTerminalCardTotal,
    terminalTxCount,
    setTerminalTxCount,
    terminalRefundTotal,
    setTerminalRefundTotal,
    terminalReportUrl,
    terminalReportUrls,
    terminalReportDetails,
    terminalReportUploading,
    terminalReportUploadingAny,
    terminalCashTotal,
    setTerminalCashTotal,
    terminalGrandTotal,
    setTerminalGrandTotal,
    zReportDetected,
    zReportConfidence,
    zReportPreviewUrls,
    useDetectedValues,
    detectedTable,
    detectedDelivery,
    computeSplitCardDiff,
    tableReceiptCount,
    deliveryReceiptCount,
    handleDeleteTerminalReceipt,
    handleTerminalReceiptUpload,
    handleUseDetectedToggle,
    resetTerminalZReport,
  } = useTerminalZReport({
    secureFetch,
    toast,
    t,
    lastOpenAt,
  });

  const {
    reconciliation,
    reconLoading,
    resetReconciliation,
    cashDifference,
    cardDifference,
    riskScore,
    expectedCashComputed,
    openingFloat,
    posCardTotal,
    posCashTotal,
    posOtherTotal,
    riskFlags,
    cardBreakdown,
  } = useRegisterReconciliation({
    secureFetch,
    expectedCash,
    setExpectedCash,
    openingCash,
    actualCash,
    terminalCardTotal,
    cashRefundTotal,
    showRegisterModal,
    registerState,
    lastOpenAt,
  });

  const {
    fetchStockDiscrepancy,
    stockDiscrepancyLoading,
    stockVarianceItems,
    stockVarianceSummary,
    resetStockDiscrepancy,
  } = useStockDiscrepancy({ secureFetch });

  const parsedOpeningCash = Number(openingCash || 0);
  const parsedYesterdayCloseCash = Number(yesterdayCloseCash || 0);
  const openingDifference = parsedOpeningCash - parsedYesterdayCloseCash;

  const splitCardDiff = React.useMemo(
    () => computeSplitCardDiff(cardBreakdown),
    [computeSplitCardDiff, cardBreakdown]
  );

  const setStateHandlersForReset = useMemo(
    () => ({
      setExpectedCash,
      setDailyCashExpense,
      setActualCash,
      setRegisterState,
      resetReconciliation,
      resetTerminalZReport,
      resetStockDiscrepancy,
    }),
    [
      setExpectedCash,
      setDailyCashExpense,
      setActualCash,
      setRegisterState,
      resetReconciliation,
      resetTerminalZReport,
      resetStockDiscrepancy,
    ]
  );

  const { cashDataLoaded } = useRegisterModalBoot({
    showRegisterModal,
    initializeRegisterSummary,
    fetchLastCloseReceipt,
    fetchRegisterLogsForToday,
    fetchRegisterPaymentsForToday,
    fetchRegisterEntriesForToday,
    loadExpectedCashInBackground,
    formatLocalYmd,
    setStateHandlersForReset,
  });

  useEffect(() => {
    if (!showRegisterModal) return;
    if (registerState !== "open") return;
    if (!lastOpenAt) return;
    if (lastStockOpenRef.current === lastOpenAt) return;
    lastStockOpenRef.current = lastOpenAt;
    fetchStockDiscrepancy(lastOpenAt);
  }, [showRegisterModal, registerState, lastOpenAt, fetchStockDiscrepancy]);

  useEffect(() => {
    refreshRegisterState();
  }, [refreshRegisterState]);

  useEffect(() => {
    if (didAutoOpenRegisterRef.current) return;
    if (
      location.state?.openRegisterModal === true ||
      registerState === "closed" ||
      registerState === "unopened"
    ) {
      didAutoOpenRegisterRef.current = true;
      setShowRegisterModal(true);
    }
  }, [location.state, registerState, setShowRegisterModal]);

  const handleChangeCashSubmit = async (e) => {
    e.preventDefault();
    if (!changeAmount || isNaN(changeAmount) || Number(changeAmount) <= 0) {
      toast.error("Enter a valid change amount");
      return;
    }

    try {
      await secureFetch("/reports/cash-register-log", {
        method: "POST",
        body: JSON.stringify({
          type: "change",
          amount: Number(changeAmount),
          note: "Change given to customer",
        }),
      });

      toast.success("Change recorded successfully!");
      setChangeAmount("");
      setShowChangeForm(false);

      setShowRegisterModal(false);
      setTimeout(() => setShowRegisterModal(true), 350);
    } catch (err) {
      console.error("❌ Failed to record change:", err);
      toast.error(err.message || "Failed to record change");
    }
  };

  return (
    <LegacyRegisterModal
      showRegisterModal={showRegisterModal}
      setShowRegisterModal={setShowRegisterModal}
      handleTabSelect={handleTabSelect}
      t={t}
      registerState={registerState}
      cashDataLoaded={cashDataLoaded}
      openingCash={openingCash}
      setOpeningCash={setOpeningCash}
      config={config}
      yesterdayCloseCash={yesterdayCloseCash}
      formatCurrency={formatCurrency}
      parsedYesterdayCloseCash={parsedYesterdayCloseCash}
      parsedOpeningCash={parsedOpeningCash}
      openingDifference={openingDifference}
      lastCloseReceiptUrl={lastCloseReceiptUrl}
      lastCloseReceiptAt={lastCloseReceiptAt}
      cashDifference={cashDifference}
      CASH_DIFF_THRESHOLD={CASH_DIFF_THRESHOLD}
      cardDifference={cardDifference}
      CARD_DIFF_THRESHOLD={CARD_DIFF_THRESHOLD}
      stockVarianceItems={stockVarianceItems}
      reconciliation={reconciliation}
      stockDiscrepancyLoading={stockDiscrepancyLoading}
      stockVarianceSummary={stockVarianceSummary}
      reconLoading={reconLoading}
      openingFloat={openingFloat}
      expectedCashComputed={expectedCashComputed}
      actualCash={actualCash}
      setActualCash={setActualCash}
      posCardTotal={posCardTotal}
      terminalCardTotal={terminalCardTotal}
      setTerminalCardTotal={setTerminalCardTotal}
      useDetectedValues={useDetectedValues}
      zReportConfidence={zReportConfidence}
      terminalTxCount={terminalTxCount}
      setTerminalTxCount={setTerminalTxCount}
      terminalRefundTotal={terminalRefundTotal}
      setTerminalRefundTotal={setTerminalRefundTotal}
      terminalCashTotal={terminalCashTotal}
      setTerminalCashTotal={setTerminalCashTotal}
      terminalGrandTotal={terminalGrandTotal}
      setTerminalGrandTotal={setTerminalGrandTotal}
      detectedTable={detectedTable}
      detectedDelivery={detectedDelivery}
      splitCardDiff={splitCardDiff}
      terminalReportUploading={terminalReportUploading}
      terminalReportUploadingAny={terminalReportUploadingAny}
      handleTerminalReceiptUpload={handleTerminalReceiptUpload}
      tableReceiptCount={tableReceiptCount}
      deliveryReceiptCount={deliveryReceiptCount}
      zReportPreviewUrls={zReportPreviewUrls}
      terminalReportUrls={terminalReportUrls}
      terminalReportUrl={terminalReportUrl}
      terminalReportDetails={terminalReportDetails}
      handleDeleteTerminalReceipt={handleDeleteTerminalReceipt}
      zReportDetected={zReportDetected}
      handleUseDetectedToggle={handleUseDetectedToggle}
      cardBreakdown={cardBreakdown}
      riskScore={riskScore}
      riskFlags={riskFlags}
      showEntryForm={showEntryForm}
      setShowEntryForm={setShowEntryForm}
      entryAmount={entryAmount}
      setEntryAmount={setEntryAmount}
      entryReason={entryReason}
      setEntryReason={setEntryReason}
      combinedEvents={combinedEvents}
      showRegisterLog={showRegisterLog}
      setShowRegisterLog={setShowRegisterLog}
      showChangeForm={showChangeForm}
      handleChangeCashSubmit={handleChangeCashSubmit}
      changeAmount={changeAmount}
      setChangeAmount={setChangeAmount}
      normalizeOrderStatus={normalizeOrderStatus}
      isOrderCancelledOrCanceled={isOrderCancelledOrCanceled}
      formatOpenOrderLabel={formatOpenOrderLabel}
      getOrderTabHint={getOrderTabHint}
      setLastCloseReceiptUrl={setLastCloseReceiptUrl}
      setLastCloseReceiptAt={setLastCloseReceiptAt}
      didAutoOpenRegisterRef={didAutoOpenRegisterRef}
      setRegisterState={setRegisterState}
      setYesterdayCloseCash={setYesterdayCloseCash}
      setLastOpenAt={setLastOpenAt}
      refreshRegisterState={refreshRegisterState}
    />
  );
}
