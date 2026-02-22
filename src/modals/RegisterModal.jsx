import { toast } from "react-toastify";
import React, { useMemo, useState } from "react";
import secureFetch from "../utils/secureFetch";
import { clearRegisterSummaryCache } from "../utils/registerSummaryCache";
import RegisterReconciliationPanel from "../features/register/RegisterReconciliationPanel";
import TerminalZReportPanel from "../features/register/TerminalZReportPanel";
import RegisterTimelinePanel from "../features/register/RegisterTimelinePanel";

function RegisterModal(props) {
  const {
    showRegisterModal,
    setShowRegisterModal,
    handleTabSelect,
    t,
    registerState,
    cashDataLoaded,
    openingCash,
    setOpeningCash,
    config,
    yesterdayCloseCash,
    formatCurrency,
    parsedYesterdayCloseCash,
    parsedOpeningCash,
    openingDifference,
    lastCloseReceiptUrl,
    lastCloseReceiptAt,
    cashDifference,
    CASH_DIFF_THRESHOLD,
    cardDifference,
    CARD_DIFF_THRESHOLD,
    stockVarianceItems,
    reconciliation,
    stockDiscrepancyLoading,
    stockVarianceSummary,
    reconLoading,
    openingFloat,
    expectedCashComputed,
    actualCash,
    setActualCash,
    posCardTotal,
    terminalCardTotal,
    setTerminalCardTotal,
    useDetectedValues,
    zReportConfidence,
    terminalTxCount,
    setTerminalTxCount,
    terminalRefundTotal,
    setTerminalRefundTotal,
    terminalCashTotal,
    setTerminalCashTotal,
    terminalGrandTotal,
    setTerminalGrandTotal,
    detectedTable,
    detectedDelivery,
    splitCardDiff,
    terminalReportUploading,
    terminalReportUploadingAny,
    handleTerminalReceiptUpload,
    tableReceiptCount,
    deliveryReceiptCount,
    zReportPreviewUrls,
    terminalReportUrls,
    terminalReportUrl,
    terminalReportDetails,
    handleDeleteTerminalReceipt,
    zReportDetected,
    handleUseDetectedToggle,
    cardBreakdown,
    riskScore,
    riskFlags,
    showEntryForm,
    setShowEntryForm,
    entryAmount,
    setEntryAmount,
    entryReason,
    setEntryReason,
    combinedEvents,
    showRegisterLog,
    setShowRegisterLog,
    showChangeForm,
    handleChangeCashSubmit,
    changeAmount,
    setChangeAmount,
    normalizeOrderStatus,
    isOrderCancelledOrCanceled,
    formatOpenOrderLabel,
    getOrderTabHint,
    setLastCloseReceiptUrl,
    setLastCloseReceiptAt,
    didAutoOpenRegisterRef,
    setRegisterState,
    setYesterdayCloseCash,
    setLastOpenAt,
    refreshRegisterState,
  } = props;

  const [submitting, setSubmitting] = useState(false);

  // Memoize expensive computations to prevent recalculations on every render
  const memoizedComputations = useMemo(() => ({
    cashDiffColor: Math.abs(cashDifference) <= CASH_DIFF_THRESHOLD ? "text-emerald-600" : "text-red-600",
    cardDiffColor: Math.abs(cardDifference) <= CARD_DIFF_THRESHOLD ? "text-emerald-600" : "text-red-600",
    opsSignals: reconciliation?.opsSignals || {
      void_count: 0,
      void_total: 0,
      discount_total: 0,
      cancelled_count: 0,
      payment_method_change_count: 0,
    },
  }), [cashDifference, CASH_DIFF_THRESHOLD, cardDifference, CARD_DIFF_THRESHOLD, reconciliation]);

  return (
<>
{showRegisterModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-all">
    <div
      className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-[0_20px_70px_rgba(15,23,42,0.35)] border border-slate-200 dark:border-slate-800 mx-3 w-full max-w-[520px] md:max-w-[860px] max-h-[90vh] overflow-y-auto p-8 animate-fade-in"
    >
      {/* Close Button */}
      <button
        onClick={() => {
          setShowRegisterModal(false);
          handleTabSelect("tables");
        }}
        className="absolute top-5 right-5 text-2xl text-gray-400 hover:text-indigo-700 transition-all hover:-translate-y-1"
        title={t("Close")}
        aria-label="Close"
        tabIndex={0}
      >
        <span className="block bg-white/80 dark:bg-gray-800/70 rounded-full p-2 shadow hover:shadow-xl">✕</span>
      </button>

      <div className="space-y-1 mb-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">{t("Register")}</p>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {registerState === "unopened" || registerState === "closed"
            ? t("Open Register")
            : t("Register Summary")}
        </h2>
        <div className="h-px bg-slate-200 dark:bg-slate-700 mt-4" />
      </div>


      {/* Modal Content */}
      {!cashDataLoaded ? (
        <p className="text-center text-gray-500 font-semibold">{t('Loading register data...')}</p>
      ) : registerState === "closed" || registerState === "unopened" ? (
        <>
          {/* Opening Cash Entry */}
          <div className="mb-8 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              {t("Opening Cash")}
            </label>
            <input
              type="number"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-300 text-lg shadow-sm focus:border-blue-500 outline-none transition"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            {yesterdayCloseCash !== null && (
              <p className="text-sm text-slate-500">
                {t("Last Closing")}: {formatCurrency(parsedYesterdayCloseCash)}
              </p>
            )}
          </div>
          {/* Comparison Card */}
          {openingCash !== "" && yesterdayCloseCash !== null && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-2 shadow-sm space-y-3 text-sm text-slate-700">
              <div className="flex justify-between">
                <span className="text-slate-500">{t("Opening")}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(parsedOpeningCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t("Last Closing")}</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatCurrency(parsedYesterdayCloseCash)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">{t("Difference")}</span>
                <span
                  className={`tabular-nums font-semibold ${
                    openingDifference !== 0 ? "text-red-600" : "text-slate-900"
                  }`}
                >
                  {formatCurrency(openingDifference)}
                </span>
              </div>
            </div>
          )}
          {lastCloseReceiptUrl && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {t("Last terminal receipt")}
                  </p>
                  {lastCloseReceiptAt && (
                    <p className="text-xs text-slate-500">
                      {new Date(lastCloseReceiptAt).toLocaleString("tr-TR")}
                    </p>
                  )}
                </div>
                <a
                  href={lastCloseReceiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 font-semibold underline"
                >
                  {t("View receipt")}
                </a>
              </div>
            </div>
          )}
        </>
      ) : (() => {
        // Summary content (register is open)
        // Use memoized computations instead of recalculating
        const { cashDiffColor, cardDiffColor, opsSignals } = memoizedComputations;
        const varianceItems = stockVarianceItems;

        return (
          <>
                <div className="space-y-6">
              {/* Stock Discrepancy (Session) */}
              <section className="bg-white border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-amber-500">Stock</p>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t("Stock Discrepancy (Session)")}
                    </h3>
                  </div>
                  {stockDiscrepancyLoading && (
                    <span className="text-xs text-amber-600">{t("Loading...")}</span>
                  )}
                </div>
                {(!stockVarianceItems || stockVarianceItems.length === 0) ? (
                  <p className="text-sm text-slate-600">
                    {t("No stock discrepancies detected for this session.")}
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {t("Total variance")}
                      </span>
                      <span className="text-lg font-bold text-amber-700 tabular-nums">
                        {formatCurrency(stockVarianceSummary.variance_value_total || 0)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {stockVarianceItems.map((item) => (
                        <div
                          key={`${item.ingredient_id || item.ingredient_name}`}
                          className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50 px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{item.ingredient_name}</p>
                            <p className="text-xs text-slate-600">
                              {t("Variance")}: {item.variance_qty.toFixed(2)} {item.unit || ""}
                            </p>
                          </div>
                          <div
                            className={`font-bold tabular-nums ${
                              item.variance_value < 0 ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatCurrency(item.variance_value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <RegisterReconciliationPanel
                t={t}
                reconLoading={reconLoading}
                openingFloat={openingFloat}
                expectedCashComputed={expectedCashComputed}
                actualCash={actualCash}
                setActualCash={setActualCash}
                config={config}
                cashDiffColor={cashDiffColor}
                cashDifference={cashDifference}
                formatCurrency={formatCurrency}
              />

              <TerminalZReportPanel
                t={t}
                reconLoading={reconLoading}
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
                config={config}
                cardBreakdown={cardBreakdown}
                cardDifference={cardDifference}
                cardDiffColor={cardDiffColor}
                detectedTable={detectedTable}
                detectedDelivery={detectedDelivery}
                splitCardDiff={splitCardDiff}
                terminalReportUploading={terminalReportUploading}
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
                formatCurrency={formatCurrency}
              />

              {/* Block 3 — Risk summary */}
              <section className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Block 3</p>
                    <h3 className="text-lg font-semibold">Risk summary</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-300">{t("Risk score")}</p>
                    <p className="text-2xl font-extrabold">{riskScore}/100</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {riskFlags.length === 0 ? (
                    <p className="text-sm text-slate-200">{t("No risk flags detected.")}</p>
                  ) : (
                    riskFlags.map((flag, idx) => (
                      <div
                        key={`${flag.code}-${idx}`}
                        className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3"
                      >
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            flag.severity === "high"
                              ? "bg-red-500/20 text-red-200 border border-red-400/40"
                              : "bg-amber-500/20 text-amber-200 border border-amber-300/40"
                          }`}
                        >
                          {flag.severity || "info"}
                        </span>
                        <div className="text-sm">
                          <div className="font-semibold">{flag.label || flag.code}</div>
                          <div className="text-slate-200 text-xs">{flag.detail}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-slate-300 text-xs uppercase tracking-wide">Voids</p>
                    <p className="font-bold">{opsSignals.void_count} / {formatCurrency(opsSignals.void_total)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-slate-300 text-xs uppercase tracking-wide">Discounts</p>
                    <p className="font-bold">{formatCurrency(opsSignals.discount_total)}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-slate-300 text-xs uppercase tracking-wide">Cancellations</p>
                    <p className="font-bold">{opsSignals.cancelled_count}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                    <p className="text-slate-300 text-xs uppercase tracking-wide">Method changes</p>
                    <p className="font-bold">{opsSignals.payment_method_change_count}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-semibold mb-2">{t("Stock variances (top)")}</p>
                  {varianceItems.length === 0 ? (
                    <p className="text-slate-200 text-sm">
                      {t("No stock variances available for this session.")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {varianceItems.map((item) => (
                        <div
                          key={item.item_id}
                          className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3"
                        >
                          <div>
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-xs text-slate-300">
                              {item.unit} • {t("Variance")}: {item.variance_qty}
                            </p>
                          </div>
                          <div className="font-bold">
                            {formatCurrency(item.variance_value || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {registerState === "open" && (
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => setShowEntryForm((v) => !v)}
                    className={`
                      px-4 py-2 rounded-xl font-semibold mb-3 transition-all shadow
                      ${
                        showEntryForm
                          ? "bg-slate-200 text-slate-900"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }
                    `}
                  >
                    {showEntryForm ? t("Hide Cash Entry") : t("Add Cash Entry")}
                  </button>
                  {showEntryForm && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!entryAmount || isNaN(entryAmount) || Number(entryAmount) <= 0) {
                          toast.error("Enter a valid amount");
                          return;
                        }
                        try {
                          await secureFetch("/reports/cash-register-log", {
                            method: "POST",
                            body: JSON.stringify({
                              type: "entry",
                              amount: Number(entryAmount),
                              note: entryReason || undefined,
                            }),
                          });

                          toast.success("Cash entry added!");
                          setEntryAmount("");
                          setEntryReason("");
                          setShowEntryForm(false);
                          setShowRegisterModal(false);
                          setTimeout(() => setShowRegisterModal(true), 350);
                        } catch (err) {
                          console.error("❌ Failed to add cash entry:", err);
                          toast.error(err.message || "Failed to add cash entry");
                        }
                      }}
                      className="flex flex-col gap-2 bg-white/90 rounded-2xl p-4 shadow border border-lime-200"
                    >
                      <label className="font-semibold text-gray-800">
                        {t("Amount")} ({config?.symbol || ""}):
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={entryAmount}
                        onChange={(e) => setEntryAmount(e.target.value)}
                        className="p-3 rounded-xl border-2 border-lime-300 focus:border-lime-500 text-lg mb-1"
                        placeholder={`${config?.symbol || ""}0.00`}
                        required
                      />
                      <label className="font-semibold text-gray-800">{t("Reason / Note")}:</label>
                      <input
                        type="text"
                        value={entryReason}
                        onChange={(e) => setEntryReason(e.target.value)}
                        className="p-3 rounded-xl border-2 border-gray-300 focus:border-lime-500 text-base"
                        placeholder={t("Optional note")}
                        maxLength={40}
                      />
                      <button
                        type="submit"
                        className="mt-3 bg-lime-500 hover:bg-lime-600 text-white font-bold py-2 rounded-xl transition"
                      >
                        {t("Add Cash Entry")}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>

<RegisterTimelinePanel
  t={t}
  combinedEvents={combinedEvents}
  showRegisterLog={showRegisterLog}
  setShowRegisterLog={setShowRegisterLog}
  formatCurrency={formatCurrency}
/>

          </>
        );
      })()}


      {/* Action Buttons */}
      <div className="flex flex-col gap-4 pt-4 border-t mt-7">
        {showChangeForm && (
          <form
            onSubmit={handleChangeCashSubmit}
            className="flex flex-wrap items-center gap-3 bg-slate-50 rounded-xl p-3 shadow-inner"
          >
            <label className="text-sm font-semibold text-slate-700">
              {t("Change Amount")}
            </label>
            <input
              type="number"
              value={changeAmount}
              onChange={(e) => setChangeAmount(e.target.value)}
              className="flex-1 min-w-[120px] rounded-lg border border-slate-300 px-3 py-2"
              placeholder={`${config?.symbol || ""}0.00`}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white font-semibold shadow hover:bg-emerald-600 transition"
            >
              {t("Log Change")}
            </button>
          </form>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => setShowChangeForm((prev) => !prev)}
            className="rounded-xl border border-emerald-200 px-4 py-2 font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50 transition"
          >
            {showChangeForm ? t("Hide Change Cash") : t("Change Cash")}
          </button>
          <button
            onClick={async () => {
  const type =
    registerState === "unopened" || registerState === "closed"
      ? "open"
      : "close";

  const openingAmount = parseFloat(openingCash);
  const countedCash = parseFloat(actualCash);

  if (type === "open") {
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      return toast.error(t("Missing opening cash"));
    }
  } else {
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return toast.error(t("Counted cash is required"));
    }
  }

  if (submitting) return;
  setSubmitting(true);
  const toastId =
    type === "close"
      ? toast.loading(t("Closing register..."))
      : toast.loading(t("Opening register..."));

  try {

    if (
      type === "close" &&
      (Math.abs(cashDifference) > CASH_DIFF_THRESHOLD ||
        Math.abs(cardDifference) > CARD_DIFF_THRESHOLD ||
        riskScore >= 70)
    ) {
      const confirmed = window.confirm(
        t("Large discrepancy detected. Are you sure you want to close?")
      );
      if (!confirmed) return;
    }

    const payload =
      type === "open"
        ? { type, amount: openingAmount }
        : {
            type,
            amount: countedCash, // backward compatibility
            counted_cash_total: countedCash,
            terminal_card_total:
              terminalCardTotal !== "" ? Number(terminalCardTotal) : undefined,
            terminal_tx_count:
              terminalTxCount !== "" ? Number(terminalTxCount) : undefined,
            terminal_refund_total:
              terminalRefundTotal !== "" ? Number(terminalRefundTotal) : undefined,
            terminal_report_url: terminalReportUrl || undefined,
            terminal_cash_total:
              terminalCashTotal !== "" ? Number(terminalCashTotal) : undefined,
            terminal_grand_total:
              terminalGrandTotal !== "" ? Number(terminalGrandTotal) : undefined,
            terminal_parse_confidence: zReportConfidence
              ? { ...zReportConfidence, used_detected: useDetectedValues }
              : undefined,
          };

    const result = await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (type === "close" && result?.log?.terminal_report_url) {
      setLastCloseReceiptUrl(result.log.terminal_report_url);
      setLastCloseReceiptAt(result.log.created_at || null);
    }

		    toast.update(toastId, {
		      render:
		        type === "open"
		          ? t("Register opened successfully.")
		          : t("Register closed successfully."),
		      type: "success",
		      isLoading: false,
		      autoClose: 2500,
		    });

	    // Invalidate cached register summary so state reflects immediately on reopen
	    clearRegisterSummaryCache();
	    if (type === "close") {
	      // Prevent auto-open effect from reopening modal after state flips to "closed".
	      didAutoOpenRegisterRef.current = true;
	      setRegisterState("closed");
	      setOpeningCash("");
	      setActualCash("");
	      if (Number.isFinite(countedCash)) {
	        setYesterdayCloseCash(countedCash);
	      }
	    } else {
	      // Prevent reconciliation effect from briefly using the previous session open time.
	      setLastOpenAt(null);
	      setRegisterState("open");
	      if (Number.isFinite(openingAmount)) {
	        setOpeningCash(String(openingAmount));
	      }
	    }
	    // Avoid blocking the UI on an extra network request; refresh in background.
	    refreshRegisterState(true);
	    window.dispatchEvent(new Event("register:refresh"));
	    window.dispatchEvent(new Event("reports:refresh"));
	    if (type === "open") {
	      handleTabSelect("tables", { replace: true });
	    }
	    setShowRegisterModal(false);
  } catch (err) {
    console.error(`❌ Failed to ${type} register:`, err);
    if (toastId) toast.dismiss(toastId);
    if (
      type === "close" &&
      typeof err?.message === "string" &&
      err.message.toLowerCase().includes("order") &&
      err.message.toLowerCase().includes("open")
    ) {
      try {
        const all = await secureFetch("/orders");
        const openOrders = Array.isArray(all)
          ? all.filter((o) => {
              const status = normalizeOrderStatus(o?.status);
              if (status === "closed") return false;
              if (isOrderCancelledOrCanceled(status)) return false;
              return true;
            })
          : [];
        if (openOrders.length > 0) {
          const first = openOrders[0];
          toast.error(
            `Backend reports open orders. First: ${formatOpenOrderLabel(first)}`
          );
          setShowRegisterModal(false);
          handleTabSelect(getOrderTabHint(first));
          return;
        }
      } catch (e) {
        console.warn("⚠️ Failed to load open orders after register close error", e);
      }
    }
    toast.error(err.message || `${t("Register")} ${type} failed`);
  } finally {
    setSubmitting(false);
  }
}}

        >
          {(registerState === "unopened" || registerState === "closed")
            ? t('Open Register')
            : t('Close Register')}
        </button>
        </div>
      </div>

      {/* Optional: subtle fade-in animation */}
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(40px) scale(0.96); } to { opacity: 1; transform: none; } }
        .animate-fade-in { animation: fade-in 0.36s cubic-bezier(.6,-0.28,.735,.045) both; }
      `}</style>
    </div>
  </div>
)}
</>
  );
}

export default React.memo(RegisterModal);
