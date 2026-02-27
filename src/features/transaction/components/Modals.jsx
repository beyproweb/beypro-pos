import React from "react";
import PaymentModal from "../../../modals/PaymentModal";
import ExtrasModal from "../../../modals/ExtrasModal";
import DiscountModal from "../../../modals/DiscountModal";
import MoveTableModal from "../../../modals/MoveTableModal";
import MergeTableModal from "../../../modals/MergeTableModal";
import { txSocketOn, txSocketOff } from "../../transactions/services/transactionSocket";

const Modals = ({
  t,
  confirmReservationCloseToast,
  resolveReservationCloseConfirmation,
  showPaymentModal,
  setShowPaymentModal,
  isSplitMode,
  setIsSplitMode,
  discountType,
  setDiscountType,
  discountValue,
  setDiscountValue,
  cartItems,
  paymentMethods,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  confirmPayment,
  splits,
  setSplits,
  totalDue,
  hasSelection,
  selectedItemsTotal,
  selectionQuantities,
  setSelectionQuantities,
  selectedCartItemIds,
  activeSplitMethod,
  setActiveSplitMethod,
  confirmPaymentWithSplits,
  currentUser,
  navigate,
  showCancelModal,
  closeCancelModal,
  order,
  tableLabelText,
  selectedCartItems,
  computeItemLineTotal,
  formatCurrency,
  hasPaidItems,
  refundMethodId,
  setRefundMethodId,
  refundAmount,
  cancelReason,
  setCancelReason,
  cancelLoading,
  handleCancelConfirm,
  showReservationModal,
  setShowReservationModal,
  reservationDate,
  setReservationDate,
  reservationTime,
  setReservationTime,
  reservationClients,
  setReservationClients,
  reservationNotes,
  setReservationNotes,
  existingReservation,
  handleDeleteReservation,
  handleSaveReservation,
  reservationLoading,
  showDebtModal,
  setShowDebtModal,
  debtSearch,
  handleDebtSearch,
  debtSearchLoading,
  debtSearchResults,
  handleSelectDebtCustomer,
  debtForm,
  setDebtForm,
  isDebtSaving,
  debtLookupLoading,
  debtError,
  setDebtError,
  handleAddToDebt,
  showExtrasModal,
  setShowExtrasModal,
  selectedProduct,
  setSelectedProduct,
  selectedExtras,
  setSelectedExtras,
  extrasGroups,
  handleExtrasModalConfirm,
  presetNotes,
  note,
  setNote,
  fullTotal,
  showDiscountModal,
  setShowDiscountModal,
  showMoveTableModal,
  setShowMoveTableModal,
  tableId,
  identifier,
  txApiRequest,
  showMergeTableModal,
  setShowMergeTableModal,
  showToast,
}) => {
  return (
    <>
      {confirmReservationCloseToast.show && (
        <div className="fixed bottom-5 left-1/2 z-[60] w-[94vw] max-w-lg -translate-x-1/2 rounded-2xl bg-slate-900/90 px-4 py-3 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
            <div className="flex-1 space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/90">
                {t("Reservation ongoing")}
              </p>
              <p className="text-sm leading-snug text-white">
                {confirmReservationCloseToast.schedule
                  ? t("This table has an active reservation: {{date}} at {{time}} for {{clients}} guests", {
                      date: confirmReservationCloseToast.schedule.date,
                      time: confirmReservationCloseToast.schedule.time,
                      clients: confirmReservationCloseToast.schedule.clients,
                    })
                  : t("This table has an active reservation")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => resolveReservationCloseConfirmation(false)}
              className="rounded-full bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
            >
              {t("Dismiss")}
            </button>
            <button
              type="button"
              onClick={() => resolveReservationCloseConfirmation(true)}
              className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-amber-950 shadow-sm hover:bg-amber-300"
            >
              {t("Close anyway")}
            </button>
          </div>
        </div>
      )}

      <PaymentModal
        show={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        isSplitMode={isSplitMode}
        setIsSplitMode={setIsSplitMode}
        discountType={discountType}
        discountValue={discountValue}
        cartItems={cartItems}
        t={t}
        paymentMethods={paymentMethods}
        selectedPaymentMethod={selectedPaymentMethod}
        setSelectedPaymentMethod={setSelectedPaymentMethod}
        confirmPayment={confirmPayment}
        splits={splits}
        setSplits={setSplits}
        totalDue={hasSelection ? selectedItemsTotal : totalDue}
        selectionQuantities={selectionQuantities}
        selectedCartItemIds={selectedCartItemIds}
        activeSplitMethod={activeSplitMethod}
        setActiveSplitMethod={setActiveSplitMethod}
        confirmPaymentWithSplits={confirmPaymentWithSplits}
        staffId={currentUser?.staff_id ?? currentUser?.id ?? null}
        navigate={navigate}
      />

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-zinc-900 dark:border-zinc-700">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
                  {t("Cancel Order")}
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {(() => {
                    const orderType = (order?.order_type || order?.__cardType || "table").toLowerCase();
                    if (orderType === "packet") return t("Packet Order");
                    if (orderType === "phone") return t("Phone Order");
                    if (orderType === "takeaway") return t("Takeaway Order");
                    const tableNumber = order?.table_number || order?.tableNumber || "";
                    return `${tableLabelText} ${tableNumber || order?.id || ""}`.trim();
                  })()}
                </p>
                <p className="text-sm text-rose-500 mt-1">
                  #{order?.id || "-"} • {order?.customer_name || t("Guest")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeCancelModal}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-300"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-rose-500 mb-3 dark:text-slate-300">
              {t("The cancellation reason will be recorded for auditing.")}
            </p>

            {selectedCartItems.length > 0 && (
              <div className="mb-3 space-y-2 rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-xs text-amber-700">
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-500">
                  {t("Selected items")}
                </p>
                <ul className="space-y-1 text-[12px]">
                  {selectedCartItems.map((item) => {
                    const itemQty = Math.max(1, Number(item.quantity) || 1);
                    const key = String(item.cancel_key || item.unique_id || item.id);
                    const requested = Number(selectionQuantities[key]) || 1;
                    const cancelQty = Math.min(Math.max(1, requested), itemQty);
                    const perUnit = computeItemLineTotal(item) / itemQty;
                    const totalPrice = perUnit * cancelQty;
                    return (
                      <li
                        key={item.unique_id || `${item.id}-${item.name}`}
                        className="flex items-center justify-between font-semibold text-amber-700"
                      >
                        <span className="truncate flex-1">{item.name}</span>
                        {itemQty > 1 && (
                          <select
                            className="ml-2 rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs font-bold text-amber-700"
                            value={selectionQuantities[key] || 1}
                            onChange={(e) => {
                              const next = Number(e.target.value) || 1;
                              setSelectionQuantities((prev) => ({ ...prev, [key]: next }));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("Qty")}
                          >
                            {Array.from({ length: itemQty }, (_, idx) => idx + 1).map((qty) => (
                              <option key={qty} value={qty}>
                                {t("Qty")} {qty}
                              </option>
                            ))}
                          </select>
                        )}
                        <span className="text-amber-600">
                          ×{cancelQty} — {formatCurrency(totalPrice)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-amber-500">
                  {t("Only the highlighted items will be removed from the order.")}
                </p>
              </div>
            )}

            {hasPaidItems ? (
              <div className="space-y-3 rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 mb-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-rose-500">
                  {t("Refund Method")}
                  <select
                    className="mt-1 w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-600 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    value={refundMethodId}
                    onChange={(event) => setRefundMethodId(event.target.value)}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-rose-500">
                  {t("Refund amount")}: {formatCurrency(refundAmount)}
                </p>
              </div>
            ) : (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-300">
                {t("No paid items detected. This will simply cancel the order.")}
              </p>
            )}

            <textarea
              rows={4}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder={t("Why is the order being cancelled?")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeCancelModal}
                className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-zinc-700 dark:text-slate-200"
              >
                {t("Back")}
              </button>
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={cancelLoading || !cancelReason.trim()}
                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                  cancelLoading || !cancelReason.trim()
                    ? "cursor-not-allowed bg-rose-200 dark:bg-rose-400/70"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {cancelLoading ? t("Cancelling...") : t("Confirm Cancellation")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReservationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-zinc-900 dark:border-zinc-700">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">
                  {t("Make Reservation")}
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("Reservation Details")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowReservationModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:text-slate-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t("Date")}
                </label>
                <input
                  type="date"
                  value={reservationDate}
                  onChange={(e) => setReservationDate(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t("Time")}
                </label>
                <input
                  type="time"
                  value={reservationTime}
                  onChange={(e) => setReservationTime(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t("Number of Clients")}
                </label>
                <input
                  type="number"
                  placeholder="e.g., 2"
                  value={reservationClients}
                  onChange={(e) => setReservationClients(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {t("Notes")}
                </label>
                <textarea
                  rows={4}
                  placeholder={t("Special requests or notes...")}
                  value={reservationNotes}
                  onChange={(e) => setReservationNotes(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none dark:bg-zinc-800 dark:border-zinc-700 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              {existingReservation?.reservation_date && (
                <button
                  type="button"
                  onClick={handleDeleteReservation}
                  disabled={reservationLoading}
                  className={`mr-auto rounded-2xl border px-5 py-2 text-sm font-semibold transition ${
                    reservationLoading
                      ? "cursor-not-allowed border-rose-200 bg-rose-100 text-rose-400 dark:border-rose-900 dark:bg-rose-900/30 dark:text-rose-300/60"
                      : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-200"
                  }`}
                >
                  {t("Delete Reservation")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowReservationModal(false)}
                className="rounded-2xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition dark:border-zinc-700 dark:text-slate-200"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveReservation}
                disabled={
                  !reservationDate.trim() ||
                  !reservationTime.trim() ||
                  !reservationClients.trim() ||
                  reservationLoading
                }
                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                  !reservationDate.trim() ||
                  !reservationTime.trim() ||
                  !reservationClients.trim() ||
                  reservationLoading
                    ? "cursor-not-allowed bg-blue-300 dark:bg-blue-400/70"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {reservationLoading
                  ? t("Saving...")
                  : existingReservation
                  ? t("Update Reservation")
                  : t("Confirm Reservation")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {t("Add Order To Debt")}
              </h2>
              <button className="text-slate-500 hover:text-slate-800" onClick={() => setShowDebtModal(false)}>
                ✕
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {t("Confirm the customer details before adding this balance to their debt account.")}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Search Existing Customer")}
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
                  value={debtSearch}
                  onChange={(e) => handleDebtSearch(e.target.value)}
                  placeholder={t("Search by name or phone")}
                  disabled={isDebtSaving}
                />
              </label>
              {debtSearchLoading && (
                <p className="mt-2 text-xs text-slate-400">{t("Searching customers...")}</p>
              )}
              {debtSearchResults.length > 0 && (
                <div className="mt-2 space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-2 dark:bg-zinc-800/40 dark:border-zinc-700">
                  {debtSearchResults.map((cust) => (
                    <button
                      key={cust.id}
                      className="w-full rounded-xl bg-white px-3 py-2 text-left text-sm shadow-sm transition hover:bg-indigo-50 dark:bg-zinc-900 dark:text-slate-100"
                      onClick={() => handleSelectDebtCustomer(cust)}
                    >
                      <p className="font-semibold text-slate-800 dark:text-white">{cust.name || t("Guest")}</p>
                      <p className="text-xs text-slate-500">{cust.phone || t("No phone")}</p>
                      {cust.address && <p className="text-xs text-slate-400 truncate">{cust.address}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Customer Name")}
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
                  value={debtForm.name}
                  onChange={(e) => setDebtForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isDebtSaving || debtLookupLoading}
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("Customer Phone")}
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-800 dark:border-zinc-700"
                  value={debtForm.phone}
                  onChange={(e) => setDebtForm((prev) => ({ ...prev, phone: e.target.value }))}
                  disabled={isDebtSaving || debtLookupLoading}
                />
              </label>

              {debtError && (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-200">
                  {debtError}
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 disabled:opacity-60"
                onClick={handleAddToDebt}
                disabled={isDebtSaving || debtLookupLoading}
              >
                {isDebtSaving ? t("Saving...") : t("Confirm Debt")}
              </button>
              <button
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-zinc-700 dark:text-slate-200"
                onClick={() => {
                  setShowDebtModal(false);
                  setDebtError("");
                }}
                disabled={isDebtSaving}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ExtrasModal
        showExtrasModal={showExtrasModal}
        setShowExtrasModal={setShowExtrasModal}
        selectedProduct={selectedProduct}
        setSelectedProduct={setSelectedProduct}
        selectedExtras={selectedExtras}
        setSelectedExtras={setSelectedExtras}
        extrasGroups={extrasGroups}
        onConfirmAddToCart={handleExtrasModalConfirm}
        presetNotes={presetNotes}
        note={note}
        setNote={setNote}
        fullTotal={fullTotal}
        t={t}
      />

      <DiscountModal
        show={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        discountType={discountType}
        setDiscountType={setDiscountType}
        discountValue={discountValue}
        setDiscountValue={setDiscountValue}
        t={t}
      />

      <MoveTableModal
        open={showMoveTableModal}
        onClose={() => setShowMoveTableModal(false)}
        currentTable={tableId}
        t={t}
        onConfirm={async (newTable) => {
          if (!order?.id) return;
          try {
            await txApiRequest(`/orders/${order.id}/move-table${identifier}`, {
              method: "PATCH",
              body: JSON.stringify({ new_table_number: newTable }),
            });
            setShowMoveTableModal(false);
            navigate(`/transaction/${newTable}`);
          } catch (err) {
            console.error("❌ Move table failed:", err);
            setShowMoveTableModal(false);
            alert(err.message || "Failed to move table");
          }
        }}
      />

      <MergeTableModal
        open={showMergeTableModal}
        onClose={() => setShowMergeTableModal(false)}
        currentTable={tableId}
        t={t}
        onConfirm={async (destTable) => {
          if (!order?.id) return;
          try {
            await txApiRequest(`/orders/${order.id}/merge-table${identifier}`, {
              method: "PATCH",
              body: JSON.stringify({
                target_table_number: Number(destTable.tableNum),
                target_order_id: destTable.orderId ?? null,
                source_table_number: Number(tableId) || null,
              }),
            });

            const handleMerged = (payload) => {
              if (payload?.order?.table_number === Number(destTable.tableNum)) {
                txSocketOff("order_merged", handleMerged);
                setShowMergeTableModal(false);
                navigate(`/transaction/${destTable.tableNum}`, {
                  replace: true,
                  state: { order: payload.order },
                });
              }
            };

            txSocketOn("order_merged", handleMerged);

            setTimeout(() => {
              txSocketOff("order_merged", handleMerged);
              setShowMergeTableModal(false);
              navigate(`/transaction/${destTable.tableNum}`, { replace: true });
            }, 1500);
          } catch (err) {
            console.error("❌ Merge table failed:", err);
            showToast(err.message || t("Failed to merge table"));
            setShowMergeTableModal(false);
          }
        }}
      />
    </>
  );
};

export default React.memo(Modals);
