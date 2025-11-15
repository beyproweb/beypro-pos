// ===============================
// BEYPRO ELECTRON MAIN PROCESS
// FULL WORKING PRINT SYSTEM
// ===============================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

// MAIN PRINTER ENGINE (used by ALL Windows printers)
const { print } = require("pdf-to-printer");

// ------------------------
// OPTIONAL STARTUP TUNING
// ------------------------
// Quiet GPU-related EGL noise if desired
if (process.env.BEYPRO_DISABLE_HW_ACCEL === "1") {
  app.disableHardwareAcceleration();
}

// DEV ONLY: ignore certificate errors (do not enable for production)
if (process.env.BEYPRO_IGNORE_CERT_ERRORS === "1") {
  app.commandLine.appendSwitch("ignore-certificate-errors");
}

const STORE_FILENAME = "printer-config.json";
const DEFAULT_LOCAL_CONFIG = {
  receiptPrinter: "",
  kitchenPrinter: "",
  layout: {
    logoUrl: "",
    showLogo: true,
    headerTitle: "Beypro POS",
    headerSubtitle: "Hurrybey · Receipt",
    showHeader: true,
    showFooter: true,
    footerText: "Teşekkür ederiz! / Thank you!",
    showQr: true,
    qrText: "Scan to share feedback",
    qrUrl: "https://hurrybey.com/feedback",
    alignment: "left",
    paperWidth: "80mm",
    spacing: 1.25,
    showTaxes: true,
    showDiscounts: true,
    taxLabel: "Tax",
    discountLabel: "Discount",
    showItemModifiers: true,
    itemFontSize: 14,
    margin: 12,
    includeTotals: true,
  },
  defaults: {
    cut: true,
    cashDrawer: false,
  },
  customLines: [],
  lastSynced: null,
};

let userDataPath = null;
app.whenReady().then(() => {
  userDataPath = app.getPath("userData");
});

function getPrinterStorePath() {
  const base = userDataPath || app.getPath("userData");
  return path.join(base, STORE_FILENAME);
}

function readPrinterStore() {
  try {
    const filePath = getPrinterStorePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to read printer config cache:", err);
  }
  return {};
}

function writePrinterStore(data) {
  try {
    const filePath = getPrinterStorePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to persist printer config:", err);
    return false;
  }
}

function normalizePrinterConfig(payload = {}, updateTimestamp = false) {
  const layoutOverride =
    payload.layout && typeof payload.layout === "object" ? payload.layout : {};
  const defaultsOverride =
    payload.defaults && typeof payload.defaults === "object" ? payload.defaults : {};
  const merged = {
    ...DEFAULT_LOCAL_CONFIG,
    ...payload,
    defaults: {
      ...DEFAULT_LOCAL_CONFIG.defaults,
      ...defaultsOverride,
    },
    layout: {
      ...DEFAULT_LOCAL_CONFIG.layout,
      ...layoutOverride,
    },
  };
  merged.customLines = Array.isArray(payload.customLines)
    ? payload.customLines
    : merged.customLines;
  if (updateTimestamp) {
    merged.lastSynced = new Date().toISOString();
  }
  return merged;
}

function getLocalPrinterConfig() {
  const stored = readPrinterStore();
  return normalizePrinterConfig(stored, false);
}

// ------------------------
// WINDOW BOOTSTRAP
// ------------------------
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Use loadFile with hash to avoid file:// absolute path issues
    const filePath = path.join(__dirname, "dist", "index.html");
    win.loadFile(filePath, { hash: "/" });
  }

  win.on("closed", () => (win = null));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ------------------------
// GET PRINTER LIST (Windows)
// ------------------------
ipcMain.handle("beypro:getPrinters", async () => {
  try {
    const printers = await print.getPrinters();
    return printers;
  } catch (err) {
    return [];
  }
});

// ------------------------
// RAW PRINT (USB + LAN Windows driver)
// ------------------------
ipcMain.handle("beypro:printRaw", async (_evt, args) => {
  try {
    const { printerName, dataBase64 } = args;

    if (!dataBase64) return { ok: false, error: "Missing dataBase64" };

    // convert base64 back to ESC/POS bytes
    const bytes = Buffer.from(dataBase64, "base64");

    const tempFile = path.join(app.getPath("temp"), "beypro-raw.txt");
    fs.writeFileSync(tempFile, bytes);

    await print(tempFile, {
      printer: printerName,
      win32: ["raw"]
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ------------------------
// WINDOWS MODE (LAN PRINTER VIA DRIVER)
// ------------------------
ipcMain.handle("beypro:printWindows", async (_evt, args) => {
  try {
    const { printerName, dataBase64 } = args;

    const bytes = Buffer.from(dataBase64, "base64");
    const tempFile = path.join(app.getPath("temp"), "beypro-windows.txt");
    fs.writeFileSync(tempFile, bytes);

    await print(tempFile, {
      printer: printerName,
      win32: ["raw"],
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ------------------------
// DIRECT TCP RAW ESC/POS (9100)
// ------------------------
ipcMain.handle("beypro:printNet", async (_evt, args) => {
  const { host, port = 9100, dataBase64 } = args;

  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);

    const data = Buffer.from(dataBase64, "base64");

    sock.connect(port, host, () => {
      sock.write(data, (err) => {
        if (err) {
          resolve({ ok: false, error: err.message });
        } else {
          sock.end(() => resolve({ ok: true }));
        }
      });
    });

    sock.on("error", (err) => resolve({ ok: false, error: err.message }));
    sock.on("timeout", () => resolve({ ok: false, error: "timeout" }));
  });
});

ipcMain.handle("beypro:getPrinterConfig", () => {
  const config = getLocalPrinterConfig();
  return { ok: true, config };
});

ipcMain.handle("beypro:setPrinterConfig", (_evt, payload = {}) => {
  const normalized = normalizePrinterConfig(payload, true);
  writePrinterStore(normalized);
  return { ok: true, config: normalized };
});
