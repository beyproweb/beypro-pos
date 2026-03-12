import React from "react";
import { ChevronRight } from "lucide-react";

function DrawerItem({ icon: Icon, label, description, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        danger
          ? "border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100"
          : "border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-gray-50 dark:hover:bg-neutral-900 text-gray-800 dark:text-neutral-100"
      }`}
    >
      <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
        {Icon ? <Icon className="w-4 h-4" /> : null}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate">{label}</span>
        {description ? (
          <span className="block text-xs text-gray-500 dark:text-neutral-400 truncate">{description}</span>
        ) : null}
      </span>
      <ChevronRight className="w-4 h-4 text-gray-400 dark:text-neutral-500" />
    </button>
  );
}

export default React.memo(DrawerItem);
