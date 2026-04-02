const STORAGE_KEYS = {
  session: "qr_customer_session",
  token: "qr_customer_token",
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

const AUTH_ERROR_MESSAGES = {
  accountNotFound: "No account found for this phone number or email. Please register.",
  invalidLoginInput: "Please enter your phone number or email and password.",
  invalidCredentials: "Incorrect password.",
  missingLoginFields: "Phone number or email and password are required",
};

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

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00") && digits.length > 2) digits = digits.slice(2);
  if (digits.startsWith("90") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length > 10) digits = digits.slice(1);
  return digits;
}

function normalizeLanguage(value) {
  const raw = normalizeText(value).split(",")[0];
  return raw ? raw.slice(0, 32) : "";
}

function resolveLanguage(payload) {
  const explicit = normalizeLanguage(payload?.language);
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const storedLang = normalizeLanguage(window.localStorage?.getItem?.("i18nextLng"));
    if (storedLang) return storedLang;

    const browserLang = normalizeLanguage(window.navigator?.language);
    if (browserLang) return browserLang;
  }

  return "";
}

function buildCheckoutInfo(payload, existing = {}) {
  return {
    name: normalizeText(payload?.name ?? existing?.name),
    phone: normalizePhone(payload?.phone ?? existing?.phone),
    email: normalizeEmail(payload?.email ?? existing?.email),
    address: normalizeText(payload?.address ?? existing?.address),
    payment_method: normalizeText(payload?.payment_method ?? existing?.payment_method),
    bank_reference: normalizeText(payload?.bank_reference ?? existing?.bank_reference),
  };
}

function sanitizeCustomer(user) {
  const source = user?.customer && typeof user.customer === "object" ? user.customer : user;
  if (!source || typeof source !== "object") return null;

  return {
    id: normalizeText(source.id),
    email: normalizeEmail(source.email),
    username: normalizeText(source.username || source.name),
    phone: normalizePhone(source.phone),
    address: normalizeText(source.address),
    language: normalizeLanguage(source.language),
    createdAt: source.createdAt || source.created_at || null,
    updatedAt: source.updatedAt || source.updated_at || null,
  };
}

function emitSessionChange(customer) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("qr:customer-session-changed", {
      detail: { customer: sanitizeCustomer(customer) },
    })
  );
}

function clearLegacyUsers(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;
  storage.removeItem(STORAGE_KEYS.users);
}

function saveSessionState({ customer, token }, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;

  const sanitized = sanitizeCustomer(customer);
  if (!sanitized) {
    storage.removeItem(STORAGE_KEYS.session);
    if (!token) {
      storage.removeItem(STORAGE_KEYS.token);
    }
    emitSessionChange(null);
    return null;
  }

  storage.setItem(STORAGE_KEYS.session, JSON.stringify(sanitized));
  if (token) {
    storage.setItem(STORAGE_KEYS.token, normalizeText(token));
  }
  clearLegacyUsers(storage);
  emitSessionChange(sanitized);
  return sanitized;
}

function clearSessionState(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return;
  storage.removeItem(STORAGE_KEYS.session);
  storage.removeItem(STORAGE_KEYS.token);
  emitSessionChange(null);
}

function getSession(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const session = parseJSON(storage.getItem(STORAGE_KEYS.session) || "null", null);
  return sanitizeCustomer(session);
}

function getSessionToken(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return "";
  return normalizeText(storage.getItem(STORAGE_KEYS.token));
}

function upsertCheckoutInfo(customer, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage || !customer) return;

  const existing = parseJSON(storage.getItem(STORAGE_KEYS.checkoutInfo) || "null", null);
  const next = buildCheckoutInfo(
    {
      name: customer.username,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    },
    existing
  );

  storage.setItem(STORAGE_KEYS.checkoutInfo, JSON.stringify(next));
}

function requireFetcher(context) {
  const fetcher = context?.fetcher;
  if (typeof fetcher !== "function") {
    throw new Error("QR customer auth API is not available.");
  }
  return fetcher;
}

function createAuthError(message, cause) {
  const err = new Error(message);
  if (cause) {
    err.cause = cause;
    err.details = cause?.details;
  }
  return err;
}

function normalizeAuthError(error) {
  const message = normalizeText(error?.message);

  switch (message) {
    case AUTH_ERROR_MESSAGES.accountNotFound:
      return createAuthError(AUTH_ERROR_MESSAGES.accountNotFound, error);
    case AUTH_ERROR_MESSAGES.invalidCredentials:
      return createAuthError("Invalid credentials.", error);
    case AUTH_ERROR_MESSAGES.missingLoginFields:
      return createAuthError(AUTH_ERROR_MESSAGES.invalidLoginInput, error);
    default:
      return error;
  }
}

async function requestCustomerAuth(path, options = {}, context = {}) {
  const fetcher = requireFetcher(context);
  try {
    return await fetcher(path, options);
  } catch (error) {
    throw normalizeAuthError(error);
  }
}

function buildAuthHeaders(context, extra = {}) {
  const token = getSessionToken(context?.storage);
  if (!token) return extra;
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

export function saveCheckoutPrefill(payload, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const existing = parseJSON(storage.getItem(STORAGE_KEYS.checkoutInfo) || "null", null);
  const next = buildCheckoutInfo(payload, existing);
  storage.setItem(STORAGE_KEYS.checkoutInfo, JSON.stringify(next));
  return next;
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

export function getCustomerSessionToken(storageArg) {
  return getSessionToken(storageArg);
}

export async function restoreCustomerSession(context = {}) {
  const cached = getSession(context?.storage);
  const token = getSessionToken(context?.storage);

  if (!token) {
    return cached;
  }

  if (typeof context?.fetcher !== "function") {
    return cached;
  }

  try {
    const payload = await requestCustomerAuth(
      "/public/customer-auth/me",
      {
        method: "GET",
        headers: buildAuthHeaders(context),
      },
      context
    );
    const customer = saveSessionState(
      {
        customer: payload?.customer,
        token,
      },
      context?.storage
    );
    upsertCheckoutInfo(customer, context?.storage);
    return customer;
  } catch {
    clearSessionState(context?.storage);
    return null;
  }
}

export async function registerCustomer(payload, context = {}) {
  const name = normalizeText(payload?.username || payload?.name);
  const phone = normalizePhone(payload?.phone);
  const email = normalizeEmail(payload?.email) || "";
  const address = normalizeText(payload?.address);
  const password = normalizeText(payload?.password);
  const language = resolveLanguage(payload);

  if (!name || !phone || !password) {
    throw new Error("Please fill all required fields.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/register",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        email: email || undefined,
        address: address || undefined,
        password,
        language: language || undefined,
      }),
    },
    context
  );

  const customer = saveSessionState(
    {
      customer: response?.customer,
      token: response?.token,
    },
    context?.storage
  );
  upsertCheckoutInfo(customer, context?.storage);
  return customer;
}

export async function loginCustomer(payload, context = {}) {
  const login = normalizeText(payload?.login || payload?.phone || payload?.email);
  const password = normalizeText(payload?.password);

  if (!login || !password) {
    throw createAuthError(AUTH_ERROR_MESSAGES.invalidLoginInput);
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/login",
    {
      method: "POST",
      body: JSON.stringify({ login, password }),
    },
    context
  );

  const customer = saveSessionState(
    {
      customer: response?.customer,
      token: response?.token,
    },
    context?.storage
  );
  upsertCheckoutInfo(customer, context?.storage);
  return customer;
}

export function logoutCustomer(context = {}) {
  clearSessionState(context?.storage || context);
}

export async function updateCustomerProfile(payload, context = {}) {
  const session = getSession(context?.storage);
  if (!session?.id) {
    throw new Error("Please login first.");
  }

  const name = normalizeText(payload?.username || payload?.name || session.username);
  const phone = normalizePhone(payload?.phone || session.phone);
  const email =
    payload?.email === undefined ? session.email : normalizeEmail(payload?.email) || "";
  const address =
    payload?.address === undefined ? session.address : normalizeText(payload?.address);
  const language = resolveLanguage(payload) || session.language;

  if (!name || !phone) {
    throw new Error("Please fill all required fields.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/me",
    {
      method: "PATCH",
      headers: buildAuthHeaders(context),
      body: JSON.stringify({
        name,
        phone,
        email: email || "",
        address: address || "",
        language: language || undefined,
      }),
    },
    context
  );

  const customer = saveSessionState(
    {
      customer: response?.customer,
      token: getSessionToken(context?.storage),
    },
    context?.storage
  );
  upsertCheckoutInfo(customer, context?.storage);
  return customer;
}

export function getCheckoutPrefill(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const saved = parseJSON(storage.getItem(STORAGE_KEYS.checkoutInfo) || "null", null);
  const session = getSession(storageArg);
  const merged = buildCheckoutInfo(
    {
      name: session?.username,
      phone: session?.phone,
      email: session?.email,
      address: session?.address,
    },
    saved
  );

  if (
    !merged.name &&
    !merged.phone &&
    !merged.email &&
    !merged.address &&
    !merged.payment_method &&
    !merged.bank_reference
  ) {
    return null;
  }
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

export async function fetchCustomerOrders({ customer, fetcher, storage }) {
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

  return dedupeOrders([...remote, ...getCustomerOrderHistory(customer, storage)]);
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
