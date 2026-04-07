export const PHONE_API_REGEX = /^90\d{10}$/;

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePhoneForApi(value) {
  let digits = digitsOnly(value);
  if (!digits) return "";

  while (digits.startsWith("00") && digits.length > 2) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("90")) {
    const national = digits.slice(2);
    if (national.length === 10) return `90${national}`;
    if (national.length === 11 && national.startsWith("0")) {
      return `90${national.slice(1)}`;
    }
    return digits;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `90${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `90${digits}`;
  }

  return digits;
}

export function formatPhoneForInput(value) {
  return normalizePhoneForApi(value);
}

export function isPhoneApiFormat(value) {
  return PHONE_API_REGEX.test(String(value ?? "").trim());
}
