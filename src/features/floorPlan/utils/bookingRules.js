const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QR_PHONE_REGEX = /^(5\d{9}|[578]\d{7})$/;

export { EMAIL_REGEX, QR_PHONE_REGEX };

export function normalizeQrPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("90") && digits.length > 2) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length > 1) digits = digits.slice(1);
  if (digits.startsWith("5")) return digits.slice(0, 10);
  if (digits.startsWith("7") || digits.startsWith("8")) return digits.slice(0, 8);
  return digits.slice(0, 10);
}

export function formatQrPhoneForInput(value) {
  const normalized = normalizeQrPhone(value);
  if (!normalized) return "";
  if (/^5\d{0,9}$/.test(normalized)) {
    const a = normalized.slice(0, 3);
    const b = normalized.slice(3, 6);
    const c = normalized.slice(6, 8);
    const d = normalized.slice(8, 10);
    return ["+90", a, b, c, d].filter(Boolean).join(" ");
  }
  return normalized;
}

export function parseGuestCompositionCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function hasGuestCompositionValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function normalizeGuestCompositionFieldMode(value, fallback = "hidden") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["hidden", "optional", "required"].includes(normalized) ? normalized : fallback;
}

export function normalizeGuestCompositionRestrictionRule(value, fallback = "no_restriction") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return [
    "no_restriction",
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
    "custom_rule_later",
  ].includes(normalized)
    ? normalized
    : fallback;
}

export function buildGuestComposition(totalGuests, menGuests, womenGuests, keys = {}) {
  const menKey = keys.menKey || "men";
  const womenKey = keys.womenKey || "women";
  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) {
    return {
      [menKey]: "",
      [womenKey]: "",
    };
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women === total) {
    return {
      [menKey]: String(men),
      [womenKey]: String(women),
    };
  }

  const balancedMen = Math.ceil(total / 2);
  return {
    [menKey]: String(balancedMen),
    [womenKey]: String(total - balancedMen),
  };
}

function getDefaultGuestCompositionRestrictionMessage(rule) {
  switch (normalizeGuestCompositionRestrictionRule(rule)) {
    case "male_only_groups_not_allowed":
      return "Male-only groups are not allowed for this reservation.";
    case "female_only_groups_not_allowed":
      return "Female-only groups are not allowed for this reservation.";
    case "at_least_1_female_required":
      return "At least 1 female guest is required for this reservation.";
    case "couple_only":
      return "Only mixed couples with equal men and women are allowed for this reservation.";
    default:
      return "Guest composition does not match the reservation policy.";
  }
}

export function resolveGuestCompositionPolicyMessage(message, fallbackRule, translate) {
  const t = typeof translate === "function" ? translate : (value) => value;
  const trimmedMessage = String(message || "").trim();
  if (trimmedMessage) return t(trimmedMessage);
  return t(getDefaultGuestCompositionRestrictionMessage(fallbackRule));
}

export function buildGuestCountOptions(maxGuests, evenOnly = false) {
  const limit = Math.max(0, Math.floor(Number(maxGuests) || 0));
  const options = [];
  for (let count = 1; count <= limit; count += 1) {
    if (evenOnly && count % 2 !== 0) continue;
    options.push(count);
  }
  return options;
}

export function normalizeGuestCountSelection(value, options = []) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  if (options.includes(parsed)) return String(parsed);
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (options[index] <= parsed) return String(options[index]);
  }
  return options.length > 0 ? String(options[0]) : "";
}

export function guestCompositionRuleRequiresInput(rule) {
  const normalizedRule = normalizeGuestCompositionRestrictionRule(rule, "no_restriction");
  return [
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
  ].includes(normalizedRule);
}

export function getGuestCompositionValidationError({
  enabled,
  fieldMode,
  restrictionRule,
  validationMessage,
  totalGuests,
  menGuests,
  womenGuests,
  translate,
}) {
  if (!enabled) return "";
  const t = typeof translate === "function" ? translate : (value) => value;
  const normalizedRule = normalizeGuestCompositionRestrictionRule(
    restrictionRule,
    "no_restriction"
  );
  const normalizedMode = normalizeGuestCompositionFieldMode(fieldMode, "hidden");
  const effectiveMode = guestCompositionRuleRequiresInput(normalizedRule)
    ? "required"
    : normalizedMode;
  if (effectiveMode === "hidden") return "";

  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) return "";

  const policyMessage =
    String(validationMessage || "").trim() ||
    t(getDefaultGuestCompositionRestrictionMessage(normalizedRule));

  if (normalizedRule === "couple_only" && total % 2 !== 0) {
    return policyMessage;
  }

  const hasInput = hasGuestCompositionValue(menGuests) || hasGuestCompositionValue(womenGuests);
  if (effectiveMode === "optional" && !hasInput) return "";
  if (!hasInput) {
    return guestCompositionRuleRequiresInput(normalizedRule)
      ? policyMessage
      : t("Please complete guest composition to continue.");
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women !== total) {
    return t("Guest composition must match guest count.");
  }

  let blocked = false;
  switch (normalizedRule) {
    case "male_only_groups_not_allowed":
      blocked = men > 0 && women === 0;
      break;
    case "female_only_groups_not_allowed":
      blocked = women > 0 && men === 0;
      break;
    case "at_least_1_female_required":
      blocked = women < 1;
      break;
    case "couple_only":
      blocked = total % 2 !== 0 || men !== women || men < 1 || women < 1;
      break;
    default:
      blocked = false;
      break;
  }

  return blocked ? policyMessage : "";
}
