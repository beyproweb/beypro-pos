import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import secureFetch from "../../utils/secureFetch";

export default function StandaloneRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const next = params.get("next") || "/standalone/app";

    if (!token) {
      navigate("/standalone/login", { replace: true });
      return;
    }

    try {
      localStorage.setItem("standaloneToken", token);
      sessionStorage.setItem("standaloneToken", token);
      localStorage.setItem("token", token);
      sessionStorage.setItem("token", token);
    } catch {
      // ignore storage errors
    }

    // optional: prime /me silently
    secureFetch("/standalone/auth/me").catch(() => {});

    navigate(next, { replace: true });
  }, [location.search, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      Redirecting...
    </div>
  );
}
