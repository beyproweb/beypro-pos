import { useEffect, useMemo, useState } from "react";

/**
 * Centralises date range handling for report views.
 * Returns the selected range, computed `from`/`to` dates, and helpers for custom input fields.
 */
export default function useDateRangeState(defaultRange = "today") {
  const [dateRange, setDateRange] = useState(defaultRange);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    if (dateRange !== "today") return;
    const today = new Date().toISOString().slice(0, 10);
    setCustomStart(today);
    setCustomEnd(today);
  }, [dateRange]);

  const { from, to } = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    if (dateRange === "today") {
      return { from: todayStr, to: todayStr };
    }

    if (dateRange === "week") {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return {
        from: start.toISOString().slice(0, 10),
        to: todayStr,
      };
    }

    return {
      from: customStart || todayStr,
      to: customEnd || todayStr,
    };
  }, [dateRange, customStart, customEnd]);

  return {
    dateRange,
    setDateRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    from,
    to,
    isCustom: dateRange === "custom",
  };
}
