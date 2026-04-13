import React from "react";
import MobileStickyHeader from "./MobileStickyHeader";
import MobileStickyActionBar from "./MobileStickyActionBar";

export default function BookingPageLayout({
  title,
  subtitle = "",
  onBack,
  accentColor = "#111827",
  showHeaderIndicator = true,
  actionLabel,
  actionHelper = "",
  onAction,
  actionDisabled = false,
  compactMobile = false,
  children,
}) {
  return (
    <div
      className={[
        "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_42%),linear-gradient(180deg,_#fafaf9_0%,_#f4f4f5_100%)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)]",
        compactMobile ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden" : "min-h-screen",
      ].join(" ")}
    >
      <MobileStickyHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        accentColor={accentColor}
        showIndicator={showHeaderIndicator}
      />
      <main
        className={[
          "mx-auto flex w-full max-w-none flex-col gap-0 px-0 py-0 sm:max-w-3xl sm:gap-4 sm:px-4 sm:py-4",
          compactMobile ? "min-h-0 flex-1 overflow-y-auto" : "pb-28",
        ].join(" ")}
      >
        {children}
      </main>
      <MobileStickyActionBar
        label={actionLabel}
        onClick={onAction}
        disabled={actionDisabled}
        helper={actionHelper}
        accentColor={accentColor}
        compactMobile={compactMobile}
      />
    </div>
  );
}
