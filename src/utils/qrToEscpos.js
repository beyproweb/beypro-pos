// src/utils/qrToEscpos.js
// Browser-friendly QR to ESC/POS raster bytes
// Output: GS v 0 (raster) rows — matches Electron main implementation.

import QRCode from "qrcode";

function toGsV0RasterRowsFromCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const bytes = [];

  for (let y = 0; y < height; y += 1) {
    bytes.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, 0x01, 0x00);
    for (let xb = 0; xb < widthBytes; xb += 1) {
      let byte = 0;
      const basePx = xb * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        const px = basePx + bit;
        if (px >= width) continue;
        const idx = (y * width + px) * 4;
        const val = data[idx]; // QR canvas is monochrome
        if (val < 128) byte |= 1 << (7 - bit);
      }
      bytes.push(byte);
    }
  }

  return new Uint8Array(bytes);
}

export async function qrStringToEscposBytes(text, size = 256) {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text || "", {
    errorCorrectionLevel: "M",
    width: size,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return toGsV0RasterRowsFromCanvas(canvas);
}
