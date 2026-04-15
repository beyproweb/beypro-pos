function parseGuestCompositionCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildReservationGuestComposition(totalGuests, menGuests, womenGuests) {
  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) {
    return {
      reservation_men: "",
      reservation_women: "",
    };
  }

  const men = parseGuestCompositionCount(menGuests);
  const women = parseGuestCompositionCount(womenGuests);
  if (men + women === total) {
    return {
      reservation_men: String(men),
      reservation_women: String(women),
    };
  }

  const balancedMen = Math.ceil(total / 2);
  return {
    reservation_men: String(balancedMen),
    reservation_women: String(total - balancedMen),
  };
}

function buildGuestComposition(totalGuests, menGuests, womenGuests, keys = {}) {
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

function hasGuestCompositionValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeGuestCompositionFieldMode(value, fallback = "hidden") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["hidden", "optional", "required"].includes(normalized) ? normalized : fallback;
}

function normalizeGuestCompositionRestrictionRule(value, fallback = "no_restriction") {
  const normalized = String(value || fallback).trim().toLowerCase();
  return [
    "no_restriction",
    "minimum_guests_per_table",
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
    "custom_rule_later",
  ].includes(normalized)
    ? normalized
    : fallback;
}

function normalizeMinimumGuestsPerTable(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.max(1, Number.parseInt(String(fallback ?? "1"), 10) || 1);
  }
  return Math.max(1, Math.min(20, parsed));
}

function getDefaultGuestCompositionRestrictionMessage(rule) {
  switch (normalizeGuestCompositionRestrictionRule(rule)) {
    case "minimum_guests_per_table":
      return "Minimum {{count}} guests are required per table reservation.";
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

function resolveGuestCompositionPolicyMessage(message, fallbackRule, translate, options = {}) {
  const t = typeof translate === "function" ? translate : (value) => value;
  const trimmedMessage = String(message || "").trim();
  if (trimmedMessage) return t(trimmedMessage);
  return t(getDefaultGuestCompositionRestrictionMessage(fallbackRule, options), {
    count: normalizeMinimumGuestsPerTable(options?.minimumGuestsPerTable, 1),
  });
}

function buildGuestCountOptions(maxGuests, evenOnly = false) {
  const limit = Math.max(0, Math.floor(Number(maxGuests) || 0));
  const options = [];
  for (let count = 1; count <= limit; count += 1) {
    if (evenOnly && count % 2 !== 0) continue;
    options.push(count);
  }
  return options;
}

function normalizeGuestCountSelection(value, options = []) {
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

function guestCompositionRuleRequiresInput(rule) {
  const normalizedRule = normalizeGuestCompositionRestrictionRule(
    rule,
    "no_restriction"
  );
  return [
    "male_only_groups_not_allowed",
    "female_only_groups_not_allowed",
    "at_least_1_female_required",
    "couple_only",
  ].includes(normalizedRule);
}

function getGuestCompositionValidationError({
  enabled,
  fieldMode,
  restrictionRule,
  validationMessage,
  minimumGuestsPerTable,
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

  const total = parseGuestCompositionCount(totalGuests);
  if (total <= 0) return "";
  const minimumRequiredGuests = normalizeMinimumGuestsPerTable(minimumGuestsPerTable, 1);
  const usesMinimumGuestsRule = normalizedRule === "minimum_guests_per_table";

  const policyMessage =
    String(validationMessage || "").trim() ||
    t(getDefaultGuestCompositionRestrictionMessage(normalizedRule), {
      count: minimumRequiredGuests,
    });

  if (usesMinimumGuestsRule && total < minimumRequiredGuests) {
    return policyMessage;
  }

  if (effectiveMode === "hidden") return "";

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
    case "minimum_guests_per_table":
      blocked = total < minimumRequiredGuests;
      break;
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
    case "custom_rule_later":
    case "no_restriction":
    default:
      blocked = false;
      break;
  }

  if (!blocked) return "";
  return policyMessage;
}

export {
  buildGuestComposition,
  buildGuestCountOptions,
  buildReservationGuestComposition,
  getDefaultGuestCompositionRestrictionMessage,
  getGuestCompositionValidationError,
  guestCompositionRuleRequiresInput,
  hasGuestCompositionValue,
  normalizeGuestCompositionFieldMode,
  normalizeGuestCompositionRestrictionRule,
  normalizeGuestCountSelection,
  parseGuestCompositionCount,
  resolveGuestCompositionPolicyMessage,
  normalizeMinimumGuestsPerTable,
};
