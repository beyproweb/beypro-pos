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
  children,
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),_transparent_42%),linear-gradient(180deg,_#fafaf9_0%,_#f4f4f5_100%)] dark:bg-[linear-gradient(180deg,_#09090b_0%,_#111827_100%)]">
      <MobileStickyHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        accentColor={accentColor}
        showIndicator={showHeaderIndicator}
      />
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 pb-28">
        {children}
      </main>
      <MobileStickyActionBar
        label={actionLabel}
        onClick={onAction}
        disabled={actionDisabled}
        helper={actionHelper}
        accentColor={accentColor}
      />
    </div>
  );
}
