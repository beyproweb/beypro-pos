import { useEffect } from "react";

export const useTransactionHeader = ({
  order,
  orderId,
  tableId,
  tableLabelText,
  t,
  setHeader,
}) => {
  useEffect(() => {
    if (!order && !tableId) return;

    const name = order?.customer_name?.trim() || "";
    const phone = order?.customer_phone?.trim() || "";
    const address = order?.customer_address?.trim() || "";

    const status = (order?.status || "").toLowerCase();
    const showCustomerInfo =
      !!orderId &&
      ["confirmed", "paid", "closed"].includes(status) &&
      String(order?.order_type || "").toLowerCase() !== "phone";

    const subtitleText = showCustomerInfo
      ? [name, phone ? `📞 ${phone}` : null, address ? `📍 ${address}` : null]
          .filter(Boolean)
          .join("   ")
      : "";

    const headerTitle = orderId
      ? order?.order_type === "packet"
        ? t("Packet")
        : String(order?.order_type || "").toLowerCase() === "phone"
        ? order?.customer_name?.trim() || t("Phone Order")
        : order?.customer_name || order?.customer_phone || t("Phone Order")
      : `${tableLabelText} ${tableId}`;

    setHeader({
      title: headerTitle,
      subtitle: subtitleText || undefined,
    });

    return () => setHeader({});
  }, [orderId, order, tableId, t, setHeader, tableLabelText]);
};
