import React from "react";
import {
  CircleUserRound,
  ClipboardList,
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

function HeaderDrawer({ isOpen, onClose, t, appendIdentifier, isDark = false }) {
  const storage = typeof window !== "undefined" ? window.localStorage : null;
  const { customer, isLoggedIn, login, register, logout, updateProfile } = useCustomerAuth(storage);

  const [view, setView] = React.useState(VIEW_MENU);
  const [orders, setOrders] = React.useState([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [ordersError, setOrdersError] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      setView(VIEW_MENU);
      setOrdersError("");
    }
  }, [isOpen]);

  const fetcher = React.useCallback(
    async (path) => {
      const withIdentifier = typeof appendIdentifier === "function" ? appendIdentifier(path) : path;
      return secureFetch(withIdentifier);
    },
    [appendIdentifier]
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
      setView(VIEW_LOGIN);
      return;
    }
    setView(VIEW_ORDERS);
  };

  const onOpenProfile = () => {
    if (!isLoggedIn) {
      setView(VIEW_LOGIN);
      return;
    }
    setView(VIEW_PROFILE);
  };

  const onLogin = async (payload) => {
    await login(payload);
    setView(VIEW_MENU);
  };

  const onRegister = async (payload) => {
    await register(payload);
    setView(VIEW_PROFILE);
  };

  const onProfileSave = async (payload) => {
    await updateProfile(payload);
  };

  const onLogout = () => {
    logout();
    setOrders([]);
    setView(VIEW_MENU);
  };

  const menuContent = (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200 dark:border-neutral-800">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-neutral-400">QR Menu</div>
        <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-neutral-100">
          {isLoggedIn ? customer?.username || customer?.email : "Guest"}
        </div>
        <div className="text-xs text-gray-500 dark:text-neutral-400">
          {isLoggedIn ? customer?.email : "Login to sync profile and orders"}
        </div>
      </div>

      <div className="p-3 space-y-2 overflow-y-auto">
        <DrawerItem
          icon={ClipboardList}
          label={t("My Orders")}
          description="Active and past orders"
          onClick={onOpenOrders}
        />
        <DrawerItem
          icon={UserRound}
          label={t("My Profile")}
          description="Saved checkout details"
          onClick={onOpenProfile}
        />

        {isLoggedIn ? (
          <DrawerItem
            icon={LogOut}
            label="Logout"
            description="Sign out from this device"
            onClick={onLogout}
            danger
          />
        ) : (
          <DrawerItem
            icon={LogIn}
            label={t("Login / Register")}
            description="Access your account"
            onClick={() => setView(VIEW_LOGIN)}
          />
        )}

        <DrawerItem
          icon={LifeBuoy}
          label="Support / Contact"
          description="Placeholder"
          onClick={() => window.alert("Support section will be available soon.")}
        />
      </div>
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
        aria-label="Header drawer"
      >
        <div className="h-14 border-b border-gray-100 dark:border-neutral-800 px-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-700 dark:text-neutral-200">
            <CircleUserRound className="w-4 h-4" />
            <span className="text-sm font-semibold">Menu</span>
          </div>
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

        <div className="h-[calc(100%-56px)] overflow-hidden">
          {view === VIEW_MENU ? menuContent : null}
          {view === VIEW_LOGIN ? (
            <LoginPage
              t={t}
              onLogin={onLogin}
              onGoRegister={() => setView(VIEW_REGISTER)}
              onBack={() => setView(VIEW_MENU)}
            />
          ) : null}
          {view === VIEW_REGISTER ? (
            <RegisterPage
              t={t}
              onRegister={onRegister}
              onGoLogin={() => setView(VIEW_LOGIN)}
              onBack={() => setView(VIEW_MENU)}
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
