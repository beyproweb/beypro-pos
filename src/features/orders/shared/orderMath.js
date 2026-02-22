export function calcOrderTotalWithExtras(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty;
    const extras =
      (item.extras || []).reduce(
        (s, ex) => s + Number(ex.price || ex.extraPrice || 0) * (Number(ex.quantity) || 1),
        0
      ) * qty;
    return sum + base + extras;
  }, 0);
}

export function calcOrderDiscount(order) {
  if (!order?.items) return 0;
  return order.items.reduce((sum, item) => {
    const qty = Number(item?.quantity) || 1;
    const rawPrice = Number(item?.price) || 0;
    const unitPrice =
      Number(item?.unit_price) || (order?.external_id ? rawPrice / qty : rawPrice);
    const base = unitPrice * qty;
    const dv = Number(item?.discount_value) || 0;
    const dt = item?.discount_type;
    if (dv <= 0) return sum;
    if (dt === "percent") return sum + base * (dv / 100);
    if (dt === "fixed") return sum + dv;
    return sum;
  }, 0);
}

export function calcDiscountedTotal(order) {
  return calcOrderTotalWithExtras(order) - calcOrderDiscount(order);
}
