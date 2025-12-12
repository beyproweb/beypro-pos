// src/utils/qrToEscpos.js
// Browser-friendly QR to ESC/POS raster bytes

import QRCode from "qrcode";

function toRasterBytesFromCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const bytes = [];

  for (let y = 0; y < height; y += 24) {
    const sliceHeight = Math.min(24, height - y);
    bytes.push(0x1b, 0x2a, 0x21, widthBytes & 0xff, (widthBytes >> 8) & 0xff);

    for (let xb = 0; xb < widthBytes; xb++) {
      for (let k = 0; k < sliceHeight; k++) {
        let byte = 0;
        const basePx = xb * 8;
        for (let b = 0; b < 8; b++) {
          const px = basePx + b;
          if (px >= width) continue;
          const idx = ((y + k) * width + px) * 4;
          const val = data[idx]; // already monochrome
          if (val < 128) byte |= 0x80 >> b;
        }
        bytes.push(byte);
      }
    }
    bytes.push(0x0a);
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
  return toRasterBytesFromCanvas(canvas);
}
