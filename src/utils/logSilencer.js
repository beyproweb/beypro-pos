// src/utils/logSilencer.js
// Global log silencer for production environments
// Silences console.log, console.debug, console.info in production
// Preserves console.warn and console.error in all environments

export function setupLogSilencer() {
  const isProduction = import.meta.env.PROD;

  if (!isProduction) {
    // Development: keep all logs
    return;
  }

  // Production: silence noisy logs, keep warnings and errors
  const noop = () => {};

  console.log = noop;
  console.debug = noop;
  console.info = noop;

  // console.warn and console.error are preserved
}
