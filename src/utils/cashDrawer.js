import secureFetch from "./secureFetch";

let lastPulseAt = 0;
const MIN_PULSE_INTERVAL = 750; // ms – prevent accidental double opens

export const isCashLabel = (value = "") => {
  const normalized = String(value || "").toLowerCase();
  return ["cash", "nakit", "peşin", "pesin"].some((token) =>
    normalized.includes(token)
  );
};

export async function openCashDrawer(payload = {}) {
  const now = Date.now();
  if (now - lastPulseAt < MIN_PULSE_INTERVAL) {
    return false;
  }

  try {
    await secureFetch("/cashdrawer/open", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    lastPulseAt = now;
    return true;
  } catch (err) {
    console.warn("⚠️ Unable to open cash drawer:", err?.message || err);
    return false;
  }
}

export async function logCashRegisterEvent({ type, amount, note }) {
  const numericAmount = Number(amount);
  if (!type || !Number.isFinite(numericAmount)) return;

  try {
    await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({
        type,
        amount: Number(numericAmount.toFixed(2)),
        note,
      }),
    });
  } catch (err) {
    console.warn("⚠️ Failed to log cash register event:", err?.message || err);
  }
}
