import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n'; 
import i18n from 'i18next';
import { StockProvider } from './context/StockContext';
import AppearanceProvider from './components/AppearanceProvider';
import secureFetch from "./utils/secureFetch";

secureFetch('/settings/localization')
  .then(data => {
    const raw = data?.language || null;
    const fromStorage = (() => {
      try {
        return localStorage.getItem("beyproGuestLanguage");
      } catch {
        return null;
      }
    })();

    const mapped =
      raw === "English"
        ? "en"
        : raw === "Turkish"
        ? "tr"
        : raw === "German"
        ? "de"
        : raw === "French"
        ? "fr"
        : raw;

    const lang = mapped || fromStorage || "en";
    return i18n.changeLanguage(lang);
  })
  .catch(err => {
    const fallback = (() => {
      try {
        return localStorage.getItem("beyproGuestLanguage") || "en";
      } catch {
        return "en";
      }
    })();
    i18n.changeLanguage(fallback);
    console.warn("⚠️ Could not load language, defaulting:", err);
  })
  .finally(() => {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
      <HashRouter>
  <StockProvider>
    <AppearanceProvider>
      <App />
    </AppearanceProvider>
  </StockProvider>
</HashRouter>

      </React.StrictMode>
    );
  });
