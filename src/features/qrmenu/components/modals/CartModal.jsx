import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrency } from "../../../../context/CurrencyContext";
import { usePaymentMethods } from "../../../../hooks/usePaymentMethods";
import secureFetch from "../../../../utils/secureFetch";
import useCustomerAuth from "../../header-drawer/hooks/useCustomerAuth";
import { fetchCustomerOrders, splitOrdersByState } from "../../header-drawer/services/customerService";

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
  onEditItem,
  appendIdentifier,
  layout = "drawer",
  storage,
  voiceListening = false,
  hideFloatingButton = false,
}) {
  const isPanel = layout === "panel";
  const [show, setShow] = useState(isPanel);
  const { formatCurrency } = useCurrency();
  const paymentMethods = usePaymentMethods();
  const { customer, isLoggedIn } = useCustomerAuth(storage);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

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
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const [shakeCart, setShakeCart] = useState(false);
  const shakeTimeoutRef = useRef(null);
  const prevOrderTypeRef = useRef(orderType);
  const suppressStatusAutoCloseRef = useRef(false);
  const suppressStatusReleaseTimerRef = useRef(null);

  const statusLabel = useMemo(() => {
    if (!hasActiveOrder || !orderScreenStatus) return null;
    const s = (orderScreenStatus || "").toLowerCase();
    if (["new", "pending", "confirmed", "preparing"].includes(s)) return t("Preparing");
    if (["ready"].includes(s)) return t("Ready for Pickup");
    if (["delivered", "served"].includes(s)) return t("Delivered");
    return null;
  }, [hasActiveOrder, orderScreenStatus, t]);

  const paymentPromptText = t("Please select a payment method before continuing.");
  const normalizedOrderStatus = String(orderScreenStatus || "").toLowerCase();
  const canShowOrderNowButton =
    cartLength === 0 &&
    hasActiveOrder &&
    orderType === "table" &&
    ["reserved", "confirmed"].includes(normalizedOrderStatus);
  const speakPaymentPrompt = useCallback(
    (message) => {
      if (!voiceListening || !message || typeof window === "undefined") return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      try {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = window.navigator?.language || "en-US";
        synth.speak(utterance);
      } catch {}
    },
    [voiceListening]
  );
  const handlePaymentChange = useCallback(
    (value) => {
      setPaymentPrompt(false);
      setPaymentMethod(value);
    },
    [setPaymentMethod]
  );

  const fetcher = useCallback(
    async (path) => {
      const withIdentifier = typeof appendIdentifier === "function" ? appendIdentifier(path) : path;
      return secureFetch(withIdentifier);
    },
    [appendIdentifier]
  );

  const loadCustomerOrders = useCallback(async () => {
    if (!isLoggedIn || !customer) {
      setCustomerOrders([]);
      setOrdersError("");
      return;
    }

    setOrdersLoading(true);
    setOrdersError("");
    try {
      const next = await fetchCustomerOrders({ customer, fetcher, storage });
      setCustomerOrders(next);
    } catch (err) {
      setCustomerOrders([]);
      setOrdersError(err?.message || "Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  }, [customer, fetcher, isLoggedIn, storage]);

  const { active: activeOrders, past: pastOrders } = useMemo(
    () => splitOrdersByState(customerOrders),
    [customerOrders]
  );
  const visiblePastOrders = pastOrders.slice(0, 3);
  const hasTrackedOrders =
    hasActiveOrder || activeOrders.length > 0 || visiblePastOrders.length > 0 || ordersLoading;

  const handleCartSubmit = useCallback(() => {
    if (!paymentMethod) {
      setPaymentPrompt(true);
      setShakeCart(true);
      if (shakeTimeoutRef.current) {
        window.clearTimeout(shakeTimeoutRef.current);
      }
      shakeTimeoutRef.current = window.setTimeout(() => {
        setShakeCart(false);
      }, 420);
      speakPaymentPrompt(paymentPromptText);
      return;
    }

    onSubmitOrder();
  }, [paymentMethod, onSubmitOrder, paymentPromptText, speakPaymentPrompt]);

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
    if (!isOrderStatusOpen) {
      // Keep suppression briefly to ignore delayed status re-open races
      // after external events (e.g. reservation deletion updates).
      if (suppressStatusAutoCloseRef.current) {
        if (suppressStatusReleaseTimerRef.current) {
          window.clearTimeout(suppressStatusReleaseTimerRef.current);
        }
        suppressStatusReleaseTimerRef.current = window.setTimeout(() => {
          suppressStatusAutoCloseRef.current = false;
          suppressStatusReleaseTimerRef.current = null;
        }, 1600);
      }
      return;
    }
    // If cart was intentionally opened from status view, don't immediately
    // close it while status state is still propagating.
    if (suppressStatusAutoCloseRef.current) return;
    setShow(false);
  }, [isOrderStatusOpen, isPanel]);

  useEffect(() => {
    if (!paymentMethod) return;
    setPaymentPrompt(false);
  }, [paymentMethod]);

  useEffect(() => {
    if (!(isPanel || show)) return;
    loadCustomerOrders();
  }, [isPanel, loadCustomerOrders, show]);

  useEffect(() => {
    if (isPanel || typeof window === "undefined") return undefined;
    window.dispatchEvent(new CustomEvent("qr:cart-visibility", { detail: { open: show } }));
    return () => {
      window.dispatchEvent(new CustomEvent("qr:cart-visibility", { detail: { open: false } }));
    };
  }, [isPanel, show]);

  useEffect(() => {
    const prevOrderType = prevOrderTypeRef.current;
    if (orderType === "table" && prevOrderType !== "table" && paymentMethod) {
      setPaymentMethod("");
    }
    prevOrderTypeRef.current = orderType;
  }, [orderType, paymentMethod, setPaymentMethod]);

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        window.clearTimeout(shakeTimeoutRef.current);
        shakeTimeoutRef.current = null;
      }
      if (suppressStatusReleaseTimerRef.current) {
        window.clearTimeout(suppressStatusReleaseTimerRef.current);
        suppressStatusReleaseTimerRef.current = null;
      }
    };
  }, []);

  function removeItem(idx, isNew) {
    if (!isNew) return;
    setCart((prev) => {
      let n = -1;
      const next = toArray(prev).filter((it) => (it.locked ? true : ++n !== idx));
      if (!isPanel && next.length === 0) {
        setShow(false);
      }
      return next;
    });
  }

  function updateNewItemQuantity(idx, delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setCart((prev) => {
      let n = -1;
      return toArray(prev).map((item) => {
        if (item?.locked) return item;
        n += 1;
        if (n !== idx) return item;
        const nextQty = Math.max(1, (Number(item?.quantity) || 1) + delta);
        return { ...item, quantity: nextQty };
      });
    });
  }

  function updateNewItemExtraQuantity(itemIdx, extraIdx, delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    setCart((prev) => {
      let n = -1;
      return toArray(prev).map((item) => {
        if (item?.locked) return item;
        n += 1;
        if (n !== itemIdx) return item;
        const nextExtras = toArray(item?.extras)
          .map((extra, index) => {
            if (index !== extraIdx) return extra;
            const nextQty = Math.max(0, (Number(extra?.quantity) || 0) + delta);
            return { ...extra, quantity: nextQty };
          })
          .filter((extra) => (Number(extra?.quantity) || 0) > 0);
        return { ...item, extras: nextExtras };
      });
    });
  }

  const closeFromUi = useCallback(() => {
    suppressStatusAutoCloseRef.current = false;
    if (suppressStatusReleaseTimerRef.current) {
      window.clearTimeout(suppressStatusReleaseTimerRef.current);
      suppressStatusReleaseTimerRef.current = null;
    }
    setShow(false);
  }, []);

  const handleOpenStatus = useCallback(
    (selectedOrderId = null) => {
      suppressStatusAutoCloseRef.current = false;
      if (suppressStatusReleaseTimerRef.current) {
        window.clearTimeout(suppressStatusReleaseTimerRef.current);
        suppressStatusReleaseTimerRef.current = null;
      }
      if (!isPanel) {
        setShow(false);
      }
      onShowStatus?.(selectedOrderId);
    },
    [isPanel, onShowStatus]
  );

  const goToProductPage = useCallback(() => {
    suppressStatusAutoCloseRef.current = false;
    if (suppressStatusReleaseTimerRef.current) {
      window.clearTimeout(suppressStatusReleaseTimerRef.current);
      suppressStatusReleaseTimerRef.current = null;
    }
    storage?.setItem("qr_cart_auto_open", "0");
    onOpenCart?.();
    if (!isPanel) setShow(false);
  }, [isPanel, onOpenCart, storage]);

  const renderOrderCard = (order, options = {}) => {
    const createdAtLabel = order?.createdAt ? new Date(order.createdAt).toLocaleString() : null;
    const statusText = t(order?.status || "pending");
    const actionLabel = options.actionLabel || t("Order Status");
    const totalValue = Number(order?.total || 0);

    return (
      <div
        key={`${options.section || "order"}-${order?.id || createdAtLabel || statusText}`}
        className="rounded-xl border border-neutral-200 bg-white px-4 py-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900">
                #{order?.id || t("Current")}
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
                {statusText}
              </span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {createdAtLabel || t("Live order")} • {Number(order?.itemCount || 0)} {t("items")}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold text-neutral-900">
              {totalValue > 0 ? formatCurrency(totalValue) : "-"}
            </div>
            <button
              type="button"
              onClick={() => handleOpenStatus(order?.id || null)}
              className="mt-2 rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const cartPanel = (
    <div
      className={`${isPanel ? "h-full rounded-xl border border-neutral-200 bg-white/95 shadow-sm" : "w-[92vw] max-w-md max-h-[88vh] overflow-hidden rounded-2xl bg-white/95 shadow-[0_8px_40px_rgba(0,0,0,0.08)]"} p-4 sm:p-6 flex flex-col`}
      style={shakeCart ? { animation: "cartShake 420ms ease-in-out" } : undefined}
    >
      <div className="flex justify-between items-center mb-4 border-b border-neutral-200 pb-2">
        <span className="text-base font-serif font-semibold text-neutral-900 tracking-tight sm:text-lg">
          {t("Your Order")}
        </span>
        {!isPanel && (
          <button
            className="text-2xl text-neutral-400 hover:text-red-600 transition"
            onClick={closeFromUi}
            aria-label={t("Close")}
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {hasTrackedOrders || isLoggedIn ? (
          <div className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {t("Order Status")}
                </div>
                <div className="mt-1 text-sm text-neutral-600">
                  {t("Track pending orders and keep reordering from the same cart.")}
                </div>
              </div>
              {isLoggedIn ? (
                <button
                  type="button"
                  onClick={loadCustomerOrders}
                  className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  {t("Refresh")}
                </button>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {ordersLoading ? (
                <div className="text-sm text-neutral-500">{t("Loading orders...")}</div>
              ) : null}

              {ordersError ? (
                <div className="text-xs font-medium text-rose-600">{t(ordersError)}</div>
              ) : null}

              {activeOrders.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    {t("Active Orders")}
                  </div>
                  {activeOrders.map((order) => renderOrderCard(order, { section: "active" }))}
                </div>
              ) : null}

              {hasActiveOrder && activeOrders.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    {t("Current Order")}
                  </div>
                  {renderOrderCard(
                    {
                      id: null,
                      status: normalizedOrderStatus || "pending",
                      total,
                      createdAt: new Date().toISOString(),
                      itemCount: prevItems.length,
                    },
                    { section: "current" }
                  )}
                </div>
              ) : null}

              {visiblePastOrders.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                    {t("Recent Orders")}
                  </div>
                  {visiblePastOrders.map((order) =>
                    renderOrderCard(order, { section: "past", actionLabel: t("View Details") })
                  )}
                </div>
              ) : null}

              {!ordersLoading && !ordersError && !hasTrackedOrders && isLoggedIn ? (
                <div className="text-sm text-neutral-500">{t("No orders yet.")}</div>
              ) : null}

              {hasActiveOrder ? (
                <button
                  type="button"
                  onClick={() => handleOpenStatus()}
                  className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800"
                >
                  {t("Open Current Order Status")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {cartLength === 0 ? (
          <div className="py-8 text-center">
            <div className="text-neutral-400 italic">{t("Cart is empty.")}</div>
            {canShowOrderNowButton ? (
              <button
                type="button"
                onClick={goToProductPage}
                className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(5,150,105,0.3)] transition-all hover:from-emerald-700 hover:to-green-700 active:scale-[0.99]"
              >
                {t("Order now")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-5 pb-3">
            {prevItems.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 font-medium mb-2">
                  {t("Previously ordered")}
                </div>
                <ul className="space-y-3">
                  {prevItems.map((item, i) => (
                    <li
                      key={`prev-${i}`}
                      className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 px-4 py-4 opacity-80"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="block font-medium text-neutral-900">
                              {item.name}
                            </div>
                            <div className="mt-1 text-sm text-neutral-500">
                              {formatCurrency(parseFloat(item?.price) || 0)} × {item.quantity || 1}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-base font-semibold text-neutral-900">
                            {formatCurrency(lineTotal(item))}
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                            {t("Locked")}
                          </div>
                        </div>

                        {item.extras?.length > 0 && (
                          <div className="border-t border-neutral-200/80 pt-3">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                              {t("Extras")}
                            </div>
                            <div className="space-y-1.5">
                            {item.extras.map((ex, j) => {
                              const perItemQty = ex.quantity || 1;
                              const itemQty = item.quantity || 1;
                              const totalQty = perItemQty * itemQty;
                              const unit =
                                parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                              const line = unit * totalQty;
                              return (
                                <div
                                  key={j}
                                  className="flex items-center justify-between gap-3 text-sm text-neutral-500"
                                >
                                  <span className="min-w-0 flex-1 truncate opacity-80">
                                    • {ex.name} ×{totalQty}
                                  </span>
                                  <span className="shrink-0 text-right opacity-80">
                                    {formatCurrency(line)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        )}
                        {item.note && (
                          <div className="border-t border-neutral-200/80 pt-3 text-xs italic text-amber-700">
                            {t("Note")}: {item.note}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex min-h-0 flex-col">
              <div className="text-xs uppercase tracking-wide text-neutral-600 font-medium mb-2">
                {t("New items")}
              </div>
              {newItems.length === 0 ? (
                <div className="text-neutral-400 text-sm italic">{t("No new items yet.")}</div>
              ) : (
                <div className="pr-1" style={{ WebkitOverflowScrolling: "touch" }}>
                  <ul className="space-y-3">
                    {newItems.map((item, i) => (
                      <li
                        key={`new-${i}`}
                        className="rounded-xl border border-neutral-200 bg-white px-4 py-4"
                      >
                        <div className="w-full space-y-3">
                          <div>
                            <div className="grid grid-cols-[minmax(0,1fr)_88px_96px] items-center gap-3">
                              <span className="block min-w-0 truncate font-medium text-neutral-900">
                                {item.name}
                              </span>
                              <div className="inline-flex w-[88px] items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1">
                                <button
                                  type="button"
                                  onClick={() => updateNewItemQuantity(i, -1)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
                                  aria-label={`${t("Remove")} ${item.name}`}
                                >
                                  -
                                </button>
                                <span className="min-w-[20px] text-center text-sm font-semibold text-neutral-800">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateNewItemQuantity(i, 1)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100"
                                  aria-label={`${t("Add")} ${item.name}`}
                                >
                                  +
                                </button>
                              </div>
                              <div className="w-[96px] text-right text-base font-semibold text-neutral-900">
                                {formatCurrency(lineTotal(item))}
                              </div>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-3">
                              <div className="text-sm text-neutral-500">
                                {formatCurrency(parseFloat(item?.price) || 0)} × {item.quantity || 1}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => removeItem(i, true)}
                                  className="text-sm font-medium text-red-400 transition hover:text-red-600"
                                >
                                  {t("Remove")}
                                </button>
                              </div>
                            </div>
                          </div>

                          {item.extras?.length > 0 ? (
                            <div className="border-t border-neutral-200 pt-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
                                  {t("Extras")}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onEditItem?.(item)}
                                  className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100"
                                >
                                  {t("Edit")}
                                </button>
                              </div>
                              <div className="space-y-2">
                                {item.extras.map((ex, j) => {
                                  const perItemQty = ex.quantity || 1;
                                  const itemQty = item.quantity || 1;
                                  const totalQty = perItemQty * itemQty;
                                  const unit =
                                    parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
                                  const line = unit * totalQty;
                                  return (
                                  <div
                                    key={j}
                                    className="grid grid-cols-[minmax(0,1fr)_88px_96px] items-center gap-3 text-sm text-neutral-500"
                                  >
                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                      <div className="truncate opacity-80">• {ex.name}</div>
                                      <div className="shrink-0 text-[11px] text-neutral-400">
                                        1 × {formatCurrency(unit)}
                                      </div>
                                    </div>
                                    <div className="inline-flex w-[88px] items-center justify-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-1.5 py-1">
                                      <button
                                        type="button"
                                        onClick={() => updateNewItemExtraQuantity(i, j, -1)}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-white text-[10px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
                                        aria-label={`${t("Remove")} ${ex.name}`}
                                      >
                                        -
                                      </button>
                                      <span className="min-w-[14px] text-center font-semibold">
                                        {perItemQty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => updateNewItemExtraQuantity(i, j, 1)}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-white text-[10px] font-semibold text-neutral-700 transition hover:bg-neutral-100"
                                        aria-label={`${t("Add")} ${ex.name}`}
                                      >
                                        +
                                      </button>
                                    </div>
                                    <span className="w-[96px] text-right opacity-80">
                                      {formatCurrency(line)}
                                    </span>
                                  </div>
                                );
                              })}
                              </div>
                            </div>
                          ) : null}
                          {item.note && (
                            <div className="break-words whitespace-pre-wrap border-t border-neutral-200 pt-3 text-xs italic text-amber-700">
                              {t("Note")}: {item.note}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {cartLength > 0 && (
        <div className="mt-5 border-t border-neutral-200 pt-5 space-y-3">
          <div className="flex items-center justify-between py-1 text-base">
            <span className="font-medium text-neutral-700">{t("Total")}</span>
            <span className="text-xl font-semibold text-neutral-900">{formatCurrency(total)}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="font-medium text-neutral-800">{t("Payment")}</label>
            <select
              className={`rounded-lg border px-3 py-2 bg-white text-sm focus:ring-1 focus:ring-neutral-400 ${
                paymentPrompt && !paymentMethod ? "border-rose-500" : "border-neutral-300"
              }`}
              value={paymentMethod}
              onChange={(e) => handlePaymentChange(e.target.value)}
            >
              <option value="">{t("Select Payment Method")}</option>
              {paymentMethods
                .filter((m) => m.enabled !== false)
                .map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.icon ? `${method.icon} ` : ""}
                    {method.label}
                  </option>
                ))}
            </select>
            {paymentPrompt && !paymentMethod && (
              <p className="text-xs font-semibold text-rose-600">{paymentPromptText}</p>
            )}
          </div>

          <button
            onClick={handleCartSubmit}
            disabled={submitting || newItems.length === 0}
            className="w-full py-3 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 disabled:opacity-50 transition-all"
          >
            {submitting ? t("Please wait...") : t("Submit Order")}
          </button>

          {!isPanel && (
            <button
              onClick={goToProductPage}
              className="w-full py-3 rounded-full bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-semibold shadow-[0_8px_20px_rgba(37,99,235,0.3)] hover:from-sky-700 hover:to-indigo-700 transition-all active:scale-[0.99]"
            >
              ↺ {t("Order Another")}
            </button>
          )}

          <button
            onClick={() => {
              const lockedOnly = cartArray.filter((i) => i.locked);
              setCart(lockedOnly);
              storage.setItem("qr_cart", JSON.stringify(lockedOnly));
              if (!isPanel) {
                closeFromUi();
              }
            }}
            className="w-full mt-1 py-2 rounded-md text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition"
          >
            {t("Clear New Items")}
          </button>
        </div>
      )}
    </div>
  );

  const openFromTrigger = useCallback(() => {
    suppressStatusAutoCloseRef.current = true;
    if (suppressStatusReleaseTimerRef.current) {
      window.clearTimeout(suppressStatusReleaseTimerRef.current);
      suppressStatusReleaseTimerRef.current = null;
    }
    onOpenCart?.();
    storage.setItem("qr_cart_auto_open", "1");
    setShow(true);
  }, [onOpenCart, storage]);

  const openFromExternalEvent = useCallback(() => {
    suppressStatusAutoCloseRef.current = true;
    if (suppressStatusReleaseTimerRef.current) {
      window.clearTimeout(suppressStatusReleaseTimerRef.current);
      suppressStatusReleaseTimerRef.current = null;
    }
    onOpenCart?.();
    setShow(true);
  }, [onOpenCart]);

  return (
    <>
      {!isPanel && !hideFloatingButton && !show && (cartLength > 0 || hasActiveOrder) && (
        <button
          onClick={openFromTrigger}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 rounded-full min-w-[260px] font-medium tracking-wide shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all z-50 ${
            hasActiveOrder
              ? "bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-600 text-white animate-pulse"
              : "bg-sky-700 dark:bg-sky-600 text-white hover:bg-sky-800 dark:hover:bg-sky-500 hover:scale-105"
          }`}
        >
          <span className="text-xl">🛒</span>
          <div className="flex flex-col items-start">
            <span className="text-sm">{hasTrackedOrders && !hasNewItems ? t("Orders & Cart") : t("View Cart")}</span>
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
              if (e.target === e.currentTarget) closeFromUi();
            }}
          >
            {cartPanel}
          </div>
        )
      )}
      {!isPanel && (
        <CartOpenEventBridge onOpen={openFromExternalEvent} />
      )}
      <style>{`
        @keyframes cartShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </>
  );
});

function CartOpenEventBridge({ onOpen }) {
  useEffect(() => {
    const handler = () => onOpen?.();
    window.addEventListener("qr:cart-open", handler);
    return () => window.removeEventListener("qr:cart-open", handler);
  }, [onOpen]);
  return null;
}

export default CartModal;
