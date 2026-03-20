import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildReservationShadowRecord,
  readReservationShadows,
  removeReservationShadow,
  upsertReservationShadow,
} from "../../orders/tableOrdersCache";
import {
  hasConcertBookingContext,
  isConcertBookingConfirmed,
  isReservationConfirmedForCheckin,
  isReservationPendingConfirmation,
} from "../../../utils/reservationStatus";

const CHECKIN_REGRESSION_STATUSES = new Set([
  "reserved",
  "confirmed",
  "draft",
  "new",
  "pending",
  "paid",
  "open",
  "in_progress",
]);

const toLowerStatus = (value) => String(value || "").trim().toLowerCase();
const TERMINAL_RESERVATION_STATUSES = new Set([
  "checked_out",
  "closed",
  "completed",
  "cancelled",
  "canceled",
  "deleted",
  "void",
]);

const shouldPreserveCheckedInStatus = (incomingStatus, previousStatus) => {
  if (previousStatus !== "checked_in") return false;
  if (!incomingStatus || incomingStatus === "checked_in") return false;
  return CHECKIN_REGRESSION_STATUSES.has(incomingStatus);
};

export const useReservation = ({
  order,
  tableId,
  identifier,
  txApiRequest,
  t,
  showToast,
  hasUnconfirmedCartItems,
  safeCartItems,
  updateOrderStatus,
  fetchOrderItems,
  restaurantId,
  debugNavigate,
  discountValue,
  discountType,
  setOrder,
  onReservationStateChange,
}) => {
  const [reservationDate, setReservationDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reservationTime, setReservationTime] = useState("");
  const [reservationClients, setReservationClients] = useState("2");
  const [reservationNotes, setReservationNotes] = useState("");
  const [reservationCustomerName, setReservationCustomerName] = useState("");
  const [reservationCustomerPhone, setReservationCustomerPhone] = useState("");
  const [existingReservation, setExistingReservation] = useState(null);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const resolvedTableNumber = order?.table_number ?? order?.tableNumber ?? tableId;
  const existingReservationRef = useRef(null);
  const reservationDebugEnabled = import.meta.env.DEV;

  useEffect(() => {
    existingReservationRef.current = existingReservation ?? null;
  }, [existingReservation]);

  const resetReservationForm = useCallback(() => {
    setReservationDate(new Date().toISOString().split("T")[0]);
    setReservationTime("");
    setReservationClients("2");
    setReservationNotes("");
    setReservationCustomerName("");
    setReservationCustomerPhone("");
  }, []);

  const normalizeReservationCandidate = useCallback((reservation) => {
    if (!reservation || typeof reservation !== "object") return null;
    return (
      buildReservationShadowRecord({
        reservation,
        order,
        tableNumber: resolvedTableNumber,
        orderId: order?.id,
      }) || null
    );
  }, [order, resolvedTableNumber]);

  const mergeReservationCandidate = useCallback((reservation, fallbackReservation = null) => {
    const primary = normalizeReservationCandidate(reservation);
    const fallback = normalizeReservationCandidate(fallbackReservation);
    if (!primary) return fallback;
    if (!fallback) return primary;

    const primaryStatus = toLowerStatus(primary?.status);
    const fallbackStatus = toLowerStatus(fallback?.status);
    const mergedReservation = {
      ...fallback,
      ...primary,
      // Keep reservation contact details from the fallback/current reservation unless
      // the fresh payload explicitly carries a better value.
      customer_name: fallback.customer_name || primary.customer_name || "",
      customer_phone: fallback.customer_phone || primary.customer_phone || "",
      reservation_notes: primary.reservation_notes || fallback.reservation_notes || "",
      reservation_time: primary.reservation_time || fallback.reservation_time || "",
      reservation_date: primary.reservation_date || fallback.reservation_date || "",
      reservation_clients:
        primary.reservation_clients != null
          ? primary.reservation_clients
          : fallback.reservation_clients ?? 0,
    };
    if (shouldPreserveCheckedInStatus(primaryStatus, fallbackStatus)) {
      mergedReservation.status = "checked_in";
      if (String(mergedReservation?.order_type || "").toLowerCase() === "reservation") {
        mergedReservation.order_type = "table";
      }
    }
    return mergedReservation;
  }, [normalizeReservationCandidate]);

  const applyReservationState = useCallback((reservation) => {
    let nextReservation = normalizeReservationCandidate(reservation);
    if (reservationDebugEnabled) {
      console.log("[reservation] applyReservationState", {
        input: reservation,
        normalized: nextReservation,
        tableNumber: resolvedTableNumber,
        orderId: order?.id ?? null,
      });
    }
    if (!nextReservation) {
      setExistingReservation(null);
      resetReservationForm();
      return null;
    }

    const previousReservation = existingReservationRef.current;
    if (previousReservation) {
      const incomingStatus = toLowerStatus(nextReservation?.status);
      const previousStatus = toLowerStatus(previousReservation?.status);
      const nextReservationId = Number(nextReservation?.id);
      const prevReservationId = Number(previousReservation?.id);
      const nextOrderId = Number(nextReservation?.order_id ?? nextReservation?.orderId);
      const prevOrderId = Number(previousReservation?.order_id ?? previousReservation?.orderId);
      const nextTableNumber = Number(
        nextReservation?.table_number ?? nextReservation?.tableNumber ?? nextReservation?.table
      );
      const prevTableNumber = Number(
        previousReservation?.table_number ??
          previousReservation?.tableNumber ??
          previousReservation?.table
      );
      const sameReservationId =
        Number.isFinite(nextReservationId) &&
        Number.isFinite(prevReservationId) &&
        nextReservationId > 0 &&
        prevReservationId > 0 &&
        nextReservationId === prevReservationId;
      const sameOrderId =
        Number.isFinite(nextOrderId) &&
        Number.isFinite(prevOrderId) &&
        nextOrderId > 0 &&
        prevOrderId > 0 &&
        nextOrderId === prevOrderId;
      const sameTable =
        Number.isFinite(nextTableNumber) &&
        Number.isFinite(prevTableNumber) &&
        nextTableNumber === prevTableNumber;
      const shouldProtectCheckedIn =
        (sameReservationId || sameOrderId || sameTable) &&
        shouldPreserveCheckedInStatus(incomingStatus, previousStatus);
      if (shouldProtectCheckedIn) {
        nextReservation = {
          ...nextReservation,
          status: "checked_in",
          order_type:
            String(nextReservation?.order_type || "").toLowerCase() === "reservation"
              ? "table"
              : nextReservation?.order_type,
        };
      }
    }

    setExistingReservation(nextReservation);
    setReservationDate(nextReservation.reservation_date || "");
    setReservationTime(nextReservation.reservation_time || "");
    setReservationClients(
      nextReservation.reservation_clients != null
        ? String(nextReservation.reservation_clients)
        : "2"
    );
    setReservationNotes(nextReservation.reservation_notes || "");
    setReservationCustomerName(nextReservation.customer_name || nextReservation.customerName || "");
    setReservationCustomerPhone(nextReservation.customer_phone || nextReservation.customerPhone || "");
    return nextReservation;
  }, [normalizeReservationCandidate, order?.id, reservationDebugEnabled, resetReservationForm, resolvedTableNumber]);

  const getShadowReservationForTable = useCallback((tableNumber) => {
    const normalizedTableNumber = Number(tableNumber);
    if (!Number.isFinite(normalizedTableNumber)) return null;

    const shadows = readReservationShadows();
    if (!Array.isArray(shadows) || shadows.length === 0) return null;

    return (
      shadows.find((row) => {
        const rowTableNumber = Number(
          row?.table_number ?? row?.tableNumber ?? row?.table
        );
        return rowTableNumber === normalizedTableNumber;
      }) || null
    );
  }, []);

  const getOrderReservationFallback = useCallback(() => {
    if (!order || typeof order !== "object") return null;

    const statusCandidates = [
      order?.status,
      order?.reservation?.status,
      order?.reservation_status,
      order?.reservationStatus,
    ].map(toLowerStatus);
    if (statusCandidates.some((status) => TERMINAL_RESERVATION_STATUSES.has(status))) {
      return null;
    }

    const reservationDate =
      order?.reservation_date ??
      order?.reservationDate ??
      order?.reservation?.reservation_date ??
      order?.reservation?.reservationDate ??
      null;
    const reservationTime =
      order?.reservation_time ??
      order?.reservationTime ??
      order?.reservation?.reservation_time ??
      order?.reservation?.reservationTime ??
      null;
    const reservationClients =
      order?.reservation_clients ??
      order?.reservationClients ??
      order?.reservation?.reservation_clients ??
      order?.reservation?.reservationClients ??
      null;
    const reservationNotes =
      order?.reservation_notes ??
      order?.reservationNotes ??
      order?.reservation?.reservation_notes ??
      order?.reservation?.reservationNotes ??
      null;

    if (!reservationDate && !reservationTime && !reservationNotes && Number(reservationClients || 0) <= 0) {
      return null;
    }

    return {
      id:
        order?.reservation_id ??
        order?.reservationId ??
        order?.reservation?.id ??
        order?.reservation?.reservation_id ??
        order?.reservation?.reservationId ??
        null,
      order_id: order?.id ?? null,
      table_number: resolvedTableNumber ?? null,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      reservation_clients: reservationClients ?? 0,
      reservation_notes: reservationNotes ?? "",
      customer_name:
        order?.customer_name ??
        order?.customerName ??
        order?.reservation?.customer_name ??
        order?.reservation?.customerName ??
        "",
      customer_phone:
        order?.customer_phone ??
        order?.customerPhone ??
        order?.reservation?.customer_phone ??
        order?.reservation?.customerPhone ??
        "",
    };
  }, [order, resolvedTableNumber]);

  const getFallbackReservationForTable = useCallback((tableNumber) => {
    const shadowReservation = getShadowReservationForTable(tableNumber);
    if (shadowReservation) {
      if (reservationDebugEnabled) {
        console.log("[reservation] fallback from shadow", {
          tableNumber,
          shadowReservation,
        });
      }
      return shadowReservation;
    }

    const currentReservation = existingReservationRef.current;
    if (!currentReservation?.reservation_date) {
      const orderFallback = getOrderReservationFallback();
      if (reservationDebugEnabled) {
        console.log("[reservation] fallback from order", {
          tableNumber,
          orderFallback,
        });
      }
      return orderFallback;
    }

    const normalizedTableNumber = Number(tableNumber);
    const existingTableNumber = Number(
      currentReservation?.table_number ??
        currentReservation?.tableNumber ??
        currentReservation?.table ??
        resolvedTableNumber
    );

    if (!Number.isFinite(normalizedTableNumber)) return currentReservation;
    if (!Number.isFinite(existingTableNumber)) return currentReservation;
    if (existingTableNumber === normalizedTableNumber) {
      if (reservationDebugEnabled) {
        console.log("[reservation] fallback from current reservation", {
          tableNumber,
          currentReservation,
        });
      }
      return currentReservation;
    }
    const orderFallback = getOrderReservationFallback();
    if (reservationDebugEnabled) {
      console.log("[reservation] fallback from order after table mismatch", {
        tableNumber,
        currentReservation,
        orderFallback,
      });
    }
    return orderFallback;
  }, [
    getOrderReservationFallback,
    getShadowReservationForTable,
    reservationDebugEnabled,
    resolvedTableNumber,
  ]);

  const handleSaveReservation = useCallback(async () => {
    if (!reservationDate.trim() || !reservationTime.trim() || !reservationClients.trim()) {
      showToast(t("Please fill all reservation fields"));
      return;
    }
    setReservationLoading(true);
    try {
      const payload = {
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        reservation_clients: parseInt(reservationClients, 10),
        reservation_notes: reservationNotes,
        customer_name: reservationCustomerName.trim(),
        customer_phone: reservationCustomerPhone.trim(),
        order_id: order?.id || null,
      };

      const endpoint = existingReservation
        ? `/orders/reservations/${existingReservation.id}${identifier}`
        : `/orders/reservations${identifier}`;

      const response = await txApiRequest(endpoint, {
        method: existingReservation ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      const savedReservation = response?.reservation || null;
      if (!savedReservation) throw new Error(t("Failed to save reservation"));

      const normalizedSavedReservation =
        normalizeReservationCandidate(savedReservation) || savedReservation;
      const typedCustomerName = reservationCustomerName.trim();
      const typedCustomerPhone = reservationCustomerPhone.trim();
      const finalSavedReservation = {
        ...normalizedSavedReservation,
        customer_name:
          typedCustomerName ||
          normalizedSavedReservation.customer_name ||
          normalizedSavedReservation.customerName ||
          "",
        customer_phone:
          typedCustomerPhone ||
          normalizedSavedReservation.customer_phone ||
          normalizedSavedReservation.customerPhone ||
          "",
      };
      if (reservationDebugEnabled) {
        console.log("[reservation] save response", {
          payload,
          response,
          savedReservation,
          normalizedSavedReservation,
          finalSavedReservation,
        });
      }

      setExistingReservation(finalSavedReservation);
      upsertReservationShadow(finalSavedReservation);
      const savedReservationId = Number(finalSavedReservation?.id);
      const currentOrderId = Number(order?.id);
      const savedIntoCurrentOrder =
        Number.isFinite(savedReservationId) &&
        savedReservationId > 0 &&
        Number.isFinite(currentOrderId) &&
        currentOrderId > 0 &&
        savedReservationId === currentOrderId;
      if (savedIntoCurrentOrder) {
        const reservationClientCount =
          finalSavedReservation.reservation_clients ??
          (parseInt(reservationClients, 10) || 0);
        const syncedOrder = {
          ...(order || {}),
          status: finalSavedReservation.status || "reserved",
          order_type: finalSavedReservation.order_type || order?.order_type || "table",
          reservation: {
            ...(order?.reservation && typeof order.reservation === "object"
              ? order.reservation
              : {}),
            id: finalSavedReservation.id ?? null,
            order_id: finalSavedReservation.id ?? order?.id ?? null,
            table_number: finalSavedReservation.table_number ?? resolvedTableNumber ?? null,
            status: finalSavedReservation.status || "reserved",
            order_type: finalSavedReservation.order_type || "reservation",
            reservation_date: finalSavedReservation.reservation_date || reservationDate,
            reservation_time: finalSavedReservation.reservation_time || reservationTime,
            reservation_clients: reservationClientCount,
            reservation_notes: finalSavedReservation.reservation_notes || reservationNotes,
            customer_name:
              finalSavedReservation.customer_name ||
              finalSavedReservation.customerName ||
              typedCustomerName,
            customer_phone:
              finalSavedReservation.customer_phone ||
              finalSavedReservation.customerPhone ||
              typedCustomerPhone,
          },
          reservation_id: finalSavedReservation.id ?? null,
          reservationId: finalSavedReservation.id ?? null,
          reservation_date: finalSavedReservation.reservation_date || reservationDate,
          reservationDate: finalSavedReservation.reservation_date || reservationDate,
          reservation_time: finalSavedReservation.reservation_time || reservationTime,
          reservationTime: finalSavedReservation.reservation_time || reservationTime,
          reservation_clients: reservationClientCount,
          reservationClients: reservationClientCount,
          reservation_notes: finalSavedReservation.reservation_notes || reservationNotes,
          reservationNotes: finalSavedReservation.reservation_notes || reservationNotes,
        };
        setOrder((prev) => ({ ...(prev || {}), ...syncedOrder }));
        onReservationStateChange?.(syncedOrder);
      }
      setReservationDate(finalSavedReservation.reservation_date || reservationDate);
      setReservationTime(finalSavedReservation.reservation_time || reservationTime);
      setReservationClients(
        finalSavedReservation.reservation_clients?.toString() || reservationClients
      );
      setReservationNotes(finalSavedReservation.reservation_notes || reservationNotes);
      setReservationCustomerName(
        finalSavedReservation.customer_name ||
          finalSavedReservation.customerName ||
          reservationCustomerName
      );
      setReservationCustomerPhone(
        finalSavedReservation.customer_phone ||
          finalSavedReservation.customerPhone ||
          reservationCustomerPhone
      );
      showToast(t("Reservation saved"));
      setShowReservationModal(false);
      resetReservationForm();
    } catch (err) {
      console.error("❌ Failed to save reservation:", err);
      showToast(err.message || t("Failed to save reservation"));
    } finally {
      setReservationLoading(false);
    }
  }, [
    reservationDate,
    reservationTime,
    reservationClients,
    reservationNotes,
    reservationCustomerName,
    reservationCustomerPhone,
    order?.id,
    existingReservation,
    txApiRequest,
    identifier,
    onReservationStateChange,
    order,
    resolvedTableNumber,
    setOrder,
    showToast,
    t,
    resetReservationForm,
    normalizeReservationCandidate,
    reservationDebugEnabled,
  ]);

  const handleDeleteReservation = useCallback(async () => {
    if (!existingReservation?.reservation_date) return;
    const isCancelledLikeItem = (item) => {
      const status = String(
        item?.status ?? item?.item_status ?? item?.kitchen_status ?? ""
      ).toLowerCase();
      return ["cancelled", "canceled", "deleted", "void"].includes(status);
    };

    const localCartCount = Array.isArray(safeCartItems)
      ? safeCartItems.filter((item) => !isCancelledLikeItem(item)).length
      : 0;
    const hasCartItems = hasUnconfirmedCartItems || localCartCount > 0;
    if (hasCartItems) {
      window.alert(
        t("You cannot cancel this reservation while items are in cart. Please clear or close the table/cart first.")
      );
      return;
    }

    const normalizedStatus = String(order?.status || "").toLowerCase();
    const normalizedType = String(order?.order_type || "").toLowerCase();
    const isReservationLikeOrder =
      normalizedStatus === "reserved" ||
      normalizedType === "reservation" ||
      !!existingReservation?.id;

    let itemCount = Array.isArray(order?.items)
      ? order.items.filter((item) => !isCancelledLikeItem(item)).length
      : null;
    if (!Number.isFinite(itemCount) && order?.id) {
      try {
        const includeCancelledIdentifier = String(identifier || "").startsWith("?")
          ? `&${String(identifier).slice(1)}`
          : String(identifier || "");
        const itemsResponse = await txApiRequest(
          `/orders/${order.id}/items?include_cancelled=1${includeCancelledIdentifier}`
        );
        const latestItems = Array.isArray(itemsResponse)
          ? itemsResponse
          : Array.isArray(itemsResponse?.items)
          ? itemsResponse.items
          : [];
        itemCount = latestItems.filter((item) => !isCancelledLikeItem(item)).length;
      } catch {
        itemCount = null;
      }
    }
    const totalAmount = Number(order?.total || 0);
    const hasAnyItemsInCartOrTable = Number(itemCount || 0) > 0 || totalAmount > 0;
    if (hasAnyItemsInCartOrTable) {
      window.alert(
        t("You cannot cancel this reservation while items are in cart. Please clear or close the table/cart first.")
      );
      return;
    }

    const ok = window.confirm(t("Cancel this reservation?"));
    if (!ok) return;

    const isEmptyReservationOnly =
      isReservationLikeOrder && totalAmount <= 0 && Number(itemCount || 0) === 0;

    let deleteReason = "";
    if (isEmptyReservationOnly) {
      const input = window.prompt(t("Please enter a reason for cancelling this empty reservation"));
      if (input === null) return;
      const trimmed = String(input || "").trim();
      if (!trimmed) {
        showToast(t("Reason is required"));
        return;
      }
      deleteReason = trimmed;
    }

    setReservationLoading(true);
    try {
      const response = await txApiRequest(`/orders/${order.id}/reservations${identifier}`, {
        method: "DELETE",
        ...(deleteReason
          ? {
              body: JSON.stringify({
                delete_reason: deleteReason,
                cancellation_reason: deleteReason,
              }),
            }
          : {}),
      });
      if (response?.success === false) throw new Error(response.message || t("Failed to cancel reservation"));

      const responseOrder =
        response?.order && typeof response.order === "object" ? response.order : null;
      const fallbackStatus = String(order?.status || "").toLowerCase();
      const normalizedStatus =
        responseOrder?.status ??
        (fallbackStatus === "reserved" ? "confirmed" : order?.status ?? "confirmed");
      const normalizedStatusLower = String(normalizedStatus || "").toLowerCase();
      const nextOrderTypeSource = responseOrder?.order_type ?? order?.order_type;
      const normalizedOrderType =
        nextOrderTypeSource === "reservation" && normalizedStatusLower !== "reserved"
          ? "table"
          : nextOrderTypeSource;

      const normalizedOrder = {
        ...(order && typeof order === "object" ? order : {}),
        ...(responseOrder || {}),
        status: normalizedStatus,
        order_type: normalizedOrderType,
        reservation: null,
        reservation_id: null,
        reservationId: null,
        reservation_date: null,
        reservationDate: null,
        reservation_time: null,
        reservationTime: null,
        reservation_clients: null,
        reservationClients: null,
        reservation_notes: null,
        reservationNotes: null,
      };

      setOrder((prev) => ({ ...(prev || {}), ...normalizedOrder }));
      onReservationStateChange?.(normalizedOrder);
      removeReservationShadow({
        reservationId: existingReservation?.id,
        orderId: order?.id,
        tableNumber: order?.table_number ?? order?.tableNumber,
      });

      setExistingReservation(null);
      resetReservationForm();
      showToast(t("Reservation cancelled"));
      setShowReservationModal(false);
    } catch (err) {
      console.error("❌ Failed to delete reservation:", err);
      showToast(err?.message || t("Failed to cancel reservation"));
    } finally {
      setReservationLoading(false);
    }
  }, [
    existingReservation,
    identifier,
    onReservationStateChange,
    order,
    order?.id,
    resetReservationForm,
    setOrder,
    showToast,
    t,
    txApiRequest,
    hasUnconfirmedCartItems,
    safeCartItems,
  ]);

  const handleCheckinReservation = useCallback(async () => {
    if (!existingReservation?.reservation_date) return;
    let targetOrderId = Number(
      existingReservation?.order_id ??
        existingReservation?.orderId ??
        existingReservation?.id ??
        order?.id
    );
    if (!Number.isFinite(targetOrderId) || targetOrderId <= 0) {
      showToast(t("Reservation record not found"));
      return;
    }
    const closedLikeStatuses = new Set(["closed", "completed", "cancelled", "canceled", "paid"]);
    const reservationSource =
      existingReservation ||
      existingReservationRef.current ||
      order?.reservation ||
      order;
    const buildReservationRestorePayload = () => {
      const reservationDate = String(
        reservationSource?.reservation_date ?? reservationSource?.reservationDate ?? ""
      ).trim();
      const reservationTime = String(
        reservationSource?.reservation_time ?? reservationSource?.reservationTime ?? ""
      ).trim();
      if (!reservationDate || !reservationTime) return null;
      return {
        table_number:
          resolvedTableNumber ??
          order?.table_number ??
          order?.tableNumber ??
          tableId ??
          null,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        reservation_clients:
          reservationSource?.reservation_clients ??
          reservationSource?.reservationClients ??
          0,
        reservation_notes:
          reservationSource?.reservation_notes ??
          reservationSource?.reservationNotes ??
          "",
        customer_name:
          reservationSource?.customer_name ??
          reservationSource?.customerName ??
          "",
        customer_phone:
          reservationSource?.customer_phone ??
          reservationSource?.customerPhone ??
          "",
      };
    };
    const restoreReservationAndGetTarget = async () => {
      const payload = buildReservationRestorePayload();
      if (!payload) return null;
      const restoreResponse = await txApiRequest(`/orders/reservations${identifier}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const restoredOrder =
        restoreResponse?.reservation && typeof restoreResponse.reservation === "object"
          ? restoreResponse.reservation
          : null;
      const nextId = Number(restoredOrder?.id);
      return Number.isFinite(nextId) && nextId > 0 ? nextId : null;
    };
    const isPaidLikeItem = (item) => {
      if (!item || typeof item !== "object") return false;
      const paymentStatus = String(item?.payment_status ?? item?.paymentStatus ?? "").toLowerCase();
      return Boolean(
        item?.paid ||
          item?.paid_at ||
          item?.paidAt ||
          paymentStatus === "paid" ||
          item?.payment_method ||
          item?.paymentMethod
      );
    };
    const isCancelledLikeItem = (item) => {
      const status = String(item?.kitchen_status || "").toLowerCase();
      return ["cancelled", "canceled", "deleted", "void"].includes(status);
    };

    const statusCandidates = [
      String(existingReservation?.status || "").toLowerCase(),
      String(order?.status || "").toLowerCase(),
    ];
    const shouldRefreshCheckinTarget = statusCandidates.some((status) =>
      closedLikeStatuses.has(status)
    );
    if (shouldRefreshCheckinTarget) {
      try {
        const refreshedTarget = await restoreReservationAndGetTarget();
        if (refreshedTarget) {
          targetOrderId = refreshedTarget;
        } else {
          showToast(t("Failed to restore reservation after table close"));
          return;
        }
      } catch (restoreErr) {
        console.error("❌ Failed to restore reservation before check-in:", restoreErr);
        showToast(restoreErr?.message || t("Failed to restore reservation after table close"));
        return;
      }
    }

    const isConcertReservation = hasConcertBookingContext(
      existingReservation,
      existingReservationRef.current,
      order
    );
    const canCheckInReservation =
      isReservationConfirmedForCheckin(
        existingReservation,
        existingReservationRef.current,
        order
      ) ||
      (isConcertReservation &&
        isConcertBookingConfirmed(existingReservation, existingReservationRef.current, order));
    const isAwaitingConfirmation =
      isReservationPendingConfirmation(existingReservation, existingReservationRef.current, order) &&
      !canCheckInReservation;
    if (isAwaitingConfirmation) {
      showToast(
        isConcertReservation
          ? t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
          : t("Reservation is not confirmed yet. Please confirm booking before check-in.")
      );
      return;
    }

    const shouldUseOrderSnapshot =
      !shouldRefreshCheckinTarget &&
      Number.isFinite(Number(order?.id)) &&
      Number(order?.id) === Number(targetOrderId);
    let activeItemCount =
      shouldUseOrderSnapshot && Array.isArray(order?.items)
        ? order.items.filter((item) => {
            return !isCancelledLikeItem(item);
          }).length
        : null;
    let hasPersistedPaidItems =
      shouldUseOrderSnapshot && Array.isArray(order?.items)
        ? order.items.some((item) => !isCancelledLikeItem(item) && isPaidLikeItem(item))
        : false;

    if (!Number.isFinite(activeItemCount) && Number.isFinite(targetOrderId) && targetOrderId > 0) {
      try {
        const itemsResponse = await txApiRequest(`/orders/${targetOrderId}/items${identifier}`);
        const items = Array.isArray(itemsResponse)
          ? itemsResponse
          : Array.isArray(itemsResponse?.items)
          ? itemsResponse.items
          : Array.isArray(itemsResponse?.data)
          ? itemsResponse.data
          : [];
        activeItemCount = items.filter((item) => {
          return !isCancelledLikeItem(item);
        }).length;
        hasPersistedPaidItems = items.some(
          (item) => !isCancelledLikeItem(item) && isPaidLikeItem(item)
        );
      } catch {
        activeItemCount = null;
      }
    }

    const orderMarkedPaid =
      shouldUseOrderSnapshot &&
      (Boolean(order?.is_paid) ||
        String(order?.payment_status || "").toLowerCase() === "paid" ||
        String(order?.status || "").toLowerCase() === "paid");
    const hasPaidCartItems = Array.isArray(safeCartItems)
      ? safeCartItems.some((item) => !isCancelledLikeItem(item) && isPaidLikeItem(item))
      : false;
    if (orderMarkedPaid || hasPersistedPaidItems || hasPaidCartItems) {
      window.alert(
        t("Paid items found. Please close the table/cart before checking in this reservation.")
      );
      return;
    }

    const localCartCount = Array.isArray(safeCartItems)
      ? safeCartItems.filter((item) => {
          return !isCancelledLikeItem(item);
        }).length
      : 0;
    const totalAmount = shouldUseOrderSnapshot ? Number(order?.total || 0) : 0;
    const hasPersistedItemsOnTable = Number(activeItemCount || 0) > 0 || totalAmount > 0;
    const hasPendingCartItems = hasUnconfirmedCartItems || localCartCount > 0;

    if (hasPendingCartItems) {
      window.alert(
        t("You still have items in cart. Please submit or clear the cart before checking in this reservation.")
      );
      return;
    }

    if (hasPersistedItemsOnTable) {
      const shouldCloseTableFirst = window.confirm(
        t("This table has active items. Close the table now before checking in the reservation?")
      );
      if (shouldCloseTableFirst) {
        try {
          await txApiRequest(`/orders/${targetOrderId}/close${identifier}`, { method: "POST" });
          const refreshedTarget = await restoreReservationAndGetTarget();
          if (!refreshedTarget) {
            showToast(t("Failed to restore reservation after closing the table"));
            return;
          }
          targetOrderId = refreshedTarget;
        } catch (err) {
          console.error("❌ Failed to close table before reservation check-in:", err);
          showToast(err?.message || t("Failed to close table"));
          return;
        }
      } else {
        return;
      }
    }

    setReservationLoading(true);
    try {
      let response = null;
      try {
        response = await txApiRequest(`/orders/${targetOrderId}/reservations/checkin${identifier}`, {
          method: "POST",
        });
      } catch (checkinErr) {
        const statusCode = Number(checkinErr?.details?.status);
        const errorCode = String(checkinErr?.details?.body?.code || "").toLowerCase();
        const isConcertBookingUnconfirmed =
          statusCode === 409 && errorCode === "concert_booking_unconfirmed";
        if (isConcertBookingUnconfirmed) {
          window.alert(
            t("Concert booking is not confirmed yet. Please confirm booking before check-in.")
          );
          return;
        }
        const message = String(checkinErr?.message || "").toLowerCase();
        const shouldRetryAfterRestore =
          statusCode === 404 &&
          message.includes("reservation not found or cannot be checked in");
        if (!shouldRetryAfterRestore) throw checkinErr;
        const refreshedTarget = await restoreReservationAndGetTarget();
        if (!refreshedTarget) throw checkinErr;
        targetOrderId = refreshedTarget;
        response = await txApiRequest(`/orders/${targetOrderId}/reservations/checkin${identifier}`, {
          method: "POST",
        });
      }
      if (response?.success === false) {
        throw new Error(response.message || t("Failed to check in reservation"));
      }

      const responseOrder =
        response?.order && typeof response.order === "object" ? response.order : null;
      const normalizedStatus = responseOrder?.status ?? "checked_in";
      const normalizedStatusLower = String(normalizedStatus || "").toLowerCase();
      const nextOrderTypeSource = responseOrder?.order_type ?? order?.order_type;
      const normalizedOrderType =
        nextOrderTypeSource === "reservation" && normalizedStatusLower !== "reserved"
          ? "table"
          : nextOrderTypeSource;
      const nextReservation =
        mergeReservationCandidate(response?.reservation || responseOrder, existingReservation) ||
        mergeReservationCandidate(
          {
            ...(existingReservation || {}),
            ...(responseOrder || {}),
            status: normalizedStatus,
            order_type: normalizedOrderType,
            table_number:
              responseOrder?.table_number ??
              responseOrder?.tableNumber ??
              order?.table_number ??
              order?.tableNumber ??
              resolvedTableNumber,
          },
          existingReservation
        );

      const normalizedOrder = {
        ...(order && typeof order === "object" ? order : {}),
        ...(responseOrder || {}),
        status: normalizedStatus,
        order_type: normalizedOrderType,
        reservation: nextReservation || existingReservation || null,
        reservation_id:
          nextReservation?.id ??
          responseOrder?.reservation_id ??
          responseOrder?.reservationId ??
          order?.reservation_id ??
          order?.reservationId ??
          null,
        reservationId:
          nextReservation?.id ??
          responseOrder?.reservationId ??
          responseOrder?.reservation_id ??
          order?.reservationId ??
          order?.reservation_id ??
          null,
        reservation_date:
          nextReservation?.reservation_date ??
          responseOrder?.reservation_date ??
          responseOrder?.reservationDate ??
          order?.reservation_date ??
          order?.reservationDate ??
          null,
        reservationDate:
          nextReservation?.reservation_date ??
          responseOrder?.reservationDate ??
          responseOrder?.reservation_date ??
          order?.reservationDate ??
          order?.reservation_date ??
          null,
        reservation_time:
          nextReservation?.reservation_time ??
          responseOrder?.reservation_time ??
          responseOrder?.reservationTime ??
          order?.reservation_time ??
          order?.reservationTime ??
          null,
        reservationTime:
          nextReservation?.reservation_time ??
          responseOrder?.reservationTime ??
          responseOrder?.reservation_time ??
          order?.reservationTime ??
          order?.reservation_time ??
          null,
        reservation_clients:
          nextReservation?.reservation_clients ??
          responseOrder?.reservation_clients ??
          responseOrder?.reservationClients ??
          order?.reservation_clients ??
          order?.reservationClients ??
          null,
        reservationClients:
          nextReservation?.reservation_clients ??
          responseOrder?.reservationClients ??
          responseOrder?.reservation_clients ??
          order?.reservationClients ??
          order?.reservation_clients ??
          null,
        reservation_notes:
          nextReservation?.reservation_notes ??
          responseOrder?.reservation_notes ??
          responseOrder?.reservationNotes ??
          order?.reservation_notes ??
          order?.reservationNotes ??
          null,
        reservationNotes:
          nextReservation?.reservation_notes ??
          responseOrder?.reservationNotes ??
          responseOrder?.reservation_notes ??
          order?.reservationNotes ??
          order?.reservation_notes ??
          null,
      };

      setOrder((prev) => ({ ...(prev || {}), ...normalizedOrder }));
      onReservationStateChange?.(normalizedOrder);
      if (nextReservation) {
        upsertReservationShadow(nextReservation);
        applyReservationState(nextReservation);
      }
      showToast(t("Guest checked in"));
      setShowReservationModal(false);
    } catch (err) {
      console.error("❌ Failed to check in reservation:", err);
      showToast(err?.message || t("Failed to check in reservation"));
    } finally {
      setReservationLoading(false);
    }
  }, [
    existingReservation,
    hasUnconfirmedCartItems,
    identifier,
    onReservationStateChange,
    order,
    order?.id,
    applyReservationState,
    mergeReservationCandidate,
    resolvedTableNumber,
    safeCartItems,
    setOrder,
    showToast,
    t,
    txApiRequest,
  ]);

  const openReservationModal = useCallback(async () => {
    const fallbackReservation = getFallbackReservationForTable(resolvedTableNumber);
    if (order?.id) {
      try {
        const resData = await txApiRequest(`/orders/reservations/${order.id}${identifier}`);
        const nextReservation =
          resData?.success
            ? mergeReservationCandidate(resData?.reservation, fallbackReservation)
            : null;
        if (reservationDebugEnabled) {
          console.log("[reservation] openReservationModal", {
            orderId: order.id,
            reservationResponse: resData,
            fallbackReservation,
            nextReservation,
          });
        }
        if (nextReservation) {
          applyReservationState(nextReservation);
        } else {
          applyReservationState(fallbackReservation);
        }
      } catch (err) {
        console.error("Failed to fetch existing reservation:", err);
        applyReservationState(fallbackReservation);
      }
    } else {
      applyReservationState(fallbackReservation);
    }
    setShowReservationModal(true);
  }, [
    applyReservationState,
    getFallbackReservationForTable,
    identifier,
    mergeReservationCandidate,
    order?.id,
    reservationDebugEnabled,
    resolvedTableNumber,
    txApiRequest,
  ]);

  useEffect(() => {
    if (showReservationModal) return;

    const fallbackReservation = getFallbackReservationForTable(resolvedTableNumber);

    if (!order?.id) {
      applyReservationState(fallbackReservation);
      return;
    }
    const loadReservation = async () => {
      try {
        const resData = await txApiRequest(`/orders/reservations/${order.id}${identifier}`);
        const nextReservation =
          resData?.success
            ? mergeReservationCandidate(resData?.reservation, fallbackReservation)
            : null;
        if (reservationDebugEnabled) {
          console.log("[reservation] effect loadReservation", {
            orderId: order.id,
            reservationResponse: resData,
            fallbackReservation,
            nextReservation,
            showReservationModal,
          });
        }
        if (nextReservation) {
          applyReservationState(nextReservation);
        } else {
          applyReservationState(fallbackReservation);
        }
      } catch (err) {
        console.warn("Failed to load existing reservation:", err);
        applyReservationState(fallbackReservation);
      }
    };
    loadReservation();
  }, [
    applyReservationState,
    getFallbackReservationForTable,
    identifier,
    mergeReservationCandidate,
    order?.id,
    reservationDebugEnabled,
    resolvedTableNumber,
    showReservationModal,
    txApiRequest,
  ]);

  return {
    reservationDate,
    setReservationDate,
    reservationTime,
    setReservationTime,
    reservationClients,
    setReservationClients,
    reservationNotes,
    setReservationNotes,
    reservationCustomerName,
    setReservationCustomerName,
    reservationCustomerPhone,
    setReservationCustomerPhone,
    existingReservation,
    setExistingReservation,
    reservationLoading,
    setReservationLoading,
    showReservationModal,
    setShowReservationModal,
    resetReservationForm,
    handleSaveReservation,
    handleDeleteReservation,
    handleCheckinReservation,
    openReservationModal,
  };
};
