import { isPacketLikeOrder } from "../../shared/guards";
import { normalizePaymentKey } from "../../shared/formatters";
import {
  calcDiscountedTotal,
  calcOrderDiscount,
  calcOrderTotalWithExtras,
} from "../../shared/orderMath";
export { calcDiscountedTotal, calcOrderDiscount, calcOrderTotalWithExtras };

export function resolveAutoClosePaymentMethod({
  order,
  transactionSettings,
  methodOptionSource,
  fallbackMethodLabel,
}) {
  const methodsSetting = transactionSettings?.autoClosePacketAfterPayMethods;
  const allowsAll = methodsSetting === null || typeof methodsSetting === "undefined";
  const allowedIds = Array.isArray(methodsSetting) ? methodsSetting.filter(Boolean) : null;

  const idToLabel = new Map(
    (methodOptionSource || []).map((m) => [String(m.id || ""), String(m.label || m.id || "")])
  );

  const raw = String(order?.payment_method || "").trim();
  const tokens = raw
    ? raw
        .split(/[+,]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

  const matchedIds = tokens
    .map((token) => {
      const norm = normalizePaymentKey(token);
      const match = (methodOptionSource || []).find((m) => {
        const idNorm = normalizePaymentKey(m.id);
        const labelNorm = normalizePaymentKey(m.label);
        return idNorm === norm || labelNorm === norm;
      });
      return match?.id || null;
    })
    .filter(Boolean);

  const pickId = () => {
    if (allowsAll) return matchedIds[0] || "";
    if (!Array.isArray(allowedIds)) return matchedIds[0] || "";
    const allowedMatch = matchedIds.find((id) => allowedIds.includes(id));
    if (allowedMatch) return allowedMatch;
    return allowedIds[0] || "";
  };

  const id = pickId();
  if (id) {
    return { id, label: idToLabel.get(String(id)) || String(id) };
  }

  return { id: "", label: tokens[0] || fallbackMethodLabel };
}

export function shouldAutoClosePacketOnDelivered({
  order,
  transactionSettings,
  methodOptionSource,
}) {
  if (!transactionSettings?.autoClosePacketAfterPay) return false;
  if (!order) return false;

  if (!isPacketLikeOrder(order?.order_type)) return false;

  const methodsSetting = transactionSettings?.autoClosePacketAfterPayMethods;
  const allowsAll = methodsSetting === null || typeof methodsSetting === "undefined";
  if (allowsAll) return true;
  if (!Array.isArray(methodsSetting)) return true;
  if (methodsSetting.length === 0) return false;

  const raw = String(order?.payment_method || "").trim();
  const tokens = raw
    ? raw
        .split(/[+,]/)
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

  const usedIds = tokens
    .map((token) => {
      const norm = normalizePaymentKey(token);
      const match = (methodOptionSource || []).find((m) => {
        const idNorm = normalizePaymentKey(m.id);
        const labelNorm = normalizePaymentKey(m.label);
        return idNorm === norm || labelNorm === norm;
      });
      return match?.id || null;
    })
    .filter(Boolean);

  if (usedIds.length === 0) return true;
  return usedIds.some((id) => methodsSetting.includes(id));
}

export function rebalanceTwoWaySplit(prev, index, value, grandTotal) {
  const copy = [...prev];
  copy[index].amount = value;

  if (prev.length === 2) {
    const otherIdx = index === 0 ? 1 : 0;
    const thisVal = Number(value || 0);
    const otherVal = Math.max(grandTotal - thisVal, 0);
    copy[otherIdx].amount = otherVal === 0 ? "" : otherVal.toFixed(2);
  }

  return copy;
}
