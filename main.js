// main.js (Electron main process)
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const net = require("net");

// ---------- Single instance (optional but nice) ----------
const gotTheLock = app.requestSingleInstanceLock?.() ?? true;
if (!gotTheLock) {
  app.quit();
}

// ---------- Create window ----------
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: false, // leave default unless you explicitly need it
    },
  });

  // In dev, load the Vite dev server URL; in prod, load built index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Force hash so React Router won't try to match the raw file path
    const indexPath = path.join(__dirname, "dist", "index.html").replace(/\\/g, "/");
    win.loadURL(`file://${indexPath}#/`);
  }
}

app.whenReady().then(createWindow);

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ---------- Native printer access (Windows only) ----------
// ---------- Native printer access (cross-platform via N-API) ----------
let printer = null;
try {
  // Uses @thesusheer/electron-printer (N-API, prebuilt)
  // Works on Windows and POSIX; no node-gyp/grunt peer issues.
  // eslint-disable-next-line import/no-extraneous-dependencies
  printer = require("@thesusheer/electron-printer");
  console.log("✅ Electron printer module loaded");
} catch (err) {
  console.error("❌ Failed to load @thesusheer/electron-printer:", err?.message || err);
  printer = null;
}


// ---------- IPC: app/bridge info ----------
ipcMain.handle("beypro:getInfo", () => ({
  ok: true,
  platform: `${os.platform()} ${os.arch()} (electron)`,
  version: app.getVersion(),
  usb: !!printer, // tells renderer whether native USB/spooler is available
}));

// ---------- IPC: list Windows printers ----------
ipcMain.handle("beypro:getPrinters", () => {
  if (!printer) {
    console.warn("⚠️ Printer module not available, returning empty list");
    return [];
  }
  try {
    const list = printer.getPrinters() || [];
    console.log("🖨️ Found printers:", list);
    return list.map((p) => ({
      name: p.name,
      isDefault: !!p.isDefault,
      driver: p.driverName || p.driver || "",
      port: p.portName || "",
    }));
  } catch (err) {
    console.error("❌ Error listing printers:", err);
    return [];
  }
});

// ---------- IPC: RAW print via Windows spooler ----------
/**
 * Args: { printerName: string (optional if default), dataBase64: string }
 * dataBase64 should be ESC/POS or other RAW bytes encoded as base64.
 */
ipcMain.handle("beypro:printRaw", async (_evt, args = {}) => {
  if (!printer) {
    return { ok: false, error: "Printer module not available" };
  }
  try {
    const { printerName, dataBase64 } = args;
    if (!dataBase64) return { ok: false, error: "dataBase64 is required" };

    const data = Buffer.from(String(dataBase64), "base64");

    return await new Promise((resolve) => {
      try {
        printer.printDirect({
          data,                         // Buffer with raw bytes
          type: "RAW",                  // RAW passthrough to spooler
          printer: printerName || undefined, // default printer when undefined
          docname: "Beypro Ticket",
          success: (jobID) => resolve({ ok: true, jobID }),
          error: (err) => resolve({ ok: false, error: String(err) }),
        });
      } catch (err) {
        resolve({ ok: false, error: String(err) });
      }
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- IPC: TCP RAW print to network printers (port 9100) ----------
/**
 * Args: { host: string, port?: number (default 9100), dataBase64: string }
 */
ipcMain.handle("beypro:printNet", async (_evt, args = {}) => {
  try {
    const { host, port = 9100, dataBase64 } = args;
    if (!host) return { ok: false, error: "host is required" };
    if (!dataBase64) return { ok: false, error: "dataBase64 is required" };

    const data = Buffer.from(String(dataBase64), "base64");

    return await new Promise((resolve) => {
      const socket = new net.Socket();
      let finished = false;

      const done = (ok, extra = {}) => {
        if (finished) return;
        finished = true;
        try { socket.destroy(); } catch {}
        resolve({ ok, ...extra });
      };

      socket.setTimeout(8000);
      socket.on("timeout", () => done(false, { error: "Timeout" }));
      socket.on("error", (err) => done(false, { error: String(err) }));
      socket.connect(port, host, () => {
        socket.write(data, (err) => {
          if (err) return done(false, { error: String(err) });
          socket.end(() => done(true));
        });
      });
    });
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});
