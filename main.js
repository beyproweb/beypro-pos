// ===============================
// BEYPRO ELECTRON MAIN PROCESS
// FULL WORKING PRINT SYSTEM
// ===============================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const net = require("net");

// MAIN PRINTER ENGINE (used by ALL Windows printers)
const { print } = require("pdf-to-printer");

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
    const indexPath = path.join(__dirname, "dist", "index.html").replace(/\\/g, "/");
    win.loadURL(`file://${indexPath}#/`);
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
