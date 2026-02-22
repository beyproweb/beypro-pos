import React from "react";
import { useTableTimers } from "./hooks/useTableTimers";
import TableCard from "./TableCard";
import VirtualTablesGrid from "./VirtualTablesGrid";
import {
  RenderCounter,
  createProfilerOnRender,
  isTablePerfDebugEnabled,
  logMemoDiff,
  useRenderCount,
  withPerfTimer,
} from "./dev/perfDebug";

function TablesView({
  showAreaTabs,
  activeArea,
  setActiveArea,
  groupedTables,
  tables,
  ordersByTable,
  productPrepById,
  formatAreaLabel,
  cardProps,
  t,
}) {
  const renderCount = useRenderCount("TableList", { logEvery: 1 });
  const onTableListProfileRender = React.useMemo(() => createProfilerOnRender("TableList"), []);
  const showRenderCounter = isTablePerfDebugEnabled();
  const tableTimers = useTableTimers({ ordersByTable, productPrepById });

  const visibleTables = React.useMemo(
    () =>
      withPerfTimer("[perf] TableList visible tables", () =>
        showAreaTabs ? (activeArea === "ALL" ? tables : groupedTables[activeArea] || []) : tables
      ),
    [showAreaTabs, activeArea, tables, groupedTables]
  );

  const mergedCardProps = React.useMemo(
    () => ({
      ...cardProps,
      getTablePrepMeta: tableTimers.getTablePrepMeta,
    }),
    [cardProps, tableTimers.getTablePrepMeta]
  );

  const handleAreaSelect = React.useCallback(
    (area) => {
      setActiveArea(area);
    },
    [setActiveArea]
  );

  const renderTable = React.useCallback(
    (table) => <TableCard table={table} {...mergedCardProps} />,
    [mergedCardProps]
  );

  const getTableKey = React.useCallback((table) => table.tableNumber, []);

  return (
    <React.Profiler id="TableList" onRender={onTableListProfileRender}>
      <div className="w-full flex flex-col items-center">
        {showRenderCounter && (
          <div className="mb-2 flex w-full justify-end px-4 sm:px-8">
            <RenderCounter label="TableList" value={renderCount} />
          </div>
        )}
      {showAreaTabs && (
        <div className="flex justify-center gap-3 flex-wrap mt-4 mb-10">
          <button
            onClick={() => handleAreaSelect("ALL")}
            className={`
	          px-5 py-2 rounded-full font-semibold shadow 
	          transition-all duration-150 text-xs
	          ${
              activeArea === "ALL"
                ? "bg-indigo-600 text-white scale-[1.03] shadow-lg"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-100"
            }
	        `}
          >
            {t("All Areas")}
          </button>

          {Object.keys(groupedTables).map((area) => (
            <button
              key={area}
              onClick={() => handleAreaSelect(area)}
              className={`
	            px-5 py-2 rounded-full font-semibold shadow 
	            transition-all duration-150 text-xs
	            ${
                  activeArea === area
                    ? "bg-blue-600 text-white scale-[1.03] shadow-lg"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-blue-50"
                }
	          `}
            >
              {area === "Hall"
                ? ""
                : area === "Main Hall"
                ? ""
                : area === "Terrace"
                ? ""
                : area === "Garden"
                ? ""
                : area === "VIP"
                ? ""
                : ""}{" "}
              {formatAreaLabel(area)}
            </button>
          ))}
        </div>
      )}

      <VirtualTablesGrid
        items={visibleTables}
        renderItem={renderTable}
        itemKey={getTableKey}
        estimatedItemHeight={300}
        overscan={6}
        className="w-full flex justify-center px-4 sm:px-8"
      />
      </div>
    </React.Profiler>
  );
}

const areTablesViewPropsEqual = (prevProps, nextProps) => {
  const isEqual =
    prevProps.showAreaTabs === nextProps.showAreaTabs &&
    prevProps.activeArea === nextProps.activeArea &&
    prevProps.setActiveArea === nextProps.setActiveArea &&
    prevProps.groupedTables === nextProps.groupedTables &&
    prevProps.tables === nextProps.tables &&
    prevProps.ordersByTable === nextProps.ordersByTable &&
    prevProps.productPrepById === nextProps.productPrepById &&
    prevProps.formatAreaLabel === nextProps.formatAreaLabel &&
    prevProps.cardProps === nextProps.cardProps &&
    prevProps.t === nextProps.t;

  if (!isEqual) {
    logMemoDiff({
      component: "TableList",
      prevProps,
      nextProps,
      watchedProps: [
        "showAreaTabs",
        "activeArea",
        "setActiveArea",
        "groupedTables",
        "tables",
        "ordersByTable",
        "productPrepById",
        "formatAreaLabel",
        "cardProps",
        "t",
      ],
    });
  }

  return isEqual;
};

export default React.memo(TablesView, areTablesViewPropsEqual);
