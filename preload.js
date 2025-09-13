// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beypro", {
  getInfo: () => ipcRenderer.invoke("beypro:getInfo"),
  getPrinters: () => ipcRenderer.invoke("beypro:getPrinters"),
  printRaw: (args) => ipcRenderer.invoke("beypro:printRaw", args),
  printNetwork9100: (args) => ipcRenderer.invoke("beypro:printNet", args),
});
