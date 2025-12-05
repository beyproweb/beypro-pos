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
    const response = await secureFetch("/cashdrawer/open", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    
    // Log success or error from backend
    if (response?.success) {
      console.log("✅ Cash drawer opened");
      lastPulseAt = now;
      return true;
    } else if (response?.error) {
      console.warn("⚠️ Cash drawer not configured:", response.error);
      return false;
    }
    
    lastPulseAt = now;
    return true;
  } catch (err) {
    const errMsg = err?.message || String(err);
    
    // Check if it's a 500 error (device/config issue)
    if (err?.status === 500 || errMsg.includes("500")) {
      console.warn("⚠️ Cash drawer device error (500):", errMsg);
      console.warn("   → Cash drawer printer may not be configured in register settings");
      console.warn("   → Go to Settings → Register to configure the cash drawer printer");
    } else if (err?.status === 400 || errMsg.includes("400")) {
      console.warn("⚠️ Cash drawer not configured:", errMsg);
    } else {
      console.warn("⚠️ Unable to open cash drawer:", errMsg);
    }
    
    return false;
  }
}

export async function logCashRegisterEvent({ type, amount, note }) {
  const numericAmount = Number(amount);
  if (!type || !Number.isFinite(numericAmount)) return;

  // Map frontend types to backend-allowed types
  const typeMap = {
    "sale": "entry",      // cash payment from order
    "change": "expense",  // change given
    "entry": "entry",     // cash entry
    "expense": "expense", // cash expense
    "open": "open",       // register open
    "close": "close",     // register close
  };

  const backendType = typeMap[String(type).toLowerCase()] || "entry";

  try {
    await secureFetch("/reports/cash-register-log", {
      method: "POST",
      body: JSON.stringify({
        type: backendType,
        amount: Number(numericAmount.toFixed(2)),
        note,
      }),
    });
  } catch (err) {
    console.warn("⚠️ Failed to log cash register event:", err?.message || err);
  }
}
