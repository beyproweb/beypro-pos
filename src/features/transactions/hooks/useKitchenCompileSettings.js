import { useEffect, useRef, useState } from "react";
import { txApiRequest } from "../services/transactionApi";

export const useKitchenCompileSettings = (identifier) => {
  const [excludedItems, setExcludedItems] = useState([]);
  const [excludedCategories, setExcludedCategories] = useState([]);
  const identifierRef = useRef(identifier || "");

  useEffect(() => {
    txApiRequest(`/kitchen/compile-settings${identifierRef.current}`).then(
      (data) => {
        setExcludedItems(data.excludedItems || []);
        setExcludedCategories(data.excludedCategories || []);
      }
    );
  }, []);

  return {
    excludedItems,
    excludedCategories,
  };
};
