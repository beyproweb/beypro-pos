import React, { useEffect, useMemo, useState } from "react";
import secureFetch from "../../utils/secureFetch";
import { useTranslation } from "react-i18next";

export default function TablesSettingsTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState([]);
  const [desiredTotal, setDesiredTotal] = useState(20);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const activeTables = useMemo(() => (tables || []).filter((t) => t.active !== false), [tables]);

  const fetchTables = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await secureFetch("/tables");
      const arr = Array.isArray(data) ? data : [];
      setTables(arr);
      const activeCount = arr.filter((t) => t.active !== false).length;
      setDesiredTotal(activeCount || 20);
    } catch (err) {
      console.error("❌ Failed to fetch tables:", err);
      setError(t("Failed to load tables"));
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const handleSaveTotal = async () => {
    if (!Number.isFinite(Number(desiredTotal)) || desiredTotal < 0) return;
    setSaving(true);
    setError("");
    try {
      await secureFetch("/tables/count", {
        method: "PUT",
        body: JSON.stringify({ total: Number(desiredTotal) }),
      });
      setToast(t("Table count saved"));
      await fetchTables();
    } catch (err) {
      console.error("❌ Failed to save table count:", err);
      setError(t("Failed to save table count"));
    } finally {
      setSaving(false);
    }
  };

  const updateOne = async (number, patch) => {
    setSaving(true);
    setError("");
    try {
      await secureFetch(`/tables/${number}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setTables((prev) => prev.map((t) => (t.number === number ? { ...t, ...patch } : t)));
      setToast(t("Saved"));
    } catch (err) {
      console.error("❌ Failed to update table:", err);
      setError(t("Failed to update table"));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 1500);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">🪑 {t("Tables")}</h2>
        <p className="text-sm text-gray-500">{t("Manage table count, colors and labels.")}</p>
      </div>

      {toast && (
        <div className="px-3 py-2 rounded bg-emerald-100 text-emerald-800 inline-block">{toast}</div>
      )}
      {error && (
        <div className="px-3 py-2 rounded bg-red-100 text-red-800 inline-block">{error}</div>
      )}

      {/* Total count */}
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm font-semibold mb-1">{t("Total Tables")}</label>
          <input
            type="number"
            min={0}
            max={500}
            value={desiredTotal}
            onChange={(e) => setDesiredTotal(Number(e.target.value))}
            className="border rounded px-3 py-2 w-40"
          />
        </div>
        <button
          onClick={handleSaveTotal}
          disabled={saving}
          className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold disabled:opacity-60"
        >
          {saving ? t("Saving...") : t("Save Count")}
        </button>
      </div>

      {/* Grid of tables */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeTables.length === 0 && !loading && (
          <div className="text-gray-500">{t("No tables yet. Set a count above and save.")}</div>
        )}
        {activeTables.map((tbl) => (
          <div key={tbl.number} className="rounded-xl border p-4 bg-white dark:bg-zinc-900 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">{t("Table")} #{tbl.number}</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tbl.active !== false}
                  onChange={(e) => updateOne(tbl.number, { active: e.target.checked })}
                />
                {t("Active")}
              </label>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold">{t("Color")}</label>
              <input
                type="color"
                value={tbl.color || "#4f46e5"}
                onChange={(e) => updateOne(tbl.number, { color: e.target.value })}
                className="h-8 w-12 p-0 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">{t("Label")}</label>
              <input
                type="text"
                value={tbl.label || ""}
                onChange={(e) => updateOne(tbl.number, { label: e.target.value })}
                placeholder={t("e.g. Garden, Window, VIP")}
                className="border rounded px-3 py-2 w-full"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

