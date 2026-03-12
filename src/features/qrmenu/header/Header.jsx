import React from "react";
import HeaderTabs from "./HeaderTabs";
import HeaderInfo from "./HeaderInfo";

function Header({
  isDark = false,
  isDrawerOpen = false,
  onOpenDrawer,
  onSelect,
  reservationEnabled = true,
  tableEnabled = true,
  deliveryEnabled = true,
  activeOrderType = "takeaway",
  statusShortcutCount = 0,
  statusShortcutEnabled = false,
  statusShortcutOpen = false,
  onStatusShortcutClick,
  restaurantName,
  tagline,
  t,
  openStatus,
  showShopHoursDropdown,
  onToggleShopHoursDropdown,
  onCloseShopHoursDropdown,
  days,
  todayName,
  shopHours,
  loadingShopHours,
  shopHoursDropdownRef,
  languageControl,
  showInfo = true,
}) {
  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 border-b backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] ${
          isDark
            ? "border-white/10 bg-neutral-950/76"
            : "border-white/60 bg-white/70"
        }`}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-3">
          <HeaderTabs
            isDark={isDark}
            isDrawerOpen={isDrawerOpen}
            onOpenDrawer={onOpenDrawer}
            onSelect={onSelect}
            reservationEnabled={reservationEnabled}
            tableEnabled={tableEnabled}
            deliveryEnabled={deliveryEnabled}
            activeOrderType={activeOrderType}
            statusShortcutCount={statusShortcutCount}
            statusShortcutEnabled={statusShortcutEnabled}
            statusShortcutOpen={statusShortcutOpen}
            onStatusShortcutClick={onStatusShortcutClick}
            t={t}
          />
        </div>
      </header>

      <div className="h-[74px] sm:h-[80px]" aria-hidden="true" />

      {showInfo ? (
        <HeaderInfo
          restaurantName={restaurantName}
          tagline={tagline}
          t={t}
          openStatus={openStatus}
          showShopHoursDropdown={showShopHoursDropdown}
          onToggleShopHoursDropdown={onToggleShopHoursDropdown}
          onCloseShopHoursDropdown={onCloseShopHoursDropdown}
          days={days}
          todayName={todayName}
          shopHours={shopHours}
          loadingShopHours={loadingShopHours}
          shopHoursDropdownRef={shopHoursDropdownRef}
          languageControl={languageControl}
        />
      ) : null}
    </>
  );
}

export default React.memo(Header);
