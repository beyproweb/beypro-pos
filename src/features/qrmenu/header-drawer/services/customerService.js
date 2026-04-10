import { API_BASE } from "../../../../utils/api";
import { normalizePhoneForApi } from "../../../../utils/phone";

const STORAGE_KEYS = {
  session: "qr_customer_session",
  token: "qr_customer_token",
  users: "qr_customer_users",
  checkoutInfo: "qr_delivery_info",
  orderHistory: "qr_customer_orders",
  phoneVerificationTrust: "qr_phone_verification_trust",
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
  missingOtpFields: "Email and verification code are required.",
  invalidOtpCode: "Invalid verification code.",
  expiredOtpCode: "Verification code has expired.",
  tooManyOtpAttempts: "Too many invalid attempts. Request a new code.",
};

const OAUTH_PROVIDER_SET = new Set(["google", "apple"]);
const OAUTH_QUERY_KEYS = [
  "qr_oauth_token",
  "qr_oauth_error",
  "qr_oauth_provider",
  "google_oauth",
  "google_oauth_error",
  "transfer_token",
];

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
  return normalizePhoneForApi(value);
}

function normalizeLanguage(value) {
  const raw = normalizeText(value).split(",")[0];
  return raw ? raw.slice(0, 32) : "";
}

function normalizeBoolean(value) {
  return value === true;
}

function decodeJwtExpiryMs(token) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return 0;
  const parts = normalizedToken.split(".");
  if (parts.length < 2) return 0;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const expSeconds = Number(payload?.exp || 0);
    if (!Number.isFinite(expSeconds) || expSeconds <= 0) return 0;
    return expSeconds * 1000;
  } catch {
    return 0;
  }
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

function normalizeOAuthProvider(value) {
  const provider = normalizeText(value).toLowerCase();
  return OAUTH_PROVIDER_SET.has(provider) ? provider : "";
}

function resolveIdentifierFromPathname(pathname) {
  const segments = String(pathname || "")
    .split("/")
    .map((part) => normalizeText(part))
    .filter(Boolean);
  if (!segments.length) return "";

  if (segments[0] === "qr-menu" && segments[1]) return segments[1];

  const reservedRoots = new Set([
    "menu",
    "qr",
    "login",
    "register",
    "staff-login",
    "standalone",
    "dashboard",
    "kitchen",
    "settings",
  ]);

  return reservedRoots.has(segments[0]) ? "" : segments[0];
}

function resolveIdentifierFromContext(context = {}) {
  const explicitIdentifier = normalizeText(context?.identifier);
  if (explicitIdentifier) return explicitIdentifier;

  if (typeof context?.getIdentifier === "function") {
    const resolved = normalizeText(context.getIdentifier());
    if (resolved) return resolved;
  }

  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search || "");
  const queryKeys = ["identifier", "tenant_id", "tenant", "restaurant_id", "restaurant"];
  for (const key of queryKeys) {
    const value = normalizeText(params.get(key));
    if (value) return value;
  }

  return resolveIdentifierFromPathname(window.location.pathname);
}

function buildOAuthStartUrl(provider, context = {}, options = {}) {
  const normalizedProvider = normalizeOAuthProvider(provider);
  if (!normalizedProvider) {
    throw new Error("Unsupported OAuth provider.");
  }

  const identifier = resolveIdentifierFromContext(context);
  if (!identifier) {
    throw new Error("Restaurant identifier is required for social login.");
  }

  const baseUrl = normalizeText(API_BASE) || "/api";
  const hasProtocol = /^https?:\/\//i.test(baseUrl);
  const absoluteBase = hasProtocol
    ? baseUrl
    : `${typeof window !== "undefined" ? window.location.origin : ""}${baseUrl}`;
  const root = absoluteBase.endsWith("/") ? absoluteBase : `${absoluteBase}/`;
  const startUrl = new URL(`public/customer-auth/oauth/${normalizedProvider}/start`, root);

  startUrl.searchParams.set("identifier", identifier);
  const returnTo = normalizeText(
    options?.returnTo || (typeof window !== "undefined" ? window.location.href : "")
  );
  if (returnTo) {
    startUrl.searchParams.set("return_to", returnTo);
  }

  return startUrl.toString();
}

function removeOAuthQueryParamsFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  OAUTH_QUERY_KEYS.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (!changed) return;

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function mapOAuthErrorMessage(code) {
  const normalized = normalizeText(code).toLowerCase();
  if (!normalized) return "Social login failed.";
  switch (normalized) {
    case "unsupported_provider":
      return "This social login provider is not supported.";
    case "google_not_configured":
      return "Google login is not configured yet.";
    case "apple_not_configured":
      return "Apple login is not configured yet.";
    case "invalid_oauth_state":
      return "Social login session expired. Please try again.";
    case "missing_oauth_code":
      return "Social login response was incomplete. Please try again.";
    default:
      return "Social login failed. Please try again.";
  }
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
    phone_verified: normalizeBoolean(source.phone_verified),
    phone_verified_at: source.phone_verified_at || null,
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
  storage.removeItem(STORAGE_KEYS.phoneVerificationTrust);
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

function readPhoneVerificationTrust(storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const parsed = parseJSON(storage.getItem(STORAGE_KEYS.phoneVerificationTrust) || "null", null);
  if (!parsed || typeof parsed !== "object") return null;
  const phone = normalizePhone(parsed.phone);
  const token = normalizeText(parsed.token);
  const expiresAtMs = Number(parsed.expiresAtMs || 0);
  if (!phone || !token || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    storage.removeItem(STORAGE_KEYS.phoneVerificationTrust);
    return null;
  }
  return {
    phone,
    token,
    source: normalizeText(parsed.source || "otp"),
    expiresAtMs,
  };
}

function savePhoneVerificationTrust(payload, storageArg) {
  const storage = getStorage(storageArg);
  if (!storage) return null;
  const phone = normalizePhone(payload?.phone);
  const token = normalizeText(payload?.token);
  const source = normalizeText(payload?.source || "otp") || "otp";
  const expiresAtMs =
    Number(payload?.expiresAtMs || 0) ||
    decodeJwtExpiryMs(token) ||
    Date.now() + 30 * 60 * 1000;
  if (!phone || !token || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    storage.removeItem(STORAGE_KEYS.phoneVerificationTrust);
    return null;
  }
  const record = {
    phone,
    token,
    source,
    expiresAtMs,
    savedAt: new Date().toISOString(),
  };
  storage.setItem(STORAGE_KEYS.phoneVerificationTrust, JSON.stringify(record));
  return record;
}

function clearPhoneVerificationTrust(storageArg, phoneToKeep = "") {
  const storage = getStorage(storageArg);
  if (!storage) return;
  const normalizedKeepPhone = normalizePhone(phoneToKeep);
  if (!normalizedKeepPhone) {
    storage.removeItem(STORAGE_KEYS.phoneVerificationTrust);
    return;
  }
  const current = readPhoneVerificationTrust(storage);
  if (!current || current.phone !== normalizedKeepPhone) {
    storage.removeItem(STORAGE_KEYS.phoneVerificationTrust);
  }
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
    case AUTH_ERROR_MESSAGES.missingOtpFields:
      return createAuthError("Please enter your email and verification code.", error);
    case AUTH_ERROR_MESSAGES.invalidOtpCode:
      return createAuthError("Invalid verification code.", error);
    case AUTH_ERROR_MESSAGES.expiredOtpCode:
      return createAuthError("Verification code has expired. Request a new code.", error);
    case AUTH_ERROR_MESSAGES.tooManyOtpAttempts:
      return createAuthError("Too many invalid attempts. Request a new code.", error);
    default:
      return error;
  }
}

function persistCustomerAuthResponse(response, context = {}) {
  const customer = saveSessionState(
    {
      customer: response?.customer,
      token: response?.token,
    },
    context?.storage
  );
  upsertCheckoutInfo(customer, context?.storage);
  if (normalizeText(response?.phone_verification_token) && customer?.phone) {
    savePhoneVerificationTrust(
      {
        phone: customer.phone,
        token: response.phone_verification_token,
        source: "auth_response",
      },
      context?.storage
    );
  } else if (customer?.phone_verified === true && customer?.phone) {
    clearPhoneVerificationTrust(context?.storage, customer.phone);
  }
  return customer;
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

export function getPhoneVerificationTrust(storageArg) {
  return readPhoneVerificationTrust(storageArg);
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

export async function completeCustomerOAuthFromUrl(context = {}) {
  if (typeof window === "undefined") {
    return { handled: false, customer: getSession(context?.storage), error: "" };
  }

  const url = new URL(window.location.href);
  const token = normalizeText(url.searchParams.get("qr_oauth_token"));
  const provider =
    normalizeOAuthProvider(url.searchParams.get("qr_oauth_provider")) ||
    (normalizeText(url.searchParams.get("google_oauth_error")) ? "google" : "");
  const errorCode = normalizeText(
    url.searchParams.get("qr_oauth_error") || url.searchParams.get("google_oauth_error")
  );

  if (!token && !errorCode) {
    return { handled: false, customer: getSession(context?.storage), error: "" };
  }

  removeOAuthQueryParamsFromLocation();

  if (errorCode) {
    return {
      handled: true,
      customer: getSession(context?.storage),
      error: mapOAuthErrorMessage(errorCode),
      provider,
    };
  }

  const storage = getStorage(context?.storage);
  if (storage && token) {
    storage.setItem(STORAGE_KEYS.token, token);
  }

  const customer = await restoreCustomerSession(context);
  if (!customer) {
    return {
      handled: true,
      customer: null,
      error: "Social login could not be restored. Please try again.",
      provider,
    };
  }

  return { handled: true, customer, error: "", provider };
}

export function startCustomerOAuth(provider, context = {}, options = {}) {
  const startUrl = buildOAuthStartUrl(provider, context, options);
  if (typeof window !== "undefined") {
    window.location.assign(startUrl);
  }
  return startUrl;
}

export function startGoogleOAuthLogin(context = {}, options = {}) {
  return startCustomerOAuth("google", context, options);
}

export function startAppleOAuthLogin(context = {}, options = {}) {
  return startCustomerOAuth("apple", context, options);
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

  return persistCustomerAuthResponse(response, context);
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

  return persistCustomerAuthResponse(response, context);
}

export async function requestCustomerEmailOtp(payload, context = {}) {
  const email = normalizeEmail(payload?.email || payload?.login);
  if (!email) {
    throw createAuthError("Please enter your email address.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/email-otp/request",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
    context
  );

  return {
    email,
    sent: Boolean(response?.sent),
    message:
      normalizeText(response?.message) ||
      "If this email is registered, a verification code has been sent.",
    retryAfterSeconds: Number(response?.retry_after_seconds || 0) || 0,
    expiresInSeconds: Number(response?.expires_in_seconds || 0) || 0,
  };
}

export async function verifyCustomerEmailOtp(payload, context = {}) {
  const email = normalizeEmail(payload?.email || payload?.login);
  const code = normalizeText(payload?.code);
  if (!email || !code) {
    throw createAuthError("Please enter your email and verification code.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/email-otp/verify",
    {
      method: "POST",
      body: JSON.stringify({ email, code }),
    },
    context
  );

  return persistCustomerAuthResponse(response, context);
}

export async function requestCustomerPhoneOtp(payload, context = {}) {
  const phone = normalizePhone(payload?.phone || payload?.customer_phone);
  if (!phone) {
    throw createAuthError("Please enter a valid phone number.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/phone-otp/send",
    {
      method: "POST",
      headers: buildAuthHeaders(context),
      body: JSON.stringify({ phone }),
    },
    context
  );

  return {
    phone,
    sent: Boolean(response?.sent),
    alreadyVerified: Boolean(response?.already_verified),
    message: normalizeText(response?.message),
    retryAfterSeconds: Number(response?.retry_after_seconds || 0) || 0,
    expiresInSeconds: Number(response?.expires_in_seconds || 0) || 0,
    mockCode: normalizeText(response?.mock_code || ""),
    phoneVerificationToken: normalizeText(response?.phone_verification_token || ""),
  };
}

export async function verifyCustomerPhoneOtp(payload, context = {}) {
  const phone = normalizePhone(payload?.phone || payload?.customer_phone);
  const code = normalizeText(payload?.code);
  if (!phone || !code) {
    throw createAuthError("Please enter your phone number and verification code.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/phone-otp/verify",
    {
      method: "POST",
      headers: buildAuthHeaders(context),
      body: JSON.stringify({ phone, code }),
    },
    context
  );

  let customer = getSession(context?.storage);
  if (response?.customer || response?.token) {
    customer = persistCustomerAuthResponse(response, context);
  } else if (customer?.phone && customer.phone !== phone) {
    customer = saveSessionState(
      {
        customer: { ...customer, phone },
        token: getSessionToken(context?.storage),
      },
      context?.storage
    );
  }

  const verificationToken = normalizeText(response?.phone_verification_token || "");
  if (verificationToken) {
    savePhoneVerificationTrust(
      {
        phone,
        token: verificationToken,
        source: "otp_verify",
      },
      context?.storage
    );
  }

  return {
    verified: Boolean(response?.verified ?? true),
    phone,
    customer,
    phoneVerificationToken: verificationToken,
  };
}

export async function getCustomerPhoneVerificationStatus(payload = {}, context = {}) {
  const candidatePhone = normalizePhone(payload?.phone || payload?.customer_phone);
  const session = getSession(context?.storage);
  const phone = candidatePhone || normalizePhone(session?.phone);
  if (!phone) {
    throw createAuthError("Please enter a valid phone number.");
  }

  const trusted = readPhoneVerificationTrust(context?.storage);
  const query = new URLSearchParams();
  query.set("phone", phone);
  if (trusted?.phone === phone && trusted?.token) {
    query.set("phone_verification_token", trusted.token);
  }

  const response = await requestCustomerAuth(
    `/public/customer-auth/phone-verification-status?${query.toString()}`,
    {
      method: "GET",
      headers: buildAuthHeaders(context),
    },
    context
  );

  const verified = response?.verified === true;
  const verificationToken = normalizeText(response?.phone_verification_token || "");
  if (verified && verificationToken) {
    savePhoneVerificationTrust(
      {
        phone,
        token: verificationToken,
        source: normalizeText(response?.source || "status"),
      },
      context?.storage
    );
  } else if (!verified) {
    clearPhoneVerificationTrust(context?.storage, phone);
  }

  return {
    phone,
    verified,
    source: normalizeText(response?.source || ""),
    phoneVerificationToken: verificationToken,
    marketplacePhoneVerified: response?.marketplace_phone_verified === true,
    marketplacePhoneVerifiedAt: response?.marketplace_phone_verified_at || null,
  };
}

export async function updateCustomerPhoneNumber(payload, context = {}) {
  const phone = normalizePhone(payload?.phone || payload?.customer_phone);
  if (!phone) {
    throw createAuthError("Please enter a valid phone number.");
  }

  const response = await requestCustomerAuth(
    "/public/customer-auth/phone-number",
    {
      method: "PATCH",
      headers: buildAuthHeaders(context),
      body: JSON.stringify({ phone }),
    },
    context
  );

  const customer = saveSessionState(
    {
      customer: response?.customer,
      token: response?.token || getSessionToken(context?.storage),
    },
    context?.storage
  );
  clearPhoneVerificationTrust(context?.storage, phone);
  upsertCheckoutInfo(customer, context?.storage);
  return {
    customer,
    phoneVerificationRequired: response?.phone_verification_required !== false,
  };
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
  const previousPhone = normalizePhone(session.phone);

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
  if (phone !== previousPhone) {
    clearPhoneVerificationTrust(context?.storage);
  }
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
