import React from "react";
import {
  EMAIL_REGEX,
  QR_PHONE_REGEX,
  normalizeQrPhone,
} from "../../../floorPlan/utils/bookingRules";

function normalizeHexColor(value, fallback = "#111827") {
  const raw = String(value || "").trim();
  const match = raw.match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return fallback;
  if (match[1].length === 6) return `#${match[1].toUpperCase()}`;
  return `#${match[1]
    .split("")
    .map((ch) => `${ch}${ch}`)
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(value) {
  const normalized = normalizeHexColor(value, "");
  if (!normalized) return null;
  const hex = normalized.slice(1);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function getReadableTextColor(value) {
  const rgb = hexToRgb(value);
  if (!rgb) return "#FFFFFF";
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 160 ? "#0F172A" : "#FFFFFF";
}

function toRgba(value, alpha) {
  const rgb = hexToRgb(value);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function RegisterPage({
  t,
  onRegister,
  onGoogleLogin,
  onAppleLogin,
  onGoLogin,
  onContinueGuest,
  onBack,
  accentColor = "#111827",
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const pageBackground = `radial-gradient(circle at top left, ${
    toRgba(resolvedAccentColor, 0.12) || "rgba(17,24,39,0.12)"
  }, transparent 44%), linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)`;
  const [form, setForm] = React.useState({
    email: "",
    username: "",
    phone: "",
    address: "",
    password: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [socialLoading, setSocialLoading] = React.useState("");
  const [error, setError] = React.useState("");
  const normalizedPhone = normalizeQrPhone(form.phone);
  const formErrors = {
    username: form.username.trim() ? "" : t("Please enter your name."),
    phone: QR_PHONE_REGEX.test(normalizedPhone) ? "" : t("Please enter a valid phone number."),
    email:
      form.email.trim() && !EMAIL_REGEX.test(form.email.trim().toLowerCase())
        ? t("Please enter a valid email address.")
        : "",
    password: form.password.trim() ? "" : t("Please enter your password."),
  };

  const onChange = (key, value) => {
    if (error) setError("");
    setForm((prev) => ({ ...prev, [key]: value }));
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
      setError(err?.message || t("Social login failed"));
      setSocialLoading("");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const firstError =
      formErrors.username || formErrors.phone || formErrors.email || formErrors.password;
    if (firstError) {
      setError(firstError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onRegister?.(form);
    } catch (err) {
      setError(err?.message || t("Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-full overflow-y-auto dark:bg-[linear-gradient(180deg,_#0f172a_0%,_#020617_100%)]"
      style={{ backgroundImage: pageBackground }}
    >
      <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85">
        <div className="mx-auto flex w-full max-w-[440px] items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-100"
          >
            {t("Back")}
          </button>
          <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
            {t("Sign-Up")}
          </h3>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[440px] px-3 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-4 sm:pt-4 sm:pb-6">
        <form
          className="rounded-[24px] border border-slate-200/80 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-950/85 sm:rounded-[28px] sm:p-4"
          onSubmit={submit}
        >
          <div className="space-y-3">
            <input
              type="email"
              value={form.email}
              onChange={(e) => onChange("email", e.target.value)}
              placeholder={t("Email (optional)")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 sm:text-sm"
              autoComplete="email"
            />
            <input
              value={form.username}
              onChange={(e) => onChange("username", e.target.value)}
              placeholder={t("Full name")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 sm:text-sm"
              autoComplete="name"
            />
            <input
              value={form.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              placeholder={t("Phone")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 sm:text-sm"
              autoComplete="tel"
            />
            <input
              value={form.address}
              onChange={(e) => onChange("address", e.target.value)}
              placeholder={t("Address (optional)")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 sm:text-sm"
              autoComplete="street-address"
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder={t("Password")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 sm:text-sm"
              autoComplete="new-password"
            />
          </div>

          {error || formErrors.username || formErrors.phone || formErrors.email || formErrors.password ? (
            <p className="mt-3 text-xs font-medium text-rose-600">
              {error || formErrors.username || formErrors.phone || formErrors.email || formErrors.password}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl text-base font-semibold transition disabled:opacity-60 sm:text-sm"
              style={{
                backgroundColor: resolvedAccentColor,
                color: accentTextColor,
                boxShadow: `0 16px 30px ${toRgba(resolvedAccentColor, 0.24) || "rgba(15,23,42,0.18)"}`,
              }}
            >
              {loading ? "..." : t("Create Account")}
            </button>

            <div className="grid grid-cols-1 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => runSocialLogin("google")}
                disabled={Boolean(socialLoading)}
                className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {socialLoading === "google" ? "..." : t("Continue with Google")}
              </button>
              <button
                type="button"
                onClick={() => runSocialLogin("apple")}
                disabled={Boolean(socialLoading)}
                className="min-h-12 w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60 dark:border-neutral-700 dark:bg-black dark:text-white dark:hover:bg-neutral-900"
              >
                {socialLoading === "apple" ? "..." : t("Continue with Apple")}
              </button>
              {typeof onContinueGuest === "function" ? (
                <button
                  type="button"
                  onClick={onContinueGuest}
                  className="min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {t("Continue as Guest")}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default React.memo(RegisterPage);
