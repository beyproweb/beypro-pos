// src/App.jsx

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { AuthProvider } from "./context/AuthContext";
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
import NotificationsTab from "./components/settings-tabs/NotificationsTab";
import GlobalOrderAlert from "./components/GlobalOrderAlert";
import Task from "./pages/Task";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ExpensesPage from "./components/ExpensesPage";
import CashRegisterHistory from "./pages/CashRegisterHistory";
import IntegrationsPage from "./pages/Integrations";
import "./i18n";
import { StockProvider } from "./context/StockContext";
import ProtectedRoute from "./components/ProtectedRoute";
import NotificationBell from "./components/NotificationBell";
import { HeaderProvider } from "./context/HeaderContext";
import socket from "./utils/socket";
import QrMenu from "./pages/QrMenu";
import CustomerInsights from "./pages/CustomerInsights";
import MarketingCampaigns from "./pages/MarketingCampaigns";
import MaintenanceTracker from "./pages/MaintenanceTracker";


import QrMenuSettings from "./pages/QrMenuSettings";

const isAuthenticated = () => !!localStorage.getItem("beyproUser");

export default function App() {
  const [lowStockAlerts, setLowStockAlerts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("beyproBellNotifications") || "[]");
    } catch {
      return [];
    }
  });
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);
  const location = useLocation();
  const hideBell = ["/login"].includes(location.pathname);

  useEffect(() => {
    localStorage.setItem("beyproBellNotifications", JSON.stringify(lowStockAlerts));
    setUnread(lowStockAlerts.length);
  }, [lowStockAlerts]);

  useEffect(() => {
    // Named handler for alert_event
    const handler = (payload) => {
      console.log("[BELL DEBUG] Received alert_event:", payload);
      const { message, time, type, stockId } = payload;
      const detectedType =
        type ||
        (/Stock Low:/i.test(message) ? "stock" :
          /Price (up|down|decreased|drop):?/i.test(message) ? "ingredient" : "other");
      const globalNotif = { message, time, type: detectedType, stockId };
      setLowStockAlerts((prev) => [...prev, globalNotif]);
    };

    socket.on("alert_event", handler);
    return () => socket.off("alert_event", handler);
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch("/api/settings/notifications");
        window.notificationSettings = await res.json();
      } catch (err) {
        console.warn("⚠️ Failed to load notification settings", err);
      }
    };
    loadSettings();
  }, []);

  const handleBellClick = () => { setBellOpen(true); setUnread(0); };
  const handleCloseModal = () => setBellOpen(false);
  const handleClearNotifications = () => { setLowStockAlerts([]); setUnread(0); };

  useEffect(() => {
    const unlock = () => {
      new Audio().play().catch(() => {});
      window.removeEventListener("click", unlock);
    };
    window.addEventListener("click", unlock);
    return () => window.removeEventListener("click", unlock);
  }, []);

  return (
    <AuthProvider>
      <AppearanceProvider>
        <div className="flex h-screen">
          <Routes>
            <Route
              path="/login"
              element={isAuthenticated() ? <Navigate to="/" /> : <LoginScreenWrapper />}
            />

            <Route
              path="/"
              element={
                isAuthenticated() ? (
                  <StockProvider>
                    <HeaderProvider>
                      <Layout
                        unread={unread}
                        bellOpen={bellOpen}
                        lowStockAlerts={lowStockAlerts}
                        onBellClick={handleBellClick}
                        onCloseModal={handleCloseModal}
                        hideBell={hideBell}
                        onClearNotifications={handleClearNotifications}
                      />
                    </HeaderProvider>
                  </StockProvider>
                ) : (
                  <Navigate to="/login" />
                )
              }
            >
              <Route index element={<Navigate to="/dashboard" />} />
              <Route path="dashboard" element={<ProtectedRoute permission="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route
  path="customer-insights"
  element={<ProtectedRoute permission="dashboard"><CustomerInsights /></ProtectedRoute>}
/>
<Route
  path="marketing-campaigns"
  element={<ProtectedRoute permission="dashboard"><MarketingCampaigns /></ProtectedRoute>}
/>

              <Route path="orders" element={<Navigate to="/tables?tab=packet" replace />} />
              <Route path="products" element={<ProtectedRoute permission="products"><Products /></ProtectedRoute>} />
              <Route path="kitchen" element={<ProtectedRoute permission="kitchen"><Kitchen /></ProtectedRoute>} />
              <Route path="suppliers" element={<ProtectedRoute permission="suppliers"><Suppliers /></ProtectedRoute>} />
              <Route path="stock" element={<ProtectedRoute permission="stock"><Stock /></ProtectedRoute>} />
              <Route path="production" element={<ProtectedRoute permission="production"><Production /></ProtectedRoute>} />
              <Route path="tables" element={<ProtectedRoute permission="tables"><TableOverview /></ProtectedRoute>} />
              <Route path="tableoverview" element={<ProtectedRoute permission="tables"><TableOverview /></ProtectedRoute>} />
              <Route path="transaction/:tableId" element={<TransactionScreen />} />
              <Route path="transaction/phone/:orderId" element={<TransactionScreen />} />
              <Route path="reports" element={<ProtectedRoute permission="reports"><Reports /></ProtectedRoute>} />
              <Route path="staff" element={<ProtectedRoute permission="staff"><Staff /></ProtectedRoute>} />
              <Route path="task" element={<ProtectedRoute permission="task"><Task /></ProtectedRoute>} />
              <Route path="live-route" element={<ProtectedRoute permission="delivery"><LiveRouteMap /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute permission="settings"><SettingsPage /></ProtectedRoute>} />
              <Route path="subscription" element={<SubscriptionTab />} />
              <Route path="settings/notifications" element={<ProtectedRoute permission="settings-notifications"><NotificationsTab /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute permission="expenses"><ExpensesPage /></ProtectedRoute>} />
              <Route path="/ingredient-prices" element={<ProtectedRoute permission="ingredient-prices"><IngredientPrices /></ProtectedRoute>} />
              <Route path="cash-register-history" element={<ProtectedRoute permission="cash-register-history"><CashRegisterHistory /></ProtectedRoute>} />
              <Route path="integrations" element={<ProtectedRoute permission="integrations"><IntegrationsPage /></ProtectedRoute>} />
              <Route path="/qr-menu" element={<QrMenu />} />
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

        {/* Toasts and global order alerts */}
        <ToastContainer position="bottom-center" autoClose={2000} hideProgressBar />
        <GlobalOrderAlert />
      </AppearanceProvider>
    </AuthProvider>
  );
}
