// ===============================
// Image and QR code support
// Jimp ships ESM/CJS hybrids; resolve the actual Jimp class across shapes.
const JimpModule = require("jimp");
const Jimp = JimpModule.default || JimpModule.Jimp || JimpModule;
const QRCode = require("qrcode");

// Prefer built-in fetch (Node 18+); fallback to node-fetch for Electron/Node 16
let fetch = globalThis.fetch;
if (!fetch) {
  fetch = async (...args) => {
    try {
      const mod = await import('node-fetch');
      return mod.default(...args);
    } catch (err) {
      console.error("❌ Failed to load fetch; install 'node-fetch' to enable logo/QR downloads.", err);
      throw err;
    }
  };
}

async function imageUrlToEscposBytes(url, width = 384) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const image = await Jimp.read(buffer);
  // Jimp 1.6 supports resize/greyscale/contrast; dither565 is not available in this build.
  image.resize({ w: width }); // maintain aspect ratio
  image.greyscale();
  image.contrast(1);
  const bytes = [];
  const { width: w, height: h, data } = image.bitmap;
  const widthBytes = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) {
    bytes.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, 0x01, 0x00);
    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      const basePx = xb * 8;
      for (let b = 0; b < 8; b++) {
        const px = basePx + b;
        if (px >= w) continue;
        const idx = (y * w + px) * 4;
        const r = data[idx]; // greyscale already applied
        if (r < 128) byte |= (1 << (7 - b));
      }
      bytes.push(byte);
    }
  }
  return Buffer.from(bytes);
}

async function qrStringToEscposBytes(text, width = 256) {
  const qrDataUrl = await QRCode.toDataURL(text, { width, margin: 1 });
  const image = await Jimp.read(Buffer.from(qrDataUrl.split(",")[1], 'base64'));
  image.resize({ w: width }); // maintain aspect ratio
  image.greyscale();
  image.contrast(1);
  const bytes = [];
  const { width: w, height: h, data } = image.bitmap;
  const widthBytes = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) {
    bytes.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, 0x01, 0x00);
    for (let xb = 0; xb < widthBytes; xb++) {
      let byte = 0;
      const basePx = xb * 8;
      for (let b = 0; b < 8; b++) {
        const px = basePx + b;
        if (px >= w) continue;
        const idx = (y * w + px) * 4;
        const r = data[idx];
        if (r < 128) byte |= (1 << (7 - b));
      }
      bytes.push(byte);
    }
  }
  return Buffer.from(bytes);
}
// BEYPRO ELECTRON MAIN PROCESS
// FULL WORKING PRINT SYSTEM
// ===============================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");

// Simple in-memory de-dupe for recent jobs (jobKey => timestamp)
const RECENT_JOB_TTL = 10000; // ms
const recentJobs = new Map();
function isRecentJob(jobKey) {
  if (!jobKey) return false;
  const now = Date.now();
  const last = recentJobs.get(jobKey);
  if (last && now - last < RECENT_JOB_TTL) return true;
  recentJobs.set(jobKey, now);
  // prune occasionally
  if (recentJobs.size > 200) {
    for (const [k, ts] of recentJobs) {
      if (now - ts > RECENT_JOB_TTL) recentJobs.delete(k);
    }
  }
  return false;
}

// MAIN PRINTER ENGINE (used by ALL Windows printers)
const { getPrinters } = require("pdf-to-printer");

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
const TENANT_KEY_DEFAULT = "default";
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

function tenantKey(id) {
  if (!id) return TENANT_KEY_DEFAULT;
  return String(id);
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

function escapeForPowerShellLiteral(str = "") {
  return String(str).replace(/'/g, "''");
}

function receiptWidthToPx(widthSetting) {
  if (widthSetting === "80mm") return 576;
  if (widthSetting === "72mm" || widthSetting === "70mm") return 512;
  const numeric = Number(String(widthSetting || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= 75) return 576;
    if (numeric >= 68) return 512; // ~70/72mm
  }
  return 384;
}

function sendRawToWindowsPrinter(printerName, dataBuffer) {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      return resolve({ ok: false, error: "Windows raw printing is only available on Windows." });
    }
    if (!printerName) {
      return resolve({ ok: false, error: "printerName is required" });
    }
    if (!dataBuffer || !Buffer.isBuffer(dataBuffer) || !dataBuffer.length) {
      return resolve({ ok: false, error: "Missing raw data for printer job." });
    }

    const safePrinter = escapeForPowerShellLiteral(printerName);
    const base64 = escapeForPowerShellLiteral(dataBuffer.toString("base64"));
    const psScript = `
Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero)) return false;
    var di = new DOCINFOA { pDocName = "Beypro RAW", pDataType = "RAW" };
    if (!StartDocPrinter(h, 1, di)) { ClosePrinter(h); return false; }
    if (!StartPagePrinter(h))      { EndDocPrinter(h); ClosePrinter(h); return false; }
    IntPtr p = Marshal.AllocHGlobal(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written = 0;
    bool ok = WritePrinter(h, p, bytes.Length, out written);
    Marshal.FreeHGlobal(p);
    EndPagePrinter(h);
    EndDocPrinter(h);
    ClosePrinter(h);
    return ok && written == bytes.Length;
  }
}
"@
$bytes = [Convert]::FromBase64String('${base64}')
$ok = [RawPrinterHelper]::SendBytesToPrinter('${safePrinter}', $bytes)
if ($ok) { Write-Output '{"ok":true}' } else { Write-Output '{"ok":false,"error":"WritePrinter failed"}' }
`;

    const ps = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: true }
    );

    let stdout = "";
    let stderr = "";
    ps.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    ps.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    ps.on("close", () => {
      if (stderr && !stdout) {
        return resolve({ ok: false, error: stderr.trim() });
      }
      if (!stdout) {
        return resolve({ ok: false, error: "No spooler response" });
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        resolve({ ok: false, error: "Unexpected spooler response", detail: stdout.trim() || stderr.trim(), detailError: err.message });
      }
    });
  });
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

function getLocalPrinterConfig(tenantId = null) {
  const stored = readPrinterStore();
  // Backward compatibility: if no tenants map, stored is the config
  if (!stored.tenants) {
    return normalizePrinterConfig(stored, false);
  }
  const key = tenantKey(tenantId || stored.lastTenant);
  return normalizePrinterConfig(stored.tenants[key] || {}, false);
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

// Detect if a printer name indicates it's a network printer
function detectPrinterType(printerName = "") {
  const lower = String(printerName).toLowerCase();
  
  // Network printer patterns
  if (/network|lan|tcp|ip|[\d.]+|192\.168|10\.0|172\.16/i.test(lower)) {
    return "network";
  }
  // USB patterns
  if (/usb|thermal|pos|escpos/i.test(lower)) {
    return "usb";
  }
  // Serial patterns
  if (/serial|com\d+|tty|uart/i.test(lower)) {
    return "serial";
  }
  return "unknown";
}

// Try to extract IP address from printer name
function extractIpFromPrinterName(printerName = "") {
  const match = String(printerName).match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return match ? match[1] : null;
}

// ------------------------
// GET PRINTER LIST (Windows)
// Enhanced to detect printer types
// Returns objects with name, status, isDefault properties
// ------------------------
ipcMain.handle("beypro:getPrinters", async () => {
  try {
    const printers = await getPrinters();
    console.log("📠 Found printers:", printers);
    
    // Convert to proper format: [{name, status, isDefault}, ...]
    const formatted = Array.isArray(printers)
      ? printers.map((p) => {
          const name = typeof p === 'string' ? p : p.name || String(p);
          return {
            name: name,
            status: "ready",
            isDefault: name === (process.env.DEFAULT_PRINTER || ""),
          };
        })
      : [];
    
    console.log("📠 Formatted printers:", formatted);
    return formatted;
  } catch (err) {
    console.error("Failed to get printers:", err);
    return [];
  }
});

// Direct network printing via TCP 9100
// Handles ESC/POS printers connected via LAN
async function printNetDirect(host, port, bytes) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);
    
    console.log(`🌐 Printing to network printer: ${host}:${port} (${bytes.length} bytes)`);
    
    sock.connect(port, host, () => {
      sock.write(bytes, (err) => {
        if (err) {
          console.error("Network write failed:", err);
          resolve({ ok: false, error: err.message });
        } else {
          console.log("✅ Network print data sent successfully");
          sock.end(() => resolve({ ok: true }));
        }
      });
    });
    
    sock.on("error", (err) => {
      console.error("Network socket error:", err);
      resolve({ ok: false, error: err.message });
    });
    
    sock.on("timeout", () => {
      console.error("Network print timeout");
      resolve({ ok: false, error: "timeout" });
    });
  });
}

const FEED_AFTER_IMAGE_LINES = 5;
const FEED_CMD = Buffer.from([0x1b, 0x64, FEED_AFTER_IMAGE_LINES]); // ESC d n

// ------------------------
// RAW PRINT with Network Printer Support
// Routes network printers to TCP 9100, others to Windows driver
// ------------------------
ipcMain.handle("beypro:printRaw", async (_evt, args) => {
  try {
    const { printerName, dataBase64, jobKey } = args;

    if (jobKey && isRecentJob(jobKey)) {
      console.log(`⚠️ Skipping duplicate printRaw for jobKey=${jobKey}`);
      return { ok: true, deduped: true };
    }

    if (!dataBase64) return { ok: false, error: "Missing dataBase64" };

    // convert base64 back to ESC/POS bytes
    const bytes = Buffer.from(dataBase64, "base64");
    
    const printerType = detectPrinterType(printerName);
    console.log(`📠 printRaw: ${printerName} (type: ${printerType})`);

    // Try network printer path if indicated by name
    if (printerType === "network") {
      const ip = extractIpFromPrinterName(printerName);
      if (ip) {
        console.log(`🌐 Routing to network printer at ${ip}`);
        return await printNetDirect(ip, 9100, bytes);
      }
    }

    // Fallback to Windows printer driver for USB/Serial/Unknown
    console.log(`📤 Using Windows spooler for ${printerName}`);
    const result = await sendRawToWindowsPrinter(printerName, bytes);
    if (result?.ok) {
      return { ok: true };
    }
    console.error("❌ Windows spooler printRaw failed:", result?.error || result);
    return { ok: false, error: result?.error || "Spooler error" };
  } catch (err) {
    console.error("❌ printRaw failed:", err);
    return { ok: false, error: err.message };
  }
});

// ------------------------
// WINDOWS MODE (LAN PRINTER VIA DRIVER)
// ------------------------
ipcMain.handle("beypro:printWindows", async (_evt, args) => {
  try {
    const { printerName, dataBase64, layout, jobKey, cashdraw } = args;

    console.log("📥 printWindows invoked:", {
      printerName,
      hasLayout: !!layout,
      hasData: !!dataBase64,
      jobKey,
    });

    if (jobKey && isRecentJob(jobKey)) {
      console.log(`⚠️ Skipping duplicate printWindows for jobKey=${jobKey}`);
      return { ok: true, deduped: true };
    }

    let bytes = Buffer.from(dataBase64, "base64");
    if (layout && typeof layout === "object") {
      console.log("🖼️ printWindows received layout:", { showLogo: layout.showLogo, logoUrl: layout.logoUrl, showQr: layout.showQr, qrUrl: layout.qrUrl });
      const widthSetting = layout.receiptWidth || layout.paperWidth;
      const paperWidthPx = receiptWidthToPx(widthSetting);
      let logoBytes = null;
      let qrBytes = null;
      if (layout.showLogo && layout.logoUrl) {
        try {
          logoBytes = await imageUrlToEscposBytes(layout.logoUrl, paperWidthPx);
        } catch (err) {
          console.warn("Failed to process logo for Windows receipt:", err?.message || err);
        }
      }
      if (layout.showQr && layout.qrUrl) {
        try {
          qrBytes = await qrStringToEscposBytes(layout.qrUrl, Math.min(256, paperWidthPx));
        } catch (err) {
          console.warn("Failed to process QR for Windows receipt:", err?.message || err);
        }
      }
      let merged = Buffer.alloc(0);
      const centerCmd = Buffer.from([0x1b, 0x61, 0x01]);
      const leftCmd = Buffer.from([0x1b, 0x61, 0x00]);
      if (logoBytes) merged = Buffer.concat([merged, centerCmd, logoBytes, leftCmd]);
      merged = Buffer.concat([merged, bytes]);
      if (qrBytes) merged = Buffer.concat([merged, centerCmd, qrBytes, leftCmd, FEED_CMD]);
      if (cashdraw) merged = Buffer.concat([merged, Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32])]);
      merged = Buffer.concat([merged, Buffer.from([0x1d, 0x56, 0x00])]); // cut at end
      bytes = merged;
    } else {
      // no layout, still optionally pulse drawer and cut at end
      if (cashdraw) bytes = Buffer.concat([bytes, Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32])]);
      bytes = Buffer.concat([bytes, Buffer.from([0x1d, 0x56, 0x00])]);
    }

    const result = await sendRawToWindowsPrinter(printerName, bytes);
    if (result?.ok) {
      return { ok: true };
    }
    return { ok: false, error: result?.error || "Spooler error" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ------------------------
// DIRECT TCP RAW ESC/POS (9100)
// ------------------------
ipcMain.handle("beypro:printNet", async (_evt, args) => {
  const { host, port = 9100, dataBase64, layout, jobKey, cashdraw } = args;

  if (jobKey && isRecentJob(jobKey)) {
    console.log(`⚠️ Skipping duplicate printNet for jobKey=${jobKey}`);
    return { ok: true, deduped: true };
  }

  // If layout is provided, build ESC/POS bytes with logo/QR
  let finalBytes = Buffer.from(dataBase64, "base64");
  if (layout && typeof layout === 'object') {
    console.log('🖼️ printNet received layout:', { showLogo: layout.showLogo, logoUrl: layout.logoUrl, showQr: layout.showQr, qrUrl: layout.qrUrl });
    const widthSetting = layout.receiptWidth || layout.paperWidth;
    const paperWidthPx = receiptWidthToPx(widthSetting);
    let logoBytes = null;
    let qrBytes = null;
    if (layout.showLogo && layout.logoUrl) {
      console.log('🖼️ Processing logo URL in main:', layout.logoUrl);
      try {
        logoBytes = await imageUrlToEscposBytes(layout.logoUrl, paperWidthPx);
      } catch (err) {
        console.warn("Failed to process logo for receipt:", err?.message || err);
      }
    }
    if (layout.showQr && layout.qrUrl) {
      console.log('🔳 Processing QR in main:', layout.qrUrl);
      try {
        qrBytes = await qrStringToEscposBytes(layout.qrUrl, Math.min(256, paperWidthPx));
      } catch (err) {
        console.warn("Failed to process QR for receipt:", err?.message || err);
      }
    }
    // Concatenate logo (centered), text, QR (centered)
    let merged = Buffer.alloc(0);
    const centerCmd = Buffer.from([0x1b, 0x61, 0x01]); // ESC a 1
    const leftCmd = Buffer.from([0x1b, 0x61, 0x00]); // ESC a 0
    if (logoBytes) merged = Buffer.concat([merged, centerCmd, logoBytes, leftCmd]);
    merged = Buffer.concat([merged, finalBytes]);
    if (qrBytes) merged = Buffer.concat([merged, centerCmd, qrBytes, leftCmd, FEED_CMD]);
    if (cashdraw) merged = Buffer.concat([merged, Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32])]);
    merged = Buffer.concat([merged, Buffer.from([0x1d, 0x56, 0x00])]); // cut at end
    finalBytes = merged;
  } else {
    if (cashdraw) finalBytes = Buffer.concat([finalBytes, Buffer.from([0x1b, 0x70, 0x00, 0x32, 0x32])]);
    finalBytes = Buffer.concat([finalBytes, Buffer.from([0x1d, 0x56, 0x00])]);
  }

  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);
    sock.connect(port, host, () => {
      sock.write(finalBytes, (err) => {
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

ipcMain.handle("beypro:getPrinterConfig", (_evt, tenantId = null) => {
  const config = getLocalPrinterConfig(tenantId);
  return { ok: true, config };
});

ipcMain.handle("beypro:setPrinterConfig", (_evt, payload = {}) => {
  const tenantId = payload?.tenantId;
  const settings = payload?.settings || payload || {};
  const normalized = normalizePrinterConfig(settings, true);

  const store = readPrinterStore();
  const key = tenantKey(tenantId || store.lastTenant || TENANT_KEY_DEFAULT);
  const nextStore = {
    ...store,
    tenants: { ...(store.tenants || {}) },
    lastTenant: key,
  };
  nextStore.tenants[key] = normalized;

  writePrinterStore(nextStore);
  return { ok: true, config: normalized };
});
