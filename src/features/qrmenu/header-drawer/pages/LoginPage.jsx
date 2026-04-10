import React from "react";

const BEYALL_PRIMARY = "#5B2EFF";

function LoginPage({
  t,
  onGoogleLogin,
  onGoRegister,
  onContinueGuest,
  onBack,
}) {
  const [socialLoading, setSocialLoading] = React.useState("");
  const [error, setError] = React.useState("");

  const runGoogleLogin = async () => {
    setError("");
    setSocialLoading("google");
    try {
      await onGoogleLogin?.();
    } catch (err) {
      setError(err?.message || t("Social login failed"));
      setSocialLoading("");
    }
  };

  return (
    <div className="relative h-full overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:text-gray-900"
        >
          {t("Back")}
        </button>
      </div>

      <div className="mx-auto flex min-h-[calc(100%-56px)] w-full max-w-[420px] items-center px-5 py-7">
        <div className="w-full rounded-[24px] border border-[#ECECF4] bg-white px-6 py-8 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
            <h2 className="text-[30px] font-semibold tracking-[-0.03em] text-gray-950">
              {t("Login or sign up")}
            </h2>

            <button
              type="button"
              onClick={runGoogleLogin}
              disabled={Boolean(socialLoading)}
              className="mt-8 flex h-12 w-full items-center justify-center rounded-[14px] text-[17px] font-semibold text-white transition-transform duration-150 hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: BEYALL_PRIMARY }}
            >
              {socialLoading === "google" ? "..." : t("Continue with Google")}
            </button>

            <button
              type="button"
              onClick={onGoRegister}
              className="mt-5 text-sm font-medium text-[#5B2EFF] hover:text-[#4B23DA]"
            >
              {t("Need an account? Sign up")}
            </button>

            {typeof onContinueGuest === "function" ? (
              <button
                type="button"
                onClick={onContinueGuest}
                className="mt-2 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {t("Continue as guest")}
              </button>
            ) : null}

            {error ? (
              <p className="mt-4 text-xs font-medium text-rose-600">{error}</p>
            ) : null}

            <p className="mt-8 text-center text-[11px] leading-5 text-gray-500">
              {t("By continuing, you agree to Beyall Terms and Privacy Policy.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(LoginPage);
