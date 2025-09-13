// src/utils/publicPath.js
// Works in web and Electron. In Electron prod, BASE_URL is "./".
export function publicPath(name) {
  const base = import.meta.env.BASE_URL || './';
  return `${base}${String(name).replace(/^\//, '')}`;
}

// For sound files: fixes leading "/" and double ".mp3.mp3"
export function soundFileUrl(file) {
  const clean = String(file || '')
    .replace(/^\//, '')
    .replace(/\.mp3$/i, '') + '.mp3';
  return publicPath(clean);
}
