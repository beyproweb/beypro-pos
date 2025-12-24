// src/utils/imageToEscpos.js
// Convert an image URL to ESC/POS raster bytes (browser-safe implementation)
// Output: GS v 0 (raster) rows — matches Electron main implementation.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err || new Error("Image load failed"));
    img.src = url;
  });
}

function toGsV0RasterRows(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const rows = [];

  // 4x4 Bayer matrix (ordered dithering helps light logos print more reliably).
  const bayer4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < height; y += 1) {
    const row = [];
    let hasInk = false;
    // GS v 0 m xL xH yL yH [data]
    // Send 1 row at a time to reduce memory and avoid printer buffer issues.
    row.push(0x1d, 0x76, 0x30, 0x00, widthBytes & 0xff, (widthBytes >> 8) & 0xff, 0x01, 0x00);

    for (let xb = 0; xb < widthBytes; xb += 1) {
      let byte = 0;
      const basePx = xb * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        const px = basePx + bit;
        if (px >= width) continue;
        const idx = (y * width + px) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const alpha = data[idx + 3];

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const dither = (bayer4[y & 3][px & 3] - 7.5) * 8; // ~[-60, +60]
        const threshold = 180 + dither;
        const effectiveLum = alpha < 128 ? 255 : lum;

        if (effectiveLum < threshold) byte |= 1 << (7 - bit);
      }
      if (byte !== 0) hasInk = true;
      row.push(byte);
    }
    rows.push({ bytes: row, hasInk });
  }

  let lastInkRow = rows.length - 1;
  while (lastInkRow >= 0 && !rows[lastInkRow].hasInk) lastInkRow -= 1;
  const trimmed = lastInkRow >= 0 ? rows.slice(0, lastInkRow + 1) : rows;
  const bytes = [];
  trimmed.forEach((r) => bytes.push(...r.bytes));
  return new Uint8Array(bytes);
}

export async function imageUrlToEscposBytes(url, targetWidth = 384) {
  const img = await loadImage(url);
  const scale = targetWidth / img.width;
  const width = Math.min(targetWidth, Math.floor(img.width * scale));
  const height = Math.floor(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  return toGsV0RasterRows(canvas);
}
