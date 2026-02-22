import { useState, useEffect, useCallback } from "react";
import secureFetch from "../../../utils/secureFetch";
import { usePaymentMethods } from "../../../hooks/usePaymentMethods";

export function useQrMenuCheckout({
  storage,
  toArray,
  appendIdentifier,
  getStoredToken,
  getSavedDeliveryInfo,
  t,
  orderType,
  setOrderType,
  orderId,
  setOrderId,
  cart,
  setCart,
  customerInfo,
  setCustomerInfo,
  table,
  safeOccupiedTables,
  orderSelectCustomization,
  activeOrder,
  takeaway,
  setShowDeliveryForm,
  setShowStatus,
  setOrderStatus,
  setLastError,
  setOccupiedTables,
}) {
  const paymentMethods = usePaymentMethods();
  const [paymentMethod, setPaymentMethod] = useState(() => {
    const stored = storage.getItem("qr_payment_method");
    if (stored) return stored;
    return paymentMethods.find((m) => m.enabled !== false)?.id || "online";
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const allowedIds = paymentMethods.map((m) => m.id);
    if (!allowedIds.length) return;
    if (!paymentMethod || !allowedIds.includes(paymentMethod)) {
      setPaymentMethod(allowedIds[0]);
    }
  }, [paymentMethods, paymentMethod]);

  useEffect(() => {
    storage.setItem("qr_payment_method", paymentMethod);
  }, [paymentMethod, storage]);

  const postJSON = useCallback(async (url, body) => {
    try {
      const json = await secureFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "",
        },
        body: JSON.stringify(body),
      });
      return json;
    } catch (err) {
      throw new Error(err.message || "Request failed");
    }
  }, []);

  const buildOrderPayload = useCallback(
    ({ orderType, table, items, total, customer, takeaway, paymentMethod, tableGeo }) => {
      const itemsPayload = (items || []).map((i) => ({
        product_id: i.id,
        quantity: i.quantity,
        price: parseFloat(i.price) || 0,
        ingredients: i.ingredients ?? [],
        extras: i.extras ?? [],
        unique_id: i.unique_id,
        note: i.note || null,
        confirmed: true,
        kitchen_status: "new",
        payment_method: null,
        receipt_id: null,
      }));

      const isTakeaway = orderType === "takeaway";
      const isOnline = orderType === "online";
      const isTable = orderType === "table";

      const pickupDate = takeaway?.pickup_date;
      const pickupTime = takeaway?.pickup_time;
      const combinedPickupTime =
        pickupDate && pickupTime
          ? `${pickupDate} ${pickupTime}`
          : pickupTime || pickupDate || null;
      const isTakeawayDelivery = isTakeaway && !!(takeaway && takeaway.mode === "delivery");

      return {
        table_number: isTable ? Number(table) : null,
        order_type: isOnline ? "packet" : isTakeaway ? "takeaway" : "table",
        total: Number(total) || 0,
        items: itemsPayload,
        table_geo_lat: isTable ? tableGeo?.lat ?? null : null,
        table_geo_lng: isTable ? tableGeo?.lng ?? null : null,
        customer_name: isTakeaway ? takeaway?.name || null : customer?.name || null,
        customer_phone: isTakeaway ? takeaway?.phone || null : customer?.phone || null,
        customer_address: isOnline
          ? customer?.address || null
          : isTakeawayDelivery
            ? takeaway?.address || null
            : null,
        pickup_time: isTakeaway ? combinedPickupTime : null,
        notes: isTakeaway ? takeaway?.notes || null : null,
        payment_method: isOnline ? paymentMethod || null : null,
      };
    },
    []
  );

  const startOnlinePaymentSession = useCallback(
    async (id) => {
      try {
        const res = await secureFetch("/payments/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: id, method: "online" }),
        });

        if (!res.ok) {
          console.error("startOnlinePaymentSession failed:", res.status, await res.text());
          return null;
        }

        const data = await res.json().catch(() => ({}));
        if (data.pay_url) {
          storage.setItem("qr_payment_url", data.pay_url);
          return data.pay_url;
        }
      } catch (e) {
        console.error("startOnlinePaymentSession failed:", e);
      }
      return null;
    },
    [storage]
  );

  const handleSubmitOrder = useCallback(async (overrideItems = null, options = {}) => {
    try {
      setLastError(null);
      const paymentMethodOverride =
        typeof options?.paymentMethodOverride === "string"
          ? options.paymentMethodOverride
          : null;
      const effectivePaymentMethod = paymentMethodOverride || paymentMethod;

      const type = orderType || storage.getItem("qr_orderType");
      if (!type) {
        window.dispatchEvent(new Event("qr:cart-close"));
        alert(t("Please choose an order type first."));
        return;
      }
      if (!orderType) {
        setOrderType(type);
      }

      const hasActiveOnline = type === "online" && (orderId || storage.getItem("qr_active_order_id"));
      let deliveryInfo = customerInfo;
      if (type === "online") {
        if (!deliveryInfo || !deliveryInfo.address) {
          const savedDelivery = getSavedDeliveryInfo();
          if (savedDelivery && savedDelivery.address) {
            deliveryInfo = savedDelivery;
            setCustomerInfo(savedDelivery);
          } else {
            window.dispatchEvent(new Event("qr:cart-close"));
            setShowDeliveryForm(true);
            return;
          }
        }
      }

      if (type === "online" && !effectivePaymentMethod) {
        alert(t("Please select a payment method before continuing."));
        return;
      }

      setSubmitting(true);
      setOrderStatus("pending");
      setShowStatus(true);

      const usingOverrideItems = Array.isArray(overrideItems);
      const baseItems = usingOverrideItems
        ? overrideItems
        : toArray(cart).filter((i) => !i.locked);
      const newItems = toArray(baseItems).map((item, index) => {
        const rawId = item?.id ?? item?.productId ?? item?.product_id ?? null;
        const extras = toArray(item?.extras).map((extra) => ({
          ...extra,
          name: extra?.name || "",
          quantity: Math.max(1, Number(extra?.quantity) || 1),
          price: parseFloat(extra?.price ?? extra?.extraPrice ?? 0) || 0,
          extraPrice: parseFloat(extra?.price ?? extra?.extraPrice ?? 0) || 0,
        }));
        return {
          ...item,
          id: rawId,
          product_id: rawId,
          quantity: Math.max(1, Number(item?.quantity ?? item?.qty) || 1),
          price: parseFloat(item?.price ?? item?.unitPrice ?? 0) || 0,
          ingredients: toArray(item?.ingredients),
          extras,
          unique_id:
            item?.unique_id ||
            `${rawId || "voice"}-direct-${Date.now().toString(36)}-${index}`,
          note: item?.note || item?.notes || null,
          locked: Boolean(item?.locked),
        };
      });
      if (newItems.length === 0) {
        setOrderStatus("success");
        setShowStatus(true);
        return;
      }

      if (type === "table" && !table) {
        throw new Error("Please select a table.");
      }

      if (!orderId && type === "table") {
        const nTable = Number(table);
        if (safeOccupiedTables.includes(nTable)) {
          throw new Error("This table is currently occupied. Please contact staff.");
        }
      }

      let tableGeo = null;
      if (type === "table" && orderSelectCustomization.table_geo_enabled) {
        if (!navigator?.geolocation) {
          throw new Error("Location is required for table orders. Please rescan at the restaurant.");
        }
        tableGeo = await new Promise((resolve, reject) => {
          const timeoutMs = 10000;
          const timeoutId = window.setTimeout(() => {
            reject(new Error("Location request timed out. Please rescan at the restaurant."));
          }, timeoutMs);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              window.clearTimeout(timeoutId);
              resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {
              window.clearTimeout(timeoutId);
              reject(new Error("Location permission is required for table orders."));
            },
            { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
          );
        });
      }

      if (orderId) {
        let existingOrder = activeOrder;
        if (!existingOrder) {
          try {
            const res = await secureFetch(appendIdentifier(`/orders/${orderId}`));
            existingOrder = res;
          } catch (err) {
            console.warn("Could not fetch existing order:", err);
          }
        }

        const isOrderAlreadyPaid = existingOrder && (
          existingOrder.is_paid === true ||
          (existingOrder.status || "").toLowerCase() === "paid" ||
          (existingOrder.payment_status || "").toLowerCase() === "paid"
        );

        const itemsPayload = newItems.map((i) => ({
          product_id: i.id,
          quantity: i.quantity,
          price: parseFloat(i.price) || 0,
          ingredients: i.ingredients ?? [],
          extras: i.extras ?? [],
          unique_id: i.unique_id,
          note: i.note || null,
          confirmed: true,
          payment_method:
            effectivePaymentMethod === "online" ? "Online" : effectivePaymentMethod,
          receipt_id: null,
        }));

        await postJSON(appendIdentifier("/orders/order-items"), {
          order_id: orderId,
          receipt_id: null,
          items: itemsPayload,
          table_geo_lat: tableGeo?.lat ?? null,
          table_geo_lng: tableGeo?.lng ?? null,
        });

        try {
          await secureFetch(appendIdentifier(`/orders/${orderId}/status`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_method: effectivePaymentMethod }),
          });
        } catch {}

        if (effectivePaymentMethod === "online") {
          await startOnlinePaymentSession(orderId);
        }

        if (!usingOverrideItems) {
          setCart((prev) => toArray(prev).filter((i) => i.locked));
        }

        storage.setItem(
          "qr_active_order",
          JSON.stringify({
            orderId,
            orderType: type,
            table: type === "table" ? table : null,
          })
        );
        storage.setItem("qr_active_order_id", String(orderId));
        if (type === "table" && table) storage.setItem("qr_table", String(table));
        storage.setItem("qr_orderType", type);
        storage.setItem("qr_payment_method", effectivePaymentMethod);
        storage.setItem("qr_show_status", "1");

        setOrderStatus("success");
        setShowStatus(true);
        return;
      }

      const total = newItems.reduce((sum, item) => {
        const extrasTotal = (item.extras || []).reduce(
          (s, ex) =>
            s + (parseFloat(ex.price ?? ex.extraPrice ?? 0) || 0) * (ex.quantity || 1),
          0
        );
        return sum + (parseFloat(item.price) + extrasTotal) * (item.quantity || 1);
      }, 0);

      const created = await postJSON(
        appendIdentifier("/orders"),
        buildOrderPayload({
          orderType: type,
          table,
          items: newItems,
          total,
          customer: type === "online" ? deliveryInfo || customerInfo : null,
          takeaway: type === "takeaway" ? takeaway : null,
          paymentMethod: effectivePaymentMethod,
          tableGeo,
        })
      );

      const newId = created?.id;
      if (!newId) throw new Error("Server did not return order id.");

      if (effectivePaymentMethod === "online") {
        await startOnlinePaymentSession(newId);
        try {
          await secureFetch(appendIdentifier(`/orders/${newId}/status`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "paid",
              payment_method: "Online",
              total,
            }),
          });
          console.log("✅ Order marked Paid Online");
        } catch (err) {
          console.error("❌ Failed to mark online order as paid:", err);
        }
      }

      setOrderId(newId);
      if (type === "table" && table) {
        const nTable = Number(table);
        if (Number.isFinite(nTable) && nTable > 0) {
          setOccupiedTables((prev) => {
            const next = new Set(toArray(prev).map(Number));
            next.add(nTable);
            return Array.from(next);
          });
        }
      }
      storage.setItem(
        "qr_active_order",
        JSON.stringify({
          orderId: newId,
          orderType: type,
          table: type === "table" ? table : null,
        })
      );
      storage.setItem("qr_active_order_id", String(newId));
      if (type === "table" && table) storage.setItem("qr_table", String(table));
      storage.setItem("qr_orderType", type);
      storage.setItem("qr_payment_method", effectivePaymentMethod);
      storage.setItem("qr_show_status", "1");

      if (!usingOverrideItems) {
        setCart([]);
      }
      setOrderStatus("success");
      setShowStatus(true);
    } catch (e) {
      console.error("Order submit failed:", e);
      setLastError(e.message || "Order failed");
      setOrderStatus("fail");
      setShowStatus(true);
    } finally {
      setSubmitting(false);
    }
  }, [
    activeOrder,
    appendIdentifier,
    cart,
    customerInfo,
    getSavedDeliveryInfo,
    orderId,
    orderSelectCustomization.table_geo_enabled,
    orderType,
    paymentMethod,
    safeOccupiedTables,
    setCart,
    setCustomerInfo,
    setLastError,
    setOccupiedTables,
    setOrderId,
    setOrderStatus,
    setOrderType,
    setShowDeliveryForm,
    setShowStatus,
    startOnlinePaymentSession,
    storage,
    table,
    takeaway,
    t,
    toArray,
    buildOrderPayload,
    postJSON,
  ]);

  return {
    paymentMethod,
    setPaymentMethod,
    submitting,
    setSubmitting,
    handleSubmitOrder,
  };
}

export default useQrMenuCheckout;
