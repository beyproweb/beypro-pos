// preload.js
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Invoke an IPC channel with an optional fallback channel.
 * Useful when migrating channel names without breaking old builds.
 */
async function invokeWithFallback(primary, fallback, payload) {
  try {
    return await ipcRenderer.invoke(primary, payload);
  } catch (err) {
    if (fallback) {
      try {
        return await ipcRenderer.invoke(fallback, payload);
      } catch (fallbackErr) {
        // Re-throw the original error to make debugging clearer
        throw err;
      }
    }
    throw err;
  }
}

contextBridge.exposeInMainWorld("beypro", {
  /**
   * Optional info endpoint (no fallback needed if you don’t use it)
   */
  getInfo: () => invokeWithFallback("beypro:getInfo", null),

  /**
   * List printers.
   * Primary:  beypro:getPrinters
   * Fallback: printers:list  (from the updated main.js I shared)
   */
  getPrinters: () => invokeWithFallback("beypro:getPrinters", "printers:list"),

  /**
   * Send RAW data to a printer.
   * args: { printerName: string, data: Buffer|string, type?: 'RAW'|'TEXT' }
   * Primary:  beypro:printRaw
   * Fallback: printers:raw
   */
  printRaw: (args) => invokeWithFallback("beypro:printRaw", "printers:raw", args),

  /**
   * Print over TCP/9100 (networked thermal printers).
   * args: { host: string, port?: number, data: Buffer|string }
   * Primary:  beypro:printNet
   * Fallback: printers:net9100  (define this in main.js if you want the fallback)
   */
  printNetwork9100: (args) =>
    invokeWithFallback("beypro:printNet", "printers:net9100", args),
});
