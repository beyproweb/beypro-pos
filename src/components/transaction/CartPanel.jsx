import React from "react";
import {
  ArrowLeftRight,
  GitMerge,
  HandCoins,
  Edit2,
  Trash2,
  CircleX,
  BadgePercent,
  Wallet,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";

const CartPanel = ({ cartData, totals, actions, uiState, setUiState, variant }) => {
  const {
    t,
    containerClasses,
    headerPadding,
    footerPadding,
    orderId,
    tableLabelText,
    tableId,
    invoiceNumber,
    existingReservation,
    unpaidGroups,
    paidGroups,
    showPaidCartItems,
    cartItemsLength,
    cartScrollRef,
  } = cartData;

  const {
    isDesktop,
    hasSelection,
    selectedCount,
    isPhoneOrder,
    hasConfirmedCartUnpaid,
    hasSuborderUnpaid,
    allCartItemsPaid,
    normalizedStatus,
    isFloatingCartOpen,
  } = uiState;

  const {
    subtotalLabel,
    discountLabel,
    discountValueLabel,
    totalLabel,
    selectedTotalLabel,
    hasDiscount,
    showPayLaterInClearSlot,
    payLaterLabel,
    primaryActionLabel,
    showPayLaterInFooter,
    footerPayLaterLabel,
    footerCancelDisabled,
    footerCanShowCancel,
    footerPrimaryActionLabel,
  } = totals;

  const {
    setShowMoveTableModal,
    setShowMergeTableModal,
    handleOpenDebtModal,
    debtDisabled,
    isDebtSaving,
    handleCartPrint,
    toggleCartItemSelection,
    updateSelectionQuantity,
    removeSelectionQuantity,
    toggleCartItemExpansion,
    setShowPaidCartItems,
    decrementCartItem,
    incrementCartItem,
    removeItem,
    openReservationModal,
    openCancelModal,
    setShowDiscountModal,
    handleOpenCashRegister,
    clearCartFromClearButton,
    navigate,
    setIsFloatingCartOpen,
    handleMultifunction,
    handlePayClick,
    hasUnpaidConfirmed,
  } = actions;

  const shouldShowPayButton = hasConfirmedCartUnpaid || hasSuborderUnpaid;

  return (
    <aside className={containerClasses}>
      <header className={`flex-none items-start justify-between bg-transparent ${headerPadding}`}>
        <div className="flex min-w-0 flex-1 flex-col space-y-0.5">
          <div className="flex w-full flex-wrap items-center gap-2">
            <h2 className="hidden text-lg font-semibold text-slate-800 lg:block dark:text-slate-100">{t("Cart")}</h2>
            <div className="ml-auto flex items-center gap-1">
              <div className="flex flex-wrap items-center gap-1 rounded-full bg-white/80 px-1.5 py-1 shadow-sm ring-1 ring-white/80 dark:bg-slate-900/60 dark:ring-slate-700/70">
                {!orderId && (
                  <button
                    type="button"
                    onClick={() => setShowMoveTableModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900/60 dark:text-emerald-200 dark:hover:bg-emerald-950/25"
                    title={t("Move Table")}
                    aria-label={t("Move Table")}
                  >
                    <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t("Move")}</span>
                  </button>
                )}
                {!orderId && (
                  <button
                    type="button"
                    onClick={() => setShowMergeTableModal(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-50 dark:border-amber-500/30 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-950/25"
                    title={t("Merge Table")}
                    aria-label={t("Merge Table")}
                  >
                    <GitMerge className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{t("Merge")}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (debtDisabled) return;
                    handleOpenDebtModal();
                  }}
                  disabled={debtDisabled}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-[12px] font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200 dark:hover:bg-amber-950/30"
                  title={t("Add to Debt")}
                  aria-label={t("Add to Debt")}
                >
                  <HandCoins className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {isDebtSaving ? t("Saving...") : t("Debt")}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <p className="text-[0.94rem] text-slate-500 dark:text-slate-300">
            {orderId ? t("Phone Order") : `${tableLabelText} ${tableId}`}
          </p>
          {invoiceNumber && (
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                {t("Invoice")} #{invoiceNumber}
              </p>
              <button
                type="button"
                onClick={handleCartPrint}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-sm text-slate-700 shadow hover:bg-slate-200 transition dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                title={t("Print Receipt")}
                aria-label={t("Print Receipt")}
              >
                🖨️
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {hasSelection && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/35 dark:text-indigo-200 dark:ring-1 dark:ring-indigo-500/20">
              {selectedCount} {t("Selected")}
            </span>
          )}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setUiState.setIsFloatingCartOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200"
              aria-label={t("Close")}
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {existingReservation && existingReservation.reservation_date && (
        <div className="mx-3 mb-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
                  {t("Reserved")}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                  {existingReservation.reservation_date || "—"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-700 dark:text-slate-200">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    {t("Time")}
                  </div>
                  <div className="truncate font-bold">
                    {existingReservation.reservation_time || "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    {t("Guests")}
                  </div>
                  <div className="truncate font-bold">
                    {existingReservation.reservation_clients || 0}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    {t("Date")}
                  </div>
                  <div className="truncate font-bold">
                    {existingReservation.reservation_date || "—"}
                  </div>
                </div>
              </div>
              {existingReservation.reservation_notes && (
                <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-300">
                    {t("Notes")}
                  </div>
                  <div className="line-clamp-2 break-words">
                    {existingReservation.reservation_notes}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => openReservationModal()}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors flex-shrink-0 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              title={t("Edit Reservation")}
              aria-label={t("Edit Reservation")}
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div ref={cartScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="min-h-full px-3 pb-2 grid grid-rows-[auto_1fr] gap-1.5 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div>
            {cartItemsLength === 0 ? (
              <div className="h-full rounded-2xl border border-dashed border-slate-200 bg-transparent py-8 text-center text-xs font-medium text-slate-500 grid place-items-center dark:border-slate-700 dark:text-slate-400">
                <div>
                  <div className="mx-auto mb-2 h-12 w-12 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 text-2xl leading-[48px] dark:from-slate-800 dark:to-slate-700">
                    🛒
                  </div>
                  {t("Cart is empty.")}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {unpaidGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs font-medium text-slate-400">
                    {t("No unpaid items")}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {unpaidGroups.map((item) => (
                      <li
                        data-cart-item="true"
                        key={item.itemKey}
                        className={`relative flex flex-col gap-0.5 overflow-hidden rounded-lg border border-slate-200 p-1.5 pl-2.5 text-[13px] shadow-xs transition border-l-[3px] ${item.cardGradient}`}
                        style={{ borderLeftColor: item.borderLeftColor }}
                        onClick={item.onCardClick}
                      >
                        <div className="flex items-center justify-between gap-0.5">
                          <div className="flex items-center gap-1.5 flex-1">
                            <div className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={item.isSelected}
                                disabled={item.isPaid}
                                onChange={item.onSelectToggle}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {item.isSelected && item.isEditable && item.availableQuantities.length > 1 && (
                                <select
                                  className="h-7 rounded-md border border-slate-300 bg-white px-1 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                  value={item.selectedQuantityValue}
                                  onChange={item.onQuantityChange}
                                  onClick={(e) => e.stopPropagation()}
                                  title={t("Select quantity to pay")}
                                >
                                  {item.availableQuantities.map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span
                                className="truncate font-semibold text-slate-800 block text-[12px]"
                                onClick={item.onNameClick}
                              >
                                {item.name}
                                <span className="ml-1.5 text-[10px] font-semibold text-slate-600 whitespace-nowrap">
                                  {item.basePriceLabel} ×{item.quantity}
                                </span>
                              </span>
                              {item.hasProductDiscountMeta && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                                  <span className={item.discountBadgeClass}>
                                    {item.discountLabel}
                                  </span>
                                  {item.isDiscountApplied && item.originalUnitPriceLabel && (
                                    <span className="whitespace-nowrap">
                                      <span className="line-through text-slate-400">
                                        {item.originalUnitPriceLabel}
                                      </span>{" "}
                                      <span className="font-semibold text-fuchsia-700">
                                        {item.basePriceLabel}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {item.paidBadge && (
                              <span
                                className="inline-flex items-center rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-white shadow-sm"
                                title={item.paidBadge}
                              >
                                ✓
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={item.onToggleExpand}
                              className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-500 hover:border-slate-300 transition-all"
                              title={item.isExpanded ? t("Hide details") : t("Show details")}
                            >
                              {item.isExpanded ? "▲" : "▼"}
                            </button>
                            <span className="font-semibold text-indigo-600 whitespace-nowrap text-[12px]">
                              {item.baseTotalLabel}
                            </span>
                          </div>
                        </div>

                        {!item.isExpanded && item.hasExtrasTotal && (
                          <div className="flex flex-col gap-0.5 pl-6 pr-1 text-[11px] text-slate-600">
                            <div className="flex items-center justify-between">
                              <span>{t("Extras total")}</span>
                              <span className="font-semibold text-slate-700">{item.extrasTotalLabel}</span>
                            </div>
                            <div className="flex items-center justify-between text-[12px] font-semibold text-indigo-700">
                              <span>{t("Total w/ extras")}</span>
                              <span>{item.totalWithExtrasLabel}</span>
                            </div>
                          </div>
                        )}

                        {item.isExpanded && (
                          <div className="mt-0.5 rounded-lg bg-white/60 p-1.5 text-[11px] text-slate-600 space-y-1">
                            {item.extrasDetails?.length > 0 && (
                              <div className="space-y-0.5">
                                <ul className="space-y-0.5 text-xs text-slate-600">
                                  {item.extrasDetails.map((ex) => (
                                    <li key={ex.key} className="flex justify-between">
                                      <span>{ex.label}</span>
                                      <span className="font-semibold text-slate-700">{ex.totalLabel}</span>
                                    </li>
                                  ))}
                                </ul>
                                <div className="flex items-center justify-between pt-1 text-xs font-semibold text-slate-700">
                                  <span>{t("Extras total")}</span>
                                  <span>{item.extrasTotalLabel}</span>
                                </div>
                              </div>
                            )}

                            {item.showNote && (
                              <div className="rounded border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] text-yellow-800">
                                {item.note}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-200/50">
                              <div className="flex items-center gap-0.5">
                                <span className="text-[9px]">{t("Qty")}: </span>
                                <button
                                  onClick={item.onDecrement}
                                  className="h-4 w-4 flex items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold text-[10px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  disabled={!item.isEditable}
                                >
                                  −
                                </button>
                                <span className="min-w-[16px] text-center text-[10px]">{item.quantity}</span>
                                <button
                                  onClick={item.onIncrement}
                                  className="h-4 w-4 flex items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-bold text-[10px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  disabled={!item.isEditable}
                                >
                                  +
                                </button>
                              </div>

                              {item.isEditable && (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={item.onEdit}
                                    className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                                    title={t("Edit item")}
                                  >
                                    {t("Edit")}
                                  </button>
                                  <button
                                    onClick={item.onRemove}
                                    className="rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 hover:bg-red-100 transition-colors"
                                    title={t("Remove item")}
                                  >
                                    {t("Delete")}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {paidGroups.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white/70">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700"
                      onClick={() => setShowPaidCartItems((prev) => !prev)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          {t("Paid")}
                        </span>
                        <span className="text-slate-500">
                          {paidGroups.length} {t("items")}
                        </span>
                      </span>
                      <span className="text-slate-400">{showPaidCartItems ? "▲" : "▼"}</span>
                    </button>
                    {showPaidCartItems && (
                      <ul className="flex flex-col gap-1.5 px-2 pb-2">
                    {paidGroups.map((item) => (
                      <li
                        data-cart-item="true"
                        key={item.itemKey}
                        className={`relative flex flex-col gap-1 overflow-hidden rounded-lg border border-slate-200 p-2 text-[13px] shadow-sm transition ${item.cardGradient}`}
                        onClick={item.onToggleExpand}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={item.isSelected}
                              onChange={item.onSelectToggle}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {item.isSelected && item.availableQuantities.length > 1 && (
                              <select
                                className="h-7 rounded-md border border-slate-300 bg-white px-1 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                value={item.selectedQuantityValue}
                                onChange={item.onQuantityChange}
                                onClick={(e) => e.stopPropagation()}
                                title={t("Select quantity to refund")}
                              >
                                {item.availableQuantities.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="truncate font-semibold text-slate-800 block">
                              {item.name}
                              <span className="ml-2 text-[11px] font-medium text-slate-600">
                                {item.basePriceLabel} ×{item.quantity}
                              </span>
                            </span>
                            {item.hasProductDiscountMeta && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600">
                                <span className={item.discountBadgeClass}>{item.discountLabel}</span>
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            {t("paid")}
                          </span>
                        </div>
                            <div className="mt-1 flex flex-col gap-1 text-xs text-slate-600">
                              {item.paidMethod && (
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">{t("Paid via")}: </span>
                                  <span className="font-semibold text-indigo-700">{item.paidMethod}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-[12px] text-slate-500">
                                <span>{t("Amount paid")}</span>
                                <span className="font-semibold text-slate-900">{item.totalPaidLabel}</span>
                              </div>
                              {item.hasExtrasTotal && (
                                <div className="flex items-center justify-between text-[12px] text-slate-500">
                                  <span>{t("Extras paid")}</span>
                                  <span className="font-semibold text-slate-800">{item.extrasTotalLabel}</span>
                                </div>
                              )}
                            </div>
                            {item.isExpanded && (
                              <div className="mt-1 rounded-md bg-white/70 px-2 py-1 text-[11px] text-slate-700">
                                {item.showNote && (
                                  <div className="break-words">
                                    <span className="font-semibold">{t("Note")}: </span>
                                    {item.note}
                                  </div>
                                )}
                                {item.extrasSummary && (
                                  <div className="mt-1">
                                    <span className="font-semibold">{t("Extras")}: </span>
                                    {item.extrasSummary}
                                  </div>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div aria-hidden="true" className="min-h-0" />
        </div>
      </div>

      {variant === "desktop" ? (
        <footer className={`flex-none sticky bottom-0 z-10 space-y-2 border-t border-slate-200 bg-slate-50 ${footerPadding} dark:border-slate-800 dark:bg-slate-950/70`}>
          <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>{t("Subtotal")}:</span>
            <span className="text-slate-900 dark:text-slate-100">{subtotalLabel}</span>
          </div>

          {hasDiscount && (
            <div className="flex justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-300">
              <span>{discountLabel}</span>
              <span>{discountValueLabel}</span>
            </div>
          )}

          <div
            className={`flex justify-between items-center rounded-2xl bg-white/90 px-3 py-3 text-lg font-bold shadow-[0_10px_20px_rgba(99,102,241,0.18)] mb-[3px] dark:bg-slate-900/60 dark:shadow-[0_10px_20px_rgba(0,0,0,0.45)]
            ${hasSelection ? "text-emerald-700 border border-emerald-200 bg-emerald-50/80 dark:text-emerald-200 dark:border-emerald-500/30 dark:bg-emerald-950/25" : "text-indigo-700 border border-indigo-100 dark:text-indigo-200 dark:border-indigo-500/25"}`}
          >
            <span>{hasSelection ? t("Selected Total") : t("Total")}: </span>
            <span>{hasSelection ? selectedTotalLabel : totalLabel}</span>
          </div>
        </footer>
      ) : (
        <div className="lg:hidden px-4 pb-3 pt-2">
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-inner dark:border-slate-700/70 dark:bg-slate-950/60">
            <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t("Subtotal")}:</span>
              <span className="text-slate-900 dark:text-slate-100">{subtotalLabel}</span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                <span>{discountLabel}</span>
                <span>{discountValueLabel}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm font-bold text-indigo-700 mt-2 dark:text-indigo-200">
              <span>{hasSelection ? t("Selected Total") : t("Total")}:</span>
              <span>{hasSelection ? selectedTotalLabel : totalLabel}</span>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!showPayLaterInClearSlot) {
                  clearCartFromClearButton();
                  return;
                }
                setIsFloatingCartOpen(false);
                navigate("/tableoverview?tab=tables");
              }}
              className="flex-1 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/80"
            >
              {showPayLaterInClearSlot ? payLaterLabel : t("Clear")}
            </button>
            <button
              type="button"
              onClick={shouldShowPayButton ? handlePayClick : handleMultifunction}
              disabled={isPhoneOrder && shouldShowPayButton}
              title={
                isPhoneOrder && shouldShowPayButton
                  ? t("Payments are handled through the Orders screen")
                  : undefined
              }
              className="flex-1 rounded-full bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(99,102,241,0.35)]"
            >
              {shouldShowPayButton ? t("Pay") : t(primaryActionLabel)}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                openReservationModal();
              }}
              disabled={cartItemsLength > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)}
              className={`flex-1 min-w-[120px] rounded-full px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_20px_rgba(99,102,241,0.3)] transition ${
                cartItemsLength > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)
                  ? "bg-indigo-300 cursor-not-allowed"
                  : "bg-gradient-to-br from-indigo-400 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-600"
              }`}
            >
              {t("Reservation")}
            </button>
            <button
              type="button"
              onClick={openCancelModal}
              disabled={cartItemsLength === 0 || normalizedStatus !== "confirmed" || hasUnpaidConfirmed}
              className="flex-1 min-w-[120px] rounded-full border border-rose-200 bg-rose-50/80 px-4 py-2 text-center text-xs font-semibold text-rose-600 shadow-[0_8px_18px_rgba(244,63,94,0.12)] transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/25 dark:text-rose-200 dark:hover:bg-rose-950/35"
            >
              {t("Cancel")}
            </button>
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              className="flex-1 min-w-[120px] rounded-full bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_22px_rgba(245,158,11,0.35)] hover:from-amber-500 hover:to-orange-600"
            >
              {t("Discount")}
            </button>
            <button
              type="button"
              onClick={handleOpenCashRegister}
              className="flex-1 min-w-[120px] rounded-full bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-[0_10px_22px_rgba(16,185,129,0.35)] hover:from-emerald-600 hover:to-teal-700"
            >
              {t("Register")}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default CartPanel;
