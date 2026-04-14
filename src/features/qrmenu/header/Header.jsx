import React from "react";
import HeaderTabs from "./HeaderTabs";
import HeaderInfo from "./HeaderInfo";

function Header({
  isDark = false,
  isDrawerOpen = false,
  onOpenDrawer,
  onSelect,
  menuEnabled = true,
  reservationEnabled = true,
  tableEnabled = true,
  deliveryEnabled = true,
  requestSongEnabled = false,
  activeOrderType = "takeaway",
  statusShortcutCount = 0,
  statusShortcutEnabled = false,
  statusShortcutOpen = false,
  onStatusShortcutClick,
  restaurantName,
  mainTitleLogo,
  tagline,
  accentColor = "#111827",
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
  onOpenMarketplace,
}) {
  const [showCompactBranding, setShowCompactBranding] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleScroll = () => {
      setShowCompactBranding(window.scrollY > 28);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
            menuEnabled={menuEnabled}
            reservationEnabled={reservationEnabled}
            tableEnabled={tableEnabled}
            deliveryEnabled={deliveryEnabled}
            requestSongEnabled={requestSongEnabled}
            activeOrderType={activeOrderType}
            statusShortcutCount={statusShortcutCount}
            statusShortcutEnabled={statusShortcutEnabled}
            statusShortcutOpen={statusShortcutOpen}
            onStatusShortcutClick={onStatusShortcutClick}
            restaurantName={restaurantName}
            mainTitleLogo={mainTitleLogo}
            showCompactBranding={showCompactBranding}
            layout="toolbar"
            accentColor={accentColor}
            t={t}
            onOpenMarketplace={onOpenMarketplace}
            languageControl={languageControl}
          />
        </div>
      </header>

      <div className="h-[70px] sm:h-[76px]" aria-hidden="true" />

      {showInfo ? (
        <HeaderInfo
          isDark={isDark}
          isDrawerOpen={isDrawerOpen}
          onOpenDrawer={onOpenDrawer}
          onSelect={onSelect}
          menuEnabled={menuEnabled}
          reservationEnabled={reservationEnabled}
          tableEnabled={tableEnabled}
          deliveryEnabled={deliveryEnabled}
          requestSongEnabled={requestSongEnabled}
          activeOrderType={activeOrderType}
          statusShortcutCount={statusShortcutCount}
          statusShortcutEnabled={statusShortcutEnabled}
          statusShortcutOpen={statusShortcutOpen}
          onStatusShortcutClick={onStatusShortcutClick}
          restaurantName={restaurantName}
          mainTitleLogo={mainTitleLogo}
          tagline={tagline}
          accentColor={accentColor}
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
          onOpenMarketplace={onOpenMarketplace}
        />
      ) : null}
    </>
  );
}

export default React.memo(Header);
