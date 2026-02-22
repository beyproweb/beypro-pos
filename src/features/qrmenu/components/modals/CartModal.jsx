import React, { useEffect, useMemo, useState } from "react";
import { useCurrency } from "../../../../context/CurrencyContext";
import { usePaymentMethods } from "../../../../hooks/usePaymentMethods";

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return [];
};

const CartModal = React.memo(function CartModal({
  cart,
  setCart,
  onSubmitOrder,
  orderType,
  paymentMethod,
  setPaymentMethod,
  submitting,
  onOrderAnother,
  t,
  hasActiveOrder,
  orderScreenStatus,
  onShowStatus,
  isOrderStatusOpen,
  onOpenCart,
  layout = "drawer",
  storage,
}) {
  const isPanel = layout === "panel";
  const [show, setShow] = useState(isPanel);
  const { formatCurrency } = useCurrency();
  const paymentMethods = usePaymentMethods();

  const cartArray = toArray(cart);
  const cartLength = cartArray.length;
  const prevItems = cartArray.filter((i) => i.locked);
  const newItems = cartArray.filter((i) => !i.locked);
  const newItemsCount = newItems.length;
  const hasNewItems = newItemsCount > 0;

  const lineTotal = (item) => {
    const base = parseFloat(item.price) || 0;
    const extrasTotal = (item.extras || []).reduce(
      (sum, ex) => sum + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
      0
    );
    return (base + extrasTotal) * (item.quantity || 1);
  };

  const total = newItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const statusLabel = useMemo(() => {
    if (!hasActiveOrder || !orderScreenStatus) return null;
    const s = (orderScreenStatus || "").toLowerCase();
    if (["new", "pending", "confirmed", "preparing"].includes(s)) return t("Preparing");
    if (["ready"].includes(s)) return t("Ready for Pickup");
    if (["delivered", "served"].includes(s)) return t("Delivered");
    return null;
  }, [hasActiveOrder, orderScreenStatus, t]);

  useEffect(() => {
    if (isPanel) return;
    const handler = () => setShow(false);
    window.addEventListener("qr:cart-close", handler);
    return () => window.removeEventListener("qr:cart-close", handler);
  }, [isPanel]);

  useEffect(() => {
    if (isPanel) return;
    const auto = storage.getItem("qr_cart_auto_open") !== "0";
    if (auto) setShow(cartLength > 0);
  }, [cartLength, isPanel, storage]);

  useEffect(() => {
    if (isPanel) return;
    if (isOrderStatusOpen) setShow(false);
  }, [isOrderStatusOpen, isPanel]);

  function removeItem(idx, isNew) {
    if (!isNew) return;
    setCart((prev) => {
      let n = -1;
      return toArray(prev).filter((it) => (it.locked ? true : ++n !== idx));
    });
  }

  const cartPanel = (
    <div
      className={`${isPanel ? "h-full rounded-2xl border border-neutral-200 bg-white/95 shadow-sm" : "w-[92vw] max-w-md max-h-[88vh] overflow-hidden bg-white/95 rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)]"} p-4 sm:p-6 flex flex-col`}
    >
      <div className="flex justify-between items-center mb-4 border-b border-neutral-200 pb-2">
        <span className="text-base sm:text-lg font-serif font-semibold text-neutral-900 tracking-tight">
          {t("Your Order")}
        </span>
        {!isPanel && (
          <button
            className="text-2xl text-neutral-400 hover:text-red-600 transition"
            onClick={() => setShow(false)}
            aria-label={t("Close")}
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {cartLength === 0 ? (
          <div className="text-neutral-400 text-center py-8 italic">{t("Cart is empty.")}</div>
        ) : (
          <div className="space-y-5">
            {prevItems.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">
                  {t("Previously ordered")}
                </div>
                <ul className="space-y-3">
                  {prevItems.map((item, i) => (
                    <li
                      key={`prev-${i}`}
                      className="flex justify-between gap-3 border-b border-neutral-200 pb-2 opacity-70"
                    >
                      <div className="flex-1">
                        <span className="font-medium text-neutral-900 block">
                          {item.name}{" "}
                          <span className="text-xs text-neutral-500">×{item.quantity}</span>
                        </span>
                        {item.extras?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.extras.map((ex, j) => {
                              const perItemQty = ex.quantity || 1;
                              const itemQty = item.quantity || 1;
                              const totalQty = perItemQty * itemQty;
                              const unit =
                                parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                              const line = unit * totalQty;
                              return (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                >
                                  {ex.name} ×{totalQty} {formatCurrency(line)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {item.note && (
                          <div className="text-xs text-amber-700 mt-1 italic">
                            📝 {t("Note")}: {item.note}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium text-neutral-700">
                          {formatCurrency(lineTotal(item))}
                        </div>
                        <div className="text-[10px] text-neutral-400 mt-1">{t("Locked")}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-2">
                {t("New items")}
              </div>
              {newItems.length === 0 ? (
                <div className="text-neutral-400 text-sm italic">{t("No new items yet.")}</div>
              ) : (
                <ul className="space-y-3">
                  {newItems.map((item, i) => (
                    <li
                      key={`new-${i}`}
                      className="flex justify-between gap-3 border-b border-neutral-200 pb-2"
                    >
                      <div className="flex-1">
                        <span className="font-medium text-neutral-900 block">
                          {item.name}{" "}
                          <span className="text-xs text-neutral-500">×{item.quantity}</span>
                        </span>
                        {item.extras?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.extras.map((ex, j) => {
                              const perItemQty = ex.quantity || 1;
                              const itemQty = item.quantity || 1;
                              const totalQty = perItemQty * itemQty;
                              const unit =
                                parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                              const line = unit * totalQty;
                              return (
                                <span
                                  key={j}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-700"
                                >
                                  {ex.name} ×{totalQty} {formatCurrency(line)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {item.note && (
                          <div className="text-xs text-amber-700 mt-1 italic">
                            📝 {t("Note")}: {item.note}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium text-neutral-700">
                          {formatCurrency(lineTotal(item))}
                        </div>
                        <button
                          onClick={() => removeItem(i, true)}
                          className="text-xs text-red-400 hover:text-red-600 mt-1 transition"
                        >
                          {t("Remove")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {cartLength > 0 && (
        <div className="mt-5 border-t border-neutral-200 pt-4 space-y-3">
          <div className="flex justify-between items-center text-base">
            <span className="font-medium text-neutral-700">{t("Total")}:</span>
            <span className="text-lg font-semibold text-neutral-900">{formatCurrency(total)}</span>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-medium text-neutral-800">{t("Payment")}</label>
            <select
              className="rounded-lg border border-neutral-300 px-3 py-2 bg-white text-sm focus:ring-1 focus:ring-neutral-400"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {paymentMethods
                .filter((m) => m.enabled !== false)
                .map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label}
                  </option>
                ))}
            </select>
          </div>

          <button
            onClick={onSubmitOrder}
            disabled={submitting || newItems.length === 0}
            className="w-full py-3 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 transition-all"
          >
            {submitting ? t("Please wait...") : t("Submit Order")}
          </button>

          {!isPanel && (
            <button
              onClick={() => setShow(false)}
              className="w-full py-3 rounded-full border border-neutral-300 text-neutral-700 font-medium hover:bg-neutral-100 transition-all"
            >
              {t("Order Another")}
            </button>
          )}

          <button
            onClick={() => {
              const lockedOnly = cartArray.filter((i) => i.locked);
              setCart(lockedOnly);
              storage.setItem("qr_cart", JSON.stringify(lockedOnly));
            }}
            className="w-full mt-1 py-2 rounded-md text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition"
          >
            {t("Clear New Items")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {!isPanel && !show && (cartLength > 0 || hasActiveOrder) && (
        <button
          onClick={() => {
            if (hasNewItems) {
              onOpenCart?.();
              storage.setItem("qr_cart_auto_open", "1");
              setShow(true);
            } else if (hasActiveOrder && onShowStatus) {
              onShowStatus();
            } else {
              onOpenCart?.();
              setShow(true);
            }
          }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-full min-w-[260px] font-medium tracking-wide shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all z-50 ${
            hasActiveOrder
              ? "bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-600 text-white animate-pulse"
              : "bg-sky-700 dark:bg-sky-600 text-white hover:bg-sky-800 dark:hover:bg-sky-500 hover:scale-105"
          }`}
        >
          <span className="text-xl">🛒</span>
          <div className="flex flex-col items-start">
            <span className="text-sm">{hasNewItems ? t("View Cart") : t("Your Order")}</span>
            {hasActiveOrder && statusLabel && (
              <span className="text-[11px] uppercase tracking-wide opacity-90">{statusLabel}</span>
            )}
          </div>
          {hasNewItems && (
            <span className="ml-3 inline-flex items-center justify-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
              {newItemsCount}
            </span>
          )}
        </button>
      )}

      {isPanel ? (
        <div className="h-full">{cartPanel}</div>
      ) : (
        show && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setShow(false);
            }}
          >
            {cartPanel}
          </div>
        )
      )}
    </>
  );
});

export default CartModal;
