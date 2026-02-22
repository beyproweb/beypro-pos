import { normalizeGroupKey } from "../../transactions/utils/normalization";

export const CATEGORY_FALLBACK_IMAGE = "/Beylogo.svg";

export const deriveExtrasGroupRefs = (product) => {
  if (!product || typeof product !== "object") return null;

  const ids = new Set();
  const names = new Set();

  const addId = (value) => {
    const num = Number(value);
    if (Number.isFinite(num)) ids.add(num);
  };

  const addName = (value) => {
    const norm = normalizeGroupKey(value);
    if (norm) names.add(norm);
  };

  const extrasRefs = product.extrasGroupRefs || {};
  const extrasIds = Array.isArray(extrasRefs.ids) ? extrasRefs.ids : [];
  const extrasNames = Array.isArray(extrasRefs.names) ? extrasRefs.names : [];

  extrasIds.forEach(addId);
  extrasNames.forEach(addName);

  const selectionIds = Array.isArray(product.selectedExtrasGroup)
    ? product.selectedExtrasGroup
    : Array.isArray(product.selected_extras_group)
    ? product.selected_extras_group
    : [];
  selectionIds.forEach(addId);

  const selectionNames = Array.isArray(product.selectedExtrasGroupNames)
    ? product.selectedExtrasGroupNames
    : [];
  selectionNames.forEach(addName);

  if (ids.size === 0 && names.size === 0) return null;

  return {
    ids: Array.from(ids),
    names: Array.from(names),
  };
};

export const normalizeSuborderItems = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("⚠️ Failed to parse suborder items", err);
      return [];
    }
  }
  return [];
};

export const isCancelledStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
};

export const resolveItemPaymentMethod = (order, item) => {
  const direct = item?.payment_method || item?.paymentMethod || item?.method || "";
  const normalizedDirect = typeof direct === "string" ? direct.trim() : "";
  if (normalizedDirect) return normalizedDirect;

  const singleReceiptMethod =
    Array.isArray(order?.receiptMethods) && order.receiptMethods.length === 1
      ? (order.receiptMethods[0]?.payment_method || "").trim()
      : "";
  if (singleReceiptMethod) return singleReceiptMethod;

  return (order?.payment_method || "").trim();
};

export const normalizeOrderStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return normalized === "occupied" ? "confirmed" : normalized;
};

export const isActiveTableStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return !["closed", "cancelled", "canceled"].includes(normalized);
};

export const isPaidItem = (item) => Boolean(item && (item.paid || item.paid_at));

export const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const normalizeYmd = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const datePart = raw.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalYmd(parsed);
};

export const isPromoActiveToday = (promoStartYmd, promoEndYmd) => {
  const start = normalizeYmd(promoStartYmd);
  const end = normalizeYmd(promoEndYmd);
  if (!start && !end) return true;

  const today = toLocalYmd(new Date());
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
};

export const computeDiscountedUnitPrice = (product) => {
  const originalPrice = Number(
    product?.original_price ?? product?.originalPrice ?? product?.price ?? 0
  );
  const discountType = String(product?.discount_type ?? product?.discountType ?? "none");
  const discountValue = Number(product?.discount_value ?? product?.discountValue ?? 0);
  const promoStart = normalizeYmd(product?.promo_start ?? product?.promoStart);
  const promoEnd = normalizeYmd(product?.promo_end ?? product?.promoEnd);

  const isActiveWindow = isPromoActiveToday(promoStart, promoEnd);
  const shouldApply =
    discountType !== "none" &&
    discountValue > 0 &&
    (!promoStart && !promoEnd ? true : isActiveWindow);

  let finalPrice = originalPrice;
  let applied = false;

  if (shouldApply && originalPrice > 0) {
    if (discountType === "percentage") {
      finalPrice = Math.max(0, originalPrice * (1 - discountValue / 100));
      applied = finalPrice < originalPrice;
    } else if (discountType === "fixed") {
      finalPrice = Math.max(0, originalPrice - discountValue);
      applied = finalPrice < originalPrice;
    }
  }

  return {
    unitPrice: Number.isFinite(finalPrice) ? finalPrice : originalPrice,
    originalPrice,
    discountType,
    discountValue,
    promoStart,
    promoEnd,
    discountApplied: applied,
  };
};
