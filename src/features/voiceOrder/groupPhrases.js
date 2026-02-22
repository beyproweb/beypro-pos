import { normalizeVoiceText } from "./voicePhrases";

const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

const GROUP_PHRASES = {
  en: [
    { label: "Me", phrases: ["for me"] },
    { label: "Her", phrases: ["for her", "for him"] },
    { label: "Kids", phrases: ["for kids", "for the kids", "for children"] },
  ],
  tr: [
    { label: "Me", phrases: ["benim icin", "benim için"] },
    { label: "Her", phrases: ["onun icin", "onun için"] },
    { label: "Kids", phrases: ["cocuklar icin", "çocuklar için"] },
  ],
  de: [
    { label: "Me", phrases: ["fur mich", "für mich"] },
    { label: "Her", phrases: ["fur sie", "für sie", "fur ihn", "für ihn"] },
    { label: "Kids", phrases: ["fur die kinder", "für die kinder"] },
  ],
  fr: [
    { label: "Me", phrases: ["pour moi"] },
    { label: "Her", phrases: ["pour elle", "pour lui"] },
    { label: "Kids", phrases: ["pour les enfants"] },
  ],
};

function removePhrase(input, phrase) {
  const wrapped = ` ${String(input || "")} `;
  const target = ` ${phrase} `;
  if (!wrapped.includes(target)) return String(input || "");
  return wrapped.split(target).join(" ").replace(/\s+/g, " ").trim();
}

export function getGroupPhrases(lang) {
  const code = normalizeLang(lang);
  return GROUP_PHRASES[code] || GROUP_PHRASES.en;
}

export function extractGroupFromText(text, lang) {
  const normalized = normalizeVoiceText(text);
  if (!normalized) return { groupLabel: null, remainder: "" };

  const catalog = getGroupPhrases(lang)
    .flatMap((entry) =>
      (entry.phrases || []).map((phrase) => ({
        label: entry.label,
        phrase: normalizeVoiceText(phrase),
      }))
    )
    .filter((entry) => entry.phrase)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const entry of catalog) {
    const phrase = entry.phrase;
    const wrapped = ` ${normalized} `;
    const target = ` ${phrase} `;
    if (wrapped.includes(target)) {
      return {
        groupLabel: entry.label,
        remainder: removePhrase(normalized, phrase),
      };
    }
  }

  return {
    groupLabel: null,
    remainder: normalized,
  };
}

export default {
  getGroupPhrases,
  extractGroupFromText,
};
