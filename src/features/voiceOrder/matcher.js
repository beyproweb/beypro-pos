const TR_CHAR_MAP = {
  "ı": "i",
  "İ": "i",
  "ş": "s",
  "Ş": "s",
  "ğ": "g",
  "Ğ": "g",
  "ü": "u",
  "Ü": "u",
  "ö": "o",
  "Ö": "o",
  "ç": "c",
  "Ç": "c",
};

const SYNONYM_GROUPS = {
  common: [
    ["cola", "coca cola", "coke", "kola", "coca"],
    ["fries", "french fries", "patates", "pommes", "frites"],
    ["water", "su", "wasser", "eau"],
    ["drink", "icecek", "içecek", "getrank", "boisson", "beverage"],
    ["ayran", "yogurt drink", "yoghurt drink"],
    ["burger", "hamburger"],
    ["whiskey", "whisky"],
  ],
  en: [["soda", "cola"]],
  tr: [["gazoz", "cola"], ["patso", "fries"]],
  de: [["pommes frites", "fries"], ["wasser", "water"]],
  fr: [["frites", "fries"], ["eau", "water"]],
};

const LANG_FALLBACK = "en";

const normalizeLang = (lang) => {
  const raw = String(lang || "").toLowerCase().trim();
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  return "en";
};

export const normalizeTR = (value) =>
  String(value || "").replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => TR_CHAR_MAP[char] || char);

export const normalizeSearchText = (value) =>
  normalizeTR(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`´’‘]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) => normalizeSearchText(value).split(" ").filter(Boolean);

function buildSynonymLookup(lang) {
  const code = normalizeLang(lang);
  const groups = [...(SYNONYM_GROUPS.common || []), ...(SYNONYM_GROUPS[code] || []), ...(SYNONYM_GROUPS[LANG_FALLBACK] || [])];

  const phraseGroups = groups.map((group) => group.map((item) => normalizeSearchText(item)).filter(Boolean));
  const tokenLookup = new Map();

  phraseGroups.forEach((phrases) => {
    const tokens = new Set();
    phrases.forEach((phrase) => {
      tokenize(phrase).forEach((token) => tokens.add(token));
    });
    const merged = [...tokens];
    merged.forEach((token) => {
      tokenLookup.set(token, merged);
    });
  });

  return { phraseGroups, tokenLookup };
}

function expandQueryTokens(normalizedQuery, synonymLookup) {
  const baseTokens = tokenize(normalizedQuery);
  const out = new Set(baseTokens);
  const joined = ` ${normalizedQuery} `;

  (synonymLookup?.phraseGroups || []).forEach((group) => {
    const hasPhrase = group.some((phrase) => phrase && joined.includes(` ${phrase} `));
    if (!hasPhrase) return;
    group.forEach((phrase) => {
      tokenize(phrase).forEach((token) => out.add(token));
    });
  });

  baseTokens.forEach((token) => {
    const synonyms = synonymLookup?.tokenLookup?.get(token) || [];
    synonyms.forEach((syn) => out.add(syn));
  });

  return [...out];
}

function prefixMatchToken(queryToken, targetToken) {
  if (!queryToken || !targetToken) return false;
  if (queryToken.length < 2 || targetToken.length < 2) return false;
  return targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken);
}

function levenshteinDistance(a, b, maxDistance = 2) {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);

  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDistance) return maxDistance + 1;

  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) prev[j] = j;

  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];

    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= lenB; j += 1) prev[j] = curr[j];
  }

  return prev[lenB];
}

function typoTokenMatch(queryToken, targetToken) {
  if (!queryToken || !targetToken) return false;
  if (queryToken.length > 8 || targetToken.length > 8) return false;
  const distance = levenshteinDistance(queryToken, targetToken, 2);
  if (distance <= 1) return true;
  if (
    distance === 2 &&
    queryToken.length >= 5 &&
    targetToken.length >= 5 &&
    queryToken[0] === targetToken[0]
  ) {
    return true;
  }
  return false;
}

function scoreAgainstTokens(normalizedQuery, queryTokens, targetName, targetTokens, rawQueryTokens = queryTokens) {
  const normalizedTarget = normalizeSearchText(targetName);
  if (!normalizedQuery || !normalizedTarget) return 0;

  if (normalizedQuery === normalizedTarget) return 1;
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) {
    return 0.93;
  }

  const safeQueryTokens = Array.isArray(queryTokens) ? queryTokens.filter(Boolean) : [];
  const safeTargetTokens = Array.isArray(targetTokens) ? targetTokens.filter(Boolean) : tokenize(normalizedTarget);
  if (!safeQueryTokens.length || !safeTargetTokens.length) return 0;

  const targetSet = new Set(safeTargetTokens);
  let overlap = 0;
  let prefix = 0;
  let typo = 0;

  safeQueryTokens.forEach((queryToken) => {
    if (targetSet.has(queryToken)) {
      overlap += 1;
      return;
    }

    const hasPrefix = safeTargetTokens.some((targetToken) => prefixMatchToken(queryToken, targetToken));
    if (hasPrefix) {
      prefix += 1;
      return;
    }

    const hasTypo = safeTargetTokens.some((targetToken) => typoTokenMatch(queryToken, targetToken));
    if (hasTypo) typo += 1;
  });

  const divisor = Math.max(
    safeQueryTokens.length,
    Math.min(safeTargetTokens.length, safeQueryTokens.length + 2)
  );
  const overlapScore = overlap / divisor;
  const prefixScore = prefix / Math.max(1, safeQueryTokens.length);
  const typoScore = typo / Math.max(1, safeQueryTokens.length);
  let score = overlapScore * 0.56 + prefixScore * 0.24 + typoScore * 0.2;

  const safeRawQueryTokens = Array.isArray(rawQueryTokens) ? rawQueryTokens.filter(Boolean) : safeQueryTokens;
  if (safeRawQueryTokens.length === 1) {
    const queryToken = safeRawQueryTokens[0];
    let bestTokenScore = 0;

    safeTargetTokens.forEach((targetToken) => {
      if (queryToken === targetToken) {
        bestTokenScore = Math.max(bestTokenScore, 1);
        return;
      }
      if (prefixMatchToken(queryToken, targetToken)) {
        bestTokenScore = Math.max(bestTokenScore, 0.84);
        return;
      }
      if (queryToken.length <= 8 && targetToken.length <= 8) {
        const dist = levenshteinDistance(queryToken, targetToken, 2);
        if (dist === 1) bestTokenScore = Math.max(bestTokenScore, 0.72);
        if (dist === 2 && queryToken.length >= 5 && targetToken.length >= 5) {
          bestTokenScore = Math.max(bestTokenScore, 0.56);
        }
      }
    });

    if (bestTokenScore > 0) {
      const densityPenalty = safeTargetTokens.length > 1 ? 0.85 : 1;
      score = Math.max(score, bestTokenScore * densityPenalty);
    }
  }

  return score;
}

export function scoreTextMatch(query, target, lang = "en") {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTarget = normalizeSearchText(target);
  if (!normalizedQuery || !normalizedTarget) return 0;

  const synonymLookup = buildSynonymLookup(lang);
  const baseQueryTokens = tokenize(normalizedQuery);
  const queryTokens = expandQueryTokens(normalizedQuery, synonymLookup);
  return scoreAgainstTokens(
    normalizedQuery,
    queryTokens,
    normalizedTarget,
    tokenize(normalizedTarget),
    baseQueryTokens
  );
}

export function buildProductSearchIndex(products = [], lang = "en") {
  const synonymLookup = buildSynonymLookup(lang);
  const safeProducts = Array.isArray(products) ? products : [];

  const entries = safeProducts.map((product, index) => {
    const name = String(product?.name || "");
    const normalizedName = normalizeSearchText(name);
    const baseTokens = tokenize(normalizedName);
    const expandedTokens = new Set(baseTokens);

    baseTokens.forEach((token) => {
      const synonyms = synonymLookup.tokenLookup.get(token) || [];
      synonyms.forEach((syn) => expandedTokens.add(syn));
    });

    return {
      id: String(product?.id ?? index),
      product,
      normalizedName,
      tokens: baseTokens,
      searchTokens: [...expandedTokens],
    };
  });

  const tokenIndex = new Map();
  const firstCharIndex = new Map();

  entries.forEach((entry, index) => {
    entry.searchTokens.forEach((token) => {
      if (!tokenIndex.has(token)) tokenIndex.set(token, []);
      tokenIndex.get(token).push(index);

      const key = token.slice(0, 2);
      if (key) {
        if (!firstCharIndex.has(key)) firstCharIndex.set(key, []);
        firstCharIndex.get(key).push(index);
      }
    });
  });

  return {
    entries,
    tokenIndex,
    firstCharIndex,
    synonymLookup,
  };
}

function collectCandidateIndexes(index, queryTokens) {
  const candidateIndexes = new Set();

  queryTokens.forEach((token) => {
    const exact = index.tokenIndex.get(token) || [];
    exact.forEach((idx) => candidateIndexes.add(idx));
  });

  if (candidateIndexes.size >= 3) return candidateIndexes;

  queryTokens.forEach((token) => {
    const key = token.slice(0, 2);
    if (!key) return;
    const prefixed = index.firstCharIndex.get(key) || [];
    prefixed.forEach((idx) => candidateIndexes.add(idx));
  });

  if (candidateIndexes.size > 0) return candidateIndexes;

  index.entries.forEach((_, idx) => candidateIndexes.add(idx));
  return candidateIndexes;
}

export function createProductMatcher(products = [], lang = "en") {
  const index = buildProductSearchIndex(products, lang);

  const topCandidates = (queryName, options = {}) => {
    const limit = Number(options.limit) || 3;
    const minScore = Number(options.minScore) || 0;

    const normalizedQuery = normalizeSearchText(queryName);
    if (!normalizedQuery || !index.entries.length) return [];

    const baseQueryTokens = tokenize(normalizedQuery);
    const queryTokens = expandQueryTokens(normalizedQuery, index.synonymLookup);
    const candidateIndexes = collectCandidateIndexes(index, queryTokens);

    const ranked = [...candidateIndexes]
      .map((idx) => {
        const entry = index.entries[idx];
        return {
          product: entry.product,
          score: scoreAgainstTokens(
            normalizedQuery,
            queryTokens,
            entry.normalizedName,
            entry.searchTokens,
            baseQueryTokens
          ),
        };
      })
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));

    return ranked;
  };

  const resolve = (queryName, options = {}) => {
    const minScore = Number(options.minScore) || 0.43;
    const ambiguousDelta = Number(options.ambiguousDelta) || 0.08;
    const topN = Number(options.topN) || 3;

    const ranked = topCandidates(queryName, {
      limit: Math.max(5, topN),
      minScore: 0,
    });

    if (!ranked.length || ranked[0].score < minScore) {
      return { status: "none", candidates: [] };
    }

    const top = ranked[0];
    const second = ranked[1];

    if (second && top.score - second.score <= ambiguousDelta && second.score >= minScore) {
      return {
        status: "ambiguous",
        candidates: ranked.slice(0, topN).map((entry) => entry.product),
      };
    }

    return {
      status: "resolved",
      product: top.product,
      candidates: [top.product],
    };
  };

  const scoreOptionText = (queryText, targetText) => {
    const normalizedQuery = normalizeSearchText(queryText);
    if (!normalizedQuery) return 0;
    const baseQueryTokens = tokenize(normalizedQuery);
    const queryTokens = expandQueryTokens(normalizedQuery, index.synonymLookup);
    return scoreAgainstTokens(
      normalizedQuery,
      queryTokens,
      targetText,
      tokenize(targetText),
      baseQueryTokens
    );
  };

  return {
    resolve,
    topCandidates,
    scoreOptionText,
    normalizeSearchText,
  };
}

export default {
  normalizeTR,
  normalizeSearchText,
  scoreTextMatch,
  buildProductSearchIndex,
  createProductMatcher,
};
