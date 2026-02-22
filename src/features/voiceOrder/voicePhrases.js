const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

export const normalizeVoiceText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`´’‘]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const PHRASE_SETS = {
  en: {
    // Finish / recap intent.
    finish: [
      "confirm the order",
      "confirm order",
      "place the order",
      "checkout",
      "finish",
      "done",
      "thats all",
      "no",
      "no thanks",
      "no thank you",
      "i dont need",
      "nothing else",
      "no more",
    ],
    openRecap: ["open recap", "show recap", "show order summary"],
    readBack: ["repeat my order", "what did i order", "read my order", "read back order"],
    readTotal: ["total", "how much", "how much total", "whats the total"],
    // Continue intent.
    continue: ["more", "one more", "add more", "continue", "yes", "yes please"],
    remove: ["remove", "delete", "take off"],
    changeQty: ["make", "change", "set", "update"],
    undo: ["undo", "undo last", "cancel last"],
    clearDraft: ["clear order", "clear draft", "start over", "reset order"],
    changeFillers: ["to", "into", "as", "qty", "quantity"],
    removeFillers: ["from order", "from draft", "item", "please"],
    recapConfirm: [
      "confirm order",
      "confirm the order",
      "confirm with card",
      "confirm with cash",
      "pay by card",
      "pay by cash",
      "pay with card",
      "pay with cash",
    ],
    recapClear: ["clear item", "clear items", "clear order", "remove all items"],
    recapContinue: ["i want to order again", "order again", "add more", "continue order"],
    recapCancel: ["cancel", "cancel order", "never mind order"],
    paymentCard: ["card", "credit card", "debit card", "by card", "with card"],
    paymentCash: ["cash", "by cash", "with cash"],
  },
  tr: {
    finish: [
      "siparisi onayla",
      "siparisi gonder",
      "siparisi ver",
      "onayla",
      "tamam",
      "bitti",
      "bu kadar",
      "baska istemiyorum",
      "gerek yok",
      "hayir",
      "yok",
    ],
    openRecap: ["ozeti ac", "ozeti goster", "siparis ozeti", "siparis ozetini goster"],
    readBack: ["siparisimi oku", "ne siparis verdim", "siparisimi tekrar et"],
    readTotal: ["toplam kac", "ne kadar", "toplam fiyat", "hesap ne kadar"],
    continue: ["daha", "bir tane daha", "bir daha", "ekle", "devam", "evet", "evet lutfen"],
    remove: ["kaldir", "sil", "cikar"],
    changeQty: ["yap", "degistir", "adetini degistir", "adet yap"],
    undo: ["geri al", "sonu geri al", "sonu iptal et", "undo"],
    clearDraft: ["siparisi temizle", "taslagi temizle", "bastan basla", "sifirla"],
    changeFillers: ["to", "adet", "tane", "olsun"],
    removeFillers: ["siparisten", "taslaktan", "lutfen"],
    recapConfirm: [
      "siparisi onayla",
      "siparisi onayliyorum",
      "kartla onayla",
      "nakit onayla",
      "kartla ode",
      "nakit ode",
    ],
    recapClear: ["urunleri temizle", "siparisi temizle", "hepsini sil", "hepsini kaldir"],
    recapContinue: ["yeniden siparis vermek istiyorum", "tekrar siparis", "daha ekle", "devam"],
    recapCancel: ["iptal", "siparisi iptal et", "vazgectim"],
    paymentCard: ["kart", "kredi karti", "banka karti", "kartla"],
    paymentCash: ["nakit", "nakitle", "pesin"],
  },
  de: {
    finish: [
      "bestatige die bestellung",
      "bestellung bestatigen",
      "bestatigen",
      "bestellen",
      "kasse",
      "fertig",
      "erledigt",
      "das ist alles",
      "das wars",
      "nichts mehr",
      "nein",
      "nein danke",
    ],
    openRecap: ["zusammenfassung offnen", "zusammenfassung zeigen", "bestellubersicht zeigen"],
    readBack: ["wiederhole meine bestellung", "was habe ich bestellt", "bestellung vorlesen"],
    readTotal: ["gesamt", "wie viel", "gesamtpreis", "wie hoch ist der betrag"],
    continue: ["mehr", "noch eins", "noch einen", "noch eine", "weiter", "ja", "ja bitte", "mehr hinzufugen"],
    remove: ["entferne", "losche", "streich", "wegnehmen"],
    changeQty: ["mach", "andere", "setze", "stell"],
    undo: ["ruckgangig", "letztes ruckgangig", "undo", "letzte abbrechen"],
    clearDraft: ["bestellung leeren", "entwurf leeren", "neu anfangen", "zurucksetzen"],
    changeFillers: ["auf", "zu", "menge"],
    removeFillers: ["aus bestellung", "bitte"],
    recapConfirm: [
      "bestellung bestatigen",
      "bestatige bestellung",
      "mit karte bestatigen",
      "mit bargeld bestatigen",
      "mit karte zahlen",
      "mit bargeld zahlen",
    ],
    recapClear: ["artikel leeren", "bestellung leeren", "alles loschen", "alles entfernen"],
    recapContinue: ["ich mochte weiter bestellen", "noch etwas bestellen", "mehr hinzufugen", "weiter"],
    recapCancel: ["abbrechen", "bestellung abbrechen", "stornieren"],
    paymentCard: ["karte", "kreditkarte", "ec karte", "mit karte"],
    paymentCash: ["bar", "bargeld", "mit bargeld"],
  },
  fr: {
    finish: [
      "confirmer la commande",
      "confirme la commande",
      "confirmer",
      "valider la commande",
      "payer",
      "termine",
      "cest tout",
      "rien d autre",
      "plus rien",
      "non",
      "non merci",
    ],
    openRecap: ["ouvrir le recap", "affiche le recap", "montre le recapitulatif"],
    readBack: ["repete ma commande", "quest ce que jai commande", "lis ma commande"],
    readTotal: ["total", "combien", "combien ca fait", "montant total"],
    continue: ["plus", "encore", "ajoute", "ajouter", "continuer", "oui", "oui sil te plait", "oui sil vous plait"],
    remove: ["supprime", "retire", "enleve"],
    changeQty: ["change", "mets", "mettre", "regle"],
    undo: ["annule la derniere", "annuler la derniere", "undo", "retour"],
    clearDraft: ["efface la commande", "vider la commande", "recommencer", "tout effacer"],
    changeFillers: ["a", "a", "quantite"],
    removeFillers: ["de la commande", "sil te plait", "svp"],
    recapConfirm: [
      "confirmer la commande",
      "confirme la commande",
      "confirmer avec carte",
      "confirmer avec especes",
      "payer par carte",
      "payer en especes",
    ],
    recapClear: ["vider les articles", "vider la commande", "tout supprimer", "effacer tout"],
    recapContinue: ["je veux recommander", "commander encore", "ajouter plus", "continuer"],
    recapCancel: ["annuler", "annuler la commande", "laisser tomber"],
    paymentCard: ["carte", "carte bancaire", "par carte", "avec carte"],
    paymentCash: ["especes", "cash", "en especes"],
  },
};
const CANCEL_PHRASES = {
  en: ["cancel", "stop", "never mind"],
  tr: ["iptal", "vazgec"],
  de: ["abbrechen", "stopp"],
  fr: ["annuler", "arrete"],
};

const hasPhrase = (normalizedText, phrase) => {
  const p = normalizeVoiceText(phrase);
  if (!p) return false;
  return ` ${normalizedText} `.includes(` ${p} `);
};

const includesAny = (normalizedText, phrases) => {
  const safe = Array.isArray(phrases) ? phrases : [];
  return safe.some((phrase) => hasPhrase(normalizedText, phrase));
};

export function getVoicePhrases(lang) {
  const code = normalizeLang(lang);
  const selected = PHRASE_SETS[code] || PHRASE_SETS.en;
  return {
    finish: selected.finish || [],
    openRecap: selected.openRecap || [],
    readBack: selected.readBack || [],
    readTotal: selected.readTotal || [],
    continue: selected.continue || [],
    remove: selected.remove || [],
    changeQty: selected.changeQty || [],
    undo: selected.undo || [],
    clearDraft: selected.clearDraft || [],
    changeFillers: selected.changeFillers || [],
    removeFillers: selected.removeFillers || [],
    recapConfirm: selected.recapConfirm || [],
    recapClear: selected.recapClear || [],
    recapContinue: selected.recapContinue || [],
    recapCancel: selected.recapCancel || [],
    paymentCard: selected.paymentCard || [],
    paymentCash: selected.paymentCash || [],
  };
}

export function isContinueOnlyText(text, lang) {
  const normalizedText = normalizeVoiceText(text);
  if (!normalizedText) return false;
  const phrases = getVoicePhrases(lang);
  return includesAny(normalizedText, phrases.continue);
}

export function detectIntentKeyword(text, lang) {
  const normalizedText = normalizeVoiceText(text);
  if (!normalizedText) return null;

  const phrases = getVoicePhrases(lang);
  const cancelPhrases = CANCEL_PHRASES[normalizeLang(lang)] || CANCEL_PHRASES.en;
  if (includesAny(normalizedText, phrases.finish) || includesAny(normalizedText, phrases.openRecap)) {
    return "OPEN_RECAP";
  }
  if (includesAny(normalizedText, phrases.readBack)) return "READ_BACK";
  if (includesAny(normalizedText, phrases.readTotal)) return "READ_TOTAL";
  if (includesAny(normalizedText, phrases.clearDraft)) return "CLEAR_DRAFT";
  if (includesAny(normalizedText, phrases.undo)) return "UNDO_LAST";
  if (includesAny(normalizedText, phrases.changeQty)) return "CHANGE_QTY";
  if (includesAny(normalizedText, phrases.remove)) return "REMOVE_ITEM";
  if (includesAny(normalizedText, phrases.continue)) return "CONTINUE";
  if (includesAny(normalizedText, cancelPhrases)) return "CANCEL";
  return null;
}

export function detectRecapCommandKeyword(text, lang) {
  const normalizedText = normalizeVoiceText(text);
  if (!normalizedText) return null;

  const phrases = getVoicePhrases(lang);
  if (includesAny(normalizedText, phrases.recapCancel)) {
    return { action: "CANCEL", paymentHint: null };
  }
  if (includesAny(normalizedText, phrases.recapClear)) {
    return { action: "CLEAR_ITEMS", paymentHint: null };
  }
  if (includesAny(normalizedText, phrases.recapContinue)) {
    return { action: "CONTINUE", paymentHint: null };
  }

  const cardHint = includesAny(normalizedText, phrases.paymentCard);
  const cashHint = includesAny(normalizedText, phrases.paymentCash);
  if (includesAny(normalizedText, phrases.recapConfirm) || cardHint || cashHint) {
    return {
      action: "CONFIRM_ORDER",
      paymentHint: cardHint ? "card" : cashHint ? "cash" : null,
    };
  }

  return null;
}

export default {
  getVoicePhrases,
  normalizeVoiceText,
  detectIntentKeyword,
  detectRecapCommandKeyword,
  isContinueOnlyText,
};
