import React from "react";
import TableCard from "./TableCard";

function TablesGrid({ tables, cardProps }) {
  return (
    <div className="w-full flex justify-center px-4 sm:px-8">
      <div
        className="
        grid
        grid-cols-2
        md:grid-cols-3
        xl:grid-cols-4
        2xl:grid-cols-4
        gap-3
        sm:gap-8
        place-items-stretch
        w-full
        max-w-[1600px]
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
