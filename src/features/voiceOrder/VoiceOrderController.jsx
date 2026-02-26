import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { VoiceOrderFloating } from "../voiceOrderFloating";
import DraftOrderRecapModal from "./DraftOrderRecapModal";
import ClarificationSheet from "./ClarificationSheet";
import useDraftOrder from "./useDraftOrder";
import parseVoiceOrder from "./parseVoiceOrder";
import { detectIntentKeyword, normalizeVoiceText } from "./voicePhrases";
import { buildWaiterSuggestions, detectMainSuggestionCategory } from "./suggestionsMap";
import { createProductMatcher } from "./matcher";
import { attachNotesToItem } from "./attachNotesToItem";
import { extractQty } from "./qtyParser";
import { usePaymentMethods } from "../../hooks/usePaymentMethods";

const MODE = {
  IDLE: "IDLE",
  AWAITING_CHOICE: "AWAITING_CHOICE",
  AWAITING_QTY: "AWAITING_QTY",
  AWAITING_NOTE: "AWAITING_NOTE",
};

const AUTO_REOPEN_CHOICE_KINDS = new Set([
  "add_ambiguous",
  "remove_ambiguous",
  "change_ambiguous",
  "unknown_product",
]);

const YES_WORDS = {
  en: ["yes", "yeah", "yep", "ok"],
  tr: ["evet", "tamam"],
  de: ["ja", "ok"],
  fr: ["oui", "daccord", "ok"],
};

const NO_WORDS = {
  en: ["no", "cancel"],
  tr: ["hayir", "iptal"],
  de: ["nein", "abbrechen"],
  fr: ["non", "annuler"],
};

const TRY_AGAIN_WORDS = {
  en: ["try again", "again"],
  tr: ["tekrar", "tekrar dene"],
  de: ["nochmal", "erneut"],
  fr: ["encore", "reessayer"],
};

const SPEECH_LANG_MAP = {
  en: "en-US",
  tr: "tr-TR",
  de: "de-DE",
  fr: "fr-FR",
};

const NOISY_MODE_STORAGE_PREFIX = "qr_voice_noisy_mode";

const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

const normalizeScopeSegment = (value, fallbackValue) => {
  const raw = String(value ?? "").trim();
  return encodeURIComponent(raw || fallbackValue);
};

function buildScopedStorageKey(prefix, { restaurantId, tableId, fallbackScope } = {}) {
  const hasRestaurant = String(restaurantId ?? "").trim().length > 0;
  const hasTable = String(tableId ?? "").trim().length > 0;
  const fallback = String(fallbackScope ?? "").trim() || "fallback";

  const restaurantSegment = normalizeScopeSegment(
    hasRestaurant ? restaurantId : "fallback",
    "fallback"
  );
  const tableSegment = normalizeScopeSegment(
    hasTable ? tableId : hasRestaurant ? "default" : fallback,
    "default"
  );

  return `${prefix}:${restaurantSegment}:${tableSegment}`;
}

function readBooleanPreference(storageKey, defaultValue = false) {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return defaultValue;
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

function writeBooleanPreference(storageKey, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, value ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function buildAddMessage(addedItems, tVoice) {
  if (!addedItems.length) {
    return tVoice("voice.waiter.didntCatchThat", "I didn't catch that — could you repeat?");
  }
  return tVoice("voice.waiter.anythingElse", "Got it. Anything else?");
}

function parseSpokenQty(text, lang) {
  const qtyInfo = extractQty(text, lang);
  if (Number.isFinite(qtyInfo?.qty) && qtyInfo.qty > 0) return qtyInfo.qty;
  return null;
}

function parseChoiceIndex(text, lang) {
  const qty = parseSpokenQty(text, lang);
  if (Number.isFinite(qty) && qty >= 1 && qty <= 9) {
    return qty - 1;
  }

  const normalized = normalizeVoiceText(text);
  const ordinals = {
    first: 0,
    second: 1,
    third: 2,
    ilk: 0,
    ikinci: 1,
    ucuncu: 2,
    erste: 0,
    zweite: 1,
    dritte: 2,
    premier: 0,
    premiere: 0,
    deuxieme: 1,
    troisieme: 2,
  };

  if (ordinals[normalized] !== undefined) return ordinals[normalized];
  return null;
}

function includesOne(text, words = []) {
  const normalized = normalizeVoiceText(text);
  return words.some((word) => {
    const w = normalizeVoiceText(word);
    return w && ` ${normalized} `.includes(` ${w} `);
  });
}

function formatTryCurrency(value, lang) {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(lang || "en", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₺${amount.toFixed(2)}`;
  }
}

function buildCompactDraftLine(items, tVoice) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return "";
  const preview = safeItems
    .slice(0, 3)
    .map((item) => {
      const groupPrefix = item?.groupLabel ? `[${item.groupLabel}] ` : "";
      return `${Math.max(1, Number(item?.qty) || 1)}x ${groupPrefix}${item?.name || "-"}`;
    })
    .join(", ");
  const extraCount = Math.max(0, safeItems.length - 3);
  if (!extraCount) return preview;
  return `${preview} ${tVoice("voice.waiter.moreItemsSuffix", "+{{count}} more", { count: extraCount })}`;
}

function normalizeGroupLabel(value) {
  const raw = String(value || "").trim();
  return raw || "Table";
}

function buildGroupFollowUpMessage(groupLabel, tVoice) {
  const safeGroup = normalizeGroupLabel(groupLabel);
  if (safeGroup === "Me") {
    return tVoice("voice.waiter.whatWouldMeLike", "What would you like?");
  }
  if (safeGroup === "Kids") {
    return tVoice("voice.waiter.whatWouldKidsLike", "What would the kids like?");
  }
  if (safeGroup === "Her") {
    return tVoice("voice.waiter.whatWouldHerLike", "What would she like?");
  }
  return tVoice("voice.waiter.whatWouldGroupLike", "What would {{group}} like?", { group: safeGroup });
}

function resolvePaymentMethodFromHint(methods, hint) {
  const normalizedHint = String(hint || "").toLowerCase().trim();
  if (!normalizedHint) return null;

  const needle = normalizedHint === "cash" ? "cash" : "card";
  const safeMethods = Array.isArray(methods) ? methods : [];
  const candidate = safeMethods.find((method) => {
    const haystack = `${method?.id || ""} ${method?.label || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
  return candidate?.id ? String(candidate.id) : null;
}

export default function VoiceOrderController({
  restaurantId,
  tableId,
  products,
  onAddToCart,
  onConfirmOrder,
  language,
  paymentMethod,
  onPaymentMethodChange,
  canStartVoiceOrder = true,
  onRequireOrderType,
  forceMinimized = false,
  hideMiniButton = false,
  openEventName = "",
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const fallbackScope = useMemo(
    () => `${location.pathname || ""}${location.search || ""}`,
    [location.pathname, location.search]
  );
  const activeLang = useMemo(
    () => normalizeLang(language || i18n?.resolvedLanguage || i18n?.language || "en"),
    [language, i18n?.language, i18n?.resolvedLanguage]
  );
  const noisyModeKey = useMemo(
    () =>
      buildScopedStorageKey(NOISY_MODE_STORAGE_PREFIX, {
        restaurantId,
        tableId,
        fallbackScope,
      }),
    [fallbackScope, restaurantId, tableId]
  );
  const [noisyModeEnabled, setNoisyModeEnabled] = useState(() =>
    readBooleanPreference(noisyModeKey, false)
  );

  useEffect(() => {
    setNoisyModeEnabled(readBooleanPreference(noisyModeKey, false));
  }, [noisyModeKey]);

  const tVoice = useCallback(
    (key, fallback, options = {}) =>
      t(key, { lng: activeLang, defaultValue: fallback || key, ...options }),
    [t, activeLang]
  );

  const tr = useCallback(
    (enText, trText, deText, frText) => {
      if (activeLang === "tr") return trText || enText;
      if (activeLang === "de") return deText || enText;
      if (activeLang === "fr") return frText || enText;
      return enText;
    },
    [activeLang]
  );

  const {
    items,
    addItem,
    removeItem,
    removeByProductId,
    removeByNameMatch,
    findByNameMatch,
    updateQty,
    updateExtraQty,
    clear,
    undoLast,
    appendNotesToLastItem,
    summary,
  } = useDraftOrder();

  const productById = useMemo(() => {
    const map = new Map();
    (Array.isArray(products) ? products : []).forEach((product) => {
      map.set(String(product?.id), product);
    });
    return map;
  }, [products]);

  const productMatcher = useMemo(
    () => createProductMatcher(products, activeLang),
    [products, activeLang]
  );
  const paymentMethods = usePaymentMethods();

  const [isListening, setIsListening] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [recapOpen, setRecapOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waiterSuggestions, setWaiterSuggestions] = useState([]);
  const [choiceMicRequest, setChoiceMicRequest] = useState(0);

  const [mode, setMode] = useState(MODE.IDLE);
  const [pendingAction, setPendingAction] = useState(null);
  const [qtyPromptValue, setQtyPromptValue] = useState("");

  const recognitionRef = useRef(null);
  const activeRecognitionRef = useRef(null);
  const recapAutoListenDoneRef = useRef(false);
  const handleConfirmRecapRef = useRef(null);
  const startListeningRef = useRef(null);
  const stopListeningRef = useRef(null);

  const openPending = useCallback((nextMode, action) => {
    if (recapOpen) return;
    setMode(nextMode);
    setPendingAction(action || null);
    if (
      nextMode === MODE.AWAITING_CHOICE &&
      action?.kind &&
      AUTO_REOPEN_CHOICE_KINDS.has(action.kind)
    ) {
      setChoiceMicRequest((prev) => prev + 1);
    }
  }, [recapOpen]);

  const clearPending = useCallback(() => {
    setMode(MODE.IDLE);
    setPendingAction(null);
    setQtyPromptValue("");
  }, []);

  const speakText = useCallback(
    (text) => {
      if (typeof window === "undefined") return;
      if (!window.speechSynthesis || !text) return;
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = SPEECH_LANG_MAP[activeLang] || "en-US";
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        // ignore
      }
    },
    [activeLang]
  );

  const pushMessage = useCallback(
    (text, shouldSpeak = false) => {
      setStatusMessage(text);
      if (shouldSpeak) speakText(text);
    },
    [speakText]
  );

  const toggleNoisyMode = useCallback(() => {
    setNoisyModeEnabled((prev) => {
      const next = !prev;
      writeBooleanPreference(noisyModeKey, next);
      pushMessage(
        next
          ? tVoice(
              "voice.waiter.noisyEnabledStatus",
              "Noisy Mode enabled. Use tap-to-start/tap-to-stop or hold to talk."
            )
          : tVoice("voice.waiter.noisyDisabledStatus", "Noisy Mode disabled. Standard mode active.")
      );
      return next;
    });
  }, [noisyModeKey, pushMessage, tVoice]);

  const respondDone = useCallback(() => {
    pushMessage(tVoice("voice.waiter.doneAnythingElse", "Done. Anything else?"), true);
  }, [pushMessage, tVoice]);

  const openRecapNow = useCallback(() => {
    if (!summary.items.length) {
      pushMessage(tVoice("voice.waiter.readBackEmpty", "Your draft is empty."));
      return;
    }
    if (!recapOpen) {
      onPaymentMethodChange?.("");
    }
    clearPending();
    setRecapOpen(true);
    pushMessage(tVoice("voice.waiter.recapNow", "Okay, let me recap your order."));
  }, [clearPending, onPaymentMethodChange, pushMessage, recapOpen, summary.items.length, tVoice]);

  const handleClearDraftFromFloating = useCallback(() => {
    if (!summary.items.length) {
      pushMessage(tVoice("voice.waiter.readBackEmpty", "Your draft is empty."));
      return;
    }
    clear();
    clearPending();
    setWaiterSuggestions([]);
    setRecapOpen(false);
    pushMessage(tVoice("voice.waiter.draftCleared", "Draft order cleared."), true);
  }, [clear, clearPending, pushMessage, summary.items.length, tVoice]);

  const respondReadBack = useCallback(() => {
    if (!summary.items.length) {
      pushMessage(tVoice("voice.waiter.readBackEmpty", "Your draft is empty."), true);
      return;
    }

    const preview = buildCompactDraftLine(summary.items, tVoice);
    pushMessage(
      tVoice("voice.waiter.readBackResponse", "You currently have: {{items}}.", { items: preview }),
      true
    );
  }, [pushMessage, summary.items, tVoice]);

  const respondReadTotal = useCallback(() => {
    if (!summary.items.length) {
      pushMessage(tVoice("voice.waiter.totalEmpty", "There are no items yet."), true);
      return;
    }

    pushMessage(
      tVoice("voice.waiter.totalResponse", "Your total is {{total}} for {{count}} items.", {
        total: formatTryCurrency(summary.totalPrice, activeLang),
        count: summary.totalQty,
      }),
      true
    );
  }, [activeLang, pushMessage, summary.items.length, summary.totalPrice, summary.totalQty, tVoice]);

  const applyWaiterSuggestions = useCallback(
    (mainProduct) => {
      const suggestions = buildWaiterSuggestions(mainProduct, products);
      setWaiterSuggestions(suggestions);
    },
    [products]
  );

  const clearWaiterSuggestions = useCallback(() => {
    setWaiterSuggestions([]);
  }, []);

  const processItemQueue = useCallback(
    (inputItems, previouslyAdded = [], initialSuggestionSource = null) => {
      const queue = Array.isArray(inputItems) ? [...inputItems] : [];
      const added = Array.isArray(previouslyAdded) ? [...previouslyAdded] : [];
      let suggestionSource =
        initialSuggestionSource && detectMainSuggestionCategory(initialSuggestionSource)
          ? initialSuggestionSource
          : null;

      while (queue.length > 0) {
        const next = queue.shift();
        if (!next?.queryName) continue;

        const qty = Math.max(1, Number(next.qty) || 1);
        const noteText = attachNotesToItem("", next?.notes || []);
        const groupLabel = normalizeGroupLabel(next?.groupLabel);
        const matchConfig = noisyModeEnabled
          ? { minScore: 0.5, ambiguousDelta: 0.16, topN: 3 }
          : { minScore: 0.43, ambiguousDelta: 0.09, topN: 3 };
        const matched = productMatcher.resolve(next.queryName, {
          minScore: matchConfig.minScore,
          ambiguousDelta: matchConfig.ambiguousDelta,
          topN: matchConfig.topN,
        });

        const cautiousRanking = productMatcher.topCandidates(next.queryName, {
          limit: 3,
          minScore: noisyModeEnabled ? 0.14 : 0.2,
        });

        if (
          noisyModeEnabled &&
          matched.status === "resolved" &&
          cautiousRanking.length > 1 &&
          cautiousRanking[0]?.score < 0.74
        ) {
          openPending(MODE.AWAITING_CHOICE, {
            kind: "add_ambiguous",
            queryName: next.queryName,
            qty,
            notes: noteText,
            groupLabel,
            options: cautiousRanking.map((entry) => entry.product).slice(0, 3),
            remainingQueue: queue,
            added,
          });
          pushMessage(tVoice("voice.waiter.whichOneDidYouMean", "Which one did you mean?"));
          return;
        }

        if (matched.status === "none") {
          const suggestions = cautiousRanking.map((entry) => entry.product);
          openPending(MODE.AWAITING_CHOICE, {
            kind: "unknown_product",
            queryName: next.queryName,
            qty,
            notes: noteText,
            groupLabel,
            options: suggestions,
            remainingQueue: queue,
            added,
          });
          pushMessage(
            suggestions.length
              ? tVoice("voice.waiter.unknownProduct", "I couldn't find that item. Pick a close match.")
              : tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order.")
          );
          return;
        }

        if (matched.status === "ambiguous") {
          openPending(MODE.AWAITING_CHOICE, {
            kind: "add_ambiguous",
            queryName: next.queryName,
            qty,
            notes: noteText,
            groupLabel,
            options: matched.candidates.slice(0, 3),
            remainingQueue: queue,
            added,
          });
          pushMessage(tVoice("voice.waiter.whichOneDidYouMean", "Which one did you mean?"));
          return;
        }

        const resolvedProduct = matched.product;
        addItem({
          productId: resolvedProduct?.id ?? null,
          name: resolvedProduct?.name || next.queryName,
          qty,
          unitPrice: Number(resolvedProduct?.price) || 0,
          notes: noteText,
          groupLabel,
        });
        added.push({ qty, name: resolvedProduct?.name || next.queryName });

        if (!suggestionSource && detectMainSuggestionCategory(resolvedProduct)) {
          suggestionSource = resolvedProduct;
        }
      }

      if (suggestionSource) {
        applyWaiterSuggestions(suggestionSource);
      } else if (added.length > 0) {
        clearWaiterSuggestions();
      }

      pushMessage(buildAddMessage(added, tVoice), true);
    },
    [
      addItem,
      applyWaiterSuggestions,
      clearWaiterSuggestions,
      noisyModeEnabled,
      openPending,
      productMatcher,
      pushMessage,
      tVoice,
    ]
  );

  const applyRemoveIntent = useCallback(
    (queryName) => {
      const query = String(queryName || "").trim();
      if (!query) {
        pushMessage(tVoice("voice.waiter.whichItem", "Which item should I edit?"));
        return;
      }

      const result = removeByNameMatch(query);
      if (result.status === "removed") {
        respondDone();
        return;
      }

      if (result.status === "ambiguous") {
        openPending(MODE.AWAITING_CHOICE, {
          kind: "remove_ambiguous",
          queryName: query,
          options: (result.matches || []).slice(0, 3),
        });
        pushMessage(tVoice("voice.waiter.whichOneToRemove", "Which one should I remove?"));
        return;
      }

      pushMessage(tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order."));
    },
    [openPending, pushMessage, removeByNameMatch, respondDone, tVoice]
  );

  const applyChangeQtyIntent = useCallback(
    (queryName, nextQty) => {
      const query = String(queryName || "").trim();
      if (!query) {
        pushMessage(tVoice("voice.waiter.whichItem", "Which item should I edit?"));
        return;
      }

      const qty = Number(nextQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        openPending(MODE.AWAITING_QTY, {
          kind: "change_qty_missing",
          queryName: query,
        });
        pushMessage(tVoice("voice.waiter.howMany", "How many?"));
        return;
      }

      const matches = findByNameMatch(query);
      if (!matches.length) {
        pushMessage(tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order."));
        return;
      }

      if (matches.length > 1) {
        openPending(MODE.AWAITING_CHOICE, {
          kind: "change_ambiguous",
          queryName: query,
          qty: Math.max(1, Math.floor(qty)),
          options: matches.slice(0, 3),
        });
        pushMessage(tVoice("voice.waiter.whichOneToChange", "Which one should I change?"));
        return;
      }

      const target = matches[0];
      const updateResult = updateQty(target.productId ?? target.key, qty);
      if (updateResult.status === "updated") {
        respondDone();
        return;
      }

      pushMessage(tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order."));
    },
    [findByNameMatch, openPending, pushMessage, respondDone, tVoice, updateQty]
  );

  const handlePendingChoice = useCallback(
    (choice) => {
      if (!pendingAction) return;

      if (choice === "__cancel") {
        clearPending();
        pushMessage(tVoice("voice.waiter.whatElseWouldYouLike", "Sure — what else would you like?"));
        return;
      }

      if (pendingAction.kind === "cancel_draft") {
        if (choice === "__confirm_clear") {
          clear();
          clearWaiterSuggestions();
          clearPending();
          respondDone();
          return;
        }
        clearPending();
        return;
      }

      if (pendingAction.kind === "unknown_product") {
        if (choice === "__try_again") {
          clearPending();
          return;
        }

        const product = choice;
        if (!product) return;
        addItem({
          productId: product?.id ?? null,
          name: product?.name || pendingAction.queryName,
          qty: Math.max(1, Number(pendingAction.qty) || 1),
          unitPrice: Number(product?.price) || 0,
          notes: pendingAction.notes || "",
          groupLabel: normalizeGroupLabel(pendingAction.groupLabel),
        });

        const nextAdded = [
          ...(pendingAction.added || []),
          {
            qty: Math.max(1, Number(pendingAction.qty) || 1),
            name: product?.name || pendingAction.queryName,
          },
        ];
        const remainingQueue = pendingAction.remainingQueue || [];
        clearPending();
        processItemQueue(remainingQueue, nextAdded, product);
        return;
      }

      if (pendingAction.kind === "add_ambiguous") {
        const product = choice;
        if (!product) return;
        addItem({
          productId: product?.id ?? null,
          name: product?.name || pendingAction.queryName,
          qty: Math.max(1, Number(pendingAction.qty) || 1),
          unitPrice: Number(product?.price) || 0,
          notes: pendingAction.notes || "",
          groupLabel: normalizeGroupLabel(pendingAction.groupLabel),
        });

        const nextAdded = [
          ...(pendingAction.added || []),
          {
            qty: Math.max(1, Number(pendingAction.qty) || 1),
            name: product?.name || pendingAction.queryName,
          },
        ];
        const remainingQueue = pendingAction.remainingQueue || [];
        clearPending();
        processItemQueue(remainingQueue, nextAdded, product);
        return;
      }

      if (pendingAction.kind === "remove_ambiguous") {
        const result = removeByProductId(choice?.productId ?? choice?.key);
        clearPending();
        if (result.status === "removed") {
          respondDone();
          return;
        }
        pushMessage(tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order."));
        return;
      }

      if (pendingAction.kind === "change_ambiguous") {
        const result = updateQty(choice?.productId ?? choice?.key, pendingAction.qty);
        clearPending();
        if (result.status === "updated") {
          respondDone();
          return;
        }
        pushMessage(tVoice("voice.waiter.itemNotFound", "I couldn't find that item in your draft order."));
      }
    },
    [
      addItem,
      clear,
      clearWaiterSuggestions,
      clearPending,
      pendingAction,
      processItemQueue,
      pushMessage,
      removeByProductId,
      respondDone,
      tVoice,
      updateQty,
    ]
  );

  const resolvePendingFromTranscript = useCallback(
    (text) => {
      if (mode === MODE.IDLE || !pendingAction) return false;

      if (mode === MODE.AWAITING_NOTE && pendingAction.kind === "group_only") {
        const followUp = parseVoiceOrder(text, activeLang);

        if (followUp.type === "ADD_ITEMS") {
          const groupLabel = normalizeGroupLabel(pendingAction.groupLabel);
          const groupedItems = (followUp.items || []).map((item) => ({
            ...item,
            groupLabel: normalizeGroupLabel(item?.groupLabel || groupLabel),
          }));
          clearPending();
          processItemQueue(groupedItems);
          return true;
        }

        if (followUp.type === "GROUP_ONLY") {
          const nextGroup = normalizeGroupLabel(followUp.groupLabel || pendingAction.groupLabel);
          openPending(MODE.AWAITING_NOTE, {
            kind: "group_only",
            groupLabel: nextGroup,
          });
          pushMessage(buildGroupFollowUpMessage(nextGroup, tVoice));
          return true;
        }

        if (followUp.type === "CANCEL") {
          clearPending();
          return true;
        }

        if (followUp.type === "OPEN_RECAP") {
          clearPending();
          openRecapNow();
          return true;
        }

        if (followUp.type === "READ_BACK") {
          clearPending();
          respondReadBack();
          return true;
        }

        if (followUp.type === "READ_TOTAL") {
          clearPending();
          respondReadTotal();
          return true;
        }

        pushMessage(buildGroupFollowUpMessage(pendingAction.groupLabel, tVoice));
        return true;
      }

      if (mode === MODE.AWAITING_QTY && pendingAction.kind === "change_qty_missing") {
        const qty = parseSpokenQty(text, activeLang);
        if (Number.isFinite(qty) && qty > 0) {
          const queryName = pendingAction.queryName;
          clearPending();
          applyChangeQtyIntent(queryName, qty);
          return true;
        }

        pushMessage(tVoice("voice.waiter.howMany", "How many?"));
        return true;
      }

      if (mode === MODE.AWAITING_CHOICE) {
        const intent = detectIntentKeyword(text, activeLang);

        if (pendingAction.kind === "cancel_draft") {
          if (includesOne(text, YES_WORDS[activeLang])) {
            handlePendingChoice("__confirm_clear");
            return true;
          }
          if (includesOne(text, NO_WORDS[activeLang]) || intent === "CANCEL") {
            handlePendingChoice("__cancel");
            return true;
          }
          pushMessage(tVoice("voice.waiter.selectOneOption", "Select one option."));
          return true;
        }

        if (intent === "CANCEL") {
          handlePendingChoice("__cancel");
          return true;
        }

        const options = Array.isArray(pendingAction.options) ? pendingAction.options : [];

        if (pendingAction.kind === "unknown_product" && options.length === 0) {
          if (includesOne(text, TRY_AGAIN_WORDS[activeLang])) {
            handlePendingChoice("__try_again");
            return true;
          }
          clearPending();
          return false;
        }

        const index = parseChoiceIndex(text, activeLang);
        if (index !== null && options[index]) {
          handlePendingChoice(options[index]);
          return true;
        }

        const normalized = normalizeVoiceText(text);
        const ranked = options
          .map((option) => ({
            option,
            score: productMatcher.scoreOptionText(normalized, option?.name || option?.label || ""),
          }))
          .sort((a, b) => b.score - a.score);

        const autoPickThreshold = noisyModeEnabled ? 0.62 : 0.45;
        if (ranked[0] && ranked[0].score >= autoPickThreshold) {
          handlePendingChoice(ranked[0].option);
          return true;
        }

        if (pendingAction.kind === "unknown_product" && includesOne(text, TRY_AGAIN_WORDS[activeLang])) {
          handlePendingChoice("__try_again");
          return true;
        }

        pushMessage(tVoice("voice.waiter.selectOneOption", "Select one option."));
        return true;
      }

      return true;
    },
    [
      activeLang,
      applyChangeQtyIntent,
      clearPending,
      handlePendingChoice,
      mode,
      openPending,
      openRecapNow,
      noisyModeEnabled,
      pendingAction,
      productMatcher,
      processItemQueue,
      pushMessage,
      respondReadBack,
      respondReadTotal,
      tVoice,
    ]
  );

  const processTranscript = useCallback(
    (transcript) => {
      const text = String(transcript || "").trim();
      if (!text) {
        pushMessage(tVoice("voice.waiter.didntCatchThat", "I didn't catch that — could you repeat?"));
        return;
      }

      setLastTranscript(text);

      const consumedByPending = resolvePendingFromTranscript(text);
      if (consumedByPending) return;

      const parsed = parseVoiceOrder(text, activeLang, {
        mode: recapOpen ? "RECAP_MODE" : "DEFAULT",
      });

      if (recapOpen && parsed.type === "RECAP_COMMAND") {
        stopListeningRef.current?.();

        if (parsed.action === "CONFIRM_ORDER") {
          const paymentMethodOverride = resolvePaymentMethodFromHint(paymentMethods, parsed.paymentHint);
          if (paymentMethodOverride && typeof onPaymentMethodChange === "function") {
            onPaymentMethodChange(paymentMethodOverride);
          }
          void handleConfirmRecapRef.current?.({
            paymentMethodOverride: paymentMethodOverride || null,
          });
          return;
        }

        if (parsed.action === "CLEAR_ITEMS") {
          clear();
          clearWaiterSuggestions();
          setRecapOpen(false);
          pushMessage(tVoice("voice.waiter.draftCleared", "Draft order cleared."), true);
          return;
        }

        if (parsed.action === "CONTINUE") {
          setRecapOpen(false);
          pushMessage(tVoice("voice.waiter.whatElseWouldYouLike", "Sure — what else would you like?"), true);
          startListeningRef.current?.();
          return;
        }

        if (parsed.action === "CANCEL") {
          clear();
          clearPending();
          clearWaiterSuggestions();
          setRecapOpen(false);
          pushMessage(tVoice("voice.waiter.draftCleared", "Draft order cleared."), true);
          return;
        }
      }

      if (parsed.type === "OPEN_RECAP" || parsed.type === "FINISH") {
        openRecapNow();
        return;
      }

      if (parsed.type === "READ_BACK") {
        respondReadBack();
        return;
      }

      if (parsed.type === "READ_TOTAL") {
        respondReadTotal();
        return;
      }

      if (parsed.type === "CONTINUE") {
        pushMessage(tVoice("voice.waiter.whatElseWouldYouLike", "Sure — what else would you like?"), true);
        return;
      }

      if (parsed.type === "QTY_ONLY") {
        const qty = Math.max(1, Number(parsed.qty) || 1);
        pushMessage(
          tr(
            `${qty} of which item?`,
            `${qty} hangi urun icin?`,
            `${qty} von welchem Artikel?`,
            `${qty} pour quel article ?`
          ),
          true
        );
        return;
      }

      if (parsed.type === "REMOVE_ITEM") {
        applyRemoveIntent(parsed.queryName);
        return;
      }

      if (parsed.type === "CHANGE_QTY") {
        applyChangeQtyIntent(parsed.queryName, parsed.qty);
        return;
      }

      if (parsed.type === "UNDO_LAST") {
        const result = undoLast();
        if (result.status === "ok") {
          respondDone();
          return;
        }
        pushMessage(tVoice("voice.waiter.nothingToUndo", "There is nothing to undo."));
        return;
      }

      if (parsed.type === "CLEAR_DRAFT") {
        clear();
        clearWaiterSuggestions();
        respondDone();
        return;
      }

      if (parsed.type === "CANCEL") {
        openPending(MODE.AWAITING_CHOICE, { kind: "cancel_draft" });
        pushMessage(tVoice("voice.waiter.clearDraftConfirm", "Clear your draft order?"));
        return;
      }

      if (parsed.type === "GROUP_ONLY") {
        const groupLabel = normalizeGroupLabel(parsed.groupLabel);
        openPending(MODE.AWAITING_NOTE, {
          kind: "group_only",
          groupLabel,
        });
        pushMessage(buildGroupFollowUpMessage(groupLabel, tVoice), true);
        return;
      }

      if (parsed.type === "ADD_ITEMS") {
        processItemQueue(parsed.items);
        return;
      }

      if (parsed.type === "ADD_NOTES_LAST") {
        const result = appendNotesToLastItem(parsed.notes || []);
        if (result.status === "updated") {
          pushMessage(tVoice("voice.waiter.noteAdded", "Note added. Anything else?"), true);
          return;
        }
        pushMessage(tVoice("voice.waiter.whichItem", "Which item should I edit?"));
        return;
      }

      pushMessage(tVoice("voice.waiter.didntCatchThat", "I didn't catch that — could you repeat?"));
    },
    [
      activeLang,
      appendNotesToLastItem,
      applyChangeQtyIntent,
      applyRemoveIntent,
      clear,
      clearPending,
      clearWaiterSuggestions,
      handleConfirmRecapRef,
      onPaymentMethodChange,
      openRecapNow,
      openPending,
      paymentMethods,
      processItemQueue,
      pushMessage,
      recapOpen,
      respondReadBack,
      respondReadTotal,
      resolvePendingFromTranscript,
      respondDone,
      tVoice,
      undoLast,
    ]
  );

  const getSpeechRecognition = useCallback(() => {
    if (recognitionRef.current !== null) return recognitionRef.current;
    if (typeof window === "undefined") return null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = SpeechRecognition || null;
    return recognitionRef.current;
  }, []);

  const stopListening = useCallback(() => {
    const activeRecognition = activeRecognitionRef.current;
    if (!activeRecognition) return;
    try {
      activeRecognition.stop();
    } catch {
      // ignore
    }
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      pushMessage(
        tr(
          "Voice recognition is not supported in this browser.",
          "Bu tarayıcıda sesli tanıma desteklenmiyor.",
          "Spracherkennung wird in diesem Browser nicht unterstützt.",
          "La reconnaissance vocale n'est pas prise en charge sur ce navigateur."
        )
      );
      return;
    }

    if (isListening) return;

    const recognition = new SpeechRecognition();
    recognition.lang = SPEECH_LANG_MAP[activeLang] || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    let safetyTimer = null;

    recognition.onstart = () => {
      setIsListening(true);
      pushMessage(tVoice("voice.waiter.listeningStatus", "Listening..."));
      safetyTimer = window.setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      }, 10000);
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      activeRecognitionRef.current = null;
      pushMessage(event?.error ? `Mic error: ${event.error}` : "Mic error");
    };

    recognition.onend = () => {
      setIsListening(false);
      activeRecognitionRef.current = null;
      if (safetyTimer) {
        window.clearTimeout(safetyTimer);
      }
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((entry) => entry?.[0]?.transcript || "")
        .join(" ")
        .trim();
      processTranscript(transcript);
    };

    try {
      activeRecognitionRef.current = recognition;
      recognition.start();
    } catch (error) {
      setIsListening(false);
      activeRecognitionRef.current = null;
      pushMessage(error?.message || "Could not start microphone.");
    }
  }, [activeLang, getSpeechRecognition, isListening, processTranscript, pushMessage, tVoice, tr]);

  useEffect(() => {
    if (!choiceMicRequest) return;
    if (!canStartVoiceOrder) return;
    startListening();
  }, [canStartVoiceOrder, choiceMicRequest, startListening]);

  useEffect(() => {
    if (!recapOpen) {
      recapAutoListenDoneRef.current = false;
      return;
    }
    if (!canStartVoiceOrder) return;
    if (recapAutoListenDoneRef.current) return;
    recapAutoListenDoneRef.current = true;
    startListening();
  }, [canStartVoiceOrder, recapOpen, startListening]);

  const handleVoiceMainAction = useCallback(() => {
    if (!canStartVoiceOrder) {
      if (typeof onRequireOrderType === "function") {
        onRequireOrderType();
      }
      return;
    }

    if (noisyModeEnabled && isListening) {
      stopListening();
      return;
    }
    startListening();
  }, [canStartVoiceOrder, isListening, noisyModeEnabled, onRequireOrderType, startListening, stopListening]);

  const handleVoiceHoldStart = useCallback(() => {
    if (!canStartVoiceOrder) {
      if (typeof onRequireOrderType === "function") {
        onRequireOrderType();
      }
      return;
    }
    if (!noisyModeEnabled) return;
    if (!isListening) startListening();
  }, [canStartVoiceOrder, isListening, noisyModeEnabled, onRequireOrderType, startListening]);

  const handleVoiceHoldEnd = useCallback(() => {
    if (!noisyModeEnabled) return;
    if (isListening) stopListening();
  }, [isListening, noisyModeEnabled, stopListening]);

  const paymentRequiredPrompt = t("Please select a payment method before continuing.", {
    lng: activeLang,
    defaultValue: "Please select a payment method before continuing.",
  });

  const handlePaymentRequiredPrompt = useCallback(
    (text) => {
      const message = String(text || paymentRequiredPrompt);
      pushMessage(message, true);
    },
    [paymentRequiredPrompt, pushMessage]
  );

  const handleConfirmRecap = useCallback(async (options = {}) => {
    if (!summary.items.length || isSubmitting) return;

    const paymentMethodOverride =
      typeof options?.paymentMethodOverride === "string"
        ? options.paymentMethodOverride
        : null;
    const selectedPaymentMethod = String(
      paymentMethodOverride || paymentMethod || ""
    ).trim();
    if (!selectedPaymentMethod) {
      pushMessage(paymentRequiredPrompt, true);
      return;
    }

    setIsSubmitting(true);
    try {
      if (typeof onConfirmOrder === "function") {
        await onConfirmOrder(summary.items, { paymentMethodOverride: selectedPaymentMethod });
      } else {
        for (const item of summary.items) {
          const product = productById.get(String(item.productId)) || null;
          if (typeof onAddToCart === "function") {
            await onAddToCart({
              product,
              productId: item.productId,
              name: item.name,
              qty: Number(item.qty) || 1,
              unitPrice: Number(item.unitPrice) || 0,
              extras: Array.isArray(item.extras) ? item.extras : [],
              notes: item.notes || "",
              groupLabel: normalizeGroupLabel(item.groupLabel),
            });
          }
        }
      }

      clear();
      clearWaiterSuggestions();
      setRecapOpen(false);
      pushMessage("Order sent ✅", true);
    } catch (error) {
      pushMessage(
        error?.message ||
          tr(
            "Could not confirm the order.",
            "Siparis onaylanirken bir hata olustu.",
            "Die Bestellung konnte nicht bestätigt werden.",
            "La commande n'a pas pu être confirmée."
          )
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    clear,
    clearWaiterSuggestions,
    isSubmitting,
    onAddToCart,
    onConfirmOrder,
    paymentMethod,
    paymentRequiredPrompt,
    productById,
    pushMessage,
    summary.items,
    tr,
  ]);

  useEffect(() => {
    handleConfirmRecapRef.current = handleConfirmRecap;
  }, [handleConfirmRecap]);

  const handleSuggestionSelect = useCallback(
    (entry) => {
      const product = entry?.product;
      if (!product) return;

      addItem({
        productId: product?.id ?? null,
        name: product?.name || "",
        qty: 1,
        unitPrice: Number(product?.price) || 0,
      });

      setWaiterSuggestions((prev) => prev.filter((item) => item?.key !== entry?.key));
      pushMessage(tVoice("voice.waiter.anythingElse", "Got it. Anything else?"));
    },
    [addItem, pushMessage, tVoice]
  );

  const handleRecapItemQtyChange = useCallback(
    (itemId, nextQty) => {
      const qty = Math.floor(Number(nextQty) || 0);
      if (qty <= 0) {
        removeItem(itemId);
        return;
      }
      updateQty(itemId, qty);
    },
    [removeItem, updateQty]
  );

  const handleRecapExtraQtyChange = useCallback(
    (itemId, extraId, nextQty) => {
      const qty = Math.floor(Number(nextQty) || 0);
      updateExtraQty(itemId, extraId, qty);
    },
    [updateExtraQty]
  );

  const inlineUnknownPrompt = useMemo(() => {
    if (mode !== MODE.AWAITING_CHOICE || recapOpen || pendingAction?.kind !== "unknown_product") {
      return null;
    }
    return {
      queryName: pendingAction?.queryName || "",
      options: Array.isArray(pendingAction?.options) ? pendingAction.options.slice(0, 3) : [],
    };
  }, [mode, pendingAction, recapOpen]);

  const handleInlineUnknownTryAgain = useCallback(() => {
    handlePendingChoice("__try_again");
  }, [handlePendingChoice]);

  const handleInlineUnknownCancel = useCallback(() => {
    handlePendingChoice("__cancel");
  }, [handlePendingChoice]);

  const handleInlineUnknownSelect = useCallback(
    (option) => {
      handlePendingChoice(option);
    },
    [handlePendingChoice]
  );

  const bubbleCountText =
    summary.totalQty > 0
      ? tVoice("voice.waiter.itemsInCart", "{{count}} items in cart", { count: summary.totalQty })
      : tVoice("voice.waiter.noItemsYet", "No items yet");
  const draftItemsPreview = useMemo(
    () =>
      (summary.items || []).map((item, index) => ({
        key: item?.key || item?.productId || `${item?.name || "item"}-${index}`,
        label: `${Math.max(1, Number(item?.qty) || 1)}x ${item?.name || "-"}`,
      })),
    [summary.items]
  );
  const openRecapLabel = tVoice("voice.waiter.openCart", "Open Cart");
  const clearItemLabel = tVoice("voice.waiter.clearItem", "Clear Item");
  const noisyModeLabel = tVoice("voice.waiter.noisyMode", "Noisy Mode");
  const noisyModeDescription = tVoice(
    "voice.waiter.noisyModeDescription",
    "Push-to-talk mode with stricter matching. Tap start/stop or hold to speak."
  );
  const noisyModeHint = noisyModeEnabled
    ? tVoice(
        "voice.waiter.noisyHint",
        "Noisy mode active: push-to-talk and extra confirmation are enabled."
      )
    : "";
  const fabSubtitle = noisyModeEnabled
    ? isListening
      ? tVoice("voice.waiter.tapToStop", "Tap to stop")
      : tVoice("voice.waiter.tapToStart", "Tap to start")
    : tVoice("voice.waiter.tapToSpeak", "Tap to speak");
  const holdLabel = tVoice("voice.waiter.holdToTalk", "Hold to talk");
  const lastTranscriptLabel = tr("Last heard", "Son duyulan", "Zuletzt gehört", "Dernier entendu");
  const aiOrderLabel = tVoice("voice.waiter.aiOrderTitle", tr("AI Order", "YZ Siparis", "KI Bestellung", "Commande IA"));
  const consolidatedSuggestions = mode === MODE.IDLE && !recapOpen ? waiterSuggestions : [];

  return (
    <>
      <VoiceOrderFloating
        restaurantId={restaurantId}
        tableId={tableId}
        onStartVoiceOrder={handleVoiceMainAction}
        onStopVoiceOrder={stopListening}
        onHoldStartVoiceOrder={handleVoiceHoldStart}
        onHoldEndVoiceOrder={handleVoiceHoldEnd}
        noisyMode={noisyModeEnabled}
        isListening={isListening}
        title={aiOrderLabel}
        miniLabel={canStartVoiceOrder ? aiOrderLabel : ""}
        subtitle={fabSubtitle}
        holdLabel={holdLabel}
        tapToStartLabel={tVoice("voice.waiter.tapToStart", "Tap to start")}
        tapToStopLabel={tVoice("voice.waiter.tapToStop", "Tap to stop")}
        statusMessage={statusMessage}
        modeHint={noisyModeHint}
        countText={bubbleCountText}
        draftItemsPreview={draftItemsPreview}
        showOpenRecap={summary.totalQty > 0}
        openRecapLabel={openRecapLabel}
        onOpenRecap={openRecapNow}
        showClearRecap={summary.totalQty > 0}
        clearRecapLabel={clearItemLabel}
        onClearRecap={handleClearDraftFromFloating}
        onToggleNoisyMode={toggleNoisyMode}
        noisyModeLabel={noisyModeLabel}
        noisyModeDescription={noisyModeDescription}
        suggestions={consolidatedSuggestions}
        onSelectSuggestion={handleSuggestionSelect}
        addSuggestionLabel={t("Add", { lng: activeLang, defaultValue: "Add" })}
        lastTranscript={lastTranscript}
        lastTranscriptLabel={lastTranscriptLabel}
        unknownPrompt={inlineUnknownPrompt}
        unknownPromptTitle={tVoice(
          "voice.waiter.unknownProduct",
          "I couldn't find that item. Pick a close match."
        )}
        unknownPromptSelectHint={tVoice("voice.waiter.selectOneOption", "Select one option.")}
        tryAgainLabel={tVoice("voice.waiter.tryAgain", "Try again")}
        cancelLabel={t("Cancel", { lng: activeLang, defaultValue: "Cancel" })}
        onTryAgainUnknown={handleInlineUnknownTryAgain}
        onCancelUnknown={handleInlineUnknownCancel}
        onSelectUnknownOption={handleInlineUnknownSelect}
        startActionOnly={!canStartVoiceOrder}
        forceMinimized={forceMinimized}
        hideMiniButton={hideMiniButton}
        openEventName={openEventName}
      />

      <DraftOrderRecapModal
        open={recapOpen}
        items={items}
        totalPrice={summary.totalPrice}
        paymentMethod={paymentMethod}
        paymentMethods={paymentMethods}
        onPaymentMethodChange={onPaymentMethodChange}
        paymentLabel={t("Payment", { lng: activeLang, defaultValue: "Payment" })}
        paymentPlaceholder={t("Select your payment", {
          lng: activeLang,
          defaultValue: "Select your payment",
        })}
        paymentRequiredPrompt={paymentRequiredPrompt}
        onPaymentRequired={handlePaymentRequiredPrompt}
        onClose={() => setRecapOpen(false)}
        onConfirm={handleConfirmRecap}
        onContinue={() => {
          setRecapOpen(false);
          pushMessage(tVoice("voice.waiter.whatElseWouldYouLike", "Sure — what else would you like?"));
        }}
        onChangeQty={handleRecapItemQtyChange}
        onChangeExtraQty={handleRecapExtraQtyChange}
        onRemove={removeItem}
        onClear={clear}
        isSubmitting={isSubmitting}
        title={t("Your Order", { lng: activeLang, defaultValue: "Your Order" })}
      />

      <ClarificationSheet
        open={
          !recapOpen &&
          mode !== MODE.IDLE &&
          Boolean(pendingAction) &&
          pendingAction?.kind !== "unknown_product"
        }
        mode={mode}
        pendingAction={pendingAction}
        qtyValue={qtyPromptValue}
        onQtyValueChange={setQtyPromptValue}
        onSelectChoice={handlePendingChoice}
        onSubmitQty={(value) => {
          const qty = Number(value);
          if (!Number.isFinite(qty) || qty <= 0) {
            pushMessage(tVoice("voice.waiter.howMany", "How many?"));
            return;
          }

          if (mode === MODE.AWAITING_QTY && pendingAction?.kind === "change_qty_missing") {
            const queryName = pendingAction.queryName;
            clearPending();
            applyChangeQtyIntent(queryName, qty);
            return;
          }

          pushMessage(tVoice("voice.waiter.howMany", "How many?"));
        }}
        onCancel={() => handlePendingChoice("__cancel")}
        t={t}
        tVoice={tVoice}
      />
    </>
  );
}
