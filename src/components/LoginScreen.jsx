import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { normalizeUser } from "../utils/normalizeUser";
import { BASE_URL } from "../utils/secureFetch";
import { useTranslation } from "react-i18next";
import { requestDriverLocationPermission } from "../utils/driverLocationPermission";
import { DEFAULT_LANGUAGE, persistLanguage } from "../utils/language";

const REMEMBER_ME_PREFERENCE_KEY = "beyproRememberMe";
const GOOGLE_OAUTH_QUERY_KEYS = [
  "google_oauth",
  "transfer_token",
  "google_oauth_error",
];

function getInitialRememberMe() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(REMEMBER_ME_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(getInitialRememberMe);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const passwordInputRef = useRef(null);
  const rememberMeRef = useRef(getInitialRememberMe());
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
    : DEFAULT_LANGUAGE;

  const normalizeLoginError = (message) => {
    const normalized = String(message || "").trim();
    if (!normalized) return t("Login failed");
    if (normalized === "Invalid password") return t("Invalid credentials");
    return normalized;
  };

  const parseLoginPayload = async (response) => {
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(
        raw?.slice?.(0, 120) || `Login failed (non-JSON response, ${response.status})`
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

    return data;
  };

  const persistAuthSession = (payload) => {
    const normalizedUser = normalizeUser({
      ...payload.user,
      token: payload.token,
    });

    if (!normalizedUser) {
      throw new Error(t("Invalid user payload"));
    }

    const shouldRemember = rememberMeRef.current;
    const authStorage = shouldRemember ? window.localStorage : window.sessionStorage;
    const otherStorage = shouldRemember ? window.sessionStorage : window.localStorage;
    try {
      otherStorage.removeItem("token");
      otherStorage.removeItem("beyproUser");
    } catch {
      // ignore storage errors
    }

    try {
      window.localStorage.setItem(
        REMEMBER_ME_PREFERENCE_KEY,
        shouldRemember ? "true" : "false"
      );
    } catch {
      // ignore storage errors
    }

    authStorage.setItem("token", payload.token);
    try {
      localStorage.removeItem("__beypro_skip_me_probe");
    } catch {
      // ignore storage errors
    }
    if (normalizedUser.restaurant_id) {
      localStorage.setItem("restaurant_id", normalizedUser.restaurant_id);
    } else {
      localStorage.removeItem("restaurant_id");
    }

    authStorage.setItem("beyproUser", JSON.stringify(normalizedUser));
    setCurrentUser(normalizedUser);
    requestDriverLocationPermission(normalizedUser);
    navigate("/tableoverview?tab=tables", { replace: true });
  };

  const mapGoogleOAuthError = (code) => {
    const normalized = String(code || "").trim().toLowerCase();
    switch (normalized) {
      case "google_not_configured":
        return t("Google login is not configured.");
      case "invalid_oauth_state":
        return t("Google login session expired. Please try again.");
      case "missing_oauth_code":
        return t("Google login response was incomplete. Please try again.");
      case "user_not_linked":
        return t("This Google account is not linked to a POS user.");
      case "oauth_start_failed":
      case "oauth_callback_failed":
        return t("Google login failed. Please try again.");
      default:
        return t("Google login failed.");
    }
  };

  const buildGoogleReturnToUrl = () => {
    const url = new URL(window.location.href);
    GOOGLE_OAUTH_QUERY_KEYS.forEach((key) => {
      url.searchParams.delete(key);
    });
    return url.toString();
  };

  const clearGoogleOAuthQueryParamsFromLocation = () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    let changed = false;
    GOOGLE_OAUTH_QUERY_KEYS.forEach((key) => {
      if (url.searchParams.has(key)) {
        changed = true;
        url.searchParams.delete(key);
      }
    });
    if (!changed) return;
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  };

  const handleGoogleOAuthStart = () => {
    if (typeof window === "undefined") return;
    setError("");
    setGoogleSubmitting(true);
    const returnTo = buildGoogleReturnToUrl();
    const startUrl = `${BASE_URL}/auth/google?return_to=${encodeURIComponent(returnTo)}`;
    window.location.assign(startUrl);
  };

  useEffect(() => {
    if (rememberMe) return undefined;

    const clearPasswordField = () => {
      setPassword("");
      if (passwordInputRef.current) {
        passwordInputRef.current.value = "";
      }
    };

    clearPasswordField();
    const timer = window.setTimeout(clearPasswordField, 50);
    return () => window.clearTimeout(timer);
  }, [rememberMe]);

  useEffect(() => {
    rememberMeRef.current = rememberMe;
  }, [rememberMe]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const url = new URL(window.location.href);
    const transferToken = String(url.searchParams.get("transfer_token") || "").trim();
    const oauthError = String(url.searchParams.get("google_oauth_error") || "").trim();

    if (!transferToken && !oauthError) {
      return undefined;
    }

    clearGoogleOAuthQueryParamsFromLocation();

    if (oauthError) {
      setError(mapGoogleOAuthError(oauthError));
      setGoogleSubmitting(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setError("");
      setGoogleSubmitting(true);
      try {
        const response = await fetch(`${BASE_URL}/auth/google/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transfer_token: transferToken,
          }),
        });
        const payload = await parseLoginPayload(response);
        if (!cancelled) {
          persistAuthSession(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(normalizeLoginError(err?.message || t("Google login failed")));
        }
      } finally {
        if (!cancelled) {
          setGoogleSubmitting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

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
      const payload = await parseLoginPayload(response);
      persistAuthSession(payload);
    } catch (err) {
      console.error("❌ Login failed:", err);
      setError(normalizeLoginError(err?.message));
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

            <form
              onSubmit={handleLogin}
              autoComplete={rememberMe ? "on" : "off"}
              className="space-y-4 lg:space-y-5"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {t("Email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
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
                  ref={passwordInputRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={rememberMe ? "current-password" : "new-password"}
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
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRememberMe(checked);
                      try {
                        window.localStorage.setItem(
                          REMEMBER_ME_PREFERENCE_KEY,
                          checked ? "true" : "false"
                        );
                      } catch {
                        // ignore storage errors
                      }
                    }}
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
                      const next = e.target.value || DEFAULT_LANGUAGE;
                      i18n.changeLanguage(next);
                      persistLanguage(next, window.localStorage);
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
                disabled={loading || googleSubmitting}
                className="w-full flex items-center justify-center gap-2 px-4 lg:px-5 py-2.5 lg:py-3 mt-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-semibold rounded-xl shadow hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 text-sm lg:text-base"
              >
                <LogIn size={18} />
                {loading || googleSubmitting ? t("Logging in...") : t("Login")}
              </button>

              <div className="pt-2">
                <div className="my-2 flex items-center gap-3 text-xs text-gray-400">
                  <span className="h-px flex-1 bg-gray-200" />
                  <span>{t("or")}</span>
                  <span className="h-px flex-1 bg-gray-200" />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleOAuthStart}
                  disabled={loading || googleSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 lg:px-5 py-2.5 lg:py-3 bg-white text-gray-800 font-semibold rounded-xl border border-gray-300 shadow hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60 text-sm lg:text-base"
                >
                  {googleSubmitting ? t("Redirecting...") : t("Continue with Google")}
                </button>
              </div>
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
