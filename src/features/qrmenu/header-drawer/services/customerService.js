const STORAGE_KEYS = {
  session: "qr_customer_session",
  users: "qr_customer_users",
  checkoutInfo: "qr_delivery_info",
  orderHistory: "qr_customer_orders",
};

const ACTIVE_ORDER_STATUSES = new Set([
  "new",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "open",
  "reserved",
]);

function parseJSON(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getStorage(storage) {
  if (storage && typeof storage.getItem === "function") return storage;
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  return null;
}

function emitSessionChange(customer) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("qr:customer-session-changed", {
      detail: { customer: sanitizeCustomer(customer) },
    })
  );
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function sanitizeCustomer(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: normalizeText(user.id),
    email: normalizeEmail(user.email),
    username: normalizeText(user.username),
    phone: normalizePhone(user.phone),
    address: normalizeText(user.address),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function getUsers(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return [];
  const list = parseJSON(storage.getItem(STORAGE_KEYS.users) || "[]", []);
  return Array.isArray(list) ? list : [];
}

function saveUsers(users, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;
  storage.setItem(STORAGE_KEYS.users, JSON.stringify(Array.isArray(users) ? users : []));
}

function saveSession(customer, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;
  const sanitized = sanitizeCustomer(customer);
  if (!sanitized) {
    storage.removeItem(STORAGE_KEYS.session);
    emitSessionChange(null);
    return;
  }
  storage.setItem(STORAGE_KEYS.session, JSON.stringify(sanitized));
  emitSessionChange(sanitized);
}

function getSession(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const session = parseJSON(storage.getItem(STORAGE_KEYS.session) || "null", null);
  return sanitizeCustomer(session);
}

function upsertCheckoutInfo(customer, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage || !customer) return;

  const existing = parseJSON(storage.getItem(STORAGE_KEYS.checkoutInfo) || "null", null);
  const next = {
    name: normalizeText(customer.username) || normalizeText(existing?.name),
    phone: normalizePhone(customer.phone) || normalizePhone(existing?.phone),
    email: normalizeEmail(customer.email) || normalizeEmail(existing?.email),
    address: normalizeText(customer.address) || normalizeText(existing?.address),
    payment_method: normalizeText(existing?.payment_method),
  };

  storage.setItem(STORAGE_KEYS.checkoutInfo, JSON.stringify(next));
}

function matchesCustomer(order, customer) {
  if (!order || !customer) return false;
  const orderEmail = normalizeEmail(order.customer_email || order.email);
  const orderPhone = normalizePhone(order.customer_phone || order.phone);
  const orderName = normalizeText(order.customer_name || order.username || order.name).toLowerCase();

  if (customer.email && orderEmail && customer.email === orderEmail) return true;
  if (customer.phone && orderPhone && customer.phone === orderPhone) return true;
  if (customer.username && orderName && customer.username.toLowerCase() === orderName) return true;
  return false;
}

function normalizeOrderRecord(order) {
  if (!order || typeof order !== "object") return null;

  const status = normalizeText(order.status || order.order_status || "pending").toLowerCase();
  const createdAt =
    order.created_at ||
    order.createdAt ||
    order.updated_at ||
    order.updatedAt ||
    new Date().toISOString();

  const items = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.order_items)
    ? order.order_items
    : [];

  const itemCount = Number(order.items_count || order.item_count || items.length || 0) || 0;

  return {
    id: String(order.id || order.order_id || order.orderId || `local-${Date.now()}`),
    status,
    total: Number(order.total || order.grand_total || 0) || 0,
    currency: normalizeText(order.currency || ""),
    createdAt,
    itemCount,
    orderType: normalizeText(order.order_type || order.orderType || ""),
    customer_name: normalizeText(order.customer_name || order.name),
    customer_phone: normalizePhone(order.customer_phone || order.phone),
    customer_email: normalizeEmail(order.customer_email || order.email),
    source: normalizeText(order.source || "api"),
  };
}

function dedupeOrders(orders) {
  const map = new Map();
  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const normalized = normalizeOrderRecord(order);
    if (!normalized) return;
    const key = String(normalized.id || "");
    if (!key) return;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalized);
      return;
    }

    const existingTs = Date.parse(existing.createdAt || 0) || 0;
    const nextTs = Date.parse(normalized.createdAt || 0) || 0;
    if (nextTs >= existingTs) {
      map.set(key, { ...existing, ...normalized });
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const ta = Date.parse(a.createdAt || 0) || 0;
    const tb = Date.parse(b.createdAt || 0) || 0;
    return tb - ta;
  });
}

export function getCustomerSession(storageArg) {
  return getSession(storageArg);
}

export function registerCustomer(payload, storageArg) {
  const users = getUsers(storageArg);

  const email = normalizeEmail(payload?.email);
  const username = normalizeText(payload?.username);
  const phone = normalizePhone(payload?.phone);
  const address = normalizeText(payload?.address);
  const password = normalizeText(payload?.password);

  if (!email || !username || !phone || !address || !password) {
    throw new Error("Please fill all required fields.");
  }

  const emailExists = users.some((user) => normalizeEmail(user.email) === email);
  if (emailExists) {
    throw new Error("Email already registered.");
  }

  const usernameExists = users.some(
    (user) => normalizeText(user.username).toLowerCase() === username.toLowerCase()
  );
  if (usernameExists) {
    throw new Error("Username already in use.");
  }

  const now = new Date().toISOString();
  const customer = {
    id: `cust_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`,
    email,
    username,
    phone,
    address,
    password,
    createdAt: now,
    updatedAt: now,
  };

  users.push(customer);
  saveUsers(users, storageArg);

  const sessionCustomer = sanitizeCustomer(customer);
  saveSession(sessionCustomer, storageArg);
  upsertCheckoutInfo(sessionCustomer, storageArg);
  return sessionCustomer;
}

export function loginCustomer(payload, storageArg) {
  const login = normalizeText(payload?.login).toLowerCase();
  const password = normalizeText(payload?.password);
  if (!login || !password) {
    throw new Error("Please enter your credentials.");
  }

  const users = getUsers(storageArg);
  const customer = users.find((user) => {
    const byEmail = normalizeEmail(user.email) === login;
    const byUsername = normalizeText(user.username).toLowerCase() === login;
    return (byEmail || byUsername) && normalizeText(user.password) === password;
  });

  if (!customer) {
    throw new Error("Invalid credentials.");
  }

  const sessionCustomer = sanitizeCustomer(customer);
  saveSession(sessionCustomer, storageArg);
  upsertCheckoutInfo(sessionCustomer, storageArg);
  return sessionCustomer;
}

export function logoutCustomer(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;
  storage.removeItem(STORAGE_KEYS.session);
  emitSessionChange(null);
}

export function updateCustomerProfile(payload, storageArg) {
  const session = getSession(storageArg);
  if (!session?.id) {
    throw new Error("Please login first.");
  }

  const users = getUsers(storageArg);
  const index = users.findIndex((user) => normalizeText(user.id) === normalizeText(session.id));
  if (index < 0) {
    throw new Error("Profile not found.");
  }

  const nextEmail = normalizeEmail(payload?.email || users[index].email);
  const nextUsername = normalizeText(payload?.username || users[index].username);
  const nextPhone = normalizePhone(payload?.phone || users[index].phone);
  const nextAddress = normalizeText(payload?.address || users[index].address);

  if (!nextEmail || !nextUsername || !nextPhone || !nextAddress) {
    throw new Error("Please fill all required fields.");
  }

  const emailCollision = users.some(
    (user, i) => i !== index && normalizeEmail(user.email) === nextEmail
  );
  if (emailCollision) {
    throw new Error("Email already registered.");
  }

  const usernameCollision = users.some(
    (user, i) =>
      i !== index && normalizeText(user.username).toLowerCase() === nextUsername.toLowerCase()
  );
  if (usernameCollision) {
    throw new Error("Username already in use.");
  }

  const updated = {
    ...users[index],
    email: nextEmail,
    username: nextUsername,
    phone: nextPhone,
    address: nextAddress,
    updatedAt: new Date().toISOString(),
  };

  users[index] = updated;
  saveUsers(users, storageArg);

  const sessionCustomer = sanitizeCustomer(updated);
  saveSession(sessionCustomer, storageArg);
  upsertCheckoutInfo(sessionCustomer, storageArg);
  return sessionCustomer;
}

export function getCheckoutPrefill(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const saved = parseJSON(storage.getItem(STORAGE_KEYS.checkoutInfo) || "null", null);
  const session = getSession(storageArg);
  const merged = {
    name: normalizeText(session?.username || saved?.name),
    phone: normalizePhone(session?.phone || saved?.phone),
    email: normalizeEmail(session?.email || saved?.email),
    address: normalizeText(session?.address || saved?.address),
    payment_method: normalizeText(saved?.payment_method),
  };

  if (!merged.name && !merged.phone && !merged.email && !merged.address) return null;
  return merged;
}

export function addCustomerOrderRecord(order, customerArg = null, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;

  const customer = customerArg || getSession(storageArg);
  if (!customer) return;

  const normalized = normalizeOrderRecord({
    ...order,
    customer_name: order?.customer_name || customer.username,
    customer_phone: order?.customer_phone || customer.phone,
    customer_email: order?.customer_email || customer.email,
    source: order?.source || "local",
  });
  if (!normalized) return;

  const current = parseJSON(storage.getItem(STORAGE_KEYS.orderHistory) || "[]", []);
  const list = Array.isArray(current) ? current : [];

  const withoutSame = list.filter((row) => String(row?.id || "") !== String(normalized.id || ""));
  withoutSame.unshift(normalized);
  storage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(withoutSame.slice(0, 250)));
}

export function getCustomerOrderHistory(customerArg = null, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return [];

  const customer = customerArg || getSession(storageArg);
  if (!customer) return [];

  const list = parseJSON(storage.getItem(STORAGE_KEYS.orderHistory) || "[]", []);
  const filtered = (Array.isArray(list) ? list : []).filter((order) =>
    matchesCustomer(order, customer)
  );

  return dedupeOrders(filtered);
}

export async function fetchCustomerOrders({
  customer,
  fetcher,
  storage,
}) {
  if (!customer || typeof fetcher !== "function") {
    return getCustomerOrderHistory(customer, storage);
  }

  const queries = [];
  if (customer.phone) queries.push(`/orders?customer_phone=${encodeURIComponent(customer.phone)}`);
  if (customer.email) queries.push(`/orders?customer_email=${encodeURIComponent(customer.email)}`);
  if (customer.username) queries.push(`/orders?customer_name=${encodeURIComponent(customer.username)}`);
  queries.push("/orders");

  const remote = [];

  for (const path of queries) {
    try {
      const payload = await fetcher(path);
      const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.orders)
        ? payload.orders
        : [];

      rows.forEach((row) => {
        if (matchesCustomer(row, customer)) {
          remote.push(row);
        }
      });

    } catch {
      // Continue with other endpoints and fallback storage.
    }
  }

  const merged = dedupeOrders([...remote, ...getCustomerOrderHistory(customer, storage)]);
  return merged;
}

export function splitOrdersByState(orders) {
  const active = [];
  const past = [];

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const status = normalizeText(order?.status).toLowerCase();
    if (ACTIVE_ORDER_STATUSES.has(status)) {
      active.push(order);
    } else {
      past.push(order);
    }
  });

  return { active, past };
}
