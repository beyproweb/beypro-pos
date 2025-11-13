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
  const [areaFilter, setAreaFilter] = useState("ALL");

  // --- Helpers / Derived data ---
  const activeTables = useMemo(
    () => (tables || []).filter((t) => t.active !== false),
    [tables]
  );

  const sortedTables = useMemo(
    () =>
      [...tables].sort((a, b) => {
        if (a.number == null || b.number == null) return 0;
        return a.number - b.number;
      }),
    [tables]
  );

  const defaultAreas = ["Main Hall", "Terrace", "Garden", "Bar", "VIP"];

  const allAreas = useMemo(() => {
    const set = new Set(defaultAreas);
    (tables || []).forEach((t) => {
      if (t.area) set.add(t.area);
    });
    return Array.from(set);
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (areaFilter === "ALL") return sortedTables;
    return sortedTables.filter((t) => (t.area || "Main Hall") === areaFilter);
  }, [sortedTables, areaFilter]);

  const totalCapacity = useMemo(
    () =>
      (tables || []).reduce(
        (sum, t) => sum + (Number(t.seats || t.chairs || 0) || 0),
        0
      ),
    [tables]
  );

  const totalTables = tables.length;
  const activeCount = activeTables.length;

  // --- API calls ---
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
      setTimeout(() => setToast(""), 1500);
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
      setTables((prev) =>
        prev.map((t) => (t.number === number ? { ...t, ...patch } : t))
      );
      setToast(t("Saved"));
    } catch (err) {
      console.error("❌ Failed to update table:", err);
      setError(t("Failed to update table"));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 1500);
    }
  };

  // --- UI helpers ---
  const getAreaLabel = (tbl) => tbl.area || "Main Hall";

  const handleQuickSeats = (tbl, seats) => {
    updateOne(tbl.number, { seats });
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-blue-500 bg-clip-text text-transparent">
            🪑 {t("Table Layout & Seating")}
          </h2>
          <p className="mt-1 text-sm text-gray-500 max-w-xl">
            {t(
              "Design your restaurant, hotel or cafe floor plan: set table count, sitting area and number of chairs per table for the Table Overview screen."
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
          <div className="rounded-2xl bg-white shadow-sm px-3 py-2 border border-gray-200">
            <p className="font-semibold text-gray-500">{t("Total Tables")}</p>
            <p className="mt-1 text-lg font-bold text-indigo-600 tabular-nums">
              {totalTables}
            </p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm px-3 py-2 border border-gray-200">
            <p className="font-semibold text-gray-500">{t("Active Tables")}</p>
            <p className="mt-1 text-lg font-bold text-emerald-600 tabular-nums">
              {activeCount}
            </p>
          </div>
          <div className="rounded-2xl bg-white shadow-sm px-3 py-2 border border-gray-200">
            <p className="font-semibold text-gray-500">{t("Total Seats")}</p>
            <p className="mt-1 text-lg font-bold text-slate-800 tabular-nums">
              {totalCapacity}
            </p>
          </div>
        </div>
      </div>

      {/* TOAST / ERROR */}
      <div className="space-y-2">
        {toast && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-sm shadow-sm">
            <span>✅</span>
            <span>{toast}</span>
          </div>
        )}
        {error && (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-100 text-red-800 text-sm shadow-sm">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* TOP CONTROLS: TOTAL COUNT + PRESETS */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        {/* Total count */}
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-600">
              {t("Active Table Count")}
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={desiredTotal}
              onChange={(e) => setDesiredTotal(Number(e.target.value))}
              className="border rounded-xl px-3 py-2 w-40 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="mt-1 text-[11px] text-gray-400 max-w-xs">
              {t(
                "Set how many tables should be active in your venue. Extra rows are kept for future use."
              )}
            </p>
          </div>
          <button
            onClick={handleSaveTotal}
            disabled={saving}
            className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? t("Saving...") : t("Save Table Count")}
          </button>
        </div>

        {/* “Venue Type” info chips (visual only, no backend impact) */}
        <div className="flex flex-wrap gap-2 text-[11px] sm:text-xs">
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            🍔 {t("Restaurant: mix 2–4 seat & 6–8 seat tables")}
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            ☕ {t("Cafe: more 2 seat tables, some 4 seat")}
          </span>
          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            🏨 {t("Hotel: define areas like Lobby, Terrace, Pool")}
          </span>
        </div>
      </div>

      {/* AREA FILTERS */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {t("Sitting Areas")}
        </h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAreaFilter("ALL")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              areaFilter === "ALL"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            🌍 {t("All Areas")}
          </button>
          {allAreas.map((area) => (
            <button
              key={area}
              onClick={() => setAreaFilter(area)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                areaFilter === area
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-blue-50"
              }`}
            >
              {area === "Main Hall" ? "🏠" : area === "Terrace" ? "🌤️" : area === "Garden" ? "🌿" : area === "Bar" ? "🍸" : area === "VIP" ? "⭐" : "📍"}{" "}
              {area}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          {t(
            "Assign each table to an area like Main Hall, Terrace, Garden, Lobby or Pool. This helps you read the Table Overview faster."
          )}
        </p>
      </div>

      {/* TABLES GRID */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>{t("Loading tables...")}</span>
            </div>
          </div>
        )}

        {filteredTables.length === 0 && !loading && (
          <div className="text-gray-500 text-sm mt-4">
            {t(
              "No tables defined yet. Set an active table count above and then customize each table."
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-2">
          {filteredTables.map((tbl) => {
            const isActive = tbl.active !== false;
            const seats = Number(tbl.seats || tbl.chairs || 0) || "";
            const area = getAreaLabel(tbl);
            const color = tbl.color || "#4f46e5";

            return (
              <div
                key={tbl.number}
                className={`relative rounded-3xl border p-4 bg-white shadow-sm flex flex-col gap-3 transition hover:shadow-lg ${
                  isActive
                    ? "border-gray-200"
                    : "border-dashed border-gray-300 opacity-75"
                }`}
              >
                {/* Top row: Table / Active toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">
                        {t("Table")}
                      </span>
                      <span className="text-lg font-extrabold text-slate-900">
                        #{tbl.number}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 text-slate-700">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {area}
                    </span>
                  </div>

                  <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600">
                    <span>{t("Active")}</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateOne(tbl.number, { active: !isActive })
                      }
                      className={`relative inline-flex h-5 w-9 rounded-full transition ${
                        isActive
                          ? "bg-emerald-500"
                          : "bg-gray-300 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition translate-y-0.5 ${
                          isActive ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Seats & quick buttons */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-600">
                    {t("Number of Chairs / Seats")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={seats}
                      onChange={(e) =>
                        updateOne(tbl.number, {
                          seats: Number(e.target.value || 0),
                        })
                      }
                      className="border rounded-xl px-2 py-1.5 w-20 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[2, 4, 6, 8].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handleQuickSeats(tbl, num)}
                          className={`px-2 py-1 rounded-full text-[11px] border transition ${
                            seats === num
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {num} {t("Seats")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">
                    {t(
                      "This helps you know instantly if a table is suitable for 2, 4, or big groups."
                    )}
                  </p>
                </div>

                {/* Area selector */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-600">
                    {t("Sitting Area")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={area}
                      onChange={(e) =>
                        updateOne(tbl.number, { area: e.target.value })
                      }
                      className="border rounded-xl px-2 py-1.5 text-sm shadow-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {allAreas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Color & Label */}
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-600">
                      {t("Color")}
                    </label>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) =>
                        updateOne(tbl.number, { color: e.target.value })
                      }
                      className="h-9 w-12 p-0 border rounded-xl cursor-pointer bg-white"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold mb-1 text-gray-600">
                      {t("Label")}
                    </label>
                    <input
                      type="text"
                      value={tbl.label || ""}
                      onChange={(e) =>
                        updateOne(tbl.number, { label: e.target.value })
                      }
                      placeholder={t("e.g. Window, Garden, Pool, VIP Corner")}
                      className="border rounded-xl px-3 py-1.5 w-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </div>

                {/* Tiny “preview” line */}
                <div className="mt-1 flex items-center justify-between text-[11px] text-gray-400">
                  <span>
                    {isActive ? "✅ " + t("Will be shown in Table Overview") : "🚫 " + t("Hidden from Table Overview")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-1 w-6 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {seats || 0} {t("seats")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
