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
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("Register")}</h3>
      </div>

      <form className="p-4 space-y-3" onSubmit={submit}>
        <input
          type="email"
          value={form.email}
          onChange={(e) => onChange("email", e.target.value)}
          placeholder={t("Email")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="email"
        />
        <input
          value={form.username}
          onChange={(e) => onChange("username", e.target.value)}
          placeholder={t("Username")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="username"
        />
        <input
          value={form.phone}
          onChange={(e) => onChange("phone", e.target.value)}
          placeholder={t("Phone")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="tel"
        />
        <input
          value={form.address}
          onChange={(e) => onChange("address", e.target.value)}
          placeholder={t("Address")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="street-address"
        />
        <input
          type="password"
          value={form.password}
          onChange={(e) => onChange("password", e.target.value)}
          placeholder={t("Password")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="new-password"
        />

        {error ? <p className="text-xs text-rose-600">{t(error)}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "..." : t("Create Account")}
        </button>

        <button
          type="button"
          onClick={onGoLogin}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 text-sm font-semibold"
        >
          {t("Login instead")}
        </button>
      </form>
    </div>
  );
}

export default React.memo(RegisterPage);
