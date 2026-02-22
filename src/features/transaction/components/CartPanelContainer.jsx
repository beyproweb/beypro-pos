import React, { useMemo } from "react";
import CartPanel from "./CartPanel";
import {
  normalizeYmd,
  resolveItemPaymentMethod,
} from "../utils/transactionUtils";
import { normalizeExtrasGroupSelection } from "../../transactions/utils/normalization";

const CartPanelContainer = ({
  variant = "desktop",
  t,
  orderId,
  tableLabelText,
  tableId,
  invoiceNumber,
  existingReservation,
  unpaidCartItems,
  paidCartItems,
  cartItems,
  showPaidCartItems,
  setShowPaidCartItems,
  cartScrollRef,
  selectedCartItemIds,
  selectionQuantities,
  expandedCartItems,
  toggleCartItemExpansion,
  toggleCartItemSelection,
  updateSelectionQuantity,
  removeSelectionQuantity,
  decrementCartItem,
  incrementCartItem,
  removeItem,
  safeParseExtras,
  formatCurrency,
  setSelectedProduct,
  setSelectedExtras,
  setEditingCartItemIndex,
  setShowExtrasModal,
  getMatchedExtrasGroups,
  ensureExtrasGroups,
  setShowMoveTableModal,
  setShowMergeTableModal,
  handleOpenDebtModal,
  debtDisabled,
  isDebtSaving,
  handleCartPrint,
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
  getPrimaryActionLabel,
  isPhoneOrder,
  hasConfirmedCartUnpaid,
  hasSuborderUnpaid,
  allCartItemsPaid,
  normalizedStatus,
  isFloatingCartOpen,
  hasUnconfirmedCartItems,
  allPaidIncludingSuborders,
  orderType,
  order,
  discountedTotal,
  discountType,
  discountValue,
  selectedItemsTotal,
  enableCartVirtualization = false,
  virtualizationCartOverscan = 8,
}) => {
  const isDesktop = variant === "desktop";
  const containerClasses = isDesktop
    ? "flex h-full min-h-0 flex-col rounded-[28px] bg-transparent shadow-none ring-0 lg:sticky lg:top-4 lg:self-start lg:mb-[64px] lg:max-h-[calc(100vh-180px)] overflow-hidden"
    : "flex w-full max-h-[calc(100vh-96px)] flex-col rounded-t-[28px] bg-slate-50/95 shadow-[0_20px_35px_rgba(15,23,42,0.25)] ring-1 ring-white/60 backdrop-blur-xl overflow-hidden dark:bg-slate-950/80 dark:shadow-[0_20px_35px_rgba(0,0,0,0.55)] dark:ring-slate-800/70";
  const headerPadding = isDesktop ? "px-5 pt-5 pb-3" : "px-5 pt-4 pb-3";
  const footerPadding = isDesktop ? "px-5 py-5" : "px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]";

  const hasSelection = selectedCartItemIds.size > 0;
  const primaryActionLabel = useMemo(() => getPrimaryActionLabel(), [getPrimaryActionLabel]);

  const showPayLaterInClearSlot =
    !orderId &&
    cartItems.length > 0 &&
    !hasUnconfirmedCartItems &&
    ["confirmed", "unpaid", "paid", "reserved"].includes(normalizedStatus);
  const payLaterLabel =
    showPayLaterInClearSlot && (normalizedStatus === "paid" || allPaidIncludingSuborders)
      ? t("Close Later")
      : t("Pay Later");

  const unpaidGroups = useMemo(
    () =>
      Object.values(
        unpaidCartItems.reduce((acc, item) => {
          const extrasKey = JSON.stringify(safeParseExtras(item.extras) || []);
          const noteKey =
            typeof item.note === "string" ? item.note.trim() : JSON.stringify(item.note || "");
          const pricingKey = [
            Number(item.price) || 0,
            Number(item.original_price ?? item.originalPrice ?? 0) || 0,
            String(item.discount_type ?? item.discountType ?? ""),
            Number(item.discount_value ?? item.discountValue ?? 0) || 0,
            normalizeYmd(item.promo_start ?? item.promoStart ?? ""),
            normalizeYmd(item.promo_end ?? item.promoEnd ?? ""),
          ].join("|");
          const statusSlice = item.paid
            ? `paid:${item.receipt_id || "yes"}`
            : item.confirmed
            ? "confirmed"
            : "unconfirmed";
          const key = item.confirmed
            ? `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}__uid:${item.unique_id}`
            : `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}`;
          if (!acc[key]) acc[key] = { ...item, quantity: 0, items: [] };
          acc[key].quantity += Number(item.quantity) || 1;
          acc[key].items.push(item);
          return acc;
        }, {})
      ).map((item, idx) => {
        const extrasList = safeParseExtras(item.extras);
        const normalizedExtras = Array.isArray(extrasList) ? extrasList : [];
        const perItemExtrasTotal = normalizedExtras.reduce((sum, ex) => {
          const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
          const qty = Number(ex.quantity) || 1;
          return sum + price * qty;
        }, 0);
        const basePrice = parseFloat(item.price) || 0;
        const originalUnitPrice = Number(item.original_price ?? item.originalPrice ?? 0);
        const discountTypeLocal = String(item.discount_type ?? item.discountType ?? "none");
        const discountValueLocal = Number(item.discount_value ?? item.discountValue ?? 0);
        const hasProductDiscountMeta =
          discountTypeLocal !== "none" && Number.isFinite(discountValueLocal) && discountValueLocal > 0;
        const isDiscountApplied =
          Boolean(item.discount_applied) ||
          (Number.isFinite(originalUnitPrice) && Math.abs(originalUnitPrice - basePrice) > 0.0001);
        const quantity = Number(item.quantity) || 1;
        const baseTotal = basePrice * quantity;
        const extrasTotal = perItemExtrasTotal * quantity;
        const showNote = typeof item.note === "string" ? item.note.trim() !== "" : !!item.note;
        const isEditable = !item.confirmed && !item.paid;
        const cardGradient = item.paid
          ? "bg-gradient-to-br from-green-200 via-green-100 to-green-50 border-green-300"
          : item.confirmed
          ? "bg-gradient-to-br from-blue-200 via-blue-100 to-blue-50 border-blue-300"
          : "bg-gradient-to-br from-amber-200 via-amber-100 to-yellow-50 border-amber-300";

        const itemKey = item.unique_id || `${item.id}-${idx}`;
        const isExpanded = expandedCartItems.has(itemKey);
        const selectionKey = String(item.unique_id || item.id);
        const isSelected = selectedCartItemIds.has(selectionKey);

        const openEditExtrasModal = async () => {
          if (!isEditable) return;
          const parsedExtras = safeParseExtras(item.extras);
          const selection = normalizeExtrasGroupSelection([
            item.extrasGroupRefs,
            item.selectedExtrasGroup,
            item.selected_extras_group,
            item.selectedExtrasGroupNames,
          ]);
          if (selection.ids.length === 0 && selection.names.length === 0) {
            setSelectedProduct({
              ...item,
              modalExtrasGroups: [],
              extrasGroupRefs: { ids: [], names: [] },
              selectedExtrasGroup: [],
              selected_extras_group: [],
              selectedExtrasGroupNames: [],
            });
            setSelectedExtras(parsedExtras || []);
            setEditingCartItemIndex(idx);
            setShowExtrasModal(true);
            return;
          }
          let modalGroups = [];
          let selectionForModal = selection;
          try {
            const match = await getMatchedExtrasGroups(selection);
            if (match) {
              modalGroups = match.matchedGroups || [];
              const ids = match.matchedIds?.length ? match.matchedIds : selection.ids;
              const names = match.matchedNames?.length ? match.matchedNames : selection.names;
              selectionForModal = { ids, names };
            } else {
              const groupsData = await ensureExtrasGroups();
              modalGroups = Array.isArray(groupsData) ? groupsData : [];
            }
          } catch (err) {
            console.error("❌ Failed to resolve extras groups for edit:", err);
            const fallbackGroups = await ensureExtrasGroups();
            modalGroups = Array.isArray(fallbackGroups) ? fallbackGroups : [];
          }
          setSelectedProduct({
            ...item,
            modalExtrasGroups: modalGroups,
            extrasGroupRefs: selectionForModal,
            selectedExtrasGroup: selectionForModal.ids,
            selected_extras_group: selectionForModal.ids,
            selectedExtrasGroupNames: selectionForModal.names,
          });
          setSelectedExtras(parsedExtras || []);
          setEditingCartItemIndex(idx);
          setShowExtrasModal(true);
        };

        const availableQuantities = Array.from({ length: quantity }, (_, qIdx) => qIdx + 1);
        const selectedQuantityValue = String(
          Math.min(
            Math.max(1, Number(selectionQuantities?.[selectionKey] ?? Number(item.quantity)) || 1),
            Math.max(1, quantity)
          )
        );

        return {
          itemKey,
          name: item.name,
          basePriceLabel: formatCurrency(basePrice),
          quantity,
          baseTotalLabel: formatCurrency(baseTotal),
          extrasTotalLabel: formatCurrency(extrasTotal),
          totalWithExtrasLabel: formatCurrency(baseTotal + extrasTotal),
          hasExtrasTotal: extrasTotal > 0,
          extrasDetails: normalizedExtras.map((ex, i2) => {
            const extraQtyPerItem = Number(ex.quantity) || 1;
            const unit = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
            const totalQty = extraQtyPerItem * quantity;
            const lineTotal = unit * totalQty;
            return {
              key: `${item.unique_id}-extra-${i2}`,
              label: `+ ${totalQty}x ${formatCurrency(unit)} ${ex.name}`,
              totalLabel: formatCurrency(lineTotal),
            };
          }),
          showNote,
          note: item.note,
          hasProductDiscountMeta,
          discountLabel:
            discountTypeLocal === "percentage" ? `-${discountValueLocal}%` : `-${formatCurrency(discountValueLocal)}`,
          discountBadgeClass: isDiscountApplied
            ? "rounded-full border px-2 py-0.5 font-semibold border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
            : "rounded-full border px-2 py-0.5 font-semibold border-slate-200 bg-slate-50 text-slate-500",
          isDiscountApplied,
          originalUnitPriceLabel:
            Number.isFinite(originalUnitPrice) && Math.abs(originalUnitPrice - basePrice) > 0.0001
              ? formatCurrency(originalUnitPrice)
              : "",
          cardGradient,
          borderLeftColor: item.paid ? "#059669" : item.confirmed ? "#2563eb" : "#d97706",
          isExpanded,
          isSelected,
          isEditable,
          isPaid: !!item.paid,
          paidBadge: item.payment_method ? `${t("Paid")}: ${item.payment_method}` : t("Paid"),
          availableQuantities,
          selectedQuantityValue,
          onCardClick: () => openEditExtrasModal(),
          onToggleExpand: (e) => {
            if (e) e.stopPropagation();
            toggleCartItemExpansion(itemKey);
          },
          onSelectToggle: () => {
            if (item.paid) return;
            toggleCartItemSelection(selectionKey);
            const maxQty = Math.max(1, Number(item.quantity) || 1);
            if (!isSelected) {
              updateSelectionQuantity(selectionKey, maxQty, maxQty);
            } else {
              removeSelectionQuantity(selectionKey);
            }
          },
          onQuantityChange: (e) => {
            const nextVal = Math.min(
              Math.max(1, Number(e.target.value) || 1),
              Math.max(1, Number(item.quantity) || 1)
            );
            updateSelectionQuantity(selectionKey, nextVal, Math.max(1, Number(item.quantity) || 1));
          },
          onNameClick: (e) => {
            e.stopPropagation();
            if (isEditable) {
              openEditExtrasModal();
              return;
            }
            toggleCartItemExpansion(itemKey);
          },
          onDecrement: (e) => {
            e.stopPropagation();
            decrementCartItem(item.unique_id);
          },
          onIncrement: (e) => {
            e.stopPropagation();
            incrementCartItem(item.unique_id);
          },
          onEdit: (e) => {
            e.stopPropagation();
            openEditExtrasModal();
          },
          onRemove: (e) => {
            e.stopPropagation();
            removeItem(item.unique_id);
          },
        };
      }),
    [
      unpaidCartItems,
      safeParseExtras,
      expandedCartItems,
      selectedCartItemIds,
      selectionQuantities,
      formatCurrency,
      t,
      setSelectedProduct,
      setSelectedExtras,
      setEditingCartItemIndex,
      setShowExtrasModal,
      getMatchedExtrasGroups,
      ensureExtrasGroups,
      toggleCartItemExpansion,
      toggleCartItemSelection,
      updateSelectionQuantity,
      removeSelectionQuantity,
      decrementCartItem,
      incrementCartItem,
      removeItem,
    ]
  );

  const paidGroups = useMemo(
    () =>
      Object.values(
        paidCartItems.reduce((acc, item) => {
          const extrasKey = JSON.stringify(safeParseExtras(item.extras) || []);
          const noteKey =
            typeof item.note === "string" ? item.note.trim() : JSON.stringify(item.note || "");
          const pricingKey = [
            Number(item.price) || 0,
            Number(item.original_price ?? item.originalPrice ?? 0) || 0,
            String(item.discount_type ?? item.discountType ?? ""),
            Number(item.discount_value ?? item.discountValue ?? 0) || 0,
            normalizeYmd(item.promo_start ?? item.promoStart ?? ""),
            normalizeYmd(item.promo_end ?? item.promoEnd ?? ""),
          ].join("|");
          const statusSlice = item.paid
            ? `paid:${item.receipt_id || "yes"}`
            : item.confirmed
            ? "confirmed"
            : "unconfirmed";
          const key = item.confirmed
            ? `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}__uid:${item.unique_id}`
            : `${item.name}__${extrasKey}__${noteKey}__${pricingKey}__${statusSlice}`;
          if (!acc[key]) acc[key] = { ...item, quantity: 0, items: [] };
          acc[key].quantity += Number(item.quantity) || 1;
          acc[key].items.push(item);
          return acc;
        }, {})
      ).map((item, idx) => {
        const extrasList = safeParseExtras(item.extras);
        const normalizedExtras = Array.isArray(extrasList) ? extrasList : [];
        const perItemExtrasTotal = normalizedExtras.reduce((sum, ex) => {
          const price = parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0;
          const qty = Number(ex.quantity) || 1;
          return sum + price * qty;
        }, 0);
        const basePrice = parseFloat(item.price) || 0;
        const originalUnitPrice = Number(item.original_price ?? item.originalPrice ?? 0);
        const discountTypeLocal = String(item.discount_type ?? item.discountType ?? "none");
        const discountValueLocal = Number(item.discount_value ?? item.discountValue ?? 0);
        const hasProductDiscountMeta =
          discountTypeLocal !== "none" && Number.isFinite(discountValueLocal) && discountValueLocal > 0;
        const isDiscountApplied =
          Boolean(item.discount_applied) ||
          (Number.isFinite(originalUnitPrice) && Math.abs(originalUnitPrice - basePrice) > 0.0001);
        const quantity = Number(item.quantity) || 1;
        const baseTotal = basePrice * quantity;
        const extrasTotal = perItemExtrasTotal * quantity;
        const showNote = typeof item.note === "string" ? item.note.trim() !== "" : !!item.note;
        const paidMethod = resolveItemPaymentMethod(order, item);
        const itemKey = item.unique_id || `${item.id}-${idx}`;
        const selectionKey = String(item.unique_id || item.id);
        const isExpanded = expandedCartItems.has(itemKey);
        const isSelected = selectedCartItemIds.has(selectionKey);
        const availableQuantities = Array.from({ length: quantity }, (_, qIdx) => qIdx + 1);
        const selectedQuantityValue = String(
          Math.min(
            Math.max(1, Number(selectionQuantities?.[selectionKey] ?? Number(item.quantity)) || 1),
            Math.max(1, quantity)
          )
        );
        return {
          itemKey,
          name: item.name,
          basePriceLabel: formatCurrency(basePrice),
          quantity,
          cardGradient: "bg-gradient-to-br from-green-200 via-green-100 to-green-50 border-green-300",
          hasProductDiscountMeta,
          discountLabel:
            discountTypeLocal === "percentage"
              ? `-${discountValueLocal}%`
              : `-${formatCurrency(discountValueLocal)}`,
          discountBadgeClass: isDiscountApplied
            ? "rounded-full border px-2 py-0.5 font-semibold border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700"
            : "rounded-full border px-2 py-0.5 font-semibold border-slate-200 bg-slate-50 text-slate-500",
          paidMethod,
          totalPaidLabel: formatCurrency(baseTotal + extrasTotal),
          extrasTotalLabel: formatCurrency(extrasTotal),
          hasExtrasTotal: extrasTotal > 0,
          isExpanded,
          isSelected,
          availableQuantities,
          selectedQuantityValue,
          showNote,
          note: typeof item.note === "string" ? item.note : "",
          extrasSummary: normalizedExtras.map((ex) => ex.name || ex.label).filter(Boolean).join(", "),
          onToggleExpand: () => toggleCartItemExpansion(itemKey),
          onSelectToggle: (e) => {
            if (e) e.stopPropagation();
            toggleCartItemSelection(selectionKey);
            const maxQty = Math.max(1, Number(item.quantity) || 1);
            if (!isSelected) {
              updateSelectionQuantity(selectionKey, maxQty, maxQty);
            } else {
              removeSelectionQuantity(selectionKey);
            }
          },
          onQuantityChange: (e) => {
            const nextVal = Math.min(
              Math.max(1, Number(e.target.value) || 1),
              Math.max(1, Number(item.quantity) || 1)
            );
            updateSelectionQuantity(selectionKey, nextVal, Math.max(1, Number(item.quantity) || 1));
          },
        };
      }),
    [
      paidCartItems,
      safeParseExtras,
      expandedCartItems,
      selectedCartItemIds,
      selectionQuantities,
      formatCurrency,
      toggleCartItemExpansion,
      toggleCartItemSelection,
      updateSelectionQuantity,
      removeSelectionQuantity,
      order,
    ]
  );

  const cartData = useMemo(
    () => ({
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
      cartItemsLength: cartItems.length,
      cartScrollRef,
      enableCartVirtualization,
      virtualizationCartOverscan,
    }),
    [
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
      cartItems.length,
      cartScrollRef,
      enableCartVirtualization,
      virtualizationCartOverscan,
    ]
  );

  const totals = useMemo(
    () => ({
      subtotalLabel: formatCurrency(discountedTotal),
      discountLabel:
        discountValue > 0
          ? `${t("Discount")} ${
              discountType === "percent"
                ? `(${discountValue}%)`
                : `(-${formatCurrency(discountValue)})`
            }`
          : "",
      discountValueLabel: discountValue > 0 ? `-${formatCurrency(discountValue)}` : "",
      totalLabel: formatCurrency(discountedTotal),
      selectedTotalLabel: formatCurrency(selectedItemsTotal),
      hasDiscount: discountValue > 0,
      showPayLaterInClearSlot,
      payLaterLabel,
      primaryActionLabel,
      showPayLaterInFooter:
        !orderId &&
        cartItems.length > 0 &&
        !hasUnconfirmedCartItems &&
        ["confirmed", "unpaid", "paid", "reserved"].includes(normalizedStatus),
      footerPayLaterLabel:
        !orderId &&
        cartItems.length > 0 &&
        !hasUnconfirmedCartItems &&
        ["confirmed", "unpaid", "paid", "reserved"].includes(normalizedStatus) &&
        (normalizedStatus === "paid" || allPaidIncludingSuborders)
          ? t("Close Later")
          : t("Pay Later"),
      footerCancelDisabled:
        normalizedStatus !== "confirmed" || hasUnconfirmedCartItems || cartItems.length === 0,
      footerCanShowCancel: orderType === "table" || orderType === "takeaway",
      footerPrimaryActionLabel: primaryActionLabel,
    }),
    [
      formatCurrency,
      discountedTotal,
      discountValue,
      t,
      discountType,
      selectedItemsTotal,
      showPayLaterInClearSlot,
      payLaterLabel,
      primaryActionLabel,
      orderId,
      cartItems.length,
      hasUnconfirmedCartItems,
      normalizedStatus,
      allPaidIncludingSuborders,
      orderType,
    ]
  );

  const uiState = useMemo(
    () => ({
      isDesktop,
      hasSelection,
      selectedCount: selectedCartItemIds.size,
      isPhoneOrder,
      hasConfirmedCartUnpaid,
      hasSuborderUnpaid,
      allCartItemsPaid,
      normalizedStatus,
      isFloatingCartOpen,
      hasExpandedCartItems: expandedCartItems.size > 0,
    }),
    [
      isDesktop,
      hasSelection,
      selectedCartItemIds.size,
      isPhoneOrder,
      hasConfirmedCartUnpaid,
      hasSuborderUnpaid,
      allCartItemsPaid,
      normalizedStatus,
      isFloatingCartOpen,
      expandedCartItems.size,
    ]
  );

  const actions = useMemo(
    () => ({
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
    }),
    [
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
    ]
  );

  return (
    <CartPanel
      cartData={cartData}
      totals={totals}
      actions={actions}
      uiState={uiState}
      setUiState={{ setIsFloatingCartOpen }}
      variant={variant}
    />
  );
};

export default React.memo(CartPanelContainer);
