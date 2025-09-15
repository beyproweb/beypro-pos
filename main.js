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
  // Force hash so React Router won't try to match the raw file path
  const indexPath = path.join(__dirname, "dist", "index.html").replace(/\\/g, "/");
  win.loadURL(`file://${indexPath}#/`);
}

}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- Native printer access ----
// Load printer module only on Windows; ignore elsewhere
// ---- Native printer access ----
// Load printer module only on Windows; ignore elsewhere
let printer = null;
try {
  if (process.platform === "win32") {
    printer = require("printer"); // native addon
    console.log("✅ Printer module loaded successfully");
  }
} catch (err) {
  console.error("❌ Failed to load printer module:", err);
  printer = null;
}

// ---- Info handler ----
ipcMain.handle("beypro:getInfo", () => ({
  ok: true,
  platform: `${os.platform()} ${os.arch()} (electron)`,
  version: app.getVersion(),
  usb: true,
}));

// ---- Printers handler ----
ipcMain.handle("beypro:getPrinters", () => {
  if (!printer) {
    console.warn("⚠️ Printer module not available, returning empty list");
    return [];
  }
  try {
    const list = printer.getPrinters() || [];
    console.log("🖨️ Found printers:", list);
    return list.map(p => ({
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
