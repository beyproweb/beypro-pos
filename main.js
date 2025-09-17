// ---------- Native printer access (robust with fallback + logging) ----------
const fs = require("fs");
const { execFile } = require("child_process");
const LOG_PATH = path.join(app.getPath("userData"), "printer-debug.log");

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  console.log(...args);
}

// Try to load the native module
let printer = null;
try {
  // If you switched package, change the require below:
  // const modName = "printer";
  const modName = "@thesusheer/electron-printer";
  printer = require(modName);
  log("✅ Printer module loaded:", modName, "electron", process.versions.electron, "node", process.versions.node);
} catch (err) {
  log("❌ Failed to load printer module:", err?.message || err);
  printer = null;
}

// --- Windows PowerShell fallback ---
function psJson(cmd) {
  return new Promise((resolve, reject) => {
    const ps = process.env.ComSpec?.toLowerCase().includes("cmd") ? "powershell.exe" : "powershell.exe";
    execFile(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `${cmd} | ConvertTo-Json -Depth 5`], { windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr?.toString() || err.message));
      }
      try {
        const parsed = JSON.parse(stdout.toString() || "[]");
        resolve(parsed);
      } catch (e) {
        reject(new Error("Failed to parse PowerShell JSON"));
      }
    });
  });
}

async function listPrintersFallbackWindows() {
  try {
    const res = await psJson("Get-Printer | Select-Object Name,DriverName,PortName,Shared,Type,Default");
    const arr = Array.isArray(res) ? res : [res];
    const mapped = arr
      .filter(Boolean)
      .map(p => ({
        name: p.Name,
        isDefault: !!p.Default,
        driver: p.DriverName || "",
        port: p.PortName || "",
        source: "powershell"
      }));
    return mapped;
  } catch (e) {
    log("⚠️ PowerShell fallback failed:", e?.message || e);
    return [];
  }
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
      list = list.map(p => ({
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

// ---------- IPC: RAW print via module (if available) ----------
ipcMain.handle("beypro:printRaw", async (_evt, args = {}) => {
  if (!printer || typeof printer.printDirect !== "function") {
    log("❌ printRaw requested but printer module unavailable.");
    return { ok: false, error: "Printer module unavailable. Use network 9100." };
  }
  try {
    const { printerName, dataBase64, type } = args;
    if (!dataBase64) return { ok: false, error: "dataBase64 is required" };
    const data = Buffer.from(String(dataBase64), "base64");

    return await new Promise((resolve) => {
      try {
        printer.printDirect({
          data,
          type: type || "RAW",
          printer: printerName || undefined,
          docname: "Beypro Ticket",
          success: (jobID) => { log("✅ RAW printed job:", jobID); resolve({ ok: true, jobID }); },
          error: (err)   => { log("❌ RAW print error:", err?.message || err); resolve({ ok: false, error: String(err) }); },
        });
      } catch (err) {
        log("❌ RAW print exception:", err?.message || err);
        resolve({ ok: false, error: String(err) });
      }
    });
  } catch (err) {
    log("❌ RAW print outer error:", err?.message || err);
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
    log("❌ Net9100 error:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  }
});
