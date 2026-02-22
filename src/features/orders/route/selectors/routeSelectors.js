export function buildStopsFromOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).map((order) => ({
    orderId: order?.id,
    label: order?.customer_name || "",
    address: order?.customer_address || order?.address || order?.delivery_address || "",
    lat: Number(order?.delivery_lat || order?.delivery_latitude || order?.lat || order?.latitude),
    lng: Number(order?.delivery_lng || order?.delivery_longitude || order?.lng || order?.longitude),
  }));
}

export function groupOrdersByDriver(orders = []) {
  return (Array.isArray(orders) ? orders : []).reduce((groups, order) => {
    const driverKey = String(order?.driver_id || "unassigned");
    if (!groups[driverKey]) groups[driverKey] = [];
    groups[driverKey].push(order);
    return groups;
  }, {});
}

export function computeDriverStats(groupedOrders = {}) {
  return Object.entries(groupedOrders || {}).map(([driverId, entries]) => {
    const orders = Array.isArray(entries) ? entries : [];
    const totals = orders.reduce(
      (acc, order) => {
        acc.orders += 1;
        acc.delivered += String(order?.driver_status || "").toLowerCase() === "delivered" ? 1 : 0;
        acc.total += Number(order?.total || 0);
        return acc;
      },
      { orders: 0, delivered: 0, total: 0 }
    );

    return {
      driverId,
      orders: totals.orders,
      delivered: totals.delivered,
      total: totals.total,
    };
  });
}

export function computeStopsSummary(stops = []) {
  const list = Array.isArray(stops) ? stops : [];
  const customerStops = list.filter((_, idx) => idx > 0);
  const delivered = customerStops.filter((stop) =>
    Boolean(stop?.delivered || stop?.status === "delivered" || stop?.status === "completed")
  ).length;

  return {
    total: customerStops.length,
    delivered,
    pending: Math.max(customerStops.length - delivered, 0),
  };
}

export function selectSelectedDriver(drivers = [], selectedDriverId = "") {
  const selectedRaw = String(selectedDriverId || "").trim();
  const selectedIdNum = Number(selectedRaw);
  const hasSelectedDriver = selectedRaw !== "";

  if (!hasSelectedDriver) {
    return {
      selectedIdNum,
      hasSelectedDriver,
      selectedDriver: null,
    };
  }

  return {
    selectedIdNum,
    hasSelectedDriver,
    selectedDriver: (Array.isArray(drivers) ? drivers : []).find(
      (driver) => {
        const driverRaw = String(driver?.id ?? "").trim();
        if (!driverRaw) return false;
        if (driverRaw === selectedRaw) return true;
        return Number(driverRaw) === selectedIdNum;
      }
    ) || null,
  };
}

export function selectRouteOrdersForMap(
  routeOrders = [],
  filteredOrders = [],
  selectedDriverId = ""
) {
  const route = Array.isArray(routeOrders) ? routeOrders : [];
  const filtered = Array.isArray(filteredOrders) ? filteredOrders : [];
  const hasSelectedDriver = String(selectedDriverId || "").trim() !== "";

  if (hasSelectedDriver) return route;
  return route.length ? route : filtered;
}
