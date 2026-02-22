import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useDrinks from "../hooks/useDrinks";

export default function DrinkSettingsModal({
  open,
  onClose,
  fetchDrinks,
  summaryByDriver = [],
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState("manage");
  const { drinks, loading, saving, error, refresh, addDrink, removeDrink } = useDrinks();

  useEffect(() => {
    if (open) setActiveTab("summary");
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      try {
        await refresh({
          errorMessage: t("Failed to load drinks"),
          logError: (err) => console.error("❌ Failed to fetch drinks in modal:", err),
        });
      } catch {
        // no-op: hook state already set
      }
    };

    load();
  }, [open]);

  const onAddDrink = async () => {
    const name = input.trim();
    if (!name || drinks.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
      setInput("");
      return;
    }

    try {
      await addDrink(name, {
        errorMessage: t("Failed to add drink."),
        onAfterWrite: () => setInput(""),
      });
      if (fetchDrinks) fetchDrinks();
    } catch {
      // no-op: hook state already set
    }
  };

  const onRemoveDrink = async (id) => {
    try {
      await removeDrink(id, { errorMessage: t("Failed to delete drink.") });
      if (fetchDrinks) fetchDrinks();
    } catch {
      // no-op: hook state already set
    }
  };

  if (!open) return null;
  const tabs = [
    { key: "summary", label: t("Drinks") },
    { key: "manage", label: t("Manage Drinks") },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-[0_30px_60px_-35px_rgba(15,23,42,0.18)] border border-slate-200 p-7 max-w-4xl w-full text-slate-900 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800 dark:shadow-[0_30px_60px_-35px_rgba(0,0,0,0.6)]">
        <h2 className="font-semibold text-xl sm:text-2xl mb-4 tracking-tight text-slate-900 dark:text-slate-100">
          ⚙️ {t("Settings")}
        </h2>

        <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-2xl p-1 mb-4 dark:bg-slate-900/60 dark:border-slate-700">
          {tabs.map(({ key, label }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                disabled={isActive}
                className={`px-4 py-2 rounded-2xl text-sm sm:text-base font-semibold transition ${
                  isActive
                    ? "bg-white text-slate-900 shadow border border-slate-200 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-700"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === "manage" ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
              <input
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={input}
                placeholder={t("Drink name (e.g. Cola)")}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddDrink()}
                disabled={saving}
              />
              <button
                className="bg-slate-900 text-white px-4 py-2 rounded-xl hover:bg-slate-800 transition dark:bg-indigo-600 dark:hover:bg-indigo-500"
                onClick={onAddDrink}
                disabled={saving || !input.trim()}
              >
                {t("Add")}
              </button>
            </div>

            {loading ? (
              <div className="text-slate-500 mb-2">{t("Loading drinks...")}</div>
            ) : (
              <div className="mb-4 flex flex-wrap gap-2 max-h-[38vh] overflow-y-auto pr-1">
                {drinks.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded-xl border border-slate-200 dark:bg-slate-900/60 dark:text-slate-100 dark:border-slate-700"
                  >
                    {d.name}
                    <button
                      className="text-rose-500 ml-1 hover:text-rose-600 transition"
                      onClick={() => onRemoveDrink(d.id)}
                      disabled={saving}
                      title={t("Delete")}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {drinks.length === 0 && !loading && (
                  <span className="text-slate-400 italic">
                    {t("No drinks defined yet.")}
                  </span>
                )}
              </div>
            )}
            {error && <div className="text-rose-500 mb-2">{error}</div>}
          </>
        ) : (
          <div className="flex flex-col gap-4 max-h-[48vh] overflow-y-auto pr-1">
            {summaryByDriver.length === 0 ? (
              <div className="text-slate-500 text-sm">
                {t("No drink activity yet. Drinks linked to orders will appear here grouped by driver.")}
              </div>
            ) : (
              summaryByDriver.map((driver) => (
                <div
                  key={driver.driverId}
                  className="border border-slate-200 rounded-3xl p-4 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      🛵 {driver.driverName}
                    </span>
                    <div className="flex flex-wrap gap-2 ml-auto">
                      {driver.totals.map((total) => (
                        <span
                          key={total.key}
                          className="inline-flex items-center px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 text-sm font-semibold"
                        >
                          {total.qty}× {total.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {driver.customers.map((customer) => (
                      <div
                        key={customer.key}
                        className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3 shadow-sm"
                      >
                        <div className="font-semibold text-slate-800">
                          {customer.name}
                        </div>
                        {customer.address && (
                          <div className="text-xs text-slate-500 mt-1 leading-snug">
                            {customer.address}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {customer.drinks.map((drink) => (
                            <span
                              key={`${customer.key}-${drink.key}`}
                              className="inline-flex items-center px-3 py-1 rounded-xl bg-white text-emerald-700 border border-emerald-200 text-sm font-semibold shadow-sm"
                            >
                              {drink.qty}× {drink.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            className="px-4 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
            onClick={onClose}
            disabled={saving}
          >
            {t("Cancel")}
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={() => {
              if (fetchDrinks) fetchDrinks();
              onClose();
            }}
            disabled={saving}
          >
            {t("Done")}
          </button>
        </div>
      </div>
    </div>
  );
}
