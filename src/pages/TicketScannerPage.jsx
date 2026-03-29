import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  QrCode,
  RefreshCw,
  ScanLine,
  Ticket,
  UserCheck,
  UserRound,
  AlertTriangle,
} from "lucide-react";
import {
  checkInGuestTicket,
  extractGuestQrToken,
  lookupGuestTicketQr,
} from "../utils/guestTicketQr";

const READER_ELEMENT_ID = "guest-ticket-qr-reader";
const STATE_IDLE = "idle";
const STATE_SCANNING = "scanning";
const STATE_GUEST_FOUND = "guest_found";
const STATE_SUCCESS = "success";
const STATE_INVALID_QR = "invalid_qr";
const STATE_ALREADY_CHECKED_IN = "already_checked_in";
const STATE_BOOKING_NOT_FOUND = "booking_not_found";

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 border-b border-slate-200/70 py-3 last:border-b-0 dark:border-slate-800/80 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 sm:text-sm sm:font-medium sm:normal-case sm:tracking-normal">
        {label}
      </span>
      <span className="w-full text-left text-sm font-semibold text-slate-900 dark:text-slate-100 sm:w-auto sm:text-right">
        {value}
      </span>
    </div>
  );
}

export default function TicketScannerPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const scannerRef = useRef(null);
  const scanLockRef = useRef(false);

  const [scanState, setScanState] = useState(STATE_IDLE);
  const [scanResult, setScanResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [cameraMessage, setCameraMessage] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (error) {
      console.warn("⚠️ Failed to stop ticket scanner:", error);
    }

    try {
      await scanner.clear();
    } catch (error) {
      console.warn("⚠️ Failed to clear ticket scanner:", error);
    }
  }, []);

  const applyLookupError = useCallback((error) => {
    const nextState = error?.scanState || STATE_INVALID_QR;
    const fallbackMessage =
      nextState === STATE_BOOKING_NOT_FOUND ? t("Booking Not Found") : t("Invalid QR");
    setScanResult(null);
    setScanState(nextState);
    setStatusMessage(error?.message || fallbackMessage);
  }, [t]);

  const handleDecodedText = useCallback(
    async (decodedText) => {
      if (scanLockRef.current) return;
      scanLockRef.current = true;

      await stopScanner();

      const token = extractGuestQrToken(decodedText);
      if (!token) {
        setStatusMessage(t("Invalid QR"));
        setScanResult(null);
        setScanState(STATE_INVALID_QR);
        scanLockRef.current = false;
        return;
      }

      try {
        const result = await lookupGuestTicketQr(token);
        setScanResult(result);
        setStatusMessage("");
        setScanState(result.alreadyCheckedIn ? STATE_ALREADY_CHECKED_IN : STATE_GUEST_FOUND);
      } catch (error) {
        applyLookupError(error);
      } finally {
        scanLockRef.current = false;
      }
    },
    [applyLookupError, stopScanner, t]
  );

  const startScanner = useCallback(async () => {
    await stopScanner();
    setScanResult(null);
    setStatusMessage("");
    setCameraMessage("");
    setScanState(STATE_SCANNING);

    try {
      const scanner = new Html5Qrcode(READER_ELEMENT_ID);
      scannerRef.current = scanner;
      const isCompactViewport = viewportWidth < 640;
      const mobileBoxSize = Math.max(180, Math.min(viewportWidth - 88, 260));
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: isCompactViewport
            ? { width: mobileBoxSize, height: mobileBoxSize }
            : { width: 250, height: 250 },
          aspectRatio: isCompactViewport ? 1 : 1.3333333,
          rememberLastUsedCamera: true,
        },
        (decodedText) => {
          void handleDecodedText(decodedText);
        },
        () => {}
      );
    } catch (error) {
      console.error("❌ Failed to start ticket scanner:", error);
      setScanState(STATE_IDLE);
      setCameraMessage(error?.message || t("Invalid QR"));
    }
  }, [handleDecodedText, stopScanner, t, viewportWidth]);

  useEffect(() => {
    void startScanner();
    return () => {
      void stopScanner();
    };
  }, [startScanner, stopScanner]);

  const handleCheckIn = useCallback(async () => {
    if (!scanResult?.canCheckIn || !scanResult?.checkInTarget || isCheckingIn) {
      return;
    }

    setIsCheckingIn(true);
    try {
      await checkInGuestTicket(scanResult);
      const nextStatusLabel = "checked_in";
      setScanResult((prev) =>
        prev
          ? {
              ...prev,
              alreadyCheckedIn: true,
              canCheckIn: false,
              status: nextStatusLabel,
              statusLabel: nextStatusLabel,
            }
          : prev
      );
      setStatusMessage(t("Check-in Successful"));
      setScanState(STATE_SUCCESS);
      toast.success(t("Check-in Successful"));
    } catch (error) {
      if (error?.scanState === STATE_BOOKING_NOT_FOUND) {
        setScanState(STATE_BOOKING_NOT_FOUND);
        setStatusMessage(error?.message || t("Booking Not Found"));
        setScanResult(null);
      } else if (error?.code === "concert_booking_unconfirmed") {
        setScanState(STATE_GUEST_FOUND);
        setStatusMessage(error?.message || "");
      } else {
        setScanState(STATE_INVALID_QR);
        setStatusMessage(error?.message || t("Invalid QR"));
      }
    } finally {
      setIsCheckingIn(false);
    }
  }, [isCheckingIn, scanResult, t]);

  const stateConfig = useMemo(() => {
    switch (scanState) {
      case STATE_SCANNING:
        return {
          badgeClass:
            "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/80 dark:bg-sky-950/40 dark:text-sky-300",
          icon: <ScanLine className="h-5 w-5" />,
          label: t("Scanning..."),
        };
      case STATE_SUCCESS:
        return {
          badgeClass:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/40 dark:text-emerald-300",
          icon: <CheckCircle2 className="h-5 w-5" />,
          label: t("Check-in Successful"),
        };
      case STATE_ALREADY_CHECKED_IN:
        return {
          badgeClass:
            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/40 dark:text-amber-300",
          icon: <UserCheck className="h-5 w-5" />,
          label: t("Already Checked In"),
        };
      case STATE_BOOKING_NOT_FOUND:
        return {
          badgeClass:
            "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300",
          icon: <AlertTriangle className="h-5 w-5" />,
          label: t("Booking Not Found"),
        };
      case STATE_INVALID_QR:
        return {
          badgeClass:
            "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300",
          icon: <QrCode className="h-5 w-5" />,
          label: t("Invalid QR"),
        };
      case STATE_GUEST_FOUND:
        return {
          badgeClass:
            "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/80 dark:bg-violet-950/40 dark:text-violet-300",
          icon: <Ticket className="h-5 w-5" />,
          label: t("Guest Found"),
        };
      case STATE_IDLE:
      default:
        return {
          badgeClass:
            "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300",
          icon: <QrCode className="h-5 w-5" />,
          label: t("Scan Ticket"),
        };
    }
  }, [scanState, t]);

  const showCheckInButton = Boolean(
    scanResult?.canCheckIn && !scanResult?.alreadyCheckedIn && scanState !== STATE_SUCCESS
  );
  const scannerOverlaySizeClass = viewportWidth < 640 ? "h-44 w-44 rounded-[28px]" : "h-56 w-56 rounded-[36px]";

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-3 py-3 pb-8 sm:p-6 lg:p-8 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-4 rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:rounded-[28px] sm:p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("Back")}
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                {t("Scan Ticket")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t("Scan reservation or concert ticket QR")}
              </p>
            </div>
          </div>

          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${stateConfig.badgeClass}`}
          >
            {stateConfig.icon}
            <span>{stateConfig.label}</span>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:gap-6">
          <section className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:rounded-[28px] sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("Scan QR")}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("Scan reservation or concert ticket QR")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void startScanner();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800 sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" />
                {t("Scan QR")}
              </button>
            </div>

            <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950 shadow-inner dark:border-slate-800">
              <div id={READER_ELEMENT_ID} className="min-h-[300px] w-full sm:min-h-[380px]" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`${scannerOverlaySizeClass} border-2 border-white/70 shadow-[0_0_0_999px_rgba(2,6,23,0.32)]`}
                >
                  <div className="h-full w-full animate-pulse rounded-[inherit] border border-sky-300/80" />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {scanState === STATE_SCANNING ? t("Scanning...") : t("Scan reservation or concert ticket QR")}
            </div>

            {cameraMessage ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300">
                {cameraMessage}
              </div>
            ) : null}
          </section>

          <aside className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:rounded-[28px] sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                {scanState === STATE_SUCCESS ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : scanState === STATE_ALREADY_CHECKED_IN ? (
                  <UserCheck className="h-6 w-6" />
                ) : scanState === STATE_BOOKING_NOT_FOUND || scanState === STATE_INVALID_QR ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <ScanLine className="h-6 w-6" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {scanResult ? t("Guest Found") : t("Scan Ticket")}
                </h2>
                <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {statusMessage || t("Scan reservation or concert ticket QR")}
                </p>
              </div>
            </div>

            {scanResult ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        <UserRound className="h-4 w-4" />
                        <span>{t("Guest Found")}</span>
                      </div>
                      <h3 className="mt-2 break-words text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                        {scanResult.guestName || "-"}
                      </h3>
                    </div>
                    <div className="w-fit rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {t(scanResult.bookingTypeLabelKey)}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
                  <DetailRow label={t("Type")} value={t(scanResult.bookingTypeLabelKey)} />
                  <DetailRow label={t("Table")} value={scanResult.tableNumber ? String(scanResult.tableNumber) : ""} />
                  <DetailRow label={t("Date")} value={scanResult.date} />
                  <DetailRow label={t("Status")} value={scanResult.statusLabel || scanResult.status} />
                  <DetailRow label={t("Concert")} value={scanResult.concertLabel} />
                  <DetailRow label={t("Quantity")} value={scanResult.quantity ? String(scanResult.quantity) : ""} />
                  <DetailRow label={t("Type")} value={scanResult.ticketTypeName} />
                  <DetailRow label={t("Time")} value={scanResult.time} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <CalendarDays className="h-4 w-4" />
                      {t("Date")}
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                      {scanResult.date || "-"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <Clock3 className="h-4 w-4" />
                      {t("Time")}
                    </div>
                    <div className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                      {scanResult.time || "-"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
                  <ScanLine className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
                  {t("Scan QR")}
                </h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {statusMessage || t("Scan reservation or concert ticket QR")}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {showCheckInButton ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleCheckIn();
                  }}
                  disabled={isCheckingIn}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 sm:w-auto"
                >
                  <UserCheck className="h-4 w-4" />
                  {isCheckingIn ? t("Scanning...") : t("Check In")}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  void startScanner();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 sm:w-auto"
              >
                <ScanLine className="h-4 w-4" />
                {t("Scan QR")}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
