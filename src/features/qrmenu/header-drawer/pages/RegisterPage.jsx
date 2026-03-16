import React from "react";

function RegisterPage({ t, onRegister, onGoLogin, onBack }) {
  const [form, setForm] = React.useState({
    email: "",
    username: "",
    phone: "",
    address: "",
    password: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const onChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await onRegister?.(form);
    } catch (err) {
      setError(err?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.65),_transparent_44%),linear-gradient(180deg,_#eff6ff_0%,_#ffffff_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.14),_transparent_36%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)]">
      <div className="sticky top-0 z-10 border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/85 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-neutral-100"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("Register")}</h3>
      </div>

      <div className="px-4 py-5">
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/75 dark:shadow-[0_28px_80px_rgba(2,6,23,0.45)]">
          <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
            {t("Create Account")}
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {t("Register")}
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
              type="email"
              value={form.email}
              onChange={(e) => onChange("email", e.target.value)}
              placeholder={t("Email")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              autoComplete="email"
            />
            <input
              value={form.username}
              onChange={(e) => onChange("username", e.target.value)}
              placeholder={t("Username")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              autoComplete="username"
            />
            <input
              value={form.phone}
              onChange={(e) => onChange("phone", e.target.value)}
              placeholder={t("Phone")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              autoComplete="tel"
            />
            <input
              value={form.address}
              onChange={(e) => onChange("address", e.target.value)}
              placeholder={t("Address")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              autoComplete="street-address"
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder={t("Password")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              autoComplete="new-password"
            />
          </div>

          {error ? <p className="mt-3 text-xs font-medium text-rose-600">{t(error)}</p> : null}

          <div className="mt-4 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {loading ? "..." : t("Create Account")}
            </button>

            <button
              type="button"
              onClick={onGoLogin}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {t("Login instead")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default React.memo(RegisterPage);
