import React from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import secureFetch from "../utils/secureFetch";
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
import { createQrScopedStorage } from "../features/qrmenu/utils/createQrScopedStorage";

function Field({ label, error = "", children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</div>
      {children}
      {error ? <div className="mt-1.5 text-sm text-rose-600 dark:text-rose-300">{error}</div> : null}
    </label>
  );
}

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

export default function QrBookingContactPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id, concertId } = useParams();
  const editRequested = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("edit") === "1";
  }, [location.search]);
  const identifier = React.useMemo(
    () => resolvePublicBookingIdentifier({ slug, id, search: location.search }),
    [id, location.search, slug]
  );
  const storage = React.useMemo(() => createQrScopedStorage(identifier), [identifier]);
  const customerAuthFetcher = React.useCallback(
    async (path, options = undefined) => {
      const rawPath = String(path || "");
      if (!identifier || rawPath.includes("identifier=")) {
        return secureFetch(rawPath, options);
      }
      const separator = rawPath.includes("?") ? "&" : "?";
      return secureFetch(
        `${rawPath}${separator}identifier=${encodeURIComponent(identifier)}`,
        options
      );
    },
    [identifier]
  );
  const { customer, isLoggedIn, login, register, updateProfile } = useCustomerAuth(storage, {
    fetcher: customerAuthFetcher,
  });
  const isLoggedInEffective = Boolean(isLoggedIn || customer?.id);
  const [savedPrefill, setSavedPrefill] = React.useState(() => getCheckoutPrefill(storage));
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
  const [accentColor, setAccentColor] = React.useState("#111827");

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
    login: savedPrefill?.email || formatQrPhoneForInput(savedPrefill?.phone || ""),
    password: "",
  });
  const [paymentForm, setPaymentForm] = React.useState({
    payment_method: savedPrefill?.payment_method || "bank_transfer",
    bank_reference: savedPrefill?.bank_reference || "",
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const translateAuthError = React.useCallback(
    (nextError) => {
      const message = String(nextError?.message || "").trim();
      if (!message) return t("Registration failed");

      const translatableMessages = new Set([
        "No account found for this phone number or email. Please register.",
      ]);

      return translatableMessages.has(message) ? t(message) : message;
    },
    [t]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function loadAccentColor() {
      if (!identifier) return;
      try {
        const response = await secureFetch(
          `/public/qr-menu-customization/${encodeURIComponent(identifier)}`
        );
        if (cancelled) return;
        const nextAccent = normalizeHexColor(
          response?.customization?.primary_color,
          "#111827"
        );
        setAccentColor(nextAccent);
      } catch {
        if (!cancelled) {
          setAccentColor("#111827");
        }
      }
    }

    loadAccentColor();
    return () => {
      cancelled = true;
    };
  }, [identifier]);

  const accentTextColor = getReadableTextColor(accentColor);
  const selectedPillStyle = {
    backgroundColor: accentColor,
    borderColor: accentColor,
    color: accentTextColor,
    boxShadow: `0 14px 28px ${toRgba(accentColor, 0.18) || "rgba(15,23,42,0.18)"}`,
  };

  React.useEffect(() => {
    setSavedPrefill(getCheckoutPrefill(storage));
  }, [
    customer?.address,
    customer?.email,
    customer?.id,
    customer?.phone,
    customer?.updatedAt,
    customer?.username,
    storage,
  ]);

  React.useEffect(() => {
    if (!isLoggedInEffective) {
      setIsEditMode(false);
      return;
    }
    if (editRequested) {
      setIsEditMode(true);
    }
  }, [editRequested, isLoggedInEffective]);

  React.useEffect(() => {
    const nextName = customer?.username || savedPrefill?.name || "";
    const nextPhone = formatQrPhoneForInput(customer?.phone || savedPrefill?.phone || "");
    const nextEmail = customer?.email || savedPrefill?.email || "";
    const nextAddress = customer?.address || savedPrefill?.address || "";

    setRegisterForm((prev) =>
      isLoggedInEffective
        ? {
            ...prev,
            name: nextName,
            phone: nextPhone,
            email: nextEmail,
            address: nextAddress,
          }
        : {
            ...prev,
            name: prev.name || nextName,
            phone: prev.phone || nextPhone,
            email: prev.email || nextEmail,
            address: prev.address || nextAddress,
          }
    );
  }, [
    customer?.address,
    customer?.email,
    customer?.phone,
    customer?.username,
    isLoggedInEffective,
    savedPrefill?.address,
    savedPrefill?.email,
    savedPrefill?.name,
    savedPrefill?.phone,
  ]);

  React.useEffect(() => {
    if (isLoggedInEffective) return;
    const nextLogin = savedPrefill?.email || formatQrPhoneForInput(savedPrefill?.phone || "");
    if (!nextLogin) return;
    setLoginForm((prev) => (prev.login ? prev : { ...prev, login: nextLogin }));
  }, [isLoggedInEffective, savedPrefill?.email, savedPrefill?.phone]);

  React.useEffect(() => {
    const nextMethod = savedPrefill?.payment_method || "bank_transfer";
    const nextReference = savedPrefill?.bank_reference || "";
    setPaymentForm((prev) =>
      prev.payment_method === nextMethod && prev.bank_reference === nextReference
        ? prev
        : {
            ...prev,
            payment_method: nextMethod,
            bank_reference: nextReference,
          }
    );
  }, [savedPrefill?.bank_reference, savedPrefill?.payment_method]);

  const registerPhone = normalizeQrPhone(registerForm.phone);
  const registerErrors = {
    name: registerForm.name.trim() ? "" : t("Please enter your name."),
    phone: QR_PHONE_REGEX.test(registerPhone) ? "" : t("Please enter a valid phone number."),
    email:
      registerForm.email.trim() &&
      !EMAIL_REGEX.test(registerForm.email.trim().toLowerCase())
        ? t("Please enter a valid email address.")
        : "",
    address: "",
    password: registerForm.password.trim() ? "" : t("Please enter your password."),
  };
  const profileErrors = {
    name: registerErrors.name,
    phone: registerErrors.phone,
    email: registerErrors.email,
    address: registerErrors.address,
  };
  const loginErrors = {
    login:
      normalizeQrPhone(loginForm.login) || EMAIL_REGEX.test(loginForm.login.trim().toLowerCase())
        ? ""
        : t("Please enter a valid phone number or email."),
    password: loginForm.password.trim() ? "" : t("Please enter your credentials."),
  };

  const handleBack = React.useCallback(() => {
    navigate(menuPath);
  }, [menuPath, navigate]);

  const handleContinue = React.useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const account = isLoggedInEffective && isEditMode
        ? await updateProfile({
            username: registerForm.name,
            phone: registerPhone,
            email: registerForm.email,
            address: registerForm.address,
          })
        : isLoggedInEffective
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
      setError(translateAuthError(nextError));
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
    isLoggedInEffective,
    register,
    registerForm.address,
    registerForm.email,
    registerForm.name,
    registerForm.password,
    registerPhone,
    savedPrefill?.address,
    storage,
    t,
    translateAuthError,
    updateProfile,
  ]);

  const actionDisabled = isLoggedInEffective && isEditMode
    ? loading || Boolean(profileErrors.name || profileErrors.phone || profileErrors.email || profileErrors.address)
    : isLoggedInEffective
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
      showHeaderIndicator={false}
      actionLabel={
        loading
          ? t("Saving...")
          : isLoggedInEffective && isEditMode
          ? t("Save changes")
          : t("Continue to Booking")
      }
      actionHelper={t("Secure this booking with your saved profile.")}
      onAction={handleContinue}
      actionDisabled={actionDisabled}
    >
      <BookingSection
        step={1}
        title={isLoggedInEffective ? (isEditMode ? t("Profile") : t("Registered User")) : t("Account")}
        description={isLoggedInEffective && !isEditMode ? "" : t("Create your booking profile")}
      >
        {isLoggedInEffective && !isEditMode ? (
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
            {!isLoggedInEffective ? (
              <div className="inline-flex rounded-full border border-neutral-200 bg-white p-1 dark:border-neutral-800 dark:bg-neutral-950">
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "register"
                      ? ""
                      : "text-neutral-600 dark:text-neutral-300",
                  ].join(" ")}
                  style={mode === "register" ? selectedPillStyle : undefined}
                >
                  {t("Register")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    mode === "login"
                      ? ""
                      : "text-neutral-600 dark:text-neutral-300",
                  ].join(" ")}
                  style={mode === "login" ? selectedPillStyle : undefined}
                >
                  {t("Login")}
                </button>
              </div>
            ) : null}

            {!isLoggedInEffective && mode === "login" ? (
              <div className="grid gap-4">
                <Field label={t("Phone or Email")} error={loginErrors.login}>
                  <input
                    type="text"
                    value={loginForm.login}
                    onChange={(event) =>
                      setLoginForm((prev) => ({ ...prev, login: event.target.value }))
                    }
                    placeholder={t("Phone number or email")}
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
                <Field label={t("Email (optional)")} error={profileErrors.email}>
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                  />
                </Field>
                {!isLoggedInEffective ? (
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
                  <Field label={t("Address (optional)")} error={profileErrors.address}>
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
                  ? ""
                  : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
              ].join(" ")}
              style={
                paymentForm.payment_method === "bank_transfer" ? selectedPillStyle : undefined
              }
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
                  ? ""
                  : "border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100",
              ].join(" ")}
              style={
                paymentForm.payment_method === "credit_card" ? selectedPillStyle : undefined
              }
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
