import { useEffect, useMemo, useState } from "react";

const toLocalYmd = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

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
    const today = toLocalYmd(new Date());
    setCustomStart(today);
    setCustomEnd(today);
  }, [dateRange]);

  const { from, to } = useMemo(() => {
    const today = new Date();
    const todayStr = toLocalYmd(today);

    if (dateRange === "today") {
      return { from: todayStr, to: todayStr };
    }

    if (dateRange === "week") {
      const start = new Date();
      start.setDate(start.getDate() - 6);
      return {
        from: toLocalYmd(start),
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
