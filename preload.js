const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beypro", {
  getPrinters: () => ipcRenderer.invoke("beypro:getPrinters"),
  printRaw: (args) => ipcRenderer.invoke("beypro:printRaw", args),
  printWindows: (args) => ipcRenderer.invoke("beypro:printWindows", args),
  printNet: (args) => ipcRenderer.invoke("beypro:printNet", args),
  getPrinterConfig: (tenantId) => ipcRenderer.invoke("beypro:getPrinterConfig", tenantId),
  setPrinterConfig: (tenantId, settings) => ipcRenderer.invoke("beypro:setPrinterConfig", { tenantId, settings }),
  // Alias for direct network printing
  printDirect: (args) => ipcRenderer.invoke("beypro:printNet", args),
});
