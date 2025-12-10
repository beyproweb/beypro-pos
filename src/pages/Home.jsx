import LiveIngredientPricesWidget from "../components/LiveIngredientPricesWidget";

export default function Home() {
  return (
    <div className="min-h-screen w-full px-6 py-6 bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-50">
      {/* KPI placeholder */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl p-4 bg-white dark:bg-white/5 border border-gray-200/70 dark:border-white/10">KPI 1</div>
        <div className="rounded-2xl p-4 bg-white dark:bg white/5 border border-gray-200/70 dark:border-white/10">KPI 2</div>
        <div className="rounded-2xl p-4 bg-white dark:bg white/5 border border-gray-200/70 dark:border-white/10">KPI 3</div>
      </div>

      {/* Live Ingredient Prices below KPI */}
      <div className="rounded-2xl bg-white/80 dark:bg-white/5 border border-gray-200/70 dark:border-white/10 p-4">
        <LiveIngredientPricesWidget maxItems={6} />
      </div>
    </div>
  );
}
