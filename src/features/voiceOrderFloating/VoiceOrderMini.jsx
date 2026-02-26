import React, { memo } from "react";
import { WaiterHeadIcon } from "./waiterIcons";

function VoiceOrderMiniComponent({ onOpen, label = "AI Order" }) {
  const cleanLabel = String(label || "").trim();
  const hasLabel = cleanLabel.length > 0;
  const labelWords = hasLabel ? cleanLabel.split(/\s+/) : [];
  const topLabel = labelWords[0] || "";
  const bottomLabel = labelWords.slice(1).join(" ");

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        title={label}
        className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-sky-500 bg-sky-600 shadow-[0_12px_30px_rgba(2,132,199,0.45)] ring-2 ring-white/80 backdrop-blur transition duration-200 hover:scale-105 hover:bg-sky-500 hover:shadow-[0_16px_34px_rgba(2,132,199,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 animate-[bounce_0.65s_ease-out_1] dark:border-sky-400 dark:bg-sky-500 dark:ring-neutral-900/70"
      >
        <WaiterHeadIcon className="h-9 w-9 rounded-full ring-1 ring-white/55" />
      </button>
      {hasLabel ? (
        <div className="pointer-events-none select-none text-center text-[10px] font-semibold leading-[1.05] text-sky-900 dark:text-sky-200">
          <span className="block">{topLabel}</span>
          {bottomLabel ? <span className="block">{bottomLabel}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const VoiceOrderMini = memo(VoiceOrderMiniComponent);

export default VoiceOrderMini;
