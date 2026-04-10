import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PHONE_API_REGEX,
  formatPhoneForInput,
  normalizePhoneForApi,
} from "../../../../utils/phone";

function normalizeHexColor(value, fallback) {
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

const OTP_LENGTH = 6;

export default function PhoneVerificationModal({
  open,
  t,
  accentColor = "#111827",
  initialPhone = "",
  flowLabel = "",
  requireVerification = false,
  onClose,
  onRequestOtp,
  onVerifyOtp,
  onVerified,
}) {
  const resolvedAccentColor = normalizeHexColor(accentColor, "#111827");
  const accentTextColor = getReadableTextColor(resolvedAccentColor);
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(Array(OTP_LENGTH).fill(""));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState(0);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [mockCode, setMockCode] = useState("");
  const otpInputRefs = useRef([]);
  const codeValue = useMemo(() => code.join(""), [code]);
  const normalizedPhone = useMemo(() => normalizePhoneForApi(phone), [phone]);
  const phoneValid = PHONE_API_REGEX.test(normalizedPhone);

  useEffect(() => {
    if (!open) return;
    setStep("phone");
    setPhone(formatPhoneForInput(initialPhone || ""));
    setCode(Array(OTP_LENGTH).fill(""));
    setResendCooldown(0);
    setExpiresIn(0);
    setInfoMessage("");
    setErrorMessage("");
    setMockCode("");
  }, [open, initialPhone]);

  useEffect(() => {
    if (!open) return undefined;
    const timerId = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [open]);

  useEffect(() => {
    if (!open || step !== "code") return;
    const firstEmptyIndex = code.findIndex((digit) => !digit);
    const targetIndex = firstEmptyIndex >= 0 ? firstEmptyIndex : OTP_LENGTH - 1;
    otpInputRefs.current[targetIndex]?.focus?.();
  }, [code, open, step]);

  const dismiss = () => {
    if (requireVerification) return;
    if (sending || verifying) return;
    onClose?.();
  };

  const handleSendOtp = async () => {
    if (!phoneValid || sending) return;
    setSending(true);
    setErrorMessage("");
    setInfoMessage("");
    setMockCode("");
    try {
      const response = await onRequestOtp?.({ phone: normalizedPhone });
      const retryAfterSeconds = Number(response?.retryAfterSeconds || 0) || 0;
      const expiresInSeconds = Number(response?.expiresInSeconds || 0) || 0;
      const verificationToken = String(response?.phoneVerificationToken || "").trim();
      const alreadyVerified = response?.alreadyVerified === true;
      if (alreadyVerified) {
        onVerified?.({
          phone: normalizedPhone,
          phoneVerificationToken: verificationToken,
          source: "already_verified",
        });
        return;
      }
      setStep("code");
      setCode(Array(OTP_LENGTH).fill(""));
      setResendCooldown(retryAfterSeconds);
      setExpiresIn(expiresInSeconds);
      setInfoMessage(
        response?.message ||
          t("Verification code sent. Please enter the 6-digit code.")
      );
      setMockCode(String(response?.mockCode || "").trim());
    } catch (err) {
      const message = String(err?.message || "").trim();
      setErrorMessage(message || t("Failed to send verification code."));
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || sending) return;
    await handleSendOtp();
  };

  const handleCodeChange = (index, value) => {
    const digit = String(value || "").replace(/\D/g, "").slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus?.();
    }
  };

  const handleCodeKeyDown = (index, event) => {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus?.();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      otpInputRefs.current[index - 1]?.focus?.();
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus?.();
    }
  };

  const handleCodePaste = (event) => {
    const pasted = String(event.clipboardData?.getData("text") || "")
      .replace(/\D/g, "")
      .slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH)
      .fill("")
      .map((_, idx) => pasted[idx] || "");
    setCode(next);
  };

  const handleVerify = async () => {
    if (verifying || codeValue.length !== OTP_LENGTH) return;
    setVerifying(true);
    setErrorMessage("");
    setInfoMessage("");
    try {
      const response = await onVerifyOtp?.({
        phone: normalizedPhone,
        code: codeValue,
      });
      if (response?.verified === false) {
        setErrorMessage(t("Invalid verification code."));
        return;
      }
      setStep("success");
      setInfoMessage(t("Phone verified successfully."));
      window.setTimeout(() => {
        onVerified?.({
          phone: normalizedPhone,
          phoneVerificationToken: String(response?.phoneVerificationToken || "").trim(),
          source: "otp_verified",
        });
      }, 420);
    } catch (err) {
      const message = String(err?.message || "").trim().toLowerCase();
      if (message.includes("expired")) {
        setErrorMessage(t("Verification code has expired."));
      } else if (
        message.includes("already linked") ||
        message.includes("already in use") ||
        message.includes("already used")
      ) {
        setErrorMessage(t("This phone number is already linked to another account."));
      } else if (message.includes("too many")) {
        setErrorMessage(t("Too many attempts. Please request a new code."));
      } else if (message.includes("invalid")) {
        setErrorMessage(t("Invalid verification code."));
      } else {
        setErrorMessage(String(err?.message || t("Failed to verify code.")));
      }
    } finally {
      setVerifying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1700] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="absolute inset-0" onClick={dismiss} />
      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-[0_16px_50px_rgba(0,0,0,0.16)] border border-neutral-200 p-5 sm:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {!requireVerification ? (
          <button
            type="button"
            onClick={dismiss}
            className="absolute right-4 top-4 w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 hover:text-red-600 hover:bg-red-50 transition"
            aria-label={t("Close")}
            disabled={sending || verifying}
          >
            ×
          </button>
        ) : null}

        <h2 className="text-xl sm:text-2xl font-semibold text-neutral-900 pr-8">
          {t("Phone Verification")}
        </h2>
        {flowLabel ? (
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
            {flowLabel}
          </p>
        ) : null}

        {step === "phone" ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-neutral-600">
              {t("Enter your phone number to receive a one-time verification code.")}
            </p>
            <input
              className={`w-full rounded-xl border px-4 py-3 text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 ${
                phoneValid || !phone
                  ? "border-neutral-300 focus:ring-neutral-200"
                  : "border-red-500 focus:ring-red-200"
              }`}
              placeholder={t("Phone (905555555555)")}
              value={phone}
              onChange={(event) => setPhone(formatPhoneForInput(event.target.value))}
              inputMode="tel"
              autoComplete="tel"
              disabled={sending}
            />
            {errorMessage ? (
              <p className="text-sm text-rose-600">{errorMessage}</p>
            ) : null}
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={!phoneValid || sending}
              className="w-full rounded-full py-3 text-base font-semibold transition disabled:opacity-55"
              style={{ backgroundColor: resolvedAccentColor, color: accentTextColor }}
            >
              {sending ? t("Sending...") : t("Send OTP")}
            </button>
          </div>
        ) : null}

        {step === "code" ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-neutral-600">
              {t("Enter the 6-digit code sent to your phone.")}
            </p>

            <div className="grid grid-cols-6 gap-2" onPaste={handleCodePaste}>
              {code.map((digit, index) => (
                <input
                  key={`otp-${index}`}
                  ref={(el) => {
                    otpInputRefs.current[index] = el;
                  }}
                  value={digit}
                  onChange={(event) => handleCodeChange(index, event.target.value)}
                  onKeyDown={(event) => handleCodeKeyDown(index, event)}
                  className="h-12 rounded-xl border border-neutral-300 text-center text-lg font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  disabled={verifying}
                />
              ))}
            </div>

            {infoMessage ? <p className="text-sm text-emerald-600">{infoMessage}</p> : null}
            {mockCode ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t("Dev OTP")}: {mockCode}
              </p>
            ) : null}
            {errorMessage ? <p className="text-sm text-rose-600">{errorMessage}</p> : null}

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {expiresIn > 0
                  ? `${t("Code expires in")} ${expiresIn}s`
                  : t("Code may have expired.")}
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || sending || verifying}
                className="font-semibold text-neutral-700 disabled:text-neutral-400"
              >
                {resendCooldown > 0
                  ? `${t("Resend")} (${resendCooldown}s)`
                  : t("Resend code")}
              </button>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={codeValue.length !== OTP_LENGTH || verifying}
              className="w-full rounded-full py-3 text-base font-semibold transition disabled:opacity-55"
              style={{ backgroundColor: resolvedAccentColor, color: accentTextColor }}
            >
              {verifying ? t("Verifying...") : t("Verify")}
            </button>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
              <p className="text-sm font-semibold text-emerald-700">
                {t("Phone verified successfully.")}
              </p>
              <p className="mt-1 text-xs text-emerald-700/80">
                {t("Continuing to checkout...")}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
