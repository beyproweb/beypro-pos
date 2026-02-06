// Minimal service worker to make the QR Menu installable as a PWA.
// Note: We intentionally keep caching logic minimal to avoid breaking the POS app.
// Installability requirements (Chrome/Android): served over HTTPS + manifest + SW controlling the page.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler (still counts as a fetch handler for installability).
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

