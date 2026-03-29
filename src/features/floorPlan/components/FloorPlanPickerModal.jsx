import React from "react";
import { X } from "lucide-react";
import FloorPlanView from "./FloorPlanView";
import TableDetailsSheet from "./TableDetailsSheet";
import { buildFloorPlanElements } from "../utils/floorPlan";

export default function FloorPlanPickerModal({
  open = false,
  title = "Select Table",
  subtitle = "",
  layout,
  tables = [],
  tableStates = [],
  selectedTableNumber = null,
  accentColor = "#111827",
  onClose,
  onConfirm,
}) {
  const elements = React.useMemo(
    () => buildFloorPlanElements(layout, tables, tableStates),
    [layout, tableStates, tables]
  );
  const [activeTable, setActiveTable] = React.useState(null);

  React.useEffect(() => {
    if (!open) {
      setActiveTable(null);
    }
  }, [open]);

  if (!open) return null;

  const activeStatus = String(activeTable?.status || "").toLowerCase();
  const canConfirm = activeStatus === "available" || activeStatus === "selected";
  const highlightedTableNumber =
    activeTable?.table_number != null ? activeTable.table_number : selectedTableNumber;

  return (
    <div className="fixed inset-0 z-[90] bg-black/55 backdrop-blur-sm">
      <div className="flex h-full flex-col bg-[linear-gradient(180deg,_#fafaf9_0%,_#f5f5f4_100%)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)]">
        <div className="sticky top-0 z-10 border-b border-black/5 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-neutral-950 dark:text-white">{title}</div>
              {subtitle ? (
                <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</div>
              ) : null}
            </div>
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col overflow-hidden px-4 py-4">
          <div className="flex-1 overflow-y-auto pb-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                ["available", "Available"],
                ["reserved", "Reserved"],
                ["occupied", "Occupied"],
                ["blocked", "Blocked"],
              ].map(([key, label]) => {
                const tone =
                  key === "available"
                    ? "bg-teal-700 text-white"
                    : key === "reserved"
                        ? "bg-amber-400 text-neutral-950"
                        : key === "occupied"
                          ? "bg-rose-500 text-white"
                          : "bg-neutral-300 text-neutral-800";
                return (
                  <div key={key} className={`rounded-2xl px-3 py-2 text-center text-xs font-semibold ${tone}`}>
                    {label}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <FloorPlanView
                layout={layout}
                elements={elements}
                selectedTableNumber={highlightedTableNumber}
                onTableClick={(node) => setActiveTable(node)}
              />
            </div>
          </div>
          <TableDetailsSheet
            embedded
            tableNode={activeTable}
            onClose={() => setActiveTable(null)}
            onConfirm={(node) => {
              onConfirm?.(node);
              setActiveTable(null);
            }}
            confirmDisabled={!canConfirm}
            confirmLabel={canConfirm ? "Confirm table" : activeTable?.state?.reason || "Unavailable"}
          />
        </div>
      </div>
    </div>
  );
}
