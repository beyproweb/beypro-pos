import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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

      const data = await response.json();
      if (!response.ok || !data?.token) {
        throw new Error(data?.error || data?.message || t("Invalid credentials"));
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
      navigate("/tables");
    } catch (err) {
      console.error("❌ Login failed:", err);
      setError(err.message || t("Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-gray-50">
      {/* LEFT SIDE - BRAND */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-500 text-white items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(255,255,255,0.1),_transparent_70%)]"></div>

        <div className="relative z-10 text-center px-10">
          <h1 className="text-6xl font-extrabold tracking-tight mb-4 drop-shadow-md">
            Beypro
          </h1>
          <p className="text-lg font-light opacity-90">
            {t("Level up your business — manage everything in one place.")}
          </p>
          <footer className="mt-16 text-sm opacity-80">
            © {new Date().getFullYear()} Beypro
          </footer>
        </div>
      </div>

      {/* RIGHT SIDE - FORM */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900">
              {t("Welcome Back")}
            </h2>
            <p className="text-gray-500 mt-1">
              {t("Sign in to your Beypro account")}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {t("Email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("you@example.com")}
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
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
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-semibold">{t("Keep me logged in")}</span>
              </label>

              <div className="flex items-center justify-end">
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
                  className="h-9 rounded-xl px-3 bg-gray-50 text-gray-800 text-sm font-semibold border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
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
              <p className="text-red-500 text-sm font-medium bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 mt-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold rounded-xl shadow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <LogIn size={18} />
              {loading ? t("Logging in...") : t("Login")}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-10">
            {t("Need help? contact@beypro.com")}
          </p>
        </div>
      </div>
    </div>
  );
}
