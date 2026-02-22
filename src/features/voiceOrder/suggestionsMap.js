const CATEGORY_SUGGESTIONS = {
  burger: ["fries", "cola"],
  chicken: ["sauce", "drink"],
  dessert: ["coffee", "tea"],
};

const CATEGORY_KEYWORDS = {
  burger: ["burger", "hamburger"],
  chicken: ["chicken", "tavuk", "huhn", "poulet"],
  dessert: ["dessert", "tatli", "tatlı", "sweet", "sweets"],
};

const ITEM_KEYWORDS = {
  fries: ["fries", "fry", "patates", "pommes", "frites"],
  cola: ["cola", "kola", "coke", "coca"],
  sauce: ["sauce", "sos", "sosse", "sose"],
  drink: ["drink", "icecek", "içecek", "getrank", "boisson", "water", "juice"],
  coffee: ["coffee", "kahve", "kaffee", "cafe"],
  tea: ["tea", "cay", "çay", "tee", "the"],
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractCategoryText = (product) =>
  [
    product?.category,
    product?.categoryName,
    product?.category_name,
    product?.categoryTitle,
    product?.mainCategory,
  ]
    .filter(Boolean)
    .join(" ");

const includesKeyword = (text, keywords = []) => {
  const normalizedText = normalize(text);
  if (!normalizedText) return false;
  return keywords.some((keyword) => {
    const candidate = normalize(keyword);
    return candidate && ` ${normalizedText} `.includes(` ${candidate} `);
  });
};

export function detectMainSuggestionCategory(product) {
  if (!product) return null;

  const categoryText = extractCategoryText(product);
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (includesKeyword(categoryText, keywords)) {
      return key;
    }
  }

  const name = product?.name || "";
  for (const [key, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (includesKeyword(name, keywords)) {
      return key;
    }
  }

  return null;
}

function matchTokenProduct(tokenKey, products, excludedIds = new Set()) {
  const keywords = ITEM_KEYWORDS[tokenKey] || [];
  const safeProducts = Array.isArray(products) ? products : [];

  const ranked = safeProducts
    .filter((product) => {
      const id = String(product?.id ?? "");
      return !excludedIds.has(id);
    })
    .map((product) => {
      const name = normalize(product?.name);
      const category = normalize(extractCategoryText(product));

      let score = 0;
      for (const keyword of keywords) {
        const candidate = normalize(keyword);
        if (!candidate) continue;
        if (` ${name} `.includes(` ${candidate} `)) {
          score = Math.max(score, 1);
        } else if (` ${category} `.includes(` ${candidate} `)) {
          score = Math.max(score, 0.7);
        }
      }

      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.product?.price || 0) - Number(b.product?.price || 0));

  return ranked[0]?.product || null;
}

export function buildWaiterSuggestions(mainProduct, products) {
  const mainCategory = detectMainSuggestionCategory(mainProduct);
  if (!mainCategory) return [];

  const mapping = CATEGORY_SUGGESTIONS[mainCategory] || [];
  if (!mapping.length) return [];

  const excludedIds = new Set([String(mainProduct?.id ?? "")]);
  const out = [];

  mapping.forEach((tokenKey) => {
    const matched = matchTokenProduct(tokenKey, products, excludedIds);
    if (!matched) return;
    excludedIds.add(String(matched?.id ?? ""));
    out.push({
      key: `${tokenKey}:${matched?.id ?? matched?.name ?? out.length}`,
      tokenKey,
      product: matched,
    });
  });

  return out.slice(0, 3);
}

export default {
  buildWaiterSuggestions,
  detectMainSuggestionCategory,
};
