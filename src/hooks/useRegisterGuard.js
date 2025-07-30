import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export function useRegisterGuard() {
  const [registerState, setRegisterState] = useState("loading");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/reports/cash-register-status")
      .then(res => res.json())
      .then(data => {
        setRegisterState(data.status);
        // If on a blocked page AND register is closed, redirect!
        if (
          (location.pathname.startsWith("/tableoverview") ||
           location.pathname.startsWith("/transaction")) &&
          (data.status === "closed" || data.status === "unopened")
        ) {
          navigate("/Dashboard"); // Or "/" or any allowed safe page
        }
      });
    // Re-run on route change
  }, [location.pathname, navigate]);

  return registerState;
}
