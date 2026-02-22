import { useEffect } from "react";
import { loadRegisterSummary } from "../../../utils/registerSummaryCache";

export const useRegisterPrefetch = () => {
  useEffect(() => {
    loadRegisterSummary().catch((err) => {
      console.warn("⚠️ Failed to prefetch register summary:", err);
    });
  }, []);
};
