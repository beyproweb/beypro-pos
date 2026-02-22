import { useEffect, useMemo, useState } from "react";
import { useTxBootstrap } from "../../transactions/hooks/useTxBootstrap";
import { useTxProducts } from "../../transactions/hooks/useTxProducts";
import {
  readCachedCategoryOrderKeys,
  writeCachedCategoryOrderKeys,
  writeCachedProducts,
} from "../../transactions/utils/cache";
import {
  normalizeExtrasGroupSelection,
  normalizeGroupKey,
} from "../../transactions/utils/normalization";
import { txApiGetAuthToken, txApiRequest } from "../../transactions/services/transactionApi";

export const useTransactionData = ({ orderId, location, currentUser }) => {
  const { initialOrder, phoneOrderDraft, restaurantSlug, identifier, getInitialProducts } =
    useTxBootstrap({ orderId, location });

  const { products, setProducts } = useTxProducts({
    currentUser,
    restaurantSlug,
    getInitialProducts,
    writeCachedProducts,
    normalizeExtrasGroupSelection,
    txApiGetAuthToken,
    txApiRequest,
  });

  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(() => !initialOrder);
  const [error, setError] = useState(null);

  const rawCategories = useMemo(
    () => [...new Set((Array.isArray(products) ? products : []).map((p) => p.category))].filter(Boolean),
    [products]
  );

  const [categoryOrderKeys, setCategoryOrderKeys] = useState(() => readCachedCategoryOrderKeys());

  useEffect(() => {
    writeCachedCategoryOrderKeys(categoryOrderKeys);
  }, [categoryOrderKeys]);

  const categories = useMemo(() => {
    const base = Array.isArray(rawCategories) ? rawCategories : [];
    if (base.length === 0) return [];
    if (!Array.isArray(categoryOrderKeys) || categoryOrderKeys.length === 0) return base;

    const baseByKey = new Map(base.map((cat) => [normalizeGroupKey(cat), cat]));
    const usedKeys = new Set();
    const ordered = [];

    categoryOrderKeys.forEach((key) => {
      const normalized = normalizeGroupKey(key);
      if (!normalized) return;
      const match = baseByKey.get(normalized);
      if (!match) return;
      if (usedKeys.has(normalized)) return;
      usedKeys.add(normalized);
      ordered.push(match);
    });

    base.forEach((cat) => {
      const key = normalizeGroupKey(cat);
      if (!key || usedKeys.has(key)) return;
      usedKeys.add(key);
      ordered.push(cat);
    });

    return ordered;
  }, [rawCategories, categoryOrderKeys]);

  return {
    order,
    setOrder,
    loading,
    setLoading,
    error,
    setError,
    products,
    setProducts,
    categories,
    rawCategories,
    categoryOrderKeys,
    setCategoryOrderKeys,
    initialOrder,
    phoneOrderDraft,
    restaurantSlug,
    identifier,
    getInitialProducts,
  };
};
