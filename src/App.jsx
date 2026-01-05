// src/App.jsx

import { Routes, Route, Navigate, useLocation, useParams, useNavigate } from "react-router-dom";
import React, { useEffect } from "react";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Kitchen from "./pages/Kitchen";
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
import { setNavigator } from "./utils/navigation";
import { NotificationsProvider, useNotifications } from "./context/NotificationsContext";


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

  return (
    <ProtectedRoute permission={permission}>
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

  // Force a remount of TableOverview when the query string (tab) changes.
  // This avoids stale internal state / memoized children when header tabs
  // change location.search without unmounting TableOverview.
  return (
    <ProtectedRoute permission={permission}>
      <TableOverview key={location.search || tab} />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <AppearanceProvider>
          <NotificationsProvider>
            <AppShell />
          </NotificationsProvider>
        </AppearanceProvider>
      </CurrencyProvider>
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
    <div className="flex h-screen">
      <Routes>
            {/* PUBLIC: QR Menu (legacy slug-based link) */}
            <Route path="/qr-menu/:slug/:id" element={<QrMenu />} />
            {/* PUBLIC: Dual QR entry points */}
            <Route path="/qr" element={<QrMenu />} />
            <Route path="/menu" element={<QrMenu />} />

            {/* PUBLIC: Login */}
            <Route
              path="/login"
              element={isAuthenticated() ? <Navigate to="/" /> : <LoginScreenWrapper />}
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
              <Route path="dashboard" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route
                path="customer-insights"
                element={<ProtectedRoute permission="dashboard"><CustomerInsights /></ProtectedRoute>}
              />
              <Route
                path="marketing-campaigns"
                element={<ProtectedRoute permission="dashboard"><MarketingCampaigns /></ProtectedRoute>}
              />
              {/* ORDERS (packet/phone) */}
<Route
  path="orders"
  element={
    <ProtectedRoute permission="orders">
      <Orders />
    </ProtectedRoute>
  }
/>

{/* PAYMENTS (if you have a separate payments page) */}
<Route
  path="payments"
  element={
    <ProtectedRoute permission="payments">
      <TransactionScreen />
    </ProtectedRoute>
  }
/>

{/* CASH REGISTER */}
<Route
  path="cash-register"
  element={
    <ProtectedRoute permission="register">
      <CashRegisterHistory />
    </ProtectedRoute>
  }
/>
              <Route path="products" element={<ProtectedRoute permission="products"><Products /></ProtectedRoute>} />
              <Route path="kitchen" element={<ProtectedRoute permission="kitchen"><Kitchen /></ProtectedRoute>} />
              <Route path="suppliers" element={<ProtectedRoute permission="suppliers"><Suppliers /></ProtectedRoute>} />
              <Route path="stock" element={<ProtectedRoute permission="stock"><Stock /></ProtectedRoute>} />
              <Route path="production" element={<ProtectedRoute permission="production"><Production /></ProtectedRoute>} />
              <Route path="tables" element={<TablesRedirect />} />
              <Route path="tableoverview" element={<TableOverviewRouteWrapper />} />
              <Route path="transaction/:tableId" element={<TransactionScreen />} />
              <Route path="transaction/phone/:orderId" element={<TransactionScreen />} />
              <Route path="reports" element={<ProtectedRoute permission="reports"><Reports /></ProtectedRoute>} />
              <Route path="staff" element={<ProtectedRoute permission="staff"><Staff /></ProtectedRoute>} />
              <Route path="task" element={<ProtectedRoute permission="task"><Task /></ProtectedRoute>} />
              <Route path="live-route" element={<ProtectedRoute permission="delivery"><LiveRouteMap /></ProtectedRoute>} />
              <Route
  path="takeaway"
  element={<ProtectedRoute permission="takeaway"><TakeawayOverview /></ProtectedRoute>}
/>

              <Route
                path="user-management"
                element={
                  <ProtectedRoute permission="settings-users">
                    <UserManagementPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="printers"
                element={
                  <ProtectedRoute permission="settings-printers">
                    <PrintersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="cameras"
                element={
                  <ProtectedRoute permission="settings-cameras">
                    <CamerasPage />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<SettingsRouteWrapper />} />
              <Route path="settings/:tabKey" element={<SettingsRouteWrapper />} />
              <Route path="subscription" element={<SubscriptionTab />} />
              <Route path="/expenses" element={<ProtectedRoute permission="expenses"><ExpensesPage /></ProtectedRoute>} />
              <Route path="ingredient-prices" element={<ProtectedRoute permission="ingredient-prices"><IngredientPrices /></ProtectedRoute>} />
              <Route path="cash-register-history" element={<ProtectedRoute permission="cash-register-history"><CashRegisterHistory /></ProtectedRoute>} />
              <Route path="integrations" element={<ProtectedRoute permission="integrations"><IntegrationsPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />

              {/* QR menu settings (still protected) */}
              <Route
                path="qr-menu-settings"
                element={<ProtectedRoute permission="settings"><QrMenuSettings /></ProtectedRoute>}
              />
              <Route
                path="maintenance"
                element={<ProtectedRoute permission="dashboard"><MaintenanceTracker /></ProtectedRoute>}
              />
              <Route path="unauthorized" element={<div className="p-10 text-red-600 text-xl">❌ Access Denied</div>} />
            </Route>
      </Routes>
    </div>
  );
}
