import React, { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/card";
import { Tooltip } from "react-tooltip";
const API_URL = import.meta.env.VITE_API_URL || "";
export default function IngredientPrices() {
  const { t } = useTranslation();
  const [ingredients, setIngredients] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/ingredient-prices`)
      .then(res => res.json())
      .then(data => {
        console.log("🥒 Ingredient Prices Response:", data);
        if (Array.isArray(data)) {
          setIngredients(data);
        } else {
          console.error("❌ Expected array but got:", data);
          setIngredients([]);
        }
      })
      .catch(err => {
        console.error("❌ Failed to fetch prices:", err);
        setIngredients([]);
      });
  }, []);

  const filteredIngredients = ingredients.filter(item =>
    (item.name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (item.supplier?.toLowerCase() || "").includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen px-6 py-8 bg-gradient-to-br from-white-50 to-gray-100 dark:from-black dark:to-gray-900 text-gray-800 dark:text-white">
      <div className="flex items-center justify-between mb-6">

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search ingredient or supplier..."
          className="border rounded px-3 py-2 w-full max-w-xs focus:outline-accent transition duration-150 ease-in-out"
          style={{ minWidth: 220 }}
        />
      </div>

      <Card className="p-4 shadow-xl rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-300 dark:border-gray-700">
              <th className="p-2">{t("Ingredient")}</th>
              <th className="p-2">{t("Unit")}</th>
              <th className="p-2">{t("Supplier")}</th>
              <th className="p-2">{t("Current Price")}</th>
              <th className="p-2">{t("Previous Price")}</th>
              <th className="p-2">{t("Change")}</th>
              <th className="p-2">{t("Date")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredIngredients.map((item, i) => {
              const diff = item.price_per_unit - item.previous_price;
              const percent = item.previous_price
                ? ((diff / item.previous_price) * 100).toFixed(1)
                : "-";
              const isUp = diff > 0;
              const isDown = diff < 0;

              return (
                <tr key={i} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="p-2 font-medium">{item.name}</td>
                  <td className="p-2">{item.unit}</td>
                  <td className="p-2">{item.supplier}</td>
                  <td className="p-2">
                    {!isNaN(item.price_per_unit) ? `₺${Number(item.price_per_unit).toFixed(2)}` : "-"}
                  </td>
                  <td className="p-2">
                    {!isNaN(item.previous_price) ? `₺${Number(item.previous_price).toFixed(2)}` : "-"}
                  </td>
                  <td className="p-2">
                    {isUp && (
                      <span className="text-red-500 flex items-center gap-1">
                        <ArrowUp className="w-4 h-4" /> +{percent}%
                      </span>
                    )}
                    {isDown && (
                      <span className="text-green-500 flex items-center gap-1">
                        <ArrowDown className="w-4 h-4" /> {percent}%
                      </span>
                    )}
                    {!isUp && !isDown && <span>-</span>}
                  </td>
                  <td className="p-2">
                    {item.changed_at
                      ? new Date(item.changed_at).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })
                      : <span className="text-xs text-gray-400">-</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
