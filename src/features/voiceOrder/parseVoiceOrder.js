import {
  detectIntentKeyword,
  detectRecapCommandKeyword,
  getVoicePhrases,
  normalizeVoiceText,
} from "./voicePhrases";
import { extractNotesFromText } from "./notesPhrases";
import { extractGroupFromText } from "./groupPhrases";
import { extractQty, normalizeTranscript } from "./qtyParser";

const CONNECTOR_REGEX = /\s+(?:and|\&|plus|ve|ile|und|et)\s+|\s*[,;]\s*/gi;
const NOISE_WORDS_REGEX = /\b(?:adet|tane|piece|pieces|pcs|x|stuck|stueck|stucke|stück|stücke)\b/gi;
const PRICE_TRAIL_REGEX = /\b\d+(?:[.,]\d+)?\s*(?:₺|tl|try|lira|eur|€|usd|\$)\b/giu;
const FILLER_WORDS = new Set([
  "ok",
  "okay",
  "i",
  "have",
  "want",
  "would",
  "like",
  "please",
  "hey",
  "uh",
  "um",
  "ya",
  "evet",
  "lutfen",
  "bitte",
  "sil",
  "te",
  "plait",
]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function stripKnownPhrases(normalizedText, phraseList = []) {
  let value = ` ${normalizedText} `;
  const sorted = [...phraseList]
    .map((phrase) => normalizeVoiceText(phrase))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  sorted.forEach((phrase) => {
    value = value.replace(` ${phrase} `, " ");
  });

  return normalizeVoiceText(value);
}

function dropPriceTail(value) {
  return normalizeText(
    String(value || "")
      .replace(PRICE_TRAIL_REGEX, " ")
      .replace(/\b\d+[.,]\d+\b/g, " ")
      .replace(/\s+/g, " ")
  );
}

function mergeNoteArrays(base, extra) {
  const normalized = new Set();
  const out = [];
  [...(Array.isArray(base) ? base : []), ...(Array.isArray(extra) ? extra : [])].forEach((note) => {
    const clean = normalizeText(note);
    if (!clean) return;
    const key = normalizeVoiceText(clean);
    if (!key || normalized.has(key)) return;
    normalized.add(key);
    out.push(clean);
  });
  return out;
}

function mergeSegmentsWithGroupContext(segments) {
  const out = [];
  let pendingGroup = null;

  (Array.isArray(segments) ? segments : []).forEach((segment) => {
    if (!segment) return;
    const segmentGroup = segment.groupLabel || pendingGroup || null;
    const hasQuery = Boolean(segment.queryName);
    const hasNotes = Array.isArray(segment.notes) && segment.notes.length > 0;

    if (hasQuery) {
      out.push({
        ...segment,
        groupLabel: segmentGroup || null,
      });
      pendingGroup = null;
      return;
    }

    if (segment.groupLabel && !hasNotes) {
      pendingGroup = segment.groupLabel;
      out.push({
        ...segment,
        groupLabel: segment.groupLabel,
      });
      return;
    }

    out.push({
      ...segment,
      groupLabel: segmentGroup || null,
    });
  });

  return out;
}

function removeQtyAndFillers(segment, { tokenIndex, fillerSet, dropPrices = false } = {}) {
  const base = dropPrices ? dropPriceTail(segment) : normalizeText(segment);
  const normalizedTokens = normalizeTranscript(base).split(" ").filter(Boolean);

  if (!normalizedTokens.length) return "";

  const outTokens = normalizedTokens.filter((token, index) => {
    if (Number.isInteger(tokenIndex) && index === tokenIndex) return false;
    if (fillerSet?.has(token)) return false;
    return true;
  });

  return normalizeText(outTokens.join(" "));
}

function extractEditPayload(normalizedText, lang, phraseList = [], fillerWords = []) {
  const stripped = stripKnownPhrases(normalizedText, phraseList);
  if (!stripped) {
    return { queryName: null, qty: null };
  }

  const fillerSet = new Set(
    (Array.isArray(fillerWords) ? fillerWords : [])
      .map((word) => normalizeTranscript(word))
      .filter(Boolean)
  );

  const qtyInfo = extractQty(stripped, lang);
  const queryName = removeQtyAndFillers(stripped, {
    tokenIndex: qtyInfo.tokenIndex,
    fillerSet,
    dropPrices: true,
  });

  return {
    queryName: queryName || null,
    qty: qtyInfo.qty,
  };
}

function extractQtyAndName(segmentRaw, lang) {
  const groupExtraction = extractGroupFromText(segmentRaw, lang);
  const noteExtraction = extractNotesFromText(groupExtraction.remainder, lang);
  const cleanedSegment = normalizeText(noteExtraction.remainder)
    .replace(NOISE_WORDS_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanedSegment) {
    if (noteExtraction.notes.length || groupExtraction.groupLabel) {
      return {
        qty: 1,
        queryName: "",
        notes: noteExtraction.notes,
        groupLabel: groupExtraction.groupLabel || null,
        standaloneQty: false,
      };
    }
    return null;
  }

  const qtyInfo = extractQty(cleanedSegment, lang);
  const queryName = removeQtyAndFillers(cleanedSegment, {
    tokenIndex: qtyInfo.tokenIndex,
    fillerSet: FILLER_WORDS,
    dropPrices: true,
  });

  const standaloneQty = Boolean(qtyInfo.qty !== null && qtyInfo.standalone && !queryName);

  if (!queryName && !standaloneQty) {
    if (noteExtraction.notes.length || groupExtraction.groupLabel) {
      return {
        qty: 1,
        queryName: "",
        notes: noteExtraction.notes,
        groupLabel: groupExtraction.groupLabel || null,
        standaloneQty: false,
      };
    }
    return null;
  }

  return {
    qty: Math.max(1, Number(qtyInfo.qty) || 1),
    queryName,
    notes: noteExtraction.notes,
    groupLabel: groupExtraction.groupLabel || null,
    standaloneQty,
    qtyMeta:
      qtyInfo.qty !== null
        ? {
            source: qtyInfo.source,
            confidence: qtyInfo.confidence,
            clamped: Boolean(qtyInfo.clamped),
            originalQty: qtyInfo.originalQty,
          }
        : null,
  };
}

function isContinueSegment(queryName, lang) {
  const normalized = normalizeVoiceText(queryName);
  if (!normalized) return false;
  const phrases = getVoicePhrases(lang);
  return (phrases.continue || []).some((phrase) => {
    const candidate = normalizeVoiceText(phrase);
    return candidate && ` ${normalized} `.includes(` ${candidate} `);
  });
}

export function parseVoiceOrder(transcript, lang, options = {}) {
  const text = normalizeText(transcript);
  const normalizedText = normalizeVoiceText(text);
  const mode = String(options?.mode || "").toUpperCase();
  if (!normalizedText) {
    return { type: "UNKNOWN" };
  }

  if (mode === "RECAP_MODE") {
    const recapCommand = detectRecapCommandKeyword(normalizedText, lang);
    if (recapCommand) {
      return {
        type: "RECAP_COMMAND",
        action: recapCommand.action,
        paymentHint: recapCommand.paymentHint || null,
      };
    }
  }

  const noteProbe = extractNotesFromText(text, lang);
  const hasDetectedNotes = Array.isArray(noteProbe.notes) && noteProbe.notes.length > 0;

  const keywordIntent = detectIntentKeyword(normalizedText, lang);
  if ((keywordIntent === "OPEN_RECAP" || keywordIntent === "FINISH") && !hasDetectedNotes) {
    return { type: "OPEN_RECAP" };
  }
  if (keywordIntent === "READ_BACK") return { type: "READ_BACK" };
  if (keywordIntent === "READ_TOTAL") return { type: "READ_TOTAL" };
  if (keywordIntent === "CLEAR_DRAFT") return { type: "CLEAR_DRAFT" };
  if (keywordIntent === "UNDO_LAST") return { type: "UNDO_LAST" };
  if (keywordIntent === "REMOVE_ITEM") {
    const phrases = getVoicePhrases(lang);
    const payload = extractEditPayload(normalizedText, lang, phrases.remove, phrases.removeFillers);
    return {
      type: "REMOVE_ITEM",
      queryName: payload.queryName,
    };
  }
  if (keywordIntent === "CHANGE_QTY") {
    const phrases = getVoicePhrases(lang);
    const payload = extractEditPayload(normalizedText, lang, phrases.changeQty, phrases.changeFillers);
    return {
      type: "CHANGE_QTY",
      queryName: payload.queryName,
      qty: payload.qty,
    };
  }
  if (keywordIntent === "CANCEL") return { type: "CANCEL" };
  if (keywordIntent === "CONTINUE") {
    const maybeOnlyContinue = (getVoicePhrases(lang)?.continue || []).some((phrase) => {
      const normalizedPhrase = normalizeVoiceText(phrase);
      return normalizedPhrase && normalizedText === normalizedPhrase;
    });
    if (maybeOnlyContinue && !hasDetectedNotes) {
      return { type: "CONTINUE" };
    }
  }

  const protectedText = text.replace(/\ben\s+plus\b/gi, "en_plus");
  const rawSegments = protectedText
    .split(CONNECTOR_REGEX)
    .map((part) => normalizeText(part).replace(/en_plus/gi, "en plus"))
    .filter(Boolean);

  const parsedSegments = mergeSegmentsWithGroupContext(
    rawSegments
      .map((segment) => extractQtyAndName(segment, lang))
      .filter(Boolean)
  );

  const items = parsedSegments.filter((item) => item && item.queryName);
  const looseNotes = parsedSegments
    .filter((item) => item && !item.queryName && Array.isArray(item.notes) && item.notes.length > 0)
    .flatMap((item) => item.notes);
  const looseGroups = parsedSegments
    .filter((item) => item && !item.queryName && item.groupLabel)
    .map((item) => item.groupLabel);
  const standaloneQtySegments = parsedSegments.filter(
    (item) => item && !item.queryName && item.standaloneQty && Number(item.qty) > 0
  );

  if (!items.length) {
    if (
      standaloneQtySegments.length === 1 &&
      rawSegments.length === 1 &&
      looseNotes.length === 0 &&
      looseGroups.length === 0
    ) {
      const qtyOnly = standaloneQtySegments[0];
      return {
        type: "QTY_ONLY",
        qty: qtyOnly.qty,
      };
    }

    if (looseGroups.length > 0 && looseNotes.length === 0) {
      return {
        type: "GROUP_ONLY",
        groupLabel: looseGroups[looseGroups.length - 1],
      };
    }

    if (looseNotes.length > 0) {
      return {
        type: "ADD_NOTES_LAST",
        notes: mergeNoteArrays([], looseNotes),
        groupLabel: looseGroups[looseGroups.length - 1] || null,
      };
    }

    if (keywordIntent === "CONTINUE") {
      return { type: "CONTINUE" };
    }

    return { type: "UNKNOWN" };
  }

  if (keywordIntent === "CONTINUE") {
    const hasConcreteItem = items.some((item) => !isContinueSegment(item?.queryName, lang));
    if (!hasConcreteItem) {
      return { type: "CONTINUE" };
    }
  }

  if (looseNotes.length > 0) {
    const lastIndex = items.length - 1;
    items[lastIndex] = {
      ...items[lastIndex],
      notes: mergeNoteArrays(items[lastIndex]?.notes, looseNotes),
      groupLabel: items[lastIndex]?.groupLabel || looseGroups[looseGroups.length - 1] || null,
    };
  }

  return {
    type: "ADD_ITEMS",
    items,
  };
}

export default parseVoiceOrder;
