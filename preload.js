const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beypro", {
  getPrinters: () => ipcRenderer.invoke("beypro:getPrinters"),
  printRaw: (args) => ipcRenderer.invoke("beypro:printRaw", args),
  printWindows: (args) => ipcRenderer.invoke("beypro:printWindows", args),
  printNet: (args) => ipcRenderer.invoke("beypro:printNet", args),
});
