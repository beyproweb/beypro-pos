import React from "react";

export default function BookingSummaryCard({ items = [], accentColor = "#111827" }) {
  const visibleItems = (Array.isArray(items) ? items : []).filter((item) => item?.value);
  if (!visibleItems.length) return null;

  return (
    <div className="rounded-[28px] border border-neutral-200 bg-white/90 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">Booking Summary</div>
      </div>
      <div className="mt-4 space-y-3">
        {visibleItems.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-3">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">{item.label}</div>
            <div className="text-right text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
