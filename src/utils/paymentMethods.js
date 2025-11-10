const DEFAULT_CARD = {
  name: "",
  number: "",
  expiry: "",
  cvc: "",
};

export const DEFAULT_PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: "💵", enabled: true, builtIn: true },
  { id: "credit_card", label: "Credit Card", icon: "💳", enabled: true, builtIn: true },
  { id: "sodexo", label: "Sodexo", icon: "🍽️", enabled: true, builtIn: true },
  { id: "multinet", label: "Multinet", icon: "🪙", enabled: true, builtIn: true },
];

const ICON_MAP = {
  cash: "💵",
  credit_card: "💳",
  debit_card: "🏧",
  sodexo: "🍽️",
  multinet: "🪙",
  papara: "🅿️",
  iyzico: "💠",
};

const DEFAULT_CARD_STATE = { ...DEFAULT_CARD };

export const formatPaymentLabel = (value = "") =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Payment";

export const slugifyPaymentId = (value = "") => {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base) return base;
  return `method_${Math.random().toString(36).slice(2, 8)}`;
};

const pickIcon = (method) => {
  if (method.icon) return method.icon;
  if (ICON_MAP[method.id]) return ICON_MAP[method.id];
  const label = (method.label || "").toLowerCase();
  if (label.includes("cash") || label.includes("nakit")) return "💵";
  if (label.includes("card") || label.includes("kart")) return "💳";
  if (label.includes("online") || label.includes("pay")) return "💠";
  return "💳";
};

const normalizeMethodsArray = (input = []) => {
  const next = [];
  const seen = new Set();

  const pushMethod = (method) => {
    if (!method) return;
    const id = method.id || method.key || slugifyPaymentId(method.label || "");
    if (seen.has(id)) return;
    seen.add(id);
    next.push({
      id,
      label: method.label || formatPaymentLabel(id),
      icon: pickIcon({ ...method, id }),
      enabled: method.enabled !== false,
      builtIn: Boolean(method.builtIn),
    });
  };

  input.forEach(pushMethod);

  DEFAULT_PAYMENT_METHODS.forEach((method) => {
    if (!seen.has(method.id)) {
      pushMethod(method);
    }
  });

  return next;
};

export const normalizePaymentSettings = (raw = {}) => {
  const methodsFromArray = Array.isArray(raw.methods) ? raw.methods : null;
  const methodsFromEnabled =
    !methodsFromArray && raw.enabledMethods && typeof raw.enabledMethods === "object"
      ? Object.entries(raw.enabledMethods).map(([key, enabled]) => ({
          id: key,
          label: formatPaymentLabel(key),
          enabled,
          builtIn: !!ICON_MAP[key],
          icon: ICON_MAP[key],
        }))
      : null;

  const methods = normalizeMethodsArray(methodsFromArray || methodsFromEnabled || []);

  const defaultCard = {
    ...DEFAULT_CARD_STATE,
    ...(raw.defaultCard || {}),
  };

  return {
    methods,
    defaultCard,
  };
};

export const serializePaymentSettings = (state = {}) => {
  const normalized = normalizePaymentSettings(state);
  const methods = normalized.methods.map((method) => ({
    id: method.id,
    label: method.label,
    icon: method.icon,
    enabled: method.enabled !== false,
    builtIn: method.builtIn || false,
  }));

  const enabledMethods = methods.reduce((acc, method) => {
    acc[method.id] = method.enabled !== false;
    return acc;
  }, {});

  return {
    methods,
    enabledMethods,
    defaultCard: normalized.defaultCard,
  };
};

export const getPaymentMethodLabel = (methods, id) =>
  methods.find((m) => m.id === id)?.label || id || "";

export const getPaymentMethodIcon = (methods, id) =>
  methods.find((m) => m.id === id)?.icon || ICON_MAP[id] || "💳";
