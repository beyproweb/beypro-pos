const DEFAULT_SOUND_FILES = {
  new_order: "/sounds/new_order.mp3",
  payment_made: "/sounds/cash.mp3",
};

const audioCache = new Map();

const clampVolume = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.8;
  return Math.min(Math.max(value, 0), 1);
};

const normalizePath = (source) => {
  if (!source) return null;
  if (source === "none") return null;
  if (source.startsWith("/")) return source;
  return `/sounds/${source}`;
};

const resolveSoundPath = (eventKey, settings) => {
  if (settings) {
    const { eventSounds, defaultSound, enableSounds } = settings;
    if (enableSounds === false) return null;

    const eventSpecific = normalizePath(eventSounds?.[eventKey]);
    if (eventSpecific) return eventSpecific;

    const fallback = normalizePath(defaultSound);
    if (fallback) return fallback;
  }
  return DEFAULT_SOUND_FILES[eventKey] || "/sounds/ding.mp3";
};

const getAudioInstance = (src) => {
  if (!audioCache.has(src)) {
    const base = new Audio(src);
    base.preload = "auto";
    audioCache.set(src, base);
  }
  return audioCache.get(src).cloneNode(true);
};

const playSound = (eventKey) => {
  if (typeof window === "undefined") return;
  const settings = window.notificationSettings;

  const src = resolveSoundPath(eventKey, settings);
  if (!src) return;

  try {
    const audio = getAudioInstance(src);
    audio.volume = clampVolume(settings?.volume ?? 0.8);
    audio.currentTime = 0;
    audio.play().catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[soundManager] Failed to play ${eventKey}`, err);
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[soundManager] Audio unavailable for ${eventKey}`, err);
    }
  }
};

export const attachGlobalSoundHandlers = (win = typeof window !== "undefined" ? window : undefined) => {
  if (!win) return () => {};

  const prevHandlers = {
    playNewOrderSound: win.playNewOrderSound,
    playPaidSound: win.playPaidSound,
  };

  win.playNewOrderSound = () => playSound("new_order");
  win.playPaidSound = () => playSound("payment_made");

  return () => {
    if (prevHandlers.playNewOrderSound) win.playNewOrderSound = prevHandlers.playNewOrderSound;
    else delete win.playNewOrderSound;

    if (prevHandlers.playPaidSound) win.playPaidSound = prevHandlers.playPaidSound;
    else delete win.playPaidSound;
  };
};

export default attachGlobalSoundHandlers;
