import { useCallback, useEffect, useState } from "react";

export const useReservation = ({
  order,
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
  onReservationDeleted,
}) => {
  const [reservationDate, setReservationDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [reservationTime, setReservationTime] = useState("");
  const [reservationClients, setReservationClients] = useState("2");
  const [reservationNotes, setReservationNotes] = useState("");
  const [existingReservation, setExistingReservation] = useState(null);
  const [reservationLoading, setReservationLoading] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);

  const resetReservationForm = useCallback(() => {
    setReservationDate(new Date().toISOString().split("T")[0]);
    setReservationTime("");
    setReservationClients("2");
    setReservationNotes("");
  }, []);

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

      setExistingReservation(savedReservation);
      setReservationDate(savedReservation.reservation_date || reservationDate);
      setReservationTime(savedReservation.reservation_time || reservationTime);
      setReservationClients(savedReservation.reservation_clients?.toString() || reservationClients);
      setReservationNotes(savedReservation.reservation_notes || reservationNotes);
      showToast(t("Reservation saved"));
      setShowReservationModal(false);

      if (!existingReservation) {
        if (hasUnconfirmedCartItems) {
          const cartTotal = safeCartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
          const updated = await updateOrderStatus("confirmed", cartTotal);
          if (updated) {
            const unconfirmedItems = safeCartItems.filter((i) => !i.confirmed);
            if (unconfirmedItems.length > 0) {
              await txApiRequest(`/orders/order-items${identifier}`, {
                method: "POST",
                body: JSON.stringify({
                  order_id: updated.id,
                  receipt_id: null,
                  items: unconfirmedItems.map((i) => ({
                    product_id: i.id,
                    quantity: i.quantity,
                    price: i.price,
                    ingredients: i.ingredients,
                    extras: (i.extras || []).map((ex) => ({
                      ...ex,
                      amount: Number(ex.amount) || 1,
                      unit: (ex.unit && ex.unit.trim() !== "" ? ex.unit : "").toLowerCase(),
                    })),
                    unique_id: i.unique_id,
                    note: i.note || null,
                    confirmed: true,
                    kitchen_status: "new",
                    payment_method: null,
                    receipt_id: null,
                    discountType: discountValue > 0 ? discountType : null,
                    discountValue: discountValue > 0 ? discountValue : 0,
                  })),
                }),
              });
            }
            setOrder((prev) => ({ ...prev, status: "reserved" }));
            await fetchOrderItems(updated.id);
          } else {
            showToast(t("Failed to confirm order items"));
          }
        } else if (order?.id) {
          await updateOrderStatus("reserved", 0);
          setOrder((prev) => ({ ...prev, status: "reserved" }));
          try {
            const cacheKey = `table_orders_${restaurantId}_v1`;
            window?.localStorage?.removeItem(cacheKey);
            window?.localStorage?.removeItem(`${cacheKey}_ts`);
          } catch {
            // ignore cache errors
          }
          showToast(t("✅ Table reserved successfully"));
          setShowReservationModal(false);
          resetReservationForm();
          setReservationLoading(false);
          debugNavigate("/tableoverview?tab=tables");
          return;
        }
      }
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
    order?.id,
    existingReservation,
    txApiRequest,
    identifier,
    showToast,
    t,
    hasUnconfirmedCartItems,
    safeCartItems,
    updateOrderStatus,
    fetchOrderItems,
    setOrder,
    discountValue,
    discountType,
    restaurantId,
    debugNavigate,
    resetReservationForm,
  ]);

  const handleDeleteReservation = useCallback(async () => {
    if (!existingReservation?.reservation_date) return;
    const ok = window.confirm(t("Delete this reservation?"));
    if (!ok) return;
    setReservationLoading(true);
    try {
      const response = await txApiRequest(`/orders/${order.id}/reservations${identifier}`, {
        method: "DELETE",
      });
      if (response?.success === false) throw new Error(response.message || t("Failed to delete reservation"));

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
      onReservationDeleted?.(normalizedOrder);

      setExistingReservation(null);
      resetReservationForm();
      showToast(t("Reservation deleted"));
      setShowReservationModal(false);
    } catch (err) {
      console.error("❌ Failed to delete reservation:", err);
      showToast(err?.message || t("Failed to delete reservation"));
    } finally {
      setReservationLoading(false);
    }
  }, [
    existingReservation,
    identifier,
    onReservationDeleted,
    order,
    order?.id,
    resetReservationForm,
    setOrder,
    showToast,
    t,
    txApiRequest,
  ]);

  const openReservationModal = useCallback(async () => {
    if (order?.id) {
      try {
        const existing = await txApiRequest(`/orders/${order.id}${identifier}`);
        if (existing?.reservation_date) {
          setExistingReservation(existing);
          setReservationDate(existing.reservation_date || "");
          setReservationTime(existing.reservation_time || "");
          setReservationClients(existing.reservation_clients?.toString() || "2");
          setReservationNotes(existing.reservation_notes || "");
        } else {
          resetReservationForm();
          setExistingReservation(null);
        }
      } catch (err) {
        console.error("Failed to fetch existing reservation:", err);
        resetReservationForm();
        setExistingReservation(null);
      }
    }
    setShowReservationModal(true);
  }, [order?.id, txApiRequest, identifier, resetReservationForm]);

  useEffect(() => {
    if (!order?.id) {
      setExistingReservation(null);
      resetReservationForm();
      return;
    }
    const loadReservation = async () => {
      try {
        const resData = await txApiRequest(`/orders/reservations/${order.id}${identifier}`);
        if (resData?.success && resData?.reservation) {
          setExistingReservation(resData.reservation);
          setReservationDate(resData.reservation.reservation_date || "");
          setReservationTime(resData.reservation.reservation_time || "");
          setReservationClients(resData.reservation_clients?.toString() || "2");
          setReservationNotes(resData.reservation_notes || "");
        } else {
          setExistingReservation(null);
          resetReservationForm();
        }
      } catch (err) {
        console.warn("Failed to load existing reservation:", err);
        setExistingReservation(null);
        resetReservationForm();
      }
    };
    loadReservation();
  }, [order?.id, identifier, txApiRequest, resetReservationForm]);

  return {
    reservationDate,
    setReservationDate,
    reservationTime,
    setReservationTime,
    reservationClients,
    setReservationClients,
    reservationNotes,
    setReservationNotes,
    existingReservation,
    setExistingReservation,
    reservationLoading,
    setReservationLoading,
    showReservationModal,
    setShowReservationModal,
    resetReservationForm,
    handleSaveReservation,
    handleDeleteReservation,
    openReservationModal,
  };
};
