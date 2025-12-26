import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import secureFetch from "../utils/secureFetch";   // ✅ use the wrapper

const needsRegisterAttention = (status) => status === "closed" || status === "unopened";

export function useRegisterGuard() {
  const [registerState, setRegisterState] = useState("loading");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    secureFetch("/reports/cash-register-status")
      .then((data) => {
        if (!isActive) return;

        const status = data?.status;
        setRegisterState(status);

        // If the cash register is closed/unopened, redirect users to the Register tab
        // so the "Open Register" modal can be shown (especially for new accounts).
        if (!needsRegisterAttention(status)) return;

        const isTableOverview = location.pathname.startsWith("/tableoverview");
        const isTransaction = location.pathname.startsWith("/transaction");
        if (!isTableOverview && !isTransaction) return;

        const params = new URLSearchParams(location.search || "");
        const currentTab = String(params.get("tab") || "").toLowerCase();
        if (isTableOverview && currentTab === "register") return;

        params.set("tab", "register");
        const target = `/tableoverview?${params.toString()}`;

        const currentUrl = `${location.pathname}${location.search || ""}`;
        if (currentUrl === target) return;

        navigate(target, { replace: true });
      })
      .catch((err) => {
        console.error("❌ Register guard failed:", err);
        if (!isActive) return;
        setRegisterState("error");
      });

    return () => {
      isActive = false;
    };
  }, [location.pathname, location.search, navigate]);

  return registerState;
}
