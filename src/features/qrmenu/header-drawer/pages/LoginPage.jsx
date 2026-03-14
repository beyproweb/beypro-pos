import React from "react";

function LoginPage({ t, onLogin, onGoRegister, onBack }) {
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
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-neutral-800 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-neutral-100"
        >
          {t("Back")}
        </button>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-neutral-100">{t("Login / Register")}</h3>
      </div>

      <form className="p-4 space-y-3" onSubmit={submit}>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder={t("Email or username")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("Password")}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
          autoComplete="current-password"
        />

        {error ? <p className="text-xs text-rose-600">{t(error)}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? "..." : t("Login")}
        </button>

        <button
          type="button"
          onClick={onGoRegister}
          className="w-full h-10 rounded-lg border border-gray-200 dark:border-neutral-700 text-sm font-semibold"
        >
          {t("Register")}
        </button>
      </form>
    </div>
  );
}

export default React.memo(LoginPage);
