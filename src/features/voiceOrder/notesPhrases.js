import { normalizeVoiceText } from "./voicePhrases";

const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

const NOTE_PHRASES = {
  en: [
    { note: "no onion", phrases: ["no onion", "no onions", "without onion", "without onions"] },
    { note: "extra sauce", phrases: ["extra sauce", "more sauce"] },
    { note: "well done", phrases: ["well done"] },
  ],
  tr: [
    { note: "sogansiz", phrases: ["sogansiz", "soğansız"] },
    { note: "ekstra sos", phrases: ["ekstra sos"] },
    { note: "iyi pismis", phrases: ["iyi pismis", "iyi pişmiş"] },
  ],
  de: [
    { note: "ohne zwiebeln", phrases: ["ohne zwiebeln"] },
    { note: "extra sosse", phrases: ["extra sosse", "extra soße"] },
  ],
  fr: [
    { note: "sans oignon", phrases: ["sans oignon"] },
    { note: "sauce en plus", phrases: ["sauce en plus"] },
  ],
};

function dedupeNotes(notes) {
  const out = [];
  const seen = new Set();
  (Array.isArray(notes) ? notes : []).forEach((entry) => {
    const clean = String(entry || "").trim();
    if (!clean) return;
    const key = normalizeVoiceText(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  });
  return out;
}

function removePhrase(input, phrase) {
  const wrapped = ` ${input} `;
  const target = ` ${phrase} `;
  if (!wrapped.includes(target)) return input;
  return wrapped.split(target).join(" ").replace(/\s+/g, " ").trim();
}

export function getNotePhrases(lang) {
  const code = normalizeLang(lang);
  return NOTE_PHRASES[code] || NOTE_PHRASES.en;
}

export function extractNotesFromText(text, lang) {
  const dictionary = getNotePhrases(lang)
    .map((entry) => ({
      note: entry.note,
      phrases: (entry.phrases || [])
        .map((phrase) => normalizeVoiceText(phrase))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length),
    }))
    .filter((entry) => entry.phrases.length > 0);

  let working = normalizeVoiceText(text);
  const notes = [];

  dictionary.forEach((entry) => {
    entry.phrases.forEach((phrase) => {
      if (!phrase) return;
      const candidate = ` ${working} `;
      const target = ` ${phrase} `;
      if (candidate.includes(target)) {
        notes.push(entry.note);
        working = removePhrase(working, phrase);
      }
    });
  });

  return {
    notes: dedupeNotes(notes),
    remainder: String(working || "").trim(),
  };
}

export default {
  getNotePhrases,
  extractNotesFromText,
};
