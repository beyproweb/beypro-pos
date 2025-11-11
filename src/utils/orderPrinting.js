import secureFetch from "./secureFetch";

export async function fetchOrderWithItems(orderId, identifier = "") {
  if (!orderId) throw new Error("orderId is required");
  const suffix = identifier || "";
  const order = await secureFetch(`/orders/${orderId}${suffix}`);
  let items = [];
  try {
    items = await secureFetch(`/orders/${orderId}/items${suffix}`);
  } catch (err) {
    console.warn("⚠️ Failed to fetch order items for printing:", err);
  }

  if (Array.isArray(items) && items.length > 0) {
    order.items = items;
  } else if (!Array.isArray(order.items)) {
    order.items = [];
  }

  return order;
}
