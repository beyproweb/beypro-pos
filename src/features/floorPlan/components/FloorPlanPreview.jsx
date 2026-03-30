import React from "react";
import { useTranslation } from "react-i18next";
import FloorPlanLegendHeader from "./FloorPlanLegendHeader";
import FloorPlanView from "./FloorPlanView";
import { buildFloorPlanElements } from "../utils/floorPlan";

export default function FloorPlanPreview({
  layout,
  tables = [],
  tableStates = [],
  selectedTableNumber = null,
}) {
  const { t } = useTranslation();
  const elements = React.useMemo(
    () => buildFloorPlanElements(layout, tables, tableStates),
    [layout, tableStates, tables]
  );

  return (
    <div className="space-y-3 rounded-[28px] border border-neutral-200 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-950/80">
      <div>
        <div className="text-sm font-semibold text-neutral-950 dark:text-white">{t("Mobile Preview")}</div>
        <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {t("This is how guests will see the saved floor plan.")}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[430px] rounded-[34px] border border-neutral-200 bg-[linear-gradient(180deg,#fafaf9_0%,#f4f4f5_100%)] p-3 shadow-sm dark:border-neutral-800 dark:bg-[linear-gradient(180deg,#09090b_0%,#111827_100%)]">
        <div className="mb-3 flex justify-center">
          <div className="h-1.5 w-20 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        </div>
        <div className="mb-3">
          <FloorPlanLegendHeader elements={elements} showStatuses showZones />
        </div>
        <div className="overflow-hidden rounded-[26px] border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <FloorPlanView
            layout={layout}
            elements={elements}
            selectedTableNumber={selectedTableNumber}
            interactive={false}
            showCanvasOutline={false}
            compactPadding
            viewportPadding={18}
          />
        </div>
      </div>
    </div>
  );
}
