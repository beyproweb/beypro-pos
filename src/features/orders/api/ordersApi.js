export async function fetchOpenPhoneOrdersApi(secureFetch, requestOptions = {}) {
  return secureFetch("/orders?status=open_phone", requestOptions);
}

export async function fetchOrderItemsApi(secureFetch, orderId, requestOptions = {}) {
  return secureFetch(`/orders/${orderId}/items`, requestOptions);
}

export async function fetchDriversApi(secureFetch, requestOptions = {}) {
  return secureFetch("/staff/drivers", requestOptions);
}

export async function fetchCurrentRestaurantApi(secureFetch, requestOptions = {}) {
  return secureFetch("/me", requestOptions);
}

export async function fetchIntegrationsSettingsApi(secureFetch, requestOptions = {}) {
  return secureFetch("/settings/integrations", requestOptions);
}

export async function fetchKitchenCompileSettingsApi(secureFetch, requestOptions = {}) {
  return secureFetch("/kitchen/compile-settings", requestOptions);
}

export async function fetchProductsApi(secureFetch, requestOptions = {}) {
  return secureFetch("/products", requestOptions);
}

export async function fetchDriverReportApi(secureFetch, { driverId, date }, requestOptions = {}) {
  return secureFetch(`/orders/driver-report?driver_id=${driverId}&date=${date}`, requestOptions);
}

export async function confirmOnlineOrderApi(secureFetch, orderId, requestOptions = {}) {
  return secureFetch(`/orders/${orderId}/confirm-online`, { method: "POST", ...requestOptions });
}

export async function updateOrderApi(secureFetch, orderId, payload, requestOptions = {}) {
  return secureFetch(`/orders/${orderId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    ...requestOptions,
  });
}

export async function patchOrderDriverStatusApi(
  secureFetch,
  orderId,
  payload,
  options = {}
) {
  const { withJsonHeader = false, requestOptions = {} } = options;
  const extraHeaders = withJsonHeader ? { "Content-Type": "application/json" } : {};
  return secureFetch(`/orders/${orderId}/driver-status`, {
    method: "PATCH",
    ...requestOptions,
    headers: { ...(requestOptions.headers || {}), ...extraHeaders },
    body: JSON.stringify(payload),
  });
}

export async function closeOrderApi(secureFetch, orderId, requestOptions = {}) {
  return secureFetch(`/orders/${orderId}/close`, { method: "POST", ...requestOptions });
}

export async function createReceiptMethodsApi(secureFetch, payload, requestOptions = {}) {
  return secureFetch(`/orders/receipt-methods`, {
    method: "POST",
    ...requestOptions,
    headers: { "Content-Type": "application/json", ...(requestOptions.headers || {}) },
    body: JSON.stringify(payload),
  });
}

export async function fetchReceiptMethodsApi(secureFetch, receiptId, requestOptions = {}) {
  return secureFetch(`/orders/receipt-methods/${receiptId}`, requestOptions);
}

export async function cancelOrderApi(secureFetch, orderId, payload, requestOptions = {}) {
  return secureFetch(`/orders/${orderId}/cancel`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    ...requestOptions,
  });
}
