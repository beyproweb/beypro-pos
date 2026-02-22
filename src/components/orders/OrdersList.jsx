import React from "react";

export default function OrdersList({ orders = [], renderOrder }) {
  const gridCols =
    orders.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-1";

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 pt-2 pb-6 w-full mx-auto relative bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div
        className={`
          grid
          gap-6
          w-full
          pt-2 pb-6
          ${gridCols}
          sm:grid-cols-1
          md:grid-cols-1
          lg:grid-cols-1
        `}
      >
        {orders.map(renderOrder)}
      </div>
    </div>
  );
}
