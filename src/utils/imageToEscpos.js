// src/utils/imageToEscpos.js
// Utility to convert an image URL to ESC/POS printable bytes (black & white, fit receipt width)

// This utility cannot run in the browser. Image conversion for ESC/POS must be done in Electron/Node.js.
export async function imageUrlToEscposBytes(url, width = 384) {
  throw new Error('imageUrlToEscposBytes is not supported in the browser. Use Electron backend for image conversion.');
}
