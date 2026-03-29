import React from "react";
import TableCard from "./TableCard";

function TablesGrid({ tables, cardProps }) {
  return (
    <div className="flex w-full justify-center px-4 sm:px-8">
      <div
        className="
        grid
        grid-cols-1
        sm:grid-cols-2
        xl:grid-cols-4
        2xl:grid-cols-4
        gap-4
        sm:gap-8
        place-items-stretch
        w-full
        max-w-[1800px]
      "
      >
        {(Array.isArray(tables) ? tables : []).map((table) => (
          <TableCard key={table.tableNumber} table={table} {...cardProps} />
        ))}
      </div>
    </div>
  );
}

export default React.memo(TablesGrid);
