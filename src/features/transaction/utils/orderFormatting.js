import { v4 as uuidv4 } from "uuid";
import { normalizeYmd } from "./transactionUtils";

export const normalizePaidFlag = (value) => {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "t" || normalized === "true" || normalized === "yes";
};

export const formatOrderItems = ({
  items,
  products,
  safeParseExtras,
  orderType,
  orderSource,
}) => {
  const productsById = new Map(
    (Array.isArray(products) ? products : []).map((p) => [String(p?.id), p])
  );

  return (Array.isArray(items) ? items : []).map((item) => {
    let extras = safeParseExtras ? safeParseExtras(item.extras) : [];
    const quantity = parseInt(item.quantity, 10) || 1;

    if (orderType === "table" && orderSource === "qr" && quantity > 1) {
      extras = extras.map((extra) => ({
        ...extra,
        price: (parseFloat(extra.price || extra.extraPrice || 0) / quantity).toFixed(2),
      }));
    }

    const productId = item.product_id ?? item.id;
    const matchedProduct = productsById.get(String(productId));
    const promoStart = normalizeYmd(matchedProduct?.promo_start ?? matchedProduct?.promoStart);
    const promoEnd = normalizeYmd(matchedProduct?.promo_end ?? matchedProduct?.promoEnd);
    const discountType = String(
      matchedProduct?.discount_type ?? matchedProduct?.discountType ?? "none"
    );
    const discountValue = Number(matchedProduct?.discount_value ?? matchedProduct?.discountValue ?? 0);
    const originalPrice = Number(matchedProduct?.price ?? item.price ?? 0) || 0;
    const unitPrice = parseFloat(item.price) || 0;

    return {
      id: productId,
      name: item.name || item.order_item_name || item.product_name || item.productName || "Unnamed",
      category: item.category || null,
      quantity,
      price: unitPrice,
      original_price: originalPrice,
      discount_type: discountType,
      discount_value: discountValue,
      promo_start: promoStart,
      promo_end: promoEnd,
      discount_applied:
        discountType !== "none" &&
        Number.isFinite(originalPrice) &&
        Math.abs(originalPrice - unitPrice) > 0.0001,
      ingredients: Array.isArray(item.ingredients)
        ? item.ingredients
        : typeof item.ingredients === "string"
        ? JSON.parse(item.ingredients || "[]")
        : [],
      extras,
      unique_id: item.unique_id || `${productId}-${JSON.stringify(extras || [])}-${uuidv4()}`,
      confirmed: item.confirmed ?? true,
      paid: !!item.paid_at || normalizePaidFlag(item.paid),
      payment_method: item.payment_method ?? "Unknown",
      note: item.note || "",
      kitchen_status: item.kitchen_status || "",
    };
  });
};

export const mergeWithUnconfirmedItems = (formattedItems, previousCart) => {
  const confirmedKeys = new Set(
    (formattedItems || []).map((item) =>
      String(item.unique_id || `${item.id}-${JSON.stringify(item.extras || [])}`)
    )
  );

  const unconfirmed = (previousCart || []).filter((item) => {
    if (item.confirmed || item.paid) return false;
    const key = String(item.unique_id || `${item.id}-${JSON.stringify(item.extras || [])}`);
    return !confirmedKeys.has(key);
  });

  return [...(formattedItems || []), ...unconfirmed];
};

export const hydrateCartState = ({
  formattedItems,
  setCartItems,
  setReceiptItems,
  mergeUnconfirmed = false,
}) => {
  setCartItems((prev) =>
    mergeUnconfirmed ? mergeWithUnconfirmedItems(formattedItems, prev) : formattedItems || []
  );
  setReceiptItems((formattedItems || []).filter((item) => item.paid));
};
