// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beypro", {
  // Diagnostics
  getInfo: () => ipcRenderer.invoke("beypro:getInfo"),

  // List local system printers (Windows/USB)
  getPrinters: () => ipcRenderer.invoke("beypro:getPrinters"),

  // Print ESC/POS RAW via Windows spooler (USB OR LAN)
  printRaw: (args) => ipcRenderer.invoke("beypro:printRaw", args),

  // Explicit Windows printer mode (LAN printer installed on Windows)
  printWindows: (args) => ipcRenderer.invoke("beypro:printWindows", args),

  // Direct TCP Raw ESC/POS port 9100
  printNet: (args) => ipcRenderer.invoke("beypro:printNet", args)
});
