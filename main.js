// main.js (Electron main process)
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");

// Create window
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

  // In dev, load the Vite dev server URL; in prod, load built index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Native printer access ----
// Load printer module only on Windows; ignore elsewhere
let printer = null;
try {
  if (process.platform === "win32") {
    printer = require("printer"); // optionalDependency
  }
} catch (_) {
  printer = null;
}
// npm i printer

ipcMain.handle("beypro:getInfo", () => ({
  ok: true,
  platform: `${os.platform()} ${os.arch()} (electron)`,
  version: app.getVersion(),
  usb: true,
}));

ipcMain.handle("beypro:getPrinters", () => {
  if (!printer) return [];
  try {
    const list = printer.getPrinters() || [];
    return list.map(p => ({
      name: p.name,
      isDefault: !!p.isDefault,
      driver: p.driverName || p.driver || "",
      port: p.portName || "",
    }));
  } catch {
    return [];
  }
});


ipcMain.handle("beypro:printRaw", async (_evt, { printerName, dataBase64 }) => {
  if (!printer) return { ok: false, error: "Native printer module not available on this OS." };
  return await new Promise((resolve) => {
    const data = Buffer.from(dataBase64, "base64");
    printer.printDirect({
      data,
      printer: printerName,
      type: "RAW",
      success: (jobID) => resolve({ ok: true, jobID }),
      error: (err) => resolve({ ok: false, error: String(err) }),
    });
  });
});

// Optional: direct 9100 network print (no driver)
const net = require("net");
ipcMain.handle("beypro:printNet", async (_evt, { host, dataBase64, port = 9100 }) => {
  return await new Promise((resolve) => {
    const raw = Buffer.from(dataBase64, "base64");
    const sock = net.createConnection(port, host, () => { sock.write(raw); sock.end(); });
    sock.on("error", (err) => resolve({ ok: false, error: String(err) }));
    sock.on("close", () => resolve({ ok: true }));
  });
});
