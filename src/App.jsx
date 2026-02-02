// src/App.jsx

import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { SessionLockProvider } from "./context/SessionLockContext";
import SessionLockOverlay from "./components/SessionLockOverlay";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Kitchen from "./pages/KitchenNew";
import Suppliers from "./pages/Suppliers";
import Stock from "./pages/Stock";
import TableOverview from "./pages/TableOverview";
import TransactionScreen from "./pages/TransactionScreen";
import Reports from "./pages/Reports";
import Staff from "./pages/Staff";
import IngredientPrices from "./pages/IngredientPrices";
import LiveRouteMap from "./components/LiveRouteMap";
import SettingsPage from "./components/Settings";
import Production from "./components/Production";
import LoginScreenWrapper from "./components/LoginScreen";
import StaffPINLogin from "./components/StaffPINLogin";
import SubscriptionTab from "./components/settings-tabs/SubscriptionTab";
import AppearanceProvider from "./components/AppearanceProvider";
import Task from "./pages/Task";
import ExpensesPage from "./components/ExpensesPage";
import CashRegisterHistory from "./pages/CashRegisterHistory";
import IntegrationsPage from "./pages/Integrations";
import "./i18n";
import { StockProvider } from "./context/StockContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { HeaderProvider } from "./context/HeaderContext";
import { attachGlobalSoundHandlers } from "./utils/soundManager";
import QrMenu from "./pages/QrMenu";
import CustomerInsights from "./pages/CustomerInsights";
import MarketingCampaigns from "./pages/MarketingCampaigns";
import MaintenanceTracker from "./pages/MaintenanceTracker";
import secureFetch from "./utils/secureFetch";
import QrMenuSettings from "./pages/QrMenuSettings";
import UserManagementPage from "./pages/UserManagementPage";
import PrintersPage from "./pages/PrintersPage";
import CamerasPage from "./pages/CamerasPage";
import TakeawayOverview from "./pages/TakeawayOverview";
import StandaloneLogin from "./pages/standalone/StandaloneLogin";
import StandaloneRegister from "./pages/standalone/StandaloneRegister";
import StandaloneApp from "./pages/standalone/StandaloneApp";
import { setNavigator } from "./utils/navigation";
import { NotificationsProvider, useNotifications } from "./context/NotificationsContext";
import { PlanModulesProvider } from "./context/PlanModulesContext";


const SETTINGS_TAB_PERMISSIONS = {
  notifications: "settings-notifications",
  users: "settings-users",
  printers: "settings-printers",
  cameras: "settings-cameras",
  shop_hours: "settings-shop-hours",
  localization: "settings-localization",
  subscription: "settings-subscription",
  payments: "settings-payments",
  register: "settings-register",
  integrations: "settings-integrations",
  inventory: "settings-inventory",
  appearance: "settings-appearance",
};

function SettingsRouteWrapper() {
  const { tabKey } = useParams();
  const normalized = tabKey ? tabKey.toLowerCase() : undefined;
  const permission = normalized ? SETTINGS_TAB_PERMISSIONS[normalized] || "settings" : "settings";
  const moduleKey =
    normalized === "users"
      ? "page.settings.users"
      : normalized === "printers"
        ? "page.settings.printers"
        : normalized === "cameras"
          ? "page.settings.cameras"
          : normalized === "integrations"
            ? "page.settings.integrations"
            : normalized === "subscription"
              ? "page.settings.subscription"
              : "page.settings";

  return (
    <ProtectedRoute permission={permission} moduleKey={moduleKey}>
      <SettingsPage />
    </ProtectedRoute>
  );
}

// ✅ choose automatically based on environment
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development"
    ? "http://localhost:5000/api"
    : "https://api.beypro.com/api");

const isAuthenticated = () => {
  try {
    return !!(localStorage.getItem("beyproUser") || sessionStorage.getItem("beyproUser"));
  } catch {
    return !!localStorage.getItem("beyproUser");
  }
};

function TablesRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (!params.get("tab")) params.set("tab", "tables");
  return <Navigate to={`/tableoverview?${params.toString()}`} replace />;
}

function TableOverviewRouteWrapper() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = String(params.get("tab") || "tables").toLowerCase();

  const permissionByTab = {
    tables: "tables",
    kitchen: "kitchen",
    history: "history",
    packet: "packet-orders",
    phone: "phone-orders",
    register: "register",
    takeaway: "takeaway",
  };

  const permission = permissionByTab[tab] || "tables";
  const moduleKeyByTab = {
    tables: "page.tables",
    kitchen: "page.kitchen",
    history: "page.history",
    packet: "page.packet_orders",
    phone: "page.phone_orders",
    register: "page.register",
    takeaway: "page.takeaway_overview",
  };
  const moduleKey = moduleKeyByTab[tab] || "page.tables";

  // Force a remount of TableOverview when the query string (tab) changes.
  // This avoids stale internal state / memoized children when header tabs
  // change location.search without unmounting TableOverview.
  return (
    <ProtectedRoute permission={permission} moduleKey={moduleKey}>
      <TableOverview key={location.search || tab} />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SessionLockProvider>
        <CurrencyProvider>
          <AppearanceProvider>
            <NotificationsProvider>
              <PlanModulesProvider>
                <AppShell />
                <SessionLockOverlay />
              </PlanModulesProvider>
            </NotificationsProvider>
          </AppearanceProvider>
        </CurrencyProvider>
      </SessionLockProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const navigate = useNavigate();
  useEffect(() => {
    setNavigator(navigate);
  }, [navigate]);
  const {
    notifications,
    unread,
    bellOpen,
    setBellOpen,
    clearAll,
    refresh,
    markAllRead,
    summaries,
    lastSeenAtMs,
  } = useNotifications();
  const location = useLocation();
  const hideBell = ["/login"].includes(location.pathname);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await secureFetch("/settings/notifications");
        window.notificationSettings = data;
      } catch (err) {
        console.warn("⚠️ Failed to load notification settings", err);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => attachGlobalSoundHandlers(), []);

  const handleBellClick = () => setBellOpen(true);
  const handleCloseModal = () => setBellOpen(false);
  const handleClearNotifications = () => clearAll();
  const handleRefreshNotifications = () => refresh();

  useEffect(() => {
    const unlock = () => {
      new Audio().play().catch(() => {});
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
    return () => window.removeEventListener("click", unlock);
  }, []);

  return (
    <div className="h-screen w-full">
      <div className="h-full w-full">
        <Routes>
            {/* STANDALONE: QR Menu + Kitchen */}
            <Route path="/standalone" element={<Navigate to="/standalone/app" replace />} />
            <Route path="/standalone-register" element={<Navigate to="/standalone/register" replace />} />
            <Route path="/standalone/login" element={<StandaloneLogin />} />
            <Route path="/standalone/register" element={<StandaloneRegister />} />
            <Route path="/standalone/app" element={<StandaloneApp />}>
              <Route index element={<Navigate to="qr-menu-settings" replace />} />
              <Route path="qr-menu-settings" element={<QrMenuSettings />} />
              <Route path="kitchen" element={<Kitchen />} />
            </Route>

            {/* PUBLIC: QR Menu (legacy slug-based link) */}
            <Route path="/qr-menu/:slug/:id" element={<QrMenu />} />
            {/* PUBLIC: Dual QR entry points */}
            <Route path="/qr" element={<QrMenu />} />
            <Route path="/menu" element={<QrMenu />} />
            {/* PUBLIC: Short restaurant link (e.g. /my-restaurant) */}
            <Route path="/:slug" element={<QrMenu />} />

            {/* PUBLIC: Login */}
            <Route
              path="/login"
              element={isAuthenticated() ? <Navigate to="/" /> : <LoginScreenWrapper />}
            />

            {/* PUBLIC: Staff PIN Login */}
            <Route
              path="/staff-login"
              element={isAuthenticated() ? <Navigate to="/" /> : <StaffPINLogin />}
            />

            {/* PROTECTED: All POS routes */}
            <Route
              path="/"
              element={
                isAuthenticated() ? (
	                  <StockProvider>
	                    <HeaderProvider>
	                      <Layout
	                        unread={unread}
	                        bellOpen={bellOpen}
	                        lowStockAlerts={notifications}
	                        onBellClick={handleBellClick}
	                        onCloseModal={handleCloseModal}
	                        hideBell={hideBell}
	                        onClearNotifications={handleClearNotifications}
                          onRefreshNotifications={handleRefreshNotifications}
                          notificationSummaries={summaries}
                          notificationsLastSeenAtMs={lastSeenAtMs}
                          onMarkAllRead={markAllRead}
	                      />
	                    </HeaderProvider>
	                  </StockProvider>
                ) : (
                  <Navigate to="/login" />
                )
              }
            >
              <Route index element={<Navigate to="/tableoverview?tab=tables" replace />} />
              <Route path="dashboard" element={<ProtectedRoute permission="dashboard" moduleKey="page.dashboard"><Dashboard /></ProtectedRoute>} />
              <Route
                path="customer-insights"
                element={<ProtectedRoute permission="dashboard" moduleKey="page.customer_insights"><CustomerInsights /></ProtectedRoute>}
              />
              <Route
                path="marketing-campaigns"
                element={<ProtectedRoute permission="dashboard" moduleKey="page.marketing_campaigns"><MarketingCampaigns /></ProtectedRoute>}
              />
              {/* ORDERS (packet/phone) */}
<Route
  path="orders"
  element={
    <ProtectedRoute permission="orders" moduleKey="page.orders">
      <Orders />
    </ProtectedRoute>
  }
/>

{/* PAYMENTS (if you have a separate payments page) */}
<Route
  path="payments"
  element={
    <ProtectedRoute permission="payments" moduleKey="page.payments">
      <TransactionScreen />
    </ProtectedRoute>
  }
/>

{/* CASH REGISTER */}
<Route
  path="cash-register"
  element={
    <ProtectedRoute permission="register" moduleKey="page.cash_register_history">
      <CashRegisterHistory />
    </ProtectedRoute>
  }
/>
              <Route path="products" element={<ProtectedRoute permission="products" moduleKey="page.products"><Products /></ProtectedRoute>} />
              <Route path="kitchen" element={<ProtectedRoute permission="kitchen" moduleKey="page.kitchen"><Kitchen /></ProtectedRoute>} />
              <Route path="suppliers" element={<ProtectedRoute permission="suppliers" moduleKey="page.suppliers"><Suppliers /></ProtectedRoute>} />
              <Route path="stock" element={<ProtectedRoute permission="stock" moduleKey="page.stock"><Stock /></ProtectedRoute>} />
              <Route path="production" element={<ProtectedRoute permission="production" moduleKey="page.production"><Production /></ProtectedRoute>} />
              <Route path="tables" element={<TablesRedirect />} />
              <Route path="tableoverview" element={<TableOverviewRouteWrapper />} />
              <Route path="transaction/:tableId" element={<TransactionScreen />} />
              <Route path="transaction/phone/:orderId" element={<TransactionScreen />} />
              <Route path="reports" element={<ProtectedRoute permission="reports" moduleKey="page.reports"><Reports /></ProtectedRoute>} />
              <Route path="staff" element={<ProtectedRoute permission="staff" moduleKey="page.staff"><Staff /></ProtectedRoute>} />
              <Route path="task" element={<ProtectedRoute permission="task" moduleKey="page.task"><Task /></ProtectedRoute>} />
              <Route path="live-route" element={<ProtectedRoute permission="delivery" moduleKey="page.delivery"><LiveRouteMap /></ProtectedRoute>} />
              <Route
  path="takeaway"
  element={<ProtectedRoute permission="takeaway" moduleKey="page.takeaway_overview"><TakeawayOverview /></ProtectedRoute>}
/>

              <Route
                path="user-management"
                element={
                  <ProtectedRoute permission="settings-users" moduleKey="page.settings.users">
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="printers"
                element={
                  <ProtectedRoute permission="settings-printers" moduleKey="page.settings.printers">
                    <PrintersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="cameras"
                element={
                  <ProtectedRoute permission="settings-cameras" moduleKey="page.settings.cameras">
                    <CamerasPage />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<SettingsRouteWrapper />} />
              <Route path="settings/:tabKey" element={<SettingsRouteWrapper />} />
              <Route path="subscription" element={<SubscriptionTab />} />
              <Route path="/expenses" element={<ProtectedRoute permission="expenses" moduleKey="page.expenses"><ExpensesPage /></ProtectedRoute>} />
              <Route path="ingredient-prices" element={<ProtectedRoute permission="ingredient-prices" moduleKey="page.ingredient_prices"><IngredientPrices /></ProtectedRoute>} />
              <Route path="cash-register-history" element={<ProtectedRoute permission="cash-register-history" moduleKey="page.cash_register_history"><CashRegisterHistory /></ProtectedRoute>} />
              <Route path="integrations" element={<ProtectedRoute permission="integrations" moduleKey="page.integrations"><IntegrationsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />

              {/* QR menu settings (still protected) */}
              <Route
                path="qr-menu-settings"
                element={<ProtectedRoute permission="qr-menu-settings" moduleKey="page.qr_menu_settings"><QrMenuSettings /></ProtectedRoute>}
              />
              <Route
                path="maintenance"
                element={<ProtectedRoute permission="dashboard" moduleKey="page.maintenance"><MaintenanceTracker /></ProtectedRoute>}
              />
              <Route path="unauthorized" element={<div className="p-10 text-red-600 text-xl">❌ Access Denied</div>} />
            </Route>
        </Routes>
      </div>
    </div>
  );
}
