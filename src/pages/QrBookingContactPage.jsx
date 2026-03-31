import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BookingPageLayout from "../features/floorPlan/components/BookingPageLayout";
import BookingSection from "../features/floorPlan/components/BookingSection";
import RegisteredCustomerBadge from "../features/floorPlan/components/RegisteredCustomerBadge";
import {
  getCheckoutPrefill,
  saveCheckoutPrefill,
  useCustomerAuth,
} from "../features/qrmenu/header-drawer";
import {
  buildConcertBookingPath,
  buildPublicMenuPath,
  buildReservationBookingPath,
  resolvePublicBookingIdentifier,
} from "../features/qrmenu/publicBookingRoutes";
import {
  EMAIL_REGEX,
  QR_PHONE_REGEX,
  formatQrPhoneForInput,
  normalizeQrPhone,
} from "../features/floorPlan/utils/bookingRules";

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function Field({ label, error = "", children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</div>
      {children}
      {error ? <div className="mt-1.5 text-sm text-rose-600 dark:text-rose-300">{error}</div> : null}
    </label>
  );
}

export default function QrBookingContactPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id, concertId } = useParams();
  const storage = React.useMemo(() => getStorage(), []);
  const { customer, isLoggedIn, login, register, updateProfile } = useCustomerAuth(storage);
  const savedPrefill = React.useMemo(() => getCheckoutPrefill(storage), [storage]);
  const editRequested = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("edit") === "1";
  }, [location.search]);
  const identifier = React.useMemo(
    () => resolvePublicBookingIdentifier({ slug, id, search: location.search }),
    [id, location.search, slug]
  );
  const menuPath = React.useMemo(
    () => buildPublicMenuPath({ pathname: location.pathname, slug, id, search: location.search }),
    [id, location.pathname, location.search, slug]
  );
  const bookingPath = React.useMemo(() => {
    if (concertId) {
      return buildConcertBookingPath({
        pathname: location.pathname,
        slug,
        id,
        search: location.search,
        concertId,
      });
    }
    return buildReservationBookingPath({
      pathname: location.pathname,
      slug,
      id,
      search: location.search,
    });
  }, [concertId, id, location.pathname, location.search, slug]);
  const accentColor = "#111827";

  const [mode, setMode] = React.useState("register");
  const [isEditMode, setIsEditMode] = React.useState(() => Boolean(editRequested));
  const [registerForm, setRegisterForm] = React.useState({
    name: customer?.username || savedPrefill?.name || "",
    phone: formatQrPhoneForInput(customer?.phone || savedPrefill?.phone || ""),
    email: customer?.email || savedPrefill?.email || "",
    address: customer?.address || savedPrefill?.address || "",
    password: "",
  });
  const [loginForm, setLoginForm] = React.useState({
    login: savedPrefill?.email || "",
    password: "",
  });
  const [paymentForm, setPaymentForm] = React.useState({
    payment_method: savedPrefill?.payment_method || "bank_transfer",
    bank_reference: savedPrefill?.bank_reference || "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!isLoggedIn) {
      setIsEditMode(false);
      return;
    }
    if (editRequested) {
      setIsEditMode(true);
    }
  }, [editRequested, isLoggedIn]);

  React.useEffect(() => {
    setRegisterForm((prev) => ({
      ...prev,
      name: customer?.username || savedPrefill?.name || prev.name,
      phone:
        prev.phone || formatQrPhoneForInput(customer?.phone || savedPrefill?.phone || ""),
      email: customer?.email || savedPrefill?.email || prev.email,
      address: customer?.address || savedPrefill?.address || prev.address,
    }));
  }, [customer?.address, customer?.email, customer?.phone, customer?.username, savedPrefill]);

  const registerPhone = normalizeQrPhone(registerForm.phone);
  const registerErrors = {
    name: registerForm.name.trim() ? "" : t("Please enter your name."),
    phone: QR_PHONE_REGEX.test(registerPhone) ? "" : t("Please enter a valid phone number."),
    email:
      registerForm.email.trim() && EMAIL_REGEX.test(registerForm.email.trim().toLowerCase())
        ? ""
        : t("Please enter a valid email address."),
    address: registerForm.address.trim() ? "" : t("Please enter your address."),
    password: registerForm.password.trim() ? "" : t("Please enter your password."),
  };
  const profileErrors = {
    name: registerErrors.name,
    phone: registerErrors.phone,
    email: registerErrors.email,
    address: registerErrors.address,
  };
  const loginErrors = {
    login: loginForm.login.trim() ? "" : t("Please enter your credentials."),
    password: loginForm.password.trim() ? "" : t("Please enter your credentials."),
  };

  const handleBack = React.useCallback(() => {
    navigate(menuPath);
  }, [menuPath, navigate]);

  const handleContinue = React.useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const account = isLoggedIn && isEditMode
        ? await updateProfile({
            username: registerForm.name,
            phone: registerPhone,
            email: registerForm.email,
            address: registerForm.address,
          })
        : isLoggedIn
        ? customer
        : mode === "login"
          ? await login({
              login: loginForm.login,
              password: loginForm.password,
            })
          : await register({
              email: registerForm.email,
              username: registerForm.name,
              phone: registerPhone,
              address: registerForm.address,
              password: registerForm.password,
            });

      saveCheckoutPrefill(
        {
          name: account?.username || savedPrefill?.name || registerForm.name,
          phone: account?.phone || savedPrefill?.phone || registerPhone,
          email: account?.email || savedPrefill?.email || registerForm.email,
          address: account?.address || registerForm.address || savedPrefill?.address || "",
          payment_method: paymentForm.payment_method,
          bank_reference: paymentForm.bank_reference,
        },
        storage
      );

      navigate(bookingPath, { replace: true });
    } catch (nextError) {
      setError(nextError?.message || t("Registration failed"));
    } finally {
      setLoading(false);
    }
  }, [
    bookingPath,
    login,
    loginForm.login,
    loginForm.password,
    mode,
    navigate,
    paymentForm.bank_reference,
    paymentForm.payment_method,
    customer,
    isEditMode,
    isLoggedIn,
    register,
    registerForm.address,
    registerForm.email,
    registerForm.name,
    registerForm.password,
    registerPhone,
    savedPrefill?.address,
    storage,
    t,
    updateProfile,
  ]);

  const actionDisabled = isLoggedIn && isEditMode
    ? loading || Boolean(profileErrors.name || profileErrors.phone || profileErrors.email || profileErrors.address)
    : isLoggedIn
    ? loading
    : loading ||
      (mode === "login"
        ? Boolean(loginErrors.login || loginErrors.password)
        : Boolean(
            registerErrors.name ||
              registerErrors.phone ||
              registerErrors.email ||
              registerErrors.address ||
              registerErrors.password
          ));

  if (!identifier) {
    return null;
  }

  return (
    <BookingPageLayout
      title={t("Contact & Payment")}
      subtitle={t("Complete your profile before continuing.")}
      onBack={handleBack}
      accentColor={accentColor}
      actionLabel={loading ? t("Saving...") : isLoggedIn && isEditMode ? t("Save changes") : t("Continue to Booking")}
      actionHelper={t("Secure this booking with your saved profile.")}
      onAction={handleContinue}
      actionDisabled={actionDisabled}
    >
      <BookingSection
        step={1}
        title={isLoggedIn ? (isEditMode ? t("Profile") : t("Registered User")) : t("Account")}
        description={isLoggedIn && !isEditMode ? "" : t("Create your booking profile")}
      >
        {isLoggedIn && !isEditMode ? (
          <RegisteredCustomerBadge
            customer={{
              username: customer?.username || savedPrefill?.name,
              phone: customer?.phone || savedPrefill?.phone,
              email: customer?.email || savedPrefill?.email,
            }}
            accentColor={accentColor}
            onEdit={() => setIsEditMode(true)}
          />
        ) : (
          <div className="space-y-4">
            {!isLoggedIn ? (
              <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-950">
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "register"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                      : "text-neutral-600 dark:text-neutral-300",
                  ].join(" ")}
                >
                  {t("Register")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "login"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                      : "text-neutral-600 dark:text-neutral-300",
                  ].join(" ")}
                >
                  {t("Login")}
                </button>
              </div>
            ) : null}

            {!isLoggedIn && mode === "login" ? (
              <div className="grid gap-4">
                <Field label={t("Email or username")} error={loginErrors.login}>
                  <input
                    type="text"
                    value={loginForm.login}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, login: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
                <Field label={t("Password")} error={loginErrors.password}>
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("Full Name")} error={profileErrors.name}>
                  <input
                    type="text"
                    value={registerForm.name}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
                <Field label={t("Phone")} error={profileErrors.phone}>
                  <input
                    type="tel"
                    value={registerForm.phone}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
                <Field label={t("Email")} error={profileErrors.email}>
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
                {!isLoggedIn ? (
                  <Field label={t("Password")} error={registerErrors.password}>
                    <input
                      type="password"
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                    />
                  </Field>
                ) : null}
                <div className="sm:col-span-2">
                  <Field label={t("Address")} error={profileErrors.address}>
                    <input
                      type="text"
                      value={registerForm.address}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, address: event.target.value }))
                      }
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        )}
        {error ? <div className="mt-3 text-sm font-medium text-rose-600">{t(error)}</div> : null}
      </BookingSection>

      <BookingSection
        step={2}
        title={t("Payment Method")}
        description={t("Choose how you want to pay before opening the booking flow.")}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setPaymentForm((prev) => ({
                  ...prev,
                  payment_method: "bank_transfer",
                }))
              }
              className={[
                "rounded-[24px] border px-4 py-4 text-left transition",
                paymentForm.payment_method === "bank_transfer"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
              ].join(" ")}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">{t("Active")}</div>
              <div className="mt-2 text-base font-semibold">{t("Bank Transfer")}</div>
              <div className="mt-1 text-sm opacity-80">{t("Use the bank reference below to complete payment.")}</div>
            </button>
            <button
              type="button"
              onClick={() =>
                setPaymentForm((prev) => ({
                  ...prev,
                  payment_method: "credit_card",
                }))
              }
              className={[
                "rounded-[24px] border px-4 py-4 text-left transition",
                paymentForm.payment_method === "credit_card"
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
                  : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
              ].join(" ")}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">{t("Credit Card")}</div>
              <div className="mt-2 text-base font-semibold">{t("Card Details")}</div>
              <div className="mt-1 text-sm opacity-80">{t("UI preview only for now.")}</div>
            </button>
          </div>

          <label className="block">
            <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">
              {t("Bank Reference")}
            </div>
            <input
              type="text"
              value={paymentForm.bank_reference}
              onChange={(event) =>
                setPaymentForm((prev) => ({ ...prev, bank_reference: event.target.value }))
              }
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
            />
          </label>
        </div>
      </BookingSection>
    </BookingPageLayout>
  );
}