const QR_STORAGE_PREFIX = "qr_";

function normalizeStorageToken(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "undefined" || raw === "null") return "";
  return raw;
}

function buildQrStorageCandidates(key, nativeStorage, identifier) {
  if (!key?.startsWith?.(QR_STORAGE_PREFIX) || !nativeStorage) return [key];

  const base = key.slice(QR_STORAGE_PREFIX.length);
  const candidates = [];
  const seen = new Set();
  const addCandidate = (candidate) => {
    const normalized = normalizeStorageToken(candidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const tenantCandidates = [
    nativeStorage.getItem("restaurant_id"),
    nativeStorage.getItem("restaurant_slug"),
    nativeStorage.getItem("qr_last_identifier"),
    identifier,
  ]
    .map((value) => normalizeStorageToken(value))
    .filter(Boolean);

  tenantCandidates.forEach((tenant) => {
    addCandidate(`${QR_STORAGE_PREFIX}${tenant}_${base}`);
  });

  addCandidate(key);

  const suffix = `_${base}`;
  for (let index = 0; index < nativeStorage.length; index += 1) {
    const existingKey = nativeStorage.key(index);
    if (
      existingKey &&
      existingKey.startsWith(QR_STORAGE_PREFIX) &&
      existingKey.endsWith(suffix)
    ) {
      addCandidate(existingKey);
    }
  }

  return candidates.length ? candidates : [key];
}

export function createQrScopedStorage(identifier = "") {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }

  const nativeStorage = window.localStorage;

  return {
    getItem(key) {
      if (!key?.startsWith?.(QR_STORAGE_PREFIX)) {
        try {
          return nativeStorage.getItem(key);
        } catch {
          return null;
        }
      }

      const candidates = buildQrStorageCandidates(key, nativeStorage, identifier);
      for (const candidate of candidates) {
        try {
          const value = nativeStorage.getItem(candidate);
          if (value !== null && value !== undefined) return value;
        } catch {
          // Continue checking fallback keys.
        }
      }
      return null;
    },
    setItem(key, value) {
      if (!key?.startsWith?.(QR_STORAGE_PREFIX)) {
        try {
          nativeStorage.setItem(key, value);
        } catch {
          // ignore
        }
        return;
      }

      const candidates = buildQrStorageCandidates(key, nativeStorage, identifier);
      const existingTarget = candidates.find((candidate) => {
        try {
          return nativeStorage.getItem(candidate) !== null;
        } catch {
          return false;
        }
      });
      const target = existingTarget || candidates[0] || key;
      try {
        nativeStorage.setItem(target, value);
      } catch {
        // ignore
      }
    },
    removeItem(key) {
      if (!key?.startsWith?.(QR_STORAGE_PREFIX)) {
        try {
          nativeStorage.removeItem(key);
        } catch {
          // ignore
        }
        return;
      }

      const candidates = buildQrStorageCandidates(key, nativeStorage, identifier);
      candidates.forEach((candidate) => {
        try {
          nativeStorage.removeItem(candidate);
        } catch {
          // ignore
        }
      });
    },
  };
}

export default createQrScopedStorage;
