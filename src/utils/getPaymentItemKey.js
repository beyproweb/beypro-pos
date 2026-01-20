export const getPaymentItemKey = (item) => {
  if (!item) return "";
  const candidate =
    item.unique_id ?? item.uniqueId ?? item.id ?? item.product_id ?? "";
  if (candidate === null || candidate === undefined) return "";
  const normalized = String(candidate);
  return normalized.trim() === "" ? "" : normalized;
};
