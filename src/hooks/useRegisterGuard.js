import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import secureFetch from "../utils/secureFetch";   // ✅ use the wrapper

const needsRegisterAttention = (status) => status === "closed" || status === "unopened";

export function useRegisterGuard(options = {}) {
  const [registerState, setRegisterState] = useState("loading");
  const location = useLocation();
  const navigate = useNavigate();
  const redirect = options.redirect !== false;

  useEffect(() => {
    let isActive = true;

    secureFetch("/reports/cash-register-status")
      .then((data) => {
        if (!isActive) return;

        const status = data?.status;
        setRegisterState(status);

        // If the register is closed/unopened, keep users out of Transaction and bring them back
        // to TableOverview; the register modal is rendered there and can be opened even if the
        // "register" tab isn't visible for their role (important for new accounts/roles).
        if (!needsRegisterAttention(status)) return;
        if (!redirect) return;

        const isTransaction = location.pathname.startsWith("/transaction");
        if (!isTransaction) return;

        navigate("/tableoverview?tab=tables", {
          replace: true,
          state: { openRegisterModal: true },
        });
      })
      .catch((err) => {
        console.error("❌ Register guard failed:", err);
        if (!isActive) return;
        setRegisterState("error");
      });

    return () => {
      isActive = false;
    };
  }, [location.pathname, navigate]);

  return registerState;
}
