// src/utils/qrToEscpos.js
// Utility to convert a QR string or URL to ESC/POS printable bytes

// This utility cannot run in the browser. QR conversion for ESC/POS must be done in Electron/Node.js.
export async function qrStringToEscposBytes(text, width = 256) {
  throw new Error('qrStringToEscposBytes is not supported in the browser. Use Electron backend for QR conversion.');
}
