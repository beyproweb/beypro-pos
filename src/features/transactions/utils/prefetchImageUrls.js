export const prefetchImageUrls = (urls, limit = 48) => {
  if (typeof window === "undefined") return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  const uniq = [];
  const seen = new Set();
  for (const url of urls) {
    if (!url || typeof url !== "string") continue;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    uniq.push(trimmed);
    if (uniq.length >= limit) break;
  }

  const run = () => {
    uniq.forEach((src) => {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 0);
  }
};
