import React from "react";
import {
  CheckCircle2,
  HandCoins,
  CalendarClock,
  Trash2,
  CircleX,
  BadgePercent,
  Lock,
} from "lucide-react";

function FooterActionsBar({
  t,
  footerPrimaryActionLabel,
  handleMultifunction,
  handlePayClick,
  payDisabled,
  hasUnconfirmedCartItems,
  footerCanShowCancel,
  cartItemsLength,
  hasConfirmedCartUnpaid,
  allCartItemsPaid,
  openReservationModal,
  footerSecondaryLabel,
  footerClearDisabledAfterConfirmOrPaid,
  showPayLaterInFooter,
  showCloseLaterInFooter,
  setIsFloatingCartOpen,
  navigate,
  clearCartFromClearButton,
  footerCancelDisabled,
  openCancelModal,
  setShowDiscountModal,
  onLockClick,
}) {
  return (
    <div className="hidden lg:block fixed bottom-0 left-0 right-0 z-30 w-full border-t border-slate-200/70 bg-slate-50/90 px-3 py-2.5 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-950/75">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePayClick}
          disabled={payDisabled}
          title={
            payDisabled && hasUnconfirmedCartItems
              ? t("Confirm the order before paying")
              : undefined
          }
          className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 px-5 py-2.5 text-base font-semibold text-white shadow-md transition hover:from-emerald-500 hover:via-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          <HandCoins className="h-5 w-5" aria-hidden="true" />
          {t("Pay")}
        </button>

        <button
          type="button"
          onClick={handleMultifunction}
          className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-500 px-5 py-2.5 text-base font-semibold text-white shadow-md transition hover:from-indigo-500 hover:via-indigo-600 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
        >
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          {t(footerPrimaryActionLabel)}
        </button>

        <button
          type="button"
          onClick={() => {
            if (footerClearDisabledAfterConfirmOrPaid) return;
            if (showPayLaterInFooter || showCloseLaterInFooter) {
              setIsFloatingCartOpen(false);
              navigate("/tableoverview?tab=tables");
              return;
            }
            if (!showPayLaterInFooter) {
              clearCartFromClearButton();
              return;
            }
          }}
          disabled={footerClearDisabledAfterConfirmOrPaid}
          className={`flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold shadow-md active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed ${
            showCloseLaterInFooter
              ? "bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 text-white hover:from-sky-600 hover:via-indigo-600 hover:to-violet-600"
              : "border border-slate-300/60 bg-white/80 text-slate-800 backdrop-blur hover:bg-white dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-100 dark:hover:bg-slate-900/70"
          }`}
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          {footerClearDisabledAfterConfirmOrPaid ? t("Clear") : footerSecondaryLabel}
        </button>

        {footerCanShowCancel && (
          <button
            type="button"
            onClick={() => openReservationModal()}
            disabled={cartItemsLength > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)}
            className={`flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold text-white shadow-md transition ${
              cartItemsLength > 0 && (hasConfirmedCartUnpaid || allCartItemsPaid)
                ? "bg-indigo-300 cursor-not-allowed"
                : "bg-gradient-to-br from-indigo-400 via-indigo-500 to-sky-500 hover:from-indigo-500 hover:to-sky-600 active:scale-[0.98]"
            }`}
          >
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
            {t("Reservation")}
          </button>
        )}

        {footerCanShowCancel && (
          <button
            type="button"
            onClick={openCancelModal}
            disabled={footerCancelDisabled}
            className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/60 bg-rose-50/80 px-5 py-2.5 text-base font-semibold text-rose-600 shadow-md transition hover:bg-rose-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-200 dark:hover:bg-rose-950/30"
          >
            <CircleX className="h-5 w-5" aria-hidden="true" />
            {t("Cancel")}
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowDiscountModal(true)}
          className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-5 py-2.5 text-base font-semibold text-white shadow-md hover:from-amber-500 hover:to-orange-600 active:scale-[0.98]"
        >
          <BadgePercent className="h-5 w-5" aria-hidden="true" />
          {t("Discount")}
        </button>

        {onLockClick && (
          <button
            type="button"
            onClick={onLockClick}
            aria-label={t("Lock", { defaultValue: "Lock" })}
            title={t("Lock", { defaultValue: "Lock" })}
            className="ml-auto inline-flex min-w-[180px] items-center justify-center gap-3 rounded-2xl border border-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-5 py-2.5 text-base font-semibold text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(15,23,42,0.22)] active:scale-[0.98] dark:border-white/10"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </span>
            {t("Lock", { defaultValue: "Lock" })}
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(FooterActionsBar);
