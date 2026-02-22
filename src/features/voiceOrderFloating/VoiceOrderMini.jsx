import React, { memo } from "react";
import { WaiterHeadIcon } from "./waiterIcons";

function VoiceOrderMiniComponent({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Show voice order button"
      className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.15)] backdrop-blur transition duration-200 hover:scale-105 hover:shadow-[0_14px_30px_rgba(15,23,42,0.19)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 animate-[bounce_0.65s_ease-out_1] dark:border-neutral-700 dark:bg-neutral-900/95"
    >
      <WaiterHeadIcon className="h-9 w-9 rounded-full" />
    </button>
  );
}

const VoiceOrderMini = memo(VoiceOrderMiniComponent);

export default VoiceOrderMini;
