import React from "react";
import { QrCode } from "lucide-react";

const BEYALL_PRIMARY = "#5B2EFF";
const BEYALL_SECONDARY = "#7C3AED";

function LoginPage({
  t,
  onLogin,
  onGoogleLogin,
  onAppleLogin,
  onQrLogin,
  onGoRegister,
  onBack,
}) {
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [socialLoading, setSocialLoading] = React.useState("");
  const [error, setError] = React.useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!showPassword) {
      setShowPassword(true);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onLogin?.({ login, password });
    } catch (err) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const runSocialLogin = async (provider) => {
    setError("");
    setSocialLoading(provider);
    try {
      if (provider === "google") {
        await onGoogleLogin?.();
      } else {
        await onAppleLogin?.();
      }
    } catch (err) {
      setError(err?.message || "Social login failed");
      setSocialLoading("");
    }
  };

  const handleQrLogin = () => {
    setError("");
    if (typeof onQrLogin === "function") {
      onQrLogin();
      return;
    }
    setError("QR login is not available yet.");
  };

  return (
    <div className="relative h-full overflow-y-auto bg-white">
      <div
        className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${BEYALL_PRIMARY}22 0%, ${BEYALL_SECONDARY}00 72%)`,
        }}
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-24 h-64 w-64 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${BEYALL_SECONDARY}20 0%, ${BEYALL_PRIMARY}00 72%)`,
        }}
      />

      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900">{t("Login / Register")}</h3>
      </div>

      <div className="mx-auto flex min-h-[calc(100%-56px)] w-full max-w-[420px] items-center px-5 py-7">
        <form
          className="w-full rounded-[24px] border border-[#ECECF4] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
          onSubmit={submit}
        >
          <div className="mx-auto mb-5 flex h-9 w-32 items-center justify-center overflow-hidden">
            <img
              src="/beyall-logo.png"
              alt="Beyall"
              className="h-9 w-auto scale-[3.2] origin-center"
              loading="lazy"
            />
          </div>

          

          <div className="mt-5 space-y-3">
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={t("Enter phone number or email")}
              className="h-[52px] w-full rounded-[14px] border border-gray-300 bg-white px-4 text-[16px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#5B2EFF] focus:ring-2 focus:ring-[#5B2EFF]/20"
              autoComplete="username"
            />

            {showPassword ? (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("Enter password")}
                className="h-[52px] w-full rounded-[14px] border border-gray-300 bg-white px-4 text-[16px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#5B2EFF] focus:ring-2 focus:ring-[#5B2EFF]/20"
                autoComplete="current-password"
              />
            ) : null}
          </div>

          {error ? <p className="mt-3 text-xs font-medium text-rose-600">{t(error)}</p> : null}

          <div className="mt-4 space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="h-[44px] w-full rounded-[14px] bg-black text-[17px] font-semibold text-white transition-transform duration-150 hover:bg-neutral-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: BEYALL_PRIMARY,
              }}
            >
              {loading ? "..." : t("Continue")}
            </button>

            <div className="my-3 flex items-center gap-3 text-sm text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>{t("or")}</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => runSocialLogin("google")}
                disabled={Boolean(socialLoading)}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-gray-200 bg-white text-[17px] font-medium text-gray-900 transition-transform duration-150 hover:bg-gray-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{socialLoading === "google" ? "..." : t("Continue with Google")}</span>
              </button>

              <button
                type="button"
                onClick={() => runSocialLogin("apple")}
                disabled={Boolean(socialLoading)}
                className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-gray-900 bg-gray-950 text-[17px] font-medium text-white transition-transform duration-150 hover:bg-black active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
              
                <span>{socialLoading === "apple" ? "..." : t("Continue with Apple")}</span>
              </button>
            </div>

            <div className="my-3 flex items-center gap-3 text-sm text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>{t("or")}</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleQrLogin}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-gray-200 bg-white text-[17px] font-medium text-gray-900 transition-transform duration-150 hover:bg-gray-50 active:scale-[0.99]"
            >
              <QrCode className="h-4 w-4 text-gray-700" />
              <span>{t("Log in with QR code")}</span>
            </button>

            <p className="pt-3 text-center text-[12px] leading-5 text-gray-500">
              {t("By continuing, you agree to Beyall Terms and Privacy Policy.")}
            </p>
            <div className="text-center">
              <button
                type="button"
                onClick={onGoRegister}
                className="text-[12px] font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-700"
              >
                {t("Need an account? Sign up")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default React.memo(LoginPage);
