// src/pages/Ingredient.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  RefreshCw,
  TrendingUp,
  Search,
  History,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
import { useCurrency } from "../context/CurrencyContext";

// Small helpers
const titleCase = (s = "") =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const Spark = ({ points = [] }) => {
  // simple mini sparkline (no external libs)
  if (!points.length) return <div className="h-10" />;
  const w = 120,
    h = 40,
    min = Math.min(...points),
    max = Math.max(...points),
    norm = (v) => (max === min ? h / 2 : h - ((v - min) / (max - min)) * h);
  const step = w / Math.max(points.length - 1, 1);
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${norm(v)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-90">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
};

export default function Ingredient() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [history, setHistory] = useState({}); // key -> history array
  const [historyLoading, setHistoryLoading] = useState({}); // key -> boolean
  const [sortBy, setSortBy] = useState("alpha"); // alpha | change | price

  // Load latest snapshot
  const load = async () => {
    setLoading(true);
    try {
      const data = await secureFetch("/ingredient-prices");
      if (Array.isArray(data)) setRows(data);
      else setRows([]);
    } catch (e) {
      console.error("❌ ingredient-prices fetch failed:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      const a = (r.name || "").toLowerCase();
      const b = (r.supplier || "").toLowerCase();
      return a.includes(q.toLowerCase()) || b.includes(q.toLowerCase());
    });

    if (sortBy === "alpha") {
      out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } else if (sortBy === "change") {
      out.sort((a, b) => {
        const da =
          (Number(a.price_per_unit) || 0) - (Number(a.previous_price) || 0);
        const db =
          (Number(b.price_per_unit) || 0) - (Number(b.previous_price) || 0);
        return Math.abs(db) - Math.abs(da);
      });
    } else if (sortBy === "price") {
      out.sort(
        (a, b) =>
          (Number(b.price_per_unit) || 0) - (Number(a.price_per_unit) || 0)
      );
    }
    return out;
  }, [rows, q, sortBy]);

  const toggleHistory = async (key, item) => {
    setOpenKey(openKey === key ? null : key);
    if (openKey === key) return;

    // lazy fetch history (backend route optional; has graceful fallback)
    if (!history[key]) {
      setHistoryLoading((s) => ({ ...s, [key]: true }));
      try {
        // Try hitting a (recommended) backend route:
        //   GET /api/ingredient-prices/history?name=...&unit=...&supplier=...&limit=12
        // If your backend doesn’t have it yet, we’ll fall back to 2-point mini history.
        const params = new URLSearchParams({
          name: item.name,
          unit: item.unit || "",
          supplier: item.supplier || "",
          limit: "12",
        }).toString();

        let hist = [];
        try {
          hist = await secureFetch(`/ingredient-prices/history?${params}`);
        } catch {
          // fallback using the snapshot (current + previous)
          const nowPoint = {
            price: Number(item.price_per_unit) || 0,
            reason: item.reason || "Current",
            changed_at: item.changed_at || new Date().toISOString(),
          };
          const prevPoint =
            Number.isFinite(+item.previous_price) && item.previous_price !== null
              ? [
                  {
                    price: Number(item.previous_price) || 0,
                    reason: "Previous",
                    changed_at: item.changed_at || new Date().toISOString(),
                  },
                ]
              : [];
          hist = [...prevPoint, nowPoint];
        }

        // normalize sort (oldest → newest)
        hist.sort(
          (a, b) =>
            new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
        );
        setHistory((s) => ({ ...s, [key]: hist }));
      } finally {
        setHistoryLoading((s) => ({ ...s, [key]: false }));
      }
    }
  };

  return (
    <div className="min-h-screen w-full px-6 py-6 text-gray-800 dark:text-gray-50 bg-gradient-to-br from-white/60 via-white/30 to-transparent dark:from-slate-950 dark:via-slate-950">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search ingredient or supplier")}
            className="pl-9 pr-3 py-2 rounded-xl border border-gray-300/70 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur focus:outline-none focus:ring-2 focus:ring-accent/60 min-w-[260px]"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs opacity-70">{t("Sort by")}:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-300/70 dark:border-white/10 bg-white/70 dark:bg-white/5 focus:outline-none"
          >
            <option value="alpha">{t("Name (A–Z)")}</option>
            <option value="change">{t("Biggest change")}</option>
            <option value="price">{t("Highest price")}</option>
          </select>

          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300/70 dark:border-white/10 bg-white/70 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/10 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="text-sm">{t("Refresh")}</span>
          </button>
        </div>
      </div>

      {/* Grid cards */}
      <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((it, idx) => {
          const key = `${it.name}|${it.unit}|${it.supplier}`;
          const curr = Number(it.price_per_unit) || 0;
          const prev =
            it.previous_price === null || it.previous_price === undefined
              ? null
              : Number(it.previous_price);
          const diff = prev === null ? 0 : curr - prev;
          const pct =
            prev && prev !== 0 ? ((diff / prev) * 100).toFixed(1) : null;
          const deltaStr = prev != null ? (diff > 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`) : null;
          const up = diff > 0;
          const down = diff < 0;
          const neutral = !up && !down;

          const opened = openKey === key;
          const hist = history[key] || [];
          const sparkPoints =
            hist.length > 1 ? hist.map((h) => Number(h.price) || 0) : prev != null ? [prev, curr] : [curr];

          return (
            <div
              key={key}
              className="rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur shadow-sm hover:shadow-md transition overflow-hidden"
            >
              {/* Top row */}
              <div className="p-4 flex items-start gap-3">
                <div className="grow">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold tracking-wide">
                      {titleCase(it.name || "-")}
                    </h3>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 border border-gray-200/60 dark:border-white/10">
                      {it.unit || "-"}
                    </span>
                  </div>

                  <div className="mt-1 text-xs opacity-70 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <Info className="w-3.5 h-3.5" />
                      {t("Supplier")}:
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-50 dark:bg-white/10 border border-gray-200/60 dark:border-white/10">
                      {it.supplier || "-"}
                    </span>
                  </div>
                </div>

                {/* Price side */}
                <div className="text-right">
                  <div className="text-xl font-bold leading-6">
                    {Number.isFinite(curr) ? formatCurrency(curr) : "-"}
                  </div>
                  <div className="text-[12px] opacity-70">
                    {prev != null
                      ? `${t("Prev")}: ${
                          Number.isFinite(prev) ? formatCurrency(prev) : "-"
                        }`
                      : "—"}
                  </div>

                  <div className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium">
                    {up && (
                      <>
                        <ArrowUpRight className="w-4 h-4 text-red-500" />
                        <span className="text-red-500">{deltaStr} ({pct}%)</span>
                      </>
                    )}
                    {down && (
                      <>
                        <ArrowDownRight className="w-4 h-4 text-green-500" />
                        <span className="text-green-500">{deltaStr} ({pct}%)</span>
                      </>
                    )}
                    {neutral && <span className="opacity-60">—</span>}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div className="px-4">
                <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-white/60 dark:bg-white/5 p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 opacity-70" />
                    <span className="text-xs opacity-70">
                      {t("Trend")} {it.changed_at
                        ? `• ${new Date(it.changed_at).toLocaleDateString("tr-TR")}`
                        : ""}
                    </span>
                  </div>
                  <div className={`text-right ${up ? "text-red-500" : down ? "text-green-500" : "opacity-60"}`}>
                    {prev != null ? (up ? `+${pct}%` : `${pct}%`) : "—"}
                  </div>
                </div>
                <div className="mt-2 text-accent">
                  <Spark points={sparkPoints} />
                </div>
              </div>

              {/* History toggle */}
              <button
                onClick={() => toggleHistory(key, it)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-black/[0.03] dark:hover:bg-white/5 transition"
              >
                <span className="inline-flex items-center gap-2 text-sm">
                  <History className="w-4 h-4" />
                  {t("Price history")}
                </span>
                {openKey === key ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {/* History body */}
              <div
                className={`px-4 pb-4 transition-[max-height,opacity] duration-300 ease-out ${
                  opened ? "opacity-100 max-h-[480px]" : "opacity-0 max-h-0 overflow-hidden"
                }`}
              >
                {historyLoading[key] ? (
                  <div className="py-4 text-sm opacity-70">{t("Loading history")}…</div>
                ) : hist.length ? (
                  <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-white/60 dark:bg-white/5 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200/70 dark:border-white/10 text-xs opacity-70">
                        <tr>
                          <th className="text-left px-3 py-2">{t("Date")}</th>
                          <th className="text-left px-3 py-2">{t("Price")}</th>
                          <th className="text-left px-3 py-2">{t("Reason")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hist
                          .slice()
                          .reverse()
                          .map((h, i2) => (
                            <tr
                              key={i2}
                              className="border-t border-gray-100 dark:border-white/10"
                            >
                              <td className="px-3 py-2">
                                {h.changed_at
                                  ? new Date(h.changed_at).toLocaleString("tr-TR", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    })
                                  : "—"}
                              </td>
                              <td className="px-3 py-2">
                                {Number.isFinite(+h.price)
                                  ? formatCurrency(+h.price)
                                  : "-"}
                              </td>
                              <td className="px-3 py-2">{h.reason || "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-4 text-sm opacity-70">
                    {t("No history available")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="mt-16 text-center opacity-70">
          {q
            ? t("No ingredients matched your search.")
            : t("No ingredient prices yet.")}
        </div>
      )}
    </div>
  );
}
