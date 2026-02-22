import { useCallback, useState } from "react";
import {
  addDrinkApi,
  fetchDrinksFromApi,
  removeDrinkApi,
} from "../api/drinksApi";

export default function useDrinks() {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async ({ errorMessage = "", logError } = {}) => {
    setLoading(true);
    try {
      const data = await fetchDrinksFromApi();
      setDrinks(data);
      setError("");
      return data;
    } catch (err) {
      if (typeof logError === "function") logError(err);
      setError(errorMessage);
      setDrinks([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const addDrink = useCallback(
    async (name, { errorMessage = "", onAfterWrite } = {}) => {
      setSaving(true);
      try {
        await addDrinkApi(name);
        if (typeof onAfterWrite === "function") onAfterWrite();
        setError("");
        const updated = await fetchDrinksFromApi();
        setDrinks(updated);
        return updated;
      } catch (err) {
        setError(errorMessage);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  const removeDrink = useCallback(
    async (id, { errorMessage = "" } = {}) => {
      setSaving(true);
      try {
        await removeDrinkApi(id);
        setError("");
        const updated = await fetchDrinksFromApi();
        setDrinks(updated);
        return updated;
      } catch (err) {
        setError(errorMessage);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return {
    drinks,
    loading,
    saving,
    error,
    refresh,
    addDrink,
    removeDrink,
  };
}
