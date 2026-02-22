export function selectFilteredOrders(orders = [], statusFilter = "all") {
  return (orders || []).filter((order) => {
    if (statusFilter === "all") return true;
    const driverStatus = String(order?.driver_status || "").toLowerCase();
    if (statusFilter === "new") {
      return !driverStatus || driverStatus === "arrived_restaurant";
    }
    if (statusFilter === "on_road") {
      return (
        driverStatus === "on_road" ||
        driverStatus === "picked_up" ||
        driverStatus === "arrived_customer" ||
        driverStatus === "arrived"
      );
    }
    if (statusFilter === "delivered") {
      return driverStatus === "delivered" || order?.status === "closed";
    }
    return true;
  });
}

export function selectRouteOrders(orders = [], selectedDriverId = "") {
  const selectedRaw = String(selectedDriverId || "").trim();
  const hasSelected = selectedRaw !== "";
  if (!hasSelected) return orders;
  return (orders || []).filter((order) => {
    const driverRaw = String(order?.driver_id ?? "").trim();
    if (!driverRaw) return false;
    if (driverRaw === selectedRaw) return true;
    return Number(driverRaw) === Number(selectedRaw);
  });
}

export function selectTotalByMethod(filteredOrders = [], paymentMethodLabels = []) {
  return paymentMethodLabels.reduce((obj, label) => {
    obj[label] = filteredOrders
      .filter(
        (order) =>
          String(order?.payment_method || "").toLowerCase() ===
          String(label || "").toLowerCase()
      )
      .reduce((sum, order) => sum + Number(order?.total || 0), 0);
    return obj;
  }, {});
}

export function selectSafeOrders(filteredOrders = []) {
  return Array.isArray(filteredOrders)
    ? filteredOrders.map((order) => ({ ...order, items: order.items ?? [] }))
    : [];
}

export function selectDrinkSummaryByDriver({
  drivers = [],
  orders = [],
  drinksList = [],
  customerLabel = "Customer",
}) {
  if (!Array.isArray(drivers) || !drivers.length) return [];
  if (!Array.isArray(orders) || !orders.length) return [];

  const normalizeToken = (value = "") =>
    String(value || "").replace(/[\s-]/g, "").toLowerCase();

  const drinkTokens = drinksList.map(normalizeToken).filter(Boolean);
  if (!drinkTokens.length) return [];

  const isDrinkToken = (token) =>
    token &&
    (drinkTokens.includes(token) || drinkTokens.some((entry) => token.includes(entry)));

  return drivers
    .map((driver) => {
      const assignedOrders = orders.filter(
        (order) => Number(order?.driver_id) === Number(driver?.id)
      );
      if (!assignedOrders.length) return null;

      const totalDrinks = new Map();
      const customerGroups = new Map();
      const groupOrder = [];

      const ensureGroup = (order) => {
        const customerRaw = String(order?.customer_name || "").trim();
        const key = customerRaw ? customerRaw.toLowerCase() : `order-${order?.id}`;
        if (!customerGroups.has(key)) {
          customerGroups.set(key, {
            key,
            name: customerRaw || order?.customer_name || customerLabel,
            address: order?.customer_address || "",
            drinks: new Map(),
          });
          groupOrder.push(key);
        }
        return customerGroups.get(key);
      };

      const recordDrink = (group, label, qty = 1) => {
        if (!label) return;
        const normalized = normalizeToken(label);
        if (!isDrinkToken(normalized)) return;

        const amount = Number(qty) || 1;

        const existingGroupDrink = group.drinks.get(normalized);
        if (existingGroupDrink) {
          existingGroupDrink.qty += amount;
          if (label.length > existingGroupDrink.name.length) {
            existingGroupDrink.name = label;
          }
        } else {
          group.drinks.set(normalized, {
            key: normalized,
            name: label,
            qty: amount,
          });
        }

        const existingTotal = totalDrinks.get(normalized);
        if (existingTotal) {
          existingTotal.qty += amount;
          if (label.length > existingTotal.name.length) {
            existingTotal.name = label;
          }
        } else {
          totalDrinks.set(normalized, {
            key: normalized,
            name: label,
            qty: amount,
          });
        }
      };

      assignedOrders.forEach((order) => {
        const group = ensureGroup(order);

        if (!group.address && order?.customer_address) {
          group.address = order.customer_address;
        }
        if ((!group.name || group.name === customerLabel) && order?.customer_name) {
          group.name = order.customer_name;
        }

        (order?.items || []).forEach((item) => {
          const rawName =
            item?.order_item_name || item?.external_product_name || item?.product_name || "";
          recordDrink(group, String(rawName || "").trim(), item?.quantity);

          if (Array.isArray(item?.extras)) {
            item.extras.forEach((extra) => {
              recordDrink(group, String(extra?.name || "").trim(), 1);
            });
          }
        });
      });

      const customers = groupOrder
        .map((key) => {
          const group = customerGroups.get(key);
          const drinks = Array.from(group.drinks.values()).sort((a, b) => b.qty - a.qty);
          return {
            key: group.key,
            name: group.name || customerLabel,
            address: group.address,
            drinks,
          };
        })
        .filter((entry) => entry.drinks.length > 0);

      if (!customers.length) return null;

      return {
        driverId: driver.id,
        driverName: driver.name,
        totals: Array.from(totalDrinks.values()).sort((a, b) => b.qty - a.qty),
        customers,
      };
    })
    .filter(Boolean);
}

export function selectFilteredDrinkSummaryByDriver(drinkSummaryByDriver = [], selectedDriverId = "") {
  const selectedId = Number(selectedDriverId);
  const hasSelectedDriver =
    String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);
  if (!hasSelectedDriver) return drinkSummaryByDriver;
  return drinkSummaryByDriver.filter((entry) => Number(entry?.driverId) === selectedId);
}

export function selectAssignedOrderCount(orders = [], selectedDriverId = "") {
  const list = Array.isArray(orders) ? orders : [];
  const selectedId = Number(selectedDriverId);
  const hasSelectedDriver =
    String(selectedDriverId || "").trim() !== "" && Number.isFinite(selectedId);

  if (hasSelectedDriver) {
    return list.filter((order) => Number(order?.driver_id) === selectedId).length;
  }

  return list.filter((order) => Number.isFinite(Number(order?.driver_id))).length;
}
