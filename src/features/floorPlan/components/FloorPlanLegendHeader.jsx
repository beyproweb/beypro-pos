import React from "react";
import { useTranslation } from "react-i18next";
import {
  buildFloorPlanZoneGroups,
  FLOOR_PLAN_STATUS_STYLES,
  formatFloorPlanZoneLabel,
} from "../utils/floorPlan";

const STATUS_KEYS = ["available", "reserved", "occupied", "blocked"];

function LegendChip({ dotColor, label, value = "", style = {} }) {
  return (
    <div
      className="inline-flex min-h-[36px] items-center gap-2 rounded-[14px] border px-3 py-2 text-[11px] font-semibold sm:min-h-[40px] sm:text-xs"
      style={style}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
      <span className="leading-tight">{label}</span>
      {value ? <span className="opacity-70">{value}</span> : null}
    </div>
  );
}

export default function FloorPlanLegendHeader({
  elements = [],
  showStatuses = true,
  showZones = true,
}) {
  const { t } = useTranslation();
  const zoneGroups = React.useMemo(
    () => buildFloorPlanZoneGroups({ elements }),
    [elements]
  );
  const zones = React.useMemo(
    () => zoneGroups.flatMap((group) => group.zones || []),
    [zoneGroups]
  );

  if (!showStatuses && !showZones) return null;

  return (
    <div className="space-y-2">
      {showStatuses ? (
        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
            {STATUS_KEYS.map((key) => {
              const tone = FLOOR_PLAN_STATUS_STYLES[key] || FLOOR_PLAN_STATUS_STYLES.available;
              return (
                <LegendChip
                  key={key}
                  dotColor={tone.border}
                  label={t(tone.badge)}
                  style={{
                    backgroundColor: tone.fill,
                    borderColor: tone.border,
                    color: tone.text,
                  }}
                />
              );
            })}
          </div>
        </div>
      ) : null}
      {showZones && zones.length ? (
        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 sm:min-w-0 sm:flex-wrap">
            {zones.map((zone) => (
              <LegendChip
                key={zone.key}
                dotColor={zone.swatch.border}
                label={t(formatFloorPlanZoneLabel(zone.label))}
                value={String(zone.count || "")}
                style={{
                  backgroundColor: zone.swatch.fill,
                  borderColor: zone.swatch.border,
                  color: zone.swatch.text,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}