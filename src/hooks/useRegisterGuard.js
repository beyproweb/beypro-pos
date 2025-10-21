import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import secureFetch from "../utils/secureFetch";   // ✅ use the wrapper

export function useRegisterGuard() {
  const [registerState, setRegisterState] = useState("loading");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    secureFetch("/reports/cash-register-status")
      .then((data) => {
        setRegisterState(data.status);
        if (
          (location.pathname.startsWith("/tableoverview") ||
           location.pathname.startsWith("/transaction")) &&
          (data.status === "closed" || data.status === "unopened")
        ) {
          navigate("/Dashboard");
        }
      })
      .catch((err) => {
        console.error("❌ Register guard failed:", err);
        setRegisterState("error");
      });
  }, [location.pathname, navigate]);

  return registerState;
}
