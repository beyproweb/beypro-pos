import secureFetch from "./secureFetch";

let lastPulseAt = 0;
const MIN_PULSE_INTERVAL = 750; // ms – prevent accidental double opens

let registerSettingsCache = null;
let registerSettingsPromise = null;

export const isCashLabel = (value = "") => {
  const normalized = String(value || "").toLowerCase();
  return ["cash", "nakit", "peşin", "pesin"].some((token) =>
    normalized.includes(token)
  );
};

async function getRegisterSettingsCached() {
  if (registerSettingsCache) return registerSettingsCache;
  if (registerSettingsPromise) return registerSettingsPromise;

  registerSettingsPromise = secureFetch("/settings/register")
    .then((data) => {
      registerSettingsCache = data || {};
      return registerSettingsCache;
    })
    .catch(() => (registerSettingsCache = {}))
    .finally(() => {
      registerSettingsPromise = null;
    });

  return registerSettingsPromise;
}

export async function openCashDrawer(options = {}) {
  const now = Date.now();
  if (now - lastPulseAt < MIN_PULSE_INTERVAL) {
    console.warn("⚠️ Drawer pulse throttled - too soon since last pulse");
    return false;
  }

  const {
    printerConfig: explicitPrinterConfig,
    useBackendFallback = true,
    ...restPayload
  } = options || {};

  let settings;
  try {
    settings = await getRegisterSettingsCached();
  } catch (err) {
    settings = {};
    console.warn("⚠️ Could not load register settings:", err?.message || err);
  }

  const combinedPrinterConfig =
    explicitPrinterConfig || settings?.cashDrawerPrinter || {};

  if (!combinedPrinterConfig.interface) {
    console.warn(
      "⚠️ Cash drawer printer not configured. Set it under Settings → Register."
    );
    return false;
  }

  if (!useBackendFallback) {
    console.warn("⚠️ Backend drawer pulse disabled by caller");
    return false;
  }

  try {
    console.log("📡 Opening cash drawer via backend:", {
      payload: restPayload,
      printerConfig: combinedPrinterConfig,
    });
    const response = await secureFetch("/cashdrawer/open", {
      method: "POST",
      body: JSON.stringify({
          ...restPayload,
        printerConfig: combinedPrinterConfig,
      }),
    });

    if (response?.success) {
      console.log("✅ Cash drawer opened via backend");
      lastPulseAt = now;
      return true;
    }

    if (response?.error) {
      console.warn("⚠️ Cash drawer error:", response.error);
      console.warn("   Status:", response.status);
      console.warn("   Details:", response);
      return false;
    }

    lastPulseAt = now;
    return true;
  } catch (err) {
    const errMsg = err?.message || String(err);
    const statusCode = err?.status || err?.statusCode;

    console.error("❌ Cash drawer request failed");
    console.error("   Status:", statusCode);
    console.error("   Message:", errMsg);
    console.error("   Full error:", err);

    if (statusCode === 500 || errMsg.includes("500")) {
      console.warn("⚠️ Cash drawer device error (500):");
      console.warn("   → Device connection failed or not configured");
      console.warn("   → Go to Settings → Register to configure the cash drawer printer");
      console.warn("   → Verify: Printer IP, Port (9100), and network connectivity");
    } else if (statusCode === 400 || errMsg.includes("400")) {
      console.warn("⚠️ Cash drawer configuration error (400):", errMsg);
    } else {
      console.warn("⚠️ Unable to open cash drawer:", errMsg);
    }

    return false;
  }
}

export async function logCashRegisterEvent({ type, amount, note }) {
  const numericAmount = Number(amount);
  if (!type || !Number.isFinite(numericAmount)) return;

  const typeMap = {
    sale: "entry",
    change: "expense",
    entry: "entry",
    expense: "expense",
    open: "open",
    close: "close",
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
