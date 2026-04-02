import React from "react";

export default function IosInstallPrompt({
  open,
  isInAppBrowser = false,
  onDismiss,
  onDontShowAgain,
}) {
  if (!open) return null;

  return (
    <div className="ios-install-prompt pointer-events-none fixed inset-x-0 bottom-0 z-[1200] px-3 sm:px-4">
      <div className="pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-slate-200/85 bg-white/95 shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur-md">
        <div className="p-4">
          <p className="text-sm font-semibold leading-5 text-slate-900">
            {isInAppBrowser
              ? "Open in Safari to install the app."
              : "For best experience, open in Safari and tap Share > Add to Home Screen."}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={onDontShowAgain}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
