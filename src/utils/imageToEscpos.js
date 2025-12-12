// src/utils/imageToEscpos.js
// Convert an image URL to ESC/POS raster bytes (browser-safe implementation)

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err || new Error("Image load failed"));
    img.src = url;
  });
}

function toRasterBytes(canvas) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const widthBytes = Math.ceil(width / 8);
  const bytes = [];

  // ESC * m nL nH raster format header
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
          const r = data[idx];
          const g = data[idx + 1];
          const bval = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * bval;
          if (lum < 128) byte |= 0x80 >> b;
        }
        bytes.push(byte);
      }
    }
    // line feed after each slice
    bytes.push(0x0a);
  }

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
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to grayscale and threshold
  const imgData = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const r = imgData.data[i];
    const g = imgData.data[i + 1];
    const b = imgData.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const v = lum < 150 ? 0 : 255;
    imgData.data[i] = imgData.data[i + 1] = imgData.data[i + 2] = v;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  return toRasterBytes(canvas);
}
