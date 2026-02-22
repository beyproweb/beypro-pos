import { useCallback, useMemo, useRef, useState } from "react";
import { attachNotesToItem } from "./attachNotesToItem";

const makeKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeName = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) => normalizeName(value).split(" ").filter(Boolean);

const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeExtraKey = (extra, index = 0) => {
  const explicit = extra?.key ?? extra?.id ?? extra?.extraId;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return String(explicit);
  const namePart = normalizeName(extra?.name || "extra") || "extra";
  const pricePart = toSafeNumber(extra?.price ?? extra?.extraPrice ?? 0, 0).toFixed(2);
  return `${namePart}:${pricePart}:${index}`;
};

const normalizeExtras = (extras) => {
  const safe = Array.isArray(extras) ? extras : [];
  return safe
    .map((extra, index) => {
      const key = normalizeExtraKey(extra, index);
      const quantity = Math.max(1, Math.floor(toSafeNumber(extra?.quantity, 1)));
      const unitPrice = toSafeNumber(extra?.price ?? extra?.extraPrice ?? 0, 0);
      return {
        ...(extra || {}),
        key,
        id: extra?.id ?? extra?.extraId ?? extra?.key ?? key,
        name: extra?.name || "",
        price: unitPrice,
        extraPrice: unitPrice,
        quantity,
      };
    })
    .filter((extra) => String(extra?.name || "").trim().length > 0);
};

const mergeExtras = (baseExtras, incomingExtras) => {
  const out = [];
  const indexByKey = new Map();

  const pushOrMerge = (extra) => {
    const key = String(extra?.key || "");
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, out.length);
      out.push({ ...extra });
      return;
    }
    out[idx] = {
      ...out[idx],
      quantity: (Number(out[idx]?.quantity) || 0) + (Number(extra?.quantity) || 0),
    };
  };

  normalizeExtras(baseExtras).forEach(pushOrMerge);
  normalizeExtras(incomingExtras).forEach(pushOrMerge);
  return out;
};

function scoreNameMatch(query, target) {
  const q = normalizeName(query);
  const t = normalizeName(target);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.94;

  const qTokens = tokenize(q);
  const tTokens = tokenize(t);
  if (!qTokens.length || !tTokens.length) return 0;

  const tSet = new Set(tTokens);
  const overlap = qTokens.filter((token) => tSet.has(token)).length;
  if (!overlap) return 0;
  return overlap / Math.max(qTokens.length, tTokens.length);
}

export function summarizeDraftItems(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const totalQty = safeItems.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0);
  const totalPrice = safeItems.reduce(
    (sum, item) => {
      const qty = Number(item?.qty) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      const extrasPerUnit = (Array.isArray(item?.extras) ? item.extras : []).reduce(
        (extraSum, extra) =>
          extraSum + (Number(extra?.price ?? extra?.extraPrice ?? 0) || 0) * (Number(extra?.quantity) || 1),
        0
      );
      return sum + qty * (unitPrice + extrasPerUnit);
    },
    0
  );
  return {
    items: safeItems,
    totalQty,
    totalPrice,
  };
}

export function useDraftOrder(initialItems = []) {
  const [items, setItems] = useState(() => (Array.isArray(initialItems) ? initialItems : []));
  const historyRef = useRef([]);

  const pushHistory = useCallback((snapshot) => {
    if (!Array.isArray(snapshot)) return;
    historyRef.current = [...historyRef.current.slice(-19), snapshot];
  }, []);

  const addItem = useCallback(
    (nextItem) => {
      if (!nextItem) return;
      const qty = Math.max(1, Number(nextItem.qty) || 1);
      const incomingProductId = nextItem.productId ?? null;
      const incomingGroupLabel = String(nextItem.groupLabel || "Table").trim() || "Table";
      const incomingExtras = normalizeExtras(nextItem.extras);

      setItems((prev) => {
        const index = prev.findIndex((item) => {
          const sameGroup = String(item.groupLabel || "Table").trim() === incomingGroupLabel;
          if (!sameGroup) return false;
          if (incomingProductId !== null && item.productId !== null) {
            return String(item.productId) === String(incomingProductId);
          }
          return normalizeName(item.name) === normalizeName(nextItem.name);
        });

        pushHistory(prev);

        if (index === -1) {
          return [
            ...prev,
            {
              key: nextItem.key || makeKey(),
              productId: incomingProductId,
              name: nextItem.name || "",
              qty,
              unitPrice: Number(nextItem.unitPrice) || 0,
              notes: attachNotesToItem("", nextItem.notes || ""),
              groupLabel: incomingGroupLabel,
              extras: incomingExtras,
            },
          ];
        }

        const merged = [...prev];
        merged[index] = {
          ...merged[index],
          qty: (Number(merged[index].qty) || 0) + qty,
          notes: attachNotesToItem(merged[index].notes || "", nextItem.notes || ""),
          groupLabel: incomingGroupLabel,
          extras: mergeExtras(merged[index].extras, incomingExtras),
        };
        return merged;
      });
    },
    [pushHistory]
  );

  const removeItem = useCallback(
    (keyOrProductId) => {
      if (keyOrProductId === undefined || keyOrProductId === null) return;
      const target = String(keyOrProductId);
      setItems((prev) => {
        const next = prev.filter(
          (item) => String(item.key) !== target && String(item.productId ?? "") !== target
        );
        if (next.length !== prev.length) {
          pushHistory(prev);
        }
        return next;
      });
    },
    [pushHistory]
  );

  const findByNameMatch = useCallback(
    (queryName) => {
      const query = normalizeName(queryName);
      if (!query) return [];

      return items
        .map((item) => ({
          item,
          score: scoreNameMatch(query, item?.name || ""),
        }))
        .filter((entry) => entry.score > 0.34)
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.item);
    },
    [items]
  );

  const removeByProductId = useCallback(
    (productId) => {
      if (productId === undefined || productId === null) {
        return { status: "not_found" };
      }

      const target = String(productId);
      const current = items.find(
        (item) => String(item.productId ?? "") === target || String(item.key) === target
      );

      if (!current) return { status: "not_found" };
      removeItem(productId);
      return { status: "removed", item: current };
    },
    [items, removeItem]
  );

  const removeByNameMatch = useCallback(
    (queryName) => {
      const matches = findByNameMatch(queryName);
      if (!matches.length) return { status: "not_found", matches: [] };
      if (matches.length > 1) {
        return {
          status: "ambiguous",
          matches: matches.slice(0, 5),
        };
      }

      return removeByProductId(matches[0].productId ?? matches[0].key);
    },
    [findByNameMatch, removeByProductId]
  );

  const updateQty = useCallback(
    (productId, qty) => {
      if (productId === undefined || productId === null) {
        return { status: "not_found" };
      }

      const target = String(productId);
      const nextQty = Math.max(1, Number(qty) || 1);
      const existing = items.find(
        (item) => String(item.productId ?? "") === target || String(item.key) === target
      );
      if (!existing) return { status: "not_found" };

      setItems((prev) => {
        const index = prev.findIndex(
          (item) => String(item.productId ?? "") === target || String(item.key) === target
        );
        if (index === -1) return prev;
        pushHistory(prev);
        const next = [...prev];
        next[index] = {
          ...next[index],
          qty: nextQty,
        };
        return next;
      });

      return {
        status: "updated",
        item: {
          ...existing,
          qty: nextQty,
        },
      };
    },
    [items, pushHistory]
  );

  const updateExtraQty = useCallback(
    (itemId, extraKeyOrId, qty) => {
      if (itemId === undefined || itemId === null) return { status: "not_found" };
      if (extraKeyOrId === undefined || extraKeyOrId === null) return { status: "not_found" };

      const targetItemId = String(itemId);
      const targetExtraId = String(extraKeyOrId);
      const existingItem = items.find(
        (item) => String(item.key) === targetItemId || String(item.productId ?? "") === targetItemId
      );
      if (!existingItem) return { status: "not_found" };

      const existingExtras = normalizeExtras(existingItem.extras);
      const existingIndex = existingExtras.findIndex((extra, index) => {
        const key = String(extra?.key || normalizeExtraKey(extra, index));
        const id = String(extra?.id ?? "");
        return key === targetExtraId || id === targetExtraId;
      });
      if (existingIndex === -1) return { status: "not_found" };

      const nextQty = Math.max(0, Math.floor(Number(qty) || 0));

      setItems((prev) => {
        const itemIndex = prev.findIndex(
          (item) => String(item.key) === targetItemId || String(item.productId ?? "") === targetItemId
        );
        if (itemIndex === -1) return prev;

        const baseExtras = normalizeExtras(prev[itemIndex]?.extras);
        const extraIndex = baseExtras.findIndex((extra, index) => {
          const key = String(extra?.key || normalizeExtraKey(extra, index));
          const id = String(extra?.id ?? "");
          return key === targetExtraId || id === targetExtraId;
        });
        if (extraIndex === -1) return prev;

        pushHistory(prev);
        const next = [...prev];
        const updatedExtras = [...baseExtras];
        if (nextQty <= 0) {
          updatedExtras.splice(extraIndex, 1);
        } else {
          updatedExtras[extraIndex] = {
            ...updatedExtras[extraIndex],
            quantity: nextQty,
          };
        }
        next[itemIndex] = {
          ...next[itemIndex],
          extras: updatedExtras,
        };
        return next;
      });

      return {
        status: "updated",
      };
    },
    [items, pushHistory]
  );

  const clear = useCallback(() => {
    setItems((prev) => {
      if (!prev.length) return prev;
      pushHistory(prev);
      return [];
    });
  }, [pushHistory]);

  const undoLast = useCallback(() => {
    const stack = historyRef.current;
    if (!stack.length) return { status: "empty" };
    const previousSnapshot = stack[stack.length - 1];
    historyRef.current = stack.slice(0, -1);
    setItems(previousSnapshot);
    return { status: "ok", items: previousSnapshot };
  }, []);

  const getSummary = useCallback(() => summarizeDraftItems(items), [items]);

  const appendNotesToLastItem = useCallback(
    (notes) => {
      const incoming = attachNotesToItem("", notes || "");
      if (!incoming) return { status: "invalid" };

      const lastItem = items[items.length - 1];
      if (!lastItem) return { status: "not_found" };

      const mergedNotes = attachNotesToItem(lastItem.notes || "", incoming);
      if (!mergedNotes) return { status: "invalid" };

      const targetId = String(lastItem.key);
      setItems((prev) => {
        const index = prev.findIndex((item) => String(item.key) === targetId);
        if (index === -1) return prev;
        pushHistory(prev);
        const next = [...prev];
        next[index] = {
          ...next[index],
          notes: mergedNotes,
        };
        return next;
      });

      return {
        status: "updated",
        item: {
          ...lastItem,
          notes: mergedNotes,
        },
      };
    },
    [items, pushHistory]
  );

  const summary = useMemo(() => summarizeDraftItems(items), [items]);

  return {
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
    getSummary,
    summary,
  };
}

export default useDraftOrder;
