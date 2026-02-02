import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSessionLock } from "../context/SessionLockContext";
import { normalizeUser } from "../utils/normalizeUser";
import { BASE_URL } from "../utils/secureFetch";
import { useTranslation } from "react-i18next";
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const { setCurrentUser } = useAuth();
  const { lock } = useSessionLock();
  const { t, i18n } = useTranslation();

  const supportedLanguages = [
    { label: "EN", code: "en" },
    { label: "TR", code: "tr" },
    { label: "DE", code: "de" },
    { label: "FR", code: "fr" },
  ];

  const resolvedLanguage = supportedLanguages.some((l) => l.code === i18n.language)
    ? i18n.language
    : "en";

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(
          raw?.slice?.(0, 120) ||
            `Login failed (non-JSON response, ${response.status})`
        );
      }

      if (!response.ok || !data?.token) {
        throw new Error(
          data?.error ||
            data?.message ||
            (raw ? raw.slice(0, 120) : "") ||
            t("Invalid credentials")
        );
      }

      const normalizedUser = normalizeUser({
        ...data.user,
        token: data.token,
      });

      if (!normalizedUser) {
        throw new Error(t("Invalid user payload"));
      }

      const authStorage = rememberMe ? window.localStorage : window.sessionStorage;
      const otherStorage = rememberMe ? window.sessionStorage : window.localStorage;
      try {
        otherStorage.removeItem("token");
        otherStorage.removeItem("beyproUser");
      } catch {}

      authStorage.setItem("token", data.token);
      if (normalizedUser.restaurant_id) {
        localStorage.setItem("restaurant_id", normalizedUser.restaurant_id);
      } else {
        localStorage.removeItem("restaurant_id");
      }

      authStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
      setCurrentUser(normalizedUser);
      
      // Lock session immediately for admin users to require password re-entry
      if (normalizedUser.role === "admin" || normalizedUser.role === "Admin") {
        lock("manual");
      }
      
      navigate("/tables");
    } catch (err) {
      console.error("❌ Login failed:", err);
      setError(err.message || t("Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      {/* LEFT SIDE - BRAND (Desktop Only) */}
      <div className="hidden lg:flex w-1/2 bg-slate-950 text-white items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.15),_transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.25),_transparent_60%)]"></div>

        <div className="relative z-10 text-center px-6 py-6">
          <div className="mx-auto w-[19.8rem] sm:w-[25.2rem]">
            <img
              src="/Beylogo.svg"
              alt="Beypro"
              className="w-full h-auto drop-shadow-2xl select-none block mx-auto transform lg:translate-x-3"
              draggable="false"
            />
            <p className="mt-1 text-base font-light leading-snug text-white/90 text-center whitespace-nowrap w-full">
              {t("Level up your business — manage everything in one place.")}
            </p>
          </div>
          <footer className="text-xs tracking-wide uppercase text-white/70">
            © 2026 Beypro
          </footer>
        </div>
      </div>

      {/* RIGHT SIDE - FORM (Mobile & Desktop) */}
      <div className="flex w-full lg:w-1/2 min-h-screen lg:min-h-0 items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-md">
          {/* Mobile Logo Section */}
          <div className="lg:hidden text-center mb-8">
            <div className="flex justify-center mb-4">
              <img
                src="/Beylogo.svg"
                alt="Beypro"
                className="h-16 w-auto select-none"
                draggable="false"
              />
            </div>
            <p className="text-sm text-gray-300">
              {t("Sign in to your Beypro account")}
            </p>
          </div>

          <div className="bg-white/95 rounded-2xl lg:rounded-3xl border border-white/30 shadow-2xl p-6 sm:p-8 backdrop-blur-md">
            {/* Desktop Header */}
            <div className="hidden lg:block text-center mb-8">
              <h2 className="text-3xl font-extrabold text-gray-900">
                {t("Welcome Back")}
              </h2>
              <p className="text-gray-500 mt-1">
                {t("Sign in to your Beypro account")}
              </p>
            </div>

            {/* Mobile Header */}
            <div className="lg:hidden text-center mb-6">
              <h2 className="text-2xl font-extrabold text-gray-900">
                {t("Welcome Back")}
              </h2>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 lg:space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {t("Email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("you@example.com")}
                  className="w-full px-3 lg:p-3 py-2.5 lg:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-sm lg:text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {t("Password")}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 lg:p-3 py-2.5 lg:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-sm lg:text-base"
                  required
                />
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3 lg:gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-semibold">{t("Keep me logged in")}</span>
                </label>

                <div className="flex items-center justify-start sm:justify-end w-full sm:w-auto">
                  <label className="sr-only" htmlFor="login-language">
                    {t("Language")}
                  </label>
                  <select
                    id="login-language"
                    value={resolvedLanguage}
                    onChange={(e) => {
                      const next = e.target.value || "en";
                      i18n.changeLanguage(next);
                      try {
                        localStorage.setItem("beyproLanguage", next);
                        localStorage.setItem("beyproGuestLanguage", next);
                      } catch {}
                    }}
                    className="h-9 rounded-xl px-3 bg-gray-50 text-gray-800 text-xs lg:text-sm font-semibold border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    title={t("Language")}
                  >
                    {supportedLanguages.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-xs lg:text-sm font-medium bg-red-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 lg:px-5 py-2.5 lg:py-3 mt-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold rounded-xl shadow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 text-sm lg:text-base"
              >
                <LogIn size={18} />
                {loading ? t("Logging in...") : t("Login")}
              </button>
            </form>

            {/* Staff Login Button */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate("/staff-login")}
                className="w-full flex items-center justify-center gap-2 px-4 lg:px-5 py-2.5 lg:py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl shadow hover:scale-[1.02] active:scale-[0.98] transition-all text-sm lg:text-base"
              >
                {t("Staff Login")}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 mt-6 lg:mt-10">
              {t("Need help? contact@beypro.com")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
