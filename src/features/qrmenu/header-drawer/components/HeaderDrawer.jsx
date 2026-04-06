import React from "react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  CircleUserRound,
  ClipboardList,
  House,
  LifeBuoy,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import secureFetch from "../../../../utils/secureFetch";
import DrawerItem from "./DrawerItem";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import ProfilePage from "../pages/ProfilePage";
import OrdersPage from "../pages/OrdersPage";
import useCustomerAuth from "../hooks/useCustomerAuth";
import { fetchCustomerOrders } from "../services/customerService";

const VIEW_MENU = "menu";
const VIEW_LOGIN = "login";
const VIEW_REGISTER = "register";
const VIEW_PROFILE = "profile";
const VIEW_ORDERS = "orders";

function HeaderDrawer({
  isOpen,
  onClose,
  t,
  appendIdentifier,
  isDark = false,
  accentColor = "#111827",
  initialView = VIEW_MENU,
  openStatus = null,
  days = [],
  todayName = "",
  shopHours = {},
  loadingShopHours = false,
  languageControl = null,
  hasOrderStatus = false,
  onOpenOrderStatus = null,
  onRequestAuthView = null,
  onOpenMarketplace = null,
}) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const fetcher = React.useCallback(
    async (path, options = undefined) => {
      const withIdentifier = typeof appendIdentifier === "function" ? appendIdentifier(path) : path;
      return secureFetch(withIdentifier, options);
    },
    [appendIdentifier]
  );
  const { customer, isLoggedIn, login, loginWithApple, loginWithGoogle, register, logout, updateProfile } = useCustomerAuth(storage, {
    fetcher,
  });

  const [view, setView] = React.useState(VIEW_MENU);
  const [orders, setOrders] = React.useState([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [ordersError, setOrdersError] = React.useState("");
  const [showShopHoursDropdown, setShowShopHoursDropdown] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setView(VIEW_MENU);
      setOrdersError("");
      setShowShopHoursDropdown(false);
      return;
    }
    setView(initialView || VIEW_MENU);
    setOrdersError("");
  }, [initialView, isOpen]);

  React.useEffect(() => {
    if (view !== VIEW_MENU) {
      setShowShopHoursDropdown(false);
    }
  }, [view]);

  const openAuthView = React.useCallback(
    (nextView = VIEW_LOGIN) => {
      if (typeof onRequestAuthView === "function") {
        onRequestAuthView(nextView);
        return;
      }
      setView(nextView);
    },
    [onRequestAuthView]
  );

  const loadOrders = React.useCallback(async () => {
    if (!isLoggedIn || !customer) {
      setOrders([]);
      return;
    }

    setOrdersLoading(true);
    setOrdersError("");
    try {
      const next = await fetchCustomerOrders({ customer, fetcher, storage });
      setOrders(next);
    } catch (err) {
      setOrdersError(err?.message || "Failed to load orders");
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [customer, fetcher, isLoggedIn, storage]);

  React.useEffect(() => {
    if (isOpen && view === VIEW_ORDERS) {
      loadOrders();
    }
  }, [isOpen, loadOrders, view]);

  const onOpenOrders = () => {
    if (!isLoggedIn) {
      openAuthView(VIEW_LOGIN);
      return;
    }
    setView(VIEW_ORDERS);
  };

  const handleOpenOrderStatus = () => {
    if (typeof onOpenOrderStatus === "function") {
      const opened = onOpenOrderStatus();
      if (opened !== false) {
        onClose?.();
        return;
      }
    }

    if (isLoggedIn) {
      setView(VIEW_ORDERS);
      return;
    }

    openAuthView(VIEW_LOGIN);
  };

  const handleOpenMarketplace = React.useCallback(() => {
    if (typeof onOpenMarketplace === "function") {
      onOpenMarketplace();
    }
    onClose?.();
  }, [onClose, onOpenMarketplace]);

  const onOpenProfile = () => {
    if (!isLoggedIn) {
      openAuthView(VIEW_LOGIN);
      return;
    }
    setView(VIEW_PROFILE);
  };

  const onLogin = async (payload) => {
    await login(payload);
    setView(VIEW_MENU);
    onClose?.();
  };

  const onRegister = async (payload) => {
    await register(payload);
    setView(VIEW_PROFILE);
  };

  const onGoogleAuth = async () => {
    await loginWithGoogle({
      returnTo: typeof window !== "undefined" ? window.location.href : "",
    });
  };

  const onAppleAuth = async () => {
    await loginWithApple({
      returnTo: typeof window !== "undefined" ? window.location.href : "",
    });
  };

  const onProfileSave = async (payload) => {
    await updateProfile(payload);
  };

  const onLogout = () => {
    logout();
    setOrders([]);
    setView(VIEW_MENU);
  };

  const isSubPage = view !== VIEW_MENU;
  const currentTitle =
    view === VIEW_ORDERS
      ? t("My Orders")
      : view === VIEW_PROFILE
      ? t("My Profile")
      : view === VIEW_REGISTER
      ? t("Register")
      : view === VIEW_LOGIN
      ? t("Login / Register")
      : t("Menu");

  const menuContent = (
    <div className="h-full flex flex-col">
      {typeof onOpenMarketplace === "function" ? (
        <div className="px-4 pt-4 pb-3">
          <DrawerItem
            icon={House}
            label={t("Home")}
            description={t("Back to marketplace")}
            onClick={handleOpenMarketplace}
          />
        </div>
      ) : null}

      <div className="px-4 py-4 border-b border-gray-200 dark:border-neutral-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100 truncate">
              {isLoggedIn ? customer?.username || customer?.email : t("Guest")}
            </div>
            <div className="text-xs text-gray-500 dark:text-neutral-400 truncate">
              {isLoggedIn ? customer?.phone || customer?.email : t("Login to sync profile and orders")}
            </div>
          </div>

          {/* Keep Shop Hours aligned to the right on the same row as guest identity. */}
          {Array.isArray(days) && days.length > 0 ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowShopHoursDropdown((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200/90 bg-transparent px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                aria-label={t("Shop Hours")}
                title={t("Shop Hours")}
              >
                <span>{t("Shop Hours")}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    showShopHoursDropdown ? "rotate-180" : ""
                  }`}
                />
              </button>

              {showShopHoursDropdown ? (
                <div className="absolute right-0 z-10 mt-2 w-[min(76vw,280px)] rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-neutral-100">
                      {t("Shop Hours")}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowShopHoursDropdown(false)}
                      className="text-lg leading-none text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200"
                      aria-label={t("Close")}
                    >
                      ×
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1">
                    {days.map((day) => {
                      const isToday = day === todayName;
                      const open = shopHours?.[day]?.open || "";
                      const close = shopHours?.[day]?.close || "";
                      const enabled = shopHours?.[day]?.enabled !== false;
                      const hasHours = enabled && Boolean(open && close);

                      return (
                        <div
                          key={day}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
                            isToday
                              ? "border border-indigo-100 bg-indigo-50 text-indigo-800 dark:border-indigo-900/30 dark:bg-indigo-950/30 dark:text-indigo-200"
                              : "bg-gray-50/80 text-gray-700 dark:bg-neutral-900/40 dark:text-neutral-200"
                          }`}
                        >
                          <span className="font-semibold">{t(day)}</span>
                          <span className="font-mono text-xs">
                            {loadingShopHours ? "…" : hasHours ? `${open} - ${close}` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        <DrawerItem
          icon={Bell}
          label={t("Order Status")}
          description={hasOrderStatus ? t("Track your current order") : t("Open your latest order details")}
          onClick={handleOpenOrderStatus}
        />
        <DrawerItem
          icon={ClipboardList}
          label={t("My Orders")}
          description={t("Active and past orders")}
          onClick={onOpenOrders}
        />
        <DrawerItem
          icon={UserRound}
          label={t("My Profile")}
          description={t("Saved checkout details")}
          onClick={onOpenProfile}
        />

        <DrawerItem
          icon={LifeBuoy}
          label={t("Support / Contact")}
          description={t("Contact support for help")}
          onClick={() => window.alert(t("Support section will be available soon."))}
        />

        {isLoggedIn ? (
          <DrawerItem
            icon={LogOut}
            label={t("Logout")}
            description={t("Sign out from this device")}
            onClick={onLogout}
            danger
          />
        ) : (
          <DrawerItem
            icon={LogIn}
            label={t("Login / Register")}
            description={t("Access your account")}
            onClick={() => openAuthView(VIEW_LOGIN)}
          />
        )}

      </div>

      {languageControl ? (
        <div className="relative z-20 px-3 pb-3 pt-2 border-t border-gray-100 dark:border-neutral-800 flex justify-center">
          {languageControl}
        </div>
      ) : null}

    </div>
  );

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    <>
      <div
        onClick={handleBackdropClick}
        className={`fixed inset-0 z-[120] bg-black/20 transition-opacity duration-200 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 left-0 z-[121] h-full w-[min(92vw,360px)] border-r border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl transition-transform duration-200 will-change-transform ${
          isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={t("Header drawer")}
      >
        <div className="h-14 border-b border-gray-100 dark:border-neutral-800 px-3 flex items-center justify-between">
          {isSubPage ? (
            <button
              type="button"
              onClick={() => setView(VIEW_MENU)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition ${
                isDark
                  ? "text-neutral-200 hover:bg-neutral-800"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{t("Back")}</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-gray-700 dark:text-neutral-200">
              <CircleUserRound className="w-4 h-4" />
              <span className="text-sm font-semibold">{t("Menu")}</span>
            </div>
          )}
          {isSubPage ? (
            <div className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-gray-900 dark:text-neutral-100 pointer-events-none">
              {currentTitle}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            {!isSubPage ? (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  openStatus?.isOpen
                    ? "border-emerald-200/80 bg-emerald-50/90 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/25 dark:text-emerald-200"
                    : "border-rose-200/80 bg-rose-50/90 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/25 dark:text-rose-200"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    openStatus?.isOpen ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span>{openStatus?.label || t("Closed")}</span>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className={`w-9 h-9 rounded-full transition ${
                isDark
                  ? "text-neutral-300 bg-neutral-800 hover:bg-neutral-700"
                  : "text-gray-500 bg-gray-100 hover:bg-gray-200"
              }`}
            >
              ×
            </button>
          </div>
        </div>

        <div className="h-[calc(100%-56px)] overflow-hidden">
          {view === VIEW_MENU ? menuContent : null}
          {view === VIEW_LOGIN ? (
            <LoginPage
              t={t}
              onLogin={onLogin}
              onGoogleLogin={onGoogleAuth}
              onAppleLogin={onAppleAuth}
              onQrLogin={() => {
                setView(VIEW_MENU);
                onClose?.();
              }}
              onGoRegister={() => setView(VIEW_REGISTER)}
              onBack={() => setView(VIEW_MENU)}
              accentColor={accentColor}
            />
          ) : null}
          {view === VIEW_REGISTER ? (
            <RegisterPage
              t={t}
              onRegister={onRegister}
              onGoogleLogin={onGoogleAuth}
              onAppleLogin={onAppleAuth}
              onGoLogin={() => setView(VIEW_LOGIN)}
              onBack={() => setView(VIEW_MENU)}
              accentColor={accentColor}
            />
          ) : null}
          {view === VIEW_PROFILE ? (
            <ProfilePage
              t={t}
              customer={customer}
              onSave={onProfileSave}
              onBack={() => setView(VIEW_MENU)}
            />
          ) : null}
          {view === VIEW_ORDERS ? (
            <OrdersPage
              t={t}
              orders={orders}
              loading={ordersLoading}
              error={ordersError}
              onRefresh={loadOrders}
              onBack={() => setView(VIEW_MENU)}
            />
          ) : null}
        </div>
      </aside>
    </>
  );
}

export default React.memo(HeaderDrawer);
