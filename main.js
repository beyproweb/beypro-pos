// ---------- Core imports (must come first) ----------
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const net = require("net");
const fs = require("fs");
const { execFile } = require("child_process");

// Log file (safe to call with 'app' here)
const LOG_PATH = path.join(app.getPath("userData"), "printer-debug.log");
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
  console.log(...args);
}

// ---------- App / window bootstrap ----------
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

  // In dev, use Vite dev server; in prod, load built index.html with hash routing
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const indexPath = path
      .join(__dirname, "dist", "index.html")
      .replace(/\\/g, "/");
    win.loadURL(`file://${indexPath}#/`);
  }

  win.on("closed", () => (win = null));
}

// Single-instance & lifecycle
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Try to load the native module
let printer = null;
try {
  // If you switched package, change the require below:
  // const modName = "printer";
  const modName = "@thesusheer/electron-printer";
  printer = require(modName);
  log(
    "✅ Printer module loaded:",
    modName,
    "electron",
    process.versions.electron,
    "node",
    process.versions.node
  );
} catch (err) {
  log("❌ Failed to load printer module:", err?.message || err);
  printer = null;
}

// --- Windows PowerShell helper (for listing printers fallback) ---
function psJson(cmd) {
  return new Promise((resolve, reject) => {
    const ps = "powershell.exe";
    execFile(
      ps,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `${cmd} | ConvertTo-Json -Depth 5`,
      ],
      { windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr?.toString() || err.message));
        }
        try {
          const parsed = JSON.parse(stdout.toString() || "[]");
          resolve(parsed);
        } catch (e) {
          reject(new Error("Failed to parse PowerShell JSON"));
        }
      }
    );
  });
}

async function listPrintersFallbackWindows() {
  try {
    const res = await psJson(
      "Get-Printer | Select-Object Name,DriverName,PortName,Shared,Type,Default"
    );
    const arr = Array.isArray(res) ? res : [res];
    const mapped = arr
      .filter(Boolean)
      .map((p) => ({
        name: p.Name,
        isDefault: !!p.Default,
        driver: p.DriverName || "",
        port: p.PortName || "",
        source: "powershell",
      }));
    return mapped;
  } catch (e) {
    log("⚠️ PowerShell fallback failed:", e?.message || e);
    return [];
  }
}

// ---------- Shared helper: print via module.printDirect ----------
async function rawPrintWithModule({ printerName, data, type }) {
  if (!printer || typeof printer.printDirect !== "function") {
    log("❌ rawPrintWithModule called but printer module unavailable");
    return {
      ok: false,
      error: "Printer module unavailable. Install @thesusheer/electron-printer.",
    };
  }

  const dataLen = data?.length ?? 0;
  const jobType = type || "RAW";

  log(
    `➡️ rawPrintWithModule: printer="${printerName || "<default>"}" type=${jobType} bytes=${dataLen}`
  );

  return await new Promise((resolve) => {
    try {
      printer.printDirect({
        data,
        type: jobType,
        printer: printerName || undefined, // undefined => default printer
        docname: "Beypro Ticket",
        success: (jobID) => {
          log(
            `✅ Spool accepted: jobID=${jobID} printer="${printerName}" type=${jobType} bytes=${dataLen}`
          );
          resolve({ ok: true, jobID });
        },
        error: (err) => {
          log(
            `❌ Spool error: printer="${printerName}" type=${jobType} bytes=${dataLen} err=${
              err?.message || err
            }`
          );
          resolve({ ok: false, error: String(err) });
        },
      });
    } catch (err) {
      log(
        `❌ printDirect exception: printer="${printerName}" type=${jobType} bytes=${dataLen} err=${
          err?.message || err
        }`
      );
      resolve({ ok: false, error: String(err) });
    }
  });
}

// ---------- IPC: app/bridge info ----------
ipcMain.handle("beypro:getInfo", () => ({
  ok: true,
  platform: `${os.platform()} ${os.arch()} (electron)`,
  version: app.getVersion(),
  usb: !!printer,
  logPath: LOG_PATH,
}));

// ---------- IPC: list printers (module → fallback) ----------
ipcMain.handle("beypro:getPrinters", async () => {
  let list = [];
  try {
    if (printer && typeof printer.getPrinters === "function") {
      list = printer.getPrinters() || [];
      // normalize shapes
      list = list.map((p) => ({
        name: p.name || p.Name || "",
        isDefault: !!(p.isDefault || p.Default),
        driver: p.driverName || p.driver || p.DriverName || "",
        port: p.portName || p.PortName || "",
        source: "module",
      }));
      log("🖨️ Module printers:", list);
    }
  } catch (err) {
    log("❌ Module getPrinters failed:", err?.message || err);
  }

  // Fallback if module missing or returned empty
  if (!list || list.length === 0) {
    if (process.platform === "win32") {
      const psList = await listPrintersFallbackWindows();
      if (psList.length > 0) {
        log("🖨️ PowerShell printers:", psList);
        return psList;
      }
    }
    log("⚠️ No printers found by module or fallback.");
    return [];
  }
  return list;
});

// ---------- IPC: RAW print via module (ESC/POS via driver: USB or any installed printer) ----------
ipcMain.handle("beypro:printRaw", async (_evt, args = {}) => {
  try {
    const { printerName, dataBase64, type } = args;
    if (!dataBase64) return { ok: false, error: "dataBase64 is required" };

    const data = Buffer.from(dataBase64, "base64");
    return await rawPrintWithModule({ printerName, data, type });
  } catch (err) {
    log("❌ RAW print outer error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- IPC: Windows "System printer" mode (NEW) ----------
/**
 * This is the "Option 2" you asked for:
 * - Frontend can treat this as "Print via Windows system printer"
 * - It uses the same driver-based spooler as printRaw (module.printDirect)
 * - Main difference is semantic: you pass the Windows printer name (USB or LAN)
 *
 * Frontend example:
 *   window.electron.invoke("beypro:printWindows", {
 *     printerName: "FY-625X LAN",
 *     dataBase64: "...ESC/POS or plain text...",
 *     type: "RAW"
 *   });
 */
ipcMain.handle("beypro:printWindows", async (_evt, args = {}) => {
  try {
    const { printerName, dataBase64, type } = args;

    if (!dataBase64) return { ok: false, error: "dataBase64 is required" };
    if (!printerName) {
      // allow default printer if you want, but usually you’ll pick a specific one
      log("⚠️ printWindows called without printerName – using default printer");
    }

    const data = Buffer.from(dataBase64, "base64");

    // On Windows, this will spool via the installed driver (USB OR LAN).
    // On other platforms it will still try, but your main use-case is win32.
    if (!printer || typeof printer.printDirect !== "function") {
      log("❌ printWindows requested but printer module unavailable.");
      return {
        ok: false,
        error:
          "Printer module unavailable for Windows printing. Make sure @thesusheer/electron-printer is installed.",
      };
    }

    return await rawPrintWithModule({ printerName, data, type });
  } catch (err) {
    log("❌ Windows print outer error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
});

// ---------- IPC: TCP RAW print to network printers (port 9100) ----------
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
        try {
          socket.destroy();
        } catch {}
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
    log("❌ Net9100 error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
});
