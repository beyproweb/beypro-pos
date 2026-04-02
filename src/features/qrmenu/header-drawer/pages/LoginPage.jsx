import React from "react";

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

function LoginPage({ t, onLogin, onGoRegister, onBack, accentColor = "#111827" }) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const pageBackground = `radial-gradient(circle at top left, ${
    toRgba(resolvedAccentColor, 0.12) || "rgba(17,24,39,0.12)"
  }, transparent 46%), linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)`;
  const [login, setLogin] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (event) => {
    event.preventDefault();
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

  return (
    <div
      className="h-full overflow-y-auto dark:bg-[linear-gradient(180deg,_#0f172a_0%,_#020617_100%)]"
      style={{ backgroundImage: pageBackground }}
    >
      <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-100"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("Login / Register")}</h3>
      </div>

      <div className="px-4 py-5">
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/75 dark:shadow-[0_28px_80px_rgba(2,6,23,0.45)]">
          <div
            className="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]"
            style={{
              borderColor: toRgba(resolvedAccentColor, 0.24) || resolvedAccentColor,
              backgroundColor: toRgba(resolvedAccentColor, 0.1) || resolvedAccentColor,
              color: resolvedAccentColor,
            }}
          >
            {t("Login")}
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {t("Login / Register")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t("Login to sync profile and orders")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {t("My Orders")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {t("Saved checkout details")}
            </span>
          </div>
        </div>

        <form
          className="mt-4 rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:border-neutral-800 dark:bg-neutral-950/85"
          onSubmit={submit}
        >
          <div className="space-y-3">
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder={t("Phone number or email")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              style={{ boxShadow: "none" }}
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("Password")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              style={{ boxShadow: "none" }}
              autoComplete="current-password"
            />
          </div>

          {error ? <p className="mt-3 text-xs font-medium text-rose-600">{t(error)}</p> : null}

          <div className="mt-4 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl text-sm font-semibold transition disabled:opacity-60"
              style={{
                backgroundColor: resolvedAccentColor,
                color: accentTextColor,
                boxShadow: `0 16px 30px ${toRgba(resolvedAccentColor, 0.24) || "rgba(15,23,42,0.18)"}`,
              }}
            >
              {loading ? "..." : t("Login")}
            </button>

            <button
              type="button"
              onClick={onGoRegister}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {t("Register")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default React.memo(LoginPage);
