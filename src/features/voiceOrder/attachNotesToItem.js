import { normalizeVoiceText } from "./voicePhrases";

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/[|,;•]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function attachNotesToItem(existingNotes, incomingNotes) {
  const current = toArray(existingNotes);
  const incoming = toArray(incomingNotes);

  const seen = new Set();
  const merged = [];

  [...current, ...incoming].forEach((note) => {
    const clean = String(note || "").trim();
    if (!clean) return;
    const key = normalizeVoiceText(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(clean);
  });

  return merged.join(" • ");
}

export default attachNotesToItem;
