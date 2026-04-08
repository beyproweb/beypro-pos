import React from "react";
import {
  EMAIL_REGEX,
  QR_PHONE_REGEX,
  normalizeQrPhone,
} from "../../../floorPlan/utils/bookingRules";

const BEYALL_PRIMARY = "#5B2EFF";
const BEYALL_SECONDARY = "#7C3AED";

function LoginPage({
  t,
  onLogin,
  onRequestEmailOtp,
  onVerifyEmailOtp,
  onGoogleLogin,
  onAppleLogin,
  onGoRegister,
  onContinueGuest,
  onBack,
}) {
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otpCode, setOtpCode] = React.useState("");
  const [useOtp, setUseOtp] = React.useState(false);
  const [otpRequested, setOtpRequested] = React.useState(false);
  const [otpHint, setOtpHint] = React.useState("");
  const [otpRetryAfter, setOtpRetryAfter] = React.useState(0);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [otpRequesting, setOtpRequesting] = React.useState(false);
  const [otpVerifying, setOtpVerifying] = React.useState(false);
  const [socialLoading, setSocialLoading] = React.useState("");
  const [error, setError] = React.useState("");
  const normalizedEmail = login.trim().toLowerCase();
  const normalizedLogin = normalizeQrPhone(login);
  const loginError =
    login.trim() &&
    !(QR_PHONE_REGEX.test(normalizedLogin) || EMAIL_REGEX.test(login.trim().toLowerCase()))
      ? t("Please enter a valid phone number or email.")
      : "";
  const otpEmailError =
    login.trim() && !EMAIL_REGEX.test(normalizedEmail)
      ? t("Please enter a valid email address.")
      : "";
  const passwordError = showPassword && !password.trim() ? t("Please enter your credentials.") : "";
  const otpCodeError =
    otpRequested && !/^\d{4,8}$/.test(otpCode.trim())
      ? t("Please enter the verification code.")
      : "";

  React.useEffect(() => {
    if (otpRetryAfter <= 0) return undefined;
    const timer = window.setInterval(() => {
      setOtpRetryAfter((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpRetryAfter]);

  const requestOtp = async () => {
    if (!onRequestEmailOtp) {
      throw new Error("Email OTP login is not available yet.");
    }
    if (!normalizedEmail) {
      throw new Error(t("Please enter a valid email address."));
    }
    if (otpEmailError) {
      throw new Error(otpEmailError);
    }

    setOtpRequesting(true);
    try {
      const response = await onRequestEmailOtp({
        email: normalizedEmail,
      });
      setOtpRequested(true);
      setOtpHint(response?.message || t("Verification code sent. Please check your email."));
      setOtpRetryAfter(Number(response?.retryAfterSeconds || 0) || 0);
    } finally {
      setOtpRequesting(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (useOtp) {
      setError("");
      try {
        if (!otpRequested) {
          await requestOtp();
          return;
        }
        if (otpCodeError) {
          throw new Error(otpCodeError);
        }
        if (!onVerifyEmailOtp) {
          throw new Error("Email OTP verification is not available yet.");
        }
        setOtpVerifying(true);
        await onVerifyEmailOtp({
          email: normalizedEmail,
          code: otpCode.trim(),
        });
      } catch (err) {
        setError(err?.message || "Verification failed");
      } finally {
        setOtpVerifying(false);
      }
      return;
    }

    if (!showPassword) {
      if (!login.trim()) {
        setError(t("Please enter your credentials."));
        return;
      }
      if (loginError) {
        setError(loginError);
        return;
      }
      setShowPassword(true);
      return;
    }
    if (loginError) {
      setError(loginError);
      return;
    }
    if (!password.trim()) {
      setError(passwordError || t("Please enter your credentials."));
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
        <h3 className="text-sm font-semibold text-gray-900">{t("Login / Signup")}</h3>
      </div>

      <div className="mx-auto flex min-h-[calc(100%-56px)] w-full max-w-[420px] items-center px-5 py-7">
        <form
          className="w-full rounded-[24px] border border-[#ECECF4] bg-white px-5 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
          onSubmit={submit}
        >
          <div className="mb-6 text-center">
            <div className="inline-flex items-center rounded-full border border-[#E5E7F4] bg-[#F8F8FF] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5B2EFF]">
              {t("Access your account")}
            </div>
            <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-gray-950">
              {t("Login/Signup")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {useOtp ? t("Log in with an email verification code") : t("Continue with your email")}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <input
              value={login}
              onChange={(e) => {
                setLogin(e.target.value);
                if (error) setError("");
                if (otpRequested) {
                  setOtpRequested(false);
                  setOtpCode("");
                  setOtpHint("");
                }
              }}
              placeholder={useOtp ? t("Enter email") : t("Enter phone number or email")}
              className="h-[52px] w-full rounded-[14px] border border-gray-300 bg-white px-4 text-[16px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#5B2EFF] focus:ring-2 focus:ring-[#5B2EFF]/20"
              autoComplete={useOtp ? "email" : "username"}
            />

            {useOtp && otpRequested ? (
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value);
                  if (error) setError("");
                }}
                placeholder={t("Enter verification code")}
                className="h-[52px] w-full rounded-[14px] border border-gray-300 bg-white px-4 text-[16px] tracking-[0.24em] text-gray-900 outline-none transition-all placeholder:tracking-normal placeholder:text-gray-400 focus:border-[#5B2EFF] focus:ring-2 focus:ring-[#5B2EFF]/20"
                autoComplete="one-time-code"
              />
            ) : null}

            {!useOtp && showPassword ? (
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder={t("Enter password")}
                className="h-[52px] w-full rounded-[14px] border border-gray-300 bg-white px-4 text-[16px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-[#5B2EFF] focus:ring-2 focus:ring-[#5B2EFF]/20"
                autoComplete="current-password"
              />
            ) : null}
          </div>

          {otpHint && useOtp ? (
            <p className="mt-3 text-xs font-medium text-emerald-700">{otpHint}</p>
          ) : null}

          {error || (useOtp ? otpEmailError || otpCodeError : loginError || passwordError) ? (
            <p className="mt-3 text-xs font-medium text-rose-600">
              {error || (useOtp ? otpEmailError || otpCodeError : loginError || passwordError)}
            </p>
          ) : null}

          {useOtp && otpRequested ? (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={async () => {
                  if (otpRetryAfter > 0 || otpRequesting) return;
                  setError("");
                  try {
                    await requestOtp();
                  } catch (err) {
                    setError(err?.message || "Failed to resend code");
                  }
                }}
                disabled={otpRetryAfter > 0 || otpRequesting}
                className="text-xs font-semibold text-[#5B2EFF] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {otpRetryAfter > 0
                  ? `Resend code in ${otpRetryAfter}s`
                  : otpRequesting
                  ? t("Sending...")
                  : t("Resend code")}
              </button>
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            <button
              type="submit"
              disabled={loading || otpRequesting || otpVerifying}
              className="h-[44px] w-full rounded-[14px] bg-black text-[17px] font-semibold text-white transition-transform duration-150 hover:bg-neutral-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: BEYALL_PRIMARY,
              }}
            >
              {loading || otpRequesting || otpVerifying
                ? "..."
                : useOtp
                ? otpRequested
                  ? t("Verify code")
                  : t("Send code")
                : t("Continue")}
            </button>

            <button
              type="button"
              onClick={() => {
                setUseOtp((prev) => !prev);
                setShowPassword(false);
                setPassword("");
                setOtpCode("");
                setOtpRequested(false);
                setOtpHint("");
                setOtpRetryAfter(0);
                setError("");
              }}
              className="h-[40px] w-full rounded-[12px] border border-[#D8DDF8] bg-[#F8F8FF] px-4 text-[14px] font-semibold text-[#5B2EFF] transition-all duration-150 hover:border-[#C6CEFF] hover:bg-[#F3F4FF] active:scale-[0.99]"
            >
              {useOtp ? t("Use password instead") : t("Use email code instead")}
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

              {typeof onContinueGuest === "function" ? (
                <button
                  type="button"
                  onClick={onContinueGuest}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] border border-gray-200 bg-white text-[17px] font-medium text-gray-900 transition-transform duration-150 hover:bg-gray-50 active:scale-[0.99]"
                >
                  <span>{t("Continue as Guest")}</span>
                </button>
              ) : null}
            </div>

            <div className="my-3 flex items-center gap-3 text-sm text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              <span>{t("or")}</span>
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={onGoRegister}
              className="flex h-12 w-full items-center justify-center rounded-[14px] border border-[#D8DDF8] bg-[#F8F8FF] px-4 text-[15px] font-semibold text-[#5B2EFF] transition-all duration-150 hover:border-[#C6CEFF] hover:bg-[#F3F4FF] active:scale-[0.99]"
            >
              {t("Need an account? Signup")}
            </button>

            <p className="pt-3 text-center text-[12px] leading-5 text-gray-500">
              {t("By continuing, you agree to Beyall Terms and Privacy Policy.")}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default React.memo(LoginPage);
