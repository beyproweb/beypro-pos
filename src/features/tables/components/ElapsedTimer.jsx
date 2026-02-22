import React, { useEffect, useMemo, useState } from "react";
import { parseLooseDateToMs } from "../tableVisuals";

function ElapsedTimer({ startTime }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const formatted = useMemo(() => {
    const parsedStart = parseLooseDateToMs(startTime);
    if (!Number.isFinite(parsedStart)) return "00:00";

    const diffMs = Math.max(0, nowMs - parsedStart);
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
        seconds
      ).padStart(2, "0")}`;
    }

    const mm = Math.floor(totalSeconds / 60);
    return `${String(mm).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [nowMs, startTime]);

  return formatted;
}

export default React.memo(ElapsedTimer);
