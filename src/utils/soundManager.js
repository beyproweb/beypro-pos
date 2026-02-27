const DEFAULT_SOUND_FILES = {
  new_order: "/sounds/new_order.mp3",
  payment_made: "/sounds/cash.mp3",
  call_waiter: "/sounds/alert.mp3",
};

const audioCache = new Map();
const loopingAudioByEvent = new Map();
const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".ogg"];

const clampVolume = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.8;
  return Math.min(Math.max(value, 0), 1);
};

const normalizePath = (source) => {
  if (!source) return null;
  const raw = String(source).trim();
  if (!raw) return null;

  const lowered = raw.toLowerCase();
  if (lowered === "none" || lowered === "off" || lowered === "silent") return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  let candidate = raw.replace(/^(\.\/|\.{2}\/)+/, "");
  const hasKnownExtension = SUPPORTED_EXTENSIONS.some((ext) =>
    candidate.toLowerCase().endsWith(ext)
  );
  if (!hasKnownExtension) candidate += ".mp3";

  if (candidate.startsWith("/")) return candidate;
  if (candidate.startsWith("sounds/")) return `/${candidate}`;
  return `/sounds/${candidate}`;
};

const resolveSoundPath = (eventKey, settings) => {
  if (settings) {
    const { eventSounds, defaultSound, enableSounds } = settings;
    if (enableSounds === false) return null;
    if (eventKey === "call_waiter" && settings.enableCallWaiterAlerts === false) return null;

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

const stopLoopingSound = (eventKey) => {
  const existing = loopingAudioByEvent.get(eventKey);
  if (!existing) return;
  try {
    existing.pause();
    existing.currentTime = 0;
  } catch {
    // ignore browser audio errors
  }
  loopingAudioByEvent.delete(eventKey);
};

const startLoopingSound = (eventKey) => {
  if (typeof window === "undefined") return;
  const settings = window.notificationSettings;
  const src = resolveSoundPath(eventKey, settings);
  if (!src) {
    stopLoopingSound(eventKey);
    return;
  }

  const volume = clampVolume(settings?.volume ?? 0.8);
  const existing = loopingAudioByEvent.get(eventKey);
  if (existing) {
    try {
      existing.volume = volume;
      if (existing.src?.endsWith(src) && existing.paused) {
        existing.play().catch(() => {});
      }
      if (existing.src?.endsWith(src)) {
        return;
      }
    } catch {
      // recreate below
    }
    stopLoopingSound(eventKey);
  }

  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.loop = true;
    audio.volume = volume;
    loopingAudioByEvent.set(eventKey, audio);
    audio.play().catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[soundManager] Failed to start loop ${eventKey}`, err);
      }
    });
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[soundManager] Audio unavailable for loop ${eventKey}`, err);
    }
  }
};

const stopAllLoopingSounds = () => {
  Array.from(loopingAudioByEvent.keys()).forEach((eventKey) => {
    stopLoopingSound(eventKey);
  });
};

export const attachGlobalSoundHandlers = (win = typeof window !== "undefined" ? window : undefined) => {
  if (!win) return () => {};

  const prevHandlers = {
    playNewOrderSound: win.playNewOrderSound,
    playPaidSound: win.playPaidSound,
    startCallWaiterSound: win.startCallWaiterSound,
    stopCallWaiterSound: win.stopCallWaiterSound,
    stopAllNotificationLoops: win.stopAllNotificationLoops,
  };

  win.playNewOrderSound = () => playSound("new_order");
  win.playPaidSound = () => playSound("payment_made");
  win.startCallWaiterSound = () => startLoopingSound("call_waiter");
  win.stopCallWaiterSound = () => stopLoopingSound("call_waiter");
  win.stopAllNotificationLoops = () => stopAllLoopingSounds();

  return () => {
    stopAllLoopingSounds();

    if (prevHandlers.playNewOrderSound) win.playNewOrderSound = prevHandlers.playNewOrderSound;
    else delete win.playNewOrderSound;

    if (prevHandlers.playPaidSound) win.playPaidSound = prevHandlers.playPaidSound;
    else delete win.playPaidSound;

    if (prevHandlers.startCallWaiterSound) win.startCallWaiterSound = prevHandlers.startCallWaiterSound;
    else delete win.startCallWaiterSound;

    if (prevHandlers.stopCallWaiterSound) win.stopCallWaiterSound = prevHandlers.stopCallWaiterSound;
    else delete win.stopCallWaiterSound;

    if (prevHandlers.stopAllNotificationLoops) {
      win.stopAllNotificationLoops = prevHandlers.stopAllNotificationLoops;
    } else {
      delete win.stopAllNotificationLoops;
    }
  };
};

export default attachGlobalSoundHandlers;
